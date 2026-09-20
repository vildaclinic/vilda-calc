/* vilda_postepy_doroslego_wydruk.js — WYDRUK postępów redukcji masy u dorosłego.
 *
 * P-POSTEPY rata 4 (decyzja właściciela: „2. poproszę dwa warianty do wyboru").
 *
 * DWA WARIANTY TO PROFILE TREŚCI, NIE DWIE TECHNOLOGIE:
 *   pacjent   — jedna kartka dla pacjenta: duży wykres masy, cztery liczby, kamienie milowe
 *               zwykłym językiem. Bez nazw leków, bez ChPL, bez cytowań.
 *   kliniczny — do dokumentacji: nagłówek identyfikacyjny, oba wykresy, tabela pomiarów,
 *               kamienie milowe, punkt oceny wg ChPL i stopka ze źródłami i zastrzeżeniami.
 *
 * DLACZEGO BEZ BIBLIOTEK PDF. Repozytorium ma dojrzały wzorzec html2canvas + jsPDF
 * (`vilda_patient_report.js`), ale obie biblioteki są ładowane LENIWIE Z CDN
 * (`VildaDeps.ensurePdfLibraries`, jspdf@2.5.1 + html2canvas@1.4.1). Vilda jest PWA i ma
 * działać bez sieci, a wykres postępów to czysty SVG — czyli dokładnie to, co html2canvas
 * rasteryzuje najsłabiej. Zamiast tego budujemy SAMODZIELNY DOKUMENT HTML z wklejonym SVG:
 *   - działa offline, bez jednej linijki pobranej z sieci;
 *   - zostaje WEKTOROWY, więc drukuje się ostro w każdej rozdzielczości;
 *   - „Zapisz jako PDF" daje okno druku przeglądarki, to samo, którego lekarz już używa.
 * Rozpoznanie sugerowało rozdzielić warianty na dwa generatory (canvas→jsPDF dla pacjenta,
 * DOM→html2canvas→jsPDF do dokumentacji). Odrzucone świadomie: dwa generatory dla jednej
 * funkcji to dwa miejsca, w których te same liczby mogą się rozjechać — czyli dokładnie ten
 * dług, który skasowało P-CHPL. Jeden model, jeden budowniczy, dwa profile.
 *
 * WARSTWA. Ten plik robi EFEKTY (nowe okno, druk, pobranie pliku). Treść składa
 * `vilda_postepy_doroslego_ui.js`, liczby liczy `vilda_postepy_doroslego.js`.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  var WARIANTY = [
    {
      id: 'pacjent',
      nazwa: 'Dla pacjenta',
      opis: 'Jedna kartka: duży wykres masy, najważniejsze liczby i kamienie milowe zwykłym językiem.',
    },
    {
      id: 'kliniczny',
      nazwa: 'Do dokumentacji',
      opis: 'Nagłówek identyfikacyjny, oba wykresy, tabela pomiarów, punkt oceny wg ChPL i źródła.',
    },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ui() {
    return (w && w.VildaPostepyDoroslegoUI) || null;
  }

  /* Styl wydruku. Osobny od ekranowego: A4, bez cieni, bez tła kart — tusz kosztuje,
     a kartka ma być czytelna także po skopiowaniu na kserokopiarce. */
  var CSS_WYDRUK = ''
    + '@page{size:A4 portrait;margin:14mm 12mm;}'
    + '*{box-sizing:border-box;}'
    + 'body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
    + 'color:#0f2b33;font-size:11pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '.vw-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12mm;'
    + 'border-bottom:1.5pt solid #00838d;padding-bottom:3mm;margin-bottom:5mm;}'
    + '.vw-tytul{font-size:16pt;font-weight:700;margin:0;color:#00838d;}'
    + '.vw-pod{font-size:9.5pt;color:#5a6b72;margin:1mm 0 0;}'
    + '.vw-id{font-size:9.5pt;color:#5a6b72;text-align:right;white-space:pre-line;}'
    + '.vw-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 5mm;}'
    + '.vw-tile{border:0.8pt solid #d7e9ec;border-radius:2mm;padding:2.5mm 3mm;}'
    + '.vw-tile-l{font-size:8pt;font-weight:600;color:#5a6b72;}'
    + '.vw-tile-v{font-size:14pt;font-weight:700;line-height:1.2;}'
    + '.vw-tile-s{font-size:8pt;color:#5a6b72;}'
    + '.vw-chart{margin:0 0 5mm;}'
    + '.vw-chart svg{width:100%;height:auto;display:block;}'
    + '.vw-h2{font-size:11pt;font-weight:700;margin:0 0 2mm;color:#0f2b33;}'
    + '.vw-miles{list-style:none;margin:0 0 5mm;padding:0;}'
    + '.vw-mile{display:flex;gap:4mm;padding:1.2mm 0 1.2mm 3mm;border-left:2pt solid #5a6b72;margin-bottom:1mm;}'
    + '.vw-mile-w{font-size:8.5pt;font-weight:700;color:#5a6b72;min-width:30mm;}'
    + '.vw-mile-t{font-size:9.5pt;}'
    + 'table.vw-tab{width:100%;border-collapse:collapse;font-size:9pt;margin:0 0 5mm;}'
    + 'table.vw-tab th{text-align:left;font-weight:600;color:#5a6b72;border-bottom:0.8pt solid #d7e9ec;padding:1.5mm 2mm;}'
    + 'table.vw-tab td{padding:1.5mm 2mm;border-bottom:0.4pt solid #eef5f6;}'
    + 'table.vw-tab td.num{text-align:right;font-variant-numeric:tabular-nums;}'
    + '.vw-foot{font-size:7.5pt;color:#5a6b72;line-height:1.4;border-top:0.8pt solid #d7e9ec;padding-top:2.5mm;margin-top:4mm;}'
    + '.vw-zacheta{font-size:10.5pt;background:#eef7f2;border-radius:2mm;padding:3mm 4mm;margin:0 0 5mm;}'
    + '@media print{.vw-noprint{display:none!important;}}';

  function liczbaPl(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(dec == null ? 1 : dec).replace('.', ',');
    return (v < 0 ? '−' : '') + s;
  }

  function zeZnakiem(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + liczbaPl(v, dec);
  }

  function dataPl(iso) {
    var s = String(iso == null ? '' : iso).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  }

  function kafelki(model, wariant) {
    var seria = model.seria || [];
    if (!seria.length) return '';
    var odn = model.punktOdniesienia;
    var ost = seria[seria.length - 1];
    var k = [];
    function tile(l, v, u, s) {
      return '<div class="vw-tile"><div class="vw-tile-l">' + esc(l) + '</div>'
        + '<div class="vw-tile-v">' + esc(v) + (u ? ' <span style="font-size:9pt;font-weight:600;color:#5a6b72;">' + esc(u) + '</span>' : '') + '</div>'
        + (s ? '<div class="vw-tile-s">' + esc(s) + '</div>' : '') + '</div>';
    }
    k.push(tile('Masa na początku', liczbaPl(odn.masa, 1), 'kg', dataPl(odn.dateISO)));
    k.push(tile('Masa dzisiaj', liczbaPl(ost.masa, 1), 'kg', dataPl(ost.dateISO)));
    k.push(tile('Zmiana', zeZnakiem(ost.zmianaMasyKg, 1), 'kg', zeZnakiem(ost.zmianaMasyPct, 1) + '%'));
    if (wariant === 'kliniczny' && ost.bmi != null) {
      k.push(tile('BMI dzisiaj', liczbaPl(ost.bmi, 1), 'kg/m²',
        ost.klasa ? ost.klasa.etykieta : ''));
    } else if (model.nadir) {
      k.push(tile('Najniższa masa', liczbaPl(model.nadir.masa, 1), 'kg',
        model.nadir.ostatni ? 'to dzisiaj' : (model.nadir.tydzien + '. tydz.')));
    }
    return '<div class="vw-tiles">' + k.join('') + '</div>';
  }

  function kamienie(model, wariant) {
    var lista = model.kamienie || [];
    if (!lista.length) return '';
    /* Wariant dla pacjenta nie pokazuje punktu oceny wg ChPL — to decyzja lekarza
       o leku, nie informacja, z którą pacjent ma wyjść z gabinetu. */
    if (wariant === 'pacjent') {
      lista = lista.filter(function (k) { return k.typ !== 'punkt-chpl'; });
      if (!lista.length) return '';
    }
    var w2 = lista.map(function (k) {
      var kiedy = typeof k.tydzien === 'number'
        ? (k.tydzien + '. tydz.' + (k.dateISO ? ' · ' + dataPl(k.dateISO) : ''))
        : (k.dateISO ? dataPl(k.dateISO) : '');
      return '<li class="vw-mile"><span class="vw-mile-w">' + esc(kiedy) + '</span>'
        + '<span class="vw-mile-t">' + esc(k.opis)
        + (typeof k.masa === 'number' ? ' <b>' + liczbaPl(k.masa, 1) + ' kg</b>' : '')
        + '</span></li>';
    });
    return '<p class="vw-h2">Kamienie milowe</p><ul class="vw-miles">' + w2.join('') + '</ul>';
  }

  function tabela(model) {
    var seria = model.seria || [];
    if (!seria.length) return '';
    var w2 = seria.map(function (p) {
      return '<tr><td>' + esc(p.dateISO ? dataPl(p.dateISO) : '—') + '</td>'
        + '<td class="num">' + (typeof p.tydzien === 'number' ? p.tydzien : '—') + '</td>'
        + '<td class="num">' + liczbaPl(p.masa, 1) + '</td>'
        + '<td class="num">' + (p.bmi != null ? liczbaPl(p.bmi, 1) : '—') + '</td>'
        + '<td class="num">' + zeZnakiem(p.zmianaMasyPct, 1) + '</td>'
        + '<td>' + esc(p.klasa ? p.klasa.etykieta : '—') + '</td></tr>';
    });
    return '<p class="vw-h2">Pomiary</p><table class="vw-tab">'
      + '<thead><tr><th>Data</th><th>Tydz.</th><th>Masa [kg]</th><th>BMI</th>'
      + '<th>Zmiana [%]</th><th>Klasa</th></tr></thead><tbody>'
      + w2.join('') + '</tbody></table>';
  }

  function zachetaDlaPacjenta(model) {
    var seria = model.seria || [];
    if (!seria.length) return '';
    var ost = seria[seria.length - 1];
    if (typeof ost.zmianaMasyKg !== 'number') return '';
    if (ost.zmianaMasyKg < 0) {
      return '<p class="vw-zacheta">Od początku obserwacji masa ciała zmniejszyła się o <b>'
        + liczbaPl(-ost.zmianaMasyKg, 1) + ' kg</b> (' + liczbaPl(ost.ubytekPct, 1)
        + ' % masy początkowej).</p>';
    }
    /* Przyrost opisujemy tak samo rzeczowo. Wykres i tak go pokazuje, a ominięcie
       tematu na kartce dla pacjenta czytałoby się jak unik. */
    return '<p class="vw-zacheta">Od początku obserwacji masa ciała zwiększyła się o <b>'
      + liczbaPl(ost.zmianaMasyKg, 1) + ' kg</b>.</p>';
  }

  function stopka(model, wariant) {
    if (wariant === 'pacjent') {
      return '<p class="vw-foot">Wydruk z aplikacji Vilda. Wykres przedstawia zapisane pomiary '
        + 'masy ciała i nie zastępuje porady lekarskiej.</p>';
    }
    var cz = [];
    if (model.zestaw) cz.push('Pasma: ' + esc(model.zestaw.nazwa) + '. ' + esc(model.zestaw.zrodlo));
    if (model.odzysk && model.odzysk.liniaDoPokazania && model.odzysk.nazwa) {
      cz.push(esc(model.odzysk.nazwa) + '. ' + esc(model.odzysk.zrodlo));
    }
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && pd.nominalna) {
      cz.push('Punkt oceny wg ChPL postawiony przy nominalnym czasie zwiększania dawki ('
        + pd.titracjaNominalnaTyg + ' tyg.); rzeczywista data osiągnięcia dawki podtrzymującej '
        + 'nie jest zapisana w rekordzie.');
    } else if (pd && !pd.jest && pd.zdanie) {
      cz.push(esc(pd.zdanie));
    }
    (model.ostrzezenia || []).forEach(function (o) { cz.push(esc(o)); });
    cz = cz.filter(function (t) { return String(t).trim().length > 1; });
    return '<p class="vw-foot">' + cz.join(' ') + '</p>';
  }

  function naglowek(model, wariant, opcje) {
    var o = opcje || {};
    var tytul = wariant === 'pacjent' ? 'Moje postępy' : 'Postępy redukcji masy ciała';
    var pod = wariant === 'pacjent'
      ? 'Zmiany masy ciała w czasie'
      : ('Punkt odniesienia: ' + (model.punktOdniesienia
        ? (model.punktOdniesienia.zrodlo === 'start-leczenia' ? 'włączenie leczenia' : 'pierwszy pomiar')
        : '—'));
    var id = [];
    if (o.pacjent) id.push(esc(o.pacjent));
    if (wariant === 'kliniczny') {
      if (o.wiekLat != null) id.push('wiek: ' + esc(String(o.wiekLat)) + ' l.');
      if (model.leczenie && model.leczenie.lek) id.push('lek: ' + esc(model.leczenie.lek));
    }
    if (o.dataWydruku) id.push('wydruk: ' + esc(dataPl(o.dataWydruku) || o.dataWydruku));
    return '<div class="vw-hdr"><div><p class="vw-tytul">' + esc(tytul) + '</p>'
      + '<p class="vw-pod">' + esc(pod) + '</p></div>'
      + '<div class="vw-id">' + id.join('\n') + '</div></div>';
  }

  /** Samodzielny dokument HTML — wszystko w jednym pliku, bez sieci. */
  function buildDokument(model, opcje) {
    var o = opcje || {};
    var wariant = o.wariant === 'kliniczny' ? 'kliniczny' : 'pacjent';
    var U = ui();
    if (!model || !model.dostepne || !model.dostepne.ok || !U) return '';
    var masa = U.wykresMasy(model);
    if (!masa) return '';
    var bmi = wariant === 'kliniczny' ? U.wykresBmi(model) : '';

    var tresc = naglowek(model, wariant, o)
      + (wariant === 'pacjent' ? zachetaDlaPacjenta(model) : '')
      + kafelki(model, wariant)
      + '<div class="vw-chart">' + masa + '</div>'
      + (bmi ? '<div class="vw-chart">' + bmi + '</div>' : '')
      + kamienie(model, wariant)
      + (wariant === 'kliniczny' ? tabela(model) : '')
      + stopka(model, wariant);

    return '<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">'
      + '<title>' + esc(wariant === 'pacjent' ? 'Moje postępy' : 'Postępy redukcji masy ciała')
      + '</title><style>' + CSS_WYDRUK + '</style></head><body>' + tresc + '</body></html>';
  }

  /** Nazwa pliku: bez znaków, które psują zapis na dysku, i bez nazwiska bez potrzeby. */
  function nazwaPliku(wariant, opcje) {
    var o = opcje || {};
    var data = String(o.dataWydruku || '').slice(0, 10) || 'wydruk';
    var kto = String(o.pacjent || '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return ['postepy', wariant, kto, data].filter(Boolean).join('_') + '.html';
  }

  /* ---------- efekty ---------- */

  /** Druk przez ukrytą ramkę — bez otwierania karty, którą blokuje część przeglądarek. */
  function drukuj(model, opcje) {
    var html = buildDokument(model, opcje);
    if (!html || !w || !w.document) return false;
    try {
      var stara = w.document.getElementById('vilda-pd-wydruk-frame');
      if (stara && stara.parentNode) stara.parentNode.removeChild(stara);
      var f = w.document.createElement('iframe');
      f.id = 'vilda-pd-wydruk-frame';
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      w.document.body.appendChild(f);
      var d = f.contentWindow ? f.contentWindow.document : null;
      if (!d) return false;
      d.open();
      d.write(html);
      d.close();
      /* Druk dopiero po ułożeniu treści — inaczej część przeglądarek drukuje pustą stronę. */
      var start = function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* druk odwołany */ }
      };
      if (d.readyState === 'complete') w.setTimeout(start, 60);
      else f.addEventListener('load', function () { w.setTimeout(start, 60); });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Pobranie samodzielnego pliku HTML — otwiera się i drukuje bez aplikacji i bez sieci. */
  function pobierz(model, opcje) {
    var o = opcje || {};
    var html = buildDokument(model, o);
    if (!html || !w || !w.document) return false;
    try {
      var wariant = o.wariant === 'kliniczny' ? 'kliniczny' : 'pacjent';
      var blob = new w.Blob([html], { type: 'text/html;charset=utf-8' });
      var url = w.URL.createObjectURL(blob);
      var a = w.document.createElement('a');
      a.href = url;
      a.download = nazwaPliku(wariant, o);
      w.document.body.appendChild(a);
      a.click();
      w.setTimeout(function () {
        try { w.document.body.removeChild(a); w.URL.revokeObjectURL(url); } catch (e) { /* posprzątane */ }
      }, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  var API = {
    version: WERSJA,
    WARIANTY: WARIANTY.slice(),
    CSS_WYDRUK: CSS_WYDRUK,
    buildDokument: buildDokument,
    nazwaPliku: nazwaPliku,
    drukuj: drukuj,
    pobierz: pobierz,
  };

  try { Object.freeze(API); } catch (e) { /* zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoWydruk = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
