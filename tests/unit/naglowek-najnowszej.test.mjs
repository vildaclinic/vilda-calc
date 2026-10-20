import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NAGLOWEK-NAJNOWSZEJ (decyzja właściciela D-3 wariant A, 2026-10-20). Krótki opis karty na liście pacjentów
// (imię i nazwisko, data urodzenia, płeć, wiek; u osoby spoza bazy rok urodzenia i kontakt) liczony zawsze z najnowszej
// wersji karty (kolejność yr, jak getPatient().snapshots[0]), na każdym urządzeniu z jego własnych wersji: po poprawce
// w miejscu, przypięciu, nowej wizycie, scaleniu synchronizacji (także bez nowych wersji), fazie przeniesień, imporcie
// karty, „Scal kopię konta” i odtworzeniu konta. Najnowsza wersja nieczytelna: zostaje dotychczasowy nagłówek.
// Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane fikcyjne.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let licznik = 0;
function okno(licz) {
  const g = globalThis.crypto;
  const crypto = !licz ? g : {
    getRandomValues: (x) => g.getRandomValues(x), randomUUID: () => g.randomUUID(),
    subtle: new Proxy(g.subtle, {
      get(t, k) {
        const f = t[k];
        if (typeof f !== 'function') return f;
        return function (...a) { if (k === 'decrypt') licz['subtle.decrypt'] = (licz['subtle.decrypt'] || 0) + 1; return f.apply(t, a); };
      },
    }),
  };
  const win = {
    crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false }, AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}
// Magazyn z licznikiem wywołań (koszt scalenia w stanie zgodnym).
function zLicznikiem(baza, licz) {
  const adapter = new Proxy(baza, {
    get(t, k) {
      const f = t[k];
      if (typeof f !== 'function') return f;
      return function (...a) { licz[String(k)] = (licz[String(k)] || 0) + 1; return f.apply(t, a); };
    },
  });
  return { adapter };
}
async function urzadzenie(nazwa) {
  licznik += 1;
  const licz = Object.create(null);
  const win = okno(licz);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  const { adapter } = zLicznikiem(baza, licz);
  v.setStorageAdapter(adapter);
  const haslo = `Naglowek#Najnowszej!2026${licznik}aa`;
  const u = await v.createUser(haslo, { label: `${nazwa}${licznik}`, iterations: 10000 });
  const zdarzenia = [];
  v.onPatientSaved((e) => { zdarzenia.push(e); });
  const zeruj = () => { Object.keys(licz).forEach((k) => { delete licz[k]; }); };
  return { nazwa, v, baza, uid: u.userId, haslo, licz, zeruj, zdarzenia };
}
let zegar = Date.parse('2026-10-20T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); return new Date(zegar).toISOString(); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const kopia = (x) => { const y = JSON.parse(JSON.stringify(x)); if (y && typeof y === 'object') delete y.credential; return y; };
// Zapis formularza: nazwa „Nazwisko Imię” (Nn dzieli ją, gdy brak jawnych części), wiek w miesiącach.
const zapis = (nazwa, dob, wiek, extra) => Object.assign({
  name: nazwa,
  timestampISO: new Date().toISOString(),
  user: Object.assign({ sex: 'M', age: Math.floor(wiek / 12), ageMonths: wiek % 12, height: 100 + wiek / 6, weight: 15 + wiek / 12 }, dob ? { dobISO: dob } : {}),
  advanced: { data: { measurements: [{ uid: 'm-' + wiek, ageMonths: wiek, ageYears: wiek / 12, height: 100 + wiek / 6, weight: 15 + wiek / 12 }] } },
}, extra || {});
async function zapisz(d, p, opcje = {}) { przesunZegar(60e3); return d.v.savePatient(p, { dedup: false, ...opcje }); }
const sync = async (z, na) => na.v.mergeSyncPayload(kopia(await z.v.exportSyncPayload()));
const odszyfruj = async (d, z) => kopia(await d.v.decryptPayloadForCurrentUser(z.iv, z.data));
const delta = async (z, na, pid) => na.v.mergeSyncPayload(await odszyfruj(z, await z.v.buildPatientDelta(pid)));
const opis = (h) => (h ? `${h.name}|${h.lastName || '-'}/${h.firstName || '-'}|${h.dobISO || '-'}|${h.sex || '-'}|${h.age}l${h.ageMonths}m` : '(brak)');
async function naglowek(d, pid) {
  const k = (await d.v.listPatients()).concat(await d.v.listExternalPatients()).find((x) => x.patientId === pid);
  return k ? opis(k.header) : '(brak karty)';
}
async function tresc(d, pid, sid) { return kopia((await d.v.getPatient(pid)).snapshots.find((s) => s.snapshotId === sid).payload); }
async function popraw(d, pid, sid, zmien, opcje = { preserveSavedAt: true }) {
  przesunZegar(60e3);
  const pl = await tresc(d, pid, sid);
  zmien(pl);
  return d.v.updateSnapshotPayload(pid, sid, pl, opcje);
}
// Nagłówek zapisany przez dawną wersję aplikacji (np. po edycji starszej wersji przed tą zmianą): wprost w magazynie.
async function wpiszNaglowek(d, pid, h) {
  const rek = await d.baza.getPatientForUser(d.uid, pid);
  await d.baza.putPatientForUser(d.uid, Object.assign({}, rek, { headerCipher: await d.v.encryptPayloadForCurrentUser(h) }));
}
const JAN = 'Testowy Jan|Testowy/Jan|2020-01-01|M';

// Karta: s1 (60 mies.) i s2 (66 mies.), „Testowy Jan”, ur. 2020-01-01; B ma komplet.
async function dwieWersje(nazwaS1) {
  const A = await urzadzenie('A'), B = await urzadzenie('B');
  const s1 = await zapisz(A, zapis(nazwaS1 || 'Testowy Jan', '2020-01-01', 60));
  const pid = s1.patientId;
  const s2 = await zapisz(A, zapis('Testowy Jan', '2020-01-01', 66), { patientId: pid });
  await sync(A, B);
  return { A, B, pid, s1, s2 };
}

describe('P-NAGLOWEK-NAJNOWSZEJ: zmiany na tym urządzeniu', () => {
  it('N1 edycja STARSZEJ wersji (okno pomiaru, preserveSavedAt): lista i getPatient().header z najnowszej, zdarzenie niesie ten nagłówek', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    c.A.zdarzenia.length = 0;
    await popraw(c.A, c.pid, c.s1.snapshotId, (pl) => { pl.name = 'Starszy Jan'; pl.user.dobISO = '2019-05-05'; });
    expect((await tresc(c.A, c.pid, c.s1.snapshotId)).name, 'kontrola: s1 poprawiona').toBe('Starszy Jan');
    expect(await naglowek(c.A, c.pid)).toBe(`${JAN}|5l6m`);
    expect(opis((await c.A.v.getPatient(c.pid)).header)).toBe(`${JAN}|5l6m`);
    expect(c.A.zdarzenia.map((e) => e.header && e.header.name)).toEqual(['Testowy Jan']);
  });

  it('N2 gwiazdka na starszej wersji z literówką: nazwa i wiek na liście z najnowszej, przy przypięciu i odpięciu', async () => {
    sztucznyZegar();
    const c = await dwieWersje('Literowka Jan');
    expect(await naglowek(c.A, c.pid), 'kontrola: przed gwiazdką').toBe(`${JAN}|5l6m`);
    przesunZegar(60e3);
    await c.A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, true);
    expect(await naglowek(c.A, c.pid)).toBe(`${JAN}|5l6m`);
    przesunZegar(60e3);
    await c.A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, false);
    expect(await naglowek(c.A, c.pid)).toBe(`${JAN}|5l6m`);
  });

  it('N3 [kontrola] korekta nazwiska i daty urodzenia NAJNOWSZEJ wersji (jak vilda_name_fix): nagłówek z korekty', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await popraw(c.A, c.pid, c.s2.snapshotId, (pl) => { pl.name = 'Nowak Jan'; pl.user.lastName = 'Nowak'; pl.user.firstName = 'Jan'; pl.user.dobISO = '2020-02-02'; });
    expect(await naglowek(c.A, c.pid)).toBe('Nowak Jan|Nowak/Jan|2020-02-02|M|5l6m');
  });

  it('N4 najnowsza wersja nieczytelna: edycja starszej nie cofa nagłówka do starszej wersji', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A');
    const s1 = await zapisz(A, zapis('Testowy Jan', '2020-01-01', 60));
    const pid = s1.patientId;
    await zapisz(A, zapis('Poprawny Jan', '2020-04-04', 66), { patientId: pid });
    const s3 = await zapisz(A, zapis('Poprawny Jan', '2020-04-04', 72), { patientId: pid });
    const rek = (await A.baza.listSnapshotsForUser(A.uid, pid)).find((s) => s.snapshotId === s3.snapshotId);
    await A.baza.putSnapshotForUser(A.uid, Object.assign({}, rek, { payloadCipher: Object.assign({}, rek.payloadCipher, { data: rek.payloadCipher.data.slice(0, -8) + 'AAAAAAAA' }) }));
    expect((await A.v.getPatient(pid)).snapshots[0].payload, 'kontrola: najnowsza nieczytelna').toBe(null);
    await popraw(A, pid, s1.snapshotId, (pl) => { pl.name = 'Starszy Jan'; });
    expect(await naglowek(A, pid)).toBe('Poprawny Jan|Poprawny/Jan|2020-04-04|M|6l0m');
  });

  it('N5 nowa wizyta, gdy inna wersja ma późniejszą chwilę zapisu (zegar drugiego urządzenia +10 min): nagłówek z najnowszej wg yr', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const s1 = await zapisz(A, zapis('Testowy Jan', '2020-01-01', 60));
    const pid = s1.patientId;
    await sync(A, B);
    vi.setSystemTime(zegar + 10 * 60e3); // zegar B do przodu
    await B.v.savePatient(zapis('Zmieniony Jan', '2020-01-01', 66), { patientId: pid, dedup: false });
    vi.setSystemTime(zegar);
    await sync(B, A);
    expect(await naglowek(A, pid), 'kontrola: po synchronizacji').toBe('Zmieniony Jan|Zmieniony/Jan|2020-01-01|M|5l6m');
    A.zdarzenia.length = 0;
    await zapisz(A, zapis('Testowy Jan', '2020-01-01', 72), { patientId: pid });
    expect((await A.v.getPatient(pid)).snapshots[0].payload.name, 'kontrola: najnowsza wg yr = wersja B').toBe('Zmieniony Jan');
    expect(await naglowek(A, pid)).toBe('Zmieniony Jan|Zmieniony/Jan|2020-01-01|M|5l6m');
    expect(A.zdarzenia.map((e) => e.header && e.header.name)).toEqual(['Zmieniony Jan']);
  });

  it('N6 [kontrola] nowa wizyta z nową nazwą: nagłówek z nowej wersji', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await zapisz(c.A, zapis('Nowak Jan', '2020-01-01', 72), { patientId: c.pid });
    expect(await naglowek(c.A, c.pid)).toBe('Nowak Jan|Nowak/Jan|2020-01-01|M|6l0m');
  });
});

describe('P-NAGLOWEK-NAJNOWSZEJ: odbiorca synchronizacji', () => {
  it('O1 korekta nazwiska i daty urodzenia w miejscu (najnowsza wersja) dociera pełnym ładunkiem: lista, wyszukiwanie, zapis z nową datą dopisuje do karty', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await popraw(c.A, c.pid, c.s2.snapshotId, (pl) => { pl.name = 'Nowak Jan'; pl.user.lastName = 'Nowak'; pl.user.firstName = 'Jan'; pl.user.dobISO = '2020-02-02'; });
    const w = await sync(c.A, c.B);
    expect([w.addedSnapshotCount, w.updatedSnapshotCount], 'kontrola: sama poprawka wersji').toEqual([0, 1]);
    expect(await naglowek(c.B, c.pid)).toBe('Nowak Jan|Nowak/Jan|2020-02-02|M|5l6m');
    expect((await c.B.v.findSameNamePatients('Nowak Jan')).map((x) => `${x.patientId === c.pid}|${x.dobISO}`)).toEqual(['true|2020-02-02']);
    expect(await c.B.v.findSameNamePatients('Testowy Jan')).toEqual([]);
    przesunZegar(60e3);
    const z = await c.B.v.savePatient(zapis('Nowak Jan', '2020-02-02', 72));
    expect([z.patientId === c.pid, z.isNew], 'formularz bez karty: dopisanie do tej samej karty').toEqual([true, false]);
  });

  it('O2 to samo deltą karty (buildPatientDelta)', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await popraw(c.A, c.pid, c.s2.snapshotId, (pl) => { pl.name = 'Nowak Jan'; pl.user.lastName = 'Nowak'; pl.user.firstName = 'Jan'; pl.user.dobISO = '2020-02-02'; });
    c.B.zeruj();
    await delta(c.A, c.B, c.pid);
    expect(await naglowek(c.B, c.pid)).toBe('Nowak Jan|Nowak/Jan|2020-02-02|M|5l6m');
    expect(c.B.licz.putPatientForUser, 'chwila zapisu i nagłówek w jednym zapisie rekordu karty').toBe(1);
  });

  it('O3 poprawka bieżącego pomiaru (wiek) i poprawka STARSZEJ wersji: B ma wiek z najnowszej, starsza nie przestawia nagłówka', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    przesunZegar(60e3);
    await c.A.v.updateMeasurementRow(c.pid, { uid: 'm-66' }, { ageMonths: 67, height: 111, weight: 20.5 });
    await popraw(c.A, c.pid, c.s1.snapshotId, (pl) => { pl.name = 'Starszy Jan'; pl.user.dobISO = '2019-05-05'; });
    await sync(c.A, c.B);
    expect(await naglowek(c.A, c.pid)).toBe(`${JAN}|5l7m`);
    expect(await naglowek(c.B, c.pid)).toBe(`${JAN}|5l7m`);
  });

  it('O4 dawny rozjazd (nagłówek starszej wersji zapisany przez starą aplikację): naprawia się przy pełnym scaleniu, nowe urządzenie dostaje nagłówek najnowszej', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await wpiszNaglowek(c.A, c.pid, { name: 'Stary Jan', lastName: 'Stary', firstName: 'Jan', dobISO: '2019-12-31', sex: 'M', age: 5, ageMonths: 0 });
    expect(await naglowek(c.A, c.pid), 'kontrola: rozjazd na A').toBe('Stary Jan|Stary/Jan|2019-12-31|M|5l0m');
    const C = await urzadzenie('C');
    await sync(c.A, C);
    expect(await naglowek(C, c.pid), 'C: nowa karta z najnowszej wersji, nie z nagłówka A').toBe(`${JAN}|5l6m`);
    await sync(c.B, c.A);
    expect(await naglowek(c.A, c.pid), 'A po pełnym ładunku z B').toBe(`${JAN}|5l6m`);
  });

  it('O5 dwa urządzenia offline zapisują nową wersję (A wcześniej, B później): po wymianie oba z nagłówkiem najnowszej', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await zapisz(c.A, zapis('Nowak Jan', '2020-01-01', 72), { patientId: c.pid });
    await zapisz(c.B, zapis('Kowal Jan', '2020-01-01', 73), { patientId: c.pid });
    await sync(c.A, c.B);
    await sync(c.B, c.A);
    await sync(c.A, c.B);
    expect(await naglowek(c.A, c.pid)).toBe('Kowal Jan|Kowal/Jan|2020-01-01|M|6l1m');
    expect(await naglowek(c.B, c.pid)).toBe('Kowal Jan|Kowal/Jan|2020-01-01|M|6l1m');
  });

  it('O6 ładunek starego klienta z nagłówkiem starszej wersji i nową wersją: odbiorca z kartą i nowe urządzenie liczą z najnowszej', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await zapisz(c.B, zapis('Testowy Jan', '2020-01-01', 72), { patientId: c.pid });
    const lad = kopia(await c.B.v.exportSyncPayload());
    const k = lad.patients.find((p) => p.patientId === c.pid);
    k.header = Object.assign({}, k.header, { name: 'Stary Jan', lastName: 'Stary', firstName: 'Jan', dobISO: '2019-12-31' });
    const w = await c.A.v.mergeSyncPayload(kopia(lad));
    expect(w.addedSnapshotCount, 'kontrola: nowa wersja').toBe(1);
    expect(await naglowek(c.A, c.pid)).toBe(`${JAN}|6l0m`);
    const C = await urzadzenie('C');
    await C.v.mergeSyncPayload(kopia(lad));
    expect(await naglowek(C, c.pid)).toBe(`${JAN}|6l0m`);
  });

  it('O7 [kontrola] stan zgodny: kolejne scalenia (pełne i delty, dwie karty) nie zapisują rekordu karty ani wersji', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await zapisz(c.A, zapis('Inny Pacjent', '2019-01-01', 60));
    await sync(c.A, c.B); await sync(c.B, c.A);
    c.A.zeruj(); c.B.zeruj();
    for (let i = 0; i < 2; i += 1) { await sync(c.A, c.B); await sync(c.B, c.A); await delta(c.A, c.B, c.pid); await delta(c.B, c.A, c.pid); }
    expect([c.A.licz.putPatientForUser || 0, c.A.licz.putSnapshotForUser || 0, c.B.licz.putPatientForUser || 0, c.B.licz.putSnapshotForUser || 0]).toEqual([0, 0, 0, 0]);
    c.B.zeruj();
    await sync(c.A, c.B);
    expect(c.B.licz['subtle.decrypt'] || 0, 'najwyżej nagłówek każdej z 2 kart; wersji nie odszyfrowujemy (ta sama poprawka w ładunku)').toBeLessThanOrEqual(2);
  });

  it('O7b korekta nazwiska na A: na B jeden zapis rekordu karty, potem trzy rundy pełnych scaleń i delt bez zapisów, oba zgodne', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await popraw(c.A, c.pid, c.s2.snapshotId, (pl) => { pl.name = 'Nowak Jan'; pl.user.lastName = 'Nowak'; pl.user.firstName = 'Jan'; });
    c.B.zeruj();
    await sync(c.A, c.B);
    expect(c.B.licz.putPatientForUser, 'runda 1: jeden zapis rekordu karty').toBe(1);
    c.A.zeruj(); c.B.zeruj();
    for (let i = 0; i < 3; i += 1) { await sync(c.A, c.B); await sync(c.B, c.A); await delta(c.A, c.B, c.pid); await delta(c.B, c.A, c.pid); }
    expect([c.A.licz.putPatientForUser || 0, c.B.licz.putPatientForUser || 0], 'bez pętli zapisów').toEqual([0, 0]);
    expect([await naglowek(c.A, c.pid), await naglowek(c.B, c.pid)]).toEqual(['Nowak Jan|Nowak/Jan|2020-01-01|M|5l6m', 'Nowak Jan|Nowak/Jan|2020-01-01|M|5l6m']);
  });

  it('O8 decyzja „treść” (faza przeniesień): poprawka nazwiska w najnowszej wersji karty po 2× „Scal pacjentów” zmienia nagłówek karty docelowej', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const z1 = await zapisz(A, zapis('Zetowski Jan', '2020-03-03', 60));
    const y1 = await zapisz(A, zapis('Igrekowa Jan', '2020-02-02', 60));
    const x1 = await zapisz(A, zapis('Iksinski Jan', '2020-01-01', 60));
    const X = x1.patientId, Z = z1.patientId;
    await sync(A, B);
    przesunZegar(60e3); await A.v.mergePatients(X, y1.patientId);
    przesunZegar(60e3); await A.v.mergePatients(y1.patientId, Z);
    for (const s of (await A.v.getPatient(Z)).snapshots.filter((q) => ![x1, y1, z1].some((w) => w.snapshotId === q.snapshotId))) {
      przesunZegar(60e3); await A.v.moveSnapshotToTrash(Z, s.snapshotId);
    }
    const pz = await A.v.getPatient(Z);
    expect([pz.snapshots[0].snapshotId === x1.snapshotId, pz.snapshots[0].rev], 'kontrola: najnowsza Z = x1 po dwóch scaleniach').toEqual([true, 2]);
    await popraw(B, X, x1.snapshotId, (pl) => { pl.name = 'Iksinska Janina'; pl.user.lastName = 'Iksinska'; pl.user.firstName = 'Janina'; });
    await sync(B, A);
    expect((await A.v.getPatient(Z)).snapshots[0].payload.name, 'kontrola: treść x1 pod Z z poprawką').toBe('Iksinska Janina');
    expect(await naglowek(A, Z)).toBe('Iksinska Janina|Iksinska/Janina|2020-01-01|M|5l0m');
  });

  it('O9 przeniesienie najnowszej wersji karty z powrotem pod starą kartę: karta oddająca bierze nagłówek z pozostałych wersji', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const y1 = await zapisz(A, zapis('Igrekowa Jan', '2020-02-02', 60));
    const x1 = await zapisz(A, zapis('Iksinski Jan', '2020-01-01', 60));
    const X = x1.patientId, Y = y1.patientId;
    await sync(A, B);
    przesunZegar(60e3); await A.v.mergePatients(X, Y);
    for (const s of (await A.v.getPatient(Y)).snapshots.filter((q) => q.snapshotId !== x1.snapshotId && q.snapshotId !== y1.snapshotId)) {
      przesunZegar(60e3); await A.v.moveSnapshotToTrash(Y, s.snapshotId);
    }
    expect(await naglowek(A, Y), 'kontrola: najnowsza Y = x1').toBe('Iksinski Jan|Iksinski/Jan|2020-01-01|M|5l0m');
    await popraw(B, X, x1.snapshotId, (pl) => { pl.user.weight = 21; });
    await sync(B, A);
    expect((await A.v.getPatient(Y)).snapshots.map((s) => s.snapshotId), 'kontrola: x1 wróciła pod X').toEqual([y1.snapshotId]);
    expect(await naglowek(A, Y)).toBe('Igrekowa Jan|Igrekowa/Jan|2020-02-02|M|5l0m');
    expect((await A.v.findSameNamePatients('Iksinski Jan')).map((x) => x.patientId)).toEqual([X]);
  });

  it('O11 [kontrola] „Scal pacjentów” G → F na B i kosz wersji scalenia: na A przeniesiona wersja G jest najnowszą F i daje jej nagłówek', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const f1 = await zapisz(A, zapis('Efowa Ola', '2020-05-05', 60));
    const g1 = await zapisz(A, zapis('Gamma Ola', '2020-05-05', 61));
    const F = f1.patientId, Gk = g1.patientId;
    await sync(A, B);
    przesunZegar(60e3); await B.v.mergePatients(Gk, F);
    for (const s of (await B.v.getPatient(F)).snapshots.filter((q) => q.snapshotId !== f1.snapshotId && q.snapshotId !== g1.snapshotId)) {
      przesunZegar(60e3); await B.v.moveSnapshotToTrash(F, s.snapshotId);
    }
    expect(await naglowek(B, F), 'kontrola: na B najnowsza F = g1').toBe('Gamma Ola|Gamma/Ola|2020-05-05|M|5l1m');
    await sync(B, A);
    expect((await A.v.getPatient(F)).snapshots.map((s) => s.snapshotId), 'kontrola: g1 pod F na A').toEqual([g1.snapshotId, f1.snapshotId]);
    expect(await naglowek(A, F)).toBe('Gamma Ola|Gamma/Ola|2020-05-05|M|5l1m');
  });

  it('O10 [kontrola] kosz najnowszej wersji na A: B po scaleniu z nagłówkiem z pozostałej najnowszej', async () => {
    sztucznyZegar();
    const c = await dwieWersje('Pierwszy Jan');
    przesunZegar(60e3);
    await c.A.v.moveSnapshotToTrash(c.pid, c.s2.snapshotId);
    await sync(c.A, c.B);
    expect(await naglowek(c.B, c.pid)).toBe('Pierwszy Jan|Pierwszy/Jan|2020-01-01|M|5l0m');
  });
});

describe('P-NAGLOWEK-NAJNOWSZEJ: import karty, „Scal kopię konta”, odtworzenie konta', () => {
  it('I1 import starszego pliku karty (0 nowych zapisów) nie cofa nagłówka', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A');
    const s1 = await zapisz(A, zapis('Testowy Jan', '2020-01-01', 60));
    const pid = s1.patientId;
    const plik = await A.v.exportPatientEnvelope(pid);
    await zapisz(A, zapis('Nowak Jan', '2020-02-02', 66), { patientId: pid });
    const w = await A.v.importPatientFromEnvelope(plik, A.haslo);
    expect([w.addedSnapshots, w.skippedSnapshots], 'kontrola').toEqual([0, 1]);
    expect(await naglowek(A, pid)).toBe('Nowak Jan|Nowak/Jan|2020-02-02|M|5l6m');
  });

  it('I2 „Scal kopię konta” przywraca starszą wersję z kosza: nagłówek zostaje z najnowszej (tutejszej, poprawionej w miejscu)', async () => {
    sztucznyZegar();
    const c = await dwieWersje('Pierwszy Jan');
    const kopiaKonta = await c.A.v.exportVaultBackup();
    await popraw(c.A, c.pid, c.s2.snapshotId, (pl) => { pl.name = 'Nowak Jan'; pl.user.lastName = 'Nowak'; pl.user.firstName = 'Jan'; });
    przesunZegar(60e3);
    await c.A.v.moveSnapshotToTrash(c.pid, c.s1.snapshotId);
    const w = await c.A.v.mergeVaultBackup(kopiaKonta, c.A.haslo);
    expect(w.addedSnapshotCount, 'kontrola: s1 wraca z kopii').toBe(1);
    expect(await naglowek(c.A, c.pid)).toBe('Nowak Jan|Nowak/Jan|2020-01-01|M|5l6m');
  });

  it('I3 odtworzenie konta z kopii z nieaktualnym nagłówkiem: nagłówek z najnowszej wersji kopii', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await wpiszNaglowek(c.A, c.pid, { name: 'Stary Jan', lastName: 'Stary', firstName: 'Jan', dobISO: '2019-12-31', sex: 'M', age: 5, ageMonths: 0 });
    const kopiaKonta = await c.A.v.exportVaultBackup();
    const R = okno().VildaVault;
    R.setStorageAdapter(R.createInMemoryAdapter());
    await R.restoreVaultBackup(kopiaKonta, c.A.haslo);
    const k = (await R.listPatients()).find((x) => x.patientId === c.pid);
    expect(opis(k && k.header)).toBe(`${JAN}|5l6m`);
  });

  it('I4 [kontrola] „Scal kopię konta” z nowszą wersją z kopii: nagłówek z niej', async () => {
    sztucznyZegar();
    const c = await dwieWersje();
    await zapisz(c.B, zapis('Kowal Jan', '2020-01-01', 72), { patientId: c.pid });
    const kopiaB = await c.B.v.exportVaultBackup();
    await c.A.v.mergeVaultBackup(kopiaB, c.B.haslo);
    expect(await naglowek(c.A, c.pid)).toBe('Kowal Jan|Kowal/Jan|2020-01-01|M|6l0m');
  });
});
