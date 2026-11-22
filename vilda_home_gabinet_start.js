/* Read-only landing for the isolated doctor's workspace. The shadow host keeps
 * search and calculator fields outside native visit collectors and autosave. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.__VILDA_HOME_GABINET_PREVIEW__ !== true || w.VildaHomeGabinetStart) return;
  const doc = w.document;
  const watched = new WeakSet();
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
    return {id: record.patientId, name, dob, query: normalized([name, header.firstName, header.lastName, dob, dateLabel(dob)].filter(Boolean).join(' '))};
  }

  function initials(name) {
    const words = name.trim().split(/\s+/);
    return [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])].map(word => Array.from(word)[0]).join('');
  }

  const paths = {
    clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="8" y="2.5" width="8" height="5" rx="1.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-7 14-7 14 0M16 4a4 4 0 0 1 0 8m2 3c3 1 4 3 4 5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.7"/><path d="m16 16 5 5"/>',
    calc: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8v4H8zM8 14h2m4 0h2m-8 4h2m4 0h2"/>'
  };

  function icon(key) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + paths[key] + '</svg>';
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

  function mount(host, options) {
    if (active) active.destroy();
    const vault = w.VildaVault;
    if (!host || !vault?.isUnlocked() || !w.VildaProAccess?.hasAccess() || !w.VildaAuthUI?.isBootReady() || !vault.getCurrentUser()?.userId) return null;
    const session = vault.captureSyncOperationSession();
    const scope = element('div','vhome-gabinet-start');
    const root = scope.attachShadow({mode:'open'});
    const link = doc.querySelector('link[href*="vilda_home_gabinet_start.css"]');
    if (link) root.append(link.cloneNode(false));
    const page = element('section','vgs-start');
    const now = new Date();
    let day = civilDay(now);
    page.innerHTML = '<div class="vgs-heading"><h1>Gabinet</h1><div class="vgs-date">' + icon('calendar') + '<time></time></div></div>' +
      '<section class="vgs-box vgs-working" aria-label="Rozpoczęta wizyta" hidden></section>' +
      '<section class="vgs-box vgs-search" aria-labelledby="vgs-search-title"><div class="vgs-heading-row"><span class="vgs-tile">' + icon('users') + '</span><h2 id="vgs-search-title">Znajdź pacjenta</h2></div>' +
      '<div class="vgs-controls"><label class="vgs-search-field">' + icon('search') + '<input type="search" id="vgs-query" autocomplete="off" aria-label="Szukaj pacjenta po nazwisku, imieniu lub dacie urodzenia" aria-controls="vgs-results" placeholder="Nazwisko, imię lub data urodzenia"></label>' +
      '<button type="button" class="vgs-list-toggle" aria-controls="vgs-results" aria-expanded="false">Lista pacjentów</button>' +
      '<div class="vgs-results" id="vgs-results" role="region" aria-label="Wyniki wyszukiwania pacjentów" hidden></div></div><p class="vgs-feedback" role="status"></p></section>' +
      '<section class="vgs-box vgs-schedule" aria-labelledby="vgs-schedule-title"><div class="vgs-heading-row"><span class="vgs-tile">' + icon('calendar') + '</span><h2 id="vgs-schedule-title">Dzisiejsze wizyty</h2></div>' +
      '<div class="vgs-schedule-body" aria-live="polite"></div></section><div><button type="button" class="vgs-quick">' + icon('calc') + 'Szybkie obliczenie</button></div>';
    const dialog = element('dialog','vgs-dialog');
    dialog.setAttribute('aria-labelledby','vgs-quick-title');
    dialog.innerHTML = quickForm();
    root.append(page,dialog);
    host.replaceChildren(scope);
    const get = s => root.querySelector(s);
    const query = get('#vgs-query'), results = get('#vgs-results'), toggle = get('.vgs-list-toggle');
    const feedback = get('.vgs-feedback'), schedule = get('.vgs-schedule-body');
    const events = new AbortController(), listen = {signal:events.signal};
    const compactQuery = w.matchMedia('(max-width: 440px)');
    const fullPlaceholder = query.placeholder;
    function sizePlaceholder() {
      query.placeholder = compactQuery.matches ? 'Imię, nazwisko, data ur.' : fullPlaceholder;
    }
    compactQuery.addEventListener('change',sizePlaceholder,listen);
    sizePlaceholder();
    let sequence = 0, busy = false, destroyed = false, patients = new Map(), reader = null, midnight;
    let directoryError = false;
    function current() {
      if (destroyed || !scope.isConnected || w.VildaVault !== vault || !w.VildaProAccess?.hasAccess() || !w.VildaAuthUI?.isBootReady()) return false;
      try { vault.assertSyncOperationSession(session); return true; } catch (_) { return false; }
    }
    function closeSearch() {
      results.hidden = true;
      toggle.setAttribute('aria-expanded','false');
    }
    function action(record, mode, label, primary = mode === 'start') {
      const button = element('button',primary ? 'vgs-primary' : 'vgs-name',label);
      button.type = 'button';
      button.onclick = async () => {
        if (busy || !current() || !patients.has(record.id)) return;
        closeSearch();
        busy = true;
        try { await options.onSelect(record.id,mode); }
        catch (_) { if (current()) feedback.textContent = 'Nie udało się otworzyć pacjenta. Spróbuj ponownie.'; }
        finally { busy = false; }
      };
      return button;
    }
    function visitAction(record, full) {
      const encounter = w.VildaHomeEncounter?.state(record.id);
      if (encounter?.mode === 'new') return action(record,'overview','Kontynuuj wizytę',true);
      if (encounter?.mode === 'edit') return action(record,'overview','Kontynuuj edycję',true);
      return action(record,'start',full ? 'Rozpocznij nową wizytę' : 'Rozpocznij');
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
      host.append(tile,identity,visitAction(patient,true)); host.hidden = false;
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
    function search() {
      results.replaceChildren();
      const terms = normalized(query.value).split(/\s+/).filter(Boolean);
      const items = [...patients.values()].filter(patient => terms.every(term => patient.query.includes(term)));
      for (const patient of items) {
        const row = element('div','vgs-found-row');
        row.append(identity(patient,true),visitAction(patient,true));
        results.append(row);
      }
      if (!items.length) results.append(element('p','vgs-empty',directoryError ? 'Nie udało się wczytać listy pacjentów.' : 'Brak pacjentów spełniających kryteria wyszukiwania.'));
      results.hidden = false;
      toggle.setAttribute('aria-expanded','true');
    }
    function renderSchedule(rows) {
      schedule.replaceChildren();
      const visits = rows.filter(row => row && !row.isActivity && row.category !== 'absence' && String(row.dueDateISO).slice(0,10) === day);
      visits.sort((a,b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
      if (!visits.length) { schedule.append(element('p','vgs-empty','Brak wizyt zaplanowanych na dziś.')); return; }
      const labels = element('div','vgs-schedule-labels');
      labels.setAttribute('aria-hidden','true');
      for (const label of ['Godzina','Pacjent','Powód wizyty','']) labels.append(element('span','',label));
      schedule.append(labels);
      for (const visit of visits) {
        const patient = patients.get(visit.patientId);
        const row = element('div','vgs-appointment');
        row.append(element('span','vgs-hour',visit.dueTime || 'Cały dzień'));
        row.append(patient ? identity(patient,false) : element('strong','vgs-unlisted',visit.patientName || 'Pacjent spoza kartoteki'));
        row.append(element('span','vgs-reason',visit.title || ''));
        if (patient) row.append(visitAction(patient,false));
        schedule.append(row);
      }
    }
    async function refresh() {
      if (!current()) { destroy(); return; }
      const request = ++sequence;
      const valid = () => current() && request === sequence;
      const now = new Date(), nextDay = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
      day = civilDay(now);
      const date = get('.vgs-date time');
      date.dateTime = day;
      date.textContent = now.toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
      clearTimeout(midnight);
      midnight = w.setTimeout(refresh, nextDay.getTime() - now.getTime() + 100);
      const dateForRead = day;
      reader?.dispose();
      let ownReader;
      const directory = vault.listPatients({strict:true,isCurrent:valid});
      const calendar = Promise.resolve().then(() => {
        if (!valid()) return [];
        reader = ownReader = vault.createCalendarReader({isCurrent:valid});
        return reader.listPatientNotesInRange(dateForRead,dateForRead + 'T23:59:59.999Z');
      });
      const [people, appointments] = await Promise.allSettled([directory,calendar]);
      ownReader?.dispose();
      if (reader === ownReader) reader = null;
      if (!valid()) return;
      directoryError = people.status !== 'fulfilled';
      patients = new Map((directoryError ? [] : people.value).map(patientRow).sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(record=>[record.id,record]));
      workingVisit();
      feedback.replaceChildren();
      if (directoryError) feedback.textContent = 'Nie udało się wczytać kartoteki.';
      if (!results.hidden) search();
      if (appointments.status === 'fulfilled') renderSchedule(appointments.value);
      else schedule.replaceChildren(element('p','vgs-empty','Nie udało się wczytać dzisiejszych wizyt.'));
      if (directoryError || appointments.status !== 'fulfilled') {
        const retry = element('button','vgs-retry','Spróbuj ponownie');
        retry.type = 'button'; retry.onclick = refresh; feedback.append(retry);
      }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; sequence++; events.abort(); clearTimeout(midnight);
      reader?.dispose(); reader = null; patients.clear(); if (dialog.open) dialog.close();
      scope.remove();
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
    });
    function offSearch(event) {
      if (!results.hidden && !event.composedPath().includes(get('.vgs-controls'))) closeSearch();
    }
    doc.addEventListener('pointerdown',offSearch,listen);
    doc.addEventListener('focusin',offSearch,listen);
    doc.addEventListener('vilda:home-encounter-changed',refresh,listen);
    get('.vgs-quick').onclick = () => { if (current()) { closeSearch(); dialog.showModal(); } };
    bindQuick(dialog,current);
    active = {scope,vault,destroy,refresh,focusSearch:()=>query.focus()};
    if (!watched.has(vault)) {
      watched.add(vault);
      vault.onLock(() => { if (active?.vault === vault) active.destroy(); });
      for (const key of ['onPatientSaved','onPatientDeleted','onPatientNoteChanged']) {
        vault[key]?.(()=>{ if (active?.vault === vault) active.refresh(); });
      }
    }
    schedule.append(element('p','vgs-empty','Wczytywanie terminarza…'));
    refresh();
    return active;
  }
  w.VildaHomeGabinetStart = Object.freeze({mount});
})(window);
