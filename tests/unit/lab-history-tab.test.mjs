import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu, teksty } from '../support/atrapa-dom-lekka.mjs';

// LAB-HISTORIA PR2: widok zakładki „Badania” (vilda_lab_history_tab.js) z prawdziwym modelem (vilda_lab_history.js),
// prawdziwym konwerterem i prawdziwym parserem normy wpisu (Dl z vilda_auth_ui.js) na atrapie DOM i atrapie sejfu.
// Renderer wykresu (Nl) jest atrapą, która zapisuje argumenty: zakładka nie może włączać pasma ani dzisiejszych norm.
// Dane wyłącznie FIKCYJNE.
const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const between = (from, to) => auth.slice(auth.indexOf(from), auth.indexOf(to, auth.indexOf(from)));
const Dl = new Function(`${between('function Dl(', 'function Ol(')};return Dl;`)();
const eo = new Function(`${between('function eo(', 'function Tl(')};return eo;`)();

const PID = 'fikcyjny-pacjent';
const nota = (id, date, lab, extra = {}) => ({ id, patientId: PID, title: `Fikcyjny ${id}`, body: '', category: 'wynik-badania', clinicalDateISO: date, labResult: lab, ...extra });
const punkt = (note, extra = {}) => ({ noteId: note.id, dateISO: note.clinicalDateISO, valueNum: note.labResult.valueNum, unit: note.labResult.unit, ...extra });

function dane() {
  const tsh1 = nota('tsh-1', '2026-04-08', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,05', valueNum: 0.05, unit: 'mIU/L', norm: '0,27–4,2 mIU/L' },
    { body: '= 0,05 mIU/L\nredukcja tiamazolu do 10 mg\nNorma: 0,27–4,2 mIU/L' });
  const tsh2 = nota('tsh-2', '2026-06-02', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,12', valueNum: 0.12, unit: 'mIU/L', norm: '0,27–4,2 mIU/L' },
    { body: 'kontrola po redukcji' });
  const ft41 = nota('ft4-1', '2026-04-08', { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '1,2 ng/dL', valueNum: 1.2, unit: 'ng/dL', norm: '0,8–1,8 ng/dL' });
  const ft42 = nota('ft4-2', '2026-06-02', { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '17', valueNum: 17, unit: 'pmol/L' });
  const zlecenie = { id: 'zlecenie-1', patientId: PID, title: 'Kontrola TSH', body: '', category: 'wynik-badania', dueDateISO: '2026-06-16', labResult: { testKey: 'tsh' } };
  const lek = { id: 'lek-1', patientId: PID, title: 'Fikcyjny tiamazol', category: 'treatment', clinicalDateISO: '2026-05-01', medication: { name: 'Tiamazol', action: 'change', dose: '10 mg' } };
  return {
    series: [
      { testKey: 'tsh', test: 'TSH (tyreotropina)', points: [punkt(tsh1), punkt(tsh2)] },
      { testKey: 'ft4', test: 'fT4 (wolna tyroksyna)', points: [punkt(ft41), punkt(ft42)] },
    ],
    notes: [tsh1, tsh2, ft41, ft42, zlecenie, lek],
    treatment: [{ drugKey: 'tiamazol', drug: 'Tiamazol', events: [{ noteId: 'lek-1', dateISO: '2026-05-01', action: 'change', dose: '10 mg' }] }],
  };
}

function sejf(opcje = {}) {
  const d = Object.assign(dane(), opcje.dane || {});
  const sluchacze = [];
  const vault = {
    odczyty: 0,
    isUnlocked: () => opcje.zablokowany !== true,
    listPatientLabSeries: async () => {
      vault.odczyty += 1;
      if (opcje.blad) throw new Error('fikcyjny błąd odczytu');
      if (opcje.opoznienie) await opcje.opoznienie(vault.odczyty);
      return structuredClone(d.series);
    },
    listPatientNotesForPatient: async () => structuredClone(d.notes),
    listPatientTreatmentPeriods: async () => structuredClone(d.treatment),
    listPatientNotesDueByDate: async () => opcje.przypomnienia || [],
    getPatientNote: async (id) => structuredClone(d.notes.find((n) => n.id === id) || null),
    onPatientNoteChanged: (fn) => sluchacze.push(fn),
    zmiana: (zdarzenie) => sluchacze.forEach((fn) => fn(zdarzenie)),
  };
  return vault;
}

function srodowisko(opcje = {}) {
  const doc = atrapaDokumentu();
  const pamiec = new Map(opcje.pamiec || []);
  const win = {
    document: doc, setTimeout, clearTimeout,
    sessionStorage: { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)) },
    matchMedia: () => ({ matches: !!opcje.waski }),
  };
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js', 'vilda_lab_history_tab.js']) loadBrowserScript(plik, win);
  const wykresy = [];
  const trend = opcje.bezEksportu ? null : {
    render: (serie, chart, openNote, norma, pasmo) => {
      wykresy.push({ serie, chart, norma, pasmo });
      if (chart.points.length < 2) return null;
      const svg = doc.createElement('svg');
      svg.setAttribute('class', 'vilda-lab-trend-chart');
      return svg;
    },
    assessments: () => {}, parseNorm: Dl, formatAge: eo, loadConverter: (cb) => setTimeout(() => cb(true), 0),
  };
  const host = doc.body.appendChild(doc.createElement('div'));
  return { doc, win, host, pamiec, trend, wykresy };
}

function otworz(env, vault, opcje = {}) {
  const wywolania = { edytor: [], przypomnienia: [], zmiany: 0 };
  const widok = env.win.VildaLabHistoryTab.render(env.host, PID, Object.assign({
    vault, trend: env.trend, now: () => new Date(2026, 5, 17, 12),
    openEditor: (o) => wywolania.edytor.push(o),
    openReminders: (lista) => wywolania.przypomnienia.push(lista),
    onChanged: () => { wywolania.zmiany += 1; },
  }, opcje));
  return { widok, wywolania };
}

const gotowe = (env) => vi.waitFor(() => {
  const sekcja = env.host.querySelector('.vilda-lab-hist');
  expect(sekcja.classList.contains('vilda-lab-hist-ready')).toBe(true);
  expect(sekcja.getAttribute('aria-busy')).toBe('false');
});
// Model łączy liczbę z jednostką twardą spacją; asercje porównują tekst ze zwykłą spacją.
const txt = (el) => el.textContent.replace(/\u00a0/g, ' ');
const przycisk = (env, tekst) => env.host.querySelectorAll('button').find((b) => b.textContent === tekst);

afterEach(() => { vi.useRealTimers(); });

describe('zakładka Badania: widok z zapisanych wyników', () => {
  it('podsumowanie, panele, strzałka tylko z normy wpisu, różnica liczbą i dniami', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-summary')).toEqual(['4 wyniki · 2 badania · ostatnie badanie 02.06.26']);
    expect(teksty(env.host, '.vilda-lab-hist-panel-h')).toEqual(['Tarczyca']);
    const tsh = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(tsh.querySelector('.vilda-lab-hist-value').textContent).toBe('0,12');
    expect(tsh.querySelector('.vilda-lab-hist-flag').textContent).toBe('↓');
    expect(txt(tsh.querySelector('.vilda-lab-hist-status'))).toBe('poniżej normy z wpisu · 0,27–4,2 mIU/L');
    expect(txt(tsh.querySelector('.vilda-lab-hist-prev'))).toBe('poprzednio 0,05 mIU/L (08.04.26) · różnica +0,07 mIU/L · po 55 dniach');
    // fT4 w ng/dL przeliczony na pmol/L: bez strzałki z normy zapisanej w ng/dL (decyzja 6.2), z adnotacją o zapisie.
    const ft4 = env.host.querySelector('.vilda-lab-hist-card[data-series="ft4"]');
    expect(txt(ft4.querySelector('.vilda-lab-hist-prev'))).toMatch(/^poprzednio 15,4 pmol\/L \(08\.04\.26\) · różnica \+1,6 pmol\/L · po 55 dniach$/);
    expect(ft4.querySelector('.vilda-lab-hist-flag')).toBeNull();
  });

  it('wykres: renderer karty bez pasma norm, bez dzisiejszej oceny i bez strzałek przy punktach (6.22)', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    expect(env.wykresy.map((w) => w.serie.testKey)).toEqual(['tsh', 'ft4']);
    for (const w of env.wykresy) {
      expect(w.pasmo).toBe(false);
      expect(w.norma({ v: 1 })).toBeNull();
      expect(w.chart.points.every((p) => p.ageMonths === null)).toBe(true);
    }
    expect(env.wykresy[1].chart.points.map((p) => ({ conv: !!p.conv, norm: p.norm }))).toEqual([{ conv: true, norm: null }, { conv: false, norm: null }]);
    // TSH ma normy wpisu przyjęte przez model (strzałka ↓ przy ostatniej wartości), ale punkty wykresu idą bez
    // normy: Nl nie dopisze strzałki ani czerwieni przy punkcie. Wartość obok wykresu zachowuje strzałkę.
    expect(env.wykresy[0].chart.points.map((p) => p.norm)).toEqual([null, null]);
    const tsh = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(tsh.querySelector('.vilda-lab-hist-flag').textContent).toBe('↓');
  });

  it('bez eksportu renderera (stary artefakt w cache): karty z napisem i działająca tabela', async () => {
    const env = srodowisko({ bezEksportu: true });
    otworz(env, sejf());
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-chart')).toEqual(['Wykres niedostępny — odśwież stronę.', 'Wykres niedostępny — odśwież stronę.']);
    // Bez parsera normy wpisu model nie stawia strzałek.
    expect(env.host.querySelectorAll('.vilda-lab-hist-flag')).toEqual([]);
    przycisk(env, 'Tabela').click();
    expect(env.host.querySelectorAll('table.vilda-lab-hist-table')).toHaveLength(1);
  });

  it('komentarz bez linii dopisanych przez aplikację; tabela z różnicą pod wartością i wierszem leczenia', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'table']] });
    otworz(env, sejf());
    await gotowe(env);
    const wiersze = env.host.querySelectorAll('tbody tr').map((tr) => tr.children.map((c) => c.textContent));
    expect(wiersze).toEqual([
      ['02.06.26', '0,12 ↓+0,07', '17+1,6', 'kontrola po redukcji'],
      ['01.05.26', 'Tiamazol · zmiana dawki · 10 mg'],
      ['08.04.26', '0,05 ↓', '15,4', 'redukcja tiamazolu do 10 mg'],
    ]);
    expect(env.host.querySelector('.vilda-lab-hist-cell-value.is-converted').textContent).toBe('15,4');
    expect(env.host.querySelector('button.vilda-lab-hist-cell[data-note-id="ft4-1"]').getAttribute('title').replace(/\u00a0/g, ' '))
      .toBe('fT4 · 08.04.26 · zapisano: 1,2 ng/dL · norma z wpisu: 0,8–1,8 ng/dL');
  });
});

describe('zakładka Badania: przełączniki i preferencje', () => {
  it('segment Wykresy | Tabela z aria-pressed; wybór zapamiętany per pacjent w sessionStorage', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    const stan = () => env.host.querySelectorAll('.vilda-lab-hist-segment-btn').map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(stan()).toEqual([['Wykresy', 'true'], ['Tabela', 'false']]);
    expect(env.host.querySelector('.vilda-lab-hist-segment').getAttribute('role')).toBe('group');
    przycisk(env, 'Tabela').click();
    expect(stan()).toEqual([['Wykresy', 'false'], ['Tabela', 'true']]);
    expect(env.pamiec.get(`vilda-lab-hist-view-${PID}`)).toBe('table');
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toEqual([]);
  });

  it('telefon (≤480 px) bez zapisanej preferencji: domyślnie Tabela (decyzja 6.17)', async () => {
    const env = srodowisko({ waski: true });
    otworz(env, sejf());
    await gotowe(env);
    expect(przycisk(env, 'Tabela').getAttribute('aria-pressed')).toBe('true');
    expect(env.host.querySelectorAll('table')).toHaveLength(1);
  });

  it('chipy paneli z aria-pressed filtrują widok', async () => {
    const env = srodowisko();
    const prolaktyna = nota('prl-1', '2026-05-20', { test: 'Prolaktyna (PRL)', testKey: 'prolactin', value: '12', valueNum: 12, unit: 'ng/mL' });
    const d = dane();
    otworz(env, sejf({ dane: { series: [...d.series, { testKey: 'prolactin', test: 'Prolaktyna (PRL)', points: [punkt(prolaktyna)] }], notes: [...d.notes, prolaktyna] } }));
    await gotowe(env);
    const chipy = () => env.host.querySelectorAll('.vilda-lab-hist-chip').map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(chipy()).toEqual([['Wszystkie · 3', 'true'], ['Tarczyca · 2', 'false'], ['Inne · 1', 'false']]);
    przycisk(env, 'Inne · 1').click();
    expect(chipy()[2]).toEqual(['Inne · 1', 'true']);
    expect(teksty(env.host, '.vilda-lab-hist-panel-h')).toEqual(['Inne']);
  });
});

describe('zakładka Badania: akcje', () => {
  it('„+ Dodaj wynik” otwiera edytor z szablonem wyniku i datą badania; zapis odświeża zakładkę i kartę', async () => {
    const env = srodowisko();
    const vault = sejf();
    const { wywolania } = otworz(env, vault);
    await gotowe(env);
    przycisk(env, '+ Dodaj wynik').click();
    expect(wywolania.edytor).toHaveLength(1);
    expect(wywolania.edytor[0]).toMatchObject({ note: null, template: 'lab', anchor: 'date' });
    const przed = vault.odczyty;
    wywolania.edytor[0].onSaved();
    expect(wywolania.zmiany).toBe(1);
    await vi.waitFor(() => expect(vault.odczyty).toBe(przed + 1));
  });

  it('„Wpisz wynik” przy zleceniu dopasowanym do badania: kopia wpisu z nazwą badania z przelicznika', async () => {
    const env = srodowisko();
    const { wywolania } = otworz(env, sejf());
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-pending-title')).toEqual(['Kontrola TSH · termin 16.06.26']);
    przycisk(env, 'Wpisz wynik').click();
    await vi.waitFor(() => expect(wywolania.edytor).toHaveLength(1));
    expect(wywolania.edytor[0]).toMatchObject({ template: 'lab', anchor: 'date', note: { id: 'zlecenie-1', labResult: { testKey: 'tsh', test: 'TSH (tyreotropina)' } } });
  });

  it('„Przypomnienia →” ukryte przy pustej liście, widoczne i otwierające arkusz, gdy lista ma wpisy', async () => {
    const pusta = srodowisko();
    otworz(pusta, sejf());
    await gotowe(pusta);
    expect(przycisk(pusta, 'Przypomnienia →').hidden).toBe(true);
    const env = srodowisko();
    const lista = [{ patientId: PID, patientName: 'Fikcyjna', notes: [{ id: 'zlecenie-1' }] }];
    const { wywolania } = otworz(env, sejf({ przypomnienia: lista }));
    await gotowe(env);
    const link = przycisk(env, 'Przypomnienia →');
    expect(link.hidden).toBe(false);
    link.click();
    expect(wywolania.przypomnienia).toEqual([lista]);
  });

  it('klik w wartość otwiera wpis w edytorze karty', async () => {
    const env = srodowisko();
    const { wywolania } = otworz(env, sejf());
    await gotowe(env);
    env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-value').click();
    await vi.waitFor(() => expect(wywolania.edytor).toHaveLength(1));
    expect(wywolania.edytor[0].note.id).toBe('tsh-2');
    expect(wywolania.edytor[0].template).toBeUndefined();
  });

  it('karta badania prowadzi do przelicznika z tym badaniem (6.23); nagłówek bez badania; w powłoce przez jej trasę', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    const karty = env.host.querySelectorAll('a.vilda-lab-hist-card-check');
    expect(karty.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Nowy wynik TSH w przeliczniku →', 'przelicznik-jednostek.html?badanie=tsh'],
      ['Nowy wynik fT4 w przeliczniku →', 'przelicznik-jednostek.html?badanie=ft4'],
    ]);
    const naglowek = env.host.querySelector('a.vilda-lab-hist-check');
    expect(naglowek.getAttribute('href')).toBe('przelicznik-jednostek.html');
    // Poza powłoką zwykły odnośnik (bez przechwycenia kliknięcia).
    expect(karty[0].click().domyslneZatrzymane).toBe(false);
    // W ramce powłoki: trasa „lab” z adresem badania; nagłówek — sama trasa.
    const navigate = vi.fn();
    env.doc.documentElement.classList.add('vilda-embedded');
    env.win.parent = { VildaShell: { navigate } };
    expect(karty[0].click().domyslneZatrzymane).toBe(true);
    naglowek.click();
    expect(navigate.mock.calls).toEqual([['lab', true, 'przelicznik-jednostek.html?badanie=tsh'], ['lab', true]]);
  });
});

describe('zakładka Badania: stany i odświeżanie', () => {
  it('sejf zablokowany, błąd odczytu z ponowieniem, brak wyników', async () => {
    const zablokowany = srodowisko();
    otworz(zablokowany, sejf({ zablokowany: true }));
    await gotowe(zablokowany);
    expect(teksty(zablokowany.host, '.vilda-lab-hist-locked')).toEqual(['Sejf jest zablokowany. Odblokuj go, aby zobaczyć wyniki badań.']);

    const blad = srodowisko();
    const vault = sejf({ blad: true });
    otworz(blad, vault);
    await gotowe(blad);
    expect(blad.host.querySelector('.vilda-lab-hist-error').textContent).toBe('Nie udało się wczytać wyników badań.Spróbuj ponownie');
    przycisk(blad, 'Spróbuj ponownie').click();
    await vi.waitFor(() => expect(vault.odczyty).toBe(2));

    const pusty = srodowisko();
    otworz(pusty, sejf({ dane: { series: [], notes: [], treatment: [] } }));
    await gotowe(pusty);
    expect(pusty.host.querySelector('.vilda-lab-hist-empty p').textContent).toBe('Brak zapisanych wyników badań.');
    expect(teksty(pusty.host, '.vilda-lab-hist-footer-main')).toEqual(['Wyniki pokazane tak, jak je zapisano. Historia nie jest oceniana dzisiejszymi normami.']);
  });

  it('zmiana notatki tego pacjenta odświeża widok; innego pacjenta i po destroy — nie', async () => {
    const env = srodowisko();
    const vault = sejf();
    const { widok } = otworz(env, vault);
    await gotowe(env);
    vault.zmiana({ id: 'x', patientId: 'inny-fikcyjny', action: 'save' });
    await new Promise((resolve) => { setTimeout(resolve, 250); });
    expect(vault.odczyty).toBe(1);
    vault.zmiana({ id: 'tsh-2', patientId: PID, action: 'save' });
    await vi.waitFor(() => expect(vault.odczyty).toBe(2));
    widok.destroy();
    expect(env.host.children).toEqual([]);
    vault.zmiana({ id: 'tsh-2', patientId: PID, action: 'save' });
    await new Promise((resolve) => { setTimeout(resolve, 250); });
    expect(vault.odczyty).toBe(2);
  });

  it('odczyt wyprzedzony przez nowszy nie rysuje (pokolenie)', async () => {
    const env = srodowisko();
    let pusc;
    const wstrzymany = new Promise((resolve) => { pusc = resolve; });
    const vault = sejf({ opoznienie: (n) => (n === 1 ? wstrzymany : null) });
    const { widok } = otworz(env, vault);
    await vi.waitFor(() => expect(vault.odczyty).toBe(1));
    await widok.refresh();
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toHaveLength(2);
    const narysowane = env.host.querySelector('.vilda-lab-hist-head');
    pusc();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(env.host.querySelector('.vilda-lab-hist-head')).toBe(narysowane);
  });

  it('kontener odpięty od dokumentu (stara karta): zdarzenie sejfu nie odświeża', async () => {
    const env = srodowisko();
    const vault = sejf();
    otworz(env, vault);
    await gotowe(env);
    env.doc.body.removeChild(env.host);
    vault.zmiana({ id: 'tsh-2', patientId: PID, action: 'save' });
    await new Promise((resolve) => { setTimeout(resolve, 250); });
    expect(vault.odczyty).toBe(1);
  });
});

describe('zakładka Badania: pomocnicze', () => {
  const env = srodowisko();
  const { plural, commentText, shortLabel } = env.win.VildaLabHistoryTab._internal;
  it('odmiana liczebników', () => {
    const formy = ['wynik', 'wyniki', 'wyników'];
    expect([1, 2, 4, 5, 12, 14, 22, 25, 112].map((n) => plural(n, formy)))
      .toEqual(['wynik', 'wyniki', 'wyniki', 'wyników', 'wyników', 'wyników', 'wyniki', 'wyników', 'wyników']);
  });
  it('komentarz wpisu bez równania przypięcia i linii normy z szablonu; etykieta bez nawiasu', () => {
    expect(commentText('= 15,4 pmol/L\nkontrola po zmianie dawki\nNorma: 12–22 pmol/L')).toBe('kontrola po zmianie dawki');
    expect(commentText('Wynik = dobry')).toBe('Wynik = dobry');
    expect(shortLabel('TSH (tyreotropina)')).toBe('TSH');
  });
});

// LAB-HISTORIA PR5a (decyzje 6.14, 6.24, 6.25): dopiski źródła w karcie, tabeli i stopce; dane fikcyjne.
describe('zakładka Badania: IGF-1 z notatek leczenia GH i wpisy dopasowane po nazwie', () => {
  function danePr5a() {
    const igf = nota('igf-1', '2026-04-08', { test: 'IGF-1 (insulinopodobny czynnik wzrostu 1)', testKey: 'igf1', value: '245', valueNum: 245, unit: 'ng/mL' });
    const gh = { id: 'gh-1', patientId: PID, title: 'Leczenie rhGH', body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nDawka: 0,030 mg/kg/d.', category: 'treatment',
      dueDateISO: '2026-06-01', medication: { action: 'change', doseNum: 0.03, doseUnit: 'mg/kg/d' }, igf1: { value: 280, unit: 'ng/ml' } };
    const t1 = nota('t-1', '2026-03-10', { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '0,8', valueNum: 0.8, unit: 'nmol/L' });
    const t2 = nota('t-2', '2026-05-10', { test: 'Testosteron całkowity', value: '1,9 nmol/L' });
    return {
      series: [
        { testKey: 'igf1', test: 'IGF-1 (insulinopodobny czynnik wzrostu 1)', points: [punkt(igf)] },
        { testKey: 'testosterone_total', test: 'Testosteron całkowity', points: [punkt(t1)] },
        { testKey: 'testosteroncalkowity', test: 'Testosteron całkowity', points: [{ noteId: 't-2', dateISO: '2026-05-10', valueNum: 1.9, unit: 'nmol/L', legacy: true }] },
      ],
      notes: [igf, gh, t1, t2],
      treatment: [],
    };
  }

  it('karta: wartość z notatki GH z datą kontroli i dopiskiem źródła, bez treści notatki w komentarzach; dopisek dopasowania po nazwie', async () => {
    const env = srodowisko();
    otworz(env, sejf({ dane: danePr5a() }));
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-panel-h')).toEqual(['Oś gonadalna', 'Oś GH–IGF-1']);
    const igf = env.host.querySelector('.vilda-lab-hist-card[data-series="igf1"]');
    expect(igf.querySelector('.vilda-lab-hist-value').textContent).toBe('280');
    expect(igf.querySelector('.vilda-lab-hist-value').getAttribute('data-note-id')).toBe('gh-1');
    expect(txt(igf.querySelector('.vilda-lab-hist-date'))).toBe('01.06.26 (data kontroli GH)');
    expect(teksty(igf, '.vilda-lab-hist-source')).toEqual(['z notatki leczenia GH']);
    expect(txt(igf.querySelector('.vilda-lab-hist-prev'))).toBe('poprzednio 245 ng/mL (08.04.26) · różnica +35 ng/mL · po 54 dniach');
    expect(igf.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(igf.querySelector('.vilda-lab-hist-comments')).toBeNull();
    const wykres = env.wykresy.find((w) => w.serie.testKey === 'igf1');
    expect(wykres.chart.points.map((p) => [p.dateISO, p.v, p.norm])).toEqual([['2026-04-08', 245, null], ['2026-06-01', 280, null]]);
    expect(teksty(env.host, '.vilda-lab-hist-footer .vilda-lab-hist-muted').at(-1))
      .toBe('IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli (tak jak na wykresie „Trend leczenia GH”); bez normy i bez strzałki.');

    const t = env.host.querySelector('.vilda-lab-hist-card[data-series="testosterone_total"]');
    expect(teksty(t, '.vilda-lab-hist-merged')).toEqual(['W tym 1 wpis dopasowany po nazwie badania „Testosteron całkowity”.']);
    expect(env.host.querySelector('.vilda-lab-hist-card[data-series="testosteroncalkowity"]')).toBeNull();
  });

  it('tabela: wiersz z datą kontroli GH nie jest „bez daty badania”, komórka ze znacznikiem GH i źródłem w podpowiedzi, legenda', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'table']] });
    otworz(env, sejf({ dane: danePr5a() }));
    await gotowe(env);
    const panel = env.host.querySelector('.vilda-lab-hist-panel[data-panel="somatotropic"]');
    const wiersze = panel.querySelectorAll('tbody tr');
    expect(wiersze.map((tr) => [tr.children.map((c) => c.textContent), tr.getAttribute('class') || ''])).toEqual([
      [['01.06.26data kontroli GH', '280 GH+35', ''], ''],
      [['08.04.26', '245', ''], ''],
    ]);
    expect(panel.querySelector('button.vilda-lab-hist-cell[data-note-id="gh-1"]').getAttribute('title').replace(/\u00a0/g, ' '))
      .toBe('IGF-1 · 01.06.26 · zapisano: 280 ng/ml · z notatki leczenia GH');
    expect(teksty(panel, '.vilda-lab-hist-foot').join(' ')).toContain('GH — IGF-1 z notatki leczenia GH (pole „IGF-1 (wynik z kontroli)”); bez daty badania data to termin odbytej kontroli');
  });

  it('mergedNote: liczba mnoga i kilka nazw', () => {
    const { mergedNote } = srodowisko().win.VildaLabHistoryTab._internal;
    expect(mergedNote([])).toBe('');
    expect(mergedNote([{ key: 'a', test: 'Kortyzol', count: 2 }, { key: 'b', test: 'Kortyzol', count: 3 }])).toBe('W tym 5 wpisów dopasowanych po nazwie badania „Kortyzol”.');
    expect(mergedNote([{ key: 'a', test: 'A', count: 1 }, { key: 'b', test: 'B', count: 1 }])).toBe('W tym 2 wpisy dopasowane po nazwie badania „A”, „B”.');
  });
});
