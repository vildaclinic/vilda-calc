import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Wykonujemy pełną produkcyjną funkcję it(), łącznie z jej listenerem click.
// Podstawione są tylko DOM oraz zależności popovera i dostępne API nawigacji.
const source = readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const start = source.indexOf('function it(){');
const end = source.indexOf('function te(){', start);
if (start < 0 || end < 0) throw new Error('Nie znaleziono produkcyjnego popovera pacjenta.');
const production = source.slice(start, end);
const menuNavigation = source.slice(source.indexOf('function Cm_menuOwner('), source.indexOf('function Cm_refreshMenuActions('));
const shellNavigation = source.slice(source.indexOf('function Cm_shell('), source.indexOf('function Cm_cancelFocus('));
// Keep the complete production save projection and its lifecycle state. The
// navigation listener calls it when opening the popover, even with no SSI.
const saveStateGlobals = source.slice(source.indexOf('var Ch_saveDocument='), source.indexOf('function Ch_searchIcon('));
const stateMirror = source.slice(source.indexOf('function Ch_saveContext('), source.indexOf('function Ch_refreshMenuPro('));
const attributeHelper = source.slice(source.indexOf('function Ch_attr('), source.indexOf('function Ch_sameOwner('));
// The save projection also refreshes Clear availability. Include that real
// projection and its context checks; this navigation fixture has no form.
const clearProjection = source.slice(source.indexOf('function Cm_clearDisplayed('), source.indexOf('function Cm_menuItem('));

function popover(window = {}, initialId = 'fikcyjny-pacjent-A') {
  let patientId = initialId;
  const listeners = new Map();
  const button = { addEventListener: (type, fn) => listeners.set(type, fn), focus: vi.fn() };
  const chip = { setAttribute: vi.fn(), getAttribute: () => null, classList: { contains: () => false } };
  const document = {
    getElementById: (id) => id === 'vildaPatientChip' ? chip : null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const panel = {
    innerHTML: '', hidden: true,
    querySelector: (selector) => selector === '[data-vilda-open-card]' ? button : null,
    classList: { add: vi.fn() },
  };
  // The visible menu legend now uses the same guarded patient entry as the
  // patient button. Run that actual production path with an unlocked owner.
  window.VildaVault ||= { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-popover-owner' }) };
  window.addEventListener ||= vi.fn();
  window.removeEventListener ||= vi.fn();
  const close = vi.fn(), tip = vi.fn();
  const open = new Function('r', 'o', 'h', 'at', 'rt', 'Ce', 'te', 'le', 'Cm_closeDrawer', 'F',
    `var O=false,Ch_statusAnchor=null,Cm_unavailable='Unavailable';${saveStateGlobals}${attributeHelper}${clearProjection}${stateMirror}${menuNavigation}${shellNavigation}${production};Ch_refreshSaveState();return it;`)(
    window, document, panel, () => {}, () => '<button data-vilda-open-card>Karta Pacjenta</button>',
    () => patientId, close, () => {}, () => {}, tip,
  );
  open();
  const click = async () => {
    const stopPropagation = vi.fn();
    const listener = listeners.get('click');
    if (!listener) throw new Error('Produkcja nie zamontowała przycisku Karta Pacjenta.');
    listener({ stopPropagation });
    await Promise.resolve();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  };
  return { click, setId: (value) => { patientId = value; }, panel, chip, tip };
}

describe('Karta Pacjenta w chipie — rzeczywisty listener nawigacji', () => {
  it('lokalna powłoka ma pierwszeństwo przed powłoką rodzica i samodzielnym auth UI', async () => {
    const local = vi.fn();
    const parent = vi.fn();
    const auth = vi.fn();
    await popover({
      VildaShell: { navigate: vi.fn(), openPatientCardInStart: local },
      parent: { VildaShell: { navigate: vi.fn(), openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(local).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
    expect(parent).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it('wewnątrz ramki używa dostępnej powłoki rodzica', async () => {
    const parent = vi.fn();
    const auth = vi.fn();
    await popover({
      parent: { VildaShell: { navigate: vi.fn(), openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(parent).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
    expect(auth).not.toHaveBeenCalled();
  });

  it('na samodzielnej stronie przekazuje ID do VildaAuthUI.showPatientCard', async () => {
    const auth = vi.fn();
    const window = { VildaAuthUI: { showPatientCard: auth } };
    window.parent = window;
    await popover(window).click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it('niedostępne API powłoki nie zatrzymuje fallbacku auth UI', async () => {
    const auth = vi.fn();
    await popover({
      VildaShell: { openPatientCardInStart: null },
      parent: { VildaShell: {} },
      VildaAuthUI: { showPatientCard: auth },
    }).click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it('odmowa dostępu do obcej ramki rodzica nie blokuje lokalnego auth UI', async () => {
    const auth = vi.fn();
    const parent = {};
    Object.defineProperty(parent, 'VildaShell', {
      get() { throw new Error('Blocked cross-origin frame access'); },
    });
    const env = popover({ parent, VildaAuthUI: { showPatientCard: auth } });
    await expect(env.click()).resolves.toBeUndefined();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-A');
  });

  it.each(['', null])('brak bieżącego ID (%s) nie otwiera żadnej karty', async (id) => {
    const local = vi.fn();
    const parent = vi.fn();
    const auth = vi.fn();
    await popover({
      VildaShell: { navigate: vi.fn(), openPatientCardInStart: local },
      parent: { VildaShell: { navigate: vi.fn(), openPatientCardInStart: parent } },
      VildaAuthUI: { showPatientCard: auth },
    }, id).click();
    expect(local).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it('czyta ID w momencie kliknięcia, także gdy pacjent zmienił się po otwarciu popovera', async () => {
    const auth = vi.fn();
    const env = popover({ VildaAuthUI: { showPatientCard: auth } });
    env.setId('fikcyjny-pacjent-B');
    await env.click();
    expect(auth).toHaveBeenCalledExactlyOnceWith('fikcyjny-pacjent-B');
  });

  it('zablokowany sejf zatrzymuje kartę przed auth UI i wyjaśnia potrzebę logowania', async () => {
    const auth = vi.fn();
    const env = popover({ VildaAuthUI: { showPatientCard: auth }, VildaVault: { isUnlocked: () => false } });
    await env.click();
    expect(auth).not.toHaveBeenCalled();
    expect(env.tip).toHaveBeenCalledOnce();
    expect(env.tip.mock.calls[0][1]).toContain('Zaloguj się');
  });
});
