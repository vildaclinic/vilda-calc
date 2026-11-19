import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Własne fikcyjne konta, natywny sejf, AES i Web Locks; żadnego połączenia z produkcją.
test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

const PASSWORD = 'Fikcyjne#DuplikatyAES2026!';
const PREFIX = 'vildaDuplikatyRozneAccountV2:';
const LEGACY = 'vildaDuplikatyRozneV1';
const ACCOUNT_A = 'Fikcyjna Lekarka Duplikatów A';
const ACCOUNT_B = 'Fikcyjna Lekarka Duplikatów B';
const keyFor = id => PREFIX + encodeURIComponent(id);

async function prepare(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    window.__duplicateAlerts = [];
    window.alert = value => window.__duplicateAlerts.push(String(value));
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI));
}

async function ready(page, userId) {
  await page.waitForFunction(id => window.VildaVault?.isUnlocked()
    && (!id || window.VildaVault.getCurrentUser()?.userId === id)
    && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'), userId);
  await czekajNaOdtworzenieSesji(page);
}

async function account(page, label = ACCOUNT_A) {
  await prepare(page);
  const { userId } = await page.evaluate(({ password, label }) => window.VildaVault.createUser(password,
    { label, iterations: 10000, deferServerContact: true }), { password: PASSWORD, label });
  await page.reload({ waitUntil: 'load' });
  await ready(page, userId);
  return userId;
}

async function login(page, label, userId) {
  await page.locator(`.vilda-auth-user-card[title="Zaloguj jako ${label}"]`).click();
  await page.getByPlaceholder('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await ready(page, userId);
}

async function switchAccount(page, label, userId) {
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await login(page, label, userId);
}

async function pair(page, firstName = 'Ewa') {
  return page.evaluate(async firstName => {
    const V = window.VildaVault, ids = [];
    for (const age of [8, 9]) {
      const result = await V.savePatient({ name: `Fikcyjna ${firstName}`,
        user: { lastName: 'Fikcyjna', firstName, sex: 'K', age, ageMonths: 0, height: 125 + age, weight: 25 + age },
        advanced: { data: { measurements: [{ ageMonths: age * 12, height: 125 + age, weight: 25 + age }] } },
      }, { dedup: false, forceNew: true });
      await V.savePatientNote({ patientId: result.patientId, title: `Fikcyjna notatka ${age}`,
        body: 'Fikcyjny oryginał dokumentacji.', category: 'wlasne' });
      ids.push(result.patientId);
    }
    return ids;
  }, firstName);
}

const records = page => page.evaluate(async () => {
  const V = window.VildaVault, patients = await V.listPatients();
  patients.sort((a, b) => a.patientId.localeCompare(b.patientId));
  return { patients, records: await Promise.all(patients.map(p => V.getPatient(p.patientId))),
    notes: await Promise.all(patients.map(p => V.listPatientNotesForPatient(p.patientId))) };
});

async function list(page, groups) {
  await page.evaluate(() => window.VildaAuthUI.showPatientsList(() => {}));
  await expect(page.locator('.vilda-patients2')).toBeVisible();
  await expect(page.locator('.vilda-patients2')).toHaveAttribute('aria-busy', 'false');
  if (!groups) {
    await expect(page.locator('.pt-dupbar')).toBeHidden();
    await expect(page.locator('.pt-row--dup')).toHaveCount(0);
    return;
  }
  await expect(page.locator('.pt-dupbar')).toContainText(`${groups} ${groups === 1 ? 'grupa' : 'grup'}`);
  const review = page.locator('.pt-dupbar button', { hasText: 'Przejrzyj' });
  if (await review.isVisible()) await review.click();
  await expect(page.locator('.pt-dupgrp')).toHaveCount(groups);
}

const raw = (page, userId) => page.evaluate(key => window.VildaPersistence.getStorage('local').getItem(key), keyFor(userId));
const payload = (page, userId) => page.evaluate(async key => {
  const envelope = JSON.parse(window.VildaPersistence.getStorage('local').getItem(key));
  return window.VildaVault.decryptPayloadForCurrentUser(envelope.iv, envelope.data);
}, keyFor(userId));

async function pauseEncrypt(page) {
  await page.evaluate(() => {
    const native = SubtleCrypto.prototype.encrypt;
    window.__duplicateCrypto = { waiting: false, finished: false };
    SubtleCrypto.prototype.encrypt = function (algorithm, key, bytes) {
      let dismissal = false;
      try { dismissal = JSON.parse(new TextDecoder().decode(bytes)).purpose === 'duplicate-groups-dismissed'; } catch (_) {}
      if (!dismissal) return native.call(this, algorithm, key, bytes);
      SubtleCrypto.prototype.encrypt = native;
      const manager = this;
      window.__duplicateCrypto.waiting = true;
      return new Promise(resolve => { window.__duplicateCrypto.release = resolve; })
        .then(() => native.call(manager, algorithm, key, bytes))
        .finally(() => { window.__duplicateCrypto.finished = true; });
    };
  });
}

async function releaseEncrypt(page) {
  await page.evaluate(() => window.__duplicateCrypto.release());
  await page.waitForFunction(() => window.__duplicateCrypto.finished);
}

test('stare globalne grupy z dowolnymi importowanymi ID są zerowane; logowanie A → B → A izoluje decyzję', async ({ page }) => {
  await prepare(page);
  const users = await page.evaluate(async ({ password, a, b }) => {
    const V = window.VildaVault;
    const B = await V.createUser(password, { label: b, iterations: 10000, deferServerContact: true });
    V.lock('manual');
    const A = await V.createUser(password, { label: a, iterations: 10000, deferServerContact: true });
    return { a: A.userId, b: B.userId };
  }, { password: PASSWORD, a: ACCOUNT_A, b: ACCOUNT_B });
  await page.reload({ waitUntil: 'load' });
  await ready(page, users.a);
  const originalIds = await pair(page);
  const importedIds = ['fictional-import|konto / α', 'fictional-import|konto / β'];
  const envelopes = await page.evaluate(async ({ originalIds, importedIds }) => {
    const V = window.VildaVault, out = [];
    for (let index = 0; index < originalIds.length; index++) {
      const envelope = await V.exportPatientEnvelope(originalIds[index]);
      envelope.metadata.patientId = importedIds[index];
      out.push(envelope);
      await V.removePatient(originalIds[index]);
    }
    for (const envelope of out) await V.importPatientFromEnvelope(envelope);
    return out;
  }, { originalIds, importedIds });
  const legacyGroups = [importedIds.slice().sort().join('|'), 'unknown-legacy|not-in-this-account'];
  await page.evaluate(({ key, groups }) => localStorage.setItem(key, JSON.stringify(groups)), { key: LEGACY, groups: legacyGroups });
  const beforeA = await records(page);
  expect(beforeA.patients.map(p => p.patientId).sort()).toEqual(importedIds.slice().sort());
  await list(page, 1);
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBeNull();
  expect(await raw(page, users.a), 'globalnej listy nie przypisano kontu A').toBeNull();
  await page.locator('.pt-dup-rozne').click();
  await expect(page.locator('.pt-dupgrp')).toHaveCount(0);
  expect((await payload(page, users.a)).groups).toEqual([legacyGroups[0]]);
  expect(await records(page)).toEqual(beforeA);

  await switchAccount(page, ACCOUNT_B, users.b);
  await page.evaluate(async ({ envelopes, password }) => {
    for (const envelope of envelopes) await window.VildaVault.importPatientFromEnvelope(envelope, password);
  }, { envelopes, password: PASSWORD });
  const beforeB = await records(page);
  expect(beforeB.patients.map(p => p.patientId).sort()).toEqual(importedIds.slice().sort());
  await list(page, 1);
  expect(await raw(page, users.b), 'konto B nie dziedziczy decyzji A ani starej globalnej listy').toBeNull();
  expect(await records(page)).toEqual(beforeB);
  await switchAccount(page, ACCOUNT_A, users.a);
  await list(page, 0);
  expect(await records(page)).toEqual(beforeA);
  expect((await payload(page, users.a)).groups).toEqual([legacyGroups[0]]);
});

test('dwa dokumenty chowające różne grupy zachowują obie decyzje pod rzeczywistą blokadą i odświeżają UI', async ({ page, context }) => {
  const userId = await account(page), first = await pair(page, 'Ewa'), second = await pair(page, 'Ola');
  const before = await records(page);
  const other = await context.newPage();
  try {
    await prepare(other);
    if (!await other.evaluate(() => window.VildaVault.isUnlocked())) await login(other, ACCOUNT_A, userId);
    await ready(other, userId);
    await list(page, 2);
    await list(other, 2);
    await pauseEncrypt(page);
    await page.locator('.pt-dupgrp', { hasText: 'Fikcyjna Ewa' }).locator('.pt-dup-rozne').click();
    await page.waitForFunction(() => window.__duplicateCrypto.waiting, null, { timeout: 10_000 });
    await other.locator('.pt-dupgrp', { hasText: 'Fikcyjna Ola' }).locator('.pt-dup-rozne').click();
    await expect.poll(() => page.evaluate(async () => {
      const { held, pending } = await navigator.locks.query();
      return held.some(a => pending.some(b => a.name === b.name && /[Dd]uplikat|duplicate/.test(a.name)));
    }), { message: 'drugi prawdziwy dokument czeka na tę samą blokadę Web Locks' }).toBe(true);
    await releaseEncrypt(page);
    for (const document of [page, other]) {
      await expect(document.locator('.pt-dupgrp')).toHaveCount(0);
      await expect.poll(async () => (await payload(document, userId)).groups.slice().sort())
        .toEqual([first.slice().sort().join('|'), second.slice().sort().join('|')].sort());
      await list(document, 0);
      expect(await records(document)).toEqual(before);
    }
  } finally { await other.close(); }
});

for (const transition of ['ponowne odblokowanie', 'zmiana trybu']) {
  test(`opóźniony rzeczywisty AES nie zapisuje decyzji po granicy sesji: ${transition}`, async ({ page }) => {
    const userId = await account(page);
    await pair(page);
    const before = await records(page);
    await list(page, 1);
    await pauseEncrypt(page);
    await page.locator('.pt-dup-rozne').click();
    await page.waitForFunction(() => window.__duplicateCrypto.waiting, null, { timeout: 10_000 });
    await expect(page.locator('.pt-dup-rozne')).toBeDisabled();
    if (transition === 'ponowne odblokowanie') await switchAccount(page, ACCOUNT_A, userId);
    else await page.evaluate(id => window.VildaVault.setStorageMode(id, 'cloud-only'), userId);
    await releaseEncrypt(page);
    await expect.poll(() => page.evaluate(async () => {
      const locks = await navigator.locks.query();
      return locks.held.filter(lock => /[Dd]uplikat|duplicate/.test(lock.name)).length;
    })).toBe(0);
    expect(await page.evaluate(key => localStorage.getItem(key), keyFor(userId))).toBeNull();
    expect(await page.evaluate(key => sessionStorage.getItem('veph:l:' + key), keyFor(userId))).toBeNull();
    await list(page, 1);
    expect(await records(page)).toEqual(before);
  });
}

for (const failure of ['quota', 'brak blokad']) {
  test(`natywny błąd zapisu (${failure}) pozostawia grupę widoczną; ponowienie zapisuje dopiero po usunięciu błędu`, async ({ page }) => {
    const userId = await account(page);
    await pair(page);
    const before = await records(page);
    await list(page, 1);
    await page.evaluate(({ failure, prefix }) => {
      if (failure === 'quota') {
        const native = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (String(key).includes(prefix)) throw new DOMException('Fikcyjny limit pamięci', 'QuotaExceededError');
          return native.call(this, key, value);
        };
        window.__restoreDuplicateFailure = () => { Storage.prototype.setItem = native; };
      } else {
        const native = navigator.locks;
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
        window.__restoreDuplicateFailure = () => { Object.defineProperty(navigator, 'locks', { configurable: true, value: native }); };
      }
    }, { failure, prefix: PREFIX });
    await page.locator('.pt-dup-rozne').click();
    await expect(page.locator('.pt-dupgrp')).toHaveCount(1);
    await expect(page.locator('.pt-dup-rozne')).toBeEnabled();
    await expect(page.locator('.pt-dupgrp')).toContainText(/Nie udało|Nie można|Ponów/);
    expect(await raw(page, userId)).toBeNull();
    expect(await records(page)).toEqual(before);
    await page.evaluate(() => window.__restoreDuplicateFailure());
    await page.locator('.pt-dup-rozne').click();
    await expect(page.locator('.pt-dupgrp')).toHaveCount(0);
    expect((await payload(page, userId)).groups).toHaveLength(1);
    expect(await records(page)).toEqual(before);
  });
}

test('odmowa odczytu zaszyfrowanych decyzji pokazuje grupę i jawne ponowienie bez nadpisania szyfrogramu', async ({ page }) => {
  const userId = await account(page);
  await pair(page);
  const before = await records(page);
  const envelope = await page.evaluate(async key => {
    const envelope = await window.VildaVault.encryptPayloadForCurrentUser({ schema: 2,
      purpose: 'duplicate-groups-dismissed', accountId: window.VildaVault.getCurrentUser().userId, groups: [] });
    const encoded = JSON.stringify(envelope);
    localStorage.setItem(key, encoded);
    const native = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('Fikcyjna odmowa dostępu', 'SecurityError');
      return native.call(this, name);
    };
    window.__restoreDuplicateRead = () => { Storage.prototype.getItem = native; };
    return encoded;
  }, keyFor(userId));
  await list(page, 1);
  await expect(page.locator('.pt-dup-rozne')).toBeDisabled();
  await expect(page.locator('.vilda-patients2')).toContainText(/Nie udało|Nie można|Ponów/);
  await page.evaluate(() => window.__restoreDuplicateRead());
  expect(await raw(page, userId)).toBe(envelope);
  await page.getByRole('button', { name: /Ponów/ }).click();
  await expect(page.locator('.pt-dup-rozne')).toBeEnabled();
  expect(await raw(page, userId)).toBe(envelope);
  expect(await records(page)).toEqual(before);
});

test('prawdziwy AES z obcym kontem, przeznaczeniem lub wersją nie staje się decyzją ani nie jest nadpisywany', async ({ page }) => {
  const userId = await account(page);
  const ids = await pair(page), signature = ids.slice().sort().join('|');
  const before = await records(page);
  for (const invalid of [{ accountId: 'fictional-other-account' }, { purpose: 'fictional-unrelated-purpose' }, { schema: 1 }]) {
    const encoded = await page.evaluate(async ({ key, invalid, signature }) => {
      const value = { schema: 2, purpose: 'duplicate-groups-dismissed',
        accountId: window.VildaVault.getCurrentUser().userId, groups: [signature], ...invalid };
      const encrypted = await window.VildaVault.encryptPayloadForCurrentUser(value);
      const encoded = JSON.stringify(encrypted);
      localStorage.setItem(key, encoded);
      return encoded;
    }, { key: keyFor(userId), invalid, signature });
    await list(page, 1);
    await expect(page.locator('.pt-dup-preference-error')).toBeVisible();
    await expect(page.locator('.pt-dup-rozne')).toBeDisabled();
    expect(await raw(page, userId)).toBe(encoded);
    expect(await records(page)).toEqual(before);
  }
});
