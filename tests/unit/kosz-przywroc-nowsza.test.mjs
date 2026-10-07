import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOSZ-PRZYWROC-NOWSZA (zlecenie właściciela 2026-10-07: rekomendacja do punktu A10, krok 1).
//
// Zapis bywa jednocześnie w karcie i w koszu. Tak zostawia go wyścig „Przywróć” z końcem scalania synchronizacji
// (A10: koniec scalania zapisuje listę nagrobków już po zwolnieniu blokad i dokłada wpis, który „Przywróć” właśnie
// zdjął) albo starsza wersja aplikacji w innej karcie. „Przywróć” kliknięte drugi raz zapisywało wtedy do karty treść
// z chwili usunięcia, z rewizją usunięcia + 1: poprawka pomiaru albo przypięcie zrobione po pierwszym przywróceniu
// znikały po cichu, a komunikat mówił „Przywrócono zapis z kosza”.
//
// Reguła po zmianie: gdy zapis jest w karcie i zmieniono go po usunięciu — chwila zmiany późniejsza niż usunięcie ALBO
// rewizja wyższa niż w chwili usunięcia (rewizja nie zależy od zegarów urządzeń) — „Przywróć” nie zapisuje treści
// z kosza, tylko zdejmuje nieaktualny wpis kosza i zwraca { alreadyInCard: true }.
//
// Stan „w karcie i w koszu” odtwarzamy wprost: po zwykłym przywróceniu wpis kosza wraca do metadanych konta — dokładnie
// to robi końcowy zapis scalania w A10. Prawdziwy vilda_vault.js na magazynie w pamięci. Dane wyłącznie FIKCYJNE.

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

let licznik = 0;
async function urzadzenie() {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja wyłączona: test liczy wersje sam
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(baza);
  await v.createUser(`Kosz#Przywroc!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  return { v, baza, uid: u.userId };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pomiar = (ageMonths, wzrost) => ({
  uid: `m-${ageMonths}`, ageMonths, ageYears: ageMonths / 12, height: wzrost || 90 + ageMonths / 2, weight: 12 + ageMonths / 6,
});
const payload = (wieki, wzrosty = {}) => ({
  name: 'Testowy Pawel',
  user: { lastName: 'Testowy', firstName: 'Pawel', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map((m) => pomiar(m, wzrosty[m])) } },
});
const wzrost = (snap, m) => ((((snap || {}).payload || {}).advanced || {}).data || { measurements: [] })
  .measurements.find((x) => x.ageMonths === m)?.height;

async function karta(v) {
  const a = await v.savePatient(payload([60]), { dedup: false });
  for (const w of [[60, 66], [60, 66, 72]]) {
    await chwila(5);
    await v.savePatient(payload(w), { patientId: a.patientId, dedup: false });
  }
  return a.patientId;
}

const wersja = async (v, pid, sid) => (await v.getPatient(pid)).snapshots.find((s) => s.snapshotId === sid) || null;
const wKoszu = async (v, sid) => (await v.listTrashedSnapshots()).some((e) => e.snapshotId === sid);

/* Środkowa wersja S do kosza; „pierwsze Przywróć”; potem wpis kosza wraca do metadanych (stan po A10). */
async function wKarcieIWKoszu(d, { usuniecie } = {}) {
  const pid = await karta(d.v);
  const S = (await d.v.getPatient(pid)).snapshots[1].snapshotId;
  await chwila(5);
  await (usuniecie || ((f) => f()))(() => d.v.moveSnapshotToTrash(pid, S));
  const listaZKoszem = (await d.baza.getUserMeta(d.uid)).snapshotTombstones;
  await chwila(5);
  await d.v.restoreTrashedSnapshot(pid, S);
  const meta = await d.baza.getUserMeta(d.uid);
  await d.baza.putUserMeta(d.uid, Object.assign({}, meta, { snapshotTombstones: listaZKoszem }));
  expect(await wersja(d.v, pid, S), 'kontrola: zapis jest w karcie').not.toBeNull();
  expect(await wKoszu(d.v, S), 'kontrola: i jednocześnie w koszu').toBe(true);
  return { pid, S };
}

/* Zegar urządzenia przesunięty o 10 minut do przodu (usunięcie na urządzeniu ze śpieszącym się zegarem). */
async function zegarDoPrzodu(fn) {
  const Prawdziwa = globalThis.Date;
  class Szybka extends Prawdziwa {
    constructor(...a) { if (a.length) super(...a); else super(Prawdziwa.now() + 600000); }
    static now() { return Prawdziwa.now() + 600000; }
  }
  globalThis.Date = Szybka;
  try { return await fn(); } finally { globalThis.Date = Prawdziwa; }
}

describe('„Przywróć” nie nadpisuje zapisu, który jest już w karcie w nowszej postaci', () => {
  it('poprawka pomiaru i przypięcie po pierwszym przywróceniu zostają; zapis znika z kosza', async () => {
    const d = await urzadzenie();
    const { pid, S } = await wKarcieIWKoszu(d);
    await chwila(5);
    await d.v.updateSnapshotPayload(pid, S, payload([60, 66], { 66: 150 }), { preserveSavedAt: true });
    await chwila(5);
    await d.v.setSnapshotPinned(pid, S, true);
    const przed = await wersja(d.v, pid, S);

    const wynik = await d.v.restoreTrashedSnapshot(pid, S);
    expect(wynik).toMatchObject({ patientId: pid, snapshotId: S, alreadyInCard: true });
    const po = await wersja(d.v, pid, S);
    expect(wzrost(po, 66), 'poprawka wzrostu zostaje').toBe(150);
    expect(po.pinned, 'przypięcie zostaje').toBe(true);
    expect(po.rev, 'rewizja bez zmian — nic nie zapisano').toBe(przed.rev);
    expect(await wKoszu(d.v, S), 'nieaktualny wpis zniknął z kosza').toBe(false);
  });

  it('rozjazd zegarów: usunięcie z zegarem 10 min do przodu — poprawka zostaje dzięki rewizji', async () => {
    const d = await urzadzenie();
    const { pid, S } = await wKarcieIWKoszu(d, { usuniecie: zegarDoPrzodu });
    await chwila(5);
    await d.v.updateSnapshotPayload(pid, S, payload([60, 66], { 66: 150 }), { preserveSavedAt: true });
    const przed = await wersja(d.v, pid, S);
    expect(przed.updatedAtISO < (await d.baza.getUserMeta(d.uid)).snapshotTombstones[0].deletedAtISO,
      'kontrola: chwila poprawki jest WCZEŚNIEJSZA niż zapisane usunięcie').toBe(true);

    const wynik = await d.v.restoreTrashedSnapshot(pid, S);
    expect(wynik.alreadyInCard).toBe(true);
    expect(wzrost(await wersja(d.v, pid, S), 66), 'poprawka wzrostu zostaje').toBe(150);
    expect(await wKoszu(d.v, S)).toBe(false);
  });

  it('drugie „Przywróć” bez zmian w karcie: zapis zostaje, znika z kosza, rewizja się nie zmienia', async () => {
    const d = await urzadzenie();
    const { pid, S } = await wKarcieIWKoszu(d);
    const przed = await wersja(d.v, pid, S);
    const wynik = await d.v.restoreTrashedSnapshot(pid, S);
    expect(wynik.alreadyInCard).toBe(true);
    const po = await wersja(d.v, pid, S);
    expect(po.rev).toBe(przed.rev);
    expect(wzrost(po, 66)).toBe(wzrost(przed, 66));
    expect(await wKoszu(d.v, S)).toBe(false);
  });

  it('kontrola: zwykłe przywrócenie (zapisu nie ma w karcie) działa jak dotąd', async () => {
    const d = await urzadzenie();
    const pid = await karta(d.v);
    const S = (await d.v.getPatient(pid)).snapshots[1].snapshotId;
    const przedUsunieciem = await wersja(d.v, pid, S);
    await chwila(5);
    await d.v.moveSnapshotToTrash(pid, S);
    expect(await wersja(d.v, pid, S)).toBeNull();

    const wynik = await d.v.restoreTrashedSnapshot(pid, S);
    expect(wynik).toEqual({ patientId: pid, snapshotId: S });
    const po = await wersja(d.v, pid, S);
    expect(po.rev, 'rewizja usunięcia + 1').toBe(przedUsunieciem.rev + 1);
    expect(po.savedAtISO, 'zapis wraca na swoje miejsce w historii').toBe(przedUsunieciem.savedAtISO);
    expect(wzrost(po, 66)).toBe(wzrost(przedUsunieciem, 66));
    expect(await wKoszu(d.v, S)).toBe(false);
  });
});
