import { expect, test } from '../support/test-czas.mjs';

// P-GH-WAZNOSC (2026-10-05, decyzja właściciela D4). Karta „Leczenie hormonem wzrostu / IGF-1” liczy, ile
// wkładów, wstrzykiwaczy albo fiolek wydać na 90 i 180 dni. Dotąd tylko z ilości leku, więc przy małej dawce
// otwarta sztuka przeterminowywała się (ChPL 6.3: Omnitrope i Genotropin 28 dni, Ngenla 28 dni i 5 użyć,
// Increlex 30 dni), zanim lek się skończył. Teraz wynik to większa z dwóch liczb, a lekarz widzi, kiedy
// zdecydowała ważność, i notkę z jej długością i źródłem.
//
// ZMIERZONE przed zmianą (`audyt` b8b2f6b): Omnitrope 10 mg, 12 kg, 0,3 mg/d — 3 i 6 ampułek (90/180 dni);
// Increlex, 10 kg, 2 × 0,4 mg — 2 fiolki; Ngenla 60 mg, 14 kg, 9 mg/tydz — 2 wstrzykiwacze.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhWaznosc!2026a';

async function otworz(page) {
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
  // Kartę montuje sam moduł obok przycisku IGF; tutaj montujemy ją jawnie, bez przełączania trybów strony.
  await page.evaluate(() => window.vildaGhIgfPersistApi.ensureMounted());
  await page.waitForSelector('#therProg', { state: 'attached', timeout: 15000 });
}

async function ustaw(page, { masa, program, lek, dawka }) {
  await page.evaluate((p) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '8'); set('ageMonths', '0'); set('sex', 'M'); set('height', '120'); set('weight', String(p.masa));
    if (typeof window.update === 'function') window.update();
    set('therProg', p.program);
    set('therDrug', p.lek);
    set('therDailyDose', String(p.dawka));
  }, { masa, program, lek, dawka });
}

const wynik = (page) => page.evaluate(() => ({
  w90: document.getElementById('ther90').textContent.replace(/\s+/g, ' ').trim(),
  w180: document.getElementById('ther180').textContent.replace(/\s+/g, ' ').trim(),
  notka: document.getElementById('therOpakNote') ? document.getElementById('therOpakNote').textContent.trim() : null,
  calc: window.ghTherapyCalc ? { u90: window.ghTherapyCalc.units90, u180: window.ghTherapyCalc.units180 } : null,
}));

test('A: Omnitrope 10 mg, 12 kg, 0,3 mg/d — 4 i 7 wkładów zamiast 3 i 6, z dopiskiem i notką o 28 dniach', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { masa: 12, program: 'SNP', lek: 'Omnitrope 10 mg', dawka: 0.025 });
  await expect.poll(() => wynik(page).then((r) => r.calc), { timeout: 15000 }).toEqual({ u90: 4, u180: 7 });
  const r = await wynik(page);
  expect(r.w90).toContain('ampułek: 4');
  expect(r.w90).toContain('uwzględniono ważność 28 dni (z samej ilości leku: 3)');
  expect(r.w180).toContain('ampułek: 7');
  expect(r.w180).toContain('(z samej ilości leku: 6)');
  expect(r.notka).toBe('Liczba wkładów uwzględnia ważność po pierwszym użyciu: 28 dni (ChPL Omnitrope, pkt 6.3). '
    + 'Po tym czasie wkład się wyrzuca, nawet jeśli w nim został lek. Wynik zaokrąglamy w górę.');
});

test('B: Omnitrope 10 mg, 40 kg, 1,0 mg/d — wynik z ilości leku jak dotąd (9 i 18), bez dopisku', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { masa: 40, program: 'SNP', lek: 'Omnitrope 10 mg', dawka: 0.025 });
  await expect.poll(() => wynik(page).then((r) => r.calc), { timeout: 15000 }).toEqual({ u90: 9, u180: 18 });
  const r = await wynik(page);
  expect(r.w90).toContain('ampułek: 9');
  expect(r.w90).not.toContain('uwzględniono ważność');
});

test('C: Increlex, 10 kg, 2 × 0,4 mg — 3 fiolki na 90 dni (ważność 30 dni), notka o fiolce', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { masa: 10, program: 'IGF-1', lek: 'Increlex 40 mg', dawka: 0.08 });
  await expect.poll(() => wynik(page).then((r) => r.calc), { timeout: 15000 }).toEqual({ u90: 3, u180: 6 });
  const r = await wynik(page);
  expect(r.w90).toContain('fiolek: 3');
  expect(r.w90).toContain('uwzględniono ważność 30 dni (z samej ilości leku: 2)');
  expect(r.notka).toContain('Liczba fiolek uwzględnia ważność po pierwszym otwarciu: 30 dni (ChPL Increlex, pkt 6.3).');
  expect(r.notka).toContain('fiolkę się wyrzuca, nawet jeśli w niej został lek');
});

test('D: Ngenla 60 mg, 14 kg, 9 mg/tydz — 3 i 6 wstrzykiwaczy (28 dni, najwyżej 5 użyć)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { masa: 14, program: 'SNP', lek: 'Ngenla 60 mg', dawka: 0.66 });
  await expect.poll(() => wynik(page).then((r) => r.calc), { timeout: 15000 }).toEqual({ u90: 3, u180: 6 });
  const r = await wynik(page);
  expect(r.w90).toContain('wstrzykiwaczy: 3');
  expect(r.w90).toContain('uwzględniono ważność 28 dni i najwyżej 5 użyć (z samej ilości leku: 2)');
  expect(r.notka).toContain('najwyżej 5 dawek tygodniowych z jednego wstrzykiwacza');
});

// Zalecenia „Wydanie leku” przy ręcznej dacie kontroli liczą sztuki w osobnych funkcjach (dobowe, Ngenla,
// Increlex) — tu sprawdzamy, że też uwzględniają ważność. Schowek przechwytujemy w stronie.
async function zalecenieNaDni(page, dni) {
  return page.evaluate((d) => {
    window.__skopiowane = null;
    navigator.clipboard.writeText = (t) => { window.__skopiowane = t; return Promise.resolve(); };
    const dzis = new Date(); dzis.setHours(12, 0, 0, 0);
    const data = new Date(dzis.getTime() + d * 864e5);
    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const pole = document.getElementById('manualControlDate');
    pole.value = iso;
    pole.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('copyManualDays').click();
    return new Promise((r) => { setTimeout(() => r(window.__skopiowane), 300); });
  }, dni);
}

test('E: zalecenia przy ręcznej dacie kontroli — Omnitrope, Increlex i Ngenla liczą sztuki z ważnością', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { masa: 12, program: 'SNP', lek: 'Omnitrope 10 mg', dawka: 0.025 });
  await expect.poll(() => wynik(page).then((r) => r.calc && r.calc.u90), { timeout: 15000 }).toBe(4);
  expect(await zalecenieNaDni(page, 90)).toContain('Wydano lek na 90 dni (4 ampułki preparatu Omnitrope a 10 mg)');

  await ustaw(page, { masa: 10, program: 'IGF-1', lek: 'Increlex 40 mg', dawka: 0.08 });
  await expect.poll(() => wynik(page).then((r) => r.calc && r.calc.u90), { timeout: 15000 }).toBe(3);
  expect(await zalecenieNaDni(page, 90)).toContain('Wydano lek na 90 dni (3 fiolki Increlex 40 mg / 4 ml)');

  await ustaw(page, { masa: 14, program: 'SNP', lek: 'Ngenla 60 mg', dawka: 0.66 });
  await expect.poll(() => wynik(page).then((r) => r.calc && r.calc.u90), { timeout: 15000 }).toBe(3);
  // Ngenla: kontrola w 4. dobie po dawce, więc okres leczenia = dni do kontroli − 4.
  expect(await zalecenieNaDni(page, 94)).toContain('Wydano lek na 90 dni (wydano 3 wstrzykiwacze preparatu Ngenla 60 mg)');
});
