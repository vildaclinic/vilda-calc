/* vilda_puberty_source.js — sekcja „Dojrzewanie płciowe" z Karty Pacjenta jako źródło
 * danych o czasie pokwitania.
 *
 * PO CO TO JEST: normy tempa wzrastania Kelly'ego mają osobne wartości LMS dla dzieci
 * dojrzewających wcześniej, przeciętnie i później, ale wybór podgrupy wymaga JEDNEJ
 * liczby, której aplikacja dotąd nigdzie nie zbierała — wieku startu pokwitania.
 * Bez niej podgrupy są martwym kodem: silnik zawsze liczy na uśrednionej krzywej.
 *
 * DWIE LICZBY, DWIE ROLE:
 *
 *   wiek startu pokwitania (u dziewcząt B2/telarche, u chłopców objętość jąder 4 ml)
 *     — TO jest zmienna, na której zbudowano podgrupy Kelly'ego, i tylko ona je wybiera;
 *
 *   wiek menarche
 *     — fakt kliniczny wart zapisania, ale NIE zamiennik powyższego. Odstęp między
 *       telarche a pierwszą miesiączką jest indywidualny (typowo 2–2,5 roku, ale to
 *       wartość opisowa, nie przelicznik), więc podstawienie jednego za drugie byłoby
 *       progiem wymyślonym przez aplikację. Ten moduł tego nie robi i silnik też nie.
 *
 * ZASADA: moduł niczego nie liczy i niczego nie zapisuje. Czyta rekord pacjenta,
 * zapamiętuje sekcję i podaje ją w kształcie, którego oczekuje `VildaHeightVelocity`.
 * Wzorzec przepisany z `vilda_perinatal_source.js` — jedno miejsce, w którym rozstrzyga
 * się, skąd te dane pochodzą.
 *
 * CZEGO TU NIE MA: żadnej reguły „jeśli brak startu, przyjmij X". Brak danych zostaje
 * brakiem danych i silnik dostaje null.
 */
(function (w) {
  'use strict';

  var VERSION = '8';

  // GROWTH-PRED-TW2B: heightAtMenarcheCm — wzrost w chwili menarche (cm), do prognozy
  // wzrostu ostatecznego; podgrup Kelly'ego nie wybiera.
  // GROWTH-PRED-TW2C: boneAgeAtMenarcheYears — wiek kostny z RTG przy menarche (korekta Cho 2026).
  // GROWTH-PRED-PUB1: gnrhaStatus/gnrhaStartAgeYears/gnrhaStopAgeYears — leczenie analogiem GnRH.
  var POLA = ['onsetAgeYears', 'menarcheAgeYears', 'heightAtMenarcheCm', 'boneAgeAtMenarcheYears',
    'gnrhaStatus', 'gnrhaStartAgeYears', 'gnrhaStopAgeYears', 'cdgpDeclared'];
  var GNRHA_DOPUSZCZALNE = { brak: 1, 'w-trakcie': 1, zakonczone: 1 };

  // Deklaracja KOWD jest odpowiedzia lekarza, nie wynikiem automatu — dopuszczalne sa
  // wylacznie te dwie wartosci, brak odpowiedzi zostaje brakiem odpowiedzi.
  var KOWD_DOPUSZCZALNE = { tak: 1, nie: 1 };

  /* STAN NA DZIEŃ POMIARU — cztery pola, których sekcja `puberty` nie zawiera, bo to nie są
   * fakty trwałe: etap Tannera i objętość jąder zmieniają się z wizyty na wizytę, a wywiad
   * o rodzinnym opóźnieniu pokwitania i wykluczenie przyczyn wtórnych są oceną z tej wizyty.
   * Zapisuje je POMIAR — leżą w `user.tannerStage` i w `advanced.*`.
   *
   * PO CO TU SĄ: strona bez formularza głównego (DocPro w powłoce `app.html`) nie ma tych
   * pól w ogóle, a liczy z nich to samo, co strona główna — i bez nich dawała temu samemu
   * pacjentowi uboższy wynik. Zamiast powielać pola i obliczenia, bierze wartości stąd.
   * Klucze to identyfikatory pól formularza głównego, żeby konsument nie musiał znać
   * kształtu rekordu. */
  var POLA_STANU = {
    tannerStage: 'etap',
    advTesticularVolume: 'jadra',
    advFamilyDelayedPuberty: 'wywiadOpoznienie',
    advGrowthExclusion: 'wykluczenie'
  };

  function liczba(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x !== 'string') return null;
    var t = x.trim().replace(',', '.');
    if (t === '') return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }

  function plec(x) {
    var t = (x == null ? '' : String(x)).trim().toUpperCase();
    if (t === 'K' || t === 'F' || t === 'FEMALE') return 'F';
    if (t === 'M' || t === 'MALE') return 'M';
    return '';
  }

  /* Czysta zamiana sekcji `puberty` rekordu na wejście silnika. Zwraca null, gdy sekcja
   * nie niesie żadnej z dwóch liczb — pusty obiekt kłamałby, że dane są. */
  function naWejscie(puberty) {
    if (!puberty || typeof puberty !== 'object') return null;
    var start = liczba(puberty.onsetAgeYears);
    var menarche = liczba(puberty.menarcheAgeYears);
    var wzrostMenarche = liczba(puberty.heightAtMenarcheCm);
    var kostnyMenarche = liczba(puberty.boneAgeAtMenarcheYears);
    var gnrhaStatus = typeof puberty.gnrhaStatus === 'string'
      && Object.prototype.hasOwnProperty.call(GNRHA_DOPUSZCZALNE, puberty.gnrhaStatus)
      ? puberty.gnrhaStatus : '';
    var gnrhaStart = liczba(puberty.gnrhaStartAgeYears);
    var gnrhaStop = liczba(puberty.gnrhaStopAgeYears);
    var kowd = typeof puberty.cdgpDeclared === 'string'
      && Object.prototype.hasOwnProperty.call(KOWD_DOPUSZCZALNE, puberty.cdgpDeclared)
      ? puberty.cdgpDeclared : '';
    if (start == null && menarche == null && wzrostMenarche == null && kostnyMenarche == null
      && !gnrhaStatus && gnrhaStart == null && gnrhaStop == null && !kowd) return null;
    return {
      wiekStartuPokwitaniaLat: start,
      wiekMenarcheLat: menarche,
      wzrostPrzyMenarcheCm: wzrostMenarche,
      wiekKostnyPrzyMenarcheLat: kostnyMenarche,
      gnrhaStatus: gnrhaStatus,
      gnrhaStartLat: gnrhaStart,
      gnrhaStopLat: gnrhaStop,
      kowd: kowd,
      zKartyPacjenta: true
    };
  }

  function tekst(x) {
    return x == null ? '' : String(x).trim();
  }

  /* Wiek pomiaru w miesiącach — potrzebny WYŁĄCZNIE do reguły świeżości etapu. Rekord trzyma
   * go rozbitego na lata i miesiące; brak obu znaczy „nie wiadomo kiedy", a nie „w zerowym
   * miesiącu życia", więc wtedy zwracamy null i świeżości nie da się ocenić. */
  function wiekPomiaruMies(user) {
    if (!user || typeof user !== 'object') return null;
    var lat = liczba(user.age);
    var mies = liczba(user.ageMonths);
    if (lat == null && mies == null) return null;
    return (lat == null ? 0 : lat) * 12 + (mies == null ? 0 : mies);
  }

  /* Czysta zamiana payloadu na „stan na dzień pomiaru". Zwraca null, gdy nie ma ANI JEDNEJ
   * z czterech wartości — sam wiek pomiaru niczego nie niesie. */
  function stanZPayloadu(payload) {
    var p = payload && typeof payload === 'object' ? payload : null;
    if (!p) return null;
    var u = p.user && typeof p.user === 'object' ? p.user : null;
    var a = p.advanced && typeof p.advanced === 'object' ? p.advanced : null;
    var s = {
      etap: tekst(u ? u.tannerStage : null),
      jadra: tekst(a ? a.testicularVolume : null),
      wywiadOpoznienie: tekst(a ? a.familyDelayedPuberty : null),
      wykluczenie: tekst(a ? a.growthExclusion : null),
      wiekWpisuMies: wiekPomiaruMies(u)
    };
    if (!s.etap && !s.jadra && !s.wywiadOpoznienie && !s.wykluczenie) return null;
    return s;
  }

  function niesieDane(s) {
    return !!(s && typeof s === 'object'
      && (s.wiekStartuPokwitaniaLat != null || s.wiekMenarcheLat != null
        || s.wzrostPrzyMenarcheCm != null || s.wiekKostnyPrzyMenarcheLat != null
        || s.gnrhaStatus || s.gnrhaStartLat != null || s.gnrhaStopLat != null || s.kowd));
  }

  // ── Pamięć sekcji ────────────────────────────────────────────────────────────
  //
  // Konsument czyta synchronicznie, a rekord z vaulta przychodzi obietnicą — więc sekcja
  // jest zapamiętywana przy wczytaniu pacjenta. Ten sam wzorzec, co w module
  // okołoporodowym i w prefillu karty SGA.

  var zapamietane = null;
  var zapamietanyPacjent = null;
  var sejfPamieci = null;
  var statusOdczytu = 'unavailable';
  var generacjaOdczytu = 0;
  var podpietySejf = null;

  function identyfikator(value) {
    return tekst(value) || null;
  }

  function biezacaTozsamosc() {
    try {
      if (w.sessionStorage && typeof w.sessionStorage.getItem === 'function') {
        // W ramce zmienna window może jeszcze wskazywać poprzedniego pacjenta.
        // Brak klucza w dostępnym magazynie oznacza wyczyszczenie tożsamości.
        return { znana: true, id: identyfikator(w.sessionStorage.getItem('vildaCurrentPatientId')) };
      }
    } catch (e) { /* brak dostępu do magazynu — pozostaje tożsamość okna */ }
    return { znana: typeof w._vildaCurrentPatientId !== 'undefined', id: identyfikator(w._vildaCurrentPatientId) };
  }

  function pasujeDoTozsamosci(patientId) {
    var aktualny = biezacaTozsamosc();
    return !aktualny.znana || aktualny.id === patientId;
  }

  function sejfOdblokowany() {
    try {
      var V = w.VildaVault;
      return !!(V && (!sejfPamieci || sejfPamieci === V) && typeof V.isUnlocked === 'function' && V.isUnlocked());
    } catch (e) { return false; }
  }

  function pamiecBiezaca() {
    return !zapamietanyPacjent || (pasujeDoTozsamosci(zapamietanyPacjent) && sejfOdblokowany()) ? zapamietane : null;
  }

  /* Wspólny sygnał zmiany źródeł pacjenta (vilda_zrodla_pacjenta.js) — patrz opis w tamtym
   * pliku. Odczyt rekordu z sejfu jest asynchroniczny; bez ogłoszenia strona liczy dalej na
   * danych sprzed odczytu. Moduł nadal niczego nie liczy. */
  function oglos() {
    try {
      var Z = w.VildaZrodlaPacjenta;
      if (Z && typeof Z.ogloszJesliInne === 'function') Z.ogloszJesliInne('puberty', {
        patientId: zapamietanyPacjent, status: statusOdczytu, data: zapamietane
      });
    } catch (e) { /* brak wspolnego sygnalu — modul dziala jak dotad */ }
  }

  function opublikuj(payload, patientId, status) {
    var p = payload && typeof payload === 'object' && payload.puberty
      && typeof payload.puberty === 'object' ? payload.puberty : null;
    var we = naWejscie(p);
    var stan = stanZPayloadu(payload);
    zapamietane = (we || stan)
      ? { we: we, stan: stan, plec: plec(payload && payload.user ? payload.user.sex : null) }
      : null;
    zapamietanyPacjent = patientId;
    sejfPamieci = patientId ? w.VildaVault || null : null;
    statusOdczytu = status;
    oglos();
    return zapamietane;
  }

  /* Zachowane synchroniczne API dla konsumentów danych bez sejfu. Bez jawnego ID
   * sekcja jest dostępna tylko przez dotychczasowe gettery; nie przypisujemy jej
   * automatycznie do pacjenta aktualnie wyświetlanego w innej części aplikacji. */
  function zapamietaj(payload, patientId) {
    generacjaOdczytu += 1;
    return opublikuj(payload, identyfikator(patientId), 'ready');
  }

  function zapomnij() {
    generacjaOdczytu += 1;
    opublikuj(null, null, 'unavailable');
  }

  /* Odczyt powiązany z tożsamością. Status jest częścią sygnału zmiany, więc
   * loading -> ready/unavailable odświeża formularz także dla pustej sekcji.
   * Kopie zapobiegają zmienianiu pamięci źródła przez odbiorcę. */
  function kontekstPacjenta(patientId) {
    var id = identyfikator(patientId);
    var zgodny = id && id === zapamietanyPacjent && pasujeDoTozsamosci(id) && sejfOdblokowany();
    var status = zgodny ? statusOdczytu : 'unavailable';
    return {
      patientId: id, status: status,
      puberty: status === 'ready' && zapamietane && zapamietane.we ? Object.assign({}, zapamietane.we) : null,
      state: status === 'ready' && zapamietane && zapamietane.stan ? Object.assign({}, zapamietane.stan) : null
    };
  }

  function zKartyPacjenta() {
    var pamiec = pamiecBiezaca();
    return pamiec ? pamiec.we : null;
  }

  function stanBiezacy() {
    var pamiec = pamiecBiezaca();
    return pamiec ? pamiec.stan : null;
  }

  function pole(id) {
    try {
      return w.document && typeof w.document.getElementById === 'function'
        ? w.document.getElementById(id) : null;
    } catch (e) { return null; }
  }

  /* JEDNE DRZWI dla obu konsumentów (statusu pokwitania i karty zaawansowanej): wartość
   * pola tam, gdzie pole JEST, a wartość z rekordu tam, gdzie pola NIE MA.
   *
   * Rozstrzyga OBECNOŚĆ pola, nie jego wypełnienie — i to jest cała reguła. Puste pole na
   * stronie, która je ma, jest zdaniem lekarza „dziś nie oceniono" i rekord go nie
   * nadpisuje; strona bez tego pola nie mówi nic i dopiero tam wchodzi rekord. Dzięki temu
   * na stronie głównej nie zmienia się nic, a DocPro przestaje liczyć bez danych. */
  function zPolaLubRekordu(id) {
    var e = pole(id);
    if (e) return e.value == null ? '' : String(e.value);
    if (!Object.prototype.hasOwnProperty.call(POLA_STANU, id)) return '';
    var s = stanBiezacy();
    return s && s[POLA_STANU[id]] ? s[POLA_STANU[id]] : '';
  }

  /* Wiek pomiaru, z którego pochodzi zapamiętany stan — konsument porównuje go z wiekiem
   * bieżącym, żeby zastosować regułę świeżości. */
  function wiekStanuMies() {
    var s = stanBiezacy();
    return s && s.wiekWpisuMies != null ? s.wiekWpisuMies : null;
  }

  function plecRekordu() {
    var pamiec = pamiecBiezaca();
    return pamiec ? pamiec.plec : '';
  }

  // Dane o pokwitaniu, których w tej chwili ma używać reszta aplikacji.
  function biezace() {
    var s = zKartyPacjenta();
    return niesieDane(s) ? s : null;
  }

  /* Ocena wieku startu pokwitania wobec kohorty Kelly'ego — cienka delegacja do silnika,
   * żeby konsument nie musiał znać ani progów, ani kryteriów włączenia kohorty. Bez
   * silnika albo bez danych zwraca null; sam tych progów nie kopiuje. */
  function ocenStart(plecArg) {
    var H = w.VildaHeightVelocity;
    var s = biezace();
    if (!H || typeof H.ocenStartPokwitania !== 'function' || !s) return null;
    var pl = plec(plecArg) || plecRekordu();
    if (!pl) return null;
    return H.ocenStartPokwitania(pl, s.wiekStartuPokwitaniaLat);
  }

  // ── Wczytanie z vaulta ───────────────────────────────────────────────────────

  function wczytaj(patientId) {
    podepnijCyklSejfu();
    var id = identyfikator(patientId);
    var generacja = ++generacjaOdczytu;
    var V = w.VildaVault;
    // Czyścimy również przy ponownym odczycie tego samego pacjenta: wynik starszej
    // generacji nie jest potwierdzeniem zawartości obecnie wczytywanego rekordu.
    opublikuj(null, id, id ? 'loading' : 'unavailable');
    function nadalBiezacy() {
      return generacja === generacjaOdczytu && zapamietanyPacjent === id;
    }
    function niedostepny() {
      if (nadalBiezacy()) opublikuj(null, id, 'unavailable');
    }
    try {
      if (!id || !V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()
        || typeof V.getPatient !== 'function') { niedostepny(); return; }
      V.getPatient(id).then(function (rec) {
        if (!nadalBiezacy()) return;
        if (w.VildaVault !== V || !V.isUnlocked() || !pasujeDoTozsamosci(id)) { niedostepny(); return; }
        var snap = rec && Array.isArray(rec.snapshots) && rec.snapshots.length
          ? rec.snapshots[0] : null;
        if (!snap || !snap.payload || typeof snap.payload !== 'object') { niedostepny(); return; }
        opublikuj(snap.payload, id, 'ready');
      }).catch(niedostepny);
    } catch (e) { niedostepny(); }
  }

  function odswiez() {
    var id = biezacaTozsamosc().id;
    if (id) wczytaj(id);
    else if (zapamietanyPacjent) zapomnij();
  }

  /* Samodzielny przelicznik nie musi mieć clearAllData ani komunikatu
   * user-state-cleared. Wiążemy się także z publicznym cyklem życia sejfu,
   * ładowanego czasem dopiero po otwarciu logowania. */
  function podepnijCyklSejfu() {
    var V = w.VildaVault;
    if (!V || V === podpietySejf) return;
    if (typeof V.onLock !== 'function' || typeof V.onUnlock !== 'function') return;
    podpietySejf = V;
    V.onLock(function () { if (w.VildaVault === V) zapomnij(); });
    V.onUnlock(function () {
      if (w.VildaVault !== V) return;
      zapomnij();
      odswiez();
    });
  }

  function podepnij() {
    var doc = w.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    if (w.__vildaPubertySourceBound) return;
    w.__vildaPubertySourceBound = true;

    doc.addEventListener('vilda:patient-loaded', function (ev) {
      var id = ev && ev.detail ? ev.detail.patientId : null;
      wczytaj(id);
    });

    // Wylogowanie i kasowanie stanu leci na WINDOW, nie na document.
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('vilda:user-state-cleared', zapomnij);
    }

    podepnijCyklSejfu();
    doc.addEventListener('vilda:auth-loaded', function () { podepnijCyklSejfu(); odswiez(); });
    doc.addEventListener('vilda:auth-hidden', odswiez);
    doc.addEventListener('vilda:sync-status-changed', odswiez);
    doc.addEventListener('vilda:session-changed', odswiez);
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('storage', function (ev) {
        if (!ev || ev.key == null || ev.key === 'vildaCurrentPatientId') odswiez();
      });
    }
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { setTimeout(odswiez, 0); }, { once: true });
    } else {
      setTimeout(odswiez, 0);
    }
  }

  podepnij();

  w.VildaPubertySource = {
    VERSION: VERSION,
    POLA: POLA,
    naWejscie: naWejscie,
    niesieDane: niesieDane,
    zapamietaj: zapamietaj,
    zapomnij: zapomnij,
    kontekstPacjenta: kontekstPacjenta,
    zKartyPacjenta: zKartyPacjenta,
    biezace: biezace,
    ocenStart: ocenStart,
    POLA_STANU: POLA_STANU,
    stanZPayloadu: stanZPayloadu,
    stanBiezacy: stanBiezacy,
    zPolaLubRekordu: zPolaLubRekordu,
    wiekStanuMies: wiekStanuMies
  };
}(typeof window !== 'undefined' ? window : this));
