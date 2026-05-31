#!/usr/bin/env python3
"""
Margin Simulation Tool for ThetaWheel Strategies

Queries Deribit API to estimate initial margin requirements for strategy option candidates.
"""

import sys
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

# Suppress debug logs from ccxt
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logging.getLogger("ccxt").setLevel(logging.WARNING)

# Load environment
load_dotenv(Path(__file__).parent / ".env")

from deribit_client import DeribitClient
from main import load_config
from strategy import _select_best_option


def main():
    print("=" * 80)
    print("THETAWHEEL MARGIN SIMULATION TOOL")
    print("=" * 80)

    try:
        config = load_config()
        global_config = config["global"]
        strategies = config["strategies"]
        settlement = global_config.get("settlement", "BTC")

        client = DeribitClient(testnet=global_config["testnet"], settlement=settlement)
        
        print("\nFetching BTC price and option chain...")
        btc_price = client.get_btc_price()
        chain = client.get_option_chain()
        print(f"BTC Price: {btc_price:.2f} {settlement}")
        print(f"Loaded {len(chain)} option contracts.\n")

        print(f"{'Strategy':<15} | {'Type':<4} | {'Candidate Option':<25} | {'Strike':<8} | {'Delta':<7} | {'Mark Price':<10} | {'Est. Margin':<12}")
        print("-" * 105)

        for strat in strategies:
            # CSP (Put) Candidate
            put_opt = _select_best_option(
                chain,
                option_type="put",
                delta_target=strat["put_delta_target"],
                dte_min=strat["dte_min"],
                dte_max=strat["dte_max"],
            )

            # Covered Call Candidate
            call_opt = _select_best_option(
                chain,
                option_type="call",
                delta_target=strat["call_delta_target"],
                dte_min=strat["dte_min"],
                dte_max=strat["dte_max"],
            )

            size = 0.1 # Default strategy size

            for opt, opt_type in [(put_opt, "PUT"), (call_opt, "CALL")]:
                if not opt:
                    print(f"{strat['id']:<15} | {opt_type:<4} | {'No candidate found':<25} | {'-':<8} | {'-':<7} | {'-':<10} | {'-':<12}")
                    continue

                symbol = opt["symbol"]
                # For deribit API, use market id
                market_id = client.exchange.markets[symbol]["id"]
                mark_price = float(opt["mark_price"] or 0)

                try:
                    margin_params = {
                        "instrument_name": market_id,
                        "amount": size,
                        "price": mark_price if mark_price > 0 else 0.05
                    }
                    res = client.exchange.privateGetGetMargins(margin_params)
                    # For selling/writing, we care about "sell" margin
                    sell_margin = float(res.get("result", {}).get("sell", 0))
                    
                    # Convert to float and format
                    margin_str = f"{sell_margin:.5f} BTC" if settlement == "BTC" else f"{sell_margin:.2f} USDC"
                    price_str = f"{mark_price:.4f} BTC" if settlement == "BTC" else f"{mark_price:.2f} USDC"
                    opt_display = symbol.split(":")[0] if ":" in symbol else symbol
                    
                    print(f"{strat['id']:<15} | {opt_type:<4} | {opt_display:<25} | {opt['strike']:<8.0f} | {opt['delta']:<+7.3f} | {price_str:<10} | {margin_str:<12}")

                except Exception as e:
                    print(f"{strat['id']:<15} | {opt_type:<4} | {symbol:<25} | Error getting margin: {e}")

        print("=" * 80)
        print("Note: Margin requirements are dynamic and depend on volatility and portfolio configurations.")
        print("=" * 80)

    except Exception as e:
        print(f"Error during simulation: {e}")


if __name__ == "__main__":
    main()
