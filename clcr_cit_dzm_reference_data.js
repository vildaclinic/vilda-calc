/* EAU 2026 citrate excretion references. Source thresholds stay separate from the engine. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCitDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const SOURCES = [
    { id: "EAU_UROLITHIASIS_2026", label: "EAU Urolithiasis, 2026", title: "EAU Guidelines on Urolithiasis", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", supplementUrl: "https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf", location: "Tabele 4.2 i 4.4, s. 47–48; rozdziały 4.1.2 i 4.4.2", version: "2026", accessed: "2026-11-05", population: "Dzieci i dorośli oceniani pod kątem kamicy; wartości zależne od płci, u dzieci odniesione do powierzchni ciała.", sample: "Pełna 24-godzinna zbiórka moczu", method: "Wytyczne kliniczne; dolna granica wydalania stosowana w ocenie kamicy", limitations: "To dolna granica, nie pełny dwustronny zakres ani indywidualny cel leczenia. EAU nie wyznacza dolnej granicy wieku pediatrycznego. Odpowiedniki masowe w tabeli są zaokrąglone; aplikacja porównuje z jednym progiem molowym." },
    { id: "KIREJCZYK_2014", label: "Kirejczyk i wsp., 2014", title: "Urinary citrate excretion in healthy children depends on age and gender", doi: "10.1007/s00467-014-2806-7", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/", location: "Methods, Table 3, Discussion", version: "2014", accessed: "2026-11-05", population: "2334 zdrowych dzieci kaukaskich z Białegostoku w wieku 2–<18 lat, równe liczby chłopców i dziewcząt", sample: "Dobowa zbiórka moczu", method: "Enzymatyczna, R-Biopharm", limitations: "Odmienne granice przesiewowe 180/250 mg/1,73 m²/24 h nie są połączone z progami EAU. Nie obejmuje niemowląt ani nie wyznacza celu leczenia kamicy." },
    { id: "HOPPE_KEMPER_2010", label: "Hoppe i Kemper, 2010", title: "Diagnostic examination of the child with urolithiasis or nephrocalcinosis", doi: "10.1007/s00467-008-1073-x", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2810372/", location: "Tabela 3", version: "2010", accessed: "2026-11-05", limitations: "Przegląd podaje progi pediatryczne zgodne z EAU; nie wyznacza osobnej dolnej granicy wieku przy cytrynianach." },
    { id: "RBIOPHARM_CITRIC_ACID_2011", label: "R-Biopharm — postać masowa cytrynianów", url: "https://slatti.se/files/enzymatiska/Citric%20acid_EN_10139076035_2011-05.pdf", location: "Calculation, s. 1; sekcje 2.1–2.2, s. 2", version: "2011-05", accessed: "2026-11-05", limitations: "Instrukcja przeliczeń analitycznych, nie norma kliniczna ani dowód postaci użytej w próbce pacjenta. Zachowano stałe jonu 189,099 i kwasu bezwodnego 192,1235 mg/mmol zgodne z istniejącym Cit/Cr aplikacji." }
  ];
  const DEFAULT_POLICY = {
    id: "eau-2026-citrate-dzm-v1", version: 1, schema: "clcr-cit-dzm-reference-policy", label: "EAU Urolithiasis, 2026",
    adultLowerMmolPerDay: { M: 1.7, F: 1.9 }, pediatricLowerIndexedMmolPerDay: { M: 1.9, F: 1.6 },
    adultLowerInclusive: true, pediatricLowerInclusive: false,
    pediatricMinAgeYears: 1, adultAgeYears: 18, bodySurfaceIndex: 1.73, bsaMethod: "Mosteller",
    adultAgeNote: "18 lat to granica dorosłości przyjęta w aplikacji; EAU podaje osobne odniesienia dla dzieci i dorosłych.",
    pediatricAgeNote: "Wyłączenie automatycznej oceny poniżej 1. roku życia jest ostrożnościową decyzją aplikacji zaakceptowaną 05.11.2026, a nie granicą wieku określoną przez EAU.",
    population: { label: "EAU 2026 — ocena obniżonego wydalania cytrynianów w kontekście kamicy", ageLower: 1, ageUpper: null, sex: "M/F", childCorrection: "BSA / 1,73", adultCap: null },
    masses: { citrate_ion: "189.099", citric_acid: "192.1235" }, sourceId: "EAU_UROLITHIASIS_2026", sources: SOURCES,
    notes: {
      assumption: "Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej.",
      noPolicy: "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.",
      noAge: "Brak wieku do doboru normy. Wynik dobowy pozostaje dostępny.",
      noSex: "Dolna granica jest różna dla obu płci. Brak płci w danych pacjenta nie blokuje wyniku dobowego.",
      noBsa: "Wynik dobowy jest obliczony. Do normy dziecka potrzebne są masa i wzrost z danych pacjenta.",
      infant: "Dla niemowlęcia pokazujemy ilość na dobę bez automatycznej oceny. Nie ustalono odrębnego odniesienia niemowlęcego w przyjętej polityce aplikacji.",
      unknownEntity: "Ilość na dobę jest obliczona. Do przeliczenia normy na mg potrzebna jest postać masowa podana przez laboratorium.",
      non24: "Przeliczenie krótszej lub dłuższej zbiórki na 24 godziny nie zastępuje pełnej zbiórki dobowej. Nie nadajemy mu automatycznej oceny.",
      reportedNon24: "Gotowego wyniku dobowego nie przeliczamy ponownie. Znany inny czas zbiórki niż 24 godziny ogranicza porównanie z normą.",
      reportedUnknownDuration: "Wpisany wynik dobowy jest dostępny. Nieznany lub nieprawidłowy czas pierwotnej zbiórki nie pozwala porównać go z normą.",
      incomplete: "Zbiórka jest niepełna. Z tych danych nie można wyznaczyć wiarygodnego wydalania dobowego.",
      within: "Wydalanie nie jest obniżone według przyjętej normy.",
      boundary: "Wynik jest równy dolnej granicy. Przyjęta norma obejmuje wartości powyżej tej granicy.",
      low: "Mała ilość cytrynianów osłabia ochronę przed tworzeniem złogów wapniowych i może zwiększać ryzyko kamicy.",
      clinicalDetails: "Cytryniany wiążą wapń i hamują krystalizację. Obniżone wydalanie może towarzyszyć m.in. kwasicy lub hipokaliemii. Sam wynik nie ustala przyczyny ani skuteczności leczenia. Przyjęte porównanie nie ma górnej patologicznej granicy.",
      collectionDetails: "Porównanie dotyczy kompletnej zbiórki 24-godzinnej. W pełnej ocenie metabolicznej kamicy EAU zaleca dwie kolejne zbiórki dobowe.",
      zeroDetails: "Sprawdź, czy laboratorium podało dokładne zero, czy wynik poniżej granicy oznaczalności. Nie zastępuj zapisu „<” zerem.",
      alternativeSource: "Badanie Kirejczyka i wsp. podaje granice przesiewowe 180 mg u chłopców i 250 mg u dziewcząt na 1,73 m²/24 h dla zdrowych dzieci 2–<18 lat. To inne odniesienie niż przyjęte EAU do oceny kamicy; nie łączymy tych progów.",
      bodySurfaceArea: "U dziecka granicę źródłową mnożymy przez BSA / 1,73; BSA obliczamy wzorem Mostellera.",
      conversion: "Normę przeliczamy z mmol do tej samej jednostki i postaci masowej co wynik.",
      scope: "Dolna granica wg EAU · ocena ryzyka kamicy.",
      ageBoundary: "Automatyczna ocena od 1. roku życia i profil dorosły od 18 lat to przyjęte granice aplikacji.",
      collection: "Pełna zbiórka 24 h. Czas jest domyślnie ustawiony, a znane nieprawidłowości zbiórki zachowują znaczenie."
    }
  };
  return freeze({ DEFAULT_POLICY, SOURCES });
});
