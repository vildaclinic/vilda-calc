import { expect, test } from '../support/test-czas.mjs';

// P-POROWNANIE-W-TLE (polecenie właściciela 2026-10-13): „ogranicz przebudowę karty porównania przy synchronizacji”.
//
// Zmierzone na audyt f22c280 (index.html bez powłoki, Chromium, tryb profesjonalny, fikcyjny pacjent z dwoma pomiarami
// w sejfie, wczytany z Karty pacjenta jako „Nowy pomiar”): każde zdarzenie vilda:sync-status-changed i vilda:auth-hidden
// trafiało do Z() w vilda_summary_cards.js. Ten czytał pacjenta z sejfu, budował kartę „Porównanie z poprzednim
// pomiarem” od nowa (Se) i trzy razy wypełniał kolumny „Dziś”/„Zmiana” (updatePrevSummaryDiff). Na trzy wymiany
// synchronizacji wychodziło 885 mutacji DOM, w tym 804 z wypełniania kolumn, przy niezmienionych danych i bez różnicy
// na ekranie. Strona otwarta samodzielnie dostaje takie zdarzenia co ok. 20 s.
//
// Po zmianie odświeżenie w tle buduje kartę tylko wtedy, gdy wyszłaby inna (inny HTML albo inny poprzedni pomiar).
// Poprawka poprzedniego pomiaru w sejfie, np. z innego urządzenia, nadal odświeża kartę przy najbliższej synchronizacji.
// Dane FIKCYJNE. Czekamy na zakończenie odczytów z sejfu (obietnice getPatient), nie na upływ czasu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PorownanieTlo!26';
const MASA_POPRZEDNIO = '#prevSummaryContent tr[data-klucz="masa"] .pt-kol-poprzednio .pt-w';
const MASA_DZIS = '#prevSummaryContent tr[data-klucz="masa"] .pt-dzis .pt-w';
const MASA_ZMIANA = '#prevSummaryContent tr[data-klucz="masa"] .pt-zmiana';

const wpisz = (page, pola) => page.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

const liczbaMigawek = (page, pid) => page.evaluate(async (id) => {
  const p = await window.VildaVault.getPatient(id);
  return p && Array.isArray(p.snapshots) ? p.snapshots.length : 0;
}, pid);

// Licznik mutacji karty porównania i odczytów pacjenta z sejfu (wszyscy odbiorcy zdarzeń czytają getPatient).
const wlaczLicznik = (page) => page.evaluate(() => {
  if (window.__porownanie) window.__porownanie.mo.disconnect();
  const R = { mutacje: 0, odczyty: [], mo: null };
  R.mo = new MutationObserver((m) => { R.mutacje += m.length; });
  R.mo.observe(document.getElementById('prevSummaryContent'), { childList: true, subtree: true, characterData: true, attributes: true });
  const V = window.VildaVault;
  if (!V.__e2eLicznikOdczytow) {
    const odczyt = V.getPatient.bind(V);
    V.getPatient = function () {
      const p = odczyt.apply(null, arguments);
      try { window.__porownanie.odczyty.push(p); } catch (_) { /* licznik wyłączony */ }
      return p;
    };
    V.__e2eLicznikOdczytow = true;
  }
  window.__porownanie = R;
});

// Zdarzenia [typ, detail] w kształcie z vilda_sync_integration.js i vilda_auth_ui.js. Zwraca liczbę odczytów z sejfu,
// które wywołały, i czeka, aż wszystkie się zakończą: kontynuacja w vilda_summary_cards.js jest podpięta pod tę samą
// obietnicę wcześniej niż nasze oczekiwanie, więc po nim karta jest już po ewentualnej przebudowie.
const zdarzenia = (page, nazwy) => page.evaluate(async (lista) => {
  const R = window.__porownanie;
  const przed = R.odczyty.length;
  lista.forEach(([typ, detail]) => {
    document.dispatchEvent(new CustomEvent(typ, detail ? { detail } : undefined));
  });
  await Promise.allSettled(R.odczyty.slice(przed));
  await new Promise((r) => { setTimeout(r, 0); });
  return R.odczyty.length - przed;
}, nazwy);

const CYKL_SYNCHRONIZACJI = [['vilda:sync-status-changed', { state: 'syncing' }], ['vilda:sync-status-changed', { state: 'ok' }]];
const mutacjeKarty = (page) => page.evaluate(() => window.__porownanie.mutacje);

// Chłopiec 9 lat: zapisane pomiary 38 kg / 133 cm i 40 kg / 135 cm, potem wczytanie z Karty pacjenta jako „Nowy pomiar”
// z masą 41 kg — karta porównania pokazuje „Poprzednio” 40,0 kg i „Dziś” 41,0 kg.
async function pacjentZPorownaniem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.saveUserData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'),
  null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });

  const dob = await page.evaluate(() => {
    const d = new Date();
    const u = new Date(d.getFullYear() - 9, d.getMonth() - 1, 5);
    const z = (n) => String(n).padStart(2, '0');
    return `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}`;
  });
  await wpisz(page, { lastName: 'Probny', firstName: 'Jan', dobInput: dob, sex: 'M', weight: '38', height: '133' });
  await expect(page.locator('#bmiResult .result-number')).toHaveText(/\d/, { timeout: 15000 });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData())), 'pierwszy zapis').toBe(true);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => p.patientId)[0]);
  await expect.poll(() => liczbaMigawek(page, pid), { timeout: 15000 }).toBe(1);
  await wpisz(page, { weight: '40', height: '135' });
  await expect(page.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData())), 'drugi zapis').toBe(true);
  await expect.poll(() => liczbaMigawek(page, pid), { timeout: 15000 }).toBe(2);

  await page.evaluate(() => window.clearAllData());
  // custom-fixes.js po każdym vilda:patient-loaded nastawia od nowa zegar 3,2 s i wysyła potem `change` na polach formularza
  // (age, ageMonths, weight, height, sex). Wywołane tym update() wypełnia kolumny karty od nowa (ok. 2000 mutacji), także
  // bez żadnej synchronizacji. Okno pomiaru nie może go objąć, więc przygotowanie czeka na niego i na uspokojenie karty.
  // `change` na #ageMonths (test go nie wpisuje) co najmniej 3 s po ostatnim wczytaniu to właśnie ten impuls.
  await page.evaluate(() => {
    const W = { ostatnieWczytanie: 0, impuls: 0, mutacjaKarty: 0 };
    window.__wczytanie = W;
    document.addEventListener('vilda:patient-loaded', () => { W.ostatnieWczytanie = performance.now(); }, true);
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'ageMonths' && W.ostatnieWczytanie && performance.now() - W.ostatnieWczytanie >= 3000) W.impuls = performance.now();
    }, true);
    new MutationObserver(() => { W.mutacjaKarty = performance.now(); })
      .observe(document.getElementById('prevSummaryContent'), { childList: true, subtree: true, characterData: true, attributes: true });
  });
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  const wczytaj = page.getByRole('button', { name: 'Wczytaj tego pacjenta' });
  await wczytaj.waitFor({ state: 'visible', timeout: 20000 });
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await wczytaj.click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
  await expect(page.locator('#prevSummaryWrap')).toBeVisible({ timeout: 15000 });
  await wpisz(page, { weight: '41', height: '136' });
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('40,0 kg', { timeout: 15000 });
  await expect(page.locator(MASA_DZIS)).toHaveText('41,0 kg', { timeout: 15000 });
  await page.waitForFunction(() => window.__wczytanie.impuls > 0, null, { timeout: 20000 });
  // Kartę z wczytania (vilda:patient-loaded, source 'pick') buduje odczyt z sejfu, a datę urodzenia formularz dostaje
  // ok. 200 ms później. Kto wygra, zależy od tempa maszyny. Centyl wzrostu w kolumnie „Poprzednio” liczy się bez daty
  // z pełnych miesięcy, a z datą — z dokładnego wieku (lmsNiemowleWiek → VildaDobAge.readExactAge), tu 39 → 38 centyl.
  // Karta zbudowana przed datą słusznie powstaje więc od nowa przy pierwszej synchronizacji (na CI 142 mutacje, jedna
  // przebudowa). Tu, po dacie w formularzu, karta jest budowana jawnie, jak po edycji pomiaru — pomiar zaczyna się od
  // karty zgodnej z bieżącym stanem, niezależnie od wyścigu.
  await expect(page.locator('#dobInput')).toHaveValue(dob);
  await wlaczLicznik(page);
  expect(await zdarzenia(page, [['vilda:measurement-changed', { patientId: pid, action: 'edit' }]]),
    'jawna przebudowa czyta pacjenta z sejfu').toBeGreaterThan(0);
  expect(await mutacjeKarty(page), 'jawne zdarzenie buduje kartę od nowa').toBeGreaterThan(0);
  await page.waitForFunction(() => performance.now() - window.__wczytanie.mutacjaKarty > 1500, null, { timeout: 20000 });
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('40,0 kg');
  await expect(page.locator(MASA_DZIS)).toHaveText('41,0 kg');
  return pid;
}

test('synchronizacja i zamknięcie panelu konta bez zmiany rekordu nie przebudowują karty porównania', async ({ page }) => {
  test.setTimeout(150_000);
  await pacjentZPorownaniem(page);
  const zmianaPrzed = await page.locator(MASA_ZMIANA).textContent();

  await wlaczLicznik(page);
  for (let k = 0; k < 3; k += 1) {
    expect(await zdarzenia(page, CYKL_SYNCHRONIZACJI), 'odświeżenie w tle czyta pacjenta z sejfu').toBeGreaterThan(0);
  }
  expect(await zdarzenia(page, [['vilda:auth-hidden']]), 'zamknięcie panelu konta też czyta z sejfu').toBeGreaterThan(0);

  expect(await mutacjeKarty(page), 'karta porównania bez przebudowy i bez ponownego wypełniania kolumn').toBe(0);
  await expect(page.locator('#prevSummaryWrap')).toBeVisible();
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('40,0 kg');
  await expect(page.locator(MASA_DZIS)).toHaveText('41,0 kg');
  expect(await page.locator(MASA_ZMIANA).textContent(), 'kolumna „Zmiana” bez zmian').toBe(zmianaPrzed);
  expect(await page.evaluate(() => window.prevMeasurementInfo && window.prevMeasurementInfo.weightKg)).toBe(40);

  // Jawne zdarzenie zmiany pomiaru nadal buduje kartę od nowa.
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('vilda:measurement-changed', {
      detail: { patientId: sessionStorage.getItem('vildaPrevSummaryPid'), action: 'edit' },
    }));
  });
  await expect.poll(() => mutacjeKarty(page), { timeout: 15000 }).toBeGreaterThan(0);
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('40,0 kg');
});

test('poprawka poprzedniego pomiaru w sejfie (jak z innego urządzenia) odświeża kartę przy najbliższej synchronizacji', async ({ page }) => {
  test.setTimeout(150_000);
  const pid = await pacjentZPorownaniem(page);
  const zmianaPrzed = await page.locator(MASA_ZMIANA).textContent();

  // Ta sama migawka, masa 40 → 39,5 kg; data zapisu bez zmian.
  await page.evaluate(async (id) => {
    const sid = sessionStorage.getItem('vildaPrevSummaryAnchor');
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots.find((x) => x.snapshotId === sid);
    const payload = JSON.parse(JSON.stringify(snap.payload));
    payload.user.weight = 39.5;
    if (payload.advanced && payload.advanced.data && typeof payload.advanced.data.currentWeight === 'number') {
      payload.advanced.data.currentWeight = 39.5;
    }
    await window.VildaVault.updateSnapshotPayload(id, sid, payload, { preserveSavedAt: true });
  }, pid);
  await expect(page.locator(MASA_POPRZEDNIO), 'bez zdarzenia karta jeszcze nie wie o poprawce').toHaveText('40,0 kg');

  await wlaczLicznik(page);
  await zdarzenia(page, CYKL_SYNCHRONIZACJI);
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('39,5 kg');
  await expect(page.locator(MASA_DZIS)).toHaveText('41,0 kg');
  expect(await page.locator(MASA_ZMIANA).textContent(), 'kolumna „Zmiana” liczona od poprawionej masy').not.toBe(zmianaPrzed);
  expect(await page.evaluate(() => window.prevMeasurementInfo && window.prevMeasurementInfo.weightKg)).toBe(39.5);
  expect(await mutacjeKarty(page), 'zmieniony rekord buduje kartę od nowa').toBeGreaterThan(0);

  // Poprawka samej daty pomiaru (P-ODTWORZ-WIEK: user.measuredAtISO) zmienia tylko HTML karty, nie poprzedni pomiar
  // (window.prevMeasurementInfo) — też odświeża kartę.
  await page.evaluate(async (id) => {
    const sid = sessionStorage.getItem('vildaPrevSummaryAnchor');
    const p = await window.VildaVault.getPatient(id);
    const payload = JSON.parse(JSON.stringify(p.snapshots.find((x) => x.snapshotId === sid).payload));
    payload.user.measuredAtISO = '2026-03-05';
    await window.VildaVault.updateSnapshotPayload(id, sid, payload, { preserveSavedAt: true });
  }, pid);
  const zeton = page.locator('#prevSummaryContent .porownanie-chip').first();
  await expect(zeton).not.toHaveText('Poprzedni pomiar: 5 marca 2026');
  await zdarzenia(page, CYKL_SYNCHRONIZACJI);
  await expect(zeton).toHaveText('Poprzedni pomiar: 5 marca 2026');
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('39,5 kg');

  // Kolejna synchronizacja bez zmian już niczego nie przebudowuje.
  await wlaczLicznik(page);
  await zdarzenia(page, CYKL_SYNCHRONIZACJI);
  expect(await mutacjeKarty(page)).toBe(0);
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('39,5 kg');

  // Karta schowana w międzyczasie (tu: zdarzenie storage wyczyszczonego magazynu sesji) nie jest „taka sama”:
  // najbliższa synchronizacja buduje ją i pokazuje jak dotąd.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.sessionStorage })));
  await expect(page.locator('#prevSummaryWrap')).toBeHidden();
  await wlaczLicznik(page);
  await zdarzenia(page, CYKL_SYNCHRONIZACJI);
  await expect(page.locator('#prevSummaryWrap')).toBeVisible();
  await expect(page.locator(MASA_POPRZEDNIO)).toHaveText('39,5 kg');
  expect(await page.evaluate(() => window.prevMeasurementInfo && window.prevMeasurementInfo.weightKg)).toBe(39.5);
});
