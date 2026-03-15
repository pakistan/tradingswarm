import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const BASE_URLS: Record<string, string> = {
  moonshot: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com',
};

export async function POST(request: Request) {
  try {
    const { provider_name, api_key, model } = await request.json();

    if (!api_key || !provider_name) {
      return NextResponse.json({ error: 'api_key and provider_name are required' }, { status: 400 });
    }

    const testModel = model || getDefaultTestModel(provider_name);

    if (provider_name === 'anthropic') {
      const client = new Anthropic({ apiKey: api_key });
      const res = await client.messages.create({
        model: testModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      const text = res.content.map(b => b.type === 'text' ? b.text : '').join('');
      return NextResponse.json({ ok: true, response: text });
    }

    if (provider_name === 'google') {
      // Google Gemini uses OpenAI-compatible endpoint
      const client = new OpenAI({
        apiKey: api_key,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
      const res = await client.chat.completions.create({
        model: testModel,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 10,
      });
      return NextResponse.json({ ok: true, response: res.choices[0]?.message?.content ?? '' });
    }

    // OpenAI-compatible providers (moonshot, deepseek, etc.)
    const baseURL = BASE_URLS[provider_name];
    const client = new OpenAI({
      apiKey: api_key,
      ...(baseURL ? { baseURL } : {}),
    });
    const res = await client.chat.completions.create({
      model: testModel,
      messages: [{ role: 'user', content: 'Say "ok"' }],
      max_tokens: 10,
    });
    return NextResponse.json({ ok: true, response: res.choices[0]?.message?.content ?? '' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

function getDefaultTestModel(provider: string): string {
  const defaults: Record<string, string> = {
    anthropic: 'claude-haiku-3-20250414',
    moonshot: 'kimi-k2',
    deepseek: 'deepseek-chat',
    google: 'gemini-2.0-flash',
  };
  return defaults[provider] ?? 'gpt-3.5-turbo';
}
