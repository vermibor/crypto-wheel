'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { AlertCircle, AlertTriangle, Terminal, Cpu, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function JournalPage() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading system journal...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Failed to load journal data</h2>
        <p>{error || 'No data found.'}</p>
      </div>
    );
  }

  const logs = data.logs || [];
  const snapshots = data.daily_snapshots || [];

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>System Journal & Execution Logs</h1>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Daily Execution Snapshots Section */}
        <div className="section" style={{ padding: '1.5rem' }}>
          <h2 className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} color="var(--accent-primary)" />
            Daily Execution Snapshots
          </h2>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>BTC Price</th>
                  <th>Strategies Run</th>
                  <th>Trades Executed</th>
                  <th>Risk Filter Blocks</th>
                  <th>Blocked Reasons</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{snap.date}</td>
                    <td>${snap.btc_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{snap.strategies_run}</td>
                    <td>{snap.trades_executed}</td>
                    <td>
                      <span style={{ 
                        color: snap.risk_filter_blocks > 0 ? 'var(--danger)' : 'var(--success)',
                        fontWeight: 600 
                      }}>
                        {snap.risk_filter_blocks}
                      </span>
                    </td>
                    <td>
                      {snap.risk_filter_reasons && snap.risk_filter_reasons.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {snap.risk_filter_reasons.map((r, idx) => (
                            <span 
                              key={idx} 
                              style={{ 
                                fontSize: '0.7rem', 
                                backgroundColor: '#fee2e2', 
                                color: '#ef4444', 
                                padding: '0.1rem 0.4rem', 
                                borderRadius: '4px' 
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle2 size={12} /> Passed Risk Filters
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {snapshots.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      No daily snapshots recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs Section */}
        <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Terminal size={20} color="var(--accent-primary)" />
              Error and Warning Logs
            </h2>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '200px' }}>Timestamp</th>
                  <th style={{ width: '120px' }}>Level</th>
                  <th style={{ width: '150px' }}>Strategy</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isError = log.level === 'ERROR';
                  const isWarning = log.level === 'WARNING';
                  
                  return (
                    <tr key={i} style={{ 
                      backgroundColor: isError ? 'rgba(239, 68, 68, 0.02)' : (isWarning ? 'rgba(245, 158, 11, 0.02)' : 'transparent'),
                    }}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {log.timestamp}
                      </td>
                      <td>
                        <span style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.75rem', fontWeight: 700,
                          backgroundColor: isError ? '#fee2e2' : '#fef3c7',
                          color: isError ? '#ef4444' : '#f59e0b',
                          padding: '0.25rem 0.5rem', borderRadius: '4px'
                        }}>
                          {isError ? <AlertCircle size={14} /> : <AlertTriangle size={14} />}
                          {log.level}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.875rem', textTransform: 'capitalize' }}>
                          <Cpu size={14} className="text-muted" />
                          {log.strategy || 'System'}
                        </span>
                      </td>
                      <td>
                        <div style={{ 
                          color: isError ? '#dc2626' : (isWarning ? '#d97706' : 'inherit'),
                          fontWeight: isError ? 600 : 500
                        }}>
                          {log.message}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <Terminal size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                      No warnings or errors found in logs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
