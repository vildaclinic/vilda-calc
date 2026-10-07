import { expect, test } from '../support/test-czas.mjs';

// P-GH-PUNKTY-API rata 1: moduł VildaGhPunkty (vilda_gh_punkty.js) na prawdziwych stronach. Na Start nikt go nie woła
// (od raty 2 korzysta z niego monitor GH w DocPro) — test wywołuje go sam, jak zrobi to przyszła ścieżka na Start,
// i sprawdza, że zapis przez API daje te same skutki co zapis listy L() monitora GH:
// A — index.html (Start, bez monitora GH): pamięć modułu GH_THERAPY_POINTS, dokładnie jedno zdarzenie
//     vilda:therapy-points-changed, jeden komunikat {type:'update', tabId} na kanale gh-therapy-sync; echo
//     odbiera odbiornik app.js w tym samym dokumencie (filtr tabId) i woła mostek karty zaawansowanej, który
//     buduje (a po zmianie punktu przebudowuje w miejscu) wiersz .measure-row[data-gh-id] w #advMeasurements.
//     Punkt bieżącej wizyty (wiek, wzrost i masa z formularza) wiersza nie dostaje — mostek go pomija.
// B — powłoka app.html: punkt zapisany przez API w ramce Start widzi DocPro (monitor GH) po przejściu do panelu.
// C — index.html i docpro.html z załadowanym modułem: bez błędów konsoli i bez pageerror.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhPunktyApiStart!26';
const PO_PRZEJSCIU_MS = 2600; // panel docelowy powłoki odtwarza wspólny stan i sesję główną po przełączeniu
// Okno kontrolne po spełnieniu warunku: echo kanału przychodzi kilkadziesiąt ms po zapisie; tu sprawdzamy już
// tylko, że nic więcej nie dochodzi.
const OKNO_KONTROLNE_MS = 1000;

// Bieżąca wizyta w formularzu Start i punkt historyczny (wejście jak z pól formularza punktu wstecznego).
const BIEZACA = { name: 'Fikcyjny Test Api', age: '9', ageMonths: '6', sex: 'M', height: '133', weight: '30' };
const WEJSCIE_HIST = {
  typ: 'start', lata: '8', miesiace: '0', masa: '25', wzrost: '122', wiekKostny: '',
  podawana: '0.7', preparat: 'Omnitrope 10 mg', program: 'SNP', igf1: '', dniIgf: '',
};
// Oczekiwany rekord (15 kluczy w kolejności monitora); dose = dawka dobowa / masa, doseAbs = mg/d.
const pola = (zmiany = {}) => ({
  type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.7 / 25, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7, ...zmiany,
});
const rekord = (id, p) => ({ id, ...p });

// Komunikaty console.error niezależne od modułu GH i od stanu aplikacji — każdy z powodem (zmierzone w tej racie
// na index.html, docpro.html i w powłoce). pageerror nie ma wyjątków.
const SZUM_KONSOLI = [
  // Ostrzeżenie przeglądarki o dyrektywie CSP w <meta> — każda strona aplikacji, niezależnie od skryptów.
  { powod: 'frame-ancestors w <meta>', pasuje: (tekst) => /'frame-ancestors' is ignored when delivered via a <meta> element/.test(tekst) },
  // Zasoby obcego pochodzenia (Google Fonts, odcięty serwer synchronizacji): wynik zależy od sieci środowiska testu.
  { powod: 'zasób obcego pochodzenia', pasuje: (tekst, adres, strona) => /^Failed to load resource/.test(tekst) && adres.origin !== strona.origin },
  // Powłoka: przeglądarka sama prosi o /favicon.ico, którego serwer testowy nie ma.
  { powod: 'favicon powłoki', pasuje: (tekst, adres) => /^Failed to load resource/.test(tekst) && adres.pathname === '/favicon.ico' },
  // Serwer synchronizacji (sprawdzanie uprawnień PRO po odblokowaniu sejfu): test go odcina (odetnijSerwerSynchronizacji),
  // a treść błędu zależy od środowiska — brak sieci, CORS z adresu testowego (zmierzone w CI) albo CSP ramki
  // przelicznik-jednostek.html, która ładuje vilda_pro_access.js (przez vilda_chrome.js) i nie dopuszcza tego serwera
  // („Refused to connect”, w CI „Connecting to … violates”). Stan sprzed tej zmiany, poza zakresem punktów GH.
  { powod: 'serwer synchronizacji', pasuje: (tekst) => /https:\/\/vilda-sync\./.test(tekst) },
  // DocPro: odtworzenie stanu wysyła programowe „change” do pola trybu profesjonalnego, którego słuchacz woła
  // navigator.vibrate (vilda_professional_module.js); Chrome blokuje to przed pierwszym dotknięciem. Zależy od
  // chwili odtworzenia (zmierzone: 1 na 3 przebiegi), stan sprzed tej zmiany.
  { powod: 'vibrate przed gestem', pasuje: (tekst) => /^Blocked call to navigator\.vibrate because user hasn't tapped/.test(tekst) },
];

// Zapytania do serwera synchronizacji (także z ramek powłoki) kończą się błędem sieci w każdym środowisku: test nie
// zależy od sieci CI i nie odpytuje prawdziwego serwera fikcyjnym kontem.
const odetnijSerwerSynchronizacji = (page) => page.route(/^https:\/\/vilda-sync\./, (route) => route.abort());

// Błędy konsoli i pageerror z adnotacją strony (także z ramek powłoki), bez SZUM_KONSOLI.
function zbierajBledy(page) {
  const bledy = [];
  const strona = () => { try { return new URL(page.url()); } catch (_) { return new URL('about:blank'); } };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const tekst = m.text();
    let adres;
    try { adres = new URL(m.location().url); } catch (_) { adres = strona(); }
    if (SZUM_KONSOLI.some((s) => s.pasuje(tekst, adres, strona()))) return;
    bledy.push(`${strona().pathname} console.error: ${tekst} @ ${m.location().url}`);
  });
  page.on('pageerror', (e) => bledy.push(`${strona().pathname} pageerror: ${e && e.message ? e.message : e}`));
  return bledy;
}

async function zaakceptujRegulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function zaloguj(page) {
  await zaakceptujRegulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

// Start gotowy: moduł API, pamięć, odbiornik app.js z mostkiem; odtworzenie stanu po starcie strony już minęło.
const startGotowy = (cel) => cel.waitForFunction(() => Boolean(window.VildaGhPunkty) && Boolean(window.VildaPersistence)
  && Boolean(window.VildaGhDawka) && typeof window.importTherapyPointsToAdvancedGrowth === 'function'
  && typeof window.applyLoadedData === 'function', null, { timeout: 60000 });

const wpisz = (cel, p) => cel.evaluate((wartosci) => {
  Object.keys(wartosci).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = wartosci[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, p);

// Słuchacze w stronie: zdarzenia E (z source), drugi obiekt kanału (nadawca nie słyszy samego siebie, inne
// obiekty tego samego dokumentu — tak) i licznik wywołań mostka karty zaawansowanej.
const sluchaj = (cel) => cel.evaluate(() => {
  window.__E = [];
  window.__kanal = [];
  window.__mostek = 0;
  document.addEventListener('vilda:therapy-points-changed', (e) => { window.__E.push(e.detail && e.detail.source); });
  new BroadcastChannel('gh-therapy-sync').addEventListener('message', (m) => { window.__kanal.push(m.data); });
  const mostek = window.importTherapyPointsToAdvancedGrowth;
  window.importTherapyPointsToAdvancedGrowth = function () { window.__mostek += 1; return mostek.apply(this, arguments); };
});

// Wywołanie API dokładnie tak, jak zrobi to wołający: pola z dawki podawanej → punkt(noweId()) → zapisz(lista).
const zapiszNowyPunkt = (cel, wejscie) => cel.evaluate((we) => {
  const A = window.VildaGhPunkty;
  const r = A.polaZPodawanej(we, 'wsteczny');
  if (!r.ok) return { r };
  const id = A.noweId();
  const lista = A.wczytaj();
  lista.push(A.punkt(id, r.pola));
  const wynik = A.zapisz(lista);
  return { r, id, wynik, eSynchronicznie: window.__E.length };
}, wejscie);

const modul = (cel) => cel.evaluate(() => JSON.stringify(window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', [])));
const okno = (cel) => cel.evaluate(() => JSON.stringify(window.ghTherapyPoints));

// Wiersze GH karty zaawansowanej: id, znacznik synchronizacji, wartości i blokada pól wieku.
const wierszeGh = (cel) => cel.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row[data-gh-id]'))
  .map((w) => {
    const v = (s) => { const e = w.querySelector(s); return e ? e.value : null; };
    const zablokowane = ['.adv-age-years', '.adv-age-months'].every((s) => { const e = w.querySelector(s); return Boolean(e && e.disabled); });
    return {
      id: w.getAttribute('data-gh-id'), sync: w.getAttribute('data-gh-sync'),
      lata: v('.adv-age-years'), mies: v('.adv-age-months'), wzrost: v('.adv-height'), masa: v('.adv-weight'),
      kostny: v('.adv-bone-age'), wiekZablokowany: zablokowane,
    };
  }));

test('A: Start bez monitora — zapis przez API: moduł, 1 zdarzenie, 1 komunikat z tabId, echo buduje i przebudowuje wiersz karty zaawansowanej', async ({ page }) => {
  test.setTimeout(150_000);
  await odetnijSerwerSynchronizacji(page);
  const bledy = zbierajBledy(page);
  await zaloguj(page);
  await startGotowy(page);
  await page.waitForTimeout(2500); // odtworzenie stanu Start biegnie do ~1,5 s po starcie strony
  await wpisz(page, BIEZACA);
  await page.waitForTimeout(1500);

  // Moduł jest, monitora GH na Start nie ma (odbiornik app.js nie ma czego odświeżyć poza mostkiem).
  expect(await page.evaluate(() => ({
    wersja: window.VildaGhPunkty.wersja,
    zamrozony: Object.isFrozen(window.VildaGhPunkty),
    gotowe: window.VildaGhPunkty.gotowe({ dawka: true }),
    monitor: typeof window.refreshGHTherapyMonitor,
    dodajPunkt: typeof window.ghAddTherapyPoint,
  }))).toEqual({
    wersja: 1, zamrozony: true, gotowe: { ok: true, braki: [], kanal: true, tabId: true },
    monitor: 'undefined', dodajPunkt: 'undefined',
  });
  const tab = await page.evaluate(() => window.VildaPersistence.getTabId());
  expect(typeof tab).toBe('string');
  expect(tab).not.toBe('');
  expect(await page.evaluate(() => window.VildaGhPunkty.wczytaj())).toEqual([]);
  expect(await wierszeGh(page)).toEqual([]);

  await sluchaj(page);
  const z1 = await zapiszNowyPunkt(page, WEJSCIE_HIST);
  expect(z1.r).toEqual({ ok: true, bezModuluDawki: false, pola: pola() });
  expect(z1.wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
  expect(z1.eSynchronicznie, 'zdarzenie idzie synchronicznie w zapisz()').toBe(1);
  const { id } = z1;
  expect(id).toMatch(/^\d+(\.\d+)?$/);

  // Echo: odbiornik app.js (filtr tabId) woła mostek, a ten buduje wiersz punktu historycznego.
  await expect.poll(() => wierszeGh(page), { message: 'wiersz punktu w #advMeasurements' }).toEqual([{
    id, sync: 'true', lata: '8', mies: '0', wzrost: '122', masa: '25', kostny: '', wiekZablokowany: true,
  }]);
  await page.waitForTimeout(OKNO_KONTROLNE_MS);
  const oczekiwane1 = JSON.stringify([rekord(id, pola())]);
  expect(await modul(page)).toBe(oczekiwane1);
  expect(await okno(page)).toBe(oczekiwane1);
  expect(await page.evaluate(() => window.__E.slice()), 'dokładnie jedno zdarzenie').toEqual(['gh']);
  expect(await page.evaluate(() => window.__kanal.slice()), 'jeden komunikat z tabId tej karty').toEqual([{ type: 'update', tabId: tab }]);
  expect(await page.evaluate(() => window.__mostek), 'echo dotarło do mostka').toBeGreaterThan(0);

  // Zmiana punktu w miejscu (zmienWMiejscu + zapisz): mostek przebudowuje TEN SAM element wiersza.
  await page.evaluate((i) => {
    document.querySelector(`#advMeasurements .measure-row[data-gh-id="${i}"]`).__znacznikE2e = 'ten-sam';
    window.__E.length = 0;
    window.__kanal.length = 0;
    window.__mostek = 0;
  }, id);
  const z2 = await page.evaluate(({ i, we }) => {
    const A = window.VildaGhPunkty;
    const r = A.polaZPodawanej(we, 'karta');
    const lista = A.wczytaj();
    const zmiana = A.zmienWMiejscu(lista, i, r.pola);
    return { zmiana, wynik: A.zapisz(lista), dlugosc: lista.length };
  }, { i: id, we: { ...WEJSCIE_HIST, masa: '25.4', wzrost: '122.5' } });
  expect(z2).toEqual({ zmiana: { ok: true, indeks: 0 }, wynik: { modul: true, zdarzenie: true, kanal: true }, dlugosc: 1 });
  await expect.poll(() => wierszeGh(page), { message: 'wiersz po zmianie punktu' }).toEqual([{
    id, sync: 'true', lata: '8', mies: '0', wzrost: '122.5', masa: '25.4', kostny: '', wiekZablokowany: true,
  }]);
  await page.waitForTimeout(OKNO_KONTROLNE_MS);
  expect(await page.evaluate((i) => document.querySelector(`#advMeasurements .measure-row[data-gh-id="${i}"]`).__znacznikE2e, id))
    .toBe('ten-sam');
  const oczekiwane2 = JSON.stringify([rekord(id, pola({ weight: 25.4, height: 122.5, dose: 0.7 / 25.4 }))]);
  expect(await modul(page)).toBe(oczekiwane2);
  expect(await page.evaluate(() => window.__E.slice())).toEqual(['gh']);
  expect(await page.evaluate(() => window.__kanal.slice())).toEqual([{ type: 'update', tabId: tab }]);
  expect(await page.evaluate(() => window.__mostek)).toBeGreaterThan(0);

  // Punkt bieżącej wizyty (ten sam wiek, wzrost i masa co formularz): mostek nie dubluje bieżącego pomiaru.
  await page.evaluate(() => { window.__E.length = 0; window.__kanal.length = 0; });
  const z3 = await zapiszNowyPunkt(page, {
    ...WEJSCIE_HIST, typ: 'continue', lata: '9', miesiace: '6', masa: '30', wzrost: '133', podawana: '0.9',
  });
  expect(z3.wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
  await expect.poll(() => page.evaluate(() => window.__kanal.length)).toBe(1);
  await page.waitForTimeout(OKNO_KONTROLNE_MS);
  expect(JSON.parse(await modul(page)).map((p) => p.id)).toEqual([id, z3.id]);
  expect((await wierszeGh(page)).map((w) => w.id), 'bez wiersza punktu bieżącej wizyty').toEqual([id]);
  expect(await page.evaluate(() => window.__E.slice())).toEqual(['gh']);

  expect(bledy, `błędy strony:\n${bledy.join('\n')}`).toEqual([]);
});

// --- Powłoka app.html -------------------------------------------------------------------------------------------

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

test('B: powłoka — punkt zapisany przez API w ramce Start widzi DocPro (monitor GH) po przejściu do panelu', async ({ page }) => {
  test.setTimeout(150_000);
  await odetnijSerwerSynchronizacji(page);
  const bledy = zbierajBledy(page);
  await zaakceptujRegulamin(page);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.waitForFunction(() => Boolean(window.VildaVault));
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await startGotowy(start);
  await page.waitForTimeout(1500);
  await wpisz(start, BIEZACA);
  await page.waitForTimeout(1500);

  await sluchaj(start);
  const z = await zapiszNowyPunkt(start, WEJSCIE_HIST);
  expect(z.wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
  const oczekiwane = JSON.stringify([rekord(z.id, pola())]);
  await expect.poll(() => wierszeGh(start).then((w) => w.map((x) => x.id)), { message: 'echo na Start' }).toEqual([z.id]);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(PO_PRZEJSCIU_MS);

  // Monitor DocPro: lista okna i pamięć modułu karty mają punkt w kształcie z API (15 kluczy, ta sama kolejność).
  await expect.poll(() => okno(docpro), { message: 'window.ghTherapyPoints w DocPro' }).toBe(oczekiwane);
  expect(await modul(docpro)).toBe(oczekiwane);
  // Tabela monitora pokazuje wiersz punktu (karta GH/IGF-1 siedzi na DocPro w sekcji modułów).
  await docpro.evaluate(() => { window.vildaGhIgfPersistApi.ensureMounted(); window.ghActivateTab('mon'); });
  await expect(docpro.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(1);
  await expect(docpro.locator(`#ghTherapyTbody .edit-gh-pt-btn[data-id="${z.id}"]`)).toHaveCount(1);
  expect(await docpro.evaluate(() => document.getElementById('ghTherapyTbody').textContent)).toContain('Omnitrope 10 mg');

  expect(bledy, `błędy strony:\n${bledy.join('\n')}`).toEqual([]);
});

test('C: index.html i docpro.html z załadowanym VildaGhPunkty — bez błędów konsoli i pageerror', async ({ page }) => {
  test.setTimeout(150_000);
  await odetnijSerwerSynchronizacji(page);
  const bledy = zbierajBledy(page);
  // Żaden komunikat konsoli (dowolnego typu, także ostrzeżenie) nie dotyczy modułu.
  const oModule = [];
  page.on('console', (m) => {
    if (/vilda_gh_punkty|VildaGhPunkty/.test(`${m.text()} ${m.location().url}`)) oModule.push(`${m.type()}: ${m.text()}`);
  });
  await zaloguj(page); // index.html przed założeniem konta i po odblokowaniu sejfu
  await startGotowy(page);
  await page.waitForTimeout(2500);
  const zaladowany = (cel) => cel.evaluate(() => ({
    wersja: window.VildaGhPunkty && window.VildaGhPunkty.wersja,
    skrypt: Array.from(document.scripts).map((s) => s.getAttribute('src')).filter((s) => /vilda_gh_punkty\.js/.test(String(s))),
    gotowe: window.VildaGhPunkty.gotowe({ dawka: true }).ok,
  }));
  expect(await zaladowany(page)).toEqual({ wersja: 1, skrypt: ['vilda_gh_punkty.js?v=2'], gotowe: true });

  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.VildaGhPunkty),
    null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  expect(await zaladowany(page)).toEqual({ wersja: 1, skrypt: ['vilda_gh_punkty.js?v=2'], gotowe: true });

  expect(bledy, `błędy stron:\n${bledy.join('\n')}`).toEqual([]);
  expect(oModule, `komunikaty konsoli o module:\n${oModule.join('\n')}`).toEqual([]);
});
