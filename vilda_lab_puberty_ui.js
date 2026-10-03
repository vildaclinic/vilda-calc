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
    return input;
  }

  function mount(options) {
    var opts = options || {}, doc = opts.document || root.document;
    if (!doc) return null;
    var engine = opts.engine || root.VildaLabPuberty, data = opts.data || root.VildaLabPubertyData;
    var snapshots = opts.snapshot || root.VildaLabSnapshot;
    var renderer = opts.renderer || root.VildaLabAssessmentUI;
    var byId = function (id) { return doc.getElementById(id); };
    var resultSection = byId('labResultSection');
    if (!resultSection || !resultSection.parentNode) return null;
    var fields = {}, wrappers = {}, analyte = null, evaluation = null, context = null, contextKey = null;
    var lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
    var dirty = {}, imported = {}, importedContextChanged = false, suspendedImport = null;
    var confirmationKeys = ['methodConfirmed', 'appliesToSample', 'volumeAppliesToSample', 'localConfirmed'];
    function element(tag, className, content) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (content != null) node.textContent = content;
      return node;
    }
    var panel = element('section', 'lab-puberty-panel');
    panel.id = 'labPubertyPanel'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Kontekst LH i FSH z dnia pobrania');
    panel.appendChild(element('p', 'lab-puberty-hint', 'Poniższe dane dotyczą tej próbki. Ich zmiana nie nadpisuje karty pacjenta. Możesz wpisać wynik jako <0,02, >10 lub <LOD.'));
    var contextLine = element('p', 'lab-puberty-hint'); contextLine.id = 'labPubertyPatientContext'; panel.appendChild(contextLine);
    var useContext = element('button', 'lab-puberty-context-button', 'Użyj danych z karty dla tej próbki');
    useContext.type = 'button'; useContext.id = 'labPubertyUsePatientContext'; useContext.hidden = true; panel.appendChild(useContext);
    var assessment = element('div', 'lab-puberty-assessment-host');
    assessment.id = 'labPubertyAssessment'; assessment.hidden = true;
    var patientBody = byId('labStep5') && byId('labStep5').querySelector('.lab-step-body');
    var sampleBody = byId('labStep4') && byId('labStep4').querySelector('.lab-step-body');
    if (!patientBody || !sampleBody) return null;
    patientBody.appendChild(panel);
    var samplePanel = element('section', 'lab-puberty-panel'); samplePanel.id = 'labPubertySamplePanel'; samplePanel.hidden = true;
    samplePanel.setAttribute('aria-label', 'Próbka i metoda LH i FSH'); sampleBody.appendChild(samplePanel);
    var sampleLabel = sampleBody.querySelector('.lab-step-label');
    var patientLabel = patientBody.querySelector('.lab-step-label');
    var originalSampleLabel = sampleLabel && sampleLabel.firstChild && sampleLabel.firstChild.textContent;
    var originalPatientLabel = patientLabel && patientLabel.firstChild && patientLabel.firstChild.textContent;

    function group(title, hint, open) {
      var details = element('details', 'lab-puberty-details'); details.open = !!open;
      details.appendChild(element('summary', '', title));
      if (hint) details.appendChild(element('p', 'lab-puberty-hint', hint));
      var grid = element('div', 'lab-puberty-fields'); details.appendChild(grid); panel.appendChild(details);
      return grid;
    }
    function field(parent, key, label, type, choices, extra) {
      var wrap = element('label', 'lab-puberty-field');
      var id = 'labPuberty' + key.charAt(0).toUpperCase() + key.slice(1);
      wrap.setAttribute('for', id);
      var input = element(type === 'select' ? 'select' : 'input'); input.id = id;
      if (type === 'select') (choices || []).forEach(function (choice) {
        var option = element('option', '', choice[1]); option.value = choice[0]; input.appendChild(option);
      });
      else input.type = type || 'text';
      if (type === 'checkbox') { wrap.classList.add('lab-puberty-checkbox'); wrap.appendChild(input); wrap.appendChild(doc.createTextNode(label)); }
      else { wrap.appendChild(element('span', '', label)); wrap.appendChild(input); }
      if (extra) Object.keys(extra).forEach(function (name) { input.setAttribute(name, extra[name]); });
      input.setAttribute('autocomplete', 'off');
      fields[key] = input; wrappers[key] = wrap; parent.appendChild(wrap);
      input.addEventListener('input', function () { changed(key); });
      input.addEventListener('change', function () { changed(key); });
      return input;
    }
    var tri = [['unknown', 'Nie wiadomo'], ['no', 'Nie'], ['yes', 'Tak']];
    var kinds = [['', 'Nie podano'], ['Th', 'Th/M — rozwój piersi'], ['G', 'G — narządy płciowe'], ['P', 'P — owłosienie łonowe'], ['Ax', 'Ax — owłosienie pachowe'], ['unspecified', 'Nieokreślony typ (dawny Tanner)']];
    var dates = group('Wiek i data pobrania', 'Wiek oznacza wiek w dniu pobrania. Dokładne daty mają pierwszeństwo. Gdy ich nie znasz, podaj ukończone lata i znane dodatkowe miesiące lub dni.', true);
    field(dates, 'sex', 'Płeć', 'select', [['', 'Nie podano'], ['F', 'Kobieta / dziewczynka'], ['M', 'Mężczyzna / chłopiec']]);
    field(dates, 'sampleDate', 'Data pobrania', 'date');
    field(dates, 'birthDate', 'Data urodzenia', 'date');
    field(dates, 'ageYears', 'Ukończone lata w dniu pobrania', 'number', null, { min: '0', max: '120', step: '1' });
    field(dates, 'ageMonths', 'Dodatkowe ukończone miesiące', 'number', null, { min: '0', max: '11', step: '1' });
    field(dates, 'ageDays', 'Dodatkowe dni, jeśli znane', 'number', null, { min: '0', max: '30', step: '1' });
    var sample = group('Próbka, metoda i leczenie', 'Wybór profilu referencyjnego nie potwierdza metody próbki. Przy nieznanym lub niezgodnym kontekście konwersja pozostaje dostępna, a zakresy nie są dobierane automatycznie.');
    field(sample, 'specimen', 'Materiał', 'select', [['unknown', 'Nie wiadomo'], ['serum', 'Surowica'], ['plasma', 'Osocze'], ['urine', 'Mocz'], ['other', 'Inny']]);
    field(sample, 'measurementKind', 'Rodzaj oznaczenia', 'select', [['unknown', 'Nie wiadomo'], ['basal', 'Bazalne'], ['stimulated', 'Po stymulacji'], ['other', 'Inny protokół']]);
    field(sample, 'profile', 'Profil referencyjny', 'select', [['', 'Nie wybrano']]);
    field(sample, 'method', 'Metoda rzeczywistej próbki', 'select', [['', 'Nie wiadomo'], ['anshlite-lh-clia', 'AnshLite LH CLIA'], ['roche-elecsys-fsh-eclia', 'Roche Elecsys FSH ECLIA'], ['other', 'Inna metoda (podaj niżej)']]);
    field(sample, 'otherMethod', 'Identyfikator innej metody', 'text'); wrappers.otherMethod.hidden = true;
    field(sample, 'methodConfirmed', 'Metoda została sprawdzona w wyniku tej próbki', 'checkbox');
    field(sample, 'gnrha', 'Leczenie analogiem GnRH', 'select', tri);
    field(sample, 'sexSteroids', 'Leczenie steroidami płciowymi', 'select', tri);
    samplePanel.appendChild(sample.parentNode);
    var puberty = group('Rozwój i jego datowanie', 'Th/M i G opisują rozwój gonadalny. P i Ax go nie zastępują; Ax nie ma skali 1–5. Dawny sam numer Tannera nie ustala rodzaju cechy.');
    field(puberty, 'kind', 'Oceniana cecha', 'select', kinds);
    field(puberty, 'stage', 'Stadium', 'select', [['', 'Nie podano'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]);
    field(puberty, 'assessedAt', 'Data oceny rozwoju', 'date');
    field(puberty, 'observationSource', 'Źródło obserwacji', 'select', [['provided', 'Podana informacja'], ['clinical-examination', 'Badanie lekarskie'], ['reported-history', 'Wywiad'], ['patient-record', 'Karta pacjenta']]);
    field(puberty, 'appliesToSample', 'Potwierdzam, że ta obserwacja dotyczy dnia pobrania', 'checkbox');
    var history = group('Początek rozwoju i przebieg', 'Nie wyznaczamy czasu początku z obecnego stadium. Brak odpowiedzi pozostaje nieznany.');
    field(history, 'onsetKind', 'Rodzaj pierwszej cechy', 'select', kinds);
    field(history, 'onsetDate', 'Data początku, jeśli znana', 'date');
    field(history, 'onsetAgeYears', 'Początek — ukończone lata', 'number', null, { min: '0', max: '120', step: '1' });
    field(history, 'onsetAgeMonths', 'Początek — dodatkowe miesiące', 'number', null, { min: '0', max: '11', step: '1' });
    field(history, 'onsetAgeDays', 'Początek — dodatkowe dni', 'number', null, { min: '0', max: '30', step: '1' });
    field(history, 'onsetConfirmed', 'Potwierdzony początek pokwitania (istotne przy cechach w niemowlęctwie)', 'checkbox');
    field(history, 'progression', 'Progresja cech', 'select', tri);
    field(history, 'growthAcceleration', 'Przyspieszenie wzrastania', 'select', tri);
    field(history, 'cnsSymptoms', 'Objawy ze strony OUN', 'select', tri);
    field(history, 'regression', 'Regresja wcześniejszych cech', 'select', tri);
    var volume = group('Objętość jąder', 'Objętość nie wyznacza całego stadium G. Kryterium Pradera nie jest automatycznie przenoszone na USG.');
    field(volume, 'testicularVolume', 'Objętość jąder [mL]', 'number', null, { min: '0', step: 'any' });
    field(volume, 'volumeMethod', 'Metoda oceny objętości', 'select', [['', 'Nie podano'], ['Prader', 'Orchidometr Pradera'], ['ultrasound', 'USG'], ['other', 'Inna']]);
    field(volume, 'volumeAssessedAt', 'Data oceny objętości', 'date');
    field(volume, 'volumeAppliesToSample', 'Objętość dotyczy dnia pobrania', 'checkbox');
    var infant = group('Kontekst niemowlęcy', 'Minipuberty wymaga właściwej osi wieku, płci i metody. Wiek skorygowany nie zastępuje automatycznie wieku chronologicznego.');
    field(infant, 'preterm', 'Urodzenie przedwcześnie', 'select', tri);
    field(infant, 'gestationalWeeks', 'Wiek ciążowy przy urodzeniu [tygodnie]', 'number', null, { min: '0', max: '45', step: 'any' });
    var local = group('Zakres podany przez laboratorium', 'Zakres lokalny wymaga pełnego źródła, metody, populacji oraz potwierdzenia przydatności dla tej próbki. Samo wpisanie dwóch liczb nie wystarcza.');
    field(local, 'localEnabled', 'Uwzględnij jawny zakres lokalny', 'checkbox');
    field(local, 'localId', 'Identyfikator zakresu', 'text');
    field(local, 'localVersion', 'Wersja zakresu', 'text');
    field(local, 'localSourceId', 'Identyfikator źródła', 'text');
    field(local, 'localSourceLabel', 'Nazwa laboratorium / dokumentu', 'text');
    field(local, 'localSourceVersion', 'Wersja dokumentu źródłowego', 'text');
    field(local, 'localSourceUrl', 'Adres źródła (opcjonalnie)', 'url');
    var urlHint = element('span', 'lab-puberty-hint'); urlHint.hidden = true; urlHint.setAttribute('role', 'status'); wrappers.localSourceUrl.appendChild(urlHint);
    field(local, 'localPopulation', 'Populacja odniesienia', 'text');
    field(local, 'localMethod', 'Identyfikator metody tego zakresu', 'text');
    field(local, 'localUnit', 'Jednostka zakresu', 'select', [['', 'Nie podano'], ['IU/L', 'IU/L'], ['mIU/mL', 'mIU/mL']]);
    field(local, 'localLowerOperator', 'Operator dolnej granicy', 'select', [['>=', '≥'], ['>', '>']]);
    field(local, 'localLowerValue', 'Dolna granica (puste = brak)', 'number', null, { min: '0', step: 'any' });
    field(local, 'localUpperOperator', 'Operator górnej granicy', 'select', [['<=', '≤'], ['<', '<']]);
    field(local, 'localUpperValue', 'Górna granica (puste = brak)', 'number', null, { min: '0', step: 'any' });
    field(local, 'localCensoredLowerOperator', 'Operator raportowanej dolnej granicy oznaczalności', 'select', [['<', '<'], ['<=', '≤']]);
    field(local, 'localCensoredLowerValue', 'Dolna granica oznaczalności (opcjonalnie)', 'number', null, { min: '0', step: 'any' });
    field(local, 'localSourceText', 'Oryginalny opis zakresu', 'text');
    field(local, 'localConfirmed', 'Potwierdzam przydatność zakresu dla tej próbki i populacji', 'checkbox');
    samplePanel.appendChild(local.parentNode);
    Object.keys(fields).filter(function (key) { return key.startsWith('local') && key !== 'localEnabled'; }).forEach(function (key) { wrappers[key].hidden = true; });

    function readFields() {
      var values = {};
      Object.keys(fields).forEach(function (key) { values[key] = fields[key].type === 'checkbox' ? fields[key].checked : fields[key].value; });
      if (values.method === 'other') values.method = text(values.otherMethod);
      return values;
    }
    function clearConfirmations() {
      confirmationKeys.forEach(function (key) { fields[key].checked = false; });
    }
    function notify() { if (typeof opts.onChange === 'function') opts.onChange(); }
    function changed(key) {
      // Ręczna korekta dotyczy próbki; późniejszy odczyt karty jej nie nadpisuje.
      delete imported[key];
      if (suspendedImport) { delete suspendedImport.values[key]; suspendedImport.confirmations = null; }
      dirty[key] = true; evaluation = null;
      if (['sampleDate', 'birthDate', 'sex'].includes(key)) clearConfirmations();
      if (['profile', 'method', 'otherMethod', 'specimen', 'measurementKind'].includes(key)) {
        fields.methodConfirmed.checked = false; fields.localConfirmed.checked = false;
      }
      if (key.startsWith('local') && key !== 'localConfirmed') fields.localConfirmed.checked = false;
      if (key === 'localSourceUrl') {
        urlHint.hidden = !text(fields.localSourceUrl.value) || !!sourceUrl(fields.localSourceUrl.value);
        urlHint.textContent = urlHint.hidden ? '' : 'Podaj pełny adres z https:// lub http://. Ten niepoprawny adres zostanie pominięty w zapisie; pozostały opis źródła pozostaje.';
      }
      if (key === 'kind') { wrappers.stage.hidden = fields.kind.value === 'Ax'; if (fields.kind.value === 'Ax') fields.stage.value = ''; }
      if (key === 'method') wrappers.otherMethod.hidden = fields.method.value !== 'other';
      if (key === 'localEnabled') Object.keys(fields).filter(function (k) { return k.startsWith('local') && k !== 'localEnabled'; }).forEach(function (k) { wrappers[k].hidden = !fields.localEnabled.checked; });
      notify();
    }
    function clearMethod() {
      if (suspendedImport) suspendedImport.confirmations = null;
      ['profile', 'method', 'otherMethod'].forEach(function (key) { fields[key].value = ''; });
      fields.methodConfirmed.checked = false;
      Object.keys(fields).filter(function (key) { return key.startsWith('local'); }).forEach(function (key) {
        if (fields[key].type === 'checkbox') fields[key].checked = false;
        else fields[key].value = fields[key].tagName === 'SELECT' ? fields[key].options[0].value : '';
        if (key !== 'localEnabled') wrappers[key].hidden = true;
      });
      wrappers.otherMethod.hidden = true;
      urlHint.hidden = true; urlHint.textContent = '';
    }
    function setAnalyte(next) {
      next = ['lh', 'fsh'].includes(next) ? next : null;
      if (next !== analyte) {
        clearMethod(); evaluation = null;
        while (fields.profile.options.length > 1) fields.profile.remove(1);
        (data && Array.isArray(data.profiles) ? data.profiles : []).filter(function (profile) {
          return profile.active === true && profile.analyte === next;
        }).forEach(function (profile) {
          var option = element('option', '', 'Mayo — pediatryczne ' + next.toUpperCase() + ' · ' + profile.method.name);
          option.value = profile.id; fields.profile.appendChild(option);
        });
      }
      analyte = next; panel.hidden = !next; samplePanel.hidden = !next; assessment.hidden = !next;
      resultSection.classList.toggle('lab-puberty-active', !!next);
      ['labResultSourceLine', 'labSourcesWrap', 'labInfoCard'].forEach(function (id) {
        var node = byId(id); if (node) node.classList.toggle('lab-puberty-suppressed', !!next);
      });
      ['labStep4', 'labStep5'].forEach(function (id) { var node = byId(id); if (node) node.classList.toggle('lab-puberty-step-active', !!next); });
      if (sampleLabel && sampleLabel.firstChild) sampleLabel.firstChild.textContent = next ? 'Próbka, metoda i leczenie ' : originalSampleLabel;
      if (patientLabel && patientLabel.firstChild) patientLabel.firstChild.textContent = next ? 'Pacjent — kontekst z dnia pobrania ' : originalPatientLabel;
      var valueInput = byId('labValue'); if (valueInput) valueInput.setAttribute('inputmode', next ? 'text' : 'decimal');
      if (!next) {
        assessment.replaceChildren();
      }
    }
    function reset() {
      Object.keys(fields).forEach(function (key) {
        var input = fields[key];
        if (input.type === 'checkbox') input.checked = false;
        else input.value = input.tagName === 'SELECT' ? input.options[0].value : '';
      });
      dirty = {}; imported = {}; importedContextChanged = false; suspendedImport = null;
      evaluation = null; contextKey = null; lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
      wrappers.stage.hidden = false; wrappers.otherMethod.hidden = true;
      Object.keys(fields).filter(function (key) { return key.startsWith('local') && key !== 'localEnabled'; }).forEach(function (key) { wrappers[key].hidden = true; });
      assessment.replaceChildren();
      urlHint.hidden = true; urlHint.textContent = '';
    }
    function setPatientContext(next) {
      next = next && typeof next === 'object' ? next : {};
      var identity = text(next.identityKey);
      var key = JSON.stringify(next);
      if (contextKey === key) return;
      if (context && text(context.identityKey) !== identity) {
        reset();
        if (typeof opts.onPatientChange === 'function') opts.onPatientChange();
      }
      else if (context) {
        if (next.sourceStatus === 'loading' && context.sourceStatus === 'ready') {
          // Odświeżenie nie musi oznaczać zmiany danych. W czasie odczytu import
          // jest wyłączony z oceny; wróci tylko po potwierdzeniu identycznego źródła.
          suspendedImport = { key: contextKey, values: {}, confirmations: {}, notice: importedContextChanged };
          Object.keys(imported).forEach(function (key) { suspendedImport.values[key] = fields[key].value; });
          confirmationKeys.forEach(function (key) { suspendedImport.confirmations[key] = fields[key].checked; });
        }
        // Samo usunięcie checkboxów zostawiałoby skopiowane leczenie i wiek.
        // Czyścimy tylko wartości nadal pochodzące z poprzedniej wersji karty.
        Object.keys(imported).forEach(function (key) {
          fields[key].value = fields[key].tagName === 'SELECT' ? fields[key].options[0].value : '';
          delete dirty[key];
          importedContextChanged = true;
        });
        imported = {};
        clearConfirmations(); evaluation = null;
        if (next.sourceStatus !== 'loading' && suspendedImport) {
          if (next.sourceStatus === 'ready' && key === suspendedImport.key) {
            Object.keys(suspendedImport.values).forEach(function (key) { importField(key, suspendedImport.values[key]); });
            if (suspendedImport.confirmations) confirmationKeys.forEach(function (key) { fields[key].checked = suspendedImport.confirmations[key]; });
            importedContextChanged = suspendedImport.notice;
          }
          suspendedImport = null;
        }
      }
      context = JSON.parse(JSON.stringify(next)); contextKey = key;
      if (!dirty.sex) fields.sex.value = ['M', 'F'].includes(next.sex) ? next.sex : '';
      if (!dirty.birthDate) fields.birthDate.value = /^\d{4}-\d{2}-\d{2}$/.test(text(next.birthDateISO)) ? next.birthDateISO : '';
      updateContextLine(next);
    }
    function updateContextLine(next) {
      var identity = text(next.identityKey), parts = [];
      if (next.sex) parts.push(next.sex);
      if (next.ageYears != null) parts.push(next.ageYears + ' lat' + (next.ageMonths != null ? ' i ' + next.ageMonths + ' mies.' : ''));
      if (next.tanner != null) parts.push('dawny Tanner ' + next.tanner + ' bez typu');
      if (next.gnrhaStatus) parts.push('GnRHa: ' + ({ brak: 'brak leczenia', 'w-trakcie': 'w trakcie', zakonczone: 'zakończone' }[next.gnrhaStatus] || 'wymaga sprawdzenia'));
      contextLine.textContent = parts.length ? 'Dane aktualnej karty: ' + parts.join(' · ') + '. Sprawdź ich zgodność z dniem pobrania. Wiek wizyty nie jest automatycznie wiekiem próbki.' : 'Nie wczytano kontekstu z karty. Możesz podać dane badania tutaj.';
      if (next.sourceStatus === 'loading') contextLine.textContent = 'Trwa odczyt danych aktualnego pacjenta. Poczekaj przed użyciem danych z karty lub wpisz dane badania ręcznie.';
      else if (identity && next.sourceStatus !== 'ready') contextLine.textContent = 'Dane aktualnego pacjenta są niedostępne. Możesz podać dane badania ręcznie.';
      else if (importedContextChanged) contextLine.textContent += ' Dane z karty wymagają ponownego sprawdzenia. Użyj ich ponownie lub uzupełnij pola badania ręcznie.';
      useContext.hidden = !identity && !parts.length;
      useContext.disabled = !parts.length || !!identity && next.sourceStatus !== 'ready';
    }
    function refreshContext() {
      if (typeof opts.readPatientContext !== 'function') return false;
      var next, previousKey = contextKey;
      try { next = opts.readPatientContext(); }
      catch (_) { next = { identityKey: context && context.identityKey, sourceStatus: 'unavailable' }; }
      setPatientContext(next);
      return previousKey !== contextKey;
    }
    function importField(key, value) {
      fields[key].value = text(value);
      dirty[key] = true; imported[key] = true;
    }
    useContext.addEventListener('click', function () {
      var refreshed = refreshContext();
      if (!context || useContext.disabled) { if (refreshed) notify(); return; }
      clearConfirmations();
      importField('sex', ['M', 'F'].includes(context.sex) ? context.sex : '');
      importField('birthDate', /^\d{4}-\d{2}-\d{2}$/.test(text(context.birthDateISO)) ? context.birthDateISO : '');
      if (context.ageYears != null) { importField('ageYears', context.ageYears); importField('ageMonths', context.ageMonths); importField('ageDays', ''); }
      if (context.tanner != null) { importField('kind', 'unspecified'); importField('stage', context.tanner); wrappers.stage.hidden = false; }
      if (context.gnrhaStatus) importField('gnrha', context.gnrhaStatus === 'brak' ? 'no' : 'yes');
      if (context.testicularVolume != null) importField('testicularVolume', context.testicularVolume);
      importedContextChanged = false;
      updateContextLine(context);
      evaluation = null; notify();
    });

    function render(measurement) {
      if (!analyte) return null;
      var identity = context && text(context.identityKey);
      refreshContext();
      // Zmiana pacjenta może poprzedzać zdarzenie odświeżenia formularza.
      if (identity !== (context && text(context.identityKey))) measurement = null;
      lastMeasurement = { raw: text(measurement && measurement.raw), unit: text(measurement && measurement.unit), targetUnit: text(measurement && measurement.targetUnit) };
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

  var api = { version: '1.0.1', buildInput: buildInput, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaLabPubertyUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
