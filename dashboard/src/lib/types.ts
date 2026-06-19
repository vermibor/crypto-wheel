// ─── dashboard.json TypeScript types ────────────────────────────────

/** Top-level dashboard payload */
export interface DashboardData {
  generated_at: string;
  btc_price: number;
  settlement: string;
  config: DashboardConfig;
  strategies: Record<string, StrategyData>;
  hodl: HodlData;
  portfolio: PortfolioData;
  logs: LogEntry[];
  daily_snapshots: DailySnapshot[];
}

// ─── Config ─────────────────────────────────────────────────────────

export interface DashboardConfig {
  global: GlobalConfig;
  strategies: StrategyConfig[];
}

export interface GlobalConfig {
  asset: string;
  settlement: string;
  position_size_btc: number;
  max_drawdown_pct: number;
  trend_filter_sma_period: number;
  trend_filter_enabled: boolean;
  dvol_min_threshold: number | null;
  testnet: boolean;
}

export interface StrategyConfig {
  id: string;
  description: string;
  put_delta_target: number;
  call_delta_target: number;
  dte_min: number;
  dte_max: number;
  take_profit_pct: number | null;
  put_stop_loss_pct: number | null;
  call_stop_loss_pct: number | null;
  initial_budget_btc: number;
}

// ─── Strategy ───────────────────────────────────────────────────────

export interface StrategyData {
  summary: StrategySummary;
  risk: StrategyRisk;
  trades: Trade[];
  cashflow: CashflowEntry[];
  daily_pnl: DailyPnlEntry[];
}

export interface StrategySummary {
  initial_budget: number;
  current_cash: number;
  equity: number;
  total_return_pct: number;
  drawdown_pct: number;
  high_water_mark: number;
  phase: string;
  total_trades: number;
  puts_sold: number;
  calls_sold: number;
  assignments: number;
  expired_otm: number;
  total_premium: number;
  total_pnl: number;
  win_rate_pct: number;
  active_option: ActiveInstrument | null;
  active_future: ActiveInstrument | null;
}

export interface ActiveInstrument {
  symbol: string;
  strike?: number;
  delta?: number;
  dte?: number;
  premium?: number;
  entry_price?: number;
  amount_btc?: number;
}

export interface StrategyRisk {
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  calmar_ratio: number | null;
  profit_factor: number | null;
  expectancy: number | null;
  max_drawdown_pct: number;
  current_drawdown_pct: number;
  avg_win: number | null;
  avg_loss: number | null;
  largest_win: number | null;
  largest_loss: number | null;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
}

export interface Trade {
  timestamp: string;
  action: string;
  symbol: string;
  strike: number | null;
  delta: number | null;
  dte: number | null;
  amount_btc: number;
  premium: number;
  pnl: number;
  btc_price: number;
  order_id: string;
  notes: string;
}

export interface CashflowEntry {
  timestamp: string;
  action: string;
  premium: number;
  pnl: number;
  cash_after: number;
  equity_estimate: number;
  notes: string;
}

export interface DailyPnlEntry {
  date: string;
  pnl: number;
  equity: number;
  trades: number;
}

// ─── HODL ───────────────────────────────────────────────────────────

export interface HodlData {
  start_date: string;
  start_price: number;
  current_price: number;
  return_pct: number;
  prices: HodlPrice[];
}

export interface HodlPrice {
  date: string;
  price: number;
}

// ─── Portfolio ──────────────────────────────────────────────────────

export interface PortfolioData {
  total_equity: number;
  total_initial: number;
  total_return_pct: number;
  total_premium_collected: number;
  total_realized_pnl: number;
  total_trades: number;
}

// ─── Logs ───────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  strategy: string;
}

// ─── Daily Snapshots ────────────────────────────────────────────────

export interface DailySnapshot {
  date: string;
  btc_price: number;
  strategies_run: number;
  trades_executed: number;
  risk_filter_blocks: number;
  risk_filter_reasons: string[];
}

// ─── Utility type ───────────────────────────────────────────────────

export const STRATEGY_IDS = ['aggressive', 'conservative', 'daily', 'moderate'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];
