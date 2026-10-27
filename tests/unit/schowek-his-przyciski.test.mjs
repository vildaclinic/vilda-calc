import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';

// P-SCHOWEK-HIS-2 (zlecenie właściciela 2026-10-13: „zrób to samo dla pozostałych przycisków kopiowania").
// Każdy przycisk, który kopiuje TEKST KLINICZNY do wklejenia w systemie szpitalnym, przepuszcza go przez
// VildaSchowek.dlaSystemuSzpitalnego() — inaczej znak spoza Windows-1250 („≥", „−", „Δ", „β"…) wraca
// z HIS-u jako „?". Klucze, tokeny i kody (klucz odzyskiwania, token parowania, kod synchronizacji,
// odcisk) zostają NIETKNIĘTE — to dane, a nie tekst dla człowieka.
//
// Strażnik statyczny pilnuje TRZECH rzeczy, które test zachowania łatwo przeoczy:
//   1. zamiana stoi tuż przy wejściu do drogi kopiowania (obie drogi: Clipboard API i pole zapasowe);
//   2. każda strona z takim przyciskiem ładuje vilda_schowek.js — bez modułu tekst szedłby bez zmian;
//   3. kopie danych technicznych nie przechodzą przez zamianę.
// Zachowanie na prawdziwych stronach: tests/e2e/schowek-his-przyciski.spec.mjs.

const korzen = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const czytaj = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// [plik, kotwica wejścia do drogi kopiowania, ile znaków za kotwicą musi paść zamiana, opis, wywołanie zamiany]
// Pliki czytelne mają własnego pomocnika tekstDlaHis() — jego treść sprawdza osobny test niżej.
const MIEJSCA = [
  ['antibiotic_therapy.js', 'w.includeSuppository=!1));const E=', 400, 'zalecenia antybiotykoterapii (schowek i pole do ręcznego kopiowania)'],
  ['obesity_therapy.js', 'b.addEventListener("click",async function(){const i=', 400, 'zalecenia leczenia otyłości'],
  ['gh_igf_therapy.js', 'function Se(e){if(!e)return;', 400, 'zalecenia hormonu wzrostu / IGF-1'],
  ['thyroid_cancer_kids.js', 'async function oo(o){', 400, 'zalecenia — rak tarczycy u dzieci'],
  ['hypertension_therapy.js', 'function xe(e){if(!e)return Promise.resolve(!1);', 400, 'zalecenia przy nadciśnieniu'],
  ['vilda_diet_recommendations.js', 'function ke(e){', 400, 'zalecenia dietetyczne'],
  ['vilda_epicrisis_ui.js', 'u.addEventListener("click",function(){var w=', 400, 'epikryza („Kopiuj tekst")'],
  ['app.js', 'function copyAdvancedGrowthHistoryText(e){', 400, 'historia obliczeń wzrostowych'],
  ['vilda_auth_ui.js', 'function Il(t,a,n){', 400, 'Karta pacjenta — „Skopiuj podsumowanie wyników"'],
  ['inline_notatki_00.js', 'function P(e){', 400, 'notatki — „Kopiuj"'],
  ['vilda_b64_checklist_ui.js', 'function kopiuj(t) {', 60, 'ściąga B.64', 'tekstDlaHis(t)'],
  ['vilda_patient_narrative_ui.js', 'function kopiuj(t, options) {', 60, 'opis pacjenta', 'tekstDlaHis(t)'],
  ['przelicznik-jednostek.html', 'function copyTextToClipboard(text) {', 80, 'przelicznik jednostek', 'tekstDlaHis(String('],
];

describe('P-SCHOWEK-HIS-2 — przyciski kopiowania tekstu klinicznego idą przez zamianę dla HIS', () => {
  for (const [plik, kotwica, okno, opis, wywolanie = 'dlaSystemuSzpitalnego'] of MIEJSCA) {
    it(`${plik}: ${opis}`, () => {
      const src = czytaj(plik);
      const i = src.indexOf(kotwica);
      expect(i, `kotwica „${kotwica}" w ${plik}`).toBeGreaterThanOrEqual(0);
      expect(src.indexOf(kotwica, i + 1), 'kotwica jednoznaczna').toBe(-1);
      expect(src.slice(i, i + kotwica.length + okno), 'zamiana zaraz przy wejściu do drogi kopiowania')
        .toContain(wywolanie);
    });
  }

  it('pomocnik tekstDlaHis() w plikach czytelnych woła moduł, a bez modułu oddaje tekst bez zmian', () => {
    for (const plik of ['vilda_b64_checklist_ui.js', 'vilda_patient_narrative_ui.js', 'przelicznik-jednostek.html']) {
      const src = czytaj(plik);
      const i = src.indexOf('function tekstDlaHis(');
      expect(i, plik).toBeGreaterThanOrEqual(0);
      const cialo = src.slice(i, i + 300); // pomocnik ma trzy linie
      expect(cialo, plik).toContain('VildaSchowek');
      expect(cialo, plik).toMatch(/dlaSystemuSzpitalnego\((t|str)\) : (t|str)/);
    }
  });

  it('grypa i ospa: zamiana tylko w schowku, wynik na ekranie zostaje bez zmian', () => {
    const src = czytaj('flu_therapy.js');
    // dwa przyciski (grypa, ospa wietrzna) — po jednym zapisie do schowka, oba z zamianą
    const zapisy = src.match(/navigator\.clipboard\.writeText\(/g) || [];
    expect(zapisy).toHaveLength(2);
    expect(src.match(/navigator\.clipboard\.writeText\(\/\*[^*]*\*\/\(function\(x\)\{var S=[^;]*;return S&&typeof S\.dlaSystemuSzpitalnego/g) || [])
      .toHaveLength(2);
    // ekran dostaje surowy tekst — fluSetEscapedHtml(i,e) bez zamiany
    expect(src).toContain('fluSetEscapedHtml(i,e)');
  });

  it('epikryza: droga zapasowa (bez Clipboard API) też kopiuje tekst po zamianie i oddaje lekarzowi jego treść', () => {
    const src = czytaj('vilda_epicrisis_ui.js');
    expect(src).toContain('var Kv=k.value;k.value=w,k.select(),document.execCommand("copy"),k.value=Kv,k.select()');
  });

  it('dane techniczne NIE przechodzą przez zamianę: klucz odzyskiwania, token parowania, kod synchronizacji, odcisk', () => {
    const auth = zrodlo('vilda_auth_ui.js');
    expect(auth).toContain('navigator.clipboard.writeText(t.recoveryKey)');
    expect(auth).toContain('navigator.clipboard.writeText(v)');
    const ustawienia = czytaj('inline_ustawienia_04.js');
    expect(ustawienia, 'kod synchronizacji i odcisk kopiowane bez zamiany').not.toContain('dlaSystemuSzpitalnego');
  });

  it('każda strona z takim przyciskiem ładuje vilda_schowek.js', () => {
    // Moduły z przyciskami kopiowania tekstu klinicznego. Karta pacjenta (vilda_auth_ui.js) pokazuje
    // „Skopiuj podsumowanie wyników" tylko tam, gdzie jest vilda_patient_summary_copy.js.
    const MODULY = [
      'antibiotic_therapy.js', 'obesity_therapy.js', 'gh_igf_therapy.js', 'thyroid_cancer_kids.js',
      'hypertension_therapy.js', 'vilda_diet_recommendations.js', 'flu_therapy.js', 'vilda_epicrisis_ui.js',
      'app.js', 'vilda_patient_summary_copy.js', 'inline_notatki_00.js', 'vilda_b64_checklist_ui.js',
      'vilda_patient_narrative_ui.js', 'vilda_summary_cards.js',
    ];
    const strony = fs.readdirSync(korzen).filter((p) => p.endsWith('.html'));
    const sprawdzone = [];
    for (const strona of strony) {
      const html = czytaj(strona);
      const laduje = (plik) => new RegExp(`<script[^>]+src="${plik.replace('.', '\\.')}(\\?v=\\d+)?"`).test(html);
      const zPrzyciskiem = MODULY.filter(laduje);
      if (strona === 'przelicznik-jednostek.html') zPrzyciskiem.push('copyTextToClipboard (skrypt strony)');
      if (!zPrzyciskiem.length) continue;
      sprawdzone.push(strona);
      expect(laduje('vilda_schowek.js'), `${strona} (${zPrzyciskiem.join(', ')}) bez vilda_schowek.js`).toBe(true);
    }
    // kontrola: strażnik naprawdę coś obejrzał — w tym strony dopisane w P-SCHOWEK-HIS-2
    expect(sprawdzone).toEqual(expect.arrayContaining([
      'index.html', 'docpro.html', 'kalkulator-klirens.html', 'app.html', 'notatki.html',
      'subskrypcja.html', 'terminarz.html', 'ustawienia.html', 'przelicznik-jednostek.html',
    ]));
  });
});
