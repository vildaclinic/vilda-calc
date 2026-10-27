/* Source-specific uric-acid excretion references. Values are data, not engine defaults. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrUaReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const DEFAULT_POLICY = freeze({
    id: "UA_DZM_EAU_MAYO_2026_10", version: 1, quantity: "uric-acid-excretion", adultAgeMinimum: 18,
    population: { label: "Dzieci: EAU 2026, tabela 4.4; dorośli: Mayo URCU, pełna zbiórka 24 h" },
    profiles: [
      { id: "EAU_UA_INFANT", role: "child", ageLower: 0, ageUpper: 1, ageLowerInclusive: true, ageUpperInclusive: false, sex: null, kind: "upper", lower: null, upper: 13, lowerInclusive: false, upperInclusive: false, unit: "mg/kg/24 h", label: "Norma dla wieku", population: "Dzieci <1 roku", text: "<13", sourceId: "EAU_UROLITHIASIS_2026", sourceLabel: "EAU 2026 · tabela 4.4", method: "Źródłowa kolumna masowa", sample: "Pełna zbiórka moczu 24 h" },
      { id: "EAU_UA_YOUNG", role: "child", ageLower: 1, ageUpper: 5, ageLowerInclusive: true, ageUpperInclusive: true, sex: null, kind: "upper", lower: null, upper: 11, lowerInclusive: false, upperInclusive: false, unit: "mg/kg/24 h", label: "Norma dla wieku", population: "Dzieci 1–5 lat", text: "<11", sourceId: "EAU_UROLITHIASIS_2026", sourceLabel: "EAU 2026 · tabela 4.4", method: "Źródłowa kolumna masowa", sample: "Pełna zbiórka moczu 24 h" },
      { id: "EAU_UA_OLDER", role: "child", ageLower: 5, ageUpper: 18, ageLowerInclusive: false, ageUpperInclusive: false, sex: null, kind: "upper", lower: null, upper: 9.3, lowerInclusive: false, upperInclusive: false, unit: "mg/kg/24 h", label: "Norma dla wieku", population: "Dzieci >5 lat, przed 18. urodzinami", text: "<9,3", sourceId: "EAU_UROLITHIASIS_2026", sourceLabel: "EAU 2026 · tabela 4.4", method: "Źródłowa kolumna masowa", sample: "Pełna zbiórka moczu 24 h" },
      { id: "MAYO_UA_MALE", role: "adult", ageLower: 18, ageUpper: null, ageLowerInclusive: true, ageUpperInclusive: false, sex: "M", kind: "interval", lower: 200, upper: 1000, lowerInclusive: true, upperInclusive: true, unit: "mg/24 h", label: "Norma dla dorosłych", population: "Mężczyźni od 18 lat", text: "200–1000", sourceId: "MAYO_URCU", sourceLabel: "Mayo URCU · dorośli", method: "Metoda kolorymetryczna w katalogu źródłowym", sample: "Pełna zbiórka moczu 24 h" },
      { id: "MAYO_UA_FEMALE", role: "adult", ageLower: 18, ageUpper: null, ageLowerInclusive: true, ageUpperInclusive: false, sex: "F", kind: "interval", lower: 250, upper: 750, lowerInclusive: true, upperInclusive: true, unit: "mg/24 h", label: "Norma dla dorosłych", population: "Kobiety od 18 lat", text: "250–750", sourceId: "MAYO_URCU", sourceLabel: "Mayo URCU · dorośli", method: "Metoda kolorymetryczna w katalogu źródłowym", sample: "Pełna zbiórka moczu 24 h" },
    ],
    sources: [
      { id: "EAU_UROLITHIASIS_2026", label: "EAU Guidelines on Urolithiasis 2026", url: "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf#page=48", locator: "Limited update March 2026, tabela 4.4, kolumna mg/kg/24 h", accessed: "2026-10-27" },
      { id: "MAYO_URCU", label: "Mayo Clinic Laboratories — Uric Acid, 24 Hour, Urine (URCU)", url: "https://renal.testcatalog.org/show/URCU", locator: "Reference Values; zakres tylko ≥18 lat i pełne 24 h", accessed: "2026-10-27" },
      { id: "NIST_URIC_ACID", label: "NIST Chemistry WebBook — Uric acid", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=69-93-2", locator: "Masa molowa 168,1103 g/mol; używany przelicznik 168,11 mg/mmol", accessed: "2026-10-27" },
    ],
    educationalReferences: [
      { label: "Progi w ocenie kamicy u dorosłych", text: "EAU opisuje odrębne progi hiperurykozurii: >4 mmol/24 h u kobiet i >5 mmol/24 h u mężczyzn. To nie jest ten sam zakres co laboratoryjna norma Mayo i nie zmienia automatycznie jej oceny.", sourceId: "EAU_UROLITHIASIS_2026" },
    ],
    notes: {
      formula: "Stężenie w mg/L × objętość w L × 24 / czas w godzinach daje mg/24 h. Podzielenie przez masę w kg daje mg/kg/24 h. Gotowy wynik dobowy nie jest ponownie mnożony przez czas ani objętość.",
      conversion: "Wszystkie jednostki molowe przeliczamy jednym współczynnikiem 168,11 mg/mmol. W tabelach EAU kolumny masowe i molowe nie są dokładnie równoważne; w tej polityce źródłem jest kolumna masowa.",
      collection: "Przyjmujemy pełną zbiórkę z podanego czasu.",
      scope: "Porównanie orientacyjne. Uwzględnij zakres laboratorium, dietę, leki i wiarygodność zbiórki. Sam wynik nie rozpoznaje kamicy i nie służy do doboru leczenia.",
      ageBoundary: "Zachowano źródłowe grupy <1 roku, 1–5 lat i >5 lat. Dla znanego dokładnego wieku stosujemy 1 ≤ wiek ≤ 5 oraz wiek >5; np. 5 lat 6 miesięcy należy do >5 lat. Nie przesuwamy granicy na szóste urodziny. Grupa <1 roku nie jest odrębną normą według dni życia noworodka.",
      rounding: "Ocena korzysta z wartości przed zaokrągleniem. Wynik pokazujemy zwykle do dwóch miejsc po przecinku; zwiększamy dokładność, gdy jest to potrzebne do zachowania strony granicy lub małego dodatniego wyniku.",
      knownContradiction: "Podano problem kompletności lub protokołu zbiórki. Nie można traktować tych danych jako prawidłowej pełnej zbiórki dobowej.",
      non24Title: "Przeliczenie z innego czasu zbiórki",
      non24: "To oszacowanie po przeliczeniu do 24 godzin. Zbiórka z innego czasu nie jest równoważna pełnej DZM — nie porównujemy jej z normą dobową.",
      ambiguousAgeTitle: "Wynik bez jednoznacznej normy dla wieku",
      ambiguousAge: "Podano 5 ukończonych lat bez miesięcy. Dla dokładnie 5 lat EAU podaje <11, a po 5. urodzinach <9,3 mg/kg/24 h. Nie wybieramy jednej z tych norm bez dokładniejszego wieku.",
      noAgeTitle: "Wynik bez normy dla wieku",
      noAge: "Wynik liczbowy jest dostępny. Do wyboru właściwej normy potrzebny jest wiarygodny wiek w danych pacjenta.",
      noSexTitle: "Wynik bez właściwej normy",
      noSex: "Wynik liczbowy jest dostępny. Wybór zakresu dla dorosłych wymaga płci z danych pacjenta.",
      noMassTitle: "Wynik bez właściwej normy",
      noMass: "Do porównania gotowego wyniku w mg/kg/24 h z dobową normą dla dorosłych potrzebna jest masa ciała. Podana liczba pozostaje dostępna.",
      noPolicyTitle: "Wynik bez właściwej normy",
      noPolicy: "Nie dobrano odpowiedniego profilu odniesienia. Poprawny wynik liczbowy pozostaje dostępny bez automatycznej oceny.",
      childWithinTitle: "Wydalanie niezwiększone", childBoundaryTitle: "Osiągnięta granica zakresu", childHighTitle: "Zwiększone wydalanie",
      childWithin: "Wynik jest poniżej górnej granicy dla wieku. Oceń go razem z pH moczu i wiarygodnością dobowej zbiórki.",
      high: "Zwiększone wydalanie może sprzyjać powstawaniu złogów. Oceń wynik razem z pH moczu i wiarygodnością zbiórki.",
      adultWithinTitle: "W zakresie laboratoryjnym", adultLowTitle: "Poniżej zakresu laboratoryjnego", adultHighTitle: "Powyżej zakresu laboratoryjnego",
      adultWithin: "Wynik mieści się w zakresie laboratoryjnym. W ocenie ryzyka kamicy znaczenie mają także pH moczu, dieta i pozostałe parametry zbiórki.",
      adultLow: "Obniżony wynik może zależeć m.in. od diety, leczenia lub niepełnej zbiórki. Oceń go z zakresem laboratorium i kontekstem klinicznym.",
      zeroTitle: "Wynik zerowy — sprawdź raport", zero: "Sprawdź, czy 0 nie oznacza wyniku poniżej oznaczalności laboratorium. Sam zapis zera nie pozwala tutaj na uspokajającą ocenę.",
      sourceSummary: "Wybrany zakres dotyczy pełnej zbiórki 24 h. Porównanie orientacyjne.",
    },
  });
  return Object.freeze({ DEFAULT_POLICY });
});
