/*
 * vilda_panel_pacjent.js — P-POWLOKA-OBCY (2026-10-06): panel powłoki nie może po cichu przejąć innego pacjenta.
 *
 * Powłoka app.html trzyma strony (Start, DocPro, Klirens…) w ramkach tej samej karty przeglądarki. Każda ramka ma
 * własny formularz w pamięci, a wspólne dla karty są: identyfikator pacjenta (sessionStorage.vildaCurrentPatientId),
 * migawka sesji, stan wspólny i magazyn punktów terapii. Gdy INNA ramka wczyta INNEGO pacjenta, ten dokument dalej
 * trzyma poprzedniego — jego dane nie należą już do pacjenta karty.
 *
 * Dokument pamięta pacjenta, którego zna (`znany`): pacjenta karty z chwili startu, a potem z własnego wczytania
 * (`vilda:patient-loaded`) albo własnego „Wyczyść” (`vilda:user-state-cleared`). Tylko te dwie drogi zmieniają
 * identyfikator karty z wnętrza dokumentu (custom-fixes.js, gh_therapy_monitor.js tuż przed `patient-loaded`).
 * Ocena jest LENIWA: przy każdym pytaniu (zapis w adapterze, lustro formularza, powłoka, zapis do sejfu) porównuje
 * bieżący identyfikator karty ze znanym, więc nie zależy od kolejności zdarzeń między ramkami.
 *
 * Reguły (identyfikator karty względem znanego):
 *  - ten sam → dokument aktualny;
 *  - inny, a formularz pusty → dokument przyjmuje pacjenta karty (P-ODTWORZ-ZYWO, P-POWLOKA-ID, P-ZRODLA-PRZEJECIE);
 *  - nadany (znany brak → nowy), a formularz ma te same nazwisko i datę urodzenia co migawka sesji karty → to zapis
 *    tego samego nowego dziecka w innej ramce; dokument przyjmuje nowy identyfikator;
 *  - usunięty (blokada sejfu, usunięcie pacjenta, „Wyczyść” — to ostatnie powtarza w każdej ramce vilda_chrome.js)
 *    → to nie jest wczytanie innego pacjenta; dokument zostaje przy swoim;
 *  - inny, a formularz z danymi → dokument NIEAKTUALNY.
 * Stan nieaktualny kończy: własne wczytanie (także jego początek), własne „Wyczyść” albo powrót karty do pacjenta
 * tego dokumentu (X → Y → X). Po `utrwal()` (powłoka właśnie przeładowuje ramkę) powrót karty go już nie kończy —
 * pagehide nie zapisze starego formularza na świeżo wczytany rekord.
 *
 * Skutki (poza tym plikiem):
 *  - adapter trwałości odmawia zapisu stanu karty z nieaktualnego dokumentu;
 *  - lustro formularza (custom-fixes.js) nie nadaje z niego i nie przyjmuje do niego wpisów;
 *  - powłoka (vilda_shell.js) nie odświeża go w tle, a przy pokazaniu przeładowuje (location.reload, bez wpisu
 *    w historii) — świeży dokument startuje ze stanu karty jak panel otwierany pierwszy raz;
 *  - zapis do sejfu i notatka do wizyty celują w pacjenta, którego dane dokument trzyma (`cel`).
 *
 * Moduł działa tylko w powłoce, która deklaruje obsługę tego protokołu (VildaShell.protokolPanelu >= 1). Ramka
 * w starszej powłoce (mieszane wersje po aktualizacji) i strona samodzielna zachowują się jak dotąd.
 *
 * Rejestr: docs/clinical/ALGORITHMS.md, P-POWLOKA-OBCY.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaPanelPacjent) return;

  var KLUCZ = 'vildaCurrentPatientId';

  function pacjentKarty() {
    try { return (w.sessionStorage && w.sessionStorage.getItem(KLUCZ)) || null; } catch (_) { return null; }
  }

  var stan = { znany: pacjentKarty(), nieaktualny: false, wlasciciel: null, koncowy: false };

  function aktywny() {
    try {
      var p = w.parent;
      return !!(p && p !== w && p.VildaShell && p.VildaShell.protokolPanelu >= 1);
    } catch (_) { return false; } // inna domena albo brak dostępu
  }

  function tablica(x) { return Array.isArray(x) && x.length > 0; }

  /* Czy dokument niesie dane jakiegoś pacjenta: pola formularza (anyDataEntered) albo stan pacjenta poza nimi
     (wczytany rekord, data urodzenia, punkty terapii, pomiary zaawansowane). Bez modułu formularza — nie ma czego
     chronić. */
  function maDane() {
    try {
      var api = w.VildaDataImportExport;
      if (api && typeof api.anyDataEntered === 'function' && api.anyDataEntered()) return true;
    } catch (_) { /* pomiń */ }
    try {
      if (w.lastLoadedData && typeof w.lastLoadedData === 'object') return true;
      var dob = w.document && w.document.getElementById('dobInput');
      if (dob && String(dob.value || '').trim()) return true;
      if (tablica(w.ghTherapyPoints) || tablica(w.obesityTherapyPoints) || tablica(w.bisphosTherapyPoints)) return true;
      var adv = w.advancedGrowthData;
      if (adv && typeof adv === 'object' && tablica(adv.measurements)) return true;
    } catch (_) { /* pomiń */ }
    return false;
  }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* Formularz i migawka sesji karty opisują tę samą osobę: nazwisko zgodne, daty urodzenia (gdy są obie) zgodne. */
  function tenSamPacjentCoMigawka() {
    var nazwa = '';
    try {
      var d = w.document;
      ['name', 'fullName', 'advName', 'basicGrowthName'].some(function (id) {
        var el = d && d.getElementById(id);
        var v = el && typeof el.value === 'string' ? el.value.trim() : '';
        if (v) nazwa = norm(v);
        return !!v;
      });
    } catch (_) { return false; }
    if (!nazwa) return false;
    var m;
    try {
      var p = w.VildaPersistence;
      m = p && typeof p.readMainSession === 'function' ? p.readMainSession() : null;
    } catch (_) { m = null; }
    if (!m || typeof m !== 'object') return false;
    var u = m.user && typeof m.user === 'object' ? m.user : {};
    var nazwaM = norm(m.name || m.fullName || [u.firstName, u.lastName].filter(Boolean).join(' '));
    if (!nazwaM || nazwaM !== nazwa) return false;
    var dob;
    try { dob = w.VildaDobAge && typeof w.VildaDobAge.readISO === 'function' ? w.VildaDobAge.readISO() || null : null; } catch (_) { dob = null; }
    var dobM = typeof u.dobISO === 'string' && u.dobISO ? u.dobISO : null;
    return !(dob && dobM && dob !== dobM);
  }

  function oznacz() {
    stan.nieaktualny = true;
    stan.wlasciciel = stan.znany;
    return true;
  }

  function ocen() {
    if (!aktywny()) return false;
    var karta = pacjentKarty();
    if (stan.nieaktualny) {
      if (!stan.koncowy && karta !== null && karta === stan.wlasciciel) { // karta wróciła do pacjenta tego dokumentu
        stan.nieaktualny = false;
        stan.wlasciciel = null;
        stan.znany = karta;
        return false;
      }
      return true;
    }
    if (karta === stan.znany || karta === null) return false;
    if (!maDane()) { // pusty panel przyjmuje pacjenta karty
      stan.znany = karta;
      return false;
    }
    if (stan.znany === null && tenSamPacjentCoMigawka()) { // nadanie identyfikatora temu samemu nowemu dziecku
      stan.znany = karta;
      return false;
    }
    return oznacz();
  }

  /* Własne wczytanie albo „Wyczyść” kończy stan nieaktualny także po `utrwal()`: dokument trzyma wtedy to, co sam
     zapisał (np. skok GH dokończony tuż przed przeładowaniem), więc jego zapisy są zgodne z kartą. */
  function odNowa(id) {
    stan.znany = id || null;
    stan.nieaktualny = false;
    stan.wlasciciel = null;
    stan.koncowy = false;
  }

  function wlasneWczytanie(e) {
    var d = e && e.detail;
    odNowa(d && typeof d.patientId === 'string' && d.patientId ? d.patientId : pacjentKarty());
  }

  function wlasneWyczyszczenie() { odNowa(null); }

  try {
    w.document.addEventListener('vilda:patient-loaded', wlasneWczytanie);
    // „Wyczyść” rozgłaszane jest na window (VildaPersistence.clearUserState); część modułów słucha na document.
    w.document.addEventListener('vilda:user-state-cleared', wlasneWyczyszczenie);
    w.addEventListener('vilda:user-state-cleared', wlasneWyczyszczenie);
  } catch (_) { /* pomiń */ }

  w.VildaPanelPacjent = Object.freeze({
    /* true: w innej ramce tej karty wczytano innego pacjenta, a ten dokument trzyma poprzedniego. */
    nieaktualny: ocen,
    /* identyfikator pacjenta, którego dane trzyma dokument (null: nowy, niezapisany pacjent albo pusty formularz) */
    wlasciciel: function () { return ocen() ? stan.wlasciciel : stan.znany; },
    /* pacjent docelowy zapisu do sejfu i notatki: `domyslny`, a w dokumencie nieaktualnym — jego własny pacjent */
    cel: function (domyslny) { return ocen() ? stan.wlasciciel : domyslny; },
    /* początek własnego wczytania (applyLoadedData poza odtworzeniem sesji): zapisy wczytania mają przejść */
    wczytanie: function () { odNowa(pacjentKarty()); },
    /* powłoka przeładowuje ramkę: powrót karty do pacjenta dokumentu nie kończy już stanu nieaktualnego */
    utrwal: function () { if (ocen()) stan.koncowy = true; return stan.koncowy; },
    pacjentKarty: pacjentKarty,
  });
})(typeof window !== 'undefined' ? window : undefined);
