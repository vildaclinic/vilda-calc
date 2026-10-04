/* LH/FSH presentation shared by the converter, visits and history.
 * Reads only the supplied evaluation/snapshot. No current patient, clock,
 * reference selection, clinical calculations, storage or network access.
 */
(function (root, factory) {
  'use strict';
  var snapshot = typeof module === 'object' && module.exports ? require('./vilda_lab_snapshot.js') : null;
  var api = factory(root, snapshot);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabAssessmentUI = api;
})(typeof window !== 'undefined' ? window : null, function (root, commonSnapshot) {
  'use strict';

  var REASONS = {
    absent_onset: 'Brak początku dojrzewania w granicznym wieku wymaga oceny klinicznej.',
    age_outside_profile: 'Wiek próbki nie mieści się w zakresie wybranego profilu.',
    age_precision_crosses_clinical_boundary: 'Dokładność wieku nie pozwala rozstrzygnąć, po której stronie granicy klinicznej wykonano badanie.',
    age_precision_crosses_infant_boundary: 'Podany przedział wieku obejmuje granicę okresu niemowlęcego.',
    age_precision_crosses_reference_boundary: 'Podany przedział wieku przecina granice zakresów referencyjnych.',
    age_precision_crosses_scope: 'Podany przedział wieku przecina granicę zastosowania profilu.',
    ambiguous_puberty_kind: 'Sam numer Tannera nie określa, czy oceniono Th/M lub G. Potrzebny jest typ obserwacji.',
    ambiguous_reference_rows: 'Dostępne zakresy nie pozwalają wybrać jednego zgodnego przedziału.',
    biochemical_policy_missing: 'Brak kompletnego profilu kwalifikacji próbki do oceny laboratoryjnej.',
    broad_infant_reference_not_full_minipuberty_assessment: 'Szeroki zakres niemowlęcy nie opisuje całej dynamiki minipuberty ani nie potwierdza jej fizjologicznego przebiegu.',
    censored_reference_lower_limit: 'Dolny zapis zakresu jest granicą oznaczalności, a nie twardym minimum fizjologicznym.',
    censored_result_crosses_reference_boundary: 'Wynik z operatorem obejmuje wartości po obu stronach granicy zakresu; porównanie jest niejednoznaczne.',
    clinical_age_out_of_scope: 'Profil oceny rozwoju nie obejmuje tego wieku.',
    clinical_profile_missing: 'Brak kompletnego, wersjonowanego profilu oceny czasu dojrzewania.',
    clinical_scope_not_established: 'Nie ustalono zakresu wieku pozwalającego zastosować lokalną normę.',
    configured_profile_version_mismatch: 'Zapisana konfiguracja oznaczenia wymaga sprawdzenia po zmianie wersji profilu.',
    conditional_reference_comparison: 'Porównanie liczbowe jest warunkowe: zakresy dotyczą oznaczenia bazalnego bez leczenia hormonalnego.',
    early_development: 'Cechy dojrzewania pojawiły się zbyt wcześnie dla wieku i wymagają oceny przyczyny.',
    early_onset_history: 'Wczesny początek w wywiadzie pozostaje istotny niezależnie od obecnego wieku.',
    early_thelarche: 'Wczesne Th2 wymaga oceny przebiegu i objawów towarzyszących; nie przesądza o rozpoznaniu CPP.',
    inconsistent_puberty_context: 'Stadium, objętość jąder lub czas początku są niespójne i wymagają uzgodnienia.',
    infant_advanced_or_progressive_features: 'Minipuberty nie wyjaśnia automatycznie zaawansowanych lub postępujących cech płciowych.',
    infant_context: 'Wiek niemowlęcy wymaga odrębnej interpretacji uwzględniającej minipuberty.',
    infant_testicular_volume_not_validated: 'Moduł nie ma zweryfikowanego zakresu oceny objętości jąder u niemowląt; pomiar wymaga osobnej interpretacji.',
    infant_gestational_context_missing: 'Dla próbki niemowlęcia brakuje informacji o wcześniactwie.',
    infant_onset_not_confirmed: 'Początek cech w niemowlęctwie nie został potwierdzony jako trwały początek pokwitania.',
    invalid_age: 'Wpisany wiek jest nieprawidłowy.',
    invalid_birth_date: 'Data urodzenia jest nieprawidłowa.',
    invalid_measurement: 'Zapis wyniku wymaga poprawienia; nie można porównać go z zakresem.',
    invalid_reference_age_axis: 'Zakres nie ma poprawnie opisanej osi wieku.',
    invalid_reference_profile: 'Wybrany profil referencyjny jest niekompletny.',
    invalid_reference_range: 'Zapis granic zakresu jest nieprawidłowy.',
    invalid_reported_range: 'Nie można odczytać podanego zakresu. Użyj dwóch granic albo pojedynczego progu z operatorem.',
    invalid_sample_date: 'Data pobrania jest nieprawidłowa.',
    late_onset_history: 'Późny początek w wywiadzie pozostaje istotny mimo obecnego stadium.',
    local_reference_context_mismatch: 'Zakres laboratorium nie odpowiada analitowi, jednostce lub materiałowi próbki.',
    local_reference_method_not_confirmed: 'Nie potwierdzono zgodności metody oznaczenia z zakresem laboratorium.',
    local_reference_outside_pediatric_scope: 'Wiek próbki nie pozwala zastosować lokalnego zakresu w tym module pediatrycznym.',
    local_reference_patient_context_missing: 'Brak wieku lub płci potrzebnych do zastosowania zakresu laboratorium.',
    local_reference_provenance_or_applicability_missing: 'Zakres laboratorium wymaga źródła, populacji i potwierdzenia zastosowania do tej próbki.',
    low_lh_does_not_exclude_cpp: 'Niskie lub niewykrywalne LH nie wyklucza przedwczesnego dojrzewania pochodzenia centralnego (CPP).',
    manual_day_age_without_calendar_dates: 'Wiek podany w dniach bez dat kalendarzowych zachowuje niepewność długości miesiąca.',
    method_not_confirmed: 'Nie potwierdzono zgodnej metody oznaczenia rzeczywistej próbki. Sam wybór profilu tego nie potwierdza.',
    missing_age: 'Brak wiarygodnego wieku w dniu pobrania.',
    missing_age_precision: 'Nie określono dokładności podanego wieku.',
    missing_puberty_assessment: 'Brak odpowiedniej oceny Th/M lub G odnoszącej się do próbki. P i Ax jej nie zastępują.',
    missing_puberty_stage: 'Nie podano stadium rozwoju.',
    missing_sample_date: 'Do obliczenia wieku z daty urodzenia potrzebna jest data pobrania.',
    missing_sex: 'Nie podano płci właściwej dla zakresów i kryteriów.',
    missing_typed_stage_at_sample: 'Nie ma typowanej oceny stadium potwierdzonej dla dnia pobrania.',
    no_local_reference: 'Nie podano potwierdzonego zakresu laboratorium dla tej próbki.',
    no_matching_profile: 'Nie wybrano zgodnego profilu referencyjnego.',
    no_matching_reference_range: 'Brak zgodnego zakresu dla podanego wieku, płci lub stadium.',
    non_basal_or_unknown_measurement: 'Zakresy tego modułu dotyczą oznaczenia bazalnego; nie stosuje się ich do nieznanego protokołu lub testu stymulacyjnego.',
    onset_context_uncertain: 'Czas początku wymaga doprecyzowania względem dnia pobrania.',
    onset_history_missing: 'Nie podano czasu początku dojrzewania; nie można go odtworzyć z aktualnego stadium.',
    onset_precision_crosses_clinical_boundary: 'Podany przedział wieku początku przecina granicę interpretacji klinicznej.',
    preterm_reference_not_established: 'Nie ustalono właściwego profilu referencyjnego dla wcześniaka. Wiek skorygowany nie jest automatycznym zamiennikiem wieku próbki.',
    profile_analyte_mismatch: 'Wybrany profil dotyczy innego hormonu.',
    profile_material_mismatch: 'Materiał próbki nie odpowiada wybranemu profilowi.',
    profile_measurement_kind_mismatch: 'Rodzaj oznaczenia nie odpowiada wybranemu profilowi.',
    profile_not_active: 'Ten profil nie jest dopuszczony do automatycznej interpretacji.',
    puberty_kind_sex_mismatch: 'Typ oceny rozwoju nie odpowiada płci przyjętej dla kryteriów.',
    puberty_not_confirmed_at_sample: 'Nie potwierdzono, że obserwacja rozwoju opisuje dzień pobrania; późniejsze badanie jej nie zastępuje.',
    reported_puberty_regression: 'Zgłoszono cofnięcie wcześniejszych cech dojrzewania; ocena samego czasu początku nie ocenia tego przebiegu.',
    reported_cns_symptoms: 'Zgłoszone objawy OUN wymagają odrębnej oceny klinicznej; moduł nie ustala ich przyczyny ani pilności.',
    reported_range_reference_disagreement: 'Podany zakres i zakres katalogowy dają różne porównania. Sprawdź zastosowanie zakresu z wydruku i zgodność konfiguracji oznaczenia.',
    early_thelarche_with_cns_symptoms: 'Wczesny rozwój piersi z objawami OUN wymaga sprawnej oceny specjalistycznej; zalecenie samej obserwacji izolowanej thelarche nie obejmuje tej sytuacji.',
    sample_before_birth: 'Data pobrania jest wcześniejsza od daty urodzenia.',
    source_reference_disagreement: 'Zakres laboratorium i pomocniczy zakres katalogowy dają różne porównania. Podstawą biochemiczną pozostaje potwierdzony zakres laboratorium.',
    stage_age_scope_missing: 'Brak zakresu wieku pozwalającego zastosować normę według stadium.',
    stage_reference_not_for_infant: 'W niemowlęctwie nie stosuje się zakresu według stadium; ocena opiera się na odpowiednim zakresie wieku.',
    treatment_context: 'Interpretacja zależy od leczenia; pojedyncze LH/FSH nie służy tu do oceny skuteczności GnRHa.',
    treatment_context_unknown: 'Nie ustalono stosowania GnRHa lub steroidów płciowych w kontekście próbki.',
    treatment_or_previous_onset_context: 'Brak aktualnych cech wymaga uwzględnienia leczenia, wcześniejszego początku lub regresji.',
    treatment_requires_separate_profile: 'Leczenie GnRHa lub steroidami płciowymi wymaga odrębnego profilu interpretacji.',
    unquantified_detection_limit: 'Wynik poniżej LOD/LOQ nie podaje liczbowej granicy oznaczalności; nie przypisujemy mu liczby ani zera.',
    unsupported_analyte: 'Moduł ocenia wyłącznie LH i FSH.',
    unsupported_or_unknown_specimen: 'Zakresy dotyczą surowicy; materiał próbki jest nieznany lub inny.',
    unsupported_unit: 'Jednostka nie jest obsługiwana przez ten moduł.',
    unsupported_reported_range_unit: 'Jednostka podanego zakresu nie jest obsługiwana; dostępne są IU/L i mIU/mL.',
    assessment_binding_mismatch: 'Zapisana ocena nie odpowiada obecnym polom wyniku.',
    assessment_requires_recalculation: 'Wynik wymaga ponownej oceny po zmianie danych.',
    assessment_result_mismatch: 'Zapisana ocena dotyczy innej wartości, jednostki lub analitu.',
    assessment_sample_date_mismatch: 'Data pobrania w ocenie nie odpowiada dacie zapisanego badania.',
    assessment_unavailable: 'Zapisana ocena jest niedostępna.',
    invalid_assessment: 'Nie można wiarygodnie odczytać zapisanej oceny.',
    invalid_assessment_binding: 'Powiązanie oceny z wynikiem jest nieprawidłowe.',
    invalid_assessment_evaluation: 'Zapisana ocena jest niekompletna lub nieprawidłowa.',
    result_or_clinical_date_changed: 'Zmieniono wynik lub datę badania; wynik wymaga ponownej oceny.',
    unsupported_or_invalid_assessment_schema: 'Format zapisanej oceny jest nieobsługiwany lub uszkodzony.',
    snapshot_provider_failed: 'Nie udało się dołączyć oceny do wyniku.',
    snapshot_helper_unavailable: 'Odczyt zapisanej oceny jest chwilowo niedostępny.'
  };
  var STATUS = {
    within: 'W obrębie wskazanego zakresu', above: 'Powyżej wskazanego zakresu',
    below: 'Poniżej wskazanego zakresu', indeterminate: 'Porównanie niejednoznaczne', unavailable: 'Brak dopasowanej oceny'
  };
  var METHODS = {
    'anshlite-lh-clia': 'AnshLite LH CLIA',
    'roche-elecsys-fsh-eclia': 'Roche Elecsys FSH ECLIA',
    'autodelfia-johannsen-2018': 'AutoDELFIA / PerkinElmer'
  };
  // Bibliographic labels for the IDs preserved by the engine. No reference
  // values or current data file are consulted to render a historical record.
  var CITATIONS = {
    'endocrine-society-cpp-2026': ['Endocrine Society — wytyczne przedwczesnego dojrzewania, 2026', 'https://www.endocrine.org/clinical-practice-guidelines/central-precocious-puberty'],
    'endo-ern-delay-2021': ['ENDO-ERN — różnicowanie opóźnionego dojrzewania, 2021', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8016789/'],
    'puberty-hormones-review-2021': ['Howard — interpretacja hormonów w okresie dojrzewania, 2021', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9291332/'],
    'minipuberty-review-2024': ['Rohayem i wsp. — fizjologiczna i zaburzona minipuberty, 2024', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11244267/'],
    'delayed-puberty-review-2024': ['A Current Perspective on Delayed Puberty and Its Management, 2024', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11629716/'],
    'cpp-laboratory-review-2025': ['Critical appraisal of diagnostic laboratory tests in CPP, 2025', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11795171/'],
    'who-preterm-birth-2023': ['WHO — definicja wcześniactwa, 2023', 'https://www.who.int/news-room/fact-sheets/detail/preterm-birth'],
    'mayo-lhped-62999': ['Mayo Clinic Laboratories — LH pediatryczne, LHPED 62999', 'https://www.mayocliniclabs.com/test-catalog/Overview/62999'],
    'mayo-fsh-602753': ['Mayo Clinic Laboratories — FSH 602753', 'https://www.mayocliniclabs.com/test-catalog/Overview/602753']
  };

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return typeof value === 'string' ? value.trim().slice(0, 12000) : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''; }
  function numeric(value) { return typeof value === 'number' && Number.isFinite(value); }
  function number(value) { return numeric(value) ? String(value).replace('.', ',') : ''; }
  function unique(values) { return Array.from(new Set(values)); }
  function reasons(codes) {
    return unique((Array.isArray(codes) ? codes : []).map(function (code) {
      return Object.prototype.hasOwnProperty.call(REASONS, code) ? REASONS[code] : 'Zapisana ocena ma dodatkowe ograniczenie, którego ta wersja widoku nie opisuje.';
    }));
  }
  function date(value) {
    var s = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : s ? 'Nieprawidłowa data' : 'Nie podano';
  }
  function flag(value) { return value === 'yes' ? 'Tak' : value === 'no' ? 'Nie' : 'Nie wiadomo'; }
  function safeURL(value) {
    if (!/^https?:\/\//i.test(text(value))) return '';
    try { var url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function formatResult(lab) {
    lab = record(lab) ? lab : {};
    var m = lab.assessment && lab.assessment.evaluation && lab.assessment.evaluation.measurement || {};
    var raw = text(lab.value) || text(lab.raw) || text(m.raw) || text(lab.valueNum);
    var unit = text(lab.unit) || text(lab.unitSym) || text(lab.unitFrom) || text(m.sourceUnit);
    if (!raw) return 'Brak wyniku';
    // Older notes store the complete conversion equation in value.
    if (!unit || raw.toLowerCase().includes(unit.toLowerCase()) || /\s=\s/.test(raw)) return raw;
    return raw + ' ' + unit;
  }
  function bound(value) {
    if (!record(value)) return '';
    var op = ({ '>=': '≥', '<=': '≤', '>': '>', '<': '<' })[value.operator];
    return op && numeric(value.value) ? op + number(value.value) : '';
  }
  function formatRange(range) {
    var limits = range && range.bounds;
    if (!limits) return '';
    var limitsText = [bound(limits.lower), bound(limits.upper)].filter(Boolean).join(' i ');
    var censored = limits.censoredLower;
    if (censored) limitsText = (bound(censored) || '<LOD') + ' (dolna granica oznaczalności); ' + limitsText;
    return limitsText + (range.unit ? ' ' + text(range.unit) : '');
  }
  function stage(p) {
    p = p || {};
    var value = Number.isInteger(p.stage) && p.stage >= 1 && p.stage <= 5 ? String(p.stage) : '';
    if (p.kind === 'Ax') return 'Ax — owłosienie pachowe, poza skalą 1–5';
    if (['Th', 'G', 'P'].includes(p.kind)) return p.kind + (value || ' — stadium nieznane');
    return value ? 'Tanner ' + value + ' — typ nieokreślony' : 'Nie oceniono Th/M lub G';
  }
  function ageText(input, age) {
    if (age.status !== 'known') return age.status === 'invalid' ? 'Nieprawidłowy wiek' : 'Nieznany';
    if (age.source === 'dates' && numeric(age.ageDays)) return number(age.ageDays) + ' dni (dokładny wiek z dat)';
    var a = input.age || {};
    var result = numeric(a.years) ? number(a.years) + ' lat' : '';
    if (numeric(a.months) && a.precision !== 'year') result += ' ' + number(a.months) + ' mies.';
    if (numeric(a.days) && a.precision === 'day') result += ' ' + number(a.days) + ' dni';
    return result + ' (' + (({ year: 'dokładność do roku; przedział wieku', month: 'dokładność do miesiąca; przedział wieku', day: 'wiek podany bez dat kalendarzowych' })[age.precision] || 'dokładność wieku nieokreślona') + ')';
  }
  function sourceView(source, fallback) {
    source = source || {};
    return { label: text(source.label) || text(source.title) || fallback || 'Źródło zapisane z wynikiem',
      version: text(source.version), organization: text(source.organization), url: safeURL(source.url) };
  }
  function methodName(id, name) {
    if (text(name)) return text(name);
    if (Object.prototype.hasOwnProperty.call(METHODS, id)) return METHODS[id];
    return text(id) ? 'Metoda wskazana w zapisie: ' + text(id) : 'Nieznana';
  }
  function observationSource(value) {
    var labels = { provided: 'Podana informacja', 'clinical-examination': 'Badanie lekarskie', 'reported-history': 'Wywiad', 'patient-record': 'Karta pacjenta', 'local-confirmed': 'Informacja potwierdzona dla próbki' };
    return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : text(value) ? 'Podane źródło: ' + text(value) : 'Nie podano';
  }
  function observationRelation(observation, sampleDateISO, rejected, currentContext) {
    if (currentContext) return observation.appliesToCurrentContext === true && !rejected ? 'Z formularza głównego; bez potwierdzenia dla dnia pobrania' : 'Nieustalony dla bieżącego kontekstu';
    if (rejected) return 'Niepotwierdzony dla dnia pobrania';
    if (sampleDateISO && observation.assessedAtISO && observation.assessedAtISO > sampleDateISO) return 'Obserwacja późniejsza od pobrania — nie opisuje próbki';
    if (observation.appliesToSample === true) return 'Potwierdzony';
    return sampleDateISO && sampleDateISO === observation.assessedAtISO ? 'Ta sama data badania i pobrania' : 'Niepotwierdzony';
  }
  function buildView(evaluation) {
    var e = record(evaluation) ? evaluation : {};
    if (e.schemaVersion !== 1 || !['lh', 'fsh'].includes(e.analyte) || !record(e.input) || !record(e.measurement) || !record(e.ageAtSample) || !record(e.biochemical) || !record(e.clinical) || !record(e.summary) || !['attention', 'limited', 'compared', 'invalid', 'out_of_scope'].includes(e.summary.status)) return { valid: false };
    var input = e.input, m = e.measurement, b = e.biochemical, p = input.puberty || {}, assay = input.assay || {};
    var preview = record(e.referencePreview) && e.referencePreview.kind === 'conditional-basal-untreated' && b.status === 'unavailable' && b.primary === null ? e.referencePreview : null;
    var previewReasons = preview && Array.isArray(preview.reasonCodes) ? preview.reasonCodes : [];
    var unknownProtocol = previewReasons.includes('non_basal_or_unknown_measurement');
    var unknownTreatment = previewReasons.includes('treatment_context_unknown');
    var conditionNote = preview ? 'Porównanie z zakresami oznaczenia bazalnego bez leczenia hormonalnego. ' + (unknownProtocol && unknownTreatment ? 'Rodzaju badania i leczenia nie ustalono.' : unknownProtocol ? 'Rodzaju badania nie ustalono.' : 'Leczenia nie ustalono.') : '';
    var sources = [], sourceIds = [];
    var comparisons = [['age', 'Względem wieku', preview ? preview.byAge : b.byAge], ['stage', 'Względem stadium', preview ? preview.byStage : b.byStage], ['local', 'Zakres laboratorium', b.local]].map(function (item) {
      var c = item[2] || {}, range = c.range || {}, status = Object.prototype.hasOwnProperty.call(STATUS, c.status) ? c.status : 'unavailable';
      var conditional = !!preview && item[0] !== 'local' && status !== 'unavailable';
      if (c.range && range.source) {
        if (!sourceIds.includes(range.sourceId)) { sources.push(sourceView(range.source)); sourceIds.push(range.sourceId); }
      }
      return { key: item[0], title: item[1], status: status, conditional: conditional,
        label: conditional ? ({ above: 'Liczbowo powyżej zakresu', below: 'Liczbowo poniżej zakresu', within: 'Liczbowo w zakresie', indeterminate: 'Porównanie liczbowe niejednoznaczne' })[status] + ' — warunkowo' : STATUS[status], rangeText: formatRange(c.range),
        primary: b.primary === item[0], method: range.method ? methodName(range.method.id, range.method.name) : '',
        population: text(range.population && range.population.label), source: c.range ? sourceView(range.source) : null,
        referenceVersion: text(range.profileVersion),
        scope: range.stage ? stage({ kind: range.stage.kind, stage: range.stage.value }) : '', reasons: reasons(c.reasonCodes) };
    });
    var provenance = e.provenance || {};
    (Array.isArray(provenance.sourceIds) ? provenance.sourceIds : []).forEach(function (id) {
      if (sourceIds.includes(id)) return;
      var citation = Object.prototype.hasOwnProperty.call(CITATIONS, id) ? CITATIONS[id] : null;
      if (citation) { sources.push({ label: citation[0], version: '', organization: '', url: citation[1] }); sourceIds.push(id); }
    });
    var currentContext = input.contextBasis === 'current-patient';
    var observationRejected = (Array.isArray(e.limitations) ? e.limitations : []).includes('puberty_not_confirmed_at_sample');
    var context = [
      { label: currentContext ? 'Podstawa oceny' : 'Pobranie', value: currentContext ? 'Kontekst z formularza głównego' : date(input.sampleDateISO) },
      { label: currentContext ? 'Wiek z formularza głównego' : 'Wiek w dniu pobrania', value: ageText(input, e.ageAtSample) },
      { label: 'Płeć dla kryteriów', value: ['F', 'M'].includes(input.sex) ? input.sex : 'Nieznana' },
      { label: 'Obserwacja rozwoju', value: stage(p) },
      { label: 'Data obserwacji', value: date(p.assessedAtISO) },
      { label: 'Źródło obserwacji', value: observationSource(p.source) },
      { label: currentContext ? 'Związek obserwacji z kontekstem' : 'Związek obserwacji z próbką', value: observationRelation(p, input.sampleDateISO, observationRejected, currentContext) },
      { label: 'Materiał', value: input.specimen === 'serum' ? 'Surowica' : input.specimen === 'urine' ? 'Mocz' : 'Inny lub nieznany' },
      { label: 'Rodzaj oznaczenia', value: input.measurementKind === 'basal' ? 'Bazalne' : input.measurementKind === 'stimulated' ? 'Po stymulacji' : 'Inny lub nieznany' },
      { label: assay.confirmation === 'configured' ? 'Metoda z konfiguracji' : 'Metoda próbki', value: methodName(assay.methodId) },
      { label: 'Potwierdzenie metody', value: assay.confirmation === 'configured' ? 'Z zapisanej konfiguracji oznaczenia' + (assay.profileVersion ? ' · wersja profilu: ' + text(assay.profileVersion) : ' · wersja profilu niepodana') : assay.confirmation === 'reported' ? 'Podana dla rzeczywistej próbki' : 'Niepotwierdzona' }
    ];
    var treatment = input.treatment || {};
    if (Object.prototype.hasOwnProperty.call(treatment, 'context')) {
      context.push({ label: 'Kontekst leczenia', value: treatment.context === 'hormonal' ? 'Leczenie hormonalne — bez określenia leku' : treatment.context === 'none' ? (treatment.gnrha === 'no' && treatment.sexSteroids === 'no' ? 'Nie zgłoszono leczenia wpływającego na interpretację LH/FSH' : 'Zadeklarowano brak leczenia; szczegóły wymagają ustalenia') : 'Nie ustalono' });
      if (['yes', 'no'].includes(treatment.gnrha)) context.push({ label: 'Leczenie GnRHa', value: flag(treatment.gnrha) });
      if (['yes', 'no'].includes(treatment.sexSteroids)) context.push({ label: 'Steroidy płciowe', value: flag(treatment.sexSteroids) });
    } else {
      context.push({ label: 'Leczenie GnRHa', value: flag(treatment.gnrha) });
      context.push({ label: 'Steroidy płciowe', value: flag(treatment.sexSteroids) });
    }
    if (input.birthDateISO) context.splice(1, 0, { label: 'Data urodzenia użyta w ocenie', value: date(input.birthDateISO) });
    var onset = input.onset || {};
    if (onset.dateISO || onset.age) {
      context.push({ label: 'Początek w wywiadzie', value: stage({ kind: onset.kind }).replace(' — stadium nieznane', '') + ' · ' + (onset.dateISO ? date(onset.dateISO) : ageText({ age: onset.age }, { status: 'known', precision: onset.age.precision, source: 'reported-age' })) });
      context.push({ label: 'Potwierdzenie trwałego początku pokwitania', value: onset.confirmedPubertalOnset === true ? 'Potwierdzono' : 'Nie potwierdzono' });
    }
    var volume = input.testicularVolume || {};
    if (numeric(volume.value)) {
      context.push({ label: 'Objętość jąder', value: number(volume.value) + ' ' + text(volume.unit) + ' · ' + (volume.method === 'Prader' ? 'Orchidometr Pradera' : text(volume.method) ? 'Metoda: ' + text(volume.method) : 'Nieznana metoda') + ' · ' + date(volume.assessedAtISO) });
      context.push({ label: currentContext ? 'Związek pomiaru jąder z kontekstem' : 'Związek pomiaru jąder z próbką', value: observationRelation(volume, input.sampleDateISO, false, currentContext) });
    }
    var history = input.history || {};
    [['progression', 'Progresja'], ['growthAcceleration', 'Przyspieszenie wzrastania'], ['cnsSymptoms', 'Objawy OUN'], ['regression', 'Regresja']].forEach(function (entry) { context.push({ label: entry[1], value: flag(history[entry[0]]) }); });
    if (input.preterm !== 'unknown' || numeric(input.gestationalAgeWeeks) || e.clinical.code === 'infant_context') {
      context.push({ label: 'Wcześniactwo', value: flag(input.preterm) });
      if (numeric(input.gestationalAgeWeeks)) context.push({ label: 'Wiek ciążowy przy urodzeniu', value: number(input.gestationalAgeWeeks) + ' tyg.' });
    }
    var suppliedRange = record(e.reportedRange) ? e.reportedRange : null;
    var suppliedStatus = suppliedRange && Object.prototype.hasOwnProperty.call(STATUS, suppliedRange.status) ? suppliedRange.status : 'unavailable';
    var limitationCodes = Array.isArray(e.limitations) ? e.limitations : [];
    if (preview) limitationCodes = limitationCodes.filter(function (code) { return !['non_basal_or_unknown_measurement', 'treatment_context_unknown', 'profile_measurement_kind_mismatch'].includes(code); });
    var limitations = reasons(limitationCodes);
    if (currentContext) limitations = limitations.map(function (message) {
      if (message === REASONS.missing_age) return 'Brak wiarygodnego wieku w formularzu głównym.';
      if (message === REASONS.missing_typed_stage_at_sample || message === REASONS.puberty_not_confirmed_at_sample) return 'Nie ustalono typowanej obserwacji rozwoju właściwej dla bieżącego kontekstu.';
      if (message === REASONS.missing_puberty_assessment) return 'Brak odpowiedniej oceny Th/M lub G dla bieżącego kontekstu. P i Ax jej nie zastępują.';
      return message;
    });
    return { valid: true, analyte: e.analyte.toUpperCase(),
      result: { text: formatResult({ value: m.raw, unit: m.sourceUnit }), valid: m.status === 'valid', censored: m.status === 'valid' && m.isExact === false,
        note: m.status === 'valid' && m.isExact === false ? 'Wynik nie jest dokładnym punktem liczbowym; nie kreślimy go na granicy oznaczenia w trendzie.' : m.status === 'invalid' ? 'Nieprawidłowy zapis wyniku lub jednostki.' : '' },
      clinical: { title: text(e.clinical.title), text: text(e.clinical.text), status: text(e.clinical.status), code: text(e.clinical.code) },
      summary: { title: text(e.summary.title), status: e.summary.status }, comparisons: comparisons, conditionNote: conditionNote,
      context: context, contextBasis: currentContext ? 'current-patient' : 'sample',
      contextNote: currentContext ? 'Kontekst z formularza głównego — wiek i obserwacje nie potwierdzają dnia pobrania.' : '',
      assayNote: assay.confirmation === 'configured' ? 'Z zapisanej konfiguracji oznaczenia: ' + methodName(assay.methodId) + (assay.profileVersion ? ' · profil ' + text(assay.profileVersion) : '') : '',
      reportedRange: suppliedRange ? { status: suppliedStatus, label: ({ within: 'W podanym zakresie', above: 'Powyżej podanego zakresu', below: 'Poniżej podanego zakresu', indeterminate: 'Porównanie z podanym zakresem niejednoznaczne', unavailable: 'Nie można porównać z podanym zakresem' })[suppliedStatus], raw: text(suppliedRange.raw), unit: text(suppliedRange.unit), reasons: reasons(suppliedRange.reasonCodes) } : null,
      reportedRangeConflict: (Array.isArray(e.limitations) ? e.limitations : []).includes('reported_range_reference_disagreement'),
      limitations: limitations, sources: sources,
      versions: [e.engineVersion ? 'Silnik: ' + text(e.engineVersion) : '', e.dataVersion ? 'Dane: ' + text(e.dataVersion) : '', provenance.clinicalProfileVersion ? 'Kryteria rozwoju: ' + text(provenance.clinicalProfileVersion) : ''].filter(Boolean) };
  }

  function node(doc, tag, className, content) {
    var element = doc.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = content;
    return element;
  }
  function add(parent, tag, className, content) { return parent.appendChild(node(parent.ownerDocument, tag, className, content)); }
  function list(parent, values, className) {
    if (!values.length) return;
    var ul = add(parent, 'ul', className);
    values.forEach(function (value) { add(ul, 'li', '', value); });
  }
  function details(parent, title) { var element = add(parent, 'details', 'vilda-lab-details'); add(element, 'summary', '', title); return element; }
  function renderComparisonContext(parent, comparison) {
    if (comparison.primary) add(parent, 'p', 'vilda-lab-note', 'Podstawa porównania biochemicznego');
    if (comparison.method) add(parent, 'p', 'vilda-lab-metadata', comparison.method + (comparison.scope ? ' · ' + comparison.scope : ''));
    if (comparison.population) add(parent, 'p', 'vilda-lab-metadata', comparison.population);
    if (comparison.source) add(parent, 'p', 'vilda-lab-metadata', 'Źródło zakresu: ' + comparison.source.label
      + ' · ' + (comparison.source.version ? 'wersja źródła: ' + comparison.source.version : 'wersja źródła niepodana')
      + (comparison.referenceVersion ? ' · wersja zakresu: ' + comparison.referenceVersion : ''));
    list(parent, comparison.reasons, 'vilda-lab-reasons');
  }
  function renderContents(parent, view, options) {
    var compact = !!(options && options.compact);
    if (!options || !options.hideMeasurement) {
      add(parent, 'p', 'vilda-lab-result-label', 'Wynik ' + view.analyte);
      add(parent, 'p', 'vilda-lab-result', view.result.text);
    }
    if (view.result.note) add(parent, 'p', 'vilda-lab-note', view.result.note);
    if (view.contextNote) add(parent, 'p', 'vilda-lab-context-note', view.contextNote);
    var clinical = add(parent, 'div', 'vilda-lab-clinical');
    clinical.setAttribute('data-clinical-code', /^[a-z_]+$/.test(view.clinical.code) ? view.clinical.code : 'unavailable');
    clinical.setAttribute('data-status', ['warning', 'notice', 'limited', 'out_of_scope', 'no_timing_alert'].includes(view.clinical.status) ? view.clinical.status : 'limited');
    add(clinical, 'h3', '', 'Rozwój płciowy');
    add(clinical, 'strong', '', view.clinical.title);
    // Akapity należą do zapisanej oceny. Nie tworzymy nowych ostrzeżeń na
    // podstawie dzisiejszych reguł podczas odczytu historycznego snapshotu.
    view.clinical.text.split(/\n\s*\n/).forEach(function (paragraph) { add(clinical, 'p', '', paragraph); });
    if (view.summary.title !== view.clinical.title) add(parent, 'p', 'vilda-lab-summary', view.summary.title);
    add(parent, 'h3', 'vilda-lab-biochemistry-title', 'Stężenie — osobne porównania');
    if (view.assayNote) add(parent, 'p', 'vilda-lab-note', view.assayNote);
    if (view.conditionNote) add(parent, 'p', 'vilda-lab-reference-conditions', view.conditionNote).setAttribute('data-reference-conditions', 'conditional-basal-untreated');
    if (view.reportedRange) {
      var supplied = add(parent, 'div', 'vilda-lab-comparison vilda-lab-reported-range');
      supplied.setAttribute('data-comparison', 'reported');
      supplied.setAttribute('data-status', view.reportedRange.status);
      add(supplied, 'h4', '', 'Podany zakres');
      add(supplied, 'strong', 'vilda-lab-comparison-status', view.reportedRange.label);
      add(supplied, 'p', 'vilda-lab-range', [view.reportedRange.raw, view.reportedRange.unit].filter(Boolean).join(' '));
      add(supplied, 'p', 'vilda-lab-note', 'Porównanie liczbowe. Nie potwierdza zastosowania zakresu do wieku, stadium ani metody.');
      if (!compact) list(supplied, view.reportedRange.reasons, 'vilda-lab-reasons');
    }
    if (view.reportedRangeConflict) add(parent, 'p', 'vilda-lab-summary', REASONS.reported_range_reference_disagreement);
    var comparisons = add(parent, 'div', 'vilda-lab-comparisons');
    view.comparisons.forEach(function (comparison) {
      if (compact && comparison.key === 'local' && comparison.status === 'unavailable') return;
      var row = add(comparisons, 'div', 'vilda-lab-comparison');
      row.setAttribute('data-comparison', comparison.key);
      row.setAttribute('data-status', comparison.status);
      if (comparison.conditional) row.setAttribute('data-applicability', 'conditional');
      var head = add(row, 'div', 'vilda-lab-comparison-head');
      add(head, 'h4', '', comparison.title);
      add(head, 'span', 'vilda-lab-comparison-status', comparison.label);
      if (comparison.rangeText) add(row, 'p', 'vilda-lab-range', comparison.rangeText);
      if (!compact) renderComparisonContext(row, comparison);
      else if (comparison.key === 'local') renderComparisonContext(details(row, 'Źródło i zastosowanie zakresu'), comparison);
    });
    add(parent, 'p', 'vilda-lab-note', 'Zakresy według wieku i stadium oceniono oddzielnie. Porównanie stężenia nie rozstrzyga przyczyny rozwoju.');
    var context = details(parent, 'Kontekst użyty w ocenie');
    var dl = add(context, 'dl', 'vilda-lab-context');
    view.context.forEach(function (row) { add(dl, 'dt', '', row.label); add(dl, 'dd', '', row.value); });
    var more = details(parent, 'Ograniczenia i źródła');
    list(more, view.limitations, 'vilda-lab-limitations');
    if (compact) view.comparisons.forEach(function (comparison) {
      add(more, 'h4', '', comparison.title);
      renderComparisonContext(more, comparison);
    });
    if (compact && view.reportedRange) list(more, view.reportedRange.reasons, 'vilda-lab-reasons');
    add(more, 'p', 'vilda-lab-note', 'Ocena nie ustala etiologii, nie rozpoznaje CPP ani nie dobiera leczenia. Zakresy zależą od konkretnej metody i populacji.');
    var sources = add(more, 'ul', 'vilda-lab-sources');
    view.sources.forEach(function (source) {
      var li = add(sources, 'li', '');
      if (source.url) {
        var link = add(li, 'a', '', source.label);
        link.setAttribute('href', source.url); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer');
      } else add(li, 'span', '', source.label);
      if (source.organization || source.version) add(li, 'span', '', ' · ' + [source.organization, source.version].filter(Boolean).join(' · '));
    });
    add(more, 'p', 'vilda-lab-versions', view.versions.join(' · '));
    if (options && options.expandContext) context.setAttribute('open', '');
  }
  function mount(container, status, summary, options) {
    if (!container || !container.ownerDocument || typeof container.appendChild !== 'function') return null;
    while (container.firstChild) container.removeChild(container.firstChild);
    var section = add(container, 'section', 'vilda-lab-assessment' + (options && options.compact ? ' is-compact' : ''));
    section.setAttribute('data-assessment-status', status);
    section.setAttribute('data-summary-status', summary);
    section.setAttribute('aria-label', status === 'recorded' ? 'Ocena LH/FSH' : 'Stan zapisanej oceny LH/FSH');
    return section;
  }
  function renderEvaluation(container, evaluation, options) {
    var view = buildView(evaluation);
    if (!view.valid) return renderAssessment(container, null, options);
    var section = mount(container, 'recorded', view.summary.status, options);
    if (section) renderContents(section, view, options);
    return view;
  }
  function renderAssessment(container, assessment, options) {
    var helper = commonSnapshot || root && root.VildaLabSnapshot;
    var normalized = helper && typeof helper.normalize === 'function' ? helper.normalize(assessment) : { status: 'unavailable', reasonCodes: ['snapshot_helper_unavailable'], evaluation: null };
    if (normalized.status === 'recorded') return renderEvaluation(container, normalized.evaluation, options);
    var section = mount(container, normalized.status === 'invalidated' ? 'invalidated' : 'unavailable', 'unavailable', options);
    if (!section) return null;
    add(section, 'h3', '', normalized.status === 'invalidated' ? 'Wynik wymaga ponownej oceny' : 'Ocena niedostępna');
    add(section, 'p', 'vilda-lab-note', normalized.status === 'invalidated' ? 'Zmieniono dane wyniku lub kontekst badania. Poprzednia interpretacja nie opisuje bieżącego wpisu.' : 'Nie można przedstawić wiarygodnej zapisanej oceny. Nie odtwarzamy jej z aktualnych danych pacjenta.');
    list(section, reasons(normalized.reasonCodes), 'vilda-lab-reasons');
    var historical = buildView(normalized.evaluation);
    if (historical.valid) {
      var old = details(section, 'Poprzednia ocena — wyłącznie historycznie');
      old.className += ' vilda-lab-history';
      add(old, 'p', 'vilda-lab-note', 'Poniższe dane i interpretacja pochodzą ze wcześniejszego zapisu.');
      renderContents(old, historical, options);
    }
    return { valid: false, status: normalized.status };
  }
  return Object.freeze({ version: '1.3.0', formatResult: formatResult, buildView: buildView, renderEvaluation: renderEvaluation, renderAssessment: renderAssessment });
});
