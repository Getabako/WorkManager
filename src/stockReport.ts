// === 株式分析レポート生成 ===

import yahooFinance from 'yahoo-finance2';
import dotenv from 'dotenv';
import type { StockData, StockReport } from './types.js';

dotenv.config();

/** 対象銘柄リスト（.envから、またはデフォルト） */
const DEFAULT_SYMBOLS = ['NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AMD', 'SMCI', 'ARM', 'PLTR', 'TSM'];

function getSymbols(): string[] {
  const env = process.env.STOCK_SYMBOLS;
  if (env) return env.split(',').map(s => s.trim());
  return DEFAULT_SYMBOLS;
}

/** 1銘柄の株価データを取得 */
async function fetchStockData(symbol: string): Promise<StockData | null> {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote || !quote.regularMarketPrice) return null;

    const price = quote.regularMarketPrice;
    const prevClose = quote.regularMarketPreviousClose || price;
    const changePercent = ((price - prevClose) / prevClose) * 100;

    // 週間トレンド: 簡易判定（前日比で代替、将来的にはヒストリカルデータ使用）
    let weeklyTrend: 'up' | 'down' | 'flat' = 'flat';
    if (changePercent > 1) weeklyTrend = 'up';
    else if (changePercent < -1) weeklyTrend = 'down';

    return {
      symbol,
      name: quote.shortName || quote.longName || symbol,
      price,
      previousClose: prevClose,
      changePercent: Math.round(changePercent * 100) / 100,
      weeklyTrend,
      volume: quote.regularMarketVolume || 0,
    };
  } catch (error) {
    console.error(`⚠️ ${symbol} のデータ取得に失敗:`, error);
    return null;
  }
}

/** 全銘柄のデータを取得 */
async function fetchAllStocks(): Promise<StockData[]> {
  const symbols = getSymbols();
  const results = await Promise.allSettled(symbols.map(fetchStockData));
  return results
    .filter((r): r is PromiseFulfilledResult<StockData | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((d): d is StockData => d !== null);
}

/** 変動率の絵文字 */
function changeEmoji(pct: number): string {
  if (pct >= 3) return '🚀';
  if (pct >= 1) return '📈';
  if (pct > -1) return '➡️';
  if (pct > -3) return '📉';
  return '💥';
}

/** Markdownレポートを生成 */
function generateMarkdown(stocks: StockData[], isMonday: boolean): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  let md = `# 📊 AI銘柄 日次レポート\n`;
  md += `**${dateStr}**\n\n`;

  // サマリー
  const gainers = stocks.filter(s => s.changePercent > 0).length;
  const losers = stocks.filter(s => s.changePercent < 0).length;
  md += `**概況:** ${gainers}銘柄上昇 / ${losers}銘柄下落\n\n`;

  // 銘柄別
  md += `## 📋 銘柄別パフォーマンス\n\n`;
  for (const stock of stocks.sort((a, b) => b.changePercent - a.changePercent)) {
    const sign = stock.changePercent >= 0 ? '+' : '';
    md += `${changeEmoji(stock.changePercent)} **${stock.symbol}** (${stock.name})\n`;
    md += `  💵 $${stock.price.toFixed(2)} | ${sign}${stock.changePercent}%\n`;
    md += `  📊 出来高: ${(stock.volume / 1_000_000).toFixed(1)}M\n\n`;
  }

  // 注目ポイント
  const topGainer = stocks.reduce((a, b) => a.changePercent > b.changePercent ? a : b);
  const topLoser = stocks.reduce((a, b) => a.changePercent < b.changePercent ? a : b);

  md += `## 🔍 注目ポイント\n`;
  md += `- **最大上昇:** ${topGainer.symbol} (+${topGainer.changePercent}%)\n`;
  md += `- **最大下落:** ${topLoser.symbol} (${topLoser.changePercent}%)\n\n`;

  // 月曜: 売買判断サマリー
  if (isMonday) {
    md += `## 💰 週間売買判断\n`;
    md += `> ⚠️ 以下はデータに基づく参考情報です。最終判断は翔太さんが行ってください。\n\n`;
    for (const stock of stocks) {
      let signal = '様子見';
      if (stock.changePercent > 3) signal = '🟢 利確検討';
      else if (stock.changePercent > 1) signal = '🟢 ホールド';
      else if (stock.changePercent < -3) signal = '🔴 押し目買い検討';
      else if (stock.changePercent < -1) signal = '🟡 注意';
      md += `- **${stock.symbol}:** ${signal}\n`;
    }
    md += `\n> 大和証券での注文をお忘れなく！\n`;
  }

  return md;
}

/** 株式レポートを生成 */
export async function generateStockReport(): Promise<StockReport> {
  const now = new Date();
  const isMonday = now.getDay() === 1;
  const stocks = await fetchAllStocks();
  const markdown = generateMarkdown(stocks, isMonday);

  return {
    date: now,
    stocks,
    markdown,
    tradingSummary: isMonday ? markdown : undefined,
  };
}

// 直接実行時
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('📊 株式分析レポートを生成中...\n');

  try {
    const report = await generateStockReport();
    console.log(report.markdown);
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}
