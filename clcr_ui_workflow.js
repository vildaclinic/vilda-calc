(function (global) {
  "use strict";

  const LEVEL_ORDER = Object.freeze({ basic: 0, advanced: 1, pro: 2 });
  const HISTORICAL_FORMULA_IDS = Object.freeze(["sch_var"]);

  const MODULES = Object.freeze([
    {
      id: "adult-egfr",
      path: "clinical",
      level: "basic",
      title: "eGFR u dorosłych",
      description: "Oszacowanie filtracji na podstawie kreatyniny.",
      keywords: "nerki filtracja dorosly dorosłych kreatynina ckd epi",
      formulaIds: ["egfr"],
    },
    {
      id: "child-egfr",
      path: "clinical",
      level: "basic",
      title: "eGFR u dziecka i młodej osoby",
      description: "Współczesny wzór kreatyninowy CKiD U25.",
      keywords: "dziecko dzieci pediatria mlodziez młodzież ckid u25 kreatynina",
      formulaIds: ["ckid_u25"],
    },
    {
      id: "cockcroft-gault",
      path: "clinical",
      level: "basic",
      title: "Cockcroft–Gault",
      description: "Nieindeksowany eCrCl z rzeczywistą masą ciała.",
      keywords: "dawkowanie lekow leków ecrcl klirens masa ciala",
      formulaIds: ["cg"],
    },
    {
      id: "cockcroft-indexed",
      path: "clinical",
      level: "basic",
      title: "Cockcroft–Gault 1,73 m²",
      description: "eCrCl przeliczony na standardową powierzchnię ciała.",
      keywords: "dawkowanie ecrcl klirens indeksowany powierzchnia ciala bsa",
      formulaIds: ["cg_norm"],
    },
    {
      id: "measured-clearance",
      path: "clinical",
      level: "advanced",
      title: "Zmierzony klirens kreatyniny",
      description: "Cztery wartości z czasowej zbiórki moczu i badania krwi.",
      keywords: "zbiórka zbiorka czasowa dobowa dzm mocz klirens kreatyniny",
      formulaIds: ["cl24"],
    },
    {
      id: "pediatric-extended",
      path: "clinical",
      level: "advanced",
      title: "Dziecko i noworodek — wzory dodatkowe",
      description: "Bedside Schwartz 2009 oraz ścieżka noworodka donoszonego.",
      keywords: "dziecko dzieci noworodek neonatalny schwartz bedside pediatria",
      formulaIds: ["sch_idms", "neonatal_egfr"],
    },
    {
      id: "timed-urine-panel",
      path: "clinical",
      level: "advanced",
      title: "Dobowa i czasowa zbiórka moczu",
      description: "Wydalanie analitów oraz wskaźniki z DZM.",
      keywords:
        "dzm dobowa mocz sód sod potas wapń wapn magnez fosfor białko bialko kwas moczowy",
      formulaIds: [
        "UA_mgkg",
        "Ca_mgkg",
        "Mg_mgkg",
        "PO4_mgkg",
        "Prot_mgkg",
        "Na_mmol_d",
        "K_mmol_d",
        "KM_Cr",
        "Ca_Cr",
        "Mg_Ca",
        "PO4_Cr",
        "B_Cr",
        "K_frac",
      ],
    },
    {
      id: "serum-anion-gap",
      path: "clinical",
      level: "advanced",
      title: "Luka anionowa surowicy",
      description: "Obliczenie AG bez potasu.",
      keywords: "ags sód sod chlorki hco3 wodorowęglany kwasica surowica",
      formulaIds: ["AGs"],
    },
    {
      id: "adult-cystatin",
      path: "clinical",
      level: "pro",
      title: "eGFR kreatynina + cystatyna C",
      description: "Równanie CKD‑EPI dla dorosłych z dwoma markerami.",
      keywords: "dorosly dorosłych cystatyna c kreatynina ckd epi ifcc",
      formulaIds: ["egfr_cr_cys"],
    },
    {
      id: "child-cystatin",
      path: "clinical",
      level: "pro",
      title: "CKiD U25 z cystatyną C",
      description: "Wariant cystatynowy oraz połączony dla wieku 1–25 lat.",
      keywords: "dziecko dzieci mlodziez młodzież pediatria cystatyna ifcc ckid u25",
      formulaIds: ["ckid_u25_cys", "ckid_u25_cr_cys"],
    },
    {
      id: "stone-profile",
      path: "clinical",
      level: "pro",
      title: "Pełna ocena kamicy",
      description: "Szczawiany, cytryniany, Ca/Cit i pH dobowej zbiórki.",
      keywords: "kamica wapń wapn szczawiany oxalate cytryniany citrate mocz dzm",
      formulaIds: ["Ox_mgkg", "Cit_mgkg", "Ca_Cit", "pH24"],
    },
    {
      id: "dialysis-ktv",
      path: "clinical",
      level: "pro",
      title: "Adekwatność hemodializy KT/V",
      description: "spKt/Vurea, eKt/Vurea i URR dla ocenianej sesji IHD.",
      keywords: "kt v kt/v dializa hemodializa ihd urr mocznik adekwatność",
      formulaIds: ["KTV"],
    },
    {
      id: "spot-protein",
      path: "spot",
      level: "spot",
      title: "ACR i PCR",
      description: "Albumina lub białko w odniesieniu do kreatyniny tej samej próbki.",
      keywords: "acr pcr albumina białko bialko kreatynina próbka probka moczu",
      formulaIds: ["ACR", "PCR"],
    },
    {
      id: "spot-stone-ratios",
      path: "spot",
      level: "spot",
      title: "Ca/Ox/Cit do kreatyniny",
      description: "Wskaźniki punktowe pomocne w ocenie ryzyka kamicy.",
      keywords:
        "wapń wapn calcium szczawiany oxalate cytryniany citrate kamica kreatynina mocz",
      formulaIds: ["CaCr_spot", "OxCr_spot", "CitCr_spot"],
    },
    {
      id: "spot-fe-uag",
      path: "spot",
      level: "spot",
      title: "Frakcje wydalnicze i UAG",
      description: "FE Na/K/Cl/HCO₃ oraz luka anionowa moczu ze sparowanych próbek.",
      keywords:
        "fena fek fecl fehco3 uag sód sod potas chlorki wodorowęglany surowica mocz",
      formulaIds: [
        "FENa_spot",
        "FEK_spot",
        "FECl_spot",
        "FEHCO3_spot",
        "AGu_spot",
      ],
    },
    {
      id: "spot-tmp-gfr",
      path: "spot",
      level: "spot",
      title: "TmP/GFR i TRP",
      description: "Ocena transportu fosforanów ze sparowanych próbek.",
      keywords: "tmp gfr tmp/gfr trp fosfor fosforany druga poranna na czczo",
      formulaIds: ["TMP_GFR"],
    },
    {
      id: "spot-ph",
      path: "spot",
      level: "spot",
      title: "pH próbki moczu",
      description: "Surowy wynik pH z informacją o rodzaju próbki.",
      keywords: "ph kwasowość kwasowosc próbka probka moczu kamica",
      formulaIds: ["pH_spot"],
    },
  ]);

  const MODULE_BY_FORMULA = new Map();
  MODULES.forEach((module) => {
    module.formulaIds.forEach((formulaId) => MODULE_BY_FORMULA.set(formulaId, module));
  });

  // ————————————————————————————————————————————————————————————————
  // Faza 0 — słownik parametrów karty pacjenta (CLCR_PARAM_DICTIONARY).
  // Nazwy zatwierdzone (ZAŁOŻENIA §4). Zmiana wyłącznie prezentacji /
  // nazewnictwa serii — ZERO wpływu na liczenie (silnik i moduły
  // kliniczne pozostają zamrożone). Klucz serii = testKey `clcr:<id>`,
  // spójny z tagami silnika `data-clcr-formula`.
  //   ① Wyniki wieloczłonowe → osobne serie: białko DZM (Prot_mgkg) i
  //      KT/V (KTV) rozbite; `sourceFormulaId` wskazuje formułę-źródło.
  //   ② ACR/PCR → jednostka `mg/g`.
  //   ③ Etykiety opisowe; kryptyczne nazwy wzorów w podlinii `method`.
  // ————————————————————————————————————————————————————————————————
  const PARAM_GROUPS = global.ClcrSavedResults.PARAM_GROUPS;
  const PARAM_DICTIONARY = global.ClcrSavedResults.PARAM_DICTIONARY;
  const getParam = (...args) => global.ClcrSavedResults.getParam(...args);
  const getParamByLabel = (...args) => global.ClcrSavedResults.getParamByLabel(...args);
  const getParamGroups = (...args) => global.ClcrSavedResults.getParamGroups(...args);
  const normalizeTestKey = (...args) => global.ClcrSavedResults.normalizeTestKey(...args);

  const DZM_PROTOCOL_FIELDS = Object.freeze([
    "collectionStartAt",
    "collectionEndAt",
    "collectionStartVoidDiscarded",
    "collectionFinalVoidIncluded",
    "collectionNoMissedVoids",
    "collectionNoSpillage",
    "collectionNoExtraVoids",
    "collectionStorageFollowed",
  ]);

  const DZM_QUALITY_FIELDS = Object.freeze([
    "collectionStartVoidDiscarded",
    "collectionFinalVoidIncluded",
    "collectionNoMissedVoids",
    "collectionNoSpillage",
    "collectionNoExtraVoids",
    "collectionStorageFollowed",
  ]);

  const DZM_QUALITY_GROUP_FOCUS_ID = "clcrDzmQualityGroup";

  const SPOT_INTERFERENCE_FIELDS = Object.freeze([
    "spotMenstruation",
    "spotHematuria",
    "spotInfection",
    "spotExercise",
    "spotAcuteIllness",
  ]);

  const KTV_CONTEXT_FIELDS = Object.freeze([
    "ktvAccessType",
    "ktvKru",
    "ktvKruMeasuredAt",
    "ktvTreatmentsDelivered",
  ]);

  const FORMULA_CONTEXT = Object.freeze({
    egfr: {
      interpretation: [],
      optional: ["weight", "height"],
    },
    ckid_u25: {
      interpretation: ["ageMonths"],
      optional: ["weight"],
    },
    egfr_cr_cys: {
      interpretation: [],
      optional: [],
    },
    ckid_u25_cys: {
      interpretation: ["ageMonths"],
      optional: [],
    },
    ckid_u25_cr_cys: {
      interpretation: ["ageMonths"],
      optional: [],
    },
    neonatal_egfr: {
      interpretation: [],
      optional: ["ScrAssay"],
    },
    cg: {
      interpretation: [],
      optional: [],
    },
    cg_norm: {
      interpretation: [],
      optional: [],
    },
    sch_idms: {
      interpretation: ["ageMonths"],
      optional: ["weight"],
    },
    cl24: {
      interpretation: [],
      optional: [],
    },
    ACR: {
      interpretation: ["spotSampleKind", "age", "ageMonths", "sex"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    PCR: {
      interpretation: ["age", "ageMonths"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    CaCr_spot: {
      interpretation: ["age", "ageMonths"],
      optional: [],
    },
    OxCr_spot: {
      interpretation: ["age", "ageMonths"],
      optional: [],
    },
    CitCr_spot: {
      interpretation: ["age", "ageMonths"],
      optional: [],
    },
    FENa_spot: {
      interpretation: [],
      optional: [],
    },
    FEK_spot: {
      interpretation: [],
      optional: [],
    },
    FECl_spot: {
      interpretation: [],
      optional: [],
    },
    FEHCO3_spot: {
      interpretation: [],
      optional: [],
    },
    AGu_spot: {
      interpretation: ["spotSampleKind", "spotNagmaContext"],
      optional: ["spotKnownCKD"],
    },
    TMP_GFR: {
      interpretation: ["ageMonths", "sex"],
      optional: [],
    },
    pH_spot: {
      interpretation: ["spotSampleKind"],
      optional: SPOT_INTERFERENCE_FIELDS,
    },
    Ox_mgkg: {
      interpretation: [
        "ageMonths",
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
      ],
      optional: ["stoneThiolTherapy"],
    },
    Cit_mgkg: {
      interpretation: [
        "ageMonths",
        "sex",
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
      ],
      optional: [],
    },
    Ca_Cit: {
      interpretation: [],
      optional: [],
    },
    pH24: {
      interpretation: [
        "stoneMetabolicEvaluationContext",
        "stoneCollectionPlausibilityReviewed",
        "stoneTwoCollectionsConfirmed",
        "stonePhPersistent",
        "stoneUtiExcluded",
      ],
      optional: [
        "stoneKnownCystinuria",
        "stoneSpotFasting",
        "spotSampleKind",
        "U_pH",
        "spotInfection",
      ],
    },
    KTV: {
      interpretation: KTV_CONTEXT_FIELDS,
      optional: [],
    },
  });

  const SHARED_MODULE_FIELD_IDS = Object.freeze({
    "spot-protein": Object.freeze([
      "U_Alb",
      "U_Prot_spot",
      "Ucr_spot",
      "Ucr_spot_unit",
    ]),
  });

  const ACTIVE_CONFOUNDER_MESSAGES = Object.freeze({
    spotMenstruation:
      "Miesiączka może przejściowo zmieniać ACR, PCR i część wskaźników moczowych; wynik wymaga ostrożnej interpretacji.",
    spotHematuria:
      "Krwiomocz może wpływać na ACR, PCR i wskaźniki kamicowe; wynik wymaga ostrożnej interpretacji.",
    spotInfection:
      "Zakażenie układu moczowego może przejściowo zmieniać białkomocz, pH i część analitów moczowych.",
    spotExercise:
      "Intensywny wysiłek przed pobraniem może przejściowo zwiększyć albuminurię lub białkomocz.",
    spotAcuteIllness:
      "Gorączka lub ostra choroba mogą przejściowo zmieniać wydalanie analitów i ograniczać porównywalność wyniku.",
    spotDiureticUse:
      "Stosowanie diuretyku może istotnie zmieniać frakcje wydalnicze.",
    spotKnownCKD:
      "Rozpoznana przewlekła choroba nerek może ograniczać wartość diagnostyczną frakcji wydalniczych i UAG.",
  });

  const INTERPRETATION_NEGATIVE_MESSAGES = Object.freeze({
    spotBicarbonateLoad:
      "Nie potwierdzono udokumentowanego protokołu obciążenia wodorowęglanem; zastosowanie FEHCO₃ zależy od tego protokołu.",
    spotNagmaContext:
      "Nie potwierdzono właściwego kontekstu kwasicy metabolicznej z prawidłową luką anionową; zastosowanie UAG zależy od tego kontekstu.",
    stoneMetabolicEvaluationContext:
      "Nie potwierdzono właściwego kontekstu pełnej oceny metabolicznej kamicy.",
    stoneCollectionPlausibilityReviewed:
      "Nie potwierdzono oceny wiarygodności zbiórki moczu; interpretacja profilu kamicowego jest ograniczona.",
    stoneTwoCollectionsConfirmed:
      "Nie potwierdzono dwóch wiarygodnych zbiórek; pełna interpretacja profilu kamicowego jest ograniczona.",
    stonePhPersistent:
      "Nie potwierdzono utrzymywania się nieprawidłowego pH w kolejnych pomiarach.",
    stoneUtiExcluded:
      "Nie potwierdzono wykluczenia zakażenia układu moczowego jako przyczyny nieprawidłowego pH.",
    ktvTreatmentsDelivered:
      "Surowy wynik spKt/V jest możliwy, ale interpretacja progowa wymaga potwierdzenia regularnej realizacji ocenianego schematu.",
  });

  const HELP_OVERRIDES = Object.freeze({
    age: "Podaj ukończone lata. U niemowlęcia i dziecka poniżej roku uzupełnij również pełne miesiące.",
    ageMonths: "Podaj pełne miesiące od ostatnich urodzin (0–11). Wartość 0 jest prawidłowa.",
    ageDays: "Podaj ukończone dni życia noworodka (0–28). Wartość 0 jest prawidłowa.",
    sex: "Wybór jest wymagany tylko przez wzory, które jawnie uwzględniają płeć biologiczną.",
    weight: "Podaj aktualną masę ciała w kilogramach. Nie zastępuj jej masą należną bez wskazania wzoru.",
    height: "Podaj aktualny wzrost w centymetrach; jest używany m.in. w BSA i wzorach pediatrycznych.",
    Scr: "Podaj kreatyninę w surowicy i wybierz jednostkę dokładnie zgodną z wynikiem laboratoryjnym.",
    ScrUnit: "Wybierz jednostkę kreatyniny w surowicy zgodną z dokumentem źródłowym.",
    ScrAssay: "Standaryzacja do IDMS wpływa na wiarygodność i dostępność współczesnych wzorów kreatyninowych.",
    CrCysStandardizationConfirmed: "Potwierdzenie dotyczy łącznie kreatyniny standaryzowanej do IDMS i cystatyny C identyfikowalnej do ERM-DA471/IFCC. Nie określa techniki oznaczenia ani stabilności markerów.",
    creatinineState: "eGFR i eCrCl zakładają stabilne markery filtracji. Szybka zmiana ogranicza lub wyklucza interpretację.",
    suspectedAKI: "Zaznacz, jeżeli istnieje podejrzenie ostrego uszkodzenia nerek. Wtedy estymacje stanu stacjonarnego mogą być niewiarygodne.",
    CystatinC: "Podaj cystatynę C w mg/L z wyniku laboratoryjnego.",
    CystatinCStandardization: "Potwierdź identyfikowalność oznaczenia do ERM‑DA471/IFCC.",
    spotSampleKind: "Rodzaj i pora pobrania próbki wpływają na dobór odniesienia i porównywalność wyniku.",
    spotSameSpecimen: "Potwierdź, że wszystkie używane anality moczu pochodzą z dokładnie tej samej próbki.",
    ACR_reported: "Wpisz ilościowy wynik ACR z laboratorium wraz ze znakiem <, ≤, > lub ≥, jeśli znajduje się na wydruku. Nie wpisuj tu samego stężenia albuminy.",
    ACR_reported_unit: "Zachowaj jednostkę podaną przez laboratorium. Kategorie KDIGO w mg/g i mg/mmol mają zaokrąglone progi i są oceniane w oryginalnej jednostce.",
    U_Alb_unit: "Wybierz jednostkę stężenia albuminy zgodną z wynikiem: mg/L albo mg/dL.",
    ACR_same_specimen: "Iloraz stężeń jest poprawny wyłącznie dla oznaczeń z tej samej próbki. Domyślnie jest to jawne założenie; znane różne próbki wykluczają obliczenie.",
    PCR_reported: "Wpisz ilościowy wynik PCR z laboratorium, zachowując znak <, ≤, > lub ≥. Nie wpisuj tu samego stężenia białka.",
    PCR_reported_unit: "Zachowaj jednostkę raportu. mg/mg i g/g odpowiadają wartości w mg/g podzielonej przez 1000; mg/mmol ma własne progi źródłowe.",
    U_Prot_spot_unit: "Wybierz jednostkę stężenia białka całkowitego zgodną z wynikiem: mg/L, mg/dL albo g/L.",
    PCR_same_specimen: "Dla obliczenia ze stężeń przyjmujemy wspólną próbkę. Znane różne próbki blokują ten tryb; gotowy PCR z laboratorium jest oceniany niezależnie.",
    CaCr_reported: "Wpisz ilościowy wskaźnik wapń/kreatynina z laboratorium z oryginalnym znakiem <, ≤, > lub ≥. Nie wpisuj tu samego stężenia wapnia ani ilorazu klirensów wapnia i kreatyniny.",
    CitCr_reported: "Przepisz gotowy Cit/Cr z laboratorium, zachowując jednostkę i znak <, ≤, > lub ≥.",
    Cit_Cr_spot_unit: "Zachowaj jednostkę stężenia cytrynianów z raportu. Postać masowa jest opisana osobno pod polem.",
    CitCr_reported_unit: "Zachowaj jednostkę gotowego wskaźnika z raportu laboratoryjnego.",
    citrateSpotReportingEntity: "Postać podana w raporcie. Nieznana postać nie blokuje ilorazu masowego, ale uniemożliwia porównanie z normą molową.",
    CitCr_reported_basis: "Postać podana w raporcie laboratoryjnym dla jednostki masowej.",
    CitCr_same_specimen: "Zakładamy wspólną próbkę. Znane różne próbki blokują obliczenie ze stężeń; gotowy wynik jest oceniany niezależnie.",
    OxCr_reported: "Przepisz gotowy wskaźnik szczawiany/kreatynina z laboratorium wraz ze znakiem <, ≤, > lub ≥. Stężenia szczawianów nie wpisuj jako gotowego ilorazu.",
    OxCr_reported_unit: "Zachowaj jednostkę i postać analitu z raportu. Jednostki masowe wymagają wskazania jonu szczawianowego albo kwasu szczawiowego bezwodnego, aby porównać wynik z normą molową.",
    Ox_Cr_spot_unit: "Wybierz jednostkę szczawianów zgodną z raportem. Postać masowa jest częścią wyboru jednostki; bez niej można obliczyć iloraz masowy, lecz nie porównać go z normą molową.",
    OxCr_same_specimen: "Zakładamy wspólną próbkę szczawianów i kreatyniny. Znane różne próbki blokują obliczenie ze stężeń. Gotowy Ox/Cr z laboratorium oceniamy niezależnie.",
    CaCr_reported_unit: "Zachowaj jednostkę raportu. Wszystkie jednostki wskaźnika porównujemy z jednym źródłowym zakresem Mayo w mg/mg, przeliczonym na wybraną jednostkę; oba końce zakresu są włączone.",
    CaCr_same_specimen: "Wapń i kreatynina muszą pochodzić z tej samej próbki moczu. Przy braku przeciwnych danych jest to jawne założenie; znane różne próbki blokują iloraz stężeń. Gotowy Ca/Cr z laboratorium jest oceniany niezależnie.",
    spotPairedChemistry: "Potwierdź równoczesne pobranie krwi oraz moczu i wspólne pochodzenie analitów moczowych.",
    tmpOvernightFasting: "TmP/GFR wymaga próbki po nocnym pozostawaniu na czczo.",
    tmpPairedSameTime: "Potwierdź równoczesne pobranie sparowanych próbek krwi i drugiego porannego moczu.",
    collectionStartAt: "Podaj rzeczywistą datę i godzinę rozpoczęcia zbiórki po odrzuceniu pierwszej mikcji.",
    collectionEndAt: "Podaj rzeczywistą datę i godzinę zakończenia zbiórki wraz z końcową mikcją.",
    collectionStartVoidDiscarded: "Początkową mikcję należy odrzucić i od tej chwili liczyć czas zbiórki.",
    collectionFinalVoidIncluded: "Końcowa mikcja o zadanej godzinie musi zostać dołączona do zbiórki.",
    collectionNoMissedVoids: "Potwierdź, że w okresie zbiórki nie pominięto żadnej mikcji.",
    collectionNoSpillage: "Potwierdź, że nie utracono części próbki przez rozlanie.",
    collectionNoExtraVoids: "Potwierdź, że do pojemnika nie dodano moczu spoza zadeklarowanego czasu.",
    collectionStorageFollowed: "Potwierdź przechowywanie zgodnie z instrukcją laboratorium.",
    serumSampleDuringCollection: "Próbka surowicy powinna zostać pobrana w okresie ocenianej zbiórki.",
    serumSampleAt: "Podaj rzeczywistą datę i godzinę pobrania próbki surowicy.",
    Cl24DurationHours: "Podaj rzeczywisty czas zbiórki w godzinach, także ułamkowych (np. 23,5). Skrót 24 h wybierz tylko dla zbiórki trwającej dokładnie 24 godziny.",
    Cl24CollectionProblem: "Zaznacz znany problem, np. pominiętą porcję moczu, rozlanie, błędny czas lub przechowywanie. Nie można wtedy podać miarodajnego klirensu.",
    ktvSameSession: "Próbki przed i po dializie muszą pochodzić z tej samej ocenianej sesji.",
    ktvPreBeforeDialysis: "Próbkę przed dializą należy pobrać bezpośrednio przed rozpoczęciem sesji.",
    ktvPreNoDilution: "Potwierdź brak rozcieńczenia próbki solą, heparyną lub innym płynem.",
    ktvTreatmentsDelivered: "Potwierdź regularną realizację całego ocenianego schematu bez skracania zabiegów.",
    U_ACR: "Wartość ACR jest obliczana automatycznie i jest prezentowana wyłącznie w wynikach.",
    U_PCR: "Wartość PCR jest obliczana automatycznie i jest prezentowana wyłącznie w wynikach.",
    Ucr_spot: "Podaj stężenie kreatyniny z tej samej próbki moczu co oznaczany analit.",
    Ucr_spot_unit: "Wybierz jednostkę kreatyniny w próbce moczu dokładnie zgodną z wynikiem laboratorium.",
    spotMenstruation: "Miesiączka może przejściowo zwiększyć albuminę, białko lub krew w próbce i ograniczyć interpretację wskaźnika.",
    spotHematuria: "Krwiomocz może wpływać na ACR, PCR i wskaźniki kamicowe; wartość liczbowa wymaga wtedy ostrożnej interpretacji.",
    spotInfection: "Zakażenie układu moczowego może przejściowo zmienić białkomocz, pH i część analitów moczowych.",
    spotExercise: "Intensywny wysiłek przed pobraniem może przejściowo zwiększyć albuminurię lub białkomocz.",
    spotAcuteIllness: "Gorączka lub ostra choroba mogą przejściowo zmieniać wydalanie analitów i ograniczać porównywalność wyniku.",
    U_Na_spot: "Podaj stężenie sodu w próbce moczu używanej do obliczenia frakcji wydalniczej lub UAG.",
    S_Na_spot: "Podaj stężenie sodu z równocześnie pobranej próbki krwi.",
    U_K_spot: "Podaj stężenie potasu w tej samej próbce moczu co pozostałe anality punktowe.",
    S_K_spot: "Podaj stężenie potasu z równocześnie pobranej próbki krwi.",
    U_Cl_spot: "Podaj stężenie chlorków w tej samej próbce moczu co pozostałe anality punktowe.",
    S_Cl_spot: "Podaj stężenie chlorków z równocześnie pobranej próbki krwi.",
    U_HCO3_spot: "Podaj stężenie wodorowęglanów w próbce moczu zgodnej czasowo z próbką krwi.",
    S_HCO3_spot: "Podaj stężenie wodorowęglanów z równocześnie pobranej próbki krwi.",
    spotDiureticUse: "Diuretyk może istotnie zmienić frakcje wydalnicze; zaznacz użycie przed interpretacją FE.",
    spotKnownCKD: "Przewlekła choroba nerek może zmieniać wartość diagnostyczną frakcji wydalniczych i UAG.",
    spotBicarbonateLoad: "Interpretacja FEHCO₃ zależy od udokumentowanego protokołu obciążenia wodorowęglanem.",
    spotNagmaContext: "UAG interpretuje się pomocniczo w odpowiednim kontekście kwasicy metabolicznej z prawidłową luką anionową.",
    Ca_spot: "Podaj stężenie wapnia w tej samej próbce moczu co kreatynina.",
    Ca_spot_unit: "Wybierz jednostkę wapnia w próbce moczu zgodną z dokumentem laboratoryjnym.",
    U_PO4_spot: "Podaj stężenie fosforu nieorganicznego w drugim porannym moczu użytym do TmP/GFR.",
    U_PO4_spot_unit: "Wybierz jednostkę fosforu w próbce moczu zgodną z wynikiem laboratoryjnym.",
    S_PO4_spot: "Podaj stężenie fosforu nieorganicznego z równocześnie pobranej próbki krwi.",
    S_PO4_spot_unit: "Wybierz jednostkę fosforu w surowicy zgodną z wynikiem laboratoryjnym.",
    Scr_spot: "Podaj kreatyninę z próbki krwi pobranej równocześnie z moczem do TmP/GFR lub FE.",
    Scr_spot_unit: "Wybierz jednostkę kreatyniny w surowicy zgodną z wynikiem laboratoryjnym.",
  });

  const UNIT_PAIRS = Object.freeze({
    Scr: "ScrUnit",
    S_PO4: "S_PO4_unit",
    S_Ca: "S_Ca_unit",
    Ucr_spot: "Ucr_spot_unit",
    U_Alb: "U_Alb_unit",
    ACR_reported: "ACR_reported_unit",
    U_Prot_spot: "U_Prot_spot_unit",
    PCR_reported: "PCR_reported_unit",
    CaCr_reported: "CaCr_reported_unit",
    OxCr_reported: "OxCr_reported_unit",
    Ox_Cr_spot: "Ox_Cr_spot_unit",
    Cit_Cr_spot: "Cit_Cr_spot_unit",
    CitCr_reported: "CitCr_reported_unit",
    Ca_spot: "Ca_spot_unit",
    U_PO4_spot: "U_PO4_spot_unit",
    S_PO4_spot: "S_PO4_spot_unit",
    Scr_spot: "Scr_spot_unit",
  });

  const NON_NEGATIVE_REQUIRED_FIELDS = new Set([
    "age",
    "ageMonths",
    "ageDays",
    "ktvUF",
    "U_Alb",
    "U_Prot_spot",
    "U_Na_spot",
    "U_K_spot",
    "U_Cl_spot",
    "U_HCO3_spot",
  ]);

  const TIMED_VALUE_FORMULAS = new Set([
    "UA_mgkg",
    "Ca_mgkg",
    "Mg_mgkg",
    "PO4_mgkg",
    "Prot_mgkg",
    "Na_mmol_d",
    "K_mmol_d",
    "Ox_mgkg",
    "Cit_mgkg",
    "pH24",
  ]);

  const CREATININE_VALUE_FORMULAS = new Set([
    "egfr",
    "ckid_u25",
    "egfr_cr_cys",
    "ckid_u25_cys",
    "ckid_u25_cr_cys",
    "neonatal_egfr",
    "cg",
    "cg_norm",
    "cl24",
    "sch_idms",
    "TMP_GFR",
  ]);

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[łŁ]/g, "l")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function compactSearch(value) {
    return normalizeSearch(value).replace(/\s+/g, "");
  }

  function getModuleForFormula(formulaId) {
    return MODULE_BY_FORMULA.get(formulaId) || null;
  }

  function getSharedModuleFieldIds(formulaId) {
    const module = getModuleForFormula(formulaId);
    return module && SHARED_MODULE_FIELD_IDS[module.id]
      ? [...SHARED_MODULE_FIELD_IDS[module.id]]
      : [];
  }

  function interpretationControlState(control, answerValue) {
    if (!control) return { state: "missing" };
    if (String(control.type).toLowerCase() !== "checkbox") {
      return String(control.value == null ? "" : control.value).trim() === ""
        ? { state: "missing" }
        : { state: "ready" };
    }
    const answer =
      answerValue == null
        ? control.checked
          ? "yes"
          : ""
        : String(answerValue);
    if (answer === "yes") return { state: "ready" };
    if (answer === "no") return { state: "negative" };
    return { state: "missing" };
  }

  function activeConfounderLimitations(activeFieldIds, checkedFieldIds) {
    const active = new Set(activeFieldIds || []);
    const checked = new Set(checkedFieldIds || []);
    return Object.entries(ACTIVE_CONFOUNDER_MESSAGES)
      .filter(([fieldId]) => active.has(fieldId) && checked.has(fieldId))
      .map(([fieldId, message]) => ({ fieldId, message }));
  }

  // Nowy, jawny fakt dotyczy WYŁĄCZNIE dwóch standardów dorosłego cr-cys.
  // Migracja starej sesji odczytuje koniunkcję niezależnych faktów. Jawne
  // false ma pierwszeństwo; nie dopowiadamy metody enzymatycznej ani stanu nerek.
  function normalizeCrCysSessionInputs(inputs) {
    const source = inputs && typeof inputs === "object" ? inputs : {};
    const confirmed = Object.prototype.hasOwnProperty.call(source, "CrCysStandardizationConfirmed")
      ? source.CrCysStandardizationConfirmed === true
      : ["enzymatic_idms", "jaffe_idms"].includes(source.ScrAssay) &&
        source.CystatinCStandardization === "ERM-DA471/IFCC";
    return { ...source, CrCysStandardizationConfirmed: confirmed };
  }

  function levelAllows(selectedLevel, moduleLevel) {
    if (selectedLevel === "spot" || moduleLevel === "spot") {
      return selectedLevel === "spot" && moduleLevel === "spot";
    }
    return (
      Object.prototype.hasOwnProperty.call(LEVEL_ORDER, selectedLevel) &&
      Object.prototype.hasOwnProperty.call(LEVEL_ORDER, moduleLevel) &&
      LEVEL_ORDER[moduleLevel] <= LEVEL_ORDER[selectedLevel]
    );
  }

  function getAvailableModules(selectedLevel) {
    return MODULES.filter((module) => levelAllows(selectedLevel, module.level));
  }

  function getFormulaAssignments(formulas) {
    const source = Array.isArray(formulas) ? formulas : [];
    return source.map((formula) => ({
      formulaId: formula.id,
      moduleId: getModuleForFormula(formula.id)?.id || null,
      historical: HISTORICAL_FORMULA_IDS.includes(formula.id),
    }));
  }

  function formulaSearch(query, formulas) {
    const normalized = normalizeSearch(query);
    if (!normalized) return [];
    const tokens = normalized.split(" ").filter((token) => token.length > 1);
    if (!tokens.length) return [];
    const compactQuery = compactSearch(normalized);
    const source = Array.isArray(formulas) ? formulas : [];
    return source
      .filter((formula) => !HISTORICAL_FORMULA_IDS.includes(formula.id))
      .map((formula) => {
        const module = getModuleForFormula(formula.id);
        if (!module) return null;
        const haystack = normalizeSearch(
          [
            formula.id,
            formula.label,
            formula.note,
            module.title,
            module.description,
            module.keywords,
          ].join(" "),
        );
        const compactHaystack = compactSearch(haystack);
        const separatedMatch = tokens.every((token) => haystack.includes(token));
        const compactMatch =
          compactQuery.length > 1 && compactHaystack.includes(compactQuery);
        if (!separatedMatch && !compactMatch) return null;
        const label = normalizeSearch(formula.label);
        const compactLabel = compactSearch(label);
        const score =
          (label.startsWith(normalized) ? 40 : 0) +
          (label.includes(normalized) ? 20 : 0) +
          (compactLabel.startsWith(compactQuery) ? 30 : 0) +
          (compactLabel.includes(compactQuery) ? 15 : 0) +
          tokens.reduce((total, token) => total + (label.includes(token) ? 3 : 1), 0);
        return { formula, module, score };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.formula.label.localeCompare(right.formula.label, "pl"));
  }

  function helpDetailsForField(fieldId, label, control) {
    if (HELP_OVERRIDES[fieldId]) {
      return { text: HELP_OVERRIDES[fieldId], source: "workflow" };
    }
    if (control && control.dataset && control.dataset.info) {
      return { text: control.dataset.info, source: "field" };
    }
    if (
      global.ClcrInfoTexts &&
      typeof global.ClcrInfoTexts === "object" &&
      global.ClcrInfoTexts[fieldId]
    ) {
      return { text: global.ClcrInfoTexts[fieldId], source: "clinical" };
    }
    const readable = String(label || fieldId || "to pole").replace(/:\s*$/, "");
    if (control && String(control.tagName).toLowerCase() === "select") {
      return {
        text: `Wybierz odpowiedź opisującą pole „${readable}”. W razie wątpliwości pozostaw je nieuzupełnione zamiast zgadywać.`,
        source: "generated",
      };
    }
    if (control && String(control.type).toLowerCase() === "checkbox") {
      return {
        text: `Zaznacz tylko wtedy, gdy warunek „${readable}” został świadomie potwierdzony.`,
        source: "generated",
      };
    }
    return {
      text: `Wprowadź wartość dla pola „${readable}” dokładnie zgodnie z wynikiem źródłowym i widoczną jednostką.`,
      source: "generated",
    };
  }

  function helpForField(fieldId, label, control) {
    return helpDetailsForField(fieldId, label, control).text;
  }

  // Correct the stored age fact rather than silently replacing it with zero
  // when the dedicated neonatal path is selected.
  function neonatalAgeConflicts(inputs) {
    const source = inputs || {};
    const days = String(source.ageDays ?? "").trim();
    const dayNumber = Number(days);
    const exactDays = days !== "" && Number.isInteger(dayNumber) && dayNumber >= 0 && dayNumber <= 28;
    return ["age", "ageMonths"].flatMap((fieldId) => {
      const value = String(source[fieldId] ?? "").trim();
      if (value === "" || Number(value) === 0) return [];
      const readable = value.replace(".", ",");
      const ageLabel = fieldId === "age"
        ? Number(value) === 1 ? "1 rok" : `w latach (${readable})`
        : Number(value) === 1 ? "1 miesiąc" : `w miesiącach (${readable})`;
      const comparison = exactDays
        ? `nie zgadza się z wiekiem ${dayNumber} ukończonych dni`
        : "nie odpowiada zakresowi wieku noworodka";
      return [{ fieldId, value, message: `Zapisany wiek ${ageLabel} ${comparison}. Sprawdź dane wieku pacjenta.` }];
    });
  }

  const Model = Object.freeze({
    version: "1.1.0",
    MODULES,
    HISTORICAL_FORMULA_IDS,
    LEVEL_ORDER,
    FORMULA_CONTEXT,
    PARAM_DICTIONARY,
    PARAM_GROUPS,
    getParam,
    getParamByLabel,
    getParamGroups,
    DZM_QUALITY_FIELDS,
    HELP_OVERRIDES,
    SHARED_MODULE_FIELD_IDS,
    ACTIVE_CONFOUNDER_MESSAGES,
    normalizeSearch,
    compactSearch,
    formulaSearch,
    interpretationControlState,
    activeConfounderLimitations,
    normalizeCrCysSessionInputs,
    getAvailableModules,
    getFormulaAssignments,
    getModuleForFormula,
    getSharedModuleFieldIds,
    levelAllows,
    helpForField,
    neonatalAgeConflicts,
  });

  global.ClcrUiModel = Model;

  const documentRef = global.document;
  if (!documentRef || typeof documentRef.addEventListener !== "function") return;

  const state = {
    level: "basic",
    activeFormulaId: "",
    activeFieldIds: new Set(),
    requiredFieldIds: new Set(),
    interpretationFieldIds: new Set(),
    optionalFieldIds: new Set(),
    fieldViews: new Map(),
    fieldPairs: [],
    legacyBroad: false,
    shell: null,
    moduleGrid: null,
    activePanel: null,
    readiness: null,
    completion: null,
    moduleToggle: null,
    mobileModulesExpanded: false,
    dzmQualityGroup: null,
    dzmQualityBulkUpdate: false,
    egfrMarkerContext: null,
    openHelp: null,
    neonatalAgeCorrection: null,
    assayOptions: null,
    measuredLayout: null,
  };

  function formulaById(formulaId) {
    return (Array.isArray(global.FORMULAS) ? global.FORMULAS : []).find(
      (formula) => formula && formula.id === formulaId,
    ) || null;
  }

  function createElement(tagName, className, text) {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function fieldLabelText(label, control) {
    if (!label) return control.getAttribute("aria-label") || control.id;
    const clone = label.cloneNode(true);
    clone
      .querySelectorAll("input, select, textarea, button, .validation-message, .tooltip")
      .forEach((node) => node.remove());
    return clone.textContent
      .replace(/\s+/g, " ")
      .replace(/\s*:\s*$/, "")
      .trim() || control.id;
  }

  // Dymek pomocy pozycjonowany względem OKNA (position:fixed): stała
  // szerokość niezależna od szerokości pola, klamrowanie do krawędzi,
  // odwracanie nad przycisk przy braku miejsca u dołu.
  function positionHelpTooltip(button, panel) {
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, global.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.right - width),
      global.innerWidth - width - 12,
    );
    panel.style.width = `${width}px`;
    panel.classList.remove("clcr-field__help--above");
    const height = panel.getBoundingClientRect().height;
    let top = rect.bottom + 10;
    if (top + height > global.innerHeight - 10 && rect.top - 10 - height > 10) {
      top = rect.top - 10 - height;
      panel.classList.add("clcr-field__help--above");
    }
    // „Szkło" powłoki (backdrop-filter na fieldset) czyni go blokiem
    // zawierającym dla position:fixed — wtedy left/top liczą się względem
    // fieldsetu, nie okna. Przeliczamy współrzędne OKNA na układ tego bloku
    // (offsetParent = blok zawierający; null = okno).
    const containingBlock = panel.offsetParent;
    const cbRect = containingBlock
      ? containingBlock.getBoundingClientRect()
      : { left: 0, top: 0 };
    panel.style.left = `${left - cbRect.left}px`;
    panel.style.top = `${top - cbRect.top}px`;
    const arrowX = Math.max(
      14,
      Math.min(width - 24, rect.left + rect.width / 2 - left - 5),
    );
    panel.style.setProperty("--clcr-arrow-x", `${arrowX}px`);
  }

  function closeAllHelp(exceptPanel) {
    if (state.openHelp && state.openHelp.panel !== exceptPanel) {
      state.openHelp = null;
    }
    state.fieldViews.forEach((view) => {
      if (!view.helpPanel || view.helpPanel === exceptPanel) return;
      view.helpPanel.hidden = true;
      view.infoButton.setAttribute("aria-expanded", "false");
    });
  }

  function decorateField(control) {
    if (!control || !control.id || state.fieldViews.has(control.id)) {
      return state.fieldViews.get(control && control.id);
    }
    let label = control.closest("label");
    if (!label) label = documentRef.querySelector(`label[for="${control.id}"]`);
    if (!label) {
      label = createElement("label");
      control.parentNode.insertBefore(label, control);
      label.appendChild(control);
    }
    const labelText = fieldLabelText(label, control);
    const validation =
      label.querySelector(".validation-message") ||
      control.parentNode.querySelector(".validation-message");
    const preservedControl = control;
    Array.from(label.childNodes).forEach((node) => {
      if (node !== preservedControl && node !== validation) node.remove();
    });

    label.classList.add("clcr-field");
    label.dataset.clcrFieldId = control.id;
    label.removeAttribute("style");

    const heading = createElement("span", "clcr-field__heading");
    const name = createElement(control.id === "CrCysStandardizationConfirmed" ? "strong" : "span", "clcr-field__name", labelText);
    name.id = `clcr-label-${control.id}`;
    const badge = createElement("span", "clcr-field__status", "Opcjonalne");
    const infoButton = createElement("button", "clcr-info-button", "i");
    infoButton.type = "button";
    infoButton.setAttribute("aria-label", `Informacja: ${labelText}`);
    infoButton.setAttribute("aria-expanded", "false");
    const helpDetails = helpDetailsForField(control.id, labelText, control);
    const helpPanel = createElement(
      "span",
      "clcr-field__help",
      helpDetails.text,
    );
    helpPanel.dataset.clcrHelpSource = helpDetails.source;
    helpPanel.id = `clcr-help-${control.id}`;
    helpPanel.hidden = true;
    infoButton.setAttribute("aria-controls", helpPanel.id);
    infoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = helpPanel.hidden;
      closeAllHelp(willOpen ? helpPanel : null);
      helpPanel.hidden = !willOpen;
      infoButton.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        positionHelpTooltip(infoButton, helpPanel);
        state.openHelp = { button: infoButton, panel: helpPanel };
      } else if (state.openHelp && state.openHelp.panel === helpPanel) {
        state.openHelp = null;
      }
    });
    heading.append(name, badge, infoButton);
    label.insertBefore(heading, preservedControl);
    label.appendChild(helpPanel);
    if (validation) {
      validation.classList.add("clcr-field__validation");
      label.appendChild(validation);
    }
    preservedControl.setAttribute("aria-labelledby", name.id);
    preservedControl.removeAttribute("required");

    const isCheckbox = String(preservedControl.type).toLowerCase() === "checkbox";
    if (isCheckbox) label.classList.add("clcr-field--choice");
    if (control.id === "CrCysStandardizationConfirmed") {
      label.classList.add("clcr-assay-confirmation");
      const text = createElement("span");
      const standards = createElement("small", "", "Kreatynina: IDMS · cystatyna C: ERM-DA471/IFCC");
      standards.id = "clcr-cr-cys-standards";
      text.append(name, standards);
      preservedControl.setAttribute("aria-describedby", standards.id);
      heading.hidden = true;
      label.prepend(preservedControl, text);
    }
    if (Object.prototype.hasOwnProperty.call(UNIT_PAIRS, control.id)) {
      label.classList.add("clcr-field--value");
      label.dataset.clcrUnitPair = UNIT_PAIRS[control.id];
    }
    if (Object.values(UNIT_PAIRS).includes(control.id)) {
      label.classList.add("clcr-field--unit");
    }

    const view = {
      control: preservedControl,
      wrapper: label,
      labelText,
      defaultLabelText: labelText,
      badge,
      infoButton,
      helpPanel,
      defaultHelpText: helpDetails.text,
      answerSelect: null,
      originalParent: label.parentNode,
    };
    bindLabelToActiveControl(view);
    state.fieldViews.set(control.id, view);
    return view;
  }

  /* Etykieta pola wskazuje jego AKTYWNĄ kontrolkę (P-KLIRENS-ETYKIETY, 2026-10-01).
   * <label> bez `for` wskazuje pierwszy etykietowalny element w swoim wnętrzu, a nagłówek
   * z przyciskiem „i" stoi przed polem — klik w nazwę otwierał więc pomoc zamiast zaznaczyć
   * pole albo dać mu fokus. Pole wyboru z listą odpowiedzi: etykieta wskazuje listę, więc klik
   * w nazwę daje jej fokus i niczego nie potwierdza — ukryte pole wyboru pod listą nie może
   * się przełączyć kliknięciem w tekst. */
  function bindLabelToActiveControl(view) {
    if (!view || !view.wrapper) return;
    const target = view.answerSelect || view.control;
    if (target && target.id && view.wrapper.htmlFor !== target.id) {
      view.wrapper.htmlFor = target.id;
    }
  }

  function currentProtocolValueVault() {
    return (
      global.__vildaClcrVersionValueVault &&
      typeof global.__vildaClcrVersionValueVault === "object"
        ? global.__vildaClcrVersionValueVault
        : null
    );
  }

  function uagSpecimenConfirmed() {
    const answer = documentRef.getElementById("ui_spotSameSpecimen_answer")?.value;
    // Starsze potwierdzenie obejmowało równoczesną krew ORAZ wspólny mocz.
    // Nowa jawna odpowiedź przecząca lub niepewność ma pierwszeństwo.
    if (["no", "unknown"].includes(answer)) return false;
    return Boolean(documentRef.getElementById("spotSameSpecimen")?.checked ||
      documentRef.getElementById("spotPairedChemistry")?.checked);
  }

  function showLegacyUagConfirmation(view) {
    if (state.activeFormulaId !== "AGu_spot" || view.control.id !== "spotSameSpecimen" ||
        !view.answerSelect || view.answerSelect.value !== "" || view.control.checked) return;
    if (documentRef.getElementById("spotPairedChemistry")?.checked) {
      // To jedynie odczyt wcześniejszej odpowiedzi; nie zmieniamy kanonicznych
      // pól ani ich magazynu podczas odtworzenia formularza.
      view.answerSelect.value = "yes";
    }
  }

  function ensureProtocolAnswer(view) {
    if (!view) return null;
    const control = view.control;
    // To jedno potwierdzenie AND, bez dodatkowej listy odpowiedzi.
    if (["CrCysStandardizationConfirmed", "Cl24CollectionProblem"].includes(control.id)) return null;
    if (String(control.type).toLowerCase() !== "checkbox") return null;
    const vault = currentProtocolValueVault();
    if (view.answerSelect) {
      const answerId = view.answerSelect.id;
      if (
        vault &&
        Object.prototype.hasOwnProperty.call(vault, answerId) &&
        ["", "yes", "no", "unknown"].includes(vault[answerId])
      ) {
        view.answerSelect.value = vault[answerId];
      } else if (
        vault &&
        Object.prototype.hasOwnProperty.call(vault, control.id)
      ) {
        view.answerSelect.value = control.checked ? "yes" : "";
      }
      showLegacyUagConfirmation(view);
      return view.answerSelect;
    }
    const answer = createElement("select", "clcr-protocol-answer");
    answer.id = `ui_${control.id}_answer`;
    answer.setAttribute("aria-label", `${view.labelText}: wybierz odpowiedź`);
    [
      ["", "— wybierz —"],
      ["yes", "Tak — potwierdzam"],
      ["no", "Nie"],
      ["unknown", "Nie wiem"],
    ].forEach(([value, text]) => {
      const option = createElement("option", "", text);
      option.value = value;
      answer.appendChild(option);
    });
    const restoredAnswer = vault && vault[answer.id];
    answer.value = ["", "yes", "no", "unknown"].includes(restoredAnswer)
      ? restoredAnswer
      : control.checked
        ? "yes"
        : "";
    control.classList.add("clcr-canonical-checkbox");
    control.setAttribute("aria-hidden", "true");
    control.tabIndex = -1;
    answer.addEventListener("change", () => {
      if (state.activeFormulaId === "AGu_spot" && control.id === "spotSameSpecimen" && ["no", "unknown"].includes(answer.value)) {
        const pairedView = state.fieldViews.get("spotPairedChemistry");
        const paired = pairedView?.control;
        if (paired) {
          paired.checked = false;
          if (pairedView.answerSelect) pairedView.answerSelect.value = answer.value;
          const currentVault = currentProtocolValueVault();
          if (currentVault) {
            currentVault.spotPairedChemistry = false;
            currentVault.ui_spotPairedChemistry_answer = answer.value;
          }
          paired.dispatchEvent(new Event("input", { bubbles: true }));
          paired.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const shouldCheck = answer.value === "yes";
      if (control.checked !== shouldCheck) {
        control.checked = shouldCheck;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const liveVault = currentProtocolValueVault();
      if (liveVault) {
        liveVault[answer.id] = answer.value;
        liveVault[control.id] = control.checked;
      }
      if (
        DZM_QUALITY_FIELDS.includes(control.id) &&
        !state.dzmQualityBulkUpdate
      ) {
        syncDzmQualityGroupState();
      }
      scheduleReadiness();
    });
    control.addEventListener("change", () => {
      if (control.checked) answer.value = "yes";
      else if (answer.value === "yes") answer.value = "";
      const liveVault = currentProtocolValueVault();
      if (liveVault) {
        liveVault[answer.id] = answer.value;
        liveVault[control.id] = control.checked;
      }
      if (
        DZM_QUALITY_FIELDS.includes(control.id) &&
        !state.dzmQualityBulkUpdate
      ) {
        syncDzmQualityGroupState();
      }
    });
    view.wrapper.insertBefore(answer, view.helpPanel);
    view.answerSelect = answer;
    showLegacyUagConfirmation(view);
    bindLabelToActiveControl(view);
    return answer;
  }

  function dzmQualityAnswerSummary() {
    const answers = DZM_QUALITY_FIELDS.map((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      const answer = view
        ? view.answerSelect || ensureProtocolAnswer(view)
        : null;
      return answer ? answer.value : "";
    });
    const yesCount = answers.filter((answer) => answer === "yes").length;
    const noCount = answers.filter((answer) => answer === "no").length;
    const unknownCount = answers.filter(
      (answer) => answer === "unknown",
    ).length;
    const missingCount =
      DZM_QUALITY_FIELDS.length - yesCount - noCount - unknownCount;
    return {
      answers,
      yesCount,
      noCount,
      unknownCount,
      missingCount,
      complete: yesCount === DZM_QUALITY_FIELDS.length,
    };
  }

  function ensureDzmQualityGroup() {
    if (state.dzmQualityGroup) return state.dzmQualityGroup;
    const firstView = state.fieldViews.get(DZM_QUALITY_FIELDS[0]);
    if (!firstView || !firstView.originalParent) return null;

    const group = createElement("section", "clcr-dzm-quality");
    group.id = DZM_QUALITY_GROUP_FOCUS_ID;
    group.setAttribute("role", "group");
    group.setAttribute(
      "aria-labelledby",
      `${DZM_QUALITY_GROUP_FOCUS_ID}Title`,
    );

    const header = createElement("div", "clcr-dzm-quality__header");
    const title = createElement(
      "h3",
      "clcr-dzm-quality__title",
      "Jakość zbiórki moczu",
    );
    title.id = `${DZM_QUALITY_GROUP_FOCUS_ID}Title`;
    const badge = createElement(
      "span",
      "clcr-field__status",
      "Wymagane potwierdzenie",
    );
    const stateText = createElement(
      "span",
      "clcr-dzm-quality__state",
      "0/6 potwierdzono",
    );
    stateText.setAttribute("aria-live", "polite");
    header.append(title, badge, stateText);

    const description = createElement(
      "p",
      "clcr-dzm-quality__description",
      "Potwierdź jednym kliknięciem, jeśli początek i koniec, kompletność porcji bez rozlania, czas zbiórki i przechowywanie były prawidłowe. Jeśli nie lub nie wiesz — otwórz szczegóły.",
    );
    description.id = `${DZM_QUALITY_GROUP_FOCUS_ID}Description`;
    stateText.id = `${DZM_QUALITY_GROUP_FOCUS_ID}State`;
    group.setAttribute(
      "aria-describedby",
      `${description.id} ${stateText.id}`,
    );

    const confirmAll = createElement(
      "button",
      "clcr-dzm-quality__confirm",
      "Tak — wszystkie warunki spełniono",
    );
    confirmAll.type = "button";
    confirmAll.setAttribute(
      "aria-describedby",
      `${description.id} ${stateText.id}`,
    );

    const details = createElement("details", "clcr-dzm-quality__details");
    details.setAttribute("aria-describedby", description.id);
    const summary = createElement(
      "summary",
      "clcr-dzm-quality__summary",
      "Sprawdź szczegóły / zgłoś problem",
    );
    const fields = createElement("div", "clcr-dzm-quality__fields");
    details.append(summary, fields);
    group.append(header, description, confirmAll, details);

    confirmAll.addEventListener("click", () => {
      const currentSummary = dzmQualityAnswerSummary();
      if (currentSummary.noCount || currentSummary.unknownCount) {
        details.open = true;
        const firstUnconfirmedId = DZM_QUALITY_FIELDS.find((fieldId) => {
          const view = state.fieldViews.get(fieldId);
          return (
            view &&
            view.answerSelect &&
            ["no", "unknown"].includes(view.answerSelect.value)
          );
        });
        if (firstUnconfirmedId) focusField(firstUnconfirmedId);
        return;
      }
      state.dzmQualityBulkUpdate = true;
      DZM_QUALITY_FIELDS.forEach((fieldId) => {
        const view = state.fieldViews.get(fieldId);
        const answer = view
          ? view.answerSelect || ensureProtocolAnswer(view)
          : null;
        if (!answer || answer.value === "yes") return;
        answer.value = "yes";
        answer.dispatchEvent(new Event("change", { bubbles: true }));
      });
      state.dzmQualityBulkUpdate = false;
      details.open = false;
      syncDzmQualityGroupState();
      scheduleReadiness();
    });

    firstView.originalParent.insertBefore(group, firstView.wrapper);
    state.dzmQualityGroup = {
      group,
      header,
      title,
      badge,
      stateText,
      description,
      confirmAll,
      details,
      fields,
    };
    return state.dzmQualityGroup;
  }

  function syncDzmQualityGroupState() {
    const qualityGroup = state.dzmQualityGroup;
    if (!qualityGroup || qualityGroup.group.hidden) return;
    const summary = dzmQualityAnswerSummary();
    qualityGroup.group.dataset.clcrQualityState = summary.complete
      ? "confirmed"
      : summary.noCount
        ? "failed"
        : summary.unknownCount
          ? "unknown"
          : "incomplete";

    if (summary.complete) {
      qualityGroup.stateText.textContent = "6/6 potwierdzono";
      qualityGroup.confirmAll.textContent =
        "Tak — wszystkie warunki spełniono";
    } else if (summary.noCount || summary.unknownCount) {
      const stateParts = [];
      if (summary.yesCount) stateParts.push(`${summary.yesCount} Tak`);
      if (summary.noCount) stateParts.push(`${summary.noCount} Nie`);
      if (summary.unknownCount) {
        stateParts.push(`${summary.unknownCount} Nie wiem`);
      }
      if (summary.missingCount) {
        stateParts.push(`${summary.missingCount} bez odpowiedzi`);
      }
      qualityGroup.stateText.textContent = stateParts.join(" · ");
      qualityGroup.confirmAll.textContent =
        "Przejdź do odpowiedzi wymagającej zmiany";
      qualityGroup.details.open = true;
    } else {
      qualityGroup.stateText.textContent = `${summary.yesCount}/6 potwierdzono`;
      qualityGroup.confirmAll.textContent =
        "Tak — wszystkie warunki spełniono";
    }
  }

  function restoreDzmQualityFields() {
    const qualityGroup = state.dzmQualityGroup;
    if (!qualityGroup) return;
    DZM_QUALITY_FIELDS.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view || !view.originalParent) return;
      if (view.wrapper.parentNode === qualityGroup.fields) {
        view.originalParent.insertBefore(view.wrapper, qualityGroup.group);
      }
    });
    qualityGroup.group.hidden = true;
  }

  function syncDzmQualityGroup() {
    const activeQualityFields = DZM_QUALITY_FIELDS.filter((fieldId) =>
      state.activeFieldIds.has(fieldId),
    );
    if (!activeQualityFields.length) {
      if (state.dzmQualityGroup) state.dzmQualityGroup.group.hidden = true;
      return;
    }
    const qualityGroup = ensureDzmQualityGroup();
    if (!qualityGroup) return;
    const firstView = state.fieldViews.get(DZM_QUALITY_FIELDS[0]);
    if (
      firstView &&
      firstView.originalParent &&
      firstView.wrapper.parentNode === firstView.originalParent
    ) {
      firstView.originalParent.insertBefore(qualityGroup.group, firstView.wrapper);
    }
    DZM_QUALITY_FIELDS.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view) return;
      qualityGroup.fields.appendChild(view.wrapper);
    });
    const required = activeQualityFields.some((fieldId) =>
      state.requiredFieldIds.has(fieldId),
    );
    qualityGroup.group.hidden = false;
    qualityGroup.group.dataset.clcrStatus = required
      ? "required"
      : "interpretation";
    qualityGroup.badge.className = `clcr-field__status clcr-field__status--${
      required ? "required" : "interpretation"
    }`;
    qualityGroup.badge.textContent = required
      ? "Wymagane potwierdzenie"
      : "Dodatkowy kontekst";
    syncDzmQualityGroupState();
  }

  function setFieldStatus(view, status) {
    if (!view) return;
    view.wrapper.dataset.clcrStatus = status;
    view.badge.className = `clcr-field__status clcr-field__status--${status}`;
    if (status === "required") {
      view.badge.textContent =
        String(view.control.type).toLowerCase() === "checkbox"
          ? "Wymagane potwierdzenie"
          : "* Wymagane";
      view.control.setAttribute("aria-required", "true");
      if (String(view.control.type).toLowerCase() === "checkbox") {
        const answer = ensureProtocolAnswer(view);
        if (answer) answer.setAttribute("aria-required", "true");
      }
    } else if (status === "interpretation") {
      view.badge.textContent = "Dodatkowy kontekst";
      view.control.removeAttribute("aria-required");
      if (String(view.control.type).toLowerCase() === "checkbox") {
        const answer = ensureProtocolAnswer(view);
        if (answer) answer.removeAttribute("aria-required");
      } else if (view.answerSelect) {
        view.answerSelect.removeAttribute("aria-required");
      }
    } else {
      view.badge.textContent = "Opcjonalne";
      view.control.removeAttribute("aria-required");
      if (view.answerSelect) view.answerSelect.removeAttribute("aria-required");
    }
  }

  function sectionHasVisibleFields(section) {
    return Boolean(
      section &&
      Array.from(section.querySelectorAll(".clcr-field")).some(
        (field) => !field.hidden,
      ),
    );
  }

  function syncFieldsetVisibility() {
    ["patientSet", "serumSet", "spotSet", "spotSetRight", "dzmSet", "ktvFields"].forEach(
      (id) => {
        const section = documentRef.getElementById(id);
        if (section) section.style.display = sectionHasVisibleFields(section) ? "" : "none";
      },
    );
    const patientCard = documentRef.querySelector(".patient-card");
    const patientSet = documentRef.getElementById("patientSet");
    if (patientCard) {
      patientCard.style.display = sectionHasVisibleFields(patientSet) ? "" : "none";
    }
    const paramRow = documentRef.querySelector("#clcrForm > .param-row");
    let visibleColumnCount = 0;
    if (paramRow) {
      Array.from(paramRow.children)
        .filter((child) => child.classList?.contains("param-col"))
        .forEach((column) => {
          const fieldsets = Array.from(column.children).filter(
            (child) => String(child.tagName).toLowerCase() === "fieldset",
          );
          const visible = fieldsets.some((fieldset) =>
            sectionHasVisibleFields(fieldset),
          );
          column.hidden = !visible;
          if (visible) visibleColumnCount += 1;
        });
      paramRow.dataset.clcrVisibleColumns = String(visibleColumnCount);
      paramRow.hidden = visibleColumnCount === 0;
      paramRow.style.display = visibleColumnCount ? "" : "none";
    }
    const ktvCard = documentRef.getElementById("ktvCard");
    if (ktvCard) {
      ktvCard.style.display =
        state.activeFormulaId === "KTV" || (state.legacyBroad && state.level === "pro")
          ? ""
          : "none";
    }
    const clearContainer = documentRef.getElementById("clearContainer");
    if (clearContainer) {
      clearContainer.style.display = state.activeFieldIds.size || state.legacyBroad ? "" : "none";
    }
  }

  function groupUnitPairs() {
    state.fieldPairs = [];
    Object.entries(UNIT_PAIRS).forEach(([valueId, unitId]) => {
      const valueView = state.fieldViews.get(valueId);
      const unitView = state.fieldViews.get(unitId);
      if (!valueView || !unitView) return;
      const parent = valueView.wrapper.parentNode;
      if (!parent || unitView.wrapper.parentNode !== parent) return;
      const pair = createElement("div", "clcr-field-pair");
      pair.dataset.clcrValueField = valueId;
      pair.dataset.clcrUnitField = unitId;
      parent.insertBefore(pair, valueView.wrapper);
      pair.append(valueView.wrapper, unitView.wrapper);
      state.fieldPairs.push(pair);
    });
  }

  function syncFieldPairs() {
    state.fieldPairs.forEach((pair) => {
      pair.hidden = !Array.from(pair.children).some(
        (field) => field.classList.contains("clcr-field") && !field.hidden,
      );
    });
  }

  function currentNeonatalAgeConflicts() {
    if (state.legacyBroad || state.activeFormulaId !== "neonatal_egfr") return [];
    return neonatalAgeConflicts({
      age: fieldValue("age"),
      ageMonths: fieldValue("ageMonths"),
      ageDays: fieldValue("ageDays"),
    });
  }

  function restoreNeonatalAgeField(view) {
    if (!view?.neonatalCorrectionAnchor) return;
    const anchor = view.neonatalCorrectionAnchor;
    if (anchor.parentNode) anchor.parentNode.insertBefore(view.wrapper, anchor.nextSibling);
    anchor.remove();
    view.neonatalCorrectionAnchor = null;
    if (view.neonatalPreviousAriaInvalid === null) view.control.removeAttribute("aria-invalid");
    else view.control.setAttribute("aria-invalid", view.neonatalPreviousAriaInvalid);
    delete view.wrapper.dataset.clcrAgeConflict;
  }

  function restoreNeonatalAgeCorrection() {
    ["age", "ageMonths"].forEach((id) => restoreNeonatalAgeField(state.fieldViews.get(id)));
    if (state.neonatalAgeCorrection) state.neonatalAgeCorrection.section.hidden = true;
  }

  function syncNeonatalAgeCorrection() {
    const conflicts = currentNeonatalAgeConflicts();
    const fieldIds = new Set(conflicts.map((entry) => entry.fieldId));
    // Keep an ongoing correction editable through Ctrl+A/Backspace/type.
    // A compatible value disappears only after the clinician leaves the field.
    const editingId = documentRef.activeElement?.id;
    if (!state.legacyBroad && state.activeFormulaId === "neonatal_egfr" &&
      ["age", "ageMonths"].includes(editingId) && state.fieldViews.get(editingId)?.neonatalCorrectionAnchor) {
      fieldIds.add(editingId);
    }
    ["age", "ageMonths"].forEach((id) => {
      const view = state.fieldViews.get(id);
      if (!view?.neonatalCorrectionAnchor || fieldIds.has(id)) return;
      restoreNeonatalAgeField(view);
      view.wrapper.hidden = !state.activeFieldIds.has(id);
    });
    if (!fieldIds.size) {
      if (state.neonatalAgeCorrection) state.neonatalAgeCorrection.section.hidden = true;
      return;
    }
    const patientSet = documentRef.getElementById("patientSet");
    if (!patientSet) return;
    if (!state.neonatalAgeCorrection) {
      const section = createElement("section", "clcr-neonatal-age-correction");
      section.id = "clcrNeonatalAgeCorrection";
      section.setAttribute("role", "group");
      section.setAttribute("aria-labelledby", "clcrNeonatalAgeCorrectionTitle");
      const heading = createElement("h3", "", "Sprawdź wiek pacjenta");
      heading.id = "clcrNeonatalAgeCorrectionTitle";
      const messages = createElement("div", "clcr-neonatal-age-correction__messages");
      const fields = createElement("div", "clcr-neonatal-age-correction__fields");
      section.append(heading, messages, fields);
      patientSet.appendChild(section);
      state.neonatalAgeCorrection = { section, messages, fields };
    }
    const correction = state.neonatalAgeCorrection;
    correction.section.hidden = false;
    correction.messages.replaceChildren();
    conflicts.forEach((entry) => {
      correction.messages.appendChild(createElement("p", "", entry.message));
    });
    fieldIds.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view) return;
      if (!view.neonatalCorrectionAnchor) {
        view.neonatalCorrectionAnchor = documentRef.createComment(`clcr-neonatal-correction-${fieldId}`);
        view.wrapper.parentNode.insertBefore(view.neonatalCorrectionAnchor, view.wrapper);
        view.neonatalPreviousAriaInvalid = view.control.getAttribute("aria-invalid");
      }
      if (view.wrapper.parentNode !== correction.fields) correction.fields.appendChild(view.wrapper);
      view.wrapper.hidden = false;
      const invalid = conflicts.some((entry) => entry.fieldId === fieldId);
      view.wrapper.dataset.clcrAgeConflict = String(invalid);
      view.control.setAttribute("aria-invalid", String(invalid));
    });
  }

  function syncAssayOptions() {
    const select = documentRef.getElementById("ScrAssay");
    if (!select) return;
    if (!state.assayOptions) {
      state.assayOptions = Array.from(select.options || [], (option) => ({ option, text: option.textContent, hidden: option.hidden }));
    }
    const neonatal = !state.legacyBroad && state.activeFormulaId === "neonatal_egfr";
    const labels = {
      "": "Nie podano / nie wiem",
      enzymatic_idms: "Enzymatyczna (IDMS)",
      jaffe_idms: "Jaffego (IDMS)",
      non_idms: "Bez standaryzacji IDMS",
      not_idms: "Zapis historyczny: metoda lub IDMS nieustalone",
    };
    state.assayOptions.forEach(({ option, text, hidden }) => {
      option.textContent = neonatal && Object.prototype.hasOwnProperty.call(labels, option.value) ? labels[option.value] : text;
      option.hidden = neonatal
        ? ["not_idms", "enzymatic_non_idms", "jaffe_non_idms"].includes(option.value)
          ? option.value !== select.value
          : false
        : hidden;
    });
  }

  function restoreCollapsibleContextFields() {
    state.fieldViews.forEach((view) => {
      if (!view.wrapper.closest(".clcr-context-details")) return;
      if (view.contextAnchor?.parentNode) {
        view.contextAnchor.parentNode.insertBefore(view.wrapper, view.contextAnchor.nextSibling);
      } else if (view.originalParent) view.originalParent.appendChild(view.wrapper);
    });
    documentRef.querySelectorAll(".clcr-context-details").forEach((details) => {
      details.hidden = true;
    });
  }

  function groupCollapsibleContextFields() {
    if (["cl24", "ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(state.activeFormulaId) && !state.legacyBroad) return;
    const groups = new Map();
    const sharedFieldset = ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(state.activeFormulaId)
      ? documentRef.getElementById("serumSet") : null;
    function appendToDetails(wrapper, fieldset) {
      if (!fieldset || !wrapper || wrapper.hidden) return;
      let group = groups.get(fieldset);
      if (!group) {
        let details = fieldset.querySelector(":scope > .clcr-context-details");
        if (!details) {
          details = createElement("details", "clcr-context-details");
          const summary = createElement("summary", "clcr-context-details__summary", "Dodatkowe dane i kontekst (opcjonalne)");
          const body = createElement("div", "clcr-context-details__body");
          details.append(summary, body);
          fieldset.appendChild(details);
        }
        details.hidden = false;
        details.querySelector("summary").textContent = state.activeFormulaId === "neonatal_egfr"
          ? "Metoda oznaczenia (jeśli znana)"
          : ["ckid_u25_cys", "ckid_u25_cr_cys"].includes(state.activeFormulaId)
            ? "Dokładniejszy wiek (opcjonalnie)"
            : "Dodatkowe dane i kontekst (opcjonalne)";
        group = { details, body: details.querySelector(".clcr-context-details__body") };
        groups.set(fieldset, group);
      }
      group.body.appendChild(wrapper);
    }
    state.optionalFieldIds.forEach((fieldId) => {
      const view = state.fieldViews.get(fieldId);
      if (!view || view.wrapper.hidden) return;
      if (!view.contextAnchor) {
        view.contextAnchor = documentRef.createComment(`clcr-context-${fieldId}`);
        view.wrapper.parentNode.insertBefore(view.contextAnchor, view.wrapper);
      }
      appendToDetails(view.wrapper, sharedFieldset || view.originalParent?.closest("fieldset"));
    });
  }

  function getContext(formulaId) {
    return FORMULA_CONTEXT[formulaId] || { interpretation: [], optional: [] };
  }

  const MEASURED_CONTEXT_FIELDS = ["age", "sex", "weight", "height"];
  const MEASURED_PROTOCOL_FIELDS = DZM_QUALITY_FIELDS;

  function measuredProblemAnswers() {
    const vault = currentProtocolValueVault();
    return MEASURED_PROTOCOL_FIELDS.filter((id) => {
      const answerId = `ui_${id}_answer`;
      const answer = documentRef.getElementById(answerId);
      return answer?.value === "no" || (!answer && vault?.[answerId] === "no");
    });
  }

  function clearMeasuredProblemAnswers() {
    const vault = currentProtocolValueVault();
    // Called in the input capture phase, before the legacy input handler can
    // refresh the view and reapply an older negative protocol answer.
    measuredProblemAnswers().forEach((id) => {
      const answerId = `ui_${id}_answer`;
      const answer = documentRef.getElementById(answerId);
      if (answer) answer.value = "";
      const canonical = documentRef.getElementById(id);
      if (canonical) canonical.checked = false;
      if (vault) { vault[answerId] = ""; vault[id] = false; }
    });
    if (vault) vault.Cl24CollectionProblem = false;
  }

  function restoreMeasuredFields() {
    const layout = state.measuredLayout;
    if (!layout) return;
    layout.moves.forEach(({ element, anchor }) => {
      if (anchor.parentNode) anchor.parentNode.insertBefore(element, anchor.nextSibling);
      anchor.remove();
    });
    layout.moves.clear();
    layout.card.hidden = true;
    layout.referenceDetails.open = false;
    layout.editingFields.clear();
    layout.contextEdit = false;
  }

  function measuredMissingContextFields() {
    const age = fieldNumber("age");
    const ageKnown = age !== null && age >= 0;
    if (ageKnown && (age < 3 || age >= 120)) return [];
    const fields = [];
    if (!ageKnown) fields.push("age");
    if (ageKnown && age >= 19 && !["M", "F"].includes(fieldValue("sex"))) fields.push("sex");
    if (!(fieldNumber("weight") > 0)) fields.push("weight");
    if (!(fieldNumber("height") > 0)) fields.push("height");
    return fields;
  }

  function syncMeasuredContext() {
    const layout = state.measuredLayout;
    if (!layout || state.activeFormulaId !== "cl24" || state.legacyBroad) return;
    const missing = measuredMissingContextFields();
    if (!layout.referenceDetails.open) {
      layout.editingFields = new Set(missing);
      layout.contextEdit = false;
    } else if (!layout.contextEdit) {
      missing.forEach((id) => layout.editingFields.add(id));
      const age = fieldNumber("age");
      if (age !== null && age >= 3 && age < 19) layout.editingFields.delete("sex");
    }
    // Keep a field visible throughout editing. Removing it after the first
    // digit would interrupt input and make keyboard correction impossible.
    MEASURED_CONTEXT_FIELDS.forEach((id) => {
      const view = state.fieldViews.get(id);
      if (view) view.wrapper.hidden = !layout.editingFields.has(id);
    });
    layout.referenceDetails.hidden = !missing.length && !layout.referenceDetails.open;
    const context = documentRef.getElementById("cl24PatientContext");
    if (context) {
      const parts = [];
      if (fieldNumber("age") !== null) parts.push(`${fieldValue("age")} lat`);
      if (["M", "F"].includes(fieldValue("sex"))) parts.push(fieldValue("sex") === "M" ? "mężczyzna" : "kobieta");
      if (fieldNumber("weight") > 0) parts.push(`${fieldValue("weight")} kg`);
      if (fieldNumber("height") > 0) parts.push(`${fieldValue("height")} cm`);
      context.textContent = parts.length ? `Dane pacjenta: ${parts.join(" · ")}` : "";
      context.hidden = !parts.length;
      const edit = documentRef.getElementById("cl24EditPatientContext");
      if (edit) edit.hidden = !parts.length;
    }
  }

  function openMeasuredReferenceFields(fieldIds, options) {
    if (state.activeFormulaId !== "cl24" || state.legacyBroad) return false;
    syncMeasuredFields();
    const layout = state.measuredLayout;
    if (!layout) return false;
    const requested = Array.isArray(fieldIds) ? fieldIds : measuredMissingContextFields();
    layout.editingFields = new Set(requested.filter((id) => MEASURED_CONTEXT_FIELDS.includes(id)));
    layout.contextEdit = options?.editAll === true;
    if (!layout.editingFields.size) return false;
    layout.referenceDetails.hidden = false;
    layout.referenceDetails.open = true;
    syncMeasuredContext();
    focusField([...layout.editingFields][0]);
    global.ClcrLayout?.refresh?.();
    return true;
  }

  function syncMeasuredFields() {
    if (state.activeFormulaId !== "cl24" || state.legacyBroad) return;
    let layout = state.measuredLayout;
    if (!layout) {
      const form = documentRef.getElementById("clcrForm");
      if (!form) return;
      const card = createElement("section", "clcr-measured-input-card");
      card.id = "cl24InputCard";
      const fields = createElement("fieldset", "clcr-measured-fields");
      fields.id = "cl24MinimalFields";
      fields.appendChild(createElement("legend", "", "Dane do obliczenia"));
      const grid = createElement("div", "clcr-measured-grid");
      fields.appendChild(grid);
      const assumption = createElement("p", "clcr-measured-assumption");
      const problemDetails = createElement("details", "clcr-measured-problem");
      problemDetails.id = "cl24CollectionProblemDetails";
      problemDetails.appendChild(createElement("summary", "", "Problem ze zbiórką"));
      const problemBody = createElement("div", "clcr-measured-problem-body");
      problemDetails.append(problemBody, createElement("p", "", "Dotyczy np. pominiętej porcji moczu, rozlania albo błędnego czasu zbiórki."));
      const referenceDetails = createElement("details", "clcr-measured-context");
      referenceDetails.id = "cl24ReferenceFieldsDetails";
      referenceDetails.appendChild(createElement("summary", "", "Dane pacjenta do normy (opcjonalnie)"));
      referenceDetails.appendChild(createElement("p", "clcr-measured-assumption", "Dodatkowe dane służą dobraniu normy. Wynik w mL/min ich nie wymaga."));
      const referenceBody = createElement("div", "clcr-measured-context-body");
      referenceDetails.appendChild(referenceBody);
      card.append(fields, assumption, problemDetails, referenceDetails);
      form.insertBefore(card, documentRef.getElementById("clearContainer"));
      layout = state.measuredLayout = { card, fields, grid, assumption, problemDetails, problemBody, referenceDetails, referenceBody, moves: new Map(), editingFields: new Set(), contextEdit: false };
      referenceDetails.addEventListener("toggle", () => {
        if (!referenceDetails.open) syncMeasuredContext();
        global.ClcrLayout?.refresh?.();
      });
      const durationView = state.fieldViews.get("Cl24DurationHours");
      if (durationView) {
        const row = createElement("div", "clcr-measured-duration-row");
        durationView.control.before(row);
        const shortcut = createElement("button", "clcr-measured-shortcut", "24 h");
        shortcut.id = "cl24DurationShortcut";
        shortcut.type = "button";
        shortcut.setAttribute("aria-label", "Ustaw czas zbiórki na 24 godziny");
        row.append(durationView.control, shortcut);
        shortcut.addEventListener("click", () => {
          durationView.control.value = "24";
          durationView.control.dispatchEvent(new Event("input", { bubbles: true }));
          durationView.control.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      const problem = state.fieldViews.get("Cl24CollectionProblem")?.control;
      problem?.addEventListener("change", () => {
        if (!problem.checked) {
          // This is an explicit correction of the reported problem. Preserve
          // all unrelated answers and do not manufacture six confirmations.
          clearMeasuredProblemAnswers();
        }
        syncMeasuredProblem();
      });
    }
    layout.card.hidden = false;
    const move = (element, target) => {
      if (!element || !target) return;
      if (!layout.moves.has(element)) {
        const anchor = documentRef.createComment("cl24-field-origin");
        element.before(anchor);
        layout.moves.set(element, { element, anchor });
      }
      if (element.parentNode !== target) target.appendChild(element);
    };
    const scr = state.fieldViews.get("Scr");
    move(scr?.wrapper.closest(".clcr-field-pair") || scr?.wrapper, layout.grid);
    ["Ucr", "V24", "Cl24DurationHours"].forEach((id) => move(state.fieldViews.get(id)?.wrapper, layout.grid));
    move(state.fieldViews.get("Cl24CollectionProblem")?.wrapper, layout.problemBody);
    MEASURED_CONTEXT_FIELDS.forEach((id) => move(state.fieldViews.get(id)?.wrapper, layout.referenceBody));
    syncMeasuredProblem();
    syncMeasuredContext();
  }

  function syncMeasuredProblem() {
    const layout = state.measuredLayout;
    const control = state.fieldViews.get("Cl24CollectionProblem")?.control;
    if (!layout || !control || state.activeFormulaId !== "cl24") return;
    if (measuredProblemAnswers().length) control.checked = true;
    layout.assumption.textContent = control.checked
      ? "Zgłoszony problem ze zbiórką wymaga wyjaśnienia przed oceną wyniku."
      : "Zakładamy pełną, prawidłową zbiórkę i stabilną czynność nerek bez podejrzenia AKI.";
    if (control.checked) layout.problemDetails.open = true;
  }

  function renderCompactCgLabels() {
    const compact = !state.legacyBroad && Boolean(state.activeFormulaId);
    const neonatal = compact && state.activeFormulaId === "neonatal_egfr";
    const cgIndexed = compact && state.activeFormulaId === "cg_norm";
    const measured = compact && state.activeFormulaId === "cl24";
    const labels = {
      weight: "Aktualna masa ciała (kg)",
      Scr: measured ? "Kreatynina w surowicy" : "Kreatynina",
      ScrUnit: "Jednostka",
      ageDays: "Wiek (ukończone dni życia)",
      neonatalTermStatus: "Urodzenie o czasie",
      height: "Długość ciała (cm)",
      ScrAssay: "Metoda oznaczenia kreatyniny",
      age: cgIndexed ? "Wiek (ukończone lata)" : "Zapisany wiek (lata)",
      ageMonths: "Zapisany wiek (miesiące)",
      Ucr: "Kreatynina w moczu (mg/dL)",
      V24: "Objętość zebranego moczu (mL)",
      Cl24DurationHours: "Rzeczywisty czas zbiórki (h)",
    };
    Object.entries(labels).forEach(([fieldId, label]) => {
      const view = state.fieldViews.get(fieldId);
      if (!view) return;
      const useCompact = ["Ucr", "V24", "Cl24DurationHours"].includes(fieldId) ? measured
        : ["Scr", "ScrUnit"].includes(fieldId) ? compact
        : fieldId === "weight" ? neonatal || compact && ["cg", "cg_norm"].includes(state.activeFormulaId)
          : fieldId === "age" ? neonatal || cgIndexed
          : neonatal;
      view.labelText = useCompact ? label : view.defaultLabelText;
      view.wrapper.querySelector(".clcr-field__name").textContent = view.labelText;
      view.infoButton.setAttribute("aria-label", `Informacja: ${view.labelText}`);
      if (fieldId === "age") {
        view.helpPanel.textContent = cgIndexed
          ? "W tym wariancie używamy ukończonych lat, bez dodatkowych miesięcy."
          : view.defaultHelpText;
      }
    });
    const height = state.fieldViews.get("height");
    if (height) {
      if (!height.cgIndexedNote) {
        height.cgIndexedNote = createElement("span", "clcr-field__note", "Do przeliczenia wyniku na 1,73 m².");
        height.cgIndexedNote.id = "clcr-cg-indexed-height-note";
        height.wrapper.appendChild(height.cgIndexedNote);
      }
      height.cgIndexedNote.hidden = !cgIndexed;
      const descriptions = new Set((height.control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      if (cgIndexed) descriptions.add(height.cgIndexedNote.id);
      else descriptions.delete(height.cgIndexedNote.id);
      if (descriptions.size) height.control.setAttribute("aria-describedby", [...descriptions].join(" "));
      else height.control.removeAttribute("aria-describedby");
    }
  }

  const FORMULA_REFERENCE_FIELDS = Object.freeze({
      cl24: ["age", "sex", "weight", "height", "Cl24CollectionProblem"],
      UA_mgkg: ["age", "sex"], Ca_mgkg: ["age", "ageMonths"],
      Mg_mgkg: ["age", "ageMonths"], PO4_mgkg: ["age", "ageMonths"],
      pH24: ["age", "ageMonths"], Prot_mgkg: ["age", "ageMonths", "weight", "height"],
      Ox_mgkg: ["age", "ageMonths", "sex"], Cit_mgkg: ["age", "ageMonths", "sex"],
      ACR: ["age", "ageMonths"], PCR: ["age", "ageMonths"],
      CaCr_spot: ["age", "ageMonths"], OxCr_spot: ["age", "ageMonths"], CitCr_spot: ["age", "ageMonths"],
  });

  function activeSetsForFormula(formula) {
    const required = new Set(Array.isArray(formula?.requires) ? formula.requires : []);
    const context = getContext(formula.id);
    const optional = new Set([...(context.interpretation || []), ...(context.optional || [])]);
    if (["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "TMP_GFR"].includes(formula.id)) optional.delete("sex");
    // Katalog określa składniki obliczenia i twarde warunki metody. Kontekst
    // odniesienia pozostaje dobrowolny i nie tworzy drugiego poziomu wyniku.
    (FORMULA_REFERENCE_FIELDS[formula.id] || []).forEach((fieldId) => optional.add(fieldId));
    if (required.has("age") && !["neonatal_egfr", "cg_norm"].includes(formula.id)) optional.add("ageMonths");
    if (!["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot"].includes(formula.id)) getSharedModuleFieldIds(formula.id).forEach((fieldId) => optional.add(fieldId));
    if (["FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formula.id)) {
      required.delete("spotPairedChemistry");
      optional.clear();
    }
    if (formula.id === "ACR") {
      optional.add("ACR_same_specimen");
      if (fieldValue("ACR_entry_mode") === "direct") {
        ["U_Alb", "U_Alb_unit", "Ucr_spot", "Ucr_spot_unit"].forEach((id) => required.delete(id));
        required.add("ACR_reported");
        required.add("ACR_reported_unit");
      }
    }
    if (formula.id === "PCR") {
      required.delete("spotSameSpecimen");
      optional.delete("spotSameSpecimen");
      optional.add("PCR_same_specimen");
      if (fieldValue("PCR_entry_mode") === "direct") {
        ["U_Prot_spot", "U_Prot_spot_unit", "Ucr_spot", "Ucr_spot_unit"].forEach((id) => required.delete(id));
        required.add("PCR_reported");
        required.add("PCR_reported_unit");
      }
    } else {
      ["PCR_reported", "PCR_reported_unit", "PCR_same_specimen", "U_Prot_spot_unit"].forEach((id) => {
        required.delete(id);
        optional.delete(id);
      });
    }
    if (formula.id === "CaCr_spot") {
      required.delete("spotSameSpecimen");
      optional.delete("spotSameSpecimen");
      optional.add("CaCr_same_specimen");
      if (fieldValue("CaCr_entry_mode") === "direct") {
        ["Ca_spot", "Ca_spot_unit", "Ucr_spot", "Ucr_spot_unit"].forEach(id => required.delete(id));
        required.add("CaCr_reported");
        required.add("CaCr_reported_unit");
      }
    } else {
      ["CaCr_reported", "CaCr_reported_unit", "CaCr_same_specimen"].forEach(id => {
        required.delete(id);
        optional.delete(id);
      });
    }
    if (formula.id === "OxCr_spot") {
      required.delete("spotSameSpecimen"); optional.delete("spotSameSpecimen");
      required.delete("oxalateSpotReportingEntity"); optional.delete("oxalateSpotReportingEntity");
      optional.add("OxCr_same_specimen");
      if (fieldValue("OxCr_entry_mode") === "direct") {
        ["Ox_Cr_spot", "Ox_Cr_spot_unit", "Ucr_spot", "Ucr_spot_unit"].forEach(id => required.delete(id));
        required.add("OxCr_reported"); required.add("OxCr_reported_unit");
      }
    } else {
      ["OxCr_reported", "OxCr_reported_unit", "OxCr_same_specimen", "Ox_Cr_spot_unit"].forEach(id => {
        required.delete(id); optional.delete(id);
      });
    }
    if (formula.id === "CitCr_spot") {
      required.delete("spotSameSpecimen"); optional.delete("spotSameSpecimen");
      optional.add("CitCr_same_specimen");
      optional.add("citrateSpotReportingEntity");
      optional.add("CitCr_reported_basis");
      if (fieldNumber("age") !== null && fieldNumber("age") >= 18) optional.add("sex");
      if (fieldValue("CitCr_entry_mode") === "direct") {
        ["Cit_Cr_spot", "Cit_Cr_spot_unit", "Ucr_spot", "Ucr_spot_unit"].forEach(id => required.delete(id));
        required.add("CitCr_reported"); required.add("CitCr_reported_unit");
      }
    } else {
      ["CitCr_reported", "CitCr_reported_unit", "CitCr_reported_basis", "CitCr_same_specimen", "Cit_Cr_spot_unit", "citrateSpotReportingEntity"].forEach(id => {
        required.delete(id); optional.delete(id);
      });
    }
    // The indexed CG variant uses completed years. Keep the canonical month
    // value for other formulas, but do not ask for it or let it qualify this one.
    if (formula.id === "cg_norm") optional.delete("ageMonths");
    if (formula.id === "egfr_cr_cys") {
      ["height", "weight", "CystatinCAssayMethod", "ScrAssay", "CystatinCStandardization"].forEach((fieldId) => optional.delete(fieldId));
    }
    if (["ckid_u25_cys", "ckid_u25_cr_cys"].includes(formula.id)) {
      // Średnia zachowuje wzrost w wymaganych danych składowej kreatyninowej.
      ["height", "weight"].forEach((fieldId) => optional.delete(fieldId));
    }
    // Te kontrolki pozostają źródłem zapisanych faktów, lecz założenia
    // obliczenia nie wymagają kolejnych odpowiedzi ani ich potwierdzania.
    ["creatinineState", "suspectedAKI", "CystatinCStandardization", "CystatinCAssayMethod", "CrCysStandardizationConfirmed"].forEach((fieldId) => {
      required.delete(fieldId);
      optional.delete(fieldId);
    });
    if (formula.id !== "neonatal_egfr") {
      required.delete("ScrAssay");
      optional.delete("ScrAssay");
    }
    const module = getModuleForFormula(formula.id);
    if (module?.path === "spot" && !required.has("spotSampleKind") && !["PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formula.id)) optional.add("spotSampleKind");
    if (formula.id === "PCR" && fieldValue("spotSampleKind")) optional.add("spotSampleKind");
    if (formula.id === "KTV") {
      documentRef.getElementById("ktvFields")?.querySelectorAll("input[id], select[id]").forEach((control) => {
        if (control.id !== "ktvToggle") optional.add(control.id);
      });
    }
    required.forEach((fieldId) => optional.delete(fieldId));
    Object.entries(UNIT_PAIRS).forEach(([valueId, unitId]) => {
      if (required.has(valueId)) required.add(unitId);
      else if (optional.has(valueId)) optional.add(unitId);
    });
    optional.delete("fullName");
    // Nie wymagamy odpowiedzi na pole opcjonalne, aby policzyć sam wskaźnik.
    const interpretation = new Set();
    return { active: new Set([...required, ...optional]), required, interpretation, optional };
  }

  function renderActiveFields() {
    const formula = formulaById(state.activeFormulaId);
    state.activeFormulaId = formula ? formula.id : "";
    if (state.legacyBroad || formula?.id !== "ACR") global.ClcrAcrUi?.sync({ document: documentRef, active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "PCR") global.ClcrPcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "CaCr_spot") global.ClcrCacrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "OxCr_spot") global.ClcrOxcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "CitCr_spot") global.ClcrCitcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "FENa_spot") global.ClcrFenaUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "FEK_spot") global.ClcrFekUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "FECl_spot") global.ClcrFeclUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    if (state.legacyBroad || formula?.id !== "FEHCO3_spot") global.ClcrFehco3Ui?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    // Same-formula refresh must not reparent a focused correction control.
    // syncNeonatalAgeCorrection releases it once the correction loses focus.
    if (state.legacyBroad || formula?.id !== "neonatal_egfr") restoreNeonatalAgeCorrection();
    if (state.legacyBroad || formula?.id !== "cl24") restoreMeasuredFields();
    restoreCollapsibleContextFields();
    documentRef.documentElement.classList.remove("clcr-legacy-broad");
    const activeModule = formula ? getModuleForFormula(formula.id) : null;
    if (activeModule) {
      documentRef.documentElement.dataset.clcrActiveModule = activeModule.id;
      documentRef.documentElement.classList.add("clcr-has-active-formula");
    } else {
      delete documentRef.documentElement.dataset.clcrActiveModule;
      documentRef.documentElement.classList.remove("clcr-has-active-formula");
    }
    if (state.moduleToggle) {
      state.moduleToggle.textContent = state.mobileModulesExpanded
        ? "Ukryj obliczenia"
        : "Zmień obliczenie";
    }
    const sets = formula
      ? activeSetsForFormula(formula)
      : { active: new Set(), required: new Set(), interpretation: new Set(), optional: new Set() };
    state.activeFieldIds = sets.active;
    state.requiredFieldIds = sets.required;
    state.interpretationFieldIds = sets.interpretation;
    state.optionalFieldIds = sets.optional;
    renderCompactCgLabels();
    syncAssayOptions();

    state.fieldViews.forEach((view, fieldId) => {
      const visible = sets.active.has(fieldId);
      if (!view.neonatalCorrectionAnchor) view.wrapper.hidden = !visible;
      if (!visible) {
        view.control.removeAttribute("aria-required");
        view.wrapper.classList.remove("must-fill-group");
      } else if (sets.required.has(fieldId)) {
        setFieldStatus(view, "required");
      } else if (sets.interpretation.has(fieldId)) {
        setFieldStatus(view, "interpretation");
      } else {
        setFieldStatus(view, "optional");
      }
    });

    syncDzmQualityGroup();
    const accr = state.fieldViews.get("U_ACR");
    const pcr = state.fieldViews.get("U_PCR");
    if (accr) accr.wrapper.hidden = true;
    if (pcr) pcr.wrapper.hidden = true;
    const pairedNote = documentRef.getElementById("clcrPairedMarkerNote");
    if (pairedNote) pairedNote.hidden = !["egfr_cr_cys", "ckid_u25_cr_cys"].includes(formula?.id);
    groupCollapsibleContextFields();
    syncMeasuredFields();
    syncFieldPairs();

    const ktvToggle = documentRef.getElementById("ktvToggle");
    if (ktvToggle) {
      if (formula && formula.id === "KTV") {
        ktvToggle.checked = true;
        ktvToggle.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!state.legacyBroad) {
        ktvToggle.checked = false;
      }
    }
    syncFieldsetVisibility();
    renderActiveHeading(formula);
    global.ClcrAcrUi?.sync({ document: documentRef, active: formula?.id === "ACR", fieldViews: state.fieldViews });
    global.ClcrPcrUi?.sync(documentRef, { active: formula?.id === "PCR", fieldViews: state.fieldViews });
    global.ClcrCacrUi?.sync(documentRef, { active: formula?.id === "CaCr_spot", fieldViews: state.fieldViews });
    global.ClcrOxcrUi?.sync(documentRef, { active: formula?.id === "OxCr_spot", fieldViews: state.fieldViews });
    global.ClcrCitcrUi?.sync(documentRef, { active: formula?.id === "CitCr_spot", fieldViews: state.fieldViews });
    global.ClcrFenaUi?.sync(documentRef, { active: formula?.id === "FENa_spot", fieldViews: state.fieldViews });
    global.ClcrFekUi?.sync(documentRef, { active: formula?.id === "FEK_spot", fieldViews: state.fieldViews });
    global.ClcrFeclUi?.sync(documentRef, { active: formula?.id === "FECl_spot", fieldViews: state.fieldViews });
    global.ClcrFehco3Ui?.sync(documentRef, { active: formula?.id === "FEHCO3_spot", fieldViews: state.fieldViews });
    syncFieldsetVisibility();
    renderReadiness();
  }

  function broadFormulaIds(level) {
    return (Array.isArray(global.FORMULAS) ? global.FORMULAS : [])
      .filter((formula) => {
        if (HISTORICAL_FORMULA_IDS.includes(formula.id)) return false;
        return levelAllows(level, formula.version);
      })
      .map((formula) => formula.id);
  }

  function renderLegacyBroad(level) {
    global.ClcrAcrUi?.sync({ document: documentRef, active: false, fieldViews: state.fieldViews });
    global.ClcrPcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrCacrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrOxcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrCitcrUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrFenaUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrFekUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrFeclUi?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    global.ClcrFehco3Ui?.sync(documentRef, { active: false, fieldViews: state.fieldViews });
    restoreMeasuredFields();
    restoreNeonatalAgeCorrection();
    restoreCollapsibleContextFields();
    broadFormulaIds(level);
    documentRef.documentElement.classList.add("clcr-legacy-broad");
    documentRef.documentElement.classList.remove("clcr-has-active-formula");
    delete documentRef.documentElement.dataset.clcrActiveModule;
    const active = new Set();
    state.fieldViews.forEach((_view, id) => {
      if (!["Cl24DurationHours", "Cl24CollectionProblem", "ACR_reported", "ACR_reported_unit", "ACR_same_specimen", "PCR_reported", "PCR_reported_unit", "PCR_same_specimen", "U_Prot_spot_unit", "CaCr_reported", "CaCr_reported_unit", "CaCr_same_specimen", "OxCr_reported", "OxCr_reported_unit", "OxCr_same_specimen", "oxalateSpotReportingEntity", "CitCr_reported", "CitCr_reported_unit", "CitCr_reported_basis", "CitCr_same_specimen", "citrateSpotReportingEntity"].includes(id)) active.add(id);
    });
    state.activeFieldIds = active;
    state.requiredFieldIds = new Set();
    state.interpretationFieldIds = new Set();
    state.optionalFieldIds = new Set(active);
    renderCompactCgLabels();
    syncAssayOptions();
    state.fieldViews.forEach((view, fieldId) => {
      view.wrapper.hidden = !active.has(fieldId);
      setFieldStatus(view, "optional");
    });
    restoreDzmQualityFields();
    restoreCollapsibleContextFields();
    syncFieldPairs();
    syncFieldsetVisibility();
    renderActiveHeading(null, true);
    renderReadiness();
  }

  function requirementState(fieldId) {
    const view = state.fieldViews.get(fieldId);
    if (!view) return { missing: true, reason: "Pole nie jest dostępne w formularzu." };
    const control = view.control;
    if (state.activeFormulaId === "AGu_spot" && fieldId === "spotSameSpecimen") {
      if (uagSpecimenConfirmed()) return { missing: false };
      const answer = view.answerSelect?.value;
      return { missing: true, blocked: answer === "no", reason: answer === "no"
        ? "Anality moczu muszą pochodzić z tej samej próbki."
        : "Potwierdź wspólne pochodzenie analitów moczu." };
    }
    if (view.answerSelect) {
      const answer = view.answerSelect.value;
      if (answer === "yes") return { missing: false };
      if (answer === "no") {
        return { missing: true, blocked: true, reason: "Warunek nie został spełniony." };
      }
      if (answer === "unknown") {
        return { missing: true, reason: "Warunek wymaga potwierdzenia." };
      }
      return { missing: true, reason: "Wybierz odpowiedź." };
    }
    if (String(control.type).toLowerCase() === "checkbox") {
      return control.checked
        ? { missing: false }
        : { missing: true, reason: "Wymagane jest potwierdzenie." };
    }
    const value = control.value == null ? "" : String(control.value).trim();
    if (value === "") return { missing: true, reason: "Uzupełnij pole." };
    if (String(control.type).toLowerCase() === "number" || fieldId === "Cl24DurationHours") {
      const numeric = fieldId === "Cl24DurationHours"
        ? /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) ? Number(value.replace(",", ".")) : NaN
        : Number(value);
      if (!Number.isFinite(numeric)) {
        return {
          missing: true,
          blocked: true,
          reason: "Podaj prawidłową liczbę.",
        };
      }
      const validDomain = NON_NEGATIVE_REQUIRED_FIELDS.has(fieldId)
        ? numeric >= 0
        : numeric > 0;
      if (!validDomain) {
        return {
          missing: true,
          blocked: true,
          reason: NON_NEGATIVE_REQUIRED_FIELDS.has(fieldId)
            ? "Wartość nie może być ujemna."
            : "Wartość musi być większa od 0.",
        };
      }
    }
    return { missing: false };
  }

  function focusField(fieldId) {
    if (fieldId === DZM_QUALITY_GROUP_FOCUS_ID && state.dzmQualityGroup) {
      const { group, confirmAll, details } = state.dzmQualityGroup;
      const answerSummary = dzmQualityAnswerSummary();
      const firstProblemId =
        answerSummary.noCount || answerSummary.unknownCount
          ? DZM_QUALITY_FIELDS.find((qualityFieldId) => {
              const view = state.fieldViews.get(qualityFieldId);
              return (
                view &&
                view.answerSelect &&
                ["no", "unknown"].includes(view.answerSelect.value)
              );
            })
          : "";
      const problemView = firstProblemId
        ? state.fieldViews.get(firstProblemId)
        : null;
      const target = problemView?.answerSelect || confirmAll;
      if (problemView) details.open = true;
      try {
        group.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
      return;
    }
    const view = state.fieldViews.get(fieldId);
    if (!view) return;
    const target = view.answerSelect || view.control;
    const details = view.wrapper.closest("details");
    if (details) details.open = true;
    try {
      view.wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
  }

  function fieldValue(fieldId) {
    const control = documentRef.getElementById(fieldId);
    return control && control.value != null ? String(control.value).trim() : "";
  }

  function fieldNumber(fieldId) {
    const value = fieldValue(fieldId);
    if (value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function semanticBlock(code, message, fieldId, outcome) {
    return {
      ok: false,
      outcome: outcome || null,
      blockers: [
        {
          code: code || "FORMULA_NOT_READY",
          fieldId: fieldId || "",
          message:
            message ||
            "Podane dane nie spełniają warunków wybranego obliczenia.",
        },
      ],
      limitations: [],
    };
  }

  function engineFieldToControl(field) {
    const fields = {
      ageYears: "age",
      heightValue: "height",
      creatinineValue: "Scr",
      creatinineUnit: "ScrUnit",
      creatinineStandardization: "ScrAssay",
      cystatinCValue: "CystatinC",
      cystatinCStandardization: "CystatinCStandardization",
      "sampling.sameSession": "ktvSameSession",
      "sampling.preBeforeDialysis": "ktvPreBeforeDialysis",
      "sampling.preNoSalineHeparinDilution": "ktvPreNoDilution",
      "sampling.postMethod": "ktvPostMethod",
      sessionsPerWeek: "ktvSessionsPerWeek",
      pidiDays: "ktvPidiDays",
      durationMinutes: "ktvDurationMinutes",
      netUfLiters: "ktvUF",
      postWeightKg: "ktvW",
      ureaAnalyte: "ktvUreaAnalyte",
      ureaUnit: "ktvUreaUnit",
      preUrea: "UreaPre",
      postUrea: "UreaPost",
    };
    return fields[field] || "";
  }

  function calculationAssumptions(formulaId = state.activeFormulaId) {
    const resolver = global.VildaClcrCalculationAssumptions;
    if (!resolver || typeof resolver.resolve !== "function") return null;
    const clinical = global.ClcrClinicalSafety;
    const creatinineState = fieldValue("creatinineState") || "unknown";
    const suspectedAKI = Boolean(documentRef.getElementById("suspectedAKI")?.checked);
    const scrAssay = fieldValue("ScrAssay");
    return resolver.resolve(formulaId, {
      creatinineState,
      suspectedAKI,
      scrAssay,
      creatinineStandardization: ["enzymatic_idms", "jaffe_idms"].includes(scrAssay) ? "IDMS" : "",
      cystatinCStandardization: fieldValue("CystatinCStandardization"),
      crCysStandardizationConfirmed: Boolean(documentRef.getElementById("CrCysStandardizationConfirmed")?.checked),
      markerPolicy: typeof clinical?.creatininePolicy === "function"
        ? clinical.creatininePolicy(creatinineState, suspectedAKI)
        : undefined,
    });
  }

  function currentClinicalContext(formulaId = state.activeFormulaId) {
    const clinical = global.ClcrClinicalSafety;
    const age = formulaId === "cg_norm" && typeof clinical?.parseAge === "function"
      ? clinical.parseAge(fieldValue("age"), 0)
      : clinical && typeof clinical.readAgeFromDocument === "function"
        ? clinical.readAgeFromDocument(documentRef)
        : null;
    const resolved = calculationAssumptions(formulaId);
    const markerPolicy = resolved?.calculationContext.markerPolicy || (
      clinical && typeof clinical.creatininePolicy === "function"
        ? clinical.creatininePolicy(
            fieldValue("creatinineState") || "unknown",
            Boolean(documentRef.getElementById("suspectedAKI")?.checked),
          )
        : {
            calculationAllowed: true,
            categoryAllowed: false,
            status: "unknown",
            message: "",
          });
    return {
      clinical,
      age,
      markerPolicy,
      calculationAssumptions: resolved,
      population: {
        termStatus: fieldValue("neonatalTermStatus"),
        bodyWeightKg: fieldValue("weight"),
        scrAssay: fieldValue("ScrAssay"),
      },
    };
  }

  function currentExtendedEgfrInput(age, resolved) {
    const paired = state.activeFormulaId === "egfr_cr_cys" ? crCysStandardization() : null;
    const effective = resolved?.calculationContext;
    return {
      ageYears: age && age.valid ? age.exactYears : null,
      sex: fieldValue("sex"),
      heightValue: fieldNumber("height"),
      heightUnit: "cm",
      creatinineValue: fieldNumber("Scr"),
      creatinineUnit:
        fieldValue("ScrUnit") === "umol" ? "umol/L" : "mg/dL",
      creatinineStandardization: effective ? effective.creatinineStandardization : paired ? paired.creatinineStandardization : [
        "enzymatic_idms",
        "jaffe_idms",
      ].includes(fieldValue("ScrAssay"))
        ? "IDMS"
        : "",
      cystatinCValue: fieldNumber("CystatinC"),
      cystatinCUnit: "mg/L",
      cystatinCStandardization: effective ? effective.cystatinCStandardization : paired ? paired.cystatinCStandardization : fieldValue("CystatinCStandardization"),
    };
  }

  function crCysStandardization() {
    const confirmed = Boolean(documentRef.getElementById("CrCysStandardizationConfirmed")?.checked);
    return {
      confirmed,
      creatinineStandardization: confirmed ? "IDMS" : "",
      cystatinCStandardization: confirmed ? "ERM-DA471/IFCC" : "",
    };
  }

  function currentKtvInput(age) {
    const kruControl = documentRef.getElementById("ktvKru");
    const kruValue =
      kruControl && !kruControl.classList.contains("error")
        ? fieldNumber("ktvKru")
        : null;
    return {
      ageYears: age && age.valid ? age.years : null,
      ageMonths: age && age.valid ? age.months : null,
      modality: fieldValue("ktvModality"),
      sessionsPerWeek: fieldNumber("ktvSessionsPerWeek"),
      pidiDays: fieldValue("ktvPidiDays"),
      preUrea: fieldNumber("UreaPre"),
      postUrea: fieldNumber("UreaPost"),
      ureaAnalyte: fieldValue("ktvUreaAnalyte"),
      ureaUnit: fieldValue("ktvUreaUnit"),
      durationMinutes: fieldNumber("ktvDurationMinutes"),
      netUfLiters: fieldNumber("ktvUF"),
      postWeightKg: fieldNumber("ktvW"),
      accessType: fieldValue("ktvAccessType") || "unknown",
      kruValue,
      kruUnit: "mL/min/1.73m²",
      kruMeasuredAt: fieldValue("ktvKruMeasuredAt"),
      evaluationDate:
        global.ClcrDialysisSafety &&
        typeof global.ClcrDialysisSafety.localIsoDate === "function"
          ? global.ClcrDialysisSafety.localIsoDate(new Date())
          : null,
      treatmentsDeliveredReliably: Boolean(
        documentRef.getElementById("ktvTreatmentsDelivered")?.checked,
      ),
      sampling: {
        sameSession: Boolean(
          documentRef.getElementById("ktvSameSession")?.checked,
        ),
        preBeforeDialysis: Boolean(
          documentRef.getElementById("ktvPreBeforeDialysis")?.checked,
        ),
        preNoSalineHeparinDilution: Boolean(
          documentRef.getElementById("ktvPreNoDilution")?.checked,
        ),
        postMethod: fieldValue("ktvPostMethod"),
      },
    };
  }

  function safetyFieldForReason(reason, formulaId = state.activeFormulaId) {
    const text = String(reason || "");
    if (/AKI|niestacjonarn|zmieniając/i.test(text)) return "creatinineState";
    if (/IDMS|enzymatyczn|metod.*kreatynin/i.test(text)) return "ScrAssay";
    if (/mas[ayę].*ciała|kg/.test(text)) return "weight";
    if (/wcześniak|urodził.*czas|donoszon/i.test(text)) return "neonatalTermStatus";
    if (/dni.*życia|dzień.*życia|28.*dni/.test(text)) return "ageDays";
    const months = fieldNumber("ageMonths");
    if (formulaId !== "cg_norm" && months !== null && (!Number.isInteger(months) || months < 0 || months > 11)) return "ageMonths";
    return "age";
  }

  function evaluateFormulaOutcome(formula) {
    if (formula?.id === "FEHCO3_spot" && typeof global.evaluateClcrFehco3 === "function") {
      const outcome = global.evaluateClcrFehco3();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.errorCode || "FEHCO3_INVALID", outcome.error || "Sprawdź cztery stężenia i zgodność próbek.", "", outcome);
    }
    if (formula?.id === "FECl_spot" && typeof global.evaluateClcrFecl === "function") {
      const outcome = global.evaluateClcrFecl();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.errorCode || "FECL_INVALID", outcome.error || "Sprawdź cztery stężenia i zgodność próbek.", "", outcome);
    }
    if (formula?.id === "FEK_spot" && typeof global.evaluateClcrFek === "function") {
      const outcome = global.evaluateClcrFek();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.errorCode || "FEK_INVALID", outcome.error || "Sprawdź cztery stężenia i zgodność próbek.", "", outcome);
    }
    if (formula?.id === "FENa_spot" && typeof global.evaluateClcrFena === "function") {
      const outcome = global.evaluateClcrFena();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.errorCode || "FENA_INVALID", outcome.error || "Sprawdź cztery stężenia i zgodność próbek.", "", outcome);
    }
    if (formula?.id === "CitCr_spot" && typeof global.evaluateClcrCitcr === "function") {
      const outcome = global.evaluateClcrCitcr();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.reasonCode || "CITCR_INVALID", outcome.message || "Sprawdź wartość Cit/Cr, jednostkę i pochodzenie oznaczeń.", "", outcome);
    }
    if (formula?.id === "OxCr_spot" && typeof global.evaluateClcrOxcr === "function") {
      const outcome = global.evaluateClcrOxcr();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.reasonCode || "OXCR_INVALID", outcome.message || "Sprawdź wartość Ox/Cr, jednostkę i pochodzenie oznaczeń.", "", outcome);
    }
    if (formula?.id === "CaCr_spot" && typeof global.evaluateClcrCacr === "function") {
      const outcome = global.evaluateClcrCacr();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.reasonCode || "CACR_INVALID", outcome.message || "Sprawdź wartość Ca/Cr, jednostkę i pochodzenie oznaczeń.", "", outcome);
    }
    if (formula?.id === "PCR" && typeof global.evaluateClcrPcr === "function") {
      const outcome = global.evaluateClcrPcr();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.reasonCode || "PCR_INVALID", outcome.message || outcome.statusText || "Sprawdź wartość PCR, jednostkę i pochodzenie oznaczeń.", "", outcome);
    }
    if (formula?.id === "ACR" && typeof global.evaluateClcrAcr === "function") {
      const outcome = global.evaluateClcrAcr();
      return outcome.valid
        ? { ok: true, outcome, blockers: [], limitations: [] }
        : semanticBlock(outcome.reasonCode || "ACR_INVALID", outcome.message || "Sprawdź wartość ACR, jednostkę i pochodzenie oznaczeń.", "", outcome);
    }
    if (!formula) {
      return semanticBlock(
        "FORMULA_MISSING",
        "Wybierz obliczenie.",
        "",
      );
    }
    const { clinical, age, markerPolicy, population, calculationAssumptions: resolved } =
      currentClinicalContext(formula.id);
    if (resolved?.allowed === false) {
      const blocker = resolved.blockers[0];
      const methodBlocked = formula.id === "neonatal_egfr" && [
        "NEONATAL_CREATININE_METHOD_UNSUPPORTED", "CREATININE_STANDARDIZATION_INCOMPATIBLE",
      ].includes(blocker?.code);
      return semanticBlock(blocker?.code, blocker?.message, methodBlocked ? "ScrAssay" : "", resolved);
    }
    const ageConflicts = formula.id === "neonatal_egfr" ? currentNeonatalAgeConflicts() : [];
    if (ageConflicts.length) {
      return {
        ok: false,
        outcome: age,
        blockers: ageConflicts.map((entry) => ({ code: "NEONATAL_AGE_CONFLICT", fieldId: entry.fieldId, message: entry.message })),
        limitations: [],
      };
    }
    if (
      clinical &&
      typeof clinical.formulaSafety === "function"
    ) {
      const safety = clinical.formulaSafety(
        formula.id,
        age,
        markerPolicy,
        population,
      );
      if (!safety.eligible) {
        return semanticBlock(
          "FORMULA_INELIGIBLE",
          safety.reason,
          safetyFieldForReason(safety.reason, formula.id),
          safety,
        );
      }
    }
    if (
      formula.id !== "cl24" &&
      typeof global.canComputeFormula === "function" &&
      !global.canComputeFormula(formula.id)
    ) {
      return semanticBlock(
        "FORMULA_DOMAIN_INVALID",
        "Co najmniej jedna wymagana wartość jest poza dziedziną wybranego wzoru. Sprawdź wskazane dane i jednostki.",
        "",
      );
    }

    let outcome = null;
    const extended = global.ClcrExtendedEgfr;
    if (
      ["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(
        formula.id,
      ) &&
      extended
    ) {
      const method = {
        egfr_cr_cys: "computeCkdEpi2021CrCys",
        ckid_u25_cys: "computeCkidU25Cys",
        ckid_u25_cr_cys: "computeCkidU25CrCys",
      }[formula.id];
      outcome =
        typeof extended[method] === "function"
          ? extended[method](currentExtendedEgfrInput(age, resolved))
          : null;
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          outcome?.code || "EXTENDED_EGFR_INVALID",
          outcome?.error || "Nie można obliczyć wybranego eGFR.",
          engineFieldToControl(outcome?.field),
          outcome,
        );
      }
      if (resolved) outcome = { ...outcome, calculationAssumptions: resolved };
    } else if (
      formula.id === "TMP_GFR" &&
      clinical &&
      typeof clinical.computeTmpGfr === "function"
    ) {
      outcome = clinical.computeTmpGfr({
        ageYears: age && age.valid ? age.exactYears : null,
        sampleKind: fieldValue("spotSampleKind"),
        pairedSameTime: Boolean(
          documentRef.getElementById("tmpPairedSameTime")?.checked,
        ),
        overnightFasting: Boolean(
          documentRef.getElementById("tmpOvernightFasting")?.checked,
        ),
        serumPhosphate: fieldNumber("S_PO4_spot"),
        serumPhosphateUnit: fieldValue("S_PO4_spot_unit"),
        urinePhosphate: fieldNumber("U_PO4_spot"),
        urinePhosphateUnit: fieldValue("U_PO4_spot_unit"),
        serumCreatinine: fieldNumber("Scr_spot"),
        serumCreatinineUnit: fieldValue("Scr_spot_unit"),
        urineCreatinine: fieldNumber("Ucr_spot"),
        urineCreatinineUnit: fieldValue("Ucr_spot_unit"),
      });
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          "TMP_GFR_INVALID",
          outcome?.error || "Nie można obliczyć TmP/GFR.",
          "spotSampleKind",
          outcome,
        );
      }
    } else if (
      formula.id === "KTV" &&
      global.ClcrDialysisSafety &&
      typeof global.ClcrDialysisSafety.computeDialysisAdequacy === "function"
    ) {
      outcome = global.ClcrDialysisSafety.computeDialysisAdequacy(
        currentKtvInput(age),
      );
      if (!outcome || !outcome.ok) {
        const error = outcome?.messages?.errors?.[0];
        return semanticBlock(
          error?.code || "KTV_INVALID",
          error?.message || "Nie można obliczyć spKt/Vurea.",
          engineFieldToControl(error?.field),
          outcome,
        );
      }
    } else if (
      formula.id === "cl24" &&
      clinical &&
      typeof clinical.computeTimedCreatinineClearance === "function"
    ) {
      const input = typeof global.readCl24CalculationInput === "function"
        ? global.readCl24CalculationInput() : null;
      outcome = input ? clinical.computeTimedCreatinineClearance(input) : null;
      if (!outcome || !outcome.ok) {
        return semanticBlock(
          input?.collectionProblem ? "COLLECTION_KNOWN_PROBLEM" : "TIMED_CLEARANCE_INVALID",
          outcome?.error || "Nie można obliczyć klirensu czasowego.",
          input?.collectionProblem ? "Cl24CollectionProblem" : "Cl24DurationHours",
          outcome,
        );
      }
    } else if (TIMED_VALUE_FORMULAS.has(formula.id)) {
      const duration =
        typeof global.readClcrCollectionDurationMinutes === "function"
          ? global.readClcrCollectionDurationMinutes()
          : (() => {
              const start = Date.parse(fieldValue("collectionStartAt"));
              const end = Date.parse(fieldValue("collectionEndAt"));
              return Number.isFinite(start) &&
                Number.isFinite(end) &&
                end > start
                ? (end - start) / 60000
                : null;
            })();
      if (!(duration > 0)) {
        return semanticBlock(
          "COLLECTION_TIME_INVALID",
          "Koniec zbiórki musi przypadać po jej początku. Sprawdź obie daty i godziny.",
          "collectionEndAt",
        );
      }
      outcome = { ok: true, durationMinutes: duration };
    }

    const limitations = [];
    if (
      CREATININE_VALUE_FORMULAS.has(formula.id) &&
      formula.id !== "neonatal_egfr" &&
      markerPolicy &&
      markerPolicy.status === "unknown" &&
      markerPolicy.categoryAllowed !== true
    ) {
      limitations.push(
        "Nie potwierdzono stabilności markerów filtracji; wzór służy do oceny stabilnej czynności nerek.",
      );
    }
    if (
      ["egfr", "ckid_u25", "sch_idms"].includes(formula.id) &&
      resolved?.calculationContext.creatinineStandardization !== "IDMS" &&
      !["enzymatic_idms", "jaffe_idms"].includes(fieldValue("ScrAssay"))
    ) {
      limitations.push(
        "Nie potwierdzono standaryzacji kreatyniny do IDMS; nie nadano kategorii G.",
      );
    }
    if (
      ["ACR", "PCR"].includes(formula.id) &&
      fieldValue("spotSampleKind") &&
      fieldValue("spotSampleKind") !== "firstMorning"
    ) {
      limitations.push(
        "Dla ACR/PCR preferowany jest pierwszy poranny mocz.",
      );
    }
    if (
      formula.id === "KTV" &&
      !documentRef.getElementById("ktvTreatmentsDelivered")?.checked
    ) {
      limitations.push(
        "Surowy wynik spKt/V jest możliwy, ale interpretacja progowa wymaga potwierdzenia regularnej realizacji ocenianego schematu.",
      );
    }
    return { ok: true, outcome, blockers: [], limitations, calculationAssumptions: resolved };
  }

  function getFormulaReadiness(formulaId = state.activeFormulaId) {
    if (state.legacyBroad) {
      return {
        formulaId: formulaId || "",
        status: "unsupported",
        valueReady: true,
        missingFieldIds: [],
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    const formula = formulaById(formulaId);
    if (!formula || formula.id !== state.activeFormulaId) {
      return {
        formulaId: formulaId || "",
        status: "unsupported",
        valueReady: false,
        missingFieldIds: [],
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    // These ratios use the same production reader as their result card.
    // Legacy generic maxima and >0 analyte checks do not qualify this model.
    const ratioEvaluator = { CaCr_spot: global.evaluateClcrCacr, OxCr_spot: global.evaluateClcrOxcr, CitCr_spot: global.evaluateClcrCitcr, FENa_spot: global.evaluateClcrFena, FEK_spot: global.evaluateClcrFek, FECl_spot: global.evaluateClcrFecl, FEHCO3_spot: global.evaluateClcrFehco3 }[formula.id];
    if (typeof ratioEvaluator === "function") {
      const semantic = evaluateFormulaOutcome(formula);
      const outcome = semantic.outcome;
      const missingValue = !semantic.ok && /^missing-/.test(outcome?.reasonCode || outcome?.errorCode || "");
      return {
        formulaId: formula.id, status: semantic.ok ? "ready" : missingValue ? "missing" : "blocked",
        valueReady: semantic.ok, missingFieldIds: [], missing: [], activeErrors: [],
        hasBlockedProtocol: !semantic.ok && !missingValue, blockers: semantic.blockers,
        interpretationReady: semantic.ok && outcome.status !== "unassessed",
        interpretationMissingFieldIds: [], interpretationNegativeFieldIds: [], interpretationErrors: [],
        limitations: [], outcome,
      };
    }
    const missing = [];
    let hasBlockedProtocol = false;
    state.requiredFieldIds.forEach((fieldId) => {
      const result = requirementState(fieldId);
      if (!result.missing) return;
      if (result.blocked) hasBlockedProtocol = true;
      const view = state.fieldViews.get(fieldId);
      missing.push({
        fieldId,
        label: view ? view.labelText : fieldId,
        reason: result.reason,
      });
    });
    const activeErrors = Array.from(state.requiredFieldIds).filter((fieldId) => {
      const control = documentRef.getElementById(fieldId);
      return control && control.classList.contains("error");
    });
    if (activeErrors.length) {
      return {
        formulaId: formula.id,
        status: "blocked",
        valueReady: false,
        missingFieldIds: missing.map((entry) => entry.fieldId),
        missing,
        activeErrors,
        hasBlockedProtocol,
        blockers: activeErrors.map((fieldId) => ({
          code: "FIELD_INVALID",
          fieldId,
          message: "Pole zawiera wartość poza dozwolonym zakresem.",
        })),
        interpretationReady: false,
        outcome: null,
      };
    }
    if (missing.length) {
      return {
        formulaId: formula.id,
        status: "missing",
        valueReady: false,
        missingFieldIds: missing.map((entry) => entry.fieldId),
        missing,
        activeErrors: [],
        hasBlockedProtocol,
        blockers: [],
        interpretationReady: false,
        outcome: null,
      };
    }
    const semantic = evaluateFormulaOutcome(formula);
    if (!semantic.ok) {
      return {
        formulaId: formula.id,
        status: "blocked",
        valueReady: false,
        missingFieldIds: [],
        missing: [],
        activeErrors: [],
        hasBlockedProtocol: true,
        blockers: semantic.blockers,
        interpretationReady: false,
        outcome: semantic.outcome,
      };
    }
    const interpretationStates = Array.from(state.interpretationFieldIds).map(
      (fieldId) => {
        const view = state.fieldViews.get(fieldId);
        return {
          fieldId,
          view,
          result: interpretationControlState(
            view && view.control,
            view && view.answerSelect ? view.answerSelect.value : null,
          ),
        };
      },
    );
    const interpretationMissing = interpretationStates
      .filter(({ result }) => result.state === "missing")
      .map(({ fieldId }) => fieldId);
    const interpretationNegative = interpretationStates
      .filter(({ result }) => result.state === "negative")
      .map(({ fieldId, view }) => ({
        fieldId,
        message:
          INTERPRETATION_NEGATIVE_MESSAGES[fieldId] ||
          `Warunek „${view ? view.labelText : fieldId}” nie został spełniony; zastosowanie kliniczne zależy od tego warunku.`,
      }));
    const interpretationErrors = Array.from(
      state.interpretationFieldIds,
    ).filter((fieldId) =>
      documentRef.getElementById(fieldId)?.classList.contains("error"),
    );
    const checkedOptionalFields = Array.from(state.optionalFieldIds).filter(
      (fieldId) => {
        const control = documentRef.getElementById(fieldId);
        return (
          control &&
          String(control.type).toLowerCase() === "checkbox" &&
          control.checked
        );
      },
    );
    const confounderLimitations = activeConfounderLimitations(
      state.optionalFieldIds,
      checkedOptionalFields,
    );
    const limitations = [
      ...semantic.limitations,
      ...interpretationNegative.map(({ message }) => message),
      ...confounderLimitations.map(({ message }) => message),
    ];
    if (interpretationErrors.length) {
      limitations.push(
        "Co najmniej jedno pole kontekstowe zawiera nieprawidłową wartość; nie blokuje to liczby, ale ogranicza interpretację.",
      );
    }
    const uniqueLimitations = [...new Set(limitations)];
    return {
      formulaId: formula.id,
      status: "ready",
      valueReady: true,
      missingFieldIds: [],
      missing: [],
      activeErrors: [],
      hasBlockedProtocol: false,
      blockers: [],
      interpretationReady:
        !interpretationMissing.length &&
        !interpretationErrors.length &&
        !uniqueLimitations.length,
      interpretationMissingFieldIds: interpretationMissing,
      interpretationNegativeFieldIds: interpretationNegative.map(
        ({ fieldId }) => fieldId,
      ),
      interpretationErrors,
      limitations: uniqueLimitations,
      outcome: semantic.outcome,
      calculationAssumptions: semantic.calculationAssumptions,
    };
  }

  function appendReadinessList(entries) {
    if (!entries.length) return;
    const list = createElement("ul", "clcr-missing-list");
    entries.forEach((entry) => {
      const item = createElement("li");
      const fieldId = entry.fieldId || "";
      const isDzmQualityGroup = fieldId === DZM_QUALITY_GROUP_FOCUS_ID;
      const view = fieldId && !isDzmQualityGroup
        ? state.fieldViews.get(fieldId)
        : null;
      const label = entry.label || (view ? view.labelText : fieldId);
      const text = entry.reason
        ? `${label} — ${entry.reason}`
        : entry.message || label;
      if (fieldId && (view || isDzmQualityGroup)) {
        const button = createElement("button", "clcr-missing-link", text);
        button.type = "button";
        button.addEventListener("click", () => focusField(fieldId));
        item.appendChild(button);
      } else {
        item.textContent = text;
      }
      list.appendChild(item);
    });
    state.readiness.appendChild(list);
  }

  function compactReadinessEntries(entries) {
    const source = Array.isArray(entries) ? entries : [];
    const qualityEntries = source.filter((entry) =>
      DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    if (!qualityEntries.length) return source;
    const firstIndex = source.findIndex((entry) =>
      DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    const answerSummary = dzmQualityAnswerSummary();
    const reason = answerSummary.noCount
      ? "co najmniej jeden warunek nie został spełniony."
      : answerSummary.unknownCount
        ? "kompletności zbiórki nie można potwierdzić."
        : "potwierdź wszystkie 6 warunków jednym kliknięciem albo uzupełnij szczegóły.";
    const compacted = source.filter(
      (entry) => !DZM_QUALITY_FIELDS.includes(entry.fieldId),
    );
    compacted.splice(Math.min(firstIndex, compacted.length), 0, {
      fieldId: DZM_QUALITY_GROUP_FOCUS_ID,
      label: "Jakość czasowej lub dobowej zbiórki moczu",
      reason,
    });
    return compacted;
  }

  function renderReadiness() {
    if (!state.readiness) return;
    if (state.activeFormulaId === "ACR") global.ClcrAcrUi?.refresh(documentRef);
    if (state.activeFormulaId === "PCR") global.ClcrPcrUi?.refresh(documentRef);
    if (state.activeFormulaId === "CaCr_spot") global.ClcrCacrUi?.refresh(documentRef);
    if (state.activeFormulaId === "OxCr_spot") global.ClcrOxcrUi?.refresh(documentRef);
    if (state.activeFormulaId === "CitCr_spot") global.ClcrCitcrUi?.refresh(documentRef);
    if (state.activeFormulaId === "FENa_spot") global.ClcrFenaUi?.refresh(documentRef);
    if (state.activeFormulaId === "FEK_spot") global.ClcrFekUi?.refresh(documentRef);
    if (state.activeFormulaId === "FECl_spot") global.ClcrFeclUi?.refresh(documentRef);
    if (state.activeFormulaId === "FEHCO3_spot") global.ClcrFehco3Ui?.refresh(documentRef);
    syncAssayOptions();
    syncNeonatalAgeCorrection();
    syncMeasuredProblem();
    syncMeasuredContext();
    if (state.completion) state.completion.hidden = true;
    state.readiness.replaceChildren();
    state.readiness.hidden = false;
    const formula = formulaById(state.activeFormulaId);
    if (state.legacyBroad) {
      documentRef.documentElement.dataset.clcrReady = "true";
      state.readiness.hidden = true;
      return;
    }
    if (!formula) {
      documentRef.documentElement.dataset.clcrReady = "false";
      state.readiness.className = "clcr-readiness clcr-readiness--neutral";
      state.readiness.append(createElement("p", "", "Wybierz obliczenie, aby zobaczyć potrzebne dane."));
      return;
    }
    const context = currentClinicalContext(formula.id);
    if (CREATININE_VALUE_FORMULAS.has(formula.id) && context.markerPolicy && !context.markerPolicy.calculationAllowed) {
      documentRef.documentElement.dataset.clcrReady = "false";
      state.readiness.className = "clcr-readiness clcr-readiness--error";
      state.readiness.append(createElement("strong", "", "Nie można obliczyć bieżącej czynności nerek."));
      appendReadinessList([{ message: context.markerPolicy.message || "Zapisane AKI lub szybko zmieniające się markery wykluczają użycie tego wzoru." }]);
      return;
    }
    const readiness = getFormulaReadiness(formula.id);
    documentRef.documentElement.dataset.clcrReady = String(readiness.valueReady);
    if (["CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formula.id)) {
      // Empty, invalid and qualified states belong to the single result card.
      state.readiness.hidden = true;
      global.ClcrLayout?.refresh?.();
      return;
    }
    if (formula.id === "cl24") renderDataCompletion();
    if (readiness.status === "missing") {
      if (formula.id === "cl24" && !readiness.hasBlockedProtocol) {
        state.readiness.className = "clcr-readiness clcr-readiness--neutral";
        state.readiness.append(
          createElement("strong", "", "Tutaj pojawi się wynik"),
          createElement("p", "", "Wpisz kreatyninę w surowicy i moczu, objętość moczu oraz rzeczywisty czas zbiórki."),
        );
        global.ClcrLayout?.refresh?.();
        return;
      }
      state.readiness.className = readiness.hasBlockedProtocol
        ? "clcr-readiness clcr-readiness--error"
        : "clcr-readiness clcr-readiness--incomplete";
      state.readiness.append(createElement("strong", "", readiness.hasBlockedProtocol
        ? "Nie można obliczyć: sprawdź wskazany warunek."
        : "Do obliczenia brakuje:"));
      appendReadinessList(compactReadinessEntries(readiness.missing));
    } else if (readiness.status === "blocked") {
      if (formula.id === "cl24" && readiness.blockers.some((entry) => entry.code === "COLLECTION_KNOWN_PROBLEM")) {
        state.readiness.className = "clcr-readiness clcr-readiness--collection-problem";
        state.readiness.append(createElement("strong", "", "Wyjaśnij problem ze zbiórką"));
        readiness.blockers.forEach((entry) => state.readiness.appendChild(createElement("p", "", entry.message)));
        state.readiness.appendChild(createElement("p", "", "Sprawdź dane zbiórki; jeśli pominięto część moczu, potrzebna jest nowa zbiórka."));
        global.ClcrLayout?.refresh?.();
        return;
      }
      state.readiness.className = "clcr-readiness clcr-readiness--error";
      state.readiness.append(createElement("strong", "", "Nie można obliczyć dla podanych danych:"));
      appendReadinessList(readiness.blockers);
      if (state.activeFormulaId === "neonatal_egfr" && readiness.blockers.some((entry) => entry.fieldId === "ScrAssay")) {
        const details = state.fieldViews.get("ScrAssay")?.wrapper.closest("details");
        if (details) details.open = true;
      }
    } else {
      // Ograniczenia odniesienia należą do karty wyniku. Nie tworzą osobnego
      // komunikatu o gotowości ani żądania dodatkowych, opcjonalnych odpowiedzi.
      state.readiness.hidden = true;
      renderDataCompletion();
    }
    global.ClcrLayout?.refresh?.();
  }

  function renderDataCompletion() {
    if (["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(state.activeFormulaId)) return;
    const questions = new Set();
    state.requiredFieldIds.forEach((fieldId) => {
      if (DZM_QUALITY_FIELDS.includes(fieldId)) questions.add(DZM_QUALITY_GROUP_FOCUS_ID);
      else if (!Object.entries(UNIT_PAIRS).some(([valueId, unitId]) => unitId === fieldId && state.requiredFieldIds.has(valueId))) {
        questions.add(fieldId);
      }
    });
    if (!questions.size) return;
    const sections = Array.from(documentRef.querySelectorAll("#clcrForm fieldset"))
      .filter(sectionHasVisibleFields);
    const target = state.activeFormulaId === "cl24" && state.measuredLayout
      ? state.measuredLayout.fields : sections[sections.length - 1] || state.activePanel;
    if (!target) return;
    if (!state.completion) {
      state.completion = createElement("p", "clcr-data-completion");
      state.completion.id = "clcrDataCompletion";
      state.completion.setAttribute("aria-live", "polite");
    }
    const complete = state.activeFormulaId === "cl24"
      ? [...questions].filter((id) => !requirementState(id).missing &&
        (!UNIT_PAIRS[id] || !requirementState(UNIT_PAIRS[id]).missing)).length : questions.size;
    state.completion.textContent = complete === questions.size
      ? `✓ Dane kompletne · ${complete}/${questions.size}`
      : `Wymagane dane · ${complete}/${questions.size}`;
    state.completion.hidden = false;
    if (state.completion.parentNode !== target) target.appendChild(state.completion);
  }

  let readinessFrame = 0;
  function scheduleReadiness() {
    if (readinessFrame) global.cancelAnimationFrame(readinessFrame);
    readinessFrame = global.requestAnimationFrame(() => {
      readinessFrame = 0;
      renderReadiness();
    });
  }

  function renderActiveHeading(formula, legacy) {
    if (!state.activePanel) return;
    state.activePanel.replaceChildren();
    const eyebrow = createElement("div", "clcr-active-panel__eyebrow");
    const step = createElement("span", "clcr-step-number", "2");
    step.setAttribute("aria-hidden", "true");
    eyebrow.append(step, documentRef.createTextNode("Dane do obliczenia"));
    state.activePanel.appendChild(eyebrow);
    const heading = createElement("h2", "clcr-active-panel__title", formula
      ? formula.id === "FEHCO3_spot" ? "FEHCO₃ — frakcja wydalania wodorowęglanów" : formula.id === "FECl_spot" ? "FECl — frakcja wydalania chlorków" : formula.id === "FEK_spot" ? "FEK — frakcja wydalania potasu" : formula.id === "FENa_spot" ? "FENa — frakcja wydalania sodu" : formula.id === "CitCr_spot" ? "Cytryniany/kreatynina — Cit/Cr" : formula.id === "OxCr_spot" ? "Szczawiany/kreatynina — Ox/Cr" : formula.id === "CaCr_spot" ? "Wapń/kreatynina — Ca/Cr" : formula.id === "PCR" ? "Białko/kreatynina — PCR" : formula.id === "ACR" ? "ACR — albumina/kreatynina" : formula.id === "cl24" ? "Klirens kreatyniny ze zbiórki moczu" : formula.id === "cg_norm" ? "Cockcroft–Gault (1,73 m²)" : formula.id === "cg" ? "Cockcroft–Gault" : formula.label
      : legacy ? "Obliczenia" : "Wybierz obliczenie");
    state.activePanel.appendChild(heading);
    if (formula?.id === "cl24") {
      state.activePanel.appendChild(createElement("p", "clcr-active-panel__note", "Wpisz cztery wartości z badania"));
      const context = createElement("p", "clcr-measured-patient-context");
      context.id = "cl24PatientContext";
      const edit = createElement("button", "clcr-measured-context-edit", "Zmień dane pacjenta");
      edit.id = "cl24EditPatientContext";
      edit.type = "button";
      edit.addEventListener("click", () => openMeasuredReferenceFields(MEASURED_CONTEXT_FIELDS, { editAll: true }));
      state.activePanel.append(context, edit);
      syncMeasuredContext();
    } else if (formula?.id === "cg_norm") {
      state.activePanel.appendChild(createElement("p", "clcr-active-panel__note", "Dorośli · rzeczywista masa ciała"));
    } else if (formula && formula.id !== "neonatal_egfr" && CREATININE_VALUE_FORMULAS.has(formula.id)) {
      state.activePanel.appendChild(createElement("p", "clcr-active-panel__note", "Do oceny stabilnej czynności nerek"));
    }
  }

  function renderModules() {
    if (!state.moduleGrid) return;
    state.moduleGrid.replaceChildren();
    const available = getAvailableModules(state.level);
    const grouped = new Map();
    available.forEach((module) => {
      const group = module.level === "spot" ? "spot" : module.level;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(module);
    });
    const groupNames = {
      basic: "Obliczenia podstawowe",
      advanced: "Obliczenia zaawansowane",
      pro: "Obliczenia profesjonalne",
      spot: "Obliczenia z próbki moczu",
    };
    ["basic", "advanced", "pro", "spot"].forEach((groupId) => {
      const modules = grouped.get(groupId);
      if (!modules || !modules.length) return;
      const section = createElement("section", "clcr-module-section");
      section.dataset.level = groupId;
      section.appendChild(createElement("h3", "clcr-module-section__title", groupNames[groupId]));
      const grid = createElement("div", "clcr-module-grid");
      modules.forEach((module) => {
        const card = createElement("article", "clcr-module-card");
        card.dataset.moduleId = module.id;
        if (module.formulaIds.includes(state.activeFormulaId)) {
          card.classList.add("is-active");
        }
        card.append(
          createElement("h4", "clcr-module-card__title", module.title),
          createElement("p", "clcr-module-card__description", module.description),
        );
        const variants = createElement("div", "clcr-module-card__variants");
        if (module.formulaIds.length === 1) {
          const formulaId = module.formulaIds[0];
          const button = createElement("button", "clcr-formula-choice", "Wybierz");
          button.type = "button";
          button.dataset.formulaId = formulaId;
          button.setAttribute(
            "aria-pressed",
            String(state.activeFormulaId === formulaId),
          );
          button.addEventListener("click", () => selectFormula(formulaId));
          variants.appendChild(button);
        } else {
          const select = createElement("select", "clcr-module-variant-select");
          select.setAttribute("aria-label", `Wariant: ${module.title}`);
          const placeholder = createElement(
            "option",
            "",
            `Wybierz wariant (${module.formulaIds.length})`,
          );
          placeholder.value = "";
          select.appendChild(placeholder);
          module.formulaIds.forEach((formulaId) => {
            const formula = formulaById(formulaId);
            if (!formula) return;
            const option = createElement("option", "", formula.label);
            option.value = formulaId;
            option.selected = state.activeFormulaId === formulaId;
            select.appendChild(option);
          });
          const openButton = createElement(
            "button",
            "clcr-formula-choice",
            "Otwórz obliczenie",
          );
          openButton.type = "button";
          openButton.disabled = !select.value;
          select.addEventListener("change", () => {
            openButton.disabled = !select.value;
          });
          openButton.addEventListener("click", () => {
            if (select.value) selectFormula(select.value);
          });
          variants.append(select, openButton);
        }
        card.appendChild(variants);
        grid.appendChild(card);
      });
      section.appendChild(grid);
      state.moduleGrid.appendChild(section);
    });
  }

  function setLevelSelection(level) {
    documentRef.querySelectorAll(".version-option[data-version]").forEach((option) => {
      const selected = option.dataset.version === level;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    global.currentVersion = level;
  }

  function chooseLevel(level) {
    if (!["basic", "advanced", "pro", "spot"].includes(level)) return false;
    state.legacyBroad = false;
    state.mobileModulesExpanded = true;
    documentRef.documentElement.classList.add("clcr-mobile-modules-expanded");
    documentRef.documentElement.classList.remove("clcr-legacy-broad");
    state.level = level;
    const module = getModuleForFormula(state.activeFormulaId);
    if (!module || !levelAllows(level, module.level)) {
      state.activeFormulaId = "";
      const picker = documentRef.getElementById("formulaPicker");
      if (picker) picker.value = "";
    }
    setLevelSelection(level);
    renderModules();
    renderActiveFields();
    return true;
  }

  function applyVersion(level) {
    if (!["basic", "advanced", "pro", "spot"].includes(level)) return false;
    state.level = level;
    const picker = documentRef.getElementById("formulaPicker");
    const selectedFormula = picker ? picker.value : "";
    state.legacyBroad =
      !selectedFormula && global.__CLCR_TEST_LEGACY_BROAD === true;
    state.activeFormulaId = selectedFormula;
    setLevelSelection(level);
    if (level !== "pro") {
      const ktvToggle = documentRef.getElementById("ktvToggle");
      if (ktvToggle && ktvToggle.checked) {
        ktvToggle.checked = false;
        ktvToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    renderModules();
    if (state.legacyBroad) renderLegacyBroad(level);
    else renderActiveFields();
    return true;
  }

  function ensurePickerOption(formula) {
    const picker = documentRef.getElementById("formulaPicker");
    if (!picker || !formula) return;
    if (!Array.from(picker.options).some((option) => option.value === formula.id)) {
      const option = createElement("option", "", formula.label);
      option.value = formula.id;
      picker.appendChild(option);
    }
  }

  function selectFormula(formulaId) {
    const formula = formulaById(formulaId);
    const module = getModuleForFormula(formulaId);
    if (!formula || !module || HISTORICAL_FORMULA_IDS.includes(formulaId)) return false;
    const sameSpotWorkspace = getModuleForFormula(state.activeFormulaId)?.path === "spot" && module.path === "spot";
    const preserveCalculationInputs = sameSpotWorkspace || ["cl24", "ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(state.activeFormulaId) || ["cl24", "ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formulaId);
    state.legacyBroad = false;
    state.mobileModulesExpanded = false;
    documentRef.documentElement.classList.remove("clcr-mobile-modules-expanded");
    state.activeFormulaId = formulaId;
    state.level = module.path === "spot" ? "spot" : module.level;
    setLevelSelection(state.level);
    ensurePickerOption(formula);
    renderModules();
    renderActiveFields();
    const picker = documentRef.getElementById("formulaPicker");
    if (picker) picker.value = formulaId;
    if (preserveCalculationInputs) {
      // The workflow already sets the level, picker and active fields above.
      // The legacy picker additionally resets the entire form: skip that reset
      // when opening/leaving an audited input card or changing calculations
      // within the same spot specimen workspace. A later FECl → TmP/GFR switch
      // must not erase the sample entered for FEK. Explicit blanks and known
      // sample contradictions survive too; a new session is normalized apart.
      global.clearFormulaMustFill?.();
      global.highlightFields?.(formula, false);
      if (typeof global.clcrUpdate === "function") global.clcrUpdate();
      else if (typeof global.update === "function") global.update();
    } else if (typeof global.selectClcrFormula === "function") {
      global.selectClcrFormula(formulaId);
    } else if (picker) {
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    }
    global.setTimeout(() => {
      state.legacyBroad = false;
      state.activeFormulaId = formulaId;
      renderModules();
      renderActiveFields();
    }, 0);
    return true;
  }

  function renderSearchResults(query) {
    const live = documentRef.getElementById("formulaLive");
    if (!live) return;
    live.replaceChildren();
    const results = formulaSearch(query, global.FORMULAS);
    if (!String(query || "").trim()) {
      documentRef.documentElement.classList.remove("clcr-search-open");
      live.hidden = true;
      live.style.display = "none";
      return;
    }
    documentRef.documentElement.classList.add("clcr-search-open");
    live.hidden = false;
    live.style.display = "";
    live.setAttribute("role", "listbox");
    if (!results.length) {
      live.appendChild(
        createElement(
          "p",
          "clcr-search-empty",
          "Nie znaleziono formuły. Spróbuj nazwy, skrótu, analitu albo materiału.",
        ),
      );
      return;
    }
    results.slice(0, 12).forEach(({ formula, module }) => {
      const button = createElement("button", "clcr-search-result");
      button.type = "button";
      button.dataset.formulaId = formula.id;
      button.setAttribute("role", "option");
      const name = createElement("strong", "clcr-search-result__name", formula.label);
      const meta = createElement(
        "span",
        "clcr-search-result__meta",
        `${module.title} · ${
          module.path === "spot"
            ? "Próbka moczu"
            : module.level === "basic"
              ? "Podstawowy"
              : module.level === "advanced"
                ? "Zaawansowany"
                : "Profesjonalny"
        }`,
      );
      button.append(name, meta);
      button.addEventListener("click", () => {
        selectFormula(formula.id);
        const search = documentRef.getElementById("formulaSearch");
        if (search) search.value = formula.label;
        documentRef.documentElement.classList.remove("clcr-search-open");
        live.hidden = true;
        live.style.display = "none";
      });
      live.appendChild(button);
    });
  }

  function buildShell(form) {
    const container = form.parentNode;
    const shell = createElement("section", "clcr-workflow");
    shell.id = "clcrWorkflow";
    shell.setAttribute("aria-label", "Wybór obliczenia");
    shell.append(
      createElement("span", "clcr-workflow__eyebrow", "Kalkulator nerkowy"),
      createElement("h1", "clcr-workflow__title", "Co chcesz obliczyć?"),
      createElement(
        "p",
        "clcr-workflow__lead",
        "Znajdź formułę albo wybierz poziom. Formularz pokaże tylko dane potrzebne do bieżącego obliczenia.",
      ),
    );
    const choiceStep = createElement("span", "clcr-step-number", "1");
    choiceStep.setAttribute("aria-hidden", "true");
    shell.querySelector("h1").prepend(choiceStep);
    const searchBox = createElement("div", "clcr-search");
    const searchLabel = createElement(
      "label",
      "clcr-search__label",
      "Szukaj formuły do obliczenia",
    );
    const search = documentRef.getElementById("formulaSearch");
    const live = documentRef.getElementById("formulaLive");
    if (search) {
      search.type = "search";
      search.placeholder = "Np. ACR, Schwartz, wapń, KT/V…";
      search.setAttribute("autocomplete", "off");
      search.setAttribute("form", "none");
      search.removeAttribute("style");
      searchLabel.setAttribute("for", search.id);
      searchBox.append(searchLabel, search);
      search.addEventListener("input", () => renderSearchResults(search.value));
      search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          search.value = "";
          renderSearchResults("");
        }
        if (event.key === "ArrowDown") {
          const first = live && live.querySelector(".clcr-search-result");
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    }
    if (live) {
      live.removeAttribute("style");
      live.hidden = true;
      searchBox.appendChild(live);
    }
    shell.appendChild(searchBox);

    const levelHeading = createElement(
      "h2",
      "clcr-workflow__section-title",
      "Wybierz poziom zaawansowania",
    );
    shell.appendChild(levelHeading);
    const versions = documentRef.getElementById("versionContainer");
    if (versions) {
      versions.querySelector(".center-text")?.remove();
      versions.setAttribute("role", "group");
      versions.setAttribute("aria-label", "Poziom zaawansowania kalkulatora");
      versions.querySelectorAll(".version-option[data-version]").forEach((option) => {
        option.setAttribute("role", "button");
        option.tabIndex = 0;
        option.setAttribute("aria-pressed", "false");
        const activate = () => chooseLevel(option.dataset.version);
        option.addEventListener("click", activate);
        option.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        });
      });
      const spotOption = versions.querySelector(
        '.version-option[data-version="spot"]',
      );
      let spotPath = null;
      if (spotOption) {
        spotPath = createElement("div", "clcr-spot-path");
        spotPath.setAttribute("role", "group");
        spotPath.setAttribute("aria-label", "Osobna ścieżka próbki moczu");
        const spotHeading = createElement(
          "h2",
          "clcr-workflow__section-title clcr-workflow__section-title--spot",
          "Albo wybierz obliczenie z próbki moczu",
        );
        spotOption.classList.add("clcr-spot-path__option");
        spotPath.append(spotHeading, spotOption);
      }
      shell.appendChild(versions);
      if (spotPath) shell.appendChild(spotPath);
    }

    const moduleGrid = createElement("div", "clcr-modules");
    moduleGrid.id = "clcrModuleGrid";
    shell.appendChild(moduleGrid);
    state.moduleGrid = moduleGrid;
    const moduleToggle = createElement(
      "button",
      "clcr-mobile-module-toggle",
      "Zmień obliczenie",
    );
    moduleToggle.type = "button";
    moduleToggle.addEventListener("click", () => {
      state.mobileModulesExpanded = !state.mobileModulesExpanded;
      documentRef.documentElement.classList.toggle(
        "clcr-mobile-modules-expanded",
        state.mobileModulesExpanded,
      );
      moduleToggle.textContent = state.mobileModulesExpanded
        ? "Ukryj obliczenia"
        : "Zmień obliczenie";
    });
    shell.appendChild(moduleToggle);
    state.moduleToggle = moduleToggle;

    const utilities = createElement("div", "clcr-workflow__utilities");
    const samePatient = documentRef.getElementById("samePatientMode");
    if (samePatient && samePatient.closest("label")) {
      const sameLabel = samePatient.closest("label");
      sameLabel.removeAttribute("style");
      sameLabel.classList.add("clcr-same-patient");
      utilities.appendChild(sameLabel);
    }
    const legacy = documentRef.getElementById("legacyFormulaHistory");
    if (legacy) shell.appendChild(legacy);
    form.insertBefore(utilities, form.firstChild);

    const picker = documentRef.getElementById("formulaPicker");
    if (picker) {
      picker.classList.add("clcr-canonical-picker");
      picker.tabIndex = -1;
      picker.setAttribute("aria-hidden", "true");
      shell.appendChild(picker);
    }
    const pickerWrap = documentRef.getElementById("formulaPickerWrap");
    if (pickerWrap) pickerWrap.style.display = "none";

    const note = documentRef.getElementById("formulaNote");
    if (note) {
      note.removeAttribute("style");
      note.classList.add("clcr-workflow__formula-note");
      shell.appendChild(note);
    }
    container.insertBefore(shell, form);
    state.shell = shell;

    const activePanel = createElement("section", "clcr-active-panel");
    activePanel.id = "clcrActivePanel";
    const readiness = createElement("div", "clcr-readiness");
    readiness.id = "clcrReadiness";
    readiness.setAttribute("aria-live", "polite");
    form.insertBefore(readiness, form.firstChild);
    form.insertBefore(activePanel, readiness);
    state.activePanel = activePanel;
    state.readiness = readiness;
    const clearContainer = documentRef.getElementById("clearContainer");
    // Obliczenia bez danych pacjenta nadal potrzebują wspólnej akcji czyszczenia.
    if (clearContainer) form.appendChild(clearContainer);
  }

  function initFields(form) {
    form
      .querySelectorAll("input[id], select[id], textarea[id]")
      .forEach((control) => {
        if (
          [
            "formulaSearch",
            "formulaPicker",
            "samePatientMode",
            "U_ACR",
            "U_PCR",
            "Cl24DurationSource",
            "ACR_entry_mode",
            "PCR_entry_mode",
            "CaCr_entry_mode",
            "OxCr_entry_mode",
            "CitCr_entry_mode",
            "FENa_sample_status",
          ].includes(control.id)
        ) {
          if (["U_ACR", "U_PCR"].includes(control.id)) {
            const view = decorateField(control);
            if (view) view.wrapper.hidden = true;
          }
          return;
        }
        decorateField(control);
      });
    state.fieldViews.forEach((view) => {
      view.wrapper.hidden = true;
    });
  }

  function syncFromPicker() {
    const picker = documentRef.getElementById("formulaPicker");
    const formula = picker ? formulaById(picker.value) : null;
    if (!formula) return;
    const module = getModuleForFormula(formula.id);
    if (!module) return;
    state.legacyBroad = false;
    state.activeFormulaId = formula.id;
    state.level = module.path === "spot" ? "spot" : module.level;
    setLevelSelection(state.level);
    renderModules();
    renderActiveFields();
  }

  function init() {
    const form = documentRef.getElementById("clcrForm");
    if (!form || documentRef.documentElement.dataset.clcrWorkflowUi !== "1") return;
    buildShell(form);
    initFields(form);
    groupUnitPairs();

    const picker = documentRef.getElementById("formulaPicker");
    if (picker) picker.addEventListener("change", () => global.setTimeout(syncFromPicker, 0));
    form.addEventListener("input", scheduleReadiness, true);
    form.addEventListener("input", (event) => {
      if (event.target?.id === "Cl24CollectionProblem" && !event.target.checked) clearMeasuredProblemAnswers();
      if (event.target?.id === "Cl24DurationHours") {
        const source = documentRef.getElementById("Cl24DurationSource");
        if (source) source.value = String(event.target.value || "").trim() ? "hours" : "";
      }
    }, true);
    form.addEventListener("change", scheduleReadiness, true);
    form.addEventListener("change", (event) => {
      if (["ACR_entry_mode", "PCR_entry_mode", "CaCr_entry_mode", "OxCr_entry_mode", "CitCr_entry_mode"].includes(event.target?.id)) {
        syncFromPicker();
        if (typeof global.clcrUpdate === "function") global.clcrUpdate();
      }
    });
    form.addEventListener("focusout", (event) => {
      if (["age", "ageMonths"].includes(event.target?.id)) scheduleReadiness();
    }, true);
    form.addEventListener("reset", () => global.setTimeout(scheduleReadiness, 0));
    ["vilda:persist-restored", "vilda:patient-loaded"].forEach((eventName) => {
      documentRef.addEventListener(eventName, () => {
        scheduleReadiness();
      });
    });
    documentRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllHelp(null);
    });
    documentRef.addEventListener("click", (event) => {
      const action = event.target?.closest?.("[data-clcr-complete-reference]");
      if (!action) return;
      const fields = String(action.dataset.clcrMissingFields || "").split(",").map((id) => id.trim()).filter(Boolean);
      openMeasuredReferenceFields(fields);
    });
    // Dymki pomocy są nakładką (position:fixed, pointer-events:none) — muszą się
    // domykać kliknięciem poza dymkiem. Faza capture: działa nawet gdy element
    // po drodze zatrzymuje propagację kliknięcia.
    documentRef.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          target &&
          typeof target.closest === "function" &&
          target.closest(".clcr-info-button")
        ) {
          return;
        }
        closeAllHelp(null);
      },
      true,
    );
    // Dymek podąża za przyciskiem przy przewijaniu strony/panelu; chowamy go
    // dopiero, gdy przycisk wyjedzie poza ekran.
    let helpScrollFrame = 0;
    const trackOpenHelp = () => {
      if (helpScrollFrame) return;
      helpScrollFrame = global.requestAnimationFrame(() => {
        helpScrollFrame = 0;
        const open = state.openHelp;
        if (!open || open.panel.hidden) return;
        const rect = open.button.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > global.innerHeight) {
          closeAllHelp(null);
          return;
        }
        positionHelpTooltip(open.button, open.panel);
      });
    };
    global.addEventListener("scroll", trackOpenHelp, {
      capture: true,
      passive: true,
    });
    global.addEventListener("resize", trackOpenHelp);
    const clear = documentRef.getElementById("clearBtn");
    if (clear) {
      clear.addEventListener("click", (event) => {
        const resumeCitcr = ["CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(event.clcrClearedFormula);
        const clearedFormula = event.clcrClearedFormula;
        global.setTimeout(() => {
          if (resumeCitcr) {
            selectFormula(clearedFormula);
            return;
          }
          state.activeFormulaId = "";
          state.legacyBroad = false;
          const search = documentRef.getElementById("formulaSearch");
          if (search) search.value = "";
          renderModules();
          renderActiveFields();
        }, 0);
      });
    }

    chooseLevel("basic");
    global.setTimeout(syncFromPicker, 50);
    global.setTimeout(syncFromPicker, 900);
    documentRef.documentElement.classList.add("clcr-workflow-ready");
  }

  // Capture only the selected equation and its reference/context inputs. The
  // optional fields shared by a neighbouring equation are not its inputs.
  function getCalculationFieldSpec(formulaId = state.activeFormulaId) {
    const formula = formulaById(formulaId);
    if (!formula) return null;
    const sets = activeSetsForFormula(formula);
    const declared = new Set([...(formula.requires || []), ...(getContext(formulaId).interpretation || []), ...(getContext(formulaId).optional || []), ...(FORMULA_REFERENCE_FIELDS[formulaId] || [])]);
    const shared = new Set(getSharedModuleFieldIds(formulaId));
    const ids = new Set([...sets.active].filter(id => !shared.has(id) || declared.has(id)));
    ["weight", "height"].forEach(id => {
      if (!(formula.requires || []).includes(id) && !(FORMULA_REFERENCE_FIELDS[formulaId] || []).includes(id)) ids.delete(id);
    });
    const modes = { ACR: "ACR_entry_mode", PCR: "PCR_entry_mode", CaCr_spot: "CaCr_entry_mode", OxCr_spot: "OxCr_entry_mode", CitCr_spot: "CitCr_entry_mode" };
    if (modes[formulaId]) ids.add(modes[formulaId]);
    if (formulaId === "cl24") ["Cl24DurationSource", "Cl24DurationHours", "Cl24CollectionProblem", ...DZM_PROTOCOL_FIELDS].forEach(id => ids.add(id));
    const policy = global.VildaClcrCalculationAssumptions?.POLICY;
    if (policy?.markerFormulaIds?.includes(formulaId)) ["creatinineState", "suspectedAKI"].forEach(id => ids.add(id));
    if (policy?.idmsFormulaIds?.includes(formulaId)) ids.add("ScrAssay");
    if (policy?.ifccFormulaIds?.includes(formulaId)) ["CystatinCStandardization", "CrCysStandardizationConfirmed"].forEach(id => ids.add(id));
    if (["FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formulaId)) ["age", "ageMonths", "spotDiureticUse", "spotKnownCKD", "suspectedAKI", "creatinineState", "FENa_sample_status", "spotSameSpecimen", "spotPairedChemistry", "spotSampleKind", "spotBicarbonateLoad"].forEach(id => ids.add(id));
    [...ids].forEach(id => {
      if (UNIT_PAIRS[id]) ids.add(UNIT_PAIRS[id]);
      if (documentRef.getElementById(`ui_${id}_answer`) || Object.hasOwn(global.__vildaClcrVersionValueVault || {}, `ui_${id}_answer`)) ids.add(`ui_${id}_answer`);
    });
    ids.delete("fullName");
    return {
      formulaId, label: formula.label, version: formula.version || "",
      requiredFieldIds: [...sets.required], fieldIds:[...ids],
      fields: [...ids].flatMap(id => {
        const control = documentRef.getElementById(id);
        if (!control) return [];
        if (String(control.type).toLowerCase() === "hidden") return [];
        const view = state.fieldViews.get(id);
        return [{ id, label: view?.labelText || fieldLabelText(control.labels?.[0] || control.closest?.("label"), control),
          type: String(control.tagName).toLowerCase() === "select" ? "select" : String(control.type || control.tagName || "text").toLowerCase(),
          required: sets.required.has(id), unitFieldId: UNIT_PAIRS[id] || null,
          options: control.options ? Array.from(control.options).map(option => ({ value: option.value, label: option.textContent || "" })) : undefined,
          historicalContext: ["age", "ageMonths", "ageDays", "sex", "weight", "height"].includes(id),
        }];
      }),
    };
  }

  const Workflow = {
    version: "1.1.0",
    model: Model,
    state,
    selectLevel: chooseLevel,
    selectFormula,
    search: (query) => formulaSearch(query, global.FORMULAS),
    refresh: syncFromPicker,
    getFormulaReadiness,
    uagSpecimenConfirmed,
    crCysStandardization,
    calculationAssumptions,
    getCalculationFieldSpec,
    openMeasuredReferenceFields,
    hasBlockingValidationError() {
      // FENa owns a concrete empty/error card from its semantic engine.
      if (["FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(state.activeFormulaId)) return false;
      return Array.from(state.requiredFieldIds).some((fieldId) => {
        const control = documentRef.getElementById(fieldId);
        return Boolean(control && control.classList.contains("error"));
      });
    },
  };

  global.ClcrUiWorkflow = Workflow;
  global.getClcrFormulaReadiness = getFormulaReadiness;
  global.applyVersion = applyVersion;
  global.setVersion = applyVersion;

  if (documentRef.readyState === "loading") {
    documentRef.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);

/* ————————————————————————————————————————————————————————————————
 * Faza 1 — ClcrVisitSave: zapis aktywnego wyniku klirensu do karty pacjenta.
 * Czyta datapointy z tagów silnika (data-clcr-series / data-clcr-value —
 * warstwa prezentacji, bez wpływu na liczenie), mapuje przez słownik
 * ClcrUiModel.PARAM_DICTIONARY i zapisuje przez VildaVault.savePatientNote
 * jako notatki kategorii „wynik-klirens" grupowane po wspólnej dacie wizyty.
 * Bramka: aktywne tylko przy odblokowanym sejfie + wczytanym pacjencie;
 * gość liczy bez zmian, zapis nieaktywny. Serie wieloczłonowe (białko DZM,
 * KT/V) to osobne tagi → osobne datapointy (decyzja ①).
 * ———————————————————————————————————————————————————————————————— */
(function (global) {
  "use strict";

  const doc = global.document;
  const CATEGORY = "wynik-klirens";
  const state = { patientId: null, patientName: "" };
  let patientContextEpoch = 0;
  let vaultSessionEpoch = 0;
  let measurementBlocked = false;
  let blockedFromPatientId = null;
  let pendingInputOrigins = new WeakMap();
  let patientVerification = null;

  function accountId(v = vault()) {
    try { return v?.getCurrentUser?.()?.userId || null; }
    catch (_) { return null; }
  }

  function invalidatePatientVerification() {
    patientContextEpoch += 1;
    patientVerification = null;
  }

  function patientNameFromRecord(record) {
    return record?.header?.name || record?.name || record?.snapshots?.[0]?.payload?.name || "Wybrany pacjent";
  }

  function getPatientSaveState() {
    const patientId = resolveCurrentPatientId();
    const v = vault();
    const current = patientVerification && patientVerification.patientId === patientId &&
      patientVerification.vault === v && patientVerification.accountId === accountId(v) &&
      patientVerification.epoch === patientContextEpoch ? patientVerification : null;
    return {
      patientId, status: !patientId ? "none" : !vaultUnlocked() ? "locked" : current?.status || "checking",
      patientName: current?.status === "ready" ? current.patientName : "",
      measurementBlocked, hasUnsavedMeasurement: hasUnsavedMeasurement(),
    };
  }

  function ensurePersistedPatient(options = {}) {
    bindVaultEvents();
    const patientId = resolveCurrentPatientId();
    const v = vault();
    const failed = reason => Promise.resolve({ ok:false, reason, patientId, patientName:"" });
    if (!patientId) return failed("no-patient");
    if (!vaultUnlocked()) return failed("locked");
    const identity = accountId(v);
    const previous = patientVerification;
    if (!options.force && previous && previous.patientId === patientId && previous.vault === v &&
        previous.accountId === identity && previous.epoch === patientContextEpoch) {
      return previous.promise || Promise.resolve(previous.result);
    }
    const check = { patientId, vault:v, accountId:identity, epoch:patientContextEpoch,
      sessionEpoch:vaultSessionEpoch, status:"checking", patientName:"", promise:null, result:null };
    patientVerification = check;
    const current = () => check === patientVerification && check.epoch === patientContextEpoch &&
      check.sessionEpoch === vaultSessionEpoch && patientId === resolveCurrentPatientId() &&
      v === vault() && identity === accountId(v) && vaultUnlocked();
    check.promise = (async () => {
      let record;
      let readError = false;
      try {
        if (typeof v?.getPatient !== "function") throw new Error("Patient reader unavailable");
        record = await v.getPatient(patientId);
      } catch (_) { readError = true; }
      if (!current()) return { ok:false, reason:"context-changed", patientId, patientName:"" };
      const exists = record && typeof record === "object" && record.patientId === patientId &&
        (!record.id || record.id === patientId);
      check.status = readError ? "error" : exists ? "ready" : "missing";
      check.patientName = exists ? String(patientNameFromRecord(record)) : "";
      if (exists) state.patientName = check.patientName;
      check.result = { ok:!readError && !!exists, reason:!readError && exists ? "ok" : "patient-unavailable",
        patientId, patientName:check.patientName };
      return check.result;
    })().finally(() => { check.promise = null; scheduleRefresh(); });
    return check.promise;
  }

  function notifyPatientRecordChanged() {
    invalidatePatientVerification();
    scheduleRefresh();
  }

  function vault() {
    return global.VildaVault && typeof global.VildaVault === "object"
      ? global.VildaVault
      : null;
  }

  function vaultUnlocked() {
    const v = vault();
    try {
      return !!(v && typeof v.isUnlocked === "function" && v.isUnlocked());
    } catch (e) {
      return false;
    }
  }

  function model() {
    return global.ClcrUiModel && typeof global.ClcrUiModel === "object"
      ? global.ClcrUiModel
      : null;
  }

  function resolveCurrentPatientId() {
    return typeof state.patientId === "string" && state.patientId
      ? state.patientId
      : null;
  }

  function isVisible(el) {
    if (!el) return false;
    let node = el;
    let insideClosedDetails = false;
    while (node) {
      if (node.hidden || node.style?.display === "none") return false;
      if (typeof global.getComputedStyle === "function") {
        const style = global.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      if (String(node.tagName).toLowerCase() === "details" && !node.open) insideClosedDetails = true;
      node = node.parentElement || null;
    }
    if (typeof el.getClientRects === "function") {
      try {
        // Zwijanie pomocniczych miar nie usuwa ich z wizyty. Ukryte wyniki
        // nieaktywnego obliczenia zostały odrzucone przez przegląd przodków.
        return el.getClientRects().length > 0 || insideClosedDetails;
      } catch (e) { /* uproszczony DOM testowy */ }
    }
    return true;
  }

  function toNumber(raw) {
    if (raw == null) return NaN;
    const s = String(raw).trim();
    if (s === "") return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // Mapuje pojedynczy tag (id serii + surowa wartość) na datapoint wg słownika.
  function mapDatapoint(series, rawValue) {
    const m = model();
    if (!m || typeof m.getParam !== "function") return null;
    const entry = m.getParam(series);
    if (!entry) return null;
    const valueNum = toNumber(rawValue);
    if (!Number.isFinite(valueNum)) return null;
    return {
      id: entry.id,
      testKey: entry.testKey,
      label: entry.label,
      unit: entry.unit,
      group: entry.group,
      sourceFormulaId: entry.sourceFormulaId,
      valueNum: valueNum,
    };
  }

  // Zbiór formuł-źródeł do zapisu = formuły AKTYWNEGO MODUŁU (wybór lekarza).
  // Dzięki temu zapis obejmuje:
  //  • pojedynczą wybraną formułę (np. eGFR dorośli → tylko egfr),
  //  • cały panel wielo-formułowy (np. DZM → wszystkie analitów tego modułu),
  // a WYKLUCZA porównania z innych modułów, które silnik dokłada obok
  // (np. wybór CKiD U25 u 20-latka renderuje też egfr/cg — panel porównawczy).
  function moduleFormulaSet(formulaId) {
    if (typeof formulaId !== "string" || !formulaId) return null;
    const m = model();
    const mod =
      m && typeof m.getModuleForFormula === "function"
        ? m.getModuleForFormula(formulaId)
        : null;
    if (mod && Array.isArray(mod.formulaIds) && mod.formulaIds.length) {
      return new Set(mod.formulaIds);
    }
    return new Set([formulaId]);
  }

  function resolveTargetFormulaSet(options) {
    const opts = options || {};
    if (opts.allParams) return null; // Faza 3: cała karta — wszystkie parametry
    if (Array.isArray(opts.formulaIds)) return new Set(opts.formulaIds);
    if (typeof opts.formulaId === "string" && opts.formulaId) {
      return moduleFormulaSet(opts.formulaId);
    }
    const wf = global.ClcrUiWorkflow;
    const activeId =
      wf && wf.state && typeof wf.state.activeFormulaId === "string"
        ? wf.state.activeFormulaId
        : "";
    // Brak wybranej formuły (tryb broad/testowy) → brak filtra (zbierz wszystko).
    return activeId ? moduleFormulaSet(activeId) : null;
  }

  // Odczytujemy odniesienie pokazywane przy tym wyniku, bez wyprowadzania
  // kategorii klinicznej. Stare boksy nadal mogą podawać zakres przez .range.
  function readRangeText(el) {
    if (!el || typeof el.querySelector !== "function") return "";
    const measured = el.querySelector(".clcr-measured-reference-line");
    if (measured) return String(measured.textContent || "").replace(/\s+/g, " ").trim();
    const reference = el.querySelector(".clcr-result-reference");
    if (reference) {
      if (reference.getAttribute("data-clcr-reference-kind") === "none") return "";
      return [
        reference.querySelector(".clcr-result-reference-value")?.textContent,
        reference.querySelector(".clcr-result-reference-unit")?.textContent,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }
    const r = el.querySelector(".range");
    const t = r && r.textContent ? r.textContent : "";
    return t.replace(/\s+/g, " ").trim();
  }
  function elementOutOfRange(el) {
    return !!(
      el &&
      el.classList &&
      typeof el.classList.contains === "function" &&
      el.classList.contains("out-of-range")
    );
  }

  // Wartość WYŚWIETLONA przez silnik (z zaokrągleniem) — żeby historia/karta
  // pokazywały to samo co kalkulator (np. 80, a nie surowe 79,77). Z tekstu
  // otagowanego boksu bierzemy token liczbowy NAJBLIŻSZY surowej wartości; gdy
  // brak sensownego dopasowania (różnica > zaokrąglenie), zostawiamy surową.
  function displayedNumber(el, rawNum) {
    if (!el || !Number.isFinite(rawNum)) return rawNum;
    const displayValue = typeof el.getAttribute === "function"
      ? el.getAttribute("data-clcr-display-value")
      : null;
    if (displayValue != null && String(displayValue).trim() !== "") {
      const displayNumber = Number(String(displayValue).trim().replace(",", "."));
      if (Number.isFinite(displayNumber)) return displayNumber;
    }
    const txt = el.textContent || "";
    const tokens = txt.match(/-?\d+(?:[.,]\d+)?/g);
    if (!tokens) return rawNum;
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i < tokens.length; i += 1) {
      const n = Number(tokens[i].replace(",", "."));
      if (!Number.isFinite(n)) continue;
      const diff = Math.abs(n - rawNum);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = n;
      }
    }
    if (best === null) return rawNum;
    const tol = Math.max(1, Math.abs(rawNum) * 0.02);
    return bestDiff <= tol ? best : rawNum;
  }

  // Zbiera otagowane wyniki, także pomocnicze miary w Szczegółach, ograniczone do
  // formuł aktywnego modułu (chyba że nie wybrano formuły — wtedy wszystko).
  function collectActiveDatapoints(root, options) {
    const scope = root || doc;
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    const target = resolveTargetFormulaSet(options);
    const seen = new Set();
    const out = [];
    const nodes = scope.querySelectorAll("[data-clcr-series]");
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      const series = el.getAttribute("data-clcr-series");
      if (!series || seen.has(series)) continue;
      const dp = mapDatapoint(series, el.getAttribute("data-clcr-value"));
      if (!dp) continue;
      if (target && !target.has(dp.sourceFormulaId)) continue;
      dp.rawValue = dp.valueNum;
      const displayed = el.getAttribute("data-clcr-display-value");
      if (displayed != null && String(displayed).trim()) dp.displayValue = String(displayed).replace(".", ",");
      const displayUnit = el.getAttribute("data-clcr-display-unit");
      if (displayUnit) dp.unit = String(displayUnit);
      const tone = el.getAttribute("data-clcr-tone");
      if (["success", "warning", "danger", "neutral"].includes(tone)) dp.tone = tone;
      const category = el.getAttribute("data-clcr-category");
      if (category) dp.category = category;
      dp.interpretation = el.getAttribute("data-clcr-status") || "";
      dp.boundary = el.getAttribute("data-clcr-boundary") || "";
      dp.referenceProfileId = el.getAttribute("data-clcr-reference-profile") || "";
      const profileVersion = el.getAttribute("data-clcr-reference-profile-version");
      if (profileVersion != null && String(profileVersion).trim() && Number.isFinite(Number(profileVersion))) dp.referenceProfileVersion = Number(profileVersion);
      const encodedModel = el.getAttribute("data-clcr-result-record");
      if (typeof encodedModel === "string" && encodedModel.length <= 65536) {
        try {
          const savedModel = JSON.parse(encodedModel);
          if (savedModel && typeof savedModel === "object" && !Array.isArray(savedModel)) dp.model = savedModel;
        } catch (_) { /* Older result cards do not carry a frozen model. */ }
      }
      // Audited measurements preserve the raw value: rounding can cross a
      // clinical threshold. The display and any inequality are kept apart.
      if (!["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(dp.sourceFormulaId)) dp.valueNum = displayedNumber(el, dp.valueNum);
      dp.norm = readRangeText(el);
      dp.outOfRange = elementOutOfRange(el);
      if (dp.sourceFormulaId === "ACR") {
        const snapshot = readAcrSnapshot(el.getAttribute("data-clcr-acr-snapshot"));
        if (snapshot) {
          dp.acrSnapshot = snapshot;
          dp.valueNum = snapshot.rawValue;
          dp.unit = snapshot.unit;
          dp.comparator = snapshot.comparator || "";
          dp.displayValue = String(snapshot.display?.text || acrDisplayText(snapshot)).replace(".", ",");
          dp.norm = snapshot.referenceAvailable && snapshot.reference
            ? `${snapshot.reference.limit} ${snapshot.unit}` : "";
          dp.outOfRange = snapshot.status === "unassessed" ? null : snapshot.status === "above";
        }
      }
      if (dp.sourceFormulaId === "PCR") {
        const snapshot = readPcrSnapshot(el.getAttribute("data-clcr-pcr-snapshot"));
        if (snapshot) {
          dp.pcrSnapshot = snapshot;
          dp.valueNum = snapshot.rawValue;
          dp.unit = snapshot.unit;
          dp.comparator = snapshot.comparator || "";
          dp.displayValue = String(snapshot.display?.text || acrDisplayText(snapshot)).replace(".", ",");
          dp.norm = snapshot.referenceAvailable && snapshot.reference
            ? `${String(snapshot.reference.limit).replace(".", ",")} ${snapshot.unit}` : "";
          dp.outOfRange = snapshot.status === "unassessed" ? null : snapshot.status === "above";
        }
      }
      if (dp.sourceFormulaId === "CaCr_spot") {
        const snapshot = readCacrSnapshot(el.getAttribute("data-clcr-cacr-snapshot"));
        if (snapshot) {
          dp.cacrSnapshot = snapshot;
          dp.valueNum = snapshot.rawValue;
          dp.unit = snapshot.unit;
          dp.comparator = snapshot.comparator || "";
          dp.displayValue = String(snapshot.display?.text || acrDisplayText(snapshot)).replace(".", ",");
          dp.norm = snapshot.referenceAvailable && snapshot.reference
            ? `${String(snapshot.reference.range || snapshot.reference.limit || "").replace(/\./g, ",")} ${snapshot.unit}`.trim() : "";
          dp.outOfRange = snapshot.status === "unassessed" ? null : ["below", "above"].includes(snapshot.status);
        }
      }
      if (dp.sourceFormulaId === "OxCr_spot") global.ClcrOxcrPersistence?.augmentDatapoint(el, dp);
      if (dp.sourceFormulaId === "CitCr_spot") global.ClcrCitcrPersistence?.augmentDatapoint(el, dp);
      if (dp.sourceFormulaId === "FENa_spot") global.ClcrFenaPersistence?.augmentDatapoint(el, dp);
      if (dp.sourceFormulaId === "FEK_spot") {
        global.ClcrFekPersistence?.augmentDatapoint(el, dp);
        // A partially loaded or malformed FEK card cannot silently become an
        // unqualified generic saved result. The number may still be visible.
        if (!dp.fekSnapshot) continue;
      }
      if (dp.sourceFormulaId === "FECl_spot") {
        global.ClcrFeclPersistence?.augmentDatapoint(el, dp);
        if (!dp.feclSnapshot) continue;
      }
      if (dp.sourceFormulaId === "FEHCO3_spot") {
        global.ClcrFehco3Persistence?.augmentDatapoint(el, dp);
        if (!dp.fehco3Snapshot) continue;
      }
      const assumptions = el.getAttribute("data-clcr-assumptions");
      if (typeof assumptions === "string" && assumptions.trim()) dp.assumptions = assumptions.trim();
      const provenance = el.getAttribute("data-clcr-assumption-provenance");
      if (provenance) {
        try {
          const parsed = JSON.parse(provenance);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) dp.assumptionProvenance = parsed;
        } catch (_) { /* Stare wyniki bez poprawnego opisu zachowują dotychczasową postać. */ }
      }
      if (dp.sourceFormulaId === "cl24") {
        const reference = el.getAttribute("data-clcr-measured-reference");
        if (reference) {
          try {
            const parsed = JSON.parse(reference);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              dp.measuredClearanceReference = parsed;
            }
          } catch (_) { /* A legacy card can lack the reference snapshot. */ }
        }
      }
      if (dp.sourceFormulaId === "cg_norm" && el.getAttribute("data-clcr-age-policy") === "completed-years") {
        const ageUsedYears = toNumber(el.getAttribute("data-clcr-age-used-years"));
        if (Number.isInteger(ageUsedYears) && ageUsedYears >= 18) {
          dp.ageUsedYears = ageUsedYears;
          dp.agePolicy = "completed-years";
        }
      }
      dp.reference = readDisplayedReference(el, dp);
      if (dp.reference?.source) dp.source = copyData(dp.reference.source);
      const warnings = readResultWarnings(el, dp.sourceFormulaId, scope);
      if (warnings.length) dp.warnings = warnings;
      dp.capture = captureCalculationFields(dp.sourceFormulaId, { root: options?.inputRoot });
      if (dp.capture) dp.capture.referenceProfile = { id:dp.referenceProfileId || dp.acrSnapshot?.profileId || dp.pcrSnapshot?.profileId || dp.cacrSnapshot?.profileId || "", version:dp.referenceProfileVersion ?? dp.acrSnapshot?.profileVersion ?? dp.pcrSnapshot?.profileVersion ?? dp.cacrSnapshot?.profileVersion ?? null };
      seen.add(series);
      out.push(dp);
    }
    return out;
  }

  function formatValueString(n) {
    if (!Number.isFinite(n)) return "";
    const rounded = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
    // Polski separator dziesiętny (spójnie z kalkulatorem: „1,73 m²").
    return rounded.replace(".", ",");
  }

  function copyData(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readResultWarnings(element, formulaId, root) {
    const scope = element.parentElement || root;
    if (typeof scope?.querySelectorAll !== "function") return [];
    return [...new Set(Array.from(scope.querySelectorAll(".result-box.warn-yellow[data-clcr-formula]")).filter(node => {
      if (node.getAttribute("data-clcr-formula") !== formulaId || node.getAttribute("data-clcr-series") || !isVisible(node)) return false;
      const comparison = node.closest?.("[data-clcr-comparison-for]")?.getAttribute("data-clcr-comparison-for");
      return !comparison || comparison === formulaId;
    }).map(node => String(node.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
  }

  function readDisplayedReference(element, datapoint) {
    const encoded = element.getAttribute?.("data-clcr-reference-record");
    if (typeof encoded === "string" && encoded.length <= 65536) {
      try {
        const saved = JSON.parse(encoded);
        if (saved && typeof saved === "object" && !Array.isArray(saved)) return copyData(saved);
      } catch (_) { /* Legacy cards may have only visible reference text. */ }
    }
    if (!datapoint.norm) return null;
    const typed = datapoint.acrSnapshot || datapoint.pcrSnapshot || datapoint.cacrSnapshot || datapoint.oxcrSnapshot || datapoint.citcrSnapshot || datapoint.fenaSnapshot || datapoint.fekSnapshot || datapoint.feclSnapshot || datapoint.fehco3Snapshot;
    if (typed?.reference) return copyData({ ...typed.reference, text:datapoint.norm, source:typed.source || typed.reference.source || null, population:typed.population || typed.reference.population || null });
    if (datapoint.measuredClearanceReference) return copyData({ ...datapoint.measuredClearanceReference, text:datapoint.norm });
    const reference = element.querySelector?.(".clcr-result-reference");
    const sources = Array.from(element.parentElement?.children || []).filter(node =>
      node.getAttribute?.("data-clcr-formula") === datapoint.sourceFormulaId && node.classList?.contains("clcr-result-source"));
    const link = sources.flatMap(node => Array.from(node.querySelectorAll?.("a[href]") || []))[0];
    let source = link ? { label:String(link.textContent || "").trim(), url:link.getAttribute("href") || "" } : null;
    const profile = global.ClcrResultReferenceData?.PROFILE;
    if (source && profile?.id === datapoint.referenceProfileId) {
      const known = Object.values(profile.sources || {}).find(candidate => candidate.url === source.url);
      if (known) source = copyData(known);
    }
    return { text:datapoint.norm, value:reference?.querySelector?.(".clcr-result-reference-value")?.textContent || datapoint.norm,
      unit:datapoint.unit, kind:reference?.getAttribute?.("data-clcr-reference-kind") || "recorded", source,
      population:sources.map(node => String(node.textContent || "").trim()).filter(Boolean).join(" · ") || null,
    };
  }

  function captureCalculationFields(formulaId, options) {
    const scope = options?.root || doc;
    const spec = global.ClcrUiWorkflow?.getCalculationFieldSpec?.(formulaId);
    if (!scope || !spec) return null;
    const values = {};
    const fields = [];
    const preserved = global.__vildaClcrVersionValueVault || {};
    const metadata = new Map(spec.fields.map(field => [field.id, field]));
    (spec.fieldIds || spec.fields.map(field => field.id)).forEach(id => {
      const control = typeof scope.getElementById === "function" ? scope.getElementById(id)
        : scope.querySelector?.(`[id="${id}"]`);
      if (!control) {
        if (Object.hasOwn(preserved, id) && ["string", "boolean", "number"].includes(typeof preserved[id])) values[id] = preserved[id];
        return;
      }
      const type = String(control.type || "").toLowerCase();
      if (type === "radio" && !control.checked) return;
      values[id] = type === "checkbox" ? !!control.checked : String(control.value ?? "");
      if (metadata.has(id)) fields.push(copyData(metadata.get(id)));
    });
    const age = global.ClcrClinicalSafety?.readAgeFromDocument?.(scope);
    return {
      values, fields, formulaId, formulaLabel: spec.label,
      ageYears: age?.valid ? age.exactYears : null,
      sourceContext: {
        ...(Object.hasOwn(values, "creatinineState") ? { creatinineState: values.creatinineState || "unknown" } : {}),
        ...(Object.hasOwn(values, "suspectedAKI") ? { suspectedAKI: values.suspectedAKI === true } : {}),
        ...(Object.hasOwn(values, "ScrAssay") ? { scrAssay: values.ScrAssay } : {}),
        ...(Object.hasOwn(values, "CystatinCStandardization") ? { cystatinCStandardization: values.CystatinCStandardization } : {}),
        ...(Object.hasOwn(values, "CrCysStandardizationConfirmed") ? { crCysStandardizationConfirmed: values.CrCysStandardizationConfirmed === true } : {}),
      },
      calculationAssumptions: copyData(global.ClcrUiWorkflow?.calculationAssumptions?.(formulaId)),
    };
  }

  function pad2(v) {
    return String(v).padStart(2, "0");
  }

  function todayISO(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function normalizeDateISO(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return /^(\d{4})-(\d{1,2})-(\d{1,2})$/.test(trimmed) ? trimmed : null;
  }

  const readAcrSnapshot = (...args) => global.ClcrSavedResults.readAcrSnapshot(...args);
  const readPcrSnapshot = (...args) => global.ClcrSavedResults.readPcrSnapshot(...args);
  const readCacrSnapshot = (...args) => global.ClcrSavedResults.readCacrSnapshot(...args);
  const acrDisplayText = (...args) => global.ClcrSavedResults.acrDisplayText(...args);

  // One stable operation owns one ID for each selected output. A retry never
  // becomes a new measurement; the explicit New measurement action does.
  let operationSequence = 0;
  let currentOperation = null;
  const saveOperations = new Map();
  let verificationGeneration = 0;
  function operationId() {
    if (typeof global.crypto?.randomUUID === "function") return global.crypto.randomUUID();
    operationSequence += 1;
    return "clcr-" + Date.now().toString(36) + "-" + operationSequence + "-" + Math.random().toString(36).slice(2);
  }

  function buildPatientNotePayload(dp, options) {
    const serializer = global.ClcrSavedResults?.buildPatientNotePayload;
    if (typeof serializer !== "function") throw new Error("Nie załadowano modułu zapisu wyników. Odśwież kalkulator.");
    const payload = serializer(dp, options || {});
    if (dp.capture) {
      const calculation = global.ClcrSavedCalculation;
      if (typeof calculation?.createSnapshot !== "function" || typeof calculation?.serializeSnapshot !== "function") throw new Error("Nie można utrwalić oryginalnych danych obliczenia. Odśwież kalkulator.");
      const snapshot = options?.calculationSnapshot || calculation.createSnapshot(dp, {
        capture: dp.capture, patientId: payload.patientId, clinicalDateISO: payload.clinicalDateISO,
      });
      const block = calculation.serializeSnapshot(snapshot, payload);
      if (typeof block !== "string" || !block) throw new Error("Nie można utrwalić oryginalnych danych obliczenia.");
      payload.body += "\n\n" + block;
    }
    return payload;
  }

  function saveRequest(options) {
    const opts = options || {};
    const patientId = opts.patientId || resolveCurrentPatientId();
    let clinicalDateISO = opts.clinicalDateISO == null ? todayISO() : normalizeDateISO(opts.clinicalDateISO);
    if (clinicalDateISO) {
      const [year, month, day] = clinicalDateISO.split("-").map(Number);
      const checked = new Date(0);
      checked.setUTCFullYear(year, month - 1, day);
      if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) clinicalDateISO = null;
      else clinicalDateISO = String(year).padStart(4, "0") + "-" + pad2(month) + "-" + pad2(day);
    }
    if (clinicalDateISO && typeof vault()?.sanitizeClinicalDateISO === "function") clinicalDateISO = vault().sanitizeClinicalDateISO(clinicalDateISO);
    const datapoints = copyData(Array.isArray(opts.datapoints) ? opts.datapoints : collectActiveDatapoints(opts.root, opts));
    const key = JSON.stringify([patientId, clinicalDateISO, datapoints.map(dp => ({ ...dp, capture:dp.capture ? { ...dp.capture, fields:undefined } : dp.capture }))]);
    return { patientId, patientName: opts.patientName || state.patientName || readPatientName(), clinicalDateISO, datapoints, key };
  }

  function createSaveOperation(options) {
    const request = saveRequest(options);
    return { ...request, id: operationId(), outputs: request.datapoints.map(dp => ({ dp, id: operationId(), payload: null, completed: false })), pending:false, promise: null, result: null };
  }

  function sameSavedPayload(note, payload) {
    const v = vault();
    const normalizedText = value => typeof v?.sanitizeNoteText === "function" ? v.sanitizeNoteText(value) : String(value || "");
    const normalizedLab = value => typeof v?.sanitizeLabResult === "function" ? v.sanitizeLabResult(value) : value || null;
    return note && note.patientId === payload.patientId && note.category === payload.category &&
      note.clinicalDateISO === payload.clinicalDateISO && normalizedText(note.title) === normalizedText(payload.title) && normalizedText(note.body) === normalizedText(payload.body) &&
      JSON.stringify(normalizedLab(note.labResult)) === JSON.stringify(normalizedLab(payload.labResult));
  }

  async function runSaveOperation(operation) {
    const v = vault();
    const identity = accountId(v), sessionEpoch = vaultSessionEpoch;
    // A selected ID is not proof of a persisted patient. Check the actual
    // record before every attempt; failed reads never enable a write.
    const patient = await ensurePersistedPatient({ force:true });
    if (!patient.ok || patient.patientId !== operation.patientId) {
      operation.result = { ok:false, reason:patient.ok ? "context-changed" : patient.reason,
        saved:operation.outputs.filter(output => output.completed).length, total:operation.outputs.length,
        errors:[], patientId:operation.patientId, patientName:operation.patientName, clinicalDateISO:operation.clinicalDateISO };
      return operation.result;
    }
    operation.patientName = patient.patientName;
    const errors = [];
    for (const output of operation.outputs) {
      if (output.completed) continue;
      try {
        if (!vaultUnlocked() || v !== vault() || identity !== accountId(v) || sessionEpoch !== vaultSessionEpoch) throw new Error("Sesja sejfu zmieniła się. Odblokuj kartę pacjenta i ponów zapis.");
        if (!output.payload) output.payload = { ...buildPatientNotePayload(output.dp, {
          patientId: operation.patientId, clinicalDateISO: operation.clinicalDateISO,
        }), id: output.id };
        // An ambiguous previous attempt may already have committed. Reuse its
        // ID, but never overwrite an intervening edit of that record.
        const once = typeof v.savePatientNoteOnce === "function";
        if (!once && output.attempted) {
          const existing = typeof v.getPatientNote === "function" ? await v.getPatientNote(output.id) : null;
          if (!existing) throw new Error("Nie można bezpiecznie potwierdzić wcześniejszej próby zapisu. Odśwież Badania pacjenta.");
          if (!sameSavedPayload(existing, output.payload)) throw new Error("Ten zapis został już zmieniony. Odśwież Badania pacjenta.");
          output.completed = true;
          continue;
        }
        output.attempted = true;
        const result = once ? await v.savePatientNoteOnce(copyData(output.payload)) : await v.savePatientNote(copyData(output.payload));
        if ((once && (result?.saved !== true || result.id !== output.id)) || result?.saved === false || result?.conflict === true || result?.updated === false || result?.ok === false) throw new Error(result?.reason === "deleted" ? "Ten pomiar został usunięty. Ponowienie nie przywraca usuniętego wyniku." : "Nie zapisano wyniku: konflikt lub odrzucona zmiana. Odśwież Badania pacjenta.");
        output.completed = true;
      } catch (error) {
        errors.push({ testKey: output.dp.testKey, message: error?.message || String(error) });
      }
    }
    const saved = operation.outputs.filter(output => output.completed).length;
    operation.result = { ok: !errors.length && saved === operation.outputs.length && saved > 0,
      reason: errors.length ? "partial" : "ok", saved, total: operation.outputs.length, errors,
      patientId: operation.patientId, patientName: operation.patientName, clinicalDateISO: operation.clinicalDateISO,
      operationId: operation.id, noteIds: operation.outputs.filter(output => output.completed).map(output => output.id),
    };
    return operation.result;
  }

  function saveActiveResultToCard(opts) {
    const options = opts || {};
    const v = vault();
    if (!vaultUnlocked() || !v || (typeof v.savePatientNote !== "function" && typeof v.savePatientNoteOnce !== "function")) return Promise.resolve({ ok:false, reason:"locked", saved:0, total:0, errors:[] });
    const activePatientId = resolveCurrentPatientId();
    if (!activePatientId) return Promise.resolve({ ok:false, reason:"no-patient", saved:0, total:0, errors:[] });
    if (options.patientId && options.patientId !== activePatientId) return Promise.resolve({ ok:false, reason:"patient-mismatch", saved:0, total:0, errors:[] });
    if (measurementBlocked) return Promise.resolve({ ok:false, reason:"patient-context", saved:0, total:0, errors:[] });
    const request = saveRequest(options);
    if (!request.patientId) return Promise.resolve({ ok:false, reason:"no-patient", saved:0, total:0, errors:[] });
    if (!request.clinicalDateISO) return Promise.resolve({ ok:false, reason:"invalid-date", saved:0, total:0, errors:[] });
    if (!request.datapoints.length) return Promise.resolve({ ok:false, reason:"no-data", saved:0, total:0, errors:[] });
    const operation = options.operation || saveOperations.get(request.key) || createSaveOperation({ ...options, ...request });
    if (operation.patientId !== activePatientId) return Promise.resolve({ ok:false, reason:"patient-mismatch", saved:0, total:0, errors:[] });
    saveOperations.set(operation.key, operation);
    currentOperation = operation;
    if (operation.promise) return operation.promise;
    if (operation.result?.ok) return Promise.resolve(operation.result);
    operation.pending = true;
    operation.promise = runSaveOperation(operation).finally(() => { operation.pending = false; operation.promise = null; });
    return operation.promise;
  }

  function seriesWord(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs === 1) return "seria";
    if (last >= 2 && last <= 4 && (abs < 12 || abs > 14)) return "serie";
    return "serii";
  }

  // ————————————————————————— Faza 2: odczyt serii + trend —————————————————
  // Grupujemy datowane notatki wynik-klirens po PELNEJ etykiecie labResult.test
  // (obejście §2). NIE używamy wbudowanego listPatientLabSeries (jego slug Ur
  // bierze tekst przed „(" i skleja różne serie). Ograniczamy do parametrów
  // aktywnego modułu — tak jak zapis.
  function buildSeriesFromNotes(notes, options) {
    const target = resolveTargetFormulaSet(options);
    return global.ClcrSavedResults.buildLegacySeriesFromNotes(notes, target ? { formulaIds: [...target] } : { allParams: true });
  }

  async function readActiveSeries(patientId, options) {
    const v = vault();
    const pid = patientId || resolveCurrentPatientId();
    if (
      !pid ||
      !vaultUnlocked() ||
      !v ||
      typeof v.listPatientNotesForPatient !== "function"
    ) {
      return [];
    }
    let notes;
    try {
      notes = await v.listPatientNotesForPatient(pid);
    } catch (e) {
      return [];
    }
    return buildSeriesFromNotes(notes, options);
  }

  // Faza 3: pełna karta pacjenta — WSZYSTKIE parametry × wizyty (daty).
  function dictionaryIndex(id) {
    const m = model();
    const dict = m && Array.isArray(m.PARAM_DICTIONARY) ? m.PARAM_DICTIONARY : [];
    for (let i = 0; i < dict.length; i += 1) {
      if (dict[i].id === id) return i;
    }
    return Number.MAX_SAFE_INTEGER; // etykiety spoza słownika na koniec
  }

  async function readPatientFlowsheet(patientId) {
    const series = await readActiveSeries(patientId, { allParams: true });
    const dateSet = new Set();
    series.forEach((s) => {
      s.points.forEach((p) => {
        if (p.dateISO) dateSet.add(p.dateISO);
      });
    });
    const visits = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
    const parameters = series
      .map((s) => {
        const byDate = {};
        s.points.forEach((p) => {
          byDate[p.dateISO] = {
            valueNum: p.valueNum,
            outOfRange: ["ACR", "PCR", "CaCr_spot", "OxCr_spot", "CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(s.sourceFormulaId) ? p.outOfRange : !!p.outOfRange,
          };
          if (s.sourceFormulaId === "ACR") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator,
            assessment: p.assessment, acrAssessment: p.acrAssessment,
          });
          if (s.sourceFormulaId === "PCR") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator,
            assessment: p.assessment, comparison: p.comparison, pcrAssessment: p.pcrAssessment,
          });
          if (s.sourceFormulaId === "CaCr_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator,
            assessment: p.assessment, comparison: p.comparison, cacrAssessment: p.cacrAssessment,
          });
          if (s.sourceFormulaId === "OxCr_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator, basis: p.basis, originalUnit: p.originalUnit,
            assessment: p.assessment, comparison: p.comparison, oxcrAssessment: p.oxcrAssessment,
          });
          if (s.sourceFormulaId === "FECl_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator, assessment: p.assessment, feclAssessment: p.feclAssessment,
          });
          if (s.sourceFormulaId === "FEHCO3_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator, assessment: p.assessment, fehco3Assessment: p.fehco3Assessment,
          });
          if (s.sourceFormulaId === "FEK_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator, assessment: p.assessment, fekAssessment: p.fekAssessment,
          });
          if (s.sourceFormulaId === "FENa_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, assessment: p.assessment,
            fenaAssessment: p.fenaAssessment,
          });
          if (s.sourceFormulaId === "CitCr_spot") Object.assign(byDate[p.dateISO], {
            displayValue: p.displayValue, comparator: p.comparator, basis: p.basis, originalUnit: p.originalUnit,
            assessment: p.assessment, comparison: p.comparison, citcrAssessment: p.citcrAssessment,
          });
        });
        return {
          label: s.label,
          displayLabel: s.displayLabel || s.label,
          unit: s.unit,
          id: s.id,
          group: s.group,
          sourceFormulaId: s.sourceFormulaId,
          norm: s.norm || "",
          points: s.points,
          trend: seriesTrend(s.points),
          byDate: byDate,
        };
      })
      .sort((a, b) => {
        const ia = dictionaryIndex(a.id);
        const ib = dictionaryIndex(b.id);
        if (ia !== ib) return ia - ib;
        return String(a.label).localeCompare(String(b.label), "pl");
      });
    return { visits: visits, parameters: parameters };
  }

  // Trend KIERUNKOWY, neutralny: strzałka pokazuje kierunek, kolor NIE ocenia
  // „dobrze/źle" (dla eGFR wzrost korzystny, dla wydalania wapnia odwrotnie).
  function seriesTrend(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    if (latest.comparator || prev.comparator) return null;
    const delta = latest.valueNum - prev.valueNum;
    const eps = 1e-9;
    const direction = delta > eps ? "up" : delta < -eps ? "down" : "flat";
    return {
      direction: direction,
      prev: prev.valueNum,
      latest: latest.valueNum,
      delta: delta,
    };
  }

  const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

  function readPatientName() {
    if (!doc) return "";
    const field = doc.getElementById("fullName");
    if (field?.value) return String(field.value).trim();
    const el = doc.getElementById("patientName");
    return el && el.textContent ? el.textContent.trim() : "";
  }

  // ————————————————————————— UI (wstrzykiwane, nie w statycznym HTML) —————————
  let ui = null;
  let refreshQueued = false;

  function measurementInputControls() {
    const formulaId = global.ClcrUiWorkflow?.state.activeFormulaId || doc?.getElementById?.("formulaPicker")?.value || "";
    const spec = global.ClcrUiWorkflow?.getCalculationFieldSpec?.(formulaId);
    if (!doc) return [];
    const candidates = new Map();
    spec?.fields?.forEach(field => {
      if (field.historicalContext || !["number", "text", "textarea"].includes(field.type)) return;
      const control = doc.getElementById(field.id);
      if (control) candidates.set(field.id, control);
    });
    const historical = new Set(PATIENT_FACT_FIELDS);
    const form = doc.getElementById?.("clcrForm");
    Array.from(form?.querySelectorAll?.('input[type="number"][id], input[type="text"][id], textarea[id]') || []).forEach(control => {
      if (!historical.has(control.id) && !["formulaSearch", "U_ACR", "U_PCR"].includes(control.id)) candidates.set(control.id, control);
    });
    return [...candidates.values()].filter(control => !control.readOnly && String(control.value || "").trim() !== "");
  }

  function hasMeasurementInputs() { return measurementInputControls().length > 0; }

  function hasUnsavedMeasurement() {
    const controls = measurementInputControls();
    if (!controls.length) return false;
    const request = currentSaveRequest();
    const covered = new Set();
    const preserved = global.__vildaClcrVersionValueVault || {};
    for (const operation of saveOperations.values()) {
      if (!operation.result?.ok || operation.patientId !== request.patientId || operation.clinicalDateISO !== request.clinicalDateISO) continue;
      for (const output of operation.outputs) {
        const capture = output.dp.capture;
        if (!output.completed || !capture?.values || !capture.fields) continue;
        const matches = Object.entries(capture.values).every(([id, value]) => {
          const control = doc?.getElementById?.(id);
          const current = control ? control.type === "checkbox" ? !!control.checked : String(control.value ?? "") : preserved[id];
          return current != null && String(current) === String(value);
        });
        if (!matches) continue;
        capture.fields.forEach(field => {
          if (!field.historicalContext && ["number", "text", "textarea"].includes(field.type)) covered.add(field.id);
        });
      }
    }
    return controls.some(control => !covered.has(control.id));
  }

  function markRestoredPatientCalculation(patientId = resolveCurrentPatientId()) {
    if (!patientId || patientId !== resolveCurrentPatientId()) return false;
    measurementBlocked = false;
    blockedFromPatientId = null;
    pendingInputOrigins = new WeakMap();
    scheduleRefresh();
    return true;
  }

  function calculationFingerprint(session, spec) {
    if (!session || typeof session !== "object" || !spec?.formulaId) return null;
    const input = { ...session.preservedInputs, ...session.inputs };
    const formula = session.selectedFormula || input.formulaPicker || "";
    if (formula !== spec.formulaId) return null;
    const demographic = new Set(["fullName", "age", "ageMonths", "ageDays", "sex", "weight", "height"]);
    const fields = [...new Set(spec.fieldIds || [])].filter(id => !demographic.has(id)).sort();
    return JSON.stringify([formula, fields.map(id => [id, input[id] == null ? "" : String(input[id])])]);
  }

  function isCurrentSaveReceipt(detail, sourceWindow) {
    return detail?.source === "save" && typeof detail.patientId === "string" && detail.patientId &&
      Number.isSafeInteger(detail.applySequence) && detail.applySequence >= 0 &&
      typeof sourceWindow.VildaDataImportExport?.getApplyLoadedDataSequence === "function" &&
      detail.applySequence === sourceWindow.VildaDataImportExport?.getApplyLoadedDataSequence?.() &&
      sourceWindow.__vildaOstatniWlasnyZapis?.patientId === detail.patientId;
  }

  const observedSiblingWindows = new Set();
  function rememberPendingInputOrigins() {
    if (!hasMeasurementInputs()) { pendingInputOrigins = new WeakMap(); return; }
    for (const sourceWindow of [global, ...observedSiblingWindows]) {
      try {
        const sourceDocument = sourceWindow.document;
        const reader = sourceWindow.VildaDataImportExport;
        if (!sourceDocument || pendingInputOrigins.has(sourceDocument)) continue;
        // Keep an unproven first context unproven. A later reader appearing
        // after another record was loaded is not a receipt for this input.
        let sequence = null;
        try {
          if (typeof reader?.getApplyLoadedDataSequence === "function") sequence = reader.getApplyLoadedDataSequence();
        } catch (_) { /* A failed initial read remains explicitly unproven. */ }
        if (!Number.isSafeInteger(sequence) || sequence < 0) sequence = null;
        pendingInputOrigins.set(sourceDocument, { applySequence:sequence, accountId:accountId(sourceWindow.VildaVault) });
      } catch (_) { /* A replaced or cross-origin frame cannot anchor this input. */ }
    }
  }

  // A successful save in Start may give this same working calculation its
  // first persistent patient ID. The non-bubbling event is observed directly
  // in sibling documents; no clinical data is sent via storage or a channel.
  function acceptSiblingPatientSave(event, sourceWindow) {
    try {
      const detail = event?.detail;
      if (!isCurrentSaveReceipt(detail, sourceWindow)) return;
      const patientId = detail.patientId;
      const sourceVault = sourceWindow.VildaVault;
      if (!vaultUnlocked() || !sourceVault?.isUnlocked?.() || !accountId() || accountId(sourceVault) !== accountId()) return;
      const active = resolveCurrentPatientId();
      if (active && active !== patientId || measurementBlocked && blockedFromPatientId && blockedFromPatientId !== patientId) return;
      if (hasMeasurementInputs()) {
        const origin = pendingInputOrigins.get(sourceWindow.document);
        if (!origin || origin.applySequence !== detail.applySequence || origin.accountId !== accountId(sourceVault)) return;
        const own = global.VildaClcrSessionRuntime?.collectCurrentSession?.();
        const saved = sourceWindow.lastLoadedData?.clcr;
        const spec = global.ClcrUiWorkflow?.getCalculationFieldSpec?.();
        const fingerprint = calculationFingerprint(own, spec);
        if (!fingerprint || fingerprint !== calculationFingerprint(saved, spec)) return;
      }
      state.patientId = patientId;
      state.patientName = typeof detail.name === "string" ? detail.name : "";
      measurementBlocked = false;
      blockedFromPatientId = null;
      invalidatePatientVerification();
      scheduleRefresh();
    } catch (_) { /* Cross-origin or a replaced frame cannot supply a receipt. */ }
  }

  const observedPatientDocuments = new WeakSet();
  function observeSiblingPatientSaves() {
    try {
      const parentDocument = global.parent && global.parent !== global ? global.parent.document : null;
      if (!parentDocument?.querySelectorAll) return;
      parentDocument.querySelectorAll("iframe").forEach(frame => {
        try {
          const sourceWindow = frame.contentWindow, sourceDocument = frame.contentDocument;
          if (!sourceDocument || sourceWindow === global || observedPatientDocuments.has(sourceDocument)) return;
          observedPatientDocuments.add(sourceDocument);
          observedSiblingWindows.add(sourceWindow);
          sourceDocument.addEventListener("vilda:patient-loaded", event => acceptSiblingPatientSave(event, sourceWindow));
        } catch (_) { /* Unavailable sibling. */ }
      });
      rememberPendingInputOrigins();
    } catch (_) { /* Standalone or cross-origin parent. */ }
  }

  function buildPatientContext() {
    if (!doc || doc.getElementById("clcrPatientContext")) return;
    const anchor = doc.getElementById("clcrActivePanel");
    if (!anchor?.parentNode) return;
    const context = doc.createElement("section");
    context.id = "clcrPatientContext";
    context.className = "clcr-patient-context";
    context.setAttribute("aria-label", "Pacjent do zapisu wyniku");
    context.innerHTML = '<div class="clcr-patient-context__copy"><span>Pacjent</span><strong id="clcrPatientContextName"></strong>' +
      '<p id="clcrPatientContextHint" role="status" aria-live="polite"></p></div>' +
      '<button type="button" id="clcrChoosePatientBtn">Wybierz lub utwórz pacjenta</button>';
    anchor.parentNode.insertBefore(context, anchor);
    context.querySelector("#clcrChoosePatientBtn").addEventListener("click", () => {
      choosePatient().catch(error => setStatus(error?.message || "Nie udało się otworzyć listy pacjentów.", "err"));
    });
  }

  function refreshPatientContext(patient) {
    buildPatientContext();
    const name = doc?.getElementById("clcrPatientContextName");
    const hint = doc?.getElementById("clcrPatientContextHint");
    const choose = doc?.getElementById("clcrChoosePatientBtn");
    if (!name || !hint || !choose) return;
    const ready = patient.status === "ready";
    name.textContent = ready ? patient.patientName : "Obliczenie bez zapisanej karty pacjenta";
    hint.textContent = ready ? "Wynik możesz zapisać w Badaniach tego pacjenta."
      : patient.status === "checking" ? "Sprawdzamy zapisaną kartę pacjenta…"
      : patient.status === "missing" || patient.status === "error" ? "Nie potwierdzono zapisanej karty pacjenta. Wybierz ją ponownie przed zapisem wyniku."
      : !vaultUnlocked() ? "Możesz obliczać bez logowania. Aby zapisywać wyniki, zaloguj się i wybierz lub utwórz kartę pacjenta."
      : "Możesz obliczać bez pacjenta. Aby zapisywać wyniki, najpierw wybierz lub utwórz kartę pacjenta.";
    if (measurementBlocked) hint.textContent = "Po zmianie pacjenta rozpocznij nowy pomiar. Wcześniejsze oznaczenia nie zostaną zapisane do innej karty.";
    choose.disabled = !vaultUnlocked();
  }

  function setStatus(message, kind) {
    if (!ui || !ui.status) return;
    ui.status.textContent = message || "";
    ui.status.className = "cvs-status" + (kind ? " cvs-" + kind : "");
  }

  function buildUI() {
    if (!doc || ui) return;
    buildPatientContext();
    const anchor = doc.getElementById("stoneCard") || doc.getElementById("elecCard") || doc.getElementById("results");
    if (!anchor?.parentNode) return;
    const card = doc.createElement("section");
    card.className = "card clcr-visit-save"; card.id = "clcrVisitSaveCard"; card.hidden = true;
    card.innerHTML = '<h2>Zapisz do Badań pacjenta</h2>' +
      '<div class="cvs-patient"><span>Pacjent</span><strong id="clcrVisitPatientName"></strong><small>Karta pacjenta → Badania</small></div>' +
      '<div class="cvs-row"><label class="cvs-date" for="clcrVisitDate">Data badania<input type="date" id="clcrVisitDate" name="clcrVisitDate" required></label>' +
      '<button type="button" id="clcrVisitSaveBtn" class="cvs-btn">Zapisz do Badań pacjenta</button></div>' +
      '<p class="cvs-hint" id="clcrVisitHint"></p><button type="button" id="clcrStartPatientMeasurementBtn" class="cvs-link" hidden>Rozpocznij nowy pomiar</button><p class="cvs-status" id="clcrVisitStatus" role="status" aria-live="polite"></p>' +
      '<button type="button" id="clcrOpenBadaniaBtn" class="cvs-btn cvs-open-badania" hidden>Otwórz Badania →</button>' +
      '<div class="cvs-open-row"><button type="button" id="clcrOpenCardBtn" class="cvs-link" hidden>Karta pacjenta →</button>' +
      '<button type="button" id="clcrOpenHistoryBtn" class="cvs-link" hidden>Historia wyników Klirensu</button></div>';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    ui = { card, date:card.querySelector("#clcrVisitDate"), btn:card.querySelector("#clcrVisitSaveBtn"),
      hint:card.querySelector("#clcrVisitHint"), status:card.querySelector("#clcrVisitStatus"),
      patient:card.querySelector("#clcrVisitPatientName"), openBtn:card.querySelector("#clcrOpenCardBtn"),
      historyBtn:card.querySelector("#clcrOpenHistoryBtn"), badaniaBtn:card.querySelector("#clcrOpenBadaniaBtn"),
      startMeasurement:card.querySelector("#clcrStartPatientMeasurementBtn"), statusKey:null };
    ui.date.value = todayISO();
    ui.btn.addEventListener("click", onSaveClick);
    ui.date.addEventListener("input", scheduleRefresh);
    ui.openBtn.addEventListener("click", () => openPatientCard());
    ui.historyBtn.addEventListener("click", openHistoryCard);
    ui.badaniaBtn.addEventListener("click", () => openPatientCard());
    ui.startMeasurement.addEventListener("click", newMeasurement);
    refresh();
  }

  function currentSaveRequest() { return saveRequest({ clinicalDateISO:ui?.date ? ui.date.value : null }); }
  function refresh() {
    bindVaultEvents();
    rememberPendingInputOrigins();
    if (measurementBlocked && !hasMeasurementInputs()) {
      measurementBlocked = false;
      blockedFromPatientId = null;
    }
    const patient = getPatientSaveState();
    if (patient.patientId && vaultUnlocked()) ensurePersistedPatient();
    refreshPatientContext(patient);
    if (!ui) return;
    const request = currentSaveRequest();
    ui.card.hidden = !request.datapoints.length;
    if (ui.card.hidden) return;
    const unlocked = vaultUnlocked(), patientId = resolveCurrentPatientId();
    const operation = saveOperations.get(request.key);
    const pending = operation?.pending === true, saved = operation?.result?.ok === true;
    ui.patient.textContent = patient.status === "ready" ? patient.patientName : "Pacjent niewybrany";
    ui.btn.disabled = !unlocked || patient.status !== "ready" || measurementBlocked || pending || saved;
    ui.btn.textContent = pending ? "Zapisywanie…" : saved ? "Zapisano w Badaniach" : "Zapisz do Badań pacjenta";
    ui.openBtn.hidden = !unlocked || patient.status !== "ready";
    ui.historyBtn.hidden = !unlocked || patient.status !== "ready";
    ui.badaniaBtn.hidden = !saved || !unlocked || patient.status !== "ready";
    ui.startMeasurement.hidden = !measurementBlocked;
    ui.date.disabled = pending;
    if (ui.statusKey !== request.key) { setStatus(""); ui.statusKey = request.key; }
    ui.hint.textContent = !unlocked ? "Zaloguj się do sejfu, aby zapisać wynik. Liczenie działa bez logowania."
      : !patientId ? "Zapis jest dostępny po wybraniu zapisanej karty pacjenta. Wybór znajdziesz nad formularzem."
      : patient.status === "checking" ? "Sprawdzamy zapisaną kartę pacjenta…"
      : patient.status !== "ready" ? "Nie potwierdzono zapisanej karty pacjenta. Wybierz ją ponownie przed zapisem."
      : measurementBlocked ? "Rozpocznij nowy pomiar dla wybranego pacjenta. Dotychczasowy wynik pozostaje niezapisany."
      : "Do zapisu: " + request.datapoints.length + " " + (request.datapoints.length === 1 ? "wynik" : request.datapoints.length < 5 ? "wyniki" : "wyników") + ".";
    ui.hint.hidden = saved;
  }

  function scheduleRefresh() {
    if (refreshQueued || !ui) return;
    refreshQueued = true;
    const run = function () {
      refreshQueued = false;
      refresh();
    };
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  async function onSaveClick() {
    if (!ui || ui.btn.disabled) return;
    if (!resolveCurrentPatientId()) return;
    if (ui.date?.reportValidity && !ui.date.reportValidity()) return;
    const request = currentSaveRequest();
    ui.statusKey = request.key;
    const pending = saveActiveResultToCard(request);
    const operation = currentOperation;
    setStatus("Zapisywanie do Badań pacjenta…", "pending"); refresh();
    let result;
    try { result = await pending; } catch (error) { result = { ok:false, reason:"error", saved:0, total:request.datapoints.length, errors:[{message:error?.message || String(error)}] }; }
    if (currentSaveRequest().key !== request.key || currentOperation !== operation) { refresh(); scheduleHistoryRefresh(); return; }
    if (result.ok) setStatus("Zapisano w Badaniach: " + (result.patientName || "wybrany pacjent") + " · " + formatDateShort(result.clinicalDateISO) + ".", "ok");
    else if (result.reason === "no-patient") setStatus("Wybierz pacjenta przed zapisem.", "err");
    else if (["patient-unavailable", "patient-mismatch", "context-changed", "patient-context"].includes(result.reason)) setStatus("Nie zapisano wyniku. Sprawdź wybraną kartę pacjenta; wpisane dane pozostały w formularzu.", "err");
    else if (result.reason === "locked") setStatus("Sejf jest zablokowany. Odblokuj go i ponów zapis.", "err");
    else if (result.reason === "invalid-date") setStatus("Wpisz datę badania.", "err");
    else if (result.reason === "no-data") setStatus("Brak poprawnego wyniku do zapisania.", "err");
    else setStatus((result.saved ? "Zapisano " + result.saved + " z " + result.total + " wyników. " : "Nie zapisano wyniku. ") + (result.errors?.[0]?.message || "Ponów zapis."), result.saved ? "warn" : "err");
    refresh(); scheduleHistoryRefresh();
  }

  // Both patient views use the same immutable projection and renderer.
  let historyQueued = false;
  let historyGeneration = 0;
  async function refreshActiveHistory() {
    if (patientCardUi && !patientCardUi.overlay.hidden) await refreshHistoryCard();
  }
  function scheduleHistoryRefresh() {
    if (historyQueued || !patientCardUi || patientCardUi.overlay.hidden) return;
    historyQueued = true;
    const run = () => { historyQueued = false; refreshActiveHistory(); };
    if (typeof global.requestAnimationFrame === "function") global.requestAnimationFrame(run);
    else global.setTimeout(run, 0);
  }

  // ————————————————————————— Faza 3: Karta pacjenta (flowsheet) ————————————
  let patientCardUi = null;

  function formatDateShort(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return String(iso || "");
    return m[3] + "." + m[2] + "." + m[1].slice(2);
  }

  function closePatientCard() {
    historyGeneration += 1;
    if (patientCardUi) {
      if (patientCardUi.overlay.open && typeof patientCardUi.overlay.close === "function") patientCardUi.overlay.close();
      patientCardUi.overlay.hidden = true;
      patientCardUi.opener?.focus?.();
    }
    doc?.documentElement?.classList.remove("clcr-card-open");
  }

  function buildPatientCardUI() {
    if (!doc || patientCardUi || typeof doc.createElement !== "function") return;
    const overlay = doc.createElement("dialog");
    overlay.className = "clcr-patient-card"; overlay.id = "clcrPatientCard"; overlay.hidden = true;
    overlay.setAttribute("aria-label", "Historia wyników Klirensu");
    overlay.innerHTML = '<div class="cpc-inner"><div class="cpc-head"><div class="cpc-id">' +
      '<span class="cpc-kick">Karta pacjenta</span><h2>Historia wyników Klirensu</h2><strong class="cpc-name" id="cpcName"></strong><span class="cpc-sub" id="cpcSub"></span></div>' +
      '<div class="cpc-acts"><button type="button" class="cpc-btn" id="cpcNew">＋ Nowy pomiar</button><button type="button" class="cpc-btn cpc-ghost" id="cpcClose">Zamknij</button></div></div>' +
      '<div class="cpc-body" id="cpcBody"></div><button type="button" class="cvs-link" id="cpcReload" hidden>Spróbuj ponownie</button></div>';
    (doc.body || doc.documentElement).appendChild(overlay);
    patientCardUi = { overlay, name:overlay.querySelector("#cpcName"), sub:overlay.querySelector("#cpcSub"), body:overlay.querySelector("#cpcBody"), retry:overlay.querySelector("#cpcReload"), renderer:null, opener:null };
    overlay.querySelector("#cpcClose").addEventListener("click", closePatientCard);
    overlay.querySelector("#cpcNew").addEventListener("click", newMeasurement);
    patientCardUi.retry.addEventListener("click", refreshHistoryCard);
    overlay.addEventListener("click", event => { if (event.target === overlay) closePatientCard(); });
    overlay.addEventListener("cancel", event => { event.preventDefault(); closePatientCard(); });
  }

  function invalidateSavedNote(noteId) {
    if (!noteId) return;
    for (const [key, operation] of saveOperations) {
      if (!operation.pending && operation.result?.ok === true && operation.outputs.some(output => output.id === noteId)) {
        saveOperations.delete(key);
        if (currentOperation === operation) currentOperation = null;
        if (ui?.statusKey === key) { ui.statusKey = null; setStatus(""); }
      }
    }
  }

  async function refreshHistoryCard() {
    if (!patientCardUi || patientCardUi.overlay.hidden) return;
    const patientId = resolveCurrentPatientId();
    if (!patientId || !vaultUnlocked()) { closePatientCard(); return; }
    const generation = ++historyGeneration;
    const v = vault();
    patientCardUi.retry.hidden = true;
    try {
      const [notes, patient] = await Promise.all([
        v.listPatientNotesForPatient(patientId),
        typeof v.getPatient === "function" ? Promise.resolve(v.getPatient(patientId)).catch(() => null) : Promise.resolve(null),
      ]);
      if (generation !== historyGeneration || patientId !== resolveCurrentPatientId() || !vaultUnlocked() || patientCardUi.overlay.hidden) return;
      const projection = global.ClcrSavedResults.projectPatientNotes(notes, { patientId });
      patientCardUi.name.textContent = state.patientName || patient?.header?.name || readPatientName() || "Pacjent";
      const count = projection.measurements.length;
      patientCardUi.sub.textContent = [demographicsText(patient?.header || {}), count + " " + (count === 1 ? "pomiar" : count < 5 ? "pomiary" : "pomiarów")].filter(Boolean).join(" · ");
      patientCardUi.renderer?.destroy?.();
      patientCardUi.renderer = global.ClcrSavedResultsView.render(patientCardUi.body, {
        projection, view:"table", onSelect:record => global.ClcrResultDetails?.open({
          patientId, noteId:record.noteId || record.id, record, vault:v,
          onChanged:() => { invalidateSavedNote(record.noteId || record.id); refresh(); scheduleHistoryRefresh(); },
        }),
      });
    } catch (_) {
      if (generation !== historyGeneration || patientCardUi.overlay.hidden) return;
      patientCardUi.body.textContent = "Nie udało się wczytać historii wyników.";
      patientCardUi.retry.hidden = false;
    }
  }

  async function openHistoryCard() {
    if (!doc || !vaultUnlocked() || !resolveCurrentPatientId()) return;
    buildPatientCardUI();
    patientCardUi.opener = doc.activeElement;
    patientCardUi.name.textContent = state.patientName || readPatientName() || "Pacjent";
    patientCardUi.sub.textContent = "";
    patientCardUi.renderer?.destroy?.(); patientCardUi.renderer = null;
    patientCardUi.body.textContent = "Wczytywanie…";
    patientCardUi.overlay.hidden = false;
    if (typeof patientCardUi.overlay.showModal === "function") patientCardUi.overlay.showModal();
    doc.documentElement?.classList.add("clcr-card-open");
    await refreshHistoryCard();
  }

  function shellApi() {
    try { if (typeof global.VildaShell?.openPatientCardInStart === "function") return global.VildaShell; } catch (_) { /* standalone */ }
    try { if (global.parent && global.parent !== global && typeof global.parent.VildaShell?.openPatientCardInStart === "function") return global.parent.VildaShell; } catch (_) { /* cross-origin parent */ }
    return null;
  }
  async function openPatientCard(patientId = resolveCurrentPatientId()) {
    if (!patientId || !vaultUnlocked()) return false;
    const shell = shellApi();
    if (shell) { await shell.openPatientCardInStart(patientId, { activeTab:"lab" }); return true; }
    try {
      await global.VildaSession?.ensureAuthLoaded?.();
      if (typeof global.VildaAuthUI?.showPatientCard !== "function") throw new Error("Karta pacjenta jest niedostępna.");
      await global.VildaAuthUI.showPatientCard(patientId, null, null, { activeTab:"lab" });
      return true;
    } catch (error) { setStatus(error?.message || "Nie udało się otworzyć Badań pacjenta.", "err"); return false; }
  }
  async function choosePatient() {
    const shell = shellApi();
    if (typeof shell?.openPatientsInStart === "function") { await shell.openPatientsInStart(); return; }
    await global.VildaSession?.ensureAuthLoaded?.();
    if (typeof global.VildaAuthUI?.showPatientsList !== "function" || typeof global.applyLoadedData !== "function") throw new Error("Lista pacjentów jest niedostępna. Odśwież aplikację.");
    global.VildaAuthUI.showPatientsList(data => { if (data) global.applyLoadedData(data); });
  }

  const PATIENT_FACT_FIELDS = ["fullName", "age", "ageMonths", "ageDays", "neonatalTermStatus", "sex", "weight", "height", "ScrAssay", "creatinineState", "suspectedAKI", "CrCysStandardizationConfirmed", "CystatinCStandardization", "CystatinCAssayMethod", "spotKnownCKD", "spotDiureticUse", "stoneThiolTherapy", "stoneKnownCystinuria"];
  function newMeasurement() {
    closePatientCard();
    const formulaId = global.ClcrUiWorkflow?.state.activeFormulaId || doc?.getElementById("formulaPicker")?.value || "";
    const preserved = new Map();
    const form = doc?.getElementById("clcrForm");
    if (!form) return;
    const keep = new Set(PATIENT_FACT_FIELDS);
    form.querySelectorAll("select[id]").forEach(control => {
      if (/unit/i.test(control.id) || /_entry_mode$/.test(control.id)) keep.add(control.id);
    });
    [...keep].forEach(id => {
      const control = doc.getElementById(id);
      if (control) preserved.set(id, control.type === "checkbox" ? !!control.checked : control.value);
      const answer = doc.getElementById(`ui_${id}_answer`);
      if (answer) preserved.set(answer.id, answer.value);
    });
    global.clcrClearVersionValueVault?.();
    global.clcrSamePatientAggregator?.reset?.();
    if (typeof global.resetApp === "function") global.resetApp(true);
    else form.reset?.();
    for (const [id,value] of preserved) {
      const control = doc.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
    }
    saveOperations.clear(); currentOperation = null;
    measurementBlocked = false;
    blockedFromPatientId = null;
    pendingInputOrigins = new WeakMap();
    if (ui?.date) ui.date.value = todayISO();
    if (ui) { ui.statusKey = null; setStatus(""); }
    global.ClcrUiWorkflow?.refresh?.();
    global.clcrCaptureVersionValues?.({ force:true, reason:"new-measurement" });
    global.clcrUpdate?.();
    global.clcrSaveSessionNow?.({ force:true, reason:"new-measurement" });
    refresh();
    const spec = global.ClcrUiWorkflow?.getCalculationFieldSpec?.(formulaId);
    const field = spec?.fields.find(item => !item.historicalContext && ["number", "text"].includes(item.type) && !/_entry_mode$/.test(item.id)) || spec?.fields.find(item => !item.historicalContext && item.unitFieldId);
    const focus = field && doc.getElementById(field.id);
    focus?.focus?.();
  }

  function yearWord(n) {
    const y = Math.round(n);
    const a = y % 100;
    const l = y % 10;
    if (y === 1) return "rok";
    if (l >= 2 && l <= 4 && (a < 12 || a > 14)) return "lata";
    return "lat";
  }

  function demographicsText(header) {
    const parts = [];
    if (typeof header.age === "number" && isFinite(header.age) && header.age > 0) {
      parts.push(header.age + " " + yearWord(header.age));
    }
    if (typeof header.sex === "string") {
      const s = header.sex.toLowerCase();
      if (header.sex === "M" || s === "male" || s === "m") parts.push("mężczyzna");
      else if (header.sex === "F" || s === "female" || s === "f" || s === "k")
        parts.push("kobieta");
    }
    return parts.join(" · ");
  }

  function observeResults() {
    if (!doc || typeof global.MutationObserver !== "function") return;
    const ids = [
      "results",
      "clcrInfo",
      "elecInfo",
      "stoneInfo",
      "ktvResult",
      "ektvResult",
      "urrResult",
    ];
    const obs = new global.MutationObserver(function () {
      scheduleRefresh();
      scheduleHistoryRefresh();
    });
    for (let i = 0; i < ids.length; i += 1) {
      const el = doc.getElementById(ids[i]);
      if (el) {
        obs.observe(el, { childList: true, subtree: true, attributes: true });
      }
    }
  }

  function onPatientLoaded(event) {
    const detail = event && event.detail ? event.detail : null;
    const id = detail && detail.patientId;
    if (detail?.source === "save" && !isCurrentSaveReceipt(detail, global)) return;
    const origin = pendingInputOrigins.get(doc);
    const ownWorkingSave = detail?.source === "save" && vaultUnlocked() && (!hasMeasurementInputs() ||
      origin && origin.applySequence === detail.applySequence && !!accountId() && origin.accountId === accountId());
    if (ownWorkingSave && (!state.patientId || id === state.patientId) &&
        (!measurementBlocked || !blockedFromPatientId || id === blockedFromPatientId)) {
      measurementBlocked = false;
      blockedFromPatientId = null;
    } else if (id && hasMeasurementInputs() && (id !== state.patientId || hasUnsavedMeasurement())) {
      if (!measurementBlocked) blockedFromPatientId = state.patientId;
      measurementBlocked = true;
    }
    invalidatePatientVerification();
    if (id !== state.patientId) { verificationGeneration += 1; closePatientCard(); }
    if (typeof id === "string" && id) {
      state.patientId = id;
      state.patientName =
        (detail && typeof detail.patientName === "string"
          ? detail.patientName
          : "") || readPatientName();
    }
    else if (detail && Object.hasOwn(detail, "patientId")) { state.patientId = null; state.patientName = ""; }
    refresh();
    scheduleHistoryRefresh();
  }

  /* P-PRZEJECIE-MODULY (2026-10-06): panel powłoki app.html przejmuje pacjenta wczytanego w innej
   * ramce w vildaPersistRestoreAll (P-POWLOKA-ID) — bez vilda:patient-loaded, które dostaje tylko
   * ramka wczytująca. Cel zapisu „do karty” zostawał wtedy przy poprzednim pacjencie, a formularz
   * pokazywał już nowego: wyniki pacjenta C trafiałyby jako notatki do karty A. Po odtworzeniu
   * wspólnego stanu cel zapisu to pacjent sesji karty; sesja bez pacjenta zdejmuje cel. */
  function sessionPatientId() {
    try {
      if (!global.sessionStorage) return undefined;
      const id = global.sessionStorage.getItem("vildaCurrentPatientId");
      return typeof id === "string" && id ? id : null;
    } catch (e) {
      return undefined; // brak dostępu do sesji karty — nic nie zmieniamy
    }
  }

  function onSharedStateRestored(options = {}) {
    const id = sessionPatientId();
    if (id === undefined || id === state.patientId) return;
    if (!options.initial && hasMeasurementInputs()) {
      if (!measurementBlocked) blockedFromPatientId = state.patientId;
      measurementBlocked = true;
    }
    invalidatePatientVerification();
    verificationGeneration += 1;
    closePatientCard();
    state.patientId = id;
    state.patientName = id ? readPatientName() : "";
    refresh();
    scheduleHistoryRefresh();
  }

  function init() {
    buildUI();
    buildPatientCardUI();
    observeResults();
    bindVaultEvents();
    onSharedStateRestored({ initial:true });
    observeSiblingPatientSaves();
    try {
      if (global.parent && global.parent !== global) global.parent.document.addEventListener("load", observeSiblingPatientSaves, true);
    } catch (_) { /* Standalone or cross-origin parent. */ }
    if (doc) {
      const form = doc.getElementById?.("clcrForm");
      form?.addEventListener?.("input", rememberPendingInputOrigins);
      form?.addEventListener?.("change", rememberPendingInputOrigins);
      doc.addEventListener("vilda:patient-loaded", onPatientLoaded);
      doc.addEventListener("vilda:persist-restored", onSharedStateRestored);
      doc.addEventListener("vilda:clcr-results-changed", event => notifyRecordChanged(event.detail));
      if (global.addEventListener) {
        global.addEventListener("focus", () => { observeSiblingPatientSaves(); notifyPatientRecordChanged(); verifySavedOperations(); });
        global.addEventListener("storage", event => {
          if (event.key === "vilda-note-changed-ping-v1") notifyRecordChanged();
        });
      }
      if (typeof global.BroadcastChannel === "function") {
        const channel = new global.BroadcastChannel("vilda-notes");
        channel.addEventListener("message", event => { if (event.data?.type === "note-changed") notifyRecordChanged(); });
      }
    }
  }

  let observedVault = null;
  let unsubscribeNotes = null;
  let unsubscribeLock = null;
  let unsubscribePatientEvents = [];
  async function verifySavedOperations() {
    const generation = ++verificationGeneration;
    const v = vault(), patientId = resolveCurrentPatientId();
    const userId = v?.getCurrentUser?.()?.userId || null;
    if (!patientId || !vaultUnlocked() || typeof v?.getPatientNote !== "function") return;
    const confirmed = [...saveOperations.values()].filter(operation => operation.patientId === patientId && !operation.pending && operation.result?.ok === true);
    const checks = await Promise.all(confirmed.flatMap(operation => operation.outputs.map(async output => {
      try { return { operation, output, note:await v.getPatientNote(output.id), readable:true }; }
      catch (_) { return { readable:false }; }
    })));
    if (generation !== verificationGeneration || v !== vault() || patientId !== resolveCurrentPatientId() || !vaultUnlocked() || userId !== (v.getCurrentUser?.()?.userId || null)) return;
    for (const check of checks) {
      if (!check.readable || check.operation.pending || check.operation.result?.ok !== true || saveOperations.get(check.operation.key) !== check.operation) continue;
      if (!check.note || !sameSavedPayload(check.note, check.output.payload)) invalidateSavedNote(check.output.id);
    }
    scheduleRefresh();
  }
  function notifyRecordChanged(event) {
    const noteId = event?.noteId || event?.id || event?.note?.id;
    if (noteId) invalidateSavedNote(noteId);
    const verifying = noteId ? null : verifySavedOperations();
    if (!event?.patientId || event.patientId === resolveCurrentPatientId()) { scheduleRefresh(); scheduleHistoryRefresh(); }
    return verifying;
  }
  function bindVaultEvents() {
    const current = vault();
    if (!current || observedVault === current) return;
    unsubscribeNotes?.(); unsubscribeLock?.();
    unsubscribePatientEvents.forEach(unsubscribe => unsubscribe?.());
    unsubscribePatientEvents = [];
    observedVault = current;
    invalidatePatientVerification();
    unsubscribeNotes = typeof current.onPatientNoteChanged === "function" ? current.onPatientNoteChanged(notifyRecordChanged) : null;
    unsubscribeLock = typeof current.onLock === "function" ? current.onLock(() => { verificationGeneration += 1; vaultSessionEpoch += 1; invalidatePatientVerification(); closePatientCard(); scheduleRefresh(); }) : null;
    ["onPatientSaved", "onPatientDeleted", "onUnlock"].forEach(name => {
      if (typeof current[name] === "function") unsubscribePatientEvents.push(current[name](notifyPatientRecordChanged));
    });
  }

  const api = {
    vaultUnlocked: vaultUnlocked,
    resolveCurrentPatientId: resolveCurrentPatientId,
    collectActiveDatapoints: collectActiveDatapoints,
    mapDatapoint: mapDatapoint,
    saveActiveResultToCard: saveActiveResultToCard,
    buildPatientNotePayload, createSaveOperation, captureCalculationFields,
    notifyRecordChanged,
    getPatientSaveState, ensurePersistedPatient, notifyPatientRecordChanged,
    hasUnsavedMeasurement, markRestoredPatientCalculation,
    buildSeriesFromNotes: buildSeriesFromNotes,
    readActiveSeries: readActiveSeries,
    readPatientFlowsheet: readPatientFlowsheet,
    seriesTrend: seriesTrend,
    refreshActiveHistory: refreshActiveHistory,
    openPatientCard: openPatientCard,
    openHistoryCard, newMeasurement,
    closePatientCard: closePatientCard,
    formatValueString: formatValueString,
    todayISO: todayISO,
    normalizeDateISO: normalizeDateISO,
    seriesWord: seriesWord,
    // testowe / introspekcja
    _setPatientId: function (id) {
      invalidatePatientVerification();
      state.patientId = typeof id === "string" && id ? id : null;
    },
    _refresh: refresh,
  };

  global.ClcrVisitSave = api;

  if (doc && typeof doc.addEventListener === "function") {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

/* ————————————————————————————————————————————————————————————————————————
 * Faza 5 — chip pacjenta + zwijany blok tożsamości (Wariant C).
 *
 * Warstwa PREZENTACJI nad istniejącym #patientSet — ZERO zmian w matematyce
 * silnika i w potoku podstawiania danych (applyLoadedData / userData.js /
 * applyClcrSessionSnapshot nadal wypełniają pola). Moduł:
 *   • pokazuje chip pacjenta (avatar + nazwisko + wiek·płeć) zamiast pola
 *     „Imię i nazwisko", ze skrótami: wiek (granularny), wzrost, masa+data;
 *   • zwija pola tożsamości do chipa, gdy wczytano pacjenta z karty
 *     (rozwinięcie na żądanie: „Dane pacjenta ▾");
 *   • przy pacjencie z karty pokazuje datę ostatniego pomiaru masy i sam
 *     stempluje „dziś", gdy lekarz wpisze nową masę — BEZ osobnego
 *     potwierdzania (decyzja Macieja 02.08.2026);
 *   • w trybie gościa / bez pacjenta NIE ingeruje — #patientSet w pełni widoczny
 *     (dzięki temu obliczenia anonimowe i istniejące testy działają bez zmian).
 * ———————————————————————————————————————————————————————————————————————— */
(function (global) {
  "use strict";
  const doc = global.document;
  if (!doc) return;

  const COLLAPSE_CLASS = "clcr-ident-collapsed";
  const SYNC_FIELDS = [
    "age",
    "ageMonths",
    "ageDays",
    "neonatalTermStatus",
    "sex",
    "height",
    "weight",
  ];

  const st = {
    built: false,
    currentName: "",
    lastWeightDateISO: null, // data ostatniego pomiaru masy (z ostatniego snapshotu)
    weightTouched: false, // lekarz wpisał nową masę na tej wizycie → „dziś"
    lastPatientId: null,
  };

  function vault() {
    return global.VildaVault && typeof global.VildaVault === "object"
      ? global.VildaVault
      : null;
  }
  function vaultUnlocked() {
    try {
      const v = vault();
      return !!(v && typeof v.isUnlocked === "function" && v.isUnlocked());
    } catch (e) {
      return false;
    }
  }
  function isGuest() {
    try {
      return !!(
        global.VildaSession &&
        typeof global.VildaSession.isGuestMode === "function" &&
        global.VildaSession.isGuestMode()
      );
    } catch (e) {
      return false;
    }
  }
  function patientId() {
    try {
      const api = global.ClcrVisitSave;
      return (
        (api && typeof api.resolveCurrentPatientId === "function"
          ? api.resolveCurrentPatientId()
          : null) || null
      );
    } catch (e) {
      return null;
    }
  }
  function hasPatient() {
    return vaultUnlocked() && !isGuest() && !!patientId();
  }
  function todayISO() {
    try {
      const api = global.ClcrVisitSave;
      if (api && typeof api.todayISO === "function") return api.todayISO();
    } catch (e) {
      /* fall through */
    }
    try {
      const d = new Date();
      return new Date(d.getTime() - d.getTimezoneOffset() * 6e4)
        .toISOString()
        .slice(0, 10);
    } catch (e) {
      return "";
    }
  }

  function el(id) {
    return doc.getElementById(id);
  }
  function fieldStr(id) {
    const e = el(id);
    return e && e.value != null ? String(e.value).trim() : "";
  }
  function fieldNum(id) {
    const s = fieldStr(id);
    if (s === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtNum(n) {
    if (n == null || !Number.isFinite(n)) return "";
    return Number.isInteger(n)
      ? String(n)
      : String(Number(n.toFixed(2))).replace(".", ",");
  }
  function fmtDatePl(iso) {
    if (!iso || typeof iso !== "string") return "";
    const m = iso.slice(0, 10).split("-");
    if (m.length !== 3) return "";
    return m[2] + "." + m[1] + "." + m[0];
  }
  function yearWord(y) {
    y = Math.round(y);
    const a = y % 100;
    const l = y % 10;
    if (y === 1) return "rok";
    if (l >= 2 && l <= 4 && (a < 12 || a > 14)) return "lata";
    return "lat";
  }
  function dayWord(d) {
    d = Math.round(d);
    return d === 1 ? "dzień" : "dni";
  }

  // Wiek z dokładnością wynikającą z wprowadzonych pól:
  //  • noworodek (0 lat, 0 mies., dni > 0) → „14 dni · donoszony/wcześniak"
  //  • niemowlę (0 lat, mies. > 0)         → „8 mies."
  //  • dziecko/dorosły z miesiącami        → „10 lat 3 mies."
  //  • dorosły                             → „54 lata"
  function ageString() {
    const y = fieldNum("age");
    const mo = fieldNum("ageMonths");
    const d = fieldNum("ageDays");
    if ((y === 0 || y == null) && (mo === 0 || mo == null) && d != null && d > 0) {
      const term = fieldStr("neonatalTermStatus");
      const t =
        term === "term" ? " · donoszony" : term === "preterm" ? " · wcześniak" : "";
      return d + " " + dayWord(d) + t;
    }
    if ((y === 0 || y == null) && mo != null && mo > 0) {
      return mo + " mies.";
    }
    if (y != null) {
      let base = y + " " + yearWord(y);
      if (mo != null && mo > 0) base += " " + mo + " mies.";
      return base;
    }
    return "";
  }
  function sexWord() {
    const s = fieldStr("sex");
    if (s === "M") return "mężczyzna";
    if (s === "F") return "kobieta";
    return "";
  }
  function readName() {
    if (st.currentName) return st.currentName;
    const h = el("patientName");
    if (h && h.textContent && h.textContent.trim()) return h.textContent.trim();
    const fn = el("fullName");
    if (fn && fn.value && fn.value.trim()) return fn.value.trim();
    return "";
  }
  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "•";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function card() {
    return doc.querySelector(".patient-card");
  }
  function isCollapsed() {
    const c = card();
    return !!(c && c.classList.contains(COLLAPSE_CLASS));
  }
  function setCollapsed(collapsed) {
    const c = card();
    if (!c) return;
    c.classList.toggle(COLLAPSE_CLASS, !!collapsed);
    renderBar();
  }

  function buildBar() {
    if (st.built) return;
    const c = card();
    const set = el("patientSet");
    if (!c || !set) return;
    const bar = doc.createElement("div");
    bar.id = "clcrIdentityBar";
    bar.className = "clcr-ident-bar";
    bar.hidden = true;
    c.insertBefore(bar, set);
    bar.addEventListener("click", function (e) {
      const t = e.target.closest("[data-ident-act]");
      if (!t) return;
      if (t.getAttribute("data-ident-act") === "toggle") {
        setCollapsed(!isCollapsed());
      }
    });
    st.built = true;
  }

  function renderBar() {
    if (!st.built) buildBar();
    const bar = el("clcrIdentityBar");
    const c = card();
    if (!bar || !c) return;
    if (!hasPatient()) {
      bar.hidden = true;
      c.classList.remove(COLLAPSE_CLASS);
      return;
    }
    bar.hidden = false;
    const collapsed = isCollapsed();
    const name = readName() || "Pacjent";
    const age = ageString();
    const sx = sexWord();
    const sub = [age, sx].filter(Boolean).join(" · ");

    let badges = "";
    if (collapsed) {
      const h = fieldNum("height");
      const w = fieldNum("weight");
      const b = [];
      if (age) b.push('<span class="clcr-ident-badge">' + esc(age) + "</span>");
      if (h != null)
        b.push('<span class="clcr-ident-badge">' + esc(fmtNum(h)) + " cm</span>");
      if (w != null) {
        const dtxt = st.weightTouched
          ? "dziś"
          : st.lastWeightDateISO
            ? fmtDatePl(st.lastWeightDateISO)
            : "";
        b.push(
          '<span class="clcr-ident-badge clcr-ident-badge--mass">Masa ' +
            esc(fmtNum(w)) +
            " kg" +
            (dtxt ? " · " + esc(dtxt) : "") +
            "</span>",
        );
      }
      if (b.length) badges = '<div class="clcr-ident-badges">' + b.join("") + "</div>";
    }
    const toggleLabel = collapsed ? "Dane pacjenta ▾" : "Zwiń ▲";
    bar.innerHTML =
      '<div class="clcr-ident-id">' +
      '<span class="clcr-ident-avatar">' +
      esc(initials(name)) +
      "</span>" +
      '<span class="clcr-ident-who">' +
      '<span class="clcr-ident-name">' +
      esc(name) +
      "</span>" +
      (sub ? '<span class="clcr-ident-sub">' + esc(sub) + "</span>" : "") +
      "</span></div>" +
      badges +
      '<button type="button" class="clcr-ident-toggle" data-ident-act="toggle">' +
      toggleLabel +
      "</button>";
  }

  // Notka daty pomiaru masy pod polem #weight (w rozwiniętym panelu).
  function renderWeightNote() {
    const w = el("weight");
    if (!w) return;
    let note = el("clcrWeightMeasuredNote");
    if (!hasPatient()) {
      if (note) note.hidden = true;
      return;
    }
    if (!note) {
      note = doc.createElement("span");
      note.id = "clcrWeightMeasuredNote";
      note.className = "clcr-weight-note";
      if (w.parentNode) w.parentNode.insertBefore(note, w.nextSibling);
    }
    note.hidden = false;
    if (st.weightTouched) {
      note.textContent = "nowy pomiar: dziś " + fmtDatePl(todayISO());
      note.classList.add("fresh");
    } else if (st.lastWeightDateISO) {
      note.textContent =
        "ostatni pomiar: " +
        fmtDatePl(st.lastWeightDateISO) +
        " — nadpisz, jeśli pacjent był ważony dziś.";
      note.classList.remove("fresh");
    } else {
      note.textContent = "podaj masę zmierzoną na tej wizycie.";
      note.classList.remove("fresh");
    }
  }

  function renderAll() {
    renderBar();
    renderWeightNote();
  }

  // Odczyt daty ostatniego pomiaru masy z ostatniego snapshotu pacjenta.
  async function loadWeightDate() {
    st.lastWeightDateISO = null;
    const pid = patientId();
    const v = vault();
    if (!pid || !v || typeof v.getPatient !== "function") return;
    try {
      const p = await v.getPatient(pid);
      const snap = p && Array.isArray(p.snapshots) ? p.snapshots[0] : null;
      const user = snap && snap.payload ? snap.payload.user : null;
      if (user && typeof user.measuredAtISO === "string" && user.measuredAtISO) {
        st.lastWeightDateISO = user.measuredAtISO;
      } else if (snap && typeof snap.savedAtISO === "string" && snap.savedAtISO) {
        st.lastWeightDateISO = snap.savedAtISO;
      }
    } catch (e) {
      /* brak daty — chip pokaże masę bez daty */
    }
    renderAll();
  }

  let renderTimers = [];
  function scheduleRenders() {
    renderTimers.forEach((t) => global.clearTimeout(t));
    renderTimers = [0, 80, 400].map((ms) => global.setTimeout(renderAll, ms));
  }

  function onPatientLoaded(event) {
    const detail = event && event.detail ? event.detail : null;
    st.currentName =
      detail && typeof detail.name === "string" && detail.name.trim()
        ? detail.name.trim()
        : "";
    const pid = patientId();
    // Nowy pacjent → reset stempla masy i domyślne zwinięcie (Wariant C).
    if (pid !== st.lastPatientId) {
      st.weightTouched = false;
      st.lastPatientId = pid;
    }
    if (hasPatient()) {
      setCollapsed(true);
      loadWeightDate();
    }
    scheduleRenders();
  }

  /* P-PRZEJECIE-MODULY: po przejęciu pacjenta z sesji karty (wyżej, ClcrVisitSave) chip bierze
   * nazwę z formularza, a data masy — z rekordu nowego pacjenta. Po ClcrVisitSave, bo stąd
   * czytamy jego cel zapisu. */
  function onSharedStateRestored() {
    global.setTimeout(function () {
      const pid = patientId();
      if (pid === st.lastPatientId) return;
      st.currentName = "";
      st.weightTouched = false;
      st.lastPatientId = pid;
      st.lastWeightDateISO = null;
      if (hasPatient()) {
        setCollapsed(true);
        loadWeightDate();
      }
      scheduleRenders();
    }, 0);
  }

  function onFieldInput(e) {
    const t = e && e.target;
    if (!t || !t.id) return;
    if (t.id === "weight") {
      // tylko realna edycja lekarza stempluje „dziś" (nie programowe podstawienie)
      if (e.isTrusted && String(t.value).trim() !== "") {
        st.weightTouched = true;
      }
    }
    if (SYNC_FIELDS.indexOf(t.id) !== -1) renderAll();
  }

  function init() {
    buildBar();
    const set = el("patientSet");
    if (set) {
      set.addEventListener("input", onFieldInput);
      set.addEventListener("change", onFieldInput);
    }
    doc.addEventListener("vilda:patient-loaded", onPatientLoaded);
    doc.addEventListener("vilda:persist-restored", onSharedStateRestored);
    // Pacjent mógł zostać wczytany przed inicjalizacją (odtworzenie sesji).
    if (hasPatient()) {
      setCollapsed(true);
      loadWeightDate();
    }
    scheduleRenders();
  }

  const api = {
    renderBar: renderBar,
    renderWeightNote: renderWeightNote,
    ageString: ageString,
    setCollapsed: setCollapsed,
    isCollapsed: isCollapsed,
    _state: st,
  };
  global.ClcrIdentity = api;

  if (typeof doc.addEventListener === "function") {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

/* Jeden wynik: oryginalne węzły silnika pozostają źródłem liczby, zapisu
 * i raportów. Układ przenosi je do panelu obok formularza, bez kopii liczby. */
(function (global) {
  "use strict";
  const doc = global.document;
  if (!doc) return;
  const RESULT_IDS = ["results", "clcrInfo", "elecInfo", "stoneInfo", "ktvResult", "ektvResult", "urrResult"];
  let rail = null;
  let reportSection = null;
  let reportActions = null;
  let built = false;
  let refreshTimer = null;

  function el(id) { return doc.getElementById(id); }
  function workflowActive() { return doc.documentElement?.dataset.clcrWorkflowUi === "1"; }
  function activeFormulaId() { return global.ClcrUiWorkflow?.state.activeFormulaId || ""; }

  function build() {
    if (built) return;
    const container = doc.querySelector(".container");
    const form = el("clcrForm");
    if (!container || !form || form.parentNode !== container) return;
    const workspace = doc.createElement("div");
    workspace.id = "clcrWorkspace";
    workspace.className = "clcr-workspace";
    doc.documentElement.dataset.clcrLayout = "single-result";
    container.insertBefore(workspace, form);
    workspace.appendChild(form);

    rail = doc.createElement("section");
    rail.id = "clcrResultRail";
    rail.className = "clcr-result-rail";
    rail.setAttribute("aria-labelledby", "clcrResultTitle");
    workspace.appendChild(rail);

    reportSection = doc.createElement("div");
    reportSection.id = "clcrResultReport";
    reportSection.className = "clcr-result-report";
    const heading = doc.createElement("h2");
    heading.id = "clcrResultTitle";
    heading.className = "clcr-result-report__title";
    heading.textContent = "Wynik";
    const resultStep = doc.createElement("span");
    resultStep.className = "clcr-step-number";
    resultStep.textContent = "3";
    resultStep.setAttribute("aria-hidden", "true");
    heading.prepend(resultStep);
    const resultHeading = doc.createElement("div");
    resultHeading.className = "clcr-result-report__head";
    resultHeading.appendChild(heading);
    reportSection.appendChild(resultHeading);
    const readiness = el("clcrReadiness");
    if (readiness) reportSection.appendChild(readiness);

    const results = doc.createElement("div");
    results.className = "clcr-result-extra";
    ["ktvValidation", "ktvResult", "ektvResult", "urrResult", "ktvInterpretation", "results", "elecCard", "stoneCard"].forEach((id) => {
      const node = el(id);
      if (node) results.appendChild(node);
    });
    reportSection.appendChild(results);
    reportActions = doc.createElement("div");
    reportActions.className = "clcr-result-report__actions";
    reportActions.hidden = true;
    ["downloadPDF", "downloadDOCX", "askAI"].forEach((id) => {
      const node = el(id);
      if (node) reportActions.appendChild(node);
    });
    reportSection.appendChild(reportActions);
    const ai = el("aiContainer");
    if (ai) reportSection.appendChild(ai);
    rail.appendChild(reportSection);
    built = true;
    refresh();
  }

  function adoptCards() {
    if (!rail) return;
    ["clcrVisitSaveCard", "clcrHistoryCard"].forEach((id) => {
      const node = el(id);
      if (node && node.parentNode !== rail) rail.appendChild(node);
    });
  }

  function refresh() {
    if (!built) return;
    adoptCards();
    const formulaId = activeFormulaId();
    const workflow = global.ClcrUiWorkflow;
    const readiness = workflow?.getFormulaReadiness?.();
    const selected = [...reportSection.querySelectorAll("[data-clcr-series][data-clcr-value]")].some((node) => {
      const series = node.dataset.clcrSeries || "";
      return (!formulaId || series.toLowerCase() === formulaId.toLowerCase()) &&
        node.dataset.clcrValue !== "" && Number.isFinite(Number(node.dataset.clcrValue));
    });
    const dialysis = formulaId === "KTV" && Boolean(el("ktvResult")?.textContent.trim());
    const hasResult = Boolean((selected || dialysis) && readiness?.valueReady);
    rail.dataset.clcrHasResult = String(hasResult);
    reportActions.hidden = !hasResult;
    const resultBody = reportSection.querySelector(".clcr-result-extra");
    if (resultBody) resultBody.hidden = !["CitCr_spot", "FENa_spot", "FEK_spot", "FECl_spot", "FEHCO3_spot"].includes(formulaId) && Boolean(readiness && !readiness.valueReady);
  }

  function scheduleRefresh() {
    if (refreshTimer) global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(refresh, 60);
  }
  function observe() {
    if (typeof global.MutationObserver === "function") {
      const observer = new global.MutationObserver(scheduleRefresh);
      RESULT_IDS.forEach((id) => {
        const node = el(id);
        if (node) observer.observe(node, { childList: true, subtree: true, attributes: true });
      });
    }
    const form = el("clcrForm");
    if (form) {
      form.addEventListener("input", scheduleRefresh);
      form.addEventListener("change", scheduleRefresh);
    }
    doc.addEventListener("clcr:result-rendered", scheduleRefresh);
  }
  function init() {
    if (!workflowActive()) return;
    build();
    if (built) observe();
    else global.setTimeout(() => { build(); if (built) observe(); }, 120);
  }
  global.ClcrLayout = { refresh, renderHead: refresh, _rail: () => rail };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
