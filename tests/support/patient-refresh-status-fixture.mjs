// Observe the very first paint of a new document after a real reload. This
// marker belongs only to the test; no application state or timer is replaced.
export async function installPatientRefreshProbe(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-patient-refresh-probe') !== '1') return;
    const boundaries = ['DOMContentLoaded', 'vilda:auth-loaded', 'vilda:auth-state-settled',
      'vilda:auth-boot-settled', 'vilda:session-changed', 'vilda:persist-restored',
      'vilda:main-session-restored', 'vilda:intake-restore-readiness', 'vilda:dob-restored',
      'vilda:patient-loaded', 'vilda:state-restored', 'vilda:patient-load-presentation'];
    const local = window.__patientRefreshEvents = [];
    function record(event) {
      const data = window.VildaDataImportExport, indicator = window.VildaSaveStatusIndicator;
      local.push({ at: performance.timeOrigin + performance.now(), type: event.type,
        target: event.currentTarget === window ? 'window' : 'document', path: location.pathname,
        cached: indicator?.getState?.(), readiness: data?.getSaveReadiness?.(),
        mainPending: data?.isMainSessionRestorePending?.(),
        authReady: window.VildaAuthUI?.isBootReady?.(), unlocked: window.VildaVault?.isUnlocked?.(),
        patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        restore: Boolean(window.__vildaPersistRestoring || window.__vildaLustroWpis),
        dobPending: window.VildaDobAge?.restorePending?.() });
    }
    for (const type of boundaries) {
      document.addEventListener(type, record);
      window.addEventListener(type, record);
    }
    window.addEventListener('load', record);
    if (window !== window.top) return;
    const probe = window.__patientRefreshProbe = { running: true, frames: [], terminalTransitions: [] };
    let previousState;
    const currentOwner = () => document.querySelector('iframe.app-pane:not([hidden])')?.contentWindow
      || (!/\/app\.html$/u.test(location.pathname) ? window : null);
    function control(node, styles) {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const css = element => {
        if (!styles.has(element)) styles.set(element, getComputedStyle(element));
        return styles.get(element);
      };
      let visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight;
      for (let element = node; element; element = element.parentElement) {
        const style = css(element);
        if (element.hidden || style.display === 'none' || style.visibility === 'hidden'
          || Number(style.opacity) === 0) visible = false;
      }
      const style = css(node);
      return { text: node.textContent.trim().replace(/\s+/g, ' '),
        state: node.getAttribute('data-save-state'), visible, hidden: node.hidden,
        busy: node.getAttribute('aria-busy'), ariaDisabled: node.getAttribute('aria-disabled'),
        nativeDisabled: node.disabled === true, loadPending: node.getAttribute('data-menu-load-pending'),
        color: style.color, background: style.backgroundColor, image: style.backgroundImage,
        opacity: style.opacity, width: rect.width };
    }
    function read() {
      const owner = currentOwner(), styles = new Map(), controls = {};
      for (const [prefix, selector] of [['desktop', 'aside.sidebar-v2 .sidebar-inner'], ['drawer', '.chrome-drawer-body']]) {
        const menu = document.querySelector(selector);
        for (const [key, target] of [['save', '.chrome-menu-save'], ['documents', '.chrome-menu-documents'],
          ['clear', '[data-menu-clear]'], ['status', '[data-menu-save-status]']]) {
          controls[`${prefix}:${key}`] = control(menu?.querySelector(target), styles);
        }
      }
      controls['header:status'] = control(document.getElementById('vildaHeaderSaveStatus'), styles);
      return { at: performance.timeOrigin + performance.now(), controls,
        viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        owner: owner ? { patientId: owner.sessionStorage.getItem('vildaCurrentPatientId'),
          cached: owner.VildaSaveStatusIndicator?.getState?.(),
          ready: owner.VildaSaveStatusIndicator?.isReadyForSharedReference?.() } : null };
    }
    function capture() {
      const sample = read();
      const status = sample.controls[innerWidth < 992 ? 'header:status' : 'desktop:status'];
      if (status?.visible && ['saved', 'dirty', 'error'].includes(status.state) && previousState !== status.state) {
        const owner = currentOwner();
        // A fresh decision verifies a real terminal UI transition. No stateful
        // presentation getter or full form capture is polled between paints.
        probe.terminalTransitions.push({ at: sample.at, state: status.state,
          patientId: sample.owner?.patientId, decision: owner?.VildaSaveStatusIndicator?.getCurrentDecision?.() });
      }
      previousState = status?.state;
      return sample;
    }
    probe.stop = () => {
      const final = capture(); probe.running = false;
      return { frames: probe.frames, final, terminalTransitions: probe.terminalTransitions,
        events: [...local, ...[...document.querySelectorAll('iframe.app-pane')]
          .flatMap(frame => frame.contentWindow.__patientRefreshEvents || [])] };
    };
    function frame() {
      if (probe.running) probe.frames.push(capture());
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

export async function captureRefreshPatient(owner) {
  return owner.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    user: window.VildaDataImportExport.captureCurrentUserDataReadOnly().user,
    fields: Object.fromEntries(['lastName', 'firstName', 'height', 'weight', 'age', 'ageMonths', 'sex']
      .map(id => [id, document.getElementById(id)?.value])),
    sexDisabled: document.getElementById('sex').disabled,
    state: window.VildaSaveStatusIndicator.getState(),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision(),
    reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
    readiness: window.VildaDataImportExport.getSaveReadiness(),
    explicitLoad: window.VildaDataImportExport.getPatientLoadPresentation(),
  }));
}
