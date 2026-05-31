import { getSummaryData, getTradesForStrategy, getCashflowForStrategy, getSettlementCurrency, TradeRow } from '@/lib/data';
import { MoreVertical, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { MiniSparkline, DonutChart, GaugeChart } from './components/DashboardCharts';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string, strategy?: string }> }) {
  const params = await searchParams;
  const daysParam = params.days || '30';
  const days = parseInt(daysParam, 10);
  const isAllTime = isNaN(days) || daysParam === 'all';
  const strategyParam = params.strategy;

  const summaryData = getSummaryData();
  const settlement = getSettlementCurrency();
  const isBTC = settlement === 'BTC';
  const currencySymbol = isBTC ? '₿' : '$';
  const pricePrecision = isBTC ? 4 : 2;
  
  // Collect all trades across strategies
  let allTrades: (TradeRow & { strategy_id: string })[] = [];
  summaryData.forEach(s => {
    const trades = getTradesForStrategy(s.strategy_id);
    const mapped = trades.map(t => ({ ...t, strategy_id: s.strategy_id }));
    allTrades = [...allTrades, ...mapped];
  });
  
  // Sort by date
  allTrades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Determine the cutoff date based on the latest trade to accurately reflect "last X days" of the simulation
  const latestTradeDate = allTrades.length > 0 ? new Date(allTrades[allTrades.length - 1].timestamp) : new Date();
  const cutoffDate = new Date(latestTradeDate);
  if (!isAllTime) {
    cutoffDate.setDate(cutoffDate.getDate() - days);
  } else {
    cutoffDate.setFullYear(2000); // effectively all time
  }

  // Filter trades by cutoff
  const filteredTrades = allTrades.filter(t => t.timestamp && new Date(t.timestamp) >= cutoffDate);

  // Filter for metrics and calendar based on selected strategy
  const metricsTrades = strategyParam ? filteredTrades.filter(t => t.strategy_id === strategyParam) : filteredTrades;

  // Aggregate daily
  const dailyData: Record<string, { pnl: number, count: number, dateObj: Date }> = {};
  metricsTrades.forEach(t => {
    if (!t.timestamp) return;
    const d = new Date(t.timestamp);
    const dateKey = d.toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { pnl: 0, count: 0, dateObj: d };
    }
    dailyData[dateKey].count++;
    if (t.pnl) dailyData[dateKey].pnl += parseFloat(t.pnl);
  });

  const calendarDays = Object.values(dailyData).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  
  // Map all strategies for display
  const strategyCharts = summaryData.map(s => {
    const rawCashflow = getCashflowForStrategy(s.strategy_id);
    
    const priorCashflow = rawCashflow.filter(c => c.timestamp && new Date(c.timestamp) < cutoffDate);
    const filteredCashflow = rawCashflow.filter(c => c.timestamp && new Date(c.timestamp) >= cutoffDate);
    
    const startingBalance = priorCashflow.length > 0 
      ? parseFloat(priorCashflow[priorCashflow.length - 1].cash_after) 
      : parseFloat(s.initial_budget);

    const data = [{ value: startingBalance }];
    filteredCashflow.forEach(c => {
      const val = parseFloat(c.cash_after || '0');
      if (val > 0) data.push({ value: val });
    });
    
    // Calculate custom metrics for the period
    const stratTrades = filteredTrades.filter(t => t.strategy_id === s.strategy_id && t.pnl);
    const stratWins = stratTrades.filter(t => parseFloat(t.pnl) > 0);
    const stratWinRate = stratTrades.length > 0 ? (stratWins.length / stratTrades.length) * 100 : 0;
    const stratPnl = stratTrades.reduce((acc, t) => acc + parseFloat(t.pnl), 0);
    
    // ROI relative to the start of this specific time period
    const stratReturnPct = startingBalance > 0 ? (stratPnl / startingBalance) * 100 : 0;

    const isPositive = stratPnl >= 0;

    return {
      id: s.strategy_id,
      name: s.strategy_id.toUpperCase(),
      date: filteredCashflow[0]?.timestamp ? new Date(filteredCashflow[0].timestamp).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short'}) : 'No trades in period',
      data,
      color: isPositive ? 'var(--success)' : 'var(--danger)',
      returnPct: stratReturnPct,
      winRate: stratWinRate,
      pnl: stratPnl
    };
  });

  // Calculate Win vs Loss avg for the metrics
  const winTrades = metricsTrades.filter(t => t.pnl && parseFloat(t.pnl) > 0);
  const lossTrades = metricsTrades.filter(t => t.pnl && parseFloat(t.pnl) < 0);
  
  const avgWin = winTrades.length ? winTrades.reduce((acc, t) => acc + parseFloat(t.pnl), 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length ? Math.abs(lossTrades.reduce((acc, t) => acc + parseFloat(t.pnl), 0)) / lossTrades.length : 0;
  
  const tradesWithPnl = metricsTrades.filter(t => t.pnl);
  const winRate = tradesWithPnl.length ? (winTrades.length / tradesWithPnl.length) * 100 : 0;
  
  const profitFactor = avgLoss === 0 ? (winTrades.length > 0 ? 2 : 0) : (avgWin * winTrades.length) / (avgLoss * lossTrades.length);

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Dashboard</h1>
        </div>
        
        <div className="time-toggles">
          <Link href={`/?days=30${strategyParam ? `&strategy=${strategyParam}` : ''}`} className={`time-toggle ${days === 30 ? 'active' : ''}`}>30 days</Link>
          <Link href={`/?days=60${strategyParam ? `&strategy=${strategyParam}` : ''}`} className={`time-toggle ${days === 60 ? 'active' : ''}`}>60 days</Link>
          <Link href={`/?days=90${strategyParam ? `&strategy=${strategyParam}` : ''}`} className={`time-toggle ${days === 90 ? 'active' : ''}`}>90 days</Link>
          <Link href={`/?days=all${strategyParam ? `&strategy=${strategyParam}` : ''}`} className={`time-toggle ${isAllTime ? 'active' : ''}`}>All time</Link>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Daily Trades Aggregation</h2>
        </div>
        
        <div className="calendar-row">
          {calendarDays.map((day, i) => {
            const weekday = day.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateNum = day.dateObj.toLocaleDateString('en-US', { day: '2-digit' });
            return (
            <div key={i} className="day-card">
              <div className="day-header">
                <span className="day-date">{dateNum} {weekday}</span>
                <FileText size={14} />
              </div>
              <div className={`day-pnl ${day.pnl > 0 ? 'text-success' : (day.pnl < 0 ? 'text-danger' : 'text-neutral')}`}>
                {day.pnl > 0 ? '+' : ''}{currencySymbol}{Math.abs(day.pnl).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: pricePrecision })}
                {day.pnl === 0 && day.count === 0 ? `${currencySymbol}0` : ''}
              </div>
              <div className="day-trades">{day.count} trades</div>
            </div>
          )})}
          {calendarDays.length === 0 && (
            <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>No trade history found for this period.</div>
          )}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 className="section-title">Strategy Performance Overview</h2>
            {strategyParam && (
              <Link href={`/?days=${daysParam}`} className="btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}>
                View All Strategies
              </Link>
            )}
          </div>
          <MoreVertical size={16} color="var(--text-muted)" />
        </div>
        
        <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {strategyCharts.map((chart, i) => (
            <Link key={i} href={`/?days=${daysParam}&strategy=${chart.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="chart-card section" style={{ height: '180px', transition: 'border-color 0.2s', borderColor: strategyParam === chart.id ? 'var(--accent-primary)' : 'var(--border-color)', borderWidth: strategyParam === chart.id ? '2px' : '1px' }}>
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
            </Link>
          ))}
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span>Profit factor</span>
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
            <span>Average Winning Trade VS<br/>Losing Trade</span>
            <MoreVertical size={16} />
          </div>
          <div className="metric-value-large">{(avgWin / (avgLoss || 1)).toFixed(2)}</div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span>{currencySymbol}{avgWin.toFixed(pricePrecision)}</span>
              <span>{currencySymbol}{avgLoss.toFixed(pricePrecision)}</span>
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
