import { expect, test } from '@playwright/test';

// Testy strażnicze integralności zapisów w Terminarzu (vilda_terminarz.js) — pochodzą z audytu
// Terminarza z 2026-09-02 (znaleziska I3–I8, naprawione w PR 2). Każdy test odtwarza zmierzony
// scenariusz na REALNEJ stronie terminarz.html z prawdziwym sejfem (VildaVault, IndexedDB):
// użytkownik tworzony w stronie przez VildaVault.createUser, awarie zapisu wstrzykiwane przez
// jednorazową podmianę metody sejfu (savePatientNote / setWaitlistSchedule / removePatientNote)
// na funkcję odrzucającą N-te wywołanie, po czym wraca oryginał. Terminarz pobiera sejf przez
// window.VildaVault przy każdym otwarciu modala, więc podmiana metody na obiekcie działa.
//
// Kliknięcia wykonujemy przez el.click() w page.evaluate (jak w skryptach smoke audytu): elementy
// terminarza (popover, przyciski w overlay'ach o wysokim z-index) są nasłuchiwane na zdarzeniu
// click, a warstwa auth-ui/chrome ukryta stylami nie przeszkadza w dyspozycji zdarzenia.

const HASLO = 'E2e#Terminarz!2026x';

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const d10 = (s) => String(s || '').slice(0, 10);
const uniq = (arr) => [...new Set(arr)];

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
    // Wyłącz dzienny modal przypomnień, by nie przechwytywał kliknięć (tylko na potrzeby testu).
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
  const userId = await page.evaluate(
    async (pw) => (await window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 })).userId,
    HASLO,
  );
  await czekajNaTerminarz(page);

  const today = await page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  // Najbliższy przyszły poniedziałek — stały tydzień roboczy dla scenariuszy (bez weekendów).
  const dow = new Date(`${today}T12:00:00`).getDay();
  const D1 = addDays(today, (8 - dow) % 7 || 7);
  const D = (n) => addDays(D1, n - 1);

  return { dialogi, userId, today, D1, D };
}

async function czekajNaTerminarz(page) {
  await page.waitForFunction(
    () => window.VildaVault.isUnlocked() && Boolean(document.getElementById('terminarzRoot')),
  );
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });
  await page.waitForTimeout(300);
}

/** Po przeładowaniu: sesja wraca z sessionStorage (tryRestoreSession) albo odblokowujemy hasłem. */
async function odblokujPoReload(page, userId) {
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  const restored = await page
    .waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!restored) {
    await page.evaluate(
      async (a) => {
        await window.VildaVault.unlockUser(a.userId, a.pw);
      },
      { userId, pw: HASLO },
    );
  }
  await czekajNaTerminarz(page);
}

/** N-te wywołanie metody sejfu odrzuca (jednorazowo), potem wraca oryginał. */
async function uzbrojAwarie(page, metoda, ktoreWywolanie) {
  await page.evaluate(
    ({ metoda: m, at }) => {
      const v = window.VildaVault;
      const orig = v[m];
      let n = 0;
      v[m] = function () {
        n += 1;
        if (n === at) {
          v[m] = orig;
          return Promise.reject(new Error(`SYMULOWANA AWARIA ${m} #${n}`));
        }
        return orig.apply(v, arguments);
      };
    },
    { metoda, at: ktoreWywolanie },
  );
}

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

const wszystkieNotatki = (page) =>
  page.evaluate(async () =>
    (await window.VildaVault.listAllPatientNotes()).map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      dueDateISO: n.dueDateISO || null,
      dueTime: n.dueTime || null,
      seriesId: n.seriesId || null,
      completedAtISO: n.completedAtISO || null,
      patientId: n.patientId,
    })),
  );

const odswiez = async (page) => {
  await page.evaluate(() => window.VildaTerminarz.refresh());
  await page.waitForTimeout(700);
};

const zapiszPacjenta = (page, name) =>
  page.evaluate(
    async (n) => (await window.VildaVault.savePatient({ name: n, user: { age: 9, sex: 'M' } })).patientId,
    name,
  );

/** Widok tygodnia zawierający dzień D1 (od „Dziś” maks. 3 kroki w przód). */
async function idzDoTygodnia(page, D1) {
  await page.evaluate(() => window.VildaTerminarz.setView('week'));
  await page.waitForTimeout(300);
  await klik(page, '#tzToday');
  await page.waitForTimeout(400);
  for (let k = 0; k < 3; k += 1) {
    const jest = await page.evaluate(
      (d) => Boolean(document.querySelector(`.tz-wx__cell[data-add-day="${d}"]`)),
      D1,
    );
    if (jest) return;
    await klik(page, '#tzNext');
    await page.waitForTimeout(500);
  }
  throw new Error(`Nie znaleziono tygodnia z dniem ${D1}`);
}

async function otworzNowyTermin(page) {
  await klik(page, '#tzAddBtn');
  await page.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
}

async function wybierzPacjentaWModalu(page, fragmentNazwiska) {
  await page.locator('.tz-nt-item[data-pid]').first().waitFor({ state: 'attached' });
  await ustaw(page, '#tzNtSearch', fragmentNazwiska);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const el = document.querySelector('.tz-nt-item[data-pid]');
    if (!el) throw new Error('brak pacjenta na liście modala');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

const czyIsAbsence = (page, dzien) =>
  page.evaluate(
    (d) => Boolean(document.querySelector(`.tz-wx__cell[data-add-day="${d}"].is-absence`)),
    dzien,
  );

// ---------------------------------------------------------------------------------------------

test('I3 — seria nieobecności: awaria w środku i ponowny „Zapisz” nie tworzą duplikatów', async ({
  page,
}) => {
  // Audyt 2026-09-02, I3: seria zapisywana łańcuchem savePatientNote bez id; po błędzie ponowny
  // klik generował nowy seriesId i zapisywał od początku (8 wpisów zamiast 5, 3 nieusuwalne sieroty).
  const { D } = await otworzTerminarz(page);

  await page.evaluate(() => window.VildaTerminarz.setView('week'));
  await otworzNowyTermin(page);
  await klik(page, '#tzNtMode button[data-mode="absence"]');
  await ustaw(page, '#tzNtAbsFrom', D(1));
  await ustaw(page, '#tzNtAbsTo', D(5));

  await uzbrojAwarie(page, 'savePatientNote', 4);
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNtErr')).toContainText('Nie udało się zapisać nieobecności');
  await expect(page.locator('#tzNewTermOverlay')).toBeAttached();
  const po1 = (await wszystkieNotatki(page)).filter((n) => n.category === 'absence');
  expect(po1.length).toBe(3);

  // Ponowny „Zapisz” w tym samym modalu — dokończenie serii.
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  await page.waitForTimeout(500);
  const po2 = (await wszystkieNotatki(page)).filter((n) => n.category === 'absence');
  expect(po2.length).toBe(5);
  expect(uniq(po2.map((n) => n.seriesId)).length).toBe(1);
  expect(po2.every((n) => Boolean(n.seriesId))).toBe(true);
  expect(uniq(po2.map((n) => n.id)).length).toBe(5);
  expect(uniq(po2.map((n) => d10(n.dueDateISO))).sort()).toEqual([D(1), D(2), D(3), D(4), D(5)]);
});

test('I4 — partia z listy oczekujących: awaria procedury w środku, ponowny „Umów” bez drugiego follow-upu', async ({
  page,
}) => {
  // Audyt 2026-09-02, I4: błąd zapisu procedury w środku partii + ponowny „Umów” tworzył DRUGIE
  // przypomnienie „Wynik: …” dla pacjentów sprzed miejsca błędu.
  const { dialogi, D } = await otworzTerminarz(page);
  const pacjenci = [];
  for (const name of ['Adam Partiowy', 'Bartek Partiowy', 'Cezary Partiowy']) {
    const pid = await zapiszPacjenta(page, name);
    await page.evaluate(
      async (a) =>
        window.VildaVault.savePatientNote({
          patientId: a.pid,
          title: 'Gastroskopia',
          body: '',
          category: 'procedura',
          procedureType: 'Gastroskopia',
        }),
      { pid },
    );
    pacjenci.push(pid);
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
  await ustaw(page, '#tzWlbDate', D(4));
  await klik(page, '#tzWlbPendChk');

  // Kolejność zapisów: 1 = procedura A, 2 = wynik A, 3 = procedura B → awaria.
  await uzbrojAwarie(page, 'savePatientNote', 3);
  await klik(page, '#tzWlbSave');
  await expect.poll(() => dialogi.length).toBeGreaterThan(0);
  expect(dialogi[0].tekst).toContain('Nie udało się umówić');
  await expect(page.locator('#tzWlBatchOverlay')).toBeAttached();
  await expect(page.locator('#tzWlbSave')).toBeEnabled();

  await klik(page, '#tzWlbSave');
  await expect(page.locator('#tzWlBatchOverlay')).toHaveCount(0);
  await page.waitForTimeout(500);
  const all = await wszystkieNotatki(page);
  const naPacjenta = pacjenci.map((pid) => ({
    procZTerminem: all.filter((n) => n.patientId === pid && n.category === 'procedura' && n.dueDateISO).length,
    procBezTerminu: all.filter((n) => n.patientId === pid && n.category === 'procedura' && !n.dueDateISO).length,
    wynik: all.filter((n) => n.patientId === pid && n.category === 'wynik-badania').length,
  }));
  expect(naPacjenta).toEqual([
    { procZTerminem: 1, procBezTerminu: 0, wynik: 1 },
    { procZTerminem: 1, procBezTerminu: 0, wynik: 1 },
    { procZTerminem: 1, procBezTerminu: 0, wynik: 1 },
  ]);
});

test('I4 — partia z listy oczekujących: awaria follow-upu „wynik-badania” jest sygnalizowana, pacjent umówiony', async ({
  page,
}) => {
  // Audyt 2026-09-02, I4 (klinicznie najgroźniejsze): błąd zapisu samego follow-upu był połykany
  // cichym catch — pacjent umówiony bez przypomnienia o wyniku i bez sygnału dla lekarza.
  const { dialogi, D } = await otworzTerminarz(page);
  const pacjenci = [];
  for (const name of ['Daniel Wynikowy', 'Emil Wynikowy']) {
    const pid = await zapiszPacjenta(page, name);
    await page.evaluate(
      async (a) =>
        window.VildaVault.savePatientNote({
          patientId: a.pid,
          title: 'Kolonoskopia',
          body: '',
          category: 'procedura',
          procedureType: 'Kolonoskopia',
        }),
      { pid },
    );
    pacjenci.push(pid);
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
  await ustaw(page, '#tzWlbDate', D(5));
  await klik(page, '#tzWlbPendChk');

  // 2. wywołanie = follow-up „Wynik” pierwszego pacjenta → awaria.
  await uzbrojAwarie(page, 'savePatientNote', 2);
  await klik(page, '#tzWlbSave');
  await expect(page.locator('#tzWlBatchOverlay')).toHaveCount(0);
  await expect.poll(() => dialogi.length).toBeGreaterThan(0);
  expect(dialogi.length).toBe(1);
  expect(dialogi[0].tekst).toContain('Daniel Wynikowy');
  expect(dialogi[0].tekst).toMatch(/Wynik/);

  await page.waitForTimeout(400);
  const all = await wszystkieNotatki(page);
  const naPacjenta = pacjenci.map((pid) => ({
    procZTerminem: all.filter((n) => n.patientId === pid && n.category === 'procedura' && n.dueDateISO).length,
    wynik: all.filter((n) => n.patientId === pid && n.category === 'wynik-badania').length,
  }));
  // Pacjent 1 umówiony (bez follow-upu — lekarz dostał komunikat), pacjent 2 w komplecie.
  expect(naPacjenta).toEqual([
    { procZTerminem: 1, wynik: 0 },
    { procZTerminem: 1, wynik: 1 },
  ]);
  // Umówieni pacjenci zniknęli z listy oczekujących — ponowny „Umów” nie ma czego zdublować.
  await odswiez(page);
  await expect(page.locator('.tz-wl__chk[data-wl-sel]')).toHaveCount(0);
});

test('I5 — „Usuń całą serię” zachowuje odnotowane (wykonane) podania leku', async ({ page }) => {
  // Audyt 2026-09-02, I5: Sa(t,null) kasowało też wpisy z completedAtISO (podane dawki) —
  // trwała utrata historii dawek, potwierdzenie „Na pewno usunąć całą serię?” nie uprzedzało.
  const { dialogi, D, D1 } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Ola Seriowa');
  const ids = [];
  for (let k = 1; k <= 3; k += 1) {
    const id = await page.evaluate(
      async (a) =>
        (
          await window.VildaVault.savePatientNote(
            Object.assign(
              {
                patientId: a.pid,
                title: 'Lek X',
                body: '',
                category: 'treatment',
                dueDateISO: a.d,
                dueTime: '09:00',
                seriesId: 'S-I5-e2e',
              },
              a.done ? { completedAtISO: new Date().toISOString() } : {},
            )
          )
        ).id,
      { pid, d: D(k), done: k === 1 },
    );
    ids.push(id);
  }
  await idzDoTygodnia(page, D1);
  await odswiez(page);
  await page.locator(`.tz-wb[data-note-id="${ids[2]}"]`).waitFor({ state: 'attached' });
  await klik(page, `.tz-wb[data-note-id="${ids[2]}"]`);
  await page.locator('.tz-pop button[data-pop="delseries"]').waitFor({ state: 'attached' });
  await klik(page, '.tz-pop button[data-pop="delseries"]'); // uzbrojenie („Na pewno…?”)
  await klik(page, '.tz-pop button[data-pop="delseries"]'); // wykonanie

  await expect.poll(() => dialogi.length).toBeGreaterThan(0);
  const potwierdzenie = dialogi.find((d) => d.typ === 'confirm');
  expect(potwierdzenie, JSON.stringify(dialogi)).toBeTruthy();
  expect(potwierdzenie.tekst).toMatch(/zachowan/i);
  expect(potwierdzenie.tekst).toMatch(/2 zaplanowane wpisy/);

  await expect
    .poll(async () => (await wszystkieNotatki(page)).filter((n) => n.seriesId === 'S-I5-e2e').length)
    .toBe(1);
  const zostaly = (await wszystkieNotatki(page)).filter((n) => n.seriesId === 'S-I5-e2e');
  expect(zostaly[0].id).toBe(ids[0]);
  expect(Boolean(zostaly[0].completedAtISO)).toBe(true);
  expect(d10(zostaly[0].dueDateISO)).toBe(D(1));
});

test('Przełóż o … liczy nową datę z rekordu w sejfie, nie z kopii w widoku', async ({ page }) => {
  // Krawędź „a” z kontroli PR 5 (#170): Mn() brało datę bazową z kopii wpisu trzymanej przez
  // widok/popover (pt(t) || Q()), więc gdy wizyta została w tle przesunięta (scalanie z innego
  // urządzenia, którego moduł jeszcze nie zdążył pokazać), „+1 tydzień” liczyło od NIEAKTUALNEJ
  // daty i zapisywało stary termin — zapis bez widocznego skutku (payload jest intencyjny, więc
  // pozostałe pola ocalały). Nieaktualność kopii odtwarzamy zamrażając listę, z której moduł
  // buduje widok; sam odczyt pojedynczej notatki (getPatientNote) zostaje prawdziwy.
  const { D, D1 } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Renata Przekladana');
  // Kategoria inna niż „followup”: tylko wtedy jest akcja „Przełóż” (followup ma „Nie zgłosił się”).
  const id = await page.evaluate(
    async (a) =>
      (
        await window.VildaVault.savePatientNote({
          patientId: a.pid,
          title: 'Obserwacja',
          body: '',
          category: 'observation',
          dueDateISO: a.d,
          dueTime: '09:00',
        })
      ).id,
    { pid, d: D(1) },
  );

  await idzDoTygodnia(page, D1);
  await odswiez(page);
  await page.locator(`.tz-wb[data-note-id="${id}"]`).waitFor({ state: 'attached' });

  // Od tej chwili moduł widzi zamrożoną listę — jego kopia wpisu przestaje nadążać za sejfem.
  await page.evaluate(() => {
    const v = window.VildaVault;
    ['listPatientNotesInRange', 'listPatientNotesDueByDate'].forEach((nazwa) => {
      const orig = v[nazwa].bind(v);
      const cache = new Map();
      v[nazwa] = async function zamrozony(...args) {
        const klucz = JSON.stringify(args);
        if (!cache.has(klucz)) cache.set(klucz, await orig(...args));
        return cache.get(klucz);
      };
    });
  });
  // Jedno odświeżenie JESZCZE przed zmianą w tle — od teraz moduł widzi tylko tę migawkę.
  await odswiez(page);

  // W TLE (jak scalanie z innego urządzenia) wizyta przenosi się o dwa dni.
  await page.evaluate(
    async (a) => {
      await window.VildaVault.savePatientNote({ id: a.id, patientId: a.pid, dueDateISO: a.d });
    },
    { id, pid, d: D(3) },
  );
  await expect
    .poll(async () =>
      page.evaluate(
        async (i) => String((await window.VildaVault.getPatientNote(i)).dueDateISO).slice(0, 10),
        id,
      ),
    )
    .toBe(D(3));
  // Widok nadal pokazuje wpis w starym dniu — dokładnie ta sytuacja, w której klika lekarz.
  expect(
    await page.evaluate(
      (noteId) => Boolean(document.querySelector(`.tz-wb[data-note-id="${noteId}"]`)),
      id,
    ),
    'widok trzyma nieaktualną kopię wpisu',
  ).toBe(true);

  // Popover → „Przełóż” → „+1 tydzień”, wszystko na nieaktualnej kopii.
  await page.evaluate((noteId) => {
    document.querySelector(`.tz-wb[data-note-id="${noteId}"]`).click();
    const b = document.querySelector('.tz-pop button[data-pop="postpone"]');
    if (!b) throw new Error('brak przycisku „Przełóż” w popoverze');
    b.click();
    const plus = Array.from(document.querySelectorAll('.tz-postpone-menu button')).find(
      (x) => (x.textContent || '').indexOf('+1 tydzie') === 0,
    );
    if (!plus) throw new Error('brak przycisku „+1 tydzień” w menu');
    plus.click();
  }, id);

  // +1 tydzień ma być liczone od D(3) — aktualnej daty w sejfie — a nie od D(1) z kopii.
  await expect
    .poll(
      async () =>
        page.evaluate(
          async (i) => String((await window.VildaVault.getPatientNote(i)).dueDateISO).slice(0, 10),
          id,
        ),
      { timeout: 8000 },
    )
    .toBe(D(10));
  const po = await page.evaluate(async (i) => window.VildaVault.getPatientNote(i), id);
  expect(po.title, 'reszta pól nietknięta').toBe('Obserwacja');
  expect(po.dueTime, 'godzina nietknięta').toBe('09:00');
});

test('Seria podań leku: chip „Przelicz kolejne od nowej daty” nie kasuje przesunięcia na dzień roboczy', async ({
  page,
}) => {
  // Krawędź „b” z kontroli PR 5 (#170), wada zastana (kod sprzed PR 1): handler chipa
  // `.tzrx-reb` zapisywał decyzję jako `e[dzien] = { rebase }` — bez pola `mode`. Domyślne
  // przesunięcie kolizji na najbliższy dzień roboczy powstaje dopiero przy liczeniu dat, więc
  // sam klik w chip (bez wyboru trybu) kasował je i podanie zostawało w sobotę, mimo że dialog
  // przez cały czas pokazywał datę roboczą.
  const { D, D1, dialogi } = await otworzTerminarz(page);
  await zapiszPacjenta(page, 'Lucjan Sobotni');

  await otworzNowyTermin(page);
  await wybierzPacjentaWModalu(page, 'Sobotni');
  await klik(page, '#tzNtCats .tz-ntcat[data-cat="treatment"]');
  await ustaw(page, '#tzNtDate', D1);
  await klik(page, '#tzNtRxStep .tz-ntcat[data-step="custom"]');
  await ustaw(page, '#tzNtRxStepInput', '5'); // poniedziałek + 5 dni = sobota
  await klik(page, '#tzNtSave');

  const sobota = D(6); // D1 + 5 dni
  await page.locator(`#tzRxDlg [data-sched="${sobota}"]`).waitFor({ state: 'attached' });

  const stanChipow = (dzien) =>
    page.evaluate(
      (d) => {
        const wiersz = document.querySelector(`#tzRxDlg [data-sched="${d}"]`);
        if (!wiersz) return null;
        const chip = (sel) => {
          const el = wiersz.querySelector(sel);
          return el ? el.className.indexOf(' on') >= 0 || el.classList.contains('on') : null;
        };
        return {
          zostaw: chip('.tzrx-act[data-act="leave"]'),
          roboczy: chip('.tzrx-act[data-act="shift"]'),
          przenies: chip('.tzrx-act[data-act="manual"]'),
        };
      },
      dzien,
    );

  expect(await stanChipow(sobota), 'domyślnie zaznaczone przesunięcie na dzień roboczy').toEqual({
    zostaw: false,
    roboczy: true,
    przenies: false,
  });

  // Klik w chip przeliczania — BEZ dotykania chipów trybu.
  await klik(page, `#tzRxDlg [data-sched="${sobota}"] .tzrx-reb[data-reb="single"]`);
  expect(
    await stanChipow(sobota),
    'chip przeliczania nie może skasować wyboru „najbliższy roboczy”',
  ).toEqual({ zostaw: false, roboczy: true, przenies: false });

  await klik(page, '#tzRxDlg #tzRxSave');
  await expect
    .poll(async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'treatment').length)
    .toBeGreaterThan(1);
  const podania = (await wszystkieNotatki(page))
    .filter((n) => n.category === 'treatment')
    .map((n) => d10(n.dueDateISO));
  const weekendy = podania.filter((d) => {
    const dow = new Date(`${d}T12:00:00`).getDay();
    return dow === 0 || dow === 6;
  });
  expect(weekendy, `podania w weekend: ${JSON.stringify(podania)}`).toEqual([]);
  expect(podania, 'sobotnia kolizja nie została zapisana w sobotę').not.toContain(sobota);
  expect(podania, 'kolizja wylądowała w najbliższym dniu roboczym (piątek — reguła remisu silnika)')
    .toContain(D(5));
  expect(dialogi.filter((x) => x.typ === 'alert'), JSON.stringify(dialogi)).toEqual([]);
});

test('Widok serii ostrzega o nierównych odstępach i czyści martwy klucz po PR 3', async ({ page }) => {
  // Serie miesięczne zapisane przed poprawką silnika dat (PR 3) mają luki — daty są
  // materializowane przy zapisie, więc nic ich później nie przelicza, a reguła serii nie jest
  // przechowywana dla serii nieobecności/zajęć (tylko seriesId), więc automatyczna naprawa
  // musiałaby zgadywać intencję. Zamiast tego widok serii liczy rozrzut odstępów i ostrzega.
  const { D, D1 } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Seweryn Nierowny');
  const dni = [D(1), D(32), D(93)]; // odstępy 31 i 61 dni — luka po pominiętym miesiącu
  const ids = [];
  for (let k = 0; k < dni.length; k += 1) {
    const id = await page.evaluate(
      async (a) =>
        (
          await window.VildaVault.savePatientNote({
            patientId: a.pid,
            title: 'Lek Y',
            body: '',
            category: 'treatment',
            dueDateISO: a.d,
            dueTime: '09:00',
            seriesId: 'S-LUKA-e2e',
          })
        ).id,
      { pid, d: dni[k] },
    );
    ids.push(id);
  }

  // Martwy klucz sprzed PR 3 znika przy starcie modułu.
  await page.evaluate(() => localStorage.setItem('vilda-tz-rx-rebase-v1', 'full'));
  await page.reload({ waitUntil: 'load' });
  await odblokujPoReload(page, (await page.evaluate(() => window.VildaVault.getCurrentUser().userId)));
  expect(
    await page.evaluate(() => localStorage.getItem('vilda-tz-rx-rebase-v1')),
    'nieużywany od PR 3 klucz jest sprzątany',
  ).toBe(null);

  await idzDoTygodnia(page, D1);
  await odswiez(page);
  await page.locator(`.tz-wb[data-note-id="${ids[0]}"]`).waitFor({ state: 'attached' });
  await page.evaluate((noteId) => {
    document.querySelector(`.tz-wb[data-note-id="${noteId}"]`).click();
    const b = document.querySelector('.tz-pop button[data-pop="series"]');
    if (!b) throw new Error('brak przycisku „Pokaż całą serię”');
    b.click();
  }, ids[0]);

  await page.locator('#tzSeriesDlg').waitFor({ state: 'attached' });
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#tzSeriesDlg').textContent))
    .toContain('Odstępy w tej serii są nierówne');
  const tekst = await page.evaluate(() => document.querySelector('#tzSeriesDlg').textContent);
  expect(tekst, 'ostrzeżenie podaje zmierzony rozrzut').toContain('od 31 do 61 dni');
});

test('I6 — rezerwacja terminu listy: awaria harmonogramu i ponowny „Zapisz” dają dokładnie jedną notatkę', async ({
  page,
}) => {
  // Audyt 2026-09-02, I6: najpierw zapis notatki-rezerwacji, potem setWaitlistSchedule — porażka
  // harmonogramu zostawiała blok 🔒 bez harmonogramu, a retry tworzył KOLEJNĄ notatkę.
  const { dialogi, D } = await otworzTerminarz(page);
  await page.evaluate(async () => {
    await window.VildaVault.addWaitlistList('Biopsja tarczycy');
  });
  await page.evaluate(() => window.VildaTerminarz.setView('waitlist'));
  await odswiez(page);
  await page.locator('[data-wl-sched]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const b =
      [...document.querySelectorAll('[data-wl-sched]')].find((x) =>
        /Biopsja/i.test(x.getAttribute('data-wl-sched') || ''),
      ) || document.querySelector('[data-wl-sched]');
    b.click();
  });
  await page.locator('#tzSchedOverlay').waitFor({ state: 'attached' });
  await ustaw(page, '#tzSchedDate', D(3));
  await ustaw(page, '#tzSchedTime', '10:00');
  await page.evaluate(() => {
    const c = document.querySelector('#tzSchedResv');
    if (!c.checked) c.click();
  });

  const rezerwacje = async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'reservation');
  const harmonogramy = () => page.evaluate(async () => window.VildaVault.getWaitlistSchedules());

  await uzbrojAwarie(page, 'setWaitlistSchedule', 1);
  await klik(page, '#tzSchedSave');
  await expect.poll(() => dialogi.length).toBeGreaterThan(0);
  expect(dialogi[0].tekst).toMatch(/Nie udało się/);
  await expect(page.locator('#tzSchedOverlay')).toBeAttached();
  await page.waitForTimeout(300);
  // Sedno I6: porażka harmonogramu nie może zostawić osieroconej notatki-rezerwacji (blok 🔒).
  expect((await rezerwacje()).length).toBe(0);
  expect(Object.keys((await harmonogramy()) || {}).length).toBe(0);

  await klik(page, '#tzSchedSave');
  await expect(page.locator('#tzSchedOverlay')).toHaveCount(0);
  await page.waitForTimeout(500);
  const rez = await rezerwacje();
  const harm = (await harmonogramy()) || {};
  expect(rez.length).toBe(1);
  const klucze = Object.keys(harm);
  expect(klucze.length).toBe(1);
  expect(harm[klucze[0]].reservationNoteId).toBe(rez[0].id);
  expect(harm[klucze[0]].dateISO).toBe(D(3));
  expect(rez[0].dueTime).toBe('10:00');
});

test('I7 — cache dni nieobecności: brak fantomu po odrzuconym zapisie i po usunięciu na innym urządzeniu', async ({
  page,
}) => {
  // Audyt 2026-09-02, I7: cache bt mutowany PRZED rozstrzygnięciem promes bez rollbacku; In()
  // czyścił bt tylko dla dni obecnych w notesByDay → fantomowy „dzień wolny” (fałszywe ostrzeżenie
  // „Dzień nieobecności” przy umawianiu, oznaczenie w widoku tygodnia) aż do przeładowania strony.
  const { D, D1 } = await otworzTerminarz(page);
  const pid = await zapiszPacjenta(page, 'Filip Fantomowy');

  // (a) prawdziwa nieobecność D2–D3, potem usunięcie D2 „na innym urządzeniu” + refresh.
  await idzDoTygodnia(page, D1);
  await otworzNowyTermin(page);
  await klik(page, '#tzNtMode button[data-mode="absence"]');
  await ustaw(page, '#tzNtAbsFrom', D(2));
  await ustaw(page, '#tzNtAbsTo', D(3));
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  await odswiez(page);
  expect(await czyIsAbsence(page, D(2))).toBe(true);
  expect(await czyIsAbsence(page, D(3))).toBe(true);

  const n2 = (await wszystkieNotatki(page)).find(
    (n) => n.category === 'absence' && d10(n.dueDateISO) === D(2),
  );
  expect(n2).toBeTruthy();
  await page.evaluate((id) => window.VildaVault.removePatientNote(id), n2.id);
  await odswiez(page);
  expect(await czyIsAbsence(page, D(2))).toBe(false);
  expect(await czyIsAbsence(page, D(3))).toBe(true);

  // (b) odrzucony zapis nieobecności D5 → umawianie pacjenta na D5 nie może pytać o „Dzień nieobecności”.
  await otworzNowyTermin(page);
  await klik(page, '#tzNtMode button[data-mode="absence"]');
  await ustaw(page, '#tzNtAbsFrom', D(5));
  await ustaw(page, '#tzNtAbsTo', D(5));
  await uzbrojAwarie(page, 'savePatientNote', 1);
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNtErr')).toContainText('Nie udało się zapisać nieobecności');
  await klik(page, '#tzNtCancel');
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  await odswiez(page);
  expect(await czyIsAbsence(page, D(5))).toBe(false);

  await otworzNowyTermin(page);
  await wybierzPacjentaWModalu(page, 'Fantomowy');
  await ustaw(page, '#tzNtTitle', 'Kontrola wzrostu');
  await ustaw(page, '#tzNtDate', D(5));
  await klik(page, '#tzNtSave');
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect(await page.locator('#tzAbsWarn').count()).toBe(0);
  const wizyty = (await wszystkieNotatki(page)).filter(
    (n) => n.patientId === pid && d10(n.dueDateISO) === D(5),
  );
  expect(wizyty.length).toBe(1);
});

test('K3 — usunięcie listy oczekujących: awaria sprzątania rezerwacji jest zgłaszana, lista nie znika, a ponowna próba domyka', async ({
  page,
}) => {
  // Kontrola końcowa audytu 2026-09-02, K3 (z I6): removeWaitlistList opakowywało sprzątanie
  // w try{}catch{} — przy awarii kasowania notatki-rezerwacji kończyło się CICHYM SUKCESEM:
  // lista znikała, a w kalendarzu zostawała osierocona rezerwacja (blok z kłódką) bez komunikatu
  // i bez ścieżki sprzątnięcia z UI. Awaria wstrzykiwana NAJNIŻEJ, jak się da (pierwsze
  // IDBObjectStore.delete rzuca), więc idzie przez całą ścieżkę sejfu, nie przez podmianę API.
  const { dialogi, D } = await otworzTerminarz(page);
  const rezerwacje = async () => (await wszystkieNotatki(page)).filter((n) => n.category === 'reservation');
  const harmonogramy = async () =>
    Object.keys((await page.evaluate(() => window.VildaVault.getWaitlistSchedules())) || {});
  const listy = async () => Object.keys(await page.evaluate(() => window.VildaVault.getWaitlistLists()));

  // Pusta lista z terminem i zarezerwowanym miejscem w kalendarzu (przycisk „Usuń listę”
  // pokazuje się tylko przy liście bez pacjentów).
  await page.evaluate(async () => {
    await window.VildaVault.addWaitlistList('Rezonans');
  });
  await page.evaluate(() => window.VildaTerminarz.setView('waitlist'));
  await odswiez(page);
  await page.locator('[data-wl-sched]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.querySelector('[data-wl-sched]').click());
  await page.locator('#tzSchedOverlay').waitFor({ state: 'attached' });
  await ustaw(page, '#tzSchedDate', D(3));
  await ustaw(page, '#tzSchedTime', '15:00');
  await page.evaluate(() => {
    const c = document.querySelector('#tzSchedResv');
    if (!c.checked) c.click();
  });
  await klik(page, '#tzSchedSave');
  await expect(page.locator('#tzSchedOverlay')).toHaveCount(0);
  await page.waitForTimeout(600);
  expect((await rezerwacje()).length).toBe(1);
  await odswiez(page);

  // Pierwsze delete() w IndexedDB rzuca — to dokładnie krok kasowania notatki-rezerwacji.
  await page.evaluate(() => {
    const proto = IDBObjectStore.prototype;
    const orig = proto.delete;
    let uzyte = false;
    proto.delete = function (...a) {
      if (!uzyte) {
        uzyte = true;
        proto.delete = orig;
        throw new Error('SYMULOWANA AWARIA IndexedDB.delete');
      }
      return orig.apply(this, a);
    };
  });
  const dialogowPrzed = dialogi.length;
  await page.locator('[data-wl-dellist]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.querySelector('[data-wl-dellist]').click());
  await expect.poll(() => dialogi.length).toBeGreaterThan(dialogowPrzed + 1); // confirm + alert
  await page.waitForTimeout(800);

  const komunikat = dialogi.slice(dialogowPrzed).map((d) => d.tekst).join(' || ');
  expect(komunikat, 'lekarz dostaje jawny komunikat zamiast cichego sukcesu').toContain(
    'Nie udało się usunąć listy',
  );
  expect(komunikat, 'komunikat mówi, czego nie udało się usunąć').toContain('rezerwacji');
  expect(komunikat, 'komunikat mówi, że reszta została bez zmian').toContain('pozostają bez zmian');

  // Stan po awarii jest spójny: nic nie znikło, w kalendarzu nie ma sieroty.
  expect(await listy(), 'lista NIE znika przy nieudanym sprzątaniu').toHaveLength(1);
  expect(await harmonogramy(), 'termin listy zostaje').toHaveLength(1);
  expect((await rezerwacje()).length, 'rezerwacja zostaje (brak sieroty i brak cichej utraty)').toBe(1);

  // Widok odświeżony po błędzie — przycisk „Usuń listę” znowu klikalny.
  await page.locator('[data-wl-dellist]').first().waitFor({ state: 'attached' });
  expect(await page.evaluate(() => document.querySelector('[data-wl-dellist]').disabled)).toBe(false);

  // Ponowne kliknięcie po ustaniu awarii domyka sprzątanie.
  await page.evaluate(() => document.querySelector('[data-wl-dellist]').click());
  await expect.poll(async () => (await listy()).length, { timeout: 8000 }).toBe(0);
  await page.waitForTimeout(400);
  expect(await harmonogramy(), 'termin listy sprzątnięty przy ponownej próbie').toHaveLength(0);
  expect((await rezerwacje()).length, 'rezerwacja sprzątnięta przy ponownej próbie').toBe(0);
});

test('K4 — partia z listy oczekujących: awaria procedury nie kasuje komunikatu o braku przypomnienia „Wynik”', async ({
  page,
}) => {
  // Kontrola końcowa audytu 2026-09-02, K4 (z I4): catch od awarii PROCEDURY zerował listę
  // nieudanych follow-upów, więc zgłoszony wcześniej w tej samej partii brak przypomnienia
  // „Wynik” przepadał. Po rezygnacji z ponownego „Umów” pacjentka zostawała umówiona na
  // procedurę bez przypomnienia o wyniku i BEZ JAKIEJKOLWIEK INFORMACJI dla lekarza.
  const { dialogi, D } = await otworzTerminarz(page);
  const pacjenci = [];
  for (const name of ['Ala Cicha', 'Basia Cicha']) {
    const pid = await zapiszPacjenta(page, name);
    await page.evaluate(
      async (a) =>
        window.VildaVault.savePatientNote({
          patientId: a.pid,
          title: 'RTG',
          body: '',
          category: 'procedura',
          procedureType: 'RTG',
        }),
      { pid },
    );
    pacjenci.push(pid);
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
  await ustaw(page, '#tzWlbDate', D(4));
  await klik(page, '#tzWlbPendChk');

  // Kolejność zapisów: 1 = procedura Ali, 2 = „Wynik” Ali (awaria), 3 = procedura Basi (awaria).
  await page.evaluate(() => {
    const v = window.VildaVault;
    const orig = v.savePatientNote;
    let n = 0;
    v.savePatientNote = function () {
      n += 1;
      if (n === 2 || n === 3) return Promise.reject(new Error(`SYMULOWANA AWARIA #${n}`));
      return orig.apply(v, arguments);
    };
  });
  await klik(page, '#tzWlbSave');
  await expect.poll(() => dialogi.length).toBeGreaterThan(0);
  await page.waitForTimeout(400);

  const komunikat = dialogi.map((d) => d.tekst).join(' || ');
  expect(komunikat, 'awaria procedury zgłoszona').toContain('Nie udało się umówić (Basia Cicha)');
  expect(komunikat, 'pacjentka bez przypomnienia „Wynik” wymieniona w tym samym komunikacie').toContain(
    'Ala Cicha',
  );
  expect(komunikat, 'komunikat nazywa brakujące przypomnienie').toMatch(/Wynik/);

  // Rezygnacja z ponownego „Umów” — Ala ma procedurę bez przypomnienia, ale lekarz o tym wie.
  await klik(page, '#tzWlbCancel');
  await page.waitForTimeout(400);
  const all = await wszystkieNotatki(page);
  const bilans = pacjenci.map((pid) => ({
    proc: all.filter((n) => n.patientId === pid && n.category === 'procedura' && n.dueDateISO).length,
    wynik: all.filter((n) => n.patientId === pid && n.category === 'wynik-badania').length,
  }));
  expect(bilans).toEqual([
    { proc: 1, wynik: 0 },
    { proc: 0, wynik: 0 },
  ]);
});

// ---------------------------------------------------------------------------------------------
// I8 — tryb wąski (swipe z UNDO istnieje tylko dla szerokości ≤700 px). Uruchamiane w projekcie
// desktop-chromium z nadpisanym kontekstem (viewport 390×844, dotyk). Headless Chromium nie ma
// gestu „przesuń” w page.touchscreen (tylko tap), więc swipe odtwarzamy syntetycznymi TouchEvent
// (touchstart → touchmove ×6 → touchend, >55% szerokości wiersza) — dokładnie tak jak repro audytu.

test.describe('I8 — usuwanie z UNDO w trybie wąskim', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function dodajCalodniowa(page, pid, today, tytul) {
    // Wpis BEZ godziny: tylko całodniowe renderują się jako .tz-row ze swipe w mobilnym widoku dnia.
    return page.evaluate(
      async (a) =>
        (
          await window.VildaVault.savePatientNote({
            patientId: a.pid,
            title: a.t,
            body: 'x',
            category: 'followup',
            dueDateISO: a.iso,
            dueTime: null,
          })
        ).id,
      { pid, t: tytul, iso: today },
    );
  }

  async function pokazWiersz(page, id) {
    await page.evaluate(() => window.VildaTerminarz.setView('day'));
    await page.evaluate(() => window.VildaTerminarz.refresh());
    await page.locator(`.tz-row[data-note-id="${id}"]`).waitFor({ state: 'attached', timeout: 10000 });
  }

  async function swipeUsun(page, id) {
    return page.evaluate(async (noteId) => {
      const row = document.querySelector(`.tz-row[data-note-id="${noteId}"]`);
      if (!row) return { ok: false, err: 'brak wiersza' };
      const wrap = row.parentNode;
      const rect = row.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.9;
      const y = rect.top + rect.height / 2;
      const mk = (type, x, target) => {
        const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y });
        return new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [touch],
          targetTouches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
        });
      };
      const target = row.querySelector('.tz-row__main') || row;
      const w = wrap.offsetWidth || 320;
      target.dispatchEvent(mk('touchstart', startX, target));
      for (let i = 1; i <= 6; i += 1) {
        document.dispatchEvent(mk('touchmove', startX - w * 0.75 * (i / 6), target));
      }
      document.dispatchEvent(mk('touchend', startX - w * 0.75, target));
      await new Promise((r) => {
        setTimeout(r, 150);
      });
      return { ok: true, toast: Boolean(document.querySelector('.tz-undo-toast')), t: Date.now() };
    }, id);
  }

  const istnieje = (page, id) =>
    page.evaluate(async (i) => Boolean(await window.VildaVault.getPatientNote(i)), id);

  test('swipe → pagehide domyka usunięcie od razu (wpis nie wraca po przeładowaniu)', async ({
    page,
  }) => {
    // Audyt 2026-09-02, I8: removePatientNote dopiero w setTimeout 4000 ms, zero pagehide/
    // beforeunload/visibilitychange domykających → zamknięcie karty w oknie 4 s porzucało usunięcie,
    // „usunięta” wizyta wracała i replikowała się przez sync.
    const { userId, today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Mobilny Pacjent');
    const id = await dodajCalodniowa(page, pid, today, 'UNDO-pagehide');
    await pokazWiersz(page, id);

    const sw = await swipeUsun(page, id);
    expect(sw.ok, JSON.stringify(sw)).toBe(true);
    expect(sw.toast).toBe(true);
    expect(await istnieje(page, id)).toBe(true); // jeszcze w oknie „Cofnij”

    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => istnieje(page, id), { timeout: 2500 }).toBe(false);
    const poCzasie = await page.evaluate((t0) => Date.now() - t0, sw.t);
    expect(poCzasie).toBeLessThan(4000); // usunięte PRZED upływem timera UNDO
    expect(await page.locator('.tz-undo-toast').count()).toBe(0);

    // Przeładowanie (jak zamknięcie i ponowne otwarcie karty) — wpis nie wraca.
    await page.reload({ waitUntil: 'load' });
    await odblokujPoReload(page, userId);
    await page.evaluate(() => window.VildaTerminarz.setView('day'));
    await odswiez(page);
    expect(await istnieje(page, id)).toBe(false);
    await expect(page.locator(`.tz-row[data-note-id="${id}"]`)).toHaveCount(0);
  });

  test('swipe → ukrycie karty domyka usunięcie; swipe → „Cofnij” → pagehide zostawia wpis', async ({
    page,
  }) => {
    // Audyt 2026-09-02, I8 (warianty): visibilitychange→hidden też domyka; ścieżka „Cofnij”
    // (Rt=null przed finalizacją) musi pozostać nietknięta — po Cofnij wpis zostaje mimo pagehide.
    const { today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Mobilny Pacjent');

    const idB = await dodajCalodniowa(page, pid, today, 'UNDO-hidden');
    await pokazWiersz(page, idB);
    const swB = await swipeUsun(page, idB);
    expect(swB.toast, JSON.stringify(swB)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => istnieje(page, idB), { timeout: 2500 }).toBe(false);
    const poCzasie = await page.evaluate((t0) => Date.now() - t0, swB.t);
    expect(poCzasie).toBeLessThan(4000);
    await page.evaluate(() => {
      delete document.hidden;
    });

    const idC = await dodajCalodniowa(page, pid, today, 'UNDO-cofnij');
    await pokazWiersz(page, idC);
    const swC = await swipeUsun(page, idC);
    expect(swC.toast, JSON.stringify(swC)).toBe(true);
    await klik(page, '#tzUndoBtn');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(4500); // dłużej niż timer UNDO — nic nie może usunąć wpisu
    expect(await istnieje(page, idC)).toBe(true);
  });

  // K5 — kontrola końcowa audytu 2026-09-02: pagehide domyka usunięcie tylko wtedy, gdy dokument
  // jeszcze żyje. Nawigacja W TEJ SAMEJ KARCIE w oknie 4 s (klik w link aplikacji, F5, page.goto)
  // startowała removePatientNote, ale asynchroniczny łańcuch sejfu (odczyt → usunięcie →
  // tombstone → audyt) nie kończył się przed zniszczeniem dokumentu: „usunięta” wizyta wracała.
  // Naprawa: synchroniczny „zamiar usunięcia” w localStorage przy uzbrojeniu UNDO, dokańczany
  // idempotentnie przy najbliższym starcie modułu i kasowany przy „Cofnij”.
  const KLUCZ_ZAMIARU = 'vilda-tz-pending-del-v1';
  const zamiar = (page) => page.evaluate((k) => localStorage.getItem(k), KLUCZ_ZAMIARU);

  test('K5 — swipe → przejście na inną podstronę w oknie „Cofnij” domyka usunięcie po powrocie', async ({
    page,
  }) => {
    const { userId, today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Igor Nawigacyjny');
    const id = await dodajCalodniowa(page, pid, today, 'UNDO-nawigacja');
    await pokazWiersz(page, id);

    const sw = await swipeUsun(page, id);
    expect(sw.toast, JSON.stringify(sw)).toBe(true);
    const zapisany = await zamiar(page);
    expect(zapisany, 'zamiar usunięcia zapisany synchronicznie przy uzbrojeniu UNDO').toBeTruthy();
    expect(JSON.parse(zapisany).id, 'zamiar dotyczy usuwanego wpisu').toBe(id);
    expect(await istnieje(page, id), 'w oknie „Cofnij” wpis jeszcze jest').toBe(true);

    // Klik w link aplikacji — nawigacja w TEJ SAMEJ karcie, wciąż w oknie 4 s.
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/index.html';
      document.body.appendChild(a);
      a.click();
    });
    await page.waitForTimeout(900);
    await page.goto('/terminarz.html', { waitUntil: 'load' });
    await odblokujPoReload(page, userId);

    await expect.poll(() => istnieje(page, id), { timeout: 8000 }).toBe(false);
    await page.evaluate(() => window.VildaTerminarz.setView('day'));
    await odswiez(page);
    await expect(page.locator(`.tz-row[data-note-id="${id}"]`)).toHaveCount(0);
    expect(await zamiar(page), 'zamiar sprzątnięty po dokończeniu usunięcia').toBe(null);
  });

  test('K5 — swipe → F5 w oknie „Cofnij” domyka usunięcie, a po „Cofnij” przeładowanie zostawia wpis', async ({
    page,
  }) => {
    const { userId, today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Klara Cofajaca');

    // (a) „Cofnij” kasuje zamiar — przeładowanie NIE MOŻE usunąć cofniętego wpisu.
    const idCofniety = await dodajCalodniowa(page, pid, today, 'UNDO-cofniety-F5');
    await pokazWiersz(page, idCofniety);
    const swC = await swipeUsun(page, idCofniety);
    expect(swC.toast, JSON.stringify(swC)).toBe(true);
    expect(await zamiar(page)).toBeTruthy();
    await klik(page, '#tzUndoBtn');
    await page.waitForTimeout(200);
    expect(await zamiar(page), '„Cofnij” kasuje zamiar natychmiast').toBe(null);
    await page.reload({ waitUntil: 'load' });
    await odblokujPoReload(page, userId);
    await page.waitForTimeout(1200);
    expect(await istnieje(page, idCofniety), 'cofnięty wpis przeżywa przeładowanie').toBe(true);

    // (b) swipe bez „Cofnij” + F5 w oknie 4 s — usunięcie zostaje dokończone przy starcie modułu.
    const idUsuwany = await dodajCalodniowa(page, pid, today, 'UNDO-F5');
    await pokazWiersz(page, idUsuwany);
    const swU = await swipeUsun(page, idUsuwany);
    expect(swU.toast, JSON.stringify(swU)).toBe(true);
    await page.reload({ waitUntil: 'load' });
    await odblokujPoReload(page, userId);
    await expect.poll(() => istnieje(page, idUsuwany), { timeout: 8000 }).toBe(false);
    expect(await zamiar(page)).toBe(null);
    expect(await istnieje(page, idCofniety), 'cofnięty wpis nadal nietknięty').toBe(true);

    // (c) zamiar starszy niż okno ważności (10 min) jest ignorowany i czyszczony — nic nie ginie.
    await page.evaluate(
      (a) => {
        localStorage.setItem(
          a.k,
          JSON.stringify({ id: a.id, u: null, s: null, ts: Date.now() - 11 * 60 * 1000 }),
        );
      },
      { k: KLUCZ_ZAMIARU, id: idCofniety },
    );
    await page.reload({ waitUntil: 'load' });
    await odblokujPoReload(page, userId);
    await page.waitForTimeout(1200);
    expect(await istnieje(page, idCofniety), 'przeterminowany zamiar nie usuwa wpisu').toBe(true);
    expect(await zamiar(page), 'przeterminowany zamiar jest czyszczony').toBe(null);
  });

  test('K5 — zamknięcie karty: porzucony zamiar innej karty domyka się przy odblokowaniu sejfu', async ({
    page,
  }) => {
    // Kontrola PR 5, pomiar zamknięcia karty: `pagehide` nie zdąża dokończyć usunięcia (przed PR 5
    // ginęło 5/10 prób, po dołożeniu kolejki sejfu 0/10 dochodziło do skutku), a zamiar przeżywa
    // w localStorage — ale identyfikator karty siedzi w sessionStorage, który ginie razem z kartą.
    // Domknięcia musi więc podjąć się INNA karta i wolno jej to zrobić dopiero po wygaśnięciu okna
    // „Cofnij” (10 s). Domknięcie bywa też odległe w czasie od startu modułu — sejf odblokowuje
    // się dopiero po wpisaniu hasła — więc zamiar jest sprawdzany także przy odblokowaniu sejfu.
    const { userId, today } = await otworzTerminarz(page);
    const pid = await zapiszPacjenta(page, 'Zofia Zamknieta');
    const id = await dodajCalodniowa(page, pid, today, 'UNDO-inna-karta');
    const ustawZamiar = (wiekMs) =>
      page.evaluate(
        (a) => {
          localStorage.setItem(
            a.k,
            JSON.stringify({ id: a.id, u: a.u, s: 'inna-karta-xyz', ts: Date.now() - a.w }),
          );
        },
        { k: KLUCZ_ZAMIARU, id, u: userId, w: wiekMs },
      );

    // (a) świeży zamiar z innej karty — jej okno „Cofnij” może jeszcze trwać, nie ruszamy wpisu.
    await ustawZamiar(0);
    await page.reload({ waitUntil: 'load' });
    await odblokujPoReload(page, userId);
    await page.waitForTimeout(1500);
    expect(await istnieje(page, id), 'świeży zamiar innej karty nie usuwa wpisu').toBe(true);
    expect(await zamiar(page), 'świeży zamiar innej karty czeka na później').toBeTruthy();

    // (b) ten sam zamiar po wygaśnięciu okna „Cofnij”, domknięty przy ODBLOKOWANIU sejfu.
    //     Karta startuje z zablokowanym sejfem (czyścimy sessionStorage, więc sesja się nie
    //     odtwarza — tak jak po zamknięciu przeglądarki), a hasło wpisujemy po wygaśnięciu
    //     pętli startowej modułu (10 s): zamiar może domknąć już tylko hak odblokowania.
    await ustawZamiar(20000);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    await page.waitForTimeout(11000); // dłużej niż pętla startowa modułu
    expect(await zamiar(page), 'zablokowany sejf nie rusza zamiaru').toBeTruthy();
    await page.evaluate(
      async (a) => {
        await window.VildaVault.unlockUser(a.userId, a.pw);
      },
      { userId, pw: HASLO },
    );
    await expect.poll(() => istnieje(page, id), { timeout: 8000 }).toBe(false);
    expect(await zamiar(page), 'zamiar sprzątnięty po domknięciu').toBe(null);
  });
});
