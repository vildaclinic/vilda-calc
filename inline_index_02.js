/* Panel „Dojrzewanie płciowe" w formularzu głównym — ujawnianie i kontrola spójności.
 *
 * Panel jest jedynym miejscem wpisu danych pokwitaniowych (decyzja właściciela 2026-09-09);
 * reszta aplikacji czyta je przez vilda_pubertal_status.js. Pole pokazuje się samo, gdy
 * którakolwiek wartość jest już wpisana — po wczytaniu rekordu albo autozapisie.
 */
(function () {
  var otwarty = false;
  // Panel odsłania się SAM, gdy rekord albo autozapis przyniósł jakąkolwiek wartość — ale
  // tylko dopóki lekarz sam o tym nie zdecydował. Bez tej pamięci sekcji nie dawało się
  // zwinąć: każde odświeżenie widoczności otwierało ją z powrotem, bo pole było wypełnione.
  var decyzjaUzytkownika = false;
  var wrap = document.getElementById('tannerStageWrap');
  var extra = document.getElementById('pubertyExtraWrap');
  // Objętość jąder mieszka w panelu od SW 1.0.876 (decyzja właściciela): stan na dziś,
  // obok stadium. Kontener zwija się z panelem; etykietę dla dziewcząt chowa osobno
  // updateAdvancedGrowthSexSpecificFields() (po id, jak dotąd w karcie zaawansowanej).
  var jadraWrap = document.getElementById('testicularVolumeWrap');
  var select = document.getElementById('tannerStage');
  var btn = document.getElementById('tannerToggleBtn');
  if (!wrap || !select || !btn) return;

  var POLA = ['pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyCdgp', 'advTesticularVolume'];

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

  window.updateTannerVisibility = function () {
    if (!decyzjaUzytkownika && cokolwiekWpisane()) otwarty = true;
    wrap.style.display = otwarty ? '' : 'none';
    if (extra) extra.style.display = otwarty ? '' : 'none';
    if (jadraWrap) jadraWrap.style.display = otwarty ? '' : 'none';
    pokazJadraWgPlci();
    btn.style.display = '';
    btn.textContent = otwarty ? '− Dane pokwitaniowe' : '+ Dane pokwitaniowe';
    pokazSprzecznosci();
  };

  /* Zwinięcie na żądanie — „Wyczyść wszystkie pola" ma zostawić formularz w stanie
   * wyjściowym, a więc także z zamkniętym panelem. Kasujemy przy tym pamięć decyzji
   * lekarza: po wyczyszczeniu nie ma czego pamiętać. */
  window.vildaZwinDanePokwitaniowe = function () {
    decyzjaUzytkownika = false;
    otwarty = false;
    window.updateTannerVisibility();
  };

  btn.addEventListener('click', function () {
    decyzjaUzytkownika = true;
    otwarty = !otwarty;
    window.updateTannerVisibility();
    if (otwarty) {
      setTimeout(function () { try { select.focus(); } catch (e) { /* brak fokusu */ } }, 30);
    }
  });

  POLA.forEach(function (id) {
    var e = pole(id);
    if (e) e.addEventListener('input', pokazSprzecznosci);
    if (e) e.addEventListener('change', pokazSprzecznosci);
  });
  select.addEventListener('change', pokazSprzecznosci);
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
