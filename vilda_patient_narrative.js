/* vilda_patient_narrative.js — opisowe podsumowanie pacjenta dla lekarza (silnik, bez UI).
 *
 * Czytelny modul wg AGENTS.md §2. Sklada kilka zdan w jezyku karty leczenia z wielkosci,
 * ktore aplikacja JUZ wylicza — i tylko z nich.
 *
 * ZASADA NADRZEDNA: ten modul NIE wprowadza zadnego progu, zakresu ani oceny klinicznej.
 * Kazdy werdykt pochodzi z window.VildaTrajectoryAnalysis (progi i zrodla tam, w P i w
 * naglowku tamtego pliku). Tutaj podejmowane sa wylacznie decyzje redakcyjne: ktore fakty
 * dostaja zdanie, w jakiej kolejnosci i jakim spojnikiem. Gdyby ten modul liczyl cokolwiek
 * sam, po pierwszej zmianie progu mowilby o pacjencie co innego niz karta.
 *
 * DLACZEGO KOLEJNOSC MA ZNACZENIE: kompozycja tworzy sugestie, ktorych nie stawia zadne
 * pojedyncze zdanie. „Spowolnienie wzrastania" tuz obok „opoznionego dojrzewania" czyta sie
 * jak rozpoznanie, choc kazde z osobna jest tylko obserwacja. Dlatego stan biezacy idzie
 * pierwszy (fakty), przebieg i tempo w srodku (obserwacje), a zastrzezenia do danych na
 * koncu — i nigdy nie sa pomijane, bo cisza nie moze uchodzic za norme.
 *
 * CZEGO TEN MODUL NIE ROBI: nie stawia rozpoznan. Opisuje obserwacje i ich podstawe
 * liczbowa. Rozpoznania stawia lekarz — od tego jest vilda_epicrisis.js, gdzie deklaruje
 * je swiadomie.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // Progi UJAWNIANIA, nie progi kliniczne. Bramkuja wylacznie zdanie „Do odnotowania: …",
  // czyli decyduja o tym, KIEDY opis przyznaje sie do wieku danych — nigdy o tym, jak
  // dane sa oceniane. Zadna ocena w tym module od nich nie zalezy, wiec nie sa zmiana
  // kliniczna w rozumieniu AGENTS.md §3.
  // 12 mies. dla pomiaru: to najdluzszy odstep, ktory Historia karty pacjenta uznaje za
  // zgodny z zaleceniem (dla dzieci >5 r.z.) — pomiar starszy jest juz poza rutyna wizyt.
  // 18 mies. dla wieku kostnego: polowa wiecej niz TANNER_FRESH_M karty (12 mies.), bo
  // wiek kostny zmienia sie wolniej niz stadium Tannera. Obie liczby sa celowo
  // zachowawcze — zamilkniecie o starych danych kosztuje wiecej niz zbedna adnotacja.
  var STARY_POMIAR_M = 12;
  var STARY_WIEK_KOSTNY_M = 18;

  function ta() {
    return (w && w.VildaTrajectoryAnalysis) || null;
  }

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // ── Formaty identyczne z karta (fmt/fmtS/fmtAgeM z vilda_trajectory_analysis.js) ──

  function fmt(v, dec) {
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(dec).replace('.', ',') : '—';
  }

  function fmtSds(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    return (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(1).replace('.', ',');
  }

  // Wartosc bezwzgledna SDS bez znaku — do zdan typu „obnizyla sie o 1,1 SD".
  function fmtSdsAbs(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    return Math.abs(s).toFixed(1).replace('.', ',');
  }

  function fmtAgeM(mo) {
    if (typeof mo !== 'number' || !isFinite(mo)) return '—';
    mo = Math.round(mo);
    var y = Math.floor(mo / 12), r = mo % 12;
    var ys = y ? y + (y === 1 ? ' rok' : (y >= 2 && y <= 4 ? ' lata' : ' lat')) : '';
    var rs = r ? r + ' mies.' : '';
    return ys && rs ? ys + ' ' + rs : (ys || rs || '0 mies.');
  }

  // Kanal centylowy w zapisie karty: „25–50 c.", „<3 c.", „>97 c.".
  function kanal(c) {
    var t = ta();
    if (!t || typeof t.chan !== 'function' || c == null || !isFinite(c)) return null;
    var etykieta = t.PARAMS && t.PARAMS.CHN ? t.PARAMS.CHN[t.chan(c)] : null;
    return etykieta ? etykieta + ' c.' : null;
  }

  // Skroty typu „mies." juz koncza sie kropka — druga bylaby bledem zapisu.
  function kropka(t) {
    var x = String(t == null ? '' : t).trim();
    if (!x) return x;
    return /[.!?]$/.test(x) ? x : x + '.';
  }

  function metryka(model, klucz) {
    if (!model || !model.metrics) return null;
    for (var i = 0; i < model.metrics.length; i += 1) {
      if (model.metrics[i].metric === klucz) return model.metrics[i];
    }
    return null;
  }

  // ── Zdania ──────────────────────────────────────────────────────────────────

  // 1. Stan biezacy — jedna linia, tak jak lekarz zapisuje pomiar w karcie.
  function zdanieStan(model) {
    var czesci = [];
    [['height', 'Wzrost', 'cm', 0], ['weight', 'masa', 'kg', 1], ['bmi', 'BMI', '', 1]]
      .forEach(function (def) {
        var m = metryka(model, def[0]);
        if (!m || !m.last) return;
        var k = kanal(m.last.c);
        var opis = def[1] + ' ' + fmt(m.last.value, def[3]) + (def[2] ? ' ' + def[2] : '');
        var w2 = [];
        if (k) w2.push(k);
        if (def[0] === 'height' && m.last.sd != null) w2.push('hSDS ' + fmtSds(m.last.sd));
        czesci.push(opis + (w2.length ? ' (' + w2.join(', ') + ')' : ''));
      });
    if (!czesci.length) return null;
    return { id: 'stan', tone: 'plain', text: kropka(czesci.join(', ')) };
  }

  // 2. Przebieg wzrastania — flaga deceleracji ma pierwszenstwo przed opisem ogolnym.
  function zdaniePrzebieg(model) {
    var m = metryka(model, 'height');
    if (!m || !m.first || !m.last) return null;
    if (m.redFlag) {
      return {
        id: 'przebieg',
        tone: 'bad',
        text: kropka('Od pomiaru w wieku ' + fmtAgeM(m.redFlag.baseAgeMonths)
          + ' pozycja centylowa wzrostu obniżyła się o ' + fmtSdsAbs(m.redFlag.dSds)
          + ' SD — obraz deceleracji wzrastania.')
      };
    }
    if (!m.total) return null;
    var kA = kanal(m.first.c), kB = kanal(m.last.c);
    var dSds = m.last.sd != null && m.first.sd != null ? m.last.sd - m.first.sd : null;
    var przejscie = kA && kB && kA !== kB ? ' z ' + kA + ' na ' + kB : (kB ? ' w paśmie ' + kB : '');
    return {
      id: 'przebieg',
      tone: m.total.t === 'bad' ? 'bad' : (m.total.t === 'warn' ? 'warn' : 'plain'),
      text: kropka('W obserwacji od ' + fmtAgeM(m.first.ageMonths) + ' do ' + fmtAgeM(m.last.ageMonths)
        + ' wzrost' + przejscie
        + (dSds != null ? ' (ΔhSDS ' + fmtSds(dSds) + ')' : '')
        + ' — ' + m.total.l)
    };
  }

  // 3. Najgłębszy odcinek — tylko gdy jest gorszy niż obraz całości i jest co porównywać.
  function zdanieOdcinek(model) {
    var m = metryka(model, 'height');
    if (!m || !m.worst || !m.worst.verdict) return null;
    if (m.segments.length < 2) return null;
    if (m.worst.verdict.t !== 'bad' && m.worst.verdict.t !== 'warn') return null;
    return {
      id: 'odcinek',
      tone: m.worst.verdict.t === 'bad' ? 'bad' : 'warn',
      text: kropka('Największa zmiana pozycji między ' + fmtAgeM(m.worst.a.ageMonths) + ' a '
        + fmtAgeM(m.worst.b.ageMonths) + ' (ΔhSDS ' + fmtSds(m.worst.dSds) + ') — '
        + m.worst.verdict.l)
    };
  }

  // 4. Tempo wzrastania — ocena brana WPROST z karty (velocityAssessment).
  function zdanieTempo(model) {
    var t = ta();
    var v = model && model.velocity;
    if (!v || v.cmPerYear == null) return null;
    var a = t && typeof t.velocityAssessment === 'function' ? t.velocityAssessment(v) : null;
    var okno = v.gapM != null ? ' (ostatnie ' + Math.round(v.gapM) + ' mies.)' : '';
    return {
      id: 'tempo',
      tone: a && a.cls === 'bad' ? 'bad' : (a && a.cls === 'warn' ? 'warn' : 'plain'),
      text: kropka('Tempo wzrastania ' + fmt(v.cmPerYear, 1) + ' cm/rok' + okno
        + (a ? ' — ' + werdyktTempa(a) : ''))
    };
  }

  // Werdykt tempa slowami karty, ale bez nawiasu w nawiasie. Karta sklada
  // „poniżej normy dla wieku (≥4 cm/rok przed skokiem (Tanner I))" — w zdaniu
  // czyta się to jak błąd składu. Te same dwa kawałki werdyktu (short, note)
  // pochodzą z velocityAssessment, więc parytet z kartą zostaje; zmienia się
  // wyłącznie interpunkcja. Przy „w normie" norma jest zbędna — lekarz nie
  // dopisuje w karcie zakresu, kiedy wynik w nim leży.
  function werdyktTempa(a) {
    if (!a) return '';
    if (!a.note || a.cls === 'good') return a.short || a.text;
    return (a.short || a.text) + ', ' + a.note;
  }

  // 5. Masa i BMI — zdanie tylko wtedy, gdy jest o czym mówić.
  function zdanieMasa(model) {
    var m = metryka(model, 'bmi');
    if (!m || !m.total || !m.first || !m.last) return null;
    if (m.total.t !== 'bad' && m.total.t !== 'warn') return null;
    var dSds = m.last.sd != null && m.first.sd != null ? m.last.sd - m.first.sd : null;
    var kA = kanal(m.first.c), kB = kanal(m.last.c);
    return {
      id: 'masa',
      tone: m.total.t === 'bad' ? 'bad' : 'warn',
      text: kropka('BMI od ' + fmtAgeM(m.first.ageMonths)
        + (kA && kB && kA !== kB ? ' przesunęło się z ' + kA + ' na ' + kB : ' w paśmie ' + (kB || '—'))
        + (dSds != null ? ' (ΔBMI-SDS ' + fmtSds(dSds) + ')' : '')
        + ' — ' + m.total.l)
    };
  }

  // 6. Potencjał rodzinny — sam opis liczbowy, BEZ oceny: progu „poniżej potencjału"
  //    aplikacja nie ma, a wymyślanie go tutaj byłoby zmianą kliniczną (AGENTS.md §3).
  function zdaniePotencjal(model, extra) {
    var mat = num(extra.motherHeight), ojc = num(extra.fatherHeight);
    var mph = num(extra.mph);
    var mpSds = num(extra.mphSds != null ? extra.mphSds : (model.context && model.context.mpSds));
    if (mat == null && ojc == null && mph == null) return null;
    var czesci = [];
    if (mat != null) czesci.push('matka ' + fmt(mat, 0) + ' cm');
    if (ojc != null) czesci.push('ojciec ' + fmt(ojc, 0) + ' cm');
    var txt = czesci.length ? 'Wzrost rodziców: ' + czesci.join(', ') + '. ' : '';
    if (mph != null) {
      txt += 'MPH ' + fmt(mph, 0) + ' cm' + (mpSds != null ? ' (mpSDS ' + fmtSds(mpSds) + ')' : '') + '.';
    }
    var h = metryka(model, 'height');
    if (mpSds != null && h && h.last && h.last.sd != null) {
      var d = h.last.sd - mpSds;
      txt += ' Aktualny wzrost dziecka ' + fmtSdsAbs(d) + ' SD '
        + (d < 0 ? 'poniżej' : 'powyżej') + ' potencjału rodzinnego.';
    }
    return txt.trim() ? { id: 'potencjal', tone: 'plain', text: txt.trim() } : null;
  }

  // 7. Wiek kostny — różnica opisana liczbowo, bez oceny.
  function zdanieWiekKostny(model, extra) {
    var ba = num(extra.boneAgeYears);
    if (ba == null || ba <= 0) return null;
    var przy = num(extra.boneAgeAtAgeMonths);
    if (przy == null) {
      var h = metryka(model, 'height');
      przy = h && h.last ? h.last.ageMonths : null;
    }
    if (przy == null) return null;
    var baM = Math.round(ba * 12);
    var roznica = baM - przy;
    var opis;
    if (Math.abs(roznica) < 3) opis = 'zgodny z wiekiem metrykalnym';
    else opis = (roznica < 0 ? 'opóźniony' : 'przyspieszony') + ' o ' + fmtAgeM(Math.abs(roznica));
    return {
      id: 'wiekKostny',
      tone: 'plain',
      text: kropka('Wiek kostny ' + fmtAgeM(baM) + ' wobec wieku metrykalnego ' + fmtAgeM(przy)
        + ' — ' + opis)
    };
  }

  // 8. Dojrzewanie — werdykt opóźnionego dojrzewania pochodzi z karty.
  function zdanieDojrzewanie(model) {
    var ctx = model && model.context;
    if (model && model.delayedPuberty) {
      var lim = model.sex === 'M' ? '14' : '13';
      var wiek = model.points && model.points.length
        ? model.points[model.points.length - 1].ageMonths : null;
      return {
        id: 'dojrzewanie',
        tone: 'warn',
        text: kropka('Tanner I' + (wiek != null ? ' w wieku ' + fmtAgeM(wiek) : '')
          + ' — powyżej ' + lim + ' lat, obraz opóźnionego dojrzewania.')
      };
    }
    if (ctx && ctx.tannerStage != null) {
      var rzym = ['', 'I', 'II', 'III', 'IV', 'V'][ctx.tannerStage] || String(ctx.tannerStage);
      return { id: 'dojrzewanie', tone: 'plain', text: 'Dojrzewanie płciowe: Tanner ' + rzym + '.' };
    }
    return null;
  }

  // 9. Prognoza wzrostu ostatecznego — wartości i wiarygodność liczone przez kartę
  //    zaawansowaną; tutaj wyłącznie złożenie zdania.
  function zdaniePrognoza(extra) {
    var lista = Array.isArray(extra.predictions) ? extra.predictions.filter(function (p) {
      return p && num(p.cm) != null;
    }) : [];
    if (!lista.length) return null;
    var opisy = lista.map(function (p) {
      var w2 = [];
      if (p.label) w2.push(p.label);
      if (num(p.errorHalfWidthCm) != null) w2.push('±' + fmt(num(p.errorHalfWidthCm), 1) + ' cm');
      if (p.reliabilityLabel) w2.push('wiarygodność ' + p.reliabilityLabel);
      return fmt(num(p.cm), 0) + ' cm' + (w2.length ? ' (' + w2.join(', ') + ')' : '');
    });
    var txt = 'Prognozowany wzrost ostateczny ' + opisy.join(', ');
    if (lista.length > 1 && extra.predictionAgreement) {
      txt += ' — zgodność metod ' + extra.predictionAgreement;
    }
    return { id: 'prognoza', tone: 'plain', text: kropka(txt) };
  }

  // 10. Zastrzeżenia do danych — ZAWSZE na końcu i nigdy pomijane, gdy jest co powiedzieć.
  //     Brak danych nie może wyglądać jak norma.
  function zdanieZastrzezenia(model, extra) {
    var uwagi = [];
    var odKiedy = num(extra.lastMeasuredMonthsAgo);
    if (odKiedy != null && odKiedy >= STARY_POMIAR_M) {
      uwagi.push('ostatni pomiar sprzed ' + Math.round(odKiedy) + ' mies.');
    }
    var ctx = model && model.context;
    if (ctx && ctx.tannerStale) {
      uwagi.push('stadium Tannera nieaktualne — pominięte w ocenie');
    }
    var ba = num(extra.boneAgeYears);
    var baOd = num(extra.boneAgeMonthsAgo);
    if (ba != null && baOd != null && baOd > STARY_WIEK_KOSTNY_M) {
      uwagi.push('wiek kostny oznaczony ' + Math.round(baOd) + ' mies. temu — pominięty w ocenie');
    }
    var v = model && model.velocity;
    if (v && v.cmPerYear != null && v.usedLastYear === false) {
      uwagi.push('odstęp pomiarów poza oknem oceny tempa');
    }
    if (!uwagi.length) return null;
    return {
      id: 'zastrzezenia',
      tone: 'plain',
      text: kropka('Do odnotowania: ' + uwagi.join('; '))
    };
  }

  // ── Złożenie ────────────────────────────────────────────────────────────────

  function compose(model, extra) {
    if (!model) return null;
    var e = extra && typeof extra === 'object' ? extra : {};
    var zdania = [
      zdanieStan(model),
      zdaniePrzebieg(model),
      zdanieOdcinek(model),
      zdanieTempo(model),
      zdanieMasa(model),
      zdaniePotencjal(model, e),
      zdanieWiekKostny(model, e),
      zdanieDojrzewanie(model),
      zdaniePrognoza(e),
      zdanieZastrzezenia(model, e)
    ].filter(Boolean);
    if (!zdania.length) return null;
    return {
      version: VERSION,
      analysisVersion: model.version || null,
      sentences: zdania,
      text: zdania.map(function (z) { return z.text; }).join(' ')
    };
  }

  function describe(input) {
    var t = ta();
    if (!t || typeof t.analyze !== 'function' || !input) return null;
    var model = t.analyze(input);
    if (!model) return null;
    return compose(model, input.narrative || input);
  }

  w.VildaPatientNarrative = {
    version: VERSION,
    describe: describe,
    compose: compose,
    formatAge: fmtAgeM,
    formatSds: fmtSds
  };
})(typeof window !== 'undefined' ? window : globalThis);
