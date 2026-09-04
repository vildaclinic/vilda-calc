import { expect, test } from '../support/test-czas.mjs';

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

  test('siatka z dyżurem nocnym kończy się na dobie: upuszczenie na ostatni wiersz zapisuje poprawną godzinę', async ({
    page,
  }) => {
    // Do PR 7 yr() rozciągało siatkę do końca najpóźniejszego zdarzenia, więc nocny dyżur 19:00 + 12 h
    // dokładał wiersze „24:00”…„30:30” — a upuszczenie na taki wiersz zapisywało godzinę, której regex
    // sejfu /^([01]\d|2[0-3]):[0-5]\d$/ nie przyjmuje: notatka CICHO traciła dueTime i wpadała do pasa
    // „cały dzień”. Od PR 7 siatka kończy się na dobie, więc strażnik pilnuje obu rzeczy naraz: że
    // dyżur nocny nie rozciąga już siatki i że upuszczenie na ostatni wiersz daje godzinę mieszczącą blok.
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
    expect(koniecSiatki, 'dyżur nocny nie rozciąga już siatki poza dobę').toBe(1440);
    const docelowaMinuta = g0.startMin + (g0.wierszy - 1) * 30;
    expect(docelowaMinuta, 'celem jest ostatni wiersz doby (23:30)').toBe(1410);

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


// ---------------------------------------------------------------------------------------------
// Siatka domknięta do doby + ślad wydarzenia z poprzedniego dnia (decyzja właściciela 2026-09-03).

test.describe('Siatka nie wychodzi poza dobę, a ogon dyżuru widać następnego dnia', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * Poniedziałek bieżącego tygodnia i następujący po nim wtorek — LICZONE W PRZEGLĄDARCE.
   *
   * Siatka tygodnia rysuje dokładnie siedem kolumn, poniedziałek→niedziela: `Jt()` liczy start
   * jako `data − (getDay()+6)%7`, a `Pr()` generuje z niego siedem dni; atrybuty `data-add-day`
   * i `data-goto-day` istnieją TYLKO dla tej siódemki. Zasiew na „dziś" sprawiał więc, że
   * w NIEDZIELĘ „jutro" wypadało poza tydzień: selektor zwracał null i test padał — przez całą
   * lokalną niedzielę, czyli co siódme uruchomienie CI. Zasiew na poniedziałek daje „jutro" =
   * wtorek, zawsze drugą kolumnę siatki, niezależnie od dnia tygodnia, zmiany czasu i granicy
   * miesiąca. Kolumnę wyznacza strefa przeglądarki (Europe/Warsaw z konfiguracji Playwrighta),
   * bo to ona wyznacza `c.anchorISO` przez `Q()` — kontener chodzi w UTC i policzyłby inny dzień.
   */
  const tydzienOd = (page) => page.evaluate(() => {
    const p = (x) => String(x).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const pon = new Date();
    pon.setDate(pon.getDate() - ((pon.getDay() + 6) % 7));
    const dodaj = (n) => { const d = new Date(pon); d.setDate(d.getDate() + n); return iso(d); };
    return {
      poniedzialek: iso(pon), wtorek: dodaj(1), niedziela: dodaj(6), poniedzialekZa: dodaj(7),
    };
  });

  test('dyżur 19:00 + 12 h: brak wierszy „24:00"…„30:30", blok przycięty do doby, żeton „z wczoraj" nazajutrz', async ({
    page,
  }) => {
    // Przed zmianą yr() rozciągało siatkę do końca zdarzenia (1860 min), więc jeden nocny dyżur
    // dokładał ~13 wierszy etykietowanych „24:00"…„30:30" KAŻDEMU dniu tygodnia — a po naprawie
    // I10 (PR 4) i tak nie dało się w nich nic upuścić. Teraz siatka kończy się na dobie, blok jest
    // przycięty, a informacja o trwaniu wydarzenia idzie podpisem „(+1 dz.)" i żetonem nazajutrz.
    await otworzTerminarz(page);
    const { poniedzialek, wtorek } = await tydzienOd(page);
    const pid = await zapiszPacjenta(page, 'Nocny Dyzurny');
    const id = await zapiszNotatke(page, {
      patientId: pid,
      title: 'Nocny dyzur',
      body: '',
      category: 'duty',
      dueDateISO: poniedzialek,
      dueTime: '19:00',
      durationMin: 720,
    });

    await page.evaluate(() => window.VildaTerminarz.setView('week'));
    await odswiez(page);
    await page.locator('.tz-wx').waitFor({ state: 'attached' });

    const etykiety = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tz-wx__bodyrel .tz-wx__hh')).map((el) => el.textContent.trim()),
    );
    expect(etykiety.length, 'siatka ma wiersze').toBeGreaterThan(0);
    expect(
      etykiety.filter((t) => /^(2[4-9]|3\d):/.test(t)),
      `etykiety poza dobą: ${JSON.stringify(etykiety)}`,
    ).toEqual([]);
    expect(etykiety[etykiety.length - 1], 'ostatni wiersz to 23:30').toBe('23:30');

    // Blok dyżuru nie wystaje poniżej siatki.
    const geometria = await page.evaluate((noteId) => {
      const blok = document.querySelector(`.tz-wb[data-note-id="${noteId}"]:not(.tz-wb--tail)`);
      const body = document.querySelector('.tz-wx__bodyrel');
      if (!blok || !body) return null;
      const b = blok.getBoundingClientRect();
      const g = body.getBoundingClientRect();
      return { dolBloku: Math.round(b.bottom), dolSiatki: Math.round(g.bottom), podpis: blok.textContent };
    }, id);
    expect(geometria, 'blok i siatka są w DOM').toBeTruthy();
    expect(geometria.dolBloku, 'blok kończy się w obrębie siatki').toBeLessThanOrEqual(geometria.dolSiatki + 2);
    expect(geometria.podpis, 'podpis nadal podaje prawdziwy koniec').toContain('07:00 (+1 dz.)');

    // Żeton „z wczoraj" w wierszu całodniowym następnego dnia — klikalny, ale nieprzeciągalny.
    const zeton = await page.evaluate(
      (a) => {
        const komorka = document.querySelector(`.tz-wx__cell--all[data-add-day="${a.jutro}"]`);
        const el = komorka ? komorka.querySelector('.tz-wb--tail') : null;
        return el ? { tekst: el.textContent.trim(), noteId: el.getAttribute('data-note-id') } : null;
      },
      { jutro: wtorek },
    );
    expect(zeton, 'żeton „z wczoraj" jest w kolumnie następnego dnia').toBeTruthy();
    expect(zeton.tekst).toContain('z wczoraj');
    expect(zeton.tekst).toContain('do 07:00');
    expect(zeton.noteId, 'żeton wskazuje wpis źródłowy').toBe(id);

    // Widok dnia następnego (nagłówek kolumny przenosi do dnia): pasek „Z poprzedniego dnia".
    await klik(page, `.tz-wx__dh[data-goto-day="${wtorek}"]`);
    await odswiez(page);
    await page.locator('.tz-tail-row').waitFor({ state: 'attached', timeout: 8000 });
    const pasek = await page.evaluate(() => {
      const el = document.querySelector('.tz-tail-row');
      return { tekst: el.textContent.trim(), noteId: el.getAttribute('data-note-id') };
    });
    expect(pasek.tekst).toContain('do 07:00');
    expect(pasek.noteId, 'pasek wskazuje wpis źródłowy').toBe(id);

    // Klik w pasek otwiera popover wpisu z jego prawdziwą datą i zakresem.
    await klik(page, '.tz-tail-row');
    await page.locator('.tz-pop').waitFor({ state: 'attached' });
    const popover = await page.evaluate(() => document.querySelector('.tz-pop').textContent);
    expect(popover).toContain('19:00–07:00 (+1 dz.)');
  });

  test('krawędź tygodnia: ogon dyżuru z niedzieli widać dopiero po przejściu na następny tydzień', async ({
    page,
  }) => {
    // Test wyżej zasiewa na poniedziałek, żeby nie padał w każdą lokalną niedzielę. Ten przypadek
    // brzegowy — ogon przechodzący przez GRANICĘ TYGODNIA — zniknąłby wtedy z zestawu, więc
    // wraca tutaj i to jawnie: niedziela bieżącego tygodnia jest zawsze siódmą kolumną siatki,
    // niezależnie od dnia uruchomienia, więc test jest deterministyczny o każdej porze.
    //
    // Zachowanie jest ZAMIERZONE, nie zgubą: siatka rysuje dokładnie Pn→Nd (`Jt()`/`Pr()`),
    // więc poniedziałek po niedzielnym dyżurze należy już do następnego tygodnia. Dane nie giną —
    // `Fn()` ładuje dla widoku tygodnia zakres weekStart−1 … weekEnd, czyli po przejściu strzałką
    // „›" niedzielny wpis jest wczytany i żeton pojawia się w kolumnie poniedziałku.
    await otworzTerminarz(page);
    const { niedziela, poniedzialekZa } = await tydzienOd(page);
    const pid = await zapiszPacjenta(page, 'Niedzielny Dyzurny');
    const id = await zapiszNotatke(page, {
      patientId: pid,
      title: 'Niedzielny dyzur',
      body: '',
      category: 'duty',
      dueDateISO: niedziela,
      dueTime: '19:00',
      durationMin: 720,
    });

    await page.evaluate(() => window.VildaTerminarz.setView('week'));
    await odswiez(page);
    await page.locator('.tz-wx').waitFor({ state: 'attached' });

    // Sam dyżur jest w siatce (kontrola pozytywna — zasiew zadziałał)…
    const blokNiedzieli = await page.evaluate(
      (noteId) => Boolean(document.querySelector(`.tz-wb[data-note-id="${noteId}"]:not(.tz-wb--tail)`)),
      id,
    );
    expect(blokNiedzieli, 'blok niedzielnego dyżuru jest w bieżącym tygodniu').toBe(true);

    // …ale jego ogon nie, bo poniedziałek jest już poza tą siódemką kolumn.
    const ogonyWTygodniu = await page.evaluate(
      () => document.querySelectorAll('.tz-wx .tz-wb--tail').length,
    );
    expect(ogonyWTygodniu, 'w bieżącym tygodniu nie ma kolumny na poniedziałek').toBe(0);

    // Strzałka „›" — następny tydzień. Zakres ładowania to weekStart−1, więc niedziela wchodzi.
    await klik(page, '#tzNext');
    await odswiez(page);
    await page.locator('.tz-wx').waitFor({ state: 'attached' });
    const zeton = await page.evaluate((a) => {
      const komorka = document.querySelector(`.tz-wx__cell--all[data-add-day="${a.pon}"]`);
      const el = komorka ? komorka.querySelector('.tz-wb--tail') : null;
      return el ? { tekst: el.textContent.trim(), noteId: el.getAttribute('data-note-id') } : null;
    }, { pon: poniedzialekZa });
    expect(zeton, 'żeton jest w kolumnie poniedziałku następnego tygodnia').toBeTruthy();
    expect(zeton.tekst).toContain('z wczoraj');
    expect(zeton.tekst).toContain('do 07:00');
    expect(zeton.noteId, 'żeton wskazuje niedzielny wpis').toBe(id);
  });
});
