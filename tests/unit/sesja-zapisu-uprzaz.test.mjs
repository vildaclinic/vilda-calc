// P-SESJA-ZAPISU — test uprzęży tests/unit/sesja-zapisu-uprzaz.mjs. Pilnuje, że narzędzia testów sesji zapisu mierzą
// to, co deklarują: dwa konta na jednym magazynie w pamięci, rejestr wywołań [metoda, userId] z sesją, przełączanie
// sesji (blokada, ponowne zalogowanie A, zalogowanie B, tryb chmurowy), haki po operacjach magazynu i crypto.subtle,
// atrapa Web Locks z rejestrem żądań i przytrzymaniem blokady, okna pytań sejfu, timery okna i atrapa chmury dla
// prawdziwego vilda_sync.js. Przypadki nie zależą od zachowania zapisu po zmianie sesji — sprawdzają samą uprząż.
//
// Przypadki:
//   U1  urządzenie: B zablokowane, A zalogowane, oba konta w jednym magazynie; rejestr par [metoda, userId] z sesją.
//   U2  przełączenia 'B', 'A', 'blokada': sesja, numer sesji, znacznik; bez trwającej operacji po przełączeniu żadnych
//       wywołań magazynu (znacznik od końca logowania).
//   U3  zapis w jednej sesji: rejestr i zdarzenie z sesją A, stan magazynu trwałego kont A i B.
//   U4  hak „po”: przełączenie zaraz po wskazanej operacji magazynu, operacja oddaje wynik po przełączeniu; „ktory”.
//   U5  hak „wstrzymaj” i „blad” w magazynie (także błąd z polem code).
//   U6  Web Locks: przytrzymana blokada karty, zapis w kolejce, rejestr żądań, zwolnienie; limit czekania odpalony
//       timerem okna (bez czekania na upływ czasu).
//   U7  crypto.subtle: rejestr z sesją, wstrzymanie szyfrowania w sekcji zapisu karty, przełączenie po szyfrowaniu.
//   U8  okna pytań: „Który to pacjent?” i okno konfliktu (pod blokadą karty) z odpowiedzią testu.
//   U9  tryb chmurowy: część sesyjna poza magazynem trwałym (rejestr jej nie widzi, widać ją w utrwaleniach
//       sessionStorage po znaczniku), tryb po przełączeniach.
//   U10 vilda_sync.js z atrapą chmury: pobranie wstrzymane na blobie i zwolnione.
//   U11 wycinanie funkcji ze źródła (deklaracja, async, przypisanie) i sprzątanie po teście.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b): żadne — test uprzęży, zielony na bazie i na poprawce.
import { afterEach, describe, expect, it } from 'vitest';
import {
  HASLO_A, HASLO_B, KLUCZ_SESJI_CHMURY, atrapaChmury, naglowek, sprzatnij, urzadzenie, wynik, wytnijFunkcje, zaladujSync, zrodlo,
} from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const nazwaBlokady = (patientId) => `vilda-save-pat:${patientId}`;

describe('P-SESJA-ZAPISU: uprząż testów sesji zapisu', () => {
  it('U1: konto B zablokowane, konto A zalogowane, oba w jednym magazynie; rejestr [metoda, userId] z sesją', async () => {
    const d = await urzadzenie();
    expect(d.sesja()).toBe('A');
    expect(d.v.isUnlocked()).toBe(true);
    expect(d.A.userId).not.toBe(d.B.userId);
    expect(d.kto(d.A.userId)).toBe('A');
    expect(d.kto(d.B.userId)).toBe('B');
    expect(d.kto(null)).toBe(null);
    expect((await d.v.listUsers()).map((u) => u.userId).sort()).toEqual([d.A.userId, d.B.userId].sort());
    expect(d.wyw.every((w) => Array.isArray(w) && w.length === 2 && typeof w[0] === 'string')).toBe(true);
    const konta = new Set(d.wyw.map(([, u]) => u));
    expect(konta.has(d.A.userId) && konta.has(d.B.userId), 'zapisy obu kont w jednym rejestrze').toBe(true);
    expect(d.wywPelne.filter((w) => w.userId === d.A.userId && w.metoda === 'putUserMeta').every((w) => w.sesja !== 'B')).toBe(true);
    expect(await d.trwaly('A')).toEqual({ karty: 0, wersje: 0, nagrobki: 0, notatki: 0, listy: 0 });
  });

  it('U2: przełączenia B, A i sama blokada — sesja, numer sesji i znacznik; bez trwającej operacji nic po znaczniku', async () => {
    const d = await urzadzenie();
    const n0 = d.nrSesji();
    const zB = await d.przelacz('B');
    expect(d.sesja()).toBe('B');
    expect(zB).toMatchObject({ wariant: 'B', sesja: 'B' });
    expect(zB.nrSesji).toBe(n0 + 2);
    expect(zB.start.wyw).toBeLessThan(zB.wyw);
    expect(d.wywPelne.slice(zB.start.wyw, zB.wyw).every((w) => w.wPrzelaczeniu)).toBe(true);
    await kolejnaTura();
    expect(d.po(zB).wyw, 'po zalogowaniu B — żadnych wywołań magazynu bez operacji testu').toEqual([]);

    const zA = await d.przelacz('A');
    expect(d.sesja()).toBe('A');
    expect(zA.nrSesji).toBe(n0 + 4);
    await kolejnaTura();
    expect(d.po(zA).wyw).toEqual([]);
    expect(d.po().wyw, 'po() bez argumentu — ostatnie przełączenie').toEqual([]);

    const zL = await d.przelacz('blokada');
    expect(d.sesja()).toBe(null);
    expect(d.v.isUnlocked()).toBe(false);
    expect(zL).toMatchObject({ wariant: 'blokada', sesja: null });
    expect(d.przelaczenia).toEqual([zB, zA, zL]);

    await d.zaloguj('A');
    expect(d.sesja()).toBe('A');
    expect(d.przelaczenia.length, 'zaloguj() nie jest przełączeniem scenariusza').toBe(3);
    await expect(d.przelacz('C')).rejects.toThrow(/nieznany wariant/);
  });

  it('U3: zapis w jednej sesji — rejestr i zdarzenie z sesją A, magazyn trwały A i B', async () => {
    const d = await urzadzenie();
    const z = d.znacznik();
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    expect(p.isNew).toBe(true);
    const zapisy = d.wywPelne.slice(z.wyw).filter((w) => /^put(Snapshot|Patient)ForUser$/.test(w.metoda));
    expect(zapisy.length).toBeGreaterThanOrEqual(2);
    expect(zapisy.every((w) => w.userId === d.A.userId && w.sesja === 'A')).toBe(true);
    expect(d.zdarzenia.slice(z.zdarzenia).filter((e) => e.typ === 'patientSaved').map((e) => [e.sesja, e.dane.patientId])).toEqual([['A', p.patientId]]);
    expect(await d.trwaly('A')).toMatchObject({ karty: 1, wersje: 1 });
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.kartaTrwala('A', p.patientId)).toEqual({ jest: true, wersje: 1 });
    expect(await d.kartaTrwala('B', p.patientId)).toEqual({ jest: false, wersje: 0 });
  });

  it('U4: hak „po” — przełączenie zaraz po wskazanej operacji magazynu; „ktory” liczy pasujące wywołania', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(2), { dedup: false });
    const hak = d.przelaczPo({ metoda: 'putSnapshotForUser', konto: 'A' }, 'B');
    expect(hak.zrobione).toBe(false);
    const zapis = wynik(d.v.savePatient(naglowek(2, { wzrost: 131 }), { patientId: p.patientId, dedup: false }));
    const z = await hak.gotowe;
    expect(hak.zrobione).toBe(true);
    expect(z).toMatchObject({ wariant: 'B', sesja: 'B' });
    expect(d.wywPelne[z.start.wyw - 1], 'ostatnie wywołanie przed przełączeniem to operacja haka').toMatchObject({ metoda: 'putSnapshotForUser', userId: d.A.userId, sesja: 'A' });
    await zapis;
    expect(d.przelaczenia.length, 'hak odpala raz').toBe(1);

    await d.zaloguj('A');
    const odUzbrojenia = d.wyw.length;
    const ktory = d.magazyn.po({ metoda: 'getPatientForUser', ktory: 2 }, () => d.wyw.slice(odUzbrojenia).filter(([m]) => m === 'getPatientForUser').length);
    await d.v.savePatient(naglowek(2, { wzrost: 132 }), { patientId: p.patientId, dedup: false });
    expect(await ktory.gotowe, 'akcja po drugim pasującym wywołaniu').toBe(2);
  });

  it('U5: hak „wstrzymaj” trzyma operację magazynu do zwolnienia, „blad” kończy ją błędem bez wykonania', async () => {
    const d = await urzadzenie();
    const brama = d.magazyn.wstrzymaj({ metoda: 'putPatientForUser', konto: 'A' });
    const zapis = wynik(d.v.savePatient(naglowek(3), { dedup: false }));
    const w = await brama.osiagnieta;
    expect(w.metoda).toBe('putPatientForUser');
    expect(w.argumenty[0]).toBe(d.A.userId);
    expect((await d.trwaly('A')).karty, 'rekord karty jeszcze nie zapisany').toBe(0);
    brama.zwolnij();
    const r = await zapis;
    expect(r.ok).toBe(true);
    expect((await d.trwaly('A')).karty).toBe(1);

    const przed = (await d.trwaly('A')).wersje;
    d.magazyn.blad({ metoda: 'putSnapshotForUser' }, { komunikat: 'atrapa: zapis wersji nie powiódł się' });
    const r2 = await wynik(d.v.savePatient(naglowek(3, { wzrost: 125 }), { patientId: r.w.patientId, dedup: false }));
    expect(r2.ok).toBe(false);
    expect(r2.komunikat).toMatch(/atrapa: zapis wersji/);
    expect((await d.trwaly('A')).wersje, 'wersja nie zapisana').toBe(przed);
    const r3 = await wynik(d.v.savePatient(naglowek(3, { wzrost: 126 }), { patientId: r.w.patientId, dedup: false }));
    expect(r3.ok, 'błąd jednorazowy').toBe(true);

    d.magazyn.blad({ metoda: 'getPatientForUser' }, { komunikat: 'atrapa: odczyt z kodem', kod: 'KOD_ATRAPY' });
    const r4 = await wynik(d.magazyn.adapter.getPatientForUser(d.A.userId, 'karta-fikcyjna'));
    expect({ ok: r4.ok, kod: r4.kod, komunikat: r4.komunikat }, 'błąd atrapy z polem code').toEqual({ ok: false, kod: 'KOD_ATRAPY', komunikat: 'atrapa: odczyt z kodem' });
  });

  it('U6: Web Locks — blokada karty przytrzymana przez test, zapis w kolejce, rejestr żądań, zwolnienie i limit', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(4), { dedup: false });
    const nazwa = nazwaBlokady(p.patientId);
    const inna = await d.locks.trzymaj(nazwa);
    expect(d.locks.zajeta(nazwa)).toBe(true);
    const od = d.locks.zadania.length;
    let czekal = 0;
    const zapis = wynik(d.v.savePatient(naglowek(4, { wzrost: 133 }), { patientId: p.patientId, dedup: false, onLockWait() { czekal += 1; } }));
    await d.locks.czekajNaKolejke(nazwa);
    expect(czekal).toBe(1);
    expect(d.locks.czekajacych(nazwa)).toBe(1);
    const zad = d.locks.zadania.slice(od).filter((x) => x.nazwa === nazwa);
    expect(zad.map((x) => [x.ifAvailable, x.wynik, x.sesja, x.test])).toEqual([[true, 'zajeta', 'A', false], [false, 'w-kolejce', 'A', false]]);
    expect(await d.locks.czekajNaZadanie(nazwa, { od })).toBe(zad[0]);
    expect(await d.locks.query()).toEqual({ held: [{ name: nazwa, mode: 'exclusive' }], pending: [{ name: nazwa, mode: 'exclusive' }] });
    await inna.zwolnij();
    const r = await zapis;
    expect(r.ok).toBe(true);
    expect(zad[1].wynik).toBe('przyznana');
    expect(d.locks.zajeta(nazwa), 'blokada wolna po zapisie').toBe(false);

    const inna2 = await d.locks.trzymaj(nazwa);
    const zapis2 = wynik(d.v.savePatient(naglowek(4, { wzrost: 134 }), { patientId: p.patientId, dedup: false, lockTimeoutMs: 5000, onLockWait() {} }));
    const t = await d.timery.czekajNa((x) => x.ms === 5000);
    expect(t.ms).toBe(5000);
    expect(d.timery.odpal((x) => x.id === t.id)).toBe(1);
    const r2 = await zapis2;
    expect(r2.ok).toBe(false);
    expect(r2.e.vildaSaveBusy, 'limit czekania: karta zajęta w innej karcie').toBe(true);
    expect(d.locks.czekajacych(nazwa)).toBe(0);
    expect(d.locks.zadania.filter((x) => x.nazwa === nazwa && !x.test).at(-1).wynik).toBe('przerwana');
    await inna2.zwolnij();
  });

  it('U7: crypto.subtle — rejestr z sesją, wstrzymanie szyfrowania w sekcji zapisu karty, przełączenie po szyfrowaniu', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(5), { dedup: false });
    expect(d.krypto.log.some((x) => x.metoda === 'encrypt' && x.sesja === 'A')).toBe(true);

    const brama = d.krypto.wstrzymaj({ metoda: 'encrypt', wStosie: 'Bpz_sekcja' });
    const odWyw = d.wyw.length;
    const zapis = wynik(d.v.savePatient(naglowek(5, { wzrost: 131 }), { patientId: p.patientId, dedup: false }));
    await brama.osiagnieta;
    expect(d.wyw.slice(odWyw).some(([m]) => m === 'putSnapshotForUser'), 'szyfrowanie przed zapisem wersji').toBe(false);
    brama.zwolnij();
    expect((await zapis).ok).toBe(true);

    const hak = d.przelaczWKrypto({ metoda: 'encrypt', wStosie: /Bpz_sekcja/ }, 'blokada');
    const zapis2 = wynik(d.v.savePatient(naglowek(5, { wzrost: 132 }), { patientId: p.patientId, dedup: false }));
    const z = await hak.gotowe;
    expect(z).toMatchObject({ wariant: 'blokada', sesja: null });
    expect(d.krypto.log[z.start.krypto - 1]).toMatchObject({ metoda: 'encrypt', sesja: 'A' });
    await zapis2;
  });

  it('U8: okna pytań — „Który to pacjent?” i okno konfliktu pod blokadą karty, odpowiedź testu', async () => {
    const d = await urzadzenie();
    const bezDaty = { dob: null };
    const p1 = await d.v.savePatient(naglowek(7, bezDaty), { dedup: false });
    await d.v.savePatient(naglowek(7, { ...bezDaty, wzrost: 121 }), { dedup: false });
    const okno = d.oknoTozsamosci();
    const zapis = wynik(d.v.savePatient(naglowek(7, { ...bezDaty, wzrost: 140 }), {}));
    const pyt = await okno.czekaj();
    expect(pyt).toMatchObject({ nr: 1, sesja: 'A', odpowiedziano: false });
    expect(d.pytania.map((x) => [x.okno, x.sesja])).toEqual([['tozsamosc', 'A']]);
    okno.odpowiedz({ akcja: 'dopisz', patientId: p1.patientId });
    const r = await zapis;
    expect(r.ok).toBe(true);
    expect(r.w).toMatchObject({ isNew: false, patientId: p1.patientId });
    okno.zamknij();

    const bazowy = naglowek(8, { pomiary: [[100, 118]] });
    const p = await d.v.savePatient(JSON.parse(JSON.stringify(bazowy)), { dedup: false });
    await d.v.savePatient(naglowek(8, { pomiary: [[100, 118], [110, 122]] }), { patientId: p.patientId, dedup: false });
    const konflikt = d.oknoKonfliktu();
    const zapisK = wynik(d.v.savePatient(naglowek(8, { wzrost: 125, pomiary: [[100, 118]] }), { patientId: p.patientId, dedup: false, baselinePayload: bazowy }));
    const pk = await konflikt.czekaj();
    expect(pk.sesja).toBe('A');
    expect(d.locks.zajeta(nazwaBlokady(p.patientId)), 'okno konfliktu otwarte pod blokadą karty').toBe(true);
    konflikt.odpowiedz('nadpisz');
    expect((await zapisK).ok).toBe(true);
    expect(d.locks.zajeta(nazwaBlokady(p.patientId))).toBe(false);

    const auto = d.oknoKonfliktu({ odpowiedz: 'nadpisz' });
    await d.v.savePatient(naglowek(8, { wzrost: 126, pomiary: [[100, 118]] }), { patientId: p.patientId, dedup: false, baselinePayload: bazowy });
    expect(auto.pytania.every((q) => q.odpowiedziano)).toBe(true);
  });

  it('U9: tryb chmurowy — karty w części sesyjnej, nie w magazynie trwałym; tryb po przełączeniach', async () => {
    const d = await urzadzenie({ chmura: true });
    expect(d.v.isCloudOnlyMode()).toBe(true);
    const z = d.znacznik();
    const p = await d.v.savePatient(naglowek(9), { dedup: false });
    expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([p.patientId]);
    expect((await d.trwaly('A')).karty, 'magazyn trwały bez kart konta w trybie chmurowym').toBe(0);
    expect(d.wyw.slice(z.wyw).some(([m]) => m === 'putPatientForUser'), 'zapis karty poza rejestrem magazynu trwałego').toBe(false);
    expect(d.stanSesjiChmury()).toMatchObject({ A: { karty: 1, wersje: 1 } });
    expect(d.dziennik.some((x) => x.magazyn === 'sessionStorage' && x.klucz === KLUCZ_SESJI_CHMURY && x.sesja === 'A')).toBe(true);

    await d.przelacz('B');
    expect(d.v.isCloudOnlyMode(), 'konto B w trybie zwykłym').toBe(false);
    const zA = await d.przelacz('A');
    expect(d.v.isCloudOnlyMode(), 'ponowne zalogowanie A — znów tryb chmurowy').toBe(true);
    expect(d.zapisySesyjne(zA), 'samo zalogowanie — bez utrwalenia części sesyjnej po znaczniku').toBe(0);
    await d.v.savePatient(naglowek(9, { wzrost: 131 }), { dedup: false });
    expect(d.po(zA).wyw.some(([m]) => m === 'putSnapshotForUser'), 'zapis wersji poza rejestrem magazynu trwałego').toBe(false);
    expect(d.zapisySesyjne(zA), 'zapis karty w nowej sesji — utrwalenie części sesyjnej po znaczniku').toBeGreaterThanOrEqual(1);
    expect(HASLO_A).not.toBe(HASLO_B);
  });

  it('U10: prawdziwy vilda_sync.js z atrapą chmury — pobranie wstrzymane na blobie konta A i zwolnione', async () => {
    const d = await urzadzenie();
    const chmura = atrapaChmury();
    const sync = zaladujSync(d, { fetch: chmura.fetch });
    expect(typeof sync.syncPull).toBe('function');
    const p = await d.v.savePatient(naglowek(10), { dedup: false });
    const { slotId } = await chmura.wgrajKonto(d);
    await d.baza.removePatientForUser(d.A.userId, p.patientId);
    expect((await d.v.listPatients()).length, 'karta tylko w chmurze').toBe(0);
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/blob', slot: slotId });
    const pobranie = wynik(sync.syncPull());
    const zadanie = await brama.osiagnieta;
    expect(zadanie).toMatchObject({ metoda: 'GET', sciezka: '/blob', slot: slotId });
    brama.zwolnij();
    const r = await pobranie;
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe('merged');
    expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([p.patientId]);
    expect(chmura.log.slice(0, 2).map((x) => `${x.metoda} ${x.sciezka}`)).toEqual(['GET /status', 'GET /blob']);
  });

  it('U11: wycinanie funkcji ze źródła i sprzątanie po teście', async () => {
    const src = zrodlo('vilda_vault.js');
    const opcje = wytnijFunkcje(src, 'Bses_opcje');
    expect(opcje.startsWith('function Bses_opcje(')).toBe(true);
    expect(opcje.endsWith('}')).toBe(true);
    expect(() => new Function(opcje)).not.toThrow();
    const zapis = wytnijFunkcje(src, 'Bpz_zapis');
    expect(zapis.startsWith('async function Bpz_zapis(')).toBe(true);
    expect(() => new Function(zapis)).not.toThrow();
    const sekcja = wytnijFunkcje(src, 'Bpz_sekcja');
    expect(sekcja.startsWith('async function(')).toBe(true);
    expect(() => new Function(`return (${sekcja});`)).not.toThrow();
    expect(() => wytnijFunkcje(src, 'BrakTakiejFunkcji')).toThrow(/nie ma funkcji/);

    const d = await urzadzenie();
    const oryginalnyFetch = globalThis.fetch;
    zaladujSync(d, { fetch: atrapaChmury().fetch });
    expect(globalThis.fetch).not.toBe(oryginalnyFetch);
    await d.locks.trzymaj('vilda-save-pat:fikcyjna');
    d.win.setTimeout(() => {}, 60000);
    expect(d.timery.oczekujace().some((t) => t.ms === 60000)).toBe(true);
    await sprzatnij();
    expect(d.locks.zajeta('vilda-save-pat:fikcyjna')).toBe(false);
    expect(d.timery.oczekujace()).toEqual([]);
    expect(globalThis.fetch).toBe(oryginalnyFetch);
  });
});
