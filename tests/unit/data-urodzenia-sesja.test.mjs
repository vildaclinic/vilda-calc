import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ODSWIEZENIE (zgłoszenie właściciela 2026-09-15), część 2: data z bloba sesji po odświeżeniu
// strony. Odtworzenie sesji nie jest wczytaniem rekordu — pole wraca w stanie sprzed F5: z
// kartoteki (tylko do odczytu) albo wpisane ręcznie (edytowalne). Atrapa DOM; dane fikcyjne.

function atrapa(id) {
  const el = { id, value: '', readOnly: false, hidden: false, textContent: '', dataset: {}, classList: { toggle() {} }, nasluchy: {} };
  el.addEventListener = (n, f) => { (el.nasluchy[n] = el.nasluchy[n] || []).push(f); };
  el.dispatchEvent = (ev) => { (el.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; };
  el.focus = () => {};
  return el;
}

function srodowisko() {
  const pola = {};
  ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn']
    .forEach((id) => { pola[id] = atrapa(id); });
  pola.restoreStateBtn.style = { display: 'inline-block' };
  const win = {
    document: { readyState: 'complete', getElementById: (id) => pola[id] || null, addEventListener() {} },
    Event: function (typ) { this.type = typ; },
    hasUserModifiedAfterLoad: false,
    setTimeout: (f) => f(),
  };
  loadBrowserScript('vilda_dob_age.js', win);
  return { win, pola, D: win.VildaDobAge };
}

const ISO = () => { const d = new Date(); const u = new Date(d.getFullYear() - 6, d.getMonth() - 2, 5); const z = (n) => String(n).padStart(2, '0'); return { iso: `${u.getFullYear()}-${z(u.getMonth() + 1)}-${z(u.getDate())}`, pole: `${z(u.getDate())}-${z(u.getMonth() + 1)}-${u.getFullYear()}` }; };

describe('setFromSession — data po odświeżeniu strony', () => {
  it('data z kartoteki wraca jako tylko do odczytu i wylicza wiek', () => {
    const { pola, D } = srodowisko();
    const d = ISO();
    expect(D.setFromSession(d.iso, { zRekordu: true })).toBe(true);
    expect(pola.dobInput.value).toBe(d.pole);
    expect(pola.dobInput.readOnly).toBe(true);
    expect(pola.dobInput.dataset.dobSource).toBe('record');
    expect(pola.age.value).toBe('6');
    expect(pola.ageMonths.value).toBe('2');
    expect(pola.age.readOnly, 'wiek zablokowany, bo liczy go data').toBe(true);
  });

  it('data wpisana ręcznie wraca edytowalna — bez znacznika kartoteki', () => {
    const { pola, D } = srodowisko();
    const d = ISO();
    pola.dobInput.readOnly = true; pola.dobInput.dataset.dobSource = 'record'; // stan sprzed odtworzenia
    expect(D.setFromSession(d.iso, { zRekordu: false })).toBe(true);
    expect(pola.dobInput.readOnly).toBe(false);
    expect(pola.dobInput.dataset.dobSource).toBeUndefined();
    expect(pola.age.value).toBe('6');
  });

  it('programowy wpis nie uchodzi za edycję lekarza', () => {
    const { win, pola, D } = srodowisko();
    win.hasUserModifiedAfterLoad = false;
    // Nasłuch aplikacji: pierwsze `input` po wczytaniu ustawia flagę i chowa przycisk.
    pola.age.addEventListener('input', () => { win.hasUserModifiedAfterLoad = true; pola.restoreStateBtn.style.display = 'none'; });
    D.setFromSession(ISO().iso, { zRekordu: true });
    expect(win.hasUserModifiedAfterLoad).toBe(false);
    expect(pola.restoreStateBtn.style.display).toBe('inline-block');
  });

  it('zły albo pusty zapis niczego nie rusza', () => {
    const { pola, D } = srodowisko();
    pola.dobInput.value = '01-01-2020';
    expect(D.setFromSession('', {})).toBe(false);
    expect(D.setFromSession('30-02-2020', {})).toBe(false);
    expect(pola.dobInput.value).toBe('01-01-2020');
  });
});
