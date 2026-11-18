// Strażniki fikstur starszej aplikacji (E3-PR0b, tests/support/starsza-aplikacja.mjs): skróty trzech fikstur po
// normalizacji CRLF, retencja v1 przycina kartę, a bieżąca nie (sejf 221 i sejf 276), sejf 276 ładuje się z rejestrem
// łańcucha i wymienia zdarzenia z bieżącym sejfem, próg delty karty sejfu 221 między 2 a 3 wersjami w treści uprzęży.
// Urządzenia z tests/support/urzadzenie-sync.mjs (sejf na adapterze w pamięci, bez vilda_sync.js), zegar Date
// sterowany. Dane wyłącznie fikcyjne („Testowy Jan”, „Fikcyjna Lekarka”).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { eksportKanoniczny, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { FIKSTURY, PROG_DELT_221, skrotBezCR, tekstFikstury, zrodlaStarszej } from '../support/starsza-aplikacja.mjs';

const HASLO = 'Vilda#Testowe!2026abc';
const START = Date.parse('2026-03-02T08:00:00.000Z');
const DZIEN = 864e5;
const DEV = 'abcdefgh';
const OPCJE = { pominSeq: true, pominSnapshotCount: true };
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = 60e3) => ustaw(teraz + ms);
let atrapa = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ustaw(START);
  atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
});
afterEach(async () => { await sprzatnijUrzadzenia(); vi.useRealTimers(); });
const urzadzenie = (nazwa, o = {}) => utworzUrzadzenie({ atrapa, nazwa, sync: false, rejestrMagazynu: false, haslo: HASLO, ...o });
const wersje = async (d, pid) => (await d.vault.getPatient(pid)).snapshots.map((s) => s.snapshotId);

describe('fikstury starszej aplikacji: skróty po normalizacji CRLF', () => {
  it('sha256 i rozmiar sejfu 221, sejfu 276 i retencji v1 zgodne z FIKSTURY; kopia z CRLF daje ten sam skrót', () => {
    for (const [nazwa, f] of Object.entries(FIKSTURY)) {
      const t = tekstFikstury(nazwa);
      expect(Buffer.byteLength(t.replace(/\r\n/g, '\n'), 'utf8'), f.plik).toBe(f.bajtow);
      expect(skrotBezCR(t), f.plik).toBe(f.sha256);
      expect(skrotBezCR(t.replace(/\n/g, '\r\n')), `${f.plik} z CRLF`).toBe(f.sha256);
    }
  }, 10_000);
});

// Karta z 8 wersjami z 8 dni (co 2 dni), oglądana 40–54 dni później: retencja v1 zostawia najnowszą z miesiąca
// (parametry aplikacji: 24 h, 30 dni, miesiące, limit 40), bieżąca — najnowszy stan każdej wizyty (dzień kliniczny).
describe('retencja na starszej aplikacji: v1 przycina, bieżąca nie', () => {
  for (const app of ['S221', 'S276']) {
    for (const [retencja, zostaje] of [['v1', 1], ['biezaca', 8]]) {
      it(`${app === 'S221' ? 'sejf 221' : 'sejf 276'} z retencją ${retencja === 'v1' ? 'v1 (fikstura)' : 'bieżącą'}: z 8 wersji zostaje ${zostaje}`, async () => {
        const C = await urzadzenie(`C${app}${retencja}`, { zrodla: zrodlaStarszej(app, { retencja }) });
        const { patientId: pid } = await C.zapiszKarte(1, { wzrost: 100, masa: 20 });
        for (let i = 1; i < 8; i += 1) {
          ustaw(START + i * 2 * DZIEN);
          await C.zapiszKarte(1, { wzrost: 100 + i, masa: 20 + i, zapis: { patientId: pid, forceNewSnapshot: true } });
        }
        const przed = await wersje(C, pid);
        ustaw(START + 54 * DZIEN);
        await C.vault.pruneSnapshotsForPatient(pid, { recentHours: 24 });
        const po = await wersje(C, pid);
        expect(przed.length).toBe(8);
        expect(po.length).toBe(zostaje);
        const najnowsza = (await C.vault.getPatient(pid)).snapshots.reduce((m, s) => (s.savedAtISO > m.savedAtISO ? s : m));
        expect(najnowsza.savedAtISO).toBe(new Date(START + 14 * DZIEN).toISOString());
      }, 10_000);
    }
  }
});

describe('sejf 276: rejestr łańcucha, dziennik zdarzeń i wymiana zdarzeń z bieżącym sejfem', () => {
  it('bliźniak bieżącego urządzenia na sejfie 276 ma _eventLog i ten sam eksport na starcie; zdarzenie snap przechodzi w obie strony', async () => {
    const A = await urzadzenie('A');
    const { patientId: pid } = await A.zapiszKarte(1);
    krok();
    let lancuch = null;
    const C = await urzadzenie('C276', { zBlizniaka: A, zrodla: zrodlaStarszej('S276', { lancuch: (l) => { lancuch = l; } }) });
    expect(typeof C.vault._eventLog).toBe('object');
    expect(Array.isArray(lancuch)).toBe(true);
    expect(eksportKanoniczny(await C.vault.exportSyncPayload(), OPCJE)).toBe(eksportKanoniczny(await A.vault.exportSyncPayload(), OPCJE));
    // 276 → bieżący: nowa wersja na C trafia do rejestru łańcucha, koperta snap z C scala się na A
    const nowa = async (d, i) => {
      const przed = new Set(await wersje(d, pid));
      krok();
      await d.zapiszKarte(1, { wzrost: 120 + i, masa: 22 + i, zapis: { patientId: pid, forceNewSnapshot: true } });
      const sid = (await wersje(d, pid)).filter((x) => !przed.has(x));
      expect(sid.length).toBe(1);
      return sid[0];
    };
    const przeslij = async (X, Y, sid) => {
      const { env } = await X.vault._eventLog.encryptEvent(await X.vault._eventLog.buildSnapshotEvent(pid, sid, DEV));
      return (await Y.vault._eventLog.applyEncryptedEvent(env)).status;
    };
    const sidC = await nowa(C, 1);
    expect(lancuch.some((z) => z.kind === 'snap')).toBe(true);
    expect(await przeslij(C, A, sidC)).toBe('applied');
    expect(await wersje(A, pid)).toContain(sidC);
    // bieżący → 276
    const sidA = await nowa(A, 2);
    expect(await przeslij(A, C, sidA)).toBe('applied');
    expect(await wersje(C, pid)).toContain(sidA);
  }, 10_000);
});

describe('sejf 221: próg delty karty w treści uprzęży', () => {
  it(`dł(2 wersje) < ${PROG_DELT_221} < dł(3 wersje); długość rośnie z każdą wersją`, async () => {
    const C = await urzadzenie('C221', { zrodla: zrodlaStarszej('S221') });
    expect(typeof C.vault.buildPatientDelta).toBe('function');
    expect(C.vault._eventLog).toBe(undefined);
    const { patientId: pid } = await C.zapiszKarte(1, { wzrost: 120, masa: 22 });
    const dl = [(await C.vault.buildPatientDelta(pid)).data.length];
    for (let k = 2; k <= 3; k += 1) {
      krok();
      await C.zapiszKarte(1, { wzrost: 120 + k, masa: 22 + k, zapis: { patientId: pid, forceNewSnapshot: true } });
      dl.push((await C.vault.buildPatientDelta(pid)).data.length);
    }
    expect(dl[0]).toBeLessThan(dl[1]);
    expect(dl[1]).toBeLessThan(PROG_DELT_221);
    expect(dl[2]).toBeGreaterThan(PROG_DELT_221);
  }, 10_000);
});
