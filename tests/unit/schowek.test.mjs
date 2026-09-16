import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zrodlo } from '../support/silnik-bmi.mjs';

// P-IOS-SCHOWEK — zgłoszenie z iOS (2026-09-16): przycisk „Podsumowanie wyników — kliknij
// i skopiuj" meldował sukces, ale w Wiadomościach wklejał się bezsensowny ciąg znaków,
// a w Notatkach — łącze. Na komputerze to samo działało. Przyczyna: do schowka NIC nie
// trafiało, więc wklejała się jego POPRZEDNIA zawartość (Notatki linkują adres, Wiadomości
// pokazują go surowo — jedna przyczyna, dwa objawy).
//
// Tego pliku nie da się uruchomić na prawdziwym WebKicie w tym repozytorium, więc nie udaje,
// że testuje iOS. Testuje REGUŁY, których stara ścieżka nie spełniała — przede wszystkim tę
// najważniejszą: `execCommand('copy')` zwracające `true` NIE JEST dowodem, że cokolwiek
// skopiowano. Dane FIKCYJNE.

function fakeOkno({ execCopy = true, zaznaczenieDziala = true, clipboard = null, getSelection = true } = {}) {
  const usuniete = [];
  const utworzone = [];
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
        style: {}, value: '', selectionStart: 0, selectionEnd: 0, parentNode: null,
        atrybuty: {},
        setAttribute(k, v) { this.atrybuty[k] = v; },
        focus() { win.document.activeElement = el; },
        setSelectionRange(a, b) {
          // iOS bez contentEditable po prostu NIE zaznacza — to modelujemy flagą
          if (!zaznaczenieDziala) { this.selectionStart = 0; this.selectionEnd = 0; return; }
          this.selectionStart = a; this.selectionEnd = b;
        },
      };
      utworzone.push(el);
      return el;
    },
    execCommand(cmd) { return cmd === 'copy' ? execCopy : false; },
    createRange: () => ({ selectNodeContents() {} }),
  };
  if (getSelection) {
    let zakresy = [];
    win.getSelection = () => ({
      get rangeCount() { return zakresy.length; },
      getRangeAt: (i) => zakresy[i],
      removeAllRanges() { zakresy = []; },
      addRange(r) { zakresy.push(r); },
    });
  }
  if (clipboard) win.navigator = { clipboard };
  loadBrowserScript('vilda_schowek.js', win);
  return { win, usuniete, utworzone };
}

describe('VildaSchowek — jedna droga zapisu do schowka', () => {
  it('kopiuje tekst i sprząta po sobie', async () => {
    const { win, usuniete, utworzone } = fakeOkno();
    await expect(win.VildaSchowek.kopiuj('Waga: 20 kg')).resolves.toMatchObject({ droga: 'execCommand' });
    expect(utworzone).toHaveLength(1);
    expect(utworzone[0].value).toBe('Waga: 20 kg');
    expect(usuniete, 'pole pomocnicze znika ze strony').toHaveLength(1);
  });

  it('REGRESJA iOS: execCommand zwracające true przy pustym zaznaczeniu NIE jest sukcesem', async () => {
    // Dokładnie ten przypadek dawał fałszywe „skopiowane": WebKit mówił, że skopiował,
    // a w schowku zostawała poprzednia zawartość.
    const { win } = fakeOkno({ execCopy: true, zaznaczenieDziala: false });
    await expect(win.VildaSchowek.kopiuj('Waga: 20 kg')).rejects.toThrow(/schowka/i);
  });

  it('pole pomocnicze spełnia reguły iOS: readOnly + contentEditable, w widoku, 16 px', () => {
    const { win, utworzone } = fakeOkno();
    win.VildaSchowek.kopiuj('x');
    const pole = utworzone[0] || null;
    expect(pole).toBeTruthy();
    // readOnly trzyma klawiaturę z daleka, contentEditable pozwala iOS zaznaczyć mimo to
    expect(pole.readOnly, 'bez readOnly iOS otwiera klawiaturę').toBe(true);
    expect(pole.contentEditable, 'bez contentEditable iOS nie zaznaczy pola readOnly').toBe('true');
    // element poza widokiem nie da się zaznaczyć na iOS — stara wersja stała na -9999px
    expect(pole.style.cssText).not.toContain('-9999px');
    expect(pole.style.cssText).toContain('position:fixed');
    expect(pole.style.cssText, 'mniejsza czcionka każe iOS przybliżyć stronę').toContain('font-size:16px');
    expect(pole.atrybuty['aria-hidden'], 'pole pomocnicze nie dla czytnika ekranu').toBe('true');
  });

  it('gdy zapis synchroniczny zawiedzie, ratuje asynchroniczny — i odwrotnie', async () => {
    const zapisane = [];
    const dziala = { writeText: (t) => { zapisane.push(t); return Promise.resolve(); } };
    const { win } = fakeOkno({ execCopy: false, zaznaczenieDziala: false, clipboard: dziala });
    await expect(win.VildaSchowek.kopiuj('abc')).resolves.toMatchObject({ droga: 'clipboard' });
    expect(zapisane).toEqual(['abc']);

    const odmawia = { writeText: () => Promise.reject(new Error('NotAllowedError')) };
    const b = fakeOkno({ execCopy: true, zaznaczenieDziala: true, clipboard: odmawia });
    await expect(b.win.VildaSchowek.kopiuj('abc')).resolves.toMatchObject({ droga: 'execCommand' });
  });

  it('obie drogi ruszają w TYM SAMYM geście — asynchroniczna nie czeka na porażkę synchronicznej', async () => {
    // Gdyby `writeText` był wywoływany dopiero w `.catch()`, na iOS byłby już poza gestem
    // użytkownika i nigdy by nie zadziałał. Tu sprawdzamy, że leci nawet przy sukcesie execCommand.
    const zapisane = [];
    const clipboard = { writeText: (t) => { zapisane.push(t); return Promise.resolve(); } };
    const { win } = fakeOkno({ execCopy: true, zaznaczenieDziala: true, clipboard });
    await expect(win.VildaSchowek.kopiuj('abc')).resolves.toMatchObject({ droga: 'obie' });
    expect(zapisane, 'writeText wywołany mimo udanego execCommand').toEqual(['abc']);
  });

  it('gdy nie da się nic zapisać, mówi to wprost zamiast udawać sukces', async () => {
    const { win } = fakeOkno({ execCopy: false, zaznaczenieDziala: false });
    await expect(win.VildaSchowek.kopiuj('abc')).rejects.toThrow(/schowka/i);
    const pusty = fakeOkno();
    await expect(pusty.win.VildaSchowek.kopiuj('')).rejects.toThrow(/Brak tekstu/);
  });

  it('strażnik: karta „Podsumowanie wyników" nie ma już własnej kopii logiki schowka', () => {
    const src = zrodlo('vilda_summary_cards.js');
    expect(src, 'kopiowanie idzie przez moduł').toContain('window.VildaSchowek');
    expect(src, 'i nie ma własnego execCommand').not.toContain('execCommand');
    expect(src, 'ani własnego pola readonly poza ekranem').not.toContain('-9999px');
    // bez modułu NIE wracamy po cichu na starą, zepsutą drogę
    expect(src).toContain('Brak modu\\u0142u schowka.');
  });
});
