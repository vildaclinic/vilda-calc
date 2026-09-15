import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-TEMPO etap 5 — STRAŻNIK: tempo wzrastania liczy wyłącznie vilda_tempo_wzrastania.js.
//
// Audyt 2026-09-15 znalazł czternaście fragmentów liczących tempo po swojemu. Pięć etapów
// sprowadziło je do jednego silnika. Ten plik pilnuje, żeby chaos nie odrósł: każdy plik
// produkcyjny poza silnikiem, w którym pojawi się własny wzór tempa albo jeden z dawnych
// pomocników, wywraca CI z nazwą pliku i regułą. Wzorce to odciski usuniętych implementacji
// plus ogólny kształt „(Δwzrost)/((Δmiesiące)/12)".

const SILNIK = 'vilda_tempo_wzrastania.js';
const WYKLUCZONE = /(\.min\.js$|^pdfmake_vfs_fonts\.js$|^service-worker-kalorii\.js$|^vilda_smoke_tests\.js$)/;

const ZAKAZANE = [
  [/\bpickPrev(?:ForLastYear|Fallback)\s*\(/, 'własny dobór pary pomiarów (pickPrevForLastYear / pickPrevFallback)'],
  [/\bvelocityCmPerYear\s*\(/, 'stary adapter velocityCmPerYear() — użyj VildaTempoWzrastania.predkosc()/odcinek()'],
  [/\bgetVelocityThreshold\s*\(/, 'stara drabinka getVelocityThreshold() — progi żyją w VildaTempoWzrastania.prog()'],
  [/\(\s*[\w.$[\]]+\s*-\s*[\w.$[\]]+\s*\)\s*\/\s*\(\s*\(\s*[\w.$[\]]+\s*-\s*[\w.$[\]]+\s*\)\s*\/\s*12\s*\)/, 'wzór (Δwzrost)/((Δmies.)/12) poza silnikiem'],
  [/\/\s*12\s*;\s*return\s+\w+\s*<=\s*0\s*\?\s*null/, 'ciało dawnego adaptera tempa'],
  [/me=\(c-g\)\/12/, 'monitor GH: własne tempo między wizytami'],
  [/\(P\.height-W\.height\)\/X/, 'sejf: własna prędkość wiersza osi czasu'],
  [/n\.gainCm\/M\b/, 'segmenty GH: własne tempo segmentu'],
  [/ye<4\.5/, 'epikryza: nieudokumentowany próg 4,5 cm/rok'],
  [/w<b\*\.8/, 'sejf: heurystyka „spadek o 20 %"'],
  [/Aktualne tempo wzrastania|obliczono jako \\u015Bredni\\u0105|obliczono jako średnią/, 'dawne słownictwo wiersza tempa'],
];

// Konsumenci wołający silnik wprost. Epikryza (vilda_epicrisis_ui.js) i prognoza wzrastania
// w dietetyce (vilda_diet_plan_ui.js) czytają gotowy model `tempo` z karty i nie liczą nic
// same, więc nie muszą znać silnika; strażnik odcisków wyżej pilnuje, że nie ma tam wzoru.
const KONSUMENCI = [
  'vilda_advanced_growth.js', 'growth-basic-module.js', 'vilda_trajectory_analysis.js',
  'vilda_summary_cards.js', 'vilda_patient_summary_copy.js',
  'vilda_auth_ui.js', 'vilda_vault.js', 'gh_therapy_monitor.js', 'gh_therapy_segments.js',
  'app.js',
];

const plikiProdukcyjne = () => fs.readdirSync(korzen)
  .filter((f) => f.endsWith('.js') && !WYKLUCZONE.test(f) && f !== SILNIK)
  .sort();

describe('Strażnik P-TEMPO: jedno miejsce liczenia tempa', () => {
  it('żaden plik produkcyjny poza silnikiem nie liczy tempa po swojemu', () => {
    const naruszenia = [];
    for (const f of plikiProdukcyjne()) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      for (const [re, opis] of ZAKAZANE) {
        const m = re.exec(src);
        if (m) naruszenia.push(`${f}: ${opis} — „${m[0].slice(0, 60)}"`);
      }
    }
    expect(naruszenia, 'własne wzory tempa poza vilda_tempo_wzrastania.js').toEqual([]);
  });

  it('silnik istnieje, sam definiuje wzór i nie ma zależności od DOM', () => {
    const src = fs.readFileSync(path.join(korzen, SILNIK), 'utf8');
    expect(src).toContain('function predkosc(');
    expect(src).toContain('function policz(');
    expect(src).toContain('function odcinek(');
    expect(src).toContain('function formatuj(');
    expect(src).not.toMatch(/document\.|getElementById|localStorage/);
  });

  it('każdy konsument tempa woła silnik', () => {
    for (const f of KONSUMENCI) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      expect(src, f).toContain('VildaTempoWzrastania');
    }
  });

  it('każda strona z konsumentem ładuje silnik (konsumenci wołają go dopiero przy liczeniu), a cache PWA go ma', () => {
    const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));
    for (const strona of strony) {
      const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
      const iM = html.indexOf('vilda_tempo_wzrastania.js?v=');
      for (const k of KONSUMENCI) {
        if (html.indexOf(`${k}?v=`) < 0) continue;
        expect(iM, `${strona}: silnik obecny (strona ładuje ${k})`).toBeGreaterThan(-1);
      }
      // Analiza trajektorii jako jedyna woła silnik przy każdym analyze() — ma go mieć przed sobą.
      const iT = html.indexOf('vilda_trajectory_analysis.js?v=');
      if (iT >= 0) expect(iM, `${strona}: silnik przed analizą trajektorii`).toBeLessThan(iT);
    }
    const sw = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toMatch(/'\/vilda_tempo_wzrastania\.js\?v=\d+'/);
  });

  it('martwe moduły z audytu nie wracają', () => {
    // vilda_height_velocity_sds.js (SDS wg Rikkena i Wita, bez konsumenta) i vilda_summary_inline.js
    // (czytał pole, którego nikt nie zapisywał; klik przechwytywany przez vilda_summary_cards.js).
    for (const f of ['vilda_height_velocity_sds.js', 'vilda_summary_inline.js', 'inline_index_06.js', 'inline_docpro_04.js']) {
      expect(fs.existsSync(path.join(korzen, f)), f).toBe(false);
    }
    const wszystko = [...fs.readdirSync(korzen).filter((f) => f.endsWith('.html')), 'service-worker-kalorii.js', 'vilda_smoke_tests.js'];
    for (const f of wszystko) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      expect(src, f).not.toMatch(/vilda_height_velocity_sds\.js|vilda_summary_inline\.js|VildaHeightVelocitySDS/);
    }
  });
});
