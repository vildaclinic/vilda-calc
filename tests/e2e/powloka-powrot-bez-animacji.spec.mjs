import { expect, test } from '../support/test-czas.mjs';

// P-PANEL-POWROT (zgłoszenie właściciela 2026-10-12): „karta »Centyle i BMI« oraz przyciski »Podsumowanie wyników«
// i »Zalecenia dietetyczne« skaczą, jak się zmienia strony”.
//
// Zmierzone przed poprawką na prawdziwej powłoce (Start → DocPro → Start, Chromium 1440×1000 i 390×844):
//   - powłoka ukrywa nieaktywny panel przez display:none, więc po ponownym pokazaniu przeglądarka od nowa uruchamia
//     jednorazowe animacje CSS: #metabolicSummarySection (oba przyciski) w pierwszej klatce stała 12 px niżej
//     z opacity 0 i przez 0,45 s podjeżdżała; #intakeCard wjeżdżała o 18 px (ios-enter);
//   - odtworzenie sesji (Gp_p) przeliczało wyniki: #bmiResult, #whResult i #bmiJourneyMount wjeżdżały od nowa
//     z błyskiem tła, a liczba BMI odliczała się od zera (0,1 → 21,9 przez ok. 0,6 s);
//   - 87 próbek widocznych klatek z takim efektem w ciągu ok. 0,5 s (desktop), 224 na telefonie.
// Po poprawce panel pokazany ponownie przez 2 s ma klasę vilda-panel-powrot: animacje wejścia startują jako
// zakończone, liczby nie są odliczane, a po zdjęciu klasy żadna animacja nie rusza od nowa. Dane FIKCYJNE.
// Na obciążonej maszynie (pełny zestaw, 4 workery) klatki potrafią przychodzić rzadko, więc próbnik klatek służy tylko
// do wykrycia ruchu; to, że animacje po oknie działają, sprawdza odczyt w chwili wstawienia i bramka liczb.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelPowrot!26';
const SLEDZONE = ['metabolicSummarySection', 'bmiResult', 'whResult', 'intakeCard'];
// Zgłoszone elementy: sekcja z przyciskami „Podsumowanie wyników” / „Zalecenia dietetyczne” i wyniki karty „Centyle i BMI”.
const ZGLOSZONE = ['metabolicSummarySection', 'bmiResult', 'whResult'];

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
  return start;
}

// Chłopiec 9 lat, 135 cm, 40 kg: wyniki karty „Centyle i BMI” i przyciski z #metabolicSummarySection (tryb profesjonalny).
async function pacjentNaStart(start) {
  await start.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });
  await wpisz(start, { sex: 'M', age: '9', ageMonths: '0', weight: '40', height: '135' });
  await expect(start.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
  await expect(start.locator('#dietRecommendationsBtn')).toBeVisible();
  await expect(start.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });
}

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

// Próbnik w ramce Start: w każdej klatce, w której ramka jest widoczna, zapisuje przezroczystość, transformację
// i położenie śledzonych elementów oraz tekst liczby BMI. Styl obliczony zawiera bieżący efekt animacji CSS.
const wlaczProbnik = (fr) => fr.evaluate((ids) => {
  if (window.__probnik) window.__probnik.stop = true;
  const P = { probki: [], liczby: [], klasa: false, stop: false };
  window.__probnik = P;
  const krok = () => {
    if (P.stop) return;
    const fe = window.frameElement;
    if (!(fe && fe.hidden)) {
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || getComputedStyle(el).display === 'none') return;
        const cs = getComputedStyle(el);
        P.probki.push({ id, op: parseFloat(cs.opacity), tr: cs.transform, top: Math.round(el.getBoundingClientRect().top + window.scrollY) });
      });
      const n = document.querySelector('#bmiResult .result-number');
      if (n) P.liczby.push(n.textContent);
      if (document.documentElement.classList.contains('vilda-panel-powrot')) P.klasa = true;
    }
    requestAnimationFrame(krok);
  };
  requestAnimationFrame(krok);
}, SLEDZONE);

const zatrzymajProbnik = (fr) => fr.evaluate(() => { const P = window.__probnik; P.stop = true; return P; });

// Nowy #bmiResult odczytany w obserwatorze mutacji — w tym samym zadaniu co przebudowa wyników, zanim minie
// jakakolwiek klatka, więc odczyt nie zależy od obciążenia maszyny. Obserwator powstaje po obserwatorze app.js,
// który nadaje kafelkom `animate-in --pulse`, więc widzi już te klasy. Świeża animacja CSS stoi wtedy w chwili 0:
// zwykła daje opacity 0 (początek wjazdu), w trybie powrotu startuje jako zakończona — opacity 1, nic nie biegnie.
const wlaczStraznikaWstawien = (fr) => fr.evaluate(() => {
  if (window.__wstawienia) window.__wstawienia.mo.disconnect();
  const W = { lista: [], mo: null };
  W.mo = new MutationObserver((zmiany) => {
    zmiany.forEach((z) => z.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      const el = n.id === 'bmiResult' ? n : n.querySelector('#bmiResult');
      if (!el) return;
      const cs = getComputedStyle(el);
      W.lista.push({
        klasa: document.documentElement.classList.contains('vilda-panel-powrot'),
        op: cs.opacity,
        trwajace: el.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName),
      });
    }));
  });
  W.mo.observe(document.getElementById('results'), { childList: true, subtree: true });
  window.__wstawienia = W;
});

const odczytajWstawienia = (fr) => fr.evaluate(() => window.__wstawienia.lista);

const bezRuchu = (tr) => !tr || tr === 'none' || tr === 'matrix(1, 0, 0, 1, 0, 0)';

test('powrót na Start po zmianie panelu: karta „Centyle i BMI” i przyciski podsumowania nie wjeżdżają od nowa, BMI nie odlicza się od zera', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  await pacjentNaStart(start);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  await wlaczStraznikaWstawien(start);
  await wlaczProbnik(start);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  const liczbyWOknie = await start.evaluate(() => window.vildaShouldAnimateNumbers());
  // Odtworzenie sesji i przeliczenie wyników po powrocie trwają kilkadziesiąt–kilkaset ms; patrzymy przez 1,4 s.
  await page.waitForTimeout(1400);
  const P = await zatrzymajProbnik(start);

  for (const id of SLEDZONE) {
    const ruch = P.probki.filter((p) => p.id === id && (p.op < 0.999 || !bezRuchu(p.tr)));
    expect(ruch.slice(0, 3), `${id}: żadna widoczna klatka nie pokazuje wjazdu ani zanikania`).toEqual([]);
  }
  for (const id of ZGLOSZONE) {
    const gory = P.probki.filter((p) => p.id === id).map((p) => p.top);
    expect(gory.length, `${id}: próbki z widocznych klatek`).toBeGreaterThan(0);
    expect(Math.max(...gory) - Math.min(...gory), `${id}: położenie w dokumencie stałe`).toBeLessThanOrEqual(1);
  }
  expect(P.liczby.length).toBeGreaterThan(0);
  expect([...new Set(P.liczby)], 'liczba BMI od pierwszej klatki ma wartość końcową').toEqual(['21,9']);
  expect(P.klasa, 'panel pokazany ponownie jest w trybie powrotu').toBe(true);
  expect(liczbyWOknie, 'w oknie powrotu liczby nie są odliczane').toBe(false);
  for (const w of (await odczytajWstawienia(start)).filter((x) => x.klasa)) {
    expect(w, 'wynik przebudowany w oknie powrotu startuje bez animacji').toEqual({ klasa: true, op: '1', trwajace: [] });
  }

  // Po oknie uspokojenia klasa znika, a zwykła zmiana danych znów animuje wyniki — tryb powrotu niczego nie wyłącza na stałe.
  await start.waitForFunction(() => !document.documentElement.classList.contains('vilda-panel-powrot'), null, { timeout: 5000 });
  expect(await start.evaluate(() => window.vildaShouldAnimateNumbers()), 'po oknie liczby znów są odliczane').toBe(true);
  await wlaczStraznikaWstawien(start);
  await wpisz(start, { weight: '41' });
  await expect(start.locator('#bmiResult .result-number')).toHaveText('22,5', { timeout: 15000 });
  const poOknie = await odczytajWstawienia(start);
  expect(poOknie.length, 'zmiana masy przebudowała wynik').toBeGreaterThan(0);
  for (const w of poOknie) {
    expect(w.klasa, 'po oknie panel nie jest w trybie powrotu').toBe(false);
    expect(w.op, 'nowy wynik po zmianie masy wjeżdża jak dotąd: animacja startuje od opacity 0').toBe('0');
    expect(w.trwajace, 'nowy wynik po zmianie masy ma biegnącą animację wjazdu').toContain('fadeSlideUp');
  }
});

test('zdjęcie klasy trybu powrotu nie wznawia animacji: dłuższa jednorazowa animacja zaczęta w oknie zostaje zakończona', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  await page.evaluate(() => window.VildaShell.navigate('ustawienia'));
  await ramka(page, 'Ustawienia');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  // Element z klasą .animate-in i czasem 5 s (dłuższym niż okno): w oknie startuje jako zakończony. Bez dokończenia
  // animacji przy zdjęciu klasy wróciłoby mu zwykłe opóźnienie 0 s i w połowie animacji znów byłby półprzezroczysty.
  await start.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'e2ePanelPowrotProbka';
    el.className = 'animate-in';
    el.textContent = 'Próbka animacji (test e2e)';
    el.style.animationDuration = '5s';
    // Do body, nie do #results: bez danych pacjenta #results jest ukryty, a w ukrytym poddrzewie animacje nie biegną.
    document.body.appendChild(el);
  });
  expect(await start.evaluate(() => document.documentElement.classList.contains('vilda-panel-powrot'))).toBe(true);
  expect(await start.evaluate(() => getComputedStyle(document.getElementById('e2ePanelPowrotProbka')).opacity)).toBe('1');
  await start.waitForFunction(() => !document.documentElement.classList.contains('vilda-panel-powrot'), null, { timeout: 5000 });
  const stan = await start.evaluate(() => {
    const el = document.getElementById('e2ePanelPowrotProbka');
    const trwajace = el.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName);
    return { opacity: getComputedStyle(el).opacity, trwajace };
  });
  expect(stan, 'po oknie próbka jest w stanie końcowym, bez trwającej animacji').toEqual({ opacity: '1', trwajace: [] });
});
