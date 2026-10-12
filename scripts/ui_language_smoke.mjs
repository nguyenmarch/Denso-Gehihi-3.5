import { chromium, expect } from '@playwright/test';

// Self-contained fixtures: no backend writes, Gemini requests or seeded database required.
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const now = '2026-10-12T03:00:00Z';
const actors = [
  { id: 'op', name: 'Điều phối ca A', role: 'operator' },
  { id: 'tech', name: 'Kỹ thuật viên 1', role: 'technician' },
  { id: 'expert', name: 'Chuyên gia bảo trì', role: 'expert' },
];
const incident = {
  id: 'test-incident', origin: 'synthetic', source: 'fault', scenario_id: null, event: null,
  asset: { id: 'EQ_OVEN_01', type: 'Equipment', name: 'Test oven' },
  incident_type: 'MACHINE_BREAKDOWN', severity: 1, alarm_at: now, state: 'alert',
  created_at: now, created_by: 'op', assignee: null, decision_note: null, next_step: null,
  reports: [], history: [],
};
let machineError = false;
await context.route('**/health', route => route.fulfill({ json: { status: 'ok', database: 'connected' } }));
await context.route('**/api/v1/**', route => {
  const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
  const fixtures = {
    '/demo/actors': actors, '/scenarios': [], '/incidents': [incident], '/lessons': [],
    '/graph/topology': { nodes: [{ id: 'EQ_OVEN_01', label: 'Equipment', properties: { name: 'Test oven' } }], edges: [] },
    '/graph/node/EQ_OVEN_01': { properties: { name: 'Test oven' }, relations: [] },
    '/incidents/test-incident/impact': { incident_id: incident.id, status: 'evaluated', rule: 'test', window: null, items: [] },
    '/incidents/test-incident/guidance': { match: null, gap: null, steps: [], lessons: [], containment: null },
    '/machines': [],
  };
  if (path === '/machines' && machineError) return route.fulfill({ status: 503, json: { detail: 'Graph store (Neo4j) không sẵn sàng.' } });
  if (!(path in fixtures)) throw new Error(`Unexpected API call: ${route.request().method()} ${path}`);
  return route.fulfill({ json: fixtures[path] });
});
const language = () => page.getByLabel('Ngôn ngữ / Language');
const nav = () => page.locator('.sidebar nav');
try {
  await page.goto(process.env.INAV_UI_BASE || 'http://localhost:5173');
  await expect(language()).toHaveValue('vi');
  await expect(page.locator('h1')).toHaveText('Điều phối sự cố');
  await page.locator('.order-card').click();
  await page.getByLabel('Quyết định / ghi chú').fill('Hỏng máy');
  await language().selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Incident coordination');
  await expect(page.getByLabel('Decision / notes')).toHaveValue('Hỏng máy');
  await expect(page.getByRole('tab', { name: /^Actions/ })).toBeVisible();
  await expect(page.locator('.connection-state .live-pill')).toHaveText('Synced');
  console.log('PASS: Live translation preserves the open incident and input verbatim');

  await nav().getByRole('button', { name: 'Graph & simulation', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Production graph: 1 nodes, 0 relationships' })).toBeVisible();
  await expect(page.locator('.graph-legend')).toContainText('Equipment');
  await expect(page.locator('.scenario-option').first()).toContainText('Machine breakdown');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await language().selectOption('vi');
  await expect(page.locator('h1')).toHaveText('Knowledge graph & mô phỏng');
  await expect(page.locator('.graph-legend')).toContainText('Thiết bị');
  await expect(page.locator('.scenario-option').first()).toContainText('Hỏng máy');
  console.log('PASS: Graph labels and simulation controls switch both ways');

  await page.getByLabel('Actor demo').selectOption('tech');
  await expect(nav().getByRole('button')).toHaveCount(1);
  await language().selectOption('en');
  await expect(page.locator('h1')).toHaveText('My tasks');
  await page.getByLabel('Actor demo').selectOption('expert');
  await nav().getByRole('button', { name: 'Lesson review', exact: true }).click();
  await expect(page.locator('.lesson-review')).toContainText('No lessons awaiting review.');
  await page.reload();
  await expect(language()).toHaveValue('en');
  await expect(page.locator('h1')).toHaveText('Lesson review');
  console.log('PASS: Role permissions and saved language survive reload');

  machineError = true;
  await nav().getByRole('button', { name: 'Machine monitoring', exact: true }).click();
  await expect(page.locator('.main-content .error-banner')).toContainText('Graph store (Neo4j) unavailable.');
  await language().selectOption('vi');
  await expect(page.locator('.main-content .error-banner')).toContainText('Graph store (Neo4j) không sẵn sàng.');
  console.log('PASS: An existing error message changes language without a new request');

  await page.setViewportSize({ width: 390, height: 900 });
  await language().selectOption('en');
  await expect(language()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: '/tmp/denso-language-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav().getByRole('button', { name: 'Incident records', exact: true }).click();
  await page.screenshot({ path: '/tmp/denso-language-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log('PASS: Mobile layout and no JavaScript exceptions');
} finally {
  await browser.close();
}
