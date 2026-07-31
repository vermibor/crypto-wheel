'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision } from '@/lib/data';
import { MoreVertical, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { MiniSparkline, DonutChart, GaugeChart } from './components/DashboardCharts';

export default function Dashboard() {
  const { data, loading, error } = useDashboard();
  const [days, setDays] = useState<string>('30');
  const [strategy, setStrategy] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading dashboard metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load dashboard data</h2>
        <p>{error || 'No data found. Make sure the simulation has run and generated dashboard.json.'}</p>
      </div>
    );
  }

  const settlement = data.settlement;
  const isBTC = settlement === 'BTC';
  const currSym = currencySymbol(settlement);
  const precision = pricePrecision(settlement);
  
  // Collect all trades across strategies
  interface AggregatedTrade {
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

  let allTrades: AggregatedTrade[] = [];
  Object.entries(data.strategies).forEach(([id, sData]) => {
    const mapped = sData.trades.map(t => ({ ...t, strategy_id: id }));
    allTrades = [...allTrades, ...mapped];
  });
  
  // Sort by date
  allTrades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Determine the cutoff date based on the latest trade
  const latestTradeDate = allTrades.length > 0 ? new Date(allTrades[allTrades.length - 1].timestamp) : new Date();
  const cutoffDate = new Date(latestTradeDate);
  if (days !== 'all') {
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days, 10));
  } else {
    // Find the oldest trade date in allTrades
    const oldestTradeDate = allTrades.length > 0 ? new Date(allTrades[0].timestamp) : new Date();
    cutoffDate.setTime(oldestTradeDate.getTime());
  }

  // Filter trades by cutoff
  const filteredTrades = allTrades.filter(t => t.timestamp && new Date(t.timestamp) >= cutoffDate);

  // Filter for metrics and calendar based on selected strategy
  const metricsTrades = strategy ? filteredTrades.filter(t => t.strategy_id === strategy) : filteredTrades;

  // Setup the history slider and sliding window
  const msPerDay = 24 * 60 * 60 * 1000;
  const startDay = new Date(cutoffDate);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(latestTradeDate);
  endDay.setHours(0, 0, 0, 0);
  
  const totalDays = Math.max(1, Math.ceil((endDay.getTime() - startDay.getTime()) / msPerDay) + 1);
  const windowSize = 14; // 2 weeks window
  const maxDaysBack = Math.max(0, totalDays - windowSize);

  const [sliderVal, setSliderVal] = useState<number | null>(null);

  // Reset slider value to max when timeframe/strategy or maxDaysBack changes
  useEffect(() => {
    setSliderVal(maxDaysBack);
  }, [maxDaysBack]);

  const activeSliderVal = sliderVal !== null ? sliderVal : maxDaysBack;
  const daysBack = Math.max(0, maxDaysBack - activeSliderVal);

  const windowEnd = new Date(endDay);
  windowEnd.setDate(windowEnd.getDate() - daysBack);
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - (windowSize - 1));

  const calendarStart = totalDays > windowSize ? windowStart : startDay;
  const calendarEnd = totalDays > windowSize ? windowEnd : endDay;

  // Aggregate daily cash flow for the dates inside the window
  const dailyData: Record<string, { cashflow: number; count: number; dateObj: Date }> = {};
  
  // Pre-fill daily data with all days in the window range
  for (let d = new Date(calendarStart); d <= calendarEnd; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().split('T')[0];
    dailyData[dateKey] = { cashflow: 0, count: 0, dateObj: new Date(d) };
  }

  // Populate trades in window
  metricsTrades.forEach(t => {
    if (!t.timestamp) return;
    const d = new Date(t.timestamp);
    const dateKey = d.toISOString().split('T')[0];
    if (dailyData[dateKey]) {
      dailyData[dateKey].count++;
      const tradeCashflow = t.premium !== null && t.premium !== 0 ? t.premium : (t.pnl !== null ? t.pnl : 0);
      dailyData[dateKey].cashflow += tradeCashflow;
    }
  });

  const calendarDays = Object.values(dailyData).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  
  // Map all strategies for display
  const strategyCharts = Object.entries(data.strategies).map(([id, sData]) => {
    const rawCashflow = sData.cashflow;
    
    const priorCashflow = rawCashflow.filter(c => c.timestamp && new Date(c.timestamp) < cutoffDate);
    const filteredCashflow = rawCashflow.filter(c => c.timestamp && new Date(c.timestamp) >= cutoffDate);
    
    const startingBalance = priorCashflow.length > 0 
      ? priorCashflow[priorCashflow.length - 1].cash_after 
      : sData.summary.initial_budget;

    const chartPoints = [{ value: startingBalance }];
    filteredCashflow.forEach(c => {
      const val = c.cash_after || 0;
      if (val > 0) chartPoints.push({ value: val });
    });
    
    // Calculate custom metrics for the period
    const stratTrades = filteredTrades.filter(t => t.strategy_id === id && t.pnl);
    const stratWins = stratTrades.filter(t => t.pnl > 0);
    const stratWinRate = stratTrades.length > 0 ? (stratWins.length / stratTrades.length) * 100 : 0;
    const stratPnl = stratTrades.reduce((acc, t) => acc + t.pnl, 0);
    
    // ROI relative to the start of this specific time period
    const stratReturnPct = startingBalance > 0 ? (stratPnl / startingBalance) * 100 : 0;

    const isPositive = stratPnl >= 0;

    return {
      id,
      name: id.toUpperCase(),
      date: filteredCashflow[0]?.timestamp 
        ? new Date(filteredCashflow[0].timestamp).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) 
        : 'No trades in period',
      data: chartPoints,
      color: isPositive ? 'var(--success)' : 'var(--danger)',
      returnPct: stratReturnPct,
      winRate: stratWinRate,
      pnl: stratPnl
    };
  });

  // Calculate Win vs Loss avg for the metrics
  const winTrades = metricsTrades.filter(t => t.pnl && t.pnl > 0);
  const lossTrades = metricsTrades.filter(t => t.pnl && t.pnl < 0);
  
  const avgWin = winTrades.length ? winTrades.reduce((acc, t) => acc + t.pnl, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length ? Math.abs(lossTrades.reduce((acc, t) => acc + t.pnl, 0)) / lossTrades.length : 0;
  
  const tradesWithPnl = metricsTrades.filter(t => t.pnl !== null);
  const winRate = tradesWithPnl.length ? (winTrades.length / tradesWithPnl.length) * 100 : 0;
  
  const profitFactor = avgLoss === 0 
    ? (winTrades.length > 0 ? 2 : 0) 
    : (avgWin * winTrades.length) / (avgLoss * lossTrades.length);

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Dashboard Overview</h1>
          <span className="last-updated">Last simulation run: {new Date(data.generated_at).toLocaleString()}</span>
        </div>
        
        <div className="time-toggles">
          <button onClick={() => setDays('30')} className={`time-toggle ${days === '30' ? 'active' : ''}`}>30 days</button>
          <button onClick={() => setDays('60')} className={`time-toggle ${days === '60' ? 'active' : ''}`}>60 days</button>
          <button onClick={() => setDays('90')} className={`time-toggle ${days === '90' ? 'active' : ''}`}>90 days</button>
          <button onClick={() => setDays('all')} className={`time-toggle ${days === 'all' ? 'active' : ''}`}>All time</button>
        </div>
      </div>

      <div className="section">
        <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="section-title" style={{ margin: 0 }}>Daily Cash Flow {strategy ? `(${strategy.toUpperCase()})` : ''}</h2>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.25rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
              {calendarStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – {calendarEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {totalDays > windowSize && (
            <div className="history-slider-container" style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, minWidth: '80px' }}>History Slider</span>
              <input 
                type="range" 
                min={0} 
                max={maxDaysBack} 
                value={activeSliderVal} 
                onChange={(e) => setSliderVal(parseInt(e.target.value, 10))} 
                className="history-slider" 
                style={{ 
                  flex: 1, 
                  height: '6px', 
                  borderRadius: '3px', 
                  outline: 'none', 
                  cursor: 'pointer' 
                }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, minWidth: '80px', textAlign: 'right' }}>
                {daysBack === 0 ? 'Present' : `${daysBack} days back`}
              </span>
            </div>
          )}
        </div>
        
        <div className="calendar-row" style={{ marginTop: '0.5rem' }}>
          {calendarDays.map((day, i) => {
            const weekday = day.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateNum = day.dateObj.toLocaleDateString('en-US', { day: '2-digit' });
            return (
              <div key={i} className="day-card" style={{ minWidth: '130px', padding: '1rem' }}>
                <div className="day-header">
                  <span className="day-date">{dateNum} {weekday}</span>
                  <FileText size={14} />
                </div>
                <div className={`day-pnl ${day.cashflow > 0 ? 'text-success' : (day.cashflow < 0 ? 'text-danger' : 'text-neutral')}`} style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {day.cashflow > 0 ? '+' : ''}{currSym}{Math.abs(day.cashflow).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: precision })}
                  {day.cashflow === 0 && day.count === 0 ? `${currSym}0` : ''}
                </div>
                <div className="day-trades">{day.count} trades</div>
              </div>
            );
          })}
          {calendarDays.length === 0 && (
            <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>No trade history found for this period.</div>
          )}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 className="section-title">Strategy Performance Overview</h2>
            {strategy && (
              <button 
                onClick={() => setStrategy(null)} 
                className="btn-outline" 
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', background: 'transparent', cursor: 'pointer', borderRadius: '4px' }}
              >
                Clear Strategy Filter
              </button>
            )}
          </div>
          <MoreVertical size={16} color="var(--text-muted)" />
        </div>
        
        <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {strategyCharts.map((chart, i) => (
            <div 
              key={i} 
              onClick={() => setStrategy(chart.id)} 
              style={{ display: 'block', textDecoration: 'none', cursor: 'pointer' }}
            >
              <div 
                className="chart-card section" 
                style={{ 
                  height: '180px', 
                  transition: 'all 0.2s', 
                  borderColor: strategy === chart.id ? 'var(--accent-primary)' : 'var(--border-color)', 
                  borderWidth: strategy === chart.id ? '2px' : '1px',
                  boxShadow: strategy === chart.id ? '0 0 10px rgba(59, 130, 246, 0.2)' : 'none'
                }}
              >
                <div className="chart-header">
                  <span>{chart.date}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: chart.pnl >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {chart.pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {chart.returnPct.toFixed(2)}%
                  </span>
                </div>
                <div className="chart-title">{chart.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Win Rate: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{chart.winRate.toFixed(0)}%</span>
                </div>
                <div className="chart-wrapper" style={{ width: '100%', height: '50%', right: 0, bottom: '0.5rem' }}>
                  <MiniSparkline data={chart.data} color={chart.color} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span>Profit Factor</span>
            <MoreVertical size={16} />
          </div>
          <div className="metric-value-large">{profitFactor.toFixed(2)}</div>
          <div className="donut-wrapper">
            <GaugeChart value={profitFactor} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span>Winning VS Losing Trades</span>
            <MoreVertical size={16} />
          </div>
          <div className="metric-value-large">{winRate.toFixed(0)}%</div>
          <div className="donut-wrapper">
            <DonutChart value={winRate} color="var(--success)" />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span>Average Winning VS Losing Trade</span>
            <MoreVertical size={16} />
          </div>
          <div className="metric-value-large">{(avgWin / (avgLoss || 1)).toFixed(2)}</div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span>{currSym}{avgWin.toFixed(precision)}</span>
              <span>{currSym}{avgLoss.toFixed(precision)}</span>
            </div>
            <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ flex: avgWin, background: 'var(--success)' }}></div>
              <div style={{ flex: avgLoss, background: 'var(--danger)' }}></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
