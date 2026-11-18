// Branch choice remains explicit, with a complete encrypted backup of both
// reviewed states before the resolution can be submitted.
export function showWorkspaceConflict({ service, document, assertCurrent, subscribeSessionEnd }) {
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let closed = false, busy = false, reviewed = null, downloaded = false, choice = null, submitted = false, unsubscribe = null;
    const choiceButtons = new Set();
    const urls = new Set(), panel = document.createElement('dialog');
    panel.className = 'vcp vcp-dialog vcp-setup-dialog vcp-conflict-dialog';
    panel.setAttribute('aria-label', 'Uzgodnij zmiany danych');
    const title = document.createElement('h2'); title.textContent = 'Uzgodnij zmiany danych';
    const intro = document.createElement('p');
    intro.textContent = 'Na tym urządzeniu i w synchronizacji są różne zapisy. Wybierz jeden kompletny zapis. Nie łączymy automatycznie wyników ani dokumentacji. Oba zapisy pozostaną w kopii bezpieczeństwa.';
    const status = document.createElement('p'); status.className = 'vcp-setup-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const body = document.createElement('div'); body.className = 'vcp-setup-body';
    const actions = document.createElement('div'); actions.className = 'vcp-toolbar vcp-setup-actions';
    const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'vcp-primary'; primary.textContent = 'Wczytaj porównanie';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Wróć';
    actions.append(primary, cancel); panel.append(title, intro, status, body, actions); document.body.append(panel);
    function clear() {
      reviewed?.backup.packetBytes.fill(0); reviewed = null; downloaded = false; choice = null; submitted = false; choiceButtons.clear();
      for (const field of body.querySelectorAll('textarea')) field.value = '';
      body.replaceChildren();
      for (const url of urls) URL.revokeObjectURL(url); urls.clear();
    }
    function finish(resolved) {
      if (closed) return; closed = true; clear(); service.close(); unsubscribe?.(); unsubscribe = null;
      if (panel.open) panel.close(); panel.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve({ resolved });
    }
    function current() {
      if (closed) return false;
      try { assertCurrent(); return true; } catch { finish(false); return false; }
    }
    function buttonState() {
      primary.disabled = busy; cancel.disabled = false;
      for (const field of body.querySelectorAll('button,input')) field.disabled = busy;
      if (submitted) for (const button of choiceButtons) button.disabled = true;
      panel.setAttribute('aria-busy', String(busy));
    }
    async function perform(action) {
      if (busy || !current()) return;
      busy = true; buttonState();
      try { await action(); current(); }
      catch (failure) {
        if (!current()) return;
        let code; try { code = failure?.code; } catch { /* Do not display arbitrary exception text. */ }
        if (code === 'WORKSPACE_REVIEW_STALE') {
          clear(); primary.textContent = 'Wczytaj nowe porównanie'; primary.onclick = load;
          status.textContent = 'Zapisy zmieniły się od czasu porównania. Wczytaj aktualne wersje i pobierz nową kopię przed wyborem.';
        } else if (code === 'WORKSPACE_CLIENT_NOT_READY' && !reviewed) {
          status.textContent = 'Nie ma teraz zmian wymagających uzgodnienia. Wróć do aplikacji lub ponów porównanie.';
        } else {
          if (submitted) primary.textContent = 'Ponów potwierdzenie wybranego zapisu';
          status.textContent = 'Nie udało się potwierdzić zakończenia. Oba zapisy pozostają zachowane. Ponów tę samą czynność, aby sprawdzić jej wynik.';
        }
      } finally { busy = false; if (!closed) buttonState(); }
    }
    const addText = (parent, tag, text) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
    function download() {
      if (busy || !reviewed || !current()) return;
      const url = URL.createObjectURL(new Blob([reviewed.backup.packetBytes], { type: 'application/octet-stream' })); urls.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'vilda-oba-zapisy-kopia.vilda'; anchor.hidden = true;
      document.body.append(anchor); anchor.click(); anchor.remove(); downloaded = true;
      setTimeout(() => { if (urls.delete(url)) URL.revokeObjectURL(url); }, 60000);
      status.textContent = 'Zachowaj plik i osobno kod odzyskiwania. Następnie wybierz zapis i potwierdź skutki tego wyboru.';
    }
    function show(value) {
      if (!current()) { value.backup.packetBytes.fill(0); return; }
      clear(); reviewed = value;
      const summary = value.summary;
      addText(body, 'p', `Na tym urządzeniu: ${summary.localPatientCount} pacjentów. W synchronizacji: ${summary.remotePatientCount} pacjentów.`);
      addText(body, 'p', 'Wybór obejmuje cały zapis: pacjentów, pomiary, dokumentację, plany, listy oraz notatnik. Nie można zachować części każdej wersji w tym oknie.');
      const names = { patients: 'Dane pacjentów', snapshots: 'Pomiary', patientNotes: 'Dokumentacja pacjentów', tombstones: 'Usunięcia pacjentów',
        patientNoteTombstones: 'Usunięcia dokumentacji', notes: 'Notatnik', noteTombstones: 'Usunięcia w notatniku', patientLists: 'Listy pacjentów',
        patientListTombstones: 'Usunięcia list', carePlansV2: 'Plany z etapami', clinicalMeta: 'Ustawienia i historia zapisów', shadows: 'Zachowana historia pomiarów' };
      addText(body, 'p', 'Różnice: ' + (summary.differences.map(item => names[item.store] || item.store).join(', ') || 'Historia zapisu'));
      const comparison = document.createElement('details');
      addText(comparison, 'summary', `Porównaj pacjentów z różnicami (${summary.patients.length})`);
      const stateLabels = { present: 'Dostępny', deleted: 'Usunięty', missing: 'Nieobecny w tym zapisie' };
      for (const patient of summary.patients) {
        const row = document.createElement('section'); row.className = 'vcp-conflict-patient';
        addText(row, 'h3', patient.local.state === 'present' ? patient.local.name : patient.remote.name);
        if (patient.changedSections?.length) addText(row, 'p', 'Różnice: ' + patient.changedSections.map(name => names[name] || name).join(', '));
        for (const [key, heading] of [['local', 'Na tym urządzeniu'], ['remote', 'W synchronizacji']]) {
          const item = patient[key], column = document.createElement('div'); column.className = 'vcp-conflict-branch';
          addText(column, 'strong', heading); addText(column, 'p', stateLabels[item.state]);
          if (item.state === 'present') addText(column, 'p', item.name);
          addText(column, 'p', `Zachowane pomiary: ${item.measurements} · Wpisy: ${item.notes} · Plany z etapami: ${item.plans}`);
          if (item.savedAtISO) addText(column, 'p', 'Ostatni zapis: ' + item.savedAtISO);
          if (item.deletedAtISO) addText(column, 'p', 'Zapis usunięcia: ' + item.deletedAtISO);
          row.append(column);
        }
        comparison.append(row);
      }
      body.append(comparison);
      const downloadButton = addText(body, 'button', 'Pobierz kopię obu zapisów'); downloadButton.type = 'button'; downloadButton.addEventListener('click', download);
      const codeLabel = addText(body, 'label', 'Kod odzyskiwania — zachowaj osobno od pliku');
      const code = document.createElement('textarea'); code.readOnly = true; code.value = value.backup.recoveryCode; code.setAttribute('aria-label', 'Kod odzyskiwania'); codeLabel.append(code);
      const backupLabel = document.createElement('label'); backupLabel.className = 'vcp-check';
      const backupCheck = document.createElement('input'); backupCheck.type = 'checkbox'; backupLabel.append(backupCheck, document.createTextNode('Mam zapisany plik obu wersji oraz kod odzyskiwania.')); body.append(backupLabel);
      const warning = document.createElement('div'); warning.className = 'vcp-conflict-warning';
      const acceptance = document.createElement('label'); acceptance.className = 'vcp-check';
      const changesCheck = document.createElement('input'); changesCheck.type = 'checkbox'; acceptance.append(changesCheck, document.createTextNode('Potwierdzam powyższe przywrócenia i pominięcia pacjentów.'));
      function selected(key) {
        choice = key; changesCheck.checked = false; warning.replaceChildren();
        addText(warning, 'p', key === 'local' ? 'Wybrano zapis z tego urządzenia.' : 'Wybrano zapis z synchronizacji.');
        const changes = summary.patientChanges[key];
        if (changes.length) {
          const list = document.createElement('ul');
          for (const change of changes) addText(list, 'li', change.name + ': ' + ({ restore: 'przywrócenie pacjenta usuniętego w drugim zapisie',
            include: 'zachowanie pacjenta nieobecnego w drugim zapisie', exclude: 'pacjent z drugiego zapisu nie będzie dostępny w wybranym zapisie' })[change.effect]);
          warning.append(list, acceptance);
        }
        primary.textContent = 'Potwierdź wybrany zapis';
      }
      for (const [key, text] of [['local', 'Wybierz zapis z tego urządzenia'], ['remote', 'Wybierz zapis z synchronizacji']]) {
        const button = addText(body, 'button', text); button.type = 'button'; choiceButtons.add(button);
        button.addEventListener('click', () => { if (!busy && !submitted && current()) selected(key); });
      }
      body.append(warning); primary.textContent = 'Potwierdź wybrany zapis';
      primary.onclick = () => {
        if (!choice || !downloaded || !backupCheck.checked || summary.patientChanges[choice].length && !changesCheck.checked) {
          status.textContent = 'Pobierz kopię, zachowaj kod, wybierz zapis i potwierdź ewentualne zmiany dostępności pacjentów.'; return;
        }
        perform(async () => {
          submitted = true;
          status.textContent = 'Sprawdzanie aktualności i zapisywanie wybranej wersji…';
          const result = await service.resolve({ choice, backupSaved: true, acceptPatientChanges: changesCheck.checked });
          if (current() && result.resolved) finish(true);
        });
      };
      status.textContent = 'Oba zapisy zostały zachowane. Pobierz ich wspólną kopię przed wyborem.';
    }
    function load() { perform(async () => { status.textContent = 'Sprawdzanie obu zapisów i przygotowywanie kopii…'; show(await service.review()); }); }
    primary.onclick = load; cancel.addEventListener('click', () => finish(false));
    panel.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    panel.addEventListener('close', () => finish(false));
    try {
      if (typeof subscribeSessionEnd === 'function') unsubscribe = subscribeSessionEnd(() => finish(false));
      if (!closed) { panel.showModal(); primary.focus({ preventScroll: true }); }
    } catch { finish(false); }
  });
}
