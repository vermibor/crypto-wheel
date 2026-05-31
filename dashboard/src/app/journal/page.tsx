import { getImportantLogs } from '@/lib/data';
import { AlertCircle, AlertTriangle, Terminal, Cpu } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function JournalPage() {
  const logs = getImportantLogs();

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>System Journal</h1>
        </div>
      </div>

      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '200px' }}>Timestamp</th>
                <th style={{ width: '120px' }}>Level</th>
                <th style={{ width: '150px' }}>Module</th>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        <Cpu size={14} className="text-muted" />
                        {log.module}
                      </span>
                    </td>
                    <td>
                      <div style={{ 
                        color: isError ? '#dc2626' : (isWarning ? '#d97706' : 'inherit'),
                        fontWeight: isError ? 600 : 500
                      }}>
                        {log.message}
                      </div>
                      {log.traceback && (
                        <div style={{ 
                          marginTop: '0.5rem', padding: '0.75rem', 
                          backgroundColor: '#1e293b', color: '#f8fafc',
                          borderRadius: '6px', fontSize: '0.75rem',
                          fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                          overflowX: 'auto'
                        }}>
                          {log.traceback}
                        </div>
                      )}
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
    </>
  );
}
