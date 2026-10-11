import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const index = process.argv.indexOf('--shots');
const shots = resolve(index >= 0 ? process.argv[index + 1] : '/tmp/inav-ui-shots');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.INAV_UI_BASE || 'http://localhost:5173';
const api = process.env.INAV_API_BASE || 'http://localhost:8000/api/v1';
let checks = 0;
const check = async (label, action) => { await action(); checks++; console.log(`PASS: ${label}`); };
try {
  await page.goto(base);
  await check('Full topology from real API', async () => {
    const response = await context.request.get(`${api}/graph/topology`);
    expect(response.ok()).toBeTruthy();
    const graph = await response.json();
    expect(graph.nodes.length).toBeGreaterThan(0);
    await expect(page.getByRole('img', { name: `Production chain topology graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges` })).toBeVisible();
  });
  await check('Live synthetic event visible', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Live'));
  await page.screenshot({ path: `${shots}/01-topology.png`, fullPage: true });
  await page.getByRole('button', { name: 'Gây lỗi ngay (synthetic)' }).click();
  const firstOrder = page.locator('.order-card').first();
  await check('Synthetic fault creates alert', () => expect(firstOrder).toContainText('Alert'));
  await firstOrder.getByRole('button', { name: 'Dispatch technician' }).click();
  await check('Dispatch command completes', () => expect(firstOrder).toContainText('dispatched'));
  await page.getByLabel('Vai trò demo').selectOption('technician');
  await page.locator('.order-card').first().getByRole('button', { name: 'Mở work order' }).click();
  await check('Deterministic steps always visible', () => expect(page.getByRole('heading', { name: 'Các bước xác định từ playbook' })).toBeVisible());
  await expect(page.locator('.narrative, .fallback')).toBeVisible({ timeout: 70000 });
  const liveNarrative = await page.locator('.narrative').count();
  if (liveNarrative) await check('Live Gemini narrative label', () => expect(page.locator('.narrative')).toContainText('Diễn đạt bởi Gemini'));
  else await check('Real fallback is explicit', () => expect(page.locator('.fallback')).toContainText('Đang dùng hướng dẫn xác định từ knowledge base'));
  await check('Technician screen hides raw graph', () => expect(page.getByRole('img', { name: /Production chain topology/ })).toHaveCount(0));
  await check('Containment remains a proposal', () => expect(page.locator('.containment')).toContainText('Cần người phụ trách xem xét'));
  await page.screenshot({ path: `${shots}/02-real-guidance.png`, fullPage: true });
  await page.getByRole('button', { name: 'Bắt đầu xử lý' }).click();
  await expect(page.locator('.work-order > h3')).toContainText('in_progress');
  await page.locator('.report-form textarea').fill('UI smoke synthetic report: kiểm tra theo playbook, đề xuất chờ review.');
  await page.getByRole('button', { name: 'Resolve incident' }).click();
  await check('Work order resolves with report', () => expect(page.locator('.work-order > h3')).toContainText('resolved'));
  await page.getByLabel('Vai trò demo').selectOption('expert');
  await page.getByRole('heading', { name: 'Expert · Knowledge inspector' }).waitFor();
  await page.locator('.expert-inspector select').selectOption({ index: 1 });
  await page.locator('.expert-inspector textarea').fill('Expert note recorded by UI smoke.');
  await page.getByRole('button', { name: 'Lưu field learning' }).click();
  await check('Expert learning history visible', () => expect(page.locator('.expert-inspector')).toContainText('Expert note recorded by UI smoke.'));
  await page.screenshot({ path: `${shots}/03-expert-history.png`, fullPage: true });
  await context.setOffline(true);
  await check('Disconnected state visible', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Mất kết nối'));
  await check('Stale metrics warning visible', () => expect(page.locator('.connection-state')).toContainText('Không nhận plant_tick mới.', { timeout: 15000 }));
  await context.setOffline(false);
  await check('SSE reconnects naturally', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Live', { timeout: 20000 }));

  // Rendering contract test only: does not claim a live Gemini call.
  await page.route('**/guidance/explain', async route => {
    const id = route.request().url().split('/incidents/')[1].split('/')[0];
    const order = await (await context.request.get(`${api}/incidents/${id}`)).json();
    await route.fulfill({ json: { mode: 'llm', model: 'gemini-3.5-flash', steps: order.steps,
      narrative: { summary: 'Kiểm chứng hiển thị narrative (provider response giả lập trong test).', citations: ['e1'],
        steps: Object.fromEntries(order.steps.map(step => [step.id, { text: step.text, citations: [step.id] }])) },
      evidence: [{ label: 'Synthetic test event', source: 'machine_event' }],
      safety: 'Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.' } });
  });
  await page.getByLabel('Vai trò demo').selectOption('technician');
  await page.locator('.order-card').first().getByRole('button', { name: 'Mở work order' }).click();
  await check('Gemini success presentation (mocked response)', () => expect(page.locator('.narrative')).toContainText('Diễn đạt bởi Gemini'));
  await page.screenshot({ path: `${shots}/04-mocked-narrative-contract.png`, fullPage: true });
  await page.unroute('**/guidance/explain');
  await page.getByLabel('Vai trò demo').selectOption('operator');
  await page.getByRole('button', { name: 'Gây lỗi ngay (synthetic)' }).click();
  await expect(page.locator('.order-card').first()).toContainText('Alert');
  const keys = [];
  const dispatchRoute = '**/incidents/*/dispatch';
  await page.route(dispatchRoute, async route => {
    keys.push(route.request().headers()['idempotency-key']);
    await new Promise(resolve => setTimeout(resolve, 16000));
    await route.abort().catch(() => {});
  });
  await page.locator('.order-card').first().getByRole('button', { name: 'Dispatch technician' }).click();
  await check('Timeout releases submit control', async () => {
    await expect(page.locator('.workflow .error-banner')).toContainText('quá thời gian chờ', { timeout: 20000 });
    await expect(page.locator('.order-card').first().getByRole('button', { name: 'Dispatch technician' })).toBeEnabled();
  });
  await page.unroute(dispatchRoute);
  await page.route(dispatchRoute, async route => { keys.push(route.request().headers()['idempotency-key']); await route.continue(); });
  await page.locator('.order-card').first().getByRole('button', { name: 'Dispatch technician' }).click();
  await check('Command retry retains Idempotency-Key', async () => {
    await expect(page.locator('.order-card').first()).toContainText('dispatched');
    expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
  });
  await page.unroute(dispatchRoute);
  await page.route('**/events', route => route.abort());
  await page.reload();
  await check('Native SSE retry state visible', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Đang kết nối lại', { timeout: 10000 }));
  await page.unroute('**/events');
  await check('Native SSE retry recovers', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Live', { timeout: 20000 }));
  await check('No blank page or JS exception', async () => { expect(errors).toEqual([]); await expect(page.locator('main')).toBeVisible(); });
  console.log(`${checks} UI checks passed. Screenshots: ${shots}`);
} finally { await browser.close(); }
