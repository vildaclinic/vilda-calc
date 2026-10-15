import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu, teksty } from '../support/atrapa-dom-lekka.mjs';

// LAB-HISTORIA PR3: pasek „Poprzednie wyniki pacjenta” (lab_history_strip.js) w przeliczniku jednostek —
// produkcyjny moduł z autostartem na atrapie strony, z prawdziwym modelem (vilda_lab_history.js), prawdziwym
// konwerterem i prawdziwym parserem normy wpisu (Dl z vilda_auth_ui.js). Sejf, sesja i powłoka są atrapami.
// Dane wyłącznie FIKCYJNE. Zegar: 17.06.2026 (tylko Date; timery prawdziwe).
const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const between = (from, to) => auth.slice(auth.indexOf(from), auth.indexOf(to, auth.indexOf(from)));
const Dl = new Function(`${between('function Dl(', 'function Ol(')};return Dl;`)();

const PID = 'fikcyjny-pacjent-a';
const PID_B = 'fikcyjny-pacjent-b';
const nota = (pid, id, date, lab, extra = {}) => ({ id, patientId: pid, title: `Fikcyjny ${id}`, body: '', category: 'wynik-badania', clinicalDateISO: date, labResult: lab, ...extra });
const punkt = (note, extra = {}) => ({ noteId: note.id, dateISO: note.clinicalDateISO, valueNum: note.labResult.valueNum, unit: note.labResult.unit, ...extra });
const tsh = (pid, id, date, value, unit, extra = {}, lab = {}) => nota(pid, id, date,
  { test: 'TSH (tyreotropina)', testKey: 'tsh', value: String(value).replace('.', ','), valueNum: value, unit, ...lab }, extra);

function daneA() {
  const notes = [
    tsh(PID, 'tsh-1', '2025-11-05', 0.01, 'μIU/mL', {}, { norm: '0,27–4,2 μIU/mL' }),
    tsh(PID, 'tsh-2', '2026-01-14', 0.01, 'mIU/L', { body: 'rozpoznanie' }, { norm: '0,27–4,2 mIU/L' }),
    tsh(PID, 'tsh-3', '2026-02-25', 0.02, 'mIU/L', { body: '= 0,02 mIU/L\nredukcja do 20 mg\nNorma: 0,27–4,2 mIU/L', linkedAgeMonths: 143 }, { norm: '0,27–4,2 mIU/L' }),
    tsh(PID, 'tsh-4', '2026-03-18', 0.04, 'μIU/mL', {}, { norm: '0,27–4,2 μIU/mL' }),
    tsh(PID, 'tsh-5', '2026-04-08', 0.05, 'mIU/L', {}, { norm: '0,27–4,2 mIU/L' }),
    tsh(PID, 'tsh-6', '2026-06-02', 0.12, 'mIU/L', { body: 'kontrola po redukcji' }, { norm: '0,27–4,2 mIU/L' }),
    nota(PID, 'tsh-7', '2026-05-12', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '<0,01 mIU/L', unit: 'mIU/L' }),
  ];
  const series = [{ testKey: 'tsh', test: 'TSH (tyreotropina)', points: notes.filter((n) => n.labResult.valueNum != null).map((n) => punkt(n, n.linkedAgeMonths ? { ageMonths: n.linkedAgeMonths } : {})) }];
  return { notes, series, patient: { patientId: PID, header: { name: 'Fikcyjna Anna' } } };
}
function daneB() {
  const notes = [tsh(PID_B, 'b-tsh-1', '2026-05-20', 3.1, 'mIU/L')];
  return { notes, series: [{ testKey: 'tsh', test: 'TSH (tyreotropina)', points: notes.map((n) => punkt(n)) }], patient: { patientId: PID_B, header: { name: 'Fikcyjny Bartek' } } };
}

function sejf(opcje = {}) {
  const pacjenci = { [PID]: daneA(), [PID_B]: daneB() };
  const nasluchy = [], blokady = [];
  const vault = {
    odczyty: 0, odblokowany: true,
    isUnlocked: () => vault.odblokowany,
    listPatientLabSeries: async (pid) => {
      vault.odczyty += 1;
      if (opcje.opoznienie) await opcje.opoznienie(pid, vault.odczyty);
      return structuredClone(pacjenci[pid] ? pacjenci[pid].series : []);
    },
    listPatientNotesForPatient: async (pid) => structuredClone(pacjenci[pid] ? pacjenci[pid].notes : []),
    getPatient: async (pid) => structuredClone(pacjenci[pid] ? pacjenci[pid].patient : null),
    getPatientNote: async (id) => structuredClone(Object.values(pacjenci).flatMap((p) => p.notes).find((n) => n.id === id) || null),
    onPatientNoteChanged: (fn) => nasluchy.push(fn),
    onLock: (fn) => blokady.push(fn),
    dodaj: (pid, note) => { pacjenci[pid].notes.push(note); if (note.labResult.valueNum != null) pacjenci[pid].series[0].points.push(punkt(note)); },
    zmiana: (zdarzenie) => nasluchy.forEach((fn) => fn(zdarzenie)),
    zablokuj: () => { vault.odblokowany = false; blokady.forEach((fn) => fn()); },
  };
  return vault;
}

function pole(doc, parent, tag, id, wartosc = '') {
  const el = parent.appendChild(doc.createElement(tag));
  el.id = id;
  el.value = wartosc;
  return el;
}

function strona(opcje = {}) {
  const doc = atrapaDokumentu();
  const karta = doc.body.appendChild(doc.createElement('div'));
  const pola = {
    substancja: pole(doc, karta, 'input', 'labSubstance', 'TSH (tyreotropina)'),
    wartosc: pole(doc, karta, 'input', 'labValue', opcje.wartosc ?? '0,38'),
    jednostka: pole(doc, karta, 'select', 'labUnit', opcje.jednostka ?? 'mIU/L'),
  };
  const sekcja = pole(doc, karta, 'div', 'labResultSection');
  sekcja.className = opcje.wartosc === '' ? 'lab-result-section is-empty' : 'lab-result-section';
  pole(doc, sekcja, 'div', 'labResultBig');
  const amh = pole(doc, karta, 'div', 'labAmhAgeReference');
  const pamiec = new Map([['vildaCurrentPatientId', opcje.pid === undefined ? PID : opcje.pid]].filter(([, v]) => v));
  const okno = new Map();
  const stan = { substancja: opcje.substancja === undefined ? 'tsh' : opcje.substancja, pacjent: opcje.bezPacjenta ? null : { name: 'Fikcyjna Anna' } };
  const win = {
    document: doc, setTimeout, clearTimeout,
    sessionStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)) },
    addEventListener: (typ, fn) => { if (!okno.has(typ)) okno.set(typ, []); okno.get(typ).push(fn); },
    zdarzenie: (typ, dane = {}) => (okno.get(typ) || []).forEach((fn) => fn({ type: typ, ...dane })),
    VildaSession: { getPatient: () => stan.pacjent, ensureAuthLoaded: vi.fn(async () => true) },
    VildaVault: opcje.vault || sejf(),
    VildaLabConverterRuntime: { getSubstanceId: () => stan.substancja },
    __vildaLabTrend: { parseNorm: Dl },
  };
  win.parent = win;
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js', 'lab_history_strip.js']) loadBrowserScript(plik, win);
  return { doc, win, pola, sekcja, amh, karta, pamiec, stan };
}

const pasek = (env) => env.doc.getElementById('labHistoryStrip');
const txt = (el) => (el ? el.textContent.replace(/\u00a0/g, ' ') : null);
const widoczny = (env) => vi.waitFor(() => {
  const el = pasek(env);
  expect(el && el.classList.contains('is-on')).toBe(true);
  expect(el.querySelector('.lab-strip-title')).not.toBeNull();
}, { timeout: 2000 });
const ukryty = (env) => vi.waitFor(() => {
  const el = pasek(env);
  expect(!el || !el.classList.contains('is-on')).toBe(true);
  if (el) expect(el.children.length).toBe(0);
}, { timeout: 2000 });
const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
const txtS = (s) => s.replace(/\u00a0/g, ' ');
const odswiez = (env) => { env.win.VildaLabHistoryStrip.refresh(); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 17, 12));
});
afterEach(() => { vi.useRealTimers(); });

describe('pasek „Poprzednie wyniki”: zawartość z zapisu', () => {
  it('nagłówek, pozycja za sekcją wyniku, 5 ostatnich chipów, strzałka tylko z normy wpisu, chip przeliczony bez strzałki', async () => {
    const env = strona();
    await widoczny(env);
    const el = pasek(env);
    // Za sekcją wyniku (i za wierszem przypięcia, gdy jest), przed sekcjami hormonów.
    expect(env.karta.children.indexOf(el)).toBe(env.karta.children.indexOf(env.sekcja) + 1);
    expect(env.karta.children.indexOf(env.amh)).toBe(env.karta.children.indexOf(el) + 1);
    expect(el.getAttribute('aria-label')).toBe('Poprzednie wyniki pacjenta: TSH');
    expect(txt(el.querySelector('.lab-strip-title'))).toBe('Poprzednie wyniki pacjenta · TSH · w mIU/L');
    expect(txt(el.querySelector('.lab-strip-sub'))).toBe('Fikcyjna Anna · 7 wyników · ostatni 02.06.26');
    expect(teksty(el, 'button.lab-strip-link')).toEqual(['Badania w karcie →']);
    expect(teksty(el, '.lab-strip-more')).toEqual(['+2 wcześniejsze']);
    const chipy = el.querySelectorAll('button.lab-strip-chip[data-note-id]');
    expect(chipy.map((c) => c.getAttribute('data-note-id'))).toEqual(['tsh-3', 'tsh-4', 'tsh-5', 'tsh-7', 'tsh-6']);
    expect(chipy.map((c) => txt(c))).toEqual(['25.02.260,02↓', '18.03.260,04', '08.04.260,05↓', '12.05.26<0,01', '02.06.260,12↓']);
    // Zapis w μIU/mL przeliczony na jednostkę formularza: bez strzałki z normy zapisanej w innej jednostce (K26).
    expect(chipy[1].querySelector('.lab-strip-flag')).toBeNull();
    expect(txtS(chipy[1].getAttribute('title'))).toBe('zapisano: 0,04 μIU/mL · norma z wpisu: 0,27–4,2 μIU/mL');
    expect(chipy[0].querySelector('.lab-strip-flag').getAttribute('aria-label')).toBe('poniżej normy z wpisu');
    expect(txt(el.querySelector('.lab-strip-now'))).toBe('teraz · niezapisany0,38');
    expect(txt(el.querySelector('.lab-strip-diff'))).toBe('ostatni zapisany wynik: 02.06.26 (15 dni temu) · 0,12 mIU/L · teraz 0,38 → różnica +0,26 mIU/L (data bieżącej próbki ustalana przy przypięciu)');
    expect(txt(el.querySelector('.lab-strip-foot'))).toBe('Historia pokazuje zapisane wyniki bez ponownej oceny. Różnica liczona z wartości zapisanych; metoda oznaczenia mogła się różnić.');
    // Rozwinięcie wcześniejszych wyników.
    el.querySelector('.lab-strip-more').click();
    expect(pasek(env).querySelectorAll('button.lab-strip-chip[data-note-id]')).toHaveLength(7);
    expect(teksty(pasek(env), '.lab-strip-more')).toEqual(['zwiń wcześniejsze']);
  });

  it('zmiana jednostki formularza: wszystkie wyniki przeliczone, żadnej strzałki (K26), nagłówek w nowej jednostce', async () => {
    const env = strona({ jednostka: 'μIU/mL' });
    await widoczny(env);
    const el = pasek(env);
    expect(txt(el.querySelector('.lab-strip-title'))).toBe('Poprzednie wyniki pacjenta · TSH · w μIU/mL');
    // tsh-4 zapisany w μIU/mL nie jest przeliczany, więc jego norma wpisu daje strzałkę; reszta przeliczona — bez.
    const flagi = el.querySelectorAll('button.lab-strip-chip[data-note-id]').map((c) => [c.getAttribute('data-note-id'), !!c.querySelector('.lab-strip-flag')]);
    expect(flagi).toEqual([['tsh-3', false], ['tsh-4', true], ['tsh-5', false], ['tsh-7', false], ['tsh-6', false]]);
    env.pola.jednostka.value = 'mU/L';
    odswiez(env);
    await vi.waitFor(() => expect(txt(pasek(env).querySelector('.lab-strip-title'))).toBe('Poprzednie wyniki pacjenta · TSH · w mU/L'));
    expect(pasek(env).querySelectorAll('.lab-strip-flag')).toHaveLength(0);
  });

  it('klik chipa: szczegóły z datą, wiekiem wizyty, normą wpisu i komentarzem bez linii aplikacji; drugi klik zamyka', async () => {
    const env = strona();
    await widoczny(env);
    pasek(env).querySelector('button.lab-strip-chip[data-note-id="tsh-3"]').click();
    const el = pasek(env);
    expect(el.querySelector('button.lab-strip-chip[data-note-id="tsh-3"]').getAttribute('aria-pressed')).toBe('true');
    expect(txt(el.querySelector('.lab-strip-detail-h'))).toBe('25.02.26 · 0,02 mIU/L↓ · wizyta 11 l 11 m');
    expect(txt(el.querySelector('.lab-strip-detail-norm'))).toBe('poniżej normy z wpisu: 0,27–4,2 mIU/L — zakres laboratorium z dnia badania; metoda oznaczenia mogła być inna');
    expect(txt(el.querySelector('.lab-strip-detail-comment'))).toBe('komentarz: redukcja do 20 mg');
    expect(teksty(el.querySelector('.lab-strip-detail'), 'button.lab-strip-link')).toEqual(['Otwórz w karcie →']);
    // Punkt wybrany w chipach jest wyróżniony na wykresie.
    expect(el.querySelectorAll('g.lab-strip-pt.is-selected').map((g) => g.getAttribute('data-note-id'))).toEqual(['tsh-3']);
    el.querySelector('button.lab-strip-chip[data-note-id="tsh-3"]').click();
    expect(pasek(env).querySelector('.lab-strip-detail')).toBeNull();
  });

  it('wynik przeliczony i wynik z operatorem w szczegółach: „przeliczono z …”, opis bez porównania', async () => {
    const env = strona();
    await widoczny(env);
    pasek(env).querySelector('button.lab-strip-chip[data-note-id="tsh-4"]').click();
    expect(teksty(pasek(env), '.lab-strip-muted').map(txtS)).toContain('przeliczono z 0,04 μIU/mL');
    pasek(env).querySelector('button.lab-strip-chip[data-note-id="tsh-7"]').click();
    expect(teksty(pasek(env), '.lab-strip-muted')).toContain('wynik tekstowy — jak zapisano, bez porównania');
  });

  it('bez wartości w formularzu: bez chipa „teraz”, linia tylko z ostatnim zapisanym wynikiem, wykres bez pasa „teraz”', async () => {
    const env = strona({ wartosc: '' });
    await widoczny(env);
    const el = pasek(env);
    expect(el.querySelector('.lab-strip-now')).toBeNull();
    expect(txt(el.querySelector('.lab-strip-diff'))).toBe('ostatni zapisany wynik: 02.06.26 (15 dni temu) · 0,12 mIU/L');
    expect(el.querySelector('.lab-strip-lane')).toBeNull();
    expect(txt(el.querySelector('.lab-strip-foot'))).toBe('Historia pokazuje zapisane wyniki bez ponownej oceny.');
  });
});

describe('pasek: wykres lekkiego renderera (decyzje 6.21, 6.22)', () => {
  it('wartość przy każdym punkcie bez strzałek, kreski do osi, bieżący wynik w osobnym pasie bez daty, bez pasma norm', async () => {
    const env = strona();
    await widoczny(env);
    const svg = pasek(env).querySelector('svg.lab-strip-svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 660 200');
    // Sześć wyników liczbowych; „<0,01” (tekstowy) poza wykresem, bez zera.
    expect(svg.querySelectorAll('g.lab-strip-pt').map((g) => g.getAttribute('data-note-id'))).toEqual(['tsh-1', 'tsh-2', 'tsh-3', 'tsh-4', 'tsh-5', 'tsh-6']);
    expect(svg.querySelectorAll('circle.lab-strip-dot.is-conv')).toHaveLength(2);
    expect(svg.querySelectorAll('line.lab-strip-drop')).toHaveLength(7);
    const wartosci = teksty(svg, 'text.lab-strip-val');
    expect(wartosci.every((t) => !/[↑↓]/.test(t))).toBe(true);
    expect(wartosci).toContain('0,12');
    expect(wartosci).toContain('0,38');
    expect(teksty(svg, 'text.lab-strip-now-label')).toEqual(['teraz']);
    expect(teksty(svg, 'text.lab-strip-now-sub')).toEqual(['bez daty']);
    expect(svg.querySelectorAll('rect.lab-strip-lane')).toHaveLength(1);
    expect(svg.getAttribute('aria-label')).toMatch(/^Poprzednie wyniki pacjenta, TSH w mIU\/L, bez pasma norm: 05\.11\.25 0,01; .*; bieżący, niezapisany wynik 0,38 w osobnym pasie bez daty$/);
    // Linia łączy tylko zapisane wyniki (sześć punktów); bieżący wynik nie jest z nią połączony.
    expect(svg.querySelector('polyline.lab-strip-line').getAttribute('points').split(' ')).toHaveLength(6);
    expect(teksty(pasek(env), '.lab-strip-chart-note')).toEqual(['Oś: data badania · przy punkcie wartość · bez pasma norm']);
    // Szeroki wykres ma pionowy podpis jednostki; wąski nie (jednostka jest w nagłówku paska).
    expect(teksty(svg, 'text.lab-strip-unit')).toEqual(['mIU/L']);
  });

  it('„Ukryj wykres” zwija wykres, „Pokaż wykres” przywraca; klik punktu otwiera szczegóły', async () => {
    const env = strona();
    await widoczny(env);
    const toggle = pasek(env).querySelector('button.lab-strip-toggle');
    expect(txt(toggle)).toBe('Ukryj wykres ▴');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('labHistoryStripChart');
    toggle.click();
    expect(pasek(env).querySelector('#labHistoryStripChart').hidden).toBe(true);
    expect(pasek(env).querySelector('svg.lab-strip-svg')).toBeNull();
    expect(pasek(env).querySelector('button.lab-strip-toggle').getAttribute('aria-expanded')).toBe('false');
    pasek(env).querySelector('button.lab-strip-toggle').click();
    pasek(env).querySelector('g.lab-strip-pt[data-note-id="tsh-6"]').click();
    expect(txt(pasek(env).querySelector('.lab-strip-detail-h'))).toBe('02.06.26 · 0,12 mIU/L↓');
  });

  it('układ: oś od zera z krokiem 1–2–2,5–5, punkty po dacie, pas „teraz” po prawej', () => {
    const { _internal: w } = loadStrip();
    expect([0.38, 17.8, 2.4, 1, 0.012, 250].map(w.niceStep)).toEqual([0.1, 5, 1, 0.25, 0.005, 100]);
    const punkty = [['2026-04-14', 0.01], ['2026-05-26', 0.02], ['2026-07-07', 0.05], ['2026-09-02', 0.12]].map(([d, v], i) => ({ noteId: `p${i}`, dateISO: d, v }));
    const L = w.chartLayout(punkty, 0.38, 0);
    expect(L.ticks.map((t) => t.value)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(L.ticks[0].y).toBe(L.axisY);
    expect(L.points[0].x).toBe(L.plotLeft);
    expect(L.points[3].x).toBe(L.plotRight);
    expect(L.now.x).toBeGreaterThan(L.now.sepX);
    expect(L.now.sepX).toBeGreaterThan(L.plotRight);
    expect(L.points.every((p, i) => i === 0 || p.y < L.points[i - 1].y)).toBe(true);
    const jeden = w.chartLayout([punkty[0]], null, 0);
    expect(jeden.points[0].x).toBe((jeden.plotLeft + jeden.plotRight) / 2);
    expect(jeden.dateLabels.map((d) => d.index)).toEqual([0]);
  });

  it('telefon (320–390 px): najwyżej trzy daty, prostokąty etykiet bez nakładania; desktop: bez nakładania', () => {
    const { _internal: w } = loadStrip();
    const dni = ['2026-01-14', '2026-01-20', '2026-02-25', '2026-03-03', '2026-04-08', '2026-05-12', '2026-06-01', '2026-06-02'];
    const punkty = dni.map((d, i) => ({ noteId: `p${i}`, dateISO: d, v: 0.01 * (i + 1) }));
    for (const szerokosc of [195, 265, 342]) {
      const L = w.chartLayout(punkty, 0.38, szerokosc);
      expect(L.narrow).toBe(true);
      expect(L.width).toBe(szerokosc);
      expect(L.dateLabels.length).toBeLessThanOrEqual(3);
      expect(L.dateLabels.map((d) => d.index)).toContain(punkty.length - 1);
      bezNakladania(L.dateLabels, 6);
      expect(L.dateLabels.every((d) => d.from >= L.left - 1 && d.to <= L.now.sepX + 1)).toBe(true);
    }
    const D = w.chartLayout(punkty, 0.38, 0);
    expect(D.narrow).toBe(false);
    bezNakladania(D.dateLabels, 12);
    expect(D.dateLabels[0]).toMatchObject({ index: 0, anchor: 'start' });
    // Dwa wyniki tego samego dnia: jedna etykieta daty.
    const L2 = w.chartLayout([{ noteId: 'a', dateISO: '2026-05-01', v: 1 }, { noteId: 'b', dateISO: '2026-05-01', v: 2 }], null, 342);
    expect(L2.dateLabels).toHaveLength(1);
  });

  it('etykiety wartości: od najnowszej, bez zachodzenia na siebie', () => {
    const { _internal: w } = loadStrip();
    const laid = [{ x: 100, y: 100 }, { x: 110, y: 101 }, { x: 200, y: 100 }];
    // Zachodzące podpisy: zostaje podpis nowszego wyniku.
    expect(w.valueLabelIndexes(laid, () => 24)).toEqual([1, 2]);
    expect(w.valueLabelIndexes([{ x: 100, y: 100 }, { x: 110, y: 60 }], () => 24)).toEqual([0, 1]);
  });
});

describe('pasek: kiedy jest ukryty (decyzja 6.9) i tożsamość pacjenta', () => {
  it.each([
    ['bez wybranego badania', { substancja: null }],
    ['badanie bez wyników pacjenta', { substancja: 'ft3' }],
    ['bez pacjenta w formularzu', { bezPacjenta: true }],
    ['bez identyfikatora pacjenta karty', { pid: null }],
  ])('%s: pasek ukryty bez komunikatu', async (_nazwa, opcje) => {
    const env = strona(opcje);
    await czekaj(300);
    await ukryty(env);
  });

  it('sejf zablokowany: ukryty; blokada sejfu i reset stanu użytkownika czyszczą widoczny pasek', async () => {
    const zamkniety = sejf(); zamkniety.odblokowany = false;
    const env0 = strona({ vault: zamkniety });
    await czekaj(300);
    await ukryty(env0);

    const env = strona();
    await widoczny(env);
    env.win.VildaVault.zablokuj();
    await ukryty(env);

    const env2 = strona();
    await widoczny(env2);
    env2.win.zdarzenie('vilda:user-state-cleared');
    expect(pasek(env2).classList.contains('is-on')).toBe(false);
    expect(env2.win.VildaLabHistoryStrip).toBeTruthy();
  });

  it('zmiana pacjenta w trakcie odczytu: na pasku tylko dane nowego pacjenta, nazwisko z rekordu sejfu', async () => {
    let zwolnij;
    const blokada = new Promise((r) => { zwolnij = r; });
    const vault = sejf({ opoznienie: (pid) => (pid === PID ? blokada : null) });
    const env = strona({ vault });
    await vi.waitFor(() => expect(vault.odczyty).toBe(1), { timeout: 2000 });
    env.pamiec.set('vildaCurrentPatientId', PID_B);
    env.win.zdarzenie('storage', { key: 'vildaCurrentPatientId' });
    await vi.waitFor(() => expect(txt(pasek(env) && pasek(env).querySelector('.lab-strip-sub'))).toBe('Fikcyjny Bartek · 1 wynik · ostatni 20.05.26'), { timeout: 2000 });
    zwolnij();
    await czekaj(300);
    expect(txt(pasek(env).querySelector('.lab-strip-sub'))).toBe('Fikcyjny Bartek · 1 wynik · ostatni 20.05.26');
    expect(pasek(env).querySelectorAll('button.lab-strip-chip[data-note-id]').map((c) => c.getAttribute('data-note-id'))).toEqual(['b-tsh-1']);
  });
});

describe('pasek: przypięcie i karta pacjenta', () => {
  it('po zapisie tego samego wyniku (badanie, liczba, jednostka): „teraz · już przypięty”, nowy chip w serii', async () => {
    const env = strona();
    await widoczny(env);
    const vault = env.win.VildaVault;
    const nowa = tsh(PID, 'tsh-8', '2026-06-17', 0.38, 'mIU/L');
    vault.dodaj(PID, nowa);
    vault.zmiana({ id: 'tsh-8', patientId: PID, action: 'save' });
    await vi.waitFor(() => expect(txt(pasek(env).querySelector('.lab-strip-now'))).toBe('teraz · już przypięty0,38'), { timeout: 2000 });
    expect(txt(pasek(env).querySelector('.lab-strip-diff'))).toBe('ostatni zapisany wynik: 17.06.26 (dziś) · 0,38 mIU/L · ten wynik jest już przypięty (17.06.26)');
    expect(pasek(env).querySelectorAll('button.lab-strip-chip[data-note-id]').map((c) => c.getAttribute('data-note-id')).slice(-1)).toEqual(['tsh-8']);
    // Inna wartość w formularzu: znowu „niezapisany” z różnicą do nowego ostatniego wyniku.
    env.pola.wartosc.value = '0,5';
    odswiez(env);
    await vi.waitFor(() => expect(txt(pasek(env).querySelector('.lab-strip-now'))).toBe('teraz · niezapisany0,5'));
    expect(txt(pasek(env).querySelector('.lab-strip-diff'))).toMatch(/→ różnica \+0,12 mIU\/L/);
  });

  it('zapis notatki innego pacjenta nie zmienia paska', async () => {
    const env = strona();
    await widoczny(env);
    const vault = env.win.VildaVault;
    const przed = vault.odczyty;
    vault.zmiana({ id: 'b-tsh-1', patientId: PID_B, action: 'save' });
    await czekaj(300);
    expect(vault.odczyty).toBe(przed);
    expect(txt(pasek(env).querySelector('.lab-strip-now'))).toBe('teraz · niezapisany0,38');
  });

  it('„Badania w karcie →”: powłoka (lokalna albo rodzica) z {activeTab: "lab"}; poza powłoką auth UI po ensureAuthLoaded', async () => {
    const env = strona();
    await widoczny(env);
    const lokalna = vi.fn();
    env.win.VildaShell = { openPatientCardInStart: lokalna };
    pasek(env).querySelector('button.lab-strip-link').click();
    expect(lokalna).toHaveBeenCalledExactlyOnceWith(PID, { activeTab: 'lab' });

    delete env.win.VildaShell;
    const rodzic = vi.fn();
    env.win.parent = { VildaShell: { openPatientCardInStart: rodzic } };
    pasek(env).querySelector('button.lab-strip-link').click();
    expect(rodzic).toHaveBeenCalledExactlyOnceWith(PID, { activeTab: 'lab' });

    env.win.parent = env.win;
    const karta = vi.fn();
    env.win.VildaAuthUI = { showPatientCard: karta };
    pasek(env).querySelector('button.lab-strip-link').click();
    await vi.waitFor(() => expect(karta).toHaveBeenCalledExactlyOnceWith(PID, null, null, { activeTab: 'lab' }));
    expect(env.win.VildaSession.ensureAuthLoaded).toHaveBeenCalled();
  });

  it('identyfikator z sessionStorage w chwili kliknięcia; inny pacjent niż na pasku — bez otwierania karty', async () => {
    const env = strona();
    await widoczny(env);
    const lokalna = vi.fn();
    env.win.VildaShell = { openPatientCardInStart: lokalna };
    const przycisk = pasek(env).querySelector('button.lab-strip-link');
    env.pamiec.set('vildaCurrentPatientId', PID_B);
    przycisk.click();
    expect(lokalna).not.toHaveBeenCalled();
  });
});

function bezNakladania(etykiety, odstep) {
  const posortowane = etykiety.slice().sort((a, b) => a.from - b.from);
  for (let i = 1; i < posortowane.length; i++) expect(posortowane[i].from - posortowane[i - 1].to).toBeGreaterThanOrEqual(odstep);
}

function loadStrip() {
  const win = {};
  loadBrowserScript('lab_history_strip.js', win);
  return win.VildaLabHistoryStrip;
}

// LAB-HISTORIA PR5a (decyzje 6.24–6.25): IGF-1 z notatki leczenia GH w pasku — chip „kontrola”, źródło
// w podpowiedzi i szczegółach, bez strzałki. Dane fikcyjne.
describe('pasek: IGF-1 z notatki leczenia GH', () => {
  function sejfIgf() {
    const igf = nota(PID, 'igf-1', '2026-04-08', { test: 'IGF-1 (insulinopodobny czynnik wzrostu 1)', testKey: 'igf1', value: '245', valueNum: 245, unit: 'ng/mL' });
    const gh = { id: 'gh-1', patientId: PID, title: 'Leczenie rhGH', body: 'Kontrola leczenia hormonem wzrostu / IGF-1.', category: 'treatment',
      dueDateISO: '2026-06-01', medication: { action: 'change', doseNum: 0.03, doseUnit: 'mg/kg/d' }, igf1: { value: 280, unit: 'ng/ml' } };
    return {
      isUnlocked: () => true,
      listPatientLabSeries: async () => [{ testKey: 'igf1', test: igf.labResult.test, points: [punkt(igf)] }],
      listPatientNotesForPatient: async () => structuredClone([igf, gh]),
      getPatient: async () => ({ patientId: PID, header: { name: 'Fikcyjna Anna' } }),
      getPatientNote: async () => null,
      onPatientNoteChanged: () => {}, onLock: () => {},
    };
  }

  it('chip z datą kontroli i źródłem; szczegóły z dopiskiem; różnica do bieżącego wyniku w ng/mL', async () => {
    const env = strona({ vault: sejfIgf(), substancja: 'igf1', jednostka: 'ng/mL', wartosc: '300' });
    await widoczny(env);
    const el = pasek(env);
    expect(txt(el.querySelector('.lab-strip-title'))).toBe('Poprzednie wyniki pacjenta · IGF-1 · w ng/mL');
    const chip = el.querySelector('button.lab-strip-chip[data-note-id="gh-1"]');
    expect(teksty(chip, 'span').map(txtS)).toEqual(['kontrola 01.06.26', '280']);
    expect(txtS(chip.getAttribute('title'))).toBe('data kontroli GH (brak daty badania) · z notatki leczenia GH · zapisano: 280 ng/ml');
    expect(chip.querySelector('.lab-strip-flag')).toBeNull();
    chip.click();
    await vi.waitFor(() => expect(pasek(env).querySelector('.lab-strip-detail')).not.toBeNull());
    const detail = pasek(env).querySelector('.lab-strip-detail');
    expect(txt(detail.querySelector('.lab-strip-detail-h'))).toBe('01.06.26 (data kontroli GH) · 280 ng/mL');
    expect(teksty(detail, '.lab-strip-muted').map(txtS)).toContain('z notatki leczenia GH (pole „IGF-1 (wynik z kontroli)”), bez normy i bez oceny');
    expect(detail.querySelector('.lab-strip-detail-comment')).toBeNull();
  });
});
