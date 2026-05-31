import { getSummaryData, getTradesForStrategy, getCashflowForStrategy, getSettlementCurrency } from '@/lib/data';
import { FileText, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  const summaryData = getSummaryData();
  const settlement = getSettlementCurrency();
  const isBTC = settlement === 'BTC';
  const currencySymbol = isBTC ? '₿' : '$';

  const enrichedReports = summaryData.map(row => {
    const trades = getTradesForStrategy(row.strategy_id);
    const cashflow = getCashflowForStrategy(row.strategy_id);
    
    // Calculate duration in days
    const timestamps = trades.map(t => new Date(t.timestamp).getTime()).filter(t => !isNaN(t));
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    let durationDays = (maxTime - minTime) / (1000 * 60 * 60 * 24);
    if (durationDays < 1 || isNaN(durationDays)) durationDays = 1; // prevent infinite division
    
    // Annualized Yield (CAGR)
    const totalReturnRaw = parseFloat(row.total_return_pct) / 100;
    const annualizedYield = (Math.pow(1 + totalReturnRaw, 365 / durationDays) - 1) * 100;
    
    // Profit Factor & Expectancy
    const closedTrades = trades.filter(t => t.pnl);
    const wins = closedTrades.filter(t => parseFloat(t.pnl) > 0);
    const losses = closedTrades.filter(t => parseFloat(t.pnl) < 0);
    
    const grossProfit = wins.reduce((acc, t) => acc + parseFloat(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + parseFloat(t.pnl), 0));
    
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99.99 : 0) : (grossProfit / grossLoss);
    
    const winRate = wins.length / (closedTrades.length || 1);
    const lossRate = 1 - winRate;
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    
    const expectancy = (avgWin * winRate) - (avgLoss * lossRate);
    
    // Sharpe Ratio using daily cashflow changes
    const dailyReturns: number[] = [];
    const dailyEquity: Record<string, number> = {};
    
    cashflow.forEach(c => {
      if(!c.timestamp) return;
      const d = new Date(c.timestamp).toISOString().split('T')[0];
      // Use equity estimate if available, otherwise fallback to cash after
      dailyEquity[d] = parseFloat(c.equity_estimate || c.cash_after || '0');
    });
    
    const sortedDates = Object.keys(dailyEquity).sort();
    for(let i = 1; i < sortedDates.length; i++) {
      const prev = dailyEquity[sortedDates[i-1]];
      const curr = dailyEquity[sortedDates[i]];
      if (prev > 0) {
        dailyReturns.push((curr - prev) / prev);
      }
    }
    
    let sharpeRatio = 0;
    if (dailyReturns.length > 1) {
      const avgDailyReturn = dailyReturns.reduce((a,b) => a+b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a,b) => a + Math.pow(b - avgDailyReturn, 2), 0) / (dailyReturns.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        // Assume risk free rate of 0 for simplicity, scale to 365 days for crypto
        sharpeRatio = (avgDailyReturn / stdDev) * Math.sqrt(365);
      }
    }
  
    // Calmar Ratio (Annualized Return / Max Drawdown)
    const maxDd = parseFloat(row.drawdown_pct);
    const calmarRatio = maxDd === 0 ? (annualizedYield > 0 ? 99.99 : 0) : (annualizedYield / maxDd);
    
    return {
      ...row,
      profitFactor,
      expectancy,
      annualizedYield,
      sharpeRatio,
      calmarRatio,
      durationDays
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
                const isLoss = parseFloat(row.total_return_pct) < 0;
                return (
                  <tr key={i}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} className="text-muted" />
                        {row.strategy_id}
                        <span style={{ 
                          textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700,
                          backgroundColor: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px',
                          color: 'var(--text-secondary)'
                        }}>
                          {row.phase.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-medium">{parseFloat(row.win_rate_pct).toFixed(1)}%</td>
                    <td className="text-right" style={{ color: parseFloat(row.drawdown_pct) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {parseFloat(row.drawdown_pct).toFixed(2)}%
                    </td>
                    <td className="text-right font-medium">
                      {row.profitFactor > 90 ? '∞' : row.profitFactor.toFixed(2)}x
                    </td>
                    <td className="text-right" style={{ color: row.expectancy >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {currencySymbol}{row.expectancy.toFixed(isBTC ? 4 : 2)}
                    </td>
                    <td className="text-right font-medium" style={{ color: row.sharpeRatio >= 1.5 ? 'var(--success)' : (row.sharpeRatio < 0 ? 'var(--danger)' : 'inherit') }}>
                      {row.sharpeRatio.toFixed(2)}
                    </td>
                    <td className="text-right font-medium">
                      {row.calmarRatio > 90 ? '∞' : row.calmarRatio.toFixed(2)}
                    </td>
                    <td className="text-right" style={{ color: isLoss ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {!isLoss ? '+' : ''}{parseFloat(row.total_return_pct).toFixed(2)}%
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
            <b> Expectancy:</b> Expected statistical {currencySymbol} profit per closed trade.
          </span>
        </div>
      </div>
    </>
  );
}
