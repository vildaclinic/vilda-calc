/* Versioned phosphorus-excretion reference policy; injected into the engine.
 * Source bands use the accepted completed-year convention (6≤age<13, 13≤age<81).
 * These laboratory intervals are not treatment targets or renal-wasting cutoffs. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPo4DzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const SOURCE_ID = "LABCORP_003251_2026_10_29";
  const titles = { low: "Poniżej zakresu dla wieku", within: "W zakresie dla wieku", high: "Powyżej zakresu dla wieku" };
  const interpretation = {
    low: "Wynik jest poniżej zakresu Labcorp dla wieku i płci. Wydalanie zależy m.in. od diety i leczenia; oceń je łącznie z fosforanami w surowicy.",
    within: "Wynik mieści się w zakresie Labcorp dla wieku i płci. Nie wyklucza to nieadekwatnej utraty fosforanów przy hipofosfatemii; oceń go łącznie z fosforanami w surowicy.",
    high: "Wynik jest powyżej zakresu Labcorp dla wieku i płci. Sam wynik nie rozpoznaje nerkowej utraty fosforanów; oceń go łącznie z dietą, leczeniem i fosforanami w surowicy."
  };
  function profile(id, ageLower, ageUpper, sex, population, lower, upper, sourceAgeLabel) {
    return { id, role: ageLower < 13 ? "child" : "age-sex", ageLower, ageUpper, ageLowerInclusive: true, ageUpperInclusive: false, sex, kind: "interval", lower, upper, lowerInclusive: true, upperInclusive: true, unit: "mg P/24 h", label: "Norma dla wieku", population, text: lower + "–" + upper, sourceId: SOURCE_ID, sourceIds: [SOURCE_ID], sourceLabel: "Labcorp 003251 · " + population, sourceAgeLabel, method: "Kolorymetria; zakres katalogu laboratoryjnego", sample: "Pełna zbiórka moczu 24 h", contextLabel: "Zakres laboratoryjny Labcorp", titles: { ...titles }, copy: { ...interpretation }, explanation: "Źródłowa grupa wieku: " + sourceAgeLabel + ". Przyjęta konwencja ukończonych lat nie tworzy ciągłej krzywej wieku. Granice wyniku są włączone; nie jest to cel terapii ani próg rozpoznania nerkowej utraty fosforanów." };
  }
  const DEFAULT_POLICY = freeze({
    id: "PO4_DZM_LABCORP_003251_2026_10_29", version: 1, quantity: "phosphorus-excretion", minimumAge: 6, sexRequiredAge: 13,
    population: { label: "Labcorp 003251 · zakresy laboratoryjne dla wieku i płci od 6 lat", limitations: "Katalog nie podaje liczebności populacji ani definicji percentyli. Nie ustala zakresu dla wieku 0–5 lat. Zakres nie jest uniwersalnym celem zdrowotnym lub celem terapii." },
    agePolicy: "Zaakceptowana konwencja ukończonych lat: 6≤wiek<13, 13≤wiek<81, wiek≥81. Dla wieku podanego w ukończonych latach cały możliwy przedział [wiek,wiek+1) musi mieścić się w grupie. Źródłowe etykiety to 6 to 12 y, 13 to 80 y i >80 y.",
    profiles: [
      profile("LABCORP_PO4_6_12", 6, 13, null, "6–12 lat · obie płcie", 130, 941, "6 to 12 y"),
      profile("LABCORP_PO4_13_80_M", 13, 81, "M", "13–80 lat · mężczyźni", 390, 1425, "13 to 80 y"),
      profile("LABCORP_PO4_13_80_F", 13, 81, "F", "13–80 lat · kobiety", 261, 1078, "13 to 80 y"),
      profile("LABCORP_PO4_OVER_80_M", 81, null, "M", ">80 lat · mężczyźni", 210, 888, ">80 y"),
      profile("LABCORP_PO4_OVER_80_F", 81, null, "F", ">80 lat · kobiety", 96, 706, ">80 y")
    ],
    sources: [
      { id: SOURCE_ID, label: "Labcorp 003251 · Phosphorus, 24-Hour Urine", url: "https://www.labcorp.com/tests/003251/phosphorus-24-hour-urine", locator: "Reference Range, Methodology, Use; 0–5 y not established; 6–12 y 130–941; 13–80 y M390–1425/F261–1078; >80 y M210–888/F96–706 mg/24 h", accessed: "2026-10-29", revision: "Katalog nie wskazuje daty rewizji" },
      { id: "CIAAW_PHOSPHORUS", label: "CIAAW · Phosphorus", url: "https://ciaaw.org/phosphorus.htm", locator: "Masa atomowa P: 30.973761998(5). Zachowano współczynnik producenta Vilda 30.9738 mg P/mmol.", accessed: "2026-10-29" },
      { id: "IWG_XLH_ADULT_2025", label: "International Working Group 2025 · XLH u dorosłych", url: "https://doi.org/10.1210/clinem/dgaf170", doi: "10.1210/clinem/dgaf170", locator: "Ocena gospodarki fosforanowej i monitorowanie leczenia; brak automatycznego progu skuteczności PO4 DZM", accessed: "2026-10-29" },
      { id: "IWG_XLH_CHILD_2025", label: "International Working Group 2025 · XLH u dzieci", url: "https://doi.org/10.1210/clinem/dgaf093", doi: "10.1210/clinem/dgaf093", locator: "Diagnostyka i monitorowanie; sparowane próbki krwi i moczu, TRP/TmP-GFR", accessed: "2026-10-29" },
      { id: "CRYSVITA_PL_EMA_2026", label: "Crysvita · polska ChPL EMA", url: "https://www.ema.europa.eu/pl/documents/product-information/crysvita-epar-product-information_pl.pdf", locator: "Punkt 4.4; sugeruje kontrolę wapnia i fosforanów w moczu co 3 miesiące, bez ilościowego celu PO4 DZM", accessed: "2026-10-29" },
      { id: "HYPOPT_2025", label: "Międzynarodowy konsensus HypoPT 2025", url: "https://doi.org/10.1016/j.metabol.2025.156335", doi: "10.1016/j.metabol.2025.156335", locator: "Nie określa celu ilościowego PO4 DZM dla leczenia", accessed: "2026-10-29" },
      { id: "PHPT_WORKSHOP_2022", label: "PHPT · Fifth International Workshop 2022", url: "https://doi.org/10.1002/jbmr.4677", doi: "10.1002/jbmr.4677", locator: "Nie określa celu ilościowego PO4 DZM dla leczenia", accessed: "2026-10-29" }
    ],
    notes: {
      noPolicyTitle: "Wynik bez porównania z normą", noPolicy: "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.",
      noAge: "Wiek pacjenta jest nieznany lub nie ma wystarczającej dokładności do doboru zakresu. Dostępna liczba pozostaje bez porównania z normą.",
      belowAge: "Wybrany profil Labcorp nie ustala zakresu poniżej 6 lat. Nie stosujemy zastępczej normy starszych dzieci ani dorosłych.",
      noSex: "W tym wieku profil Labcorp wymaga znanej płci. Dostępna liczba pozostaje bez porównania z normą.",
      noProfile: "Nie dobrano zakresu właściwego dla wieku, płci lub dokładności dostępnego wieku. Wynik pozostaje bez automatycznej oceny.",
      non24Title: "Oszacowanie na 24 godziny", non24: "To oszacowanie po przeliczeniu z rzeczywistego czasu do 24 godzin. Nie porównujemy go z normą pełnej DZM.",
      reportedNon24: "Znany czas zbiórki jest inny niż 24 godziny. Podany wynik dobowy pozostaje bez ponownego przeliczenia; nie porównujemy go z normą pełnej DZM.",
      zeroTitle: "Wynik 0 — sprawdź zapis laboratorium", zero: "Sprawdź, czy 0 oznacza wynik poniżej granicy oznaczalności. Zapis „<” nie jest dokładnym zerem.",
      briefContext: "Na wydalanie wpływają dieta i leczenie; oceniaj łącznie z fosforanami w surowicy.",
      sections: [
        { title: "Zakres dla wieku i płci", paragraphs: ["Stosujemy jeden profil Labcorp 003251: 6–12 lat 130–941; 13–80 lat M390–1425/F261–1078; >80 lat M210–888/F96–706 mg P/24 h. Granice wyniku są włączone. Poniżej 6 lat katalog nie ustala zakresu.", "Przyjęto konwencję ukończonych lat (6≤wiek<13; 13≤wiek<81; ≥81). Źródło jest konkretnym katalogiem laboratorium, nie uniwersalną normą zdrowia ani celem terapii. Nie łączymy go z innymi zakresami lub pediatrycznymi medianami."] },
        { title: "Obliczenie i zbiórka", paragraphs: ["mg P/L × L ×24/czas w godzinach = mg P/24 h. Domyślnie przyjmujemy pełne 24 h; rzeczywisty czas można zmienić. Inny czas daje oszacowanie bez normy pełnej doby. Gotowego wyniku dobowego nie przeliczamy ponownie; znany inny czas nadal wyłącza normę.", "Znana niepełna lub błędna zbiórka blokuje wynik w obu trybach. Historyczny brak czasu wymaga uzupełnienia i nie zmienia się automatycznie w pełną dobę.", "P oznacza masę fosforu, nie jonu PO4. Zachowano współczynnik producenta: 1 mmol = 30,9738 mg P. Wynik na kg jest wyłącznie opcjonalnym przeliczeniem z dostępnej masy ciała.", "Wynik i granice porównujemy przed zaokrągleniem. Mała dodatnia wartość pozostaje dodatnia; dokładne 0 wymaga sprawdzenia zapisu laboratorium i granicy oznaczalności."] },
        { title: "Przytarczyce i hipofosfatemia", paragraphs: ["PHPT i HypoPT nie otrzymują tutaj osobnego celu PO4 DZM ani automatycznej oceny skuteczności leczenia. Oceń fosforany we krwi, PTH, wapń, czynność nerek i stosowane leczenie zgodnie z kontekstem.", "W hipofosfatemii nawet wynik w zakresie laboratoryjnym może oznaczać nieadekwatną utratę. Do oceny transportu nerkowego służą właściwie dobrane sparowane próbki krwi i moczu oraz TRP/TmP-GFR; DZM sama nie rozpoznaje przyczyny."] },
        { title: "Krzywica hipofosfatemiczna, XLH i burosumab", paragraphs: ["Nie każda krzywica hipofosfatemiczna jest XLH. U dorosłych XLH DZM może być elementem wstępnej diagnostyki; u dzieci zwykle wykorzystuje się odpowiednio sparowane próbki punktowe, TRP i TmP-GFR.", "Polska ChPL Crysvita, punkt 4.4, sugeruje kontrolę wapnia i fosforanów w moczu co 3 miesiące, bez wymogu każdorazowej DZM i bez ilościowego celu skuteczności PO4 DZM. Skuteczność ocenia się z fosforanami w surowicy na czczo, normą wieku, TmP-GFR, odpowiedzią kliniczną i czasem od dawki; bezpieczeństwo także z wapniem, PTH i czynnością nerek.", "Ten kalkulator nie dobiera dawek burosumabu i nie ocenia skuteczności na podstawie DZM. Przejście do TmP/GFR zachowuje pacjenta, ale nie tworzy brakujących stężeń z ilości dobowej ani nie przypisuje starej surowicy do nowej próbki."] }
      ]
    },
    educationalReferences: []
  });
  return Object.freeze({ DEFAULT_POLICY, getPolicy: () => DEFAULT_POLICY });
});
