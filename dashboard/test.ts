import { getSummaryData, getTradesForStrategy } from './src/lib/data.ts';

const summary = getSummaryData();
console.log("Summary data count:", summary.length);
if(summary.length > 0) {
  console.log("Sample:", summary[0]);
}

const consTrades = getTradesForStrategy('conservative');
console.log("Conservative trades count:", consTrades.length);

const allTrades = summary.flatMap(s => getTradesForStrategy(s.strategy_id));
const winTrades = allTrades.filter(t => t.pnl && parseFloat(t.pnl) > 0);
const lossTrades = allTrades.filter(t => t.pnl && parseFloat(t.pnl) < 0);
console.log("Win trades:", winTrades.length, "Loss trades:", lossTrades.length);
