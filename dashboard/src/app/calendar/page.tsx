'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision } from '@/lib/data';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function CalendarPage() {
  const { data, loading, error } = useDashboard();
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading returns calendar...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load calendar data</h2>
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
  
  // Filter trades if a specific strategy is selected
  const filteredTrades = strategyFilter 
    ? allTrades.filter(t => t.strategy_id === strategyFilter) 
    : allTrades;
  
  // Aggregate daily
  const dailyData: Record<string, { pnl: number; count: number; dateObj: Date; trades: FlatTrade[] }> = {};
  filteredTrades.forEach(t => {
    if (!t.timestamp) return;
    const d = new Date(t.timestamp);
    const dateKey = d.toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { pnl: 0, count: 0, dateObj: d, trades: [] };
    }
    dailyData[dateKey].count++;
    dailyData[dateKey].trades.push(t);
    if (t.pnl) dailyData[dateKey].pnl += t.pnl;
  });

  const calendarDays = Object.values(dailyData).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Returns Calendar</h1>
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
                <th>Total Trades</th>
                <th className="text-right">Daily PNL</th>
                <th>Activity Summary</th>
              </tr>
            </thead>
            <tbody>
              {calendarDays.map((day, i) => {
                const weekday = day.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dateNum = day.dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
                const isProfit = day.pnl > 0;
                const isLoss = day.pnl < 0;
                
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <CalendarIcon size={16} className="text-muted" />
                        {weekday}, {dateNum}
                      </div>
                    </td>
                    <td>{day.count}</td>
                    <td className="text-right" style={{ color: isProfit ? 'var(--success)' : (isLoss ? 'var(--danger)' : 'inherit'), fontWeight: 600 }}>
                      {day.pnl > 0 ? '+' : (day.pnl < 0 ? '-' : '')}{currSym}{Math.abs(day.pnl).toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
                      {day.pnl === 0 && day.count === 0 ? `${currSym}0.00` : ''}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {Array.from(new Set(day.trades.map(t => t.strategy_id))).join(', ')} strategies active
                    </td>
                  </tr>
                );
              })}
              {calendarDays.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No calendar data found
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
