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

function fakeOkno({ execCopy = true, zaznaczenieDziala = true, clipboard = null } = {}) {
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
  if (clipboard) win.navigator = { clipboard };
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
    await expect(win.VildaSchowek.kopiuj('Waga: 63,4 kg')).resolves.toMatchObject({ droga: 'clipboard' });
    expect(zapisane).toEqual(['Waga: 63,4 kg']);
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
    await expect(win.VildaSchowek.kopiuj('Waga: 63,4 kg')).resolves.toMatchObject({ droga: 'execCommand' });
    expect(utworzone[0].value).toBe('Waga: 63,4 kg');
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
