/* KM/Cr: one source-specific reference policy for a random urine specimen.
 * A urine ratio is not daily urate excretion or a serum urate concentration. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrUrateCreatinineReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const SOURCE_ID = "NEWCASTLE_URATE_RANDOM_2024_12_24";
  const titles = { low: "Poniżej normy dla wieku", within: "W zakresie dla wieku", high: "Powyżej normy dla wieku" };
  const interpretations = {
    low: "W próbce jest mniej kwasu moczowego w odniesieniu do kreatyniny niż w zakresie laboratorium. Sam wynik nie rozpoznaje niedoboru ani nie określa stężenia we krwi.",
    within: "KM/Cr mieści się w zakresie laboratorium dla wieku. Prawidłowy stosunek nie wyklucza kamicy — znaczenie mają także m.in. pH moczu i kontekst kliniczny.",
    high: "Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego."
  };
  function profile(id, ageLower, ageUpper, lower, upper, label, sourceAgeLabel) {
    return {
      id, kind: "interval", ageLower, ageUpper, ageLowerInclusive: true, ageUpperInclusive: false,
      lower, upper, lowerInclusive: true, upperInclusive: true, unit: "mmol/mmol", label,
      text: lower + "–" + upper, sourceAgeLabel, sourceId: SOURCE_ID, sourceIds: [SOURCE_ID],
      sourceLabel: "Newcastle NHS", population: "Zakres laboratoryjny Newcastle NHS dla próbki jednorazowej, " + label,
      sample: "Próbka jednorazowa moczu", specimen: "random", method: "Metody i kohorty referencyjnej nie podano w katalogu",
      explanation: "Orientacyjny zakres laboratorium dla wieku i próbki jednorazowej. Nie przenosimy go automatycznie na DZM.",
      titles: { ...titles }, copy: { ...interpretations }
    };
  }
  const DATA = freeze({
    id: "newcastle-urinary-urate-creatinine-random", version: 1, quantity: "urinary-urate-creatinine-ratio", specimen: "random", unit: "mmol/mmol", minimumAge: 0,
    population: {
      id: "newcastle-hospitals-laboratories-random-urine",
      label: "Zakresy laboratoryjne Newcastle Hospitals Laboratories — mocz jednorazowy, dzieci i dorośli",
      limitations: "Katalog nie opisuje liczebności i charakterystyki kohorty, metody wyznaczenia przedziałów ani percentyli. Nie jest to uniwersalna norma wszystkich populacji."
    },
    agePolicy: "Ukończone lata: 0–<2, 2–<6, 6–<10, 10–<18 i ≥18. Dokładnie 2 lata przypisano do grupy źródłowej zaczynającej się od 2 lat; nakładające się słowne etykiety źródła zachowano. Jest to jawna konwencja aplikacji, bez interpolacji.",
    endpointPolicy: "Obie liczbowe granice przedziału włączone — jawna reguła oceny aplikacji; katalog nie określa formalnych nierówności.",
    profiles: [
      profile("under-2", 0, 2, 0.42, 1.53, "Od urodzenia do <2 lat", "Up to 2 years"),
      profile("age-2-to-5", 2, 6, 0.57, 1.35, "2–<6 lat", "2 to 5 years"),
      profile("age-6-to-9", 6, 10, 0.39, 0.85, "6–<10 lat", "6 to 9 years"),
      profile("age-10-to-17", 10, 18, 0.15, 0.67, "10–<18 lat", "10 to17 years"),
      profile("adult", 18, null, 0.11, 0.53, "≥18 lat", ">17 years")
    ],
    sources: [{
      id: SOURCE_ID, label: "Newcastle Hospitals Laboratories — Urate, urine",
      url: "https://laboratories.newcastle-hospitals.nhs.uk/test-directory/urate-urine/",
      updated: "2024-12-24", accessed: "2026-11-01", locator: "Reference ranges — Random urine sample",
      scope: "Stosunek w mmol/mmol kreatyniny z próbki jednorazowej. Oddzielny zakres mmol/24 h na stronie dotyczy ilości dobowej, nie KM/Cr."
    }],
    educationalReferences: [
      { id: "MAYO_RURC1", label: "Mayo Clinic Laboratories — zastosowania i ograniczenia KM/Cr", url: "https://www.mayocliniclabs.com/test-catalog/Overview/621395" },
      { id: "LOINC_13820_6", label: "LOINC 13820-6 — stosunek moczanów do kreatyniny w DZM", url: "https://loinc.org/13820-6/" },
      { id: "EAU_UROLITHIASIS", label: "EAU — ocena metaboliczna kamicy", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention" },
      { id: "NIST_URIC_ACID", label: "NIST Chemistry WebBook — kwas moczowy", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=69-93-2" },
      { id: "NIST_CREATININE", label: "NIST Chemistry WebBook — kreatynina", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=60-27-5" }
    ],
    notes: {
      noPolicyTitle: "Obliczony KM/Cr", noPolicy: "Nie dobrano właściwego zakresu laboratoryjnego. Wynik liczbowy pozostaje dostępny.",
      noAge: "Brak danych o wieku do dobrania normy. Wynik liczbowy pozostaje dostępny.",
      noProfile: "Nie dobrano właściwego przedziału dla wieku. Wynik pozostaje bez automatycznej oceny.",
      timedTitle: "Brak normy DZM w aplikacji", timed: "Zakres Newcastle dotyczy próbki jednorazowej. Nie przenosimy go automatycznie na DZM.",
      unknownSpecimen: "Rodzaj próbki w dawnym zapisie nie jest ustalony. Nie przypisujemy mu automatycznie normy dla próbki jednorazowej.",
      zeroTitle: "Wartość zerowa — sprawdź raport", zero: "Sprawdź granicę oznaczalności laboratorium. Wynik „<…” nie oznacza dokładnego zera.",
      precision: "Znak ≈ oznacza skrócony zapis. Ocenę oparto na pełnej, niezaokrąglonej wartości.",
      clinical: "KM/Cr nie jest stężeniem kwasu moczowego we krwi ani dobową ilością wydalanego kwasu moczowego. Znaczenie mają m.in. pH moczu, dieta, leczenie i sytuacja kliniczna.",
      formula: "KM/Cr = stężenie kwasu moczowego / stężenie kreatyniny po przeliczeniu obu stężeń na mmol/L. Dla gotowego stosunku przeliczamy tylko jego zadeklarowaną jednostkę.",
      conversion: "Przyjmujemy spójne masy molowe: kwas moczowy 168,11 g/mol i kreatynina 113,12 g/mol. mg/mg × 113,12/168,11 = mmol/mmol; mg/g dodatkowo dzielimy przez 1000.",
      specimen: "Sam iloraz można obliczyć dla próbki jednorazowej i DZM, bez objętości i czasu. Zakresy tego źródła dotyczą jednak wyłącznie próbki jednorazowej; nie nadajemy ich DZM ani nieznanemu rodzajowi próbki.",
      limitations: "Zakres Newcastle jest orientacyjnym odniesieniem laboratoryjnym dla danej próbki i wieku. Nie jest uniwersalną normą wszystkich populacji ani samodzielnym rozpoznaniem klinicznym.",
      assumption: "Przyjmujemy, że oba stężenia pochodzą z tej samej próbki moczu."
    }
  });
  return freeze({ DATA, POLICY: DATA, DEFAULT_POLICY: DATA, SOURCE_ID });
});
