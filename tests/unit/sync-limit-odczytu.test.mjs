// P-SYNC-LIMIT-ODCZYTU (2026-11-11, decyzja 2 właściciela z 2026-11-11): limit czasu odczytu treści odpowiedzi w ścieżce
// pobierania i odświeżenie widoku po każdym rodzaju zmiany ze scalania delt.
//
// Dotąd limit f() kończył się z nagłówkami, a treść czytana przez json() nie miała limitu: serwer, który przysłał
// nagłówki i zamilkł, trzymał pobranie albo drenaż zmian do przeładowania strony. Teraz GET /v1/health (5 s), GET /status
// w pobraniu (30 s), GET /changes stronami i legacy oraz GET /deltas (60 s) kończą odczyt błędem TIMEOUT, a następne
// pobranie próbuje od nowa. Wysyłka, rejestracja i blob bez zmian (strażnik źródła L9).
//
// Liczniki: delta z WebSocket (applyDelta w integracji) odświeża widok także po nowej albo zmienionej wizycie w
// istniejącej karcie; drenaż (wt, Bdz_czyZmiana) i WebSocket — po zmianach w Koszu, przycięciu, liście pacjentów,
// preferencji i kluczu logowania (te rodzaje przychodzą szybką synchronizacją dopiero z dziennikiem zdarzeń).
//
// Usterka atrapy trescWisi (tests/support/atrapa-workera-sync.mjs): nagłówki i połowa ciała, reszta po zwolnieniu, po ms
// albo nigdy; abort żądania kończy odczyt AbortError. Fałszywe timery setTimeout/clearTimeout/Date (uprząż je dopuszcza:
// cisza() liczy tury setImmediate); oczekiwanie „bez końca” sprawdzane w czasie rzeczywistym (performance.now).
// Dane fikcyjne, prawdziwy vilda_sync.js i vilda_sync_integration.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tura, utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(KORZEN, 'vilda_sync.js'), 'utf8');
const ZRODLO_INT = fs.readFileSync(path.join(KORZEN, 'vilda_sync_integration.js'), 'utf8');
const T0 = Date.UTC(2026, 10, 11, 9, 0, 0);

afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});

function falszyweTimery() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
}
// Obietnica rozstrzygnięta w czasie rzeczywistym do ms (tury setImmediate), inaczej 'wisi'.
async function wynikAlboWisi(p, ms = 1500) {
  const st = { v: null };
  p.then((w) => { st.v = { ok: true, w }; }, (e) => { st.v = { ok: false, e }; });
  const koniec = performance.now() + ms;
  while (!st.v && performance.now() < koniec) await tura();
  return st.v || 'wisi';
}
async function czekajNa(obietnica, ms = 3000) {
  const s = await wynikAlboWisi(obietnica, ms);
  if (s === 'wisi') throw new Error('czekajNa: bez rozstrzygnięcia');
  return s;
}

// Świat: A i B to samo konto, A zarejestrowane z kartą 1, B po pierwszym pobraniu; opcja flag na B.
async function swiat(o = {}) {
  falszyweTimery();
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
  const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
  const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A });
  for (const [k, v] of Object.entries(o.flagi || {})) B.win.localStorage.setItem(k, v);
  await A.zapiszKarte(1);
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza([A, B]);
  const k = await A.zapiszKarte(2); // seq 1: po pierwszym pobraniu kursor B = 1 (dalej strony, nie okno since=0)
  expect(await A.wyslijDelteKarty(k.patientId)).toBe(true);
  await cisza([A, B]);
  expect((await B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
  await cisza([A, B]);
  if (!o.flagi || o.flagi['vilda-incr-sync-v1'] !== '0') expect(B.kursor()).toBe(1);
  return { atrapa, A, B };
}
// Usterka osiągnięta (ciało zaczęło wisieć) i kilka tur, żeby klient zdążył ustawić zegar limitu odczytu.
async function poOsiagnieciu(u) {
  await czekajNa(u.osiagnieta);
  for (let k = 0; k < 30; k++) await tura();
}
async function deltaKarty(s, i) {
  const k = await s.A.zapiszKarte(i);
  expect(await s.A.wyslijDelteKarty(k.patientId)).toBe(true);
  await cisza([s.A, s.B]);
  return k.patientId;
}
const maKarte = async (d, pid) => !!(await d.vault.getPatient(pid));

describe('P-SYNC-LIMIT-ODCZYTU — limit odczytu treści w ścieżce pobierania', () => {
  it('L1 [czerwony na bazie]: treść strony /changes wisi — drenaż kończy się po 60 s (siec, TIMEOUT), kursor stoi; następne pobranie dociąga kartę', async () => {
    const s = await swiat();
    const pid = await deltaKarty(s, 2);
    const k0 = s.B.kursor();
    const u = s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, trescWisi: true });
    const p = s.B.sync.syncPull({ czekajNaDrenaz: true });
    await poOsiagnieciu(u);
    try {
      await vi.advanceTimersByTimeAsync(59000);
      expect(await wynikAlboWisi(p, 300), 'przed 60 s drenaż czeka na treść').toBe('wisi');
      await vi.advanceTimersByTimeAsync(1500);
      const w = await czekajNa(p);
      expect(w.ok).toBe(true);
      expect(w.w.drain, 'drenaż zakończony z TIMEOUT').toMatchObject({ stop: 'siec', kod: 'TIMEOUT' });
      for (let k = 0; k < 20; k++) await tura();
      expect(s.atrapa.ruch('B').konsumpcje, 'żądanie przerwane (połączenie zwolnione), nie tylko porzucone').toBe(0);
      expect(s.B.kursor(), 'kursor bez zmian').toBe(k0);
      expect(await maKarte(s.B, pid)).toBe(false);
    } finally { u.zwolnij(); }
    await cisza([s.A, s.B]);
    const w2 = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    expect(w2.drain.stop).toBe('head');
    expect(await maKarte(s.B, pid), 'następne pobranie scala kartę').toBe(true);
    expect(s.B.kursor()).toBe(s.atrapa.slot(s.A.slotId).dz.head);
  });

  it('L1k [kontrola]: treść strony dochodzi po 50 s — drenaż czeka i scala (limit dotyczy zawieszenia, nie wolnego łącza do 60 s)', async () => {
    const s = await swiat();
    const pid = await deltaKarty(s, 3);
    const u = s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, trescWisi: { ms: 50000 } });
    const p = s.B.sync.syncPull({ czekajNaDrenaz: true });
    await poOsiagnieciu(u);
    await vi.advanceTimersByTimeAsync(50500);
    const w = await czekajNa(p);
    expect(w.w.drain.stop).toBe('head');
    expect(await maKarte(s.B, pid)).toBe(true);
  });

  it('L2 [czerwony na bazie]: treść GET /v1/health wisi — wykrycie kończy się po 5 s jak legacy (pamięć 15 s), drenaż idzie dalej; po 15 s health od nowa i drenaż stronami', async () => {
    const s = await swiat();
    const pid = await deltaKarty(s, 4);
    await vi.advanceTimersByTimeAsync(11 * 60e3); // pamięć health (10 min) wygasła
    const u = s.atrapa.usterka({ gdy: { trasa: 'health', urzadzenie: 'B' }, trescWisi: true });
    const p = s.B.sync.syncPull({ czekajNaDrenaz: true });
    await poOsiagnieciu(u);
    try {
      await vi.advanceTimersByTimeAsync(5500);
      const w = await czekajNa(p);
      expect(w.ok).toBe(true);
      expect(w.w.drain.stop, 'bez changes-paged w pamięci: jedna strona legacy').toBe('legacy');
    } finally { u.zwolnij(); }
    await cisza([s.A, s.B]);
    expect(await maKarte(s.B, pid), 'strona legacy scaliła kartę').toBe(true);
    await vi.advanceTimersByTimeAsync(16000);
    const w2 = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    expect(w2.drain.tryb).toBe('strony');
  });

  it('L3 [czerwony na bazie]: treść GET /status w pobraniu wisi — pobranie kończy się po 30 s błędem TIMEOUT; następne pobranie działa', async () => {
    const s = await swiat();
    const pid = await deltaKarty(s, 5);
    const u = s.atrapa.usterka({ gdy: { trasa: 'status', urzadzenie: 'B' }, trescWisi: true });
    const p = s.B.sync.syncPull({ czekajNaDrenaz: true });
    await poOsiagnieciu(u);
    try {
      await vi.advanceTimersByTimeAsync(29000);
      expect(await wynikAlboWisi(p, 300)).toBe('wisi');
      await vi.advanceTimersByTimeAsync(1500);
      const w = await czekajNa(p);
      expect(w.ok).toBe(false);
      expect(w.e && w.e.code).toBe('TIMEOUT');
      for (let k = 0; k < 20; k++) await tura();
      expect(s.atrapa.ruch('B').konsumpcje, 'żądanie przerwane').toBe(0);
    } finally { u.zwolnij(); }
    await cisza([s.A, s.B]);
    const w2 = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    expect(w2.drain.stop).toBe('head');
    expect(await maKarte(s.B, pid)).toBe(true);
  });

  it('L4 [czerwony na bazie]: flaga stron "0" — treść /changes legacy wisi; po 60 s następny drenaż w tym dokumencie rusza i scala kartę', async () => {
    const s = await swiat({ flagi: { 'vilda-sync-paged-v1': '0' } });
    const pid = await deltaKarty(s, 6);
    const u = s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, trescWisi: true });
    await s.B.sync.syncPull();
    await poOsiagnieciu(u);
    try {
      await vi.advanceTimersByTimeAsync(61000);
      await czekajNa((async () => { for (;;) { if (s.atrapa.ruch('B').konsumpcje === 0) return; await tura(); } })());
    } finally { u.zwolnij(); }
    await cisza([s.A, s.B]);
    expect(await maKarte(s.B, pid)).toBe(false);
    await s.B.sync.syncPull();
    await cisza([s.A, s.B]);
    expect(await maKarte(s.B, pid), 'drenaż legacy nie stoi po zawieszonej treści').toBe(true);
  });

  it('L5 [czerwony na bazie]: szybka synchronizacja wyłączona ("vilda-incr-sync-v1" = "0") — treść GET /deltas wisi; po 60 s następny drenaż rusza', async () => {
    const s = await swiat({ flagi: { 'vilda-incr-sync-v1': '0' } });
    const pid = await deltaKarty(s, 7);
    const u = s.atrapa.usterka({ gdy: { trasa: 'deltas', urzadzenie: 'B' }, trescWisi: true });
    await s.B.sync.syncPull();
    await poOsiagnieciu(u);
    try {
      await vi.advanceTimersByTimeAsync(61000);
      await czekajNa((async () => { for (;;) { if (s.atrapa.ruch('B').konsumpcje === 0) return; await tura(); } })());
    } finally { u.zwolnij(); }
    await cisza([s.A, s.B]);
    await s.B.sync.syncPull();
    await cisza([s.A, s.B]);
    expect(await maKarte(s.B, pid)).toBe(true);
  });

  it('L6 [kontrola]: po udanym odczycie nie zostaje zegar limitu ani przerwanie (60 s później bez błędu i bez dodatkowych żądań)', async () => {
    const s = await swiat();
    await deltaKarty(s, 8);
    const w = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    expect(w.drain.stop).toBe('head');
    const z0 = s.atrapa.zadania.length;
    await vi.advanceTimersByTimeAsync(61000);
    await cisza([s.A, s.B]);
    expect(s.atrapa.zadania.length).toBe(z0);
    expect(s.atrapa.naruszenia || []).toEqual([]);
  });
});

describe('P-SYNC-LIMIT-ODCZYTU — odświeżenie widoku po scaleniu delty z WebSocket (applyDelta w integracji)', () => {
  // Prawdziwe Ft z vilda_sync_integration.js (z zależnościami straży formatu) w oknie B; nt() — licznik odświeżeń
  // (w integracji: vilda:sync-merged, kanał i przekaz do ramek). Jak WYSLIJ_DELTE w tests/support/urzadzenie-sync.mjs.
  function applyDelta(win, nt) {
    const funkcje = ['s', 'v', 'WorkspaceIntegrationProtected', 'PatientClinicalRouteFailure', 'PatientClinicalLegacyAllowed', 'Ft']
      .map((n) => wytnijFunkcje(ZRODLO_INT, n)).join('\n');
    return new Function('n', 'nt', funkcje + ';return Ft')(win, nt);
  }
  async function zastosuj(s, odswiezenia, ft, payload) {
    const n0 = odswiezenia.length;
    ft(payload);
    await cisza([s.A, s.B]);
    for (let k = 0; k < 20; k++) await tura();
    return odswiezenia.length - n0;
  }
  it('W1 [czerwony na bazie]: nowa i poprawiona wizyta w istniejącej karcie z drugiego urządzenia odświeżają widok od razu', async () => {
    const s = await swiat();
    const odswiezenia = [];
    const ft = applyDelta(s.B.win, () => odswiezenia.push(1));
    const k = await s.A.zapiszKarte(9);
    expect(await zastosuj(s, odswiezenia, ft, await s.A.vault.buildPatientDelta(k.patientId)), 'nowa karta (jak dotąd)').toBe(1);
    const p = await s.A.vault.getPatient(k.patientId);
    const w = p.snapshots[p.snapshots.length - 1];
    vi.setSystemTime(Date.now() + 60e3);
    await s.A.vault.updateSnapshotPayload(k.patientId, w.snapshotId, { ...w.payload, user: { ...w.payload.user, weight: 74 } });
    expect(await zastosuj(s, odswiezenia, ft, await s.A.vault.buildPatientDelta(k.patientId)), 'poprawka wizyty').toBe(1);
    vi.setSystemTime(Date.now() + 60e3);
    await s.A.zapiszKarte(9, { zapis: { patientId: k.patientId } });
    expect(await zastosuj(s, odswiezenia, ft, await s.A.vault.buildPatientDelta(k.patientId)), 'nowa wizyta w istniejącej karcie').toBe(1);
  });
  it('W1k [kontrola]: echo tej samej delty bez zmian nie odświeża widoku (jak dotąd)', async () => {
    const s = await swiat();
    const odswiezenia = [];
    const ft = applyDelta(s.B.win, () => odswiezenia.push(1));
    const k = await s.A.zapiszKarte(10);
    const d = await s.A.vault.buildPatientDelta(k.patientId);
    expect(await zastosuj(s, odswiezenia, ft, d)).toBe(1);
    expect(await zastosuj(s, odswiezenia, ft, d), 'echo bez zmian').toBe(0);
  });
});

describe('P-SYNC-LIMIT-ODCZYTU — strażniki źródła', () => {
  const LICZNIKI = ['addedSnapshotCount', 'updatedSnapshotCount', 'trashedSnapshotCount', 'prunedSnapshotCount',
    'addedPatientListCount', 'updatedPatientListCount', 'deletedPatientListCount', 'updatedPreferenceCount',
    'addedPasskeyCount', 'removedPasskeyCount'];
  const nazwy = (t) => [...new Set([...t.matchAll(/\.(\w+Count)\b/g)].map((m) => m[1]))].sort();
  it('L7: liczniki wt i Bdz_czyZmiana (19) oraz applyDelta w integracji (18, bez mergedPatientCount)', () => {
    const wt = ZRODLO.slice(ZRODLO.indexOf('async function wt('), ZRODLO.indexOf('function Et('));
    const i = ZRODLO.indexOf('function Bdz_czyZmiana(');
    const bdz = ZRODLO.slice(i, ZRODLO.indexOf('\n}', i));
    expect(nazwy(wt)).toHaveLength(19);
    expect(nazwy(bdz)).toEqual(nazwy(wt));
    for (const n of LICZNIKI) expect(nazwy(wt), n).toContain(n);
    const ft = ZRODLO_INT.slice(ZRODLO_INT.indexOf('function Ft(t){'), ZRODLO_INT.indexOf('/* P-KONTO-BEZ-SERWERA'));
    expect(nazwy(ft)).toEqual(nazwy(wt).filter((n) => n !== 'mergedPatientCount'));
  });
  it('L8: f() z limitem treści — kontroler przy odpowiedzi tylko z czwartym argumentem; Btr_json bez niego to zwykłe json()', () => {
    expect(ZRODLO).toContain('async function f(t,e,a,Btr){');
    expect(ZRODLO).toContain('typeof Btr=="number"&&Btr>0&&PatientClinicalResponse&&typeof PatientClinicalResponse=="object"&&Btr_odp.set(PatientClinicalResponse,{k:r,ms:Btr});return PatientClinicalResponse}');
    expect(ZRODLO).toContain('function Btr_json(t){var e=t&&typeof t=="object"?Btr_odp.get(t):null;if(!e)return t.json();');
  });
  it('L9: limit treści tylko w ścieżce pobierania (health, status w pobraniu, /changes stronami i legacy, /deltas); wysyłka, rejestracja i blob bez niego', () => {
    const ile = (t) => ZRODLO.split(t).length - 1;
    expect(ile("f(url + '/v1/health', { method: 'GET' }, Bdz_HEALTH_MS, Bdz_HEALTH_MS)"), 'health').toBe(1);
    expect(ile("{ method: 'GET', headers: { Authorization: 'Bearer ' + e } }, ct, Btr_LIMIT_STRONY_MS)"), 'drenaż stronami').toBe(1);
    expect(ile('"/changes?since="+n,{method:"GET",headers:{Authorization:"Bearer "+e}},ct,Btr_LIMIT_STRONY_MS)'), 'Yt').toBe(1);
    expect(ile('"/deltas",{method:"GET",headers:{Authorization:"Bearer "+e}},ct,Btr_LIMIT_STRONY_MS)'), 'Bt').toBe(1);
    expect(ile('"/status",{method:"GET",headers:{Authorization:"Bearer "+r}},Mt,Mt)'), 'status w pobraniu').toBe(2);
    expect(ile('Btr_LIMIT_STRONY_MS'), 'deklaracja + 3 wywołania').toBe(4);
    expect(ile('await Btr_json('), 'odczyty z limitem: health, 2× status, Yt, Bt, 2× drenaż').toBe(7);
  });
});
