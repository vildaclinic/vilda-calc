import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const html = fs.readFileSync(
  path.join(repositoryRoot, 'kalkulator-klirens.html'),
  'utf8'
);
const formulas = fs.readFileSync(
  path.join(repositoryRoot, 'inline_kalkulator_klirens_02.js'),
  'utf8'
);
const engine = fs.readFileSync(
  path.join(repositoryRoot, 'inline_kalkulator_klirens_04.js'),
  'utf8'
);
const safety = fs.readFileSync(
  path.join(repositoryRoot, 'clcr_clinical_safety.js'),
  'utf8'
);
const dialysisSafety = fs.readFileSync(
  path.join(repositoryRoot, 'clcr_dialysis_safety.js'),
  'utf8'
);
const stoneSafety = fs.readFileSync(
  path.join(repositoryRoot, 'clcr_stone_safety.js'),
  'utf8'
);
const extendedEgfr = fs.readFileSync(
  path.join(repositoryRoot, 'clcr_extended_egfr.js'),
  'utf8'
);

describe('Klirens — blokady źródłowe etapu 0', () => {
  it('nie zawiera alternatywnych wejść omijających politykę Legacy/PIDI', () => {
    expect(engine).not.toContain('function kSchwartzVar');
    expect(engine).not.toContain('function clCrSchwartzVar');
    expect(engine).not.toContain('function ktvDaugirdas');
    expect(engine).not.toContain('function eKtV');
    expect(engine).not.toMatch(/\bKT_V\s*=/);
    expect(safety).not.toContain('computeDaugirdas');
  });

  it('przygotowuje raport AI wyłącznie lokalnie i nie wysyła danych pacjenta do API', () => {
    expect(engine).toContain('navigator.clipboard.writeText(_)');
    expect(engine).not.toContain('api.openai.com');
    expect(engine).not.toContain('/v1/chat/completions');
    expect(engine).not.toMatch(/Authorization\s*:\s*`Bearer/);
    expect(html).toContain(
      'aplikacja nie wysyła danych pacjenta do zewnętrznego API'
    );
  });

  it('nie zawiera wycofanych etykiet i błędnych komunikatów', () => {
    const source = `${html}\n${formulas}\n${engine}\n${safety}`;
    expect(source).not.toMatch(/CKD.?EPI.{0,24}2022/i);
    expect(source).not.toContain('Klasyfikacja PChN');
    expect(source).not.toMatch(/G5.{0,40}dializ/i);
    expect(engine).not.toContain('"Cys_mmol"');
    expect(source).not.toMatch(/35.{0,24}mg\/kg/i);
  });

  it('ładuje centralny moduł bezpieczeństwa przed rejestrem i silnikiem', () => {
    const safetyIndex = html.indexOf('clcr_clinical_safety.js');
    const stoneIndex = html.indexOf('clcr_stone_safety.js');
    const dialysisIndex = html.indexOf('clcr_dialysis_safety.js');
    const extendedIndex = html.indexOf('clcr_extended_egfr.js');
    const formulasIndex = html.indexOf('inline_kalkulator_klirens_02.js');
    const engineIndex = html.indexOf('inline_kalkulator_klirens_04.js');

    expect(safetyIndex).toBeGreaterThan(-1);
    expect(stoneIndex).toBeGreaterThan(safetyIndex);
    expect(dialysisIndex).toBeGreaterThan(stoneIndex);
    expect(extendedIndex).toBeGreaterThan(dialysisIndex);
    expect(extendedIndex).toBeLessThan(formulasIndex);
    expect(safetyIndex).toBeLessThan(formulasIndex);
    expect(formulasIndex).toBeLessThan(engineIndex);
  });

  it('rejestruje CKiD U25 i ograniczoną ścieżkę noworodka donoszonego', () => {
    const source = `${html}\n${formulas}\n${engine}\n${safety}`;
    expect(formulas).toContain('id: "ckid_u25"');
    expect(formulas).toContain('id: "neonatal_egfr"');
    expect(html).toContain('id="ageDays"');
    expect(html).toContain('id="neonatalTermStatus"');
    expect(html).toContain('id="ScrAssay"');
    expect(html).not.toContain('id="neonatalBirthWeightG"');
    expect(source).toContain('bieżącej masy ciała ≤2,5 kg');
    expect(source).toContain('0,31');
    expect(source).toContain('nie został zwalidowany dla wcześniaków');
  });

  it('nie podstawia płci i wymaga jawnego wyboru dla wzorów zależnych od płci', () => {
    expect(html).toMatch(
      /<select id="sex">\s*<option value="" selected>— wybierz —<\/option>/
    );
    expect(formulas).toContain('requires: ["age", "sex", "Scr", "ScrUnit"]');
    expect(engine).toContain('sexKnown = a === "F" || a === "M"');
  });

  it('używa jednej ścieżki TmP/GFR ze sparowanej próbki, nigdy z DZM', () => {
    const source = `${html}\n${formulas}\n${engine}\n${safety}`;
    expect(formulas).toContain('id: "TMP_GFR"');
    expect(source).not.toContain('TRPpct_24');
    expect(source).not.toContain('TmP_24');
    expect(source).not.toMatch(/TmP\/GFR.{0,30}dobowa zbiórka/i);
    expect(engine).not.toContain('function clCr24h');
  });

  it('wymaga metadanych próbki i kompletnego protokołu zbiórki czasowej', () => {
    for (const id of [
      'spotSampleKind',
      'spotSameSpecimen',
      'tmpOvernightFasting',
      'tmpPairedSameTime',
      'spotPairedChemistry',
      'U_Na_spot',
      'S_Na_spot',
      'collectionStartAt',
      'collectionEndAt',
      'collectionStartVoidDiscarded',
      'collectionFinalVoidIncluded',
      'collectionNoMissedVoids',
      'collectionNoSpillage',
      'collectionNoExtraVoids',
      'collectionStorageFollowed',
      'serumSampleDuringCollection',
      'serumSampleAt'
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(formulas).toContain('id: "FENa_spot"');
    expect(formulas).toContain('id: "AGu_spot"');
    expect(formulas).not.toContain('id: "FENa_pct"');
    expect(formulas).not.toContain('id: "AGu"');
  });

  it('stosuje profile EAU wyłącznie do zgodnej populacji i zabezpiecza prompt AI', () => {
    expect(engine).toContain('const refRanges = {}');
    expect(stoneSafety).toContain('EAU Guidelines on Urolithiasis 2026');
    expect(stoneSafety).toContain('interpretPediatricCalciumCreatinineSpot');
    expect(html).toContain('id="oxalateSpotReportingEntity"');
    expect(html).toContain(
      'Cytryniany jako kwas cytrynowy w próbce moczu'
    );
    expect(engine).toContain('stoneCurrentCollectionExactly24h');
    expect(engine).toContain(
      'bieżąca zbiórka trwająca dokładnie 24 godziny'
    );
    expect(engine).toContain('Nie rozszerzaj progów dorosłych na dzieci');
    expect(engine).toContain('Nie klasyfikuj TmP/GFR jako prawidłowego');
  });

  it('ma źródłowe silniki Kt/V i rozszerzonego eGFR bez rozbieżnego checkboxa eksportu', () => {
    expect(dialysisSafety).toContain('GFAC_BY_SCHEDULE_AND_PIDI');
    expect(dialysisSafety).toContain('computeDialysisAdequacy');
    expect(extendedEgfr).toContain('computeCkdEpi2021CrCys');
    expect(extendedEgfr).toContain('computeCkidU25CrCys');
    expect(html).not.toContain('id="includeKTV"');
    expect(engine).not.toContain('getElementById("includeKTV")');
  });

  it('wiąże pamięć wyników tego samego pacjenta z cystatyną C i metadanymi oznaczenia', () => {
    for (const id of [
      'CystatinC',
      'CystatinCStandardization',
      'CystatinCAssayMethod'
    ]) {
      expect(html).toContain(`'${id}'`);
    }
  });
});
