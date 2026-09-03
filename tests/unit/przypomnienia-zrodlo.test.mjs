import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Strażnicy źródłowe karty „Przypomnienia” (audyt 2026-09-03).
//
// vilda_auth_ui.js nie ma haka testowego w rodzaju window.VildaTerminarz.__internals, więc gn()
// i Br() są nieosiągalne dla testów jednostkowych — ich zachowanie pilnuje
// tests/e2e/przypomnienia-karta.spec.mjs na realnej stronie. Tutaj pilnujemy samego kształtu
// źródła: dwie rzeczy, które łatwo cofnąć nieuważną edycją i których e2e nie złapie tanio.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUTH_UI_SOURCE = fs.readFileSync(path.join(repositoryRoot, 'vilda_auth_ui.js'), 'utf8');

describe('vilda_auth_ui.js — kształt źródła po audycie karty „Przypomnienia”', () => {
  it('PR 12: gn() liczy „dziś” z lokalnych składników daty, nie z UTC', () => {
    // Punkt odniesienia musi być lokalny (getFullYear/Month/Date), bo sekcje „Zaległe”/„Dziś”
    // dzieli Fa() z lokalnej daty. Sama data notatki zostaje czytana z UTC — dueDateISO jest
    // zapisane jako północ UTC zamierzonego dnia, więc getUTC* zwraca właściwy dzień kalendarzowy.
    // Funkcja jest zminifikowana w jednej linii — bierzemy jej początek i stały odcinek dalej,
    // bo dopasowanie klamry regexem po zminifikowanym kodzie urywa się na pierwszym `}`.
    const start = AUTH_UI_SOURCE.indexOf('function gn(t){');
    expect(start, 'funkcja gn() istnieje').toBeGreaterThan(-1);
    const gn = AUTH_UI_SOURCE.slice(start, start + 700);
    expect(gn, 'odniesienie „dziś” z lokalnych składników')
      .toContain('Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())');
    expect(gn, 'data notatki nadal czytana z UTC')
      .toContain('Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate())');
  });

  it('nigdzie w pliku „dziś” nie jest budowane z UTC-owych składników bieżącej chwili', () => {
    // Wzorzec `var X=new Date, Y=new Date(Date.UTC(X.getUTCFullYear(), …))` to rodzina błędu D8:
    // na wschód i zachód od UTC daje dobę przesuniętą o jeden dzień. Miały go gn() (naprawione
    // w PR 12) i martwa Fs() (usunięta w PR 14).
    const wzorzec = /new Date,\s*\w+\s*=\s*new Date\(Date\.UTC\(\w+\.getUTCFullYear\(\)/g;
    const trafienia = AUTH_UI_SOURCE.match(wzorzec) || [];
    expect(trafienia, `znaleziono ${trafienia.length} wystąpień wzorca UTC-owego „dziś”`)
      .toHaveLength(0);
  });

  it('PR 14: martwa funkcja Fs() nie wróciła', () => {
    // Formatowała datę względną („dziś · HH:MM”), niosła powyższy błąd doby i nie miała ani
    // jednego wywołania. Usunięta; gdyby wróciła, wróciłby też nieużywany kod z wadą.
    expect(AUTH_UI_SOURCE).not.toMatch(/\bfunction Fs\s*\(/);
    expect((AUTH_UI_SOURCE.match(/\bFs\b/g) || []).length, 'identyfikator Fs nie występuje').toBe(0);
  });
});
