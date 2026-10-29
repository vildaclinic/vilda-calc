import { expect, test as base } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { startPwaUpdateServer } from '../support/pwa-update-server.mjs';

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- samodzielny serwer nie potrzebuje innych fixtures
  updateServer: async ({}, use) => {
    const server = await startPwaUpdateServer();
    try { await use(server); } finally { await server.close(); }
  },
  baseURL: async ({ updateServer }, use) => use(updateServer.origin),
});
test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce', actionTimeout: 30_000 });
test.setTimeout(180_000);

async function settled(owner) {
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.()
    && (!/\/docpro\.html$/u.test(location.pathname)
      || (window.VildaDocproStatePersistence?.isReady?.() === true
        && window.VildaDocproStatePersistence.isRestoring() === false)));
}

async function observed(page, owner) {
  const clinical = await owner.evaluate(() => ({
    state: window.VildaSaveStatusIndicator?.getState(),
    reference: window.VildaSaveStatusIndicator?.getReferenceFingerprint(),
    current: window.VildaSaveStatusIndicator?._computeCanonicalFingerprint(),
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    rawReference: sessionStorage.getItem('vilda-save-ref-v1'),
    main: window.VildaPersistence?.readMainSession(),
    shared: window.VildaPersistence?.readShared?.(),
    dom: Object.fromEntries(['weight', 'height', 'bpSystolic', 'bpDiastolic']
      .map(id => [id, document.getElementById(id)?.value])),
  }));
  const host = await page.evaluate(async () => ({
    url: location.href,
    caches: await caches.keys(),
    chipClass: document.getElementById('vildaPatientChip')?.className,
    lifecycle: window.__vildaServiceWorkerClientLifecycle,
    panels: [...document.querySelectorAll('iframe.app-pane')].map(frame => ({
      title: frame.title, hidden: frame.hidden,
      bp: frame.contentDocument?.getElementById('bpSystolic')?.value,
      owner: frame.contentWindow?.VildaPanelPacjent?.wlasciciel?.(),
      stale: frame.contentWindow?.VildaPanelPacjent?.nieaktualny?.(),
    })),
  }));
  return { clinical, host };
}

async function saveInputs(owner, { weight, systolic }) {
  if (weight !== undefined) await owner.locator('#weight').fill(String(weight));
  await owner.locator('#bpSystolic').fill(String(systolic));
  await owner.locator('#bpDiastolic').fill('74');
  await owner.locator('#bpDiastolic').blur();
  await owner.evaluate(() => window.saveUserData());
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator?.getState()))
    .toBe('saved');
}

async function deployAndUpdate(page, server) {
  const oldCache = server.cacheName();
  const cacheName = server.deployNextVersion();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) throw new Error('Brak aktywnej rejestracji SW przed aktualizacją');
    await registration.update();
  });
  const update = page.locator('#sw-update-banner #sw-refresh');
  await expect(update).toBeVisible({ timeout: 60_000 });
  const loaded = page.waitForEvent('load', { timeout: 60_000 });
  await update.click();
  await loaded;
  await expect.poll(() => page.evaluate(async ({ previous, next }) => {
    const keys = await caches.keys();
    const registration = await navigator.serviceWorker.getRegistration('/');
    return {
      newCache: keys.includes(next), oldCache: keys.includes(previous),
      controller: navigator.serviceWorker.controller?.state,
      active: registration?.active?.state,
      waiting: registration?.waiting ?? null,
      installing: registration?.installing ?? null,
    };
  }, { previous: oldCache, next: cacheName }), { timeout: 60_000 }).toEqual({
    newCache: true, oldCache: false, controller: 'activated', active: 'activated',
    waiting: null, installing: null,
  });
  return cacheName;
}

for (const { shell, trigger } of [
  { shell: true, trigger: 'update' },
  { shell: false, trigger: 'update' },
  { shell: true, trigger: 'reload' },
]) {
  for (const dirty of [false, true]) {
    test(`${shell ? 'powłoka z DocPro i Klirensem' : 'strona samodzielna'}: ${trigger === 'update' ? 'aktualizacja PWA' : 'F5'} zachowuje ${dirty ? 'rzeczywistą edycję BP121' : 'zapisany pomiar'}`, async ({ page, updateServer }, testInfo) => {
      const observations = {};
      let owner;
      try {
        const fixture = await createFictionalVault(page, { shell });
        owner = fixture.frame;
        await loadPatient(owner, fixture.ids.a, 'restore', { clear: true });
        await settled(owner);
        await saveInputs(owner, { systolic: 118 });
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 120_000 });
        // Aktualizacja dotyczy wizyty, która już rozpoczęła się pod kontrolą SW.
        await page.reload({ waitUntil: 'load' });
        owner = shell ? await shellFrame(page, 'Start') : page;
        await settled(owner);

        if (shell) {
          for (const [route, title] of [['docpro', 'DocPro'], ['klirens', 'Kalkulator klirensu']]) {
            await page.evaluate(value => window.VildaShell.navigate(value), route);
            owner = await shellFrame(page, title);
            await settled(owner);
            const professional = owner.locator('#professionalConfirmBtn');
            if (await professional.isVisible()) await professional.click();
          }
          await page.evaluate(() => window.VildaShell.navigate('start'));
          owner = await shellFrame(page, 'Start');
          await settled(owner);
        }
        // Ukryte panele powstały dla wcześniejszego pomiaru. Aktywny Start
        // zapisuje nowy pomiar tego samego pacjenta i jego rzeczywistą datę.
        await saveInputs(owner, { weight: 47, systolic: 120 });
        observations.saved = await observed(page, owner);
        const saved = observations.saved.clinical;
        expect(saved.current).toBe(saved.reference);
        expect(saved.main.user.measuredAtISO).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(saved.main.bp.systolic).toBe(120);
        observations.savedVault = await owner.evaluate(async id => (
          await window.VildaVault.getPatient(id)
        ).snapshots, saved.patientId);

        if (dirty) {
          await owner.locator('#bpSystolic').fill('121');
          await owner.locator('#bpSystolic').blur();
          await expect.poll(() => owner.evaluate(() => ({
            state: window.VildaSaveStatusIndicator?.getState(),
            systolic: window.VildaPersistence.readMainSession()?.bp?.systolic,
          }))).toEqual({ state: 'dirty', systolic: 121 });
        }
        observations.before = await observed(page, owner);
        const before = observations.before.clinical;
        expect(before.reference).toBe(saved.reference);
        expect(before.patientId).toBe(saved.patientId);
        expect(before.state).toBe(dirty ? 'dirty' : 'saved');
        expect(before.current === before.reference).toBe(!dirty);
        if (shell) {
          expect(observations.before.host.panels).toEqual(expect.arrayContaining([
            expect.objectContaining({ title: 'DocPro', hidden: true, bp: '118' }),
            expect.objectContaining({ title: 'Kalkulator klirensu', hidden: true }),
          ]));
        }

        let expectedCache = updateServer.cacheName();
        if (trigger === 'update') expectedCache = await deployAndUpdate(page, updateServer);
        else await page.reload({ waitUntil: 'load' });
        owner = shell ? await shellFrame(page, 'Start') : page;
        await settled(owner);
        await expect.poll(async () => {
          const state = await observed(page, owner);
          return {
            status: state.clinical.state,
            reference: state.clinical.reference,
            current: state.clinical.current,
            patientId: state.clinical.patientId,
          };
        }, { timeout: 20_000 }).toEqual({
          status: dirty ? 'dirty' : 'saved', reference: before.reference,
          current: before.current, patientId: before.patientId,
        });
        observations.after = await observed(page, owner);
        const after = observations.after.clinical;
        expect(after.rawReference).toBe(before.rawReference);
        expect(after.main.user).toEqual(before.main.user);
        expect(after.main.bp).toEqual(before.main.bp);
        expect(after.dom.bpSystolic).toBe(dirty ? '121' : '120');
        expect(after.dom.weight).toBe('47');
        expect(observations.after.host.caches).toContain(expectedCache);
        if (trigger === 'reload') {
          expect([...observations.after.host.caches].sort())
            .toEqual([...observations.before.host.caches].sort());
        }
        await expect(page.locator('#vildaPatientChip'))
          .toHaveClass(new RegExp(`vilda-save-state--${dirty ? 'dirty' : 'saved'}(?:\\s|$)`, 'u'));

        const stored = await owner.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots, saved.patientId);
        expect(stored, 'aktualizacja nie zapisuje edycji ani nowej migawki w sejfie').toEqual(observations.savedVault);
        expect(stored[0].payload.bp.systolic).toBe(120);
      } catch (error) {
        try { if (owner && !owner.isDetached?.()) observations.failure = await observed(page, owner); } catch { /* dokument w trakcie reload */ }
        await testInfo.attach('patient-status-pwa-update', {
          body: JSON.stringify(observations, null, 2), contentType: 'application/json',
        });
        throw error;
      }
    });
  }
}
