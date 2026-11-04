import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu, teksty } from '../support/atrapa-dom-lekka.mjs';

// LAB-HISTORIA PR2: widok zakładki „Badania” (vilda_lab_history_tab.js) z prawdziwym modelem (vilda_lab_history.js),
// prawdziwym konwerterem i prawdziwym parserem normy wpisu (Dl z vilda_auth_ui.js) na atrapie DOM i atrapie sejfu.
// Prezentacja i wykres są rzeczywistymi modułami: zakresy pochodzą wyłącznie z utrwalonych wpisów.
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
    // PR5b: zamknięcie i cofnięcie zlecenia jak w sejfie (completedAtISO / null); błąd na życzenie testu.
    completePatientNote: vi.fn(async (id) => {
      if (opcje.bladZamkniecia) throw new Error('fikcyjny błąd zapisu');
      Object.assign(d.notes.find((n) => n.id === id), { completedAtISO: '2026-06-17T10:00:00.000Z', noShowAtISO: null });
    }),
    uncompletePatientNote: vi.fn(async (id) => { Object.assign(d.notes.find((n) => n.id === id), { completedAtISO: null, noShowAtISO: null }); }),
    zmienNotatke: (id, zmiany) => Object.assign(d.notes.find((n) => n.id === id), zmiany),
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
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_snapshot.js', 'vilda_lab_assessment_ui.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_history.js', 'vilda_lab_result_presentation.js', 'vilda_lab_result_chart.js', 'vilda_lab_history_tab.js']) loadBrowserScript(plik, win);
  if (opcje.bezEksportu) delete win.VildaLabResultChart;
  const trend = opcje.bezEksportu ? null : {
    assessments: vi.fn(), parseNorm: Dl, formatAge: eo, loadConverter: (cb) => setTimeout(() => cb(true), 0),
  };
  const host = doc.body.appendChild(doc.createElement('div'));
  return { doc, win, host, pamiec, trend };
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
  it('AuthUI: render poza DOM, synchroniczny mount całej karty i dokładnie jeden pierwszy odczyt', async () => {
    const env = srodowisko(), vault = sejf();
    env.doc.body.removeChild(env.host);
    otworz(env, vault);
    expect(vault.odczyty).toBe(0);
    env.doc.body.appendChild(env.host);
    await gotowe(env);
    expect(vault.odczyty).toBe(1);
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(4);
    await Promise.resolve();
    expect(vault.odczyty).toBe(1);
  });

  it('karta zniszczona przed pierwszym mount nie czyta sejfu ani nie odtwarza widoku po append', async () => {
    const env = srodowisko(), vault = sejf();
    env.doc.body.removeChild(env.host);
    const { widok } = otworz(env, vault);
    widok.destroy();
    env.doc.body.appendChild(env.host);
    await Promise.resolve();
    await Promise.resolve();
    expect(vault.odczyty).toBe(0);
    expect(env.host.children).toHaveLength(0);
    await widok.refresh();
    expect(vault.odczyty).toBe(0);
  });

  it('refresh odpiętej aktywnej karty nie rozpoczyna nowego odczytu', async () => {
    const env = srodowisko(), vault = sejf();
    const { widok } = otworz(env, vault);
    await gotowe(env);
    env.doc.body.removeChild(env.host);
    await widok.refresh();
    expect(vault.odczyty).toBe(1);
  });
  it('prawdziwy adapter pełnych notatek pokazuje ujemny UAG i wpis tekstowy pominięte przez generic serie', async () => {
    const env = srodowisko();
    loadBrowserScript('clcr_saved_results.js', env.win);
    loadBrowserScript('clcr_saved_results_view.js', env.win);
    const notes = [
      nota('fictional-uag', '2026-10-25', { test: 'Luka anionowa moczu (UAG)', value: '-15', unit: 'mmol/L' }, { category: 'wynik-klirens' }),
      nota('fictional-text', '2026-10-25', { test: 'Albumina/kreatynina — ACR', value: 'nieoznaczalne', unit: 'mg/g' }, { category: 'wynik-klirens' }),
    ];
    const evaluate = vi.spyOn(env.win.LabUnitConverter, 'evaluate');
    otworz(env, sejf({ dane: { notes, series: [], treatment: [] } }));
    await gotowe(env);
    expect(env.host.querySelectorAll('tr[data-note-id]')).toHaveLength(2);
    expect(env.host.querySelector('.vilda-clcr-point[data-value="-15"]')).not.toBeNull();
    expect(env.host.querySelector('.vilda-clcr-value[data-note-id="fictional-text"]').textContent).toContain('nieoznaczalne');
    expect(env.host.querySelectorAll('.vilda-clcr-assessment').every((node) => node.classList.contains('tone-neutral'))).toBe(true);
    expect(env.host.querySelectorAll('.vilda-clcr-norm-band')).toHaveLength(0);
    expect(env.host.querySelector('.vilda-lab-hist-footer').textContent).not.toContain('Wykresy bez pasma norm');
    expect(env.host.querySelector('.vilda-lab-hist-footer').textContent).not.toContain('Różnica:');
    expect(evaluate).not.toHaveBeenCalled();
  });
  it('dołącza Nerki i mocz, zachowuje wszystkie pomiary i deleguje do szczegółów zamiast edytora lab', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'charts']] });
    loadBrowserScript('clcr_saved_results_view.js', env.win);
    const note = nota('fictional-clcr', '2026-10-25', { test: 'ACR (pełna metoda)', value: '45', valueNum: 45, unit: 'mg/g' }, { category: 'wynik-klirens' });
    const record = { noteId: note.id, patientId: PID, seriesKey: 'clcr:ACR|mg/g', label: note.labResult.test, method: 'Metoda (bez skrótu)', valueNum: 45, displayValue: '45', unit: 'mg/g', dateISO: note.clinicalDateISO, norm: '<30 mg/g', assessment: 'above', category: 'A2', tone: 'warning', status: 'recorded' };
    const projection = { measurements: [record], series: [{ seriesKey: record.seriesKey }], handledNoteIds: [note.id] };
    const projectPatientNotes = vi.fn(() => projection), details = vi.fn();
    const d = dane();
    d.notes.push(note);
    d.series.push({ testKey: 'fictional-clcr', test: note.labResult.test, points: [punkt(note)] });
    const vault = sejf({ dane: d });
    const { wywolania } = otworz(env, vault, { clcrSavedResults: { projectPatientNotes }, clcrSavedResultsView: env.win.ClcrSavedResultsView, openClcrResult: details });
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-summary')).toEqual(['5 wyników · 3 badania · ostatnie badanie 25.10.26']);
    expect(teksty(env.host, '.vilda-lab-hist-panel-h')).toEqual(['Nerki i mocz']);
    expect(env.host.querySelectorAll('.vilda-clcr-point')).toHaveLength(1);
    expect(env.host.querySelectorAll('tr[data-note-id="fictional-clcr"]')).toHaveLength(1);
    env.host.querySelector('.vilda-clcr-value').click();
    expect(details).toHaveBeenCalledWith(expect.objectContaining({ patientId: PID, noteId: note.id, record, vault }));
    expect(wywolania.edytor).toHaveLength(0);
    expect(projectPatientNotes.mock.calls[0][0]).toHaveLength(7);
    const filter = env.host.querySelector('.vilda-lab-hist-panel-select');
    filter.value = 'renal'; filter.dispatch('change');
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toHaveLength(0);
    przycisk(env, 'Tabela').click();
    expect(env.host.querySelectorAll('.vilda-clcr-point')).toHaveLength(0);
    expect(env.host.querySelectorAll('tr[data-note-id="fictional-clcr"]')).toHaveLength(1);
  });
  it('zwarta tabela: daty malejąco, kolor i norma z wpisu; różnica dopiero w szczegółach', async () => {
    const env = srodowisko();
    const d = dane();
    const undated = nota('tsh-undated', null, { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '1', valueNum: 1, unit: 'mIU/L' });
    d.notes.push(undated);
    d.series[0].points.push(punkt(undated));
    otworz(env, sejf({ dane: d }));
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-summary')).toEqual(['5 wyników · 2 badania · ostatnie badanie 02.06.26']);
    expect(env.host.querySelectorAll('.vilda-lab-hist-date-group').map((g) => g.getAttribute('data-date-iso'))).toEqual(['2026-06-02', '2026-04-08', '']);
    expect(env.host.querySelectorAll('.vilda-lab-hist-date-heading').at(-1).textContent).toBe('Bez daty badania · data wpisu');
    const tsh = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-2"]');
    expect(teksty(tsh, '.vilda-lab-hist-cell-value.tone-below')).toEqual(['0,12']);
    expect(teksty(tsh, '.vilda-lab-hist-flag')).toEqual(['↓']);
    expect(txt(tsh.querySelector('.vilda-lab-hist-result-norm'))).toContain('0,27–4,2 mIU/L');
    expect(env.host.querySelector('.vilda-lab-hist-status')).toBeNull();
    tsh.click();
    const details = env.host.querySelector('.vilda-lab-hist-result-details[data-note-id="tsh-2"]');
    expect(details.textContent).toContain('Zmiana: +0,07');
    expect(txt(details)).toContain('po 55 dniach');
    const ft4 = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="ft4-1"]');
    expect(teksty(ft4, '.vilda-lab-hist-cell-value.tone-neutral.is-converted')).toEqual(['15,4']);
    expect(teksty(ft4, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    expect(ft4.querySelector('.vilda-lab-hist-flag')).toBeNull();
  });

  it('wykres: prawdziwy renderer rysuje wyłącznie zapisane normy i otwiera dokładny wpis bez ponownej oceny', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'charts']] });
    const evaluate = vi.spyOn(env.win.LabUnitConverter, 'evaluate');
    otworz(env, sejf());
    await gotowe(env);
    expect(env.host.querySelectorAll('.vilda-lab-hist-card').map((c) => c.getAttribute('data-series'))).toEqual(['tsh', 'ft4']);
    const tsh = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(tsh.querySelectorAll('.vilda-lab-result-chart-point').map((p) => [p.getAttribute('data-note-id'), p.getAttribute('data-tone')])).toEqual([['tsh-1', 'below'], ['tsh-2', 'below']]);
    expect(tsh.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(2);
    expect(tsh.querySelectorAll('.vilda-lab-result-chart-bound').map((p) => p.getAttribute('data-low'))).toEqual(['0.27', '0.27', '0.27', '0.27']);
    const ft4 = env.host.querySelector('.vilda-lab-hist-card[data-series="ft4"]');
    const values = ft4.querySelectorAll('.vilda-lab-result-chart-point').map((p) => Number(p.getAttribute('data-value')));
    expect(values[0]).toBeCloseTo(15.444, 12);
    expect(values[1]).toBe(17);
    expect(ft4.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    expect(evaluate).not.toHaveBeenCalled();
    tsh.querySelector('.vilda-lab-result-chart-point[data-note-id="tsh-1"]').click();
    expect(env.host.querySelector('.vilda-lab-hist-result-details').getAttribute('data-note-id')).toBe('tsh-1');
  });

  it('bez modułu renderera (stary artefakt w cache): karty z napisem i działająca neutralna tabela', async () => {
    const env = srodowisko({ bezEksportu: true, pamiec: [[`vilda-lab-hist-view-${PID}`, 'charts']] });
    otworz(env, sejf());
    await gotowe(env);
    expect(teksty(env.host, '.vilda-lab-hist-chart')).toEqual(['Wykres niedostępny — odśwież stronę.', 'Wykres niedostępny — odśwież stronę.']);
    expect(env.host.querySelectorAll('.vilda-lab-hist-flag')).toEqual([]);
    przycisk(env, 'Tabela').click();
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(4);
    expect(env.host.querySelectorAll('.vilda-lab-hist-cell-value.tone-neutral')).toHaveLength(4);
  });

  it('nierozpoznana jednostka zachowuje surowy zapis bez dopisywania jednostki pozostałej serii', async () => {
    const env = srodowisko();
    const d = dane();
    const unknown = nota('tsh-unknown', '2026-06-03', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '12 umownych', valueNum: 12, unit: 'umownych' });
    d.notes.push(unknown);
    d.series[0].points.push(punkt(unknown));
    otworz(env, sejf({ dane: d }));
    await gotowe(env);
    const row = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-unknown"]');
    expect(teksty(row, '.vilda-lab-hist-cell-value.tone-neutral')).toEqual(['12 umownych']);
    expect(row.querySelectorAll('.vilda-lab-hist-result-unit')).toHaveLength(0);
    expect(row.textContent).not.toContain('mIU/L');
    expect(teksty(row, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    row.click();
    const details = env.host.querySelector('.vilda-lab-hist-result-details');
    expect(teksty(details, '.vilda-lab-hist-detail-value.tone-neutral')).toEqual(['12 umownych']);
    expect(details.querySelector('.vilda-lab-hist-detail-value').parentNode.querySelectorAll('.vilda-lab-hist-result-unit')).toHaveLength(0);
    przycisk(env, 'Wykresy').click();
    expect(env.host.querySelector('.vilda-lab-result-chart-point[data-note-id="tsh-unknown"]')).toBeNull();
  });

  it('komentarz i różnica w szczegółach, leczenie w osobnej zwiniętej sekcji; oryginalny zapis po konwersji zachowany', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row').map((r) => r.getAttribute('data-note-id'))).toEqual(['tsh-2', 'ft4-2', 'tsh-1', 'ft4-1']);
    expect(env.host.querySelector('.vilda-lab-hist-result-comment')).toBeNull();
    expect(env.host.querySelector('.vilda-lab-hist-treatment').open).not.toBe(true);
    expect(env.host.querySelector('.vilda-lab-hist-treatment').textContent).toContain('Tiamazol · zmiana dawki · 10 mg');
    env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-1"]').click();
    expect(teksty(env.host, '.vilda-lab-hist-result-comment')).toEqual(['redukcja tiamazolu do 10 mg']);
    expect(env.host.querySelector('.vilda-lab-hist-result-comment').textContent).not.toContain('Norma:');
    env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="ft4-1"]').click();
    expect(txt(env.host.querySelector('.vilda-lab-hist-result-details'))).toContain('Zapisano: 1,2 ng/dL');
    expect(env.host.querySelector('.vilda-lab-hist-cell-value.is-converted').textContent).toBe('15,4');
  });
});

describe('zakładka Badania: przełączniki i preferencje', () => {
  it('segment Tabela | Wykresy z aria-pressed; domyślnie tabela, wybór zapamiętany per pacjent', async () => {
    const env = srodowisko();
    otworz(env, sejf());
    await gotowe(env);
    const stan = () => env.host.querySelectorAll('.vilda-lab-hist-segment-btn').map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(stan()).toEqual([['Tabela', 'true'], ['Wykresy', 'false']]);
    expect(env.host.querySelector('.vilda-lab-hist-segment').getAttribute('role')).toBe('group');
    przycisk(env, 'Wykresy').click();
    expect(stan()).toEqual([['Tabela', 'false'], ['Wykresy', 'true']]);
    expect(env.pamiec.get(`vilda-lab-hist-view-${PID}`)).toBe('charts');
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toHaveLength(2);
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(0);
  });

  it('telefon (≤480 px) bez zapisanej preferencji: domyślnie Tabela (decyzja 6.17)', async () => {
    const env = srodowisko({ waski: true });
    otworz(env, sejf());
    await gotowe(env);
    expect(przycisk(env, 'Tabela').getAttribute('aria-pressed')).toBe('true');
    expect(env.host.querySelectorAll('.vilda-lab-hist-date-group')).toHaveLength(2);
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(4);
  });

  it('selektor panelu i wyszukiwanie filtrują te same dane; zmiana widoku zachowuje filtry', async () => {
    const env = srodowisko();
    const prolaktyna = nota('prl-1', '2026-05-20', { test: 'Prolaktyna (PRL)', testKey: 'prolactin', value: '12', valueNum: 12, unit: 'ng/mL' });
    const d = dane();
    otworz(env, sejf({ dane: { series: [...d.series, { testKey: 'prolactin', test: 'Prolaktyna (PRL)', points: [punkt(prolaktyna)] }], notes: [...d.notes, prolaktyna] } }));
    await gotowe(env);
    const selector = env.host.querySelector('.vilda-lab-hist-panel-select');
    expect(selector.querySelectorAll('option').map((o) => [o.value, o.textContent])).toEqual([['all', 'Wszystkie'], ['thyroid', 'Tarczyca · 2'], ['other', 'Inne · 1']]);
    selector.value = 'other'; selector.dispatch('change');
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row').map((r) => r.getAttribute('data-note-id'))).toEqual(['prl-1']);
    const search = env.host.querySelector('.vilda-lab-hist-search-input');
    search.value = 'TSH'; search.dispatch('input');
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(0);
    expect(env.host.querySelector('.vilda-lab-hist-results').textContent).toContain('Brak wyników pasujących');
    selector.value = 'all'; selector.dispatch('change');
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(2);
    przycisk(env, 'Wykresy').click();
    expect(env.host.querySelector('.vilda-lab-hist-search-input').value).toBe('TSH');
    expect(env.host.querySelectorAll('.vilda-lab-hist-card').map((c) => c.getAttribute('data-series'))).toEqual(['tsh']);
    env.host.querySelector('.vilda-lab-hist-search-clear').click();
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toHaveLength(3);
    expect(env.host.querySelector('.vilda-lab-hist-search-input')).toBe(env.doc.activeElement);
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

  it('klik w wynik otwiera szczegóły, dopiero „Edytuj wpis” otwiera właściwą notatkę; zamknięcie przywraca fokus', async () => {
    const env = srodowisko();
    const { wywolania } = otworz(env, sejf());
    await gotowe(env);
    env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-2"]').click();
    expect(env.host.querySelector('.vilda-lab-hist-result-details').getAttribute('data-note-id')).toBe('tsh-2');
    expect(wywolania.edytor).toHaveLength(0);
    expect(env.doc.activeElement).toBe(env.host.querySelector('.vilda-lab-hist-result-details'));
    przycisk(env, 'Edytuj wpis').click();
    await vi.waitFor(() => expect(wywolania.edytor).toHaveLength(1));
    expect(wywolania.edytor[0].note.id).toBe('tsh-2');
    expect(wywolania.edytor[0].template).toBeUndefined();
    env.host.querySelector('.vilda-lab-hist-details-close').click();
    expect(env.host.querySelector('.vilda-lab-hist-result-details')).toBeNull();
    expect(env.doc.activeElement).toBe(env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-2"]'));
  });

  it('karta badania prowadzi do przelicznika z tym badaniem (6.23); nagłówek bez badania; w powłoce przez jej trasę', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'charts']] });
    otworz(env, sejf());
    await gotowe(env);
    const karty = env.host.querySelectorAll('a.vilda-lab-hist-card-check');
    expect(karty.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Nowy wynik TSH →', 'przelicznik-jednostek.html?badanie=tsh'],
      ['Nowy wynik fT4 →', 'przelicznik-jednostek.html?badanie=ft4'],
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

  it('sygnał po usunięciu odświeża tylko właściwego pacjenta, także po pustej projekcji', async () => {
    const env = srodowisko();
    loadBrowserScript('clcr_saved_results.js', env.win);
    loadBrowserScript('clcr_saved_results_view.js', env.win);
    const notes = [nota('fictional-clcr', '2026-10-25', { test: 'Luka anionowa moczu (UAG)', value: '-15', unit: 'mmol/L' }, { category: 'wynik-klirens' })];
    const vault = sejf({ dane: { notes, series: [], treatment: [] } });
    const { widok } = otworz(env, vault);
    await gotowe(env);
    expect(env.host.querySelectorAll('.vilda-clcr-value')).toHaveLength(1);
    notes.splice(0);
    env.doc.dispatchEvent({ type: 'vilda:clcr-results-changed', detail: { patientId: 'other-fictional' } });
    await new Promise((resolve) => { setTimeout(resolve, 180); });
    expect(vault.odczyty).toBe(1);
    vault.zmiana({ patientId: PID, id: 'fictional-clcr', action: 'delete' });
    await vi.waitFor(() => expect(env.host.querySelector('.vilda-lab-hist-empty')).not.toBeNull());
    expect(vault.odczyty).toBe(2);
    widok.destroy();
    env.doc.dispatchEvent({ type: 'vilda:clcr-results-changed', detail: { patientId: PID } });
    await new Promise((resolve) => { setTimeout(resolve, 180); });
    expect(vault.odczyty).toBe(2);
  });

  it('blokada podczas oczekiwania na odczyt usuwa dane i nie pozwala starej odpowiedzi ich przywrócić', async () => {
    const env = srodowisko();
    let release, locked = false, onLock;
    const pending = new Promise((resolve) => { release = resolve; });
    const vault = sejf({ opoznienie: () => pending });
    vault.isUnlocked = () => !locked;
    vault.onLock = (callback) => { onLock = callback; };
    otworz(env, vault);
    await vi.waitFor(() => expect(vault.odczyty).toBe(1));
    locked = true; onLock(); release();
    await gotowe(env);
    expect(env.host.querySelectorAll('.vilda-lab-hist-card')).toHaveLength(0);
    expect(env.host.querySelectorAll('.vilda-clcr-value')).toHaveLength(0);
    expect(env.host.querySelector('.vilda-lab-hist-locked')).not.toBeNull();
  });

  it('opóźnione rozwinięcie źródeł starego wyniku po odświeżeniu lub blokadzie nie odtwarza oceny', async () => {
    const env = srodowisko();
    const d = dane();
    const assessment = { status: 'recorded', evaluation: { measurement: { status: 'valid', isExact: true, sourceUnit: 'mIU/L' }, summary: { title: 'Fikcyjna zapisana ocena' } } };
    d.series[0].points[1].assessment = assessment;
    let locked = false, onLock;
    const vault = sejf({ dane: d });
    vault.isUnlocked = () => !locked;
    vault.onLock = callback => { onLock = callback; };
    const { widok } = otworz(env, vault);
    await gotowe(env);
    env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-2"]').click();
    const stale = env.host.querySelector('.vilda-lab-hist-result-sources');
    stale.open = true;
    await widok.refresh();
    expect(stale.isConnected).toBe(false);
    expect(() => stale.dispatch('toggle')).not.toThrow();
    expect(env.trend.assessments).not.toHaveBeenCalled();
    const pending = env.host.querySelector('.vilda-lab-hist-result-sources');
    pending.open = true;
    locked = true; onLock();
    expect(pending.isConnected).toBe(false);
    expect(() => pending.dispatch('toggle')).not.toThrow();
    expect(env.trend.assessments).not.toHaveBeenCalled();
    expect(env.host.querySelector('.vilda-lab-hist-locked')).not.toBeNull();
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-details')).toHaveLength(0);
  });

  it('odczyt wyprzedzony przez nowszy nie rysuje (pokolenie)', async () => {
    const env = srodowisko();
    let pusc;
    const wstrzymany = new Promise((resolve) => { pusc = resolve; });
    const vault = sejf({ opoznienie: (n) => (n === 1 ? wstrzymany : null) });
    const { widok } = otworz(env, vault);
    await vi.waitFor(() => expect(vault.odczyty).toBe(1));
    await widok.refresh();
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(4);
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

  it('wykres GH: data kontroli i neutralny wynik; wartości dopasowane po nazwie w jednej serii bez dublowania', async () => {
    const env = srodowisko({ pamiec: [[`vilda-lab-hist-view-${PID}`, 'charts']] });
    otworz(env, sejf({ dane: danePr5a() }));
    await gotowe(env);
    const igf = env.host.querySelector('.vilda-lab-hist-card[data-series="igf1"]');
    expect(teksty(igf, '.vilda-lab-hist-value.tone-neutral')).toEqual(['280']);
    expect(igf.querySelector('.vilda-lab-hist-latest').getAttribute('data-note-id')).toBe('gh-1');
    expect(txt(igf.querySelector('.vilda-lab-hist-date'))).toBe('01.06.26 · data kontroli GH');
    expect(teksty(igf, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    expect(igf.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(igf.querySelector('.vilda-lab-hist-comments')).toBeNull();
    expect(igf.querySelectorAll('.vilda-lab-result-chart-point').map((p) => [p.getAttribute('data-note-id'), p.getAttribute('data-value'), p.getAttribute('data-tone')])).toEqual([['igf-1', '245', 'neutral'], ['gh-1', '280', 'neutral']]);
    expect(teksty(env.host, '.vilda-lab-hist-footer .vilda-lab-hist-muted').at(-1)).toContain('IGF-1 z notatek leczenia GH: data badania, a gdy jej brak — termin odbytej kontroli');
    igf.querySelector('.vilda-lab-hist-latest').click();
    const details = env.host.querySelector('.vilda-lab-hist-result-details');
    expect(teksty(details, '.vilda-lab-hist-muted')).toContain('z notatki leczenia GH');
    expect(txt(details)).toContain('Zmiana: +35 ng/mL · po 54 dniach');
    expect(details.textContent).not.toContain('Dawka: 0,030');
    const t = env.host.querySelector('.vilda-lab-hist-card[data-series="testosterone_total"]');
    expect(t.querySelectorAll('.vilda-lab-result-chart-point').map((point) => point.getAttribute('data-note-id'))).toEqual(['t-1', 't-2']);
    expect(env.host.querySelector('.vilda-lab-hist-card[data-series="testosteroncalkowity"]')).toBeNull();
  });

  it('tabela GH: grupa z datą kontroli, znacznik źródła, neutralna norma i brak treści leczenia w głównym widoku', async () => {
    const env = srodowisko();
    otworz(env, sejf({ dane: danePr5a() }));
    await gotowe(env);
    const grupa = env.host.querySelector('.vilda-lab-hist-date-group[data-date-iso="2026-06-01"]');
    expect(grupa.querySelector('.vilda-lab-hist-date-heading').textContent).toBe('01.06.26 · data kontroli GH');
    const row = grupa.querySelector('.vilda-lab-hist-result-row[data-note-id="gh-1"]');
    expect(teksty(row, '.vilda-lab-hist-source')).toEqual(['GH']);
    expect(teksty(row, '.vilda-lab-hist-cell-value.tone-neutral')).toEqual(['280']);
    expect(teksty(row, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    expect(row.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(env.host.textContent).not.toContain('Kontrola leczenia hormonem wzrostu / IGF-1.');
    expect(env.host.querySelectorAll('.vilda-lab-hist-result-row')).toHaveLength(4);
  });

  it('mergedNote: liczba mnoga i kilka nazw', () => {
    const { mergedNote } = srodowisko().win.VildaLabHistoryTab._internal;
    expect(mergedNote([])).toBe('');
    expect(mergedNote([{ key: 'a', test: 'Kortyzol', count: 2 }, { key: 'b', test: 'Kortyzol', count: 3 }])).toBe('W tym 5 wpisów dopasowanych po nazwie badania „Kortyzol”.');
    expect(mergedNote([{ key: 'a', test: 'A', count: 1 }, { key: 'b', test: 'B', count: 1 }])).toBe('W tym 2 wpisy dopasowane po nazwie badania „A”, „B”.');
  });
});

// LAB-HISTORIA PR5b (decyzja 6.11): „Wpisz wynik” z zapisaną wartością zamyka zlecenie jak „Wykonano”
// w Przypomnieniach; komunikat z „Cofnij”. Dane fikcyjne.
describe('zakładka Badania: zlecenie zamyka się po wpisaniu wyniku', () => {
  async function wpiszWynik(opcjeSejfu = {}, zmiany = { labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,4', valueNum: 0.4, unit: 'mIU/L' }, clinicalDateISO: '2026-06-16' }) {
    const env = srodowisko();
    const vault = sejf(opcjeSejfu);
    const { wywolania } = otworz(env, vault);
    await gotowe(env);
    przycisk(env, 'Wpisz wynik').click();
    await vi.waitFor(() => expect(wywolania.edytor).toHaveLength(1));
    if (zmiany) vault.zmienNotatke('zlecenie-1', zmiany);   // zapis w edytorze karty
    wywolania.edytor[0].onSaved();
    return { env, vault, wywolania };
  }
  const komunikat = (env) => env.host.querySelector('.vilda-lab-hist-notice');

  it('wartość zapisana: completePatientNote, komunikat, odświeżenie karty po zamknięciu; „Cofnij” przywraca zlecenie', async () => {
    const { env, vault, wywolania } = await wpiszWynik();
    await vi.waitFor(() => expect(komunikat(env)).not.toBeNull());
    expect(vault.completePatientNote).toHaveBeenCalledExactlyOnceWith('zlecenie-1');
    expect(komunikat(env).getAttribute('role')).toBe('status');
    expect(teksty(env.host, '.vilda-lab-hist-notice-text')).toEqual(['Wynik zapisany — zlecenie „Kontrola TSH” oznaczone jako wykonane w Przypomnieniach.']);
    await vi.waitFor(() => expect(wywolania.zmiany).toBe(1));
    expect(env.host.querySelector('.vilda-lab-hist-pending')).toBeNull();
    przycisk(env, 'Cofnij').click();
    await vi.waitFor(() => expect(teksty(env.host, '.vilda-lab-hist-notice-text')).toEqual(['Cofnięto — zlecenie „Kontrola TSH” znów jest w Przypomnieniach.']));
    expect(vault.uncompletePatientNote).toHaveBeenCalledExactlyOnceWith('zlecenie-1');
    expect(przycisk(env, 'Cofnij')).toBeUndefined();
    expect(wywolania.zmiany).toBe(2);
  });

  it.each([
    ['bez wartości (zamknięty edytor albo sam opis)', null],
    ['wartość pusta', { labResult: { testKey: 'tsh', test: 'TSH (tyreotropina)', value: '  ' } }],
    ['zlecenie już wykonane', { labResult: { testKey: 'tsh', value: '0,4', valueNum: 0.4, unit: 'mIU/L' }, completedAtISO: '2026-06-16T08:00:00.000Z' }],
    ['niestawienie', { labResult: { testKey: 'tsh', value: '0,4', valueNum: 0.4, unit: 'mIU/L' }, noShowAtISO: '2026-06-16T08:00:00.000Z' }],
  ])('%s: zlecenie zostaje, bez komunikatu', async (_, zmiany) => {
    const { env, vault, wywolania } = await wpiszWynik({}, zmiany);
    await vi.waitFor(() => expect(wywolania.zmiany).toBe(1));
    expect(vault.completePatientNote).not.toHaveBeenCalled();
    expect(komunikat(env)).toBeNull();
  });

  it.each([
    ['niestawienie oznaczone później (inna karta, synchronizacja)', { completedAtISO: null, noShowAtISO: '2026-06-17T11:00:00.000Z' }],
    ['ponowne zamknięcie z innym czasem', { completedAtISO: '2026-06-17T12:00:00.000Z' }],
    ['przywrócone gdzie indziej', { completedAtISO: null }],
  ])('„Cofnij” po zmianie zlecenia gdzie indziej (%s): bez uncompletePatientNote, komunikat o zmianie', async (_, zmiana) => {
    const { env, vault, wywolania } = await wpiszWynik();
    await vi.waitFor(() => expect(przycisk(env, 'Cofnij')).toBeDefined());
    vault.zmienNotatke('zlecenie-1', zmiana);
    przycisk(env, 'Cofnij').click();
    await vi.waitFor(() => expect(teksty(env.host, '.vilda-lab-hist-notice-text'))
      .toEqual(['Nie cofnięto: zlecenie „Kontrola TSH” zmieniło się w międzyczasie — sprawdź je w Przypomnieniach.']));
    expect(vault.uncompletePatientNote).not.toHaveBeenCalled();
    expect(komunikat(env).classList.contains('is-undo-stale')).toBe(true);
    expect(przycisk(env, 'Cofnij')).toBeUndefined();
    expect(wywolania.zmiany).toBe(2);
  });

  it('wynik tekstowy („<0,1 mIU/L”) też zamyka zlecenie', async () => {
    const { env, vault } = await wpiszWynik({}, { labResult: { testKey: 'tsh', test: 'TSH (tyreotropina)', value: '<0,1 mIU/L' } });
    await vi.waitFor(() => expect(komunikat(env)).not.toBeNull());
    expect(vault.completePatientNote).toHaveBeenCalledOnce();
  });

  it('błąd zamknięcia: komunikat z odesłaniem do Przypomnień, bez „Cofnij”', async () => {
    const { env } = await wpiszWynik({ bladZamkniecia: true });
    await vi.waitFor(() => expect(teksty(env.host, '.vilda-lab-hist-notice-text'))
      .toEqual(['Wynik zapisany, ale nie udało się oznaczyć zlecenia jako wykonanego — zrób to w Przypomnieniach.']));
    expect(komunikat(env).classList.contains('is-error')).toBe(true);
    expect(przycisk(env, 'Cofnij')).toBeUndefined();
  });

  it('inne zapisy z zakładki (wartość w karcie, „+ Dodaj wynik”) nie zamykają zleceń', async () => {
    const env = srodowisko();
    const vault = sejf();
    const { wywolania } = otworz(env, vault);
    await gotowe(env);
    env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-2"]').click();
    przycisk(env, 'Edytuj wpis').click();
    przycisk(env, '+ Dodaj wynik').click();
    await vi.waitFor(() => expect(wywolania.edytor).toHaveLength(2));
    vault.zmienNotatke('zlecenie-1', { labResult: { testKey: 'tsh', value: '0,4', valueNum: 0.4, unit: 'mIU/L' } });
    wywolania.edytor.forEach((o) => o.onSaved());
    await vi.waitFor(() => expect(wywolania.zmiany).toBe(2));
    expect(vault.completePatientNote).not.toHaveBeenCalled();
  });
});

// Decyzja 6.3: zakres zapisany z wynikiem przy przypięciu. Koperty tworzy prawdziwy przelicznik (selectRange + evaluate,
// jak captureLabRange w przelicznik-jednostek.html) dla fikcyjnej dziewczynki 8 l; zakładka tylko je czyta.
describe('zakładka Badania: zakres zapisany przy przypięciu (decyzja 6.3)', () => {
  function zakres(win, raw, patient = { sex: 'F', age: 8, life_stage: 'pediatric' }) {
    const Conv = win.LabUnitConverter, range = Conv.selectRange(Conv.find('tsh'), patient);
    return win.VildaLabRangeSnapshot.create({ analyte: 'tsh', evaluation: Conv.evaluate('tsh', { value: raw, unit: 'mIU/L', patient }), range, patient,
      factorToSi: 1, measurement: { raw, sourceUnit: 'mIU/L' }, sources: [{ id: 'mayo_test_tsh', label: 'Mayo Test 8939 — TSH' }],
      versions: { engine: 'LabUnitConverter', data: 'LabUnitsData' }, capturedAtISO: '2026-06-10T10:00:00.000Z' });
  }
  function daneZakresu(win, ostatni, patient) {
    const stary = nota('tsh-a', '2026-03-02', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '2,9', valueNum: 2.9, unit: 'mIU/L' });
    const nowy = nota('tsh-b', '2026-06-10', { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '5,1 mIU/L = 5,1 mIU/L', valueNum: 5.1, unit: 'mIU/L' });
    const range = win.VildaLabRangeSnapshot.reconcile(null, Object.assign({}, nowy.labResult, { range: zakres(win, '5,1', patient) }), null, '2026-06-10').range;
    return { series: [{ testKey: 'tsh', test: 'TSH (tyreotropina)', points: [punkt(stary), punkt(nowy, { range: ostatni ? ostatni(range) : range })] }],
      notes: [stary, nowy], treatment: [] };
  }

  it('zapisany zakres: kolor i granice w tabeli i wykresie; źródło w szczegółach, starszy wpis bez oceny', async () => {
    const env = srodowisko();
    const data = daneZakresu(env.win);
    const evaluate = vi.spyOn(env.win.LabUnitConverter, 'evaluate');
    otworz(env, sejf({ dane: data }));
    await gotowe(env);
    const nowa = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-b"]');
    expect(teksty(nowa, '.vilda-lab-hist-cell-value.tone-above')).toEqual(['5,1']);
    expect(teksty(nowa, '.vilda-lab-hist-flag')).toEqual(['↑']);
    expect(txt(nowa.querySelector('.vilda-lab-hist-result-norm'))).toContain('0,6–4,8 mIU/L');
    const stara = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-a"]');
    expect(teksty(stara, '.vilda-lab-hist-cell-value.tone-neutral')).toEqual(['2,9']);
    expect(teksty(stara, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    nowa.click();
    expect(teksty(env.host, '.vilda-lab-hist-status-context')).toEqual(['Dzieci 6–10 lat · dziewczynka, 8 l · Mayo Test 8939 — TSH']);
    expect(env.host.querySelector('.vilda-lab-hist-result-sources').open).not.toBe(true);
    przycisk(env, 'Wykresy').click();
    const karta = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(teksty(karta, '.vilda-lab-hist-value.tone-above')).toEqual(['5,1']);
    expect(karta.querySelectorAll('.vilda-lab-result-chart-band').map((n) => [n.getAttribute('data-date'), n.getAttribute('data-low'), n.getAttribute('data-high')])).toEqual([['2026-06-10', '0.6', '4.8']]);
    expect(evaluate).not.toHaveBeenCalled();
  });

  // Decyzja 6.30: wiersz domyślny przelicznika (TSH bez wieku, sam Tanner II → „Zakres ogólny dorosły”) u dziecka.
  it('zakres ogólny u dziecka: granice zachowane, tabela i wykres neutralne bez zielonego pasma', async () => {
    const env = srodowisko();
    otworz(env, sejf({ dane: daneZakresu(env.win, null, { sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' }) }));
    await gotowe(env);
    const nowa = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-b"]');
    expect(nowa.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(teksty(nowa, '.vilda-lab-hist-cell-value.tone-neutral')).toEqual(['5,1']);
    expect(txt(nowa.querySelector('.vilda-lab-hist-result-norm'))).toContain('0,3–4,2 mIU/L');
    nowa.click();
    expect(teksty(env.host, '.vilda-lab-hist-status-context')).toEqual(['Zakres ogólny dorosły (domyślnie) · dziewczynka, Tanner II · Mayo Test 8939 — TSH']);
    expect(txt(env.host.querySelector('.vilda-lab-hist-status.is-range-general'))).toContain('zakres ogólny — bez oceny dla dziecka');
    przycisk(env, 'Wykresy').click();
    const karta = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(karta.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(teksty(karta, '.vilda-lab-hist-value.tone-neutral')).toEqual(['5,1']);
    expect(karta.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    expect(karta.querySelectorAll('.vilda-lab-result-chart-bound')).toHaveLength(2);
  });

  it('zakres nieaktualny po zmianie wyniku: bez normy i koloru, zachowany powód w szczegółach, bez pasma', async () => {
    const env = srodowisko();
    const nieaktualny = (range) => Object.assign(range, { status: 'invalidated', reasonCodes: ['result_or_clinical_date_changed'] });
    otworz(env, sejf({ dane: daneZakresu(env.win, nieaktualny) }));
    await gotowe(env);
    const row = env.host.querySelector('.vilda-lab-hist-result-row[data-note-id="tsh-b"]');
    expect(row.querySelector('.vilda-lab-hist-flag')).toBeNull();
    expect(teksty(row, '.vilda-lab-hist-cell-value.tone-neutral')).toEqual(['5,1']);
    expect(teksty(row, '.vilda-lab-hist-result-norm')).toEqual(['—']);
    row.click();
    expect(teksty(env.host, '.vilda-lab-hist-status.is-range-invalidated.tone-muted .vilda-lab-hist-status-text')).toEqual(['zakres nieaktualny · zmieniono wynik lub datę badania']);
    przycisk(env, 'Wykresy').click();
    const karta = env.host.querySelector('.vilda-lab-hist-card[data-series="tsh"]');
    expect(teksty(karta, '.vilda-lab-hist-value.tone-neutral')).toEqual(['5,1']);
    expect(karta.querySelectorAll('.vilda-lab-result-chart-band')).toHaveLength(0);
    expect(karta.querySelectorAll('.vilda-lab-result-chart-bound')).toHaveLength(0);
  });
});
