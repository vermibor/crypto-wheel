"""
Wheel Strategy Engine.

Implements the full wheel cycle:
  1. Sell Cash-Secured Puts (CSP)
  2. On assignment (ITM at expiry) -> buy BTC future to simulate holding
  3. Sell Covered Calls against the long future
  4. On call assignment (ITM at expiry) -> close future, collect profit, restart

Includes risk filters: SMA trend filter, max drawdown pause, optional DVOL floor.
"""

import logging
from datetime import datetime, timezone, timedelta
from deribit_client import DeribitClient
from state_manager import (
    load_state, save_state, record_trade, compute_equity,
    get_drawdown_pct, set_phase,
)

logger = logging.getLogger(__name__)


# ======================================================================
# Helpers
# ======================================================================

def _compute_sma(ohlcv: list, period: int) -> float | None:
    """Compute SMA of close prices from OHLCV data."""
    if len(ohlcv) < period:
        return None
    closes = [candle[4] for candle in ohlcv[-period:]]
    return sum(closes) / period


def _days_to_expiry(expiry_ts_ms: int) -> float:
    """Convert expiry timestamp (ms) to days remaining."""
    now = datetime.now(timezone.utc)
    exp = datetime.fromtimestamp(expiry_ts_ms / 1000, tz=timezone.utc)
    return (exp - now).total_seconds() / 86400


def _select_best_option(
    chain: list[dict],
    option_type: str,
    delta_target: float,
    dte_min: int,
    dte_max: int,
) -> dict | None:
    """Select the option closest to the target delta within the DTE range.

    Args:
        chain: Options chain from DeribitClient.
        option_type: 'put' or 'call'.
        delta_target: Absolute delta target (e.g. 0.25).
        dte_min: Minimum days to expiry.
        dte_max: Maximum days to expiry.

    Returns:
        Best matching option dict or None.
    """
    candidates = []
    for opt in chain:
        if opt["option_type"] != option_type:
            continue
        if opt["expiry"] is None:
            continue

        dte = _days_to_expiry(opt["expiry"])
        if dte < dte_min or dte > dte_max:
            continue

        # For puts, delta is negative; compare absolute values
        abs_delta = abs(opt["delta"])
        if abs_delta < 0.01:
            continue  # Skip deep OTM with near-zero delta

        distance = abs(abs_delta - delta_target)
        candidates.append((distance, dte, opt))

    if not candidates:
        return None

    # Sort by delta distance first, then prefer shorter DTE
    candidates.sort(key=lambda x: (x[0], x[1]))
    return candidates[0][2]


# ======================================================================
# Risk Checks
# ======================================================================

def check_risk_filters(
    client: DeribitClient,
    state: dict,
    config: dict,
    global_config: dict,
) -> tuple[bool, str]:
    """Run all risk filters. Returns (is_safe, reason)."""
    btc_price = client.get_btc_price()

    # 1. Max drawdown check
    max_dd = global_config.get("max_drawdown_pct", 30)
    current_dd = get_drawdown_pct(state, btc_price, client.settlement)
    if current_dd >= max_dd:
        return False, (
            f"Drawdown {current_dd:.1f}% exceeds max {max_dd}%. "
            "Pausing new positions."
        )

    # 2. SMA trend filter
    if global_config.get("trend_filter_enabled", True):
        period = global_config.get("trend_filter_sma_period", 50)
        ohlcv = client.get_btc_ohlcv(timeframe="1d", limit=period + 10)
        sma = _compute_sma(ohlcv, period)
        if sma is not None and btc_price < sma:
            return False, (
                f"BTC {btc_price:.0f} < SMA{period} {sma:.0f}. "
                "Trend filter blocks new puts."
            )

    # 3. DVOL floor (optional)
    dvol_min = global_config.get("dvol_min_threshold")
    if dvol_min is not None:
        dvol = client.get_dvol()
        if dvol is not None and dvol < dvol_min:
            return False, (
                f"DVOL {dvol:.1f} < min threshold {dvol_min}. "
                "Insufficient implied volatility."
            )

    return True, "All risk checks passed."


# ======================================================================
# Core Strategy Actions
# ======================================================================

def _action_sell_put(
    client: DeribitClient,
    state: dict,
    config: dict,
    btc_price: float,
) -> dict:
    """Sell a cash-secured put."""
    chain = client.get_option_chain()
    option = _select_best_option(
        chain,
        option_type="put",
        delta_target=config["put_delta_target"],
        dte_min=config["dte_min"],
        dte_max=config["dte_max"],
    )

    if option is None:
        logger.warning("[%s] No suitable put found.", config["id"])
        return state

    size = 0.1  # Fixed 0.1 BTC
    symbol = option["symbol"]

    # Check if we have enough cash to cover assignment
    from state_manager import get_state_keys
    cash_key, _, _ = get_state_keys(client.settlement)
    
    if client.settlement == "BTC":
        if state[cash_key] < size * 0.1:
            logger.warning(
                "[%s] Insufficient BTC budget (%.4f) for margin.",
                config["id"], state[cash_key],
            )
            return state
    else:
        if state[cash_key] < option["strike"] * size * 0.3:
            logger.warning(
                "[%s] Insufficient budget (%.2f) for collateral.",
                config["id"], state[cash_key],
            )
            return state

    logger.info(
        "[%s] Selling PUT %s | strike=%.0f delta=%.3f dte=%.1f",
        config["id"], symbol, option["strike"], option["delta"],
        _days_to_expiry(option["expiry"]),
    )

    order = client.sell_option(symbol, size)

    premium_per_btc = float(order.get("average", 0) or order.get("price", 0))
    premium_value = premium_per_btc * size

    trade = {
        "action": "sell_put",
        "symbol": symbol,
        "strike": option["strike"],
        "delta": option["delta"],
        "dte": round(_days_to_expiry(option["expiry"]), 1),
        "amount_btc": size,
        "premium": premium_value,
        "pnl": None,
        "btc_price": btc_price,
        "order_id": order.get("id"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": "Opened CSP",
    }

    state = record_trade(state, trade, client.settlement)
    state["active_option"] = {
        "symbol": symbol,
        "strike": option["strike"],
        "expiry": option["expiry"],
        "option_type": "put",
        "size_btc": size,
        "entry_premium": premium_value,
        "entry_price": premium_per_btc,
    }
    save_state(state)
    return state


def _action_sell_call(
    client: DeribitClient,
    state: dict,
    config: dict,
    btc_price: float,
) -> dict:
    """Sell a covered call against the long future position (USDC) or BTC cash (BTC)."""
    chain = client.get_option_chain()
    option = _select_best_option(
        chain,
        option_type="call",
        delta_target=config["call_delta_target"],
        dte_min=config["dte_min"],
        dte_max=config["dte_max"],
    )

    if option is None:
        logger.warning("[%s] No suitable call found.", config["id"])
        return state

    if client.settlement == "BTC":
        size = 0.1
    else:
        size = state["active_future"]["size_btc"]
        
    symbol = option["symbol"]

    logger.info(
        "[%s] Selling CALL %s | strike=%.0f delta=%.3f dte=%.1f",
        config["id"], symbol, option["strike"], option["delta"],
        _days_to_expiry(option["expiry"]),
    )

    order = client.sell_option(symbol, size)
    premium_per_btc = float(order.get("average", 0) or order.get("price", 0))
    premium_value = premium_per_btc * size

    trade = {
        "action": "sell_call",
        "symbol": symbol,
        "strike": option["strike"],
        "delta": option["delta"],
        "dte": round(_days_to_expiry(option["expiry"]), 1),
        "amount_btc": size,
        "premium": premium_value,
        "pnl": None,
        "btc_price": btc_price,
        "order_id": order.get("id"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": "Opened covered call",
    }

    state = record_trade(state, trade, client.settlement)
    state["active_option"] = {
        "symbol": symbol,
        "strike": option["strike"],
        "expiry": option["expiry"],
        "option_type": "call",
        "size_btc": size,
        "entry_premium": premium_value,
        "entry_price": premium_per_btc,
    }
    save_state(state)
    return state


def _check_option_expiry(
    client: DeribitClient,
    state: dict,
    btc_price: float,
) -> dict:
    """Check if the active option has expired and handle assignment."""
    opt = state["active_option"]
    if opt is None:
        return state

    dte = _days_to_expiry(opt["expiry"])
    if dte > 0:
        return state  # Not yet expired

    strike = opt["strike"]
    size = opt["size_btc"]
    option_type = opt["option_type"]

    if option_type == "put":
        if btc_price <= strike:
            logger.info(
                "[%s] PUT ASSIGNED: BTC %.0f <= strike %.0f.",
                state["strategy_id"], btc_price, strike,
            )
            
            if client.settlement == "BTC":
                # Inverse put: settlement in BTC
                assignment_cost = ((strike - btc_price) / btc_price) * size
                trade = {
                    "action": "put_assigned",
                    "symbol": opt["symbol"],
                    "strike": strike,
                    "amount_btc": size,
                    "premium": None,
                    "pnl": -assignment_cost,
                    "btc_price": btc_price,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "notes": f"Put assigned. Paid {assignment_cost:.4f} BTC settlement.",
                }
                state = record_trade(state, trade, client.settlement)
                state["active_option"] = None
                state = set_phase(state, "selling_calls")
            else:
                # USDC-settled: buy future
                order = client.buy_future(size)
                entry_price = float(
                    order.get("average", 0) or order.get("price", 0)
                )
                assignment_cost = (strike - btc_price) * size
                trade = {
                    "action": "put_assigned",
                    "symbol": opt["symbol"],
                    "strike": strike,
                    "amount_btc": size,
                    "premium": None,
                    "pnl": -assignment_cost,
                    "btc_price": btc_price,
                    "order_id": order.get("id"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "notes": f"Put assigned. Bought future at {entry_price:.0f}",
                }
                state = record_trade(state, trade, client.settlement)
                state["active_option"] = None
                state["active_future"] = {
                    "symbol": "BTC/USDC:USDC",
                    "entry_price": entry_price,
                    "size_btc": size,
                }
                state = set_phase(state, "selling_calls")
        else:
            logger.info(
                "[%s] PUT EXPIRED OTM: BTC %.0f > strike %.0f. "
                "Premium kept.",
                state["strategy_id"], btc_price, strike,
            )
            trade = {
                "action": "put_expired_otm",
                "symbol": opt["symbol"],
                "strike": strike,
                "amount_btc": size,
                "premium": None,
                "pnl": 0,
                "btc_price": btc_price,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "notes": "Put expired worthless. Premium retained.",
            }
            state = record_trade(state, trade, client.settlement)
            state["active_option"] = None
            state = set_phase(state, "selling_puts")

    elif option_type == "call":
        if btc_price >= strike:
            logger.info(
                "[%s] CALL ASSIGNED: BTC %.0f >= strike %.0f.",
                state["strategy_id"], btc_price, strike,
            )
            
            if client.settlement == "BTC":
                # Inverse call: settlement in BTC
                assignment_cost = ((btc_price - strike) / btc_price) * size
                trade = {
                    "action": "call_assigned",
                    "symbol": opt["symbol"],
                    "strike": strike,
                    "amount_btc": size,
                    "premium": None,
                    "pnl": -assignment_cost,
                    "btc_price": btc_price,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "notes": f"Call assigned. Paid {assignment_cost:.4f} BTC settlement.",
                }
                state = record_trade(state, trade, client.settlement)
                state["active_option"] = None
                state = set_phase(state, "selling_puts")
            else:
                # USDC-settled: close future
                future_entry = state["active_future"]["entry_price"]
                order = client.sell_future(size)
                future_pnl = (strike - future_entry) * size
                trade = {
                    "action": "call_assigned",
                    "symbol": opt["symbol"],
                    "strike": strike,
                    "amount_btc": size,
                    "premium": None,
                    "pnl": future_pnl,
                    "btc_price": btc_price,
                    "order_id": order.get("id"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "notes": f"Call assigned. Closed future. PnL: {future_pnl:.2f} USDC",
                }
                state = record_trade(state, trade, client.settlement)
                state["active_option"] = None
                state["active_future"] = None
                state = set_phase(state, "selling_puts")
        else:
            logger.info(
                "[%s] CALL EXPIRED OTM: BTC %.0f < strike %.0f. "
                "Premium kept.",
                state["strategy_id"], btc_price, strike,
            )
            trade = {
                "action": "call_expired_otm",
                "symbol": opt["symbol"],
                "strike": strike,
                "amount_btc": size,
                "premium": None,
                "pnl": 0,
                "btc_price": btc_price,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "notes": "Call expired worthless. Premium retained.",
            }
            state = record_trade(state, trade, client.settlement)
            state["active_option"] = None

    save_state(state)
    return state


def _check_take_profit(
    client: DeribitClient,
    state: dict,
    config: dict,
    btc_price: float,
) -> dict:
    """Check if the active option hit the take-profit threshold."""
    opt = state["active_option"]
    if opt is None:
        return state

    if opt["option_type"] == "put":
        tp_pct = config.get("put_take_profit_pct", config.get("take_profit_pct"))
    else:
        tp_pct = config.get("call_take_profit_pct", config.get("take_profit_pct"))

    if tp_pct is None:
        return state

    try:
        ticker = client.exchange.fetch_ticker(opt["symbol"])
        info = ticker.get("info", {})
        current_price = float(info.get("mark_price") or ticker.get("last") or 0)
    except Exception as e:
        logger.warning("Could not fetch option price for TP check: %s", e)
        return state

    entry_price = opt["entry_price"]
    if entry_price <= 0 or current_price <= 0:
        return state

    profit_pct = ((entry_price - current_price) / entry_price) * 100

    if profit_pct >= tp_pct:
        logger.info(
            "[%s] TAKE PROFIT triggered at %.1f%% (target: %.0f%%)",
            state["strategy_id"], profit_pct, tp_pct,
        )
        size = opt["size_btc"]
        order = client.buy_option(opt["symbol"], size)
        close_price = float(
            order.get("average", 0) or order.get("price", 0)
        )
        realized_pnl = (entry_price - close_price) * size

        trade = {
            "action": f"{opt['option_type']}_closed_tp",
            "symbol": opt["symbol"],
            "strike": opt["strike"],
            "amount_btc": size,
            "premium": -(close_price * size),
            "pnl": realized_pnl,
            "btc_price": btc_price,
            "order_id": order.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": f"Take profit at {profit_pct:.1f}%",
        }
        state = record_trade(state, trade, client.settlement)
        state["active_option"] = None

        if client.settlement == "BTC":
            if state["phase"] == "selling_calls":
                state = set_phase(state, "selling_calls")
            else:
                state = set_phase(state, "selling_puts")
        else:
            if state["active_future"]:
                state = set_phase(state, "selling_calls")
            else:
                state = set_phase(state, "selling_puts")

    return state


def _check_stop_loss(
    client: DeribitClient,
    state: dict,
    config: dict,
    btc_price: float,
) -> dict:
    """Check if the active option hit the stop-loss threshold."""
    opt = state["active_option"]
    if opt is None:
        return state

    if opt["option_type"] == "put":
        sl_pct = config.get("put_stop_loss_pct", config.get("stop_loss_pct"))
    else:
        sl_pct = config.get("call_stop_loss_pct", config.get("stop_loss_pct"))

    if sl_pct is None:
        return state

    try:
        ticker = client.exchange.fetch_ticker(opt["symbol"])
        info = ticker.get("info", {})
        current_price = float(info.get("mark_price") or ticker.get("last") or 0)
    except Exception as e:
        logger.warning("Could not fetch option price for SL check: %s", e)
        return state

    entry_price = opt["entry_price"]
    if entry_price <= 0 or current_price <= 0:
        return state

    loss_pct = ((current_price - entry_price) / entry_price) * 100

    if loss_pct >= sl_pct:
        logger.info(
            "[%s] STOP LOSS triggered at %.1f%% (limit: %.0f%%)",
            state["strategy_id"], loss_pct, sl_pct,
        )
        size = opt["size_btc"]
        order = client.buy_option(opt["symbol"], size)
        close_price = float(
            order.get("average", 0) or order.get("price", 0)
        )
        realized_pnl = (entry_price - close_price) * size

        trade = {
            "action": f"{opt['option_type']}_closed_sl",
            "symbol": opt["symbol"],
            "strike": opt["strike"],
            "amount_btc": size,
            "premium": -(close_price * size),
            "pnl": realized_pnl,
            "btc_price": btc_price,
            "order_id": order.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": f"Stop loss at {loss_pct:.1f}%",
        }
        state = record_trade(state, trade, client.settlement)
        state["active_option"] = None

        if client.settlement == "BTC":
            if state["phase"] == "selling_calls":
                state = set_phase(state, "selling_calls")
            else:
                state = set_phase(state, "selling_puts")
        else:
            if state["active_future"]:
                state = set_phase(state, "selling_calls")
            else:
                state = set_phase(state, "selling_puts")

    return state


# ======================================================================
# Main Entry Point
# ======================================================================

def run_strategy(client: DeribitClient, config: dict, global_config: dict) -> dict:
    """Execute one daily cycle of the wheel strategy for a given config.

    Args:
        client: Initialized DeribitClient.
        config: Strategy-specific config dict.
        global_config: Global settings dict.

    Returns:
        Updated state dict.
    """
    strategy_id = config["id"]
    settlement = global_config.get("settlement", "BTC")
    
    logger.info("=" * 60)
    logger.info("Running strategy: %s (%s) | Settlement: %s", strategy_id, config["description"], settlement)
    logger.info("=" * 60)

    budget_key = "initial_budget_btc" if settlement == "BTC" else "initial_budget_usdc"
    default_budget = 0.5 if settlement == "BTC" else 10000.0
    initial_budget = config.get(budget_key, config.get("initial_budget_usdc", default_budget))

    state = load_state(strategy_id, initial_budget, settlement)
    btc_price = client.get_btc_price()

    from state_manager import get_state_keys
    cash_key, _, _ = get_state_keys(settlement)

    logger.info(
        "[%s] BTC=%.0f | Cash=%.4f | Phase=%s | Equity=%.4f",
        strategy_id, btc_price, state[cash_key],
        state["phase"], compute_equity(state, btc_price, settlement),
    )

    # Step 1: Check if active option has expired
    state = _check_option_expiry(client, state, btc_price)

    # Step 2: If we have an active option, check TP / SL
    if state["active_option"]:
        state = _check_take_profit(client, state, config, btc_price)
    if state["active_option"]:
        state = _check_stop_loss(client, state, config, btc_price)

    # Step 3: If no active option, try to open a new one (with risk checks)
    if state["active_option"] is None:
        is_safe, reason = check_risk_filters(
            client, state, config, global_config
        )
        logger.info("[%s] Risk check: %s", strategy_id, reason)

        if is_safe:
            if state["phase"] == "selling_puts":
                state = _action_sell_put(client, state, config, btc_price)
            elif state["phase"] in ("selling_calls", "holding_long"):
                if settlement == "BTC" or state["active_future"]:
                    state = _action_sell_call(
                        client, state, config, btc_price
                    )
                else:
                    # No future but in call phase — reset to puts
                    logger.warning(
                        "[%s] In call phase but no future. Resetting to puts.",
                        strategy_id,
                    )
                    state = set_phase(state, "selling_puts")

    # Final equity snapshot
    equity = compute_equity(state, btc_price, settlement)
    dd = get_drawdown_pct(state, btc_price, settlement)
    logger.info(
        "[%s] END: Equity=%.4f | Cash=%.4f | DD=%.1f%% | Trades=%d",
        strategy_id, equity, state[cash_key], dd, len(state["trades"]),
    )

    return state
