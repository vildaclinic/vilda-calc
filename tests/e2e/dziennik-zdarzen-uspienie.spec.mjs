// P-DZIENNIK-ZDARZEN (E2-PR2b, E2-PR3a1) — kolejka zmian jest uśpiona: zwykła praca z sejfem w prawdziwej przeglądarce
// przy zamkniętej bramce nie otwiera i nie tworzy bazy kolejki (vilda_sync_<userId>), nie szyfruje zdarzeń, nie zapisuje
// ani nie usuwa kluczy vilda-sync-* w localStorage (identyfikator urządzenia, znacznik ponowienia kasowania) i nie wysyła
// żądań. Jedyny skutek E2-PR3a1 przy zamkniętej bramce to sprzątanie po koncie poza trybem „Zaloguj jednorazowo”:
// w removeUser jedna lista baz (databases()) więcej (bez listy baz — deleteDatabase nieistniejącej bazy kolejki, bez
// otwarcia), blokada Web Locks vilda-sync-db:<userId> (wyłączna) i odczyty localStorage (znacznik ponowienia
// i identyfikator urządzenia konta), a przy założeniu konta i odblokowaniu — przegląd kluczy localStorage (ponowienie).
// W trybie „Zaloguj jednorazowo” sprzątanie po koncie nie sięga do IndexedDB, localStorage ani Web Locks: ślad jak na
// sejfie bez kasowania kolejki.
// Bieżący vilda_vault.js na stronie-uprzęży z serwera testów; skrypt startowy strony (przed skryptami sejfu) liczy na
// krok: odczyty pola okna VILDA_EVENT_LOG (getter; tylko na stronie bez elementu o tym id), wywołania
// IDBFactory.prototype.open / deleteDatabase / databases, SubtleCrypto.prototype.encrypt,
// LockManager.prototype.request z nazwą vilda-sync*, Storage.prototype.setItem / removeItem; strona liczy żądania sieci
// po załadowaniu. Trzy tryby logowania („Komputer prywatny”, „Komputer w pracy”, „Zaloguj jednorazowo” — każdy z
// usunięciem konta; „Zaloguj jednorazowo” to strażnik regresji — zielony także na sejfie bez kasowania kolejki), wariant
// bez navigator.locks (strażnik regresji jak wyżej) oraz strona z elementem o id VILDA_EVENT_LOG (pole okna wskazuje
// element, a nie wartość true — bramka zostaje zamknięta: dopisanie i operacje kwarantanny odmawiają, podsumowanie
// wyniku zastosowania zdarzenia jako funkcja czysta działa). Literały kroków (ENCRYPT, DATABASES) zmierzone w Chromium
// na sejfie bez kasowania kolejki; DATABASES w kroku usunięcia konta = pomiar + 1 poza trybem „Zaloguj jednorazowo”
// (w nim = pomiar). Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';

const PAGE = '/__fikcyjny-dziennik-zdarzen-uspienie.html';
const HASLO = 'Fikcyjne#UspienieKolejki2026!';
const HASLO_2 = 'Fikcyjne#UspienieKolejki2026?';
// Skrypty sejfu jak na stronie aplikacji (moduły punktu odzyskiwania są potrzebne do usunięcia konta).
const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_clinical_crypto.js', 'vilda_patient_checkpoint_store.js',
  'vilda_patient_checkpoint.js', 'vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js',
  'vilda_vault.js'].map((p) => `<script src="/${p}"></script>`).join('');
const TRYBY = ['prywatny', 'chmura', 'jednorazowo'];
const KROKI = ['konto', 'karta', 'wersja', 'kosz', 'przywróć', 'notatka', 'szablon', 'lista', 'druga karta', 'scal pacjentów',
  'trzecia karta', 'usuń pacjenta', 'zmiana hasła', 'blokada', 'odblokowanie', 'usunięcie konta'];
// SubtleCrypto.prototype.encrypt na krok (bez szyfrowania zdarzeń) — pomiar w Chromium.
const ENCRYPT = {
  prywatny: [3, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 0, 1, 0, 0, 0],
  chmura: [3, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 0, 1, 0, 0, 0],
  jednorazowo: [2, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 0, 1, 0, 0, 0],
};
// Każdy chroniony zapis sprawdza rzeczywisty marker routingu; tworzenie karty także odczytuje listę.
// IDBFactory.prototype.databases na krok: w kroku usunięcia konta sprawdzenie biblioteki szablonów i — poza trybem
// jednorazowym — lista baz przy kasowaniu kolejki.
const DATABASES = Object.fromEntries(TRYBY.map((t) => [t, KROKI.map((k) => (k === 'usunięcie konta' ? (t === 'jednorazowo' ? 2 : 3) : k === 'karta' ? 2 : ['wersja', 'kosz', 'przywróć', 'notatka', 'szablon', 'lista', 'druga karta', 'scal pacjentów', 'trzecia karta', 'usuń pacjenta'].includes(k) ? 1 : 0))]));
// LockManager.prototype.request z nazwą vilda-sync*: tylko w kroku usunięcia konta, wyłączna, poza trybem jednorazowym.
const BLOKADY = Object.fromEntries(TRYBY.map((t) => [t, KROKI.map((k) => (k === 'usunięcie konta' && t !== 'jednorazowo' ? ['exclusive'] : []))]));
const KARTA = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', height: 120, weight: 22, dobISO: '2016-03-12' } };

// Skrypt startowy strony (wykonywany w przeglądarce, przed skryptami sejfu).
function skryptStartowy({ licznikBramki, bezLocks }) {
  const z = { bramka: 0, open: [], deleteDatabase: [], databases: 0, setItem: [], removeItem: [], encrypt: 0, blokady: [] };
  Object.defineProperty(window, '__uspienie', { value: z });
  if (licznikBramki) Object.defineProperty(window, 'VILDA_EVENT_LOG', { get() { z.bramka += 1; return undefined; }, configurable: true });
  if (bezLocks) Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  const P = IDBFactory.prototype;
  const open = P.open;
  const usun = P.deleteDatabase;
  const lista = P.databases;
  P.open = function zapisOpen(nazwa, ...a) { z.open.push(String(nazwa)); return open.call(this, nazwa, ...a); };
  P.deleteDatabase = function zapisDeleteDatabase(nazwa, ...a) { z.deleteDatabase.push(String(nazwa)); return usun.call(this, nazwa, ...a); };
  P.databases = function zapisDatabases(...a) { z.databases += 1; return lista.apply(this, a); };
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function zapisSetItem(klucz, ...a) { z.setItem.push(String(klucz)); return setItem.call(this, klucz, ...a); };
  Storage.prototype.removeItem = function zapisRemoveItem(klucz, ...a) { z.removeItem.push(String(klucz)); return removeItem.call(this, klucz, ...a); };
  const encrypt = SubtleCrypto.prototype.encrypt;
  SubtleCrypto.prototype.encrypt = function zapisEncrypt(...a) { z.encrypt += 1; return encrypt.apply(this, a); };
  if (typeof LockManager === 'function') {
    const request = LockManager.prototype.request;
    LockManager.prototype.request = function zapisRequest(nazwa, ...a) {
      const opcje = typeof a[0] === 'object' && a[0] ? a[0] : {};
      if (String(nazwa).startsWith('vilda-sync')) z.blokady.push({ nazwa: String(nazwa), tryb: opcje.mode || 'exclusive' });
      return request.call(this, nazwa, ...a);
    };
  }
}

// Scenariusz zwykłego użycia w jednym trybie (wykonywany w przeglądarce); liczniki skryptu startowego na krok.
async function scenariuszTrybu({ tryb, haslo, haslo2, karta }) {
  const v = window.VildaVault;
  const z = window.__uspienie;
  const kroki = [];
  const syncKlucz = (lista) => lista.filter((k) => k.startsWith('vilda-sync-')).length;
  const syncBaza = (lista) => lista.filter((n) => n.startsWith('vilda_sync_')).length;
  const zrzut = () => ({ b: z.bramka, d: z.databases, e: z.encrypt, l: z.blokady.length, s: syncKlucz(z.setItem), r: syncKlucz(z.removeItem), o: syncBaza(z.open), x: syncBaza(z.deleteDatabase) });
  const krok = async (nazwa, fn) => {
    const a = zrzut();
    const blokady = z.blokady.length;
    const wynik = await fn();
    await new Promise((ok) => { setTimeout(ok, 50); });
    const b = zrzut();
    kroki.push({
      krok: nazwa, bramka: b.b - a.b, databases: b.d - a.d, encrypt: b.e - a.e, blokady: z.blokady.slice(blokady).map((x) => x.tryb),
      setItemSync: b.s - a.s, removeItemSync: b.r - a.r, openSync: b.o - a.o, deleteSync: b.x - a.x,
      wynik: wynik === undefined ? null : typeof wynik === 'object' ? (wynik === null ? null : 'obiekt') : wynik,
    });
  };
  const jednorazowo = () => { if (tryb === 'jednorazowo') v.setEphemeralMode(true); };
  const s = {};
  await krok('konto', async () => {
    jednorazowo();
    s.uid = (await v.createUser(haslo, { label: 'Fikcyjna Lekarka Uśpienie', iterations: 10000, ...(tryb === 'chmura' ? { storageMode: 'cloud-only' } : {}) })).userId;
  });
  await krok('karta', async () => { const r = await v.savePatient(karta, { dedup: false }); s.P1 = r.patientId; s.S1 = r.snapshotId; });
  await krok('wersja', async () => { await v.savePatient({ ...karta, user: { ...karta.user, weight: 23 } }, { dedup: false, patientId: s.P1 }); });
  await krok('kosz', async () => { await v.moveSnapshotToTrash(s.P1, s.S1); });
  await krok('przywróć', async () => { await v.restoreTrashedSnapshot(s.P1, s.S1); });
  await krok('notatka', async () => { await v.savePatientNote({ patientId: s.P1, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' }); });
  await krok('szablon', async () => { await v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść.', category: 'wlasne' }); });
  await krok('lista', async () => { await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.P1] }); });
  await krok('druga karta', async () => { s.P2 = (await v.savePatient({ ...karta, name: 'Testowy Jan2', user: { ...karta.user, firstName: 'Jan2' } }, { dedup: false })).patientId; });
  await krok('scal pacjentów', async () => { await v.mergePatients(s.P2, s.P1); });
  await krok('trzecia karta', async () => { s.P3 = (await v.savePatient({ ...karta, name: 'Testowy Jan3', user: { ...karta.user, firstName: 'Jan3' } }, { dedup: false })).patientId; });
  await krok('usuń pacjenta', async () => { await v.removePatient(s.P3); });
  await krok('zmiana hasła', async () => { await v.changePassword(haslo, haslo2); });
  await krok('blokada', async () => { v.lock('manual'); });
  await krok('odblokowanie', async () => { jednorazowo(); await v.unlockUser(s.uid, haslo2); });
  await krok('usunięcie konta', async () => v.removeUser(s.uid, haslo2));
  return kroki;
}

async function strona(page, { element = false, bezLocks = false } = {}) {
  await page.addInitScript(skryptStartowy, { licznikBramki: !element, bezLocks });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjny dziennik zdarzeń</title>'
      + (element ? '<div id="VILDA_EVENT_LOG"></div>' : '')
      + '<script>localStorage.setItem("vildaRetention", "0")</script>' + SKRYPTY,
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.createUser));
  const zadania = [];
  page.on('request', (r) => { zadania.push(r.url()); });
  return zadania;
}

async function slad(page) {
  return page.evaluate(async () => ({
    ...window.__uspienie,
    haki: [IDBFactory.prototype.open.name, IDBFactory.prototype.deleteDatabase.name, IDBFactory.prototype.databases.name,
      Storage.prototype.setItem.name, Storage.prototype.removeItem.name, SubtleCrypto.prototype.encrypt.name],
    bazy: (await indexedDB.databases()).map((d) => d.name),
  }));
}

// rejestr: tryb, w którym konto ma wpis w rejestrze w IndexedDB (bez „Zaloguj jednorazowo”).
function bezKolejki(s, { rejestr = true } = {}) {
  expect(s.haki, 'zapis otwarć, kasowań, list baz, kluczy i szyfrowania działa')
    .toEqual(['zapisOpen', 'zapisDeleteDatabase', 'zapisDatabases', 'zapisSetItem', 'zapisRemoveItem', 'zapisEncrypt']);
  expect(s.setItem, 'zapis kluczy (skrypt strony)').toContain('vildaRetention');
  if (rejestr) expect(s.open, 'zapis otwarć (rejestr kont)').toContain('vilda_registry');
  expect({
    open: s.open.filter((n) => n.startsWith('vilda_sync_')),
    deleteDatabase: s.deleteDatabase.filter((n) => n.startsWith('vilda_sync_')),
    bazy: s.bazy.filter((n) => n.startsWith('vilda_sync_')),
    setItem: s.setItem.filter((k) => k.startsWith('vilda-sync-')),
    removeItem: s.removeItem.filter((k) => k.startsWith('vilda-sync-')),
  }, 'baza kolejki i klucze vilda-sync-* (identyfikator urządzenia, znacznik ponowienia)').toEqual({ open: [], deleteDatabase: [], bazy: [], setItem: [], removeItem: [] });
}

const OPIS_TRYBU = { prywatny: '„Komputer prywatny”', chmura: '„Komputer w pracy”', jednorazowo: '„Zaloguj jednorazowo” (strażnik regresji)' };

test.describe('Dziennik zdarzeń: kolejka zmian uśpiona w prawdziwej przeglądarce', () => {
  for (const tryb of TRYBY) {
    test(`${OPIS_TRYBU[tryb]}: konto, karta, wersja, kosz, „Przywróć”, notatka, szablon, lista, „Scal pacjentów”, „Usuń pacjenta”, zmiana hasła, blokada, odblokowanie i usunięcie konta — liczniki na krok, bez bazy kolejki, kluczy vilda-sync-* i żądań`, async ({ page }) => {
      const zadania = await strona(page);
      const kroki = await page.evaluate(scenariuszTrybu, { tryb, haslo: HASLO, haslo2: HASLO_2, karta: KARTA });
      expect(kroki.map((k) => k.krok), 'kroki scenariusza').toEqual(KROKI);
      expect(kroki.find((k) => k.krok === 'usunięcie konta').wynik, 'removeUser').toBe(true);
      const kolumna = (pole) => kroki.map((k) => k[pole]);
      expect({
        bramka: kolumna('bramka'), encrypt: kolumna('encrypt'), databases: kolumna('databases'), blokady: kolumna('blokady'),
      }, 'liczniki na krok (odczyty pola bramki, encrypt, databases(), blokady vilda-sync*)').toEqual({
        bramka: KROKI.map(() => 0), encrypt: ENCRYPT[tryb], databases: DATABASES[tryb], blokady: BLOKADY[tryb],
      });
      for (const pole of ['setItemSync', 'removeItemSync', 'openSync', 'deleteSync']) expect(kolumna(pole), pole).toEqual(KROKI.map(() => 0));
      const s = await slad(page);
      expect(s.open.some((n) => n.startsWith('vilda_user_')) || tryb === 'jednorazowo', 'baza konta była otwierana').toBe(true);
      bezKolejki(s, { rejestr: tryb !== 'jednorazowo' });
      expect(zadania, 'żądania sieci po załadowaniu strony').toEqual([]);
    });
  }

  test('bez navigator.locks („Komputer prywatny”, strażnik regresji): „Usuń konto” przy zamkniętej bramce — bez zapisu i usunięcia kluczy vilda-sync-*, bez bazy kolejki, bez blokad', async ({ page }) => {
    const zadania = await strona(page, { bezLocks: true });
    const w = await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      const { userId } = await v.createUser(haslo, { label: 'Fikcyjna Lekarka Bez Blokad', iterations: 10000 });
      await v.savePatient(karta, { dedup: false });
      return { locks: navigator.locks === undefined, usuniete: await v.removeUser(userId, haslo) };
    }, { haslo: HASLO, karta: KARTA });
    expect(w).toEqual({ locks: true, usuniete: true });
    const s = await slad(page);
    bezKolejki(s);
    expect(s.blokady, 'blokady vilda-sync*').toEqual([]);
    expect(s.bramka, 'odczyty pola bramki').toBe(0);
    expect(zadania).toEqual([]);
  });

  test('element o id VILDA_EVENT_LOG na stronie: bramka zamknięta (gateOpen false), enqueue odmawia bez otwarcia bazy kolejki', async ({ page }) => {
    await strona(page, { element: true });
    const w = await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      await v.createUser(haslo, { label: 'Fikcyjna Lekarka Bramka', iterations: 10000 });
      const p = await v.savePatient(karta);
      return {
        pole: window.VILDA_EVENT_LOG instanceof HTMLElement,
        bramka: v._eventLog.gateOpen(),
        enqueue: await v._eventLog.enqueue('snap', { patientId: p.patientId, snapshotId: p.snapshotId }),
      };
    }, { haslo: HASLO, karta: KARTA });
    expect(w).toEqual({ pole: true, bramka: false, enqueue: { ok: false, powod: 'bramka' } });
    bezKolejki(await slad(page));
  });

  test('element o id VILDA_EVENT_LOG na stronie: operacje kwarantanny odmawiają (bramka) bez otwarcia bazy kolejki, podsumowanie wyniku działa', async ({ page }) => {
    await strona(page, { element: true });
    const w = await page.evaluate(async ({ haslo }) => {
      const v = window.VildaVault;
      const ev = v._eventLog;
      const brak = ['quarantinePut', 'quarantineList', 'quarantineCount', 'quarantineMinSeq', 'quarantineRelease', 'resultSummary']
        .filter((k) => typeof ev[k] !== 'function');
      if (brak.length) return { brak };
      await v.createUser(haslo, { label: 'Fikcyjna Lekarka Bramka Kwarantanny', iterations: 10000 });
      const slotId = '1a2b3c4d'.repeat(8);
      const wynik = { status: 'unreadable', reason: 'decrypt' };
      return {
        brak,
        bramka: ev.gateOpen(),
        zapis: await ev.quarantinePut({ seq: 1, payload: { iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' } }, wynik, { slotId, appVersion: null }),
        lista: await ev.quarantineList(),
        listaSlotu: await ev.quarantineList({ slotId }),
        licznik: await ev.quarantineCount(),
        minimum: await ev.quarantineMinSeq({ slotId }),
        zwolnienie: await ev.quarantineRelease([1], { slotId }),
        podsumowanie: ev.resultSummary(wynik),
      };
    }, { haslo: HASLO });
    const BRAMKA = { ok: false, powod: 'bramka' };
    expect(w).toEqual({
      brak: [], bramka: false, zapis: BRAMKA, lista: BRAMKA, listaSlotu: BRAMKA, licznik: BRAMKA, minimum: BRAMKA, zwolnienie: BRAMKA,
      podsumowanie: { status: 'unreadable', reason: 'decrypt' },
    });
    bezKolejki(await slad(page));
  });
});
