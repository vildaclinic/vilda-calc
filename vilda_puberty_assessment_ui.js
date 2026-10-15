/* Shared G/Th/P editor for Start and DocPro. The state module owns clinical
 * observations, identity and persistence; this module only presents explicit
 * clinician choices. Descriptions: Marshall/Tanner 1969/1970, Endotext;
 * indicative Prader volumes: Rey et al., PMID 41312956 (not stage thresholds).
 */
(function (w) {
  'use strict';
  if (!w || w.VildaPubertyAssessmentUI) return;

  var doc = w.document;
  var mounted = false;
  var mainEditor = null;
  var editorCounter = 0;
  var shortDescriptions = {
    G: ['Wygląd przedpokwitaniowy.', 'Powiększają się jądra i moszna; zmienia się skóra moszny.',
      'Prącie rośnie głównie na długość; jądra i moszna nadal się powiększają.',
      'Prącie rośnie także na grubość, rozwija się żołądź; moszna ciemnieje.',
      'Narządy płciowe o dojrzałym wyglądzie i rozmiarze.'],
    Th: ['Brak wyczuwalnego pączka piersi.', 'Wyczuwalny pączek; powiększona otoczka.',
      'Dalszy rozwój piersi; otoczka we wspólnym obrysie.',
      'Otoczka z brodawką tworzą wtórne uwypuklenie.',
      'Dojrzały obrys; uwypuklona sama brodawka.'],
    P: ['Brak owłosienia łonowego; sam meszek nie oznacza P2.',
      'Nieliczne, słabo zabarwione włosy u podstawy prącia.',
      'Włosy ciemniejsze, grubsze i bardziej skręcone; większy obszar.',
      'Owłosienie typu dorosłego, bez przejścia na przyśrodkowe powierzchnie ud.',
      'Owłosienie typu dorosłego obejmuje także przyśrodkowe powierzchnie ud.']
  };
  var breastDescriptions = [
    'Przedpokwitaniowy wygląd piersi, bez wyczuwalnego pączka gruczołowego pod otoczką. Uwypuklona może być jedynie brodawka.',
    'Pod otoczką wyczuwalny jest pączek gruczołowy; pierś z brodawką tworzą niewielkie uwypuklenie. Powiększa się średnica otoczki.',
    'Pierś jest wyraźniej rozwinięta niż w stadium pączka; powiększa się także otoczka. Otoczka i pozostała pierś zachowują jeden ciągły obrys, bez wtórnego uwypuklenia.',
    'Otoczka wraz z brodawką tworzą odrębne, wtórne uwypuklenie ponad obrysem pozostałej piersi. Widoczne są dwa poziomy: zarys piersi i wyniesiona nad niego otoczka.',
    'Dojrzały zarys piersi: otoczka znajduje się w jej ogólnym obrysie, bez wtórnego uwypuklenia. Wystaje sama brodawka.'
  ];
  var volumes = ['ok. 2 ml', 'ok. 4–6 ml', 'ok. 8–10 ml', 'ok. 12–15 ml', 'ok. 15–25 ml'];
  var titles = { G: 'G — narządy płciowe', Th: 'Th (B) — rozwój piersi', P: 'P — owłosienie łonowe' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function descriptions(axis, sex, detailed) {
    var values = detailed && axis === 'Th' ? breastDescriptions.slice() : shortDescriptions[axis].slice();
    if (axis === 'P' && sex === 'F') values[1] = 'Nieliczne, słabo zabarwione włosy wzdłuż warg sromowych.';
    return values;
  }

  function guideSources(axis, sex) {
    var male = axis === 'G' || axis === 'P' && sex === 'M';
    var links = '<a href="https://pubmed.ncbi.nlm.nih.gov/' + (male ? '5440182' : '5785179') + '/" target="_blank" rel="noopener noreferrer">Marshall i Tanner — ' + (male ? 'chłopcy, 1970' : 'dziewczęta, 1969') + '</a>';
    if (axis !== 'P') links += ' · <a href="https://www.ncbi.nlm.nih.gov/books/NBK279024/" target="_blank" rel="noopener noreferrer">Endotext: Normal and Abnormal Puberty</a>';
    if (axis === 'G') links += ' · <a href="https://pubmed.ncbi.nlm.nih.gov/36315874/" target="_blank" rel="noopener noreferrer">Agüero i wsp.: pomiar objętości jąder</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/41312956/" target="_blank" rel="noopener noreferrer">Rey i wsp., 2025/2026: źródło orientacyjnych objętości</a>';
    return '<details class="vpa-sources"><summary>Źródła opisów' + (axis === 'G' ? ' i objętości' : '') + '</summary><p>' + links + '</p><p>Opisy wspierają ocenę w badaniu; wybór stadium należy do lekarza.</p></details>';
  }

  function rowMarkup(axis, sex, prefix) {
    var guideId = prefix + 'Guide' + axis;
    var intro = axis === 'G'
      ? 'Objętość pojedynczego jądra oceniana orchidometrem Pradera. Wartości orientacyjne — oceniaj razem z wyglądem narządów. To nie są granice stadiów ani zakresy referencyjne; nie dotyczą USG.'
      : 'Wybierz opis zgodny z badaniem.';
    var note = axis === 'G'
      ? 'Objętość około 4 ml w orchidometrze Pradera jest często używanym kryterium początku pokwitania. Przy wyborze G uwzględnij także wygląd moszny i prącia. Sama liczba ml nie wyznacza G1–G5; wyniki USG i orchidometru nie są zamienne.'
      : axis === 'Th'
        ? 'Oceń pierś oglądaniem i palpacyjnie — tkanka tłuszczowa nie oznacza pączka gruczołowego. Stadium opisuje budowę piersi, nie jej rozmiar. Th IV może nie zostać uchwycone między wizytami.'
        : 'P opisuje owłosienie łonowe. Oceniaj je oddzielnie od rozwoju narządów płciowych lub piersi.';
    var buttons = [1, 2, 3, 4, 5, null].map(function (stage) {
      return '<button type="button" data-puberty-axis="' + axis + '" data-puberty-stage="' + (stage || '') + '" aria-pressed="false" aria-label="' + esc(titles[axis]) + ', ' + (stage ? 'stadium ' + stage : 'nie oceniono') + '">' + (stage || 'Nie oceniono') + '</button>';
    }).join('');
    var guideChoices = descriptions(axis, sex, true).map(function (description, index) {
      return '<button type="button" class="vpa-guide-choice" data-puberty-axis="' + axis + '" data-puberty-stage="' + (index + 1) + '" data-puberty-guide-choice aria-pressed="false"><strong>' + axis + (index + 1) + '</strong><span>' + esc(description) + (axis === 'G' ? '<small class="vpa-volume">Orientacyjna objętość jądra: ' + volumes[index] + '</small>' : '') + '</span></button>';
    }).join('');
    return '<fieldset id="' + prefix + axis + '" class="vpa-row" data-puberty-row="' + axis + '"><legend><span>' + titles[axis] + '</span><button type="button" class="vpa-guide-toggle" data-puberty-guide-toggle="' + axis + '" aria-expanded="false" aria-controls="' + guideId + '" aria-label="Ściąga: ' + esc(titles[axis]) + '">Ściąga</button></legend><div class="vpa-segments" role="group" aria-label="' + esc(titles[axis]) + '">' + buttons + '</div><p class="vpa-definition" data-puberty-definition="' + axis + '" hidden></p><p class="vpa-provenance" data-puberty-provenance="' + axis + '" hidden></p><div id="' + guideId + '" class="vpa-guide" hidden><p>' + intro + '</p><div class="vpa-guide-choices">' + guideChoices + '</div><p>' + note + '</p>' + (axis !== 'P' ? '<p>Stadium tej cechy nie określa stadium owłosienia łonowego.</p>' : '') + guideSources(axis, sex) + '</div></fieldset>';
  }

  function sexFromForm() {
    var field = doc && doc.getElementById('sex');
    return field && field.value === 'F' ? 'F' : 'M';
  }

  function read() {
    var api = w.VildaPubertyAssessmentState;
    var runtime = w.VildaPubertyAssessmentContext;
    if (runtime && typeof runtime.readActiveContext === 'function') return runtime.readActiveContext();
    return api && typeof api.read === 'function' ? api.read() : { status: 'absent', assessment: null, legacy: null };
  }

  function normalizeContext(context) {
    if (!context || !context.assessmentContext) return context || {};
    return Object.assign({}, context.assessmentContext, { axisStates: context.axisStates,
      sex: context.sex, available: context.available, scope: context.scope });
  }

  function summary(view, sex) {
    view = normalizeContext(view);
    var assessment = view && view.assessment;
    var observations = assessment && assessment.observations;
    var axes = sex === 'F' ? ['Th', 'P'] : ['G', 'P'];
    var parts = [];
    if (observations) axes.forEach(function (axis) {
      if (observations[axis] && (observations[axis].sex || assessment.sex) === sex) {
        var state = view.axisStates && view.axisStates[axis];
        var suffix = state && state.current === false ? ' (wcześniej)' : '';
        parts.push(axis + observations[axis].stage + suffix);
      }
    });
    if (parts.length) return parts.join(' · ');
    if (view && view.legacy) return 'Starszy zapis: Tanner ' + view.legacy.stage + ' — cecha nieokreślona';
    if (view && view.status === 'unsupported') return 'Zapis z nowszej wersji aplikacji';
    if (view && view.status === 'invalid') return 'Zapis wymaga sprawdzenia';
    if (assessment && assessment.sex && assessment.sex !== sex) return 'Ocena dla innej płci — sprawdź dane';
    return 'Nie oceniono stadium';
  }

  function provenance(observation, axisState) {
    if (!observation) return '';
    var date = observation.observedAtISO;
    var label = axisState && axisState.current === false ? 'Wcześniejsza ocena' : 'Ocena';
    if (axisState && axisState.reason === 'sex-mismatch') label = 'Ocena dla innej płci';
    return date ? label + ': ' + date.slice(8, 10) + '.' + date.slice(5, 7) + '.' + date.slice(0, 4) : label + ': bez zapisanej daty';
  }

  // The same editor is mounted in the main form and the laboratory overlay.
  // Its host supplies the carrier; a standalone lab can keep a local draft.
  function mountEditor(host, options) {
    if (!host || typeof host.querySelector !== 'function') return null;
    options = options || {};
    var prefix = options.idPrefix || 'pubertyAssessmentEditor' + (++editorCounter);
    var renderedSex = null;
    var waitingTimer = null;
    var disposed = false;
    host.classList.add('vilda-puberty-panel');
    function renderEditor() {
      if (disposed) return;
      var context = typeof options.readContext === 'function' ? options.readContext()
        : typeof options.read === 'function' ? options.read() : {};
      context = context || {};
      var view = normalizeContext(context);
      var preparing = context.preparing === true || typeof options.isPreparing === 'function' && options.isPreparing();
      host.setAttribute('aria-busy', String(!!preparing));
      if (preparing && waitingTimer === null && typeof w.setTimeout === 'function') {
        waitingTimer = w.setTimeout(function () { waitingTimer = null; renderEditor(); }, 100);
      }
      var selectedSex = typeof options.sex === 'function' ? options.sex() : context.sex;
      var sex = selectedSex === 'F' || selectedSex === 'M' ? selectedSex : null;
      if (!sex) {
        renderedSex = null;
        host.innerHTML = '<p class="vpa-intro">Wybierz płeć, aby ocenić G lub Th i P.</p>';
        if (typeof options.onRender === 'function') options.onRender(view, sex);
        return;
      }
      if (renderedSex !== sex) {
        renderedSex = sex;
        host.innerHTML = '<p class="vpa-intro">Oceń cechy oddzielnie. Wpisz tylko te, które oceniono podczas tej wizyty.</p><p class="vpa-context-note" data-puberty-context-note hidden></p>' + rowMarkup(sex === 'F' ? 'Th' : 'G', sex, prefix) + rowMarkup('P', sex, prefix) + '<p class="vpa-edit-status" data-puberty-edit-status role="status" aria-live="polite" hidden></p>';
      }
      host.querySelector('.vpa-intro').textContent = context.scope === 'local'
        ? 'Oceń cechy oddzielnie. Wpis dotyczy tylko tego sprawdzenia.'
        : 'Oceń cechy oddzielnie. Wpisz tylko te, które oceniono podczas tej wizyty.';
      var compatible = view.assessment && view.assessment.sex === sex;
      var observations = view.assessment ? view.assessment.observations : {};
      var blocked = preparing || view.status === 'unsupported' || view.status === 'invalid';
      var note = host.querySelector('[data-puberty-context-note]');
      var message = preparing ? 'Trwa przygotowanie formularza…' : view.legacy
        ? 'Starszy zapis „Tanner ' + view.legacy.stage + '” nie określa cechy. Uzupełnij ocenione G lub Th oraz P; dawnego numeru nie przypisujemy automatycznie.'
        : view.status === 'unsupported' || view.status === 'invalid'
          ? 'Nie można edytować tej oceny w obecnej wersji aplikacji. Zapis pozostaje zachowany.'
          : view.assessment && !compatible && view.assessment.sex
            ? 'Wcześniejsza ocena dotyczy innej płci. Wpisz cechy ocenione podczas tej wizyty; G i Th nie są zamieniane.' : '';
      note.textContent = message;
      note.hidden = !message;
      host.querySelectorAll('[data-puberty-row]').forEach(function (row) {
        var axis = row.getAttribute('data-puberty-row');
        var observation = observations && observations[axis];
        var axisState = view.axisStates && view.axisStates[axis];
        var incompatible = observation && (observation.sex || view.assessment.sex) && (observation.sex || view.assessment.sex) !== sex;
        var stage = observation && !incompatible ? observation.stage : null;
        row.querySelectorAll('[data-puberty-stage]').forEach(function (button) {
          var buttonStage = button.getAttribute('data-puberty-stage');
          button.setAttribute('aria-pressed', String((buttonStage ? Number(buttonStage) : null) === stage));
          button.disabled = blocked;
        });
        var definition = row.querySelector('[data-puberty-definition]');
        definition.textContent = stage ? axis + stage + ' — ' + descriptions(axis, sex, false)[stage - 1] : '';
        definition.hidden = !stage;
        var origin = row.querySelector('[data-puberty-provenance]');
        origin.textContent = (incompatible ? 'Wcześniej ' + axis + observation.stage + ' — ocena dla innej płci. ' : '') + provenance(observation, axisState);
        origin.hidden = !origin.textContent;
      });
      if (typeof options.onRender === 'function') options.onRender(view, sex);
    }
    function handleClick(event) {
      var button = event.target.closest('button');
      if (!button || !host.contains(button)) return;
      if (button.hasAttribute('data-puberty-guide-toggle')) {
        var guide = host.querySelector('#' + button.getAttribute('aria-controls'));
        guide.hidden = !guide.hidden;
        button.setAttribute('aria-expanded', String(!guide.hidden));
        return;
      }
      if (!button.hasAttribute('data-puberty-stage') || button.disabled) return;
      var axis = button.getAttribute('data-puberty-axis');
      var rawStage = button.getAttribute('data-puberty-stage');
      var result = typeof options.onEdit === 'function'
        ? options.onEdit(axis, rawStage ? Number(rawStage) : null) : { ok: false };
      var status = host.querySelector('[data-puberty-edit-status]');
      if (status) {
        status.textContent = result && result.ok ? '' : 'Nie udało się zmienić oceny. Sprawdź aktywnego pacjenta i wersję zapisu.';
        status.hidden = !status.textContent;
      }
      if (!result || !result.ok) return;
      renderEditor();
      if (button.hasAttribute('data-puberty-guide-choice')) {
        var guidePanel = host.querySelector('#' + prefix + 'Guide' + axis);
        if (guidePanel) guidePanel.hidden = true;
        var toggle = host.querySelector('[data-puberty-guide-toggle="' + axis + '"]');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        var selected = host.querySelector('.vpa-segments [data-puberty-axis="' + axis + '"][data-puberty-stage="' + rawStage + '"]');
        if (selected) selected.focus();
      }
    }
    host.addEventListener('click', handleClick);
    var unsubscribe = typeof options.subscribe === 'function' ? options.subscribe(renderEditor) : null;
    function destroy() {
      disposed = true;
      host.removeEventListener('click', handleClick);
      if (waitingTimer !== null && typeof w.clearTimeout === 'function') w.clearTimeout(waitingTimer);
      if (typeof unsubscribe === 'function') unsubscribe();
    }
    renderEditor();
    return { render: renderEditor, update: renderEditor, destroy: destroy, dispose: destroy,
      open: function () { host.hidden = false; var first = host.querySelector('.vpa-segments button'); if (first) first.focus(); } };
  }

  function render() {
    if (mainEditor) mainEditor.render();
  }

  function open() {
    if (typeof w.vildaOtworzDanePokwitaniowe === 'function') w.vildaOtworzDanePokwitaniowe();
    var host = doc && doc.getElementById('pubertyAssessmentEditor');
    if (host) {
      if (typeof host.scrollIntoView === 'function') host.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var first = host.querySelector('.vpa-segments button');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function mount(options) {
    if (options && options.host) return mountEditor(options.host, options);
    if (mounted || !doc || !doc.getElementById('pubertyAssessmentEditor')) return;
    mounted = true;
    var host = doc.getElementById('pubertyAssessmentEditor');
    mainEditor = mountEditor(host, { idPrefix: 'pubertyAssessment', read: read, sex: sexFromForm,
      onEdit: function (axis, stage) {
        var state = w.VildaPubertyAssessmentState;
        var result = state && typeof state.editObservation === 'function'
          ? state.editObservation(axis, stage) : { ok: false };
        if (result && result.ok) {
          if (typeof w.debouncedUpdate === 'function') w.debouncedUpdate();
          if (typeof w.updateTannerVisibility === 'function') w.updateTannerVisibility();
        }
        return result;
      },
      onRender: function (view, sex) {
        var label = doc.getElementById('pubertyAssessmentSummary');
        if (label) label.textContent = summary(view, sex);
      }
    });
    var api = w.VildaPubertyAssessmentContext || w.VildaPubertyAssessmentState;
    if (api && typeof api.subscribe === 'function') api.subscribe(render);
    var sex = doc.getElementById('sex');
    if (sex) sex.addEventListener('change', render);
    if (!api || typeof api.subscribe !== 'function') doc.addEventListener('vilda:puberty-assessment-changed', render);
    render();
  }

  w.VildaPubertyAssessmentUI = Object.freeze({ VERSION: '1', mount: mount, render: render,
    open: open, mountEditor: mountEditor, summary: summary, descriptions: descriptions });
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
