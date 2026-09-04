import { expect, test } from '../support/test-czas.mjs';

// Audyt sekcji „Notatki" 2026-09-04, znaleziska N1 i N2.
//
// N1 — `l()` łapało błąd z listNotes(), zerowało listę i renderowało pusty stan, czyli komunikat
//      „Nie masz jeszcze notatek". Zmierzone: trzy istniejące szablony znikały pod napisem nie do
//      odróżnienia od prawdy o pustej bibliotece. Dla lekarza to wygląda jak utrata dorobku.
// N2 — `O()` (usuwanie) i `x()` (przypinanie) miały puste `catch{}`. Zmierzone: po potwierdzeniu
//      „Usunąć notatkę?" przy awarii sejfu karta zostawała, a na stronie nie pojawiał się ŻADEN
//      komunikat — użytkownik nie wiedział, czy kliknięcie w ogóle doszło.
//
// N3 — wyszukiwarka porównywała surowe `toLowerCase()`, więc „zoladek" nie znajdowało „żołądek".
//      Przy polskiej bibliotece szablonów to trafia codziennie: nikt nie pisze ogonków w polu szukania.
// N4 — przycisk „+ Nowa notatka" był widoczny i AKTYWNY w obu stanach bramkowanych (bez konta i
//      bez PRO), a klik nie robił nic: ani edytora, ani komunikatu, ani przejścia do subskrypcji.
//
// Testy podmieniają wyłącznie metodę sejfu albo bramkę PRO; cała ścieżka renderowania i obsługi
// zdarzeń jest prawdziwa.

const HASLO = 'E2e#Notatki!2026';

async function otworz(page) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/notatki.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    // Notatki są za bramką PRO (podpisany token, którego w teście nie podrabiamy) — podmieniamy
    // wyłącznie tę bramkę, resztą ścieżki zajmuje się prawdziwy kod.
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.evaluate(async () => {
    const V = window.VildaVault;
    await V.saveNote({ title: 'Opis USG tarczycy', category: 'badanie', body: 'treść A' });
    await V.saveNote({ title: 'Zalecenia po zabiegu', category: 'zalecenia', body: 'treść B' });
    await V.saveNote({ title: 'Wywiad rodzinny', category: 'wywiad', body: 'treść C' });
  });
  await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 3,
    null, { timeout: 20000 });
  // Bootstrap sekcji ma jednorazową ankietę co 250 ms (`setInterval` w `C()`), która po
  // odblokowaniu sejfu robi jeszcze jedno `l()` i dopiero wtedy kasuje interwał. To dodatkowe
  // odświeżenie woła `Qn2()`, czyli SPRZĄTA pasek komunikatów — gdyby trafiło zaraz po nieudanej
  // akcji, zdmuchnęłoby świeżo pokazany alert. Odczekanie ponad dwa takty daje każdemu testowi
  // w tym pliku ustabilizowany punkt startu.
  await page.waitForTimeout(600);
}

const stan = (page) => page.evaluate(() => {
  const alert = document.getElementById('notesAlert');
  return {
    karty: document.querySelectorAll('.note-card').length,
    tytulPustego: (document.querySelector('.notes-empty__title') || {}).textContent || null,
    panelBledu: !!document.querySelector('.notes-empty--error'),
    ponow: !!document.querySelector('.notes-empty__retry button'),
    alertWidoczny: !!(alert && alert.getClientRects().length),
    alertTresc: alert ? (alert.querySelector('.notes-alert__body') || {}).textContent || '' : '',
  };
});

test('N1a — awaria PIERWSZEGO odczytu nie udaje pustej biblioteki', async ({ page }) => {
  // Najgroźniejszy wariant: sejf nie oddaje listy, a strona nie ma nic w pamięci. Przed poprawką
  // wychodziło z tego „Nie masz jeszcze notatek" — komunikat nie do odróżnienia od prawdy.
  await otworz(page);
  await page.evaluate(() => {
    window.__list = window.VildaVault.listNotes;
    // Krok 1: jeden udany, ale pusty odczyt — widok traci pamięć listy, jak przy pierwszym wejściu.
    window.VildaVault.listNotes = async () => [];
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 0,
    null, { timeout: 20000 });
  // Kontrola: bez awarii to JEST zwykły pusty stan i tak ma się nazywać.
  expect((await stan(page)).tytulPustego, 'pusta biblioteka bez awarii')
    .toBe('Nie masz jeszcze notatek');

  // Krok 2: teraz odczyt pada, a widok nie ma czego pokazać — tu przed poprawką padał ten sam
  // napis co wyżej, czyli awaria była nie do odróżnienia od pustej biblioteki.
  await page.evaluate(() => {
    window.VildaVault.listNotes = async () => { throw new Error('sejf niedostępny'); };
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => document.querySelector('.notes-empty--error'),
    null, { timeout: 20000 });

  const po = await stan(page);
  expect(po.panelBledu, 'panel błędu zamiast pustego stanu').toBe(true);
  expect(po.tytulPustego, 'komunikat mówi o BŁĘDZIE ODCZYTU').toBe('Nie udało się wczytać notatek');
  expect(po.tytulPustego, 'i na pewno nie o braku notatek').not.toBe('Nie masz jeszcze notatek');
  expect(po.ponow, 'jest czym ponowić próbę').toBe(true);
  const opis = await page.evaluate(() => document.querySelector('.notes-empty__desc').textContent);
  expect(opis, 'powód dociera do użytkownika, nie tylko do konsoli').toContain('sejf niedostępny');
  expect(opis, 'i uspokaja co do danych').toContain('błąd odczytu, nie utrata danych');

  // „Spróbuj ponownie" po ustąpieniu awarii wraca do listy — bez przeładowania strony.
  await page.evaluate(() => { window.VildaVault.listNotes = window.__list; });
  await page.evaluate(() => document.querySelector('.notes-empty__retry button').click());
  await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 3,
    null, { timeout: 20000 });
  expect((await stan(page)).panelBledu, 'panel błędu znika po udanym ponowieniu').toBe(false);
});

test('N1b — awaria ODŚWIEŻENIA zostawia ostatnią znaną listę i mówi o tym', async ({ page }) => {
  // Wariant łagodniejszy, ale częstszy: lista już jest na ekranie, a kolejny odczyt pada.
  // Kasowanie widoku byłoby tu gorsze niż jego zatrzymanie — zostaje lista plus pasek ostrzeżenia.
  await otworz(page);
  await page.evaluate(() => {
    window.VildaVault.listNotes = async () => { throw new Error('sejf niedostępny'); };
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !!(a && a.getClientRects().length);
  }, null, { timeout: 20000 });

  const po = await stan(page);
  expect(po.karty, 'ostatnia znana lista zostaje na ekranie').toBe(3);
  expect(po.panelBledu, 'bez panelu błędu — jest co pokazać').toBe(false);
  expect(po.alertTresc).toContain('Nie udało się odświeżyć listy');
  expect(po.alertTresc, 'z zastrzeżeniem, że dane mogą być nieaktualne')
    .toContain('ostatnią znaną wersję');
});

test('N2 — nieudane usunięcie i przypięcie mówią, co się stało', async ({ page }) => {
  await otworz(page);
  await page.evaluate(() => { window.confirm = () => true; });

  // Usuwanie
  await page.evaluate(() => {
    window.__rm = window.VildaVault.removeNote;
    window.VildaVault.removeNote = async () => { throw new Error('brak miejsca w magazynie'); };
  });
  await page.evaluate(() => document.querySelector('.note-act--danger').click());
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !!(a && a.getClientRects().length);
  }, null, { timeout: 20000 });

  const poUsuwaniu = await stan(page);
  expect(poUsuwaniu.karty, 'notatka nie zniknęła — i słusznie, bo zapis się nie udał').toBe(3);
  expect(poUsuwaniu.alertTresc).toContain('Nie udało się usunąć notatki');
  expect(poUsuwaniu.alertTresc, 'z powodem awarii').toContain('brak miejsca w magazynie');
  expect(poUsuwaniu.alertTresc, 'i z informacją, że notatka jest bezpieczna')
    .toContain('została na miejscu');

  // Przypinanie
  await page.evaluate(() => {
    window.VildaVault.removeNote = window.__rm;
    window.__save = window.VildaVault.saveNote;
    window.VildaVault.saveNote = async () => { throw new Error('zapis odrzucony'); };
  });
  await page.evaluate(() => document.querySelector('.note-pin').click());
  await page.waitForFunction(
    () => /przypi/i.test((document.querySelector('.notes-alert__body') || {}).textContent || ''),
    null, { timeout: 20000 },
  );
  const poPinie = await stan(page);
  expect(poPinie.alertTresc).toContain('Nie udało się przypiąć notatki');
  expect(poPinie.alertTresc).toContain('zapis odrzucony');

  // Komunikat da się zamknąć i znika sam po udanej operacji.
  await page.evaluate(() => { window.VildaVault.saveNote = window.__save; });
  await page.evaluate(() => document.querySelector('.note-pin').click());
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !(a && a.getClientRects().length);
  }, null, { timeout: 20000 });
  expect((await stan(page)).alertWidoczny, 'udana operacja sprząta po poprzednim błędzie').toBe(false);
});

test('N3 — wyszukiwarka znosi polskie znaki diakrytyczne w obie strony', async ({ page }) => {
  await otworz(page);
  await page.evaluate(async () => {
    await window.VildaVault.saveNote({ title: 'Żołądek — opis USG', category: 'badanie', body: 'ściana żołądka' });
    await window.VildaVault.saveNote({ title: 'Łokieć tenisisty', category: 'wywiad', body: 'ból przy zgięciu' });
  });
  await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 5,
    null, { timeout: 20000 });

  const szukaj = async (fraza) => {
    await page.evaluate((f) => {
      const s = document.getElementById('notesSearch');
      s.value = f;
      s.dispatchEvent(new Event('input'));
    }, fraza);
    await page.waitForTimeout(300);
    return page.evaluate(() => Array.from(document.querySelectorAll('.note-card__title'))
      .map((e) => e.textContent));
  };

  // Zapytanie bez ogonków trafia w tytuł z ogonkami…
  expect(await szukaj('zoladek'), 'zoladek → Żołądek').toEqual(['Żołądek — opis USG']);
  expect(await szukaj('lokiec'), 'lokiec → Łokieć (ł nie rozkłada się przez NFD)')
    .toEqual(['Łokieć tenisisty']);
  // …i w treść, nie tylko w tytuł.
  expect(await szukaj('sciana'), 'sciana → „ściana żołądka" w treści').toEqual(['Żołądek — opis USG']);
  // Wielkość liter bez znaczenia, tak jak dotąd.
  expect(await szukaj('ZOLADEK'), 'wersaliki bez ogonków też').toEqual(['Żołądek — opis USG']);
  // Zapytanie Z ogonkami nadal działa — poprawka nie może zepsuć drogi, która działała.
  expect(await szukaj('żołądek'), 'pisownia poprawna nadal trafia').toEqual(['Żołądek — opis USG']);
  // Kontrola negatywna: normalizacja nie może zlepiać różnych słów.
  expect(await szukaj('zoladeq'), 'fraza bez trafień nadal nie ma trafień').toEqual([]);
});

test('N4 — „+ Nowa notatka" znika tam, gdzie i tak nic by nie zrobił', async ({ page }) => {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/notatki.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));

  const przycisk = () => page.evaluate(() => {
    const b = document.getElementById('notesNewBtn');
    return { widoczny: !!(b && b.getClientRects().length), tytulPustego: (document.querySelector('.notes-empty__title') || {}).textContent || null };
  });

  // Stan 1: brak konta — pełnoekranowy panel „Zaloguj się" ma własny komunikat, przycisk był ozdobą.
  await page.waitForFunction(() => /Zaloguj si/.test(document.body.textContent), null, { timeout: 20000 });
  expect(await przycisk(), 'bez konta').toMatchObject({
    widoczny: false, tytulPustego: 'Zaloguj się, aby zobaczyć notatki',
  });

  // Stan 2: konto jest, PRO nie ma — panel ma własne „Zobacz plan PRO", więc martwy przycisk zbędny.
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForFunction(() => /funkcja Vilda PRO/.test(document.body.textContent),
    null, { timeout: 20000 });
  expect(await przycisk(), 'bez PRO').toMatchObject({
    widoczny: false, tytulPustego: 'Notatki to funkcja Vilda PRO',
  });

  // Stan 3: PRO włączone — przycisk wraca i NAPRAWDĘ otwiera edytor.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => {
    const b = document.getElementById('notesNewBtn');
    return !!(b && b.getClientRects().length);
  }, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('notesNewBtn').click());
  await page.waitForFunction(
    () => document.getElementById('noteEditorOverlay').classList.contains('is-open'),
    null, { timeout: 20000 },
  );
});

// ---------------------------------------------------------------- rata 1 (R1a + R2)
//
// R1a — sekcja NIE reagowała na synchronizację. Sejf przy scalaniu pisze notatki wprost przez
//       putNoteForUser i nie woła rozgłaszacza, a `onNoteChanged` odpala się tylko przy zmianach
//       LOKALNYCH; nasłuchu `vilda:sync-merged` w tym pliku nie było wcale (sześć innych plików
//       produkcyjnych go ma). ZMIERZONE licznikiem wywołań listNotes(): scalenie → 0 odświeżeń,
//       zapis lokalny → 1. Skutek dla lekarza: szablon dodany na telefonie nie pojawiał się na
//       komputerze do przeładowania strony, zmieniony pokazywał starą treść, skasowany wisiał.
// R2  — baner o danych osobowych był pokazywany przy starcie i chowany tylko w stanie bez PRO.
//       W stanie bez konta zostawał widoczny, a jego krzyżyk zapisuje localStorage NA STAŁE —
//       dawało się skasować jedyne ostrzeżenie o danych osobowych z ekranu logowania, zanim się
//       w ogóle zobaczyło bibliotekę. Decyzja właściciela: „zamknięte znaczy zamknięte", więc
//       klucza NIE bumpujemy — naprawiamy tylko to, żeby nie dało się go zamknąć przed czasem.

// Licznik odczytów sejfu: pokazuje, czy strona w ogóle PRÓBUJE się odświeżyć. Zerowany dopiero
// wtedy, gdy odczyty ucichną — bootstrap sekcji ma jednorazową ankietę co 250 ms (`setInterval`
// w `C()`), która po odblokowaniu sejfu robi jedno dodatkowe `listNotes()` i dopiero wtedy kasuje
// interwał. Zerowanie licznika „na sztywno" zaraz po `otworz()` łapało to wywołanie jako rzekome
// odświeżenie po scaleniu — na nieobciążonej maszynie zmierzone jako czerwone w 1 przebiegu na 3.
async function licznikOdczytow(page) {
  await page.evaluate(() => {
    window.__n = 0;
    const oryg = window.VildaVault.listNotes;
    window.VildaVault.listNotes = async function () { window.__n += 1; return oryg.apply(this, arguments); };
  });
  let ostatni = -1;
  for (let i = 0; i < 25; i += 1) {
    const teraz = await page.evaluate(() => window.__n);
    if (teraz === ostatni) break;
    ostatni = teraz;
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { window.__n = 0; });
}

test('R1a — lista odświeża się po scaleniu synchronizacji, bez przeładowania strony', async ({ page }) => {
  await otworz(page);

  await licznikOdczytow(page);

  // Zdarzenie leci na document — tak rozgłasza je integracja synchronizacji.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false })));
  await page.waitForFunction(() => window.__n >= 1, null, { timeout: 20000 });
  expect(await page.evaluate(() => window.__n), 'scalenie odświeża listę').toBeGreaterThanOrEqual(1);

  // Dławik 250 ms (wzorzec Ag() z Terminarza): seria scaleń nie robi serii odczytów sejfu.
  await page.waitForTimeout(400);
  const przedSeria = await page.evaluate(() => window.__n);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i += 1) {
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    }
  });
  await page.waitForTimeout(900);
  const poSerii = await page.evaluate(() => window.__n);
  expect(poSerii - przedSeria, 'pięć scaleń pod rząd to jedno odświeżenie, nie pięć').toBe(1);
});

test('R1a — scalenie przy otwartym edytorze nie rusza listy, ale odświeża po jego zamknięciu', async ({ page }) => {
  // Najgorszy scenariusz tej poprawki: lekarz pisze treść szablonu, a przerysowanie listy pod
  // nakładką kasuje mu wpisany tekst. Odświeżenie jest więc ODKŁADANE do zamknięcia edytora.
  await otworz(page);
  await licznikOdczytow(page);

  await page.evaluate(() => document.getElementById('notesNewBtn').click());
  await page.waitForFunction(
    () => document.getElementById('noteEditorOverlay').classList.contains('is-open'),
    null, { timeout: 20000 },
  );
  await page.evaluate(() => { document.getElementById('noteFieldBody').value = 'niezapisany tekst'; });

  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false })));
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__n), 'przy otwartym edytorze lista stoi').toBe(0);
  expect(
    await page.evaluate(() => document.getElementById('noteFieldBody').value),
    'niezapisany tekst przeżywa scalenie',
  ).toBe('niezapisany tekst');

  // Zamknięcie edytora domyka odłożone odświeżenie.
  await page.evaluate(() => document.getElementById('noteEditorCancel').click());
  await page.waitForFunction(() => window.__n >= 1, null, { timeout: 20000 });
});

test('R2 — baner o danych osobowych jest funkcją stanu bramek', async ({ page }) => {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/notatki.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));

  const baner = () => page.evaluate(() => {
    const e = document.getElementById('notesPiiNotice');
    const x = document.getElementById('notesPiiClose');
    return {
      widoczny: !!(e && e.getClientRects().length),
      krzyzykOsiagalny: !!(x && x.getClientRects().length),
    };
  });

  // Stan 1: brak konta. Krzyżyk zapisuje localStorage NA STAŁE, więc tutaj nie wolno go pokazywać.
  await page.waitForFunction(() => /Zaloguj si/.test(document.body.textContent), null, { timeout: 20000 });
  expect(await baner(), 'bez konta: nie da się skasować ostrzeżenia, którego jeszcze nie było po co czytać')
    .toMatchObject({ widoczny: false, krzyzykOsiagalny: false });

  // Stan 2: konto jest, PRO nie ma.
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForFunction(() => /funkcja Vilda PRO/.test(document.body.textContent), null, { timeout: 20000 });
  expect(await baner(), 'bez PRO również nie').toMatchObject({ widoczny: false });

  // Stan 3: PRO włączone w trakcie sesji — baner wraca sam, bez przeładowania strony.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => {
    const e = document.getElementById('notesPiiNotice');
    return !!(e && e.getClientRects().length);
  }, null, { timeout: 20000 });

  // Zamknięcie działa i JEST TRWAŁE — decyzja właściciela „zamknięte znaczy zamknięte".
  await page.evaluate(() => document.getElementById('notesPiiClose').click());
  await page.waitForFunction(() => {
    const e = document.getElementById('notesPiiNotice');
    return !(e && e.getClientRects().length);
  }, null, { timeout: 20000 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaProAccess));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForTimeout(1200);
  expect((await baner()).widoczny, 'raz zamknięty zostaje zamknięty także po przeładowaniu').toBe(false);
});

// R3 — przycisk „Kopiuj" (`j()`) kopiował `e.body||""`, a zielone „Skopiowano" zapalał BEZWARUNKOWO.
//      Zmierzone: notatka z samym tytułem wpisywała do schowka pusty ciąg, a przycisk meldował
//      sukces. Drugi wariant: `.catch(function(){})` — odmowa dostępu do schowka (polityka
//      przeglądarki, brak gestu, tryb prywatny) kończyła się CAŁKOWITĄ ciszą.

const kliknijKopiuj = (page, tytul) => page.evaluate((t) => {
  const karta = Array.prototype.slice.call(document.querySelectorAll('.note-card'))
    .find((k) => (k.querySelector('.note-card__title') || {}).textContent === t);
  if (!karta) throw new Error('nie ma karty o tytule ' + t);
  karta.querySelector('.note-act--copy').click();
}, tytul);

const etykietaKopiuj = (page, tytul) => page.evaluate((t) => {
  const karta = Array.prototype.slice.call(document.querySelectorAll('.note-card'))
    .find((k) => (k.querySelector('.note-card__title') || {}).textContent === t);
  const b = karta && karta.querySelector('.note-act--copy');
  return b ? { tekst: b.textContent.trim(), zielony: b.classList.contains('is-done') } : null;
}, tytul);

test('R3a — „Kopiuj" oddaje treść notatki, a przy samym tytule nie wysyła pustki', async ({ page }) => {
  await otworz(page);
  await page.evaluate(async () => {
    await window.VildaVault.saveNote({ title: 'Sam tytuł', category: 'wlasne', body: '' });
    window.__kopie = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__kopie.push(t); return Promise.resolve(); } },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('.note-card').length === 4,
    null, { timeout: 20000 });

  // Kontrola dodatnia: notatka z treścią kopiuje treść — tego zachowania poprawka nie rusza.
  await kliknijKopiuj(page, 'Opis USG tarczycy');
  await page.waitForFunction(() => window.__kopie.length === 1, null, { timeout: 20000 });
  expect(await page.evaluate(() => window.__kopie[0])).toBe('treść A');
  expect(await etykietaKopiuj(page, 'Opis USG tarczycy')).toMatchObject({ tekst: 'Skopiowano', zielony: true });

  // Właściwe znalezisko: przed poprawką do schowka szedł pusty ciąg, a przycisk i tak świecił.
  await kliknijKopiuj(page, 'Sam tytuł');
  await page.waitForFunction(() => window.__kopie.length === 2, null, { timeout: 20000 });
  const drugi = await page.evaluate(() => window.__kopie[1]);
  expect(drugi, 'schowek nie dostaje pustki').not.toBe('');
  expect(drugi, 'przy braku treści kopiujemy tytuł — to cała zawartość notatki').toBe('Sam tytuł');
});

test('R3b — odmowa dostępu do schowka przestaje być cicha', async ({ page }) => {
  await otworz(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('brak zgody na schowek')) },
    });
  });

  await kliknijKopiuj(page, 'Opis USG tarczycy');
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !!(a && a.getClientRects().length);
  }, null, { timeout: 20000 });

  const po = await stan(page);
  expect(po.alertTresc, 'użytkownik dowiaduje się, że kopiowanie padło')
    .toContain('Nie udało się skopiować notatki');
  expect(po.alertTresc, 'wraz z powodem od przeglądarki').toContain('brak zgody na schowek');
  expect(await etykietaKopiuj(page, 'Opis USG tarczycy'),
    'i na pewno nie widzi zielonego „Skopiowano"').toMatchObject({ tekst: 'Kopiuj', zielony: false });
});

// R5 — zapis notatki skasowanej w międzyczasie na innym urządzeniu WSKRZESZAŁ ją bez słowa.
//      `saveNote()` kasuje tombstone bezwarunkowo, więc szablon wracał, a kasowanie z drugiego
//      urządzenia było cofane — po cichu. Zmierzone wcześniej: 3 notatki → 4 po zapisie.
//      Decyzja właściciela: nie blokujemy zapisu, tylko mówimy po fakcie, co się stało.

const idNotatki = (page, tytul) => page.evaluate(async (t) => {
  const lista = await window.VildaVault.listNotes();
  const n = lista.find((x) => x.title === t);
  return n ? n.id : null;
}, tytul);

const kliknijEdytuj = (page, tytul) => page.evaluate((t) => {
  const karta = Array.prototype.slice.call(document.querySelectorAll('.note-card'))
    .find((k) => (k.querySelector('.note-card__title') || {}).textContent === t);
  if (!karta) throw new Error('nie ma karty o tytule ' + t);
  Array.prototype.slice.call(karta.querySelectorAll('.note-act'))
    .find((b) => /Edytuj/.test(b.textContent)).click();
}, tytul);

test('R5 — wskrzeszenie szablonu skasowanego na innym urządzeniu przestaje być ciche', async ({ page }) => {
  await otworz(page);
  const id = await idNotatki(page, 'Opis USG tarczycy');
  expect(id, 'notatka do edycji istnieje').toBeTruthy();

  // Kontrola negatywna: zwykła edycja istniejącej notatki NIE ma prawa niczego zgłaszać.
  await kliknijEdytuj(page, 'Opis USG tarczycy');
  await page.waitForFunction(
    () => document.getElementById('noteEditorOverlay').classList.contains('is-open'),
    null, { timeout: 20000 },
  );
  await page.evaluate(() => { document.getElementById('noteFieldBody').value = 'treść A poprawiona'; });
  await page.evaluate(() => document.getElementById('noteEditorSave').click());
  await page.waitForFunction(
    () => !document.getElementById('noteEditorOverlay').classList.contains('is-open'),
    null, { timeout: 20000 },
  );
  await page.waitForTimeout(600);
  expect((await stan(page)).alertWidoczny, 'zwykła edycja milczy').toBe(false);

  // Właściwy scenariusz: lekarz otwiera szablon do edycji, a w tym czasie z drugiego urządzenia
  // przychodzi jego skasowanie. Rekord znika z sejfu, zostaje tombstone — dokładnie to zostawia
  // po sobie scalenie. Zapis kasuje tombstone i szablon wraca.
  await kliknijEdytuj(page, 'Opis USG tarczycy');
  await page.waitForFunction(
    () => document.getElementById('noteEditorOverlay').classList.contains('is-open'),
    null, { timeout: 20000 },
  );
  await page.evaluate(async (noteId) => window.VildaVault.removeNote(noteId), id);
  await page.evaluate(() => { document.getElementById('noteFieldBody').value = 'treść dopisana po skasowaniu'; });
  await page.evaluate(() => document.getElementById('noteEditorSave').click());

  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !!(a && a.getClientRects().length);
  }, null, { timeout: 20000 });

  const po = await stan(page);
  expect(po.alertTresc, 'użytkownik wie, że zapis cofnął cudze skasowanie')
    .toContain('skasowana na innym urządzeniu');
  expect(po.alertTresc, 'i wie, co z tym zrobić').toContain('skasuj ją ponownie');
  expect(po.karty, 'szablon faktycznie wrócił na listę').toBe(3);

  // Pułapka wdrożeniowa: `l()` przy każdym sukcesie kasuje pasek, a nasłuch synchronizacji woła
  // `l()`. Komunikat musi więc mieszkać w stanie i wracać przy renderze, inaczej znika w ułamku
  // sekundy po pierwszym scaleniu.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false })));
  await page.waitForTimeout(900);
  expect((await stan(page)).alertWidoczny, 'komunikat przeżywa odświeżenie po scaleniu').toBe(true);

  // Zamknięcie krzyżykiem jest ostateczne — komunikat nie wraca przy kolejnym renderze listy.
  await page.evaluate(() => document.getElementById('notesAlertClose').click());
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !(a && a.getClientRects().length);
  }, null, { timeout: 20000 });
  await page.evaluate(() => {
    const s = document.getElementById('notesSearch');
    s.value = 'usg';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  expect((await stan(page)).alertWidoczny, 'zamknięty komunikat nie wraca przy renderze').toBe(false);
});

test('R6 — pasek komunikatów znika razem z biblioteką w stanach bramkowanych', async ({ page }) => {
  // Ta sama klasa co R2: pasek wisiał nad panelem logowania, bo bramki go nie chowały.
  await otworz(page);
  await page.evaluate(() => {
    window.VildaVault.listNotes = async () => { throw new Error('sejf niedostępny'); };
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => {
    const a = document.getElementById('notesAlert');
    return !!(a && a.getClientRects().length);
  }, null, { timeout: 20000 });

  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => false;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'free' } }));
  });
  await page.waitForFunction(() => /funkcja Vilda PRO/.test(document.body.textContent),
    null, { timeout: 20000 });
  expect((await stan(page)).alertWidoczny, 'pasek nie wisi nad panelem bramki').toBe(false);
});
