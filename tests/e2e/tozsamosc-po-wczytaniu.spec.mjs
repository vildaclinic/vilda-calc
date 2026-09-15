import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC (zgłoszenie właściciela 2026-09-15) — odtworzenie zgłoszonych przebiegów na
// PRAWDZIWYCH stronach: wczytany pacjent → pola tożsamości, F5, przejście na docpro, „Odtwórz
// zapis" / „Nowy pomiar" i przycisk „Odtwórz zapisany stan".
//
// Zmierzone przed poprawką (skrypt diagnostyczny na tych samych stronach):
//   • po wczytaniu #firstName/#lastName edytowalne na index i docpro (płeć i ukryty #name już
//     wyłączone, data urodzenia tylko do odczytu) — edycja nazwiska prowadziła do NOWEGO pacjenta;
//   • po F5 flaga „lekarz edytował" była TRUE bez żadnej edycji (zdarzenia programowe modułów),
//     a przycisk „Odtwórz zapisany stan" wracał także po dokonanym wyborze „Nowy pomiar";
//   • „Odtwórz zapis" ZEROWAŁ bazę wczytanego pacjenta: na docpro i po F5 data urodzenia wracała
//     edytowalna, przycisk odtworzenia pojawiał się znowu i po kliknięciu nie robił nic;
//   • docpro nie miał panelu pokwitaniowego, więc tempo oceniał wg wieku kostnego zamiast Tannera.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Tozsamosc!26a';

async function otworzZKontem(page) {
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
  await gotowe(page);
}

async function gotowe(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.collectUserData === 'function' && Boolean(window.VildaDobAge) && Boolean(window.VildaPolaTozsamosci));
  await page.waitForTimeout(1500); // kaskady odtwarzania po starcie strony
}

function wpisz(page, pola) {
  return page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

const stan = (page) => page.evaluate(() => {
  const el = (id) => document.getElementById(id);
  const ro = (id) => Boolean(el(id) && el(id).readOnly);
  const dis = (id) => Boolean(el(id) && el(id).disabled);
  const val = (id) => (el(id) ? el(id).value : null);
  return {
    strona: location.pathname,
    lastName: val('lastName'), lastNameRo: ro('lastName'), firstNameRo: ro('firstName'), sexDis: dis('sex'),
    dob: val('dobInput'), dobRo: ro('dobInput'), tanner: val('tannerStage'), weight: val('weight'),
    notka: el('tozsamoscNote') ? !el('tozsamoscNote').hidden : null,
    przycisk: getComputedStyle(el('restoreStateBtn')).display !== 'none',
    modal: Boolean(el('vildaLoadChoiceModal')),
    wybor: sessionStorage.getItem('vildaLoadChoiceV1'),
    edytowal: Boolean(window.hasUserModifiedAfterLoad),
    baza: window.lastLoadedData ? (window.lastLoadedData.user && window.lastLoadedData.user.dobISO) || null : null,
  };
});

const pacjenci = (page) => page.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId));

/* Wczytanie tak, jak robi to zakładka Pacjenci: applyLoadedData + zdarzenie z identyfikatorem. */
async function wczytaj(page, patientId) {
  await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, patientId);
  await page.waitForFunction((pid) => window._vildaCurrentPatientId === pid, patientId);
  await page.waitForTimeout(1500); // kaskada zerowania pól wizyty i modal „Co chcesz zrobić?"
}

const dataUr = (lat) => {
  const d = new Date();
  const u = new Date(d.getFullYear() - lat, d.getMonth() - 4, 5);
  const z = (n) => String(n).padStart(2, '0');
  return { pole: `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}`, iso: `${u.getFullYear()}-${z(u.getMonth() + 1)}-${z(u.getDate())}` };
};

async function pierwszaWizyta(page) {
  const ur = dataUr(9);
  await wpisz(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', dobInput: ur.pole, weight: '30.2', height: '134', tannerStage: '1' });
  const przed = await stan(page);
  expect(przed.lastNameRo, 'przed zapisem nazwisko jest edytowalne').toBe(false);
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  const lista = await pacjenci(page);
  expect(lista).toHaveLength(1);
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  const poCzyszczeniu = await stan(page);
  expect(poCzyszczeniu.lastNameRo, 'po wyczyszczeniu pola są wolne').toBe(false);
  expect(poCzyszczeniu.sexDis).toBe(false);
  expect(poCzyszczeniu.notka).toBe(false);
  return { pid: lista[0], ur };
}

function zablokowane(s, gdzie) {
  expect(s.lastNameRo, `${gdzie}: nazwisko tylko do odczytu`).toBe(true);
  expect(s.firstNameRo, `${gdzie}: imię tylko do odczytu`).toBe(true);
  expect(s.sexDis, `${gdzie}: płeć wyłączona`).toBe(true);
  expect(s.dobRo, `${gdzie}: data urodzenia tylko do odczytu`).toBe(true);
  expect(s.notka, `${gdzie}: notka „z kartoteki"`).toBe(true);
}

test.describe('Pola tożsamości po wczytaniu pacjenta', () => {
  test('wczytanie blokuje nazwisko, imię, płeć i datę na index, po F5 i na docpro; „Nowy pomiar" nie wraca przyciskiem', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    const { pid, ur } = await pierwszaWizyta(page);

    await wczytaj(page, pid);
    const po = await stan(page);
    zablokowane(po, 'index po wczytaniu');
    expect(po.lastName).toBe('Fikcyjna');
    expect(po.dob).toBe(ur.pole);
    expect(po.modal, 'pytanie „Nowy pomiar / Odtwórz zapis"').toBe(true);
    expect(po.edytowal, 'wczytanie nie jest edycją').toBe(false);

    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const poF5 = await stan(page);
    zablokowane(poF5, 'index po F5');
    expect(poF5.edytowal, 'F5 bez edycji nie ustawia flagi edycji').toBe(false);
    expect(poF5.przycisk, 'po „Nowy pomiar" F5 nie proponuje odtworzenia').toBe(false);

    await page.goto('/docpro.html', { waitUntil: 'load' });
    await gotowe(page);
    const naDocpro = await stan(page);
    zablokowane(naDocpro, 'docpro');
    expect(naDocpro.lastName).toBe('Fikcyjna');
    expect(naDocpro.tanner, 'panel pokwitaniowy na docpro niesie etap z rekordu').toBe('1');
    expect(naDocpro.przycisk).toBe(false);

    // Wczytanie wprost na docpro — ta sama blokada.
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    expect((await stan(page)).lastNameRo).toBe(false);
    await wczytaj(page, pid);
    zablokowane(await stan(page), 'docpro po wczytaniu wprost');
  });

  test('„Odtwórz zapis" nie gubi bazy: data zostaje z kartoteki po F5 i na docpro, przycisk nie wraca', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    const { pid, ur } = await pierwszaWizyta(page);
    await wczytaj(page, pid);
    await page.locator('#vildaLcmRestore').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect(page.locator('#weight'), 'odtworzenie przywraca ostatni pomiar').toHaveValue('30.2');
    const po = await stan(page);
    expect(po.baza, 'baza wczytanego pacjenta zostaje').toBe(ur.iso);
    expect(po.wybor).toBe('restore');
    zablokowane(po, 'index po odtworzeniu');

    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const poF5 = await stan(page);
    expect(poF5.baza, 'baza po F5').toBe(ur.iso);
    expect(poF5.weight).toBe('30.2');
    expect(poF5.przycisk, 'po odtworzeniu nie ma czego odtwarzać').toBe(false);
    zablokowane(poF5, 'index po odtworzeniu i F5');

    await page.goto('/docpro.html', { waitUntil: 'load' });
    await gotowe(page);
    const naDocpro = await stan(page);
    expect(naDocpro.dob).toBe(ur.pole);
    expect(naDocpro.baza).toBe(ur.iso);
    expect(naDocpro.przycisk).toBe(false);
    zablokowane(naDocpro, 'docpro po odtworzeniu');

    // Zapis z tego stanu trafia do TEGO SAMEGO pacjenta (baza i nazwa zgodne).
    await wpisz(page, { weight: '30.9', height: '135' });
    expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
    await page.waitForTimeout(600);
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toBe(pid);
  });

  test('po pierwszym zapisie tożsamość też jest z kartoteki; „Wyczyść" zdejmuje blokadę', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await wpisz(page, { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', age: '7', ageMonths: '2', weight: '24', height: '121' });
    expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
    await page.waitForTimeout(800);
    const po = await stan(page);
    expect(po.lastNameRo, 'po zapisie nazwisko z kartoteki').toBe(true);
    expect(po.sexDis).toBe(true);
    expect(po.notka).toBe(true);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    const poCzyszczeniu = await stan(page);
    expect(poCzyszczeniu.lastNameRo).toBe(false);
    expect(poCzyszczeniu.sexDis).toBe(false);
    expect(poCzyszczeniu.lastName).toBe('');
  });
});
