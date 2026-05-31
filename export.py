"""
CSV export module.

Generates per-strategy CSV reports tracking:
  - Full trade log
  - Cash flow timeline
  - Summary statistics
"""

import os
import csv
import logging
from datetime import datetime, timezone

from state_manager import load_state, compute_equity, get_drawdown_pct

logger = logging.getLogger(__name__)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")


def export_trades_csv(state: dict) -> str:
    """Export the full trade log to CSV.

    Returns:
        Path to the generated CSV file.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, f"{state['strategy_id']}_trades.csv")

    fieldnames = [
        "timestamp", "action", "symbol", "strike", "delta", "dte",
        "amount_btc", "premium", "pnl", "btc_price", "order_id", "notes",
    ]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for trade in state["trades"]:
            writer.writerow(trade)

    logger.info("Exported %d trades to %s", len(state["trades"]), path)
    return path


def export_cashflow_csv(state: dict, btc_price: float) -> str:
    """Export a cash flow timeline from the trade log.

    Each row shows the running cash balance after each trade.

    Returns:
        Path to the generated CSV file.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, f"{state['strategy_id']}_cashflow.csv")

    fieldnames = [
        "timestamp", "action", "premium", "pnl",
        "cash_after", "equity_estimate", "notes",
    ]

    settlement = "BTC" if "cash_btc" in state else "USDC"
    from state_manager import get_state_keys
    cash_key, budget_key, hwm_key = get_state_keys(settlement)

    running_cash = state[budget_key]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()

        for trade in state["trades"]:
            if trade.get("premium") is not None:
                running_cash += trade["premium"]
            elif trade.get("pnl") is not None:
                running_cash += trade["pnl"]

            precision = 4 if settlement == "BTC" else 2
            row = {
                "timestamp": trade["timestamp"],
                "action": trade["action"],
                "premium": trade.get("premium", 0),
                "pnl": trade.get("pnl", 0),
                "cash_after": round(running_cash, precision),
                "equity_estimate": "",  # Snapshot not available historically
                "notes": trade.get("notes", ""),
            }
            writer.writerow(row)

    logger.info("Exported cash flow to %s", path)
    return path


def export_summary_csv(states: list[dict], btc_price: float) -> str:
    """Export a summary comparison across all strategies.

    Args:
        states: List of state dicts for each strategy.
        btc_price: Current BTC price for equity computation.

    Returns:
        Path to the generated CSV file.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "summary.csv")

    fieldnames = [
        "strategy_id", "initial_budget", "current_cash", "equity",
        "total_return_pct", "drawdown_pct", "high_water_mark",
        "total_trades", "puts_sold", "calls_sold",
        "assignments", "options_expired_otm",
        "total_premium_collected", "total_realized_pnl",
        "phase", "active_option", "active_future",
        "win_rate_pct",
    ]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for state in states:
            settlement = "BTC" if "cash_btc" in state else "USDC"
            from state_manager import get_state_keys
            cash_key, budget_key, hwm_key = get_state_keys(settlement)

            trades = state["trades"]
            equity = compute_equity(state, btc_price, settlement)
            dd = get_drawdown_pct(state, btc_price, settlement)
            initial = state[budget_key]
            total_return = ((equity - initial) / initial * 100) if initial else 0

            puts_sold = sum(1 for t in trades if t["action"] == "sell_put")
            calls_sold = sum(1 for t in trades if t["action"] == "sell_call")
            assignments = sum(
                1 for t in trades
                if t["action"] in ("put_assigned", "call_assigned")
            )
            expired_otm = sum(
                1 for t in trades
                if t["action"] in ("put_expired_otm", "call_expired_otm")
            )

            total_premium = sum(
                t.get("premium", 0) or 0 for t in trades
            )
            total_pnl = sum(
                t.get("pnl", 0) or 0 for t in trades
            )

            # Win rate: closed trades with net positive outcome
            closed_trades = [
                t for t in trades
                if t["action"] in (
                    "put_expired_otm", "call_expired_otm",
                    "put_closed_tp", "call_closed_tp",
                    "put_closed_sl", "call_closed_sl",
                    "put_assigned", "call_assigned",
                )
            ]
            wins = sum(
                1 for t in closed_trades
                if (t.get("pnl") or 0) >= 0
            )
            win_rate = (wins / len(closed_trades) * 100) if closed_trades else 0

            precision = 4 if settlement == "BTC" else 2

            row = {
                "strategy_id": state["strategy_id"],
                "initial_budget": initial,
                "current_cash": round(state[cash_key], precision),
                "equity": round(equity, precision),
                "total_return_pct": round(total_return, 2),
                "drawdown_pct": round(dd, 2),
                "high_water_mark": round(state[hwm_key], precision),
                "total_trades": len(trades),
                "puts_sold": puts_sold,
                "calls_sold": calls_sold,
                "assignments": assignments,
                "options_expired_otm": expired_otm,
                "total_premium_collected": round(total_premium, precision),
                "total_realized_pnl": round(total_pnl, precision),
                "phase": state["phase"],
                "active_option": state["active_option"]["symbol"]
                    if state["active_option"] else "none",
                "active_future": "yes" if state["active_future"] else "no",
                "win_rate_pct": round(win_rate, 1),
            }
            writer.writerow(row)

    logger.info("Exported summary to %s", path)
    return path
