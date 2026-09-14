import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-TOZSAMOSC-PYTAJ (zlecenie właściciela 2026-09-14) — niejednoznaczne dopasowanie pacjenta
// przestaje być rozstrzygane przez automat.
//
// Sejf dopasowuje po znormalizowanym nazwisku. Dwa układy zostawiają go bez rozstrzygnięcia:
//   a) zapisywany ma datę urodzenia, ale któryś imiennik w bazie jej nie ma;
//   b) daty nie ma nigdzie, a imienników jest więcej niż jeden.
// Dotąd w obu wybierał „nowy pacjent" i informował o tym po fakcie.
//
// DLACZEGO TO MA ZNACZENIE: oba możliwe wyjścia są błędami PRZECIWNYMI, a sejf nie ma jak
// zgadnąć, które zachodzi. Jeśli to jedno dziecko — historia rozjeżdża się na dwa rekordy
// (ta sama klasa usterki, co duplikaty z P-DUP). Jeśli to imiennicy — scalenie dałoby jedną
// siatkę wzrastania z pomiarami dwojga dzieci, czyli gorzej. Dlatego pyta.
//
// UMOWA: resolver zwraca {akcja:"dopisz",patientId} | {akcja:"nowy"} | {akcja:"anuluj"}.
// Jego brak, błąd albo nieznana odpowiedź zostawiają DOTYCHCZASOWE zachowanie — dzięki temu
// strona, która nie zarejestrowała okna, działa jak wcześniej.
//
// Testy sejfu są zachowaniowe: prawdziwy `vilda_vault.js`, prawdziwy zapis i odczyt,
// magazyn w pamięci. Wszystkie dane są jednoznacznie fikcyjne.

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
  await v.createUser(`Tozsamosc#Pytaj!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

/* Pacjent w kształcie, w jakim oddaje go kolektor. Dane jednoznacznie fikcyjne. */
function pacjent({ dobISO = null, waga = 30, wzrost = 130, lata = 9 } = {}) {
  const p = {
    name: 'Testowa Zofia',
    user: {
      lastName: 'Testowa', firstName: 'Zofia', sex: 'F',
      age: lata, ageMonths: 0, weight: waga, height: wzrost,
    },
  };
  if (dobISO) p.user.dobISO = dobISO;
  return p;
}

/* Resolver, który zapamiętuje, o co go zapytano — to jest połowa tego, co mierzymy. */
function pytany(odpowiedz) {
  const zapytania = [];
  const fn = async (we) => { zapytania.push(we); return typeof odpowiedz === 'function' ? odpowiedz(we) : odpowiedz; };
  fn.zapytania = zapytania;
  return fn;
}

const ilu = async (v) => (await v.listPatients()).length;

describe('Kiedy sejf pyta, a kiedy nie', () => {
  it('nowe nazwisko nie jest niejednoznaczne — zakłada pacjenta bez pytania', async () => {
    const v = await sejf();
    const r = pytany({ akcja: 'anuluj' });
    v.setPatientIdentityResolver(r);

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(r.zapytania, 'nie ma o co pytać').toHaveLength(0);
    expect(w.isNew).toBe(true);
    expect(await ilu(v)).toBe(1);
  });

  it('imiennik z TĄ SAMĄ datą urodzenia to ten sam pacjent — dopisuje bez pytania', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    const r = pytany({ akcja: 'anuluj' });
    v.setPatientIdentityResolver(r);

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04', waga: 31 }));
    expect(r.zapytania).toHaveLength(0);
    expect(w.isNew).toBe(false);
    expect(await ilu(v)).toBe(1);
  });

  it('imiennicy z RÓŻNYMI datami to różne dzieci — zakłada drugiego bez pytania', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    const r = pytany({ akcja: 'anuluj' });
    v.setPatientIdentityResolver(r);

    const w = await v.savePatient(pacjent({ dobISO: '2015-08-21' }));
    expect(r.zapytania, 'daty rozstrzygają — pytanie byłoby zbędne').toHaveLength(0);
    expect(w.isNew).toBe(true);
    expect(await ilu(v)).toBe(2);
  });

  it('PYTA, gdy imiennik w bazie nie ma daty urodzenia, a zapisywany ma', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    const r = pytany({ akcja: 'nowy' });
    v.setPatientIdentityResolver(r);

    await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(r.zapytania).toHaveLength(1);
    expect(r.zapytania[0].dobISO).toBe('2017-03-04');
    expect(r.zapytania[0].candidates).toHaveLength(1);
  });

  it('PYTA, gdy imienników jest dwóch, a zapisywany nie ma daty urodzenia', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    await v.savePatient(pacjent({ dobISO: '2015-08-21' }));
    const r = pytany({ akcja: 'nowy' });
    v.setPatientIdentityResolver(r);

    await v.savePatient(pacjent({ dobISO: null }));
    expect(r.zapytania).toHaveLength(1);
    expect(r.zapytania[0].dobISO).toBeNull();
    expect(r.zapytania[0].candidates).toHaveLength(2);
  });

  it('nie pyta, gdy wołający wskazał pacjenta wprost, wymusił nowego albo wyłączył dopasowanie', async () => {
    const v = await sejf();
    const pierwszy = await v.savePatient(pacjent({ dobISO: null }));
    const r = pytany({ akcja: 'anuluj' });
    v.setPatientIdentityResolver(r);

    await v.savePatient(pacjent({ dobISO: '2017-03-04' }), { patientId: pierwszy.patientId });
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }), { forceNew: true });
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }), { dedup: false });
    expect(r.zapytania, 'wołający już zdecydował').toHaveLength(0);
  });

  it('można wyłączyć samo pytanie, nie wyłączając dopasowania', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    const r = pytany({ akcja: 'anuluj' });
    v.setPatientIdentityResolver(r);

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }), { pytajOTozsamosc: false });
    expect(r.zapytania).toHaveLength(0);
    expect(w.isNew, 'zostaje dotychczasowe zachowanie').toBe(true);
    expect(w.collision.ambiguous).toBe(true);
  });
});

describe('Co robi odpowiedź lekarza', () => {
  it('„dopisz" wkłada pomiar do wskazanej karty i NIE mnoży pacjentów', async () => {
    const v = await sejf();
    const stary = await v.savePatient(pacjent({ dobISO: null, waga: 30 }));
    v.setPatientIdentityResolver(async (we) => ({ akcja: 'dopisz', patientId: we.candidates[0].patientId }));

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04', waga: 31 }));
    expect(w.patientId).toBe(stary.patientId);
    expect(w.isNew).toBe(false);
    expect(await ilu(v), 'to samo dziecko — jedna karta').toBe(1);

    const rek = await v.getPatient(stary.patientId);
    expect(rek.snapshotCount).toBe(2);
    expect(rek.snapshots[0].payload.user.weight).toBe(31);
  });

  it('„nowy" zakłada osobną kartę i zapisuje, że to była decyzja lekarza', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    v.setPatientIdentityResolver(async () => ({ akcja: 'nowy' }));

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(w.isNew).toBe(true);
    expect(await ilu(v)).toBe(2);
    expect(w.collision.rozstrzygniete, 'kolektor ma po czym poznać, że nie strofować').toBe(true);
    expect(w.collision.decyzja).toBe('nowy');
  });

  it('„anuluj" nie zapisuje NICZEGO i mówi wprost, co się stało', async () => {
    const v = await sejf();
    const stary = await v.savePatient(pacjent({ dobISO: null }));
    v.setPatientIdentityResolver(async () => ({ akcja: 'anuluj' }));

    await expect(v.savePatient(pacjent({ dobISO: '2017-03-04' })))
      .rejects.toMatchObject({ vildaSaveAborted: true });

    expect(await ilu(v), 'żadnej nowej karty').toBe(1);
    expect((await v.getPatient(stary.patientId)).snapshotCount, 'żadnej nowej wersji').toBe(1);
  });
});

describe('Gdy odpowiedzi nie ma albo jest bez sensu', () => {
  it('brak okna zostawia dotychczasowe zachowanie: nowy pacjent z ostrzeżeniem', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(w.isNew).toBe(true);
    expect(w.collision.ambiguous).toBe(true);
    expect(w.collision.rozstrzygniete, 'nikt nie rozstrzygnął').toBeUndefined();
  });

  it('wyjątek w oknie nie wywraca zapisu — wraca zachowanie domyślne', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    v.setPatientIdentityResolver(async () => { throw new Error('okno padło'); });

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(w.isNew).toBe(true);
    expect(w.collision.rozstrzygniete).toBeUndefined();
  });

  it('nieznana odpowiedź jest traktowana jak brak odpowiedzi', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    v.setPatientIdentityResolver(async () => ({ akcja: 'scal' }));

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(w.isNew).toBe(true);
    expect(w.collision.rozstrzygniete).toBeUndefined();
  });

  it('„dopisz" do pacjenta spoza listy kandydatów jest odrzucane', async () => {
    const v = await sejf();
    await v.savePatient(pacjent({ dobISO: null }));
    // Identyfikator z palca — okno nie ma prawa wskazać pacjenta, o którego nie pytano.
    v.setPatientIdentityResolver(async () => ({ akcja: 'dopisz', patientId: 'pac_zmyslony' }));

    const w = await v.savePatient(pacjent({ dobISO: '2017-03-04' }));
    expect(w.patientId).not.toBe('pac_zmyslony');
    expect(w.isNew).toBe(true);
    expect(w.collision.rozstrzygniete).toBeUndefined();
  });
});

describe('Kandydaci niosą to, po czym lekarz ich rozróżnia', () => {
  it('nazwisko u wszystkich jest takie samo, więc liczy się reszta', async () => {
    const v = await sejf();
    const a = await v.savePatient(pacjent({ dobISO: null, lata: 9 }));
    await v.savePatient(pacjent({ dobISO: null, lata: 9, waga: 31 }), { patientId: a.patientId });

    const r = pytany({ akcja: 'nowy' });
    v.setPatientIdentityResolver(r);
    await v.savePatient(pacjent({ dobISO: '2017-03-04' }));

    const k = r.zapytania[0].candidates[0];
    expect(k.patientId).toBe(a.patientId);
    expect(k.name).toBe('Testowa Zofia');
    expect(k.dobISO, 'to właśnie brak daty robi tę niejednoznaczność').toBeNull();
    expect(k.age).toBe(9);
    expect(k.sex).toBe('F');
    expect(k.snapshotCount, 'ile wizyt ma ta karta').toBe(2);
    expect(typeof k.lastSavedAtISO, 'kiedy ostatnio zapisywana').toBe('string');
    // Dwie karty potrafią mieć identyczny opis. Skrót identyfikatora różni je ZAWSZE —
    // bez niego pytanie „który to pacjent?" bywa nie do odpowiedzenia.
    expect(k.shortId).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── Teksty okna ───────────────────────────────────────────────────────────────
// Odmiana liczebników po polsku jest częścią poprawności komunikatu: „są już 2 pacjenci",
// ale „jest już 5 pacjentów". Zdanie, które się nie odmienia, czyta się jak automat.

function wytnij(zrodlo, nazwa) {
  const i = zrodlo.indexOf(`function ${nazwa}(`);
  if (i < 0) throw new Error(`nie ma funkcji ${nazwa}`);
  let d = 0;
  for (let k = zrodlo.indexOf('{', i); k < zrodlo.length; k += 1) {
    if (zrodlo[k] === '{') d += 1;
    else if (zrodlo[k] === '}') { d -= 1; if (!d) return zrodlo.slice(i, k + 1); }
  }
  throw new Error(`nie domknięto ${nazwa}`);
}

function teksty() {
  const src = readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');
  const ciala = ['Gz1', 'Gz0', 'Gz3'].map((n) => wytnij(src, n)).join('\n');
  const Gr4 = (t) => (t ? new Date(t).toISOString() : '');
  return new Function('Gr4', `${ciala}\nreturn { Gz0, Gz1, Gz3 };`)(Gr4);
}

describe('Zdania w oknie odmieniają się po polsku', () => {
  it('liczba wersji: 1 wersja, 2–4 wersje, reszta wersji', () => {
    const { Gz1 } = teksty();
    expect(Gz1(1)).toBe('1 wersja');
    expect(Gz1(3)).toBe('3 wersje');
    expect(Gz1(5)).toBe('5 wersji');
    expect(Gz1(12), 'nastolatki są wyjątkiem').toBe('12 wersji');
    expect(Gz1(22)).toBe('22 wersje');
  });

  it('liczba imienników: jest 1 pacjent, są 2 pacjenci, jest 5 pacjentów', () => {
    const { Gz3 } = teksty();
    expect(Gz3(1)).toBe('jest już 1 pacjent o tym samym nazwisku');
    expect(Gz3(2)).toBe('są już 2 pacjenci o tym samym nazwisku');
    expect(Gz3(5)).toBe('jest już 5 pacjentów o tym samym nazwisku');
    expect(Gz3(13)).toBe('jest już 13 pacjentów o tym samym nazwisku');
  });

  it('opis kandydata nazywa brak daty urodzenia wprost, a nie pustką', () => {
    const { Gz0 } = teksty();
    expect(Gz0({ dobISO: null, age: 9, sex: 'F', snapshotCount: 2, shortId: 'a3f10b22' }))
      .toBe('bez daty urodzenia · 9 l · dziewczynka · 2 wersje · #a3f10b22');
    expect(Gz0({ dobISO: '2017-03-04', age: 8, ageMonths: 4, sex: 'M' }))
      .toBe('ur. 2017-03-04 · 8 l 4 mies. · chłopiec');
  });

  it('kandydat bez żadnych danych nie produkuje pustego wiersza', () => {
    const { Gz0 } = teksty();
    expect(Gz0({})).toBe('bez daty urodzenia');
  });

  it('dwaj kandydaci nie do odróżnienia opisem różnią się skrótem identyfikatora', () => {
    const { Gz0 } = teksty();
    const wspolne = { dobISO: null, age: 9, sex: 'F', snapshotCount: 1 };
    const a = Gz0({ ...wspolne, shortId: 'a3f10b22' });
    const b = Gz0({ ...wspolne, shortId: '77c0de91' });
    expect(a, 'inaczej okno pyta o wybór między dwoma identycznymi wierszami').not.toBe(b);
  });
});
