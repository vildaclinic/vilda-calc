import { expect } from '@playwright/test';
import { otworzBadania, otworzSejf, sekcjaBadan } from './lab-historia-dane.mjs';
import { createKlirensSearchEnvironment } from './klirens-search-all-formulas.mjs';

const DATES = ['2026-02-25', '2026-04-08', '2026-06-02'];

function records(patientId) {
  const notes = [];
  for (const [key, name, unit, values] of [
    ['lh', 'LH (hormon luteinizujący)', 'IU/L', [0, 0]],
    ['fsh', 'FSH (hormon folikulotropowy)', 'IU/L', [0, 0.2]],
    ['tsh', 'TSH (tyreotropina)', 'mIU/L', [0, 40, 1000]],
  ]) {
    values.forEach((value, index) => notes.push({ key: `${key}-${index}`, source: 'lab', value,
      payload: { patientId, category: 'wynik-badania', title: `Fikcyjny punkt ${key}-${index}`, body: '', clinicalDateISO: DATES[index],
        labResult: { test: name, testKey: key, value: String(value), valueNum: value, unit } } }));
  }
  const first = notes[0];
  notes.push({ ...first, key: 'lh-duplicate', payload: { ...first.payload, title: 'Fikcyjny drugi zapis LH z tego samego dnia' } });
  const root = createKlirensSearchEnvironment();
  const parameter = root.ClcrSavedResults.getParam('AGu_spot');
  [-12, 0, 8].forEach((value, index) => {
    const result = root.VildaClcrUag.evaluate({ urineSodium: '40', urinePotassium: '30', urineChloride: String(70 - value) }, root.VildaClcrUagReferenceData.DEFAULT_POLICY);
    const point = { ...parameter, parameterKey: parameter.id, valueNum: result.rawValue };
    root.ClcrUagPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-uag-snapshot' ? JSON.stringify(result) : null }, point);
    const payload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId, clinicalDateISO: DATES[index] });
    const projection = root.ClcrSavedResults.projectPatientNotes([{ ...payload, id: 'fictional-check-' + index }], { patientId });
    expect(projection.measurements[0]?.valueNum).toBe(value);
    expect(projection.measurements[0]?.status).toBe('recorded');
    notes.push({ key: 'uag-' + index, source: 'clcr', value, display: projection.measurements[0].displayValue, payload });
  });
  return notes;
}

async function savedNotes(page, patientId) {
  return page.evaluate(async id => {
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    return JSON.stringify(notes.slice().sort((a, b) => a.id.localeCompare(b.id)));
  }, patientId);
}

async function measure(section) {
  return section.evaluate(host => {
    const screenPoint = (node, x, y) => new DOMPoint(x, y).matrixTransform(node.getScreenCTM());
    return [...host.querySelectorAll('.vilda-lab-result-chart-point')].map(control => {
      const chart = control.closest('.vilda-lab-result-chart');
      const card = control.closest('.vilda-lab-hist-card');
      const target = control.getBoundingClientRect();
      const dot = control.querySelector('.vilda-lab-result-chart-dot').getBoundingClientRect();
      const id = control.getAttribute('data-note-id');
      const date = control.getAttribute('data-date');
      const guides = [...chart.querySelectorAll('.vilda-lab-result-chart-guide')].filter(guide => id
        ? guide.getAttribute('data-note-id') === id : guide.getAttribute('data-date') === date);
      const starts = guides.map(guide => screenPoint(guide, guide.x1.baseVal.value, guide.y1.baseVal.value));
      const grid = [...chart.querySelectorAll('.vilda-lab-result-chart-grid line')];
      const zeroLine = card.getAttribute('data-source') === 'lab' ? grid[grid.length - 1] : null;
      const zero = zeroLine && screenPoint(zeroLine, zeroLine.x1.baseVal.value, zeroLine.y1.baseVal.value);
      const badge = control.querySelector('.vilda-lab-result-chart-count')?.getBoundingClientRect();
      return { id, date, value: Number(control.getAttribute('data-value')), count: Number(control.getAttribute('data-count') || 1),
        series: card.getAttribute('data-series'), source: card.getAttribute('data-source'),
        targetWidth: target.width, targetHeight: target.height,
        dotX: dot.left + dot.width / 2, dotY: dot.top + dot.height / 2,
        targetX: target.left + target.width / 2, targetY: target.top + target.height / 2,
        starts: starts.map(point => ({ x: point.x, y: point.y })), zeroY: zero?.y ?? null,
        badgeInside: !badge || badge.width > 0 && badge.height > 0 && badge.left >= target.left && badge.right <= target.right
          && badge.top >= target.top && badge.bottom <= target.bottom };
    });
  });
}

function verifyCoordinates(rows, observations) {
  expect(rows).toHaveLength(observations.length - 1); // two original LH notes share one coordinate
  expect(rows.find(row => row.count === 2)).toMatchObject({ series: 'lh', value: 0, count: 2 });
  for (const row of rows) {
    const context = JSON.stringify(row);
    expect(row.targetWidth, context).toBeGreaterThanOrEqual(44);
    expect(row.targetHeight, context).toBeGreaterThanOrEqual(44);
    expect(row.badgeInside, context + ' duplicate counter stays inside its touch target').toBe(true);
    expect(row.starts, context).toHaveLength(row.count);
    for (const start of row.starts) {
      expect(Math.abs(row.dotX - start.x), context + ' actual dot X').toBeLessThanOrEqual(1);
      expect(Math.abs(row.dotY - start.y), context + ' actual dot Y').toBeLessThanOrEqual(1);
      expect(Math.abs(row.targetX - start.x), context + ' target X').toBeLessThanOrEqual(1);
      expect(Math.abs(row.targetY - start.y), context + ' target Y').toBeLessThanOrEqual(1);
    }
    if (row.source === 'lab' && row.value === 0) {
      expect(row.zeroY, context).not.toBeNull();
      expect(Math.abs(row.dotY - row.zeroY), context + ' zero grid line').toBeLessThanOrEqual(1);
    }
  }
  const renal = rows.filter(row => row.source === 'clcr').sort((a, b) => a.value - b.value);
  expect(renal.map(row => row.value)).toEqual([-12, 0, 8]);
  expect(renal[0].dotY).toBeGreaterThan(renal[1].dotY);
  expect(renal[1].dotY).toBeGreaterThan(renal[2].dotY);
}

async function verifyPaintedPoints(page, section) {
  for (const chart of await section.locator('.vilda-lab-result-chart').all()) {
    // WebKit can report correct foreignObject/HTML rectangles while painting
    // their contents elsewhere. Check the actual pixels as well as DOM geometry.
    const png = await chart.screenshot({ scale: 'css', animations: 'disabled' });
    const expected = await chart.evaluate(host => {
      const bounds = host.getBoundingClientRect();
      return [...host.querySelectorAll('.vilda-lab-result-chart-point')].map(control => {
        const id = control.getAttribute('data-note-id'), date = control.getAttribute('data-date');
        const guide = [...host.querySelectorAll('.vilda-lab-result-chart-guide')].find(node => id
          ? node.getAttribute('data-note-id') === id : node.getAttribute('data-date') === date);
        const point = new DOMPoint(guide.x1.baseVal.value, guide.y1.baseVal.value).matrixTransform(guide.getScreenCTM());
        const fill = getComputedStyle(control.querySelector('.vilda-lab-result-chart-dot')).backgroundColor;
        return { id: id || 'shared-' + date, x: point.x - bounds.left, y: point.y - bounds.top,
          rgb: fill.match(/[\d.]+/g).slice(0, 3).map(Number), bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
      });
    });
    const painted = await page.evaluate(async ({ encoded, expected }) => {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      bitmap.close();
      return expected.map(point => {
        let count = 0, sumX = 0, sumY = 0;
        for (let y = Math.max(0, Math.floor(point.y - 7)); y <= Math.min(canvas.height - 1, Math.ceil(point.y + 7)); y++) {
          for (let x = Math.max(0, Math.floor(point.x - 7)); x <= Math.min(canvas.width - 1, Math.ceil(point.x + 7)); x++) {
            const offset = (y * canvas.width + x) * 4;
            if (pixels[offset + 3] === 255 && point.rgb.every((value, channel) => Math.abs(pixels[offset + channel] - value) <= 5)) {
              count++; sumX += x + 0.5; sumY += y + 0.5;
            }
          }
        }
        return { ...point, count, paintedX: count ? sumX / count : null, paintedY: count ? sumY / count : null };
      });
    }, { encoded: png.toString('base64'), expected });
    for (const point of painted) {
      const context = JSON.stringify(point);
      expect(point.count, context + ' visible filled dot at the data coordinate').toBeGreaterThanOrEqual(30);
      // CSS-sized screenshots round fractional crops and nested SVG painting
      // to pixels; DOM geometry remains checked to 1 px separately above.
      expect(Math.abs(point.paintedX - point.x), context + ' painted center X').toBeLessThanOrEqual(2);
      expect(Math.abs(point.paintedY - point.y), context + ' painted center Y').toBeLessThanOrEqual(2);
    }
  }
}

export async function verifyLabChartGeometry(page, width, height) {
  await page.setViewportSize({ width, height });
  const patientId = await otworzSejf(page);
  const observations = records(patientId);
  const ids = await page.evaluate(async observations => {
    const ids = {};
    for (const observation of observations) ids[observation.key] = (await window.VildaVault.savePatientNote(observation.payload)).id;
    return ids;
  }, observations);
  const before = await savedNotes(page, patientId);
  await otworzBadania(page, patientId);
  const section = sekcjaBadan(page);
  await section.locator('.vilda-lab-hist-segment-btn[data-view="charts"]').click();
  await expect(section.locator('.vilda-lab-hist-card')).toHaveCount(4);
  verifyCoordinates(await measure(section), observations);
  await verifyPaintedPoints(page, section);
  const activate = locator => width <= 600 ? locator.tap() : locator.click();
  for (const observation of observations) {
    const id = ids[observation.key];
    if (observation.key === 'lh-0' || observation.key === 'lh-duplicate') {
      const group = section.locator('.vilda-lab-hist-card[data-series="lh"] .vilda-lab-result-chart-point[data-count="2"]');
      await activate(group);
      await activate(section.locator(`.vilda-lab-result-chart-choice[data-note-id="${id}"]`));
    } else await activate(section.locator(`.vilda-lab-result-chart-point[data-note-id="${id}"]`));
    if (observation.source === 'lab') {
      const details = section.locator(`.vilda-lab-hist-result-details[data-note-id="${id}"]`);
      await expect(details).toBeVisible();
      await activate(details.getByRole('button', { name: 'Zamknij szczegóły wyniku', exact: true }));
    } else {
      const details = page.locator('#detailsDialog');
      await expect(details).toBeVisible();
      await expect(details.locator('.clcr-record-value')).toHaveText(`${observation.display} mmol/L`);
      await expect(details.locator('.clcr-record-eyebrow')).toHaveText('KLIRENS · ' + observation.payload.clinicalDateISO.split('-').reverse().join('.'));
      await activate(details.getByRole('button', { name: 'Zamknij', exact: true }));
    }
  }
  await section.locator('.vilda-lab-hist-segment-btn[data-view="table"]').click();
  const savedRows = await section.locator('.vilda-lab-hist-result-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-note-id')).sort());
  expect(savedRows).toEqual(Object.values(ids).sort());
  expect(await savedNotes(page, patientId)).toBe(before);
}
