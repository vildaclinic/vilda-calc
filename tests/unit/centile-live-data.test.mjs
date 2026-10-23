import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Fikcyjni pacjenci i odroczone odczyty; wykonujemy rzeczywisty moduł adaptera.
function events() {
  const handlers = new Map();
  return {
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(callback);
    },
    emit(type, detail = {}) {
      for (const callback of handlers.get(type) || []) callback({ type, detail, ...detail });
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function patient(id = 'fikcyjny-a') {
  return {
    patientId: id, header: { name: 'Pacjent Fikcyjny' },
    snapshots: [{ snapshotId: `zapis-${id}`, payload: {
      name: 'Pacjent Fikcyjny', user: { age: 9, ageMonths: 0, height: 139, weight: 32, sex: 'M' },
      advanced: { data: { motherHeight: 165, fatherHeight: 180, measurements: [{ ageMonths: 108, height: 139, weight: 32 }] } },
    } }],
  };
}

function setup({ working = true, framed = false } = {}) {
  const values = new Map([['vildaCurrentPatientId', 'fikcyjny-a'], ['vildaLoadChoiceV1', 'new']]);
  const writes = vi.fn();
  const fields = Object.fromEntries(Object.entries({
    age: '13', ageMonths: '2', height: '158', weight: '46', sex: 'M',
    advMotherHeight: '165', advFatherHeight: '180', resultsModeToggle: '',
  }).map(([id, value]) => [id, { id, value, checked: id === 'resultsModeToggle' }]));
  const docEvents = events(), winEvents = events();
  const hooks = {};
  const state = { sequence: 4, unlocked: true, stale: false, pending: false, source: 'OLAF', population: 'OGOLNA', headerName: '',
    exactAge: { totalMonths: 158, exactMonths: 158.2 }, owner: 'fikcyjny-a', record: patient() };
  const vault = {
    isUnlocked: () => state.unlocked,
    getPatient: vi.fn(async (id) => state.record && { ...state.record, patientId: id }),
    listPatientTimelineEvents: vi.fn(async () => [
      { type: 'measurement', ageMonths: 120, height: 141, weight: 33 },
      { type: 'note', body: 'Fikcyjna notatka' },
    ]),
    onLock: (callback) => { hooks.lock = callback; },
    onUnlock: (callback) => { hooks.unlock = callback; },
    onPatientSaved: (callback) => { hooks.save = callback; },
    onPatientDeleted: (callback) => { hooks.remove = callback; },
    savePatient: writes,
  };
  let frameObserver;
  const win = {
    ...winEvents,
    location: { pathname: '/index.html' },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: writes, removeItem: writes,
    },
    document: { ...docEvents, getElementById: (id) => fields[id] || null,
      querySelector: () => ({ value: state.source }) },
    VildaVault: vault,
    VildaDataImportExport: { getApplyLoadedDataSequence: () => state.sequence },
    VildaPanelPacjent: { nieaktualny: () => state.stale, wlasciciel: () => state.owner },
    VildaDobAge: { restorePending: () => state.pending, readExactAge: () => state.exactAge,
      readMeasuredAtISO: () => '2026-10-23', showsSavedMeasurement: () => values.get('vildaDobAgeZapisV1') === '1' },
    VildaPopulacjaPacjenta: () => state.population,
    getCentileChartHeaderNameState: () => ({ name: state.headerName }),
    getCurrentCentileChartAgeMonths: () => Math.round(Number(fields.age.value) * 12 + Number(fields.ageMonths.value)),
    getCentilePercentileStatsForSource: vi.fn(() => ({ percentile: 45, sd: -0.1, siatka: state.source })),
    collectUserData: writes, vildaPersistFlushNow: writes, debouncedUpdate: writes,
    chartCreatorData: { growth: { free: { height: [{ id: 1, ageMonths: 120, value: 141, txt: 'Fikcyjny komentarz' }] } } },
    MutationObserver: class {
      constructor(callback) { frameObserver = callback; }
      observe() {}
    },
  };
  win.parent = win;
  if (framed) win.frameElement = { hidden: false, isConnected: true, contentWindow: win };
  if (working) {
    win.advancedGrowthData = { measurements: [{ ageMonths: 108, height: 139, weight: 32 }],
      motherHeight: 165, fatherHeight: 180, currentArrowComment: 'Fikcyjny punkt' };
    win.getEffectiveCentileGrowthDataState = () => win.advancedGrowthData;
  }
  loadBrowserScript('vilda_update_hooks.js', win);
  loadBrowserScript('vilda_centile_live_data.js', win);
  return { win, api: win.VildaCentileLiveData, fields, values, state, vault, hooks, writes,
    doc: docEvents, emit: winEvents.emit, frameChanged: () => frameObserver() };
}

describe('Panel nowego pomiaru — odczytowa migawka pacjenta', () => {
  it('czyta aktywną wizytę, jawne źródło, rodziców i kopię adnotacji bez zapisu', async () => {
    const { api, win, fields, state, writes, vault, values } = setup();
    const before = JSON.stringify({ fields, advanced: win.advancedGrowthData, creator: win.chartCreatorData, session: [...values] });
    const snapshot = await api.getSnapshot();
    expect(snapshot).toMatchObject({ patientId: 'fikcyjny-a', ageMonths: 158, exactAgeMonths: 158.2,
      currentHeight: 158, currentWeight: 46, source: 'OLAF', requestedSource: 'OLAF', sex: 'M',
      parents: { motherHeight: 165, fatherHeight: 180 }, professionalMode: true,
      eligibility: { savedPatient: true, choice: 'new', route: 'start', activeDocument: true, under18: true },
      meta: { historySource: 'working', measuredAtISO: '2026-10-23', savedMeasurement: false } });
    expect(snapshot.advanced).toMatchObject({ currentAgeMonths: 158, currentHeight: 158,
      measurements: [{ ageMonths: 108, height: 139, weight: 32 }] });
    expect(win.getCentilePercentileStatsForSource).toHaveBeenCalledWith(158, 'M', 158.2, 'HT', 'OLAF', { population: 'OGOLNA' });
    expect(snapshot.chartCreatorData).toEqual(win.chartCreatorData);
    expect(snapshot.chartCreatorData).not.toBe(win.chartCreatorData);
    expect(Object.isFrozen(snapshot.advanced.measurements)).toBe(true);
    expect(vault.listPatientTimelineEvents).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(JSON.stringify({ fields, advanced: win.advancedGrowthData, creator: win.chartCreatorData, session: [...values] })).toBe(before);
    state.source = 'PALCZEWSKA';
    fields.weight.value = '47,5';
    const next = await api.getSnapshot();
    expect(next.source).toBe('PALCZEWSKA');
    expect(next.currentWeight).toBe(47.5);
    expect(next.patientToken).toBe(snapshot.patientToken);
    expect(snapshot.currentWeight).toBe(46);
    expect(vault.getPatient).toHaveBeenCalledTimes(1);
  });

  it('zachowuje pusty bieżący pomiar i historię; nie zamienia pustych pól w zero', async () => {
    const { api, fields } = setup();
    fields.height.value = '';
    fields.weight.value = '';
    fields.advMotherHeight.value = '';
    const snapshot = await api.getSnapshot();
    expect(snapshot.currentHeight).toBeNull();
    expect(snapshot.currentWeight).toBeNull();
    expect(snapshot.advanced.currentHeight).toBeNull();
    expect(snapshot.parents.motherHeight).toBeNull();
    expect(snapshot.measurements).toHaveLength(1);
  });

  it('świadome [] w working state nie przywraca pomiarów z sejfu', async () => {
    const { api, win, vault } = setup();
    win.advancedGrowthData.measurements = [];
    expect((await api.getSnapshot()).measurements).toEqual([]);
    expect(vault.listPatientTimelineEvents).not.toHaveBeenCalled();
  });

  it('puste basic [] pozostaje autorytatywne także gdy generator zwraca null', async () => {
    const { api, win, vault } = setup({ working: false });
    win.basicGrowthData = { measurements: [] };
    win.getEffectiveCentileGrowthDataState = () => null;
    expect((await api.getSnapshot()).measurements).toEqual([]);
    expect(vault.listPatientTimelineEvents).not.toHaveBeenCalled();
  });

  it('bez working history używa kanonicznych pomiarów timeline, bez notatek ani unionu starych snapshotów', async () => {
    const { api, vault } = setup({ working: false });
    const snapshot = await api.getSnapshot();
    expect(snapshot.measurements).toEqual([{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }]);
    expect(snapshot.meta.historySource).toBe('vault');
    expect(vault.listPatientTimelineEvents).toHaveBeenCalledWith('fikcyjny-a');
  });

  it('sesja ma pierwszeństwo przed cache ID i brak ID nie dziedziczy starego pacjenta', async () => {
    const { api, win, state, values, vault } = setup();
    win._vildaCurrentPatientId = 'obcy-cache';
    values.set('vildaCurrentPatientId', 'fikcyjny-b');
    state.owner = 'fikcyjny-b';
    expect((await api.getSnapshot()).patientId).toBe('fikcyjny-b');
    expect(vault.getPatient).toHaveBeenCalledWith('fikcyjny-b');
    values.delete('vildaCurrentPatientId');
    expect(await api.getSnapshot()).toBeNull();
  });

  it('odrzuca dokładny wiek z innej wizyty i zachowuje new po własnym zapisie', async () => {
    const { api, state, values, fields, hooks } = setup();
    state.exactAge = { totalMonths: 170, exactMonths: 170.6 };
    values.set('vildaDobAgeZapisV1', '1');
    fields.age.value = '17'; fields.ageMonths.value = '11';
    hooks.save({ patientId: 'fikcyjny-a' });
    const snapshot = await api.getSnapshot();
    expect(snapshot.ageMonths).toBe(215);
    expect(snapshot.exactAgeMonths).toBeNull();
    expect(snapshot.meta.savedMeasurement).toBe(true);
    expect(values.get('vildaLoadChoiceV1')).toBe('new');
  });

  it('utrwala tylko obecność nazwiska i istniejący tryb prezentacji dla geometrii starszych adnotacji', async () => {
    const h = setup();
    const professional = await h.api.getSnapshot();
    expect(professional.hasHeaderName).toBe(false);
    expect(professional.standardChartStyle).toBe(false);
    h.state.headerName = 'Wyłącznie Fikcyjne Nazwisko';
    h.win.forceStandardCentileChartStyle = true;
    const forcedStandard = await h.api.getSnapshot();
    expect(forcedStandard.hasHeaderName).toBe(true);
    expect(forcedStandard.standardChartStyle).toBe(true);
    expect(forcedStandard.professionalMode).toBe(true);
    expect(forcedStandard).not.toHaveProperty('headerName');
    expect(JSON.stringify(forcedStandard)).not.toContain(h.state.headerName);
    h.win.forceStandardCentileChartStyle = false;
    h.fields.resultsModeToggle.checked = false;
    h.state.headerName = '';
    const standard = await h.api.getSnapshot();
    expect(standard.standardChartStyle).toBe(true);
    expect(standard.professionalMode).toBe(false);
    expect(standard.hasHeaderName).toBe(false);
    expect(professional.standardChartStyle).toBe(false);
    expect(forcedStandard.hasHeaderName).toBe(true);
    expect(standard.patientToken).toBe(professional.patientToken);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each([
    ['restore', (h) => h.values.set('vildaLoadChoiceV1', 'restore')],
    ['brak wyboru', (h) => h.values.delete('vildaLoadChoiceV1')],
    ['18 lat', (h) => { h.fields.age.value = '18'; h.fields.ageMonths.value = '0'; }],
    ['ujemny wiek', (h) => { h.fields.age.value = '-1'; }],
    ['brak wieku', (h) => { h.fields.age.value = ''; h.fields.ageMonths.value = ''; }],
    ['sejf zablokowany', (h) => { h.state.unlocked = false; }],
    ['nieaktualny dokument', (h) => { h.state.stale = true; }],
    ['inny właściciel', (h) => { h.state.owner = 'fikcyjny-b'; }],
    ['inna trasa', (h) => { h.win.location.pathname = '/klirens.html'; }],
    ['DOB w toku', (h) => { h.state.pending = true; }],
    ['restore w toku', (h) => { h.win.__vildaPersistRestoring = true; }],
    ['clear w toku', (h) => { h.win.__vildaPersistClearUntil = Date.now() + 10000; }],
    ['nieznana sekwencja', (h) => { h.state.sequence = null; }],
  ])('%s nie kwalifikuje i nie czyta rekordu', async (_, change) => {
    const h = setup(); change(h);
    expect(await h.api.getSnapshot()).toBeNull();
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it('ID bez istniejącego zapisanego rekordu nie kwalifikuje', async () => {
    const { api, state } = setup(); state.record = null;
    expect(await api.getSnapshot()).toBeNull();
  });

  it('odpowiedź getPatient dla innego ID nie kwalifikuje', async () => {
    const { api, vault } = setup(); vault.getPatient = async () => patient('fikcyjny-b');
    expect(await api.getSnapshot()).toBeNull();
  });

  it('DocPro korzysta z tego samego jawnego trybu sesji po ponownym uruchomieniu dokumentu', async () => {
    const h = setup(); h.win.location.pathname = '/docpro.html';
    expect((await h.api.getSnapshot()).eligibility.route).toBe('docpro');
    expect(h.values.get('vildaLoadChoiceV1')).toBe('new');
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('rzeczywisty protokół właściciela ramki odrzuca formularz poprzedniej osoby', async () => {
    const h = setup({ framed: true });
    delete h.win.VildaPanelPacjent;
    h.win.parent = { VildaShell: { protokolPanelu: 1 } };
    h.win.VildaDataImportExport.anyDataEntered = () => true;
    loadBrowserScript('vilda_panel_pacjent.js', h.win);
    const first = await h.api.getSnapshot();
    expect(first.patientId).toBe('fikcyjny-a');
    h.values.set('vildaCurrentPatientId', 'fikcyjny-b');
    expect(h.win.VildaPanelPacjent.nieaktualny()).toBe(true);
    expect(h.api.isCurrent(first)).toBe(false);
    expect(await h.api.getSnapshot()).toBeNull();
    h.doc.emit('vilda:patient-loaded', { patientId: 'fikcyjny-b' });
    expect(h.win.VildaPanelPacjent.wlasciciel()).toBe('fikcyjny-b');
    expect((await h.api.getSnapshot()).patientId).toBe('fikcyjny-b');
  });

  it('czyta rzeczywisty zapisany rekord i timeline sejfu w pamięci bez tworzenia nowego snapshotu', async () => {
    const h = setup({ working: false });
    const local = new Map();
    Object.assign(h.win, { crypto: globalThis.crypto, TextEncoder, TextDecoder,
      atob: globalThis.atob, btoa: globalThis.btoa,
      localStorage: { getItem: (key) => local.get(key) ?? null,
        setItem: (key, value) => local.set(key, String(value)), removeItem: (key) => local.delete(key) },
      setTimeout, clearTimeout });
    loadBrowserScript('vilda_crypto.js', h.win);
    loadBrowserScript('vilda_tempo_wzrastania.js', h.win);
    loadBrowserScript('vilda_vault.js', h.win);
    const vault = h.win.VildaVault;
    vault.setStorageAdapter(vault.createInMemoryAdapter());
    await vault.createUser('Fikcyjny#Adapter2026!aa', { label: 'fikcyjne-testy', iterations: 10000 });
    const result = await vault.savePatient(patient().snapshots[0].payload, { dedup: false });
    h.values.set('vildaCurrentPatientId', result.patientId);
    h.state.owner = result.patientId;
    const before = await vault.getPatient(result.patientId);
    h.writes.mockClear(); // createUser establishes its synthetic session before the observed read.
    const snapshot = await h.api.getSnapshot();
    expect(snapshot.patientId).toBe(result.patientId);
    expect(snapshot.measurements).toMatchObject([{ ageMonths: 108, height: 139, weight: 32 }]);
    expect(snapshot.meta.historySource).toBe('vault');
    const after = await vault.getPatient(result.patientId);
    expect(after.snapshots).toEqual(before.snapshots);
    expect(after.snapshotCount).toBe(before.snapshotCount);
    expect(h.writes).not.toHaveBeenCalled();
    vault.lock();
    expect(h.api.isCurrent(snapshot)).toBe(false);
    expect(await h.api.getSnapshot()).toBeNull();
  });
});

describe('Panel nowego pomiaru — odrzucanie spóźnionych odczytów', () => {
  it.each([
    ['pacjent', (h) => { h.values.set('vildaCurrentPatientId', 'fikcyjny-b'); }],
    ['początek apply', (h) => { h.state.sequence += 1; }],
    ['lock', (h) => { h.state.unlocked = false; h.hooks.lock(); }],
    ['clear', (h) => { h.emit('vilda:user-state-cleared'); }],
    ['ukryta ramka', (h) => { h.win.frameElement.hidden = true; h.frameChanged(); }],
    ['obcy właściciel', (h) => { h.state.stale = true; }],
  ])('%s unieważnia trwający odczyt przed publikacją', async (_, change) => {
    const h = setup({ framed: true }), pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const request = h.api.getSnapshot();
    await Promise.resolve();
    change(h);
    pending.resolve(patient());
    expect(await request).toBeNull();
  });

  it('token i DOM mogą zostać unieważnione synchronicznie przed następnym await', async () => {
    const h = setup({ framed: true });
    const snapshot = await h.api.getSnapshot();
    const listener = vi.fn(); h.api.subscribe(listener);
    h.state.sequence += 1;
    expect(h.api.isCurrent(snapshot)).toBe(false);
    h.state.sequence -= 1;
    h.win.frameElement.hidden = true;
    expect(h.api.isCurrent(snapshot.patientToken)).toBe(false);
    h.frameChanged();
    expect(listener).toHaveBeenCalledWith({ reason: 'frame-visibility', identityChanged: true });
    h.win.frameElement.hidden = false;
    expect(h.api.isCurrent(snapshot)).toBe(false);
  });

  it('A → B → A oraz hide → show nie ożywiają wcześniejszego żądania', async () => {
    const h = setup({ framed: true }), pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const request = h.api.getSnapshot(); await Promise.resolve();
    h.values.set('vildaCurrentPatientId', 'fikcyjny-b');
    h.emit('storage', { key: 'vildaCurrentPatientId' });
    h.values.set('vildaCurrentPatientId', 'fikcyjny-a');
    h.emit('storage', { key: 'vildaCurrentPatientId' });
    h.win.frameElement.hidden = true; h.frameChanged();
    h.win.frameElement.hidden = false; h.frameChanged();
    pending.resolve(patient());
    expect(await request).toBeNull();
    expect(await h.api.getSnapshot()).not.toBeNull();
  });

  it('odczyt timeline po blokadzie nie publikuje historii', async () => {
    const h = setup({ working: false }), pending = deferred();
    h.vault.listPatientTimelineEvents = () => pending.promise;
    const request = h.api.getSnapshot();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    h.state.unlocked = false; h.hooks.lock();
    pending.resolve([{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }]);
    expect(await request).toBeNull();
  });

  it('nowszy zapis tego pacjenta odrzuca wcześniejszą odpowiedź, lecz zachowuje token', async () => {
    const h = setup(), pending = deferred();
    const first = await h.api.getSnapshot();
    h.hooks.save({ patientId: 'fikcyjny-a' });
    h.vault.getPatient = () => pending.promise;
    const older = h.api.getSnapshot(); await Promise.resolve();
    h.hooks.save({ patientId: 'fikcyjny-a' });
    h.vault.getPatient = async () => patient();
    const newer = await h.api.getSnapshot();
    pending.resolve(patient());
    expect(await older).toBeNull();
    expect(newer.patientToken).toBe(first.patientToken);
  });

  it('źródło, rodzice i zapis Kreatora zgłaszają zmianę widoku bez zmiany tokenu ani zapisów', async () => {
    const h = setup();
    const first = await h.api.getSnapshot(), callback = vi.fn();
    const unsubscribe = h.api.subscribe(callback);
    h.state.source = 'PALCZEWSKA'; h.doc.emit('change');
    h.fields.advFatherHeight.value = '182'; h.doc.emit('input');
    h.win.chartCreatorData.growth.free.height[0].txt = 'Nowa fikcyjna treść';
    h.doc.emit('vilda:centile-creator-changed');
    expect(h.api.isCurrent(first.patientToken)).toBe(true);
    const next = await h.api.getSnapshot();
    expect(next.patientToken).toBe(first.patientToken);
    expect(next.parents.fatherHeight).toBe(182);
    expect(next.source).toBe('PALCZEWSKA');
    expect(next.chartCreatorData.growth.free.height[0].txt).toBe('Nowa fikcyjna treść');
    expect(first.chartCreatorData.growth.free.height[0].txt).toBe('Fikcyjny komentarz');
    expect(callback).toHaveBeenCalledTimes(3);
    expect(h.writes).not.toHaveBeenCalled();
    unsubscribe(); h.doc.emit('change');
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('hook po rzeczywistym update obserwuje wynik poprzednich obliczeń bez nowego przeliczenia', async () => {
    const h = setup();
    const first = await h.api.getSnapshot();
    h.win.VildaUpdateHooks.registerAfterUpdateHook('fikcyjne-obliczenie', () => {
      h.win.advancedGrowthData.measurements = [{ ageMonths: 120, height: 142, weight: 34 }];
    }, { order: 80 });
    const observations = [];
    h.api.subscribe((event) => observations.push({ reason: event.reason,
      height: h.win.advancedGrowthData.measurements[0].height }));
    h.win.VildaUpdateHooks.runAfterUpdateHooks({}, { source: 'fikcyjny-update' });
    expect(observations).toEqual([{ reason: 'after-update', height: 142 }]);
    const next = await h.api.getSnapshot();
    expect(next.measurements[0].height).toBe(142);
    expect(next.patientToken).toBe(first.patientToken);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('usunięcie ostatniego wiersza historii odświeża widok bez nowej tożsamości', async () => {
    const h = setup(), callback = vi.fn();
    const first = await h.api.getSnapshot(); h.api.subscribe(callback);
    h.win.advancedGrowthData.measurements = [];
    h.doc.emit('click', { target: { closest: () => ({ id: 'advMeasurements' }) } });
    expect(callback).toHaveBeenCalledWith({ reason: 'history-edit', identityChanged: false });
    const next = await h.api.getSnapshot();
    expect(next.measurements).toEqual([]);
    expect(next.patientToken).toBe(first.patientToken);
    expect(h.vault.listPatientTimelineEvents).not.toHaveBeenCalled();
  });

  it('asynchroniczna zmiana źródła pacjenta odświeża odczyt bez zapisu i bez nowego tokenu', async () => {
    const h = setup(), callback = vi.fn();
    const first = await h.api.getSnapshot(); h.api.subscribe(callback);
    h.doc.emit('vilda:zrodlo-pacjenta-zmienione');
    expect(callback).toHaveBeenCalledWith({ reason: 'vilda:zrodlo-pacjenta-zmienione', identityChanged: false });
    expect(h.api.isCurrent(first)).toBe(true);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('utrwala populację z istniejącego API i podaje ją jawnie statystykom bieżącego punktu', async () => {
    const h = setup();
    const first = await h.api.getSnapshot();
    h.state.population = 'DS';
    h.doc.emit('vilda:zrodlo-pacjenta-zmienione');
    const next = await h.api.getSnapshot();
    expect(first.population).toBe('OGOLNA');
    expect(next.population).toBe('DS');
    expect(h.win.getCentilePercentileStatsForSource).toHaveBeenLastCalledWith(158, 'M', 158.2, 'HT', 'OLAF', { population: 'DS' });
    expect(next.patientToken).toBe(first.patientToken);
    expect(h.writes).not.toHaveBeenCalled();
  });
});
