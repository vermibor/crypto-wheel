import { getSummaryData, getTradesForStrategy, getSettlementCurrency, TradeRow } from '@/lib/data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ strategy?: string }> }) {
  const params = await searchParams;
  const strategyParam = params.strategy;

  const summaryData = getSummaryData();
  const strategies = summaryData.map(s => s.strategy_id);
  const settlement = getSettlementCurrency();
  const isBTC = settlement === 'BTC';
  const currencySymbol = isBTC ? '₿' : '$';
  const pricePrecision = isBTC ? 4 : 2;
  
  let allTrades: TradeRow[] = [];
  summaryData.forEach(s => {
    const trades = getTradesForStrategy(s.strategy_id);
    const mapped = trades.map(t => ({ ...t, strategy_id: s.strategy_id }));
    allTrades = [...allTrades, ...mapped];
  });
  
  // Filter trades by selected strategy
  const filteredTrades = strategyParam ? allTrades.filter((t: any) => t.strategy_id === strategyParam) : allTrades;

  // Sort by most recent first
  filteredTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>All Trades</h1>
        </div>
        
        <div className="time-toggles">
          <Link href="/trades" className={`time-toggle ${!strategyParam ? 'active' : ''}`}>
            All
          </Link>
          {strategies.map(s => (
            <Link 
              key={s} 
              href={`/trades?strategy=${s}`} 
              className={`time-toggle ${strategyParam === s ? 'active' : ''}`} 
              style={{ textTransform: 'capitalize' }}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Strategy</th>
                <th>Action</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Strike</th>
                <th>DTE</th>
                <th className="text-right">Premium</th>
                <th className="text-right">PNL</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade: any, i) => {
                const isProfit = trade.pnl && parseFloat(trade.pnl) > 0;
                const isLoss = trade.pnl && parseFloat(trade.pnl) < 0;
                
                // Determine instrument type based on symbol format (e.g. BTC-24MAY24-60000-P vs BTC-PERPETUAL)
                const isOption = trade.symbol && (trade.symbol.endsWith('-P') || trade.symbol.endsWith('-C'));
                const instrumentType = isOption ? 'Option' : (trade.symbol ? 'Future' : '-');

                return (
                  <tr key={i}>
                    <td>{new Date(trade.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{trade.strategy_id}</td>
                    <td>
                      <span style={{ 
                        color: trade.action.includes('sell') ? 'var(--accent-secondary)' : 'var(--success)',
                        textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600,
                        backgroundColor: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px'
                      }}>
                        {trade.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.75rem', fontWeight: 600,
                        backgroundColor: isOption ? 'var(--bg-app)' : '#e2e8f0', 
                        padding: '0.25rem 0.5rem', borderRadius: '4px',
                        border: isOption ? '1px solid var(--border-color)' : 'none',
                        color: isOption ? 'var(--text-secondary)' : '#475569'
                      }}>
                        {instrumentType}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {trade.symbol ? trade.symbol.split('-').slice(1).join('-') : '-'}
                    </td>
                    <td>{trade.strike ? `$${trade.strike}` : '-'}</td>
                    <td>{trade.dte ? parseFloat(trade.dte).toFixed(1) : '-'}</td>
                    <td className="text-right" style={{ color: parseFloat(trade.premium) > 0 ? 'var(--success)' : 'inherit', fontWeight: 500 }}>
                      {trade.premium ? `${currencySymbol}${parseFloat(trade.premium).toFixed(pricePrecision)}` : '-'}
                    </td>
                    <td className="text-right" style={{ color: isProfit ? 'var(--success)' : (isLoss ? 'var(--danger)' : 'inherit'), fontWeight: 600 }}>
                      {trade.pnl ? `${currencySymbol}${parseFloat(trade.pnl).toFixed(pricePrecision)}` : '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No trades found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
