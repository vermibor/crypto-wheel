"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { CashflowEntry } from '@/lib/types';
import { currencySymbol, pricePrecision } from '@/lib/data';

export default function ChartClient({ data, settlement }: { data: CashflowEntry[], settlement: string }) {
  const isBTC = settlement === 'BTC';
  const currSym = currencySymbol(settlement);
  const precision = pricePrecision(settlement);

  if (!data || data.length === 0) {
    return <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No cashflow data available</div>;
  }

  const chartData = data.map(row => ({
    time: new Date(row.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    cash: row.cash_after || 0,
  })).filter(d => d.cash > 0);

  if (chartData.length === 0) return null;

  const minCash = Math.min(...chartData.map(d => d.cash));
  const maxCash = Math.max(...chartData.map(d => d.cash));
  
  // Add some padding to domain
  const domainMin = Math.floor(minCash * 0.99);
  const domainMax = Math.ceil(maxCash * 1.01);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis 
          dataKey="time" 
          stroke="var(--text-muted)" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
          dy={10}
        />
        <YAxis 
          domain={[domainMin, domainMax]} 
          stroke="var(--text-muted)" 
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${currSym}${value.toLocaleString(undefined, { minimumFractionDigits: isBTC ? 3 : 0, maximumFractionDigits: precision })}`}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
          itemStyle={{ color: 'var(--text-primary)' }}
          labelStyle={{ color: 'var(--text-muted)' }}
        />
        <Area 
          type="monotone" 
          dataKey="cash" 
          name="Cash Balance"
          stroke="var(--accent-primary)" 
          strokeWidth={2}
          fillOpacity={1} 
          fill="url(#colorCash)" 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
