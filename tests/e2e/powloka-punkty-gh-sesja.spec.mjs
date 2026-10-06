import { expect, test } from '../support/test-czas.mjs';

// P-GH-SESJA-LISTA: punkty terapii GH w powłoce app.html nie giną przy przełączaniu paneli. Sesja główna na stronach
// bez tabeli spożycia (DocPro, klirens) bierze listę punktów GH z pamięci modułu karty, gdy klucz istnieje. Te testy
// pilnują, żeby ta reguła niczego nie gubiła (warunek scalenia z projektu „Wspólne API punktów GH”, decyzja D2):
// A — punkt dodany prawdziwym monitorem w DocPro przeżywa przejścia Start ↔ DocPro bez „Zapisz”;
// B — wizyta w panelu bez monitora (Kalkulator klirensu) nie kasuje listy;
// C — punkt dodany, gdy mostek na Start jest chwilowo wstrzymany, przeżywa przejścia.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PowlokaPunktyGh!26';
const PO_PRZEJSCIU_MS = 2600; // panel docelowy odtwarza wspólny stan i sesję główną po przełączeniu

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const TYTULY = { start: 'Start', docpro: 'DocPro', klirens: 'Kalkulator klirensu' };
async function przejdz(page, cel) {
  await page.evaluate((p) => window.VildaShell.navigate(p), cel);
  const fr = await ramka(page, TYTULY[cel]);
  await page.waitForTimeout(PO_PRZEJSCIU_MS);
  return fr;
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

// Identyfikatory punktów GH w każdej kopii ramki: lista okna, pamięć modułu i sesja główna karty.
const kopie = (fr) => fr.evaluate(() => {
  const ids = (a) => (Array.isArray(a) ? a.map((p) => p && p.id) : null);
  const P = window.VildaPersistence;
  const s = P.readMainSession();
  return { okno: ids(window.ghTherapyPoints), modul: ids(P.readModuleJSON('GH_THERAPY_POINTS', null)), sesja: s ? ids(s.ghTherapyPoints) : null };
});

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.waitForFunction(() => Boolean(window.VildaVault));
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForTimeout(1500);
  await wpisz(start, { name: 'Fikcyjna Ewa', age: '13', ageMonths: '0', sex: 'F', height: '146.2', weight: '44' });
  await page.waitForTimeout(1500);
  return start;
}

// Nowy punkt „Włączenie leczenia” z bieżącej wizyty — prawdziwy monitor GH w DocPro (karta, program, preparat).
async function dodajPunktWDocPro(docpro) {
  await docpro.waitForFunction(() => typeof window.ghAddTherapyPoint === 'function' && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 30000 });
  await docpro.evaluate(() => { window.vildaGhIgfPersistApi.ensureMounted(); });
  await wpisz(docpro, { therProg: 'SNP', therDrug: 'Omnitrope 10 mg' });
  const przed = await docpro.evaluate(() => (window.ghTherapyPoints || []).length);
  await docpro.evaluate(() => window.ghAddTherapyPoint('start'));
  await expect.poll(() => docpro.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(przed + 1);
  return docpro.evaluate(() => String(window.ghTherapyPoints[window.ghTherapyPoints.length - 1].id));
}

async function oczekujWszedzie(fr, id, opis) {
  await expect.poll(() => kopie(fr), { message: opis, timeout: 10000 }).toEqual({ okno: [id], modul: [id], sesja: [id] });
}

test('A: punkt dodany w DocPro przeżywa przejścia Start ↔ DocPro bez „Zapisz”', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzPowloke(page);
  let docpro = await przejdz(page, 'docpro');
  const id = await dodajPunktWDocPro(docpro);
  await oczekujWszedzie(docpro, id, 'DocPro po dodaniu');

  const start = await przejdz(page, 'start');
  await oczekujWszedzie(start, id, 'Start po przejściu');
  docpro = await przejdz(page, 'docpro');
  await oczekujWszedzie(docpro, id, 'DocPro po powrocie');
  await przejdz(page, 'start');
  await oczekujWszedzie(start, id, 'Start po drugim przejściu');
});

test('B: wizyta w panelu bez monitora (Kalkulator klirensu) nie kasuje listy punktów GH', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzPowloke(page);
  let docpro = await przejdz(page, 'docpro');
  const id = await dodajPunktWDocPro(docpro);
  await oczekujWszedzie(docpro, id, 'DocPro po dodaniu');

  const klirens = await przejdz(page, 'klirens');
  await expect.poll(() => klirens.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null)), { message: 'moduł w Klirensie' })
    .toEqual([expect.objectContaining({ id })]);
  // Klirens zapisuje własną sesję główną (jak przy wpisaniu danych), zanim wrócimy do innych paneli.
  await klirens.evaluate(() => window.vildaSession && window.vildaSession.saveNow({ force: true }));
  docpro = await przejdz(page, 'docpro');
  await oczekujWszedzie(docpro, id, 'DocPro po Klirensie');
  const start = await przejdz(page, 'start');
  await oczekujWszedzie(start, id, 'Start po Klirensie');
});

test('C: punkt dodany, gdy mostek na Start jest wstrzymany, przeżywa przejścia', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  let docpro = await przejdz(page, 'docpro');
  await start.evaluate(() => { window.__vildaSuppressGhAdvancedImportUntil = Date.now() + 2500; });
  const id = await dodajPunktWDocPro(docpro);
  await oczekujWszedzie(docpro, id, 'DocPro po dodaniu');

  await przejdz(page, 'start');
  await oczekujWszedzie(start, id, 'Start po przejściu');
  docpro = await przejdz(page, 'docpro');
  await oczekujWszedzie(docpro, id, 'DocPro po powrocie');
});
