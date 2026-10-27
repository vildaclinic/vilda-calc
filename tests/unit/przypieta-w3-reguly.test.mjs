// P-PRZYPIETA-POLKRATA, P-KOSZ-POLKRATA (S4): reguły W3 i półkraty, których nie pilnował dotąd żaden test sejfu
// (zgłoszenie K5 panelu sędziów 2026-10-22: 12 mutantów kluczowych gałęzi przeżywało wszystkie 67 plików testów sejfu;
// każdy test niżej czerwieni się na swoim mutancie, na f612fe09 — 8 z 10 scenariuszy). Prawdziwy vilda_vault.js
// (sejfy w pamięci, sztuczny zegar, uprząż polkrata-uprzaz.mjs) albo funkcje wycięte z niego. Oczekiwania = reguły
// z docs/clinical/ALGORITHMS.md i decyzje D1 = C, D2 = a. Dane wyłącznie fikcyjne („Testowy Jan”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  repo, SEJF, sztucznyZegar, przesunZegar, urzadzenia, sync, rundy, widoki, poprawMase, przypnij, doKosza, przytnij, gdzie,
  zeruj, zapisy,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const widokNa = async (u, sid, n) => (await widoki(u, sid, [n]))[n];

describe('W3 — scenariusze na prawdziwym sejfie', () => {
  it('gwiazdka starszej aplikacji (221) na starej kopii nie jest zmianą treści — wcześniejsza poprawka C zostaje: 58*', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C'], { P: 'S221' });
    przesunZegar(M); await poprawMase(u.C, sid, 58); // C (nowa) poprawia, nie wie o gwiazdce
    przesunZegar(M); await przypnij(u.P, sid, true); // P (221) przypina swoją starą kopię (23 kg, pola W3 bez zmian)
    przesunZegar(M);
    await sync(u.P, u.K); await sync(u.C, u.K);
    expect(await widokNa(u, sid, 'K'), 'kolejność P→K, C→K').toBe('karta 58*');
    await sync(u.P, u.C);
    expect(await widokNa(u, sid, 'C'), 'kolejność C (ma poprawkę) ← P').toBe('karta 58*');
  }, 60_000);

  it('późniejsza gwiazdka starszej aplikacji na wersji bez pól W3 wygrywa z wcześniejszym jawnym odpięciem: 23*', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C'], { K: 'S221' }); // wersje zapisała 221 — bez pól W3
    przesunZegar(M); await przypnij(u.P, sid, true);
    przesunZegar(M); await przypnij(u.P, sid, false); // jawne odpięcie na P (rejestr { false, t2 })
    przesunZegar(M); await przypnij(u.K, sid, true); // K (221, stara kopia bez pól) przypina później
    przesunZegar(M);
    await sync(u.K, u.P);
    expect(await widokNa(u, sid, 'P')).toBe('karta 23*');
    await sync(u.P, u.C);
    expect(await widokNa(u, sid, 'C')).toBe('karta 23*');
  }, 60_000);

  it('późniejsze jawne odpięcie wersji wygrywa z wcześniejszym rejestrem z gwiazdką w nagrobku (ODP przez trzecie): brak', async () => {
    sztucznyZegar();
    const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.K); // K ma kopię z gwiazdką
    przesunZegar(M); await przypnij(u.K, sid, false); // K świadomie odpina
    przesunZegar(M); await przytnij(u.C, sid); // C (nie wie o niczym) przycina
    przesunZegar(M);
    await sync(u.C, u.P); // P: przypięta przeżywa, nagrobek uczy się rejestru { true, t1 } (A3a)
    await sync(u.P, u.K); // K: rejestr nagrobka t1 < odpięcie t2 — przycięcie wygrywa
    expect(await widokNa(u, sid, 'K'), 'K po scaleniu P').toBe('brak');
    await rundy(lista, 3);
    expect(await widoki(u, sid)).toEqual({ P: 'brak', K: 'brak', C: 'brak' });
  }, 60_000);

  it('P-KOSZ-ZAPISOW: kosz pokazuje gwiazdkę z rejestru nagrobka (przypięta pokonana koszem bez wiedzy), „Przywróć” ją oddaje', async () => {
    sztucznyZegar();
    const { u, pid, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.K);
    przesunZegar(M); await poprawMase(u.C, sid, 74); // C nie wie o gwiazdce
    przesunZegar(M); await doKosza(u.C, sid); // kosz C — jego kopia bez gwiazdki
    przesunZegar(M);
    await sync(u.C, u.K); // K: przypięta (t1) nie późniejsza niż kosz (t3) — do kosza, nagrobek zna rejestr { true, t1 }
    expect(await widokNa(u, sid, 'K'), 'gwiazdka w koszu z rejestru').toBe('kosz 74*');
    przesunZegar(M);
    await u.K.restoreTrashedSnapshot(pid, sid);
    expect(await widokNa(u, sid, 'K'), '„Przywróć” oddaje gwiazdkę, którą pokazał kosz').toBe('karta 74*');
  }, 60_000);

  it('wersja późniejsza niż kosz przyjmuje rejestr gwiazdki nagrobka w tym samym scaleniu (retencja jej nie przycina)', async () => {
    sztucznyZegar();
    const { u, pid, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true);
    przesunZegar(M); await doKosza(u.K, sid); // K nie wie o gwiazdce
    przesunZegar(M); await poprawMase(u.C, sid, 74); // C nie wie o niczym — poprawka po koszu
    przesunZegar(M);
    await sync(u.P, u.K); // K: przypięta P przegrywa z koszem, nagrobek zna { true, t1 }
    await sync(u.K, u.C); // C: jego 74 kg późniejsze niż kosz — nagrobek przegrywa, rejestr przechodzi na wersję
    expect(await widokNa(u, sid, 'C')).toBe('karta 74*');
    przesunZegar(M);
    const r = await u.C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    expect(r.prunedIds.includes(sid), 'retencja C nie przycina przypiętej').toBe(false);
  }, 60_000);

  it('kosz zapisu z gwiazdką zmienioną po poprawce trzyma chwilę treści (trescISO) — późniejsza poprawka C w koszu na obu', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 58); // t1: treść P
    przesunZegar(M); await poprawMase(u.C, sid, 74); // t2: późniejsza treść C (bez wiedzy o 58)
    przesunZegar(M); await przypnij(u.P, sid, true); // t3: gwiazdka P (sama gwiazdka)
    przesunZegar(M); await doKosza(u.P, sid); // t4: „Odepnij i usuń”
    przesunZegar(M);
    await sync(u.C, u.P);
    await sync(u.P, u.C);
    expect(await widoki(u, sid, ['P', 'C'])).toEqual({ P: 'kosz 74', C: 'kosz 74' });
  }, 60_000);
});

describe('półkrata — scenariusze na prawdziwym sejfie', () => {
  it('treść ważnego kosza wygasa 30 dni od chwili kosza (deletedAtISO, expiresAtISO w koszu), nie od wcześniejszego usunięcia, które ją zabrało', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K']);
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await doKosza(u.P, sid); // dzień 0: kosz P z treścią 58
    przesunZegar(20 * 864e5); await doKosza(u.K, sid); // dzień 20: K (bez wiedzy) daje do kosza swoją kopię 23
    przesunZegar(M); await sync(u.K, u.P); await sync(u.P, u.K);
    const k0 = (await u.P.listTrashedSnapshots()).find((e) => e.snapshotId === sid);
    expect({ masa: k0.payload.user.weight, wygasa: k0.expiresAtISO > new Date(Date.now() + 25 * 864e5).toISOString() }, 'kontrola: kosz z dnia 20 z najnowszą treścią').toEqual({ masa: 58, wygasa: true });
    przesunZegar(15 * 864e5); // dzień 35: przed expiresAtISO (dzień 50)
    const k1 = (await u.P.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
    expect(k1 && k1.payload.user.weight).toBe(58);
  }, 60_000);

  it('cień (D4 = a): poprawka z ładunku pokonana przycięciem zostaje w cieniu; późniejszy kosz bez wiedzy bierze ją — 58 w koszu, choć P (z poprawką) już się nie synchronizuje', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 58); // P poprawia (bez wiedzy o niczym)
    przesunZegar(M); await przytnij(u.K, sid); // K przycina swoją kopię 23
    przesunZegar(M); await sync(u.P, u.K); // K: poprawka P (t1) nie późniejsza niż przycięcie (t2) — cień 58 na K
    przesunZegar(M); await doKosza(u.C, sid); // C (bez wiedzy) daje do kosza kopię 23; P od teraz offline („zgubiony”)
    przesunZegar(M); await sync(u.C, u.K); await sync(u.K, u.C); await rundy([u.K, u.C], 2);
    expect(await widoki(u, sid, ['K', 'C'])).toEqual({ K: 'kosz 58', C: 'kosz 58' });
  }, 60_000);

  it('prawo L3: ta sama treść kosza wraca z wyższą rev wpisu (para rev wersji pokonanej) — bez ponownego szyfrowania i zapisu listy', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 58); // treść P: rev 1, chwila treści t1
    przesunZegar(M); await przypnij(u.C, sid, true); // C: sama gwiazdka (rev 1, treść t0)
    przesunZegar(M); await przypnij(u.C, sid, false); // C: rev 2, treść t0
    przesunZegar(M); await doKosza(u.P, sid); // kosz P z treścią 58
    przesunZegar(M);
    await sync(u.C, u.P); // P: wersja C (rev 2) pokonana koszem — rev wpisu 2, treść dalej 58 (rev 1)
    await sync(u.P, u.K); // K: kosz z ładunku, opis treści z rev wpisu (2)
    przesunZegar(M); zeruj([u.P]);
    await sync(u.K, u.P); // ta sama treść (58, ta sama chwila treści i zmiany), wyższa rev opisu
    expect({ widok: await widokNa(u, sid, 'P'), zapisyListy: zapisy([u.P]).P.lista }).toEqual({ widok: 'kosz 58', zapisyListy: 0 });
  }, 60_000);
});

describe('cień przycięcia (D4 = a): koszt i niezależność od kolejności (K1)', () => {
  // K1 (panel 2026-10-22): cień trzyma pełny szyfr każdej wersji pokonanej przycięciem w scalaniu (30 dni, lokalnie).
  // Wariant „bez cienia, gdy nagrobek retencji opisuje dokładnie tę wersję” (V2) zmniejszał listę, ale treść kosza
  // zależała wtedy od kolejności scaleń (2 z 10 kolejności „kosz 23” zamiast „kosz 58”) — odrzucony; koszt opisany
  // w ALGORITHMS do decyzji właściciela. Test pilnuje, że wynik jest ten sam w każdej kolejności.
  const KOL = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P', 'P←K,P←C', 'P←C,K←P'];
  it('P poprawia 58 i wysyła C; C przycina; K (kopia 23, bez wiedzy) daje do kosza — kosz 58 w 10 kolejnościach', async () => {
    const zle = [];
    for (const kol of KOL) {
      sztucznyZegar();
      const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
      przesunZegar(M); await poprawMase(u.P, sid, 58); await sync(u.P, u.C);
      przesunZegar(M); await przytnij(u.C, sid);
      przesunZegar(M); await doKosza(u.K, sid);
      for (const k of kol.split(',')) { const [na, z] = k.split('←'); przesunZegar(M); await sync(u[z], u[na]); }
      przesunZegar(M); await rundy(lista, 3);
      const w = await widoki(u, sid);
      if (Object.values(w).some((x) => x !== 'kosz 58')) zle.push(`${kol}: ${JSON.stringify(w)}`);
      vi.useRealTimers();
    }
    expect(zle).toEqual([]);
  }, 120_000);
  it('koszt: K scala przycięcie C (11 wersji) — 11 wpisów z cieniem lokalnie, w ładunku nagrobki retencji bez treści', async () => {
    sztucznyZegar();
    const { u, pid } = await urzadzenia(['K', 'C']);
    przesunZegar(M); const r = await u.C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    przesunZegar(M); await sync(u.C, u.K);
    const lista = ((await u.K.__px.getUserMeta(u.K.__uid)) || {}).snapshotTombstones || [];
    expect(r.prunedIds.length).toBe(11);
    expect(lista.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && !e.payloadCipher).length, 'wpisy z cieniem (niewidoczne w koszu)').toBe(11);
    expect((await u.K.listTrashedSnapshots()).length, 'kosz pusty').toBe(0);
    const lad = (await u.K.exportSyncPayload()).snapshotTombstones;
    expect(lad.filter((e) => e.powod === 'retencja' && !e.payload && !e.Bpk).length, 'ładunek: same nagrobki retencji (F5)').toBe(11);
  }, 60_000);
});

describe('funkcje wycięte z prawdziwego sejfu', () => {
  const src = readFileSync(path.join(repo, SEJF.N), 'utf8');
  const wytnij = (od, doo) => { const i = src.indexOf(od); return src.slice(i, src.indexOf(doo, i)); };
  const kod = [
    src.match(/function mt\(t\)\{var e=t&&t\.rev;[^}]*\}/)[0],
    src.match(/function Bm1\(t,e\)\{.*?return n==null\?\{\}:\{seq:n\}\}/)[0],
    wytnij('function Bkz_pozniejsza(', 'async function Bkz_podniesZapis('),
    'const de = 1e15, BKZ_KOSZ_MS = 1e14;',
    wytnij('function Bkz_czysc(', 'async function Bkz_czytaj('),
  ].join('\n');
  // Wycięcie musi się udać: po przeróbce źródła test ma się zaczerwienić, a nie po cichu wypaść z ochrony.
  const f = new Function(kod + '\nreturn { Bgw_porownaj, Bgw_pozniejszy, Bpk_polacz, Bpk_zWpisu, Bkz_dolacz };')();
  it('wycięcie funkcji z vilda_vault.js się udało', () => {
    expect(Object.values(f).every((x) => typeof x === 'function')).toBe(true);
  });
  const T = (n) => `2026-10-20T09:0${n}:00.000Z`;

  it('W3: remis chwil rejestru przy różnej gwiazdce — przypięta („Przypięte zostają zawsze.”), w obu kolejnościach', () => {
    const a = { pin: true, at: T(1) }, b = { pin: false, at: T(1) };
    expect([f.Bgw_porownaj(a, b), f.Bgw_porownaj(b, a)]).toEqual([1, -1]);
    expect([f.Bgw_pozniejszy(a, b), f.Bgw_pozniejszy(b, a)]).toEqual([a, a]);
    expect(f.Bgw_porownaj({ pin: true, at: null }, { pin: false, at: null })).toBe(1);
  });

  it('półkrata: przycięcie wcześniejsze niż znana zmiana nie zostaje w składnikach (r < z → r = \'\'), w obu kolejnościach', () => {
    const kosz = { patientId: 'p', snapshotId: 's', deletedAtISO: T(5), rev: 1, updatedAtISO: T(3), payloadCipher: 'c' };
    const ret = { patientId: 'p', snapshotId: 's', deletedAtISO: T(2), rev: 0, updatedAtISO: null, powod: 'retencja' };
    const a = f.Bpk_zWpisu(kosz), b = f.Bpk_zWpisu(ret);
    expect([f.Bpk_polacz(a, b).r, f.Bpk_polacz(b, a).r]).toEqual(['', '']);
    // Lista lokalna (Bpk) po Bkz_dolacz w obu kolejnościach — ten sam stan składników.
    const lacz = (x, y) => { const m = new Map(); f.Bkz_dolacz(m, x); f.Bkz_dolacz(m, y); return m.get('s').Bpk.r; };
    expect([lacz(kosz, ret), lacz(ret, kosz)]).toEqual(['', '']);
  });
});

describe('W3: poprawka z ekranu nie zmienia gwiazdki (Z7, K4)', () => {
  it('poprawka z okna otwartego przed synchronizacją gwiazdki nie zmienia rejestru („poprawka … — tylko chwilę treści”): 58*', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K']);
    const okno = await gdzie(u.P, sid); // okno poprawki na P: kopia treści bez gwiazdki
    przesunZegar(M); await przypnij(u.K, sid, true);
    przesunZegar(M); await sync(u.K, u.P); // P dostaje gwiazdkę K
    przesunZegar(M);
    await u.P.updateSnapshotPayload(okno.pid, sid, { ...okno.s.payload, user: { ...okno.s.payload.user, weight: 58 } }, { preserveSavedAt: true });
    expect(await widokNa(u, sid, 'P')).toBe('karta 58*');
  }, 60_000);
});
