/* Pakiety badań laboratoryjnych w przeliczniku jednostek (LAB-PAKIETY PR1, decyzje właściciela 2026-11-12).
 *
 * Pakiet to nazwana lista badań z katalogu przelicznika (LabUnitsData), wpisywanych razem z jednego wydruku:
 * wartości i jednostki trafiają zbiorczo do Badań w karcie pacjenta. Pakiet wbudowany: „Tarczyca” (TSH, fT4,
 * fT3); własne pakiety składa lekarz w kreatorze (PR4, niżej).
 * Pakiet jest zakładką karty przelicznika na stronie „Jednostki lab.” („Pojedyncze badanie | Pakiet badań” —
 * jedna karta, jeden tytuł, zakładki pod tytułem; makieta zaakceptowana 2026-11-13), dostępną wyłącznie
 * dla zalogowanego użytkownika; wpisywanie wyników wymaga wybranego pacjenta.
 *
 * Plik ma trzy rozdzielone części (jeden plik, bo budżet instalacji PWA liczy żądania — sw-precache-stron):
 *   1. DANE  (VildaLabPackagesData) — które badania tworzą pakiet. Bez norm, jednostek i współczynników:
 *      te zostają w lab_units_data.js (AGENTS.md § 3: normy zawsze jako dane).
 *   2. MODEL (VildaLabPackages) — czyste funkcje. Model niczego nie liczy po swojemu: wiersz ocenia
 *      LabUnitConverter.evaluate dla tego samego pacjenta co pojedyncze badanie, zakres dobiera
 *      LabUnitConverter.selectRange, a zapisywany zrzut normy buduje VildaLabRangeSnapshot.create — tak samo
 *      jak captureLabRange w przelicznik-jednostek.html. Notatka wyniku ma dokładnie postać zapisu „Przypnij
 *      do wizyty” (lab_pin_result.js): ten sam tytuł, treść, kategoria „wynik-badania” i pola labResult, więc
 *      zakładka „Badania”, historia i wykresy czytają wynik z pakietu jak każdy inny.
 *   3. WIDOK (VildaLabPackagesUI) — zakładki trybu i panel pakietu w karcie przelicznika. Ocena na ekranie pochodzi ze zrzutu, który
 *      zapisze się z wynikiem; pacjenta do norm podaje strona (VildaLabConverterRuntime.getPackagePatient —
 *      dane z karty, bez lokalnych nadpisań przelicznika). Zapis: jedna notatka na wypełnione pole, po kolei,
 *      z jedną datą pobrania i jednym komentarzem. Wartości wpisane dla jednego pacjenta nie przechodzą na
 *      innego: zmiana pacjenta, wylogowanie i „Wyczyść” opróżniają pola. Bez logowania karta pokazuje tylko
 *      wyjaśnienie i przycisk; po zalogowaniu bez pacjenta — wybór pakietu i kreator, bez pól wyników.
 *      Geometria paska oceny stoi w atrybutach SVG, kolory
 *      w klasach (sekcja „Pakiet badań” w inline_przelicznik_jednostek_00.css); skrypt nie ustawia stylów.
 *
 * Jednostki wybrane ostatnio na tym urządzeniu pamięta preferencja labPackageSettings (VildaPersistence,
 * klasa local-persistent): to wygoda formularza, nie dane pacjenta.
 *
 * Norma z wydruku (LAB-PAKIETY PR2, decyzje właściciela 2026-11-12 i 2026-11-13): opcjonalne granice od–do
 * w jednostce wyniku. Wpisana norma laboratorium zastępuje normę aplikacji dla tego wyniku — ocenia go
 * (parseLabNorm, classifyLabNorm: granice należą do normy) i zapisuje się w labResult.norm, polu edytora
 * wyniku karty pacjenta; zrzut normy aplikacji nie jest wtedy zapisywany. Podpowiedź jednostki i normy
 * pochodzi wyłącznie z poprzedniego wyniku tego samego badania u tego samego pacjenta (previousResults);
 * pacjent bez wcześniejszego wyniku nie dostaje żadnej. Norm nie pamięta ani urządzenie, ani konto.
 *
 * Kopiowanie (LAB-PAKIETY PR3, propozycja właściciela 2026-11-13): przycisk „Kopiuj wyniki” przy pakiecie kładzie
 * w schowku tekst „Badania (pobranie …)” z wierszem na każdy wynik — z tą samą oceną i normą, które pokazuje
 * karta wyniku (buildCopyText). Karta „Podsumowanie wyników” na stronie głównej nie dostaje bloku badań.
 *
 * Własne pakiety (LAB-PAKIETY PR4, kreator — decyzje właściciela 2026-11-13): lekarz składa pakiet z badań
 * katalogu przelicznika (nazwa do 30 znaków, do 10 badań, do 12 pakietów). Pakiety należą do konta: zapis
 * w preferencji labCustomPackages (VildaPersistence, klasa cloud-synced — synchronizuje się między urządzeniami
 * konta jak pozostałe ustawienia; przy zmianach z dwóch urządzeń naraz wygrywa późniejsza). „Tarczyca” zostaje
 * pakietem wbudowanym, bez edycji. Pakiet wybiera lista rozwijana; kreator otwiera się w zakładce pakietu
 * i nie wymaga wybranego pacjenta. Badania, które pojedyncze badanie ocenia po swojemu (LH, FSH, inhibina B,
 * testosteron całkowity — silniki pokwitaniowe; AMH — własne odniesienie), są w pakiecie „bez oceny”: zapisuje
 * się wartość, ocenę daje norma z wydruku albo pojedyncze badanie (link w karcie wyniku). Które to badania,
 * mówi strona (VildaLabConverterRuntime.ownAssessmentKind) — ten sam warunek co przy przypięciu wyniku.
 *
 * Każde konto widzi tylko swoje pakiety (LAB-PAKIETY PR5, polecenie właściciela 2026-11-13): na urządzeniu, na
 * którym loguje się kilka kont, kopia pakietów jest osobna dla każdego konta (adapter: preferencja z perUser,
 * klucz magazynu z identyfikatorem konta). Wersja 1.3.0 trzymała jedną kopię dla całego urządzenia; taką starą
 * kopię przypisuje właściwemu kontu adoptLegacy — rozstrzyga zapis pakietów konta w sejfie, jeden raz na konto.
 * Do czasu rozstrzygnięcia nie można tworzyć ani zmieniać pakietów (zapis nadpisałby listę konta).
 *
 * Opis: docs/clinical/ALGORITHMS.md, „LAB-PAKIETY PR1”–„LAB-PAKIETY PR5”.
 */
(function (root) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  1. DANE — pakiety. slug: nazwa pakietu w adresie (?pakiet=tarczyca); id: stały klucz pakietu.
  //  Kolejność badań jest kolejnością pól formularza i zapisu.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var DATA = Object.freeze({
    version: '1.0.0',
    packages: Object.freeze([
      Object.freeze({ id: 'thyroid', slug: 'tarczyca', label: 'Tarczyca', analytes: Object.freeze(['tsh', 'ft4', 'ft3']) })
    ])
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  2. MODEL — ocena wierszy, zrzut normy, notatka wyniku, zapamiętane jednostki.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var MODEL = (function () {
    var SETTINGS_KEY = 'labPackageSettings';
    // Własne pakiety konta (PR4): preferencja synchronizowana z kontem.
    var CUSTOM_KEY = 'labCustomPackages';
    var LIMITS = Object.freeze({ name: 30, analytes: 10, packages: 12 });
    var PACKAGE_ID = /^u[a-z0-9]{6,20}$/;
    var ANALYTE_ID = /^[a-z0-9_]{1,40}$/;
    var CATEGORY = 'wynik-badania';
    var COMMENT_MAX = 300;
    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    // Brzmienie oceny jak w wyniku pojedynczego badania (classifyResultState w przelicznik-jednostek.html).
    var STATES = {
      within: { state: 'is-normal', text: 'w zakresie normy' },
      below: { state: 'is-below', text: 'poniżej normy' },
      above: { state: 'is-above', text: 'powyżej normy' },
      far_below: { state: 'is-uwaga-low', text: 'znacznie poniżej normy' },
      far_above: { state: 'is-uwaga-high', text: 'znacznie powyżej normy' }
    };
    var GENERAL_TEXT = 'zakres ogólny — bez oceny dla dziecka';
    // Badanie z własną oceną w pojedynczym badaniu (PR4): pakiet zapisuje wartość, oceny nie daje.
    var OWN_TEXT = 'bez oceny w pakiecie';
    // Norma z wydruku (LAB-PAKIETY PR2): trzy kategorie, bez „znacznie” — jak norma wpisu w historii wyników.
    var LAB_STATES = {
      within: { state: 'is-normal', text: 'w normie z wydruku' },
      below: { state: 'is-below', text: 'poniżej normy z wydruku' },
      above: { state: 'is-above', text: 'powyżej normy z wydruku' }
    };
    // Jedna norma „od–do [jednostka]”: kształt, który przyjmuje historia wyników (normCheck w vilda_lab_history.js).
    var SINGLE_RANGE = /^\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/;
    // Znacznik na pasku: dolna granica zakresu w 30%, górna w 70% szerokości (jak pasek wyniku w makiecie).
    var BAR_LOW = 0.3, BAR_HIGH = 0.7, BAR_MIN = 0.03, BAR_MAX = 0.97;

    function own(value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); }
    function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function text(value) { return typeof value === 'string' ? value.trim() : ''; }
    function shortLabel(label) { return String(label || '').split('(')[0].trim() || String(label || ''); }

    // data: dane pakietów wbudowanych ({ packages }) albo gotowa lista pakietów (listPackages).
    function findPackage(data, key) {
      var wanted = text(String(key == null ? '' : key)).toLowerCase();
      var list = Array.isArray(data) ? data : data && Array.isArray(data.packages) ? data.packages : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (String(list[i].id).toLowerCase() === wanted || String(list[i].slug).toLowerCase() === wanted)) return list[i];
      }
      return null;
    }

    function unitOf(substance, symbol) {
      var units = substance && Array.isArray(substance.units) ? substance.units : [];
      for (var i = 0; i < units.length; i++) if (units[i] && units[i].symbol === symbol) return units[i];
      return null;
    }

    // Wiersze formularza: badania pakietu obecne w katalogu przelicznika, z jego jednostkami.
    // ownKind(id): 'puberty' | 'single' | '' — czy pojedyncze badanie ocenia to badanie po swojemu (PR4).
    function describeAnalytes(pkg, converter, ownKind) {
      var rows = [];
      var ids = pkg && Array.isArray(pkg.analytes) ? pkg.analytes : [];
      ids.forEach(function (id) {
        var substance = converter && typeof converter.find === 'function' ? converter.find(id) : null;
        if (!substance || substance.id !== id || !Array.isArray(substance.units) || !substance.units.length) return;
        rows.push({
          id: substance.id, label: substance.label_pl, short: shortLabel(substance.label_pl),
          own: typeof ownKind === 'function' ? ownKind(substance.id) || '' : '',
          canonicalUnit: substance.canonical_si, precision: substance.precision || 3,
          units: substance.units.map(function (unit) { return { symbol: unit.symbol, label: unit.label || unit.symbol }; })
        });
      });
      return rows;
    }

    // Jednostka pola: zapamiętana, jeśli badanie ją ma; inaczej jednostka SI katalogu.
    function pickUnit(row, preferred) {
      var symbols = row && Array.isArray(row.units) ? row.units.map(function (unit) { return unit.symbol; }) : [];
      if (preferred && symbols.indexOf(preferred) !== -1) return preferred;
      if (row && symbols.indexOf(row.canonicalUnit) !== -1) return row.canonicalUnit;
      return symbols[0] || '';
    }

    // ── Ustawienia urządzenia: ostatnio wybrane jednostki ──
    function normalizeSettings(value) {
      var out = { schemaVersion: 1, units: {} };
      if (!record(value) || value.schemaVersion !== 1 || !record(value.units)) return out;
      Object.keys(value.units).forEach(function (key) {
        var unit = value.units[key];
        if (/^[a-z0-9_]{1,40}$/.test(key) && typeof unit === 'string' && unit && unit.length <= 40) out.units[key] = unit;
      });
      // PR4: pakiet wybrany ostatnio na tym urządzeniu (identyfikator pakietu wbudowanego albo własnego).
      if (typeof value.lastPackage === 'string' && /^[a-z0-9]{1,24}$/.test(value.lastPackage)) out.lastPackage = value.lastPackage;
      return out;
    }
    function registered(persistence) {
      var meta = persistence && persistence.MODULE_KEY_META && persistence.MODULE_KEY_META[SETTINGS_KEY];
      return !!(meta && meta.kind === 'preference' && meta.storage === 'local-persistent');
    }
    function readSettings(persistence) {
      if (!registered(persistence) || typeof persistence.readPreferenceJSON !== 'function') return normalizeSettings(null);
      try { return normalizeSettings(persistence.readPreferenceJSON(SETTINGS_KEY, null)); }
      catch (_) { return normalizeSettings(null); }
    }
    function rememberUnits(persistence, units) {
      if (!registered(persistence) || typeof persistence.writePreferenceJSON !== 'function') return false;
      var settings = readSettings(persistence);
      var next = normalizeSettings({ schemaVersion: 1, units: Object.assign({}, settings.units, record(units) ? units : {}), lastPackage: settings.lastPackage });
      try { return persistence.writePreferenceJSON(SETTINGS_KEY, next) === true; }
      catch (_) { return false; }
    }
    function rememberPackage(persistence, id) {
      if (!registered(persistence) || typeof persistence.writePreferenceJSON !== 'function') return false;
      var settings = readSettings(persistence);
      if (settings.lastPackage === id) return true;
      var next = normalizeSettings({ schemaVersion: 1, units: settings.units, lastPackage: id });
      try { return persistence.writePreferenceJSON(SETTINGS_KEY, next) === true; }
      catch (_) { return false; }
    }

    // ── Własne pakiety konta (LAB-PAKIETY PR4, kreator) ──
    function cleanName(value) { return String(value == null ? '' : value).replace(/[\s\u00a0]+/g, ' ').trim(); }
    function nameKey(value) { return cleanName(value).toLocaleLowerCase('pl'); }
    function cleanAnalytes(value) {
      var out = [];
      (Array.isArray(value) ? value : []).forEach(function (id) {
        if (typeof id === 'string' && ANALYTE_ID.test(id) && out.indexOf(id) === -1) out.push(id);
      });
      return out;
    }
    /* Zapis własnych pakietów: { schemaVersion: 1, updatedAtISO, packages: [{ id, name, analytes }] }.
     * Wpis o złym kształcie, bez nazwy, bez badań, z powtórzonym identyfikatorem albo nazwą jest pomijany;
     * ponad limit — obcinany. Identyfikatorów badań nie sprawdzamy tu z katalogiem: badanie, którego ta wersja
     * przelicznika nie zna, pomija dopiero formularz (describeAnalytes). */
    function normalizeCustom(value) {
      var out = { schemaVersion: 1, updatedAtISO: null, packages: [] };
      if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.packages)) return out;
      if (typeof value.updatedAtISO === 'string' && value.updatedAtISO && value.updatedAtISO.length <= 40) out.updatedAtISO = value.updatedAtISO;
      var ids = {}, names = {};
      value.packages.forEach(function (item) {
        if (out.packages.length >= LIMITS.packages || !record(item)) return;
        var id = typeof item.id === 'string' ? item.id : '', name = cleanName(item.name);
        var analytes = cleanAnalytes(item.analytes).slice(0, LIMITS.analytes);
        if (!PACKAGE_ID.test(id) || ids[id] || !name || name.length > LIMITS.name || names[nameKey(name)] || !analytes.length) return;
        ids[id] = true;
        names[nameKey(name)] = true;
        out.packages.push({ id: id, name: name, analytes: analytes });
      });
      return out;
    }
    // Preferencja konta z osobną kopią na urządzeniu dla każdego konta (perUser, PR5). Adapter bez tej cechy
    // trzymałby jedną kopię dla wszystkich kont urządzenia — wtedy własnych pakietów nie czytamy ani nie piszemy.
    function customRegistered(persistence) {
      var meta = persistence && persistence.MODULE_KEY_META && persistence.MODULE_KEY_META[CUSTOM_KEY];
      return !!(meta && meta.kind === 'preference' && meta.storage === 'cloud-synced' && meta.perUser === true);
    }
    function readCustom(persistence) {
      if (!customRegistered(persistence) || typeof persistence.readPreferenceJSON !== 'function') return normalizeCustom(null);
      try { return normalizeCustom(persistence.readPreferenceJSON(CUSTOM_KEY, null)); }
      catch (_) { return normalizeCustom(null); }
    }
    // Zapis całej listy (także pustej — po usunięciu ostatniego pakietu). Adapter przekazuje go kontu.
    function writeCustom(persistence, custom, nowISO) {
      if (!customRegistered(persistence) || typeof persistence.writePreferenceJSON !== 'function') return false;
      var next = normalizeCustom(Object.assign({}, record(custom) ? custom : {}, { schemaVersion: 1, updatedAtISO: nowISO || new Date().toISOString() }));
      try { return persistence.writePreferenceJSON(CUSTOM_KEY, next) === true; }
      catch (_) { return false; }
    }
    /* Stara kopia urządzenia (LAB-PAKIETY PR5). Wersja 1.3.0 trzymała pakiety pod jednym kluczem dla wszystkich
     * kont urządzenia; od 1.4.0 każde konto ma własną kopię. Po samym urządzeniu nie da się ustalić, czyja jest
     * stara kopia, więc rozstrzyga zapis pakietów konta w sejfie — jeden raz, gdy konto nie ma własnej kopii:
     *   - konto ma pakiety w sejfie → stają się jego kopią na urządzeniu; stara kopia znika, gdy była tą samą listą;
     *   - konto nie ma pakietów → dostaje pustą listę, a stara kopia czeka na konto, do którego należy.
     * Odczyt sejfu (exportSyncPayload) jest kosztowny, dlatego tylko przy starej kopii. Nic nie trafia przy tym
     * do konta ani do synchronizacji (applyPreferenceFromCloud zapisuje samą kopię urządzenia). */
    function ownCopy(persistence) {
      try { return typeof persistence.readPreferenceRaw === 'function' ? persistence.readPreferenceRaw(CUSTOM_KEY, null) : null; }
      catch (_) { return null; }
    }
    function legacyCopy(persistence) {
      try { return typeof persistence.readRaw === 'function' ? persistence.readRaw('cloud-synced', CUSTOM_KEY) : null; }
      catch (_) { return null; }
    }
    // Czy konto czeka na rozstrzygnięcie starej kopii: nie ma własnej kopii, a urządzenie ma starą.
    function legacyPending(persistence) {
      return customRegistered(persistence) && ownCopy(persistence) == null && legacyCopy(persistence) != null;
    }
    function vaultUser(vault) {
      try {
        var user = vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked() && typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
        return user && user.userId ? String(user.userId) : '';
      } catch (_) { return ''; }
    }
    /* options: { persistence, vault }. Zwraca Promise z wynikiem: 'none' (nie ma starej kopii), 'own' (konto ma
     * już własną), 'account' (przyjęto pakiety konta z sejfu), 'empty' (konto nie ma pakietów),
     * 'unresolved' (sejf zablokowany, błąd odczytu albo zmiana konta w trakcie — nic nie zapisano). */
    function adoptLegacy(options) {
      options = options || {};
      var persistence = options.persistence, vault = options.vault;
      return Promise.resolve().then(function () {
        if (!customRegistered(persistence)) return 'none';
        if (ownCopy(persistence) != null) return 'own';
        var legacy = legacyCopy(persistence);
        if (legacy == null) return 'none';
        var user = vaultUser(vault);
        if (!user || typeof vault.exportSyncPayload !== 'function' || typeof persistence.applyPreferenceFromCloud !== 'function') return 'unresolved';
        return Promise.resolve(vault.exportSyncPayload()).then(function (payload) {
          // Odczyt sejfu trwa: w tym czasie mogło zmienić się konto albo przyjść własna kopia z synchronizacji.
          if (vaultUser(vault) !== user) return 'unresolved';
          if (ownCopy(persistence) != null) return 'own';
          var entry = payload && record(payload.userPreferences) ? payload.userPreferences[CUSTOM_KEY] : null;
          var value = entry && typeof entry.value === 'string' ? entry.value : null;
          if (value == null) {
            return persistence.applyPreferenceFromCloud(CUSTOM_KEY, JSON.stringify(normalizeCustom(null))) === true ? 'empty' : 'unresolved';
          }
          if (persistence.applyPreferenceFromCloud(CUSTOM_KEY, value) !== true) return 'unresolved';
          if (value === legacy && typeof persistence.removeKey === 'function') persistence.removeKey('cloud-synced', CUSTOM_KEY);
          return 'account';
        });
      }).catch(function () { return 'unresolved'; });
    }
    // Lista wyboru: pakiety wbudowane, potem własne — w kolejności zapisu. slug własnego pakietu to jego identyfikator.
    function listPackages(data, custom) {
      var out = [];
      (data && Array.isArray(data.packages) ? data.packages : []).forEach(function (pkg) {
        out.push({ id: pkg.id, slug: pkg.slug, label: pkg.label, analytes: pkg.analytes.slice(), builtin: true });
      });
      normalizeCustom(custom).packages.forEach(function (pkg) {
        out.push({ id: pkg.id, slug: pkg.id, label: pkg.name, analytes: pkg.analytes.slice(), builtin: false });
      });
      return out;
    }
    /* Sprawdzenie pakietu z kreatora. options: { name, analytes, id (edycja), custom, data, converter }.
     * Zwraca { ok, errors: { name, analytes, limit }, package: { id, name, analytes } }. Nazwa nie może powtarzać
     * nazwy innego pakietu, także wbudowanego (bez rozróżniania wielkości liter). */
    function validatePackage(options) {
      options = options || {};
      var custom = normalizeCustom(options.custom), errors = {};
      var name = cleanName(options.name), analytes = cleanAnalytes(options.analytes), converter = options.converter;
      var editing = typeof options.id === 'string' && custom.packages.some(function (pkg) { return pkg.id === options.id; });
      var id = editing ? options.id : null;
      if (!name) errors.name = 'Podaj nazwę pakietu.';
      else if (name.length > LIMITS.name) errors.name = 'Nazwa pakietu może mieć najwyżej ' + LIMITS.name + ' znaków.';
      else if (listPackages(options.data, custom).some(function (pkg) { return pkg.id !== id && nameKey(pkg.label) === nameKey(name); })) errors.name = 'Masz już pakiet o tej nazwie.';
      var unknown = analytes.filter(function (analyteId) {
        var substance = converter && typeof converter.find === 'function' ? converter.find(analyteId) : null;
        return !substance || substance.id !== analyteId;
      });
      if (!analytes.length) errors.analytes = 'Dodaj co najmniej jedno badanie.';
      else if (unknown.length) errors.analytes = 'Pakiet może zawierać tylko badania z przelicznika.';
      else if (analytes.length > LIMITS.analytes) errors.analytes = 'Pakiet może mieć najwyżej ' + LIMITS.analytes + ' badań.';
      if (!editing && custom.packages.length >= LIMITS.packages) errors.limit = 'Możesz mieć najwyżej ' + LIMITS.packages + ' własnych pakietów.';
      return { ok: !Object.keys(errors).length, errors: errors, package: { id: id, name: name, analytes: analytes } };
    }
    function newPackageId(custom, random) {
      var taken = {}, next = typeof random === 'function' ? random : Math.random;
      normalizeCustom(custom).packages.forEach(function (pkg) { taken[pkg.id] = true; });
      for (var attempt = 0; attempt < 50; attempt++) {
        var id = 'u';
        while (id.length < 11) id += Math.min(35, Math.max(0, Math.floor(next() * 36))).toString(36);
        if (!taken[id]) return id;
      }
      return null;
    }
    /* Pakiet z kreatora na liście własnych pakietów: nowy na końcu, edytowany w swoim miejscu.
     * options jak validatePackage (+ random). Zwraca { ok, errors, custom, id }; custom to lista do zapisu. */
    function savePackage(options) {
      options = options || {};
      var custom = normalizeCustom(options.custom), check = validatePackage(options);
      if (!check.ok) return { ok: false, errors: check.errors, custom: custom, id: null };
      var id = check.package.id || newPackageId(custom, options.random);
      if (!id) return { ok: false, errors: { limit: 'Nie udało się nadać identyfikatora pakietu — spróbuj ponownie.' }, custom: custom, id: null };
      var entry = { id: id, name: check.package.name, analytes: check.package.analytes };
      var packages = check.package.id
        ? custom.packages.map(function (pkg) { return pkg.id === id ? entry : pkg; })
        : custom.packages.concat([entry]);
      return { ok: true, errors: {}, custom: { schemaVersion: 1, updatedAtISO: custom.updatedAtISO, packages: packages }, id: id };
    }
    function removePackage(custom, id) {
      var current = normalizeCustom(custom);
      return { schemaVersion: 1, updatedAtISO: current.updatedAtISO, packages: current.packages.filter(function (pkg) { return pkg.id !== id; }) };
    }
    /* Katalog kreatora: badania przelicznika w grupach i kolejności danych (LabUnitsData.list()).
     * Zwraca [{ label, items: [{ id, label, short, own }] }]. */
    function catalog(data, ownKind) {
      var groups = [], byName = {};
      (data && typeof data.list === 'function' ? data.list() : []).forEach(function (substance) {
        if (!substance || typeof substance.id !== 'string' || !Array.isArray(substance.units) || !substance.units.length) return;
        var name = text(substance.group) || 'Inne';
        if (!byName[name]) { byName[name] = { label: name, items: [] }; groups.push(byName[name]); }
        byName[name].items.push({ id: substance.id, label: substance.label_pl, short: shortLabel(substance.label_pl),
          own: typeof ownKind === 'function' ? ownKind(substance.id) || '' : '' });
      });
      return groups;
    }
    // Tekst do wyszukiwania badania: małe litery, bez znaków diakrytycznych („ł” też).
    function searchKey(value) {
      var out = String(value == null ? '' : value).toLowerCase().replace(/ł/g, 'l');
      try { out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { /* bez normalizacji */ }
      return out.replace(/[\s\u00a0]+/g, ' ').trim();
    }

    // Zrzut normy jak captureLabRange w przeliczniku: ten sam wybór zakresu, wiersz „when”, źródła i wersje.
    function captureRange(options, substance, evaluation, raw) {
      var converter = options.converter, snapshot = options.snapshot, patient = options.patient || {};
      if (!snapshot || typeof snapshot.create !== 'function' || typeof converter.selectRange !== 'function') return undefined;
      var range = converter.selectRange(substance, patient);
      if (!range) return undefined;
      var unitDef = unitOf(substance, evaluation.unit), row = null;
      (substance.reference_ranges_si || []).forEach(function (item) { if (range.id && item.id === range.id) row = item; });
      var data = options.data;
      var envelope = snapshot.normalize(snapshot.create({
        analyte: substance.id, evaluation: evaluation, range: range, when: row ? row.when : null, patient: patient,
        factorToSi: unitDef ? unitDef.factor_to_si : null,
        measurement: { raw: raw, sourceUnit: evaluation.unit },
        sources: (range.source_ids || []).map(function (id) {
          var source = typeof converter.findSource === 'function' && converter.findSource(id) || {};
          return { id: id, label: source.label_short || null, citation: source.full_cite || null, url: source.url || null };
        }),
        versions: { engine: 'LabUnitConverter ' + converter.version, data: 'LabUnitsData ' + (data && data.version || '') },
        // Koperta bez chwili zapisu nie przechodzi normalizacji — domyślnie teraz.
          capturedAtISO: options.capturedAtISO || new Date().toISOString()
      }));
      // Bez pomiaru w zrzucie (rozjazd wejścia, brak granic) wynik zapisuje się bez normy — jak przy przypięciu.
      return envelope && envelope.measurement ? envelope : undefined;
    }

    function markerPosition(value, low, high) {
      if (!finite(value) || !finite(low) || !finite(high) || !(high > low)) return null;
      var position = BAR_LOW + (value - low) / (high - low) * (BAR_HIGH - BAR_LOW);
      return Math.min(BAR_MAX, Math.max(BAR_MIN, position));
    }

    // ── Norma z wydruku (LAB-PAKIETY PR2, decyzje właściciela 2026-11-12 i 2026-11-13) ──
    function normalizeUnit(unit) { return String(unit == null ? '' : unit).trim().replace(/\s+/g, ' ').replace(/µ/g, 'μ'); }
    // Liczba w zapisie normy: przecinek dziesiętny, bez notacji wykładniczej (inaczej historia nie przyjmie normy).
    function plainNumber(value) {
      if (!finite(value) || value < 0) return null;
      var out = String(value);
      return /^\d+(\.\d+)?$/.test(out) ? out.replace('.', ',') : null;
    }
    /* Norma laboratorium wpisana z wydruku, w jednostce wyniku.
     * options: { converter, low, high, unit }; status: 'empty' (oba pola puste), 'invalid' (error), 'ok'.
     * text ma postać pola „Norma” edytora wyniku („0,6–4,8 mIU/L”) i trafia do labResult.norm. */
    function parseLabNorm(options) {
      options = options || {};
      var converter = options.converter;
      var lowRaw = text(options.low), highRaw = text(options.high), unit = text(options.unit);
      if (!lowRaw && !highRaw) return { status: 'empty' };
      if (!lowRaw || !highRaw) return { status: 'invalid', error: 'Podaj obie granice normy: od i do.' };
      var low = converter.parseNumber(lowRaw), high = converter.parseNumber(highRaw);
      var lowText = plainNumber(low), highText = plainNumber(high);
      if (lowText === null || highText === null) return { status: 'invalid', error: 'Granice normy muszą być liczbami, np. 0,6 i 4,8.' };
      if (!(high > low)) return { status: 'invalid', error: 'Górna granica normy musi być większa od dolnej.' };
      return { status: 'ok', low: low, high: high, unit: unit, text: lowText + '–' + highText + (unit ? ' ' + unit : '') };
    }
    // Ta sama reguła co strzałka normy wpisu w historii: powyżej górnej granicy ↑, poniżej dolnej ↓, granice należą do normy.
    function classifyLabNorm(value, norm) {
      return value > norm.high ? 'above' : value < norm.low ? 'below' : 'within';
    }
    function describeLabAssessment(row, appView) {
      var norm = row.norm, kind = classifyLabNorm(row.valueNum, norm);
      return {
        state: LAB_STATES[kind].state, text: LAB_STATES[kind].text, classification: kind, lab: true,
        own: appView && appView.own || '',
        // Źródła zostają przy normie aplikacji, która nadal jest pokazana obok.
        bounds: norm.text, population: '', subject: '', sources: appView && appView.sources || [], general: false,
        marker: markerPosition(row.valueNum, norm.low, norm.high),
        // Norma aplikacji zostaje do wglądu obok; oceny nie daje.
        app: appView && appView.bounds ? { bounds: appView.bounds, population: appView.population, general: appView.general } : null
      };
    }

    /* Norma i jednostka z ostatniego zapisanego wyniku tego samego badania u tego samego pacjenta.
     * Decyzja właściciela 2026-11-13: podpowiedź pochodzi wyłącznie stąd; pacjent bez wcześniejszego wyniku
     * nie dostaje żadnej podpowiedzi. Liczy się tylko najnowszy wynik liczbowy (data badania, potem chwila
     * zapisu); gdy nie ma on normy z wydruku — podpowiedzi normy nie ma, starszych wyników nie przeszukujemy.
     * notes: notatki pacjenta z sejfu. Zwraca { <badanie>: { unit, dateISO, norm: { low, high, text } | null } }. */
    function previousResults(notes, analyteIds) {
      var wanted = Array.isArray(analyteIds) ? analyteIds : [], latest = {};
      (Array.isArray(notes) ? notes : []).forEach(function (note) {
        var lab = note && record(note.labResult) ? note.labResult : null;
        if (!lab || note.category !== CATEGORY || wanted.indexOf(lab.testKey) === -1 || !finite(lab.valueNum) || !text(lab.unit)) return;
        var stamp = [text(note.clinicalDateISO).slice(0, 10), text(note.updatedAtISO) || text(note.createdAtISO)];
        var current = latest[lab.testKey];
        if (current && !(stamp[0] > current.stamp[0] || stamp[0] === current.stamp[0] && stamp[1] > current.stamp[1])) return;
        latest[lab.testKey] = { stamp: stamp, lab: lab };
      });
      var out = {};
      Object.keys(latest).forEach(function (id) {
        var lab = latest[id].lab, unit = text(lab.unit), norm = null;
        var shape = typeof lab.norm === 'string' ? SINGLE_RANGE.exec(lab.norm) : null;
        if (shape && (!shape[3] || normalizeUnit(shape[3]) === normalizeUnit(unit))) {
          var low = shape[1].replace('.', ','), high = shape[2].replace('.', ',');
          if (parseFloat(high.replace(',', '.')) > parseFloat(low.replace(',', '.'))) norm = { low: low, high: high, text: low + '–' + high + ' ' + unit };
        }
        out[id] = { unit: unit, dateISO: latest[id].stamp[0] || null, norm: norm };
      });
      return out;
    }

    // Opis oceny dla formularza: tekst i kategoria pochodzą z tego samego zrzutu, który trafi do zapisu.
    function describeAssessment(row, options) {
      var converter = options.converter, snapshot = options.snapshot;
      var view = { state: '', text: 'brak zakresu referencyjnego w aplikacji', bounds: '', population: '', subject: '', sources: [], marker: null, general: false };
      if (!own(row, 'range') || !snapshot || typeof snapshot.describe !== 'function') return view;
      var format = function (n) { return converter.formatNumber(n, row.precision); };
      var info = snapshot.describe(row.range, { formatNumber: format });
      if (!info) return view;
      view.bounds = info.bounds;
      view.population = info.population;
      view.subject = info.subject;
      view.sources = info.sources;
      if (info.status === 'general') {
        view.general = true;
        view.text = GENERAL_TEXT;
        return view;
      }
      if (info.classification && STATES[info.classification]) {
        view.classification = info.classification;
        view.state = STATES[info.classification].state;
        view.text = STATES[info.classification].text;
        var display = row.range.display;
        view.marker = display ? markerPosition(row.valueNum, display.low, display.high) : null;
        return view;
      }
      view.text = 'bez oceny względem zakresu';
      return view;
    }

    /* Ocena jednego wiersza pakietu.
     * options: { converter, snapshot, data, analyteId, raw, unit, patient, capturedAtISO, normLow, normHigh, own }
     * status: 'empty' (puste pole — wiersz pomijany), 'invalid' (error), 'ok'.
     * normLow/normHigh: norma z wydruku w jednostce wyniku (PR2); puste = norma aplikacji.
     * own ('puberty' | 'single', PR4): pojedyncze badanie ocenia to badanie po swojemu — pakiet nie dobiera mu
     * zakresu katalogu i nie zapisuje zrzutu normy (tak samo jak przypięcie wyniku); zostaje wartość i norma z wydruku. */
    function evaluateRow(options) {
      options = options || {};
      var converter = options.converter, id = options.analyteId;
      var raw = text(options.raw);
      var row = { status: 'empty', analyteId: id, raw: raw, unit: options.unit || '' };
      if (!raw) return row;
      row.status = 'invalid';
      var substance = converter && typeof converter.find === 'function' ? converter.find(id) : null;
      if (!substance) { row.error = 'Badanie nie jest dostępne w przeliczniku.'; return row; }
      row.test = substance.label_pl;
      row.short = shortLabel(substance.label_pl);
      var evaluation = converter.evaluate(id, { value: raw, unit: options.unit, patient: options.patient || {} });
      if (!evaluation || evaluation.ok !== true) { row.error = evaluation && evaluation.error || 'Nie udało się ocenić wyniku.'; return row; }
      var unitDef = unitOf(substance, evaluation.unit), target = unitOf(substance, substance.canonical_si);
      var precision = substance.precision || 3;
      row.status = 'ok';
      row.unit = evaluation.unit;
      row.unitLabel = unitDef && unitDef.label || evaluation.unit;
      row.precision = precision;
      row.valueNum = evaluation.value;
      // Wynik w jednostce SI katalogu — jak domyślna jednostka docelowa pojedynczego badania.
      row.converted = converter.formatNumber(target && target.factor_to_si ? evaluation.siValue / target.factor_to_si : evaluation.siValue, precision)
        + ' ' + substance.canonical_si;
      row.shown = converter.formatNumber(evaluation.value, precision);
      row.own = options.own === 'puberty' || options.own === 'single' ? options.own : '';
      // Silnik nie ocenia bez dodatkowego kontekstu próbki (np. estradiol u dorosłej kobiety bez fazy cyklu);
      // pakiet nie ma tych pól — karta wyniku odsyła do pojedynczego badania.
      if (!row.own && evaluation.reference_context_required === true) row.contextRequired = true;
      var range = row.own ? undefined : captureRange(options, substance, evaluation, raw);
      if (range !== undefined) {
        row.range = range;
        // Liczba jak w przeliczniku („1 000” = 1000) — to samo pole co przy przypięciu pojedynczego wyniku.
        row.valueNum = range.measurement.sourceValue;
      }
      row.view = row.own
        ? { state: '', text: OWN_TEXT, bounds: '', population: '', subject: '', sources: [], marker: null, general: false, own: row.own }
        : describeAssessment(row, options);
      // Norma z wydruku zastępuje normę aplikacji dla tego wyniku; błędna wstrzymuje zapis, a ocena zostaje przy normie aplikacji.
      var labNorm = parseLabNorm({ converter: converter, low: options.normLow, high: options.normHigh, unit: evaluation.unit });
      if (labNorm.status === 'invalid') row.normError = labNorm.error;
      if (labNorm.status === 'ok') {
        row.norm = labNorm;
        row.view = describeLabAssessment(row, row.view);
      }
      return row;
    }

    /* options jak evaluateRow oraz (PR4): patientFor(analyteId) — pacjent dla danego badania (strona dokłada
     * metodę 17-OHP i nośnik wieku estradiolu), ownKind(analyteId) — rodzaj własnej oceny badania. */
    function evaluatePackage(options, inputs) {
      options = options || {};
      return (Array.isArray(inputs) ? inputs : []).map(function (input) {
        var extra = { analyteId: input.analyteId, raw: input.raw, unit: input.unit, normLow: input.normLow, normHigh: input.normHigh };
        if (typeof options.patientFor === 'function') extra.patient = options.patientFor(input.analyteId) || {};
        if (typeof options.ownKind === 'function') extra.own = options.ownKind(input.analyteId) || '';
        return evaluateRow(Object.assign({}, options, extra));
      });
    }

    function validDate(dateISO, todayISO) {
      if (typeof dateISO !== 'string' || !ISO_DATE.test(dateISO)) return 'Podaj datę pobrania.';
      var parts = dateISO.split('-').map(Number), date = new Date(parts[0], parts[1] - 1, parts[2]);
      if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return 'Podaj prawidłową datę pobrania.';
      if (typeof todayISO === 'string' && ISO_DATE.test(todayISO) && dateISO > todayISO) return 'Data pobrania nie może być późniejsza niż dziś.';
      return '';
    }

    // Wiek wizyty w miesiącach z danych sesji — ta sama kotwica co przy przypięciu (lab_pin_result.js).
    function linkedAgeMonths(patient) {
      if (!patient) return null;
      var months = 0;
      if (patient.age != null && isFinite(patient.age)) months += parseInt(patient.age, 10) * 12;
      if (patient.ageMonths != null && isFinite(patient.ageMonths)) months += parseInt(patient.ageMonths, 10);
      return months > 0 ? months : null;
    }
    function formatVisitAge(months) {
      if (!months) return '';
      var years = Math.floor(months / 12), rest = months % 12;
      return years + ' l' + (rest ? ' ' + rest + ' m' : '');
    }
    function localISO(date) {
      var pad = function (value) { return (value < 10 ? '0' : '') + value; };
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }
    function formatDate(dateISO) {
      return typeof dateISO === 'string' && ISO_DATE.test(dateISO) ? dateISO.slice(8, 10) + '.' + dateISO.slice(5, 7) + '.' + dateISO.slice(0, 4) : '';
    }

    /* Notatka wyniku w postaci zapisu „Przypnij do wizyty”.
     * options: { row (status 'ok'), patientId, dateISO, comment, linkedAgeMonths, snapshot } */
    function buildNote(options) {
      var row = options.row;
      var comment = text(options.comment).slice(0, COMMENT_MAX);
      var entered = row.raw + ' ' + row.unitLabel;
      var lab = { test: row.test, value: entered + ' = ' + row.converted };
      lab.testKey = row.analyteId;
      if (row.valueNum != null) lab.valueNum = row.valueNum;
      lab.unit = row.unit;
      // Norma z wydruku: to samo pole i ten sam wiersz treści co „Norma” w edytorze wyniku karty pacjenta.
      // Zastępuje normę aplikacji, więc wynik niesie JEDNĄ normę: zrzut normy aplikacji nie jest wtedy zapisywany.
      // Z oboma historia oceniałaby wynik przeliczony na inną jednostkę normą aplikacji (vilda_lab_history.js:
      // norma z wpisu nie obowiązuje po przeliczeniu, zrzut zakresu — tak), czyli inaczej niż formularz.
      var norm = row.norm && row.norm.status === 'ok' ? row.norm.text : '';
      if (norm) lab.norm = norm;
      else if (own(row, 'range') && options.snapshot && typeof options.snapshot.normalize === 'function') lab.range = options.snapshot.normalize(row.range);
      var note = {
        patientId: options.patientId,
        title: row.test + ': ' + entered,
        body: '= ' + row.converted + (comment ? '\n' + comment : '') + (norm ? '\nNorma: ' + norm : ''),
        category: CATEGORY,
        clinicalDateISO: options.dateISO,
        labResult: lab
      };
      if (options.linkedAgeMonths) note.linkedAgeMonths = options.linkedAgeMonths;
      return note;
    }

    /* Plan zapisu pakietu: tylko wypełnione, poprawne wiersze; błąd w którymkolwiek wstrzymuje cały zapis.
     * Zwraca { ok, error, notes, rows }. */
    function planSave(options) {
      options = options || {};
      var rows = Array.isArray(options.rows) ? options.rows : [];
      var invalid = rows.filter(function (row) { return row.status === 'invalid'; });
      var filled = rows.filter(function (row) { return row.status === 'ok'; });
      if (!options.patientId) return { ok: false, error: 'Wybierz pacjenta, aby zapisać wyniki w jego karcie.', notes: [], rows: [] };
      if (invalid.length) {
        return { ok: false, error: 'Popraw wynik: ' + invalid.map(function (row) { return row.short || row.analyteId; }).join(', ') + '.', notes: [], rows: [] };
      }
      if (!filled.length) return { ok: false, error: 'Wpisz co najmniej jeden wynik.', notes: [], rows: [] };
      var badNorms = filled.filter(function (row) { return !!row.normError; });
      if (badNorms.length) {
        return { ok: false, error: 'Popraw normę z wydruku: ' + badNorms.map(function (row) { return row.short; }).join(', ') + '.', notes: [], rows: [] };
      }
      var dateError = validDate(options.dateISO, options.todayISO);
      if (dateError) return { ok: false, error: dateError, notes: [], rows: [] };
      return {
        ok: true, error: '', rows: filled,
        notes: filled.map(function (row) {
          return buildNote({ row: row, patientId: options.patientId, dateISO: options.dateISO, comment: options.comment,
            linkedAgeMonths: options.linkedAgeMonths, snapshot: options.snapshot });
        })
      };
    }

    /* Tekst do schowka (LAB-PAKIETY PR3, propozycja właściciela 2026-11-13): wyniki pakietu kopiuje przycisk przy
     * formularzu, nie karta „Podsumowanie wyników”. Jeden wiersz na wypełniony wynik, w kolejności pakietu:
     *   <badanie>: <wartość> <jednostka>[ — <ocena, gdy poza normą>][ (<norma>)]
     * Ocena i norma to dokładnie te, które pokazuje karta wyniku: norma z wydruku, gdy ją wpisano, inaczej norma
     * aplikacji. Wynik w normie nie dostaje dopisku. Ocena idzie słowami, bez strzałek: zapis do schowka
     * (vilda_schowek.js) zamienia „↑” na „wzrost”, a przy wyniku badania czytałoby się to jak zmiana w czasie. */
    function copyBounds(row, bounds) {
      var value = text(bounds), unit = text(row.unit);
      // Norma jest w jednostce wyniku, która stoi tuż przed nią — bez powtarzania jednostki.
      if (unit && value.slice(-unit.length) === unit) value = value.slice(0, value.length - unit.length);
      return value.replace(/[\s\u00a0]+$/, '');
    }
    function copyLine(row) {
      var view = record(row.view) ? row.view : {};
      var line = row.short + ': ' + row.shown + ' ' + row.unit;
      var verdict = view.classification && view.classification !== 'within' && STATES[view.classification] ? STATES[view.classification].text : '';
      var norm = '';
      if (view.lab && row.norm) norm = 'norma z wydruku ' + plainNumber(row.norm.low) + '–' + plainNumber(row.norm.high);
      else if (view.general && view.bounds) norm = 'zakres ogólny ' + copyBounds(row, view.bounds) + ' — bez oceny dla dziecka';
      else if (view.bounds) norm = (view.classification ? 'norma ' : 'zakres ') + copyBounds(row, view.bounds) + (view.classification ? '' : ' — bez oceny');
      return line + (verdict ? ' — ' + verdict : '') + (norm ? ' (' + norm + ')' : '');
    }
    /* Zwraca { ok, error, text, names }. Te same warunki co zapis (bez pacjenta): żadnego błędnego wyniku ani
     * normy, co najmniej jeden wynik, poprawna data pobrania — do dokumentacji nie trafia tekst z błędem. */
    function buildCopyText(options) {
      options = options || {};
      var rows = Array.isArray(options.rows) ? options.rows : [];
      var invalid = rows.filter(function (row) { return row.status === 'invalid'; });
      var filled = rows.filter(function (row) { return row.status === 'ok'; });
      var none = { ok: false, text: '', names: '' };
      if (invalid.length) return Object.assign(none, { error: 'Popraw wynik: ' + invalid.map(function (row) { return row.short || row.analyteId; }).join(', ') + '.' });
      if (!filled.length) return Object.assign(none, { error: 'Wpisz co najmniej jeden wynik.' });
      var badNorms = filled.filter(function (row) { return !!row.normError; });
      if (badNorms.length) return Object.assign(none, { error: 'Popraw normę z wydruku: ' + badNorms.map(function (row) { return row.short; }).join(', ') + '.' });
      var dateError = validDate(options.dateISO, options.todayISO);
      if (dateError) return Object.assign(none, { error: dateError });
      return {
        ok: true, error: '',
        text: ['Badania (pobranie ' + formatDate(options.dateISO) + '):'].concat(filled.map(copyLine)).join('\n'),
        names: filled.map(function (row) { return row.short; }).join(', ')
      };
    }

    // Polska odmiana: 1 wynik, 2–4 wyniki, 5+ wyników (12–14 wyników).
    function plural(n, forms) {
      if (n === 1) return forms[0];
      var tens = n % 100, ones = n % 10;
      return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? forms[1] : forms[2];
    }

    return Object.freeze({
      version: '1.4.0',
      SETTINGS_KEY: SETTINGS_KEY,
      CUSTOM_KEY: CUSTOM_KEY,
      LIMITS: LIMITS,
      CATEGORY: CATEGORY,
      COMMENT_MAX: COMMENT_MAX,
      findPackage: findPackage,
      listPackages: listPackages,
      normalizeCustom: normalizeCustom,
      readCustom: readCustom,
      writeCustom: writeCustom,
      legacyPending: legacyPending,
      adoptLegacy: adoptLegacy,
      validatePackage: validatePackage,
      savePackage: savePackage,
      removePackage: removePackage,
      catalog: catalog,
      searchKey: searchKey,
      rememberPackage: rememberPackage,
      describeAnalytes: describeAnalytes,
      pickUnit: pickUnit,
      normalizeSettings: normalizeSettings,
      readSettings: readSettings,
      rememberUnits: rememberUnits,
      evaluateRow: evaluateRow,
      evaluatePackage: evaluatePackage,
      parseLabNorm: parseLabNorm,
      previousResults: previousResults,
      validDate: validDate,
      linkedAgeMonths: linkedAgeMonths,
      formatVisitAge: formatVisitAge,
      localISO: localISO,
      formatDate: formatDate,
      buildNote: buildNote,
      planSave: planSave,
      buildCopyText: buildCopyText,
      plural: plural,
      shortLabel: shortLabel
    });
  })();

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  3. WIDOK — zakładki trybu i panel pakietu w karcie przelicznika na stronie „Jednostki lab.”.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  var UI = (function (win) {
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var NBSP = '\u00a0';
    var PATIENT_KEY = 'vildaCurrentPatientId';
    var REFRESH_DELAY_MS = 120;
    var VAULT_WAIT_MS = 5000;
    var GATES = {
      locked: {
        title: 'Pakiety badań są dostępne po zalogowaniu',
        text: 'Pakiet zapisuje wyniki w karcie pacjenta, dlatego wymaga konta. Pojedyncze badanie przeliczysz i ocenisz jak dotąd, bez logowania.',
        action: 'Zaloguj się'
      },
      'no-patient': {
        title: 'Nie wybrano pacjenta',
        text: 'Wpisywanie wyników wymaga pacjenta: pakiet zapisuje je w jego karcie i dobiera normy do wieku i płci. Wybierz pacjenta w Bazie pacjentów albo zapisz nowego na stronie głównej. Pakiety możesz tworzyć i zmieniać bez pacjenta — należą do konta.',
        action: 'Wybierz pacjenta'
      },
      // Własny pakiet, z którego ta wersja przelicznika nie zna żadnego badania.
      empty: {
        title: 'Tego pakietu nie da się teraz wypełnić',
        text: 'Żadnego z badań tego pakietu nie ma w przeliczniku. Zmień skład pakietu albo wybierz inny.',
        action: 'Edytuj pakiet'
      },
      unavailable: {
        title: 'Pakiet badań jest chwilowo niedostępny',
        text: 'Nie udało się wczytać przelicznika — odśwież stronę.',
        action: ''
      }
    };
    // Badania z własną oceną w pojedynczym badaniu (PR4): opis w kreatorze i w karcie wyniku.
    var OWN_KINDS = {
      puberty: { badge: 'ocena pokwitaniowa w pojedynczym badaniu', mark: 'pokwit.', note: 'Ocena pokwitaniowa w pojedynczym badaniu albo z normy z wydruku.' },
      single: { badge: 'ocena w pojedynczym badaniu', mark: 'poj. badanie', note: 'Pełna ocena w pojedynczym badaniu albo z normy z wydruku.' }
    };
    var CONTEXT_NOTE = 'Ocena wymaga kontekstu badania (np. fazy cyklu) — wybierzesz go w pojedynczym badaniu.';
    // Etykieta do 3 znaków (TSH, fT4, LH) mieści się w kolumnie obok pola; dłuższa staje nad polem.
    var LABEL_COMPACT_MAX = 3;
    var OTHER_DAY_NOTE = 'Normy dobrano do danych pacjenta widocznych teraz w przeliczniku. Badanie było w innym dniu — sprawdź, czy te przedziały pasują do wieku w dniu badania.';

    function create(w) {
      var doc = w.document;
      var state = { mode: 'single', pkg: null, rows: [], pid: null, gate: '', busy: false, built: false, formBuilt: false, done: null, error: '', remembered: false,
        // PR2: poprzednie wyniki pacjenta (jednostka i norma z wydruku), pola normy wypełnione podpowiedzią,
        // jednostki zmienione ręcznie i wiersze, w których zmiana jednostki skasowała normę.
        previous: null, previousFor: null, authAsked: null, loadSeq: 0, prefilled: {}, unitTouched: {}, unitNotice: {}, unitSource: {},
        // PR4: lista pakietów (wbudowane i własne z konta), wybrany pakiet, kreator.
        packages: [], custom: null, customSig: null, optionsSig: null, rowsSig: null, pickerBuilt: false, creatorBuilt: false,
        view: 'form', draft: null, pickerNote: '', saving: false,
        // PR5: stara, wspólna kopia pakietów czeka na rozstrzygnięcie w sejfie, czyje to pakiety.
        adopting: false, adoptTries: 0,
        // Lekarz sam wybrał pakiet (lista, kreator, adres) — wczytanie pakietów z konta nie zmienia już wyboru.
        picked: false };
      var grid = null, card = null, singleBtn = null, packageBtn = null;
      var parts = { inputs: {}, units: {}, errors: {}, cards: {}, normLow: {}, normHigh: {}, normUnit: {}, normErrors: {} };
      var timer = null;

      function model() { return MODEL; }
      function converter() { return w.LabUnitConverter || null; }
      function snapshot() { return w.VildaLabRangeSnapshot || null; }
      function byId(id) { return doc.getElementById(id); }
      function add(parent, tag, className, textContent) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (textContent != null) node.textContent = textContent;
        if (parent) parent.appendChild(node);
        return node;
      }
      function svg(parent, tag, attributes) {
        var node = doc.createElementNS(SVG_NS, tag);
        Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
        if (parent) parent.appendChild(node);
        return node;
      }
      function button(parent, className, label, onClick) {
        var node = add(parent, 'button', className, label);
        node.type = 'button';
        node.addEventListener('click', onClick);
        return node;
      }

      // ── Kontekst: konto, pacjent karty, pacjent do norm ──
      function patientId() {
        if (w._vildaCurrentPatientId) return String(w._vildaCurrentPatientId);
        try { return w.sessionStorage && w.sessionStorage.getItem(PATIENT_KEY) || null; } catch (_) { return null; }
      }
      function sessionPatient() {
        try { var session = w.VildaSession; return session && typeof session.getPatient === 'function' ? session.getPatient() : null; } catch (_) { return null; }
      }
      function loggedIn() {
        try { var session = w.VildaSession; return !!(session && typeof session.isLoggedIn === 'function' && session.isLoggedIn()); } catch (_) { return false; }
      }
      function runtime() { try { return w.VildaLabConverterRuntime || null; } catch (_) { return null; } }
      // Strona mówi, dla kogo liczyć normę i które badania ocenia po swojemu; bez niej pakiet nie ocenia niczego.
      function runtimeReady() {
        var page = runtime();
        return !!(page && typeof page.getPackagePatient === 'function' && typeof page.ownAssessmentKind === 'function');
      }
      // analyteId: badanie, dla którego pakiet pyta o pacjenta (metoda 17-OHP, nośnik wieku estradiolu).
      function packagePatient(analyteId) {
        try {
          var page = runtime();
          return page && typeof page.getPackagePatient === 'function' ? page.getPackagePatient(analyteId) : null;
        } catch (_) { return null; }
      }
      // 'puberty' | 'single' | '' — pytane przy każdej ocenie, bo skrypt strony rusza po tym pliku.
      function ownKind(analyteId) {
        try {
          var page = runtime();
          return page && typeof page.ownAssessmentKind === 'function' ? page.ownAssessmentKind(analyteId) || '' : '';
        } catch (_) { return ''; }
      }
      function context() {
        var patient = sessionPatient();
        var name = patient && typeof patient.name === 'string' ? patient.name.trim() : '';
        var pid = patientId();
        var gate = !model() || !converter() || !snapshot() || !runtimeReady() || !state.pkg ? 'unavailable'
          : !loggedIn() ? 'locked' : !(pid && name) ? 'no-patient' : !state.rows.length ? 'empty' : '';
        return { gate: gate, pid: gate ? null : String(pid), name: name, sessionPatient: patient };
      }

      // ── Pakiety: wbudowane i własne z konta (PR4) ──
      function persistence() { return w.VildaPersistence || null; }
      // Czyta własne pakiety konta; true, gdy lista się zmieniła (zapis kreatora, synchronizacja z innego urządzenia).
      function loadPackages() {
        var m = model();
        if (!m) return false;
        var custom = m.readCustom(persistence());
        var signature = JSON.stringify(custom.packages);
        if (signature === state.customSig) return false;
        state.customSig = signature;
        state.custom = custom;
        state.packages = m.listPackages(DATA, custom);
        return true;
      }
      /* Stara wspólna kopia pakietów (sprzed 1.4.0): sejf rozstrzyga, czy należy do zalogowanego konta. Trwa to
       * chwilę i dzieje się raz; do tego czasu kreator jest nieczynny, bo zapis nadpisałby listę konta.
       * Nieudana próba (sejf jeszcze zablokowany, błąd odczytu) wraca przy kolejnym odświeżeniu, najwyżej 3 razy. */
      function legacyBlocked() {
        var m = model();
        return state.adopting || !!(m && m.legacyPending(persistence()));
      }
      function adoptLegacy() {
        var m = model(), store = persistence();
        if (state.adopting || state.adoptTries >= 3 || !m || !m.legacyPending(store)) return;
        state.adopting = true;
        state.adoptTries++;
        try { if (w.VildaSession && typeof w.VildaSession.ensureAuthLoaded === 'function') w.VildaSession.ensureAuthLoaded(); } catch (_) { /* sejf sprawdzi rozstrzygnięcie */ }
        waitForUnlocked(VAULT_WAIT_MS).then(function (vault) {
          return m.adoptLegacy({ persistence: store, vault: vault });
        }).catch(function () { return 'unresolved'; }).then(function (result) {
          state.adopting = false;
          if (result !== 'unresolved') state.adoptTries = 0;
          // Pakiety właśnie przyszły z konta: wraca pakiet używany ostatnio na tym urządzeniu.
          if (result === 'account' && !state.picked && loadPackages()) selectPackage(preferredPackage());
          schedule();
        });
      }
      function preferredPackage() {
        var m = model(), last = m ? m.readSettings(persistence()).lastPackage : null;
        return last && m.findPackage(state.packages, last) ? last : state.packages[0] ? state.packages[0].id : null;
      }
      /* Ustawia wybrany pakiet i jego wiersze; true, gdy zmienił się pakiet albo jego skład. Pola przebudowują się
       * wtedy od nowa: wartości wpisane dla innego pakietu znikają, a przy tym samym pakiecie (skład zmieniony
       * w kreatorze albo na innym urządzeniu konta) zostają przy badaniach, które w nim zostały. */
      function selectPackage(key) {
        var m = model();
        var pkg = m.findPackage(state.packages, key) || state.packages[0] || null;
        var rows = pkg && converter() ? m.describeAnalytes(pkg, converter()) : [];
        var signature = pkg ? pkg.id + ':' + rows.map(function (row) { return row.id; }).join(',') : '';
        var same = !!(pkg && state.pkg && pkg.id === state.pkg.id);
        state.pkg = pkg;
        if (signature === state.rowsSig) return false;
        state.rows = rows;
        state.rowsSig = signature;
        if (!same) {
          state.done = null;
          state.error = '';
        }
        state.previous = null;
        state.previousFor = null;
        if (state.formBuilt) buildRows(same);
        return true;
      }
      function choosePackage(id) {
        if (state.busy) { drawPicker(); return; }
        state.pickerNote = '';
        state.picked = true;
        selectPackage(id);
        if (state.pkg) model().rememberPackage(persistence(), state.pkg.id);
        refresh();
      }
      // Okno, w którym działa pasek aplikacji: ramka powłoki oddaje logowanie i listę pacjentów powłoce.
      function chromeWindow() {
        try {
          if (doc.documentElement.classList.contains('vilda-embedded') && w.parent && w.parent !== w && w.parent.document) return w.parent;
        } catch (_) { /* ramka z innego źródła */ }
        return w;
      }

      // ── Budowa karty ──
      function step(parent, number, label, hint) {
        var box = add(parent, 'div', 'lab-step lab-pkg-step');
        var num = add(box, 'div', 'lab-step-num', String(number));
        num.setAttribute('data-step', String(number));
        var body = add(box, 'div', 'lab-step-body');
        var title = add(body, 'div', 'lab-step-label', label);
        if (hint) add(title, 'span', 'lab-step-label-opt', hint);
        return { box: box, num: num, body: body };
      }
      function markStep(num, done, active) {
        num.classList.toggle('is-done', !!done);
        num.classList.toggle('is-active', !done && !!active);
        num.textContent = done ? '✓' : num.getAttribute('data-step');
      }

      function build() {
        if (state.built || !card) return;
        state.built = true;
        // Tytuł i zakładki trybu stoją w nagłówku karty (przelicznik-jednostek.html); panel nie ma własnego tytułu.
        // Lewa kolumna: wybór pakietu (po zalogowaniu), bramka albo pola wyników; prawa: ocena i zapis.
        // Pola wyników powstają dopiero po przejściu bramki (buildEntry), kreator — przy pierwszym otwarciu.
        parts.body = add(card, 'div', 'lab-pkg-body');
        parts.form = add(parts.body, 'div', 'lab-pkg-form');
        parts.gate = add(parts.form, 'div', 'lab-pkg-gate');
        parts.gate.setAttribute('role', 'status');
        parts.gateTitle = add(parts.gate, 'strong', 'lab-pkg-gate-title');
        parts.gateText = add(parts.gate, 'p', 'lab-pkg-gate-text');
        parts.gateAction = button(parts.gate, 'lab-pkg-btn lab-pkg-btn-primary', '', gateAction);
        parts.gateAction.id = 'labPkgGateAction';
        // Powrót do pojedynczego badania: zakładka nad panelem (bez osobnego przycisku w bramce).
        parts.entry = add(parts.form, 'div', 'lab-pkg-entry');
        parts.entry.hidden = true;
        parts.results = add(parts.body, 'div', 'lab-pkg-results');
        parts.results.hidden = true;
      }

      // Krok 1: lista rozwijana pakietów (wbudowane i własne), „Nowy pakiet”, skład i „Edytuj pakiet”.
      function buildPicker() {
        if (state.pickerBuilt) return;
        state.pickerBuilt = true;
        var s1 = step(parts.form, 1, 'Pakiet');
        // Krok stoi przed bramką, bezpośrednio w kolumnie formularza (jak pozostałe kroki).
        parts.form.insertBefore(s1.box, parts.gate);
        parts.pickerStep = s1.box;
        parts.step1 = s1.num;
        var choice = add(s1.body, 'div', 'lab-pkg-choice');
        parts.select = add(choice, 'select', 'lab-pkg-select');
        parts.select.id = 'labPkgSelect';
        parts.select.setAttribute('aria-label', 'Wybór pakietu');
        parts.select.addEventListener('change', function () { choosePackage(parts.select.value); });
        parts.create = button(choice, 'lab-pkg-btn lab-pkg-btn-dashed', '+ Nowy pakiet', function () { openCreator(null); });
        parts.create.id = 'labPkgNew';
        var line = add(s1.body, 'div', 'lab-pkg-contents');
        parts.contents = add(line, 'span', 'lab-pkg-chip-list');
        parts.contents.id = 'labPkgContents';
        parts.edit = button(line, 'lab-pkg-link', 'Edytuj pakiet', function () { openCreator(state.pkg); });
        parts.edit.id = 'labPkgEdit';
        parts.pickerNote = add(s1.body, 'p', 'lab-pkg-hint lab-pkg-picker-note');
        parts.pickerNote.id = 'labPkgPickerNote';
        parts.pickerNote.setAttribute('role', 'status');
        parts.pickerNote.hidden = true;
      }
      function drawPicker() {
        var signature = state.packages.map(function (pkg) { return pkg.id + '\u0001' + pkg.label; }).join('\u0002');
        if (signature !== state.optionsSig) {
          state.optionsSig = signature;
          parts.select.textContent = '';
          [['Wbudowane', true], ['Twoje pakiety', false]].forEach(function (group) {
            var list = state.packages.filter(function (pkg) { return pkg.builtin === group[1]; });
            if (!list.length) return;
            var host = add(parts.select, 'optgroup');
            host.label = group[0];
            list.forEach(function (pkg) {
              var option = add(host, 'option', '', pkg.label);
              option.value = pkg.id;
            });
          });
        }
        var blocked = legacyBlocked();
        parts.select.value = state.pkg ? state.pkg.id : '';
        parts.select.disabled = state.busy;
        parts.create.disabled = state.busy || blocked;
        parts.contents.textContent = state.rows.length
          ? state.rows.map(function (row) { return row.short; }).join(' · ') : 'brak badań z przelicznika';
        parts.edit.hidden = !state.pkg || state.pkg.builtin;
        parts.edit.disabled = state.busy || blocked;
        var note = !blocked ? state.pickerNote
          : state.adopting || state.adoptTries < 3 ? 'Wczytuję Twoje pakiety z konta…'
            : 'Nie udało się wczytać Twoich pakietów z konta — odśwież stronę. Do tego czasu nie można tworzyć ani zmieniać pakietów.';
        parts.pickerNote.hidden = !note;
        parts.pickerNote.textContent = note;
      }

      // Kroki 2–5 i kolumna oceny: szkielet stały, wiersze badań przebudowuje buildRows przy zmianie pakietu.
      function buildEntry() {
        if (state.formBuilt) return;
        state.formBuilt = true;
        var m = model();
        var form = parts.entry;

        var s2 = step(form, 2, 'Wyniki z wydruku', '— puste pole jest pomijane');
        parts.step2 = s2.num;
        parts.rowsHost = add(s2.body, 'div', 'lab-pkg-rows');
        parts.unitsHint = add(s2.body, 'p', 'lab-pkg-hint', 'Jednostki zapamiętane z poprzedniego wpisu na tym urządzeniu.');
        parts.unitsHint.hidden = true;

        // PR2: norma laboratorium z wydruku, w jednostce wyniku. Pusta = ocena normą aplikacji.
        var sn = step(form, 3, 'Normy z wydruku', '— opcjonalnie');
        parts.stepNorms = sn.num;
        parts.normsHost = add(sn.body, 'div', 'lab-pkg-norms');
        add(sn.body, 'p', 'lab-pkg-hint', 'Puste pola = norma aplikacji dla wieku pacjenta. Wpisana norma zastępuje ją dla tego wyniku i zapisuje się razem z nim.');
        parts.prefillHint = add(sn.body, 'p', 'lab-pkg-hint lab-pkg-prefill-hint');
        parts.prefillHint.id = 'labPkgPrefillHint';
        parts.prefillHint.setAttribute('role', 'status');
        parts.prefillHint.hidden = true;
        parts.unitNotice = add(sn.body, 'p', 'lab-pkg-hint lab-pkg-unit-notice');
        parts.unitNotice.id = 'labPkgUnitNotice';
        parts.unitNotice.setAttribute('role', 'status');
        parts.unitNotice.hidden = true;

        var s3 = step(form, 4, 'Data pobrania i komentarz');
        parts.step3 = s3.num;
        var meta = add(s3.body, 'div', 'lab-pkg-meta');
        var dateField = add(meta, 'div', 'lab-pkg-field lab-pkg-field-date');
        var dateLabel = add(dateField, 'label', 'lab-pkg-field-label', 'Data pobrania');
        parts.date = add(dateField, 'input', 'lab-pkg-date');
        parts.date.type = 'date';
        parts.date.id = 'labPkgDate';
        dateLabel.setAttribute('for', parts.date.id);
        var commentField = add(meta, 'div', 'lab-pkg-field lab-pkg-field-comment');
        var commentLabel = add(commentField, 'label', 'lab-pkg-field-label', 'Komentarz do pakietu (opcjonalnie)');
        parts.comment = add(commentField, 'input', 'lab-pkg-comment');
        parts.comment.type = 'text';
        parts.comment.id = 'labPkgComment';
        parts.comment.maxLength = m.COMMENT_MAX;
        parts.comment.setAttribute('placeholder', 'np. kontrola po zmianie dawki');
        commentLabel.setAttribute('for', parts.comment.id);
        parts.dateNote = add(s3.body, 'p', 'lab-pkg-hint lab-pkg-date-note');
        parts.dateNote.id = 'labPkgDateNote';
        parts.dateNote.setAttribute('role', 'status');
        parts.dateNote.hidden = true;
        parts.date.addEventListener('input', edited);
        parts.date.addEventListener('change', edited);

        var s4 = step(form, 5, 'Pacjent', '— z karty, wpływa na normę');
        parts.step4 = s4.num;
        // Ten sam wygląd co kontekst pacjenta pojedynczego badania (klasy przelicznika).
        parts.patientBox = add(s4.body, 'div', 'lab-patient-context lab-pkg-patient');
        parts.patient = add(add(parts.patientBox, 'div', 'lab-patient-summary'), 'span', 'lab-patient-text');
        parts.patient.id = 'labPkgPatient';

        parts.clear = button(form, 'lab-pkg-btn lab-pkg-btn-ghost lab-pkg-clear', 'Wyczyść pakiet', function () {
          clearValues(true);
          applyUnits();
          applyPreviousAll();
          refresh();
        });
        parts.clear.id = 'labPkgClear';

        var results = parts.results;
        var head = add(results, 'div', 'lab-pkg-results-head');
        add(head, 'div', 'lab-step-label', 'Ocena wyników');
        add(head, 'div', 'lab-pkg-hint', 'na żywo, dla danych pacjenta z karty');
        parts.cardsHost = add(results, 'div', 'lab-pkg-cards');
        parts.cardsHost.id = 'labPkgCards';
        parts.sources = add(results, 'p', 'lab-pkg-hint lab-pkg-sources');
        parts.sources.id = 'labPkgSources';
        parts.sources.hidden = true;

        parts.save = add(results, 'div', 'lab-pkg-save');
        var info = add(parts.save, 'div', 'lab-pkg-save-info');
        parts.saveCtx = add(info, 'span', 'lab-pkg-save-ctx');
        parts.saveSub = add(info, 'span', 'lab-pkg-save-sub');
        parts.saveBtn = button(parts.save, 'lab-pkg-btn lab-pkg-btn-save', 'Zapisz wyniki do karty', save);
        parts.saveBtn.id = 'labPkgSave';
        parts.error = add(results, 'p', 'lab-pkg-error');
        parts.error.id = 'labPkgError';
        parts.error.setAttribute('role', 'alert');
        parts.error.hidden = true;

        parts.done = add(results, 'div', 'lab-pkg-done');
        parts.done.id = 'labPkgDone';
        parts.done.setAttribute('role', 'status');
        parts.done.hidden = true;
        parts.doneTitle = add(parts.done, 'strong', 'lab-pkg-done-title');
        parts.doneText = add(parts.done, 'span', 'lab-pkg-done-text');
        parts.doneOpen = button(parts.done, 'lab-pkg-btn lab-pkg-btn-ghost', 'Otwórz Badania', openCard);
        parts.doneOpen.id = 'labPkgOpenCard';

        // PR3 (propozycja właściciela 2026-11-13): kopiowanie do dokumentacji przy samym pakiecie, nie w karcie
        // „Podsumowanie wyników”. Kopiuje wpisane wyniki, a gdy formularz jest pusty po zapisie — zapisany zestaw.
        parts.copy = button(results, 'lab-pkg-btn lab-pkg-btn-ghost lab-pkg-copy', 'Kopiuj wyniki', copyResults);
        parts.copy.id = 'labPkgCopy';

        buildRows(false);
        resetDate();
      }

      /* Wiersze badań wybranego pakietu: pola wyników, norm z wydruku i karty oceny. Wołane przy budowie
       * formularza i przy każdej zmianie pakietu albo jego składu. keep: ten sam pakiet w zmienionym składzie —
       * wpisane wartości, jednostki i normy zostają przy badaniach, które w nim zostały. */
      function buildRows(keep) {
        var old = {};
        if (keep) {
          Object.keys(parts.inputs).forEach(function (id) {
            old[id] = { value: parts.inputs[id].value, unit: parts.units[id].value, low: parts.normLow[id].value, high: parts.normHigh[id].value,
              prefilled: state.prefilled[id], touched: state.unitTouched[id], notice: state.unitNotice[id] };
          });
        }
        ['inputs', 'units', 'errors', 'cards', 'normLow', 'normHigh', 'normUnit', 'normErrors'].forEach(function (key) { parts[key] = {}; });
        parts.rowsHost.textContent = '';
        parts.normsHost.textContent = '';
        parts.cardsHost.textContent = '';
        state.prefilled = {};
        state.unitTouched = {};
        state.unitNotice = {};
        var stacked = state.rows.some(function (row) { return row.short.length > LABEL_COMPACT_MAX; });
        parts.rowsHost.classList.toggle('is-stacked', stacked);
        parts.normsHost.classList.toggle('is-stacked', stacked);

        state.rows.forEach(function (row) {
          var line = add(parts.rowsHost, 'div', 'lab-pkg-row');
          line.setAttribute('data-analyte', row.id);
          var label = add(line, 'label', 'lab-pkg-row-label', row.short);
          var input = add(line, 'input', 'lab-pkg-value');
          input.type = 'text';
          input.id = 'labPkgValue-' + row.id;
          input.setAttribute('inputmode', 'decimal');
          input.setAttribute('autocomplete', 'off');
          input.setAttribute('aria-describedby', 'labPkgError-' + row.id);
          label.setAttribute('for', input.id);
          var select = add(line, 'select', 'lab-pkg-unit');
          select.id = 'labPkgUnit-' + row.id;
          select.setAttribute('aria-label', 'Jednostka ' + row.short);
          row.units.forEach(function (unit) {
            // Sam symbol jednostki: mieści się na telefonie; zapis niesie pełną etykietę katalogu.
            var option = add(select, 'option', '', unit.symbol);
            option.value = unit.symbol;
          });
          var error = add(line, 'p', 'lab-pkg-row-error');
          error.id = 'labPkgError-' + row.id;
          error.hidden = true;
          input.addEventListener('input', edited);
          select.addEventListener('change', function () { unitChanged(row.id); });
          parts.inputs[row.id] = input;
          parts.units[row.id] = select;
          parts.errors[row.id] = error;

          var normLine = add(parts.normsHost, 'div', 'lab-pkg-norm-row');
          normLine.setAttribute('data-analyte', row.id);
          add(normLine, 'span', 'lab-pkg-norm-label', row.short);
          [['normLow', 'Low', 'od'], ['normHigh', 'High', 'do']].forEach(function (side, index) {
            if (index) add(normLine, 'span', 'lab-pkg-norm-sep', '–').setAttribute('aria-hidden', 'true');
            var field = add(normLine, 'input', 'lab-pkg-norm');
            field.type = 'text';
            field.id = 'labPkgNorm' + side[1] + '-' + row.id;
            field.setAttribute('inputmode', 'decimal');
            field.setAttribute('autocomplete', 'off');
            field.setAttribute('placeholder', side[2]);
            field.setAttribute('aria-label', 'Norma ' + row.short + ' z wydruku, ' + side[2]);
            field.setAttribute('aria-describedby', 'labPkgNormError-' + row.id);
            field.addEventListener('input', function () { normEdited(row.id); });
            parts[side[0]][row.id] = field;
          });
          parts.normUnit[row.id] = add(normLine, 'span', 'lab-pkg-norm-unit');
          var normError = add(normLine, 'p', 'lab-pkg-norm-error');
          normError.id = 'labPkgNormError-' + row.id;
          normError.hidden = true;
          parts.normErrors[row.id] = normError;

          var box = add(parts.cardsHost, 'div', 'lab-pkg-card');
          box.setAttribute('data-analyte', row.id);
          parts.cards[row.id] = box;
        });

        applyUnits();
        state.rows.forEach(function (row) {
          var kept = old[row.id];
          if (!kept) return;
          parts.inputs[row.id].value = kept.value;
          if (model().pickUnit(row, kept.unit) === kept.unit) parts.units[row.id].value = kept.unit;
          parts.normLow[row.id].value = kept.low;
          parts.normHigh[row.id].value = kept.high;
          if (kept.prefilled) state.prefilled[row.id] = kept.prefilled;
          if (kept.touched) state.unitTouched[row.id] = kept.touched;
          if (kept.notice) state.unitNotice[row.id] = kept.notice;
        });
        if (state.busy) setBusy(true);
      }

      function applyUnits() {
        var m = model(), settings = m.readSettings(w.VildaPersistence || null);
        state.remembered = false;
        state.unitSource = {};
        state.rows.forEach(function (row) {
          var preferred = settings.units[row.id];
          var unit = m.pickUnit(row, preferred);
          parts.units[row.id].value = unit;
          if (preferred && unit === preferred && preferred !== row.canonicalUnit) {
            state.remembered = true;
            state.unitSource[row.id] = 'device';
          }
        });
      }
      function drawUnitsHint() {
        var sources = state.rows.map(function (row) { return state.unitSource[row.id]; });
        var patient = sources.indexOf('patient') !== -1, device = sources.indexOf('device') !== -1;
        parts.unitsHint.hidden = !patient && !device;
        parts.unitsHint.textContent = patient
          ? 'Jednostki jak w poprzednim wyniku pacjenta' + (device ? '; pozostałe zapamiętane z poprzedniego wpisu na tym urządzeniu.' : '.')
          : 'Jednostki zapamiętane z poprzedniego wpisu na tym urządzeniu.';
      }
      function today() { return model().localISO(new Date()); }
      function resetDate() {
        parts.date.value = today();
        parts.date.max = today();
      }
      function setBusy(busy) {
        state.busy = busy;
        if (!state.formBuilt) return;
        state.rows.forEach(function (row) {
          parts.inputs[row.id].disabled = busy;
          parts.units[row.id].disabled = busy;
          parts.normLow[row.id].disabled = busy;
          parts.normHigh[row.id].disabled = busy;
        });
        parts.date.disabled = busy;
        parts.comment.disabled = busy;
        parts.clear.disabled = busy;
      }
      function clearValues(keepDone) {
        if (!state.formBuilt) return;
        state.rows.forEach(function (row) {
          parts.inputs[row.id].value = '';
          parts.normLow[row.id].value = '';
          parts.normHigh[row.id].value = '';
        });
        parts.comment.value = '';
        resetDate();
        state.error = '';
        state.prefilled = {};
        state.unitTouched = {};
        state.unitNotice = {};
        if (!keepDone) state.done = null;
      }

      // ── Podpowiedź z poprzedniego wyniku tego samego pacjenta (PR2, decyzja właściciela 2026-11-13) ──
      // Jedyne źródło podpowiedzi normy: ostatni zapisany wynik tego badania u tego pacjenta. Pacjent bez
      // wcześniejszego wyniku nie dostaje żadnej podpowiedzi — pola normy zostają puste.
      function loadPrevious() {
        var pid = state.pid, sequence = ++state.loadSeq, vault = w.VildaVault;
        state.previous = null;
        state.previousFor = null;
        if (!pid) return;
        var ready;
        try { ready = !!vault && typeof vault.listPatientNotesForPatient === 'function' && typeof vault.isUnlocked === 'function' && vault.isUnlocked(); } catch (_) { ready = false; }
        if (!ready) {
          // Stos konta ładuje most sesji; po „vilda:auth-loaded” odświeżenie ponowi odczyt.
          if (state.authAsked !== pid) {
            state.authAsked = pid;
            try { if (w.VildaSession && typeof w.VildaSession.ensureAuthLoaded === 'function') w.VildaSession.ensureAuthLoaded(); } catch (_) { /* bez podpowiedzi */ }
          }
          return;
        }
        state.previousFor = pid;
        Promise.resolve().then(function () { return vault.listPatientNotesForPatient(pid); }).then(function (notes) {
          if (sequence !== state.loadSeq || pid !== state.pid) return;
          state.previous = model().previousResults(notes, state.rows.map(function (row) { return row.id; }));
          applyPreviousAll();
          refresh();
        }).catch(function () { if (sequence === state.loadSeq) state.previousFor = null; });
      }
      function applyPreviousAll() { state.rows.forEach(function (row) { applyPrevious(row, true); }); }
      // Jednostka poprzedniego wyniku — gdy wiersz jest nietknięty; norma — gdy jej pola są puste, a jednostka ta sama.
      function applyPrevious(row, withUnit) {
        var previous = state.previous && state.previous[row.id];
        var select = parts.units[row.id], low = parts.normLow[row.id], high = parts.normHigh[row.id];
        // Podpowiedź z wcześniejszego odczytu, której nikt nie poprawił, ustępuje nowemu odczytowi.
        if (state.prefilled[row.id]) {
          low.value = '';
          high.value = '';
          delete state.prefilled[row.id];
        }
        if (!previous || model().pickUnit(row, previous.unit) !== previous.unit) return;
        if (withUnit && !state.unitTouched[row.id] && !String(parts.inputs[row.id].value || '').trim() && select.value !== previous.unit) {
          select.value = previous.unit;
          state.unitSource[row.id] = 'patient';
        }
        if (!previous.norm || String(low.value || '').trim() || String(high.value || '').trim() || select.value !== previous.unit) return;
        low.value = previous.norm.low;
        high.value = previous.norm.high;
        state.prefilled[row.id] = previous.dateISO || true;
        state.unitNotice[row.id] = false;
      }
      // Norma jest w jednostce wyniku: po zmianie jednostki wpisana norma przestaje obowiązywać.
      function unitChanged(id) {
        var row = state.rows.filter(function (item) { return item.id === id; })[0];
        var had = !!(String(parts.normLow[id].value || '').trim() || String(parts.normHigh[id].value || '').trim());
        state.unitTouched[id] = true;
        delete state.unitSource[id];
        parts.normLow[id].value = '';
        parts.normHigh[id].value = '';
        delete state.prefilled[id];
        state.unitNotice[id] = had;
        if (row) applyPrevious(row, false);
        edited();
      }
      function normEdited(id) {
        delete state.prefilled[id];
        state.unitNotice[id] = false;
        edited();
      }

      // ── Ocena na żywo ──
      function inputs() {
        return state.rows.map(function (row) {
          return { analyteId: row.id, raw: parts.inputs[row.id].value, unit: parts.units[row.id].value,
            normLow: parts.normLow[row.id].value, normHigh: parts.normHigh[row.id].value };
        });
      }
      function evaluate() {
        return model().evaluatePackage({
          converter: converter(), snapshot: snapshot(), data: w.LabUnitsData || null,
          // Pacjent z karty dla danego badania i rodzaj jego własnej oceny — oba od strony (PR4).
          patientFor: function (analyteId) { var described = packagePatient(analyteId); return described && described.patient || {}; },
          ownKind: ownKind, capturedAtISO: new Date().toISOString()
        }, inputs());
      }

      function drawBar(box, row, view) {
        if (view.marker == null) return;
        var chart = svg(box, 'svg', { 'class': 'lab-pkg-bar', role: 'img', focusable: 'false',
          'aria-label': row.short + ' ' + row.shown + ' ' + row.unit + ' ' + view.text + '; zakres ' + view.bounds });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-low', x: '0', y: '4', width: '30%', height: '8' });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-ok', x: '30%', y: '4', width: '40%', height: '8' });
        svg(chart, 'rect', { 'class': 'lab-pkg-bar-high', x: '70%', y: '4', width: '30%', height: '8' });
        svg(chart, 'circle', { 'class': 'lab-pkg-bar-marker ' + view.state, cx: (Math.round(view.marker * 1000) / 10) + '%', cy: '8', r: '6.5' });
      }

      function drawCard(row, definition) {
        var box = parts.cards[definition.id];
        // Karta z tą samą treścią zostaje w miejscu: jej łącze nie znika spod kliknięcia przy kolejnym odświeżeniu.
        var signature = JSON.stringify([row.status, row.error || '', row.shown || '', row.unit || '', row.converted || '', row.view || null, !!row.contextRequired]);
        if (box.getAttribute('data-drawn') === signature) return;
        box.setAttribute('data-drawn', signature);
        box.textContent = '';
        box.className = 'lab-pkg-card' + (row.status === 'empty' ? ' is-empty' : row.status === 'invalid' ? ' is-invalid' : '');
        var head = add(box, 'div', 'lab-pkg-card-head');
        var main = add(head, 'div', 'lab-pkg-card-main');
        add(main, 'span', 'lab-pkg-card-name', definition.short);
        if (row.status === 'empty') {
          add(main, 'span', 'lab-pkg-card-empty', 'nie wpisano');
          return;
        }
        if (row.status === 'invalid') {
          add(main, 'span', 'lab-pkg-card-empty', row.error);
          return;
        }
        var view = row.view;
        add(main, 'span', 'lab-pkg-card-value' + (view.state ? ' ' + view.state : ''), row.shown);
        add(main, 'span', 'lab-pkg-card-unit', row.unit);
        add(head, 'span', 'lab-range-status' + (view.state ? ' ' + view.state : ' is-general'), view.text);
        if (row.unit !== definition.canonicalUnit) add(box, 'div', 'lab-pkg-card-converted', '= ' + row.converted);
        drawBar(box, row, view);
        if (view.lab) {
          // Ocena normą laboratorium; norma aplikacji zostaje obok do wglądu.
          var labLine = add(box, 'div', 'lab-pkg-card-norm');
          labLine.appendChild(doc.createTextNode('Norma z wydruku: '));
          add(labLine, 'strong', '', view.bounds);
          labLine.appendChild(doc.createTextNode(' '));
          add(labLine, 'span', 'lab-pkg-badge', 'laboratorium');
          if (view.app) {
            add(box, 'div', 'lab-pkg-card-app', (view.app.general ? (view.app.population || 'Zakres ogólny')
              : 'Norma aplikacji' + (view.app.population ? ' · ' + view.app.population : '')) + ': ' + view.app.bounds);
          }
        } else if (view.bounds) {
          var norm = add(box, 'div', 'lab-pkg-card-norm');
          // Zakres ogólny u dziecka: nazwa populacji z danych mówi to sama („Zakres ogólny dorosły”).
          norm.appendChild(doc.createTextNode((view.general ? (view.population || 'Zakres ogólny') : 'Norma' + (view.population ? ' · ' + view.population : '')) + ': '));
          add(norm, 'strong', '', view.bounds);
        }
        // PR4: badanie oceniane po swojemu w pojedynczym badaniu — tu wartość (i norma z wydruku), tam ocena.
        // To samo łącze dostaje wynik, którego silnik nie ocenia bez kontekstu próbki (pakiet nie ma jego pól).
        var note = view.own && OWN_KINDS[view.own] ? OWN_KINDS[view.own].note : row.contextRequired ? CONTEXT_NOTE : '';
        if (note) {
          if (!view.lab) add(box, 'div', 'lab-pkg-card-note', note);
          button(box, 'lab-pkg-link lab-pkg-card-link', 'Oceń ' + definition.short + ' w pojedynczym badaniu →', function () { openSingle(definition.id); });
        }
      }
      // Pojedyncze badanie z wybranym badaniem; wartość wpisuje tam lekarz (ta sama droga co ?badanie=<id>).
      function openSingle(analyteId) {
        setMode('single');
        try {
          var page = runtime();
          if (page && typeof page.openSingle === 'function') page.openSingle(analyteId);
        } catch (_) { /* wybór badania zostaje po stronie przelicznika */ }
      }

      function drawSave(ctx, rows) {
        var m = model();
        var filled = rows.filter(function (row) { return row.status === 'ok'; }).length;
        var wrong = rows.filter(function (row) { return row.status === 'invalid'; }).map(function (row) { return row.short || row.analyteId; });
        var wrongNorms = rows.filter(function (row) { return row.status === 'ok' && row.normError; }).map(function (row) { return row.short; });
        var invalid = wrong.length > 0 || wrongNorms.length > 0;
        // Wiek wizyty łamie się w całości, nie na pojedynczej literze.
        var visit = m.formatVisitAge(m.linkedAgeMonths(ctx.sessionPatient)).replace(/ /g, NBSP);
        parts.saveCtx.textContent = ctx.name + (visit ? ' · wizyta:' + NBSP + visit : '');
        // Błędne pole wstrzymuje cały zapis — wiersz mówi to zamiast liczby wyników.
        parts.saveSub.textContent = wrong.length
          ? 'popraw wynik: ' + wrong.join(', ') + ' — do tego czasu zapis jest wstrzymany'
          : wrongNorms.length
            ? 'popraw normę z wydruku: ' + wrongNorms.join(', ') + ' — do tego czasu zapis jest wstrzymany'
          : filled
            ? filled + ' ' + m.plural(filled, ['wynik trafi', 'wyniki trafią', 'wyników trafi']) + ' do Badań w karcie pacjenta'
            : 'wpisz wyniki z wydruku — trafią do Badań w karcie pacjenta';
        parts.saveBtn.textContent = state.busy ? 'Zapisuję…'
          : filled ? 'Zapisz ' + filled + ' ' + m.plural(filled, ['wynik', 'wyniki', 'wyników']) + ' do karty' : 'Zapisz wyniki do karty';
        parts.saveBtn.disabled = state.busy || !filled || invalid;
      }

      // Co skopiuje przycisk: wyniki wpisane w formularzu, a przy pustym formularzu po zapisie — zapisany zestaw.
      function copySource(rows) {
        var typed = rows.some(function (row) { return row.status !== 'empty'; });
        if (!typed && state.done && state.done.copy) {
          return { ok: true, error: '', text: state.done.copy.text, names: state.done.copy.names, saved: true };
        }
        return model().buildCopyText({ rows: rows, dateISO: parts.date.value, todayISO: today() });
      }
      function drawCopy(rows) {
        var source = copySource(rows);
        parts.copy.textContent = source.saved ? 'Kopiuj zapisane wyniki' : 'Kopiuj wyniki';
        parts.copy.disabled = state.busy || !source.ok;
      }
      function copyResults() {
        if (state.busy) return;
        var source = copySource(evaluate());
        if (!source.ok) { refresh(); return; }
        // vilda_schowek.js to jedyne miejsce zapisu do schowka (tekst dla systemu szpitalnego, iOS); zapis musi
        // ruszyć w geście kliknięcia, dlatego bez żadnego czekania przed nim.
        var clipboard = w.VildaSchowek, written;
        try {
          written = clipboard && typeof clipboard.kopiuj === 'function' ? clipboard.kopiuj(source.text)
            : w.navigator && w.navigator.clipboard && typeof w.navigator.clipboard.writeText === 'function'
              ? w.navigator.clipboard.writeText(source.text) : Promise.reject(new Error('Brak schowka'));
        } catch (error) { written = Promise.reject(error); }
        Promise.resolve(written).then(function () { toast('✓ Skopiowano wyniki: ' + source.names); },
          function () { toast('Nie udało się skopiować — skopiuj ręcznie.'); });
      }

      // Co widać: kreator zamiast formularza; wybór pakietu po zalogowaniu; bramka zamiast pól wyników i oceny.
      function drawGate(gate, account) {
        var creator = state.view === 'creator';
        var info = GATES[gate];
        parts.body.hidden = creator;
        if (parts.creator) parts.creator.hidden = !creator;
        if (parts.pickerStep) parts.pickerStep.hidden = !account;
        parts.gate.hidden = !info;
        parts.entry.hidden = !!gate;
        parts.results.hidden = !!gate;
        if (!info) return;
        parts.gateTitle.textContent = info.title;
        parts.gateText.textContent = info.text;
        parts.gateAction.textContent = info.action;
        parts.gateAction.hidden = !info.action;
      }

      // Wiersz normy z wydruku: jednostka wyniku, błąd i oznaczenie podpowiedzi.
      function drawNormRow(row, definition) {
        var id = definition.id, select = parts.units[id];
        var option = select.options[select.selectedIndex];
        parts.normUnit[id].textContent = option ? option.textContent : select.value;
        var message = row.status === 'ok' && row.normError ? row.normError : '';
        parts.normErrors[id].hidden = !message;
        parts.normErrors[id].textContent = message;
        [parts.normLow[id], parts.normHigh[id]].forEach(function (field) {
          field.setAttribute('aria-invalid', message ? 'true' : 'false');
          field.classList.toggle('is-prefilled', !!state.prefilled[id]);
        });
      }
      function drawNormHints() {
        var m = model();
        var prefilled = state.rows.filter(function (row) { return !!state.prefilled[row.id]; });
        var dates = prefilled.map(function (row) { return typeof state.prefilled[row.id] === 'string' ? m.formatDate(state.prefilled[row.id]) : ''; });
        var oneDate = dates.every(function (date) { return date === dates[0]; });
        parts.prefillHint.hidden = !prefilled.length;
        parts.prefillHint.textContent = !prefilled.length ? ''
          : oneDate
            ? 'Podpowiedź z poprzedniego wyniku pacjenta' + (dates[0] ? ' (' + dates[0] + ')' : '') + ': '
              + prefilled.map(function (row) { return row.short; }).join(', ') + '. Sprawdź z wydrukiem.'
            : 'Podpowiedź z poprzednich wyników pacjenta: '
              + prefilled.map(function (row, index) { return row.short + (dates[index] ? ' (' + dates[index] + ')' : ''); }).join(', ') + '. Sprawdź z wydrukiem.';
        var cleared = state.rows.filter(function (row) { return !!state.unitNotice[row.id]; }).map(function (row) { return row.short; });
        parts.unitNotice.hidden = !cleared.length;
        parts.unitNotice.textContent = cleared.length
          ? 'Zmieniono jednostkę: ' + cleared.join(', ') + ' — norma z wydruku została wyczyszczona, bo była podana w poprzedniej jednostce.' : '';
      }

      function refresh() {
        timer = null;
        if (!card || !grid) return;
        paintMode();
        if (state.mode !== 'package') return;
        build();
        // Własne pakiety mogły się zmienić: zapis kreatora, synchronizacja konta z innego urządzenia.
        if (loadPackages() || !state.pkg) selectPackage(state.pkg ? state.pkg.id : preferredPackage());
        var ctx = context();
        // Wybór pakietu i kreator należą do konta: działają po zalogowaniu, także bez wybranego pacjenta.
        var account = ctx.gate === '' || ctx.gate === 'no-patient' || ctx.gate === 'empty';
        if (account) {
          buildPicker();
          adoptLegacy();
        } else if (state.view === 'creator') closeCreator();
        // Wyniki wpisane dla jednego pacjenta nie przechodzą na innego ani poza sesję.
        if (!ctx.gate) buildEntry();
        if (ctx.pid !== state.pid) {
          if (state.pid !== null) clearValues(false);
          state.pid = ctx.pid;
          state.previous = null;
          state.previousFor = null;
          state.authAsked = null;
          if (ctx.pid) applyUnits();
        }
        state.gate = ctx.gate;
        drawGate(ctx.gate, account);
        if (account) drawPicker();
        if (state.view === 'creator') { drawCreator(); return; }
        if (ctx.gate) return;
        if (state.previousFor !== state.pid) loadPrevious();

        var described = packagePatient();
        var description = described && described.description || null;
        var rows = evaluate();
        var sources = [];
        rows.forEach(function (row, index) {
          var definition = state.rows[index];
          drawCard(row, definition);
          var error = parts.errors[definition.id];
          error.hidden = row.status !== 'invalid';
          error.textContent = row.status === 'invalid' ? row.error : '';
          parts.inputs[definition.id].setAttribute('aria-invalid', row.status === 'invalid' ? 'true' : 'false');
          drawNormRow(row, definition);
          if (row.status === 'ok' && row.view) row.view.sources.forEach(function (label) { if (sources.indexOf(label) === -1) sources.push(label); });
        });
        parts.sources.hidden = !sources.length;
        parts.sources.textContent = sources.length ? 'Źródła norm: ' + sources.join(' · ') : '';

        var missing = !description || description.missing;
        parts.patient.textContent = missing ? 'Brak wieku i płci w danych pacjenta — przyjęto normy dla dorosłych' : description.text;
        parts.patient.classList.toggle('is-missing', !!missing);
        parts.patientBox.classList.toggle('is-pediatric', !missing && !!described && described.patient.life_stage === 'pediatric');

        var m = model();
        var dateError = m.validDate(parts.date.value, today());
        var otherDay = !dateError && parts.date.value !== today();
        parts.dateNote.hidden = !dateError && !otherDay;
        parts.dateNote.textContent = dateError || (otherDay ? OTHER_DAY_NOTE : '');
        parts.dateNote.classList.toggle('is-error', !!dateError);

        drawUnitsHint();
        drawNormHints();

        var anyOk = rows.some(function (row) { return row.status === 'ok'; });
        var anyInvalid = rows.some(function (row) { return row.status === 'invalid'; });
        var anyNorm = rows.some(function (row) { return row.status === 'ok' && !!row.norm; });
        var anyNormError = rows.some(function (row) { return row.status === 'ok' && !!row.normError; });
        markStep(parts.step1, true, false);
        markStep(parts.step2, anyOk && !anyInvalid, true);
        markStep(parts.stepNorms, anyNorm && !anyNormError, false);
        markStep(parts.step3, anyOk && !dateError, false);
        markStep(parts.step4, anyOk && !missing, false);

        drawSave(ctx, rows);
        drawCopy(rows);
        parts.error.hidden = !state.error;
        parts.error.textContent = state.error;
        parts.done.hidden = !state.done;
        if (state.done) {
          parts.doneTitle.textContent = state.done.title;
          parts.doneText.textContent = state.done.text;
        }
      }
      function schedule() {
        if (timer != null) w.clearTimeout(timer);
        timer = w.setTimeout(refresh, REFRESH_DELAY_MS);
      }
      function edited() {
        state.error = '';
        state.done = null;
        refresh();
      }

      // ── Zapis zbiorczy ──
      function fail(message) { var error = new Error(message); error.forUser = true; return error; }
      function waitForVault(timeout) {
        return new Promise(function (resolve) {
          var started = Date.now();
          (function poll() {
            var vault = w.VildaVault;
            if (vault && typeof vault.savePatientNote === 'function') { resolve(vault); return; }
            if (Date.now() - started > timeout) { resolve(null); return; }
            w.setTimeout(poll, 120);
          })();
        });
      }
      // Sejf załadowany i odblokowany: zaraz po otwarciu strony skrypt sejfu już jest, a sesja jeszcze wraca.
      function waitForUnlocked(timeout) {
        return new Promise(function (resolve) {
          var started = Date.now();
          (function poll() {
            var vault = w.VildaVault, unlocked;
            try { unlocked = !!vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked(); } catch (_) { unlocked = false; }
            if (unlocked) { resolve(vault); return; }
            if (Date.now() - started > timeout) { resolve(null); return; }
            w.setTimeout(poll, 120);
          })();
        });
      }
      function toast(message) {
        try {
          var node = byId('labToast');
          if (!node) return;
          node.textContent = message;
          node.classList.add('is-visible');
          w.setTimeout(function () { node.classList.remove('is-visible'); }, 2400);
        } catch (_) { /* komunikat pomocniczy */ }
      }
      function save() {
        if (state.busy) return;
        var m = model(), ctx = context();
        if (ctx.gate) { refresh(); return; }
        var rows = evaluate();
        var plan = m.planSave({
          rows: rows, patientId: ctx.pid, dateISO: parts.date.value, todayISO: today(), comment: parts.comment.value,
          linkedAgeMonths: m.linkedAgeMonths(ctx.sessionPatient), snapshot: snapshot()
        });
        state.done = null;
        if (!plan.ok) { state.error = plan.error; refresh(); return; }
        state.error = '';
        setBusy(true);
        refresh();
        try { if (w.VildaSession && typeof w.VildaSession.ensureAuthLoaded === 'function') w.VildaSession.ensureAuthLoaded(); } catch (_) { /* zapis sprawdzi sejf */ }
        var saved = [];
        waitForVault(VAULT_WAIT_MS).then(function (vault) {
          if (!vault) throw fail('Moduł danych nie załadował się — odśwież stronę.');
          if (typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()) throw fail('Zaloguj się, aby zapisać wyniki w karcie pacjenta.');
          return Promise.resolve().then(function () { return vault.getPatient(ctx.pid); }).catch(function () { return null; }).then(function (patient) {
            if (!patient) throw fail('Nie znalazłem pacjenta w bazie — wczytaj go ponownie z Bazy pacjentów.');
            if (patientId() !== ctx.pid) throw fail('W trakcie zapisu zmienił się pacjent — sprawdź wyniki i zapisz ponownie.');
            return plan.notes.reduce(function (chain, note, index) {
              return chain.then(function () { return vault.savePatientNote(note); }).then(function () { saved.push(plan.rows[index]); });
            }, Promise.resolve());
          });
        }).then(function () {
          var units = {};
          saved.forEach(function (row) { units[row.analyteId] = row.unit; });
          m.rememberUnits(w.VildaPersistence || null, units);
          var names = saved.map(function (row) { return row.short; }).join(', ');
          var count = saved.length;
          var date = m.formatDate(parts.date.value);
          // Tekst zapisanego zestawu zostaje do skopiowania po wyczyszczeniu formularza.
          var copy = m.buildCopyText({ rows: saved, dateISO: parts.date.value, todayISO: today() });
          clearValues(true);
          state.done = {
            title: 'Zapisano ' + count + ' ' + m.plural(count, ['wynik', 'wyniki', 'wyników']) + ' w karcie pacjenta',
            text: names + ' · pobranie ' + date,
            copy: copy.ok ? { text: copy.text, names: copy.names } : null
          };
          applyUnits();
          loadPrevious();
          toast('✓ Zapisano w karcie: ' + names);
        }, function (error) {
          // Zapisane wiersze znikają z formularza, żeby ponowny zapis ich nie zdublował.
          saved.forEach(function (row) { parts.inputs[row.analyteId].value = ''; });
          var reason = error && error.forUser ? error.message : 'Nie udało się zapisać: ' + (error && error.message ? error.message : error);
          state.error = saved.length
            ? 'Zapisano: ' + saved.map(function (row) { return row.short; }).join(', ') + '. Pozostałe wyniki nie zostały zapisane. ' + reason
            : reason;
        }).then(function () {
          setBusy(false);
          refresh();
        });
      }

      // ── Wyjścia z karty: logowanie, lista pacjentów, zakładka „Badania” ──
      function gateAction() {
        var host = chromeWindow();
        if (state.gate === 'locked') {
          // Jak przycisk konta w pasku aplikacji: stos konta ładuje most sesji, ekran logowania otwiera VildaAuthUI.
          if (loggedIn()) { refresh(); return; }
          var session = host.VildaSession;
          var ready = session && typeof session.ensureAuthLoaded === 'function' ? session.ensureAuthLoaded() : null;
          Promise.resolve(ready).then(function () {
            var ui = host.VildaAuthUI;
            if (!ui) return;
            if (typeof ui.isGuestMode === 'function' && ui.isGuestMode() && typeof ui.exitGuestMode === 'function') { ui.exitGuestMode(); return; }
            if (typeof ui.showStartupScreen === 'function') ui.showStartupScreen();
          }).catch(function () { /* ekran logowania niedostępny */ });
          return;
        }
        if (state.gate === 'empty') { openCreator(state.pkg); return; }
        if (state.gate === 'no-patient') {
          // Ta sama droga co pozycja „Baza pacjentów” w menu aplikacji (w powłoce otwiera listę na stronie Start).
          var entry;
          try { entry = host.document.getElementById('patientsListBtnSidebar'); } catch (_) { entry = null; }
          if (entry && typeof entry.click === 'function') entry.click();
        }
      }
      function openCard() {
        var pid = patientId();
        if (!pid || pid !== state.pid) { refresh(); return; }
        var shell = null;
        try { if (w.VildaShell && typeof w.VildaShell.openPatientCardInStart === 'function') shell = w.VildaShell; } catch (_) { shell = null; }
        try {
          if (!shell && w.parent && w.parent !== w && w.parent.VildaShell && typeof w.parent.VildaShell.openPatientCardInStart === 'function') shell = w.parent.VildaShell;
        } catch (_) { shell = null; }
        if (shell) { shell.openPatientCardInStart(pid, { activeTab: 'lab' }); return; }
        var session = w.VildaSession;
        var ready = session && typeof session.ensureAuthLoaded === 'function' ? session.ensureAuthLoaded() : null;
        Promise.resolve(ready).then(function () {
          var ui = w.VildaAuthUI;
          if (ui && typeof ui.showPatientCard === 'function') ui.showPatientCard(pid, null, null, { activeTab: 'lab' });
        }).catch(function () { /* karta niedostępna */ });
      }

      // ── Kreator własnego pakietu (LAB-PAKIETY PR4, makieta zaakceptowana 2026-11-13) ──
      // Otwiera się w zakładce pakietu zamiast formularza; nie wymaga pacjenta. Zapis idzie na konto.
      function buildCreator() {
        if (state.creatorBuilt) return;
        state.creatorBuilt = true;
        var m = model();
        var host = parts.creator = add(card, 'div', 'lab-pkg-creator');
        host.id = 'labPkgCreator';
        host.hidden = true;
        var head = add(host, 'div', 'lab-pkg-creator-head');
        parts.creatorTitle = add(head, 'h2', 'lab-pkg-creator-title');
        parts.creatorTitle.id = 'labPkgCreatorTitle';
        add(head, 'p', 'lab-pkg-hint', 'Pakiety są zapisane na Twoim koncie — widzisz je na każdym urządzeniu.');

        var body = add(host, 'div', 'lab-pkg-creator-body');
        var main = add(body, 'div', 'lab-pkg-creator-main');

        var nameField = add(main, 'div', 'lab-pkg-field lab-pkg-creator-field');
        var nameLabel = add(nameField, 'label', 'lab-pkg-field-label', 'Nazwa pakietu');
        parts.creatorName = add(nameField, 'input', 'lab-pkg-creator-name');
        parts.creatorName.type = 'text';
        parts.creatorName.id = 'labPkgCreatorName';
        parts.creatorName.maxLength = m.LIMITS.name;
        parts.creatorName.setAttribute('autocomplete', 'off');
        parts.creatorName.setAttribute('aria-describedby', 'labPkgCreatorNameError');
        nameLabel.setAttribute('for', parts.creatorName.id);
        add(nameField, 'p', 'lab-pkg-hint', 'Do ' + m.LIMITS.name + ' znaków. Nazwa pojawi się na liście pakietów obok „Tarczyca”.');
        parts.creatorNameError = add(nameField, 'p', 'lab-pkg-creator-error');
        parts.creatorNameError.id = 'labPkgCreatorNameError';
        parts.creatorNameError.setAttribute('role', 'alert');
        parts.creatorNameError.hidden = true;
        parts.creatorName.addEventListener('input', function () {
          if (!state.draft) return;
          state.draft.name = parts.creatorName.value;
          state.draft.error = '';
          refresh();
        });
        parts.creatorName.addEventListener('blur', function () {
          if (!state.draft || state.draft.touched.name) return;
          state.draft.touched.name = true;
          refresh();
        });

        var picked = add(main, 'div', 'lab-pkg-creator-picked');
        var pickedHead = add(picked, 'div', 'lab-pkg-creator-picked-head');
        var pickedTitle = add(pickedHead, 'div', 'lab-step-label', 'Badania w pakiecie');
        add(pickedTitle, 'span', 'lab-step-label-opt', '— w tej kolejności będą w formularzu');
        parts.creatorCount = add(pickedHead, 'span', 'lab-pkg-creator-count');
        parts.creatorCount.id = 'labPkgCreatorCount';
        parts.creatorList = add(picked, 'ol', 'lab-pkg-creator-list');
        parts.creatorList.id = 'labPkgCreatorList';
        parts.creatorEmpty = add(picked, 'p', 'lab-pkg-hint lab-pkg-creator-empty', 'Zaznacz badania na liście „Dodaj badania”.');
        parts.creatorLimit = add(picked, 'p', 'lab-pkg-hint lab-pkg-creator-limit', 'Pakiet może mieć najwyżej ' + m.LIMITS.analytes + ' badań — usuń któreś, żeby dodać inne.');
        parts.creatorLimit.id = 'labPkgCreatorLimit';
        parts.creatorLimit.setAttribute('role', 'status');
        parts.creatorLimit.hidden = true;
        parts.creatorListError = add(picked, 'p', 'lab-pkg-creator-error');
        parts.creatorListError.id = 'labPkgCreatorListError';
        parts.creatorListError.setAttribute('role', 'alert');
        parts.creatorListError.hidden = true;
        parts.creatorOwnNote = add(picked, 'p', 'lab-pkg-creator-own-note');
        parts.creatorOwnNote.id = 'labPkgCreatorOwnNote';
        parts.creatorOwnNote.hidden = true;

        parts.creatorEditNote = add(main, 'p', 'lab-pkg-hint lab-pkg-creator-edit-note',
          'Zmiana nazwy lub składu dotyczy następnych wpisów. Wyniki zapisane wcześniej zostają w karcie pacjenta bez zmian.');
        parts.creatorEditNote.hidden = true;

        var actions = add(main, 'div', 'lab-pkg-creator-actions');
        parts.creatorSave = button(actions, 'lab-pkg-btn lab-pkg-btn-primary', 'Zapisz pakiet', saveDraft);
        parts.creatorSave.id = 'labPkgCreatorSave';
        parts.creatorCancel = button(actions, 'lab-pkg-btn lab-pkg-btn-ghost', 'Anuluj', function () { closeCreator(true); refresh(); });
        parts.creatorCancel.id = 'labPkgCreatorCancel';
        parts.creatorDelete = button(actions, 'lab-pkg-btn lab-pkg-btn-danger-ghost', 'Usuń pakiet', function () {
          if (!state.draft || state.saving) return;
          state.draft.confirm = true;
          refresh();
          try { parts.creatorDeleteCancel.focus(); } catch (_) { /* fokus pomocniczy */ }
        });
        parts.creatorDelete.id = 'labPkgCreatorDelete';
        parts.creatorHint = add(main, 'p', 'lab-pkg-hint lab-pkg-creator-hint');
        parts.creatorHint.id = 'labPkgCreatorHint';
        parts.creatorHint.hidden = true;
        parts.creatorError = add(main, 'p', 'lab-pkg-error');
        parts.creatorError.id = 'labPkgCreatorError';
        parts.creatorError.setAttribute('role', 'alert');
        parts.creatorError.hidden = true;

        parts.creatorConfirm = add(main, 'div', 'lab-pkg-creator-confirm');
        parts.creatorConfirm.id = 'labPkgCreatorConfirm';
        parts.creatorConfirm.setAttribute('role', 'group');
        parts.creatorConfirm.setAttribute('aria-labelledby', 'labPkgCreatorConfirmTitle');
        parts.creatorConfirm.hidden = true;
        parts.creatorConfirmTitle = add(parts.creatorConfirm, 'strong', 'lab-pkg-creator-confirm-title');
        parts.creatorConfirmTitle.id = 'labPkgCreatorConfirmTitle';
        add(parts.creatorConfirm, 'p', 'lab-pkg-creator-confirm-text', 'Pakiet zniknie z listy na wszystkich Twoich urządzeniach. Zapisane wyniki badań nie są usuwane.');
        var confirmActions = add(parts.creatorConfirm, 'div', 'lab-pkg-creator-actions');
        parts.creatorDeleteConfirm = button(confirmActions, 'lab-pkg-btn lab-pkg-btn-danger', 'Usuń pakiet', deleteDraft);
        parts.creatorDeleteConfirm.id = 'labPkgCreatorDeleteConfirm';
        parts.creatorDeleteCancel = button(confirmActions, 'lab-pkg-btn lab-pkg-btn-ghost', 'Zostaw', function () {
          if (!state.draft) return;
          state.draft.confirm = false;
          refresh();
          try { parts.creatorDelete.focus(); } catch (_) { /* fokus pomocniczy */ }
        });
        parts.creatorDeleteCancel.id = 'labPkgCreatorDeleteCancel';

        // Katalog: badania przelicznika w jego grupach; zaznaczenie dodaje badanie na koniec pakietu.
        var catalogBox = add(body, 'div', 'lab-pkg-creator-catalog');
        var catalogHead = add(catalogBox, 'div', 'lab-pkg-creator-picked-head');
        add(catalogHead, 'div', 'lab-step-label', 'Dodaj badania');
        var groups = m.catalog(w.LabUnitsData || null, ownKind);
        var total = groups.reduce(function (sum, group) { return sum + group.items.length; }, 0);
        add(catalogHead, 'span', 'lab-pkg-creator-count', total + ' ' + m.plural(total, ['badanie', 'badania', 'badań']) + ' z „Jednostek lab.”');
        parts.creatorSearch = add(catalogBox, 'input', 'lab-pkg-creator-search');
        parts.creatorSearch.type = 'search';
        parts.creatorSearch.id = 'labPkgCreatorSearch';
        parts.creatorSearch.setAttribute('aria-label', 'Szukaj badania');
        parts.creatorSearch.setAttribute('placeholder', 'Szukaj badania, np. LH, testosteron…');
        parts.creatorSearch.setAttribute('autocomplete', 'off');
        parts.creatorSearch.addEventListener('input', function () {
          if (!m.searchKey(parts.creatorSearch.value)) openGroups();
          filterCatalog();
        });
        var groupsHost = add(catalogBox, 'div', 'lab-pkg-creator-groups');
        groupsHost.id = 'labPkgCreatorGroups';
        parts.creatorOptions = {};
        parts.creatorGroups = [];
        var marks = {};
        groups.forEach(function (group) {
          var box = add(groupsHost, 'details', 'lab-pkg-creator-group');
          var summary = add(box, 'summary', 'lab-pkg-creator-group-title');
          add(summary, 'span', 'lab-pkg-creator-group-name', group.label);
          add(summary, 'span', 'lab-pkg-creator-group-count', '· ' + group.items.length);
          var list = add(box, 'div', 'lab-pkg-creator-group-items');
          var entry = { box: box, items: [] };
          group.items.forEach(function (item) {
            var label = add(list, 'label', 'lab-pkg-creator-option');
            var check = add(label, 'input', 'lab-pkg-creator-check');
            check.type = 'checkbox';
            check.value = item.id;
            check.id = 'labPkgCreatorOpt-' + item.id;
            var caption = add(label, 'span', 'lab-pkg-creator-option-text', item.label);
            if (item.own && OWN_KINDS[item.own]) {
              add(caption, 'span', 'lab-pkg-creator-mark', ' · ' + OWN_KINDS[item.own].mark);
              marks[item.own] = true;
            }
            check.addEventListener('change', function () { toggleAnalyte(item.id, check.checked); });
            parts.creatorOptions[item.id] = { check: check, label: label, item: item, key: m.searchKey(item.label + ' ' + item.id) };
            entry.items.push(item.id);
          });
          parts.creatorGroups.push(entry);
        });
        parts.creatorNoMatch = add(catalogBox, 'p', 'lab-pkg-hint lab-pkg-creator-nomatch', 'Nie ma badania o takiej nazwie.');
        parts.creatorNoMatch.setAttribute('role', 'status');
        parts.creatorNoMatch.hidden = true;
        var legend = add(catalogBox, 'p', 'lab-pkg-hint lab-pkg-creator-legend');
        if (marks.puberty) {
          add(legend, 'strong', '', OWN_KINDS.puberty.mark);
          legend.appendChild(doc.createTextNode(' — ocena pokwitaniowa tylko w pojedynczym badaniu. '));
        }
        if (marks.single) {
          add(legend, 'strong', '', OWN_KINDS.single.mark);
          legend.appendChild(doc.createTextNode(' — pełna ocena tylko w pojedynczym badaniu. '));
        }
        legend.appendChild(doc.createTextNode((marks.puberty || marks.single ? 'Pozostałe badania pakiet' : 'Badania pakiet')
          + ' ocenia normą dla wieku, płci i stadium z karty pacjenta.'));
      }

      // Otwarte są grupy z zaznaczonymi badaniami; przy pustym pakiecie — pierwsza.
      function openGroups() {
        var draft = state.draft, any = false;
        parts.creatorGroups.forEach(function (group) {
          var selected = !!draft && group.items.some(function (id) { return draft.analytes.indexOf(id) !== -1; });
          group.box.open = selected;
          any = any || selected;
        });
        if (!any && parts.creatorGroups[0]) parts.creatorGroups[0].box.open = true;
      }
      function filterCatalog() {
        var query = model().searchKey(parts.creatorSearch.value), any = false;
        parts.creatorGroups.forEach(function (group) {
          var visible = 0;
          group.items.forEach(function (id) {
            var option = parts.creatorOptions[id];
            var match = !query || option.key.indexOf(query) !== -1;
            option.label.hidden = !match;
            if (match) visible++;
          });
          group.box.hidden = !visible;
          if (query && visible) group.box.open = true;
          any = any || visible > 0;
        });
        parts.creatorNoMatch.hidden = any;
      }

      // pkg: własny pakiet do edycji; bez niego — nowy pakiet.
      function openCreator(pkg) {
        var m = model();
        if (state.busy || state.saving || !m || !state.custom || legacyBlocked()) return;
        var editing = !!pkg && !pkg.builtin;
        if (!editing && state.custom.packages.length >= m.LIMITS.packages) {
          state.pickerNote = 'Możesz mieć najwyżej ' + m.LIMITS.packages + ' własnych pakietów. Usuń któryś, żeby dodać nowy.';
          refresh();
          return;
        }
        state.pickerNote = '';
        buildCreator();
        state.view = 'creator';
        state.draft = {
          id: editing ? pkg.id : null, original: editing ? pkg.label : '', name: editing ? pkg.label : '',
          // Do kreatora trafiają badania, które zna przelicznik — w kolejności pakietu.
          analytes: editing ? pkg.analytes.filter(function (id) { return !!parts.creatorOptions[id]; }) : [],
          touched: {}, confirm: false, error: ''
        };
        parts.creatorName.value = state.draft.name;
        parts.creatorListSig = null;
        parts.creatorSearch.value = '';
        openGroups();
        filterCatalog();
        refresh();
        try { parts.creatorName.focus(); } catch (_) { /* fokus pomocniczy */ }
      }
      function closeCreator(focus) {
        state.view = 'form';
        state.draft = null;
        state.saving = false;
        if (focus) w.setTimeout(function () { try { parts.select.focus(); } catch (_) { /* fokus pomocniczy */ } }, 0);
      }
      function creatorCheck() {
        var draft = state.draft;
        return model().validatePackage({ name: draft.name, analytes: draft.analytes, id: draft.id, custom: state.custom, data: DATA, converter: converter() });
      }
      function toggleAnalyte(id, on) {
        var draft = state.draft;
        if (!draft || state.saving) { refresh(); return; }
        var at = draft.analytes.indexOf(id);
        if (on && at === -1 && draft.analytes.length < model().LIMITS.analytes) draft.analytes.push(id);
        if (!on && at !== -1) draft.analytes.splice(at, 1);
        draft.touched.analytes = true;
        draft.error = '';
        refresh();
      }
      function moveAnalyte(id, direction) {
        var draft = state.draft;
        if (!draft || state.saving) return;
        var at = draft.analytes.indexOf(id), target = at + direction;
        if (at === -1 || target < 0 || target >= draft.analytes.length) return;
        draft.analytes.splice(target, 0, draft.analytes.splice(at, 1)[0]);
        draft.error = '';
        refresh();
        // Lista powstaje od nowa: fokus wraca na przycisk przesuniętego badania (albo sąsiedni, gdy ten jest już nieczynny).
        try {
          var line = parts.creatorList.querySelector('[data-analyte="' + id + '"]');
          var buttons = line ? line.querySelectorAll('button') : [];
          var wanted = buttons[direction < 0 ? 0 : 1], other = buttons[direction < 0 ? 1 : 0];
          (wanted && !wanted.disabled ? wanted : other).focus();
        } catch (_) { /* fokus pomocniczy */ }
      }
      function drawCreator() {
        var m = model(), draft = state.draft;
        if (!draft) return;
        var check = creatorCheck();
        parts.creatorTitle.textContent = draft.id ? 'Edytuj pakiet: ' + draft.original : 'Nowy pakiet';
        // „Podaj nazwę” dopiero po wyjściu z pola albo próbie zapisu; powtórzona nazwa — od razu.
        var nameError = check.errors.name && (draft.touched.name || m.searchKey(draft.name)) ? check.errors.name : '';
        parts.creatorNameError.hidden = !nameError;
        parts.creatorNameError.textContent = nameError;
        parts.creatorName.setAttribute('aria-invalid', nameError ? 'true' : 'false');
        parts.creatorName.disabled = state.saving;

        // Lista powstaje od nowa tylko po zmianie składu albo kolejności: przebudowa przy każdym odświeżeniu
        // (np. po wyjściu z pola nazwy) zabierałaby przycisk spod kliknięcia.
        var listSignature = draft.analytes.join(',');
        var rebuild = listSignature !== parts.creatorListSig;
        parts.creatorListSig = listSignature;
        if (rebuild) parts.creatorList.textContent = '';
        var own = [];
        draft.analytes.forEach(function (id, index) {
          var option = parts.creatorOptions[id];
          if (!option) return;
          var item = option.item;
          if (item.own) own.push(item.short);
          if (!rebuild) return;
          var line = add(parts.creatorList, 'li', 'lab-pkg-creator-item');
          line.setAttribute('data-analyte', id);
          add(line, 'span', 'lab-pkg-creator-item-num', (index + 1) + '.');
          var caption = add(line, 'div', 'lab-pkg-creator-item-text');
          add(caption, 'span', 'lab-pkg-creator-item-name', item.label);
          add(caption, 'span', 'lab-pkg-creator-item-kind' + (item.own ? ' is-own' : ''), item.own && OWN_KINDS[item.own] ? OWN_KINDS[item.own].badge : 'ocena w pakiecie');
          var actions = add(line, 'div', 'lab-pkg-creator-item-actions');
          var up = button(actions, 'lab-pkg-icon-btn', '↑', function () { moveAnalyte(id, -1); });
          up.setAttribute('aria-label', 'Przesuń ' + item.short + ' w górę');
          var down = button(actions, 'lab-pkg-icon-btn', '↓', function () { moveAnalyte(id, 1); });
          down.setAttribute('aria-label', 'Przesuń ' + item.short + ' w dół');
          var remove = button(actions, 'lab-pkg-icon-btn', '×', function () { toggleAnalyte(id, false); });
          remove.setAttribute('aria-label', 'Usuń ' + item.short + ' z pakietu');
        });
        // Pierwsze badanie nie idzie wyżej, ostatnie — niżej; w trakcie zapisu lista jest nieczynna.
        Array.prototype.forEach.call(parts.creatorList.children, function (line, index, lines) {
          var buttons = line.querySelectorAll('button');
          buttons[0].disabled = state.saving || index === 0;
          buttons[1].disabled = state.saving || index === lines.length - 1;
          buttons[2].disabled = state.saving;
        });
        var count = draft.analytes.length, full = count >= m.LIMITS.analytes;
        parts.creatorCount.textContent = count + ' z ' + m.LIMITS.analytes;
        parts.creatorEmpty.hidden = count > 0;
        parts.creatorLimit.hidden = !full;
        var listError = check.errors.analytes && draft.touched.analytes ? check.errors.analytes : '';
        parts.creatorListError.hidden = !listError;
        parts.creatorListError.textContent = listError;
        parts.creatorOwnNote.hidden = !own.length;
        parts.creatorOwnNote.textContent = own.length
          ? own.join(', ') + ' — w pakiecie bez oceny aplikacji. Zapiszesz wartość i, jeśli chcesz, normę z wydruku; ocenę z wiekiem, stadium pokwitania i leczeniem otworzysz jednym kliknięciem w pojedynczym badaniu.'
          : '';
        Object.keys(parts.creatorOptions).forEach(function (id) {
          var option = parts.creatorOptions[id], checked = draft.analytes.indexOf(id) !== -1;
          option.check.checked = checked;
          option.check.disabled = state.saving || (!checked && full);
        });

        parts.creatorEditNote.hidden = !draft.id;
        parts.creatorSave.textContent = state.saving ? 'Zapisuję…' : draft.id ? 'Zapisz zmiany' : 'Zapisz pakiet';
        parts.creatorSave.disabled = state.saving || !check.ok;
        parts.creatorCancel.disabled = state.saving;
        parts.creatorDelete.hidden = !draft.id || draft.confirm;
        parts.creatorDelete.disabled = state.saving;
        // Czego brakuje do zapisu — bez powtarzania komunikatów widocznych już przy polach.
        var missing = [nameError ? '' : check.errors.name, listError ? '' : check.errors.analytes, check.errors.limit].filter(Boolean);
        parts.creatorHint.hidden = !missing.length;
        parts.creatorHint.textContent = missing.join(' ');
        parts.creatorError.hidden = !draft.error;
        parts.creatorError.textContent = draft.error;
        parts.creatorConfirm.hidden = !draft.confirm;
        parts.creatorConfirmTitle.textContent = 'Usunąć pakiet „' + draft.original + '”?';
        parts.creatorDeleteConfirm.disabled = state.saving;
        parts.creatorDeleteCancel.disabled = state.saving;
      }
      /* Zapis listy własnych pakietów na koncie. Preferencja trafia do konta przez sejf, więc najpierw musi być
       * załadowany i odblokowany stos konta (jak przy zapisie wyników); bez niego nic się nie zapisuje. */
      function persistCustom(custom) {
        try { if (w.VildaSession && typeof w.VildaSession.ensureAuthLoaded === 'function') w.VildaSession.ensureAuthLoaded(); } catch (_) { /* zapis sprawdzi sejf */ }
        return waitForUnlocked(VAULT_WAIT_MS).then(function (vault) {
          // Bez rozstrzygniętej starej kopii zapis nadpisałby listę konta pakietami z ekranu.
          return !!vault && loggedIn() && !legacyBlocked() && model().writeCustom(persistence(), custom) === true;
        }).catch(function () { return false; });
      }
      function saveDraft() {
        var m = model(), draft = state.draft;
        if (!draft || state.saving) return;
        draft.touched = { name: true, analytes: true };
        var result = m.savePackage({ name: draft.name, analytes: draft.analytes, id: draft.id, custom: state.custom, data: DATA, converter: converter() });
        if (!result.ok) { refresh(); return; }
        var name = result.custom.packages.filter(function (pkg) { return pkg.id === result.id; })[0].name;
        state.saving = true;
        draft.error = '';
        refresh();
        persistCustom(result.custom).then(function (written) {
          if (state.draft !== draft) return;
          state.saving = false;
          if (!written) {
            draft.error = 'Nie udało się zapisać pakietu na koncie — sprawdź, czy jesteś zalogowany, i spróbuj ponownie.';
            refresh();
            return;
          }
          closeCreator(true);
          state.picked = true;
          loadPackages();
          selectPackage(result.id);
          m.rememberPackage(persistence(), result.id);
          refresh();
          toast('✓ Zapisano pakiet: ' + name);
        });
      }
      function deleteDraft() {
        var m = model(), draft = state.draft;
        if (!draft || !draft.id || state.saving) return;
        var name = draft.original;
        state.saving = true;
        draft.error = '';
        refresh();
        persistCustom(m.removePackage(state.custom, draft.id)).then(function (written) {
          if (state.draft !== draft) return;
          state.saving = false;
          if (!written) {
            draft.confirm = false;
            draft.error = 'Nie udało się usunąć pakietu z konta — sprawdź, czy jesteś zalogowany, i spróbuj ponownie.';
            refresh();
            return;
          }
          closeCreator(true);
          state.picked = true;
          loadPackages();
          selectPackage(state.packages[0] ? state.packages[0].id : null);
          if (state.pkg) m.rememberPackage(persistence(), state.pkg.id);
          refresh();
          toast('Usunięto pakiet: ' + name);
        });
      }

      // ── Tryb pracy i adres ──
      function paintMode() {
        var on = state.mode === 'package';
        grid.classList.toggle('is-package', on);
        card.hidden = !on;
        // Zakładki (role="tab"): wybrana jest w kolejności tabulacji, drugą osiągają strzałki.
        [[singleBtn, !on], [packageBtn, on]].forEach(function (tab) {
          tab[0].setAttribute('aria-selected', tab[1] ? 'true' : 'false');
          tab[0].setAttribute('tabindex', tab[1] ? '0' : '-1');
        });
        packageBtn.classList.toggle('is-locked', !loggedIn());
      }
      // Klawiatura zakładek: strzałki przełączają, Home/End — pierwsza i ostatnia; fokus zostaje na zakładce.
      function tabKey(event) {
        var key = event && event.key, mode;
        if (key === 'ArrowLeft' || key === 'ArrowRight') mode = state.mode === 'package' ? 'single' : 'package';
        else if (key === 'Home') mode = 'single';
        else if (key === 'End') mode = 'package';
        else return;
        event.preventDefault();
        setMode(mode);
        try { (mode === 'package' ? packageBtn : singleBtn).focus(); } catch (_) { /* fokus pomocniczy */ }
      }
      function setMode(mode, focus) {
        var entering = mode === 'package' && state.mode !== 'package';
        state.mode = mode === 'package' ? 'package' : 'single';
        // Wejście w pakiet czyta wyniki pacjenta od nowa — w trybie pojedynczym mógł dojść przypięty wynik.
        if (entering) state.previousFor = null;
        refresh();
        if (focus && state.mode === 'package' && !state.gate && state.view !== 'creator' && state.rows.length) {
          try { parts.inputs[state.rows[0].id].focus(); } catch (_) { /* fokus pomocniczy */ }
        }
      }
      // ?pakiet=<slug> otwiera pakiet (np. ze skrótu w zakładce „Badania”; własny pakiet — po identyfikatorze);
      // ?badanie=<id> wraca do pojedynczego badania.
      function applyDeepLink(target) {
        var m = model(), wanted, single;
        try {
          var search = new URLSearchParams(target.search || '');
          var hash = new URLSearchParams(String(target.hash || '').replace(/^#/, ''));
          wanted = search.get('pakiet') || hash.get('pakiet');
          single = search.get('badanie') || hash.get('badanie');
        } catch (_) { wanted = null; single = null; }
        if (wanted && m) {
          loadPackages();
          var pkg = m.findPackage(state.packages, wanted);
          if (pkg) {
            if (state.view === 'creator') closeCreator();
            state.picked = true;
            selectPackage(pkg.id);
            setMode('package', true);
            return;
          }
        }
        if (single && state.mode === 'package') setMode('single');
      }

      function bind() {
        grid = doc.querySelector('.lab-grid');
        card = byId('labPackageCard');
        singleBtn = byId('labModeSingle');
        packageBtn = byId('labModePackage');
        if (!grid || !card || !singleBtn || !packageBtn) return;
        if (model()) {
          loadPackages();
          selectPackage(preferredPackage());
        }
        singleBtn.addEventListener('click', function () { setMode('single'); });
        packageBtn.addEventListener('click', function () { setMode('package', true); });
        ['vilda:session-changed', 'vilda:auth-loaded', 'vilda:patient-loaded', 'vilda:zrodlo-pacjenta-zmienione'].forEach(function (type) {
          doc.addEventListener(type, schedule);
        });
        w.addEventListener('vilda:user-state-cleared', function () { clearValues(false); schedule(); });
        w.addEventListener('storage', schedule);
        w.addEventListener('focus', schedule);
        w.addEventListener('vilda:shell-navigate-target', function (event) {
          var href = event && event.detail && event.detail.href;
          if (typeof href !== 'string') return;
          try {
            var target = new URL(href, w.location.href);
            if (target.origin === w.location.origin && target.pathname === w.location.pathname) applyDeepLink(target);
          } catch (_) { /* adres spoza strony */ }
        });
        var bar = byId('labModeBar');
        if (bar) {
          bar.addEventListener('keydown', tabKey);
          bar.hidden = false;
        }
        paintMode();
        applyDeepLink(w.location);
        // Jak wiersz przypięcia: druga próba po załadowaniu stosu konta przez most sesji.
        w.setTimeout(schedule, 1200);
      }

      return { bind: bind, refresh: refresh, setMode: setMode, state: function () { return state; } };
    }

    var instance = null;
    return Object.freeze({
      version: '1.4.0',
      start: function () {
        if (instance || !win || !win.document) return instance;
        instance = create(win);
        var doc = win.document;
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', instance.bind);
        else instance.bind();
        return instance;
      },
      // Tylko do testów: natychmiastowy przebieg bez opóźnienia.
      refresh: function () { if (instance) instance.refresh(); }
    });
  })(root);

  if (typeof module === 'object' && module.exports) module.exports = { data: DATA, model: MODEL, ui: UI };
  if (root) {
    root.VildaLabPackagesData = DATA;
    root.VildaLabPackages = MODEL;
    root.VildaLabPackagesUI = UI;
    UI.start();
  }
})(typeof window !== 'undefined' ? window : null);
