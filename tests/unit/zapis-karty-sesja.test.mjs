// P-SESJA-ZAPISU — zapis karty pacjenta kończy się w sesji, w której ruszył.
//
// Pilnuje savePatient i jego wołających („Scal pacjentów”, restoreSnapshotAsNew, promoteExternalToBase,
// importLegacyJsonPatient). Sesja to konto i klucz z chwili wejścia do zapisu, a w operacjach, które przed wewnętrznym
// zapisem czytają karty („Scal pacjentów”, restoreSnapshotAsNew, promoteExternalToBase) — z chwili wejścia do operacji;
// ponowne zalogowanie tego samego konta to inna sesja. Gdy zapis czeka (na
// blokadę karty trzymaną przez inną kartę przeglądarki, na odpowiedź w oknie „Który to pacjent?”, na odpowiedź w oknie
// konfliktu pod blokadą karty), a w tym czasie sejf zostanie zablokowany albo zaloguje się inne konto, zapis kończy się
// błędem SESSION_CHANGED („Zapis przerwany”). Po zmianie sesji: żadnego wywołania magazynu (także odczytu, także bez
// konta), żadnej operacji crypto.subtle, żadnego żądania blokady, żadnego pytania okna, żadnego powiadomienia i żadnego
// utrwalenia części sesyjnej trybu chmurowego; blokada karty wolna zaraz po odrzuceniu. Ten sam kod, gdy po zmianie
// sesji mija limit czekania na blokadę karty, i gdy magazyn odrzuca zapis kodem SESSION_CHANGED. Operacja złożona po
// zmianie sesji (w odczycie kart, w czekaniu na blokady kart, w wewnętrznym zapisie karty, między krokami „Scal
// pacjentów”: przeniesienie wersji, wewnętrzny zapis karty docelowej, licznik wersji, notatki, listy, usunięcie karty
// źródłowej, a także wewnątrz przeniesienia notatki i zmiany listy — po czekaniu na blokadę notatki i po każdym odczycie,
// odszyfrowaniu, zaszyfrowaniu i zapisie) kończy się tym samym błędem, bez dalszych kroków i bez powiadomień. Błąd
// odczytu karty w tej samej sesji zostaje tym błędem. Sejf zablokowany już na wejściu — odmowa jak dotąd, bez SESSION_CHANGED. W jednej sesji
// wyniki zapisu i operacji złożonych bez zmian.
//
// Prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js na wspólnej uprzęży ./sesja-zapisu-uprzaz.mjs: konto
// A zalogowane i konto B zablokowane na jednym magazynie w pamięci z rejestrem wywołań, atrapa Web Locks z rejestrem
// żądań, crypto.subtle z rejestrem, timery okna (limit czekania odpalany bez upływu czasu). Czekanie wyłącznie na
// zdarzenia i obietnice. Dane wyłącznie FIKCYJNE („Testowy Jan”).
//
// Przypadki:
//   Z1        zapis czeka na blokadę karty; w tym czasie blokada sejfu i zalogowanie konta B; potem blokada karty
//             zwolniona.
//   Z1-war    jak Z1: ponowne zalogowanie A i sama blokada sejfu, w trybie zwykłym i chmurowym (cloud-only); w trybie
//             chmurowym także zalogowanie B.
//   Z1-limit  limit czekania na blokadę karty (lockTimeoutMs) mija po zmianie sesji — SESSION_CHANGED, nie „zajęta”.
//   Z2        okno „Który to pacjent?” (setPatientIdentityResolver) czeka na odpowiedź; zmiana sesji; odpowiedź dopisz,
//             nowy albo anuluj.
//   Z3        okno konfliktu (setSaveConflictResolver) czeka na odpowiedź pod blokadą karty; zmiana sesji; odpowiedź
//             scal albo nadpisz.
//   Z4        ta sama sesja, magazyn odrzuca zapis wersji błędem z kodem SESSION_CHANGED — „Zapis przerwany”.
//   O1        restoreSnapshotAsNew i promoteExternalToBase: zalogowanie B po odczycie rekordu karty, po odczycie listy
//             wersji, po ostatnim odszyfrowaniu w odczycie karty (przed wewnętrznym zapisem) i po zapisie wersji
//             w wewnętrznym zapisie (R4; wersja zostaje w A — ograniczenie 2, więc bez sprawdzenia „A bez zmian”).
//   O2–O4     „Scal pacjentów” czeka na blokadę pierwszej karty (zalogowanie B, ponowne zalogowanie A, sama blokada),
//             na blokadę drugiej karty, limit czekania mija po zmianie sesji.
//   O5        „Scal pacjentów”: zalogowanie B po każdym kroku magazynu (S1–S18: odczyt kart, przeniesienie wersji,
//             poprawka kolejności, wewnętrzny zapis, licznik wersji, notatki, listy) oraz wewnątrz przeniesienia
//             pierwszej notatki (S13a–S13f: nagrobki kart, odczyt, odszyfrowanie, zaszyfrowanie i zapis notatki,
//             odczyt jej nagrobka), zmiany pierwszej listy (S16a–S16d: odczyt, odszyfrowanie, zaszyfrowanie i zapis
//             listy) i usunięcia karty źródłowej (S19a–S19f: usunięcie rekordu karty, odczyty metadanych konta przy
//             zdjęciu cienia karty, odczyt nagrobków notatek, odczyt notatek, zapis nagrobka karty) — bez dalszych
//             kroków, bez powiadomień, w punktach wewnątrz notatki, listy i usunięcia także bez dalszych operacji
//             crypto.subtle.
//   O5-war    S19a i S19b: sama blokada sejfu i ponowne zalogowanie A — bez wywołań magazynu (także bez konta).
//   O6        „Scal pacjentów” czeka na blokadę notatki (inna karta przeglądarki); zalogowanie B — bez wywołań magazynu.
//   O7        „Scal pacjentów”, notatka z nagrobkiem z polem karty docelowej (stan ułożony wprost w magazynie):
//             zalogowanie B po odczycie karty docelowej w kroku nagrobka notatki — bez zapisu nagrobka w B.
//   O8        „Scal pacjentów”, kroki na jednej notatce w usunięciu karty źródłowej (S20a–S20f: notatki dopisane do
//             karty źródłowej w trakcie scalania — czekanie na blokadę notatki, odczyty, usunięcie notatki, odczyt
//             i zapis nagrobka, po pierwszej z dwóch; S21a–S21d: stare nagrobki notatek z polem karty źródłowej —
//             czekanie na blokadę, odczyt notatki, odczyt i odnowienie nagrobka, po pierwszym z dwóch): zalogowanie B —
//             bez wywołań magazynu, bez powiadomień, bez nagrobków notatek w B.
//   O8-war    S19c–S19f, S20a–S20g i S21a–S21e: sama blokada sejfu i ponowne zalogowanie A — bez wywołań magazynu (także
//             bez konta) i bez powiadomień (przegląd 4).
//   O5 S19d-jednorazowo  nowa sesja w trybie „Zaloguj jednorazowo” (zalogowanie B, potem tryb jednorazowy), załadowany
//             vilda_sync.js: przełączenie po zapisie nagrobka karty źródłowej — bez VildaSync.syncPush i bez żądań do
//             chmury po zmianie sesji (przegląd 4).
//   K1–K9     kontrole w jednej sesji: nowa i istniejąca karta, Z1, Z1-limit, Z2 i Z3 bez zmiany sesji, „Scal
//             pacjentów” (mergePatients), restoreSnapshotAsNew, importLegacyJsonPatient.
//   L1        sejf zablokowany na wejściu — „Zaloguj się, by zapisać pacjenta.”, bez SESSION_CHANGED i bez wywołań
//             magazynu.
//   K-O1, K-O2, K-O5, K-O7, K-O8  kontrole operacji złożonych w jednej sesji: te same haki bez przełączenia, czekanie
//             na blokadę karty i notatki, limit czekania — wyniki jak dotąd (K-O7: nagrobki przeniesionych notatek
//             zdjęte; K-O8: nagrobki notatek z polem karty źródłowej, powiadomienia w A).
//   K-O7b     kontrola: nagrobek notatki z polem karty docelowej w stanie CZEKA — zostaje z chwilą zapisu notatki,
//             rev = max, pole bez zmian.
//   K-O5 S19d-jednorazowo  kontrola: tryb jednorazowy włączony po zapisie nagrobka karty źródłowej bez zmiany sesji —
//             wynik jak dotąd, VildaSync.syncPush w A.
//   K-O3      kontrola: błąd odczytu rekordu karty w tej samej sesji (restoreSnapshotAsNew, promoteExternalToBase,
//             mergePatients) — ten błąd, nie SESSION_CHANGED.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b; O8-war i S19d-jednorazowo — na c209fa6b): Z1,
// Z1-war, Z1-limit, Z2, Z3, Z4, O1–O8 (każdy wariant, z O5-war i O8-war), O5 S19d-jednorazowo. Na kodzie rundy 2
// przeglądu czerwone są O5 S19a–S19f, O5-war i O8. O8-war i S19d-jednorazowo (testy luk z przeglądu 4) są zielone na
// kodzie rundy 3, a czerwone na mutantach sprawdzeń sesji przed powiadomieniami w usunięciu karty źródłowej.
// Zielone na audycie sprzed zmiany: K1–K9, L1, K-O1, K-O2, K-O3, K-O5 (z S19d-jednorazowo), K-O7, K-O7b, K-O8.
import { afterEach, describe, expect, it } from 'vitest';
import { atrapaChmury, naglowek, sprzatnij, urzadzenie, wynik, zaladujSync } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const blokadaKarty = (patientId) => `vilda-save-pat:${patientId}`;
const zapisaneKarty = (zdarzenia) => zdarzenia.filter((e) => e.typ === 'patientSaved').map((e) => [e.sesja, e.dane && e.dane.patientId]);
const kopia = (x) => JSON.parse(JSON.stringify(x));

// Odrzucenie zapisu po zmianie sesji: kod i komunikat zapisu (nie scalania).
function przerwany(r) {
  expect(r.ok, 'zapis po zmianie sesji nie kończy się powodzeniem').toBe(false);
  expect(r.kod, `zapis kończy się w sesji, w której ruszył (komunikat: ${r.komunikat})`).toBe('SESSION_CHANGED');
  expect(r.komunikat).toMatch(/Zapis przerwany/);
  expect(r.komunikat).not.toMatch(/scalan/i);
}

// Po zmianie sesji (znacznik z) — brak zapisów, odczytów, szyfrowania, żądań blokady, pytań i powiadomień.
async function nicPoZmianie(d, z) {
  await kolejnaTura();
  const po = d.po(z);
  expect(po.wywKto, 'po zmianie sesji żadnego wywołania magazynu').toEqual([]);
  expect(po.bezKonta, 'po zmianie sesji żadnego wywołania magazynu bez konta').toEqual([]);
  expect(po.krypto, 'po zmianie sesji żadnej operacji crypto.subtle').toEqual([]);
  expect(po.locks, 'po zmianie sesji żadnego żądania blokady').toEqual([]);
  expect(po.pytania, 'po zmianie sesji żadnego pytania okna').toEqual([]);
  expect(po.zdarzenia.map((e) => e.typ), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
  expect(d.zapisySesyjne(z), 'po zmianie sesji żadnego utrwalenia części sesyjnej').toBe(0);
  expect(d.po(z).dziennik.map((x) => `${x.magazyn} ${x.op} ${x.klucz}`), 'po zmianie sesji żadnego zapisu localStorage i sessionStorage').toEqual([]);
}

// Zapis istniejącej karty, który czeka w kolejce na blokadę karty trzymaną przez „inną kartę przeglądarki”.
async function zapisCzekaNaBlokade(d, p, opcje = {}) {
  const nazwa = blokadaKarty(p.patientId);
  const inna = await d.locks.trzymaj(nazwa);
  let czekal = 0;
  const zapis = wynik(d.v.savePatient(naglowek(1, { wzrost: 133 }), {
    patientId: p.patientId, dedup: false, onLockWait() { czekal += 1; }, ...opcje,
  }));
  await d.locks.czekajNaKolejke(nazwa);
  return { nazwa, inna, zapis, czekal: () => czekal };
}

// Dwie karty „Testowy Jan7” bez daty urodzenia; zapis bez daty pyta „Który to pacjent?”.
async function dwajImiennicy(d) {
  const p1 = await d.v.savePatient(naglowek(7, { dob: null }), { dedup: false });
  const p2 = await d.v.savePatient(naglowek(7, { dob: null, wzrost: 121 }), { dedup: false });
  const okno = d.oknoTozsamosci();
  const zapis = wynik(d.v.savePatient(naglowek(7, { dob: null, wzrost: 140 }), {}));
  const pytanie = await okno.czekaj();
  return { p1, p2, okno, zapis, pytanie };
}
const odpowiedzTozsamosci = (akcja, p1) => (akcja === 'dopisz' ? { akcja, patientId: p1.patientId } : { akcja });

// Karta z jednym pomiarem (wersja bazowa formularza); „inne urządzenie” dopisuje drugi; formularz zapisuje swoją wersję
// z baselinePayload = wersja bazowa — okno konfliktu pyta pod blokadą karty.
async function konfliktPodBlokada(d) {
  const bazowy = naglowek(8, { pomiary: [[100, 118]] });
  const p = await d.v.savePatient(kopia(bazowy), { dedup: false });
  await d.v.savePatient(naglowek(8, { pomiary: [[100, 118], [110, 122]] }), { patientId: p.patientId, dedup: false });
  const okno = d.oknoKonfliktu();
  const zapis = wynik(d.v.savePatient(naglowek(8, { wzrost: 125, pomiary: [[100, 118]] }), {
    patientId: p.patientId, dedup: false, baselinePayload: bazowy,
  }));
  const pytanie = await okno.czekaj();
  return { p, nazwa: blokadaKarty(p.patientId), okno, zapis, pytanie };
}

describe('P-SESJA-ZAPISU: zapis karty kończy się w sesji, w której ruszył', () => {
  it('Z1: zapis czekający na blokadę karty — po blokadzie sejfu i zalogowaniu B kończy się SESSION_CHANGED, bez zapisów i powiadomień', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    const przedA = await d.kartaTrwala('A', p.patientId);
    const przedB = await d.trwaly('B');
    const c = await zapisCzekaNaBlokade(d, p);
    expect(c.czekal(), 'zapis czeka na blokadę karty').toBe(1);

    const z = await d.przelacz('B');
    await c.inna.zwolnij();
    const r = await c.zapis;

    przerwany(r);
    expect(d.locks.zajeta(c.nazwa), 'blokada karty wolna po odrzuceniu').toBe(false);
    await nicPoZmianie(d, z);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'konto B bez kart').toEqual([]);
    expect(await d.trwaly('B')).toEqual(przedB);
    expect(await d.kartaTrwala('A', p.patientId), 'karta A bez nowej wersji').toEqual(przedA);
  });

  it.each([
    ['A', false], ['blokada', false],
    ['A', true], ['blokada', true], ['B', true],
  ])('Z1-war: zapis czekający na blokadę karty — przełączenie %s (tryb chmurowy: %s) kończy go SESSION_CHANGED, bez wywołań magazynu', async (wariant, chmura) => {
    const d = await urzadzenie({ chmura });
    expect(d.v.isCloudOnlyMode()).toBe(chmura);
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    const przedA = await d.kartaTrwala('A', p.patientId);
    const przedB = await d.trwaly('B');
    const c = await zapisCzekaNaBlokade(d, p);
    expect(c.czekal()).toBe(1);

    const z = await d.przelacz(wariant);
    await c.inna.zwolnij();
    const r = await c.zapis;

    przerwany(r);
    expect(d.locks.zajeta(c.nazwa), 'blokada karty wolna po odrzuceniu').toBe(false);
    await nicPoZmianie(d, z);
    expect(await d.trwaly('B'), 'magazyn trwały konta B bez zmian').toEqual(przedB);
    expect(await d.kartaTrwala('A', p.patientId), 'magazyn trwały konta A bez nowej wersji karty').toEqual(przedA);
  });

  it('Z1-limit: limit czekania na blokadę karty mija po zmianie sesji — SESSION_CHANGED zamiast „zajęta w innej karcie”', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(2), { dedup: false });
    const przedA = await d.kartaTrwala('A', p.patientId);
    const nazwa = blokadaKarty(p.patientId);
    await d.locks.trzymaj(nazwa); // inna karta trzyma blokadę do końca testu
    const zapis = wynik(d.v.savePatient(naglowek(2, { wzrost: 133 }), {
      patientId: p.patientId, dedup: false, lockTimeoutMs: 150, onLockWait() {},
    }));
    await d.locks.czekajNaKolejke(nazwa);
    const limit = await d.timery.czekajNa((t) => t.ms === 150);

    // Od zlecenia limitu do blokady sejfu (pierwszy krok przełączenia) — same mikrozadania, limit odpala test.
    const z = await d.przelacz('B');
    d.timery.odpal((t) => t.id === limit.id);
    const r = await zapis;

    przerwany(r);
    expect(r.e.vildaSaveBusy, 'odrzucenie ze zmiany sesji, nie z zajętej blokady').toBeFalsy();
    expect(d.locks.czekajacych(nazwa), 'żądanie blokady wycofane').toBe(0);
    await nicPoZmianie(d, z);
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.kartaTrwala('A', p.patientId)).toEqual(przedA);
  });

  it.each(['dopisz', 'nowy', 'anuluj'])('Z2: okno „Który to pacjent?” — odpowiedź „%s” po zalogowaniu B kończy zapis SESSION_CHANGED, bez blokady karty i zapisów', async (akcja) => {
    const d = await urzadzenie();
    const o = await dwajImiennicy(d);
    expect(o.pytanie.sesja, 'pytanie zadane w sesji A').toBe('A');
    expect(o.pytanie.info.candidates.map((k) => k.patientId).sort()).toEqual([o.p1.patientId, o.p2.patientId].sort());
    const przedA = await d.trwaly('A');

    const z = await d.przelacz('B');
    o.okno.odpowiedz(odpowiedzTozsamosci(akcja, o.p1));
    const r = await o.zapis;

    przerwany(r);
    expect(r.e.vildaSaveAborted, 'odrzucenie ze zmiany sesji, nie z anulowania').toBeFalsy();
    await nicPoZmianie(d, z);
    expect(d.po(z).locks.filter((n) => n.startsWith('vilda-save-pat:')), 'po zmianie sesji żadnego żądania blokady karty').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez kart').toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.trwaly('A'), 'konto A bez nowej karty i wersji').toEqual(przedA);
  });

  it.each(['scal', 'nadpisz'])('Z3: okno konfliktu pod blokadą karty — odpowiedź „%s” po zalogowaniu B kończy zapis SESSION_CHANGED, blokada karty wolna od razu', async (odp) => {
    const d = await urzadzenie();
    const k = await konfliktPodBlokada(d);
    expect(k.pytanie.sesja).toBe('A');
    expect(d.locks.zajeta(k.nazwa), 'okno konfliktu czeka pod blokadą karty').toBe(true);
    const przedA = await d.kartaTrwala('A', k.p.patientId);

    const z = await d.przelacz('B');
    k.okno.odpowiedz(odp);
    const r = await k.zapis;
    const wolnaPoOdrzuceniu = !d.locks.zajeta(k.nazwa);

    przerwany(r);
    expect(wolnaPoOdrzuceniu, 'blokada karty wolna zaraz po odrzuceniu').toBe(true);
    await nicPoZmianie(d, z);
    expect(d.po(z).krypto.filter((m) => m === 'encrypt'), 'po zmianie sesji żadnego szyfrowania').toEqual([]);
    expect(await d.trwaly('B'), 'konto B: 0 kart i 0 wersji').toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.kartaTrwala('B', k.p.patientId)).toEqual({ jest: false, wersje: 0 });
    expect(await d.v.getPatient(k.p.patientId), 'karta nieczytelna w sesji B').toBeNull();
    expect(await d.kartaTrwala('A', k.p.patientId), 'karta A bez nowej wersji').toEqual(przedA);
  });

  it('Z4: magazyn kończy zapis błędem z kodem SESSION_CHANGED w tej samej sesji — wynik SESSION_CHANGED „Zapis przerwany”', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    const przedA = await d.kartaTrwala('A', p.patientId);
    d.magazyn.blad({ metoda: 'putSnapshotForUser', konto: 'A' }, { komunikat: 'atrapa: magazyn odrzucił zapis wersji', kod: 'SESSION_CHANGED' });
    const r = await wynik(d.v.savePatient(naglowek(1, { wzrost: 131 }), { patientId: p.patientId, dedup: false }));

    przerwany(r);
    expect(r.komunikat, 'komunikat zapisu, nie magazynu').not.toMatch(/atrapa/);
    expect(d.sesja(), 'ta sama sesja').toBe('A');
    expect(d.locks.zajeta(blokadaKarty(p.patientId)), 'blokada karty wolna').toBe(false);
    expect(await d.kartaTrwala('A', p.patientId), 'karta A bez nowej wersji').toEqual(przedA);
  });
});

describe('P-SESJA-ZAPISU: kontrole w jednej sesji — wyniki zapisu bez zmian', () => {
  it('K1: zapis nowej karty — isNew, jedna wersja, jedno powiadomienie w A, blokada karty wolna', async () => {
    const d = await urzadzenie();
    const z = d.znacznik();
    const r = await wynik(d.v.savePatient(naglowek(1), { dedup: false }));
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ isNew: true, snapshotCount: 1 });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', r.w.patientId]]);
    expect(d.locks.zadania.slice(z.locks).some((x) => x.nazwa === blokadaKarty(r.w.patientId)), 'zapis pod blokadą karty').toBe(true);
    expect(d.locks.zajeta(blokadaKarty(r.w.patientId))).toBe(false);
    expect(await d.kartaTrwala('A', r.w.patientId)).toEqual({ jest: true, wersje: 1 });
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0 });
  });

  it('K2: zapis istniejącej karty — druga wersja, jedno powiadomienie w A, blokada karty wolna', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    const z = d.znacznik();
    const r = await wynik(d.v.savePatient(naglowek(1, { wzrost: 131 }), { patientId: p.patientId, dedup: false }));
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ isNew: false, patientId: p.patientId, snapshotCount: 2 });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', p.patientId]]);
    expect(d.locks.zajeta(blokadaKarty(p.patientId))).toBe(false);
    expect(await d.kartaTrwala('A', p.patientId)).toEqual({ jest: true, wersje: 2 });
  });

  it('K3: zapis czekający na blokadę karty bez zmiany sesji — po zwolnieniu zapisuje się w A', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(1), { dedup: false });
    const z = d.znacznik();
    const c = await zapisCzekaNaBlokade(d, p);
    await c.inna.zwolnij();
    const r = await c.zapis;
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ isNew: false, patientId: p.patientId, snapshotCount: 2 });
    expect(c.czekal()).toBe(1);
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', p.patientId]]);
    expect(d.locks.zajeta(c.nazwa)).toBe(false);
    expect(await d.kartaTrwala('A', p.patientId)).toEqual({ jest: true, wersje: 2 });
  });

  it('K4: limit czekania na blokadę karty bez zmiany sesji — „zajęta w innej karcie” (vildaSaveBusy), bez SESSION_CHANGED', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(2), { dedup: false });
    const nazwa = blokadaKarty(p.patientId);
    await d.locks.trzymaj(nazwa);
    const zapis = wynik(d.v.savePatient(naglowek(2, { wzrost: 133 }), {
      patientId: p.patientId, dedup: false, lockTimeoutMs: 150, onLockWait() {},
    }));
    await d.locks.czekajNaKolejke(nazwa);
    const limit = await d.timery.czekajNa((t) => t.ms === 150);
    d.timery.odpal((t) => t.id === limit.id);
    const r = await zapis;
    expect(r.ok).toBe(false);
    expect(r.e.vildaSaveBusy).toBe(true);
    expect(r.kod).not.toBe('SESSION_CHANGED');
    expect(r.komunikat).toMatch(/nadal zapisywany w innej karcie/);
    expect(await d.kartaTrwala('A', p.patientId)).toEqual({ jest: true, wersje: 1 });
  });

  it.each([
    ['dopisz', { ok: true, isNew: false, karty: 2, wersje: 3 }],
    ['nowy', { ok: true, isNew: true, karty: 3, wersje: 3 }],
    ['anuluj', { ok: false, karty: 2, wersje: 2 }],
  ])('K5: okno „Który to pacjent?” z odpowiedzią „%s” w tej samej sesji — wynik jak dotąd', async (akcja, oczek) => {
    const d = await urzadzenie();
    const o = await dwajImiennicy(d);
    const z = d.znacznik();
    o.okno.odpowiedz(odpowiedzTozsamosci(akcja, o.p1));
    const r = await o.zapis;
    expect(r.ok, r.komunikat).toBe(oczek.ok);
    if (oczek.ok) {
      expect(r.w.isNew).toBe(oczek.isNew);
      if (akcja === 'dopisz') expect(r.w.patientId).toBe(o.p1.patientId);
      else expect([o.p1.patientId, o.p2.patientId]).not.toContain(r.w.patientId);
      expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', r.w.patientId]]);
      expect(d.locks.zajeta(blokadaKarty(r.w.patientId))).toBe(false);
    } else {
      expect(r.e.vildaSaveAborted).toBe(true);
      expect(r.kod).not.toBe('SESSION_CHANGED');
      expect(r.komunikat).toMatch(/Zapis anulowany/);
      expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([]);
    }
    expect(await d.trwaly('A')).toMatchObject({ karty: oczek.karty, wersje: oczek.wersje });
  });

  it.each([
    ['scal', 1, 1],
    ['nadpisz', 0, 0],
  ])('K6: okno konfliktu z odpowiedzią „%s” w tej samej sesji — wynik jak dotąd, blokada karty wolna', async (odp, scalono, przyjete) => {
    const d = await urzadzenie();
    const k = await konfliktPodBlokada(d);
    expect(d.locks.zajeta(k.nazwa)).toBe(true);
    const z = d.znacznik();
    k.okno.odpowiedz(odp);
    const r = await k.zapis;
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ isNew: false, patientId: k.p.patientId, snapshotCount: 3, scalonoZBazy: scalono });
    expect(r.w.przyjeteZBazy).toHaveLength(przyjete);
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', k.p.patientId]]);
    expect(d.locks.zajeta(k.nazwa)).toBe(false);
    expect(await d.kartaTrwala('A', k.p.patientId)).toEqual({ jest: true, wersje: 3 });
  });

  it('K7: „Scal pacjentów” (mergePatients) — karta docelowa z wersjami obu kart, jedno powiadomienie zapisu w A', async () => {
    const d = await urzadzenie();
    const x = await d.v.savePatient(naglowek(3, { pomiary: [[60, 110]] }), { dedup: false });
    await d.v.savePatient(naglowek(3, { pomiary: [[60, 110], [66, 113]] }), { patientId: x.patientId, dedup: false });
    const y = await d.v.savePatient(naglowek(4, { pomiary: [[48, 102]] }), { dedup: false });
    const z = d.znacznik();
    const r = await wynik(d.v.mergePatients(x.patientId, y.patientId));
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.targetPatientId).toBe(y.patientId);
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', y.patientId]]);
    expect(d.locks.zajeta(blokadaKarty(x.patientId))).toBe(false);
    expect(d.locks.zajeta(blokadaKarty(y.patientId))).toBe(false);
    expect(await d.kartaTrwala('A', x.patientId)).toEqual({ jest: false, wersje: 0 });
    expect(await d.kartaTrwala('A', y.patientId)).toEqual({ jest: true, wersje: 4 });
  });

  it('K8: restoreSnapshotAsNew — nowa wersja z treścią starszej, jedno powiadomienie w A', async () => {
    const d = await urzadzenie();
    const p = await d.v.savePatient(naglowek(5), { dedup: false });
    await d.v.savePatient(naglowek(5, { wzrost: 131 }), { patientId: p.patientId, dedup: false });
    const z = d.znacznik();
    const r = await wynik(d.v.restoreSnapshotAsNew(p.patientId, p.snapshotId));
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ patientId: p.patientId, restoredFromSnapshotId: p.snapshotId, snapshotCount: 3 });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', p.patientId]]);
    expect(d.locks.zajeta(blokadaKarty(p.patientId))).toBe(false);
    const glowa = (await d.v.getPatient(p.patientId)).snapshots[0];
    expect(glowa.snapshotId).toBe(r.w.newSnapshotId);
    expect(glowa.payload.user.height).toBe(120);
  });

  it('K9: importLegacyJsonPatient — nowa karta z jedną wersją, jedno powiadomienie w A', async () => {
    const d = await urzadzenie();
    const z = d.znacznik();
    const r = await wynik(d.v.importLegacyJsonPatient(naglowek(6)));
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ isNew: true, addedSnapshots: 1, snapshotCount: 1, headerName: 'Testowy Jan6' });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', r.w.patientId]]);
    expect(d.locks.zajeta(blokadaKarty(r.w.patientId))).toBe(false);
    expect(await d.kartaTrwala('A', r.w.patientId)).toEqual({ jest: true, wersje: 1 });
  });
});

describe('P-SESJA-ZAPISU: sejf zablokowany na wejściu', () => {
  it('L1: zapis przy zablokowanym sejfie — odmowa „Zaloguj się, by zapisać pacjenta.”, bez SESSION_CHANGED i bez wywołań magazynu', async () => {
    const d = await urzadzenie();
    d.v.lock('manual');
    const z = d.znacznik();
    const r = await wynik(d.v.savePatient(naglowek(1), {}));
    expect(r.ok).toBe(false);
    expect(r.komunikat).toBe('Zaloguj się, by zapisać pacjenta.');
    expect(r.kod, 'bez kodu zmiany sesji, gdy sesji nie było').toBeNull();
    await kolejnaTura();
    expect(d.wywPelne.slice(z.wyw), 'bez wywołań magazynu').toEqual([]);
    expect(d.zdarzenia.slice(z.zdarzenia)).toEqual([]);
    expect(d.locks.zadania.slice(z.locks)).toEqual([]);
  });
});

// ── Operacje złożone: restoreSnapshotAsNew, promoteExternalToBase, „Scal pacjentów” ──────────────────────────────────
// Sesja z chwili wejścia do operacji (nie do jej wewnętrznego zapisu). Po zmianie sesji: żadnego wywołania magazynu,
// żądania blokady, szyfrowania, pytania okna ani powiadomienia; odszyfrowanie, które już trwało w odczycie karty, nie
// jest liczone (wspólny pomocnik odczytu). `bezKrypto` — żadnej operacji crypto.subtle (punkty wewnątrz przeniesienia
// notatki i zmiany listy).
async function nicPoZmianieOperacji(d, z, { bezKrypto = false } = {}) {
  await kolejnaTura();
  const po = d.po(z);
  expect(po.wywKto, 'po zmianie sesji żadnego wywołania magazynu').toEqual([]);
  expect(po.bezKonta, 'po zmianie sesji żadnego wywołania magazynu bez konta').toEqual([]);
  expect(po.locks, 'po zmianie sesji żadnego żądania blokady').toEqual([]);
  expect(po.krypto.filter((m) => m === 'encrypt'), 'po zmianie sesji żadnego szyfrowania').toEqual([]);
  if (bezKrypto) expect(po.krypto, 'po zmianie sesji żadnej operacji crypto.subtle').toEqual([]);
  expect(po.pytania, 'po zmianie sesji żadnego pytania okna').toEqual([]);
  expect(po.zdarzenia.map((e) => `${e.typ}(${e.sesja})`), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
  expect(d.zapisySesyjne(z), 'po zmianie sesji żadnego utrwalenia części sesyjnej').toBe(0);
}

// Karta „Testowy Jan5” z dwiema wersjami; „Przywróć tę wersję” dla starszej.
async function przywrocenie(d) {
  const p = await d.v.savePatient(naglowek(5), { dedup: false });
  await d.v.savePatient(naglowek(5, { wzrost: 131 }), { patientId: p.patientId, dedup: false });
  return { pid: p.patientId, uruchom: () => d.v.restoreSnapshotAsNew(p.patientId, p.snapshotId) };
}
// Osoba spoza bazy „Testowy Jan9” (jedna wersja); „Dodaj do bazy” z datą urodzenia.
async function dodanieDoBazy(d) {
  const zew = await d.v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan9', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' });
  return { pid: zew.patientId, uruchom: () => d.v.promoteExternalToBase(zew.patientId, { dobISO: '2016-03-12', height: '121' }) };
}
const OPERACJE_KARTY = {
  restoreSnapshotAsNew: { przygotuj: przywrocenie, odszyfrowania: 3, stos: /as restoreSnapshotAsNew/ },
  promoteExternalToBase: { przygotuj: dodanieDoBazy, odszyfrowania: 2, stos: /as promoteExternalToBase/ },
};
// Punkty przełączenia w odczycie karty przed wewnętrznym zapisem i (R4) w samym wewnętrznym zapisie. `sierotaWA`:
// wersja zapisana przed przełączeniem zostaje w A (ograniczenie 2) — bez sprawdzenia „A bez zmian”.
const PUNKTY_ODCZYTU = [
  { id: 'R1', opis: 'po odczycie rekordu karty (nagłówek odszyfrowywany już w nowej sesji)', rodzaj: 'magazyn', dop: () => ({ metoda: 'getPatientForUser', konto: 'A' }) },
  { id: 'R2', opis: 'po odczycie listy wersji karty', rodzaj: 'magazyn', dop: () => ({ metoda: 'listSnapshotsForUser', konto: 'A' }) },
  { id: 'R3', opis: 'po ostatnim odszyfrowaniu w odczycie karty (przed wewnętrznym zapisem)', rodzaj: 'krypto', dop: (o) => ({ metoda: 'decrypt', wStosie: o.stos, ktory: o.odszyfrowania }) },
  { id: 'R4', opis: 'po zapisie wersji w wewnętrznym zapisie karty', rodzaj: 'magazyn', dop: () => ({ metoda: 'putSnapshotForUser', konto: 'A', wStosie: /Bpz_sekcja/ }), sierotaWA: true },
];
const przypadkiOdczytu = Object.keys(OPERACJE_KARTY).flatMap((op) => PUNKTY_ODCZYTU.map((p) => [op, p.id, p.opis, p]));

// „Scal pacjentów”: karta źródłowa „Testowy Jan3” (dwie wersje, dwie notatki, na dwóch listach) do karty „Testowy Jan4”.
async function scalenie(d) {
  const x = await d.v.savePatient(naglowek(3, { pomiary: [[60, 110]] }), { dedup: false });
  await d.v.savePatient(naglowek(3, { pomiary: [[60, 110], [66, 113]] }), { patientId: x.patientId, dedup: false });
  const y = await d.v.savePatient(naglowek(4, { pomiary: [[48, 102]] }), { dedup: false });
  const notatki = [];
  for (const i of [1, 2]) {
    notatki.push((await d.v.savePatientNote({ patientId: x.patientId, title: `Notatka ${i} (fikcyjna)`, body: `Treść fikcyjna ${i}`, category: 'wynik-badania' })).id);
  }
  await d.v.savePatientList({ name: 'Lista testowa 1', memberIds: [x.patientId] });
  await d.v.savePatientList({ name: 'Lista testowa 2', memberIds: [x.patientId, y.patientId] });
  return { x: x.patientId, y: y.patientId, notatki, uruchom: (op) => d.v.mergePatients(x.patientId, y.patientId, op) };
}
const blokadaNotatki = (id) => `vilda-note-${id}`;
// Nagrobki notatek karty źródłowej z polem karty docelowej (stan ułożony wprost w magazynie A): zapis notatki
// w scalaniu idzie gałęzią nagrobka z polem (Bnp_poZapisie czyta wtedy kartę docelową).
async function nagrobkiZPolem(d, s) {
  for (const id of s.notatki) {
    await d.baza.putPatientNoteTombstoneForUser(d.A.userId, {
      id, deletedAtISO: '2020-01-02T00:00:00.000Z', rev: 0, deletedWithPatient: { patientId: s.y, deletedAtISO: '2020-01-01T00:00:00.000Z' },
    });
  }
}
// Wywołania magazynu wprost w kroku scalania pod blokadami kart (bez odczytu karty i wewnętrznego zapisu). Miejsce
// hak rozpoznaje po nazwach funkcji sejfu w stosie wywołań (Bsc_podBlokada, Bpz_zapis, Bpz_sekcja, ct, Rn — odczyt list)
// i po kolejności operacji. Wewnątrz przeniesienia notatki (Ad, zapis notatki; Bnp_poZapisie, jej nagrobek) i zmiany
// listy (on) — pierwsza notatka i pierwsza lista.
const W_KROKU = { konto: 'A', wStosie: /Bsc_podBlokada/, bezStosu: /Bpz_zapis|at (async )?ct \(/ };
const W_NOTATCE = /\bat (async )?Ad \(/;
const W_LISCIE = /\bat (async )?on \(/;
const W_USUNIECIU = /\bat (async )?Bpu_usun \(/;
const PUNKTY_SCALANIA = [
  { id: 'S1', opis: 'po odczycie rekordu karty źródłowej (nagłówek odszyfrowywany już w nowej sesji)', dop: { metoda: 'getPatientForUser', konto: 'A', wStosie: /Bsc_podBlokada/ } },
  { id: 'S2', opis: 'po odczycie listy wersji karty źródłowej (odczyt kart)', dop: { metoda: 'listSnapshotsForUser', konto: 'A', wStosie: /Bsc_podBlokada/ } },
  { id: 'S3', opis: 'po odczycie listy wersji karty docelowej (odczyt kart)', dop: { metoda: 'listSnapshotsForUser', konto: 'A', wStosie: /Bsc_podBlokada/, ktory: 2 } },
  { id: 'S4', opis: 'po odczycie wersji karty źródłowej do przeniesienia', dop: { ...W_KROKU, metoda: 'listSnapshotsForUser' } },
  { id: 'S5', opis: 'po przeniesieniu pierwszej wersji', dop: { ...W_KROKU, metoda: 'putSnapshotForUser' } },
  { id: 'S6', opis: 'po przeniesieniu ostatniej wersji', dop: { ...W_KROKU, metoda: 'putSnapshotForUser', ktory: 2 } },
  { id: 'S7', opis: 'po odczycie wersji karty docelowej przed poprawką kolejności', dop: { ...W_KROKU, metoda: 'listSnapshotsForUser', ktory: 2 } },
  { id: 'S8', opis: 'po poprawce kolejności wersji (przed wewnętrznym zapisem)', dop: { ...W_KROKU, metoda: 'putSnapshotForUser', ktory: 3 } },
  { id: 'S9', opis: 'po zapisie wersji w wewnętrznym zapisie karty docelowej', dop: { metoda: 'putSnapshotForUser', konto: 'A', wStosie: /Bpz_sekcja/ } },
  { id: 'S10', opis: 'po odczycie wersji po wewnętrznym zapisie', dop: { ...W_KROKU, metoda: 'listSnapshotsForUser', ktory: 3 } },
  { id: 'S11', opis: 'po odczycie rekordu karty docelowej po wewnętrznym zapisie', dop: { ...W_KROKU, metoda: 'getPatientForUser' } },
  { id: 'S12', opis: 'po poprawce licznika wersji karty docelowej', dop: { ...W_KROKU, metoda: 'putPatientForUser' } },
  { id: 'S13', opis: 'po odczycie notatek karty źródłowej', dop: { ...W_KROKU, metoda: 'listPatientNotesForUser' } },
  { id: 'S13a', opis: 'w przeniesieniu pierwszej notatki: po odczycie nagrobków kart', dop: { metoda: 'listTombstonesForUser', konto: 'A', wStosie: W_NOTATCE }, bezKrypto: true },
  { id: 'S13b', opis: 'w przeniesieniu pierwszej notatki: po odczycie notatki (przed odszyfrowaniem)', dop: { metoda: 'getPatientNoteForUser', konto: 'A', wStosie: W_NOTATCE }, bezKrypto: true },
  { id: 'S13c', opis: 'w przeniesieniu pierwszej notatki: po odszyfrowaniu notatki', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: W_NOTATCE }, bezKrypto: true },
  { id: 'S13d', opis: 'w przeniesieniu pierwszej notatki: po zaszyfrowaniu notatki (przed zapisem)', rodzaj: 'krypto', dop: { metoda: 'encrypt', wStosie: W_NOTATCE }, bezKrypto: true },
  { id: 'S13e', opis: 'w przeniesieniu pierwszej notatki: po zapisie notatki (przed jej nagrobkiem)', dop: { metoda: 'putPatientNoteForUser', konto: 'A' }, bezKrypto: true },
  { id: 'S13f', opis: 'w przeniesieniu pierwszej notatki: po odczycie nagrobka notatki (przed jego zdjęciem)', dop: { metoda: /^(getPatientNoteTombstoneForUser|listPatientNoteTombstonesForUser)$/, konto: 'A', wStosie: /Bnp_poZapisie/ }, bezKrypto: true },
  { id: 'S14', opis: 'po przeniesieniu pierwszej notatki (przed powiadomieniem)', dop: { metoda: 'removePatientNoteTombstoneForUser', konto: 'A' } },
  { id: 'S15', opis: 'po przeniesieniu ostatniej notatki', dop: { metoda: 'removePatientNoteTombstoneForUser', konto: 'A', ktory: 2 } },
  { id: 'S16', opis: 'po odczycie list pacjentów (ostatnia lista odszyfrowana)', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: /\bat Rn \(/, ktory: 2 } },
  { id: 'S16a', opis: 'w zmianie pierwszej listy: po odczycie listy (przed odszyfrowaniem)', dop: { metoda: 'getPatientListForUser', konto: 'A', wStosie: W_LISCIE }, bezKrypto: true },
  { id: 'S16b', opis: 'w zmianie pierwszej listy: po odszyfrowaniu listy', rodzaj: 'krypto', dop: { metoda: 'decrypt', wStosie: W_LISCIE }, bezKrypto: true },
  { id: 'S16c', opis: 'w zmianie pierwszej listy: po zaszyfrowaniu listy (przed zapisem)', rodzaj: 'krypto', dop: { metoda: 'encrypt', wStosie: W_LISCIE }, bezKrypto: true },
  { id: 'S16d', opis: 'w zmianie pierwszej listy: po zapisie listy (przed zdjęciem nagrobka listy)', dop: { metoda: 'putPatientListForUser', konto: 'A' }, bezKrypto: true },
  { id: 'S17', opis: 'po zmianie pierwszej listy (przed powiadomieniem)', dop: { ...W_KROKU, metoda: 'removePatientListTombstoneForUser' } },
  { id: 'S18', opis: 'po zmianie ostatniej listy (przed usunięciem karty źródłowej)', dop: { ...W_KROKU, metoda: 'removePatientListTombstoneForUser', ktory: 2 } },
  { id: 'S19a', opis: 'w usunięciu karty źródłowej: po usunięciu jej rekordu (przed zdjęciem cienia, nagrobkami i powiadomieniem)', dop: { metoda: 'removePatientForUser', konto: 'A', wStosie: W_USUNIECIU }, bezKrypto: true },
  { id: 'S19b', opis: 'w usunięciu karty źródłowej: po odczycie notatek (przed odnowieniem nagrobków i nagrobkiem karty)', dop: { metoda: 'listPatientNotesForUser', konto: 'A', wStosie: W_USUNIECIU }, bezKrypto: true },
  { id: 'S19e', opis: 'w usunięciu karty źródłowej: zdjęcie cienia karty — po odczycie wstępnym metadanych konta (przed blokadą metadanych)', dop: { metoda: 'getUserMeta', konto: 'A', wStosie: /\bat (async )?Bkz_zmienListe \(/ }, bezKrypto: true },
  { id: 'S19f', opis: 'w usunięciu karty źródłowej: zdjęcie cienia karty — po odczycie metadanych konta pod blokadą metadanych', dop: { metoda: 'getUserMeta', konto: 'A', ktory: 2 }, bezKrypto: true },
  { id: 'S19c', opis: 'w usunięciu karty źródłowej: po odczycie nagrobków notatek (przed odczytem notatek)', dop: { metoda: 'listPatientNoteTombstonesForUser', konto: 'A', wStosie: /\bat (async )?Bnp_mapaNagrobkow \(/ }, bezKrypto: true },
  { id: 'S19d', opis: 'w usunięciu karty źródłowej: po zapisie jej nagrobka (przed powiadomieniem o usunięciu)', dop: { metoda: 'putTombstoneForUser', konto: 'A', wStosie: W_USUNIECIU }, bezKrypto: true },
];

// Usunięcie karty źródłowej w „Scal pacjentów” z krokami na pojedynczej notatce (rekordy układane wprost w magazynie A):
//   „notatka” — notatki dopisane do karty źródłowej w trakcie scalania (np. zapis w innej karcie przeglądarki po odczycie
//               notatek źródła): pętla notatek usuwania stawia im nagrobki z polem karty źródłowej;
//   „sierota” — stare nagrobki notatek z polem karty źródłowej, których notatek tu nie ma (karta wróciła bez notatek):
//               usunięcie je odnawia;
//   „sierota-wraca” — jak „sierota”, a notatka wraca pod kartę źródłową po odczycie notatek w usuwaniu: odnowienie
//               usuwa ją z nagrobkiem;
//   „notatka-znika” — notatka dopisana z nagrobkiem z polem karty źródłowej (stan „czeka”), usunięta w innej karcie po
//               odczycie notatek w usuwaniu: pętla notatek odnawia jej nagrobek.
const NOTATKI_DOPISANE = ['notatka-dopisana-1', 'notatka-dopisana-2'];
const NAGROBKI_SIEROTY = ['notatka-sierota-1', 'notatka-sierota-2'];
const naNotatce = (ids) => (_m, a) => ids.includes(a[1]) || !!(a[1] && ids.includes(a[1].id));
const PO_ODCZYCIE_NOTATEK_USUWANIA = { metoda: 'listPatientNotesForUser', konto: 'A', wStosie: W_USUNIECIU };
async function rekordNotatki(d, s, id) {
  const wzor = (await d.baza.listPatientNotesForUser(d.A.userId)).find((n) => n.id === s.notatki[0] || n.id === s.notatki[1]);
  await d.baza.putPatientNoteForUser(d.A.userId, { ...wzor, id, patientId: s.x });
}
function dopiszNotatkiPoOdczycie(d, s, ids) {
  return d.magazyn.po({ ...W_KROKU, metoda: 'listPatientNotesForUser' }, async () => {
    for (const id of ids) await rekordNotatki(d, s, id);
  });
}
async function nagrobkiZPolemZrodla(d, s, ids) {
  for (const id of ids) {
    await d.baza.putPatientNoteTombstoneForUser(d.A.userId, {
      id, deletedAtISO: '2020-01-02T00:00:00.000Z', rev: 3, deletedWithPatient: { patientId: s.x, deletedAtISO: '2020-01-01T00:00:00.000Z' },
    });
  }
}
async function przygotujUsuniecie(d, p) {
  const s = await scalenie(d);
  const ids = (p.stan.startsWith('notatka') ? NOTATKI_DOPISANE : NAGROBKI_SIEROTY).slice(0, p.ile || 1);
  if (p.stan.startsWith('notatka')) dopiszNotatkiPoOdczycie(d, s, ids);
  if (p.stan !== 'notatka') await nagrobkiZPolemZrodla(d, s, ids);
  if (p.stan === 'sierota-wraca') d.magazyn.po(PO_ODCZYCIE_NOTATEK_USUWANIA, async () => { for (const id of ids) await rekordNotatki(d, s, id); });
  if (p.stan === 'notatka-znika') d.magazyn.po(PO_ODCZYCIE_NOTATEK_USUWANIA, async () => { for (const id of ids) await d.baza.removePatientNoteForUser(d.A.userId, id); });
  return { ...s, ids };
}
// Punkty w krokach na jednej notatce: czekanie na blokadę notatki (inna karta przeglądarki ją trzyma), odczyty, usunięcie
// notatki, zapis nagrobka; ile: 2 — po pierwszej z dwóch notatek (nagrobków), przed następną.
const PUNKTY_USUNIECIA = [
  { id: 'S20a', stan: 'notatka', opis: 'notatka dopisana do karty źródłowej: czekanie na blokadę notatki', blokadaNotatki: NOTATKI_DOPISANE[0] },
  { id: 'S20b', stan: 'notatka', opis: 'notatka dopisana do karty źródłowej: po odczycie notatki pod jej blokadą', dop: { metoda: 'getPatientNoteForUser', konto: 'A', gdy: naNotatce(NOTATKI_DOPISANE) } },
  { id: 'S20c', stan: 'notatka', opis: 'notatka dopisana do karty źródłowej: po odczycie notatki w jej usuwaniu (przed usunięciem)', dop: { metoda: 'getPatientNoteForUser', konto: 'A', gdy: naNotatce(NOTATKI_DOPISANE), ktory: 2 } },
  { id: 'S20d', stan: 'notatka', opis: 'notatka dopisana do karty źródłowej: po usunięciu notatki (przed nagrobkiem)', dop: { metoda: 'removePatientNoteForUser', konto: 'A', gdy: naNotatce(NOTATKI_DOPISANE) } },
  { id: 'S20e', stan: 'notatka', opis: 'notatka dopisana do karty źródłowej: po odczycie jej nagrobka (przed zapisem nagrobka)', dop: { metoda: /^(getPatientNoteTombstoneForUser|listPatientNoteTombstonesForUser)$/, konto: 'A', wStosie: /Bnp_poleEb/ } },
  { id: 'S20f', stan: 'notatka', ile: 2, opis: 'dwie notatki dopisane: po nagrobku pierwszej (przed powiadomieniem i drugą notatką)', dop: { metoda: 'putPatientNoteTombstoneForUser', konto: 'A', gdy: naNotatce(NOTATKI_DOPISANE) } },
  { id: 'S21a', stan: 'sierota', opis: 'stary nagrobek z polem karty źródłowej: czekanie na blokadę notatki', blokadaNotatki: NAGROBKI_SIEROTY[0] },
  { id: 'S21b', stan: 'sierota', opis: 'stary nagrobek z polem karty źródłowej: po odczycie notatki (nie ma jej tutaj)', dop: { metoda: 'getPatientNoteForUser', konto: 'A', gdy: naNotatce(NAGROBKI_SIEROTY) } },
  { id: 'S21c', stan: 'sierota', opis: 'stary nagrobek z polem karty źródłowej: po odczycie nagrobka (przed odnowieniem)', dop: { metoda: /^(getPatientNoteTombstoneForUser|listPatientNoteTombstonesForUser)$/, konto: 'A', wStosie: /Bnp_odnowJeden/ } },
  { id: 'S21d', stan: 'sierota', ile: 2, opis: 'dwa stare nagrobki: po odnowieniu pierwszego (przed powiadomieniem i drugim nagrobkiem)', dop: { metoda: 'putPatientNoteTombstoneForUser', konto: 'A', gdy: naNotatce(NAGROBKI_SIEROTY) } },
  { id: 'S21e', stan: 'sierota-wraca', opis: 'notatka ze starym nagrobkiem wróciła: po odczycie notatki w jej usuwaniu (przed usunięciem)', dop: { metoda: 'getPatientNoteForUser', konto: 'A', gdy: naNotatce(NAGROBKI_SIEROTY), ktory: 2 } },
  { id: 'S20g', stan: 'notatka-znika', opis: 'notatka dopisana, usunięta w innej karcie: po odczycie jej nagrobka (przed odnowieniem)', dop: { metoda: /^(getPatientNoteTombstoneForUser|listPatientNoteTombstonesForUser)$/, konto: 'A', wStosie: /Bnp_odnowJeden/ } },
];
// Uruchomienie scalenia z punktem przełączenia: hak magazynu albo czekanie na blokadę notatki trzymaną przez „inną kartę”.
async function scalZPrzelaczeniem(d, s, p, wariant) {
  if (!p.blokadaNotatki) {
    const hak = d.przelaczPo(p.dop, wariant);
    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    return { r, z: await hak.gotowe };
  }
  const nazwa = blokadaNotatki(p.blokadaNotatki);
  const inna = await d.locks.trzymaj(nazwa);
  const scal = wynik(s.uruchom());
  await d.locks.czekajNaKolejke(nazwa);
  const z = await d.przelacz(wariant);
  await inna.zwolnij();
  return { r: await scal, z };
}

// „Scal pacjentów” (scalenie) z prawdziwym vilda_sync.js i atrapą serwera synchronizacji; wysyłki — wywołania
// VildaSync.syncPush z sesją, w której padły.
async function scalenieZWysylka(d) {
  const chmura = atrapaChmury();
  const sync = zaladujSync(d, { fetch: chmura.fetch });
  const wysylki = [];
  const push = sync.syncPush;
  sync.syncPush = function (...a) { wysylki.push({ sesja: d.sesja(), nrSesji: d.nrSesji() }); return push.apply(this, a); };
  const s = await scalenie(d);
  return { chmura, sync, wysylki, s };
}

describe('P-SESJA-ZAPISU: operacje złożone kończą się w sesji, w której ruszyły', () => {
  it.each(przypadkiOdczytu)('O1: %s — przełączenie na B %s (%s) kończy operację SESSION_CHANGED, bez zapisów w B', async (op, _id, _opis, p) => {
    const d = await urzadzenie();
    const o = OPERACJE_KARTY[op];
    const s = await o.przygotuj(d);
    const przedA = await d.trwaly('A');
    const przedKarta = await d.kartaTrwala('A', s.pid);
    const przedB = await d.trwaly('B');
    const hak = p.rodzaj === 'magazyn' ? d.przelaczPo(p.dop(o), 'B') : d.przelaczWKrypto(p.dop(o), 'B');

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `operacja doszła do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianieOperacji(d, z);
    expect(await d.trwaly('B'), 'konto B bez zmian').toEqual(przedB);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'lista kart konta B pusta').toEqual([]);
    if (p.sierotaWA) return;
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
    expect(await d.kartaTrwala('A', s.pid), 'karta A bez nowej wersji').toEqual(przedKarta);
  });

  it.each(['B', 'A', 'blokada'])('O2: „Scal pacjentów” czeka na blokadę pierwszej karty; przełączenie %s — SESSION_CHANGED, bez żądania blokady drugiej karty i bez wywołań magazynu', async (wariant) => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const [k0] = [s.x, s.y].sort();
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');
    const inna = await d.locks.trzymaj(blokadaKarty(k0));
    let czekal = 0;
    const scal = wynik(s.uruchom({ onLockWait() { czekal += 1; } }));
    await d.locks.czekajNaKolejke(blokadaKarty(k0));
    expect(czekal, '„Scal pacjentów” czeka na blokadę karty').toBe(1);

    const z = await d.przelacz(wariant);
    await inna.zwolnij();
    const r = await scal;

    przerwany(r);
    await nicPoZmianieOperacji(d, z);
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await d.trwaly('B')).toEqual(przedB);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it('O3: „Scal pacjentów” czeka na blokadę drugiej karty; przełączenie na B — SESSION_CHANGED, bez wywołań magazynu', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const [, k1] = [s.x, s.y].sort();
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');
    const inna = await d.locks.trzymaj(blokadaKarty(k1));
    const scal = wynik(s.uruchom({ onLockWait() {} }));
    await d.locks.czekajNaKolejke(blokadaKarty(k1));

    const z = await d.przelacz('B');
    await inna.zwolnij();
    const r = await scal;

    przerwany(r);
    await nicPoZmianieOperacji(d, z);
    expect((await d.locks.query()).held).toEqual([]);
    expect(await d.trwaly('B')).toEqual(przedB);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it('O4: limit czekania „Scal pacjentów” na blokadę karty mija po zmianie sesji — SESSION_CHANGED zamiast „zajęta w innej karcie”', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const [k0] = [s.x, s.y].sort();
    const przedA = await d.trwaly('A');
    await d.locks.trzymaj(blokadaKarty(k0)); // inna karta trzyma blokadę do końca testu
    const scal = wynik(s.uruchom({ lockTimeoutMs: 150, onLockWait() {} }));
    await d.locks.czekajNaKolejke(blokadaKarty(k0));
    const limit = await d.timery.czekajNa((t) => t.ms === 150);

    const z = await d.przelacz('B');
    d.timery.odpal((t) => t.id === limit.id);
    const r = await scal;

    przerwany(r);
    expect(r.e.vildaSaveBusy, 'odrzucenie ze zmiany sesji, nie z zajętej blokady').toBeFalsy();
    await nicPoZmianieOperacji(d, z);
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it.each(PUNKTY_SCALANIA.map((p) => [p.id, p.opis, p]))('O5: „Scal pacjentów” %s — przełączenie na B %s kończy scalanie SESSION_CHANGED, bez wywołań magazynu w B', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const przedB = await d.trwaly('B');
    const hak = p.rodzaj === 'krypto' ? d.przelaczWKrypto(p.dop, 'B') : d.przelaczPo(p.dop, 'B');

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: p.bezKrypto });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez zmian (karty, wersje, nagrobki, notatki, listy)').toEqual(przedB);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'lista kart konta B pusta').toEqual([]);
  });

  it('O6: „Scal pacjentów” czeka na blokadę notatki (inna karta przeglądarki); przełączenie na B — SESSION_CHANGED, bez wywołań magazynu', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const przedB = await d.trwaly('B');
    const inne = await Promise.all(s.notatki.map((id) => d.locks.trzymaj(blokadaNotatki(id))));
    const od = d.locks.zadania.length;
    const scal = wynik(s.uruchom());
    await d.locks.czekajNaZadanie((x) => x.nazwa.startsWith('vilda-note-') && x.wynik === 'w-kolejce', { od });

    const z = await d.przelacz('B');
    await Promise.all(inne.map((x) => x.zwolnij()));
    const r = await scal;

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await d.trwaly('B')).toEqual(przedB);
  });

  it('O7: „Scal pacjentów”, nagrobek notatki z polem karty docelowej — przełączenie na B po odczycie karty docelowej w kroku nagrobka: SESSION_CHANGED, bez zapisu nagrobka w B', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    await nagrobkiZPolem(d, s);
    const przedB = await d.trwaly('B');
    const hak = d.przelaczPo({ metoda: 'getPatientForUser', konto: 'A', wStosie: /Bnp_karta/ }, 'B');

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, 'scalanie doszło do odczytu karty docelowej w kroku nagrobka notatki').toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: true });
    expect(await d.trwaly('B'), 'konto B bez zmian (w tym bez nagrobków notatek)').toEqual(przedB);
  });

  it.each(['S19a', 'S19b'].flatMap((id) => ['blokada', 'A'].map((w) => [id, w])))('O5-war: „Scal pacjentów” %s — przełączenie „%s” w usunięciu karty źródłowej kończy scalanie SESSION_CHANGED, bez wywołań magazynu (także bez konta) i bez powiadomień', async (id, wariant) => {
    const p = PUNKTY_SCALANIA.find((x) => x.id === id);
    const d = await urzadzenie();
    const s = await scalenie(d);
    const hak = d.przelaczPo(p.dop, wariant);

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
  });

  // Przegląd 4 (M3-02): sama blokada i ponowne zalogowanie A w pozostałych punktach usunięcia karty źródłowej.
  it.each([
    ...PUNKTY_SCALANIA.filter((p) => /^S19[c-f]$/.test(p.id)).flatMap((p) => ['blokada', 'A'].map((w) => [p.id, w, 'scal', p])),
    ...PUNKTY_USUNIECIA.flatMap((p) => ['blokada', 'A'].map((w) => [p.id, w, 'usun', p])),
  ])('O8-war: „Scal pacjentów” %s — przełączenie „%s” w usunięciu karty źródłowej kończy scalanie SESSION_CHANGED, bez wywołań magazynu (także bez konta) i bez powiadomień', async (_id, wariant, rodzaj, p) => {
    const d = await urzadzenie();
    let r, z;
    if (rodzaj === 'scal') {
      const s = await scalenie(d);
      const hak = d.przelaczPo(p.dop, wariant);
      r = await wynik(s.uruchom());
      expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
      z = await hak.gotowe;
    } else {
      const s = await przygotujUsuniecie(d, p);
      ({ r, z } = await scalZPrzelaczeniem(d, s, p, wariant));
    }

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
  });

  // Przegląd 4 (M3-04): po usunięciu karty źródłowej sejf wysyła zmiany od razu (VildaSync.syncPush) tylko w trybie
  // „Zaloguj jednorazowo” (isEphemeralMode). Nowa sesja jednorazowa (zalogowanie B, potem tryb jednorazowy), załadowany
  // vilda_sync.js: przerwane usunięcie karty źródłowej nie wysyła niczego w nowej sesji.
  it('O5 S19d-jednorazowo: przełączenie na B w trybie jednorazowym po zapisie nagrobka karty źródłowej — SESSION_CHANGED, bez syncPush i żądań do chmury po zmianie sesji', async () => {
    const d = await urzadzenie();
    const w = await scalenieZWysylka(d);
    let nrLogu = null;
    const hak = d.magazyn.po(PUNKTY_SCALANIA.find((x) => x.id === 'S19d').dop, async () => {
      const z = await d.przelacz('B');
      d.v.setEphemeralMode(true);
      nrLogu = w.chmura.log.length;
      return z;
    });

    const r = await wynik(w.s.uruchom());
    expect(hak.zrobione, 'scalanie doszło do zapisu nagrobka karty źródłowej').toBe(true);
    const z = await hak.gotowe;
    await kolejnaTura();
    expect(d.v.isEphemeralMode(), 'nowa sesja w trybie jednorazowym').toBe(true);

    przerwany(r);
    expect(w.wysylki.filter((x) => x.nrSesji >= z.nrSesji), 'po zmianie sesji bez VildaSync.syncPush').toEqual([]);
    expect(w.chmura.log.slice(nrLogu), 'po zmianie sesji bez żądań do chmury').toEqual([]);
    expect(d.po(z).zdarzenia.map((e) => `${e.typ}(${e.sesja})`), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
  });

  it.each(PUNKTY_USUNIECIA.map((p) => [p.id, p.opis, p]))('O8: „Scal pacjentów”, usunięcie karty źródłowej, %s (%s) — przełączenie na B kończy scalanie SESSION_CHANGED, bez wywołań magazynu, bez powiadomień i bez nagrobków notatek w B', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = await przygotujUsuniecie(d, p);
    const przedB = await d.trwaly('B');

    const { r, z } = await scalZPrzelaczeniem(d, s, p, 'B');

    przerwany(r);
    await nicPoZmianieOperacji(d, z, { bezKrypto: true });
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez zmian').toEqual(przedB);
    expect(await d.baza.listPatientNoteTombstonesForUser(d.B.userId), 'konto B bez nagrobków notatek').toEqual([]);
  });
});

describe('P-SESJA-ZAPISU: operacje złożone w jednej sesji — wyniki bez zmian', () => {
  it.each(przypadkiOdczytu)('K-O1: %s — hak %s (%s) bez przełączenia, wynik jak dotąd w A', async (op, _id, _opis, p) => {
    const d = await urzadzenie();
    const o = OPERACJE_KARTY[op];
    const s = await o.przygotuj(d);
    const przed = await d.kartaTrwala('A', s.pid);
    const hak = p.rodzaj === 'magazyn' ? d.magazyn.po(p.dop(o), () => {}) : d.krypto.po(p.dop(o), () => {});
    const z = d.znacznik();

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, `operacja doszła do punktu ${p.id}`).toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.patientId).toBe(s.pid);
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', s.pid]]);
    expect(d.locks.zajeta(blokadaKarty(s.pid))).toBe(false);
    expect(await d.kartaTrwala('A', s.pid)).toEqual({ jest: true, wersje: przed.wersje + 1 });
    const karta = await d.v.getPatient(s.pid);
    if (op === 'promoteExternalToBase') expect(karta.header.external, 'karta w bazie').toBeFalsy();
    else expect(karta.snapshots[0].payload.user.height, 'treść przywróconej wersji').toBe(120);
  });

  it.each([['bez haka', null], ...PUNKTY_SCALANIA.map((p) => [p.id, p])])('K-O5: „Scal pacjentów” %s bez przełączenia — wynik jak dotąd w A', async (_id, p) => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const hak = !p ? null : p.rodzaj === 'krypto' ? d.krypto.po(p.dop, () => {}) : d.magazyn.po(p.dop, () => {});
    const z = d.znacznik();

    const r = await wynik(s.uruchom());
    if (hak) expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: s.y, sourcePatientId: s.x, snapshotsMoved: 2, notesMoved: 2, listsUpdated: 2 });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', s.y]]);
    expect((await d.locks.query()).held).toEqual([]);
    expect(await d.kartaTrwala('A', s.x)).toEqual({ jest: false, wersje: 0 });
    expect(await d.kartaTrwala('A', s.y)).toEqual({ jest: true, wersje: 4 });
    expect((await d.trwaly('A')).notatki, 'notatki karty źródłowej przeniesione').toBe(2);
  });

  it('K-O5 S19d-jednorazowo: tryb jednorazowy włączony po zapisie nagrobka karty źródłowej, bez zmiany sesji — wynik jak dotąd, syncPush w A', async () => {
    const d = await urzadzenie();
    const w = await scalenieZWysylka(d);
    const z = d.znacznik();
    let nr = null;
    const hak = d.magazyn.po(PUNKTY_SCALANIA.find((x) => x.id === 'S19d').dop, () => { d.v.setEphemeralMode(true); nr = w.wysylki.length; });
    const r = await wynik(w.s.uruchom());
    await kolejnaTura();
    expect(hak.zrobione).toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: w.s.y, sourcePatientId: w.s.x });
    expect(zapisaneKarty(d.zdarzenia.slice(z.zdarzenia))).toEqual([['A', w.s.y]]);
    expect(w.wysylki.slice(nr).map((x) => x.sesja), 'wysyłka po usunięciu karty źródłowej w A').toEqual(['A']);
  });

  it('K-O2: „Scal pacjentów” — czekanie na blokadę notatki bez zmiany sesji, wynik jak dotąd', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const inne = await Promise.all(s.notatki.map((id) => d.locks.trzymaj(blokadaNotatki(id))));
    const od = d.locks.zadania.length;
    const scal = wynik(s.uruchom());
    await d.locks.czekajNaZadanie((x) => x.nazwa.startsWith('vilda-note-') && x.wynik === 'w-kolejce', { od });
    await Promise.all(inne.map((x) => x.zwolnij()));
    const r = await scal;
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: s.y, notesMoved: 2, listsUpdated: 2 });
    expect((await d.trwaly('A')).notatki).toBe(2);
  });

  it('K-O7: „Scal pacjentów”, nagrobek notatki z polem karty docelowej, hak bez przełączenia — wynik jak dotąd w A', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    await nagrobkiZPolem(d, s);
    const hak = d.magazyn.po({ metoda: 'getPatientForUser', konto: 'A', wStosie: /Bnp_karta/ }, () => {});
    const r = await wynik(s.uruchom());
    expect(hak.zrobione, 'scalanie doszło do odczytu karty docelowej w kroku nagrobka notatki').toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: s.y, notesMoved: 2, listsUpdated: 2 });
    expect((await d.trwaly('A')).notatki).toBe(2);
    // Karta docelowa późniejsza niż pole, zapis notatki późniejszy niż nagrobek — nagrobek zdjęty (przegląd 2, F2).
    const nagrobki = (await d.baza.listPatientNoteTombstonesForUser(d.A.userId)).filter((n) => s.notatki.includes(n.id));
    expect(nagrobki, 'nagrobki przeniesionych notatek zdjęte').toEqual([]);
    const notatki = await Promise.all(s.notatki.map((id) => d.baza.getPatientNoteForUser(d.A.userId, id)));
    expect(notatki.map((n) => n && n.patientId), 'notatki przy karcie docelowej').toEqual([s.y, s.y]);
  });

  it('K-O7b: „Scal pacjentów”, nagrobek notatki z polem karty docelowej w stanie CZEKA (karta docelowa nie późniejsza niż pole) — nagrobek zostaje z chwilą zapisu notatki i rev = max', async () => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const rev = [0, 7];
    let pole = null;
    // Po wewnętrznym zapisie karty docelowej (odczyt notatek źródła w kroku scalania): pole z chwilą nie wcześniejszą niż
    // ostatni zapis karty docelowej — stan CZEKA.
    const hak = d.magazyn.po({ ...W_KROKU, metoda: 'listPatientNotesForUser' }, async () => {
      pole = new Date().toISOString();
      for (const [i, id] of s.notatki.entries()) {
        await d.baza.putPatientNoteTombstoneForUser(d.A.userId, { id, deletedAtISO: pole, rev: rev[i], deletedWithPatient: { patientId: s.y, deletedAtISO: pole } });
      }
    });

    const r = await wynik(s.uruchom());
    expect(hak.zrobione, 'scalanie doszło do odczytu notatek źródła').toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: s.y, notesMoved: 2, listsUpdated: 2 });
    const karta = await d.baza.getPatientForUser(d.A.userId, s.y);
    expect(karta.lastSavedAtISO <= pole, 'karta docelowa nie późniejsza niż pole (CZEKA)').toBe(true);
    const notatki = await Promise.all(s.notatki.map((id) => d.baza.getPatientNoteForUser(d.A.userId, id)));
    expect(notatki.map((n) => n && n.patientId), 'notatki przy karcie docelowej').toEqual([s.y, s.y]);
    const nagrobki = new Map((await d.baza.listPatientNoteTombstonesForUser(d.A.userId)).map((n) => [n.id, n]));
    expect(s.notatki.map((id) => nagrobki.get(id) || null), 'nagrobki zostają: chwila zapisu notatki, rev = max, pole bez zmian').toEqual(notatki.map((n, i) => ({
      id: n.id, deletedAtISO: n.updatedAtISO > pole ? n.updatedAtISO : pole, rev: Math.max(n.rev, rev[i]), deletedWithPatient: { patientId: s.y, deletedAtISO: pole },
    })));
  });

  it.each([
    ...['notatka', 'sierota', 'sierota-wraca', 'notatka-znika'].map((st) => [`${st}, bez haka`, { stan: st, ile: 2 }]),
    ...PUNKTY_USUNIECIA.map((p) => [p.id, p]),
  ])('K-O8: „Scal pacjentów”, usunięcie karty źródłowej (%s) bez przełączenia — wynik jak dotąd w A: nagrobki notatek z polem karty źródłowej, powiadomienia w A', async (_id, p) => {
    const d = await urzadzenie();
    const s = await przygotujUsuniecie(d, p);
    let r;
    if (p.blokadaNotatki) {
      const nazwa = blokadaNotatki(p.blokadaNotatki);
      const inna = await d.locks.trzymaj(nazwa);
      const scal = wynik(s.uruchom());
      await d.locks.czekajNaKolejke(nazwa);
      await inna.zwolnij();
      r = await scal;
    } else {
      const hak = p.dop ? d.magazyn.po(p.dop, () => {}) : null;
      r = await wynik(s.uruchom());
      if (hak) expect(hak.zrobione, `scalanie doszło do punktu ${p.id}`).toBe(true);
    }

    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w).toMatchObject({ targetPatientId: s.y, sourcePatientId: s.x, notesMoved: 2, listsUpdated: 2 });
    expect(await d.kartaTrwala('A', s.x)).toEqual({ jest: false, wersje: 0 });
    const kartaX = (await d.baza.listTombstonesForUser(d.A.userId)).find((n) => n.patientId === s.x);
    expect(kartaX, 'nagrobek karty źródłowej').toBeTruthy();
    const nagrobki = (await d.baza.listPatientNoteTombstonesForUser(d.A.userId)).filter((n) => s.ids.includes(n.id));
    expect(nagrobki.map((n) => [n.id, n.deletedWithPatient]).sort(), 'nagrobki z polem karty źródłowej (chwila jej nagrobka)').toEqual(s.ids.map((id) => [id, { patientId: s.x, deletedAtISO: kartaX.deletedAtISO }]).sort());
    expect((await Promise.all(s.ids.map((id) => d.baza.getPatientNoteForUser(d.A.userId, id)))).map((n) => n || null), 'notatek nie ma').toEqual(s.ids.map(() => null));
    if (p.stan === 'sierota' || p.stan === 'notatka-znika') {
      expect(nagrobki.every((n) => n.deletedAtISO > '2020-01-02T00:00:00.000Z' && n.rev === 3), 'stare nagrobki odnowione (nowa chwila, rev bez zmian)').toBe(true);
    }
    const usuniecia = d.zdarzenia.filter((e) => e.typ === 'patientNoteChanged' && e.dane && s.ids.includes(e.dane.id) && e.dane.action === 'delete');
    expect(usuniecia.map((e) => e.sesja), 'powiadomienia o nagrobkach w A').toEqual(s.ids.map(() => 'A'));
  });

  it.each([...Object.keys(OPERACJE_KARTY), 'mergePatients'])('K-O3: %s — błąd odczytu rekordu karty w tej samej sesji zostaje tym błędem, nie SESSION_CHANGED', async (op) => {
    const d = await urzadzenie();
    const s = op === 'mergePatients' ? await scalenie(d) : await OPERACJE_KARTY[op].przygotuj(d);
    const przedA = await d.trwaly('A');
    d.magazyn.blad({ metoda: 'getPatientForUser', konto: 'A' }, { komunikat: 'atrapa: odczyt rekordu karty nieudany' });
    const r = await wynik(s.uruchom());
    expect(r.ok).toBe(false);
    expect(r.kod, r.komunikat).not.toBe('SESSION_CHANGED');
    expect(r.komunikat).toMatch(/atrapa: odczyt rekordu karty nieudany/);
    expect(d.sesja()).toBe('A');
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it.each([
    ['czekanie na blokadę karty', false],
    ['limit czekania na blokadę karty', true],
  ])('K-O2: „Scal pacjentów” — %s bez zmiany sesji, wynik jak dotąd', async (_opis, limit) => {
    const d = await urzadzenie();
    const s = await scalenie(d);
    const [k0] = [s.x, s.y].sort();
    const inna = await d.locks.trzymaj(blokadaKarty(k0));
    const scal = wynik(s.uruchom(limit ? { lockTimeoutMs: 150, onLockWait() {} } : { onLockWait() {} }));
    await d.locks.czekajNaKolejke(blokadaKarty(k0));
    if (limit) {
      const t = await d.timery.czekajNa((x) => x.ms === 150);
      d.timery.odpal((x) => x.id === t.id);
    } else {
      await inna.zwolnij();
    }
    const r = await scal;
    if (limit) {
      expect(r.ok).toBe(false);
      expect(r.e.vildaSaveBusy, '„zajęta w innej karcie”').toBe(true);
      expect(r.kod).not.toBe('SESSION_CHANGED');
      expect(await d.kartaTrwala('A', s.x), 'karta źródłowa bez zmian').toMatchObject({ jest: true });
    } else {
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w.targetPatientId).toBe(s.y);
      expect(await d.kartaTrwala('A', s.y)).toEqual({ jest: true, wersje: 4 });
    }
  });
});
