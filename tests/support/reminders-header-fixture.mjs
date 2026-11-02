import { expect } from '@playwright/test';
import { globalSearchFixture, SEARCH_WORKSPACE } from './global-search-fixture.mjs';
import { fictionalTemplateCloud } from './care-templates-cloud-fixture.mjs';

export async function headerFixture(page, { templates = false } = {}) {
  // The existing fictional server is needed only when the real template
  // library is opened. Patient/note/plan writers and readers remain unchanged.
  if (templates) await fictionalTemplateCloud().attach(page.context());
  const created = await globalSearchFixture(page);
  if (templates) await created.frame.evaluate(() => window.VildaSync.syncPush());
  return created;
}

export async function openReminders(page) {
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(SEARCH_WORKSPACE);
  await expect(workspace).toBeVisible();
  await workspace.evaluate(() => document.fonts.ready);
  return workspace;
}

export async function selectHeaderTab(workspace, tab) {
  const button = workspace.locator(`.vb22-tabs [data-tab="${tab}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

export async function headerGeometry(workspace) {
  return workspace.evaluate(root => {
    const outer = root.getBoundingClientRect(), result = {};
    const selectors = {
      title: '.vb22-head h2', eye: '.vb22-privacy-toggle', primary: '.vb22-primary-create',
      exit: '.vb22-exit', tabs: '.vb22-tabs', active: '[data-tab="active"]',
      plans: '[data-tab="plans"]', search: '[data-tab="search"]', count: '.vb22-tab-count',
    };
    for (const [name, selector] of Object.entries(selectors)) {
      const node = root.querySelector(selector);
      if (!node) throw Error('Missing real header control: ' + name);
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const privatePart = node.closest('.vb22-private-content[aria-hidden="true"]');
      const maskedByPrivacy = Boolean(privatePart?.inert);
      if (box.width <= 0 || box.height <= 0 || style.display === 'none' || style.visibility !== 'visible' && !maskedByPrivacy) {
        throw Error('Header control must remain visible: ' + name);
      }
      result[name] = { x: box.x - outer.x, y: box.y - outer.y, width: box.width, height: box.height };
    }
    return result;
  });
}

export async function expectHeaderGeometry(workspace, expected) {
  const actual = await headerGeometry(workspace);
  for (const name of Object.keys(expected)) for (const coordinate of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(actual[name][coordinate] - expected[name][coordinate]), `${name}.${coordinate} stays in its header slot`).toBeLessThanOrEqual(1);
  }
}

export async function expectNoOverflow(page, workspace) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await workspace.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
}

export async function expectCompactTodo(workspace) {
  const filters = workspace.locator('.vb22-filters'), buttons = filters.locator('button');
  await expect(buttons).toHaveCount(4);
  const metrics = await buttons.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(), count = node.querySelector('.vb22-count');
    return { x: box.x, y: box.y, height: box.height, countBorder: getComputedStyle(count).borderLeftWidth };
  }));
  expect(Math.abs(metrics[0].y - metrics[1].y)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics[2].y - metrics[3].y)).toBeLessThanOrEqual(1);
  expect(metrics[2].y).toBeGreaterThan(metrics[0].y);
  expect(metrics.every(metric => metric.height >= 44 && parseFloat(metric.countBorder) > 0)).toBe(true);
  await expect(workspace.locator('.vb22-list-tools .vb22-search')).toBeHidden();
}

export async function expectCompactPlans(workspace) {
  const panel = workspace.locator('.vcp-reminders-layout');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.vcp-search')).toBeHidden();
  await expect(panel.locator('.vcp-filters')).toBeHidden();
  const templates = panel.locator('.vcp-template-button');
  await expect(templates).toBeVisible();
  expect(await templates.evaluate(node => node.closest('.vcp-list').firstElementChild === node.closest('.vcp-template-entry'))).toBe(true);
  await expect(workspace.locator('.vb22-template-open')).toBeHidden();
  return panel;
}

export async function expectDirectNewPlan(page, workspace) {
  await workspace.locator('.vb22-primary-create').click();
  const dialog = page.locator('dialog.vcp-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Dodaj plan opieki', exact: true })).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Anuluj formularz planu', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// Delay only completion of an actual public read. This exposes the production
// loading state without supplying replacement records or copying a renderer.
export async function holdHeaderRead(page, method) {
  await page.evaluate(method => {
    const vault = window.VildaVault, original = vault[method];
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const gate = { entered: 0, release() { vault[method] = original; release(); } };
    vault[method] = function (...args) {
      gate.entered += 1;
      return Promise.resolve(original.apply(this, args)).then(value => wait.then(() => value));
    };
    window.__fictionalHeaderReadGate = gate;
  }, method);
}

export async function releaseHeaderRead(page) {
  await page.evaluate(() => { window.__fictionalHeaderReadGate.release(); delete window.__fictionalHeaderReadGate; });
}

export async function expectHeaderReadPending(page) {
  await expect.poll(() => page.evaluate(() => window.__fictionalHeaderReadGate?.entered || 0), {
    message: 'the real public vault read has reached the completion gate',
  }).toBeGreaterThan(0);
}

export async function addHeaderReminders(owner, patientId, count) {
  return owner.evaluate(async ({ patientId, count }) => {
    const ids = [];
    for (let index = 0; index < count; index++) ids.push((await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjne zadanie geometrii ' + crypto.randomUUID(), category: 'reminder-task',
      dueDateISO: '2026-10-28', body: 'Wyłącznie fikcyjne zadanie organizacyjne do testu nagłówka.',
    })).id);
    return ids;
  }, { patientId, count });
}

export async function nativePlaceholderStart(page, selector) {
  const session = await page.context().newCDPSession(page);
  try {
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    expect(nodeId, 'the real visible search input exists').toBeGreaterThan(0);
    const { node } = await session.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    const input = (await session.send('DOM.getBoxModel', { nodeId })).model;
    const texts = [];
    async function inspect(value) {
      if (value.nodeName === '#text' && value.nodeValue) {
        try {
          const box = (await session.send('DOM.getBoxModel', value.nodeId ? { nodeId: value.nodeId } : { backendNodeId: value.backendNodeId })).model;
          texts.push({ x: box.content[0], y: box.content[1] });
        } catch { /* Hidden internal text is not a painted placeholder. */ }
      }
      for (const child of [...(value.children || []), ...(value.shadowRoots || [])]) await inspect(child);
    }
    await inspect(node);
    expect(texts).toHaveLength(1);
    return { ...texts[0], inset: texts[0].x - input.border[0] };
  } finally { await session.detach(); }
}

export async function searchControlGeometry(search) {
  return search.locator('.vgs-query,.vgs-select').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    const context = document.createElement('canvas').getContext('2d'); context.font = style.font;
    const text = node.tagName === 'SELECT' ? node.selectedOptions[0].textContent : node.placeholder;
    return {
      tag: node.tagName, text, width: box.width, height: box.height, font: style.font,
      paddingLeft: style.paddingLeft, paddingRight: style.paddingRight,
      available: box.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      textWidth: context.measureText(text).width, position: style.backgroundPositionX,
      appearance: style.appearance, background: style.backgroundImage,
    };
  }));
}
