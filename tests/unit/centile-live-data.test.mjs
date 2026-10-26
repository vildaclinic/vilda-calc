import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Fikcyjni pacjenci i odroczone odczyty; wykonujemy rzeczywisty moduł adaptera.
function events() {
  const handlers = new Map();
  return {
    addEventListener(type, callback, options) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add({ callback, capture: options === true || !!(options && options.capture) });
    },
    emit(type, detail = {}) {
      const ordered = [...handlers.get(type) || []].sort((a, b) => Number(b.capture) - Number(a.capture));
      for (const { callback } of ordered) callback({ type, detail, ...detail });
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

function setup({ working = true, framed = false, nestedSourceOnSave = false, startup = false, initialNoPatient = false } = {}) {
  const values = new Map([['vildaCurrentPatientId', 'fikcyjny-a'], ['vildaLoadChoiceV1', 'new']]);
  if (initialNoPatient) values.delete('vildaCurrentPatientId');
  const writes = vi.fn();
  const fields = Object.fromEntries(Object.entries({
    age: '13', ageMonths: '2', height: '158', weight: '46', sex: 'M',
    advMotherHeight: '165', advFatherHeight: '180', resultsModeToggle: '',
  }).map(([id, value]) => [id, { id, value, checked: id === 'resultsModeToggle' }]));
  const docEvents = events(), winEvents = events();
  const hooks = {};
  const state = { sequence: 4, unlocked: true, stale: false, pending: false, panelVisible: true, source: 'OLAF', population: 'OGOLNA', headerName: '',
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
      documentElement: { classList: { contains: name => name === 'vilda-centile-live-active' && state.panelVisible } },
      querySelector: () => ({ value: state.source }) },
    VildaVault: vault,
    VildaDataImportExport: { getApplyLoadedDataSequence: () => state.sequence,
      isMainSessionRestorePending: () => !!state.mainSessionRestorePending },
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
  if (nestedSourceOnSave) docEvents.addEventListener('vilda:patient-loaded', event => {
    if (event.detail.source !== 'save') return;
    state.pending = true;
    docEvents.emit('vilda:zrodlo-pacjenta-zmienione');
  });
  const frames = [];
  if (startup) {
    win.document.readyState = 'interactive';
    win.VildaInit = { isInitialized: () => !!state.restoreRegistered };
    win.VildaAuthUI = { isBootReady: () => !!state.authBootReady };
    win.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  }
  loadBrowserScript('vilda_update_hooks.js', win);
  loadBrowserScript('vilda_centile_live_data.js', win);
  return { win, api: win.VildaCentileLiveData, fields, values, state, vault, hooks, writes,
    doc: docEvents, emit: winEvents.emit, frameChanged: () => frameObserver(),
    frame: () => { const pending = frames.splice(0); pending.forEach(callback => callback()); } };
}

function focusMeasurement(h, id) {
  h.win.document.activeElement = h.fields[id];
  h.doc.emit('focusin', { target: h.fields[id] });
}

function typeMeasurement(h, id, value) {
  h.fields[id].value = value;
  h.doc.emit('input', { target: h.fields[id] });
}

function blurMeasurement(h, id) {
  h.win.document.activeElement = null;
  h.doc.emit('blur', { target: h.fields[id] });
  h.doc.emit('focusout', { target: h.fields[id] });
}

function enterMeasurement(h, id, overrides = {}) {
  const preventDefault = vi.fn();
  h.doc.emit('keydown', { target: h.fields[id], key: 'Enter', preventDefault, ...overrides });
  return preventDefault;
}

describe('Panel nowego pomiaru — zatwierdzenie pola po blur lub Enter', () => {
  it.each(['/index.html', '/docpro.html'])('%s zatrzymuje całą gotową migawkę podczas 1 → 18 → 189 i after-update', async (route) => {
    const h = setup(); h.win.location.pathname = route;
    const before = await h.api.getSnapshot();
    focusMeasurement(h, 'height');
    for (const value of ['1', '18', '189']) {
      typeMeasurement(h, 'height', value);
      // Normalne obliczenia nie są zatrzymywane: zmieniają pochodne working growth.
      h.win.advancedGrowthData.growthVelocity = Number(value) - 139;
      h.win.advancedGrowthData.tempo = { result: value };
      h.win.VildaUpdateHooks.runAfterUpdateHooks({}, { source: 'fikcyjny-input' });
      expect(await h.api.getSnapshot()).toBe(before);
    }
    blurMeasurement(h, 'height');
    const after = await h.api.getSnapshot();
    expect(after.currentHeight).toBe(189);
    expect(after.advanced.currentHeight).toBe(189);
    expect(after.currentWeight).toBe(46);
    expect(after.advanced.growthVelocity).toBe(50);
    expect(after.patientToken).toBe(before.patientToken);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('Enter zatwierdza jedno pole, zachowuje fokus, a dalsze wpisywanie znowu czeka', async () => {
    const h = setup(); await h.api.getSnapshot();
    focusMeasurement(h, 'weight'); typeMeasurement(h, 'weight', '47,5');
    expect(enterMeasurement(h, 'weight')).toHaveBeenCalledOnce();
    const firstCommit = await h.api.getSnapshot();
    expect(firstCommit.currentWeight).toBe(47.5);
    expect(firstCommit.currentHeight).toBe(158);
    expect(h.win.document.activeElement).toBe(h.fields.weight);
    typeMeasurement(h, 'weight', '48');
    expect(await h.api.getSnapshot()).toBe(firstCommit);
    blurMeasurement(h, 'weight');
    expect((await h.api.getSnapshot()).currentWeight).toBe(48);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'Tab'])('%s nie gubi zatwierdzenia, gdy następny draft wyprzedzi odświeżenie', async (method) => {
    const h = setup(); await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    if (method === 'Enter') {
      enterMeasurement(h, 'height');
      typeMeasurement(h, 'height', '1890');
    } else {
      blurMeasurement(h, 'height'); focusMeasurement(h, 'weight');
      typeMeasurement(h, 'weight', '4');
    }
    const accepted = await h.api.getSnapshot();
    expect(accepted.currentHeight).toBe(189);
    expect(accepted.currentWeight).toBe(46);
    expect(await h.api.getSnapshot()).toBe(accepted);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('zatwierdzony stan czeka na pierwszy odczyt rekordu mimo kolejnego draftu', async () => {
    const h = setup(), pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const old = h.api.getSnapshot(); await Promise.resolve();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    enterMeasurement(h, 'height');
    const accepted = h.api.getSnapshot();
    typeMeasurement(h, 'height', '1890');
    pending.resolve(patient());
    expect(await old).toBeNull();
    expect((await accepted).currentHeight).toBe(189);
    expect((await h.api.getSnapshot()).currentHeight).toBe(189);
  });

  it('równoległe odczyty tego samego zatwierdzenia oba pozostają gotowe po zakończeniu rekordu', async () => {
    const h = setup(), pending = deferred();
    h.vault.getPatient = () => pending.promise;
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189'); enterMeasurement(h, 'height');
    const older = h.api.getSnapshot(), newest = h.api.getSnapshot();
    typeMeasurement(h, 'height', '1890');
    pending.resolve(patient());
    const first = await older, second = await newest;
    expect(first.currentHeight).toBe(189);
    expect(second.currentHeight).toBe(189);
    expect(second.patientToken).toBe(first.patientToken);
    expect(await h.api.getSnapshot()).toBe(second);
  });

  it.each(['rekord', 'timeline'])('spóźniony %s sprzed Enter nie usuwa istniejącej karty przed następnym odświeżeniem', async (kind) => {
    const h = setup({ working: kind === 'rekord' }), before = await h.api.getSnapshot(), pending = deferred();
    const method = kind === 'rekord' ? 'getPatient' : 'listPatientTimelineEvents';
    h.vault[method] = () => pending.promise;
    h.doc.emit('vilda:auth-hidden');
    const old = h.api.getSnapshot();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189'); enterMeasurement(h, 'height');
    pending.resolve(kind === 'rekord' ? patient() : [{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }]);
    expect(await old).toBe(before);
    expect((await h.api.getSnapshot()).currentHeight).toBe(189);
  });

  it('Enter bez widocznej karty zatwierdza RAM, lecz nie przejmuje natywnego Done', async () => {
    const h = setup(); h.state.panelVisible = false;
    await h.api.getSnapshot(); focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    expect(enterMeasurement(h, 'height')).not.toHaveBeenCalled();
    expect((await h.api.getSnapshot()).currentHeight).toBe(189);
  });

  it.each(['change', 'vilda:zrodlo-pacjenta-zmienione', 'vilda:centile-creator-changed'])('%s po blur wyprzedza render i nadal aktualizuje zatwierdzony podgląd', async (event) => {
    const h = setup(); await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189'); blurMeasurement(h, 'height');
    h.state.source = 'PALCZEWSKA';
    h.win.chartCreatorData.growth.free.height[0].txt = 'Nowy fikcyjny komentarz';
    h.doc.emit(event);
    const after = await h.api.getSnapshot();
    expect(after.source).toBe('PALCZEWSKA');
    expect(after.currentHeight).toBe(189);
    expect(after.chartCreatorData.growth.free.height[0].txt).toBe('Nowy fikcyjny komentarz');
  });

  it('after-update po Enter przyjmuje gotowe pochodne, ale nie odczytuje następnego draftu', async () => {
    const h = setup(); await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189'); enterMeasurement(h, 'height');
    h.win.advancedGrowthData.growthVelocity = 50;
    h.win.VildaUpdateHooks.runAfterUpdateHooks({}, { source: 'fikcyjny-final-update' });
    typeMeasurement(h, 'height', '1890');
    h.win.advancedGrowthData.growthVelocity = 1751;
    h.win.VildaUpdateHooks.runAfterUpdateHooks({}, { source: 'fikcyjny-next-input' });
    const after = await h.api.getSnapshot();
    expect(after.currentHeight).toBe(189);
    expect(after.advanced.growthVelocity).toBe(50);
  });

  it.each(['', 'abc', '-2'])('zatwierdzenie %j zachowuje istniejącą semantykę braku dodatniej wartości', async (value) => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', value);
    expect(await h.api.getSnapshot()).toBe(before);
    blurMeasurement(h, 'height');
    const after = await h.api.getSnapshot();
    expect(after.currentHeight).toBeNull();
    expect(after.advanced.currentHeight).toBeNull();
    expect(after.measurements).toEqual(before.measurements);
  });

  it('przejście z wagi do wzrostu zatwierdza wagę i osobno zatrzymuje wzrost', async () => {
    const h = setup(); await h.api.getSnapshot();
    focusMeasurement(h, 'weight'); typeMeasurement(h, 'weight', '47');
    blurMeasurement(h, 'weight'); focusMeasurement(h, 'height');
    const afterWeight = await h.api.getSnapshot();
    expect(afterWeight.currentWeight).toBe(47);
    typeMeasurement(h, 'height', '1');
    expect(await h.api.getSnapshot()).toBe(afterWeight);
    enterMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(1); // Bez nowego progu klinicznego.
  });

  it('focus bez pisania nie blokuje pierwszej migawki ani aktualizacji programowych poza edycją', async () => {
    const h = setup(); focusMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(158);
    blurMeasurement(h, 'height');
    h.fields.height.value = '160'; h.doc.emit('input', { target: h.fields.height });
    expect((await h.api.getSnapshot()).currentHeight).toBe(160);
    h.fields.advFatherHeight.value = '183'; h.doc.emit('input', { target: h.fields.advFatherHeight });
    expect((await h.api.getSnapshot()).parents.fatherHeight).toBe(183);
  });

  it.each(['rekord', 'timeline'])('pierwszy odczyt %s rozpoczęty przed edycją nie publikuje roboczej cyfry', async (kind) => {
    const h = setup({ working: kind === 'rekord' }), pending = deferred();
    const method = kind === 'rekord' ? 'getPatient' : 'listPatientTimelineEvents';
    h.vault[method] = vi.fn(() => pending.promise);
    const request = h.api.getSnapshot();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '1');
    pending.resolve(kind === 'rekord' ? patient() : [{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }]);
    expect(await request).toBeNull();
    expect(await h.api.getSnapshot()).toBeNull();
    typeMeasurement(h, 'height', '189'); blurMeasurement(h, 'height');
    const committed = await h.api.getSnapshot();
    expect(committed.currentHeight).toBe(189);
    expect(committed.measurements).toHaveLength(1);
  });

  it('puste początkowe pole zachowuje historię bez punktu do końca edycji', async () => {
    const h = setup(); h.fields.height.value = '';
    const before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '1');
    expect(await h.api.getSnapshot()).toBe(before);
    expect(before.currentHeight).toBeNull();
    typeMeasurement(h, 'height', '189'); enterMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(189);
  });

  it('kompozycja i przytrzymany Enter nie zatwierdzają roboczej liczby', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    expect(enterMeasurement(h, 'height', { isComposing: true })).not.toHaveBeenCalled();
    expect(await h.api.getSnapshot()).toBe(before);
    expect(enterMeasurement(h, 'height', { keyCode: 229 })).not.toHaveBeenCalled();
    expect(await h.api.getSnapshot()).toBe(before);
    enterMeasurement(h, 'height', { repeat: true });
    expect(await h.api.getSnapshot()).toBe(before);
    expect(enterMeasurement(h, 'advFatherHeight')).not.toHaveBeenCalled();
    enterMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(189);
  });

  it('powtórzony focusin tego samego pola nie zatwierdza jego roboczej wartości', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '1');
    focusMeasurement(h, 'height');
    expect(await h.api.getSnapshot()).toBe(before);
    blurMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(1);
  });

  it('źródło i historia odświeżają się po zatwierdzeniu bez mutacji poprzedniej migawki', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    h.state.source = 'PALCZEWSKA';
    h.win.advancedGrowthData.measurements = [];
    h.doc.emit('vilda:zrodlo-pacjenta-zmienione');
    expect(await h.api.getSnapshot()).toBe(before);
    blurMeasurement(h, 'height');
    const after = await h.api.getSnapshot();
    expect(after.source).toBe('PALCZEWSKA');
    expect(after.measurements).toEqual([]);
    expect(before.source).toBe('OLAF');
    expect(before.measurements).toHaveLength(1);
  });

  it.each([
    ['pacjent', h => { h.values.set('vildaCurrentPatientId', 'fikcyjny-b'); h.state.owner = 'fikcyjny-b'; }],
    ['apply', h => { h.state.sequence++; }],
    ['restore', h => { h.doc.emit('vilda:state-restored'); }],
    ['clear', h => { h.doc.emit('vilda:user-state-cleared'); }],
    ['lock/unlock', h => { h.state.unlocked = false; h.hooks.lock(); h.state.unlocked = true; h.hooks.unlock(); }],
    ['hide/show', h => { h.win.frameElement.hidden = true; h.frameChanged(); h.win.frameElement.hidden = false; h.frameChanged(); }],
  ])('%s usuwa zatrzymaną migawkę i stan edytowanego pola', async (_, reset) => {
    const h = setup({ framed: true }), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '1');
    expect(await h.api.getSnapshot()).toBe(before);
    reset(h); h.fields.height.value = '170';
    const after = await h.api.getSnapshot();
    expect(after).not.toBeNull();
    expect(after.patientToken).not.toBe(before.patientToken);
    expect(after.currentHeight).toBe(170);
    blurMeasurement(h, 'height');
    expect((await h.api.getSnapshot()).currentHeight).toBe(170);
  });

  it('blokada podczas edycji odrzuca stary token i nie zwraca zatrzymanej migawki', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '1');
    h.state.unlocked = false; h.hooks.lock();
    expect(h.api.isCurrent(before)).toBe(false);
    expect(await h.api.getSnapshot()).toBeNull();
    expect(enterMeasurement(h, 'height')).not.toHaveBeenCalled();
  });

  it('potwierdzenie zapisu z oczekującym DOB zachowuje hold, potem kończy odświeżenie po blur', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    h.state.pending = true;
    h.doc.emit('vilda:patient-loaded', { source: 'save', patientId: 'fikcyjny-a', applySequence: h.state.sequence });
    expect(h.api.isCurrent(before)).toBe(true);
    expect(await h.api.getSnapshot()).toBeNull();
    h.state.pending = false; h.doc.emit('vilda:dob-restored');
    expect(await h.api.getSnapshot()).toBe(before);
    blurMeasurement(h, 'height');
    const after = await h.api.getSnapshot();
    expect(after.currentHeight).toBe(189);
    expect(after.patientToken).toBe(before.patientToken);
    expect(h.api.getRefreshState(after)).toBeNull();
    expect(h.writes).not.toHaveBeenCalled();
  });
});

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
    ['rekord', '__vildaLustroWpis'], ['rekord', '__vildaPersistRestoring'],
    ['timeline', '__vildaLustroWpis'], ['timeline', '__vildaPersistRestoring'],
  ])('chwilowa flaga %s / %s nie zatruwa kolejnego odczytu', async (kind, flag) => {
    const h = setup({ working: kind === 'rekord' }), pending = deferred();
    const method = kind === 'rekord' ? 'getPatient' : 'listPatientTimelineEvents';
    const result = kind === 'rekord' ? patient()
      : [{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }];
    h.vault[method] = vi.fn(() => pending.promise);
    const first = h.api.getSnapshot();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(h.vault[method]).toHaveBeenCalledTimes(1);
    h.win[flag] = true;
    pending.resolve(result);
    expect(await first).toBeNull();
    h.win[flag] = false;
    h.vault[method].mockResolvedValue(result);
    const retry = await h.api.getSnapshot();
    expect(retry).not.toBeNull();
    expect(retry.measurements).toHaveLength(1);
    expect(h.vault[method]).toHaveBeenCalledTimes(2);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each(['rekord', 'timeline'])('odmowa odczytu %s pozwala ponowić próbę w tym samym kontekście', async (kind) => {
    const h = setup({ working: kind === 'rekord' });
    const method = kind === 'rekord' ? 'getPatient' : 'listPatientTimelineEvents';
    const result = kind === 'rekord' ? patient()
      : [{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }];
    h.vault[method] = vi.fn().mockRejectedValueOnce(new Error('Fikcyjna chwilowa odmowa')).mockResolvedValue(result);
    expect(await h.api.getSnapshot()).toBeNull();
    expect(await h.api.getSnapshot()).not.toBeNull();
    expect(h.vault[method]).toHaveBeenCalledTimes(2);
  });

  it.each(['rekord', 'timeline'])('stary odrzucony %s nie usuwa nowszego oczekującego żądania z cache', async (kind) => {
    const h = setup({ working: kind === 'rekord' });
    const older = deferred(), newer = deferred();
    const method = kind === 'rekord' ? 'getPatient' : 'listPatientTimelineEvents';
    const result = kind === 'rekord' ? patient()
      : [{ type: 'measurement', ageMonths: 120, height: 141, weight: 33 }];
    h.vault[method] = vi.fn().mockReturnValueOnce(older.promise).mockReturnValue(newer.promise);
    const first = h.api.getSnapshot();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    expect(h.vault[method]).toHaveBeenCalledTimes(1);
    h.doc.emit('vilda:auth-hidden');
    const second = h.api.getSnapshot();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    expect(h.vault[method]).toHaveBeenCalledTimes(2);
    older.resolve(null);
    expect(await first).toBeNull();
    const third = h.api.getSnapshot();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    expect(h.vault[method]).toHaveBeenCalledTimes(2);
    newer.resolve(result);
    const secondSnapshot = await second, thirdSnapshot = await third;
    expect(secondSnapshot).not.toBeNull();
    expect(thirdSnapshot).not.toBeNull();
    expect(thirdSnapshot.patientToken).toBe(secondSnapshot.patientToken);
    expect(h.writes).not.toHaveBeenCalled();
  });

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

describe('Panel nowego pomiaru — zapis nie zmienia właściciela wykresu', () => {
  const saved = (h, overrides = {}) => h.doc.emit('vilda:patient-loaded', {
    source: 'save', patientId: 'fikcyjny-a', applySequence: h.state.sequence, ...overrides,
  });

  it('uzbraja zachowanie widoku przed zagnieżdżoną zmianą źródła wcześniejszego listenera zapisu', async () => {
    const h = setup({ nestedSourceOnSave: true }), before = await h.api.getSnapshot();
    const observed = [];
    h.api.subscribe(event => observed.push({ reason: event.reason, current: h.api.isCurrent(before),
      refresh: h.api.getRefreshState(before), pending: h.state.pending }));
    saved(h);
    expect(observed).toEqual([
      { reason: 'vilda:zrodlo-pacjenta-zmienione', current: true, refresh: 'pending', pending: true },
      { reason: 'patient-loaded', current: true, refresh: 'pending', pending: true },
    ]);
    expect(await h.api.getSnapshot()).toBeNull();
    h.state.pending = false; h.doc.emit('vilda:dob-restored');
    expect((await h.api.getSnapshot()).patientToken).toBe(before.patientToken);
  });

  it('zachowuje narysowaną wizytę podczas przyjmowania DOB, lecz nie publikuje niegotowej migawki', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    h.state.pending = true;
    saved(h);
    expect(h.api.isCurrent(before)).toBe(true);
    expect(h.api.getRefreshState(before)).toBe('pending');
    expect(await h.api.getSnapshot()).toBeNull();
    expect(h.vault.getPatient).toHaveBeenCalledTimes(1);
    h.state.pending = false;
    h.state.source = 'PALCZEWSKA'; h.fields.height.value = '159';
    h.doc.emit('vilda:dob-restored');
    const after = await h.api.getSnapshot();
    expect(after.patientToken).toBe(before.patientToken);
    expect(after.currentHeight).toBe(159);
    expect(after.source).toBe('PALCZEWSKA');
    expect(before.currentHeight).toBe(158);
    expect(h.api.getRefreshState(after)).toBeNull();
    expect(h.writes).not.toHaveBeenCalled();
    // Przyjęcie zakończone: kolejny zwykły restore nie dziedziczy wyjątku zapisu.
    h.state.pending = true;
    expect(h.api.isCurrent(after)).toBe(false);
  });

  it.each([
    ['brak potwierdzenia', null],
    ['inny pacjent', { patientId: 'fikcyjny-b' }],
    ['inna operacja', { applySequence: 99 }],
    ['brak operacji', { applySequence: undefined }],
    ['wczytanie zamiast zapisu', { source: 'pick' }],
  ])('%s nie pozwala ominąć oczekującego DOB', async (_, detail) => {
    const h = setup(), before = await h.api.getSnapshot();
    h.state.pending = true;
    if (detail) saved(h, detail);
    expect(h.api.isCurrent(before)).toBe(false);
    expect(h.api.getRefreshState(before)).toBeNull();
    expect(await h.api.getSnapshot()).toBeNull();
  });

  it.each([
    ['inny ID', h => { h.values.set('vildaCurrentPatientId', 'fikcyjny-b'); }],
    ['nowy apply', h => { h.state.sequence++; }],
    ['blokada', h => { h.state.unlocked = false; h.hooks.lock(); }],
    ['usunięcie', h => { h.hooks.remove({ patientId: 'fikcyjny-a' }); }],
    ['wyczyszczenie', h => { h.emit('vilda:user-state-cleared'); }],
    ['odtworzenie', h => { h.values.set('vildaLoadChoiceV1', 'restore'); }],
    ['pełnoletność', h => { h.fields.age.value = '18'; h.fields.ageMonths.value = '0'; }],
    ['inna strona', h => { h.win.location.pathname = '/terminarz.html'; }],
    ['ukryta ramka', h => { h.win.frameElement.hidden = true; h.frameChanged(); }],
    ['nieaktualny panel', h => { h.state.stale = true; }],
    ['obcy właściciel panelu', h => { h.state.owner = 'fikcyjny-b'; }],
    ['odtwarzanie persistence', h => { h.win.__vildaPersistRestoring = true; }],
    ['zapis lustra', h => { h.win.__vildaLustroWpis = true; }],
    ['zapora clear', h => { h.win.__vildaPersistClearUntil = Date.now() + 10000; }],
  ])('%s natychmiast unieważnia także rysunek czekający na odświeżenie po zapisie', async (_, change) => {
    const h = setup({ framed: true }), before = await h.api.getSnapshot();
    h.state.pending = true; saved(h);
    expect(h.api.isCurrent(before)).toBe(true);
    change(h);
    expect(h.api.isCurrent(before)).toBe(false);
    expect(h.api.getRefreshState(before)).toBeNull();
    expect(await h.api.getSnapshot()).toBeNull();
  });

  it('błąd aktualnego odczytu kończy oczekiwanie i pozwala ponowić odświeżenie', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    saved(h);
    h.vault.getPatient.mockRejectedValueOnce(new Error('Fikcyjna odmowa odczytu'));
    expect(await h.api.getSnapshot()).toBeNull();
    expect(h.api.isCurrent(before)).toBe(true);
    expect(h.api.getRefreshState(before)).toBe('error');
    const after = await h.api.getSnapshot();
    expect(after.patientToken).toBe(before.patientToken);
    expect(h.api.getRefreshState(after)).toBeNull();
  });

  it('starsza odpowiedź odrzucona przez kolejny zapis nie kończy nowszego odświeżenia', async () => {
    const h = setup(), before = await h.api.getSnapshot(), older = deferred();
    h.hooks.save({ patientId: 'fikcyjny-a' });
    h.vault.getPatient.mockReturnValueOnce(older.promise);
    const request = h.api.getSnapshot();
    await Promise.resolve();
    h.state.pending = true; saved(h);
    older.resolve(null);
    expect(await request).toBeNull();
    expect(h.api.getRefreshState(before)).toBe('pending');
    h.state.pending = false; h.doc.emit('vilda:dob-restored');
    const after = await h.api.getSnapshot();
    expect(after.patientToken).toBe(before.patientToken);
    expect(h.api.getRefreshState(after)).toBeNull();
  });
});


describe('Panel nowego pomiaru — jawny stan miejsca siatki', () => {
  it('gość bez wybranego pacjenta nie rezerwuje siatki podczas startu ani oczekiwania na logowanie', async () => {
    const h = setup({ startup: true, initialNoPatient: true });
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    h.state.restoreRegistered = true;
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    h.frame(); h.frame();
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each([
    ['deferred session', h => { h.state.mainSessionRestorePending = true; }],
    ['restore', h => { h.win.__vildaPersistRestoring = true; }],
    ['mirror', h => { h.win.__vildaLustroWpis = true; }],
    ['clear grace', h => { h.win.__vildaPersistClearUntil = Date.now() + 10000; }],
    ['DOB', h => { h.state.pending = true; }],
  ])('gość nigdy niewybierający pacjenta nie rezerwuje siatki również podczas %s', async (_, change) => {
    const h = setup({ startup: true, initialNoPatient: true });
    change(h);
    h.win.VildaDobAge.restorePending = vi.fn(() => h.state.pending);
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(h.win.VildaDobAge.restorePending).not.toHaveBeenCalled();
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('pierwszy wybór pacjenta kończy stan gościa i chroni późniejsze przejściowe zniknięcie ID', async () => {
    const h = setup({ initialNoPatient: true });
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    h.values.set('vildaCurrentPatientId', 'fikcyjny-a');
    const result = await h.api.getResult();
    expect(result.status).toBe('ready');
    h.win.__vildaLustroWpis = true;
    h.values.delete('vildaCurrentPatientId');
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'restoring' });
    expect(h.api.isCurrent(result.snapshot)).toBe(false);
    expect((await h.api.getResult()).status).toBe('pending');
    h.win.__vildaLustroWpis = false;
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each([
    ['restore', h => { h.win.__vildaPersistRestoring = true; }],
    ['mirror', h => { h.win.__vildaLustroWpis = true; }],
    ['clear grace', h => { h.win.__vildaPersistClearUntil = Date.now() + 10000; }],
    ['DOB', h => { h.state.pending = true; }],
  ])('chwilowy brak ID podczas %s nie zostaje uznany za gościa przy starcie', async (_, change) => {
    const h = setup({ startup: true });
    h.values.delete('vildaCurrentPatientId');
    change(h);
    expect(h.api.getEligibility().status).toBe('pending');
    expect((await h.api.getResult()).status).toBe('pending');
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('start czeka na rejestrację, dwie klatki odtworzenia i koniec restore zamiast ujawniać domyślny wiek', async () => {
    const h = setup({ startup: true }), listener = vi.fn();
    h.api.subscribe(listener);
    h.fields.age.value = '30';
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'startup' });
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'startup' });
    h.state.restoreRegistered = true;
    expect(h.api.getEligibility().status).toBe('pending');
    h.frame();
    expect(h.api.getEligibility().status).toBe('pending');
    h.win.__vildaPersistRestoring = true;
    h.values.delete('vildaCurrentPatientId');
    h.frame();
    expect(listener).toHaveBeenCalledWith({ reason: 'startup-settled', identityChanged: false });
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'authentication' });
    h.state.authBootReady = true;
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'restoring' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    h.values.set('vildaCurrentPatientId', 'fikcyjny-a'); h.fields.age.value = '13';
    h.win.__vildaPersistRestoring = false;
    expect(h.api.getEligibility().status).toBe('eligible');
    expect((await h.api.getResult()).status).toBe('ready');
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('zakończony start z dorosłym albo pustą sesją zwalnia miejsce bez odczytu pacjenta', async () => {
    const h = setup({ startup: true });
    h.state.restoreRegistered = true; h.state.authBootReady = true;
    h.fields.age.value = '18'; h.fields.ageMonths.value = '0';
    expect(h.api.getEligibility().status).toBe('pending');
    h.frame(); h.frame();
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason: 'age' });
    h.values.delete('vildaCurrentPatientId');
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it.each([
    ['DOB', h => { h.state.pending = true; }, 'dob'],
    ['deferred session', h => { h.state.mainSessionRestorePending = true; }, 'restoring'],
    ['mirror', h => { h.win.__vildaLustroWpis = true; }, 'restoring'],
    ['restore', h => { h.win.__vildaPersistRestoring = true; }, 'restoring'],
    ['owner', h => { h.state.owner = 'fikcyjny-b'; }, 'ownership'],
    ['sequence', h => { h.state.sequence = null; }, 'apply-sequence'],
  ])('%s jest oczekiwaniem bez dostępu do starego obrazu, a nie brakiem kwalifikacji', async (_, change, reason) => {
    const h = setup(), snapshot = await h.api.getSnapshot();
    change(h);
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason });
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason });
    expect(h.api.isCurrent(snapshot)).toBe(false);
    expect(h.vault.getPatient).toHaveBeenCalledOnce();
  });

  it.each([
    ['brak pacjenta', h => h.values.delete('vildaCurrentPatientId'), 'no-patient'],
    ['restore', h => h.values.set('vildaLoadChoiceV1', 'restore'), 'measurement-mode'],
    ['18 lat', h => { h.fields.age.value = '18'; }, 'age'],
    ['blokada', h => { h.state.unlocked = false; }, 'locked'],
    ['ukryty dokument', h => { h.win.frameElement.hidden = true; }, 'inactive-document'],
  ])('%s po ustaleniu kontekstu jawnie oddaje miejsce zwykłej zawartości', async (_, change, reason) => {
    const h = setup({ framed: true }), snapshot = await h.api.getSnapshot();
    change(h);
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason });
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason });
    expect(h.api.isCurrent(snapshot)).toBe(false);
  });

  it.each(['record', 'timeline'])('błąd odczytu %s pozostaje błędem i Retry ponawia odczyt bez zmiany danych', async kind => {
    const h = setup({ working: kind === 'record' });
    const method = kind === 'record' ? 'getPatient' : 'listPatientTimelineEvents';
    const result = kind === 'record' ? patient() : [];
    h.vault[method] = vi.fn().mockRejectedValueOnce(new Error('Fikcyjna odmowa')).mockResolvedValue(result);
    expect(await h.api.getResult()).toEqual({ status: 'error', reason: kind === 'record' ? 'patient-read' : 'timeline-read' });
    expect(h.api.getEligibility().status).toBe('eligible');
    const listener = vi.fn(); h.api.subscribe(listener); h.api.retry();
    expect(listener).toHaveBeenCalledWith({ reason: 'retry', identityChanged: false });
    expect((await h.api.getResult()).status).toBe('ready');
    expect(h.vault[method]).toHaveBeenCalledTimes(2);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('brak lub obcy rekord jest błędem w slocie, a pusta historia nadal daje gotową siatkę', async () => {
    const h = setup();
    h.vault.getPatient.mockResolvedValueOnce(null).mockResolvedValueOnce(patient('fikcyjny-b')).mockResolvedValue(patient());
    expect(await h.api.getResult()).toEqual({ status: 'error', reason: 'patient-read' });
    expect(await h.api.getResult()).toEqual({ status: 'error', reason: 'patient-read' });
    h.win.advancedGrowthData.measurements = [];
    const result = await h.api.getResult();
    expect(result.status).toBe('ready');
    expect(result.snapshot.measurements).toEqual([]);
  });

  it('spóźniony błąd odczytu sprzed sync nie zastępuje gotowego wyniku błędem lub fallbackiem', async () => {
    const h = setup(), pending = deferred();
    h.vault.getPatient.mockReturnValueOnce(pending.promise).mockResolvedValue(patient());
    const older = h.api.getResult(); await Promise.resolve();
    h.doc.emit('vilda:sync-status-changed');
    const newer = await h.api.getResult();
    expect(newer.status).toBe('ready');
    pending.resolve(null);
    expect(await older).toEqual({ status: 'pending', reason: 'superseded' });
    expect(h.api.isCurrent(newer.snapshot)).toBe(true);
  });

  it('stary odczyt po A → B → A nie publikuje starej migawki ani stanu ineligible', async () => {
    const h = setup(), pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const old = h.api.getResult(); await Promise.resolve();
    h.values.set('vildaCurrentPatientId', 'fikcyjny-b');
    h.emit('storage', { key: 'vildaCurrentPatientId' });
    h.values.set('vildaCurrentPatientId', 'fikcyjny-a');
    h.emit('storage', { key: 'vildaCurrentPatientId' });
    pending.resolve(patient());
    expect(await old).toEqual({ status: 'pending', reason: 'superseded' });
    expect((await h.api.getResult()).status).toBe('ready');
  });

  it('Retry nie zatwierdza draftu i zachowuje ostatni zaakceptowany pomiar', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189');
    h.api.retry();
    expect((await h.api.getResult()).snapshot).toBe(before);
    expect(h.api.isCurrent(before)).toBe(true);
    blurMeasurement(h, 'height');
    expect((await h.api.getResult()).snapshot.currentHeight).toBe(189);
    expect(h.writes).not.toHaveBeenCalled();
  });
});

describe('Panel nowego pomiaru — oczekiwanie na główną sesję po logowaniu', () => {
  it.each(['/index.html', '/docpro.html'])('%s nie odczytuje wykresu między auth-ready a wznowieniem pełnego restore', async route => {
    const h = setup({ startup: true });
    h.win.location.pathname = route;
    h.state.restoreRegistered = true;
    h.state.mainSessionRestorePending = true;
    h.state.unlocked = false;
    // Wspólny persistence już wstawił dane; pełna sesja nadal czeka na konto.
    h.fields.age.value = '30';
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'startup' });
    h.frame(); h.frame();
    expect(h.api.getEligibility()).toEqual({ status: 'pending', reason: 'authentication' });
    h.state.authBootReady = true;
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
    h.state.unlocked = true;
    h.doc.emit('vilda:auth-boot-settled');
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    // Przejęcie przez właściwe apply jest synchroniczne; potem działa zwykła
    // bariera restore, a następnie dokładnej daty urodzenia.
    h.state.mainSessionRestorePending = false;
    h.win.__vildaPersistRestoring = true;
    h.fields.age.value = '13'; h.fields.height.value = '161';
    h.fields.weight.value = '49'; h.state.source = 'PALCZEWSKA';
    h.state.sequence += 1;
    h.doc.emit('vilda:state-restored');
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
    h.state.pending = true; h.win.__vildaPersistRestoring = false;
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'dob' });
    h.state.pending = false; h.doc.emit('vilda:dob-restored');
    h.doc.emit('vilda:main-session-restored');
    const complete = await h.api.getResult();
    expect(complete.status).toBe('ready');
    expect(complete.snapshot).toMatchObject({ source: 'PALCZEWSKA', currentHeight: 161, currentWeight: 49 });
    expect(h.api.isCurrent(complete.snapshot)).toBe(true);
    expect(h.vault.getPatient).toHaveBeenCalledOnce();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each(['record', 'timeline'])('spóźniony %s nie publikuje danych wspólnego persistence po rozpoczęciu oczekiwania', async kind => {
    const h = setup({ working: kind === 'record' }), pending = deferred();
    const method = kind === 'record' ? 'getPatient' : 'listPatientTimelineEvents';
    h.vault[method].mockReturnValueOnce(pending.promise);
    const old = h.api.getResult();
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(h.vault[method]).toHaveBeenCalledOnce();
    h.state.mainSessionRestorePending = true;
    pending.resolve(kind === 'record' ? patient() : [{ type: 'measurement', ageMonths: 108, height: 139, weight: 32 }]);
    expect(await old).toEqual({ status: 'pending', reason: 'restoring' });
    expect(await h.api.getSnapshot()).toBeNull();
    h.state.mainSessionRestorePending = false;
    h.state.sequence += 1;
    h.fields.height.value = '161';
    h.doc.emit('vilda:state-restored');
    const complete = await h.api.getResult();
    expect(complete.status).toBe('ready');
    expect(complete.snapshot.currentHeight).toBe(161);
    expect(h.api.isCurrent(complete.snapshot)).toBe(true);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('wyjątek zachowania rysunku po zapisie nie omija oczekującego pełnego restore', async () => {
    const h = setup(), before = await h.api.getSnapshot();
    h.state.pending = true;
    h.doc.emit('vilda:patient-loaded', { source: 'save', patientId: 'fikcyjny-a', applySequence: h.state.sequence });
    expect(h.api.isCurrent(before)).toBe(true);
    expect(h.api.getRefreshState(before)).toBe('pending');
    h.state.mainSessionRestorePending = true;
    expect(h.api.isCurrent(before)).toBe(false);
    expect(h.api.getRefreshState(before)).toBeNull();
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
  });

  it('powiadamia o końcu auth i restore, a zakończenie restore unieważnia także wcześniejszy odczyt', async () => {
    const h = setup(), pending = deferred(), listener = vi.fn();
    h.api.subscribe(listener);
    h.vault.getPatient.mockReturnValueOnce(pending.promise);
    const old = h.api.getResult(); await Promise.resolve();
    h.state.mainSessionRestorePending = true;
    h.doc.emit('vilda:auth-boot-settled');
    expect(listener).toHaveBeenCalledWith({ reason: 'vilda:auth-boot-settled', identityChanged: false });
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
    h.state.mainSessionRestorePending = false;
    h.fields.height.value = '161';
    h.doc.emit('vilda:main-session-restored');
    expect(listener).toHaveBeenCalledWith({ reason: 'vilda:main-session-restored', identityChanged: true });
    const complete = await h.api.getResult();
    pending.resolve(patient());
    expect(await old).toEqual({ status: 'pending', reason: 'superseded' });
    expect(complete.status).toBe('ready');
    expect(complete.snapshot.currentHeight).toBe(161);
    expect(h.api.isCurrent(complete.snapshot)).toBe(true);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('anulowane oczekiwanie po wyczyszczeniu pacjenta zwalnia miejsce bez odczytu rekordu', async () => {
    const h = setup(); h.state.mainSessionRestorePending = true;
    expect(await h.api.getResult()).toEqual({ status: 'pending', reason: 'restoring' });
    h.values.delete('vildaCurrentPatientId');
    h.state.mainSessionRestorePending = false;
    h.doc.emit('vilda:user-state-cleared');
    expect(await h.api.getResult()).toEqual({ status: 'ineligible', reason: 'no-patient' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('starszy niezależny konsument bez nowego API zachowuje dotychczasowy kontrakt', async () => {
    const h = setup();
    delete h.win.VildaDataImportExport.isMainSessionRestorePending;
    const result = await h.api.getResult();
    expect(result.status).toBe('ready');
    expect(h.api.isCurrent(result.snapshot)).toBe(true);
  });
});


describe('Zakładka siatki — nowy formularz i dokładnie odtworzony zapis', () => {
  const summary = { mode: 'summary' };

  function draft(options = {}) {
    const h = setup({ initialNoPatient: true, working: false, ...options });
    h.values.delete('vildaLoadChoiceV1');
    h.state.owner = null;
    h.win.chartCreatorData = {};
    return h;
  }

  function restored(options = {}) {
    const h = setup({ working: false, ...options });
    h.values.set('vildaLoadChoiceV1', 'restore');
    h.values.set('vildaDobAgeZapisV1', '1');
    h.win.lastLoadedData = {
      user: { age: 10, ageMonths: 7, sex: 'K', height: 144, weight: 35,
        dobISO: '2014-10-26', measuredAtISO: '2025-05-26' },
      advanced: { data: { motherHeight: 160, fatherHeight: 175,
        measurements: [{ ageMonths: 108, height: 132, weight: 29 }] } },
      chartCreator: { growth: { free: { height: [{ id: 'old', txt: 'Fikcyjny zapis wcześniejszej wizyty' }] } } },
    };
    Object.assign(h.fields.age, { value: '10' });
    Object.assign(h.fields.ageMonths, { value: '7' });
    h.fields.sex.value = 'K'; h.fields.height.value = '144'; h.fields.weight.value = '35';
    h.fields.advMotherHeight.value = '160'; h.fields.advFatherHeight.value = '175';
    h.state.exactAge = { totalMonths: 127, exactMonths: 126.98151950718686 };
    h.win.VildaDobAge.readMeasuredAtISO = () => '2025-05-26';
    h.win.chartCreatorData = structuredClone(h.win.lastLoadedData.chartCreator);
    // Nowszy rekord ma inne dane. Nie wolno go użyć do odtwarzanej wizyty.
    h.state.record.snapshots[0].payload.advanced.data = {
      motherHeight: 190, fatherHeight: 200,
      measurements: [{ ageMonths: 144, height: 155, weight: 44 }],
    };
    return h;
  }

  it.each(['/index.html', '/docpro.html'])('%s: niezapisany pojedynczy pomiar nie tworzy ID ani nie czyta sejfu', async (route) => {
    const h = draft(); h.win.location.pathname = route;
    h.state.unlocked = false; // Odczyt własnego formularza nie wymaga konta ani sejfu.
    const result = await h.api.getResult(summary);
    expect(result.status).toBe('ready');
    expect(result.snapshot).toMatchObject({ patientId: null, currentHeight: 158, currentWeight: 46,
      measurements: [], chartCreatorData: {}, eligibility: { savedPatient: false, mode: 'summary' } });
    expect(result.snapshot.patientToken).toMatchObject({ kind: 'draft', ownerKey: 'draft:0', mode: 'summary' });
    expect(h.api.isCurrent(result.snapshot)).toBe(true);
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.vault.listPatientTimelineEvents).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.api.getEligibility()).toEqual({ status: 'ineligible', reason: 'no-patient' });
  });

  it('draft 1 → 18 → 189 czeka na blur i nie zmienia historii zaakceptowanej migawki', async () => {
    const h = draft(), before = await h.api.getSnapshot(summary);
    focusMeasurement(h, 'height');
    for (const value of ['1', '18', '189']) {
      typeMeasurement(h, 'height', value);
      expect(await h.api.getSnapshot(summary)).toBe(before);
    }
    blurMeasurement(h, 'height');
    const after = await h.api.getSnapshot(summary);
    expect(after.currentHeight).toBe(189);
    expect(after.patientToken).toBe(before.patientToken);
    expect(before.currentHeight).toBe(158);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('Enter w draft zatwierdza właściwą wartość także przed kolejnym wpisaniem i zmianą źródła', async () => {
    const h = draft(); await h.api.getSnapshot(summary);
    focusMeasurement(h, 'height'); typeMeasurement(h, 'height', '189'); enterMeasurement(h, 'height');
    typeMeasurement(h, 'height', '1');
    h.state.source = 'PALCZEWSKA'; h.doc.emit('vilda:zrodlo-pacjenta-zmienione');
    const accepted = await h.api.getSnapshot(summary);
    expect(accepted.currentHeight).toBe(189);
    expect(accepted.source).toBe('OLAF');
    blurMeasurement(h, 'height');
    const next = await h.api.getSnapshot(summary);
    expect(next.currentHeight).toBe(1);
    expect(next.source).toBe('PALCZEWSKA');
  });

  it('czyszczenie formularza daje nowy RAM-token i nie ożywia starego rysunku', async () => {
    const h = draft(), before = await h.api.getSnapshot(summary);
    h.doc.emit('vilda:user-state-cleared');
    h.fields.height.value = '140';
    const after = await h.api.getSnapshot(summary);
    expect(h.api.isCurrent(before)).toBe(false);
    expect(after.patientId).toBeNull();
    expect(after.patientToken.ownerKey).not.toBe(before.patientToken.ownerKey);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('synchroniczne pytania subskrybentów podczas Wyczyść nie odbierają zgody na nowy draft', async () => {
    const h = setup();
    await h.api.getSnapshot(summary);
    h.api.subscribe(event => {
      if (event.reason === 'clear') {
        // Tak jak tabs/controller: odczyt przed późniejszym listenerem paska bocznego,
        // który dopiero usuwa vildaCurrentPatientId w tym samym stosie zdarzenia.
        expect(h.values.get('vildaCurrentPatientId')).toBe('fikcyjny-a');
        h.api.getEligibility();
        h.api.getEligibility(summary);
      }
    });
    h.win.__vildaPersistClearUntil = Date.now() + 1500;
    h.emit('vilda:user-state-cleared');
    h.values.delete('vildaCurrentPatientId'); h.values.delete('vildaLoadChoiceV1');
    h.state.owner = null; h.win.lastLoadedData = null;
    h.win.advancedGrowthData = { measurements: [] }; h.win.chartCreatorData = {};
    h.win.__vildaPersistClearUntil = 0;
    const next = await h.api.getSnapshot(summary);
    expect(next.patientId).toBeNull();
    expect(next.measurements).toEqual([]);
    expect(next.chartCreatorData).toEqual({});
    // Zapisanie/ponowne przyjęcie pacjenta zamyka to jednorazowe przejście.
    h.values.set('vildaCurrentPatientId', 'fikcyjny-a'); h.state.owner = 'fikcyjny-a';
    h.doc.emit('vilda:patient-loaded', { patientId: 'fikcyjny-a', source: 'save' });
    h.values.delete('vildaCurrentPatientId'); h.state.owner = null;
    expect(h.api.getEligibility(summary)).toEqual({ status: 'ineligible', reason: 'no-patient' });
  });

  it('brak ID po wyborze pacjenta nie zamienia jego pozostawionego formularza w anonimowy draft', async () => {
    const h = setup(), before = await h.api.getSnapshot(summary);
    h.values.delete('vildaCurrentPatientId'); h.state.owner = null;
    expect(h.api.isCurrent(before)).toBe(false);
    expect(h.api.getEligibility(summary)).toEqual({ status: 'ineligible', reason: 'no-patient' });
    h.doc.emit('vilda:user-state-cleared');
    h.win.advancedGrowthData = { measurements: [] };
    h.win.chartCreatorData = {};
    expect((await h.api.getSnapshot(summary)).patientId).toBeNull();
  });

  it('odtworzenie bierze wybrany zapis, jego datę, historię, rodziców i adnotacje bez nowszego rekordu', async () => {
    const h = restored();
    const snapshot = await h.api.getSnapshot(summary);
    expect(snapshot).toMatchObject({ patientId: 'fikcyjny-a', ageMonths: 127,
      exactAgeMonths: 126.98151950718686, currentHeight: 144, currentWeight: 35,
      parents: { motherHeight: 160, fatherHeight: 175 },
      measurements: [{ ageMonths: 108, height: 132, weight: 29 }],
      meta: { measuredAtISO: '2025-05-26', savedMeasurement: true },
      eligibility: { mode: 'summary', choice: 'restore' } });
    expect(snapshot.chartCreatorData).toEqual(h.win.lastLoadedData.chartCreator);
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.vault.listPatientTimelineEvents).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('pusty zapis historyczny pozostaje pojedynczym punktem bez historii i rodziców z przyszłego rekordu', async () => {
    const h = restored();
    h.win.lastLoadedData.advanced = { data: { measurements: [] } };
    h.fields.advMotherHeight.value = ''; h.fields.advFatherHeight.value = '';
    h.win.chartCreatorData = {};
    const snapshot = await h.api.getSnapshot(summary);
    expect(snapshot.measurements).toEqual([]);
    expect(snapshot.parents).toEqual({ motherHeight: null, fatherHeight: null });
    expect(snapshot.chartCreatorData).toEqual({});
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it('jawne usunięcie working history nie wskrzesza pomiarów z odtworzonego payloadu', async () => {
    const h = restored();
    h.win.basicGrowthData = { measurements: [] };
    h.win.getEffectiveCentileGrowthDataState = () => null;
    expect((await h.api.getSnapshot(summary)).measurements).toEqual([]);
    expect(h.vault.listPatientTimelineEvents).not.toHaveBeenCalled();
  });

  it('odtworzony pomiar nie pokazuje późniejszych wierszy także jeśli trafiły do bufora historii', async () => {
    const h = restored();
    h.win.basicGrowthData = { measurements: [
      { ageMonths: 108, height: 132, weight: 29 },
      { ageMonths: 144, height: 155, weight: 44 },
      { ageYears: 12, height: 155, weight: 44 },
    ] };
    expect((await h.api.getSnapshot(summary)).measurements).toEqual([{ ageMonths: 108, height: 132, weight: 29 }]);
  });

  it('pomiar dziecięcy osoby dziś dorosłej zachowuje wiek i datę zapisanej wizyty', async () => {
    const h = restored();
    h.win.lastLoadedData.user.dobISO = '2000-10-26';
    h.win.lastLoadedData.user.measuredAtISO = '2011-05-26';
    h.win.VildaDobAge.readMeasuredAtISO = () => '2011-05-26';
    const snapshot = await h.api.getSnapshot(summary);
    expect(snapshot.ageMonths).toBe(127);
    expect(snapshot.meta.measuredAtISO).toBe('2011-05-26');
    expect(snapshot.eligibility.under18).toBe(true);
    h.fields.age.value = '26'; h.fields.ageMonths.value = '0';
    expect(h.api.isCurrent(snapshot)).toBe(false);
    expect(h.api.getEligibility(summary)).toEqual({ status: 'ineligible', reason: 'age' });
  });

  it.each(['restore', 'applied'])('zapisany pojedynczy pomiar w trybie %s nie wymaga ścieżki Nowy pomiar', async (mode) => {
    const h = restored();
    if (mode === 'applied') h.values.delete('vildaLoadChoiceV1');
    h.win.lastLoadedData.advanced = { data: { measurements: [] } };
    const snapshot = await h.api.getSnapshot(summary);
    expect(snapshot.measurements).toEqual([]);
    expect(snapshot.patientToken.kind).toBe(mode);
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it.each([
    ['blokada', h => { h.state.unlocked = false; h.hooks.lock(); }],
    ['nowy apply', h => { h.state.sequence++; }],
    ['obcy właściciel', h => { h.state.owner = 'fikcyjny-b'; }],
    ['inna osoba', h => { h.values.set('vildaCurrentPatientId', 'fikcyjny-b'); }],
    ['nieaktualna ramka', h => { h.state.stale = true; }],
    ['ukryta ramka', h => { h.win.frameElement.hidden = true; }],
    ['zmiana ścieżki', h => { h.win.location.pathname = '/klirens.html'; }],
    ['nowy pomiar', h => { h.values.set('vildaLoadChoiceV1', 'new'); }],
  ])('%s natychmiast unieważnia odtworzony rysunek', async (_, change) => {
    const h = restored({ framed: true }), snapshot = await h.api.getSnapshot(summary);
    expect(h.api.isCurrent(snapshot)).toBe(true);
    change(h);
    expect(h.api.isCurrent(snapshot)).toBe(false);
  });

  it('usunięty zapis nie odżywa z pozostawionego payloadu przy kolejnym odczycie', async () => {
    const h = restored(), before = await h.api.getSnapshot(summary);
    h.hooks.remove({ patientId: 'fikcyjny-a' });
    expect(h.api.isCurrent(before)).toBe(false);
    expect(await h.api.getResult(summary)).toEqual({ status: 'ineligible', reason: 'deleted' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it('startowa blokada pustego sejfu nie wyłącza formularza nowego pacjenta', async () => {
    const h = draft(); h.hooks.lock(); h.state.unlocked = false;
    expect((await h.api.getResult(summary)).status).toBe('ready');
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it('odtworzenie bez zastosowanego payloadu czeka zamiast czytać najnowszy snapshot z sejfu', async () => {
    const h = restored(); delete h.win.lastLoadedData;
    expect(await h.api.getResult(summary)).toEqual({ status: 'pending', reason: 'applied-payload' });
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.vault.listPatientTimelineEvents).not.toHaveBeenCalled();
  });
});
