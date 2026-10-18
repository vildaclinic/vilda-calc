/* P-POKWITANIE-PANEL: one guarded view of the active examination for all cards.
 * No new storage and no latest-record fallback. The existing full main session
 * transports the assessment and its explicit visit marker between documents.
 * Clinical eligibility is owned by VildaPubertyAssessment, not the renderer.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaPubertyAssessmentContext) return;
  var listeners = [], bound = [], boundVaults = new WeakSet(), preferredView = null;
  var sessionVault = null, blockedSessionOwner = null;

  function model() { return w.VildaPubertyAssessment; }
  function sex(value) { return value === 'M' ? 'M' : value === 'F' || value === 'K' ? 'F' : null; }
  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    var n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function identity(view) {
    try { return view.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return view._vildaCurrentPatientId || null; }
  }
  function field(view, id) {
    try { var element = view.document.getElementById(id); return element ? element.value : null; }
    catch (_) { return null; }
  }
  function stale(view) {
    try {
      // The clear event precedes removal of the former patient ID. The panel's
      // lazy identity check can mark itself stale, so never ask it mid-clear.
      return !!(view.VildaPersistence && view.VildaPersistence.isClearInProgress && view.VildaPersistence.isClearInProgress() ||
        view.VildaPanelPacjent && view.VildaPanelPacjent.nieaktualny());
    } catch (_) { return true; }
  }
  function windows() {
    var result = [], seen = [];
    function add(view, depth) {
      if (!view || seen.indexOf(view) >= 0 || depth > 2) return;
      seen.push(view);
      try {
        // Access itself enforces same origin. A closing or unrelated frame is ignored.
        if (!view.document) return;
        result.push(view);
        for (var i = 0; i < view.frames.length && i < 20; i++) add(view.frames[i], depth + 1);
      } catch (_) { /* Never cross an origin boundary. */ }
    }
    add(w, 0);
    try { add(w.parent, 0); } catch (_) { /* Standalone document. */ }
    return result;
  }
  function readView(view, id) {
    try {
      if (stale(view) || identity(view) !== id || !view.VildaPubertyAssessmentState ||
          !view.document.getElementById('tannerStageWrap')) return null;
      var state = view.VildaPubertyAssessmentState;
      var captured = state.capture();
      if (id && captured.patientId !== id) return null;
      return { view: view, captured: captured, read: state.read(), state: state };
    } catch (_) { return null; }
  }
  function session(id) {
    try {
      if (stale(w)) return null;
      // A patient-scoped saved session cannot bypass a locked/replaced vault.
      // Anonymous drafts are independent of an unrelated account's lock state.
      if (id) {
        if (blockedSessionOwner === id || !w.VildaVault || typeof w.VildaVault.isUnlocked !== 'function' || !w.VildaVault.isUnlocked()) return null;
        if (sessionVault && sessionVault !== w.VildaVault) { blockedSessionOwner = id; return null; }
        sessionVault = w.VildaVault;
      }
      var api = w.VildaPersistence;
      var payload = api && api.readMainSession ? api.readMainSession() : null;
      var user = payload && payload.user;
      var marker = user && user.pubertyAssessmentVisit;
      if (!user || !marker || marker.version !== 1 || marker.ownerPatientId !== id) return null;
      return { user: user, marker: marker, payload: payload };
    } catch (_) { return null; }
  }
  function chooseSource(id) {
    var views = windows(), own = readView(w, id);
    if (own) return own;
    var preferred = preferredView && readView(preferredView, id);
    if (preferred) return preferred;
    var candidates = views.map(function (view) { return readView(view, id); }).filter(Boolean);
    // Fresh trusted edits may still be waiting for the ordinary autosave pause.
    // The live carrier owns them; the previous session cannot replace them.
    if (candidates.length) {
      candidates.sort(function (a, b) {
        var ar = a.state.getActivityRevision ? a.state.getActivityRevision() : a.captured.activityRevision || 0;
        var br = b.state.getActivityRevision ? b.state.getActivityRevision() : b.captured.activityRevision || 0;
        return br - ar;
      });
      return candidates[0];
    }
    // An expired live carrier is an explicit boundary, not permission to read
    // back its previous session after lock, replacement, clear or identity loss.
    var expired = views.some(function (view) {
      try { return identity(view) === id && view.VildaPubertyAssessmentState &&
        view.document.getElementById('tannerStageWrap') && !readView(view, id); }
      catch (_) { return false; }
    });
    if (expired) return null;
    var stored = session(id);
    if (stored) {
      return { user: stored.user, marker: stored.marker, payload: stored.payload, view: null };
    }
    // A live main form is authoritative even before its first autosave. Its
    // carrier already verifies its own patient/vault; no anonymous record lookup.
    return null;
  }
  function preparing(view) {
    try { return !!(view.__vildaPersistRestoring || Number(view.__vildaPersistClearUntil || 0) > Date.now() ||
      view.VildaPersistence && view.VildaPersistence.isClearInProgress && view.VildaPersistence.isClearInProgress()); }
    catch (_) { return true; }
  }
  function payloadAge(user) {
    var years = number(user.age), months = number(user.ageMonths);
    return years === null && months === null ? null : (years || 0) * 12 + (months || 0);
  }
  function facts(view, user) {
    if (!view) return Object.assign({}, user && user.puberty || {}, {
      testicularVolume: user && user.advanced && user.advanced.testicularVolume || null,
      familyDelayedPuberty: user && user.advanced && user.advanced.familyDelayedPuberty || null,
      growthExclusion: user && user.advanced && user.advanced.growthExclusion || null });
    return { gnrhaStatus: field(view, 'pubertyGnrhaStatus') || null,
      onsetAgeYears: number(field(view, 'pubertyOnsetAge')),
      menarcheAgeYears: number(field(view, 'pubertyMenarcheAge')),
      heightAtMenarcheCm: number(field(view, 'pubertyMenarcheHeight')),
      boneAgeAtMenarcheYears: number(field(view, 'pubertyMenarcheBoneAge')),
      cdgpDeclared: field(view, 'pubertyCdgp') || null,
      testicularVolume: field(view, 'advTesticularVolume') || null,
      familyDelayedPuberty: field(view, 'advFamilyDelayedPuberty') || null,
      growthExclusion: field(view, 'advGrowthExclusion') || null };
  }
  function demographics(source) {
    var view = source && source.view, user = source && source.user || {};
    var birth = user.dobISO || null;
    if (view) {
      try { birth = view.VildaDobAge && view.VildaDobAge.readISO ? view.VildaDobAge.readISO() : null; }
      catch (_) { birth = null; }
    }
    return { sex: sex(view ? field(view, 'sex') : user.sex),
      ageYears: number(view ? field(view, 'age') : user.age),
      ageMonths: number(view ? field(view, 'ageMonths') : user.ageMonths), birthDateISO: birth };
  }
  function summary(context) {
    var read = context.assessmentContext;
    if (read && read.status === 'ready') {
      return ['G', 'Th', 'P'].filter(function (axis) { return read.assessment.observations[axis]; })
        .map(function (axis) {
          var observation = read.assessment.observations[axis];
          return axis + observation.stage + (context.axisStates[axis].current ? '' : ' (wcześniejsza ocena)');
        }).join(' · ');
    }
    return read && read.legacy ? 'Tanner ' + ['I', 'II', 'III', 'IV', 'V'][read.legacy.stage - 1] + ' — rodzaj nieokreślony' : '';
  }
  function readActiveContext(options) {
    var opts = options || {}, id = identity(w);
    var expected = Object.prototype.hasOwnProperty.call(opts, 'patientId') && opts.patientId !== undefined ? opts.patientId || null : id;
    var source = expected === id && !stale(w) ? chooseSource(id) : null;
    var read = source && source.read || model().readUser(source && source.user);
    var visit = source && (source.read ? source.read.visit : source.marker) || null;
    var visitContext = source && source.read ? source.read.visitContext : source && source.user ? {
      sex: sex(source.user.sex), ageMonths: payloadAge(source.user), measuredAtISO: source.user.measuredAtISO || null
    } : {};
    var context = { available: !!source, scope: source && source.state ? 'visit' : 'local',
      canEditVisit: !!(source && source.state),
      preparing: preparing(w) || !!(source && source.view && preparing(source.view)),
      patientId: id, assessmentContext: read, visitMarker: visit, demographics: demographics(source),
      sex: sex(opts.sex || opts.plec || visitContext.sex || field(w, 'sex')),
      currentAgeMonths: number(opts.currentAgeMonths != null ? opts.currentAgeMonths :
        opts.wiekMies != null ? opts.wiekMies : visitContext.ageMonths),
      measuredAtISO: Object.prototype.hasOwnProperty.call(opts, 'measuredAtISO') && opts.measuredAtISO !== undefined
        ? opts.measuredAtISO : visitContext.measuredAtISO || null,
      puberty: source ? facts(source.view, source.payload || source.user) : null,
      axisStates: {} };
    var qualification = { sex: context.sex, currentAgeMonths: context.currentAgeMonths,
      measuredAtISO: context.measuredAtISO, patientId: id, visitMarker: visit };
    context.gonadal = model().gonadalContext(read, Object.assign({}, qualification, { scope: 'current' }));
    context.growth = model().gonadalContext(read, Object.assign({}, qualification, { scope: 'growth' }));
    ['G', 'Th', 'P'].forEach(function (axis) {
      var resolved = model().resolveAxis(read, axis, qualification);
      context.axisStates[axis] = Object.assign({}, resolved, { eligible: resolved.current, growthUsable: resolved.usableForGrowth });
    });
    context.summary = summary(context);
    return context;
  }
  function editObservation(axis, stage, options) {
    var source = chooseSource(identity(w));
    if (!source || !source.state || stale(w)) return { ok: false, reason: 'no-active-visit' };
    preferredView = source.view;
    return source.state.editObservation(axis, stage, options);
  }
  function notify() {
    listeners.slice().forEach(function (listener) { try { listener(); } catch (_) { /* Isolated subscriber. */ } });
  }
  function bindViews() {
    windows().forEach(function (view) {
      try {
        var state = view.VildaPubertyAssessmentState;
        var doc = view.document;
        var vault = view.VildaVault;
        if (vault && !boundVaults.has(vault) && typeof vault.onLock === 'function') {
          boundVaults.add(vault);
          vault.onLock(function () { preferredView = null; blockedSessionOwner = identity(w); notify(); });
        }
        if (bound.some(function (entry) { return entry.view === view && entry.doc === doc && entry.state === state; })) return;
        bound = bound.filter(function (entry) {
          if (entry.view !== view) return true;
          if (entry.unsubscribe) entry.unsubscribe();
          return false;
        });
        var unsubscribe = state && state.subscribe ? state.subscribe(function (reason) {
          preferredView = reason === 'edit' ? view : null;
          notify();
        }) : null;
        if (doc && doc.addEventListener) {
          var changed = function () { preferredView = null; bindViews(); notify(); };
          ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored', 'vilda:user-state-cleared', 'vilda:auth-loaded']
            .forEach(function (event) { doc.addEventListener(event, function (e) {
              if (e.type === 'vilda:patient-loaded') { blockedSessionOwner = null; sessionVault = null; }
              changed();
            }); });
          ['input', 'change'].forEach(function (event) { doc.addEventListener(event, function (e) {
            if (e.target && ['sex', 'age', 'ageMonths', 'dobInput'].indexOf(e.target.id) >= 0) notify();
          }); });
          doc.addEventListener('load', function () { bindViews(); notify(); }, true);
        }
        bound.push({ view: view, doc: doc, state: state, unsubscribe: unsubscribe });
      } catch (_) { /* A frame may have closed. */ }
    });
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener); bindViews();
    return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
  }
  w.VildaPubertyAssessmentContext = Object.freeze({ VERSION: '1', readActiveContext: readActiveContext,
    gonadalForGrowth: function (options) { return readActiveContext(options).growth; },
    editObservation: editObservation, subscribe: subscribe });
})(typeof window !== 'undefined' ? window : globalThis);
