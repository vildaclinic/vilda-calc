import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const start = html.indexOf('    function readPubertyPatientContext() {');
const end = html.indexOf('    var pubertyUI =', start);
const makeReader = new Function('window', 'sessionStorage', 'persistence', 'extractTannerFromAny',
  `${html.slice(start, end)}; return readPubertyPatientContext;`);
const storageListener = html.match(/window\.addEventListener\('storage', function \(e\) \{[\s\S]*?refreshPatientContext\(\);[\s\S]*?\}\);/);
if (!storageListener) throw new Error('Missing production LH/FSH storage listener');
const bindStorage = new Function('window', 'refreshPatientContext', storageListener[0]);

function harness() {
  const fields = {};
  ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow',
    'ageWeeksNote', 'ageWeeksError', 'weight', 'height'].forEach(id => {
    fields[id] = { id, value: '', readOnly: false, hidden: false, dataset: {}, textContent: '',
      classList: { toggle() {} }, addEventListener() {}, dispatchEvent() {}, focus() {} };
  });
  const storage = new Map();
  const caches = new Map();
  let shared = { age: '0', ageMonths: '1', weight: '', height: '', _vildaPersist: { updatedAtISO: 'fictional-unchanged' } };
  let unlocked = true;
  const handlers = {};
  const windowHandlers = {};
  const vaultHandlers = { lock: [], unlock: [] };
  const document = { readyState: 'loading', getElementById: id => fields[id] || null,
    addEventListener: (type, cb) => { (handlers[type] ||= []).push(cb); } };
  const writeShared = vi.fn((value) => { shared = value; return true; });
  const writeCache = vi.fn((scope, key, value) => { caches.set(scope + ':' + key, structuredClone(value)); return true; });
  const w = { document, _vildaCurrentPatientId: '', hasUserModifiedAfterLoad: false,
    addEventListener: (type, cb) => { (windowHandlers[type] ||= []).push(cb); },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    VildaPersistence: { readShared: () => shared, writeShared, writeJSON: writeCache,
      readJSON: (scope, key) => structuredClone(caches.get(scope + ':' + key) ?? null),
      removeKey: (scope, key) => caches.delete(scope + ':' + key),
    },
    VildaVault: { isUnlocked: () => unlocked,
      onLock: cb => vaultHandlers.lock.push(cb), onUnlock: cb => vaultHandlers.unlock.push(cb) },
  };
  loadBrowserScript('vilda_dob_age.js', w);
  loadBrowserScript('vilda_lab_neonatal_context.js', w);
  loadBrowserScript('vilda_puberty_source.js', w);
  function syncShared() {
    for (const key of ['age', 'ageMonths', 'weight', 'height']) shared[key] = fields[key].value;
  }
  function dob(iso) { w.VildaDobAge.setFromSession(iso, {}); syncShared(); }
  function select(id) { storage.set('vildaCurrentPatientId', id); w._vildaCurrentPatientId = id; }
  return { w, fields, storage, writeShared, writeCache, syncShared, dob, select, handlers, windowHandlers, vaultHandlers,
    get shared() { return shared; }, lock: () => { unlocked = false; vaultHandlers.lock.forEach(cb => cb()); },
    unlock: () => { unlocked = true; vaultHandlers.unlock.forEach(cb => cb()); }, api: w.VildaLabNeonatalContext };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 9, 12)); });
afterEach(() => vi.useRealTimers());

describe('LH/FSH — pochodny wiek z istniejącego formularza', () => {
  it('przenosi 43 dni kalendarzowe jako 42–43 ukończone dni, bez daty urodzenia i bez zmiany rekordu', () => {
    const h = harness(); h.dob('2026-08-27');
    expect(h.api.publish()).toBe(true);
    expect(h.api.read(h.shared, '', null)).toEqual({
      postnatalDays: { lower: 42, upper: 43, source: 'main-calendar-dates' }, gestationalDays: null,
    });
    expect(JSON.stringify(h.shared)).not.toContain('2026-08-27');
    expect(JSON.stringify(h.shared)).not.toContain('27-08-2026');
    expect(JSON.stringify(h.api.readCache())).not.toContain('2026-08-27');
    expect(JSON.stringify(h.api.readCache())).not.toContain('27-08-2026');
    expect(h.shared._vildaPersist.updatedAtISO).toBe('fictional-unchanged');
    expect(h.w.hasUserModifiedAfterLoad).toBe(false);
    expect(h.writeShared).not.toHaveBeenCalled();
    expect(h.writeCache).toHaveBeenLastCalledWith('session', 'vildaLabNeonatalAgeV1', h.api.readCache());
    expect(h.api.publish()).toBe(false);
    expect(h.writeCache).toHaveBeenCalledTimes(1);
  });

  it.each([['2026-10-09', 0, 0], ['2026-10-08', 0, 1], ['2026-10-07', 1, 2]])(
    'data %s nie jest potwierdzeniem pełnych 24 h po samym przekroczeniu północy', (iso, lower, upper) => {
      const h = harness(); h.dob(iso); h.api.publish();
      expect(h.api.read(h.shared, '', null).postnatalDays).toEqual({ lower, upper, source: 'main-calendar-dates' });
    },
  );

  it('ręczne ukończone tygodnie pozostają przedziałem, bez wymyślania daty albo dnia środkowego', () => {
    const h = harness(); h.fields.age.value = '0'; h.fields.ageMonths.value = '1'; h.fields.ageWeeks.value = '6';
    h.w.VildaDobAge.refresh(); h.syncShared(); h.api.publish();
    expect(h.api.read(h.shared, '', null).postnatalDays).toEqual({ lower: 42, upper: 48, source: 'main-completed-weeks' });
  });

  it('nie używa pozostałych tygodni po błędnej dacie ani po ręcznej zmianie wieku', () => {
    const h = harness(); h.dob('2026-08-27'); h.api.publish();
    h.fields.dobInput.value = '31-02-2026';
    expect(h.api.readForm()).toBeNull();
    h.api.publish(); expect(h.api.read(h.shared, '', null)).toBeNull();
    h.dob('2026-08-27'); h.api.publish(); h.shared.age = '2';
    expect(h.api.read(h.shared, '', null)).toBeNull();
  });

  it('używa rzeczywistego wieku odtworzonej wizyty, mimo późniejszej daty systemowej', () => {
    const h = harness(); h.storage.set('vildaLoadChoiceV1', 'restore');
    h.w.lastLoadedData = { user: { dobISO: '2026-09-01', age: 0, ageMonths: 1, ageWeeks: 4,
      measuredAtISO: '2026-10-01', weight: 4, height: 50 } };
    h.fields.weight.value = '4'; h.fields.height.value = '50'; h.dob('2026-09-01');
    h.api.publish();
    expect(h.api.read(h.shared, '', null).postnatalDays).toMatchObject({ lower: 29, upper: 30 });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    expect(h.api.read(h.shared, '', null).postnatalDays.upper).toBe(30);
    h.fields.weight.value = '5'; h.w.VildaDobAge.refresh(); h.syncShared();
    expect(h.api.read(h.shared, '', null)).toBeNull();
    h.api.publish();
    expect(h.api.read(h.shared, '', null).postnatalDays).toMatchObject({ lower: 38, upper: 39 });
  });

  it('bez daty odtworzonego pomiaru zachowuje tylko znaną precyzję tygodni', () => {
    const h = harness(); h.storage.set('vildaLoadChoiceV1', 'restore');
    h.w.lastLoadedData = { user: { dobISO: '2026-09-01', age: 0, ageMonths: 1, ageWeeks: 4, weight: 4, height: 50 } };
    h.fields.weight.value = '4'; h.fields.height.value = '50'; h.dob('2026-09-01');
    h.api.publish();
    expect(h.api.read(h.shared, '', null).postnatalDays).toEqual({ lower: 28, upper: 34, source: 'main-completed-weeks' });
  });

  it('wczorajszy wiek kalendarzowy i inne tryby wizyty wymagają ponownego odczytu formularza', () => {
    const h = harness(); h.dob('2026-08-27'); h.api.publish();
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    expect(h.api.read(h.shared, '', null)).toBeNull();
    h.api.publish(); expect(h.api.read(h.shared, '', null).postnatalDays.upper).toBe(44);
    h.storage.set('vildaLoadChoiceV1', 'restore');
    expect(h.api.read(h.shared, '', null)).toBeNull();
  });

  it('nie publikuje wieku w trakcie restore ani z nieaktualnej ramki pacjenta', () => {
    const h = harness(); h.dob('2026-08-27'); h.w.__vildaPersistRestoring = true;
    expect(h.api.publish()).toBe(false);
    h.w.__vildaPersistRestoring = false; h.storage.set('vildaCurrentPatientId', 'fictional-other');
    expect(h.api.publish()).toBe(false);
    h.storage.delete('vildaCurrentPatientId'); h.w.VildaPanelPacjent = { nieaktualny: () => true };
    expect(h.api.publish()).toBe(false);
    expect(h.writeShared).not.toHaveBeenCalled();
  });

  it('cache przeżywa zwykły zapis shared i przywrócenie odblokowanej sesji na kolejnej stronie', () => {
    const h = harness(); h.dob('2026-08-27'); h.api.publish();
    const before = structuredClone(h.shared);
    h.w.VildaPersistence.writeShared({ ...h.shared });
    h.vaultHandlers.unlock.forEach(cb => cb());
    expect(h.api.read(h.shared, '', null).postnatalDays.upper).toBe(43);
    expect(h.shared).toEqual(before);
    expect(h.shared).not.toHaveProperty('_labNeonatalAge');
  });

  it('blokada sejfu i wyczyszczenie pacjenta usuwają pomocniczy cache', () => {
    const h = harness(); h.select('fictional-neonate'); h.dob('2026-08-27'); h.api.publish();
    h.lock(); expect(h.api.readCache()).toBeNull();
    expect(h.api.publish()).toBe(false); expect(h.api.readCache()).toBeNull();
    h.unlock(); h.api.publish(); expect(h.api.readCache()).not.toBeNull();
    h.windowHandlers['vilda:user-state-cleared'].forEach(cb => cb());
    expect(h.api.readCache()).toBeNull();
  });

  it('zmiana pacjenta w ramce usuwa cache poprzednika, lecz nie usuwa już opublikowanych danych nowego pacjenta', () => {
    const h = harness(); h.dob('2026-08-27'); h.api.publish();
    h.select('fictional-other');
    h.windowHandlers.storage.forEach(cb => cb({ key: 'vildaCurrentPatientId' }));
    expect(h.api.readCache()).toBeNull();
    h.api.publish();
    h.windowHandlers.storage.forEach(cb => cb({ key: 'vildaCurrentPatientId' }));
    expect(h.api.readCache().identityKey).toBe('fictional-other');
  });

  it.each(['vildaLabNeonatalAgeV1', 'veph:s:vildaLabNeonatalAgeV1'])(
    'ramka przelicznika odczytuje zmianę dni z %s nawet bez zmiany ukończonego miesiąca', key => {
      const h = harness(); h.dob('2026-08-27'); h.api.publish();
      let current = h.api.read(h.shared, '', null);
      let listener;
      bindStorage({ addEventListener: (_type, cb) => { listener = cb; } }, () => { current = h.api.read(h.shared, '', null); });
      const formBefore = structuredClone(h.shared);
      h.dob('2026-08-28'); h.api.publish();
      expect(h.shared).toEqual(formBefore);
      expect(current.postnatalDays.upper).toBe(43);
      listener({ key });
      expect(current.postnatalDays).toMatchObject({ lower: 41, upper: 42 });
    },
  );
});

describe('LH/FSH — GA z chronionego źródła tego samego pacjenta', () => {
  it.each([[28, 4, 200, 200], [28, null, 196, 202], [28, 0, 196, 196], ['28', '4', 200, 200]])(
    'GA %j + %j zachowuje znaną dokładność', (weeks, days, lower, upper) => {
      const h = harness(); h.select('fictional-neonate'); h.dob('2026-08-27');
      h.w.VildaPubertySource.zapamietaj({ perinatal: { gestationalWeeks: weeks, gestationalDays: days } }, 'fictional-neonate');
      h.api.publish(); const context = h.w.VildaPubertySource.kontekstPacjenta('fictional-neonate');
      expect(h.api.read(h.shared, 'fictional-neonate', context)).toEqual({
        postnatalDays: { lower: 42, upper: 43, source: 'main-calendar-dates' },
        gestationalDays: { lower, upper, source: 'patient-record' },
      });
      context.neonatalAge.gestationalDays.lower = 0;
      expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-neonate').neonatalAge.gestationalDays.lower).toBe(lower);
    },
  );

  it.each([[28, 7], [28, -1], [28.5, 0], [true, 0], [28, false], ['28bad', 0]])(
    'nie dopisuje pewnego GA z nieprawidłowego zapisu %j + %j', (weeks, days) => {
      const h = harness(); h.select('fictional-neonate');
      h.w.VildaPubertySource.zapamietaj({ perinatal: { gestationalWeeks: weeks, gestationalDays: days } }, 'fictional-neonate');
      expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-neonate')).not.toHaveProperty('neonatalAge');
    },
  );

  it('nie przenosi danych przy zmianie tożsamości, loading lub zablokowaniu sejfu', () => {
    const h = harness(); h.select('fictional-neonate'); h.dob('2026-08-27'); h.api.publish();
    h.w.VildaPubertySource.zapamietaj({ perinatal: { gestationalWeeks: 28, gestationalDays: 4 } }, 'fictional-neonate');
    const source = h.w.VildaPubertySource;
    expect(h.api.read(h.shared, 'fictional-neonate', source.kontekstPacjenta('fictional-neonate'))).not.toBeNull();
    expect(h.api.read(h.shared, 'fictional-neonate', { patientId: 'fictional-neonate', status: 'loading' })).toBeNull();
    h.select('fictional-other');
    expect(h.api.read(h.shared, 'fictional-other', source.kontekstPacjenta('fictional-other'))).toBeNull();
    h.select('fictional-neonate'); h.lock();
    expect(source.kontekstPacjenta('fictional-neonate')).not.toHaveProperty('neonatalAge');
    expect(h.api.read(h.shared, 'fictional-neonate', source.kontekstPacjenta('fictional-neonate'))).toBeNull();
  });

  it('przy ponownym asynchronicznym odczycie natychmiast usuwa GA i pomija spóźniony rekord poprzedniego pacjenta', async () => {
    const h = harness(); const pending = new Map();
    h.w.VildaVault.getPatient = id => new Promise(resolve => { pending.set(id, resolve); });
    h.select('fictional-A');
    h.w.VildaPubertySource.zapamietaj({ perinatal: { gestationalWeeks: 28, gestationalDays: 4 } }, 'fictional-A');
    const emit = id => h.handlers['vilda:patient-loaded'].forEach(cb => cb({ detail: { patientId: id } }));
    emit('fictional-A');
    expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-A')).toMatchObject({ status: 'loading' });
    expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-A')).not.toHaveProperty('neonatalAge');
    h.select('fictional-B'); emit('fictional-B');
    pending.get('fictional-A')({ snapshots: [{ payload: { perinatal: { gestationalWeeks: 28, gestationalDays: 4 } } }] });
    await Promise.resolve();
    expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-B')).not.toHaveProperty('neonatalAge');
    pending.get('fictional-B')({ snapshots: [{ payload: { perinatal: { gestationalWeeks: 30, gestationalDays: 0 } } }] });
    await Promise.resolve();
    expect(h.w.VildaPubertySource.kontekstPacjenta('fictional-B').neonatalAge.gestationalDays).toMatchObject({ lower: 210, upper: 210 });
  });

  it.each([[28, 4, 'yes'], [36, null, 'yes'], [37, 0, 'no'], [40, 0, 'no']])(
    'adapter formularza korzysta z GA %d + %j dla odpowiedzi o wcześniactwie %s', (weeks, days, expected) => {
      const h = harness(); h.select('fictional-neonate'); h.dob('2026-08-27');
      loadBrowserScript('vilda_lab_puberty_data.js', h.w);
      h.w.VildaPubertySource.zapamietaj({ perinatal: { gestationalWeeks: weeks, gestationalDays: days } }, 'fictional-neonate');
      h.api.publish();
      const reader = makeReader(h.w, h.w.sessionStorage, h.w.VildaPersistence, () => null);
      expect(reader()).toMatchObject({ preterm: expected, neonatalAge: {
        postnatalDays: { lower: 42, upper: 43 }, gestationalDays: { source: 'patient-record' },
      } });
    },
  );

  it('adapter nie dodaje metadanych noworodkowych przy braku obu źródeł', () => {
    const h = harness();
    const reader = makeReader(h.w, h.w.sessionStorage, h.w.VildaPersistence, () => null);
    expect(reader()).not.toHaveProperty('neonatalAge');
    expect(reader()).not.toHaveProperty('preterm');
  });
});
