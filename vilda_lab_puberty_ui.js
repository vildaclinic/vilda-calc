/* LH/FSH — kontekst pojedynczego oznaczenia. Ten formularz niczego nie zapisuje
 * w danych pacjenta. Interpretację wykonuje wyłącznie VildaLabPuberty; widok
 * zapisanej i bieżącej oceny jest wspólny (VildaLabAssessmentUI).
 */
(function (root) {
  'use strict';

  function text(value) { return value == null ? '' : String(value).trim(); }
  function number(value) {
    var raw = text(value).replace(',', '.');
    return raw === '' ? null : Number(raw);
  }
  function flag(value) { return value === 'yes' || value === 'no' ? value : 'unknown'; }
  function sourceUrl(value) {
    var raw = text(value);
    if (!/^https?:\/\//i.test(raw)) return '';
    try { var parsed = new URL(raw); return ['http:', 'https:'].includes(parsed.protocol) ? raw : ''; } catch (_) { return ''; }
  }
  function age(fields, prefix) {
    var years = fields[prefix + 'Years'], months = fields[prefix + 'Months'], days = fields[prefix + 'Days'];
    if (![years, months, days].some(function (v) { return text(v) !== ''; })) return null;
    return {
      years: number(years), months: number(months), days: number(days),
      precision: text(days) !== '' ? 'day' : text(months) !== '' ? 'month' : 'year'
    };
  }
  function bound(fields, prefix) {
    if (text(fields[prefix + 'Value']) === '') return null;
    return { operator: text(fields[prefix + 'Operator']), value: number(fields[prefix + 'Value']) };
  }

  // Whitelist pól formularza, bez dat domyślnych i bez domniemanego Th/G.
  // Części wieku zachowują rzeczywistą precyzję. Silnik rozstrzyga poprawność.
  function buildInput(fields, measurement) {
    var f = fields || {}, m = measurement || {};
    var input = {
      analyte: text(m.analyte), value: text(m.raw), unit: text(m.unit),
      sex: ['M', 'F'].includes(f.sex) ? f.sex : null,
      birthDateISO: text(f.birthDate) || null, sampleDateISO: text(f.sampleDate) || null,
      age: age(f, 'age'), specimen: text(f.specimen) || 'unknown',
      measurementKind: text(f.measurementKind) || 'unknown',
      assay: { profileId: text(f.profile), methodId: text(f.method), confirmation: f.methodConfirmed === true ? 'reported' : 'unknown' },
      puberty: {
        kind: text(f.kind) || 'unspecified', stage: f.kind === 'Ax' ? null : number(f.stage),
        assessedAtISO: text(f.assessedAt) || null, appliesToSample: f.appliesToSample === true,
        source: text(f.observationSource) || 'provided'
      },
      testicularVolume: {
        value: number(f.testicularVolume), unit: 'mL', method: text(f.volumeMethod),
        assessedAtISO: text(f.volumeAssessedAt) || null, appliesToSample: f.volumeAppliesToSample === true
      },
      onset: { kind: text(f.onsetKind) || 'unspecified', dateISO: text(f.onsetDate) || null,
        age: age(f, 'onsetAge'), confirmedPubertalOnset: f.onsetConfirmed === true },
      history: { progression: flag(f.progression), growthAcceleration: flag(f.growthAcceleration),
        cnsSymptoms: flag(f.cnsSymptoms), regression: flag(f.regression) },
      treatment: { gnrha: flag(f.gnrha), sexSteroids: flag(f.sexSteroids) },
      preterm: flag(f.preterm), gestationalAgeWeeks: number(f.gestationalWeeks)
    };
    if (f.localEnabled === true) input.localReference = {
      id: text(f.localId), version: text(f.localVersion), analyte: input.analyte,
      material: input.specimen, unit: text(f.localUnit), methodId: text(f.localMethod),
      source: { id: text(f.localSourceId), label: text(f.localSourceLabel), version: text(f.localSourceVersion), url: sourceUrl(f.localSourceUrl) },
      population: { label: text(f.localPopulation) }, applicabilityConfirmed: f.localConfirmed === true,
      range: { lower: bound(f, 'localLower'), upper: bound(f, 'localUpper'),
        censoredLower: bound(f, 'localCensoredLower'), sourceText: text(f.localSourceText) }
    };
    // Opcjonalny kontrakt szybkiej ścieżki. Starsi klienci zachowują dotychczasowe
    // datowanie i potwierdzenie metody konkretnej próbki.
    if (f.contextBasis === 'current-patient' || f.contextBasis === 'sample') {
      input.contextBasis = f.contextBasis;
      if (f.contextBasis === 'current-patient') {
        input.birthDateISO = null; input.sampleDateISO = null;
        input.puberty.appliesToSample = false; input.testicularVolume.appliesToSample = false;
        input.puberty.appliesToCurrentContext = true; input.testicularVolume.appliesToCurrentContext = true;
      } else {
        input.puberty.appliesToSample = true; input.testicularVolume.appliesToSample = true;
      }
      input.treatment.context = ['none', 'hormonal'].includes(f.treatmentContext) ? f.treatmentContext : 'unknown';
      if (f.configuredAssay && typeof f.configuredAssay === 'object') input.assay = {
        profileId: text(f.configuredAssay.profileId), profileVersion: text(f.configuredAssay.profileVersion),
        methodId: text(f.configuredAssay.methodId), confirmation: 'configured'
      };
      if (text(f.reportedRange)) input.reportedRange = { text: text(f.reportedRange), unit: input.unit };
    }
    return input;
  }

  function mount(options) {
    var opts = options || {}, doc = opts.document || root.document;
    if (!doc) return null;
    var engine = opts.engine || root.VildaLabPuberty, data = opts.data || root.VildaLabPubertyData;
    var snapshots = opts.snapshot || root.VildaLabSnapshot;
    var renderer = opts.renderer || root.VildaLabAssessmentUI;
    var preferences = opts.preferences || root.VildaLabProfilePreferences;
    var persistence = opts.persistence || root.VildaPersistence;
    var byId = function (id) { return doc.getElementById(id); };
    var resultSection = byId('labResultSection');
    var patientBody = byId('labStep5') && byId('labStep5').querySelector('.lab-step-body');
    var sampleBody = byId('labStep4') && byId('labStep4').querySelector('.lab-step-body');
    if (!resultSection || !patientBody || !sampleBody) return null;
    var fields = {}, wrappers = {}, sections = {}, sectionButtons = {};
    var analyte = null, evaluation = null, context = null, contextKey = null, sampleDate = '';
    var lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
    var dirty = {}, imported = {};
    function element(tag, className, content) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (content != null) node.textContent = content;
      return node;
    }
    function button(parent, id, label, action) {
      var node = element('button', 'lab-puberty-context-button', label);
      node.id = id; node.type = 'button'; node.addEventListener('click', action); parent.appendChild(node); return node;
    }
    var panel = element('section', 'lab-puberty-panel');
    panel.id = 'labPubertyPanel'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Pacjent — kontekst LH i FSH'); patientBody.appendChild(panel);
    var patientRow = element('div', 'lab-puberty-summary-row'); panel.appendChild(patientRow);
    var patientSummary = element('strong'); patientSummary.id = 'labPubertyPatientSummary'; patientRow.appendChild(patientSummary);
    button(patientRow, 'labPubertyEditPatient', 'Zmień', function () { openSection('patient'); });
    var stageRow = element('div', 'lab-puberty-summary-row lab-puberty-stage-row'); panel.appendChild(stageRow);
    var stageSummary = element('span'); stageSummary.id = 'labPubertyStageSummary'; stageRow.appendChild(stageSummary);
    var refineStage = button(stageRow, 'labPubertyRefineStage', 'Doprecyzuj', function () { openSection('stage'); });
    var contextLine = element('p', 'lab-puberty-hint'); contextLine.id = 'labPubertyPatientContext'; panel.appendChild(contextLine);
    var assessment = element('div', 'lab-puberty-assessment-host'); assessment.id = 'labPubertyAssessment'; assessment.hidden = true;
    var samplePanel = element('section', 'lab-puberty-panel'); samplePanel.id = 'labPubertySamplePanel'; samplePanel.hidden = true;
    samplePanel.setAttribute('aria-label', 'Szczegóły LH i FSH'); sampleBody.appendChild(samplePanel);
    var sampleLabel = sampleBody.querySelector('.lab-step-label'), patientLabel = patientBody.querySelector('.lab-step-label');
    var originalSampleLabel = sampleLabel && sampleLabel.firstChild && sampleLabel.firstChild.textContent;
    var originalPatientLabel = patientLabel && patientLabel.firstChild && patientLabel.firstChild.textContent;
    var methodRow = element('div', 'lab-puberty-summary-row'); samplePanel.appendChild(methodRow);
    var methodSummary = element('span', 'lab-puberty-method-summary'); methodSummary.id = 'labPubertyMethodSummary'; methodRow.appendChild(methodSummary);
    var editMethod = button(methodRow, 'labPubertyEditMethod', 'Ustaw', function () { methodSettings.open = !methodSettings.open; });
    var methodSettings = element('details', 'lab-puberty-details'); methodSettings.id = 'labPubertyMethodSettings';
    methodSettings.appendChild(element('summary', '', 'Ustawienie metody na tym urządzeniu'));
    methodSettings.appendChild(element('p', 'lab-puberty-hint', 'Wybierz tylko metodę używaną przez Twoje laboratorium. Zapamiętamy ją osobno dla LH i FSH. Przy wyniku z innego laboratorium sprawdź zgodność lub wybierz „Inna/nieznana metoda”.'));
    var methodGrid = element('div', 'lab-puberty-fields'); methodSettings.appendChild(methodGrid); samplePanel.appendChild(methodSettings);
    function field(parent, key, label, type, choices, extra) {
      var wrap = element('label', 'lab-puberty-field');
      var id = 'labPuberty' + key.charAt(0).toUpperCase() + key.slice(1);
      wrap.setAttribute('for', id);
      var input = element(type === 'select' ? 'select' : 'input'); input.id = id;
      if (type === 'select') (choices || []).forEach(function (choice) {
        var option = element('option', '', choice[1]); option.value = choice[0]; input.appendChild(option);
      }); else input.type = type || 'text';
      if (type === 'checkbox') { wrap.classList.add('lab-puberty-checkbox'); wrap.appendChild(input); wrap.appendChild(doc.createTextNode(label)); }
      else { wrap.appendChild(element('span', '', label)); wrap.appendChild(input); }
      if (extra) Object.keys(extra).forEach(function (name) { input.setAttribute(name, extra[name]); });
      input.setAttribute('autocomplete', 'off'); fields[key] = input; wrappers[key] = wrap; parent.appendChild(wrap);
      input.addEventListener('input', function () { changed(key); }); input.addEventListener('change', function () { changed(key); }); return input;
    }
    field(methodGrid, 'configuredProfile', 'Metoda laboratorium', 'select', [['', 'Nie ustawiono']]);
    button(methodSettings, 'labPubertySaveProfile', 'Zapisz na tym urządzeniu', saveProfile);
    var methodNotice = element('p', 'lab-puberty-hint'); methodNotice.id = 'labPubertyMethodNotice'; methodNotice.setAttribute('role', 'status'); methodSettings.appendChild(methodNotice);
    field(samplePanel, 'unknownMethod', 'Inna/nieznana metoda dla tego wyniku', 'checkbox');
    var contextRow = element('div', 'lab-puberty-summary-row'); samplePanel.appendChild(contextRow);
    var contextSummary = element('span', 'lab-puberty-method-summary'); contextSummary.id = 'labPubertyContextSummary'; contextRow.appendChild(contextSummary);
    var editContext = button(contextRow, 'labPubertyEditContext', 'Określ', function () { openSection('context'); });
    var details = element('details', 'lab-puberty-details'); details.id = 'labPubertyDetails';
    details.appendChild(element('summary', '', 'Szczegóły badania — opcjonalnie'));
    var actions = element('div', 'lab-puberty-detail-actions'); details.appendChild(actions); samplePanel.appendChild(details);
    function section(name, title, hint) {
      sectionButtons[name] = button(actions, 'labPubertyOpen' + name.charAt(0).toUpperCase() + name.slice(1), title, function () { openSection(name); });
      sectionButtons[name].setAttribute('aria-pressed', 'false');
      var sectionNode = element('section', 'lab-puberty-detail-section'); sectionNode.id = 'labPubertySection' + name.charAt(0).toUpperCase() + name.slice(1); sectionNode.hidden = true;
      sectionNode.appendChild(element('h3', '', title));
      if (hint) sectionNode.appendChild(element('p', 'lab-puberty-hint', hint));
      var grid = element('div', 'lab-puberty-fields'); sectionNode.appendChild(grid); details.appendChild(sectionNode); sections[name] = sectionNode; return grid;
    }
    function openSection(name) {
      details.open = true;
      Object.keys(sections).forEach(function (key) { sections[key].hidden = key !== name; sectionButtons[key].setAttribute('aria-pressed', String(key === name)); });
    }
    var tri = [['unknown', 'Nie wiadomo'], ['no', 'Nie'], ['yes', 'Tak']];
    var patient = section('patient', 'Pacjent', 'Dane z formularza głównego wczytują się automatycznie. Korekta dotyczy tylko tego sprawdzenia.');
    field(patient, 'sex', 'Płeć', 'select', [['', 'Nie podano'], ['F', 'Dziewczynka / kobieta'], ['M', 'Chłopiec / mężczyzna']]);
    field(patient, 'ageYears', 'Ukończone lata', 'number', null, { min: '0', max: '120', step: '1' });
    field(patient, 'ageMonths', 'Dodatkowe miesiące — jeśli znane', 'number', null, { min: '0', max: '11', step: '1' });
    var stage = section('stage', 'Stadium', 'Sam numer Tannera nie określa cechy. P i Ax nie zastępują rozwoju gonadalnego.');
    field(stage, 'kind', 'Rodzaj cechy', 'select', [['unspecified', 'Nie określono'], ['Th', 'Th/M — rozwój piersi'], ['G', 'G — narządy płciowe'], ['P', 'P — owłosienie łonowe'], ['Ax', 'Ax — owłosienie pachowe']]);
    field(stage, 'stage', 'Stadium', 'select', [['', 'Nie podano'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]);
    var stageHint = element('p', 'lab-puberty-hint'); stageHint.id = 'labPubertyStageHint'; sections.stage.appendChild(stageHint);
    var date = section('date', 'Wcześniejsze badanie', 'Podaj datę tylko wtedy, gdy chcesz odnieść ocenę do dnia pobrania. Dzisiejsze stadium i leczenie nie przechodzą do wcześniejszej próbki.');
    field(date, 'sampleDate', 'Data pobrania', 'date');
    field(date, 'birthDate', 'Data urodzenia — jeśli znana', 'date');
    var dateHint = element('p', 'lab-puberty-hint'); dateHint.id = 'labPubertyDateHint'; sections.date.appendChild(dateHint);
    button(sections.date, 'labPubertyClearDate', 'Wróć do bieżących danych', function () { fields.sampleDate.value = ''; changed('sampleDate'); });
    var sample = section('context', 'Kontekst oznaczenia', 'Jedna odpowiedź dla tego sprawdzenia. Nie zapamiętujemy leczenia jako ustawienia laboratorium.');
    field(sample, 'context', 'Oznaczenie', 'select', [['unknown', 'Nie ustalono'], ['basal-untreated', 'Bazalne, bez leczenia hormonalnego'], ['hormonal', 'W trakcie leczenia hormonalnego'], ['stimulated', 'Po stymulacji']]);
    var treatmentHint = element('p', 'lab-puberty-hint'); treatmentHint.id = 'labPubertyTreatmentHint'; sections.context.appendChild(treatmentHint);
    var range = section('range', 'Zakres z wydruku', 'Proste porównanie z zakresem przepisanym z tego wyniku; nie zastępuje oceny jego zastosowania klinicznego.');
    field(range, 'reportedRange', 'Zakres', 'text', null, { placeholder: 'np. 0,5–3,0 lub ≤3,0', maxlength: '96' });
    var rangeUnit = element('p', 'lab-puberty-hint'); rangeUnit.id = 'labPubertyRangeUnit'; sections.range.appendChild(rangeUnit);
    var extra = section('extra', 'Dodatkowe informacje', 'Uzupełnij tylko znane informacje istotne dla oceny. Brak odpowiedzi nie oznacza „Nie”.');
    field(extra, 'cnsSymptoms', 'Objawy ze strony OUN', 'select', tri);
    field(extra, 'regression', 'Regresja wcześniejszych cech', 'select', tri);
    field(extra, 'testicularVolume', 'Dokładna objętość jąder [mL] — opcjonalnie', 'number', null, { min: '0', step: 'any' });
    field(extra, 'volumeMethod', 'Metoda oceny objętości', 'select', [['', 'Nie podano'], ['Prader', 'Orchidometr Pradera'], ['ultrasound', 'USG'], ['other', 'Inna']]);
    field(extra, 'preterm', 'Urodzenie przedwcześnie', 'select', tri);

    function materialLabel(value) { return ({ serum: 'surowica', plasma: 'osocze', urine: 'mocz' }[value] || text(value)); }
    function ready() { return !!context && context.sourceStatus === 'ready'; }
    function resolveProfile() {
      if (!preferences || typeof preferences.resolve !== 'function' || !analyte) return null;
      try { return preferences.resolve(preferences.read(persistence, data), analyte, data); } catch (_) { return null; }
    }
    function readFields() {
      var values = {};
      Object.keys(fields).forEach(function (key) { values[key] = fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value; });
      var current = !text(values.sampleDate), profile = !values.unknownMethod && resolveProfile();
      values.contextBasis = current ? 'current-patient' : 'sample';
      values.observationSource = imported.stage ? 'patient-record' : 'provided';
      if (profile && profile.assay) { values.configuredAssay = profile.assay; values.specimen = profile.specimen; }
      values.gnrha = current && ready() ? ({ brak: 'no', 'w-trakcie': 'yes' }[context.gnrhaStatus] || 'unknown') : 'unknown';
      values.sexSteroids = 'unknown'; values.treatmentContext = 'unknown'; values.measurementKind = 'unknown';
      if (values.context === 'basal-untreated') { values.measurementKind = 'basal'; values.treatmentContext = 'none'; values.gnrha = 'no'; values.sexSteroids = 'no'; }
      else if (values.context === 'hormonal') values.treatmentContext = 'hormonal';
      else if (values.context === 'stimulated') values.measurementKind = 'stimulated';
      if (current && ready()) {
        var history = context.history || {};
        values.progression = flag(history.progression); values.growthAcceleration = flag(history.growthAcceleration);
        var onset = context.onset || {}, onsetAge = onset.age || {};
        values.onsetKind = onset.kind; values.onsetDate = onset.dateISO; values.onsetConfirmed = onset.confirmedPubertalOnset === true;
        values.onsetAgeYears = onsetAge.years; values.onsetAgeMonths = onsetAge.months; values.onsetAgeDays = onsetAge.days;
      }
      return values;
    }
    function notify() { if (typeof opts.onChange === 'function') opts.onChange(); }
    function clearField(key) {
      var input = fields[key];
      if (input.type === 'checkbox') input.checked = false;
      else input.value = input.tagName === 'SELECT' ? input.options[0].value : '';
    }
    function clearClinical() {
      ['ageYears', 'ageMonths', 'kind', 'stage', 'context', 'cnsSymptoms', 'regression', 'testicularVolume', 'volumeMethod', 'preterm'].forEach(function (key) { clearField(key); delete dirty[key]; delete imported[key]; });
    }
    function changed(key) {
      if (key === 'configuredProfile') return;
      delete imported[key]; dirty[key] = true; evaluation = null;
      if (key === 'sampleDate' && sampleDate !== fields.sampleDate.value) {
        sampleDate = fields.sampleDate.value; clearClinical(); importContext();
      }
      if (key === 'kind' && fields.kind.value === 'Ax') { fields.stage.value = ''; delete imported.stage; dirty.stage = true; }
      updateView(); notify();
    }
    function importField(key, value) {
      if (dirty[key]) return;
      fields[key].value = text(value); imported[key] = true;
    }
    function importContext() {
      if (!ready()) return;
      importField('sex', ['M', 'F'].includes(context.sex) ? context.sex : '');
      importField('birthDate', /^\d{4}-\d{2}-\d{2}$/.test(text(context.birthDateISO)) ? context.birthDateISO : '');
      if (text(fields.sampleDate.value)) return;
      importField('ageYears', context.ageYears); importField('ageMonths', context.ageMonths);
      importField('stage', context.tanner); importField('kind', 'unspecified');
      var history = context.history || {};
      importField('cnsSymptoms', flag(context.cnsSymptoms || history.cnsSymptoms)); importField('regression', flag(context.regression || history.regression));
      importField('preterm', flag(context.preterm));
      importField('context', context.gnrhaStatus === 'w-trakcie' ? 'hormonal' : 'unknown');
      // Kategoria objętości z karty nigdy nie staje się dokładnym pomiarem mL.
      var volume = context.testicularVolume;
      if (volume && typeof volume === 'object' && volume.unit === 'mL' && typeof volume.value === 'number' && Number.isFinite(volume.value)) {
        importField('testicularVolume', volume.value); importField('volumeMethod', volume.method);
      }
    }
    function updateView() {
      var current = !text(fields.sampleDate.value), years = text(fields.ageYears.value), months = text(fields.ageMonths.value);
      var ageLabel = years ? years + ' lat' + (months ? ' i ' + months + ' mies.' : '') : 'wiek niepodany';
      var input = buildInput(readFields(), { analyte: analyte, raw: lastMeasurement.raw, unit: lastMeasurement.unit });
      var resolvedAge = engine && typeof engine.resolveAge === 'function' ? engine.resolveAge(input) : null;
      if (!current && resolvedAge && resolvedAge.status === 'known' && resolvedAge.source === 'dates') ageLabel = 'wiek w dniu pobrania: ' + Math.floor(resolvedAge.lowerYears) + ' lat';
      patientSummary.textContent = ({ M: 'Chłopiec / mężczyzna', F: 'Dziewczynka / kobieta' }[fields.sex.value] || 'Płeć niepodana') + ' · ' + ageLabel;
      var kind = fields.kind.value, stageValue = fields.stage.value;
      stageSummary.textContent = kind === 'Ax' ? 'Ax — owłosienie pachowe' : stageValue ? (kind === 'unspecified' ? 'Tanner ' + ['', 'I', 'II', 'III', 'IV', 'V'][Number(stageValue)] + ' — rodzaj niepodany' : kind + stageValue) : 'Stadium niepodane';
      refineStage.textContent = stageValue && kind === 'unspecified' ? 'Doprecyzuj' : 'Zmień stadium';
      wrappers.stage.hidden = kind === 'Ax';
      stageHint.textContent = current ? 'Ocena dotyczy bieżącego kontekstu pacjenta. Nie dopisujemy daty pobrania.' : 'Podane tu stadium musi dotyczyć dnia pobrania ' + fields.sampleDate.value + '. Dzisiejszego stadium nie używamy automatycznie.';
      wrappers.ageYears.querySelector('span').textContent = current ? 'Ukończone lata' : 'Ukończone lata w dniu pobrania';
      var knownBirth = /^\d{4}-\d{2}-\d{2}$/.test(text(fields.birthDate.value));
      wrappers.birthDate.hidden = current || imported.birthDate && knownBirth;
      wrappers.ageYears.hidden = !current && knownBirth; wrappers.ageMonths.hidden = !current && knownBirth;
      dateHint.textContent = current ? 'Bez daty korzystamy z bieżącego wieku i rozwoju, bez przypisywania ich historycznej próbce.' : knownBirth ? 'Wiek obliczamy z daty urodzenia ' + fields.birthDate.value + '. Stadium i kontekst oznaczenia uzupełnij tylko, jeśli są znane dla dnia pobrania.' : 'Brak daty urodzenia. W sekcji „Pacjent” podaj wiek w dniu pobrania; dzisiejszy wiek nie jest używany.';
      var infant = resolvedAge && resolvedAge.status === 'known' && resolvedAge.lowerYears < 1;
      wrappers.preterm.hidden = !infant;
      wrappers.testicularVolume.hidden = fields.sex.value !== 'M'; wrappers.volumeMethod.hidden = fields.sex.value !== 'M';
      var profile = resolveProfile();
      var profileName = profile && profile.profile && profile.profile.method ? profile.profile.method.name : '';
      methodSummary.textContent = profileName ? fields.unknownMethod.checked ? 'Dla tego wyniku: metoda nieznana lub inna niż ustawiona.' : 'Metoda: ' + profileName + ' · ' + materialLabel(profile.specimen) : 'Metoda laboratorium nieustawiona';
      editMethod.textContent = profileName ? 'Zmień' : 'Ustaw'; wrappers.unknownMethod.hidden = !profileName;
      contextSummary.textContent = ({ 'basal-untreated': 'Bazalne · bez leczenia hormonalnego', hormonal: 'Podczas leczenia hormonalnego', stimulated: 'Po stymulacji' }[fields.context.value] || 'Rodzaj badania: nieustalony');
      editContext.textContent = fields.context.value === 'unknown' ? 'Określ' : 'Zmień';
      rangeUnit.textContent = 'Jednostka zakresu: ' + (lastMeasurement.unit || 'IU/L') + '.';
      updateContextLine();
    }
    function updateContextLine() {
      var current = !text(fields.sampleDate.value), parts = [];
      if (!ready()) parts.push(context && context.sourceStatus === 'loading' ? 'Trwa odczyt danych aktualnego pacjenta. Dane z karty są tymczasowo wyłączone z oceny.' : 'Dane z formularza głównego są niedostępne. Przeliczenie nie wymaga danych pacjenta.');
      else parts.push(current ? 'Bieżące dane z formularza głównego; korekty dotyczą tylko tego sprawdzenia.' : 'Pobranie: ' + fields.sampleDate.value + '. Dzisiejszy wiek, stadium i leczenie nie są przypisywane tej próbce.');
      var treatmentText = '';
      if (current && ready() && context.gnrhaStatus) {
        treatmentText = context.gnrhaStatus === 'zakonczone' ? 'GnRHa: zakończone. Sam status nie określa leczenia ani wpływu ostatniej dawki dla wyniku; kontekst pozostaje nieznany.' : context.gnrhaStatus === 'w-trakcie' ? 'Z karty: leczenie GnRHa w trakcie.' : context.gnrhaStatus === 'brak' ? 'Z karty: brak GnRHa; nie ustala to pozostałego leczenia hormonalnego.' : '';
        if (treatmentText) parts.push(treatmentText);
      }
      if (current && ready() && context.onset && context.onset.age && context.onset.age.years != null) parts.push('Początek ' + text(context.onset.kind) + ': ' + context.onset.age.years + ' ukończonych lat — z karty.');
      if (current && ready() && context.testicularVolume != null && typeof context.testicularVolume !== 'object') parts.push('Objętość jąder w karcie: kategoria; nie traktujemy jej jako dokładnego pomiaru mL.');
      contextLine.textContent = parts.join(' ');
      treatmentHint.textContent = treatmentText || (current ? 'Brak danych nie oznacza braku leczenia. Ustawienie metody nie ustala kontekstu hormonalnego.' : 'Odpowiedź dotyczy dnia pobrania. Leczenia z bieżącej karty nie przypisujemy starszemu wynikowi.');
    }
    function saveProfile() {
      if (!preferences) { methodNotice.textContent = 'Ustawienia metody są niedostępne.'; return; }
      try {
        var settings = preferences.read(persistence, data);
        var next = fields.configuredProfile.value ? preferences.configure(settings, analyte, fields.configuredProfile.value, data) : preferences.clear(settings, analyte, data);
        var saved = preferences.write(persistence, next, data);
        if (saved !== true) { methodNotice.textContent = 'Nie udało się zapisać ustawienia metody na tym urządzeniu.'; return; }
        fields.unknownMethod.checked = false; methodNotice.textContent = fields.configuredProfile.value ? 'Zapisano ustawienie metody dla ' + analyte.toUpperCase() + '.' : 'Usunięto ustawienie metody.';
        updateView(); notify();
      } catch (_) { methodNotice.textContent = 'Nie udało się zapisać ustawienia metody na tym urządzeniu.'; }
    }
    function setAnalyte(next) {
      next = ['lh', 'fsh'].includes(next) ? next : null;
      var changedAnalyte = next !== analyte;
      if (changedAnalyte) {
        fields.unknownMethod.checked = false; fields.reportedRange.value = ''; methodNotice.textContent = ''; evaluation = null;
        while (fields.configuredProfile.options.length > 1) fields.configuredProfile.remove(1);
        (data && Array.isArray(data.profiles) ? data.profiles : []).filter(function (profile) { return profile.active === true && profile.analyte === next; }).forEach(function (profile) {
          var option = element('option', '', profile.method.name + ' · ' + materialLabel(profile.material) + ' · Mayo ' + next.toUpperCase()); option.value = profile.id; fields.configuredProfile.appendChild(option);
        });
      }
      analyte = next; panel.hidden = !next; samplePanel.hidden = !next; assessment.hidden = !next;
      if (changedAnalyte) { var profile = resolveProfile(); fields.configuredProfile.value = profile && profile.assay ? profile.assay.profileId : ''; }
      resultSection.classList.toggle('lab-puberty-active', !!next);
      ['labResultSourceLine', 'labSourcesWrap', 'labInfoCard'].forEach(function (id) { var node = byId(id); if (node) node.classList.toggle('lab-puberty-suppressed', !!next); });
      ['labStep4', 'labStep5'].forEach(function (id) { var node = byId(id); if (node) node.classList.toggle('lab-puberty-step-active', !!next); });
      if (sampleLabel && sampleLabel.firstChild) sampleLabel.firstChild.textContent = next ? 'Badanie ' : originalSampleLabel;
      if (patientLabel && patientLabel.firstChild) patientLabel.firstChild.textContent = next ? 'Pacjent ' : originalPatientLabel;
      var valueInput = byId('labValue'); if (valueInput) valueInput.setAttribute('inputmode', next ? 'text' : 'decimal');
      if (!next) assessment.replaceChildren();
      updateView();
    }
    function reset() {
      Object.keys(fields).forEach(clearField); dirty = {}; imported = {}; evaluation = null; contextKey = null; sampleDate = '';
      lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' }; details.open = false; methodSettings.open = false;
      Object.keys(sections).forEach(function (name) { sections[name].hidden = true; sectionButtons[name].setAttribute('aria-pressed', 'false'); });
      var profile = resolveProfile(); fields.configuredProfile.value = profile && profile.assay ? profile.assay.profileId : '';
      methodNotice.textContent = ''; assessment.replaceChildren();
    }
    function setPatientContext(next) {
      next = next && typeof next === 'object' ? next : {};
      var key = JSON.stringify(next); if (contextKey === key) return;
      if (context && text(context.identityKey) !== text(next.identityKey)) {
        reset(); if (typeof opts.onPatientChange === 'function') opts.onPatientChange();
      } else {
        // Odczyt źródła lub nowa jego wersja usuwa wyłącznie importy. Ręczne
        // korekty tej samej osoby zostają, a loading/unavailable nie liczy starych danych.
        Object.keys(imported).forEach(clearField); imported = {}; evaluation = null;
      }
      context = JSON.parse(JSON.stringify(next)); contextKey = key; importContext(); updateView();
    }
    function refreshContext() {
      if (typeof opts.readPatientContext !== 'function') return false;
      var next, previousKey = contextKey;
      try { next = opts.readPatientContext(); } catch (_) { next = { identityKey: context && context.identityKey, sourceStatus: 'unavailable' }; }
      setPatientContext(next); return previousKey !== contextKey;
    }
    function render(measurement) {
      if (!analyte) return null;
      var identity = context && text(context.identityKey);
      refreshContext();
      // Zmiana pacjenta może poprzedzać zdarzenie odświeżenia formularza.
      if (identity !== (context && text(context.identityKey))) measurement = null;
      lastMeasurement = { raw: text(measurement && measurement.raw), unit: text(measurement && measurement.unit), targetUnit: text(measurement && measurement.targetUnit) };
      var input = buildInput(readFields(), { analyte: analyte, raw: lastMeasurement.raw, unit: lastMeasurement.unit });
      updateView();
      var rangeBlock = byId('labRangeBlock');
      if (rangeBlock && assessment.parentNode !== rangeBlock) rangeBlock.replaceChildren(assessment);
      var big = byId('labResultBig'), status = byId('labResultStatus');
      if (status) status.replaceChildren();
      if (!engine || typeof engine.evaluate !== 'function' || !data || !renderer) {
        evaluation = null; resultSection.classList.add('is-empty');
        if (big) big.textContent = 'Moduł oceny LH/FSH jest niedostępny. Odśwież aplikację.';
        assessment.replaceChildren(); return null;
      }
      evaluation = engine.evaluate(input, data);
      var valid = evaluation.measurement.status === 'valid';
      resultSection.classList.toggle('is-empty', !valid);
      if (big) {
        big.replaceChildren();
        if (valid) {
          var target = ['IU/L', 'mIU/mL'].includes(lastMeasurement.targetUnit) ? lastMeasurement.targetUnit : input.unit;
          // Obie obsługiwane jednostki są liczbowo równoważne. Zachowujemy zapis
          // operatora i LOD/LOQ, nie zaokrąglamy granicy wyniku cenzorowanego.
          big.appendChild(element('span', 'lab-result-big-value', evaluation.measurement.raw));
          big.appendChild(doc.createTextNode(' '));
          big.appendChild(element('span', 'lab-result-big-unit', target));
        } else big.appendChild(element('span', 'lab-result-big-placeholder', lastMeasurement.raw ? 'Nieprawidłowy zapis wyniku lub jednostki' : 'Wpisz wynik. Kontekst rozwoju możesz ocenić wcześniej.'));
      }
      renderer.renderEvaluation(assessment, evaluation, { compact: true, hideMeasurement: true });
      var table = byId('labResultsBody'), meta = byId('labMeta');
      if (table) {
        table.replaceChildren();
        ['IU/L', 'mIU/mL'].filter(function (unit) { return unit !== input.unit; }).forEach(function (unit) {
          var row = element('tr', valid ? '' : 'lab-row-placeholder');
          row.appendChild(element('td', 'lab-unit', unit));
          var cell = element('td', 'lab-value', valid ? evaluation.measurement.raw : '—');
          if (valid) {
            cell.setAttribute('role', 'button'); cell.setAttribute('tabindex', '0');
            cell.setAttribute('aria-label', 'Skopiuj: ' + evaluation.measurement.raw + ' ' + unit);
            cell.dataset.copyText = evaluation.measurement.raw + ' ' + unit;
          }
          row.appendChild(cell); table.appendChild(row);
        });
      }
      if (meta) meta.textContent = 'IU/L i mIU/mL są liczbowo równoważne. Równość jednostek nie potwierdza zgodności metod oznaczenia.';
      return evaluation;
    }
    function getAssessment(result) {
      if (!analyte) return undefined;
      if (result && result.testKey !== analyte) return { schemaVersion: 1, status: 'unavailable', reasonCodes: ['snapshot_result_mismatch'], evaluation: null };
      // Odczyt pól przy otwarciu przypięcia zamyka również okno pomiędzy edycją
      // DOM a eventem change. Snapshot nie zależy od późniejszych zmian pól.
      var current = render(result ? { raw: result.raw, unit: result.unit, targetUnit: lastMeasurement.targetUnit } : lastMeasurement);
      if (!current || !snapshots || typeof snapshots.create !== 'function') return { schemaVersion: 1, status: 'unavailable', reasonCodes: ['snapshot_helper_unavailable'], evaluation: null };
      return snapshots.create(current);
    }
    return { setAnalyte: setAnalyte, setPatientContext: setPatientContext, render: render, getAssessment: getAssessment, reset: reset };
  }

  var api = { version: '1.2.0', buildInput: buildInput, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaLabPubertyUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
