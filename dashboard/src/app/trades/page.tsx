'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision } from '@/lib/data';

export default function TradesPage() {
  const { data, loading, error } = useDashboard();
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading trade history...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load trade history</h2>
        <p>{error || 'No data found.'}</p>
      </div>
    );
  }

  const strategies = Object.keys(data.strategies);
  const settlement = data.settlement;
  const currSym = currencySymbol(settlement);
  const precision = pricePrecision(settlement);

  interface FlatTrade {
    timestamp: string;
    action: string;
    symbol: string;
    strike: number | null;
    delta: number | null;
    dte: number | null;
    amount_btc: number;
    premium: number;
    pnl: number;
    btc_price: number;
    order_id: string;
    notes: string;
    strategy_id: string;
  }
  
  let allTrades: FlatTrade[] = [];
  Object.entries(data.strategies).forEach(([id, sData]) => {
    const mapped = sData.trades.map(t => ({ ...t, strategy_id: id }));
    allTrades = [...allTrades, ...mapped];
  });
  
  // Filter trades by selected strategy
  const filteredTrades = strategyFilter 
    ? allTrades.filter(t => t.strategy_id === strategyFilter) 
    : allTrades;

  // Sort by most recent first
  filteredTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>All Trades</h1>
        </div>
        
        <div className="time-toggles">
          <button 
            onClick={() => setStrategyFilter(null)} 
            className={`time-toggle ${!strategyFilter ? 'active' : ''}`}
            style={{ cursor: 'pointer', background: 'transparent', border: 'none' }}
          >
            All
          </button>
          {strategies.map(s => (
            <button 
              key={s} 
              onClick={() => setStrategyFilter(s)} 
              className={`time-toggle ${strategyFilter === s ? 'active' : ''}`} 
              style={{ textTransform: 'capitalize', cursor: 'pointer', background: 'transparent', border: 'none' }}
            >
              {s}
            </button>
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
              {filteredTrades.map((trade, i) => {
                const isProfit = trade.pnl && trade.pnl > 0;
                const isLoss = trade.pnl && trade.pnl < 0;
                
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
                    <td>{trade.dte ? trade.dte.toFixed(1) : '-'}</td>
                    <td className="text-right" style={{ color: trade.premium > 0 ? 'var(--success)' : 'inherit', fontWeight: 500 }}>
                      {trade.premium ? `${currSym}${trade.premium.toFixed(precision)}` : '-'}
                    </td>
                    <td className="text-right" style={{ color: isProfit ? 'var(--success)' : (isLoss ? 'var(--danger)' : 'inherit'), fontWeight: 600 }}>
                      {trade.pnl ? `${currSym}${trade.pnl.toFixed(precision)}` : '-'}
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
