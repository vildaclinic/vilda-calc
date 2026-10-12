import { expect } from './test-czas.mjs';

// P-PANEL-PRZEWINIECIE (decyzja właściciela 2026-10-12): panel powłoki wraca tam, gdzie go zostawiono.
// Wspólne kroki testów e2e na prawdziwej powłoce app.html — desktop (powloka-przewiniecie-panelu.spec.mjs)
// i telefon (powloka-przewiniecie-panelu-mobile.spec.mjs). Dane wyłącznie FIKCYJNE.
//
// Asercje czekają na warunek, nie na upływ czasu: pełny zestaw idzie na 4 workerach i klatki potrafią
// przychodzić rzadko, więc próbnik zbiera widoczne klatki, aż minie okno powrotu z P-PANEL-POWROT.

export async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && f.contentWindow.document.readyState === 'complete');
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

export async function otworzPowloke(page, haslo) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  return start;
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

// Chłopiec 9 lat, 135 cm, 40 kg, tryb profesjonalny (jak w P-PANEL-POWROT): Start z wynikami ma kilka ekranów.
export async function pacjentNaStart(start) {
  await start.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });
  await wpisz(start, { sex: 'M', age: '9', ageMonths: '0', weight: '40', height: '135' });
  await expect(start.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
  await expect(start.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });
}

// Przejście przez powłokę; czeka, aż widoczna jest wyłącznie ramka trasy docelowej.
export async function przejdz(page, trasa, href) {
  await page.evaluate(([t, h]) => window.VildaShell.navigate(t, true, h), [trasa, href || null]);
  await page.waitForFunction((t) => {
    const tytul = window.VildaShell.routes[t].title;
    const ramki = [...document.querySelectorAll('iframe.app-pane')];
    const cel = ramki.find((x) => x.title === tytul);
    return Boolean(cel && !cel.hidden && ramki.every((x) => x === cel || x.hidden));
  }, trasa, { timeout: 30000 });
}

// Przewija okno ramki natychmiast (html ma scroll-behavior: smooth) i zwraca pozycję po przewinięciu.
export async function przewin(fr, y) {
  const wynik = await fr.evaluate((cel) => {
    window.scrollTo({ top: cel, behavior: 'instant' });
    return window.scrollY;
  }, y);
  await fr.waitForFunction((v) => window.scrollY === v, wynik);
  return wynik;
}

export const najdalej = (fr) => fr.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);

// Widok, który użytkownik zostawia: elementy w całości widoczne w oknie ramki (liście drzewa, bez trwającej animacji)
// i ich położenie w oknie. Pomija elementy przyklejone (fixed/sticky, także przez przodka) — stoją w oknie niezależnie
// od przewinięcia. Zapamiętany w ramce przed wyjściem z panelu.
export const zapamietajWidok = (fr) => fr.evaluate(() => {
  const wys = window.innerHeight;
  const przyklejony = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };
  const ref = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length || (el.getAnimations && el.getAnimations().length)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 8 || r.top < 0 || r.bottom > wys || przyklejony(el)) continue;
    ref.push({ el, top: r.top });
    if (ref.length >= 40) break;
  }
  window.__przewWidok = { y: window.scrollY, ref };
  return ref.length;
});

// Próbnik w ramce: w każdej klatce, w której ramka jest widoczna, zapisuje przewinięcie okna i największe przesunięcie
// zapamiętanych elementów w oknie (pomija te, które przebudowa wyników zastąpiła nowymi), a także to, czy panel jest
// jeszcze w trybie powrotu (klasa vilda-panel-powrot, 2 s). Włączony przed pokazaniem panelu łapie pierwszą widoczną
// klatkę; klatki ukrytej ramki pomija.
export const wlaczProbnik = (fr) => fr.evaluate(() => {
  if (window.__przewProbnik) window.__przewProbnik.stop = true;
  const P = { y: [], przesuniecie: [], elementy: [], powrot: [], stop: false };
  window.__przewProbnik = P;
  const krok = () => {
    if (P.stop) return;
    const fe = window.frameElement;
    if (!(fe && fe.hidden)) {
      P.y.push(window.scrollY);
      const zywe = window.__przewWidok.ref.filter((x) => x.el.isConnected);
      P.elementy.push(zywe.length);
      P.przesuniecie.push(Math.max(0, ...zywe.map((x) => Math.abs(x.el.getBoundingClientRect().top - x.top))));
      P.powrot.push(document.documentElement.classList.contains('vilda-panel-powrot'));
    }
    requestAnimationFrame(krok);
  };
  requestAnimationFrame(krok);
});

// Czeka, aż minie okno powrotu (w nim powłoka odtwarza sesję i przebudowuje wyniki), i zwraca próbki.
export async function zbierzProbki(fr) {
  await fr.waitForFunction(() => {
    const P = window.__przewProbnik;
    return P.y.length >= 3 && P.powrot.filter((x) => !x).length >= 3;
  }, null, { timeout: 30000 });
  return fr.evaluate(() => { const P = window.__przewProbnik; P.stop = true; return P; });
}

// Każda widoczna klatka, od pierwszej, pokazuje zostawiony widok: zapamiętane elementy stoją w oknie tam, gdzie
// stały. Samo scrollY może na chwilę odbiegać — gdy przebudowa wyników nad oknem skraca dokument, przeglądarka
// przesuwa przewinięcie razem z treścią (zakotwiczenie przewinięcia) — ale po oknie powrotu wraca do zapamiętanego.
export function sprawdzKlatki(P, y, opis) {
  expect(P.y.length, `${opis}: próbki z widocznych klatek`).toBeGreaterThan(0);
  expect(Math.min(...P.elementy), `${opis}: w każdej klatce zostaje element odniesienia`).toBeGreaterThan(0);
  const skoki = P.przesuniecie.map((v, i) => ({ klatka: i, px: Math.round(v), scrollY: P.y[i] })).filter((x) => x.px > 1);
  expect(skoki.slice(0, 3), `${opis}: zostawiony widok stoi w miejscu w każdej widocznej klatce, od pierwszej`).toEqual([]);
  const koniec = P.y[P.y.length - 1];
  expect(Math.abs(koniec - y), `${opis}: po oknie powrotu przewinięcie jest zapamiętane (${koniec} wobec ${y})`).toBeLessThanOrEqual(1);
}

// Start → DocPro → Start dla zapamiętanej pozycji: kontrola, że ukrycie zeruje przewinięcie ramki, i sprawdzenie
// każdej widocznej klatki po powrocie. DocPro po drodze zapisuje sesję, więc Start po powrocie ją odtwarza
// i przebudowuje wyniki (Gp_p) — dokładnie w oknie, w którym próbnik patrzy.
export async function powrotNaStart(page, start, y, opis) {
  const zapamietane = await przewin(start, y);
  await zapamietajWidok(start);
  await przejdz(page, 'docpro');
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30000 });
  expect(await start.evaluate(() => window.scrollY), `${opis}: ukryta ramka ma wyzerowane przewinięcie (display:none)`).toBe(0);
  await wlaczProbnik(start);
  await przejdz(page, 'start');
  const P = await zbierzProbki(start);
  sprawdzKlatki(P, zapamietane, opis);
  await expect(page.locator('#appShellScrollTop'), `${opis}: przycisk „na górę” powłoki widzi odtworzoną pozycję`).toHaveClass(/is-visible/);
  return zapamietane;
}
