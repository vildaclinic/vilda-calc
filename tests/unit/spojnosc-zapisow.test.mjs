import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SPOJNOSC-ZAPISOW (makieta zaakceptowana przez właściciela 2026-09-30): sprawdzenie tylko do odczytu,
// czy w karcie pacjenta nie ma zapisów innej osoby (skutek wyścigu naprawionego w P-POWLOKA-ID, #491).
// Tutaj czyste reguły modułu i przebieg na prawdziwym `vilda_vault.js` z pomyłką odtworzoną przez
// savePatient(payload B, { patientId: A }). Widok w Ustawieniach sprawdza tests/e2e/spojnosc-zapisow.spec.mjs.
// Wszystkie osoby są fikcyjne.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plik = (n) => readFileSync(path.join(repoRoot, n), 'utf8');

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function okno() {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false, readyState: 'complete', getElementById: () => null },
  };
  win.window = win; win.self = win; win.top = win;
  return win;
}

function modul(win = okno()) {
  loadBrowserScript('vilda_spojnosc_zapisow.js', win);
  return win.VildaSpojnoscZapisow;
}

const S = modul();
const I = S.__internals;

// Zapis w sejfie → wiersz porównania (kształt jak getPatient().snapshots[i]).
const snap = (savedAtISO, name, dobISO, sex, extra = {}) => ({
  snapshotId: `s-${savedAtISO}`,
  savedAtISO,
  payload: { name, user: { dobISO, sex, height: 120, weight: 22, ...extra } },
});
const wiersze = (...snapy) => snapy.map(I.wierszZapisu);

describe('normalizacja nazwiska, daty i płci', () => {
  it('nazwisko bez znaków diakrytycznych, „ł” jak „l”, słowa w dowolnej kolejności', () => {
    expect(I.kluczNazwy('Łukasz  Żółć-Testowy')).toBe('lukasz testowy zolc');
    expect(I.kluczNazwy('Testowy Jan')).toBe(I.kluczNazwy('jan TESTOWY'));
    expect(I.kluczNazwy('  ')).toBe('');
    expect(I.tokenyNazwy('Jan Jan Testowy')).toEqual(['jan', 'testowy']);
  });

  it('data urodzenia tylko w postaci RRRR-MM-DD, płeć K/M; pusta płeć to brak, nie „M”', () => {
    expect(I.dataUrodzenia('2012-8-5')).toBe('2012-08-05');
    expect(I.dataUrodzenia('2012-08-05T00:00:00Z')).toBe('2012-08-05');
    expect(I.dataUrodzenia('05.08.2012')).toBe(null);
    expect(I.dataUrodzenia('2012-13-01')).toBe(null);
    expect(I.plec('F')).toBe('K');
    expect(I.plec('m')).toBe('M');
    expect(I.plec('')).toBe(null);
  });

  it('zapis nieczytelny (payload null) nie daje wiersza; nazwa z imienia i nazwiska, gdy brak name', () => {
    expect(I.wierszZapisu({ snapshotId: 'x', savedAtISO: '2026-01-01', payload: null })).toBe(null);
    const w = I.wierszZapisu({ snapshotId: 'y', savedAtISO: '2026-01-01', payload: { user: { lastName: 'Testowy', firstName: 'Jan' } } });
    expect(w.nazwa).toBe('Testowy Jan');
    expect(w.dob).toBe(null);
  });
});

describe('ocena zapisu względem wzorca karty', () => {
  const wz = { klucz: 'adam innyrecz', tokeny: ['adam', 'innyrecz'], dob: '2016-03-12' };
  const r = (name, dobISO) => I.wierszZapisu(snap('2026-09-29T12:00:00Z', name, dobISO, 'M'));

  it('to samo nazwisko i data — zgodny; ta sama osoba bez daty w zapisie — zgodny', () => {
    expect(I.porownaj(r('Adam Innyrecz', '2016-03-12'), wz)).toBe('zgodny');
    expect(I.porownaj(r('Innyrecz Adam', null), wz)).toBe('zgodny');
  });

  it('inne nazwisko bez wspólnego słowa — obcy, niezależnie od daty', () => {
    expect(I.porownaj(r('Probna Alicja', '2012-08-05'), wz)).toBe('obcy');
    expect(I.porownaj(r('Probna Alicja', '2016-03-12'), wz)).toBe('obcy');
    expect(I.porownaj(r('Probna Alicja', null), wz)).toBe('obcy');
  });

  it('wspólne słowo: przy tej samej lub nieznanej dacie inna pisownia, przy innej dacie (rodzeństwo) obcy', () => {
    expect(I.porownaj(r('Innyrecz Adam Piotr', '2016-03-12'), wz)).toBe('pisownia');
    expect(I.porownaj(r('Innyrec Adam', null), wz)).toBe('pisownia');
    expect(I.porownaj(r('Innyrecz Ewa', '2019-01-02'), wz)).toBe('obcy');
  });

  it('to samo nazwisko z inną datą — do sprawdzenia (zwykle poprawka daty)', () => {
    expect(I.porownaj(r('Innyrecz Adam', '2016-03-21'), wz)).toBe('data');
  });

  it('inicjał nie wiąże dwóch nazwisk', () => {
    expect(I.porownaj(r('Fikcyjny J', '2016-03-12'), { klucz: 'j testowy', tokeny: ['j', 'testowy'], dob: '2016-03-12' })).toBe('obcy');
  });
});

describe('wzorzec karty: osoba z najstarszego zapisu, najczęstsza pisownia', () => {
  it('pomyłka dopisana na końcu nie przejmuje wzorca, nawet gdy ma więcej zapisów', () => {
    const w = I.wzorzecKarty(wiersze(
      snap('2026-09-29T13:38:00Z', 'Innyrecz Adam', '2016-03-12', 'M'),
      snap('2026-09-29T14:12:00Z', 'Probna Alicja', '2012-08-05', 'F'),
      snap('2026-09-29T14:20:00Z', 'Probna Alicja', '2012-08-05', 'F'),
    ));
    expect(w).toMatchObject({ klucz: 'adam innyrecz', dob: '2016-03-12', plec: 'M', nazwa: 'Innyrecz Adam' });
  });

  it('literówka w pierwszym zapisie: wzorcem jest najczęstsza pisownia tej samej osoby', () => {
    const w = I.wzorzecKarty(wiersze(
      snap('2026-01-01T10:00:00Z', 'Testowy Jn', '2019-11-21', 'M'),
      snap('2026-02-01T10:00:00Z', 'Testowy Jan', '2019-11-21', 'M'),
      snap('2026-03-01T10:00:00Z', 'Testowy Jan', '2019-11-21', 'M'),
    ));
    expect(w).toMatchObject({ klucz: 'jan testowy', dob: '2019-11-21' });
  });

  it('remis pisowni rozstrzyga starsza; nazwa wyświetlana z najnowszego zapisu tej pisowni', () => {
    const w = I.wzorzecKarty(wiersze(
      snap('2026-01-01T10:00:00Z', 'testowy jan', '2019-11-21', 'M'),
      snap('2026-02-01T10:00:00Z', 'Testowy Jan Piotr', '2019-11-21', 'M'),
      snap('2026-03-01T10:00:00Z', 'Testowy Jan', '2019-11-21', 'M'),
      snap('2026-04-01T10:00:00Z', 'Testowy Jan Piotr', '2019-11-21', 'M'),
    ));
    expect(w.klucz).toBe('jan testowy');
    expect(w.nazwa).toBe('Testowy Jan');
  });

  it('karta bez nazwisk w zapisach nie ma wzorca i nie jest oznaczana', () => {
    const k = I.uzupelnijInnymiKartami([I.ocenKarte({ patientId: 'p', wiersze: wiersze(snap('2026-01-01', '', null, 'M')) })]);
    expect(k[0].wzorzec).toBe(null);
    expect(k[0].poziom).toBe('ok');
  });
});

describe('druga faza: zapis z nazwiskiem innej karty', () => {
  const karta = (patientId, nazwaNaLiscie, ...snapy) => I.ocenKarte({ patientId, nazwaNaLiscie, wiersze: wiersze(...snapy) });

  it('imiennik z datą innej karty: „inna data urodzenia” staje się pomyłką ze wskazaniem karty', () => {
    const [a, b] = I.uzupelnijInnymiKartami([
      karta('A', 'Fikcyjny Jan',
        snap('2026-01-01T10:00:00Z', 'Fikcyjny Jan', '2010-05-01', 'M'),
        snap('2026-09-29T10:00:00Z', 'Fikcyjny Jan', '2015-02-03', 'M')),
      karta('B', 'Fikcyjny Jan', snap('2026-02-01T10:00:00Z', 'Fikcyjny Jan', '2015-02-03', 'M')),
    ]);
    expect(a.poziom).toBe('pomylka');
    expect(a.ocenione.find((o) => o.ocena === 'obcy').innaKarta).toMatchObject({ patientId: 'B', dob: '2015-02-03' });
    expect(I.dowodyPomylki(a)[0].zdanie, 'imiennik różni się datą, nie nazwiskiem')
      .toMatch(/ ma datę urodzenia innej osoby\. „Fikcyjny Jan” \(ur\. 03\.02\.2015\) ma w sejfie własną kartę\.$/);
    expect(b.poziom).toBe('ok');
  });

  it('inna pisownia równa nazwie innej karty: pomyłka; ale nie, gdy tamta karta to ta sama osoba (duplikat)', () => {
    const pomylka = I.uzupelnijInnymiKartami([
      karta('A', 'Testowy Jan', snap('2026-01-01T10:00:00Z', 'Testowy Jan', null, 'M'), snap('2026-02-01T10:00:00Z', 'Testowy Jan Piotr', null, 'M')),
      karta('C', 'Testowy Jan Piotr', snap('2026-01-05T10:00:00Z', 'Testowy Jan Piotr', null, 'M')),
    ]);
    expect(pomylka[0].poziom).toBe('pomylka');
    const duplikat = I.uzupelnijInnymiKartami([
      karta('A', 'Testowy Jan', snap('2026-01-01T10:00:00Z', 'Testowy Jan', '2019-11-21', 'M'), snap('2026-02-01T10:00:00Z', 'Testowy Jan Piotr', '2019-11-21', 'M')),
      karta('C', 'Testowy Jan Piotr', snap('2026-01-05T10:00:00Z', 'Testowy Jan Piotr', '2019-11-21', 'M')),
    ]);
    expect(duplikat[0].poziom).toBe('sprawdzic');
  });

  it('karta z pomyłką widnieje na liście pod obcą nazwą — to trafia do notki', () => {
    const [a] = I.uzupelnijInnymiKartami([
      karta('A', 'Probna Alicja', snap('2026-01-01T10:00:00Z', 'Innyrecz Adam', '2016-03-12', 'M'), snap('2026-02-01T10:00:00Z', 'Probna Alicja', '2012-08-05', 'F')),
    ]);
    expect(a.widniejeJako).toBe('Probna Alicja');
    expect(I.dowodyPomylki(a)[0].zdanie).toMatch(/ma nazwisko, datę urodzenia i płeć innej osoby\. W sejfie nie ma osobnej karty „Probna Alicja”\.$/);
  });

  it('pokazuje oznaczone zapisy i dwa najnowsze bez uwag, resztę liczy', () => {
    const [a] = I.uzupelnijInnymiKartami([
      karta('A', 'x',
        ...[1, 2, 3, 4, 5].map((d) => snap(`2026-0${d}-01T10:00:00Z`, 'Innyrecz Adam', '2016-03-12', 'M')),
        snap('2026-03-15T10:00:00Z', 'Probna Alicja', '2012-08-05', 'F')),
    ]);
    const { wiersze: pokaz, pominiete } = I.wierszeDoPokazania(a);
    expect(pokaz.map((o) => o.ocena)).toEqual(['zgodny', 'zgodny', 'obcy']);
    expect(pokaz[0].wiersz.savedAtISO).toBe('2026-05-01T10:00:00Z');
    expect(pominiete).toBe(3);
  });
});

describe('teksty', () => {
  it('odmiana liczebników', () => {
    const karty = (n) => I.odmiana(n, 'karta', 'karty', 'kart');
    expect([1, 2, 4, 5, 12, 14, 22, 25, 112, 122].map(karty)).toEqual(
      ['karta', 'karty', 'karty', 'kart', 'kart', 'kart', 'karty', 'kart', 'kart', 'karty']);
  });

  it('zdanie wyniku', () => {
    expect(I.zdanieWyniku({ wszystkich: 0 })).toBe('W sejfie nie ma jeszcze kart pacjentów.');
    expect(I.zdanieWyniku({ wszystkich: 112, karty: 112, zapisy: 1406, pomylki: 1, doSprawdzenia: 1 }))
      .toBe('Sprawdzono 112 kart i 1406 zapisów. 2 karty do przejrzenia.');
    expect(I.zdanieWyniku({ wszystkich: 1, karty: 1, zapisy: 1, pomylki: 0, doSprawdzenia: 0 }))
      .toBe('Sprawdzono 1 kartę i 1 zapis. Nie znaleziono zapisów innego pacjenta.');
    expect(I.zdanieWyniku({ wszystkich: 5, karty: 2, zapisy: 3, pomylki: 0, doSprawdzenia: 0, przerwano: true }))
      .toBe('Sprawdzanie przerwane: sprawdzono 2 z 5 kart i 3 zapisy. Do tej chwili nie znaleziono zapisów innego pacjenta.');
  });

  it('daty i pomiary w zapisie polskim', () => {
    expect(I.formatDaty('2012-08-05')).toBe('05.08.2012');
    expect(I.formatDaty(null)).toBe('—');
    expect(I.formatPomiarow(149.24, 51.4)).toBe('149,2\u00a0cm · 51,4\u00a0kg');
    expect(I.formatPomiarow(null, null)).toBe('—');
  });
});

// ── Prawdziwy sejf ──────────────────────────────────────────────────────────────────────────

const ITER = 10000;
let licznik = 0;

const ZAPISUJACE = /^(put|update|remove|wipe|delete)/;

async function sejf() {
  licznik += 1;
  const win = okno();
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  const pamiec = vault.createInMemoryAdapter();
  const zapisy = [];
  // Każde wywołanie zapisujące adaptera sejfu trafia do listy — sprawdzenie ma ich nie robić.
  const liczacy = new Proxy(pamiec, {
    get(cel, nazwa) {
      const v = cel[nazwa];
      if (typeof v !== 'function') return v;
      return (...a) => { if (ZAPISUJACE.test(String(nazwa))) zapisy.push(String(nazwa)); return v.apply(cel, a); };
    },
  });
  vault.setStorageAdapter(liczacy);
  await vault.createUser(`Sejf#Spojnosc!2026${licznik}aa`, { label: `dev${licznik}`, iterations: ITER });
  return { win, vault, zapisy, spojnosc: modul(win) };
}

const tik = () => new Promise((gotowe) => {
  const start = Date.now();
  const sprawdz = () => (Date.now() > start ? gotowe() : setTimeout(sprawdz, 1));
  sprawdz();
});

const osoba = (lastName, firstName, dobISO, sex, height, weight) => ({
  name: `${lastName} ${firstName}`,
  user: { lastName, firstName, dobISO, sex, height, weight },
});

async function zapisz(vault, payload, opcje = {}) {
  await tik();
  return vault.savePatient(payload, { dedup: false, ...opcje });
}

describe('przebieg na prawdziwym sejfie', () => {
  it('pomyłka z DocPro (zapis B w karcie A) — prawdopodobna pomyłka; inna pisownia — do sprawdzenia; nic nie zapisane', async () => {
    const { vault, zapisy, spojnosc } = await sejf();
    const adam = osoba('Innyrecz', 'Adam', '2016-03-12', 'M', 120, 22);
    const a = await zapisz(vault, adam);
    await zapisz(vault, { ...adam, user: { ...adam.user, height: 121, weight: 22.5 } }, { patientId: a.patientId });
    const b = await zapisz(vault, osoba('Probna', 'Alicja', '2012-08-05', 'F', 148, 50));
    // Wyścig sprzed P-POWLOKA-ID: formularz B, identyfikator A.
    await zapisz(vault, osoba('Probna', 'Alicja', '2012-08-05', 'F', 149.2, 51.4), { patientId: a.patientId });
    const jan = osoba('Testowy', 'Jan', '2019-11-21', 'M', 115.9, 20.1);
    const c = await zapisz(vault, jan);
    await zapisz(vault, { ...jan, name: 'Testowy Jan Piotr', user: { ...jan.user, firstName: 'Jan Piotr', height: 118.4 } }, { patientId: c.patientId });

    const lista = (await vault.listPatients()).find((p) => p.patientId === a.patientId);
    expect(lista.header.name, 'nazwa karty A na liście pochodzi z ostatniego zapisu').toBe('Probna Alicja');

    expect(zapisy.length, 'licznik widzi zapisy (kontrola samego licznika)').toBeGreaterThan(0);
    zapisy.length = 0;
    const postep = [];
    const wynik = await spojnosc.sprawdz(vault, { postep: (z, wsz) => postep.push(`${z}/${wsz}`) });
    expect(zapisy, 'sprawdzenie nie woła żadnej metody zapisującej adaptera sejfu').toEqual([]);

    expect(wynik).toMatchObject({ wszystkich: 3, karty: 3, zapisy: 6, pomylki: 1, doSprawdzenia: 1, bezUwag: 1, przerwano: false });
    expect(postep).toEqual(['0/3', '1/3', '2/3', '3/3']);
    const kartaA = wynik.oceny.find((k) => k.patientId === a.patientId);
    expect(kartaA.poziom).toBe('pomylka');
    expect(kartaA.wzorzec.nazwa).toBe('Innyrecz Adam');
    expect(kartaA.widniejeJako).toBe('Probna Alicja');
    const obcy = kartaA.ocenione.filter((o) => o.ocena === 'obcy');
    expect(obcy).toHaveLength(1);
    expect(obcy[0].innaKarta).toEqual({ patientId: b.patientId, nazwa: 'Probna Alicja', dob: '2012-08-05' });
    expect(spojnosc.__internals.dowodyPomylki(kartaA)[0].zdanie)
      .toMatch(/^Zapis z .+ ma nazwisko, datę urodzenia i płeć innej osoby\. „Probna Alicja” \(ur\. 05\.08\.2012\) ma w sejfie własną kartę\.$/);
    expect(wynik.oceny.find((k) => k.patientId === b.patientId).poziom).toBe('ok');
    const kartaC = wynik.oceny.find((k) => k.patientId === c.patientId);
    expect(kartaC.poziom).toBe('sprawdzic');
    expect(spojnosc.__internals.opisSlabej(kartaC))
      .toBe('Jeden zapis ma inną pisownię nazwiska; data urodzenia i płeć się zgadzają. Często to poprawka literówki albo dopisane drugie imię.');

    // Karty i zapisy po sprawdzeniu są takie jak przed nim.
    const poA = await vault.getPatient(a.patientId);
    expect(poA.snapshots).toHaveLength(3);
    expect(poA.header.name).toBe('Probna Alicja');
  }, 60000);

  it('przerwanie zatrzymuje się między kartami; wynik dotyczy sprawdzonych kart', async () => {
    const { vault, spojnosc } = await sejf();
    await zapisz(vault, osoba('Testowy', 'Jan', '2015-01-01', 'M', 110, 19));
    await zapisz(vault, osoba('Testowa', 'Ewa', '2014-01-01', 'F', 120, 21));
    let zrobione = 0;
    const wynik = await spojnosc.sprawdz(vault, { postep: (z) => { zrobione = z; }, czyPrzerwac: () => zrobione >= 1 });
    expect(wynik).toMatchObject({ wszystkich: 2, karty: 1, przerwano: true });
  }, 60000);

  it('zablokowany sejf: błąd z kodem, bez odczytu', async () => {
    const { vault, spojnosc } = await sejf();
    await zapisz(vault, osoba('Testowy', 'Jan', '2015-01-01', 'M', 110, 19));
    vault.lock();
    await expect(spojnosc.sprawdz(vault)).rejects.toMatchObject({ code: 'zablokowany' });
  }, 60000);

  it('„Ostatnie sprawdzenie”: klucz zarejestrowany jako local-persistent konta, osobno dla każdego konta', async () => {
    const { win, vault, spojnosc } = await sejf();
    const meta = win.VildaPersistence.MODULE_KEY_META[spojnosc.PREF_KEY];
    // „preference”, jak passwordChangedRemotelyAt: „Wyczyść wszystkie pola” (clearUserState) usuwa klucze danych
    // i techniczne, a chwila sprawdzenia nie jest stanem pacjenta.
    expect(meta).toEqual({ scope: 'account', kind: 'preference', storage: 'local-persistent' });
    expect(spojnosc.__internals.czytajOstatnie(vault)).toBe(null);
    expect(spojnosc.__internals.zapiszOstatnie(vault, '2026-09-30T08:52:00.000Z')).toBe(true);
    expect(spojnosc.__internals.czytajOstatnie(vault)).toBe('2026-09-30T08:52:00.000Z');
    const zapisane = JSON.parse(win.localStorage.getItem('recordConsistencyLastCheck'));
    expect(Object.values(zapisane)).toEqual(['2026-09-30T08:52:00.000Z']);
    expect(JSON.stringify(zapisane), 'tylko identyfikator konta i chwila, bez danych pacjentów').not.toMatch(/Testow|Innyrecz/);
    win.VildaPersistence.clearUserState({ includeSessions: true, source: 'test', durationMs: 0 });
    expect(spojnosc.__internals.czytajOstatnie(vault), '„Wyczyść wszystkie pola” nie kasuje chwili sprawdzenia').toBe('2026-09-30T08:52:00.000Z');
    vault.lock();
    expect(spojnosc.__internals.czytajOstatnie(vault), 'bez odblokowanego konta nie ma czyjej daty pokazać').toBe(null);
  }, 60000);
});

describe('strażniki źródła', () => {
  const src = plik('vilda_spojnosc_zapisow.js');

  it('z sejfu tylko odczyt: listPatients i getPatient, bez metod zapisujących', () => {
    const wolane = new Set([...src.matchAll(/vault\.([A-Za-z]+)\(/g)].map((m) => m[1]));
    expect([...wolane].sort()).toEqual(['getCurrentUser', 'getPatient', 'isUnlocked', 'listPatients']);
  });

  it('dane pacjenta trafiają do DOM wyłącznie przez textContent', () => {
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it('Ustawienia ładują moduł po historii wersji i kosz przed nim; karta w sekcji kopii zapasowych', () => {
    const html = plik('ustawienia.html');
    const i = html.indexOf('vilda_version_history_ui.js?v=');
    const k = html.indexOf('<script defer src="vilda_kosz_zapisow.js?v=1"></script>');
    const j = html.indexOf('<script defer src="vilda_spojnosc_zapisow.js?v=2"></script>');
    expect(i).toBeGreaterThan(0);
    expect(k, 'P-KOSZ-ZAPISOW: kosz po historii wersji').toBeGreaterThan(i);
    expect(j, 'sprawdzenie po module kosza').toBeGreaterThan(k);
    const sekcja = html.slice(html.indexOf('id="settings-section-backup"'));
    expect(sekcja.indexOf('id="recordConsistencyCard"')).toBeGreaterThan(sekcja.indexOf('id="vaultBackupCard"'));
    expect(sekcja.indexOf('id="recordTrashCard"'), 'kosz zaraz po sprawdzeniu').toBeGreaterThan(sekcja.indexOf('id="recordConsistencyCard"'));
    expect(sekcja.indexOf('id="recordTrashCard"')).toBeLessThan(sekcja.indexOf('id="autoVaultBackupCard"'));
  });
});
