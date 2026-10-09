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
  function pubertyKind(value) {
    return ({ TH: 'Th', M: 'Th', B: 'Th', G: 'G', P: 'P', PH: 'P', AX: 'Ax' })[text(value).toUpperCase()] || 'unspecified';
  }
  function sexAllowsKind(sex, kind) {
    return kind === 'Th' ? sex === 'F' : kind === 'G' ? sex === 'M' : true;
  }
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
  function dayInterval(value) {
    if (!value || typeof value !== 'object') return null;
    return { lower: typeof value.lower === 'number' ? value.lower : null,
      upper: typeof value.upper === 'number' ? value.upper : null, source: text(value.source) };
  }
  function parseGestationalAge(value) {
    var raw = text(value); if (!raw) return null;
    var match = raw.match(/^(\d{1,2})(?:\s*\+\s*([0-6]))?$/);
    if (!match) return { lower: null, upper: null, source: 'manual-gestational-age' };
    var days = Number(match[1]) * 7 + Number(match[2] || 0);
    return { lower: days, upper: days + (match[2] == null ? 6 : 0), source: 'manual-gestational-age' };
  }
  function parsePostnatalDays(value) {
    var raw = text(value); if (!raw) return null;
    var days = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
    return { lower: days, upper: days, source: 'manual-completed-days' };
  }
  function knownDays(value) {
    return !!value && Number.isSafeInteger(value.lower) && Number.isSafeInteger(value.upper) && value.lower >= 0 && value.upper >= value.lower;
  }
  function weekLabel(days) { return Math.floor(days / 7) + '+' + days % 7; }
  function intervalLabel(value, format) {
    if (!knownDays(value)) return '';
    var label = format || String;
    return label(value.lower) + (value.lower === value.upper ? '' : '–' + label(value.upper));
  }

  // Whitelist pól formularza, bez dat domyślnych i bez domniemanego Th/G.
  // Części wieku zachowują rzeczywistą precyzję. Silnik rozstrzyga poprawność.
  function buildInput(fields, measurement) {
    var f = fields || {}, m = measurement || {};
    var sex = ['M', 'F'].includes(f.sex) ? f.sex : null;
    var kind = pubertyKind(f.kind), onsetKind = pubertyKind(f.onsetKind);
    var validKind = !text(f.kind) || text(f.kind).toLowerCase() === 'unspecified' || kind !== 'unspecified';
    var compatibleKind = validKind && sexAllowsKind(sex, kind), compatibleOnset = sexAllowsKind(sex, onsetKind);
    var male = sex === 'M';
    var input = {
      analyte: text(m.analyte), value: text(m.raw), unit: text(m.unit),
      sex: sex,
      birthDateISO: text(f.birthDate) || null, sampleDateISO: text(f.sampleDate) || null,
      age: age(f, 'age'), specimen: text(f.specimen) || 'unknown',
      measurementKind: text(f.measurementKind) || 'unknown',
      assay: { profileId: text(f.profile), methodId: text(f.method), confirmation: f.methodConfirmed === true ? 'reported' : 'unknown' },
      puberty: {
        kind: compatibleKind ? kind : 'unspecified', stage: !compatibleKind || kind === 'Ax' ? null : number(f.stage),
        assessedAtISO: compatibleKind ? text(f.assessedAt) || null : null, appliesToSample: compatibleKind && f.appliesToSample === true,
        source: compatibleKind ? text(f.observationSource) || 'provided' : 'provided'
      },
      testicularVolume: {
        value: male ? number(f.testicularVolume) : null, unit: 'mL', method: male ? text(f.volumeMethod) : '',
        assessedAtISO: male ? text(f.volumeAssessedAt) || null : null, appliesToSample: male && f.volumeAppliesToSample === true
      },
      onset: { kind: compatibleOnset ? onsetKind : 'unspecified', dateISO: compatibleOnset ? text(f.onsetDate) || null : null,
        age: compatibleOnset ? age(f, 'onsetAge') : null, confirmedPubertalOnset: compatibleOnset && f.onsetConfirmed === true },
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
        input.puberty.appliesToCurrentContext = compatibleKind; input.testicularVolume.appliesToCurrentContext = male;
      } else {
        input.puberty.appliesToSample = compatibleKind; input.testicularVolume.appliesToSample = male;
      }
      input.treatment.context = ['none', 'hormonal'].includes(f.treatmentContext) ? f.treatmentContext : 'unknown';
      if (f.configuredAssay && typeof f.configuredAssay === 'object') input.assay = {
        profileId: text(f.configuredAssay.profileId), profileVersion: text(f.configuredAssay.profileVersion),
        methodId: text(f.configuredAssay.methodId), confirmation: 'configured'
      };
      if (text(f.reportedRange)) input.reportedRange = { text: text(f.reportedRange), unit: input.unit };
    }
    if (f.neonatalAge && typeof f.neonatalAge === 'object') input.neonatalAge = {
      postnatalDays: dayInterval(f.neonatalAge.postnatalDays), gestationalDays: dayInterval(f.neonatalAge.gestationalDays)
    };
    if (f.useNeonatalAge === true && input.neonatalAge && knownDays(input.neonatalAge.postnatalDays)) input.age = null;
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
    var analyte = null, evaluation = null, context = null, contextKey = null;
    var lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
    var dirty = {}, imported = {}, kindOptionsSex = null, omittedSexContext = false, suspendedSexFields = null;
    var neonatalEdit = false;
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
    var editPatient = button(patientRow, 'labPubertyEditPatient', 'Zmień', function () {
      if (neonatalContext()) {
        neonatalEdit = !neonatalEdit;
        if (!neonatalEdit && !sections.patient.hidden) { sections.patient.hidden = true; sectionButtons.patient.setAttribute('aria-pressed', 'false'); details.open = false; }
        else if (neonatalEdit) openSection('patient');
        updateView();
      } else openSection('patient');
    });
    editPatient.setAttribute('aria-label', 'Zmień dane pacjenta');
    editPatient.setAttribute('aria-controls', 'labPubertySectionPatient');
    var stageRow = element('div', 'lab-puberty-summary-row lab-puberty-stage-row'); panel.appendChild(stageRow);
    var stageSummary = element('span'); stageSummary.id = 'labPubertyStageSummary'; stageRow.appendChild(stageSummary);
    var refineStage = button(stageRow, 'labPubertyRefineStage', 'Doprecyzuj', function () { openSection('stage'); });
    refineStage.setAttribute('aria-controls', 'labPubertySectionStage');
    var contextLine = element('p', 'lab-puberty-hint'); contextLine.id = 'labPubertyPatientContext'; panel.appendChild(contextLine);
    var neonatalSummary = element('p', 'lab-puberty-neonatal-summary'); neonatalSummary.id = 'labPubertyNeonatalSummary'; neonatalSummary.hidden = true; panel.insertBefore(neonatalSummary, contextLine);
    var neonatalFields = element('div', 'lab-puberty-fields lab-puberty-neonatal-fields'); neonatalFields.id = 'labPubertyNeonatalFields'; neonatalFields.hidden = true; panel.appendChild(neonatalFields);
    var assessment = element('div', 'lab-puberty-assessment-host'); assessment.id = 'labPubertyAssessment'; assessment.hidden = true;
    var samplePanel = element('section', 'lab-puberty-panel'); samplePanel.id = 'labPubertySamplePanel'; samplePanel.hidden = true;
    samplePanel.setAttribute('aria-label', 'Szczegóły LH i FSH'); sampleBody.appendChild(samplePanel);
    var sampleLabel = sampleBody.querySelector('.lab-step-label'), patientLabel = patientBody.querySelector('.lab-step-label');
    var originalSampleLabel = sampleLabel && sampleLabel.firstChild && sampleLabel.firstChild.textContent;
    var originalPatientLabel = patientLabel && patientLabel.firstChild && patientLabel.firstChild.textContent;
    var methodRow = element('div', 'lab-puberty-summary-row'); samplePanel.appendChild(methodRow);
    var methodSummary = element('span', 'lab-puberty-method-summary'); methodSummary.id = 'labPubertyMethodSummary'; methodRow.appendChild(methodSummary);
    var editMethod = button(methodRow, 'labPubertyEditMethod', 'Ustaw', function () { methodSettings.open = !methodSettings.open; updateView(); });
    editMethod.setAttribute('aria-controls', 'labPubertyMethodSettings');
    var methodSettings = element('details', 'lab-puberty-details'); methodSettings.id = 'labPubertyMethodSettings';
    methodSettings.addEventListener('toggle', function () { updateView(); });
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
    var interpretationScope = element('p', 'lab-puberty-hint', 'Interpretacja dotyczy wyłącznie oznaczeń bazalnych bez leczenia hormonalnego. Wyników po stymulacji nie oceniamy.');
    interpretationScope.id = 'labPubertyScope'; samplePanel.appendChild(interpretationScope);
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
    field(patient, 'preterm', 'Urodzenie przedwcześnie', 'select', tri);
    field(neonatalFields, 'gestationalAge', 'Wiek ciążowy przy urodzeniu', 'text', null, { placeholder: 'np. 28+4', inputmode: 'text' });
    field(neonatalFields, 'postnatalDays', 'Ukończone dni życia', 'text', null, { placeholder: 'np. 43', inputmode: 'numeric' });
    ['gestationalAge', 'postnatalDays'].forEach(function (key) {
      fields[key].addEventListener('blur', function () { updateView(); notify(); });
    });
    var stage = section('stage', 'Stadium', 'Sam numer Tannera nie określa cechy. P i Ax nie zastępują rozwoju gonadalnego.');
    var kindChoices = [['unspecified', 'Nie określono'], ['Th', 'Th/M — rozwój piersi'], ['G', 'G — narządy płciowe'], ['P', 'P — owłosienie łonowe'], ['Ax', 'Ax — owłosienie pachowe']];
    field(stage, 'kind', 'Rodzaj cechy', 'select', kindChoices);
    field(stage, 'stage', 'Stadium', 'select', [['', 'Nie podano'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]);
    var stageHint = element('p', 'lab-puberty-hint'); stageHint.id = 'labPubertyStageHint'; sections.stage.appendChild(stageHint);

    function materialLabel(value) { return ({ serum: 'surowica', plasma: 'osocze', urine: 'mocz' }[value] || text(value)); }
    function ready() { return !!context && context.sourceStatus === 'ready'; }
    function resolveProfile() {
      if (!preferences || typeof preferences.resolve !== 'function' || !analyte) return null;
      try { return preferences.resolve(preferences.read(persistence, data), analyte, data); } catch (_) { return null; }
    }
    function neonatalValues() {
      var source = ready() && context.neonatalAge || {};
      return {
        gestationalDays: dirty.gestationalAge ? parseGestationalAge(fields.gestationalAge.value) : dayInterval(source.gestationalDays),
        postnatalDays: dirty.postnatalDays ? parsePostnatalDays(fields.postnatalDays.value) : dayInterval(source.postnatalDays)
      };
    }
    function neonatalContext() {
      if (fields.preterm.value !== 'yes') return false;
      var policy = data && data.pretermEligibilityPolicy;
      var maximum = policy && policy.postmenstrualAgeDays && policy.postmenstrualAgeDays.upper && policy.gestationalAgeDays && policy.gestationalAgeDays.lower ? policy.postmenstrualAgeDays.upper.value - policy.gestationalAgeDays.lower.value : null;
      if (!Number.isFinite(maximum)) return false;
      var years = number(fields.ageYears.value), months = number(fields.ageMonths.value);
      if (years != null && (!Number.isInteger(years) || years < 0) || months != null && (!Number.isInteger(months) || months < 0 || months > 11)) return false;
      if (years != null && years >= 1 || months != null && months / 12 > (maximum + 1) / 365) return false;
      if (doc.activeElement === fields.gestationalAge || doc.activeElement === fields.postnatalDays) return true;
      var neonatal = neonatalValues();
      if (knownDays(neonatal.postnatalDays)) return neonatal.postnatalDays.lower <= maximum;
      if (neonatalEdit) return true;
      if (years === 0 && months != null && months >= 0 && months / 12 <= (maximum + 1) / 365) return true;
      var profile = resolveProfile();
      return !!(profile && profile.profile && profile.profile.scope && profile.profile.scope.age && profile.profile.scope.age.axis === 'postmenstrualDays');
    }
    function readFields() {
      var values = {};
      Object.keys(fields).forEach(function (key) { values[key] = fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value; });
      var profile = !values.unknownMethod && resolveProfile();
      values.contextBasis = 'current-patient';
      values.observationSource = imported.stage ? 'patient-record' : 'provided';
      if (profile && profile.assay) { values.configuredAssay = profile.assay; values.specimen = profile.specimen; }
      values.gnrha = ready() ? ({ brak: 'no', 'w-trakcie': 'yes' }[context.gnrhaStatus] || 'unknown') : 'unknown';
      // Zakres działania modułu nie potwierdza rodzaju konkretnego oznaczenia
      // ani braku leczenia. Znane bieżące GnRHa nadal wyklucza zakresy bazalne.
      values.sexSteroids = 'unknown'; values.treatmentContext = values.gnrha === 'yes' ? 'hormonal' : 'unknown'; values.measurementKind = 'unknown';
      var neonatal = neonatalValues();
      if (neonatalContext() || neonatal.gestationalDays || neonatal.postnatalDays) values.neonatalAge = neonatal;
      values.useNeonatalAge = neonatalContext() && knownDays(neonatal.postnatalDays);
      if (ready()) {
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
    function clearIncompatible(key) {
      clearField(key); delete imported[key]; dirty[key] = true;
    }
    function setKindOptions(sex, kind) {
      // Usuwamy niedostępne opcje z DOM: ukryte option nie są respektowane
      // jednakowo przez natywne listy wyboru na urządzeniach mobilnych.
      if (kindOptionsSex !== sex) {
        fields.kind.replaceChildren();
        kindChoices.filter(function (choice) { return sexAllowsKind(sex, choice[0]); }).forEach(function (choice) {
          var option = element('option', '', choice[1]); option.value = choice[0]; fields.kind.appendChild(option);
        });
        fields.kind.value = kind; kindOptionsSex = sex;
      }
    }
    function syncSexFields() {
      var sex = fields.sex.value, kind = fields.kind.value || 'unspecified';
      if (!sexAllowsKind(sex, pubertyKind(kind))) {
        clearIncompatible('kind'); clearIncompatible('stage');
        kind = 'unspecified'; omittedSexContext = true;
      }
      setKindOptions(sex, kind);
      var ax = fields.kind.value === 'Ax';
      if (ax && fields.stage.value) clearIncompatible('stage');
      wrappers.stage.hidden = ax; fields.stage.disabled = ax;
    }
    function suspendManualSexFields(next) {
      if (suspendedSexFields || next.sourceStatus === 'ready' || !imported.sex || !['M', 'F'].includes(fields.sex.value)) return;
      var saved = {};
      if (dirty.kind && ['Th', 'G'].includes(fields.kind.value)) {
        saved.kind = fields.kind.value;
        if (dirty.stage) saved.stage = fields.stage.value;
        clearField('kind'); clearField('stage');
      }
      if (Object.keys(saved).length) suspendedSexFields = { sex: fields.sex.value, values: saved };
    }
    function resumeManualSexFields() {
      if (!suspendedSexFields || !ready()) return;
      var saved = suspendedSexFields; suspendedSexFields = null;
      if (fields.sex.value !== saved.sex) {
        Object.keys(saved.values).forEach(clearIncompatible);
        if (saved.values.kind) clearIncompatible('stage');
        omittedSexContext = true; return;
      }
      setKindOptions(fields.sex.value, fields.kind.value || 'unspecified');
      Object.keys(saved.values).forEach(function (key) { fields[key].value = saved.values[key]; });
    }
    function changed(key) {
      if (key === 'configuredProfile') return;
      if (suspendedSexFields) {
        if (key === 'sex') suspendedSexFields = null;
        else if (key === 'kind' || key === 'stage') { delete suspendedSexFields.values.kind; delete suspendedSexFields.values.stage; }
      }
      delete imported[key]; dirty[key] = true; evaluation = null;
      if (key === 'ageYears' || key === 'ageMonths') {
        clearField('postnatalDays'); delete imported.postnatalDays; dirty.postnatalDays = true;
        neonatalEdit = false;
      }
      if (key === 'postnatalDays') {
        ['ageYears', 'ageMonths'].forEach(function (ageKey) { clearField(ageKey); delete imported[ageKey]; dirty[ageKey] = true; });
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
      importField('ageYears', context.ageYears); importField('ageMonths', context.ageMonths);
      importField('stage', context.tanner); importField('kind', 'unspecified');
      importField('preterm', flag(context.preterm));
      var neonatal = context.neonatalAge || {}, gestational = neonatal.gestationalDays, postnatal = neonatal.postnatalDays;
      importField('gestationalAge', knownDays(gestational) ? gestational.lower === gestational.upper ? weekLabel(gestational.lower) : gestational.lower % 7 === 0 && gestational.upper === gestational.lower + 6 ? Math.floor(gestational.lower / 7) : '' : '');
      importField('postnatalDays', knownDays(postnatal) && postnatal.lower === postnatal.upper ? postnatal.lower : '');
    }
    function updateView() {
      syncSexFields();
      var years = text(fields.ageYears.value), months = text(fields.ageMonths.value);
      var ageLabel = years ? years + ' lat' + (months ? ' i ' + months + ' mies.' : '') : 'wiek niepodany';
      var input = buildInput(readFields(), { analyte: analyte, raw: lastMeasurement.raw, unit: lastMeasurement.unit });
      var resolvedAge = engine && typeof engine.resolveAge === 'function' ? engine.resolveAge(input) : null;
      var neonatalMode = neonatalContext(), neonatal = neonatalValues();
      if (neonatalMode) ageLabel = knownDays(neonatal.postnatalDays) ? intervalLabel(neonatal.postnatalDays) + (neonatal.postnatalDays.lower === 1 && neonatal.postnatalDays.upper === 1 ? ' ukończony dzień' : ' dni życia') : 'wiek do uzupełnienia';
      else if (!years && knownDays(neonatal.postnatalDays)) ageLabel = intervalLabel(neonatal.postnatalDays) + ' dni życia';
      patientSummary.textContent = (neonatalMode ? { M: 'Chłopiec', F: 'Dziewczynka' } : { M: 'Chłopiec / mężczyzna', F: 'Dziewczynka / kobieta' })[fields.sex.value] + ' · ' + ageLabel;
      if (!['M', 'F'].includes(fields.sex.value)) patientSummary.textContent = 'Płeć niepodana · ' + ageLabel;
      var kind = fields.kind.value, stageValue = fields.stage.value;
      stageSummary.textContent = kind === 'Ax' ? 'Ax — owłosienie pachowe' : stageValue ? (kind === 'unspecified' ? 'Tanner ' + ['', 'I', 'II', 'III', 'IV', 'V'][Number(stageValue)] + ' — rodzaj niepodany' : kind + stageValue) : 'Stadium niepodane';
      refineStage.textContent = stageValue && kind === 'unspecified' ? 'Doprecyzuj' : 'Zmień stadium';
      stageHint.textContent = (['M', 'F'].includes(fields.sex.value) ? '' : 'Wybierz płeć, aby wskazać Th/M lub G. ') + 'Ocena dotyczy bieżącego kontekstu pacjenta.';
      var infant = resolvedAge && resolvedAge.status === 'known' && resolvedAge.lowerYears < 1;
      wrappers.preterm.hidden = !infant && !neonatalMode;
      stageRow.hidden = neonatalMode; sectionButtons.stage.hidden = neonatalMode;
      if (neonatalMode) { sections.stage.hidden = true; sectionButtons.stage.setAttribute('aria-pressed', 'false'); }
      updateNeonatalView(neonatalMode, neonatal);
      var profile = resolveProfile();
      var profileName = profile && profile.profile && profile.profile.method ? profile.profile.method.name : '';
      methodSummary.textContent = profileName ? fields.unknownMethod.checked ? 'Dla tego wyniku: metoda nieznana lub inna niż ustawiona.' : 'Metoda: ' + profileName + ' · ' + materialLabel(profile.specimen) : 'Metoda laboratorium nieustawiona';
      editMethod.textContent = neonatalMode && methodSettings.open ? 'Zamknij' : profileName ? 'Zmień' : 'Ustaw'; wrappers.unknownMethod.hidden = !profileName;
      editMethod.setAttribute('aria-label', neonatalMode && methodSettings.open ? 'Zamknij ustawienie metody' : editMethod.textContent + ' metodę oznaczenia');
      editMethod.setAttribute('aria-expanded', String(methodSettings.open));
      updateContextLine();
    }
    function updateNeonatalView(active, neonatal) {
      var ga = neonatal.gestationalDays, pna = neonatal.postnatalDays;
      var gaKnown = knownDays(ga), pnaKnown = knownDays(pna), pma = gaKnown && pnaKnown ? { lower: ga.lower + pna.lower, upper: ga.upper + pna.upper } : null;
      var policy = data && data.pretermEligibilityPolicy, gaBounds = policy && policy.gestationalAgeDays;
      var pmaLimit = policy && policy.postmenstrualAgeDays && policy.postmenstrualAgeDays.upper && policy.postmenstrualAgeDays.upper.value;
      var pmaUncertain = pma && pma.lower <= pmaLimit && pma.upper > pmaLimit;
      var refineGa = gaKnown && gaBounds && gaBounds.lower && gaBounds.upper && (ga.lower < gaBounds.lower.value && ga.upper >= gaBounds.lower.value || ga.lower <= gaBounds.upper.value && ga.upper > gaBounds.upper.value || pmaUncertain && ga.lower !== ga.upper);
      var refinePna = pnaKnown && (pna.lower === 0 && pna.upper > 0 || pmaUncertain && pna.lower !== pna.upper);
      wrappers.ageYears.hidden = active; wrappers.ageMonths.hidden = active;
      if (active && sections.patient.parentNode !== panel) {
        neonatalEdit = !sections.patient.hidden;
        panel.insertBefore(sections.patient, neonatalFields);
      }
      else if (!active && sections.patient.parentNode !== details) {
        details.appendChild(sections.patient); sections.patient.hidden = true; neonatalEdit = false;
        sectionButtons.patient.setAttribute('aria-pressed', 'false');
      }
      details.hidden = active;
      samplePanel.classList.toggle('lab-puberty-neonatal', active);
      if (active && wrappers.unknownMethod.parentNode !== methodSettings) methodSettings.insertBefore(wrappers.unknownMethod, byId('labPubertySaveProfile'));
      else if (!active && wrappers.unknownMethod.parentNode !== samplePanel) samplePanel.insertBefore(wrappers.unknownMethod, interpretationScope);
      wrappers.gestationalAge.hidden = !active || !(neonatalEdit || !gaKnown || refineGa || doc.activeElement === fields.gestationalAge);
      wrappers.postnatalDays.hidden = !active || !(neonatalEdit || !pnaKnown || refinePna || doc.activeElement === fields.postnatalDays);
      neonatalFields.hidden = wrappers.gestationalAge.hidden && wrappers.postnatalDays.hidden;
      fields.gestationalAge.setAttribute('aria-invalid', String(!!ga && !gaKnown));
      fields.postnatalDays.setAttribute('aria-invalid', String(!!pna && !pnaKnown));
      fields.gestationalAge.placeholder = gaKnown ? intervalLabel(ga, weekLabel) + ' tyg.' : 'np. 28+4';
      fields.postnatalDays.placeholder = pnaKnown ? intervalLabel(pna) + ' dni' : 'np. 43';
      neonatalSummary.hidden = !active || !gaKnown;
      neonatalSummary.textContent = gaKnown ? 'Urodzon' + (fields.sex.value === 'F' ? 'a' : 'y') + ' w ' + intervalLabel(ga, weekLabel) + ' tyg.' + (pma ? ' · PMA ' + intervalLabel(pma, weekLabel) + ' tyg.' : '') : '';
      editPatient.textContent = active && neonatalEdit ? 'Gotowe' : 'Zmień';
      editPatient.setAttribute('aria-expanded', String(active ? neonatalEdit : details.open && !sections.patient.hidden));
      editPatient.setAttribute('aria-label', active && neonatalEdit ? 'Zakończ zmianę danych pacjenta' : 'Zmień dane pacjenta');
      panel.classList.toggle('lab-puberty-neonatal', active);
    }
    function updateContextLine() {
      var parts = [], neonatalMode = neonatalContext();
      if (!ready()) parts.push(context && context.sourceStatus === 'loading' ? 'Trwa odczyt danych aktualnego pacjenta. Dane z karty są tymczasowo wyłączone z oceny.' : 'Dane z formularza głównego są niedostępne. Przeliczenie nie wymaga danych pacjenta.');
      else if (!neonatalMode) parts.push('Ocena według wieku i stadium widocznych w formularzu, bez odtwarzania kontekstu wcześniejszej próbki.');
      if (ready() && context.gnrhaStatus && (!neonatalMode || context.gnrhaStatus === 'w-trakcie')) {
        var treatmentText = context.gnrhaStatus === 'zakonczone' ? 'GnRHa: zakończone. Sam status nie określa leczenia ani wpływu ostatniej dawki dla wyniku; kontekst pozostaje nieznany.' : context.gnrhaStatus === 'w-trakcie' ? 'Z karty: leczenie GnRHa w trakcie.' : context.gnrhaStatus === 'brak' ? 'Z karty: brak GnRHa; nie ustala to pozostałego leczenia hormonalnego.' : '';
        if (treatmentText) parts.push(treatmentText);
      }
      var onset = ready() && context.onset;
      var incompatibleOnset = onset && !sexAllowsKind(fields.sex.value, pubertyKind(onset.kind));
      if (onset && !incompatibleOnset && onset.age && onset.age.years != null) parts.push('Początek ' + text(onset.kind) + ': ' + onset.age.years + ' ukończonych lat — z karty.');
      if (omittedSexContext || incompatibleOnset) parts.push('Pominięto wcześniejsze cechy niezgodne z wybraną płcią.');
      contextLine.textContent = parts.join(' ');
      contextLine.hidden = !parts.length;
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
        fields.unknownMethod.checked = false; methodNotice.textContent = ''; evaluation = null;
        while (fields.configuredProfile.options.length > 1) fields.configuredProfile.remove(1);
        (data && Array.isArray(data.profiles) ? data.profiles : []).filter(function (profile) { return profile.active === true && profile.analyte === next; }).forEach(function (profile) {
          var pretermProfile = profile.scope && profile.scope.age && profile.scope.age.axis === 'postmenstrualDays';
          var option = element('option', '', profile.method.name + ' · ' + materialLabel(profile.material) + (pretermProfile ? ' · wcześniaki' : '')); option.value = profile.id; fields.configuredProfile.appendChild(option);
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
      Object.keys(fields).forEach(clearField); dirty = {}; imported = {}; evaluation = null; contextKey = null; omittedSexContext = false; suspendedSexFields = null; neonatalEdit = false;
      lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' }; details.open = false; methodSettings.open = false;
      Object.keys(sections).forEach(function (name) { sections[name].hidden = true; sectionButtons[name].setAttribute('aria-pressed', 'false'); });
      var profile = resolveProfile(); fields.configuredProfile.value = profile && profile.assay ? profile.assay.profileId : '';
      methodNotice.textContent = ''; assessment.replaceChildren(); syncSexFields();
    }
    function setPatientContext(next) {
      next = next && typeof next === 'object' ? next : {};
      var key = JSON.stringify(next); if (contextKey === key) return;
      if (context && text(context.identityKey) !== text(next.identityKey)) {
        reset(); if (typeof opts.onPatientChange === 'function') opts.onPatientChange();
      } else {
        // Odczyt źródła lub nowa jego wersja usuwa wyłącznie importy. Ręczne
        // korekty tej samej osoby zostają, a loading/unavailable nie liczy starych danych.
        // Ręczna obserwacja tej samej osoby czeka poza formularzem i oceną
        // na powrót płci ze źródła. Zmiana płci lub osoby nigdy jej nie przywraca.
        suspendManualSexFields(next);
        Object.keys(imported).forEach(clearField); imported = {}; evaluation = null;
      }
      context = JSON.parse(JSON.stringify(next)); contextKey = key; importContext(); resumeManualSexFields(); updateView();
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
      updateView();
      var input = buildInput(readFields(), { analyte: analyte, raw: lastMeasurement.raw, unit: lastMeasurement.unit });
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
      // Wspólny model prezentacji wyprowadza wyróżnienie z obu zapisanych
      // porównań. Formularz nie oblicza ponownie progów ani zakresów.
      var view = renderer.renderEvaluation(assessment, evaluation, {
        compact: true, hideMeasurement: true, live: true, pretermContextMode: neonatalContext()
      });
      interpretationScope.hidden = !!(view && view.pretermProfile && view.conditionNote);
      if (big) {
        big.replaceChildren();
        if (valid) {
          var target = ['IU/L', 'mIU/mL'].includes(lastMeasurement.targetUnit) ? lastMeasurement.targetUnit : input.unit;
          // Obie obsługiwane jednostki są liczbowo równoważne. Zachowujemy zapis
          // operatora i LOD/LOQ, nie zaokrąglamy granicy wyniku cenzorowanego.
          var visualState = view && view.valid && view.result ? view.result.visualState : '';
          var allowedState = ['is-uwaga-high', 'is-uwaga-low', 'is-above', 'is-below'].includes(visualState) ? visualState : '';
          big.appendChild(element('span', 'lab-result-big-value' + (allowedState ? ' ' + allowedState : ''), evaluation.measurement.raw));
          big.appendChild(doc.createTextNode(' '));
          big.appendChild(element('span', 'lab-result-big-unit', target));
          var alert = view && view.valid && view.result && view.result.visualAlert;
          if (alert) {
            var summary = element('div', 'vilda-lab-severity-summary ' + allowedState);
            summary.appendChild(element('strong', 'vilda-lab-severity-summary-title', alert.label));
            summary.appendChild(element('span', 'vilda-lab-severity-summary-scope', alert.scope + (alert.conditional ? ' · warunkowo' : '')));
            big.appendChild(summary);
          }
        } else big.appendChild(element('span', 'lab-result-big-placeholder', lastMeasurement.raw ? 'Popraw zapis wyniku lub jednostkę.' : 'Wpisz wynik.'));
      }
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
    syncSexFields();
    return { setAnalyte: setAnalyte, setPatientContext: setPatientContext, render: render, getAssessment: getAssessment, reset: reset };
  }

  var api = { version: '1.11.0', buildInput: buildInput, parseGestationalAge: parseGestationalAge, parsePostnatalDays: parsePostnatalDays, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaLabPubertyUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
