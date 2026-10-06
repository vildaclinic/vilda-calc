import { expect, test } from '../support/test-czas.mjs';

// P-GH-INIEKCJE-ZALECENIA (polecenie właściciela 2026-10-06): zalecenia kopiowane dla pacjenta i liczba „iniekcji”
// w tabeli zapotrzebowania karty „Leczenie hormonem wzrostu / IGF-1” uwzględniają limit jednego wstrzyknięcia
// i podział dawki. Ngenla ponad limit: równe części w krokach wstrzykiwacza (decyzja właściciela z
// P-GH-DAWKA-PODAWANA), każde wstrzyknięcie w inne miejsce (ChPL Ngenla, pkt 4.2). Genotropin poza zakresem jednego
// wstrzyknięcia — bez podziału (osobna decyzja właściciela), ostrzeżenie dla lekarza w dymku po skopiowaniu.
//
// ZMIERZONE przed zmianą (`audyt` db8f26c), te same kroki:
// - Ngenla 24 mg, 40 kg, 26,4 mg/tydz po „Zostaw 24 mg” (karta: „3 wstrzyknięcia po 8,8 mg”): tabela „13 iniekcji”
//   (90 dni) i „26 iniekcji” (180 dni) — liczba dawek tygodniowych; zalecenia 90/180 dni i przy ręcznej dacie
//   kontroli: „1. Ngenla - 26,4 mg raz na tydzień. …” bez słowa o trzech wstrzyknięciach.
// - Ngenla 60 mg, 50 kg, 33 mg/tydz (2 × 16,5 mg): „13 iniekcji”, zalecenia bez podziału.
// - Genotropin 5,3 mg, 1,6 mg/d po „Zostaw 5,3 mg” i Genotropin 12 mg, 5,7 mg/d: zalecenia „1,6 mg na dobę
//   w codziennych wstrzyknięciach podskórnych.” i dymek „Zalecenia zostały skopiowane do schowka.” — bez sygnału,
//   że wstrzykiwacz tej dawki nie poda.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhIniekcje!26';
const OK = 'Zalecenia zostały skopiowane do schowka.';

async function otworzKarte(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.mouse.click(5, 5); // pierwsza interakcja ładuje leniwie moduł karty GH/IGF-1
  await page.waitForFunction(() => Boolean(window.vildaGhIgfPersistApi), null, { timeout: 15000 });
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    document.getElementById('ghIgfTherapyCard').style.display = 'block';
    // Schowek przechwytujemy w stronie — test czyta dokładnie to, co trafiłoby do schowka.
    navigator.clipboard.writeText = (t) => { window.__skopiowane = t; return Promise.resolve(); };
  });
  await page.waitForSelector('#therDailyDoseAbs', { state: 'attached', timeout: 15000 });
}

function ustaw(page, { masa, program, lek }) {
  return page.evaluate((p) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', String(p.masa));
    if (typeof window.update === 'function') window.update();
    if (p.program) set('therProg', p.program);
    if (p.lek) set('therDrug', p.lek);
  }, { masa, program, lek });
}

async function wpisz(page, sel, wartosc) {
  await page.fill(sel, wartosc);
  await page.press(sel, 'Tab');
}

const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

const tabela = (page) => page.evaluate(() => {
  const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  return { w90: t('ther90'), w180: t('ther180'), reczny: t('therManual') };
});

// Klik przycisku zaleceń jak lekarz; zwraca linie skopiowanego tekstu (spacje znormalizowane) i dymek.
async function kopiuj(page, id) {
  await page.evaluate(() => { window.__skopiowane = null; });
  await page.click(`#${id}`);
  await page.waitForFunction(() => typeof window.__skopiowane === 'string');
  const dymek = page.locator('#vildaDymek');
  await expect(dymek).toBeVisible();
  return page.evaluate(() => {
    const d = document.getElementById('vildaDymek');
    return {
      linie: window.__skopiowane.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()),
      dymek: d ? d.textContent.replace(/\s+/g, ' ').trim() : '',
      ostrzezenie: Boolean(d && d.classList.contains('vilda-dymek--blad')),
    };
  });
}

// Ręczna data kontroli za `dni` dni od dziś (Ngenla: okres leczenia = dni − 4, kontrola w 4. dobie po dawce).
async function recznaData(page, dni) {
  await page.evaluate((d) => {
    const dzis = new Date(); dzis.setHours(12, 0, 0, 0);
    const data = new Date(dzis.getTime() + d * 864e5);
    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const pole = document.getElementById('manualControlDate');
    pole.value = iso;
    pole.dispatchEvent(new Event('change', { bubbles: true }));
  }, dni);
  await expect(page.locator('#copyManualDays')).toBeVisible();
}

test('A: Ngenla 24 mg, 26,4 mg/tydz w 3 wstrzyknięciach po 8,8 mg — 39 i 78 iniekcji; zalecenia 90/180/ręczne z podziałem', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 40, program: 'SNP', lek: 'Ngenla 24 mg' });
  await wpisz(page, '#therDailyDoseAbs', '26.4');
  await page.click('#therPenNote button:has-text("Zostaw 24 mg")');

  // 90 dni = 13 dawek tygodniowych × 3 wstrzyknięcia; 180 dni = 26 × 3.
  await expect.poll(() => tabela(page).then((t) => t.w90)).toContain('39 iniekcji (3 na dawkę)');
  const t = await tabela(page);
  expect(t.w90).toBe('≈ 343,2 mg → wstrzykiwaczy: 15; 39 iniekcji (3 na dawkę)');
  expect(t.w180).toBe('≈ 686,4 mg → wstrzykiwaczy: 29; 78 iniekcji (3 na dawkę)');

  const podzial = '2. Dawkę 26,4 mg podaje się w 3 wstrzyknięciach po 8,8 mg, każde w inne miejsce, aby zapobiec lipoatrofii.';
  for (const [id, dni, sztuk] of [['copy90days', 90, 15], ['copy180days', 180, 29]]) {
    const k = await kopiuj(page, id);
    expect(k.linie[0]).toBe('1. Ngenla - 26,4 mg raz na tydzień. Preparat podaje się podskórnie, tego samego dnia każdego '
      + 'tygodnia, o dowolnej porze dnia.');
    expect(k.linie[1]).toBe(podzial);
    expect(k.linie[2]).toBe(`3. Wydano lek na ${dni} dni (wydano ${sztuk} wstrzykiwaczy preparatu Ngenla 24 mg)`);
    expect(k.linie[4]).toMatch(/^5\. Pominięta dawka:/);
    expect(k.linie).toHaveLength(6);
    expect(k.dymek).toBe(OK);
    expect(k.ostrzezenie).toBe(false);
  }

  await recznaData(page, 94);
  await expect.poll(() => tabela(page).then((x) => x.reczny)).toBe('≈ 343,2 mg → wstrzykiwaczy: 15; 39 iniekcji (3 na dawkę)');
  const r = await kopiuj(page, 'copyManualDays');
  expect(r.linie[1]).toBe(podzial);
  expect(r.linie[2]).toBe('3. Wydano lek na 90 dni (wydano 15 wstrzykiwaczy preparatu Ngenla 24 mg)');
  expect(r.dymek).toBe(OK);
});

test('B: Ngenla 60 mg — 33 mg (2 × 16,5) i 33,5 mg (17 + 16,5) z podziałem; 26,5 mg w jednym wstrzyknięciu bez zmian', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 50, program: 'SNP', lek: 'Ngenla 60 mg' });
  await expect.poll(() => tabela(page).then((t) => t.w90)).toBe('≈ 429 mg → wstrzykiwaczy: 8; 26 iniekcji (2 na dawkę)');
  expect((await tabela(page)).w180).toBe('≈ 858 mg → wstrzykiwaczy: 15; 52 iniekcje (2 na dawkę)');
  let k = await kopiuj(page, 'copy90days');
  expect(k.linie[1]).toBe('2. Dawkę 33 mg podaje się w 2 wstrzyknięciach po 16,5 mg, każde w inne miejsce, aby zapobiec '
    + 'lipoatrofii.');

  await wpisz(page, '#therDailyDoseAbs', '33.5');
  await expect.poll(() => tabela(page).then((t) => t.w90)).toBe('≈ 435,5 mg → wstrzykiwaczy: 8; 26 iniekcji (2 na dawkę)');
  k = await kopiuj(page, 'copy180days');
  expect(k.linie[1]).toBe('2. Dawkę 33,5 mg podaje się w 2 wstrzyknięciach: 17 mg i 16,5 mg, każde w inne miejsce, '
    + 'aby zapobiec lipoatrofii.');
  expect(k.linie[2]).toBe('3. Aktualna dawka hormonu wzrostu to 0,67 mg/kg/tydzień,');

  // Jedno wstrzyknięcie na dawkę: liczba iniekcji i zalecenia jak przed zmianą. Ponowny wybór programu przywraca
  // dawkę domyślną (sama zmiana masy zostawia dawkę podawaną — P-GH-DAWKA-PODAWANA): 0,66 × 40 = 26,4 → 26,5 mg.
  await ustaw(page, { masa: 40, program: 'SNP', lek: 'Ngenla 60 mg' });
  await expect.poll(() => tabela(page).then((t) => t.w90)).toBe('≈ 344,5 mg → wstrzykiwaczy: 6; 13 iniekcji');
  expect((await tabela(page)).w180).toBe('≈ 689 mg → wstrzykiwaczy: 12; 26 iniekcji');
  k = await kopiuj(page, 'copy90days');
  expect(k.linie[1]).toBe('2. Aktualna dawka hormonu wzrostu to 0,66 mg/kg/tydzień,');
  expect(k.linie.join('\n')).not.toContain('wstrzyknięciach');
  expect(k.dymek).toBe(OK);
});

test('C: Genotropin poza zakresem jednego wstrzyknięcia — ostrzeżenie dla lekarza w dymku, tekst zaleceń bez zmian', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzKarte(page);
  await ustaw(page, { masa: 48, program: 'SNP', lek: 'Genotropin 5,3 mg' });
  await wpisz(page, '#therDailyDoseAbs', '1.6');
  await page.click('#therPenNote button:has-text("Zostaw 5,3 mg")');
  let k = await kopiuj(page, 'copy90days');
  expect(k.linie[0]).toBe('1. Genotropin - 1,6 mg na dobę w codziennych wstrzyknięciach podskórnych.');
  expect(k.linie).toHaveLength(4);
  expect(k.dymek).toBe('Skopiowano zalecenia, ale 1,6 mg to więcej niż 1,5 mg — tyle najwięcej podaje jedno wstrzyknięcie '
    + 'wstrzykiwacza Genotropin 5,3 mg (ulotka Genotropin). Sprawdź dawkę, zanim przekażesz zalecenia pacjentowi.');
  expect(k.ostrzezenie).toBe(true);
  // Tabela dawek dobowych bez liczby iniekcji — jak dotąd.
  expect((await tabela(page)).w90).toBe('≈ 144 mg → ampułek: 28');

  await recznaData(page, 94);
  k = await kopiuj(page, 'copyManualDays');
  expect(k.linie[0]).toBe('1. Genotropin - 1,6 mg na dobę w codziennych wstrzyknięciach podskórnych.');
  expect(k.ostrzezenie).toBe(true);

  await ustaw(page, { masa: 100, program: 'ZT', lek: 'Genotropin 12 mg' });
  k = await kopiuj(page, 'copy180days');
  expect(k.linie[0]).toBe('1. Genotropin - 5,7 mg na dobę w codziennych wstrzyknięciach podskórnych.');
  expect(k.dymek).toBe('Skopiowano zalecenia, ale 5,7 mg to więcej niż 4,5 mg — tyle najwięcej podaje jedno wstrzyknięcie '
    + 'wstrzykiwacza Genotropin 12 mg (ulotka Genotropin). Sprawdź dawkę, zanim przekażesz zalecenia pacjentowi.');

  // Dawka w zakresie jednego wstrzyknięcia i Omnitrope (bez limitów): zwykłe potwierdzenie.
  await ustaw(page, { masa: 48, program: 'SNP', lek: 'Genotropin 12 mg' });
  k = await kopiuj(page, 'copy90days');
  expect(norm(k.dymek)).toBe(OK);
  expect(k.ostrzezenie).toBe(false);
  await ustaw(page, { masa: 35, program: 'SNP', lek: 'Omnitrope 10 mg' });
  k = await kopiuj(page, 'copy90days');
  expect(k.linie[0]).toBe('1. Omnitrope - 0,9 mg na dobę w codziennych wstrzyknięciach podskórnych.');
  expect(k.dymek).toBe(OK);
});
