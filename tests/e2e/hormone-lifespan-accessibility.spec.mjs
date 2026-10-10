import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const context = {
  analyte: 'lh', sex: 'male', ageYears: 14, preterm: 'no',
  sourceStatus: 'ready', identityKey: 'fictional-chart-accessibility',
};
const palette = {
  lh: '#7842b0', fsh: '#a77905', e2: '#b84d85', t: '#00838d',
  amh: '#ce6049', inhb: '#34865c', insl3: '#347fa5',
};
const panel = page => page.locator('.vilda-hormone-lifespan');

async function openComponent(page, width = 1360) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/__test-hormone-accessibility', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-accessibility', { waitUntil: 'load' });
  await page.evaluate(context => {
    window.accessibilityChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.accessibilityChart.update(context);
  }, context);
  await expect(panel(page)).toBeVisible();
}

// Reach controls through native keyboard navigation, without programmatic
// focus/click: aria-pressed and focus visibility must work for keyboard users.
async function tabTo(page, target) {
  for (let i = 0; i < 60; i += 1) {
    if (await target.evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function contrastOf(button) {
  return button.evaluate(node => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgba = color => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
    };
    const over = (fg, bg, opacity = 1) => fg.slice(0, 3).map((v, i) => v * fg[3] * opacity + bg[i] * (1 - fg[3] * opacity));
    const ancestors = [];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestors.unshift(parent);
    let background = [255, 255, 255];
    let ancestorOpacity = 1;
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      background = over(rgba(style.backgroundColor), background, Number(style.opacity));
      ancestorOpacity *= Number(style.opacity);
    }
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity) * ancestorOpacity;
    background = over(rgba(style.backgroundColor), background, opacity);
    const foreground = over(rgba(style.color), background, opacity);
    const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    const swatch = node.querySelector('.vhl-swatch');
    return {
      label: node.textContent.trim(), pressed: node.getAttribute('aria-pressed'), opacity,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      swatch: swatch ? rgba(getComputedStyle(swatch).getPropertyValue('--c')).slice(0, 3) : null,
      outline: { style: style.outlineStyle, width: parseFloat(style.outlineWidth) },
    };
  });
}

async function expectReadable(button) {
  const measured = await contrastOf(button);
  expect(measured.ratio, `${measured.label} pressed=${measured.pressed}: ${measured.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  return measured;
}

for (const width of [1360, 320]) {
  test(`all hormone labels retain contrast and keyboard access in both selection states at ${width}px`, async ({ page }) => {
    await openComponent(page, width);
    for (const sex of ['male', 'female']) {
      await page.evaluate(context => window.accessibilityChart.update(context), { ...context, sex });
      const ids = await panel(page).locator('[data-hormone]').evaluateAll(buttons => buttons.map(button => button.dataset.hormone));
      expect(ids).toHaveLength(sex === 'male' ? 6 : 5);
      for (const id of ids) {
        const button = panel(page).locator(`[data-hormone="${id}"]`);
        await tabTo(page, button);
        for (let state = 0; state < 2; state += 1) {
          const measured = await expectReadable(button);
          expect(measured.opacity).toBe(1);
          expect(measured.outline.style).toBe('solid');
          expect(measured.outline.width).toBeGreaterThanOrEqual(2);
          expect(measured.swatch).toEqual(palette[id].slice(1).match(/../g).map(value => parseInt(value, 16)));
          await page.keyboard.press(state === 0 ? 'Space' : 'Enter');
          await expect(button).toHaveAttribute('aria-pressed', measured.pressed === 'true' ? 'false' : 'true');
          await expect(button).toBeFocused();
        }
      }
      // The surrounding view/fullscreen/sex-comparison controls are part of
      // the same visual surface and must stay readable as well.
      for (const button of await panel(page).locator('button:visible').all()) await expectReadable(button);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  });
}

test('reduced motion disables control and curve transitions, including fullscreen', async ({ page }) => {
  await openComponent(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const lh = panel(page).locator('[data-hormone="lh"]');
  expect(await lh.evaluate(node => getComputedStyle(node).transitionDuration)).toContain('0.15s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expectMotionOff = async () => {
    const styles = await panel(page).locator('button, .vhl-curve').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      return { transition: style.transitionDuration, animation: style.animationDuration };
    }));
    expect(styles.length).toBeGreaterThan(10);
    for (const style of styles) expect(style).toEqual({ transition: '0s', animation: '0s' });
  };
  await expectMotionOff();
  await tabTo(page, panel(page).getByRole('button', { name: 'Powiększ', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectMotionOff();
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('button', { name: 'Powiększ', exact: true })).toBeFocused();
});

test('resizing the chart preserves keyboard focus on an expanded source link', async ({ page }) => {
  await openComponent(page);
  const summary = panel(page).locator('.vhl-sources > summary');
  await tabTo(page, summary);
  await page.keyboard.press('Enter');
  const source = panel(page).locator('.vhl-source-links a').first();
  await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
  const chart = panel(page).locator('[data-lifespan="chart"]');
  const before = await chart.getAttribute('viewBox');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart).not.toHaveAttribute('viewBox', before);
  await expect(source).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel(page).locator('.vhl-source-links a').nth(1)).toBeFocused();
});
