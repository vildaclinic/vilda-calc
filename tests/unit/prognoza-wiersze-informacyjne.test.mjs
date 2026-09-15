import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-PUB3 (decyzja właściciela 2026-09-12): wiersze INFORMACYJNE poza konsensusem w profilach
// pokwitaniowych — „Wzrost dla wieku kostnego" (SDS wzrostu dla wieku kostnego przeniesiony na normy
// dorosłych) i model Wu 2023 (dziewczęta z CPP, populacja chińska). Bez wagi, bez wpływu na konsensus,
// widełki i zgodność; nie ma ich w `methods` (opis pacjenta ich nie drukuje). Dane FIKCYJNE.

function load() {
  const win = {};
  loadBrowserScript('vilda_sds_wzrostu.js', win); // P-SDS-5: karta C liczy przez prymitywy silnika
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}
const C = load();
const LMS = { L: 1, M: 165, S: 0.037 };
const BAZA = {
  sex: 'F', ageYears: 7.5, ageMonths: 90, boneAgeYears: 9.5, currentHeightCm: 130, currentWeightKg: 28, mphCm: 168, adultMedianHeightCm: 165,
  adultHeightLMS: LMS, heightSds: -0.5, heightSdsForBoneAge: -2.0,
  bp: { available: true, predictedAdultHeightCm: 158.0, errorBoundHalfWidthCm: 5.7, groupOverrideApplied: true, groupAutoKey: 'accelerated', autoGroupPredictedAdultHeightCm: 162.4 },
  rwt: { available: true, predictedAdultHeightCm: 171.0, errorBoundHalfWidthCm: 4.9 },
  khamis: { available: true, predictedAdultHeightCm: 172.5 },
  tw2: { available: true, predictedAdultHeightCm: 160.0, errorBoundHalfWidthCm: 5.6, residualSdCm: 3.4, table: '3.1a', rowAge: 7.5, notes: [] },
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'moderate' }, rwt: { levelKey: 'moderate' } } },
};
const PROFIL = { profil: 'przedwczesne', kategoriaStartu: 'przedwczesne', tempo: 'szybkie', etykieta: 'przedwczesne pokwitanie (tempo szybkie)', gnrha: {}, dowody: [], braki: [] };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Wzory', () => {
  it('heightFromSds odwraca adultSdsFor (L = 1 i L = 0); wzrost dla wieku kostnego −2,0 SDS → 152,8; Wu 2023 → 163,2', () => {
    expect(C._heightFromSds(-2.0, LMS)).toBeCloseTo(152.79, 2);
    expect(C._adultSdsFor(C._heightFromSds(-1.3, LMS), LMS)).toBeCloseTo(-1.3, 9);
    const l0 = { L: 0, M: 165, S: 0.037 };
    expect(C._adultSdsFor(C._heightFromSds(0.7, l0), l0)).toBeCloseTo(0.7, 9);
    expect(C._heightFromSds(1, null)).toBeNull();
    expect(C.WU2023).toEqual({ hSds: 1.896, hSdsBa: 2.299, th: 0.408, konst: 100.17 });
    const rows = C._infoRowsFor({ heightSds: -0.5, heightSdsForBoneAge: -2.0, mphCm: 168, adultHeightLMS: LMS }, 'F', 130);
    expect(rows.map((r) => r.key)).toEqual(['hba', 'wu2023']);
    expect(rows[0].cm).toBeCloseTo(152.8, 1);
    expect(rows[0].note).toContain('SDS wzrostu dla wieku kostnego −2,00 przeniesiony na normy dorosłych (18 l)');
    expect(rows[0].note).toContain('Oron 2011; Jang 2023');
    expect(rows[1].cm).toBeCloseTo(1.896 * -0.5 + 2.299 * -2.0 + 0.408 * 168 + 100.17, 6); // 163,17
    expect(rows[1].note).toContain('populacja chińska');
  });
  it('braki danych: bez SDS dla wieku kostnego — brak wierszy; chłopiec — tylko wzrost dla wieku kostnego; bez MPH — bez Wu; obcięcie do obecnego wzrostu', () => {
    expect(C._infoRowsFor({ heightSds: -0.5, mphCm: 168, adultHeightLMS: LMS }, 'F', 130)).toEqual([]);
    expect(C._infoRowsFor({ heightSds: -0.5, heightSdsForBoneAge: -2.0, mphCm: 176, adultHeightLMS: { L: 1, M: 178, S: 0.038 } }, 'M', 140).map((r) => r.key)).toEqual(['hba']);
    expect(C._infoRowsFor({ heightSds: -0.5, heightSdsForBoneAge: -2.0, adultHeightLMS: LMS }, 'F', 130).map((r) => r.key)).toEqual(['hba']);
    expect(C._infoRowsFor({ heightSdsForBoneAge: -2.0, mphCm: 168 }, 'F', 130)).toEqual([]); // bez LMS nie ma czego przenieść, a Wu wymaga hSDS
    const cl = C._infoRowsFor({ heightSds: -0.5, heightSdsForBoneAge: -4.0, mphCm: 168, adultHeightLMS: LMS }, 'F', 158);
    expect(cl[0]).toMatchObject({ key: 'hba', cm: 158, clamped: true });
    expect(cl[0].rawCm).toBeCloseTo(140.58, 2);
  });
});

describe('Karta i API', () => {
  it('w profilu przedwczesnym: infoRows w wyniku, konsensus, widełki i `methods` bez zmian (161,2; 4 metody)', () => {
    const r = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: PROFIL });
    expect(r.infoRows.map((x) => [x.key, Math.round(x.cm * 10) / 10])).toEqual([['hba', 152.8], ['wu2023', 163.2]]);
    expect(r.cm).toBeCloseTo(161.2, 0);
    expect(r.methods).toHaveLength(4);
    expect(r.minCm).toBeCloseTo(158, 5);
    expect(r.maxCm).toBeCloseTo(160, 5);
    expect(r.agreementLabel).toBe('dobra');
    const bez = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: PROFIL, heightSdsForBoneAge: null });
    expect(bez.infoRows).toEqual([]);
    expect(bez.cm).toBeCloseTo(r.cm, 9);
  });
  it('bez profilu (standardowy) i w profilu po menarche ze startem prawidłowym — bez wierszy; po menarche ze startem wczesnym — są', () => {
    expect(C.computeFinalHeightPrediction(BAZA).infoRows).toEqual([]);
    expect(C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: { profil: 'standardowy' } }).infoRows).toEqual([]);
    const pm = C.computeFinalHeightPrediction({ ...BAZA, postmenarcheal: true, menarcheAgeYears: 7.2, pubertyProfile: { profil: 'po-menarche', kategoriaStartu: 'wczesne', gnrha: {} } });
    expect(pm.infoRows.map((x) => x.key)).toEqual(['hba', 'wu2023']);
    const pn = C.computeFinalHeightPrediction({ ...BAZA, ageYears: 13, ageMonths: 156, postmenarcheal: true, menarcheAgeYears: 12.5, pubertyProfile: { profil: 'po-menarche', kategoriaStartu: 'prawidlowe', gnrha: {} } });
    expect(pn.infoRows).toEqual([]);
  });
  it('render: wiersze z tagiem „poza konsensusem" po metodach, akapit ze wzorami; bez profilu nic', () => {
    const html = C.render({ ...BAZA, pubertyProfile: PROFIL });
    expect(html).toMatch(/<div class="vgcc-row is-info"><span class="vgcc-nm">Wzrost dla wieku kostnego <span class="vgcc-tag">poza konsensusem<\/span><\/span><span><span class="vgcc-val">152,8 cm<\/span><\/span><\/div>/);
    expect(html).toMatch(/is-info"><span class="vgcc-nm">Wu 2023 \(CPP, dziewczęta\)/);
    expect(html.indexOf('is-info')).toBeGreaterThan(html.indexOf('TW Mark II'));
    const t = text(html);
    expect(t).toContain('Wiersze informacyjne (poza konsensusem, bez wagi): Wzrost dla wieku kostnego 152,8 cm: SDS wzrostu dla wieku kostnego −2,00 przeniesiony na normy dorosłych (18 l)');
    expect(t).toContain('Wu 2023 (CPP, dziewczęta) 163,2 cm: równanie 1,896·hSDS −0,50 + 2,299·hSDS dla wieku kostnego −2,00 + 0,408·cel 168,0 + 100,17');
    expect(t).toContain('Konsensus: 2 metody i MPH, ważony wiarygodnością 161,2 cm; widełki metod 158,0–160,0 cm');
    const stdHtml = C.render(BAZA);
    expect(stdHtml).not.toContain('vgcc-tag'); // „poza konsensusem" w tekście może paść z bramki KR — tag i akapit są tylko dla wierszy informacyjnych
    expect(text(stdHtml)).not.toContain('Wiersze informacyjne');
  });
});
