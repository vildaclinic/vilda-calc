/*
 * vilda_dziennik_otylosci.js — dziennik leczenia otyłości (window.VildaDziennikOtylosci).
 *
 * P-OTYLOSC-DZIENNIK (etapy 3 i 4 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje
 * właściciela 2026-11-17/18, makieta zaakceptowana 2026-11-18, „Etap 3 + 4 razem” 2026-11-18).
 *
 * Po co. Rodzic albo pacjent co miesiąc przysyła masę, a lekarz odsyła receptę. Punkty leczenia
 * otyłości żyły dotąd w zapisie wizyty (`obesityTherapyPoints` w migawce pacjenta), więc każdy
 * nowy punkt był nową wersją ostatniej wizyty — a masa przysłana miesiąc po wizycie nie może być
 * wersją tej wizyty (decyzja właściciela nr 2). Dziennik oddziela monitorowanie leczenia od wizyt.
 *
 * Gdzie. Każda WERSJA wpisu to osobna, zaszyfrowana notatka pacjenta w istniejącym magazynie
 * notatek, zapisana RAZ (`VildaVault.savePatientNoteOnce`) i nigdy nie nadpisywana:
 *   • kategoria `leczenie-otylosci` (każda wersja aplikacji przepuszcza taki identyfikator),
 *   • tytuł i pierwsza linia treści czytelne dla człowieka (starsza wersja aplikacji pokaże
 *     zwykłą notatkę „Leczenie otyłości — Kontynuacja 10.11.2026 · masa 74,6 kg (pacjent)…”),
 *   • ostatnia linia treści: dane wpisu w JSON `{"vildaOtylosc":1,…}`,
 *   • `clinicalDateISO` = data pomiaru, `linkedAgeMonths` = wiek w miesiącach.
 * Sejf zostaje bez zmian: tytuł, treść, kategoria i data kliniczna przechodzą przez zapis, eksport,
 * scalanie i synchronizację każdej wersji aplikacji, a nowe pole w treści szyfrowanej ginęłoby
 * w każdej z nich (biała lista pól w zapisie, odczycie i scalaniu).
 *
 * Model wpisu (decyzja właściciela nr 1: „poprawka to nowa wersja, usunięcie można cofnąć,
 * przy równoległej poprawce wybierasz wersję ręcznie”):
 *   • wpis ma stały `entryId` (= id jego pierwszej wersji),
 *   • każda wersja wskazuje wersje, które zastępuje (`parents`),
 *   • bieżąca wersja = jedyny „liść” (wersja, której nikt nie zastępuje),
 *   • dwa liście = KONFLIKT (ten sam wpis poprawiony równolegle na dwóch urządzeniach albo
 *     w dwóch kartach) — żadna wersja nie znika, lekarz wybiera; wybór to nowa wersja, która
 *     zastępuje oba liście (odrzucona zostaje w historii wpisu),
 *   • usunięcie = wersja `retracted: true`; „Cofnij” = nowa wersja z treścią sprzed usunięcia.
 * Dwa nowe wpisy z dwóch urządzeń nigdy się nie nadpiszą — mają różne `entryId`. Możliwy
 * duplikat (ta sama data i masa) jest wykrywany przed zapisem (`duplikat`).
 *
 * Dawne punkty z migawki (sprzed dziennika) widać w projekcji od razu jako wpisy ze źródłem
 * „gabinet” (decyzja właściciela nr 4); do dziennika przenoszą się przy pierwszym zapisie wpisu
 * tego pacjenta. Przeniesiona wersja ma identyfikator wyliczony z identyfikatora punktu i treść
 * bez chwili ani urządzenia, więc dwa urządzenia przenoszące ten sam punkt zapisują tę samą
 * notatkę (zapis jednorazowy uzna drugą próbę za powtórkę). Punkt migawki, który ma już wpis
 * (po `legacyPointId` albo po id równym `entryId` — monitor zapisuje w migawce lustro dziennika),
 * nie wraca jako drugi wpis.
 *
 * Moduł niczego nie liczy klinicznie: reguły cykli zna `VildaCykleLeczenia`, ocenę wg ChPL —
 * `ObesityResponseCriteria`. Tu: zapis i odczyt wersji, składanie wpisów, konflikty, migracja,
 * projekcja na punkty w formacie monitora (`obesityTherapyPoints`).
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var KATEGORIA = 'leczenie-otylosci';
  var ZNACZNIK = '{"vildaOtylosc":';
  var FORMAT = 1;
  var LINIA_OSTRZEZENIA = 'Wpis dziennika leczenia otyłości (Vilda) — nie edytuj tej notatki.';
  var TYPY = { start: 'Włączenie', 'continue': 'Kontynuacja', end: 'Zakończenie' };
  var ZRODLA = { gabinet: 1, pacjent: 1 };
  var OPERACJE = { zapis: 1, poprawka: 1, wycofanie: 1, przywrocenie: 1, rozstrzygniecie: 1, migracja: 1 };

  // ── Drobne narzędzia ─────────────────────────────────────────────────────────────

  function liczba(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function tekst(v, max) {
    var s = '';
    var surowy = v == null ? '' : String(v);
    for (var i = 0; i < surowy.length; i++) {
      var c = surowy.charCodeAt(i);
      if (c >= 32 || c === 10) s += surowy.charAt(i); // znaki sterujące (poza nową linią) odpadają
    }
    s = s.trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }

  function dataISO(v) {
    var s = tekst(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200) return '';
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? s : '';
  }

  function dataMs(iso) {
    var s = dataISO(iso);
    if (!s) return null;
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getTime();
  }

  function dwieCyfry(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dataPL(iso) {
    var s = dataISO(iso);
    return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
  }

  function liczbaPL(n, miejsca) {
    if (n == null || !isFinite(n)) return '—';
    return (+Number(n).toFixed(miejsca == null ? 1 : miejsca)).toString().replace('.', ',');
  }

  function dzisISO(teraz) {
    var d = teraz instanceof Date ? teraz : new Date();
    return d.getFullYear() + '-' + dwieCyfry(d.getMonth() + 1) + '-' + dwieCyfry(d.getDate());
  }

  function nowyId() {
    var losowe = '';
    try {
      if (w.crypto && typeof w.crypto.getRandomValues === 'function') {
        var a = new Uint8Array(8);
        w.crypto.getRandomValues(a);
        for (var i = 0; i < a.length; i++) losowe += (a[i] % 36).toString(36);
      }
    } catch (_e) { losowe = ''; }
    if (!losowe) losowe = Math.random().toString(36).slice(2, 10);
    return 'otyl-' + Date.now().toString(36) + '-' + losowe;
  }

  // Krótki, stały skrót tekstu (FNV-1a 32-bit) — do identyfikatorów przeniesionych punktów.
  function skrot(s) {
    var h = 0x811c9dc5;
    var t = String(s == null ? '' : s);
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
    }
    return ('0000000' + (h >>> 0).toString(36)).slice(-7);
  }

  function urzadzenie() {
    try {
      var ua = String((w.navigator && w.navigator.userAgent) || '');
      if (/iPad|Tablet/i.test(ua)) return 'tablet';
      if (/Mobi|iPhone|Android/i.test(ua)) return 'telefon';
    } catch (_e) { /* brak nawigatora */ }
    return 'komputer';
  }

  function kopia(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // ── Dane wpisu ───────────────────────────────────────────────────────────────────

  /**
   * Normalizuje dane wpisu. Zwraca { ok, dane, bledy }. Reguły pól (R8/R9 — data, wzrost przy
   * Włączeniu i Zakończeniu dziecka) sprawdza moduł cykli na całej liście; tu tylko format.
   */
  function normalizuj(d) {
    var src = d || {};
    var bledy = [];
    var type = TYPY[src.type] ? src.type : null;
    if (!type) bledy.push('rodzaj');
    var date = dataISO(src.dateISO);
    if (!date) bledy.push('data');
    var weight = liczba(src.weight);
    if (!(weight > 0) || weight > 500) { bledy.push('masa'); weight = null; }
    var height = liczba(src.height);
    var wzrostWpisany = src.height != null && String(src.height).trim() !== '';
    if ((wzrostWpisany && height == null) || (height != null && (!(height > 0) || height > 260))) { bledy.push('wzrost'); height = null; }
    var ageYears = liczba(src.ageYears);
    var ageMonths = liczba(src.ageMonths);
    if (ageYears == null || ageYears < 0) ageYears = 0;
    if (ageMonths == null || ageMonths < 0) ageMonths = 0;
    var wsrc = ZRODLA[src.weightSource] ? src.weightSource : 'gabinet';
    var hsrc = height != null ? (ZRODLA[src.heightSource] ? src.heightSource : wsrc) : null;
    var dane = {
      type: type,
      dateISO: date,
      ageYears: Math.floor(ageYears),
      ageMonths: Math.floor(ageMonths),
      weight: weight,
      weightSource: wsrc,
      height: height,
      heightSource: hsrc,
      drug: tekst(src.drug, 200),
      substance: tekst(src.substance, 200),
      dose: tekst(src.dose, 80),
      comment: tekst(src.comment, 500)
    };
    return { ok: bledy.length === 0, dane: dane, bledy: bledy };
  }

  function bmi(dane) {
    var m = liczba(dane && dane.weight), h = liczba(dane && dane.height);
    return m > 0 && h > 0 ? m / Math.pow(h / 100, 2) : null;
  }

  function opisDanych(dane) {
    var czesci = [TYPY[dane.type] + ' ' + dataPL(dane.dateISO)];
    czesci.push('masa ' + liczbaPL(dane.weight, 1) + ' kg (' + dane.weightSource + ')');
    czesci.push(dane.height != null ? 'wzrost ' + liczbaPL(dane.height, 1) + ' cm (' + dane.heightSource + ')' : 'wzrost —');
    var lek = [dane.drug ? String(dane.drug).split(' –')[0].split(' - ')[0].trim() : '', dane.dose].filter(Boolean).join(' ');
    if (lek) czesci.push(lek);
    return czesci.join(' · ');
  }

  // ── Zapis i odczyt wersji (notatka pacjenta) ─────────────────────────────────────

  /**
   * Wersja → ładunek `savePatientNoteOnce`. Pola wersji: id, entryId, parents, op, retracted,
   * dane, createdAtISO, urzadzenie, legacyPointId.
   */
  function zakoduj(patientId, wersja) {
    var dane = wersja.dane;
    var meta = {
      vildaOtylosc: FORMAT,
      entryId: wersja.entryId,
      parents: (wersja.parents || []).slice(),
      op: wersja.op,
      retracted: !!wersja.retracted,
      dane: dane
    };
    if (wersja.createdAtISO) meta.createdAtISO = wersja.createdAtISO;
    if (wersja.urzadzenie) meta.urzadzenie = wersja.urzadzenie;
    if (wersja.legacyPointId) meta.legacyPointId = wersja.legacyPointId;
    var tytul = 'Leczenie otyłości — ' + TYPY[dane.type] + ' ' + dataPL(dane.dateISO) + (wersja.retracted ? ' (usunięty)' : '');
    var tresc = (wersja.retracted ? 'Usunięty z dziennika: ' : '') + opisDanych(dane) +
      (dane.comment ? '\n' + dane.comment.replace(/\n/g, ' ') : '') + '\n' + LINIA_OSTRZEZENIA + '\n' + JSON.stringify(meta);
    var wiekMies = Math.round((dane.ageYears || 0) * 12 + (dane.ageMonths || 0));
    var out = {
      id: wersja.id,
      patientId: patientId,
      category: KATEGORIA,
      title: tytul,
      body: tresc,
      clinicalDateISO: dane.dateISO
    };
    if (wiekMies > 0) out.linkedAgeMonths = wiekMies;
    return out;
  }

  /** Notatka → wersja albo null (nie wpis dziennika albo treść nieczytelna). */
  function odkoduj(notatka) {
    if (!notatka || notatka.category !== KATEGORIA || typeof notatka.body !== 'string') return null;
    var linie = notatka.body.split('\n');
    var json = null;
    for (var i = linie.length - 1; i >= 0; i--) {
      if (linie[i].indexOf(ZNACZNIK) === 0) { json = linie[i]; break; }
    }
    if (!json) return null;
    var meta;
    try { meta = JSON.parse(json); } catch (_e) { return null; }
    if (!meta || meta.vildaOtylosc !== FORMAT || typeof meta.entryId !== 'string' || !meta.entryId) return null;
    if (!OPERACJE[meta.op]) return null;
    var n = normalizuj(meta.dane);
    // Data jest obowiązkowa w nowych wpisach (R8), ale punkt przeniesiony z migawki mógł jej nie mieć.
    if (!n.dane.type || n.dane.weight == null) return null;
    var parents = Array.isArray(meta.parents) ? meta.parents.filter(function (p) { return typeof p === 'string' && p; }) : [];
    return {
      id: String(notatka.id),
      patientId: notatka.patientId,
      entryId: meta.entryId,
      parents: parents,
      op: meta.op,
      retracted: meta.retracted === true,
      dane: n.dane,
      createdAtISO: typeof meta.createdAtISO === 'string' ? meta.createdAtISO : null,
      urzadzenie: typeof meta.urzadzenie === 'string' ? meta.urzadzenie : null,
      legacyPointId: typeof meta.legacyPointId === 'string' ? meta.legacyPointId : null,
      zapisanoISO: notatka.createdAtISO || notatka.updatedAtISO || null
    };
  }

  function jestWpisem(notatka) {
    return !!(notatka && notatka.category === KATEGORIA);
  }

  // ── Składanie wpisów ─────────────────────────────────────────────────────────────

  function chwilaWersji(v) {
    var t = Date.parse(v.createdAtISO || v.zapisanoISO || '');
    return isFinite(t) ? t : 0;
  }

  function punktZDanych(dane, id, dziennik) {
    var p = {
      id: id,
      type: dane.type,
      ageYears: dane.ageYears,
      ageMonths: dane.ageMonths,
      weight: dane.weight,
      height: dane.height,
      bmi: bmi(dane) != null ? +bmi(dane).toFixed(1) : null,
      substance: dane.substance,
      drug: dane.drug,
      dose: dane.dose,
      dateISO: dane.dateISO,
      weightSource: dane.weightSource,
      heightSource: dane.heightSource
    };
    if (dane.comment) p.comment = dane.comment;
    if (dziennik) p.dziennik = dziennik;
    return p;
  }

  function idPunktuMigawki(p, i) {
    if (p && p.id != null && String(p.id) !== '') return String(p.id);
    return 'bez-id-' + skrot(JSON.stringify([p && p.type, p && p.dateISO, p && p.weight, p && p.ageYears, p && p.ageMonths, i]));
  }

  function daneZPunktuMigawki(p) {
    var h = liczba(p && p.height);
    return normalizuj({
      type: p && p.type,
      dateISO: p && p.dateISO,
      ageYears: p && p.ageYears,
      ageMonths: p && p.ageMonths,
      weight: p && p.weight,
      weightSource: 'gabinet',
      height: h > 0 ? h : null,
      heightSource: 'gabinet',
      drug: p && p.drug,
      substance: p && p.substance,
      dose: p && p.dose
    });
  }

  function uporzadkujPunkty(punkty) {
    var C = w.VildaCykleLeczenia;
    if (C && typeof C.uporzadkuj === 'function') {
      try { return C.uporzadkuj(punkty).punkty; } catch (_e) { /* niżej zapas */ }
    }
    var wszystkieZDatami = punkty.length > 0 && punkty.every(function (p) { return dataMs(p.dateISO) != null; });
    return punkty.slice().sort(function (a, b) {
      return wszystkieZDatami ? dataMs(a.dateISO) - dataMs(b.dateISO)
        : ((a.ageYears || 0) * 12 + (a.ageMonths || 0)) - ((b.ageYears || 0) * 12 + (b.ageMonths || 0));
    });
  }

  /**
   * Składa dziennik pacjenta z notatek i punktów migawki.
   * Zwraca { wpisy, punkty, konflikty, niezmigrowane, nieczytelne, maDziennik }:
   *   wpisy[]   — { entryId, stan: 'ok'|'konflikt'|'usuniety'|'migawka', biezaca, liscie, wersje, punkt }
   *   punkty[]  — projekcja w formacie monitora (bez usuniętych), uporządkowana jak tabela monitora
   *   konflikty — wpisy w stanie 'konflikt'
   */
  function zloz(notatki, punktyMigawki) {
    var wersje = [];
    var nieczytelne = [];
    (Array.isArray(notatki) ? notatki : []).forEach(function (n) {
      if (!jestWpisem(n)) return;
      var v = odkoduj(n);
      if (v) wersje.push(v); else nieczytelne.push(n);
    });
    var grupy = {};
    var kolejnosc = [];
    wersje.forEach(function (v) {
      if (!grupy[v.entryId]) { grupy[v.entryId] = []; kolejnosc.push(v.entryId); }
      grupy[v.entryId].push(v);
    });
    var pokryte = {};
    var wpisy = kolejnosc.map(function (entryId) {
      var vs = grupy[entryId].slice().sort(function (a, b) { return chwilaWersji(a) - chwilaWersji(b) || (a.id < b.id ? -1 : 1); });
      var zastapione = {};
      vs.forEach(function (v) { v.parents.forEach(function (p) { zastapione[p] = true; }); });
      var liscie = vs.filter(function (v) { return !zastapione[v.id]; });
      if (!liscie.length) liscie = [vs[vs.length - 1]]; // cykl w danych — bierzemy najnowszą
      vs.forEach(function (v) { if (v.legacyPointId) pokryte[v.legacyPointId] = true; });
      pokryte[entryId] = true;
      var biezaca = liscie[liscie.length - 1];
      var stan = liscie.length > 1 ? 'konflikt' : biezaca.retracted ? 'usuniety' : 'ok';
      var wpis = { entryId: entryId, stan: stan, biezaca: biezaca, liscie: liscie, wersje: vs, punkt: null };
      if (stan !== 'usuniety') {
        // Przy konflikcie projekcja bierze najnowszą nieusuniętą wersję, oznaczoną konfliktem.
        var widoczna = biezaca;
        if (stan === 'konflikt') {
          var zywe = liscie.filter(function (v) { return !v.retracted; });
          widoczna = zywe.length ? zywe[zywe.length - 1] : biezaca;
        }
        wpis.punkt = punktZDanych(widoczna.dane, entryId, {
          entryId: entryId, versionId: widoczna.id, konflikt: stan === 'konflikt'
        });
      }
      return wpis;
    });
    var niezmigrowane = [];
    (Array.isArray(punktyMigawki) ? punktyMigawki : []).forEach(function (p, i) {
      if (!p || typeof p !== 'object') return;
      if (p.type !== 'start' && p.type !== 'continue' && p.type !== 'end') return;
      var id = idPunktuMigawki(p, i);
      if (pokryte[id]) return;
      niezmigrowane.push({ id: id, punkt: p });
    });
    niezmigrowane.forEach(function (m) {
      var n = daneZPunktuMigawki(m.punkt);
      var p = kopia(m.punkt);
      p.id = m.id;
      if (n.dane.weightSource) p.weightSource = 'gabinet';
      if (liczba(p.height) > 0) p.heightSource = 'gabinet';
      p.dziennik = { entryId: null, versionId: null, konflikt: false, migawka: true };
      wpisy.push({ entryId: null, stan: 'migawka', biezaca: null, liscie: [], wersje: [], punkt: p, migawka: m });
    });
    var punkty = uporzadkujPunkty(wpisy.filter(function (x) { return x.punkt; }).map(function (x) { return x.punkt; }));
    return {
      wpisy: wpisy,
      punkty: punkty,
      konflikty: wpisy.filter(function (x) { return x.stan === 'konflikt'; }),
      niezmigrowane: niezmigrowane,
      nieczytelne: nieczytelne,
      maDziennik: wersje.length > 0
    };
  }

  function wpisPoId(stan, entryId) {
    var lista = stan && stan.wpisy ? stan.wpisy : [];
    for (var i = 0; i < lista.length; i++) if (lista[i].entryId === entryId) return lista[i];
    return null;
  }

  // ── Plany zapisu (czyste — zwracają wersje do zapisania) ─────────────────────────

  function wersja(entryId, parents, op, dane, opcje) {
    var o = opcje || {};
    var id = o.id || nowyId();
    return {
      id: id,
      entryId: entryId || id,
      parents: parents || [],
      op: op,
      retracted: !!o.retracted,
      dane: dane,
      createdAtISO: o.bezChwili ? null : (o.teraz instanceof Date ? o.teraz : new Date()).toISOString(),
      urzadzenie: o.bezChwili ? null : (o.urzadzenie || urzadzenie()),
      legacyPointId: o.legacyPointId || null
    };
  }

  /** Wersje przenoszące niezmigrowane punkty migawki (deterministyczne id i treść). */
  function planMigracji(stan, patientId) {
    var out = [];
    (stan && stan.niezmigrowane ? stan.niezmigrowane : []).forEach(function (m) {
      var n = daneZPunktuMigawki(m.punkt);
      if (!n.dane.type || n.dane.weight == null) return; // punkt bez masy albo rodzaju — zostaje w migawce
      var id = 'otylm-' + skrot(patientId) + '-' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
      out.push(wersja(id, [], 'migracja', n.dane, { id: id, bezChwili: true, legacyPointId: m.id }));
    });
    return out;
  }

  function planNowego(stan, patientId, dane, opcje) {
    var n = normalizuj(dane);
    if (!n.ok) return { ok: false, bledy: n.bledy };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(null, [], 'zapis', n.dane, opcje));
    return { ok: true, wersje: plan, entryId: plan[plan.length - 1].entryId };
  }

  function planPoprawki(stan, patientId, entryId, dane, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan === 'migawka') return { ok: false, bledy: ['brak-wpisu'] };
    if (wpis.stan === 'konflikt') return { ok: false, bledy: ['konflikt'] };
    var n = normalizuj(dane);
    if (!n.ok) return { ok: false, bledy: n.bledy };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, [wpis.biezaca.id], 'poprawka', n.dane, opcje));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  function planUsuniecia(stan, patientId, entryId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'ok') return { ok: false, bledy: [wpis && wpis.stan === 'konflikt' ? 'konflikt' : 'brak-wpisu'] };
    var plan = planMigracji(stan, patientId);
    var o = Object.assign({}, opcje || {}, { retracted: true });
    plan.push(wersja(entryId, [wpis.biezaca.id], 'wycofanie', kopia(wpis.biezaca.dane), o));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  function planPrzywrocenia(stan, patientId, entryId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'usuniety') return { ok: false, bledy: ['brak-wpisu'] };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, [wpis.biezaca.id], 'przywrocenie', kopia(wpis.biezaca.dane), opcje));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  /** Rozstrzygnięcie konfliktu: nowa wersja z treścią wybranej, zastępuje wszystkie liście. */
  function planRozstrzygniecia(stan, patientId, entryId, wybranaId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'konflikt') return { ok: false, bledy: ['brak-konfliktu'] };
    var wybrana = null;
    wpis.liscie.forEach(function (v) { if (v.id === wybranaId) wybrana = v; });
    if (!wybrana) return { ok: false, bledy: ['brak-wersji'] };
    var o = Object.assign({}, opcje || {}, { retracted: wybrana.retracted });
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, wpis.liscie.map(function (v) { return v.id; }), 'rozstrzygniecie', kopia(wybrana.dane), o));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  // ── Pomocnicze reguły formularza ─────────────────────────────────────────────────

  /** Możliwy duplikat: inny bieżący wpis z tą samą datą i masą (±0,05 kg). */
  function duplikat(stan, dane, pomijajEntryId) {
    var d = dataISO(dane && dane.dateISO), m = liczba(dane && dane.weight);
    if (!d || m == null) return null;
    var lista = stan && stan.wpisy ? stan.wpisy : [];
    for (var i = 0; i < lista.length; i++) {
      var x = lista[i];
      if (!x.punkt || (pomijajEntryId && x.entryId === pomijajEntryId)) continue;
      if (x.punkt.dateISO === d && Math.abs(Number(x.punkt.weight) - m) < 0.05) return x;
    }
    return null;
  }

  /**
   * Wiek w dniu pomiaru: z daty urodzenia, a bez niej z najbliższego wcześniejszego punktu
   * z datą (jego wiek + pełne miesiące między datami). Zwraca { ageYears, ageMonths, zrodlo } albo null.
   */
  function wiekNaDzien(dateISO, opcje) {
    var o = opcje || {};
    var d = dataISO(dateISO);
    if (!d) return null;
    var y = +d.slice(0, 4), mo = +d.slice(5, 7), dd = +d.slice(8, 10);
    var ur = dataISO(o.urodzenieISO);
    if (ur) {
      var uy = +ur.slice(0, 4), um = +ur.slice(5, 7), ud = +ur.slice(8, 10);
      var mies = (y - uy) * 12 + (mo - um) - (dd < ud ? 1 : 0);
      if (mies >= 0) return { ageYears: Math.floor(mies / 12), ageMonths: mies % 12, zrodlo: 'urodzenie' };
    }
    var punkty = (o.punkty || []).filter(function (p) { return p && dataISO(p.dateISO) && dataISO(p.dateISO) <= d; });
    if (!punkty.length) return null;
    punkty.sort(function (a, b) { return dataMs(a.dateISO) - dataMs(b.dateISO); });
    var p = punkty[punkty.length - 1];
    var pd = dataISO(p.dateISO);
    var py = +pd.slice(0, 4), pm = +pd.slice(5, 7), pdd = +pd.slice(8, 10);
    var roznica = (y - py) * 12 + (mo - pm) - (dd < pdd ? 1 : 0);
    var baza = Math.round((liczba(p.ageYears) || 0) * 12 + (liczba(p.ageMonths) || 0));
    var wynik = baza + Math.max(0, roznica);
    return { ageYears: Math.floor(wynik / 12), ageMonths: wynik % 12, zrodlo: 'punkt' };
  }

  // ── Sejf ─────────────────────────────────────────────────────────────────────────

  function sejf(v) {
    var s = v || w.VildaVault;
    if (!s || typeof s.listPatientNotesForPatient !== 'function' || typeof s.savePatientNoteOnce !== 'function') return null;
    return s;
  }

  function wczytaj(patientId, punktyMigawki, opcje) {
    var s = sejf(opcje && opcje.vault);
    if (!s || !patientId) return Promise.resolve(zloz([], punktyMigawki));
    return Promise.resolve(s.listPatientNotesForPatient(patientId)).then(function (notatki) {
      return zloz(notatki, punktyMigawki);
    });
  }

  /** Zapisuje wersje po kolei (zapis jednorazowy). Odrzuca, gdy którakolwiek nie weszła. */
  function zapisz(patientId, wersje, opcje) {
    var s = sejf(opcje && opcje.vault);
    if (!s) return Promise.reject(new Error('Sejf niedostępny — zaloguj się, aby zapisać wpis leczenia.'));
    var zapisane = [];
    return (wersje || []).reduce(function (p, v) {
      return p.then(function () {
        return Promise.resolve(s.savePatientNoteOnce(zakoduj(patientId, v))).then(function (r) {
          if (r && (r.saved || r.reused)) { zapisane.push(v.id); return; }
          var blad = new Error(r && r.reason === 'deleted'
            ? 'Tej wersji wpisu nie można zapisać — jej notatkę usunięto z sejfu.'
            : 'Inna treść pod tym samym identyfikatorem wpisu — nic nie nadpisano.');
          blad.kod = r && r.reason || 'odmowa';
          throw blad;
        });
      });
    }, Promise.resolve()).then(function () { return { zapisane: zapisane }; });
  }

  w.VildaDziennikOtylosci = Object.freeze({
    VERSION: VERSION,
    KATEGORIA: KATEGORIA,
    TYPY: TYPY,
    normalizuj: normalizuj,
    zakoduj: zakoduj,
    odkoduj: odkoduj,
    jestWpisem: jestWpisem,
    zloz: zloz,
    wpisPoId: wpisPoId,
    planMigracji: planMigracji,
    planNowego: planNowego,
    planPoprawki: planPoprawki,
    planUsuniecia: planUsuniecia,
    planPrzywrocenia: planPrzywrocenia,
    planRozstrzygniecia: planRozstrzygniecia,
    duplikat: duplikat,
    wiekNaDzien: wiekNaDzien,
    opisDanych: opisDanych,
    dataPL: dataPL,
    liczbaPL: liczbaPL,
    dzisISO: dzisISO,
    wczytaj: wczytaj,
    zapisz: zapisz
  });
}(typeof window !== 'undefined' ? window : this));
