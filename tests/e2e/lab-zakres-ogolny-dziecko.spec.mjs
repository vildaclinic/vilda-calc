import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '../support/test-czas.mjs';

// Decyzja 6.31 (za 6.30): przelicznik na żywo nie ocenia dziecka zakresem ogólnym (wiersz domyślny danych,
// is_default). Duża liczba bez koloru stanu, wyciszona pigułka, karta z granicami i populacją zamiast paska,
// tabela przeliczeń bez kolorowania. Dorosły z wierszem domyślnym i dziecko z wierszem dopasowanym — bez zmian.
// Fikcyjne dane, osobny origin; brak dostępu do sejfu użytkownika (wzór: lab-estradiol-reference-scope.spec.mjs).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const test = base.extend({
  origin: async ({ page }, use) => {
    const server = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
      cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit']
    });
    try {
      const origin = await new Promise((resolve, reject) => {
        let out = '';
        server.stdout.on('data', chunk => {
          out += chunk;
          const found = out.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (found) resolve(found[0]);
        });
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Serwer zakończył się: ${code}`)));
      });
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await use(origin);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const closed = new Promise(resolve => { server.once('exit', resolve); });
        server.kill('SIGKILL');
        await closed;
      }
    }
  }
});
test.use({ serviceWorkers: 'block' });

const GIRL_8 = { name: 'Fikcyjna Dziewczynka Zakresu', sex: 'F', age: 8, ageMonths: 0 };
const WOMAN_30 = { name: 'Fikcyjna Pacjentka Zakresu', sex: 'F', age: 30, ageMonths: 0 };
const bezTwardejSpacji = (s) => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const tekst = async (locator) => bezTwardejSpacji(await locator.innerText());

async function writePatient(page, data) {
  await page.evaluate(user => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Nie zapisano fikcyjnych danych');
    window.dispatchEvent(new Event('focus'));
  }, data);
}
async function open(page, origin, data) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
  });
  await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence);
  for (const button of [page.locator('#consent-decline'), page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true })]) {
    if (await button.isVisible()) await button.click();
  }
  await writePatient(page, data);
}
async function choose(page, { id, search, unit, value }) {
  await page.locator('#labSubstance').fill(search);
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(unit);
  await page.locator('#labValue').fill(value);
}
const rangeElements = '#labRangeBlock .lab-range-scale, #labRangeBlock .lab-range-marker, #labRangeBlock .lab-range-uwaga-note';
const rowStates = '#labResultsBody tr.lab-row-below, #labResultsBody tr.lab-row-normal, #labResultsBody tr.lab-row-above';

async function expectGeneral(page, { bounds, population }) {
  await expect(page.locator('#labResultStatus .lab-range-status.is-general')).toHaveText('zakres ogólny — bez oceny dla dziecka');
  await expect(page.locator('#labResultStatus')).not.toContainText(/normy|w zakresie/);
  await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-normal|is-below|is-above|is-uwaga/);
  await expect(page.locator(rangeElements)).toHaveCount(0);
  const card = page.locator('#labRangeBlock .lab-range-general');
  await expect(card.locator('strong')).toHaveText('Zakres ogólny — bez oceny dla dziecka');
  expect(await tekst(card.locator('span'))).toBe(`Dane przelicznika nie mają zakresu dla wieku dziecka. Zakres ogólny ${bounds} (${population}) — tylko do wglądu, wynik bez oceny.`);
  expect(await tekst(page.locator('#labResultSourceLine'))).toBe(`zakres ogólny: ${bounds}`);
  expect(await tekst(page.locator('#labMeta'))).toContain(`Zakres ogólny (bez oceny dla dziecka): ${bounds}`);
  await expect(page.locator(rowStates)).toHaveCount(0);
}

test('prolaktyna u dziewczynki 8 l: zakres ogólny bez oceny — liczba, pigułka, karta, tabela; wartość skrajna bez „Uwaga”', async ({ page, origin }) => {
  await open(page, origin, GIRL_8);
  await choose(page, { id: 'prolactin', search: 'Prolaktyna', unit: 'ng/mL', value: '35' });
  await expectGeneral(page, { bounds: '2–29 ng/mL', population: 'Dorośli, zakres ogólny' });
  // Wartość „znacznie powyżej” zakresu dorosłych — też bez komunikatu „Uwaga” i bez koloru.
  await page.locator('#labValue').fill('80');
  await expectGeneral(page, { bounds: '2–29 ng/mL', population: 'Dorośli, zakres ogólny' });
  await page.locator('#labValue').fill('10');
  await expectGeneral(page, { bounds: '2–29 ng/mL', population: 'Dorośli, zakres ogólny' });
  // Zmiana kontekstu na dorosłą: wiersz dopasowany „Kobiety nieciężarne” — ocena jak dotąd.
  await writePatient(page, WOMAN_30);
  await page.locator('#labValue').fill('35');
  await expect(page.locator('#labResultStatus .lab-range-status.is-above')).toHaveText('↑ powyżej normy');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labRangeBlock .lab-range-general')).toHaveCount(0);
  // I z powrotem do dziecka — znów bez oceny.
  await writePatient(page, GIRL_8);
  await page.locator('#labValue').fill('36');
  await expectGeneral(page, { bounds: '2–29 ng/mL', population: 'Dorośli, zakres ogólny' });
});

test('dorosły z wierszem domyślnym i dziecko z wierszem dopasowanym — ocena bez zmian', async ({ page, origin }) => {
  // IGFBP-3 u kobiety 30 l: wiersz domyślny „Dorośli (zakres ogólny Mayo)” — dorosły oceniany jak dotąd.
  await open(page, origin, WOMAN_30);
  await choose(page, { id: 'igfbp3', search: 'IGFBP-3', unit: 'mg/L', value: '9,4' });
  await expect(page.locator('#labResultStatus .lab-range-status.is-above')).toHaveText('↑ powyżej normy');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labRangeBlock .lab-range-general')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveClass(/is-above/);
  expect(await tekst(page.locator('#labResultSourceLine'))).toBe('zakres: 2,6–8,6 mg/L');

  await writePatient(page, GIRL_8);
  await choose(page, { id: 'tsh', search: 'TSH', unit: 'mIU/L', value: '5,1' });
  await expect(page.locator('#labResultStatus .lab-range-status.is-above')).toHaveText('↑ powyżej normy');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labRangeBlock .lab-range-general')).toHaveCount(0);
  expect(await tekst(page.locator('#labResultSourceLine'))).toBe('zakres: 0,6–4,8 mIU/L');
});

test('telefon 390 px: karta zakresu ogólnego mieści się bez poziomego przewijania', async ({ page, origin }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, origin, GIRL_8);
  // IGFBP-3 u dziecka bez stadium Tannera: wiersz domyślny z długim opisem populacji.
  await choose(page, { id: 'igfbp3', search: 'IGFBP-3', unit: 'mg/L', value: '9,4' });
  const card = page.locator('#labRangeBlock .lab-range-general');
  await expect(card).toBeVisible();
  await expect(card.locator('span')).toContainText('Zakres ogólny 2,6–8,6 mg/L (Dorośli (zakres ogólny Mayo).');
  await expect(page.locator('#labResultStatus .lab-range-status.is-general')).toBeVisible();
  const [box, block] = [await card.boundingBox(), await page.locator('#labRangeBlock').boundingBox()];
  expect(box.x + box.width).toBeLessThanOrEqual(block.x + block.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
