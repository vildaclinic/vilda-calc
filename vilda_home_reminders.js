/* Presentation over native Reminder actors. The caller owns scope, reads,
 * formatting, eligibility, status, actions, writes and the privacy preference.
 * This module has no automatic mounting, persistence or patient data reader. */
(function (w) {
  'use strict';
  if (!w || w.VildaHomeRemindersPresentation) return;
  var instances = new WeakMap(), serial = 0;
  var inactive = Object.freeze({ render: function () { return false; }, onDialog: function () { return function () {}; }, destroy: function () {} });

  function decorate(options) {
    options = options || {};
    var root = options.root, nodes = options.nodes || {}, commands = options.commands || {};
    if (w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || !root || !root.ownerDocument || typeof commands.isCurrent !== 'function') return inactive;
    if (instances.has(root)) return instances.get(root);
    var d = root.ownerDocument, host = options.host || root, full = options.full === true;
    var stopped = false, bindings = [], classes = [], attributes = [], created = [], restoreRows = [], children = [];
    var originalTabs = null, tabButtons = [], count = null, footerLabel = null, id = 'vhome-reminders-' + (++serial);
    function make(tag, cls, text) {
      var element = d.createElement(tag); if (cls) element.className = cls;
      if (text != null) element.textContent = text; return element;
    }
    function current() {
      if (stopped || root.isConnected === false) return false;
      try { return commands.isCurrent() === true; } catch (_) { return false; }
    }
    function mark(element, cls) {
      if (!element || element.classList.contains(cls)) return;
      element.classList.add(cls); classes.push([element, cls]);
    }
    function attribute(element, name, value) {
      if (!element) return;
      if (!attributes.some(function (entry) { return entry[0] === element && entry[1] === name; })) attributes.push([element, name, element.getAttribute(name)]);
      if (value == null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
    function listen(element, type, listener) {
      if (!element) return; element.addEventListener(type, listener);
      bindings.push(function () { element.removeEventListener(type, listener); });
    }
    function clearRows() {
      restoreRows.splice(0).reverse().forEach(function (restore) { restore(); });
    }
    function compact(snapshot) {
      var value = snapshot && snapshot.compact;
      if (typeof value !== 'boolean') value = options.compact;
      // The native caller supplies device compactness. An embedded document's
      // width alone cannot distinguish a desktop with a sidebar from a tablet.
      if (typeof value === 'boolean') {
        host.classList.toggle('vhome-reminders-compact', value);
        root.classList.toggle('vhome-reminders-compact', value);
      }
    }
    function newTabs() {
      if (!full || !nodes.tabs || typeof commands.selectTab !== 'function') return;
      originalTabs = Array.from(nodes.tabs.childNodes);
      originalTabs.forEach(function (node) { node.remove(); });
      mark(nodes.tabs, 'vhome-reminders-tabs'); attribute(nodes.tabs, 'role', 'tablist');
      attribute(nodes.tabs, 'aria-label', 'Widok Przypomnień');
      [['active', 'Do wykonania'], ['history', 'Historia'], ['plans', 'Plany']].forEach(function (entry) {
        var button = make('button', '', entry[1]); button.type = 'button'; button.dataset.homeReminderTab = entry[0];
        button.id = id + '-tab-' + entry[0]; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', 'false'); button.tabIndex = -1;
        var panel = entry[0] === 'plans' ? nodes.careHost : nodes.layout;
        if (panel) {
          if (!panel.id) attribute(panel, 'id', id + '-panel-' + (entry[0] === 'plans' ? 'plans' : 'items'));
          button.setAttribute('aria-controls', panel.id);
        }
        listen(button, 'click', function () { if (current() && !button.disabled) commands.selectTab(entry[0]); });
        nodes.tabs.appendChild(button); tabButtons.push(button);
      });
      listen(nodes.tabs, 'keydown', function (event) {
        if (!current() || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        var available = tabButtons.filter(function (button) { return !button.hidden && !button.disabled; });
        var index = available.indexOf(event.target); if (index < 0 || !available.length) return;
        event.preventDefault(); event.stopPropagation();
        index = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
        available[index].focus({ preventScroll: true }); available[index].click();
      });
    }
    function updateTabs(snapshot) {
      tabButtons.forEach(function (button) {
        var key = button.dataset.homeReminderTab, selected = snapshot.activeTab === key;
        var original = key === 'active' ? nodes.activeTab : key === 'plans' ? nodes.plansTab : null;
        button.hidden = !!(original && original.hidden); button.disabled = !!(snapshot.busy || snapshot.editing || original && original.disabled);
        button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      });
      if (!tabButtons.some(function (button) { return button.tabIndex === 0 && !button.hidden; })) {
        var first = tabButtons.find(function (button) { return !button.hidden && !button.disabled; }); if (first) first.tabIndex = 0;
      }
      var selected = tabButtons.find(function (button) { return button.dataset.homeReminderTab === snapshot.activeTab; });
      var panel = snapshot.activeTab === 'plans' ? nodes.careHost : nodes.layout;
      if (panel && selected) { attribute(panel, 'role', 'tabpanel'); attribute(panel, 'aria-labelledby', selected.id); }
    }
    function previewRow(entry, showPatientName) {
      if (!entry || !entry.node) return null;
      var button = entry.node, article = make('article', 'vhome-reminders-entry');
      var date = make('span', 'vhome-reminders-date'), parts = entry.dateParts || {};
      date.setAttribute('aria-hidden', 'true'); if (entry.dateLabel) date.title = entry.dateLabel;
      date.append(make('strong', '', parts.day == null ? '' : String(parts.day)), make('span', '', parts.month == null ? '' : String(parts.month)));
      var patient = button.querySelector('.vb22-row-patient'), title = button.querySelector('.vb22-row-title');
      var context = make('span', 'vhome-reminders-entry-context'), source = make('span', 'vhome-reminders-source', entry.sourceLabel || '');
      var patientOrigin = patient && { parent: patient.parentNode, next: patient.nextSibling };
      var titleOrigin = title && { parent: title.parentNode, next: title.nextSibling };
      if (patient) { context.appendChild(patient); patient.classList.toggle('vhome-reminders-patient-omitted', showPatientName === false); }
      if (entry.sourceLabel) context.appendChild(source);
      if (context.childNodes.length) button.appendChild(context);
      if (title) { button.insertBefore(title, button.firstChild); button.insertBefore(context, title.nextSibling); }
      button.classList.add('vhome-reminders-entry-open'); article.append(date, button);
      restoreRows.push(function () {
        if (patient && patientOrigin.parent) {
          patientOrigin.parent.insertBefore(patient, patientOrigin.next && patientOrigin.next.parentNode === patientOrigin.parent ? patientOrigin.next : null);
          patient.classList.remove('vhome-reminders-patient-omitted');
        }
        if (title && titleOrigin.parent) titleOrigin.parent.insertBefore(title, titleOrigin.next && titleOrigin.next.parentNode === titleOrigin.parent ? titleOrigin.next : null);
        source.textContent = ''; context.remove(); date.textContent = ''; date.removeAttribute('title');
        button.classList.remove('vhome-reminders-entry-open');
        if (article.parentNode === nodes.list) nodes.list.insertBefore(button, article);
        article.remove();
      });
      return article;
    }
    function fullRow(entry, showPatientName) {
      if (!entry || !entry.node || !entry.detailNode) return null;
      var article = make('article', 'vhome-reminders-full-entry');
      var patientHeading = entry.detailNode.querySelector('.vb22-detail-patient');
      var patientNext = patientHeading && patientHeading.nextSibling;
      var patientOmitted = !!(patientHeading && showPatientName === false);
      entry.node.classList.add('vhome-reminders-entry-open'); entry.detailNode.classList.add('vhome-reminders-entry-detail');
      // Native row buttons and native action/form nodes are siblings, never
      // nested interactive controls. Keep the original patient link once,
      // above the row, with its native listener and keyboard access intact.
      if (patientHeading) {
        if (patientOmitted) patientHeading.classList.add('vhome-reminders-patient-omitted');
        article.appendChild(patientHeading);
      }
      article.append(entry.node, entry.detailNode);
      restoreRows.push(function () {
        if (patientHeading) {
          if (patientOmitted) patientHeading.classList.remove('vhome-reminders-patient-omitted');
          entry.detailNode.insertBefore(patientHeading, patientNext && patientNext.parentNode === entry.detailNode ? patientNext : null);
        }
        entry.node.classList.remove('vhome-reminders-entry-open'); entry.detailNode.classList.remove('vhome-reminders-entry-detail');
        if (article.parentNode === nodes.list) { nodes.list.insertBefore(entry.node, article); nodes.list.insertBefore(entry.detailNode, article); }
        article.remove();
      }); return article;
    }
    function nativeMessages(value) {
      var list = Array.isArray(value) ? value : [], appended = 0;
      list.forEach(function (node) { if (node && [1, 3, 11].includes(node.nodeType)) { nodes.list.appendChild(node); appended += 1; } });
      return appended;
    }
    function updateFooter() {
      if (!footerLabel) return;
      // Native count updates replace this button's children. Keep the same
      // button/listener while restoring the approved label and decorative SVG.
      if (footerLabel.node.childNodes.length !== 2 || footerLabel.node.firstChild !== footerLabel.label || footerLabel.node.lastChild !== footerLabel.arrow) {
        footerLabel.node.replaceChildren(footerLabel.label, footerLabel.arrow);
      }
    }
    function render(snapshot) {
      if (!current() || !snapshot) return false;
      compact(snapshot);
      updateFooter();
      root.dataset.homeRemindersPhase = snapshot.phase || 'loading';
      root.classList.toggle('vhome-reminders-busy', !!snapshot.busy); root.classList.toggle('vhome-reminders-editing', !!snapshot.editing);
      root.classList.toggle('vhome-reminders-inline-editing', snapshot.inlineFormEditing === true);
      root.classList.toggle('vhome-reminders-detached-detail', snapshot.detachedDetailVisible === true);
      if (count) count.textContent = snapshot.total == null ? '' : String(snapshot.total);
      if (nodes.subtitle && typeof snapshot.contextLabel === 'string') {
        nodes.subtitle.textContent = snapshot.contextLabel; attribute(nodes.subtitle, 'data-home-reminders-context', '');
      }
      updateTabs(snapshot);
      // An active native editor keeps its exact form and field selection.
      if (full && (snapshot.editing || snapshot.detachedDetailVisible === true)) return true;
      if (full && !Array.isArray(snapshot.entries)) { clearRows(); root.classList.remove('vhome-reminders-list-view'); return true; }
      if (!nodes.list) return true;
      var entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
      // Without explicit native details, keep the complete native workspace.
      if (full && entries.some(function (entry) { return !entry || !entry.detailNode; })) { clearRows(); root.classList.remove('vhome-reminders-list-view'); return true; }
      clearRows(); nodes.list.replaceChildren();
      var asFullList = full && Array.isArray(snapshot.entries); root.classList.toggle('vhome-reminders-list-view', asFullList);
      var suppliedMessages = nativeMessages(snapshot.feedbackNodes);
      (full ? entries : entries.slice(0, 2)).forEach(function (entry) {
        var row = full ? fullRow(entry, snapshot.showPatientName) : previewRow(entry, snapshot.showPatientName);
        if (row) nodes.list.appendChild(row);
      });
      suppliedMessages += nativeMessages(snapshot.tailNodes);
      if (!entries.length && snapshot.phase === 'ready' && snapshot.total === 0 && !suppliedMessages && snapshot.emptyText) {
        var empty = make('p', 'vhome-reminders-empty', snapshot.emptyText); empty.setAttribute('role', 'status'); nodes.list.appendChild(empty);
        restoreRows.push(function () { empty.textContent = ''; empty.remove(); });
      }
      attribute(nodes.list, 'aria-busy', String(snapshot.phase === 'loading'));
      return true;
    }
    function onDialog(dialog) {
      if (!current() || !dialog || !dialog.classList) return function () {};
      var present = dialog.classList.contains('vhome-reminders-child-dialog'), released = false;
      if (!present) dialog.classList.add('vhome-reminders-child-dialog');
      function release() { if (released) return; released = true; if (!present) dialog.classList.remove('vhome-reminders-child-dialog'); }
      children.push(release); return release;
    }
    function destroy() {
      if (stopped) return; stopped = true;
      bindings.splice(0).forEach(function (unbind) { unbind(); }); children.splice(0).forEach(function (release) { release(); }); clearRows();
      if (originalTabs && nodes.tabs) nodes.tabs.replaceChildren.apply(nodes.tabs, originalTabs);
      if (footerLabel) footerLabel.node.replaceChildren.apply(footerLabel.node, footerLabel.children);
      created.forEach(function (node) { node.textContent = ''; node.remove(); });
      attributes.reverse().forEach(function (entry) { if (entry[2] == null) entry[0].removeAttribute(entry[1]); else entry[0].setAttribute(entry[1], entry[2]); });
      classes.reverse().forEach(function (entry) { entry[0].classList.remove(entry[1]); });
      root.classList.remove('vhome-reminders-compact', 'vhome-reminders-busy', 'vhome-reminders-editing', 'vhome-reminders-inline-editing', 'vhome-reminders-detached-detail', 'vhome-reminders-list-view');
      host.classList.remove('vhome-reminders-compact'); delete root.dataset.homeRemindersPhase;
      instances.delete(root); options = null; commands = null; nodes = null; tabButtons = []; originalTabs = null; footerLabel = null;
    }

    mark(root, full ? 'vhome-reminders-dialog' : 'vhome-reminders-card');
    if (!full) {
      mark(host, 'vhome-reminders-slot');
      // The approved compact card has one expand action. The full native
      // window retains Add and the privacy control with their own listeners.
      var addZone = nodes.addButton && nodes.addButton.closest('.vb22-action-zone');
      attribute(addZone || nodes.addButton, 'hidden', '');
      attribute(nodes.privacyButton, 'hidden', '');
      // This decorative counter is guarded from its very first paint by the
      // native privacy class. It adds no accessible-name reference to data.
      count = make('span', 'vhome-reminders-count vb22-private-content'); count.setAttribute('aria-hidden', 'true'); created.push(count);
      if (nodes.tools) nodes.tools.insertBefore(count, nodes.tools.firstChild);
      var all = nodes.allButton || nodes.footer && nodes.footer.querySelector('.vild-rem-all');
      if (all) {
        footerLabel = { node: all, children: Array.from(all.childNodes), label: d.createTextNode('Wszystkie przypomnienia') };
        attribute(all, 'aria-label', 'Wszystkie przypomnienia');
        var arrow = d.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = d.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('aria-hidden', 'true'); arrow.setAttribute('focusable', 'false');
        path.setAttribute('d', 'M5 12h14m-6-6 6 6-6 6'); arrow.appendChild(path); footerLabel.arrow = arrow; updateFooter();
      }
    }
    newTabs();
    var api = Object.freeze({ render: render, onDialog: onDialog, destroy: destroy }); instances.set(root, api);
    if (options.compact === true || options.compact === false) compact({ compact: options.compact });
    return api;
  }
  w.VildaHomeRemindersPresentation = Object.freeze({ decorate: decorate });
})(typeof window !== 'undefined' ? window : null);
