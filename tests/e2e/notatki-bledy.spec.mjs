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
// Oba testy podmieniają wyłącznie metodę sejfu, żeby wywołać awarię; cała ścieżka renderowania
// i obsługi zdarzeń jest prawdziwa.

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
