(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPhReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  // A source-specific general interval is distinct from a stone-treatment target.
  // Labcorp's neonatal interval is educational context, never silently substituted.
  const DEFAULT_POLICY = freeze({
    id: "PH_SPOT_MAYO_2026_10", version: 1, quantity: "urine-ph", unit: "", referenceKind: "interval",
    population: { label: "Przypadkowa próbka moczu; ogólny zakres Mayo PHU_, także w katalogu pediatrycznym, bez podziału według wieku lub płci" },
    profiles: [{ id: "MAYO_PHU_RANDOM", lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true, unit: "", label: "Norma ogólna", text: "4,5–8,0", sourceId: "MAYO_PHU", sourceLabel: "Mayo · próbka moczu · porównanie orientacyjne", method: "pH-metr", sample: "Przypadkowa próbka moczu" }],
    sources: [
      { id: "MAYO_PHU", label: "Mayo Clinic Laboratories — pH, Random, Urine (PHU_)", url: "https://www.mayocliniclabs.com/test-catalog/overview/606510", locator: "Reference Values, Clinical Information, Cautions, Method Description", accessed: "2026-10-27", population: "Przypadkowa próbka moczu; bez przedziałów wieku i płci", method: "pH-metr", evidence: "Pełna strona katalogu: zakres referencyjny 4,5–8,0. Opisana skala miernika 0–14 nie jest zakresem fizjologicznym moczu." },
      { id: "MAYO_PHU_PEDIATRIC", label: "Mayo Pediatric Catalog — pH, Random, Urine (PHU_)", url: "https://pediatric.testcatalog.org/show/PHU_", locator: "Reference Values; Clinical Information; Method Description", accessed: "2026-10-27", population: "Katalog pediatryczny tego samego testu; brak odrębnego zakresu noworodkowego", evidence: "Pełna strona podaje 4,5–8,0. Nie jest to odrębne badanie walidacyjne noworodków." },
      { id: "LABCORP_013037", label: "Labcorp — pH, Urine (013037)", url: "https://www.labcorp.com/tests/013037/ph-urine", locator: "Reference Interval, Methodology, Specimen Requirements", accessed: "2026-10-27", population: "Noworodki 5,0–7,0; później 4,5–8,0, bez liczbowego zdefiniowania końca okresu noworodkowego", method: "pH-metr", evidence: "Pełna strona. Odrębny zakres jest informacją o zmienności laboratoriów; nie zastępuje profilu Mayo ani nie ustanawia progu wieku w aplikacji." },
      { id: "UW_UPH", label: "UW Medicine — pH, Urine (UPH)", url: "https://dlmp.uw.edu/test-guide/view/UPH", locator: "Reference Range; Method; Specimen", accessed: "2026-10-27", population: "Wiek od 0 lat, obie płcie i płeć nieznana; 5,0–8,0", method: "Spektrofotometria", evidence: "Pełna strona. Przykład zależności zakresu od laboratorium/metody, bez łączenia z główną normą Mayo." },
      { id: "EAU_2026", label: "EAU Guidelines on Urolithiasis — 2026", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", additionalUrl: "https://uroweb.org/guidelines/urolithiasis/chapter/guidelines", additionalLabel: "EAU 2026 — chemoliza złogów", documentUrl: "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf", locator: "Aktualizacja marzec 2026; Metabolic Evaluation and Recurrence Prevention; Chemolysis", accessed: "2026-10-27", population: "Kontekst diagnostyki i leczenia kamicy; podane cele alkalizacji dotyczą dorosłych", evidence: "Właściwe sekcje pełnego HTML i PDF. Powtarzane oznaczenia świeżego moczu; cele terapii nie są normą populacyjną. Kryteriów dobowych i drugiej porannej próbki na czczo nie przenosimy do pojedynczego przypadkowego pomiaru." },
      { id: "KWONG_2013", label: "Kwong i wsp. — dokładność paskowego pomiaru pH, 2013", url: "https://pubmed.ncbi.nlm.nih.gov/23435644/", doi: "10.1007/s00240-013-0546-y", locator: "Urolithiasis 41:129–132; abstrakt PubMed", accessed: "2026-10-27", population: "Porównanie paska i elektrody w świeżej próbce moczu", evidence: "Odczytany abstrakt; pełny tekst PMC niedostępny podczas weryfikacji. Rozbieżności wspierają ostrożność wobec pozornej dokładności paska." },
    ],
    // Text ranges select an explanation only; they do not redefine normality.
    explanations: [
      { id: "acidic-stone-context", upper: 5.5, upperInclusive: false, text: "Kwaśny odczyn może mieścić się w normie. Jeśli utrzymuje się w kolejnych pomiarach, ma znaczenie m.in. w ocenie ryzyka złogów kwasu moczowego.", sourceIds: ["MAYO_PHU", "EAU_2026"] },
      { id: "acidic", upper: 7, upperInclusive: false, text: "Kwaśny odczyn moczu. Na pH wpływają m.in. dieta i pora pobrania; pojedynczy pomiar nie ocenia całościowo zakwaszania moczu.", sourceIds: ["MAYO_PHU", "EAU_2026"] },
      { id: "neutral", upper: 7, upperInclusive: true, text: "Obojętny odczyn moczu. Na pH wpływają m.in. dieta i leczenie; sam wynik nie rozpoznaje ani nie wyklucza choroby.", sourceIds: ["MAYO_PHU"] },
      { id: "alkaline", upper: null, upperInclusive: false, text: "Zasadowy odczyn może zależeć m.in. od diety lub leczenia. Sam wynik nie potwierdza zakażenia ani kwasicy cewkowej.", sourceIds: ["MAYO_PHU", "EAU_2026"] },
    ],
    educationalReferences: [
      { id: "uric-acid-chemolysis", label: "Chemoliza złogów kwasu moczowego · dorośli", targetText: "7,0–7,2", text: "Cel pH 7,0–7,2 podczas doustnej chemolizy, zgodnie z planem leczenia; nie ogólna norma ani cel dla każdego pacjenta.", sourceId: "EAU_2026" },
      { id: "cystinuria", label: "Cystynuria · dorośli", targetText: ">7,5", text: "Cel alkalizacji pH >7,5; odrębne wskazanie i monitorowanie leczenia.", sourceId: "EAU_2026" },
    ],
    restrictions: { universalNormalRangeAvailable: false, generalReferenceIntervalAvailable: true, ageReferenceIntervalApplied: false, referenceComparison: "orientational", patientMethodConfirmed: false, freshSampleConfirmed: false, diagnosesRTA: false, excludesRTA: false, diagnosesUTI: false, diagnosesStones: false, treatmentEfficacyAssessment: false, dosingAdviceAvailable: false, stableKidneyFunctionAssumed: false, noAKIAssumed: false, ifccStandardizationAssumed: false, unknownFactsAreConfirmedAbsent: false },
    notes: {
      referenceLabel: "Norma ogólna", referenceHint: "Porównanie orientacyjne",
      lowTitle: "Poniżej normy ogólnej", withinTitle: "W zakresie normy ogólnej", highTitle: "Powyżej normy ogólnej",
      lowInterpretation: "Wyraźnie kwaśny odczyn. Potwierdź odczyt wyniku; znaczenie tak niskiego pH zależy od stanu klinicznego i pozostałych badań.",
      highInterpretation: "Wysokie pH może towarzyszyć zakażeniu lub zmianom próbki podczas przechowywania. Potwierdź wynik i oceń go z objawami oraz badaniem ogólnym moczu.",
      scope: "Norma ogólna 4,5–8,0 pochodzi z Mayo PHU_ dla przypadkowej próbki moczu oznaczanej pH-metrem. Ten sam zakres podaje katalog pediatryczny, bez podziału według wieku lub płci. Porównanie nie potwierdza metody konkretnej próbki.",
      labVariation: "Zakresy laboratoriów mogą się różnić: Labcorp podaje u noworodków 5,0–7,0, a UW Medicine 5,0–8,0 dla metody spektrofotometrycznej. Uwzględnij normę na wyniku badania; główna karta stosuje jeden profil Mayo.",
      newborn: "Noworodek: zakresy laboratoriów bywają węższe, np. 5,0–7,0 w Labcorp. Uwzględnij normę na wyniku badania.",
      acidic: "Kwaśny lub zasadowy odczyn może mieścić się w zakresie ogólnym. Pojedyncze pH nie rozpoznaje ani nie wyklucza zakażenia, kwasicy cewkowej lub kamicy; znaczenie mają kontekst kliniczny i powtarzane pomiary.",
      sample: "Oznaczaj pH w świeżym moczu zgodnie z instrukcją laboratorium. Przechowywanie i zanieczyszczenie mogą zmieniać wynik; próbka z kwasem borowym nie nadaje się do oceny pH. Formularz nie zakłada, że te warunki zostały potwierdzone.",
      measurement: "Pomiar paskiem jest orientacyjny i może różnić się od pomiaru elektrodą. Wpisz dokładnie odczyt z badania; liczba miejsc po przecinku w aplikacji nie zwiększa dokładności pomiaru.",
      therapy: "Cele leczenia różnią się od normy ogólnej. Cele EAU poniżej dotyczą określonych wskazań u dorosłych; nie zmieniają oceny pojedynczego pomiaru na głównej karcie.",
      therapyCaution: "Nadmierna alkalizacja może sprzyjać złogom fosforanowo-wapniowym. Pojedynczy wpis nie ocenia skuteczności leczenia ani nie wyznacza dawki leku.",
      limitations: "Skala 0–14 służy walidacji technicznej wpisu, a nie określeniu fizjologicznego zakresu moczu. Wynik skrajny wymaga sprawdzenia odczytu i próbki.",
      sourceSummary: "Mayo · próbka moczu. Norma ogólna nie jest celem leczenia kamicy.",
      noPolicy: "Nie dobrano zakresu referencyjnego. Podana wartość pH pozostaje dostępna bez automatycznej oceny.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
