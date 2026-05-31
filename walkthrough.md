# Deribit Wheel Strategy Bot — Walkthrough

## What Was Built

A Python-based cron-job trading bot implementing the **Wheel options strategy** on Deribit testnet settled in BTC (inverse options).

## Project Structure

```
/shared/wheel/
├── config.json          # Strategy configurations (3 profiles)
├── main.py              # Entry point (python main.py [strategy_id] [--dry-run])
├── deribit_client.py    # Deribit API wrapper via ccxt
├── strategy.py          # Wheel strategy engine
├── state_manager.py     # Isolated per-strategy accounting
├── export.py            # CSV report generation
├── requirements.txt     # Python dependencies
├── .env.example         # API credential template
├── .gitignore
├── state/               # Auto-created: JSON state files per strategy
├── output/              # Auto-created: CSV reports
└── logs/                # Auto-created: execution logs
```

## How It Works

### Wheel Cycle
1. **Sell Cash-Secured Put** → collect premium
2. If put expires **OTM** → keep premium, repeat step 1
3. If put expires **ITM** (assigned) → buy BTC linear future to simulate holding
4. **Sell Covered Call** against the future position
5. If call expires **OTM** → keep premium, repeat step 4
6. If call expires **ITM** (called away) → close future, realize gain, return to step 1

### Risk Filters
- **SMA 50 Trend Filter**: Won't sell new puts if BTC < 50-day SMA
- **Max Drawdown Pause**: Halts new positions if equity drops >30% from peak
- **DVOL Floor** (optional): Requires minimum implied volatility for premium adequacy

### Configurable Parameters Per Strategy
| Parameter | Description |
|---|---|
| `put_delta_target` | Target delta for put selling (e.g., 0.15–0.35) |
| `call_delta_target` | Target delta for call selling |
| `dte_min` / `dte_max` | Acceptable expiry range in days |
| `take_profit_pct` | Close option early at X% profit (null = hold to expiry) |
| `stop_loss_pct` | Close option at X% loss (null = no stop) |
| `initial_budget_btc` | Isolated starting capital |

## How to Use

### 1. Set API Credentials
```bash
cp .env.example .env
# Edit .env with your Deribit TESTNET API key and secret

# install dependencies
python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt 2>&1 | tail -20
```

### 2. Run
```bash
cd /shared/wheel
source venv/bin/activate

# Dry run (no API calls):
python main.py --dry-run

# Run all strategies:
python main.py

# Run a single strategy:
python main.py conservative
```

### 3. Cron Setup (daily at 08:00 UTC)
```bash
0 8 * * * cd /shared/wheel && source venv/bin/activate && python main.py >> /shared/wheel/logs/cron.log 2>&1
```

### 4. Review Results
CSV reports are generated in `output/`:
- `<strategy_id>_trades.csv` — full trade log
- `<strategy_id>_cashflow.csv` — cash flow timeline
- `summary.csv` — cross-strategy comparison (return, drawdown, win rate)

## Verification

**Dry-run test passed** — all 3 strategies initialized correctly with isolated state files:

```
WHEEL STRATEGY BOT — 2026-03-24 20:35 UTC
Strategies: ['conservative', 'moderate', 'aggressive']
Testnet: True | Dry-run: True

[conservative] State: cash=10000.00 phase=selling_puts trades=0
[moderate]     State: cash=10000.00 phase=selling_puts trades=0
[aggressive]   State: cash=10000.00 phase=selling_puts trades=0
```

## Next Steps
- Add Deribit testnet API credentials to `.env`
- Run a live testnet execution to validate order placement and option chain parsing
