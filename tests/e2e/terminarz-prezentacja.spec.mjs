import { expect, test } from '@playwright/test';

// Audyt Terminarza 2026-09-02, I10/D5/D6 — strażnicy prezentacji na REALNEJ stronie terminarz.html
// z prawdziwym sejfem (VildaVault, IndexedDB). Wzorzec i pomocniki jak w
// tests/e2e/terminarz-transakcje.spec.mjs: użytkownik zakładany w stronie przez VildaVault.createUser,
// warstwa auth-ui ukrywana stylem, kliknięcia dyspozycjonowane przez el.click() w page.evaluate.
//
// I10 — lr() przeliczało pozycję kursora na czas stałą 2 px/min, choć zr() dopasowuje slot 30-minutowy
//       do wysokości okna (48–60 px) i tą samą skalą gt() rysuje bloki oraz wskaźnik upuszczenia:
//       przy slocie 48 px celowanie w wiersz „14:00” zapisywało ~12:45, a wskaźnik uciekał ~120 px w górę.
// D5  — zdarzenie przechodzące przez północ pokazywało „19:00–23:59” (klamra 1439) zamiast
//       „19:00–07:00 (+1 dz.)”, a modal zajęcia prefillował koniec na „23:55” (klamra 1435).
// D6  — Cr() przycinało slot nadmiarowego pacjenta do 23:59, więc partia z listy oczekujących cicho
//       tworzyła duplikaty terminów; teraz podgląd oznacza „poza dobą” i blokuje oba przyciski „Umów”.

const HASLO = 'E2e#Prezentacja!2026x';

/** Otwiera /terminarz.html, tworzy użytkownika sejfu w stronie i zwraca pomocniki. */
async function otworzTerminarz(page) {
  const dialogi = [];
  page.on('dialog', async (d) => {
    dialogi.push({ typ: d.type(), tekst: d.message() });
    await d.accept();
  });
  // Bez sieci zewnętrznej (sync/cloud) — deterministycznie i szybko.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.addInitScript(() => {
    try {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
      localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
    } catch (_) {
      /* brak storage — pomiń */
    }
  });
  await page.goto('/terminarz.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(
    () => window.VildaVault.isUnlocked() && Boolean(document.getElementById('terminarzRoot')),
  );
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });
  await page.waitForTimeout(300);

  const today = await page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  return { dialogi, today };
}

const odswiez = async (page) => {
  await page.evaluate(() => window.VildaTerminarz.refresh());
  await page.waitForTimeout(700);
};

const zapiszPacjenta = (page, name) =>
  page.evaluate(
    async (n) => (await window.VildaVault.savePatient({ name: n, user: { age: 9, sex: 'M' } })).patientId,
    name,
  );

const zapiszNotatke = (page, dane) =>
  page.evaluate(async (d) => (await window.VildaVault.savePatientNote(d)).id, dane);

const notatka = (page, id) =>
  page.evaluate(async (i) => {
    const n = await window.VildaVault.getPatientNote(i);
    return n ? { dueDateISO: String(n.dueDateISO || '').slice(0, 10), dueTime: n.dueTime || null } : null;
  }, id);

async function klik(page, sel) {
  await page.locator(sel).first().waitFor({ state: 'attached' });
  await page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) throw new Error(`brak ${q}`);
    el.click();
  }, sel);
}

async function ustaw(page, sel, val) {
  await page.locator(sel).first().waitFor({ state: 'attached' });
  await page.evaluate(
    (a) => {
      const el = document.querySelector(a.sel);
      if (!el) throw new Error(`brak ${a.sel}`);
      el.value = a.val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel, val },
  );
}

// ---------------------------------------------------------------------------------------------
// I10 — skala przeciągania w widoku tygodnia (viewport 1280×800 wymusza slot < 60 px).

test.describe('I10 — drag&drop w widoku tygodnia liczy czas skalą siatki', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * Siatka bywa przerysowywana po odblokowaniu sejfu (deferred render + odświeżenie danych).
   * Czekamy, aż kontener .tz-wx utrzyma tożsamość przez 600 ms — chwyt bloku, którego węzeł
   * zaraz potem zostanie zastąpiony, nie uzbroiłby przeciągania (q.body === null).
   */
  async function czekajNaSpokojSiatki(page) {
    await page.waitForFunction(
      () => {
        const wx = document.querySelector('.tz-wx');
        if (!wx) return false;
        if (window.__tzWxNode !== wx) {
          window.__tzWxNode = wx;
          window.__tzWxOd = Date.now();
          return false;
        }
        return Date.now() - window.__tzWxOd > 600;
      },
      null,
      { timeout: 15000 },
    );
  }

  /** Chwyta blok i przekracza próg 6 px, po którym moduł uaktywnia przeciąganie i tworzy wskaźnik. */
  async function chwycBlok(page, noteId) {
    for (let proba = 1; proba <= 3; proba += 1) {
      await czekajNaSpokojSiatki(page);
      const start = await page.evaluate((i) => {
        const r = document.querySelector(`.tz-wb[data-note-id="${i}"]`).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + Math.min(8, r.height / 2) };
      }, noteId);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 15, start.y + 15, { steps: 3 });
      const uzbrojone = await page
        .locator('.tz-wx__dropind')
        .waitFor({ state: 'attached', timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (uzbrojone) return start;
      // Przerysowanie siatki w trakcie chwytu — puszczamy (bez celu nic się nie zapisuje) i próbujemy raz jeszcze.
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    throw new Error('nie udało się uzbroić przeciągania bloku w widoku tygodnia');
  }

  /**
   * Geometria siatki tygodnia zmierzona na PRAWDZIWYCH prostokątach DOM: prostokąt ciała, wysokość
   * wiersza (30 min), pierwsza minuta siatki oraz rect wiersza odpowiadającego zadanej minucie.
   * Celujemy w rect wiersza, a nie w wyliczony piksel — tak jak robi to lekarz patrzący na etykietę.
   */
  const geometria = (page, minuta) =>
    page.evaluate((min) => {
      const wx = document.querySelector('.tz-wx');
      const body = wx.querySelector('.tz-wx__bodyrel');
      const r = body.getBoundingClientRect();
      const wiersze = [...body.querySelectorAll('.tz-wx__row')];
      const startMin = parseInt(body.getAttribute('data-start-min'), 10) || 0;
      const idx = Math.round((min - startMin) / 30);
      const cel = wiersze[idx] ? wiersze[idx].getBoundingClientRect() : null;
      return {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        wiersz: wiersze[0].getBoundingClientRect().height,
        wierszy: wiersze.length,
        startMin,
        celTop: cel ? cel.top : null,
        celHeight: cel ? cel.height : null,
        dni: String(wx.getAttribute('data-days') || '').split(','),
      };
    }, minuta);

  test('przeciągnięcie wizyty 10:00 na wiersz „14:00” zapisuje 14:00, a wskaźnik trzyma się kursora', async ({
    page,
  }) => {
    const { today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Kinga Przeciagana');
    const id = await zapiszNotatke(page, {
      patientId: pid,
      title: 'Kontrola wzrostu',
      body: '',
      category: 'followup',
      dueDateISO: today,
      dueTime: '10:00',
      durationMin: 30,
    });

    await page.evaluate(() => window.VildaTerminarz.setView('week'));
    await odswiez(page);
    await page.locator('.tz-wx__bodyrel').waitFor({ state: 'attached' });
    await page.locator(`.tz-wb[data-note-id="${id}"]`).waitFor({ state: 'attached' });

    // Wiersz „14:00” w polu widzenia (siatka bywa wyższa niż okno).
    const g0 = await geometria(page, 14 * 60);
    expect(g0.celTop, 'siatka musi obejmować wiersz 14:00').not.toBeNull();
    expect(
      g0.wiersz,
      `slot ${g0.wiersz} px musi być niższy niż 60 px, inaczej stała 2 px/min była tam przypadkiem poprawna`,
    ).toBeLessThan(60);
    await page.evaluate((y) => {
      window.scrollTo(0, Math.max(0, y + window.scrollY - window.innerHeight / 2));
    }, g0.celTop);
    await page.waitForTimeout(250);

    await chwycBlok(page, id);

    // Geometrię celu bierzemy z ŻYWEJ siatki (start przeciągania chowa pasek narzędzi, więc
    // wiersze przesuwają się o kilkanaście pikseli) — kursor ląduje w górnej części wiersza „14:00”.
    const g = await geometria(page, 14 * 60);
    const kolumna = g.dni.indexOf(today);
    expect(kolumna, `dzień ${today} musi być w wyświetlonym tygodniu`).toBeGreaterThanOrEqual(0);
    const szerokoscKolumny = (g.width - 56) / 7;
    const celX = g.left + 56 + szerokoscKolumny * (kolumna + 0.5);
    const celY = g.celTop + g.celHeight * 0.2; // ≈6 min w głąb wiersza, w środku kubełka 15-minutowego

    await page.mouse.move(celX, celY, { steps: 8 });

    const wskaznik = await page.evaluate(() => {
      const el = document.querySelector('.tz-wx__dropind');
      if (!el || el.style.display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { etykieta: el.textContent.trim(), top: r.top, height: r.height };
    });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Wskaźnik upuszczenia pokazuje docelową godzinę i leży przy kursorze (nie „ucieka” o slot i więcej).
    expect(wskaznik, 'wskaźnik upuszczenia musi być widoczny nad siatką').toBeTruthy();
    expect(wskaznik.etykieta).toBe('14:00');
    expect(
      Math.abs(wskaznik.top - g.celTop),
      `wskaźnik ${wskaznik.top} vs wiersz „14:00” ${g.celTop} (kursor ${celY})`,
    ).toBeLessThanOrEqual(g.wiersz);

    // Zapis: dokładnie 14:00 (siatka 15-minutowa dopuszcza ±15 min względem celu).
    const zapis = await notatka(page, id);
    expect(zapis.dueDateISO).toBe(today);
    expect(zapis.dueTime).toBe('14:00');
    const minuty = Number(zapis.dueTime.slice(0, 2)) * 60 + Number(zapis.dueTime.slice(3));
    expect(Math.abs(minuty - 14 * 60)).toBeLessThanOrEqual(15);
  });

  test('siatka rozciągnięta poza dobę (dyżur nocny): upuszczenie na wiersz „25:00” zachowuje godzinę (dueTime \u2260 null)', async ({
    page,
  }) => {
    // yr() rozciąga siatkę do końca najpóźniejszego zdarzenia, więc nocny dyżur 19:00 + 12 h dokłada
    // wiersze etykietowane „24:00”…„30:30”. Koniec siatki liczony bez klamry doby pozwoliłby upuścić
    // blok na taki wiersz i zapisać „25:00”, czego regex sejfu /^([01]\d|2[0-3]):[0-5]\d$/ nie
    // przyjmuje — notatka CICHO straciłaby dueTime i wpadła do pasa „cały dzień”. Strażnik:
    // upuszczenie na wiersz spoza doby musi dać poprawną godzinę doby, mieszczącą cały blok.
    const { today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Nocna Rozciagajaca');
    await zapiszNotatke(page, {
      patientId: pid,
      title: 'Nocny dyzur',
      body: '',
      category: 'duty',
      dueDateISO: today,
      dueTime: '19:00',
      durationMin: 720,
    });
    const id = await zapiszNotatke(page, {
      patientId: pid,
      title: 'Kontrola wieczorna',
      body: '',
      category: 'followup',
      dueDateISO: today,
      dueTime: '21:00',
      durationMin: 30,
    });

    await page.evaluate(() => window.VildaTerminarz.setView('week'));
    await odswiez(page);
    await page.locator('.tz-wx__bodyrel').waitFor({ state: 'attached' });
    await page.locator(`.tz-wb[data-note-id="${id}"]`).waitFor({ state: 'attached' });

    const g0 = await geometria(page, 0);
    const koniecSiatki = g0.startMin + g0.wierszy * 30;
    expect(koniecSiatki, 'dyżur nocny musi rozciągnąć siatkę poza dobę').toBeGreaterThan(1440);
    const docelowaMinuta = Math.min(25 * 60, g0.startMin + (g0.wierszy - 1) * 30);
    expect(docelowaMinuta, 'wiersz celu musi leżeć poza dobą').toBeGreaterThan(1440);

    // Chwytany blok (21:00) i docelowy wiersz muszą być jednocześnie w polu widzenia —
    // kursor Playwrighta operuje we współrzędnych viewportu.
    const gb = await geometria(page, 21 * 60);
    await page.evaluate((y) => {
      window.scrollTo(0, Math.max(0, y + window.scrollY - window.innerHeight / 3));
    }, gb.celTop);
    await page.waitForTimeout(250);

    await chwycBlok(page, id);

    const g = await geometria(page, docelowaMinuta);
    const kolumna = g.dni.indexOf(today);
    expect(kolumna, `dzień ${today} musi być w wyświetlonym tygodniu`).toBeGreaterThanOrEqual(0);
    const szerokoscKolumny = (g.width - 56) / 7;
    const celX = g.left + 56 + szerokoscKolumny * (kolumna + 0.5);
    const celY = g.celTop + g.celHeight * 0.2;
    const wysokoscOkna = await page.evaluate(() => window.innerHeight);
    expect(celY, 'wiersz celu musi być w polu widzenia').toBeGreaterThan(0);
    expect(celY).toBeLessThan(wysokoscOkna);

    await page.mouse.move(celX, celY, { steps: 8 });
    const etykieta = await page.evaluate(() => {
      const el = document.querySelector('.tz-wx__dropind');
      return el && el.style.display !== 'none' ? el.textContent.trim() : null;
    });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
    expect(etykieta, 'wskaźnik upuszczenia musi być widoczny').toBeTruthy();
    expect(HHMM.test(etykieta), `wskaźnik pokazał godzinę spoza doby: ${etykieta}`).toBe(true);

    const zapis = await notatka(page, id);
    expect(zapis.dueDateISO).toBe(today);
    expect(zapis.dueTime, 'wizyta nie może cicho stracić godziny (wpis całodniowy)').not.toBeNull();
    expect(HHMM.test(zapis.dueTime), `zapisano godzinę spoza doby: ${zapis.dueTime}`).toBe(true);
    const minuty = Number(zapis.dueTime.slice(0, 2)) * 60 + Number(zapis.dueTime.slice(3));
    expect(minuty + 30, 'blok musi mieścić się w dobie').toBeLessThanOrEqual(1440);
  });
});

// ---------------------------------------------------------------------------------------------
// D5 — zdarzenie przechodzące przez północ.

test('D5 — dyżur 19:00 + 12 h pokazuje „19:00–07:00 (+1 dz.)” zamiast „19:00–23:59”', async ({ page }) => {
  const { today } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Nocny Dyzurny');
  const id = await zapiszNotatke(page, {
    patientId: pid,
    title: 'Nocny dyzur',
    body: '',
    category: 'duty',
    dueDateISO: today,
    dueTime: '19:00',
    durationMin: 720,
  });

  await page.evaluate(() => window.VildaTerminarz.setView('day'));
  await odswiez(page);
  await page.locator(`[data-note-id="${id}"]`).first().waitFor({ state: 'attached' });

  const tekstDnia = await page.evaluate(() => document.querySelector('#terminarzRoot').textContent);
  expect(tekstDnia).toContain('19:00–07:00 (+1 dz.)');
  expect(tekstDnia).not.toContain('19:00–23:59');
  expect(tekstDnia).not.toContain('19:00–23:55');

  // Popover po kliknięciu bloku podaje ten sam zakres.
  await klik(page, `[data-note-id="${id}"]`);
  await page.locator('.tz-pop').waitFor({ state: 'attached' });
  const tekstPopovera = await page.evaluate(() => document.querySelector('.tz-pop').textContent);
  expect(tekstPopovera).toContain('19:00–07:00 (+1 dz.)');
  expect(tekstPopovera).not.toContain('23:59');

  // Czyste funkcje modułu na tej samej stronie (prefill pola „koniec” w modalu zajęcia).
  const funkcje = await page.evaluate(() => {
    const I = window.VildaTerminarz.__internals;
    return {
      ne: I.Ne({ dueTime: '19:00', durationMin: 720, category: 'duty' }),
      qa: I.Qa('19:00', 720),
      dc: I.Dc('23:00', 120),
    };
  });
  expect(funkcje).toEqual({ ne: '19:00–07:00 (+1 dz.)', qa: '07:00', dc: '01:00 (+1 dz.)' });
});

// ---------------------------------------------------------------------------------------------
// D6 — partia z listy oczekujących wychodząca poza dobę.

test('D6 — partia 6 pacjentów od 23:00 co 15 min: ostrzeżenie „poza dobą” i zablokowany „Umów”', async ({
  page,
}) => {
  await otworzTerminarz(page);
  for (const name of ['Anna Partia', 'Bogdan Partia', 'Cecylia Partia', 'Damian Partia', 'Ewa Partia', 'Filip Partia']) {
    const pid = await zapiszPacjenta(page, name);
    await page.evaluate(
      async (p) =>
        window.VildaVault.savePatientNote({
          patientId: p,
          title: 'Gastroskopia',
          body: '',
          category: 'procedura',
          procedureType: 'Gastroskopia',
        }),
      pid,
    );
  }
  await page.evaluate(() => window.VildaTerminarz.setView('waitlist'));
  await odswiez(page);
  await page.locator('.tz-wl__chk[data-wl-sel]').first().waitFor({ state: 'attached' });
  await page.evaluate(() =>
    document.querySelectorAll('.tz-wl__chk[data-wl-sel]').forEach((c) => {
      if (!c.checked) c.click();
    }),
  );
  await klik(page, '#tzWlSchedule');
  await page.locator('#tzWlBatchOverlay').waitFor({ state: 'attached' });

  const podglad = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#tzWlbPreview .tz-wlb-tm')].map((e) => e.textContent.trim()),
    );
  const stanPrzyciskow = () =>
    page.evaluate(() => ({
      save: document.querySelector('#tzWlbSave').disabled,
      save2: document.querySelector('#tzWlbSave2').disabled,
    }));
  const ostrzezenie = () =>
    page.evaluate(() => {
      const t = document.querySelector('#tzWlbPreview').textContent || '';
      return t.includes('Poza dob') ? t.replace(/\s+/g, ' ').trim() : '';
    });

  // Godzina mieszcząca całą partię — brak ostrzeżenia, „Umów” aktywny.
  await ustaw(page, '#tzWlbStart', '09:00');
  expect(await podglad()).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15']);
  expect(await stanPrzyciskow()).toEqual({ save: false, save2: false });
  expect(await ostrzezenie()).toBe('');

  // 23:00 co 15 min — dwóch ostatnich pacjentów nie mieści się w dobie.
  await ustaw(page, '#tzWlbStart', '23:00');
  const sloty = await podglad();
  expect(sloty).toEqual(['23:00', '23:15', '23:30', '23:45', 'poza dobą', 'poza dobą']);
  expect(sloty.filter((s) => s === '23:59')).toEqual([]); // dawne ciche przycięcie
  expect(await ostrzezenie()).toContain('Poza dobą: 2 pacjenci');
  expect(await ostrzezenie()).toContain('zmniejsz odstęp');
  expect(await stanPrzyciskow()).toEqual({ save: true, save2: true });

  // Poprawienie godziny natychmiast odblokowuje zapis.
  await ustaw(page, '#tzWlbStart', '22:00');
  expect(await podglad()).toEqual(['22:00', '22:15', '22:30', '22:45', '23:00', '23:15']);
  expect(await ostrzezenie()).toBe('');
  expect(await stanPrzyciskow()).toEqual({ save: false, save2: false });
});
