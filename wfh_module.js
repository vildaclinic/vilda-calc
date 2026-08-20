// Moduł „Proporcja masy do wysokości ciała" (weight-for-height).
// Ocena masy ciała względem WZROSTU (nie wieku) — parametr szczególnie przydatny u dzieci
// do ok. 3. roku życia, gdzie BMI działa słabo; spójny z konwencją książeczek zdrowia.
//
// Źródło danych: Palczewska I., Niedźwiedzka Z. „Wskaźniki rozwoju somatycznego dzieci
// i młodzieży warszawskiej", Med. Wieku Rozw. 2001;5(2) Suplement I — Tabela 63 (chłopcy,
// 50–195 cm) i Tabela 64 (dziewczęta, 50–185 cm), krok 5 cm; populacja 1 mies.–18 lat.
// Digitalizacja ze skanu oryginału w powiększeniach 300 dpi (2026-08-19).
//
// Adnotacje źródłowe:
// - Tabela 64, wiersz 75 cm: w druku kolumny p3/p10 w odwrotnej kolejności (8,0 | 7,3);
//   przywrócono porządek rosnący (7,3 | 8,0) — zgodny ze statystyką wiersza (mean 9,46,
//   SD 0,97 → p3≈7,6, p10≈8,2) i monotonicznością sąsiednich wierszy.
// - Tabela 63, wiersz 195 cm: mean 92,70 znacznie powyżej p50=78,8 (osobliwość źródła przy
//   skrajnym wzroście, zapewne mała liczebność); przepisano wiernie — wynik i tak liczą
//   kolumny percentylowe, które są ciągłe z wierszem 190 cm.
//
// Silnik jak w module obwodów po naprawie etapu 1: wiersz interpolowany liniowo po wzroście,
// z-score interpolacją wartość↔z po punktach percentylowych (p3..p97 ↔ z=±1,88079; liniowa
// ekstrapolacja w przestrzeni z poza skrajnymi punktami), centyl = Φ(z)·100; mean/SD tabel
// nie wpływają na wynik. Klasyfikacja 3/10/90/97 jak w całej aplikacji.
(function () {
  'use strict';

  function r(h, mean, sd, p3, p10, p25, p50, p75, p90, p97) {
    return { h: h, mean: mean, sd: sd, p3: p3, p10: p10, p25: p25, p50: p50, p75: p75, p90: p90, p97: p97 };
  }

  // Tabela 63 — chłopcy, masa (kg) wg wysokości ciała (cm)
  var BOYS = [
    r(50, 3.80, 0.59, 3.0, 3.2, 3.6, 3.8, 4.1, 4.4, 4.6),
    r(55, 4.76, 0.58, 3.9, 4.0, 4.3, 4.8, 5.1, 5.5, 5.9),
    r(60, 5.86, 0.61, 4.9, 5.1, 5.4, 5.8, 6.3, 6.6, 7.1),
    r(65, 7.20, 0.68, 6.2, 6.4, 6.7, 7.1, 7.7, 8.2, 8.7),
    r(70, 8.35, 0.79, 7.0, 7.3, 7.8, 8.3, 8.8, 9.3, 10.1),
    r(75, 9.73, 0.84, 8.3, 8.8, 9.1, 9.7, 10.3, 10.8, 11.4),
    r(80, 10.94, 0.85, 9.5, 9.9, 10.3, 10.9, 11.4, 12.1, 12.6),
    r(85, 12.18, 1.06, 10.3, 10.8, 11.5, 12.2, 12.9, 13.6, 13.9),
    r(90, 13.54, 1.36, 11.6, 12.0, 12.7, 13.3, 14.3, 15.2, 16.0),
    r(95, 14.65, 1.24, 12.7, 13.2, 13.8, 14.4, 15.3, 16.0, 17.0),
    r(100, 15.84, 1.37, 13.6, 14.2, 14.9, 15.5, 16.7, 17.6, 18.3),
    r(105, 17.96, 1.87, 15.0, 15.7, 16.3, 17.0, 18.0, 19.0, 20.0),
    r(110, 18.84, 1.75, 16.1, 17.0, 17.8, 18.6, 19.7, 21.1, 22.2),
    r(115, 20.52, 1.85, 17.8, 18.6, 19.4, 20.2, 21.6, 23.0, 24.7),
    r(120, 22.74, 2.39, 19.2, 20.0, 21.2, 22.2, 23.8, 25.7, 27.6),
    r(125, 24.55, 2.84, 21.2, 22.0, 23.0, 24.2, 26.4, 28.1, 31.2),
    r(130, 27.46, 3.90, 22.7, 24.0, 25.4, 26.7, 29.0, 31.9, 35.5),
    r(135, 31.06, 4.68, 25.0, 26.5, 27.9, 29.4, 33.4, 36.9, 40.4),
    r(140, 33.94, 5.73, 26.9, 28.7, 30.5, 32.3, 36.5, 40.6, 45.8),
    r(145, 37.81, 6.08, 29.3, 31.7, 33.8, 36.0, 40.5, 46.2, 51.8),
    r(150, 42.14, 6.87, 32.0, 34.7, 37.4, 40.0, 46.3, 51.9, 57.3),
    r(155, 46.34, 8.25, 35.9, 38.7, 42.0, 45.1, 50.5, 57.6, 63.4),
    r(160, 49.65, 8.24, 39.0, 41.6, 45.3, 49.6, 55.7, 62.3, 69.5),
    r(165, 55.45, 8.16, 43.0, 46.0, 49.7, 54.0, 60.4, 67.5, 74.5),
    r(170, 61.37, 8.07, 47.1, 50.5, 54.3, 59.4, 65.6, 71.7, 78.6),
    r(175, 64.79, 8.72, 52.2, 55.0, 59.0, 64.2, 71.1, 76.9, 82.5),
    r(180, 69.57, 7.57, 57.0, 60.0, 63.2, 68.9, 75.0, 81.6, 86.8),
    r(185, 73.45, 10.21, 61.4, 64.2, 68.0, 72.4, 79.3, 87.1, 92.5),
    r(190, 75.94, 9.44, 65.6, 68.0, 71.7, 75.8, 82.9, 90.6, 95.3),
    r(195, 92.70, 8.25, 70.0, 71.7, 74.5, 78.8, 84.5, 92.5, 97.2)
  ];

  // Tabela 64 — dziewczęta, masa (kg) wg wysokości ciała (cm)
  var GIRLS = [
    r(50, 3.68, 0.34, 3.1, 3.2, 3.5, 3.8, 3.9, 4.0, 4.2),
    r(55, 4.56, 0.49, 3.6, 4.0, 4.2, 4.6, 4.9, 5.2, 5.5),
    r(60, 5.70, 0.61, 4.7, 5.0, 5.3, 5.7, 6.1, 6.5, 6.9),
    r(65, 6.93, 0.69, 5.8, 6.1, 6.4, 6.9, 7.4, 7.9, 8.4),
    r(70, 8.13, 0.77, 6.9, 7.1, 7.6, 8.1, 8.6, 9.1, 9.9),
    r(75, 9.46, 0.97, 7.3, 8.0, 8.9, 9.4, 10.0, 10.7, 11.6), // korekta transpozycji p3/p10 (druk: 8,0 | 7,3)
    r(80, 10.79, 1.01, 9.2, 9.6, 10.1, 10.7, 11.4, 12.1, 13.0),
    r(85, 11.94, 1.22, 10.1, 10.7, 11.3, 11.8, 12.4, 13.3, 14.6),
    r(90, 13.10, 1.12, 11.2, 11.8, 12.4, 13.0, 13.8, 14.6, 15.3),
    r(95, 14.51, 1.35, 12.3, 12.9, 13.6, 14.2, 15.0, 15.9, 16.8),
    r(100, 15.62, 1.33, 13.7, 14.3, 15.0, 15.6, 16.5, 17.5, 18.4),
    r(105, 16.97, 1.78, 14.9, 15.5, 16.1, 16.7, 17.9, 19.0, 20.2),
    r(110, 18.67, 1.79, 16.2, 16.9, 17.6, 18.3, 19.8, 21.3, 22.7),
    r(115, 20.66, 2.36, 17.6, 18.3, 19.0, 19.6, 21.5, 23.4, 25.3),
    r(120, 22.46, 2.70, 19.0, 19.8, 20.8, 21.4, 23.8, 26.3, 28.8),
    r(125, 25.07, 3.76, 20.6, 21.7, 22.8, 23.8, 26.6, 29.4, 32.6),
    r(130, 27.01, 4.33, 22.2, 23.6, 25.1, 26.4, 29.7, 33.2, 36.7),
    r(135, 30.45, 4.31, 24.0, 25.8, 27.7, 29.6, 33.3, 36.6, 40.8),
    r(140, 33.67, 4.93, 26.0, 27.9, 30.4, 33.0, 37.2, 40.5, 45.5),
    r(145, 36.82, 5.75, 28.9, 31.6, 34.3, 37.0, 42.2, 45.6, 52.0),
    r(150, 42.32, 7.54, 31.6, 34.9, 38.1, 41.4, 46.6, 51.5, 58.0),
    r(155, 46.56, 7.00, 35.1, 38.7, 42.1, 45.7, 51.8, 56.6, 63.9),
    r(160, 51.81, 7.55, 40.0, 43.7, 47.4, 50.3, 56.6, 60.7, 68.8),
    r(165, 55.77, 7.82, 44.0, 47.8, 51.7, 54.6, 60.4, 64.9, 72.8),
    r(170, 58.94, 6.79, 48.5, 51.8, 55.2, 58.7, 64.1, 68.5, 75.5),
    r(175, 60.58, 7.86, 54.0, 57.8, 60.6, 63.5, 68.2, 72.3, 77.6),
    r(180, 68.16, 4.76, 60.5, 63.3, 66.1, 69.1, 72.4, 75.7, 79.1),
    r(185, 76.85, 6.86, 70.0, 72.3, 74.5, 76.9, 78.0, 79.2, 80.4)
  ];

  var PKEYS = ['p3', 'p10', 'p25', 'p50', 'p75', 'p90', 'p97'];
  var PZ = [-1.88079, -1.28155, -0.67449, 0, 0.67449, 1.28155, 1.88079];

  // Wiersz interpolowany liniowo po wzroście; poza zakresem tabel — null (bez klamrowania:
  // wynik poza pokryciem źródła nie jest wiarygodny).
  function rowFor(sex, heightCm) {
    var tab = sex === 'M' || sex === 'male' ? BOYS : GIRLS;
    if (!isFinite(heightCm) || heightCm < tab[0].h || heightCm > tab[tab.length - 1].h) return null;
    for (var i = 0; i < tab.length - 1; i++) {
      var a = tab[i], b = tab[i + 1];
      if (heightCm >= a.h && heightCm <= b.h) {
        var f = (heightCm - a.h) / (b.h - a.h), out = { h: heightCm };
        ['mean', 'sd'].concat(PKEYS).forEach(function (k) { out[k] = a[k] + f * (b[k] - a[k]); });
        return out;
      }
    }
    return null;
  }

  // Interpolacja wartość↔z po punktach percentylowych (jak zc w module obwodów).
  function zFromRow(x, row) {
    if (!row || !isFinite(x)) return NaN;
    var v = PKEYS.map(function (k) { return row[k]; });
    if (v.some(function (n) { return !isFinite(n); })) return NaN;
    function lin(t, x0, x1, y0, y1) { return x0 === x1 ? y0 : y0 + (t - x0) / (x1 - x0) * (y1 - y0); }
    if (x <= v[0]) return lin(x, v[0], v[1], PZ[0], PZ[1]);
    for (var i = 0; i < v.length - 1; i++) if (x <= v[i + 1]) return lin(x, v[i], v[i + 1], PZ[i], PZ[i + 1]);
    var q = v.length - 1;
    return lin(x, v[q - 1], v[q], PZ[q - 1], PZ[q]);
  }

  // Dystrybuanta rozkładu normalnego (aproksymacja Zelen–Severo, jak w module obwodów).
  function cdf(z) {
    if (!isFinite(z)) return NaN;
    var n = Math.abs(z), t = 1 / (1 + 0.2316419 * n),
      d = 0.3989422804014327 * Math.exp(-n * n / 2),
      p = ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) * t + 0.31938153) * t,
      a = 1 - d * p;
    return z >= 0 ? a : 1 - a;
  }

  function classify(perc) {
    if (!isFinite(perc)) return { cat: null, severity: '' };
    if (perc < 3) return { cat: 'very_low', severity: 'danger' };
    if (perc < 10) return { cat: 'low', severity: 'warning' };
    if (perc <= 90) return { cat: 'normal', severity: '' };
    if (perc <= 97) return { cat: 'high', severity: 'warning' };
    return { cat: 'very_high', severity: 'danger' };
  }

  var MSG = {
    very_low: 'Masa ciała znacznie poniżej typowej dla wzrostu (poniżej 3. centyla) — wskazana konsultacja lekarska.',
    low: 'Masa ciała w przedziale 3.–10. centyla dla wzrostu — pogranicze normy (strefa obserwacyjna); wskazana kontrola pomiaru i obserwacja.',
    normal: 'Masa ciała w przedziale 10.–90. centyla dla wzrostu — prawidłowa proporcja masy do wysokości.',
    high: 'Masa ciała w przedziale 90.–97. centyla dla wzrostu — pogranicze normy (strefa obserwacyjna); wskazana kontrola pomiaru i obserwacja.',
    very_high: 'Masa ciała znacznie powyżej typowej dla wzrostu (powyżej 97. centyla) — wskazana konsultacja lekarska.'
  };

  var SOURCE_NOTE = '<div class="source-note">Źródło referencyjne: siatki Instytutu Matki i Dziecka (Palczewska i Niedźwiedzka; Warszawa 1996–99) — proporcja masy do wysokości ciała, Tabele 63–64 (chłopcy 50–195 cm, dziewczęta 50–185 cm). Parametr niezależny od wieku metrykalnego — szczególnie przydatny u dzieci do ok. 3. roku życia.</div>';

  // Czysta ocena — eksportowana do testów. sex: 'M' = chłopcy, inne = dziewczęta.
  function assess(weightKg, heightCm, sex, ageYears) {
    if (!isFinite(weightKg) || !isFinite(heightCm)) return { ok: false, reason: 'missing' };
    if (isFinite(ageYears) && ageYears > 18.5) {
      return { ok: false, reason: 'age-range', message: 'Proporcja masy do wysokości wg siatek IMiD jest dostępna dla wieku do 18,5 roku życia.' };
    }
    if (isFinite(ageYears) && ageYears >= 0 && ageYears < 1 / 12) {
      return { ok: false, reason: 'newborn', message: 'Ocena proporcji masy do wysokości jest dostępna od 1. miesiąca życia — wielkość urodzeniową ocenia moduł SGA.' };
    }
    if (weightKg < 1 || weightKg > 200) {
      return { ok: false, reason: 'implausible-weight', message: 'Wpisana masa ciała jest poza wiarygodnym zakresem pomiaru — sprawdź, czy nie doszło do pomyłki.' };
    }
    var maxH = sex === 'M' ? 195 : 185;
    if (heightCm < 50 || heightCm > maxH) {
      return { ok: false, reason: 'height-range', message: 'Tabele proporcji masy do wysokości obejmują wzrost 50–' + maxH + ' cm dla tej płci.' };
    }
    var row = rowFor(sex, heightCm);
    if (!row) return { ok: false, reason: 'height-range', message: 'Tabele proporcji masy do wysokości obejmują wzrost 50–' + maxH + ' cm dla tej płci.' };
    var z = zFromRow(weightKg, row);
    var perc = isFinite(z) ? cdf(z) * 100 : NaN;
    return {
      ok: isFinite(perc), weightKg: weightKg, heightCm: heightCm, sex: sex,
      row: row, perc: perc, zScore: z, cls: classify(perc), sourceHtml: SOURCE_NOTE
    };
  }

  // ── Warstwa DOM (karta #wfhCard, wynik #wfhResult) ──

  function fmtPl(x, d) {
    return isFinite(x) ? Number(x).toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  }

  function isPro() {
    try { var t = document.getElementById('resultsModeToggle'); if (t) return !!t.checked; } catch (e) { }
    try { if (typeof window.professionalMode !== 'undefined') return !!window.professionalMode; } catch (e) { }
    try {
      var p = window.VildaPersistence && typeof window.VildaPersistence.readPreferenceRaw === 'function'
        ? window.VildaPersistence.readPreferenceRaw('RESULTS_MODE', 'standard') : null;
      if (p === 'professional') return true;
    } catch (e) { }
    return false;
  }

  function setHtml(el, html) {
    if (!el) return;
    try {
      if (window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        window.VildaHtml.setTrustedHtml(el, html, { context: 'wfh-module' });
        return;
      }
    } catch (e) { }
    el.innerHTML = html;
  }

  function clearGlobals() {
    try { window.wfhPercentile = undefined; window.wfhSD = undefined; } catch (e) { }
  }

  function update() {
    var box = document.getElementById('wfhResult');
    if (!box) return;
    box.className = 'result-box';
    box.classList.remove('rr-warning', 'rr-danger');
    var w = parseFloat(document.getElementById('weight') && document.getElementById('weight').value);
    var h = parseFloat(document.getElementById('height') && document.getElementById('height').value);
    var sexEl = document.getElementById('sex');
    var sex = sexEl ? sexEl.value : 'M';
    var age = typeof getAgeDecimal === 'function' ? getAgeDecimal() : NaN;
    var aE = document.getElementById('age'), aM = document.getElementById('ageMonths');
    var ageEmpty = aE && String(aE.value).trim() === '' && (!aM || String(aM.value).trim() === '');
    if (!isFinite(w) || !isFinite(h)) {
      clearGlobals();
      setHtml(box, '<p class="circ-placeholder">Uzupełnij masę i wzrost w formularzu, aby zobaczyć wynik.</p>');
      return;
    }
    if (ageEmpty) {
      clearGlobals();
      setHtml(box, '<p class="circ-placeholder">Podaj wiek pacjenta, aby ocenić proporcję masy do wysokości (dla dziecka poniżej 1. miesiąca życia wielkość urodzeniową ocenia moduł SGA).</p>');
      return;
    }
    var res = assess(w, h, sex, age);
    if (!res.ok) {
      clearGlobals();
      setHtml(box, '<p class="circ-placeholder">' + (res.message || 'Nie można ocenić proporcji masy do wysokości.') + '</p>');
      return;
    }
    var percText = res.perc < 3 ? '<3. centyla' : res.perc > 97 ? '>97. centyla' : fmtPl(res.perc, 1) + '. centyl';
    var html = '<p><strong>Proporcja masy do wysokości:</strong> ' + fmtPl(w, 1) + ' kg przy wzroście '
      + fmtPl(h, 1) + ' cm – ' + percText;
    if (isPro() && isFinite(res.zScore)) html += ' (Z‑score = ' + fmtPl(res.zScore, 2) + ')';
    html += '.</p>';
    if (res.cls && res.cls.cat) html += '<div class="circ-definition">' + MSG[res.cls.cat] + '</div>';
    html += res.sourceHtml;
    setHtml(box, html);
    try {
      window.wfhPercentile = isFinite(res.perc) ? res.perc : undefined;
      window.wfhSD = isFinite(res.zScore) ? res.zScore : undefined;
    } catch (e) { }
    if (res.cls && res.cls.severity === 'warning') {
      box.classList.add('rr-warning');
      if (typeof applyPulse === 'function') { try { applyPulse(box, true); } catch (e) { } }
    } else if (res.cls && res.cls.severity === 'danger') {
      box.classList.add('rr-danger');
      if (typeof applyPulse === 'function') { try { applyPulse(box, false); } catch (e) { } }
    }
  }

  function setup() {
    var toggle = document.getElementById('toggleWfhSection');
    var card = document.getElementById('wfhCard');
    if (toggle && card) {
      toggle.addEventListener('click', function () {
        var open = card.style.display !== 'none' && card.style.display !== '';
        card.style.display = open ? 'none' : 'block';
        toggle.classList.toggle('active-toggle', !open);
      });
    }
    ['weight', 'height', 'age', 'ageMonths'].forEach(function (id) {
      var el = document.getElementById(id);
      el && el.addEventListener('input', update);
    });
    var sexEl = document.getElementById('sex');
    sexEl && sexEl.addEventListener('change', update);
    var pro = document.getElementById('resultsModeToggle');
    pro && pro.addEventListener('change', update);
    document.addEventListener('vildaResultsModeChanged', update);
    try {
      window.addEventListener('vilda:user-state-cleared', function () { clearGlobals(); update(); });
    } catch (e) { }
    update();
  }

  if (typeof window !== 'undefined') {
    window.VildaWfh = { assess: assess, rowFor: rowFor, zFromRow: zFromRow, classify: classify, tables: { male: BOYS, female: GIRLS } };
  }

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('wfh-module:setup', setup);
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
  }
})();
