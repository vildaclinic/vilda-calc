/* P-SYNC-TEST-POLACZENIA — „Test połączenia z synchronizacją” w Ustawieniach (sekcja „Łączność na żywo”).
 *
 * Po co: na komputerach w sieciach z zaporą lub proxy (np. szpitalnych) synchronizacja bywa „raz jest, raz jej nie
 * ma”. Test odpowiada na pytanie, czy przyczyną jest sieć, i daje raport do przekazania działowi IT.
 *
 * Co robi (tylko odczyt, bez danych pacjentów):
 *   1. przeglądarka zgłasza internet (navigator.onLine);
 *   2. pięć razy GET /v1/health serwera synchronizacji, bez logowania i bez identyfikatora konta (to samo proste
 *      żądanie CORS, które aplikacja i tak wysyła przy pobieraniu); mierzy czas i rodzaj błędu;
 *   3. stan prawdziwego połączenia na żywo (VildaRealtime w oknie głównym): czy serwer odpowiada na bicie serca
 *      (pong), a jeśli nie — czeka do 35 s (bicie serca co 25 s); przy zamkniętym gnieździe prosi o połączenie tak jak
 *      powrót do karty (VildaRealtime.connect());
 *   4. historia połączeń na żywo od otwarcia aplikacji (VildaRealtime.getHistory()): ile razy zrywano, po jakim czasie,
 *      z jakim kodem. Stały czas życia połączenia to typowy ślad limitu w zaporze lub proxy.
 *
 * Czego nie robi: nie wysyła ani nie pobiera danych, nie zmienia stanu synchronizacji, kolejki, kursora ani ustawień,
 * niczego nie zapisuje w magazynie. Raport nie zawiera ID konta, tokenu ani danych pacjentów.
 *
 * Model (funkcje czyste, testowane w tests/unit/sync-test-polaczenia.test.mjs) jest oddzielony od montowania w DOM
 * (mount na końcu pliku). Publiczne API: window.VildaSyncConnectionTest. */
(function (root) {
  'use strict';
  if (!root || (root.VildaSyncConnectionTest && root.VildaSyncConnectionTest.__vildaSyncConnectionTest)) return;

  var DOMYSLNY_WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';
  var PROBKI = 5, PRZERWA_MS = 800, LIMIT_MS = 8000, CZEKAJ_WS_MS = 35000, KROK_WS_MS = 500, WOLNO_MS = 1500;

  function liczba(x) { return typeof x === 'number' && isFinite(x); }

  function formatDuration(ms) {
    if (!liczba(ms) || ms < 0) return '—';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return m + ' min' + (rs ? ' ' + rs + ' s' : '');
    var h = Math.floor(m / 60), rm = m % 60;
    return h + ' h' + (rm ? ' ' + rm + ' min' : '');
  }

  function mediana(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; }), k = Math.floor(a.length / 2);
    return a.length % 2 ? a[k] : Math.round((a[k - 1] + a[k]) / 2);
  }

  /* Jedna próbka GET /v1/health → { ok, kind, ms, status }. kind: ok | network | timeout | http | format. */
  function classifyHealthSample(x) {
    x = x || {};
    var ms = liczba(x.ms) ? Math.round(x.ms) : null;
    if (x.error) {
      var nazwa = x.error && x.error.name;
      return { ok: false, kind: nazwa === 'AbortError' || nazwa === 'TimeoutError' ? 'timeout' : 'network', ms: ms, status: null };
    }
    if (!liczba(x.status) || x.status < 200 || x.status > 299) return { ok: false, kind: 'http', ms: ms, status: liczba(x.status) ? x.status : null };
    var b = x.body;
    if (!b || typeof b !== 'object' || b.status !== 'ok') return { ok: false, kind: 'format', ms: ms, status: x.status };
    return { ok: true, kind: 'ok', ms: ms, status: x.status, api: b.api != null ? String(b.api) : (b.version != null ? String(b.version) : null) };
  }

  function summarizeHealth(samples) {
    samples = Array.isArray(samples) ? samples : [];
    var ok = samples.filter(function (s) { return s.ok; });
    var czasy = ok.map(function (s) { return s.ms; }).filter(liczba);
    var rodzaje = {};
    samples.forEach(function (s) { if (!s.ok) rodzaje[s.kind] = (rodzaje[s.kind] || 0) + 1; });
    var level = !samples.length ? 'skip' : !ok.length ? 'error' : ok.length < samples.length ? 'warn' : 'ok';
    var med = mediana(czasy);
    if (level === 'ok' && med !== null && med > WOLNO_MS) level = 'warn';
    return {
      level: level, total: samples.length, okCount: ok.length, failKinds: rodzaje,
      medianMs: med, maxMs: czasy.length ? Math.max.apply(null, czasy) : null,
      api: ok.length ? ok[ok.length - 1].api || null : null,
    };
  }

  /* Historia z VildaRealtime.getHistory() → wnioski. Wpisy z kodem "disconnect" (blokada sejfu, wylogowanie) nie są
   * zerwaniem przez sieć i nie wchodzą do czasów życia. */
  function analyzeHistory(history, now) {
    var h = history && Array.isArray(history.entries) ? history : { since: null, entries: [] };
    now = liczba(now) ? now : Date.now();
    var e = h.entries, zerwane = [], nieotwarte = 0, kody = {}, otwarteTeraz = null, ostatnieZerwanie = null;
    e.forEach(function (w) {
      if (!w) return;
      if (w.closedAt === null || w.closedAt === undefined) {
        if (w.openedAt) otwarteTeraz = { openedAt: w.openedAt, ageMs: now - w.openedAt, pongs: w.pongs || 0 };
        return;
      }
      if (w.code === 'disconnect') return;
      var kod = w.code === null || w.code === undefined ? 'brak' : String(w.code);
      kody[kod] = (kody[kod] || 0) + 1;
      if (!w.openedAt) { nieotwarte++; return; }
      zerwane.push({ lifeMs: w.closedAt - w.openedAt, pongs: w.pongs || 0, code: kod, closedAt: w.closedAt });
      if (!ostatnieZerwanie || w.closedAt > ostatnieZerwanie) ostatnieZerwanie = w.closedAt;
    });
    var zycia = zerwane.map(function (z) { return z.lifeMs; });
    var ostatnie = zycia.slice(-5), med = mediana(zycia), regularne = false;
    if (ostatnie.length >= 3) {
      var rozrzut = Math.max.apply(null, ostatnie) - Math.min.apply(null, ostatnie);
      regularne = rozrzut <= Math.max(10000, 0.2 * mediana(ostatnie));
    }
    var obserwacja = liczba(h.since) ? now - h.since : null;
    var bezPong = zerwane.filter(function (z) { return z.pongs === 0; }).length;
    return {
      sinceMs: obserwacja, attempts: e.length, opened: zerwane.length + (otwarteTeraz ? 1 : 0),
      drops: zerwane.length, neverOpened: nieotwarte, dropsWithoutPong: bezPong, codes: kody,
      medianLifeMs: med, regular: regularne, regularLifeMs: regularne ? mediana(ostatnie) : null,
      current: otwarteTeraz, lastDropAt: ostatnieZerwanie,
      dropsPerHour: obserwacja && obserwacja >= 10 * 60000 ? Math.round(zerwane.length / (obserwacja / 3600000) * 10) / 10 : null,
    };
  }

  /* Wynik testu → jeden werdykt dla człowieka: { level, title, text, advice[] }. */
  function verdict(r) {
    r = r || {};
    var hs = r.health || {}, ws = r.ws || {}, hi = r.history || {};
    var rada = [];
    var doIT = 'Przekaż działowi IT raport (przycisk „Kopiuj raport dla IT”) z prośbą o dopuszczenie hosta ' + (r.host || 'serwera synchronizacji') +
      ' (port 443, HTTPS i WebSocket „wss”) bez limitu czasu połączenia i bez inspekcji TLS dla tego hosta.';
    if (r.online === false) {
      return { level: 'error', title: 'Brak internetu', text: 'Przeglądarka zgłasza brak połączenia z siecią. Synchronizacja wznowi się sama po powrocie sieci; zmiany zostają zapisane na tym urządzeniu.', advice: [] };
    }
    if (hs.level === 'error') {
      rada.push('Sprawdź, czy ten sam komputer na innej sieci (np. hotspot z telefonu) przechodzi test. Jeśli tak — przyczyną jest sieć.');
      rada.push(doIT);
      var tylkoLimit = hs.failKinds && hs.failKinds.timeout === hs.total;
      return { level: 'error', title: 'Serwer synchronizacji jest nieosiągalny z tej sieci',
        text: (tylkoLimit ? 'Żadne z ' + hs.total + ' zapytań nie doczekało się odpowiedzi.' : 'Żadne z ' + hs.total + ' zapytań nie dotarło do serwera albo odpowiedź została zablokowana.') +
          ' Jeśli inne strony internetowe działają, najpewniej zapora lub filtr stron blokuje ten adres. Zmiany zostają zapisane na tym urządzeniu i wyślą się, gdy połączenie wróci.', advice: rada };
    }
    var problemy = [], level = 'ok';
    if (hs.level === 'warn') {
      level = 'warn';
      if (hs.okCount < hs.total) problemy.push('część zapytań do serwera nie powiodła się (' + (hs.total - hs.okCount) + ' z ' + hs.total + ')');
      else problemy.push('serwer odpowiada wolno (mediana ' + hs.medianMs + ' ms)');
    }
    if (ws.kind === 'not-connected' || ws.kind === 'open-no-pong') {
      level = 'warn';
      problemy.push(ws.kind === 'open-no-pong' ? 'połączenie na żywo otwiera się, ale serwer nie odpowiada przez nie na sygnał kontrolny' : 'połączenie na żywo (WebSocket) nie nawiązuje się');
    }
    if (hi.neverOpened > 0 && hi.opened === 0) {
      level = 'warn';
      problemy.push('każda próba połączenia na żywo (' + hi.neverOpened + ') kończy się przed otwarciem');
    }
    if (hi.drops >= 3 && hi.regular) {
      level = 'warn';
      problemy.push('połączenie na żywo jest zrywane regularnie, za każdym razem po ok. ' + formatDuration(hi.regularLifeMs));
    } else if (hi.drops >= 3) {
      level = 'warn';
      problemy.push('połączenie na żywo zerwano ' + hi.drops + ' razy od ' + formatDuration(hi.sinceMs) + (hi.medianLifeMs !== null ? ' (typowo po ' + formatDuration(hi.medianLifeMs) + ')' : ''));
    }
    if (level === 'ok') {
      return { level: 'ok', title: 'Połączenie z synchronizacją działa prawidłowo',
        text: ws.kind === 'skipped' ? 'Serwer odpowiada. Połączenia na żywo nie sprawdzono, bo synchronizacja jest wyłączona albo nie zalogowano się.' : 'Serwer odpowiada, a połączenie na żywo jest aktywne.' + (hi.drops ? ' Pojedyncze zerwania (' + hi.drops + ') są normalne, np. po uśpieniu komputera.' : ''),
        advice: [] };
    }
    var siec = hi.regular || ws.kind === 'open-no-pong' || (hi.neverOpened > 0 && hi.opened === 0) || ws.kind === 'not-connected';
    if (siec) {
      rada.push('Taki obraz najczęściej daje zapora lub serwer proxy w sieci (np. szpitalnej), który zamyka albo przepuszcza tylko częściowo długotrwałe połączenia.');
      rada.push('Porównaj z innym łączem (hotspot z telefonu): jeśli tam problemu nie ma, przyczyną jest sieć.');
      rada.push(doIT);
    } else {
      rada.push('Uruchom test ponownie za kilka minut i porównaj z innym łączem (hotspot z telefonu).');
    }
    return { level: 'warn', title: 'Synchronizacja działa, ale połączenie jest niestabilne',
      text: 'Wykryto: ' + problemy.join('; ') + '. Dane nie giną: gdy połączenie na żywo nie działa, aplikacja sama pobiera zmiany co ok. 20 s, a niewysłane zmiany wysyła po powrocie połączenia. Zmiany z innych urządzeń mogą wtedy pojawiać się z opóźnieniem.',
      advice: rada };
  }

  function opisKodu(kod) {
    var k = String(kod);
    if (k === '1006') return '1006 — zerwane bez pożegnania (sieć, zapora, uśpienie)';
    if (k === '1000') return '1000 — zamknięte zwyczajnie';
    if (k === '1001') return '1001 — serwer lub strona odchodzi (np. aktualizacja serwera)';
    if (k === '1011' || k === '1012' || k === '1013') return k + ' — serwer chwilowo niedostępny';
    if (k === 'brak') return 'bez kodu';
    return k;
  }

  function wsOpis(ws) {
    ws = ws || {};
    switch (ws.kind) {
      case 'live': return 'aktywne — ostatnia odpowiedź serwera ' + formatDuration(ws.pongAgeMs) + ' temu';
      case 'became-live': return 'aktywne — nawiązane w trakcie testu (' + formatDuration(ws.waitedMs) + ')';
      case 'open-no-pong': return 'otwarte, ale brak odpowiedzi na sygnał kontrolny przez ' + formatDuration(ws.waitedMs);
      case 'not-connected': return 'nie nawiązało się w ciągu ' + formatDuration(ws.waitedMs) + (ws.lastError ? ' (ostatni błąd: ' + ws.lastError + ')' : '');
      case 'skipped': return 'nie sprawdzono — ' + (ws.reason || 'synchronizacja wyłączona albo brak logowania');
      case 'unavailable': return 'nie sprawdzono — ' + (ws.reason || 'moduł połączenia na żywo niedostępny');
      default: return '—';
    }
  }

  function healthOpis(hs) {
    hs = hs || {};
    if (!hs.total) return 'nie sprawdzono';
    var t = hs.okCount + ' z ' + hs.total + ' odpowiedzi';
    if (hs.medianMs !== null && hs.medianMs !== undefined) t += ', mediana ' + hs.medianMs + ' ms, najdłużej ' + hs.maxMs + ' ms';
    var nazwy = { network: 'brak odpowiedzi lub zablokowana', timeout: 'przekroczony czas', http: 'błąd HTTP', format: 'nieoczekiwana treść (np. strona blokady)' };
    var b = Object.keys(hs.failKinds || {}).map(function (k) { return (nazwy[k] || k) + ': ' + hs.failKinds[k]; });
    if (b.length) t += '; nieudane — ' + b.join(', ');
    return t;
  }

  function historiaOpis(hi) {
    hi = hi || {};
    if (!hi.attempts) return 'brak prób połączenia na żywo od otwarcia aplikacji';
    var t = 'od otwarcia aplikacji (' + formatDuration(hi.sinceMs) + '): ' + hi.attempts + ' prób, zerwań: ' + hi.drops;
    if (hi.neverOpened) t += ', nieudanych otwarć: ' + hi.neverOpened;
    if (hi.medianLifeMs !== null && hi.medianLifeMs !== undefined) t += ', typowy czas życia: ' + formatDuration(hi.medianLifeMs);
    if (hi.regular) t += ' (regularnie)';
    if (hi.dropsPerHour !== null && hi.dropsPerHour !== undefined) t += ', ok. ' + String(hi.dropsPerHour).replace('.', ',') + ' zerwań/h';
    return t;
  }

  /* Raport tekstowy dla IT. Bez ID konta, tokenu i danych pacjentów. */
  function buildReport(r, meta) {
    r = r || {}; meta = meta || {};
    var v = r.verdict || verdict(r), hi = r.history || {};
    var L = [];
    L.push('Vilda — test połączenia z synchronizacją');
    L.push('Czas testu: ' + (meta.time || '—'));
    L.push('Aplikacja: ' + (meta.origin || '—'));
    L.push('Serwer synchronizacji: ' + (r.host || '—') + ' (HTTPS i WebSocket wss, port 443)');
    L.push('Przeglądarka: ' + (meta.userAgent || '—'));
    L.push('');
    L.push('Wynik: ' + v.title);
    L.push(v.text);
    L.push('');
    L.push('1. Internet w przeglądarce: ' + (r.online === false ? 'brak' : 'jest'));
    L.push('2. Serwer (GET /v1/health): ' + healthOpis(r.health) + (r.health && r.health.api ? '; wersja API ' + r.health.api : ''));
    L.push('3. Połączenie na żywo: ' + wsOpis(r.ws));
    L.push('4. Historia połączeń na żywo: ' + historiaOpis(hi));
    var kody = Object.keys(hi.codes || {});
    if (kody.length) L.push('   Kody zamknięcia: ' + kody.map(function (k) { return opisKodu(k) + ' ×' + hi.codes[k]; }).join('; '));
    if (Array.isArray(r.drops) && r.drops.length) {
      L.push('   Ostatnie zerwania (czas życia połączenia, kod):');
      r.drops.slice(-10).forEach(function (z) { L.push('   - ' + formatDuration(z.lifeMs) + ', ' + opisKodu(z.code) + (z.pongs ? '' : ', bez odpowiedzi serwera')); });
    }
    L.push('');
    L.push('Raport nie zawiera danych pacjentów, identyfikatora konta ani haseł.');
    return L.join('\n');
  }

  function zerwaniaZHistorii(history) {
    var e = history && Array.isArray(history.entries) ? history.entries : [];
    return e.filter(function (w) { return w && w.openedAt && w.closedAt && w.code !== 'disconnect'; })
      .map(function (w) { return { lifeMs: w.closedAt - w.openedAt, code: w.code === null || w.code === undefined ? 'brak' : String(w.code), pongs: w.pongs || 0 }; });
  }

  function hostZ(url) { try { return new URL(url).host; } catch (x) { return String(url || ''); } }

  /* Przebieg testu. deps: { fetch, now, sleep, online, workerUrl, realtime, syncActive, samples, wsWaitMs, onProgress }. */
  async function run(deps) {
    deps = deps || {};
    var now = deps.now || function () { return Date.now(); };
    var sleep = deps.sleep || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var postep = typeof deps.onProgress === 'function' ? deps.onProgress : function () {};
    var url = String(deps.workerUrl || DOMYSLNY_WORKER).replace(/\/$/, '');
    var wynik = { host: hostZ(url), online: deps.online !== false, health: null, ws: null, history: null, drops: [] };
    if (!wynik.online) {
      wynik.health = summarizeHealth([]); wynik.ws = { kind: 'skipped', reason: 'brak internetu' };
      wynik.history = analyzeHistory(null, now()); wynik.verdict = verdict(wynik);
      return wynik;
    }

    var n = liczba(deps.samples) ? deps.samples : PROBKI, probki = [];
    for (var i = 0; i < n; i++) {
      postep('health', i + 1, n);
      probki.push(classifyHealthSample(await jednaProbka(deps.fetch, url + '/v1/health', now, liczba(deps.timeoutMs) ? deps.timeoutMs : LIMIT_MS)));
      if (i < n - 1) await sleep(PRZERWA_MS);
    }
    wynik.health = summarizeHealth(probki);
    wynik.health.samples = probki;

    var rt = deps.realtime, czekaj = liczba(deps.wsWaitMs) ? deps.wsWaitMs : CZEKAJ_WS_MS;
    var info;
    try { info = rt && typeof rt.info === 'function' ? rt.info() : null; } catch (x) { info = null; }
    if (!info) wynik.ws = { kind: 'unavailable', reason: 'moduł połączenia na żywo niedostępny' };
    else if (info.supported === false) wynik.ws = { kind: 'unavailable', reason: 'przeglądarka nie obsługuje WebSocket' };
    else if (!deps.syncActive) wynik.ws = { kind: 'skipped', reason: 'synchronizacja wyłączona albo brak logowania' };
    else wynik.ws = await sprawdzWs(rt, info, czekaj, now, sleep, postep);

    var hist;
    try { hist = rt && typeof rt.getHistory === 'function' ? rt.getHistory() : null; } catch (x) { hist = null; }
    wynik.history = analyzeHistory(hist, now());
    wynik.drops = zerwaniaZHistorii(hist);
    wynik.verdict = verdict(wynik);
    return wynik;
  }

  async function jednaProbka(fetchFn, url, now, limit) {
    var t0 = now(), ctl = typeof AbortController === 'function' ? new AbortController() : null, zegar = null;
    try {
      if (typeof fetchFn !== 'function') throw new TypeError('fetch niedostępny');
      var obietnica = fetchFn(url + '?t=' + t0, { method: 'GET', cache: 'no-store', credentials: 'omit', signal: ctl ? ctl.signal : undefined });
      var limitP = new Promise(function (_, zle) {
        zegar = setTimeout(function () { try { ctl && ctl.abort(); } catch (x) { /* nic */ } var b = new Error('limit czasu'); b.name = 'TimeoutError'; zle(b); }, limit);
      });
      var odp = await Promise.race([obietnica, limitP]);
      var body = null;
      try { body = await Promise.race([odp.json(), limitP]); } catch (x) { if (x && x.name === 'TimeoutError') throw x; body = null; }
      return { status: odp.status, body: body, ms: now() - t0 };
    } catch (blad) {
      return { error: blad, ms: now() - t0 };
    } finally {
      if (zegar) clearTimeout(zegar);
    }
  }

  async function sprawdzWs(rt, info, czekaj, now, sleep, postep) {
    var zywy = function () { try { return typeof rt.isLive === 'function' && rt.isLive() === true; } catch (x) { return false; } };
    var pongAt = function () { try { return typeof rt.getLastPongAt === 'function' ? rt.getLastPongAt() : null; } catch (x) { return null; } };
    if (zywy()) return { kind: 'live', pongAgeMs: liczba(pongAt()) ? now() - pongAt() : null };
    if (info.status === 'closed') { try { typeof rt.connect === 'function' && rt.connect(); } catch (x) { /* nic */ } }
    var t0 = now(), byloOtwarte = false, ostatni = null;
    while (now() - t0 < czekaj) {
      postep('ws', Math.round((now() - t0) / 1000), Math.round(czekaj / 1000));
      await sleep(KROK_WS_MS);
      if (zywy()) return { kind: 'became-live', waitedMs: now() - t0 };
      try { var inf = rt.info(); if (inf.status === 'open') byloOtwarte = true; if (inf.lastError) ostatni = inf.lastError; } catch (x) { /* nic */ }
    }
    return { kind: byloOtwarte ? 'open-no-pong' : 'not-connected', waitedMs: now() - t0, lastError: ostatni };
  }

  /* ── Montowanie w Ustawieniach ─────────────────────────────────────────────────────────────── */
  function zOknaGlownego(nazwa) {
    try { if (root.top && root.top !== root && root.top[nazwa]) return root.top[nazwa]; } catch (x) { /* inny origin */ }
    return root[nazwa];
  }

  function syncAktywna() {
    try {
      var v = root.VildaVault;
      if (!v || typeof v.isUnlocked !== 'function' || !v.isUnlocked()) return false;
      var s = zOknaGlownego('VildaSyncIntegration');
      return !!(s && typeof s.isSyncEnabled === 'function' && s.isSyncEnabled());
    } catch (x) { return false; }
  }

  function mount(doc) {
    doc = doc || root.document;
    if (!doc) return false;
    var btn = doc.getElementById('syncConnTestBtn'), out = doc.getElementById('syncConnTestResult');
    var kopiuj = doc.getElementById('syncConnTestCopyBtn');
    if (!btn || !out || btn.__vildaConnTest) return false;
    btn.__vildaConnTest = true;
    var raport = '';
    var ikona = { ok: '✓', warn: '⚠', error: '✕', skip: '–' };

    function p(tekst, klasa) {
      var el = doc.createElement('p');
      el.className = 'settings-inline-note settings-backup-note' + (klasa ? ' ' + klasa : '');
      el.textContent = tekst;
      out.appendChild(el);
      return el;
    }
    function wyczysc() { while (out.firstChild) out.removeChild(out.firstChild); }

    btn.addEventListener('click', async function () {
      if (btn.disabled) return;
      btn.disabled = true;
      if (kopiuj) kopiuj.hidden = true;
      var etykieta = btn.textContent;
      btn.textContent = 'Testuję…';
      out.hidden = false;
      wyczysc();
      var stan = p('Sprawdzam połączenie z serwerem synchronizacji…');
      try {
        var r = await run({
          fetch: root.fetch ? root.fetch.bind(root) : null,
          online: !(root.navigator && root.navigator.onLine === false),
          workerUrl: root.VILDA_SYNC_WORKER_URL || zOknaGlownego('VILDA_SYNC_WORKER_URL') || DOMYSLNY_WORKER,
          realtime: zOknaGlownego('VildaRealtime'),
          syncActive: syncAktywna(),
          onProgress: function (etap, a, b) {
            stan.textContent = etap === 'health' ? 'Sprawdzam serwer synchronizacji (' + a + ' z ' + b + ')…'
              : 'Czekam na odpowiedź przez połączenie na żywo (' + a + ' z ' + b + ' s)…';
          },
        });
        wyczysc();
        var v = r.verdict;
        var tyt = p(ikona[v.level] + ' ' + v.title, v.level === 'ok' ? '' : 'settings-note-warn');
        tyt.style.fontWeight = '600';
        tyt.setAttribute('data-level', v.level);
        p(v.text);
        var wsLevel = { live: 'ok', 'became-live': 'ok', 'open-no-pong': 'warn', 'not-connected': 'warn', skipped: 'skip', unavailable: 'skip' }[r.ws.kind] || 'skip';
        var hiLevel = !r.history.attempts ? 'skip' : (r.history.drops >= 3 || (r.history.neverOpened && !r.history.opened)) ? 'warn' : 'ok';
        var lista = doc.createElement('ul');
        lista.className = 'settings-inline-note settings-backup-note';
        lista.style.cssText = 'margin:0.4rem 0;padding-left:0;list-style:none;overflow-wrap:anywhere;';
        [
          [r.online ? 'ok' : 'error', 'Internet w przeglądarce: ' + (r.online ? 'jest' : 'brak')],
          [r.health.level, 'Serwer synchronizacji: ' + healthOpis(r.health)],
          [wsLevel, 'Połączenie na żywo: ' + wsOpis(r.ws)],
          [hiLevel, 'Historia: ' + historiaOpis(r.history)],
        ].forEach(function (w) {
          var li = doc.createElement('li');
          li.textContent = ikona[w[0]] + ' ' + w[1];
          li.setAttribute('data-level', w[0]);
          lista.appendChild(li);
        });
        out.appendChild(lista);
        v.advice.forEach(function (a) { p('→ ' + a); });
        raport = buildReport(r, {
          time: new Date().toLocaleString('pl-PL'),
          origin: root.location ? root.location.origin : '',
          userAgent: root.navigator ? root.navigator.userAgent : '',
        });
        var det = doc.createElement('details');
        det.className = 'settings-inline-note settings-backup-note';
        det.style.marginBottom = '0.75rem';
        var sum = doc.createElement('summary');
        sum.textContent = 'Pokaż raport';
        var ta = doc.createElement('textarea');
        ta.id = 'syncConnTestReport';
        ta.readOnly = true;
        ta.rows = 10;
        ta.value = raport;
        ta.style.cssText = 'width:100%;box-sizing:border-box;font:0.75rem/1.4 monospace;margin-top:0.4rem;';
        det.appendChild(sum); det.appendChild(ta);
        out.appendChild(det);
        if (kopiuj) kopiuj.hidden = false;
      } catch (blad) {
        wyczysc();
        p('Nie udało się przeprowadzić testu: ' + (blad && blad.message ? blad.message : blad), 'settings-note-warn');
      } finally {
        btn.disabled = false;
        btn.textContent = etykieta;
      }
    });

    if (kopiuj) {
      kopiuj.addEventListener('click', async function () {
        if (!raport) return;
        var ok = false;
        try { if (root.navigator && root.navigator.clipboard) { await root.navigator.clipboard.writeText(raport); ok = true; } } catch (x) { ok = false; }
        if (!ok) {
          var ta = doc.getElementById('syncConnTestReport');
          if (ta) {
            try { ta.parentNode.open = true; ta.focus(); ta.select(); ok = doc.execCommand && doc.execCommand('copy'); } catch (x) { ok = false; }
          }
        }
        var stary = kopiuj.textContent;
        kopiuj.textContent = ok ? '✓ Skopiowano' : 'Zaznacz raport i skopiuj ręcznie';
        setTimeout(function () { kopiuj.textContent = stary; }, 2500);
      });
    }
    return true;
  }

  root.VildaSyncConnectionTest = {
    __vildaSyncConnectionTest: true,
    defaultWorkerUrl: DOMYSLNY_WORKER,
    formatDuration: formatDuration,
    classifyHealthSample: classifyHealthSample,
    summarizeHealth: summarizeHealth,
    analyzeHistory: analyzeHistory,
    verdict: verdict,
    buildReport: buildReport,
    run: run,
    mount: mount,
  };

  if (root.document && root.document.getElementById) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { mount(); });
    else mount();
  }
})(typeof window !== 'undefined' ? window : this);
