(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPhDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const DEFAULT_POLICY = freeze({
    id: "PH_DZM_MAYO_UPH24_2026_11", version: 1, quantity: "urine-ph-dzm", unit: "", referenceKind: "interval",
    population: { label: "Dobowa zbiórka moczu; ogólny zakres Mayo UPH24, także w katalogu pediatrycznym, bez podziału według wieku lub płci" },
    profiles: [{ id: "MAYO_UPH24", lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true, unit: "", label: "Norma ogólna", text: "4,5–8,0", sourceId: "MAYO_UPH24", sourceLabel: "Mayo UPH24 · DZM · porównanie orientacyjne", method: "pH-metr", sample: "Dobowa zbiórka moczu" }],
    sampling: { collectionHours: 24, sampleTypes: ["timed", "24h", "dzm", "24-hour"], incompatiblePreservatives: ["acid", "acidified", "acidifying", "kwas", "zakwaszona", "boric", "boric-acid", "kwas-borowy", "hcl", "hydrochloric-acid", "h2so4", "sulfuric-acid", "alkali", "alkaline", "alkalinized", "alkalinised", "zasada", "naoh", "sodium-hydroxide", "sodium-carbonate", "weglan-sodu", "węglan-sodu", "altered", "ph-altered", "unknown-altered"] },
    sources: [
      { id: "MAYO_UPH24", label: "Mayo Clinic Laboratories — pH, 24 Hour, Urine (UPH24)", url: "https://www.mayocliniclabs.com/test-catalog/overview/606521", locator: "Reference Values, Collection Instructions, Clinical Information, Method Description", accessed: "2026-11-06", population: "Dobowa zbiórka moczu; zakres bez podziału na wiek i płeć", method: "pH-metr", evidence: "Pełny katalog: 4,5–8,0. Katalog wymaga próbki właściwie przechowywanej i konserwowanej; administracyjna objętość DZM nie jest argumentem obliczenia pH." },
      { id: "MAYO_UPH24_PEDIATRIC", label: "Mayo Pediatric Catalog — pH, 24 Hour, Urine (UPH24)", url: "https://pediatric.testcatalog.org/show/UPH24", locator: "Reference Values; Collection Instructions; Method Description", accessed: "2026-11-06", population: "Katalog pediatryczny tego samego testu, bez odrębnych przedziałów wieku lub płci", evidence: "Pełny katalog podaje 4,5–8,0; nie jest odrębną walidacją dla wcześniaków lub dnia życia noworodka." },
      { id: "EAU_2026_DZM", label: "EAU Guidelines on Urolithiasis — 2026", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", locator: "§4.1.2 Urine sampling; tabela 4.2; ocena kamicy moczanowej i cystynurii", accessed: "2026-11-06", population: "Ocena metaboliczna kamicy; progi pomocnicze tabeli dotyczą dorosłych", evidence: "pH DZM <5,5 oznacza nadmiernie kwaśny mocz. DZM >6,2 nie rozpoznaje RTA bez kontekstu, drugiego porannego moczu na czczo >5,8 i wykluczenia ZUM. Monitorowanie alkalizacji wymaga świeżych próbek w różnych porach." },
      { id: "WILLIAMS_2021", label: "Williams i wsp. — Urine and stone analysis for the investigation of the renal stone former, 2021", url: "https://link.springer.com/article/10.1007/s00240-020-01217-3", doi: "10.1007/s00240-020-01217-3", locator: "Urolithiasis 49:1–16, konsensus, pytania 5–6 i 10; pełny tekst wydawcy", accessed: "2026-11-06", population: "Ocena metaboliczna pacjentów z kamicą", evidence: "Pomiar pH po otrzymaniu próbki w laboratorium, przed zakwaszeniem lub alkalizacją porcji do oznaczania innych analitów; próbki jednorazowe nie zastępują DZM." },
    ],
    explanations: [
      { id: "acidic-stone-context", upper: 5.5, upperInclusive: false, text: "Kwaśny odczyn sprzyja krystalizacji kwasu moczowego.", sourceIds: ["EAU_2026_DZM"] },
      { id: "general", upper: 7, upperInclusive: true, text: "Wynik mieści się w zakresie ogólnym. W ocenie kamicy znaczenie mają skład złogów i pozostałe badania.", sourceIds: ["MAYO_UPH24", "EAU_2026_DZM"] },
      { id: "alkaline", upper: null, upperInclusive: false, text: "Zasadowy odczyn może zależeć od diety lub leczenia. Sam wynik nie potwierdza zakażenia.", sourceIds: ["MAYO_UPH24", "EAU_2026_DZM"] },
    ],
    educationalReferences: [],
    restrictions: { generalReferenceIntervalAvailable: true, ageReferenceIntervalApplied: false, referenceComparison: "orientational", patientMethodConfirmed: false, diagnosesRTA: false, diagnosesUTI: false, diagnosesStones: false, treatmentEfficacyAssessment: false, dosingAdviceAvailable: false, unknownFactsAreConfirmedAbsent: false, dailyExtrapolationAvailable: false },
    notes: {
      referenceLabel: "Norma ogólna", referenceHint: "Porównanie orientacyjne", lowTitle: "Poniżej normy ogólnej", withinTitle: "W zakresie normy ogólnej", highTitle: "Powyżej normy ogólnej",
      lowInterpretation: "Wyraźnie kwaśny odczyn. Potwierdź odczyt i oceń go wraz z pozostałymi badaniami.", highInterpretation: "Potwierdź wynik i warunki zbiórki. Wysokie pH może towarzyszyć zakażeniu lub zmianom próbki podczas przechowywania.",
      knownInfection: "Znane zakażenie może wpływać na odczyn moczu. Oceniaj pH razem z objawami i pozostałymi badaniami.",
      scope: "4,5–8,0 włącznie to ogólny zakres Mayo UPH24 dla dobowej zbiórki moczu. Ten sam przedział podaje katalog pediatryczny, bez podziału na wiek i płeć. Nie jest to osobna norma dla wieku ani potwierdzenie metody lub laboratorium pacjenta.",
      sample: "pH oznacza się w prawidłowo przygotowanej i przechowywanej próbce DZM, przed zakwaszeniem lub alkalizacją porcji do innych badań. Kwas borowy uniemożliwia prawidłowe oznaczenie pH; istnieją konserwanty odpowiednie do tego badania.",
      measurement: "pH jest zmierzonym parametrem bez jednostki, a nie ilością wydaloną w ciągu doby. Nie przeliczamy go przez objętość lub czas, a średnia arytmetyczna pomiarów jednorazowych nie zastępuje pH DZM.",
      acidic: "Kwaśny odczyn sprzyja krystalizacji kwasu moczowego; wyższe pH może sprzyjać krystalizacji fosforanów wapnia. Zakres ogólny i ryzyko krystalizacji oznaczają różne rzeczy.",
      stoneRisk: "pH DZM <5,5 jest progiem nadmiernie kwaśnego moczu w opisanej przez EAU ocenie kamicy u dorosłych, a nie normą zdrowej populacji lub normą dla wieku dziecka.",
      rta: "Samo pH DZM >6,2 nie rozpoznaje kwasicy cewkowej. Przesiewowe podejrzenie wymaga również drugiego porannego moczu na czczo z pH >5,8, wykluczenia zakażenia i kontekstu diagnostycznego.",
      therapy: "W monitorowaniu alkalizacji przy kamicy moczanowej i cystynurii ocenia się świeżo oddany mocz o różnych porach dnia. Jeden wynik wymieszanej DZM nie pokazuje dobowych wahań pH.",
      therapyCaution: "Cele leczenia zależą od rodzaju złogów i zaleceń. Wynik DZM nie ocenia samodzielnie skuteczności terapii ani nie wyznacza dawki leku. Nadmierna alkalizacja może sprzyjać złogom fosforanowo-wapniowym.",
      limitations: "Skala 0–14 służy walidacji technicznej wpisu, a nie określeniu fizjologicznego zakresu moczu. Wynik skrajny wymaga sprawdzenia odczytu i próbki. Brak odrębnej walidacji dla wcześniaków lub norm według dnia życia noworodka.",
      sourceSummary: "Mayo UPH24 · DZM. Norma ogólna nie jest celem leczenia kamicy.",
      noPolicy: "Nie dobrano zakresu referencyjnego. Podana wartość pH pozostaje dostępna bez automatycznej oceny.",
      incompatiblePreservative: "Konserwant zakwaszający lub alkalizujący zmienia pH próbki. Tego wyniku nie porównujemy z normą pH DZM.",
      incompatibleSample: "Wskazany materiał nie jest dobową zbiórką moczu. Zachowujemy odczyt bez porównania z normą DZM.",
      incompleteCollection: "Zapisano problem z pobraniem lub przechowywaniem zbiórki. Zachowujemy odczyt bez porównania z normą DZM.",
      durationMissing: "W tym zapisie nie utrwalono czasu zbiórki. Zachowujemy odczyt bez porównania z normą DZM.",
      durationInvalid: "Zapisany czas zbiórki jest nieprawidłowy. Zachowujemy odczyt bez porównania z normą DZM.",
      non24h: "Znany czas zbiórki jest inny niż 24 godz. Zachowujemy odczyt bez normy DZM i bez przeliczania na 24 godziny.",
    },
  });
  function getPolicy(id) { return id === DEFAULT_POLICY.id ? DEFAULT_POLICY : null; }
  return Object.freeze({ DEFAULT_POLICY, getPolicy });
});
