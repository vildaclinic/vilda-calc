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

  // Stary rekord: tylko wspólna nazwa „Szymon Surdyk” (Szymon = imię), user BEZ firstName/lastName.
  // Dokładamy nietypowe pola payloadu, aby udowodnić, że korekta ich NIE gubi.
  const { patientId } = await saveAndLoad(page, {
    name: 'Szymon Surdyk',
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
  await expect(fix).toContainText('Szymon Surdyk');

  // Stan przejściowy: całość w Nazwisko, Imię puste.
  await expect(page.locator('#lastName')).toHaveValue('Szymon Surdyk');
  await expect(page.locator('#firstName')).toHaveValue('');

  // Pierwsza interpretacja: Nazwisko = Surdyk, Imię = Szymon.
  const choice0 = page.locator('#vnfChoice0');
  await expect(choice0).toHaveAttribute('data-vnf-ln', 'Surdyk');
  await expect(choice0).toHaveAttribute('data-vnf-fn', 'Szymon');
  await choice0.click();

  // Pola ustawione poprawnie; prompt zamknięty; potwierdzenie „Zapisano”.
  await expect(page.locator('#lastName')).toHaveValue('Surdyk');
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
  await expect(fix).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeVisible();
  await expect(page.locator('#vnfDone')).toContainText('Zapisano');

  // Kanon #name = „Nazwisko Imię”.
  await expect(page.locator('#name')).toHaveValue('Surdyk Szymon');

  // UTRWALENIE: czekamy aż zapis dotrze do sejfu, potem weryfikujemy nagłówek.
  await expect
    .poll(async () => {
      const rec = await readHeader(page, patientId);
      return rec.header && rec.header.firstName ? rec.header.firstName : '';
    }, { timeout: 15000 })
    .toBe('Szymon');

  const after = await readHeader(page, patientId);
  expect(after.header.firstName).toBe('Szymon');
  expect(after.header.lastName).toBe('Surdyk');
  expect(after.header.name).toBe('Surdyk Szymon'); // kanon „Nazwisko Imię”

  // KONTRAKT ZAPISU (siatka bezpieczeństwa dla użycia updateSnapshotPayload):
  // 1) historia NIE naruszona — brak nowego snapshotu.
  expect(after.snapshotCount).toBe(1);
  expect(after.snapshotsLength).toBe(1);
  // 2) payload zaktualizowany o jawne części (user.firstName/lastName).
  expect(after.latestPayload.user.firstName).toBe('Szymon');
  expect(after.latestPayload.user.lastName).toBe('Surdyk');
  expect(after.latestPayload.name).toBe('Surdyk Szymon');
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
    name: 'Szymon Surdyk',
    user: { firstName: 'Szymon', lastName: 'Surdyk', age: 40, sex: 'M' },
  });
  expect(patientId.length).toBeGreaterThan(0);

  // Ustawienie pól z części jest asynchroniczne (getPatient) — poczekaj na wynik.
  await expect(page.locator('#lastName')).toHaveValue('Surdyk');
  await expect(page.locator('#firstName')).toHaveValue('Szymon');
  await expect(page.locator('#name')).toHaveValue('Surdyk Szymon');

  // Brak promptu i brak potwierdzenia (nic do rozstrzygania).
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
});

test('Rekord JEDNOTOKENOWY — całość w Nazwisko, Imię puste, bez promptu', async ({ page }) => {
  await openIndexGuest(page);
  await createSyntheticVault(page);

  const { patientId } = await saveAndLoad(page, {
    name: 'Kowalski',
    user: { age: 55, sex: 'M' },
  });
  expect(patientId.length).toBeGreaterThan(0);

  await expect(page.locator('#lastName')).toHaveValue('Kowalski');
  await expect(page.locator('#firstName')).toHaveValue('');
  await expect(page.locator('#vnfFix')).toBeHidden();
  await expect(page.locator('#vnfDone')).toBeHidden();
});
