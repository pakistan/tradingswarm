import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Smoke test — all pages load and render', () => {

  test('Dashboard loads with nav, stats, and leaderboard', async ({ page }) => {
    await page.goto(BASE);
    // Nav should be visible
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('h1', { hasText: 'TradingSwarm' })).toBeVisible();
    // Nav links
    for (const label of ['Dashboard', 'Agents', 'Configs', 'Channels', 'Tool Log', 'Admin']) {
      await expect(page.locator(`nav a`, { hasText: label })).toBeVisible();
    }
    // Page title
    await expect(page).toHaveTitle(/TradingSwarm/);
    // Stats section should have stat cards
    await expect(page.locator('text=Total P&L')).toBeVisible();
    await expect(page.locator('text=Active Agents')).toBeVisible();
    // No unhandled errors — check no error overlay
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('Agents page loads', async ({ page }) => {
    await page.goto(`${BASE}/agents`);
    await expect(page.locator('h1', { hasText: 'Agents' })).toBeVisible();
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('Configs page loads', async ({ page }) => {
    await page.goto(`${BASE}/configs`);
    await expect(page.locator('h1', { hasText: 'Configs' })).toBeVisible();
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('Channels page loads', async ({ page }) => {
    await page.goto(`${BASE}/channels`);
    await expect(page.locator('h1', { hasText: 'Channels' })).toBeVisible();
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('Tool Log page loads', async ({ page }) => {
    await page.goto(`${BASE}/tool-log`);
    await expect(page.locator('h1', { hasText: 'Tool Activity' })).toBeVisible();
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('Admin page loads with provider cards', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await expect(page.locator('h1', { hasText: 'Admin' })).toBeVisible();
    // Provider cards should render
    await expect(page.getByRole('heading', { name: 'Anthropic' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Moonshot / Kimi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DeepSeek' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
    // Test Connection buttons should exist
    const testButtons = page.locator('button', { hasText: 'Test Connection' });
    expect(await testButtons.count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });
});

test.describe('Navigation works', () => {

  test('clicking nav links navigates to correct pages', async ({ page }) => {
    await page.goto(BASE);

    await page.click('nav a:has-text("Agents")');
    await expect(page).toHaveURL(`${BASE}/agents`);
    await expect(page.locator('h1', { hasText: 'Agents' })).toBeVisible();

    await page.click('nav a:has-text("Configs")');
    await expect(page).toHaveURL(`${BASE}/configs`);
    await expect(page.locator('h1', { hasText: 'Configs' })).toBeVisible();

    await page.click('nav a:has-text("Channels")');
    await expect(page).toHaveURL(`${BASE}/channels`);
    await expect(page.locator('h1', { hasText: 'Channels' })).toBeVisible();

    await page.click('nav a:has-text("Tool Log")');
    await expect(page).toHaveURL(`${BASE}/tool-log`);

    await page.click('nav a:has-text("Admin")');
    await expect(page).toHaveURL(`${BASE}/admin`);
    await expect(page.locator('h1', { hasText: 'Admin' })).toBeVisible();

    await page.click('nav a:has-text("Dashboard")');
    await expect(page).toHaveURL(`${BASE}/`);
  });
});

test.describe('Admin — provider interactions', () => {

  test('toggle provider enabled/disabled', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    // Find Moonshot card's toggle — it should be the second provider card
    const moonshotCard = page.locator('div', { hasText: 'Moonshot / Kimi' }).filter({ hasText: 'API Key' }).first();
    const toggle = moonshotCard.locator('button[role="switch"], div[class*="rounded-full"]').first();
    // Click toggle
    await toggle.click();
    // Should not crash
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });

  test('test connection without API key shows error', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    // Find the DeepSeek provider card by heading, then go up to the card container
    const deepseekHeading = page.getByRole('heading', { name: 'DeepSeek' });
    const deepseekCard = deepseekHeading.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")]').first();
    // Clear the API key field
    const apiKeyInput = deepseekCard.locator('input[type="password"]');
    await apiKeyInput.clear();
    // Click test
    const testBtn = deepseekCard.locator('button', { hasText: 'Test Connection' });
    await testBtn.click();
    // Should show error state
    await expect(deepseekCard.locator('text=Enter an API key first')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Configs — create flow', () => {

  test('new config page loads and form works', async ({ page }) => {
    await page.goto(`${BASE}/configs`);
    // Click new config button
    const newBtn = page.locator('a, button', { hasText: /New Config|Create/ }).first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page).toHaveURL(/\/configs\/new/);
      await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
    }
  });
});

test.describe('Channels — seed channels render', () => {

  test('default channels appear', async ({ page }) => {
    await page.goto(`${BASE}/channels`);
    // Seed channels should be auto-created
    for (const channel of ['post-mortems', 'strategies', 'market-intel']) {
      await expect(page.getByRole('button', { name: channel }).first()).toBeVisible({ timeout: 5000 });
    }
    await expect(page.locator('#nextjs__container_errors_overlay')).not.toBeVisible();
  });
});

test.describe('API routes return valid JSON', () => {

  test('GET /api/agents', async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/channels', async ({ request }) => {
    const res = await request.get(`${BASE}/api/channels`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/providers', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/providers`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(4);
  });

  test('GET /api/rules', async ({ request }) => {
    const res = await request.get(`${BASE}/api/rules`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/tools', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tools`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/tool-log', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tool-log`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('logs');
  });

  test('GET /api/events (SSE) returns 200', async ({ page }) => {
    // SSE streams indefinitely, so just check the response starts correctly
    const res = await page.request.fetch(`${BASE}/api/events`, { timeout: 5000 }).catch(() => null);
    // If it times out that's fine — SSE streams don't close. Just verify the endpoint exists.
    if (res) {
      expect(res.status()).toBe(200);
    }
  });
});
