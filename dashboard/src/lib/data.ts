// Re-export all types for convenience
export type {
  DashboardData,
  DashboardConfig,
  GlobalConfig,
  StrategyConfig,
  StrategyData,
  StrategySummary,
  StrategyRisk,
  Trade,
  CashflowEntry,
  DailyPnlEntry,
  HodlData,
  HodlPrice,
  PortfolioData,
  LogEntry,
  DailySnapshot,
  ActiveInstrument,
  StrategyId,
} from './types';

export { STRATEGY_IDS } from './types';

// ─── Pure utility functions ─────────────────────────────────────────

/** Format a number with the appropriate currency symbol */
export function formatCurrency(
  value: number,
  settlement: string,
  opts?: { compact?: boolean }
): string {
  const isBTC = settlement === 'BTC';
  const symbol = isBTC ? '₿' : '$';
  const precision = isBTC ? 4 : 2;

  if (opts?.compact && Math.abs(value) >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}k`;
  }

  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

/** Return currency symbol for a settlement string */
export function currencySymbol(settlement: string): string {
  return settlement === 'BTC' ? '₿' : '$';
}

/** Return price precision for a settlement string */
export function pricePrecision(settlement: string): number {
  return settlement === 'BTC' ? 4 : 2;
}

/** Format a Date as DD-MMM-YYYY */
export function formatDate(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/** Format a Date as DD-MMM-YYYY HH:MM */
export function formatDateTime(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}
