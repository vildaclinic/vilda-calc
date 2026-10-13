import { expect } from './test-czas.mjs';

// P-POROWNANIE-DATA (polecenie właściciela 2026-10-13): karta „Porównanie z poprzednim pomiarem” po wczytaniu
// pacjenta pokazuje centyl wzrostu „Poprzednio” z wieku dokładnego od pierwszej klatki. Wspólne kroki testów e2e
// (index.html) — desktop (porownanie-data-urodzenia.spec.mjs) i telefon (…-mobile.spec.mjs). Dane FIKCYJNE.
//
// Wyścig: kartę buduje odczyt z sejfu, a datę urodzenia z rekordu wpisuje do formularza vilda_dob_age.js w osobnym
// zadaniu. Karta zbudowana przed datą liczyła centyl z pełnych miesięcy, po dacie — z wieku dokładnego. Na zajętej
// maszynie wygrywał odczyt z sejfu (CI #659: 39. zamiast 38. centyla do najbliższej synchronizacji). `opozniDate`
// odtwarza ten stan za każdym razem: przyjęcie daty rusza 400 ms później, jak na wolnym procesorze.
// Asercje czekają na warunek, nie na upływ czasu.

// Centyl poprzedniego pomiaru jest w karcie dwa razy: w kolumnie „Poprzednio” (na telefonie ukrytej) i w dopisku
// „było …” w kolumnie „Dziś”, który na telefonie ją zastępuje.
const POPRZEDNIO_CENTYL = '#prevSummaryContent tr[data-klucz="wzrost"] .pt-kol-poprzednio .pt-s';
const BYLO = '#prevSummaryContent tr[data-klucz="wzrost"] .pt-dzis .pt-byl';

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

// Chłopiec ok. 9 lat 1 mies. i 12 dni (połowa miesiąca, więc wiek dokładny wyraźnie różni się od pełnych miesięcy):
// zapisane pomiary 38 kg / 133 cm i 40 kg / 135 cm, oba dziś. Potem „Wyczyść”, jak przed wczytaniem innego pacjenta.
export async function pacjentZDwomaPomiarami(page, haslo) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
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
    const u = new Date(d.getFullYear() - 9, d.getMonth() - 1, d.getDate() - 12);
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
  await expect(page.locator('#dobInput')).toHaveValue('');
  return { pid, dob };
}

// Przyjęcie daty z rekordu (vilda_dob_age.js) rusza 400 ms później — odczyt z sejfu wygrywa wyścig za każdym razem.
// Rozpoznajemy je po nazwie funkcji przekazanej do setTimeout: przed poprawką przyjmijZWczytanego, po niej
// przyjmijIOglos.
export const opozniDate = (page) => page.evaluate(() => {
  const zwykly = window.setTimeout;
  window.setTimeout = function (fn, ms, ...reszta) {
    const nazwa = fn && fn.name;
    const opoznij = nazwa === 'przyjmijIOglos' || nazwa === 'przyjmijZWczytanego';
    return zwykly.call(window, fn, opoznij ? 400 : ms, ...reszta);
  };
});

// Próbnik: w każdej klatce, w której karta porównania jest widoczna i ma tabelę, centyl wzrostu „Poprzednio”
// i dopisek „było …”.
export const wlaczProbnik = (page) => page.evaluate(() => {
  const P = { klatki: [], stop: false };
  window.__dataProbnik = P;
  const krok = () => {
    if (P.stop) return;
    const wrap = document.getElementById('prevSummaryWrap');
    const el = document.querySelector('#prevSummaryContent tr[data-klucz="wzrost"] .pt-kol-poprzednio .pt-s');
    const bylo = document.querySelector('#prevSummaryContent tr[data-klucz="wzrost"] .pt-dzis .pt-byl');
    if (wrap && wrap.style.display === 'block' && el) {
      P.klatki.push({ centyl: el.textContent, bylo: bylo ? bylo.textContent : '', data: (document.getElementById('dobInput') || {}).value || '' });
    }
    requestAnimationFrame(krok);
  };
  requestAnimationFrame(krok);
});

// Wczytanie z Karty Pacjenta jako „Nowy pomiar” — ta sama droga, co u lekarza (vilda:patient-loaded, source 'pick').
export async function wczytajNowyPomiar(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  const wczytaj = page.getByRole('button', { name: 'Wczytaj tego pacjenta' });
  await wczytaj.waitFor({ state: 'visible', timeout: 20000 });
  await wczytaj.click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
}

// Centyl wzrostu poprzedniego pomiaru (135 cm) z pełnych miesięcy i z wieku dokładnego — ten sam silnik
// i ta sama etykieta, co karta. Liczone po wczytaniu, gdy data jest już w formularzu.
export const centyleKontrolne = (page) => page.evaluate(() => {
  const dokladny = window.VildaDobAge.readExactAge();
  const zrodlo = typeof bmiSource !== 'undefined' && bmiSource ? String(bmiSource) : 'OLAF';
  const etykieta = (wiekMies) => {
    const r = window.VildaSdsWzrostu.policz({ wzrost: 135, plec: 'M', wiekMies, zrodlo });
    return r && typeof r.centyl === 'number' ? window.formatCentileLabel(r.centyl) : null;
  };
  return {
    pelneMiesiace: dokladny ? etykieta(dokladny.totalMonths) : null,
    wiekDokladny: dokladny ? etykieta(dokladny.exactMonths) : null,
    wiek: dokladny ? [dokladny.totalMonths, Math.round(dokladny.exactMonths * 100) / 100] : null,
  };
});

// Cały scenariusz: dwa pomiary dziś, „Wyczyść”, wczytanie jako „Nowy pomiar”. Zwraca próbki i centyle kontrolne.
export async function kartaPoWczytaniu(page, haslo, { wymusWyscig }) {
  const { pid, dob } = await pacjentZDwomaPomiarami(page, haslo);
  if (wymusWyscig) await opozniDate(page);
  await wlaczProbnik(page);
  await wczytajNowyPomiar(page, pid);
  await expect(page.locator('#dobInput')).toHaveValue(dob, { timeout: 15000 });
  await page.waitForFunction(() => !window.VildaDobAge.restorePending || !window.VildaDobAge.restorePending(), null, { timeout: 15000 });
  await expect(page.locator('#prevSummaryWrap')).toBeVisible({ timeout: 15000 });
  await expect(page.locator(POPRZEDNIO_CENTYL)).toBeAttached({ timeout: 15000 });
  // Kilka klatek z kartą po przyjęciu daty — żeby próbnik objął też stan ustalony.
  await page.waitForFunction(() => window.__dataProbnik.klatki.filter((k) => k.data).length >= 3, null, { timeout: 15000 });
  const P = await page.evaluate(() => { const P = window.__dataProbnik; P.stop = true; return P; });
  const kontrolne = await centyleKontrolne(page);
  const koniec = await page.locator(POPRZEDNIO_CENTYL).textContent();
  const byloKoniec = await page.locator(BYLO).textContent();
  return { P, kontrolne, koniec, byloKoniec };
}

export function sprawdzKarte({ P, kontrolne, koniec, byloKoniec }, opis) {
  expect(kontrolne.pelneMiesiace, `${opis}: centyl z pełnych miesięcy`).toBeTruthy();
  expect(kontrolne.wiekDokladny, `${opis}: centyl z wieku dokładnego`).toBeTruthy();
  expect(kontrolne.pelneMiesiace, `${opis}: pełne miesiące i wiek dokładny dają różne centyle (inaczej test niczego nie rozstrzyga)`)
    .not.toBe(kontrolne.wiekDokladny);
  expect(P.klatki.length, `${opis}: próbki z klatek z kartą`).toBeGreaterThan(0);
  // W dopisku „było …” centyl stoi na końcu („było 135,0 cm, 38 centyl”); pusty dopisek — przed wypełnieniem kolumny.
  const inne = P.klatki.map((k, i) => ({ klatka: i, ...k }))
    .filter((k) => k.centyl !== kontrolne.wiekDokladny || (k.bylo && !k.bylo.endsWith(kontrolne.wiekDokladny)));
  expect(inne.slice(0, 3), `${opis}: „Poprzednio” z wieku dokładnego (${kontrolne.wiekDokladny}) w każdej klatce z kartą, od pierwszej`).toEqual([]);
  expect(koniec, `${opis}: karta po wczytaniu`).toBe(kontrolne.wiekDokladny);
  expect(byloKoniec, `${opis}: dopisek „było …” po wczytaniu`).toMatch(new RegExp(`${kontrolne.wiekDokladny}$`));
}
