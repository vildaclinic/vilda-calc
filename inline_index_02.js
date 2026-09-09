/* Panel „Dojrzewanie płciowe" w formularzu głównym — ujawnianie i kontrola spójności.
 *
 * Panel jest jedynym miejscem wpisu danych pokwitaniowych (decyzja właściciela 2026-09-09);
 * reszta aplikacji czyta je przez vilda_pubertal_status.js. Pole pokazuje się samo, gdy
 * którakolwiek wartość jest już wpisana — po wczytaniu rekordu albo autozapisie.
 */
(function () {
  var otwarty = false;
  var wrap = document.getElementById('tannerStageWrap');
  var extra = document.getElementById('pubertyExtraWrap');
  var select = document.getElementById('tannerStage');
  var btn = document.getElementById('tannerToggleBtn');
  if (!wrap || !select || !btn) return;

  var POLA = ['pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyCdgp'];

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
      wiekLat: wiekLatFormularza()
    });
    if (!lista.length) { slot.style.display = 'none'; slot.textContent = ''; return; }
    slot.textContent = 'Do sprawdzenia: ' + lista.join(' ');
    slot.style.display = '';
  }

  window.updateTannerVisibility = function () {
    if (cokolwiekWpisane()) otwarty = true;
    wrap.style.display = otwarty ? '' : 'none';
    if (extra) extra.style.display = otwarty ? '' : 'none';
    btn.style.display = '';
    btn.textContent = otwarty
      ? '− Ukryj dojrzewanie płciowe'
      : '+ Pokaż dojrzewanie płciowe';
    pokazSprzecznosci();
  };

  btn.addEventListener('click', function () {
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

  window.updateTannerVisibility();
  window.addEventListener('load', function () {
    setTimeout(window.updateTannerVisibility, 0);
    setTimeout(window.updateTannerVisibility, 200);
    setTimeout(window.updateTannerVisibility, 800);
  });
}());
