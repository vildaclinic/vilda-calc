import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-NOTATKI rata 3d — skok z monitora GH do punktu pacjenta.
//
// G27c (znalezisko z rozpoznania G27b, poważniejsze od niego samego). `Gr` ustawiało
// `location.hash` WŁASNEGO okna. Zmierzone: powłoka trzyma własny hash (`#/start`) i montuje
// zakładki jako ramki, a `gh_therapy_monitor.js` jest wpięty WYŁĄCZNIE na `docpro.html` —
// skok z ramki Terminarza ustawiał więc hash dokumentu terminarza i nie robił nic. Zmierzone
// także, że ustawienie hasha na wartość, którą hash JUŻ ma, nie wywołuje `hashchange`
// (licznik 1 → 1), więc drugi skok w obrębie jednego dokumentu też był bezczynny.
//
// G27b (odłożone z raty 1). Skok wczytywał pacjenta do formularza i nic o tym nie mówił:
// nasłuchy `vilda:patient-loaded` zostawały przy poprzednim dziecku.
//
// Zachowanie w przeglądarce pilnuje `tests/e2e/skok-gh-rozgloszenie.spec.mjs`; tutaj są
// strażniki źródła dla rzeczy, których e2e nie odróżni od przypadkowej zgodności.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (n) => fs.readFileSync(path.join(korzen, n), 'utf8');

const MONITOR = zrodlo('gh_therapy_monitor.js');
const AUTH_UI = zrodlo('vilda_auth_ui.js');
const FIXES = zrodlo('custom-fixes.js');

describe('G27c — skok dociera tam, gdzie miał', () => {
  it('w powłoce idzie mostkiem VildaShell.navigate, nie hashem własnej ramki', () => {
    expect(AUTH_UI).toContain('Qgb.navigate("docpro",!0)');
    expect(AUTH_UI).toContain('i.document.documentElement.classList.contains("vilda-embedded")');
  });

  it('używa tego samego wzorca mostka, co przycisk Terminarza w tym samym pliku', () => {
    // Kontrola pozytywna: wzorzec nie jest wymyślony na tę okazję.
    expect(AUTH_UI).toContain('j.navigate("terminarz",!0)');
  });

  it('na samodzielnym docpro dokłada hashchange, gdy hash już był docelowy', () => {
    const i = AUTH_UI.indexOf('function Gr(t,a){');
    expect(i).toBeGreaterThan(0);
    const gr = AUTH_UI.slice(i, i + 900);
    expect(gr).toContain('Qgh==="#/docpro"&&typeof i.Event=="function"&&i.dispatchEvent(new i.Event("hashchange"))');
  });

  it('ze strony bez monitora przechodzi na docpro.html, zamiast ustawiać martwy hash', () => {
    const i = AUTH_UI.indexOf('function Gr(t,a){');
    const gr = AUTH_UI.slice(i, i + 900);
    expect(gr).toContain('typeof i.refreshGHTherapyMonitor=="function"');
    expect(gr).toContain('i.location.href="docpro.html"');
  });

  it('zapis zamiaru zostaje przed nawigacją — ramka docelowa czyta go z sessionStorage', () => {
    const i = AUTH_UI.indexOf('function Gr(t,a){');
    const gr = AUTH_UI.slice(i, i + 900);
    const zapis = gr.indexOf('sessionStorage.setItem("vilda:gh-jump"');
    const nawigacja = gr.indexOf('Qgb.navigate("docpro",!0)');
    expect(zapis).toBeGreaterThan(0);
    expect(nawigacja).toBeGreaterThan(zapis);
  });

  it('monitor konsumuje zamiar także ze zdarzenia storage z innej ramki', () => {
    expect(MONITOR).toContain('if(o==="vilda:gh-jump"){setTimeout(N,700);return}');
    // Kontrola pozytywna: dotychczasowa gałąź punktów GH zostaje nietknięta.
    expect(MONITOR).toContain('/ghTherapyPoints/.test(String(o))');
  });
});

describe('G27b — skok mówi reszcie aplikacji, że zmienił się pacjent', () => {
  const rozgloszenie = () => {
    const i = MONITOR.indexOf('new window.CustomEvent("vilda:patient-loaded"');
    expect(i, 'rozgłoszenie w gh_therapy_monitor.js').toBeGreaterThan(0);
    return MONITOR.slice(i - 200, i + 420);
  };

  it('rozgłasza vilda:patient-loaded ze znacznikiem skipLoadChoice', () => {
    expect(rozgloszenie()).toContain('source:"pick",skipLoadChoice:!0');
  });

  it('detal ma ten sam kształt, co istniejące ścieżki source:"pick"', () => {
    const r = rozgloszenie();
    for (const pole of ['patientId:', 'savedAtISO:', 'snapshotCount:', 'name:']) {
      expect(r, pole).toContain(pole);
    }
  });

  it('odświeża chip pacjenta — inaczej zostałby przy poprzednim nazwisku', () => {
    expect(MONITOR).toContain('window.VildaChrome.refreshPatientChip()');
  });

  it('rozgłasza synchronicznie, przed setTimeout-em odświeżającym monitor', () => {
    const dispatch = MONITOR.indexOf('new window.CustomEvent("vilda:patient-loaded"');
    const timeout = MONITOR.indexOf('typeof window.refreshGHTherapyMonitor=="function"&&window.refreshGHTherapyMonitor()}catch{}pe(n.ghPointId)');
    // Bez tej asercji test byłby zielony także wtedy, gdy rozgłoszenia nie ma wcale (indexOf → −1).
    expect(dispatch, 'rozgłoszenie istnieje').toBeGreaterThan(0);
    expect(timeout).toBeGreaterThan(dispatch);
  });

  it('nie rusza zapisu obu magazynów z raty 1', () => {
    expect(MONITOR).toContain('window.sessionStorage.setItem("vildaCurrentPatientId",n.patientId)');
    expect(MONITOR).toContain('window._vildaCurrentPatientId=n.patientId');
  });
});

describe('G27b — bramka modalu „Co chcesz zrobić?" jest wąska', () => {
  it('wycisza modal tylko dla zdarzenia, które samo o to prosi', () => {
    expect(FIXES).toContain('if(n&&n.detail&&n.detail.skipLoadChoice===!0)return;');
  });

  it('zwykłe wczytanie pacjenta dostaje modal jak dotąd', () => {
    // Kontrola pozytywna: sama ścieżka pokazania modalu zostaje nietknięta.
    expect(FIXES).toContain('try{setTimeout(function(){M(n&&n.detail)},0)}catch{}');
  });
});
