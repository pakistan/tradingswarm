const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

export class ForexAPI {
  async getLatest(base = 'USD', symbols = 'EUR,GBP,JPY,CNY,RUB,MXN,BRL'): Promise<Record<string, number>> {
    const res = await fetch(`${FRANKFURTER_BASE}/latest?base=${base}&symbols=${symbols}`);
    if (!res.ok) throw new Error(`Forex API error ${res.status}`);
    const d = await res.json() as { rates: Record<string, number> };
    return d.rates ?? {};
  }
}
