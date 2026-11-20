// Optional presentation plumbing over the native reminders actor. The source
// pairs preserve its readers, category/date rules, actions and native writers.
import { createHash } from 'node:crypto';
import { reverseBscAuthHooks } from './account-duplicate-dismissals-auth-hooks.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOME_REMINDERS_AUTH_BASE_SHA256 = '9402c916bea15516136aa5af79748542d0f5bda5aa4175738f92c73016a70f6d';
const target = fileURLToPath(new URL('../vilda_auth_ui.js', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const HELPERS = `/* BEGIN HOME REMINDERS PRESENTATION ELIGIBILITY
 * Only the moved original host can opt out of legacy placement constraints.
 * Account access, PRO, the native reader and hidden-frame rules stay native.
 */
function HomeRemindersInlineEnabled(host) {
  if (i.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || !i.document) return false;
  host = host || i.document.getElementById('remindersInline');
  return !!(host && host.id === 'remindersInline' && host.ownerDocument === i.document
    && host.isConnected !== false && host.getAttribute('data-home-reminders-presentation') === 'true'
    && host.closest && host.closest('#vhomeMainCards')
    && i.VildaHomeRemindersPresentation && typeof i.VildaHomeRemindersPresentation.decorate === 'function');
}
function HomeRemindersPresentationRequested(options) {
  return !!(options && options.homePresentation === true && i.__VILDA_HOME_WORKSPACE_PREVIEW__ === true
    && i.VildaHomeRemindersPresentation && typeof i.VildaHomeRemindersPresentation.decorate === 'function');
}
function HomeRemindersInlineReadPhase(host, phase) {
  var view = typeof remB22Views !== 'undefined' && remB22Views.get(host);
  if (view && view.homePresentation && view.alive() && view.setReadPhase) view.setReadPhase(phase);
}
function HomeRemindersInlineFailure(host) {
  if (!HomeRemindersInlineEnabled(host) || !dl() || Fr()) return false;
  var view = remB22Views.get(host);
  if (!view || !view.alive() || !view.homePresentation) {
    if (view) view.destroyCare();
    view = remB22Create(host, false, { homePresentation: true }); remB22Views.set(host, view);
  }
  view.showReadFailure(); return true;
}
/* END HOME REMINDERS PRESENTATION ELIGIBILITY */
`;
const FACTORY_HELPERS = `  /* BEGIN HOME REMINDERS PRESENTATION CONTROLLER */
  var HomeRemindersRequested = HomeRemindersPresentationRequested(options);
  var HomeRemindersPresentation = null, HomeRemindersUpdating = false, HomeRemindersOutcomeCleanup = null;
  var HomeRemindersReadPhase = 'loading', HomeRemindersHistoryReadPhase = 'loading';
  function HomeRemindersDateParts(value) {
    var day = remB22Day(value), month = Number(day.slice(5, 7));
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(day) || month < 1 || month > 12) return { day: '', month: '' };
    return { day: day.slice(8, 10), month: new Intl.DateTimeFormat('pl-PL', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1))) };
  }
  function HomeRemindersRequest(request) {
    if (HomeRemindersContext && (!HomeRemindersRequested || !HomeRemindersContextCurrent(HomeRemindersContext))) return false;
    return remB22Request(HomeRemindersRequested ? Object.assign({}, request || {}, { homePresentation: true,
      homeContext: HomeRemindersContext, contextLabel: options.contextLabel || '', showPatientName: options.showPatientName !== false }) : request);
  }
  function HomeRemindersDispose() {
    var mainCleanup = HomeRemindersMainCleanup; HomeRemindersMainCleanup = null;
    if (mainCleanup) { try { mainCleanup(); } catch (error) { Ot('homeRemindersMainHistoryDestroy', error); } }
    HomeRemindersClearOutcome();
    var presentation = HomeRemindersPresentation; HomeRemindersPresentation = null;
    if (presentation && typeof presentation.destroy === 'function') {
      try { presentation.destroy(); } catch (error) { Ot('homeRemindersDestroy', error); }
    }
  }
  function HomeRemindersClearOutcome() {
    var cleanup = HomeRemindersOutcomeCleanup; HomeRemindersOutcomeCleanup = null;
    if (cleanup) { try { cleanup(); } catch (error) { Ot('homeRemindersDialogDestroy', error); } }
  }
  function HomeRemindersOnDialog(dialog) {
    HomeRemindersClearOutcome();
    var decorationCleanup = null, historyCleanup = HomeRemindersBindNativeDialog(dialog, { kind: 'outcome' });
    if (HomeRemindersPresentation && typeof HomeRemindersPresentation.onDialog === 'function') {
      try { decorationCleanup = HomeRemindersPresentation.onDialog(dialog); }
      catch (error) { Ot('homeRemindersDialog', error); }
    }
    HomeRemindersOutcomeCleanup = function () {
      try { if (typeof decorationCleanup === 'function') decorationCleanup(); }
      finally { if (typeof historyCleanup === 'function') historyCleanup(); }
    };
  }
  function HomeRemindersUpdate() {
    if (!HomeRemindersPresentation || HomeRemindersUpdating || !alive()) return;
    HomeRemindersUpdating = true;
    try {
      var rows = visible(), entries = [], nativeNodes = Array.from(list.querySelectorAll('[data-note-id]'));
      var phase = state.historyLoading ? 'loading' : state.tab === 'history' ? HomeRemindersHistoryReadPhase : HomeRemindersReadPhase;
      if (state.savedOutcome && state.savedOutcome.awaitingRead) phase = state.savedOutcome.readError ? 'error' : 'partial';
      var limit = full ? state.tab === 'history' ? state.historyLimit : rows.length : 2;
      if (state.tab !== 'plans' && state.tab !== 'search' && !state.editing && !state.historyLoading) {
        rows.slice(0, limit).forEach(function (row) {
          var node = nativeNodes.find(function (candidate) { return candidate.dataset.noteId === row.n.id; });
          if (!node) return;
          var entry = {
            id: row.n.id, node: node,
            dateParts: HomeRemindersDateParts(row.n.dueDateISO),
            sourceLabel: row.n.careContext && row.n.careContext.planId ? 'Plan opieki' : remA7Category(row.n.category),
            titleLabel: row.n.title || Jv(row.n.category).label,
            dateLabel: remB22Date(row.n.dueDateISO) + (row.n.dueTime ? ' · ' + row.n.dueTime : ''),
            statusLabel: status(row)
          };
          if (full) {
            entry.detailNode = make('section', 'vhome-reminders-native-entry');
            entry.detailNode.dataset.homeReminderId = row.n.id;
            HomeRemindersRenderDetail(entry.detailNode, row);
          }
          entries.push(entry);
        });
      }
      HomeRemindersPresentation.render({
        phase: phase, activeTab: state.tab,
        total: phase === 'ready' ? rows.length : null, entries: entries, busy: state.busy, editing: state.editing,
        inlineFormEditing: root.classList.contains('vb22-form-editing'),
        detachedDetailVisible: !!(full && state.detached && state.detached.n.id === state.selected),
        contextLabel: typeof options.contextLabel === 'string' ? options.contextLabel : '',
        showPatientName: options.showPatientName !== false,
        emptyText: state.tab === 'history' ? 'Brak wykonanych spraw z terminem.'
          : state.rows.length ? 'Brak spraw w tym filtrze.' : HomeRemindersContext ? 'Brak przypomnień wybranego pacjenta. Możesz dodać nowe przypomnienie.' : 'Brak przypomnień na dziś. Możesz dodać nowe przypomnienie.',
        tailNodes: Array.from(list.children).filter(function (node) {
          return node.classList && ['vb22-empty', 'vild-rem-empty', 'vb22-text', 'vb22-error'].some(function (name) { return node.classList.contains(name); });
        }),
        feedbackNodes: Array.from(detail.children).concat(Array.from(list.children)).filter(function (node) {
          return node.classList.contains('vb22-notice') || node.classList.contains('vb22-error');
        })
      });
    } catch (error) { Ot('homeRemindersPresentation', error); }
    finally { HomeRemindersUpdating = false; }
  }
  function HomeRemindersDecorate() {
    if (!HomeRemindersRequested) return;
    HomeRemindersPresentation = i.VildaHomeRemindersPresentation.decorate({
      root: root, host: host, full: full,
      nodes: { header: header, heading: heading, title: heading.firstChild, subtitle: subtitle, tools: tools,
        privacyButton: privacyButton, addButton: addButton, exitButton: exitButton, tabs: tabs,
        activeTab: activeTab, historyTab: historyTab, plansTab: plansTab, count: tabCount,
        filters: filters, layout: layout, left: left, searchTools: searchTools, search: search,
        list: list, detail: detail, footer: footer, careHost: careHost, globalSearchHost: globalSearchHost },
      commands: {
        isCurrent: alive,
        selectTab: function (tab) { if (!alive() || state.busy || state.editing || ['active', 'history', 'plans'].indexOf(tab) < 0) return false; return switchTab(tab); },
        openAll: function (request) { if (!alive() || state.busy || state.editing) return false; return HomeRemindersRequest(request || {}); },
        add: function () { if (!alive() || state.busy || state.editing) return false; return addReminder(); },
        close: closed
      }
    });
  }
  /* END HOME REMINDERS PRESENTATION CONTROLLER */
`;

// Patient context is a short-lived controller lease, never persistent data.
// Its current() closure belongs to the originating frame: the top shell has
// its own Vault facade and must not compare that facade with the frame's one.
const SCOPE_HELPERS = `/* BEGIN HOME REMINDERS PATIENT CONTEXT */
var HomeRemindersContexts = new WeakMap(), HomeRemindersEditorLeases = new Set();
function HomeRemindersDisposeEditors(context) {
  Array.from(HomeRemindersEditorLeases).forEach(function (lease) { if (lease.context === context) lease.dispose(); });
}
function HomeRemindersContextCurrent(context) {
  if (!context) return true;
  try { return context.current() === true; } catch (_) { return false; }
}
function HomeRemindersInlineContext(host, supplied) {
  var context = HomeRemindersContexts.get(host);
  if (!supplied || supplied.homePresentation !== true || !Object.prototype.hasOwnProperty.call(supplied, 'patientId')) return HomeRemindersInlineEnabled(host) ? context || null : null;
  if (context && context.source === supplied) return context;
  if (context) HomeRemindersDisposeScope(host, context.source);
  var owner = remReadOwner(), retired = false, patientId = typeof supplied.patientId === 'string' ? supplied.patientId.trim() : '';
  var isCurrent = supplied.isCurrent, openPatient = supplied.openPatient, openNote = supplied.openNote, onDialog = supplied.onDialog;
  context = Object.freeze({ source: supplied, patientId: patientId,
    contextLabel: typeof supplied.contextLabel === 'string' ? supplied.contextLabel : '',
    showPatientName: supplied.showPatientName !== false,
    openPatient: typeof openPatient === 'function' ? openPatient : null,
    openNote: typeof openNote === 'function' ? openNote : null,
    onDialog: typeof onDialog === 'function' ? onDialog : null,
    current: function () { return !retired && !!patientId && remReadCurrent(owner) && typeof isCurrent === 'function' && isCurrent() === true; },
    retire: function () { retired = true; }
  });
  HomeRemindersContexts.set(host, context); return context;
}
function HomeRemindersInlineViewOptions(host) {
  var context = HomeRemindersContexts.get(host);
  return context ? { homePresentation: true, homeContext: context, contextLabel: context.contextLabel, showPatientName: context.showPatientName } : { homePresentation: true };
}
function HomeRemindersDisposeScope(host, source) {
  var context = host ? HomeRemindersContexts.get(host) : source;
  if (!context || host && context.source !== source) return false;
  if (host) {
    context.retire();
    var inline = remB22Views.get(host);
    if (inline && inline.homeContext === context) { inline.close(); remB22Views.delete(host); }
    remInlineHide(host);
  }
  HomeRemindersDisposeEditors(context);
  if (remB22Full && remB22Full.homeContext === context) remB22Full.close();
  try {
    if (host && i.top && i.top !== i && i.top.VildaAuthUI && typeof i.top.VildaAuthUI.disposeHomeReminders === 'function') i.top.VildaAuthUI.disposeHomeReminders(null, context);
  } catch (_) {}
  // Keep a retired registration: an automatic legacy refresh must not turn an
  // empty or changing patient scope into an account-wide home card.
  return true;
}
function HomeRemindersShowReadFailure(request) {
  var context = request && request.homeContext;
  if (!context || !HomeRemindersContextCurrent(context)) return false;
  remB22Open([], { homePresentation: true, homeContext: context,
    contextLabel: request.contextLabel || context.contextLabel || '', showPatientName: request.showPatientName !== false });
  if (remB22Full && remB22Full.homeContext === context && remB22Full.alive()) { remB22Full.showReadFailure(); return true; }
  return false;
}
/* END HOME REMINDERS PATIENT CONTEXT */
`;

const SCOPE_FACTORY_HELPERS = `  /* BEGIN HOME REMINDERS PATIENT CONTROLLER */
  var HomeRemindersContext = options.homeContext || null, HomeRemindersMainCleanup = null;
  function HomeRemindersBindNativeDialog(dialog, metadata) {
    if (!HomeRemindersContext || !HomeRemindersCurrent() || !HomeRemindersContext.onDialog) return null;
    try { return HomeRemindersContext.onDialog(dialog, metadata); }
    catch (error) { Ot('homeRemindersDialogHistory', error); return null; }
  }
  function HomeRemindersBindMainDialog() {
    if (!full || HomeRemindersMainCleanup || !root.open || !alive()) return;
    HomeRemindersMainCleanup = HomeRemindersBindNativeDialog(root, { kind: 'main' });
  }
  function HomeRemindersOwnNote(note) { return !HomeRemindersContext || !!(note && note.patientId === HomeRemindersContext.patientId && !note.isActivity && !note.isExternal); }
  function HomeRemindersOwnRow(row) { return !HomeRemindersContext || !!(row && row.g && row.g.patientId === HomeRemindersContext.patientId && !row.g.isActivity && !row.g.isExternal && HomeRemindersOwnNote(row.n)); }
  function HomeRemindersRows(groups) { return remB22Flat(groups).filter(HomeRemindersOwnRow); }
  function HomeRemindersCurrent() { return remReadCurrent(owner) && HomeRemindersContextCurrent(HomeRemindersContext); }
  function HomeRemindersReadGroups() { return HomeRemindersContext ? vault.listPatientNotesDueByDate('9999-12-31T23:59:59.999Z') : vault.listPatientNotesDueByDate(); }
  function HomeRemindersOpenPatient(patientId, noteId) {
    if (!HomeRemindersContext) return false;
    if (!alive() || state.busy || state.editing || patientId !== HomeRemindersContext.patientId) return false;
    var open = HomeRemindersContext.openPatient;
    if (!open) return false;
    close();
    if (HomeRemindersCurrent()) open(patientId, noteId || null);
    return true;
  }
  function HomeRemindersPosition() {
    return { tab: state.tab, filter: state.filter, query: state.query, selected: state.selected,
      historyLimit: state.historyLimit, scrollTop: list.scrollTop };
  }
  async function HomeRemindersRestorePosition(position) {
    if (!HomeRemindersContext || !position || !alive() || state.editing || state.busy) return false;
    var tab = position.tab === 'history' ? 'history' : 'active';
    state.filter = keys.some(function (entry) { return entry[0] === position.filter; }) ? position.filter : 'all';
    state.query = typeof position.query === 'string' ? position.query : ''; search.value = state.query;
    var pending = switchTab(tab), ticket = sequence;
    await pending;
    if (!alive() || ticket !== sequence || state.editing || state.tab !== tab || state.historyLoading || tab === 'history' && !state.historyReady) return false;
    if (Number.isInteger(position.historyLimit) && position.historyLimit >= 50) state.historyLimit = position.historyLimit;
    var rows = visible();
    if (rows.some(function (row) { return row.n.id === position.selected; })) state.selected = position.selected;
    render();
    if (Number.isFinite(position.scrollTop) && position.scrollTop >= 0) list.scrollTop = position.scrollTop;
    return true;
  }
  function HomeRemindersOpenEditor(request) {
    if (!HomeRemindersContext) return ga(request);
    if (!HomeRemindersCurrent() || !request || request.patientId !== HomeRemindersContext.patientId
        || request.note && !HomeRemindersOwnNote(request.note) || !HomeRemindersContext.openNote) return false;
    var saved = request.onSaved, cancelled = request.onCancel, editor = null, lease = null;
    function release(closeEditor) {
      if (lease) { HomeRemindersEditorLeases.delete(lease); lease = null; }
      if (closeEditor && editor && typeof editor.destroy === 'function') editor.destroy();
    }
    editor = HomeRemindersContext.openNote(Object.assign({}, request, {
      isCurrent: HomeRemindersCurrent,
      onSaved: function () { release(false); if (HomeRemindersCurrent() && typeof saved === 'function') saved(); },
      onCancel: function () { release(false); if (HomeRemindersCurrent() && typeof cancelled === 'function') cancelled(); }
    }));
    if (editor && typeof editor.destroy === 'function') {
      lease = { context: HomeRemindersContext, dispose: function () { release(true); } };
      HomeRemindersEditorLeases.add(lease);
      Promise.resolve(editor.ready).then(function () { if (!editor.isCurrent()) release(false); }, function () { release(true); });
    }
    return editor;
  }
  /* END HOME REMINDERS PATIENT CONTROLLER */
`;

const PAIRS = [
  ['function remInlineReserved() {\n  var root =', HELPERS + SCOPE_HELPERS + 'function remInlineReserved() {\n  if (HomeRemindersInlineEnabled()) return false;\n  var root ='],
  ['function dl(){var t=jt();return!(!t||typeof t.isUnlocked!="function"||!t.isUnlocked()||!ll()||typeof t.listPatientNotesDueByDate!="function"||Lr()||!sl())}',
    'function dl(){var t=jt();return!(!t||typeof t.isUnlocked!="function"||!t.isUnlocked()||!ll()||typeof t.listPatientNotesDueByDate!="function"||!HomeRemindersInlineEnabled()&&(Lr()||!sl()))}'],
  ['function Dr(t){try{var a=', 'function Dr(t){if(HomeRemindersInlineEnabled(t)){["height","maxHeight","minHeight"].forEach(function(name){if(t.style[name])t.style[name]=""});return}try{var a='],
  ['if (!view || !view.alive()) { if (view) view.destroyCare(); view = remB22Create(host, false, {}); remB22Views.set(host, view); }',
    'var homePresentation = HomeRemindersInlineEnabled(host);\n  if (!view || !view.alive() || view.homePresentation !== homePresentation) { if (view) view.destroyCare(); view = remB22Create(host, false, homePresentation ? { homePresentation: true } : {}); remB22Views.set(host, view); }'],
  ['if (remB22Full && remB22Full.alive()) { remB22Full.request(options || {}); return remB22Full.root; }',
    'if (remB22Full && remB22Full.alive()) {\n    if (remB22Full.homePresentation === HomeRemindersPresentationRequested(options)) { remB22Full.request(options || {}); return remB22Full.root; }\n    if (!remB22Full.canChangePresentation()) return remB22Full.root;\n    remB22Full.close();\n  }'],
  ['var previousFocus = i.document.activeElement, previousNavHidden = i.document.body.classList.contains(\'nav-ui-temporarily-hidden\');\n  function alive()',
    'var previousFocus = i.document.activeElement, previousNavHidden = i.document.body.classList.contains(\'nav-ui-temporarily-hidden\');\n' + FACTORY_HELPERS + SCOPE_FACTORY_HELPERS + '  function alive()'],
  ['function close() {\n    sequence += 1; if (timer) i.clearTimeout(timer);',
    'function close() {\n    HomeRemindersDispose();\n    sequence += 1; if (timer) i.clearTimeout(timer);'],
  ["  if (privacy) privacyCleanup = privacy.register({ root: root, content: [tabs, filters, layout, careHost, globalSearchHost, footer], button: privacyButton, header: header });",
    "  HomeRemindersDecorate();\n  if (privacy) privacyCleanup = privacy.register({ root: root, content: [tabs, filters, layout, careHost, globalSearchHost, footer], button: privacyButton, header: header });"],
  ['  function render() {\n    if (!alive()) return;\n    var previousScroll = list.scrollTop; counts(); clear(list);',
    '  function render() {\n    try {\n    if (!alive()) return;\n    var previousScroll = list.scrollTop; counts(); clear(list);'],
  ["rows.slice(0, state.tab === 'history' ? state.historyLimit : rows.length).forEach(function (row) { list.appendChild(rowNode(row)); });",
    "rows.slice(0, HomeRemindersPresentation && !full ? 2 : state.tab === 'history' ? state.historyLimit : rows.length).forEach(function (row) { list.appendChild(rowNode(row)); });"],
  ['    if (full && !state.editing) renderDetail();\n  }\n  function openCard(row, noteId) {',
    '    if (full && !state.editing) renderDetail();\n    } finally { HomeRemindersUpdate(); }\n  }\n  function openCard(row, noteId) {'],
  ['  function renderDetail() {\n    clear(detail); detail.scrollTop = 0; var row = currentRow();',
    '  function renderDetail() { return HomeRemindersRenderDetail(detail, currentRow()); }\n  function HomeRemindersRenderDetail(detail, row) {\n    clear(detail); detail.scrollTop = 0;'],
  ['state.editing = value; counts(); }', 'state.editing = value; counts(); HomeRemindersUpdate(); }'],
  ["editing(true); root.classList.add('vb22-form-editing');", "editing(true); root.classList.add('vb22-form-editing'); HomeRemindersUpdate();"],
  ['    if (privacy) outcomePrivacyCleanup = privacy.protectDialog(dialog);\n    i.document.body.appendChild(dialog); fit(); dialog.showModal(); closeButton.focus({ preventScroll: true });',
    '    HomeRemindersOnDialog(dialog);\n    if (privacy) outcomePrivacyCleanup = privacy.protectDialog(dialog);\n    i.document.body.appendChild(dialog); fit(); dialog.showModal(); closeButton.focus({ preventScroll: true });'],
  ['if (outcomePrivacyCleanup) { outcomePrivacyCleanup(); outcomePrivacyCleanup = null; }',
    'HomeRemindersClearOutcome();\n    if (outcomePrivacyCleanup) { outcomePrivacyCleanup(); outcomePrivacyCleanup = null; }'],
  ['var controller = { root: root, owner: owner, alive: alive, close: close, changed: changed, refresh: refresh, fit: fit,',
    'var controller = { root: root, owner: owner, alive: alive, close: close, changed: changed, refresh: refresh, fit: fit, homePresentation: HomeRemindersRequested, canChangePresentation: function () { return !state.busy && !state.editing; },'],
  ['destroyCare: function () { if (careView)', 'destroyCare: function () { HomeRemindersDispose(); if (careView)'],
  ['setGroups: function (groups) { if (!alive()) return; state.rows = remB22Flat(groups); if (!state.editing) render(); },',
    "setReadPhase: function (phase) { if (!alive()) return; HomeRemindersReadPhase = phase; HomeRemindersUpdate(); },\n    showReadFailure: function () { if (!alive()) return; HomeRemindersReadPhase = 'error'; clear(list); list.appendChild(remReadErrorContent(function () { Rr(); })); HomeRemindersUpdate(); },\n    setGroups: function (groups) { if (!alive()) return; HomeRemindersReadPhase = 'ready'; state.rows = remB22Flat(groups); if (!state.editing) render(); },"],
  ["  t.setAttribute('aria-busy', 'true');\n  var n;", "  t.setAttribute('aria-busy', 'true'); HomeRemindersInlineReadPhase(t, 'loading');\n  var n;"],
  ['function remInlineError(host) {\n  oe(host);',
    "function remInlineError(host) {\n  if (HomeRemindersInlineFailure(host)) { host.setAttribute('data-reminders-state', 'error'); host.setAttribute('aria-busy', 'false'); Nr(); return; }\n  oe(host);"],
  ['    var ticket = ++sequence;\n    try {\n      var groups = await vault.listPatientNotesDueByDate();',
    "    var ticket = ++sequence;\n    HomeRemindersReadPhase = 'loading'; if (state.tab === 'history') HomeRemindersHistoryReadPhase = 'loading'; HomeRemindersUpdate();\n    try {\n      var groups = await vault.listPatientNotesDueByDate();"],
  ['state.historyReady = true; state.historyLoading = false; return true;', "state.historyReady = true; state.historyLoading = false; HomeRemindersHistoryReadPhase = 'ready'; return true;"],
  ["catch (error) { if (alive() && ticket === sequence && !state.editing) { state.historyLoading = false; render(); report(error, list); list.appendChild(textButton('Spróbuj ponownie', function () { switchTab('history'); })); } return; }",
    "catch (error) { if (alive() && ticket === sequence && !state.editing) { state.historyLoading = false; HomeRemindersHistoryReadPhase = 'error'; render(); report(error, list); list.appendChild(textButton('Spróbuj ponownie', function () { switchTab('history'); })); HomeRemindersUpdate(); } return; }"],
  ['state.historyLoading = false; state.stale = false; render();', "state.historyLoading = false; state.stale = false; HomeRemindersReadPhase = 'ready'; render();"],
  ["        Ot('readRemindersB22', error); state.historyLoading = false;", "        Ot('readRemindersB22', error); state.historyLoading = false; HomeRemindersReadPhase = 'error'; if (state.tab === 'history') HomeRemindersHistoryReadPhase = 'error';"],
  ["if (!state.savedOutcome || !state.savedOutcome.readError) { report(new Error('Nie udało się wczytać przypomnień.'), list); list.appendChild(textButton('Spróbuj ponownie', refresh)); }",
    "if (!state.savedOutcome || !state.savedOutcome.readError) { report(new Error('Nie udało się wczytać przypomnień.'), list); list.appendChild(textButton('Spróbuj ponownie', refresh)); }\n        HomeRemindersUpdate();"],
  ['globalSearch: t && t.globalSearch, searchContext: t && t.searchContext }); return true;',
    'globalSearch: t && t.globalSearch, searchContext: t && t.searchContext, homePresentation: t && t.homePresentation === true }); return true;']
];

const SCOPE_PAIRS = [
  [
    "async function Br(t) {\n  if (!t || !remInlineAllowed(t)) return;",
    "async function Br(t, homeOptions) {\n  if (!t) return;\n  var homeContext = HomeRemindersInlineContext(t, homeOptions);\n  if (homeContext && !HomeRemindersContextCurrent(homeContext)) { remInlineHide(t); return; }\n  if (!remInlineAllowed(t)) return;\n  if (homeContext && t.style.display) t.style.removeProperty('display');"
  ],
  [
    "function current() { return state.sequence === sequence && remReadCurrent(owner) && remInlineAllowed(t); }",
    "function current() { return state.sequence === sequence && remReadCurrent(owner) && remInlineAllowed(t)\n    && (!homeContext || HomeRemindersInlineContext(t) === homeContext && HomeRemindersContextCurrent(homeContext)); }"
  ],
  [
    "  if (!current()) return;\n  t.setAttribute('data-reminders-state', 'ready');",
    "  if (!current()) return;\n  var homeGroups;\n  if (homeContext) {\n    try { homeGroups = await owner.vault.listPatientNotesDueByDate('9999-12-31T23:59:59.999Z'); }\n    catch (error) { if (current()) { Ot('readHomeRemindersInline', error); remInlineError(t); } return; }\n    if (!current()) return;\n  }\n  t.setAttribute('data-reminders-state', 'ready');"
  ],
  [
    "remB22Inline(t, n); return;",
    "remB22Inline(t, n, homeGroups); return;"
  ],
  [
    "function remB22Inline(host, groups) {",
    "function remB22Inline(host, groups, homeGroups) {"
  ],
  [
    "var homePresentation = HomeRemindersInlineEnabled(host);\n  if (!view || !view.alive() || view.homePresentation !== homePresentation) { if (view) view.destroyCare(); view = remB22Create(host, false, homePresentation ? { homePresentation: true } : {}); remB22Views.set(host, view); }\n  view.setGroups(groups);",
    "var homePresentation = HomeRemindersInlineEnabled(host), homeContext = homePresentation ? HomeRemindersInlineContext(host) : null;\n  if (homeContext && !HomeRemindersContextCurrent(homeContext)) { remInlineHide(host); return; }\n  if (!view || !view.alive() || view.homePresentation !== homePresentation || view.homeContext !== homeContext) { if (view) view.destroyCare(); view = remB22Create(host, false, homePresentation ? HomeRemindersInlineViewOptions(host) : {}); remB22Views.set(host, view); }\n  view.setGroups(homeGroups || groups);"
  ],
  [
    "view = remB22Create(host, false, { homePresentation: true }); remB22Views.set(host, view);",
    "view = remB22Create(host, false, HomeRemindersInlineViewOptions(host)); remB22Views.set(host, view);"
  ],
  [
    "    if (remB22Full.homePresentation === HomeRemindersPresentationRequested(options)) { remB22Full.request(options || {}); return remB22Full.root; }",
    "    if (remB22Full.homePresentation === HomeRemindersPresentationRequested(options) && remB22Full.homeContext === (options && options.homeContext || null)) { remB22Full.request(options || {}); return remB22Full.root; }"
  ],
  [
    "function remB22Open(groups, options) {\n  al();",
    "function remB22Open(groups, options) {\n  if (options && options.homeContext && (!HomeRemindersPresentationRequested(options) || !HomeRemindersContextCurrent(options.homeContext))) return null;\n  al();\n  if (remB22Full && remB22Full.homeContext && !remB22Full.alive()) remB22Full.close();"
  ],
  [
    "function alive() { return root.isConnected && remReadCurrent(owner); }",
    "function alive() { return root.isConnected && remReadCurrent(owner) && HomeRemindersContextCurrent(HomeRemindersContext); }"
  ],
  [
    "function btn(text, cls, fn) { return remB22Button(text, cls, fn); }",
    "function btn(text, cls, fn) { return remB22Button(text, cls, function (event) { if (HomeRemindersContext && !alive()) return; return fn(event); }); }"
  ],
  [
    "var search = make('input', 'vb22-search'); search.type = 'search'; search.placeholder = 'Szukaj pacjenta lub sprawy…'; search.setAttribute('aria-label', 'Szukaj pacjenta lub sprawy');",
    "var search = make('input', 'vb22-search'); search.type = 'search'; search.placeholder = HomeRemindersContext ? 'Szukaj przypomnienia…' : 'Szukaj pacjenta lub sprawy…'; search.setAttribute('aria-label', HomeRemindersContext ? 'Szukaj przypomnienia' : 'Szukaj pacjenta lub sprawy');"
  ],
  [
    "careView = module.mount(careHost, { full: full, vault: vault, planId:",
    "careView = module.mount(careHost, { full: full, vault: vault, patientId: HomeRemindersContext && HomeRemindersContext.patientId || null, planId:"
  ],
  [
    "openPatient: function (patientId, noteId) {\n          if (careReturn",
    "openPatient: function (patientId, noteId) {\n          if (HomeRemindersContext) return HomeRemindersOpenPatient(patientId, noteId);\n          if (careReturn"
  ],
  [
    "openRecordDetails: async function (record, onChanged, isCurrentRecord) {\n          var fromSearch",
    "openRecordDetails: async function (record, onChanged, isCurrentRecord) {\n          if (HomeRemindersContext && (!alive() || !HomeRemindersOwnNote(record))) return false;\n          var fromSearch"
  ],
  [
    "if(!isCurrentRecord()||!note||note.id!==record.id||note.patientId!==record.patientId||!note.careContext||note.careContext.planId!==record.careContext.planId)return false;",
    "if(!isCurrentRecord()||!note||note.id!==record.id||note.patientId!==record.patientId||!HomeRemindersOwnNote(note)||!note.careContext||note.careContext.planId!==record.careContext.planId)return false;"
  ],
  [
    "if (!note || note.id!==noteId) return false;",
    "if (!note || note.id!==noteId || !HomeRemindersOwnNote(note)) return false;"
  ],
  [
    "function openCard(row, noteId) {\n    if (state.editing || state.busy) return;",
    "function openCard(row, noteId) {\n    if (state.editing || state.busy) return;\n    if (HomeRemindersContext) { if (HomeRemindersOwnRow(row)) HomeRemindersOpenPatient(row.g.patientId, noteId || row.n.id); return; }"
  ],
  [
    "if (state.busy) return; more.open = false; state.busy = true;",
    "if (state.busy || !alive() || !HomeRemindersOwnRow(row)) return; more.open = false; state.busy = true;"
  ],
  [
    "if (!row) { detail.appendChild(make('p', 'vb22-empty', 'Wybierz sprawę z listy lub dodaj przypomnienie.')); return; }",
    "if (!row || !HomeRemindersOwnRow(row)) { detail.appendChild(make('p', 'vb22-empty', 'Wybierz sprawę z listy lub dodaj przypomnienie.')); return; }"
  ],
  [
    "var note = await vault.getPatientNote(id); if (!alive() || ticket !== sequence || state.editing || !note) return;",
    "var note = await vault.getPatientNote(id); if (!alive() || ticket !== sequence || state.editing || !note || !HomeRemindersOwnNote(note)) return;"
  ],
  [
    "var day = remB22Day(note && note.dueDateISO); if (!day) return null;",
    "var day = remB22Day(note && note.dueDateISO); if (!day || !HomeRemindersOwnNote(note)) return null;"
  ],
  [
    "var current = (notes || []).find(function (item) { return item.id === note.id; });",
    "var current = (notes || []).find(function (item) { return item.id === note.id && HomeRemindersOwnNote(item); });"
  ],
  [
    "if (state.editing || state.busy || !alive()) return;\n    editing(true);",
    "if (state.editing || state.busy || !alive() || !HomeRemindersOwnRow(row)) return;\n    editing(true);"
  ],
  [
    "async function addReminder() {\n    if (state.editing || state.busy) return;",
    "async function addReminder() {\n    if (state.editing || state.busy || !alive()) return;"
  ],
  [
    "if (state.busy || !pickerAlive()) return;\n      selectedPatient = null;",
    "if (state.busy || !pickerAlive() || HomeRemindersContext) return;\n      selectedPatient = null;"
  ],
  [
    "if (state.busy || !pickerAlive()) return;\n      selectedPatient = record;",
    "if (state.busy || !pickerAlive() || HomeRemindersContext && record.patientId !== HomeRemindersContext.patientId) return;\n      selectedPatient = record;"
  ],
  [
    "return record && typeof record.patientId === 'string' && record.patientId;",
    "return record && typeof record.patientId === 'string' && record.patientId && (!HomeRemindersContext || record.patientId === HomeRemindersContext.patientId);"
  ],
  [
    "patientsReady = true; renderPatients();",
    "patientsReady = true; renderPatients();\n        if (HomeRemindersContext) {\n          var fixedPatient = patientHeaders.find(function (record) { return record.patientId === HomeRemindersContext.patientId; });\n          if (fixedPatient) { choosePatient(fixedPatient); clearPatient.hidden = true; patientStatus.textContent = 'Przypomnienie dotyczy wybranego pacjenta.'; title.focus({ preventScroll: true }); }\n        }"
  ],
  [
    "async function loadCareChoices(patientId) {\n      clearCareChoices();",
    "async function loadCareChoices(patientId) {\n      if (HomeRemindersContext && (!pickerAlive() || patientId !== HomeRemindersContext.patientId)) return;\n      clearCareChoices();"
  ],
  [
    "var chosenPatient = selectedPatient;\n      state.busy",
    "var chosenPatient = selectedPatient;\n      if (HomeRemindersContext && (!HomeRemindersOwnNote({ patientId: chosenPatient.patientId }) || !HomeRemindersCurrent())) return;\n      state.busy"
  ],
  [
    "return note.category !== 'absence' && (note.completedAtISO || note.noShowAtISO);",
    "return HomeRemindersOwnNote(note) && note.category !== 'absence' && (note.completedAtISO || note.noShowAtISO);"
  ],
  [
    "var groups = await vault.listPatientNotesDueByDate();\n      if (!alive()",
    "var groups = await HomeRemindersReadGroups();\n      if (!alive()"
  ],
  [
    "state.rows = remB22Flat(groups); state.historyReady = false;",
    "state.rows = HomeRemindersRows(groups); state.historyReady = false;"
  ],
  [
    "state.rows = remB22Flat(groups); if (!state.editing) render();",
    "state.rows = HomeRemindersRows(groups); if (!state.editing) render();"
  ],
  [
    "if (detachedNote && !state.rows.some",
    "if (detachedNote && HomeRemindersOwnNote(detachedNote) && !state.rows.some"
  ],
  [
    "homePresentation: HomeRemindersRequested, canChangePresentation",
    "homePresentation: HomeRemindersRequested, homeContext: HomeRemindersContext, bindHomeDialog: HomeRemindersBindMainDialog, canChangePresentation"
  ],
  [
    "else if (request.globalSearch || request.history) { switchTab('search'); mountGlobalSearch(request.history ? { status: 'completed' } : request.globalSearch); }",
    "else if (request.globalSearch || request.history) { if (HomeRemindersContext) switchTab('history'); else { switchTab('search'); mountGlobalSearch(request.history ? { status: 'completed' } : request.globalSearch); } }"
  ],
  [
    "var owner, sequence, forced = !!(t && t.force);",
    "var owner, sequence, forced = !!(t && t.force);\n  var homeContext = t && t.homeContext || null;\n  if (homeContext && (!HomeRemindersPresentationRequested(t) || !HomeRemindersContextCurrent(homeContext))) return false;"
  ],
  [
    "function searchReturnCurrent() { return !restoringSearch || t._searchReturnCurrent(); }",
    "function searchReturnCurrent() { return (!homeContext || HomeRemindersContextCurrent(homeContext)) && (!restoringSearch || t._searchReturnCurrent()); }"
  ],
  [
    "var groups = await vault.listPatientNotesDueByDate();\n    if (sequence !== remMaybeReadSequence",
    "var groups = homeContext ? await vault.listPatientNotesDueByDate('9999-12-31T23:59:59.999Z') : await vault.listPatientNotesDueByDate();\n    if (sequence !== remMaybeReadSequence"
  ],
  [
    "homePresentation: t && t.homePresentation === true }); return true;",
    "homePresentation: t && t.homePresentation === true, homeContext: homeContext, homePosition: t && t.homePosition, contextLabel: t && t.contextLabel, showPatientName: t && t.showPatientName }); return true;"
  ],
  [
    "renderRemindersInline:Br,syncRemindersInline:Rr,",
    "renderRemindersInline:Br,syncRemindersInline:Rr,disposeHomeReminders:HomeRemindersDisposeScope,"
  ],
  [
    "state.tab === 'history' ? 'Brak wykonanych spraw z terminem.' : state.rows.length ? 'Brak spraw w tym filtrze.' : 'Brak przypomnień na dziś. Możesz dodać nowe przypomnienie.'));",
    "state.tab === 'history' ? 'Brak wykonanych spraw z terminem.' : state.rows.length ? 'Brak spraw w tym filtrze.' : HomeRemindersContext ? 'Brak przypomnień wybranego pacjenta. Możesz dodać nowe przypomnienie.' : 'Brak przypomnień na dziś. Możesz dodać nowe przypomnienie.'));"
  ],
  [
    "finally { state.busy = false; if (fields) fields.forEach(function (node) { node.disabled = false; }); controls.forEach(function (node) { node.disabled = false; }); nextSummary.removeAttribute('aria-disabled'); }",
    "finally { state.busy = false; if (!HomeRemindersContext || alive()) { if (fields) fields.forEach(function (node) { node.disabled = false; }); controls.forEach(function (node) { node.disabled = false; }); nextSummary.removeAttribute('aria-disabled'); } }"
  ],
  [
    "finally { state.busy = false; if (fields) fields.forEach(function (node) { node.disabled = false; }); controls.forEach(function (node) { node.disabled = false; }); updatePatientSave(); }",
    "finally { state.busy = false; if (!HomeRemindersContext || alive()) { if (fields) fields.forEach(function (node) { node.disabled = false; }); controls.forEach(function (node) { node.disabled = false; }); updatePatientSave(); } }"
  ],
  [
    "onBusy: function (working, editorOpen) { state.busy = !!working; state.editing = !!editorOpen; counts(); },",
    "onBusy: function (working, editorOpen) { if (HomeRemindersContext && !alive()) return; state.busy = !!working; state.editing = !!editorOpen; counts(); },"
  ],
  [
    "if (!saved && !note.completedAtISO && !note.noShowAtISO && remB22Day(note.dueDateISO) > Fa()) detail.appendChild(make('p', 'vb22-notice',",
    "if (!HomeRemindersContext && !saved && !note.completedAtISO && !note.noShowAtISO && remB22Day(note.dueDateISO) > Fa()) detail.appendChild(make('p', 'vb22-notice',"
  ],
  [
    "if (forced && sequence === remMaybeReadSequence && remReadCurrent(owner) && searchReturnCurrent()) remShowReadError();",
    "if (forced && sequence === remMaybeReadSequence && remReadCurrent(owner) && searchReturnCurrent()) { if (homeContext) HomeRemindersShowReadFailure(t); else remShowReadError(); }"
  ],
  [
    "showReadFailure: function () { if (!alive()) return; HomeRemindersReadPhase = 'error'; clear(list); list.appendChild(remReadErrorContent(function () { Rr(); })); HomeRemindersUpdate(); },",
    "showReadFailure: function () { if (!alive()) return; HomeRemindersReadPhase = 'error'; clear(list); list.appendChild(remReadErrorContent(full ? refresh : function () { Rr(); })); HomeRemindersUpdate(); },"
  ],
  [
    "        close(); ga({ patientId: note.patientId, note: note, onSaved: function () { HomeRemindersRequest({ noteId: note.id }); } });",
    "        var homeReturn = HomeRemindersContext ? HomeRemindersPosition() : null;\n        close(); ga({ patientId: note.patientId, note: note, onSaved: function () { HomeRemindersRequest({ noteId: note.id }); },\n          onCancel: homeReturn ? function () { HomeRemindersRequest({ homePosition: homeReturn }); } : undefined });"
  ],
  [
    "    request: function (request) {\n      if (state.editing || !alive()) return;",
    "    request: function (request) {\n      if (state.editing || !alive()) return;\n      if (HomeRemindersContext && request.homePosition) { HomeRemindersRestorePosition(request.homePosition); return; }"
  ],
  [
    "  root.showModal(); i.document.body.classList.add('vilda-reminders-open', 'nav-ui-temporarily-hidden');",
    "  root.showModal(); if (view.bindHomeDialog) view.bindHomeDialog(); i.document.body.classList.add('vilda-reminders-open', 'nav-ui-temporarily-hidden');"
  ],
  [
    "onDialog: function (dialog) { return privacy ? privacy.protectDialog(dialog) : null; },",
    "onDialog: function (dialog) {\n          var privateCleanup = privacy ? privacy.protectDialog(dialog) : null, historyCleanup = HomeRemindersBindNativeDialog(dialog, { kind: 'care' });\n          return function () { try { if (typeof privateCleanup === 'function') privateCleanup(); } finally { if (typeof historyCleanup === 'function') historyCleanup(); } };\n        },"
  ],
  [
    "  var api = target.VildaAuthUI;\n  if (api && api.maybeShowReminders)",
    "  var api = target.VildaAuthUI;\n  if (options && options.homeContext && (target.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true\n      || !api || typeof api.disposeHomeReminders !== 'function'\n      || !target.VildaHomeRemindersPresentation || typeof target.VildaHomeRemindersPresentation.decorate !== 'function')) {\n    try { if (typeof i.alert === 'function') i.alert('Odśwież całą kartę przeglądarki, aby dokończyć aktualizację aplikacji.'); } catch (_) {}\n    return false;\n  }\n  if (api && api.maybeShowReminders)"
  ]
];

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Home reminders hook anchor changed: ' + before.slice(0, 90));
  return source.replace(before, after);
}

function rewriteRequests(source, forward) {
  const start = source.indexOf('function remB22Create('), end = source.indexOf('\nfunction remB22Styles()', start);
  if (start < 0 || end < 0) throw new Error('Native reminders factory boundary missing.');
  let factory = source.slice(start, end), helper = '';
  if (factory.includes(FACTORY_HELPERS + SCOPE_FACTORY_HELPERS)) { helper = FACTORY_HELPERS + SCOPE_FACTORY_HELPERS; factory = once(factory, helper, '/* HOME REQUEST HELPER PLACEHOLDER */'); }
  const from = forward ? 'remB22Request(' : 'HomeRemindersRequest(', to = forward ? 'HomeRemindersRequest(' : 'remB22Request(';
  const count = factory.split(from).length - 1, already = factory.split(to).length - 1;
  if (!count && already === 14) return source;
  if (count !== 14 || already) throw new Error('Unexpected native reminder request count: ' + count + '/' + already);
  factory = factory.replaceAll(from, to);
  if (helper) factory = once(factory, '/* HOME REQUEST HELPER PLACEHOLDER */', helper);
  return source.slice(0, start) + factory + source.slice(end);
}

function rewriteEditors(source, forward) {
  const start = source.indexOf('function remB22Create('), end = source.indexOf('\nfunction remB22Styles()', start);
  let factory = source.slice(start, end), helper = '';
  if (factory.includes(SCOPE_FACTORY_HELPERS)) { helper = SCOPE_FACTORY_HELPERS; factory = once(factory, helper, '/* HOME EDITOR HELPER PLACEHOLDER */'); }
  const from = forward ? 'ga(' : 'HomeRemindersOpenEditor(', to = forward ? 'HomeRemindersOpenEditor(' : 'ga(';
  const count = factory.split(from).length - 1, already = factory.split(to).length - 1;
  if (!count && already === 6) return source;
  if (count !== 6 || already) throw new Error('Unexpected native editor request count: ' + count + '/' + already);
  factory = factory.replaceAll(from, to);
  if (helper) factory = once(factory, '/* HOME EDITOR HELPER PLACEHOLDER */', helper);
  return source.slice(0, start) + factory + source.slice(end);
}

export function applyHomeRemindersHooks(source) {
  if (source.includes('/* BEGIN HOME REMINDERS PATIENT CONTEXT */')) source = reverseHomeRemindersHooks(source);
  source = rewriteRequests(source, true);
  for (const [before, after] of PAIRS) {
    if (source.includes(after)) { if (source.split(after).length !== 2) throw new Error('Repeated home reminders hook.'); continue; }
    source = once(source, before, after);
  }
  for (const [before, after] of SCOPE_PAIRS) {
    if (source.includes(after)) { if (source.split(after).length !== 2) throw new Error('Repeated home reminders scope hook.'); continue; }
    source = once(source, before, after);
  }
  return rewriteEditors(source, true);
}

export function reverseHomeRemindersHooks(source) {
  source = rewriteEditors(source, false);
  for (const [before, after] of SCOPE_PAIRS.slice().reverse()) source = once(source, after, before);
  for (const [before, after] of PAIRS.slice().reverse()) source = once(source, after, before);
  return rewriteRequests(source, false);
}

export function verifyHomeRemindersHooks(source) {
  if (applyHomeRemindersHooks(source) !== source) throw new Error('Home reminders hooks are not applied.');
  const base = reverseHomeRemindersHooks(source);
  if (digest(base.includes('/* BEGIN ACCOUNT DUPLICATE DISMISSALS V2') ? reverseBscAuthHooks(base) : base) !== HOME_REMINDERS_AUTH_BASE_SHA256) throw new Error('Native AuthUI base differs after reversing only the presentation hooks.');
  if (applyHomeRemindersHooks(base) !== source) throw new Error('Home reminders replay differs.');
  return { source, base, sha256: digest(source) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && !['--check', '--write'].includes(args[0])) throw new Error('Use --check or --write.');
  let source = readFileSync(target, 'utf8');
  if (args[0] === '--write') { source = applyHomeRemindersHooks(source); writeFileSync(target, source); }
  verifyHomeRemindersHooks(source);
  process.stdout.write('Home reminders presentation hooks: exact native reversal and replay verified.\n');
}
