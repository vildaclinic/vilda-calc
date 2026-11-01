import { expect, test } from '../support/test-czas.mjs';

// P-WYNIKI-SPOKOJ (zgłoszenie właściciela 2026-10-12): po P-PANEL-POWROT „to migotanie/skakanie nadal jest, nawet jak
// strona »nic« nie robi i nie jest na pierwszym planie na macOS/Windows”.
//
// Zmierzone na audyt 52bcc7b (prawdziwa powłoka, Chromium 1440×1000, tryb profesjonalny, fikcyjny pacjent z sejfu):
// zdarzenia w tle — każda zmiana stanu synchronizacji (`vilda:sync-status-changed`) i `vilda:auth-hidden` — dochodzą
// do vilda_puberty_source.js, który odczytuje pacjenta z sejfu od nowa i ogłasza najpierw „loading”, potem „ready”;
// vilda_zrodla_pacjenta.js zamawia wtedy pełne update(). Dane się nie zmieniają, a mimo to update():
//   - chowało #results (display:none) i w tym samym zadaniu pokazywało je z powrotem; przeglądarka restartowała przy
//     tym wszystkie animacje w wynikach: przyciski „Podsumowanie wyników”/„Zalecenia dietetyczne” podjeżdżały o 12 px,
//     #intakeCard wjeżdżała, obracający się obrys „Podsumowania wyników” wracał do 0°, a pulsowania ostrzeżeń
//     zaczynały od zera — 16 startów animacji na jedno zdarzenie;
//   - budowało kafelki karty „Centyle i BMI” od nowa, a app.js nadawał każdemu wjazd, błysk tła i odliczanie BMI od zera;
//     pierścień ostrzeżenia trybu profesjonalnego (.pro-overlay) startował od zera przy każdym przeliczeniu.
// Po poprawce przeliczenie bez zmiany danych niczego nie rusza; zmiana danych animuje jak dotąd. Dane FIKCYJNE.
//
// Odczyty nie zależą od liczby klatek: obserwator mutacji czyta nowy #bmiResult w tym samym zadaniu co przebudowa,
// obserwator stylu łapie każde display:none na #results, a tożsamość animacji obrysu i faza pulsowań pochodzą z Web
// Animations API.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WynikiSpokoj!26';
// Animacje, które przeliczenie bez zmiany danych restartowało (wjazdy, błysk tła, obrys przycisku podsumowania).
const WJAZDY = ['fadeSlideUp', 'ios-enter', 'pulseBG', 'rotateSummaryBorder'];
const PULSY = ['pulseRed', 'pulseOrange'];

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && f.contentWindow.document.readyState === 'complete');
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  await trybProfesjonalny(start);
  return start;
}

// Tryb profesjonalny pokazuje przyciski „Podsumowanie wyników”/„Zalecenia dietetyczne” i pierścień ostrzeżenia karty BMI.
const trybProfesjonalny = (start) => start.waitForFunction(() => {
  const pro = document.getElementById('resultsModeToggle');
  if (!pro) return false;
  if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
  return window.professionalMode === true;
}, null, { timeout: 15000 });

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

// Chłopiec 9 lat, 135 cm, 40 kg → BMI 21,9 (stała do porównania; wynik bez zmian). Masa w pasmie ostrzeżenia,
// więc karta BMI ma pierścień .pro-overlay, a karta spożycia i Cole — zapętlone pulsowanie.
async function wynikiGotowe(start) {
  await expect(start.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
  await expect(start.locator('#dietRecommendationsBtn')).toBeVisible();
  await expect(start.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });
  // Samo BMI jest takie samo w obu trybach. Czekamy na właściwy widok
  // profesjonalny, który update() buduje po przełączeniu w kolejnej klatce.
  await expect(start.locator('#whResult')).toContainText('wSDS');
  await expect(start.locator('#whResult')).toContainText('hSDS');
  await expect(start.locator('#bmiResult')).toContainText('bmiSDS');
  // Rejestrator zaczyna pomiar po zakończeniu istniejących wjazdów/błysków.
  // Obietnice przeglądarki obejmują także animacje oczekujące na pierwszy start.
  await start.evaluate(async (nazwy) => {
    const poczatkowe = document.getAnimations().filter((animacja) =>
      nazwy.includes(animacja.animationName)
      && animacja.effect.getComputedTiming().iterations !== Infinity);
    await Promise.all(poczatkowe.map((animacja) => animacja.finished.catch(() => null)));
  }, WJAZDY);
}

async function odtworzWczytanyPomiar(start) {
  // Okno jest otwierane asynchronicznie po patient-loaded. Stałe odczekanie
  // i warunkowe kliknięcie mogły pominąć wybór przy wolniejszym wykonaniu CI.
  await expect(start.locator('#vildaLoadChoiceModal')).toBeVisible();
  await start.locator('#vildaLcmRestore').click();
  await expect(start.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(start.locator('#age')).toHaveValue('9');
  await expect(start.locator('#height')).toHaveValue('135');
  await expect(start.locator('#weight')).toHaveValue('40');
}

// Rejestrator w ramce Start. Wszystko, co zapisuje, powstaje w obserwatorach mutacji albo w zdarzeniach animacji,
// więc wynik nie zależy od tego, ile klatek zdążyła narysować obciążona maszyna.
const wlaczRejestrator = (fr) => fr.evaluate(async (pulsy) => {
  if (window.__rej) { window.__rej.mo.forEach((m) => m.disconnect()); document.removeEventListener('animationstart', window.__rej.naStart, true); }
  const R = { mo: [], starty: [], schowania: 0, wstawienia: [], liczby: [], polozenie: null, obrys: null, naStart: null, pulsy: [], pulsyTeraz: null };
  // Zapętlone pulsowania ostrzeżeń: miejsce (element albo rodzic nakładki .pro-overlay, pseudoelement) i faza, czyli
  // przesunięcie startu względem zegara dokumentu modulo czas cyklu. Świeża animacja czeka na start (startTime null),
  // więc faza jest czytana po Animation.ready — to obietnica przeglądarki, nie odliczanie klatek.
  R.pulsyTeraz = async () => {
    const lista = document.getAnimations()
      .filter((a) => pulsy.includes(a.animationName) && a.playState === 'running' && a.effect.getComputedTiming().iterations === Infinity);
    await Promise.all(lista.map((a) => a.ready.catch(() => null)));
    return lista.filter((a) => a.startTime !== null && a.playState === 'running').map((a) => {
      const t = a.effect.target;
      const miejsce = t.id ? '#' + t.id : (t.parentElement && t.parentElement.id ? '#' + t.parentElement.id + ' > ' : '') + '.' + String(t.className).trim().split(/\s+/)[0];
      const d = a.effect.getComputedTiming().duration;
      const faza = (((document.timeline.currentTime - a.currentTime) % d) + d) % d;
      return { a, klucz: a.animationName + ' ' + miejsce + (a.effect.pseudoElement || ''), faza, d };
    });
  };
  R.pulsy = await R.pulsyTeraz();
  const wyniki = document.getElementById('results');
  const gora = (id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  R.polozenie = { przyciski: gora('metabolicSummarySection'), karta: gora('bmiCard') };
  const obrys = document.getAnimations().find((a) => a.animationName === 'rotateSummaryBorder');
  R.obrys = obrys || null;
  R.naStart = (e) => {
    const el = e.target;
    R.starty.push({ nazwa: e.animationName, el: (el.id ? '#' + el.id : el.tagName.toLowerCase()) + String(el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '') });
  };
  document.addEventListener('animationstart', R.naStart, true);
  // Schowanie i pokazanie w jednym zadaniu daje dwa rekordy naraz: stan „none” widać w oldValue rekordu, który go zakończył.
  const ukryty = (v) => /display:\s*none/.test(v || '');
  const moStyl = new MutationObserver((zm) => {
    zm.forEach((z) => { if (ukryty(z.oldValue)) R.schowania += 1; });
    if (ukryty(wyniki.getAttribute('style'))) R.schowania += 1;
  });
  moStyl.observe(wyniki, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  const moDrzewo = new MutationObserver((zm) => zm.forEach((z) => {
    z.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      const el = n.id === 'bmiResult' ? n : n.querySelector && n.querySelector('#bmiResult');
      if (!el) return;
      // Kafelek, który następne przeliczenie w tym samym zadaniu już zastąpiło, nie ma stylu obliczonego ani animacji.
      R.wstawienia.push({
        podlaczony: el.isConnected,
        op: el.isConnected ? getComputedStyle(el).opacity : null,
        wjazd: el.classList.contains('animate-in'),
        trwajace: el.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName),
      });
    });
    const t = z.target.nodeType === 1 ? z.target : z.target.parentElement;
    const liczba = t && t.closest && t.closest('.result-number');
    if (liczba && t.closest('#bmiResult')) R.liczby.push(liczba.textContent);
  }));
  moDrzewo.observe(wyniki, { childList: true, subtree: true, characterData: true });
  R.mo.push(moStyl, moDrzewo);
  window.__rej = R;
}, PULSY);

const odczytajRejestrator = (fr) => fr.evaluate(async () => {
  const R = window.__rej;
  const gora = (id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  const obrysTeraz = document.getAnimations().find((a) => a.animationName === 'rotateSummaryBorder') || null;
  // Pulsowanie odtworzone w trakcie pomiaru (nowa animacja w miejscu starej) ma kontynuować fazę poprzednika.
  const stare = new Set(R.pulsy.map((p) => p.a));
  const odtworzone = (await R.pulsyTeraz()).filter((p) => !stare.has(p.a)).map((p) => {
    const poprzednik = R.pulsy.find((q) => q.klucz === p.klucz);
    if (!poprzednik) return { klucz: p.klucz, roznica: null };
    const r = Math.abs(p.faza - poprzednik.faza) % p.d;
    return { klucz: p.klucz, roznica: Math.round(Math.min(r, p.d - r)) };
  });
  return {
    starty: R.starty,
    schowania: R.schowania,
    wstawienia: R.wstawienia,
    liczby: [...new Set(R.liczby)],
    przed: R.polozenie,
    po: { przyciski: gora('metabolicSummarySection'), karta: gora('bmiCard') },
    obrysJestTenSam: Boolean(R.obrys) && R.obrys === obrysTeraz,
    obrysBiegnie: Boolean(obrysTeraz) && obrysTeraz.playState === 'running',
    odtworzone,
  };
});

function sprawdzSpokoj(stan, liczbaBmi) {
  expect(stan.schowania, '#results nie znika na czas przeliczenia (display:none restartował animacje w wynikach)').toBe(0);
  for (const w of stan.wstawienia) {
    expect(w.wjazd, 'kafelek BMI z niezmienioną treścią nie dostaje animate-in').toBe(false);
    if (w.podlaczony) expect(w, 'kafelek BMI z niezmienioną treścią nie wjeżdża ponownie').toEqual({ podlaczony: true, op: '1', wjazd: false, trwajace: [] });
  }
  expect(stan.starty.filter((s) => WJAZDY.includes(s.nazwa)), 'żadna animacja wjazdu, błysku ani obrysu nie rusza od nowa').toEqual([]);
  expect(stan.obrysBiegnie, 'obracający się obrys „Podsumowania wyników” biegnie').toBe(true);
  expect(stan.obrysJestTenSam, 'obrys „Podsumowania wyników” to wciąż ta sama animacja (nie wrócił do 0°)').toBe(true);
  expect(stan.po, 'przyciski podsumowania i karta „Centyle i BMI” stoją w miejscu').toEqual(stan.przed);
  for (const p of stan.odtworzone) {
    expect(p.roznica, `${p.klucz}: odtworzone pulsowanie ma poprzednika w tym samym miejscu`).not.toBeNull();
    expect(p.roznica, `${p.klucz}: odtworzone pulsowanie kontynuuje fazę poprzednika (bez startu od zera)`).toBeLessThanOrEqual(2);
  }
  for (const l of stan.liczby) expect(l, 'liczba BMI nie odlicza się od zera').toBe(liczbaBmi);
}

test('przeliczenie bez zmiany danych: wyniki nie znikają, kafelki i przyciski nie wjeżdżają od nowa, pulsowanie nie zaczyna od zera', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  await wpisz(start, { sex: 'M', age: '9', ageMonths: '0', weight: '40', height: '135' });
  await wynikiGotowe(start);

  // Dwa przeliczenia z rzędu — tak update() zamawia w tle źródło pacjenta (ogłoszenie „loading”, potem „ready”).
  await wlaczRejestrator(start);
  await start.evaluate(() => { window.update(); window.update(); });
  await start.waitForTimeout(1500);
  const stan = await odczytajRejestrator(start);
  expect(stan.wstawienia.filter((w) => w.podlaczony).length, 'update() przebudowało kafelek BMI').toBeGreaterThan(0);
  expect(stan.odtworzone.length, 'update() odtworzyło pierścień ostrzeżenia karty BMI').toBeGreaterThan(0);
  sprawdzSpokoj(stan, '21,9');

  // Zmiana danych animuje jak dotąd: nowy wynik wjeżdża od opacity 0 z biegnącym fadeSlideUp.
  await wlaczRejestrator(start);
  await wpisz(start, { weight: '41' });
  await expect(start.locator('#bmiResult .result-number')).toHaveText('22,5', { timeout: 15000 });
  const poZmianie = await odczytajRejestrator(start);
  expect(poZmianie.wstawienia.length, 'zmiana masy przebudowała wynik').toBeGreaterThan(0);
  expect(poZmianie.wstawienia[0].podlaczony, 'wynik po zmianie masy jest na stronie').toBe(true);
  expect(poZmianie.wstawienia[0].op, 'wynik po zmianie masy wjeżdża: animacja startuje od opacity 0').toBe('0');
  expect(poZmianie.wstawienia[0].wjazd, 'wynik po zmianie masy dostaje animate-in').toBe(true);
  expect(poZmianie.wstawienia[0].trwajace, 'wynik po zmianie masy ma biegnącą animację wjazdu').toContain('fadeSlideUp');
});

test('synchronizacja w tle u pacjenta wczytanego z sejfu: karta „Centyle i BMI” i przyciski podsumowania stoją w miejscu', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  const patientId = await start.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Probny Jan',
      user: { lastName: 'Probny', firstName: 'Jan', sex: 'M', age: 9, ageMonths: 0, height: 135, weight: 40 },
    }, { dedup: false });
    return w.patientId;
  });
  // Wczytanie jak z listy pacjentów (ścieżka source:"pick"), potem „Odtwórz zapis”.
  await start.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, patientId);
  await expect(start.locator('#lastName')).toHaveValue('Probny', { timeout: 15000 });
  await odtworzWczytanyPomiar(start);
  await trybProfesjonalny(start);
  await wynikiGotowe(start);

  await wlaczRejestrator(start);
  // Cykl synchronizacji dokładnie w kształcie z vilda_sync_integration.js i zamknięcie nakładki logowania.
  await start.evaluate(() => {
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'syncing' }, bubbles: false }));
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'ok' }, bubbles: false }));
  });
  await start.waitForTimeout(1500); // odczyt pacjenta z sejfu jest asynchroniczny
  await start.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:auth-hidden')));
  await start.waitForTimeout(1500);
  sprawdzSpokoj(await odczytajRejestrator(start), '21,9');
});
