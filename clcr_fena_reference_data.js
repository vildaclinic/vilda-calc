(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrFenaReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // These are conditional AKI decision aids, NOT a healthy reference interval.
  // Age >=18 is the application's conservative display eligibility policy,
  // corresponding to the adult meta-analysis, not a biological discontinuity.
  const DEFAULT_POLICY = freeze({
    id: "FENA_CONDITIONAL_AKI_2026_10", version: 1,
    quantity: "fractional-excretion-sodium", unit: "%",
    population: { label: "Dorośli z AKI; największa przydatność przy oligurycznym AKI bez PChN i diuretyków", minimumAgeYears: 18 },
    referenceKind: "conditional-aki-helper", thresholds: { low: "1", high: "2", lowInclusive: false, highInclusive: false },
    sources: [
      { id: "KDIGO_AKI_2012_APPENDIX", label: "KDIGO AKI 2012 — Online Appendices A–F", url: "https://kdigo.org/wp-content/uploads/2016/10/KDIGO-AKI-Suppl-Appendices-A-F_March2012.pdf", locator: "Tabela 12, s. 66; wzór i ograniczenia, s. 67–68", version: "2012", population: "Kliniczna ocena AKI; progi pomocnicze, bez norm zdrowej populacji" },
      { id: "ABDELHAFEZ_CJASN_2022", label: "Abdelhafez i wsp., CJASN 2022", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9269645/", doi: "10.2215/CJN.14561121", locator: "Metody, wyniki i dyskusja; metaanaliza 19 badań/1287 pacjentów", version: "2022", population: "Dorośli ≥18 lat z AKI; próg 1%: 15 badań/872 osoby" },
      { id: "SCHREUDER_NEPHRON_2017", label: "Schreuder i wsp., Nephron 2017", url: "https://karger.com/nef/article/136/3/221/227002/Interpretation-of-the-Fractional-Excretion-of", doi: "10.1159/000468547", locator: "Metody, wyniki i dyskusja; 761 wybranych pacjentów ambulatoryjnych, dane ze zbiórki dobowej", version: "2017", population: "Wiek 4–18 lat, GFR >60; nie kohorta zdrowej populacji ani norma próbki punktowej" },
      { id: "SEGAR_PRETERM_2021", label: "Segar i wsp., Pediatr Nephrol 2021;36:3693–3698", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8815317/", doi: "10.1007/s00467-021-05119-3", locator: "Metody i wyniki: bardzo wczesne wcześniactwo, około drugiego tygodnia życia", version: "2021", population: "Urodzeni w 22–23+6 tygodniu ciąży; średnie kohorty nie są normami" },
    ],
    restrictions: {
      universalNormalRangeAvailable: false, diagnosesAKI: false, diagnosesEtiology: false,
      supportsTreatmentDecisionAlone: false, unknownFactsAreConfirmedAbsent: false,
      stableKidneyFunctionAssumed: false, noAKIAssumed: false, assayStandardizationRequired: false,
      sameUrineSpecimenRequired: true, contemporaneousBloodRequired: true,
      intermediateBandPolicy: "Przedział między progami obejmuje oba końce. To polityka prezentacji, nie osobny źródłowy zakres prawidłowy.",
      agePolicy: "Próg wieku ≥18 lat wynika z zakresu metaanalizy dorosłych i służy wyłącznie doborowi pomocy interpretacyjnej. Nie stanowi normy zależnej od wieku.",
    },
    notes: {
      referenceLabel: "Progi pomocnicze w AKI (dorośli)", educationalReferenceLabel: "Progi edukacyjne w AKI (dorośli)",
      low: "Przy AKI z oligurią FENa <1% może wspierać podejrzenie zmniejszonej perfuzji nerek. Sam wynik nie ustala przyczyny.",
      middle: "Wynik między progami — sama FENa nie rozstrzyga mechanizmu AKI.",
      high: "Przy AKI z oligurią FENa >2% może wspierać podejrzenie uszkodzenia cewek. Diuretyki i PChN także mogą zwiększać FENa.",
      child: "Znaczenie FENa zależy od czynności nerek i podaży sodu. U noworodków i wcześniaków także od dojrzałości nerek.",
      unknown: "FENa wymaga oceny w kontekście klinicznym. Brak wieku nie blokuje poprawnego wyniku liczbowego.",
      diuretic: "Diuretyk ogranicza przydatność tych progów. Sam wynik nie ustala przyczyny AKI.",
      ckd: "Przewlekła choroba nerek ogranicza przydatność tych progów. Sam wynik nie ustala przyczyny AKI.",
      both: "Diuretyk i przewlekła choroba nerek ograniczają przydatność tych progów. Sam wynik nie ustala przyczyny AKI.",
      sample: "Zakładamy oznaczenie sodu i kreatyniny w tej samej próbce moczu oraz równocześnie pobranej próbce krwi, jeśli nie zgłoszono inaczej.",
      diagnosis: "FENa nie ma uniwersalnej normy dla wieku. Nie rozpoznaje samodzielnie AKI, jego przyczyny ani wskazania do płynoterapii.",
      scope: "Największa przydatność progów dotyczy oligurycznego AKI bez PChN i diuretyków. Brak informacji o tych czynnikach nie potwierdza ich nieobecności.",
      conversion: "Kreatyninę przeliczamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L. Dla sodu mmol/L i mEq/L są liczbowo równoważne.",
      noPolicy: "Nie dobrano polityki pomocniczej interpretacji. FENa wymaga oceny w kontekście klinicznym.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
