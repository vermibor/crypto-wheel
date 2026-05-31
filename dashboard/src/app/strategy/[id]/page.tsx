import { getSummaryData, getTradesForStrategy, getCashflowForStrategy, getSettlementCurrency } from '@/lib/data';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import ChartClient from './ChartClient';

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const summaryData = getSummaryData();
  const strategy = summaryData.find(s => s.strategy_id === id);
  const trades = getTradesForStrategy(id);
  const cashflow = getCashflowForStrategy(id);

  const settlement = getSettlementCurrency();
  const isBTC = settlement === 'BTC';
  const currencySymbol = isBTC ? '₿' : '$';
  const pricePrecision = isBTC ? 4 : 2;

  if (!strategy) {
    return (
      <main className="container">
        <h1>Strategy Not Found</h1>
        <Link href="/" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <h1 style={{ textTransform: 'capitalize' }}>{id} Strategy Details</h1>
        <div className={`badge badge-${strategy.phase.replace(' ', '_')}`}>
          {strategy.phase.replace('_', ' ')}
        </div>
      </div>

      <div className="grid-summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Initial Budget</span>
          </div>
          <div className="metric-value">{currencySymbol}{parseFloat(strategy.initial_budget).toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}</div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Current Cash</span>
          </div>
          <div className="metric-value">{currencySymbol}{parseFloat(strategy.current_cash).toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}</div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Total Trades</span>
          </div>
          <div className="metric-value">{strategy.total_trades}</div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Total PNL</span>
          </div>
          <div className="metric-value" style={{ color: parseFloat(strategy.total_realized_pnl) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {currencySymbol}{parseFloat(strategy.total_realized_pnl).toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}
          </div>
        </div>
      </div>

      <h2>Cashflow & Equity Trend</h2>
      <div className="card" style={{ marginBottom: '3rem', height: '400px' }}>
        <ChartClient data={cashflow} settlement={settlement} />
      </div>

      <h2>Trade History</h2>
      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Symbol</th>
              <th>Strike</th>
              <th>DTE</th>
              <th className="text-right">Premium</th>
              <th className="text-right">PNL</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i}>
                <td>{new Date(trade.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>
                  <span style={{ 
                    color: trade.action.includes('sell') ? 'var(--accent-secondary)' : 'var(--success)',
                    textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600
                  }}>
                    {trade.action.replace('_', ' ')}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{trade.symbol.split('-')[1]}-{trade.symbol.split('-')[2]}-{trade.symbol.split('-')[3]}</td>
                <td>{trade.strike ? `$${trade.strike}` : '-'}</td>
                <td>{trade.dte ? parseFloat(trade.dte).toFixed(1) : '-'}</td>
                <td className="text-right" style={{ color: parseFloat(trade.premium) > 0 ? 'var(--success)' : 'var(--text-primary)' }}>
                  {trade.premium ? `${currencySymbol}${parseFloat(trade.premium).toFixed(pricePrecision)}` : '-'}
                </td>
                <td className="text-right" style={{ color: parseFloat(trade.pnl) > 0 ? 'var(--success)' : (parseFloat(trade.pnl) < 0 ? 'var(--danger)' : 'var(--text-primary)') }}>
                  {trade.pnl ? `${currencySymbol}${parseFloat(trade.pnl).toFixed(pricePrecision)}` : '-'}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{trade.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
