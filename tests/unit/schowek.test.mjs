import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zrodlo } from '../support/silnik-bmi.mjs';

// P-IOS-SCHOWEK — zgłoszenie z iOS (2026-09-16): treść skopiowana przyciskiem „Podsumowanie
// wyników" wklejała się w Notatkach i Wiadomościach JAKO ŁĄCZA, choć w polu przyjmującym czysty
// tekst ta sama zawartość była poprawna, a inne przyciski aplikacji działały bez zarzutu.
//
// Przyczyna: na schowku iOS leżą obok siebie różne warianty tej samej treści.
// `navigator.clipboard.writeText` zapisuje wyłącznie czysty tekst. `execCommand('copy')` z pola
// oznaczonego `contentEditable` dokłada wariant HTML — a Notatki i Wiadomości wolą wariant bogaty.
// Każda aplikacja brała więc inny wariant z tego samego schowka.
//
// PIERWSZA WERSJA TEGO MODUŁU BYŁA BŁĘDNA: uruchamiała obie drogi naraz i dodawała
// `contentEditable`, czyli utrwalała wariant HTML przy każdym kopiowaniu. Ten plik pilnuje,
// żeby to nie wróciło. Dane FIKCYJNE.
//
// P-SCHOWEK-HIS (zgłoszenie właściciela, 2026-10-13): w Eskulapie (HIS) „≥" z podsumowania
// zamieniał się w wydruku PDF i w dokumencie na P1 w „?", a tekst zaczynał się od „?" (łącznik
// U+2060). Objaw zgadza się z zamianą na stronę kodową Windows-1250 przez Windows — znak bez
// odpowiednika dostaje „?". Od tej poprawki tekst w schowku mieści się w Windows-1250, a łącznik
// trafia tam tylko na iPhonie i iPadzie. Wyrocznią repertuaru Windows-1250 jest dekoder z Node
// (TextDecoder), nie tabela modułu — inaczej test sprawdzałby moduł samym sobą.

// Identyfikatory przeglądarek — tylko do rozpoznania platformy w module.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

function fakeOkno({
  execCopy = true, zaznaczenieDziala = true, clipboard = null, ua = null, platform = null, maxTouchPoints = null,
} = {}) {
  const utworzone = [];
  const usuniete = [];
  const wywolaniaExec = [];
  const body = {
    appendChild(el) { el.parentNode = body; return el; },
    removeChild(el) { usuniete.push(el); el.parentNode = null; return el; },
  };
  const win = {};
  win.window = win;
  win.document = {
    body,
    activeElement: null,
    createElement() {
      const el = {
        style: {}, value: '', selectionStart: 0, selectionEnd: 0, parentNode: null, atrybuty: {},
        setAttribute(k, v) { this.atrybuty[k] = v; },
        focus() { win.document.activeElement = el; },
        setSelectionRange(a, b) {
          if (!zaznaczenieDziala) { this.selectionStart = 0; this.selectionEnd = 0; return; }
          this.selectionStart = a; this.selectionEnd = b;
        },
      };
      utworzone.push(el);
      return el;
    },
    execCommand(cmd) { wywolaniaExec.push(cmd); return cmd === 'copy' ? execCopy : false; },
    createRange: () => ({ selectNodeContents() {} }),
  };
  let zakresy = [];
  win.getSelection = () => ({
    get rangeCount() { return zakresy.length; },
    getRangeAt: (i) => zakresy[i],
    removeAllRanges() { zakresy = []; },
    addRange(r) { zakresy.push(r); },
  });
  const nav = {};
  if (clipboard) nav.clipboard = clipboard;
  if (ua) nav.userAgent = ua;
  if (platform) nav.platform = platform;
  if (maxTouchPoints != null) nav.maxTouchPoints = maxTouchPoints;
  if (Object.keys(nav).length) win.navigator = nav;
  loadBrowserScript('vilda_schowek.js', win);
  return { win, utworzone, usuniete, wywolaniaExec };
}

const dzialajacySchowek = (zapisane) => ({ writeText: (t) => { zapisane.push(t); return Promise.resolve(); } });

describe('VildaSchowek — na schowek trafia JEDEN wariant: czysty tekst', () => {
  it('REGRESJA iOS: przy dostępnym Clipboard API execCommand NIE rusza', async () => {
    // To jest cała istota naprawy. Druga droga dokładałaby na schowek wariant HTML,
    // a Notatki i Wiadomości wolą go od czystego tekstu — stąd wklejanie „jako łącza".
    const zapisane = [];
    const { win, wywolaniaExec, utworzone } = fakeOkno({ clipboard: dzialajacySchowek(zapisane) });
    // próbka bez dwukropka na początku — ten test bada drogę zapisu, nie zabezpieczenie treści
    await expect(win.VildaSchowek.kopiuj('Augmentin \u2013 lek')).resolves.toMatchObject({ droga: 'clipboard' });
    expect(zapisane).toEqual(['Augmentin \u2013 lek']);
    expect(wywolaniaExec, 'żadnego execCommand obok writeText').toEqual([]);
    expect(utworzone, 'żadnego pola pomocniczego — nie ma czego zaznaczać').toHaveLength(0);
  });

  it('REGRESJA iOS: pole zapasowe NIE jest contentEditable', () => {
    // `contentEditable` kazało WebKitowi potraktować zaznaczenie jak treść bogatą i dołożyć
    // wariant HTML. Pierwsza wersja tego modułu ustawiała je celowo — i to był błąd.
    const { win, utworzone } = fakeOkno();
    win.VildaSchowek.kopiuj('x');
    const pole = utworzone[0];
    expect(pole).toBeTruthy();
    expect(pole.contentEditable, 'zwykłe pole tekstowe kopiuje czysty tekst').toBeUndefined();
    expect(pole.readOnly, 'readOnly trzyma klawiaturę ekranową z daleka').toBe(true);
    expect(pole.style.cssText).not.toContain('-9999px');
    expect(pole.atrybuty['aria-hidden']).toBe('true');
  });

  it('bez Clipboard API kopiuje ścieżką zapasową i sprząta po sobie', async () => {
    const { win, utworzone, usuniete } = fakeOkno();
    await expect(win.VildaSchowek.kopiuj('Augmentin \u2013 lek')).resolves.toMatchObject({ droga: 'execCommand' });
    expect(utworzone[0].value).toBe('Augmentin \u2013 lek');
    expect(usuniete, 'pole pomocnicze znika ze strony').toHaveLength(1);
  });

  it('execCommand zwracające true przy pustym zaznaczeniu NIE jest sukcesem', async () => {
    const { win } = fakeOkno({ execCopy: true, zaznaczenieDziala: false });
    await expect(win.VildaSchowek.kopiuj('abc')).rejects.toThrow(/schowka/i);
  });

  it('odmowa Clipboard API nie jest zamiatana pod dywan', async () => {
    const odmawia = { writeText: () => Promise.reject(new Error('NotAllowedError')) };
    const { win, wywolaniaExec } = fakeOkno({ clipboard: odmawia });
    await expect(win.VildaSchowek.kopiuj('abc')).rejects.toThrow(/NotAllowedError/);
    // nawet wtedy nie sięgamy po execCommand: lepiej powiedzieć „nie udało się", niż położyć
    // na schowku drugi wariant i zepsuć wklejanie w Notatkach
    expect(wywolaniaExec).toEqual([]);
  });

  it('pusty tekst to odmowa, nie cichy sukces', async () => {
    const { win } = fakeOkno();
    await expect(win.VildaSchowek.kopiuj('')).rejects.toThrow(/Brak tekstu/);
  });

  it('REGRESJA iOS (potwierdzona na urządzeniu): tekst nie zaczyna się jak adres', async () => {
    // Właściciel przytrzymał łącze w Notatkach — pokazywało adres zaczynający się od „waga:".
    // Podsumowanie zaczyna się od „Waga: 63,4 kg…", a „Waga:" ma kształt schematu adresu
    // (litera, litery/cyfry, dwukropek — jak „mailto:"). WebKit dokłada wtedy na schowek wariant
    // „adres", a Notatki renderują CAŁOŚĆ jako jedno łącze. Od P-SCHOWEK-HIS łącznik dokładamy
    // tylko na iPhonie i iPadzie — tam był objaw.
    const zapisane = [];
    const { win } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: IPHONE });
    const tekst = 'Waga: 63,4 kg, 73 centyl (wSDS +0,61)\nWzrost: 170 cm';
    await win.VildaSchowek.kopiuj(tekst);

    expect(zapisane[0].charCodeAt(0), 'na początku łącznik wyrazów U+2060').toBe(0x2060);
    expect(zapisane[0].slice(1), 'treść, format i liczby bez zmian').toBe(tekst);
    expect(zapisane[0], 'dokładnie jeden taki znak').toBe('\u2060' + tekst);
  });

  it('łącznik NIE jest znakiem odstępu — inaczej zostałby obcięty przed odczytem adresu', () => {
    // Standard adresów każe obciąć wiodące odstępy, więc pusta linia ani spacja by nie pomogły.
    expect(/\s/.test('\u2060'), 'U+2060 nie jest odstępem').toBe(false);
    expect('\u2060'.trim(), 'i nie znika po trim()').toBe('\u2060');
  });

  it('nie dokładamy znaku tam, gdzie nie ma czego naprawiać', async () => {
    // Zabezpieczenie ma zniknąć samo, gdyby pierwszy wiersz przestał być etykietą z dwukropkiem.
    // Sprawdzane na iPhonie, bo tylko tam zabezpieczenie w ogóle działa. Drugi element pary to
    // tekst po zamianie znaków spoza Windows-1250 (P-SCHOWEK-HIS) — „²" staje się „2".
    for (const [tekst, oczekiwany] of [
      ['Augmentin \u2013 lek podajemy 2 razy dziennie', 'Augmentin \u2013 lek podajemy 2 razy dziennie'], // tak zaczynają się zalecenia, które działały
      ['Pow. cia\u0142a: 1,73 m\u00B2', 'Pow. cia\u0142a: 1,73 m2'],                                    // spacja przed dwukropkiem — to nie schemat
      ['Wska\u017Anik Cole\u2019a: 107,5%', 'Wska\u017Anik Cole\u2019a: 107,5%'],                        // „ź" nie jest znakiem schematu
      ['63,4 kg', '63,4 kg'],                                                                              // zaczyna się od cyfry
    ]) {
      const zapisane = [];
      const { win } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: IPHONE });
      await win.VildaSchowek.kopiuj(tekst);
      expect(zapisane[0], tekst.slice(0, 24)).toBe(oczekiwany);
    }
  });

  it('ścieżka zapasowa kopiuje tę samą, zabezpieczoną treść', async () => {
    const { win, utworzone } = fakeOkno({ ua: IPHONE });
    await win.VildaSchowek.kopiuj('Waga: 63,4 kg');
    expect(utworzone[0].value).toBe('\u2060Waga: 63,4 kg');
  });

  it('strażnik: karta „Podsumowanie wyników" nie ma własnej kopii logiki schowka', () => {
    const src = zrodlo('vilda_summary_cards.js');
    expect(src).toContain('window.VildaSchowek');
    expect(src).not.toContain('execCommand');
    expect(src).not.toContain('-9999px');
    expect(src).toContain('Brak modu\\u0142u schowka.');
  });

  it('strażnik: moduł nie ustawia contentEditable nigdzie', () => {
    const src = zrodlo('vilda_schowek.js');
    expect(src, 'to ono dokładało wariant HTML na schowek').not.toMatch(/contentEditable\s*=/);
  });
});

// Repertuar Windows-1250 według dekodera Node — niezależny od tabel modułu.
function repertuarWindows1250() {
  const dekoder = new TextDecoder('windows-1250');
  const znaki = new Set();
  for (let bajt = 0; bajt < 256; bajt += 1) {
    const znak = dekoder.decode(new Uint8Array([bajt]));
    if (znak !== '\uFFFD') znaki.add(znak);
  }
  return znaki;
}
const WIN1250 = repertuarWindows1250();
const spozaWindows1250 = (tekst) => [...tekst].filter((z) => !WIN1250.has(z));

// Podsumowanie w kształcie, w jakim składa je karta — liczby FIKCYJNE.
const PODSUMOWANIE = [
  'Waga: 41,2 kg, 22 centyl (wSDS \u22120,77)',
  'Wzrost: 151,0 cm, 18 centyl (hSDS \u22120,92)',
  'BMI: 18,1 kg/m\u00B2 \u2013 41 centyl (bmiSDS \u22120,23)',
  'Pow. cia\u0142a: 1,32 m\u00B2',
  'Wska\u017Anik Cole\u2019a: 95,0 %',
  'Proporcja masy do wysoko\u015Bci: 40 centyl (Z\u2011score = -0,25)',
  'Tempo wzrastania: 6,1 cm/rok (z 13 mies.) \u2014 w normie, norma \u22654 cm/rok \u2014 wg wieku kostnego 12 lat (okres oko\u0142opokwitaniowy)',
  'SDS tempa: \u22120,3 (38 centyl) \u2014 wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
].join('\n');
const PODSUMOWANIE_DLA_HIS = [
  'Waga: 41,2 kg, 22 centyl (wSDS -0,77)',
  'Wzrost: 151,0 cm, 18 centyl (hSDS -0,92)',
  'BMI: 18,1 kg/m2 \u2013 41 centyl (bmiSDS -0,23)',
  'Pow. cia\u0142a: 1,32 m2',
  'Wska\u017Anik Cole\u2019a: 95,0 %',
  'Proporcja masy do wysoko\u015Bci: 40 centyl (Z-score = -0,25)',
  'Tempo wzrastania: 6,1 cm/rok (z 13 mies.) \u2014 w normie, norma >=4 cm/rok \u2014 wg wieku kostnego 12 lat (okres oko\u0142opokwitaniowy)',
  'SDS tempa: -0,3 (38 centyl) \u2014 wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
].join('\n');

describe('P-SCHOWEK-HIS — łącznik U+2060 tylko na iPhonie i iPadzie', () => {
  it('Windows (tam działa HIS): tekst zaczyna się od „Waga:", bez znaku, który wracał jako „?"', async () => {
    const zapisane = [];
    const { win } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: WINDOWS_CHROME, platform: 'Win32' });
    await win.VildaSchowek.kopiuj('Waga: 63,4 kg, 73 centyl (wSDS +0,61)\nWzrost: 170 cm');
    expect(zapisane[0], 'treść bez żadnego dodatku').toBe('Waga: 63,4 kg, 73 centyl (wSDS +0,61)\nWzrost: 170 cm');
    expect(zapisane[0].charCodeAt(0), 'pierwszy znak to litera etykiety').toBe('W'.charCodeAt(0));
  });

  it('iPadOS przedstawiający się jako Mac z ekranem dotykowym: łącznik zostaje', async () => {
    const zapisane = [];
    const { win } = fakeOkno({
      clipboard: dzialajacySchowek(zapisane), ua: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5,
    });
    await win.VildaSchowek.kopiuj('Waga: 63,4 kg');
    expect(zapisane[0]).toBe('\u2060Waga: 63,4 kg');
  });

  it('Mac bez ekranu dotykowego, Android i okno bez navigator: bez łącznika', async () => {
    for (const opcje of [
      { ua: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }, // „na komputerze — bez zarzutu"
      { ua: ANDROID_CHROME, platform: 'Linux armv81', maxTouchPoints: 5 },
      {},
    ]) {
      const zapisane = [];
      const { win } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ...opcje });
      await win.VildaSchowek.kopiuj('Waga: 63,4 kg');
      expect(zapisane[0], JSON.stringify(opcje)).toBe('Waga: 63,4 kg');
    }
  });

  it('ścieżka zapasowa na Windows: ta sama treść, bez łącznika', async () => {
    const { win, utworzone } = fakeOkno({ ua: WINDOWS_CHROME, platform: 'Win32' });
    await win.VildaSchowek.kopiuj('Waga: 63,4 kg');
    expect(utworzone[0].value).toBe('Waga: 63,4 kg');
  });

  it('łącznik przyniesiony w treści nie przechodzi na Windows, a na iPhonie nie dubluje się', async () => {
    const naWindows = [];
    await fakeOkno({ clipboard: dzialajacySchowek(naWindows), ua: WINDOWS_CHROME }).win.VildaSchowek
      .kopiuj('\u2060Waga: 63,4 kg');
    expect(naWindows[0]).toBe('Waga: 63,4 kg');

    const naIphonie = [];
    await fakeOkno({ clipboard: dzialajacySchowek(naIphonie), ua: IPHONE }).win.VildaSchowek
      .kopiuj('\u2060Waga: 63,4 kg');
    expect(naIphonie[0], 'dokładnie jeden łącznik').toBe('\u2060Waga: 63,4 kg');
  });

  it('tekst złożony z samych znaków niewidocznych to odmowa, nie pusty schowek', async () => {
    const zapisane = [];
    const { win } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: WINDOWS_CHROME });
    await expect(win.VildaSchowek.kopiuj('\u2060\u200B\uFEFF')).rejects.toThrow(/Brak tekstu/);
    expect(zapisane, 'nic nie trafiło do schowka').toEqual([]);
  });
});

describe('P-SCHOWEK-HIS — dlaSystemuSzpitalnego(): tekst w repertuarze Windows-1250', () => {
  const { win } = fakeOkno();
  const dlaHis = (t) => win.VildaSchowek.dlaSystemuSzpitalnego(t);

  it('kontrola wyroczni: dekoder Node zna Windows-1250 i nie ma w nim „≥"', () => {
    // bez tego każdy test poniżej mógłby przejść na pustym albo innym zbiorze
    expect(WIN1250.has('\u0105'), '„ą" (0xB9)').toBe(true);
    expect(WIN1250.has('\u2013'), '„–" (0x96)').toBe(true);
    expect(WIN1250.has('\u2265'), '„≥" — brak, stąd „?" w HIS').toBe(false);
    expect(WIN1250.has('\u2060'), 'łącznik U+2060 — brak').toBe(false);
    expect(WIN1250.size).toBeGreaterThan(240);
  });

  it('podsumowanie (dane fikcyjne): „≥", „−", „²" i „‑" zamienione, reszta bez zmian', () => {
    expect(spozaWindows1250(PODSUMOWANIE), 'kontrola: przed zamianą są znaki spoza Windows-1250')
      .toEqual(['\u2212', '\u2212', '\u00B2', '\u2212', '\u00B2', '\u2011', '\u2265', '\u2212']);
    const wynik = dlaHis(PODSUMOWANIE);
    expect(wynik).toBe(PODSUMOWANIE_DLA_HIS);
    expect(spozaWindows1250(wynik), 'każdy znak przeżyje stronę kodową Windows-1250').toEqual([]);
    expect(wynik.split('\n'), 'ta sama liczba i kolejność wierszy').toHaveLength(PODSUMOWANIE.split('\n').length);
    // Liczby ujemne zostają ujemne i te same: „−0,77" staje się „-0,77" — żadna nie znika
    // i żadna nie traci znaku (bez tej zamiany minus zależałby od cudzej konwersji).
    const ujemnePrzed = PODSUMOWANIE.match(/[\u2212-]\d+,\d+/g).map((l) => l.slice(1));
    const ujemnePo = wynik.match(/-\d+,\d+/g).map((l) => l.slice(1));
    expect(ujemnePrzed, 'kontrola: próbka ma pięć liczb ujemnych').toHaveLength(5);
    expect(ujemnePo).toEqual(ujemnePrzed);
  });

  it('pojedyncze zamiany — znaczenie bez zmian', () => {
    for (const [we, wy] of [
      ['norma \u22654 cm/rok', 'norma >=4 cm/rok'],
      ['\u2264 3. centyla', '<= 3. centyla'],
      ['\u2248 5 kg', '~ 5 kg'],
      ['hSDS \u22121,44', 'hSDS -1,44'],
      ['Z\u2011score', 'Z-score'],
      ['beta\u2010hCG', 'beta-hCG'],
      ['\u2012', '-'],
      ['A \u2192 B', 'A -> B'],
      ['B \u2190 A', 'B <- A'],
      ['waga \u2194 BMI', 'waga <-> BMI'],
      ['25 \u03BCg', '25 \u00B5g'],
      ['kg/m\u00B2', 'kg/m2'],
      ['1,73 m\u00B2', '1,73 m2'],
      ['cm\u00B3', 'cm3'],
      ['kg m\u207B\u00B2', 'kg m-2'],
      ['5\u00B2', '5^2'],
      ['6,5 \u00D7 10\u00B3/\u00B5l', '6,5 \u00D7 10^3/\u00B5l'], // tablica Windows dałaby „103"
      ['250 \u00D7 10\u2079/l', '250 \u00D7 10^9/l'],
      ['10\u207B\u00B3', '10^-3'],
      ['CO\u2082', 'CO2'],
      ['\u00BD tabletki', '1/2 tabletki'], // tablica Windows dałaby „1 tabletki"
      ['1\u00BD tabletki', '1 1/2 tabletki'],
      ['\u00BC', '1/4'],
      ['\u00BE', '3/4'],
      ['12\u202F345', '12 345'],
      ['a\u2009b\u2007c\u2002d', 'a b c d'],
      ['\u2060Waga\u200B: 1\u200C2\u200D3\uFEFF', 'Waga: 123'],
    ]) {
      expect(dlaHis(we), JSON.stringify(we)).toBe(wy);
    }
  });

  it('znaki z Windows-1250 i ASCII zostają bit w bit', () => {
    let ascii = '';
    for (let k = 0x20; k < 0x7F; k += 1) ascii += String.fromCharCode(k);
    const polskie = '\u0105\u0107\u0119\u0142\u0144\u00F3\u015B\u017A\u017C'
      + '\u0104\u0106\u0118\u0141\u0143\u00D3\u015A\u0179\u017B';
    const typografia = '\u2013 \u2014 \u2019 \u201E\u201D \u2026 \u00B1 \u00D7 \u00B0 \u00B5 \u00A0 \u20AC \u00A7';
    for (const tekst of [ascii, polskie, typografia, 'Wiersz 1\nWiersz 2\r\nWiersz 3\t.']) {
      expect(spozaWindows1250(tekst), 'kontrola: próbka w całości w Windows-1250').toEqual([]);
      expect(dlaHis(tekst)).toBe(tekst);
    }
  });

  it('każdy znak z tabel modułu kończy w Windows-1250, a druga zamiana niczego już nie zmienia', () => {
    const wszystkie = '\u2265\u2264\u2248\u2212\u2010\u2011\u2012\u2192\u2190\u2194\u03BC'
      + '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'
      + '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F'
      + '\u200B\u200C\u200D\u2060\uFEFF'
      + '1\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079\u207A\u207B x\u00B2 '
      + '1\u00BC 2\u00BD 3\u00BE';
    expect(spozaWindows1250(wszystkie).length, 'kontrola: próbka jest spoza Windows-1250').toBeGreaterThan(40);
    const raz = dlaHis(wszystkie);
    expect(spozaWindows1250(raz)).toEqual([]);
    expect(dlaHis(raz)).toBe(raz);
    expect(dlaHis(PODSUMOWANIE_DLA_HIS)).toBe(PODSUMOWANIE_DLA_HIS);
  });

  it('znak spoza tabel zostaje — moduł nie zgaduje znaczenia', () => {
    // Greka poza „mi" i symbole nie występują w kopiowanym podsumowaniu; o ich zapisie zdecyduje
    // właściciel, gdy się pojawią (strażnik e2e wskaże je w podsumowaniu).
    expect(dlaHis('\u03B2-hCG')).toBe('\u03B2-hCG');
    expect(dlaHis('\u0394hSDS')).toBe('\u0394hSDS');
    expect(dlaHis('\u26A0 uwaga')).toBe('\u26A0 uwaga');
  });

  it('wejście niebędące tekstem', () => {
    expect(dlaHis(12.5)).toBe('12.5');
    expect(dlaHis(null)).toBe('');
    expect(dlaHis(undefined)).toBe('');
  });

  it('kopiuj() zapisuje do schowka tekst po zamianie — na Windows bez łącznika', async () => {
    const zapisane = [];
    const { win: okno } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: WINDOWS_CHROME, platform: 'Win32' });
    await okno.VildaSchowek.kopiuj(PODSUMOWANIE);
    expect(zapisane).toEqual([PODSUMOWANIE_DLA_HIS]);
  });

  it('kopiuj() na iPhonie: łącznik, a za nim ten sam tekst po zamianie', async () => {
    const zapisane = [];
    const { win: okno } = fakeOkno({ clipboard: dzialajacySchowek(zapisane), ua: IPHONE });
    await okno.VildaSchowek.kopiuj(PODSUMOWANIE);
    expect(zapisane).toEqual(['\u2060' + PODSUMOWANIE_DLA_HIS]);
  });

  it('strażnik: moduł nie używa wyrażeń „lookbehind" — starsze Safari na iOS wyłączyłyby kopiowanie', () => {
    const src = zrodlo('vilda_schowek.js');
    expect(src).not.toMatch(/\(\?<[=!]/);
  });
});
