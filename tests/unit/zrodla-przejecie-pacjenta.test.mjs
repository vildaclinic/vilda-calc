import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ZRODLA-PRZEJECIE (2026-10-06, uwaga Codex P1 do #491).
//
// Panel powłoki app.html przejmuje pacjenta wczytanego w innej ramce w vildaPersistRestoreAll
// (P-POWLOKA-ID): bierze go z sesji karty, odtwarza formularz i kończy zdarzeniem
// `vilda:persist-restored`. `vilda:patient-loaded` dostaje tylko ramka, która pacjenta wczytała.
// Źródła rozpoznania DS i danych okołoporodowych przeładowywały się wyłącznie na patient-loaded
// (oraz przy okazji: auth-hidden, sync-status-changed), więc po powrocie do DocPro przyciskiem
// „Wstecz” liczyły dla nowego pacjenta z rekordu poprzedniego — siatki DS i ściąga B.64
// z danymi urodzeniowymi innego dziecka. Zmierzone w prawdziwej powłoce: e2e
// powloka-zrodla-wstecz.spec.mjs.
//
// Testy wołają prawdziwe moduły na atrapie okna (dokument i okno jako EventTarget, sejf
// z kontrolowanymi obietnicami). Dane fikcyjne.

const A = 'pacjent-a-fikcyjny';
const C = 'pacjent-c-fikcyjny';

const REKORDY = {
  [A]: {
    name: 'Testowy Adam',
    user: { sex: 'M' },
    clinical: { downSyndrome: true },
    perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 },
  },
  [C]: { name: 'Probny Cezary', user: { sex: 'M' } },
};

function magazyn() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/* Sejf, w którym każdy odczyt czeka na jawne „oddaj” — kolejność odpowiedzi ustala test. */
function sejf() {
  const czekajace = [];
  return {
    czekajace,
    isUnlocked: () => true,
    getPatient: (id) => new Promise((res) => { czekajace.push({ id, oddaj: () => res({ snapshots: [{ payload: REKORDY[id] }] }) }); }),
    async oddajWszystkie() {
      while (czekajace.length) czekajace.shift().oddaj();
      await new Promise((r) => { setTimeout(r, 0); });
    },
  };
}

function okno() {
  const w = new EventTarget();
  w.document = new EventTarget();
  w.document.readyState = 'complete';
  w.sessionStorage = magazyn();
  w.VildaVault = sejf();
  return w;
}

const ZRODLA = [
  {
    plik: 'vilda_ds_source.js',
    stan: (w) => w.VildaPopulacjaPacjenta(),
    dlaA: 'DS',
    dlaC: 'OGOLNA',
  },
  {
    plik: 'vilda_perinatal_source.js',
    stan: (w) => {
      const k = w.VildaPerinatalSource.zKartyPacjenta();
      return k ? `${k.weeks}+${k.days} tc, ${k.weight} g` : null;
    },
    dlaA: '34+2 tc, 1650 g',
    dlaC: null,
  },
];

/* Ramka DocPro, która zna pacjenta A (wczytanego wcześniej, jak w e2e). */
async function ramkaZPacjentemA(plik) {
  const w = okno();
  w.sessionStorage.setItem('vildaCurrentPatientId', A);
  w._vildaCurrentPatientId = A;
  loadBrowserScript(plik, w);
  await new Promise((r) => { setTimeout(r, 0); }); // odczyt startowy (DOMContentLoaded już był)
  await w.VildaVault.oddajWszystkie();
  return w;
}

/* Inna ramka wczytała C: sesja karty jest wspólna, zmienna tej ramki jeszcze nie. */
function startWczytujeC(w) {
  w.sessionStorage.setItem('vildaCurrentPatientId', C);
}

describe.each(ZRODLA)('$plik nadąża za pacjentem przejętym z sesji karty', ({ plik, stan, dlaA, dlaC }) => {
  it('kontrola: ramka zna pacjenta A', async () => {
    const w = await ramkaZPacjentemA(plik);
    expect(stan(w)).toBe(dlaA);
  });

  it('vilda:persist-restored po przejęciu C — źródło liczy dla C, nie z rekordu A', async () => {
    const w = await ramkaZPacjentemA(plik);
    startWczytujeC(w);
    w._vildaCurrentPatientId = C; // vildaPersistRestoreAll przyjmuje pacjenta z sesji karty…
    w.document.dispatchEvent(new Event('vilda:persist-restored')); // …i kończy tym zdarzeniem
    expect(w.VildaVault.czekajace.map((x) => x.id)).toEqual([C]);
    await w.VildaVault.oddajWszystkie();
    expect(stan(w)).toBe(dlaC);
  });

  it('zmiana pacjenta sesji karty w innej ramce (storage) — odczyt C, choć zmienna ramki wskazuje jeszcze A', async () => {
    const w = await ramkaZPacjentemA(plik);
    startWczytujeC(w);
    w.dispatchEvent(Object.assign(new Event('storage'), { key: 'vildaCurrentPatientId' }));
    expect(w.VildaVault.czekajace.map((x) => x.id)).toEqual([C]);
    await w.VildaVault.oddajWszystkie();
    expect(stan(w)).toBe(dlaC);
  });

  it('inny klucz w storage nie budzi odczytu', async () => {
    const w = await ramkaZPacjentemA(plik);
    w.dispatchEvent(Object.assign(new Event('storage'), { key: 'sharedUserData' }));
    expect(w.VildaVault.czekajace).toHaveLength(0);
  });

  it('nowszy odczyt wygrywa: spóźniona odpowiedź dla A nie nadpisuje C', async () => {
    const w = await ramkaZPacjentemA(plik);
    w.document.dispatchEvent(new Event('vilda:sync-status-changed')); // odczyt A w locie
    startWczytujeC(w);
    w._vildaCurrentPatientId = C;
    w.document.dispatchEvent(new Event('vilda:persist-restored')); // odczyt C
    const [odczytA, odczytC] = w.VildaVault.czekajace.splice(0);
    expect([odczytA.id, odczytC.id]).toEqual([A, C]);
    odczytC.oddaj();
    await new Promise((r) => { setTimeout(r, 0); });
    odczytA.oddaj();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(stan(w)).toBe(dlaC);
  });

  it('sesja karty pacjenta nie zna — zostaje zmienna ramki (jak dotąd)', async () => {
    const w = await ramkaZPacjentemA(plik);
    w.sessionStorage.removeItem('vildaCurrentPatientId');
    w._vildaCurrentPatientId = C;
    w.document.dispatchEvent(new Event('vilda:auth-hidden'));
    expect(w.VildaVault.czekajace.map((x) => x.id)).toEqual([C]);
    await w.VildaVault.oddajWszystkie();
    expect(stan(w)).toBe(dlaC);
  });
});
