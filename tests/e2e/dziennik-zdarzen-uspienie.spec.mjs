// P-DZIENNIK-ZDARZEN (E2-PR2b) — magazyn kolejki zmian jest uśpiony: zwykła praca z sejfem w prawdziwej przeglądarce
// nie otwiera, nie tworzy i nie kasuje bazy kolejki (vilda_sync_<userId>) i nie zapisuje identyfikatora urządzenia
// (klucz localStorage z przedrostkiem vilda-sync-device-v1). Bieżący vilda_vault.js na stronie-uprzęży z serwera testów;
// skrypt startowy strony (przed skryptami sejfu) zapisuje nazwy baz z każdego indexedDB.open i indexedDB.deleteDatabase
// oraz klucze każdego Storage.prototype.setItem. Trzy tryby logowania („Komputer prywatny”, „Komputer w pracy”,
// „Zaloguj jednorazowo”) oraz strona z elementem o id VILDA_EVENT_LOG (pole okna wskazuje element, a nie wartość true —
// bramka zostaje zamknięta). Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';

const PAGE = '/__fikcyjny-dziennik-zdarzen-uspienie.html';
const HASLO = 'Fikcyjne#UspienieKolejki2026!';
// Skrypty sejfu jak na stronie aplikacji (moduły punktu odzyskiwania są potrzebne do usunięcia konta).
const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_clinical_crypto.js', 'vilda_patient_checkpoint_store.js',
  'vilda_patient_checkpoint.js', 'vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js',
  'vilda_vault.js'].map((p) => `<script src="/${p}"></script>`).join('');

async function strona(page, { element = false } = {}) {
  await page.addInitScript(() => {
    const zapis = { open: [], deleteDatabase: [], setItem: [] };
    Object.defineProperty(window, '__uspienie', { value: zapis });
    const open = IDBFactory.prototype.open;
    const usun = IDBFactory.prototype.deleteDatabase;
    const setItem = Storage.prototype.setItem;
    IDBFactory.prototype.open = function zapisOpen(nazwa, ...a) { zapis.open.push(String(nazwa)); return open.call(this, nazwa, ...a); };
    IDBFactory.prototype.deleteDatabase = function zapisDeleteDatabase(nazwa, ...a) { zapis.deleteDatabase.push(String(nazwa)); return usun.call(this, nazwa, ...a); };
    Storage.prototype.setItem = function zapisSetItem(klucz, ...a) { zapis.setItem.push(String(klucz)); return setItem.call(this, klucz, ...a); };
  });
  await page.route(`**${PAGE}`, (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjny dziennik zdarzeń</title>'
      + (element ? '<div id="VILDA_EVENT_LOG"></div>' : '')
      + '<script>localStorage.setItem("vildaRetention", "0")</script>' + SKRYPTY,
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.createUser));
}

async function slad(page) {
  return page.evaluate(async () => ({
    ...window.__uspienie,
    haki: [IDBFactory.prototype.open.name, IDBFactory.prototype.deleteDatabase.name, Storage.prototype.setItem.name],
    bazy: (await indexedDB.databases()).map((d) => d.name),
  }));
}

// rejestr: tryb, w którym konto ma wpis w rejestrze w IndexedDB (bez „Zaloguj jednorazowo”).
function bezKolejki(s, { rejestr = true } = {}) {
  expect(s.haki, 'zapis otwarć, kasowań i kluczy działa').toEqual(['zapisOpen', 'zapisDeleteDatabase', 'zapisSetItem']);
  expect(s.setItem, 'zapis kluczy (skrypt strony)').toContain('vildaRetention');
  if (rejestr) expect(s.open, 'zapis otwarć (rejestr kont)').toContain('vilda_registry');
  expect({
    open: s.open.filter((n) => n.startsWith('vilda_sync_')),
    deleteDatabase: s.deleteDatabase.filter((n) => n.startsWith('vilda_sync_')),
    bazy: s.bazy.filter((n) => n.startsWith('vilda_sync_')),
    setItem: s.setItem.filter((k) => k.startsWith('vilda-sync-device-v1')),
  }, 'baza kolejki i identyfikator urządzenia').toEqual({ open: [], deleteDatabase: [], bazy: [], setItem: [] });
}

const KARTA = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', height: 120, weight: 22, dobISO: '2016-03-12' } };

test.describe('Dziennik zdarzeń: magazyn kolejki uśpiony w prawdziwej przeglądarce', () => {
  test('„Komputer prywatny”: konto, karta, notatki, blokada, odblokowanie i usunięcie konta — bez bazy kolejki i identyfikatora urządzenia', async ({ page }) => {
    await strona(page);
    await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      const { userId } = await v.createUser(haslo, { label: 'Fikcyjna Lekarka Uśpienie', iterations: 10000 });
      const p = await v.savePatient(karta);
      await v.savePatientNote({ patientId: p.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
      await v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść.', category: 'wlasne' });
      v.lock('manual');
      await v.unlockUser(userId, haslo);
      await v.removeUser(userId, haslo);
    }, { haslo: HASLO, karta: KARTA });
    const s = await slad(page);
    expect(s.open.some((n) => n.startsWith('vilda_user_')), 'baza konta była otwierana').toBe(true);
    bezKolejki(s);
  });

  test('„Komputer w pracy”: konto cloud-only, karta, blokada i odblokowanie — bez bazy kolejki i identyfikatora urządzenia', async ({ page }) => {
    await strona(page);
    await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      const { userId } = await v.createUser(haslo, { label: 'Fikcyjny Lekarz Uśpienie', iterations: 10000, storageMode: 'cloud-only' });
      await v.savePatient(karta);
      v.lock('manual');
      await v.unlockUser(userId, haslo);
    }, { haslo: HASLO, karta: KARTA });
    bezKolejki(await slad(page));
  });

  test('„Zaloguj jednorazowo”: logowanie jednorazowe, karta i blokada — bez bazy kolejki i identyfikatora urządzenia', async ({ page }) => {
    await strona(page);
    await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      v.setEphemeralMode(true);
      await v.createUser(haslo, { label: 'Fikcyjna Lekarka Jednorazowo', iterations: 10000 });
      await v.savePatient(karta);
      v.lock('manual');
    }, { haslo: HASLO, karta: KARTA });
    bezKolejki(await slad(page), { rejestr: false });
  });

  test('element o id VILDA_EVENT_LOG na stronie: bramka zamknięta (gateOpen false), enqueue odmawia bez otwarcia bazy kolejki', async ({ page }) => {
    await strona(page, { element: true });
    const w = await page.evaluate(async ({ haslo, karta }) => {
      const v = window.VildaVault;
      await v.createUser(haslo, { label: 'Fikcyjna Lekarka Bramka', iterations: 10000 });
      const p = await v.savePatient(karta);
      return {
        pole: window.VILDA_EVENT_LOG instanceof HTMLElement,
        bramka: v._eventLog.gateOpen(),
        enqueue: await v._eventLog.enqueue('snap', { patientId: p.patientId, snapshotId: p.snapshotId }),
      };
    }, { haslo: HASLO, karta: KARTA });
    expect(w).toEqual({ pole: true, bramka: false, enqueue: { ok: false, powod: 'bramka' } });
    bezKolejki(await slad(page));
  });
});
