import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
const payload = { version: 1, name: 'Fikcyjna Alicja', user: { age: 14, height: 148.5, weight: 50.5 } };

function uruchom(wybor, blad = false) {
  const store = {};
  if (wybor != null) store.vildaLoadChoiceV1 = wybor;
  const flush = [];
  const events = [];
  const win = {
    document: {
      getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, dispatchEvent: (e) => { events.push(e); return true; },
    },
    sessionStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    },
    VildaVault: {
      isUnlocked: () => true,
      savePatient: async () => {
        if (blad) throw new Error('Fikcyjny błąd zapisu');
        return { patientId: 'fikcyjny-pacjent', snapshotId: 'fikcyjny-zapis', snapshotCount: 1, isNew: true };
      },
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    vildaPersistFlushNow: () => { flush.push(store.vildaLoadChoiceV1); },
  };
  new Function('window', 'globalThis', zrodlo)(win, win);
  return { win, store, flush, events };
}

describe('Własny zapis potwierdza bieżący stan, zachowując wybór wizyty', () => {
  it('pierwszy zapis nie staje się oczekującym wczytaniem po odtworzeniu persistence', async () => {
    const { win, store, flush, events } = uruchom(null);
    await win.VildaDataImportExport.saveUserData({ collectUserData: () => structuredClone(payload) });
    expect(store.vildaLoadChoiceV1).toBe('restore');
    // Decyzja musi być dostępna już w momencie utrwalania własnej bazy zapisu.
    expect(flush).toEqual(['restore']);
    expect(win.lastLoadedData).toEqual(payload);
    expect(events.find((e) => e.type === 'vilda:patient-loaded').detail.source).toBe('save');
  });

  it.each(['restore', 'new'])('kolejny zapis zachowuje wybór %s', async (wybor) => {
    const { win, store, flush } = uruchom(wybor);
    await win.VildaDataImportExport.saveUserData({ collectUserData: () => structuredClone(payload) });
    expect(store.vildaLoadChoiceV1).toBe(wybor);
    expect(flush).toEqual([wybor]);
    expect(win.lastLoadedData).toEqual(payload);
  });

  it('nieudany zapis nie podejmuje decyzji ani nie utrwala nowej bazy', async () => {
    const { win, store, flush } = uruchom(null, true);
    await win.VildaDataImportExport.saveUserData({ collectUserData: () => structuredClone(payload) });
    expect(store.vildaLoadChoiceV1).toBeUndefined();
    expect(win.lastLoadedData).toBeUndefined();
    expect(flush).toEqual([]);
  });
});
