import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-PUB2 (decyzja właściciela 2026-09-12): reguły wag konsensusu w profilu przedwczesnego /
// wczesnego pokwitania (profil z vilda_puberty_profile.js, przekazany do karty jako input.pubertyProfile):
// RWT i Khamis–Roche poza konsensusem (w obu profilach — decyzja właściciela), Bayley–Pinneau z tablicy
// przeciętnej (adapter) i przedział ×1,3, TW Mark II orientacyjna, MPH z pełną wagą przed menarche,
// zdanie „konsensus wobec celu rodzicielskiego" (progi 5 cm / −2 SDS). Dane FIKCYJNE.

function load() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}
const C = load();
const LMS = { L: 1, M: 165, S: 0.037 }; // dorosła kobieta: mediana 165, SD ≈ 6,1 cm (fikcyjne, kształt jak OLAF 18 l)
const BAZA = {
  sex: 'F', ageYears: 7.5, ageMonths: 90, boneAgeYears: 9.5, currentHeightCm: 130, currentWeightKg: 28, mphCm: 168, adultMedianHeightCm: 165,
  adultHeightLMS: LMS,
  bp: { available: true, predictedAdultHeightCm: 158.0, errorBoundHalfWidthCm: 5.7, groupOverrideApplied: true, groupAutoKey: 'accelerated', autoGroupPredictedAdultHeightCm: 162.4 },
  rwt: { available: true, predictedAdultHeightCm: 171.0, errorBoundHalfWidthCm: 4.9 },
  khamis: { available: true, predictedAdultHeightCm: 172.5 },
  tw2: { available: true, predictedAdultHeightCm: 160.0, errorBoundHalfWidthCm: 5.6, residualSdCm: 3.4, table: '3.1a', rowAge: 7.5, notes: [] },
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'moderate' }, rwt: { levelKey: 'moderate' } } },
};
const PROFIL = {
  profil: 'przedwczesne', kategoriaStartu: 'przedwczesne', tempo: 'szybkie', etykieta: 'przedwczesne pokwitanie (tempo szybkie)',
  gnrha: { status: '', wTrakcie: false, poLeczeniu: false }, dowody: ['start pokwitania w wieku 7 l — przedwczesne (próg 8/9 l)'], braki: [],
};
// kontrola: to samo dziecko bez profilu (adapter bez override → BP z tablicy przyspieszonej 162,4)
const STANDARD = { ...BAZA, bp: { available: true, predictedAdultHeightCm: 162.4, errorBoundHalfWidthCm: 5.7, groupOverrideApplied: false, groupAutoKey: 'accelerated' } };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Reguły profilu', () => {
  it('aktywne w profilu przedwczesnym, wczesnym i przy GnRHa (poza po menarche); nieaktywne bez profilu, w standardowym i nieznanym', () => {
    expect(C._pubertyRulesFor(null)).toMatchObject({ active: false });
    expect(C._pubertyRulesFor({ profil: 'standardowy' })).toMatchObject({ active: false });
    expect(C._pubertyRulesFor({ profil: 'nieznany' })).toMatchObject({ active: false });
    expect(C._pubertyRulesFor({ profil: 'przedwczesne', tempo: 'szybkie' })).toMatchObject({ active: true, label: 'przedwczesnego pokwitania', tempo: 'szybkie' });
    expect(C._pubertyRulesFor({ profil: 'wczesne' })).toMatchObject({ active: true, label: 'wczesnego pokwitania' });
    expect(C._pubertyRulesFor({ profil: 'nieznany', gnrha: { wTrakcie: true } })).toMatchObject({ active: true, gnrhaWTrakcie: true, label: 'leczonego przedwczesnego pokwitania' });
    expect(C._pubertyRulesFor({ profil: 'po-menarche', kategoriaStartu: 'wczesne', gnrha: { poLeczeniu: true } })).toMatchObject({ active: false, gnrhaPo: true, kategoriaStartu: 'wczesne' });
  });
  it('bramki: RWT i KR poza konsensusem w profilu niezależnie od Δ; BP i TW2 bez bramki; bez profilu jak dotąd', () => {
    const wcz = { active: true, label: 'wczesnego pokwitania', profil: 'wczesne' };
    expect(C._gateFor('rwt', 6, { pubertyRules: wcz })).toMatchObject({ excluded: true, factor: 0 });
    expect(C._gateFor('rwt', 6, { pubertyRules: wcz }).note).toContain('w profilu wczesnym jak w przedwczesnym — decyzja właściciela');
    expect(C._gateFor('khamis', null, { pubertyRules: wcz })).toMatchObject({ excluded: true, factor: 0 });
    expect(C._gateFor('khamis', null, { pubertyRules: wcz }).note).toContain('nie zna wieku kostnego ani stadium pokwitania');
    expect(C._gateFor('bp', 36, { pubertyRules: wcz })).toMatchObject({ excluded: false, factor: 1 });
    expect(C._gateFor('tw2', 36, { pubertyRules: wcz })).toMatchObject({ excluded: false, factor: 1 });
    expect(C._gateFor('rwt', 6, { pubertyRules: { active: false } })).toMatchObject({ excluded: false, factor: 1 });
    expect(C._gateFor('rwt', 36)).toMatchObject({ excluded: false, factor: 0.5 });
  });
});

describe('Konsensus w profilu przedwczesnym — dziewczynka 7 l 6 mies., BA 9,5, MPH 168', () => {
  it('bez profilu (kontrola): RWT ×0,5 i KR poza z bramki Δ +24, BP preferowana, konsensus 164,6', () => {
    const r = C.computeFinalHeightPrediction(STANDARD);
    expect(r.pubertyRulesActive).toBe(false);
    expect(r.targetAssessment).toBeNull();
    expect(r.excludedMethods).toEqual(['khamis']);
    expect(r.preferredKey).toBe('bp');
    expect(r.cm).toBeCloseTo(164.6, 0);
    expect(r.methods.find((m) => m.key === 'bp')).toMatchObject({ errorHalfWidthCm: 5.7, profileSigmaFactor: 1 });
    expect(r.methods.find((m) => m.key === 'tw2')).toMatchObject({ levelKey: 'lowered' });
  });
  it('z profilem: RWT i KR poza, BP ±5,7 → ±7,4 (×1,3), TW2 orientacyjna, konsensus 161,2 z MPH pełnej wagi (udział 26 %)', () => {
    const r = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: PROFIL });
    expect(r.pubertyRulesActive).toBe(true);
    expect(r.excludedMethods).toEqual(['rwt', 'khamis']);
    expect(r.methods.find((m) => m.key === 'rwt').gateNote).toContain('rażąco zawyża (Zachmann 1978)');
    expect(r.methods.find((m) => m.key === 'bp')).toMatchObject({ cm: 158, profileSigmaFactor: 1.3, bpGroupOverride: true, excluded: false });
    expect(r.methods.find((m) => m.key === 'bp').errorHalfWidthCm).toBeCloseTo(7.41, 2);
    expect(r.methods.find((m) => m.key === 'tw2')).toMatchObject({ levelKey: 'indicative', excluded: false });
    expect(r.cm).toBeCloseTo(161.2, 0);
    expect(r.mphInConsensus).toBe(true);
    expect(r.mphWeightFactor).toBe(1); // pełna waga przed menarche
    expect(r.mphShare).toBeCloseTo(0.26, 1);
    expect(r.preferredKey).toBe('tw2');
    expect(r.halfWidthCm).toBeCloseTo(5.6, 5);
  });
  it('zdanie „konsensus wobec celu": −6,8 cm (−1,3 SD celu), −0,6 SDS norm dorosłych → poniżej celu; profil wczesny i GnRHa w trakcie liczą tak samo', () => {
    const r = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: PROFIL });
    expect(r.targetAssessment).toMatchObject({ tier: 'ponizej-celu', tierLabel: 'poniżej celu' });
    expect(r.targetAssessment.diffCm).toBeCloseTo(-6.8, 1);
    expect(r.targetAssessment.targetSd).toBeCloseTo(-1.33, 1);
    expect(r.targetAssessment.adultSds).toBeCloseTo(-0.62, 1);
    const w = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: { ...PROFIL, profil: 'wczesne', kategoriaStartu: 'wczesne', tempo: 'wolne' } });
    expect(w.cm).toBeCloseTo(r.cm, 5);
    expect(w.excludedMethods).toEqual(['rwt', 'khamis']);
    const g = C.computeFinalHeightPrediction({ ...BAZA, pubertyProfile: { ...PROFIL, profil: 'nieznany', tempo: 'nieoceniane', gnrha: { status: 'w-trakcie', wTrakcie: true, poLeczeniu: false } } });
    expect(g.pubertyRulesActive).toBe(true);
    expect(g.cm).toBeCloseTo(r.cm, 5);
  });
  it('progi zdania: < −2 SDS norm dorosłych → niskorosłość dorosła; ≥ 5 cm poniżej MPH → poniżej celu; inaczej w zakresie; bez MPH i LMS — brak zdania', () => {
    expect(C._adultSdsFor(152, LMS)).toBeCloseTo(-2.13, 2);
    expect(C._adultSdsFor(152, { L: 0, M: 165, S: 0.037 })).toBeCloseTo(Math.log(152 / 165) / 0.037, 6);
    expect(C._targetAssessmentFor(152, 168, LMS)).toMatchObject({ tier: 'niskoroslosc-dorosla', diffCm: -16 });
    expect(C._targetAssessmentFor(162.9, 168, LMS)).toMatchObject({ tier: 'ponizej-celu' });
    expect(C._targetAssessmentFor(163.1, 168, LMS)).toMatchObject({ tier: 'w-zakresie-celu' });
    expect(C._targetAssessmentFor(170, 168, LMS)).toMatchObject({ tier: 'w-zakresie-celu' });
    expect(C._targetAssessmentFor(170, null, LMS)).toMatchObject({ tier: 'w-normie-doroslych', tierLabel: 'w normie dorosłych', diffCm: null }); // GROWTH-PRED-PUB4: bez MPH nie ma „celu"
    expect(C._targetAssessmentFor(170, null, null)).toBeNull();
    expect(C._targetAssessmentFor(152, null, LMS)).toMatchObject({ tier: 'niskoroslosc-dorosla' });
    expect(C.TARGET_BELOW_CM).toBe(5);
    expect(C.ADULT_SHORT_SDS).toBe(-2);
    expect(C.PUB_BP_SIGMA_FACTOR).toBe(1.3);
  });
  it('po menarche ze startem wczesnym: reguły profilu nieaktywne (działa profil po menarche), ale zdanie wobec celu jest', () => {
    const r = C.computeFinalHeightPrediction({ ...BAZA, postmenarcheal: true, menarcheAgeYears: 7.2, pubertyProfile: { profil: 'po-menarche', kategoriaStartu: 'wczesne', tempo: 'szybkie', etykieta: 'po menarche (start wczesne)', gnrha: {} } });
    expect(r.pubertyRulesActive).toBe(false);
    expect(r.postmenarcheal).toBe(true);
    expect(r.methods.find((m) => m.key === 'rwt').gateNote).toContain('nie zna statusu menarche');
    expect(r.targetAssessment).not.toBeNull();
    expect(r.mphWeightFactor).toBe(0.25);
    const s = C.computeFinalHeightPrediction({ ...BAZA, postmenarcheal: true, menarcheAgeYears: 12.5, ageYears: 13, ageMonths: 156, pubertyProfile: { profil: 'po-menarche', kategoriaStartu: 'prawidlowe', gnrha: {} } });
    expect(s.targetAssessment).toBeNull();
  });
});

describe('Karta', () => {
  it('z profilem: akapit reguł, nota o tablicy przeciętnej z wartością tablicy przyspieszonej, tempo szybkie, zdanie wobec celu; bez zdania „w przygotowaniu"', () => {
    const t = text(C.render({ ...BAZA, pubertyProfile: PROFIL }));
    expect(t).toContain('Konsensus wobec celu rodzicielskiego: −6,8 cm (−1,3 SD celu; cel ±10 cm); wobec norm dorosłych −0,6 SDS — poniżej celu');
    expect(t).toContain('Reguły konsensusu w profilu przedwczesnego pokwitania: RWT i Khamis–Roche poza konsensusem (Zachmann 1978); Bayley–Pinneau z tablicy „przeciętnej" zamiast „przyspieszonej" (Kauli 1997; Tanaka 2005; Brito 2008; Mul 2005) — tablica przyspieszona dałaby 162,4 cm, przedział ×1,3 w profilu przedwczesnego pokwitania (Erkko 2025: SD 6,6 cm u 6–8-latek); TW Mark II orientacyjna (tablice z dzieci o prawidłowym czasie dojrzewania); MPH jako kotwica z pełną wagą (×0,25 dopiero po menarche).');
    expect(t).toContain('Tempo szybkie: bez leczenia wzrost ostateczny bywa 5–8 cm poniżej celu (Kauli 1997)');
    expect(t).toContain('Bayley–Pinneau 158,0 cm ±7,4');
    expect(t).toContain('RWT: poza konsensusem w profilu przedwczesnego pokwitania');
    expect(t).toContain('W profilu przedwczesnego / wczesnego pokwitania użyto tablicy dla dzieci „przeciętnych"');
    expect(t).toContain('Poziom orientacyjny w profilu przedwczesnego pokwitania — tablice Tannera pochodzą z dzieci o prawidłowym czasie dojrzewania');
    expect(t).not.toContain('w przygotowaniu');
    expect(t).not.toContain('dzieci przyspieszone o ponad 2 lata osiągają zwykle wzrost wyższy');
  });
  it('tempo wolne i chłopiec: noty Jang 2023 i Lazar 2001 / Cho 2026; GnRHa w trakcie: ostrożność (Lazar 2007); bez profilu — bez akapitu i bez zdania wobec celu', () => {
    const boy = text(C.render({ ...BAZA, sex: 'M', tw2: null, adultHeightLMS: { L: 1, M: 178, S: 0.038 }, mphCm: 176, pubertyProfile: { ...PROFIL, profil: 'wczesne', tempo: 'wolne', etykieta: 'wczesne pokwitanie (tempo wolne)', wskazniki: { tannerStadium: 3 } } }));
    expect(boy).toContain('Reguły konsensusu w profilu wczesnego pokwitania: RWT i Khamis–Roche poza konsensusem (Zachmann 1978; w profilu wczesnym jak w przedwczesnym — decyzja właściciela)');
    expect(boy).toContain('Tempo wolne: metody z wieku kostnego zaniżają o ok. 3–4 cm, a wzrost ostateczny nieleczonych zwykle mieści się w zakresie celu (Jang 2023; Palmert 1999; Léger 2000).');
    expect(boy).toContain('U chłopców Bayley–Pinneau w stadium Tanner 3 zawyża (Lazar 2001)');
    expect(boy).toContain('Prognoza wobec celu rodzicielskiego:'); // jedna metoda aktywna (BP) — zdanie zostaje, podpis bez słowa „konsensus"
    expect(boy).toContain('MPH poza konsensusem (kotwica wchodzi dopiero przy dwóch metodach)'); // GROWTH-PRED-PUB4: tekst mówi, co policzono
    const boy2 = text(C.render({ ...BAZA, sex: 'M', tw2: null, adultHeightLMS: { L: 1, M: 178, S: 0.038 }, mphCm: 176, pubertyProfile: { ...PROFIL, profil: 'wczesne', tempo: 'wolne', etykieta: 'x', wskazniki: { tannerStadium: 2 } } }));
    expect(boy2).not.toContain('Lazar 2001'); // nota o Tanner 3 tylko w stadium ≥ 3
    expect(boy2).toContain('Po GnRHa wzrost ostateczny chłopców był bliski celu (Cho 2026)');
    const gn = text(C.render({ ...BAZA, pubertyProfile: { ...PROFIL, tempo: 'nieoceniane', gnrha: { status: 'w-trakcie', wTrakcie: true, poLeczeniu: false } } }));
    expect(gn).toContain('W trakcie GnRHa liczby Bayley–Pinneau i TW Mark II traktuj ostrożnie');
    const std = text(C.render(STANDARD));
    expect(std).not.toContain('Reguły konsensusu w profilu');
    // GROWTH-PRED-PUB4: bez MPH zdanie mówi o normach dorosłych, nie o celu; BP bez przedziału bez „×1,3"; stare zdanie modelu wiarygodności znika w profilu
    const bezMph = C.computeFinalHeightPrediction({ ...BAZA, mphCm: null, pubertyProfile: PROFIL });
    expect(bezMph.targetAssessment).toMatchObject({ diffCm: null, tier: 'w-normie-doroslych', tierLabel: 'w normie dorosłych' });
    expect(text(C.render({ ...BAZA, mphCm: null, pubertyProfile: PROFIL }))).toContain('Prognoza wobec norm dorosłych (bez wzrostu rodziców): wobec norm dorosłych');
    expect(C._targetAssessmentFor(152, null, LMS)).toMatchObject({ tier: 'niskoroslosc-dorosla' });
    const bezPm = C.computeFinalHeightPrediction({ ...BAZA, bp: { available: true, predictedAdultHeightCm: 158.0, groupOverrideApplied: false, groupAutoKey: 'retarded' }, pubertyProfile: PROFIL });
    expect(bezPm.methods.find((m) => m.key === 'bp')).toMatchObject({ profileSigmaFactor: 1, errorHalfWidthCm: null });
    const bezPmTxt = text(C.render({ ...BAZA, bp: { available: true, predictedAdultHeightCm: 158.0, groupOverrideApplied: false, groupAutoKey: 'retarded' }, pubertyProfile: PROFIL }));
    expect(bezPmTxt).toContain('Bayley–Pinneau z tablicy wg rozbieżności wieku kostnego (grupa opóźniona, więc bez zamiany) (bez przedziału błędu dla tego wieku, więc bez poszerzenia)');
    expect(bezPmTxt).not.toContain('×1,3');
    const zProfilem = text(C.render({ ...BAZA, pubertyProfile: PROFIL, reliabilityModel: { ...BAZA.reliabilityModel, profileStatusLabel: 'Profil standardowy', profileSummaryText: 'Dla tego profilu pokazano standardowe modele Bayley-Pinneau i RWT bez automatycznego modelu preferowanego.' } }));
    expect(zProfilem).not.toContain('pokazano standardowe modele Bayley-Pinneau i RWT');
    const stdSummary = text(C.render({ ...STANDARD, reliabilityModel: { ...BAZA.reliabilityModel, profileStatusLabel: 'Profil standardowy', profileSummaryText: 'Dla tego profilu pokazano standardowe modele Bayley-Pinneau i RWT bez automatycznego modelu preferowanego.' } }));
    expect(stdSummary).toContain('Profil predykcyjny: Profil standardowy. Dla tego profilu pokazano standardowe modele');
    const niski = text(C.render({ ...BAZA, heightSds: -2.5, pubertyProfile: PROFIL }));
    expect(niski).toContain('MPH jako kotwica z wagą ×0,5 (niskorosłość, Blum 2022)');
    expect(std).not.toContain('Konsensus wobec celu rodzicielskiego');
    expect(std).toContain('dzieci przyspieszone o ponad 2 lata osiągają zwykle wzrost wyższy');
  });
});
