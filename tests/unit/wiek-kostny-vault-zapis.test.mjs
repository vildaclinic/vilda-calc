import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Rzeczywisty zapis/odczyt vilda_vault.js. Wszystkie dane i magazyny są fikcyjne.
function magazyn() {
  const dane = new Map();
  return {
    getItem: (klucz) => dane.get(klucz) ?? null,
    setItem: (klucz, wartosc) => dane.set(klucz, String(wartosc)),
    removeItem: (klucz) => dane.delete(klucz),
    key: (indeks) => [...dane.keys()][indeks] ?? null,
    get length() { return dane.size; },
  };
}

let vault;
beforeAll(async () => {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder,
    btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#WiekKostny2026!Zapis', { label: 'Test BA', iterations: 10000 });
});
afterAll(() => vault?.lock());

const badanie = (years = 8, atAgeMonths = 120, dateISO = '2025-01-01') => ({
  years, atAgeMonths, dateISO, source: 'advanced',
});
const kontekst = (current, last = current) => ({ version: 1, current, last });
const pomiar = () => ({ ageMonths: 120, ageYears: 10, height: 140, weight: 30 });
const advancedV1 = (context, measurements = [pomiar()]) => ({
  boneAgeYears: context.current?.years ?? null,
  boneAgeContext: context,
  data: {
    measurements,
    boneAgeContext: structuredClone(context),
    boneAgeMonths: (context.current?.years ?? context.last?.years ?? null) == null
      ? null : (context.current?.years ?? context.last.years) * 12,
  },
});
function payload(ageMonths, advanced) {
  const wynik = {
    name: 'Fikcyjny Pacjent BA',
    user: {
      firstName: 'Fikcyjny', lastName: 'Pacjent BA', sex: 'M',
      age: Math.floor(ageMonths / 12), ageMonths: ageMonths % 12,
      height: 140, weight: 30,
    },
  };
  if (advanced !== undefined) wynik.advanced = advanced;
  return wynik;
}
async function dwaZapisy(poprzedni, nastepny) {
  const zapis = await vault.savePatient(poprzedni, { dedup: false });
  const nowy = await vault.savePatient(nastepny, { patientId: zapis.patientId });
  const pacjent = await vault.getPatient(zapis.patientId);
  return pacjent.snapshots.find((snapshot) => snapshot.snapshotId === nowy.snapshotId).payload;
}

describe('Wiek kostny v1 w ochronie zapisu sejfu', () => {
  it('rzeczywisty kolektor strony bez pola BA z załadowanym modelem zachowuje zapisane badanie pacjenta', async () => {
    const fields = {
      name: { value: 'Fikcyjny Pacjent BA' }, age: { value: '10' }, ageMonths: { value: '6' },
      height: { value: '141' }, weight: { value: '31' }, sex: { value: 'M' },
    };
    const win = {
      document: {
        readyState: 'complete', addEventListener() {}, removeEventListener() {},
        getElementById: (id) => fields[id] || null, querySelector: () => null, querySelectorAll: () => [],
      },
      addEventListener() {}, removeEventListener() {},
      localStorage: magazyn(), sessionStorage: magazyn(), location: { pathname: '/klirens.html' },
      setTimeout: () => 1, clearTimeout() {},
    };
    win.window = win; win.self = win; win.globalThis = win;
    loadBrowserScript('vilda_bone_age.js', win);
    loadBrowserScript('vilda_data_import_export.js', win);
    const context = kontekst(badanie());
    const incoming = win.VildaDataImportExport.collectUserData();
    const wynik = await dwaZapisy(payload(120, advancedV1(context)), incoming);
    expect(wynik.advanced.boneAgeYears).toBe(8);
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
    expect(incoming.user.ageMonths).toBe(6);
  });

  it('jawny current:null nie dziedziczy poprzedniego scalar BA, zachowując last i historię pomiarów', async () => {
    const last = badanie();
    const context = kontekst(null, last);
    const wynik = await dwaZapisy(
      payload(120, { boneAgeYears: 8, motherHeight: 165, data: { measurements: [pomiar()] } }),
      payload(126, advancedV1(context)),
    );

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
    expect(wynik.advanced.data.measurements).toEqual([pomiar()]);
    expect(wynik.advanced.motherHeight).toBe(165);
  });

  it('current:null przetrwa także ochronę total-wipe bez nowych pomiarów i wzrostów rodziców', async () => {
    const context = kontekst(null, badanie());
    const wynik = await dwaZapisy(
      payload(120, { boneAgeYears: 8, fatherHeight: 180, data: { measurements: [pomiar()] } }),
      payload(126, advancedV1(context, [])),
    );

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
    expect(wynik.advanced.data.measurements).toEqual([pomiar()]);
    expect(wynik.advanced.fatherHeight).toBe(180);
  });

  it('nowe badanie o tej samej BA zachowuje jawny current z nowym wiekiem i datą', async () => {
    const nowe = badanie(8, 126, '2025-07-01');
    const context = kontekst(nowe);
    const wynik = await dwaZapisy(
      payload(120, advancedV1(kontekst(badanie()))),
      payload(126, advancedV1(context)),
    );

    expect(wynik.advanced.boneAgeYears).toBe(8);
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
  });

  it('jawny pusty current i last nie wskrzesza poprzedniego kontekstu ani efektywnej BA', async () => {
    const context = kontekst(null, null);
    const wynik = await dwaZapisy(
      payload(120, advancedV1(kontekst(badanie()))),
      payload(126, advancedV1(context, [])),
    );

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBeNull();
    expect(wynik.advanced.data.measurements).toEqual([pomiar()]);
  });

  it('rozpoznaje jawny v1 w lustrze advanced.data, gdy brak pola na poziomie advanced', async () => {
    const context = kontekst(null, badanie());
    const nastepny = advancedV1(context);
    delete nastepny.boneAgeContext;
    const wynik = await dwaZapisy(
      payload(120, { boneAgeYears: 8, data: { measurements: [pomiar()] } }),
      payload(126, nastepny),
    );

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
  });

  it('strona bez kontekstu zachowuje poprzedni v1 i scalar bez zmiany wieku oraz daty badania', async () => {
    const context = kontekst(badanie());
    const wynik = await dwaZapisy(
      payload(120, advancedV1(context)),
      payload(126, { data: { measurements: [pomiar()] } }),
    );

    expect(wynik.advanced.boneAgeYears).toBe(8);
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
  });

  it('brak advanced chroni poprzedni v1 z samym last, nawet bez legacy scalar i pomiarów', async () => {
    const context = kontekst(null, badanie());
    const wynik = await dwaZapisy(payload(120, advancedV1(context, [])), payload(126));

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
  });

  it('brak kontekstu nie zamienia poprzedniego current:null w bieżące badanie', async () => {
    const context = kontekst(null, badanie());
    const wynik = await dwaZapisy(
      payload(120, advancedV1(context)),
      payload(126, { boneAgeYears: 8, data: { measurements: [pomiar()] } }),
    );

    expect(wynik.advanced.boneAgeYears).toBeNull();
    expect(wynik.advanced.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeContext).toEqual(context);
    expect(wynik.advanced.data.boneAgeMonths).toBe(96);
  });
});

describe('Legacy BA bez kontekstu v1 zachowuje dotychczasową ochronę', () => {
  it.each([undefined, null])('brak BA (%s) w istniejących pomiarach nadal dziedziczy poprzedni scalar', async (boneAgeYears) => {
    const nastepny = { data: { measurements: [pomiar()] } };
    if (boneAgeYears !== undefined) nastepny.boneAgeYears = boneAgeYears;
    const wynik = await dwaZapisy(
      payload(120, { boneAgeYears: 8, data: { measurements: [pomiar()] } }),
      payload(126, nastepny),
    );

    expect(wynik.advanced.boneAgeYears).toBe(8);
    expect(wynik.advanced.boneAgeContext).toBeUndefined();
    expect(wynik.advanced.data.measurements).toEqual([pomiar()]);
  });

  it('brak advanced nadal odzyskuje poprzednie advanced wraz z BA i pomiarami', async () => {
    const poprzednie = { boneAgeYears: 8, motherHeight: 165, data: { measurements: [pomiar()] } };
    const wynik = await dwaZapisy(payload(120, poprzednie), payload(126));
    expect(wynik.advanced).toEqual(poprzednie);
  });
});
