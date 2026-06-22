'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision } from '@/lib/data';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function HodlPage() {
  const { data, loading, error } = useDashboard();
  const [days, setDays] = useState<string>('30');
  const [selectedStrategiesState, setSelectedStrategies] = useState<string[] | null>(null);

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

  // Initialize selected strategies if not already set
  const selectedStrategies = selectedStrategiesState || Object.keys(data.strategies);

  const toggleStrategy = (id: string) => {
    setSelectedStrategies(prev => {
      const current = prev || Object.keys(data.strategies);
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter(x => x !== id);
      } else {
        return [...current, id];
      }
    });
  };

  const selectAll = () => setSelectedStrategies(Object.keys(data.strategies));

  // Calculate daily portfolio equity for selected strategies
  const dailyPortfolioEquity: Record<string, number> = {};
  Object.entries(data.strategies)
    .filter(([id]) => selectedStrategies.includes(id))
    .forEach(([_, strategy]) => {
      strategy.daily_pnl.forEach(day => {
        const dateKey = day.date; // e.g. "YYYY-MM-DD"
        dailyPortfolioEquity[dateKey] = (dailyPortfolioEquity[dateKey] || 0) + day.equity;
      });
    });

  const totalInitialBudget = Object.entries(data.strategies)
    .filter(([id]) => selectedStrategies.includes(id))
    .reduce((acc, [_, s]) => acc + s.summary.initial_budget, 0);

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

  const isBtc = settlement === 'BTC';
  const precision = pricePrecision(settlement);

  // Format helpers
  const formatValue = (val: number) => {
    return `${currSym}${val.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
  };

  const formatProfit = (profit: number) => {
    const sign = profit > 0 ? '+' : profit < 0 ? '-' : '';
    // For BTC, if the profit is 0, we don't display '+' or '-'
    const showSign = Math.abs(profit) < 1e-9 ? '' : sign;
    return `${showSign}${currSym}${Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
  };

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
    // If settled in BTC, holding BTC results in 0% change in BTC balance.
    const hodlReturn = isBtc ? 0 : ((btcPrice - baselineBtcPrice) / baselineBtcPrice) * 100;
    
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
  const finalHodlReturn = isBtc ? 0 : ((finalBtcPrice - baselineBtcPrice) / baselineBtcPrice) * 100;

  const outperforming = finalPortfolioReturn > finalHodlReturn;
  const underperforming = finalPortfolioReturn < finalHodlReturn;
  const performanceStatus = outperforming ? 'Outperforming' : underperforming ? 'Underperforming' : 'On Par';
  const statusColor = outperforming ? 'var(--success)' : underperforming ? 'var(--accent-secondary)' : 'var(--text-muted)';

  // Calculate HODL values scaled to portfolio budget (for direct comparison in the table)
  const baselineHodlValue = totalInitialBudget;
  const finalHodlValue = isBtc ? totalInitialBudget : totalInitialBudget * (finalBtcPrice / baselineBtcPrice);
  const hodlProfit = finalHodlValue - baselineHodlValue;

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

      {/* Strategy Selector Filter */}
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.75rem', 
          marginBottom: '2rem', 
          padding: '1.25rem 1.5rem', 
          background: 'var(--bg-card)', 
          borderRadius: '16px', 
          border: '1px solid var(--border-color)' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Filter Strategies
          </span>
          {selectedStrategies.length < Object.keys(data.strategies).length && (
            <button 
              onClick={selectAll} 
              style={{ 
                fontSize: '0.8rem', 
                color: 'var(--accent-secondary)', 
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Select All
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {Object.entries(data.strategies).map(([id, strat]) => {
            const isSelected = selectedStrategies.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleStrategy(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: isSelected ? '1px solid var(--accent-secondary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--text-muted)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  }
                }}
              >
                {/* Visual Checkbox Dot */}
                <span 
                  style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: isSelected ? 'var(--accent-secondary)' : 'transparent',
                    border: isSelected ? 'none' : '1px solid var(--text-muted)',
                    transition: 'all 0.2s'
                  }} 
                />
                <span style={{ textTransform: 'capitalize' }}>{id}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({currSym}{strat.summary.initial_budget.toLocaleString(undefined, { minimumFractionDigits: precision === 4 ? 2 : 0 })})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Theta Wheel Portfolio Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {finalPortfolioReturn > 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Ending Equity: {formatValue(finalPortfolioEquity)}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>HODL BTC Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {finalHodlReturn > 0 ? '+' : ''}{finalHodlReturn.toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            BTC Price: ${finalBtcPrice.toLocaleString()} (vs ${baselineBtcPrice.toLocaleString()} start)
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', borderLeft: `4px solid ${statusColor}` }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Relative Performance</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2.0rem', fontWeight: 800, color: statusColor }}>
            {performanceStatus}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Difference: {(finalPortfolioReturn - finalHodlReturn) > 0 ? '+' : ''}{(finalPortfolioReturn - finalHodlReturn).toFixed(2)}%
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
                <td className="text-right">{formatValue(baselinePortEquity)}</td>
                <td className="text-right">{formatValue(finalPortfolioEquity)}</td>
                <td className="text-right" style={{ color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {formatProfit(finalPortfolioEquity - baselinePortEquity)}
                </td>
                <td className="text-right" style={{ color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {finalPortfolioReturn > 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Buy & Hold BTC (HODL)</td>
                <td className="text-right">{formatValue(baselineHodlValue)}</td>
                <td className="text-right">{formatValue(finalHodlValue)}</td>
                <td className="text-right" style={{ color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {formatProfit(hodlProfit)}
                </td>
                <td className="text-right" style={{ color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {finalHodlReturn > 0 ? '+' : ''}{finalHodlReturn.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
