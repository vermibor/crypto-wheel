"""
Deribit API client wrapper using ccxt.
Handles all exchange interactions for the Wheel strategy bot.
"""

import ccxt
import os
import logging
import time
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class DeribitClient:
    """Wrapper around ccxt for Deribit testnet/mainnet."""

    def __init__(self, testnet: bool = True, settlement: str = "BTC"):
        api_key = os.environ.get("DERIBIT_API_KEY", "")
        api_secret = os.environ.get("DERIBIT_API_SECRET", "")

        self.exchange = ccxt.deribit({
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
        })
        self.settlement = settlement

        if testnet:
            self.exchange.set_sandbox_mode(True)

        self._retry_call(self.exchange.load_markets)
        logger.info(
            "DeribitClient initialized (testnet=%s, settlement=%s, markets=%d)",
            testnet, settlement, len(self.exchange.markets),
        )

    def _retry_call(self, func, *args, max_retries: int = 5, retry_delay: float = 2.0, **kwargs):
        """Execute a ccxt read/public method with retries.
        
        Does not wrap write operations to avoid duplicate execution.
        """
        current_delay = retry_delay
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except (ccxt.BaseError, requests.RequestException) as e:
                err_msg = str(e)
                if len(err_msg) > 500:
                    err_msg = err_msg[:500] + "... [truncated]"
                
                if attempt == max_retries - 1:
                    logger.error(
                        "Exchange call %s failed after %d attempts: %s",
                        getattr(func, "__name__", str(func)), max_retries, err_msg
                    )
                    raise e
                
                logger.warning(
                    "Exchange call %s failed (attempt %d/%d). Retrying in %.1fs... Error: %s",
                    getattr(func, "__name__", str(func)),
                    attempt + 1,
                    max_retries,
                    current_delay,
                    err_msg
                )
                time.sleep(current_delay)
                current_delay *= 2

    # ------------------------------------------------------------------
    # Market data
    # ------------------------------------------------------------------

    def get_btc_price(self) -> float:
        """Get the current BTC index price."""
        try:
            symbol = "BTC/USDC" if self.settlement == "USDC" else "BTC/USD:BTC"
            ticker = self._retry_call(self.exchange.fetch_ticker, symbol)
            return float(ticker["last"])
        except Exception as e:
            # Fallback to fetching index price via public API
            try:
                response = self._retry_call(
                    self.exchange.publicGetGetIndexPrice, {"index_name": "btc_usd"}
                )
                return float(response.get("result", {}).get("index_price", 0))
            except Exception as ex:
                err_msg = str(ex)
                if len(err_msg) > 500:
                    err_msg = err_msg[:500] + "... [truncated]"
                logger.warning("Failed to fetch index price: %s", err_msg)
                raise ex

    def get_btc_ohlcv(self, timeframe: str = "1d", limit: int = 60) -> list:
        """Fetch daily OHLCV candles for BTC.

        Returns list of [timestamp, open, high, low, close, volume].
        """
        symbol = "BTC/USD:BTC" if self.settlement == "BTC" else "BTC/USDC:USDC"
        try:
            ohlcv = self._retry_call(self.exchange.fetch_ohlcv, symbol, timeframe=timeframe, limit=limit)
            return ohlcv
        except Exception as e:
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:500] + "... [truncated]"
            logger.warning("OHLCV fetch failed for %s: %s, falling back to index", symbol, err_msg)
            return []

    def get_dvol(self) -> float | None:
        """Fetch Deribit BTC DVOL (implied volatility index).

        Returns the DVOL value or None if unavailable.
        """
        try:
            # ccxt may not expose DVOL natively; try via public API call
            response = self._retry_call(
                self.exchange.publicGetGetVolatilityIndexData,
                {
                    "currency": "BTC",
                    "resolution": "1D",
                    "start_timestamp": int(
                        (datetime.now(timezone.utc).timestamp() - 86400) * 1000
                    ),
                    "end_timestamp": int(
                        datetime.now(timezone.utc).timestamp() * 1000
                    ),
                }
            )
            data = response.get("result", {}).get("data", [])
            if data:
                return float(data[-1][1])  # Last DVOL value
        except Exception as e:
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:500] + "... [truncated]"
            logger.warning("Failed to fetch DVOL: %s", err_msg)
        return None

    # ------------------------------------------------------------------
    # Options chain
    # ------------------------------------------------------------------

    def get_option_instruments(self, kind: str = "option") -> list[dict]:
        """Return all active BTC option instruments with configured settlement."""
        instruments = []
        for symbol, market in self.exchange.markets.items():
            if (
                market.get("base") == "BTC"
                and market.get("settle") == self.settlement
                and market.get("type") == "option"
                and market.get("active")
            ):
                instruments.append(market)
        return instruments

    def get_option_chain(self, expiry_date: str | None = None) -> list[dict]:
        """Get option chain data with greeks for BTC/BTC options.

        Args:
            expiry_date: Filter by expiry date string (e.g. '2026-03-28').
                         If None, returns all expirations.

        Returns:
            List of dicts with keys: symbol, strike, option_type, expiry,
            bid, ask, mark_price, delta, gamma, theta, vega, open_interest.
        """
        instruments = self.get_option_instruments()
        chain = []

        for inst in instruments:
            symbol = inst["symbol"]
            info = inst.get("info", {})

            # Parse expiry from the instrument info
            inst_expiry = inst.get("expiry")
            if expiry_date and inst_expiry:
                exp_dt = datetime.fromtimestamp(inst_expiry / 1000, tz=timezone.utc)
                if exp_dt.strftime("%Y-%m-%d") != expiry_date:
                    continue

            try:
                ticker = self._retry_call(self.exchange.fetch_ticker, symbol, max_retries=2, retry_delay=1.0)
                greeks = ticker.get("info", {}).get("greeks", {})
                chain.append({
                    "symbol": symbol,
                    "strike": inst.get("strike"),
                    "option_type": inst.get("optionType"),  # call / put
                    "expiry": inst_expiry,
                    "bid": ticker.get("bid"),
                    "ask": ticker.get("ask"),
                    "mark_price": ticker.get("info", {}).get("mark_price") or ticker.get("last"),
                    "delta": float(greeks.get("delta", 0)),
                    "gamma": float(greeks.get("gamma", 0)),
                    "theta": float(greeks.get("theta", 0)),
                    "vega": float(greeks.get("vega", 0)),
                    "open_interest": ticker.get("info", {}).get("open_interest", 0),
                })
            except Exception as e:
                logger.debug("Skipping %s: %s", symbol, e)

        return chain

    def get_available_expiries(self) -> list[str]:
        """Return sorted list of unique expiry dates (YYYY-MM-DD) for BTC BTC options."""
        instruments = self.get_option_instruments()
        expiries = set()
        for inst in instruments:
            exp_ts = inst.get("expiry")
            if exp_ts:
                exp_dt = datetime.fromtimestamp(exp_ts / 1000, tz=timezone.utc)
                expiries.add(exp_dt.strftime("%Y-%m-%d"))
        return sorted(expiries)

    # ------------------------------------------------------------------
    # Order execution
    # ------------------------------------------------------------------

    def cancel_all_orders_for_symbol(self, symbol: str):
        """Cancel all open orders for a specific symbol."""
        try:
            self.exchange.cancel_all_orders(symbol)
            logger.debug("Cancelled open orders for %s", symbol)
        except Exception as e:
            logger.debug("Failed to cancel open orders for %s: %s", symbol, e)

    def sell_option(self, symbol: str, amount: float) -> dict:
        """Sell (write) an option.

        Args:
            symbol: The ccxt option symbol.
            amount: Size in BTC (e.g. 0.1).

        Returns:
            Order result dict from ccxt.
        """
        self.cancel_all_orders_for_symbol(symbol)
        logger.info("SELL OPTION: %s amount=%.4f", symbol, amount)
        order = self.exchange.create_order(
            symbol=symbol,
            type="market",
            side="sell",
            amount=amount,
        )
        return order

    def buy_option(self, symbol: str, amount: float) -> dict:
        """Buy back (close) an option position.

        Args:
            symbol: The ccxt option symbol.
            amount: Size in BTC.

        Returns:
            Order result dict.
        """
        self.cancel_all_orders_for_symbol(symbol)
        logger.info("BUY OPTION (close): %s amount=%.4f", symbol, amount)
        order = self.exchange.create_order(
            symbol=symbol,
            type="market",
            side="buy",
            amount=amount,
        )
        return order

    def buy_future(self, amount: float) -> dict:
        """Open a long BTC perpetual future to simulate holding BTC.

        Args:
            amount: Size in BTC (e.g. 0.1).

        Returns:
            Order result dict.
        """
        symbol = "BTC/USD:BTC" if self.settlement == "BTC" else "BTC/USDC:USDC"
        self.cancel_all_orders_for_symbol(symbol)
        logger.info("BUY FUTURE (long): %s amount=%.4f", symbol, amount)
        order = self.exchange.create_order(
            symbol=symbol,
            type="market",
            side="buy",
            amount=amount,
        )
        return order

    def sell_future(self, amount: float) -> dict:
        """Close a long BTC perpetual future position.

        Args:
            amount: Size in BTC.

        Returns:
            Order result dict.
        """
        symbol = "BTC/USD:BTC" if self.settlement == "BTC" else "BTC/USDC:USDC"
        self.cancel_all_orders_for_symbol(symbol)
        logger.info("SELL FUTURE (close long): %s amount=%.4f", symbol, amount)
        order = self.exchange.create_order(
            symbol=symbol,
            type="market",
            side="sell",
            amount=amount,
        )
        return order

    def get_positions(self) -> list[dict]:
        """Fetch all open positions on the account."""
        positions = self._retry_call(self.exchange.fetch_positions)
        return [p for p in positions if float(p.get("contracts", 0)) != 0]

    def get_balance(self) -> dict:
        """Fetch account balance summary."""
        balance = self._retry_call(self.exchange.fetch_balance)
        return balance
