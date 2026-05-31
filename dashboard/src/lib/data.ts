import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const OUTPUT_DIR = '/shared/wheel/output';

export function getSettlementCurrency(): string {
  try {
    const configPath = '/shared/wheel/config.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.global?.settlement || 'BTC';
    }
  } catch (error) {
    console.error("Error reading config for settlement:", error);
  }
  return 'BTC';
}

export interface SummaryRow {
  strategy_id: string;
  initial_budget: string;
  current_cash: string;
  equity: string;
  total_return_pct: string;
  drawdown_pct: string;
  high_water_mark: string;
  total_trades: string;
  puts_sold: string;
  calls_sold: string;
  assignments: string;
  options_expired_otm: string;
  total_premium_collected: string;
  total_realized_pnl: string;
  phase: string;
  active_option: string;
  active_future: string;
  win_rate_pct: string;
}

export function getSummaryData(): SummaryRow[] {
  try {
    const filePath = path.join(OUTPUT_DIR, 'summary.csv');
    if (!fs.existsSync(filePath)) return [];
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse<SummaryRow>(fileContent, { header: true, skipEmptyLines: true });
    return result.data;
  } catch (error) {
    console.error("Error reading summary data:", error);
    return [];
  }
}

export interface TradeRow {
  timestamp: string;
  action: string;
  symbol: string;
  strike: string;
  delta: string;
  dte: string;
  amount_btc: string;
  premium: string;
  pnl: string;
  btc_price: string;
  order_id: string;
  notes: string;
}

export function getTradesForStrategy(strategyId: string): TradeRow[] {
  try {
    const filePath = path.join(OUTPUT_DIR, `${strategyId}_trades.csv`);
    if (!fs.existsSync(filePath)) return [];
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse<TradeRow>(fileContent, { header: true, skipEmptyLines: true });
    return result.data;
  } catch (error) {
    console.error(`Error reading trades for ${strategyId}:`, error);
    return [];
  }
}

export interface CashflowRow {
  timestamp: string;
  action: string;
  premium: string;
  pnl: string;
  cash_after: string;
  equity_estimate: string;
  notes: string;
}

export function getCashflowForStrategy(strategyId: string): CashflowRow[] {
  try {
    const filePath = path.join(OUTPUT_DIR, `${strategyId}_cashflow.csv`);
    if (!fs.existsSync(filePath)) return [];
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse<CashflowRow>(fileContent, { header: true, skipEmptyLines: true });
    return result.data;
  } catch (error) {
    console.error(`Error reading cashflow for ${strategyId}:`, error);
    return [];
  }
}

export interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  traceback?: string;
}

export function getImportantLogs(): LogEntry[] {
  const logDir = '/shared/wheel/logs';
  if (!fs.existsSync(logDir)) return [];

  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
  // Sort files to get newest first
  files.sort((a, b) => b.localeCompare(a));

  const logs: LogEntry[] = [];
  const logRegex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[([A-Z]+)\] (\w+): (.*)$/;

  files.forEach(file => {
    const content = fs.readFileSync(path.join(logDir, file), 'utf8');
    const lines = content.split('\n');
    
    let currentLog: LogEntry | null = null;
    let isCapturingTraceback = false;

    for (const line of lines) {
      const match = line.match(logRegex);
      if (match) {
        // save previous
        if (currentLog && (currentLog.level === 'WARNING' || currentLog.level === 'ERROR')) {
          logs.push(currentLog);
        }
        
        currentLog = {
          timestamp: match[1],
          level: match[2],
          module: match[3],
          message: match[4],
          traceback: ''
        };
        isCapturingTraceback = currentLog.level === 'ERROR';
      } else if (isCapturingTraceback && currentLog && line.trim()) {
        currentLog.traceback += line + '\n';
      }
    }

    if (currentLog && (currentLog.level === 'WARNING' || currentLog.level === 'ERROR')) {
      logs.push(currentLog);
    }
  });

  // Sort logs by timestamp descending
  logs.sort((a, b) => new Date(b.timestamp.replace(',', '.')).getTime() - new Date(a.timestamp.replace(',', '.')).getTime());
  
  return logs;
}
