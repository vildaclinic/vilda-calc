import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ZMIANA-W-KARCIE (decyzje właściciela D-4 A i D-5 B, 2026-10-20). Każda zmiana w karcie liczy się jak nowy zapis:
// poprawka i usunięcie wiersza historii, gwiazdka (w obie strony), edycja starszej wersji i wpis historyczny z okna
// pomiaru, korekta nazwiska, „Przywróć” z kosza i przeniesienie wersji do kosza podnoszą lastSavedAtISO karty do
// max(stare, chwila zmiany). Chwila zapisu karty nigdy nie maleje (przebudowa nagłówka, kosz z innego urządzenia,
// retencja, deleteSnapshot). Skutek: karta zmieniona po usunięciu pacjenta na innym urządzeniu przeżywa (nagrobek
// pacjenta wygrywa tylko przy deletedAtISO ≥ lastSavedAtISO), jak dotąd przy nowej wizycie. Prawdziwy vilda_vault.js,
// sejfy w pamięci, dane fikcyjne.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let licznik = 0;
async function urzadzenie(nazwa) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false }, AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // bez retencji po zapisie; przycinanie tylko jawnie
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const pamiec = v.createInMemoryAdapter();
  v.setStorageAdapter(pamiec);
  await v.createUser(`Zmiana#Karta!2026${licznik}aa`, { label: `${nazwa}${licznik}`, iterations: 10000 });
  return { nazwa, v, pamiec };
}
let zegar = Date.parse('2026-10-20T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); return new Date(zegar).toISOString(); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const kopia = (x) => { const y = JSON.parse(JSON.stringify(x)); if (y && typeof y === 'object') delete y.credential; return y; };
const W60 = { uid: 'm-60', ageMonths: 60, height: 110, weight: 18 };
const W66 = { uid: 'm-66', ageMonths: 66, height: 113, weight: 19 };
const W72 = { uid: 'm-72', ageMonths: 72, height: 116, weight: 20 };
const zapis = (wiersze, biezacy, imie) => ({
  name: imie || 'Przykladowy Kamil',
  user: { sex: 'M', age: Math.floor(biezacy.ageMonths / 12), ageMonths: biezacy.ageMonths % 12, height: biezacy.height, weight: biezacy.weight },
  advanced: { data: { measurements: wiersze.map((w) => Object.assign({ ageYears: w.ageMonths / 12 }, w)) } },
});
async function zapisz(d, p, opcje = {}) { przesunZegar(60e3); return d.v.savePatient(p, { dedup: false, ...opcje }); }
const sync = async (z, na) => { await na.v.mergeSyncPayload(kopia(await z.v.exportSyncPayload())); };
const odszyfruj = async (d, z) => kopia(await d.v.decryptPayloadForCurrentUser(z.iv, z.data));
async function karta(d, pid) { return (await d.v.listPatients()).find((x) => x.patientId === pid) || null; }
async function ostatni(d, pid) { const k = await karta(d, pid); return k ? k.lastSavedAtISO : null; }
async function ileWersji(d, pid) { const p = await d.v.getPatient(pid); return p ? p.snapshots.length : 0; }
async function nagrobekPacjenta(d, pid) { return ((await d.v.exportSyncPayload()).tombstones || []).find((t) => t.patientId === pid) || null; }
async function wiersze(d, pid, sid) {
  const p = await d.v.getPatient(pid);
  const s = p && p.snapshots.find((q) => q.snapshotId === sid);
  if (!s) return null;
  const m = (s.payload.advanced && s.payload.advanced.data && s.payload.advanced.data.measurements) || [];
  return `${m.map((w) => `${w.ageMonths}:${w.height}`).join(',')}|${s.payload.user.weight}|${s.payload.user.lastName || '-'}/${s.payload.user.firstName || '-'}${s.payload._pinned ? '|*' : ''}`;
}

// Karta z dwiema wersjami (s1: 60 i 66 mies., s2: 60, 66 i 72 mies.) na A; B i C dostają komplet.
async function trzyUrzadzenia() {
  const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
  const s1 = await zapisz(A, zapis([W60, W66], W66));
  const pid = s1.patientId;
  const s2 = await zapisz(A, zapis([W60, W66, W72], W72), { patientId: pid });
  await sync(A, B); await sync(A, C);
  return { A, B, C, pid, s1, s2 };
}
async function tresc(d, pid, sid) { return (await d.v.getPatient(pid)).snapshots.find((s) => s.snapshotId === sid).payload; }

// Zmiany w karcie bez nowej wersji (D-4 A): [nazwa, przygotowanie przed usunięciem na B, zmiana, wersja, oczekiwana treść].
const ZMIANY = [
  ['poprawka wiersza historii (updateMeasurementRow)', null,
    (A, c) => A.v.updateMeasurementRow(c.pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 }), 's2', '60:110.8,66:113,72:116|20|-/-'],
  ['poprawka bieżącego pomiaru (updateMeasurementRow)', null,
    (A, c) => A.v.updateMeasurementRow(c.pid, { uid: 'm-72' }, { ageMonths: 72, height: 116.5, weight: 20 }), 's2', '60:110,66:113,72:116.5|20|-/-'],
  ['usunięcie wiersza historii (deleteMeasurementRow)', null,
    (A, c) => A.v.deleteMeasurementRow(c.pid, { uid: 'm-66' }), 's2', '60:110,72:116|20|-/-'],
  ['gwiazdka: przypięcie', null,
    (A, c) => A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, true), 's1', '60:110,66:113|19|-/-|*'],
  ['gwiazdka: odpięcie', (A, c) => A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, true),
    (A, c) => A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, false), 's1', '60:110,66:113|19|-/-'],
  ['okno pomiaru: edycja starszej wersji (preserveSavedAt)', null, async (A, c) => {
    const pl = kopia(await tresc(A, c.pid, c.s1.snapshotId)); pl.user.weight = 19.4;
    return A.v.updateSnapshotPayload(c.pid, c.s1.snapshotId, pl, { preserveSavedAt: true });
  }, 's1', '60:110,66:113|19.4|-/-'],
  ['okno pomiaru: wpis historyczny (preserveSavedAt)', null, async (A, c) => {
    const pl = kopia(await tresc(A, c.pid, c.s2.snapshotId));
    pl.advanced.data.measurements.push({ uid: 'm-54', ageMonths: 54, ageYears: 4.5, height: 107, weight: 17 });
    return A.v.updateSnapshotPayload(c.pid, c.s2.snapshotId, pl, { preserveSavedAt: true });
  }, 's2', '60:110,66:113,72:116,54:107|20|-/-'],
  ['korekta nazwiska (vilda_name_fix, preserveSavedAt)', null, async (A, c) => {
    const pl = await tresc(A, c.pid, c.s2.snapshotId);
    const kor = Object.assign({}, pl, { name: 'Kamil Przykladowy', user: Object.assign({}, pl.user, { firstName: 'Przykladowy', lastName: 'Kamil' }) });
    return A.v.updateSnapshotPayload(c.pid, c.s2.snapshotId, kor, { preserveSavedAt: true });
  }, 's2', '60:110,66:113,72:116|20|Kamil/Przykladowy'],
];
const KOLEJNOSCI = ['A→B, potem B→A', 'B→A, potem A→B', 'C: delta A, potem delta nagrobka B'];

async function wymianaPoUsunieciu(c, kolejnosc, tb) {
  const { A, B, C, pid } = c;
  if (kolejnosc === 'A→B, potem B→A') { await sync(A, B); await sync(B, A); return [A, B]; }
  if (kolejnosc === 'B→A, potem A→B') { await sync(B, A); await sync(A, B); return [A, B]; }
  await C.v.mergeSyncPayload(await odszyfruj(A, await A.v.buildPatientDelta(pid)));
  await C.v.mergeSyncPayload(await odszyfruj(B, await B.v.buildTombstoneDelta(pid, tb.deletedAtISO)));
  return [A, C];
}

describe('P-ZMIANA-W-KARCIE (D-4 A): zmiana w karcie po usunięciu pacjenta na innym urządzeniu', () => {
  for (const [nazwa, przygotuj, zmien, ktora, oczekiwana] of ZMIANY) {
    for (const kolejnosc of KOLEJNOSCI) {
      it(`${nazwa} (${kolejnosc}): karta zostaje z tą zmianą, lastSavedAtISO = chwila zmiany, miejsce wersji bez zmian`, async () => {
        sztucznyZegar();
        const c = await trzyUrzadzenia();
        const sid = c[ktora].snapshotId;
        if (przygotuj) { przesunZegar(60e3); await przygotuj(c.A, c); await sync(c.A, c.B); await sync(c.A, c.C); }
        const savedPrzed = (await c.A.v.getPatient(c.pid)).snapshots.find((s) => s.snapshotId === sid).savedAtISO;
        przesunZegar(60e3);
        await c.B.v.removePatient(c.pid);
        const tb = await nagrobekPacjenta(c.B, c.pid);
        const chwilaZmiany = przesunZegar(60e3); // A nie wie o usunięciu
        await zmien(c.A, c);
        expect(await ostatni(c.A, c.pid), 'A: chwila zapisu karty = chwila zmiany').toBe(chwilaZmiany);
        const w = (await c.A.v.getPatient(c.pid)).snapshots.find((s) => s.snapshotId === sid);
        expect(w.savedAtISO, 'savedAtISO wersji (miejsce w historii) bez zmian').toBe(savedPrzed);
        expect(w.updatedAtISO).toBe(chwilaZmiany);
        przesunZegar(60e3);
        const [d1, d2] = await wymianaPoUsunieciu(c, kolejnosc, tb);
        for (const d of [d1, d2]) {
          expect(await karta(d, c.pid), `${d.nazwa}: karta jest`).not.toBeNull();
          expect(await ostatni(d, c.pid), `${d.nazwa}: ta sama chwila zapisu`).toBe(chwilaZmiany);
          expect(await wiersze(d, c.pid, sid), `${d.nazwa}: zmiana zachowana`).toBe(oczekiwana);
          expect(await nagrobekPacjenta(d, c.pid), `${d.nazwa}: nagrobek pacjenta przegrał`).toBeNull();
        }
      });
    }
  }

  for (const kolejnosc of KOLEJNOSCI) {
    it(`„Przywróć” z kosza po usunięciu pacjenta na B (${kolejnosc}): karta zostaje, wersja wraca, lastSavedAtISO = chwila przywrócenia`, async () => {
      sztucznyZegar();
      const c = await trzyUrzadzenia();
      przesunZegar(60e3);
      await c.A.v.moveSnapshotToTrash(c.pid, c.s1.snapshotId);
      await sync(c.A, c.B); await sync(c.A, c.C);
      przesunZegar(60e3);
      await c.B.v.removePatient(c.pid);
      const tb = await nagrobekPacjenta(c.B, c.pid);
      const chwila = przesunZegar(60e3);
      await c.A.v.restoreTrashedSnapshot(c.pid, c.s1.snapshotId);
      expect(await ostatni(c.A, c.pid)).toBe(chwila);
      przesunZegar(60e3);
      const [d1, d2] = await wymianaPoUsunieciu(c, kolejnosc, tb);
      for (const d of [d1, d2]) {
        expect(await ostatni(d, c.pid), `${d.nazwa}`).toBe(chwila);
        expect(await wiersze(d, c.pid, c.s1.snapshotId), `${d.nazwa}: przywrócona wersja`).toBe('60:110,66:113|19|-/-');
      }
    });
  }

  it('kontrola: kliknięcie gwiazdki bez zmiany stanu nie podnosi daty — nagrobek pacjenta wygrywa jak dotąd', async () => {
    sztucznyZegar();
    const c = await trzyUrzadzenia();
    const przed = await ostatni(c.A, c.pid);
    przesunZegar(60e3);
    await c.B.v.removePatient(c.pid);
    przesunZegar(60e3);
    await c.A.v.setSnapshotPinned(c.pid, c.s1.snapshotId, false); // już odpięta
    expect(await ostatni(c.A, c.pid)).toBe(przed);
    await sync(c.B, c.A); await sync(c.A, c.B);
    expect(await karta(c.A, c.pid)).toBeNull();
    expect(await karta(c.B, c.pid)).toBeNull();
  });

  it('kontrola: zmiana PRZED usunięciem pacjenta na B — usunięcie (późniejsze) wygrywa jak dotąd', async () => {
    sztucznyZegar();
    const c = await trzyUrzadzenia();
    przesunZegar(60e3);
    await c.A.v.updateMeasurementRow(c.pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 });
    przesunZegar(60e3);
    await c.B.v.removePatient(c.pid);
    przesunZegar(60e3);
    await sync(c.A, c.B); await sync(c.B, c.A);
    expect(await karta(c.A, c.pid)).toBeNull();
    expect(await karta(c.B, c.pid)).toBeNull();
  });

  it('„Ostatnio zapisani”: poprawka pomiaru w starszej karcie przenosi ją na górę listy', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A');
    const ala = await zapisz(A, zapis([W60], W60, 'Starsza Ala'));
    await zapisz(A, zapis([W60], W60, 'Nowsza Ola'));
    expect((await A.v.listPatients()).map((k) => k.header.name)).toEqual(['Nowsza Ola', 'Starsza Ala']);
    przesunZegar(60e3);
    await A.v.updateMeasurementRow(ala.patientId, { uid: 'm-60' }, { ageMonths: 60, height: 110.4, weight: 18 });
    expect((await A.v.listPatients()).map((k) => k.header.name)).toEqual(['Starsza Ala', 'Nowsza Ola']);
  });
});

describe('P-ZMIANA-W-KARCIE (D-5 B): kosz liczy się jak zmiana w karcie, chwila zapisu karty nigdy nie maleje', () => {
  it('kosz najnowszej wersji: lastSavedAtISO = deletedAtISO na A i u odbiorcy (dotąd cofała się do poprzedniej wersji)', async () => {
    sztucznyZegar();
    const { A, B, pid, s2 } = await trzyUrzadzenia();
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(pid, s2.snapshotId);
    expect(await ostatni(A, pid)).toBe(r.deletedAtISO);
    przesunZegar(60e3); // chwila scalania różna od chwili kosza: odbiorca bierze datę z ładunku, nie „teraz”
    await sync(A, B);
    expect(await ostatni(B, pid)).toBe(r.deletedAtISO);
    expect(await ileWersji(B, pid)).toBe(1);
  });

  it('kosz starszej wersji: lastSavedAtISO = deletedAtISO na A i u odbiorcy', async () => {
    sztucznyZegar();
    const { A, B, pid, s1 } = await trzyUrzadzenia();
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(pid, s1.snapshotId);
    expect(await ostatni(A, pid)).toBe(r.deletedAtISO);
    przesunZegar(60e3);
    await sync(A, B);
    expect(await ostatni(B, pid)).toBe(r.deletedAtISO);
  });

  for (const kolejnosc of ['A→B, potem B→A', 'B→A, potem A→B']) {
    it(`usunięcie pacjenta na B przed koszem na A (${kolejnosc}): karta zostaje na obu z 1 wersją (dotąd znikała na obu)`, async () => {
      sztucznyZegar();
      const { A, B, pid, s2 } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await B.v.removePatient(pid);
      przesunZegar(60e3);
      const r = await A.v.moveSnapshotToTrash(pid, s2.snapshotId);
      przesunZegar(60e3);
      if (kolejnosc.startsWith('A')) { await sync(A, B); await sync(B, A); } else { await sync(B, A); await sync(A, B); }
      for (const d of [A, B]) {
        expect(await ostatni(d, pid), d.nazwa).toBe(r.deletedAtISO);
        expect(await ileWersji(d, pid), d.nazwa).toBe(1);
      }
    });
  }

  it('odbiorca bez wersji z kosza też podnosi datę do deletedAtISO', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const s1 = await zapisz(A, zapis([W60], W60));
    await sync(A, B);
    const s2 = await zapisz(A, zapis([W60, W66], W66), { patientId: s1.patientId });
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(s1.patientId, s2.snapshotId);
    przesunZegar(60e3);
    await sync(A, B);
    expect(await ostatni(A, s1.patientId)).toBe(r.deletedAtISO);
    expect(await ostatni(B, s1.patientId)).toBe(r.deletedAtISO);
  });

  for (const kolejnosc of ['A→B, potem B→A', 'B→A, potem A→B']) {
    it(`ta sama wersja do kosza na A i później na B (${kolejnosc}): na obu późniejsze deletedAtISO`, async () => {
      sztucznyZegar();
      const { A, B, pid, s2 } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await A.v.moveSnapshotToTrash(pid, s2.snapshotId);
      przesunZegar(60e3);
      const rB = await B.v.moveSnapshotToTrash(pid, s2.snapshotId);
      przesunZegar(60e3);
      if (kolejnosc.startsWith('A')) { await sync(A, B); await sync(B, A); } else { await sync(B, A); await sync(A, B); }
      expect(await ostatni(A, pid)).toBe(rB.deletedAtISO);
      expect(await ostatni(B, pid)).toBe(rB.deletedAtISO);
    });
  }

  it('urządzenie usuwające scala starą chmurę z tą wersją: data nie cofa się, wersja nie wraca', async () => {
    sztucznyZegar();
    const { A, B, pid, s2 } = await trzyUrzadzenia();
    const stara = kopia(await B.v.exportSyncPayload());
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(pid, s2.snapshotId);
    przesunZegar(60e3);
    await A.v.mergeSyncPayload(stara);
    expect(await ostatni(A, pid)).toBe(r.deletedAtISO);
    expect(await ileWersji(A, pid)).toBe(1);
  });

  it('delty, trzy urządzenia: C usuwa pacjenta, A później przenosi wersję do kosza; B po delcie A i delcie nagrobka C nie traci karty nawet na chwilę', async () => {
    sztucznyZegar();
    const { A, B, C, pid, s2 } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await C.v.removePatient(pid);
    const tc = await nagrobekPacjenta(C, pid);
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(pid, s2.snapshotId);
    przesunZegar(60e3);
    await B.v.mergeSyncPayload(await odszyfruj(A, await A.v.buildPatientDelta(pid)));
    expect(await ostatni(B, pid), 'delta karty niesie chwilę kosza (Bsw_bezNowych)').toBe(r.deletedAtISO);
    await B.v.mergeSyncPayload(await odszyfruj(C, await C.v.buildTombstoneDelta(pid, tc.deletedAtISO)));
    expect(await karta(B, pid), 'karta zostaje po delcie nagrobka C').not.toBeNull();
    await sync(A, B);
    expect(await ostatni(B, pid)).toBe(r.deletedAtISO);
    expect(await ileWersji(B, pid)).toBe(1);
  });

  it('D-4 i D-5 razem: poprawka po usunięciu pacjenta na C, potem kosz starszej wersji — data nie cofa się przed usunięcie, karta zostaje wszędzie', async () => {
    sztucznyZegar();
    const { A, B, C, pid, s1 } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await C.v.removePatient(pid);
    const chwilaPoprawki = przesunZegar(60e3);
    await A.v.updateMeasurementRow(pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 });
    expect(await ostatni(A, pid)).toBe(chwilaPoprawki);
    przesunZegar(60e3);
    const r = await A.v.moveSnapshotToTrash(pid, s1.snapshotId);
    expect(await ostatni(A, pid), 'kosz podnosi, nie cofa do savedAtISO głowy').toBe(r.deletedAtISO);
    przesunZegar(60e3);
    await sync(C, A); await sync(A, B); await sync(A, C);
    for (const d of [A, B, C]) {
      expect(await ostatni(d, pid), d.nazwa).toBe(r.deletedAtISO);
      expect(await ileWersji(d, pid), d.nazwa).toBe(1);
    }
  });

  // Uwaga przeglądu #732: gałąź „wersja zniknęła w trakcie” (Bkz_doKosza, wynik.brak). Bez Web Locks (druga karta
  // przeglądarki) albo przy imporcie kopii wersja może zniknąć między zapisem wpisu kosza a usunięciem; test symuluje
  // to w adapterze.
  it('kosz, gdy wersję w międzyczasie usunęło scalanie: lastSavedAtISO = deletedAtISO (R2)', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A');
    const s1 = await zapisz(A, zapis([W60], W60));
    const s2 = await zapisz(A, zapis([W60, W66], W66), { patientId: s1.patientId });
    await zapisz(A, zapis([W60, W66, W72], W72), { patientId: s1.patientId });
    przesunZegar(60e3);
    const oryg = A.pamiec.putUserMeta;
    let raz = false;
    A.pamiec.putUserMeta = async function (...x) {
      const r = await oryg.apply(this, x);
      if (!raz && x[1] && Array.isArray(x[1].snapshotTombstones) && x[1].snapshotTombstones.some((t) => t.snapshotId === s2.snapshotId)) {
        raz = true;
        await A.pamiec.removeSnapshotForUser(x[0], s2.snapshotId);
      }
      return r;
    };
    const r = await A.v.moveSnapshotToTrash(s1.patientId, s2.snapshotId);
    A.pamiec.putUserMeta = oryg;
    expect(raz, 'wersja zniknęła w trakcie').toBe(true);
    expect(await ostatni(A, s1.patientId)).toBe(r.deletedAtISO);
  });

  // Uwaga przeglądu #732: data z przyszłości (zegar B 10 min do przodu) przyjęta przez R4 nie maleje przy zmianie
  // w karcie na A (Bzw_aktualizujWersje).
  it('zmiana w karcie po przyjęciu daty z przyszłości nie obniża daty (R3)', async () => {
    sztucznyZegar();
    const { A, B, pid, s1 } = await trzyUrzadzenia();
    przesunZegar(60e3);
    vi.setSystemTime(zegar + 10 * 60e3);
    const r = await B.v.moveSnapshotToTrash(pid, s1.snapshotId);
    vi.setSystemTime(zegar);
    await sync(B, A);
    expect(await ostatni(A, pid)).toBe(r.deletedAtISO);
    przesunZegar(60e3);
    await A.v.updateMeasurementRow(pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 });
    expect(await ostatni(A, pid), 'nie maleje').toBe(r.deletedAtISO);
  });

  it('retencja nie podnosi i nie obniża daty (także podniesionej koszem), na urządzeniu przycinającym i u odbiorcy', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    let pid = null; const ids = [];
    for (let i = 0; i < 12; i += 1) {
      const r = await zapisz(A, zapis([W60], Object.assign({}, W60, { height: 100 + i })), pid ? { patientId: pid } : {});
      pid = r.patientId; ids.push(r);
    }
    await sync(A, B);
    przesunZegar(60e3);
    const k = await A.v.moveSnapshotToTrash(pid, ids[0].snapshotId);
    await sync(A, B);
    przesunZegar(60e3);
    const w = await A.v.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    expect(w.prunedCount).toBeGreaterThan(0);
    expect(await ostatni(A, pid)).toBe(k.deletedAtISO);
    await sync(A, B);
    expect(await ostatni(B, pid)).toBe(k.deletedAtISO);
    expect(await ileWersji(B, pid)).toBe(await ileWersji(A, pid));
  });

  it('deleteSnapshot (wewnętrzne, bez nagrobka, D-8 A): data nie maleje i nie rośnie', async () => {
    sztucznyZegar();
    const { A, pid, s2 } = await trzyUrzadzenia();
    const przed = await ostatni(A, pid);
    przesunZegar(60e3);
    await A.v.deleteSnapshot(pid, s2.snapshotId);
    expect(await ostatni(A, pid)).toBe(przed);
  });
});

describe('karta bez żadnej wersji nie powstaje ze scalania', () => {
  // [CZERWONY na 61f87b14: karta z 0 wersji na liście] Karta z ładunku, której wszystkie wersje przegrywają z nagrobkami
  // wersji, a której tu nie ma: przy D-4 A bywa to duplikat po „Scal pacjentów” (wersję przeniesioną i usuniętą na
  // urządzeniu scalającym inne urządzenie poprawiło w starej karcie).
  it('ładunek z kartą tylko z wersją z kosza na urządzeniu z nagrobkiem: nie ma pustej karty; pełny ładunek ją zakłada', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const s1 = await zapisz(A, zapis([W60], W60));
    const s2 = await zapisz(A, zapis([W60, W66], W66), { patientId: s1.patientId });
    await sync(A, B);
    przesunZegar(60e3);
    await A.v.moveSnapshotToTrash(s1.patientId, s2.snapshotId);
    const nagrobki = kopia(await A.v.exportSyncPayload()); nagrobki.patients = [];
    await C.v.mergeSyncPayload(nagrobki);
    const zB = kopia(await B.v.exportSyncPayload());
    zB.patients.forEach((p) => { p.snapshots = p.snapshots.filter((s) => s.snapshotId === s2.snapshotId); });
    await C.v.mergeSyncPayload(zB);
    expect(await C.v.listPatients(), 'bez karty z 0 wersji').toEqual([]);
    await sync(A, C);
    expect(await ileWersji(C, s1.patientId)).toBe(1);
  });

  // [CZERWONY na 27055774: karta z 0 wersji] Uwaga przeglądu #732: ładunek bez żadnej wersji karty (np. pusta karta
  // ze starszej aplikacji) też nie zakłada karty.
  it('ładunek z kartą bez żadnej wersji: nie ma pustej karty', async () => {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    await zapisz(A, zapis([W60], W60));
    const pusty = kopia(await A.v.exportSyncPayload());
    pusty.patients.forEach((p) => { p.snapshots = []; });
    await B.v.mergeSyncPayload(pusty);
    expect(await B.v.listPatients(), 'bez karty z 0 wersji').toEqual([]);
  });
});

describe('nowa wizyta nie obniża chwili zapisu karty (R3, savePatient)', () => {
  // [CZERWONY na 27055774] Uwaga przeglądu #732. Zegar B spieszy się o 10 min. B poprawia wiersz, A przyjmuje datę
  // z przyszłości (R4), potem zapisuje nową wizytę. Dotąd savePatient ustawiał „teraz”, data spadała, a usunięcie
  // pacjenta na C z chwilą pomiędzy kasowało na A kartę razem z nową wizytą; karta wracała potem z B bez niej.
  it('data karty po nowej wizycie = późniejsza z dwóch; usunięcie z chwilą pomiędzy nie kasuje nowej wizyty', async () => {
    sztucznyZegar();
    const { A, B, C, pid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    vi.setSystemTime(zegar + 10 * 60e3);
    await B.v.updateMeasurementRow(pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 });
    const zB = await ostatni(B, pid);
    vi.setSystemTime(zegar);
    przesunZegar(60e3);
    await sync(B, A);
    expect(await ostatni(A, pid)).toBe(zB);
    await zapisz(A, zapis([W60, W66, W72], W72), { patientId: pid }); // nowa wizyta s3
    expect(await ostatni(A, pid), 'data nie maleje').toBe(zB);
    przesunZegar(60e3);
    await C.v.removePatient(pid);
    await sync(C, A);
    expect(await ileWersji(A, pid), 'karta z nową wizytą zostaje na A').toBe(3);
    for (let r = 0; r < 2; r += 1) { await sync(A, B); await sync(B, A); await sync(A, C); await sync(C, A); await sync(B, C); await sync(C, B); }
    for (const d of [A, B, C]) {
      expect(await ileWersji(d, pid), `${d.nazwa}: trzy wersje`).toBe(3);
      expect(await ostatni(d, pid), `${d.nazwa}: ta sama data`).toBe(zB);
    }
  });
});

describe('strażniki źródła P-ZMIANA-W-KARCIE', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  it('kosz przekazuje chwilę usunięcia, retencja nie; zapisy rekordu karty liczą późniejszą z chwil', () => {
    expect(src).toContain('let wynik = await Bkz_usunJesliBezZmian(patientId, snapshotId, wpis, wpis.deletedAtISO);');
    expect(src).toContain('const w = await Bkz_usunJesliBezZmian(patientId, id, nagrobki[i]);');
    expect(src).toContain('return Bzw_usunWersje(patientId, snapshotId, zmianaISO);');
    expect(src).toContain('lastSavedAtISO:Bkz_pozniejsza(c.lastSavedAtISO,a.savedAtISO,Bkz_z)');
    expect(src).toContain('lastSavedAtISO:Bkz_pozniejsza(p.lastSavedAtISO,Bpp_z)'); // P-POZNIEJSZA-POPRAWKA: stempel zmiany
    expect(src).toContain('    lastSavedAtISO: Bkz_pozniejsza(rekord.lastSavedAtISO, glowa.savedAtISO, zmianaISO),');
    expect(src).toContain('    await Bkz_przebudujNaglowek(patientId, zmiana, Bses_o);'); // P-POZNIEJSZA-POPRAWKA: stempel przywrócenia (PRZ0: w sesji kliknięcia)
    expect(src).toContain('const zmiany = Bsw_bezNowych(Bpu_rek, lokalne.length, F.lastSavedAtISO);');
    expect(src).not.toContain('lastSavedAtISO: glowa.savedAtISO,');
    expect(src).not.toContain('lastSavedAtISO:y?p.lastSavedAtISO||d:l');
    expect(src).toContain('lastSavedAtISO:Bkz_pozniejsza(h&&h.lastSavedAtISO,l),snapshotCount:O}');
    expect(src).toContain('      await Bkz_podniesZapis(patientId, wpis.deletedAtISO);');
    expect(src).not.toContain('lastSavedAtISO:l,snapshotCount:O}');
  });
});
