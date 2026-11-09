// Recovery UI only. Account selection and durable installation remain in the
// native provider; file names, headers and UI state never authorize a write.
import { MAX_PACKAGE_BYTES } from './package.mjs';
import { showWorkspaceConflict } from '../patient-clinical-workspace-native/conflict-dialog.mjs';
export function showWorkspaceRecovery({ provider, document, assertCurrent, subscribeSessionEnd }) {
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let closed = false, busy = false, installing = false, artifact = null, preview = null, unsubscribe = null;
    const urls = new Set();
    const node = (tag, text) => { const value = document.createElement(tag); if (text) value.textContent = text; return value; };
    const panel = node('dialog'); panel.className = 'vcp-recovery';
    panel.setAttribute('aria-label', 'Kopia bezpieczeństwa i odtwarzanie');
    const style = node('style'); style.textContent = `
      .vcp-recovery{box-sizing:border-box;width:min(640px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid #cfdee1;border-radius:16px;background:#fff;color:#172a31;font:16px/1.5 system-ui,sans-serif;box-shadow:0 16px 60px #163f4426}
      .vcp-recovery::backdrop{background:#122b365c}.vcp-recovery h2{margin:0 0 12px;font-size:22px}.vcp-recovery h3{font-size:18px;margin:0 0 12px}.vcp-recovery p{margin:8px 0 16px}.vcp-recovery section{border-top:1px solid #dce7e9;padding:20px 0 4px}.vcp-recovery label{display:block;margin:12px 0}.vcp-recovery textarea,.vcp-recovery input[type=file]{box-sizing:border-box;width:100%;font:inherit;padding:10px;border:1px solid #bdd0d5;border-radius:8px;background:#fff;color:#172a31}.vcp-recovery textarea{min-height:96px;overflow-wrap:anywhere}.vcp-recovery button{min-height:44px;margin:4px 8px 4px 0;padding:10px 16px;border:1px solid #b7cdd2;border-radius:8px;background:#fff;color:#172a31;font:inherit;cursor:pointer}.vcp-recovery button:disabled{opacity:.55;cursor:default}.vcp-recovery .vcp-recovery-primary{background:#00858f;border-color:#00858f;color:#fff}.vcp-recovery [role=status]{background:#f0f6f6;padding:12px;border-radius:8px}.vcp-recovery button:focus-visible,.vcp-recovery textarea:focus-visible,.vcp-recovery input:focus-visible{outline:3px solid #00858f;outline-offset:2px}.vcp-recovery [hidden]{display:none!important}
    `;
    const title = node('h2', 'Kopia dokumentacji pacjentów');
    const account = node('p', 'Sprawdzanie konta…');
    const status = node('p', 'Wczytywanie…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const exportSection = node('section'); exportSection.hidden = true;
    const exportButton = node('button', 'Przygotuj pełną kopię'); exportButton.type = 'button';
    const backupDetails = node('div');
    exportSection.append(node('h3', 'Zapisz kopię'), node('p', 'Kopia obejmuje dokumentację pacjentów, przypisane plany oraz zachowane zmiany oczekujące na synchronizację. Bibliotekę szablonów wyeksportuj osobno w „Moje szablony”.'), exportButton, backupDetails);
    const importSection = node('section'); importSection.hidden = true;
    const fileLabel = node('label', 'Plik kopii'); const file = node('input'); file.type = 'file'; file.accept = '.vilda,.vilda-workspace,application/octet-stream'; fileLabel.append(file);
    const codeLabel = node('label', 'Kod odzyskiwania'); const code = node('textarea'); code.spellcheck = false; code.autocomplete = 'off'; code.setAttribute('aria-label', 'Kod odzyskiwania'); codeLabel.append(code);
    const verify = node('button', 'Sprawdź kopię'); verify.type = 'button';
    const review = node('div');
    importSection.append(node('h3', 'Odtwórz kopię'), node('p', 'Odtwarzanie jest dostępne na pustym koncie. Plik i kod zostaną sprawdzone przed zmianą danych.'), fileLabel, codeLabel, verify, review);
    const closeButton = node('button', 'Zamknij'); closeButton.type = 'button';
    panel.append(style, title, account, status, exportSection, importSection, closeButton); document.body.append(panel);
    function discardPreview() { if (preview) provider.discardPreview(preview.token); preview = null; review.replaceChildren(); }
    function finish(restored = false) {
      if (closed) return; closed = true;
      discardPreview(); artifact?.packetBytes.fill(0); artifact = null; code.value = ''; file.value = '';
      for (const field of backupDetails.querySelectorAll('textarea')) field.value = '';
      for (const url of urls) URL.revokeObjectURL(url); urls.clear(); provider.close();
      unsubscribe?.(); unsubscribe = null;
      if (panel.open) panel.close(); panel.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve({ restored });
    }
    function current() { if (closed) return false; try { assertCurrent(); return true; } catch { finish(); return false; } }
    function state() {
      panel.setAttribute('aria-busy', String(busy));
      for (const control of panel.querySelectorAll('button,input,textarea')) control.disabled = busy;
      closeButton.disabled = installing;
    }
    function errorText(error) {
      const value = typeof error?.code === 'string' ? error.code : '';
      if (value.endsWith('TARGET_NOT_EMPTY')) return 'Konto zawiera już dane. Wybierz lub utwórz puste konto, aby odtworzyć kopię.';
      if (value === 'WORKSPACE_RECOVERY_LEGACY_DIVERGED') return 'Starsza wersja aplikacji zapisała dodatkowe dane. Oba zapisy zachowano. Pełna kopia została wstrzymana, ponieważ nie obejmowałaby tych zmian. Wymagają osobnego uzgodnienia; okno konfliktów synchronizacji ich nie obsługuje.';
      if (value === 'WORKSPACE_RECOVERY_CONFLICT') return 'Zachowano obie wersje danych. Odtworzenie wymaga rozstrzygnięcia konfliktu synchronizacji; konto nie zostało przełączone.';
      if (value.includes('LIMIT') || value.includes('QUOTA')) return 'Brakuje miejsca na pełną kopię lub przekroczono obsługiwany rozmiar. Dane nie zostały pominięte ani skrócone.';
      if (value.endsWith('CONFLICT')) return 'Dane konta zmieniły się. Sprawdź kopię ponownie przed odtworzeniem.';
      if (value.endsWith('CORRUPT') || value.endsWith('INVALID')) return 'Nie udało się zweryfikować pliku i kodu. Sprawdź, czy pochodzą z tej samej kopii.';
      return 'Nie udało się zakończyć operacji. Sprawdź plik, kod oraz połączenie i spróbuj ponownie. Dotychczasowe dane pozostają zachowane.';
    }
    async function perform(action, installation = false) {
      if (busy || !current()) return;
      busy = true; installing = installation; state();
      try { await action(); }
      catch (error) {
        if (current()) {
          status.textContent = errorText(error);
          if (error?.code === 'WORKSPACE_RECOVERY_CONFLICT' && preview && !review.querySelector('[data-recovery-conflict]')) {
            const compare = node('button', 'Uzgodnij zmiany przed odtworzeniem'); compare.type = 'button'; compare.dataset.recoveryConflict = 'true';
            compare.addEventListener('click', () => perform(async () => {
              const service = provider.getConflictService({ token: preview.token });
              try {
                const result = await showWorkspaceConflict({ service, document, assertCurrent, subscribeSessionEnd });
                if (current() && result.resolved) {
                  compare.remove(); status.textContent = 'Zmiany uzgodniono. Kliknij „Odtwórz na pustym koncie”, aby dokończyć odtwarzanie.';
                }
              } finally { service.close(); }
            }));
            review.append(compare);
          }
        }
      }
      finally { busy = false; installing = false; if (!closed) state(); }
    }
    function download(bytes, name, type = 'application/octet-stream') {
      if (!current()) return;
      const url = URL.createObjectURL(new Blob([bytes], { type })); urls.add(url);
      const anchor = node('a'); anchor.href = url; anchor.download = name; anchor.hidden = true;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { if (urls.delete(url)) URL.revokeObjectURL(url); }, 60000);
    }
    exportButton.addEventListener('click', () => perform(async () => {
      status.textContent = 'Przygotowywanie i sprawdzanie pełnej kopii…';
      const result = await provider.exportBackup();
      if (!current()) { result.packetBytes.fill(0); return; }
      artifact?.packetBytes.fill(0); artifact = result; backupDetails.replaceChildren();
      const save = node('button', 'Pobierz plik kopii'); save.type = 'button'; save.className = 'vcp-recovery-primary';
      save.addEventListener('click', () => download(artifact.packetBytes, 'vilda-dokumentacja.vilda-workspace'));
      const label = node('label', 'Kod odzyskiwania — zachowaj osobno od pliku');
      const output = node('textarea'); output.readOnly = true; output.value = result.recoveryCode; output.spellcheck = false; label.append(output);
      const saveCode = node('button', 'Pobierz kod'); saveCode.type = 'button';
      saveCode.addEventListener('click', () => download(artifact.recoveryCode, 'vilda-kod-odzyskiwania.txt', 'text/plain;charset=utf-8'));
      backupDetails.append(save, label, saveCode);
      status.textContent = 'Kopia została sprawdzona. Do odtworzenia potrzebujesz pliku oraz kodu odzyskiwania.';
    }));
    file.addEventListener('change', discardPreview); code.addEventListener('input', discardPreview);
    verify.addEventListener('click', () => perform(async () => {
      discardPreview();
      if (!file.files?.[0] || !code.value.trim()) { status.textContent = 'Wybierz plik i wpisz kod odzyskiwania.'; return; }
      if (file.files[0].size > MAX_PACKAGE_BYTES) { status.textContent = 'Plik przekracza obsługiwany rozmiar kopii. Nie został wczytany ani skrócony.'; return; }
      status.textContent = 'Sprawdzanie pełnej kopii…';
      const bytes = new Uint8Array(await file.files[0].arrayBuffer());
      try { preview = await provider.previewImport({ packetBytes: bytes, recoveryCode: code.value.trim() }); }
      finally { bytes.fill(0); }
      if (!current()) return;
      const description = node('p', `Kopia: ${preview.patientCount} pacjentów, ${preview.carePlanCount} planów. Zmiany oczekujące: ${preview.pendingCount}. Konto docelowe: ${preview.accountLabel}.`);
      const restore = node('button', 'Odtwórz na pustym koncie'); restore.type = 'button'; restore.className = 'vcp-recovery-primary';
      restore.addEventListener('click', () => perform(async () => {
        status.textContent = 'Odtwarzanie i sprawdzanie synchronizacji…';
        const result = await provider.importBackup({ token: preview.token });
        if (result.restored) finish(true);
      }, true));
      review.append(description, restore); status.textContent = 'Plik i kod są poprawne. Możesz teraz odtworzyć kopię.';
    }));
    const requestClose = () => { if (installing) { status.textContent = 'Trwa kończenie odtwarzania. Zaczekaj na wynik.'; return; } finish(); };
    closeButton.addEventListener('click', requestClose);
    panel.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
    panel.addEventListener('close', requestClose);
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button,input,textarea')].filter(control => !control.disabled && !control.closest('[hidden]'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    try {
      if (typeof subscribeSessionEnd === 'function') unsubscribe = subscribeSessionEnd(() => finish());
      if (closed) return;
      panel.showModal(); closeButton.focus({ preventScroll: true });
    } catch { finish(); return; }
    perform(async () => {
      const value = await provider.getState(); if (!current()) return;
      account.textContent = `Konto: ${value.accountLabel}`; status.textContent = value.message;
      exportSection.hidden = !value.canExport; importSection.hidden = !value.canImport;
    });
  });
}
