import { expect } from '@playwright/test';

/**
 * Czekanie na stan sejfu — po stronie Node, nigdy przez page.waitForFunction z predykatem `async`.
 *
 * DLACZEGO TO JEST OSOBNY MODUŁ. Trzy pliki e2e miały bramkę w postaci
 *   page.waitForFunction(async () => (await VildaVault.listPatients()).length === n)
 * i żadna z nich NIE CZEKAŁA. Predykat `async` oddaje `Promise`, a `Promise` jest zawsze
 * prawdziwy, więc bramka przepuszcza na pierwszym sprawdzeniu. Zmierzone (2026-09-19):
 * predykat `async` zwracający ZAWSZE `false` przechodził po 341 ms, a jego synchroniczny
 * odpowiednik poprawnie czekał do timeoutu 3026 ms.
 *
 * Skutek był widoczny w pełnych przebiegach: test scalania duplikatów czytał rekord docelowy
 * w połowie scalania i widział 1 wersję zamiast 4. Sam sejf był i jest poprawny — scalanie
 * przepina wersje PRZED skasowaniem rekordu źródłowego, więc nic nie ginie.
 *
 * `expect.poll` wykonuje się w Node, gdzie `await` działa, więc tu problemu nie ma.
 * Strażnik tests/unit/straznik-bramek-testowych.test.mjs pilnuje, by wzorzec nie wrócił.
 */

const DOMYSLNY_TIMEOUT = 15000;

/** Czeka, aż sejf zgłosi dokładnie `ile` pacjentów w bazie. */
export async function czekajNaPacjentow(page, ile, opcje = {}) {
  await expect
    .poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), {
      timeout: opcje.timeout || DOMYSLNY_TIMEOUT,
      message: `sejf miał zgłosić ${ile} pacjentów`,
    })
    .toBe(ile);
}

/** Czeka, aż rekord przestanie istnieć (np. po scaleniu — to OSTATNI krok mergePatients). */
export async function czekajNaZnikniecieRekordu(page, patientId, opcje = {}) {
  await expect
    .poll(async () => page.evaluate(async (id) => Boolean(await window.VildaVault.getPatient(id)), patientId), {
      timeout: opcje.timeout || DOMYSLNY_TIMEOUT,
      message: 'rekord źródłowy miał zniknąć po scaleniu',
    })
    .toBe(false);
}
