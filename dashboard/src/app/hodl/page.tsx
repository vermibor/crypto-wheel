'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol } from '@/lib/data';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingUp, Award, DollarSign } from 'lucide-react';

export default function HodlPage() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading HODL comparison data...</p>
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

  // Map and align dates for comparison
  const comparisonData = hodl.prices.map(item => {
    const dateStr = item.date;
    const btcPrice = item.price;
    
    // HODL return percentage
    const hodlReturn = ((btcPrice - hodl.start_price) / hodl.start_price) * 100;
    
    // Portfolio return percentage (sum of strategy equities vs total initial budget)
    const portEquity = dailyPortfolioEquity[dateStr] || totalInitialBudget;
    const portReturn = ((portEquity - totalInitialBudget) / totalInitialBudget) * 100;

    return {
      date: new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      'HODL BTC (%)': parseFloat(hodlReturn.toFixed(2)),
      'Portfolio (%)': parseFloat(portReturn.toFixed(2)),
      btcPrice,
      portEquity,
    };
  });

  // Calculate final metrics
  const finalPortfolioEquity = Object.values(data.strategies).reduce((acc, s) => acc + s.summary.equity, 0);
  const finalPortfolioReturn = ((finalPortfolioEquity - totalInitialBudget) / totalInitialBudget) * 100;
  const finalHodlReturn = hodl.return_pct;

  const outperforming = finalPortfolioReturn > finalHodlReturn;

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>HODL vs. Portfolio Comparison</h1>
          <span className="last-updated">Benchmark: Buy & Hold BTC starting on {new Date(hodl.start_date).toLocaleDateString()}</span>
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
            BTC Price: ${hodl.current_price.toLocaleString()} (vs ${hodl.start_price.toLocaleString()} start)
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
                <th className="text-right">Initial Capital</th>
                <th className="text-right">Final Value</th>
                <th className="text-right">Total Profit</th>
                <th className="text-right">Total Return (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Theta Wheel Options Portfolio</td>
                <td className="text-right">{currSym}{totalInitialBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="text-right">{currSym}{finalPortfolioEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="text-right" style={{ color: finalPortfolioReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {currSym}{(finalPortfolioEquity - totalInitialBudget).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="text-right" style={{ color: finalPortfolioReturn >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {finalPortfolioReturn >= 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Buy & Hold BTC (HODL)</td>
                <td className="text-right">${hodl.start_price.toLocaleString()}</td>
                <td className="text-right">${hodl.current_price.toLocaleString()}</td>
                <td className="text-right" style={{ color: finalHodlReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  ${(hodl.current_price - hodl.start_price).toLocaleString()}
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
