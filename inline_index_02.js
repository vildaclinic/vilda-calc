/* Panel „Dojrzewanie płciowe" w formularzu głównym — ujawnianie i kontrola spójności.
 *
 * Panel jest jedynym miejscem wpisu danych pokwitaniowych (decyzja właściciela 2026-09-09);
 * reszta aplikacji czyta je przez vilda_pubertal_status.js. Ten sam skrypt obsługuje panel
 * na index.html i docpro.html (P-TOZSAMOSC, 2026-09-15).
 *
 * P-PANEL-ZWINIETY (decyzja właściciela 2026-09-16): panel jest DOMYŚLNIE ZWINIĘTY — także
 * wtedy, gdy pola niosą wartości (wczytany pacjent obiema drogami „Nowy pomiar" i „Odtwórz
 * zapisany stan", autozapis, odtworzenie sesji). Otwiera go wyłącznie lekarz przyciskiem.
 * Żeby wartości nie były niewidoczne bez śladu, przycisk zwiniętego panelu z danymi mówi
 * „+ Dane pokwitaniowe (wpisane)". Do 2026-09-16 panel otwierał się sam przy każdej wartości.
 */
(function () {
  var otwarty = false;
  var wrap = document.getElementById('tannerStageWrap');
  var extra = document.getElementById('pubertyExtraWrap');
  // Objętość jąder mieszka w panelu od SW 1.0.876 (decyzja właściciela): stan na dziś,
  // obok stadium. Kontener zwija się z panelem; etykietę dla dziewcząt chowa osobno
  // updateAdvancedGrowthSexSpecificFields() (po id, jak dotąd w karcie zaawansowanej).
  var jadraWrap = document.getElementById('testicularVolumeWrap');
  var select = document.getElementById('tannerStage');
  var btn = document.getElementById('tannerToggleBtn');
  if (!wrap || !select || !btn) return;

  var POLA = ['pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge',
    'pubertyGnrhaStatus', 'pubertyGnrhaStartAge', 'pubertyGnrhaStopAge', 'pubertyCdgp', 'advTesticularVolume'];

  function pole(id) { return document.getElementById(id); }

  function cokolwiekWpisane() {
    if (select.value !== '') return true;
    for (var i = 0; i < POLA.length; i += 1) {
      var e = pole(POLA[i]);
      if (e && String(e.value || '').trim() !== '') return true;
    }
    return false;
  }

  function plecFormularza() {
    try {
      var e = document.getElementById('sex');
      return e ? e.value : '';
    } catch (err) { return ''; }
  }

  function wzrostCmFormularza() {
    try {
      var v = parseFloat(document.getElementById('height').value);
      return isFinite(v) && v > 0 ? v : null;
    } catch (err) { return null; }
  }

  function wiekLatFormularza() {
    try {
      var l = parseFloat(document.getElementById('age').value);
      var m = parseFloat(document.getElementById('ageMonths').value);
      var lata = isFinite(l) ? l : 0;
      var mies = isFinite(m) ? m : 0;
      var razem = lata + mies / 12;
      return razem > 0 ? razem : null;
    } catch (err) { return null; }
  }

  // Sprzeczności liczy moduł statusu — tutaj tylko je pokazujemy. Nic nie jest kasowane
  // ani poprawiane za lekarza: dwa pola mówią co innego i to jego decyzja, które zmienić.
  function pokazSprzecznosci() {
    var slot = document.getElementById('pubertyConflicts');
    if (!slot) return;
    var S = window.VildaPubertalStatus;
    if (!S || typeof S.sprzecznosci !== 'function') { slot.style.display = 'none'; return; }
    var jadra = pole('advTesticularVolume');
    var lista = S.sprzecznosci({
      etap: select.value,
      plec: plecFormularza(),
      jadra: jadra ? jadra.value : '',
      wiekStartuLat: (pole('pubertyOnsetAge') || {}).value,
      wiekMenarcheLat: (pole('pubertyMenarcheAge') || {}).value,
      wzrostPrzyMenarcheCm: (pole('pubertyMenarcheHeight') || {}).value,
      wiekKostnyPrzyMenarcheLat: (pole('pubertyMenarcheBoneAge') || {}).value,
      gnrhaStatus: (pole('pubertyGnrhaStatus') || {}).value,
      gnrhaStartLat: (pole('pubertyGnrhaStartAge') || {}).value,
      gnrhaStopLat: (pole('pubertyGnrhaStopAge') || {}).value,
      wzrostCm: wzrostCmFormularza(),
      wiekLat: wiekLatFormularza()
    });
    if (!lista.length) { slot.style.display = 'none'; slot.textContent = ''; return; }
    slot.textContent = 'Do sprawdzenia: ' + lista.join(' ');
    slot.style.display = '';
  }

  // Objętość jąder dotyczy chłopców: u dziewczynki etykieta jest schowana i wyłączona —
  // te same trzy operacje, które robi updateAdvancedGrowthSexSpecificFields() w app.js,
  // żeby obie reguły mówiły to samo niezależnie od kolejności wywołań.
  function pokazJadraWgPlci() {
    if (!jadraWrap) return;
    var etykieta = jadraWrap.querySelector('label');
    var pole = document.getElementById('advTesticularVolume');
    if (!etykieta || !pole) return;
    var dziewczynka = String(plecFormularza() || '').trim().toUpperCase() === 'F';
    etykieta.hidden = dziewczynka;
    etykieta.style.display = dziewczynka ? 'none' : '';
    if (dziewczynka) etykieta.setAttribute('aria-hidden', 'true');
    else etykieta.removeAttribute('aria-hidden');
    pole.disabled = dziewczynka;
  }

  // GROWTH-PRED-PUB1: pola wieku GnRHa widać tylko przy statusie „w trakcie" albo „zakończone".
  function pokazWiekGnrha() {
    var wrap = document.getElementById('pubertyGnrhaAgesWrap');
    var st = pole('pubertyGnrhaStatus');
    if (!wrap || !st) return;
    var v = String(st.value || '');
    wrap.style.display = (otwarty && (v === 'w-trakcie' || v === 'zakonczone')) ? '' : 'none';
    var start = pole('pubertyGnrhaStartAge');
    var stop = pole('pubertyGnrhaStopAge');
    if (stop) stop.disabled = v !== 'zakonczone';
    // GROWTH-PRED-PUB4: pole schowane albo wyłączone nie może nieść wartości do rekordu —
    // zmiana statusu czyści wiek, który przestał mieć sens (rekord i edytor Karty mówią to samo).
    if (stop && v !== 'zakonczone' && stop.value !== '') stop.value = '';
    if (start && v !== 'w-trakcie' && v !== 'zakonczone' && start.value !== '') start.value = '';
  }

  /* P-PANEL-NAPIS (2026-09-19): napis na przycisku jest funkcją WARTOŚCI pól, więc musi się
     przeliczać przy KAŻDEJ ich zmianie — obojętne, czy wpisał je lekarz, czy wczytanie rekordu.
     Wydzielony z updateTannerVisibility celowo: nasłuch pola nie może uruchamiać całej reszty,
     bo pokazWiekGnrha() CZYŚCI wiek GnRHa, a to należy do zmiany statusu, nie do przepisania
     napisu. Patrz komentarz przy nasłuchach niżej. */
  function odswiezNapisPrzycisku() {
    btn.textContent = otwarty
      ? '− Dane pokwitaniowe'
      : (cokolwiekWpisane() ? '+ Dane pokwitaniowe (wpisane)' : '+ Dane pokwitaniowe');
  }

  window.updateTannerVisibility = function () {
    // Stan otwarcia zmienia tylko lekarz (przycisk) albo „Wyczyść" — wartości w polach
    // nie otwierają panelu (P-PANEL-ZWINIETY). Odświeżenie tylko rysuje bieżący stan.
    wrap.style.display = otwarty ? '' : 'none';
    if (extra) extra.style.display = otwarty ? '' : 'none';
    if (jadraWrap) jadraWrap.style.display = otwarty ? '' : 'none';
    pokazJadraWgPlci();
    btn.style.display = '';
    odswiezNapisPrzycisku();
    pokazWiekGnrha();
    pokazSprzecznosci();
  };

  /* Zwinięcie na żądanie — „Wyczyść wszystkie pola" ma zostawić formularz w stanie
   * wyjściowym, a więc także z zamkniętym panelem. */
  window.vildaZwinDanePokwitaniowe = function () {
    otwarty = false;
    window.updateTannerVisibility();
  };

  btn.addEventListener('click', function () {
    otwarty = !otwarty;
    window.updateTannerVisibility();
    if (otwarty) {
      setTimeout(function () { try { select.focus(); } catch (e) { /* brak fokusu */ } }, 30);
    }
  });

  /* Napis na przycisku przeliczało dotąd WYŁĄCZNIE updateTannerVisibility(), a te nasłuchy
     wołały samo pokazSprzecznosci — więc wypełnienie pola nigdy samo napisu nie odświeżało.
     Przy wczytaniu rekordu było to widać: applyLoadedData woła updateTannerVisibility PRZED
     blokiem, który wypełnia advTesticularVolume, i po wypełnieniu nic już napisu nie ruszało.
     Zwinięty panel pisał wtedy „+ Dane pokwitaniowe", choć dane w środku były — lekarz nie
     miał skąd wiedzieć, że coś jest schowane. Pilnuje tego P-PANEL-NAPIS w e2e. */
  function poZmianiePola() {
    pokazSprzecznosci();
    odswiezNapisPrzycisku();
  }

  POLA.forEach(function (id) {
    var e = pole(id);
    if (e) e.addEventListener('input', poZmianiePola);
    if (e) e.addEventListener('change', poZmianiePola);
  });
  (function () {
    var st = pole('pubertyGnrhaStatus');
    if (st) st.addEventListener('change', pokazWiekGnrha);
  }());
  select.addEventListener('change', poZmianiePola);
  (function () {
    var plec = document.getElementById('sex');
    if (plec) plec.addEventListener('change', function () { pokazJadraWgPlci(); pokazSprzecznosci(); });
  }());

  window.updateTannerVisibility();
  window.addEventListener('load', function () {
    setTimeout(window.updateTannerVisibility, 0);
    setTimeout(window.updateTannerVisibility, 200);
    setTimeout(window.updateTannerVisibility, 800);
  });
}());
