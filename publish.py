#!/usr/bin/env python3
"""
Data pipeline for the crypto-wheel trading bot dashboard.

Reads local state, output CSVs, config, and logs, then computes derived
risk metrics, HODL benchmark, portfolio aggregate, and log summaries.
Outputs docs/data/dashboard.json and optionally commits + pushes via git.

Usage:
    python publish.py              # Generate JSON + git commit/push
    python publish.py --dry-run    # Generate JSON only, skip git
"""

import argparse
import csv
import json
import logging
import math
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package is required. Install via: pip install requests>=2.31.0", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths — all relative to this script's location
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_DIR = os.path.join(BASE_DIR, "state")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
LOG_DIR = os.path.join(BASE_DIR, "logs")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
DASHBOARD_DIR = os.path.join(BASE_DIR, "docs", "data")
DASHBOARD_PATH = os.path.join(DASHBOARD_DIR, "dashboard.json")
COINGECKO_CACHE = os.path.join(BASE_DIR, "docs", "data", ".btc_price_cache.json")

logger = logging.getLogger("publish")


# ===========================================================================
# Data loading
# ===========================================================================

def load_config() -> dict:
    """Load config.json."""
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def load_states() -> list[dict]:
    """Load all strategy state JSONs from state/."""
    states = []
    if not os.path.isdir(STATE_DIR):
        logger.warning("State directory not found: %s", STATE_DIR)
        return states
    for fname in sorted(os.listdir(STATE_DIR)):
        if fname.endswith(".json"):
            path = os.path.join(STATE_DIR, fname)
            with open(path, "r") as f:
                states.append(json.load(f))
    return states


def load_csv_rows(path: str) -> list[dict]:
    """Load a CSV file as a list of dicts. Returns [] if file missing or empty."""
    if not os.path.isfile(path):
        return []
    with open(path, "r", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def get_settlement(config: dict) -> str:
    return config.get("global", {}).get("settlement", "BTC")


def get_state_keys(settlement: str) -> tuple:
    if settlement == "BTC":
        return "cash_btc", "initial_budget_btc", "high_water_mark_btc"
    return "cash_usdc", "initial_budget_usdc", "high_water_mark_usdc"


# ===========================================================================
# BTC price from CoinGecko
# ===========================================================================

def fetch_btc_prices(days: int = 90) -> list[dict] | None:
    """Fetch BTC/USD daily prices from CoinGecko.

    Returns list of {"date": "YYYY-MM-DD", "price": float} or None on failure.
    Uses a file-based cache as fallback.
    """
    url = f"https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days={days}"
    data = None

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        raw = resp.json()
        prices_raw = raw.get("prices", [])  # [[timestamp_ms, price], ...]

        # Deduplicate to one entry per calendar day
        seen_dates = {}
        for ts_ms, price in prices_raw:
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            day_str = dt.strftime("%Y-%m-%d")
            seen_dates[day_str] = round(price, 2)

        data = [{"date": d, "price": p} for d, p in sorted(seen_dates.items())]

        # Cache for offline fallback
        os.makedirs(os.path.dirname(COINGECKO_CACHE), exist_ok=True)
        with open(COINGECKO_CACHE, "w") as f:
            json.dump(data, f)
        logger.info("Fetched %d daily BTC prices from CoinGecko", len(data))

    except Exception as e:
        logger.warning("CoinGecko API failed: %s — trying cache", e)
        if os.path.isfile(COINGECKO_CACHE):
            with open(COINGECKO_CACHE, "r") as f:
                data = json.load(f)
            logger.info("Loaded %d cached BTC prices", len(data))
        else:
            logger.warning("No cached BTC prices available")

    return data


# ===========================================================================
# Risk metrics computation
# ===========================================================================

CLOSED_ACTIONS = frozenset({
    "put_expired_otm", "call_expired_otm",
    "put_closed_tp", "call_closed_tp",
    "put_closed_sl", "call_closed_sl",
    "put_assigned", "call_assigned",
})


def _safe_float(val, default=0.0):
    """Convert a value to float, returning default if None or empty."""
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def compute_risk_metrics(trades: list[dict]) -> dict:
    """Compute risk metrics from a list of trade dicts.

    Works with trades from state JSON (values are native types) and from
    CSV (values are strings).
    """
    result = {
        "sharpe_ratio": None,
        "sortino_ratio": None,
        "calmar_ratio": None,
        "profit_factor": None,
        "expectancy": None,
        "max_drawdown_pct": 0.0,
        "current_drawdown_pct": 0.0,
        "avg_win": None,
        "avg_loss": None,
        "largest_win": None,
        "largest_loss": None,
        "max_consecutive_wins": 0,
        "max_consecutive_losses": 0,
    }

    closed = [t for t in trades if t.get("action") in CLOSED_ACTIONS]
    if not closed:
        return result

    # Gather PnL values for closed trades
    # A "win" for premium-only trades (expired OTM) uses premium; otherwise pnl
    pnl_values = []
    for t in closed:
        pnl = _safe_float(t.get("pnl"))
        premium = _safe_float(t.get("premium"))
        # For expired OTM, there's typically no pnl field — the premium IS the profit
        if t["action"] in ("put_expired_otm", "call_expired_otm"):
            pnl_values.append(premium if premium != 0 else pnl)
        else:
            pnl_values.append(pnl)

    if not pnl_values:
        return result

    wins = [p for p in pnl_values if p > 0]
    losses = [p for p in pnl_values if p < 0]
    n = len(pnl_values)

    # --- Basic stats ---
    result["avg_win"] = round(sum(wins) / len(wins), 8) if wins else None
    result["avg_loss"] = round(sum(losses) / len(losses), 8) if losses else None
    result["largest_win"] = round(max(wins), 8) if wins else None
    result["largest_loss"] = round(min(losses), 8) if losses else None

    # --- Profit factor ---
    total_wins = sum(wins)
    total_losses = abs(sum(losses))
    if total_losses > 0:
        result["profit_factor"] = round(total_wins / total_losses, 4)
    elif total_wins > 0:
        result["profit_factor"] = float("inf")

    # --- Expectancy ---
    win_rate = len(wins) / n if n else 0
    loss_rate = len(losses) / n if n else 0
    avg_w = (sum(wins) / len(wins)) if wins else 0
    avg_l = abs(sum(losses) / len(losses)) if losses else 0
    result["expectancy"] = round(avg_w * win_rate - avg_l * loss_rate, 8)

    # --- Consecutive wins/losses ---
    max_cw, max_cl, cw, cl = 0, 0, 0, 0
    for p in pnl_values:
        if p > 0:
            cw += 1
            cl = 0
        elif p < 0:
            cl += 1
            cw = 0
        else:
            cw = 0
            cl = 0
        max_cw = max(max_cw, cw)
        max_cl = max(max_cl, cl)
    result["max_consecutive_wins"] = max_cw
    result["max_consecutive_losses"] = max_cl

    # --- Equity curve and max drawdown ---
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    for p in pnl_values:
        cumulative += p
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd

    if peak > 0:
        result["max_drawdown_pct"] = round((max_dd / peak) * 100, 2)
    result["current_drawdown_pct"] = round(((peak - cumulative) / peak) * 100, 2) if peak > 0 else 0.0

    # --- Sharpe / Sortino / Calmar (annualized, rf=0) ---
    mean_return = sum(pnl_values) / n
    if n >= 2:
        variance = sum((p - mean_return) ** 2 for p in pnl_values) / (n - 1)
        std_dev = math.sqrt(variance)
        if std_dev > 0:
            result["sharpe_ratio"] = round((mean_return / std_dev) * math.sqrt(252), 4)

        # Sortino: downside deviation
        downside = [min(0, p - 0) for p in pnl_values]  # rf=0
        downside_var = sum(d ** 2 for d in downside) / (n - 1)
        downside_dev = math.sqrt(downside_var)
        if downside_dev > 0:
            result["sortino_ratio"] = round((mean_return / downside_dev) * math.sqrt(252), 4)

    # Calmar: annualized return / max drawdown
    annualized_return = mean_return * 252
    if max_dd > 0:
        result["calmar_ratio"] = round(annualized_return / max_dd, 4)

    return result


# ===========================================================================
# Per-strategy summary builder
# ===========================================================================

def build_strategy_summary(state: dict, settlement: str) -> dict:
    """Build the summary sub-object for a strategy from its state JSON."""
    cash_key, budget_key, hwm_key = get_state_keys(settlement)
    trades = state.get("trades", [])
    precision = 4 if settlement == "BTC" else 2

    initial = _safe_float(state.get(budget_key))
    cash = _safe_float(state.get(cash_key))
    hwm = _safe_float(state.get(hwm_key))

    # Equity — simplified: cash for BTC settlement (no open future positions tracked)
    equity = cash
    if settlement != "BTC" and state.get("active_future"):
        entry = state["active_future"].get("entry_price", 0)
        size = state["active_future"].get("size_btc", 0)
        # We don't have a live price here, so equity = cash (conservative)
        pass

    total_return_pct = ((equity - initial) / initial * 100) if initial else 0
    drawdown_pct = ((hwm - equity) / hwm * 100) if hwm > 0 else 0

    puts_sold = sum(1 for t in trades if t.get("action") == "sell_put")
    calls_sold = sum(1 for t in trades if t.get("action") == "sell_call")
    assignments = sum(1 for t in trades if t.get("action") in ("put_assigned", "call_assigned"))
    expired_otm = sum(1 for t in trades if t.get("action") in ("put_expired_otm", "call_expired_otm"))

    total_premium = sum(_safe_float(t.get("premium")) for t in trades)
    total_pnl = sum(_safe_float(t.get("pnl")) for t in trades)

    closed = [t for t in trades if t.get("action") in CLOSED_ACTIONS]
    wins = sum(1 for t in closed if _safe_float(t.get("pnl")) >= 0)
    win_rate = (wins / len(closed) * 100) if closed else 0

    return {
        "initial_budget": initial,
        "current_cash": round(cash, precision),
        "equity": round(equity, precision),
        "total_return_pct": round(total_return_pct, 2),
        "drawdown_pct": round(drawdown_pct, 2),
        "high_water_mark": round(hwm, precision),
        "phase": state.get("phase", "unknown"),
        "total_trades": len(trades),
        "puts_sold": puts_sold,
        "calls_sold": calls_sold,
        "assignments": assignments,
        "expired_otm": expired_otm,
        "total_premium": round(total_premium, precision),
        "total_pnl": round(total_pnl, precision),
        "win_rate_pct": round(win_rate, 1),
        "active_option": state.get("active_option"),
        "active_future": state.get("active_future"),
    }


def build_trades_list(state: dict) -> list[dict]:
    """Build the trades array for a strategy, selecting only dashboard-relevant fields."""
    result = []
    for t in state.get("trades", []):
        result.append({
            "timestamp": t.get("timestamp"),
            "action": t.get("action"),
            "symbol": t.get("symbol"),
            "strike": _safe_float(t.get("strike")),
            "delta": _safe_float(t.get("delta")),
            "dte": _safe_float(t.get("dte")),
            "amount_btc": _safe_float(t.get("amount_btc")),
            "premium": _safe_float(t.get("premium")) or None,
            "pnl": _safe_float(t.get("pnl")) or None,
            "btc_price": _safe_float(t.get("btc_price")),
            "notes": t.get("notes", ""),
        })
    return result


def build_cashflow_list(state: dict, settlement: str) -> list[dict]:
    """Reconstruct the cashflow timeline from trades."""
    cash_key, budget_key, _ = get_state_keys(settlement)
    running_cash = _safe_float(state.get(budget_key))
    precision = 4 if settlement == "BTC" else 2
    result = []

    for t in state.get("trades", []):
        premium = _safe_float(t.get("premium"))
        pnl = _safe_float(t.get("pnl"))

        if premium:
            running_cash += premium
        elif pnl:
            running_cash += pnl

        result.append({
            "timestamp": t.get("timestamp"),
            "action": t.get("action"),
            "premium": premium or 0,
            "pnl": pnl or 0,
            "cash_after": round(running_cash, precision),
            "notes": t.get("notes", ""),
        })

    return result


def build_daily_pnl(trades: list[dict]) -> list[dict]:
    """Aggregate trades by date into daily PnL entries."""
    daily = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "premium": 0.0})

    for t in trades:
        ts = t.get("timestamp", "")
        if not ts:
            continue
        # Parse ISO date — take first 10 chars for date part
        date_str = ts[:10]
        daily[date_str]["pnl"] += _safe_float(t.get("pnl")) + _safe_float(t.get("premium"))
        daily[date_str]["trades"] += 1
        daily[date_str]["premium"] += _safe_float(t.get("premium"))

    result = []
    for date_str in sorted(daily.keys()):
        d = daily[date_str]
        result.append({
            "date": date_str,
            "pnl": round(d["pnl"], 8),
            "trades": d["trades"],
            "premium": round(d["premium"], 8),
        })
    return result


# ===========================================================================
# HODL benchmark
# ===========================================================================

def build_hodl(btc_prices: list[dict] | None, states: list[dict]) -> dict | None:
    """Build HODL benchmark section.

    Finds the earliest strategy created_at date and computes BTC return
    from that date to current.
    """
    if not btc_prices:
        return None

    # Earliest strategy start date
    start_dates = []
    for s in states:
        ca = s.get("created_at", "")
        if ca:
            start_dates.append(ca[:10])
    if not start_dates:
        return None

    earliest = min(start_dates)

    # Filter prices from start date
    filtered = [p for p in btc_prices if p["date"] >= earliest]
    if not filtered:
        return None

    start_price = filtered[0]["price"]
    current_price = filtered[-1]["price"]
    return_pct = ((current_price - start_price) / start_price * 100) if start_price else 0

    return {
        "start_date": filtered[0]["date"],
        "start_price": start_price,
        "current_price": current_price,
        "return_pct": round(return_pct, 2),
        "prices": filtered,
    }


# ===========================================================================
# Portfolio aggregate
# ===========================================================================

def build_portfolio(strategies_data: dict, settlement: str) -> dict:
    """Aggregate metrics across all strategies."""
    total_equity = 0.0
    total_initial = 0.0
    total_premium = 0.0
    total_pnl = 0.0
    total_trades = 0

    for sid, sdata in strategies_data.items():
        s = sdata["summary"]
        total_equity += s["equity"]
        total_initial += s["initial_budget"]
        total_premium += s["total_premium"]
        total_pnl += s["total_pnl"]
        total_trades += s["total_trades"]

    precision = 4 if settlement == "BTC" else 2
    total_return_pct = ((total_equity - total_initial) / total_initial * 100) if total_initial else 0

    return {
        "total_equity": round(total_equity, precision),
        "total_initial": round(total_initial, precision),
        "total_return_pct": round(total_return_pct, 2),
        "total_premium_collected": round(total_premium, precision),
        "total_realized_pnl": round(total_pnl, precision),
        "total_trades": total_trades,
    }


# ===========================================================================
# Log parsing
# ===========================================================================

# Log line format: 2026-06-16 07:35:04,253 [INFO] strategy: [conservative] message
LOG_LINE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3} "
    r"\[(\w+)\] "
    r"(\w+): "
    r"(.*)$"
)

# Extract strategy tag from message: [conservative] rest of message
STRATEGY_TAG_RE = re.compile(r"^\[(\w+)\] (.*)$")

# BTC price from log line: BTC Price: 65982.50 BTC
BTC_PRICE_LOG_RE = re.compile(r"BTC Price:\s*([\d.]+)")

# Risk filter block: Risk check: BTC 65982 < SMA50 73627. Trend filter blocks new puts.
RISK_FILTER_RE = re.compile(r"Risk check:.*Trend filter blocks")


def parse_log_files(max_age_days: int = 30) -> tuple[list[dict], list[dict]]:
    """Parse log files and extract:
    1. WARNING/ERROR log entries + strategy-tagged entries
    2. Daily snapshot summaries

    Returns (log_entries, daily_snapshots).
    """
    log_entries = []
    # daily_data[date] -> {btc_price, strategies_run, trades_executed, risk_blocks, reasons}
    daily_data = defaultdict(lambda: {
        "btc_price": None,
        "strategies_run": set(),
        "trades_executed": 0,
        "risk_filter_blocks": 0,
        "risk_filter_reasons": set(),
    })

    if not os.path.isdir(LOG_DIR):
        logger.warning("Log directory not found: %s", LOG_DIR)
        return [], []

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)

    log_files = sorted(f for f in os.listdir(LOG_DIR) if f.endswith(".log"))
    for fname in log_files:
        # Parse date from filename: wheel_YYYYMMDD_HHMMSS.log
        match = re.match(r"wheel_(\d{8})_\d{6}\.log", fname)
        if not match:
            continue
        file_date_str = match.group(1)
        try:
            file_date = datetime.strptime(file_date_str, "%Y%m%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if file_date < cutoff:
            continue

        path = os.path.join(LOG_DIR, fname)
        with open(path, "r") as f:
            for line in f:
                line = line.rstrip()
                m = LOG_LINE_RE.match(line)
                if not m:
                    continue

                timestamp_str, level, module, message = m.groups()
                log_date = timestamp_str[:10]

                # Extract strategy tag if present
                strategy = None
                sm = STRATEGY_TAG_RE.match(message)
                if sm:
                    strategy = sm.group(1)
                    message = sm.group(2)

                # Track BTC price
                bpm = BTC_PRICE_LOG_RE.search(message)
                if bpm:
                    daily_data[log_date]["btc_price"] = float(bpm.group(1))

                # Track strategy runs
                if "Running strategy:" in message:
                    # Extract strategy name from: Running strategy: conservative (...)
                    run_m = re.search(r"Running strategy:\s*(\w+)", message)
                    if run_m:
                        daily_data[log_date]["strategies_run"].add(run_m.group(1))

                # Track risk filter blocks
                if RISK_FILTER_RE.search(message):
                    daily_data[log_date]["risk_filter_blocks"] += 1
                    # Extract reason
                    reason_m = re.search(r"(BTC.*?\.)", message)
                    if reason_m:
                        daily_data[log_date]["risk_filter_reasons"].add(
                            reason_m.group(1).rstrip(".")
                        )

                # Track trades: look for trade executions/actions in messages
                trade_actions = (
                    "Opened CSP", "Opened CC", "SELL_PUT", "SELL_CALL", "sell_put", "sell_call",
                    "Selling PUT", "Selling CALL", "PUT ASSIGNED", "CALL ASSIGNED", "TAKE PROFIT", "STOP LOSS"
                )
                if any(action in message for action in trade_actions):
                    daily_data[log_date]["trades_executed"] += 1

                # Collect WARNING/ERROR entries, and strategy-tagged entries
                if level in ("WARNING", "ERROR") or strategy:
                    entry = {
                        "timestamp": timestamp_str.replace(" ", "T"),
                        "level": level,
                        "message": message,
                    }
                    if strategy:
                        entry["strategy"] = strategy
                    log_entries.append(entry)

    # Build daily snapshots
    daily_snapshots = []
    for date_str in sorted(daily_data.keys()):
        d = daily_data[date_str]
        daily_snapshots.append({
            "date": date_str,
            "btc_price": d["btc_price"],
            "strategies_run": len(d["strategies_run"]),
            "trades_executed": d["trades_executed"],
            "risk_filter_blocks": d["risk_filter_blocks"],
            "risk_filter_reasons": sorted(d["risk_filter_reasons"]),
        })

    return log_entries, daily_snapshots


# ===========================================================================
# Git operations
# ===========================================================================

def git_publish():
    """Add, commit, and push docs/data/."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        subprocess.run(
            ["git", "add", "docs/data/"],
            cwd=BASE_DIR, check=True, capture_output=True, text=True,
        )
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=BASE_DIR, capture_output=True, text=True,
        )
        if result.returncode == 0:
            logger.info("No changes to commit")
            return

        subprocess.run(
            ["git", "commit", "-m", f"data: daily update {today}"],
            cwd=BASE_DIR, check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ["git", "push"],
            cwd=BASE_DIR, check=True, capture_output=True, text=True,
        )
        logger.info("Committed and pushed docs/data/ update for %s", today)
    except subprocess.CalledProcessError as e:
        logger.error("Git operation failed: %s\nstdout: %s\nstderr: %s",
                      e, e.stdout, e.stderr)
        sys.exit(1)
    except FileNotFoundError:
        logger.error("git binary not found — skipping publish")
        sys.exit(1)


# ===========================================================================
# Custom JSON encoder — handle sets, inf, nan
# ===========================================================================

class DashboardEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, set):
            return sorted(obj)
        return super().default(obj)

    def encode(self, obj):
        return super().encode(self._sanitize(obj))

    def _sanitize(self, obj):
        if isinstance(obj, float):
            if math.isinf(obj) or math.isnan(obj):
                return None
            return obj
        if isinstance(obj, dict):
            return {k: self._sanitize(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self._sanitize(v) for v in obj]
        return obj


# ===========================================================================
# Main pipeline
# ===========================================================================

def main():
    parser = argparse.ArgumentParser(description="Publish dashboard data for crypto-wheel bot")
    parser.add_argument("--dry-run", action="store_true",
                        help="Generate JSON but skip git operations")
    args = parser.parse_args()

    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    logger.info("Starting publish pipeline")

    # -----------------------------------------------------------------------
    # 1. Load local data
    # -----------------------------------------------------------------------
    config = load_config()
    settlement = get_settlement(config)
    states = load_states()
    logger.info("Loaded %d strategy states (settlement=%s)", len(states), settlement)

    # -----------------------------------------------------------------------
    # 2. Fetch BTC prices
    # -----------------------------------------------------------------------
    btc_prices = fetch_btc_prices(days=90)
    current_btc_price = btc_prices[-1]["price"] if btc_prices else None

    # -----------------------------------------------------------------------
    # 3. Build per-strategy data
    # -----------------------------------------------------------------------
    strategies_data = {}
    for state in states:
        sid = state["strategy_id"]
        trades = state.get("trades", [])

        strategies_data[sid] = {
            "summary": build_strategy_summary(state, settlement),
            "risk": compute_risk_metrics(trades),
            "trades": build_trades_list(state),
            "cashflow": build_cashflow_list(state, settlement),
            "daily_pnl": build_daily_pnl(trades),
        }
        logger.info("Built data for strategy '%s' (%d trades)", sid, len(trades))

    # -----------------------------------------------------------------------
    # 4. HODL benchmark
    # -----------------------------------------------------------------------
    hodl = build_hodl(btc_prices, states)

    # -----------------------------------------------------------------------
    # 5. Portfolio aggregate
    # -----------------------------------------------------------------------
    portfolio = build_portfolio(strategies_data, settlement)

    # -----------------------------------------------------------------------
    # 6. Parse logs
    # -----------------------------------------------------------------------
    log_entries, daily_snapshots = parse_log_files(max_age_days=30)
    logger.info("Parsed %d log entries, %d daily snapshots", len(log_entries), len(daily_snapshots))

    # -----------------------------------------------------------------------
    # 7. Assemble output
    # -----------------------------------------------------------------------
    dashboard = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "btc_price": current_btc_price,
        "settlement": settlement,
        "config": config,
        "strategies": strategies_data,
        "hodl": hodl,
        "portfolio": portfolio,
        "logs": log_entries,
        "daily_snapshots": daily_snapshots,
    }

    # -----------------------------------------------------------------------
    # 8. Write JSON
    # -----------------------------------------------------------------------
    os.makedirs(DASHBOARD_DIR, exist_ok=True)
    with open(DASHBOARD_PATH, "w") as f:
        json.dump(dashboard, f, indent=2, cls=DashboardEncoder)

    file_size = os.path.getsize(DASHBOARD_PATH)
    logger.info("Wrote %s (%d bytes)", DASHBOARD_PATH, file_size)

    # -----------------------------------------------------------------------
    # 9. Git operations
    # -----------------------------------------------------------------------
    if args.dry_run:
        logger.info("Dry-run mode — skipping git operations")
    else:
        git_publish()

    logger.info("Pipeline complete")


if __name__ == "__main__":
    main()
