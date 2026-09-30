import { expect, test } from '@playwright/test';

// Korekta rozdzielenia Imię/Nazwisko (vilda_name_fix.js) na głównym formularzu index.html.
// Sejf SYNTETYCZNY tworzony w kontenerze (nie dotyka danych użytkownika);
// niskie KDF_ITERATIONS dla szybkości. Wzorowane na tests/e2e/klirens-visit-save.spec.mjs.

async function openIndexGuest(page) {
  // Wyłącz bramkę regulaminu (modal), aby nie przechwytywała kliknięć — akceptacja fikcyjna,
  // wyłącznie na potrzeby testu; nie dotyka danych ani logiki sejfu.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) {
      /* brak localStorage — pomiń */
    }
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  // Komplet: sejf gotowy, pola tożsamości obecne, nasz hook zainicjalizowany.
  await page.waitForFunction(
    () =>
      Boolean(window.VildaVault) &&
      Boolean(window.VildaNameFix && window.VildaNameFix.__init) &&
      Boolean(document.getElementById('lastName')) &&
      Boolean(document.getElementById('firstName')) &&
      Boolean(document.getElementById('name')),
  );
}

// Tworzy syntetyczny, odblokowany sejf i zwraca uchwyt do dalszych operacji w page.evaluate.
async function createSyntheticVault(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const user = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'E2E' });
    await V.unlockUser(user.userId, 'Haslo-Testowe-123');
    return { unlocked: V.isUnlocked() };
  });
}

// Zapisuje rekord i wyzwala ścieżkę wczytania (dispatch 'vilda:patient-loaded').
async function saveAndLoad(page, data) {
  return page.evaluate(async (payload) => {
    const V = window.VildaVault;
    const saved = await V.savePatient(payload);
    const patientId =
      saved.patientId || saved.id || (saved.patient && saved.patient.patientId);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId } }),
    );
    return { patientId };
  }, data);
}

async function readHeader(page, patientId) {
  return page.evaluate(async (pid) => {
    const rec = await window.VildaVault.getPatient(pid);
    return {
      header: rec ? rec.header : null,
      snapshotCount: rec ? rec.snapshotCount : null,
      snapshotsLength: rec && rec.snapshots ? rec.snapshots.length : null,
      latestPayload: rec && rec.snapshots && rec.snapshots[0] ? rec.snapshots[0].payload : null,
    };
  }, patientId);
}

test('OLD dwuczłonowy rekord (bez części) — prompt, wybór, i UTRWALENIE korekty', async ({ page }) => {
  await openIndexGuest(page);
  const setup = await createSyntheticVault(page);
  expect(setup.unlocked).toBe(true);

  // Stary rekord: tylko wspólna nazwa „Szymon Fikcyjny” (Szymon = imię), user BEZ firstName/lastName.
  // Dokładamy nietypowe pola payloadu, aby udowodnić, że korekta ich NIE gubi.
  const { patientId } = await saveAndLoad(page, {
    name: 'Szymon Fikcyjny',
    user: { age: 40, sex: 'M' },
    clcr: { marker: 'ZACHOWAJ-MNIE-123' },
    growthBasic: { note: 'nietkniete' },
  });
  expect(patientId.length).toBeGreaterThan(0);

  // Stan początkowy sejfu: 1 snapshot (dowód później, że nie przybył kolejny).
  const before = await readHeader(page, patientId);
  expect(before.snapshotCount).toBe(1);

  // Prompt korekty się pojawia.
  const fix = page.locator('#vnfFix');
  await expect(fix).toBeVisible();
  await expect(fix).toContainText('Rozdziel imię i nazwisko');
  await expect(fix).toContainText('Szymon Fikcyjny');

  // Stan przejściowy: całość w Nazwisko, Imię puste.
  await expect(page.locator('#lastName')).toHaveValue('Szymon Fikcyjny');
  await expect(page.locator('#firstName')).toHaveValue('');

  // Pierwsza interpretacja: Nazwisko = Fikcyjny, Imię = Szymon.
  const choice0 = page.locator('#vnfChoice0');
  await expect(choice0).toHaveAttribute('data-vnf-ln', 'Fikcyjny');
  await expect(choice0).toHaveAttribute('data-vnf-fn', 'Szymon');
  await choice0.click();

  // Pola ustawione poprawnie; prompt zamknięty; potwierdzenie „Zapisano”.
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
  await expect(fix).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeVisible();
  await expect(page.locator('#vnfDone')).toContainText('Zapisano');

  // Kanon #name = „Nazwisko Imię”.
  await expect(page.locator('#name')).toHaveValue('Fikcyjny Szymon');

  // UTRWALENIE: czekamy aż zapis dotrze do sejfu, potem weryfikujemy nagłówek.
  await expect
    .poll(async () => {
      const rec = await readHeader(page, patientId);
      return rec.header && rec.header.firstName ? rec.header.firstName : '';
    }, { timeout: 15000 })
    .toBe('Szymon');

  const after = await readHeader(page, patientId);
  expect(after.header.firstName).toBe('Szymon');
  expect(after.header.lastName).toBe('Fikcyjny');
  expect(after.header.name).toBe('Fikcyjny Szymon'); // kanon „Nazwisko Imię”

  // KONTRAKT ZAPISU (siatka bezpieczeństwa dla użycia updateSnapshotPayload):
  // 1) historia NIE naruszona — brak nowego snapshotu.
  expect(after.snapshotCount).toBe(1);
  expect(after.snapshotsLength).toBe(1);
  // 2) payload zaktualizowany o jawne części (user.firstName/lastName).
  expect(after.latestPayload.user.firstName).toBe('Szymon');
  expect(after.latestPayload.user.lastName).toBe('Fikcyjny');
  expect(after.latestPayload.name).toBe('Fikcyjny Szymon');
  // 3) niepowiązane dane payloadu ZACHOWANE.
  expect(after.latestPayload.clcr.marker).toBe('ZACHOWAJ-MNIE-123');
  expect(after.latestPayload.growthBasic.note).toBe('nietkniete');
  expect(after.latestPayload.user.age).toBe(40);
  expect(after.latestPayload.user.sex).toBe('M');
});

test('Rekord Z JAWNYMI częściami — bez promptu; pola z części nawet gdy kolejność #name inna', async ({ page }) => {
  await openIndexGuest(page);
  await createSyntheticVault(page);

  // name podane „Imię Nazwisko”, ale JAWNE części w user.* są autorytatywne.
  const { patientId } = await saveAndLoad(page, {
    name: 'Szymon Fikcyjny',
    user: { firstName: 'Szymon', lastName: 'Fikcyjny', age: 40, sex: 'M' },
  });
  expect(patientId.length).toBeGreaterThan(0);

  // Ustawienie pól z części jest asynchroniczne (getPatient) — poczekaj na wynik.
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
  await expect(page.locator('#name')).toHaveValue('Fikcyjny Szymon');

  // Brak promptu i brak potwierdzenia (nic do rozstrzygania).
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
});

// REGRESJA v2: payload snapshotu niedostępny (sejf zwraca payload:null przy nieudanym
// odszyfrowaniu; w trybie chmurowym lista snapshotów bywa chwilowo pusta) NIE oznacza
// „starego rekordu jednopolowego". Wcześniej poprawnie zapisany pacjent dostawał wtedy
// fałszywy prompt „Rozdziel imię i nazwisko".
test('Payload TRWALE niedostępny — bez promptu i bez ruszania pól (mimo ponownej próby)', async ({ page }) => {
  await openIndexGuest(page);
  await createSyntheticVault(page);

  // Pacjent zapisany wzorcowo, z jawnymi częściami.
  const { patientId } = await saveAndLoad(page, {
    name: 'Fikcyjny Szymon',
    user: { firstName: 'Szymon', lastName: 'Fikcyjny', age: 9, sex: 'M' },
  });
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');

  // Od teraz każdy odczyt zwraca snapshoty BEZ payloadu (dokładnie jak sejf po
  // nieudanym odszyfrowaniu) — obejmuje to także ponowną próbę modułu.
  await page.evaluate((pid) => {
    const V = window.VildaVault;
    const orig = V.getPatient.bind(V);
    window.__vnfGetPatientCalls = 0;
    V.getPatient = async (id) => {
      const rec = await orig(id);
      if (rec && id === pid) {
        window.__vnfGetPatientCalls += 1;
        rec.snapshots = (rec.snapshots || []).map((s) => ({ ...s, payload: null }));
      }
      return rec;
    };
  }, patientId);

  // Symulacja stanu pól po zwykłym wczytaniu (P-SPLIT rozdzielił kanon „Nazwisko Imię").
  await page.evaluate((pid) => {
    document.getElementById('name').value = 'Fikcyjny Szymon';
    document.getElementById('lastName').value = 'Fikcyjny';
    document.getElementById('firstName').value = 'Szymon';
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }),
    );
  }, patientId);

  // Czekamy, aż moduł wykona ponowną próbę (≥2 odczyty; inne moduły nasłuchujące
  // 'vilda:patient-loaded' też wołają getPatient, więc licznik nie jest dokładnie 2),
  // plus chwila na osiadanie — potem asercje behawioralne.
  await expect
    .poll(() => page.evaluate(() => window.__vnfGetPatientCalls), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(700);

  // Bez promptu, bez potwierdzenia, pola nietknięte.
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
});

test('Payload CHWILOWO niedostępny — ponowna próba trafia, części zastosowane, bez promptu', async ({ page }) => {
  await openIndexGuest(page);
  await createSyntheticVault(page);

  const { patientId } = await saveAndLoad(page, {
    name: 'Fikcyjny Szymon',
    user: { firstName: 'Szymon', lastName: 'Fikcyjny', age: 9, sex: 'M' },
  });
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');

  // PIERWSZY kolejny odczyt zwraca payload:null (chwilowy zator), następne działają normalnie.
  await page.evaluate((pid) => {
    const V = window.VildaVault;
    const orig = V.getPatient.bind(V);
    let failed = false;
    V.getPatient = async (id) => {
      const rec = await orig(id);
      if (rec && id === pid && !failed) {
        failed = true;
        rec.snapshots = (rec.snapshots || []).map((s) => ({ ...s, payload: null }));
      }
      return rec;
    };
  }, patientId);

  // Pola celowo rozjechane — poprawne wartości mają przyjść z ponownej próby odczytu.
  await page.evaluate((pid) => {
    document.getElementById('name').value = '';
    document.getElementById('lastName').value = '';
    document.getElementById('firstName').value = '';
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }),
    );
  }, patientId);

  // Po ponownej próbie (ok. 1,2 s) pola ustawione z JAWNYCH części, bez promptu.
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny', { timeout: 15000 });
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
  await expect(page.locator('#name')).toHaveValue('Fikcyjny Szymon');
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
});

test('Rekord JEDNOTOKENOWY — całość w Nazwisko, Imię puste, bez promptu', async ({ page }) => {
  await openIndexGuest(page);
  await createSyntheticVault(page);

  const { patientId } = await saveAndLoad(page, {
    name: 'Testowy',
    user: { age: 55, sex: 'M' },
  });
  expect(patientId.length).toBeGreaterThan(0);

  await expect(page.locator('#lastName')).toHaveValue('Testowy');
  await expect(page.locator('#firstName')).toHaveValue('');
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
});

// P-NAME-FIX-WYSCIG (2026-09-30) — spóźniona odpowiedź sejfu nie może cofnąć zmian formularza.
//
// Handler 'vilda:patient-loaded' czyta rekord z sejfu ASYNCHRONICZNIE i dopiero potem ustawia
// pola. Zmierzone na audyt 5cac96d (12 przebiegów, 4 workery): odczyt kończy się 172–943 ms po
// zdarzeniu, a test tozsamosc-pacjenta-duplikaty.spec.mjs (kontrola „inne nazwisko…”) zaczyna pisać
// nowe nazwisko 33–452 ms później. Gdy odczyt się spóźnił (CI, run 36695159393, obie próby), moduł wpisywał
// z powrotem nazwisko WCZYTANEGO pacjenta w formularz z danymi innego dziecka — stos wywołań:
// handlePatientLoaded → applyFields. Opóźnienie odczytu o 250 ms odtwarzało dokładnie ten błąd.
//
// Zamiast mierzyć czas, test wstrzymuje odpowiedzi sejfu dla wczytanego pacjenta, zmienia
// formularz i dopiero wtedy je zwalnia — kolejność jest więc zawsze ta z CI.
//
// Wczytanie idzie tą samą drogą co „Wczytaj tego pacjenta”: applyLoadedData + zdarzenie.

async function wstrzymajOdczyty(page, patientId) {
  await page.evaluate((pid) => {
    const V = window.VildaVault;
    const orig = V.getPatient.bind(V);
    let zwolnij = null;
    const bramka = new Promise((res) => { zwolnij = res; });
    window.__vnfBramka = { wejscia: 0, wyjscia: 0, zwolnij: () => zwolnij() };
    V.getPatient = async (id) => {
      const wstrzymaj = id === pid;
      if (wstrzymaj) window.__vnfBramka.wejscia += 1;
      const rec = await orig(id);
      if (wstrzymaj) {
        await bramka;
        window.__vnfBramka.wyjscia += 1;
      }
      return rec;
    };
  }, patientId);
}

/* Zwalnia wstrzymane odczyty i czeka, aż wszystkie wrócą. Każde page.evaluate to osobne
   zadanie przeglądarki, więc kontynuacje handlera (mikrozadania) wykonają się przed asercjami. */
async function zwolnijOdczyty(page) {
  const oczekiwane = await page.evaluate(() => {
    window.__vnfBramka.zwolnij();
    return window.__vnfBramka.wejscia;
  });
  expect(oczekiwane, 'moduł nie wywołał odczytu sejfu dla wczytanego pacjenta').toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__vnfBramka.wyjscia), { timeout: 15000 })
    .toBeGreaterThanOrEqual(oczekiwane);
  await page.evaluate(() => new Promise((res) => { setTimeout(res, 0); }));
}

async function zapiszIWczytaj(page, payload) {
  const patientId = await page.evaluate(async (p) => {
    const saved = await window.VildaVault.savePatient(p);
    return saved.patientId || saved.id || (saved.patient && saved.patient.patientId);
  }, payload);
  expect(patientId.length).toBeGreaterThan(0);
  await wstrzymajOdczyty(page, patientId);
  await page.evaluate(({ pid, p }) => {
    window.applyLoadedData(p);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid, source: 'pick' } }),
    );
  }, { pid: patientId, p: payload });
  return patientId;
}

const polaTozsamosci = (page) => page.evaluate(() => ({
  name: document.getElementById('name').value,
  lastName: document.getElementById('lastName').value,
  firstName: document.getElementById('firstName').value,
}));

test.describe('Spóźniona odpowiedź sejfu nie cofa zmian formularza', () => {
  test('inne nazwisko wpisane przed odpowiedzią sejfu zostaje w formularzu i w kolektorze', async ({ page }) => {
    await openIndexGuest(page);
    await createSyntheticVault(page);
    // Rekord tak, jak zapisuje go aplikacja: jawne części w user.* (ścieżka (1) modułu).
    await zapiszIWczytaj(page, {
      name: 'Fikcyjny-Wyscig Adam',
      user: { firstName: 'Adam', lastName: 'Fikcyjny-Wyscig', age: 6, sex: 'M', weight: 21, height: 118 },
    });
    expect(await polaTozsamosci(page)).toEqual({
      name: 'Fikcyjny-Wyscig Adam', lastName: 'Fikcyjny-Wyscig', firstName: 'Adam',
    });

    // Dane INNEGO dziecka — tak jak w kontroli „inne nazwisko…” (pola pisane programowo).
    await page.evaluate(() => {
      [['firstName', 'Bartek'], ['lastName', 'Inny-Wyscig']].forEach(([id, v]) => {
        const el = document.getElementById(id);
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    expect((await polaTozsamosci(page)).name).toBe('Inny-Wyscig Bartek');

    await zwolnijOdczyty(page);

    expect(await polaTozsamosci(page)).toEqual({
      name: 'Inny-Wyscig Bartek', lastName: 'Inny-Wyscig', firstName: 'Bartek',
    });
    // Kolektor — to on idzie do zapisu i do bramki tożsamości.
    const zebrane = await page.evaluate(() => {
      const d = window.collectUserData() || {};
      return { name: d.name || '', lastName: (d.user && d.user.lastName) || '' };
    });
    expect(zebrane.name).toContain('Inny-Wyscig');
    expect(zebrane.name).not.toContain('Fikcyjny-Wyscig');
    expect(zebrane.lastName).toBe('Inny-Wyscig');
  });

  test('formularz wyczyszczony przed odpowiedzią sejfu zostaje pusty, bez pytania o rozdzielenie', async ({ page }) => {
    await openIndexGuest(page);
    await createSyntheticVault(page);
    // Stary rekord jednopolowy — bez tej poprawki spóźniona odpowiedź wpisywała nazwę do
    // wyczyszczonego formularza i pokazywała pytanie o rozdzielenie (ścieżka (2) modułu).
    await zapiszIWczytaj(page, {
      name: 'Fikcyjna Wyscigowa',
      user: { age: 7, sex: 'F', weight: 23, height: 121 },
    });
    expect((await polaTozsamosci(page)).name).toBe('Fikcyjna Wyscigowa');

    // Prawdziwa ścieżka lekarza: „Nowy pomiar” w oknie wyboru, potem „Wyczyść wszystkie pola”.
    await page.locator('#vildaLcmNew').click();
    await page.locator('#clearAllDataBtn').click();
    expect(await polaTozsamosci(page)).toEqual({ name: '', lastName: '', firstName: '' });

    await zwolnijOdczyty(page);

    expect(await polaTozsamosci(page)).toEqual({ name: '', lastName: '', firstName: '' });
    await expect(page.locator('#vnfFix')).toBeHidden();
  });

  test('kontrola: formularz niezmieniony — spóźniona korekta nadal ustawia pola z części', async ({ page }) => {
    await openIndexGuest(page);
    await createSyntheticVault(page);
    // name w kolejności „Imię Nazwisko” — P-SPLIT dzieli ją odwrotnie, a moduł ma to poprawić.
    await zapiszIWczytaj(page, {
      name: 'Szymon Fikcyjny',
      user: { firstName: 'Szymon', lastName: 'Fikcyjny', age: 9, sex: 'M', weight: 28, height: 132 },
    });
    expect(await polaTozsamosci(page)).toEqual({
      name: 'Szymon Fikcyjny', lastName: 'Szymon', firstName: 'Fikcyjny',
    });

    await zwolnijOdczyty(page);

    expect(await polaTozsamosci(page)).toEqual({
      name: 'Fikcyjny Szymon', lastName: 'Fikcyjny', firstName: 'Szymon',
    });
  });

  test('kontrola: pola przepisane tą samą nazwą (inna wielkość liter) — korekta nadal działa', async ({ page }) => {
    await openIndexGuest(page);
    await createSyntheticVault(page);
    await zapiszIWczytaj(page, {
      name: 'Szymon Fikcyjny',
      user: { firstName: 'Szymon', lastName: 'Fikcyjny', age: 9, sex: 'M', weight: 28, height: 132 },
    });

    // Inny moduł wpisuje ponownie TĘ SAMĄ nazwę (np. kolejna fala odtwarzania) — to nie jest
    // zmiana pacjenta, więc korekta z rekordu ma się wykonać.
    await page.evaluate(() => { document.getElementById('name').value = 'SZYMON fikcyjny'; });
    expect(await polaTozsamosci(page)).toEqual({
      name: 'SZYMON fikcyjny', lastName: 'SZYMON', firstName: 'fikcyjny',
    });

    await zwolnijOdczyty(page);

    expect(await polaTozsamosci(page)).toEqual({
      name: 'Fikcyjny Szymon', lastName: 'Fikcyjny', firstName: 'Szymon',
    });
  });
});
