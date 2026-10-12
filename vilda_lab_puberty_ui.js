/* Kontekst pojedynczego oznaczenia. Ten formularz niczego nie zapisuje
 * w danych pacjenta. Interpretację wykonuje silnik wybranego analitu; widok
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
    if (f.referenceSelection === 'automatic') {
      input.referenceSelection = 'automatic';
      input.reproductiveContext = sex === 'F' && ['follicular', 'ovulation', 'luteal', 'postmenopause'].includes(f.reproductiveContext) ? f.reproductiveContext : 'unknown';
      input.assay = { profileId: '', methodId: '', confirmation: 'unknown' };
    }
    return input;
  }

  function mount(options) {
    var opts = options || {}, doc = opts.document || root.document;
    if (!doc) return null;
    var pubertyEngine = opts.engine || root.VildaLabPuberty, pubertyData = opts.data || root.VildaLabPubertyData;
    var engine = pubertyEngine, data = pubertyData;
    var snapshots = opts.snapshot || root.VildaLabSnapshot;
    var renderer = opts.renderer || root.VildaLabAssessmentUI;
    var byId = function (id) { return doc.getElementById(id); };
    var resultSection = byId('labResultSection');
    var patientBody = byId('labStep5') && byId('labStep5').querySelector('.lab-step-body');
    var sampleBody = byId('labStep4') && byId('labStep4').querySelector('.lab-step-body');
    if (!resultSection || !patientBody || !sampleBody) return null;
    var fields = {}, wrappers = {}, sections = {}, sectionButtons = {};
    var analyte = null, evaluation = null, context = null, contextKey = null;
    var lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
    var dirty = {}, imported = {}, kindOptionsSex = null, omittedSexContext = false, suspendedSexFields = null;
    var neonatalEdit = false, reproductiveSex = null;
    function isInhibin() { return analyte === 'inhibin_b'; }
    function units() { return isInhibin() ? ['pg/mL', 'ng/L'] : ['IU/L', 'mIU/mL']; }
    function stageReferencesAvailable() { return !(data && data.presentationPolicy && data.presentationPolicy.stageReferencesAvailable === false); }
    function infantAgeLimit() { return data && data.presentationPolicy && data.presentationPolicy.infantAgeUpperYears; }
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
    var patientLabel = patientBody.querySelector('.lab-step-label');
    var originalPatientLabel = patientLabel && patientLabel.firstChild && patientLabel.firstChild.textContent;
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
    var details = element('details', 'lab-puberty-details'); details.id = 'labPubertyDetails';
    var detailsSummary = element('summary', '', 'Dane pacjenta'); detailsSummary.hidden = true; details.appendChild(detailsSummary);
    var actions = element('div', 'lab-puberty-detail-actions'); actions.hidden = true; details.appendChild(actions); panel.appendChild(details);
    function section(name, title, hint) {
      sectionButtons[name] = button(actions, 'labPubertyOpen' + name.charAt(0).toUpperCase() + name.slice(1), title, function () { openSection(name); });
      sectionButtons[name].setAttribute('aria-pressed', 'false');
      var sectionNode = element('section', 'lab-puberty-detail-section'); sectionNode.id = 'labPubertySection' + name.charAt(0).toUpperCase() + name.slice(1); sectionNode.hidden = true;
      sectionNode.appendChild(element('h3', '', title));
      if (hint) sectionNode.appendChild(element('p', 'lab-puberty-hint', hint));
      var grid = element('div', 'lab-puberty-fields'); sectionNode.appendChild(grid); details.appendChild(sectionNode); sections[name] = sectionNode; return grid;
    }
    function openSection(name) {
      details.open = !details.open || sections[name].hidden;
      Object.keys(sections).forEach(function (key) { sections[key].hidden = key !== name; sectionButtons[key].setAttribute('aria-pressed', String(key === name)); });
      updateView();
    }
    var tri = [['unknown', 'Nie wiadomo'], ['no', 'Nie'], ['yes', 'Tak']];
    var patient = section('patient', 'Pacjent', 'Dane z formularza głównego wczytują się automatycznie. Korekta dotyczy tylko tego sprawdzenia.');
    field(patient, 'sex', 'Płeć', 'select', [['', 'Nie podano'], ['F', 'Dziewczynka / kobieta'], ['M', 'Chłopiec / mężczyzna']]);
    field(patient, 'ageYears', 'Ukończone lata', 'number', null, { min: '0', max: '120', step: '1' });
    field(patient, 'ageMonths', 'Dodatkowe miesiące — jeśli znane', 'number', null, { min: '0', max: '11', step: '1' });
    field(patient, 'preterm', 'Urodzenie przedwcześnie', 'select', tri);
    fields.preterm.addEventListener('blur', function () { if (isInhibin()) updateView(); });
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
    var reproductiveChoices = [['unknown', 'Nie ustalono'], ['follicular', 'Faza folikularna'], ['ovulation', 'Okres okołoowulacyjny'], ['luteal', 'Faza lutealna'], ['postmenopause', 'Po menopauzie']];
    field(panel, 'reproductiveContext', 'Cykl / menopauza', 'select', reproductiveChoices);
    wrappers.reproductiveContext.classList.add('lab-puberty-cycle-field'); wrappers.reproductiveContext.hidden = true;

    function ready() { return !!context && context.sourceStatus === 'ready'; }
    function adultAgeState(value) {
      var profile = data && Array.isArray(data.profiles) && data.profiles.find(function (candidate) { return candidate.active === true && candidate.referenceContext === 'adult' && (!analyte || candidate.analyte === analyte) && (!candidate.scope || !candidate.scope.sex || candidate.scope.sex === fields.sex.value); });
      var lower = profile && profile.scope && profile.scope.age && profile.scope.age.lower;
      if (!value || value.status !== 'known' || !lower || typeof lower.value !== 'number') return { definite: false, possible: false };
      return { definite: value.lowerYears > lower.value || lower.operator === '>=' && value.lowerYears === lower.value,
        possible: value.upperYears > lower.value || lower.operator === '>=' && value.upperInclusive && value.upperYears === lower.value };
    }
    function neonatalValues() {
      var source = ready() && context.neonatalAge || {};
      return {
        gestationalDays: dirty.gestationalAge ? parseGestationalAge(fields.gestationalAge.value) : dayInterval(source.gestationalDays),
        postnatalDays: dirty.postnatalDays ? parsePostnatalDays(fields.postnatalDays.value) : dayInterval(source.postnatalDays)
      };
    }
    function neonatalContext() {
      if (isInhibin()) return false;
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
      return true;
    }
    function preferInfantDays(values, neonatal) {
      if (!isInhibin() || !knownDays(neonatal.postnatalDays) || !engine || typeof engine.resolveAge !== 'function') return false;
      var coarse = engine.resolveAge({ age: age(values, 'age') });
      return !age(values, 'age') || coarse.status === 'known' && coarse.lowerYears < infantAgeLimit();
    }
    function readFields() {
      var values = {};
      Object.keys(fields).forEach(function (key) { values[key] = fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value; });
      values.contextBasis = 'current-patient';
      values.referenceSelection = 'automatic'; values.specimen = 'unknown';
      values.observationSource = imported.stage ? 'patient-record' : 'provided';
      values.gnrha = ready() ? ({ brak: 'no', 'w-trakcie': 'yes' }[context.gnrhaStatus] || 'unknown') : 'unknown';
      // Zakres działania modułu nie potwierdza rodzaju konkretnego oznaczenia
      // ani braku leczenia. Znane bieżące GnRHa nadal wyklucza zakresy bazalne.
      values.sexSteroids = 'unknown'; values.treatmentContext = values.gnrha === 'yes' ? 'hormonal' : 'unknown'; values.measurementKind = 'unknown';
      var neonatal = neonatalValues();
      if (neonatalContext() || neonatal.gestationalDays || neonatal.postnatalDays) values.neonatalAge = neonatal;
      values.useNeonatalAge = neonatalContext() && knownDays(neonatal.postnatalDays) || preferInfantDays(values, neonatal);
      var chronological = { age: values.useNeonatalAge ? null : age(values, 'age'), neonatalAge: values.neonatalAge };
      if (!engine || typeof engine.resolveAge !== 'function' || !adultAgeState(engine.resolveAge(chronological)).possible) values.reproductiveContext = 'unknown';
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
      if (suspendedSexFields) {
        if (key === 'sex') suspendedSexFields = null;
        else if (key === 'kind' || key === 'stage') { delete suspendedSexFields.values.kind; delete suspendedSexFields.values.stage; }
      }
      delete imported[key]; dirty[key] = true; evaluation = null;
      if (key === 'ageYears' || key === 'ageMonths') {
        clearField('postnatalDays'); delete imported.postnatalDays; dirty.postnatalDays = true;
        neonatalEdit = false;
      }
      if (key === 'postnatalDays' && !isInhibin()) {
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
      if ((ready() || dirty.sex) && reproductiveSex !== fields.sex.value) {
        clearField('reproductiveContext'); reproductiveSex = fields.sex.value;
      }
      var years = text(fields.ageYears.value), months = text(fields.ageMonths.value);
      var ageLabel = years ? years + ' lat' + (months ? ' i ' + months + ' mies.' : '') : 'wiek niepodany';
      var input = buildInput(readFields(), { analyte: analyte, raw: lastMeasurement.raw, unit: lastMeasurement.unit });
      var resolvedAge = engine && typeof engine.resolveAge === 'function' ? engine.resolveAge(input) : null;
      var adult = adultAgeState(resolvedAge);
      var neonatalMode = neonatalContext(), neonatal = neonatalValues();
      var inhibinInfant = isInhibin() && resolvedAge && resolvedAge.status === 'known' && resolvedAge.lowerYears < infantAgeLimit();
      if (neonatalMode) ageLabel = knownDays(neonatal.postnatalDays) ? intervalLabel(neonatal.postnatalDays) + (neonatal.postnatalDays.lower === 1 && neonatal.postnatalDays.upper === 1 ? ' ukończony dzień' : ' dni życia') : 'wiek do uzupełnienia';
      else if (isInhibin() && input.age === null && knownDays(neonatal.postnatalDays)) ageLabel = intervalLabel(neonatal.postnatalDays) + ' dni życia';
      else if (!years && knownDays(neonatal.postnatalDays)) ageLabel = intervalLabel(neonatal.postnatalDays) + ' dni życia';
      patientSummary.textContent = (adult.definite ? { M: 'Mężczyzna', F: 'Kobieta' } : neonatalMode || inhibinInfant ? { M: 'Chłopiec', F: 'Dziewczynka' } : { M: 'Chłopiec / mężczyzna', F: 'Dziewczynka / kobieta' })[fields.sex.value] + ' · ' + ageLabel;
      if (!['M', 'F'].includes(fields.sex.value)) patientSummary.textContent = 'Płeć niepodana · ' + ageLabel;
      var kind = fields.kind.value, stageValue = fields.stage.value;
      stageSummary.textContent = kind === 'Ax' ? 'Ax — owłosienie pachowe' : stageValue ? (kind === 'unspecified' ? 'Tanner ' + ['', 'I', 'II', 'III', 'IV', 'V'][Number(stageValue)] + ' — rodzaj niepodany' : kind + stageValue) : 'Stadium niepodane';
      refineStage.textContent = details.open && !sections.stage.hidden ? 'Gotowe' : stageValue && kind === 'unspecified' ? 'Doprecyzuj' : 'Zmień stadium';
      refineStage.setAttribute('aria-expanded', String(details.open && !sections.stage.hidden));
      stageHint.textContent = (['M', 'F'].includes(fields.sex.value) ? '' : 'Wybierz płeć, aby wskazać Th/M lub G. ') + 'Ocena dotyczy bieżącego kontekstu pacjenta.';
      var infant = resolvedAge && resolvedAge.status === 'known' && resolvedAge.lowerYears < 1;
      wrappers.preterm.hidden = !infant && !neonatalMode;
      stageRow.hidden = neonatalMode || adult.definite || !stageReferencesAvailable(); sectionButtons.stage.hidden = stageRow.hidden;
      if (stageRow.hidden) { sections.stage.hidden = true; sectionButtons.stage.setAttribute('aria-pressed', 'false'); }
      wrappers.reproductiveContext.hidden = fields.sex.value !== 'F' || !adult.possible;
      updateNeonatalView(neonatalMode, neonatal);
      updateInhibinInfantView(inhibinInfant, neonatal);
      updateContextLine(adult.definite || !stageReferencesAvailable());
    }
    function updateInhibinInfantView(infant, neonatal) {
      // Wspólne dane wieku pozostają w edycji. Inhibina nie korzysta z PMA ani
      // formularza kwalifikacji Greaves; nie żąda brakującego wieku ciążowego.
      if (!isInhibin()) {
        if (wrappers.preterm.parentNode !== patient) patient.appendChild(wrappers.preterm);
        return;
      }
      var editing = details.open && !sections.patient.hidden;
      if (infant && wrappers.preterm.parentNode !== panel) panel.insertBefore(wrappers.preterm, wrappers.reproductiveContext);
      else if (!infant && wrappers.preterm.parentNode !== patient) patient.appendChild(wrappers.preterm);
      wrappers.preterm.hidden = !infant || !(editing || fields.preterm.value === 'unknown' || doc.activeElement === fields.preterm);
      var reasons = evaluation && evaluation.referenceSelection && evaluation.referenceSelection.reasonCodes || [];
      var needsDays = reasons.some(function (reason) { return ['age_precision_crosses_reference_boundary', 'age_precision_crosses_scope', 'invalid_neonatal_age'].includes(reason); });
      wrappers.gestationalAge.hidden = true;
      wrappers.postnatalDays.hidden = !infant || fields.preterm.value === 'yes' || !(needsDays || editing && knownDays(neonatal.postnatalDays) || doc.activeElement === fields.postnatalDays);
      neonatalFields.hidden = wrappers.postnatalDays.hidden;
      var ga = neonatal.gestationalDays;
      neonatalSummary.hidden = !infant || !knownDays(ga);
      neonatalSummary.textContent = knownDays(ga) ? 'Urodzon' + (fields.sex.value === 'F' ? 'a' : 'y') + ' w ' + intervalLabel(ga, weekLabel) + ' tyg.' : '';
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
      details.hidden = active || !details.open || Object.keys(sections).every(function (name) { return sections[name].hidden; });
      wrappers.gestationalAge.hidden = !active || !(neonatalEdit || !gaKnown || refineGa || doc.activeElement === fields.gestationalAge);
      wrappers.postnatalDays.hidden = !active || !(neonatalEdit || !pnaKnown || refinePna || doc.activeElement === fields.postnatalDays);
      neonatalFields.hidden = wrappers.gestationalAge.hidden && wrappers.postnatalDays.hidden;
      fields.gestationalAge.setAttribute('aria-invalid', String(!!ga && !gaKnown));
      fields.postnatalDays.setAttribute('aria-invalid', String(!!pna && !pnaKnown));
      fields.gestationalAge.placeholder = gaKnown ? intervalLabel(ga, weekLabel) + ' tyg.' : 'np. 28+4';
      fields.postnatalDays.placeholder = pnaKnown ? intervalLabel(pna) + ' dni' : 'np. 43';
      neonatalSummary.hidden = !active || !gaKnown;
      neonatalSummary.textContent = gaKnown ? 'Urodzon' + (fields.sex.value === 'F' ? 'a' : 'y') + ' w ' + intervalLabel(ga, weekLabel) + ' tyg.' + (pma ? ' · PMA ' + intervalLabel(pma, weekLabel) + ' tyg.' : '') : '';
      var editingPatient = active ? neonatalEdit : details.open && !sections.patient.hidden;
      editPatient.textContent = editingPatient ? 'Gotowe' : 'Zmień';
      editPatient.setAttribute('aria-expanded', String(active ? neonatalEdit : details.open && !sections.patient.hidden));
      editPatient.setAttribute('aria-label', editingPatient ? 'Zakończ zmianę danych pacjenta' : 'Zmień dane pacjenta');
      panel.classList.toggle('lab-puberty-neonatal', active);
    }
    function updateContextLine(adult) {
      var parts = [];
      if (!ready()) parts.push(context && context.sourceStatus === 'loading' ? 'Trwa odczyt danych aktualnego pacjenta. Dane z karty są tymczasowo wyłączone z oceny.' : 'Dane z formularza głównego są niedostępne. Przeliczenie nie wymaga danych pacjenta.');
      if (ready() && context.gnrhaStatus === 'w-trakcie') {
        var treatmentText = context.gnrhaStatus === 'zakonczone' ? 'GnRHa: zakończone. Sam status nie określa leczenia ani wpływu ostatniej dawki dla wyniku; kontekst pozostaje nieznany.' : context.gnrhaStatus === 'w-trakcie' ? 'Z karty: leczenie GnRHa w trakcie.' : context.gnrhaStatus === 'brak' ? 'Z karty: brak GnRHa; nie ustala to pozostałego leczenia hormonalnego.' : '';
        if (treatmentText) parts.push(treatmentText);
      }
      var onset = ready() && context.onset;
      var incompatibleOnset = onset && !sexAllowsKind(fields.sex.value, pubertyKind(onset.kind));
      if (!adult && onset && !incompatibleOnset && onset.age && onset.age.years != null) parts.push('Początek ' + text(onset.kind) + ': ' + onset.age.years + ' ukończonych lat — z karty.');
      if (!adult && (omittedSexContext || incompatibleOnset)) parts.push('Pominięto wcześniejsze cechy niezgodne z wybraną płcią.');
      contextLine.textContent = parts.join(' ');
      contextLine.hidden = !parts.length;
    }
    function setAnalyte(next) {
      next = ['lh', 'fsh', 'inhibin_b'].includes(next) ? next : null;
      var changedAnalyte = next !== analyte;
      if (changedAnalyte) evaluation = null;
      analyte = next; panel.hidden = !next; assessment.hidden = !next;
      engine = isInhibin() ? opts.inhibinEngine || root.VildaLabInhibinB : pubertyEngine;
      data = isInhibin() ? opts.inhibinData || root.VildaLabInhibinBData : pubertyData;
      panel.setAttribute('aria-label', isInhibin() ? 'Pacjent — kontekst inhibiny B' : 'Pacjent — kontekst LH i FSH');
      if (changedAnalyte) {
        var selectedContext = fields.reproductiveContext.value;
        var choices = data && data.presentationPolicy && data.presentationPolicy.reproductiveChoices || reproductiveChoices;
        fields.reproductiveContext.replaceChildren();
        choices.forEach(function (choice) { var option = element('option', '', choice[1]); option.value = choice[0]; fields.reproductiveContext.appendChild(option); });
        fields.reproductiveContext.value = choices.some(function (choice) { return choice[0] === selectedContext; }) ? selectedContext : 'unknown';
      }
      var sampleStep = byId('labStep4'); if (sampleStep) sampleStep.classList.toggle('lab-puberty-suppressed', !!next);
      resultSection.classList.toggle('lab-puberty-active', !!next);
      ['labResultSourceLine', 'labSourcesWrap', 'labInfoCard'].forEach(function (id) { var node = byId(id); if (node) node.classList.toggle('lab-puberty-suppressed', !!next); });
      ['labStep4', 'labStep5'].forEach(function (id) { var node = byId(id); if (node) node.classList.toggle('lab-puberty-step-active', !!next); });
      if (patientLabel && patientLabel.firstChild) patientLabel.firstChild.textContent = next ? 'Pacjent ' : originalPatientLabel;
      var valueInput = byId('labValue'); if (valueInput) valueInput.setAttribute('inputmode', next ? 'text' : 'decimal');
      if (!next) assessment.replaceChildren();
      updateView();
    }
    function reset() {
      Object.keys(fields).forEach(clearField); dirty = {}; imported = {}; evaluation = null; contextKey = null; omittedSexContext = false; suspendedSexFields = null; neonatalEdit = false; reproductiveSex = null;
      lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' }; details.open = false;
      Object.keys(sections).forEach(function (name) { sections[name].hidden = true; sectionButtons[name].setAttribute('aria-pressed', 'false'); });
      assessment.replaceChildren(); syncSexFields();
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
        if (big) big.textContent = 'Moduł oceny ' + (isInhibin() ? 'inhibiny B' : 'LH/FSH') + ' jest niedostępny. Odśwież aplikację.';
        assessment.replaceChildren(); return null;
      }
      evaluation = engine.evaluate(input, data);
      if (isInhibin()) updateView();
      var valid = evaluation.measurement.status === 'valid';
      resultSection.classList.toggle('is-empty', !valid);
      // Wspólny model prezentacji wyprowadza wyróżnienie z obu zapisanych
      // porównań. Formularz nie oblicza ponownie progów ani zakresów.
      var view = renderer.renderEvaluation(assessment, evaluation, {
        compact: true, hideMeasurement: true, live: true, pretermContextMode: neonatalContext()
      });
      if (big) {
        big.replaceChildren();
        if (valid) {
          var target = units().includes(lastMeasurement.targetUnit) ? lastMeasurement.targetUnit : input.unit;
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
            summary.appendChild(element('span', 'vilda-lab-severity-summary-scope', alert.scope + (alert.automatic ? ' · orientacyjnie' : alert.conditional ? ' · warunkowo' : '')));
            big.appendChild(summary);
          }
        } else big.appendChild(element('span', 'lab-result-big-placeholder', lastMeasurement.raw ? 'Popraw zapis wyniku lub jednostkę.' : 'Wpisz wynik.'));
      }
      var table = byId('labResultsBody'), meta = byId('labMeta');
      if (table) {
        table.replaceChildren();
        units().filter(function (unit) { return unit !== input.unit; }).forEach(function (unit) {
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
      if (meta) meta.textContent = units().join(' i ') + ' są liczbowo równoważne. Równość jednostek nie potwierdza zgodności metod oznaczenia.';
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

  var api = { version: '1.12.0', buildInput: buildInput, parseGestationalAge: parseGestationalAge, parsePostnatalDays: parsePostnatalDays, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaLabPubertyUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
