'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { currencySymbol, pricePrecision, formatDate } from '@/lib/data';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

// ─── Toggle Switch Component ─────────────────────────────────────────────────

interface ToggleSwitchProps {
  labelLeft: string;
  labelRight: string;
  isRight: boolean;
  onChange: (isRight: boolean) => void;
  color: string;
}

function ToggleSwitch({ labelLeft, labelRight, isRight, onChange, color }: ToggleSwitchProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span
        style={{
          fontSize: '0.85rem',
          fontWeight: isRight ? 400 : 600,
          color: isRight ? 'var(--text-muted)' : 'var(--text-primary)',
          transition: 'all 0.2s',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => onChange(false)}
      >
        {labelLeft}
      </span>
      <button
        onClick={() => onChange(!isRight)}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: color,
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.25s',
          flexShrink: 0,
        }}
        aria-label={`Toggle between ${labelLeft} and ${labelRight}`}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: isRight ? '23px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.25s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        />
      </button>
      <span
        style={{
          fontSize: '0.85rem',
          fontWeight: isRight ? 600 : 400,
          color: isRight ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'all 0.2s',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => onChange(true)}
      >
        {labelRight}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HodlPage() {
  const { data, loading, error } = useDashboard();
  const [days, setDays] = useState<string>('30');
  const [selectedStrategiesState, setSelectedStrategies] = useState<string[] | null>(null);

  // Two new toggles:
  // currencyMode: false = BTC, true = USD
  // displayMode:  false = percent, true = nominal
  const [currencyIsUSD, setCurrencyIsUSD] = useState(false);
  const [displayIsNominal, setDisplayIsNominal] = useState(false);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading comparison data...</p>
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

  // Initialize selected strategies if not already set
  const selectedStrategies = selectedStrategiesState || Object.keys(data.strategies);

  const toggleStrategy = (id: string) => {
    setSelectedStrategies(prev => {
      const current = prev || Object.keys(data.strategies);
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter(x => x !== id);
      } else {
        return [...current, id];
      }
    });
  };

  const selectAll = () => setSelectedStrategies(Object.keys(data.strategies));

  // Sort prices by date ascending
  const allPrices = [...hodl.prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // For each strategy, build a map of date -> equity (forward-filled)
  const strategyEquityTimeline: Record<string, Record<string, number>> = {};

  Object.entries(data.strategies)
    .filter(([id]) => selectedStrategies.includes(id))
    .forEach(([id, strategy]) => {
      strategyEquityTimeline[id] = {};
      
      // Build a map of dates that have trade updates
      const tradeUpdates: Record<string, number> = {};
      strategy.daily_pnl.forEach(day => {
        tradeUpdates[day.date] = day.equity;
      });

      // Forward fill for all prices dates
      let lastStratEquity = strategy.summary.initial_budget;
      allPrices.forEach(p => {
        const dateStr = p.date;
        if (tradeUpdates[dateStr] !== undefined) {
          lastStratEquity = tradeUpdates[dateStr];
        }
        strategyEquityTimeline[id][dateStr] = lastStratEquity;
      });
    });

  const totalInitialBudget = Object.entries(data.strategies)
    .filter(([id]) => selectedStrategies.includes(id))
    .reduce((acc, [_, s]) => acc + s.summary.initial_budget, 0);

  // Sum up daily portfolio equity (in settlement currency, i.e. BTC if settlement=BTC)
  const dailyPortfolioEquityFilled: Record<string, number> = {};
  allPrices.forEach(p => {
    const dateStr = p.date;
    let totalEquityForDay = 0;
    Object.keys(strategyEquityTimeline).forEach(id => {
      totalEquityForDay += strategyEquityTimeline[id][dateStr];
    });
    dailyPortfolioEquityFilled[dateStr] = totalEquityForDay;
  });

  // Determine the cutoff date based on the latest date in the dataset
  const latestDate = allPrices.length > 0 ? new Date(allPrices[allPrices.length - 1].date) : new Date();
  const cutoffDate = new Date(latestDate);
  if (days !== 'all') {
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days, 10));
  } else {
    cutoffDate.setFullYear(2000); // all time
  }

  // Filter prices
  const filteredPrices = allPrices.filter(p => new Date(p.date) >= cutoffDate);

  if (filteredPrices.length === 0) {
    return (
      <div className="error-container">
        <h2>No data in selected timeframe</h2>
        <p>Try extending the time range filter.</p>
      </div>
    );
  }

  const isBtcSettlement = settlement === 'BTC';
  const precision = pricePrecision(settlement);

  // ─── Currency helpers ──────────────────────────────────────────────────────
  // When currencyIsUSD=true: multiply BTC-denominated values by BTC price on that day.
  // When currencyIsUSD=false: keep values as-is (BTC or native settlement).
  // Note: if settlement is already USD, USD toggle effectively does nothing to equity values,
  // but HODL BTC line becomes USD-denominated (which equals BTC price movement).

  const displaySym = currencyIsUSD ? '$' : currSym;
  const displayPrecision = currencyIsUSD ? 2 : precision;

  // Convert a BTC-denominated equity value to display currency using the btcPrice on that day
  const toDisplay = (btcEquity: number, btcPrice: number): number => {
    if (!isBtcSettlement) {
      // settlement already in USD — no conversion needed regardless of toggle
      return btcEquity;
    }
    return currencyIsUSD ? btcEquity * btcPrice : btcEquity;
  };

  // Format helpers for display currency
  const formatValue = (val: number) => {
    return `${displaySym}${val.toLocaleString(undefined, { minimumFractionDigits: displayPrecision, maximumFractionDigits: displayPrecision })}`;
  };

  const formatProfit = (profit: number) => {
    const sign = profit > 0 ? '+' : profit < 0 ? '-' : '';
    const showSign = Math.abs(profit) < 1e-9 ? '' : sign;
    return `${showSign}${displaySym}${Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: displayPrecision, maximumFractionDigits: displayPrecision })}`;
  };

  // ─── Baseline ──────────────────────────────────────────────────────────────
  const baselinePriceObj = filteredPrices[0];
  const baselineBtcPrice = baselinePriceObj.price;
  const firstDateStr = baselinePriceObj.date;

  const baselinePortEquityBtc = dailyPortfolioEquityFilled[firstDateStr] || totalInitialBudget;
  // HODL BTC baseline: always equal to portfolio budget (same starting point)
  const baselineHodlValueBtc = totalInitialBudget;

  // ─── Final metrics ─────────────────────────────────────────────────────────
  const finalPriceObj = filteredPrices[filteredPrices.length - 1];
  const finalBtcPrice = finalPriceObj.price;
  const finalPortfolioEquityBtc = dailyPortfolioEquityFilled[finalPriceObj.date] || totalInitialBudget;
  // HODL BTC final: if settled in BTC the BTC count is constant; in USD it grows with BTC price
  const finalHodlValueBtc = isBtcSettlement
    ? totalInitialBudget  // holding BTC → BTC balance unchanged
    : totalInitialBudget * (finalBtcPrice / baselineBtcPrice); // holding BTC in USD terms

  // Convert final values to display currency
  const baselinePortEquityDisplay = toDisplay(baselinePortEquityBtc, baselineBtcPrice);
  const finalPortfolioEquityDisplay = toDisplay(finalPortfolioEquityBtc, finalBtcPrice);
  const baselineHodlDisplay = toDisplay(baselineHodlValueBtc, baselineBtcPrice);
  const finalHodlDisplay = toDisplay(finalHodlValueBtc, finalBtcPrice);

  // Return percentages — always computed in the active display currency so both lines are comparable.
  // In BTC mode: display values == BTC values → same result as before.
  // In USD mode: display values are BTC-denominated equity × daily BTC price, so portfolio
  //   and HODL returns both reflect USD-denominated performance.
  const finalPortfolioReturn = ((finalPortfolioEquityDisplay - baselinePortEquityDisplay) / baselinePortEquityDisplay) * 100;
  const finalHodlReturn = ((finalHodlDisplay - baselineHodlDisplay) / baselineHodlDisplay) * 100;

  const outperforming = finalPortfolioReturn > finalHodlReturn;
  const underperforming = finalPortfolioReturn < finalHodlReturn;
  const performanceStatus = outperforming ? 'Outperforming' : underperforming ? 'Underperforming' : 'On Par';
  const statusColor = outperforming ? 'var(--success)' : underperforming ? 'var(--accent-secondary)' : 'var(--text-muted)';

  // ─── Chart data ────────────────────────────────────────────────────────────
  // Keys for recharts data must be stable; build them based on mode
  const hodlKey = displayIsNominal ? `HODL BTC (${displaySym})` : 'HODL BTC (%)';
  const portKey = displayIsNominal ? `Portfolio (${displaySym})` : 'Portfolio (%)';

  const comparisonData = filteredPrices.map(item => {
    const dateStr = item.date;
    const btcPrice = item.price;

    const portEquityBtc = dailyPortfolioEquityFilled[dateStr] || totalInitialBudget;
    const hodlEquityBtc = isBtcSettlement
      ? totalInitialBudget  // BTC-settled HODL: BTC count never changes
      : totalInitialBudget * (btcPrice / baselineBtcPrice);

    const portDisplay = toDisplay(portEquityBtc, btcPrice);
    const hodlDisplay = toDisplay(hodlEquityBtc, btcPrice);

    // HODL in display currency for percent calculation baseline
    const baselineHodlDisplayDay = toDisplay(baselineHodlValueBtc, baselineBtcPrice);
    const baselinePortDisplayDay = toDisplay(baselinePortEquityBtc, baselineBtcPrice);

    const hodlReturnPct = ((hodlDisplay - baselineHodlDisplayDay) / baselineHodlDisplayDay) * 100;
    const portReturnPct = ((portDisplay - baselinePortDisplayDay) / baselinePortDisplayDay) * 100;

    return {
      date: formatDate(dateStr),
      [hodlKey]: displayIsNominal
        ? parseFloat(hodlDisplay.toFixed(displayPrecision))
        : parseFloat(hodlReturnPct.toFixed(2)),
      [portKey]: displayIsNominal
        ? parseFloat(portDisplay.toFixed(displayPrecision))
        : parseFloat(portReturnPct.toFixed(2)),
      btcPrice,
      portEquityBtc,
    };
  });

  // ─── Chart Y-axis formatter ────────────────────────────────────────────────
  const yAxisFormatter = displayIsNominal
    ? (value: number) => {
        if (Math.abs(value) >= 1000) return `${displaySym}${(value / 1000).toFixed(1)}k`;
        return `${displaySym}${value.toFixed(displayPrecision === 4 ? 2 : 0)}`;
      }
    : (value: number) => `${value}%`;

  const chartTitle = displayIsNominal
    ? `Absolute Value Trend (${displaySym})`
    : 'Cumulative Returns Trend (%)';

  // ─── Summary card helpers ──────────────────────────────────────────────────
  const portfolioCardPrimary = displayIsNominal
    ? formatValue(finalPortfolioEquityDisplay)
    : `${finalPortfolioReturn > 0 ? '+' : ''}${finalPortfolioReturn.toFixed(2)}%`;

  const portfolioCardSecondary = displayIsNominal
    ? `Return: ${finalPortfolioReturn > 0 ? '+' : ''}${finalPortfolioReturn.toFixed(2)}%`
    : `Ending Equity: ${formatValue(finalPortfolioEquityDisplay)}`;

  const hodlCardPrimary = displayIsNominal
    ? formatValue(finalHodlDisplay)
    : `${finalHodlReturn > 0 ? '+' : ''}${finalHodlReturn.toFixed(2)}%`;

  const hodlCardSecondary = displayIsNominal
    ? `Return: ${finalHodlReturn > 0 ? '+' : ''}${finalHodlReturn.toFixed(2)}%`
    : `BTC Price: $${finalBtcPrice.toLocaleString()} (vs $${baselineBtcPrice.toLocaleString()} start)`;

  return (
    <>
      <div className="top-header">
        <div className="header-title">
          <h1>Wheel vs HODL BTC</h1>
          <span className="last-updated">Benchmark: Buy &amp; Hold BTC starting on {formatDate(firstDateStr)} (Baseline: 0%)</span>
        </div>

        <div className="hodl-controls" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* View toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <ToggleSwitch
              labelLeft="BTC"
              labelRight="USD"
              isRight={currencyIsUSD}
              onChange={setCurrencyIsUSD}
              color="#f59e0b"
            />
            <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
            <ToggleSwitch
              labelLeft="%"
              labelRight="Nominal"
              isRight={displayIsNominal}
              onChange={setDisplayIsNominal}
              color="#8b5cf6"
            />
          </div>

          {/* Time toggles */}
          <div className="time-toggles">
            <button onClick={() => setDays('30')} className={`time-toggle ${days === '30' ? 'active' : ''}`}>30 days</button>
            <button onClick={() => setDays('60')} className={`time-toggle ${days === '60' ? 'active' : ''}`}>60 days</button>
            <button onClick={() => setDays('90')} className={`time-toggle ${days === '90' ? 'active' : ''}`}>90 days</button>
            <button onClick={() => setDays('all')} className={`time-toggle ${days === 'all' ? 'active' : ''}`}>All time</button>
          </div>
        </div>
      </div>

      {/* Strategy Selector Filter */}
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.75rem', 
          marginBottom: '2rem', 
          padding: '1.25rem 1.5rem', 
          background: 'var(--bg-card)', 
          borderRadius: '16px', 
          border: '1px solid var(--border-color)' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Filter Strategies
          </span>
          {selectedStrategies.length < Object.keys(data.strategies).length && (
            <button 
              onClick={selectAll} 
              style={{ 
                fontSize: '0.8rem', 
                color: 'var(--accent-secondary)', 
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Select All
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {Object.entries(data.strategies).map(([id, strat]) => {
            const isSelected = selectedStrategies.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleStrategy(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: isSelected ? '1px solid var(--accent-secondary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--text-muted)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  }
                }}
              >
                {/* Visual Checkbox Dot */}
                <span 
                  style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: isSelected ? 'var(--accent-secondary)' : 'transparent',
                    border: isSelected ? 'none' : '1px solid var(--text-muted)',
                    transition: 'all 0.2s'
                  }} 
                />
                <span style={{ textTransform: 'capitalize' }}>{id}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({currSym}{strat.summary.initial_budget.toLocaleString(undefined, { minimumFractionDigits: precision === 4 ? 2 : 0 })})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Theta Wheel Portfolio Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {portfolioCardPrimary}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {portfolioCardSecondary}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>HODL BTC Return</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2rem', fontWeight: 800, color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {hodlCardPrimary}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {hodlCardSecondary}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', borderLeft: `4px solid ${statusColor}` }}>
          <div className="card-header" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            <span>Relative Performance</span>
          </div>
          <div className="metric-value" style={{ fontSize: '2.0rem', fontWeight: 800, color: statusColor }}>
            {performanceStatus}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Difference: {(finalPortfolioReturn - finalHodlReturn) > 0 ? '+' : ''}{(finalPortfolioReturn - finalHodlReturn).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="section" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 className="section-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={20} color="var(--accent-primary)" />
          {chartTitle}
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
                tickFormatter={yAxisFormatter}
                width={70}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : 0;
                  const n = String(name);
                  if (displayIsNominal) return [`${displaySym}${v.toLocaleString(undefined, { minimumFractionDigits: displayPrecision, maximumFractionDigits: displayPrecision })}`, n];
                  return [`${v.toFixed(2)}%`, n];
                }}
              />
              <Legend verticalAlign="top" height={36} />
              <Line 
                type="monotone" 
                dataKey={portKey} 
                stroke="var(--accent-primary)" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey={hodlKey} 
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
                <th className="text-right">Baseline Value ({formatDate(firstDateStr)})</th>
                <th className="text-right">Ending Value ({formatDate(finalPriceObj.date)})</th>
                <th className="text-right">Window Profit</th>
                <th className="text-right">Total Return (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Theta Wheel Options Portfolio</td>
                <td className="text-right">{formatValue(baselinePortEquityDisplay)}</td>
                <td className="text-right">{formatValue(finalPortfolioEquityDisplay)}</td>
                <td className="text-right" style={{ color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {formatProfit(finalPortfolioEquityDisplay - baselinePortEquityDisplay)}
                </td>
                <td className="text-right" style={{ color: finalPortfolioReturn > 0 ? 'var(--success)' : finalPortfolioReturn < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {finalPortfolioReturn > 0 ? '+' : ''}{finalPortfolioReturn.toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Buy &amp; Hold BTC (HODL)</td>
                <td className="text-right">{formatValue(baselineHodlDisplay)}</td>
                <td className="text-right">{formatValue(finalHodlDisplay)}</td>
                <td className="text-right" style={{ color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {formatProfit(finalHodlDisplay - baselineHodlDisplay)}
                </td>
                <td className="text-right" style={{ color: finalHodlReturn > 0 ? 'var(--success)' : finalHodlReturn < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {finalHodlReturn > 0 ? '+' : ''}{finalHodlReturn.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
