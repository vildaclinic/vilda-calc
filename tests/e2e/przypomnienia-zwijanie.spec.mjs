import { expect, test } from '@playwright/test';

// Zwijanie kategorii w karcie „Przypomnienia” (zgłoszenie właściciela 2026-09-03, wariant A).
//
// Stan zwinięcia jest per KATEGORIA i wspólny dla obu widoków: karty w prawej kolumnie strony
// głównej i pełnoekranowego modalu spod dzwoneczka. Karta zachowuje swój podział na „Zaległe”/
// „Dziś”/„Oczekujące wyniki”, ale w każdej z tych sekcji grupuje wiersze po kategoriach ze
// zwijanym nagłówkiem; modal zwija całą sekcję kategorii. Stan jest zapisywany jako preferencja
// `remindersCollapsedCategories` o klasie `cloud-synced`, więc trafia do `userPreferences` sejfu,
// a stamtąd do payloadu synchronizacji — i tym samym na pozostałe urządzenia.

const HASLO = 'E2e#Zwijanie!2026rem';

/** Zakłada użytkownika sejfu, zasiewa wpisy na dziś i pokazuje kartę. */
async function otworz(page, wpisy) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(async (lista) => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    // Datę liczy PRZEGLĄDARKA — kontener testowy chodzi w UTC i policzyłby inną dobę.
    const d = new Date();
    const dzis = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    for (const w of lista) {
      const pac = await V.savePatient({ name: w.name });
      await V.savePatientNote({
        patientId: pac.id || pac.patientId,
        title: w.title,
        body: '',
        category: w.category,
        dueDateISO: dzis,
        dueTime: null,
      });
    }
  }, wpisy);
  await pokazKarte(page);
}

/** Przeładowanie strony z gotowymi danymi + otwarcie bramki PRO. */
async function pokazKarte(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
    // Karta jest za bramką PRO (podpisany token, którego w teście nie podrabiamy) — podmieniamy
    // wyłącznie tę bramkę; cała reszta ścieżki renderowania jest prawdziwa.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForSelector('#remindersInline .vild-rem-cat-head', {
    state: 'attached', timeout: 20000,
  });
}

/** Nagłówki kategorii w karcie: etykieta, licznik, stan i liczba WIDOCZNYCH wierszy pod nim. */
const kategorieKarty = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#remindersInline .vild-rem-cat-head'),
).map((h) => {
  const rows = h.nextElementSibling;
  const widoczne = rows && rows.style.display !== 'none'
    ? rows.querySelectorAll('.vild-rem-row').length
    : 0;
  return {
    klucz: h.getAttribute('data-vild-cat'),
    etykieta: h.querySelector('.vild-rem-cat-nm')?.textContent,
    licznik: h.querySelector('.vild-rem-cat-n')?.textContent,
    strzalka: h.querySelector('.vild-rem-caret')?.textContent,
    rozwinieta: h.getAttribute('aria-expanded'),
    widocznychWierszy: widoczne,
  };
}));

const klikKategorie = (page, klucz) => page.evaluate((k) => {
  const h = Array.from(document.querySelectorAll('#remindersInline .vild-rem-cat-head'))
    .find((x) => x.getAttribute('data-vild-cat') === k);
  if (!h) throw new Error(`brak nagłówka kategorii ${k}`);
  h.click();
}, klucz);

const ZASIEW = [
  { name: 'Ewa Biopsja', title: 'Biopsja tarczycy', category: 'procedura' },
  { name: 'Filip Punkcja', title: 'Punkcja', category: 'procedura' },
  { name: 'Gabriela Kontrolna', title: 'Kontrola', category: 'followup' },
];

test('Z1 — karta grupuje wiersze po kategoriach z licznikiem i strzałką', async ({ page }) => {
  await otworz(page, ZASIEW);
  const kat = await kategorieKarty(page);
  expect(kat.map((k) => k.klucz)).toEqual(['followup', 'procedura']);
  expect(kat.map((k) => k.etykieta)).toEqual(['Kontrola', 'Procedura']);
  expect(kat.map((k) => k.licznik)).toEqual(['1', '2']);
  expect(kat.every((k) => k.rozwinieta === 'true'), 'domyślnie wszystko rozwinięte').toBe(true);
  expect(kat.every((k) => k.strzalka === '▾')).toBe(true);
  expect(kat.map((k) => k.widocznychWierszy)).toEqual([1, 2]);

  // Licznik sekcji czasowej liczy NOTATKI, nie elementy listy. Po zgrupowaniu po kategoriach
  // tablica przekazywana do sekcji niesie pary [nagłówek kategorii, kontener wierszy], więc
  // jej długość to nie liczba przypomnień — CI złapało tu „Zaległe 2” przy jednej notatce.
  const sekcja = await page.evaluate(() => {
    const h = document.querySelector('#remindersInline .vild-rem-sec-today .vild-rem-sec-head');
    return h ? Array.from(h.children).map((x) => x.textContent) : null;
  });
  expect(sekcja, 'nagłówek sekcji „Dziś” liczy trzy notatki, nie cztery elementy')
    .toEqual(['Dziś', '3']);
});

test('Z2 — kliknięcie chowa wiersze tylko swojej kategorii, licznik zostaje', async ({ page }) => {
  await otworz(page, ZASIEW);
  await klikKategorie(page, 'procedura');
  const kat = await kategorieKarty(page);
  const proc = kat.find((k) => k.klucz === 'procedura');
  const kontrola = kat.find((k) => k.klucz === 'followup');

  expect(proc.widocznychWierszy, 'procedury schowane').toBe(0);
  expect(proc.rozwinieta).toBe('false');
  expect(proc.strzalka).toBe('▸');
  expect(proc.licznik, 'licznik pokazuje ile jest schowanych, nie zeruje się').toBe('2');
  expect(kontrola.widocznychWierszy, 'kontrola nietknięta').toBe(1);
  expect(kontrola.rozwinieta).toBe('true');

  // Żeton karty i odznaka dzwoneczka liczą wszystko, co czeka — nie to, co widać.
  const chip = await page.textContent('#remindersInline .vild-rem-chip');
  expect(chip, 'licznik karty nie zmienia się przy zwijaniu').toBe('3');
});

test('Z3 — stan zwinięcia przeżywa przeładowanie strony', async ({ page }) => {
  await otworz(page, ZASIEW);
  await klikKategorie(page, 'procedura');
  await pokazKarte(page);

  const kat = await kategorieKarty(page);
  const proc = kat.find((k) => k.klucz === 'procedura');
  expect(proc.rozwinieta, 'po przeładowaniu procedury nadal zwinięte').toBe('false');
  expect(proc.widocznychWierszy).toBe(0);
  expect(kat.find((k) => k.klucz === 'followup').widocznychWierszy).toBe(1);
});

test('Z4 — ten sam stan obowiązuje w modalu spod dzwoneczka', async ({ page }) => {
  await otworz(page, ZASIEW);
  await klikKategorie(page, 'procedura');

  await page.evaluate(() => window.VildaAuthUI.maybeShowReminders({ force: true }));
  await page.waitForSelector('.vilda-reminders-row', { timeout: 20000 });
  const sekcje = await page.evaluate(() => Array.from(
    document.querySelectorAll('[data-vild-cat][aria-expanded]'),
  ).filter((h) => !h.closest('#remindersInline')).map((h) => {
    const rows = h.nextElementSibling;
    return {
      klucz: h.getAttribute('data-vild-cat'),
      rozwinieta: h.getAttribute('aria-expanded'),
      widocznychWierszy: rows && rows.style.display !== 'none'
        ? rows.querySelectorAll('.vilda-reminders-row').length
        : 0,
    };
  }));

  const proc = sekcje.filter((s) => s.klucz === 'procedura');
  const kontrola = sekcje.filter((s) => s.klucz === 'followup');
  expect(proc.length, 'sekcja procedur jest w modalu').toBeGreaterThan(0);
  expect(kontrola.length, 'sekcja kontroli jest w modalu').toBeGreaterThan(0);
  expect(proc.every((s) => s.rozwinieta === 'false'), 'procedury zwinięte także tutaj').toBe(true);
  expect(proc.every((s) => s.widocznychWierszy === 0)).toBe(true);
  expect(kontrola.every((s) => s.rozwinieta === 'true')).toBe(true);
  expect(
    kontrola.reduce((a, s) => a + s.widocznychWierszy, 0),
    'kontrola nadal widoczna w modalu',
  ).toBe(1);
});

test('Z5 — zwinięcie jedzie w payloadzie synchronizacji na inne urządzenia', async ({ page }) => {
  // Klucz `remindersCollapsedCategories` jest zarejestrowany jako `cloud-synced`, więc zapis
  // przechodzi przez onPreferenceWrite do `userPreferences` sejfu, a stamtąd do payloadu.
  // To jest cała droga na drugie urządzenie — sprawdzamy ją na prawdziwym sejfie, nie na atrapie.
  await otworz(page, ZASIEW);
  const przed = await page.evaluate(async () => {
    const p = await window.VildaVault.exportSyncPayload();
    return (p.userPreferences || {}).remindersCollapsedCategories || null;
  });
  expect(przed, 'przed kliknięciem klucza nie ma w payloadzie').toBeNull();

  await klikKategorie(page, 'procedura');
  const po = await page.evaluate(async () => {
    const p = await window.VildaVault.exportSyncPayload();
    return (p.userPreferences || {}).remindersCollapsedCategories || null;
  });
  expect(po, 'klucz jest w payloadzie synchronizacji').toBeTruthy();
  expect(JSON.parse(po.value), 'z listą zwiniętych kategorii').toEqual(['procedura']);
  expect(typeof po.updatedAtISO, 'ze znacznikiem czasu do rozstrzygania konfliktów').toBe('string');
});

test('Z6 — w obrębie kategorii kolejność dat zostaje, kategorie idą stałym porządkiem', async ({ page }) => {
  // Grupowanie po kategoriach zmienia kolejność WEWNĄTRZ sekcji czasowej: najpierw kategorie
  // w stałym porządku (ten sam, którym modal układa swoje sekcje), a dopiero w nich sortowanie
  // z PR 12 — data rosnąco, a w obrębie doby wpisy całodniowe przed godzinowymi. Zasiew jest
  // przeplatany tak, żeby oczekiwany wynik nie był ani kolejnością zapisu, ani jej odwrotnością.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(async () => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    const dzien = (ile) => {
      const d = new Date();
      d.setDate(d.getDate() - ile);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const zasiew = [
      ['Anna Proceduralna', 'procedura', 3],
      ['Bartek Kontrolny', 'followup', 2],
      ['Cecylia Proceduralna', 'procedura', 5],
      ['Damian Kontrolny', 'followup', 4],
    ];
    for (const [name, category, dniTemu] of zasiew) {
      const pac = await V.savePatient({ name });
      await V.savePatientNote({
        patientId: pac.id || pac.patientId, title: 'Wpis', body: '',
        category, dueDateISO: dzien(dniTemu), dueTime: null,
      });
    }
  });
  await pokazKarte(page);

  const uklad = await page.evaluate(() => Array.from(
    document.querySelectorAll('#remindersInline .vild-rem-sec-over > *'),
  ).filter((el) => !el.classList.contains('vild-rem-sec-head'))
    .map((el) => (el.classList.contains('vild-rem-cat-head')
      ? { naglowek: el.getAttribute('data-vild-cat') }
      : { wiersze: Array.from(el.querySelectorAll('.vild-rem-nm')).map((n) => n.textContent) })));

  expect(uklad, 'kontrole przed procedurami — stała kolejność kategorii').toEqual([
    { naglowek: 'followup' },
    { wiersze: ['Damian Kontrolny', 'Bartek Kontrolny'] },
    { naglowek: 'procedura' },
    { wiersze: ['Cecylia Proceduralna', 'Anna Proceduralna'] },
  ]);
});

test('Z7 — zwinięcie sekcji „Zaległe" też jedzie w payloadzie synchronizacji', async ({ page }) => {
  // Sekcję „Zaległe” dało się zwijać już od PR #28 (vilda_reminders_collapse.js), ale jej stan
  // siedział wyłącznie w localStorage tego jednego urządzenia. Właściciel poprosił o pamięć
  // stanu sekcji między urządzeniami, więc i ta przeszła na preferencję `cloud-synced`.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(async () => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const pac = await V.savePatient({ name: 'Halina Zaległa' });
    await V.savePatientNote({
      patientId: pac.id || pac.patientId, title: 'Wpis', body: '', category: 'followup',
      dueDateISO: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, dueTime: null,
    });
  });
  await pokazKarte(page);

  await page.evaluate(() => document.querySelector(
    '#remindersInline .vild-rem-sec-over > .vild-rem-sec-head',
  ).click());
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('vrc-overdue-collapsed')),
    'sekcja zwinięta zaraz po kliknięciu',
  ).toBe(true);

  const wPayloadzie = await page.evaluate(async () => {
    const pl = await window.VildaVault.exportSyncPayload();
    return (pl.userPreferences || {}).remindersOverdueCollapsed || null;
  });
  expect(wPayloadzie, 'stan sekcji „Zaległe" jest w payloadzie').toBeTruthy();
  expect(wPayloadzie.value).toBe('true');

  await pokazKarte(page);
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('vrc-overdue-collapsed')),
    'po przeładowaniu sekcja nadal zwinięta',
  ).toBe(true);
});
