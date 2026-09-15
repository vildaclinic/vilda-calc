import { expect, test } from '../support/test-czas.mjs';

// P-ODSWIEZENIE (zgłoszenie właściciela 2026-09-15) — odtworzenie zgłoszonych przebiegów na PRAWDZIWEJ
// stronie: wczytany pacjent + data urodzenia + odświeżenie strony / przejście na docpro / edycja w
// Karcie Pacjenta / dwa własne zapisy pod rząd.
//
// Przed poprawką (zmierzone diagnostyką na tej samej stronie):
//   • po F5 znikała data i wiek (data z kartoteki) ALBO nazwisko (data wpisana ręcznie) — zależnie od
//     tego, która z trzech warstw pamięci zdążyła pierwsza; lekarz dopisywał nazwisko „po swojemu"
//     i sejf zakładał NOWEGO pacjenta z tą samą datą urodzenia;
//   • na docpro nie było ani daty, ani wieku, a zapis stamtąd gubił jawne części nazwiska — przy
//     następnym wczytaniu na index pojawiało się pytanie „które słowo to nazwisko";
//   • drugi własny zapis pod rząd pytał „Ktoś inny zmienił ten rekord", bo linia bazowa nie była
//     odświeżana po własnym zapisie; „Zapisz to, co w formularzu" kasowało własny wiersz;
//   • data dopisana w Karcie Pacjenta nie docierała do wczytanego formularza, a zapis stamtąd
//     wymazywał ją z główki rekordu.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Odswiez!26cc';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    // Rejestr okien, które test uznaje za usterkę: pytanie o obcą zmianę, pytanie o tożsamość,
    // prompt rozdzielenia nazwiska. Okno o obcą zmianę zamykamy „Zapisz to, co w formularzu",
    // żeby zapis nie zawisł — sam fakt pojawienia się jest już porażką testu.
    window.__okna = [];
    const widziane = new WeakSet();
    const obs = new MutationObserver(() => {
      document.querySelectorAll('.vilda-auth-sheet-conflict, .vilda-auth-sheet[aria-label], .vnf-fix:not([hidden])')
        .forEach((el) => {
          if (widziane.has(el)) return;
          widziane.add(el);
          window.__okna.push((el.getAttribute('aria-label') || el.className) + ': '
            + (el.textContent || '').replace(/\s+/g, ' ').slice(0, 160));
          const b = Array.from(el.querySelectorAll('button'))
            .find((x) => /Zapisz to, co w formularzu/.test(x.textContent));
          if (b) setTimeout(() => b.click(), 30);
        });
    });
    document.addEventListener('DOMContentLoaded', () => obs.observe(document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }));
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
    && typeof window.collectUserData === 'function' && Boolean(window.VildaDobAge));
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
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
  const d = window.collectUserData() || {};
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  const dob = document.getElementById('dobInput');
  return {
    dobInput: g('dobInput'), dobReadOnly: !!(dob && dob.readOnly), age: g('age'), ageMonths: g('ageMonths'),
    name: g('name'), weight: g('weight'), height: g('height'),
    kolektor: { name: d.name, dobISO: d.user && d.user.dobISO, firstName: d.user && d.user.firstName, lastName: d.user && d.user.lastName },
    bazaNazwa: window.lastLoadedData ? window.lastLoadedData.name : null,
    bazaDob: window.lastLoadedData && window.lastLoadedData.user ? window.lastLoadedData.user.dobISO || null : null,
    okna: window.__okna.slice(),
  };
});

const pacjenci = (page) => page.evaluate(async () => {
  const lista = await window.VildaVault.listPatients();
  const out = [];
  for (const p of lista) {
    const pelny = await window.VildaVault.getPatient(p.patientId);
    const pl = pelny.snapshots[0].payload;
    out.push({
      patientId: p.patientId, name: pelny.header.name, dobISO: pelny.header.dobISO || null,
      snapshotCount: pelny.snapshotCount,
      firstName: pl.user && pl.user.firstName, lastName: pl.user && pl.user.lastName,
      rows: pl.advanced && pl.advanced.data && Array.isArray(pl.advanced.data.measurements)
        ? pl.advanced.data.measurements.map((m) => m.ageMonths).sort((a, b) => a - b) : [],
    });
  }
  return out;
});

async function zapisz(page) {
  const wynik = await page.evaluate(async () => Boolean(await window.saveUserData()));
  expect(wynik, 'zapis nie może zostać odrzucony jako niekompletny').toBe(true);
  await page.waitForTimeout(600);
}

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
  await page.waitForTimeout(1500); // kaskada zerowania pól wizyty
}

const dataUr = (lat) => {
  const d = new Date();
  const u = new Date(d.getFullYear() - lat, d.getMonth() - 4, 5);
  const z = (n) => String(n).padStart(2, '0');
  return { pole: `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}`, iso: `${u.getFullYear()}-${z(u.getMonth() + 1)}-${z(u.getDate())}` };
};

async function pierwszaWizyta(page, pola) {
  await wpisz(page, pola);
  await expect.poll(async () => (await stan(page)).kolektor.name).toContain(pola.lastName);
  await zapisz(page);
  await expect.poll(async () => (await pacjenci(page)).length).toBe(1);
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  return (await pacjenci(page))[0];
}

test.describe('Wczytany pacjent po odświeżeniu strony i między stronami', () => {
  test('F5 nie kasuje daty z kartoteki, wieku ani nazwiska — i nie zakłada nowego pacjenta', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const ur = dataUr(9);
    const p = await pierwszaWizyta(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', dobInput: ur.pole, weight: '30.2', height: '134' });
    expect(p.dobISO).toBe(ur.iso);

    await wczytaj(page, p.patientId);
    const przed = await stan(page);
    expect(przed.dobInput).toBe(ur.pole);
    expect(przed.dobReadOnly, 'data z kartoteki jest tylko do odczytu').toBe(true);

    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const po = await stan(page);
    expect(po.name, 'nazwisko po F5').toBe('Fikcyjna Ewa');
    expect(po.dobInput, 'data po F5').toBe(ur.pole);
    expect(po.dobReadOnly, 'nadal z kartoteki').toBe(true);
    expect(po.age, 'wiek z daty po F5').toBe(przed.age);
    expect(po.ageMonths).toBe(przed.ageMonths);
    expect(po.bazaDob, 'linia bazowa zna datę').toBe(ur.iso);

    await wpisz(page, { weight: '30.9', height: '135' });
    await zapisz(page);
    const lista = await pacjenci(page);
    expect(lista, 'nadal jeden pacjent').toHaveLength(1);
    expect(lista[0].patientId).toBe(p.patientId);
    expect(lista[0].dobISO).toBe(ur.iso);
    expect(lista[0].snapshotCount).toBe(2);
    expect(po.okna).toEqual([]);
  });

  test('data wpisana ręcznie do wczytanego pacjenta przeżywa F5 razem z nazwiskiem; zapis trafia do tego samego rekordu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const p = await pierwszaWizyta(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: '9', ageMonths: '4', weight: '30.2', height: '134' });
    expect(p.dobISO).toBeNull();

    await wczytaj(page, p.patientId);
    const ur = dataUr(9);
    await wpisz(page, { dobInput: ur.pole, weight: '30.8', height: '135' });
    await expect.poll(async () => (await stan(page)).kolektor.dobISO).toBe(ur.iso);

    // F5 PRZED zapisem: data jest tylko w formularzu, rekord jej nie ma — wraca edytowalna.
    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const przedZapisem = await stan(page);
    expect(przedZapisem.name, 'nazwisko po F5 — bez niego lekarz wpisywał je po swojemu i powstawał duplikat').toBe('Fikcyjna Ewa');
    expect(przedZapisem.dobInput).toBe(ur.pole);
    expect(przedZapisem.dobReadOnly, 'data wpisana ręcznie, jeszcze niezapisana, zostaje edytowalna').toBe(false);
    expect(przedZapisem.weight).toBe('30.8');
    expect(przedZapisem.height).toBe('135');
    expect(przedZapisem.kolektor.dobISO).toBe(ur.iso);

    await zapisz(page);
    await expect.poll(async () => (await pacjenci(page))[0].dobISO).toBe(ur.iso);

    // F5 PO zapisie: data jest już w rekordzie, więc po odświeżeniu wraca jak z kartoteki
    // (tylko do odczytu, poprawka przez „Edytuj") — dokładnie tak, jak przy świeżym wczytaniu.
    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const po = await stan(page);
    expect(po.name).toBe('Fikcyjna Ewa');
    expect(po.dobInput).toBe(ur.pole);
    expect(po.dobReadOnly, 'zapisana data jest już z kartoteki').toBe(true);
    expect(po.weight).toBe('30.8');
    expect(po.height).toBe('135');

    await wpisz(page, { weight: '31.0' });
    await zapisz(page);
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(p.patientId);
    expect(lista[0].snapshotCount).toBe(3);
    expect((await stan(page)).okna).toEqual([]);
  });

  test('własny zapis nie jest „obcą zmianą": drugi zapis pod rząd i zapis po F5 nie pytają i nie kasują wierszy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await wpisz(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: '9', ageMonths: '4', weight: '30.2', height: '134' });
    await page.evaluate(() => {
      window.advancedGrowthData = { measurements: [
        { ageMonths: 100, ageYears: 100 / 12, height: 120, weight: 22 },
        { ageMonths: 112, ageYears: 112 / 12, height: 126, weight: 25 },
      ] };
      window.vildaRehydrateAdvancedFromState && window.vildaRehydrateAdvancedFromState({ advancedGrowthData: window.advancedGrowthData });
    });
    await expect.poll(async () => (await stan(page)).kolektor.name).toContain('Fikcyjna');
    await zapisz(page);
    await expect.poll(async () => (await pacjenci(page)).length).toBe(1);
    const p = (await pacjenci(page))[0];
    expect(p.rows).toEqual([100, 112]);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);

    await wczytaj(page, p.patientId);
    const ur = dataUr(9);
    await wpisz(page, { dobInput: ur.pole, weight: '30.8', height: '135' });
    await page.evaluate(() => {
      window.advancedGrowthData.measurements.push({ ageMonths: 106, ageYears: 106 / 12, height: 123, weight: 23.5 });
      window.vildaRehydrateAdvancedFromState && window.vildaRehydrateAdvancedFromState({ advancedGrowthData: window.advancedGrowthData });
    });
    await expect.poll(async () => (await stan(page)).kolektor.dobISO).toBe(ur.iso);
    await zapisz(page);
    await expect.poll(async () => (await pacjenci(page))[0].rows).toEqual([100, 106, 112]);

    // Drugi zapis pod rząd — przed poprawką tu pytało o „obcą zmianę" (własny wiersz 106).
    await wpisz(page, { weight: '31.0' });
    await zapisz(page);
    expect((await stan(page)).okna, 'żadnego okna o obcej zmianie').toEqual([]);
    expect((await pacjenci(page))[0].rows).toEqual([100, 106, 112]);

    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    const po = await stan(page);
    expect(po.name).toBe('Fikcyjna Ewa');
    await wpisz(page, { weight: '31.2' });
    await zapisz(page);
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].rows, 'wiersz z poprzedniego zapisu przeżył F5 i kolejny zapis').toEqual([100, 106, 112]);
    expect((await stan(page)).okna).toEqual([]);
  });

  test('docpro widzi datę i wiek wczytanego pacjenta, a zapis stamtąd nie gubi części nazwiska', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const ur = dataUr(5);
    const p = await pierwszaWizyta(page, { lastName: 'Fikcyjna', firstName: 'Ola', sex: 'K', dobInput: ur.pole, weight: '18', height: '108' });
    await wczytaj(page, p.patientId);
    const naIndex = await stan(page);

    await page.goto('/docpro.html', { waitUntil: 'load' });
    await gotowe(page);
    const naDocpro = await stan(page);
    expect(naDocpro.name).toBe('Fikcyjna Ola');
    expect(naDocpro.dobInput, 'data na docpro').toBe(ur.pole);
    expect(naDocpro.age, 'wiek na docpro').toBe(naIndex.age);
    expect(naDocpro.ageMonths).toBe(naIndex.ageMonths);
    expect(naDocpro.kolektor.lastName, 'części nazwiska niesione z rekordu').toBe('Fikcyjna');
    expect(naDocpro.kolektor.firstName).toBe('Ola');

    await wpisz(page, { weight: '18.6', height: '109.5' });
    await zapisz(page);
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].dobISO).toBe(ur.iso);
    expect(lista[0].lastName).toBe('Fikcyjna');
    expect(lista[0].firstName).toBe('Ola');

    await page.goto('/index.html', { waitUntil: 'load' });
    await gotowe(page);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__okna.length = 0; });
    await wczytaj(page, p.patientId);
    await page.waitForTimeout(2500); // vilda_name_fix czeka na payload i ewentualnie ponawia odczyt
    const po = await stan(page);
    expect(po.okna, 'bez pytania „które słowo to nazwisko"').toEqual([]);
    expect(po.dobInput).toBe(ur.pole);
  });

  test('data dopisana w Karcie Pacjenta dociera do wczytanego formularza, a zapis stamtąd jej nie wymazuje', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const p = await pierwszaWizyta(page, { lastName: 'Fikcyjna', firstName: 'Ola', sex: 'K', age: '5', ageMonths: '1', weight: '18', height: '108' });
    expect(p.dobISO).toBeNull();
    await wczytaj(page, p.patientId);

    // Ta sama operacja sejfu, którą wykonuje ekran „Edytuj" Karty Pacjenta na najnowszej wersji.
    const ur = dataUr(5);
    await page.evaluate(async ({ pid, iso }) => {
      const rec = await window.VildaVault.getPatient(pid);
      const snap = rec.snapshots[0];
      const pl = JSON.parse(JSON.stringify(snap.payload));
      pl.user.dobISO = iso;
      await window.VildaVault.updateSnapshotPayload(pid, snap.snapshotId, pl, { preserveSavedAt: false });
    }, { pid: p.patientId, iso: ur.iso });

    await expect.poll(async () => (await stan(page)).dobInput, { message: 'formularz zauważa datę z Karty Pacjenta' }).toBe(ur.pole);
    const po = await stan(page);
    expect(po.dobReadOnly).toBe(true);
    expect(po.bazaDob, 'linia bazowa podąża za rekordem').toBe(ur.iso);
    expect(po.age).not.toBe('');

    await wpisz(page, { weight: '18.4', height: '109' });
    await zapisz(page);
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(p.patientId);
    expect(lista[0].dobISO, 'data z Karty Pacjenta przeżyła zapis z formularza').toBe(ur.iso);
    expect(lista[0].snapshotCount).toBe(2);
  });
});
