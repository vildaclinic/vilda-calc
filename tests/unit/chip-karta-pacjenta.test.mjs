import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Wykonujemy pełną produkcyjną funkcję it(), łącznie z jej listenerem click.
// Podstawione są tylko DOM oraz zależności popovera i dostępne API nawigacji.
const source = readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const start = source.indexOf('function it(){');
const end = source.indexOf('function te(){', start);
if (start < 0 || end < 0) throw new Error('Nie znaleziono produkcyjnego popovera pacjenta.');
const production = source.slice(start, end);

function popover(window = {}, initialId = 'fikcyjny-pacjent-A') {
  let patientId = initialId;
  const listeners = new Map();
  const button = { addEventListener: (type, fn) => listeners.set(type, fn) };
  const chip = { setAttribute: vi.fn() };
  const document = { getElementById: (id) => id === 'vildaPatientChip' ? chip : null };
  const panel = {
    innerHTML: '', hidden: true,
    querySelector: (selector) => selector === '[data-vilda-open-card]' ? button : null,
    classList: { add: vi.fn() },
  };
  const close = vi.fn();
  const open = new Function('r', 'o', 'h', 'at', 'rt', 'Ce', 'te', 'le',
    `var O=false;${production};return it;`)(
    window, document, panel, () => {}, () => '<button data-vilda-open-card>Karta Pacjenta</button>',
    () => patientId, close, () => {},
  );
  open();
  const click = () => {
    const stopPropagation = vi.fn();
    const listener = listeners.get('click');
    if (!listener) throw new Error('Produkcja nie zamontowała przycisku Karta Pacjenta.');
    listener({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  };
  return { click, setId: (value) => { patientId = value; }, panel, chip };
}

describe('Karta Pacjenta w chipie — rzeczywisty listener nawigacji', () => {
  it('lokalna powłoka ma pierwszeństwo przed powłoką rodzica i samodzielnym auth UI', () => {
    const local = vi.fn();
    const parent = vi.fn();
    const auth = vi.fn();
    popover({
      VildaShell: { openPatientCardInStart: local },
      parent: { VildaShell: { openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(local).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
    expect(parent).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it('wewnątrz ramki używa dostępnej powłoki rodzica', () => {
    const parent = vi.fn();
    const auth = vi.fn();
    popover({
      parent: { VildaShell: { openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(parent).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
    expect(auth).not.toHaveBeenCalled();
  });

  it('na samodzielnej stronie przekazuje ID do VildaAuthUI.showPatientCard', () => {
    const auth = vi.fn();
    const window = { VildaAuthUI: { showPatientCard: auth } };
    window.parent = window;
    popover(window).click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it('niedostępne API powłoki nie zatrzymuje fallbacku auth UI', () => {
    const auth = vi.fn();
    popover({
      VildaShell: { openPatientCardInStart: null },
      parent: { VildaShell: {} },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it('odmowa dostępu do obcej ramki rodzica nie blokuje lokalnego auth UI', () => {
    const auth = vi.fn();
    const parent = {};
    Object.defineProperty(parent, 'VildaShell', {
      get() { throw new Error('Blocked cross-origin frame access'); },
    });
    const env = popover({ parent, VildaAuthUI: { showPatientCard: auth } });
    expect(() => env.click()).not.toThrow();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it.each(['', null])('brak bieżącego ID (%s) nie otwiera żadnej karty', (id) => {
    const local = vi.fn();
    const parent = vi.fn();
    const auth = vi.fn();
    popover({
      VildaShell: { openPatientCardInStart: local },
      parent: { VildaShell: { openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }, id).click();
    expect(local).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it('czyta ID w momencie kliknięcia, także gdy pacjent zmienił się po otwarciu popovera', () => {
    const auth = vi.fn();
    const env = popover({ VildaAuthUI: { showPatientCard: auth } });
    env.setId('fikcyjny-pacjent-B');
    env.click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-B');
  });

  it('decyzję o odmowie dla zablokowanego sejfu pozostawia istniejącemu auth UI', () => {
    const auth = vi.fn(() => false);
    popover({ VildaAuthUI: { showPatientCard: auth } }).click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });
});
