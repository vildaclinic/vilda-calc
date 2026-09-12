/* vilda_puberty_profile.js — profil pokwitaniowy pacjenta dla prognozy wzrostu ostatecznego
 * (GROWTH-PRED-PUB1, decyzja właściciela 2026-09-12).
 *
 * PO CO TO JEST: konsensus metod prognozy (vilda_growth_card_c.js) nie odróżniał dotąd dziecka
 * z przedwczesnym albo wczesnym pokwitaniem od dziecka zdrowego z przyspieszonym wiekiem kostnym.
 * Piśmiennictwo (PubMed) mówi, że rokowanie rozstrzyga TEMPO pokwitania, nie sama liczba lat
 * przyspieczenia: przy wolnym przebiegu wzrost ostateczny zwykle sięga celu rodzicielskiego
 * (Palmert 1999, DOI 10.1210/jcem.84.2.5430; Léger 2000, DOI 10.1067/mpd.2000.109201; Lazar 2002,
 * DOI 10.1210/jcem.87.5.8481; Bertelloni 2017, DOI 10.1007/s00431-017-2898-8), przy szybkim bez
 * leczenia bywa 5–8 cm niżej (Kauli 1997, DOI 10.1159/000185432; Lazar 2001 u chłopców,
 * DOI 10.1210/jcem.86.9.7852).
 *
 * TEN MODUŁ NICZEGO NIE WAŻY — rozpoznaje profil i tempo z danych, które lekarz już wpisał, i
 * oddaje gotowe zdania („dowody") oraz listę braków. Reguły wag w konsensusie to osobny etap
 * (GROWTH-PRED-PUB2).
 *
 * KONTRAKT: ocenProfil({
 *   plec: 'F'|'M'|'K', wiekLat, etap: 1–5|null, wiekStartuLat, jadra: 'lt4'|'4to6'|'gt6'|'unknown'|'',
 *   postmenarcheal: true|false|null, wiekMenarcheLat, wiekKostnyLat,
 *   historia: [{ ageMonths, boneAgeYears }], gnrha: { status: ''|'brak'|'w-trakcie'|'zakonczone', startLat, stopLat }
 * }) → {
 *   profil: 'po-menarche'|'przedwczesne'|'wczesne'|'standardowy'|'nieznany',
 *   kategoriaStartu: 'przedwczesne'|'wczesne'|'prawidlowe'|null   (także po menarche — dla informacji),
 *   tempo: 'szybkie'|'wolne'|'nieznane'|'nieoceniane',
 *   wiekStartuLat, zrodloStartu: 'pole'|'gorna-granica'|null,
 *   wskazniki: { dBAdCA, przyspieszenieMies, tanner23Lata, tannerStadium, jadra },
 *   gnrha: { status, wTrakcie, poLeczeniu, startLat, stopLat },
 *   dowody: [string], braki: [string], etykieta: string
 * }
 *
 * PROGI (stałe niżej, do strojenia):
 *   przedwczesne: dziewczęta start < 8,0 l, chłopcy < 9,0 l; wczesne: 8,0–9,0 l / 9,0–10,5 l
 *     (Latronico 2026, Endocrine Society, DOI 10.1210/clinem/dgag168; Lazar 2001/2002);
 *   tempo szybkie, gdy zachodzi choć jeden warunek:
 *     ΔBA/ΔCA z ostatnich 6–24 mies. > 1,2 (Helvacioglu 2026, DOI 10.1007/s40618-026-02957-6),
 *     przyspieszenie BA ≥ 24 mies. (Léger 2000), Tanner 2→3 w < 1,3 roku (Lazar 2002);
 *   w trakcie GnRHa tempo nie jest oceniane (leczenie tłumi dojrzewanie kostne; Lazar 2007,
 *     DOI 10.1210/jc.2007-0321 — prognoza rezydualnego wzrostu w trakcie i po leczeniu nierzetelna).
 */
(function (w) {
  'use strict';

  var VERSION = '2';

  var PROGI = {
    przedwczesneF: 8.0, wczesneF: 9.0,
    przedwczesneM: 9.0, wczesneM: 10.5,
    dBAdCASzybkie: 1.2,
    przyspieszenieMiesSzybkie: 24,
    tanner23LataSzybkie: 1.3,
    oknoHistoriiLat: [0.5, 2.0]
  };

  var GNRHA_DOPUSZCZALNE = { brak: 1, 'w-trakcie': 1, zakonczone: 1 };

  function liczba(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x !== 'string') return null;
    var t = x.trim().replace(',', '.');
    if (t === '') return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  function plecKod(x) {
    var t = (x == null ? '' : String(x)).trim().toUpperCase();
    if (t === 'K' || t === 'F' || t === 'FEMALE' || t === 'GIRL') return 'F';
    if (t === 'M' || t === 'MALE' || t === 'BOY') return 'M';
    return '';
  }
  function etapLiczbowy(x) {
    var v = liczba(x);
    if (v == null) return null;
    v = Math.round(v);
    return v >= 1 && v <= 5 ? v : null;
  }
  function f1(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  function f2(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  // odmiana lat: 1 rok, 2-4 lata, 5+ lat, ulamki: 0,9 roku
  function lataTxt(x) {
    var n = Math.round(x * 100) / 100;
    if (n === 1) return '1 rok';
    if (Number.isInteger(n) && n >= 2 && n <= 4) return String(n) + ' lata';
    if (Number.isInteger(n) && n >= 5) return String(n) + ' lat';
    return f2(n) + ' roku';
  }

  function kategoriaStartu(plec, startLat) {
    if (startLat == null) return null;
    if (plec === 'M') return startLat < PROGI.przedwczesneM ? 'przedwczesne' : (startLat < PROGI.wczesneM ? 'wczesne' : 'prawidlowe');
    return startLat < PROGI.przedwczesneF ? 'przedwczesne' : (startLat < PROGI.wczesneF ? 'wczesne' : 'prawidlowe');
  }

  /* Tempo dojrzewania kostnego z historii pomiarów: najświeższy pomiar z wiekiem kostnym
   * sprzed 6–24 miesięcy; ΔBA/ΔCA przeliczone na rok. */
  function tempoKostne(historia, wiekMies, wiekKostnyLat) {
    if (!Array.isArray(historia) || wiekMies == null || wiekKostnyLat == null) return null;
    var best = null;
    for (var i = 0; i < historia.length; i++) {
      var m = historia[i];
      if (!m) continue;
      var am = liczba(m.ageMonths), ba = liczba(m.boneAgeYears);
      if (am == null || ba == null || ba <= 0) continue;
      var dy = (wiekMies - am) / 12;
      if (dy < PROGI.oknoHistoriiLat[0] - 1e-9 || dy > PROGI.oknoHistoriiLat[1] + 1e-9) continue;
      if (!best || am > best.am) best = { am: am, ba: ba, dy: dy };
    }
    if (!best) return null;
    return { dBAdCA: Math.round((wiekKostnyLat - best.ba) / best.dy * 100) / 100, odstepMies: Math.round(wiekMies - best.am), baPoprzedni: best.ba };
  }

  function ocenProfil(we) {
    var i = we && typeof we === 'object' ? we : {};
    var plec = plecKod(i.plec);
    var wiek = liczba(i.wiekLat);
    var wiekMies = wiek != null ? wiek * 12 : null;
    var etap = etapLiczbowy(i.etap);
    var startPole = liczba(i.wiekStartuLat);
    var jadra = i.jadra == null ? '' : String(i.jadra);
    var dowody = [], braki = [];
    // GROWTH-PRED-PUB4: menarche i status „po menarche" nie dotyczą chłopców; wiek startu / menarche
    // późniejszy niż wiek obecny jest pomijany (i nazwany w brakach), żeby nie dawał ujemnych odstępów.
    var post = i.postmenarcheal === true && plec !== 'M';
    var menarche = plec === 'M' ? null : liczba(i.wiekMenarcheLat);
    if (startPole != null && wiek != null && startPole > wiek + 0.05) {
      braki.push('wiek startu pokwitania (' + f1(startPole) + ' l) późniejszy niż wiek obecny — pominięty');
      startPole = null;
    }
    if (menarche != null && wiek != null && menarche > wiek + 0.05) {
      braki.push('wiek menarche (' + f1(menarche) + ' l) późniejszy niż wiek obecny — pominięty');
      menarche = null; post = false;
    }
    var ba = liczba(i.wiekKostnyLat);
    var g = i.gnrha && typeof i.gnrha === 'object' ? i.gnrha : {};
    var gStatus = typeof g.status === 'string' && Object.prototype.hasOwnProperty.call(GNRHA_DOPUSZCZALNE, g.status) ? g.status : '';
    var gnrha = {
      status: gStatus,
      wTrakcie: gStatus === 'w-trakcie',
      poLeczeniu: gStatus === 'zakonczone',
      startLat: liczba(g.startLat),
      stopLat: liczba(g.stopLat)
    };
    var leczone = gnrha.wTrakcie || gnrha.poLeczeniu;

    // ── Oznaki pokwitania i wiek startu ──────────────────────────────────────
    // GROWTH-PRED-PUB4: wpisany wiek startu jest sam w sobie oznaką pokwitania (lekarz stwierdza, że
    // pokwitanie się zaczęło — etap Tannera bywa niewpisany albo przeterminowany), a leczenie GnRHa
    // oznacza rozpoznane przedwczesne pokwitanie (start nie później niż początek leczenia).
    var jadraPokwitaniowe = jadra === '4to6' || jadra === 'gt6';
    var oznaki = (etap != null && etap >= 2) || (plec === 'M' && jadraPokwitaniowe) || post || menarche != null || startPole != null || leczone;
    var startLat = null, zrodloStartu = null;
    if (startPole != null && leczone && gnrha.startLat != null && startPole > gnrha.startLat + 0.05) {
      // start po początku leczenia to sprzeczność — GnRHa podaje się dopiero po starcie pokwitania
      braki.push('wiek startu pokwitania (' + f1(startPole) + ' l) późniejszy niż początek leczenia GnRHa (' + f1(gnrha.startLat) + ' l) — użyto początku leczenia');
      startPole = null;
    }
    if (startPole != null) { startLat = startPole; zrodloStartu = 'pole'; }
    else if (leczone && gnrha.startLat != null && wiek != null) {
      startLat = Math.min(wiek, gnrha.startLat);
      zrodloStartu = 'gnrha';
    } else if (oznaki && wiek != null) {
      // start nie później niż teraz — górna granica; przy menarche nie później niż menarche
      startLat = menarche != null ? Math.min(wiek, menarche) : wiek;
      zrodloStartu = 'gorna-granica';
    }
    var kat = plec ? kategoriaStartu(plec, startLat) : null;
    // leczenie GnRHa bez znanego wczesnego startu: przedwczesne z definicji wskazania
    if (leczone && plec && wiek != null && !post && zrodloStartu !== 'pole' && zrodloStartu !== 'gnrha') kat = 'przedwczesne';

    var profil;
    if (!plec || wiek == null) {
      profil = 'nieznany';
      braki.push('brak płci lub wieku');
    } else if (post) {
      profil = 'po-menarche';
      dowody.push('po menarche' + (menarche != null ? ' (w wieku ' + f1(menarche) + ' l)' : ''));
      if (kat === 'przedwczesne' || kat === 'wczesne') dowody.push('start pokwitania ' + (zrodloStartu === 'pole' ? 'w wieku ' + f1(startLat) + ' l' : 'nie później niż ' + f1(startLat) + ' l') + ' — ' + kat);
    } else if (!oznaki) {
      profil = 'standardowy';
      if (etap == null && !jadra && startPole == null) braki.push('brak danych pokwitaniowych (etap Tannera, wiek startu' + (plec === 'M' ? ', objętość jąder' : '') + ')');
      else dowody.push(etap === 1 ? 'Tanner I' : (jadra === 'lt4' ? 'jądra < 4 ml' : 'bez oznak pokwitania'));
    } else if (kat === 'przedwczesne' || kat === 'wczesne') {
      profil = kat;
      var prog = ' (próg ' + (plec === 'M' ? f1(PROGI.przedwczesneM) + '/' + f1(PROGI.wczesneM) : f1(PROGI.przedwczesneF) + '/' + f1(PROGI.wczesneF)) + ' l)';
      if (zrodloStartu === 'pole') dowody.push('start pokwitania w wieku ' + f1(startLat) + ' l — ' + kat + prog);
      else if (zrodloStartu === 'gnrha') dowody.push('start pokwitania nie później niż początek leczenia GnRHa (' + f1(startLat) + ' l) — ' + kat + prog);
      else if (zrodloStartu === 'gorna-granica' && leczone && kategoriaStartu(plec, startLat) !== kat) dowody.push('leczenie GnRHa — podaje się je tylko w przedwczesnym pokwitaniu (wiek startu nie wpisany)');
      else dowody.push('start pokwitania nie później niż ' + f1(startLat) + ' l (wiek startu nie wpisany) — ' + kat + prog);
      if (zrodloStartu !== 'pole') braki.push('wiek startu pokwitania — wpisz go w Danych pokwitaniowych; profil oparto na ' + (zrodloStartu === 'gnrha' ? 'początku leczenia GnRHa' : 'górnej granicy'));
      if (etap != null) dowody.push('Tanner ' + ['I', 'II', 'III', 'IV', 'V'][etap - 1]);
      if (plec === 'M' && jadraPokwitaniowe) dowody.push('jądra ' + (jadra === 'gt6' ? '> 6 ml' : '4–6 ml'));
    } else if (zrodloStartu === 'gorna-granica') {
      // oznaki pokwitania, ale wiek startu nieznany i wiek już poza progiem — nie da się rozstrzygnąć
      profil = 'nieznany';
      braki.push('oznaki pokwitania bez wieku startu — wpisz wiek startu pokwitania w Danych pokwitaniowych, inaczej nie wiadomo, czy pokwitanie zaczęło się przedwcześnie');
    } else {
      profil = 'standardowy';
      dowody.push('start pokwitania w wieku ' + f1(startLat) + ' l — w normie');
    }

    // ── Tempo ─────────────────────────────────────────────────────────────────
    var wsk = { dBAdCA: null, przyspieszenieMies: null, tanner23Lata: null, tannerStadium: etap, jadra: jadra || '' };
    var tempo;
    var szybkie = [], wolne = [];
    if (ba != null && wiek != null) {
      wsk.przyspieszenieMies = Math.round((ba - wiek) * 12);
      if (wsk.przyspieszenieMies >= PROGI.przyspieszenieMiesSzybkie) szybkie.push('wiek kostny wyprzedza metrykalny o ' + wsk.przyspieszenieMies + ' mies. (≥ ' + PROGI.przyspieszenieMiesSzybkie + '; Léger 2000)');
      else wolne.push((wsk.przyspieszenieMies < 0 ? 'wiek kostny opóźniony względem metrykalnego o ' + (-wsk.przyspieszenieMies) : 'wiek kostny wyprzedza metrykalny o ' + wsk.przyspieszenieMies) + ' mies. (< ' + PROGI.przyspieszenieMiesSzybkie + ')');
    }
    var tk = tempoKostne(i.historia, wiekMies, ba);
    if (tk) {
      wsk.dBAdCA = tk.dBAdCA;
      if (tk.dBAdCA > PROGI.dBAdCASzybkie) szybkie.push('ΔBA/ΔCA ' + f2(tk.dBAdCA) + ' z ostatnich ' + tk.odstepMies + ' mies. (> ' + f1(PROGI.dBAdCASzybkie) + '; Helvacioglu 2026)');
      else wolne.push('ΔBA/ΔCA ' + f2(tk.dBAdCA) + ' z ostatnich ' + tk.odstepMies + ' mies. (≤ ' + f1(PROGI.dBAdCASzybkie) + ')');
    }
    if (etap != null && etap >= 3 && startLat != null && zrodloStartu === 'pole' && wiek != null && wiek - startLat >= 0) {
      wsk.tanner23Lata = Math.round((wiek - startLat) * 100) / 100;
      if (wsk.tanner23Lata < PROGI.tanner23LataSzybkie) szybkie.push('Tanner ' + ['I', 'II', 'III', 'IV', 'V'][etap - 1] + ' już ' + lataTxt(wsk.tanner23Lata) + ' po starcie (< ' + f1(PROGI.tanner23LataSzybkie) + '; Lazar 2002)');
    } else if (etap === 2 && startLat != null && zrodloStartu === 'pole' && wiek != null && wiek - startLat >= PROGI.tanner23LataSzybkie) {
      wsk.tanner23Lata = Math.round((wiek - startLat) * 100) / 100;
      wolne.push('Tanner II utrzymuje się ' + lataTxt(wsk.tanner23Lata) + ' od startu (≥ ' + f1(PROGI.tanner23LataSzybkie) + ')');
    }
    var profilPokwitaniowy = profil === 'przedwczesne' || profil === 'wczesne' || profil === 'po-menarche';
    if (gnrha.wTrakcie) {
      tempo = 'nieoceniane';
      dowody.push('leczenie GnRHa w trakcie' + (gnrha.startLat != null ? ' (od ' + f1(gnrha.startLat) + ' l)' : '') + ' — tempo dojrzewania nieoceniane, bo leczenie je tłumi');
    } else if (!profilPokwitaniowy) {
      tempo = 'nieoceniane';
    } else if (szybkie.length) {
      tempo = 'szybkie';
      dowody = dowody.concat(szybkie.map(function (s) { return 'tempo szybkie: ' + s; }));
    } else if (wolne.length) {
      tempo = 'wolne';
      dowody = dowody.concat(wolne.map(function (s) { return 'tempo wolne: ' + s; }));
      if (!tk) braki.push('wiek kostny z poprzedniej wizyty (ΔBA/ΔCA) — tempo oceniono tylko z bieżącego przyspieszenia');
    } else {
      tempo = 'nieznane';
      braki.push('wiek kostny (bieżący i z poprzedniej wizyty) — bez niego tempo pokwitania jest nieznane');
    }
    if (gnrha.poLeczeniu) dowody.push('leczenie GnRHa zakończone' + (gnrha.stopLat != null ? ' w wieku ' + f1(gnrha.stopLat) + ' l' : ''));

    var etykieta;
    if (profil === 'po-menarche') etykieta = 'po menarche' + (kat === 'przedwczesne' || kat === 'wczesne' ? ' (start ' + kat + ')' : '');
    else if (profil === 'przedwczesne') etykieta = 'przedwczesne pokwitanie (tempo ' + tempo + ')';
    else if (profil === 'wczesne') etykieta = 'wczesne pokwitanie (tempo ' + tempo + ')';
    else if (profil === 'nieznany') etykieta = 'nieokreślony (brak wieku startu pokwitania)';
    else etykieta = 'standardowy';
    if (gnrha.wTrakcie) etykieta += ', GnRHa w trakcie';
    else if (gnrha.poLeczeniu) etykieta += ', po GnRHa';

    return {
      profil: profil,
      kategoriaStartu: kat,
      tempo: tempo,
      wiekStartuLat: startLat,
      zrodloStartu: zrodloStartu,
      wskazniki: wsk,
      gnrha: gnrha,
      dowody: dowody,
      braki: braki,
      etykieta: etykieta,
      progi: PROGI
    };
  }

  w.VildaPubertyProfile = {
    VERSION: VERSION,
    PROGI: PROGI,
    GNRHA_DOPUSZCZALNE: GNRHA_DOPUSZCZALNE,
    kategoriaStartu: kategoriaStartu,
    tempoKostne: tempoKostne,
    ocenProfil: ocenProfil
  };
}(typeof window !== 'undefined' ? window : this));
