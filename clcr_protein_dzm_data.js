/* Versioned reference policy for total protein in a 24-hour collection.
 * The 150 mg/day pediatric cap is an explicitly accepted application rule,
 * not a literal statement in KDIGO's pediatric paragraph. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrProteinDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const titles = { within: "W przyjętej normie", high: "Zwiększone wydalanie białka", nephrotic: "Białkomocz w zakresie nerczycowym" };
  const interpretation = {
    within: "Dobowe wydalanie białka mieści się w przyjętej normie.",
    high: "Wynik osiąga lub przekracza górną granicę przyjętej normy.",
    nephrotic: "Wynik wymaga oceny nefrologicznej. Sam wynik nie rozpoznaje zespołu nerczycowego."
  };
  const sources = [
    { id: "KDIGO_CKD_2024", label: "KDIGO 2024 CKD", url: "https://kdigo.org/wp-content/uploads/2026/04/KDIGO-2024-CKD-Guideline.pdf", doi: "10.1016/j.kint.2023.10.018", locator: "S193, Pediatric considerations: <150 mg/m²/d od 6 miesięcy. Cytowany akapit nie ustanawia limitu całkowitego 150 mg/24 h.", accessed: "2026-10-29" },
    { id: "VILDA_PROTEIN_CAP_2026_10_29", label: "Vilda · limit przyjęty przez właściciela 29.10.2026", url: "docs/clinical/PROTEIN_DZM.md", locator: "Reguła kalkulatora: min(150 × BSA, 150) mg/24 h; decyzja właściciela, nie dosłowny zapis KDIGO. Ścisła granica <.", accessed: "2026-10-29" },
    { id: "KDIGO_NS_CHILD_2025", label: "KDIGO 2025 · zespół nerczycowy u dzieci", url: "https://kdigo.org/wp-content/uploads/2025/04/KDIGO-2025-Guideline-for-Nephrotic-Syndrome-in-Children.pdf", doi: "10.1016/j.kint.2024.11.007", locator: "S261–262, Figure 1: zakres nerczycowy ≥1000 mg/m²/24 h; wytyczne dla 1–18 lat. <100 mg/m²/24 h odnosi się do remisji przez kolejne dni.", accessed: "2026-10-29" },
    { id: "KDIGO_GD_2021", label: "KDIGO 2021 · choroby kłębuszków", url: "https://kdigo.org/wp-content/uploads/2017/02/KDIGO-Glomerular-Diseases-Guideline-2021-English.pdf", locator: "S16, PER <150 mg/d; Figure 4, S91: dorosły zakres nerczycowy ≥3,5 g/24 h.", accessed: "2026-10-29" },
    { id: "AEP_PROTEINURIA_2022", label: "AEP 2022 · Proteinuria", url: "https://static.aeped.es/05_proteinuria_0_8a42ad173d.pdf", locator: "S81–83: inne kryterium pediatryczne <100 mg/m²/d; opisuje również całkowite 150 mg/d. Nie jest to ta sama granica co pediatryczne KDIGO.", accessed: "2026-10-29" },
    { id: "HAYCOCK_1978", label: "Haycock i wsp. 1978 · powierzchnia ciała", url: "https://doi.org/10.1016/S0022-3476(78)80601-5", doi: "10.1016/S0022-3476(78)80601-5", locator: "Wzór Haycocka: 0,024265 × masa^0,5378 × wzrost^0,3964; masa w kg, wzrost w cm, powierzchnia w m².", accessed: "2026-10-29" }
  ];
  const DEFAULT_POLICY = freeze({
    id: "PROTEIN_DZM_KDIGO_OWNER_CAP_2026_10_29", version: 1, quantity: "total-protein-excretion", minimumAge: 0.5, adultAge: 18,
    population: { label: "KDIGO · białko całkowite w DZM, z pediatrycznym limitem przyjętym w Vilda", limitations: "To jawnie przyjęte kryterium kliniczne, nie przedział referencyjny dobrany do metody konkretnego laboratorium. Źródła pediatryczne nie podają jednej zgodnej granicy." },
    agePolicy: "W tej aplikacji od 6 mies. do <18 lat profil pediatryczny z BSA; od 18 lat profil dorosły. Granica wieku jest zakresem profili, nie nagłą zmianą fizjologii. Brak wieku lub danych do BSA nie jest wskazaniem do podstawienia normy dorosłych.",
    profiles: [
      { id: "CHILD_PROTEIN_BSA_OWNER_CAP", ruleId: "pediatric-bsa-adult-cap-v1", kind: "upper-bsa-capped", ageLower: 0.5, ageUpper: 18, ageLowerInclusive: true, ageUpperInclusive: false, upper: 150, upperInclusive: false, adultCap: 150, bsaMethod: "Haycock", nephrotic: 1000, nephroticMinimumAge: 1, unit: "mg/24 h", label: "Norma dla pacjenta", population: "Od 6 mies. do <18 lat · obie płcie", text: "<min(150 × BSA, 150) mg/24 h", sourceId: "VILDA_PROTEIN_CAP_2026_10_29", sourceIds: ["KDIGO_CKD_2024", "VILDA_PROTEIN_CAP_2026_10_29", "KDIGO_NS_CHILD_2025", "HAYCOCK_1978"], sourceLabel: "KDIGO 2024 · limit Vilda 150 mg/24 h", method: "Kliniczny próg pediatryczny przeliczony przez BSA Haycocka, z limitem przyjętym w kalkulatorze", sample: "Pełna zbiórka moczu 24 h", contextLabel: "Białko całkowite · próg według powierzchni ciała z limitem dorosłych", explanation: "Limit 150 mg/24 h jest dodatkową regułą kalkulatora zaakceptowaną przez właściciela. Akapit KDIGO 2024 podaje <150 mg/m²/24 h, bez tego limitu. Porównujemy wartości przed zaokrągleniem.", titles: { ...titles }, copy: { ...interpretation } },
      { id: "ADULT_PROTEIN_KDIGO", ruleId: "adult-total-protein-kdigo-v1", kind: "upper", ageLower: 18, ageUpper: null, ageLowerInclusive: true, ageUpperInclusive: false, upper: 150, upperInclusive: false, nephrotic: 3500, nephroticMinimumAge: 18, unit: "mg/24 h", label: "Norma dla pacjenta", population: "Od 18 lat · obie płcie", text: "<150 mg/24 h", sourceId: "KDIGO_GD_2021", sourceIds: ["KDIGO_GD_2021"], sourceLabel: "KDIGO · ogólny próg dla dorosłych", method: "Kliniczny próg całkowitego wydalania białka", sample: "Pełna zbiórka moczu 24 h", contextLabel: "Białko całkowite · dorośli", explanation: "Ogólny próg PER <150 mg/24 h. Zakres nerczycowy ≥3500 mg/24 h według ogólnej ryciny KDIGO 2021; nie jest to algorytm chorobowo swoisty IgAN.", titles: { ...titles }, copy: { ...interpretation } }
    ],
    sources,
    notes: {
      noPolicyTitle: "Wynik bez porównania z normą", noPolicy: "Nie dobrano właściwego profilu referencyjnego. Liczba pozostaje dostępna bez automatycznej oceny.",
      noAge: "Wiek pacjenta jest nieznany lub niewystarczająco dokładny. Nie dobieramy zastępczej normy dorosłych.",
      belowAge: "Dla wieku poniżej 6 miesięcy w wybranym profilu nie przyjęto normy DZM. Interpretacja wymaga oceny pediatrycznej.",
      noProfile: "Nie dobrano normy właściwej dla dostępnego wieku lub jego dokładności. Liczba pozostaje dostępna bez automatycznej oceny.",
      noBsa: "Do porównania u dziecka potrzebne są znane masa i wzrost. Wynik dobowy pozostaje dostępny.",
      non24Title: "Oszacowanie na 24 godziny", reportedNon24Title: "Wynik dobowy — bez oceny normy",
      non24: "To oszacowanie po przeliczeniu z rzeczywistego czasu do 24 godzin. Nie porównujemy go z normą pełnej DZM.",
      reportedNon24: "Znany czas zbiórki jest inny niż 24 godziny. Podany wynik dobowy pozostaje bez ponownego przeliczenia; nie porównujemy go z normą pełnej DZM.",
      zeroTitle: "Wynik 0 — sprawdź zapis laboratorium", zero: "Sprawdź, czy 0 oznacza wynik poniżej granicy oznaczalności. Zapis „<” nie jest dokładnym zerem.",
      scope: "U dzieci od 6 miesięcy do <18 lat: <min(150 × BSA, 150) mg/24 h. Dorośli od 18 lat: <150 mg/24 h. Brak właściwego wieku lub BSA daje liczbę bez zastępczej normy.",
      ageBoundary: "Poniżej 6 miesięcy brak automatycznej normy tego profilu. Od 6. do <12. miesiąca stosuje się górną granicę normy, ale nie automatyczny pediatryczny zakres nerczycowy z wytycznych dla wieku 1–18 lat.",
      formula: "Stężenie w mg/L × objętość w L ×24/czas w godzinach = mg/24 h. Gotowego wyniku dobowego nie przeliczamy ponownie. W dawnych zapisach podana ilość oznacza całkowitą masę białka w zbiórce, nie stężenie.",
      conversion: "1 g = 1000 mg. Stężenie: mg/L, mg/dL albo g/L; objętość: mL albo L. Przeliczenie na m² jest szczegółem jednego pomiaru, nie kolejnym badaniem.",
      rounding: "Porównujemy liczby przed zaokrągleniem, z zachowaniem strony granicy w pokazanym wyniku. Mała dodatnia wartość pozostaje dodatnia; dokładne zero wymaga sprawdzenia zapisu laboratorium.",
      collection: "Domyślnie przyjmujemy pełną zbiórkę przez 24 h. Inny znany czas daje oszacowanie bez normy dobowej; historyczny brak czasu nie staje się automatycznie 24 h. Znana niepełna lub błędna zbiórka blokuje wynik w obu trybach.",
      knownContradiction: "Podano problem kompletności lub protokołu zbiórki. Wartość nie jest wiarygodnym wydalaniem dobowym.",
      limitations: "Białko całkowite nie otrzymuje kategorii A1–A3 albuminurii. Pojedynczy wynik nie rozpoznaje PChN, zespołu nerczycowego, remisji ani skuteczności leczenia. W ciąży obowiązuje odrębny kontekst położniczy; ten profil nie służy do jego automatycznej oceny.",
      sections: [
        { title: "Przeliczenie i limit dla dorosłych", paragraphs: ["Przyjęta górna granica = min(150 × BSA, 150) mg/24 h. Przy BSA 0,7 m² jest to <105 mg/24 h; przy 1,0 lub 1,5 m² — <150 mg/24 h. Dokładna równość z granicą nie spełnia kryterium „poniżej”.", "KDIGO 2024 podaje pediatryczne <150 mg/m²/24 h. Limit całkowitego wydalania 150 mg/24 h jest dodatkową regułą kalkulatora, a nie dosłownym zapisem cytowanego akapitu KDIGO. AEP 2022 stosuje inne kryterium: <100 mg/m²/24 h. Przyjęty próg nie oznacza zgodności ze wszystkimi zakresami laboratoryjnymi."] },
        { title: "Zakres nerczycowy", paragraphs: ["U dzieci od 1. roku do <18 lat: ≥1000 mg/m²/24 h (KDIGO 2025). U dorosłych: ≥3500 mg/24 h (KDIGO 2021, rycina 4). Limit 150 mg/24 h dotyczy wyłącznie górnej granicy normy; nie przełącza całego profilu dziecka na dorosły po osiągnięciu 1 m².", "Sam wynik nie rozpoznaje zespołu nerczycowego. Uwzględnia się też obraz kliniczny oraz albuminę we krwi. <100 mg/m²/24 h z kryteriów remisji przez kolejne dni nie stanowi w tym profilu ogólnej normy zdrowego dziecka."] }
      ]
    },
    educationalReferences: []
  });
  return Object.freeze({ DEFAULT_POLICY, getPolicy: () => DEFAULT_POLICY });
});
