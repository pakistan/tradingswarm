const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export class FredAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getObservations(seriesId: string, limit = 10): Promise<Array<{ date: string; value: string }>> {
    if (!this.apiKey) throw new Error('FRED API key not configured');
    const res = await fetch(
      `${FRED_BASE}?series_id=${seriesId.toUpperCase()}&api_key=${this.apiKey}&file_type=json&sort_order=desc&limit=${Math.min(limit, 50)}`
    );
    if (!res.ok) throw new Error(`FRED error ${res.status}`);
    const d = await res.json() as { observations?: Array<{ date: string; value: string }> };
    return d.observations ?? [];
  }
}
