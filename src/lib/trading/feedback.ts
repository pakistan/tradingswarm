import type Database from 'better-sqlite3';

export interface SignalFeedback {
  signal_type: string;
  total: number;
  traded: number;
  passed: number;
  invalid: number;
  trade_rate: number;
  common_pass_reasons: string[];
  common_trade_contexts: string[];
}

export interface FeedbackSummary {
  total_signals_processed: number;
  by_type: Record<string, SignalFeedback>;
  top_traded_pairs: Array<{ title_a: string; title_b: string; count: number }>;
  top_passed_pairs: Array<{ title_a: string; title_b: string; reason: string }>;
  recommendations: string[];
}

export class FeedbackAnalyzer {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  analyze(): FeedbackSummary {
    const completed = this.db.prepare(
      `SELECT sq.*, a.title as title_a, a.platform as platform_a, b.title as title_b, b.platform as platform_b
       FROM signal_queue sq
       LEFT JOIN market_index a ON a.id = sq.market_a_id
       LEFT JOIN market_index b ON b.id = sq.market_b_id
       WHERE sq.status = 'completed'`
    ).all() as any[];

    const byType: Record<string, SignalFeedback> = {};
    const tradedPairs: Record<string, number> = {};
    const passedPairs: Array<{ title_a: string; title_b: string; reason: string }> = [];

    for (const signal of completed) {
      const type = signal.signal_type ?? 'unknown';
      if (!byType[type]) {
        byType[type] = { signal_type: type, total: 0, traded: 0, passed: 0, invalid: 0, trade_rate: 0, common_pass_reasons: [], common_trade_contexts: [] };
      }
      byType[type].total++;

      let result: Record<string, unknown> = {};
      try { result = JSON.parse(signal.result_json ?? '{}'); } catch { /* skip */ }

      const action = String(result.action ?? result.passed ? 'passed' : 'unknown');

      if (action === 'traded') {
        byType[type].traded++;
        const key = `${signal.title_a} <-> ${signal.title_b}`;
        tradedPairs[key] = (tradedPairs[key] ?? 0) + 1;
      } else if (action === 'passed' || result.passed) {
        byType[type].passed++;
        const reason = String(result.reason ?? '');
        if (reason) byType[type].common_pass_reasons.push(reason);
        passedPairs.push({ title_a: signal.title_a ?? '', title_b: signal.title_b ?? '', reason });
      } else {
        byType[type].invalid++;
      }
    }

    // Compute trade rates
    for (const type of Object.values(byType)) {
      type.trade_rate = type.total > 0 ? type.traded / type.total : 0;
      // Keep only unique pass reasons, top 5
      type.common_pass_reasons = [...new Set(type.common_pass_reasons)].slice(0, 5);
    }

    // Top traded pairs
    const topTraded = Object.entries(tradedPairs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pair, count]) => {
        const [title_a, title_b] = pair.split(' <-> ');
        return { title_a, title_b, count };
      });

    // Generate recommendations
    const recommendations: string[] = [];
    for (const [type, fb] of Object.entries(byType)) {
      if (fb.total >= 3 && fb.trade_rate === 0) {
        recommendations.push(`Stop generating "${type}" signals — 0% trade rate across ${fb.total} signals`);
      }
      if (fb.total >= 3 && fb.trade_rate > 0.5) {
        recommendations.push(`Increase "${type}" signals — ${(fb.trade_rate * 100).toFixed(0)}% trade rate`);
      }
    }
    if (passedPairs.length > 0) {
      const reasonCounts: Record<string, number> = {};
      for (const p of passedPairs) {
        if (p.reason) reasonCounts[p.reason] = (reasonCounts[p.reason] ?? 0) + 1;
      }
      const topReason = Object.entries(reasonCounts).sort(([, a], [, b]) => b - a)[0];
      if (topReason && topReason[1] >= 3) {
        recommendations.push(`Most common pass reason: "${topReason[0]}" (${topReason[1]} times)`);
      }
    }

    return {
      total_signals_processed: completed.length,
      by_type: byType,
      top_traded_pairs: topTraded,
      top_passed_pairs: passedPairs.slice(0, 10),
      recommendations,
    };
  }

  // Generate a context string for the LLM link generation prompt
  getLLMContext(): string {
    const summary = this.analyze();
    if (summary.total_signals_processed === 0) return '';

    const lines: string[] = [
      `\nLearning from ${summary.total_signals_processed} previously processed signals:`,
    ];

    if (summary.top_traded_pairs.length > 0) {
      lines.push('Signals that agents TRADED (these are good, find more like these):');
      for (const p of summary.top_traded_pairs) {
        lines.push(`  - ${p.title_a} <-> ${p.title_b} (traded ${p.count}x)`);
      }
    }

    if (summary.top_passed_pairs.length > 0) {
      lines.push('Signals that agents PASSED on (avoid generating similar ones):');
      for (const p of summary.top_passed_pairs.slice(0, 5)) {
        lines.push(`  - ${p.title_a} <-> ${p.title_b} (reason: ${p.reason})`);
      }
    }

    if (summary.recommendations.length > 0) {
      lines.push('Recommendations:');
      for (const r of summary.recommendations) {
        lines.push(`  - ${r}`);
      }
    }

    return lines.join('\n');
  }
}
