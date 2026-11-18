import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const first = { code: 'E10.0', name: 'Ze śpiączką', parentCode: 'E10', parentName: 'Cukrzyca insulinozależna' };
const second = { code: 'I10', name: 'Nadciśnienie samoistne (pierwotne)', parentCode: null, parentName: '' };

function fixture({ name = '', code = '' } = {}) {
  const doc = atrapaDokumentu(), originalCreate = doc.createElement;
  doc.createElement = tag => {
    const element = originalCreate(tag);
    element.value = ''; element.dataset = {}; element.scrollTop = 0;
    element.append = (...children) => children.forEach(child => element.appendChild(child));
    element.replaceChildren = (...children) => { element.textContent = ''; element.append(...children); };
    element.setCustomValidity = text => { element.validationMessage = text; };
    element.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
    return element;
  };
  const host = doc.createElement('div'), nameInput = doc.createElement('input'); nameInput.value = name;
  doc.body.appendChild(host);
  const search = vi.fn(query => ({ items: query === 'none' || query.length > 24 ? [] : [first, second], total: query === 'none' || query.length > 24 ? 0 : 2 }));
  const win = loadBrowserScript('vilda_icd10_picker.js', { AbortController,
    VildaICD10PLData: {}, VildaICD10Search: { create: () => ({ search, lookup: value => [first, second].find(entry => entry.code === value) || null }) } });
  let isCurrent = true;
  const onCommit = vi.fn(), picker = win.VildaICD10Picker.mount({ host, nameInput, code, isCurrent: () => isCurrent, onCommit });
  const query = host.querySelector('.vpt-icd10-query'), canonical = host.querySelector('input[type="hidden"]');
  const input = value => { query.value = value; picker.handleInput({ target: query }); };
  const key = value => {
    const event = { target: query, key: value, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of host.sluchacze.get('keydown') || []) listener(event);
    return event;
  };
  return { host, nameInput, query, canonical, picker, search, onCommit, input, key, stale: () => { isCurrent = false; } };
}

describe('ICD-10 editor query and committed diagnosis code', () => {
  it('keeps queries out of submitted values and blocks unresolved query without changing an existing code', () => {
    const f = fixture({ code: 'FIKCYJNY-KOD-QA', name: 'Fikcyjne rozpoznanie lekarza' });
    expect(f.query.name).toBeUndefined(); expect(f.canonical.name).toBe('code');
    expect(f.canonical.value).toBe('FIKCYJNY-KOD-QA'); expect(f.query.validationMessage).toBe('');
    f.input('spiacz');
    expect(f.search).toHaveBeenCalledWith('spiacz', { limit: 12 });
    expect(f.canonical.value).toBe('FIKCYJNY-KOD-QA'); expect(f.nameInput.value).toBe('Fikcyjne rozpoznanie lekarza');
    expect(f.query.validationMessage).toContain('Wybierz kod'); expect(f.onCommit).not.toHaveBeenCalled();
    f.key('Enter');
    expect(f.canonical.value).toBe('FIKCYJNY-KOD-QA'); expect(f.onCommit).not.toHaveBeenCalled();
    f.input('FIKCYJNY-KOD-QA'); expect(f.query.validationMessage).toBe('');
  });

  it('commits an active catalogue option, fills only a blank/previous automatic name and exposes parent context separately', () => {
    const f = fixture(); f.input('e10');
    expect(f.host.querySelector('.vpt-icd10-parent').textContent).toContain('Cukrzyca insulinozależna');
    f.key('ArrowDown'); expect(f.query.getAttribute('aria-activedescendant')).toBeTruthy();
    const enter = f.key('Enter'); expect(enter.preventDefault).toHaveBeenCalled();
    expect(f.canonical.value).toBe('E10.0'); expect(f.nameInput.value).toBe('Ze śpiączką');
    expect(f.nameInput.value).not.toContain('Cukrzyca'); expect(f.onCommit).toHaveBeenCalledTimes(1);
    expect(f.query.validationMessage).toBe(''); expect(f.query.getAttribute('aria-expanded')).toBe('false');
    f.input('i10'); f.host.querySelectorAll('[role="option"]')[1].click();
    expect(f.canonical.value).toBe('I10'); expect(f.nameInput.value).toBe(second.name);
    f.nameInput.value = 'Fikcyjny opis indywidualny'; f.picker.handleInput({ target: f.nameInput });
    f.input('e10'); f.host.querySelector('[role="option"]').click();
    expect(f.nameInput.value).toBe('Fikcyjny opis indywidualny');
    f.host.querySelector('.vpt-icd10-use-name').click(); expect(f.nameInput.value).toBe(first.name);
  });

  it('never rewrites an existing name on open or selection and permits explicit unknown manual codes', () => {
    const f = fixture({ name: 'Fikcyjne zapisane rozpoznanie', code: 'I10' });
    expect(f.nameInput.value).toBe('Fikcyjne zapisane rozpoznanie'); expect(f.onCommit).not.toHaveBeenCalled();
    f.input('e10'); f.host.querySelector('[role="option"]').click();
    expect(f.nameInput.value).toBe('Fikcyjne zapisane rozpoznanie');
    f.input('FIKCYJNY-KOD-2030');
    f.host.querySelectorAll('[role="option"]').at(-1).click();
    expect(f.canonical.value).toBe('FIKCYJNY-KOD-2030'); expect(f.query.validationMessage).toBe('');
    expect(f.nameInput.value).toBe('Fikcyjne zapisane rozpoznanie');
    expect(f.host.querySelector('.vpt-icd10-official').textContent).toContain('Kod ręczny: FIKCYJNY-KOD-2030');
    const commits = f.onCommit.mock.calls.length;
    f.input(''); expect(f.canonical.value).toBe(''); expect(f.onCommit).toHaveBeenCalledTimes(commits + 1);
    f.input(''); expect(f.onCommit).toHaveBeenCalledTimes(commits + 1);
  });

  it('keeps the committed popup closed during blur change so the immediate source-name action can run', () => {
    const f = fixture({ name: 'Fikcyjne rozpoznanie lekarza', code: 'I10' });
    f.query.value = 'e10'; f.picker.handleInput({ target: f.query, type: 'input' });
    f.host.querySelector('[role="option"]').click();
    expect(f.canonical.value).toBe(first.code); expect(f.nameInput.value).toBe('Fikcyjne rozpoznanie lekarza');
    expect(f.query.getAttribute('aria-expanded')).toBe('false');
    const searches = f.search.mock.calls.length, commits = f.onCommit.mock.calls.length;
    // Browsers dispatch change when the edited query loses focus, between the
    // source-name button's pointerdown and click. That event must not move it.
    f.picker.handleInput({ target: f.query, type: 'change' });
    expect(f.search).toHaveBeenCalledTimes(searches);
    expect(f.host.querySelector('.vpt-icd10-list').hidden).toBe(true);
    expect(f.query.getAttribute('aria-expanded')).toBe('false'); expect(f.canonical.value).toBe(first.code);
    expect(f.query.validationMessage).toBe(''); expect(f.onCommit).toHaveBeenCalledTimes(commits);
    f.host.querySelector('.vpt-icd10-use-name').click();
    expect(f.nameInput.value).toBe(first.name); expect(f.canonical.value).toBe(first.code);
    expect(f.onCommit).toHaveBeenCalledTimes(commits + 1);
  });

  it('closes search on Escape/Tab and refuses a manual query longer than the persisted-code limit', () => {
    const f = fixture(); f.input('Fikcyjny tekst wyszukiwania dłuższy niż kod');
    expect(f.query.getAttribute('aria-expanded')).toBe('true'); expect(f.host.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(f.query.validationMessage).toBeTruthy();
    const escape = f.key('Escape'); expect(escape.preventDefault).toHaveBeenCalled(); expect(escape.stopPropagation).toHaveBeenCalled();
    expect(f.query.getAttribute('aria-expanded')).toBe('false'); expect(f.canonical.value).toBe('');
    f.input('e10'); f.key('Tab'); expect(f.query.getAttribute('aria-expanded')).toBe('false'); expect(f.onCommit).not.toHaveBeenCalled();
  });

  it('blocks stale/saving callbacks and wipes query, code and old options when disposed', () => {
    const f = fixture({ code: 'I10' }); f.input('e10'); const row = f.host.querySelector('[role="option"]');
    f.picker.setWorking(true); row.click(); expect(f.canonical.value).toBe('I10'); expect(f.onCommit).not.toHaveBeenCalled();
    f.picker.setWorking(false); f.stale(); row.click(); expect(f.canonical.value).toBe('I10'); expect(f.onCommit).not.toHaveBeenCalled();
    f.picker.destroy(); expect(f.query.value).toBe(''); expect(f.canonical.value).toBe(''); expect(f.host.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(() => row.click()).not.toThrow(); expect(f.onCommit).not.toHaveBeenCalled();
  });
});
