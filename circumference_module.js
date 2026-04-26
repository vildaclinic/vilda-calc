/*
 * Moduł oceny obwodów głowy i klatki piersiowej u dzieci.
 *
 * Skrypt ocenia obwód głowy oraz obwód klatki piersiowej na podstawie
 * siatek centylowych Instytutu Matki i Dziecka (Palczewska i Niedźwiecka)
 * dla populacji polskiej. Dla obwodu głowy u noworodków i dzieci w 1. miesiącu
 * życia, gdy w danych zapisanych w aplikacji dostępny jest wiek ciążowy z modułu
 * SGA, wykorzystywane są referencje INTERGROWTH-21st.
 *
 * Algorytm interpoluje liniowo wartości po osi wieku. Centyl jest wyznaczany
 * z kolumn centylowych tabel 9–12, natomiast Z-score z interpolowanej średniej
 * i odchylenia standardowego (SD). Wygładzanie 12-stopniowe pozostaje wyłącznie
 * warstwą wizualną wykresu PDF i nie wpływa na obliczenia. Dodatkowo moduł
 * potrafi wygenerować osobny plik PDF z siatką centylową obwodu głowy lub
 * klatki piersiowej z naniesionym aktualnym punktem pomiarowym. Ta funkcja
 * jest dostępna wyłącznie w trybie Wyniki profesjonalne PRO.
 */
(function(){
  'use strict';

  // ===== Dane centylowe =====
  // Każdy wpis w tablicy zawiera wiek w latach (age) oraz wartości centylowe
  // dla obwodów (p3, p10, p25, p50, p75, p90, p97). Dane są interpolowane
  // liniowo po osi wieku przy obliczaniu centyla.

  const MONTHS = (value) => value / 12;


  function circSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'circumference-module' });
      }
      element.textContent = html;
      return true;
    } catch (error) {
      logCircWarn('circumference:html', 'Nie udało się ustawić kontrolowanego HTML.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function circClearHtml(element) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      element.textContent = '';
      return true;
    } catch (error) {
      logCircWarn('circumference:html', 'Nie udało się wyczyścić elementu.', {
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function circRestoreClonedChildren(element, snapshots, context) {
    if (!element || !Array.isArray(snapshots)) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.restoreClonedChildren === 'function') {
        return window.VildaHtml.restoreClonedChildren(element, snapshots, { context: context || 'circumference:restore-cloned-children' });
      }
      circClearHtml(element);
      snapshots.forEach(function (node) {
        if (node && typeof node.cloneNode === 'function') element.appendChild(node.cloneNode(true));
      });
      return true;
    } catch (error) {
      logCircWarn('circumference:html', 'Nie udało się odtworzyć treści przycisku.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function logCircLoggerFailure(level, message, loggingError, meta) {
    if (typeof window !== 'undefined' && window.__VILDA_DEBUG && window.console && typeof window.console.warn === 'function') {
      window.console.warn('[VildaLogger][circumference-module] Nie udało się zapisać logu diagnostycznego', {
        level,
        message,
        loggingError,
        meta: meta || null
      });
    }
  }

  function logCircError(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('circumference-module', message || 'Błąd modułu obwodów', error, meta || null);
        return;
      }
      if (typeof window.vildaLogError === 'function') {
        window.vildaLogError('circumference-module', message || 'Błąd modułu obwodów', error, meta || null);
      }
    } catch (loggingError) {
      logCircLoggerFailure('error', message || 'Błąd modułu obwodów', loggingError, meta);
    }
  }

  function logCircWarn(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.warn === 'function') {
        logger.warn('circumference-module', message || 'Ostrzeżenie modułu obwodów', error || null, meta || null);
        return;
      }
      if (typeof window.vildaLogWarn === 'function') {
        window.vildaLogWarn('circumference-module', message || 'Ostrzeżenie modułu obwodów', error || null, meta || null);
      }
    } catch (loggingError) {
      logCircLoggerFailure('warn', message || 'Ostrzeżenie modułu obwodów', loggingError, meta);
    }
  }

  function createCircRow(age, mean, sd, p3, p10, p25, p50, p75, p90, p97) {
    return { age, mean, sd, p3, p10, p25, p50, p75, p90, p97 };
  }

  /**
   * Tabela 9. Obwód głowy chłopców warszawskich w cm.
   * Wartości przepisane 1:1 z tabeli referencyjnej Palczewska i Niedźwiecka.
   */

  const HEAD_BOYS_DATA = [
    createCircRow(MONTHS(1), 37.89, 1.12, 35.7, 36.6, 37.0, 37.9, 38.7, 39.5, 40.0),
    createCircRow(MONTHS(2), 39.28, 0.98, 37.5, 38.0, 38.6, 39.3, 40.0, 40.8, 41.3),
    createCircRow(MONTHS(3), 40.88, 1.19, 38.8, 39.3, 40.0, 40.8, 41.5, 42.1, 42.8),
    createCircRow(MONTHS(4), 41.88, 1.07, 40.1, 40.7, 41.2, 42.0, 42.8, 43.3, 43.8),
    createCircRow(MONTHS(5), 43.09, 1.01, 41.4, 41.9, 42.4, 43.1, 43.8, 44.4, 45.0),
    createCircRow(MONTHS(6), 44.12, 1.04, 42.2, 42.8, 43.4, 44.0, 44.8, 45.2, 46.0),
    createCircRow(MONTHS(9), 45.85, 1.10, 43.9, 44.4, 45.0, 45.8, 46.7, 47.4, 48.2),
    createCircRow(MONTHS(12), 47.28, 1.36, 45.0, 45.8, 46.6, 47.2, 48.2, 49.1, 50.0),
    createCircRow(MONTHS(15), 47.90, 1.23, 45.7, 46.5, 47.2, 48.0, 48.8, 49.7, 50.9),
    createCircRow(MONTHS(18), 48.61, 1.28, 46.1, 47.0, 47.9, 48.5, 49.5, 50.3, 51.3),
    createCircRow(MONTHS(21), 49.08, 1.11, 46.7, 47.6, 48.3, 49.0, 50.0, 50.7, 51.7),
    createCircRow(MONTHS(24), 49.52, 1.34, 47.2, 48.0, 48.6, 49.5, 50.3, 51.3, 52.0),
    createCircRow(MONTHS(30), 50.28, 1.35, 47.7, 48.5, 49.5, 50.4, 51.3, 52.0, 52.5),
    createCircRow(MONTHS(36), 50.29, 1.31, 48.0, 48.6, 49.7, 50.5, 51.5, 52.0, 52.8),
    createCircRow(4, 51.45, 1.38, 48.9, 49.7, 50.5, 51.3, 52.2, 53.1, 54.0),
    createCircRow(5, 52.13, 1.44, 49.3, 50.2, 51.0, 51.9, 52.9, 53.7, 54.5),
    createCircRow(6, 52.32, 1.47, 49.6, 50.5, 51.4, 52.4, 53.3, 54.1, 54.9),
    createCircRow(7, 52.70, 1.41, 49.9, 50.9, 51.8, 52.8, 53.7, 54.4, 55.3),
    createCircRow(8, 52.95, 1.32, 50.3, 51.3, 52.2, 53.1, 54.0, 54.8, 55.7),
    createCircRow(9, 53.59, 1.56, 50.7, 51.6, 52.5, 53.5, 54.4, 55.2, 56.2),
    createCircRow(10, 53.77, 1.56, 51.1, 52.0, 52.9, 53.9, 54.8, 55.6, 56.6),
    createCircRow(11, 54.12, 1.45, 51.4, 52.3, 53.2, 54.3, 55.2, 56.1, 57.0),
    createCircRow(12, 54.81, 1.58, 51.8, 52.7, 53.6, 54.7, 55.6, 56.5, 57.4),
    createCircRow(13, 54.91, 1.65, 52.2, 53.1, 53.9, 55.2, 56.0, 56.9, 57.8),
    createCircRow(14, 55.46, 1.61, 52.6, 53.5, 54.3, 55.6, 56.5, 57.4, 58.3),
    createCircRow(15, 56.02, 1.53, 53.2, 54.0, 54.9, 56.0, 57.0, 57.9, 58.7),
    createCircRow(16, 56.44, 1.52, 53.7, 54.5, 55.3, 56.5, 57.5, 58.3, 59.1),
    createCircRow(17, 56.90, 1.42, 54.3, 55.0, 55.8, 56.9, 57.9, 58.7, 59.5),
    createCircRow(18, 57.00, 1.47, 54.6, 55.3, 56.0, 57.1, 58.0, 58.9, 59.7),
  ];

  /**
   * Tabela 10. Obwód głowy dziewcząt warszawskich w cm.
   * Wartości przepisane 1:1 z tabeli referencyjnej Palczewska i Niedźwiecka.
   */

  const HEAD_GIRLS_DATA = [
    createCircRow(MONTHS(1), 36.94, 1.05, 34.9, 35.7, 36.3, 37.0, 37.5, 38.3, 39.0),
    createCircRow(MONTHS(2), 38.41, 1.01, 36.4, 37.0, 37.7, 38.5, 39.1, 39.7, 40.2),
    createCircRow(MONTHS(3), 39.65, 1.05, 37.6, 38.3, 38.9, 39.8, 40.4, 41.0, 41.5),
    createCircRow(MONTHS(4), 40.93, 1.13, 38.7, 39.6, 40.3, 41.0, 41.6, 42.2, 43.0),
    createCircRow(MONTHS(5), 41.78, 1.04, 39.9, 40.4, 41.0, 41.9, 42.5, 43.2, 43.8),
    createCircRow(MONTHS(6), 42.81, 1.13, 40.7, 41.4, 42.0, 42.8, 43.4, 44.2, 45.0),
    createCircRow(MONTHS(9), 44.60, 1.05, 42.7, 43.2, 44.0, 44.5, 45.3, 46.0, 46.5),
    createCircRow(MONTHS(12), 45.71, 1.22, 43.8, 44.4, 45.0, 45.6, 46.7, 47.3, 47.8),
    createCircRow(MONTHS(15), 47.01, 1.22, 44.8, 45.4, 46.2, 46.8, 47.8, 48.4, 49.0),
    createCircRow(MONTHS(18), 47.36, 1.12, 45.3, 46.0, 46.7, 47.4, 48.3, 49.0, 49.7),
    createCircRow(MONTHS(21), 47.97, 1.31, 45.7, 46.5, 47.2, 47.9, 48.8, 49.4, 50.2),
    createCircRow(MONTHS(24), 48.21, 1.23, 46.0, 46.8, 47.4, 48.1, 49.1, 49.9, 50.6),
    createCircRow(MONTHS(30), 48.76, 1.35, 46.6, 47.3, 48.1, 48.9, 49.8, 50.5, 51.3),
    createCircRow(MONTHS(36), 49.41, 1.25, 47.0, 47.8, 48.6, 49.5, 50.1, 50.9, 52.0),
    createCircRow(4, 50.08, 1.42, 47.7, 48.4, 49.1, 50.1, 51.1, 52.0, 52.9),
    createCircRow(5, 50.98, 1.43, 48.3, 49.0, 49.7, 50.7, 51.8, 52.6, 53.5),
    createCircRow(6, 51.21, 1.45, 48.8, 49.4, 50.2, 51.1, 52.2, 53.0, 53.9),
    createCircRow(7, 51.55, 1.43, 49.2, 49.8, 50.6, 51.5, 52.6, 53.5, 54.4),
    createCircRow(8, 52.16, 1.28, 49.7, 50.3, 51.1, 52.0, 53.0, 53.9, 54.8),
    createCircRow(9, 52.38, 1.39, 50.1, 50.8, 51.5, 52.5, 53.5, 54.4, 55.2),
    createCircRow(10, 52.94, 1.45, 50.5, 51.2, 52.0, 53.0, 54.0, 54.8, 55.7),
    createCircRow(11, 53.55, 1.56, 50.9, 51.6, 52.5, 53.5, 54.5, 55.4, 56.1),
    createCircRow(12, 53.96, 1.52, 51.4, 52.1, 53.0, 54.0, 55.0, 55.9, 56.6),
    createCircRow(13, 54.24, 1.26, 51.8, 52.6, 53.5, 54.4, 55.4, 56.2, 56.9),
    createCircRow(14, 54.75, 1.29, 52.1, 53.0, 53.9, 54.7, 55.7, 56.5, 57.2),
    createCircRow(15, 54.99, 1.44, 52.3, 53.2, 54.0, 54.9, 55.8, 56.7, 57.4),
    createCircRow(16, 54.89, 1.51, 52.4, 53.3, 54.1, 55.0, 55.9, 56.8, 57.5),
    createCircRow(17, 55.01, 1.35, 52.5, 53.4, 54.2, 55.1, 56.0, 56.8, 57.5),
    createCircRow(18, 55.07, 1.29, 52.6, 53.4, 54.2, 55.1, 56.0, 56.8, 57.5),
  ];

  /**
   * Tabela 11. Obwód klatki piersiowej chłopców warszawskich w cm.
   * Wartości przepisane 1:1 z tabeli referencyjnej Palczewska i Niedźwiecka.
   */

  const CHEST_BOYS_DATA = [
    createCircRow(MONTHS(1), 37.00, 1.77, 34.0, 35.0, 35.8, 37.0, 38.3, 39.2, 40.0),
    createCircRow(MONTHS(2), 39.37, 1.53, 36.6, 37.3, 38.2, 39.3, 40.3, 41.5, 42.3),
    createCircRow(MONTHS(3), 40.57, 1.74, 37.9, 38.8, 39.5, 40.8, 42.0, 42.8, 43.4),
    createCircRow(MONTHS(4), 41.70, 1.75, 39.0, 39.9, 41.0, 41.9, 42.9, 44.0, 45.1),
    createCircRow(MONTHS(5), 42.87, 1.58, 39.8, 40.9, 41.8, 42.9, 44.1, 44.9, 46.0),
    createCircRow(MONTHS(6), 43.83, 1.82, 40.8, 41.6, 42.6, 43.7, 44.7, 45.9, 47.0),
    createCircRow(MONTHS(9), 45.60, 2.00, 42.5, 43.2, 44.2, 45.5, 47.0, 48.3, 49.2),
    createCircRow(MONTHS(12), 47.08, 2.17, 43.6, 44.4, 45.5, 47.0, 48.4, 49.6, 50.8),
    createCircRow(MONTHS(15), 47.88, 1.82, 44.7, 45.5, 46.7, 47.9, 49.3, 50.3, 51.6),
    createCircRow(MONTHS(18), 48.82, 2.23, 45.5, 46.5, 47.7, 48.8, 50.0, 51.2, 52.6),
    createCircRow(MONTHS(21), 49.55, 1.78, 46.0, 47.2, 48.4, 49.4, 50.6, 51.9, 53.4),
    createCircRow(MONTHS(24), 49.96, 2.51, 46.6, 47.7, 49.0, 50.0, 51.2, 52.6, 54.0),
    createCircRow(MONTHS(30), 50.76, 2.14, 47.4, 48.5, 49.5, 50.5, 52.1, 53.5, 54.8),
    createCircRow(MONTHS(36), 51.40, 2.28, 48.0, 49.0, 50.0, 51.0, 53.0, 54.9, 56.0),
    createCircRow(4, 53.01, 2.52, 49.2, 50.3, 51.3, 53.0, 54.8, 56.1, 57.8),
    createCircRow(5, 55.33, 2.73, 50.8, 52.0, 53.0, 55.0, 56.5, 58.6, 60.8),
    createCircRow(6, 56.75, 3.68, 52.0, 53.2, 54.4, 56.4, 58.6, 61.1, 64.1),
    createCircRow(7, 58.53, 2.95, 53.3, 54.6, 56.0, 58.1, 60.4, 63.6, 68.5),
    createCircRow(8, 60.87, 5.43, 54.4, 55.9, 57.7, 59.8, 62.6, 67.4, 73.4),
    createCircRow(9, 63.86, 5.52, 55.7, 57.6, 59.6, 62.1, 65.6, 71.2, 78.0),
    createCircRow(10, 65.82, 6.21, 57.1, 59.3, 61.6, 64.6, 68.6, 74.8, 82.1),
    createCircRow(11, 67.90, 6.28, 59.1, 61.5, 63.9, 67.0, 72.0, 78.2, 85.3),
    createCircRow(12, 72.07, 6.66, 61.0, 63.4, 66.4, 70.2, 75.4, 81.3, 88.0),
    createCircRow(13, 74.32, 7.58, 62.8, 65.5, 69.1, 73.1, 78.3, 84.3, 90.6),
    createCircRow(14, 75.91, 8.24, 65.1, 68.4, 72.0, 76.2, 81.1, 86.6, 92.6),
    createCircRow(15, 80.15, 7.09, 68.2, 71.8, 75.6, 79.4, 83.6, 88.6, 94.1),
    createCircRow(16, 82.61, 5.61, 71.9, 75.8, 78.8, 82.4, 86.2, 90.3, 95.4),
    createCircRow(17, 85.33, 4.74, 76.1, 78.6, 81.5, 84.8, 88.2, 91.8, 96.4),
    createCircRow(18, 86.28, 5.75, 77.3, 80.0, 82.9, 86.0, 89.5, 93.2, 97.3),
  ];

  /**
   * Tabela 12. Obwód klatki piersiowej dziewcząt warszawskich w cm.
   * Wartości przepisane 1:1 z tabeli referencyjnej Palczewska i Niedźwiecka.
   */

  const CHEST_GIRLS_DATA = [
    createCircRow(MONTHS(1), 36.15, 1.50, 33.0, 34.4, 35.1, 36.2, 37.0, 38.0, 38.8),
    createCircRow(MONTHS(2), 38.10, 1.57, 35.0, 36.2, 37.1, 38.0, 39.0, 40.0, 41.0),
    createCircRow(MONTHS(3), 39.29, 1.60, 36.4, 37.3, 38.2, 39.4, 40.4, 41.5, 42.2),
    createCircRow(MONTHS(4), 40.50, 1.76, 37.7, 38.5, 39.5, 40.8, 41.8, 42.6, 43.6),
    createCircRow(MONTHS(5), 41.51, 1.80, 38.7, 39.7, 40.7, 41.7, 42.6, 43.7, 44.9),
    createCircRow(MONTHS(6), 42.81, 1.13, 39.8, 40.8, 41.7, 42.5, 43.5, 44.6, 45.7),
    createCircRow(MONTHS(9), 44.49, 1.84, 41.2, 42.3, 43.3, 44.4, 45.7, 46.9, 48.0),
    createCircRow(MONTHS(12), 45.76, 2.21, 42.1, 43.4, 44.5, 45.8, 47.0, 48.5, 50.0),
    createCircRow(MONTHS(15), 47.09, 2.29, 43.0, 44.4, 45.5, 47.0, 48.4, 49.7, 51.0),
    createCircRow(MONTHS(18), 47.54, 2.49, 43.5, 45.0, 46.2, 47.7, 49.1, 50.5, 52.0),
    createCircRow(MONTHS(21), 48.30, 2.17, 44.0, 45.5, 46.8, 48.3, 49.5, 51.0, 52.5),
    createCircRow(MONTHS(24), 48.52, 2.18, 44.8, 46.0, 47.2, 48.5, 50.0, 51.2, 52.5),
    createCircRow(MONTHS(30), 49.09, 2.09, 45.9, 46.7, 47.5, 48.8, 50.2, 51.7, 52.7),
    createCircRow(MONTHS(36), 50.30, 2.03, 47.0, 47.6, 49.0, 50.5, 51.7, 53.0, 54.2),
    createCircRow(4, 52.07, 2.51, 48.0, 49.2, 50.3, 51.9, 53.4, 55.4, 57.3),
    createCircRow(5, 53.92, 3.46, 49.3, 50.3, 51.8, 53.5, 55.4, 57.6, 59.6),
    createCircRow(6, 55.29, 3.22, 50.4, 51.7, 53.3, 55.3, 57.5, 59.7, 63.0),
    createCircRow(7, 58.01, 4.86, 51.6, 53.1, 54.9, 56.9, 59.6, 62.4, 67.2),
    createCircRow(8, 59.66, 5.18, 52.8, 54.4, 56.3, 58.6, 62.0, 65.4, 71.2),
    createCircRow(9, 61.43, 5.82, 54.4, 56.0, 58.0, 60.7, 64.6, 68.8, 75.0),
    createCircRow(10, 64.68, 5.95, 56.0, 58.0, 60.0, 63.2, 67.5, 72.0, 77.5),
    createCircRow(11, 66.63, 6.03, 57.8, 60.0, 62.0, 65.5, 70.5, 75.0, 79.8),
    createCircRow(12, 69.15, 6.60, 59.6, 62.0, 64.6, 68.0, 73.0, 77.6, 81.7),
    createCircRow(13, 70.79, 5.67, 61.6, 64.4, 67.0, 70.0, 74.3, 79.2, 83.0),
    createCircRow(14, 72.65, 6.05, 63.6, 66.2, 68.6, 71.6, 75.3, 80.1, 84.6),
    createCircRow(15, 72.56, 5.22, 65.0, 67.4, 69.8, 72.4, 76.0, 80.8, 85.5),
    createCircRow(16, 73.78, 5.04, 66.2, 68.5, 70.6, 73.2, 76.5, 81.4, 86.2),
    createCircRow(17, 74.46, 5.71, 67.2, 69.0, 71.2, 73.8, 77.0, 81.8, 86.6),
    createCircRow(18, 75.12, 6.02, 67.5, 69.2, 71.6, 74.1, 77.3, 82.0, 86.8),
  ];

  // ===== Kategorie i definicje =====
  // Każda kategoria opisuje zakres procentyli i krótko interpretuje wynik.
  const CIRC_DEFINITIONS = {
    very_low: 'Wartość poniżej 3. centyla sugeruje znacząco mniejszy obwód niż typowy dla wieku i płci. Zalecana jest konsultacja lekarska.',
    low:      'Wartość w przedziale 3.–10. centyla jest poniżej normy — wymaga obserwacji i ewentualnej powtórnej oceny.',
    normal:   'Wartość w przedziale 10.–90. centyla uznawana jest za prawidłową dla wieku i płci.',
    high:     'Wartość w przedziale 90.–97. centyla jest powyżej normy i wymaga obserwacji oraz ponownego pomiaru.',
    very_high:'Wartość powyżej 97. centyla wskazuje na znacznie większy obwód niż zwykle; zalecana jest konsultacja lekarska.'
  };

  const INTERGROWTH_Z_GRID = [-3, -2, -1, 0, 1, 2, 3];
  const CIRC_CURVES = [
    { key: 'p3',  label: '3 c',  p: 3,  z: -1.88079, color: '#d9534f', width: 2.4 },
    { key: 'p10', label: '10 c', p: 10, z: -1.28155, color: '#f0ad4e', width: 2.0 },
    { key: 'p25', label: '25 c', p: 25, z: -0.67449, color: '#7aa8c6', width: 1.8 },
    { key: 'p50', label: '50 c', p: 50, z:  0.0,     color: '#00838d', width: 3.0 },
    { key: 'p75', label: '75 c', p: 75, z:  0.67449, color: '#7aa8c6', width: 1.8 },
    { key: 'p90', label: '90 c', p: 90, z:  1.28155, color: '#f0ad4e', width: 2.0 },
    { key: 'p97', label: '97 c', p: 97, z:  1.88079, color: '#d9534f', width: 2.4 }
  ];

  const CIRC_SOURCES = {
    head: '<div class="source-note">Źródło referencyjne: siatki Instytutu Matki i Dziecka (Palczewska i Niedźwiecka) dla obwodu głowy.</div>',
    chest: '<div class="source-note">Źródło referencyjne: siatki Instytutu Matki i Dziecka (Palczewska i Niedźwiecka) dla obwodu klatki piersiowej.</div>',
    headNewborn: '<div class="source-note">Źródło referencyjne: INTERGROWTH-21st (moduł SGA) — obwód głowy u noworodków i dzieci w 1. miesiącu życia, z odniesieniem do wieku ciążowego.</div>'
  };

  /**
   * Interpoluje wiersz danych po osi wieku. Jeżeli wiek znajduje się
   * dokładnie w tabeli, zwraca istniejący wiersz. W przeciwnym razie
   * oblicza wartości centyli jako średnie ważone dwóch sąsiednich wierszy.
   * @param {Array} data Tablica wierszy dla danej płci i parametru.
   * @param {number} age Wiek dziecka w latach (liczba dziesiętna).
   * @returns {Object} Obiekt z interpolowanymi wartościami centyli.
   */
  function interpolateRow(data, age) {
    if (!data || data.length === 0) return null;
    // Jeśli wiek poza zakresem danych, przytnij do skrajnych wierszy
    if (age <= data[0].age) return data[0];
    if (age >= data[data.length - 1].age) return data[data.length - 1];
    // Znajdź sąsiednie wiersze
    for (let i = 0; i < data.length - 1; i++) {
      const rowLo = data[i];
      const rowHi = data[i + 1];
      if (age >= rowLo.age && age <= rowHi.age) {
        const t = (age - rowLo.age) / (rowHi.age - rowLo.age);
        // Zwróć interpolowany wiersz
        return {
          age: age,
          mean: rowLo.mean + t * (rowHi.mean - rowLo.mean),
          sd: rowLo.sd + t * (rowHi.sd - rowLo.sd),
          p3:  rowLo.p3  + t * (rowHi.p3  - rowLo.p3 ),
          p10: rowLo.p10 + t * (rowHi.p10 - rowLo.p10),
          p25: rowLo.p25 + t * (rowHi.p25 - rowLo.p25),
          p50: rowLo.p50 + t * (rowHi.p50 - rowLo.p50),
          p75: rowLo.p75 + t * (rowHi.p75 - rowLo.p75),
          p90: rowLo.p90 + t * (rowHi.p90 - rowLo.p90),
          p97: rowLo.p97 + t * (rowHi.p97 - rowLo.p97)
        };
      }
    }
    // Nie powinno się zdarzyć
    return data[0];
  }

  /**
   * Oblicza przybliżony centyl wprowadzanej wartości na podstawie wiersza z
   * interpolowanymi centylami. Używa liniowej interpolacji między punktami
   * odniesienia (3, 10, 25, 50, 75, 90, 97). Jeśli wartość znajduje się
   * poniżej najmniejszego punktu lub powyżej największego, zwraca odpowiednio
   * 0 lub 100.
   * @param {number} value Wprowadzony obwód (cm).
   * @param {Object} row Wiersz z interpolowanymi wartościami centyli.
   * @returns {number} Przybliżony centyl (0–100).
   */
  function computePercentile(value, row) {
    if (!row || !isFinite(value)) return NaN;
    // Zdefiniuj punkty odniesienia w rosnącym porządku
    const points = [
      {p: 3,  v: row.p3},
      {p:10,  v: row.p10},
      {p:25,  v: row.p25},
      {p:50,  v: row.p50},
      {p:75,  v: row.p75},
      {p:90,  v: row.p90},
      {p:97,  v: row.p97}
    ];
    // Wartość poniżej najmniejszego punktu — ekstrapolacja liniowa
    // na podstawie odcinka 3.–10. centyla, zamiast skalowania od zera.
    if (value <= points[0].v) {
      const first = points[0];
      const second = points[1];
      const slope = (second.p - first.p) / (second.v - first.v);
      return Math.max(0, first.p - slope * (first.v - value));
    }
    // Wartość powyżej największego punktu
    if (value >= points[points.length - 1].v) {
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      // Ekstrapolujemy liniowo powyżej 97. centyla
      const slope = (last.p - secondLast.p) / (last.v - secondLast.v);
      return Math.min(100, last.p + slope * (value - last.v));
    }
    // Szukamy przedziału, w którym znajduje się wartość
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (value >= a.v && value <= b.v) {
        const t = (value - a.v) / (b.v - a.v);
        return a.p + t * (b.p - a.p);
      }
    }
    // Jeśli nie znaleziono (nie powinno się zdarzyć)
    return NaN;
  }

  /**
   * Klasyfikuje centyl do kategorii i określa nasilenie ostrzeżenia.
   * @param {number} perc Centyl 0–100.
   * @returns {Object} Obiekt z nazwą kategorii i poziomem ostrzeżenia ('', 'warning' lub 'danger').
   */
  function classifyPercentile(perc) {
    if (!isFinite(perc)) {
      return {cat: null, severity: ''};
    }
    if (perc < 3) {
      return {cat: 'very_low', severity: 'danger'};
    } else if (perc < 10) {
      return {cat: 'low', severity: 'warning'};
    } else if (perc <= 90) {
      return {cat: 'normal', severity: ''};
    } else if (perc <= 97) {
      return {cat: 'high', severity: 'warning'};
    }
    return {cat: 'very_high', severity: 'danger'};
  }


  function formatCircNumber(value, decimals) {
    if (!isFinite(value)) return '–';
    return Number(value).toLocaleString('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function isProfessionalModeEnabled() {
    try {
      const toggle = document.getElementById('resultsModeToggle');
      if (toggle) return !!toggle.checked;
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try {
      if (typeof professionalMode !== 'undefined') return !!professionalMode;
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try {
      if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') return !!window.professionalMode;
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try {
      let stored = null;
      if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readPreferenceRaw === 'function') {
        stored = window.VildaPersistence.readPreferenceRaw('RESULTS_MODE', 'standard');
      }
      if (stored === 'professional') return true;
      if (stored === 'standard') return false;
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    return false;
  }

  function getMetricLabel(metric) {
    return metric === 'head' ? 'Obwód głowy' : 'Obwód klatki piersiowej';
  }

  function getRegularSourceHtml(metric) {
    return metric === 'head' ? CIRC_SOURCES.head : CIRC_SOURCES.chest;
  }

  function normalCdf(z) {
    if (!Number.isFinite(z)) return NaN;
    const absZ = Math.abs(z);
    const t = 1 / (1 + 0.2316419 * absZ);
    const d = 0.3989422804014327 * Math.exp(-absZ * absZ / 2);
    const poly = ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) * t + 0.319381530) * t;
    const p = 1 - d * poly;
    return z >= 0 ? p : 1 - p;
  }

  function interpolateOnSegment(value, x0, x1, y0, y1) {
    if (![value, x0, x1, y0, y1].every((entry) => Number.isFinite(entry))) return null;
    if (x0 === x1) return y0;
    return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }

  function valueFromZGrid(anchors, targetZ) {
    if (!Array.isArray(anchors) || anchors.length !== INTERGROWTH_Z_GRID.length || !Number.isFinite(targetZ)) {
      return null;
    }
    const nums = anchors.map((entry) => Number(entry));
    if (nums.some((entry) => !Number.isFinite(entry))) return null;

    if (targetZ <= INTERGROWTH_Z_GRID[0]) {
      return interpolateOnSegment(targetZ, INTERGROWTH_Z_GRID[0], INTERGROWTH_Z_GRID[1], nums[0], nums[1]);
    }
    for (let i = 0; i < INTERGROWTH_Z_GRID.length - 1; i += 1) {
      if (targetZ <= INTERGROWTH_Z_GRID[i + 1]) {
        return interpolateOnSegment(targetZ, INTERGROWTH_Z_GRID[i], INTERGROWTH_Z_GRID[i + 1], nums[i], nums[i + 1]);
      }
    }
    const last = INTERGROWTH_Z_GRID.length - 1;
    return interpolateOnSegment(targetZ, INTERGROWTH_Z_GRID[last - 1], INTERGROWTH_Z_GRID[last], nums[last - 1], nums[last]);
  }

  function zFromAnchorTable(value, anchors) {
    if (!Array.isArray(anchors) || anchors.length !== INTERGROWTH_Z_GRID.length || !Number.isFinite(value)) {
      return null;
    }
    const nums = anchors.map((entry) => Number(entry));
    if (nums.some((entry) => !Number.isFinite(entry))) return null;

    if (value <= nums[0]) {
      return interpolateOnSegment(value, nums[0], nums[1], INTERGROWTH_Z_GRID[0], INTERGROWTH_Z_GRID[1]);
    }
    for (let i = 0; i < nums.length - 1; i += 1) {
      if (value <= nums[i + 1]) {
        return interpolateOnSegment(value, nums[i], nums[i + 1], INTERGROWTH_Z_GRID[i], INTERGROWTH_Z_GRID[i + 1]);
      }
    }
    const last = nums.length - 1;
    return interpolateOnSegment(value, nums[last - 1], nums[last], INTERGROWTH_Z_GRID[last - 1], INTERGROWTH_Z_GRID[last]);
  }

  function sexToIntergrowthKey(sex) {
    return sex === 'F' || sex === 'female' ? 'female' : 'male';
  }

  function readSharedPersistSnapshot() {
    try {
      const adapter = (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readSharedPersist === 'function')
        ? window.VildaPersistence
        : null;
      if (!adapter) return null;
      return adapter.readSharedPersist({ ensurePersist: false });
    } catch (error) {
      logCircWarn('Nie udało się odczytać snapshotu persistence dla modułu obwodów', error);
      return null;
    }
  }

  function readSgaBirthPersistState() {
    const snapshot = readSharedPersistSnapshot();
    if (!snapshot) return null;
    try {
      const byId = snapshot.byId && typeof snapshot.byId === 'object' ? snapshot.byId : {};
      const radio = snapshot.radio && typeof snapshot.radio === 'object' ? snapshot.radio : {};
      const weeks = parseFloat(String(byId.sgaBirthWeeks ?? '').replace(',', '.'));
      const days = parseFloat(String(byId.sgaBirthDays ?? '').replace(',', '.'));
      const sexRaw = String(radio.sgaBirthSex || '').trim();
      if (!isFinite(weeks)) return null;
      return {
        weeks,
        days: isFinite(days) ? days : 0,
        sex: sexRaw || null,
        head: byId.sgaBirthHead != null ? String(byId.sgaBirthHead) : ''
      };
    } catch (error) {
      logCircWarn('Nie udało się odczytać stanu urodzeniowego SGA dla modułu obwodów', error);
      return null;
    }
  }

  function buildIntergrowthHeadRows(sex) {
    const sexKey = sexToIntergrowthKey(sex);
    const root = (typeof window !== 'undefined' && window.SGA_INTERGROWTH_ZS && window.SGA_INTERGROWTH_ZS[sexKey] && window.SGA_INTERGROWTH_ZS[sexKey].head)
      ? window.SGA_INTERGROWTH_ZS[sexKey].head
      : null;
    if (!root || typeof root !== 'object') return [];
    return Object.keys(root)
      .map((key) => {
        const match = String(key).match(/^(\d+)\+(\d+)$/);
        if (!match) return null;
        const weeks = Number(match[1]);
        const days = Number(match[2]);
        const x = weeks + (days / 7);
        const anchors = Array.isArray(root[key]) ? root[key] : null;
        if (!anchors) return null;
        const out = { x, key, weeks, days };
        CIRC_CURVES.forEach((curve) => {
          out[curve.key] = valueFromZGrid(anchors, curve.z);
        });
        return out;
      })
      .filter((row) => row && CIRC_CURVES.every((curve) => Number.isFinite(row[curve.key])))
      .sort((a, b) => a.x - b.x);
  }

  function getNewbornHeadAssessment(value, sex) {
    const saved = readSgaBirthPersistState();
    if (!saved || !isFinite(saved.weeks) || !isFinite(saved.days)) return null;
    const sexKey = sexToIntergrowthKey(sex);
    const root = (typeof window !== 'undefined' && window.SGA_INTERGROWTH_ZS && window.SGA_INTERGROWTH_ZS[sexKey] && window.SGA_INTERGROWTH_ZS[sexKey].head)
      ? window.SGA_INTERGROWTH_ZS[sexKey].head
      : null;
    if (!root || typeof root !== 'object') return null;
    const key = String(Math.round(saved.weeks)) + '+' + String(Math.round(saved.days));
    const anchors = Array.isArray(root[key]) ? root[key] : null;
    if (!anchors) return null;
    const zScore = zFromAnchorTable(value, anchors);
    const percentile = normalCdf(zScore) * 100;
    return {
      ok: Number.isFinite(percentile),
      metric: 'head',
      mode: 'newborn',
      sex,
      value,
      perc: percentile,
      zScore,
      cls: classifyPercentile(percentile),
      sourceHtml: `<div class="source-note">Źródło referencyjne: INTERGROWTH-21st (moduł SGA) — obwód głowy u noworodków i dzieci w 1. miesiącu życia, z odniesieniem do wieku ciążowego. Wiek ciążowy w zapisanych danych SGA: ${Math.round(saved.weeks)}+${Math.round(saved.days)} tc.</div>`,
      gaWeeks: Math.round(saved.weeks),
      gaDays: Math.round(saved.days),
      x: Math.round(saved.weeks) + (Math.round(saved.days) / 7),
      chartRows: buildIntergrowthHeadRows(sex)
    };
  }

  function buildRegularAssessment(metric, value, sex, ageYears) {
    const data = metric === 'head'
      ? (sex === 'M' ? HEAD_BOYS_DATA : HEAD_GIRLS_DATA)
      : (sex === 'M' ? CHEST_BOYS_DATA : CHEST_GIRLS_DATA);
    const row = interpolateRow(data, ageYears);
    const perc = computePercentile(value, row);
    const zScore = (row && Number.isFinite(row.mean) && Number.isFinite(row.sd) && row.sd > 0)
      ? ((value - row.mean) / row.sd)
      : NaN;
    return {
      ok: Number.isFinite(perc),
      metric,
      mode: 'regular',
      sex,
      value,
      ageYears,
      row,
      perc,
      zScore,
      cls: classifyPercentile(perc),
      sourceHtml: getRegularSourceHtml(metric)
    };
  }

  function getMetricPrompt(metric) {
    return metric === 'head'
      ? 'Wpisz obwód głowy (cm), aby zobaczyć wynik.'
      : 'Wpisz obwód klatki piersiowej (cm), aby zobaczyć wynik.';
  }

  function getCircAssessment(metric) {
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sexEl = document.getElementById('sex');
    const sex = sexEl ? sexEl.value : 'M';
    const inputEl = document.getElementById(metric === 'head' ? 'headCircumference' : 'chestCircumference');
    const value = parseFloat(inputEl?.value);

    if (!isFinite(value)) {
      return { ok: false, metric, message: getMetricPrompt(metric), reason: 'missing' };
    }
    if (!isFinite(ageYears) || ageYears < 0) {
      return { ok: false, metric, message: 'Podaj poprawny wiek, aby ocenić wynik.', reason: 'age' };
    }
    if (ageYears > 18.5) {
      return { ok: false, metric, message: 'Siatki obwodów są dostępne dla wieku do 18,5 roku życia.', reason: 'range' };
    }

    if (metric === 'head' && ageYears < HEAD_BOYS_DATA[0].age) {
      const newbornAssessment = getNewbornHeadAssessment(value, sex);
      if (newbornAssessment && newbornAssessment.ok) {
        return newbornAssessment;
      }
      return {
        ok: false,
        metric,
        message: 'Dla noworodka i dziecka w 1. miesiącu życia uzupełnij w zapisanych danych modułu SGA wiek ciążowy, aby ocenić obwód głowy wg INTERGROWTH-21st.',
        reason: 'newborn-head'
      };
    }

    if (metric === 'chest' && ageYears < CHEST_BOYS_DATA[0].age) {
      return {
        ok: false,
        metric,
        message: 'Ocena obwodu klatki piersiowej jest dostępna od 1. miesiąca życia.',
        reason: 'newborn-chest'
      };
    }

    return buildRegularAssessment(metric, value, sex, ageYears);
  }

  function setPlaceholder(el, text) {
    if (!el) return;
    clearPulse(el);
    el.className = 'result-box';
    el.classList.remove('rr-warning', 'rr-danger');
    circSetTrustedHtml(el, '<p class="circ-placeholder">' + text + '</p>', 'circumference:placeholder');
  }

  function clearMetricGlobals(metric) {
    if (typeof window === 'undefined') return;
    try {
      if (metric === 'head') {
        window.headCircPercentile = undefined;
        window.headCircSD = undefined;
      } else {
        window.chestCircPercentile = undefined;
        window.chestCircSD = undefined;
      }
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
  }

  function setMetricGlobals(metric, assessment) {
    if (typeof window === 'undefined' || !assessment || !assessment.ok) return;
    try {
      if (metric === 'head') {
        window.headCircPercentile = (typeof assessment.perc === 'number' && isFinite(assessment.perc)) ? assessment.perc : undefined;
        window.headCircSD = (typeof assessment.zScore === 'number' && isFinite(assessment.zScore)) ? assessment.zScore : undefined;
      } else {
        window.chestCircPercentile = (typeof assessment.perc === 'number' && isFinite(assessment.perc)) ? assessment.perc : undefined;
        window.chestCircSD = (typeof assessment.zScore === 'number' && isFinite(assessment.zScore)) ? assessment.zScore : undefined;
      }
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
  }

  function renderCircResult(metric, resultEl) {
    if (!resultEl) return;
    const assessment = getCircAssessment(metric);
    if (!assessment.ok) {
      clearMetricGlobals(metric);
      setPlaceholder(resultEl, assessment.message || getMetricPrompt(metric));
      return;
    }

    resultEl.className = 'result-box';
    resultEl.classList.remove('rr-warning', 'rr-danger');
    clearPulse(resultEl);

    let resultHtml = '<p><strong>' + getMetricLabel(metric) + ':</strong> ' + formatCircNumber(assessment.value, 1) + ' cm – ' + formatCircNumber(assessment.perc, 1) + '. centyl';
    if (isProfessionalModeEnabled() && isFinite(assessment.zScore)) {
      resultHtml += ' (Z‑score = ' + formatCircNumber(assessment.zScore, 2) + ')';
    }
    resultHtml += '.</p>';

    if (assessment.cls && assessment.cls.cat) {
      resultHtml += '<div class="circ-definition">' + CIRC_DEFINITIONS[assessment.cls.cat] + '</div>';
    }
    resultHtml += assessment.sourceHtml || getRegularSourceHtml(metric);
    circSetTrustedHtml(resultEl, resultHtml, 'circumference:result');
    setMetricGlobals(metric, assessment);

    if (assessment.cls && assessment.cls.severity === 'warning') {
      resultEl.classList.add('rr-warning');
      applyPulse(resultEl, true);
    } else if (assessment.cls && assessment.cls.severity === 'danger') {
      resultEl.classList.add('rr-danger');
      applyPulse(resultEl, false);
    }
  }


  const CIRC_CHART_SMOOTH_PASSES = 12;

  function triangularSmooth(arr, passes = CIRC_CHART_SMOOTH_PASSES) {
    let out = Array.isArray(arr) ? arr.slice() : [];
    const n = out.length;
    if (n < 5) return out;
    for (let pass = 0; pass < passes; pass += 1) {
      const tmp = out.slice();
      for (let i = 2; i < n - 2; i += 1) {
        const a0 = Number(out[i - 2]);
        const a1 = Number(out[i - 1]);
        const a2 = Number(out[i]);
        const a3 = Number(out[i + 1]);
        const a4 = Number(out[i + 2]);
        if ([a0, a1, a2, a3, a4].every((v) => Number.isFinite(v))) {
          tmp[i] = (a0 + (2 * a1) + (3 * a2) + (2 * a3) + a4) / 9;
        }
      }
      out = tmp;
    }
    return out;
  }

  function dedupeRowsByX(rows) {
    const out = [];
    let prevKey = null;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = Number(row && row.x);
      if (!Number.isFinite(key)) return;
      if (prevKey !== null && Math.abs(key - prevKey) < 1e-7) return;
      prevKey = key;
      out.push(row);
    });
    return out;
  }

  function smoothCircRows(rows, passes = CIRC_CHART_SMOOTH_PASSES) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const clone = rows.map((row) => Object.assign({}, row));
    CIRC_CURVES.forEach((curve) => {
      const values = clone.map((row) => Number(row[curve.key]));
      const smoothed = triangularSmooth(values, passes);
      smoothed.forEach((value, index) => {
        if (Number.isFinite(value)) clone[index][curve.key] = value;
      });
    });
    return clone;
  }

  function interpolateCircRowByX(rows, xValue) {
    if (!Array.isArray(rows) || !rows.length || !Number.isFinite(xValue)) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (xValue <= Number(first.x)) return Object.assign({}, first, { x: xValue });
    if (xValue >= Number(last.x)) return Object.assign({}, last, { x: xValue });

    for (let i = 0; i < rows.length - 1; i += 1) {
      const lo = rows[i];
      const hi = rows[i + 1];
      const x0 = Number(lo.x);
      const x1 = Number(hi.x);
      if (!Number.isFinite(x0) || !Number.isFinite(x1) || xValue < x0 || xValue > x1) continue;
      const t = x1 === x0 ? 0 : ((xValue - x0) / (x1 - x0));
      const out = { x: xValue };
      CIRC_CURVES.forEach((curve) => {
        const v0 = Number(lo[curve.key]);
        const v1 = Number(hi[curve.key]);
        out[curve.key] = (Number.isFinite(v0) && Number.isFinite(v1)) ? (v0 + (t * (v1 - v0))) : NaN;
      });
      return out;
    }
    return null;
  }

  function buildRowsInAgeRange(data, minAge, maxAge) {
    const rows = [];
    if (!Array.isArray(data) || !data.length) return rows;
    const step = 1 / 12;
    const epsilon = step / 3;
    for (let age = minAge; age <= maxAge + epsilon; age += step) {
      const x = Math.min(maxAge, Number(age.toFixed(6)));
      const row = interpolateRow(data, x);
      if (row) rows.push(Object.assign({}, row, { age: x, x }));
    }
    const first = interpolateRow(data, minAge);
    const last = interpolateRow(data, maxAge);
    if (first) rows.unshift(Object.assign({}, first, { age: minAge, x: minAge }));
    if (last) rows.push(Object.assign({}, last, { age: maxAge, x: maxAge }));
    return dedupeRowsByX(rows);
  }

  function buildNewbornChartRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const minX = Number(rows[0].x);
    const maxX = Number(rows[rows.length - 1].x);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return dedupeRowsByX(rows);
    const dense = [];
    const step = 1 / 7;
    const epsilon = step / 3;
    for (let x = minX; x <= maxX + epsilon; x += step) {
      const current = Math.min(maxX, Number(x.toFixed(6)));
      const row = interpolateCircRowByX(rows, current);
      if (row) dense.push(row);
    }
    if (dense.length && Math.abs(dense[dense.length - 1].x - maxX) > 1e-7) {
      dense.push(Object.assign({}, rows[rows.length - 1], { x: maxX }));
    }
    return dedupeRowsByX(dense.length ? dense : rows);
  }

  function getRegularChartRange(ageYears) {
    if (ageYears < 3) {
      return {
        minX: HEAD_BOYS_DATA[0].age,
        maxX: 3,
        xMode: 'months',
        xLabel: 'Wiek (miesiące)'
      };
    }
    if (ageYears < 10) {
      return {
        minX: 1,
        maxX: 10,
        xMode: 'years',
        xLabel: 'Wiek (lata)'
      };
    }
    return {
      minX: 3,
      maxX: 18.5,
      xMode: 'years',
      xLabel: 'Wiek (lata)'
    };
  }

  function getRegularChartSpec(metric, assessment) {
    const data = metric === 'head'
      ? (assessment.sex === 'M' ? HEAD_BOYS_DATA : HEAD_GIRLS_DATA)
      : (assessment.sex === 'M' ? CHEST_BOYS_DATA : CHEST_GIRLS_DATA);
    const range = getRegularChartRange(assessment.ageYears);
    const rows = buildRowsInAgeRange(data, range.minX, range.maxX);
    return {
      metric,
      title: metric === 'head' ? 'Siatka obwodu głowy' : 'Siatka obwodu klatki piersiowej',
      subtitle: 'Siatka referencyjna IMiD (Palczewska i Niedźwiecka)',
      rows,
      xMode: range.xMode,
      xLabel: range.xLabel,
      rangeMinX: range.minX,
      rangeMaxX: range.maxX,
      patientX: assessment.ageYears,
      patientY: assessment.value,
      sourceHtml: assessment.sourceHtml,
      assessment
    };
  }

  function getNewbornChartSpec(assessment) {
    const rows = buildNewbornChartRows(Array.isArray(assessment.chartRows) ? assessment.chartRows : []);
    return {
      metric: 'head',
      title: 'Siatka obwodu głowy',
      subtitle: 'INTERGROWTH-21st — noworodek / 1. miesiąc życia',
      rows,
      xMode: 'ga',
      xLabel: 'Wiek ciążowy (tydzień + dzień)',
      rangeMinX: rows.length ? rows[0].x : 24,
      rangeMaxX: rows.length ? rows[rows.length - 1].x : 43,
      patientX: assessment.x,
      patientY: assessment.value,
      sourceHtml: assessment.sourceHtml,
      assessment
    };
  }

  function buildChartSpec(metric, assessment) {
    if (assessment.mode === 'newborn') {
      return getNewbornChartSpec(assessment);
    }
    return getRegularChartSpec(metric, assessment);
  }

  function computeChartYBounds(spec) {
    const rows = Array.isArray(spec.rows) ? spec.rows : [];
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    rows.forEach((row) => {
      CIRC_CURVES.forEach((curve) => {
        const value = Number(row[curve.key]);
        if (isFinite(value)) {
          if (value < minVal) minVal = value;
          if (value > maxVal) maxVal = value;
        }
      });
    });
    if (isFinite(spec.patientY)) {
      if (spec.patientY < minVal) minVal = spec.patientY;
      if (spec.patientY > maxVal) maxVal = spec.patientY;
    }
    if (!isFinite(minVal) || !isFinite(maxVal)) {
      minVal = 0;
      maxVal = 10;
    }
    const pad = Math.max(1.2, (maxVal - minVal) * 0.08);
    return {
      min: Math.max(0, Math.floor((minVal - pad) * 2) / 2),
      max: Math.ceil((maxVal + pad) * 2) / 2
    };
  }

  function buildTickValues(min, max, step) {
    const values = [];
    const start = Math.ceil(min / step) * step;
    for (let value = start; value <= max + (step * 0.5); value += step) {
      values.push(Number(value.toFixed(4)));
    }
    return values;
  }

  function getYTickValues(bounds) {
    const range = bounds.max - bounds.min;
    let step = 1;
    if (range > 12 && range <= 24) step = 2;
    else if (range > 24 && range <= 45) step = 5;
    else if (range > 45) step = 10;
    return buildTickValues(bounds.min, bounds.max, step);
  }

  function getXTickItems(spec) {
    if (spec.xMode === 'ga') {
      const ticks = [];
      for (let week = Math.ceil(spec.rangeMinX); week <= Math.floor(spec.rangeMaxX); week += 2) {
        ticks.push({ value: week, label: `${week}+0` });
      }
      const maxWeek = Math.floor(spec.rangeMaxX);
      if (!ticks.length || ticks[ticks.length - 1].value !== maxWeek) {
        ticks.push({ value: maxWeek, label: `${maxWeek}+0` });
      }
      return ticks;
    }

    if (spec.xMode === 'months') {
      const ticks = [];
      const minMonths = Math.max(1, Math.round(spec.rangeMinX * 12));
      const maxMonths = Math.round(spec.rangeMaxX * 12);
      const step = maxMonths <= 12 ? 2 : 6;
      ticks.push({ value: minMonths / 12, label: String(minMonths) });
      for (let month = step; month <= maxMonths; month += step) {
        if (month > minMonths) {
          ticks.push({ value: month / 12, label: String(month) });
        }
      }
      if (!ticks.length || Math.abs(ticks[ticks.length - 1].value - spec.rangeMaxX) > 1e-7) {
        ticks.push({ value: spec.rangeMaxX, label: String(maxMonths) });
      }
      return ticks;
    }

    const ticks = [];
    const step = spec.rangeMaxX > 12 ? 3 : 1;
    for (let year = Math.ceil(spec.rangeMinX); year <= Math.floor(spec.rangeMaxX); year += step) {
      ticks.push({ value: year, label: String(year).replace('.', ',') });
    }
    if (spec.rangeMaxX % 1 !== 0) {
      ticks.push({ value: spec.rangeMaxX, label: String(spec.rangeMaxX).replace('.', ',') });
    }
    return ticks;
  }

  function stripHtmlToPlainText(html) {
    const raw = String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ');
    return raw.replace(/\s+/g, ' ').trim();
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const words = normalized.split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawCanvasLines(ctx, lines, x, y, lineHeight) {
    (Array.isArray(lines) ? lines : []).forEach((line, index) => {
      ctx.fillText(line, x, y + (index * lineHeight));
    });
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function getCircChartSummaryParts(spec) {
    const assessment = spec && spec.assessment ? spec.assessment : null;
    const parts = [];
    if (assessment && Number.isFinite(assessment.value)) {
      parts.push(`Pomiar pacjenta: ${formatCircNumber(assessment.value, 1)} cm`);
    }
    if (assessment && Number.isFinite(assessment.perc)) {
      parts.push(`${formatCircNumber(assessment.perc, 1)}. centyl`);
    }
    if (assessment && Number.isFinite(assessment.zScore)) {
      parts.push(`Z-score = ${formatCircNumber(assessment.zScore, 2)}`);
    }
    if (assessment && assessment.mode === 'newborn' && Number.isFinite(assessment.gaWeeks) && Number.isFinite(assessment.gaDays)) {
      parts.push(`wiek ciążowy z modułu SGA: ${assessment.gaWeeks}+${assessment.gaDays} tc`);
    }
    return parts;
  }

  function drawCircChartCanvas(spec) {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const visualRows = smoothCircRows(dedupeRowsByX(spec.rows || []));
    const bounds = computeChartYBounds(Object.assign({}, spec, { rows: visualRows }));
    const yTicks = getYTickValues(bounds);
    const xTicks = getXTickItems(spec);
    const summaryParts = getCircChartSummaryParts(spec);
    const sourceText = stripHtmlToPlainText(spec.sourceHtml || '');

    const page = { left: 72, right: 1168, top: 72, bottom: 1684 };
    const summaryBox = { x: 72, y: 166, width: 1096, height: 0 };

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0b5e66';
    ctx.font = '700 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(spec.title, page.left, 84);

    ctx.fillStyle = '#4b6468';
    ctx.font = '500 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(spec.subtitle, page.left, 122);

    let summaryLines = [];
    if (summaryParts.length) {
      ctx.font = '600 19px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      summaryLines = wrapCanvasText(ctx, summaryParts.join(' · '), summaryBox.width - 44);
      summaryBox.height = Math.max(64, 28 + (summaryLines.length * 28));
      ctx.fillStyle = 'rgba(0, 131, 141, 0.08)';
      ctx.strokeStyle = 'rgba(0, 131, 141, 0.2)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, summaryBox.x, summaryBox.y, summaryBox.width, summaryBox.height, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#143f45';
      drawCanvasLines(ctx, summaryLines, summaryBox.x + 22, summaryBox.y + 33, 28);
    }

    const plotTop = summaryLines.length ? (summaryBox.y + summaryBox.height + 62) : 220;
    const plot = { left: 138, top: plotTop, right: 1088, bottom: 1298 };

    const xScale = (value) => {
      if (!isFinite(value) || spec.rangeMaxX === spec.rangeMinX) return plot.left;
      return plot.left + ((value - spec.rangeMinX) / (spec.rangeMaxX - spec.rangeMinX)) * (plot.right - plot.left);
    };
    const yScale = (value) => {
      if (!isFinite(value) || bounds.max === bounds.min) return plot.bottom;
      return plot.bottom - ((value - bounds.min) / (bounds.max - bounds.min)) * (plot.bottom - plot.top);
    };

    ctx.strokeStyle = '#dfe8ea';
    ctx.lineWidth = 1;

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();

      ctx.fillStyle = '#5a6c70';
      ctx.font = '500 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(tick).replace('.', ','), plot.left - 14, y);
    });

    xTicks.forEach((tick) => {
      const x = xScale(tick.value);
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.bottom);
      ctx.stroke();

      ctx.fillStyle = '#5a6c70';
      ctx.font = '500 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(tick.label, x, plot.bottom + 16);
    });

    ctx.strokeStyle = '#6a7e82';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plot.bottom);
    ctx.lineTo(plot.right, plot.bottom);
    ctx.stroke();

    CIRC_CURVES.forEach((curve) => {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = curve.width;
      let started = false;
      visualRows.forEach((row) => {
        const x = xScale(row.x);
        const y = yScale(row[curve.key]);
        if (!isFinite(x) || !isFinite(y)) return;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.restore();
    });

    if (isFinite(spec.patientX)) {
      const x = xScale(spec.patientX);
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(0, 131, 141, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.bottom);
      ctx.stroke();
      ctx.restore();
    }

    if (isFinite(spec.patientY)) {
      const y = yScale(spec.patientY);
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(17, 90, 95, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.restore();
    }

    if (isFinite(spec.patientX) && isFinite(spec.patientY)) {
      const x = xScale(spec.patientX);
      const y = yScale(spec.patientY);
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00838d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#00838d';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const pointLabel = `${formatCircNumber(spec.patientY, 1)} cm`;
      ctx.font = '600 17px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const boxWidth = Math.max(130, ctx.measureText(pointLabel).width + 34);
      let boxX = x + 18;
      if (boxX + boxWidth > plot.right) boxX = x - boxWidth - 18;
      const boxY = Math.max(plot.top + 12, y - 18);
      const boxHeight = 38;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 131, 141, 0.1)';
      ctx.strokeStyle = 'rgba(0, 131, 141, 0.35)';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0c5c63';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(pointLabel, boxX + 15, boxY + (boxHeight / 2));
      ctx.restore();
    }

    ctx.fillStyle = '#33484d';
    ctx.font = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spec.xLabel, (plot.left + plot.right) / 2, plot.bottom + 72);

    ctx.save();
    ctx.translate(44, (plot.top + plot.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#33484d';
    ctx.font = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Obwód (cm)', 0, 0);
    ctx.restore();

    const legendStartY = plot.bottom + 118;
    const legendGapX = 235;
    const legendGapY = 42;
    const legendStartX = 92;
    CIRC_CURVES.forEach((curve, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = legendStartX + (col * legendGapX);
      const y = legendStartY + (row * legendGapY);
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = curve.width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 54, y);
      ctx.stroke();
      ctx.fillStyle = '#455a5f';
      ctx.font = '500 17px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(curve.label, x + 66, y);
    });

    if (sourceText) {
      ctx.fillStyle = '#5d6f74';
      ctx.font = '500 15px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const sourceLines = wrapCanvasText(ctx, sourceText, page.right - page.left);
      drawCanvasLines(ctx, sourceLines, page.left, 1564, 22);
    }

    ctx.strokeStyle = 'rgba(0, 131, 141, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(page.left, 1528);
    ctx.lineTo(page.right, 1528);
    ctx.stroke();

    ctx.fillStyle = '#6b7e84';
    ctx.font = '500 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('wagaiwzrost.pl', page.right, 1700);

    return canvas;
  }

  function resolveCircFilenameBase() {
    try {
      if (typeof patientReportResolveFilenameBase === 'function') {
        const base = patientReportResolveFilenameBase();
        if (base) return base;
      }
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    const raw = String(document.getElementById('name')?.value || document.getElementById('advName')?.value || 'pacjent');
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    return normalized || 'pacjent';
  }

  function downloadCircPdfBlob(blob, filename) {
    if (typeof patientReportDownloadBlob === 'function') {
      patientReportDownloadBlob(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
      try { link.remove(); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    }, 0);
  }

  function showCircToast(message) {
    if (typeof patientReportShowToast === 'function') {
      patientReportShowToast(message);
      return;
    }
    try { window.alert(message); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
  }

  async function runCircPdfTask(triggerBtn, taskFn) {
    if (typeof patientReportRunExternalPdfTask === 'function') {
      return patientReportRunExternalPdfTask(triggerBtn, taskFn, 'Przygotowywanie PDF…');
    }
    const btn = triggerBtn || null;
    const originalNodes = btn && btn.childNodes ? Array.prototype.slice.call(btn.childNodes).map(function (node) { return node.cloneNode(true); }) : null;
    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Przygotowywanie PDF…';
    }
    try {
      await taskFn();
      return true;
    } finally {
      if (btn) {
        btn.disabled = false;
        if (originalNodes && originalNodes.length) {
          circRestoreClonedChildren(btn, originalNodes, 'circumference:button-label');
        } else {
          btn.textContent = originalText || 'Generuj siatkę';
        }
      }
    }
  }



  function createCircDependencyError(depsReady, message) {
    try {
      if (window.VildaDeps && typeof window.VildaDeps.createMissingDependenciesError === 'function') {
        return window.VildaDeps.createMissingDependenciesError(depsReady || 'circumference-module-pdf', { message });
      }
      if (window.VildaDeps && typeof window.VildaDeps.notifyMissingDependencies === 'function') {
        const notified = window.VildaDeps.notifyMissingDependencies(depsReady || 'circumference-module-pdf', { message });
        const error = new Error((notified && notified.userMessage) || message);
        error.name = 'VildaDependencyError';
        error.vildaDependencyError = true;
        error.vildaDependencyResult = notified;
        return error;
      }
    } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    return new Error(message || 'Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.');
  }

  function buildCircPdfFilename(metric) {
    const base = resolveCircFilenameBase();
    const prefix = metric === 'head' ? 'Siatka_obwodu_glowy' : 'Siatka_obwodu_klatki_piersiowej';
    return `${prefix}_${base}.pdf`;
  }

  async function generateCircChartPdf(metric, triggerBtn) {
    if (!isProfessionalModeEnabled()) {
      showCircToast('Generowanie siatek obwodów jest dostępne tylko w trybie Wyniki profesjonalne PRO.');
      syncCircChartAccess();
      return;
    }
    const title = metric === 'head' ? 'siatki obwodu głowy' : 'siatki obwodu klatki piersiowej';

    try {
      await runCircPdfTask(triggerBtn, async () => {
        if (window.VildaDeps && typeof window.VildaDeps.checkModuleDeps === 'function') {
          const depsReady = window.VildaDeps.checkModuleDeps('circumference-module-pdf', { silent: true });
          if (depsReady && depsReady.ok === false) {
            throw createCircDependencyError(depsReady, 'Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.');
          }
        }
        const jsPDF = (window.VildaDeps && typeof window.VildaDeps.requireFunction === 'function')
          ? window.VildaDeps.requireFunction('jspdf.jsPDF', { moduleName: 'circumference-module-pdf' })
          : (window.jspdf && typeof window.jspdf.jsPDF === 'function' ? window.jspdf.jsPDF : null);
        if (!jsPDF) {
          throw createCircDependencyError('circumference-module-pdf', 'Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.');
        }
        const assessment = getCircAssessment(metric);
        if (!assessment.ok) {
          throw new Error(assessment.message || `Nie udało się przygotować ${title}.`);
        }
        const spec = buildChartSpec(metric, assessment);
        if (!Array.isArray(spec.rows) || !spec.rows.length) {
          throw new Error('Brakuje danych referencyjnych niezbędnych do narysowania siatki.');
        }
        const canvas = drawCircChartCanvas(spec);
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
          putOnlyUsedFonts: true
        });
        pdf.setProperties({
          title: spec.title,
          subject: spec.subtitle,
          author: 'wagaiwzrost.pl'
        });
        let imageData = null;
        if (typeof patientReportCanvasToPdfImage === 'function') {
          try {
            imageData = patientReportCanvasToPdfImage(canvas, {
              preferredFormat: 'JPEG',
              skipPngProbe: true,
              jpegQuality: 0.92,
              maxWidth: 2200
            });
          } catch (error) {
            logCircWarn('Nie udało się zoptymalizować obrazu PDF siatki obwodu', error, { metric });
            imageData = null;
          }
        }
        const dataUrl = imageData && imageData.dataUrl ? imageData.dataUrl : canvas.toDataURL('image/jpeg', 0.92);
        const format = imageData && imageData.format ? imageData.format : 'JPEG';
        pdf.addImage(dataUrl, format, 0, 0, 210, 297, undefined, 'MEDIUM');
        const blob = pdf.output('blob');
        downloadCircPdfBlob(blob, buildCircPdfFilename(metric));
        showCircToast(`PDF ${title} został wygenerowany.`);
      });
    } catch (error) {
      logCircError('Błąd generowania PDF siatki obwodu', error, { metric });
      console.error('Błąd generowania PDF siatki obwodu:', error);
      if (!(error && error.vildaDependencyError)) {
        showCircToast(error && error.message ? error.message : 'Nie udało się wygenerować siatki obwodu.');
      }
    } finally {
      syncCircChartAccess();
    }
  }

  function syncCircChartAccess() {
    const isPro = isProfessionalModeEnabled();
    const headBtn = document.getElementById('generateHeadCircChart');
    const chestBtn = document.getElementById('generateChestCircChart');
    const noteEl = document.getElementById('circChartProHint');

    [headBtn, chestBtn].forEach((btn) => {
      if (!btn) return;
      if (isPro) {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.setAttribute('aria-disabled', 'false');
        btn.classList.remove('is-pro-locked');
      } else {
        btn.disabled = true;
        btn.setAttribute('disabled', '');
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('is-pro-locked');
      }
    });

    if (noteEl) {
      noteEl.style.display = isPro ? 'none' : '';
    }
  }

  function handleResultsModeSyncEvent(event) {
    const detail = event && event.detail ? event.detail : null;
    if (detail && typeof detail.professional === 'boolean') {
      try { window.professionalMode = !!detail.professional; } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    }
    syncCircChartAccess();
    updateCirc();
  }

  /**
   * Aktualizuje wyniki obwodów głowy i klatki piersiowej na podstawie danych w formularzu.
   * Funkcja jest wywoływana po zmianie któregokolwiek z pól: wiek, płeć, obwód głowy, obwód klatki.
   */
  function updateCirc() {
    renderCircResult('head', document.getElementById('circHeadResult'));
    renderCircResult('chest', document.getElementById('circChestResult'));
    syncCircChartAccess();
  }

  function resetCircumferenceModuleAfterUserStateCleared() {
    try { clearMetricGlobals('head'); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try { clearMetricGlobals('chest'); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try { setPlaceholder(document.getElementById('circHeadResult'), getMetricPrompt('head')); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try { setPlaceholder(document.getElementById('circChestResult'), getMetricPrompt('chest')); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
    try { syncCircChartAccess(); } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }
  }

  function handleCircumferenceModuleStateCleared(event) {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    const scope = String(detail.scope || 'all').toLowerCase();
    if (scope === 'all' || scope === '*') {
      resetCircumferenceModuleAfterUserStateCleared();
    }
  }

  try {
    if (typeof window !== 'undefined' && !window.__vildaCircUserStateClearedBound && typeof window.addEventListener === 'function') {
      window.__vildaCircUserStateClearedBound = true;
      window.addEventListener('vilda:user-state-cleared', resetCircumferenceModuleAfterUserStateCleared);
      window.addEventListener('vilda:module-state-cleared', handleCircumferenceModuleStateCleared);
    }
  } catch (error) { logCircWarn('Zignorowany błąd pomocniczy w module obwodów', error); }

  // Po załadowaniu DOM przypnij zdarzenia do pól formularza. Używamy tych samych
  // pól wiekowych i płci co w innych modułach, aby reagować na ich zmianę.
  function setupCircumferenceModule() {
    const headInput = document.getElementById('headCircumference');
    const chestInput = document.getElementById('chestCircumference');
    const yearsInput = document.getElementById('age');
    const monthsInput = document.getElementById('ageMonths');
    const sexInput = document.getElementById('sex');
    const resultsToggle = document.getElementById('resultsModeToggle');
    const headChartBtn = document.getElementById('generateHeadCircChart');
    const chestChartBtn = document.getElementById('generateChestCircChart');

    if (headInput) headInput.addEventListener('input', updateCirc);
    if (chestInput) chestInput.addEventListener('input', updateCirc);
    if (yearsInput) yearsInput.addEventListener('input', updateCirc);
    if (monthsInput) monthsInput.addEventListener('input', updateCirc);
    if (sexInput) sexInput.addEventListener('change', updateCirc);
    if (resultsToggle) {
      resultsToggle.addEventListener('change', function() {
        syncCircChartAccess();
        updateCirc();
      });
    }

    document.addEventListener('vildaResultsModeChanged', handleResultsModeSyncEvent);
    

    if (headChartBtn) {
      headChartBtn.addEventListener('click', function() {
        if (headChartBtn.disabled) return;
        generateCircChartPdf('head', headChartBtn);
      });
    }
    if (chestChartBtn) {
      chestChartBtn.addEventListener('click', function() {
        if (chestChartBtn.disabled) return;
        generateCircChartPdf('chest', chestChartBtn);
      });
    }

    syncCircChartAccess();
    updateCirc();
    setTimeout(syncCircChartAccess, 250);
    setTimeout(syncCircChartAccess, 900);
  }

  function bootCircumferenceModule() {
    if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
      window.vildaOnReady('circumference-module:setup', setupCircumferenceModule);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupCircumferenceModule, { once: true });
    } else {
      setupCircumferenceModule();
    }
  }

  bootCircumferenceModule();
})();
