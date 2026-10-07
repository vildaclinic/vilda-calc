/* vilda_gh_punkt_z_wiersza.js — punkt leczenia GH z wiersza karty zaawansowanej na Start (VildaGhPunktZWiersza).
 *
 * P-GH-PUNKT-Z-WIERSZA (D8, 2026-10-07; makieta zaakceptowana przez właściciela 2026-10-07). Karta „Zaawansowane
 * obliczenia wzrostowe” na Start: przy wierszu ręcznym (pomiar wpisany w karcie, nie wiersz punktu GH) przycisk
 * „Zapisz jako punkt leczenia GH” otwiera panel pod wierszem. Lekarz wybiera rodzaj wizyty, program, preparat, wpisuje
 * dawkę podawaną (pole puste na starcie) i opcjonalnie IGF-1. Pomiar (wiek, wzrost, masa, wiek kostny) bierze się
 * z wiersza. Zapis idzie wyłącznie przez VildaGhPunkty — te same reguły co punkt wsteczny w monitorze DocPro
 * (sprawdzRodzaj → polaZPodawanej('wsteczny') → punkt(noweId()) → zapisz). Po zapisie z modul: true wiersz ręczny
 * znika (funkcją karty, razem z lustrem w tabeli spożycia), a mostek pokazuje w karcie wiersz punktu GH.
 * Edycja i usuwanie punktu zostają w monitorze DocPro.
 *
 * Decyzje właściciela 2026-10-07: przycisk tylko wtedy, gdy na liście jest już punkt Włączenia leczenia; wiersze
 * punktów GH dostają etykietę „Punkt leczenia GH · rodzaj · poprawki w DocPro”; pole dawki jest puste.
 *
 * Funkcje czyste (eksport dla testów): pomiarWiersza, stanPrzycisku, ostatniPunkt, domyslne, preparatyProgramu,
 * schematPreparatu, poleDawki, etykietaWierszaGh, przygotujPunkt. Warstwa DOM: init (wołana raz po załadowaniu
 * strony). Moduł nie zmienia wzorów ani jednostek, nie pisze do ghTherapyDB i nie dotyka monitora DocPro.
 * Style: klasy w vilda_gh_punkt_z_wiersza.css (bez stylów wpisanych w elementy).
 */
(function (w) {
  'use strict';
  if (!w || !w.document) return;
  var d = w.document;

  var RODZAJE = ['start', 'continue', 'end'];
  var NAZWY_RODZAJOW = { start: 'Włączenie leczenia', continue: 'Kontynuacja leczenia', end: 'Zakończenie leczenia' };
  var TEKSTY = Object.freeze({
    przycisk: '＋ Zapisz jako punkt leczenia GH',
    niekompletny: 'Uzupełnij wiek, wzrost i masę w tym wierszu.',
    zajetyMiesiac: 'W tym miesiącu wieku jest już punkt leczenia GH.',
    naglowek: 'Nowy punkt leczenia GH z tego pomiaru',
    rodzaj: 'Rodzaj wizyty',
    zajety: { start: 'Jest już punkt Włączenia leczenia.', end: 'Jest już punkt Zakończenia leczenia.' },
    program: 'Program',
    preparat: 'Preparat',
    igf: 'IGF-1 (ng/ml, opcjonalnie)',
    dniIgf: 'Dni od dawki (opcjonalnie)',
    info: 'Po zapisaniu ten wiersz stanie się wierszem punktu leczenia GH. Poprawki punktu: DocPro → Monitorowanie leczenia GH.',
    anuluj: 'Anuluj',
    zapisz: 'Zapisz punkt leczenia',
    odswiez: 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.',
    bladZapisu: 'Nie zapisano punktu leczenia: przeglądarka nie zapisała listy punktów. Spróbuj ponownie.',
    naprawa: ' Naprawa: DocPro → Monitorowanie leczenia GH.'
  });

  function domyslneZrodlo(wiek) {
    return 'Program i preparat jak w ostatnim punkcie leczenia (' + wiek + ') — można zmienić.';
  }
  function zapisanoTekst(rodzaj, wiek) {
    return '✓ Zapisano punkt leczenia GH: ' + rodzaj + ', ' + wiek + ' Poprawki: DocPro → Monitorowanie leczenia GH.';
  }

  // ---------- funkcje czyste ----------

  function liczba(x) {
    var s = x == null ? '' : String(x).trim().replace(',', '.');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function fmt(x) {
    return String(x).replace('.', ',');
  }

  function wiekTekst(lata, miesiace) {
    return lata + ' l. ' + miesiace + ' mies.';
  }

  // Wartości pól wiersza (napisy, jak w polach) → liczby i czy pomiar jest kompletny (wiek > 0, wzrost i masa > 0).
  function pomiarWiersza(v) {
    var x = v || {};
    var lata = liczba(x.lata);
    var mies = liczba(x.miesiace);
    var miesiace = mies == null ? 0 : mies;
    var wzrost = liczba(x.wzrost);
    var masa = liczba(x.masa);
    var kompletny = lata != null && lata >= 0 && miesiace >= 0 && lata * 12 + miesiace > 0
      && wzrost != null && wzrost > 0 && masa != null && masa > 0;
    return {
      lata: lata, miesiace: miesiace, wzrost: wzrost, masa: masa, wiekKostny: liczba(x.wiekKostny),
      kompletny: kompletny, wiekMies: kompletny ? Math.round(lata * 12 + miesiace) : null,
      pusty: lata == null && mies == null && wzrost == null && masa == null,
      surowe: { lata: x.lata, miesiace: x.miesiace, wzrost: x.wzrost, masa: x.masa, wiekKostny: x.wiekKostny }
    };
  }

  function obiekty(lista) {
    return Array.isArray(lista) ? lista.filter(function (p) { return Object(p) === p; }) : [];
  }

  function wiekMiesPunktu(p) {
    return Math.round((Number(p.ageYears) || 0) * 12 + (Number(p.ageMonths) || 0));
  }

  // Przycisk w wierszu ręcznym: widoczny tylko przy gotowych modułach i punkcie Włączenia na liście, nie przy pustym
  // wierszu (karta zawsze ma pusty wiersz do wpisania pomiaru); nieaktywny (z powodem w podpowiedzi), gdy pomiar jest
  // niekompletny albo w tym miesiącu wieku jest już punkt.
  function stanPrzycisku(lista, pomiar, gotowe) {
    var L = obiekty(lista);
    if (!gotowe || !L.some(function (p) { return p.type === 'start'; }) || !pomiar || pomiar.pusty) {
      return { widoczny: false, aktywny: false, powod: null };
    }
    if (!pomiar.kompletny) return { widoczny: true, aktywny: false, powod: TEKSTY.niekompletny };
    if (L.some(function (p) { return wiekMiesPunktu(p) === pomiar.wiekMies; })) {
      return { widoczny: true, aktywny: false, powod: TEKSTY.zajetyMiesiac };
    }
    return { widoczny: true, aktywny: true, powod: null };
  }

  // Ostatni punkt = najstarszy wiek; przy równym wieku późniejszy na liście.
  function ostatniPunkt(lista) {
    var o = null;
    obiekty(lista).forEach(function (p) { if (!o || wiekMiesPunktu(p) >= wiekMiesPunktu(o)) o = p; });
    return o;
  }

  function programy(dane) {
    return dane && Array.isArray(dane.programy) ? dane.programy : [];
  }

  function preparatyProgramu(dane, kod) {
    var p = programy(dane).filter(function (x) { return x.kod === kod; })[0];
    return p ? p.preparaty.slice() : [];
  }

  // Program i preparat ostatniego punktu, jeśli są w danych; inaczej pierwszy program i jego pierwszy preparat.
  function domyslne(lista, dane) {
    var o = ostatniPunkt(lista);
    var P = programy(dane);
    var program = o && P.some(function (x) { return x.kod === o.program; }) ? o.program : (P[0] ? P[0].kod : '');
    var leki = preparatyProgramu(dane, program);
    var preparat = o && leki.indexOf(o.drug) >= 0 ? o.drug : (leki[0] || '');
    return { program: program, preparat: preparat, punkt: o };
  }

  function schematPreparatu(E, lek) {
    var p = E && typeof E.preparat === 'function' ? E.preparat(lek) : null;
    return p && p.schemat ? p.schemat : 'dobowy';
  }

  // Etykieta i przykład pola dawki — jak w formularzu punktu wstecznego monitora (ghRetroDoseLabelUpdate).
  function poleDawki(schemat) {
    if (schemat === 'tygodniowy') return { etykieta: 'Dawka podawana (mg/tydzień)', przyklad: 'np. 4,9' };
    if (schemat === 'naPodanie') return { etykieta: 'Dawka na podanie, 2× na dobę (mg)', przyklad: 'np. 0,8' };
    return { etykieta: 'Dawka podawana (mg/dobę)', przyklad: 'np. 0,9' };
  }

  function etykietaWierszaGh(punkt) {
    var rodzaj = punkt && NAZWY_RODZAJOW[punkt.type] ? NAZWY_RODZAJOW[punkt.type] : 'punkt';
    return 'Punkt leczenia GH · ' + rodzaj + ' · poprawki w DocPro';
  }

  // Punkt z pomiaru wiersza i wyboru w panelu — reguły punktu wstecznego z VildaGhPunkty. Zwraca {ok, punkt} albo
  // {ok:false, komunikat} z tekstem odmowy z API (te same komunikaty co w monitorze).
  function przygotujPunkt(A, lista, pomiar, wybor) {
    var r = A.sprawdzRodzaj(lista, wybor.typ);
    if (!r.ok) return { ok: false, komunikat: r.komunikat };
    var s = pomiar.surowe;
    var wynik = A.polaZPodawanej({
      typ: wybor.typ, lata: s.lata, miesiace: s.miesiace, masa: s.masa, wzrost: s.wzrost, wiekKostny: s.wiekKostny,
      podawana: wybor.podawana, preparat: wybor.preparat || null, program: wybor.program || null,
      igf1: wybor.igf1, dniIgf: wybor.dniIgf
    }, 'wsteczny');
    if (!wynik.ok) return { ok: false, komunikat: wynik.komunikat };
    return { ok: true, punkt: A.punkt(A.noweId(), wynik.pola) };
  }

  // ---------- warstwa DOM ----------

  function api() {
    var A = w.VildaGhPunkty;
    return A && A.wersja === 3 ? A : null;
  }
  function dawkaModul() {
    var E = w.VildaGhDawka;
    return E && typeof E.preparat === 'function' ? E : null;
  }
  function dane() {
    var D = w.VildaGhProgramyDane;
    return D && D.wersja === 1 ? D : null;
  }
  function gotowe() {
    var A = api();
    return !!(A && dane() && A.gotowe({ dawka: true }).ok);
  }
  function lista() {
    var A = api();
    try { return A ? A.wczytaj() : []; } catch (e) { return []; }
  }

  function el(tag, klasa, tekst) {
    var e = d.createElement(tag);
    if (klasa) e.className = klasa;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  function kontener() {
    return d.getElementById('advMeasurements');
  }
  function wierszGh(r) {
    return !!(r.getAttribute('data-gh-id') || r.getAttribute('data-gh-sync') === 'true');
  }
  function wartosciWiersza(r) {
    var v = function (s) { var e = r.querySelector(s); return e ? e.value : ''; };
    return { lata: v('.adv-age-years'), miesiace: v('.adv-age-months'), wzrost: v('.adv-height'), masa: v('.adv-weight'), wiekKostny: v('.adv-bone-age') };
  }
  function panelWiersza(r) {
    var n = r.nextElementSibling;
    return n && n.classList.contains('gh-z-wiersza-panel') ? n : null;
  }

  function etykieta(r, L) {
    var id = r.getAttribute('data-gh-id');
    var p = obiekty(L).filter(function (x) { return String(x.id) === String(id); })[0];
    var e = r.querySelector('.gh-z-wiersza-etykieta');
    if (!e) {
      e = el('div', 'gh-z-wiersza-etykieta');
      r.insertBefore(e, r.querySelector('.measure-row-top') || r.firstChild);
    }
    var t = etykietaWierszaGh(p || null);
    if (e.textContent !== t) e.textContent = t;
  }

  function przycisk(r, stan) {
    var akcje = r.querySelector('.adv-history-analysis-actions');
    var b = r.querySelector('.gh-z-wiersza-btn');
    if (!stan.widoczny || !akcje) {
      if (b) b.parentNode.removeChild(b);
      return;
    }
    if (!b) {
      b = el('button', 'gh-z-wiersza-btn', TEKSTY.przycisk);
      b.type = 'button';
      b.addEventListener('click', function () { otworz(r); });
      akcje.appendChild(b);
    }
    b.disabled = !stan.aktywny;
    if (stan.powod) b.title = stan.powod; else b.removeAttribute('title');
  }

  var planowane = false;
  function odswiez() {
    planowane = false;
    var c = kontener();
    if (!c) return;
    var L = lista();
    var ok = gotowe();
    Array.prototype.forEach.call(c.querySelectorAll('.measure-row'), function (r) {
      if (wierszGh(r)) {
        etykieta(r, L);
        przycisk(r, { widoczny: false });
        var p = panelWiersza(r);
        if (p) p.parentNode.removeChild(p);
        return;
      }
      var e = r.querySelector('.gh-z-wiersza-etykieta');
      if (e) e.parentNode.removeChild(e);
      przycisk(r, panelWiersza(r) ? { widoczny: false } : stanPrzycisku(L, pomiarWiersza(wartosciWiersza(r)), ok));
    });
    // Panel bez swojego wiersza (wiersz usunięty innym przyciskiem) znika.
    Array.prototype.forEach.call(c.querySelectorAll('.gh-z-wiersza-panel'), function (p) {
      var r = p.previousElementSibling;
      if (!r || !r.classList.contains('measure-row') || wierszGh(r)) p.parentNode.removeChild(p);
    });
  }
  function zaplanuj() {
    if (planowane) return;
    planowane = true;
    (w.requestAnimationFrame || function (f) { return w.setTimeout(f, 16); })(odswiez);
  }

  function status(tekst) {
    var c = kontener();
    if (!c || !c.parentNode) return;
    var s = d.getElementById('ghZWierszaStatus');
    if (!s) {
      s = el('div', 'gh-z-wiersza-status');
      s.id = 'ghZWierszaStatus';
      s.setAttribute('role', 'status');
      c.parentNode.insertBefore(s, c);
    }
    s.textContent = tekst;
  }
  function usunStatus() {
    var s = d.getElementById('ghZWierszaStatus');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function pole(etykietaTekstu, kontrolka, klasa) {
    var l = el('label', 'gh-z-wiersza-pole' + (klasa ? ' ' + klasa : ''));
    l.appendChild(el('span', 'gh-z-wiersza-pole-nazwa', etykietaTekstu));
    l.appendChild(kontrolka);
    return l;
  }
  function wypelnij(select, wartosci, etykiety, wybrana) {
    while (select.firstChild) select.removeChild(select.firstChild);
    wartosci.forEach(function (v, i) {
      var o = el('option', null, etykiety ? etykiety[i] : v);
      o.value = v;
      select.appendChild(o);
    });
    if (wybrana != null) select.value = wybrana;
  }

  function otworz(r) {
    var A = api();
    var D = dane();
    if (!A || !D || !gotowe()) { status(TEKSTY.odswiez); return; }
    usunStatus();
    Array.prototype.forEach.call(d.querySelectorAll('.gh-z-wiersza-panel'), function (p) { p.parentNode.removeChild(p); });
    var L = lista();
    var pomiar = pomiarWiersza(wartosciWiersza(r));
    var rodzaje = A.dostepneRodzaje(L);
    var dom = domyslne(L, D);
    var E = dawkaModul();

    var p = el('div', 'gh-z-wiersza-panel');
    p.id = 'ghZWierszaPanel';
    p.setAttribute('role', 'group');
    p.setAttribute('aria-labelledby', 'ghZWierszaNaglowek');
    var h = el('h4', 'gh-z-wiersza-naglowek', TEKSTY.naglowek);
    h.id = 'ghZWierszaNaglowek';
    p.appendChild(h);
    p.appendChild(el('p', 'gh-z-wiersza-pomiar', 'Wiek ' + wiekTekst(pomiar.lata, pomiar.miesiace) + ' · wzrost ' + fmt(pomiar.wzrost)
      + ' cm · masa ' + fmt(pomiar.masa) + ' kg · wiek kostny ' + (pomiar.wiekKostny != null ? fmt(pomiar.wiekKostny) + ' l.' : '—')));

    var fs = el('div', 'gh-z-wiersza-rodzaje');
    fs.setAttribute('role', 'radiogroup');
    fs.setAttribute('aria-labelledby', 'ghZWierszaRodzajNazwa');
    var fsNazwa = el('span', 'gh-z-wiersza-pole-nazwa gh-z-wiersza-rodzaje-nazwa', TEKSTY.rodzaj);
    fsNazwa.id = 'ghZWierszaRodzajNazwa';
    fs.appendChild(fsNazwa);
    RODZAJE.forEach(function (t) {
      var lab = el('label', 'gh-z-wiersza-rodzaj');
      var i = el('input');
      i.type = 'radio';
      i.name = 'ghZWierszaRodzaj';
      i.value = t;
      var dostepny = t === 'continue' || (t === 'start' ? rodzaje.start : rodzaje.end);
      i.disabled = !dostepny;
      i.checked = t === 'continue';
      if (!dostepny) lab.title = TEKSTY.zajety[t];
      lab.appendChild(i);
      lab.appendChild(el('span', null, NAZWY_RODZAJOW[t]));
      fs.appendChild(lab);
    });
    p.appendChild(fs);

    var prog = el('select');
    prog.id = 'ghZWierszaProgram';
    wypelnij(prog, programy(D).map(function (x) { return x.kod; }), programy(D).map(function (x) { return x.etykieta; }), dom.program);
    var lek = el('select');
    lek.id = 'ghZWierszaPreparat';
    wypelnij(lek, preparatyProgramu(D, dom.program), null, dom.preparat);
    var rzad1 = el('div', 'gh-z-wiersza-rzad gh-z-wiersza-rzad--jedna');
    rzad1.appendChild(pole(TEKSTY.program, prog));
    rzad1.appendChild(pole(TEKSTY.preparat, lek));
    p.appendChild(rzad1);
    if (dom.punkt) {
      p.appendChild(el('p', 'gh-z-wiersza-podpowiedz', domyslneZrodlo(wiekTekst(dom.punkt.ageYears, dom.punkt.ageMonths))));
    }

    var dawka = el('input');
    dawka.id = 'ghZWierszaDawka';
    dawka.type = 'number';
    dawka.min = '0';
    dawka.step = 'any';
    dawka.inputMode = 'decimal';
    var dawkaNazwa = el('span', 'gh-z-wiersza-pole-nazwa');
    var dawkaInfo = el('span', 'gh-z-wiersza-podpowiedz');
    dawkaInfo.id = 'ghZWierszaDawkaInfo';
    dawkaInfo.setAttribute('aria-live', 'polite');
    var dawkaPole = el('label', 'gh-z-wiersza-pole');
    dawkaPole.appendChild(dawkaNazwa);
    dawkaPole.appendChild(dawka);
    dawkaPole.appendChild(dawkaInfo);
    var igf = el('input');
    igf.id = 'ghZWierszaIgf1';
    igf.type = 'number';
    igf.min = '0';
    igf.step = 'any';
    igf.inputMode = 'decimal';
    var dni = el('input');
    dni.id = 'ghZWierszaDniIgf';
    dni.type = 'number';
    dni.min = '0';
    dni.step = '1';
    dni.inputMode = 'numeric';
    var rzad2 = el('div', 'gh-z-wiersza-rzad');
    rzad2.appendChild(dawkaPole);
    var igfKol = el('div', 'gh-z-wiersza-kolumna');
    igfKol.appendChild(pole(TEKSTY.igf, igf));
    igfKol.appendChild(pole(TEKSTY.dniIgf, dni));
    rzad2.appendChild(igfKol);
    p.appendChild(rzad2);

    var schemat = schematPreparatu(E, lek.value);
    function opisDawki() {
      var v = liczba(dawka.value);
      var o = E && v != null && v > 0 ? E.opisPola(lek.value, v, pomiar.masa, schemat === 'tygodniowy' ? 'tygodniowy' : 'dobowy') : null;
      dawkaInfo.textContent = o ? (o.ostrzezenie ? o.naKg + ' — ' + o.ostrzezenie : o.naKg) : '';
      dawkaInfo.classList.toggle('gh-z-wiersza-podpowiedz--uwaga', !!(o && o.ostrzezenie));
    }
    function etykietaDawki() {
      var f = poleDawki(schemat);
      dawkaNazwa.textContent = f.etykieta;
      dawka.placeholder = f.przyklad;
    }
    etykietaDawki();
    prog.addEventListener('change', function () {
      var leki = preparatyProgramu(D, prog.value);
      wypelnij(lek, leki, null, leki.indexOf(lek.value) >= 0 ? lek.value : leki[0]);
      lek.dispatchEvent(new w.Event('change'));
    });
    lek.addEventListener('change', function () {
      var nowy = schematPreparatu(E, lek.value);
      if (nowy !== schemat) {
        var przed = liczba(dawka.value);
        dawka.value = '';
        var komunikat = E && typeof E.komunikatZmianySchematu === 'function' ? E.komunikatZmianySchematu(schemat, nowy, przed) : '';
        schemat = nowy;
        etykietaDawki();
        dawkaInfo.textContent = komunikat;
        dawkaInfo.classList.toggle('gh-z-wiersza-podpowiedz--uwaga', !!komunikat);
        return;
      }
      opisDawki();
    });
    dawka.addEventListener('input', opisDawki);

    p.appendChild(el('p', 'gh-z-wiersza-info', TEKSTY.info));
    var blad = el('p', 'gh-z-wiersza-blad');
    blad.id = 'ghZWierszaBlad';
    blad.setAttribute('role', 'alert');
    blad.hidden = true;
    p.appendChild(blad);

    var akcje = el('div', 'gh-z-wiersza-akcje');
    var anuluj = el('button', 'gh-z-wiersza-anuluj', TEKSTY.anuluj);
    anuluj.type = 'button';
    anuluj.id = 'ghZWierszaAnuluj';
    var zapisz = el('button', 'gh-z-wiersza-zapisz', TEKSTY.zapisz);
    zapisz.type = 'button';
    zapisz.id = 'ghZWierszaZapisz';
    akcje.appendChild(anuluj);
    akcje.appendChild(zapisz);
    p.appendChild(akcje);

    anuluj.addEventListener('click', function () {
      if (p.parentNode) p.parentNode.removeChild(p);
      zaplanuj();
    });
    zapisz.addEventListener('click', function () {
      var wybrany = p.querySelector('input[name="ghZWierszaRodzaj"]:checked');
      zapiszPunkt(r, p, {
        typ: wybrany ? wybrany.value : 'continue', program: prog.value, preparat: lek.value,
        podawana: dawka.value, igf1: igf.value, dniIgf: dni.value
      });
    });

    r.parentNode.insertBefore(p, r.nextSibling);
    przycisk(r, { widoczny: false });
    dawka.focus();
  }

  function pokazBlad(p, tekst) {
    var b = p.querySelector('.gh-z-wiersza-blad');
    if (!b) return;
    b.textContent = tekst;
    b.hidden = !tekst;
  }

  // Import punktów do karty po zapisie; w oknie blokady mostka (__vildaSuppressGhAdvancedImportUntil) — po jego końcu.
  function importDoKarty() {
    var f = w.importTherapyPointsToAdvancedGrowth;
    if (typeof f !== 'function') return;
    var koniec = Number(w.__vildaSuppressGhAdvancedImportUntil || 0);
    var zwloka = koniec > Date.now() ? koniec - Date.now() + 60 : 0;
    w.setTimeout(function () { try { f(); } catch (e) { /* mostek sam zapisuje dziennik */ } }, zwloka);
  }

  function zapiszPunkt(r, p, wybor) {
    var A = api();
    if (!A || !gotowe()) { pokazBlad(p, TEKSTY.odswiez); return; }
    var L = A.wczytaj();
    var uszk = A.uszkodzone(L).length;
    if (uszk) { pokazBlad(p, A.komunikatyUszkodzonych(uszk).tresc + TEKSTY.naprawa); return; }
    var pomiar = pomiarWiersza(wartosciWiersza(r));
    var stan = stanPrzycisku(L, pomiar, true);
    if (!stan.aktywny) { pokazBlad(p, stan.powod || TEKSTY.niekompletny); return; }
    var wynik = przygotujPunkt(A, L, pomiar, wybor);
    if (!wynik.ok) { pokazBlad(p, wynik.komunikat); return; }
    var nowaLista = L.concat([wynik.punkt]);
    var z = A.zapisz(nowaLista);
    if (!z.modul) {
      try { w.ghTherapyPoints = L; } catch (e) { /* okno tylko do odczytu */ }
      pokazBlad(p, TEKSTY.bladZapisu);
      return;
    }
    if (p.parentNode) p.parentNode.removeChild(p);
    if (typeof w.vildaHandleAdvancedMeasurementRowRemove === 'function') w.vildaHandleAdvancedMeasurementRowRemove(r);
    else if (r.parentNode) r.parentNode.removeChild(r);
    importDoKarty();
    status(zapisanoTekst(NAZWY_RODZAJOW[wynik.punkt.type], wiekTekst(wynik.punkt.ageYears, wynik.punkt.ageMonths)));
    zaplanuj();
  }

  var zainicjowano = false;
  function init() {
    if (zainicjowano) return;
    var c = kontener();
    if (!c) return;
    zainicjowano = true;
    try {
      new w.MutationObserver(zaplanuj).observe(c, { childList: true, attributes: true, attributeFilter: ['data-gh-id', 'data-gh-sync'], subtree: true });
    } catch (e) { /* bez obserwatora odświeżają zdarzenia niżej */ }
    c.addEventListener('input', zaplanuj);
    c.addEventListener('change', zaplanuj);
    d.addEventListener('vilda:therapy-points-changed', zaplanuj);
    zaplanuj();
  }

  w.VildaGhPunktZWiersza = Object.freeze({
    wersja: 1,
    TEKSTY: TEKSTY,
    pomiarWiersza: pomiarWiersza,
    stanPrzycisku: stanPrzycisku,
    ostatniPunkt: ostatniPunkt,
    domyslne: domyslne,
    preparatyProgramu: preparatyProgramu,
    schematPreparatu: schematPreparatu,
    poleDawki: poleDawki,
    etykietaWierszaGh: etykietaWierszaGh,
    przygotujPunkt: przygotujPunkt,
    init: init,
    odswiez: odswiez
  });

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(typeof window !== 'undefined' ? window : null);
