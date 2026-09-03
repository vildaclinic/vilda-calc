import { expect, test } from '@playwright/test';

// Audyt karty „Przypomnienia” (2026-09-03), etap 1 — P1, P2, P3.
//
// P1 — gn() wyznaczała „dziś” z Date.UTC(now.getUTC*), a podział na sekcje robi Fa() z lokalnych
//      składników daty. Na wschód od UTC wiersz stał w sekcji „Zaległe” z etykietą „dziś”
//      (zmierzone w Pacific/Auckland: lokalnie 2026-09-04, UTC 2026-09-03). gn() jest wspólna dla
//      karty „Przypomnienia”, modalu spod dzwoneczka i listy notatek w karcie pacjenta, więc
//      poprawka dotyczy wszystkich trzech.
// P2 — pętla licząca w odznace miała `break` w pętli ZEWNĘTRZNEJ i przerywała sumowanie notatek po
//      pierwszej grupie z zaległością: 2 grupy / 4 notatki dawały „(3 notatki)”.
// P3 — sejf sortuje notatki po dueDateISO i ignoruje dueTime, więc w obrębie doby kolejność brała
//      się z magazynu: wizyta 09:00 lądowała po czterech wpisach całodniowych. Karta sortuje teraz
//      sama: data rosnąco, a w obrębie doby wpisy całodniowe przed godzinowymi (decyzja właściciela
//      2026-09-03 — tak samo, jak siatka Terminarza rysuje żetony całodniowe nad siatką godzin).

const HASLO = 'E2e#Karta!2026rem';

/**
 * Otwiera stronę główną, zakłada użytkownika sejfu, zasiewa wpisy i pokazuje kartę.
 * Terminy podaje się jako `dniTemu` (0 = dziś) — daty liczy PRZEGLĄDARKA, bo tylko ona zna
 * strefę wymuszoną przez test; kontener testowy chodzi w UTC i policzyłby inną dobę.
 */
async function otworz(page, wpisy, opcje) {
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
  await page.evaluate(async ({ lista, opts }) => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    const dzien = (ile) => {
      const d = new Date();
      d.setDate(d.getDate() - ile);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    let wspolny = null;
    for (const w of lista) {
      let pid = wspolny;
      if (!pid) {
        const pac = await V.savePatient({ name: w.name });
        pid = pac.id || pac.patientId;
        if (opts && opts.tenSamPacjent) wspolny = pid;
      }
      await V.savePatientNote({
        patientId: pid, title: w.title, body: '',
        category: w.category || 'followup', dueDateISO: dzien(w.dniTemu), dueTime: w.time || null,
      });
    }
    if (opts && opts.dyzur) {
      // Dyżur pod pseudopacjentem aktywności, bez miejsca — tak zapisuje go Terminarz.
      await V.savePatientNote({
        patientId: V.ACTIVITY_PATIENT_ID || '__vilda_activity__', externalName: '',
        title: 'Dyżur nocny', category: 'duty', dueDateISO: dzien(0), dueTime: '23:55',
      });
    }
  }, { lista: wpisy, opts: opcje || {} });

  // Wejście na stronę z gotowymi danymi — odznaka dzwoneczka liczy się przy starcie.
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
  await page.waitForFunction(() => {
    const el = document.getElementById('remindersInline');
    return !!el && el.style.display !== 'none' && el.textContent.includes('Przypomnienia');
  }, null, { timeout: 20000 });
}

const wiersze = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#remindersInline .vild-rem-row'),
).map((r) => ({
  nazwa: r.querySelector('.vild-rem-nm')?.textContent,
  kiedy: r.querySelector('.vild-rem-when')?.textContent,
  sekcja: (r.closest('.vild-rem-sec')?.className || '').replace('vild-rem-sec ', ''),
})));

test.describe('P1 — Pacific/Auckland: lokalna doba wyprzedza UTC', () => {
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('etykieta wiersza zgadza się z sekcją, w której ten wiersz stoi', async ({ page }) => {
    await otworz(page, [
      { name: 'Anna Wczorajsza', title: 'Kontrola', dniTemu: 1 },
      { name: 'Bogdan Dzisiejszy', title: 'Kontrola', dniTemu: 0 },
    ]);

    const doby = await page.evaluate(() => ({
      lokalna: new Date().toLocaleDateString('sv'),
      utc: new Date().toISOString().slice(0, 10),
    }));
    // Test ma sens tylko wtedy, gdy obie doby są różne — inaczej nie odróżnia poprawki od jej braku.
    expect(doby.lokalna, 'strefa musi rozjeżdżać dobę lokalną z UTC').not.toBe(doby.utc);

    const w = await wiersze(page);
    const zalegly = w.find((x) => x.sekcja === 'vild-rem-sec-over');
    const dzisiejszy = w.find((x) => x.sekcja === 'vild-rem-sec-today');

    expect(zalegly?.nazwa).toBe('Anna Wczorajsza');
    expect(zalegly?.kiedy, 'wpis w sekcji „Zaległe” nie może twierdzić, że termin jest dziś')
      .toBe('wczoraj');
    expect(dzisiejszy?.nazwa).toBe('Bogdan Dzisiejszy');
  });
});

test.describe('P1 — kontrola pozytywna w Europe/Warsaw', () => {
  test.use({ timezoneId: 'Europe/Warsaw' });

  test('etykiety zaległości bez zmian w strefie zgodnej z dotychczasowym zachowaniem', async ({ page }) => {
    await otworz(page, [
      { name: 'Adam Przedwczorajszy', title: 'Kontrola', dniTemu: 2 },
      { name: 'Beata Wczorajsza', title: 'Kontrola', dniTemu: 1 },
    ]);
    const w = await wiersze(page);
    expect(w.map((x) => [x.nazwa, x.kiedy])).toEqual([
      ['Adam Przedwczorajszy', '2 dni temu'],
      ['Beata Wczorajsza', 'wczoraj'],
    ]);
  });
});

test('P3 — kolejność: data rosnąco, a w obrębie doby całodniowe przed godzinowymi', async ({ page }) => {
  // Kolejność zapisu przeplatana celowo tak, żeby oczekiwany wynik nie był ani nią, ani jej
  // odwrotnością — inaczej test przechodziłby także na kodzie sprzed poprawki.
  await otworz(page, [
    { name: 'Celina Poranna', title: 'Kontrola', dniTemu: 0, time: '09:00' },
    { name: 'Adam Przedwczorajszy', title: 'Kontrola', dniTemu: 2 },
    { name: 'Ewa Popoludniowa', title: 'Kontrola', dniTemu: 0, time: '15:30' },
    { name: 'Dorota Calodniowa', title: 'Kontrola', dniTemu: 0 },
    { name: 'Beata Wczorajsza', title: 'Kontrola', dniTemu: 1 },
  ]);

  const w = await wiersze(page);
  expect(w.map((x) => x.nazwa), 'najstarsze zaległości pierwsze, dziś: całodniowe → 09:00 → 15:30')
    .toEqual([
      'Adam Przedwczorajszy',
      'Beata Wczorajsza',
      'Dorota Calodniowa',
      'Celina Poranna',
      'Ewa Popoludniowa',
    ]);
  expect(w.map((x) => x.kiedy)).toEqual(['2 dni temu', 'wczoraj', 'dziś', '09:00', '15:30']);
});

test('P2 — tytuł odznaki liczy wszystkie notatki, także po grupie z zaległością', async ({ page }) => {
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
  // Pierwsza grupa ma zaległość i trzy notatki, druga — jedną. Przed poprawką sumowanie
  // przerywało się na pierwszej grupie i tytuł mówił „(3 notatki)” zamiast „(4 notatki)”.
  await page.evaluate(async () => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const dzis = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const y = new Date(Date.now() - 864e5);
    const wczoraj = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
    const a = await V.savePatient({ name: 'Jan Trójnotatkowy' });
    const aid = a.id || a.patientId;
    await V.savePatientNote({ patientId: aid, title: 'W1', body: '', category: 'followup', dueDateISO: wczoraj });
    await V.savePatientNote({ patientId: aid, title: 'W2', body: '', category: 'followup', dueDateISO: dzis, dueTime: '08:00' });
    await V.savePatientNote({ patientId: aid, title: 'W3', body: '', category: 'followup', dueDateISO: dzis, dueTime: '15:00' });
    const b = await V.savePatient({ name: 'Anna Jednonotatkowa' });
    await V.savePatientNote({ patientId: b.id || b.patientId, title: 'W4', body: '', category: 'followup', dueDateISO: dzis });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked());

  const przycisk = page.locator('#vildaRemindersBtn');
  // Po decyzji właściciela D2 (2026-09-03) wszystkie liczniki liczą notatki, nie grupy pacjentów.
  // Przed poprawką P2 sumowanie przerywało się na pierwszej grupie z zaległością i wychodziło 3.
  await expect(przycisk, 'odznaka liczy notatki').toHaveAttribute('data-count', '4');
  await expect(przycisk, 'tytuł nazywa liczbę przypomnień').toHaveAttribute('title', '4 przypomnienia do sprawdzenia');
});

test('P5 — chip, stopka i odznaka mówią tę samą liczbę: notatki, nie pacjentów', async ({ page }) => {
  // Jeden pacjent z trzema notatkami: przed decyzją D2 chip pokazywał „1" nad trzema wierszami,
  // a stopka zapraszała „Pokaż wszystkie (1)", choć modal pokazywał trzy pozycje.
  await otworz(page, [
    { name: 'Jan Trójnotatkowy', title: 'W1', dniTemu: 1 },
    { name: 'Jan Trójnotatkowy', title: 'W2', dniTemu: 0, time: '08:00' },
    { name: 'Jan Trójnotatkowy', title: 'W3', dniTemu: 0, time: '15:00' },
  ], { tenSamPacjent: true });

  const stan = await page.evaluate(() => {
    const el = document.getElementById('remindersInline');
    const btn = document.getElementById('vildaRemindersBtn');
    return {
      chip: el.querySelector('.vild-rem-chip')?.textContent,
      stopka: el.querySelector('.vild-rem-all')?.textContent,
      wierszy: el.querySelectorAll('.vild-rem-row').length,
      odznaka: btn ? btn.getAttribute('data-count') : null,
    };
  });
  expect(stan.wierszy, 'trzy notatki jednego pacjenta to trzy wiersze').toBe(3);
  expect(stan.chip, 'chip zgadza się z liczbą wierszy').toBe('3');
  expect(stan.stopka).toContain('Pokaż wszystkie (3)');
  expect(stan.odznaka, 'odznaka mówi to samo co karta').toBe('3');
});

test('P4 — wpis aktywności bez miejsca pokazuje tytuł, nie „—" z awatarem „?"', async ({ page }) => {
  await otworz(page, [{ name: 'Jan Kontrolny', title: 'Kontrola', dniTemu: 0 }], { dyzur: true });

  const wiersz = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#remindersInline .vild-rem-row'));
    const r = rows.find((x) => (x.querySelector('.vild-rem-cat')?.textContent || '').includes('Dyżur'));
    return r ? {
      nazwa: r.querySelector('.vild-rem-nm')?.textContent,
      kategoria: r.querySelector('.vild-rem-cat')?.textContent,
      awatar: r.querySelector('.vild-rem-av')?.textContent,
    } : null;
  });
  expect(wiersz, 'wiersz dyżuru jest w karcie').toBeTruthy();
  expect(wiersz.nazwa, 'tytuł wpisu zamiast pustego nazwiska').toBe('Dyżur nocny');
  expect(wiersz.nazwa).not.toBe('—');
  expect(wiersz.awatar, 'inicjał kategorii zamiast znaku zapytania').toBe('D');
  expect(wiersz.kategoria, 'kategoria zostaje w drugiej linii').toContain('Dyżur');
});

test('P6 — karta ma nagłówek i etykietę regionu dla czytnika ekranu', async ({ page }) => {
  await otworz(page, [{ name: 'Jan Kontrolny', title: 'Kontrola', dniTemu: 0 }]);
  const a11y = await page.evaluate(() => {
    const el = document.getElementById('remindersInline');
    const h = el.querySelector('h1,h2,h3,h4,h5,h6');
    return {
      region: el.getAttribute('role'),
      etykieta: el.getAttribute('aria-label'),
      naglowek: h ? { tag: h.tagName, tekst: h.textContent } : null,
    };
  });
  expect(a11y.region).toBe('region');
  expect(a11y.etykieta).toBe('Przypomnienia');
  expect(a11y.naglowek, 'tytuł karty jest nagłówkiem, nie zwykłym tekstem').toEqual({
    tag: 'H2', tekst: 'Przypomnienia',
  });
});
