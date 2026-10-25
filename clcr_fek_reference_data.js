(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrFekReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Normative percentiles and an observed adult study range are intentionally
  // different data kinds. These values never establish a renal-loss diagnosis.
  const DEFAULT_POLICY = freeze({
    id: "FEK_AGE_CONTEXT_2026_10", version: 1, quantity: "fractional-excretion-potassium", unit: "%",
    population: { label: "Źródłowe zdrowe populacje pediatryczne i badanie dorosłych; ocena orientacyjna" },
    profiles: [
      { id: "AENP_2020_INFANT", context: "infant", kind: "healthy-percentile", ageLabel: "1–12 miesięcy", minimumAgeMonthsInclusive: 1, maximumAgeMonthsInclusive: 12,
        lower: "3.8", upper: "27.4", lowerInclusive: true, upperInclusive: true, percentiles: [3, 97], median: "12.2",
        population: { label: "Zdrowe niemowlęta w wieku 1–12 miesięcy", sourceAgeLabel: "1–12 miesięcy", comparison: "orientacyjnie; zdrowa populacja" }, sourceIds: ["AENP_SEQCML_2020"] },
      { id: "AENP_2020_CHILD", context: "child", kind: "healthy-percentile", ageLabel: "1–15 lat", minimumAgeMonthsInclusive: 12, maximumAgeMonthsInclusive: 180,
        lower: "4.6", upper: "20.4", lowerInclusive: true, upperInclusive: true, percentiles: [3, 97], median: "9.6",
        population: { label: "Zdrowe dzieci w wieku 1–15 lat", sourceAgeLabel: "1–15 lat", comparison: "orientacyjnie; zdrowa populacja" }, sourceIds: ["AENP_SEQCML_2020"] },
      { id: "ELISAF_1995_ADULT", context: "adult", kind: "observed-study-range", ageLabel: "21–69 lat", minimumAgeMonthsInclusive: 252, maximumAgeMonthsInclusive: 828,
        lower: "4", upper: "16", lowerInclusive: true, upperInclusive: true,
        population: { label: "312 zdrowych dorosłych w wieku 21–69 lat", sourceAgeLabel: "21–69 lat", comparison: "zakres zaobserwowany; nie przedział referencyjny" },
        sourceIds: ["ELISAF_1995"], serumPotassium: { lower: "3.6", upper: "5.2" }, serumCreatinineUmolL: { lower: "53", upper: "124" } },
    ],
    // This is an application display condition, not a potassium reference
    // interval imported from Table 3, and not a diagnosis of hyperkalaemia.
    pediatricComparisonPotassiumWindow: { lower: "3.5", upper: "5.0", lowContextThreshold: "3.5", sourceId: "RCH_PIC_2024" },
    sources: [
      { id: "AENP_SEQCML_2020", label: "AENP/SEQCML — konsensus pediatryczny 2020", url: "https://semedlab.es/wp-content/uploads/2026/02/litiasis_documento-consenso_aenp.pdf#page=12", locator: "Tabela 3, s. 12; przypis b: mediana i P3–P97; sekcja 1.3", version: "2020", population: "Zdrowe niemowlęta 1–12 mies. i dzieci 1–15 lat; zakresy FEK P3–P97", evidence: "Pełny konsensus odczytany; tabela zmodyfikowana z Rodríguez-Soriano 1990. Nie deklarujemy pełnego odczytu pierwotnego badania." },
      { id: "ELISAF_1995", label: "Elisaf i Siamopoulos — FEK u dorosłych, 1995", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2398075/", doi: "10.1136/pgmj.71.834.211", locator: "S. 211–212, metody i tabela wyników", version: "1995", population: "312 zdrowych osób 21–69 lat; 4–16% to zakres obserwowany, nie centyle referencyjne" },
      { id: "RCH_PIC_2024", label: "Royal Children’s Hospital/PIC — zaburzenia potasu", url: "https://www.rch.org.au/clinicalguide/guideline_index/Hyperkalaemia/", locator: "Background; uzupełniająco Hypokalaemia: K <3,5 mmol/L", version: "2024", population: "Dzieci; okno K 3,5–5,0 jest zachowawczą polityką dostępności porównania FEK, nie samodzielną diagnozą" },
      { id: "RCH_HYPOKALAEMIA_2024", label: "Royal Children’s Hospital/PIC — hipokaliemia", url: "https://www.rch.org.au/clinicalguide/guideline_index/hypokalaemia/", locator: "Background, definicja K <3,5 mmol/L", version: "2024", population: "Pediatryczny kontekst obniżonego potasu; bez przenoszenia progów FEK dorosłych" },
      { id: "KDIGO_POTASSIUM_2020", label: "KDIGO — postępowanie w zaburzeniach potasu, 2020", url: "https://kdigo.org/wp-content/uploads/2018/04/KDIGO-Potassium-Management-Final-publication.pdf", doi: "10.1016/j.kint.2019.09.018", locator: "Kidney Int 97:42–61, s. 43–44; fizjologia i ograniczenia", version: "2020", population: "Znaczenie kaliemii, czynności nerek, przepływu dystalnego, podaży potasu i leków" },
    ],
    restrictions: {
      universalNormalRangeAvailable: false, diagnosesRenalPotassiumLoss: false, diagnosesEtiology: false,
      supportsTreatmentDecisionAlone: false, unknownFactsAreConfirmedAbsent: false,
      assayStandardizationRequired: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false,
      sameUrineSpecimenRequired: true, contemporaneousBloodRequired: true,
      pediatricComparisonIsOrientational: true, adultObservedRangeIsReferenceInterval: false,
      agePolicy: "Zachowujemy rozdzielczość ukończonych lat/miesięcy; cały możliwy przedział wieku musi mieścić się w danych źródłowych. Przy 12 mies. pokazujemy dwa zakresy bez wspólnej klasyfikacji. Nie rozszerzamy źródła ponad 15 lat.",
      potassiumWindowPolicy: "K 3,5–5,0 mmol/L jest warunkiem dostępności orientacyjnego porównania pediatrycznego; K >5,0 nie oznacza automatycznej hiperkaliemii.",
    },
    notes: {
      pediatricScope: "Zakresy orientacyjne P3–P97 ze zdrowej populacji opisanej w konsensusie AENP/SEQCML 2020, tabela 3. Nie są progami rozpoznania nerkowej utraty potasu podczas hipokaliemii.",
      comparisonScope: "Porównanie pediatryczne pokazujemy przy potasie we krwi 3,5–5,0 mmol/L. To zachowawczy warunek dostępności porównania, nie potwierdzenie zdrowia lub prawidłowego GFR. Poza tym oknem nie nadajemy FEK uspokajającej oceny zdrowej populacji.",
      adultStudyScope: "U 312 zdrowych dorosłych w wieku 21–69 lat opisano FEK 4–16%. Jest to zakres zaobserwowany, a nie przedział referencyjny P3–P97. Nie nadajemy na tej podstawie statusu prawidłowego lub nieprawidłowego.",
      adultComparisonWindow: "Zakres obserwowany pokazujemy przy wieku mieszczącym się w 21–69 latach, K 3,6–5,2 mmol/L i kreatyninie 53–124 µmol/L, bez znanych czynników zmieniających ocenę. Zgodność z tymi wartościami nie dowodzi prawidłowej czynności nerek.",
      referenceAgeBoundaries: "Przy 12 miesiącach źródłowe przedziały wieku nakładają się: pokazujemy dwa zakresy neutralnie. Zachowujemy rozdzielczość ukończonych lat i miesięcy; nie rozciągamy norm na noworodki ani ponad źródłowe 15 lat. Wiek obejmujący niepokrytą granicę nie otrzymuje zastępczej normy.",
      referenceLabel: "Norma dla wieku", inactiveReferenceLabel: "Zakres zdrowej populacji", adultReferenceLabel: "Zakres w badaniu dorosłych", ambiguousReferenceLabel: "Dwa zakresy dla wieku",
      within: "Zakres zdrowej populacji nie rozstrzyga o nerkowej utracie potasu. Wynik zależy od potasu we krwi i czynności nerek.",
      outside: "Wynik jest poza zakresem zdrowej populacji. Oceń go łącznie z potasem we krwi, czynnością nerek i leczeniem.",
      hypokalemia: "Przy hipokaliemii FEK ocenia się inaczej niż zakres zdrowej populacji. Wynik sam nie ustala przyczyny utraty potasu.",
      potassiumContext: "Potas we krwi jest poza przedziałem przyjętym do porównania ze zdrową populacją. Nie nadajemy FEK statusu prawidłowego lub nieprawidłowego.",
      adult: "To zakres zaobserwowany u zdrowych dorosłych, nie uniwersalna norma. FEK wymaga oceny z potasem we krwi, czynnością nerek i leczeniem.",
      ambiguousAge: "Przedziały wieku w źródle nakładają się lub podany wiek obejmuje ich granicę. Pokazujemy osobne zakresy bez łączenia w jedną normę.",
      noAge: "Nie dobrano zakresu dla wieku. FEK wymaga oceny z potasem we krwi i czynnością nerek; brak wieku nie blokuje liczby.",
      outsideAge: "Dla podanego przedziału wieku nie dobrano odpowiedniego zweryfikowanego zakresu. Nie przenosimy norm sąsiedniej grupy wieku.",
      neonate: "Dla noworodków nie stosujemy zakresów starszych niemowląt ani dzieci. Wynik wymaga oceny z potasem we krwi i dojrzałością nerek.",
      confounders: "Znane czynniki wpływają na FEK. Sam wynik nie ustala przyczyny utraty potasu ani nie potwierdza prawidłowej odpowiedzi nerek.",
      sample: "Zakładamy oznaczenie potasu i kreatyniny w tej samej próbce moczu oraz równocześnie pobranej próbce krwi, jeśli nie zgłoszono inaczej.",
      conversion: "Kreatyninę sprowadzamy do wspólnej jednostki: 1 mg/dL = 88,4 µmol/L. Dla potasu 1 mmol/L = 1 mEq/L.",
      noPolicy: "Nie dobrano polityki porównania FEK. Liczba pozostaje dostępna; oceń ją z potasem we krwi i czynnością nerek.",
      diagnosis: "Zakres zdrowej populacji nie służy samodzielnemu rozpoznawaniu nerkowej utraty potasu podczas hipokaliemii.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
