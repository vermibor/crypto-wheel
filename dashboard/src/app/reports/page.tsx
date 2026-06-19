'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol } from '@/lib/data';
import { FileText, Info } from 'lucide-react';

export default function ReportsPage() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading quantitative strategy reports...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load reports data</h2>
        <p>{error || 'No data found.'}</p>
      </div>
    );
  }

  const settlement = data.settlement;
  const isBTC = settlement === 'BTC';
  const currSym = currencySymbol(settlement);

  const enrichedReports = Object.entries(data.strategies).map(([id, sData]) => {
    const summary = sData.summary;
    const risk = sData.risk;
    const trades = sData.trades;

    // Calculate duration in days
    const timestamps = trades.map(t => new Date(t.timestamp).getTime()).filter(t => !isNaN(t));
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    let durationDays = (maxTime - minTime) / (1000 * 60 * 60 * 24);
    if (durationDays < 1 || isNaN(durationDays)) durationDays = 1;

    // Annualized Yield (CAGR)
    const totalReturnRaw = summary.total_return_pct / 100;
    const annualizedYield = (Math.pow(1 + totalReturnRaw, 365 / durationDays) - 1) * 100;

    return {
      id,
      summary,
      risk,
      annualizedYield,
      durationDays,
    };
  });

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Quantitative Strategy Reports</h1>
        </div>
      </div>

      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="text-right">Win Rate</th>
                <th className="text-right">Max DD</th>
                <th className="text-right">Profit Factor</th>
                <th className="text-right">Expectancy</th>
                <th className="text-right">Sharpe Ratio</th>
                <th className="text-right">Calmar Ratio</th>
                <th className="text-right">Total Return</th>
                <th className="text-right">Ann. Yield (CAGR)</th>
              </tr>
            </thead>
            <tbody>
              {enrichedReports.map((row, i) => {
                const isLoss = row.summary.total_return_pct < 0;
                return (
                  <tr key={i}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} className="text-muted" />
                        {row.id}
                        <span style={{ 
                          textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700,
                          backgroundColor: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px',
                          color: 'var(--text-secondary)'
                        }}>
                          {row.summary.phase.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-medium">{row.summary.win_rate_pct.toFixed(1)}%</td>
                    <td className="text-right" style={{ color: row.summary.drawdown_pct > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {row.summary.drawdown_pct.toFixed(2)}%
                    </td>
                    <td className="text-right font-medium">
                      {row.risk.profit_factor === null 
                        ? 'N/A' 
                        : row.risk.profit_factor > 90 ? '∞' : `${row.risk.profit_factor.toFixed(2)}x`}
                    </td>
                    <td className="text-right" style={{ color: (row.risk.expectancy || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {currSym}{row.risk.expectancy !== null ? row.risk.expectancy.toFixed(isBTC ? 4 : 2) : '0.00'}
                    </td>
                    <td className="text-right font-medium" style={{ color: (row.risk.sharpe_ratio || 0) >= 1.5 ? 'var(--success)' : ((row.risk.sharpe_ratio || 0) < 0 ? 'var(--danger)' : 'inherit') }}>
                      {row.risk.sharpe_ratio !== null ? row.risk.sharpe_ratio.toFixed(2) : 'N/A'}
                    </td>
                    <td className="text-right font-medium">
                      {row.risk.calmar_ratio === null 
                        ? 'N/A' 
                        : row.risk.calmar_ratio > 90 ? '∞' : row.risk.calmar_ratio.toFixed(2)}
                    </td>
                    <td className="text-right" style={{ color: isLoss ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {!isLoss ? '+' : ''}{row.summary.total_return_pct.toFixed(2)}%
                    </td>
                    <td className="text-right" style={{ color: row.annualizedYield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {!isLoss ? '+' : ''}{row.annualizedYield.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
              {enrichedReports.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No quant reports found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Info size={14} />
          <span>
            <b>Sharpe Ratio:</b> Annualized return relative to volatility (Risk-free rate = 0). 
            <b> Calmar Ratio:</b> Annualized yield vs Maximum Drawdown. 
            <b> Expectancy:</b> Expected statistical {currSym} profit per closed trade.
          </span>
        </div>
      </div>
    </>
  );
}
