#!/usr/bin/env python3
"""
Wheel Strategy Bot — Main Entry Point

Usage:
    python main.py                  # Run all strategies
    python main.py conservative     # Run a single strategy by ID
    python main.py --dry-run        # Dry run (no API orders)

Designed to be invoked once daily via cron.
"""

import sys
import json
import os
import subprocess
import logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# -------------------------------------------------------------------
# Setup
# -------------------------------------------------------------------

# Load .env for API credentials
load_dotenv(Path(__file__).parent / ".env")

# Logging
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

log_file = LOG_DIR / f"wheel_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file),
    ],
)
logger = logging.getLogger("main")

# -------------------------------------------------------------------
# Imports (after logging setup)
# -------------------------------------------------------------------

from deribit_client import DeribitClient
from strategy import run_strategy
from state_manager import load_state
from export import export_trades_csv, export_cashflow_csv, export_summary_csv


def load_config() -> dict:
    config_path = Path(__file__).parent / "config.json"
    with open(config_path) as f:
        return json.load(f)


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]

    target_strategy = args[0] if args else None

    config = load_config()
    global_config = config["global"]
    strategies = config["strategies"]
    settlement = global_config.get("settlement", "BTC")

    if target_strategy:
        strategies = [s for s in strategies if s["id"] == target_strategy]
        if not strategies:
            logger.error("Strategy '%s' not found in config.", target_strategy)
            sys.exit(1)

    logger.info("=" * 70)
    logger.info(
        "WHEEL STRATEGY BOT — %s",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )
    logger.info("Strategies: %s", [s["id"] for s in strategies])
    logger.info("Testnet: %s | Settlement: %s | Dry-run: %s", global_config["testnet"], settlement, dry_run)
    logger.info("=" * 70)

    if dry_run:
        logger.info("DRY RUN mode — no orders will be placed.")
        # In dry-run mode, we still load state and check logic,
        # but we skip the DeribitClient initialization and order execution.
        for strat_config in strategies:
            budget_key = "initial_budget_btc" if settlement == "BTC" else "initial_budget_usdc"
            default_budget = 0.5 if settlement == "BTC" else 10000.0
            initial_budget = strat_config.get(budget_key, strat_config.get("initial_budget_usdc", default_budget))
            state = load_state(
                strat_config["id"], initial_budget, settlement
            )
            from state_manager import get_state_keys
            cash_key, _, _ = get_state_keys(settlement)
            logger.info(
                "[%s] State: cash=%.4f phase=%s trades=%d",
                strat_config["id"], state[cash_key],
                state["phase"], len(state["trades"]),
            )
        logger.info("Dry run complete. No trades executed.")
        return

    # Initialize API client
    try:
        client = DeribitClient(testnet=global_config["testnet"], settlement=settlement)
        btc_price = client.get_btc_price()
        logger.info("BTC Price: %.2f %s", btc_price, settlement)
    except Exception as e:
        err_msg = str(e)
        if len(err_msg) > 500:
            err_msg = err_msg[:500] + "... [truncated]"
        logger.critical("Failed to initialize Deribit client or fetch initial BTC price: %s", err_msg)
        logger.info("=" * 70)
        logger.info("ABORTED. Log saved to %s", log_file)
        logger.info("=" * 70)
        sys.exit(1)

    # Run each strategy
    final_states = []
    for strat_config in strategies:
        try:
            state = run_strategy(client, strat_config, global_config)
            final_states.append(state)
        except Exception as e:
            logger.error(
                "Strategy '%s' failed: %s", strat_config["id"], e,
                exc_info=True,
            )
            # Load last known state for reporting
            budget_key = "initial_budget_btc" if settlement == "BTC" else "initial_budget_usdc"
            default_budget = 0.5 if settlement == "BTC" else 10000.0
            initial_budget = strat_config.get(budget_key, strat_config.get("initial_budget_usdc", default_budget))
            state = load_state(
                strat_config["id"], initial_budget, settlement
            )
            final_states.append(state)

    # Export CSVs
    logger.info("-" * 70)
    logger.info("Exporting reports...")

    for state in final_states:
        export_trades_csv(state)
        export_cashflow_csv(state, btc_price)

    export_summary_csv(final_states, btc_price)

    # Run publish pipeline to generate dashboard data and push to GitHub
    try:
        logger.info("Running publish pipeline...")
        publish_result = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "publish.py")],
            capture_output=True, text=True, timeout=120
        )
        if publish_result.returncode == 0:
            logger.info("Publish pipeline completed successfully")
        else:
            logger.warning("Publish pipeline failed: %s", publish_result.stderr)
    except Exception as e:
        logger.warning("Failed to run publish pipeline: %s", e)

    logger.info("=" * 70)
    logger.info("COMPLETE. Log saved to %s", log_file)
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
