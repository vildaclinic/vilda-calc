import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLIK = 'vilda_version_history_ui.js';

// Historia wersji karty pacjenta pokazywała godziny UTC. Sejf zapisuje `savedAtISO` przez
// `new Date().toISOString()` (zawsze „Z"), a lista wersji wycinała z tego ciągu HH:MM i dzień
// regexem — bez konwersji na strefę użytkownika. Lekarz zapisujący kartę o 8:10 w Polsce
// widział „06:07, 06:09, …", a zapisy po 22:00 czasu lokalnego wpadały do „wczorajszej" grupy
// dnia. Reszta aplikacji (kosz zapisów, lista pacjentów) formatuje czas przez `new Date(iso)`
// w strefie lokalnej — ten test przypina historię wersji do tej samej reguły.
//
// Testy wołają REALNE funkcje wycięte z pliku produkcyjnego (konwencja wytnij() z
// format-sds-zero.test.mjs), nie ich kopie. Plik jest zminifikowany, więc wycinamy
// cały blok czystych funkcji od `function _(t)` do `function W(t){` — K (budowa listy),
// w (wybór chwili), rt (klucz dnia), S (etykieta dnia), C (godzina) i ich pomocniki.
// Blok nie dotyka DOM ani `window`, więc wykonuje się w gołym Node.

const STREFA_BAZOWA = process.env.TZ;

function zrodlo() {
  return fs.readFileSync(path.join(korzen, PLIK), 'utf8');
}

function wytnijBlok(src, od, doTekstu) {
  const start = src.indexOf(od);
  expect(start, `${PLIK}: nie znaleziono ${od}`).toBeGreaterThan(-1);
  const end = src.indexOf(doTekstu, start);
  expect(end, `${PLIK}: nie znaleziono końca ${doTekstu}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

function historia() {
  const src = zrodlo();
  const blok = wytnijBlok(src, 'function _(t)', 'function W(t){');
  // Kontrola, że wycinek naprawdę niesie wszystkie funkcje, które mierzymy.
  for (const nazwa of ['function K(t)', 'function w(t)', 'function rt(t)', 'function S(t)', 'function C(t)']) {
    expect(blok, `wycinek zawiera ${nazwa}`).toContain(nazwa);
  }
  return new Function(`${blok}\nreturn { K: K, w: w, rt: rt, S: S, C: C };`)();
}

// Dwie chwile zapisu (UTC) po obu stronach północy lokalnej w Polsce:
//  • 06:07:12Z 7 X 2026 — w CEST to 08:07 tego samego dnia (zgłoszenie: „robiłem ok. 8:10,
//    historia pokazuje 06:07");
//  • 22:30:00Z 6 X 2026 — w CEST to 00:30 JUŻ 7 X (inny dzień lokalny niż UTC).
const RANO_Z = '2026-10-07T06:07:12.345Z';
const PRZED_POLNOCA_Z = '2026-10-06T22:30:00.000Z';

describe('Historia wersji — czas lokalny z ISO UTC', () => {
  afterEach(() => {
    process.env.TZ = STREFA_BAZOWA;
  });

  // [strefa, oczekiwany getTimezoneOffset() 7 X 2026, godzina i etykieta 06:07Z, godzina/etykieta/klucz 22:30Z]
  it.each([
    ['Europe/Warsaw', -120, '08:07', '7 października 2026', '00:30', '7 października 2026', '2026-10-07'],
    ['America/New_York', 240, '02:07', '7 października 2026', '18:30', '6 października 2026', '2026-10-06'],
    ['UTC', 0, '06:07', '7 października 2026', '22:30', '6 października 2026', '2026-10-06'],
  ])(
    'godzina, etykieta dnia i klucz dnia liczone w strefie lokalnej (%s)',
    (strefa, offset, godzRano, dzienRano, godzNoc, dzienNoc, kluczNoc) => {
      process.env.TZ = strefa;
      // Bramka: zmiana strefy naprawdę zadziałała w tym procesie.
      expect(new Date(RANO_Z).getTimezoneOffset()).toBe(offset);
      const h = historia();

      expect(h.C(RANO_Z)).toBe(godzRano);
      expect(h.S(RANO_Z)).toBe(dzienRano);
      expect(h.rt(RANO_Z)).toBe('2026-10-07');

      expect(h.C(PRZED_POLNOCA_Z)).toBe(godzNoc);
      expect(h.S(PRZED_POLNOCA_Z)).toBe(dzienNoc);
      expect(h.rt(PRZED_POLNOCA_Z)).toBe(kluczNoc);
    },
  );

  it('godzina i minuta są zawsze dwucyfrowe', () => {
    process.env.TZ = 'Europe/Warsaw';
    const h = historia();
    // 03:05Z → 05:05 CEST; 22:00Z 6 X → 00:00 7 X.
    expect(h.C('2026-10-07T03:05:00.000Z')).toBe('05:05');
    expect(h.C('2026-10-06T22:00:00.000Z')).toBe('00:00');
    expect(h.rt('2026-01-01T00:30:00.000Z')).toBe('2026-01-01');
    expect(h.S('2026-01-01T00:30:00.000Z')).toBe('1 stycznia 2026');
  });

  it('ISO z jawnym przesunięciem strefy jest przeliczane tak samo jak „Z"', () => {
    process.env.TZ = 'Europe/Warsaw';
    const h = historia();
    // 08:07+02:00 to ta sama chwila co 06:07Z.
    expect(h.C('2026-10-07T08:07:12+02:00')).toBe('08:07');
    expect(h.C('2026-10-07T01:07:12-05:00')).toBe('08:07');
    expect(h.S('2026-10-07T01:07:12-05:00')).toBe('7 października 2026');
  });

  it('ciąg nie-ISO, sama data, pusty i null — dotychczasowe zachowanie bez wyjątku', () => {
    process.env.TZ = 'America/New_York';
    const h = historia();
    // Sama data (bez „T") NIE jest przepuszczana przez Date — `new Date("2026-10-07")`
    // to północ UTC, czyli w Nowym Jorku jeszcze 6 X. Zostaje literalna data z ciągu.
    expect(h.S('2026-10-07')).toBe('7 października 2026');
    expect(h.rt('2026-10-07')).toBe('2026-10-07');
    expect(h.C('2026-10-07')).toBe('');
    // ISO bez strefy — Date czyta je jako czas lokalny, więc wynik jest taki sam jak
    // literalne wycięcie; w obu drogach nie ma przesunięcia.
    expect(h.C('2026-10-07T08:10:00')).toBe('08:10');
    expect(h.S('2026-10-07T08:10:00')).toBe('7 października 2026');
    // Nieprawidłowa data z poprawnym kształtem → fallback regexowy, bez wyjątku.
    expect(() => h.C('2026-13-45T99:99:00Z')).not.toThrow();
    expect(h.C('2026-13-45T99:99:00Z')).toBe('99:99');
    // Zupełnie obcy ciąg: C wycina znaki 11–16 (tu: puste), S i rt pierwsze 10 znaków.
    expect(h.C('abc')).toBe('');
    expect(h.S('abc')).toBe('abc');
    expect(h.rt('abc')).toBe('abc');
    // Puste i null — bez wyjątku, zawsze string.
    for (const brak of ['', null, undefined, 0, {}]) {
      expect(() => h.C(brak)).not.toThrow();
      expect(() => h.S(brak)).not.toThrow();
      expect(() => h.rt(brak)).not.toThrow();
      expect(typeof h.C(brak)).toBe('string');
      expect(typeof h.S(brak)).toBe('string');
      expect(typeof h.rt(brak)).toBe('string');
    }
    expect(h.C('')).toBe('');
    expect(h.S('')).toBe('');
    expect(h.rt('')).toBe('');
  });

  it('w() wybiera chwilę zapisu: savedAtISO przed payload.timestampISO', () => {
    const h = historia();
    expect(h.w({ savedAtISO: RANO_Z, payload: { timestampISO: PRZED_POLNOCA_Z } })).toBe(RANO_Z);
    expect(h.w({ payload: { timestampISO: PRZED_POLNOCA_Z } })).toBe(PRZED_POLNOCA_Z);
    expect(h.w(null)).toBe('');
  });

  it('K(): dwie migawki po obu stronach północy lokalnej — jedna grupa dnia w Warszawie, dwie w UTC', () => {
    const migawki = [
      { snapshotId: 's-noc', savedAtISO: PRZED_POLNOCA_Z, payload: { name: 'Test Fikcyjny' } },
      { snapshotId: 's-rano', savedAtISO: RANO_Z, payload: { name: 'Test Fikcyjny' } },
    ];

    process.env.TZ = 'Europe/Warsaw';
    const warszawa = historia().K(migawki);
    expect(warszawa.total).toBe(2);
    expect(warszawa.groups).toHaveLength(1);
    expect(warszawa.groups[0].dayISO).toBe('2026-10-07');
    expect(warszawa.groups[0].dayLabel).toBe('7 października 2026');
    // Najnowszy zapis pierwszy; etykiety godzin lokalne.
    expect(warszawa.groups[0].items.map((i) => i.timeLabel)).toEqual(['08:07', '00:30']);
    expect(warszawa.groups[0].items.map((i) => i.snapshotId)).toEqual(['s-rano', 's-noc']);
    expect(warszawa.groups[0].items[0].isLatest).toBe(true);
    // Surowe ISO w elemencie zostaje nietknięte — to dane, nie prezentacja.
    expect(warszawa.groups[0].items[0].savedAtISO).toBe(RANO_Z);

    process.env.TZ = 'UTC';
    const utc = historia().K(migawki);
    expect(utc.total).toBe(2);
    expect(utc.groups.map((g) => g.dayISO)).toEqual(['2026-10-07', '2026-10-06']);
    expect(utc.groups.map((g) => g.dayLabel)).toEqual(['7 października 2026', '6 października 2026']);
    expect(utc.groups[0].items.map((i) => i.timeLabel)).toEqual(['06:07']);
    expect(utc.groups[1].items.map((i) => i.timeLabel)).toEqual(['22:30']);
  });

  it('cała prezentacja czasu w module idzie przez S/C/rt — poza blokiem nikt nie wycina ISO sam', () => {
    const src = zrodlo();
    const blok = wytnijBlok(src, 'function _(t)', 'function W(t){');
    const reszta = src.replace(blok, '');
    // Poza blokiem formatującym nie ma ręcznego wycinania daty/godziny z ciągu ISO.
    for (const wzor of ['.slice(0,10)', '.slice(11,16)', 'match(/T(', 'getHours(', 'toISOString().slice', 'toLocale']) {
      expect(reszta, `poza S/C/rt pojawia się własne wycinanie czasu: ${wzor}`).not.toContain(wzor);
    }
    // Nagłówek podglądu, pytanie o przywrócenie i porównanie wersji używają tych samych funkcji.
    expect(reszta).toContain('text:S(v)+", "+C(v)');
    expect(reszta).toContain('"Przywr\\xF3ci\\u0107 wersj\\u0119 z "+S(v)+" ("+C(v)+")?"');
    expect(reszta).toContain('"\\u2713 Przywr\\xF3cono wersj\\u0119 z "+S(w(a))+".');
    expect(reszta).toContain('" ("+S(w(e))+", "+C(w(e))+")"');
    expect(reszta).toContain('" ("+S(w(r))+", "+C(w(r))+")"');
  });
});
