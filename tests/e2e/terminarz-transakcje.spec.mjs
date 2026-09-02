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
});
