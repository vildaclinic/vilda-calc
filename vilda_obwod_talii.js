/* vilda_obwod_talii.js — silnik oceny obwodu talii i stosunku talii do wzrostu (WHtR) u dorosłego.
 *
 * P-TALIA rata P (2026-09-22). Bezpaństwowy: progi bierze z `vilda_obwod_talii_dane.js`
 * (identyfikator zestawu jako argument, domyślne z rejestru), a wynik niesie nazwę zestawu
 * i populacji, żeby kafelek, PDF i rekord mogły powiedzieć, według czego oceniono.
 *
 * Kolory werdyktu są kluczami tej samej palety, co kafelek BMI w Statusie: 'ok' / 'improve' / 'alert'
 * / 'neutral' (bez werdyktu). Silnik nic nie zapisuje i nie czyta DOM.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  function liczba(v) { var n = Number(v); return typeof v !== 'boolean' && v !== '' && v != null && isFinite(n) ? n : null; }
  function dane() { return w.VildaObwodTaliiDane || null; }
  function zestaw(id, rodzaj) {
    var D = dane();
    if (!D || !D.ZRODLA) return null;
    var z = D.ZRODLA[id || (D.DOMYSLNE && D.DOMYSLNE[rodzaj])];
    return z && z.rodzaj === rodzaj ? z : null;
  }
  function metaZrodla(z) {
    return { id: z.id, nazwa: z.nazwa, populacja: z.populacja, populacjaOpis: z.populacjaOpis, cytowanie: z.cytowanie };
  }
  function fmt1(v) { return Number(v).toFixed(1).replace('.', ','); }
  function fmt2(v) { return Number(v).toFixed(2).replace('.', ','); }
  function calk(v) { return String(Math.round(Number(v))); }

  /* Obwód talii wobec progów WHO (płeć). Zwraca null bez obwodu, płci lub zestawu. */
  function ocenTalie(o) {
    o = o || {};
    var cm = liczba(o.obwodCm);
    var plec = String(o.plec || '').toUpperCase() === 'F' ? 'F' : String(o.plec || '').toUpperCase() === 'M' ? 'M' : null;
    var z = zestaw(o.zrodlo, 'talia');
    if (cm == null || cm <= 0 || !plec || !z || !z.progiCm || !z.progiCm[plec]) return null;
    var p = z.progiCm[plec];
    var kat = cm >= p.znacznie ? 'znacznie' : cm >= p.podwyzszone ? 'podwyzszone' : 'norma';
    var kto = plec === 'M' ? 'mężczyźni' : 'kobiety';
    return {
      obwodCm: cm,
      plec: plec,
      kategoria: kat,
      kolor: kat === 'znacznie' ? 'alert' : kat === 'podwyzszone' ? 'improve' : 'ok',
      etykieta: kat === 'znacznie' ? 'znacznie podwyższone ryzyko' : kat === 'podwyzszone' ? 'podwyższone ryzyko' : 'w normie',
      opisProgu: kat === 'znacznie' ? kto + ' ≥ ' + calk(p.znacznie) + ' cm'
        : kat === 'podwyzszone' ? kto + ' ≥ ' + calk(p.podwyzszone) + ' cm'
        : kto + ' < ' + calk(p.podwyzszone) + ' cm',
      progiCm: { podwyzszone: p.podwyzszone, znacznie: p.znacznie },
      zrodlo: metaZrodla(z)
    };
  }

  /* Stosunek talii do wzrostu wobec pasm NICE; przy BMI ≥ bmiMaks wartość bez werdyktu. */
  function ocenWHtR(o) {
    o = o || {};
    var cm = liczba(o.obwodCm), h = liczba(o.wzrostCm), bmi = liczba(o.bmi);
    var z = zestaw(o.zrodlo, 'whtr');
    if (cm == null || cm <= 0 || h == null || h <= 0 || !z || !z.progi) return null;
    var wartosc = cm / h;
    var wynik = { wartosc: wartosc, wartoscLabel: fmt2(wartosc), obwodCm: cm, wzrostCm: h, bmi: bmi, progi: z.progi, zrodlo: metaZrodla(z), nota: '' };
    if (bmi != null && liczba(z.bmiMaks) != null && bmi >= z.bmiMaks) {
      wynik.kategoria = 'poza-zakresem';
      wynik.kolor = 'neutral';
      wynik.etykieta = 'przy BMI ≥ ' + calk(z.bmiMaks) + ' wskaźnik nie różnicuje ryzyka';
      wynik.nota = 'wg NICE; ocena dla BMI < ' + calk(z.bmiMaks);
      return wynik;
    }
    var kat = wartosc >= z.progi.wysokie ? 'wysokie' : wartosc >= z.progi.podwyzszone ? 'podwyzszone' : 'norma';
    wynik.kategoria = kat;
    wynik.kolor = kat === 'wysokie' ? 'alert' : kat === 'podwyzszone' ? 'improve' : 'ok';
    wynik.etykieta = kat === 'wysokie' ? 'wysokie ryzyko (≥ ' + fmt1(z.progi.wysokie) + ')'
      : kat === 'podwyzszone' ? 'podwyższone ryzyko (' + fmt1(z.progi.podwyzszone) + '–' + fmt2(z.progi.wysokie - 0.01) + ')'
      : 'zdrowy rozkład tkanki tłuszczowej (< ' + fmt1(z.progi.podwyzszone) + ')';
    wynik.nota = 'wg NICE; ocena dla BMI < ' + calk(z.bmiMaks)
      + (liczba(z.progi.dolna) != null && wartosc < z.progi.dolna ? '; poniżej ' + fmt1(z.progi.dolna) + ' poza pasmami klasyfikacji' : '');
    return wynik;
  }

  function listaZrodel() {
    var D = dane();
    if (!D || !D.ZRODLA) return [];
    return Object.keys(D.ZRODLA).map(function (k) { var z = D.ZRODLA[k]; return { id: z.id, rodzaj: z.rodzaj, nazwa: z.nazwa, populacja: z.populacja, wiekOdLat: z.wiekOdLat }; });
  }

  w.VildaObwodTalii = Object.freeze({ WERSJA: WERSJA, ocenTalie: ocenTalie, ocenWHtR: ocenWHtR, listaZrodel: listaZrodel, formatujWHtR: fmt2 });
})(typeof window !== 'undefined' ? window : globalThis);
