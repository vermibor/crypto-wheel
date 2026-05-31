"""
State manager for isolated strategy accounting.

Each strategy instance gets its own JSON state file under state/<strategy_id>.json.
This allows multiple strategies to share a single Deribit account while tracking
their own budget, positions, and PnL independently.
"""

import json
import os
import logging
from datetime import datetime, timezone
from copy import deepcopy

logger = logging.getLogger(__name__)

STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state")


def _state_path(strategy_id: str) -> str:
    return os.path.join(STATE_DIR, f"{strategy_id}.json")


def get_state_keys(settlement: str) -> tuple[str, str, str]:
    if settlement == "BTC":
        return "cash_btc", "initial_budget_btc", "high_water_mark_btc"
    return "cash_usdc", "initial_budget_usdc", "high_water_mark_usdc"


def _default_state(strategy_id: str, initial_budget: float, settlement: str = "BTC") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    cash_key, budget_key, hwm_key = get_state_keys(settlement)
    return {
        "strategy_id": strategy_id,
        budget_key: initial_budget,
        cash_key: initial_budget,
        hwm_key: initial_budget,
        "phase": "selling_puts",  # selling_puts | holding_long | selling_calls
        "active_option": None,    # Current short option position
        "active_future": None,    # Current long future (simulated assignment)
        "trades": [],             # Full trade log
        "created_at": now,
        "updated_at": now,
    }


def load_state(strategy_id: str, initial_budget: float, settlement: str = "BTC") -> dict:
    """Load or initialize state for a strategy."""
    os.makedirs(STATE_DIR, exist_ok=True)
    path = _state_path(strategy_id)

    cash_key, budget_key, hwm_key = get_state_keys(settlement)

    if os.path.exists(path):
        with open(path, "r") as f:
            state = json.load(f)
        
        # Re-initialize state if the settlement currency has changed (e.g. from USDC to BTC)
        if cash_key not in state:
            logger.info("Settlement changed to %s. Re-initializing state for '%s'.", settlement, strategy_id)
            state = _default_state(strategy_id, initial_budget, settlement)
            save_state(state)
        else:
            logger.info("Loaded state for '%s' (cash=%.4f, phase=%s)",
                         strategy_id, state[cash_key], state["phase"])
        return state

    state = _default_state(strategy_id, initial_budget, settlement)
    save_state(state)
    logger.info("Initialized new state for '%s' (budget=%.4f)",
                strategy_id, initial_budget)
    return state


def save_state(state: dict) -> None:
    """Persist state to disk."""
    os.makedirs(STATE_DIR, exist_ok=True)
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    path = _state_path(state["strategy_id"])
    with open(path, "w") as f:
        json.dump(state, f, indent=2, default=str)
    logger.debug("Saved state for '%s'", state["strategy_id"])


def record_trade(state: dict, trade: dict, settlement: str = "BTC") -> dict:
    """Append a trade record and update cash.

    Args:
        state: Current strategy state dict.
        trade: Dict with keys: action, symbol, amount, price, premium,
               pnl, timestamp, notes.
        settlement: Settlement currency (USDC or BTC).

    Returns:
        Updated state dict.
    """
    state = deepcopy(state)
    state["trades"].append(trade)

    cash_key, budget_key, hwm_key = get_state_keys(settlement)

    # Update cash based on premium flow or realized PnL
    # To avoid double-counting on option closure, we only apply premium if present,
    # and fallback to pnl (like assignment) if premium is None.
    if "premium" in trade and trade["premium"] is not None:
        state[cash_key] += trade["premium"]
    elif "pnl" in trade and trade["pnl"] is not None:
        state[cash_key] += trade["pnl"]

    # Update high water mark
    equity = compute_equity(state, trade.get("btc_price", 0), settlement)
    if equity > state[hwm_key]:
        state[hwm_key] = equity

    save_state(state)
    return state


def compute_equity(state: dict, btc_price: float, settlement: str = "BTC") -> float:
    """Compute total equity = cash + unrealized PnL on open positions."""
    cash_key, _, _ = get_state_keys(settlement)
    equity = state[cash_key]

    if settlement == "BTC":
        # In a BTC-denominated account, cash is already in BTC.
        # We simplify option unrealized PnL by realizing it on expiry/close.
        # No futures positions are opened under BTC settlement.
        pass
    else:
        # In a USDC-denominated account, we track the unrealized PnL of the simulated future.
        if state["active_future"]:
            entry = state["active_future"]["entry_price"]
            size = state["active_future"]["size_btc"]
            unrealized = (btc_price - entry) * size
            equity += unrealized

    return equity


def get_drawdown_pct(state: dict, btc_price: float, settlement: str = "BTC") -> float:
    """Compute current drawdown from high water mark as a percentage."""
    cash_key, budget_key, hwm_key = get_state_keys(settlement)
    equity = compute_equity(state, btc_price, settlement)
    hwm = state[hwm_key]
    if hwm <= 0:
        return 0.0
    return ((hwm - equity) / hwm) * 100


def set_phase(state: dict, phase: str) -> dict:
    """Update the current wheel phase."""
    state = deepcopy(state)
    state["phase"] = phase
    save_state(state)
    logger.info("Strategy '%s' phase -> %s", state["strategy_id"], phase)
    return state
