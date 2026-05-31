import { getSummaryData, getTradesForStrategy, getSettlementCurrency, TradeRow } from '@/lib/data';
import { Calendar as CalendarIcon } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ strategy?: string }> }) {
  const params = await searchParams;
  const strategyParam = params.strategy;

  const summaryData = getSummaryData();
  const settlement = getSettlementCurrency();
  const isBTC = settlement === 'BTC';
  const currencySymbol = isBTC ? '₿' : '$';
  const pricePrecision = isBTC ? 4 : 2;
  const strategies = summaryData.map(s => s.strategy_id);
  
  let allTrades: TradeRow[] = [];
  summaryData.forEach(s => {
    const trades = getTradesForStrategy(s.strategy_id);
    const mapped = trades.map(t => ({ ...t, strategy_id: s.strategy_id }));
    allTrades = [...allTrades, ...mapped];
  });
  
  // Filter trades if a specific strategy is selected
  const filteredTrades = strategyParam ? allTrades.filter((t: any) => t.strategy_id === strategyParam) : allTrades;
  
  // Aggregate daily
  const dailyData: Record<string, { pnl: number, count: number, dateObj: Date, trades: any[] }> = {};
  filteredTrades.forEach((t: any) => {
    if (!t.timestamp) return;
    const d = new Date(t.timestamp);
    const dateKey = d.toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { pnl: 0, count: 0, dateObj: d, trades: [] };
    }
    dailyData[dateKey].count++;
    dailyData[dateKey].trades.push(t);
    if (t.pnl) dailyData[dateKey].pnl += parseFloat(t.pnl);
  });

  const calendarDays = Object.values(dailyData).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Calendar</h1>
        </div>
        
        <div className="time-toggles">
          <Link href="/calendar" className={`time-toggle ${!strategyParam ? 'active' : ''}`}>
            All
          </Link>
          {strategies.map(s => (
            <Link 
              key={s} 
              href={`/calendar?strategy=${s}`} 
              className={`time-toggle ${strategyParam === s ? 'active' : ''}`} 
              style={{ textTransform: 'capitalize' }}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total Trades</th>
                <th className="text-right">Daily PNL</th>
                <th>Activity summary</th>
              </tr>
            </thead>
            <tbody>
              {calendarDays.map((day, i) => {
                const weekday = day.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dateNum = day.dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
                const isProfit = day.pnl > 0;
                const isLoss = day.pnl < 0;
                
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <CalendarIcon size={16} className="text-muted" />
                        {weekday}, {dateNum}
                      </div>
                    </td>
                    <td>{day.count}</td>
                    <td className="text-right" style={{ color: isProfit ? 'var(--success)' : (isLoss ? 'var(--danger)' : 'inherit'), fontWeight: 600 }}>
                      {day.pnl > 0 ? '+' : (day.pnl < 0 ? '-' : '')}{currencySymbol}{Math.abs(day.pnl).toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}
                      {day.pnl === 0 && day.count === 0 ? `${currencySymbol}0.00` : ''}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {Array.from(new Set(day.trades.map(t => t.strategy_id))).join(', ')} strategies active
                    </td>
                  </tr>
                );
              })}
              {calendarDays.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No calendar data found
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
