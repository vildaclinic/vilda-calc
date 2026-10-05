import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const preferences = require('../../vilda_lab_profile_preferences.js');
const data = require('../../vilda_lab_puberty_data.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const empty = () => ({ schemaVersion: 1, profiles: { lh: null, fsh: null } });
const selected = (analyte = 'lh', settings = null) => preferences.configure(settings, analyte, `mayo-${analyte}-pediatric`, data);

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function device() {
  const win = {
    localStorage: storage(), sessionStorage: storage(),
    // Device settings do not depend on an unlocked vault or an active patient.
    VildaVault: new Proxy({}, { get() { throw new Error('Do not read the vault'); } }),
    dispatchEvent() {}, CustomEvent: class {},
  };
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_lab_profile_preferences.js', win);
  return { win, adapter: win.VildaPersistence, api: win.VildaLabProfilePreferences };
}

describe('profile oznaczenia są jawną preferencją urządzenia', () => {
  it('brak ustawienia nie aktywuje żadnej metody', () => {
    expect(preferences.normalize(null, data)).toEqual(empty());
    expect(preferences.resolve(null, 'lh', data)).toBeNull();
    expect(preferences.resolve(null, 'fsh', data)).toBeNull();
  });

  it('wybór zachowuje konkretną metodę i wersję bez potwierdzania próbki', () => {
    const settings = selected();
    expect(settings).toEqual({ schemaVersion: 1, profiles: {
      lh: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia', material: 'serum' },
      fsh: null,
    } });
    const resolved = preferences.resolve(settings, 'lh', data);
    expect(resolved).toEqual({
      profile: data.profiles.find((p) => p.id === 'mayo-lh-pediatric'),
      assay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia', confirmation: 'configured' },
      specimen: 'serum',
    });
  });

  it('LH i FSH mają osobne wybory, a wyłączenie jednego nie zmienia drugiego', () => {
    const first = selected();
    const both = selected('fsh', first);
    const cleared = preferences.clear(both, 'lh', data);
    expect(first.profiles.fsh).toBeNull();
    expect(both.profiles.lh).not.toBeNull();
    expect(cleared.profiles.lh).toBeNull();
    expect(preferences.resolve(cleared, 'fsh', data).assay.methodId).toBe('roche-elecsys-fsh-eclia');
  });

  it.each([null, [], '', 'broken', {}, { schemaVersion: 2, profiles: {} }, { schemaVersion: '1', profiles: {} },
    { schemaVersion: 1, profiles: [] }, { schemaVersion: 1, profiles: { lh: true } }])('odrzuca nieobsługiwany lub uszkodzony zapis: %j', (raw) => {
    expect(preferences.normalize(raw, data)).toEqual(empty());
  });

  it('przechowuje tylko dozwolone pola profilu, bez danych pacjenta i leczenia', () => {
    const raw = selected();
    raw.name = 'Syntetyczny Pacjent'; raw.patientId = 'synthetic-only'; raw.accountId = 'synthetic-account';
    raw.age = 12; raw.treatment = { gnrha: 'no', sexSteroids: 'no' };
    raw.profiles.lh.sampleDateISO = '2026-10-04'; raw.profiles.lh.tanner = 'G3';
    raw.profiles.lh.confirmation = 'reported'; raw.profiles.other = { age: 12 };
    expect(preferences.normalize(raw, data)).toEqual(selected());
  });

  it.each([
    ['profileId', 'mayo-fsh-pediatric'], ['profileId', 'unknown'], ['profileVersion', '2026-10-02.1'],
    ['methodId', 'other-assay'], ['material', 'plasma'],
  ])('nie używa ustawienia z niezgodnym %s', (key, value) => {
    const raw = selected(); raw.profiles.lh[key] = value;
    expect(preferences.resolve(raw, 'lh', data)).toBeNull();
  });

  it.each(['version', 'method', 'material', 'active', 'removed', 'duplicate'])('unieważnia zapis po zmianie źródła: %s', (change) => {
    const updated = clone(data), profile = updated.profiles.find((p) => p.analyte === 'lh');
    if (change === 'version') profile.version = 'new-version';
    if (change === 'method') profile.method.id = 'new-method';
    if (change === 'material') profile.material = 'plasma';
    if (change === 'active') profile.active = false;
    if (change === 'removed') updated.profiles = updated.profiles.filter((p) => p.analyte !== 'lh');
    if (change === 'duplicate') updated.profiles.push(clone(profile));
    const settings = selected('fsh', selected());
    expect(preferences.resolve(settings, 'lh', updated)).toBeNull();
    expect(preferences.resolve(settings, 'fsh', updated)).not.toBeNull();
  });

  it('wersja danych klinicznych bez zmiany profilu RI nie usuwa ustawienia metody', () => {
    const updated = clone(data); updated.dataVersion = 'new-clinical-data';
    expect(preferences.resolve(selected(), 'lh', updated)).not.toBeNull();
  });

  it('odrzuca brak metadanych profilu zamiast zapisywać pustą metodę', () => {
    const updated = clone(data); delete updated.profiles[0].method;
    expect(preferences.configure(null, 'lh', 'mayo-lh-pediatric', updated)).toEqual(empty());
    expect(preferences.resolve(selected(), 'lh', null)).toBeNull();
  });

  it('błędny nowy wybór wyłącza wcześniejszy profil danego analitu', () => {
    expect(preferences.configure(selected(), 'lh', 'mayo-fsh-pediatric', data)).toEqual(empty());
    expect(preferences.configure(selected(), 'unknown', 'mayo-lh-pediatric', data)).toEqual(selected());
    expect(preferences.resolve(selected(), 'unknown', data)).toBeNull();
  });
});

describe('preferencja korzysta z rzeczywistego adaptera persistence', () => {
  it('klucz jest zarejestrowany, lokalny, a zapis przetrwa ponowny odczyt modułu', () => {
    const { win, adapter, api } = device();
    expect(adapter.MODULE_KEYS.LAB_ASSAY_PROFILES).toBe(preferences.KEY);
    expect(adapter.MODULE_KEY_META[preferences.KEY]).toEqual({ scope: 'laboratory', kind: 'preference', storage: 'local-persistent' });
    expect(api.write(adapter, selected(), data)).toBe(true);
    expect(adapter.readPreferenceJSON('LAB_ASSAY_PROFILES')).toEqual(selected());
    expect(preferences.read(adapter, data)).toEqual(selected());
    expect(JSON.parse(win.localStorage.getItem(preferences.KEY))).toEqual(selected());
  });

  it.each(['setEphemeralMode', 'setCloudOnlyMode'])('pozostaje ustawieniem urządzenia w trybie %s', (mode) => {
    const { win, adapter } = device(); adapter[mode](true);
    expect(preferences.write(adapter, selected(), data)).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(preferences.KEY))).toEqual(selected());
    expect(win.sessionStorage.getItem(`veph:l:${preferences.KEY}`)).toBeNull();
    expect(preferences.read(adapter, data)).toEqual(selected());
  });

  it('czyszczenie danych pacjenta zachowuje profil; jawne czyszczenie preferencji go usuwa', () => {
    const { adapter } = device(); preferences.write(adapter, selected(), data);
    adapter.clearUserState({ source: 'synthetic-test', durationMs: 0 });
    expect(preferences.read(adapter, data)).toEqual(selected());
    adapter.clearModuleState({ includePreferences: true });
    expect(preferences.read(adapter, data)).toEqual(empty());
  });

  it('wybór metody nie uruchamia zapisu ani synchronizacji preferencji konta', () => {
    const { adapter } = device(); const events = [];
    adapter.onPreferenceWrite((event) => events.push(event));
    expect(preferences.write(adapter, selected(), data)).toBe(true);
    expect(events).toEqual([]);
  });

  it('nie naprawia samoczynnie uszkodzonego zapisu podczas odczytu', () => {
    const { adapter, win } = device(); win.localStorage.setItem(preferences.KEY, '{broken-json');
    expect(preferences.read(adapter, data)).toEqual(empty());
    expect(win.localStorage.getItem(preferences.KEY)).toBe('{broken-json');
  });

  it('stary profil pozostaje wyłączony także po ponownym odczycie storage', () => {
    const { adapter, win } = device(); const old = selected(); old.profiles.lh.profileVersion = 'old';
    win.localStorage.setItem(preferences.KEY, JSON.stringify(old));
    expect(preferences.read(adapter, data)).toEqual(empty());
  });

  it('zapis respektuje blokadę adaptera w trakcie czyszczenia', () => {
    const { adapter } = device(); adapter.markClearInProgress(10000);
    expect(preferences.write(adapter, selected(), data)).toBe(false);
    expect(preferences.read(adapter, data)).toEqual(empty());
  });

  it('brak adaptera lub rejestracji nie uruchamia innej ścieżki storage', () => {
    for (const adapter of [null, {}, { readPreferenceJSON() { throw new Error('Unregistered'); } }]) {
      expect(preferences.read(adapter, data)).toEqual(empty());
      expect(preferences.write(adapter, selected(), data)).toBe(false);
    }
    const { adapter } = device();
    const broken = {
      MODULE_KEY_META: adapter.MODULE_KEY_META,
      readPreferenceJSON() { throw new Error('Storage unavailable'); },
      writePreferenceJSON() { throw new Error('Storage unavailable'); },
    };
    expect(preferences.read(broken, data)).toEqual(empty());
    expect(preferences.write(broken, selected(), data)).toBe(false);
  });
});
