/* vilda_gh_opakowania.js — ile wkładów, wstrzykiwaczy albo fiolek wydać na okres leczenia GH/IGF-1.
 *
 * P-GH-WAZNOSC (2026-10-05, decyzja właściciela D4). Karta GH/IGF-1 (gh_igf_therapy.js) liczyła dotąd
 * wyłącznie z ilości leku: sztuki = ⌈dawka × okres / zawartość sztuki⌉. Przy małej dawce otwarta sztuka
 * przeterminowuje się, zanim lek się skończy (ChPL, punkt 6.3), więc wynik zaniżał wydanie — pacjentowi
 * brakowało leku przed kontrolą. Ten moduł dokłada drugie ograniczenie i bierze większą z dwóch liczb:
 *
 *   sztukiZDawki    = ⌈mg na okres / zawartość sztuki⌉          (bez zmian względem karty)
 *   sztukiZWaznosci = ⌈dni / ważność po otwarciu⌉               (preparat dobowy)
 *                   = ⌈liczba dawek / dawek na sztukę⌉           (preparat tygodniowy)
 *   sztuki          = max(sztukiZDawki, sztukiZWaznosci)
 *
 * Preparat tygodniowy (Ngenla): dawki co 7 dni; jedna sztuka obsłuży dawki z dni 0, 7, 14, 21 i 28 od
 * pierwszego użycia, czyli ⌊28 / 7⌋ + 1 = 5, i najwyżej `maksUzyc` = 5 użyć (ChPL 6.3). Zakładamy jedno
 * wstrzyknięcie na dawkę — dawki wymagające dwóch wstrzyknięć i tak wyczerpują zawartość wcześniej.
 * Liczba dawek na okres jak dotąd w karcie: ⌈dni / 7⌉.
 *
 * Moduł jest bezpaństwowy: dane czyta z window.VildaGhOpakowaniaDane (vilda_gh_opakowania_dane.js),
 * a każdy wynik niesie źródło (dokument, punkt, wersja). Nieznany preparat → { znany: false } i karta
 * liczy jak dotąd. Rejestr: docs/clinical/ALGORITHMS.md, P-GH-WAZNOSC.
 */
(function (w) {
  'use strict';

  var ODSTEP_TYGODNIOWY_DNI = 7;

  function dane() {
    return w.VildaGhOpakowaniaDane || null;
  }

  function preparat(lek) {
    var d = dane();
    if (!d || typeof lek !== 'string') return null;
    return Object.prototype.hasOwnProperty.call(d.PREPARATY, lek) ? d.PREPARATY[lek] : null;
  }

  function liczbaDodatnia(x) {
    return typeof x === 'number' && isFinite(x) && x > 0;
  }

  /* Ile dawek tygodniowych obsłuży jedna sztuka w czasie ważności i limicie użyć. */
  function dawekNaSztuke(p) {
    var zWaznosci = Math.floor(p.waznoscDni / ODSTEP_TYGODNIOWY_DNI) + 1;
    return liczbaDodatnia(p.maksUzyc) ? Math.min(zWaznosci, p.maksUzyc) : zWaznosci;
  }

  /**
   * @param {{lek: string, dni: number, mgNaDobe?: number, mgNaTydzien?: number}} we
   *   mgNaDobe — dawka dobowa po zaokrągleniu do kroku (jak w karcie); mgNaTydzien — dawka tygodniowa (Ngenla).
   * @returns {{znany: boolean, lek: string, schemat?: string, dni?: number, mg?: number, dawki?: number|null,
   *   sztukiZDawki?: number, sztukiZWaznosci?: number, sztuki?: number, decydujeWaznosc?: boolean,
   *   waznoscDni?: number, maksUzyc?: number|null, dawekNaSztuke?: number|null, zrodlo?: object}}
   */
  function policz(we) {
    var lek = we && we.lek;
    var p = preparat(lek);
    var d = dane();
    if (!p) return { znany: false, lek: lek };
    var dni = we.dni;
    var wynik = {
      znany: true, lek: lek, schemat: p.schemat, dni: dni, mg: 0, dawki: null,
      sztukiZDawki: 0, sztukiZWaznosci: 0, sztuki: 0, decydujeWaznosc: false,
      waznoscDni: p.waznoscDni, maksUzyc: p.maksUzyc, dawekNaSztuke: null,
      zrodlo: d.ZRODLA[p.zrodlo]
    };
    if (!liczbaDodatnia(dni)) return wynik;
    if (p.schemat === 'tygodniowy') {
      var dawki = Math.ceil(dni / ODSTEP_TYGODNIOWY_DNI);
      var naTydzien = liczbaDodatnia(we.mgNaTydzien) ? we.mgNaTydzien : 0;
      wynik.dawki = dawki;
      wynik.dawekNaSztuke = dawekNaSztuke(p);
      wynik.mg = naTydzien * dawki;
      if (!(naTydzien > 0)) return wynik;
      wynik.sztukiZDawki = Math.ceil(wynik.mg / p.mgNaSztuke);
      wynik.sztukiZWaznosci = Math.ceil(dawki / wynik.dawekNaSztuke);
    } else {
      var naDobe = liczbaDodatnia(we.mgNaDobe) ? we.mgNaDobe : 0;
      wynik.mg = naDobe * dni;
      if (!(naDobe > 0)) return wynik;
      wynik.sztukiZDawki = Math.ceil(wynik.mg / p.mgNaSztuke);
      wynik.sztukiZWaznosci = Math.ceil(dni / p.waznoscDni);
    }
    wynik.sztuki = Math.max(wynik.sztukiZDawki, wynik.sztukiZWaznosci);
    wynik.decydujeWaznosc = wynik.sztukiZWaznosci > wynik.sztukiZDawki;
    return wynik;
  }

  function opisWaznosci(p) {
    var d = dane();
    var j = d.JEDNOSTKI[p.jednostka];
    var limit = p.waznoscDni + ' dni';
    if (liczbaDodatnia(p.maksUzyc)) limit += ' i najwyżej ' + p.maksUzyc + ' użyć';
    return { j: j, limit: limit, zrodlo: d.ZRODLA[p.zrodlo] };
  }

  /* Notka pod tabelą zapotrzebowania w karcie (dla lekarza). */
  function notka(lek) {
    var p = preparat(lek);
    if (!p) return '';
    var o = opisWaznosci(p);
    var tekst = 'Liczba ' + o.j.wiele + ' uwzględnia ważność po ' + o.j.czynnosc + ': ' + o.limit
      + ' (' + o.zrodlo.krotko + ')';
    if (p.schemat === 'tygodniowy') {
      tekst += ', czyli najwyżej ' + dawekNaSztuke(p) + ' dawek tygodniowych z jednego ' + o.j.dopelniacz;
    }
    return tekst + '. Po tym czasie ' + o.j.jeden + ' się wyrzuca, nawet jeśli ' + o.j.wNim + ' został lek. '
      + 'Wynik zaokrąglamy w górę.';
  }

  /* Dopisek do wiersza wyniku, gdy to ważność, a nie ilość leku, zdecydowała o liczbie. */
  function dopisek(wynik) {
    if (!wynik || !wynik.znany || !wynik.decydujeWaznosc) return '';
    var p = preparat(wynik.lek);
    var o = opisWaznosci(p);
    return ' · uwzględniono ważność ' + o.limit + ' (z samej ilości leku: ' + wynik.sztukiZDawki + ')';
  }

  w.VildaGhOpakowania = Object.freeze({
    policz: policz,
    notka: notka,
    dopisek: dopisek,
    preparat: preparat
  });
})(typeof window !== 'undefined' ? window : globalThis);
