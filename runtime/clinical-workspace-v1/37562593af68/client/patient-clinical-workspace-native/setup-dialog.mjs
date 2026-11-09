// First-use UI. Progress is derived only from the native ceremony; closing or
// retrying this view cannot turn a partial publication into an active account.
export function showWorkspaceSetup({ onboarding, document, assertCurrent }) {
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let busy = false, closed = false, recovery = null, downloaded = false;
    const downloadUrls = new Set();
    const overlay = document.createElement('div'); overlay.className = 'vcp-dialog-overlay';
    const panel = document.createElement('dialog'); panel.className = 'vcp vcp-dialog vcp-setup-dialog';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Przygotowanie planów z etapami');
    const title = document.createElement('h2'); title.textContent = 'Plany z etapami';
    const introduction = document.createElement('p');
    introduction.textContent = 'Przygotujemy zapis i synchronizację planów wraz z dokumentacją pacjentów. Dotychczasowa kopia danych pozostanie zachowana.';
    const backupNotice = document.createElement('p'); backupNotice.className = 'vcp-setup-status';
    backupNotice.textContent = 'Po uruchomieniu planów z etapami dotychczasowe automatyczne kopie .wiw nie będą dostępne. Pełną kopię dokumentacji zapiszesz osobno w Ustawieniach → Kopie zapasowe → Kopia i odtwarzanie. Przed uruchomieniem pobierzesz taką kopię i zachowasz jej kod odzyskiwania.';
    const status = document.createElement('p'); status.className = 'vcp-setup-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const body = document.createElement('div'); body.className = 'vcp-setup-body';
    const controls = document.createElement('div'); controls.className = 'vcp-toolbar vcp-setup-actions';
    const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'vcp-primary'; primary.textContent = 'Przygotuj zapis';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Wróć';
    panel.append(title, introduction, backupNotice, status, body, controls); controls.append(primary, cancel); overlay.append(panel); document.body.append(overlay);
    function clearRecovery() {
      recovery?.packetBytes?.fill(0); recovery = null; downloaded = false;
      for (const field of body.querySelectorAll('textarea')) field.value = '';
      body.replaceChildren();
      for (const url of downloadUrls) URL.revokeObjectURL(url);
      downloadUrls.clear();
    }
    function finish(available) {
      if (closed) return; closed = true; clearRecovery();
      if (panel.open && typeof panel.close === 'function') panel.close();
      overlay.remove();
      onboarding.close();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
      resolve({ available });
    }
    function current() {
      if (closed) return false;
      try { assertCurrent(); return true; } catch { finish(false); return false; }
    }
    function buttonState() {
      primary.disabled = busy; cancel.disabled = false;
      for (const field of body.querySelectorAll('button,input')) field.disabled = busy;
      panel.setAttribute('aria-busy', String(busy));
    }
    async function perform(action) {
      if (busy || closed) return;
      busy = true; buttonState();
      try { if (current()) { await action(); current(); } }
      catch (error) {
        if (!current()) return;
        if (error?.code?.endsWith('CLOSED') || error?.code === 'SESSION_CHANGED') { finish(false); return; }
        status.textContent = 'Nie udało się zakończyć przygotowania. Dotychczasowe dane są zachowane. Możesz spróbować ponownie.';
      } finally { busy = false; if (!closed) buttonState(); }
    }
    function download() {
      if (busy || !recovery || !current()) return;
      const blob = new Blob([recovery.packetBytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      downloadUrls.add(url);
      anchor.href = url; anchor.download = 'vilda-plany-kopia.vilda'; anchor.hidden = true;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { if (downloadUrls.delete(url)) URL.revokeObjectURL(url); }, 60000);
      downloaded = true; status.textContent = 'Zachowaj plik oraz kod odzyskiwania. Kod przechowuj osobno od pliku.';
    }
    function showBackup(value) {
      if (!current()) { value.packetBytes?.fill(0); return; }
      clearRecovery(); recovery = value;
      const text = document.createElement('p'); text.textContent = 'Pobierz pełną kopię bezpieczeństwa i zachowaj kod odzyskiwania przed uruchomieniem nowego zapisu.';
      const downloadButton = document.createElement('button'); downloadButton.type = 'button'; downloadButton.textContent = 'Pobierz kopię bezpieczeństwa'; downloadButton.addEventListener('click', download);
      const label = document.createElement('label'); label.textContent = 'Kod odzyskiwania';
      const code = document.createElement('textarea'); code.readOnly = true; code.value = value.recoveryCode;
      code.setAttribute('aria-label', 'Kod odzyskiwania'); code.setAttribute('spellcheck', 'false'); label.append(code);
      const confirmLabel = document.createElement('label'); confirmLabel.className = 'vcp-check';
      const confirm = document.createElement('input'); confirm.type = 'checkbox';
      confirmLabel.append(confirm, document.createTextNode('Mam zapisany plik oraz kod odzyskiwania.'));
      body.append(text, downloadButton, label, confirmLabel);
      primary.textContent = 'Uruchom plany z etapami';
      primary.onclick = () => {
        if (!downloaded || !confirm.checked) { status.textContent = 'Najpierw pobierz kopię i potwierdź zachowanie pliku oraz kodu.'; return; }
        perform(async () => {
          status.textContent = 'Sprawdzanie zapisanej kopii…';
          const result = await onboarding.finish(true);
          if (!current()) return;
          if (result.ready) { finish(true); return; }
          if (result.backupChanged) {
            status.textContent = 'W międzyczasie zmieniły się dane. Pobierz uaktualnioną kopię.';
            showBackup(await onboarding.backup()); return;
          }
          throw new Error('Setup not confirmed');
        });
      };
    }
    primary.onclick = () => perform(async () => {
      status.textContent = 'Przygotowywanie pełnej kopii danych…'; await onboarding.prepare();
      if (!current()) return;
      status.textContent = 'Zapisywanie i sprawdzanie synchronizacji…'; const publication = await onboarding.publish(true);
      if (!current()) return;
      if (publication.ready) { finish(true); return; }
      status.textContent = 'Przygotowywanie kopii do pobrania…'; showBackup(await onboarding.backup());
      if (current()) status.textContent = 'Kopia jest gotowa. Pobierz plik i zachowaj kod odzyskiwania.';
    });
    cancel.addEventListener('click', () => finish(false));
    panel.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    panel.addEventListener('close', () => finish(false));
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button,input,textarea,[tabindex]')].filter(element => !element.disabled && !element.hidden);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    try {
      // The template library itself may already own a modal top-layer dialog.
      // A regular overlay would then be inert behind it.
      panel.showModal(); primary.focus({ preventScroll: true });
    } catch { finish(false); }
  });
}
