// Optional presentation plumbing over the native reminders actor. The source
// pairs preserve its readers, category/date rules, actions and native writers.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOME_REMINDERS_AUTH_BASE_SHA256 = 'a2d5108045cb94cde15c36f759233db7cb110a1f17580393ccba5927e56aa4a9';
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
    return remB22Request(HomeRemindersRequested ? Object.assign({}, request || {}, { homePresentation: true }) : request);
  }
  function HomeRemindersDispose() {
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
    if (!HomeRemindersPresentation || typeof HomeRemindersPresentation.onDialog !== 'function') return;
    try {
      var cleanup = HomeRemindersPresentation.onDialog(dialog);
      if (typeof cleanup === 'function') HomeRemindersOutcomeCleanup = cleanup;
    } catch (error) { Ot('homeRemindersDialog', error); }
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
          : state.rows.length ? 'Brak spraw w tym filtrze.' : 'Brak przypomnień na dziś. Możesz dodać nowe przypomnienie.',
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

const PAIRS = [
  ['function remInlineReserved() {\n  var root =', HELPERS + 'function remInlineReserved() {\n  if (HomeRemindersInlineEnabled()) return false;\n  var root ='],
  ['function dl(){var t=jt();return!(!t||typeof t.isUnlocked!="function"||!t.isUnlocked()||!ll()||typeof t.listPatientNotesDueByDate!="function"||Lr()||!sl())}',
    'function dl(){var t=jt();return!(!t||typeof t.isUnlocked!="function"||!t.isUnlocked()||!ll()||typeof t.listPatientNotesDueByDate!="function"||!HomeRemindersInlineEnabled()&&(Lr()||!sl()))}'],
  ['function Dr(t){try{var a=', 'function Dr(t){if(HomeRemindersInlineEnabled(t)){["height","maxHeight","minHeight"].forEach(function(name){if(t.style[name])t.style[name]=""});return}try{var a='],
  ['if (!view || !view.alive()) { if (view) view.destroyCare(); view = remB22Create(host, false, {}); remB22Views.set(host, view); }',
    'var homePresentation = HomeRemindersInlineEnabled(host);\n  if (!view || !view.alive() || view.homePresentation !== homePresentation) { if (view) view.destroyCare(); view = remB22Create(host, false, homePresentation ? { homePresentation: true } : {}); remB22Views.set(host, view); }'],
  ['if (remB22Full && remB22Full.alive()) { remB22Full.request(options || {}); return remB22Full.root; }',
    'if (remB22Full && remB22Full.alive()) {\n    if (remB22Full.homePresentation === HomeRemindersPresentationRequested(options)) { remB22Full.request(options || {}); return remB22Full.root; }\n    if (!remB22Full.canChangePresentation()) return remB22Full.root;\n    remB22Full.close();\n  }'],
  ['var previousFocus = i.document.activeElement, previousNavHidden = i.document.body.classList.contains(\'nav-ui-temporarily-hidden\');\n  function alive()',
    'var previousFocus = i.document.activeElement, previousNavHidden = i.document.body.classList.contains(\'nav-ui-temporarily-hidden\');\n' + FACTORY_HELPERS + '  function alive()'],
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

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Home reminders hook anchor changed: ' + before.slice(0, 90));
  return source.replace(before, after);
}

function rewriteRequests(source, forward) {
  const start = source.indexOf('function remB22Create('), end = source.indexOf('\nfunction remB22Styles()', start);
  if (start < 0 || end < 0) throw new Error('Native reminders factory boundary missing.');
  let factory = source.slice(start, end), helper = '';
  if (factory.includes(FACTORY_HELPERS)) { helper = FACTORY_HELPERS; factory = once(factory, helper, '/* HOME REQUEST HELPER PLACEHOLDER */'); }
  const from = forward ? 'remB22Request(' : 'HomeRemindersRequest(', to = forward ? 'HomeRemindersRequest(' : 'remB22Request(';
  const count = factory.split(from).length - 1, already = factory.split(to).length - 1;
  if (!count && already === 14) return source;
  if (count !== 14 || already) throw new Error('Unexpected native reminder request count: ' + count + '/' + already);
  factory = factory.replaceAll(from, to);
  if (helper) factory = once(factory, '/* HOME REQUEST HELPER PLACEHOLDER */', helper);
  return source.slice(0, start) + factory + source.slice(end);
}

export function applyHomeRemindersHooks(source) {
  source = rewriteRequests(source, true);
  for (const [before, after] of PAIRS) {
    if (source.includes(after)) { if (source.split(after).length !== 2) throw new Error('Repeated home reminders hook.'); continue; }
    source = once(source, before, after);
  }
  return source;
}

export function reverseHomeRemindersHooks(source) {
  for (const [before, after] of PAIRS.slice().reverse()) source = once(source, after, before);
  return rewriteRequests(source, false);
}

export function verifyHomeRemindersHooks(source) {
  if (applyHomeRemindersHooks(source) !== source) throw new Error('Home reminders hooks are not applied.');
  const base = reverseHomeRemindersHooks(source);
  if (digest(base) !== HOME_REMINDERS_AUTH_BASE_SHA256) throw new Error('Native AuthUI base differs after reversing only the presentation hooks.');
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
