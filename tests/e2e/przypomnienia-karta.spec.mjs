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
    const dzien = (ile) => {
      const d = new Date();
      d.setDate(d.getDate() - ile);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    for (const w of lista) {
      const pac = await V.savePatient({ name: w.name });
      await V.savePatientNote({
        patientId: pac.id || pac.patientId, title: w.title, body: '',
        category: w.category || 'followup', dueDateISO: dzien(w.dniTemu), dueTime: w.time || null,
      });
    }
  }, wpisy);

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
  await expect(przycisk, 'odznaka liczy pacjentów').toHaveAttribute('data-count', '2');
  await expect(przycisk, 'tytuł liczy wszystkie cztery notatki').toHaveAttribute('title', /4 notatki/);
});
