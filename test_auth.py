import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# Ensure keys aren't empty
api_key = os.environ.get("DERIBIT_API_KEY", "")
api_secret = os.environ.get("DERIBIT_API_SECRET", "")

if not api_key or not api_secret or "your_testnet" in api_key:
    print("Error: Invalid or missing API keys in .env")
    sys.exit(1)

# Mask keys for logging
print(f"Testing connectivity... API Key: {api_key[:4]}...{api_key[-4:] if len(api_key) > 8 else ''}")

try:
    from deribit_client import DeribitClient
    client = DeribitClient(testnet=True)
    
    # Test public endpoint
    price = client.get_btc_price()
    print(f"Success! Public API works. BTC Price: {price}")
    
    # Test private endpoint
    balance = client.get_balance()
    print("Success! Private API works.")
    print(f"Total Balances: {balance.get('total', {})}")
    
except Exception as e:
    print(f"Error testing connectivity: {e}")
