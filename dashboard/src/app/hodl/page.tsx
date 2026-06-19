'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol } from '@/lib/data';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function HodlPage() {
  const { data, loading, error } = useDashboard();
  const [days, setDays] = useState<string>('30');

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading comparison data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load HODL data</h2>
        <p>{error || 'No data found.'}</p>
      </div>
    );
  }

  const settlement = data.settlement;
  const currSym = currencySymbol(settlement);
  const hodl = data.hodl;

  // Calculate daily portfolio equity
  const dailyPortfolioEquity: Record<string, number> = {};
  Object.values(data.strategies).forEach(strategy => {
    strategy.daily_pnl.forEach(day => {
      const dateKey = day.date; // e.g. "YYYY-MM-DD"
      dailyPortfolioEquity[dateKey] = (dailyPortfolioEquity[dateKey] || 0) + day.equity;
    });
  });

  const totalInitialBudget = Object.values(data.strategies).reduce((acc, s) => acc + s.summary.initial_budget, 0);

  // Sort prices by date ascending
  const allPrices = [...hodl.prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
   
  // Determine the cutoff date based on the latest date in the dataset
  const latestDate = allPrices.length > 0 ? new Date(allPrices[allPrices.length - 1].date) : new Date();
  const cutoffDate = new Date(latestDate);
  if (days !== 'all') {
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days, 10));
  } else {
    cutoffDate.setFullYear(2000); // all time
  }

  // Filter prices
  const filteredPrices = allPrices.filter(p => new Date(p.date) >= cutoffDate);

  if (filteredPrices.length === 0) {
    return (
      <div className="error-container">
        <h2>No data in selected timeframe</h2>
        <p>Try extending the time range filter.</p>
      </div>
    );
  }

  // Establish baseline (0% start point)
  const baselinePriceObj = filteredPrices[0];
  const baselineBtcPrice = baselinePriceObj.price;
  
  const firstDateStr = baselinePriceObj.date;
  const baselinePortEquity = dailyPortfolioEquity[firstDateStr] || totalInitialBudget;

  // Map and align dates for comparison relative to baseline
  const comparisonData = filteredPrices.map(item => {
    const dateStr = item.date;
    const btcPrice = item.price;
    
    // HODL return percentage relative to baseline (0% on start date)
    const hodlReturn = ((btcPrice - baselineBtcPrice) / baselineBtcPrice) * 100;
    
    // Portfolio return percentage relative to baseline (0% on start date)
    const portEquity = dailyPortfolioEquity[dateStr] || totalInitialBudget;
    const portReturn = ((portEquity - baselinePortEquity) / baselinePortEquity) * 100;

    return {
      date: new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      'HODL BTC (%)': parseFloat(hodlReturn.toFixed(2)),
      'Portfolio (%)': parseFloat(portReturn.toFixed(2)),
      btcPrice,
      portEquity,
    };
  });

  // Calculate final metrics for the period
  const finalPriceObj = filteredPrices[filteredPrices.length - 1];
  const finalBtcPrice = finalPriceObj.price;
  const finalPortfolioEquity = dailyPortfolioEquity[finalPriceObj.date] || totalInitialBudget;

  const finalPortfolioReturn = ((finalPortfolioEquity - baselinePortEquity) / baselinePortEquity) * 100;
  const finalHodlReturn = ((finalBtcPrice - baselineBtcPrice) / baselineBtcPrice) * 100;

  const outperforming = finalPortfolioReturn > finalHodlReturn;

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Wheel vs HODL BTC</h1>
          <span className="last-updated">Benchmark: Buy & Hold BTC starting on {new Date(firstDateStr).toLocaleDateString()} (Baseline: 0%)</span>
        </div>

        <div className="time-toggles">
          <button onClick={() => setDays('30')} className={`time-toggle ${days === '30' ? 'active' : ''}`}>30 days</button>
          <button onClick={() => setDays('60')} className={`time-toggle ${days === '60' ? 'active' : ''}`}>60 days</button>
          <button onClick={() => setDays('90')} className={`time-toggle ${days === '90' ? 'active' : ''}`}>90 days</button>
          <button onClick={() => setDays('all')} className={`time-toggle ${days === 'all' ? 'active' : ''}`}>All time</button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Theta Wheel Portfolio Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalPortfolioReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {finalPortfolioReturn >= 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Ending Equity: {currSym}{finalPortfolioEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>HODL BTC Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalHodlReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {finalHodlReturn >= 0 ? '+' : ''}{finalHodlReturn.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            BTC Price: ${finalBtcPrice.toLocaleString()} (vs ${baselineBtcPrice.toLocaleString()} start)
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', borderLeft: `4px solid ${outperforming ? 'var(--success)' : 'var(--accent-secondary)'}` }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Relative Performance</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2.0rem', fontWeight: 800, color: outperforming ? 'var(--success)' : 'var(--accent-secondary)' }}>
            {outperforming ? 'Outperforming' : 'Underperforming'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Difference: {(finalPortfolioReturn - finalHodlReturn).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="section" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 className="section-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={20} color="var(--accent-primary)" />
          Cumulative Returns Trend (%)
        </h2>
        <div style={{ width: '100%', height: '400px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="var(--text-muted)" 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis 
                stroke="var(--text-muted)" 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                labelStyle={{ color: 'var(--text-muted)' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Line 
                type="monotone" 
                dataKey="Portfolio (%)" 
                stroke="var(--accent-primary)" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="HODL BTC (%)" 
                stroke="var(--accent-secondary)" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Summary Table */}
      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
          <h2 className="section-title">Comparative Statistics</h2>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Strategy / Benchmark</th>
                <th className="text-right">Baseline Value ({new Date(firstDateStr).toLocaleDateString()})</th>
                <th className="text-right">Ending Value ({new Date(finalPriceObj.date).toLocaleDateString()})</th>
                <th className="text-right">Window Profit</th>
                <th className="text-right">Total Return (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Theta Wheel Options Portfolio</td>
                <td className="text-right">{currSym}{baselinePortEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="text-right">{currSym}{finalPortfolioEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="text-right" style={{ color: finalPortfolioReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {currSym}{(finalPortfolioEquity - baselinePortEquity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="text-right" style={{ color: finalPortfolioReturn >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {finalPortfolioReturn >= 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Buy & Hold BTC (HODL)</td>
                <td className="text-right">${baselineBtcPrice.toLocaleString()}</td>
                <td className="text-right">${finalBtcPrice.toLocaleString()}</td>
                <td className="text-right" style={{ color: finalHodlReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  ${(finalBtcPrice - baselineBtcPrice).toLocaleString()}
                </td>
                <td className="text-right" style={{ color: finalHodlReturn >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {finalHodlReturn >= 0 ? '+' : ''}{finalHodlReturn.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
