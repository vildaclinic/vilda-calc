import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-KOLEJNOSC-WERSJI (zgłoszenie z przebiegu CI 2026-09-14) — o tym, która wersja rekordu
// jest BIEŻĄCA, rozstrzygał losowy identyfikator.
//
// Sejf sortuje wersje malejąco: `savedAtISO` → `updatedAtISO` → `rev` → `snapshotId`.
// `savedAtISO` ma rozdzielczość milisekundy, a świeżo utworzona wersja ma zawsze `rev: 0`,
// więc dwa zapisy tego samego pacjenta w tej samej milisekundzie schodziły do ostatniego
// kryterium — losowego UUID-a. Zmierzone na CI: druga wersja lądowała na liście PIERWSZA,
// czyli „bieżącym" stanem rekordu stawał się ten starszy.
//
// Dla klikającego człowieka nieosiągalne. Dla importu, synchronizacji i automatu — nie.
// A `snapshots[0]` to jest to, co Karta Pacjenta pokazuje jako aktualne dane.
//
// Poprawka: `seq` — numer kolejny wersji W OBRĘBIE PACJENTA. Nie zastępuje żadnego
// z dotychczasowych kryteriów; wchodzi dokładnie tam, gdzie dotąd decydował los, i tylko
// wtedy, gdy OBIE porównywane wersje go mają.
//
// Testy są zachowaniowe: prawdziwy `vilda_vault.js`, prawdziwy zapis i odczyt, magazyn
// w pamięci. Wszystkie dane są jednoznacznie fikcyjne.

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

function urzadzenie() {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: magazyn(),
    sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const v = urzadzenie();
  await v.createUser(`Kolejnosc#Wersji!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

const pacjent = (waga) => ({
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 9, ageMonths: 0, weight: waga, height: 130 },
});

const wagi = (rek) => rek.snapshots.map((s) => s.payload.user.weight);

describe('Numer kolejny wersji', () => {
  it('rośnie z każdym zapisem tego samego pacjenta', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent(30));
    await v.savePatient(pacjent(31), { patientId: a.patientId });
    await v.savePatient(pacjent(32), { patientId: a.patientId });

    const rek = await v.getPatient(a.patientId);
    expect(rek.snapshots.map((s) => s.seq)).toEqual([3, 2, 1]);
  });

  it('każdy pacjent ma własną numerację — nie globalną', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent(30), { dedup: false });
    await v.savePatient({ ...pacjent(40), name: 'Testowy Jan', user: { ...pacjent(40).user, lastName: 'Testowy', firstName: 'Jan' } }, { dedup: false });

    const rek = await v.getPatient(a.patientId);
    expect(rek.snapshots[0].seq, 'pierwsza wersja tego pacjenta to numer 1').toBe(1);
  });

  it('po skasowaniu wersji numer bywa użyty ponownie — i to nie szkodzi', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent(30));
    await v.savePatient(pacjent(31), { patientId: a.patientId });
    const przed = await v.getPatient(a.patientId);
    await v.deleteSnapshot(a.patientId, przed.snapshots[0].snapshotId);

    await v.savePatient(pacjent(32), { patientId: a.patientId });
    const po = await v.getPatient(a.patientId);

    // Numer liczy się z MAKSIMUM wśród wersji, które nadal istnieją, więc po skasowaniu
    // dwójki nowa wersja znów dostaje dwójkę. Rozstrzyganie remisów tego nie psuje:
    // znaczenie ma wyłącznie to, żeby numery były różne między wersjami, które są.
    const numery = po.snapshots.map((s) => s.seq);
    expect(new Set(numery).size, 'numery są różne między istniejącymi wersjami').toBe(numery.length);
    expect(numery[0], 'najnowsza ma najwyższy numer').toBe(Math.max(...numery));
    expect(wagi(po)[0]).toBe(32);
  });
});

describe('Dwa zapisy w tej samej milisekundzie', () => {
  it('bieżąca jest ta NOWSZA, nie ta, którą wylosował identyfikator', async () => {
    const v = await sejf();

    // Zamrożony zegar: WSZYSTKIE trzy zapisy dostają identyczny `savedAtISO` i `rev: 0`,
    // czyli dokładnie sytuację, w której dotąd rozstrzygał losowy UUID.
    let a;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
      a = await v.savePatient(pacjent(30));
      await v.savePatient(pacjent(31), { patientId: a.patientId });
      await v.savePatient(pacjent(32), { patientId: a.patientId });
    } finally {
      vi.useRealTimers();
    }

    const rek = await v.getPatient(a.patientId);
    expect(new Set(rek.snapshots.map((s) => s.savedAtISO)).size,
      'wszystkie trzy naprawdę trafiły w tę samą milisekundę').toBe(1);
    expect(new Set(rek.snapshots.map((s) => s.rev)).size, 'i wszystkie mają rev 0').toBe(1);
    expect(wagi(rek), 'od najnowszej do najstarszej').toEqual([32, 31, 30]);
    expect(rek.snapshots.map((s) => s.seq)).toEqual([3, 2, 1]);
  });

  it('wynik jest powtarzalny — to jest cała rzecz, o którą chodzi', async () => {
    for (let proba = 0; proba < 5; proba += 1) {
      const v = await sejf();
      let a;
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
        a = await v.savePatient(pacjent(30));
        await v.savePatient(pacjent(31), { patientId: a.patientId });
        await v.savePatient(pacjent(32), { patientId: a.patientId });
      } finally {
        vi.useRealTimers();
      }
      const rek = await v.getPatient(a.patientId);
      expect(wagi(rek), `próba ${proba + 1}`).toEqual([32, 31, 30]);
    }
  });
});

describe('Dane sprzed tej zmiany zachowują się jak wcześniej', () => {
  it('wersja bez numeru nie wygrywa i nie przegrywa z powodu jego braku', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent(30));
    const rek = await v.getPatient(a.patientId);

    // Rekord sprzed poprawki nie ma pola `seq` — i nie może przez to zniknąć z listy
    // ani przeskoczyć na jej czoło.
    expect(rek.snapshots).toHaveLength(1);
    expect(rek.snapshots[0].seq).toBe(1);
  });

  it('edycja wersji zachowuje jej numer', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent(30));
    await v.savePatient(pacjent(31), { patientId: a.patientId });
    const przed = await v.getPatient(a.patientId);
    const numery = przed.snapshots.map((s) => s.seq);

    const starsza = przed.snapshots[1];
    await v.updateSnapshotPayload(a.patientId, starsza.snapshotId,
      { ...starsza.payload, user: { ...starsza.payload.user, weight: 29 } });

    const po = await v.getPatient(a.patientId);
    expect(new Set(po.snapshots.map((s) => s.seq)), 'edycja nie kasuje numeru')
      .toEqual(new Set(numery));
    // Kolejność po edycji rozstrzyga `updatedAtISO`, kryterium WYŻSZE niż numer i starsze
    // niż ta zmiana: edytowana wersja staje się bieżącą. Numer tego nie zmienia i nie miał.
    expect(wagi(po)[0], 'edytowana wersja idzie na czoło — reguła sprzed tej zmiany').toBe(29);
  });
});

// Numer trzeba PRZENOSIĆ przy każdym przepisaniu rekordu wersji — edycja, synchronizacja,
// import, odtworzenie kopii. Pominięcie choćby jednego miejsca kasuje numer po cichu
// i wersja wraca do losowania, czego żaden test zachowaniowy by nie zauważył, dopóki nie
// trafi akurat w tę samą milisekundę. Dlatego pilnujemy tego spisem.
describe('Żadne miejsce zapisu wersji nie gubi numeru', () => {
  const src = readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');

  it('każde wywołanie putSnapshotForUser niesie numer', () => {
    const miejsca = [...src.matchAll(/putSnapshotForUser\(b,/g)]
      .map((m) => src.slice(m.index, m.index + 280));
    expect(miejsca.length, 'spis ma sens tylko wtedy, gdy te miejsca istnieją').toBeGreaterThan(5);

    const bezNumeru = miejsca.filter((frag) => !frag.includes('Bm1(')
      // Dwa miejsca dostają gotowy rekord, który numer już ma: świeżo utworzona wersja
      // (`w`) i wiersz zbudowany wcześniej w pętli importu (`O[A]`).
      && !frag.startsWith('putSnapshotForUser(b,w)')
      && !frag.startsWith('putSnapshotForUser(b,O[A])'));
    expect(bezNumeru, bezNumeru.map((f) => f.slice(0, 90)).join('\n')).toEqual([]);
  });

  it('sortowanie porównuje numery tylko wtedy, gdy mają je obie wersje', () => {
    expect(src).toContain('if(Bm2!==null&&Bm3!==null&&Bm2!==Bm3)return Bm3-Bm2;');
  });
});
