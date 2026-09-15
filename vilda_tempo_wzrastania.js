/* vilda_tempo_wzrastania.js — JEDYNE miejsce, w którym aplikacja liczy tempo wzrastania.
 *
 * P-TEMPO (audyt 2026-09-15, decyzja właściciela: „maksymalnie zunifikować te obliczenia").
 * Audyt znalazł czternaście niezależnych fragmentów kodu liczących tempo, z różnymi oknami,
 * progami i etykietami. Od teraz: ten moduł liczy, reszta aplikacji czyta i formatuje.
 *
 * Czytelny moduł (nie-minified) wg AGENTS.md §2, bez zależności od DOM. Etap 1 przenosi tu
 * logikę z trzech kopii (karta zaawansowana, karta podstawowa, analiza trajektorii) BEZ zmiany
 * wyników: dobór pary pomiarów, wzór, hierarchia norm i poziomy alarmowe są 1:1 z kodu sprzed
 * przeniesienia. Jedyna zmiana treści to napis normy poniżej 2 lat, który od teraz podaje ten
 * sam próg, przy którym pada alarm (decyzja właściciela 2026-09-15, patrz PROGI_WIEKOWE).
 *
 * TRZY POJĘCIA — i tylko pierwsze wolno porównywać z normą:
 *   roczne          — dzisiejszy pomiar wobec punktu historii oddalonego o 6–15 mies.
 *                     (preferowany najbliższy 12 mies. z okna 9–15; gdy takiego nie ma, ostatni
 *                     punkt ≥ 6 mies. wstecz, o ile leży nie dalej niż 15 mies.);
 *   ostatni-odcinek — dzisiejszy pomiar wobec ostatniego punktu ≥ 6 mies. wstecz, bez górnej
 *                     granicy odstępu; liczba opisowa, nigdy nie porównywana z normą;
 *   odcinek         — tempo między dwoma dowolnymi punktami (wiersze historii, PDF, monitor GH),
 *                     z flagą `krotki` poniżej 6 mies.
 *
 * Wzór wszędzie ten sam: (h2 − h1) / ((m2 − m1) / 12). Czas w miesiącach przez 12.
 *
 * Normy tempa (bez zmiany wartości względem app.js sprzed przeniesienia):
 *   < 10 lat — drabinka wiekowa PROGI_WIEKOWE (poziom alarmowy);
 *   ≥ 10 lat — hierarchia okołopokwitaniowa: Tanner → wiek kostny → reguła generyczna,
 *              próg 4 cm/rok (Tanner & Whitehouse, Arch Dis Child 1976;51:170-9, PMID 952550,
 *              doi:10.1136/adc.51.3.170; Tanner & Davies, J Pediatr 1985;107:317-29,
 *              PMID 3875704, doi:10.1016/s0022-3476(85)80501-1; akceptacja właściciela 2026-08-08).
 *   SDS tempa liczy osobny silnik VildaHeightVelocity (DONALD/Kelly/KOWD) na WIEKU ŚRODKA
 *   przedziału — dlatego model niesie `wiekSrodekMies`.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var P = {
    ROCZNE_MIN_M: 6,          // najkrótszy odstęp, przy którym tempo wolno porównać z normą
    ROCZNE_OKNO_MIN_M: 9,     // preferowane okno roczne: 9–15 mies., najbliżej 12
    ROCZNE_OKNO_MAX_M: 15,
    ROCZNE_CEL_M: 12,
    ODCINEK_MIN_M: 6,         // krótszy odstęp = flaga `krotki` (annualizacja niestabilna)
    // ── Ocena tempa ≥ 10 r.ż. (parametry kliniczne, akceptacja właściciela 2026-08-08) ──
    PUB_VELO_MIN: 4,          // cm/rok — próg okołopokwitaniowy
    PUB_AGE_MIN_M: 120,       // od 10 lat (poniżej działa drabinka wiekowa)
    PUB_AGE_MAX_F_M: 156,     // dziewczęta: okno generyczne do 13 lat
    PUB_AGE_MAX_M_M: 180,     // chłopcy: okno generyczne do 15 lat
    BONE_AGE_FRESH_M: 18      // wiek kostny użyty tylko, gdy oznaczony w ciągu ostatnich 18 mies.
  };

  /* Drabinka wiekowa < 10 lat. `prog` to wartość, przy której pada alarm; `etykieta` opisuje
   * dokładnie tę regułę. Do 2026-09-15 napis mówił „≥23 cm/rok (tolerancja ±2 cm)", a alarm padał
   * przy 21 — lekarz widział inną regułę niż ta, która zadziałała. Wartości progów bez zmian. */
  var PROGI_WIEKOWE = [
    { doLat: 1, prog: 21, etykieta: '≥21 cm/rok, norma 23 cm/rok z tolerancją 2 cm' },
    { doLat: 2, prog: 9, etykieta: '≥9 cm/rok, norma 10 cm/rok z tolerancją 1 cm' },
    { doLat: 3, prog: 7, etykieta: '≥7 cm/rok' },
    { doLat: 5, prog: 6, etykieta: '≥6 cm/rok' },
    { doLat: 10, prog: 5, etykieta: '≥5 cm/rok' }
  ];

  // ── Pomocnicze ──

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function sexMK(s) {
    return String(s == null ? '' : s).trim().toUpperCase() === 'M' ? 'M' : 'K';
  }

  function fmt1(v) {
    return typeof v === 'number' && isFinite(v) ? v.toFixed(1).replace('.', ',') : '—';
  }

  function fmtAgeM(mo) {
    mo = Math.round(mo);
    var y = Math.floor(mo / 12), r = mo % 12;
    var yd = y % 10, ys100 = y % 100;
    var ys = y ? y + (y === 1 ? ' rok'
      : (yd >= 2 && yd <= 4 && !(ys100 >= 12 && ys100 <= 14) ? ' lata' : ' lat')) : '';
    var rs = r ? r + ' mies.' : '';
    return ys && rs ? ys + ' ' + rs : (ys || rs || '0 mies.');
  }

  function punkt(p) {
    if (!p || typeof p !== 'object') return null;
    var m = num(p.ageMonths), h = num(p.height);
    if (m == null || h == null) return null;
    return { ageMonths: m, height: h };
  }

  // ── Wzór ──

  function predkosc(h0, m0, h1, m1) {
    var a = num(h0), b = num(m0), c = num(h1), d = num(m1);
    if (a == null || b == null || c == null || d == null) return null;
    var lata = (d - b) / 12;
    if (lata <= 0) return null;
    var v = (c - a) / lata;
    return isFinite(v) ? v : null;
  }

  // ── Normy ──

  function prog(ageMonths) {
    var m = num(ageMonths);
    if (m == null || m < 0) return null;
    var lat = m / 12;
    for (var i = 0; i < PROGI_WIEKOWE.length; i++) {
      if (lat < PROGI_WIEKOWE[i].doLat) {
        return { threshold: PROGI_WIEKOWE[i].prog, label: PROGI_WIEKOWE[i].etykieta };
      }
    }
    return null;
  }

  function pustaOcena() {
    return {
      threshold: null, slow: false, alarm: false,
      severity: null, basis: null, normLabel: null, note: null,
      aboveNormAge: false
    };
  }

  /* Hierarchia norm — przeniesiona 1:1 z vilda_trajectory_analysis.js (applyVelocityNorms +
   * assessPubertalVelocity). `porownuj` = czy tempo pochodzi z okna rocznego; bez okna norma
   * jest nazywana (basis/normLabel), ale `slow` nigdy nie pada. */
  function ocen(v, targetM, plec, ctx, porownuj) {
    var out = pustaOcena();
    var target = num(targetM);
    if (num(v) == null || target == null) return out;
    var thr = prog(target);
    var ts = ctx && ctx.tannerStage != null ? ctx.tannerStage : null;
    if (thr) {
      // < 10 lat: normy wg wieku metrykalnego. Tanner IV–V znosi ocenę także tutaj
      // (GROWTH-VELO-TANNER-U10, zgłoszenie właściciela).
      if (ts === 4 || ts === 5) {
        out.basis = 'tanner45';
        out.note = 'po skoku pokwitaniowym (Tanner ' + (ts === 4 ? 'IV' : 'V')
          + ') — deceleracja fizjologiczna; norma tempa dla wieku ' + fmtAgeM(target)
          + ' nie ma tu zastosowania';
        return out;
      }
      out.threshold = thr;
      out.basis = ts != null ? 'ageTanner' : 'age';
      out.normLabel = thr.label || null;
      out.slow = !!(porownuj && v < thr.threshold);
      out.severity = out.slow ? 'danger' : null;
      out.alarm = out.slow;
      return out;
    }
    if (target / 12 < 10) return out; // brak progu poniżej 1 r.ż. itp. — bez oceny
    // ── ≥ 10 lat: hierarchia wg dostępnych danych (akceptacja właściciela 2026-08-08) ──
    var isM = sexMK(plec) === 'M';
    var genMax = isM ? P.PUB_AGE_MAX_M_M : P.PUB_AGE_MAX_F_M;
    if (ts != null) {
      if (ts === 1) {
        out.basis = 'tanner1';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok przed skokiem (Tanner I)';
        out.slow = !!(porownuj && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'danger' : null;
        out.alarm = out.slow;
        return out;
      }
      if (ts === 2 || ts === 3) {
        out.basis = 'tanner23';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok w trakcie pokwitania (Tanner ' + (ts === 2 ? 'II' : 'III') + ')';
        out.slow = !!(porownuj && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'warn' : null;
        return out;
      }
      out.basis = 'tanner45';
      out.note = 'po skoku pokwitaniowym (Tanner ' + (ts === 4 ? 'IV' : 'V') + ') — deceleracja fizjologiczna';
      return out;
    }
    var ba = ctx && ctx.boneAge ? ctx.boneAge : null;
    var baFresh = ba && (ba.atAgeMonths == null || (target - ba.atAgeMonths) <= P.BONE_AGE_FRESH_M);
    if (ba && baFresh) {
      var thrBA = prog(ba.baMonths);
      if (thrBA) {
        out.basis = 'boneAge';
        out.normLabel = (thrBA.label || '') + ' — wg wieku kostnego ' + fmtAgeM(ba.baMonths);
        out.slow = !!(porownuj && v < thrBA.threshold);
        out.severity = out.slow ? 'warn' : null;
        return out;
      }
      if (ba.baMonths >= P.PUB_AGE_MIN_M && ba.baMonths <= genMax) {
        out.basis = 'boneAgeGeneric';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok — wg wieku kostnego ' + fmtAgeM(ba.baMonths) + ' (okres okołopokwitaniowy)';
        out.slow = !!(porownuj && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'warn' : null;
        return out;
      }
      out.aboveNormAge = true;
      return out;
    }
    if (target <= genMax) {
      out.basis = 'generic';
      out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok (okres okołopokwitaniowy — możliwy późny skok)';
      out.slow = !!(porownuj && v < P.PUB_VELO_MIN);
      out.severity = out.slow ? 'warn' : null;
      return out;
    }
    out.aboveNormAge = true;
    return out;
  }

  // ── Dobór pary ──

  /* Historia posortowana rosnąco po wieku. Najpierw okno 9–15 mies. (najbliżej 12), potem
   * ostatni punkt ≥ 6 mies. wstecz. Dokładnie ta kolejność obowiązywała w trzech kopiach. */
  function wybierzPare(hist, targetM) {
    var best = null, bestD = Infinity;
    for (var i = hist.length - 1; i >= 0; i--) {
      var g = targetM - hist[i].ageMonths;
      if (g < P.ROCZNE_MIN_M || g < P.ROCZNE_OKNO_MIN_M || g > P.ROCZNE_OKNO_MAX_M) continue;
      var d = Math.abs(g - P.ROCZNE_CEL_M);
      if (d < bestD) { best = hist[i]; bestD = d; }
    }
    if (best) return { punkt: best, gapM: targetM - best.ageMonths, rodzaj: 'roczne' };
    for (var j = hist.length - 1; j >= 0; j--) {
      var gj = targetM - hist[j].ageMonths;
      if (gj >= P.ROCZNE_MIN_M) {
        return {
          punkt: hist[j], gapM: gj,
          rodzaj: gj <= P.ROCZNE_OKNO_MAX_M ? 'roczne' : 'ostatni-odcinek'
        };
      }
    }
    return null;
  }

  /* Model tempa. Kształt pól `cmPerYear/gapM/usedLastYear/wiekSrodekMies/plec/threshold/slow/
   * alarm/severity/basis/normLabel/note/aboveNormAge` jest ZACHOWANY z heightVelocity()
   * trajektorii — konsumenci (podsumowanie, opis pacjenta, epikryza, Karta pacjenta) czytają
   * je bez zmian. Nowe pola: `rodzaj`, `para`, `wersja`. */
  function policz(historia, dzisiaj, plec, ctx) {
    try {
      var hist = (Array.isArray(historia) ? historia : []).map(punkt).filter(Boolean)
        .sort(function (a, b) { return a.ageMonths - b.ageMonths; });
      var cur = punkt(dzisiaj);
      if (!cur || !hist.length) return null;
      var para = wybierzPare(hist, cur.ageMonths);
      if (!para) return null;
      var v = predkosc(para.punkt.height, para.punkt.ageMonths, cur.height, cur.ageMonths);
      if (v == null) return null;
      var roczne = para.rodzaj === 'roczne';
      var out = {
        wersja: VERSION,
        rodzaj: para.rodzaj,
        cmPerYear: v,
        gapM: para.gapM,
        usedLastYear: roczne,
        para: { od: { ageMonths: para.punkt.ageMonths, height: para.punkt.height },
          do: { ageMonths: cur.ageMonths, height: cur.height } },
        // Środek przedziału, bo normy HV-SDS są nim indeksowane (tak zbudowano oba źródła LMS).
        wiekSrodekMies: cur.ageMonths - para.gapM / 2,
        plec: sexMK(plec)
      };
      var oc = ocen(v, cur.ageMonths, plec, ctx, roczne);
      for (var k in oc) if (Object.prototype.hasOwnProperty.call(oc, k)) out[k] = oc[k];
      return out;
    } catch (e) {
      return null;
    }
  }

  /* Ocena już policzonej wartości (np. z zapisanego rekordu) tą samą hierarchią. Okno roczne
   * odtwarzane z odstępu: 6–15 mies. — tak samo, jak wybiera je policz(). */
  function ocenWartosc(v, gapM, ageMonths, plec, ctx) {
    var vv = num(v), target = num(ageMonths);
    if (vv == null || target == null) return null;
    var g = num(gapM);
    var roczne = g != null && g >= P.ROCZNE_MIN_M && g <= P.ROCZNE_OKNO_MAX_M;
    var out = {
      wersja: VERSION,
      rodzaj: g == null ? null : (roczne ? 'roczne' : 'ostatni-odcinek'),
      cmPerYear: vv, gapM: g, usedLastYear: roczne,
      wiekSrodekMies: g != null ? target - g / 2 : null,
      plec: sexMK(plec)
    };
    var oc = ocen(vv, target, plec, ctx, roczne);
    for (var k in oc) if (Object.prototype.hasOwnProperty.call(oc, k)) out[k] = oc[k];
    return out;
  }

  // ── Odcinki (wiersze historii, PDF, monitor GH, sejf) ──

  function odcinek(a, b, opcje) {
    var pa = punkt(a), pb = punkt(b);
    if (!pa || !pb) return null;
    var minM = opcje && num(opcje.minMies) != null ? num(opcje.minMies) : P.ODCINEK_MIN_M;
    var gapM = pb.ageMonths - pa.ageMonths;
    if (gapM <= 0) return { cmPerYear: null, gapM: gapM, krotki: true, powod: 'odstep-niedodatni' };
    var v = predkosc(pa.height, pa.ageMonths, pb.height, pb.ageMonths);
    return { cmPerYear: v, gapM: gapM, krotki: gapM < minM, powod: null };
  }

  function odcinki(punkty, opcje) {
    var pts = (Array.isArray(punkty) ? punkty : []).map(punkt).filter(Boolean)
      .sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    var out = [];
    for (var i = 1; i < pts.length; i++) {
      var o = odcinek(pts[i - 1], pts[i], opcje);
      if (o) out.push({ od: pts[i - 1], do: pts[i], cmPerYear: o.cmPerYear, gapM: o.gapM, krotki: o.krotki, powod: o.powod });
    }
    return out;
  }

  // ── Jedno słownictwo ──

  /* Werdykt w słowach — przeniesiony z velocityAssessment() trajektorii (ten sam tekst
   * widzi lekarz na karcie, w opisie pacjenta i w podsumowaniu). Zwraca {cls, text, short, note}. */
  function ocenaTekst(vel) {
    if (!vel) return null;
    if (vel.slow && vel.severity === 'danger') {
      return { cls: 'bad', text: 'poniżej normy dla wieku' + (vel.normLabel ? ' (' + vel.normLabel + ')' : ''), short: 'poniżej normy dla wieku', note: vel.normLabel ? 'norma ' + vel.normLabel : null };
    }
    if (vel.slow) return { cls: 'warn', text: 'do oceny — ' + (vel.normLabel || 'poniżej progu przesiewowego'), short: 'do oceny', note: vel.normLabel ? 'norma ' + vel.normLabel : 'poniżej progu przesiewowego' };
    if (vel.note) return { cls: 'stable', text: vel.note, short: vel.note, note: null };
    if (vel.basis && vel.usedLastYear) return { cls: 'good', text: 'w normie' + (vel.normLabel ? ' (' + vel.normLabel + ')' : ''), short: 'w normie', note: vel.normLabel ? 'norma ' + vel.normLabel : null };
    if (vel.aboveNormAge) return { cls: 'stable', text: 'poza oknem automatycznej oceny normy tempa', short: 'poza oknem automatycznej oceny normy tempa', note: null };
    if (!vel.usedLastYear) return { cls: 'stable', text: 'odstęp pomiarów poza oknem oceny, bez porównania z normą', short: 'odstęp pomiarów poza oknem oceny, bez porównania z normą', note: null };
    return null;
  }

  /* Odstęp zawsze w miesiącach — naturalna jednostka między wizytami. */
  function odstepTekst(gapM) {
    var g = num(gapM);
    if (g == null || g <= 0) return '';
    var m = Math.round(g);
    return 'z ' + m + ' mies.';
  }

  /* Werdykt do wiersza — bez nawiasu w nawiasie. Gdy norma sama ma nawias (reguły
   * okołopokwitaniowe: „≥4 cm/rok (okres okołopokwitaniowy — …)"), rozdziela przecinkiem;
   * ta sama zasada, co splaszcz() w opisie pacjenta. */
  function ocenaZdanie(oc) {
    if (!oc) return '';
    if (!oc.note) return oc.short;
    return oc.note.indexOf('(') >= 0 ? oc.short + ', ' + oc.note : oc.short + ' (' + oc.note + ')';
  }

  /* Gotowe kawałki do każdej prezentacji. `zdanie` to pełny wiersz:
   *   „Tempo wzrastania: 5,3 cm/rok (z 11 mies.) — w normie (norma ≥5 cm/rok)"
   *   „Tempo wzrastania: 4,1 cm/rok (z 36 mies., poza oknem oceny normy)" */
  function formatuj(vel) {
    if (!vel || num(vel.cmPerYear) == null) return null;
    var wartosc = fmt1(vel.cmPerYear) + ' cm/rok';
    var odstep = odstepTekst(vel.gapM);
    var oc = ocenaTekst(vel);
    if (oc) oc.zdanie = ocenaZdanie(oc);
    var pozaOknem = !vel.usedLastYear;
    var nawias = odstep
      ? ' (' + odstep + (pozaOknem ? ', poza oknem oceny normy' : '') + ')'
      : (pozaOknem ? ' (poza oknem oceny normy)' : '');
    var zdanie = 'Tempo wzrastania: ' + wartosc + nawias;
    if (oc && !pozaOknem) zdanie += ' — ' + oc.zdanie;
    return {
      etykieta: 'Tempo wzrastania',
      wartosc: wartosc,
      odstep: odstep,
      pozaOknem: pozaOknem,
      ocena: pozaOknem ? null : oc,
      zdanie: zdanie
    };
  }

  w.VildaTempoWzrastania = {
    version: VERSION,
    P: P,
    PROGI_WIEKOWE: PROGI_WIEKOWE,
    predkosc: predkosc,
    prog: prog,
    ocen: ocen,
    wybierzPare: wybierzPare,
    policz: policz,
    ocenWartosc: ocenWartosc,
    odcinek: odcinek,
    odcinki: odcinki,
    ocenaTekst: ocenaTekst,
    odstepTekst: odstepTekst,
    formatuj: formatuj,
    fmtAgeM: fmtAgeM
  };
})(typeof window !== 'undefined' ? window : globalThis);
