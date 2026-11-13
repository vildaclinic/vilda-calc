import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, opcjeListy, otworzPakiet, pakietyKonta, pakietyUrzadzenia, tekst, utworzPakiet } from '../support/lab-pakiet-dane.mjs';
import { otworzZalogowany, wyloguj, zalogujKonto, zalozKonto } from '../support/konta-urzadzenia.mjs';

// LAB-PAKIETY PR5 (polecenie właściciela 2026-11-13): każde konto widzi tylko swoje pakiety. Jedna przeglądarka
// (jedno urządzenie), dwa fikcyjne konta w prawdziwym sejfie: lekarz A i lekarz B logują się po sobie.
// Dane wyłącznie fikcyjne (tests/support/lab-pakiet-dane.mjs; zegar stron 17.06.2026).
test.use({ serviceWorkers: 'block' });

const HASLO_A = 'E2e#Badania!2026'; // konto zakładane przez otworzSejf
const HASLO_B = 'E2e#DrugiLekarz!2026';

async function naPakiet(page) {
  await otworzZalogowany(page, '/przelicznik-jednostek.html');
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPkgSelect')).toBeVisible();
}
const zalogujNowego = async (page) => {
  await zalozKonto(page, HASLO_B, 'Fikcyjny drugi lekarz');
  await naPakiet(page);
};
const zaloguj = async (page, userId, haslo) => {
  await zalogujKonto(page, userId, haslo);
  await naPakiet(page);
};
const kopie = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('labCustomPackages')).sort());

test('dwa konta na jednym urządzeniu: każdy lekarz widzi i zmienia tylko swoje pakiety', async ({ page }) => {
  await otworzPakiet(page, { pacjent: false });
  const kontoA = await page.evaluate(() => window.VildaVault.getCurrentUser().userId);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);

  // Lekarz A wylogowuje się, na tym samym urządzeniu loguje się lekarz B: lista bez pakietów A.
  await zalogujNowego(page);
  const kontoB = await page.evaluate(() => window.VildaVault.getCurrentUser().userId);
  expect(kontoB).not.toBe(kontoA);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  await expect(page.locator('#labPkgSelect')).toHaveValue('thyroid');
  await expect(page.locator('#labPkgEdit')).toBeHidden();
  expect(await pakietyUrzadzenia(page)).toEqual([]);
  expect(await pakietyKonta(page)).toBeNull();
  // Adres z identyfikatorem cudzego pakietu niczego nie otwiera.
  const idPakietuA = await page.evaluate((id) => JSON.parse(localStorage.getItem(`labCustomPackages::${id}`)).packages[0].id, kontoA);
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('vilda:shell-navigate-target', { detail: { href: `${location.pathname}?pakiet=${id}` } })), idPakietuA);
  await expect(page.locator('#labPkgSelect')).toHaveValue('thyroid');
  // B może nazwać swój pakiet tak samo jak A — nazwy innych kont nie są „zajęte”.
  await expect(page.locator('#labPkgNew')).toBeEnabled();
  await utworzPakiet(page, 'Dojrzewanie', ['testosterone_total', 'lh']);
  await utworzPakiet(page, 'Nadnercza', ['cortisol', 'acth']);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie', 'Nadnercza']]]);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Dojrzewanie', ['testosterone_total', 'lh']], ['Nadnercza', ['cortisol', 'acth']]]);

  // Wraca lekarz A: jego pakiet jest nietknięty, pakietów B nie ma — na liście, na urządzeniu ani na koncie.
  await zaloguj(page, kontoA, HASLO_A);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  expect(await pakietyUrzadzenia(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  expect(await pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  await page.locator('#labPkgSelect').selectOption({ label: 'Dojrzewanie' });
  await expect(page.locator('#labPkgContents')).toHaveText('LH · FSH · Estradiol');
  // Usunięcie pakietu przez A nie rusza pakietów B.
  await page.locator('#labPkgEdit').click();
  await page.locator('#labPkgCreatorDelete').click();
  await page.locator('#labPkgCreatorDeleteConfirm').click();
  await expect(page.locator('#labPkgCreator')).toBeHidden();
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  await zaloguj(page, kontoB, HASLO_B);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie', 'Nadnercza']]]);
  // Na urządzeniu są dwie osobne kopie, po jednej na konto.
  expect(await kopie(page)).toEqual([`labCustomPackages::${kontoA}`, `labCustomPackages::${kontoB}`].sort());

  // Po wylogowaniu zakładka pakietu nie pokazuje niczyich pakietów.
  await wyloguj(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.locator('#labModePackage').click();
  await expect(kartaPakietu(page).locator('.lab-pkg-gate-title')).toHaveText('Pakiety badań są dostępne po zalogowaniu');
  await expect(page.locator('#labPkgSelect')).toHaveCount(0);
  expect(await pakietyUrzadzenia(page)).toEqual([]);
});

test('stara wspólna kopia pakietów (sprzed poprawki): właściciel dostaje swoje pakiety z konta, inne konto ich nie widzi', async ({ page }) => {
  await otworzPakiet(page, { pacjent: false });
  const kontoA = await page.evaluate(() => window.VildaVault.getCurrentUser().userId);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  // Stan z wersji 1.3.0: pakiety konta A w sejfie, a na urządzeniu jedna kopia pod wspólnym kluczem.
  const staraKopia = async () => page.evaluate((id) => {
    const klucz = `labCustomPackages::${id}`;
    localStorage.setItem('labCustomPackages', localStorage.getItem(klucz));
    localStorage.removeItem(klucz);
  }, kontoA);
  await staraKopia();

  // Loguje się inne konto: starej kopii nie widzi i nie przejmuje; po rozstrzygnięciu może tworzyć własne pakiety.
  await zalogujNowego(page);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  await expect.poll(() => page.evaluate(() => window.VildaLabPackages.legacyPending(window.VildaPersistence))).toBe(false);
  await expect(page.locator('#labPkgNew')).toBeEnabled();
  await expect(page.locator('#labPkgPickerNote')).toBeHidden();
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  expect(await pakietyUrzadzenia(page)).toEqual([]);
  expect(await pakietyKonta(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('labCustomPackages'))).not.toBeNull();
  await utworzPakiet(page, 'Nadnercza', ['cortisol', 'acth']);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Nadnercza', ['cortisol', 'acth']]]);

  // Wraca właściciel: pakiety przychodzą z jego konta w sejfie, stara kopia znika.
  await zaloguj(page, kontoA, HASLO_A);
  await expect.poll(() => opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  await expect(page.locator('#labPkgNew')).toBeEnabled();
  await expect(page.locator('#labPkgPickerNote')).toBeHidden();
  expect(await pakietyUrzadzenia(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  expect(await page.evaluate(() => localStorage.getItem('labCustomPackages'))).toBeNull();
  // Konto A nie dostało pakietów B, a rozstrzygnięcie niczego na koncie nie zmieniło.
  expect(await pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
});

test('dopóki sejf nie rozstrzygnie starej kopii, kreator jest nieczynny i mówi dlaczego', async ({ page }) => {
  await otworzPakiet(page, { pacjent: false });
  const kontoA = await page.evaluate(() => window.VildaVault.getCurrentUser().userId);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  // Odczyt sejfu wstrzymany do znaku z testu — strona czeka na rozstrzygnięcie.
  await page.evaluate((id) => {
    const klucz = `labCustomPackages::${id}`;
    localStorage.setItem('labCustomPackages', localStorage.getItem(klucz));
    localStorage.removeItem(klucz);
    const prawdziwy = window.VildaVault.exportSyncPayload.bind(window.VildaVault);
    window.__puscOdczyt = null;
    window.VildaVault.exportSyncPayload = () => new Promise((resolve) => { window.__puscOdczyt = () => resolve(prawdziwy()); });
    window.dispatchEvent(new Event('focus'));
  }, kontoA);
  await expect(page.locator('#labPkgPickerNote')).toHaveText('Wczytuję Twoje pakiety z konta…');
  await expect(page.locator('#labPkgNew')).toBeDisabled();
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  await page.waitForFunction(() => typeof window.__puscOdczyt === 'function');
  await page.evaluate(() => window.__puscOdczyt());
  await expect.poll(() => opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  await expect(page.locator('#labPkgNew')).toBeEnabled();
  await expect(page.locator('#labPkgPickerNote')).toBeHidden();
  expect(await tekst(page.locator('#labPkgContents'))).toBe('TSH · fT4 · fT3');

  // Ta sama sytuacja przy otwarciu strony (tak trafia na nią lekarz po aktualizacji): gdy pakiety przyjdą
  // z konta, lista wraca do pakietu używanego ostatnio na tym urządzeniu.
  await page.evaluate((id) => {
    const klucz = `labCustomPackages::${id}`;
    localStorage.setItem('labCustomPackages', localStorage.getItem(klucz));
    localStorage.removeItem(klucz);
  }, kontoA);
  await page.reload({ waitUntil: 'load' });
  await page.locator('#labModePackage').click();
  await expect.poll(() => opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie');
  await expect(page.locator('#labPkgContents')).toHaveText('LH · FSH · Estradiol');
  expect(await page.evaluate(() => localStorage.getItem('labCustomPackages'))).toBeNull();
});
