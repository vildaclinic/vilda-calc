import { expect, test } from '@playwright/test';

// P-CIEN-POZA-LISTA (PR-S4, wariant V przeglądu 2; decyzja właściciela 2026-10-26, 6): prawdziwy adapter IndexedDB sejfu
// w Chromium. Rekordy cienia leżą w istniejącym sklepie `meta` bazy `vilda_user_<id>` pod id "cien:<iv>", wersja bazy 5
// i zestaw sklepów bez zmian, lista nagrobków (rekord "singleton") trzyma same zaślepki { iv, cien: 1 }. Zapis i usuwanie
// rekordów — jedna transakcja na partię; po wygaśnięciu (31 dni) rekordy znikają; sieroty zamiata getAllKeys (bez
// czytania rekordów). Testy w Node (tests/unit/polkrata-cien*.test.mjs) sprawdzają regułę na adapterze w pamięci; tu —
// sam adapter przeglądarki.
//
// Urządzenie P = sejf strony (IndexedDB), K i C = sejfy w pamięci w tej samej stronie (kopie skryptów w osobnych
// „oknach”). Zegar strony stały i przesuwany z testu (page.clock.setFixedTime). Dane wyłącznie fikcyjne („Testowy Jan”).
test.use({ serviceWorkers: 'block' });

const STRONA = '/__polkrata-cien-e2e.html';
const SKLEPY = ['meta', 'noteTombstones', 'notes', 'patientListTombstones', 'patientLists', 'patientNoteTombstones',
  'patientNotes', 'patients', 'snapshots', 'tombstones'];
const M = 60e3;

async function otworz(page, zegar) {
  await page.clock.setFixedTime(new Date(zegar.t));
  await page.route(`**${STRONA}`, (r) => r.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>cien e2e</title>'
      + '<script>try{localStorage.setItem("vildaRetention","0")}catch(e){}</script>'
      + '<script src="/vilda_crypto.js"></script><script src="/vilda_retention.js"></script><script src="/vilda_vault.js"></script>',
  }));
  await page.goto(STRONA);
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.createUser));
  await page.evaluate(async () => {
    const src = {};
    for (const f of ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js']) src[f] = await (await fetch(`/${f}`)).text();
    const magazyn = () => {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
        key: (i) => Array.from(m.keys())[i] || null, get length() { return m.size; } };
    };
    // Sejf w pamięci (bez indexedDB w „oknie” — adapter w pamięci), osobny od sejfu strony.
    window.__okno = function () {
      const w = {
        crypto: window.crypto, TextEncoder, TextDecoder, btoa: window.btoa.bind(window), atob: window.atob.bind(window),
        localStorage: magazyn(), sessionStorage: magazyn(), setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window), addEventListener() {}, removeEventListener() {}, AbortController,
        document: { addEventListener() {}, removeEventListener() {}, hidden: false },
        console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
      };
      w.window = w; w.self = w; w.top = w;
      w.localStorage.setItem('vildaRetention', '0');
      for (const f of ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js']) new Function('window', 'globalThis', src[f])(w, w);
      return w.VildaVault;
    };
    // Liczniki operacji IndexedDB na rekordach cienia (id "cien:…") w sklepie meta.
    const s = { put: 0, del: 0, txPut: new Set(), txDel: new Set(), getAllKeys: 0, getAll: 0 };
    window.__idb = s;
    const P = IDBObjectStore.prototype;
    const put = P.put, del = P.delete, gak = P.getAllKeys, ga = P.getAll;
    P.put = function (v, k) { if (v && typeof v.id === 'string' && v.id.startsWith('cien:')) { s.put += 1; s.txPut.add(this.transaction); } return put.apply(this, arguments); };
    P.delete = function (k) { if (typeof k === 'string' && k.startsWith('cien:')) { s.del += 1; s.txDel.add(this.transaction); } return del.apply(this, arguments); };
    P.getAllKeys = function (q) { if (q && q.lower === 'cien:') s.getAllKeys += 1; return gak.apply(this, arguments); };
    P.getAll = function (q) { if (q && q.lower === 'cien:') s.getAll += 1; return ga.apply(this, arguments); };
    window.__zeruj = () => { Object.assign(s, { put: 0, del: 0, getAllKeys: 0, getAll: 0 }); s.txPut.clear(); s.txDel.clear(); };
    window.__liczniki = () => ({ put: s.put, del: s.del, txPut: s.txPut.size, txDel: s.txDel.size, getAllKeys: s.getAllKeys, getAll: s.getAll });
    // Stan bazy vilda_user_<id> wprost z IndexedDB (osobne połączenie, bez wersji — bieżąca).
    window.__baza = async (uid) => {
      const db = await new Promise((ok, zle) => { const q = indexedDB.open(`vilda_user_${uid}`); q.onsuccess = () => ok(q.result); q.onerror = () => zle(q.error); });
      const tx = db.transaction('meta', 'readonly');
      const st = tx.objectStore('meta');
      const zadanie = (q) => new Promise((ok, zle) => { q.onsuccess = () => ok(q.result); q.onerror = () => zle(q.error); });
      const klucze = await zadanie(st.getAllKeys());
      const meta = await zadanie(st.get('singleton'));
      const cienie = await zadanie(st.getAll(IDBKeyRange.bound('cien:', 'cien:￿')));
      const wynik = { wersja: db.version, sklepy: Array.from(db.objectStoreNames).sort(), klucze: klucze.map(String), meta, cienie };
      db.close();
      return wynik;
    };
    window.__dopiszSierote = async (uid) => {
      const db = await new Promise((ok, zle) => { const q = indexedDB.open(`vilda_user_${uid}`); q.onsuccess = () => ok(q.result); q.onerror = () => zle(q.error); });
      await new Promise((ok, zle) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ id: 'cien:SIEROTA-E2E', key: 'SIEROTA-E2E', c: { iv: 'SIEROTA-E2E', data: 'AAAA' }, patientId: 'p', snapshotId: 's', od: '' });
        tx.oncomplete = ok; tx.onerror = () => zle(tx.error);
      });
      db.close();
    };
  });
}

async function krok(page, zegar, fn, arg) {
  zegar.t += M;
  await page.clock.setFixedTime(new Date(zegar.t));
  return page.evaluate(fn, arg);
}

test.describe('P-CIEN-POZA-LISTA: adapter IndexedDB w Chromium', () => {
  test('rekordy "cien:" w sklepie meta, wersja bazy 5; scalenie bez zmian bez zapisów; kosz z cienia; wygaśnięcie usuwa rekordy jedną transakcją', async ({ page }) => {
    test.setTimeout(120_000);
    const zegar = { t: Date.parse('2026-10-20T09:00:00Z') };
    await otworz(page, zegar);
    const uid = await page.evaluate(async () => {
      window.__K = window.__okno(); window.__C = window.__okno();
      await window.__K.createUser('Cien#E2e!2026Kaa', { label: 'K', iterations: 10000 });
      await window.__C.createUser('Cien#E2e!2026Caa', { label: 'C', iterations: 10000 });
      const u = await window.VildaVault.createUser('Cien#E2e!2026Paa', { label: 'P', iterations: 10000 });
      window.__s = { pid: null, ids: [] };
      return u.userId;
    });
    for (let i = 0; i < 12; i += 1) {
      await krok(page, zegar, async (i) => {
        const jan = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 100 + i, weight: 20 + i } };
        const r = await window.__K.savePatient(jan, { dedup: false, ...(window.__s.pid ? { patientId: window.__s.pid } : {}) });
        window.__s.pid = r.patientId; window.__s.ids.push(r.snapshotId);
      }, i);
    }
    const sync = async (z, na) => krok(page, zegar, async ([z, na]) => {
      const u = { K: window.__K, C: window.__C, P: window.VildaVault };
      await u[na].mergeSyncPayload(JSON.parse(JSON.stringify(await u[z].exportSyncPayload())));
    }, [z, na]);
    await sync('K', 'P'); await sync('K', 'C');
    // P poprawia czwartą wizytę na 58 i wysyła do C; C przycina (zna 58); P scala C — u P cień 58 (11 wersji).
    await krok(page, zegar, async () => {
      const P = window.VildaVault, sid = window.__s.ids[3];
      const k = await P.getPatient(window.__s.pid);
      const s = k.snapshots.find((x) => x.snapshotId === sid);
      await P.updateSnapshotPayload(window.__s.pid, sid, { ...s.payload, user: { ...s.payload.user, weight: 58 } }, { preserveSavedAt: true });
    });
    await sync('P', 'C');
    const przyciete = await krok(page, zegar, async () => (await window.__C.pruneSnapshotsForPatient(window.__s.pid, { recentHours: 0 })).prunedIds.length);
    expect(przyciete).toBe(11);
    await page.evaluate(() => window.__zeruj());
    await sync('C', 'P');

    const b1 = await page.evaluate((u) => window.__baza(u), uid);
    expect(b1.wersja, 'wersja bazy bez zmian').toBe(5);
    expect(b1.sklepy, 'zestaw sklepów bez zmian').toEqual(SKLEPY);
    const cienKlucze = b1.klucze.filter((k) => k.startsWith('cien:'));
    expect(cienKlucze.length, '11 rekordów cienia w sklepie meta').toBe(11);
    expect(b1.klucze.filter((k) => !k.startsWith('cien:')), 'poza cieniem tylko rekord metadanych').toEqual(['singleton']);
    expect(await page.evaluate(() => window.__liczniki()), 'rekordy zapisane jedną transakcją').toMatchObject({ put: 11, txPut: 1, del: 0 });
    for (const r of b1.cienie) {
      expect(Object.keys(r).sort()).toEqual(['c', 'id', 'key', 'od', 'patientId', 'snapshotId']);
      expect(r.id).toBe(`cien:${r.key}`);
      expect(Object.keys(r.c).sort(), 'szyfr kluczem sejfu').toEqual(['data', 'iv']);
      expect(r.c.iv).toBe(r.key);
    }
    expect(JSON.stringify(b1.cienie), 'bez jawnej treści').not.toMatch(/"weight"|Testowy/);
    const lista = b1.meta.snapshotTombstones;
    const zaslepki = lista.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c);
    expect(zaslepki.length).toBe(11);
    for (const e of zaslepki) {
      expect(e.Bpk.t.c, 'w liście zaślepka').toEqual({ iv: e.Bpk.t.c.iv, cien: 1 });
      expect(cienKlucze, 'zaślepka wskazuje istniejący rekord').toContain(`cien:${e.Bpk.t.c.iv}`);
    }

    // Ponowne scalenie tego samego ładunku: żadnej operacji na rekordach cienia.
    await page.evaluate(() => window.__zeruj());
    await sync('C', 'P');
    expect(await page.evaluate(() => window.__liczniki())).toEqual({ put: 0, del: 0, txPut: 0, txDel: 0, getAllKeys: 0, getAll: 0 });

    // K (stara kopia 23) daje do kosza: w koszu P treść z cienia (58), rekord tej wersji usunięty.
    await krok(page, zegar, async () => {
      const sid = window.__s.ids[3];
      await window.__K.moveSnapshotToTrash(window.__s.pid, sid, { odepnij: true });
    });
    await page.evaluate(() => window.__zeruj());
    await sync('K', 'P');
    const kosz = await page.evaluate(async () => (await window.VildaVault.listTrashedSnapshots()).map((k) => ({ sid: k.snapshotId, masa: k.payload && k.payload.user.weight })));
    expect(kosz).toEqual([{ sid: await page.evaluate(() => window.__s.ids[3]), masa: 58 }]);
    const b2 = await page.evaluate((u) => window.__baza(u), uid);
    expect(b2.klucze.filter((k) => k.startsWith('cien:')).length, 'cień został treścią kosza — rekord usunięty').toBe(10);
    expect(await page.evaluate(() => window.__liczniki())).toMatchObject({ put: 0, del: 1, txDel: 1 });

    // Po 31 dniach bez przycięć cień wygasa: wszystkie rekordy znikają w jednej transakcji.
    zegar.t += 31 * 864e5;
    await page.evaluate(() => window.__zeruj());
    await sync('C', 'P');
    const b3 = await page.evaluate((u) => window.__baza(u), uid);
    expect(b3.klucze, 'po wygaśnięciu tylko metadane').toEqual(['singleton']);
    expect(b3.meta.snapshotTombstones.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1).length).toBe(0);
    expect(await page.evaluate(() => window.__liczniki())).toMatchObject({ put: 0, del: 10, txDel: 1 });
    expect(b3.wersja).toBe(5);
  });

  test('zamiatanie sierot przy pierwszym zapisie listy w sesji: getAllKeys po zakresie "cien:", bez czytania rekordów', async ({ page }) => {
    const zegar = { t: Date.parse('2026-10-20T09:00:00Z') };
    await otworz(page, zegar);
    const uid = await page.evaluate(async () => (await window.VildaVault.createUser('Cien#E2e!2026Saa', { label: 'S', iterations: 10000 })).userId);
    const pid = await krok(page, zegar, async () => {
      const jan = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 120, weight: 25 } };
      const a = await window.VildaVault.savePatient(jan, { dedup: false });
      window.__b = (await window.VildaVault.savePatient({ ...jan, user: { ...jan.user, weight: 26 } }, { dedup: false, patientId: a.patientId })).snapshotId;
      return a.patientId;
    });
    await page.evaluate((u) => window.__dopiszSierote(u), uid);
    expect((await page.evaluate((u) => window.__baza(u), uid)).klucze).toContain('cien:SIEROTA-E2E');
    await page.evaluate(() => window.__zeruj());
    await krok(page, zegar, async (pid) => { await window.VildaVault.moveSnapshotToTrash(pid, window.__b, { odepnij: true }); }, pid);
    expect(await page.evaluate(() => window.__liczniki()), 'same klucze, jedna transakcja usunięcia').toEqual({ put: 0, del: 1, txPut: 0, txDel: 1, getAllKeys: 1, getAll: 0 });
    const b = await page.evaluate((u) => window.__baza(u), uid);
    expect(b.klucze, 'sierota usunięta').toEqual(['singleton']);
    expect(b.wersja).toBe(5);
    expect(b.meta.snapshotTombstones.length, 'kosz zapisany').toBe(1);
  });
});
