import { expect, test } from '../support/test-czas.mjs';

// P-ODTWORZ-ZYWO (zgłoszenie właściciela 2026-09-16) — dwa przebiegi w powłoce app.html:
//   1. Panel DocPro jest już otwarty w ramce, lekarz wczytuje pacjenta z datą urodzenia na Start
//      i klika „Odtwórz zapis". DocPro dostaje wtedy tylko vildaPersistRestoreAll() (bez zdarzeń),
//      a data urodzenia celowo nie wędruje przez sharedUserData — zmierzone przed poprawką: pole
//      daty na DocPro zostawało PUSTE, choć window.lastLoadedData ją niosło. Teraz odtworzenie
//      „na żywo" wysyła `vilda:persist-restored`, którego słucha moduł daty i blokada tożsamości.
//   2. Waga i wzrost na Start nie mogą zniknąć po odtworzeniu — patrz też test lustra formularza
//      w tests/e2e/lustro-formularza-pusta-paczka.spec.mjs.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Powloka!26a';

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

const stan = (fr) => fr.evaluate(() => {
  const g = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
  return {
    w: g('weight'), h: g('height'), dob: g('dobInput'), age: g('age'), lastName: g('lastName'),
    lastNameRo: Boolean(document.getElementById('lastName') && document.getElementById('lastName').readOnly),
    dobRo: Boolean(document.getElementById('dobInput') && document.getElementById('dobInput').readOnly),
    baza: Boolean(window.lastLoadedData),
  };
});

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const gotowa = (fr) => fr.waitForFunction(() => window.VildaVault.isUnlocked()
  && typeof window.saveUserData === 'function' && Boolean(window.VildaDobAge) && typeof window.applyLoadedData === 'function');

test('DocPro otwarty w tle dostaje datę urodzenia i blokadę tożsamości po wczytaniu na Start; Start nie gubi wagi i wzrostu', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await gotowa(start);
  await page.waitForTimeout(2500);

  // Pierwsza wizyta z datą urodzenia, zapis, wyczyszczenie.
  await wpisz(start, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', dobInput: '05-05-2017', weight: '30.2', height: '134' });
  await start.waitForTimeout(500);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await start.waitForTimeout(1500);
  await start.evaluate(() => window.clearAllData());
  await start.waitForTimeout(1500);

  // DocPro otwarty i zostawiony w tle — jak u lekarza, który był tam wcześniej.
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await gotowa(docpro);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.waitForTimeout(1200);
  expect((await stan(docpro)).dob, 'przed wczytaniem DocPro nie ma daty').toBe('');

  // Wczytanie na Start (jak zakładka Pacjenci) i szybkie „Odtwórz zapis".
  const pid = (await start.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId)))[0];
  await start.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await start.waitForSelector('#vildaLcmRestore', { timeout: 8000 });
  await page.waitForTimeout(400);
  await start.locator('#vildaLcmRestore').click();

  // Sześć sekund obserwacji: wartości na Start mają zostać (zgłoszenie: znikały po 2–3 s).
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(750);
    const s = await stan(start);
    expect(s.w, `Start t+${(i + 1) * 0.75}s: waga`).toBe('30.2');
    expect(s.h, `Start t+${(i + 1) * 0.75}s: wzrost`).toBe('134');
    expect(s.dob).toBe('05-05-2017');
  }

  // DocPro w tle: data z bazy wczytanego pacjenta, tylko do odczytu, tożsamość z kartoteki.
  const d = await stan(docpro);
  expect(d.dob, 'DocPro: data urodzenia po odtworzeniu na żywo').toBe('05-05-2017');
  expect(d.dobRo).toBe(true);
  expect(d.lastName).toBe('Fikcyjna');
  expect(d.lastNameRo, 'DocPro: nazwisko z kartoteki').toBe(true);
  expect(d.baza).toBe(true);

  // Przełączenie na DocPro nic nie kasuje.
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await page.waitForTimeout(2500);
  const po = await stan(docpro);
  expect(po.dob).toBe('05-05-2017');
  expect(po.w).toBe('30.2');
  expect(po.h).toBe('134');
  expect((await stan(start)).w, 'Start po przełączeniu paneli').toBe('30.2');
});
