// P-SYNC-WLASCICIEL (E3-PR0e2b, część Kosza) — wpis Kosza pamięta chwilę przypisania wersji do karty wpisu
// (assignedAtISO). Decyzja właściciela z 2026-11-24: Kosz pamięta chwilę przypisania w tym samym wydaniu, jako osobna,
// osobno sprawdzana część zmian. Cały plik wyłącza się jednym ruchem: KOSZ_PAMIETA_PRZYPISANIE = false
// (tests/support/czesci-wydania.mjs) — wtedy też literały istniejących testów wracają do wyniku sprzed tej części.
//
// Zasada: pole wpisu idzie w składniku karty półkraty, razem z kartą wpisu — przy łączeniu dwóch wpisów tej samej wersji
// zostaje pole tego wpisu, którego karta wygrała (najpóźniejsze usunięcie), a przy tej samej karcie — późniejsze z obu;
// bez zegara i bez +1 ms (pole wpisu = pole wersji w chwili „Do Kosza”). Wpis bez pola (sprzed wydania) — bajt w bajt
// jak dotąd: odcisk, element eksportu, koperta wpisu Kosza. „Przywróć” bierze pole z wpisu, gdy wraca do karty wpisu.
// Lista pól koperty wpisu Kosza ma pole (bez niego encryptEvent odrzuca kopertę: EVENT_ENVELOPE_INVALID i koperta
// znika po cichu), a kanon odsyłania Kosza je pomija (różnica samego pola nie jest odsyłana —
// tests/unit/sync-odsylanie.test.mjs, POLA_POMIJANE.stomb w tests/support/licznik-odsylania.mjs).
//
// PRZYPADKI (na bazie 30008d8f czerwone — powód w nawiasie; zielone z natury — kontrole, każda z mutantem obok):
//   półkrata wpisów z polem z kodu sejfu (Bkz_dolacz): przemienność, idempotencja, pochłanianie, łączność (czerwone —
//        pole ginie przy łączeniu: wynik bez pola); pole razem z kartą: dwa wpisy tej samej wersji pod X (późniejsze
//        usunięcie, bez pola) i pod Y (z polem) — X bez pola (zielony z natury; mutant: pole łączone osobno od karty —
//        X z polem Y); ta sama karta — późniejsze pole (czerwony); odcisk wpisu bez pola bajt w bajt (zielony; mutant:
//        odcisk zawsze z polem), odcisk wpisu z polem (czerwony — odcisk bez pola);
//   urządzenia: „Do Kosza” wersji z chwilą — wpis z tą chwilą (bez +1 ms), element eksportu i koperta wpisu Kosza z nią,
//        koperta się szyfruje (czerwone — wpis bez pola); wpis bez pola — klucze elementu i koperty jak dotąd (zielony;
//        mutant: pole zawsze); koperta wpisu z polem zastosowana na drugim urządzeniu i „Przywróć” tam — wersja
//        z chwilą (czerwony); Kosz, „Przywróć” i dwie poprawki w starej karcie na urządzeniu bez wiedzy o scaleniu —
//        wizyta w karcie scalonej Y z chwilą, X nie wraca, „Usuń pacjenta” nie ma czego usunąć (czerwone — X wraca
//        z jedyną kopią wizyty i jej usunięcie kasuje wizytę); jedna poprawka — Y (zielony z natury: „Przywróć” podnosi
//        rev); „Przywróć” wersji leżącej pod inną kartą — bez pola wpisu (zielony; mutant: pole wpisu i spod innej
//        karty); starsza aplikacja (276) przyjmuje pełny ładunek i kopertę wpisu Kosza z polem — applied, wpis bez pola
//        (zielony z natury).
// Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”), bez PESEL. Prawdziwy vilda_vault.js w uprzęży tests/support/urzadzenie-sync.mjs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { zrodlaStarszej } from '../support/starsza-aplikacja.mjs';
import { KOSZ_PAMIETA_PRZYPISANIE } from '../support/czesci-wydania.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';

const HASLO = 'Vilda#Przypisanie!2026abc';
const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
const POLE = 'assignedAtISO';
const T1 = '2026-03-02T09:30:00.000Z';
const T2 = '2026-03-02T09:40:00.000Z';

let teraz = START;
let atrapa = null;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = MIN) => ustaw(teraz + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ustaw(START);
  atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
});
afterEach(async () => {
  await sprzatnijUrzadzenia();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Uprząż urządzeń (jak tests/unit/sync-chwila-przypisania.test.mjs) ─────────────────────────────────────────────────
const urzadzenie = (nazwa, o = {}) => utworzUrzadzenie({ atrapa, nazwa, sync: false, rejestrMagazynu: false, haslo: HASLO, ...o });
const blizniak = (d, nazwa, o = {}) => urzadzenie(nazwa, { zBlizniaka: d, ...o });
const json = (x) => JSON.parse(JSON.stringify(x));
const uid = (d) => d.vault.getCurrentUser().userId;
const rek = (d, sid) => d.adapter.getSnapshotForUser(uid(d), sid);
const maPole = (o) => !!o && Object.prototype.hasOwnProperty.call(o, POLE);
async function pole(d, sid) {
  const r = await rek(d, sid);
  if (!r) return 'brak wersji';
  return maPole(r) ? r[POLE] : null;
}
async function wstaw(d, sid, wartosc) {
  const r = await rek(d, sid);
  expect(r, 'kontrola: rekord wersji do wstawienia pola').toBeTruthy();
  await d.adapter.putSnapshotForUser(uid(d), { ...r, [POLE]: wartosc });
}
const eksport = async (d) => json(await d.vault.exportSyncPayload());
const scal = async (z, na) => na.vault.mergeSyncPayload(await eksport(z));
async function karta(d, i = 1, masy = [22]) {
  const ids = [];
  let P = null;
  for (const m of masy) {
    krok();
    const r = await d.vault.savePatient(naglowek(i, { masa: m }), { dedup: false, ...(P ? { patientId: P } : {}) });
    P = r.patientId;
    ids.push(r.snapshotId);
  }
  return { P, ids };
}
async function wersja(d, sid) {
  const r = await rek(d, sid);
  if (!r) return null;
  const p = await d.vault.getPatient(r.patientId);
  return (p && p.snapshots.find((s) => s.snapshotId === sid)) || null;
}
async function popraw(d, sid, masa) {
  krok();
  const r = await rek(d, sid);
  const s = await wersja(d, sid);
  await d.vault.updateSnapshotPayload(r.patientId, sid, { ...s.payload, user: { ...s.payload.user, weight: masa } }, { preserveSavedAt: true });
}
async function koszWpisy(d, sid) {
  const m = await d.adapter.getUserMeta(uid(d));
  return ((m && m.snapshotTombstones) || []).filter((e) => e && e.snapshotId === sid);
}
// Stan urządzenia: karty (etykiety) z masami wersji (v — oznaczona), położenie v z chwilą przypisania, wpisy Kosza v.
async function stanU(d, et, sid) {
  const karty = {};
  for (const k of await d.adapter.listPatientsForUser(uid(d))) {
    const p = await d.vault.getPatient(k.patientId);
    karty[et[k.patientId] || '?'] = (p ? p.snapshots : []).map((s) => (s.snapshotId === sid ? 'v:' : '') + s.payload.user.weight).sort();
  }
  const r = await rek(d, sid);
  const kosz = (await koszWpisy(d, sid)).map((e) => `${et[e.patientId] || '?'}${maPole(e) ? ` z chwilą ${e[POLE]}` : ''}`);
  return { karty, v: r ? `${et[r.patientId] || '?'}${maPole(r) ? ` z chwilą ${r[POLE]}` : ''}` : null, kosz };
}

// ── Półkrata wpisów Kosza z kodu sejfu (wycinek jak w tests/unit/polkrata-mechanizmy.test.mjs) ─────────────────────────
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repo, 'vilda_vault.js'), 'utf8');
const wytnij = (od, doo) => { const i = src.indexOf(od); return src.slice(i, src.indexOf(doo, i)); };
const doKonca = (od) => { const i = src.indexOf(od); return src.slice(i, src.indexOf('\n}\n', i) + 2); };
const KOD = [
  src.match(/function mt\(t\)\{var e=t&&t\.rev;[^}]*\}/)[0],
  src.match(/function Bm1\(t,e\)\{.*?return n==null\?\{\}:\{seq:n\}\}/)[0],
  wytnij('function Bkz_pozniejsza(', 'async function Bkz_podniesZapis('),
  'const de = 1e15, BKZ_KOSZ_MS = 1e14;',
  wytnij('function Bkz_czysc(', 'async function Bkz_czytaj('),
  doKonca('function Bsw_chwilaPrzypisania('),
  doKonca('function Bnp_iso('),
].join('\n');
const { Bkz_dolacz, Bpk_odcisk } = new Function(KOD + '\nreturn { Bkz_dolacz, Bpk_odcisk };')();

describe.skipIf(!KOSZ_PAMIETA_PRZYPISANIE)('półkrata wpisów Kosza z chwilą przypisania (Bkz_dolacz z kodu sejfu; część Kosza E3-PR0e2b)', () => {
  const T = (n) => `2026-10-20T09:0${n}:00.000Z`;
  const F = (n) => `2026-10-20T08:0${n}:00.000Z`;
  // Wpisy tej samej wersji: dwie karty, trzy chwile usunięcia, kosz i przycięcie, bez pola i z dwoma różnymi polami
  // (treść wpisu wyznacza para rev i chwila zmiany — ta sama wersja, jak w tests/unit/polkrata-mechanizmy.test.mjs).
  const U = [];
  for (const pid of ['p', 'q']) for (let d = 2; d <= 4; d += 1) for (const pole of [null, F(1), F(2)]) {
    const b = { patientId: pid, snapshotId: 's', deletedAtISO: T(d), rev: 1, updatedAtISO: T(1), ...(pole ? { [POLE]: pole } : {}) };
    U.push({ ...b, payloadCipher: 'v1@1' }, { ...b, powod: 'retencja' });
    if (d < 4) U.push({ ...b, przycietoISO: T(d + 1), payloadCipher: 'v1@1' });
  }
  const polacz = (...xs) => { const m = new Map(); xs.forEach((x) => Bkz_dolacz(m, json(x))); return m.get('s'); };
  const stan = (e) => {
    const p = e.Bpk ? { ...e.Bpk } : null;
    if (p && p.t && p.t.wE) p.t = { c: e.payloadCipher || null, o: p.t.o, od: p.t.od };
    const { Bpk, ...pola } = e;
    return JSON.stringify([pola, p]);
  };
  const chwile = (x) => [x.deletedAtISO, x.przycietoISO].filter(Boolean);

  it(`przemienność, idempotencja i pochłanianie w parach wpisów z chwilą przypisania i bez niej (${U.length} wpisów, ${U.length ** 2} par); wynik pary z polem po obu stronach tej samej karty ma pole`, () => {
    let zle = 0, zPolem = 0;
    for (const a of U) for (const b of U) {
      const ab = polacz(a, b);
      if (stan(ab) !== stan(polacz(b, a)) || stan(polacz(ab, ab)) !== stan(ab) || stan(polacz(ab, a)) !== stan(ab)) zle += 1;
      if (a.patientId === b.patientId && a[POLE] && b[POLE] && maPole(ab)) zPolem += 1;
    }
    for (const a of U) if (stan(polacz(a, a)) !== stan(polacz(a))) zle += 1;
    const pary = U.filter((a) => a[POLE]).length;
    expect({ zle, zPolem }).toEqual({ zle: 0, zPolem: 2 * (pary / 2) ** 2 });
  }, 60_000);

  it('łączność: trójki bez remisów chwil usunięcia — 6 kolejności × 2 nawiasowania dają ten sam stan, z polem', () => {
    let trojki = 0, zalezne = 0;
    const P = U.filter((x, i) => i % 2 === 0);
    for (const a of P) for (const b of P) for (const c of P) {
      const cz = [a, b, c].flatMap(chwile);
      if (new Set(cz).size !== cz.length) continue;
      trojki += 1;
      const w = new Set();
      for (const [x, y, z] of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
        w.add(stan(polacz(x, y, z)));
        const m = new Map(); Bkz_dolacz(m, json(x)); const yz = polacz(y, z); Bkz_dolacz(m, yz); w.add(stan(m.get('s')));
      }
      if (w.size !== 1) zalezne += 1;
    }
    expect(trojki, 'kontrola: są trójki').toBeGreaterThan(100);
    expect(zalezne).toBe(0);
  }, 60_000);

  // Pole idzie razem z kartą wpisu (składnik karty: chwila usunięcia, karta, chwila przypisania — leksykograficznie):
  // wpis pod X z późniejszym usunięciem (bez pola, np. Kosz na urządzeniu bez wiedzy o scaleniu) wygrywa kartę, więc
  // pola wpisu pod Y (przypisanie do Y) nie bierze — inaczej wpis mówiłby „X” z chwilą przypisania do Y. Ta sama karta:
  // pole wpisu z późniejszym usunięciem (także brak pola), przy tej samej chwili usunięcia — późniejsze pole.
  it('pole razem z kartą wpisu: X (późniejsze usunięcie, bez pola) + Y (z polem) → X bez pola, w obu kolejnościach; ta sama karta — pole wpisu z późniejszym usunięciem, przy tej samej chwili usunięcia — późniejsze pole', () => {
    const x = { patientId: 'X', snapshotId: 's', deletedAtISO: T(4), rev: 1, updatedAtISO: T(1), payloadCipher: 'v1' };
    const y = { patientId: 'Y', snapshotId: 's', deletedAtISO: T(3), rev: 1, updatedAtISO: T(1), payloadCipher: 'v1', [POLE]: F(2) };
    const krotko = (e) => [e.patientId, maPole(e) ? e[POLE] : null];
    expect([krotko(polacz(x, y)), krotko(polacz(y, x))], 'inna karta: pole zwycięzcy karty').toEqual([['X', null], ['X', null]]);
    const y1 = { ...y, deletedAtISO: T(2), [POLE]: F(1) };
    expect([krotko(polacz(y, y1)), krotko(polacz(y1, y))], 'ta sama karta: późniejsze pole').toEqual([['Y', F(2)], ['Y', F(2)]]);
    const ybez = { ...y, deletedAtISO: T(4) };
    delete ybez[POLE];
    expect([krotko(polacz(y1, ybez)), krotko(polacz(ybez, y1))], 'ta sama karta, późniejsze usunięcie bez pola').toEqual([['Y', null], ['Y', null]]);
    const yRemis = { ...y, [POLE]: F(1) };
    expect([krotko(polacz(y, yRemis)), krotko(polacz(yRemis, y))], 'ta sama karta, ta sama chwila usunięcia: późniejsze pole').toEqual([['Y', F(2)], ['Y', F(2)]]);
    const yRemisBez = { ...y };
    delete yRemisBez[POLE];
    expect([krotko(polacz(y, yRemisBez)), krotko(polacz(yRemisBez, y))], 'ta sama karta, ta sama chwila usunięcia: pole wygrywa z brakiem').toEqual([['Y', F(2)], ['Y', F(2)]]);
  });

  // Odcisk wpisu (Bpk_odcisk) bez pola — ta sama postać co dotąd (wpisy zapisane przed wydaniem nie zmieniają odcisku
  // i nie są przez to zapisywane ani wysyłane od nowa); z polem — pole na końcu.
  it('odcisk wpisu bez chwili przypisania bajt w bajt jak dotąd; z chwilą — ta chwila na końcu; chwila w złej postaci liczy się jak brak', () => {
    const e = { patientId: 'p', snapshotId: 's', deletedAtISO: T(3), rev: 1, updatedAtISO: T(1), savedAtISO: T(1) };
    const dotad = JSON.stringify(['p', T(3), null, null, 1, T(1), T(1), null, null, null, null, null]);
    expect({ bez: Bpk_odcisk(e), z: Bpk_odcisk({ ...e, [POLE]: F(1) }), zla: Bpk_odcisk({ ...e, [POLE]: '2026-10-20T08:01:00Z' }) })
      .toEqual({ bez: dotad, z: JSON.stringify([...JSON.parse(dotad), F(1)]), zla: dotad });
  });
});

// ── Urządzenia: „Do Kosza”, eksport, koperta, „Przywróć” ────────────────────────────────────────────────────────────────
describe.skipIf(!KOSZ_PAMIETA_PRZYPISANIE)('wpis Kosza pamięta chwilę przypisania — „Do Kosza”, eksport, koperta, „Przywróć” (część Kosza E3-PR0e2b)', () => {
  it('„Do Kosza” wersji z chwilą przypisania: wpis z tą samą chwilą (bez +1 ms i bez zegara), element Kosza w eksporcie i koperta wpisu Kosza z nią — element koperty = element eksportu, koperta się szyfruje; wersja bez chwili — wpis, element i koperta bez pola, klucze jak dotąd', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v, w] } = await karta(A, 1, [22, 23, 24]);
    await wstaw(A, v, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    krok(); await A.vault.moveSnapshotToTrash(P, w);
    const ev = A.vault._eventLog;
    const wynik = {};
    for (const [n, sid] of [['v', v], ['w', w]]) {
      const [wpis] = await koszWpisy(A, sid);
      const el = ((await eksport(A)).snapshotTombstones || []).find((e) => e.snapshotId === sid);
      const k = await ev.buildSnapshotTombstoneEvent(sid, null);
      const ek = (k.snapshotTombstones || []).find((e) => e.snapshotId === sid);
      let szyfr;
      try { await ev.encryptEvent(k); szyfr = 'ok'; } catch (e) { szyfr = (e && e.code) || 'błąd'; }
      wynik[n] = { wpis: maPole(wpis) ? wpis[POLE] : null, eksport: maPole(el) ? el[POLE] : null, koperta: maPole(ek) ? ek[POLE] : null, rowne: JSON.stringify(ek) === JSON.stringify(el), szyfr };
      if (n === 'w') wynik.kluczeBez = Object.keys(el).join(',');
    }
    expect(wynik).toEqual({
      v: { wpis: T1, eksport: T1, koperta: T1, rowne: true, szyfr: 'ok' },
      w: { wpis: null, eksport: null, koperta: null, rowne: true, szyfr: 'ok' },
      kluczeBez: wynik.kluczeBez,
    });
    expect(wynik.kluczeBez.split(',').includes(POLE), 'kontrola: element bez pola').toBe(false);
  }, CZAS);

  it('koperta wpisu Kosza z chwilą przypisania zastosowana na bliźniaku (applied): wpis z tą chwilą; „Przywróć” tam — wersja z nią w karcie wpisu', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22, 23]);
    const B = await blizniak(A, 'B');
    await wstaw(A, v, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    const { env } = await A.vault._eventLog.encryptEvent(await A.vault._eventLog.buildSnapshotTombstoneEvent(v, null));
    krok();
    const st = (await B.vault._eventLog.applyEncryptedEvent(env)).status;
    const [wpisB] = await koszWpisy(B, v);
    krok(); await B.vault.restoreTrashedSnapshot(P, v);
    expect({ st, wpis: maPole(wpisB) ? wpisB[POLE] : null, poPrzywroceniu: await pole(B, v), karta: (await rek(B, v)).patientId === P })
      .toEqual({ st: 'applied', wpis: T1, poPrzywroceniu: T1, karta: true });
  }, CZAS);

  // „Przywróć” wersji, która leży pod inną kartą niż karta wpisu (stan po przerwanym scaleniu), bierze chwilę z wersji
  // w karcie, nie z wpisu (wpis mówi o przypisaniu do swojej karty).
  it('„Przywróć” wersji leżącej też pod inną kartą niż karta wpisu: chwila z wersji w karcie, nie z wpisu', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v] } = await karta(A, 1, [22, 23]);
    const { P: Q } = await karta(A, 2, [30]);
    await wstaw(A, v, T2);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    const [wpis] = await koszWpisy(A, v);
    // rekord v z inną chwilą znów w karcie Q (jak po scaleniu przerwanym przed zapisem wpisu)
    const r = { patientId: Q, snapshotId: v, savedAtISO: wpis.savedAtISO, rev: wpis.rev, updatedAtISO: wpis.updatedAtISO, [POLE]: T1 };
    const zKarty = (await A.adapter.listSnapshotsForUser(uid(A), Q))[0];
    await A.adapter.putSnapshotForUser(uid(A), { ...zKarty, ...r, payloadCipher: zKarty.payloadCipher });
    krok();
    await A.vault.restoreTrashedSnapshot(P, v);
    expect(await pole(A, v)).toBe(T1);
  }, CZAS);

  it('starsza aplikacja (276) przyjmuje pełny ładunek i kopertę wpisu Kosza z chwilą przypisania bez błędu (applied) i zapisuje wpis bez niej', async () => {
    const A = await urzadzenie('A');
    const { P, ids: [v, w] } = await karta(A, 1, [22, 23, 24]);
    const O = await blizniak(A, 'S276', { zrodla: zrodlaStarszej('S276') });
    await wstaw(A, v, T1);
    await wstaw(A, w, T1);
    krok(); await A.vault.moveSnapshotToTrash(P, v);
    krok(); await A.vault.moveSnapshotToTrash(P, w);
    const { env } = await A.vault._eventLog.encryptEvent(await A.vault._eventLog.buildSnapshotTombstoneEvent(v, null));
    krok();
    const st = (await O.vault._eventLog.applyEncryptedEvent(env)).status;
    let pelny = 'ok';
    try { krok(); await scal(A, O); } catch (e) { pelny = (e && (e.code || e.message)) || 'błąd'; }
    const wpisy = [...await koszWpisy(O, v), ...await koszWpisy(O, w)];
    expect({ st, pelny, wpisy: wpisy.length, zPolem: wpisy.filter(maPole).length }).toEqual({ st: 'applied', pelny: 'ok', wpisy: 2, zPolem: 0 });
  }, CZAS);
});

// ── Kosz i „Przywróć” w karcie scalonej, poprawki w starej karcie na urządzeniu bez wiedzy o scaleniu ───────────────────
// K scala X → Y (v 20 kg, druga wizyta 21 kg), daje v do Kosza pod Y i „Przywróć”; T (bliźniak sprzed scalenia) poprawia
// v w X (40, 41 kg); cztery pełne wymiany. Bez części Kosza (jak w E3-PR0e2a) wpis gubił chwilę przypisania, a przy
// dwóch poprawkach (rev T wyższy niż rev po „Przywróć”) X wracała z jedyną kopią wizyty — „Usuń pacjenta” X kasował ją.
describe.skipIf(!KOSZ_PAMIETA_PRZYPISANIE)('Kosz i „Przywróć” w karcie scalonej, poprawki w starej karcie na urządzeniu bez wiedzy o scaleniu (część Kosza E3-PR0e2b)', () => {
  async function swiat(n) {
    const K = await urzadzenie('K');
    const { P: X, ids: [v] } = await karta(K, 1, [20, 21]);
    const { P: Y } = await karta(K, 2, [30]);
    const T = await blizniak(K, 'T');
    const et = { [X]: 'X', [Y]: 'Y' };
    krok(); await K.vault.mergePatients(X, Y);
    const tScal = await pole(K, v);
    krok(); await K.vault.moveSnapshotToTrash(Y, v);
    const wpis = (await koszWpisy(K, v)).map((e) => (maPole(e) ? e[POLE] : null));
    krok(); await K.vault.restoreTrashedSnapshot(Y, v);
    for (let i = 0; i < n; i += 1) await popraw(T, v, 40 + i);
    for (const [z, na] of [[K, T], [T, K], [K, T], [T, K]]) { krok(); await scal(z, na); }
    return { K, T, X, Y, v, et, tScal, wpis, poPrzywroceniu: await pole(K, v) };
  }
  for (const n of [1, 2]) {
    it(`${n === 1 ? '[kontrola] jedna poprawka' : 'dwie poprawki'}: wpis z chwilą scalenia, „Przywróć” z nią; po wymianach v z ostatnią poprawką w Y na K i T, X nie wraca`, async () => {
      const s = await swiat(n);
      const y = { karty: { Y: ['21', '30', '30', `v:${39 + n}`] }, v: `Y z chwilą ${s.tScal}`, kosz: [] };
      expect({ wpis: s.wpis, poPrzywroceniu: s.poPrzywroceniu, K: await stanU(s.K, s.et, s.v), T: await stanU(s.T, s.et, s.v) })
        .toEqual({ wpis: [s.tScal], poPrzywroceniu: s.tScal, K: y, T: y });
    }, 2 * CZAS);
  }
  it('dwie poprawki, potem „Usuń pacjenta” X na K, jeśli X wróciła: X nie wróciła — v z poprawką zostaje w Y na K i T', async () => {
    const s = await swiat(2);
    const wrocila = !!(await s.K.adapter.getPatientForUser(uid(s.K), s.X));
    if (wrocila) { krok(); await s.K.vault.removePatient(s.X); for (const [z, na] of [[s.K, s.T], [s.T, s.K], [s.K, s.T]]) { krok(); await scal(z, na); } }
    const y = { karty: { Y: ['21', '30', '30', 'v:41'] }, v: `Y z chwilą ${s.tScal}`, kosz: [] };
    expect({ wrocila, K: await stanU(s.K, s.et, s.v), T: await stanU(s.T, s.et, s.v) }).toEqual({ wrocila: false, K: y, T: y });
  }, 2 * CZAS);
});
