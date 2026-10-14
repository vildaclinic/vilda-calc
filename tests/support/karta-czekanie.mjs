import { expect } from '@playwright/test';

/**
 * Bramki DOM Karty Pacjenta — dla sekcji, które renderują się LENIWIE i ASYNCHRONICZNIE.
 *
 * DLACZEGO TO JEST OSOBNY MODUŁ. Sekcja „Historia" nie istnieje, dopóki lekarz nie kliknie
 * zakładki: dopiero wtedy karta woła `renderTimelineSection` (`Xl` w `vilda_auth_ui.js`).
 * Sam render jest asynchroniczny — zanim dołoży listę wpisów, czeka na odczyty sejfu
 * (`listPatientTimelineEvents`, `getPatient`; do LAB-HISTORIA PR2 także na wykres trendu badań). Przełączenie zakładki
 * jest natomiast NATYCHMIASTOWE: kontener `[data-tab="timeline"]` przestaje być ukryty od
 * razu, jeszcze pusty. Bramka postawiona na samym kontenerze przepuszcza więc odczyt DOM
 * przed renderem.
 *
 * Zmierzone (2026-09-19, desktop-chromium): przy sztucznym opóźnieniu `listPatientTimelineEvents`
 * o 1,2 s — czyli tym, co robi obciążona maszyna przy 6 workerach — goły `page.evaluate` po
 * bramce na kontenerze zwracał `[]` zamiast trzech tytułów. Dokładnie to zobaczył pełny
 * przebieg `karta-pacjenta-notatki-historia.spec.mjs`: „Expected: 3, Received: 0".
 * Bramka na `.vilda-patient-timeline-list` — elemencie dokładanym PO wszystkich odczytach
 * sejfu — w tym samym pomiarze zwracała komplet trzech tytułów.
 *
 * Asercje `expect(locator)` ponawiają się same, więc tam bramka nie jest potrzebna. Jest
 * potrzebna wszędzie tam, gdzie test czyta DOM samodzielnie (`page.evaluate`) albo klika
 * element, który pojawia się WCZEŚNIEJ niż reszta sekcji — filtry kategorii Historii są
 * dokładane przed listą wpisów, a ich obsługa kliknięcia sięga po listę, której jeszcze nie ma.
 */

/** Kontener zakładki „Historia" w otwartej Karcie Pacjenta. */
export const sekcjaHistorii = (page) => page.locator('.vilda-patient-tab-content[data-tab="timeline"]');

/** Czeka, aż zakładka „Historia" faktycznie się wyrenderuje — lista wpisów jest w DOM. */
export async function czekajNaHistorie(page) {
  await expect(sekcjaHistorii(page), 'zakładka Historia jest na wierzchu').toBeVisible();
  await expect(
    sekcjaHistorii(page).locator('.vilda-patient-timeline-list'),
    'Historia renderuje się leniwie — lista wpisów powstaje dopiero po odczytach sejfu',
  ).toBeVisible();
}

/** Kontener zakładki „Badania" (LAB-HISTORIA PR2) w otwartej Karcie Pacjenta. */
export const sekcjaBadan = (page) => page.locator('.vilda-patient-tab-content[data-tab="lab"]');

/**
 * Czeka, aż zakładka „Badania" skończy odczyty sejfu (serie, notatki, leczenie, konwerter) i narysuje
 * widok. Klasa `.vilda-lab-hist-ready` i `aria-busy="false"` pojawiają się dopiero po wszystkich odczytach,
 * także w stanach pustym, błędu i sejfu zablokowanego (vilda_lab_history_tab.js).
 */
export async function czekajNaBadania(page) {
  await expect(sekcjaBadan(page), 'zakładka Badania jest na wierzchu').toBeVisible();
  const widok = sekcjaBadan(page).locator('.vilda-lab-hist');
  await expect(widok, 'Badania renderują się leniwie — widok jest gotowy po odczytach sejfu').toHaveClass(/vilda-lab-hist-ready/);
  await expect(widok).toHaveAttribute('aria-busy', 'false');
}
