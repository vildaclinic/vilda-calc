/* Read-only landing for the isolated doctor's workspace. The shadow host keeps
 * search and calculator fields outside native visit collectors and autosave. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaHomeGabinetStart) return;
  const doc = w.document;
  const watched = new WeakSet();
  const surfaces = new WeakMap();
  let active = null;

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function civilDay(now) {
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  }

  function dateLabel(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : '';
  }

  function ageLabel(dob, day) {
    if (!dateLabel(dob) || dob > day) return '';
    const [y,m,d] = dob.split('-').map(Number), [ey,em,ed] = day.split('-').map(Number);
    const months = (ey - y) * 12 + em - m - Number(ed < d);
    const years = Math.floor(months / 12);
    if (!years) return months + ' mies.';
    const label = years === 1 ? 'rok' : years % 10 >= 2 && years % 10 <= 4 && !(years % 100 >= 12 && years % 100 <= 14) ? 'lata' : 'lat';
    return years + ' ' + label + (years < 18 && months % 12 ? ' ' + months % 12 + ' mies.' : '');
  }

  function normalized(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pl').replace(/ł/g,'l').trim();
  }

  function patientRow(record) {
    const header = record.header || {};
    const name = header.name || [header.lastName, header.firstName].filter(Boolean).join(' ') || 'Pacjent bez nazwiska';
    const dob = header.dobISO || '';
    return {id: record.patientId, name, dob, saved:record.lastSavedAtISO, count:record.snapshotCount, query: normalized([name, header.firstName, header.lastName, dob, dateLabel(dob)].filter(Boolean).join(' '))};
  }

  function initials(name) {
    const words = name.trim().split(/\s+/);
    return [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])].map(word => Array.from(word)[0]).join('');
  }

  const paths = {
    clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="8" y="2.5" width="8" height="5" rx="1.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.7"/><path d="m16 16 5 5"/>'
  };

  function icon(key) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + paths[key] + '</svg>';
  }

  const entries = [
    {
      action: 'office', title: 'Gabinet',
      description: 'Wyszukaj pacjenta i prowadź wizyty.',
      drawing: '<path d="M7 4.5v2.8a5.5 5.5 0 0 0 11 0V4.5m-11 0h1.6m7.8 0H18M12.5 13v3.9a5.8 5.8 0 0 0 11.6 0v-2.3"/><circle cx="24.1" cy="12" r="2.4"/>'
    },
    {
      action: 'new', title: 'Nowy pacjent',
      description: 'Załóż kartotekę pacjenta.',
      drawing: '<circle cx="12" cy="9" r="4.2"/><path d="M4.5 23v-2c0-3 3.4-5.5 7.5-5.5 1.2 0 2.4.2 3.5.7M21.5 15.2v9m-4.5-4.5h9"/>'
    },
    {
      action: 'rapid', title: 'Szybka ścieżka',
      description: 'Wpisz pomiary w Analizie i zapisz pacjenta.',
      drawing: '<path d="M3.5 9.5h6m-7.3 5h5.4m-3 5h3m5-15v18.7h14.6m-11.8-7.4 3.6-4.6 3.3 2 4.3-5.3"/>'
    },
    {
      action: 'quick', title: 'Szybkie obliczenie',
      description: 'Sprawdź wyniki bez zakładania kartoteki.',
      drawing: '<rect x="6.5" y="3" width="16" height="22" rx="2.5"/><path d="M10.1 7h8.8v4.1h-8.8zM10.6 15.4h2.2m3.7 0h2.2m-8.1 4.7h2.2m3.7 0h2.2"/>'
    }
  ];

  function card(entry) {
    return '<button class="vgs-launch-tile" type="button" data-entry="' + entry.action +
      '" aria-labelledby="vgs-title-' + entry.action + '" aria-describedby="vgs-detail-' + entry.action + '">' +
      '<span class="vgs-launch-symbol" aria-hidden="true"><svg viewBox="0 0 30 28" width="30" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      entry.drawing + '</svg></span><span class="vgs-launch-name" id="vgs-title-' + entry.action + '">' +
      entry.title + '</span><span class="vgs-launch-detail" id="vgs-detail-' + entry.action + '">' + entry.description + '</span></button>';
  }

  function quickForm() {
    return '<form class="vgs-quick-form"><div class="vgs-dialog-head"><div><h2 id="vgs-quick-title">Szybkie obliczenie</h2><p>Obliczenie poza kartoteką pacjenta</p></div><button type="button" class="vgs-close" data-dismiss aria-label="Zamknij">×</button></div>' +
      '<div class="vgs-dialog-body"><div class="vgs-fields"><label>Wiek w latach<input name="years" type="number" inputmode="numeric" min="0" max="130" step="1" required></label>' +
      '<label>Miesiące <small>opcjonalnie</small><input name="months" type="number" inputmode="numeric" min="0" max="11" step="1" placeholder="0–11"></label>' +
      '<label>Płeć<select name="sex" required><option value="">Wybierz</option><option value="F">Żeńska</option><option value="M">Męska</option></select></label>' +
      '<label data-reference hidden>Siatka referencyjna<select name="reference"><option value="OLAF">OLA / OLAF</option><option value="Palczewska">Palczewska</option></select></label>' +
      '<label>Masa ciała <small>kg</small><input name="mass" inputmode="decimal" maxlength="10"></label>' +
      '<label>Wzrost <small>cm</small><input name="height" inputmode="decimal" maxlength="10"></label></div>' +
      '<p class="vgs-hint" data-partial hidden>Możesz podać sam wzrost lub samą masę ciała.</p><p role="status" class="vgs-hint" data-message></p>' +
      '<div class="vgs-output" tabindex="-1" hidden></div></div><div class="vgs-dialog-footer"><button type="button" data-dismiss>Zamknij</button><button class="vgs-primary" type="submit">Oblicz</button></div></form>';
  }

  function bindQuick(dialog, current) {
    const form = dialog.querySelector('form'), fields = form.elements;
    const output = form.querySelector('.vgs-output'), message = form.querySelector('[data-message]');
    let generation = 0;
    function update() {
      generation++;
      const child = fields.years.value !== '' && fields.years.validity.valid && Number(fields.years.value) < 18;
      form.querySelector('[data-reference]').hidden = !child;
      fields.reference.disabled = !child;
      form.querySelector('[data-partial]').hidden = !child;
      output.hidden = true;
      message.textContent = '';
    }
    for (const button of form.querySelectorAll('[data-dismiss]')) button.onclick = () => dialog.close();
    form.oninput = update;
    form.onchange = update;
    form.onsubmit = async event => {
      event.preventDefault();
      const request = ++generation;
      const input = Object.fromEntries(new FormData(form));
      try {
        if (Number(input.years) >= 18 && w.VildaPatientReportLoader?.ensure) await w.VildaPatientReportLoader.ensure();
        if (request !== generation || !dialog.open || !current()) return;
        const result = w.VildaHomeGabinetQuick.calculate(input);
        message.textContent = result.message || '';
        output.replaceChildren();
        output.hidden = !result.rows.length;
        if (result.errorField) fields.namedItem(result.errorField)?.focus();
        if (output.hidden) return;
        const values = element('dl');
        for (const row of result.rows) {
          const item = element('div'), value = element('dd');
          if (['normal','warn','danger'].includes(row.tone)) item.dataset.tone = row.tone;
          value.append(element('strong','',row.value));
          if (row.detail) value.append(element('small','',row.detail));
          item.append(element('dt','',row.label),value);
          values.append(item);
        }
        output.append(element('h3','','Wyniki'),values);
        output.focus();
      } catch (_) {
        if (request === generation && dialog.open && current()) message.textContent = 'Nie udało się wczytać kalkulatora. Spróbuj ponownie.';
      }
    };
    dialog.onclose = () => { form.reset(); update(); output.replaceChildren(); };
    update();
  }

  // The Terminarz uses these five categories for patient appointments.
  const appointmentCategories = new Set(['followup','observation','treatment','wynik-badania','procedura']);
  function isAppointment(entry) {
    return entry && appointmentCategories.has(entry.category) &&
      (entry.careContext?.role === 'calendar' || entry.reminderContext?.kind !== 'reminder');
  }
  const sections = {
    reminders: {name: 'Przypomnienia', empty: 'Brak przypomnień na dziś i zaległych.'},
    care: {name: 'Plany opieki', empty: 'Brak otwartych planów opieki.'}
  };
  const relatedPreviewRows = 2;
  const visibleAppointmentRows = 3;

  function relatedCard(key) {
    const info = sections[key];
    const footer = key === 'care'
      ? '<button type="button" class="vgs-related-footer" data-all="care" aria-label="Pokaż wszystkie plany opieki">Pokaż wszystkie</button>'
      : '';
    return '<section class="vgs-box vgs-related vgs-' + key + '" aria-labelledby="vgs-' + key + '-title">' +
      '<div class="vgs-heading-row"><h2 id="vgs-' + key + '-title">' +
      info.name + '</h2><span class="vgs-count" hidden></span></div><div class="vgs-related-body" aria-live="polite"></div>' +
      footer + '</section>';
  }

  function reminderRows(groups, day) {
    const rows = [];
    for (const group of groups) {
      for (const note of group.notes || []) {
        const due = String(note.dueDateISO || '').slice(0,10);
        if (!dateLabel(due) || due > day || note.category === 'absence' || note.careContext?.role === 'decision' ||
            due === day && !group.isActivity && isAppointment(note)) continue;
        const late = Math.round((Date.parse(day) - Date.parse(due)) / 86400000);
        rows.push({patientId: group.patientId, name: group.patientName || (group.isActivity ? 'Aktywność' : 'Osoba spoza kartoteki'),
          global: group.isActivity || group.isExternal, title: note.title || 'Przypomnienie',
          context: {section:'reminders', noteId:note.id}, due, time:note.dueTime || '',
          status: late ? late === 1 ? '1 dzień po terminie' : late + ' dni po terminie' : 'Dziś',
          tone: late ? 'overdue' : 'today'});
      }
    }
    return rows.sort((a,b) => a.due.localeCompare(b.due) || a.time.localeCompare(b.time));
  }

  function planRows(plans) {
    const rows = [];
    for (const plan of plans) {
      const status = plan.careContext?.version === 2 ? plan.careContext.status : plan.status;
      if (status !== 'active') continue;
      const summary = w.VildaCarePlans?.describeSummary(plan);
      const date = String(plan.createdAtISO || '').slice(0,10);
      rows.push({patientId:plan.patientId, name:plan.patientName, title:plan.title || 'Plan opieki',
        context:{section:'care',planId:plan.id}, status:summary?.stateLabel || 'Otwarty',
        tone:'neutral', date:dateLabel(date) && date, order:plan.createdAtISO || ''});
    }
    return rows.sort((a,b) => b.order.localeCompare(a.order));
  }

  function landingSurface(host) {
    const existing = surfaces.get(host);
    if (existing) return existing;
    const scope = element('div','vhome-gabinet-start');
    const root = scope.attachShadow({mode:'open'});
    const stylesheet = doc.querySelector('link[href*="vilda_home_gabinet_start.css"]')?.cloneNode(false);
    if (stylesheet) {
      // A stylesheet inside a shadow root does not block the first paint.
      scope.hidden = true;
      const reveal = () => { scope.hidden = false; };
      stylesheet.addEventListener('load',reveal,{once:true});
      stylesheet.addEventListener('error',reveal,{once:true});
      root.append(stylesheet);
    }
    host.replaceChildren(scope);
    surfaces.set(host,scope);
    return scope;
  }

  function mount(host, options) {
    if (active) active.destroy();
    const vault = w.VildaVault;
    if (!host || !vault?.isUnlocked() || !w.VildaProAccess?.hasAccess() || !w.VildaAuthUI?.isBootReady() || !vault.getCurrentUser()?.userId) return null;
    const session = vault.captureSyncOperationSession();
    const scope = landingSurface(host);
    const root = scope.shadowRoot;
    const launcher = element('section','vgs-start vgs-launch');
    launcher.setAttribute('aria-labelledby','vgs-launch-title');
    launcher.innerHTML = '<div class="vgs-heading"><h1 id="vgs-launch-title">Rozpocznij pracę</h1><div class="vgs-date">' + icon('calendar') + '<time></time></div></div>' +
      '<div class="vgs-launch-tiles">' + entries.map(card).join('') + '</div><p class="vgs-launch-status" role="status"></p>';
    const page = element('section','vgs-start vgs-office');
    let day = civilDay(new Date());
    page.innerHTML = '<div class="vgs-heading"><h1 tabindex="-1">Gabinet</h1><div class="vgs-heading-actions"><div class="vgs-date">' +
      '<time><span class="vgs-date-long"></span><span class="vgs-date-short"></span></time></div></div></div><div class="vgs-office-grid">' +
      '<section class="vgs-box vgs-search" aria-labelledby="vgs-search-title"><div class="vgs-heading-row"><h2 id="vgs-search-title">Pacjenci</h2></div>' +
      '<div class="vgs-controls"><label class="vgs-search-field">' + icon('search') + '<input type="search" id="vgs-query" autocomplete="off" aria-label="Szukaj pacjenta po nazwisku, imieniu lub dacie urodzenia" aria-controls="vgs-results" placeholder="Szukaj pacjenta"></label>' +
      '<button type="button" class="vgs-list-toggle" aria-controls="vgs-results" aria-expanded="false" aria-label="Lista pacjentów">Lista</button>' +
      '<div class="vgs-results" id="vgs-results" role="region" aria-label="Wyniki wyszukiwania pacjentów" hidden></div></div>' +
      '<div class="vgs-feedback" role="status"></div><section class="vgs-working" aria-label="Rozpoczęta wizyta" hidden></section>' +
      '<div class="vgs-recent" hidden><h3>Ostatnio przyjęci</h3><ul></ul></div></section>' +
      '<section class="vgs-box vgs-schedule" aria-labelledby="vgs-schedule-title"><div class="vgs-heading-row">' +
      '<h2 id="vgs-schedule-title">Dzisiejsze wizyty</h2><span class="vgs-count" hidden></span></div>' +
      '<div class="vgs-schedule-body" aria-live="polite"></div></section>' + relatedCard('reminders') + relatedCard('care') + '</div>';
    const dialog = element('dialog','vgs-dialog');
    dialog.setAttribute('aria-labelledby','vgs-quick-title');
    dialog.innerHTML = quickForm();
    root.append(launcher,page,dialog);
    const get = s => root.querySelector(s);
    const query = get('#vgs-query'), results = get('#vgs-results'), toggle = get('.vgs-list-toggle');
    const feedback = get('.vgs-feedback'), schedule = get('.vgs-schedule-body');
    const events = new AbortController(), listen = {signal:events.signal};
    let sequence = 0, busy = false, destroyed = false, patients = new Map(), reader = null, midnight;
    let directoryError = false;
    let view = options.initialView === 'office' ? 'office' : 'launch';
    const launchStatus = get('.vgs-launch-status');
    function current() {
      if (destroyed || !scope.isConnected || w.VildaVault !== vault || !w.VildaProAccess?.hasAccess() || !w.VildaAuthUI?.isBootReady()) return false;
      try { vault.assertSyncOperationSession(session); return true; } catch (_) { return false; }
    }
    function closeSearch() {
      results.hidden = true;
      toggle.setAttribute('aria-expanded','false');
    }
    async function select(record, mode, context) {
      if (busy || !current() || !patients.has(record.id)) return;
      closeSearch();
      busy = true;
      try { await options.onSelect(record.id,mode,context); }
      catch (_) { if (current()) feedback.textContent = 'Nie udało się otworzyć pacjenta. Spróbuj ponownie.'; }
      finally { busy = false; }
    }
    function action(record, mode, label, primary = mode === 'start') {
      const button = element('button',primary ? 'vgs-primary' : 'vgs-name',label);
      button.type = 'button';
      button.onclick = () => select(record,mode);
      return button;
    }
    function visitAction(record) {
      const encounter = w.VildaHomeEncounter?.state(record.id);
      if (encounter?.mode === 'new') return action(record,'overview','Kontynuuj wizytę',true);
      if (encounter?.mode === 'edit') return action(record,'overview','Kontynuuj edycję',true);
      return action(record,'start','Nowa wizyta');
    }
    function workingVisit() {
      const host = get('.vgs-working');
      host.replaceChildren(); host.hidden = true;
      const patient = [...patients.values()].find(record => ['new','edit'].includes(w.VildaHomeEncounter?.state(record.id).mode));
      const encounter = patient && w.VildaHomeEncounter?.state(patient.id);
      if (!encounter || !['new','edit'].includes(encounter.mode)) return;
      const tile = element('span','vgs-tile');
      tile.innerHTML = icon('clipboard');
      const identity = element('div','vgs-working-identity');
      identity.append(element('small','',(encounter.mode === 'edit' ? 'Edycja wizyty' : 'Nowa wizyta') + ' · ' + dateLabel(encounter.date)),
        action(patient,'overview',patient.name));
      host.append(tile,identity,visitAction(patient)); host.hidden = false;
    }
    const recentCache = new Map();
    let recentTask = Promise.resolve();
    function recentVisits(valid) {
      const host = get('.vgs-recent'), list = host.querySelector('ul');
      const model = w.VildaHomeVisitComparisonModel;
      list.replaceChildren(); host.hidden = true;
      if (!get('.vgs-working').hidden || !vault.getPatientVisits || !model?.clinicalDate) return;
      for (const id of recentCache.keys()) if (!patients.has(id)) recentCache.delete(id);
      // Only the vault's clinical dates describe visits. The directory's save
      // timestamp can be advanced by editing or restoring an older record.
      // Limit decryptions, reuse only derived days in this unlocked workspace.
      const records = [...patients.values()].filter(person => person.count !== 0);
      recentTask = recentTask.then(async () => {
        const dated = [];
        let index = 0, failed = false;
        async function read() {
          while (valid() && index < records.length) {
            const person = records[index++];
            let cached = recentCache.get(person.id);
            if (!person.saved || !cached || cached.saved !== person.saved || cached.count !== person.count || cached.day !== day) {
              try {
                const visits = await vault.getPatientVisits(person.id);
                if (!valid()) return;
                let latest = '';
                for (const visit of visits) {
                  if (visit.patientId !== person.id) continue;
                  const date = model.clinicalDate(visit);
                  if (date && date <= day && date > latest) latest = date;
                }
                cached = {saved:person.saved,count:person.count,day,latest};
                recentCache.set(person.id,cached);
              } catch (_) { failed = true; continue; }
            }
            if (cached.latest) dated.push({person,date:cached.latest});
          }
        }
        await Promise.all([read(),read()]);
        if (!valid()) return;
        if (failed) {
          const item = element('li');
          item.append(retryMessage('Nie udało się wczytać ostatnich wizyt.'));
          list.append(item); host.hidden = false; return;
        }
        dated.sort((a,b) => b.date.localeCompare(a.date) || a.person.name.localeCompare(b.person.name,'pl'));
        for (const {person,date} of dated.slice(0,2)) {
          const item = element('li'), button = action(person,'overview','');
          button.className = 'vgs-recent-row';
          const time = element('time','',dateLabel(date)); time.dateTime = date;
          button.append(element('span','',person.name),time);
          item.append(button); list.append(item);
        }
        host.hidden = !list.childElementCount;
      });
    }
    function identity(record, full) {
      const cell = element('div','vgs-person'), value = element('div');
      value.append(action(record,'overview',record.name));
      const age = ageLabel(record.dob,day), dob = full && dateLabel(record.dob);
      if (age || dob) value.append(element('small','',[age,dob && 'ur. ' + dob].filter(Boolean).join(' · ')));
      cell.append(element('span','vgs-avatar',initials(record.name)),value);
      cell.firstElementChild.setAttribute('aria-hidden','true');
      return cell;
    }
    const createAction = element('button','vgs-add','Dodaj pacjenta');
    createAction.type = 'button';
    createAction.onclick = () => openEntry(options.onNewPatient);
    const searchFooter = element('div','vgs-results-footer');
    searchFooter.append(createAction);
    function search() {
      results.replaceChildren();
      const terms = normalized(query.value).split(/\s+/).filter(Boolean);
      const items = [...patients.values()].filter(patient => terms.every(term => patient.query.includes(term)));
      for (const patient of items) {
        const row = element('div','vgs-found-row');
        row.append(identity(patient,true),visitAction(patient));
        results.append(row);
      }
      if (!items.length) {
        results.append(element('p','vgs-empty',directoryError ? 'Nie udało się wczytać listy pacjentów.' : 'Brak pacjentów spełniających kryteria wyszukiwania.'));
        if (options.onNewPatient) results.append(searchFooter);
      }
      results.hidden = false;
      toggle.setAttribute('aria-expanded','true');
    }
    function showCount(section, value) {
      const badge = get('.vgs-' + section + ' .vgs-count');
      badge.textContent = value == null ? '' : String(value);
      const limit = section === 'schedule' ? visibleAppointmentRows : relatedPreviewRows;
      badge.hidden = value == null || value <= limit;
    }
    function showScheduleCount(value) {
      showCount('schedule',value);
      const scrollable = value > visibleAppointmentRows;
      schedule.toggleAttribute('data-scrollable',scrollable);
      if (scrollable) {
        schedule.tabIndex = 0;
        schedule.setAttribute('role','region');
        schedule.setAttribute('aria-labelledby','vgs-schedule-title');
      } else {
        schedule.removeAttribute('tabindex');
        schedule.removeAttribute('role');
        schedule.removeAttribute('aria-labelledby');
      }
    }
    function retryMessage(text) {
      const message = element('p','vgs-empty',text + ' ');
      const button = element('button','vgs-retry','Spróbuj ponownie');
      button.type = 'button';
      button.onclick = refresh;
      message.append(button);
      return message;
    }
    function openAll(key, context) {
      if (!current() || busy || !options.onAll) return;
      return openEntry(() => options.onAll(key,context));
    }
    for (const button of page.querySelectorAll('[data-all]')) {
      button.onclick = () => openAll(button.dataset.all);
      button.disabled = !options.onAll;
    }
    function renderRelated(key, result) {
      const body = get('.vgs-' + key + ' .vgs-related-body');
      body.replaceChildren();
      if (w.VildaRemindersPrivacy?.isHidden()) {
        showCount(key,null);
        body.append(element('p','vgs-empty','Treść jest ukryta.'));
        return;
      }
      if (result.status !== 'fulfilled') {
        showCount(key,null);
        body.append(retryMessage(key === 'care' ? 'Nie udało się wczytać planów opieki.' : 'Nie udało się wczytać przypomnień.'));
        return;
      }
      const rows = key === 'care' ? planRows(result.value) : reminderRows(result.value,day);
      showCount(key,rows.length);
      if (!rows.length) { body.append(element('p','vgs-empty',sections[key].empty)); return; }
      const list = element('ul','vgs-related-list');
      for (const row of rows.slice(0,relatedPreviewRows)) {
        const item = element('li'), record = !row.global && patients.get(row.patientId);
        const button = element('button','vgs-related-row');
        button.type = 'button';
        button.disabled = !record && !options.onAll;
        button.onclick = () => record ? select(record,'overview',row.context) : openAll(key,row.context);
        const top = element('span','vgs-row-top'), badge = element('span','vgs-when',row.status);
        badge.dataset.tone = row.tone;
        top.append(element('span','vgs-who',record?.name || row.name || 'Pacjent'),badge);
        button.append(top,element('span','vgs-row-title',row.title));
        if (row.date) {
          const date = element('time','vgs-row-meta',dateLabel(row.date));
          date.dateTime = row.date;
          button.append(date);
        }
        item.append(button); list.append(item);
      }
      body.append(list);
    }
    function renderSchedule(rows) {
      schedule.replaceChildren();
      const visits = rows.filter(row => isAppointment(row) && !row.isActivity && String(row.dueDateISO).slice(0,10) === day);
      showScheduleCount(visits.length);
      visits.sort((a,b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
      if (!visits.length) { schedule.append(element('p','vgs-empty','Brak wizyt zaplanowanych na dziś.')); return; }
      for (const visit of visits) {
        const patient = patients.get(visit.patientId);
        const row = element('div','vgs-appointment');
        row.append(element('span','vgs-hour',visit.dueTime || 'Cały dzień'));
        row.append(patient ? identity(patient,false) : element('strong','vgs-unlisted',visit.patientName || 'Pacjent spoza kartoteki'));
        row.append(element('span','vgs-reason',visit.title || ''));
        if (patient) row.append(visitAction(patient));
        schedule.append(row);
      }
    }
    async function refresh() {
      if (!current()) { destroy(); return; }
      const request = ++sequence;
      const valid = () => current() && request === sequence;
      const now = new Date(), nextDay = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
      day = civilDay(now);
      const label = now.toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
      for (const date of root.querySelectorAll('.vgs-date time')) {
        date.dateTime = day;
        if (date.firstElementChild) {
          date.querySelector('.vgs-date-long').textContent = label;
          date.querySelector('.vgs-date-short').textContent = dateLabel(day);
        } else date.textContent = label;
      }
      clearTimeout(midnight);
      midnight = w.setTimeout(refresh, nextDay.getTime() - now.getTime() + 100);
      reader?.dispose();
      reader = null;
      if (view !== 'office') {
        patients.clear(); recentCache.clear(); get('.vgs-recent ul').replaceChildren(); get('.vgs-recent').hidden = true;
        results.replaceChildren(); get('.vgs-working').replaceChildren(); get('.vgs-working').hidden = true;
        schedule.replaceChildren(); feedback.replaceChildren(); query.value = '';
        for (const key of Object.keys(sections)) { get('.vgs-' + key + ' .vgs-related-body').replaceChildren(); showCount(key,null); }
        showScheduleCount(null); return;
      }
      const dateForRead = day;
      let ownReader;
      const directory = (async () => vault.listPatients({strict:true,isCurrent:valid}))();
      const calendar = Promise.resolve().then(() => {
        if (!valid()) return null;
        reader = ownReader = vault.createCalendarReader({isCurrent:valid});
        return reader;
      });
      const until = dateForRead + 'T23:59:59.999Z';
      const appointments = calendar.then(source => source && source.listPatientNotesInRange(dateForRead,until));
      const reminders = calendar.then(source => source && !w.VildaRemindersPrivacy?.isHidden()
        ? source.listPatientNotesDueByDate(until) : []);
      const plans = Promise.resolve().then(() => valid() && !w.VildaRemindersPrivacy?.isHidden() ?
        vault.listCarePlans({strict:true,isCurrent:valid}) : []);
      const people = Promise.allSettled([directory]).then(([result]) => {
        if (!valid()) return;
        directoryError = result.status !== 'fulfilled';
        patients = new Map((directoryError ? [] : result.value).map(patientRow).sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(record=>[record.id,record]));
        workingVisit();
        recentVisits(valid);
        feedback.replaceChildren();
        if (directoryError) feedback.append(retryMessage('Nie udało się wczytać kartoteki.'));
        if (!results.hidden) search();
      });
      const scheduleRead = Promise.allSettled([people,appointments]).then(([,result]) => {
        if (!valid()) return;
        if (result.status === 'fulfilled') renderSchedule(result.value);
        else { showScheduleCount(null); schedule.replaceChildren(retryMessage('Nie udało się wczytać dzisiejszych wizyt.')); }
      });
      const related = (key, promise) => Promise.allSettled([people,promise]).then(([,result]) => {
        if (valid()) renderRelated(key,result);
      });
      try { await Promise.all([scheduleRead,related('reminders',reminders),related('care',plans)]); }
      finally { ownReader?.dispose(); if (reader === ownReader) reader = null; }
    }
    const unsubscribePrivacy = w.VildaRemindersPrivacy?.subscribe(hidden => {
      if (!current() || view !== 'office') return;
      if (hidden) for (const key of Object.keys(sections)) renderRelated(key,{status:'fulfilled',value:[]});
      refresh();
    });
    function destroy() {
      if (destroyed) return;
      destroyed = true; sequence++; events.abort(); clearTimeout(midnight);
      unsubscribePrivacy?.(); recentCache.clear();
      reader?.dispose(); reader = null; patients.clear(); if (dialog.open) dialog.close();
      // Keep the stylesheet attached across views and discard the session DOM.
      launcher.remove(); page.remove(); dialog.remove();
      if (active?.scope === scope) active = null;
    }
    query.oninput = () => query.value.trim() ? search() : closeSearch();
    toggle.onclick = () => {
      if (!results.hidden && !query.value) { closeSearch(); return; }
      query.value = ''; search();
    };
    root.addEventListener('keydown',event=>{
      if (event.key === 'Escape' && !results.hidden) { event.preventDefault(); closeSearch(); query.focus(); return; }
      if (event.target === query && ['Enter','ArrowDown'].includes(event.key)) {
        event.preventDefault(); search(); results.querySelector('button')?.focus(); return;
      }
      if (results.contains(event.target) && ['ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...results.querySelectorAll('.vgs-name')];
        const idx = buttons.indexOf(event.target.closest('.vgs-found-row')?.querySelector('.vgs-name'));
        const next = idx + (event.key === 'ArrowDown' ? 1 : -1);
        (next < 0 ? query : buttons[Math.min(next,buttons.length - 1)])?.focus();
      }
    },listen);
    function offSearch(event) {
      if (!results.hidden && !event.composedPath().includes(get('.vgs-controls'))) closeSearch();
    }
    doc.addEventListener('pointerdown',offSearch,listen);
    doc.addEventListener('focusin',offSearch,listen);
    doc.addEventListener('vilda:home-encounter-changed',refresh,listen);
    doc.addEventListener('vilda:sync-merged',refresh,listen);
    function showView(next, focus = false) {
      if (!current()) return;
      view = next === 'office' ? 'office' : 'launch';
      closeSearch();
      launcher.hidden = view !== 'launch';
      page.hidden = view !== 'office';
      launchStatus.textContent = '';
      if (view === 'office' && !schedule.hasChildNodes()) {
        schedule.append(element('p','vgs-empty','Wczytywanie terminarza…'));
        for (const key of Object.keys(sections)) {
          get('.vgs-' + key + ' .vgs-related-body').append(element('p','vgs-empty','Wczytywanie…'));
        }
      }
      if (focus) {
        const nextFocus = view === 'office' ? page.querySelector('h1') : get('[data-entry="office"]');
        nextFocus.focus({preventScroll:true});
      }
      options.onViewChange?.(view);
      return refresh();
    }
    function openQuick() {
      if (!current() || dialog.open) return;
      closeSearch();
      dialog.showModal();
    }
    async function openEntry(handler) {
      if (busy || !current()) return;
      busy = true;
      const status = view === 'office' ? feedback : launchStatus;
      status.textContent = '';
      try {
        await handler();
      } catch (_) {
        if (current()) status.textContent = 'Nie udało się otworzyć formularza. Spróbuj ponownie.';
      } finally { busy = false; }
    }
    get('[data-entry="office"]').onclick = () => showView('office',true);
    get('[data-entry="new"]').onclick = () => openEntry(options.onNewPatient);
    get('[data-entry="rapid"]').onclick = () => openEntry(options.onRapid);
    get('[data-entry="quick"]').onclick = openQuick;
    bindQuick(dialog,current);
    active = {scope,vault,destroy,refresh,showView,focusSearch() {
      if (view === 'office' && current()) query.focus({preventScroll:true});
    }};
    if (!watched.has(vault)) {
      watched.add(vault);
      vault.onLock(() => { if (active?.vault === vault) active.destroy(); });
      for (const key of ['onPatientSaved','onPatientDeleted','onPatientNoteChanged']) {
        vault[key]?.(()=>{ if (active?.vault === vault) active.refresh(); });
      }
    }
    showView(view);
    return active;
  }
  w.VildaHomeGabinetStart = Object.freeze({mount});
})(window);
