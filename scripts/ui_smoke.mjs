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
const detail = page.getByRole('region', { name: 'Chi tiết sự cố' });
const actAs = name => page.getByLabel('Actor demo').selectOption({ label: name });
const openIncident = text => page.locator('.order-card', { hasText: text }).first().click();
const dispatchTo = async (technician, note) => {
  await detail.getByLabel('Người nhận').selectOption({ label: technician });
  await detail.getByLabel('Quyết định / ghi chú').fill(note);
  await detail.getByRole('button', { name: 'Giao việc' }).click();
  await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Đã giao việc');
};
const report = async (outcome, summary, nextStep) => {
  await detail.getByLabel('Kiểm tra 1', { exact: true }).fill('Đo thermocouple vùng 3');
  await detail.getByLabel('Kết quả kiểm tra 1').fill('Sai lệch 12°C');
  await detail.getByLabel(outcome).check();
  await detail.getByLabel('Tóm tắt').fill(summary);
  if (nextStep) await detail.getByLabel('Bước tiếp theo (bắt buộc)').fill(nextStep);
  await detail.getByRole('button', { name: 'Gửi báo cáo' }).click();
};
try {
  await page.goto(base);
  await check('Full topology from real API', async () => {
    const response = await context.request.get(`${api}/graph/topology`);
    expect(response.ok()).toBeTruthy();
    const graph = await response.json();
    await expect(page.getByRole('img', { name: `Graph chuỗi sản xuất: ${graph.nodes.length} node, ${graph.edges.length} quan hệ` })).toBeVisible();
  });
  await check('Live synthetic event visible', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Live'));
  await actAs('Điều phối ca A · Điều phối');

  await page.getByRole('button', { name: /Kích hoạt: Lệch nhiệt độ vùng gia nhiệt/ }).click();
  await check('Scenario trigger opens alert with event', async () => {
    await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Cảnh báo');
    await expect(detail).toContainText('Lệch nhiệt độ vùng gia nhiệt');
  });
  await check('Impact separates affected / unaffected / unknown with reasons', async () => {
    const item = id => detail.locator('.impact-item', { hasText: id });
    await expect(item('BATCH_2026_001')).toContainText('Bị ảnh hưởng');
    await expect(item('BATCH_2026_003')).toContainText('Không bị ảnh hưởng');
    await expect(item('BATCH_2026_003')).toContainText('CHK_OVEN_0730');
    await expect(item('BATCH_2026_004')).toContainText('Chưa rõ');
  });
  await check('Operator graph marks the faulting equipment', () => expect(page.locator('.result-banner')).toContainText('EQ_OVEN_01'));
  await page.screenshot({ path: `${shots}/01-operator-impact.png`, fullPage: true });
  await dispatchTo('Kỹ thuật viên 1', 'Giữ lô bị ảnh hưởng và chưa rõ, giao sửa lò');
  await check('Dispatch records decision and actor', async () => {
    await detail.getByText(/Lịch sử/).click();
    await expect(detail).toContainText('Điều phối ca A · Giao việc → Đã giao việc · Giữ lô bị ảnh hưởng');
  });

  await actAs('Kỹ thuật viên 2 · Kỹ thuật viên');
  await check('Other technician does not see the work order', async () => {
    await expect(page.locator('.workflow')).toContainText('Chưa có việc nào được giao cho bạn.');
    await expect(page.getByRole('img', { name: /Graph chuỗi sản xuất/ })).toHaveCount(0);
  });
  await actAs('Kỹ thuật viên 1 · Kỹ thuật viên');
  await check('Assignee reopens the same record', () => expect(detail).toContainText('Lệch nhiệt độ vùng gia nhiệt'));
  await detail.getByRole('button', { name: 'Nhận xử lý' }).click();
  await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Đang xử lý');
  await check('Guidance chosen for this equipment', async () => {
    await expect(detail.getByRole('heading', { name: 'Các bước xác định từ playbook' })).toBeVisible();
    await expect(detail).toContainText('playbook:EQ_OVEN_01/MACHINE_BREAKDOWN');
  });
  await expect(detail.locator('.narrative, .fallback')).toBeVisible({ timeout: 70000 });
  if (await detail.locator('.narrative').count()) await check('Live Gemini narrative label', () => expect(detail.locator('.narrative')).toContainText('Diễn đạt bởi Gemini'));
  else await check('Real fallback is explicit', () => expect(detail.locator('.fallback')).toContainText('Đang dùng hướng dẫn xác định từ knowledge base'));
  await detail.getByLabel('Câu hỏi').fill('Nên kiểm tra gì trước?');
  await detail.getByRole('button', { name: 'Hỏi' }).click();
  await check('Assistant answers or explains fallback', () => expect(detail.locator('.assistant-answer, .form-block .fallback')).toBeVisible({ timeout: 70000 }));
  await check('Containment remains a proposal', () => expect(detail.locator('.containment')).toContainText('Cần người phụ trách xem xét'));
  await page.screenshot({ path: `${shots}/02-technician-guidance.png`, fullPage: true });

  await detail.getByLabel('Chưa khắc phục').check();
  await check('Not-fixed report requires a next step', () => expect(detail.getByRole('button', { name: 'Gửi báo cáo' })).toBeDisabled());
  await report('Chưa khắc phục', 'Chờ thermocouple thay thế', 'Lắp thermocouple mới khi kho xác nhận');
  await check('Unresolved result keeps the next step', async () => {
    await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Chưa khắc phục');
    await expect(detail).toContainText('Lắp thermocouple mới khi kho xác nhận');
  });
  await page.reload();
  await check('Reload keeps actor, record and report', async () => {
    await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Chưa khắc phục');
    await expect(detail).toContainText('Chờ thermocouple thay thế');
  });

  await actAs('Điều phối ca A · Điều phối');
  await openIncident('Reflow Oven Alpha');
  await dispatchTo('Kỹ thuật viên 1', 'Đã có linh kiện, giao lại');
  await actAs('Kỹ thuật viên 1 · Kỹ thuật viên');
  await detail.getByRole('button', { name: 'Nhận xử lý' }).click();
  await report('Đã khắc phục', 'Đã thay thermocouple, profile đạt');
  await check('Fixed report resolves; batches still need verification', async () => {
    await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Đã khắc phục');
    await expect(detail.locator('.impact-item', { hasText: 'BATCH_2026_001' })).toContainText('sửa máy không tự giải phóng lô');
  });
  await detail.getByLabel('Bài học rút ra từ báo cáo').fill('Đo SSR vùng lỗi trước khi thay heater');
  await detail.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await check('Lesson proposal is pending', () => expect(detail).toContainText('đang chờ chuyên gia duyệt'));

  await actAs('Chuyên gia bảo trì · Chuyên gia');
  const review = page.getByRole('region', { name: 'Duyệt bài học' });
  await review.locator('.lesson-card').first().getByRole('button', { name: 'Chấp nhận' }).click();
  await check('Expert accepts lesson with source', () => expect(review).toContainText('Đã chấp nhận · Đo SSR vùng lỗi trước khi thay heater'));
  await page.screenshot({ path: `${shots}/03-expert-review.png`, fullPage: true });

  await actAs('Điều phối ca A · Điều phối');
  await page.getByLabel('NODE GỐC').selectOption('EQ_OVEN_01');
  await page.getByRole('button', { name: 'Gây lỗi ngay (synthetic)' }).click();
  await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Cảnh báo');
  await dispatchTo('Kỹ thuật viên 2', 'Lỗi lặp lại ở lò');
  await actAs('Kỹ thuật viên 2 · Kỹ thuật viên');
  await check('Accepted lesson reused for same equipment', () => expect(detail.locator('.guidance-panel')).toContainText('Đo SSR vùng lỗi trước khi thay heater'));

  await actAs('Điều phối ca A · Điều phối');
  await page.getByRole('button', { name: /Kích hoạt: Kẹt cơ cấu đóng gói/ }).click();
  await check('Packaging fault shows a knowledge gap, not oven steps', async () => {
    await expect(detail.locator('.guidance-panel')).toHaveCount(0);
    await dispatchTo('Kỹ thuật viên 2', 'Kiểm tra cơ cấu đóng gói');
    await expect(detail.locator('.guidance-panel')).toContainText('Chưa có hướng dẫn cho ngữ cảnh này');
    await expect(detail.locator('.guidance-panel')).not.toContainText('heater');
  });

  await context.setOffline(true);
  await check('Disconnected state visible', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Mất kết nối'));
  await check('Stale metrics warning visible', () => expect(page.locator('.connection-state')).toContainText('Không nhận plant_tick mới.', { timeout: 15000 }));
  await context.setOffline(false);
  await check('SSE reconnects naturally', () => expect(page.locator('.connection-state .live-pill')).toHaveText('Live', { timeout: 20000 }));

  // Rendering contract test only: does not claim a live Gemini call.
  await page.route('**/guidance/explain', async route => {
    const id = route.request().url().split('/incidents/')[1].split('/')[0];
    const view = await (await context.request.get(`${api}/incidents/${id}/guidance`, { headers: { 'X-Demo-Actor': 'op-01' } })).json();
    await route.fulfill({ json: { mode: 'llm', model: 'gemini-3.5-flash', steps: view.steps, failure_category: null, failure_reason: null,
      narrative: { summary: 'Kiểm chứng hiển thị narrative (provider response giả lập trong test).', citations: ['e1'],
        steps: Object.fromEntries(view.steps.map(step => [step.id, { text: step.text, citations: [step.id] }])) },
      evidence: [{ label: 'Synthetic test event', source: 'machine_event' }],
      safety: 'Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách.' } });
  });
  await actAs('Kỹ thuật viên 2 · Kỹ thuật viên');
  await openIncident('Reflow Oven Alpha');
  await check('Gemini success presentation (mocked response)', () => expect(detail.locator('.narrative')).toContainText('Diễn đạt bởi Gemini'));
  await page.unroute('**/guidance/explain');

  await actAs('Điều phối ca A · Điều phối');
  await page.getByRole('button', { name: 'Gây lỗi ngay (synthetic)' }).click();
  await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Cảnh báo');
  const keys = [];
  const dispatchRoute = '**/incidents/*/dispatch';
  await page.route(dispatchRoute, async route => {
    keys.push(route.request().headers()['idempotency-key']);
    await new Promise(resolve => setTimeout(resolve, 16000));
    await route.abort().catch(() => {});
  });
  await detail.getByLabel('Quyết định / ghi chú').fill('Kiểm tra timeout');
  await detail.getByRole('button', { name: 'Giao việc' }).click();
  await check('Timeout releases submit control and keeps the form', async () => {
    await expect(detail.locator('.error-banner')).toContainText('quá thời gian chờ', { timeout: 20000 });
    await expect(detail.getByRole('button', { name: 'Giao việc' })).toBeEnabled();
    await expect(detail.getByLabel('Quyết định / ghi chú')).toHaveValue('Kiểm tra timeout');
  });
  await page.unroute(dispatchRoute);
  await page.route(dispatchRoute, async route => { keys.push(route.request().headers()['idempotency-key']); await route.continue(); });
  await detail.getByRole('button', { name: 'Giao việc' }).click();
  await check('Command retry retains Idempotency-Key', async () => {
    await expect(detail.locator('.panel-heading .state-pill')).toHaveText('Đã giao việc');
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
