// E2-PR5a (P-SYNC-WIDOK-KOLEJKI; plan docs/SYNC_PRZYROSTOWA_PLAN.md wiersz 9a, decyzje właściciela 1–6 z 2026-11-12) —
// widok kolejki zdarzeń w Ustawieniach: znaczek „N zmian czeka” w nagłówku sekcji synchronizacji, linia w „Status
// synchronizacji”, ostatni błąd wysyłki i ukryty przełącznik „Wysyłaj zmiany pojedynczo (test)” odblokowywany
// 5 kliknięciami linii „Wersja aplikacji”. Kod jest blokiem w istniejącym inline_ustawienia_07.js (limit 600 żądań
// instalacji SW). Test wykonuje CAŁY prawdziwy plik w vm (kontekst = atrapa okna z elementami strony, sejfem z API
// kolejki i VildaSync). Dane fikcyjne.
//
// Przypadki:
//   KW1  uśpione: dziennik wyłączony — nic nowego nie widać, bez odczytu kolejki i bez pytania o health (także co 5 s).
//   KW2  licznik: pending + inflight — znaczek, linia, podpowiedź; lista wierszy czytana raz.
//   KW3  pusto: „Wszystkie zmiany wysłane.”, znaczek ukryty, bez listy wierszy i bez błędu.
//   KW4  formy liczebnika (1, 2–4, 5+, 12–14, 22–24).
//   KW5  ostatni błąd: najpóźniejszy wiersz pending/inflight ze znanym kodem; inne stany, kody sesji i złe daty pominięte.
//   KW5b porady przy AUTH_FAILED i EVENTS_DISABLED.   KW5c błąd znika, gdy nic nie czeka albo kodu nie ma na liście.
//   KW6  chwila: dziś, wczoraj (także przez granicę miesiąca), starsza; zła data — bez nawiasu.
//   KW7  odmowa i wyjątek kolejki — nic nowego; odmowa listy — sam licznik.
//   KW8  nowszy odczyt wygrywa (pokolenie).
//   KW9  odświeżanie: co 5 s tylko przy widocznej stronie; powrót karty; otwarcie sekcji; zmiana flagi w innej karcie.
//   KW10 sejf zablokowany: nic nowego, bez odczytu; blokada w trakcie chowa widok.
//   KW11 gest: 4 kliknięcia nic; 5 kliknięć w odstępach do 1,5 s — arkusz; dłuższa przerwa liczy od nowa;
//        przy zablokowanym sejfie bez arkusza.
//   KW12 arkusz: Anuluj, Escape i kliknięcie tła zamykają bez odblokowania (fokus wraca); Tab zostaje w arkuszu;
//        Odblokuj — karta widoczna, sekcja i opcje zaawansowane otwarte, przewinięcie i fokus na polu wyboru.
//   KW13 karta po odblokowaniu: serwer bez „events” — notka, bez pola wyboru; z „events” — pole wyboru, „Wyłączone”.
//   KW14 przełącznik: włączenie zapisuje '1', wyłączenie usuwa klucz (nigdy '0'); widok kolejki rusza od razu.
//   KW15 flaga '1' bez odblokowania — karta widoczna (da się wyłączyć), także bez „events” (notka + pole wyboru).
//   KW16 bez odblokowania i bez flagi, health z „events” — karta ukryta, bez pytania o health (decyzja 10).
//   KW17 flaga '1' i „events”, dziennik nieczynny (np. tryb chmurowy) — notka „Teraz nie działa…”.
//   KW18 zapis flagi rzuca — pole wyboru wraca, komunikat.
//   KW19 ramka powłoki — health okna nadrzędnego, nie własny.
//   KW20 blokada sejfu zdejmuje odblokowanie i zamyka otwarty arkusz.
//   KW21 okno bez document i strona bez nowych elementów — bez wyjątku i bez zegara.
//   KW22 strażniki źródła: blok między kłódką a linią wersji, cały plik ASCII, tylko textContent, zapis tylko flagi
//        dziennika; znaczniki w ustawienia.html (ukryte domyślnie, w swoich miejscach), bez nowego skryptu.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const PLIK = 'inline_ustawienia_07.js';
const KLUCZ = 'vilda-event-log-v1';

afterEach(() => { vi.useRealTimers(); });

// ── Atrapa DOM: tylko to, czego używa plik 07 ──
function element(dok, id, tag = 'div', pola = {}) {
  const sluchacze = new Map();
  const klasy = new Set();
  const e = {
    id, tagName: tag.toUpperCase(), textContent: '', hidden: false, open: false, checked: false, className: '',
    atrybuty: {}, dzieci: [], parentNode: null,
    classList: { add: (k) => klasy.add(k), remove: (k) => klasy.delete(k), contains: (k) => klasy.has(k) },
    addEventListener(t, f) { if (!sluchacze.has(t)) sluchacze.set(t, []); sluchacze.get(t).push(f); },
    wyslij(t, z = {}) { for (const f of sluchacze.get(t) || []) f(Object.assign({ target: e, preventDefault() {} }, z)); },
    setAttribute(k, v) { e.atrybuty[k] = String(v); },
    appendChild(c) { c.parentNode = e; e.dzieci.push(c); return c; },
    removeChild(c) { e.dzieci = e.dzieci.filter((x) => x !== c); c.parentNode = null; return c; },
    querySelector: () => null,
    focus() { dok.activeElement = e; },
    scrollIntoView: vi.fn(),
  };
  Object.defineProperty(e, 'innerHTML', { get() { throw new Error('innerHTML niedozwolone'); }, set() { throw new Error('innerHTML niedozwolone'); } });
  Object.defineProperty(e, 'style', { get() { throw new Error('style niedozwolone (P-STYLE)'); } });
  return Object.assign(e, pola);
}
// Wszystkie elementy (także dzieci arkusza) w głąb.
function wGlab(e, out = []) { out.push(e); for (const c of e.dzieci) wGlab(c, out); return out; }

function strona(o = {}) {
  const stan = {
    sejf: o.sejf !== undefined ? o.sejf : true,
    dziennik: o.dziennik !== undefined ? o.dziennik : true,
    liczniki: o.liczniki || { ok: true, pending: 0, inflight: 0, oversize: 0, unreadable: 0, rejected: 0, total: 0 },
    lista: o.lista || { ok: true, wiersze: [] },
    health: o.health !== undefined ? o.health : { features: ['changes-paged', 'aad', 'events'] },
  };
  const dok = { readyState: 'complete', visibilityState: 'visible', activeElement: null };
  const sluchaczeDok = new Map();
  const elementy = new Map();
  const dodaj = (id, tag, pola) => { const e = element(dok, id, tag, pola); elementy.set(id, e); return e; };
  if (!o.bezElementow) {
    dodaj('syncOutboxChipWrap', 'span', { hidden: true });
    dodaj('syncOutboxChip', 'span');
    dodaj('syncOutboxBox', 'div', { hidden: true });
    dodaj('syncOutboxCount', 'strong');
    dodaj('syncOutboxHint', 'span');
    dodaj('syncOutboxError', 'p', { hidden: true });
    dodaj('syncEventLogTestCard', 'div', { hidden: true });
    dodaj('syncEventLogTestTag', 'span', { textContent: '—' });
    dodaj('syncEventLogTestRow', 'div', { hidden: true });
    dodaj('syncEventLogTestToggle', 'input');
    dodaj('syncEventLogTestStatus', 'p');
    dodaj('settings-section-sync', 'details');
    dodaj('syncSlotCard', 'details');
  }
  dodaj('settingsAppVersion', 'p');
  const body = element(dok, null, 'body');
  Object.assign(dok, {
    body,
    getElementById: (id) => elementy.get(id) || null,
    querySelector: () => null,
    createElement: (tag) => element(dok, null, tag),
    addEventListener: (t, f) => { if (!sluchaczeDok.has(t)) sluchaczeDok.set(t, []); sluchaczeDok.get(t).push(f); },
  });
  const magazyn = new Map(o.flaga != null ? [[KLUCZ, o.flaga]] : []);
  const localStorage = {
    getItem: vi.fn((k) => (magazyn.has(k) ? magazyn.get(k) : null)),
    setItem: vi.fn((k, v) => { if (o.zapisRzuca) throw new Error('QuotaExceededError'); magazyn.set(k, String(v)); }),
    removeItem: vi.fn((k) => { if (o.zapisRzuca) throw new Error('SecurityError'); magazyn.delete(k); }),
  };
  const odblok = [], blok = [];
  const kolejka = {
    outboxCount: vi.fn(async () => (typeof stan.liczniki === 'function' ? stan.liczniki() : stan.liczniki)),
    outboxList: vi.fn(async () => (typeof stan.lista === 'function' ? stan.lista() : stan.lista)),
  };
  const VildaVault = {
    isUnlocked: () => stan.sejf,
    onUnlock: (f) => odblok.push(f),
    onLock: (f) => blok.push(f),
    _eventLog: kolejka,
  };
  const VildaSync = {
    isEventLogEnabled: vi.fn(() => stan.dziennik),
    detectApi: vi.fn(async () => stan.health),
  };
  const zegary = [];
  const sluchaczeOkna = new Map();
  const win = {
    document: o.bezDocument ? undefined : dok, VildaVault, VildaSync, localStorage, Date,
    setInterval: vi.fn((f, ms) => { zegary.push({ f, ms }); return zegary.length; }),
    setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    addEventListener: (t, f) => { if (!sluchaczeOkna.has(t)) sluchaczeOkna.set(t, []); sluchaczeOkna.get(t).push(f); },
  };
  win.window = win;
  win.top = o.top || win;
  // Okno bez document (jak w powloka-ustawienia-konto): kłódka z tego samego pliku czyta globalny document, a bloki
  // z (window) — window.document (brak).
  const kontekst = o.bezDocument ? { window: win, document: dok } : win;
  vm.createContext(kontekst);
  vm.runInContext(czytaj(PLIK), kontekst, { filename: PLIK });
  const el = (id) => elementy.get(id);
  return {
    win, dok, el, stan, kolejka, VildaSync, magazyn, localStorage, zegary,
    api: win.VildaWidokKolejki,
    odblokuj() { stan.sejf = true; odblok.forEach((f) => f()); },
    zablokuj() { stan.sejf = false; blok.forEach((f) => f()); },
    tik() { zegary.forEach((z) => z.f()); },
    dok_wyslij(t) { for (const f of sluchaczeDok.get(t) || []) f({}); },
    okno_wyslij(t, e) { for (const f of sluchaczeOkna.get(t) || []) f(e); },
    arkusz() { return body.dzieci.find((d) => String(d.className).includes('vilda-auth-overlay-sheet')) || null; },
    przycisk(tekst) { const a = this.arkusz(); return a ? wGlab(a).find((d) => d.tagName === 'BUTTON' && d.textContent === tekst) : null; },
    body,
  };
}
const tury = async (n = 12) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const ile = (p, n) => ({ ok: true, pending: p, inflight: n || 0, oversize: 0, unreadable: 0, rejected: 0, total: p + (n || 0) });
function kliknij(s, n, odstepMs = 200) {
  for (let i = 0; i < n; i++) {
    if (i) vi.advanceTimersByTime(odstepMs);
    s.el('settingsAppVersion').wyslij('click');
  }
}
const widoczny = (s) => ({
  znaczek: s.el('syncOutboxChipWrap').hidden ? null : s.el('syncOutboxChip').textContent,
  linia: s.el('syncOutboxBox').hidden ? null : `${s.el('syncOutboxCount').textContent}|${s.el('syncOutboxHint').textContent}`,
  blad: s.el('syncOutboxError').hidden ? null : s.el('syncOutboxError').textContent,
  karta: !s.el('syncEventLogTestCard').hidden,
});

describe('E2-PR5a P-SYNC-WIDOK-KOLEJKI: licznik, znaczek i ostatni błąd', () => {
  it('KW1: dziennik wyłączony — nic nowego, bez odczytu kolejki i bez pytania o health (także co 5 s)', async () => {
    const s = strona({ dziennik: false, liczniki: ile(3) });
    await tury();
    s.tik(); s.tik(); s.tik();
    await tury();
    expect(widoczny(s)).toEqual({ znaczek: null, linia: null, blad: null, karta: false });
    expect(s.kolejka.outboxCount).not.toHaveBeenCalled();
    expect(s.kolejka.outboxList).not.toHaveBeenCalled();
    expect(s.VildaSync.detectApi).not.toHaveBeenCalled();
    expect(s.localStorage.setItem).not.toHaveBeenCalled();
    expect(s.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('KW2: pending + inflight — znaczek, linia z podpowiedzią; lista wierszy czytana raz', async () => {
    const s = strona({ liczniki: ile(2, 1) });
    await tury();
    expect(widoczny(s)).toEqual({
      znaczek: '3 zmiany czekają',
      linia: '3 zmiany czekają na wysłanie.|Wysyłają się same, zwykle w ciągu kilku sekund.',
      blad: null, karta: false,
    });
    expect(s.kolejka.outboxCount).toHaveBeenCalledTimes(1);
    expect(s.kolejka.outboxList).toHaveBeenCalledTimes(1);
    expect(s.kolejka.outboxList).toHaveBeenCalledWith();
  });

  it('KW3: pusto — „Wszystkie zmiany wysłane.”, znaczek ukryty, bez listy i bez błędu', async () => {
    const s = strona({ liczniki: ile(0) });
    await tury();
    expect(widoczny(s)).toEqual({ znaczek: null, linia: 'Wszystkie zmiany wysłane.|', blad: null, karta: false });
    expect(s.kolejka.outboxList).not.toHaveBeenCalled();
  });

  it('KW4: formy liczebnika', () => {
    const { api } = strona();
    const z = (n) => api.tekstZnaczka(n);
    expect([1, 2, 3, 4, 5, 11, 12, 13, 14, 21, 22, 24, 25, 101, 102, 112, 122].map(z)).toEqual([
      '1 zmiana czeka', '2 zmiany czekają', '3 zmiany czekają', '4 zmiany czekają', '5 zmian czeka', '11 zmian czeka',
      '12 zmian czeka', '13 zmian czeka', '14 zmian czeka', '21 zmian czeka', '22 zmiany czekają', '24 zmiany czekają',
      '25 zmian czeka', '101 zmian czeka', '102 zmiany czekają', '112 zmian czeka', '122 zmiany czekają',
    ]);
    expect(api.tekstLicznika(1)).toBe('1 zmiana czeka na wysłanie.');
    expect(api.tekstPodpowiedzi(1)).toBe('Wysyła się sama, zwykle w ciągu kilku sekund.');
    expect(api.tekstPodpowiedzi(5)).toBe('Wysyłają się same, zwykle w ciągu kilku sekund.');
    expect(api.tekstLicznika(0)).toBe('Wszystkie zmiany wysłane.');
    expect(api.tekstPodpowiedzi(0)).toBe('');
  });

  it('KW5: ostatni błąd — najpóźniejszy pending/inflight ze znanym kodem; inne stany, kody sesji i złe daty pominięte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 13, 5));
    const t = (h, m) => new Date(2026, 10, 12, h, m).toISOString();
    const wiersze = [
      { state: 'pending', lastError: 'NETWORK', lastAttemptAtISO: t(12, 30) },
      { state: 'inflight', lastError: 'TIMEOUT', lastAttemptAtISO: t(12, 41) },
      { state: 'rejected', lastError: 'invalid', lastAttemptAtISO: t(12, 50) },
      { state: 'oversize', lastError: 'NETWORK', lastAttemptAtISO: t(12, 51) },
      { state: 'pending', lastError: 'SESJA', lastAttemptAtISO: t(12, 55) },
      { state: 'pending', lastError: 'ZABLOKOWANY', lastAttemptAtISO: t(12, 56) },
      { state: 'pending', lastError: 'NETWORK', lastAttemptAtISO: 'wczoraj' },
      { state: 'pending', lastError: null, lastAttemptAtISO: t(12, 58) },
      { state: 'pending', lastError: 'toString', lastAttemptAtISO: t(12, 59) },
      null,
    ];
    const s = strona({ liczniki: ile(7, 1), lista: { ok: true, wiersze } });
    await tury();
    expect(widoczny(s).blad).toBe('Ostatni błąd (dziś 12:41): serwer nie odpowiedział na czas. Aplikacja spróbuje ponownie sama.');
    expect(s.api.ostatniBlad(wiersze)).toEqual({ kod: 'TIMEOUT', at: t(12, 41) });
  });

  it('KW5b: porady przy AUTH_FAILED i EVENTS_DISABLED', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 13, 5));
    const { api } = strona();
    const at = new Date(2026, 10, 12, 9, 7).toISOString();
    expect(api.tekstBledu({ kod: 'AUTH_FAILED', at })).toBe('Ostatni błąd (dziś 09:07): serwer nie rozpoznał tego urządzenia. Wysyłanie ruszy po ponownym zalogowaniu.');
    expect(api.tekstBledu({ kod: 'EVENTS_DISABLED', at })).toBe('Ostatni błąd (dziś 09:07): serwer nie przyjmuje teraz pojedynczych zmian. Pełna synchronizacja działa dalej.');
    expect(api.tekstBledu({ kod: 'NETWORK', at })).toBe('Ostatni błąd (dziś 09:07): brak połączenia z serwerem. Aplikacja spróbuje ponownie sama.');
    expect(api.tekstBledu({ kod: 'LOG_FULL', at })).toBe('Ostatni błąd (dziś 09:07): dziennik zmian na serwerze jest pełny. Aplikacja spróbuje ponownie sama.');
    expect(api.tekstBledu({ kod: 'SESJA', at })).toBe('');
    expect(api.tekstBledu(null)).toBe('');
  });

  it('KW5c: błąd znika, gdy nic nie czeka, i nie pojawia się przy kodzie spoza listy', async () => {
    const at = new Date().toISOString();
    const s = strona({ liczniki: ile(1), lista: { ok: true, wiersze: [{ state: 'pending', lastError: 'NETWORK', lastAttemptAtISO: at }] } });
    await tury();
    expect(widoczny(s).blad).toMatch(/^Ostatni błąd \(dziś \d\d:\d\d\): brak połączenia z serwerem\./);
    s.stan.liczniki = ile(0);
    s.tik();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: null, linia: 'Wszystkie zmiany wysłane.|', blad: null });
    s.stan.liczniki = ile(1);
    s.stan.lista = { ok: true, wiersze: [{ state: 'pending', lastError: 'W-LOCIE', lastAttemptAtISO: at }] };
    s.tik();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: '1 zmiana czeka', blad: null });
  });

  it('KW6: chwila — dziś, wczoraj (przez granicę miesiąca), starsza; zła data bez nawiasu', () => {
    const { api } = strona();
    const teraz = new Date(2026, 11, 1, 8, 0).getTime();
    expect(api.kiedy(new Date(2026, 11, 1, 7, 5).toISOString(), teraz)).toBe('dziś 07:05');
    expect(api.kiedy(new Date(2026, 10, 30, 23, 59).toISOString(), teraz)).toBe('wczoraj 23:59');
    expect(api.kiedy(new Date(2026, 10, 29, 18, 2).toISOString(), teraz)).toBe('29.11.2026, 18:02');
    expect(api.kiedy(new Date(2025, 0, 2, 3, 4).toISOString(), teraz)).toBe('02.01.2025, 03:04');
    expect(api.kiedy('nie-data', teraz)).toBeNull();
    expect(api.kiedy(123, teraz)).toBeNull();
    expect(api.tekstBledu({ kod: 'SERVER', at: 'nie-data' }, teraz)).toBe('Ostatni błąd: błąd serwera. Aplikacja spróbuje ponownie sama.');
  });

  it('KW7: odmowa i wyjątek kolejki — nic nowego; odmowa listy — sam licznik', async () => {
    const s = strona({ liczniki: { ok: false, powod: 'bramka' } });
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: null, linia: null, blad: null });
    s.stan.liczniki = () => { throw new Error('IDB'); };
    s.tik();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: null, linia: null, blad: null });
    s.stan.liczniki = ile(2);
    s.stan.lista = { ok: false, powod: 'sesja' };
    s.tik();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: '2 zmiany czekają', blad: null });
    s.stan.lista = () => { throw new Error('IDB'); };
    s.tik();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: '2 zmiany czekają', blad: null });
  });

  it('KW8: nowszy odczyt wygrywa', async () => {
    let pusc;
    const s = strona({ liczniki: ile(0) });
    await tury();
    s.stan.liczniki = () => new Promise((r) => { pusc = () => r(ile(5)); });
    const stary = s.api.odswiez();
    s.stan.liczniki = ile(1);
    await s.api.odswiez();
    expect(widoczny(s).znaczek).toBe('1 zmiana czeka');
    pusc();
    expect(await stary).toBeNull();
    await tury();
    expect(widoczny(s).znaczek).toBe('1 zmiana czeka');
    // Stary odczyt kończy się zaraz po liczniku — bez czytania listy wierszy.
    expect(s.kolejka.outboxList).toHaveBeenCalledTimes(1);
  });

  it('KW9: odświeżanie — co 5 s przy widocznej stronie, powrót karty, otwarcie sekcji, zmiana flagi w innej karcie', async () => {
    const s = strona({ liczniki: ile(0) });
    await tury();
    expect(s.zegary.map((z) => z.ms)).toEqual([5000]);
    const n0 = s.kolejka.outboxCount.mock.calls.length;
    s.dok.visibilityState = 'hidden';
    s.tik();
    await tury();
    expect(s.kolejka.outboxCount).toHaveBeenCalledTimes(n0);
    s.stan.liczniki = ile(4);
    s.dok.visibilityState = 'visible';
    s.dok_wyslij('visibilitychange');
    await tury();
    expect(widoczny(s).znaczek).toBe('4 zmiany czekają');
    s.stan.liczniki = ile(5);
    s.tik();
    await tury();
    expect(widoczny(s).znaczek).toBe('5 zmian czeka');
    const sek = s.el('settings-section-sync');
    s.stan.liczniki = ile(6);
    sek.open = false;
    sek.wyslij('toggle');
    await tury();
    expect(widoczny(s).znaczek).toBe('5 zmian czeka');
    sek.open = true;
    sek.wyslij('toggle');
    await tury();
    expect(widoczny(s).znaczek).toBe('6 zmian czeka');
    s.stan.liczniki = ile(7);
    s.okno_wyslij('storage', { key: 'inny-klucz' });
    await tury();
    expect(widoczny(s).znaczek).toBe('6 zmian czeka');
    s.okno_wyslij('storage', { key: KLUCZ });
    await tury();
    expect(widoczny(s).znaczek).toBe('7 zmian czeka');
  });

  it('KW10: sejf zablokowany — nic nowego, bez odczytu; blokada w trakcie chowa widok', async () => {
    const s = strona({ sejf: false, liczniki: ile(2) });
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: null, linia: null });
    expect(s.kolejka.outboxCount).not.toHaveBeenCalled();
    s.odblokuj();
    await tury();
    expect(widoczny(s).znaczek).toBe('2 zmiany czekają');
    s.zablokuj();
    await tury();
    expect(widoczny(s)).toMatchObject({ znaczek: null, linia: null, blad: null });
  });
});

describe('E2-PR5a P-SYNC-WIDOK-KOLEJKI: ukryty przełącznik „Wysyłaj zmiany pojedynczo (test)”', () => {
  it('KW11: gest — 4 kliknięcia nic; 5 w odstępach do 1,5 s — arkusz; dłuższa przerwa od nowa; zablokowany sejf bez arkusza', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false });
    await tury();
    kliknij(s, 4);
    expect(s.arkusz()).toBeNull();
    vi.advanceTimersByTime(1501);
    kliknij(s, 4, 1500);
    expect(s.arkusz()).toBeNull();
    vi.advanceTimersByTime(1600);
    kliknij(s, 5, 1500);
    const a = s.arkusz();
    expect(a).not.toBeNull();
    const ark = a.dzieci[0];
    expect(ark.atrybuty).toMatchObject({ role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'syncEventLogUnlockTitle' });
    expect(wGlab(a).map((e) => e.textContent).filter(Boolean)).toEqual([
      'Odblokować opcje testowe?',
      'Na tym urządzeniu pokaże się przełącznik „Wysyłaj zmiany pojedynczo (test)” w opcjach zaawansowanych synchronizacji. Nikt inny go nie zobaczy.',
      'Odblokuj', 'Anuluj',
    ]);
    expect(s.body.classList.contains('vilda-modal-alert-open')).toBe(true);
    expect(s.dok.activeElement).toBe(s.przycisk('Odblokuj'));
    kliknij(s, 5);
    expect(s.body.dzieci).toHaveLength(1);

    const z = strona({ sejf: false, dziennik: false });
    await tury();
    kliknij(z, 5);
    expect(z.arkusz()).toBeNull();
    expect(z.VildaSync.detectApi).not.toHaveBeenCalled();
  });

  it('KW12: arkusz — Anuluj, Escape i tło zamykają bez odblokowania; Tab w arkuszu; Odblokuj otwiera kartę', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false });
    await tury();
    const przed = s.el('settingsAppVersion');
    przed.focus();
    kliknij(s, 5);
    s.przycisk('Anuluj').wyslij('click');
    expect(s.arkusz()).toBeNull();
    expect(s.body.classList.contains('vilda-modal-alert-open')).toBe(false);
    expect(s.dok.activeElement).toBe(przed);
    await tury();
    expect(widoczny(s).karta).toBe(false);

    vi.advanceTimersByTime(2000);
    kliknij(s, 5);
    const a = s.arkusz();
    a.wyslij('keydown', { key: 'Tab' });
    expect(s.dok.activeElement).toBe(s.przycisk('Anuluj'));
    a.wyslij('keydown', { key: 'Tab', shiftKey: true });
    expect(s.dok.activeElement).toBe(s.przycisk('Odblokuj'));
    a.wyslij('keydown', { key: 'Escape' });
    expect(s.arkusz()).toBeNull();

    vi.advanceTimersByTime(2000);
    kliknij(s, 5);
    const b = s.arkusz();
    // Kliknięcie wewnątrz arkusza dochodzi do tła (bąbelkowanie) z celem w arkuszu — bez zamknięcia.
    b.wyslij('click', { target: b.dzieci[0] });
    expect(s.arkusz()).not.toBeNull();
    b.wyslij('click', { target: b });
    expect(s.arkusz()).toBeNull();
    await tury();
    expect(widoczny(s).karta).toBe(false);
    expect(s.VildaSync.detectApi).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    kliknij(s, 5);
    s.przycisk('Odblokuj').wyslij('click');
    expect(s.arkusz()).toBeNull();
    await tury();
    expect(widoczny(s).karta).toBe(true);
    expect(s.el('settings-section-sync').open).toBe(true);
    expect(s.el('syncSlotCard').open).toBe(true);
    expect(s.el('syncEventLogTestCard').scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(s.dok.activeElement).toBe(s.el('syncEventLogTestToggle'));
    // Ponowny gest po odblokowaniu: bez arkusza, karta pokazana jeszcze raz.
    vi.advanceTimersByTime(2000);
    kliknij(s, 5);
    expect(s.arkusz()).toBeNull();
    await tury();
    expect(s.el('syncEventLogTestCard').scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('KW13: karta po odblokowaniu — bez „events” notka bez pola wyboru; z „events” pole wyboru „Wyłączone”', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false, health: { features: ['changes-paged', 'aad'] } });
    await tury();
    kliknij(s, 5);
    s.przycisk('Odblokuj').wyslij('click');
    await tury();
    expect(widoczny(s).karta).toBe(true);
    expect(s.el('syncEventLogTestRow').hidden).toBe(true);
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Serwer nie obsługuje jeszcze tej opcji.');
    expect(s.el('syncEventLogTestTag').textContent).toBe('Wyłączone');
    expect(s.dok.activeElement).not.toBe(s.el('syncEventLogTestToggle'));

    s.stan.health = { features: ['changes-paged', 'aad', 'events'] };
    await s.api.karta();
    expect(s.el('syncEventLogTestRow').hidden).toBe(false);
    expect(s.el('syncEventLogTestToggle').checked).toBe(false);
    expect(s.el('syncEventLogTestStatus').textContent).toBe('');
    s.stan.health = null;
    await s.api.karta();
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Serwer nie obsługuje jeszcze tej opcji.');
    s.VildaSync.detectApi.mockRejectedValueOnce(new Error('siec'));
    await s.api.karta();
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Serwer nie obsługuje jeszcze tej opcji.');
  });

  it("KW14: przełącznik — włączenie zapisuje '1', wyłączenie usuwa klucz (nigdy '0'); widok kolejki rusza od razu", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false, liczniki: ile(0) });
    await tury();
    kliknij(s, 5);
    s.przycisk('Odblokuj').wyslij('click');
    await tury();
    const pole = s.el('syncEventLogTestToggle');
    pole.checked = true;
    s.stan.dziennik = true;
    pole.wyslij('change');
    await tury();
    expect(s.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(KLUCZ, '1');
    expect(s.magazyn.get(KLUCZ)).toBe('1');
    expect(s.el('syncEventLogTestTag').textContent).toBe('Włączone');
    expect(widoczny(s).linia).toBe('Wszystkie zmiany wysłane.|');
    pole.checked = false;
    s.stan.dziennik = false;
    pole.wyslij('change');
    await tury();
    expect(s.localStorage.removeItem).toHaveBeenCalledExactlyOnceWith(KLUCZ);
    expect(s.magazyn.has(KLUCZ)).toBe(false);
    expect(s.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(s.el('syncEventLogTestTag').textContent).toBe('Wyłączone');
    expect(widoczny(s)).toMatchObject({ linia: null, karta: true });
  });

  it("KW15: flaga '1' bez odblokowania — karta widoczna, także bez „events” (pole wyboru do wyłączenia i notka)", async () => {
    const s = strona({ flaga: '1', dziennik: false, health: { features: ['changes-paged'] } });
    await tury();
    expect(widoczny(s).karta).toBe(true);
    expect(s.el('syncEventLogTestRow').hidden).toBe(false);
    expect(s.el('syncEventLogTestToggle').checked).toBe(true);
    expect(s.el('syncEventLogTestTag').textContent).toBe('Włączone');
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Serwer nie obsługuje jeszcze tej opcji.');
    const pole = s.el('syncEventLogTestToggle');
    pole.checked = false;
    pole.wyslij('change');
    await tury();
    // Po wyłączeniu bez odblokowania karta znika (decyzja 3).
    expect(s.magazyn.has(KLUCZ)).toBe(false);
    expect(widoczny(s).karta).toBe(false);
  });

  it('KW16: bez odblokowania i bez flagi, health z „events” — karta ukryta, bez pytania o health', async () => {
    const s = strona({ dziennik: false });
    await tury();
    s.tik(); s.tik();
    s.dok_wyslij('visibilitychange');
    s.odblokuj();
    await tury();
    expect(widoczny(s).karta).toBe(false);
    expect(s.VildaSync.detectApi).not.toHaveBeenCalled();
    s.magazyn.set(KLUCZ, '0');
    s.tik();
    await tury();
    expect(widoczny(s).karta).toBe(false);
    expect(s.VildaSync.detectApi).not.toHaveBeenCalled();
  });

  it("KW17: flaga '1' i „events”, dziennik nieczynny — notka „Teraz nie działa…”", async () => {
    const s = strona({ flaga: '1', dziennik: false });
    await tury();
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Teraz nie działa: potrzebna jest włączona synchronizacja, bez trybu chmurowego i bez logowania jednorazowego.');
    s.stan.dziennik = true;
    s.tik();
    await tury();
    expect(s.el('syncEventLogTestStatus').textContent).toBe('');
    expect(widoczny(s).linia).toBe('Wszystkie zmiany wysłane.|');
  });

  it('KW18: zapis flagi rzuca — pole wyboru wraca, komunikat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false, zapisRzuca: true });
    await tury();
    kliknij(s, 5);
    s.przycisk('Odblokuj').wyslij('click');
    await tury();
    const pole = s.el('syncEventLogTestToggle');
    pole.checked = true;
    pole.wyslij('change');
    await tury();
    expect(pole.checked).toBe(false);
    expect(s.magazyn.has(KLUCZ)).toBe(false);
    expect(s.el('syncEventLogTestStatus').textContent).toBe('Nie udało się zapisać tego ustawienia na tym urządzeniu.');
  });

  it('KW19: ramka powłoki — health okna nadrzędnego, nie własny', async () => {
    const top = { VildaSync: { detectApi: vi.fn(async () => ({ features: ['events'] })) } };
    const s = strona({ flaga: '1', top, health: { features: [] } });
    await tury();
    expect(top.VildaSync.detectApi).toHaveBeenCalled();
    expect(s.VildaSync.detectApi).not.toHaveBeenCalled();
    expect(s.el('syncEventLogTestStatus').textContent).toBe('');
  });

  it('KW20: blokada sejfu zdejmuje odblokowanie i zamyka otwarty arkusz', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = strona({ dziennik: false });
    await tury();
    kliknij(s, 5);
    s.przycisk('Odblokuj').wyslij('click');
    await tury();
    expect(widoczny(s).karta).toBe(true);
    s.zablokuj();
    await tury();
    expect(widoczny(s).karta).toBe(false);
    s.odblokuj();
    await tury();
    expect(widoczny(s).karta).toBe(false);
    vi.advanceTimersByTime(2000);
    kliknij(s, 5);
    expect(s.arkusz()).not.toBeNull();
    s.zablokuj();
    expect(s.arkusz()).toBeNull();
    expect(s.body.classList.contains('vilda-modal-alert-open')).toBe(false);
    await tury();
    expect(widoczny(s).karta).toBe(false);
  });

  it('KW21: okno bez document i strona bez nowych elementów — bez wyjątku i bez zegara', async () => {
    const a = strona({ bezDocument: true });
    await tury();
    expect(a.zegary).toHaveLength(0);
    expect(a.kolejka.outboxCount).not.toHaveBeenCalled();
    const b = strona({ bezElementow: true });
    await tury();
    expect(b.zegary).toHaveLength(0);
    expect(b.kolejka.outboxCount).not.toHaveBeenCalled();
    expect(await b.api.odswiez()).toBeNull();
    expect(await b.api.karta()).toBeNull();
  });
});

describe('E2-PR5a P-SYNC-WIDOK-KOLEJKI: strażniki źródła', () => {
  const START = '/* P-SYNC-WIDOK-KOLEJKI (';
  const KONIEC = '/* /P-SYNC-WIDOK-KOLEJKI */';
  const zrodlo = czytaj(PLIK);
  const blok = () => zrodlo.slice(zrodlo.indexOf(START), zrodlo.indexOf(KONIEC) + KONIEC.length);
  const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

  it('KW22a: blok między kłódką a linią wersji; cały plik ASCII; tylko textContent; zapis tylko flagi dziennika', () => {
    expect(zrodlo.split(START).length).toBe(2);
    expect(zrodlo.split(KONIEC).length).toBe(2);
    expect(zrodlo.indexOf(START)).toBeGreaterThan(zrodlo.indexOf('var f=['));
    expect(zrodlo.indexOf(KONIEC)).toBeLessThan(zrodlo.indexOf('/* P-WERSJA-APLIKACJI ('));
    expect(zrodlo).toMatch(/^[\x00-\x7F]*$/); // eslint-disable-line no-control-regex -- strażnik ASCII
    const kod = bezKomentarzy(blok());
    expect(kod).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\bfetch\(|sessionStorage|caches\b|\.style\b|cssText|setProperty/);
    expect(kod).not.toMatch(/(^|[^.\w])(document|navigator)\b/);
    expect(kod.match(/localStorage\.(setItem|removeItem)\([^)]*\)/g)).toEqual([
      "localStorage.setItem(Bkw_KLUCZ, '1')", 'localStorage.removeItem(Bkw_KLUCZ)',
    ]);
    expect(kod).toMatch(/var Bkw_KLUCZ = 'vilda-event-log-v1';/);
    expect(kod).toMatch(/\(window\);\s*$/);
    // Z kolejki wyłącznie odczyty (bez zmian stanu wierszy i bez wysyłki).
    expect([...new Set(kod.match(/\bL\.\w+/g))].sort()).toEqual(['L.outboxCount', 'L.outboxList']);
    expect(kod).not.toMatch(/outbox(Take|Accept|Reject|Fail|Discard|RequeueStale)|quarantine|flushOutbox|scheduleFlush|pushEvents|enqueue/);
  });

  it('KW22b: ustawienia.html — znaczniki ukryte domyślnie, w swoich miejscach; bez nowego skryptu', () => {
    const html = czytaj('ustawienia.html');
    const sekcja = html.slice(html.indexOf('<details class="settings-accordion" id="settings-section-sync">'), html.indexOf('<!-- ══ /Synchronizacja'));
    const meta = sekcja.slice(sekcja.indexOf('<div class="settings-accordion-meta">'), sekcja.indexOf('</summary>'));
    expect(meta).toContain('<span id="syncOutboxChipWrap" hidden><span class="settings-mini-chip" id="syncOutboxChip"></span></span>');
    const status = sekcja.slice(sekcja.indexOf('id="syncStatusCard"'), sekcja.indexOf('id="syncNewDeviceCard"'));
    expect(status).toMatch(/<div id="syncOutboxBox" hidden>\s*<p class="settings-inline-note settings-backup-note" id="syncOutboxNote" aria-live="polite"><strong id="syncOutboxCount"><\/strong> <span id="syncOutboxHint"><\/span><\/p>\s*<p class="settings-inline-note settings-backup-note settings-note-warn" id="syncOutboxError" hidden><\/p>\s*<\/div>/);
    expect(status.indexOf('id="syncOutboxBox"')).toBeGreaterThan(status.indexOf('id="syncStatusNote"'));
    const zaaw = sekcja.slice(sekcja.indexOf('id="syncSlotCard"'), sekcja.indexOf('</details>', sekcja.indexOf('id="syncSlotCard"')));
    expect(zaaw).toMatch(/<div id="syncEventLogTestCard" hidden>/);
    expect(zaaw).toMatch(/<div id="syncEventLogTestRow" hidden>\s*<div class="settings-card-toggle-row settings-backup-btn-row">/);
    // Bez stylów wpisanych wprost (P-STYLE krok 5b): widoczność tylko atrybutem hidden.
    expect(sekcja.slice(sekcja.indexOf('id="syncOutboxBox"'), sekcja.indexOf('id="syncNewDeviceCard"'))).not.toContain('style=');
    expect(zaaw.slice(zaaw.indexOf('id="syncEventLogTestCard"'))).not.toContain('style=');
    expect(meta.slice(meta.indexOf('syncOutboxChipWrap'))).not.toContain('style=');
    expect(zaaw).toContain('<input type="checkbox" id="syncEventLogTestToggle" class="settings-backup-checkbox">');
    expect(zaaw).toMatch(/Wysyłaj zmiany pojedynczo \(test\)\s*<\/label>/);
    for (const id of ['syncOutboxChipWrap', 'syncOutboxChip', 'syncOutboxBox', 'syncOutboxCount', 'syncOutboxHint', 'syncOutboxError',
      'syncEventLogTestCard', 'syncEventLogTestTag', 'syncEventLogTestRow', 'syncEventLogTestToggle', 'syncEventLogTestStatus']) {
      expect(html.split(`id="${id}"`).length, id).toBe(2);
    }
    const skrypty = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((m) => m[1]);
    expect(skrypty.at(-1)).toBe('inline_ustawienia_07.js');
    expect(skrypty.filter((s) => /widok|kolejk/i.test(s))).toEqual([]);
  });
});
