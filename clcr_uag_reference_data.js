(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrUagReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // A mathematical sign boundary is not a healthy-population reference interval.
  // These source-backed comments are conditional; the calculation never assumes NAGMA.
  const DEFAULT_POLICY = freeze({
    id: "UAG_CONTEXT_2026_10", version: 1, quantity: "urine-anion-gap", unit: "mmol/L",
    referenceKind: "sign-boundary", signBoundary: { kind: "sign-boundary", value: 0, unit: "mmol/L" }, profiles: [],
    population: { label: "Dzieci i dorośli; w zweryfikowanych źródłach nie dobrano przedziału referencyjnego punktowego UAG według wieku" },
    sources: [
      { id: "BATLLE_1988", label: "Batlle i wsp. — UAG w kwasicy hiperchloremicznej, 1988", url: "https://doi.org/10.1056/NEJM198803103181002", doi: "10.1056/NEJM198803103181002", locator: "N Engl J Med 318:594–599; badanie wybranych zaburzeń zakwaszania, biegunki i odpowiedzi na NH₄Cl", population: "Wybrane grupy kliniczne i zdrowi po obciążeniu; nie norma wieku dla zwykłej próbki", evidence: "Opis badania pierwotnego i jego zastosowania w późniejszych przeglądach; średnie grupowe nie są granicami normy." },
      { id: "BEREND_2017", label: "Berend — diagnostyka kwasicy z prawidłową luką anionową, 2017", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5757610/", doi: "10.1159/000479279", locator: "Kidney Dis 3:149–159; Urinary Anion Gap", population: "Przegląd kliniczny NAGMA; nie badanie przedziałów referencyjnych", evidence: "Opis ograniczeń przy Na w moczu <20 mmol/L, wysokim pH i wydalaniu anionów innych niż chlorki." },
      { id: "RAPHAEL_2018", label: "Raphael i wsp. — UAG a amon w PChN, 2018", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5967420/", doi: "10.2215/CJN.03770417", locator: "Clin J Am Soc Nephrol 13:205–212; AASK, tabela 3 i dyskusja", population: "1044 dorosłych z PChN, dobowe zbiórki moczu; brak normy stężenia w próbce punktowej", evidence: "Abstrakt oraz indeksowane fragmenty metod, wyników i tabeli. Standardowy UAG słabo odzwierciedlał wydalanie NH₄⁺." },
      { id: "URIBARRI_2021", label: "Uribarri i Oh — ograniczenia interpretacji UAG, 2021", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8259693/", doi: "10.1681/ASN.2020101509", locator: "J Am Soc Nephrol 32:1025–1028", population: "Przegląd krytyczny; dobowe wydalania nie są normą punktowego stężenia", evidence: "Podkreśla wpływ diety, równowagi metabolicznej oraz niewymierzonych jonów." },
      { id: "BONNER_HLADIK_2025", label: "Bonner i Hladik — Renal Tubular Acidosis: Core Curriculum 2025", url: "https://doi.org/10.1053/j.ajkd.2024.08.014", doi: "10.1053/j.ajkd.2024.08.014", locator: "Am J Kidney Dis 85:501–512; s. 505, Identifying the Presence of RTA", population: "Przegląd ekspercki diagnostyki RTA, bez norm punktowego UAG według wieku", evidence: "Pełny PDF z kopii edukacyjnej o zgodnym DOI i paginacji. Autorzy odradzają szacowanie NH₄⁺ za pomocą UAG." },
      { id: "BATLLE_2025", label: "Batlle i wsp. — użyteczność i ograniczenia UAG, 2025", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12708373/", doi: "10.2215/CJN.0000000742", locator: "Clin J Am Soc Nephrol 20:1810–1813", population: "Perspektywa ekspercka i ponowna analiza wcześniejszych danych", evidence: "Indeksowane obszerne fragmenty tekstu. Dopuszcza ograniczone zastosowanie pomocnicze w kwasicy hiperchloremicznej; nie jest jednolitym konsensusem ani normą wieku." },
      { id: "SULYOK_1990", label: "Sulyok i Guignard — UAG i amon u noworodków, 1990", url: "https://pubmed.ncbi.nlm.nih.gov/2310794/", doi: "10.1159/000243169", locator: "Biol Neonate 57:98–106; abstrakt badania", population: "10 wcześniaków, 11 noworodków donoszonych i 25 starszych niemowląt; nie zdrowa kohorta referencyjna", evidence: "Brak korelacji w pierwszych dwóch tygodniach u wcześniaków i w 7. dniu u noworodków donoszonych nie uzasadnia arbitralnej granicy wieku 12 miesięcy ani przedziału normy." },
    ],
    educationalReferences: [
      { label: "<0 mmol/L", sign: "negative", text: "W odpowiednim kontekście może towarzyszyć zwiększonemu wydalaniu NH₄Cl; nie potwierdza samodzielnie prawidłowej odpowiedzi nerek." },
      { label: "0 mmol/L", sign: "zero", text: "Matematyczna granica znaku, bez odrębnej kategorii diagnostycznej." },
      { label: ">0 mmol/L", sign: "positive", text: "W kwasicy hiperchloremicznej może sugerować ograniczoną odpowiedź amonową, ale nie rozpoznaje kwasicy cewkowej. Bez kwasicy może występować fizjologicznie." },
    ],
    restrictions: {
      universalNormalRangeAvailable: false, ageReferenceIntervalAvailable: false, signDiagnosesDisease: false,
      diagnosesRTA: false, excludesRTA: false, directlyMeasuresAmmonium: false, nagmaAssumed: false,
      unknownFactsAreConfirmedAbsent: false, sameUrineSpecimenRequired: true, contemporaneousBloodRequired: false,
      stableKidneyFunctionAssumed: false, noAKIAssumed: false,
    },
    notes: {
      referenceLabel: "Granica znaku", referenceText: "0 mmol/L", referenceHint: "Nie jest granicą normy.",
      sample: "Zakładamy, że wszystkie trzy oznaczenia pochodzą z tej samej próbki moczu, jeśli nie podano inaczej.",
      scope: "W zweryfikowanych źródłach nie dobrano przedziału referencyjnego punktowego UAG według wieku. Zero rozdziela znak, nie stan zdrowia; wiek nie jest potrzebny do obliczenia.",
      negativeTitle: "Ujemna luka anionowa", positiveTitle: "Dodatnia luka anionowa", zeroTitle: "Luka anionowa równa zero",
      negativeInterpretation: "Jeżeli potwierdzono kwasicę metaboliczną z prawidłową luką anionową krwi, ujemny UAG może wskazywać na zwiększone wydalanie amonu. Sam wynik nie rozstrzyga przyczyny kwasicy.",
      positiveInterpretation: "Jeżeli potwierdzono kwasicę metaboliczną z prawidłową luką anionową krwi, dodatni UAG może sugerować ograniczone wydalanie amonu. Sam wynik nie rozpoznaje kwasicy cewkowej.",
      zeroInterpretation: "Suma stężeń sodu i potasu jest równa stężeniu chlorków. Taki wynik sam nie ocenia prawidłowości wydalania amonu.",
      ckdInterpretation: "W PChN UAG słabo odzwierciedla wydalanie amonu. Do jego oceny preferowane jest bezpośrednie oznaczenie NH₄⁺.",
      lowSodiumInterpretation: "Przy małym stężeniu sodu UAG ma ograniczoną przydatność do oceny wydalania amonu. Sam znak wyniku nie określa prawidłowości odpowiedzi nerek.",
      acuteInterpretation: "Znane zaburzenia czynności nerek ograniczają interpretację UAG. Sam znak wyniku nie ocenia wiarygodnie wydalania amonu.",
      lowSodiumWarning: "Na w moczu <20 mmol/L: ograniczona przydatność UAG do oceny wydalania amonu, szczególnie przy hipowolemii.",
      ckdWarning: "Znana PChN ogranicza interpretację UAG.", akiWarning: "Znane lub podejrzewane AKI ogranicza interpretację UAG.", changingWarning: "Szybko zmieniająca się kreatynina wymaga ostrożnej interpretacji UAG.",
      diagnosticContext: "Wskazówki dotyczą wyłącznie potwierdzonej kwasicy metabolicznej z prawidłową luką anionową krwi. Sam UAG nie określa, czy takie zaburzenie występuje.",
      directMeasurement: "Gdy ocena wydalania amonu ma znaczenie diagnostyczne, preferowane jest bezpośrednie oznaczenie NH₄⁺ w moczu, jeśli jest dostępne.",
      disagreement: "Publikacje różnią się w ocenie przydatności UAG: część dopuszcza ograniczone zastosowanie pomocnicze, inne odradzają szacowanie amonu na jego podstawie.",
      confounders: "UAG słabo odzwierciedla wydalanie amonu w PChN. Ocenę utrudniają także małe stężenie sodu w moczu, wysokie pH i wydalanie innych anionów, np. ketonowych.",
      neonates: "U noworodków, szczególnie w pierwszych tygodniach życia, relacja UAG z wydalaniem amonu jest zawodna.",
      respiratoryAlkalosis: "Niskie HCO₃ we krwi może także wynikać z przewlekłej zasadowicy oddechowej; samo nie potwierdza kwasicy metabolicznej.",
      measurementUncertainty: "Różnice bliskie zeru mogą mieścić się w niepewności oznaczeń. Dokładność rachunku nie zwiększa dokładności pomiaru.",
      conversion: "Wszystkie stężenia podaj w mmol/L. Dla jednowartościowych Na⁺, K⁺ i Cl⁻ wartości w mEq/L są liczbowo takie same.",
      noPolicy: "Nie dobrano polityki opisu UAG. Poprawna liczba pozostaje dostępna bez automatycznej normy lub rozpoznania.",
    },
    lowSodiumCaution: { upper: 20, upperInclusive: false, unit: "mmol/L", kind: "method-limitation", sourceId: "BEREND_2017" },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
