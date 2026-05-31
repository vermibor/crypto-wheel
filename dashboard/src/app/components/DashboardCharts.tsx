"use client";

import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, YAxis } from 'recharts';
import { MoreVertical } from 'lucide-react';

export function MiniSparkline({ data, color }: { data: any[], color: string }) {
  if (!data || data.length === 0) return null;
  
  // Calculate a slight padding for visual breathing room
  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const diff = maxVal - minVal || 1; // avoid division by zero
  const domainMin = minVal - (diff * 0.1);
  const domainMax = maxVal + (diff * 0.1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
        <YAxis domain={[domainMin, domainMax]} hide />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ value, color }: { value: number, color: string }) {
  const data = [
    { name: 'Value', value: value },
    { name: 'Remainder', value: 100 - value }
  ];
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          innerRadius={50}
          outerRadius={65}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
        >
          <Cell fill={color} />
          <Cell fill="var(--border-color)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GaugeChart({ value }: { value: number }) {
  // A simple half-donut for profit factor (gauge)
  const data = [
    { name: 'Value', value: Math.min(value, 2) }, // Max 2 for visual scale
    { name: 'Remainder', value: Math.max(0, 2 - value) }
  ];
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          innerRadius={55}
          outerRadius={70}
          startAngle={180}
          endAngle={0}
          dataKey="value"
          stroke="none"
        >
          <Cell fill="var(--accent-primary)" />
          <Cell fill="var(--danger)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
