// Scenariusze zgodności atrapy IndexedDB (tests/support/atrapa-indexeddb.mjs) z prawdziwą przeglądarką: p1–p34.
//
// scenariuszeIDB(indexedDB, IDBKeyRange) wykonuje na DOWOLNYM obiekcie o kształcie window.indexedDB ten sam kod:
// w vitest na atrapie (tests/unit/atrapa-indexeddb.test.mjs, A1), w Chromium przez page.evaluate(fn.toString()).
// Dlatego funkcja jest samowystarczalna: bez importów i bez odwołań do zasięgu modułu (wszystkie pomocnicze są w
// środku). Wynik to obiekt { p1, …, p34 } (bez p6 — „po await Promise.resolve()” jest częścią p5) z samymi napisami,
// liczbami i tablicami, bez treści rekordów spoza scenariusza.
//
// Kolejność zdarzeń w scenariuszach nie zależy od zegara: tam, gdzie przeglądarka musi czekać na reakcję strony
// (zamknięcie połączenia przy `blocked`, koniec transakcji), scenariusz reaguje w obsłudze zdarzenia albo czeka na
// obietnicę rozstrzyganą przez zdarzenie, a nie na odczekanie stałego czasu. Jedyne zegary to p5 (oczekiwanie na
// zegar dezaktywuje transakcję — mierzona rzecz) i bezpiecznik 3 s na każdy przypadek („LIMIT CZASU” zamiast
// zawieszenia całego przebiegu).
//
// Poza literałem (atrapa celowo surowsza niż Chromium): `await crypto.subtle…` w obsłudze zdarzenia żądania. Chromium
// zostawia wtedy transakcję aktywną, atrapa ją dezaktywuje (samotest A7).
//
// Każdy p ma własną bazę `pNN` (z przyrostkiem przy kilku bazach), więc przypadki nie dzielą stanu.

export async function scenariuszeIDB(indexedDB, IDBKeyRange) {
  'use strict'; // także po fn.toString() w przeglądarce (skrypt strony nie jest modułem)
  const W = {};
  const czekajMs = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
  const nazwy = async (...lista) => (await indexedDB.databases())
    .filter((d) => lista.includes(d.name)).map((d) => d.name + '@' + d.version).sort();
  const otworz = (n, v, upg) => new Promise((ok, zle) => {
    const r = v === undefined ? indexedDB.open(n) : indexedDB.open(n, v);
    r.onupgradeneeded = (e) => { if (upg) upg(r.result, e, r); };
    r.onsuccess = () => { ok(r.result); };
    r.onerror = (e) => { e.preventDefault(); zle(r.error); };
  });
  const req = (r) => new Promise((ok, zle) => {
    r.onsuccess = () => { ok(r.result); };
    r.onerror = (e) => { e.preventDefault(); zle(r.error); };
  });
  const koniecTx = (tx) => new Promise((ok) => {
    tx.oncomplete = () => { ok('complete'); };
    tx.onabort = () => { ok('abort ' + (tx.error ? tx.error.name : 'null')); };
  });
  const schemat = (d) => {
    const o = d.createObjectStore('outbox', { keyPath: 'eid' });
    o.createIndex('byState', 'state', { unique: false });
    o.createIndex('byEntity', ['kind', 'entityKey'], { unique: false });
    o.createIndex('bySeqLocal', 'seqLocal', { unique: true });
    return o;
  };
  const wiersz = (eid, seqLocal, state = 'pending', kind = 'snap', entityKey = 'p/s') => ({ eid, state, kind, entityKey, seqLocal });
  const nazwaBledu = (f) => { try { f(); return 'brak bledu'; } catch (x) { return x && x.name; } };
  const fmt = (k) => {
    if (typeof k === 'number') return String(k);
    if (typeof k === 'string') return JSON.stringify(k);
    if (k instanceof Date) return 'D' + k.getTime();
    if (Array.isArray(k)) return '[' + k.map(fmt).join(',') + ']';
    return '?' + typeof k;
  };
  const krok = async (nazwa, fn) => {
    let uchwyt = null;
    const limit = new Promise((ok) => { uchwyt = setTimeout(() => { ok('LIMIT CZASU'); }, 3000); });
    try { W[nazwa] = await Promise.race([fn(), limit]); }
    catch (x) { W[nazwa] = 'WYJATEK ' + (x && x.name) + ': ' + (x && x.message); }
    finally { clearTimeout(uchwyt); }
  };

  // p1: open(n, 1) nieistniejącej bazy, abort() w onupgradeneeded → AbortError, baza nie powstaje.
  await krok('p1', async () => {
    const ev = [];
    await new Promise((ok) => {
      const r = indexedDB.open('p01', 1);
      r.onupgradeneeded = (e) => { ev.push('upgrade old=' + e.oldVersion + ' new=' + e.newVersion); r.transaction.abort(); };
      r.onsuccess = () => { ev.push('success'); r.result.close(); ok(); };
      r.onerror = (e) => { ev.push('error ' + (r.error && r.error.name)); e.preventDefault(); ok(); };
      r.onblocked = () => { ev.push('blocked'); };
    });
    ev.push('bazy=' + JSON.stringify(await nazwy('p01')));
    return ev;
  });

  // p2: utworzenie schematu jak magazyn (indeksy, keyPath tablicowy w sklepie i w indeksie).
  await krok('p2', async () => {
    const d = await otworz('p02', 1, (db) => {
      schemat(db);
      db.createObjectStore('quarantine', { keyPath: ['slotId', 'seq'] }).createIndex('bySlot', 'slotId', { unique: false });
      db.createObjectStore('meta', { keyPath: 'k' });
    });
    const tx = d.transaction(['quarantine', 'outbox'], 'readonly');
    const opis = (s) => ({
      keyPath: JSON.stringify(s.keyPath), autoIncrement: s.autoIncrement,
      indeksy: Array.from(s.indexNames).map((n) => { const i = s.index(n); return n + ' ' + JSON.stringify(i.keyPath) + ' unique=' + i.unique + ' multiEntry=' + i.multiEntry; }),
    });
    const w = {
      nazwa: d.name, wersja: d.version, sklepy: Array.from(d.objectStoreNames), tryb: tx.mode,
      zakres: Array.from(tx.objectStoreNames), outbox: opis(tx.objectStore('outbox')), quarantine: opis(tx.objectStore('quarantine')),
      contains: [d.objectStoreNames.contains('meta'), d.objectStoreNames.contains('x')], dlugosc: d.objectStoreNames.length,
      item: [d.objectStoreNames.item(0), d.objectStoreNames.item(9)],
    };
    w.koniec = await koniecTx(tx);
    d.close();
    w.bazy = await nazwy('p02');
    return w;
  });

  // p3: add → delete → add z tą samą wartością indeksu unikalnego w jednej transakcji.
  await krok('p3', async () => {
    const d = await otworz('p03', 1, schemat);
    const ev = [];
    const tx = d.transaction('outbox', 'readwrite');
    const s = tx.objectStore('outbox');
    s.add(wiersz('a', 1));
    s.delete('a');
    const r = s.add(wiersz('b', 1));
    r.onsuccess = () => { ev.push('add b ok wynik=' + r.result); };
    ev.push(await koniecTx(tx));
    ev.push('klucze=' + JSON.stringify(await req(d.transaction('outbox').objectStore('outbox').getAllKeys())));
    d.close();
    return ev;
  });

  // p4: add z istniejącą wartością indeksu unikalnego; tx.error w trzech miejscach.
  await krok('p4', async () => {
    const d = await otworz('p04', 1, schemat);
    await koniecTx((() => { const t = d.transaction('outbox', 'readwrite'); t.objectStore('outbox').add(wiersz('b', 1)); return t; })());
    const ev = [];
    const tx = d.transaction('outbox', 'readwrite');
    const r = tx.objectStore('outbox').add(wiersz('c', 1, 'pending', 'snap', 'p/t'));
    r.onerror = () => { ev.push('req error ' + r.error.name + ' tx.error=' + (tx.error ? tx.error.name : 'null')); };
    tx.onerror = (e) => { ev.push('tx error ' + (e.target.error && e.target.error.name) + ' cel=' + (e.target === r ? 'zadanie' : 'inny') + ' tx.error=' + (tx.error ? tx.error.name : 'null')); };
    ev.push(await new Promise((ok) => { tx.oncomplete = () => { ok('complete'); }; tx.onabort = () => { ok('abort ' + (tx.error ? tx.error.name : 'null')); }; }));
    d.close();
    return ev;
  });

  // p5 (z p6): żądanie po await Promise.resolve() w onsuccess / po łańcuchu 50 mikrozadań / po await zegara.
  await krok('p5', async () => {
    const d = await otworz('p05', 1, schemat);
    const w = { poMikrozadaniu: null, po50Mikrozadaniach: null, poZegarze: null, koniec: null }; // kolejność kluczy stała
    await new Promise((ok) => {
      const tx = d.transaction('outbox', 'readwrite');
      const s = tx.objectStore('outbox');
      let czeka = 2;
      const gotowe = () => { czeka -= 1; if (!czeka) ok(); };
      const r = s.get('b');
      r.onsuccess = async () => {
        await Promise.resolve();
        try { s.get('b'); w.poMikrozadaniu = 'aktywna'; } catch (x) { w.poMikrozadaniu = x.name; }
        for (let i = 0; i < 50; i += 1) await null;
        try { s.get('b'); w.po50Mikrozadaniach = 'aktywna'; } catch (x) { w.po50Mikrozadaniach = x.name; }
        await czekajMs(0);
        try { s.get('b'); w.poZegarze = 'aktywna'; } catch (x) { w.poZegarze = x.name; }
        gotowe();
      };
      tx.oncomplete = () => { w.koniec = 'complete'; gotowe(); };
      tx.onabort = () => { w.koniec = 'abort'; gotowe(); };
    });
    d.close();
    return w;
  });

  // p7: indeksy, liczenie, kolejność kluczy tablicowych, zakres slotu, kursory, getAll z limitem, getKey.
  await krok('p7', async () => {
    const d = await otworz('p07', 1, (db) => { schemat(db); db.createObjectStore('quarantine', { keyPath: ['slotId', 'seq'] }); });
    const tx = d.transaction(['outbox', 'quarantine'], 'readwrite');
    const o = tx.objectStore('outbox');
    const q = tx.objectStore('quarantine');
    o.add(wiersz('b', 1));
    o.add(wiersz('d', 2, 'inflight'));
    o.add(wiersz('e', 3, 'pending', 'pnote'));
    for (const [sl, sq] of [['b', 2], ['a', 10], ['a', 2], ['b', 1], ['a', 1]]) q.put({ slotId: sl, seq: sq });
    const w = {};
    w.byEntity = (await req(o.index('byEntity').getAll(['snap', 'p/s']))).map((x) => x.eid);
    w.countPending = await req(o.index('byState').count('pending'));
    w.kw = (await req(q.getAll())).map((x) => x.slotId + x.seq);
    w.slotA = (await req(q.getAll(IDBKeyRange.bound(['a', -Infinity], ['a', Infinity])))).map((x) => x.seq);
    const pierwszy = await req(q.openCursor(IDBKeyRange.bound(['a', -Infinity], ['a', Infinity])));
    w.minA = pierwszy && pierwszy.value.seq;
    w.kluczKursora = pierwszy && JSON.stringify(pierwszy.key);
    const max = await req(o.index('bySeqLocal').openCursor(null, 'prev'));
    w.maxSeqLocal = max && max.value.seqLocal;
    w.maxPrimaryKey = max && max.primaryKey;
    w.getAllLimit = (await req(o.getAll(null, 2))).map((x) => x.eid);
    w.kluczePending = await req(o.index('byState').getAllKeys('pending'));
    w.countAll = await req(o.count());
    w.indexGet = (await req(o.index('bySeqLocal').get(2))).eid;
    w.indexGetKey = await req(o.index('bySeqLocal').getKey(3));
    w.zakresOtwarty = (await req(o.index('bySeqLocal').getAll(IDBKeyRange.lowerBound(2, true)))).map((x) => x.eid);
    w.upperBound = await req(o.getAllKeys(IDBKeyRange.upperBound('d')));
    w.only = await req(o.count(IDBKeyRange.only('e')));
    w.brak = String(await req(o.get('zz')));
    w.koniec = await koniecTx(tx);
    d.close();
    return w;
  });

  // p8: porządek kluczy różnych typów i indexedDB.cmp.
  await krok('p8', async () => {
    const d = await otworz('p08', 1, (db) => { db.createObjectStore('k'); });
    const tx = d.transaction('k', 'readwrite');
    const s = tx.objectStore('k');
    for (const k of ['b', 2, [1], new Date(5), 'a', -1, [0, 'x'], [], -Infinity, '', [0], new Date(-3)]) s.put(1, k);
    const klucze = (await req(s.getAllKeys())).map(fmt);
    await koniecTx(tx);
    d.close();
    const cmp = [[1, 2], ['a', 'a'], [[1], 'z'], [new Date(5), 5], ['a', new Date(0)], [[0, 'x'], [0]], ['B', 'a'], [-0, 0]]
      .map(([a, b]) => indexedDB.cmp(a, b));
    const cmpBledy = [[null, 1], [NaN, 1], [{}, 1], [[1, {}], 1], [new Date(NaN), 1]].map(([a, b]) => nazwaBledu(() => indexedDB.cmp(a, b)));
    return { klucze, cmp, cmpBledy };
  });

  // p9: pole undefined w rekordzie zostaje; funkcja w rekordzie → DataCloneError synchronicznie.
  await krok('p9', async () => {
    const d = await otworz('p09', 1, schemat);
    const tx = d.transaction('outbox', 'readwrite');
    const s = tx.objectStore('outbox');
    s.put({ eid: 'u', state: 'x', kind: 'k', entityKey: 'e', seqLocal: 9, z: undefined });
    const dce = nazwaBledu(() => s.put({ eid: 'f', seqLocal: 10, f() {} }));
    const r = await req(s.get('u'));
    await koniecTx(tx);
    d.close();
    return { maUndefined: Object.prototype.hasOwnProperty.call(r, 'z'), klucze: Object.keys(r), dce };
  });

  // p10: deleteDatabase przy otwartym połączeniu bez zamknięcia w versionchange: blocked, zamknięcie w onblocked.
  await krok('p10', async () => {
    const d = await otworz('p10', 1, (db) => { db.createObjectStore('s'); });
    const ev = [];
    d.onversionchange = (e) => { ev.push('versionchange old=' + e.oldVersion + ' new=' + e.newVersion); };
    await new Promise((ok) => {
      const r = indexedDB.deleteDatabase('p10');
      r.onblocked = (e) => { ev.push('blocked old=' + e.oldVersion + ' new=' + e.newVersion); d.close(); ev.push('close'); };
      r.onsuccess = (e) => { ev.push('success old=' + e.oldVersion + ' new=' + e.newVersion + ' wynik=' + r.result); ok(); };
      r.onerror = () => { ev.push('error'); ok(); };
    });
    ev.push('bazy=' + JSON.stringify(await nazwy('p10')));
    return ev;
  });

  // p11: transaction() na zamkniętym połączeniu.
  await krok('p11', async () => {
    const d = await otworz('p11', 1, (db) => { db.createObjectStore('s'); });
    d.close();
    const drugieClose = nazwaBledu(() => d.close());
    return { transaction: nazwaBledu(() => d.transaction('s', 'readonly')), drugieClose };
  });

  // p12: open(v2) przy otwartym v1 bez obsługi versionchange (zamknięcie w onblocked); potem open(v1) → VersionError.
  await krok('p12', async () => {
    const ev = [];
    const d1 = await otworz('p12', 1);
    await new Promise((ok) => {
      const r = indexedDB.open('p12', 2);
      r.onblocked = (e) => { ev.push('blocked old=' + e.oldVersion + ' new=' + e.newVersion); d1.close(); ev.push('close v1'); };
      r.onupgradeneeded = (e) => { ev.push('upgrade ' + e.oldVersion + '->' + e.newVersion + ' tx=' + r.transaction.mode); };
      r.onsuccess = () => { ev.push('success v' + r.result.version + ' tx=' + r.transaction); r.result.close(); ok(); };
      r.onerror = (e) => { e.preventDefault(); ev.push('error ' + r.error.name); ok(); };
    });
    await new Promise((ok) => {
      const r = indexedDB.open('p12', 1);
      r.onsuccess = () => { ev.push('v1 success?'); r.result.close(); ok(); };
      r.onerror = (e) => { ev.push('v1 error ' + r.error.name + ' wynik=' + r.result); e.preventDefault(); ok(); };
    });
    return ev;
  });

  // p13: dwie readwrite i jedna readonly na tym samym sklepie, jedno połączenie.
  await krok('p13', async () => {
    const d = await otworz('p13', 1, (db) => { db.createObjectStore('s'); });
    const ev = [];
    const t1 = d.transaction('s', 'readwrite');
    const t2 = d.transaction('s', 'readwrite');
    const t3 = d.transaction('s', 'readonly');
    const a = t1.objectStore('s').put(1, 'x');
    a.onsuccess = () => { ev.push('t1 put'); };
    t1.oncomplete = () => { ev.push('t1 complete'); };
    const b = t2.objectStore('s').get('x');
    b.onsuccess = () => { ev.push('t2 get=' + b.result); };
    t2.oncomplete = () => { ev.push('t2 complete'); };
    const c = t3.objectStore('s').get('x');
    c.onsuccess = () => { ev.push('t3 get=' + c.result); };
    await new Promise((ok) => { t3.oncomplete = () => { ev.push('t3 complete'); ok(); }; });
    d.close();
    return ev;
  });

  // p14: close() przy transakcji w toku; close() w versionchange przy transakcji w toku; close() przed kasowaniem.
  await krok('p14', async () => {
    const w = {};
    {
      const d = await otworz('p14', 1, (db) => { db.createObjectStore('s'); });
      const ev = [];
      const t = d.transaction('s', 'readwrite');
      t.objectStore('s').put(1, 'x');
      d.close();
      ev.push('close wywolane');
      ev.push(await koniecTx(t));
      const d2 = await otworz('p14');
      ev.push('x=' + (await req(d2.transaction('s').objectStore('s').get('x'))));
      d2.close();
      w.zamkniecieWToku = ev;
    }
    {
      // versionchange (kasowanie) dochodzi w trakcie transakcji, która żyje do jego nadejścia i jeszcze 20 żądań po nim;
      // obsługa zamyka połączenie.
      const d = await otworz('p14b', 1, (db) => { db.createObjectStore('s'); });
      const ev = [];
      let vc = false;
      let ile = 0;
      let poVc = 0;
      let udane = 0;
      let koniecDel = null;
      const kasowanie = new Promise((ok) => { koniecDel = ok; });
      d.onversionchange = (e) => { ev.push('versionchange new=' + e.newVersion); vc = true; d.close(); ev.push('close'); };
      const tx = d.transaction('s', 'readwrite');
      const s = tx.objectStore('s');
      const wynikTx = koniecTx(tx).then((x) => { ev.push('tx ' + x); });
      const dalej = () => {
        if (ile >= 5000) { ev.push('limit'); return; }
        const r = s.put(ile, 'k' + ile);
        ile += 1;
        r.onsuccess = () => {
          udane += 1;
          if (ile === 1) {
            const del = indexedDB.deleteDatabase('p14b');
            del.onblocked = () => { ev.push('delete blocked'); };
            del.onsuccess = () => { ev.push('delete success'); koniecDel(); };
            del.onerror = () => { ev.push('delete error'); koniecDel(); };
          }
          if (vc) poVc += 1;
          if (poVc < 20) dalej();
        };
      };
      dalej();
      await wynikTx;
      await kasowanie;
      ev.push('udane=' + (udane === ile) + ' po versionchange=' + poVc);
      ev.push('bazy=' + JSON.stringify(await nazwy('p14b')));
      w.zamkniecieWVersionchange = ev;
    }
    {
      // połączenie zamknięte (close()) przy transakcji w toku, potem kasowanie bazy.
      const d = await otworz('p14c', 1, (db) => { db.createObjectStore('s'); });
      const ev = [];
      let zablokowane = false;
      let ile = 0;
      let koniecDel = null;
      const kasowanie = new Promise((ok) => { koniecDel = ok; });
      d.onversionchange = () => { ev.push('versionchange'); };
      const tx = d.transaction('s', 'readwrite');
      const s = tx.objectStore('s');
      const wynikTx = koniecTx(tx).then((x) => { ev.push('tx ' + x); });
      d.close();
      ev.push('close');
      const dalej = () => {
        if (ile >= 5000) { ev.push('limit'); return; }
        const r = s.put(ile, 'k' + ile);
        ile += 1;
        r.onsuccess = () => {
          if (ile === 1) {
            const del = indexedDB.deleteDatabase('p14c');
            del.onblocked = (e) => { ev.push('delete blocked old=' + e.oldVersion + ' new=' + e.newVersion); zablokowane = true; };
            del.onsuccess = () => { ev.push('delete success'); koniecDel(); };
            del.onerror = () => { ev.push('delete error'); koniecDel(); };
          }
          if (!zablokowane) dalej();
        };
      };
      dalej();
      await wynikTx;
      await kasowanie;
      w.zamknieciePrzedKasowaniem = ev;
    }
    return w;
  });

  // p15: deleteDatabase nieistniejącej bazy.
  await krok('p15', async () => new Promise((ok) => {
    const r = indexedDB.deleteDatabase('p15');
    r.onsuccess = (e) => { ok('success old=' + e.oldVersion + ' new=' + e.newVersion); };
    r.onerror = () => { ok('error'); };
  }));

  // p16: kształt fabryki.
  await krok('p16', async () => ({
    databases: typeof indexedDB.databases, open: typeof indexedDB.open, deleteDatabase: typeof indexedDB.deleteDatabase,
    cmp: typeof indexedDB.cmp, keyRange: typeof IDBKeyRange.bound,
  }));

  // p17: open(n) BEZ wersji, brak bazy, abort w upgrade.
  await krok('p17', async () => {
    const ev = [];
    await new Promise((ok) => {
      const r = indexedDB.open('p17');
      r.onupgradeneeded = (e) => { ev.push('upgrade old=' + e.oldVersion + ' new=' + e.newVersion + ' result.version=' + r.result.version); r.transaction.abort(); };
      r.onsuccess = () => { ev.push('success'); r.result.close(); ok(); };
      r.onerror = (e) => { ev.push('error ' + r.error.name); e.preventDefault(); ok(); };
      r.onblocked = () => { ev.push('blocked'); };
    });
    ev.push('bazy=' + JSON.stringify(await nazwy('p17')));
    return ev;
  });

  // p18: open(n) bez wersji na istniejącej v1 i v2 — bez upgrade.
  await krok('p18', async () => {
    const d = await otworz('p18a', 1, schemat);
    d.close();
    const ev = [];
    const d2 = await otworz('p18a', undefined, () => { ev.push('upgrade?'); });
    ev.push('v=' + d2.version + ' sklepy=' + Array.from(d2.objectStoreNames).join(','));
    d2.close();
    const d3 = await otworz('p18b', 2, (db) => { db.createObjectStore('x'); });
    d3.close();
    const d4 = await otworz('p18b', undefined, () => { ev.push('upgrade?'); });
    ev.push('v=' + d4.version);
    d4.close();
    return ev;
  });

  // p19: delete(s), add(n), add z kolizją indeksu unikalnego bez preventDefault → przerwanie i cofnięcie danych.
  await krok('p19', async () => {
    const d = await otworz('p19', 1, schemat);
    let tx = d.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').add(wiersz('s', 1, 'pending', 'snap', 'p/1'));
    await koniecTx(tx);
    tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    o.delete('s');
    o.add(wiersz('n', 2, 'pending', 'snap', 'p/1'));
    o.add(wiersz('x', 2, 'pending', 'pnote', 'q')).onerror = (e) => { ev.push('req ' + e.target.error.name); };
    ev.push(await koniecTx(tx));
    ev.push('po: ' + JSON.stringify(await req(d.transaction('outbox', 'readonly').objectStore('outbox').getAllKeys())));
    d.close();
    return ev;
  });

  // p20: jak p19, preventDefault() na błędzie żądania → transakcja zatwierdza resztę.
  await krok('p20', async () => {
    const d = await otworz('p20', 1, schemat);
    const tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    o.add(wiersz('a', 1, 'pending', 'k', 'e'));
    const r = o.add(wiersz('b', 1, 'pending', 'k', 'e'));
    r.onerror = (e) => { e.preventDefault(); ev.push('req ' + r.error.name + ' preventDefault'); };
    o.add(wiersz('c', 3, 'pending', 'k', 'e'));
    ev.push(await koniecTx(tx));
    ev.push('po: ' + JSON.stringify(await req(d.transaction('outbox').objectStore('outbox').getAllKeys())));
    d.close();
    return ev;
  });

  // p21: jawne abort() przy dwóch żądaniach w toku.
  await krok('p21', async () => {
    const d = await otworz('p21', 1, schemat);
    const tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    const r1 = o.put(wiersz('a', 1, 'pending', 'k', 'e'));
    const r2 = o.get('a');
    r1.onsuccess = () => { ev.push('r1 success'); };
    r1.onerror = () => { ev.push('r1 error ' + r1.error.name + ' readyState=' + r1.readyState); };
    r2.onsuccess = () => { ev.push('r2 success'); };
    r2.onerror = () => { ev.push('r2 error ' + r2.error.name); };
    tx.onerror = (e) => { ev.push('tx error(' + (e.target === r1 ? 'r1' : e.target === r2 ? 'r2' : 'inny') + ')'); };
    tx.abort();
    ev.push('po abort readyState=' + r1.readyState);
    ev.push(await koniecTx(tx));
    ev.push('drugie abort ' + nazwaBledu(() => tx.abort()));
    ev.push('po: ' + JSON.stringify(await req(d.transaction('outbox').objectStore('outbox').getAllKeys())));
    d.close();
    return ev;
  });

  // p22: wyjątek rzucony w onsuccess przerywa transakcję.
  await krok('p22', async () => {
    const d = await otworz('p22', 1, schemat);
    const tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    const r = o.put(wiersz('a', 1, 'pending', 'k', 'e'));
    r.onsuccess = () => { ev.push('onsuccess rzuca'); throw new Error('celowo (scenariusz p22)'); };
    ev.push(await koniecTx(tx));
    ev.push('po: ' + JSON.stringify(await req(d.transaction('outbox').objectStore('outbox').getAllKeys())));
    d.close();
    return ev;
  });

  // p23: łańcuch funkcji async przez 6 żądań i 3 poziomy await bez żądań.
  await krok('p23', async () => {
    const d = await otworz('p23', 1, schemat);
    const tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    const glebiej = async (n) => { if (n > 0) await glebiej(n - 1); return n; };
    const praca = async () => {
      for (let i = 1; i <= 6; i += 1) { await req(o.put(wiersz('e' + i, i, 'pending', 'k', 'e'))); await glebiej(3); }
      const k = await req(o.index('bySeqLocal').openCursor(null, 'prev'));
      ev.push('max=' + (k && k.value.seqLocal));
    };
    praca().then(() => { ev.push('praca ok'); }, (x) => { ev.push('praca ' + x.name); });
    ev.push(await koniecTx(tx));
    d.close();
    return ev;
  });

  // p24: open(n) w kolejce za zablokowanym deleteDatabase(n).
  await krok('p24', async () => {
    const a = await otworz('p24', 1, schemat);
    const ev = [];
    let koniec = null;
    const gotowe = new Promise((ok) => { koniec = ok; });
    a.onversionchange = (e) => { ev.push('A versionchange new=' + e.newVersion); };
    const del = indexedDB.deleteDatabase('p24');
    del.onblocked = () => { ev.push('delete blocked'); a.close(); ev.push('A.close'); };
    del.onsuccess = () => { ev.push('delete success'); };
    const op = indexedDB.open('p24');
    op.onupgradeneeded = (e) => { ev.push('open upgrade old=' + e.oldVersion); op.transaction.abort(); };
    op.onsuccess = () => { ev.push('open success v' + op.result.version); op.result.close(); koniec(); };
    op.onerror = (e) => { e.preventDefault(); ev.push('open error ' + op.error.name); koniec(); };
    await gotowe;
    ev.push('bazy=' + JSON.stringify(await nazwy('p24')));
    return ev;
  });

  // p25: dwa połączenia, dwie readwrite.
  await krok('p25', async () => {
    const d1 = await otworz('p25', 1, (db) => { db.createObjectStore('s'); });
    const d2 = await otworz('p25');
    const ev = [];
    const t1 = d1.transaction('s', 'readwrite');
    const t2 = d2.transaction('s', 'readwrite');
    const g2 = t2.objectStore('s').get('x');
    g2.onsuccess = () => { ev.push('t2 get=' + g2.result); };
    const p1 = t1.objectStore('s').put(1, 'x');
    p1.onsuccess = () => { ev.push('t1 put'); };
    t1.oncomplete = () => { ev.push('t1 complete'); };
    await new Promise((ok) => { t2.oncomplete = () => { ev.push('t2 complete'); ok(); }; });
    d1.close();
    d2.close();
    return ev;
  });

  // p26: kursor prev z delete(); kopie przy put/get; update() i advance(); kierunki unikalne; kursor kluczy.
  await krok('p26', async () => {
    const d = await otworz('p26', 1, schemat);
    let tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    const ev = [];
    const rek = { eid: 'a', state: 'pending', kind: 'k', entityKey: 'e', seqLocal: 1, tab: [1] };
    o.put(rek);
    rek.tab.push(2);
    for (const [e, s] of [['b', 5], ['c', 3], ['d', 9]]) o.put(wiersz(e, s, 'pending', 'k', 'e'));
    const seq = [];
    const c = o.index('bySeqLocal').openCursor(null, 'prev');
    c.onsuccess = () => {
      const k = c.result;
      if (!k) return;
      seq.push(k.value.seqLocal + ':' + k.primaryKey + ':' + k.key + ':' + k.direction);
      if (k.value.seqLocal === 5) k.delete();
      k.continue();
    };
    await koniecTx(tx);
    ev.push('prev=' + seq.join(','));
    tx = d.transaction('outbox');
    const v = await req(tx.objectStore('outbox').get('a'));
    v.tab.push(3);
    const v2 = await req(tx.objectStore('outbox').get('a'));
    const klucze = await req(tx.objectStore('outbox').getAllKeys());
    ev.push('tab=' + JSON.stringify(v2.tab) + ' klucze=' + JSON.stringify(klucze));
    await koniecTx(tx);
    tx = d.transaction('outbox', 'readwrite');
    const o2 = tx.objectStore('outbox');
    const odwiedzone = [];
    const c2 = o2.openCursor();
    c2.onsuccess = () => {
      const k = c2.result;
      if (!k) return;
      odwiedzone.push(k.key);
      if (k.key === 'a') { const u = k.update(Object.assign({}, k.value, { state: 'inflight' })); u.onsuccess = () => { odwiedzone.push('update=' + u.result); }; k.advance(2); }
      else k.continue();
    };
    ev.push('update/advance ' + (await koniecTx(tx)) + ' ' + JSON.stringify(odwiedzone));
    tx = d.transaction('outbox');
    const zbierz = (zr) => new Promise((ok, zle) => {
      const out = [];
      zr.onsuccess = () => { const k = zr.result; if (!k) { ok(out); return; } out.push(k.primaryKey + ('value' in k ? '+v' : '')); k.continue(); };
      zr.onerror = (e) => { e.preventDefault(); zle(zr.error); };
    });
    const idx = tx.objectStore('outbox').index('byState');
    ev.push('nextunique=' + JSON.stringify(await zbierz(idx.openCursor(null, 'nextunique'))));
    ev.push('prevunique=' + JSON.stringify(await zbierz(idx.openCursor(null, 'prevunique'))));
    ev.push('pending prev=' + JSON.stringify(await zbierz(idx.openCursor('pending', 'prev'))));
    ev.push('kursor kluczy=' + JSON.stringify(await zbierz(tx.objectStore('outbox').openKeyCursor())));
    ev.push('kursor kluczy indeksu=' + JSON.stringify(await zbierz(idx.openKeyCursor())));
    const cs = await req(tx.objectStore('outbox').openCursor());
    ev.push('continue po kluczu: ' + nazwaBledu(() => { cs.continue('c'); }) + ', drugi continue: ' + nazwaBledu(() => { cs.continue(); }));
    ev.push('stan: ' + (await koniecTx(tx)));
    d.close();
    return ev;
  });

  // p27: versionchange do dwóch połączeń, oba zamykają się od razu → kasowanie bez blocked.
  await krok('p27', async () => {
    const a = await otworz('p27', 1, (db) => { db.createObjectStore('s'); });
    const b = await otworz('p27');
    const ev = [];
    a.onversionchange = (e) => { ev.push('A vc new=' + e.newVersion); a.close(); };
    b.onversionchange = (e) => { ev.push('B vc new=' + e.newVersion); b.close(); };
    await new Promise((ok) => {
      const r = indexedDB.deleteDatabase('p27');
      r.onblocked = () => { ev.push('blocked'); };
      r.onsuccess = () => { ev.push('success'); ok(); };
    });
    return ev;
  });

  // p28: błędy synchroniczne.
  await krok('p28', async () => {
    const d = await otworz('p28', 1, (db) => { schemat(db); db.createObjectStore('quarantine', { keyPath: ['slotId', 'seq'] }); });
    const ev = [];
    ev.push('nieznany sklep ' + nazwaBledu(() => d.transaction('nie_ma', 'readonly')));
    ev.push('pusty zakres ' + nazwaBledu(() => d.transaction([], 'readonly')));
    ev.push('zly tryb ' + nazwaBledu(() => d.transaction('outbox', 'zly')));
    ev.push('domyslny tryb ' + d.transaction('outbox').mode);
    const tx = d.transaction('outbox', 'readwrite');
    const o = tx.objectStore('outbox');
    ev.push('get(null) ' + nazwaBledu(() => o.get(null)));
    ev.push('get(undefined) ' + nazwaBledu(() => o.get(undefined)));
    ev.push('delete(null) ' + nazwaBledu(() => o.delete(null)));
    ev.push('put bez eid ' + nazwaBledu(() => o.put({ state: 'x' })));
    ev.push('put z kluczem obiektowym ' + nazwaBledu(() => o.put({ eid: {}, seqLocal: 1 })));
    ev.push('put z kluczem przy keyPath ' + nazwaBledu(() => o.put({ eid: 'q' }, 'q')));
    ev.push('index ' + nazwaBledu(() => o.index('nie_ma')));
    ev.push('sklep poza zakresem ' + nazwaBledu(() => tx.objectStore('quarantine')));
    ev.push('createIndex poza upgrade ' + nazwaBledu(() => o.createIndex('x', 'x')));
    ev.push('ten sam obiekt sklepu ' + (tx.objectStore('outbox') === o));
    ev.push(await koniecTx(tx));
    ev.push('abort po complete ' + nazwaBledu(() => tx.abort()));
    ev.push('objectStore po complete ' + nazwaBledu(() => tx.objectStore('outbox')));
    ev.push('put po complete ' + nazwaBledu(() => o.put(wiersz('z', 77))));
    ev.push('createObjectStore poza upgrade ' + nazwaBledu(() => d.createObjectStore('z')));
    const ro = d.transaction('outbox', 'readonly');
    ev.push('put w readonly ' + nazwaBledu(() => ro.objectStore('outbox').put(wiersz('r', 5))));
    ev.push('clear w readonly ' + nazwaBledu(() => ro.objectStore('outbox').clear()));
    ev.push('readonly ' + (await koniecTx(ro)));
    ev.push('bound(2, 1) ' + nazwaBledu(() => IDBKeyRange.bound(2, 1)));
    ev.push('bound(1, 1, true) ' + nazwaBledu(() => IDBKeyRange.bound(1, 1, true)));
    ev.push('only(null) ' + nazwaBledu(() => IDBKeyRange.only(null)));
    ev.push('lowerBound(1).includes(1) ' + IDBKeyRange.lowerBound(1, true).includes(1) + ' ' + IDBKeyRange.lowerBound(1).includes(1));
    ev.push('open(0) ' + nazwaBledu(() => indexedDB.open('p28x', 0)));
    ev.push('open(-1) ' + nazwaBledu(() => indexedDB.open('p28x', -1)));
    ev.push('open(NaN) ' + nazwaBledu(() => indexedDB.open('p28x', NaN)));
    ev.push('bazy=' + JSON.stringify(await nazwy('p28', 'p28x')));
    d.close();
    return ev;
  });

  // p29: readonly, readwrite, readonly — harmonogram.
  await krok('p29', async () => {
    const d = await otworz('p29', 1, (db) => { db.createObjectStore('s'); });
    const ev = [];
    const r = d.transaction('s', 'readonly');
    const w = d.transaction('s', 'readwrite');
    const r2 = d.transaction('s', 'readonly');
    const g = r.objectStore('s').get('x');
    g.onsuccess = () => { ev.push('r get=' + g.result); };
    r.oncomplete = () => { ev.push('r complete'); };
    const p = w.objectStore('s').put(7, 'x');
    p.onsuccess = () => { ev.push('w put'); };
    w.oncomplete = () => { ev.push('w complete'); };
    const g2 = r2.objectStore('s').get('x');
    g2.onsuccess = () => { ev.push('r2 get=' + g2.result); };
    await new Promise((ok) => { r2.oncomplete = () => { ev.push('r2 complete'); ok(); }; });
    d.close();
    return ev;
  });

  // p30: open(n, 2) z abort w upgrade na v1 z danymi → baza zostaje w v1 z danymi.
  await krok('p30', async () => {
    const d = await otworz('p30', 1, (db) => { db.createObjectStore('s'); });
    const t = d.transaction('s', 'readwrite');
    t.objectStore('s').put(1, 'x');
    await koniecTx(t);
    d.close();
    const ev = [];
    await new Promise((ok) => {
      const r = indexedDB.open('p30', 2);
      r.onupgradeneeded = (e) => { ev.push('upgrade ' + e.oldVersion + '->' + e.newVersion); r.result.createObjectStore('nowy'); r.transaction.abort(); };
      r.onsuccess = () => { ev.push('success'); r.result.close(); ok(); };
      r.onerror = (e) => { e.preventDefault(); ev.push('error ' + r.error.name); ok(); };
    });
    const d2 = await otworz('p30');
    const t2 = d2.transaction('s');
    ev.push('v=' + d2.version + ' x=' + (await req(t2.objectStore('s').get('x'))) + ' sklepy=' + Array.from(d2.objectStoreNames).join(','));
    d2.close();
    return ev;
  });

  // p31: kolejność obsług complete: addEventListener i oncomplete (pozycja atrybutu, podmiana atrybutu).
  await krok('p31', async () => {
    const d = await otworz('p31', 1, (db) => { db.createObjectStore('s'); });
    const w = {};
    {
      const tx = d.transaction('s', 'readwrite');
      const s = tx.objectStore('s');
      const ev = [];
      for (let i = 0; i < 3; i += 1) { const r = s.put(i, 'k' + i); r.onsuccess = () => { ev.push('put' + i); }; }
      tx.addEventListener('complete', () => { ev.push('listener complete'); });
      tx.oncomplete = () => { ev.push('oncomplete'); };
      await new Promise((ok) => { tx.addEventListener('complete', () => { ok(); }); });
      w.a = ev;
    }
    {
      const tx = d.transaction('s', 'readwrite');
      tx.objectStore('s').put(9, 'k9');
      const ev = [];
      tx.oncomplete = () => { ev.push('oncomplete 1'); };
      tx.addEventListener('complete', () => { ev.push('listener'); });
      tx.oncomplete = () => { ev.push('oncomplete 2'); };
      await new Promise((ok) => { tx.addEventListener('complete', () => { ok(); }); });
      w.b = ev;
    }
    {
      const tx = d.transaction('s', 'readwrite');
      const ev = [];
      const r = tx.objectStore('s').get('k0');
      const zapis = (n) => () => { ev.push(n); };
      const l1 = zapis('listener 1');
      r.addEventListener('success', l1);
      r.addEventListener('success', zapis('listener 2'));
      r.removeEventListener('success', l1);
      r.onsuccess = (e) => { ev.push('onsuccess type=' + e.type + ' cel=' + (e.target === r) + ' wynik=' + r.result); };
      await koniecTx(tx);
      w.c = ev;
    }
    d.close();
    return w;
  });

  // p32: tx.error w onerror żądania, w tx.onerror i w onabort (ConstraintError).
  await krok('p32', async () => {
    const d = await otworz('p32', 1, (db) => { db.createObjectStore('o', { keyPath: 'eid' }).createIndex('u', 'n', { unique: true }); });
    const ev = [];
    const tx = d.transaction('o', 'readwrite');
    const s = tx.objectStore('o');
    s.add({ eid: 'a', n: 1 });
    const r = s.add({ eid: 'b', n: 1 });
    r.onerror = () => { ev.push('req.onerror tx.error=' + (tx.error ? tx.error.name : 'null') + ' req.error=' + r.error.name); };
    tx.onerror = (e) => { ev.push('tx.onerror tx.error=' + (tx.error ? tx.error.name : 'null') + ' cel=' + (e.target === r ? 'zadanie' : 'inny')); };
    await new Promise((ok) => {
      tx.onabort = () => { ev.push('tx.onabort tx.error=' + (tx.error ? tx.error.name : 'null')); ok(); };
      tx.oncomplete = () => { ev.push('complete'); ok(); };
    });
    d.close();
    return ev;
  });

  // p33: jawne commit(), potem żądanie i abort().
  await krok('p33', async () => {
    const d = await otworz('p33', 1, (db) => { db.createObjectStore('s'); });
    const tx = d.transaction('s', 'readwrite');
    const s = tx.objectStore('s');
    const ev = [];
    const r = s.put(1, 'x');
    r.onsuccess = () => { ev.push('put success'); };
    tx.commit();
    ev.push('put po commit(): ' + nazwaBledu(() => s.put(2, 'y')));
    ev.push('abort po commit(): ' + nazwaBledu(() => tx.abort()));
    ev.push('drugi commit(): ' + nazwaBledu(() => tx.commit()));
    ev.push(await new Promise((ok) => { tx.oncomplete = () => { ok('complete'); }; tx.onabort = () => { ok('abort'); }; }));
    const t2 = d.transaction('s');
    ev.push('po: ' + JSON.stringify(await req(t2.objectStore('s').getAllKeys())));
    d.close();
    return ev;
  });

  // p34: deleteDatabase zlecone w ostatnim onsuccess dużej transakcji; abort() w onversionchange. Wynik transakcji
  // osobno od kolejności zdarzeń połączenia: w Chromium zdarzenie complete przychodzi przed versionchange albo po nim,
  // zależnie od obciążenia (zmierzone: 1 na 20 przebiegów bez obciążenia, 6 na 10 przy zajętych trzech rdzeniach); w obu
  // kolejnościach transakcja jest już w zatwierdzaniu (abort → InvalidStateError) i kończy się complete.
  await krok('p34', async () => {
    const d = await otworz('p34', 1, (db) => { db.createObjectStore('s'); });
    const ev = [];
    const tx = d.transaction('s', 'readwrite');
    const s = tx.objectStore('s');
    let stan = 'aktywna';
    let koniecDel = null;
    const kasowanie = new Promise((ok) => { koniecDel = ok; });
    d.onversionchange = (e) => {
      ev.push('versionchange new=' + e.newVersion + ' (' + stan + ')');
      ev.push('abort: ' + nazwaBledu(() => tx.abort()));
      d.close();
      ev.push('close');
    };
    const N = 3000;
    let ile = 0;
    for (let i = 0; i < N; i += 1) {
      const r = s.put({ i, t: 'x'.repeat(200) }, i);
      r.onsuccess = () => {
        ile += 1;
        if (ile === N) {
          stan = 'po ostatnim onsuccess';
          const del = indexedDB.deleteDatabase('p34');
          del.onblocked = () => { ev.push('delete blocked'); };
          del.onsuccess = () => { ev.push('delete success'); koniecDel(); };
        }
      };
    }
    const wynikTx = await koniecTx(tx);
    await kasowanie;
    return { zdarzenia: ev, tx: wynikTx };
  });

  return W;
}

// Wynik scenariuszeIDB w prawdziwym Chromium: 141.0.7390.37 (przeglądarka Playwright chromium-1194),
// strona https://atrapa-idb.invalid/ przez page.route (bezpieczny kontekst), 3 przebiegi w nowych kontekstach — identyczne
// (sha256 069252fe74b3…), nagranie 2026-11-03; p34 w postaci { zdarzenia, tx } sprawdzone ponownie w 40 przebiegach (20 bez
// obciążenia, 20 przy zajętych trzech rdzeniach) — wszystkie równe literałowi. CI uruchamia nowszy Chromium
// (tests/e2e/atrapa-indexeddb-zgodnosc.spec.mjs);
// czerwony e2e po zmianie przeglądarki = sygnał do przejrzenia atrapy klucz po kluczu, nie do przepisania literału bez analizy.
export const SLAD_CHROMIUM = Object.freeze({
  p1: ['upgrade old=0 new=1', 'error AbortError', 'bazy=[]'],
  p2: {
    nazwa: 'p02',
    wersja: 1,
    sklepy: ['meta', 'outbox', 'quarantine'],
    tryb: 'readonly',
    zakres: ['outbox', 'quarantine'],
    outbox: {
      keyPath: '"eid"',
      autoIncrement: false,
      indeksy: [
        'byEntity ["kind","entityKey"] unique=false multiEntry=false',
        'bySeqLocal "seqLocal" unique=true multiEntry=false',
        'byState "state" unique=false multiEntry=false',
      ],
    },
    quarantine: {
      keyPath: '["slotId","seq"]',
      autoIncrement: false,
      indeksy: ['bySlot "slotId" unique=false multiEntry=false'],
    },
    contains: [true, false],
    dlugosc: 3,
    item: ['meta', null],
    koniec: 'complete',
    bazy: ['p02@1'],
  },
  p3: ['add b ok wynik=b', 'complete', 'klucze=["b"]'],
  p4: [
    'req error ConstraintError tx.error=null',
    'tx error ConstraintError cel=zadanie tx.error=null',
    'abort ConstraintError',
  ],
  p5: {
    poMikrozadaniu: 'aktywna',
    po50Mikrozadaniach: 'aktywna',
    poZegarze: 'TransactionInactiveError',
    koniec: 'complete',
  },
  p7: {
    byEntity: ['b', 'd'],
    countPending: 2,
    kw: ['a1', 'a2', 'a10', 'b1', 'b2'],
    slotA: [1, 2, 10],
    minA: 1,
    kluczKursora: '["a",1]',
    maxSeqLocal: 3,
    maxPrimaryKey: 'e',
    getAllLimit: ['b', 'd'],
    kluczePending: ['b', 'e'],
    countAll: 3,
    indexGet: 'd',
    indexGetKey: 'e',
    zakresOtwarty: ['e'],
    upperBound: ['b', 'd'],
    only: 1,
    brak: 'undefined',
    koniec: 'complete',
  },
  p8: {
    klucze: ['-Infinity', '-1', '2', 'D-3', 'D5', '""', '"a"', '"b"', '[]', '[0]', '[0,"x"]', '[1]'],
    cmp: [-1, 0, 1, 1, 1, 1, -1, 0],
    cmpBledy: ['DataError', 'DataError', 'DataError', 'DataError', 'DataError'],
  },
  p9: {
    maUndefined: true,
    klucze: ['eid', 'state', 'kind', 'entityKey', 'seqLocal', 'z'],
    dce: 'DataCloneError',
  },
  p10: [
    'versionchange old=1 new=null',
    'blocked old=1 new=null',
    'close',
    'success old=1 new=null wynik=undefined',
    'bazy=[]',
  ],
  p11: { transaction: 'InvalidStateError', drugieClose: 'brak bledu' },
  p12: [
    'blocked old=1 new=2',
    'close v1',
    'upgrade 1->2 tx=versionchange',
    'success v2 tx=null',
    'v1 error VersionError wynik=undefined',
  ],
  p13: ['t1 put', 't1 complete', 't2 get=1', 't2 complete', 't3 get=1', 't3 complete'],
  p14: {
    zamkniecieWToku: ['close wywolane', 'complete', 'x=1'],
    zamkniecieWVersionchange: [
      'versionchange new=null',
      'close',
      'tx complete',
      'delete success',
      'udane=true po versionchange=20',
      'bazy=[]',
    ],
    zamknieciePrzedKasowaniem: ['close', 'delete blocked old=1 new=null', 'tx complete', 'delete success'],
  },
  p15: 'success old=0 new=null',
  p16: {
    databases: 'function',
    open: 'function',
    deleteDatabase: 'function',
    cmp: 'function',
    keyRange: 'function',
  },
  p17: ['upgrade old=0 new=1 result.version=1', 'error AbortError', 'bazy=[]'],
  p18: ['v=1 sklepy=outbox', 'v=2'],
  p19: ['req ConstraintError', 'abort ConstraintError', 'po: ["s"]'],
  p20: ['req ConstraintError preventDefault', 'complete', 'po: ["a","c"]'],
  p21: [
    'po abort readyState=pending',
    'r1 error AbortError readyState=done',
    'tx error(r1)',
    'r2 error AbortError',
    'tx error(r2)',
    'abort null',
    'drugie abort InvalidStateError',
    'po: []',
  ],
  p22: ['onsuccess rzuca', 'abort AbortError', 'po: []'],
  p23: ['max=6', 'praca ok', 'complete'],
  p24: [
    'A versionchange new=null',
    'delete blocked',
    'A.close',
    'delete success',
    'open upgrade old=0',
    'open error AbortError',
    'bazy=[]',
  ],
  p25: ['t1 put', 't1 complete', 't2 get=1', 't2 complete'],
  p26: [
    'prev=9:d:9:prev,5:b:5:prev,3:c:3:prev,1:a:1:prev',
    'tab=[1] klucze=["a","c","d"]',
    'update/advance complete ["a","update=a","d"]',
    'nextunique=["a+v","c+v"]',
    'prevunique=["c+v","a+v"]',
    'pending prev=["d+v","c+v"]',
    'kursor kluczy=["a","c","d"]',
    'kursor kluczy indeksu=["a","c","d"]',
    'continue po kluczu: brak bledu, drugi continue: InvalidStateError',
    'stan: complete',
  ],
  p27: ['A vc new=null', 'B vc new=null', 'success'],
  p28: [
    'nieznany sklep NotFoundError',
    'pusty zakres InvalidAccessError',
    'zly tryb TypeError',
    'domyslny tryb readonly',
    'get(null) DataError',
    'get(undefined) DataError',
    'delete(null) DataError',
    'put bez eid DataError',
    'put z kluczem obiektowym DataError',
    'put z kluczem przy keyPath DataError',
    'index NotFoundError',
    'sklep poza zakresem NotFoundError',
    'createIndex poza upgrade InvalidStateError',
    'ten sam obiekt sklepu true',
    'complete',
    'abort po complete InvalidStateError',
    'objectStore po complete InvalidStateError',
    'put po complete TransactionInactiveError',
    'createObjectStore poza upgrade InvalidStateError',
    'put w readonly ReadOnlyError',
    'clear w readonly ReadOnlyError',
    'readonly complete',
    'bound(2, 1) DataError',
    'bound(1, 1, true) DataError',
    'only(null) DataError',
    'lowerBound(1).includes(1) false true',
    'open(0) TypeError',
    'open(-1) TypeError',
    'open(NaN) TypeError',
    'bazy=["p28@1"]',
  ],
  p29: ['r get=undefined', 'r complete', 'w put', 'w complete', 'r2 get=7', 'r2 complete'],
  p30: ['upgrade 1->2', 'error AbortError', 'v=1 x=1 sklepy=s'],
  p31: {
    a: ['put0', 'put1', 'put2', 'listener complete', 'oncomplete'],
    b: ['oncomplete 2', 'listener'],
    c: ['listener 2', 'onsuccess type=success cel=true wynik=0'],
  },
  p32: [
    'req.onerror tx.error=null req.error=ConstraintError',
    'tx.onerror tx.error=null cel=zadanie',
    'tx.onabort tx.error=ConstraintError',
  ],
  p33: [
    'put po commit(): TransactionInactiveError',
    'abort po commit(): InvalidStateError',
    'drugi commit(): InvalidStateError',
    'put success',
    'complete',
    'po: ["x"]',
  ],
  p34: {
    zdarzenia: [
      'versionchange new=null (po ostatnim onsuccess)',
      'abort: InvalidStateError',
      'close',
      'delete success',
    ],
    tx: 'complete',
  },
});
