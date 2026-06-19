'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision } from '@/lib/data';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ChartClient from './ChartClient';

export default function StrategyClient({ id }: { id: string }) {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading strategy details...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load strategy data</h2>
        <p>{error || 'No data found.'}</p>
      </div>
    );
  }

  const strategy = data.strategies[id];
  const settlement = data.settlement;
  const isBTC = settlement === 'BTC';
  const currSym = currencySymbol(settlement);
  const precision = pricePrecision(settlement);

  if (!strategy) {
    return (
      <main className="container">
        <h1>Strategy Not Found</h1>
        <p>No strategy with ID "{id}" was found in the dataset.</p>
        <Link href="/" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </main>
    );
  }

  const { summary, trades, cashflow } = strategy;

  return (
    <main className="container" style={{ padding: '2rem 0' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <h1 style={{ textTransform: 'capitalize', margin: '0.5rem 0' }}>{id} Strategy Details</h1>
        <div className={`badge badge-${summary.phase.replace(' ', '_')}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
          {summary.phase.replace('_', ' ')}
        </div>
      </div>

      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span className="card-title">Initial Budget</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {currSym}{summary.initial_budget.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span className="card-title">Current Cash</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {currSym}{summary.current_cash.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span className="card-title">Total Trades</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.total_trades}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span className="card-title">Total PNL</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1.5rem', fontWeight: 700, color: summary.total_pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {currSym}{summary.total_pnl.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Cashflow & Equity Trend</h2>
      <div className="card" style={{ marginBottom: '3rem', height: '400px', padding: '1.5rem' }}>
        <ChartClient data={cashflow} settlement={settlement} />
      </div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Trade History</h2>
      <div className="card table-container" style={{ padding: 0 }}>
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
            {trades.map((trade, i) => {
              const isProfit = trade.pnl > 0;
              const isLoss = trade.pnl < 0;
              return (
                <tr key={i}>
                  <td>{new Date(trade.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <span style={{ 
                      color: trade.action.includes('sell') ? 'var(--accent-secondary)' : 'var(--success)',
                      textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600,
                      backgroundColor: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px'
                    }}>
                      {trade.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {trade.symbol.split('-').slice(1).join('-')}
                  </td>
                  <td>{trade.strike ? `$${trade.strike}` : '-'}</td>
                  <td>{trade.dte ? trade.dte.toFixed(1) : '-'}</td>
                  <td className="text-right" style={{ color: trade.premium > 0 ? 'var(--success)' : 'inherit', fontWeight: 500 }}>
                    {trade.premium ? `${currSym}${trade.premium.toFixed(precision)}` : '-'}
                  </td>
                  <td className="text-right" style={{ color: isProfit ? 'var(--success)' : (isLoss ? 'var(--danger)' : 'inherit'), fontWeight: 600 }}>
                    {trade.pnl ? `${currSym}${trade.pnl.toFixed(precision)}` : '-'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{trade.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
