/* lab_clinical_panels.js
 * --------------------------------------------------------------------------
 *  Pełne panele diagnostyczne per wskazanie kliniczne.
 *
 *  Faza 4e — moduł "Zaproponuj badania" rozbudowany o WSZYSTKIE badania
 *  zalecane przez wytyczne (PTE, Endocrine Society, ESHRE, Mayo Clinic),
 *  również te spoza naszego konwertera (przeciwciała tarczycowe, kariotyp,
 *  testy stymulacyjne, obrazowanie, parametry biochemiczne ogólne).
 *
 *  Struktura per wskazanie:
 *    {
 *      sections: [
 *        {
 *          name:  'Panel podstawowy' | 'Etiologia' | 'Testy dynamiczne'
 *                  | 'Obrazowanie' | 'Genetyka' | 'Dodatkowe',
 *          tests: [
 *            { id: 'tsh' }                          // — INTERNAL: substancja
 *                                                   //   z lab_units_data.js
 *            { ext: 'anti_tpo',                     // — EXTERNAL: badanie
 *              label: 'Przeciwciała anty-TPO',      //   spoza naszej apki
 *              note:  'AITD/Hashimoto, czułość ~90%' }
 *          ]
 *        },
 *        ...
 *      ],
 *      guideline:  'PTE 2019 / Endocrine Society 2014',
 *      summary:    'Krótkie wprowadzenie (1 zdanie) o algorytmie.'
 *    }
 *
 *  External tests są zdefiniowane inline (`ext` + `label` + `note`).
 *  Internal tests mają tylko `id` — etykieta jest brana z `LabUnitsData.find(id).label_pl`.
 *
 *  Eksport: window.LabClinicalPanels = { data, get(id), has(id), allInternalIds() }
 * --------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────────────────────
  //  Najczęściej powtarzane "external" badania — definicje wspólne,
  //  żeby uniknąć duplikatów i mieć jedno miejsce do edycji.
  // ────────────────────────────────────────────────────────────────
  var EXT = {
    // Tarczyca
    anti_tpo:   { ext: 'anti_tpo',   label: 'Przeciwciała anty-TPO',  note: 'AITD: Hashimoto / Graves (czułość ~90% w Hashimoto)' },
    anti_tg_ab: { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG',   note: 'AITD; obowiązkowo razem z Tg po tyreoidektomii (interferują z pomiarem!)' },
    trab:       { ext: 'trab',       label: 'TRAb (anty-TSHR)',       note: 'Choroba Gravesa-Basedowa; oftalmopatia tarczycowa' },
    calcitonin: { ext: 'calcitonin', label: 'Kalcytonina',            note: 'Rak rdzeniasty tarczycy (MTC), MEN2' },
    cea:        { ext: 'cea',        label: 'CEA',                     note: 'Marker MTC obok kalcytoniny' },
    thyroid_us: { ext: 'thyroid_us', label: 'USG tarczycy',           note: 'Wole guzkowate, AITD (hipoechogeniczność), Graves (wzmożone unaczynienie)' },
    thyroid_scinti: { ext: 'thyroid_scinti', label: 'Scyntygrafia (¹²³I / ⁹⁹ᵐTc)', note: 'Różnicowanie nadczynności: Graves vs guzek toksyczny vs zapalenie' },
    iodine_uptake: { ext: 'iodine_uptake', label: 'Jodochwytność (RAIU)', note: 'Test funkcjonalny — niska w zapaleniu, wysoka w Gravesie/Plummerze' },
    neck_us:    { ext: 'neck_us',    label: 'USG szyi (węzły, loża po TT)', note: 'Kontrola po raku tarczycy' },
    wbs_i131:   { ext: 'wbs_i131',   label: 'WBS — scyntygrafia całego ciała z ¹³¹I', note: 'Po-terapeutyczny WBS po ¹³¹I; wykrywanie odległych ognisk DTC' },
    pet_ct:     { ext: 'pet_ct',     label: '¹⁸F-FDG PET/CT',          note: 'DTC jodorefrakcyjny (Tg > 10, ujemny WBS); MTC zaawansowany' },

    // Nadnercza
    synacthen_test: {
      ext: 'synacthen_test',
      label: 'Test stymulacji ACTH (Synacthen 250 μg)',
      note: 'Gold standard rozpoznania PAI. Szczyt kortyzolu > 500 nmol/L (18 μg/dL) → wyklucza PAI; ≤ 500 nmol/L → PAI prawdopodobna.',
      description: 'Podanie i.m. lub i.v. 250 μg tetracosactide (syntetyczny analog ACTH). Pomiar kortyzolu przed podaniem (0 min), w 30. i w 60. minucie. Kryterium prawidłowej odpowiedzi: szczyt kortyzolu > 500 nmol/L (18 μg/dL) w jakimkolwiek pomiarze — wyklucza PAI. Wartość ≤ 500 nmol/L we wszystkich pomiarach → PAI prawdopodobna. Uwaga: test może dać fałszywie prawidłowy wynik w bardzo wczesnej SAI (nadnercza nie zdążyły jeszcze zaniknąć — wykonać po ≥ 3–4 tygodniach od podejrzenia uszkodzenia przysadki).'
    },
    crh_test: {
      ext: 'crh_test',
      label: 'Test stymulacji CRH (kortykoliberyną)',
      note: 'Różnicowanie centralnego od ektopowego ACTH-zależnego zespołu Cushinga. Wzrost ACTH > 35% i/lub kortyzolu > 14–20% → centralny; brak odpowiedzi → ektopowy.',
      description: 'Wskazania: różnicowanie centralnego (przysadkowego) od ektopowego ACTH-zależnego zespołu Cushinga po potwierdzeniu autonomii kortyzolu. Protokół: pacjent na czczo, leżący, dostęp żylny zapewniony 30 min przed testem. Podanie i.v. CRH (kortykoliberyny) — 100 μg ludzkiego CRH (hCRH) lub 1 μg/kg owczego CRH (oCRH). Pomiar ACTH i kortyzolu w surowicy: 0 (przed podaniem), 15, 30, 45, 60, 90, 120 min. Kryteria sugerujące centralny zespół Cushinga: wzrost ACTH > 35% w stosunku do wartości bazalnej oraz/lub wzrost kortyzolu (różne progi w różnych źródłach: > 14% wg Newell-Price 2006 — bardziej czułe; > 20% wg Nieman ES 2008 — bardziej swoiste). Brak istotnego wzrostu → ektopowy ACTH (komórki nowotworowe spoza przysadki są zwykle niewrażliwe na CRH). Czułość ~83%, swoistość ~95% dla centralnego zespołu Cushinga. Dostępność CRH w Polsce ograniczona głównie do ośrodków uniwersyteckich. Alternatywa stosowana w Polsce: test stymulacji desmopresyną (DDAVP 10 μg i.v.) — analogiczna interpretacja, lek powszechnie dostępny.'
    },
    udfc_24h: {
      ext: 'udfc_24h',
      label: 'Kortyzol w dobowej zbiórce moczu (DZM)',
      note: 'Skrining zespołu Cushinga — ocena całkowitej produkcji kortyzolu w ciągu doby. Wartości > 3× górnej granicy normy w 2 niezależnych oznaczeniach są wysoce swoiste.',
      description: 'Zbiórka 24-godzinna do standardowego pojemnika na DZM (BEZ konserwantów — kortyzol jest stabilny w moczu przez 24 h; przechowywanie w lodówce w okresie zbiórki zalecane). Pierwsza poranna porcja moczu odrzucona, następnie zbiórka KAŻDEJ porcji moczu przez 24 godziny, ostatnia porcja następnego dnia rano (po przebudzeniu o tej samej godzinie co rozpoczęcie). Pomiar objętości i wolnego kortyzolu (metoda referencyjna LC-MS/MS — oferowana w polskich laboratoriach Synevo, ALAB, Diagnostyka). Norma laboratoryjna: 20–90 μg/24 h (55–250 nmol/24 h, zależy od metody). Interpretacja (Nieman ES 2008, Fleseriu 2021 Lancet Diabetes Endocrinol): wartości > 4× górnej granicy normy (ULN) — praktycznie pewny zespół Cushinga; > 3× ULN — wysoce swoiste; > 2× ULN — sugerujące, wymagające potwierdzenia innym testem (kortyzol w ślinie nocnej, niskodawkowy 48-godzinny test z deksametazonem). Powtórzyć 2-krotnie w odstępie kilku dni — pojedynczy dodatni wynik nie wystarcza. Pomocniczo: oznaczenie kreatyniny w DZM jako kontrola kompletności zbiórki (oczekiwana ~15–25 mg/kg/24 h u dorosłych). UWAGI: wynik fałszywie ujemny przy łagodnej hiperkortyzolemii (np. subklinicznym Cushingu); fałszywie dodatni przy zbyt dużej objętości moczu (> 5 L/24 h — wymywanie z dystalnych kanalików).'
    },
    salivary_cortisol: {
      ext: 'salivary_cortisol',
      label: 'Kortyzol w ślinie nocnej (~23:00)',
      note: 'Skrining zespołu Cushinga. Wykorzystuje fizjologiczną utratę rytmu dobowego kortyzolu — w Cushingu kortyzol o godz. 23:00 jest podwyższony.',
      description: 'Kortyzol w ślinie pobranej w godzinach nocnych (zwykle 23:00, przed snem). W warunkach prawidłowych kortyzol w ślinie o godz. 23:00 wynosi < 4 nmol/L (~145 ng/dL) — zachowany rytm dobowy z najniższym stężeniem o północy. W zespole Cushinga rytm dobowy kortyzolu jest nieprawidłowy, kortyzol w nocy może być znacznie podwyższony. Zaleta: badanie nieinwazyjne, możliwe w warunkach domowych (pacjent wypluwa ślinę do dedykowanego pojemnika/wymazówki Salivette). Dostępność w Polsce stopniowo rośnie — laboratoria komercyjne (Synevo, Diagnostyka, ALAB). Norma laboratoryjna: < 4 nmol/L (145 ng/dL) — różni się między laboratoriami w zależności od metody (LC-MS/MS najczulsza, ELISA mniej swoista). Przygotowanie pacjenta: nie jeść przez 30 min, nie myć zębów przez ≥ 30 min przed pobraniem (krew z dziąseł zaburza pomiar), nie palić tytoniu, unikać steroidów inhalacyjnych/donosowych ≥ 24 h. Pomiar powtórzyć 2-krotnie w odstępie ≥ 1 dnia. Kryterium dodatnie: > górnej granicy normy laboratorium w obu pomiarach.'
    },
    low_dose_dst48: {
      ext: 'low_dose_dst48',
      label: 'Niskodawkowy 48-godzinny test z deksametazonem (2 mg/dobę)',
      note: 'Alternatywne potwierdzenie autonomii gdy wynik testu z 1 mg deksametazonu niejednoznaczny.',
      description: 'Protokół 2-dniowy. Pacjent przyjmuje 0,5 mg deksametazonu doustnie co 6 godzin przez 48 godzin — pierwsza dawka o 9:00 dnia 1., kolejne o 15:00, 21:00, 3:00, 9:00, 15:00, 21:00, ostatnia o 3:00 dnia 3. Pomiar kortyzolu w surowicy 6 godzin po ostatniej dawce (o godz. 9:00 dnia 3.). Łączna dawka: 4 mg deksametazonu w 8 dawkach po 0,5 mg. Kryteria: kortyzol < 50 nmol/L (1,8 μg/dL) → wyklucza zespół Cushinga; > 50 nmol/L → potwierdza autonomię. Test ten ma większą swoistość niż test z 1 mg deksametazonu (mniej fałszywie dodatnich wyników), ale wymaga ścisłej współpracy pacjenta (pamiętanie o dawkach co 6 godzin) i jest mniej wygodny.'
    },
    high_dose_dst: {
      ext: 'high_dose_dst',
      label: 'Wysokodawkowy test z deksametazonem (8 mg)',
      note: 'Różnicowanie centralny vs ektopowy ACTH-zależny zespół Cushinga. Supresja kortyzolu > 50% → centralny; brak supresji → ektopowy.',
      description: 'Wariant overnight: pacjent przyjmuje 8 mg deksametazonu doustnie jednorazowo o godz. 23:00; pomiar kortyzolu rano (8:00–9:00). Wariant 2-dniowy: 2 mg deksametazonu co 6 h przez 48 h (łączna dawka 16 mg) — preferowany. Kryteria: spadek kortyzolu o > 50% w stosunku do wartości bazalnej (lub spadek kortyzolu w DZM > 50%) → centralny zespół Cushinga (gruczolak przysadki — choroba Cushinga); brak supresji lub spadek < 50% → ektopowy ACTH (drobnokomórkowy rak płuca SCLC, rakowiak płuca/grasicy, NET trzustki). Czułość ~80%, swoistość ~80% — niższa niż test CRH lub IPSS, ale dostępniejszy. Mechanizm: gruczolak przysadki zachowuje częściową wrażliwość na ujemne sprzężenie zwrotne (supresję), guzy ektopowe nie.'
    },
    ipss: {
      ext: 'ipss',
      label: 'IPSS (cewnikowanie zatok skalistych dolnych)',
      note: 'Złoty standard różnicowania centralny vs ektopowy ACTH-zależny zespół Cushinga gdy obraz niejednoznaczny. Stosunek ACTH centralny:obwodowy > 2:1 bazalnie lub > 3:1 po CRH → centralny.',
      description: 'IPSS (Inferior Petrosal Sinus Sampling) — cewnikowanie obustronne żył skalistych dolnych odprowadzających krew z przysadki. Złoty standard różnicowania centralnego (przysadkowego) od ektopowego ACTH-zależnego zespołu Cushinga. Wskazania: ACTH-zależny zespół Cushinga z niejednoznacznym obrazem MRI przysadki (gruczolak < 6 mm lub MRI ujemny) lub niejednoznacznym wynikiem testu CRH/wysokodawkowego DST. Procedura wykonywana w pracowni interwencyjnej naczyniowej — cewnikowanie żył skalistych dolnych przez żyły udowe, jednoczesny pomiar ACTH w obu zatokach (centralny) i w żyle obwodowej. Po pomiarach bazalnych podanie i.v. CRH 100 μg, pomiar ACTH w zatokach i obwodowo w 3., 5. i 10. minucie. Kryterium centralnego zespołu Cushinga: stosunek ACTH centralny:obwodowy > 2:1 w pomiarze bazalnym LUB > 3:1 po stymulacji CRH. Lateralizacja (różnica stężeń między prawą a lewą zatoką > 1,4:1) sugeruje stronę gruczolaka — pomocnicze przy operacji transsphenoidalnej. Czułość ~95%, swoistość ~93–100% (po CRH). Powikłania: nakłucie naczyń (krwiak, ~1%), neurologiczne (TIA, udar, < 0,5%), uszkodzenie nerwów czaszkowych. W Polsce dostępne tylko w wybranych ośrodkach (m.in. CSK MSWiA Warszawa, Collegium Medicum UJ Kraków, Uniwersytet Medyczny Poznań).'
    },
    pra_pac: {
      ext: 'pra_pac',
      label: 'Aktywność reninowa osocza (PRA / DRC)',
      note: 'W PAI z niedoborem aldosteronu PRA wzrasta (utracona zwrotna inhibicja).',
      description: 'Aktywność reninowa osocza (PRA) lub bezpośrednie stężenie reniny (DRC). W PAI z niedoborem mineralokortykosteroidów organizm kompensacyjnie aktywuje układ RAA — stąd PRA jest podwyższona. Stosowana też w diagnostyce hiperaldosteronizmu (jako składowa wskaźnika ARR — aldosteron/renina). Przed pobraniem: pacjent siedzi 5–10 min, odstawić MRA i β-blokery 4 tyg. wcześniej (jeśli kontekst hiperaldosteronizmu).'
    },
    arr:        { ext: 'arr',        label: 'ARR (aldosteron/renina)',  note: 'Skrining hiperaldosteronizmu: > 30 sugeruje PA' },
    saline_load: {
      ext: 'saline_load',
      label: 'Test obciążenia 0,9% NaCl (saline infusion test)',
      note: 'Najczęściej używany test potwierdzający PHA w Polsce. Aldosteron po wlewie > 10 ng/dL (277 pmol/L) → PHA potwierdzony; < 5 ng/dL → wykluczony; 5–10 → niejednoznaczny.',
      description: 'Wskazania: potwierdzenie PHA po dodatnim skriningu ARR. Przeciwwskazania bezwzględne: niewydolność serca NYHA III–IV, ciężkie niekontrolowane nadciśnienie (> 200/120 mmHg), zaawansowana niewydolność nerek (eGFR < 30), hipokaliemia < 3,0 mmol/L (wyrównać przed badaniem!), retinopatia nadciśnieniowa III–IV. Przygotowanie: pacjent ≥ 3–5 dni na zwykłej diecie z normalną podażą soli (> 6 g NaCl/dobę), kaliemia wyrównana (K > 4,0 mmol/L). Odstawić: MRA (spironolakton, eplerenon) 4 tygodnie wcześniej; diuretyki, β-blokery, ACE-I/ARB, NLPZ — 2 tygodnie (jeśli możliwe). Jeśli leki przeciwnadciśnieniowe muszą być kontynuowane, użyć werapamil SR i/lub α-bloker (doksazosyna). Protokół: na czczo od rana, pacjent w pozycji leżącej przez całe 5 godzin (1 h spoczynek przed + 4 h wlewu). Wlew dożylny 0,9% NaCl 500 mL/godz. przez 4 godziny (łącznie 2 L). Monitorowanie ciśnienia tętniczego co 30 min, w razie wzrostu > 200 mmHg lub objawów — przerwać. Pobrania: 0 min (przed wlewem, leżąc): aldosteron, kortyzol, sód, potas, hematokryt. 4 h (po zakończeniu wlewu): aldosteron, kortyzol, sód, potas. Interpretacja (wg Endocrine Society 2016): aldosteron post-wlew > 10 ng/dL (277 pmol/L) → PHA potwierdzony; < 5 ng/dL (138 pmol/L) → PHA wykluczony; 5–10 ng/dL → wynik niejednoznaczny — rozważyć alternatywny test (kaptoprilowy lub fludrokortyzonem). Powikłania: obciążenie objętościowe (rzadko obrzęk płuc), hipokaliemia, krótkotrwały wzrost ciśnienia.'
    },
    avs:        { ext: 'avs',        label: 'AVS (cewnikowanie żył nadnerczowych)', note: 'Różnicowanie jedno- vs obustronnego hiperaldosteronizmu' },
    metanephrines_plasma: {
      ext: 'metanephrines_plasma',
      label: 'Wolne metoksykatecholaminy w osoczu (metanefryny)',
      note: 'Złoty standard skriningu pheochromocytoma. Czułość ~99%, swoistość ~85%. Sumarycznie metanefryna + normetanefryna.',
      description: 'Wolne metoksykatecholaminy (metanefryny) w osoczu — w polskich laboratoriach (Synevo, ALAB, Diagnostyka) określane także jako "metanefryny wolne w osoczu" lub "free plasma metanephrines". Sumarycznie oznacza się metanefrynę i normetanefrynę. Pobranie: z dostępu naczyniowego, po 30 min spoczynku w pozycji leżącej (samo nakłucie żyły zwiększa katecholaminy → fałszywie dodatnie). Pacjent na czczo, bez kawy i nikotyny ≥ 8 h. Odstawić leki interferujące: trójcykliczne antydepresanty, MAO-I, fenoksybenzaminę. Norma laboratoryjna zwykle: metanefryna < 0,5 nmol/L, normetanefryna < 0,9 nmol/L (zależy od metody — LC-MS/MS lub HPLC). Interpretacja: > 4× górnej granicy normy → wysokie prawdopodobieństwo pheochromocytoma; 1–4× GGN → wynik niejednoznaczny, wskazane powtórzenie lub test klonidynowy.'
    },
    metanephrines_urine: {
      ext: 'metanephrines_urine',
      label: 'Frakcjonowane metanefryny w DZM (dobowej zbiórce moczu)',
      note: 'Alternatywa równorzędna do metoksykatecholamin w osoczu. Używana gdy badanie z osocza niedostępne lub do potwierdzenia wyniku granicznego.',
      description: 'Frakcjonowane metanefryny w 24-godzinnej zbiórce moczu — w Polsce równorzędna metoda skriningu pheochromocytoma (Endocrine Society 2014, ESE 2016). Wymaga starannej zbiórki moczu przez 24 h do pojemnika z kwasem (HCl, zakwaszenie do pH < 3) — błędy zbiórki są częstym źródłem nieprawidłowych wyników. Pobranie: pacjent w warunkach domowych, bez wysiłku fizycznego, bez kawy i nikotyny. Interpretacja: > 2× górnej granicy normy → wysokie prawdopodobieństwo pheo. Wadą metody jest większa uciążliwość (24-godzinna zbiórka) i większa zmienność wyników w porównaniu z osoczem.'
    },
    adrenal_ct: {
      ext: 'adrenal_ct',
      label: 'TK nadnerczy bez kontrastu',
      note: 'Badanie pierwszego rzutu w diagnostyce incidentaloma. Densytometria w jednostkach Hounsfielda (HU) różnicuje gruczolak lipid-rich od zmian podejrzanych. TK bez kontrastu jako pierwszy krok, a w przypadku wykrycia zmian wątpliwych (o większej gęstości lub niejednorodnej strukturze) konieczne jest uzupełnienie badania o fazę z kontrastem.',
      description: 'Tomografia komputerowa nadnerczy w fazie natywnej (bez podania środka kontrastowego). Kluczowa jest densytometria — pomiar gęstości tkanki wyrażony w jednostkach Hounsfielda (HU, ang. Hounsfield Units). Skala HU: woda = 0, powietrze = -1000, kość = +1000. Tkanki bogate w tłuszcz mają niskie HU. TK bez kontrastu jest badaniem pierwszego rzutu w incidentaloma; w przypadku wykrycia zmian wątpliwych (o większej gęstości lub niejednorodnej strukturze) konieczne jest uzupełnienie badania o fazę z kontrastem (TK wielofazowe z fazą tętniczą, żylną i opóźnioną — obliczenie wash-out kontrastu). Interpretacja zmiany nadnercza: < 10 HU → gruczolak lipid-rich (bogaty w tłuszcz), prawdopodobieństwo łagodności > 98% — nie wymaga dalszej diagnostyki obrazowej, kontrola co 6–12 mies. przez 2 lata; 10–20 HU → gruczolak lipid-poor (ubogi w tłuszcz), zwykle łagodny — wskazane TK z kontrastem + faza opóźniona (absolute wash-out > 60% lub relative wash-out > 40% potwierdza gruczolaka); > 20 HU → konieczna dalsza diagnostyka (TK wielofazowe z kontrastem, MRI nadnerczy z sekwencjami chemical-shift, ew. PET-FDG, biopsja w wybranych przypadkach); > 40 HU i wymiar > 4 cm → wysokie podejrzenie raka kory nadnerczy (ACC) lub pheochromocytoma — kwalifikacja do operacji (NIE biopsja przed wykluczeniem pheochromocytoma!).'
    },
    adrenal_mri: {
      ext: 'adrenal_mri',
      label: 'MRI nadnerczy z sekwencjami chemical-shift',
      note: 'Drugi rzut po TK — gdy TK niejednoznaczne (HU 10–20), gdy przeciwwskazania do kontrastu jodowego, w ciąży i u dzieci.',
      description: 'Rezonans magnetyczny nadnerczy z sekwencjami chemical-shift (in-phase i out-of-phase) — wykorzystuje różnicę precesji jąder wody i tłuszczu. W zmianach bogatych w tłuszcz wewnątrzkomórkowy (typowe gruczolaki lipid-rich) sygnał spada w sekwencji out-of-phase o > 16,5% w porównaniu do in-phase (signal intensity index — SII). Wskazania: TK niejednoznaczne (HU 10–20), niemożność podania kontrastu jodowego (alergia, niewydolność nerek), ciąża, dzieci, dynamiczna ocena guzów. Zaletą jest brak narażenia na promieniowanie jonizujące. Wadą — niższa rozdzielczość przestrzenna i wyższy koszt.'
    },
    pituitary_mri: {
      ext: 'pituitary_mri',
      label: 'MRI przysadki z gadolinium (dynamiczne sekwencje)',
      note: 'Lokalizacja gruczolaka przy ACTH-zależnym zespole Cushinga. Czułość: mikrogruczolak ≥ 6 mm w ~80%; < 6 mm w ~50%.',
      description: 'Rezonans magnetyczny przysadki mózgowej w sekwencjach T1 i T2, z dodatkową dynamiczną sekwencją T1 po dożylnym podaniu środka kontrastowego (gadolinium). Mikrogruczolak (< 10 mm) wykazuje opóźnioną perfuzję — jest hipointensywny w fazie wczesnej (60–90 s po kontraście) w porównaniu do prawidłowej tkanki przysadki, izointensywny w fazie późnej. Makrogruczolak (≥ 10 mm) wykrywany praktycznie zawsze. Czułość: mikrogruczolak ≥ 6 mm w ~80% przypadków; < 6 mm w ~50%; łącznie ~60% wszystkich mikrogruczolaków w chorobie Cushinga. UWAGA: ~10% zdrowej populacji ma incidentaloma przysadki (przypadkowy gruczolak niewydzielający), więc dodatni wynik MRI nie zawsze jest etiologiczny w Cushingu — konieczna korelacja z testami funkcjonalnymi. Gdy MRI przysadki ujemny przy potwierdzonym ACTH-zależnym Cushingu (dodatni test CRH lub wysokodawkowy DST) → wskazane IPSS. MRI 3T daje wyższą rozdzielczość przestrzenną niż 1,5T i jest preferowany w diagnostyce mikrogruczolaków.'
    },
    anti_21oh: {
      ext: 'anti_21oh',
      label: 'Przeciwciała anty-21-hydroksylazie',
      note: 'Dodatnie u 80–90% Polaków z autoimmunologiczną PAI (chorobą Addisona).',
      description: 'Przeciwciała przeciwko 21-hydroksylazie nadnerczowej (CYP21A2). W Polsce dodatni wynik stwierdza się u 80–90% pacjentów z autoimmunologiczną pierwotną niedoczynnością kory nadnerczy (chorobą Addisona). Mogą być dodatnie latami przed wystąpieniem pełnoobjawowej choroby — stanowią marker zwiększonego ryzyka u członków rodzin chorych. Norma laboratoryjna zwykle < 1 IU/mL (zależy od metody).'
    },
    vlcfa: {
      ext: 'vlcfa',
      label: 'VLCFA (kwasy tłuszczowe bardzo długołańcuchowe)',
      note: 'Rozważyć tylko u chłopców / młodych mężczyzn z PAI + objawami neurologicznymi — diagnostyka adrenoleukodystrofii (X-ALD).',
      description: 'VLCFA (Very Long Chain Fatty Acids) — marker adrenoleukodystrofii sprzężonej z chromosomem X (X-ALD). Rzadka choroba (1:17 000–20 000 mężczyzn) spowodowana mutacją genu ABCD1 — uszkodzenie peroksysomalnego transportu kwasów tłuszczowych. Postacie kliniczne: dziecięca mózgowa (ChALD, ~35%), adrenomieloneuropatia (AMN, dorośli, ~40%), izolowana niedoczynność kory nadnerczy (~10%). Diagnostyka wskazana przy współistnieniu PAI z objawami neurologicznymi (ataksja, niedowłady, neuropatia obwodowa, zaburzenia poznawcze) u chłopców i młodych mężczyzn.'
    },
    ace:        { ext: 'ace',        label: 'ACE (konwertaza angiotensyny)', note: 'Sarkoidoza' },
    cyp21a2_gen: { ext: 'cyp21a2_gen', label: 'Genetyka CYP21A2', note: '21-hydroksylaza — najczęstsza postać CAH (klas/nonclass.)' },
    cyp11b1_gen: { ext: 'cyp11b1_gen', label: 'Genetyka CYP11B1', note: '11β-hydroksylaza (CAH typ IV)' },
    cyp17a1_gen: { ext: 'cyp17a1_gen', label: 'Genetyka CYP17A1', note: '17α-hydroksylaza' },

    // Płciowe / gonady
    karyotype: {
      ext: 'karyotype',
      label: 'Kariotyp',
      note: 'Podstawowy krok w diagnostyce DSD, zaburzeń pokwitania, hipogonadyzmu pierwotnego i niepłodności. Najczęstsze: 47,XXY (Klinefelter), 45,X (Turner), 46,XX/46,XY DSD.',
      description: 'Kariotyp — ocena chromosomów z hodowli limfocytów krwi obwodowej (zwykle po 72 h kultury z fitohemaglutyniną); standardowo barwienie GTG (G-banding) na ~400–500 prążków. Wskazania: (1) noworodek/dziecko z niejednoznacznymi narządami płciowymi (DSD); (2) pierwotny brak miesiączki (Turner 45,X, zespół Mayera-Rokitansky\'ego-Küstera-Hausera), pierwotna niewydolność jajników u młodych kobiet; (3) hipogonadyzm pierwotny u mężczyzn (Klinefelter 47,XXY, podejrzenie zespołu de la Chapelle\'a 46,XX-male, zespół Jacobsa 47,XYY); (4) niedobór wzrostu (Turner, zespół Noonan); (5) niepłodność męska (azoospermia, oligospermia ciężka). Czas oczekiwania: 7–14 dni (kariotyp standardowy); szybkie metody (FISH, QF-PCR) dla pilnej diagnostyki noworodków DSD — wynik w 24–48 h. Wyniki opisuje się wg ISCN (International System for Cytogenetic Nomenclature), np. "46,XY", "47,XXY", "45,X/46,XX (mozaicyzm)".'
    },
    semen_analysis: { ext: 'semen_analysis', label: 'Spermiogram (badanie nasienia)', note: 'WHO 2021 — kryterium podstawowe niepłodności męskiej' },
    psa: {
      ext: 'psa',
      label: 'PSA + badanie per rectum (DRE)',
      note: 'Obowiązkowe przed rozpoczęciem testosteronoterapii — wykluczenie raka gruczołu krokowego (testosteron przeciwwskazany). Kontrola także w trakcie leczenia.',
      description: 'PSA (swoisty antygen sterczowy) wraz z badaniem per rectum (DRE) — obowiązkowa ocena gruczołu krokowego przed rozpoczęciem testosteronoterapii u mężczyzn. Testosteron jest przeciwwskazany w raku gruczołu krokowego (może stymulować wzrost guza hormonowrażliwego). Orientacyjne wartości PSA: < 4 ng/mL — zwykle prawidłowe; 4–10 ng/mL — strefa szara, wskazana konsultacja urologiczna; > 10 ng/mL — wysokie ryzyko, wymaga diagnostyki urologicznej. Współcześnie coraz częściej stosuje się progi swoiste dla wieku — niższe u młodszych mężczyzn (np. < 2,5 ng/mL w 40.–49. r.ż.), wyższe u starszych (np. < 6,5 ng/mL w 70.–79. r.ż.). W trakcie testosteronoterapii: kontrola PSA po 3–6 miesiącach, następnie co 12 miesięcy; wzrost PSA > 1,4 ng/mL w ciągu roku lub przekroczenie 4 ng/mL → konsultacja urologiczna. Badanie per rectum ocenia konsystencję gruczołu i ewentualne guzki.'
    },
    fmr1:       { ext: 'fmr1',       label: 'FMR1 (premutacja Fragile X)', note: 'Predyspozycja do POI (~13–15% rodzinnej, ~3–5% sporadycznej)' },
    yq_microdel:{ ext: 'yq_microdel', label: 'Mikrodelecje AZF chromosomu Y', note: 'Azoospermia/oligospermia ciężka' },
    cftr_gen:   { ext: 'cftr_gen',   label: 'Mutacje CFTR',            note: 'CBAVD (wrodzony brak nasieniowodów)' },
    srd5a2_gen: {
      ext: 'srd5a2_gen',
      label: 'Genetyka SRD5A2',
      note: 'Definitywne potwierdzenie niedoboru 5α-reduktazy typu 2 (autosomalna recesywna, chromosom 2p23).',
      description: 'Sekwencjonowanie genu SRD5A2 (chromosom 2p23) — koduje enzym 5α-reduktazę typu 2, odpowiedzialną za konwersję testosteronu w DHT w skórze i zewnętrznych narządach płciowych. Dziedziczenie autosomalne recesywne. Opisanych > 100 mutacji sprawczych w ponad 30 krajach. Najczęstsze mutacje w populacji europejskiej: p.Gly196Ser, p.Arg246Gln, p.Gln126Arg. Wskazania: potwierdzenie kliniczno-biochemicznego podejrzenia niedoboru 5α-reduktazy (stosunek T/DHT po hCG > 10–20). Znaczenie: (1) ostateczne potwierdzenie rozpoznania; (2) poradnictwo genetyczne — ryzyko 25% u rodzeństwa, identyfikacja heterozygotycznych nosicieli wśród rodziców; (3) podstawa decyzji o przyznanej płci (część pacjentów wychowanych jako dziewczynki ulega po dojrzewaniu spontanicznej zmianie tożsamości płciowej na męską — zależnie od kontekstu kulturowego i stopnia wirylizacji — ze względu na działanie 5α-reduktazy typu 1 i bezpośrednie działanie testosteronu). U dziewczynek genetycznych (46,XX) z mutacją SRD5A2 fenotyp jest prawidłowy (5α-reduktaza 2 nie odgrywa istotnej roli w rozwoju żeńskich narządów płciowych).'
    },
    hcg_test: {
      ext: 'hcg_test',
      label: 'Test stymulacji hCG (β-hCG)',
      note: 'Ocena czynności komórek Leydiga, obecności jąder (DSD) lub zdolności konwersji testosteronu w DHT (niedobór 5α-reduktazy).',
      description: 'Test stymulacji ludzką gonadotropiną kosmówkową (hCG) — działa na komórki Leydiga jąder, naśladując efekt LH. Wskazania: (1) różnicowanie hipogonadyzmu pierwotnego od wtórnego u chłopców z opóźnionym pokwitaniem; (2) potwierdzenie obecności jąder w DSD (kryptorchizm obustronny, anorchia); (3) diagnostyka niedoboru 5α-reduktazy (pomiar stosunku T/DHT po stymulacji). Protokół klasyczny (Forest): Pregnyl (hCG) 1500 IU i.m. dziennie przez 3 dni — pomiar testosteronu (i ewentualnie DHT) przed pierwszą dawką oraz 24 godziny po ostatniej dawce. Wariant dla niemowląt: hCG 100 IU/kg jednorazowo, pomiar testosteronu po 72 h. Interpretacja: (1) wzrost testosteronu > 2× wartości bazalnej → czynne komórki Leydiga (jądra obecne, oś gonadalna sprawna); (2) brak wzrostu → anorchia, ciężki hipogonadyzm pierwotny lub zaburzenia biosyntezy testosteronu; (3) stosunek T/DHT po stymulacji > 10–20 → niedobór 5α-reduktazy typu 2.'
    },
    gnrh_test:  { ext: 'gnrh_test',  label: 'Test stymulacji GnRH (LHRH)', note: 'Diagnostyka opóźnionego/przedwczesnego dojrzewania' },
    chorionic_us: { ext: 'chorionic_us', label: 'USG narządów rodnych', note: 'Wymiary jajników/macicy, AFC, jądra' },
    hsg:        { ext: 'hsg',        label: 'HSG (histerosalpingografia)', note: 'Drożność jajowodów w diagnostyce niepłodności' },
    bbt:        { ext: 'bbt',        label: 'Pomiar BBT / krzywa temperatury', note: 'Owulacja — szczyt LH koreluje ze wzrostem BBT' },
    pregnancy_us: { ext: 'pregnancy_us', label: 'USG położnicze', note: 'CRL, dobrostan płodu, łożysko' },
    bhcg:       { ext: 'bhcg',       label: 'β-hCG ilościowy',         note: 'Diagnostyka ciąży, monitorowanie wczesnej ciąży' },
    macroprolactin: { ext: 'macroprolactin', label: 'Makroprolaktyna (PEG-precypitacja)', note: 'Wykluczenie pseudohiperprolaktynemii (makro-PRL)' },

    // Wzrost / IGF
    itt:        { ext: 'itt',        label: 'Test z insuliną (test hipoglikemii poinsulinowej)', note: 'Złoty standard GHD u dorosłych; przeciwwskazania: CHD, padaczka' },
    ghrh_arg:   { ext: 'ghrh_arg',   label: 'Test GHRH + arginina',    note: 'Alternatywa ITT u dorosłych' },
    glucagon_test: { ext: 'glucagon_test', label: 'Test z glukagonem', note: 'Alternatywa ITT u dzieci i dorosłych' },
    clonidine_test: { ext: 'clonidine_test', label: 'Test z klonidyną', note: 'Stymulacja GH u dzieci' },
    arginine_test:  { ext: 'arginine_test',  label: 'Test z argininą',    note: 'Stymulacja GH u dzieci (wlew i.v.)' },
    ldopa_test:     { ext: 'ldopa_test',     label: 'Test z L-DOPA',      note: 'Stymulacja GH u dzieci (rzadziej stosowany — częste nudności)' },
    ogtt_gh:    { ext: 'ogtt_gh',    label: 'oGTT z GH (75 g)',        note: 'Diagnostyka akromegalii: brak supresji GH < 1 μg/L' },
    bone_age:   { ext: 'bone_age',   label: 'RTG ocena wieku kostnego', note: 'Niedobór wzrostu, opóźnione/przedwczesne dojrzewanie' },
    height_chart: { ext: 'height_chart', label: 'Siatki centylowe / prędkość wzrostu', note: 'Obserwacja ≥ 6 mies. przed diagnostyką' },

    // Metabolizm wapniowo-fosforanowy
    pth:        { ext: 'pth',        label: 'PTH (parathormon)',       note: 'Diagnostyka różnicowa hiper-/hipokalcemii' },
    ca_total:   { ext: 'ca_total',   label: 'Wapń całkowity + zjonizowany', note: 'Skorygowany o albuminę' },
    phosphorus: { ext: 'phosphorus', label: 'Fosfor nieorganiczny',     note: 'Krzywica/osteomalacja, CKD' },
    alp:        { ext: 'alp',        label: 'ALP (fosfataza alkaliczna)', note: 'Znacznie podwyższona w krzywicy' },
    ctx_p1np:   { ext: 'ctx_p1np',   label: 'CTX / P1NP (markery przebudowy kości)', note: 'Monitorowanie leczenia osteoporozy' },
    dxa:        { ext: 'dxa',        label: 'DXA (densytometria L1–L4, biodro)', note: 'T-score ≤ -2,5 = osteoporoza' },
    fgf23:      { ext: 'fgf23',      label: 'FGF23',                    note: 'Krzywice oporne na wit. D, CKD-MBD' },
    sclerostin: { ext: 'sclerostin', label: 'Sklerostyna',              note: 'Diagnostyka różnicowa rzadkich osteopatii' },

    // Metabolizm / cukier
    glucose_fasting: { ext: 'glucose_fasting', label: 'Glukoza na czczo', note: 'IGT / cukrzyca / metabolic syndrome' },
    ogtt_75g:   { ext: 'ogtt_75g',   label: 'oGTT (75 g, 0/120 min)',  note: 'PCOS, IGT, GDM' },
    hba1c:      { ext: 'hba1c',      label: 'HbA1c (hemoglobina glikowana)', note: 'Średnia glikemia 3 mies.' },
    insulin:    { ext: 'insulin',    label: 'Insulina + HOMA-IR',       note: 'Insulinooporność (PCOS, otyłość, NAFLD)' },
    lipid_panel:{ ext: 'lipid_panel',label: 'Lipidogram (TC, LDL, HDL, TG)', note: 'Ryzyko sercowo-naczyniowe, dyslipidemia' },
    cmp:        { ext: 'cmp',        label: 'Panel biochem. (sód, potas, kreatynina, glukoza)', note: 'Stan ogólny, elektrolity' },
    egfr:       { ext: 'egfr',       label: 'Kreatynina + eGFR',        note: 'Funkcja nerek (CKD-EPI)' },
    cbc:        { ext: 'cbc',        label: 'Morfologia krwi',          note: 'Niedokrwistość, leukopenia, trombocytopenia' },
    ferritin:   { ext: 'ferritin',   label: 'Ferrytyna, Fe, TIBC',      note: 'Niedokrwistość z niedoboru żelaza' },
    crp:        { ext: 'crp',        label: 'CRP',                       note: 'Stan zapalny' },
    albumin:    { ext: 'albumin',    label: 'Albumina',                  note: 'Korekta wapnia całkowitego' },
    liver:      { ext: 'liver',      label: 'ALAT, ASPAT, GGTP, bilirubina', note: 'Funkcja wątroby, NAFLD' },
    sodium:     { ext: 'sodium',     label: 'Sód (Na)',                  note: 'Hiponatremia → PAI, SIADH' },
    potassium:  { ext: 'potassium',  label: 'Potas (K)',                 note: 'Hiperkaliemia → PAI; hipokaliemia → PA' },
    aldo_renin_ratio: { ext: 'arr_screen', label: 'Skrining ARR (po odstawieniu MRA, β-blokerów)', note: 'Klinicznie standard' },

    // Celiakia, autoimmunologia
    ttg_iga:    { ext: 'ttg_iga',    label: 'Przeciwciała anty-tTG IgA + IgA total', note: 'Celiakia — przyczyna niedoboru wzrostu' },
    ema:        { ext: 'ema',        label: 'Przeciwciała anty-endomyzjum (EMA)', note: 'Celiakia, potwierdzenie' },
    iga_total:  { ext: 'iga_total',  label: 'IgA całkowite',             note: 'Wykluczenie niedoboru IgA przed tTG IgA' },

    // Hematologia / inne
    spep:       { ext: 'spep',       label: 'Elektroforeza białek surowicy (SPEP)', note: 'Wykluczenie szpiczaka (osteoporoza)' },
    spep_upep:  { ext: 'spep_upep',  label: 'SPEP + UPEP + free light chains', note: 'Szpiczak mnogi, MGUS' },
    serum_iron: { ext: 'serum_iron', label: 'Żelazo, transferyna, ferrytyna', note: 'Hemochromatoza → wtórny hipogonadyzm' },
    copper_cerulo: { ext: 'copper_cerulo', label: 'Miedź + ceruloplazmina', note: 'Choroba Wilsona — przyczyna hipogonadyzmu' },
    hiv_test:   { ext: 'hiv_test',   label: 'Test HIV',                  note: 'Wtórny hipogonadyzm, niewyjaśniony spadek masy ciała' },

    // Endometrium / cytologia
    endometrium_us: { ext: 'endometrium_us', label: 'USG TV — endometrium', note: 'Krwawienia po menopauzie, hiperplasia' },
    mammography: { ext: 'mammography', label: 'Mammografia',             note: 'Przed HRT, kontrola po menopauzie' },
    pap_smear:  { ext: 'pap_smear',  label: 'Cytologia (PAP)',           note: 'Skrining raka szyjki' },
    afc:        { ext: 'afc',        label: 'AFC (Antral Follicle Count, USG TV)', note: 'Rezerwa jajnikowa — komplementarne do AMH' },

    // Inne tematyczne
    pcr_test:   { ext: 'pcr_test',   label: 'PCR / posiew',              note: 'Wykluczenie infekcji w gorączce nieznanego pochodzenia' },
    chest_xray: { ext: 'chest_xray', label: 'RTG klatki piersiowej',     note: 'Sarkoidoza, gruźlica (PAI), wole zamostkowe' },
    chest_ct:   { ext: 'chest_ct',   label: 'TK klatki piersiowej',      note: 'Sarkoidoza, MEN1/2, pheo ektopowy' },
    eye_exam:   { ext: 'eye_exam',   label: 'Badanie okulistyczne (pole widzenia)', note: 'Makrogruczolak przysadki — uciska skrzyżowanie' },
    vit_b12:    { ext: 'vit_b12',    label: 'Wit. B12 + kwas foliowy',   note: 'Anemia megaloblastyczna, autoimmunologiczne zapalenie żołądka' },
    parathyroid_us: { ext: 'parathyroid_us', label: 'USG przytarczyc + scyntygrafia MIBI', note: 'Pierwotna nadczynność przytarczyc' }
  };

  // ────────────────────────────────────────────────────────────────
  //  Panele kliniczne per wskazanie
  // ────────────────────────────────────────────────────────────────
  var DATA = {

    /* ═══════════════════════════════════════════════════════════════
     *  OŚ NADNERCZOWA
     * ═══════════════════════════════════════════════════════════════ */

    adrenal_insufficiency: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i klasyfikacja',
            body: 'Niedoczynność kory nadnerczy — niedostateczne wytwarzanie kortyzolu. Dwa typy: PAI (pierwotna — uszkodzenie na poziomie nadnerczy) vs SAI (wtórna — niedobór ACTH przysadkowego). W Polsce ~70–80% PAI to autoimmunologiczna choroba Addisona (przeciwciała anty-21-OH). SAI najczęściej JATROGENNA — wskutek długotrwałej steroidoterapii (zahamowanie osi podwzgórze-przysadka-nadnercza). Rozróżnienie PAI/SAI ma istotne znaczenie kliniczne — różnicuje wzorzec hormonalny, etiologię i sposób substytucji (PAI wymaga substytucji glikokortykosteroidem + mineralokortykosteroidem; SAI tylko glikokortykosteroidem).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm 2-stopniowy + wzorce różnicujące',
            items: [
              { label: 'I krok — skrining', text: 'kortyzol poranny (7:00–9:00, na czczo) + ACTH + elektrolity (Na, K) + glukoza na czczo.' },
              { label: 'Wzorzec PAI (pierwotna)', text: '↓ kortyzol + ↑↑ ACTH + hiponatremia + HIPERKALIEMIA + hipoglikemia (niedobór kortyzolu i aldosteronu).' },
              { label: 'Wzorzec SAI (wtórna)', text: '↓ kortyzol + N/↓ ACTH + hiponatremia (łagodniejsza) + BEZ hiperkaliemii (aldosteron zachowany — regulowany przez RAA niezależnie od ACTH).' },
              { label: 'II krok — potwierdzenie', text: 'test stymulacji Synacthen (250 μg ACTH i.v., pomiar kortyzolu w 0 i 30/60 min) — szczyt kortyzolu < 500 nmol/L (18 μg/dL) potwierdza niedoczynność.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'PAI (pierwotna)',
                text: 'uszkodzenie na poziomie nadnerczy:',
                detail: [
                  'Autoimmunologiczna choroba Addisona — ~70–80% PAI w Polsce; przeciwciała anty-21-OH; często w ramach autoimmunologicznego zespołu wielogruczołowego (APS-1, APS-2).',
                  'Gruźlica nadnerczy — istotna globalnie, w Polsce rzadziej.',
                  'Krwotok do nadnerczy — zespół Waterhouse\'a-Friderichsena (sepsa meningokokowa), antykoagulacja, urazy.',
                  'Jatrogenne — obustronna adrenalektomia; leki blokujące steroidogenezę — ketokonazol, etomidat, mitotan; immunoterapia onkologiczna (inhibitory punktów kontrolnych).',
                  'X-ALD (adrenoleukodystrofia sprzężona z X) — u chłopców i młodych mężczyzn z objawami neurologicznymi; VLCFA podwyższone.',
                  'Wrodzone — wrodzony przerost nadnerczy (WPN — osobne wskazanie).'
                ]
              },
              {
                label: 'SAI (wtórna)',
                text: 'niedobór ACTH przysadkowego:',
                detail: [
                  'Długotrwałe leczenie glikokortykosteroidami — NAJCZĘSTSZA przyczyna SAI w praktyce klinicznej; zahamowanie osi przysadka-nadnercza wymaga STOPNIOWEJ redukcji dawki przy odstawianiu.',
                  'Gruczolaki przysadki i ich leczenie operacyjne lub radioterapia.',
                  'Zespół Sheehana — martwica niedokrwienna przysadki po krwotoku poporodowym.',
                  'Urazy czaszki, krwotok do przysadki (apopleksja).',
                  'Choroby naciekowe — hipofizyt limfocytarny, hemochromatoza, sarkoidoza, histiocytoza.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka etiologii',
            items: [
              {
                label: 'Przy PAI',
                text: 'po potwierdzeniu pierwotnej niedoczynności:',
                detail: [
                  'Anty-21-OH (przeciwciała przeciwko 21-hydroksylazie nadnerczowej) — potwierdzenie autoimmunologicznej choroby Addisona.',
                  'Aldosteron + PRA/DRC — niedobór aldosteronu w klasycznej chorobie Addisona; przydatne do oceny postaci z brakiem mineralokortykosteroidów.',
                  'VLCFA (very long chain fatty acids) — u chłopców i młodych mężczyzn z objawami neurologicznymi; wykluczenie X-ALD.',
                  'Pakiet w kierunku innych chorób autoimmunologicznych przy APS — anty-TPO, anty-tTG, autoimmunologiczne POI.'
                ]
              },
              {
                label: 'Przy SAI',
                text: 'po potwierdzeniu wtórnej niedoczynności:',
                detail: [
                  'Ocena reszty osi przysadkowej — TSH/fT4 (wtórna niedoczynność tarczycy), prolaktyna (efekt przerwania szypuły), LH/FSH + testosteron/estradiol (hipogonadyzm hipogonadotropowy), IGF-1 (GHD).',
                  'MRI przysadki z gadolinium — wykluczenie zmian organicznych (gruczolak, czaszkogardlak, zmiany naciekowe, zespół pustego siodła).'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (skrining)',
          tests: [
            { id: 'cortisol', note: 'Pobranie 7:00–9:00, na czczo. < 138 nmol/L (5 μg/dL) → PAI prawdopodobna (wymaga testu potwierdzającego); > 500 nmol/L (18 μg/dL) → PAI wykluczona; przedział 138–500 nmol/L → wynik niejednoznaczny, wskazany test stymulacji Synacthen (Bornstein ES 2016).' },
            { id: 'acth',     note: 'Różnicuje PAI (↑↑) od SAI (norma/↓). Pobierać razem z kortyzolem porannym.' },
            { ext: 'sodium', label: 'Sód (Na)', note: 'Hiponatremia to najczęstsze zaburzenie elektrolitowe w niedoczynności kory nadnerczy — występuje u ~70–80% pacjentów z postacią pierwotną (PAI) w momencie rozpoznania.', description: 'W niedoczynności kory nadnerczy typowo stwierdza się HIPONATREMIĘ (Na < 135 mmol/L). Mechanizm w postaci pierwotnej (PAI): niedobór aldosteronu powoduje utratę sodu przez nerki, a niedobór kortyzolu prowadzi do zwiększonego wydzielania wazopresyny (ADH) i retencji wody — co dodatkowo rozcieńcza sód. W postaci wtórnej (SAI) hiponatremia także może wystąpić (z powodu niedoboru kortyzolu i zwiększonego ADH), ale jest zwykle łagodniejsza, ponieważ wydzielanie aldosteronu jest zachowane (oś renina-angiotensyna-aldosteron nie zależy od ACTH przysadkowego). Hiponatremia jest objawem częstym, ale niespecyficznym — wymaga interpretacji łącznie z potasem, kortyzolem i ACTH.' },
            { ext: 'potassium', label: 'Potas (K)', note: 'Hiperkaliemia występuje u ~30–50% pacjentów z pierwotną niedoczynnością kory nadnerczy (PAI). W postaci wtórnej (SAI) zwykle NIE występuje — wydzielanie aldosteronu jest zachowane.', description: 'W pierwotnej niedoczynności kory nadnerczy (PAI) typowo stwierdza się HIPERKALIEMIĘ (K > 5,0 mmol/L) — występuje u ~30–50% pacjentów. Mechanizm: niedobór aldosteronu zmniejsza wydalanie potasu przez nerki. W postaci wtórnej (SAI — niedobór ACTH przysadkowego) hiperkaliemia zwykle NIE występuje, ponieważ wydzielanie aldosteronu pozostaje prawidłowe (oś mineralokortykoidowa jest regulowana przez układ renina-angiotensyna, niezależnie od ACTH). Współwystępowanie HIPERKALIEMII I HIPONATREMII jest charakterystyczne dla pierwotnej niedoczynności kory nadnerczy z niedoborem mineralokortykosteroidów (klasyczna choroba Addisona) i pomaga różnicować PAI od SAI.' },
            { ext: 'glucose_fasting', label: 'Glukoza na czczo', note: 'Hipoglikemia (zwłaszcza na czczo) — wynik niedoboru kortyzolu. Częściej jawna u dzieci, gdzie może być pierwszym objawem; u dorosłych zwykle łagodna, ale w przełomie nadnerczowym bywa ciężka.', description: 'W niedoczynności kory nadnerczy typowo stwierdza się HIPOGLIKEMIĘ na czczo. Mechanizm: niedobór kortyzolu zmniejsza glukoneogenezę wątrobową i zwiększa obwodową wrażliwość na insulinę, co prowadzi do spadku glikemii — szczególnie w okresie głodzenia. Hipoglikemia występuje zarówno w postaci pierwotnej (PAI), jak i wtórnej (SAI). U dzieci hipoglikemia jest częstsza i może być pierwszym objawem niedoczynności kory nadnerczy (drgawki hipoglikemiczne u niemowlęcia). U dorosłych zwykle jest łagodna lub subkliniczna, ale w przełomie nadnerczowym może być ciężka i zagrażająca życiu. Hipoglikemia na czczo u pacjenta bez cukrzycy powinna nasuwać podejrzenie niedoczynności kory nadnerczy w diagnostyce różnicowej.' }
          ]
        },
        { name: 'Test potwierdzający',
          tests: [
            EXT.synacthen_test
          ]
        },
        { name: 'Etiologia (gdy potwierdzona PAI)',
          tests: [
            EXT.anti_21oh,
            { id: 'aldosterone', note: 'Niedobór w klasycznej chorobie Addisona (PAI z brakiem mineralokortykosteroidów).' },
            EXT.pra_pac
          ]
        },
        { name: 'Sytuacje szczególne',
          tests: [
            EXT.vlcfa
          ]
        }
      ],
      guideline: 'PTE / Endocrine Society 2016 (Bornstein i wsp.)',
      sources: [
        'Bornstein SR, Allolio B, Arlt W, et al. Diagnosis and treatment of primary adrenal insufficiency: An Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2016;101(2):364-389.',
        'Husebye ES, Pearce SH, Krone NP, Kämpe O. Adrenal insufficiency. Lancet. 2021;397(10274):613-629.',
        'Engelen M, Kemp S, de Visser M, et al. X-linked adrenoleukodystrophy (X-ALD): clinical presentation and guidelines for diagnosis, follow-up and management. Orphanet J Rare Dis. 2012;7:51.',
        'Bednarczuk T, Bolanowski M, Zgliczyński W i wsp. Choroba Addisona — diagnostyka i leczenie. Endokrynologia Polska. 2016;67(6):608-615.'
      ]
    },

    cushing: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i klasyfikacja etiologiczna',
            body: 'Zespół Cushinga — stan hiperkortyzolemii o różnej etiologii. ACTH-zależny (~80% przypadków): centralny — CHOROBA Cushinga (gruczolak przysadki produkujący ACTH, ~70%), ektopowy (guz pozaprzysadkowy produkujący ACTH — drobnokomórkowy rak płuca, rakowiak oskrzelowy, NET trzustki, ~10%). ACTH-niezależny (~20%): gruczolak nadnercza produkujący kortyzol (~10%), rak kory nadnercza (ACC, ~8%), przerost obustronny nadnerczy (zespoły genetyczne — Carney complex, McCune-Albright, PPNAD).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm 3-stopniowy (Endocrine Society 2008/2015)',
            items: [
              { label: '(1) Skrining', text: 'wymagane ≥ 2 dodatnie z 3 testów: DST 1 mg, kortyzol w DZM, kortyzol w ślinie nocnej.' },
              { label: '(2) Potwierdzenie autonomii', text: 'gdy skrining niejednoznaczny: 48-godzinny niskodawkowy test z deksametazonem, kortyzol w surowicy o północy.' },
              { label: '(3) Różnicowanie etiologii', text: 'po potwierdzeniu autonomii: oznaczenie ACTH różnicuje formę ACTH-zależną od niezależnej; dalsze testy lokalizacyjne.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Testy skriningowe',
            items: [
              {
                label: 'Test hamowania 1 mg deksametazonu (DST 1 mg)',
                text: 'najszerzej stosowany w Polsce:',
                detail: [
                  'Protokół: 1 mg deksametazonu doustnie o godz. 23:00, kortyzol w surowicy rano (8:00–9:00) na czczo.',
                  'Progi interpretacji: < 50 nmol/L (1,8 μg/dL) wyklucza autonomię; 50–138 nmol/L niejednoznaczne; > 138 nmol/L potwierdza autonomię.',
                  'Fałszywie dodatnie: estrogeny (doustna antykoncepcja, HRT — wzrost CBG), induktory CYP3A4 (fenytoina, ryfampicyna, karbamazepina), depresja, otyłość, ciąża, choroba alkoholowa.',
                  'Fałszywie ujemne rzadkie — przyspieszona eliminacja deksametazonu (niewydolność wątroby z indukcją enzymów).'
                ]
              },
              { label: 'Kortyzol w dobowej zbiórce moczu (UDFC)', text: 'pomiar wolnego kortyzolu w 24-godzinnej zbiórce moczu — ocenia całkowitą produkcję kortyzolu; wartości > 3-krotnie powyżej górnej granicy normy są diagnostyczne.' },
              { label: 'Kortyzol w ślinie nocnej', text: 'metoda NIEINWAZYJNA, oceniana w warunkach domowych; pobranie o godz. 23:00; ocenia rytm dobowy kortyzolu — utracony w zespole Cushinga.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Różnicowanie etiologii po potwierdzeniu autonomii',
            items: [
              {
                label: 'ACTH — kluczowy parametr różnicujący',
                text: 'oznaczenie ACTH bezpośrednio po potwierdzeniu autonomii:',
                detail: [
                  '< 5 pmol/L (< 20 pg/mL) — ACTH-niezależny (nadnerczowy) → TK nadnerczy wielofazowy.',
                  '> 5 pmol/L — ACTH-zależny (przysadkowy lub ektopowy) → MRI przysadki, ewentualnie HD-DST, test CRH, IPSS, TK klatki/jamy brzusznej.'
                ]
              },
              {
                label: 'TK nadnerczy wielofazowe z kontrastem (ACTH-niezależny)',
                text: 'standard diagnostyczny — protokół 4-fazowy:',
                detail: [
                  'GRUCZOLAK nadnercza — HU natywne < 10 (lipid-rich) lub 10–25 (lipid-poor), absolute wash-out > 60% lub relative > 40%, jednorodna struktura.',
                  'RAK KORY NADNERCZA (ACC) — wymiar > 4 cm (często > 6 cm), HU natywne > 30, niski wash-out < 50%, niejednorodna struktura, naciekanie.',
                  'BILATERALNA NODULARNA HIPERPLAZJA — obustronny przerost; zespoły genetyczne (Carney complex — PRKAR1A, McCune-Albright — GNAS, PPNAD).'
                ]
              },
              { label: 'MRI przysadki z gadolinium (ACTH-zależny)', text: 'wykrycie gruczolaka przysadki — mikro- (< 10 mm) vs makrogruczolak (≥ 10 mm); część mikrogruczolaków uciekająca radiologicznie wymaga IPSS.' },
              {
                label: 'IPSS — cewnikowanie zatok skalistych dolnych',
                text: 'inwazyjna procedura specjalistyczna:',
                detail: [
                  'Wskazania: ACTH-zależny zespół Cushinga z ujemnym MRI przysadki LUB niejednoznaczny obraz różnicujący centralny od ektopowego.',
                  'Pomiar ACTH w zatokach skalistych vs obwodowo; gradient centralny/obwodowy > 2 (bazalnie) lub > 3 (po stymulacji CRH) potwierdza centralne pochodzenie.',
                  'Wykonywana w ośrodkach referencyjnych.'
                ]
              },
              { label: 'TK klatki piersiowej / jamy brzusznej + scyntygrafia DOTATATE', text: 'gdy podejrzenie ektopowego ACTH — poszukiwanie guza neuroendokrynnego (rakowiak oskrzelowy, SCLC, NET trzustki, rakowiak grasicy); ⁶⁸Ga-DOTATATE PET ma czułość > 90% dla NET.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Skrining (≥ 2 dodatnie z 3)',
          tests: [
            { id: 'cortisol', label: 'Test hamowania z 1 mg deksametazonu', note: 'Najszerzej stosowany test skriningowy w Polsce. Wynik < 50 nmol/L wyklucza autonomię.', description: 'Protokół: pacjent przyjmuje doustnie 1 mg deksametazonu o godz. 23:00 (przed snem). Następnego dnia rano (8:00–9:00) na czczo pobranie kortyzolu w surowicy. Kryteria interpretacji: < 50 nmol/L (1,8 μg/dL) → wyklucza autonomię kortyzolu (test prawidłowy); 50–138 nmol/L → wynik niejednoznaczny, wskazane rozszerzenie diagnostyki (niskodawkowy 48-godzinny test, kortyzol w DZM lub ślinie nocnej); > 138 nmol/L (5 μg/dL) → potwierdza autonomię kortyzolu (test patologiczny). Fałszywie dodatnie: estrogeny (doustne środki antykoncepcyjne, HRT — wzrost CBG), induktory CYP3A4 (fenytoina, ryfampicyna, karbamazepina), depresja, otyłość, ciąża, choroba alkoholowa. Fałszywie ujemne: rzadkie — przyspieszona eliminacja deksametazonu (niewydolność wątroby z indukcją enzymów). Przycisk "Załaduj do przelicznika" pozwala otworzyć konwerter kortyzolu do przeliczenia jednostek (nmol/L ↔ μg/dL ↔ ng/mL).' },
            EXT.udfc_24h,
            EXT.salivary_cortisol
          ]
        },
        { name: 'Potwierdzenie autonomii (gdy skrining niejednoznaczny)',
          tests: [
            EXT.low_dose_dst48,
            { id: 'cortisol', label: 'Kortyzol w surowicy o północy', note: 'Utrata rytmu dobowego — w prawidłowym kortyzol o północy < 50% wartości porannej, w Cushingu utracony rytm dobowy.', description: 'Pomiar kortyzolu w surowicy pobranej w godz. 0:00–1:00 (północ). Wymaga hospitalizacji — pacjent ma być śpiący w momencie pobrania (przebudzenie wywołuje stres → wzrost kortyzolu, fałszywie dodatni wynik). Optymalnie: dostęp żylny założony wieczorem, pobranie po godz. 22:00 gdy pacjent zasypia. W warunkach fizjologicznych kortyzol o północy < 50% wartości porannej (zachowany rytm dobowy — najniższe stężenie o 22:00–2:00). W zespole Cushinga rytm dobowy kortyzolu jest nieprawidłowy, kortyzol o północy może być podwyższony i porównywalny do wartości porannych. Kryterium dodatnie: kortyzol o północy > 207 nmol/L (7,5 μg/dL) u dorosłych (Nieman ES 2008). U dzieci > 12 mies. próg analogiczny; u niemowląt < 12 mies. rytm dobowy jeszcze nie ustalony — test niemiarodajny.' }
          ]
        },
        { name: 'Różnicowanie etiologii (po potwierdzeniu autonomii)',
          tests: [
            { id: 'acth', note: '< 5 pmol/L (< 20 pg/mL) → ACTH-niezależny (nadnerczowy); > 5 pmol/L → ACTH-zależny (przysadkowy lub ektopowy).' },
            EXT.high_dose_dst,
            EXT.crh_test,
            EXT.pituitary_mri,
            { ext: 'adrenal_ct_cushing', label: 'TK nadnerczy wielofazowe z kontrastem', note: 'Standard diagnostyczny w ACTH-niezależnym zespole Cushinga (ESE 2018, ACC guidelines). Różnicowanie gruczolaka nadnercza od raka kory nadnercza (ACC) i przerostu obustronnego.', description: 'TK nadnerczy wielofazowe z kontrastem dożylnym — standard diagnostyczny w ACTH-niezależnym zespole Cushinga (ACTH suprymowane < 5 pmol/L → guz nadnercza pewny) wg wytycznych ESE 2018 ACC (Fassnacht i wsp.). Protokół 4-fazowy: (1) faza natywna (bez kontrastu) — pomiar densytometrii w jednostkach Hounsfielda (HU); (2) faza tętnicza (~25–40 s po podaniu kontrastu) — ocena unaczynienia; (3) faza żylna (~70 s) — ocena charakteru zmiany; (4) faza opóźniona (10–15 min) — obliczenie wash-out kontrastu. Różnicowanie: (1) GRUCZOLAK NADNERCZA produkujący kortyzol — wymiar 2–4 cm, HU natywne < 10 (lipid-rich) lub 10–25 (lipid-poor; wartości > 25 HU sugerują podejrzenie złośliwości lub pheochromocytoma), absolute wash-out > 60% lub relative wash-out > 40% potwierdza gruczolaka, regularna otoczka, jednorodna struktura; najczęstsza przyczyna ACTH-niezależnego Cushinga (~10% wszystkich Cushingów); (2) RAK KORY NADNERCZA (ACC, adrenocortical carcinoma) — wymiar zwykle > 4 cm (często > 6 cm), HU natywne > 30, niski wash-out (< 50%), niejednorodna struktura (martwica wewnątrzguzowa, zwapnienia), nieregularny brzeg, naciekanie tkanek przyległych, czasem przerzuty (płuca, wątroba); rzadszy (~8% Cushingów), ale rokowanie znacznie gorsze; (3) BILATERALNA NODULARNA HIPERPLAZJA — obustronny przerost nadnerczy, liczne guzki, klinicznie często związana z zespołami genetycznymi (Carney complex — PRKAR1A, McCune-Albright — GNAS, primary pigmented nodular adrenocortical disease — PPNAD). Przy wymiarze guza > 4 cm i podejrzeniu ACC — kwalifikacja do operacji; NIE wykonywać biopsji przed wykluczeniem pheochromocytoma poprzez oznaczenie metanefryn! Alternatywa dla osób z przeciwwskazaniami do kontrastu jodowego (niewydolność nerek eGFR < 30, alergia, nadczynność tarczycy niewyrównana): MRI nadnerczy z sekwencjami chemical-shift.' },
            { ext: 'chest_ct_ectopic', label: 'TK klatki piersiowej / jamy brzusznej', note: 'Gdy podejrzenie ektopowego ACTH — poszukiwanie źródła pozaprzysadkowego.', description: 'Wskazania: dodatni test wysokodawkowy z deksametazonem z brakiem supresji LUB ujemny test CRH przy potwierdzonym ACTH-zależnym Cushingu i ujemnym MRI przysadki. Cel: identyfikacja guza neuroendokrynnego produkującego ACTH ektopowo. Najczęstsze źródła wg współczesnych danych (Sweeney 2018 Endocr Rev, Findling 2017 Eur J Endocrinol, Aniszewski 2001 World J Surg): rakowiak oskrzelowy/płucny (~25–45% — najczęstsza przyczyna ektopowego ACTH w przewlekłym przebiegu), drobnokomórkowy rak płuca (SCLC, ~10–25% — częściej w piorunującym przebiegu, niekiedy nierozpoznany przed śmiercią pacjenta), rakowiak grasicy (~10%), guz neuroendokrynny trzustki (NET, ~5%), rakowiak jelita cienkiego/wyrostka robaczkowego, rak rdzeniasty tarczycy (MTC), pheochromocytoma (rzadko). Diagnostyka obrazowa: pierwotnie TK klatki piersiowej cienkimi warstwami z kontrastem i.v.; jeśli ujemne — TK jamy brzusznej + scyntygrafia receptorów somatostatynowych metodą PET-DOTATATE (⁶⁸Ga-DOTATATE) — czułość > 90% dla guzów neuroendokrynnych.' }
          ]
        },
        { name: 'Sytuacje szczególne (specjalistyczne)',
          tests: [
            EXT.ipss
          ]
        }
      ],
      guideline: 'Endocrine Society 2008/2015 (Nieman i wsp.) / PTE',
      sources: [
        'Nieman LK, Biller BMK, Findling JW, et al. The diagnosis of Cushing\'s syndrome: An Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2008;93(5):1526-1540.',
        'Nieman LK, Biller BMK, Findling JW, et al. Treatment of Cushing\'s syndrome: An Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2015;100(8):2807-2831.',
        'Fleseriu M, Auchus R, Bancos I, et al. Consensus on diagnosis and management of Cushing\'s disease: A guideline update. Lancet Diabetes Endocrinol. 2021;9(12):847-875.',
        'Findling JW, Raff H. Diagnosis of endocrine disease: Differentiation of pathologic/neoplastic hypercortisolism (Cushing\'s syndrome) from physiologic/non-neoplastic hypercortisolism. Eur J Endocrinol. 2017;176(5):R205-R216.',
        'Bednarczuk T, Bolanowski M, Sworczak K i wsp. Diagnostyka i postępowanie w zespole Cushinga — stanowisko PTE. Endokrynologia Polska. (aktualizacja PTE).',
        'Biller BMK, Grossman AB, Stewart PM, et al. Treatment of adrenocorticotropin-dependent Cushing\'s syndrome: A consensus statement. J Clin Endocrinol Metab. 2008;93(7):2454-2462.'
      ]
    },

    cah: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i postacie kliniczne',
            body: 'Wrodzony Przerost Nadnerczy (WPN) — w ~95% przypadków niedobór 21-hydroksylazy (mutacje genu CYP21A2). Dziedziczenie autosomalne recesywne. Trzy główne postacie kliniczne: KLASYCZNA z utratą soli (~75% klasycznej — noworodek z odwodnieniem, hiponatremią, HIPERKALIEMIĄ, możliwym przełomem solnym); KLASYCZNA prosta wirylizująca (~25% klasycznej — dziewczynka z wirylizacją genitaliów lub chłopak z przedwczesnym pokwitaniem rzekomym); NIEKLASYCZNA (NCAH, późno ujawniająca się — kobieta dorosła z hiperandrogenizmem, PCOS, niepłodnością).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny — zależny od kontekstu',
            items: [
              { label: '(1) Noworodek', text: 'skrining bibułowy 17-OHP — w Polsce powszechny od 2018 r. (rozszerzenie programu przesiewu noworodków).' },
              { label: '(2) Dziecko / dorosły', text: '17-OHP rano (kobiety w fazie folikularnej, dni 2–5) + ACTH + kortyzol + profil androgenowy.' },
              { label: '(3) Test stymulacji ACTH', text: 'gdy 17-OHP bazalny w zakresie niejednoznacznym (6–30 nmol/L) — Synacthen 250 μg i.v., pomiar 17-OHP w 0 i 60 min.' },
              { label: '(4) Potwierdzenie genetyczne', text: 'sekwencjonowanie CYP21A2; poradnictwo genetyczne (autosomalna recesywna, ryzyko 25% u rodzeństwa).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wzorzec laboratoryjny i progi',
            items: [
              {
                label: '17-OH-progesteron — progi diagnostyczne (Speiser ES 2018)',
                text: 'kluczowy marker niedoboru 21-hydroksylazy:',
                detail: [
                  '> 30 nmol/L (10 ng/mL) — klasyczny WPN (potwierdza rozpoznanie).',
                  '6–30 nmol/L — niejednoznaczne, wskazany test stymulacji ACTH.',
                  '< 6 nmol/L — wyklucza klasyczny WPN, ale część NCAH ma wartości bazalne < 6 i ujawnia się dopiero po stymulacji ACTH.',
                  'Pobranie: rano (7:00–9:00); kobiety w fazie folikularnej (dni 2–5) — fizjologicznie wyższe wartości w fazie lutealnej, ciąży i u noworodków w pierwszych dobach życia.'
                ]
              },
              { label: 'Androstendion', text: 'wzrasta równolegle z 17-OHP; marker MONITOROWANIA leczenia hydrokortyzonem — cel: środkowy zakres normy dla wieku (zbyt niska wartość = nadmierna substytucja, zbyt wysoka = niedostateczna).' },
              { label: 'Testosteron całkowity + DHEA-S', text: 'profil androgenowy — podwyższone w klasycznym WPN i NCAH, odzwierciedlają hiperandrogenizm.' },
              {
                label: 'Postać z utratą soli — elektrolity + PRA',
                text: 'u noworodków/niemowląt z odwodnieniem:',
                detail: [
                  'Hiponatremia (Na < 135 mmol/L) — niedobór aldosteronu → utrata sodu z moczem.',
                  'HIPERKALIEMIA (K > 5,0 mmol/L) — niedobór aldosteronu → zmniejszone wydalanie potasu.',
                  'PRA (aktywność reninowa osocza) WYSOKA — kompensacyjna aktywacja RAA wobec niedoboru aldosteronu; służy także do monitorowania leczenia mineralokortykosteroidami (fludrokortyzon).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Rzadkie postaci WPN — diagnostyka rozszerzona',
            items: [
              {
                label: 'Niedobór 11β-hydroksylazy (~5% klasycznego WPN)',
                text: 'CYP11B1 — odmienny obraz hormonalny:',
                detail: [
                  'NADCIŚNIENIE TĘTNICZE + wirylizacja (gromadzenie 11-deoksykortykosteronu o aktywności mineralokortykoidowej).',
                  '11-deoksykortyzol PODWYŻSZONY — kluczowy marker.',
                  '17-OHP może być umiarkowanie podwyższony, ale androstendion znacznie podwyższony.'
                ]
              },
              { label: 'Niedobór 3β-HSD', text: 'rzadki, cechy interpłciowe u noworodków obu płci (zaburzenie syntezy zarówno androgenów, jak i estrogenów); 17-OH-pregnenolon znacznie podwyższony.' },
              { label: 'Niedobór 17α-hydroksylazy', text: 'rzadki — nadciśnienie tętnicze + brak rozwoju płciowego (brak syntezy steroidów płciowych); kortyzol niski, kortykosteron znacznie podwyższony.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (21-hydroksylaza)',
          tests: [
            { id: 'oh17_progesterone', note: 'Rano, kobiety w fazie folikularnej (dni 2–5). Progi: > 30 nmol/L (10 ng/mL) — klasyczny WPN; 6–30 — niejednoznaczne (wskazany test ACTH); < 6 — wyklucza klasyczny, ale nie zawsze wyklucza NCAH.', description: 'Pobranie: rano (7:00–9:00), kobiety w I fazie cyklu menstruacyjnego (dni 2–5). Progi diagnostyczne 17-OH-progesteronu (Speiser ES 2018): > 30 nmol/L (10 ng/mL) — klasyczny WPN; 6–30 nmol/L — wynik niejednoznaczny, wskazany test stymulacji ACTH (Synacthen); < 6 nmol/L — wyklucza klasyczny WPN, ale część przypadków NCAH ma wartości bazalne < 6 i ujawnia się dopiero po stymulacji ACTH. Wartości fizjologicznie wyższe w fazie lutealnej cyklu, w ciąży, u noworodków w pierwszych dobach życia (skrining w 3.–5. dobie). Pobranie w fazie folikularnej minimalizuje fałszywie dodatnie wyniki.' },
            { id: 'acth' },
            { id: 'cortisol' },
            { id: 'androstenedione', note: 'Wzrasta równolegle z 17-OHP. Marker monitorowania leczenia hydrokortyzonem (cel: środkowy zakres normy dla wieku).' },
            { id: 'testosterone_total' },
            { id: 'dhea_s' }
          ]
        },
        { name: 'Postać z utratą soli (objawy odwodnienia, hipotensja u noworodka/niemowlęcia)',
          tests: [
            EXT.sodium,
            EXT.potassium,
            { ext: 'pra_pac', label: 'Aktywność reninowa osocza (PRA / DRC)', note: 'W klasycznej postaci z utratą soli PRA jest wysoka (utracona kompensacja niedoboru aldosteronu).', description: 'Aktywność reninowa osocza (PRA) lub bezpośrednie stężenie reniny (DRC). W klasycznej postaci WPN z utratą soli niedobór 21-hydroksylazy uniemożliwia syntezę aldosteronu — organizm kompensacyjnie aktywuje układ RAA, stąd PRA jest wysoka. Pomiar PRA służy także do monitorowania leczenia mineralokortykosteroidami (fludrokortyzon): cel — wartość w środkowym zakresie normy dla wieku. PRA niska może sugerować przedawkowanie fludrokortyzonu; PRA wysoka — niedostateczna substytucja.' }
          ]
        },
        { name: 'Test potwierdzający i genetyka',
          tests: [
            { ext: 'synacthen_acth_cah', label: 'Test stymulacji ACTH (Synacthen, pomiar 17-OHP)', note: 'Gdy 17-OHP bazalny 6–30 nmol/L. Szczyt 17-OHP po stymulacji > 30 nmol/L (10 ng/mL) potwierdza NCAH lub klasyczny WPN.', description: 'Test stymulacji ACTH w diagnostyce WPN — wariant z pomiarem 17-OH-progesteronu (a nie kortyzolu jak w PAI). Wskazany gdy 17-OHP bazalny w zakresie niejednoznacznym (6–30 nmol/L). Protokół: podanie i.m. lub i.v. 250 μg tetracosactide (Synacthen) rano. Pomiar 17-OHP przed (0 min) i w 60. minucie po podaniu. Kryterium: szczyt 17-OHP > 30 nmol/L (10 ng/mL) → potwierdza NCAH lub klasyczny WPN; > 100 nmol/L sugeruje klasyczny WPN, 30–100 nmol/L sugeruje NCAH. Nomogram White\'a–Speisera pozwala różnicować homozygot, heterozygot i osoby zdrowe na podstawie stężeń 17-OHP przed i po stymulacji. Test można rozszerzyć o równoległy pomiar innych prekursorów (17-OH-pregnenolon, 11-deoksykortyzol) — wskazane przy podejrzeniu rzadkich postaci WPN.' },
            { ext: 'cyp21a2_gen', label: 'Genetyka CYP21A2', note: 'Potwierdza rozpoznanie. Kluczowe dla poradnictwa genetycznego (autosomalna recesywna, ryzyko 25% u rodzeństwa).', description: 'Sekwencjonowanie genu CYP21A2 (chromosom 6p21.3) — potwierdza rozpoznanie WPN z niedoboru 21-hydroksylazy. Najczęstsze mutacje sprawcze: I2G (~30%, splice-site), I172N (~20%, postać prosta wirylizująca), V281L (~50% NCAH), delecja genu / konwersja z pseudogenem CYP21A1P (~20%, klasyczna z utratą soli). Dziedziczenie autosomalne recesywne. Ryzyko zachorowania u rodzeństwa probanta: 25%. Diagnostyka prenatalna (kosmówka 10.–12. tydzień ciąży) możliwa po identyfikacji mutacji u rodziców — pozwala wczesne rozpoznanie u płodu. **UWAGA: prenatalne leczenie deksametazonem płodów żeńskich w celu zapobiegania wirylizacji genitaliów jest obecnie traktowane jako EKSPERYMENTALNE i NIE jest zalecane rutynowo wg wytycznych Endocrine Society 2018 (Speiser i wsp.) — powinno być wykonywane wyłącznie w ramach zatwierdzonych protokołów badawczych ze względu na obawy długoterminowe (potencjalne skutki neurorozwojowe u płodów, niepotrzebna ekspozycja 7 z 8 płodów które nie wymagają leczenia).**' }
          ]
        },
        { name: 'Sytuacje szczególne (rzadkie postaci WPN)',
          tests: [
            { id: 'deoxycortisol_11', note: 'Przy podejrzeniu niedoboru 11β-hydroksylazy (CAH typ IV, ~5% klasycznego WPN — nadciśnienie + wirylizacja).' },
            { id: 'oh17_pregnenolone', note: 'Przy podejrzeniu niedoboru 3β-HSD (rzadki, cechy interpłciowe).' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Speiser i wsp.) / PTEDD',
      sources: [
        'Speiser PW, Arlt W, Auchus RJ, et al. Congenital adrenal hyperplasia due to steroid 21-hydroxylase deficiency: An Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2018;103(11):4043-4088.',
        'Merke DP, Auchus RJ. Congenital adrenal hyperplasia due to 21-hydroxylase deficiency. N Engl J Med. 2020;383(13):1248-1261.',
        'White PC, Speiser PW. Congenital adrenal hyperplasia due to 21-hydroxylase deficiency. Endocr Rev. 2000;21(3):245-291.',
        'New MI, Abraham M, Gonzalez B, et al. Genotype-phenotype correlation in 1,507 families with congenital adrenal hyperplasia owing to 21-hydroxylase deficiency. Proc Natl Acad Sci USA. 2013;110(7):2611-2616.',
        'Kucharska AM, Beń-Skowronek I, Walczak M i wsp. Rekomendacje PTEDD dotyczące diagnostyki i leczenia wrodzonego przerostu nadnerczy. Endokrynologia Pediatryczna. 2018;17(1):11-30.',
        'Instytut Matki i Dziecka. Program badań przesiewowych noworodków w Polsce — rozszerzenie o 17-OH-progesteron (CAH). 2018.'
      ]
    },

    primary_aldosteronism: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i epidemiologia',
            body: 'Pierwotny hiperaldosteronizm (PHA) — autonomiczne nadmierne wydzielanie aldosteronu przez nadnercza (jednostronny gruczolak Conn lub obustronny przerost). Odpowiada za ~5–10% nadciśnienia tętniczego ogółem i ~20% nadciśnienia opornego. W Polsce skrining wykonywany u ~1% pacjentów z HT — istotnie NIEDODIAGNOZOWANY. Rozpoznanie pozwala na celowane leczenie: w postaci jednostronnej — adrenalektomia laparoskopowa (potencjalnie wyleczenie), w obustronnej — antagoniści receptora mineralokortykoidowego (MRA — spironolakton, eplerenon).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Wskazania do skriningu (Endocrine Society 2016 / PTNT 2019)',
            items: [
              { label: 'Nadciśnienie z hipokaliemią', text: 'jawną lub indukowaną diuretykami; klasyczne wskazanie.' },
              { label: 'Nadciśnienie OPORNE', text: '≥ 3 leki w pełnych dawkach, w tym diuretyk.' },
              { label: 'Nadciśnienie CIĘŻKIE', text: '≥ 160/100 mmHg.' },
              { label: 'Nadciśnienie u młodych', text: '< 40 lat — wczesne nadciśnienie wymaga wykluczenia wtórnych przyczyn endokrynologicznych.' },
              { label: 'Incidentaloma nadnercza + nadciśnienie', text: 'ocena czynności hormonalnej guza nadnercza.' },
              { label: 'Nadciśnienie + bezdech senny (OSA)', text: 'częsta asocjacja kliniczna.' },
              { label: 'Dodatni wywiad rodzinny', text: 'PHA u krewnego pierwszego stopnia lub udar mózgu < 40. r.ż. w rodzinie.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Algorytm 3-stopniowy',
            items: [
              {
                label: '(1) Skrining — ARR (stosunek aldosteron/PRA)',
                text: 'kluczowe są warunki pobrania i przygotowanie:',
                detail: [
                  'Warunki pobrania: rano (8:00–10:00), pacjent na nogach ≥ 2 h przed pobraniem, ostatnie 5–15 min siedząc.',
                  'WYRÓWNANIE kaliemii > 4,0 mmol/L PRZED pobraniem — hipokaliemia hamuje aldosteron i daje fałszywie ujemny wynik.',
                  'Odstawienie leków wpływających: MRA (spironolakton, eplerenon) 4–6 tygodni; β-blokery 2 tygodnie; ACEI, ARB, diuretyki w miarę możliwości; α-blokery (doksazosyna) i blokery kanału wapniowego (werapamil, diltiazem) NIE wpływają istotnie i mogą być kontynuowane.',
                  'ARR > 30 (z aldosteronem w ng/dL i reniną w ng/mL/h) jest progiem skriningowym — wskazane potwierdzenie.'
                ]
              },
              { label: '(2) Potwierdzenie — test obciążenia solą lub fludrokortyzonowy', text: 'test obciążenia 0,9% NaCl 2 L i.v. w 4 h — aldosteron po obciążeniu > 5 ng/dL (lub > 10 zależnie od metody) potwierdza PHA; alternatywa to test fludrokortyzonowy lub doustny test obciążenia solą (4 dni soli + pomiar aldosteronu w DZM).' },
              {
                label: '(3) Lokalizacja — TK nadnerczy + AVS',
                text: 'różnicowanie jednostronnego od obustronnego — kluczowe dla wyboru leczenia:',
                detail: [
                  'TK nadnerczy wielofazowe z kontrastem — wstępna ocena anatomiczna (gruczolak, przerost).',
                  'AVS (cewnikowanie żył nadnerczowych) — ZŁOTY STANDARD różnicowania jednostronnego od obustronnego.',
                  'Wynik AVS: gradient lateralizacji aldosteron/kortyzol > 4:1 → jednostronny → kwalifikacja do adrenalektomii laparoskopowej.',
                  'Brak lateralizacji → obustronny przerost (BAH) → leczenie farmakologiczne MRA.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Skrining (ARR)',
          tests: [
            { id: 'aldosterone', note: 'Pobranie rano (8:00–10:00), pacjent na nogach ≥ 2 h, ostatnie 5–15 min siedząc.' },
            EXT.pra_pac,
            EXT.arr,
            { ext: 'potassium', label: 'Potas (K)', note: 'Uwaga: ~50% pacjentów z PHA ma normokaliemię — brak hipokaliemii NIE wyklucza rozpoznania.', description: 'Przed pobraniem wyrównać kaliemię (K > 4,0 mmol/L) — jest to warunek wiarygodności wskaźnika ARR i testu obciążenia solą. Hipokaliemia hamuje wydzielanie aldosteronu, co daje fałszywie ujemny wynik.' },
            { ext: 'sodium', label: 'Sód (Na)', note: 'W PHA zwykle prawidłowy lub w górnym zakresie normy (140–145 mmol/L) — niediagnostyczny, ale przydatny w różnicowaniu.', description: 'W PHA nadmiar mineralokortykoidów powoduje retencję sodu, ale nerki "uciekają" przed nadmierną hipernatremią poprzez zjawisko aldosterone escape — stąd sód jest zwykle w górnym zakresie normy. Hiponatremia przemawia przeciwko PHA i sugeruje wtórny hiperaldosteronizm (np. niewydolność serca, marskość, zespół nerczycowy) lub PAI.' }
          ]
        },
        { name: 'Test potwierdzający',
          tests: [
            EXT.saline_load
          ]
        },
        { name: 'Lokalizacja (gdy PHA potwierdzone)',
          tests: [
            EXT.adrenal_ct,
            EXT.avs
          ]
        }
      ],
      guideline: 'Endocrine Society 2016 (Funder i wsp.) / PTNT 2019',
      sources: [
        'Funder JW, Carey RM, Mantero F, et al. The management of primary aldosteronism: Case detection, diagnosis, and treatment: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2016;101(5):1889-1916.',
        'Tykarski A, Filipiak KJ, Januszewicz A i wsp. Zasady postępowania w nadciśnieniu tętniczym — 2019 rok. Wytyczne PTNT. Nadciśnienie Tętnicze w Praktyce. 2019;5(1):1-86.',
        'Williams B, Mancia G, Spiering W, et al. 2018 ESC/ESH Guidelines for the management of arterial hypertension. Eur Heart J. 2018;39(33):3021-3104.',
        'Mulatero P, Bertello C, Veglio F, et al. Confirmatory tests for the diagnosis of primary aldosteronism. Horm Metab Res. 2010;42(6):406-410.',
        'Ahmed AH, Cowley D, Wolley M, et al. Seated saline suppression testing for the diagnosis of primary aldosteronism. J Clin Endocrinol Metab. 2014;99(8):2745-2753.',
        'Januszewicz A, Prejbisz A, Januszewicz M i wsp. Stanowisko PTNT w sprawie diagnostyki i leczenia pierwotnego hiperaldosteronizmu. Nadciśnienie Tętnicze w Praktyce. 2021;7(2):51-79.'
      ]
    },

    adrenal_tumor: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Incidentaloma nadnercza — zmiana przypadkowo wykryta w obrazowaniu wykonanym z innego powodu (najczęściej w TK jamy brzusznej z innych wskazań), o wymiarze > 1 cm. Częstość w populacji dorosłych: ~4–7% w TK, rośnie z wiekiem. KAŻDY incidentaloma > 1 cm wymaga DWUSTOPNIOWEJ oceny: (1) czynności hormonalnej (czy zmiana jest czynna), (2) ryzyka złośliwości (na podstawie cech radiologicznych).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Skrining hormonalny obowiązkowy (każdy incidentaloma)',
            items: [
              { label: 'Subkliniczny zespół Cushinga', text: 'test hamowania 1 mg DST — najczęstsza nadczynność wykrywana w incidentaloma (~5–10% przypadków).' },
              { label: 'Pheochromocytoma', text: 'wolne metoksykatecholaminy w osoczu LUB frakcjonowane metanefryny w DZM. KRYTYCZNE: oznaczenie obowiązkowe przed jakąkolwiek operacją lub biopsją — biopsja nierozpoznanego pheochromocytoma może wywołać PRZEŁOM KATECHOLAMINOWY (zagrażający życiu kryzys nadciśnieniowy).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Skrining warunkowy — zależnie od kontekstu klinicznego',
            items: [
              { label: 'Przy nadciśnieniu lub hipokaliemii', text: 'ARR (stosunek aldosteron/PRA) — skrining hiperaldosteronizmu pierwotnego (osobne wskazanie).' },
              {
                label: 'Przy wirylizacji lub hirsutyzmie u kobiet',
                text: 'guz nadnercza produkujący androgeny:',
                detail: [
                  'DHEA-S — znacznie podwyższony (> 700 μg/dL / > 18,9 μmol/L) silnie sugeruje guz nadnercza.',
                  'Testosteron całkowity — uzupełniająco; znaczne podwyższenie wymaga pilnej diagnostyki onkologicznej.',
                  'Szybka progresja wirylizacji jest objawem alarmowym.'
                ]
              },
              { label: 'Przy podejrzeniu WPN', text: '17-OH-progesteron — wykluczenie wrodzonego niedoboru 21-hydroksylazy (klinicznie najczęściej u dorosłych kobiet — postać nieklasyczna NCAH).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Obrazowanie i ocena ryzyka złośliwości (ESE 2023)',
            items: [
              {
                label: 'TK nadnerczy wielofazowe z kontrastem (4-fazowe) — pierwszy rzut',
                text: 'standard diagnostyczny — różnicuje typowe zmiany:',
                detail: [
                  'GRUCZOLAK — HU natywne < 10 (lipid-rich) lub 10–25 (lipid-poor); absolute wash-out > 60% lub relative > 40%; jednorodna struktura, regularna otoczka.',
                  'RAK KORY NADNERCZA (ACC) — wymiar > 4 cm (często > 6 cm), HU natywne > 30, niski wash-out (< 50%), niejednorodna struktura (martwica, zwapnienia), nieregularny brzeg, możliwe przerzuty.',
                  'PHEOCHROMOCYTOMA — HU natywne > 30, wzmożone unaczynienie, jednorodna lub niejednorodna; rozpoznawane biochemicznie (metanefryny), nie radiologicznie.'
                ]
              },
              { label: 'MRI z sekwencjami chemical-shift — drugi rzut', text: 'wskazany przy niejednoznacznym TK, przeciwwskazaniach do kontrastu jodowego (CKD eGFR < 30, alergia na kontrast, nadczynność tarczycy niewyrównana) lub u dzieci/młodych pacjentek (mniejsze narażenie na promieniowanie).' },
              {
                label: 'Decyzje kliniczne',
                text: 'na podstawie wymiaru, cech radiologicznych i czynności hormonalnej:',
                detail: [
                  'Wymiar > 4 cm + cechy złośliwości w obrazowaniu → kwalifikacja do operacji (adrenalektomia).',
                  'obowiązkowe wykluczenie pheo metanefrynami PRZED operacją lub biopsją.',
                  'Łagodne, niewydzielające gruczolaki < 4 cm → obserwacja (kontrolne TK/MRI po 6–12 mies., później mniej często).'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Skrining hormonalny obowiązkowy (każdy incidentaloma)',
          tests: [
            { id: 'cortisol', label: 'Test hamowania z 1 mg deksametazonu', note: 'Wykluczenie subklinicznego zespołu Cushinga (najczęstsza nadczynność w incidentaloma, ~5–10%).', description: 'Pacjent przyjmuje doustnie 1 mg deksametazonu o godz. 23:00 (przed snem). Następnego dnia rano (8:00–9:00) na czczo pobranie kortyzolu w surowicy. Kryteria: < 50 nmol/L (1,8 μg/dL) → wyklucza subkliniczny zespół Cushinga; 50–138 nmol/L (1,8–5,0 μg/dL) → wynik niejednoznaczny, rozważyć rozszerzenie (kortyzol w DZM, kortyzol w ślinie nocnej, niskodawkowy 48-godzinny test z deksametazonem); > 138 nmol/L → autonomia kortyzolu, wskazana dalsza diagnostyka. Fałszywie dodatnie: estrogeny (doustne środki antykoncepcyjne, HRT), induktory CYP3A4 (fenytoina, ryfampicyna, karbamazepina), wzrost CBG (ciąża), depresja, otyłość. Fałszywie ujemne: przyspieszona eliminacja deksametazonu, niedoczynność wątroby (rzadziej).' },
            EXT.metanephrines_plasma
          ]
        },
        { name: 'Skrining warunkowy (zależnie od kontekstu klinicznego)',
          tests: [
            EXT.arr,
            { id: 'dhea_s', note: 'TYLKO przy wirylizacji / hirsutyzmie u kobiet. Wartości > 700 μg/dL sugerują guz nadnercza.' },
            { id: 'testosterone_total', note: 'TYLKO przy wirylizacji u kobiet (objawy androgenizacji).' },
            { id: 'oh17_progesterone', note: 'TYLKO przy podejrzeniu CAH (najczęściej wrodzonego niedoboru 21-hydroksylazy).' }
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            EXT.adrenal_ct
          ]
        }
      ],
      guideline: 'ESE 2016 (Fassnacht i wsp.) / PTE',
      sources: [
        'Fassnacht M, Arlt W, Bancos I, et al. Management of adrenal incidentalomas: European Society of Endocrinology Clinical Practice Guideline in collaboration with the European Network for the Study of Adrenal Tumors. Eur J Endocrinol. 2016;175(2):G1-G34.',
        'Fassnacht M, Tsagarakis S, Terzolo M, et al. European Society of Endocrinology clinical practice guidelines on the management of adrenal incidentalomas, in collaboration with the European Network for the Study of Adrenal Tumours. Eur J Endocrinol. 2023;189(1):G1-G42.',
        'Bednarczuk T, Bolanowski M, Sworczak K i wsp. Adrenal incidentaloma in adults — management recommendations by the Polish Society of Endocrinology. Endokrynologia Polska. 2016;67(2):234-258.',
        'Sherlock M, Scarsbrook A, Abbas A, et al. Adrenal incidentaloma. Endocr Rev. 2020;41(6):775-820.',
        'Lenders JWM, Duh QY, Eisenhofer G, et al. Pheochromocytoma and paraganglioma: an Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2014;99(6):1915-1942.',
        'Bovio S, Cataldi A, Reimondo G, et al. Prevalence of adrenal incidentaloma in a contemporary computerized tomography series. J Endocrinol Invest. 2006;29(4):298-302.'
      ]
    },

    /* ═══════════════════════════════════════════════════════════════
     *  STEROIDY / ANDROGENY
     * ═══════════════════════════════════════════════════════════════ */

    hirsutism: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i ocena',
            body: 'Hirsutyzm — nadmierne owłosienie typu męskiego u kobiety (włosy terminalne w obszarach androgenozależnych: twarz, klatka piersiowa, brzuch, plecy, uda). Ocena półilościowa: skala Ferrimana-Gallwaya (mFG) > 8 punktów u kobiet rasy białej; > 6 u Azjatek. UWAGA: cechy wirylizacji (klitoromegalia, rozległe łysienie typu męskiego, obniżenie głosu, zanik piersi) + szybki początek objawów → PILNE wykluczenie guza androgennego (testosteron całkowity, DHEA-S, obrazowanie).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              { label: 'PCOS (~70–80%)', text: 'najczęstsza przyczyna hirsutyzmu u kobiet w wieku rozrodczym; diagnostyka wg kryteriów Rotterdam (osobne wskazanie).' },
              { label: 'Hirsutyzm idiopatyczny (~10–15%)', text: 'prawidłowy profil androgenowy, brak zaburzeń cyklu — podejrzewa się podwyższoną aktywność skórnej 5α-reduktazy lub zwiększoną wrażliwość mieszków włosowych na androgeny.' },
              { label: 'NCAH — nieklasyczny WPN (~3–5%)', text: 'niedobór 21-hydroksylazy o łagodnym przebiegu; klinicznie przypomina PCOS; rozpoznanie: 17-OHP rano w fazie folikularnej, test stymulacji ACTH przy wątpliwym wyniku bazalnym.' },
              {
                label: 'Przyczyny rzadsze',
                text: 'wymagają wykluczenia w specyficznych sytuacjach klinicznych:',
                detail: [
                  'Zespół Cushinga — gdy cechy cushingoidalne (otyłość brzuszna, rozstępy purpurowe, twarz księżycowata, oporne nadciśnienie).',
                  'Hiperprolaktynemia — częsta przyczyna zaburzeń osi gonadowej z hiperandrogenizmem.',
                  'Guz androgenny — szybko narastająca wirylizacja + ostry przebieg → testosteron > 7 nmol/L, DHEA-S > 18,9 μmol/L; pilna diagnostyka obrazowa.',
                  'Hirsutyzm jatrogenny — sterydy anaboliczno-androgenne, testosteron egzogenny, walproinian, danazol, niektóre starsze progestageny (noretysteron).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Wskazania do diagnostyki hormonalnej',
            items: [
              { label: 'Hirsutyzm umiarkowany/ciężki (mFG > 8)', text: 'pełna diagnostyka różnicowa — profil androgenowy + wykluczenie chorób współistniejących.' },
              { label: 'Szybkie narastanie objawów', text: 'czas trwania < 1 rok lub gwałtowne pogorszenie — wymaga szczegółowej oceny.' },
              { label: 'Cechy wirylizacji', text: 'klitoromegalia, rozległe łysienie typu męskiego, obniżenie głosu, zanik piersi — PILNE wykluczenie guza androgennego.' },
              { label: 'Zaburzenia miesiączki', text: 'oligo-/amenorrhea, niepłodność — często towarzyszą hiperandrogenizmowi w PCOS lub NCAH.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Algorytm diagnostyczny',
            items: [
              {
                label: 'Profil androgenowy podstawowy',
                text: 'kompletna ocena źródeł i frakcji androgenów:',
                detail: [
                  'Testosteron całkowity (rano, faza folikularna 2.–5. dzień cyklu) — > 7 nmol/L (200 ng/dL) silne podejrzenie guza androgennego.',
                  'SHBG + obliczenie FAI (Free Androgen Index = T całkowity × 100 / SHBG; > 5 = biochemiczny hiperandrogenizm).',
                  'Testosteron wolny (LC-MS/MS lub obliczenie z wzoru Vermeulena) — czulszy parametr niż T całkowity.',
                  'DHEA-S — marker źródła nadnerczowego; > 18,9 μmol/L (700 μg/dL) silne podejrzenie guza nadnercza.',
                  '17-OH-progesteron — wykluczenie NCAH; bazalnie > 6 nmol/L → test stymulacji ACTH.',
                  'Androstendion — uzupełnia profil; podwyższony w PCOS, NCAH i guzach androgennych.'
                ]
              },
              { label: 'Wykluczenie chorób współistniejących', text: 'TSH (niedoczynność tarczycy może nasilać hirsutyzm i zaburzenia cyklu); prolaktyna (hiperprolaktynemia — częsta przyczyna zaburzeń osi gonadowej).' },
              {
                label: 'Sytuacje szczególne (zależnie od kontekstu klinicznego)',
                text: 'badania ukierunkowane na specyficzne kierunki:',
                detail: [
                  'Test hamowania 1 mg deksametazonu — przy cechach cushingoidalnych (otyłość brzuszna, rozstępy purpurowe > 1 cm, twarz księżycowata, oporne nadciśnienie).',
                  'USG narządów rodnych — przy podejrzeniu PCOS (kryterium Rotterdam) lub guza jajnika produkującego androgeny.',
                  'DHT (5α-dihydrotestosteron) — rzadkie wskazanie w idiopatycznym hirsutyzmie opornym (badawcze); stosunek T/DHT diagnostyczny.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Profil androgenowy podstawowy',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano (7:00–10:00), faza folikularna (dni 2–5 cyklu). > 7 nmol/L (200 ng/dL) → podejrzenie guza androgennego.', description: 'Testosteron całkowity — pomiar w surowicy rano (7:00–10:00) na czczo. U kobiet z regularnym cyklem optymalne pobranie w fazie folikularnej (dni 2–5 cyklu menstruacyjnego); w PCOS lub innej anowulacji moment pobrania mniej istotny. Norma laboratoryjna u kobiet: 0,3–2,4 nmol/L (8–70 ng/dL). Interpretacja w kontekście hirsutyzmu: wartości w górnej granicy normy lub łagodnie podwyższone (2,4–7 nmol/L) → typowe dla PCOS lub NCAH; > 7 nmol/L (200 ng/dL) → silne podejrzenie guza androgennego (gonadalnego lub nadnerczowego), pilna dalsza diagnostyka obrazowa (USG narządów rodnych, TK nadnerczy). Metoda referencyjna: LC-MS/MS; bezpośrednie immunoassaye mogą zaniżać wyniki u kobiet (Endocrine Society 2018).' },
            { id: 'shbg', note: 'Niska w insulinooporności (PCOS, otyłość). Służy do obliczenia FAI (free androgen index) = T całkowity × 100 / SHBG; FAI > 5 → biochemiczny hiperandrogenizm.', description: 'SHBG (Sex Hormone-Binding Globulin) — globulina wiążąca hormony płciowe, produkowana w wątrobie. Wiąże testosteron z wysoką afinicją, regulując frakcję wolną (biologicznie aktywną). W warunkach insulinooporności (PCOS, otyłość, zespół metaboliczny) produkcja SHBG w wątrobie jest zmniejszona — prowadzi to do względnego wzrostu wolnego testosteronu nawet przy prawidłowym lub łagodnie podwyższonym testosteronie całkowitym. Norma: 20–130 nmol/L (zależy od metody). Zastosowanie kliniczne: obliczenie FAI (Free Androgen Index) wg wzoru: FAI = (testosteron całkowity × 100) / SHBG. FAI > 5 → biochemiczny hiperandrogenizm (czulszy parametr niż sam testosteron całkowity). FAI > 10 — wartości wyraźnie patologiczne.' },
            { id: 'testosterone_free', note: 'Bezpośredni pomiar wolnej frakcji (~2% testosteronu). Preferowane metody: dializa równowagowa (LC-MS/MS) lub obliczenie z testosteronu całkowitego + SHBG + albuminy.', description: 'Testosteron wolny stanowi ~2% testosteronu całkowitego i jest biologicznie aktywną frakcją hormonu. Metody pomiaru: (1) dializa równowagowa z pomiarem LC-MS/MS — referencyjna, najczulsza; (2) ultrafiltracja + LC-MS/MS; (3) obliczenie z testosteronu całkowitego + SHBG + albuminy wg wzoru Vermeulena (dostępne w kalkulatorach online). Bezpośrednie immunoassaye (RIA, ELISA) są NIEZALECANE u kobiet — niska dokładność w zakresie kobiecych stężeń (PTE 2018, Endocrine Society 2018). Norma laboratoryjna u kobiet: 1,7–22 pmol/L (0,5–6,3 pg/mL); w hirsutyzmie zwykle podwyższony nawet przy granicznych wartościach testosteronu całkowitego.' },
            { id: 'dhea_s', note: 'Marker źródła nadnerczowego androgenów (DHEA-S produkowany wyłącznie w korze nadnerczy). > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza.', description: 'DHEA-S (siarczan dehydroepiandrosteronu) — produkowany niemal wyłącznie w warstwie siateczkowatej kory nadnerczy. Bardzo stabilny w surowicy (długi okres półtrwania), niezależny od rytmu dobowego i fazy cyklu — wygodny marker źródła nadnerczowego androgenów. Wartości u kobiet w wieku rozrodczym: 1,9–9,4 μmol/L (70–350 μg/dL). Interpretacja w hirsutyzmie: łagodne podwyższenie (do ~13 μmol/L) → typowe dla PCOS lub fizjologicznej adrenarchy; > 13 μmol/L (500 μg/dL) → wymaga dalszej diagnostyki (NCAH, hiperplazja, gruczolak androgenny); > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza (gruczolak androgenny lub rak kory nadnercza), wskazane TK nadnerczy.' },
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH (z niedoboru 21-hydroksylazy). Pobranie rano, faza folikularna; bazalnie > 6 nmol/L (2 ng/mL) wymaga testu stymulacji ACTH.', description: 'Wykluczenie nieklasycznego wrodzonego przerostu nadnerczy (NCAH) z niedoboru 21-hydroksylazy. Pobranie: rano (7:00–9:00), kobiety w fazie folikularnej cyklu (dni 2–5; w II połowie cyklu wartości fizjologicznie wyższe — fałszywie dodatnie wyniki). Bazalne 17-OH-progesteron: < 6 nmol/L (2 ng/mL) → wyklucza klasyczny WPN, jednak część NCAH ma wartości bazalne < 6 (ujawnia się dopiero po stymulacji); 6–30 nmol/L → wynik niejednoznaczny, wskazany test stymulacji ACTH (Synacthen) z pomiarem 17-OHP w 0 i 60 min; > 30 nmol/L → potwierdza WPN (klasyczny lub NCAH). Częstość NCAH: 1:200–1:1000 w populacji ogólnej; znacznie wyższa u Aszkenazyjczyków (do 1:27), Hiszpanów i Włochów.' },
            { id: 'androstenedione', note: 'Uzupełnia profil androgenowy, wzrasta w PCOS i NCAH. Pomocne w monitorowaniu leczenia WPN.', description: 'Androstendion (Δ4-androstendion) — prekursor steroidowy o słabej aktywności androgennej, produkowany w korze nadnerczy (~50%) oraz jajnikach (~50%). Wzrasta w stanach hiperandrogenizmu (PCOS, NCAH, guz androgenny). Norma u kobiet w wieku rozrodczym: 1,2–10,5 nmol/L (35–300 ng/dL). Zastosowanie: uzupełnia profil androgenowy obok testosteronu i DHEA-S, służy też do monitorowania skuteczności leczenia WPN hydrokortyzonem (cel terapeutyczny: środkowy zakres normy dla wieku i płci). W guzach androgennych zwykle znacznie podwyższony razem z testosteronem.' }
          ]
        },
        { name: 'Wykluczenie chorób współistniejących',
          tests: [
            { id: 'tsh', note: 'Wykluczenie niedoczynności tarczycy — może nasilać hirsutyzm i zaburzenia cyklu.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii (zaburzenia osi gonadowej — częsta przyczyna zaburzeń miesiączki z hiperandrogenizmem).' }
          ]
        },
        { name: 'Sytuacje szczególne (zależnie od kontekstu klinicznego)',
          tests: [
            { id: 'cortisol', label: 'Test hamowania z 1 mg deksametazonu', note: 'Gdy obecne są cechy cushingoidalne (otyłość brzuszna, rozstępy purpurowe > 1 cm, twarz księżycowata, oporne nadciśnienie).', description: 'Test skriningu zespołu Cushinga w sytuacji klinicznej sugerującej hiperkortyzolemię u kobiety z hirsutyzmem. Protokół: pacjent przyjmuje doustnie 1 mg deksametazonu o godz. 23:00 (przed snem). Następnego dnia rano (8:00–9:00) na czczo pobranie kortyzolu w surowicy. Interpretacja: < 50 nmol/L (1,8 μg/dL) → wyklucza autonomię kortyzolu; 50–138 nmol/L → wynik niejednoznaczny, wskazane rozszerzenie diagnostyki; > 138 nmol/L → potwierdza autonomię kortyzolu. Pełne kryteria i fałszywie dodatnie/ujemne — zobacz wskazanie "Zespół Cushinga".' },
            { ext: 'chorionic_us_hirsutism', label: 'USG narządów rodnych', note: 'Gdy podejrzenie PCOS (kryterium Rotterdam) lub guza jajnika produkującego androgeny.', description: 'USG przezpochwowe (TVS) lub przezbrzuszne narządów rodnych. W diagnostyce hirsutyzmu cele: (1) ocena morfologii jajników wg kryteriów Rotterdam dla PCOS — ≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL (aktualizacja 2018, wcześniej ≥ 12 pęcherzyków); (2) wykluczenie guza jajnika produkującego androgeny (rzadki, ale ważny — typowo guzy z komórek tekalno-ziarnistych, guzy z komórek Sertoliego-Leydiga / SLCT). Wskazania do USG: hirsutyzm o szybkim początku, znaczna wirylizacja, testosteron całkowity > 7 nmol/L. U młodych pacjentek (< 18 lat) lub niewspółżyjących preferowane USG przezbrzuszne (z pełnym pęcherzem moczowym).' },
            { id: 'dht', note: 'Rzadkie wskazanie, w idiopatycznym hirsutyzmie (nadwrażliwość receptorów skórnych, podwyższona aktywność 5α-reduktazy); stosunek T/DHT diagnostyczny.', description: 'DHT (5α-dihydrotestosteron) — najsilniejszy androgen, powstaje obwodowo z testosteronu pod wpływem 5α-reduktazy (głównie w skórze i mieszkach włosowych). W idiopatycznym hirsutyzmie podejrzewa się podwyższoną aktywność skórnej 5α-reduktazy mimo prawidłowych krążących stężeń testosteronu — DHT może być w surowicy w normie lub łagodnie podwyższone, ale stosunek T/DHT obniżony (sugeruje konwersję obwodową). W praktyce klinicznej DHT oznaczane rzadko — leczenie hirsutyzmu (antyandrogeny: spironolakton, finasteryd, octan cyproteronu) nie wymaga potwierdzenia DHT. Wskazanie: badawcze lub w nietypowym idiopatycznym hirsutyzmie opornym na typową terapię.' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Martin i wsp.) / PTE / PTGiP',
      sources: [
        'Martin KA, Anderson RR, Chang RJ, et al. Evaluation and treatment of hirsutism in premenopausal women: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(4):1233-1257.',
        'Escobar-Morreale HF. Polycystic ovary syndrome: definition, aetiology, diagnosis and treatment. Nat Rev Endocrinol. 2018;14(5):270-284.',
        'Ferriman D, Gallwey JD. Clinical assessment of body hair growth in women. J Clin Endocrinol Metab. 1961;21(11):1440-1447.',
        'Yildiz BO, Bolour S, Woods K, et al. Visually scoring hirsutism. Hum Reprod Update. 2010;16(1):51-64.',
        'Bidet M, Bellanné-Chantelot C, Galand-Portier MB, et al. Clinical and molecular characterization of 95 women with nonclassical 21-hydroxylase deficiency. J Clin Endocrinol Metab. 2009;94(5):1570-1578.',
        'Milewicz A, Bidzińska B, Sidorowicz A i wsp. Stanowisko PTGiP w sprawie diagnostyki i leczenia zespołu policystycznych jajników. Ginekol Pol. (aktualizacje PTGiP 2018–2023).'
      ]
    },

    pcos: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i epidemiologia',
            body: 'Zespół policystycznych jajników (PCOS) — najczęstsza endokrynopatia u kobiet w wieku rozrodczym (~10–15%). Diagnostyka oparta na kryteriach Rotterdam 2003 z aktualizacjami międzynarodowego konsensusu 2018/2023 (Teede i wsp.). PCOS to nie tylko zespół ginekologiczno-endokrynologiczny — wiąże się ze znacznie podwyższonym ryzykiem chorób metabolicznych i sercowo-naczyniowych, dlatego u każdej pacjentki obowiązkowa jest ocena metaboliczna.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Kryteria Rotterdam 2003 (zaktualizowane 2018)',
            items: [
              { label: 'Rozpoznanie wymaga 2 z 3 kryteriów', text: '(1) oligo-/anowulacja; (2) hiperandrogenizm kliniczny (hirsutyzm, trądzik, łysienie typu męskiego) lub biochemiczny; (3) polycystic w USG.' },
              { label: 'Kryterium USG (aktualizacja 2018)', text: '≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL (wcześniejszy próg z 2003 r. ≥ 12 pęcherzyków — zmieniony ze względu na wyższą rozdzielczość nowoczesnych aparatów USG).' },
              { label: 'U młodzieży < 8 lat od menarche', text: 'USG NIE jest stosowane jako kryterium diagnostyczne — obraz wielopęcherzykowy w tym wieku fizjologiczny.' },
              { label: 'AMH NIE jako kryterium', text: 'międzynarodowy konsensus 2023 (Teede) — brak standaryzacji metod między laboratoriami; AMH pełni rolę POMOCNICZĄ.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka hormonalna i wykluczenia',
            items: [
              {
                label: 'Hiperandrogenizm biochemiczny',
                text: 'profil androgenowy zgodny z PCOS:',
                detail: [
                  'Testosteron całkowity (rano, faza folikularna) — zwykle łagodnie podwyższony; > 7 nmol/L (200 ng/dL) wymaga wykluczenia guza.',
                  'SHBG + obliczenie FAI — w PCOS SHBG często obniżona (insulinooporność hamuje syntezę wątrobową), FAI > 5 czulszy parametr niż T całkowity.',
                  'Testosteron wolny (LC-MS/MS lub wzór Vermeulena) — często podwyższony nawet przy granicznych wartościach T całkowitego.',
                  'DHEA-S — w PCOS zwykle łagodnie podwyższony (do ~13 μmol/L); > 18,9 μmol/L → podejrzenie guza nadnercza.',
                  'Androstendion — uzupełnia profil; często podwyższony w PCOS.'
                ]
              },
              {
                label: 'Wykluczenie innych przyczyn — kryterium Rotterdam',
                text: 'PRZED rozpoznaniem PCOS należy wykluczyć:',
                detail: [
                  '17-OH-progesteron (rano, faza folikularna) — wykluczenie NCAH (z niedoboru 21-hydroksylazy); bazalnie > 6 nmol/L → test stymulacji ACTH.',
                  'TSH — wykluczenie dysfunkcji tarczycy (może imitować lub współwystępować z PCOS).',
                  'Prolaktyna — wykluczenie hiperprolaktynemii (pobranie w spoczynku, przy wartościach granicznych powtórzyć).',
                  'Test hamowania 1 mg DST — TYLKO gdy cechy cushingoidalne; rutynowy skrining Cushinga w PCOS NIE jest zalecany.'
                ]
              },
              {
                label: 'Obrazowanie i rezerwa jajnikowa',
                text: 'ocena morfologii jajników i pomocniczo AMH:',
                detail: [
                  'USG narządów rodnych (TVS u współżyjących, przezbrzuszne u młodych) — kryterium Rotterdam: ≥ 20 pęcherzyków 2–9 mm w jednym jajniku LUB objętość > 10 mL.',
                  'AMH — w PCOS znacznie podwyższona (3–5× wyższa niż u zdrowych); pomocniczo gdy USG niejednoznaczne lub niemożliwe; > 35 pmol/L (~5 ng/mL) sugeruje PCOS.'
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'mood-kid',
            title: 'obowiązkowa ocena metaboliczna u KAŻDEJ pacjentki z PCOS',
            body: 'Międzynarodowy konsensus PCOS 2018/2023 (Teede i wsp.): u każdej pacjentki z rozpoznanym PCOS należy wykonać ocenę metaboliczną przy rozpoznaniu i powtarzać co 1–3 lata. PCOS wiąże się ze ZNACZNIE podwyższonym ryzykiem: cukrzycy typu 2 (~2–4× wyższe niż w populacji ogólnej, niezależnie od BMI), zespołu metabolicznego, niealkoholowej stłuszczeniowej choroby wątroby (NAFLD/MASLD — ~40% kobiet z PCOS), dyslipidemii, powikłań sercowo-naczyniowych. Ocena metaboliczna w PCOS jest tak samo ważna jak diagnostyka hormonalna.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Ocena metaboliczna',
            items: [
              { label: 'oGTT 75 g (preferowany skrining cukrzycy w PCOS)', text: 'pomiar glikemii na czczo i po 120 min; bardziej czuły niż HbA1c we wczesnym wykrywaniu IGT w PCOS; powtarzać co 1–3 lata.' },
              { label: 'HbA1c (hemoglobina glikowana)', text: 'alternatywa lub uzupełnienie oGTT; stan przedcukrzycowy 5,7–6,4%; cukrzyca ≥ 6,5%.' },
              { label: 'Insulina + HOMA-IR', text: 'ocena insulinooporności (HOMA-IR > 2,5); w międzynarodowym konsensusie OPCJONALNE (brak standaryzacji), w polskiej praktyce powszechne.' },
              { label: 'Lipidogram (TC, LDL, HDL, TG)', text: 'ryzyko dyslipidemii znacznie podwyższone; typowo ↓ HDL i ↑ trójglicerydy.' },
              { label: 'ALAT, ASPAT', text: 'skrining NAFLD/MASLD — występuje u ~40% kobiet z PCOS, częściej u otyłych z insulinoopornością.' },
              { label: 'Witamina D 25-OH', text: 'niedobór częsty w PCOS (~70%), może nasilać insulinooporność; cel terapeutyczny > 75 nmol/L (30 ng/mL).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Hiperandrogenizm biochemiczny',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano, faza folikularna. W PCOS zwykle łagodnie podwyższony; > 7 nmol/L (200 ng/dL) → wykluczyć guz androgenny.', description: 'Testosteron całkowity w PCOS — pomiar w surowicy rano (7:00–10:00), u kobiet z regularnym cyklem w fazie folikularnej (dni 2–5); w anowulacji moment pobrania mniej istotny. W PCOS testosteron jest zwykle łagodnie podwyższony (do ~5 nmol/L) lub w górnej granicy normy. Wartości > 7 nmol/L (200 ng/dL) → konieczne pilne wykluczenie guza androgennego (gonadalnego lub nadnerczowego). Metoda referencyjna LC-MS/MS; bezpośrednie immunoassaye mogą zaniżać wyniki u kobiet (Endocrine Society / PTE 2018).' },
            { id: 'shbg', note: 'W PCOS zwykle obniżona (insulinooporność hamuje produkcję wątrobową). Służy do obliczenia FAI = T całkowity × 100 / SHBG; FAI > 5 → biochemiczny hiperandrogenizm.', description: 'SHBG (globulina wiążąca hormony płciowe) — w PCOS często obniżona, ponieważ insulinooporność hamuje jej syntezę w wątrobie. Skutkuje to względnym wzrostem wolnej (biologicznie aktywnej) frakcji testosteronu nawet przy prawidłowym lub łagodnie podwyższonym testosteronie całkowitym. Zastosowanie kliniczne: obliczenie FAI (Free Androgen Index) = (testosteron całkowity × 100) / SHBG. FAI > 5 → biochemiczny hiperandrogenizm (czulszy parametr niż sam testosteron całkowity).' },
            { id: 'testosterone_free', note: 'Czulszy parametr biochemicznego hiperandrogenizmu niż testosteron całkowity. LC-MS/MS lub obliczenie z T całkowitego + SHBG + albuminy.', description: 'Testosteron wolny stanowi ~2% testosteronu całkowitego i jest biologicznie aktywną frakcją. W PCOS często podwyższony nawet przy granicznych wartościach testosteronu całkowitego (z powodu obniżonej SHBG). Metody: dializa równowagowa lub ultrafiltracja z LC-MS/MS (referencyjne) lub obliczenie z testosteronu całkowitego + SHBG + albuminy wg wzoru Vermeulena. Bezpośrednie immunoassaye u kobiet NIEZALECANE (niska dokładność w zakresie kobiecych stężeń).' },
            { id: 'dhea_s', note: 'W PCOS zwykle łagodnie podwyższony. > 18,9 μmol/L (700 μg/dL) → podejrzenie guza nadnercza.', description: 'DHEA-S (siarczan dehydroepiandrosteronu) — marker źródła nadnerczowego androgenów. W PCOS u części pacjentek łagodnie podwyższony (do ~13 μmol/L). Wartości > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza — wymaga pilnej dalszej diagnostyki obrazowej. DHEA-S jest stabilny w surowicy, niezależny od rytmu dobowego i fazy cyklu.' },
            { id: 'androstenedione', note: 'Uzupełnia profil androgenowy — często podwyższony w PCOS. Wzrasta także w NCAH.' }
          ]
        },
        { name: 'Wykluczenie innych przyczyn hiperandrogenizmu (kryterium Rotterdam)',
          tests: [
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH z niedoboru 21-hydroksylazy. Pobranie rano, faza folikularna; bazalnie < 6 nmol/L (2 ng/mL) wyklucza klasyczny WPN; 6–30 → wskazany test stymulacji ACTH.', description: 'Wykluczenie nieklasycznego wrodzonego przerostu nadnerczy (NCAH) — jednej z chorób, które należy wykluczyć przed rozpoznaniem PCOS (kryterium Rotterdam). Pobranie: rano (7:00–9:00), kobiety w fazie folikularnej cyklu (dni 2–5; w II połowie cyklu wartości fizjologicznie wyższe). Bazalne 17-OH-progesteron: < 6 nmol/L (2 ng/mL) → wyklucza klasyczny WPN; 6–30 nmol/L → wynik niejednoznaczny, wskazany test stymulacji ACTH (Synacthen) z pomiarem 17-OHP w 0 i 60 min; > 30 nmol/L → potwierdza WPN. NCAH może klinicznie przypominać PCOS (hiperandrogenizm, zaburzenia cyklu).' },
            { id: 'tsh', note: 'Wykluczenie niedoczynności tarczycy — częsta przyczyna zaburzeń cyklu miesiączkowego, może imitować lub współwystępować z PCOS.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii. Pobranie w spoczynku (samo nakłucie żyły może podnieść PRL); przy wartościach granicznych powtórzyć 2-krotnie.' }
          ]
        },
        { name: 'Obrazowanie i rezerwa jajnikowa',
          tests: [
            { ext: 'chorionic_us_pcos', label: 'USG narządów rodnych', note: 'Kryterium Rotterdam: ≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL.', description: 'USG narządów rodnych — preferowane przezpochwowe (TVS), u młodszych pacjentek lub bez współżycia przezbrzuszne. Kryterium Rotterdam obrazu polycystic (aktualizacja 2018, Teede): ≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL (wcześniejszy próg z 2003 r. to ≥ 12 pęcherzyków — zmieniony ze względu na wyższą rozdzielczość nowoczesnych aparatów USG). Oceniać oba jajniki. UWAGA: u nastolatek (≤ 8 lat od menarche) USG NIE powinno być stosowane jako kryterium diagnostyczne PCOS — obraz wielopęcherzykowy jest w tym wieku fizjologiczny. USG pomaga też wykluczyć guz jajnika produkujący androgeny.' },
            { id: 'amh', note: 'W PCOS znacznie podwyższona (mediana 3–5× wyższa niż u zdrowych). NIE jest jeszcze samodzielnym kryterium diagnostycznym (brak standaryzacji metody — Teede 2023); pomocnicza gdy USG niejednoznaczne.', description: 'AMH (hormon antymüllerowski) — w PCOS jest znacznie podwyższona, ponieważ odzwierciedla zwiększoną liczbę małych pęcherzyków antralnych. Mediana AMH u kobiet z PCOS jest 3–5× wyższa niż u zdrowych. Wartości > 35 pmol/L (~5 ng/mL) sugerują PCOS. UWAGA: międzynarodowy konsensus 2023 (Teede i wsp.) stwierdza, że AMH NIE jest jeszcze rekomendowane jako samodzielne kryterium diagnostyczne PCOS — głównym ograniczeniem jest brak standaryzacji metod oznaczania między laboratoriami i brak ustalonych progów wiekowych. AMH pełni rolę pomocniczą, zwłaszcza gdy obraz USG jest niejednoznaczny lub gdy USG przezpochwowe nie jest możliwe.' }
          ]
        },
        { name: 'Ocena metaboliczna (obowiązkowa u każdej pacjentki z PCOS)',
          tests: [
            { ext: 'ogtt_75g_pcos', label: 'Glukoza na czczo + oGTT 75 g', note: 'Standard skriningu cukrzycy / nieprawidłowej tolerancji glukozy (IGT) w PCOS. Powtarzać co 1–3 lata.', description: 'Doustny test obciążenia glukozą (oGTT) — 75 g glukozy, pomiar glikemii na czczo (0 min) i po 120 min. Standard skriningu cukrzycy typu 2 i nieprawidłowej tolerancji glukozy (IGT) u kobiet z PCOS — ryzyko cukrzycy w PCOS jest ~2–4× wyższe niż w populacji ogólnej, niezależnie od BMI. Interpretacja (kryteria ADA/PTD): glikemia na czczo 100–125 mg/dL → nieprawidłowa glikemia na czczo (IFG); ≥ 126 mg/dL → cukrzyca; glikemia 120 min 140–199 mg/dL → nieprawidłowa tolerancja glukozy (IGT); ≥ 200 mg/dL → cukrzyca. Międzynarodowy konsensus 2018/2023 zaleca oGTT u wszystkich kobiet z PCOS przy rozpoznaniu i powtarzanie co 1–3 lata (częściej u otyłych i z dodatkowymi czynnikami ryzyka).' },
            { ext: 'hba1c_pcos', label: 'HbA1c (hemoglobina glikowana)', note: 'Alternatywa lub uzupełnienie oGTT — ocena średniej glikemii ostatnich 2–3 miesięcy.', description: 'HbA1c (hemoglobina glikowana) — odzwierciedla średnią glikemię z ostatnich 2–3 miesięcy. W diagnostyce PCOS stosowana jako uzupełnienie lub alternatywa oGTT. Interpretacja: HbA1c 5,7–6,4% (39–46 mmol/mol) → stan przedcukrzycowy; ≥ 6,5% (48 mmol/mol) → cukrzyca. UWAGA: HbA1c jest mniej czuła niż oGTT we wczesnym wykrywaniu zaburzeń gospodarki węglowodanowej u kobiet z PCOS — oGTT pozostaje preferowanym testem skriningowym.' },
            { ext: 'insulin_pcos', label: 'Insulina + HOMA-IR', note: 'Ocena insulinooporności (HOMA-IR = insulina × glukoza / 22,5). W PCOS często podwyższony niezależnie od BMI. Powszechnie zlecane w Polsce, w konsensusie międzynarodowym uznawane za opcjonalne.', description: 'Insulina na czczo wraz z glukozą na czczo pozwala obliczyć wskaźnik HOMA-IR (Homeostatic Model Assessment of Insulin Resistance) = (insulina [μIU/mL] × glukoza [mmol/L]) / 22,5. Wartość > 2,5 sugeruje insulinooporność (progi zależą od laboratorium i populacji). W PCOS insulinooporność występuje u ~50–70% pacjentek, często niezależnie od masy ciała. UWAGA: międzynarodowy konsensus PCOS 2018/2023 uznaje rutynowy pomiar insuliny/HOMA-IR za OPCJONALNY (brak standaryzacji oznaczeń insuliny, ograniczona wartość dla decyzji terapeutycznych), choć w polskiej praktyce klinicznej jest powszechnie zlecany.' },
            { ext: 'lipid_panel_pcos', label: 'Lipidogram (cholesterol całkowity, LDL, HDL, trójglicerydy)', note: 'Ryzyko dyslipidemii w PCOS znacznie podwyższone. Powtarzać co 1–3 lata.', description: 'Lipidogram — cholesterol całkowity, LDL, HDL, trójglicerydy. U kobiet z PCOS ryzyko dyslipidemii jest znacznie wyższe niż w populacji ogólnej (typowo: ↓ HDL, ↑ trójglicerydy, ↑ LDL) — niezależnie od BMI, częściowo związane z insulinoopornością. Międzynarodowy konsensus 2018/2023 zaleca ocenę lipidogramu u każdej pacjentki z PCOS przy rozpoznaniu i powtarzanie co 1–3 lata w zależności od wyniku wyjściowego i obecności dodatkowych czynników ryzyka sercowo-naczyniowego.' },
            { ext: 'liver_pcos', label: 'ALAT, ASPAT', note: 'Skrining niealkoholowej stłuszczeniowej choroby wątroby (NAFLD) — występuje u ~40% kobiet z PCOS.', description: 'Aminotransferazy (ALAT, ASPAT) — skrining niealkoholowej stłuszczeniowej choroby wątroby (NAFLD, obecnie nazywanej także MASLD — metabolic dysfunction-associated steatotic liver disease). NAFLD występuje u ~40% kobiet z PCOS, częściej u otyłych z insulinoopornością. Podwyższenie ALAT (zwykle ALAT > ASPAT) może być pierwszym sygnałem stłuszczenia wątroby. Przy nieprawidłowych wynikach lub czynnikach ryzyka wskazane USG jamy brzusznej i ocena hepatologiczna.' },
            { id: 'vit_d_25oh', note: 'Niedobór witaminy D częsty w PCOS (~70%), może nasilać insulinooporność. Cel terapeutyczny > 75 nmol/L (30 ng/mL).' }
          ]
        },
        { name: 'Sytuacje szczególne',
          tests: [
            { id: 'lh', note: 'Historycznie stosunek LH/FSH > 2 był kryterium pomocniczym PCOS, ale konsensus 2018/2023 NIE zaleca LH/FSH jako kryterium diagnostyczne. Zlecane fakultatywnie przy ocenie osi gonadowej (niepłodność).', description: 'LH (hormon luteinizujący) w PCOS — historycznie stosunek LH/FSH > 2 uznawano za pomocnicze kryterium PCOS (odzwierciedla zwiększoną pulsatylność GnRH i przewagę LH nad FSH typową dla PCOS). Jednak międzynarodowy konsensus PCOS 2018 i 2023 (Teede i wsp.) NIE zaleca LH/FSH jako kryterium diagnostyczne — wartości są zmienne (zależą od fazy cyklu, BMI, metody oznaczania). LH/FSH zlecane fakultatywnie przy szerszej ocenie osi gonadowej, szczególnie w kontekście niepłodności.' },
            { id: 'fsh', note: 'Oznaczany razem z LH przy ocenie osi gonadowej. W PCOS zwykle prawidłowy lub w dolnej granicy normy. Pomaga wykluczyć przedwczesną niewydolność jajników (FSH wysoki).' },
            { ext: 'afc_pcos', label: 'AFC (Antral Follicle Count, USG TV)', note: 'Komplementarne do AMH w ocenie rezerwy jajnikowej — szczególnie przy planowaniu leczenia niepłodności.', description: 'AFC (Antral Follicle Count) — liczba pęcherzyków antralnych (2–9 mm) policzona w USG przezpochwowym, sumarycznie w obu jajnikach. Komplementarne do AMH w ocenie rezerwy jajnikowej. W PCOS AFC jest zwykle podwyższone (odzwierciedla zwiększoną pulę małych pęcherzyków). Główne zastosowanie: planowanie leczenia niepłodności (przewidywanie odpowiedzi na stymulację jajeczkowania w procedurach wspomaganego rozrodu) oraz ocena ryzyka zespołu hiperstymulacji jajników (OHSS).' },
            { id: 'cortisol', label: 'Test hamowania z 1 mg deksametazonu', note: 'TYLKO gdy obecne są cechy cushingoidalne (otyłość brzuszna, rozstępy purpurowe > 1 cm, twarz księżycowata, oporne nadciśnienie) — wykluczenie zespołu Cushinga.', description: 'Test skriningu zespołu Cushinga u pacjentki z podejrzeniem PCOS, ALE TYLKO gdy obecne są cechy cushingoidalne (otyłość brzuszna, rozstępy purpurowe > 1 cm, twarz księżycowata, łatwe siniaczenie, miopatia proksymalna, oporne nadciśnienie). Rutynowy skrining Cushinga u wszystkich pacjentek z PCOS NIE jest zalecany — zespół Cushinga jest rzadki. Protokół: 1 mg deksametazonu o godz. 23:00, kortyzol rano (8:00–9:00). Interpretacja: < 50 nmol/L (1,8 μg/dL) → wyklucza autonomię kortyzolu; 50–138 nmol/L → wynik niejednoznaczny; > 138 nmol/L → potwierdza autonomię. Pełne kryteria — zobacz wskazanie "Zespół Cushinga".' }
          ]
        }
      ],
      guideline: 'Międzynarodowy konsensus PCOS 2018/2023 (Teede i wsp.) / PTGiP / Rotterdam 2003',
      sources: [
        'Teede HJ, Misso ML, Costello MF, et al. Recommendations from the international evidence-based guideline for the assessment and management of polycystic ovary syndrome. Hum Reprod. 2018;33(9):1602-1618.',
        'Teede HJ, Tay CT, Laven JJE, et al. Recommendations from the 2023 International Evidence-based Guideline for the Assessment and Management of Polycystic Ovary Syndrome. J Clin Endocrinol Metab. 2023;108(10):2447-2469.',
        'Rotterdam ESHRE/ASRM-Sponsored PCOS Consensus Workshop Group. Revised 2003 consensus on diagnostic criteria and long-term health risks related to polycystic ovary syndrome. Fertil Steril. 2004;81(1):19-25.',
        'Azziz R, Carmina E, Chen Z, et al. Polycystic ovary syndrome. Nat Rev Dis Primers. 2016;2:16057.',
        'Legro RS, Arslanian SA, Ehrmann DA, et al. Diagnosis and treatment of polycystic ovary syndrome: an Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2013;98(12):4565-4592.',
        'Milewicz A, Kudła M, Spaczyński RZ i wsp. Stanowisko Polskiego Towarzystwa Endokrynologicznego, Polskiego Towarzystwa Ginekologów i Położników w sprawie diagnostyki i leczenia zespołu policystycznych jajników. Endokrynologia Polska. 2018;69(4).'
      ]
    },

    virilization: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i alarm kliniczny',
            body: 'Wirylizacja u dorosłej kobiety — obecność cech męskich: klitoromegalia, rozległe łysienie typu męskiego, pogłębienie głosu, zanik piersi, rozwój masy mięśniowej typu męskiego. SZYBKO NARASTAJĄCA wirylizacja → silne podejrzenie GUZA ANDROGENNEGO (jajnika lub nadnercza); wymaga PILNEJ diagnostyki obrazowej (USG narządów rodnych + TK nadnerczy wielofazowy). Wirylizacja różni się od hirsutyzmu: hirsutyzm to samo nadmierne owłosienie, wirylizacja obejmuje pełne cechy męskie i sygnalizuje znacznie wyższe stężenia androgenów.'
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'book-2',
            title: 'obowiązkowy szczegółowy wywiad lekowy PRZED diagnostyką',
            body: 'Przed rozpoczęciem diagnostyki hormonalnej i obrazowej należy wykluczyć wirylizację JATROGENNĄ: sterydy anaboliczno-androgenne (sport, kulturystyka — często zatajane w wywiadzie), testosteron egzogenny (suplementy, błędne stosowanie HRT męskiego), danazol, niektóre starsze progestageny o działaniu androgennym (m.in. noretysteron). Wirylizacja jatrogenna zwykle ustępuje po odstawieniu czynnika sprawczego — wczesna identyfikacja oszczędza pacjentce zbędnej diagnostyki obrazowej.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'Guzy gonadalne (jajnik)',
                text: 'najczęstsze pierwotne źródło androgenów u dorosłej kobiety:',
                detail: [
                  'Guzy z komórek Sertoliego-Leydiga (SLCT) — wymiar zwykle 4–15 cm, jednostronne, hipo- lub mieszane echogeniczne; histologicznie 1–5% guzów jajnika.',
                  'Hilus cell tumor (guz z komórek Leydiga) — drobny (1–3 cm), hipoechogeniczny, jednostronny, zlokalizowany przy wnęce jajnika; często trudny w USG → MRI miednicy.',
                  'Rzadziej guzy z komórek tekalno-ziarnistych z androgenizacją (częściej dają estrogenizację).'
                ]
              },
              {
                label: 'Guzy nadnerczy',
                text: 'rzadsze niż gonadalne, ale wysokie ryzyko złośliwości:',
                detail: [
                  'Gruczolak androgenny — rzadki; izolowana androgenizacja u kobiety silnie sugeruje raczej rak niż gruczolak.',
                  'Rak kory nadnercza (ACC) — WYSOKI odsetek złośliwości przy czysto androgennym fenotypie; DHEA-S znacznie podwyższony (często znacznie > 18,9 μmol/L); wymiar zwykle > 4 cm w TK.'
                ]
              },
              {
                label: 'Inne',
                text: 'przyczyny niezwiązane z guzem:',
                detail: [
                  'Klasyczny WPN późno rozpoznany — rzadki u dorosłej kobiety, ale wymaga wykluczenia (17-OH-progesteron).',
                  'Hipertekoza jajnikowa — częściej u kobiet po menopauzie; rozlany przerost komórek tekalnych jajnika z nadmierną produkcją androgenów.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Algorytm diagnostyczny',
            items: [
              {
                label: '(1) Profil androgenowy podstawowy',
                text: 'progi wskazujące na guz androgenny:',
                detail: [
                  'Testosteron całkowity > 7 nmol/L (200 ng/dL) → SILNE podejrzenie guza; > 14 nmol/L (400 ng/dL) → praktycznie pewny guz.',
                  'DHEA-S > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza (gruczolak androgenny lub rak kory).',
                  'SHBG (zwykle obniżona w wirylizacji), testosteron wolny (znacznie podwyższony nawet przy granicznych T całkowitym), androstendion (wzrasta w guzach gonadalnych i nadnerczowych), 17-OH-progesteron (wykluczenie WPN późno rozpoznanego).'
                ]
              },
              {
                label: '(2) Obrazowanie PILNE',
                text: 'lokalizacja źródła androgenów:',
                detail: [
                  'USG narządów rodnych (przezpochwowe TVS) — poszukiwanie guza jajnika; guzy SLCT typowo 4–15 cm, hilus cell drobne 1–3 cm; przy ujemnym USG i wysokim T konieczne MRI miednicy.',
                  'TK nadnerczy wielofazowe z kontrastem — różnicuje gruczolak (HU natywne < 25, wash-out > 60%) od raka kory ACC (HU > 30, niski wash-out, > 4 cm, niejednorodna struktura, naciekanie).'
                ]
              },
              { label: '(3) Sytuacje szczególne', text: 'test hamowania 1 mg deksametazonu przy współistniejących cechach cushingoidalnych — MIESZANY guz nadnercza produkujący ZARÓWNO kortyzol jak i androgeny (częściej w ACC niż gruczolaku) daje obraz Cushinga z wirylizacją.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Profil androgenowy podstawowy',
          tests: [
            { id: 'testosterone_total', note: '> 7 nmol/L (200 ng/dL) → silne podejrzenie guza androgennego; > 14 nmol/L (400 ng/dL) → praktycznie pewny guz.', description: 'Testosteron całkowity u kobiety z wirylizacją — kluczowy parametr różnicowy. Wartości: < 2,4 nmol/L (70 ng/dL) → norma u kobiet w wieku rozrodczym; 2,4–7 nmol/L → typowe dla PCOS, NCAH, idiopatycznego hirsutyzmu; 7–14 nmol/L (200–400 ng/dL) → silne podejrzenie guza androgennego (gonadalnego lub nadnerczowego); > 14 nmol/L (400 ng/dL) → praktycznie pewny guz, wymagana pilna diagnostyka obrazowa. Pobranie: rano (7:00–10:00), na czczo; u kobiet z regularnym cyklem w fazie folikularnej (dni 2–5); w wirylizacji moment cyklu mniej istotny (anowulacja częsta). Metoda referencyjna: LC-MS/MS.' },
            { id: 'shbg', note: 'Zwykle obniżona (efekt androgenów na wątrobę) — wzmaga aktywność testosteronu wolnego.' },
            { id: 'testosterone_free', note: 'Znacznie podwyższony w wirylizacji nawet przy granicznych wartościach T całkowitego.' },
            { id: 'dhea_s', note: '> 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza (gruczolak androgenny lub rak kory nadnercza).', description: 'DHEA-S (siarczan dehydroepiandrosteronu) — marker źródła nadnerczowego androgenów. W wirylizacji: norma u kobiet 1,9–9,4 μmol/L (70–350 μg/dL); łagodne podwyższenie (do ~13 μmol/L) → PCOS lub adrenarche; > 13 μmol/L (500 μg/dL) → wymaga dalszej diagnostyki; > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza. UWAGA: czysto androgen-wydzielające guzy nadnercza są rzadkie i charakteryzują się wysokim odsetkiem złośliwości — częściej są rakami kory nadnercza (ACC) niż gruczolakami. Bardzo wysokie wartości DHEA-S (znacznie przekraczające 18,9 μmol/L / 700 μg/dL) u kobiety z szybko narastającą wirylizacją silnie przemawiają za rakiem kory nadnercza i wymagają pilnej diagnostyki obrazowej (TK nadnerczy wielofazowe z kontrastem).' },
            { id: 'androstenedione', note: 'Znacznie podwyższony w guzach androgennych (nadnercze + jajnik) — uzupełnia profil różnicowy.' },
            { id: 'oh17_progesterone', note: 'Wykluczenie WPN z niedoboru 21-hydroksylazy późno rozpoznanego — rzadkie u dorosłej kobiety, ale obowiązkowe wykluczenie.' }
          ]
        },
        { name: 'Obrazowanie pilne (gdy podejrzenie guza androgennego)',
          tests: [
            { ext: 'chorionic_us_virilization', label: 'USG narządów rodnych (przezpochwowe)', note: 'Poszukiwanie guza jajnika. Guzy androgenne często MAŁE (1–5 cm), hipoechogeniczne, jednostronne.', description: 'USG przezpochwowe (TVS) narządów rodnych w diagnostyce wirylizacji. Najczęstsze guzy androgenne jajnika: (1) guzy z komórek Sertoliego-Leydiga (SLCT) — wymiar zwykle 4–15 cm, hipo- lub mieszane echogeniczne, jednostronne; histologicznie 1–5% guzów jajnika; (2) hilus cell tumor (guz z komórek Leydiga) — drobny (1–3 cm), hipoechogeniczny, jednostronny, zlokalizowany przy wnęce jajnika; (3) guzy z komórek tekalno-ziarnistych z androgenizacją (rzadko, częściej estrogenizacja). Przy ujemnym USG i wysokim testosteronie konieczne MRI miednicy (czułość wyższa dla drobnych guzów). U młodych pacjentek (< 18 lat lub kobiety bez współżycia) preferowane USG przezbrzuszne z pełnym pęcherzem moczowym.' },
            { ext: 'adrenal_ct_multiphase', label: 'TK nadnerczy wielofazowe z kontrastem', note: 'Standard diagnostyczny przy podejrzeniu czynnego hormonalnie guza nadnercza (ESE 2018, ACC guidelines).', description: 'TK nadnerczy wielofazowe z kontrastem dożylnym — standard diagnostyczny przy klinicznym i biochemicznym podejrzeniu czynnego hormonalnie guza nadnercza (wirylizacja, hiperaldosteronizm, zespół Cushinga nadnerczowy) wg wytycznych ESE 2018 (Fassnacht i wsp.). Protokół 4-fazowy: (1) faza natywna (bez kontrastu) — pomiar densytometrii w jednostkach Hounsfielda (HU); (2) faza tętnicza (~25–40 s po podaniu kontrastu) — ocena unaczynienia; (3) faza żylna (~70 s) — ocena charakteru zmiany; (4) faza opóźniona (10–15 min) — obliczenie wash-out kontrastu. Interpretacja: (1) gruczolak androgenny — wymiar 2–5 cm, HU natywne zwykle 10–25 (lipid-poor — większość gruczolaków produkujących androgeny; wartości > 25 HU sugerują podejrzenie złośliwości), absolute wash-out > 60% lub relative wash-out > 40% potwierdza gruczolaka; (2) rak kory nadnercza (ACC) — wymiar zwykle > 4 cm (często > 6 cm), HU natywne > 30, niejednorodna struktura (martwica wewnątrzguzowa, zwapnienia), nieregularny brzeg, naciekanie tkanek przyległych, niski wash-out (< 50%); (3) przy wymiarze > 4 cm i podejrzeniu ACC — kwalifikacja do operacji; NIE wykonywać biopsji przed wykluczeniem pheochromocytoma (metanefryny)! Alternatywa dla osób z przeciwwskazaniami do kontrastu jodowego: MRI nadnerczy z sekwencjami chemical-shift.' }
          ]
        },
        { name: 'Sytuacje szczególne',
          tests: [
            { id: 'cortisol', label: 'Test hamowania z 1 mg deksametazonu', note: 'Przy współistnieniu cech cushingoidalnych — wykluczenie zespołu Cushinga nadnerczowego z hipersekrecją androgenów.', description: 'Test skriningu zespołu Cushinga u kobiety z wirylizacją i obecnymi cechami cushingoidalnymi (otyłość brzuszna, rozstępy purpurowe > 1 cm, twarz księżycowata, oporne nadciśnienie). Rzadki, ale ważny podtyp guza nadnercza — rak kory nadnercza (ACC) lub duży gruczolak — może produkować ZARÓWNO kortyzol jak i androgeny, dając mieszany obraz Cushinga z wirylizacją. Protokół: 1 mg deksametazonu o godz. 23:00 (przed snem), kortyzol rano (8:00–9:00). Interpretacja: < 50 nmol/L (1,8 μg/dL) → wyklucza autonomię; 50–138 nmol/L → wynik niejednoznaczny; > 138 nmol/L → potwierdza autonomię. Pełne kryteria — zobacz wskazanie "Zespół Cushinga".' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Martin i wsp.) / ESE 2018 ACC (Fassnacht i wsp.) / PTGiP',
      sources: [
        'Martin KA, Anderson RR, Chang RJ, et al. Evaluation and treatment of hirsutism in premenopausal women: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(4):1233-1257.',
        'Fassnacht M, Dekkers OM, Else T, et al. European Society of Endocrinology clinical practice guidelines on the management of adrenocortical carcinoma in adults. Eur J Endocrinol. 2018;179(4):G1-G46.',
        'Yance VRV, Marcondes JAM, Rocha MP, et al. Discriminating between virilizing ovary tumors and ovary hyperthecosis in postmenopausal women: clinical data, hormonal profiles and image studies. Eur J Endocrinol. 2017;177(2):93-102.',
        'Sherlock M, Scarsbrook A, Abbas A, et al. Adrenal incidentaloma. Endocr Rev. 2020;41(6):775-820.',
        'Cordera F, Grant C, van Heerden J, et al. Androgen-secreting adrenal tumors. Surgery. 2003;134(6):874-880.',
        'Bednarczuk T, Bolanowski M, Sworczak K i wsp. Diagnostyka i postępowanie w guzach nadnerczy — stanowisko PTE. Endokrynologia Polska. (aktualizacje 2016–2022).'
      ]
    },

    '5a_reductase_deficiency': {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Niedobór 5α-reduktazy typu 2 (mutacja SRD5A2, dziedziczenie autosomalne recesywne) należy do zaburzeń różnicowania płci u chromosomalnego mężczyzny — DSD 46,XY. Dziecko ma kariotyp męski (46,XY), sprawne jądra i normalnie wysoki testosteron, ALE z powodu wadliwego enzymu nie potrafi wytwarzać DHT (5α-dihydrotestosteronu) — silniejszej formy androgenu. Powoduje to charakterystyczny rozdźwięk: niektóre cechy męskie rozwijają się normalnie (głos, mięśnie, libido — wystarcza im sam testosteron), inne nie (zarost, pełny rozwój prącia, łysienie typu męskiego — wymagają DHT). Klinicznie objawia się to nietypowymi narządami płciowymi u noworodka i „częściową" wirylizacją w pokwitaniu (patrz niżej).'
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'flask',
            title: 'Patofizjologia: testosteron (T) vs DHT — dwa różne androgeny',
            body: 'Organizm męski produkuje DWA aktywne androgeny: TESTOSTERON (T) — wytwarzany w jądrach przez komórki Leydiga; DHT (dihydrotestosteron) — powstaje OBWODOWO z testosteronu pod wpływem enzymu 5α-reduktazy (głównie w skórze, mieszkach włosowych, prostacie). DHT jest ok. 2–3× silniejszy od T (większe powinowactwo do receptora androgenowego, dłuższy okres półtrwania kompleksu z receptorem). Oba hormony działają na ten SAM receptor (AR), ale w innych tkankach i w innych okresach życia. Cechy zależne TYLKO od testosteronu (rozwijają się normalnie w 5α-RD): pogłębienie głosu w pokwitaniu, wzrost masy mięśniowej, libido i wzwody, spermatogeneza, rozwój przewodów Wolffa (najądrza, nasieniowody, pęcherzyki nasienne — formowane w życiu płodowym BEZ konieczności DHT). Cechy WYMAGAJĄCE DHT (brak/upośledzone w 5α-RD): rozwój zewnętrznych narządów płciowych w życiu płodowym (prącie, moszna, ujście cewki na szczycie), zarost (broda, wąsy, owłosienie klatki piersiowej), łysienie typu męskiego (recesja czołowo-skroniowa), rozwój prostaty, trądzik młodzieńczy.'
          },
          {
            kind: 'list',
            icon: 'baby-bottle',
            title: 'Obraz kliniczny — noworodek 46,XY',
            items: [
              {
                label: 'Niejednoznaczne narządy płciowe (najczęstsza prezentacja)',
                text: 'kombinacja cech męskich i nietypowych, wynikająca z braku DHT w życiu płodowym:',
                detail: [
                  'SPODZIECTWO — cewka moczowa otwiera się NIE na szczycie prącia, tylko po dolnej stronie (na trzonie, w okolicy moszny lub aż w kroczu — zależnie od ciężkości).',
                  'MIKROPENIS — bardzo małe prącie (długość po rozciągnięciu < 2,5 cm u noworodka donoszonego); bywa mylone z powiększoną łechtaczką.',
                  'Moszna NIEUFORMOWANA — niezamknięta, podzielona (bifid scrotum), wyglądająca jak wargi sromowe większe.',
                  'Wnętrostwo — jądra zwykle nie zstąpiły do moszny (siedzą w jamie brzusznej lub kanale pachwinowym), bo moszna nie rozwinęła się prawidłowo.'
                ]
              },
              {
                label: 'Postać skrajna: fenotyp całkowicie żeński',
                text: 'przy najcięższych mutacjach genu SRD5A2 zewnętrzne narządy wyglądają jak u dziewczynki:',
                detail: [
                  'Płytka „pochwa" (właściwie zachyłek tylko z fragmentem cewki) — bez macicy i jajowodów (zanikły pod wpływem AMH produkowanego przez sprawne jądra).',
                  'Dziecko bywa wychowywane jako dziewczynka — diagnoza często stawiana DOPIERO w okresie dojrzewania, gdy pojawiają się męskie cechy.'
                ]
              },
              {
                label: 'Co jest ZACHOWANE u noworodka',
                text: 'wewnętrzne narządy męskie rozwijają się normalnie:',
                detail: [
                  'Jądra są PRAWIDŁOWE — produkują testosteron i AMH.',
                  'Przewody Wolffa (najądrza, nasieniowody, pęcherzyki nasienne) rozwinięte — bo wymagają tylko testosteronu, nie DHT.',
                  'Macica i jajowody NIEOBECNE — AMH z jąder spowodował regresję przewodów Müllera.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'arrow-up-right',
            title: 'Obraz kliniczny — pokwitanie (kluczowy moment diagnostyczny)',
            items: [
              {
                label: 'Co ROZWIJA SIĘ normalnie (wystarcza sam testosteron)',
                text: 'jądra zaczynają produkować duże ilości T, który działa bez konwersji do DHT:',
                detail: [
                  'Pogłębienie głosu — typowo męska tessitura.',
                  'Wzrost masy i siły mięśniowej.',
                  'Libido (popęd seksualny), zwykle heteroseksualny (skierowany do kobiet).',
                  'Wzwody i ejakulacja (rozwój anatomiczny przewodów Wolffa pozwala na ejakulację mimo niewielkiego prącia).',
                  'Wzrost jąder do dorosłej wielkości; spermatogeneza często zachowana.'
                ]
              },
              {
                label: 'Czego BRAKUJE (wymaga DHT)',
                text: 'cechy typowo „męskie" związane z mieszkami włosowymi i skórą:',
                detail: [
                  'BRAK ZAROSTU — broda, wąsy, owłosienie klatki piersiowej minimalne lub zupełnie nieobecne (mimo prawidłowego owłosienia łonowego i pachowego).',
                  'BRAK łysienia typu męskiego — linia włosów na czole pozostaje „dziecięca".',
                  'PRĄCIE pozostaje MAŁE — nie osiąga dorosłej wielkości mimo dojrzewania.',
                  'Prostata pozostaje mała (rzadko obserwowane klinicznie u młodych mężczyzn).',
                  'Trądzik młodzieńczy minimalny.'
                ]
              },
              {
                label: 'Konsekwencja — dramatyczna ścieżka kliniczna',
                text: 'dziecko wychowywane jako dziewczynka nagle „męskieje" w pokwitaniu:',
                detail: [
                  'Klasyczna obserwacja — Dominikana, wioska Las Salinas (Imperato-McGinley 1974) — genetyczne ognisko 5α-RD2, dzieci nazywane „güevedoces" („jaja w dwunastym roku"). Odkrycie to było przełomem — pokazało, że DHT i T mają RÓŻNE funkcje fizjologiczne.',
                  'Część pacjentów dokonuje wówczas zmiany płci społecznej (z żeńskiej na męską), część pozostaje przy żeńskiej identyfikacji — DSD 46,XY wymaga zawsze interdyscyplinarnej opieki (endokrynolog dziecięcy, urolog, psycholog, genetyk).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny',
            items: [
              { label: '(1) Kariotyp', text: 'potwierdzenie 46,XY (różnicowanie z DSD 46,XX z wirylizacją).' },
              { label: '(2) Profil androgenowy bazalny', text: 'testosteron + DHT + obliczenie stosunku T/DHT; bazalnie > 30 silne podejrzenie; 16–30 niejednoznaczne → test hCG.' },
              { label: '(3) Test stymulacji hCG', text: 'przy wątpliwym wyniku bazalnym lub u dziecka przed pokwitaniem; stosunek T/DHT po hCG > 10–20 potwierdza rozpoznanie.' },
              { label: '(4) Genetyka SRD5A2', text: 'sekwencjonowanie genu — definitywne potwierdzenie; poradnictwo genetyczne dla rodziny (autosomalna recesywna).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wzorzec laboratoryjny',
            items: [
              { label: 'Testosteron', text: 'prawidłowy lub podwyższony — enzym 5α-reduktaza NIE wpływa na produkcję testosteronu (zaburzona jest tylko konwersja obwodowa do DHT).' },
              { label: 'DHT', text: 'obniżony — brak konwersji T → DHT; metoda referencyjna LC-MS/MS (immunoassaye dają wyniki zaniżone u dzieci).' },
              {
                label: 'Stosunek T/DHT — KLUCZOWY diagnostycznie',
                text: 'progi interpretacyjne:',
                detail: [
                  'Norma: T/DHT < 16.',
                  'Bazalnie > 30 → silne podejrzenie niedoboru 5α-reduktazy typu 2.',
                  'Bazalnie 16–30 → strefa niejednoznaczna, konieczny test stymulacji hCG.',
                  'Po stymulacji hCG: T/DHT > 10–20 potwierdza rozpoznanie (T znacznie wzrasta, DHT pozostaje niski).'
                ]
              },
              {
                label: 'Optymalny moment pomiaru',
                text: 'okno czasowe wpływa na wiarygodność wyników:',
                detail: [
                  'Niemowlę 1.–6. miesiąc życia — MINI-PUBERTY (przejściowa aktywacja osi przysadkowo-gonadowej, peak ~3 mies.); bazalne wartości T i DHT WIARYGODNE bez stymulacji.',
                  'Dziecko 6 mies. – pokwitanie — oś HPG fizjologicznie uśpiona; bazalne T i DHT niskie/nieoznaczalne → KONIECZNY test stymulacji hCG.',
                  'Okres dojrzewania — pomiar bazalny rano (7:00–10:00) wiarygodny.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka różnicowa',
            items: [
              {
                label: 'Zespół niewrażliwości na androgeny (CAIS/PAIS)',
                text: 'oporność receptora androgenowego (mutacja genu AR):',
                detail: [
                  'CAIS (complete) — fenotyp w pełni żeński przy 46,XY i obecnych jądrach (wewnątrz-jamiste); pierwotny brak miesiączki w okresie dojrzewania.',
                  'PAIS (partial) — częściowa wirylizacja; obraz pośredni między CAIS a 5α-RD2.',
                  'Wzorzec hormonalny: T i DHT prawidłowe lub PODWYŻSZONE (komórki Leydiga sprawne); LH wysoki (brak ujemnego sprzężenia zwrotnego); AMH i inhibina B prawidłowe.',
                  'Różnicowanie z 5α-RD2: w AIS DHT prawidłowe/podwyższone (przeciwnie niż w 5α-RD2 gdzie DHT obniżone).'
                ]
              },
              {
                label: 'Niedobór syntezy testosteronu',
                text: 'enzymatyczne defekty steroidogenezy gonadowej:',
                detail: [
                  'Niedobór 17β-HSD3 — defekt finalnej syntezy testosteronu z androstendionu; T niski, androstendion podwyższony.',
                  'Niedobór StAR (lipoidalny WPN) — defekt transportu cholesterolu do mitochondriów; ciężkie zaburzenie obu osi (steroidów płciowych i nadnerczowych).',
                  'Niedobór HSD3B2 (3β-HSD) — defekt wczesnej steroidogenezy; gromadzenie DHEA i pregnenolonu.',
                  'Niedobór 17α-hydroksylazy — defekt syntezy steroidów płciowych i kortyzolu; nadciśnienie tętnicze + brak rozwoju płciowego.',
                  'Wzorzec wspólny: T NISKI; LH WYSOKI (brak sprzężenia zwrotnego); różnicowanie wymaga pomiaru prekursorów steroidowych.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Diagnostyka podstawowa',
          tests: [
            EXT.karyotype,
            { id: 'testosterone_total', note: 'W niedoborze 5α-reduktazy prawidłowy lub podwyższony — enzym nie wpływa na produkcję testosteronu.', description: 'Testosteron całkowity u dziecka z niejednoznacznymi narządami płciowymi lub niedostateczną wirylizacją w okresie dojrzewania. W niedoborze 5α-reduktazy typu 2: testosteron prawidłowy dla wieku/Tannera lub podwyższony (brak ujemnej zwrotnej regulacji ze strony DHT). Optymalny moment pobrania: (1) u noworodków i niemowląt 1.–6. miesiąca życia — tzw. "mini-pubertacja" (przejściowa aktywacja osi przysadkowo-gonadalnej), kiedy testosteron jest fizjologicznie podwyższony i można go wiarygodnie oznaczyć; (2) u dzieci starszych przed pokwitaniem — testosteron bazalny niski, należy wykonać test stymulacji hCG; (3) w okresie dojrzewania — pomiar bazalny rano (7:00–10:00).' },
            { id: 'dht', note: 'W niedoborze 5α-reduktazy obniżony. Stosunek T/DHT bazalnie > 30 → silne podejrzenie; 16–30 → strefa niejednoznaczna, wskazany test stymulacji hCG.', description: 'DHT (5α-dihydrotestosteron) — najsilniejszy androgen, powstaje z testosteronu pod wpływem 5α-reduktazy. W niedoborze 5α-reduktazy typu 2 DHT jest obniżony pomimo prawidłowych/podwyższonych stężeń testosteronu. Diagnostycznie kluczowy jest stosunek T/DHT: w warunkach prawidłowych T/DHT < 16; bazalnie > 30 → silne podejrzenie niedoboru 5α-reduktazy; 16–30 → strefa niejednoznaczna, wymaga potwierdzenia testem stymulacji hCG (stosunek T/DHT po hCG > 10–20 potwierdza rozpoznanie). Metoda referencyjna: LC-MS/MS (immunoassaye dają wyniki zaniżone u dzieci). U dzieci przed pokwitaniem bazalne pomiary T i DHT są niskie i niemiarodajne — w tej grupie wiekowej konieczny test hCG dla wiarygodnej oceny.' }
          ]
        },
        { name: 'Test potwierdzający',
          tests: [
            { ext: 'hcg_test_5alpha', label: 'Test stymulacji hCG (z pomiarem T i DHT)', note: 'Stosunek T/DHT po stymulacji hCG > 10–20 potwierdza niedobór 5α-reduktazy typu 2.', description: 'Wariant testu stymulacji hCG dedykowany diagnostyce niedoboru 5α-reduktazy. Protokół klasyczny (Forest): Pregnyl (hCG) 1500 IU i.m. dziennie przez 3 dni; pomiar testosteronu i DHT w surowicy przed pierwszą dawką (0) oraz 24 godziny po ostatniej dawce (dzień 4.). Wariant dla niemowląt: hCG 100 IU/kg jednorazowo, pomiar T i DHT po 72 h. Interpretacja: stosunek T/DHT po stymulacji > 10–20 → potwierdza niedobór 5α-reduktazy typu 2 (testosteron znacznie wzrasta, DHT pozostaje niski — enzym nie konwertuje). Test ten ocenia także sprawność komórek Leydiga (wzrost testosteronu > 2× wartości bazalnej potwierdza obecne i czynne jądra) — różnicuje z innymi przyczynami DSD 46,XY (anorchia, ciężka dysgenezja gonad, zaburzenia biosyntezy testosteronu).' }
          ]
        },
        { name: 'Genetyka molekularna (potwierdzenie definitywne)',
          tests: [
            EXT.srd5a2_gen
          ]
        }
      ],
      guideline: 'ESPE / Endocrine Society / Mayo Test Catalog',
      sources: [
        'Mendonca BB, Batista RL, Domenice S, et al. Steroid 5α-reductase 2 deficiency. J Steroid Biochem Mol Biol. 2016;163:206-211.',
        'Wilson JD, Griffin JE, Russell DW. Steroid 5α-reductase 2 deficiency. Endocr Rev. 1993;14(5):577-593.',
        'Imperato-McGinley J, Zhu YS. Androgens and male physiology: the syndrome of 5α-reductase-2 deficiency. Mol Cell Endocrinol. 2002;198(1-2):51-59.',
        'Maimoun L, Philibert P, Cammas B, et al. Phenotypical, biological, and molecular heterogeneity of 5α-reductase deficiency: an extensive international experience of 55 patients. J Clin Endocrinol Metab. 2011;96(2):296-307.',
        'Hughes IA, Houk C, Ahmed SF, Lee PA. Consensus statement on management of intersex disorders. Arch Dis Child. 2006;91(7):554-563 (Chicago Consensus + aktualizacje 2016).',
        'Beń-Skowronek I, Bossowski A i wsp. Zaburzenia różnicowania płci — diagnostyka i postępowanie. Endokrynologia Pediatryczna. (wytyczne PTEDD).'
      ]
    },

    dsd: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Zaburzenia różnicowania płci (DSD — disorders of sex development) — wrodzone stany z nietypowym rozwojem płci chromosomalnej, gonadalnej lub anatomicznej. Najczęstsza sytuacja: noworodek z NIEJEDNOZNACZNYMI zewnętrznymi narządami płciowymi (skala Prader 2–4). Wymaga PILNEJ diagnostyki multidyscyplinarnej — kierowanie do OŚRODKA SPECJALISTYCZNEGO. Zespół diagnostyczny: endokrynolog pediatryczny + genetyk kliniczny + chirurg dziecięcy + psycholog + neonatolog; wybór płci wychowawczej wymaga starannej oceny biologicznej, psychologicznej i etycznej (Chicago Consensus 2006, aktualizacja 2016).'
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'book-2',
            title: 'PILNE: wykluczenie WPN z utratą soli',
            body: 'U dziecka z wirylizacją + fenotypem żeńskim PIERWSZY krok diagnostyczny to WYKLUCZENIE wrodzonego przerostu nadnerczy (WPN) z utratą soli. Przełom solny jest potencjalnie ŚMIERTELNY i typowo ujawnia się w 2.–4. tygodniu życia (hiponatremia, HIPERKALIEMIA, kwasica, odwodnienie). Bezzwłocznie: 17-OH-progesteron + elektrolity (Na, K) + glukoza + ocena równowagi kwasowo-zasadowej. W Polsce od 2018 r. obowiązuje skrining bibułowy 17-OHP w 3.–5. dobie życia — ale u dziecka z niejednoznacznymi narządami płciowymi należy oznaczyć NIEZWŁOCZNIE, bez oczekiwania na wynik skriningu.'
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'mood-kid',
            title: 'Okno mini-puberty (1.–6. miesiąc życia)',
            body: 'Mini-puberty — przejściowa aktywacja osi przysadkowo-gonadowej u niemowląt (peak ~3 mies., wygasa ~6 mies.). W tym oknie pomiary T, DHT, AMH, inhibiny B, LH i FSH są WIARYGODNE bez konieczności testów dynamicznych i mają wartość PROGNOSTYCZNĄ dla przyszłej funkcji gonad i płodności — informacja kluczowa dla poradnictwa rodzicom i planowania długoterminowego leczenia. poza tym oknem (po 6. mies., przed dojrzewaniem) oś HPG fizjologicznie uśpiona — testosteron bazalny niski/nieoznaczalny, KONIECZNY test stymulacji hCG dla wiarygodnej oceny.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm wstępny — krok po kroku',
            items: [
              { label: '(1) PILNE wykluczenie WPN', text: '17-OH-progesteron + sód + potas + glukoza + równowaga kwasowo-zasadowa.' },
              { label: '(2) Ustalenie płci genetycznej', text: 'kariotyp; FISH/QF-PCR daje szybki wstępny wynik (~24–48 h) na obecność chromosomu Y i SRY — przyspiesza decyzję kliniczną.' },
              { label: '(3) Ocena gonad (w oknie mini-puberty)', text: 'testosteron + DHT + AMH + inhibina B + LH + FSH — kompletna ocena czynności komórek Leydiga i Sertoliego.' },
              { label: '(4) Obrazowanie struktur wewnętrznych', text: 'USG narządów rodnych i jamy brzusznej — obecność macicy/jajowodów (struktury Müllerowskie), lokalizacja jąder, ocena nadnerczy.' },
              { label: '(5) Badania genetyczne molekularne', text: 'panel NGS DSD (50–100+ genów; czas oczekiwania 4–8 tygodni) — definitywne potwierdzenie diagnozy molekularnej.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wzorce różnicujące w mini-puberty',
            items: [
              {
                label: '↑LH + ↓T → dysgenezja jąder / anorchia / defekt biosyntezy testosteronu',
                text: 'pierwotna niewydolność komórek Leydiga lub brak gonad:',
                detail: [
                  'Dysgenezja jąder (czysta lub mieszana) — niska AMH, niska inhibina B.',
                  'Anorchia — brak jąder w USG; AMH nieoznaczalna.',
                  'Defekt biosyntezy testosteronu — niedobór 17β-HSD3, StAR (lipoidalny WPN), HSD3B2; komórki Leydiga obecne, ale nie produkują testosteronu; AMH może być prawidłowa.'
                ]
              },
              {
                label: '↑LH + ↑T → CAIS/PAIS (zespół niewrażliwości na androgeny)',
                text: 'oporność receptora androgenowego (mutacja AR):',
                detail: [
                  'Komórki Leydiga sprawne — produkcja testosteronu prawidłowa; oporność receptora → brak ujemnego sprzężenia zwrotnego → wzrost LH → wzrost T.',
                  'AMH prawidłowa lub podwyższona (komórki Sertoliego sprawne).',
                  'CAIS — fenotyp w pełni żeński przy 46,XY; pierwotny brak miesiączki w okresie dojrzewania.',
                  'PAIS — częściowa wirylizacja, obraz pośredni.'
                ]
              },
              { label: 'N/↑LH + N/↑T + ↓DHT → niedobór 5α-reduktazy typu 2', text: 'osobne wskazanie; stosunek T/DHT > 30 bazalnie lub > 10–20 po stymulacji hCG; mutacja SRD5A2.' },
              { label: '↓LH + ↓T → centralny hipogonadyzm', text: 'wrodzony hipopituitaryzm (mutacje PROP1, POU1F1), niedobór GnRH (zespół Kallmanna, izolowany IHH); konieczne MRI przysadki.' },
              { label: 'AMH/inhibina B niskie → dysgenezja gonad; prawidłowe → komórki Sertoliego sprawne', text: 'KLUCZOWY wzorzec różnicujący CAIS (Sertoli sprawne, AMH prawidłowa) od dysgenezji jąder (AMH niska/nieoznaczalna).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'PILNE w pierwszych dobach (wykluczenie WPN z utratą soli)',
          tests: [
            { id: 'oh17_progesterone', note: 'Skrining bibułowy obowiązkowy w Polsce od 2018 r. (3.–5. doba życia).', description: 'Skrining noworodkowy 17-OH-progesteronu w bibule (DBS) — obowiązkowy w Polsce od 2018 r. (rozporządzenie Ministra Zdrowia). Pobranie: 3.–5. doba życia z piętki noworodka, ta sama bibuła co inne skriningi (TSH, fenyloketonuria itd.). U noworodków pierwszej doby życia wartości fizjologicznie podwyższone — interpretacja wg progów wiekowych skriningu i masy urodzeniowej (osobne odcięcia dla wcześniaków). Wartości > 30 nmol/L (10 ng/mL) → klasyczny WPN; > 100 nmol/L → wysokie podejrzenie postaci z utratą soli. Pomocniczo pomiar w surowicy potwierdza rozpoznanie.' },
            { ext: 'sodium', label: 'Sód (Na)', note: 'W postaci WPN z utratą soli typowo hiponatremia — element przełomu nadnerczowego u noworodka (typowo 2.–4. tydzień życia).', description: 'W klasycznej postaci wrodzonego przerostu nadnerczy (WPN) z utratą soli typowo stwierdza się HIPONATREMIĘ (Na < 135 mmol/L). Mechanizm: niedobór 21-hydroksylazy uniemożliwia syntezę aldosteronu, co powoduje utratę sodu przez nerki. Hiponatremia wraz z hiperkaliemią, kwasicą metaboliczną i odwodnieniem składają się na obraz przełomu nadnerczowego z utratą soli — stan bezpośredniego zagrożenia życia, który u noworodka z nierozpoznanym WPN pojawia się typowo w 2.–4. tygodniu życia. U dziewczynki 46,XX z WPN narządy płciowe zewnętrzne są zwirylizowane (rozpoznanie często wcześniejsze, na podstawie fenotypu); u chłopca 46,XY narządy płciowe są prawidłowe — przełom solny bywa pierwszym objawem choroby.' },
            { ext: 'potassium', label: 'Potas (K)', note: 'W postaci WPN z utratą soli typowo hiperkaliemia — element przełomu nadnerczowego u noworodka (typowo 2.–4. tydzień życia).', description: 'W klasycznej postaci WPN z utratą soli typowo stwierdza się HIPERKALIEMIĘ (u noworodka K > 5,5 mmol/L). Mechanizm: niedobór aldosteronu zmniejsza wydalanie potasu przez nerki. Hiperkaliemia wraz z hiponatremią i kwasicą metaboliczną składają się na obraz przełomu nadnerczowego z utratą soli — stan bezpośredniego zagrożenia życia u noworodka z nierozpoznanym WPN, typowo w 2.–4. tygodniu życia. Współwystępowanie hiperkaliemii i hiponatremii u noworodka z niejednoznacznymi narządami płciowymi lub z objawami odwodnienia/wymiotami → pilne podejrzenie WPN z utratą soli, wymaga natychmiastowego leczenia.' }
          ]
        },
        { name: 'Diagnostyka genetyczna',
          tests: [
            EXT.karyotype
          ]
        },
        { name: 'Profil hormonalny — okno mini-puberty (1.–6. miesiąc życia)',
          tests: [
            { id: 'testosterone_total', note: 'Preferowany pomiar w mini-puberty (1.–6. mies., peak ~3 mies.). Poza tym oknem testosteron bazalny niski — konieczny test stymulacji hCG.', description: 'Testosteron całkowity u dziecka z DSD — w okresie mini-puberty (1.–6. miesiąc życia) oś przysadkowo-gonadalna jest fizjologicznie aktywna, a testosteron u chłopców 46,XY osiąga wartości pubertalne (typowo 6–12 nmol/L w peak ~3 mies.; pełny zakres mini-puberty 1–15 nmol/L w zależności od metody pomiaru i dokładnego wieku — wg Kuiri-Hänninen 2014 i Forest 1980). To okno diagnostyczne pozwala ocenić czynność komórek Leydiga bez testu stymulacji hCG. Poza oknem mini-puberty (po 6. miesiącu życia, przed dojrzewaniem) testosteron bazalny jest niski/nieoznaczalny — konieczny test stymulacji hCG dla wiarygodnej oceny. Metoda referencyjna: LC-MS/MS.' },
            { id: 'dht', note: 'Wraz z testosteronem ocena stosunku T/DHT (> 10–20 po hCG → niedobór 5α-reduktazy typu 2).' },
            { id: 'amh', note: 'Marker komórek Sertoliego — obecność i czynność jąder. U chłopców 46,XY wysokie wartości od urodzenia do dojrzewania; brak/niskie → dysgenezja jąder lub anorchia.', description: 'AMH (hormon antymüllerowski) — produkowany przez komórki Sertoliego od ~7. tygodnia życia płodowego, hamuje rozwój struktur Müllerowskich u płodu męskiego. W diagnostyce DSD: (1) marker obecności i czynności jąder (u chłopców 46,XY mediana 500–1500 pmol/L do dojrzewania); (2) niskie/brak AMH → dysgenezja jąder, anorchia, ciężka niewydolność komórek Sertoliego; (3) AMH prawidłowy/podwyższony + WYSOKI T + WYSOKI LH + fenotyp żeński z obecnymi jądrami → zespół niewrażliwości na androgeny (CAIS — oporność receptora androgenowego, komórki Sertoliego i Leydiga prawidłowe; brak ujemnego sprzężenia zwrotnego → wzrost LH → wzrost T); (4) AMH prawidłowy + niski T + niski DHT → izolowana dysfunkcja komórek Leydiga lub zaburzenia syntezy testosteronu (np. niedobór 17β-HSD3, StAR, HSD3B2 — komórki Sertoliego prawidłowe, ale zaburzona synteza testosteronu); (5) u dziewczynek 46,XX wartości bardzo niskie. AMH jest komplementarna do inhibiny B (oba markery Sertoliego, ale różne pule funkcjonalne).' },
            { id: 'inhibin_b', note: 'Marker komórek Sertoliego, komplementarny do AMH. W mini-puberty wartości pubertalne (peak ~3 mies.). Wartość PROGNOSTYCZNA dla przyszłej funkcji gonad.', description: 'Inhibina B — produkowana przez komórki Sertoliego (u chłopców) i komórki ziarniste (u dziewczynek). Wartości referencyjne mini-puberty u chłopców: 100–400 pg/mL (peak ~3 mies.); u dziewczynek <50 pg/mL. Komplementarna do AMH (oba markery komórek Sertoliego, ale różne aspekty czynności): (1) niska inhibina B + niska AMH → dysgenezja jąder, ciężka niewydolność komórek Sertoliego; (2) prawidłowa inhibina B → komórki Sertoliego prawidłowe (PAIS, CAIS — funkcja Sertolich zachowana); (3) inhibina B podwyższona w niektórych guzach jajnika (granulosa cell tumor). KLUCZOWE: inhibina B ma wartość PROGNOSTYCZNĄ — pomaga przewidzieć przyszłą funkcję gonad w okresie dojrzewania i płodność (informacja istotna dla poradnictwa rodzicom i planowania długoterminowego leczenia).' },
            { id: 'lh', note: 'W mini-puberty wartości pubertalne (0,5–6 IU/L u chłopców). LH wysoki + niski T → dysgenezja jąder lub defekt biosyntezy testosteronu; LH wysoki + wysoki T → zespół niewrażliwości na androgeny (CAIS/PAIS).', description: 'LH (hormon luteinizujący) w DSD u dziecka — kluczowy parametr osi przysadkowo-gonadowej w oknie mini-puberty (1.–6. miesiąc życia). Wartości referencyjne u chłopców w mini-puberty: 0,5–6 IU/L (peak ~3 mies.); u dziewczynek niższe (0–2 IU/L). Interpretacja w DSD: (1) LH wysoki + niski T → dysgenezja jąder, anorchia lub defekt biosyntezy testosteronu (17β-HSD3, StAR, HSD3B2 — komórki Leydiga obecne, ale nie produkują testosteronu); (2) LH wysoki + wysoki T → zespół niewrażliwości na androgeny (CAIS lub PAIS — komórki Leydiga prawidłowe, oporność receptora androgenowego → brak ujemnego sprzężenia zwrotnego → wzrost LH → wzrost T); (3) LH prawidłowy lub łagodnie podwyższony + prawidłowy/wysoki T + niski DHT → niedobór 5α-reduktazy typu 2 (komórki Leydiga sprawne, uszkodzony enzym konwersji testosteronu w DHT — komórki Leydiga NIE są uszkodzone); (4) LH niski/normalny + niski T → centralny hipogonadyzm (wrodzony hipopituitaryzm, niedobór GnRH). Pomiar poza oknem mini-puberty (po 6. miesiącu życia, przed dojrzewaniem) — niewiarygodny, oś HPG fizjologicznie uśpiona.' },
            { id: 'fsh', note: 'W mini-puberty wartości pubertalne (0,5–3 IU/L u chłopców). Wysoki → pierwotna dysfunkcja gonad (Klinefelter 47,XXY, dysgenezja jąder/jajników).', description: 'FSH (hormon folikulotropowy) w DSD u dziecka — marker funkcji komórek Sertoliego (u chłopców) lub komórek ziarnistych pęcherzyków jajnikowych (u dziewczynek). Wartości referencyjne mini-puberty u chłopców: 0,5–3 IU/L; u dziewczynek mogą być wyższe (do 8 IU/L). Interpretacja w DSD: (1) FSH wysoki → pierwotna dysfunkcja gonad (Klinefelter 47,XXY, dysgenezja jąder lub jajników, anorchia); (2) FSH niski/normalny → centralny hipogonadyzm (hipopituitaryzm wrodzony, niedobór GnRH); (3) FSH > LH w mini-puberty u chłopca → silne podejrzenie pierwotnej dysfunkcji gonad. Razem z LH stanowi parę różnicującą pierwotny vs centralny hipogonadyzm.' }
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            { ext: 'chorionic_us_dsd', label: 'USG narządów rodnych i jamy brzusznej', note: 'Poszukiwanie struktur Müllerowskich (macica, jajowody) i lokalizacja jąder.', description: 'USG narządów rodnych i jamy brzusznej w diagnostyce DSD u noworodka/niemowlęcia. Cele: (1) ocena obecności struktur Müllerowskich (macica, jajowody) — obecne u dziewczynki 46,XX i u dziecka z dysgenezją jąder (brak AMH); brak u chłopca 46,XY z prawidłową syntezą AMH; (2) poszukiwanie i lokalizacja jąder — zewnątrz-jamiste (worek mosznowy, kanał pachwinowy) vs wewnątrz-jamiste (kryptorchizm jedno- lub obustronny); (3) ocena nadnerczy (wykluczenie hiperplazji w WPN); (4) ocena pęcherza, struktur wodno-moczowych. U noworodków/niemowląt preferowane USG przezbrzuszne z pełnym pęcherzem moczowym. Przy złożonych malformacjach narządów płciowych — dodatkowo genitografia (kontrastowanie zatoki moczowo-płciowej).' }
          ]
        },
        { name: 'Dalsze badania (zależnie od fenotypu i wyników wstępnych)',
          tests: [
            EXT.hcg_test,
            { ext: 'dsd_ngs_panel', label: 'Panel genetyczny DSD (NGS multi-gene)', note: 'Sekwencjonowanie zestawu genów odpowiedzialnych za DSD. Zwykle 50–100+ genów; wynik 4–8 tygodni.', description: 'Panel genetyczny DSD wykonywany metodą NGS (Next Generation Sequencing) — sekwencjonowanie jednoczesne wielu genów odpowiedzialnych za zaburzenia różnicowania płci. Zakres panelu (najczęstsze geny): SRY (DSD 46,XX z tkanką jąderkową; DSD 46,XY z fenotypem żeńskim), NR5A1/SF-1 (DSD 46,XY z dysgenezją gonad, niewydolnością nadnerczy), SRD5A2 (niedobór 5α-reduktazy 2), AR (zespół niewrażliwości na androgeny CAIS/PAIS), CYP21A2 (WPN, niedobór 21-hydroksylazy), CYP11B1 (niedobór 11β-hydroksylazy), CYP17A1 (niedobór 17α-hydroksylazy), HSD3B2 (niedobór 3β-HSD), HSD17B3 (niedobór 17β-HSD typ 3), StAR (lipoidalny WPN), DAX1/NR0B1 (hipoplazja nadnerczy + hipogonadyzm hipogonadotropowy), WT1 (zespół Frasiera, Denysa-Drasha), SOX9 (CMPD1), DHH, GATA4. Panel zwykle 50–100+ genów; czas oczekiwania na wynik 4–8 tygodni. Interpretacja prowadzona przez genetyka klinicznego, w kontekście fenotypu klinicznego i wyników biochemicznych.' }
          ]
        }
      ],
      guideline: 'Chicago Consensus 2006 (Hughes i wsp.) / Aktualizacja 2016 (Lee i wsp.) / PTEDD',
      sources: [
        'Hughes IA, Houk C, Ahmed SF, Lee PA. Consensus statement on management of intersex disorders. Arch Dis Child. 2006;91(7):554-563.',
        'Lee PA, Nordenström A, Houk CP, et al. Global Disorders of Sex Development Update since 2006: Perceptions, Approach and Care. Horm Res Paediatr. 2016;85(3):158-180.',
        'Cools M, Köhler B, Hannema SE, et al. Caring for individuals with a difference of sex development (DSD): a Consensus Statement. Nat Rev Endocrinol. 2018;14(7):415-429.',
        'Audi L, Ahmed SF, Krone N, et al. Genetics in endocrinology: Approaches to molecular genetic diagnosis in the management of differences/disorders of sex development (DSD). Eur J Endocrinol. 2018;179(4):R197-R206.',
        'Kuiri-Hänninen T, Sankilampi U, Dunkel L. Activation of the hypothalamic-pituitary-gonadal axis in infancy: minipuberty. Horm Res Paediatr. 2014;82(2):73-80.',
        'Bizzarri C, Cappa M. Ontogeny of hypothalamus-pituitary gonadal axis and minipuberty: an ongoing debate? Front Endocrinol (Lausanne). 2020;11:187.',
        'Beń-Skowronek I, Bossowski A, Niedziela M i wsp. Zaburzenia różnicowania płci — diagnostyka i postępowanie. Endokrynologia Pediatryczna. (rekomendacje PTEDD).'
      ]
    },

    /* ═══════════════════════════════════════════════════════════════
     *  OŚ GONADALNA
     * ═══════════════════════════════════════════════════════════════ */

    hypogonadism_male: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kryteria rozpoznania',
            body: 'Hipogonadyzm męski — rozpoznanie wymaga OBU elementów: objawów klinicznych ORAZ biochemicznie potwierdzonego niedoboru testosteronu (2× testosteron całkowity pobrany rano 7:00–11:00, na czczo, w stanie stabilnym — bez chorób ostrych, deprywacji snu, dużego wysiłku). Próg rozpoznania wg Endocrine Society 2018 (Bhasin): testosteron całkowity < 9,2 nmol/L (264 ng/dL). Przy wartościach granicznych (8–12 nmol/L) lub nieprawidłowej SHBG oblicza się testosteron wolny (wzór Vermeulena).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Klasyfikacja wg gonadotropin',
            items: [
              { label: 'Pierwotny (hipergonadotropowy)', text: '↑LH i ↑FSH przy niskim testosteronie — uszkodzenie jąder.' },
              { label: 'Wtórny (hipogonadotropowy)', text: '↓ lub prawidłowe LH/FSH przy niskim testosteronie — przyczyna przysadkowo-podwzgórzowa.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'Postać pierwotna',
                text: 'uszkodzenie jąder na poziomie gonady:',
                detail: [
                  'Zespół Klinefeltera (47,XXY) — najczęstsza genetyczna przyczyna pierwotnego hipogonadyzmu męskiego.',
                  'Wnętrostwo (kryptorchidyzm) w wywiadzie — zwłaszcza obustronne, nieskorygowane chirurgicznie we wczesnym dzieciństwie.',
                  'Jatrogenne: chemioterapia (alkilujące, cisplatyna), radioterapia okolic miednicy, operacje jąder/orchidektomia.',
                  'Urazy jąder, skręt jądra w wywiadzie.',
                  'Zapalenie jąder w przebiegu świnki (orchitis post mumps) przebyte po okresie pokwitania.',
                  'Postać idiopatyczna.'
                ]
              },
              {
                label: 'Postać wtórna',
                text: 'przyczyny przysadkowo-podwzgórzowe:',
                detail: [
                  'Hiperprolaktynemia (najczęstsza odwracalna przyczyna) — m.in. prolactinoma, leki, niedoczynność tarczycy, niewydolność nerek.',
                  'Guzy okolicy podwzgórzowo-przysadkowej: prolactinoma, gruczolak nieczynny hormonalnie, czaszkogardlak, meningioma.',
                  'Zespół Kallmanna (wrodzony izolowany niedobór GnRH z anosmią) oraz inne wrodzone formy IHH (izolowanego hipogonadyzmu hipogonadotropowego).',
                  'Hemochromatoza i inne choroby naciekowe przysadki (sarkoidoza, histiocytoza, hipofizyt).',
                  'Następstwa urazu czaszkowo-mózgowego, radioterapii okolicy CSN, krwotoku do przysadki (apopleksja).',
                  'Jatrogenne / czynnościowe: opioidy, glikokortykosteroidy w wysokich dawkach, sterydy anaboliczne (zahamowanie osi po odstawieniu), ostre choroby, niedożywienie.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Przed włączeniem testosteronoterapii — obowiązkowe',
            items: [
              { label: 'PSA + badanie per rectum (DRE)', text: 'u mężczyzn ≥ 40. r.ż. — wykluczenie raka gruczołu krokowego (testosteron przeciwwskazany). U młodszych nie jest badaniem rutynowym.' },
              { label: 'Morfologia / hematokryt', text: 'wykluczenie erytrocytozy — hematokryt > 48–50% to przeciwwskazanie względne, terapię należy odroczyć do wyjaśnienia przyczyny.' },
              { label: 'Ocena ryzyka sercowo-naczyniowego', text: 'lipidogram, glukoza/HbA1c, ciśnienie tętnicze — pacjenci z hipogonadyzmem mają zwiększone ryzyko sercowo-naczyniowe.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie niedoboru testosteronu',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano (7:00–11:00), na czczo, 2× potwierdzenie w odrębnych dniach, w stanie stabilnym. Próg rozpoznania (Endocrine Society 2018): < 9,2 nmol/L (264 ng/dL).', description: 'Testosteron całkowity — podstawowy parametr rozpoznania hipogonadyzmu męskiego. Pobranie: rano (7:00–11:00, szczyt rytmu dobowego), na czczo, wymagane dwukrotne potwierdzenie w odrębnych dniach. Próg rozpoznania wg Endocrine Society 2018 (Bhasin): testosteron całkowity < 9,2 nmol/L (264 ng/dL) u mężczyzny z objawami. UWAGA: testosteron jest przejściowo obniżony w chorobach ostrych, po dużym wysiłku, przy deprywacji snu oraz w otyłości (obniżona SHBG) — pomiar należy wykonać w stanie stabilnym, a wartości graniczne zweryfikować obliczeniem testosteronu wolnego. Metoda referencyjna: LC-MS/MS.' },
            { id: 'shbg', note: 'Niezbędna do obliczenia testosteronu wolnego/biodostępnego. Obniżona w otyłości, cukrzycy typu 2 i niedoczynności tarczycy; podwyższona z wiekiem, w nadczynności tarczycy i chorobach wątroby.' },
            { id: 'testosterone_free', note: 'Oznaczać gdy testosteron całkowity graniczny (8–12 nmol/L) lub SHBG nieprawidłowa. Preferowane obliczenie wzorem Vermeulena (testosteron całkowity + SHBG + albumina) — bezpośrednie immunoassaye są niezalecane.', description: 'Testosteron wolny — biologicznie aktywna frakcja (~2% testosteronu całkowitego), niezwiązana z SHBG ani albuminą. Wskazany gdy testosteron całkowity jest w strefie granicznej (8–12 nmol/L) lub gdy SHBG jest nieprawidłowa (co rozłącza testosteron całkowity od rzeczywistej aktywności androgenowej). Preferowana metoda: obliczenie wzorem Vermeulena z testosteronu całkowitego, SHBG i albuminy (kalkulatory online) lub bezpośredni pomiar metodą dializy równowagowej z LC-MS/MS. Bezpośrednie immunoassaye testosteronu wolnego są niezalecane (niedokładne). Wartość progowa zależy od metody — orientacyjnie < ~225 pmol/L wspiera rozpoznanie.' }
          ]
        },
        { name: 'Różnicowanie: pierwotny vs wtórny',
          tests: [
            { id: 'lh', note: '↑LH → hipogonadyzm pierwotny (uszkodzenie jąder); ↓/prawidłowe LH przy niskim testosteronie → hipogonadyzm wtórny (przysadkowo-podwzgórzowy).' },
            { id: 'fsh', note: 'Oznaczany razem z LH. Wysoki FSH+LH przy niskim testosteronie → hipogonadyzm pierwotny (m.in. zespół Klinefeltera). Izolowany podwyższony FSH → uszkodzenie nabłonka plemnikotwórczego.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — częsta odwracalna przyczyna hipogonadyzmu wtórnego (hamuje pulsacyjne wydzielanie GnRH). Szczególnie gdy niski testosteron przy niskim/prawidłowym LH.' }
          ]
        },
        { name: 'Etiologia hipogonadyzmu pierwotnego (hipergonadotropowego)',
          tests: [
            EXT.karyotype,
            { ext: 'semen_analysis', label: 'Spermiogram (badanie nasienia)', note: 'Gdy istotna jest kwestia płodności lub podejrzenie azoospermii (m.in. zespół Klinefeltera). Ocena wg kryteriów WHO 2021.' },
            { ext: 'yq_microdel', label: 'Mikrodelecje AZF chromosomu Y', note: 'Przy azoospermii lub ciężkiej oligospermii — diagnostyka genetyczna podłoża niepłodności męskiej.' }
          ]
        },
        { name: 'Etiologia hipogonadyzmu wtórnego (hipogonadotropowego)',
          tests: [
            { ext: 'pituitary_mri', label: 'MRI przysadki z gadolinium', note: 'Wskazane przy znacznie obniżonym testosteronie z niskimi/prawidłowymi gonadotropinami, hiperprolaktynemii lub objawach guza (ubytki pola widzenia, bóle głowy). Przy cechach niedoczynności wielohormonalnej przysadki ocenić pozostałe osie: IGF-1, TSH/fT4, kortyzol poranny.', description: 'Rezonans magnetyczny przysadki w sekwencjach T1/T2 z dynamicznym podaniem gadolinium — w diagnostyce hipogonadyzmu hipogonadotropowego służy wykryciu zmian okolicy podwzgórzowo-przysadkowej: gruczolaka (w tym prolactinoma), guza nieczynnego hormonalnie, czaszkogardlaka, zmian naciekowych (hemochromatoza, sarkoidoza, histiocytoza) oraz następstw urazu lub radioterapii. Wskazania: testosteron znacznie obniżony przy niskich/prawidłowych LH i FSH, współistniejąca hiperprolaktynemia, objawy efektu masy (ubytki pola widzenia, bóle głowy), cechy niedoczynności innych osi przysadki. Makrogruczolak (≥ 10 mm) wykrywany praktycznie zawsze; mikrogruczolaki — z niższą czułością. Należy pamiętać o częstych incydentaloma przysadki w zdrowej populacji — wynik MRI należy korelować z obrazem hormonalnym.' },
            EXT.serum_iron
          ]
        },
        { name: 'Konsekwencje i ocena przed testosteronoterapią',
          tests: [
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Hipogonadyzm jest przyczyną wtórnej osteoporozy u mężczyzn — także młodych. U mężczyzn ≥ 50. r.ż. kryterium to T-score ≤ -2,5 = osteoporoza; u młodszych właściwy jest Z-score (≤ -2,0 = „poniżej zakresu oczekiwanego dla wieku").' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — komplementarny do DXA w ocenie ryzyka osteoporozy.' },
            { ext: 'psa', label: 'PSA + badanie per rectum (DRE)', note: 'Ocena gruczołu krokowego przed testosteronoterapią — wg Endocrine Society 2018 zalecana u mężczyzn ≥ 40. r.ż.; u młodszych nie jest badaniem rutynowym. Cel: wykluczenie raka gruczołu krokowego (testosteron przeciwwskazany). Kontrola także w trakcie leczenia.', description: 'PSA (swoisty antygen sterczowy) wraz z badaniem per rectum (DRE) — ocena gruczołu krokowego przed rozpoczęciem testosteronoterapii; wg Endocrine Society 2018 zalecana u mężczyzn ≥ 40. r.ż., u młodszych nie jest badaniem rutynowym. Testosteron jest przeciwwskazany w raku gruczołu krokowego (może stymulować wzrost guza hormonowrażliwego). Orientacyjne wartości PSA: < 4 ng/mL — zwykle prawidłowe; 4–10 ng/mL — strefa szara, wskazana konsultacja urologiczna; > 10 ng/mL — wysokie ryzyko, wymaga diagnostyki urologicznej. Współcześnie coraz częściej stosuje się progi swoiste dla wieku — niższe u młodszych mężczyzn (np. < 2,5 ng/mL w 40.–49. r.ż.), wyższe u starszych (np. < 6,5 ng/mL w 70.–79. r.ż.). W trakcie testosteronoterapii: kontrola PSA po 3–6 miesiącach, następnie co 12 miesięcy; wzrost PSA > 1,4 ng/mL w ciągu roku lub przekroczenie 4 ng/mL → konsultacja urologiczna. Badanie per rectum ocenia konsystencję gruczołu i ewentualne guzki.' },
            { ext: 'cbc', label: 'Morfologia krwi (hematokryt)', note: 'Wykluczenie erytrocytozy/policytemii — testosteron zwiększa hematokryt. PRZED rozpoczęciem terapii hematokryt > 48–50% → odroczenie; W TRAKCIE leczenia > 54% → wstrzymanie/modyfikacja. Morfologia wykrywa też niedokrwistość, która sama może być skutkiem hipogonadyzmu.' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Bhasin i wsp.) / EAU 2023 (Salonia i wsp.)',
      sources: [
        'Bhasin S, Brito JP, Cunningham GR, et al. Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(5):1715-1744.',
        'Salonia A, Bettocchi C, Boeri L, et al. European Association of Urology Guidelines on Sexual and Reproductive Health — Male Hypogonadism (aktualizacja 2023). Eur Urol. 2021;80(3):333-357.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o hipogonadyzmie męskim.'
      ]
    },

    hypogonadism_female: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Hipogonadyzm żeński — niedostateczna produkcja estrogenów przez jajniki. Objawia się zaburzeniami miesiączkowania (oligo-/amenorrhea), niepłodnością, objawami hipoestrogenizmu (uderzenia gorąca, suchość pochwy, dyspareunia), a długotrwale — osteoporozą i podwyższonym ryzykiem sercowo-naczyniowym. Szczegółowa diagnostyka przedwczesnej niewydolności jajników (POI) prowadzona jest w ramach dedykowanego wskazania.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Klasyfikacja wg gonadotropin',
            items: [
              {
                label: 'Hipergonadotropowy (jajnikowy)',
                text: '↑FSH i LH przy niskim estradiolu — wygasanie czynności jajników:',
                detail: [
                  'Przedwczesna niewydolność jajników (POI) — kryteria ESHRE 2016: FSH > 25 IU/L w dwóch pomiarach, oligo-/amenorrhea ≥ 4 mies., wiek < 40 lat.',
                  'Zespół Turnera (45,X lub mozaicyzm) — częsta chromosomalna przyczyna pierwotnego braku miesiączki i pierwotnej niewydolności jajników.',
                  'Premutacja FMR1 — najczęstsza znana pojedyncza genetyczna przyczyna POI (~13–15% przypadków rodzinnych, 3–5% sporadycznych).',
                  'Autoimmunologiczne zapalenie jajników (autoimmunologiczne POI) — często współistnieje z autoimmunizacją tarczycy lub kory nadnerczy (autoimmunologiczny zespół wielogruczołowy).',
                  'Jatrogenne: chemioterapia (zwłaszcza alkilujące), radioterapia miednicy, operacje jajników (resekcje, ooforektomia).',
                  'Naturalna menopauza (≥ 45. r.ż.) — fizjologiczna, osobne wskazanie.'
                ]
              },
              {
                label: 'Hipogonadotropowy (centralny)',
                text: '↓ lub prawidłowe FSH/LH przy niskim estradiolu — przyczyny przysadkowo-podwzgórzowe:',
                detail: [
                  'Czynnościowy podwzgórzowy brak miesiączki (FHA) — najczęstsza odwracalna przyczyna, związana z niską masą ciała, intensywnym wysiłkiem, stresem, zaburzeniami odżywiania.',
                  'Hiperprolaktynemia (prolactinoma, leki, niedoczynność tarczycy, niewydolność nerek) — hamuje pulsacyjne wydzielanie GnRH.',
                  'Guzy okolicy podwzgórzowo-przysadkowej: prolactinoma, gruczolak nieczynny hormonalnie, czaszkogardlak.',
                  'Zespół Sheehana — niedoczynność przysadki po krwotoku poporodowym (martwica niedokrwienna przysadki).',
                  'Zespół Kallmanna i inne wrodzone formy izolowanego niedoboru GnRH (rzadziej niż u mężczyzn).',
                  'Następstwa urazu czaszkowo-mózgowego, radioterapii okolicy CSN, choroby naciekowe (hemochromatoza, sarkoidoza, histiocytoza, hipofizyt).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Sekwencja diagnostyczna',
            items: [
              '(1) β-hCG ZAWSZE pierwszy — wykluczenie ciąży u kobiet w wieku rozrodczym.',
              '(2) Panel hormonalny: FSH + LH + estradiol — klasyfikacja postaci (hipergonadotropowy vs hipogonadotropowy).',
              '(3) Prolaktyna + TSH — wykluczenie odwracalnych przyczyn osi gonadalnej.',
              '(4) Etiologia zależnie od wzorca: w postaci jajnikowej — kariotyp + FMR1 + autoimmunologia; w postaci centralnej — MRI przysadki (po wykluczeniu FHA).',
              '(5) Ocena konsekwencji hipoestrogenizmu: DXA (Z-score u kobiet przed menopauzą), witamina D.'
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie i klasyfikacja hipogonadyzmu',
          tests: [
            { ext: 'bhcg', label: 'β-hCG (test ciążowy)', note: 'Wykluczenie ciąży u kobiet w wieku rozrodczym — pierwszy krok przed dalszą diagnostyką hormonalną i obrazową.', description: 'β-hCG (podjednostka β ludzkiej gonadotropiny kosmówkowej) — test ciążowy z krwi (ilościowy) lub z moczu (jakościowy). U kobiety w wieku rozrodczym ciążę należy wykluczyć przed rozpoczęciem diagnostyki hipogonadyzmu — jest najczęstszą przyczyną zatrzymania miesiączki i przejściowych zmian hormonalnych. Test z krwi (ilościowy) jest czulszy i wykrywa ciążę wcześniej niż test z moczu.' },
            { id: 'fsh', note: 'Oznaczać 2× w odstępie 4–6 tygodni; u kobiet miesiączkujących we wczesnej fazie folikularnej (2.–5. dzień cyklu). ↑FSH (i LH) → hipogonadyzm hipergonadotropowy (jajnikowy — m.in. POI, zespół Turnera); próg rozpoznania POI wg ESHRE 2016: FSH > 25 IU/L w dwóch pomiarach. ↓/prawidłowy FSH przy niskim estradiolu → hipogonadyzm hipogonadotropowy (centralny).' },
            { id: 'lh', note: 'Oznaczany razem z FSH. Wzorzec ↑FSH/↑LH → postać hipergonadotropowa; ↓/prawidłowe FSH/LH przy niskim estradiolu → postać hipogonadotropowa.' },
            { id: 'estradiol', note: 'Niskie stężenie potwierdza hipoestrogenizm. Interpretować łącznie z FSH/LH — sam niski estradiol nie różnicuje przyczyny jajnikowej od centralnej.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — częsta odwracalna przyczyna hipogonadyzmu hipogonadotropowego (hamuje pulsacyjne wydzielanie GnRH).' },
            { id: 'tsh', note: 'Wykluczenie dysfunkcji tarczycy — zarówno nad-, jak i niedoczynność zaburzają cykl miesiączkowy i oś gonadalną.' }
          ]
        },
        { name: 'Etiologia hipogonadyzmu hipergonadotropowego (jajnikowego)',
          tests: [
            EXT.karyotype,
            EXT.fmr1,
            { ext: 'anti_21oh', label: 'Przeciwciała anty-21-hydroksylazie', note: 'Marker autoimmunizacji nadnerczowej — autoimmunologiczne zapalenie jajników (autoimmunologiczne POI) często współwystępuje z autoimmunizacją kory nadnerczy / autoimmunologicznym zespołem wielogruczołowym.', description: 'Przeciwciała przeciwko 21-hydroksylazie nadnerczowej (CYP21A2) — w diagnostyce hipogonadyzmu hipergonadotropowego u kobiet służą wykryciu autoimmunologicznego tła przedwczesnej niewydolności jajników. Autoimmunologiczne zapalenie jajników jest rozpoznawalną, choć stosunkowo rzadką przyczyną POI — większość przypadków POI pozostaje idiopatyczna. Autoimmunizacja kory nadnerczy wykrywana przeciwciałami anty-21-OH dotyczy tylko niewielkiego odsetka (~4%) kobiet z POI; przeciwciała te są jednak istotne klinicznie, ponieważ identyfikują podgrupę zagrożoną chorobą Addisona (autoimmunologiczny zespół wielogruczołowy typu 1 i 2). Dodatni wynik wskazuje na potrzebę oceny czynności nadnerczy. Norma laboratoryjna zwykle < 1 IU/mL (zależy od metody).' },
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO', note: 'Autoimmunologiczna choroba tarczycy często towarzyszy autoimmunologicznej przedwczesnej niewydolności jajników (autoimmunologiczny zespół wielogruczołowy) — badanie przesiewowe w kierunku współistniejącej tyreopatii.' },
            { id: 'amh', note: 'Bardzo niski lub nieoznaczalny AMH potwierdza wyczerpanie rezerwy jajnikowej — wspiera rozpoznanie postaci jajnikowej (POI). Stężenie AMH nie zależy istotnie od fazy cyklu.' }
          ]
        },
        { name: 'Etiologia hipogonadyzmu hipogonadotropowego (centralnego)',
          tests: [
            { ext: 'pituitary_mri', label: 'MRI przysadki z gadolinium', note: 'Wskazane przy niskim estradiolu z niskimi/prawidłowymi FSH/LH — zwłaszcza z hiperprolaktynemią, objawami guza (ubytki pola widzenia, bóle głowy) lub cechami niedoczynności wielohormonalnej. Wcześniej rozważyć czynnościowy podwzgórzowy brak miesiączki (niska masa ciała, intensywny wysiłek, stres, zaburzenia odżywiania) — przyczynę odwracalną, niewymagającą obrazowania. Przy podejrzeniu niedoczynności wielohormonalnej ocenić pozostałe osie (IGF-1, kortyzol poranny).', description: 'Rezonans magnetyczny przysadki w sekwencjach T1/T2 z dynamicznym podaniem gadolinium — w diagnostyce hipogonadyzmu hipogonadotropowego u kobiet służy wykryciu zmian okolicy podwzgórzowo-przysadkowej: gruczolaka (w tym prolactinoma), guza nieczynnego hormonalnie, czaszkogardlaka, zmian naciekowych, zespołu pustego siodła czy następstw urazu lub radioterapii (m.in. zespół Sheehana po krwotoku poporodowym w wywiadzie). Przed skierowaniem na MRI należy wykluczyć najczęstszą przyczynę czynnościową — podwzgórzowy brak miesiączki (FHA) związany z niską masą ciała, intensywnym wysiłkiem, stresem lub zaburzeniami odżywiania — która jest odwracalna i nie wymaga obrazowania. Makrogruczolak (≥ 10 mm) wykrywany praktycznie zawsze; należy pamiętać o częstych incydentaloma przysadki w zdrowej populacji — wynik korelować z obrazem hormonalnym.' }
          ]
        },
        { name: 'Konsekwencje',
          tests: [
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Przewlekły hipoestrogenizm prowadzi do utraty masy kostnej i osteoporozy. U kobiet przed menopauzą właściwym parametrem jest Z-score (≤ -2,0 = „poniżej zakresu oczekiwanego dla wieku"); kryterium T-score ≤ -2,5 dotyczy kobiet po menopauzie.' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — komplementarny do DXA w ocenie ryzyka osteoporozy.' }
          ]
        }
      ],
      guideline: 'ESHRE POI 2016 (Webber i wsp.) / PTGiP',
      sources: [
        'Webber L, Davies M, Anderson R, et al. ESHRE Guideline: management of women with premature ovarian insufficiency. Hum Reprod. 2016;31(5):926-937.',
        'Polskie Towarzystwo Ginekologów i Położników — rekomendacje dotyczące diagnostyki i postępowania w przedwczesnej niewydolności jajników i zaburzeniach miesiączkowania.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o hipogonadyzmie i niewydolności jajników.'
      ]
    },

    andropause: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst',
            body: 'Andropauza = hipogonadyzm późnego początku (LOH — late-onset hypogonadism) u starzejących się mężczyzn. Rozpoznanie wymaga OBU elementów: objawów klinicznych (obniżone libido, zaburzenia erekcji, zmęczenie, obniżenie nastroju, spadek masy mięśniowej i gęstości kości) ORAZ biochemicznie potwierdzonego niedoboru testosteronu (2× pomiar rano).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Odwracalne przyczyny obniżenia testosteronu (wykluczyć przed rozpoznaniem)',
            items: [
              'Otyłość',
              'Zespół metaboliczny',
              'Cukrzyca typu 2',
              'Obturacyjny bezdech senny (OSA)',
              'Leki (opioidy, glikokortykosteroidy)',
              'Ostre choroby'
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Przed włączeniem testosteronoterapii — obowiązkowe',
            items: [
              { label: 'PSA + badanie per rectum (DRE)', text: 'wykluczenie raka gruczołu krokowego — testosteron przeciwwskazany' },
              { label: 'Morfologia / hematokryt', text: 'wykluczenie erytrocytozy' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Rozpoznanie (potwierdzenie niedoboru testosteronu)',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano (7:00–11:00), na czczo, 2× potwierdzenie. Progi (EAU): < 12 nmol/L (350 ng/dL) u objawowego mężczyzny → strefa wymagająca dalszej oceny; < 8 nmol/L (230 ng/dL) → wyraźny niedobór.', description: 'Testosteron całkowity — podstawowy parametr rozpoznania hipogonadyzmu późnego początku (LOH). Pobranie: rano (7:00–11:00), na czczo, wymagane dwukrotne potwierdzenie w odstępie (rytm dobowy testosteronu — najwyższe stężenia rano). Progi interpretacyjne: wg EAU 2023 — < 12 nmol/L (350 ng/dL) u mężczyzny z objawami → strefa wymagająca dalszej oceny (SHBG, wolny testosteron); < 8 nmol/L (230 ng/dL) → wyraźny niedobór wymagający leczenia. Endocrine Society 2018 (Bhasin) stosuje próg < 9,2 nmol/L (264 ng/dL) dla rozpoznania hipogonadyzmu. UWAGA: testosteron jest obniżony przejściowo w chorobach ostrych, po wysiłku, przy niedoborze snu — pomiar należy wykonać w stanie stabilnym. Metoda referencyjna: LC-MS/MS.' },
            { id: 'shbg', note: 'Rośnie z wiekiem — u starszych mężczyzn często podwyższona. Niezbędna do obliczenia wolnego/biodostępnego testosteronu gdy testosteron całkowity jest graniczny.', description: 'SHBG (globulina wiążąca hormony płciowe) — u starzejących się mężczyzn jej stężenie zwykle rośnie z wiekiem, co może maskować niedobór testosteronu (testosteron całkowity prawidłowy, ale wolny obniżony). SHBG jest natomiast obniżona w otyłości, cukrzycy typu 2, zespole metabolicznym, niedoczynności tarczycy. Pomiar SHBG jest niezbędny do obliczenia wolnego i biodostępnego testosteronu — kluczowy gdy testosteron całkowity jest w strefie granicznej (8–12 nmol/L).' },
            { id: 'testosterone_free', note: 'Oznaczać gdy testosteron całkowity graniczny (8–12 nmol/L) lub gdy SHBG nieprawidłowa. Próg wolnego testosteronu < 225 pmol/L (~65 pg/mL, zależnie od metody).', description: 'Testosteron wolny — biologicznie aktywna frakcja (~2% testosteronu całkowitego). Wskazany gdy testosteron całkowity jest w strefie granicznej (8–12 nmol/L) lub gdy SHBG jest nieprawidłowa (podwyższona u starszych, obniżona w otyłości). Próg: wolny testosteron < 225 pmol/L (~65 pg/mL) wspiera rozpoznanie hipogonadyzmu — wartość progowa różni się jednak między metodami (część źródeł podaje 180–250 pmol/L). Preferowana metoda: obliczenie z testosteronu całkowitego + SHBG + albuminy wg wzoru Vermeulena (dostępne w kalkulatorach online) lub bezpośredni pomiar metodą dializy równowagowej z LC-MS/MS. Bezpośrednie immunoassaye wolnego testosteronu są niezalecane.' }
          ]
        },
        { name: 'Różnicowanie etiologii',
          tests: [
            { id: 'lh', note: 'Wysoki → hipogonadyzm pierwotny (uszkodzenie jąder); niski/prawidłowy → hipogonadyzm wtórny (przysadkowo-podwzgórzowy). W LOH typowo obraz mieszany lub wtórny.' },
            { id: 'fsh', note: 'Oznaczany razem z LH. Wysoki FSH przy niskim testosteronie → hipogonadyzm pierwotny.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — szczególnie gdy testosteron niski przy niskim/prawidłowym LH (hipogonadyzm wtórny). Hiperprolaktynemia hamuje oś gonadową.' }
          ]
        },
        { name: 'Przed rozpoczęciem testosteronoterapii (obowiązkowe)',
          tests: [
            EXT.psa,
            { ext: 'cbc', label: 'Morfologia krwi (hematokryt)', note: 'Wykluczenie erytrocytozy/policytemii — testosteron zwiększa hematokryt. PRZED rozpoczęciem terapii hematokryt > 48–50% → odroczenie; W TRAKCIE leczenia > 54% → wstrzymanie/modyfikacja.', description: 'Morfologia krwi z oceną hematokrytu — obowiązkowa przed rozpoczęciem testosteronoterapii i w trakcie leczenia. Testosteron stymuluje erytropoezę i zwiększa hematokryt; nadmierny wzrost (erytrocytoza/policytemia) zwiększa ryzyko powikłań zakrzepowo-zatorowych. Progi (Bhasin ES 2018): PRZED rozpoczęciem terapii — hematokryt > 48–50% stanowi przeciwwskazanie względne, terapię należy odroczyć do wyjaśnienia przyczyny i normalizacji. W TRAKCIE leczenia — kontrola morfologii po 3–6 miesiącach, następnie co 12 miesięcy; przy hematokrycie > 54% wskazana redukcja dawki, zmiana preparatu lub czasowe wstrzymanie terapii. Morfologia pozwala też wykryć niedokrwistość, która sama może być skutkiem hipogonadyzmu (testosteron stymuluje erytropoezę).' }
          ]
        },
        { name: 'Ocena chorób towarzyszących i konsekwencji',
          tests: [
            EXT.lipid_panel,
            EXT.hba1c,
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Niedobór testosteronu prowadzi do utraty masy kostnej i osteoporozy u mężczyzn. W andropauzie (hipogonadyzm wieku starszego) pacjenci są zwykle ≥ 50. r.ż. — kryterium rozpoznania to T-score ≤ -2,5 = osteoporoza.' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — hipogonadyzm jest przyczyną wtórnej osteoporozy u mężczyzn.' }
          ]
        }
      ],
      guideline: 'EAU 2023 (Salonia i wsp.) / Endocrine Society 2018 (Bhasin i wsp.) / PTA',
      sources: [
        'Salonia A, Bettocchi C, Boeri L, et al. European Association of Urology Guidelines on Sexual and Reproductive Health — Male Hypogonadism (aktualizacja 2023). Eur Urol. 2021;80(3):333-357.',
        'Bhasin S, Brito JP, Cunningham GR, et al. Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(5):1715-1744.',
        'Lunenfeld B, Mskhalaya G, Zitzmann M, et al. Recommendations on the diagnosis, treatment and monitoring of testosterone deficiency in men. Aging Male. 2021;24(1):119-138.',
        'Wu FC, Tajar A, Beynon JM, et al. Identification of late-onset hypogonadism in middle-aged and elderly men (EMAS study). N Engl J Med. 2010;363(2):123-135.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o hipogonadyzmie męskim.'
      ]
    },

    menopause: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst rozpoznania',
            body: 'Rozpoznanie menopauzy jest KLINICZNE — 12 kolejnych miesięcy braku miesiączki u kobiety ≥ 45. r.ż. bez innej przyczyny, bez potrzeby badań hormonalnych. Jeśli objawy wygasania czynności jajników występują przed 40. r.ż., właściwym rozpoznaniem jest przedwczesna niewydolność jajników (POI — osobne wskazanie), nie menopauza. Druga część panelu obejmuje ocenę przed włączeniem menopauzalnej terapii hormonalnej (MHT/HRT).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Kiedy wykonać diagnostykę laboratoryjną',
            items: [
              {
                label: 'Sytuacje nietypowe — wskazana ocena hormonalna',
                text: 'rozpoznanie nie jest jednoznacznie kliniczne:',
                detail: [
                  'Wiek 40–45 lat — wczesna menopauza wymaga różnicowania z POI; konieczne potwierdzenie hormonalne.',
                  'Brak macicy (po histerektomii) — niemożność oceny braku miesiączek jako kryterium klinicznego.',
                  'Stosowanie antykoncepcji hormonalnej lub MHT — hamuje cykl, uniemożliwia ocenę kliniczną.',
                  'Nietypowy obraz kliniczny lub podejrzenie innej przyczyny zaburzeń miesiączkowania (hiperprolaktynemia, dysfunkcja tarczycy).'
                ]
              },
              {
                label: 'Pułapki interpretacji FSH w perimenopauzie',
                text: 'pojedynczy pomiar bywa zawodny — silne wahania międzycykliczne:',
                detail: [
                  'FSH w perimenopauzie wykazuje DUŻĄ zmienność z cyklu na cykl — pojedynczy pomiar może być prawidłowy mimo zaawansowanej perimenopauzy.',
                  'Orientacyjnie: FSH > 25 IU/L sugeruje, > 40 IU/L wspiera rozpoznanie — żaden próg nie jest jednak rozstrzygający w pojedynczym pomiarze.',
                  'U kobiety ≥ 45. r.ż. z 12-miesięcznym brakiem miesiączki rozpoznanie pozostaje kliniczne — oznaczanie FSH NIE jest potrzebne.',
                  'Niski estradiol jest zgodny z menopauzą, ale również waha się w perimenopauzie — interpretować ZAWSZE łącznie z FSH.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Ocena przed włączeniem MHT/HRT',
            items: [
              {
                label: 'Onkologiczna',
                text: 'przesiew nowotworów hormonowrażliwych:',
                detail: [
                  'Mammografia — przesiew raka piersi przed rozpoczęciem MHT oraz kontrolnie w trakcie (MHT estrogenowo-progestagenowa wiąże się z niewielkim wzrostem ryzyka raka piersi).',
                  'USG przezpochwowe — WSKAZANIE jest krwawienie po menopauzie lub nieprawidłowe krwawienia w trakcie MHT (każde takie krwawienie wymaga wykluczenia rozrostu/raka endometrium); rutynowe wyjściowe USG przed MHT u kobiety bezobjawowej NIE jest wymagane.',
                  'Cytologia szyjki macicy (PAP) — element rutynowej oceny ginekologicznej.'
                ]
              },
              {
                label: 'Sercowo-naczyniowa i metaboliczna',
                text: 'wpływa na wybór drogi podania i ocenę „okna terapeutycznego":',
                detail: [
                  'Lipidogram (TC, LDL, HDL, TG) — przy podwyższonym ryzyku CV i hipertriglicerydemii preferowana droga PRZEZSKÓRNA (omija efekt pierwszego przejścia przez wątrobę).',
                  'Glukoza na czczo — element profilu metabolicznego, wykrycie nieprawidłowej glikemii lub cukrzycy.',
                  '„Okno terapeutyczne": korzystny bilans korzyści i ryzyka MHT dotyczy kobiet rozpoczynających terapię przed 60. r.ż. lub w ciągu 10 lat od menopauzy; rozpoczęcie później przesuwa bilans w stronę ryzyka sercowo-naczyniowego i udaru.'
                ]
              },
              {
                label: 'Wątroba — wybór drogi podania',
                text: 'czynna choroba wątroby jest przeciwwskazaniem do doustnej terapii estrogenowej:',
                detail: [
                  'Próby wątrobowe (ALAT, ASPAT, GGTP, bilirubina) — ocena czynności wątroby przed MHT.',
                  'Przy patologii wątroby preferowana droga PRZEZSKÓRNA (omija metabolizm wątrobowy i efekt pierwszego przejścia).'
                ]
              },
              { label: 'Kości', text: 'DXA (densytometria) — po menopauzie spadek estrogenów przyspiesza utratę masy kostnej; kryterium rozpoznania osteoporozy to T-score ≤ -2,5. Komplementarnie witamina D (25-OH).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie hormonalne — tylko w sytuacjach wątpliwych',
          tests: [
            { id: 'fsh', note: 'W perimenopauzie FSH silnie się waha — pojedynczy pomiar bywa zawodny. Orientacyjnie > 25 IU/L sugeruje, > 40 IU/L wspiera rozpoznanie. Niepotrzebny do rutynowego rozpoznania menopauzy u kobiety ≥ 45. r.ż. (rozpoznanie kliniczne).', description: 'FSH (hormon folikulotropowy) w diagnostyce menopauzy — wzrasta wskutek wygasania czynności pęcherzykowej jajników i utraty ujemnego sprzężenia zwrotnego (spadek estradiolu i inhibiny B). UWAGA: w okresie perimenopauzy FSH wykazuje dużą zmienność z cyklu na cykl — pojedynczy pomiar może być prawidłowy mimo zaawansowanej perimenopauzy, dlatego nie należy opierać na nim rozpoznania. Orientacyjnie FSH > 25 IU/L sugeruje, a > 40 IU/L wspiera rozpoznanie menopauzy. U kobiety ≥ 45. r.ż. z 12-miesięcznym brakiem miesiączki rozpoznanie jest kliniczne i nie wymaga oznaczania FSH; badanie ma wartość głównie w sytuacjach wątpliwych (wiek 40–45 lat, brak macicy, stosowanie antykoncepcji hormonalnej uniemożliwiające ocenę cyklu).' },
            { id: 'estradiol', note: 'Niski estradiol odzwierciedla wygasanie czynności jajników. Interpretować łącznie z FSH; podobnie jak FSH waha się w perimenopauzie.' },
            { id: 'tsh', note: 'Wykluczenie dysfunkcji tarczycy — zarówno nad-, jak i niedoczynność dają objawy naśladujące menopauzę (uderzenia gorąca, zmęczenie, zmiany nastroju, zaburzenia miesiączkowania).' }
          ]
        },
        { name: 'Ocena przed menopauzalną terapią hormonalną (MHT/HRT)',
          tests: [
            { ext: 'mammography', label: 'Mammografia', note: 'Przesiew raka piersi przed rozpoczęciem menopauzalnej terapii hormonalnej oraz kontrolnie w jej trakcie — MHT (zwłaszcza estrogenowo-progestagenowa) wiąże się z niewielkim wzrostem ryzyka raka piersi.' },
            { ext: 'endometrium_us', label: 'USG przezpochwowe', note: 'Wskazaniem jest krwawienie po menopauzie lub nieprawidłowe krwawienia w trakcie MHT — zawsze objaw alarmowy, wymagający wykluczenia rozrostu i raka endometrium. U kobiety bezobjawowej rutynowe wyjściowe USG przezpochwowe przed MHT nie jest wymagane.', description: 'USG przezpochwowe z oceną endometrium — ocena grubości i echostruktury błony śluzowej macicy. Podstawowym wskazaniem jest krwawienie po menopauzie (po 12 miesiącach od ostatniej miesiączki) lub nieprawidłowe krwawienia w trakcie MHT — każde takie krwawienie jest objawem alarmowym i wymaga diagnostyki w kierunku rozrostu (hiperplazji) i raka endometrium. U kobiety z krwawieniem po menopauzie grubość endometrium ≤ 4 mm ma wysoką negatywną wartość predykcyjną dla raka endometrium; endometrium pogrubiałe (> 4 mm) lub niejednorodne jest wskazaniem do biopsji/histeroskopii. UWAGA: próg ≤ 4 mm odnosi się do kobiet z krwawieniem — u kobiety bezobjawowej przypadkowo stwierdzone pogrubienie endometrium nie jest automatycznym wskazaniem do biopsji i wymaga indywidualnej oceny. W trakcie terapii estrogenowo-progestagenowej progestagen chroni endometrium przed rozrostem.' },
            { ext: 'pap_smear', label: 'Cytologia (PAP)', note: 'Ogólny przesiew raka szyjki macicy — element rutynowej oceny ginekologicznej przy kwalifikacji do MHT, nie badanie swoiste dla menopauzy.' },
            { ext: 'lipid_panel', label: 'Lipidogram (TC, LDL, HDL, TG)', note: 'Ocena ryzyka sercowo-naczyniowego przed MHT — wpływa na wybór drogi podania (przezskórna preferowana przy podwyższonym ryzyku sercowo-naczyniowym i hipertriglicerydemii — omija efekt pierwszego przejścia przez wątrobę). Uwzględnia też tzw. okno terapeutyczne: korzystny bilans korzyści i ryzyka MHT dotyczy kobiet rozpoczynających terapię przed 60. r.ż. lub w ciągu 10 lat od menopauzy; rozpoczęcie później przesuwa bilans w stronę ryzyka sercowo-naczyniowego i udaru.' },
            { ext: 'liver', label: 'Próby wątrobowe (ALAT, ASPAT, GGTP, bilirubina)', note: 'Ocena czynności wątroby przed MHT — czynna choroba wątroby jest przeciwwskazaniem do doustnej terapii estrogenowej (metabolizm wątrobowy, efekt pierwszego przejścia); przy patologii wątroby preferowana jest droga przezskórna.' },
            { ext: 'glucose_fasting', label: 'Glukoza na czczo', note: 'Element profilu metabolicznego i oceny ryzyka sercowo-naczyniowego przed MHT — wykrycie nieprawidłowej glikemii na czczo lub cukrzycy.' },
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Ocena gęstości mineralnej kości — po menopauzie spadek estrogenów przyspiesza utratę masy kostnej. U kobiet po menopauzie kryterium rozpoznania to T-score ≤ -2,5 = osteoporoza.' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — komplementarny do DXA w ocenie ryzyka osteoporozy pomenopauzalnej.' }
          ]
        }
      ],
      guideline: 'NAMS 2022 / Polskie Towarzystwo Menopauzy i Andropauzy (PTMiA)',
      sources: [
        'The 2022 Hormone Therapy Position Statement of The North American Menopause Society (NAMS). Menopause. 2022;29(7):767-794.',
        'Polskie Towarzystwo Menopauzy i Andropauzy — rekomendacje dotyczące terapii hormonalnej okresu menopauzy.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o menopauzie i terapii hormonalnej.'
      ]
    },

    ovarian_failure: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Kryteria rozpoznania ESHRE 2016',
            body: 'Przedwczesna niewydolność jajników (POI) — rozpoznanie wymaga JEDNOCZESNEGO spełnienia wszystkich trzech kryteriów wg ESHRE 2016: (1) oligo- lub amenorrhea utrzymująca się ≥ 4 miesiące; (2) FSH > 25 IU/L w dwóch pomiarach w odstępie > 4 tygodni; (3) wiek < 40 lat. U kobiety w wieku rozrodczym diagnostykę poprzedza wykluczenie ciąży (β-hCG). Próg FSH > 25 IU/L jest niższy niż dawniej stosowany > 40 IU/L — ESHRE obniżyło go, aby umożliwić wcześniejsze rozpoznanie. AMH nie jest kryterium diagnostycznym (choć niski/nieoznaczalny wspiera rozpoznanie).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Etiologia POI',
            items: [
              { label: 'Idiopatyczna', text: 'najczęstsza — etiologia pozostaje nieustalona mimo pełnej diagnostyki.' },
              {
                label: 'Genetyczne',
                text: 'aberracje chromosomu X i mutacje pojedynczych genów:',
                detail: [
                  'Zespół Turnera (45,X lub mozaicyzm) — wiodąca chromosomalna przyczyna POI; pełna postać objawia się zwykle pierwotnym brakiem miesiączki, mozaicyzm może dawać wtórny brak miesiączki.',
                  'Premutacja FMR1 (55–200 powtórzeń CGG) — najczęstsza znana pojedyncza przyczyna genetyczna POI (~13–15% przypadków rodzinnych, ~3–5% sporadycznych); nosicielki zagrożone urodzeniem dziecka z zespołem łamliwego chromosomu X.',
                  'Inne aberracje chromosomu X (delecje, translokacje X-autosomalne) oraz rzadkie mutacje pojedynczych genów (BMP15, FOXL2 — zespół BPES, GDF9, NOBOX).'
                ]
              },
              {
                label: 'Autoimmunologiczne',
                text: 'autoimmunologiczne zapalenie jajników, często w ramach autoimmunizacji wielogruczołowej:',
                detail: [
                  'Przeciwciała anty-21-hydroksylazie (CYP21A2) — autoimmunizacja kory nadnerczy dotyczy ~4% kobiet z POI; identyfikuje podgrupę zagrożoną chorobą Addisona.',
                  'Autoimmunologiczna choroba tarczycy (anty-TPO dodatnie u ~20% kobiet z POI) — najczęstsza asocjacja autoimmunologiczna POI; ESHRE zaleca przesiewowe oznaczenie.',
                  'Autoimmunologiczny zespół wielogruczołowy typu 1 (APS-1, zespół APECED) oraz typu 2 (APS-2, zespół Schmidta) — łączą POI z chorobą Addisona, AITD i innymi autoimmunizacjami.'
                ]
              },
              {
                label: 'Jatrogenne',
                text: 'ustalane z wywiadu — nie wymagają dodatkowej diagnostyki:',
                detail: [
                  'Chemioterapia (zwłaszcza alkilujące — cyklofosfamid, busulfan); ryzyko POI zależy od leku, dawki kumulacyjnej i wieku pacjentki.',
                  'Radioterapia obejmująca miednicę i podbrzusze; jajniki są bardzo wrażliwe na promieniowanie (dawka 2 Gy niszczy ~50% pęcherzyków).',
                  'Operacje jajników — resekcje, ooforektomia (jednostronna zmniejsza rezerwę, obustronna prowadzi do POI).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Konsekwencje i monitorowanie',
            items: [
              { label: 'Densytometria (DXA) wyjściowo', text: 'przewlekły hipoestrogenizm w POI prowadzi do utraty masy kostnej — ESHRE zaleca wyjściową densytometrię przy rozpoznaniu. U młodych kobiet właściwym parametrem jest Z-score (≤ -2,0 = „poniżej zakresu oczekiwanego dla wieku").' },
              { label: 'Lipidogram + glukoza na czczo', text: 'POI wiąże się z podwyższonym ryzykiem sercowo-naczyniowym (wczesna utrata ochronnego działania estrogenów) — ocena profilu metabolicznego i monitorowanie.' },
              { label: 'Witamina D (25-OH)', text: 'częsty niedobór, istotny dla zdrowia kości — komplementarny do DXA.' },
              { label: 'Substytucja hormonalna do wieku menopauzy', text: 'wg ESHRE 2016 zalecana u kobiet z POI bez przeciwwskazań — chroni przed utratą masy kostnej i powikłaniami sercowo-naczyniowymi (decyzja w ośrodku endokrynologicznym/ginekologicznym).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Rozpoznanie (potwierdzenie POI)',
          tests: [
            { ext: 'bhcg', label: 'β-hCG (test ciążowy)', note: 'Wykluczenie ciąży u kobiety w wieku rozrodczym — pierwszy krok przed dalszą diagnostyką hormonalną.', description: 'β-hCG (podjednostka β ludzkiej gonadotropiny kosmówkowej) — test ciążowy z krwi (ilościowy) lub z moczu (jakościowy). U kobiety w wieku rozrodczym ciążę należy wykluczyć przed rozpoczęciem diagnostyki niewydolności jajników — jest najczęstszą przyczyną zatrzymania miesiączki. Test z krwi (ilościowy) jest czulszy i wykrywa ciążę wcześniej niż test z moczu.' },
            { id: 'fsh', note: 'Kryterium rozpoznania POI wg ESHRE 2016: FSH > 25 IU/L w dwóch pomiarach w odstępie > 4 tygodni, przy oligo-/amenorrhei ≥ 4 mies. i wieku < 40 lat. Pomiar wykonać poza antykoncepcją hormonalną — zahamowane gonadotropiny dają niemiarodajny wynik. U kobiet miesiączkujących pobranie we wczesnej fazie folikularnej.', description: 'FSH (hormon folikulotropowy) — kluczowy parametr rozpoznania przedwczesnej niewydolności jajników. Wzrasta wskutek wygasania czynności pęcherzykowej jajników i utraty ujemnego sprzężenia zwrotnego (spadek estradiolu i inhibiny B). Kryterium rozpoznania wg ESHRE 2016: FSH > 25 IU/L w dwóch oznaczeniach wykonanych w odstępie > 4 tygodni — wymóg dwóch pomiarów wynika z dużej zmienności FSH (możliwe przejściowe wahania, a nawet okresowy powrót czynności jajników w POI). Próg > 25 IU/L jest niższy niż dawniej stosowany > 40 IU/L — ESHRE obniżyło go, aby umożliwić wcześniejsze rozpoznanie. FSH należy oznaczać poza stosowaniem antykoncepcji hormonalnej, która hamuje wydzielanie gonadotropin i czyni wynik niemiarodajnym. Rozpoznanie wymaga łącznego spełnienia kryteriów: oligo-/amenorrhea ≥ 4 miesiące, podwyższony FSH ×2 oraz wiek < 40 lat.' },
            { id: 'lh', note: 'Zwykle również podwyższony (postać hipergonadotropowa). Oznaczany razem z FSH; sam nie stanowi kryterium rozpoznania.' },
            { id: 'estradiol', note: 'Niski estradiol potwierdza hipoestrogenizm. Interpretować łącznie z FSH; nie jest samodzielnym kryterium rozpoznania.' },
            { id: 'amh', note: 'Bardzo niski lub nieoznaczalny AMH odzwierciedla wyczerpanie rezerwy jajnikowej i wspiera rozpoznanie — wg ESHRE 2016 NIE jest jednak kryterium diagnostycznym POI (rozpoznanie opiera się na FSH). Stężenie AMH nie zależy istotnie od fazy cyklu.' }
          ]
        },
        { name: 'Etiologia POI',
          tests: [
            EXT.karyotype,
            EXT.fmr1,
            { ext: 'anti_21oh', label: 'Przeciwciała anty-21-hydroksylazie', note: 'Marker autoimmunizacji nadnerczowej — autoimmunologiczne zapalenie jajników (autoimmunologiczne POI) często współwystępuje z autoimmunizacją kory nadnerczy / autoimmunologicznym zespołem wielogruczołowym. Dodatni wynik → ocena czynności nadnerczy, czujność w kierunku choroby Addisona.', description: 'Przeciwciała przeciwko 21-hydroksylazie nadnerczowej (CYP21A2) — w diagnostyce POI służą wykryciu autoimmunologicznego tła niewydolności jajników. Autoimmunologiczne zapalenie jajników jest rozpoznawalną, choć stosunkowo rzadką przyczyną POI — większość przypadków POI pozostaje idiopatyczna. Autoimmunizacja kory nadnerczy wykrywana przeciwciałami anty-21-OH dotyczy tylko niewielkiego odsetka (~4%) kobiet z POI; przeciwciała te są jednak istotne klinicznie, ponieważ identyfikują podgrupę zagrożoną chorobą Addisona (autoimmunologiczny zespół wielogruczołowy typu 1 i 2). Dodatni wynik wskazuje na potrzebę oceny czynności nadnerczy. Norma laboratoryjna zwykle < 1 IU/mL (zależy od metody).' },
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO', note: 'Autoimmunizacja tarczycy jest najczęstszą asocjacją autoimmunologiczną POI (~20% kobiet z POI) — ESHRE zaleca przesiewowe oznaczenie przeciwciał anty-TPO.' },
            { id: 'tsh', note: 'Oznaczany łącznie z przeciwciałami anty-TPO — wykrycie współistniejącej dysfunkcji tarczycy (autoimmunizacja tarczycy częsta w POI).' },
            { id: 'ft4', note: 'Łącznie z TSH — ocena czynności tarczycy przy podejrzeniu współistniejącej tyreopatii.' }
          ]
        },
        { name: 'Konsekwencje i monitorowanie',
          tests: [
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Przewlekły hipoestrogenizm w POI prowadzi do utraty masy kostnej — ESHRE zaleca wyjściową densytometrię przy rozpoznaniu. U młodych kobiet właściwym parametrem jest Z-score (≤ -2,0 = „poniżej zakresu oczekiwanego dla wieku").' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — komplementarny do DXA w ocenie ryzyka osteoporozy.' },
            { ext: 'lipid_panel', label: 'Lipidogram (TC, LDL, HDL, TG)', note: 'POI wiąże się z podwyższonym ryzykiem sercowo-naczyniowym (wczesna utrata ochronnego działania estrogenów) — lipidogram jest elementem oceny i monitorowania tego ryzyka.' },
            { ext: 'glucose_fasting', label: 'Glukoza na czczo', note: 'Element profilu metabolicznego i oceny ryzyka sercowo-naczyniowego w POI — wykrycie nieprawidłowej glikemii na czczo lub cukrzycy.' }
          ]
        }
      ],
      guideline: 'ESHRE POI 2016 (Webber i wsp.) / PTGiP',
      sources: [
        'Webber L, Davies M, Anderson R, et al. ESHRE Guideline: management of women with premature ovarian insufficiency. Hum Reprod. 2016;31(5):926-937.',
        'Polskie Towarzystwo Ginekologów i Położników — rekomendacje dotyczące diagnostyki i postępowania w przedwczesnej niewydolności jajników.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o niewydolności jajników.'
      ]
    },

    klinefelter: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Zespół Klinefeltera (kariotyp 47,XXY lub mozaicyzm 47,XXY/46,XY) — najczęstsza aberracja chromosomów płciowych u mężczyzn i najczęstsza przyczyna pierwotnego (hipergonadotropowego) hipogonadyzmu męskiego. Złotym standardem rozpoznania jest kariotyp z hodowli limfocytów krwi obwodowej.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Typowy obraz hormonalny i kliniczny',
            items: [
              { label: 'LH i FSH znacznie podwyższone', text: 'obraz hipogonadyzmu hipergonadotropowego (pierwotna niewydolność jąder); FSH zwykle wyższy niż LH — odzwierciedla większe uszkodzenie kanalików plemnikotwórczych niż komórek Leydiga.' },
              { label: 'Testosteron niski lub w dolnej granicy normy', text: 'częsta jest postać „skompensowana" — testosteron prawie prawidłowy przy podwyższonym LH; z wiekiem testosteron stopniowo spada (konieczne okresowe monitorowanie).' },
              { label: 'Estradiol względnie podwyższony', text: 'zaburzony stosunek estrogeny/androgeny — współuczestniczy w rozwoju ginekomastii, częstej w zespole Klinefeltera.' },
              { label: 'Inhibina B i AMH niskie', text: 'odzwierciedlają dysfunkcję komórek Sertoliego i uszkodzenie nabłonka plemnikotwórczego; w spermiogramie typowa azoospermia nieobstrukcyjna.' },
              { label: 'Małe, twarde jądra (< 6 mL)', text: 'objaw kliniczny wynikający z zaniku kanalików plemnikotwórczych; eunuchoidalna budowa ciała i ginekomastia.' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Powikłania ogólnoustrojowe — monitorowanie',
            items: [
              { label: 'Osteoporoza', text: 'DXA + witamina D — hipogonadyzm prowadzi do obniżenia gęstości mineralnej kości; kryterium rozpoznania u dorosłych mężczyzn to T-score ≤ -2,5.' },
              { label: 'Zespół metaboliczny i cukrzyca typu 2', text: 'HbA1c, lipidogram — zespół Klinefeltera silnie wiąże się z insulinoopornością, zespołem metabolicznym, cukrzycą typu 2 i dyslipidemią.' },
              { label: 'Stłuszczeniowa choroba wątroby (MASLD)', text: 'próby wątrobowe (ALAT, ASPAT, GGTP) — częsta jako składowa zespołu metabolicznego.' },
              { label: 'Ginekomastia', text: 'związana ze zwiększonym ryzykiem raka piersi (~20–50× wyższe niż w populacji ogólnej) — wymaga klinicznego monitorowania.' },
              { label: 'Płodność — mikro-TESE', text: 'mimo azoospermii u części pacjentów udaje się uzyskać plemniki metodą mikrochirurgicznego pobrania z jądra (mikro-TESE) do procedur rozrodu wspomaganego; kwalifikację prowadzi ośrodek andrologiczny/leczenia niepłodności. Żaden parametr hormonalny nie pozwala wiarygodnie przewidzieć powodzenia mikro-TESE.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie rozpoznania',
          tests: [
            EXT.karyotype
          ]
        },
        { name: 'Ocena hormonalna (hipogonadyzm hipergonadotropowy)',
          tests: [
            { id: 'testosterone_total', note: 'W zespole Klinefeltera często niski lub w dolnej granicy normy. Częsta jest postać „skompensowana" — testosteron prawie prawidłowy przy podwyższonym LH; z wiekiem testosteron stopniowo spada. Pobranie rano, na czczo.', description: 'Testosteron całkowity w zespole Klinefeltera — odzwierciedla niewydolność komórek Leydiga. U części pacjentów testosteron jest wyraźnie obniżony, u części pozostaje w dolnej granicy normy mimo znacznie podwyższonego LH („hipogonadyzm skompensowany"). Z wiekiem rezerwa komórek Leydiga się wyczerpuje i testosteron stopniowo spada — dlatego konieczne jest okresowe monitorowanie. Pobranie rano (7:00–11:00), na czczo; przy wartościach granicznych ocenić testosteron wolny (z SHBG). Decyzję o testosteronoterapii podejmuje się na podstawie testosteronu i objawów klinicznych hipogonadyzmu.' },
            { id: 'shbg', note: 'Niezbędna do obliczenia testosteronu wolnego/biodostępnego, gdy testosteron całkowity jest graniczny.' },
            { id: 'testosterone_free', note: 'Oznaczać (lub obliczać wzorem Vermeulena) gdy testosteron całkowity jest w strefie granicznej — pomaga rozpoznać hipogonadyzm mimo prawie prawidłowego testosteronu całkowitego.' },
            { id: 'lh', note: 'Znacznie podwyższony — obraz hipogonadyzmu hipergonadotropowego (pierwotna niewydolność jąder).' },
            { id: 'fsh', note: 'Znacznie podwyższony, zwykle wyższy niż LH — odzwierciedla większe uszkodzenie kanalików plemnikotwórczych i komórek Sertoliego niż komórek Leydiga.' },
            { id: 'estradiol', note: 'Względnie podwyższony (zaburzony stosunek estrogeny/androgeny) — współuczestniczy w rozwoju ginekomastii, częstej w zespole Klinefeltera.' }
          ]
        },
        { name: 'Czynność jąder i płodność',
          tests: [
            { id: 'inhibin_b', note: 'Niska lub nieoznaczalna — marker dysfunkcji komórek Sertoliego i uszkodzenia nabłonka plemnikotwórczego.' },
            { id: 'amh', note: 'Niski — odzwierciedla dysfunkcję komórek Sertoliego. Uwaga: żaden parametr hormonalny (w tym AMH, inhibina B, FSH) nie pozwala wiarygodnie przewidzieć powodzenia mikro-TESE u pacjentów z zespołem Klinefeltera.' },
            { ext: 'semen_analysis', label: 'Spermiogram (badanie nasienia)', note: 'W zespole Klinefeltera typowa jest azoospermia nieobstrukcyjna. Mimo to u części pacjentów udaje się uzyskać plemniki metodą mikro-TESE (mikrochirurgiczne pobranie z jądra) do procedur rozrodu wspomaganego — kwalifikację prowadzi ośrodek andrologiczny / leczenia niepłodności.' }
          ]
        },
        { name: 'Powikłania i monitorowanie',
          tests: [
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Hipogonadyzm w zespole Klinefeltera prowadzi do obniżenia gęstości mineralnej kości i osteoporozy. U dorosłych mężczyzn kryterium rozpoznania to T-score ≤ -2,5.' },
            { id: 'vit_d_25oh', note: 'Częsty niedobór; istotny dla zdrowia kości — komplementarny do DXA w ocenie ryzyka osteoporozy.' },
            { ext: 'hba1c', label: 'HbA1c (hemoglobina glikowana)', note: 'Zespół Klinefeltera silnie wiąże się z insulinoopornością, zespołem metabolicznym i cukrzycą typu 2 — HbA1c służy przesiewowi i monitorowaniu gospodarki węglowodanowej.' },
            { ext: 'lipid_panel', label: 'Lipidogram (TC, LDL, HDL, TG)', note: 'Dyslipidemia jest częsta w zespole Klinefeltera (składowa zespołu metabolicznego) — element oceny ryzyka sercowo-naczyniowego.' },
            { ext: 'liver', label: 'Próby wątrobowe (ALAT, ASPAT, GGTP, bilirubina)', note: 'Ocena w kierunku stłuszczeniowej choroby wątroby związanej z zaburzeniami metabolicznymi, częstej w zespole Klinefeltera w przebiegu zespołu metabolicznego.' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Bhasin i wsp.) / EAA 2021 (Zitzmann i wsp.)',
      sources: [
        'Zitzmann M, Aksglaede L, Corona G, et al. European Academy of Andrology guidelines on Klinefelter Syndrome. Andrology. 2021;9(1):145-167.',
        'Bhasin S, Brito JP, Cunningham GR, et al. Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(5):1715-1744.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o hipogonadyzmie męskim i zespole Klinefeltera.'
      ]
    },

    infertility: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Niepłodność pary — brak ciąży po 12 miesiącach regularnego współżycia bez antykoncepcji (lub po 6 miesiącach, gdy kobieta ma ≥ 35 lat). Diagnostykę prowadzi się RÓWNOLEGLE u obojga partnerów. U kobiety ocenia się oś podwzgórze-przysadka-jajnik, czynność tarczycy, owulację, rezerwę jajnikową oraz anatomię narządu rodnego (w tym drożność jajowodów). U mężczyzny podstawą jest spermiogram wg WHO 2021.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka kobiety',
            items: [
              {
                label: 'Panel hormonalny + ocena owulacji',
                text: 'kluczowe znaczenie ma czas pobrania w cyklu:',
                detail: [
                  'FSH + LH + estradiol — pobranie w 3. dniu cyklu (wczesna faza folikularna); podwyższony stosunek LH/FSH może sugerować PCOS.',
                  'Progesteron w środku fazy lutealnej (~7 dni przed spodziewaną miesiączką, klasycznie „21. dzień" przy cyklu 28-dniowym) — podwyższony progesteron potwierdza owulację.',
                  'TSH — wykluczenie dysfunkcji tarczycy (zaburza owulację, zagnieżdżenie i przebieg wczesnej ciąży).',
                  'Prolaktyna — hiperprolaktynemia hamuje pulsacyjne wydzielanie GnRH i prowadzi do braku owulacji.',
                  'Warunkowo przy cechach hiperandrogenizmu: 17-OH-progesteron (wykluczenie NCAH), testosteron całkowity, SHBG, DHEA-S.'
                ]
              },
              {
                label: 'Rezerwa jajnikowa',
                text: 'pełna ocena w osobnym wskazaniu „Rezerwa jajnikowa (IVF)":',
                detail: [
                  'AMH — stabilny w trakcie cyklu; oznaczanie w dowolnym dniu.',
                  'AFC (liczba pęcherzyków antralnych) w USG przezpochwowym we wczesnej fazie folikularnej — równorzędna z AMH.',
                  'WAŻNE: AMH/AFC przewidują liczbę uzyskanych oocytów przy stymulacji — NIE jakość, NIE szansę żywego urodzenia, NIE szansę na ciążę spontaniczną.'
                ]
              },
              {
                label: 'Anatomia narządu rodnego',
                text: 'ocena czynnika macicznego i jajowodowego:',
                detail: [
                  'USG przezpochwowe — macica (wady wrodzone, mięśniaki, polipy), jajniki, endometrium.',
                  'HSG (histerosalpingografia) lub HyCoSy/SIS (sonohisterosalpingografia) — ocena drożności jajowodów i jamy macicy; wykonywana we wczesnej fazie folikularnej po wykluczeniu ciąży i czynnego zakażenia.',
                  'Laparoskopia z próbą drożności (chromopertubacja) — gdy podejrzewa się patologię miednicy mniejszej lub endometriozę.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka mężczyzny',
            items: [
              {
                label: 'Spermiogram WHO 2021 — podstawa',
                text: 'oceniany wg 6. edycji podręcznika WHO:',
                detail: [
                  'Materiał pobrany po 2–7 dniach abstynencji płciowej.',
                  'Orientacyjne dolne wartości referencyjne WHO 2021 (5. percentyl): objętość ≥ 1,4 mL; koncentracja ≥ 16 mln/mL; liczba całkowita ≥ 39 mln; ruchliwość całkowita ≥ 42%; ruchliwość postępowa ≥ 30%; morfologia prawidłowa ≥ 4%; żywotność ≥ 54%.',
                  'Ze względu na dużą zmienność biologiczną nieprawidłowy wynik wymaga POTWIERDZENIA w powtórnym badaniu (zwykle po 4–12 tygodniach).',
                  'Azoospermia (brak plemników) wymaga różnicowania na obstrukcyjną i nieobstrukcyjną — rozszerzenie diagnostyki o panel hormonalny i badania genetyczne.'
                ]
              },
              {
                label: 'Panel hormonalny — przy nieprawidłowym spermiogramie',
                text: 'różnicuje hipogonadyzm pierwotny od wtórnego:',
                detail: [
                  'Testosteron całkowity (rano, na czczo) + LH + FSH — wzorzec różnicuje pierwotny (↑LH/FSH) od wtórnego (↓/prawidłowy LH/FSH) hipogonadyzm.',
                  'Prolaktyna — wykluczenie hiperprolaktynemii (hipogonadyzm wtórny, zaburzenia funkcji seksualnych).',
                  'Inhibina B — marker czynności komórek Sertoliego i spermatogenezy; komplementarny do FSH.'
                ]
              },
              {
                label: 'USG jąder',
                text: 'element standardowej diagnostyki niepłodności męskiej wg EAU:',
                detail: [
                  'Objętość i echostruktura jąder — zmniejszona objętość sugeruje upośledzoną spermatogenezę.',
                  'Żylaki powrózka nasiennego (varicocele) — częsta, potencjalnie odwracalna przyczyna; w USG poszerzone naczynia splotu wiciowatego z refluksem w próbie Valsalvy.',
                  'Zmiany ogniskowe — niepłodni mężczyźni mają zwiększone ryzyko raka jądra; każdy guzek wymaga pilnej diagnostyki onkologicznej.',
                  'Cechy obstrukcji — poszerzenie sieci jądra, torbiele lub poszerzenie najądrza.'
                ]
              },
              {
                label: 'Diagnostyka genetyczna — przy azoospermii lub ciężkiej oligospermii',
                text: 'wskazana zwłaszcza przy postaci nieobstrukcyjnej:',
                detail: [
                  'Kariotyp — wykrycie zespołu Klinefeltera (47,XXY), translokacji i innych aberracji.',
                  'Mikrodelecje AZF chromosomu Y (AZFa/AZFb/AZFc) — częsta genetyczna przyczyna zaburzeń spermatogenezy; wynik wpływa na rokowanie pobrania plemników (mikro-TESE) i jest przekazywany potomstwu płci męskiej.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Kryteria czasowe rozpoczęcia diagnostyki',
            items: [
              { label: 'Po 12 miesiącach', text: 'regularnego współżycia bez antykoncepcji u par, w których kobieta ma < 35 lat.' },
              { label: 'Po 6 miesiącach', text: 'gdy kobieta ma ≥ 35 lat (spadek rezerwy jajnikowej z wiekiem — szybsze włączenie diagnostyki).' },
              { label: 'Bez zwłoki — przy znanych czynnikach ryzyka', text: 'operacje miednicy/jąder w wywiadzie, chemio-/radioterapia, znacznie nieregularne cykle lub brak miesiączki, anomalie anatomiczne, znana endometrioza, choroby endokrynologiczne wpływające na płodność.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Kobieta — panel hormonalny i ocena owulacji',
          tests: [
            { id: 'fsh', note: 'Pobranie w 3. dniu cyklu (wczesna faza folikularna). Podwyższony FSH wskazuje na obniżoną rezerwę jajnikową; interpretować łącznie z estradiolem i AMH.' },
            { id: 'lh', note: 'Pobranie w 3. dniu cyklu, łącznie z FSH. Podwyższony stosunek LH/FSH może sugerować PCOS.' },
            { id: 'estradiol', note: 'Pobranie w 3. dniu cyklu. Podwyższony estradiol we wczesnej fazie folikularnej może maskować podwyższony FSH i fałszywie zawyżać ocenę rezerwy jajnikowej.' },
            { id: 'progesterone', note: 'Pobranie w środku fazy lutealnej — ok. 7 dni przed spodziewaną miesiączką (klasycznie „21. dzień" przy cyklu 28-dniowym). Podwyższony progesteron potwierdza owulację.' },
            { id: 'tsh', note: 'Dysfunkcja tarczycy (zarówno nad-, jak i niedoczynność) zaburza owulację i płodność — wykluczenie jako odwracalna przyczyna.' },
            { id: 'prolactin', note: 'Hiperprolaktynemia hamuje pulsacyjne wydzielanie GnRH i prowadzi do braku owulacji — częsta odwracalna przyczyna niepłodności kobiecej.' },
            { id: 'oh17_progesterone', note: 'Warunkowo — wykluczenie nieklasycznego wrodzonego przerostu nadnerczy (NC-CAH) przy cechach hiperandrogenizmu. Pobranie rano, we wczesnej fazie folikularnej.' },
            { id: 'testosterone_total', note: 'Warunkowo — przy klinicznych cechach hiperandrogenizmu lub podejrzeniu PCOS. Znacznie podwyższony → poszukiwanie guza produkującego androgeny.' }
          ]
        },
        { name: 'Kobieta — rezerwa jajnikowa i ocena anatomiczna',
          tests: [
            { id: 'amh', note: 'Marker rezerwy jajnikowej — stabilny w trakcie cyklu. Niski AMH wskazuje na obniżoną rezerwę; nie jest natomiast wskaźnikiem szans na spontaniczną ciążę.' },
            { ext: 'afc', label: 'AFC (liczba pęcherzyków antralnych, USG TV)', note: 'Liczba pęcherzyków antralnych w USG przezpochwowym — ocena rezerwy jajnikowej komplementarna do AMH; przydatna przy planowaniu stymulacji jajeczkowania.' },
            { ext: 'chorionic_us', label: 'USG narządów rodnych', note: 'USG przezpochwowe — ocena macicy (wady wrodzone, mięśniaki, polipy), jajników i endometrium. Element podstawowej diagnostyki niepłodności kobiecej.' },
            { ext: 'hsg', label: 'HSG (histerosalpingografia)', note: 'Ocena drożności jajowodów i jamy macicy — kluczowa w diagnostyce niepłodności kobiecej (czynnik jajowodowy). Alternatywą jest sonohisterosalpingografia (HyCoSy/SIS).', description: 'Histerosalpingografia (HSG) — badanie radiologiczne z podaniem środka kontrastowego przez kanał szyjki macicy, oceniające jamę macicy i drożność jajowodów. Wskazanie: ocena czynnika jajowodowego i macicznego niepłodności (niedrożność jajowodów, zrosty, wady macicy, polipy, mięśniaki podśluzówkowe). Wykonywana we wczesnej fazie folikularnej (po miesiączce, przed owulacją), po wykluczeniu ciąży i czynnego zakażenia narządu rodnego. Alternatywy: sonohisterosalpingografia (HyCoSy/SIS) — bez promieniowania jonizującego; laparoskopia z próbą drożności (chromopertubacja) — gdy podejrzewa się patologię miednicy mniejszej lub endometriozę.' }
          ]
        },
        { name: 'Mężczyzna — spermiogram i ocena hormonalna',
          tests: [
            { ext: 'semen_analysis', label: 'Spermiogram (badanie nasienia)', note: 'Podstawowe badanie w diagnostyce niepłodności męskiej, oceniane wg norm WHO 2021. Nieprawidłowy wynik należy potwierdzić powtórnym badaniem (zwykle po 4–12 tygodniach) i rozszerzyć diagnostykę o panel hormonalny.', description: 'Spermiogram (badanie nasienia) — podstawowe badanie diagnostyki niepłodności męskiej, oceniane wg 6. edycji podręcznika WHO (2021). Materiał pobiera się po 2–7 dniach abstynencji płciowej. Orientacyjne dolne wartości referencyjne WHO 2021 (5. percentyl): objętość ≥ 1,4 mL, koncentracja ≥ 16 mln/mL, liczba całkowita ≥ 39 mln, ruchliwość całkowita ≥ 42%, ruchliwość postępowa ≥ 30%, morfologia prawidłowa ≥ 4%, żywotność ≥ 54%. Ze względu na dużą zmienność biologiczną nieprawidłowy wynik wymaga potwierdzenia w powtórnym badaniu (zwykle po 4–12 tygodniach). Azoospermia (brak plemników) wymaga różnicowania na obstrukcyjną i nieobstrukcyjną oraz rozszerzenia diagnostyki o panel hormonalny i badania genetyczne.' },
            { id: 'testosterone_total', note: 'Element panelu hormonalnego przy nieprawidłowym spermiogramie. Pobranie rano, na czczo. Niski testosteron + ↑LH/FSH → hipogonadyzm pierwotny; niski testosteron + ↓/prawidłowe LH/FSH → hipogonadyzm wtórny.' },
            { id: 'lh', note: 'Oznaczany łącznie z FSH i testosteronem. Różnicuje hipogonadyzm pierwotny (↑LH) od wtórnego (↓/prawidłowy LH).' },
            { id: 'fsh', note: 'Podwyższony FSH wskazuje na uszkodzenie nabłonka plemnikotwórczego (m.in. zespół Klinefeltera, stan po zapaleniu jąder, postać idiopatyczna). Prawidłowy FSH przy azoospermii sugeruje raczej przyczynę obstrukcyjną, nie wyklucza jednak postaci nieobstrukcyjnej — zwłaszcza zatrzymania dojrzewania plemników (maturation arrest), w którym FSH bywa prawidłowy.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — może powodować hipogonadyzm wtórny i zaburzać spermatogenezę oraz funkcje seksualne.' },
            { id: 'inhibin_b', note: 'Marker czynności komórek Sertoliego i spermatogenezy — niski/nieoznaczalny wskazuje na uszkodzenie nabłonka plemnikotwórczego. Komplementarny do FSH.' },
            { ext: 'testicular_us', label: 'USG jąder', note: 'Element standardowej diagnostyki niepłodności męskiej (wytyczne EAU) — ocena objętości i echostruktury jąder, wykrycie żylaków powrózka nasiennego, zmian ogniskowych oraz cech sugerujących obstrukcję.', description: 'USG jąder (mosznowe) — element standardowej diagnostyki niepłodności męskiej wg wytycznych EAU. Ocena: objętości jąder (zmniejszona objętość sugeruje upośledzoną spermatogenezę), echostruktury miąższu, obecności żylaków powrózka nasiennego (varicocele — częsta, potencjalnie odwracalna przyczyna niepłodności męskiej; w USG poszerzone naczynia splotu wiciowatego z refluksem w próbie Valsalvy), zmian ogniskowych jąder (każdy guzek wymaga pilnej diagnostyki onkologicznej — niepłodni mężczyźni mają zwiększone ryzyko raka jądra) oraz cech sugerujących obstrukcję (poszerzenie sieci jądra, torbiele lub poszerzenie najądrza). Badanie uzupełnia spermiogram i panel hormonalny.' }
          ]
        },
        { name: 'Mężczyzna — diagnostyka genetyczna (przy azoospermii / ciężkiej oligospermii)',
          tests: [
            EXT.karyotype,
            { ext: 'yq_microdel', label: 'Mikrodelecje AZF chromosomu Y', note: 'Wskazane przy azoospermii nieobstrukcyjnej lub ciężkiej oligospermii — mikrodelecje regionów AZFa/AZFb/AZFc chromosomu Y są częstą genetyczną przyczyną zaburzeń spermatogenezy. Wynik wpływa na rokowanie pobrania plemników i jest przekazywany potomstwu płci męskiej.' },
            { ext: 'cftr_gen', label: 'Mutacje CFTR', note: 'Wskazane przy azoospermii obstrukcyjnej, zwłaszcza przy wrodzonym obustronnym braku nasieniowodów (CBAVD) — mutacje genu CFTR. Przed leczeniem niepłodności wskazane badanie nosicielstwa również u partnerki (ryzyko mukowiscydozy u potomstwa).' }
          ]
        }
      ],
      guideline: 'ESHRE / PTMRiE (Polskie Towarzystwo Medycyny Rozrodu i Embriologii)',
      sources: [
        'ESHRE Guideline Group on Unexplained Infertility. Evidence-based guideline: unexplained infertility. Hum Reprod Open. 2023.',
        'WHO laboratory manual for the examination and processing of human semen, 6th edition. World Health Organization, 2021.',
        'Polskie Towarzystwo Medycyny Rozrodu i Embriologii (PTMRiE) — rekomendacje dotyczące diagnostyki i leczenia niepłodności.'
      ]
    },

    ivf_reserve: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kluczowy niuans interpretacyjny',
            body: 'Ocena rezerwy jajnikowej — najczęściej w kontekście kwalifikacji i planowania leczenia metodą rozrodu wspomaganego (IVF). KLUCZOWE: AMH i AFC przewidują przede wszystkim ODPOWIEDŹ jajników na stymulację (liczbę uzyskanych komórek jajowych) — a NIE jakość oocytów, NIE szansę żywego urodzenia ani szansę na ciążę spontaniczną. Głównym determinantem jakości oocytów i szansy żywego urodzenia pozostaje WIEK kobiety. Markery rezerwy nie powinny służyć do odmawiania leczenia.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Markery rezerwy jajnikowej — hierarchia',
            items: [
              {
                label: 'AMH — najbardziej wiarygodny marker z krwi',
                text: 'oznaczany w dowolnym dniu cyklu:',
                detail: [
                  'Produkowany przez komórki ziarniste małych pęcherzyków preantralnych i antralnych — odzwierciedla ILOŚCIOWĄ rezerwę jajnikową.',
                  'Zalety: stabilność w trakcie cyklu (oznaczanie w dowolnym dniu), wczesny spadek z wiekiem (wyprzedza FSH).',
                  'Zastosowanie: przewidywanie odpowiedzi na stymulację gonadotropinami, identyfikacja słabych i nadmiernych odpowiedzi (ryzyko OHSS), indywidualizacja dawki.',
                  'Ograniczenia: różnice wyników między metodami oznaczania; stężenie OBNIŻONE u kobiet stosujących antykoncepcję hormonalną (interpretować po jej odstawieniu).'
                ]
              },
              {
                label: 'AFC (liczba pęcherzyków antralnych) — marker obrazowy',
                text: 'USG przezpochwowe we wczesnej fazie folikularnej:',
                detail: [
                  'Liczba pęcherzyków antralnych (2–10 mm) w obu jajnikach, oceniana w USG TV.',
                  'Marker rezerwy RÓWNORZĘDNY z AMH i wzajemnie z nim komplementarny.',
                  'Szczególnie przydatny przy planowaniu protokołu stymulacji jajeczkowania.'
                ]
              },
              {
                label: 'FSH + estradiol w 3. dniu cyklu — markery starsze',
                text: 'mają charakter UZUPEŁNIAJĄCY, nie zastępują AMH/AFC:',
                detail: [
                  'Duża zmienność międzycykliczna i mniejsza czułość niż AMH/AFC.',
                  'Podwyższony FSH (> ~10 IU/L) sugeruje obniżoną rezerwę; prawidłowy FSH NIE wyklucza obniżonej rezerwy.',
                  'PUŁAPKA: podwyższony estradiol we wczesnej fazie folikularnej może hamować FSH (fałszywie prawidłowy wynik) i ZAWYŻAĆ ocenę rezerwy — interpretować ZAWSZE łącznie.'
                ]
              },
              { label: 'Inhibina B — niezalecana rutynowo', text: 'ASRM/ESHRE NIE zalecają inhibiny B jako rutynowego testu rezerwy jajnikowej — ze względu na dużą zmienność i słabą wartość predykcyjną została zastąpiona przez AMH i AFC. Oznaczać tylko w wybranych sytuacjach.' },
              { label: 'TSH + prolaktyna — przygotowanie do leczenia', text: 'wykluczenie dysfunkcji tarczycy i hiperprolaktynemii przed leczeniem rozrodu (odwracalne przyczyny zaburzeń owulacji).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Markery rezerwy jajnikowej',
          tests: [
            { id: 'amh', note: 'Najbardziej wiarygodny marker rezerwy jajnikowej oznaczany z krwi (obok AFC jako badania obrazowego) — stabilny w trakcie cyklu, można oznaczać w dowolnym dniu. Niski AMH wskazuje na obniżoną rezerwę i przewiduje słabszą odpowiedź na stymulację; nie przesądza o jakości oocytów ani o szansie na ciążę.', description: 'AMH (hormon antymüllerowski) — produkowany przez komórki ziarniste małych pęcherzyków preantralnych i antralnych; jego stężenie odzwierciedla pulę pęcherzyków, czyli ilościową rezerwę jajnikową. Zalety: względna stabilność w trakcie cyklu (oznaczanie w dowolnym dniu), wczesny spadek z wiekiem. Zastosowanie: przewidywanie odpowiedzi jajników na stymulację gonadotropinami (identyfikacja słabych i nadmiernych odpowiedzi — ryzyko zespołu hiperstymulacji), indywidualizacja dawki, poradnictwo. Ograniczenia: AMH przewiduje LICZBĘ uzyskanych oocytów, ale NIE ich jakość, NIE szansę żywego urodzenia i NIE szansę na ciążę spontaniczną — nie należy go używać do odmawiania leczenia ani jako samodzielnego testu „płodności". Wyniki mogą się różnić między metodami oznaczania; stężenie jest obniżone u kobiet stosujących antykoncepcję hormonalną.' },
            { ext: 'afc', label: 'AFC (liczba pęcherzyków antralnych, USG TV)', note: 'Liczba pęcherzyków antralnych (2–10 mm) w obu jajnikach, oceniana w USG przezpochwowym we wczesnej fazie folikularnej — marker rezerwy równorzędny z AMH i wzajemnie z nim komplementarny; przydatny przy planowaniu protokołu stymulacji.' },
            { id: 'fsh', note: 'Pobranie w 3. dniu cyklu, łącznie z estradiolem. Marker starszy niż AMH/AFC — o dużej zmienności międzycyklicznej i mniejszej czułości; podwyższony FSH wskazuje na obniżoną rezerwę, ale prawidłowy nie wyklucza jej obniżenia.' },
            { id: 'estradiol', note: 'Pobranie w 3. dniu cyklu — interpretować ZAWSZE łącznie z FSH. Podwyższony estradiol we wczesnej fazie folikularnej może hamować FSH (fałszywie prawidłowy wynik) i zawyżać ocenę rezerwy.' }
          ]
        },
        { name: 'Badania uzupełniające (przygotowanie do leczenia)',
          tests: [
            { id: 'lh', note: 'Pobranie w 3. dniu cyklu — element podstawowego panelu hormonalnego. Podwyższony stosunek LH/FSH może sugerować PCOS (częsta przyczyna zaburzeń owulacji i nadmiernej odpowiedzi na stymulację).' },
            { id: 'inhibin_b', note: 'Marker czynności komórek ziarnistych. Współczesne wytyczne (ASRM, ESHRE) NIE zalecają inhibiny B jako testu rezerwy jajnikowej — ze względu na dużą zmienność i słabą wartość predykcyjną została zastąpiona przez AMH i AFC. Oznaczać tylko w wybranych sytuacjach.' },
            { id: 'tsh', note: 'Wykluczenie dysfunkcji tarczycy przed leczeniem rozrodu — zaburza owulację, zagnieżdżenie i przebieg wczesnej ciąży.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — odwracalna przyczyna zaburzeń owulacji.' }
          ]
        }
      ],
      guideline: 'ASRM (testowanie rezerwy jajnikowej) / ESHRE (stymulacja jajeczkowania) / PTMRiE',
      sources: [
        'Practice Committee of the American Society for Reproductive Medicine. Testing and interpretation of measures of ovarian reserve: a committee opinion. Fertil Steril. 2020.',
        'ESHRE Working Group on Ovarian Stimulation. Ovarian stimulation for IVF/ICSI: ESHRE guideline. Hum Reprod Open. 2020.',
        'Polskie Towarzystwo Medycyny Rozrodu i Embriologii (PTMRiE) — rekomendacje dotyczące diagnostyki i leczenia niepłodności.'
      ]
    },

    hyperprolactinemia: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Hiperprolaktynemia — podwyższone stężenie prolaktyny w surowicy. Pojedynczy pomiar przy prawidłowym pobraniu (rano, w spoczynku, bez nadmiernego stresu venepunkcji, bez wcześniejszej stymulacji piersi) zwykle wystarcza do rozpoznania; przy wartościach granicznych lub podejrzeniu wpływu stresu — pomiar należy powtórzyć.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Główne grupy przyczyn',
            items: [
              { label: 'Fizjologiczne', text: 'ciąża, laktacja, stres, intensywny wysiłek fizyczny, stymulacja piersi.' },
              {
                label: 'Farmakologiczne (szczegółowy wywiad lekowy!)',
                text: 'liczne leki blokujące dopaminę lub działające na oś przysadkową:',
                detail: [
                  'Neuroleptyki klasyczne i atypowe (rysperydon i amisulpiryd dają najwyższe wzrosty PRL; olanzapina, kwetiapina — umiarkowane).',
                  'Leki przeciwwymiotne i prokinetyczne: metoklopramid, domperydon.',
                  'Leki przeciwdepresyjne: SSRI, klomipramina, MAO-I.',
                  'Antagoniści kanału wapniowego: werapamil.',
                  'Estrogeny (doustna antykoncepcja, HTZ).',
                  'Opioidy.',
                  'Inne: cymetydyna, metyldopa, rezerpina.'
                ]
              },
              {
                label: 'Patologiczne',
                text: 'choroby narządowe i guzy okolicy podwzgórzowo-przysadkowej:',
                detail: [
                  'Prolactinoma (mikro- lub makrogruczolak przysadki) — najczęstsza patologiczna przyczyna.',
                  'Inne guzy okolicy podwzgórzowo-przysadkowej (czaszkogardlak, gruczolaki nieczynne, meningioma) — efekt przerwania szypuły przysadki (utrata dopaminergicznego hamowania).',
                  'Pierwotna niedoczynność tarczycy (podwyższone TRH stymuluje wydzielanie PRL).',
                  'Przewlekła choroba nerek (upośledzony klirens nerkowy prolaktyny).',
                  'Makroprolaktynemia — biologicznie nieaktywny kompleks PRL-IgG dający fałszywie podwyższony wynik (pseudohiperprolaktynemia).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny',
            items: [
              '(1) Potwierdzenie pomiaru + wykluczenie częstych przyczyn (ciąża, leki, niedoczynność tarczycy, niewydolność nerek, makroprolaktyna).',
              '(2) MRI przysadki — gdy hiperprolaktynemia niejasnego pochodzenia (po wykluczeniu przyczyn wtórnych).',
              '(3) Ocena funkcji przysadki — przy makrogruczolaku (osie: tarczycowa, somatotropowa, nadnerczowa, gonadalna).',
              '(4) Pułapki interpretacyjne — m.in. efekt haka (hook effect) przy dużych makroprolactinoma.'
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Korelacja stężenia PRL z przyczyną',
            items: [
              { label: 'PRL > 500 ng/mL', text: 'diagnostyczne dla makroprolactinoma.' },
              { label: 'PRL 250–500 ng/mL', text: 'zwykle wskazuje na prolactinoma (mikro lub makro).' },
              { label: 'PRL 100–250 ng/mL', text: 'możliwe prolactinoma, ale też leki lub inne przyczyny.' },
              { label: 'PRL 25–100 ng/mL', text: 'częściej efekt przerwania szypuły, leki, mikroprolactinoma lub hiperprolaktynemia idiopatyczna.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie i wykluczenie częstych przyczyn',
          tests: [
            { id: 'prolactin', note: 'Pojedynczy pomiar przy prawidłowym pobraniu wystarcza (rano, bez nadmiernego stresu venepunkcji, bez wcześniejszej stymulacji piersi). Przy wartościach granicznych lub podejrzeniu wpływu stresu — powtórzyć.', description: 'Prolaktyna — podstawowy parametr rozpoznania. Wg Endocrine Society 2011 pojedynczy pomiar przekraczający górną granicę normy potwierdza rozpoznanie, o ile próbka została pobrana bez nadmiernego stresu venepunkcji. Pobranie: rano, w spoczynku; unikać wcześniejszej stymulacji piersi i intensywnego wysiłku. Powtórzenie wskazane przy wartościach granicznych lub gdy podejrzewa się stres-zależny wzrost. Stopień podwyższenia ma wartość lokalizacyjną (wg Endocrine Society 2011): PRL > 500 ng/mL jest diagnostyczne dla makroprolactinoma; 250–500 ng/mL zwykle wskazuje na prolactinoma (mikro lub makro); 100–250 ng/mL — możliwe prolactinoma, ale też leki lub inne przyczyny; umiarkowane podwyższenie 25–100 ng/mL — częściej efekt przerwania szypuły przysadki, leki, mikroprolactinoma lub hiperprolaktynemia idiopatyczna.' },
            { ext: 'macroprolactin', label: 'Makroprolaktyna (precypitacja PEG)', note: 'Wykluczenie pseudohiperprolaktynemii — szczególnie przy bezobjawowej hiperprolaktynemii.', description: 'Makroprolaktyna — biologicznie nieaktywny kompleks prolaktyny z immunoglobuliną (PRL-IgG) o dużej masie cząsteczkowej. Jest wykrywana przez immunoassaye jako „prolaktyna", dając fałszywie podwyższony wynik (pseudohiperprolaktynemia) — przy braku objawów klinicznych hiperprolaktynemii. Oznaczenie metodą precypitacji glikolem polietylenowym (PEG): jeśli po precypitacji odzysk prolaktyny monomerycznej jest niski (< ~40%), wynik sugeruje przewagę makroprolaktyny. Wskazanie: szczególnie przy bezobjawowej hiperprolaktynemii (brak mlekotoku, zaburzeń miesiączkowania, hipogonadyzmu) — pozwala uniknąć zbędnego MRI i leczenia.' },
            { id: 'tsh', note: 'Wykluczenie pierwotnej niedoczynności tarczycy — podwyższone TRH stymuluje wydzielanie prolaktyny.' },
            { ext: 'bhcg', label: 'β-hCG (test ciążowy)', note: 'Wykluczenie ciąży — fizjologicznej przyczyny hiperprolaktynemii u kobiet w wieku rozrodczym.', description: 'β-hCG (test ciążowy) — wykluczenie ciąży jako fizjologicznej przyczyny hiperprolaktynemii u kobiet w wieku rozrodczym. W ciąży prolaktyna fizjologicznie rośnie (do ~200–400 ng/mL pod koniec ciąży) pod wpływem estrogenów — to norma, nie patologia. Test ciążowy należy wykonać przed dalszą diagnostyką hiperprolaktynemii i przed badaniem MRI.' },
            { ext: 'egfr', label: 'Kreatynina + eGFR', note: 'Wykluczenie przewlekłej choroby nerek — upośledzony klirens nerkowy prolaktyny prowadzi do jej kumulacji.', description: 'Kreatynina z obliczeniem eGFR — wykluczenie przewlekłej choroby nerek jako przyczyny hiperprolaktynemii. W zaawansowanej niewydolności nerek upośledzony jest klirens nerkowy prolaktyny, co prowadzi do jej kumulacji w surowicy; dodatkowo zaburzona jest regulacja podwzgórzowa wydzielania prolaktyny. Hiperprolaktynemia jest częsta u pacjentów dializowanych.' }
          ]
        },
        { name: 'Lokalizacja (gdy wykluczono przyczyny wtórne)',
          tests: [
            { ext: 'pituitary_mri_prl', label: 'MRI przysadki', note: 'Wskazane u każdego pacjenta z hiperprolaktynemią niejasnego pochodzenia — po wykluczeniu przyczyn fizjologicznych, farmakologicznych i wtórnych.', description: 'MRI przysadki mózgowej z kontrastem (gadolinium) — wskazane u każdego pacjenta z hiperprolaktynemią niejasnego pochodzenia, po wykluczeniu przyczyn fizjologicznych (ciąża), farmakologicznych (leki) i wtórnych (niedoczynność tarczycy, niewydolność nerek). Różnicuje: mikroprolactinoma (< 10 mm), makroprolactinoma (≥ 10 mm) oraz inne zmiany okolicy podwzgórzowo-przysadkowej dające „efekt przerwania szypuły" (stalk effect) — guzy uciskające szypułę przysadki przerywają dopaminergiczne hamowanie wydzielania prolaktyny, co daje umiarkowaną hiperprolaktynemię (zwykle < 100–150 ng/mL). UWAGA: u zdrowej populacji ~10% ma incidentaloma przysadki — wynik MRI należy korelować ze stopniem podwyższenia PRL i obrazem klinicznym.' },
            { ext: 'eye_exam_prl', label: 'Badanie pola widzenia (perymetria)', note: 'Gdy makrogruczolak — ocena ucisku skrzyżowania wzrokowego (klasycznie niedowidzenie połowicze dwuskroniowe).', description: 'Badanie pola widzenia (perymetria) — wskazane gdy MRI ujawni makrogruczolak przysadki (≥ 10 mm), zwłaszcza z szerzeniem się nadsiodłowym. Makrogruczolak uciskający skrzyżowanie wzrokowe powoduje klasycznie niedowidzenie połowicze dwuskroniowe (ubytek skroniowych części pól widzenia obu oczu). Perymetria pozwala wykryć i monitorować ten ubytek; jego obecność jest wskazaniem do pilniejszego leczenia. Towarzyszące badanie dna oka ocenia tarczę nerwu wzrokowego.' }
          ]
        },
        { name: 'Ocena funkcji przysadki (gdy makrogruczolak)',
          tests: [
            { id: 'ft4', note: 'Ocena osi tarczycowej — wtórna niedoczynność tarczycy przy ucisku przysadki przez makrogruczolak.' },
            { id: 'igf1', note: 'Ocena osi somatotropowej — niedobór GH przy ucisku przysadki.' },
            { id: 'cortisol', note: 'Ocena osi nadnerczowej — wtórna niedoczynność kory nadnerczy przy makrogruczolaku jest stanem zagrażającym życiu, wymaga pilnej oceny.' },
            { id: 'lh', note: 'Ocena osi gonadalnej — hipogonadyzm hipogonadotropowy (wtórny do hiperprolaktynemii oraz do ucisku przysadki).' },
            { id: 'fsh', note: 'Oznaczany razem z LH przy ocenie osi gonadalnej.' },
            { id: 'testosterone_total', note: 'Mężczyźni — ocena hipogonadyzmu wtórnego do hiperprolaktynemii i/lub ucisku przysadki.' },
            { id: 'estradiol', note: 'Kobiety — ocena hipogonadyzmu wtórnego do hiperprolaktynemii i/lub ucisku przysadki.' }
          ]
        },
        { name: 'Pułapki interpretacyjne',
          tests: [
            { ext: 'hook_effect', label: 'Efekt haka (hook effect) — uwaga interpretacyjna', note: 'Przy makrogruczolaku przysadki z umiarkowanie podwyższoną lub prawidłową PRL → poprosić laboratorium o oznaczenie z rozcieńczeniem próbki.', description: 'Efekt haka (high-dose hook effect) — pułapka diagnostyczna immunoassayów. Przy bardzo wysokim stężeniu prolaktyny (duże makroprolactinoma) nadmiar antygenu wysyca przeciwciała testu, co paradoksalnie daje FAŁSZYWIE NISKI lub tylko umiarkowanie podwyższony wynik. Sytuacja podejrzana: MRI ujawnia duży makrogruczolak przysadki, a oznaczona PRL jest tylko umiarkowanie podwyższona lub prawidłowa (niespójność obrazu klinicznego z wynikiem). Postępowanie: poprosić laboratorium o powtórzenie oznaczenia z rozcieńczeniem próbki (np. 1:100) — po rozcieńczeniu ujawnia się prawdziwa, bardzo wysoka wartość PRL. Nowsze testy są mniej podatne na ten efekt, ale pułapka nadal występuje.' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2011 (Melmed i wsp.) / Pituitary Society 2023 (Petersenn i wsp.) / PTE',
      sources: [
        'Melmed S, Casanueva FF, Hoffman AR, et al. Diagnosis and treatment of hyperprolactinemia: an Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2011;96(2):273-288.',
        'Petersenn S, Fleseriu M, Casanueva FF, et al. Diagnosis and management of prolactin-secreting pituitary adenomas: a Pituitary Society international Consensus Statement. Nat Rev Endocrinol. 2023;19(12):722-740.',
        'Bolanowski M, Zgliczyński W, Kos-Kudła B i wsp. Rekomendacje Polskiego Towarzystwa Endokrynologicznego dotyczące diagnostyki i leczenia guzów przysadki. Endokrynologia Polska.',
        'Vilar L, Vilar CF, Lyra R, Naves LA. Pitfalls in the diagnostic evaluation of hyperprolactinemia. Neuroendocrinology. 2019;109(1):7-19.'
      ]
    },

    amenorrhea: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Brak miesiączki — PIERWOTNY (brak wystąpienia pierwszej miesiączki do 16. r.ż. przy prawidłowo rozwiniętych drugorzędowych cechach płciowych — pokwitanie się rozpoczęło, ale miesiączka nie wystąpiła) lub WTÓRNY (brak miesiączki ≥ 3 miesiące u kobiety wcześniej miesiączkującej regularnie lub ≥ 6 miesięcy u miesiączkującej nieregularnie). Jeśli u dziewczynki do 13.–14. r.ż. nie pojawiają się żadne oznaki pokwitania (brak rozwoju piersi), diagnostyka powinna iść torem opóźnionego dojrzewania (osobne wskazanie) — brak miesiączki jest tam konsekwencją braku pokwitania, nie samodzielnym objawem.'
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'book-2',
            title: 'TEST CIĄŻOWY ZAWSZE PIERWSZY',
            body: 'Ciąża jest najczęstszą przyczyną wtórnego braku miesiączki. Oznaczenie β-hCG musi POPRZEDZAĆ każdą dalszą diagnostykę hormonalną i obrazową — test z krwi (ilościowy) jest czulszy i wykrywa ciążę wcześniej niż test z moczu. Dodatni wynik kończy diagnostykę braku miesiączki i kieruje pacjentkę do opieki położniczej.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'Wtórne',
                text: 'u kobiety wcześniej miesiączkującej:',
                detail: [
                  'Ciąża — najczęstsza przyczyna; wymaga wykluczenia jako pierwszy krok diagnostyczny.',
                  'Czynnościowy podwzgórzowy brak miesiączki (FHA) — stres, niedowaga, nadmierny wysiłek, zaburzenia odżywiania (anoreksja); odwracalna.',
                  'Hiperprolaktynemia (prolactinoma, leki, niedoczynność tarczycy, niewydolność nerek) — hamuje pulsacyjne wydzielanie GnRH.',
                  'PCOS (zespół policystycznych jajników) — częsta przyczyna oligo-/amenorrhei z cechami hiperandrogenizmu.',
                  'Przedwczesna niewydolność jajników (POI) — kryteria ESHRE 2016 (osobne wskazanie).',
                  'Choroby tarczycy — zarówno nadczynność, jak i niedoczynność zaburzają cykl.',
                  'Zespół Ashermana — zrosty wewnątrzmaciczne po zabiegach łyżeczkowania lub zapaleniach; cienkie endometrium w USG.'
                ]
              },
              {
                label: 'Pierwotne — przy obecnym pokwitaniu',
                text: 'najczęstsze przyczyny anatomiczne i chromosomalne:',
                detail: [
                  'Zespół Turnera (45,X lub mozaicyzm) — najczęstsza chromosomalna przyczyna pierwotnego braku miesiączki; często towarzyszy niedobór wzrostu.',
                  'Agenezja macicy i górnej części pochwy — zespół Mayera-Rokitansky\'ego-Küstera-Hausera (MRKH), kariotyp 46,XX z prawidłowo rozwiniętymi jajnikami i drugorzędowymi cechami.',
                  'Zespół niewrażliwości na androgeny (CAIS) — kariotyp 46,XY z fenotypem żeńskim; jądra obecne (zwykle w jamie brzusznej), brak macicy.',
                  'Zarośnięcie błony dziewiczej, przegroda pochwy — wady anatomiczne dające „kryptomenorrheę" (cykle obecne, ale wydzielina się gromadzi).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny',
            items: [
              '(1) β-hCG ZAWSZE pierwszy — wykluczenie ciąży.',
              '(2) Panel hormonalny podstawowy: FSH, LH, estradiol, TSH, prolaktyna — klasyfikacja przyczyn (centralna vs jajnikowa vs tyreoidalna vs hiperprolaktynemia).',
              '(3) Przy cechach hiperandrogenizmu (hirsutyzm, trądzik, cechy PCOS) — profil androgenowy: testosteron całkowity, SHBG, DHEA-S, 17-OH-progesteron (wykluczenie NCAH).',
              '(4) Obrazowanie: USG narządów rodnych (kluczowe w braku pierwotnym dla wad anatomicznych, w braku wtórnym dla oceny endometrium/jajników); MRI przysadki gdy hiperprolaktynemia lub podejrzenie zmiany podwzgórzowo-przysadkowej.',
              '(5) Diagnostyka pogłębiona: kariotyp (w braku pierwotnym i w POI), FMR1 (w POI), AMH (pomocniczo — niski w POI, wysoki w PCOS).'
            ]
          }
        ]
      },
      sections: [
        { name: 'Pierwszy krok (ZAWSZE)',
          tests: [
            { ext: 'bhcg', label: 'β-hCG (test ciążowy)', note: 'Ciąża jest najczęstszą przyczyną wtórnego braku miesiączki — oznaczenie β-hCG musi poprzedzać każdą dalszą diagnostykę.', description: 'β-hCG (podjednostka β ludzkiej gonadotropiny kosmówkowej) — test ciążowy z krwi (ilościowy) lub z moczu (jakościowy). Ciąża jest najczęstszą przyczyną wtórnego braku miesiączki i musi być wykluczona PRZED rozpoczęciem jakiejkolwiek dalszej diagnostyki hormonalnej czy obrazowej. Test z krwi (ilościowy β-hCG) jest czulszy i wykrywa ciążę wcześniej niż test z moczu. Dodatni wynik kończy diagnostykę braku miesiączki — kieruje pacjentkę do opieki położniczej.' }
          ]
        },
        { name: 'Panel hormonalny podstawowy',
          tests: [
            { id: 'fsh', note: 'Wysoki (> 25 IU/L w 2 pomiarach) → niewydolność jajników (POI, zespół Turnera); niski/prawidłowy → przyczyna podwzgórzowo-przysadkowa (FHA, hipopituitaryzm) lub PCOS.' },
            { id: 'lh', note: 'Oznaczany razem z FSH. Pomaga różnicować: wysokie LH+FSH → niewydolność jajników; niskie/prawidłowe → przyczyna centralna.' },
            { id: 'estradiol', note: 'Niski → hipoestrogenizm (POI lub FHA — wymaga różnicowania przez FSH). Ocena funkcji jajników.' },
            { id: 'tsh', note: 'Wykluczenie chorób tarczycy — zarówno nadczynność, jak i niedoczynność mogą powodować zaburzenia cyklu miesiączkowego.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii. Pobranie w spoczynku (samo nakłucie żyły może podnieść PRL); przy wartościach granicznych powtórzyć 2-krotnie.' }
          ]
        },
        { name: 'Przy podejrzeniu hiperandrogenizmu (hirsutyzm, trądzik, cechy PCOS)',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano. > 7 nmol/L (200 ng/dL) → wykluczyć guz androgenny.' },
            { id: 'shbg', note: 'Obniżona w insulinooporności; służy do obliczenia FAI (free androgen index).' },
            { id: 'dhea_s', note: 'Marker źródła nadnerczowego androgenów. > 18,9 μmol/L (700 μg/dL) → podejrzenie guza nadnercza.' },
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH z niedoboru 21-hydroksylazy. Bazalnie < 6 nmol/L (2 ng/mL) wyklucza klasyczny WPN.' }
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            { ext: 'chorionic_us_amenorrhea', label: 'USG narządów rodnych', note: 'Ocena anatomii: obecność i budowa macicy, jajniki, grubość endometrium.', description: 'USG narządów rodnych — przezpochwowe (TVS) u kobiet współżyjących, przezbrzuszne u młodych pacjentek lub niewspółżyjących. W braku miesiączki cele: (1) w braku PIERWOTNYM — kluczowe dla wykrycia wad anatomicznych: agenezja macicy i górnej części pochwy (zespół Mayera-Rokitansky\'ego-Küstera-Hausera), zarośnięcie błony dziewiczej, przegroda pochwy; ocena obecności jajników i ich budowy; (2) w braku WTÓRNYM — ocena grubości i echostruktury endometrium (cienkie endometrium → hipoestrogenizm lub zespół Ashermana), morfologii jajników (obraz polycystic w PCOS, zanik w POI). USG jest badaniem pierwszego rzutu w obrazowaniu narządu rodnego.' },
            { ext: 'pituitary_mri', label: 'MRI przysadki', note: 'Gdy hiperprolaktynemia lub podejrzenie zmiany w okolicy podwzgórzowo-przysadkowej.', description: 'MRI przysadki mózgowej z kontrastem (gadolinium) — wskazane w diagnostyce braku miesiączki gdy: stwierdzono hiperprolaktynemię (poszukiwanie gruczolaka prolaktynowego — prolactinoma), podejrzenie hipopituitaryzmu (niskie FSH/LH/estradiol + objawy niedoczynności innych osi), objawy masy w okolicy siodła tureckiego (bóle głowy, zaburzenia pola widzenia). Pozwala wykryć mikrogruczolak (< 10 mm) lub makrogruczolak przysadki, a także inne zmiany (czaszkogardlak, zespół pustego siodła).' }
          ]
        },
        { name: 'Diagnostyka pogłębiona (zależnie od kontekstu)',
          tests: [
            { ext: 'karyotype', label: 'Kariotyp', note: 'W pierwotnym braku miesiączki oraz w POI rozpoznanej przed 40. r.ż. — wykrycie zespołu Turnera (45,X), dysgenezji gonad, CAIS (46,XY).', description: 'Kariotyp — ocena chromosomów z hodowli limfocytów krwi obwodowej. W diagnostyce braku miesiączki wskazany: (1) w braku PIERWOTNYM — wykrycie zespołu Turnera (45,X lub mozaicyzm — najczęstsza chromosomalna przyczyna pierwotnego braku miesiączki), czystej dysgenezji gonad (46,XY — zespół Swyera; lub 46,XX gonadal dysgenesis — osobna jednostka), zespołu niewrażliwości na androgeny (CAIS, 46,XY z fenotypem żeńskim); (2) w przedwczesnej niewydolności jajników (POI) rozpoznanej przed 40. r.ż. — wykrycie nieprawidłowości chromosomu X. Wynik opisuje się wg ISCN.' },
            { ext: 'fmr1', label: 'FMR1 (premutacja zespołu łamliwego chromosomu X)', note: 'W przedwczesnej niewydolności jajników (POI) — premutacja FMR1 odpowiada za ~13–15% rodzinnych i ~3–5% sporadycznych przypadków POI.', description: 'Badanie premutacji genu FMR1 (zespół łamliwego chromosomu X, Fragile X) — wskazane u kobiet z przedwczesną niewydolnością jajników (POI). Premutacja FMR1 (55–200 powtórzeń CGG) jest najczęstszą znaną pojedynczą przyczyną genetyczną POI — odpowiada za ~13–15% przypadków rodzinnych i ~3–5% sporadycznych (wg ESHRE POI 2016). Wykrycie premutacji ma znaczenie dla poradnictwa genetycznego: nosicielki są zagrożone urodzeniem dziecka z pełną mutacją (zespół łamliwego chromosomu X — najczęstsza dziedziczna przyczyna niepełnosprawności intelektualnej u chłopców), a same są w grupie ryzyka zespołu drżenia/ataksji związanego z łamliwym X (FXTAS).' },
            { id: 'amh', note: 'Badanie pomocnicze w diagnostyce różnicowej: niski/nieoznaczalny → przedwczesna niewydolność jajników (POI; może wyprzedzać wzrost FSH); wysoki → wspiera rozpoznanie PCOS; prawidłowy → przyczyna centralna (FHA) lub anatomiczna.', description: 'AMH (hormon antymüllerowski) — marker rezerwy jajnikowej, badanie POMOCNICZE w diagnostyce różnicowej braku miesiączki (nie pierwszego rzutu). Interpretacja: (1) niski lub nieoznaczalny AMH → przedwczesna niewydolność jajników (POI) — AMH może obniżyć się wcześniej niż wzrośnie FSH, bywa wczesnym markerem; (2) wysoki AMH (mediana 3–5× wyższa niż u zdrowych) → wspiera rozpoznanie PCOS; (3) prawidłowy AMH → jajniki sprawne, przyczyna braku miesiączki jest centralna (czynnościowy podwzgórzowy brak miesiączki, hipopituitaryzm) lub anatomiczna (zespół Ashermana, wady wrodzone). AMH jest stabilny w cyklu i niezależny od fazy — można go oznaczać w dowolnym momencie. Uzupełnia ocenę FSH/estradiolu, szczególnie przy planowaniu prokreacji.' }
          ]
        }
      ],
      guideline: 'ACOG / ASRM Practice Committee / Endocrine Society 2017 (Gordon i wsp. — FHA) / PTGiP',
      sources: [
        'Practice Committee of the American Society for Reproductive Medicine. Current evaluation of amenorrhea. Fertil Steril. 2008;90(5 Suppl):S219-S225 (reaffirmed 2018).',
        'ACOG Committee Opinion No. 651: Menstruation in girls and adolescents — using the menstrual cycle as a vital sign. Obstet Gynecol. 2015;126(6):e143-e146.',
        'Gordon CM, Ackerman KE, Berga SL, et al. Functional Hypothalamic Amenorrhea: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2017;102(5):1413-1439.',
        'Klein DA, Poth MA. Amenorrhea: an approach to diagnosis and management. Am Fam Physician. 2013;87(11):781-788.',
        'European Society of Human Reproduction and Embryology (ESHRE) Guideline Group on POI. Management of women with premature ovarian insufficiency. Hum Reprod. 2016;31(5):926-937.',
        'Radowicki S, Szczudrawa A i wsp. Ginekologia — podręcznik dla studentów i lekarzy. (polskie podręczniki ginekologii — definicja i diagnostyka braku miesiączki).'
      ]
    },

    galactorrhea: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i charakter kliniczny',
            body: 'Mlekotok (galactorrhea) — wydzielanie mlecznej treści z brodawek sutkowych NIEZWIĄZANE z laktacją poporodową. Cechy prawdziwego mlekotoku: obustronny, mleczny, wieloprzewodowy. WAŻNE — cechy alarmowe: wydzielina jednostronna, krwista lub surowicza albo współistniejący guz piersi przemawiają za patologią gruczołu piersiowego i wymagają odrębnej diagnostyki OBRAZOWEJ piersi (mammografia, USG, ewentualnie MRI piersi), NIE diagnostyki hormonalnej.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Kluczowe pytanie — stężenie prolaktyny',
            items: [
              {
                label: 'Mlekotok z hiperprolaktynemią',
                text: 'diagnostyka jak w hiperprolaktynemii:',
                detail: [
                  'Wykluczyć przyczyny fizjologiczne (ciąża — β-hCG), farmakologiczne (szczegółowy wywiad lekowy) i wtórne (TSH, kreatynina/eGFR, makroprolaktyna).',
                  'Przy hiperprolaktynemii niejasnego pochodzenia — MRI przysadki z gadolinium (poszukiwanie mikro- lub makroprolactinoma, innych zmian z efektem przerwania szypuły).',
                  'Stopień podwyższenia PRL ma wartość lokalizacyjną: > 500 ng/mL → makroprolactinoma; 250–500 → prolactinoma (mikro/makro); umiarkowane (25–100) → częściej leki, efekt przerwania szypuły lub mikroprolactinoma.'
                ]
              },
              {
                label: 'Mlekotok normoprolaktynemiczny (prawidłowa PRL)',
                text: 'częsty — zwykle łagodny:',
                detail: [
                  'Najczęściej idiopatyczny, o łagodnym przebiegu.',
                  'MRI przysadki ZWYKLE NIEPOTRZEBNE — pod warunkiem, że wykluczono przyczyny wtórne i nie ma cech alarmowych.',
                  'Pamiętać o ewentualnej pseudohiperprolaktynemii z makroprolaktyną (precypitacja PEG) — może maskować rzeczywistą wartość prolaktyny biologicznie aktywnej.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wykluczyć — szczegółowy wywiad i badania',
            items: [
              { label: 'Fizjologiczne', text: 'ciąża, połóg, karmienie piersią — fizjologiczne przyczyny mlekotoku i hiperprolaktynemii; β-hCG pierwsze badanie u kobiet w wieku rozrodczym.' },
              {
                label: 'Farmakologiczne — szczegółowy wywiad lekowy!',
                text: 'liczne leki podnoszą prolaktynę i mogą powodować mlekotok:',
                detail: [
                  'Neuroleptyki — szczególnie rysperydon i amisulpiryd (najwyższe wzrosty PRL); olanzapina, kwetiapina — umiarkowane.',
                  'Leki przeciwwymiotne i prokinetyczne: metoklopramid, domperydon.',
                  'Leki przeciwdepresyjne: SSRI, klomipramina, MAO-I.',
                  'Estrogeny (doustna antykoncepcja, HTZ).',
                  'Opioidy.',
                  'Antagoniści kanału wapniowego: werapamil.',
                  'Inne: cymetydyna, metyldopa, rezerpina.'
                ]
              },
              {
                label: 'Patologiczne',
                text: 'choroby narządowe i guzy okolicy przysadki:',
                detail: [
                  'Pierwotna niedoczynność tarczycy — podwyższone TRH stymuluje wydzielanie prolaktyny.',
                  'Przewlekła choroba nerek — upośledzony klirens nerkowy prolaktyny.',
                  'Prolactinoma (mikro-/makrogruczolak) — najczęstsza patologiczna przyczyna hiperprolaktynemii.',
                  'Inne guzy okolicy podwzgórzowo-przysadkowej z efektem przerwania szypuły (czaszkogardlak, gruczolaki nieczynne, meningioma).',
                  'Makroprolaktynemia — pseudohiperprolaktynemia, biologicznie nieaktywny kompleks PRL-IgG.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie i ocena prolaktyny',
          tests: [
            { id: 'prolactin', note: 'Pojedynczy pomiar przy prawidłowym pobraniu zwykle wystarcza (rano, w spoczynku, bez nadmiernego stresu venepunkcji, bez wcześniejszej stymulacji piersi). Przy wartościach granicznych — powtórzyć. Uwaga: mlekotok może występować również przy prawidłowej prolaktynie (mlekotok normoprolaktynemiczny).', description: 'Prolaktyna — kluczowy parametr w diagnostyce mlekotoku, ponieważ rozstrzyga, czy mlekotok przebiega z hiperprolaktynemią, czy bez niej. Pobranie: rano, w spoczynku; unikać wcześniejszej stymulacji piersi i intensywnego wysiłku, które mogą przejściowo podnieść stężenie. Wg Endocrine Society 2011 pojedynczy pomiar przekraczający górną granicę normy przy prawidłowym pobraniu potwierdza hiperprolaktynemię; powtórzenie wskazane przy wartościach granicznych. Stopień podwyższenia ma wartość lokalizacyjną: PRL > 500 ng/mL jest diagnostyczne dla makroprolactinoma; 250–500 ng/mL zwykle wskazuje na prolactinoma; umiarkowane podwyższenie (25–100 ng/mL) — częściej leki, efekt przerwania szypuły lub mikroprolactinoma. WAŻNE: mlekotok przy PRAWIDŁOWEJ prolaktynie (mlekotok normoprolaktynemiczny) jest częsty i zwykle idiopatyczny — nie wymaga rozległej diagnostyki, jeśli wykluczono przyczyny wtórne.' },
            { ext: 'macroprolactin', label: 'Makroprolaktyna (precypitacja PEG)', note: 'Wykluczenie pseudohiperprolaktynemii — biologicznie nieaktywny kompleks prolaktyny z immunoglobuliną daje fałszywie podwyższony wynik. Szczególnie istotne, gdy hiperprolaktynemia jest skąpoobjawowa.', description: 'Makroprolaktyna — biologicznie nieaktywny kompleks prolaktyny z immunoglobuliną (PRL-IgG) o dużej masie cząsteczkowej. Jest wykrywana przez immunoassaye jako „prolaktyna", dając fałszywie podwyższony wynik (pseudohiperprolaktynemia) przy braku objawów klinicznych. Oznaczenie metodą precypitacji glikolem polietylenowym (PEG): niski odzysk prolaktyny monomerycznej (< ~40%) sugeruje przewagę makroprolaktyny. Wskazanie: szczególnie przy hiperprolaktynemii skąpo- lub bezobjawowej — pozwala uniknąć zbędnego MRI i leczenia.' }
          ]
        },
        { name: 'Wykluczenie częstych przyczyn',
          tests: [
            { id: 'tsh', note: 'Wykluczenie pierwotnej niedoczynności tarczycy — podwyższone TRH stymuluje wydzielanie prolaktyny i może powodować mlekotok.' },
            { id: 'ft4', note: 'Oznaczany łącznie z TSH przy ocenie czynności tarczycy.' },
            { ext: 'bhcg', label: 'β-hCG (test ciążowy)', note: 'Wykluczenie ciąży i połogu — fizjologicznych przyczyn mlekotoku i hiperprolaktynemii u kobiet w wieku rozrodczym.', description: 'β-hCG (test ciążowy) — wykluczenie ciąży jako fizjologicznej przyczyny mlekotoku i hiperprolaktynemii u kobiet w wieku rozrodczym. W ciąży prolaktyna fizjologicznie rośnie pod wpływem estrogenów, a mlekotok/laktacja jest naturalnym następstwem; podobnie utrzymuje się w okresie poporodowym i w trakcie karmienia piersią. Test ciążowy należy wykonać przed dalszą diagnostyką hormonalną i obrazową.' },
            { ext: 'egfr', label: 'Kreatynina + eGFR', note: 'Wykluczenie przewlekłej choroby nerek — upośledzony klirens nerkowy prolaktyny prowadzi do jej kumulacji w surowicy i może powodować mlekotok.', description: 'Kreatynina z obliczeniem eGFR — wykluczenie przewlekłej choroby nerek jako przyczyny hiperprolaktynemii i mlekotoku. W zaawansowanej niewydolności nerek upośledzony jest klirens nerkowy prolaktyny, co prowadzi do jej kumulacji w surowicy; dodatkowo zaburzona jest podwzgórzowa regulacja jej wydzielania. Hiperprolaktynemia jest częsta u pacjentów dializowanych.' }
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            { ext: 'pituitary_mri', label: 'MRI przysadki', note: 'Wskazane przy mlekotoku z hiperprolaktynemią niejasnego pochodzenia — po wykluczeniu przyczyn fizjologicznych (ciąża), farmakologicznych (leki) i wtórnych (niedoczynność tarczycy, niewydolność nerek). Przy mlekotoku normoprolaktynemicznym MRI zwykle nie jest potrzebne.', description: 'MRI przysadki mózgowej z kontrastem (gadolinium) — wskazane przy mlekotoku przebiegającym z hiperprolaktynemią niejasnego pochodzenia, po wykluczeniu przyczyn fizjologicznych, farmakologicznych i wtórnych. Różnicuje mikroprolactinoma (< 10 mm), makroprolactinoma (≥ 10 mm) oraz inne zmiany okolicy podwzgórzowo-przysadkowej dające efekt przerwania szypuły (stalk effect). Przy mlekotoku z prawidłową prolaktyną (normoprolaktynemicznym) MRI zwykle nie jest wskazane. UWAGA: ~10% zdrowej populacji ma incidentaloma przysadki — wynik MRI należy korelować ze stopniem podwyższenia PRL i obrazem klinicznym.' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2011 (Melmed i wsp.) / PTE',
      sources: [
        'Melmed S, Casanueva FF, Hoffman AR, et al. Diagnosis and treatment of hyperprolactinemia: an Endocrine Society clinical practice guideline. J Clin Endocrinol Metab. 2011;96(2):273-288.',
        'Bolanowski M, Zgliczyński W, Kos-Kudła B i wsp. Rekomendacje Polskiego Towarzystwa Endokrynologicznego dotyczące diagnostyki i leczenia guzów przysadki. Endokrynologia Polska.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o hiperprolaktynemii i chorobach przysadki.'
      ]
    },

    ovulation: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i podstawowa metoda',
            body: 'Ocena owulacji — potwierdzenie, czy w cyklu doszło do jajeczkowania. Podstawowym narzędziem jest progesteron w środku fazy lutealnej (~7 dni przed spodziewaną miesiączką, klasycznie „21. dzień" przy cyklu 28-dniowym; przy cyklach dłuższych/krótszych odpowiednio później/wcześniej). Progi interpretacyjne: progesteron > 3 ng/mL (~10 nmol/L) potwierdza, że doszło do owulacji; > 10 ng/mL (~30 nmol/L) wskazuje na wydolną funkcję ciałka żółtego. UWAGA: progesteron jest wydzielany PULSACYJNIE — wynik należy interpretować względem rzeczywistego momentu pobrania w cyklu.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Metody oceny owulacji',
            items: [
              {
                label: 'Progesteron w fazie lutealnej — główny test',
                text: 'najwiarygodniejsza metoda potwierdzenia owulacji:',
                detail: [
                  'Pobranie: ok. 7 dni przed spodziewaną miesiączką (cykl 28-dniowy → ok. 21. dnia; dłuższy/krótszy → odpowiednio później/wcześniej).',
                  'Progesteron > 3 ng/mL (~10 nmol/L) potwierdza, że doszło do owulacji.',
                  'Progesteron > 10 ng/mL (~30 nmol/L) świadczy o wydolnej funkcji ciałka żółtego.',
                  'PUŁAPKA: progesteron wydzielany pulsacyjnie (wahania w ciągu godzin); niski wynik może wynikać z pobrania zbyt wcześnie/zbyt późno — a nie tylko z braku owulacji.'
                ]
              },
              {
                label: 'Wyrzut LH — pomocniczy w predykcji owulacji',
                text: 'identyfikuje moment ZBLIŻAJĄCEJ SIĘ owulacji, nie potwierdza jej post factum:',
                detail: [
                  'Test OPK z moczu — dodatni wynik oznacza spodziewaną owulację w ciągu ok. 24–36 h; przydatny w planowaniu współżycia/punkcji.',
                  'Pojedyncze oznaczenie LH z surowicy — ograniczona wartość: pulsacyjne wydzielanie i krótki czas trwania szczytu (10–12 h).',
                  'Wyrzut LH poprzedza owulację o ok. 36 h (początek) i o ok. 10–12 h (szczyt LH).'
                ]
              },
              {
                label: 'Folikulometria — seryjne USG przezpochwowe',
                text: 'najbardziej bezpośrednia metoda obserwacji owulacji:',
                detail: [
                  'Seryjne USG TV co 1–3 dni w okolicy spodziewanej owulacji.',
                  'Śledzi: wzrost pęcherzyka dominującego (przedowulacyjnie ~18–24 mm), moment owulacji (zmniejszenie/zniknięcie pęcherzyka, wolny płyn w zatoce Douglasa, ciałko żółte), grubość i wygląd endometrium.',
                  'Rutyna w monitorowaniu cykli stymulowanych w leczeniu niepłodności.',
                  'Wada: konieczność wielokrotnych wizyt w określonych dniach cyklu.'
                ]
              },
              { label: 'BBT — krzywa podstawowej temperatury ciała', text: 'krzywa dwufazowa: po owulacji progesteron podnosi BBT o ~0,3–0,5°C. Metoda RETROSPEKTYWNA (potwierdza owulację dopiero po fakcie) i mało precyzyjna — NIEZALECANA jako podstawowa metoda oceny owulacji.' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Gdy potwierdzono brak owulacji — szukaj odwracalnych przyczyn',
            items: [
              { label: 'TSH', text: 'wykluczenie dysfunkcji tarczycy — zarówno nadczynność, jak i niedoczynność zaburzają owulację.' },
              { label: 'Prolaktyna', text: 'wykluczenie hiperprolaktynemii — hamuje pulsacyjne wydzielanie GnRH i prowadzi do braku owulacji; częsta odwracalna przyczyna.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie owulacji',
          tests: [
            { id: 'progesterone', note: 'Pobranie w środku fazy lutealnej — ok. 7 dni przed spodziewaną miesiączką (klasycznie „21. dzień" przy cyklu 28-dniowym). Progesteron > 3 ng/mL (~10 nmol/L) potwierdza, że doszło do owulacji; > 10 ng/mL (~30 nmol/L) świadczy o wydolnej funkcji ciałka żółtego.', description: 'Progesteron — podstawowy parametr potwierdzający owulację. Po owulacji ciałko żółte produkuje progesteron, którego stężenie osiąga szczyt w środku fazy lutealnej. Pobranie: ok. 7 dni przed spodziewaną miesiączką (przy cyklu 28-dniowym — ok. 21. dnia; przy cyklach dłuższych lub krótszych odpowiednio później lub wcześniej). Interpretacja: progesteron > 3 ng/mL (~10 nmol/L) potwierdza, że do owulacji doszło; wartości > 10 ng/mL (~30 nmol/L) wskazują na wydolną funkcję ciałka żółtego. UWAGA: progesteron jest wydzielany pulsacyjnie, a jego stężenie zmienia się w trakcie fazy lutealnej — pojedynczy wynik należy interpretować względem rzeczywistego momentu pobrania w cyklu; niski wynik może wynikać z pobrania zbyt wcześnie lub zbyt późno, a nie tylko z braku owulacji.' },
            { id: 'lh', note: 'Wyrzut LH w połowie cyklu poprzedza owulację — jego początek o ok. 36 godzin, a szczyt LH o ok. 10–12 godzin. Dodatni test LH z moczu (OPK) oznacza spodziewaną owulację w ciągu ok. 24–36 godzin; pojedyncze oznaczenie LH z surowicy ma ograniczoną wartość ze względu na pulsacyjne wydzielanie i krótki czas trwania szczytu.' },
            { id: 'estradiol', note: 'Rośnie w późnej fazie folikularnej i osiąga szczyt tuż przed wyrzutem LH — marker pomocniczy monitorowania dojrzewania pęcherzyka; sam nie potwierdza owulacji.' }
          ]
        },
        { name: 'Metody bezpośrednie i monitorowanie',
          tests: [
            { ext: 'chorionic_us', label: 'Folikulometria (seryjne USG przezpochwowe)', note: 'Bezpośrednia obserwacja owulacji — seryjne USG przezpochwowe śledzi wzrost pęcherzyka dominującego, dokumentuje jego pęknięcie (zniknięcie pęcherzyka, pojawienie się wolnego płynu w zatoce Douglasa) oraz powstanie ciałka żółtego. Najbardziej bezpośrednia metoda, przydatna m.in. przy monitorowaniu cyklu stymulowanego.', description: 'Folikulometria — seryjne USG przezpochwowe wykonywane co 1–3 dni w okolicy spodziewanej owulacji. Pozwala bezpośrednio śledzić: wzrost pęcherzyka dominującego (przedowulacyjnie zwykle ~18–24 mm), moment owulacji (nagłe zmniejszenie lub zniknięcie pęcherzyka, pojawienie się wolnego płynu w zatoce Douglasa, zmiana echostruktury na ciałko żółte) oraz grubość i wygląd endometrium. Jest najbardziej bezpośrednią metodą oceny owulacji; szczególnie przydatna przy monitorowaniu cykli naturalnych i stymulowanych w leczeniu niepłodności. Wadą jest konieczność wielokrotnych wizyt.' },
            { ext: 'bbt', label: 'BBT — krzywa podstawowej temperatury ciała', note: 'Krzywa dwufazowa: po owulacji progesteron podnosi podstawową temperaturę ciała o ~0,3–0,5°C. Metoda retrospektywna (potwierdza owulację dopiero po fakcie) i mało precyzyjna — niezalecana jako podstawowa metoda oceny owulacji.' }
          ]
        },
        { name: 'Gdy potwierdzono brak owulacji — poszukiwanie przyczyny',
          tests: [
            { id: 'tsh', note: 'Dysfunkcja tarczycy (zarówno nad-, jak i niedoczynność) zaburza owulację — wykluczenie jako odwracalna przyczyna braku owulacji.' },
            { id: 'prolactin', note: 'Hiperprolaktynemia hamuje pulsacyjne wydzielanie GnRH i prowadzi do braku owulacji — częsta odwracalna przyczyna.' }
          ]
        }
      ],
      guideline: 'ASRM / NICE / PTMRiE',
      sources: [
        'Practice Committee of the American Society for Reproductive Medicine. Diagnostic evaluation of the infertile female: a committee opinion. Fertil Steril. 2015.',
        'National Institute for Health and Care Excellence (NICE). Fertility problems: assessment and treatment. Clinical guideline CG156.',
        'Polskie Towarzystwo Medycyny Rozrodu i Embriologii (PTMRiE) — rekomendacje dotyczące diagnostyki i leczenia niepłodności.'
      ]
    },

    luteal_phase_defect: {
      summary: {
        sections: [
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'book-2',
            title: 'Encja klinicznie kontrowersyjna — opinia ASRM 2015',
            body: 'Wg opinii komitetu ASRM (2015) nie istnieje zwalidowany, powtarzalny test diagnostyczny niewydolności fazy lutealnej, a sama niewydolność jako NIEZALEŻNA przyczyna niepłodności nie jest poparta wystarczającymi dowodami. Pojedynczy progesteron z fazy lutealnej NIE nadaje się do rozpoznania (pulsacyjne wydzielanie z wahaniami w ciągu godzin, trudna synchronizacja pobrania z owulacją, brak zwalidowanego progu „niedoboru"). Historyczna biopsja endometrium z datowaniem histologicznym (kryteria Noyesa) została zdyskredytowana jako nieodtwarzalna i nieróżnicująca kobiet płodnych od niepłodnych.'
          },
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Praktyczna wartość diagnostyki',
            body: 'Przy podejrzeniu zaburzeń fazy lutealnej praktyczne cele diagnostyki to: (1) POTWIERDZIĆ, że w cyklu doszło do owulacji (progesteron > 3 ng/mL); (2) wykluczyć rzeczywiste, odwracalne przyczyny zaburzeń cyklu — przede wszystkim dysfunkcję tarczycy i hiperprolaktynemię. Diagnostyka NIE ma na celu rozpoznania samego „niedoboru fazy lutealnej" jako jednostki — tylko identyfikację leczalnych przyczyn zaburzeń cyklu.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Co rzeczywiście warto zrobić',
            items: [
              { label: 'Progesteron w środku fazy lutealnej', text: 'jako POTWIERDZENIE owulacji (> 3 ng/mL / ~10 nmol/L), NIE jako test „niedoboru". Pobranie ok. 7 dni przed spodziewaną miesiączką.' },
              { label: 'TSH', text: 'wykluczenie dysfunkcji tarczycy — zarówno nadczynność, jak i niedoczynność realnie zaburzają cykl i fazę lutealną; konkretna, leczalna przyczyna.' },
              { label: 'Prolaktyna', text: 'wykluczenie hiperprolaktynemii — hamuje pulsacyjne wydzielanie GnRH i zaburza cykl; odwracalna przyczyna.' },
              { label: 'Szerszy kontekst hormonalny gdy potrzebny', text: 'FSH + LH + estradiol w 3. dniu cyklu — ocena rezerwy jajnikowej i wzorca cyklu; podwyższony stosunek LH/FSH może sugerować PCOS.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie owulacji i ocena fazy lutealnej',
          tests: [
            { id: 'progesterone', note: 'Pobranie w środku fazy lutealnej (ok. 7 dni przed spodziewaną miesiączką). Wartość > 3 ng/mL (~10 nmol/L) potwierdza, że doszło do owulacji. UWAGA: pojedynczy niski wynik NIE rozpoznaje niewydolności fazy lutealnej — progesteron jest pulsacyjny, trudno zsynchronizować pobranie z owulacją, a żaden próg „niedoboru" nie został zwalidowany.', description: 'Progesteron w środku fazy lutealnej — w kontekście podejrzenia niewydolności fazy lutealnej służy przede wszystkim potwierdzeniu, że w cyklu doszło do owulacji (wartość > 3 ng/mL / ~10 nmol/L), a nie rozpoznaniu samego „niedoboru". Ograniczenia jako testu niewydolności fazy lutealnej: (1) progesteron jest wydzielany pulsacyjnie — jego stężenie zmienia się kilkukrotnie w ciągu godzin; (2) trudno precyzyjnie zsynchronizować moment pobrania z rzeczywistą owulacją; (3) żaden próg odróżniający „wydolną" od „niewydolnej" fazy lutealnej nie został zwalidowany. Z tych powodów ASRM (2015) nie zaleca opierania rozpoznania na pojedynczym ani seryjnym oznaczeniu progesteronu. Niewiarygodna jest również historyczna metoda referencyjna — biopsja endometrium z datowaniem histologicznym (kryteria Noyesa) — którą ASRM 2015 wprost zdyskredytowała jako nieodtwarzalną i nieróżnicującą kobiet płodnych od niepłodnych. Pobranie: ok. 7 dni przed spodziewaną miesiączką (przy cyklu 28-dniowym — ok. 21. dnia).' }
          ]
        },
        { name: 'Wykluczenie rzeczywistych, odwracalnych przyczyn zaburzeń fazy lutealnej',
          tests: [
            { id: 'tsh', note: 'Zarówno niedoczynność, jak i nadczynność tarczycy realnie zaburzają cykl miesiączkowy i fazę lutealną — to konkretna, leczalna przyczyna, której warto szukać.' },
            { id: 'prolactin', note: 'Hiperprolaktynemia hamuje pulsacyjne wydzielanie GnRH i zaburza cykl miesiączkowy oraz fazę lutealną — odwracalna przyczyna, którą należy wykluczyć.' }
          ]
        },
        { name: 'Szerszy kontekst hormonalny (ocena cyklu i owulacji)',
          tests: [
            { id: 'lh', note: 'Ocena funkcji owulacyjnej w szerszym kontekście cyklu; podwyższony stosunek LH/FSH może sugerować PCOS.' },
            { id: 'fsh', note: 'Oznaczany łącznie z LH i estradiolem (3. dzień cyklu) — ocena kontekstu jajnikowego i rezerwy.' },
            { id: 'estradiol', note: 'Ocena dojrzewania pęcherzyka i kontekstu hormonalnego cyklu; sam nie rozstrzyga o wydolności fazy lutealnej.' }
          ]
        }
      ],
      guideline: 'ASRM Practice Committee 2015 (Current clinical irrelevance of luteal phase deficiency) / PTMRiE',
      sources: [
        'Practice Committee of the American Society for Reproductive Medicine. Current clinical irrelevance of luteal phase deficiency: a committee opinion. Fertil Steril. 2015;103(4):e27-e32.',
        'Polskie Towarzystwo Medycyny Rozrodu i Embriologii (PTMRiE) — rekomendacje dotyczące diagnostyki i leczenia niepłodności.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska.'
      ]
    },

    pregnancy: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Zakres wskazania',
            body: 'Wskazanie obejmuje endokrynologiczne i metaboliczne aspekty kontroli laboratoryjnej ciąży: czynność tarczycy, skrining cukrzycy ciążowej (GDM) oraz hormony wczesnej ciąży. Pełna opieka prenatalna jest szersza (morfologia, grupa krwi z przeciwciałami odpornościowymi, serologie zakaźne, badania prenatalne, USG genetyczne) i wykracza poza zakres przelicznika hormonalnego.'
          },
          {
            kind: 'prose',
            icon: 'baby-bottle',
            title: 'Fizjologiczne zmiany hormonalne w ciąży',
            body: 'W ciąży fizjologicznie wzrastają: prolaktyna, SHBG, kortyzol oraz hormony tarczycowe całkowite (T4 i T3 — wskutek wzrostu TBG, białka wiążącego). TSH w I trymestrze fizjologicznie spada (hCG, mając wspólną podjednostkę α z TSH, stymuluje tarczycę), a wolne frakcje (fT4, fT3) pozostają w normie lub nieco się obniżają w II i III trymestrze. TSH i fT4 należy więc interpretować wg zakresów referencyjnych specyficznych dla trymestru — optymalnie własnych laboratoryjnych, a gdy niedostępne — wg polskich wytycznych PTE 2021 (Hubalewska-Dydejczyk i wsp., elektrochemiluminescencja, polska populacja, tab. 2): TSH I trymestr 0,01–3,18 mIU/L; II 0,05–3,44; III 0,11–3,53. Wartość > 3,18 / 3,44 / 3,53 mIU/L (odpowiednio dla trymestru) świadczy o subklinicznej niedoczynności wymagającej leczenia. CEL terapeutyczny u pacjentki LECZONEJ lewotyroksyną w I trymestrze: < 2,5 mIU/L (NIE jest to próg diagnostyczny).'
          }
        ]
      },
      sections: [
        { name: 'Czynność tarczycy w ciąży',
          tests: [
            { id: 'tsh', note: 'Optymalnie zakresy referencyjne specyficzne dla trymestru i laboratorium. Gdy niedostępne — polskie wytyczne PTE 2021 (ECL): I trymestr 0,01–3,18; II 0,05–3,44; III 0,11–3,53 mIU/L. Cel terapeutyczny u pacjentki leczonej w I trymestrze: < 2,5.', description: 'TSH — podstawowy parametr oceny czynności tarczycy w ciąży. Optymalnie należy stosować zakresy referencyjne specyficzne dla trymestru oraz danego laboratorium/populacji. Gdy własne zakresy laboratoryjne są niedostępne, polskie wytyczne PTE 2021 (Hubalewska-Dydejczyk i wsp., elektrochemiluminescencja, polska populacja, tab. 2) podają następujące POPULACYJNE zakresy referencyjne TSH: I trymestr 0,01–3,18 mIU/L; II trymestr 0,05–3,44; III trymestr 0,11–3,53. Wartość > 3,18 / 3,44 / 3,53 mIU/L (odpowiednio dla trymestru) jest nieprawidłowa i świadczy o subklinicznej niedoczynności tarczycy wymagającej leczenia lewotyroksyną. PTE 2021 wprost odstąpiło od progu ATA 2017 = 4,0 mIU/L na rzecz polskich progów populacyjnych. Dolna granica TSH w I trymestrze bywa fizjologicznie obniżona (hCG, mając wspólną podjednostkę α z TSH, stymuluje tarczycę). CEL TERAPEUTYCZNY u pacjentki LECZONEJ lewotyroksyną w I trymestrze: < 2,5 mIU/L (NIE jest to próg diagnostyczny). Niewyrównana niedoczynność tarczycy w ciąży zwiększa ryzyko powikłań położniczych (poronienie, poród przedwczesny, nadciśnienie indukowane ciążą) i zaburzeń neurorozwojowych płodu. Kobiety leczone z powodu niedoczynności tarczycy zwykle wymagają zwiększenia dawki lewotyroksyny zaraz po potwierdzeniu ciąży — typowo o 25–30% (orientacyjnie +2 tabletki tygodniowo wg ATA 2017); monitorowanie TSH co 4–6 tygodni w I połowie ciąży.' },
            { id: 'ft4', note: 'Oznaczać gdy TSH nieprawidłowe. Interpretować wg zakresów trymestr-specyficznych — fT4 fizjologicznie nieco spada w II i III trymestrze.', description: 'fT4 (wolna tyroksyna) — oznaczana gdy TSH jest nieprawidłowe lub przy podejrzeniu zaburzeń czynności tarczycy. W ciąży fT4 należy interpretować wg zakresów referencyjnych specyficznych dla trymestru — fizjologicznie fT4 nieznacznie spada w II i III trymestrze. Polskie wytyczne PTE 2021 zwracają uwagę, że niektóre metody immunochemiczne oznaczania fT4 są zawodne w ciąży (wpływ zmienionego stężenia białek wiążących, m.in. wzrost TBG) — w razie wątpliwości pomocne jest oznaczenie T4 całkowitej (z interpretacją wg zakresów ciążowych) lub metoda LC-MS/MS. Izolowana hipotyroksynemia (niskie fT4 przy prawidłowym TSH) — postępowanie zgodnie z PTE 2021.' },
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO', note: 'Wykrycie autoimmunologicznej choroby tarczycy. Dodatnie anty-TPO zwiększają ryzyko niedoczynności tarczycy w ciąży i poporodowego zapalenia tarczycy.', description: 'Przeciwciała przeciwko peroksydazie tarczycowej (anty-TPO) — marker autoimmunologicznej choroby tarczycy. W ciąży dodatni wynik ma istotne znaczenie: (1) zwiększa ryzyko rozwoju lub nasilenia niedoczynności tarczycy w trakcie ciąży — kobiety z dodatnimi anty-TPO wymagają częstszego monitorowania TSH (co ~4–6 tygodni); (2) zwiększa ryzyko poporodowego zapalenia tarczycy; (3) wiąże się ze zwiększonym ryzykiem poronienia i porodu przedwczesnego. Wg PTE 2021 oznaczenie anty-TPO jest wskazane m.in. u kobiet z TSH w górnym zakresie normy, z wywiadem chorób tarczycy, poronień lub porodów przedwczesnych.' }
          ]
        },
        { name: 'Skrining cukrzycy ciążowej (GDM)',
          tests: [
            { ext: 'glucose_fasting', label: 'Glukoza na czczo', note: 'Oznaczenie przy pierwszej wizycie położniczej — wykrycie cukrzycy przedciążowej lub wczesnej cukrzycy ciążowej. Glukoza na czczo ≥ 92 mg/dL w ciąży → cukrzyca ciążowa.', description: 'Glukoza na czczo — oznaczana przy pierwszej wizycie położniczej u każdej ciężarnej (skrining wczesny). Cele: wykrycie cukrzycy przedciążowej nierozpoznanej przed ciążą oraz wczesnej cukrzycy ciążowej. Interpretacja w ciąży (kryteria PTD / WHO 2013, przyjęte w Polsce): glukoza na czczo 92–125 mg/dL → cukrzyca ciążowa (GDM); ≥ 126 mg/dL (lub przygodna ≥ 200 mg/dL, lub HbA1c ≥ 6,5%) → cukrzyca w ciąży (najpewniej przedciążowa, nierozpoznana). Prawidłowa glukoza na czczo na początku ciąży NIE zwalnia z wykonania oGTT w 24.–28. tygodniu.' },
            { ext: 'ogtt_75g_pregnancy', label: 'oGTT 75 g (24.–28. tydzień ciąży)', note: 'Standardowy test skriningu cukrzycy ciążowej. Pomiar glikemii 0 / 60 / 120 min. Jedna nieprawidłowa wartość wystarcza do rozpoznania GDM.', description: 'Doustny test obciążenia 75 g glukozy — standardowy skrining cukrzycy ciążowej (GDM), wykonywany u wszystkich ciężarnych w 24.–28. tygodniu ciąży (u kobiet z czynnikami ryzyka — wcześniej, już w I trymestrze). Pomiar glikemii: na czczo (0), po 60 min i po 120 min. Kryteria rozpoznania GDM (PTD / WHO 2013, obowiązujące w Polsce): na czczo ≥ 92 mg/dL (5,1 mmol/L); po 60 min ≥ 180 mg/dL (10,0 mmol/L); po 120 min ≥ 153 mg/dL (8,5 mmol/L). JEDNA nieprawidłowa wartość wystarcza do rozpoznania cukrzycy ciążowej. Test wykonuje się rano, na czczo (8–14 h od ostatniego posiłku), po ≥ 3 dniach zwykłej diety bez ograniczeń węglowodanów.' }
          ]
        },
        { name: 'Diagnostyka wczesnej ciąży i zagrożeń',
          tests: [
            { ext: 'bhcg', label: 'β-hCG (ilościowy)', note: 'Potwierdzenie i monitorowanie wczesnej ciąży. Dynamika β-hCG (podwojenie co ~48–72 h) różnicuje ciążę prawidłową, pozamaciczną i poronienie zagrażające.', description: 'β-hCG (ilościowy) — potwierdzenie i monitorowanie wczesnej ciąży. Dynamika β-hCG: w prawidłowej ciąży wewnątrzmacicznej stężenie podwaja się co ~48–72 h we wczesnym okresie. Nieprawidłowy przyrost (lub spadek) sugeruje ciążę pozamaciczną lub poronienie zagrażające/dokonane — wymaga korelacji z USG. Bardzo wysokie wartości β-hCG → podejrzenie ciąży mnogiej lub ciążowej choroby trofoblastycznej (zaśniad groniasty). Wartość β-hCG ~1500–2000 IU/L to tzw. strefa dyskryminacyjna — powyżej tego progu pęcherzyk ciążowy powinien być widoczny w USG przezpochwowym (część nowszych źródeł stosuje wyższy, ostrożniejszy próg — nawet ~3500 IU/L — aby uniknąć przedwczesnej interwencji w żywej, zbyt wcześnie zobrazowanej ciąży wewnątrzmacicznej).' },
            { id: 'progesterone', note: 'Badanie o ograniczonej wartości — nie zalecane rutynowo. W wybranych sytuacjach: ocena żywotności wczesnej ciąży łącznie z β-hCG i USG, poronienia nawracające.', description: 'Progesteron we wczesnej ciąży — badanie o ograniczonej wartości diagnostycznej, NIE zalecane rutynowo (brak jednoznacznych progów decyzyjnych). W wybranych sytuacjach klinicznych może być pomocne: niski progesteron we wczesnej ciąży (orientacyjnie < ~16 nmol/L / 5 ng/mL) — łącznie z niskim/nieprawidłowo rosnącym β-hCG i obrazem USG — wspiera podejrzenie nieżywotnej ciąży (poronienie, ciąża pozamaciczna). Stosowany także w kontekście kwalifikacji do suplementacji progesteronem w poronieniach nawracających. Pojedynczy pomiar progesteronu nie powinien być podstawą decyzji terapeutycznych.' },
            { ext: 'pregnancy_us', label: 'USG położnicze', note: 'Datowanie ciąży, ocena żywotności i lokalizacji (wykluczenie ciąży pozamacicznej), dobrostan płodu, liczba płodów.', description: 'USG położnicze — podstawowe badanie obrazowe w ciąży. We wczesnej ciąży: potwierdzenie ciąży wewnątrzmacicznej (wykluczenie ciąży pozamacicznej), ocena żywotności (czynność serca płodu od ~6. tygodnia), datowanie ciąży (długość ciemieniowo-siedzeniowa CRL w I trymestrze — najdokładniejsze datowanie), liczba płodów i kosmówkowość w ciąży mnogiej. W dalszym przebiegu: ocena wzrastania płodu, anatomii (USG połówkowe 18.–22. tydzień), łożyska, ilości płynu owodniowego, dobrostanu płodu.' }
          ]
        },
        { name: 'Pułapki interpretacyjne',
          tests: [
            { id: 'prolactin', note: 'W ciąży prolaktyna FIZJOLOGICZNIE znacznie wzrasta (do ~200–400 ng/mL pod koniec ciąży) — NIE oznaczać rutynowo ani interpretować wg zakresów nieciążowych.', description: 'Prolaktyna w ciąży — pod wpływem rosnącego stężenia estrogenów prolaktyna FIZJOLOGICZNIE znacznie wzrasta w czasie ciąży, osiągając pod jej koniec wartości rzędu ~200–400 ng/mL (przygotowanie gruczołów piersiowych do laktacji). Z tego powodu prolaktyny NIE należy oznaczać rutynowo w ciąży ani interpretować wg zakresów nieciążowych — „nieprawidłowo wysoki" wynik jest tu zjawiskiem fizjologicznym, a nie patologią. Wyjątkowo, u kobiet z wcześniej rozpoznanym gruczolakiem prolaktynowym, monitorowanie w ciąży prowadzi się głównie klinicznie (objawy ucisku, pole widzenia), nie poprzez rutynowy pomiar prolaktyny.' }
          ]
        }
      ],
      guideline: 'PTE 2021 (tarczyca w ciąży, Hubalewska-Dydejczyk i wsp.) / PTGiP / PTD (cukrzyca ciążowa)',
      sources: [
        'Hubalewska-Dydejczyk A, Trofimiuk-Müldner M, Ruchała M i wsp. Thyroid diseases and pregnancy: guidelines of the Polish Society of Endocrinology. Endokrynologia Polska. 2021;72(5):425-488.',
        'Polskie Towarzystwo Ginekologów i Położników. Rekomendacje PTGiP dotyczące opieki nad ciążą o przebiegu prawidłowym.',
        'Polskie Towarzystwo Diabetologiczne. Zalecenia kliniczne dotyczące postępowania u chorych na cukrzycę — cukrzyca a planowanie ciąży i ciąża (aktualizacje coroczne).',
        'World Health Organization. Diagnostic criteria and classification of hyperglycaemia first detected in pregnancy. Geneva: WHO; 2013.',
        'Alexander EK, Pearce EN, Brent GA, et al. 2017 Guidelines of the American Thyroid Association for the Diagnosis and Management of Thyroid Disease During Pregnancy and the Postpartum. Thyroid. 2017;27(3):315-389.'
      ]
    },

    gynecomastia: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Ginekomastia — rozrost tkanki gruczołowej piersi u mężczyzny (odróżnić od lipomastii — nagromadzenia tłuszczu bez rozrostu gruczołu). Mechanizm: przewaga działania estrogenowego nad androgenowym (bezwzględne lub względne).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najpierw wykluczyć (przed diagnostyką hormonalną)',
            items: [
              { label: 'Ginekomastia fizjologiczna', text: 'noworodkowa, pokwitaniowa, starcza — zwykle nie wymaga rozległej diagnostyki' },
              {
                label: 'Ginekomastia polekowa',
                text: 'szczegółowy wywiad lekowy — częste przyczyny:',
                detail: [
                  'Leki antyandrogenowe: spironolakton, finasteryd, flutamid, bikalutamid, octan cyproteronu.',
                  'Leki działające na receptor estrogenowy / aromatazę: estrogeny (też w preparatach złożonych), niektóre fitoestrogeny, digoksyna.',
                  'Leki psychiatryczne: neuroleptyki (przez hiperprolaktynemię), niektóre leki przeciwdepresyjne.',
                  'Inhibitory pompy protonowej (omeprazol i pochodne) — rzadziej.',
                  'Substancje uzależniające i suplementy: sterydy anaboliczne (po odstawieniu — wskutek przewagi aromatyzacji), opioidy, alkohol, marihuana.',
                  'Inne: ketokonazol, cymetydyna, antagoniści kanału wapniowego, izoniazyd, metronidazol, HAART.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Wskazania do diagnostyki hormonalnej',
            items: [
              { label: 'Tak — diagnozować', text: 'ginekomastia świeża, bolesna, > 4 cm, szybko narastająca, asymetryczna lub przy nieprawidłowościach w badaniu jąder (asymetria, guzek).' },
              { label: 'Nie — zwykle nie wymaga', text: 'ginekomastia długotrwała, stabilna, bezbolesna, bez objawów alarmowych.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Algorytm diagnostyczny',
            items: [
              '(1) Panel hormonalny: testosteron całkowity, estradiol, LH, FSH, prolaktyna, β-hCG.',
              '(2) Wykluczenie przyczyn ogólnoustrojowych: tarczyca (TSH), wątroba (ALAT/ASPAT), nerki (kreatynina/eGFR).',
              '(3) Obrazowanie ukierunkowane na wzorzec hormonalny: USG jąder, TK nadnerczy.',
              '(4) Diagnostyka pogłębiona przy podejrzeniu zespołu Klinefeltera (kariotyp) lub guza pozagonadalnego.'
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel hormonalny podstawowy',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano, na czczo. Niski → hipogonadyzm (pierwotny lub wtórny); interpretacja łącznie z LH.' },
            { id: 'estradiol', note: 'Podwyższony → zwiększona aromatyzacja (otyłość, marskość wątroby, nadczynność tarczycy) lub guz produkujący estrogeny (jądro, nadnercze, guz hCG-zależny).' },
            { id: 'lh', note: 'Wzorzec: ↑LH + ↓testosteron → hipogonadyzm pierwotny; ↓/prawidłowy LH + ↓testosteron → hipogonadyzm wtórny; ↑LH + ↑testosteron → oporność na androgeny lub guz wydzielający LH.' },
            { id: 'fsh', note: 'Oznaczany razem z LH. Wysoki FSH+LH przy niskim testosteronie → hipogonadyzm pierwotny (m.in. zespół Klinefeltera).' },
            { id: 'prolactin', note: 'Rzadko bezpośrednia przyczyna ginekomastii; podwyższona prolaktyna → hiperprolaktynemia prowadząca do wtórnego hipogonadyzmu.' },
            { ext: 'bhcg', label: 'β-hCG (ilościowy)', note: 'Podwyższony → guz germinalny jądra lub guz pozagonadalny hCG-produkujący (płuco, wątroba) — wymaga pilnego obrazowania.', description: 'β-hCG (ilościowy) w diagnostyce ginekomastii — podwyższone stężenie wskazuje na guz produkujący hCG. hCG ma słabe działanie podobne do LH — stymuluje komórki Leydiga jądra do produkcji testosteronu, ale również nasila aromatyzację do estradiolu, co prowadzi do ginekomastii. Źródła: guzy germinalne jądra (najczęściej — nieseminomalne guzy zarodkowe), rzadziej guzy pozagonadalne hCG-produkujące (rak płuca, wątroby, guzy zarodkowe śródpiersia). Każdy podwyższony β-hCG u mężczyzny z ginekomastią wymaga pilnego USG jąder oraz, przy ujemnym USG, poszukiwania guza pozagonadalnego (TK klatki piersiowej i jamy brzusznej).' }
          ]
        },
        { name: 'Wykluczenie przyczyn ogólnoustrojowych',
          tests: [
            { id: 'tsh', note: 'Wykluczenie nadczynności tarczycy — zwiększa obwodową aromatyzację androgenów do estrogenów oraz stężenie SHBG.' },
            { ext: 'liver_gyneco', label: 'ALAT, ASPAT (funkcja wątroby)', note: 'Marskość wątroby zwiększa obwodową aromatyzację androgenów do estrogenów — częsta przyczyna ginekomastii.', description: 'Aminotransferazy (ALAT, ASPAT) — ocena funkcji wątroby w diagnostyce ginekomastii. Marskość wątroby jest częstą przyczyną ginekomastii patologicznej: uszkodzona wątroba nasila obwodową aromatyzację androgenów do estrogenów oraz zmniejsza klirens estrogenów, dodatkowo wzrasta SHBG (wiąże preferencyjnie testosteron), co przesuwa równowagę w kierunku przewagi estrogenowej. Przy nieprawidłowych wynikach lub klinicznych cechach choroby wątroby — pełna diagnostyka hepatologiczna.' },
            { ext: 'egfr', label: 'Kreatynina + eGFR', note: 'Przewlekła choroba nerek jest przyczyną ginekomastii — poprzez zaburzenia osi podwzgórze-przysadka-gonady.', description: 'Kreatynina z obliczeniem eGFR — ocena funkcji nerek w diagnostyce ginekomastii. Przewlekła choroba nerek (zwłaszcza w stadium zaawansowanym oraz u pacjentów dializowanych) jest przyczyną ginekomastii poprzez zaburzenia osi podwzgórze-przysadka-gonady: obniżone stężenie testosteronu, podwyższony LH (oporność komórek Leydiga oraz upośledzony klirens nerkowy gonadotropin), hiperprolaktynemia wynikająca z upośledzonego klirensu nerkowego prolaktyny. Efektem jest przewaga działania estrogenowego nad androgenowym. Ginekomastia bywa też obserwowana po rozpoczęciu dializoterapii — mechanizmem zbliżonym do ginekomastii z ponownego odżywienia (refeeding gynecomastia).' }
          ]
        },
        { name: 'Obrazowanie (zależnie od wzorca hormonalnego)',
          tests: [
            { ext: 'testicular_us', label: 'USG jąder', note: 'Gdy nieprawidłowości w badaniu jąder (asymetria, guzek), podwyższone β-hCG, podwyższony estradiol lub wzrost LH.', description: 'USG jąder — badanie obrazowe pierwszego rzutu przy podejrzeniu guza jądra jako przyczyny ginekomastii. Wskazania: wyczuwalna asymetria lub guzek jądra w badaniu palpacyjnym, podwyższone β-hCG, podwyższony estradiol przy niejednoznacznym wzorcu hormonalnym, lub wzrost LH. Guzy jądra powodujące ginekomastię: guzy z komórek Leydiga i Sertoliego (produkujące estrogeny — zwykle łagodne, ale ~10% złośliwych), guzy germinalne (nieseminomalne — produkujące hCG). USG jąder ma wysoką czułość dla zmian ogniskowych — każdy guzek wymaga pilnej konsultacji urologicznej/onkologicznej.' },
            { ext: 'adrenal_ct_gyneco', label: 'TK nadnerczy wielofazowe z kontrastem', note: 'Gdy podwyższony estradiol i/lub DHEA-S sugerujące guz nadnercza produkujący estrogeny (rzadkie, częściej złośliwe).', description: 'TK nadnerczy wielofazowe z kontrastem — wskazane gdy obraz hormonalny (podwyższony estradiol, podwyższony DHEA-S) sugeruje guz nadnercza produkujący estrogeny lub prekursory steroidowe. Guzy nadnercza produkujące estrogeny u mężczyzn są bardzo rzadkie, ale charakteryzują się wysokim odsetkiem złośliwości (rak kory nadnercza, ACC) — dlatego wymagają pilnej diagnostyki. Protokół 4-fazowy (faza natywna + tętnicza + żylna + opóźniona z obliczeniem wash-out) pozwala różnicować gruczolak od raka kory nadnercza. Przy wymiarze guza > 4 cm i cechach złośliwości — kwalifikacja do operacji; NIE wykonywać biopsji przed wykluczeniem pheochromocytoma.' }
          ]
        },
        { name: 'Diagnostyka pogłębiona (sytuacje szczególne)',
          tests: [
            { id: 'shbg', note: 'Pomocnicze przy interpretacji testosteronu i estradiolu — pozwala ocenić frakcje wolne. Podwyższona w nadczynności tarczycy i marskości wątroby.' },
            { id: 'dhea_s', note: 'Przy podejrzeniu guza nadnercza produkującego steroidy. Znacznie podwyższony → silne podejrzenie guza nadnercza.' },
            { ext: 'karyotype', label: 'Kariotyp', note: 'Przy podejrzeniu zespołu Klinefeltera (47,XXY) — małe twarde jądra, wysoki LH/FSH, niski testosteron; najczęstsza genetyczna przyczyna ginekomastii patologicznej.', description: 'Kariotyp — wskazany przy podejrzeniu zespołu Klinefeltera (47,XXY lub mozaicyzm), który jest najczęstszą genetyczną przyczyną ginekomastii patologicznej. Obraz kliniczny sugerujący Klinefeltera: małe, twarde jądra (< 6 mL objętości), ginekomastia, eunuchoidalna budowa ciała, niepłodność, wysoki LH i FSH przy niskim/granicznym testosteronie (hipogonadyzm pierwotny hipergonadotropowy). Rozpoznanie zespołu Klinefeltera ma znaczenie nie tylko dla leczenia hipogonadyzmu, ale też ze względu na zwiększone ryzyko raka piersi u tych mężczyzn (~20–50× wyższe niż w populacji ogólnej) oraz innych chorób towarzyszących.' }
          ]
        }
      ],
      guideline: 'Braunstein 2007 (NEJM) / Narula & Carlson 2014 (Nat Rev Endocrinol) / Zgliczyński (Wielka Interna)',
      sources: [
        'Braunstein GD. Gynecomastia. N Engl J Med. 2007;357(12):1229-1237.',
        'Narula HS, Carlson HE. Gynaecomastia — pathophysiology, diagnosis and treatment. Nat Rev Endocrinol. 2014;10(11):684-698.',
        'Dickson G. Gynecomastia. Am Fam Physician. 2012;85(7):716-722.',
        'Bhasin S, Brito JP, Cunningham GR, et al. Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(5):1715-1744.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska.'
      ]
    },

    precocious_puberty: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kryteria PTEDD',
            body: 'Przedwczesne dojrzewanie płciowe (PDP) — wg kryteriów polskich (PTEDD) rozwój drugorzędowych cech płciowych PRZED 8. rokiem życia u dziewczynek i PRZED 9. rokiem życia u chłopców (u chłopców — powiększenie jąder ≥ 4 mL). Klasyfikacja na podstawie zależności od GnRH: postać centralna (GnRH-zależna) — przedwczesna aktywacja osi podwzgórze-przysadka-gonady; postać obwodowa (GnRH-niezależna, przedwczesne dojrzewanie rzekome) — źródło steroidów płciowych gonadalne, nadnerczowe lub egzogenne, niezależne od GnRH.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Klasyfikacja',
            items: [
              {
                label: 'Centralna (GnRH-zależna)',
                text: 'przedwczesna aktywacja osi podwzgórze-przysadka-gonady:',
                detail: [
                  'U DZIEWCZYNEK — w większości przypadków idiopatyczna; zmiany organiczne OUN rzadkie, zwłaszcza > 6. r.ż.',
                  'U CHŁOPCÓW — znacznie częściej ma podłoże organiczne; wymagane aktywne poszukiwanie przyczyny.',
                  'MRI podwzgórzowo-przysadkowe: obowiązkowe u wszystkich chłopców z CPP; u dziewczynek selektywnie — bezwzględnie < 6. r.ż., przy objawach neurologicznych, bólach głowy lub szybkiej progresji.',
                  'Najczęstsze zmiany organiczne: hamartoma guza popielatego (najczęstsza), glejaki (m.in. NF1), inne guzy okolicy, wodogłowie, następstwa urazu/radioterapii.',
                  'Złoty standard potwierdzenia: test stymulacji GnRH — szczytowe LH ≥ ~5 IU/L po podaniu GnRH (próg zależny od metody).'
                ]
              },
              {
                label: 'Obwodowa (GnRH-niezależna, rzekoma)',
                text: 'źródło steroidów płciowych niezależne od osi GnRH:',
                detail: [
                  'Wrodzony przerost nadnerczy (WPN) z niedoboru 21-hydroksylazy — częsta przyczyna u dziewczynek (wirylizacja, przedwczesne pubarche) i chłopców.',
                  'Guzy nadnerczy produkujące androgeny lub estrogeny (rzadkie, ale wymagają pilnej diagnostyki — wysoki odsetek złośliwych).',
                  'Guzy gonad: u dziewczynek — torbiele lub guzy jajnika produkujące estrogeny; u chłopców — guzy z komórek Leydiga jądra (produkcja testosteronu).',
                  'Guzy wydzielające hCG (germinalne — szyszynka, jądra, wątroba, śródpiersie) — u chłopców powodują obwodowe dojrzewanie (hCG stymuluje komórki Leydiga); β-hCG do oznaczenia w każdym PDP.',
                  'Zespół McCune-Albrighta (mutacja GNAS, plamy café-au-lait, dysplazja włóknista) — autonomiczna aktywacja jajników.',
                  'Ciężka, długotrwała pierwotna niedoczynność tarczycy → zespół Van Wyka-Grumbacha (paradoks: cechy dojrzewania przy OPÓŹNIONYM wieku kostnym — odwracalne po wyrównaniu).',
                  'Egzogenne źródła steroidów (kremy hormonalne, sterydy anaboliczne, preparaty estrogenowe).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Łagodne warianty rozwoju — NIE pełnoobjawowe PDP',
            items: [
              { label: 'Izolowane przedwczesne thelarche', text: 'samo powiększenie piersi bez innych cech dojrzewania, bez przyspieszenia wzrostu i wieku kostnego — łagodny wariant rozwoju, zwykle nie wymaga rozległej diagnostyki, konieczna obserwacja.' },
              {
                label: 'Izolowane przedwczesne pubarche → adrenarche praecox',
                text: 'samo owłosienie łonowe — najczęściej objaw przedwczesnego adrenarche (zwykle u dziewcząt 6.–8. r.ż.); wymaga podstawowej diagnostyki:',
                detail: [
                  'DHEA-S — umiarkowanie podwyższony potwierdza adrenarche.',
                  '17-OH-progesteron — wykluczenie nieklasycznego WPN (NCAH); pobranie rano.',
                  'Wiek kostny — w adrenarche zwykle prawidłowy lub TYLKO NIEZNACZNIE przyspieszony.',
                  'Cechy atypowe wymagające pogłębienia (poszukiwanie guza): szybka progresja, wirylizacja, znacznie zaawansowany wiek kostny, znacznie podwyższone androgeny.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny',
            items: [
              '(1) Potwierdzenie i klasyfikacja: test stymulacji GnRH (centralne vs obwodowe) + β-hCG zawsze (szczególnie u chłopców).',
              '(2) Ocena zaawansowania: RTG ocena wieku kostnego + obrazowanie — u dziewcząt USG narządów rodnych; u chłopców USG jąder i nadnerczy; MRI podwzgórzowo-przysadkowe wg wskazań.',
              '(3) Przy postaci obwodowej — poszukiwanie źródła steroidów: 17-OH-progesteron (wykluczenie WPN), DHEA-S, androstendion, kortyzol/ACTH, TK nadnerczy gdy obraz hormonalny sugeruje guz.'
            ]
          }
        ]
      },
      sections: [
        { name: 'Potwierdzenie i klasyfikacja (centralne vs obwodowe)',
          tests: [
            { id: 'lh', note: 'LH podstawowe oznaczane metodą ultraczułą — wartość w zakresie pokwitaniowym wspiera rozpoznanie postaci centralnej (GnRH-zależnej). We wczesnej fazie LH podstawowe może być jeszcze przedpokwitaniowe — wynik prawidłowy nie wyklucza CPP, wtedy rozstrzyga test stymulacji GnRH.' },
            { id: 'fsh', note: 'Oznaczany razem z LH. W postaci centralnej rośnie wraz z LH; sam FSH ma mniejszą wartość różnicującą — kluczowa jest odpowiedź LH.' },
            { id: 'estradiol', note: 'Dziewczynki — stężenie pokwitaniowe wspiera rozpoznanie PDP. Bardzo wysoki estradiol przy zahamowanych gonadotropinach → postać obwodowa (torbiel lub guz jajnika, zespół McCune-Albrighta).' },
            { id: 'testosterone_total', note: 'Chłopcy — stężenie pokwitaniowe wspiera rozpoznanie PDP. Wysoki testosteron przy zahamowanych gonadotropinach → postać obwodowa (WPN, guz nadnercza lub jądra, guz wydzielający hCG).' },
            { ext: 'gnrh_test', label: 'Test stymulacji GnRH (LHRH)', note: 'Złoty standard potwierdzenia i klasyfikacji PDP. Pokwitaniowa odpowiedź LH (szczytowe LH ≥ ~5 IU/L — próg zależny od metody oznaczania) potwierdza postać centralną (GnRH-zależną); brak odpowiedzi LH przy obecnych cechach dojrzewania → postać obwodowa.', description: 'Test stymulacji GnRH (LHRH) — kluczowe badanie różnicujące centralne i obwodowe przedwczesne dojrzewanie. Po dożylnym podaniu GnRH lub jego analogu oznacza się LH i FSH w punktach czasowych (zwykle 0, 30, 60 min). Interpretacja: pokwitaniowy wzrost LH — szczytowe LH ≥ ~5 IU/L (próg zależny od metody; nowoczesne testy immunochemiluminescencyjne mają niższe progi niż starsze metody RIA) — potwierdza przedwczesne dojrzewanie centralne (aktywacja osi podwzgórze-przysadka-gonady). Brak pokwitaniowej odpowiedzi LH u dziecka z cechami dojrzewania wskazuje na postać obwodową (GnRH-niezależną). Pomocniczo ocenia się stosunek szczytowego LH do FSH (przewaga LH przemawia za postacią centralną). U dzieci z jednoznacznie pokwitaniowym LH podstawowym (metoda ultraczuła) test bywa niekonieczny.' },
            { id: 'tsh', note: 'Wykluczenie ciężkiej, długotrwałej pierwotnej niedoczynności tarczycy — zespół Van Wyka-Grumbacha — rzadkiej, ale odwracalnej przyczyny przedwczesnego dojrzewania. Charakterystyczny paradoks: cechy dojrzewania przy OPÓŹNIONYM (nie przyspieszonym) wieku kostnym.' },
            { ext: 'bhcg', label: 'β-hCG (ilościowy)', note: 'Zalecane do oznaczenia w każdym przypadku przedwczesnego dojrzewania, ze szczególnym znaczeniem u chłopców. Wykrycie guzów wydzielających hCG (guzy germinalne — m.in. wewnątrzczaszkowe, jąder, wątroby, śródpiersia). hCG działa podobnie do LH, stymulując komórki Leydiga u chłopców → obwodowe przedwczesne dojrzewanie u chłopców.', description: 'β-hCG (ilościowy) w diagnostyce przedwczesnego dojrzewania — podwyższone stężenie wskazuje na guz wydzielający ludzką gonadotropinę kosmówkową. hCG ma działanie podobne do LH: u chłopców stymuluje komórki Leydiga jądra do produkcji testosteronu, dając obwodowe przedwczesne dojrzewanie (powiększenie prącia i owłosienia bez proporcjonalnego powiększenia jąder); u dziewczynek hCG samodzielnie nie wywołuje dojrzewania. Źródła: guzy germinalne wewnątrzczaszkowe (okolica szyszynki — mogą dawać też objawy neurologiczne), guzy germinalne jąder, wątroby, śródpiersia i przestrzeni zaotrzewnowej. Podwyższony β-hCG u chłopca z przedwczesnym dojrzewaniem wymaga poszukiwania guza pierwotnego (obrazowanie OUN, jąder, jamy brzusznej i klatki piersiowej).' }
          ]
        },
        { name: 'Ocena zaawansowania i obrazowanie',
          tests: [
            { ext: 'bone_age', label: 'RTG ocena wieku kostnego', note: 'W przedwczesnym dojrzewaniu wiek kostny jest zwykle przyspieszony względem wieku metrykalnego (działanie steroidów płciowych) — odzwierciedla tempo procesu i służy prognozie wzrostu ostatecznego. WYJĄTEK: w zespole Van Wyka-Grumbacha wiek kostny jest opóźniony.', description: 'RTG oceny wieku kostnego metodą Greulicha-Pyle (zdjęcie dłoni ręki niedominującej) — w diagnostyce przedwczesnego dojrzewania ocenia stopień zaawansowania i tempo procesu. Steroidy płciowe przyspieszają dojrzewanie kości, dlatego w PDP wiek kostny jest zwykle znacznie przyspieszony względem wieku metrykalnego; znaczna akceleracja i szybka progresja są argumentem za wdrożeniem leczenia hamującego — w postaci centralnej (CPP) stosuje się analogi GnRH, natomiast w postaci obwodowej leczenie kieruje się na źródło steroidów płciowych (analogi GnRH są tu nieskuteczne). Wiek kostny służy też prognozie wzrostu ostatecznego — przedwczesne dojrzewanie bez leczenia prowadzi do wczesnego zarośnięcia chrząstek wzrostowych i niskiego wzrostu ostatecznego mimo przejściowo wysokiego tempa wzrastania. WYJĄTEK diagnostyczny: w zespole Van Wyka-Grumbacha (ciężka niedoczynność tarczycy) wiek kostny jest opóźniony — co odróżnia go od pozostałych postaci PDP.' },
            { ext: 'pituitary_mri', label: 'MRI podwzgórzowo-przysadkowe', note: 'Wskazane przy potwierdzonej postaci centralnej (CPP) — wykrycie zmian organicznych OUN. Wg PTEDD/ESPE: obowiązkowe u wszystkich chłopców z CPP; u dziewczynek szczególnie < 6. r.ż. lub przy objawach neurologicznych albo szybkiej progresji — u dziewczynek 6–8 lat odsetek zmian organicznych jest niski (przeważnie postać idiopatyczna).', description: 'MRI okolicy podwzgórzowo-przysadkowej z kontrastem — w diagnostyce centralnego przedwczesnego dojrzewania służy wykryciu zmian organicznych ośrodkowego układu nerwowego odpowiedzialnych za przedwczesną aktywację osi: hamartoma guza popielatego (najczęstsza zmiana organiczna), glejaki (m.in. w przebiegu nerwiakowłókniakowatości typu 1), inne guzy okolicy, wodogłowie, następstwa urazu lub radioterapii. Wskazania wg PTEDD/ESPE: badanie obowiązkowe u wszystkich chłopców z CPP (wysoki odsetek podłoża organicznego); u dziewczynek wskazania są selektywne — bezwzględne przy wieku < 6 lat, objawach neurologicznych, bólach głowy lub szybkiej progresji, natomiast u dziewczynek w wieku 6–8 lat bez objawów neurologicznych odsetek zmian organicznych jest niski (postać przeważnie idiopatyczna) i decyzję o MRI podejmuje się indywidualnie.' },
            { ext: 'chorionic_us', label: 'USG narządów rodnych / miednicy', note: 'Dziewczynki — w postaci centralnej macica i jajniki ulegają powiększeniu (dojrzewaniu); izolowana duża torbiel lub guz jajnika sugeruje postać obwodową. U chłopców obrazowanie ukierunkowane na jądra (asymetria, guz) i nadnercza.', description: 'USG narządów rodnych i miednicy (u dzieci zwykle przezbrzuszne, z wypełnionym pęcherzem moczowym) — w diagnostyce przedwczesnego dojrzewania u dziewczynek ocenia: wielkość i kształt macicy (w dojrzewaniu macica powiększa się, zmienia kształt na gruszkowaty, pojawia się echo endometrium), objętość jajników i obecność pęcherzyków. Obraz dojrzewający macicy i jajników wspiera rozpoznanie postaci centralnej; izolowana duża torbiel jajnika lub guz jajnika przemawia za postacią obwodową (m.in. zespół McCune-Albrighta, guz wydzielający estrogeny). U chłopców badanie obrazowe ukierunkowuje się na ocenę jąder (asymetria, guz z komórek Leydiga) oraz nadnerczy.' }
          ]
        },
        { name: 'Diagnostyka przyczyn obwodowych (gdy GnRH-niezależne)',
          tests: [
            { id: 'oh17_progesterone', note: 'Wykluczenie wrodzonego przerostu nadnerczy (klasycznego i nieklasycznego) — niedobór 21-hydroksylazy jest częstą przyczyną obwodowego przedwczesnego dojrzewania (przedwczesne pubarche, wirylizacja). Pobranie rano.' },
            { id: 'dhea_s', note: 'Marker steroidogenezy nadnerczowej. Znacznie podwyższony DHEA-S → poszukiwanie guza nadnercza lub WPN; umiarkowanie podwyższony — przedwczesne adrenarche.' },
            { id: 'androstenedione', note: 'Androgen pośredni — podwyższony we wrodzonym przeroście nadnerczy oraz w guzach nadnerczy lub gonad produkujących androgeny.' },
            { id: 'cortisol', note: 'Ocena czynności kory nadnerczy — element diagnostyki przy podejrzeniu guza nadnercza lub wrodzonego przerostu nadnerczy.' },
            { id: 'acth', note: 'Oznaczany łącznie z kortyzolem — różnicowanie ACTH-zależnych i ACTH-niezależnych zaburzeń nadnerczowych.' },
            { ext: 'adrenal_ct', label: 'TK nadnerczy', note: 'Obrazowanie nadnerczy przy podejrzeniu guza produkującego androgeny lub estrogeny — wskazane zwłaszcza przy znacznie podwyższonych androgenach nadnerczowych (DHEA-S, androstendion) lub estradiolu z zahamowanymi gonadotropinami.', description: 'Tomografia komputerowa nadnerczy — badanie obrazowe przy podejrzeniu guza nadnercza jako przyczyny obwodowego przedwczesnego dojrzewania. Wskazania: znacznie podwyższone androgeny pochodzenia nadnerczowego (DHEA-S, androstendion) lub estrogeny przy zahamowanych gonadotropinach, sugerujące guz wirylizujący lub feminizujący kory nadnerczy. TK daje dobrą rozdzielczość przestrzenną i pozwala scharakteryzować zmianę; u dzieci należy uwzględnić narażenie na promieniowanie jonizujące i rozważyć MRI jako alternatywę. Guzy nadnerczy produkujące hormony płciowe u dzieci są rzadkie, ale wymagają pilnej diagnostyki onkologicznej.' }
          ]
        }
      ],
      guideline: 'PTEDD (Polskie Towarzystwo Endokrynologii i Diabetologii Dziecięcej) / ESPE',
      sources: [
        'Rekomendacje Polskiego Towarzystwa Endokrynologii i Diabetologii Dziecięcej (PTEDD) dotyczące diagnostyki i leczenia przedwczesnego dojrzewania płciowego.',
        'Carel JC, Léger J. Clinical practice. Precocious puberty. N Engl J Med. 2008;358(22):2366-2377.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o zaburzeniach dojrzewania płciowego.'
      ]
    },

    delayed_puberty: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kryteria PTEDD',
            body: 'Opóźnione dojrzewanie płciowe — wg kryteriów polskich (PTEDD) brak rozwoju piersi u dziewczynek do 13. roku życia oraz brak powiększenia jąder (objętość < 4 mL) u chłopców do 14. roku życia. Klasyfikacja na podstawie gonadotropin (niskie/prawidłowe vs wysokie LH/FSH) różnicuje główne kategorie etiologiczne i decyduje o dalszej diagnostyce.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Trzy główne kategorie',
            items: [
              {
                label: 'CDGP — konstytucjonalne opóźnienie wzrastania i dojrzewania',
                text: 'najczęstsza przyczyna, zwłaszcza u chłopców — wariant prawidłowy:',
                detail: [
                  'Często dodatni wywiad rodzinny (rodzice/rodzeństwo z późnym dojrzewaniem).',
                  'Wiek kostny opóźniony i odpowiada w przybliżeniu wiekowi wzrostowemu dziecka.',
                  'Postępowanie zwykle wyczekujące — dojrzewanie ostatecznie postępuje samoistnie; wzrost ostateczny zwykle prawidłowy.',
                  'Wzór hormonalny: niskie LH/FSH przy niskim testosteronie/estradiolu (jak w trwałym HH) — pułapka diagnostyczna.'
                ]
              },
              {
                label: 'Hipogonadyzm hipogonadotropowy (niskie LH/FSH)',
                text: 'przyczyny czynnościowe/odwracalne lub trwałe wrodzone:',
                detail: [
                  'Czynnościowy/odwracalny: choroby przewlekłe (m.in. nieswoiste choroby jelit, mukowiscydoza, niedoczynność tarczycy, przewlekła choroba nerek), niedożywienie, zaburzenia odżywiania (anoreksja), intensywny wysiłek fizyczny, stres.',
                  'Trwały wrodzony: zespół Kallmanna (wrodzony izolowany niedobór GnRH z ANOSMIĄ — kluczowy objaw kierunkujący), izolowany IHH bez anosmii, wrodzona niedoczynność przysadki (mutacje genów PROP1, POU1F1).',
                  'Zmiany organiczne OUN: guzy okolicy podwzgórzowo-przysadkowej (czaszkogardlak, glejak, gruczolak), następstwa urazu, radioterapii, chorób naciekowych.'
                ]
              },
              {
                label: 'Hipogonadyzm hipergonadotropowy (wysokie LH/FSH)',
                text: 'pierwotna niewydolność gonad — wzorzec rozstrzygający:',
                detail: [
                  'Zespół Turnera (45,X lub mozaicyzm) u dziewcząt — najczęstsza chromosomalna przyczyna pierwotnej niewydolności jajników; często towarzyszy niedobór wzrostu.',
                  'Zespół Klinefeltera (47,XXY) u chłopców — najczęstsza przyczyna pierwotnego hipogonadyzmu męskiego; małe twarde jądra.',
                  'Jatrogenne: stan po chemioterapii (zwłaszcza alkilujące), radioterapii miednicy/jąder, operacjach gonad.',
                  'Inne genetyczne i autoimmunologiczne przyczyny pierwotnej niewydolności gonad — rzadziej.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Centralny dylemat diagnostyczny — CDGP vs trwały wrodzony HH',
            items: [
              { label: 'Brak jednego rozstrzygającego testu', text: 'obie postaci dają niskie gonadotropiny i niskie steroidy płciowe — wzorce hormonalne się NAKŁADAJĄ.' },
              {
                label: 'Co pomaga w różnicowaniu',
                text: 'łączna ocena wielu elementów + obserwacja w czasie:',
                detail: [
                  'Wywiad rodzinny — dodatni dla CDGP (rodzice/rodzeństwo z opóźnionym dojrzewaniem).',
                  'Inhibina B — ZACHOWANA w CDGP, NISKA lub nieoznaczalna w trwałym wrodzonym HH (jeden z lepszych pojedynczych parametrów różnicujących).',
                  'Badanie węchu (anosmia → zespół Kallmanna — przemawia za trwałym HH).',
                  'Obserwacja w czasie: w CDGP dojrzewanie ostatecznie postępuje; w trwałym HH nie ma spontanicznej aktywacji osi.'
                ]
              },
              { label: 'Test stymulacji GnRH — ograniczona wartość', text: 'pokwitaniowa odpowiedź LH sugeruje CDGP, słaba — trwały HH, ale zakresy odpowiedzi się NAKŁADAJĄ. Test nie pozwala jednoznacznie odróżnić CDGP od trwałego wrodzonego HH.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wykluczenie odwracalnych przyczyn wtórnych',
            items: [
              { label: 'Niedoczynność tarczycy', text: 'TSH + fT4 — ciężka, długotrwała niedoczynność opóźnia wzrastanie i dojrzewanie; po wyrównaniu hormonalnym proces zwykle nadrabia.' },
              { label: 'Hiperprolaktynemia', text: 'prolaktyna — hamuje pulsacyjne wydzielanie GnRH; częsta odwracalna przyczyna.' },
              { label: 'Celiakia — istotna przyczyna', text: 'anty-tTG IgA + IgA całkowite (oznaczenie IgA całkowitego konieczne — niedobór IgA fałszuje wynik anty-tTG IgA); nierozpoznana celiakia może opóźniać wzrastanie i dojrzewanie.' },
              { label: 'Niedożywienie i choroby przewlekłe', text: 'IGF-1 — łączna ocena osi somatotropowej i stanu odżywienia; niski IGF-1 wskazuje na niedobór GH lub czynnościowe opóźnienie.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy — różnicowanie postaci hipogonadyzmu',
          tests: [
            { id: 'lh', note: 'Kluczowy parametr różnicujący: niskie/prawidłowe LH (i FSH) → hipogonadyzm hipogonadotropowy lub CDGP; wysokie LH (i FSH) → hipogonadyzm hipergonadotropowy (pierwotna niewydolność gonad). Oznaczenie metodą ultraczułą.' },
            { id: 'fsh', note: 'Oznaczany razem z LH. Wysokie FSH (zwłaszcza nieproporcjonalnie do LH) wskazuje na pierwotną niewydolność gonad — m.in. zespół Turnera, zespół Klinefeltera, stan po chemio- lub radioterapii.' },
            { id: 'testosterone_total', note: 'Chłopcy — niski przy opóźnionym dojrzewaniu. Pobranie rano. Interpretować łącznie z LH/FSH: niski testosteron + niskie LH/FSH → postać hipogonadotropowa lub CDGP; niski testosteron + wysokie LH/FSH → postać hipergonadotropowa.' },
            { id: 'estradiol', note: 'Dziewczynki — niski przy opóźnionym dojrzewaniu. Interpretować łącznie z LH/FSH (analogicznie do testosteronu u chłopców).' },
            { id: 'inhibin_b', note: 'Marker czynności komórek Sertoliego (chłopcy) / ziarnistych (dziewczęta) — jeden z lepszych parametrów różnicujących CDGP od trwałego wrodzonego hipogonadyzmu hipogonadotropowego: w CDGP inhibina B jest zwykle zachowana, w trwałym HH — niska lub nieoznaczalna. Niska inhibina B przy wysokich gonadotropinach → pierwotna niewydolność gonad.' }
          ]
        },
        { name: 'Wykluczenie przyczyn wtórnych i czynnościowych',
          tests: [
            { id: 'tsh', note: 'Wykluczenie niedoczynności tarczycy — ciężka, długotrwała niedoczynność opóźnia wzrastanie i dojrzewanie płciowe.' },
            { id: 'ft4', note: 'Oznaczany łącznie z TSH przy ocenie czynności tarczycy.' },
            { id: 'prolactin', note: 'Wykluczenie hiperprolaktynemii — hamuje pulsacyjne wydzielanie GnRH i może opóźniać dojrzewanie.' },
            { id: 'igf1', note: 'Ocena osi somatotropowej i stanu odżywienia — niski IGF-1 może wskazywać na niedobór hormonu wzrostu (element niedoczynności przysadki) albo na niedożywienie lub chorobę przewlekłą jako czynnościową przyczynę opóźnienia.' },
            { ext: 'ttg_iga', label: 'Przeciwciała anty-tTG IgA + IgA całkowite', note: 'Przesiew w kierunku celiakii — nierozpoznana celiakia jest istotną, odwracalną przyczyną opóźnionego wzrastania i dojrzewania. Oznaczenie IgA całkowitego jest konieczne do wykluczenia niedoboru IgA, który dawałby fałszywie ujemny wynik anty-tTG IgA.' }
          ]
        },
        { name: 'Diagnostyka pogłębiona i obrazowanie',
          tests: [
            { ext: 'bone_age', label: 'RTG ocena wieku kostnego', note: 'W opóźnionym dojrzewaniu wiek kostny jest zwykle opóźniony względem wieku metrykalnego — typowe dla CDGP (gdzie odpowiada w przybliżeniu wiekowi wzrostowemu) i dla większości przyczyn opóźnienia. Służy też prognozie wzrostu ostatecznego.', description: 'RTG oceny wieku kostnego metodą Greulicha-Pyle (zdjęcie dłoni ręki niedominującej) — w diagnostyce opóźnionego dojrzewania wiek kostny jest zwykle opóźniony względem wieku metrykalnego. W konstytucjonalnym opóźnieniu (CDGP) wiek kostny jest opóźniony i odpowiada w przybliżeniu wiekowi wzrostowemu dziecka — co jest argumentem za korzystną prognozą wzrostu ostatecznego i postępowaniem wyczekującym. WAŻNE: sam stopień opóźnienia wieku kostnego NIE różnicuje CDGP od trwałego hipogonadyzmu — w obu stanach wiek kostny bywa opóźniony.' },
            { ext: 'karyotype', label: 'Kariotyp', note: 'Wskazany przy hipogonadyzmie hipergonadotropowym (wysokie LH/FSH) — wykrycie zespołu Turnera (45,X) u dziewcząt i zespołu Klinefeltera (47,XXY) u chłopców z opóźnionym dojrzewaniem.', description: 'Kariotyp — ocena chromosomów z hodowli limfocytów krwi obwodowej. W diagnostyce opóźnionego dojrzewania wskazany przede wszystkim przy obrazie hipogonadyzmu hipergonadotropowego (wysokie LH i FSH przy niskich steroidach płciowych), wskazującym na pierwotną niewydolność gonad. Najczęstsze rozpoznania: zespół Turnera (45,X i warianty/mozaicyzmy) u dziewcząt — częsta przyczyna pierwotnej niewydolności jajników i niedoboru wzrostu; zespół Klinefeltera (47,XXY) u chłopców — najczęstsza przyczyna pierwotnego hipogonadyzmu męskiego. Wynik opisuje się wg ISCN (International System for Cytogenetic Nomenclature).' },
            { ext: 'gnrh_test', label: 'Test stymulacji GnRH (LHRH)', note: 'Ocena rezerwy gonadotropowej przysadki: pokwitaniowa odpowiedź LH wskazuje na rozpoczynającą się aktywację osi (CDGP), słaba odpowiedź — na hipogonadyzm hipogonadotropowy. UWAGA: test ma OGRANICZONĄ zdolność jednoznacznego odróżnienia CDGP od trwałego wrodzonego HH — zakresy odpowiedzi nakładają się.', description: 'Test stymulacji GnRH (LHRH) — po dożylnym podaniu GnRH ocenia się wzrost LH i FSH. W diagnostyce opóźnionego dojrzewania służy ocenie rezerwy gonadotropowej przysadki: pokwitaniowa odpowiedź LH sugeruje rozpoczynającą się aktywację osi podwzgórze-przysadka-gonady (typowe dla konstytucjonalnego opóźnienia), a słaba lub przedpokwitaniowa odpowiedź przemawia za hipogonadyzmem hipogonadotropowym. ISTOTNE OGRANICZENIE: test nie pozwala jednoznacznie odróżnić CDGP od trwałego wrodzonego hipogonadyzmu hipogonadotropowego — zakresy odpowiedzi w obu stanach się nakładają, dlatego rozpoznanie często wymaga obserwacji w czasie oraz łącznej oceny z wywiadem rodzinnym, inhibiną B i badaniem węchu.' },
            { ext: 'hcg_test', label: 'Test stymulacji hCG', note: 'Chłopcy — ocena czynności komórek Leydiga jąder i potwierdzenie obecności czynnej tkanki jądrowej. Wzrost testosteronu po stymulacji hCG świadczy o sprawnych komórkach Leydiga; brak odpowiedzi → anorchia lub ciężkie uszkodzenie jąder.', description: 'Test stymulacji hCG — hCG działa na komórki Leydiga jąder podobnie jak LH. U chłopców z opóźnionym dojrzewaniem służy ocenie czynności komórek Leydiga i potwierdzeniu obecności czynnej tkanki jądrowej (m.in. przy obustronnym wnętrostwie lub podejrzeniu anorchii). Protokół: podanie hCG i pomiar testosteronu przed oraz po stymulacji. Interpretacja: znaczny wzrost testosteronu → sprawne komórki Leydiga (jądra obecne i czynne); brak odpowiedzi → anorchia, ciężkie uszkodzenie jąder lub zaburzenie biosyntezy testosteronu.' },
            { ext: 'pituitary_mri', label: 'MRI podwzgórzowo-przysadkowe', note: 'Wskazane gdy podejrzewa się trwały lub wrodzony hipogonadyzm hipogonadotropowy albo przyczynę organiczną OUN — nie rutynowo u każdego dziecka z niskimi gonadotropinami (większość ma CDGP). Cele: wykrycie guzów i zmian okolicy podwzgórzowo-przysadkowej oraz ocena opuszek węchowych (ich brak lub hipoplazja potwierdza zespół Kallmanna). Bezwzględnie wskazane przy objawach neurologicznych, bólach głowy lub zaburzeniach pola widzenia.', description: 'MRI okolicy podwzgórzowo-przysadkowej z kontrastem — w diagnostyce opóźnionego dojrzewania wskazane, gdy podejrzewa się trwały lub wrodzony hipogonadyzm hipogonadotropowy albo przyczynę organiczną OUN; nie jest natomiast rutynowo potrzebne u każdego dziecka z niskimi gonadotropinami, ponieważ większość z nich ma konstytucjonalne opóźnienie dojrzewania (CDGP). Cele: wykrycie guzów i zmian okolicy podwzgórzowo-przysadkowej (m.in. czaszkogardlak, glejak, gruczolak, zmiany naciekowe), ocena przysadki przy podejrzeniu jej niedoczynności oraz ocena opuszek i bruzd węchowych — ich brak lub hipoplazja potwierdza zespół Kallmanna (wrodzony hipogonadyzm hipogonadotropowy z anosmią). Badanie jest bezwzględnie wskazane przy współistniejących objawach neurologicznych, bólach głowy lub zaburzeniach pola widzenia.' }
          ]
        }
      ],
      guideline: 'PTEDD / ESPE',
      sources: [
        'Palmert MR, Dunkel L. Clinical practice. Delayed puberty. N Engl J Med. 2012;366(5):443-453.',
        'Rekomendacje Polskiego Towarzystwa Endokrynologii i Diabetologii Dziecięcej (PTEDD) dotyczące diagnostyki opóźnionego dojrzewania płciowego.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o zaburzeniach dojrzewania płciowego.'
      ]
    },

    /* ═══════════════════════════════════════════════════════════════
     *  TARCZYCA
     * ═══════════════════════════════════════════════════════════════ */

    hypothyroidism: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Niedoczynność tarczycy — niedostateczne wytwarzanie hormonów tarczycy. Podstawowe rozpoznanie opiera się na badaniach laboratoryjnych: TSH (najczulszy pojedynczy test, badanie I rzutu) oraz fT4 (różnicuje postać jawną od subklinicznej i wskazuje na postać wtórną/centralną).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Klasyfikacja (wg PTE / ATA)',
            items: [
              { label: 'Jawna', text: 'TSH podwyższone + fT4 obniżone.' },
              { label: 'Subkliniczna łagodna', text: 'TSH ~4–10 mIU/L + fT4 prawidłowe. Leczenie zwykle nie jest zalecane rutynowo — rozważyć przy: dodatnich anty-TPO, ciąży lub planowaniu prokreacji, niepłodności, objawach niedoczynności, u młodszych pacjentów. U osób starszych (> 70 r.ż.) OSTROŻNIE — fizjologicznie wyższa norma TSH (~6–7 mIU/L); bezkrytyczne leczenie może być szkodliwe (ryzyko migotania przedsionków, osteoporozy).' },
              { label: 'Subkliniczna znaczna', text: 'TSH > 10 mIU/L + fT4 prawidłowe (leczenie zalecane).' },
              { label: 'Wtórna/centralna', text: 'fT4 obniżone przy nieadekwatnie niskim lub prawidłowym TSH — rzadka, w chorobach przysadki.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'Choroba Hashimoto (autoimmunologiczne zapalenie tarczycy)',
                text: 'najczęstsza przyczyna w obszarach z prawidłową podażą jodu:',
                detail: [
                  'Anty-TPO — główny marker autoimmunologicznego zapalenia tarczycy (czułość ~90% w Hashimoto); dodatni wynik potwierdza etiologię autoimmunologiczną.',
                  'Anty-TG — marker uzupełniający; bywa jedynymi dodatnimi przeciwciałami u części pacjentów z Hashimoto.',
                  'USG tarczycy — w chorobie Hashimoto typowy obraz to hipoechogeniczność i niejednorodność miąższu; uwidacznia również wole i guzki wymagające dalszej oceny.',
                  'Predominacja u kobiet (~8:1) i częste współistnienie z innymi chorobami autoimmunologicznymi — cukrzyca typu 1, celiakia, choroba Addisona (APS-2 / zespół Schmidta), bielactwo, niedokrwistość Addisona-Biermera. Przy potwierdzonym Hashimoto warto rozważyć badania przesiewowe w kierunku tych asocjacji.'
                ]
              },
              {
                label: 'Jatrogenne',
                text: 'przyczyny indukowane leczeniem lub lekami:',
                detail: [
                  'Po tyreoidektomii (całkowitej lub częściowej) — najczęstsza jatrogenna przyczyna.',
                  'Po leczeniu ¹³¹I (RAI) — m.in. po chorobie Gravesa-Basedowa lub wolu guzkowatym toksycznym.',
                  'Po radioterapii okolicy szyi — m.in. w leczeniu chłoniaków, raka głowy i szyi.',
                  'Leki: lit (najczęściej w psychiatrii), amiodaron (zawiera jod), inhibitory kinaz tyrozynowych onkologiczne (sunitynib, sorafenib), immunoterapia onkologiczna (inhibitory punktów kontrolnych — m.in. niwolumab, pembrolizumab).'
                ]
              },
              { label: 'Niedobór jodu', text: 'rzadszy w Polsce po wdrożeniu profilaktyki jodowej (jodowanie soli kuchennej); pozostaje istotny globalnie.' },
              { label: 'Wrodzona niedoczynność tarczycy', text: 'wykrywana w przesiewie noworodkowym (osobne wskazanie — Polska: bibuła TSH w 3.–5. dobie życia).' },
              { label: 'Wtórna/centralna', text: 'rzadka — guzy okolicy podwzgórzowo-przysadkowej, niedoczynność wielohormonalna przysadki, zespół Sheehana, choroby naciekowe.' }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'baby-bottle',
            title: 'W ciąży',
            body: 'Obowiązują niższe, swoiste dla trymestru zakresy referencyjne TSH — optymalnie własne laboratoryjne, a gdy niedostępne — wg polskich wytycznych PTE 2021 (Hubalewska-Dydejczyk i wsp., elektrochemiluminescencja, polska populacja, tab. 2): I trymestr 0,01–3,18 mIU/L; II trymestr 0,05–3,44; III trymestr 0,11–3,53. Wartość TSH > 3,18 / 3,44 / 3,53 mIU/L (odpowiednio dla trymestru) świadczy o subklinicznej niedoczynności wymagającej leczenia (PTE 2021 wprost odstąpiło od progu ATA 2017 = 4,0). CEL TERAPEUTYCZNY u pacjentki LECZONEJ lewotyroksyną w I trymestrze: < 2,5 mIU/L (NIE jest to próg diagnostyczny). Niewyrównana niedoczynność tarczycy zwiększa ryzyko powikłań położniczych i zaburzeń neurorozwojowych płodu. Kobiety leczone lewotyroksyną zwykle wymagają ZWIĘKSZENIA dawki zaraz po potwierdzeniu ciąży — typowo o 25–30% (orientacyjnie +2 tabletki tygodniowo wg ATA 2017). Monitorowanie TSH co 4–6 tygodni w I połowie ciąży i co najmniej raz w II i III trymestrze.'
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'mood-kid',
            title: 'U dzieci',
            body: 'Zakresy referencyjne TSH i fT4 są zależne OD WIEKU — u noworodków i niemowląt znacznie wyższe niż u dorosłych. Nie wolno stosować progów dorosłych. Wrodzona niedoczynność tarczycy jest wykrywana w przesiewie noworodkowym (osobne wskazanie); u starszych dzieci niedoczynność wpływa przede wszystkim na wzrastanie i rozwój neurologiczny — wymaga oceny tempa wzrastania, wieku kostnego i rozwoju psychoruchowego.'
          }
        ]
      },
      sections: [
        { name: 'Rozpoznanie i klasyfikacja',
          tests: [
            { id: 'tsh',
              note: 'Badanie I rzutu w diagnostyce tarczycy — najczulszy pojedynczy test. Górna granica normy u dorosłych ~4 mIU/L (zależna od laboratorium i wieku — u osób starszych wyższa). UWAGA: w ciąży obowiązują niższe, swoiste dla trymestru zakresy, a u dzieci zakresy zależne od wieku — nie stosować progów dorosłych.',
              description: 'TSH jest najczulszym pojedynczym testem funkcji tarczycy — fizjologiczna pętla ujemnego sprzężenia zwrotnego sprawia, że nawet niewielkie zmiany fT4/fT3 powodują nieproporcjonalnie duże zmiany TSH (logarytmiczna zależność). W pierwotnej niedoczynności TSH jest podwyższone (próba kompensacji niskim poziomem hormonów obwodowych); w niedoczynności wtórnej/centralnej TSH jest nieadekwatnie prawidłowe lub niskie przy obniżonym fT4. PROGI DOROSŁYCH: górna granica normy laboratoryjnej zwykle ~4 mIU/L; u osób > 70 r.ż. fizjologicznie wyższa (do ~6–7 mIU/L) — bezkrytyczne leczenie subklinicznej niedoczynności w tej grupie wiekowej jest niewskazane (ryzyko jatrogennej nadczynności: migotanie przedsionków, osteoporoza). PROGI PEDIATRYCZNE (PTEDD 2016, Kucharska i wsp.) są wiek-zależne — u noworodków i niemowląt znacznie wyższe niż u dorosłych (m.in. test bibułowy 3.–5. doba: TSH > 9 mIU/L → wezwanie; w surowicy noworodków normy do ~30 w 1.–2. dobie, spadek do ~10 do 14. doby; u niemowląt i małych dzieci stopniowo obniża się do wartości ~5 mIU/L). CIĄŻA (PTE 2021, Hubalewska-Dydejczyk): górne progi swoiste dla trymestru: I 3,18; II 3,44; III 3,53 mIU/L (cel terapeutyczny u leczonych < 2,5 w I trymestrze — nie próg diagnostyczny). PUŁAPKI: (1) BIOTYNA — w wysokich dawkach (≥ 5 mg/d, np. w suplementach „włosy/skóra/paznokcie") interferuje z immunoassay opartymi na streptawidynie — odstawić ≥ 48 h przed pobraniem; (2) LIT — może indukować niedoczynność (psychiatryczny lek); (3) AMIODARON — wzrost TSH wczesny (po 1–3 mies.) zwykle przejściowy, długotrwały wymaga oceny; (4) bilirubina i triglicerydy wysokie → interferencja immunoassay; (5) HOSPITALIZACJA, ostre choroby → „euthyroid sick syndrome" — TSH może być przejściowo obniżone lub podwyższone bez rzeczywistej dysfunkcji tarczycy. KONTROLA: po włączeniu/zmianie dawki L-tyroksyny TSH oznaczać po 6–8 tygodniach (czas półtrwania T4 ~7 dni, pełna stabilizacja farmakokinetyczna wymaga ≥ 5 t½).' },
            { id: 'ft4',
              note: 'Różnicuje postać jawną (fT4 obniżone) od subklinicznej (fT4 prawidłowe). Obniżone fT4 przy nieadekwatnie niskim lub prawidłowym TSH → podejrzenie niedoczynności wtórnej/centralnej (choroba przysadki).',
              description: 'fT4 (wolna tyroksyna) — drugorzędowo po TSH, służy do RÓŻNICOWANIA postaci niedoczynności: (1) postać JAWNA — TSH ↑ + fT4 ↓ (jednoznaczne wskazanie do leczenia); (2) postać SUBKLINICZNA — TSH ↑ + fT4 PRAWIDŁOWE (decyzja o leczeniu zależna od wartości TSH, ciąży, objawów, wieku, anty-TPO); (3) postać WTÓRNA/CENTRALNA — fT4 ↓ + TSH nieadekwatnie prawidłowe lub niskie → konieczna diagnostyka osi przysadkowo-podwzgórzowej (MR przysadki, ocena innych osi hormonalnych: ACTH/kortyzol poranny, LH/FSH, GH, prolaktyna). MONITOROWANIE LECZENIA L-tyroksyną: cel to TSH w normie LUB w dolnej połowie normy (zwykle 0,4–2,5 mIU/L); fT4 zwykle utrzymuje się w środkowej/górnej połowie zakresu referencyjnego — wartości w górnym kwartylu nie są nieprawidłowe gdy TSH jest w normie. PUŁAPKI: (1) BIOTYNA (jak w TSH); (2) ostre choroby — fT4 może być obniżone wtórnie bez rzeczywistej niedoczynności (euthyroid sick syndrome — niska T3, czasem niska fT4, TSH zwykle prawidłowe lub niskie); (3) sezonowa zmienność u zdrowych ~3% (niższe latem); (4) różne metody immunoassay dają różne wyniki — zawsze porównuj z normami danego laboratorium; (5) zaawansowana CIĄŻA, leki estrogenowe (HRT, doustna antykoncepcja) — zwiększają TBG, prawidłowe fT4 mimo wzrostu T4 całkowitej (dlatego oznaczamy fT4 a nie T4 całk.).' }
          ]
        },
        { name: 'Etiologia (choroba Hashimoto — autoimmunologiczna)',
          tests: [
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO',
              note: 'Główny marker autoimmunologicznego zapalenia tarczycy (choroba Hashimoto) — najczęstszej przyczyny niedoczynności w obszarach z prawidłową podażą jodu. Dodatni wynik potwierdza etiologię autoimmunologiczną.',
              description: 'Anty-TPO (przeciwciała przeciwko peroksydazie tarczycowej) — najczulszy marker autoimmunologicznego zapalenia tarczycy. CZUŁOŚĆ ~90% w chorobie Hashimoto, swoistość niższa (przeciwciała mogą występować u 5–15% populacji ogólnej, częściej u kobiet i z wiekiem — nie zawsze klinicznie istotne). Interpretacja MIAN: norma zależy od metody (zwykle < 35 lub < 60 IU/mL); wartości umiarkowane (kilka × górnej granicy) potwierdzają obraz autoimmunologiczny; bardzo wysokie miana (> 1000 IU/mL) typowe dla aktywnej choroby Hashimoto i zwiększonego ryzyka progresji do jawnej niedoczynności. CIĄŻA: anty-TPO + zwiększa ryzyko (a) poporodowego zapalenia tarczycy (postpartum thyroiditis) ~50% w anty-TPO+ vs ~10% bez (ATA 2017); (b) progresji subklinicznej niedoczynności do jawnej; (c) poronień nawracających (kontrowersyjne — PTE 2021 wskazuje na potencjalny związek). U kobiet planujących ciążę z anty-TPO+ i TSH > 2,5 mIU/L — rozważyć profilaktyczną L-tyroksynę (indywidualnie). APS-2 / ZESPÓŁ SCHMIDTA: choroba Hashimoto często WSPÓŁWYSTĘPUJE z innymi chorobami autoimmunologicznymi — cukrzyca typu 1 (~10–20% pacjentów z Hashimoto ma przeciwciała trzustkowe), celiakia (~3–5% — przeglad anty-tTG/EMA wskazany), choroba Addisona (rzadka, ale konsekwencje śmiertelne — patrz cortisol w sekcji „Wykluczenia"), bielactwo, niedokrwistość Addisona-Biermera (anty-IF, anty-PCA). U pacjenta z potwierdzonym Hashimoto warto rozważyć skrining w kierunku tych asocjacji, zwłaszcza przy charakterystycznych objawach (utrata masy ciała, hipotensja, biegunki, niedokrwistość makrocytowa, hiperpigmentacja).' },
            { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG',
              note: 'Marker uzupełniający — anty-TPO jest podstawowy. Anty-TG dodaje niewiele, gdy anty-TPO są dodatnie; bywają jednak jedynymi dodatnimi przeciwciałami u części pacjentów z chorobą Hashimoto.' },
            { ext: 'thyroid_us', label: 'USG tarczycy',
              note: 'Choć samo rozpoznanie niedoczynności tarczycy opiera się na badaniach laboratoryjnych, USG tarczycy jest badaniem zalecanym u każdego pacjenta z wynikami laboratoryjnymi sugerującymi zaburzenie czynności tarczycy (niedoczynność lub nadczynność), a także u każdego dziecka z podejrzeniem choroby tarczycy przy dodatnim wywiadzie rodzinnym — zwłaszcza autoimmunologicznego zapalenia tarczycy. W chorobie Hashimoto typowy obraz to hipoechogeniczność i niejednorodność miąższu; USG uwidacznia również wole i guzki wymagające dalszej oceny.',
              description: 'USG tarczycy w niedoczynności — badanie obrazowe uzupełniające diagnostykę laboratoryjną; nie jest niezbędne do samego rozpoznania (które opiera się na TSH/fT4), ale dostarcza KLUCZOWYCH INFORMACJI dla dalszego postępowania. OBRAZ TYPOWY DLA HASHIMOTO: (1) hipoechogeniczność miąższu (ciemniejsza niż mięśni szyi — w przeciwieństwie do zdrowej tarczycy, która jest hiperechogeniczna względem mięśni); (2) niejednorodność („marmurkowa" struktura — naprzemienne obszary niskiej i normalnej echogeniczności); (3) mikrobrodawkowanie/„mikrobrodawkowy" wzór (drobne hipoechogeniczne pola < 1–6 mm odpowiadające naciekom limfocytarnym); (4) zwłóknienia, czasem niewielkie torbiele; (5) wzmożone unaczynienie w aktywnych fazach (badanie Dopplera); (6) zmniejszenie/zanik miąższu w fazie końcowej (atrofii). WSKAZANIA: u dorosłych USG zalecane u każdego pacjenta z laboratoryjnymi cechami zaburzeń czynności tarczycy; u dzieci OBLIGATORYJNE według PTEDD przy każdym podejrzeniu choroby tarczycy. GUZKI: gdy USG wykrywa guzki — ocena wg klasyfikacji TIRADS (EU-TIRADS lub klasyfikacja PTE/PTU). Wskazania do biopsji aspiracyjnej cienkoigłowej (BAC/FNAB): EU-TIRADS 5 (≥ 10 mm) lub EU-TIRADS 4 (≥ 15 mm) lub EU-TIRADS 3 (≥ 20 mm) — uwaga, polskie kryteria mogą się nieco różnić (PTE wytyczne raka tarczycy 2022/Handkiewicz-Junak 2024 u dzieci). U PACJENTA Z HASHIMOTO: ryzyko chłoniaka tarczycy nieznacznie wyższe (rzadkie, ale wymaga uwagi przy szybko narastającym wolu lub guzku o atypowym obrazie).' }
          ]
        },
        { name: 'Konsekwencje i monitorowanie',
          tests: [
            { ext: 'lipid_panel', label: 'Lipidogram (TC, LDL, HDL, TG)',
              note: 'Niedoczynność tarczycy powoduje dyslipidemię — podwyższenie cholesterolu całkowitego i frakcji LDL; leczenie substytucyjne zwykle ją koryguje.',
              description: 'Dyslipidemia w niedoczynności tarczycy — częsta i klinicznie istotna konsekwencja. ZMIANY TYPOWE: (1) podwyższenie cholesterolu całkowitego (TC) i frakcji LDL-C — najwyraźniejsza cecha (do 30–50% wzrostu w cięższej niedoczynności); mechanizm: zmniejszenie ekspresji wątrobowych receptorów LDL (LDLR) i zmniejszenie aktywności lipazy lipoproteinowej; (2) podwyższenie trójglicerydów (TG) — mniej stałe; (3) HDL-C zwykle prawidłowe lub niewielki wzrost (mechanizm: zmniejszenie aktywności CETP); (4) wzrost Lp(a) u niektórych pacjentów. NORMALIZACJA po włączeniu L-tyroksyny: zwykle widoczna po 6–8 tygodniach, pełna po 3 miesiącach prawidłowego TSH. OSTROŻNOŚĆ ZE STATYNAMI: nigdy nie włączać statyny u pacjenta z nierozpoznaną lub niewyrównaną niedoczynnością — statyny i niedoczynność niezależnie zwiększają ryzyko MIOPATII (bóle mięśni, podwyższenie CK), a kombinacja może wywołać ciężkie powikłania (rabdomioliza). Zalecenie: oznacz TSH przed włączeniem statyny u każdego pacjenta z dyslipidemią; jeśli dyslipidemia ↔ niedoczynność, najpierw wyrównaj niedoczynność, ponownie ocen lipidogram po 3 mies., dopiero wtedy decyzja o statynie. SUBKLINICZNA NIEDOCZYNNOŚĆ: sama dyslipidemia nie jest niezależnym wskazaniem do leczenia L-tyroksyną subklinicznej niedoczynności wg PTE/ATA — decyzja w kontekście całości obrazu (wartość TSH, anty-TPO, wiek, objawy, ryzyko sercowo-naczyniowe).' },
            { ext: 'cbc', label: 'Morfologia krwi',
              note: 'Niedoczynność tarczycy może powodować niedokrwistość (najczęściej normocytową; bywa też makrocytowa lub — przy współistniejącej autoimmunizacji — z niedoboru żelaza albo witaminy B12).',
              description: 'Morfologia krwi w niedoczynności tarczycy — niedokrwistość występuje u ~20–60% pacjentów (w zależności od ciężkości). TYPY NIEDOKRWISTOŚCI: (1) NORMOCYTOWA NORMOCHROMICZNA — najczęstsza, łagodna; mechanizm: zmniejszone wytwarzanie erytropoetyny (osi tarczyca-nerka), bezpośredni wpływ hormonów tarczycy na proliferację erytrocytów; (2) MAKROCYTOWA (MCV ↑) — typowa przy współistniejącym NIEDOBORZE WITAMINY B12 (asocjacja autoimmunologiczna — Hashimoto + niedokrwistość Addisona-Biermera w ramach APS-2; oznacz B12, anty-IF/PCA, gastrin); (3) MIKROCYTOWA HIPOCHROMICZNA — typowa przy współistniejącym NIEDOBORZE ŻELAZA — częsta u kobiet (miesiączki, ciąża) i przy CELIAKII (asocjacja APS-2 — anty-tTG, anty-EMA); (4) zaburzenia leukocytów i płytek rzadkie — niedoczynność nie jest cytopeniczna jako taka, ale autoimmunologiczne zaburzenia płytek (ITP) lub neutropenia bywają w APS. NORMALIZACJA: po wyrównaniu TSH morfologia wraca do normy w ciągu 2–4 miesięcy (chyba że istnieje niezależny niedobór Fe/B12, wymagający suplementacji). PUŁAPKA: u pacjenta z niedokrwistością makrocytową i zmęczeniem — ZAWSZE oznacz TSH przed założeniem niedoboru B12 (i odwrotnie); diagnostyka różnicowa obejmuje obie.' },
            { ext: 'egfr', label: 'Kreatynina + eGFR',
              note: 'W cięższej niedoczynności tarczycy dochodzi do odwracalnego obniżenia przesączania kłębuszkowego (eGFR) — normalizuje się po wyrównaniu hormonalnym.' }
          ]
        },
        { name: 'Wykluczenia przed leczeniem (APS-2 / zespół Schmidta)',
          tests: [
            { id: 'cortisol',
              label: 'Kortyzol poranny (8:00–9:00)',
              note: 'PRZED włączeniem L-tyroksyny rozważyć ocenę osi nadnerczowej, zwłaszcza przy podejrzeniu APS-2 / zespołu Schmidta (Hashimoto + choroba Addisona) lub współistniejących objawach niewydolności kory nadnerczy. Substytucja L-tyroksyną u pacjenta z NIEROZPOZNANĄ pierwotną niedoczynnością kory nadnerczy może wywołać PRZEŁOM NADNERCZOWY (zagrożenie życia). Próg < 138 nmol/L → wskazana dalsza diagnostyka (zob. wskazanie „Niedoczynność kory nadnerczy").',
              description: 'Kortyzol poranny w kontekście niedoczynności tarczycy — kluczowe wykluczenie przed włączeniem L-tyroksyny. APS-2 (autoimmunologiczny zespół niedoczynności wielogruczołowej typu 2, zespół Schmidta) to współistnienie choroby Hashimoto z chorobą Addisona (pierwotna niedoczynność kory nadnerczy) ± cukrzycą typu 1. Mechanizm zagrożenia: hormony tarczycy zwiększają obwodowy metabolizm kortyzolu (przyspieszają jego klirens) — u pacjenta z dotychczas „skompensowaną" subkliniczną niedoczynnością nadnerczy (resztkowa rezerwa) wprowadzenie L-tyroksyny może DEKOMPENSOWAĆ oś nadnerczową i wywołać PRZEŁOM NADNERCZOWY (kryza, niewydolność krążenia, zaburzenia elektrolitowe — hiponatremia, hiperkaliemia — wymagająca natychmiastowego leczenia hydrokortyzonem). WSKAZANIA do oceny kortyzolu PRZED L-tyroksyną: (1) charakterystyczne objawy choroby Addisona — hiperpigmentacja (zwłaszcza fałdów skórnych, brodawek, jamy ustnej), hipotensja ortostatyczna, utrata masy ciała, łaknienie soli, hiponatremia, hiperkaliemia, hipoglikemia; (2) wywiad rodzinny APS lub innych chorób autoimmunologicznych (cukrzyca t.1, bielactwo, niedokrwistość Addisona-Biermera, celiakia); (3) ciężka niedoczynność tarczycy z objawami nieproporcjonalnymi (silne osłabienie, hipotensja, zaburzenia psychiczne). PROTOKÓŁ: pobranie kortyzolu w surowicy o godz. 8:00–9:00 (na czczo, w spoczynku). Interpretacja (Bornstein ES 2016): kortyzol poranny > 500 nmol/L (18 μg/dL) → niewydolność praktycznie wykluczona; < 138 nmol/L (5 μg/dL) → niewydolność prawdopodobna (wymaga testu stymulacji Synacthen 250 μg z pomiarem kortyzolu w 30. i 60. min); 138–500 nmol/L → wynik niejednoznaczny, test Synacthen wskazany. POSTĘPOWANIE: gdy potwierdzona/podejrzewana niedoczynność nadnerczy — NAJPIERW włączyć hydrokortyzon (substytucja glikokortykosteroidem), DOPIERO POTEM L-tyroksynę (po ≥ 1 tygodniu adekwatnej substytucji glikokortykosteroidem); szczegóły: zobacz wskazanie „Niedoczynność kory nadnerczy".' }
          ]
        }
      ],
      guideline: 'PTE (Hubalewska-Dydejczyk i wsp.) / ATA 2014',
      sources: [
        'Rekomendacje Polskiego Towarzystwa Endokrynologicznego — postępowanie w niedoczynności tarczycy (Hubalewska-Dydejczyk A i wsp.).',
        'Jonklaas J, Bianco AC, Bauer AJ, et al. Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association task force. Thyroid. 2014;24(12):1670-1751.',
        'Hubalewska-Dydejczyk A, Trofimiuk-Müldner M, Ruchała M i wsp. Thyroid diseases and pregnancy: guidelines of the Polish Society of Endocrinology. Endokrynologia Polska. 2021;72(5):425-488.',
        'Kucharska AM i wsp. — Polskie wytyczne PTEDD: postępowanie w wrodzonej niedoczynności tarczycy. Pediatr Endocrinol Diabetes Metab. 2016.',
        'Bornstein SR, Allolio B, Arlt W, et al. Diagnosis and Treatment of Primary Adrenal Insufficiency: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2016;101(2):364-389.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o niedoczynności tarczycy.'
      ]
    },

    hyperthyroidism: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst',
            body: 'Nadczynność tarczycy jest zespołem objawów klinicznych spowodowanych nadmiarem hormonów tarczycy w stosunku do aktualnego zapotrzebowania organizmu. Tyreotoksykoza jest to każdy nadmiar hormonów tarczycy we krwi i na poziomie tkankowym, natomiast hipertyreoza jest to zwiększona synteza i uwalnianie hormonów tarczycy. Wszyscy pacjenci z hipertyreozą mają tyreotoksykozę, lecz nie wszyscy chorzy z tyreotoksykozą mają nadczynność tarczycy. Tyreotoksykoza w chorobie Gravesa-Basedowa nie wiąże się z uwolnieniem zawartości pęcherzyków w cytolitycznym procesie zapalnym, co dzieje się w fazie nadczynnej choroby Hashimoto (hashitoxicosis), lecz jest wynikiem nadmiernej produkcji i uwalniania tyroksyny i trijodotyroniny przez komórki pęcherzykowe tarczycy. Choroba Gravesa-Basedowa odpowiada za zdecydowaną większość przypadków nadczynności tarczycy, dużo rzadszymi przyczynami są wole guzowate nadczynne oraz gruczolaki autonomiczne tarczycy.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Klasyfikacja (wg PTE / ATA)',
            items: [
              { label: 'Jawna', text: 'TSH zahamowane + fT4 i/lub fT3 podwyższone.' },
              { label: 'Subkliniczna łagodna', text: 'TSH 0,1–0,4 mIU/L, fT4/fT3 prawidłowe. Postępowanie INDYWIDUALNE — obserwacja u młodszych bezobjawowych; leczenie rozważyć przy migotaniu przedsionków, osteoporozie/postmenopauzie, objawach klinicznych.' },
              { label: 'Subkliniczna znaczna', text: 'TSH < 0,1 mIU/L, fT4/fT3 prawidłowe. Leczenie zalecane (wytyczne ATA 2016 / PTE) u: ≥ 65. r.ż., zwiększonego ryzyka sercowo-naczyniowego (zwłaszcza migotanie przedsionków!), osteoporozy/postmenopauzy, objawowi, ciąży.' },
              { label: 'T3-tyreotoksykoza', text: 'TSH ↓ + fT3 ↑ + fT4 prawidłowe (uzasadnia oznaczanie fT3).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              'Choroba Gravesa-Basedowa (autoimmunologiczna, TRAb)',
              'Wole guzkowate toksyczne / choroba Plummera',
              'Gruczolak toksyczny',
              'Zapalenia tarczycy (poporodowe, podostre de Quervaina, nieme)',
              {
                label: 'Tyreotoksykoza amiodaronowa (AIT)',
                text: 'typ 1 i typ 2',
                detail: [
                  'Amiodaron zawiera ~37% jodu wagowo i ma silne powinowactwo do tarczycy. AIT ma dwa typy o odmiennej patofizjologii i leczeniu — różnicowanie jest kluczowe, bo postępowanie się różni.',
                  { label: 'Typ 1', text: 'jodem-indukowana nadczynność, zwykle u pacjentów z wcześniejszym wolem guzkowatym lub utajoną chorobą Gravesa-Basedowa. Tarczyca odpowiada na nadmiar jodu wzmożoną syntezą hormonów. Leczenie: tyreostatyki (tiamazol).' },
                  { label: 'Typ 2', text: 'destrukcyjne zapalenie tarczycy z uwolnieniem zmagazynowanych hormonów; występuje u pacjentów z prawidłową tarczycą. Leczenie: glikokortykosteroidy.' },
                  { label: 'Różnicowanie', text: 'USG doplerowskie (typ 1 wzmożone, typ 2 obniżone unaczynienie); jodochwytność (typ 1 wyższa lub prawidłowa, typ 2 bardzo niska). U części pacjentów występują formy mieszane.' }
                ]
              },
              'Tyreotoksykoza egzogenna',
              {
                label: 'Burza tarczycowa (przełom hipermetaboliczny) — stan zagrażający życiu',
                text: 'skrajna postać objawowa wymagająca pilnego leczenia szpitalnego:',
                detail: [
                  'Skrajna postać objawowa nieleczonej lub źle wyrównanej nadczynności, indukowana ostrym stresem: operacja, infekcja, poród, kontrast jodowy w badaniu obrazowym, niespodziewane odstawienie tyreostatyku.',
                  'Skala Burch-Wartofsky pomaga ocenić stopień nasilenia (gorączka, tachykardia, niewydolność serca, objawy żołądkowo-jelitowe, objawy z OUN).',
                  'Śmiertelność 10–30% — wymaga natychmiastowego leczenia szpitalnego (zwykle na OIT).',
                  'Leczenie: β-bloker (propranolol — hamuje obwodową konwersję T4→T3); tiamazol lub PROPYLOTIOURACYL (PTU preferowany w przełomie — dodatkowo hamuje konwersję T4→T3 w tkankach); jodek potasu ≥ 1 h PO tyreostatyku (zasada Wolff-Chaikoff — odwrotna kolejność powoduje paradoksalne nasilenie); hydrokortyzon i.v.; chłodzenie fizyczne; leczenie czynnika prowokującego.'
                ]
              },
              {
                label: 'Rzadkie przyczyny — wykluczyć przy obrazie atypowym',
                text: 'wymagają ukierunkowanej diagnostyki:',
                detail: [
                  'TSH-oma (gruczolak przysadki produkujący TSH) — centralna nadczynność z paradoksalnie prawidłowym lub PODWYŻSZONYM TSH przy podwyższonych fT4/fT3; wskazanie do MRI przysadki.',
                  'Tyreotoksykoza hCG-zależna — zaśniad groniasty, ciężarna z trofoblastozą, ciężkie wymioty niepowściągliwe.',
                  'Struma ovarii — ektopowa tkanka tarczycowa w potworniaku jajnika; diagnostyka: USG miednicy, scyntygrafia całego ciała.',
                  'Tyreotoksykoza factitia/egzogenna — przyjmowanie hormonów tarczycowych (zatajone lub błędne); charakterystyczne: NISKA tyreoglobulina + NISKA jodochwytność.'
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'baby-bottle',
            title: 'W ciąży',
            body: 'Polskie progi TSH swoiste dla trymestru wg PTE 2021 (Hubalewska-Dydejczyk i wsp., ECL, polska populacja): I trymestr 0,01–3,18 mIU/L; II 0,05–3,44; III 0,11–3,53. TSH zahamowane poniżej dolnej granicy trymestru wskazuje na nadczynność (zob. wskazanie „Ciąża — kontrola laboratoryjna"). Wybór tyreostatyku zależy od trymestru: w I trymestrze preferowany PTU (propylotiouracyl — mniejsze ryzyko teratogenności niż tiamazol, który może wywołać aplasia cutis i embriopatię metimazolową); od II trymestru zwykle przechodzi się na tiamazol (mniejsze ryzyko hepatotoksyczności u matki). Przejściowa tyreotoksykoza ciążowa (hCG-mediated), zwłaszcza przy wymiotach niepowściągliwych, różnicuje z chorobą Gravesa — NIE wymaga tyreostatyków, ustępuje samoistnie po ~16. tygodniu. Scyntygrafia, jodochwytność i ¹³¹I są PRZECIWWSKAZANE w ciąży i laktacji. U kobiet z chorobą Gravesa-Basedowa TRAb monitoruje się w II trymestrze — wysokie miano (orientacyjnie > 3× górna granica normy) zwiększa ryzyko tyreotoksykozy płodowej i noworodkowej (przeciwciała IgG przechodzą przez łożysko).'
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'mood-kid',
            title: 'U dzieci',
            body: 'Zakresy referencyjne TSH i fT4 są zależne OD WIEKU — nie stosować progów dorosłych. USG tarczycy jest badaniem zalecanym u każdego dziecka z laboratoryjnymi cechami zaburzenia czynności tarczycy. Najczęstsza przyczyna nadczynności u dzieci to choroba Gravesa-Basedowa (rzadsza niż u dorosłych, ale dominująca etiologicznie). Noworodkowa tyreotoksykoza — przejściowa, indukowana matczynym TRAb przechodzącym przez łożysko; ustępuje samoistnie po ~6–12 tygodniach (gdy zanika matczyne IgG); wymaga monitorowania i krótkotrwałego leczenia tyreostatykiem przy istotnych objawach.'
          }
        ]
      },
      sections: [
        { name: 'Rozpoznanie i klasyfikacja',
          tests: [
            { id: 'tsh', note: 'Badanie I rzutu — w jawnej nadczynności zahamowane. Postać subkliniczna: TSH ↓ przy prawidłowym fT4 i fT3, podzielona wg PTE/ATA na łagodną (TSH 0,1–0,4 mIU/L) i znaczną (TSH < 0,1 mIU/L). UWAGA: w ciąży obowiązują niższe, swoiste dla trymestru zakresy wg PTE 2021 (zob. wskazanie „Ciąża — kontrola laboratoryjna"), a u dzieci zakresy zależne od wieku.' },
            { id: 'ft4', note: 'Różnicuje postać jawną (fT4 podwyższone) od subklinicznej (fT4 prawidłowe). Magnituda podwyższenia odzwierciedla nasilenie nadczynności.' },
            { id: 'ft3', note: 'Inaczej niż w niedoczynności — w nadczynności fT3 jest przydatne. Wykrywa T3-tyreotoksykozę: TSH ↓ + fT3 ↑ + fT4 prawidłowe, częstą we wczesnej chorobie Gravesa-Basedowa i w guzkach toksycznych. Pominięcie fT3 może spowodować przeoczenie nadczynności.', description: 'fT3 w diagnostyce nadczynności tarczycy — pełni odrębną rolę niż w niedoczynności. T3-tyreotoksykoza (izolowane podwyższenie fT3 przy zahamowanym TSH i prawidłowym fT4) występuje u części pacjentów z wczesną chorobą Gravesa-Basedowa, gruczolakiem toksycznym i wolem guzkowatym toksycznym — wynika z preferencyjnej syntezy lub konwersji T4→T3 w gruczole. Oznaczenie fT3 pozwala wykryć te przypadki. fT3 bywa też pomocne w monitorowaniu skuteczności leczenia tyreostatykiem oraz w różnicowaniu nadczynności od zespołu niskiej T3 (low-T3 syndrome) w stanach ostrych, gdzie TSH bywa wtórnie obniżone.' }
          ]
        },
        { name: 'Różnicowanie przyczyny (etiologia tyreotoksykozy)',
          tests: [
            { ext: 'trab', label: 'TRAb (przeciwciała anty-receptor TSH)', note: 'Test pierwszego rzutu w różnicowaniu przyczyn tyreotoksykozy wg ATA 2016 i PTE. Dodatni TRAb potwierdza chorobę Gravesa-Basedowa (wysoka czułość i swoistość). Ujemny TRAb przy obecnej tyreotoksykozie → wskazanie do scyntygrafii lub jodochwytności w celu różnicowania. W ciąży TRAb monitoruje się u kobiet z chorobą Gravesa — przeciwciała przechodzą przez łożysko i mogą wywołać tyreotoksykozę płodową lub noworodkową.', description: 'TRAb (przeciwciała przeciwko receptorowi TSH) — kluczowy marker różnicujący przyczyny tyreotoksykozy. Dodatni wynik praktycznie potwierdza chorobę Gravesa-Basedowa (autoimmunologiczna nadczynność tarczycy z pobudzającymi przeciwciałami stymulującymi receptor TSH). Wg wytycznych ATA 2016 i PTE TRAb jest badaniem PIERWSZEGO RZUTU w różnicowaniu — jeśli TRAb dodatnie, rozpoznanie Gravesa jest jednoznaczne i scyntygrafia/RAIU nie są konieczne. Przy ujemnym TRAb lub niejednoznacznym obrazie konieczne dalsze różnicowanie: scyntygrafia/RAIU. Znaczenie w ciąży: u kobiet z chorobą Gravesa w wywiadzie lub w trakcie ciąży TRAb należy oznaczyć (zwykle w II trymestrze) — wysokie miano (orientacyjnie > 3-krotność górnej granicy normy) zwiększa ryzyko tyreotoksykozy płodowej i noworodkowej, ponieważ przeciwciała IgG przechodzą przez łożysko.' },
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO', note: 'Marker autoimmunologicznej choroby tarczycy — dodatnie zarówno w chorobie Gravesa, jak i w chorobie Hashimoto/hashitoxicosis. Wspierające, ale nieswoiste dla Gravesa — do różnicowania służy TRAb.' },
            { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG', note: 'Uzupełniająco — anty-TPO jest podstawowym markerem autoimmunologicznym, anty-TG dodaje niewiele.' },
            { ext: 'thyroid_us', label: 'USG tarczycy', note: 'Badanie zalecane u każdego pacjenta z laboratoryjnymi cechami zaburzeń czynności tarczycy oraz u każdego dziecka z podejrzeniem choroby tarczycy (zwłaszcza przy dodatnim wywiadzie rodzinnym w kierunku autoimmunologicznego zapalenia tarczycy). W chorobie Gravesa typowo rozlana hipoechogeniczność z wzmożonym unaczynieniem w badaniu doplerowskim („thyroid inferno"); w wolu guzkowatym toksycznym — guzki o cechach autonomicznych.' },
            { ext: 'thyroid_scinti', label: 'Scyntygrafia tarczycy (¹²³I / ⁹⁹ᵐTc)', note: 'Różnicuje przyczynę tyreotoksykozy gdy TRAb ujemne/niejednoznaczne lub przy wolu guzkowatym: choroba Gravesa — rozlany, wzmożony wychwyt; guzek toksyczny — ognisko „gorące" z zahamowanym wychwytem reszty miąższu; wole wieloguzkowe toksyczne — niejednorodny obraz; zapalenie tarczycy lub tyreotoksykoza egzogenna — niski wychwyt. PRZECIWWSKAZANA w ciąży i laktacji.', description: 'Scyntygrafia tarczycy z izotopem (¹²³I lub ⁹⁹ᵐTc-nadtechnecjan) — badanie czynnościowo-obrazowe pokazujące rozkład wychwytu radioznacznika w gruczole. W diagnostyce tyreotoksykozy służy różnicowaniu przyczyn, gdy TRAb jest ujemne lub obraz kliniczny jest niejednoznaczny, a także w ocenie wola guzkowatego. Wzorce: (1) choroba Gravesa-Basedowa — rozlany, znacznie wzmożony wychwyt w całym miąższu; (2) gruczolak toksyczny — pojedyncze „gorące" ognisko z zahamowanym wychwytem reszty gruczołu; (3) wole wieloguzkowe toksyczne — niejednorodny obraz z licznymi ogniskami wzmożonego i zmniejszonego wychwytu; (4) zapalenie tarczycy (podostre, poporodowe, nieme) lub tyreotoksykoza egzogenna — niski lub zerowy wychwyt. PRZECIWWSKAZANIA: ciąża i karmienie piersią (narażenie płodu/dziecka na promieniowanie); u kobiet w wieku rozrodczym wykluczyć ciążę przed badaniem.' },
            { ext: 'iodine_uptake', label: 'Jodochwytność (RAIU)', note: 'Ilościowa ocena wychwytu jodu radioaktywnego przez tarczycę — uzupełnia scyntygrafię. Wysoka w chorobie Gravesa i wolu guzkowatym toksycznym; niska w zapaleniach tarczycy i tyreotoksykozie egzogennej. Wykorzystywana też do planowania dawki ¹³¹I w terapii. PRZECIWWSKAZANA w ciąży i laktacji.' }
          ]
        },
        { name: 'Ocena przed leczeniem tyreostatykami i powikłania',
          tests: [
            { ext: 'cbc', label: 'Morfologia krwi', note: 'obowiązkowe wyjściowe oznaczenie przed włączeniem tyreostatyku (tiamazol, propylotiouracyl) — leki te mogą wywołać AGRANULOCYTOZĘ (zwykle w pierwszych 3 miesiącach leczenia). Pacjent musi być pouczony o natychmiastowym zgłaszaniu objawów alarmowych: gorączka, ból gardła, owrzodzenia jamy ustnej — wskazania do pilnej kontroli morfologii i odstawienia leku.', description: 'Morfologia krwi w diagnostyce i leczeniu nadczynności tarczycy: (1) wyjściowo, przed włączeniem tyreostatyku — obowiązkowa, ponieważ tiamazol (metimazol) i propylotiouracyl (PTU) mogą wywołać agranulocytozę (ostry, ciężki spadek granulocytów, zwykle w pierwszych 3 miesiącach leczenia, częstość ~0,1–0,5%); znajomość wartości wyjściowych umożliwia interpretację ewentualnych spadków w trakcie terapii. (2) Pacjent musi być wyraźnie pouczony, że w razie pojawienia się GORĄCZKI, BÓLU GARDŁA lub OWRZODZEŃ JAMY USTNEJ powinien natychmiast skontaktować się z lekarzem i wykonać kontrolę morfologii — to potencjalne objawy agranulocytozy wymagającej pilnego odstawienia leku. (3) Sama nadczynność tarczycy może powodować łagodne zaburzenia hematologiczne (m.in. mikrocytoza, łagodna leukopenia).' },
            { ext: 'liver', label: 'Próby wątrobowe (ALAT, ASPAT, GGTP, bilirubina)', note: 'obowiązkowe wyjściowe oznaczenie przed włączeniem tyreostatyku — tiamazol i (zwłaszcza) propylotiouracyl mogą wywołać hepatotoksyczność, rzadko nawet ostrą niewydolność wątroby. Sama nadczynność tarczycy również może podwyższać aminotransferazy.' },
            { ext: 'dxa', label: 'DXA (densytometria L1–L4, biodro)', note: 'Nadczynność tarczycy (zwłaszcza długotrwała, nieleczona oraz subkliniczna) przyspiesza utratę masy kostnej i zwiększa ryzyko osteoporozy — istotne zwłaszcza u kobiet po menopauzie. U dorosłych ≥ 50. r.ż. / po menopauzie kryterium rozpoznania to T-score ≤ -2,5; u młodszych — Z-score ≤ -2,0.' }
          ]
        }
      ],
      guideline: 'PTE / ATA 2016 (Ross i wsp.)',
      sources: [
        'Ross DS, Burch HB, Cooper DS, et al. 2016 American Thyroid Association Guidelines for Diagnosis and Management of Hyperthyroidism and Other Causes of Thyrotoxicosis. Thyroid. 2016;26(10):1343-1421.',
        'Rekomendacje Polskiego Towarzystwa Endokrynologicznego — diagnostyka i leczenie nadczynności tarczycy.',
        'Hubalewska-Dydejczyk A, Trofimiuk-Müldner M, Ruchała M i wsp. Thyroid diseases and pregnancy: guidelines of the Polish Society of Endocrinology. Endokrynologia Polska. 2021;72(5):425-488.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o nadczynności tarczycy.'
      ]
    },

    thyroid_cancer_followup: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Cel monitorowania DTC po tyreoidektomii (dorośli)',
            body: 'Monitorowanie pacjenta dorosłego po leczeniu zróżnicowanego raka tarczycy (DTC — rak brodawkowaty i pęcherzykowy) służy: (1) wykryciu nawrotu/przetrwałej choroby; (2) ocenie skuteczności supresji TSH lewotyroksyną; (3) DYNAMICZNEJ stratyfikacji odpowiedzi na leczenie wg PTE 2022 (Jarząb i wsp.) — która (a NIE samo początkowe ryzyko nawrotu) decyduje o docelowym progu TSH oraz o intensywności monitorowania serologicznego i obrazowego. UWAGA: u dzieci z DTC obowiązują INNE progi i ramy czasowe — patrz osobne wskazanie „Kontrola po raku tarczycy (dzieci)".'
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: 'Dynamiczna stratyfikacja odpowiedzi — PTE 2022 (dorośli)',
            steps: [
              {
                number: 1,
                title: 'Po totalnej tyreoidektomii + ¹³¹I',
                sublabel: 'klasyczne leczenie radykalne — najczęstsze',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana < 0,2 lub Tg stymulowana < 1 ng/mL + obrazowanie ujemne + anty-Tg nieoznaczalne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'WSZYSTKIE 3 kryteria muszą być spełnione łącznie.',
                      'Tg niestymulowana = pomiar przy normalnym dawkowaniu L-tyroksyny (bez stymulacji rhTSH ani wycofania LT4). Cel: < 0,2 ng/mL w metodzie super-sensitive (funkcjonalna czułość ≤ 0,1 ng/mL).',
                      'Tg stymulowana = pomiar po podaniu rhTSH (Thyrogen) lub po wycofaniu L-tyroksyny przez ~4 tygodnie (cel TSH ≥ 30 mU/L). Cel: < 1 ng/mL.',
                      'Obrazowanie ujemne = USG szyi bez podejrzanych zmian w loży po tyreoidektomii i bez patologicznych węzłów chłonnych II–VI; przy wątpliwościach scyntygrafia WBS lub PET/CT.',
                      'Anty-Tg nieoznaczalne = przeciwciała anty-tyreoglobulinie poniżej granicy detekcji testu (np. < 20 IU/mL); WAŻNE: ich obecność interferuje z immunoassay Tg i fałszywie zaniża wynik.',
                      'Częstość uzyskania: 74–94,5% w niskim ryzyku, 36–61% w pośrednim, 0–21% w wysokim ryzyku nawrotu.',
                      'POSTĘPOWANIE: deeskalacja supresji TSH — przejście na dawki substytucyjne (TSH 0,5–2,0 mU/L) przy pT1aN0M0 od razu po operacji; pT1b–T2N0M0 — substytucja lub łagodna supresja indywidualnie; po ≥ 5 latach utrzymywanej remisji — substytucja.'
                    ]
                  },
                  {
                    threshold: 'Odpowiedź nieokreślona',
                    action: 'Tg niestymulowana wykrywalna, ale < 1 lub Tg stymulowana wykrywalna < 10 ng/mL, lub stabilne/zanikające anty-Tg bez choroby strukturalnej',
                    variant: 'warning', icon: 'route',
                    detail: [
                      'Kategoria pośrednia między doskonałą a niepełną odpowiedzią — wynik niejednoznaczny, ale BEZ jawnej choroby strukturalnej.',
                      'Tg niestymulowana wykrywalna, ale niska (< 1 ng/mL) — pomiar przy normalnej dawce LT4 daje wartość powyżej granicy detekcji, ale poniżej progu „bio incomplete" (≥ 1).',
                      'Tg stymulowana wykrywalna < 10 ng/mL — po stymulacji rhTSH/wycofaniu LT4 wartość niesie sygnał, ale nie jest jednoznaczna.',
                      'Stabilne lub zanikające anty-Tg = przeciwciała anty-Tg, które wcześniej były dodatnie i obecnie UTRZYMUJĄ SIĘ na tym samym poziomie (stabilne, nie rosną) LUB STOPNIOWO SPADAJĄ — przy braku choroby widocznej w obrazowaniu jest to OBRAZ TYPOWY DLA WYGASZANIA AUTOIMMUNIZACJI po radykalnym leczeniu (anty-Tg potrafią obniżać się 1–4 lata).',
                      'Brak choroby strukturalnej = USG szyi, ewentualnie inne obrazowanie nie wykazują ognisk wznowy ani patologicznych węzłów.',
                      'Częstość: 12–29% w niskim ryzyku, 8–23% w pośrednim, 0–4% w wysokim ryzyku nawrotu.',
                      'PROGNOZA: 56–68% ostatecznie BEZ choroby w długoterminowym follow-up; 19–27% utrzymuje wykrywalne Tg bez struktury; tylko 8–17% rozwija chorobę strukturalną w 5–10 lat.',
                      'POSTĘPOWANIE: łagodna supresja TSH 0,1–0,5 mU/L; intensyfikacja monitorowania (Tg + anty-Tg co 6 miesięcy, USG co 6–12 miesięcy).'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana ≥ 1 lub Tg stymulowana ≥ 10 ng/mL lub rosnące miano anty-Tg w czasie',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'wystarczy JEDNO Z 3 kryteriów. Obecna choroba biochemiczna, ALE bez jawnej choroby strukturalnej w obrazowaniu.',
                      'Tg niestymulowana ≥ 1 ng/mL — na normalnej dawce L-tyroksyny wartość przekracza próg sugerujący przetrwałą tkankę nowotworową.',
                      'Tg stymulowana ≥ 10 ng/mL — po stymulacji rhTSH/wycofaniu LT4 wartość jednoznacznie wskazuje na obecność tkanki produkującej tyreoglobulinę.',
                      'Rosnące miano anty-Tg = wzrost przeciwciał anty-tyreoglobulinie w kolejnych pomiarach (NIE spadek, NIE stabilizacja) — możliwy pierwszy sygnał nawrotu (nawet przy niewykrywalnym Tg, bo anty-Tg interferują z immunoassay).',
                      'Brak struktury w obrazowaniu — wynik USG/innych badań nie pokazuje ognisk.',
                      'Częstość: 3–11% w niskim ryzyku, 16–22% w pośrednim, 18–24% w wysokim ryzyku.',
                      'PROGRESJA do choroby strukturalnej: 8–17% pacjentów w 5–10 lat.',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; jeśli Tg stymulowane > 100 ng/mL bez lokalizacji ogniska — rozważyć empiryczne leczenie ¹³¹I (pusty WBS).'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu — niezależnie od wartości Tg i anty-Tg',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'NAJGORSZA z 4 kategorii — wymaga aktywnego leczenia.',
                      'Choroba LOKALNA: wznowa w loży po tyreoidektomii (USG, MR szyi).',
                      'Choroba REGIONALNA: powiększone, podejrzane węzły chłonne szyi (poziomy II–VI) — cechy alarmowe: okrągły kształt, utrata wnęki, niejednorodność, torbielowate degeneracje, mikrozwapnienia → BAC z oznaczeniem Tg w popłuczynach z igły.',
                      'Choroba ODLEGŁA (M1): płuca, kości, mózg, wątroba — CT/MR/PET/CT.',
                      'WAŻNE: rozpoznanie postawione W OBRAZOWANIU, niezależnie od poziomu Tg (czasem nawet przy niewykrywalnym Tg w obecności anty-Tg).',
                      'Częstość: 1–2% w niskim ryzyku, 3,5–19% w pośrednim, 24–67% w wysokim.',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; reoperacja gdy zmiana resekcyjna; leczenie ¹³¹I gdy choroba wychwytuje jod; w jodorefrakcyjnym DTC — terapia ukierunkowana (TKI: sorafenib, lenwatynib).'
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'Po totalnej tyreoidektomii BEZ ¹³¹I',
                sublabel: 'niskie ryzyko, ablacja jodem promieniotwórczym pominięta',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana < 0,2 lub Tg stymulowana < 2 ng/mL + obrazowanie ujemne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Progi nieco wyższe niż po TT + ¹³¹I — bo bez ablacji może pozostać resztkowa zdrowa tkanka tarczycy, fizjologicznie produkująca Tg.',
                      'Tg niestymulowana < 0,2 ng/mL — pomiar super-sensitive na normalnej dawce L-tyroksyny.',
                      'Tg stymulowana < 2 ng/mL — pomiar po rhTSH lub wycofaniu LT4.',
                      'Obrazowanie ujemne — USG szyi bez podejrzanych zmian.',
                      'POSTĘPOWANIE: substytucja TSH 0,5–2,0 mU/L; intensywność monitorowania zgodna z niskim ryzykiem (Tg + anty-Tg + USG raz w roku).'
                    ]
                  },
                  {
                    threshold: 'Odpowiedź nieokreślona',
                    action: 'Tg niestymulowana 0,2–5 lub Tg stymulowana 2–10 ng/mL, bez choroby strukturalnej',
                    variant: 'warning', icon: 'route',
                    detail: [
                      'Wartości w „szarej strefie" — wyższe niż doskonała odpowiedź, ale poniżej progu biochemical incomplete.',
                      'Tg niestymulowana 0,2–5 ng/mL — może odzwierciedlać resztkową zdrową tkankę tarczycy, ale wymaga monitorowania kinetyki.',
                      'Tg stymulowana 2–10 ng/mL — w „szarej strefie" interpretacji.',
                      'Stabilne/zanikające anty-Tg = anty-tyreoglobulinie wcześniej dodatnie, obecnie utrzymują się lub spadają (wygaszanie autoimmunizacji).',
                      'POSTĘPOWANIE: łagodna supresja TSH 0,1–0,5 mU/L; powtórzenie pomiaru Tg za 6 miesięcy z oceną kinetyki (czas podwojenia).'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana > 5 lub Tg stymulowana > 10 ng/mL lub rosnące Tg/anty-Tg w kolejnych pomiarach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'wystarczy JEDNO Z 3 kryteriów. Bez ablacji ¹³¹I trudniej odróżnić zdrową resztkową tkankę od nawrotu, dlatego ROSNĄCE Tg jest istotnym sygnałem.',
                      'Tg niestymulowana > 5 ng/mL — w kontekście braku ablacji nadal podejrzane.',
                      'Tg stymulowana > 10 ng/mL — jednoznaczne podejrzenie tkanki nowotworowej.',
                      'Rosnące Tg w czasie przy porównywalnym TSH = WZROST kolejnych pomiarów (kinetyka) — ważniejszy niż wartość bezwzględna w obrębie progów.',
                      'Rosnące anty-Tg = wzrost przeciwciał anty-tyreoglobulinie w czasie.',
                      'POSTĘPOWANIE: rozważyć leczenie ¹³¹I (uzupełniająca ablacja); pełna supresja TSH < 0,1 mU/L; reoperacja jeśli zlokalizowane ognisko.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu — niezależnie od wartości Tg i anty-Tg',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Choroba LOKALNA (loża po TT), REGIONALNA (węzły szyi) lub ODLEGŁA (M1) widoczna w USG / CT / PET-CT.',
                      'Rozpoznanie na podstawie OBRAZOWANIA, niezależnie od poziomu Tg.',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; reoperacja; uzupełniająca ablacja ¹³¹I; w jodorefrakcyjnym — TKI (sorafenib, lenwatynib).'
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'Po lobektomii (oszczędzającej operacji)',
                sublabel: 'pozostawiona druga połowa tarczycy — fizjologicznie produkuje Tg',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana stabilna < 30 ng/mL + obrazowanie ujemne + anty-Tg nieoznaczalne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Próg Tg ZNACZNIE wyższy (< 30 ng/mL) niż po TT — bo pozostawiona druga połowa tarczycy fizjologicznie produkuje tyreoglobulinę.',
                      'Tg niestymulowana stabilna = pomiar przy normalnej funkcji tarczycy (TSH w normie, dawka LT4 substytucyjna lub bez LT4) z BRAKIEM TRENDU WZROSTOWEGO w kolejnych pomiarach.',
                      'Obrazowanie ujemne — USG szyi bez podejrzanych zmian w pozostawionej tkance ani w węzłach chłonnych.',
                      'Anty-Tg nieoznaczalne — przeciwciała poniżej granicy detekcji.',
                      'POSTĘPOWANIE: substytucja TSH 0,5–2,0 mU/L; monitorowanie zgodne z niskim ryzykiem (kontrola roczna).'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana > 30 ng/mL lub rosnące Tg / rosnące anty-Tg w kolejnych pomiarach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'Tg niestymulowana > 30 ng/mL — wartość przekracza fizjologiczną produkcję przez pozostawioną zdrową tkankę.',
                      'Rosnące Tg w czasie przy porównywalnym TSH — kinetyka istotniejsza niż wartość bezwzględna w sytuacji pozostawionej tarczycy.',
                      'Rosnące anty-Tg = wzrost przeciwciał (NIE stabilizacja, NIE spadek).',
                      'POSTĘPOWANIE: dokładne obrazowanie (USG, w razie wątpliwości MR/CT) celem wykluczenia struktury; rozważyć dotyreoidektomię (drugą operację — usunięcie pozostałego płata) jeśli podejrzenie wznowy; konsultacja w ośrodku referencyjnym.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Wznowa w pozostawionym płacie LUB w węzłach chłonnych szyi LUB ogniska odległe.',
                      'BAC węzła podejrzanego z oznaczeniem Tg w popłuczynach — czulszą metodą.',
                      'POSTĘPOWANIE: dotyreoidektomia (drugi etap operacji) + limfadenektomia centralna/boczna jeśli wskazana; po dopełnieniu operacji rozważyć leczenie ¹³¹I; pełna supresja TSH < 0,1 mU/L.'
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Cele supresji TSH wg PTE 2022 (dorośli) — zależne od dynamicznej odpowiedzi',
            items: [
              { label: 'Pełna supresja — TSH < 0,1 mU/L', text: 'wskazana w: niepełnej odpowiedzi biochemicznej (Tg stymulowana > 10 lub Tg niestymulowana > 1 ng/mL lub wzrost anty-Tg), niepełnej odpowiedzi strukturalnej, wysokim ryzyku nawrotu bez doskonałej odpowiedzi.' },
              { label: 'Łagodna supresja — TSH 0,1–0,5 mU/L', text: 'odpowiedź nieokreślona; pośrednie ryzyko nawrotu; pT1b–T2N0M0 z doskonałą odpowiedzią — postępowanie indywidualne.' },
              { label: 'Substytucja — TSH 0,5–2,0 mU/L', text: 'pT1aN0M0 od razu po operacji; pT1b–T2N0M0 z doskonałą odpowiedzią; doskonała odpowiedź utrzymywana ≥ 5 lat — przejście na dawki substytucyjne.' },
              { label: 'bezwzględnie unikać TSH > 2,0 mU/L', text: 'poza krótkimi okresami stymulacji do badań kontrolnych. Ostrożność u osób starszych — ryzyko migotania przedsionków i osteoporozy przy przewlekłej głębokiej supresji; rozważyć β-bloker lub ACEI w prewencji przerostu mięśnia sercowego.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Markery serologiczne i obrazowanie (PTE 2022)',
            items: [
              {
                label: 'Tyreoglobulina (Tg) bazalna — standaryzacja metodyczna',
                text: 'główny marker nawrotu DTC po total thyroidectomy:',
                detail: [
                  'Metody PREFEROWANE: super-sensitive (LC-MS/MS lub immunoassaye 4. generacji) o funkcjonalnej czułości ≤ 0,1 ng/mL.',
                  'Standaryzacja do CRM 457 (Certified Reference Material 457).',
                  'KLUCZOWE: jedno laboratorium, jedna metoda — kinetyka Tg w czasie zależy od porównywalności kolejnych pomiarów.',
                  'Po TT + ablacji ¹³¹I cel: Tg niestymulowana < 0,2 ng/mL (super-sensitive) lub niewykrywalna przy normalnym dawkowaniu L-tyroksyny.',
                  'Czas oceny efektu leczenia: 6–18 miesięcy po pooperacyjnym ¹³¹I.',
                  'Kinetyka Tg (czas podwojenia) ma wartość prognostyczną — szybki wzrost przemawia za bardziej agresywnym nawrotem.'
                ]
              },
              {
                label: 'Anty-Tg-Ab — OBOWIĄZKOWO RAZEM Z Tg',
                text: 'przeciwciała anty-tyreoglobulinie:',
                detail: [
                  'Anty-Tg INTERFERUJĄ z pomiarem Tg w większości immunoassayów — dają FAŁSZYWIE NISKIE wartości Tg, maskując nawrót.',
                  'Z tego powodu anty-Tg muszą być oznaczane RAZEM z Tg w KAŻDYM pomiarze monitorującym.',
                  'Oznaczanie min. RAZ W ROKU (PTE 2022 / ATA 2015).',
                  'SPADEK miana anty-Tg po radykalnym leczeniu = dobry prognostyk; obniżanie trwa zwykle 1–4 lata.',
                  'WZROST miana anty-Tg w czasie = możliwy pierwszy sygnał nawrotu (nawet przy ujemnym USG).',
                  'W obecności anty-Tg USG SZYI jest PODSTAWOWĄ metodą monitorowania (Tg niemiarodajne).'
                ]
              },
              {
                label: 'Tg stymulowane (preferowane rhTSH, alternatywnie wycofanie LT4)',
                text: 'przy niejednoznacznym Tg bazalnym:',
                detail: [
                  'PREFEROWANA stymulacja: rhTSH (Thyrogen) — bez objawów hipotyreozy.',
                  'Alternatywa: wycofanie L-tyroksyny ~4 tyg., cel TSH ≥ 30 mU/L (PTE 2022).',
                  'Obecnie wskazane w wybranych sytuacjach: niepewny Tg bazalny u low/intermediate risk po radykalnym leczeniu — co najmniej JEDEN test potwierdzający 3–5 lat po remisji.',
                  'Przy stymulowanym Tg > 100 ng/mL bez lokalizacji ogniska — rozważyć empiryczne leczenie ¹³¹I (pusty WBS).'
                ]
              },
              { label: 'USG szyi co 6–12 mies. przez pierwsze 5 lat', text: 'ocena loży po tyreoidektomii i regionalnych węzłów chłonnych (poziomy II–VI). Po 5 latach odstępy rzadsze, ale ryzyko wznowy DTC utrzymuje się przez DZIESIĘCIOLECIA. Cechy ALARMOWE węzła: okrągły kształt, utrata wnęki, niejednorodność, torbielowate degeneracje, mikrozwapnienia. Każda podejrzana zmiana → BAC z oznaczeniem Tg w popłuczynach z igły.' },
              { label: 'WBS z ¹³¹I (whole body scan)', text: 'diagnostyczny WBS przed leczeniem RAI NIE jest konieczny; POSTtherapy WBS obowiązkowy po każdej dawce RAI. Rutynowy okresowy WBS w remisji niekonieczny — wzrost Tg jest pierwszym sygnałem. ¹⁸FDG-PET/CT przy stymulowanym Tg > 10 ng/mL i Tg-DT < 2 lata.' },
              { label: 'Rak rdzeniasty (MTC) — odrębny algorytm', text: 'kalcytonina + CEA jako markery serologiczne nawrotu; czas podwojenia kalcytoniny i CEA ma wartość prognostyczną (krótszy → szybsza progresja); ocena MEN2 (mutacja RET) u krewnych I stopnia.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (po total thyroidectomy)',
          tests: [
            { id: 'tsh',
              note: 'Cel TSH zależny od DYNAMICZNEJ stratyfikacji odpowiedzi (nie tylko od początkowego ryzyka). Doskonała odpowiedź → substytucja 0,5–2,0 mU/L; odpowiedź nieokreślona / pośrednie ryzyko → łagodna supresja 0,1–0,5; niepełna odpowiedź biochemiczna lub strukturalna albo wysokie ryzyko bez doskonałej odpowiedzi → pełna supresja < 0,1 mU/L. Po 5 latach utrzymywanej doskonałej odpowiedzi → deeskalacja do substytucji.',
              description: 'TSH w kontroli pooperacyjnej DTC u dorosłych — STEROWNIK leczenia supresyjnego L-tyroksyną. CEL TSH zależy od DYNAMICZNEJ stratyfikacji odpowiedzi (PTE 2022, Jarząb), NIE od pojedynczego początkowego ryzyka. Algorytm: (1) PEŁNA SUPRESJA < 0,1 mU/L — niepełna odpowiedź biochemiczna (Tg stim > 10 lub Tg sup > 1 ng/mL lub wzrost anty-Tg), niepełna odpowiedź strukturalna, high-risk bez doskonałej odpowiedzi; (2) ŁAGODNA SUPRESJA 0,1–0,5 mU/L — odpowiedź indeterminate, intermediate-risk z doskonałą odpowiedzią ALE bez 5 lat remisji; (3) SUBSTYTUCJA 0,5–2,0 mU/L — pT1aN0M0 od razu po operacji, pT1b–T2N0M0 z doskonałą odpowiedzią, lub doskonała odpowiedź utrzymywana ≥ 5 lat. UNIKAĆ TSH > 2,0 mU/L poza krótkimi okresami stymulacji. METODA: TSH III generacji, oznaczany rano przed dawką L-T4, co 3–6 miesięcy w pierwszych latach. POWIKŁANIA długotrwałej supresji u dorosłych: migotanie przedsionków (zwłaszcza > 65 r.ż.), osteoporoza pomenopauzalna, przerost mięśnia sercowego — rozważyć kardioprotekcję β-blokerem lub ACEI przy długotrwałej pełnej supresji.' },
            { id: 'thyroglobulin',
              label: 'Tg (tyreoglobulina) — bazalna',
              note: 'Po TT + ¹³¹I: cel < 0,2 ng/mL (super-sensitive). Wybrać protokół „Po total thyroidectomy — bazalny (na LT4)" w polu „Test diagnostyczny". Jedno laboratorium, jedna metoda — kinetyka Tg w czasie zależy od porównywalności pomiarów.',
              description: 'Tyreoglobulina (Tg) niestymulowana — pomiar przy normalnym dawkowaniu L-tyroksyny, GŁÓWNY marker nawrotu po totalnej tyreoidektomii. Tg jest produkowana wyłącznie przez komórki pęcherzykowe tarczycy (zdrowe lub nowotworowe) — po TT+¹³¹I, jeżeli pozostała tkanka została zniszczona, Tg powinna być NIEWYKRYWALNA. WARTOŚCI DIAGNOSTYCZNE (PTE 2022): super-sensitive Tg < 0,2 ng/mL = doskonała odpowiedź; 0,2–1 ng/mL = odpowiedź nieokreślona; ≥ 1 ng/mL = niepełna odpowiedź biochemiczna. KINETYKA: czas podwojenia Tg (Tg-DT) krótszy niż 1 rok przemawia za agresywnym nawrotem; Tg-DT > 1 rok — mniej agresywny przebieg. METODOLOGIA: metoda PREFEROWANA — super-sensitive (LC-MS/MS lub immunoassay 4. generacji o funkcjonalnej czułości ≤ 0,1 ng/mL), standaryzacja do CRM 457. KLUCZOWE: jedno laboratorium, jedna metoda przez cały okres obserwacji — porównanie wyników z różnych laboratoriów jest niemiarodajne. PUŁAPKI: (1) anty-Tg INTERFERUJĄ z immunoassay Tg (fałszywie niskie); (2) biotyna w wysokich dawkach (suplementy „włosy/skóra") interferuje; (3) heterofilne przeciwciała → fałszywie wysokie wyniki.' },
            { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG (anty-Tg)',
              note: 'obowiązkowe razem z Tg w każdym pomiarze monitorującym — interferują z immunoassay Tg (fałszywie niskie). Min. raz w roku. Wzrost anty-Tg = możliwy sygnał nawrotu (kryterium biochemical incomplete wg PTE 2022).',
              description: 'Anty-Tg w kontroli pooperacyjnej DTC — pełnią DWA równoległe role: (1) WARTOŚCIOWY MARKER NAWROTU — pojawienie się, wzrost lub utrzymywanie się mierzalnych anty-Tg po radykalnym leczeniu może być pierwszym sygnałem nawrotu (nawet przy ujemnym USG); (2) ALERT METODYCZNY — interferują z immunoassay Tg, dając FAŁSZYWIE NISKIE wartości Tg, maskując nawrót. DLATEGO anty-Tg muszą być oznaczane W KAŻDYM pomiarze razem z Tg. Interpretacja wg PTE 2022 / ATA 2015: (a) SPADEK anty-Tg po radykalnym leczeniu = dobry prognostyk, obniżanie trwa typowo 1–4 lata; (b) STABILNE lub SPADAJĄCE anty-Tg + brak choroby strukturalnej = odpowiedź indeterminate; (c) WZROST anty-Tg w czasie = kryterium biochemical incomplete response, nawet przy niewykrywalnym Tg; (d) ujawnienie nowych anty-Tg u pacjenta wcześniej ujemnego = silne podejrzenie nawrotu autoimmunologicznego/strukturalnego. POSTĘPOWANIE: przy obecnych anty-Tg USG SZYI staje się PODSTAWOWĄ metodą monitorowania (Tg niemiarodajne), uzupełniającą bywa PET/CT.' },
            { ext: 'neck_us', label: 'USG szyi (loża + węzły II–VI)',
              note: 'Podstawowa metoda obrazowa monitorowania. Co 6–12 mies. przez pierwsze 5 lat, dalej rzadziej. Cechy alarmowe węzła: okrągły kształt, utrata wnęki, niejednorodność, torbielowatość, mikrozwapnienia → BAC z oznaczeniem Tg w popłuczynach.',
              description: 'USG szyi w monitorowaniu pooperacyjnym DTC u dorosłych — PODSTAWOWA metoda obrazowa wykrywania nawrotów lokalnych i regionalnych. ANATOMIA OCENY: (1) LOŻA po tyreoidektomii — szukamy resztkowej tkanki tarczycowej lub wznowy miejscowej; (2) WĘZŁY CHŁONNE poziomu II–VI obustronnie (klasyfikacja Robbins) — pole drenażu chłonnego tarczycy. CZĘSTOTLIWOŚĆ: co 6–12 miesięcy przez pierwsze 5 lat, dalej co 12–24 miesięcy (ryzyko nawrotu DTC utrzymuje się przez dziesięciolecia). CECHY ALARMOWE WĘZŁA (każda jedna wskazuje na BAC): (a) okrągły kształt (zwykle owalny u zdrowych); (b) utrata wnęki echogenicznej (hilum); (c) hipoechogeniczność niejednorodna; (d) torbielowate degeneracje (typowe dla przerzutów raka brodawkowatego); (e) mikrozwapnienia; (f) wzmożone, chaotyczne unaczynienie obwodowe (Doppler); (g) wzrost rozmiaru w czasie. BAC: przy podejrzanym węźle ZAWSZE z oznaczeniem Tg w popłuczynach z igły (FNA-Tg) — czulszą metodą niż sama cytologia (próg > 10 ng/mL w popłuczynach przemawia za przerzutem DTC). W obecności anty-Tg w surowicy USG staje się jeszcze ważniejsze, bo Tg w surowicy jest niemiarodajne.' }
          ]
        },
        { name: 'Stymulacja TSH (jeśli wskazana)',
          tests: [
            { id: 'thyroglobulin',
              label: 'Tg (tyreoglobulina) — stymulowana',
              note: 'Stymulacja preferowana rhTSH (Thyrogen) — bez objawów hipotyreozy. Alternatywa: wycofanie LT4 ~4 tyg., cel TSH ≥ 30 mU/L. Wybrać protokół „Po total thyroidectomy — stymulowany" w polu „Test diagnostyczny". Cel: Tg stymulowana < 1 ng/mL (doskonała odpowiedź).',
              description: 'Tg stymulowana — pomiar po wzroście endogennego/egzogennego TSH, który pobudza ewentualną resztkową tkankę tarczycową/nawrotową do wzmożonego wydzielania Tg. ZASTOSOWANIE wg PTE 2022: (1) niepewna Tg niestymulowana u pacjentów niskiego/pośredniego ryzyka po radykalnym leczeniu — co najmniej JEDEN test potwierdzający 3–5 lat po początkowym rozpoznaniu remisji; (2) podejrzenie nawrotu przy niewykrywalnej Tg niestymulowanej i niejednoznacznym obrazowaniu; (3) przed planowaną terapią ¹³¹I — ocena tła Tg. METODY STYMULACJI: (a) PREFEROWANA — rhTSH (rekombinowany TSH, Thyrogen) — 2 wstrzyknięcia i.m. 0,9 mg w odstępie 24 h, pomiar Tg w dniu 5; bez objawów hipotyreozy, krótsze; (b) ALTERNATYWA — wycofanie L-tyroksyny przez ~4 tygodnie (przejście na T3 przez 2 tyg., potem przerwa 2 tyg.) — cel TSH ≥ 30 mU/L; tańsze, ale powoduje objawy ciężkiej niedoczynności. KRYTERIA INTERPRETACJI: Tg stymulowana < 1 ng/mL po TT+¹³¹I = doskonała odpowiedź; < 2 ng/mL po TT bez ¹³¹I = doskonała odpowiedź; > 10 ng/mL = niepełna odpowiedź biochemiczna; > 100 ng/mL bez lokalizacji ogniska → rozważyć empiryczne leczenie ¹³¹I (pusty WBS).' }
          ]
        },
        { name: 'WBS i obrazowanie funkcjonalne',
          tests: [
            { ext: 'wbs_i131', label: 'WBS — scyntygrafia całego ciała z ¹³¹I',
              note: 'Diagnostyczny WBS przed leczeniem RAI NIE jest konieczny. Post-therapy WBS obowiązkowy po każdej dawce RAI. W remisji rutynowy okresowy WBS niewskazany — wzrost Tg jest pierwszym sygnałem.',
              description: 'WBS (whole body scan) z ¹³¹I — obrazowanie funkcjonalne wykorzystujące pobierający jod tkanka tarczycowa/nowotworowa. ROLA w monitorowaniu DTC u dorosłych (PTE 2022): (1) POST-THERAPY WBS — obowiązkowy po każdej dawce RAI (5–7 dni po podaniu); pozwala ocenić skuteczność ablacji i wykryć nieoczekiwane przerzuty; (2) DIAGNOSTYCZNY WBS przed leczeniem RAI — NIE jest konieczny rutynowo (Cz. VII, 11.2 PTE 2022); (3) W REMISJI — rutynowy okresowy WBS NIE jest wskazany — wzrost Tg jest pierwszym, czulszym sygnałem nawrotu; (4) POSZUKIWANIE OGNISKA przy stymulowanym Tg > 10 ng/mL bez lokalizacji w USG/PET — uzasadniony empiryczny WBS po terapii ¹³¹I. STYMULACJA TSH: preferowana rhTSH lub wycofanie LT4 (jak dla Tg stim).' },
            { ext: 'pet_ct', label: '¹⁸F-FDG PET/CT',
              note: 'Wskazane przy stymulowanym Tg > 10 ng/mL z czasem podwojenia < 2 lat i ujemnym WBS (DTC jodorefrakcyjny). PET/CT wykrywa odróżnicowane ogniska niewychwytujące jodu.',
              description: '¹⁸F-FDG PET/CT w monitorowaniu DTC — wykrywa ogniska o WYSOKIM METABOLIZMIE GLUKOZY (typowo nowotworowe). Komplementarne do WBS — gdy WBS jest ujemny (brak wychwytu jodu), PET/CT może wykryć odróżnicowane ogniska o niskim wychwycie jodu („flip-flop phenomenon"). WSKAZANIA (PTE 2022): (1) stymulowane Tg > 10 ng/mL z czasem podwojenia < 2 lat + ujemny WBS — silna sugestia nawrotu jodorefrakcyjnego; (2) high-risk DTC z mutacją BRAF (cechy bardziej agresywne, częściej jodorefrakcyjne); (3) ocena rozległości nawrotu przed leczeniem operacyjnym lub TKI. PRZYGOTOWANIE: na czczo 4–6 h, glikemia < 200 mg/dL (hiperglikemia zaburza wynik). KOSZTY i DOSTĘPNOŚĆ: badanie drogie i ograniczone do ośrodków referencyjnych w PL — wskazania ścisłe.' }
          ]
        },
        { name: 'Rak rdzeniasty tarczycy (MTC) — kontrola',
          tests: [
            { ext: 'calcitonin', label: 'Kalcytonina',
              note: 'GŁÓWNY marker MTC. Po radykalnej operacji cel: niewykrywalna lub < 10 pg/mL. Wzrost = nawrót. Czas podwojenia (Ct-DT) ma wartość prognostyczną — krótszy niż 1 rok przemawia za agresywnym nawrotem; > 2 lat — mniej agresywny.',
              description: 'Kalcytonina w monitorowaniu raka rdzeniastego tarczycy (MTC) — pełni rolę analogiczną do Tg w DTC. MTC powstaje z komórek C produkujących kalcytoninę → jest to specyficzny marker tej linii komórkowej. CELE TERAPEUTYCZNE po radykalnej operacji (zwykle TT + limfadenektomia centralna): kalcytonina niewykrywalna lub < 10 pg/mL. KINETYKA: czas podwojenia kalcytoniny (Ct-DT) ma większą wartość prognostyczną niż pojedyncza wartość — Ct-DT < 6 miesięcy = agresywny nawrót, gorszy prognostyk; Ct-DT > 2 lat = wolna progresja, lepszy prognostyk. Interpretacja: po TT — jakiekolwiek wykrywalne kalcytonina sugeruje resztkową/nawrotową chorobę → poszukiwanie ogniska (USG szyi, CT klatki piersiowej, MR wątroby, PET/CT z DOTATATE). MEN2 (mutacja RET): u wszystkich pacjentów z MTC obowiązkowy test mutacji RET — gdy dodatni, skrining krewnych I stopnia i profilaktyczna tyreoidektomia u dzieci nosicieli (timing zależny od wariantu mutacji).' },
            { ext: 'cea', label: 'CEA — marker uzupełniający w MTC',
              note: 'Wzrasta równolegle z kalcytoniną w nawrocie MTC. Czas podwojenia CEA (CEA-DT) ma podobną wartość prognostyczną jak Ct-DT. Mniej swoisty (wzrasta też w innych nowotworach, paleniu papierosów).' }
          ]
        }
      ],
      guideline: 'PTE 2022 dorośli (Jarząb i wsp.) / ATA 2015 (Haugen i wsp.)',
      sources: [
        'Jarząb B, Dedecjus M, Lewiński A i wsp. Diagnostics and treatment of differentiated thyroid cancer in adult patients — Recommendations of Polish Scientific Societies and the National Oncological Strategy. 2022 Update. Endokrynologia Polska. 2022;73(2):173-300. DOI: 10.5603/EP.a2022.0028.',
        'Haugen BR, Alexander EK, Bible KC, et al. 2015 American Thyroid Association Management Guidelines for Adult Patients with Thyroid Nodules and Differentiated Thyroid Cancer. Thyroid. 2016;26(1):1-133.',
        'Tuttle RM, Tala H, Shah J, et al. Estimating risk of recurrence in differentiated thyroid cancer after total thyroidectomy and radioactive iodine remnant ablation: using response to therapy variables to modify the initial risk estimates predicted by the new American Thyroid Association staging system. Thyroid. 2010;20(12):1341-1349.',
        'PDF PTE 2022 (open access, CC BY-NC-ND): https://journals.viamedica.pl/endokrynologia_polska/article/view/EP.a2022.0028'
      ]
    },

    thyroid_cancer_followup_kids: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Cel monitorowania DTC po tyreoidektomii (dzieci)',
            body: 'Monitorowanie dziecka po leczeniu zróżnicowanego raka tarczycy (DTC — głównie rak brodawkowaty, rzadziej pęcherzykowy/onkocytarny) wg polskich wytycznych Handkiewicz-Junak i wsp. 2024. U dzieci DTC najczęściej rozpoznawany jest w stadium bardziej zaawansowanym niż u dorosłych (większy odsetek N1 i M1 — głównie płucnych), ale ROKOWANIE DŁUGOTERMINOWE jest LEPSZE niż u dorosłych (śmiertelność < 2% w 10-letnim follow-up). UWAGA — różnice względem dorosłych: (1) inne progi dynamicznej stratyfikacji odpowiedzi (Tg pediatryczne wyższe); (2) inne ramy czasowe supresji TSH zależnej od ryzyka (12 mies. low / 5 lat intermediate / ≥ 10 lat high); (3) większy nacisk na monitorowanie powikłań długotrwałej supresji (ECHO, DXA, wzrost dziecka); (4) cała pediatryczna ścieżka diagnostyczno-terapeutyczna dostępna w module DocPro „Rak tarczycy u dzieci".'
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'list-search',
            title: 'Powiązany moduł w aplikacji',
            body: 'Pełna ścieżka pooperacyjna u dzieci (klasyfikacja ATA 2015 dziecięca low/intermediate/high risk, kryteria odstąpienia od ¹³¹I, klasyfikacja TNM pediatryczna, wybór operacji węzłowej, leczenie systemowe MTC, terapia ukierunkowana) jest dostępna w DocPro → moduł „Rak tarczycy u dzieci" (skrypt thyroid_cancer_kids.js). Panel ten skupia się wyłącznie na BIOCHEMICZNYM i OBRAZOWYM monitorowaniu pacjenta pediatrycznego po radykalnym leczeniu DTC.'
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: 'Dynamiczna stratyfikacja odpowiedzi — Handkiewicz 2024 (dzieci)',
            steps: [
              {
                number: 1,
                title: 'Po totalnej tyreoidektomii + ¹³¹I',
                sublabel: 'klasyczne leczenie u dziecka z DTC',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana ≤ 1 lub Tg stymulowana ≤ 2 ng/mL + obrazowanie ujemne + anty-Tg nieoznaczalne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'WSZYSTKIE 3 kryteria muszą być spełnione łącznie.',
                      'Tg niestymulowana = pomiar tyreoglobuliny przy normalnym dawkowaniu L-tyroksyny u dziecka (bez stymulacji rhTSH ani wycofania LT4). Cel pediatryczny: ≤ 1 ng/mL — wyższy próg niż u dorosłych (< 0,2), bo u dzieci dopuszcza się większą rezerwę diagnostyczną.',
                      'Tg stymulowana = pomiar po podaniu rhTSH (Thyrogen — preferowane u dziecka, bo bez objawów hipotyreozy) lub po wycofaniu L-tyroksyny przez ~4 tygodnie (cel TSH ≥ 30 mU/L). Cel pediatryczny: ≤ 2 ng/mL.',
                      'Obrazowanie ujemne = USG szyi (preferowane — bez promieniowania) bez podejrzanych zmian; w razie wątpliwości WBS lub CT klatki piersiowej (poszukiwanie M1 płucnych — typowych u dzieci).',
                      'Anty-Tg nieoznaczalne = przeciwciała anty-tyreoglobulinie poniżej granicy detekcji testu. UWAGA: u dzieci anty-Tg częściej współwystępują wyjściowo z autoimmunologicznym tłem (Hashimoto + DTC) niż u dorosłych.',
                      'POSTĘPOWANIE: deeskalacja supresji TSH zgodnie z ramami czasowymi ryzyka (niskie ryzyko — substytucja po 12 miesiącach; pośrednie — po 5 latach; wysokie — po ≥ 10 latach). Cel substytucji: TSH < 2 mU/L.'
                    ]
                  },
                  {
                    threshold: 'Odpowiedź nieokreślona',
                    action: 'Tg stymulowana wykrywalna, ale < 10 ng/mL; lub niewielki wychwyt ¹³¹I w loży po TT; lub anty-Tg stabilne/zanikające — przy braku choroby strukturalnej',
                    variant: 'warning', icon: 'route',
                    detail: [
                      'Kategoria pośrednia — wynik niejednoznaczny, ale BEZ jawnej choroby strukturalnej.',
                      'Tg stymulowana wykrywalna < 10 ng/mL — po stymulacji rhTSH/wycofaniu LT4 wartość niesie sygnał, ale nie jest jednoznaczna; nie przekracza progu „bio incomplete".',
                      'Niewielki wychwyt ¹³¹I w loży po tyreoidektomii (scyntygrafia WBS) — może odpowiadać resztkowej zdrowej tkance tarczycy, nie nawrotowi.',
                      'Anty-Tg stabilne lub zanikające bez choroby strukturalnej = przeciwciała anty-tyreoglobulinie, które wcześniej były dodatnie i obecnie UTRZYMUJĄ SIĘ na tym samym poziomie (stabilne, nie rosną) LUB STOPNIOWO SPADAJĄ — przy braku patologii widocznej w USG/innym obrazowaniu jest to OBRAZ TYPOWY DLA WYGASZANIA AUTOIMMUNIZACJI po radykalnym leczeniu (anty-Tg obniżają się 1–4 lata po skutecznej terapii).',
                      'POSTĘPOWANIE: kontynuacja supresji TSH 0,1–0,5 mU/L; intensyfikacja monitorowania (Tg + anty-Tg co 3–6 miesięcy, USG co 6 miesięcy); powtórzenie WBS po 12 miesiącach.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana > 1 lub Tg stymulowana > 10 ng/mL lub narastające miano anty-Tg w czasie',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'wystarczy JEDNO Z 3 kryteriów. Obecna choroba biochemiczna, ALE bez jawnej choroby strukturalnej w obrazowaniu.',
                      'Tg niestymulowana > 1 ng/mL — pomiar na normalnej dawce L-tyroksyny u dziecka. Próg pediatryczny jest WYŻSZY niż u dorosłych (> 1 vs ≥ 1 dla dorosłych), bo u dzieci dopuszcza się większą rezerwę.',
                      'Tg stymulowana > 10 ng/mL — po stymulacji wartość jednoznacznie wskazuje na obecność tkanki produkującej tyreoglobulinę.',
                      'Narastające miano anty-Tg w czasie = WZROST przeciwciał anty-tyreoglobulinie w kolejnych pomiarach (NIE spadek, NIE stabilizacja) — możliwy pierwszy sygnał nawrotu nawet przy niewykrywalnym Tg (anty-Tg interferują z immunoassay Tg).',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; rozważyć drugą dawkę ¹³¹I (zwłaszcza przy Tg stymulowanym > 100 ng/mL bez lokalizacji ogniska — empiryczne leczenie); skierowanie do ośrodka referencyjnego pediatrycznego.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu — niezależnie od wartości Tg i anty-Tg',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'NAJGORSZA z 4 kategorii — wymaga aktywnego leczenia. U dzieci wymaga skierowania do ośrodka referencyjnego pediatrycznego.',
                      'Choroba LOKALNA: wznowa w loży po tyreoidektomii (USG, MR szyi).',
                      'Choroba REGIONALNA: podejrzane węzły chłonne szyi (poziomy II–VI) — cechy alarmowe: okrągły kształt, utrata wnęki, niejednorodność, torbielowate degeneracje, mikrozwapnienia → BAC z oznaczeniem Tg w popłuczynach z igły.',
                      'Choroba ODLEGŁA (M1): u DZIECI najczęściej PŁUCNA (~30% przypadków wysokiego ryzyka), znacznie rzadziej kości; ogniska bywają submillimetrowe, niewidoczne w CT, ale wychwytujące jod w WBS.',
                      'WAŻNE: rozpoznanie postawione W OBRAZOWANIU, niezależnie od poziomu Tg.',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; reoperacja gdy zmiana resekcyjna; leczenie ¹³¹I (dziecko z M1 płucnym dobrze odpowiada na RAI); w jodorefrakcyjnym DTC — terapia ukierunkowana (TKI: sorafenib, lenwatynib) w ośrodku referencyjnym pediatrycznym.'
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'Po totalnej tyreoidektomii BEZ ¹³¹I',
                sublabel: 'DTC niskiego ryzyka u dziecka, ablacja jodem promieniotwórczym pominięta',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana ≤ 1 lub Tg stymulowana ≤ 2 ng/mL + obrazowanie ujemne + anty-Tg nieoznaczalne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'WSZYSTKIE 3 kryteria muszą być spełnione łącznie. Progi takie same jak po TT + ¹³¹I.',
                      'Tg niestymulowana ≤ 1 ng/mL — bez ablacji może pozostać resztkowa zdrowa tkanka, ale Tg powinno być niskie.',
                      'Tg stymulowana ≤ 2 ng/mL — po rhTSH lub wycofaniu LT4.',
                      'Obrazowanie ujemne — USG szyi bez podejrzanych zmian.',
                      'POSTĘPOWANIE: substytucja TSH 0,5–2,0 mU/L (lub po pediatrycznym ramie czasowym ryzyka).'
                    ]
                  },
                  {
                    threshold: 'Odpowiedź nieokreślona',
                    action: 'Tg niestymulowana 0,2–5 lub Tg stymulowana 2–10 ng/mL; lub anty-Tg stabilne/zanikające bez choroby strukturalnej',
                    variant: 'warning', icon: 'route',
                    detail: [
                      'Wartości w „szarej strefie" interpretacji.',
                      'Tg niestymulowana 0,2–5 ng/mL — może odzwierciedlać resztkową zdrową tkankę tarczycy, ale wymaga monitorowania kinetyki (czasu podwojenia).',
                      'Tg stymulowana 2–10 ng/mL — w „szarej strefie" interpretacji.',
                      'Anty-Tg stabilne/zanikające bez choroby strukturalnej = anty-Tg wcześniej dodatnie, utrzymują się lub spadają, bez patologii widocznej w obrazowaniu (wygaszanie autoimmunizacji po skutecznym leczeniu).',
                      'POSTĘPOWANIE: kontynuacja supresji TSH 0,1–0,5 mU/L; powtórzenie pomiaru Tg za 6 miesięcy z oceną kinetyki.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana > 5 lub Tg stymulowana > 10 ng/mL lub narastające Tg / narastające anty-Tg w kolejnych pomiarach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'wystarczy JEDNO Z 3 kryteriów. Bez ablacji ¹³¹I trudniej odróżnić zdrową resztkową tkankę od nawrotu, dlatego ROSNĄCE Tg jest istotnym sygnałem.',
                      'Tg niestymulowana > 5 ng/mL — w kontekście braku ablacji nadal podejrzane.',
                      'Tg stymulowana > 10 ng/mL — jednoznaczne podejrzenie tkanki nowotworowej.',
                      'Narastające Tg w czasie przy porównywalnym TSH = WZROST kolejnych pomiarów (kinetyka) — ważniejszy niż wartość bezwzględna w obrębie progów.',
                      'Narastające anty-Tg = wzrost przeciwciał w czasie.',
                      'POSTĘPOWANIE: rozważyć uzupełniającą ablację ¹³¹I; pełna supresja TSH < 0,1 mU/L; intensyfikacja obrazowania (CT klatki piersiowej u dziecka — typowe M1 płucne).'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Wznowa LOKALNA (loża po TT), REGIONALNA (węzły szyi) lub ODLEGŁA (M1, u dzieci typowo płucne).',
                      'POSTĘPOWANIE: pełna supresja TSH < 0,1 mU/L; reoperacja; uzupełniająca ablacja ¹³¹I; w jodorefrakcyjnym — TKI w ośrodku referencyjnym.'
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'Po lobektomii (oszczędzającej operacji)',
                sublabel: 'pozostawiona druga połowa tarczycy — fizjologicznie produkuje Tg',
                options: [
                  {
                    threshold: 'Doskonała odpowiedź',
                    action: 'Tg niestymulowana stabilna < 30 ng/mL + obrazowanie ujemne + anty-Tg nieoznaczalne',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Próg Tg ZNACZNIE wyższy (< 30 ng/mL) niż po TT — bo pozostawiona druga połowa tarczycy fizjologicznie produkuje tyreoglobulinę.',
                      'Tg niestymulowana stabilna = pomiar przy normalnej funkcji tarczycy (TSH w normie, dawka LT4 substytucyjna lub bez LT4) z BRAKIEM TRENDU WZROSTOWEGO w kolejnych pomiarach.',
                      'Obrazowanie ujemne — USG szyi bez podejrzanych zmian w pozostawionym płacie ani w węzłach chłonnych.',
                      'Anty-Tg nieoznaczalne — przeciwciała poniżej granicy detekcji testu.',
                      'POSTĘPOWANIE: substytucja TSH 0,5–2,0 mU/L; kontrola roczna USG + Tg + anty-Tg.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź biochemiczna',
                    action: 'Tg niestymulowana > 30 ng/mL lub narastające Tg / narastające anty-Tg w kolejnych pomiarach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'Tg niestymulowana > 30 ng/mL — wartość przekracza fizjologiczną produkcję przez pozostawioną zdrową tkankę.',
                      'Narastające Tg w czasie przy porównywalnym TSH — kinetyka istotniejsza niż wartość bezwzględna w sytuacji pozostawionej tarczycy.',
                      'Narastające anty-Tg = wzrost przeciwciał w kolejnych pomiarach (NIE stabilizacja, NIE spadek).',
                      'POSTĘPOWANIE: dokładne obrazowanie (USG, w razie wątpliwości MR/CT) celem wykluczenia struktury; rozważyć DOTYREOIDEKTOMIĘ (drugą operację — usunięcie pozostałego płata) jeśli podejrzenie wznowy; konsultacja w ośrodku referencyjnym pediatrycznym.'
                    ]
                  },
                  {
                    threshold: 'Niepełna odpowiedź strukturalna',
                    action: 'Obecna choroba widoczna w obrazowaniu',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Wznowa w pozostawionym płacie LUB w węzłach chłonnych szyi LUB ogniska odległe (u dzieci najczęściej płucne).',
                      'BAC węzła podejrzanego z oznaczeniem Tg w popłuczynach z igły.',
                      'POSTĘPOWANIE: dotyreoidektomia (drugi etap operacji) + limfadenektomia centralna/boczna jeśli wskazana; po dopełnieniu operacji rozważyć leczenie ¹³¹I; pełna supresja TSH < 0,1 mU/L.'
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Cele i ramy czasowe supresji TSH (Handkiewicz 2024)',
            items: [
              { label: 'Niskie ryzyko — supresja 0,1–0,5 mU/L przez 12 mies.', text: 'po roku, jeśli odpowiedź doskonała → przejście na substytucję (TSH < 2 mU/L).' },
              { label: 'Pośrednie ryzyko — supresja 0,1–0,5 mU/L przez 5 lat', text: 'po 5 latach z doskonałą odpowiedzią → przejście na substytucję; ostrożność z deeskalacją u młodzieży w trakcie wzrostu.' },
              { label: 'Wysokie ryzyko — supresja 0,1–0,5 mU/L przez ≥ 10 lat', text: 'możliwe skrócenie wg dynamicznej stratyfikacji (excellent response utrzymujący się > 5 lat). Bardzo wysokie ryzyko (M1) lub przetrwała choroba — supresja bezterminowa.' },
              { label: 'Przetrwała choroba lub nawrót — pełna supresja TSH < 0,1 mU/L', text: 'utrzymywana do uzyskania remisji; po remisji deeskalacja zgodnie z ramami ryzyka.' },
              { label: 'bezwzględnie unikać TSH > 2 mU/L w fazie supresji', text: 'oraz wymuszenia pełnej supresji bez wskazania klinicznego — ryzyko kardiotoksyczności rozwojowej i utraty masy kostnej u dziecka.' }
            ]
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'mood-kid',
            title: 'Monitorowanie powikłań długotrwałej supresji TSH u dziecka',
            body: 'Supresja TSH < 0,5 mU/L > 12 miesięcy u dziecka wymaga BAZOWYCH i okresowych kontrol: (1) ECHO SERCA z oceną kurczliwości skurczowo-rozkurczowej co 12–24 mies. — wczesne wykrycie przerostu mięśnia sercowego i zaburzeń diastoły indukowanych nadczynnościowymi efektami egzogennej tyroksyny; (2) DXA (densytometria) co 12–24 mies. — ocena gęstości mineralnej kości (cel: Z-score > -2,0); (3) ocena WZROSTU i wieku kostnego raz w roku — supresja może wpływać na końcowy wzrost; (4) ocena DOJRZEWANIA Tannera u młodzieży; (5) badania funkcji wątroby (ALAT, AspAT) — supresja zwiększa metabolizm wątrobowy. Po zakończeniu pediatrycznej opieki (zwykle 18 r.ż.) — przekazanie do ośrodka dla dorosłych z kompletną dokumentacją (klasyfikacja TNM, daty operacji i ¹³¹I, dotychczasowe Tg/TgAb, USG, leczenie).'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Częstotliwość monitorowania serologicznego i obrazowego (pediatria)',
            items: [
              { label: 'Niskie ryzyko + doskonała odpowiedź', text: 'TSH co 6 mies., Tg+TgAb co 12 mies., USG szyi raz w roku. Po ≥ 5 latach remisji — co 12–24 mies.' },
              { label: 'Pośrednie ryzyko / wszystkie z indeterminate / bio incomplete', text: 'TSH co 3–6 mies., Tg+TgAb co 3–6 mies., USG szyi co 6–12 mies., WBS przy podejrzeniu nawrotu.' },
              { label: 'Wysokie ryzyko / structural incomplete / M1 (płuca)', text: 'TSH co 3 mies., Tg+TgAb co 3 mies., USG co 3–6 mies., CT klatki piersiowej co 6–12 mies. (M1 płucne — częste u dzieci), WBS po każdej dawce ¹³¹I, PET/CT przy podejrzeniu jodorefrakcyjności.' },
              { label: 'Po radykalnym leczeniu — TgAb mogą obniżać się 1–4 lat', text: 'oczekiwana kinetyka po skutecznym leczeniu. WZROST TgAb w czasie = możliwy pierwszy sygnał nawrotu; sam wzrost stanowi kryterium biochemical incomplete response (nawet przy niewykrywalnym Tg).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (po total thyroidectomy u dziecka)',
          tests: [
            { id: 'tsh',
              note: 'Cel TSH zależny od ryzyka pooperacyjnego (ATA 2015 pediatryczne) ORAZ dynamicznej stratyfikacji odpowiedzi (Handkiewicz 2024). Niskie ryzyko — 12 mies. supresji 0,1–0,5; pośrednie — 5 lat; wysokie — ≥ 10 lat. Po doskonałej odpowiedzi utrzymywanej w ramach ryzyka — przejście na substytucję (TSH < 2 mU/L). Powikłania długotrwałej supresji u dziecka — patrz callout w summary.',
              description: 'TSH w kontroli pooperacyjnej DTC u dziecka — sterownik leczenia supresyjnego L-tyroksyną, dawkowanego inaczej niż u dorosłych. RAMY CZASOWE wg Handkiewicz-Junak 2024: (1) niskie ryzyko (pT1–T2N0M0, brak ETE, klasyczny PTC) — supresja 0,1–0,5 mU/L przez 12 miesięcy, po roku przy doskonałej odpowiedzi → substytucja; (2) pośrednie ryzyko (mikroprzerzuty LN, ETE micro, wieloogniskowość, agresywne warianty histologiczne) — supresja 5 lat; (3) wysokie ryzyko (rozległe ETE, makroprzerzuty LN, M1, nieradykalna resekcja) — supresja ≥ 10 lat. PRZETRWAŁA CHOROBA lub NAWRÓT — pełna supresja < 0,1 mU/L do remisji. POWIKŁANIA u dziecka (krytyczne!): kardiotoksyczność rozwojowa (przerost LK), utrata masy kostnej, zaburzenia wzrostu, opóźnienie dojrzewania. MONITORING POWIKŁAŃ: ECHO z oceną kurczliwości oraz DXA co 12–24 mies. przy supresji > 12 mies., ocena tempa wzrostu i wieku kostnego raz w roku.' },
            { id: 'thyroglobulin',
              label: 'Tg (tyreoglobulina) — bazalna',
              note: 'Po TT u dziecka: progi pediatryczne wyższe niż dorosłe — Tg niestymulowana ≤ 1 lub Tg stymulowana ≤ 2 ng/mL = doskonała odpowiedź. Wybrać protokół „Po total thyroidectomy — bazalny (na LT4)" w polu „Test diagnostyczny". Jedno laboratorium, jedna metoda przez cały follow-up.',
              description: 'Tyreoglobulina (Tg) w pediatrycznym DTC — główny marker odpowiedzi na leczenie. PROGI PEDIATRYCZNE wg Handkiewicz 2024: (a) po TT+¹³¹I — doskonała odpowiedź: Tg niestymulowana ≤ 1 lub Tg stymulowana ≤ 2 ng/mL (wyższe niż u dorosłych — 0,2 i 1); (b) po TT bez ¹³¹I — analogicznie; (c) po lobektomii — Tg niestymulowana stabilna < 30 ng/mL. KINETYKA: czas podwojenia Tg (Tg-DT) ma wartość prognostyczną podobnie jak u dorosłych. METODOLOGIA: super-sensitive (czułość funkcjonalna ≤ 0,1 ng/mL), standaryzacja CRM 457, jedno laboratorium przez cały follow-up. PUŁAPKI takie same jak u dorosłych: anty-Tg interferują, biotyna interferuje, heterofilne przeciwciała. RÓŻNICE WZGLĘDEM DOROSŁYCH: (1) progi pediatryczne wyższe — większa rezerwa diagnostyczna; (2) dziecko może mieć fizjologicznie nieco wyższe Tg do zakończenia wzrostu; (3) anty-Tg ujawniają się częściej u dzieci z autoimmunologicznym tłem (Hashimoto + DTC).' },
            { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG (anty-Tg)',
              note: 'obowiązkowe razem z Tg w każdym pomiarze monitorującym u dziecka. Min. raz w roku. Wzrost = kryterium biochemical incomplete (Handkiewicz 2024). Spadek w 1–4 lat po radykalnym leczeniu = dobry prognostyk.',
              description: 'Anty-Tg w pediatrycznym monitorowaniu DTC — pełnią identyczną rolę jak u dorosłych: marker nawrotu + alert metodyczny (interferują z immunoassay Tg → fałszywie niskie). Interpretacja PEDIATRYCZNA: SPADEK po radykalnym leczeniu (1–4 lat) = dobry prognostyk; STABILNE/SPADAJĄCE + brak choroby strukt. = odpowiedź nieokreślona; WZROST w czasie = kryterium niepełnej odpowiedzi biochemicznej (nawet przy niewykrywalnym Tg). U DZIECI częste współistnienie autoimmunologicznego tła (Hashimoto) — wyjściowo dodatnie anty-Tg u ~20–30% pacjentów pediatrycznych z DTC; wymaga to interpretacji kinetyki, nie pojedynczej wartości.' },
            { ext: 'neck_us', label: 'USG szyi (loża + węzły II–VI)',
              note: 'Podstawowa metoda obrazowa monitorowania pediatrycznego. Częstotliwość zależna od ryzyka: niskie — raz w roku, pośrednie — co 6–12 mies., wysokie — co 3–6 mies. Cechy alarmowe takie same jak u dorosłych. Wymaga doświadczonego radiologa pediatrycznego.',
              description: 'USG szyi w monitorowaniu DTC u dziecka — podstawowa metoda obrazowa, podobnie jak u dorosłych. CZĘSTOTLIWOŚĆ: niskie ryzyko — raz w roku przez 5 lat; pośrednie — co 6–12 mies.; wysokie — co 3–6 mies. CECHY ALARMOWE WĘZŁA identyczne jak u dorosłych: okrągły kształt, utrata wnęki, niejednorodność, torbielowate degeneracje, mikrozwapnienia → BAC z oznaczeniem Tg w popłuczynach. WYZWANIA TECHNICZNE: (1) anatomia szyi dziecka mała → wymaga sondy wysokoczęstotliwościowej (12–18 MHz) i doświadczonego operatora; (2) niewielka rozróżnialność reaktywnych vs. metastatycznych węzłów u młodszych dzieci (limfocytoza wieku rozwojowego); (3) potrzeba spokojnej współpracy dziecka — w młodszym wieku rozważyć sedację. WSPÓŁPRACA z chirurgiem pediatrycznym: USG przedoperacyjne ma znaczenie dla planowania zakresu limfadenektomii.' }
          ]
        },
        { name: 'Stymulacja TSH (jeśli wskazana)',
          tests: [
            { id: 'thyroglobulin',
              label: 'Tg (tyreoglobulina) — stymulowana',
              note: 'U dziecka stymulacja preferowana rhTSH (Thyrogen) — bez objawów hipotyreozy. Alternatywa: wycofanie LT4 ~4 tyg., cel TSH ≥ 30 mU/L. Wybrać protokół „Po total thyroidectomy — stymulowany" w polu „Test diagnostyczny". Cel pediatryczny: Tg stymulowana ≤ 2 ng/mL (doskonała odpowiedź).',
              description: 'Tg stymulowane u dziecka — analogicznie do dorosłych, ale z pediatrycznymi progami interpretacyjnymi. WSKAZANIA: niepewny Tg bazalny przy follow-up DTC, przed planowaną terapią ¹³¹I, podejrzenie nawrotu przy niejednoznacznym USG. METODA: PREFEROWANA rhTSH 0,9 mg i.m. × 2 dni — bez objawów hipotyreozy (krytyczne u dziecka — wpływ na wzrost, naukę). Wycofanie LT4 ~4 tyg. jest dopuszczalne, ale skutkuje miesiącem objawów hipotyreozy → znaczący wpływ na funkcjonowanie dziecka. PROGI PEDIATRYCZNE: Tg stim ≤ 2 ng/mL → doskonała odpowiedź; 2–10 → możliwa przetrwała choroba; > 10 → biochemical incomplete; > 100 → empiryczne leczenie ¹³¹I (pusty WBS).' }
          ]
        },
        { name: 'WBS i obrazowanie funkcjonalne (pediatryczne)',
          tests: [
            { ext: 'wbs_i131', label: 'WBS — scyntygrafia całego ciała z ¹³¹I',
              note: 'Post-therapy WBS obowiązkowy po każdej dawce ¹³¹I u dziecka — ocena skuteczności ablacji oraz wykrycie M1 (płuca u ~30% dzieci z high-risk DTC). Diagnostyczny WBS przed RAI niekonieczny rutynowo.',
              description: 'WBS u dziecka — kluczowy w wysokim ryzyku, gdzie M1 (najczęściej płucne) występuje u ~30% pacjentów pediatrycznych. POST-THERAPY WBS po każdej dawce ¹³¹I obowiązkowy — ocena skuteczności ablacji oraz wykrycie nieoczekiwanych ognisk (zwłaszcza płucnych — mogą być submillimetrowe, niewidoczne w CT, ale wychwytujące jod). DIAGNOSTYCZNY WBS przed RAI — niekonieczny rutynowo, podobnie jak u dorosłych. STYMULACJA TSH: preferowana rhTSH u dziecka.' },
            { ext: 'pet_ct', label: '¹⁸F-FDG PET/CT (wybrane przypadki)',
              note: 'U dziecka stosowane oszczędnie ze względu na dawkę promieniowania. Wskazania: stymulowane Tg > 10 ng/mL z czasem podwojenia < 1–2 lat i ujemnym WBS (DTC jodorefrakcyjny — rzadkie u dzieci, ale możliwe).',
              description: 'PET/CT u dziecka — stosowane z większą ostrożnością niż u dorosłych ze względu na kumulacyjną dawkę promieniowania w wieku rozwojowym. WSKAZANIA wąskie: (1) podejrzenie nawrotu jodorefrakcyjnego (stymulowane Tg > 10 ng/mL + ujemny WBS, zwłaszcza z mutacją BRAF lub TERT — bardzo rzadkie u dzieci); (2) ocena rozległości nawrotu przed leczeniem operacyjnym. ALTERNATYWY: u dziecka w pierwszej kolejności rozważyć CT klatki piersiowej (skuteczne wykrywanie M1 płucnych), MR szyi/wątroby — mniejsza dawka promieniowania niż PET.' }
          ]
        }
      ],
      guideline: 'PTE 2024 dzieci (Handkiewicz-Junak i wsp.) / ATA 2015 pediatric (Francis i wsp.)',
      sources: [
        'Handkiewicz-Junak D, Niedziela M, Lewiński A i wsp. Diagnostyka i leczenie raka tarczycy u dzieci — rekomendacje polskich towarzystw naukowych, aktualizacja 2024. Endokrynologia Polska. 2024;75(6):565-591.',
        'Francis GL, Waguespack SG, Bauer AJ, et al. Management Guidelines for Children with Thyroid Nodules and Differentiated Thyroid Cancer: The American Thyroid Association Guidelines Task Force on Pediatric Thyroid Cancer. Thyroid. 2015;25(7):716-759.',
        'Lazar L, Lebenthal Y, Steinmetz A, et al. Differentiated Thyroid Carcinoma in Pediatric Patients: Comparison of Presentation and Course Between Pre-Pubertal Children and Adolescents. J Pediatr. 2009;154(5):708-714.',
        'Moduł DocPro „Rak tarczycy u dzieci" — thyroid_cancer_kids.js w aplikacji wagaiwzrost.pl (logika ATA 2015 pediatric + Handkiewicz 2024).'
      ]
    },

    autoimmune_thyroid: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja AITD',
            body: 'Autoimmunologiczne choroby tarczycy (AITD — autoimmune thyroid diseases) — najczęstsze: choroba Hashimoto (przewlekłe limfocytarne zapalenie tarczycy, prowadzące zwykle do niedoczynności) i choroba Gravesa-Basedowa (nadczynność z przeciwciałami pobudzającymi receptor TSH). Diagnostyka łączy panel hormonalny (TSH, fT4, ewentualnie fT3), przeciwciała tarczycowe oraz USG tarczycy.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Markery serologiczne',
            items: [
              { label: 'Anty-TPO (przeciwko peroksydazie tarczycowej)', text: 'czułość ~90% w chorobie Hashimoto; dodatnie również w chorobie Gravesa-Basedowa (~50–80%). Podstawowy marker AITD — pierwszy do oznaczenia przy podejrzeniu autoimmunologicznego tła zaburzeń czynności tarczycy.' },
              { label: 'Anty-TG (przeciwko tyreoglobulinie)', text: 'dodatnie u ~60–80% pacjentów z Hashimoto. Marker uzupełniający — przy dodatnim anty-TPO dodaje niewiele; bywa jednak JEDYNYM dodatnim przeciwciałem u części pacjentów.' },
              {
                label: 'TRAb (przeciwko receptorowi TSH)',
                text: 'SWOISTY marker choroby Gravesa-Basedowa:',
                detail: [
                  'Dodatni TRAb praktycznie potwierdza chorobę Gravesa-Basedowa — wg wytycznych ATA 2016 i PTE TRAb jest badaniem PIERWSZEGO RZUTU w różnicowaniu przyczyn tyreotoksykozy.',
                  'Przy potwierdzonym TRAb scyntygrafia i jodochwytność NIE są konieczne — rozpoznanie jest jednoznaczne.',
                  'W ciąży u kobiet z chorobą Gravesa TRAb monitoruje się ze względu na ryzyko tyreotoksykozy płodowej i noworodkowej (przeciwciała IgG przechodzą przez łożysko).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Obraz w USG tarczycy',
            items: [
              {
                label: 'Choroba Hashimoto',
                text: 'typowy obraz autoimmunologicznego zapalenia tarczycy:',
                detail: [
                  'Rozlana hipoechogeniczność miąższu (efekt nacieku limfocytarnego).',
                  'Niejednorodność struktury („pseudo-guzkowość").',
                  'Czasem wole (postać wolowa); w późnej fazie zanik miąższu (postać atroficzna).',
                  'Brak wzmożonego unaczynienia w doplerze (różnicuje od Gravesa).'
                ]
              },
              {
                label: 'Choroba Gravesa-Basedowa',
                text: 'typowy obraz autoimmunologicznej nadczynności:',
                detail: [
                  'Rozlana hipoechogeniczność miąższu.',
                  'WZMOŻONE unaczynienie w badaniu doplerowskim — tzw. „thyroid inferno" (mnogie sygnały przepływu).',
                  'Często wole rozlane (powiększenie gruczołu bez guzków).'
                ]
              },
              { label: 'Wskazania do USG', text: 'badanie zalecane u każdego pacjenta z laboratoryjnymi cechami zaburzenia czynności tarczycy oraz u każdego dziecka z dodatnim wywiadem rodzinnym w kierunku AITD.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (wszystkie AITD)',
          tests: [
            { id: 'tsh',
              note: 'Badanie I rzutu w ocenie czynności tarczycy — w AITD wynik wskazuje stadium choroby (eutyreoza vs subkliniczna niedoczynność vs jawna niedoczynność w Hashimoto; vs tyreotoksykoza subkliniczna lub jawna w Gravesie). Sam dodatni wynik przeciwciał przy prawidłowym TSH nie jest wskazaniem do leczenia.',
              description: 'TSH w AITD — kluczowy wskaźnik do oceny FAZY i KIERUNKU autoimmunologicznego procesu. (1) WCZESNA EUTYREOTYCZNA AITD: prawidłowe TSH + dodatnie anty-TPO/anty-TG — częsta sytuacja u kobiet po 30 r.ż., zwłaszcza z wywiadem rodzinnym AITD. Sam dodatni wynik przeciwciał NIE jest wskazaniem do leczenia — monitorowanie TSH co 6–12 miesięcy. (2) HASHIMOTO Z SUBKLINICZNĄ NIEDOCZYNNOŚCIĄ: TSH 4–10 mIU/L + fT4 prawidłowe + anty-TPO dodatnie. Decyzja o leczeniu indywidualna — czynniki za leczeniem: planowanie ciąży lub ciąża, objawy kliniczne niedoczynności, młodszy wiek, bardzo wysoki tytuł anty-TPO (szybsza progresja). U > 70 r.ż. ostrożność (norma TSH fizjologicznie wyższa). (3) HASHIMOTO JAWNE: TSH > 10 mIU/L lub TSH ↑ + fT4 ↓ — JEDNOZNACZNE wskazanie do leczenia L-tyroksyną. (4) GRAVES SUBKLINICZNY: TSH < 0,4 mIU/L (zwłaszcza < 0,1) + fT4 prawidłowe + TRAb dodatnie. (5) GRAVES JAWNY: TSH < 0,1 + fT4 i/lub fT3 ↑ + TRAb dodatnie. CIĄŻA W AITD: zastosować progi PTE 2021 swoiste dla trymestru (3,18 / 3,44 / 3,53 mIU/L) — kobieta z anty-TPO+ i TSH > 2,5 w I trymestrze ma zwiększone ryzyko poronienia → rozważyć profilaktyczną L-tyroksynę.' },
            { id: 'ft4',
              note: 'Różnicuje stadium AITD — w Hashimoto: prawidłowe (postać kompensowana/subkliniczna) lub obniżone (jawna niedoczynność); w Gravesie: prawidłowe (postać subkliniczna) lub podwyższone (jawna tyreotoksykoza).',
              description: 'fT4 w AITD — uzupełnia TSH do oceny ciężkości i kierunku zaburzenia. W HASHIMOTO: jawna niedoczynność = TSH ↑ + fT4 ↓; postać subkliniczna = TSH ↑ + fT4 prawidłowe; rzadko (Hashitoxicosis, początkowa faza destrukcyjnego zapalenia) — przejściowo fT4 ↑ przed dekompensacją do niedoczynności. W GRAVESIE: jawna tyreotoksykoza = TSH ↓ + fT4 ↑; postać subkliniczna = TSH ↓ + fT4 prawidłowe. MONITOROWANIE LECZENIA: u Hashimoto leczonej L-tyroksyną cel — TSH w normie (zwykle 0,4–2,5), fT4 w połowie/górnej normie; u Gravesa leczonego tyreostatykami — TSH może długo pozostawać zahamowane (do roku po normalizacji obwodowych hormonów), dlatego w pierwszych miesiącach kierujemy się fT4 i fT3.' },
            { ext: 'anti_tpo', label: 'Przeciwciała anty-TPO',
              note: 'Podstawowy marker AITD — czułość ~90% w Hashimoto, dodatnie też w ~50–80% chorób Gravesa. Pierwsze do oznaczenia przy podejrzeniu autoimmunologicznego tła. Sam dodatni wynik bez zaburzeń czynności tarczycy NIE jest wskazaniem do leczenia.',
              description: 'Anty-TPO (przeciwciała przeciwko peroksydazie tarczycowej) — najczulszy marker AITD. Antygen TPO to enzym kluczowy dla biosyntezy hormonów tarczycy (jodowanie tyrozyny, sprzęganie MIT/DIT). CZUŁOŚĆ: ~90% w chorobie Hashimoto; 50–80% w chorobie Gravesa-Basedowa (dodatkowo do TRAb). SWOISTOŚĆ: niższa — przeciwciała występują u 5–15% populacji ogólnej (częściej u kobiet, z wiekiem, w rodzinach z AITD) i NIE WSZYSTKIE osoby z dodatnim anty-TPO rozwiną klinicznie istotną chorobę. Interpretacja MIAN: przy bardzo wysokich tytułach (> 1000 IU/mL) ryzyko progresji subklinicznej niedoczynności do jawnej znacznie wyższe (rocznie ~5%). Przy umiarkowanych tytułach (kilka × górnej granicy) ryzyko niższe, ale wciąż istotne. CIĄŻA: anty-TPO+ zwiększa ryzyko (a) poporodowego zapalenia tarczycy (PPT) ~50% vs 10% (ATA 2017), (b) poronień nawracających (związek istotny choć kontrowersyjny), (c) zaburzeń neurorozwojowych płodu przy niedoczynności matki — dlatego u kobiet w ciąży lub planujących ciążę z anty-TPO+ i TSH > 2,5 rozważyć profilaktyczną L-tyroksynę. SKRINING RODZINNY: u krewnych I stopnia osób z AITD ryzyko wystąpienia AITD jest 7–10× wyższe niż w populacji ogólnej — celowy skrining przy objawach lub planowaniu ciąży.' },
            { ext: 'anti_tg_ab', label: 'Przeciwciała anty-TG',
              note: 'Marker uzupełniający — anty-TPO jest podstawowy; przy dodatnim TPO anty-TG dodaje niewiele. WAŻNE: anty-TG musi być oznaczane RAZEM Z TG po tyreoidektomii (interferują z metodą immunoassay Tg → wynik fałszywie zaniżony).',
              description: 'Anty-TG (przeciwciała przeciwko tyreoglobulinie) — przeciwciała przeciwko głównemu białku magazynującemu hormony tarczycy w pęcherzykach tarczycowych. WYSTĘPOWANIE: dodatnie u 60–80% pacjentów z Hashimoto i 40–60% z Gravesem; w populacji ogólnej ~5–10%. ZASTOSOWANIE: (1) w diagnostyce AITD jako badanie uzupełniające — przy DODATNIM anty-TPO dodaje niewiele, ale w ~3–5% przypadków Hashimoto JEDYNYMI dodatnimi przeciwciałami są anty-TG (anty-TPO ujemne); (2) BARDZO WAŻNE — u pacjentów po TOTAL THYROIDECTOMY (rak tarczycy) — anty-TG MUSI być oznaczane razem z tyreoglobuliną (Tg), ponieważ INTERFERUJĄ z immunoassay Tg (fałszywie zaniżają wynik Tg, co może maskować wznowę raka). Wzrastający tytuł anty-TG po tyreoidektomii (mimo „prawidłowej" Tg) MOŻE oznaczać aktywność resztkowego/wznowy tkanki tarczycy lub raka. Szczegóły patrz wskazanie „Kontrola po raku tarczycy".' },
            { ext: 'thyroid_us', label: 'USG tarczycy',
              note: 'Badanie zalecane u każdego pacjenta z laboratoryjnymi cechami AITD; u dzieci OBLIGATORYJNE wg PTEDD. Różnicuje Hashimoto vs Graves vs podostre zapalenie tarczycy; uwidacznia guzki wymagające oceny.',
              description: 'USG tarczycy w AITD — kluczowe badanie obrazowe uzupełniające diagnostykę laboratoryjną; pozwala różnicować podtypy AITD i wykrywać współistniejące zmiany ogniskowe. OBRAZ TYPOWY DLA HASHIMOTO: rozlana hipoechogeniczność (ciemniejsza niż mięśni szyi), niejednorodność miąższu („pseudo-guzkowy" wzór), drobne hipoechogeniczne pola (1–6 mm — odpowiadające naciekom limfocytarnym), brak wzmożonego unaczynienia w doplerze (różnicuje od Gravesa). Postać wolowa (powiększenie gruczołu) lub atroficzna (zanik miąższu — późna faza). OBRAZ TYPOWY DLA GRAVESA-BASEDOWA: rozlana hipoechogeniczność + WZMOŻONE UNACZYNIENIE w badaniu doplerowskim — tzw. „thyroid inferno" (mnogie sygnały przepływu w całym miąższu). Często wole rozlane (powiększenie bez guzków). RÓŻNICOWANIE z PODOSTRYM ZAPALENIEM (de Quervain): bólowa hipoechogenne ogniska bez wzmożonego unaczynienia, miejscowo bolesne pole sondą. WSKAZANIA: u dorosłych zalecane przy każdym potwierdzonym AITD; u DZIECI z laboratoryjnymi cechami zaburzenia czynności tarczycy — OBLIGATORYJNE wg PTEDD. GUZKI w przebiegu Hashimoto: zwiększone ryzyko CHŁONIAKA tarczycy (rzadkie, ale wymaga uwagi przy szybko narastającym wolu, guzku atypowym, objawach ucisku); ocena guzków wg klasyfikacji EU-TIRADS — wskazania do biopsji (BAC/FNAB) zgodnie z polskimi wytycznymi PTE 2022.' }
          ]
        },
        { name: 'Hashimoto — diagnostyka i monitorowanie (gdy niedoczynność lub eutyreoza z dodatnimi przeciwciałami)',
          tests: [
            { id: 'ft3',
              note: 'Rzadko przydatne w Hashimoto — w niedoczynności fT3 jest zachowane długo (zmniejszona obwodowa konwersja T4→T3 to mechanizm kompensacyjny). Oznaczać tylko w wybranych sytuacjach: podejrzenie ciężkiej niedoczynności (przed śpiączką hipotyreozową), zespół niskiej T3 w ostrych chorobach (euthyroid sick), monitorowanie nietypowych terapii (np. T3 dodatkowo do T4 — kontrowersyjne).',
              description: 'fT3 w Hashimoto — rola DRUGORZĘDOWA w odróżnieniu od nadczynności tarczycy (gdzie fT3 jest często kluczowe). Powód: w niedoczynności tarczycy obwodowa konwersja T4 → T3 jest fizjologicznie zachowana (a nawet wzmożona przez deiodynazy typu 1 i 2) jako mechanizm kompensacyjny — fT3 pozostaje w normie nawet przy znacznym spadku fT4. WSKAZANIA do oznaczenia fT3 w Hashimoto: (1) ciężka, długo nieleczona niedoczynność z ryzykiem ŚPIĄCZKI HIPOTYREOZOWEJ (przed dekompensacją fT3 spada); (2) ZESPÓŁ NISKIEJ T3 (low-T3 syndrome / euthyroid sick syndrome) u pacjenta hospitalizowanego z ostrą chorobą — fT3 obniżone, TSH zwykle prawidłowe lub nieznacznie obniżone, fT4 zwykle prawidłowe — NIE jest to prawdziwa niedoczynność; (3) ocena nietypowych terapii (kombinacja L-T4 + L-T3 — kontrowersyjne wskazanie wg ATA 2014/PTE).' }
          ]
        },
        { name: 'Graves-Basedow — diagnostyka i różnicowanie (gdy nadczynność)',
          tests: [
            { id: 'ft3',
              note: 'W przeciwieństwie do Hashimoto, w Gravesie fT3 jest klinicznie ISTOTNE. Wykrywa T3-tyreotoksykozę (TSH ↓ + fT3 ↑ + fT4 prawidłowe) — częstą we wczesnej chorobie Gravesa. Pominięcie fT3 może spowodować przeoczenie aktywnej nadczynności.',
              description: 'fT3 w chorobie Gravesa — w przeciwieństwie do Hashimoto pełni KLUCZOWĄ rolę diagnostyczną. T3-TYREOTOKSYKOZA (izolowane podwyższenie fT3 przy zahamowanym TSH i prawidłowym fT4) występuje u części pacjentów z wczesną chorobą Gravesa, gruczolakiem toksycznym i wolem guzkowatym toksycznym — wynika z preferencyjnej syntezy lub wzmożonej konwersji T4→T3 w aktywnym gruczole. Pominięcie fT3 → przeoczenie nadczynności. MONITOROWANIE LECZENIA tyreostatykami: fT3 normalizuje się szybciej niż fT4 i może wyprzedzać normalizację TSH (które bywa zahamowane przez wiele miesięcy) — fT3 i fT4 są w pierwszym roku leczenia ważniejsze niż TSH. RÓŻNICOWANIE z zespołem niskiej T3 w ostrej chorobie: w Gravesie fT3 ↑↑, w euthyroid sick syndrome fT3 ↓ z TSH zwykle prawidłowym.' },
            { ext: 'trab', label: 'TRAb (przeciwciała anty-TSHR)',
              note: 'SWOISTY marker choroby Gravesa-Basedowa — wg ATA 2016 i PTE badanie PIERWSZEGO RZUTU w różnicowaniu przyczyn tyreotoksykozy. Dodatni TRAb praktycznie potwierdza Gravesa; ujemny → wskazane scyntygrafia lub jodochwytność. W ciąży monitorowanie — przeciwciała IgG przechodzą przez łożysko.',
              description: 'TRAb (przeciwciała przeciwko receptorowi TSH) — KLUCZOWY MARKER choroby Gravesa-Basedowa, swoisty dla autoimmunologicznej nadczynności z pobudzeniem receptora TSH. WYTYCZNE: ATA 2016 i PTE jednoznacznie zalecają TRAb jako badanie PIERWSZEGO RZUTU w różnicowaniu przyczyn tyreotoksykozy (czulsze i bardziej dostępne niż scyntygrafia). DODATNI TRAb praktycznie potwierdza Gravesa — scyntygrafia/RAIU nie są wtedy konieczne. UJEMNY TRAb przy aktywnej tyreotoksykozie → wskazana dalsza diagnostyka różnicowa (scyntygrafia/RAIU różnicują: gruczolak toksyczny, wole guzkowate toksyczne, podostre zapalenie tarczycy, tyreotoksykoza egzogenna). TYPY TRAb: (a) TSAb (stymulujące) — wywołują Gravesa; (b) TBAb (blokujące) — rzadko, paradoksalnie powodują niedoczynność; (c) neutralne (cTRAb). Standardowe immunoassay nie różnicują tych typów; bioassay (TSI) — drogie i niedostępne rutynowo. CIĄŻA: u kobiet z chorobą Gravesa w wywiadzie lub w trakcie ciąży TRAb oznaczany w II trymestrze — wysokie miano (orientacyjnie > 3× górna granica normy) zwiększa ryzyko TYREOTOKSYKOZY PŁODOWEJ i NOWORODKOWEJ (przeciwciała IgG przechodzą przez łożysko). U leczonych w wywiadzie ¹³¹I/tyreoidektomią — TRAb może pozostawać podwyższone latami mimo niedoczynności klinicznej.' },
            { ext: 'thyroid_scinti', label: 'Scyntygrafia tarczycy (¹²³I / ⁹⁹ᵐTc)',
              note: 'Wskazana gdy TRAb ujemne lub niejednoznaczne — różnicuje: Gravesa (rozlany wzmożony wychwyt) vs guzek toksyczny vs wole guzkowate toksyczne vs zapalenie/egzogenne (niski wychwyt). PRZECIWWSKAZANA w ciąży i laktacji.',
              description: 'Scyntygrafia tarczycy z izotopem (¹²³I lub ⁹⁹ᵐTc-nadtechnecjan) — badanie czynnościowo-obrazowe pokazujące rozkład wychwytu radioznacznika w gruczole. ROLA w AITD: różnicowanie przyczyn tyreotoksykozy gdy TRAb jest ujemne, niejednoznaczne lub gdy podejrzewa się współistnienie Gravesa z autonomią guzkową (mieszane przyczyny). WZORCE: (1) Graves-Basedow — rozlany, znacznie wzmożony wychwyt w całym miąższu; (2) gruczolak toksyczny — pojedyncze „gorące" ognisko z zahamowanym wychwytem reszty gruczołu; (3) wole wieloguzkowe toksyczne — niejednorodny obraz z licznymi ogniskami; (4) zapalenie tarczycy (podostre, poporodowe, nieme, polekowe — amiodaron, immunoterapia) lub tyreotoksykoza egzogenna (przyjmowanie L-tyroksyny zewnętrznie) — niski lub zerowy wychwyt. PRZECIWWSKAZANIA: ciąża, karmienie piersią (narażenie płodu/dziecka na promieniowanie); u kobiet w wieku rozrodczym wykluczyć ciążę przed badaniem.' },
            { ext: 'iodine_uptake', label: 'Jodochwytność (RAIU — radioactive iodine uptake)',
              note: 'Ilościowa ocena wychwytu jodu radioaktywnego — uzupełnia scyntygrafię. Wysoka w Gravesie i wolu guzkowatym toksycznym; niska w zapaleniach tarczycy i tyreotoksykozie egzogennej. Niezbędna do planowania dawki ¹³¹I w terapii. PRZECIWWSKAZANA w ciąży i laktacji.',
              description: 'Jodochwytność (RAIU — Radioactive Iodine Uptake) — test czynnościowy: pomiar procentu podanego radio-jodu (zwykle ¹²³I) wychwytywanego przez tarczycę po 4–6 i 24 godzinach. Norma 24-godzinna: ~10–30% (zależne od podaży jodu w diecie — niższa w obszarach z bogatą podażą jodu). WZORCE: (a) Graves — wysoki wychwyt (40–80%); (b) wole guzkowate toksyczne — wysoki lub umiarkowany; (c) podostre zapalenie tarczycy (de Quervain) — bardzo niski wychwyt (< 5%) mimo tyreotoksykozy (uwalnianie hormonów z destrukcji, nie z syntezy); (d) tyreotoksykoza egzogenna (przyjmowanie L-tyroksyny) — niski wychwyt; (e) zapalenie poporodowe i nieme — niski. ZASTOSOWANIE PRAKTYCZNE: (1) różnicowanie przyczyn tyreotoksykozy gdy scyntygrafia nie wystarcza; (2) PLANOWANIE DAWKI ¹³¹I w terapii Gravesa lub wola guzkowatego toksycznego — pomaga dobrać dawkę aktywności do osiągnięcia eutyreozy lub niedoczynności (cel terapeutyczny). PRZECIWWSKAZANIA: ciąża, laktacja.' }
          ]
        },
        { name: 'Współistniejące autoimmunizacje (APS-2 / APS-3) — wybiórczo wg objawów',
          tests: [
            { id: 'cortisol',
              label: 'Kortyzol poranny (8:00–9:00)',
              note: 'Rozważyć przy podejrzeniu APS-2 / zespołu Schmidta (AITD + niedoczynność kory nadnerczy) — objawy: hiperpigmentacja, hipotensja ortostatyczna, hiponatremia, hipoglikemia, łaknienie soli. Hashimoto + nierozpoznana niedoczynność nadnerczy → wprowadzenie L-tyroksyny może wywołać przełom nadnerczowy. Próg < 138 nmol/L → diagnostyka rozszerzona (zobacz „Niedoczynność kory nadnerczy").',
              description: 'Kortyzol poranny w AITD — wykluczenie współistniejącej pierwotnej niedoczynności kory nadnerczy (PAI) w ramach APS-2 / zespołu Schmidta (Hashimoto + choroba Addisona ± cukrzyca typu 1). Bardzo ważne PRZED WŁĄCZENIEM L-tyroksyny u pacjenta z Hashimoto i charakterystycznymi objawami Addisona — hormony tarczycy przyspieszają obwodowy metabolizm kortyzolu i mogą zdekompensować dotychczas skompensowaną subkliniczną niedoczynność nadnerczy → PRZEŁOM NADNERCZOWY. PROTOKÓŁ: pobranie 8:00–9:00, na czczo, w spoczynku. Interpretacja: > 500 nmol/L → PAI wykluczona; < 138 nmol/L → PAI prawdopodobna, test Synacthen; 138–500 nmol/L → wynik niejednoznaczny, test Synacthen wskazany. Pełna diagnostyka — zobacz „Niedoczynność kory nadnerczy".' },
            { ext: 'anti_gad', label: 'Anty-GAD65, anty-IA2, anty-ZnT8 (skrining cukrzycy t.1)',
              note: 'Rozważyć u pacjentów z AITD i objawami sugerującymi cukrzycę t.1 (utrata masy ciała, polidypsja, hiperglikemia, młody wiek). APS-2 najczęściej łączy Hashimoto z DM1. Sam dodatni wynik bez hiperglikemii nie wymaga interwencji — monitorowanie glikemii.' },
            { ext: 'anti_ttg', label: 'Anty-tTG IgA + IgA całkowite (skrining celiakii)',
              note: 'Częstsza asocjacja niż w populacji ogólnej (~3–5% pacjentów z AITD ma celiakię). Skrining przy: objawach (biegunki, niedokrwistość z niedoboru Fe, niedobór wagi), niedokrwistości makrocytowej/mikrocytowej, osteoporozie u młodych, nieskuteczności leczenia L-tyroksyną (celiakia zaburza wchłanianie L-T4).' },
            { ext: 'cbc', label: 'Morfologia + B12 (skrining niedokrwistości Addisona-Biermera)',
              note: 'Hashimoto + anty-IF/anty-PCA → niedokrwistość makrocytowa z niedoboru B12 (APS-2). U pacjentów AITD z makrocytozą lub zmęczeniem rozważyć B12, kw. foliowy, anty-IF, anty-PCA.' }
          ]
        }
      ],
      guideline: 'PTE 2019 (Hubalewska-Dydejczyk i wsp.) / ATA 2014–2016',
      sources: [
        'Rekomendacje Polskiego Towarzystwa Endokrynologicznego — postępowanie w niedoczynności tarczycy (Hubalewska-Dydejczyk A i wsp.).',
        'Ross DS, Burch HB, Cooper DS, et al. 2016 American Thyroid Association Guidelines for Diagnosis and Management of Hyperthyroidism and Other Causes of Thyrotoxicosis. Thyroid. 2016;26(10):1343-1421.',
        'Jonklaas J, Bianco AC, Bauer AJ, et al. Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association task force. Thyroid. 2014;24(12):1670-1751.',
        'Hubalewska-Dydejczyk A, Trofimiuk-Müldner M, Ruchała M i wsp. Thyroid diseases and pregnancy: guidelines of the Polish Society of Endocrinology. Endokrynologia Polska. 2021;72(5):425-488.',
        'Kucharska AM i wsp. — Polskie wytyczne PTEDD: postępowanie w wrodzonej niedoczynności tarczycy. Pediatr Endocrinol Diabetes Metab. 2016.',
        'Husebye ES, Anderson MS, Kämpe O. Autoimmune Polyendocrine Syndromes. N Engl J Med. 2018;378:1132-1141. (APS-2 / zespół Schmidta).',
        'Bornstein SR, Allolio B, Arlt W, et al. Diagnosis and Treatment of Primary Adrenal Insufficiency: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2016;101(2):364-389.',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdziały o AITD.'
      ]
    },

    neonatal_screening: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Polski Program Badań Przesiewowych Noworodków 2019–2026',
            body: 'Powszechny, finansowany przez Ministerstwo Zdrowia program obejmujący WSZYSTKIE noworodki w Polsce. Pobranie krwi z pięty na bibułę (DBS — dried blood spot) wykonuje się w oddziale położniczym w 36.–72. godzinie życia (klasycznie „3.–5. doba"). Materiał analizowany jest w 6 regionalnych pracowniach przesiewu (Warszawa, Łódź, Kraków, Poznań, Katowice, Gdańsk). Cel: wczesne wykrycie chorób, których nieleczenie prowadzi do nieodwracalnych powikłań (głównie niepełnosprawności intelektualnej i ruchowej). Ten panel skupia się na WRODZONEJ NIEDOCZYNNOŚCI TARCZYCY (WNT) — najlepiej zbadanej części programu i najczęstszej przyczynie odwracalnej niepełnosprawności intelektualnej w populacji pediatrycznej (~1:3000–1:4000 noworodków w Polsce). Inne choroby pokrywane przez program — patrz osobna sekcja poniżej.'
          },
          {
            kind: 'algorithm',
            icon: 'baby-bottle',
            title: 'Algorytm WNT — Rządowy Program Przesiewowy 2019–2026',
            steps: [
              {
                number: 1,
                title: 'Bibuła I · 36.–72. godzina życia',
                sublabel: 'pomiar TSH z DBS · pobranie z pięty noworodka',
                options: [
                  {
                    threshold: 'TSH < 10',
                    action: 'Norma — koniec procedury',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Wynik prawidłowy — wrodzona niedoczynność tarczycy (WNT) WYKLUCZONA na podstawie przesiewu.',
                      'Bez dalszej diagnostyki w ramach programu przesiewowego.',
                      'Wynik komunikowany rodzicom jedynie pośrednio — brak wezwania = wynik prawidłowy (nie przekazuje się aktywnie wyników ujemnych).',
                      'UWAGA — sytuacje wymagające dalszej oceny mimo prawidłowego TSH przesiewowego: (1) niedoczynność WTÓRNA / CENTRALNA (TSH nieadekwatnie niskie — przesiew jej nie wykrywa); (2) wcześniactwo skrajne (< 28 tyg.) — w pierwszych tygodniach życia oś przysadkowo-tarczycowa niedojrzała; (3) niedoczynność z opóźnionym wzrostem TSH (przesiew miał miejsce za wcześnie — przed wzrostem TSH); (4) objawy kliniczne sugerujące niedoczynność (przedłużająca się żółtaczka, hipotonia, trudności w karmieniu, opóźniony stolec smółkowy) niezależnie od wyniku przesiewu.',
                      'Pediatra powinien znać podejrzenia objawowe — przesiew jest narzędziem populacyjnym, nie zastępuje oceny klinicznej.'
                    ]
                  },
                  {
                    threshold: 'TSH 10–23,9',
                    action: 'Druga bibuła (powtórka po 7–14 dniach)',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'Wynik graniczny — wymaga powtórki, by odróżnić PRZEJŚCIOWĄ HIPERTYREOTROPINEMIĘ od TRWAŁEJ wrodzonej niedoczynności tarczycy.',
                      'Druga bibuła pobierana zwykle po 7–14 dniach od pierwszej — przeprowadza ją personel POZ lub oddział noworodkowy (zależnie od regionu).',
                      'Przyczyny przejściowej hipertyreotropinemii: (a) niedobór jodu u matki w ciąży; (b) przejściowa ekspozycja na nadmiar jodu (środki dezynfekcyjne na sali porodowej, kontrastowe badania radiologiczne u matki); (c) wcześniactwo i niedojrzałość osi przysadkowo-tarczycowej; (d) ekspozycja na leki przeciwtarczycowe u matki w ciąży (tiamazol, PTU); (e) bardzo rzadko — przeciwciała blokujące receptor TSH (TBAb) przekazane od matki z autoimmunizacyjną chorobą tarczycy (AITD).',
                      'W oczekiwaniu na drugą bibułę dziecko karmione normalnie; rodzice pouczeni o znaczeniu wyniku, ale BEZ rozpoczynania leczenia.',
                      'Wynik drugiej bibuły interpretowany wg algorytmu programu przesiewowego: TSH ≥ 10 → wezwanie; < 10 → norma.'
                    ]
                  },
                  {
                    threshold: 'TSH ≥ 24',
                    action: 'Wezwanie · pilne potwierdzenie z surowicy',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Wynik wysoki — silne podejrzenie WRODZONEJ NIEDOCZYNNOŚCI TARCZYCY (WNT). NATYCHMIASTOWE wezwanie rodziców na potwierdzenie diagnostyczne.',
                      'Postępowanie po wezwaniu: pobranie krwi ŻYLNEJ (nie z bibuły) — oznaczenie TSH + fT4 (+ ewentualnie T4 całkowite) w surowicy. Wynik dostępny zwykle tego samego dnia.',
                      'Interpretacja SUROWICY: TSH ↑ + fT4 ↓ = JAWNA WNT — natychmiastowe włączenie L-tyroksyny 10–15 μg/kg/dobę (zwykle 37,5–50 μg/dobę dla donoszonego noworodka). TSH ↑ + fT4 prawidłowe = SUBKLINICZNA WNT — decyzja indywidualna w ośrodku referencyjnym pediatrycznym.',
                      'Diagnostyka morfologiczna RÓWNOLEGLE, ale NIE OPÓŹNIA leczenia: USG tarczycy (pierwszorzędowe) + tyreoglobulina; scyntygrafia opcjonalnie, gdy USG nie uwidacznia tarczycy w typowym miejscu (różnicowanie aplazji vs ektopii).',
                      'KRYTYCZNE OKNO TERAPEUTYCZNE: rozpoczęcie L-tyroksyny w ciągu PIERWSZYCH 2 TYGODNI życia daje prawidłowy rozwój neurologiczny i intelektualny. Każdy tydzień opóźnienia w pierwszych 2–4 tygodniach życia obniża IQ dziecka — nie wolno zwlekać z leczeniem czekając na diagnostykę obrazową.',
                      'Wytłumaczyć rodzicom: WNT jest CHOROBĄ UWLECZALNĄ przy wczesnym rozpoznaniu; leczenie L-tyroksyną zapewnia prawidłowy rozwój; lek podawany rano, na czczo, rozkruszony i podany z mlekiem (UNIKAĆ podawania z preparatami sojowymi, żelazem, wapniem — zmniejszają wchłanianie).'
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'Bibuła II · powtórka',
                sublabel: 'tylko gdy bibuła I = 10–23,9 mIU/L',
                options: [
                  {
                    threshold: 'TSH < 10',
                    action: 'Norma — przejściowa hipertyreotropinemia',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Wynik prawidłowy w drugiej bibule — pierwszy podwyższony pomiar był prawdopodobnie PRZEJŚCIOWĄ hipertyreotropinemią (czynniki ustąpiły).',
                      'Wrodzona niedoczynność tarczycy WYKLUCZONA na podstawie przesiewu.',
                      'Bez dalszej diagnostyki w ramach programu przesiewowego.',
                      'Wynik komunikowany rodzicom jako negatywny (brak wezwania = wynik prawidłowy).',
                      'UWAGA: nawet przy prawidłowym wyniku przesiewu, dziecko powinno być oceniane klinicznie przez pediatrę — przesiew nie wyklucza niedoczynności wtórnej/centralnej ani niedoczynności z opóźnionym wzrostem TSH (rzadkie).'
                    ]
                  },
                  {
                    threshold: 'TSH ≥ 10',
                    action: 'Wezwanie · TSH + fT4 z surowicy',
                    variant: 'danger', icon: 'alert-triangle',
                    detail: [
                      'Wynik drugiej bibuły potwierdza utrzymującą się hipertyreotropinemię — silne podejrzenie WNT (już nie przejściowa).',
                      'Wezwanie rodziców na potwierdzenie diagnostyczne — pobranie krwi ŻYLNEJ: TSH + fT4 z surowicy.',
                      'Postępowanie identyczne jak przy bibule I ≥ 24: pełne potwierdzenie z surowicy, rozpoczęcie L-tyroksyny przy potwierdzonej WNT (cel: pierwsze 2 tygodnie życia), diagnostyka morfologiczna (USG + Tg; scyntygrafia opcjonalnie) równolegle.',
                      'Interpretacja SUROWICY: TSH ↑ + fT4 ↓ = JAWNA WNT → L-tyroksyna 10–15 μg/kg/dobę. TSH ↑ + fT4 prawidłowe = SUBKLINICZNA WNT lub przejściowa hipertyreotropinemia o przedłużonym przebiegu — decyzja indywidualna w ośrodku referencyjnym.',
                      'W przypadkach subklinicznych można rozważyć obserwację bez leczenia z kontrolą TSH za 4–6 tygodni; jeżeli TSH nadal podwyższone — wprowadzić L-tyroksynę.',
                      'WAŻNE: u dziecka z opóźnionym rozpoznaniem (po 2.–4. tygodniu życia) i jawną WNT — leczenie nadal włącza się jak najszybciej, choć rokowanie neurologiczne może być nieco gorsze niż przy rozpoznaniu w pierwszych dniach.'
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'list-search',
            collapsible: true,
            title: 'Dlaczego progi TSH w przesiewie noworodkowym wyglądają inaczej niż u dorosłych?',
            body: 'Aby zrozumieć progi przesiewu (10 i 24 mIU/L) trzeba pamiętać o DWÓCH niezależnych zjawiskach. ZJAWISKO 1 — MATERIAŁ: u dorosłego TSH oznacza się w SUROWICY (płynna część krwi po odwirowaniu, bez krwinek). W przesiewie noworodkowym używana jest BIBUŁA (DBS — dried blood spot) — pełna krew kapilarna z pięty wysuszona na bibule, czyli z krwinkami. Krwinki nie zawierają TSH — „rozcieńczają" osocze przy ekstrakcji z bibuły. Dlatego dla tej samej próbki wynik w DBS jest niższy niż w surowicy (~60–70% wartości równoważnej). ZJAWISKO 2 — FIZJOLOGIA NOWORODKA: u noworodka TSH w surowicy jest fizjologicznie ZNACZNIE wyższe niż u dorosłego — w pierwszych 30 minutach po porodzie występuje pik ~80 mIU/L (tzw. „TSH surge" związany z adaptacją do zimna i klampingiem pępowiny), potem spadek do < 20 po 24 godzinach i < 10 mIU/L do 14. doby. WNIOSEK: progi przesiewu (10 i 24 mIU/L) są dobrane tak, aby wykrywać NIEPRAWIDŁOWĄ niedoczynność u noworodka, uwzględniając OBIE specyfiki (DBS vs surowica + fizjologia noworodka). Bezpośrednie porównanie z normą dorosłego (~4 mIU/L w surowicy) byłoby błędne.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Postępowanie po wezwaniu — potwierdzenie z surowicy',
            items: [
              {
                label: 'Pobranie kontrolne z krwi żylnej',
                text: 'TSH + fT4 (+ T4 całkowite), pobrane natychmiast po wezwaniu:',
                detail: [
                  'TSH ↑ + fT4 ↓ → JAWNA wrodzona niedoczynność tarczycy — pilne włączenie L-tyroksyny.',
                  'TSH ↑ + fT4 prawidłowe → subkliniczna WNT lub hipertyreotropinemia przejściowa — wymaga oceny indywidualnej.',
                  'TSH prawidłowe + fT4 prawidłowe → wynik fałszywie dodatni z bibuły (przejściowa hipertyreotropinemia).'
                ]
              },
              {
                label: 'USG tarczycy — pierwszorzędowa diagnostyka morfologiczna (równolegle, ale nie opóźniać leczenia)',
                text: 'badanie nieinwazyjne, bez promieniowania — podstawa różnicowania wady strukturalnej:',
                detail: [
                  'APLAZJA (atyreoza) — brak tkanki tarczycowej w typowym miejscu: USG nie uwidacznia gruczołu.',
                  'HIPOPLAZJA — mała tarczyca w prawidłowym miejscu: USG pokazuje gruczoł zmniejszony.',
                  'EKTOPIA — najczęstsza wada (~70% przypadków WNT): tarczyca przemieszczona poza prawidłową lokalizację (zwykle do podstawy języka — „struma lingualis"); USG nie uwidacznia gruczołu w typowym miejscu — wówczas konieczne dodatkowe badanie (scyntygrafia) w celu zlokalizowania ektopii.',
                  'DYSHORMONOGENEZA — defekt biosyntezy hormonów (najczęściej mutacje TPO, DUOX2, NIS, TG, PDS): tarczyca PRAWIDŁOWA lub powiększona w USG; różnicowanie z aplazją/ektopią ma znaczenie dla poradnictwa genetycznego (postaci dziedziczone autosomalnie recesywnie).',
                  'PRZEJŚCIOWA WNT — bez wady strukturalnej: USG prawidłowe; przyczyny: ekspozycja na nadmiar jodu (matka leczona amiodaronem, niedawne kontrastowe badania radiologiczne), niedobór jodu u matki, przeciwciała blokujące receptor TSH (TBAb) od matki z autoimmunizacyjną chorobą tarczycy (AITD), wcześniactwo.'
                ]
              },
              {
                label: 'Tyreoglobulina (Tg) — pomocniczy marker biochemiczny ilości tkanki tarczycowej',
                text: 'oznaczana razem z potwierdzeniem z surowicy; uzupełnia USG:',
                detail: [
                  'APLAZJA → Tg nieoznaczalna lub bardzo niska (brak tkanki produkującej Tg).',
                  'HIPOPLAZJA → Tg obniżona proporcjonalnie do ilości obecnej tkanki.',
                  'EKTOPIA → Tg często prawidłowa lub obniżona (zależnie od ilości tkanki ektopowej).',
                  'DYSHORMONOGENEZA → Tg PRAWIDŁOWA lub PODWYŻSZONA — tarczyca jest, ale nie produkuje hormonów; sama Tg + USG zwykle wystarczają do takiego rozpoznania bez konieczności scyntygrafii.'
                ]
              },
              {
                label: 'Scyntygrafia tarczycy — badanie OPCJONALNE / drugorzędowe (wybrane wskazania)',
                text: 'NIE jest obligatoryjna w polskim programie przesiewowym; wykorzystywana wybiórczo:',
                detail: [
                  'STATUS w wytycznych: Kucharska PTEDD 2016 oraz ESPE 2014 (Léger) wymieniają scyntygrafię jako badanie pomocnicze, NIE obowiązkowe. Polski program przesiewowy 2019–2026 nie wymaga scyntygrafii do potwierdzenia WNT.',
                  'GŁÓWNE wskazania DODATKOWE do USG: (1) USG nie uwidacznia tarczycy w typowym miejscu — różnicowanie aplazji (brak wychwytu) vs ektopii (wychwyt w nietypowej lokalizacji, najczęściej u podstawy języka); (2) tarczyca prawidłowa w USG + Tg nieoznaczalna (rozbieżność wymaga oceny funkcjonalnej); (3) podejrzenie defektu organifikacji jodu — test z nadchloranem potasu.',
                  'MOMENT WYKONANIA: optymalnie PRZED rozpoczęciem L-tyroksyny lub w pierwszych 5–7 dniach leczenia (po dłuższej supresji TSH wychwyt zanika). Jeśli pominięta — można wykonać po próbie odstawienia L-tyroksyny w wieku ≥ 3 lat (reewaluacja trwała vs przemijająca WNT).',
                  'IZOTOP: preferowany ¹²³I (krótki T½, brak promieniowania β; dawka 0,1–0,3 MBq/kg p.o.) lub ⁹⁵ᵐTc-nadtechnecjan. NIGDY ¹³¹I u noworodka (zbyt wysoka dawka).',
                  'Zasada ALARA: u noworodka badania izotopowe wykonuje się TYLKO w niezbędnych przypadkach. Większość pacjentów z WNT NIE wymaga scyntygrafii — USG + Tg + przebieg kliniczny są zwykle wystarczające do rozpoznania i prowadzenia leczenia.'
                ]
              },
              {
                label: 'Leczenie — kiedy i jak zacząć',
                text: 'pilność i schemat dawkowania:',
                detail: [
                  'OPTYMALNIE: rozpoczęcie L-tyroksyny w ciągu PIERWSZYCH 2 TYGODNI życia — krytyczne dla prawidłowego rozwoju neurologicznego.',
                  'Dawka początkowa wg PTEDD: 10–15 μg/kg/dobę (w postaci tabletkowej, rozkruszonej i podanej z mlekiem matczynym lub modyfikowanym; UNIKAĆ podawania z preparatami sojowymi, żelazem, wapniem — zmniejszają wchłanianie).',
                  'Kontrola TSH i fT4 po 2 tygodniach od włączenia leczenia, następnie co 1–2 miesiące w 1. roku życia, co 2–3 miesiące w 2.–3. roku, potem co 6–12 miesięcy.',
                  'Cel terapeutyczny: TSH w normie dla wieku; fT4 w GÓRNEJ połowie normy (kluczowe dla rozwoju mózgu w pierwszych miesiącach).'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Inne choroby przesiewane w Programie 2019–2026 (poza WNT)',
            items: [
              {
                label: 'Zaburzenia metabolizmu aminokwasów',
                text: 'wymagają wczesnej diety eliminacyjnej / suplementacji:',
                detail: [
                  'Fenyloketonuria (PKU) — pomiar fenyloalaniny w bibule (najstarszy test przesiewowy w PL, od 1965 r.).',
                  'Choroba syropu klonowego (MSUD) — leucyna, izoleucyna, walina.',
                  'Tyrozynemia typu I — sukcynyloaceton.',
                  'Homocystynuria, cytruliemia, kwasica argininobursztynowa.'
                ]
              },
              {
                label: 'Zaburzenia β-oksydacji kwasów tłuszczowych',
                text: 'ryzyko śmiertelnej hipoglikemii / kwasicy w okresie głodzenia:',
                detail: [
                  'MCAD (Medium-Chain Acyl-CoA Dehydrogenase Deficiency) — najczęstszy spośród nich.',
                  'LCHAD, VLCAD, CPT-II, CACT — różne defekty enzymatyczne.'
                ]
              },
              {
                label: 'Acydurie organiczne',
                text: 'ryzyko ostrej kwasicy metabolicznej:',
                detail: [
                  'Kwasica metylomalonowa (MMA), propionowa (PA), izowalerianowa (IVA), glutarowa typu I (GA-I).'
                ]
              },
              {
                label: 'Inne istotne',
                text: 'pozostałe choroby pokrywane przesiewem:',
                detail: [
                  'MUKOWISCYDOZA (CF) — pomiar IRT (immunoreactive trypsinogen) + badanie mutacji CFTR przy podwyższonym IRT.',
                  'GALAKTOZEMIA — pomiar galaktozy całkowitej i aktywności GALT.',
                  'NIEDOBÓR BIOTYNIDAZY — pomiar aktywności biotynidazy.',
                  'SCID (severe combined immunodeficiency) — pomiar TREC (T-cell receptor excision circles); dołączony do programu pilotażowo.',
                  'RDZENIOWY ZANIK MIĘŚNI (SMA) — badanie homozygotycznej delecji SMN1; dołączony do programu pilotażowo.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Przesiew (bibuła z pięty 36.–72. godzina życia)',
          tests: [
            { id: 'tsh',
              label: 'TSH z bibuły (DBS) — pierwsza bibuła',
              note: 'Aby zobaczyć progi DBS w przeliczniku: kliknij ten chip → załaduj TSH do formularza → w polu „Test diagnostyczny" (pod polem wartości w karcie „Przelicznik jednostek laboratoryjnych") wybierz „Bibuła pierwsza — przesiew noworodkowy (DBS, 3.–5. doba)". Algorytm: TSH ≥ 24 mIU/L → WEZWANIE; 10–23,9 → DRUGA BIBUŁA; < 10 → norma.',
              description: 'TSH z bibuły (DBS — dried blood spot) — podstawowe badanie w polskim przesiewie noworodkowym w kierunku wrodzonej niedoczynności tarczycy (WNT). MATERIAŁ: pełna krew włośniczkowa pobrana z pięty noworodka na specjalną bibułę filtracyjną (zwykle Whatman 903). Próbka jest suszona, transportowana do regionalnej pracowni przesiewu, analizowana metodami immunoassay (FEIA, ELISA, FIA). MOMENT POBRANIA: 36.–72. godzina życia (klasycznie „3.–5. doba") — dobierany tak, by minąć fizjologiczny szczyt TSH (pierwsze 24 godziny) i zachować wysoką czułość. PROGI INTERPRETACYJNE (Rządowy Program Przesiewowy 2019–2026): (1) TSH < 10 mIU/L → wynik prawidłowy, KONIEC procedury; (2) TSH 10–23,9 mIU/L → wynik graniczny, wymaga POTWIERDZENIA z drugiej bibuły; (3) TSH ≥ 24 mIU/L → wynik nieprawidłowy, BEZPOŚREDNIE WEZWANIE rodziców z dzieckiem do diagnostyki potwierdzającej (TSH + fT4 z surowicy). UWAGA: progi DBS są NIŻSZE niż w surowicy — patrz callout „Dlaczego progi TSH w przesiewie noworodkowym wyglądają inaczej…" w sekcji „Podsumowanie" powyżej. Po WEZWANIU jak najszybciej rozpoczyna się leczenie L-tyroksyną (jeszcze przed pełną diagnostyką obrazową), bo każdy tydzień opóźnienia w pierwszych 2–4 tygodniach życia obniża IQ dziecka.' },
            { id: 'tsh',
              label: 'TSH z bibuły (DBS) — druga bibuła (powtórka)',
              note: 'Aby zobaczyć progi DBS w przeliczniku: kliknij ten chip → załaduj TSH do formularza → w polu „Test diagnostyczny" (pod polem wartości w karcie „Przelicznik jednostek laboratoryjnych") wybierz „Bibuła druga — powtórka przesiewu". Wskazana gdy I bibuła wykazała TSH 10–23,9 mIU/L. Algorytm: TSH ≥ 10 mIU/L → WEZWANIE; < 10 → norma.',
              description: 'TSH z drugiej bibuły — wykonywane gdy pierwsza bibuła wykazała wynik graniczny (10–23,9 mIU/L). CEL: odróżnienie PRZEJŚCIOWEJ HIPERTYREOTROPINEMII (która ustępuje samoistnie) od TRWAŁEJ wrodzonej niedoczynności tarczycy. Przejściowa hipertyreotropinemia może wynikać z: niedoboru jodu u matki w ciąży, przejściowej ekspozycji na nadmiar jodu (środki dezynfekcyjne na sali porodowej, kontrastowe badania radiologiczne u matki), wcześniactwa, niedojrzałości osi przysadkowo-tarczycowej. PROGI (Rządowy Program Przesiewowy 2019–2026): TSH ≥ 10 mIU/L → wezwanie do diagnostyki potwierdzającej; TSH < 10 → norma, koniec procedury. Druga bibuła pobierana zwykle po 7–14 dniach od pierwszej.' }
          ]
        },
        { name: 'Potwierdzenie z surowicy (po wezwaniu)',
          tests: [
            { id: 'tsh',
              note: 'Pomiar z krwi żylnej (NIE z bibuły). U noworodka norma TSH w surowicy jest WIEKOZALEŻNA: w 1.–2. dobie do ~30 mIU/L; do 14. doby spadek do < 10; potem stopniowo do wartości dorosłych. Wartość > 12 mIU/L w 3.–5. dobie + prawidłowe fT4 → subkliniczna WNT; TSH > 28 → jawna WNT.',
              description: 'TSH w surowicy u noworodka po wezwaniu z przesiewu — KLUCZOWE potwierdzenie rozpoznania. Materiał: krew żylna (nie z bibuły, bo dokładność diagnostyczna jest wyższa). NORMY WIEKOZALEŻNE (PTEDD 2016, Kucharska i wsp.): (a) 0.–2. doba — fizjologiczny szczyt TSH (do 30, czasem do 50 mIU/L); pomiar w tym okresie ma ograniczoną wartość; (b) 3.–5. doba (standard interpretacji): < 12 mIU/L = norma; 12–28 mIU/L + prawidłowe fT4 = SUBKLINICZNA WNT; > 28 mIU/L = JAWNA WNT; (c) 1.–4. tydzień: stopniowy spadek do < 10 mIU/L; (d) niemowlęta > 1 mies.: 0,5–4,5 mIU/L. Interpretacja z fT4: TSH ↑ + fT4 ↓ = JAWNA WNT, jednoznaczne wskazanie do leczenia; TSH ↑ + fT4 prawidłowe = SUBKLINICZNA WNT, decyzja indywidualna (zwykle leczenie przy TSH > 20, monitorowanie przy 10–20). NORMA SUROWICY ≠ NORMA DBS — przesiewowa bibuła ma niższe progi (< 10) bo zawiera pełną krew (krwinki rozcieńczają osocze).' },
            { id: 'ft4',
              note: 'Pomiar z krwi żylnej. U noworodka norma fT4 jest WIEKOZALEŻNA: 1.–4. tydzień życia ~15–35 pmol/L (znacznie wyższa niż u dorosłych); w 2.–6. miesiącu spada do ~12–22 pmol/L. Obniżone fT4 + podwyższone TSH = jawna WNT. Cel leczenia: fT4 w górnej połowie normy dla wieku.',
              description: 'fT4 (wolna tyroksyna) u noworodka — uzupełnia TSH dla różnicowania postaci WNT i monitorowania leczenia. NORMY WIEKOZALEŻNE: (a) 1.–4. tydzień życia: ~15–35 pmol/L (znacznie wyższa niż u dorosłych — szczyt fT4 u noworodka odzwierciedla fizjologiczne nasilenie syntezy hormonów po porodzie); (b) 1.–6. miesiąc: stopniowy spadek do ~12–22 pmol/L; (c) starsze dzieci i dorośli: standardowe normy laboratoryjne. Interpretacja: TSH ↑ + fT4 ↓ → JAWNA WNT (jednoznaczne wskazanie do natychmiastowego leczenia L-tyroksyną w pełnej dawce 10–15 μg/kg/dobę); TSH ↑ + fT4 prawidłowe → SUBKLINICZNA WNT lub przejściowa hipertyreotropinemia (decyzja o leczeniu indywidualna — zwykle leczyć przy TSH > 20 utrzymującym się). CEL TERAPEUTYCZNY u dziecka z WNT: fT4 w GÓRNEJ POŁOWIE NORMY dla wieku (preferowane wyższe wartości niż u dorosłych — kluczowe dla rozwoju mózgu w pierwszych miesiącach życia).' },
            { id: 't4_total',
              note: 'Pomiar z krwi żylnej. T4 całkowite (suma wolnej i związanej) — historycznie używane przed standardyzacją fT4; obecnie wykorzystywane jako uzupełnienie, zwłaszcza w okresie noworodkowym, gdy fizjologiczne wahania TBG mogą wpływać na interpretację.',
              description: 'T4 całkowite u noworodka — pomiar sumy wolnej i związanej z białkami (głównie TBG — thyroxine-binding globulin) tyroksyny. ROLA: historycznie podstawowy parametr funkcji tarczycy (przed wprowadzeniem standardowych metod oznaczania fT4); obecnie pełni rolę uzupełniającą. NORMY WIEKOZALEŻNE — wyższe niż u dorosłych (fizjologicznie zwiększone TBG u noworodka). PUŁAPKI: T4 całkowite zależy od stężenia TBG, które może być zmienione w stanach (a) wzrost TBG: leki estrogenowe (HRT u matki w ciąży/karmiącej), hiperestrogenizm; (b) spadek TBG: niedobór TBG (rzadki defekt genetyczny, X-recesywny), zespół nerczycowy, ciężkie choroby ogólne. Z tego powodu fT4 jest preferowane do interpretacji funkcji tarczycy; T4 całkowite zachowuje wartość w sytuacjach gdy fT4 jest nieoznaczalne lub immunoassay daje nietypowe wyniki.' },
            { id: 'thyroglobulin',
              note: 'KLUCZOWE w różnicowaniu strukturalnym WNT po wezwaniu. Tg nieoznaczalna/bardzo niska → APLAZJA (atyreoza); Tg obniżona proporcjonalnie → HIPOPLAZJA; Tg prawidłowa lub PODWYŻSZONA → DYSHORMONOGENEZA (jest tarczyca, ale nie produkuje hormonów). Pomaga w poradnictwie genetycznym (dyshormonogenezy są dziedziczne AR).',
              description: 'Tyreoglobulina (Tg) u noworodka z potwierdzoną WNT — KLUCZOWY marker różnicowania typu wady tarczycowej. Tg jest produkowana wyłącznie przez komórki pęcherzykowe tarczycy (zdrowe lub nowotworowe) — stężenie Tg odzwierciedla MASĘ tkanki tarczycowej obecnej w organizmie. WZORCE w WNT: (1) APLAZJA (atyreoza) — całkowity brak tkanki tarczycowej; Tg NIEOZNACZALNA lub bardzo niska (< 1 ng/mL); poradnictwo: rzadko dziedziczne, zwykle sporadyczne; (2) HIPOPLAZJA — mała tarczyca w prawidłowym położeniu; Tg obniżona PROPORCJONALNIE do ilości tkanki (np. 5–20 ng/mL); (3) EKTOPIA — tarczyca przemieszczona poza zwykłe miejsce (najczęściej u podstawy języka); Tg często prawidłowa lub obniżona, USG „brak tarczycy w typowym miejscu" + scyntygrafia wychwyt w nietypowej lokalizacji; (4) DYSHORMONOGENEZA — strukturalnie prawidłowa lub powiększona tarczyca, ale defekt biosyntezy hormonów (mutacje TPO, DUOX2, NIS, TG, DEHAL1, PDS); Tg PRAWIDŁOWA lub PODWYŻSZONA; postaci AR z 25% ryzykiem powtórzenia w rodzinie — wskazane poradnictwo genetyczne i badania genetyczne. ZASTOSOWANIE PRAKTYCZNE: Tg + USG + scyntygrafia razem pozwalają w 95% przypadków określić typ WNT, co ma znaczenie dla: (a) rokowania długoterminowego, (b) poradnictwa genetycznego rodziny, (c) decyzji o ewentualnej próbie odstawienia L-tyroksyny w wieku 3 lat (postacie przejściowe).' },
            { ext: 'thyroid_us', label: 'USG tarczycy (noworodek) — pierwszorzędowe',
              note: 'Pierwszorzędowe badanie morfologiczne u noworodka z potwierdzoną WNT (wytyczne PTEDD, ESPE). Pozwala uwidocznić aplazję (brak gruczołu), hipoplazję (mała tarczyca), prawidłową lub powiększoną tarczycę (dyshormonogeneza). OGRANICZENIE: nie wykrywa skutecznie ektopii (tarczyca u podstawy języka może być poza polem badania USG szyi) — wówczas dodać scyntygrafię.',
              description: 'USG tarczycy u noworodka z WNT — PIERWSZORZĘDOWE badanie obrazowe wg wytycznych PTEDD i ESPE. Wykonywane sondą wysokoczęstotliwościową (12–18 MHz, „mała pediatryczna") w pozycji noworodka na plecach z uniesieniem ramion. Interpretacja: (1) BRAK TARCZYCY w typowym miejscu → możliwa APLAZJA (atyreoza — brak tkanki) lub EKTOPIA (tarczyca przemieszczona); różnicowanie wymaga scyntygrafii; (2) MAŁA tarczyca → hipoplazja; (3) PRAWIDŁOWA lub POWIĘKSZONA tarczyca → najpewniej dyshormonogeneza (przy potwierdzonej WNT laboratoryjnie); (4) STRUKTURA niejednorodna z hipoechogenicznością + małe → może sugerować dysgenezję. Ograniczenia USG: nie wykrywa skutecznie EKTOPII u podstawy języka — gdy USG „nie widzi tarczycy" w typowym miejscu, dopiero wtedy DODAĆ scyntygrafię. Zaleta: brak promieniowania, szeroko dostępne, możliwe do powtórzenia. WAŻNE: USG NIE OPÓŹNIA leczenia — diagnostyka morfologiczna jest robiona równolegle z włączeniem L-tyroksyny, nie zamiast.' },
            { ext: 'thyroid_scinti', label: 'Scyntygrafia tarczycy (¹²³I / ⁹⁹ᵐTc-nadtechnecjan)',
              note: 'Badanie OPCJONALNE — NIE jest obligatoryjne w polskim programie przesiewowym (Kucharska PTEDD 2016, ESPE Léger 2014). Wskazania DODATKOWE do USG: (1) USG nie uwidacznia tarczycy w typowym miejscu (różnicowanie aplazji vs ektopii); (2) USG prawidłowe + Tg nieoznaczalna; (3) podejrzenie defektu organifikacji jodu. Preferowany ¹²³I lub ⁹⁹ᵐTc-nadtechnecjan u noworodka.',
              description: 'Scyntygrafia tarczycy u noworodka z WNT — badanie czynnościowo-obrazowe z radio-jodem (¹²³I) lub technetem (⁹⁹ᵐTc-nadtechnecjan). STATUS w wytycznych: Kucharska PTEDD 2016 oraz ESPE 2014 (Léger) wymieniają scyntygrafię jako badanie POMOCNICZE — NIE obligatoryjne u każdego noworodka z WNT. Polski Program Przesiewowy 2019–2026 nie wymaga scyntygrafii do potwierdzenia rozpoznania. ROLA: różnicowanie typu wady tarczycowej W WYBRANYCH SYTUACJACH (USG i Tg zwykle wystarczają). WSKAZANIA: (1) USG nie uwidacznia tarczycy w typowym miejscu — różnicowanie aplazji vs ektopii; (2) USG prawidłowe morfologicznie + Tg nieoznaczalna (rozbieżność wymaga oceny funkcjonalnej); (3) podejrzenie defektu organifikacji jodu — test z nadchloranem potasu. WZORCE INTERPRETACJI: (1) APLAZJA → brak wychwytu w jakimkolwiek miejscu; (2) EKTOPIA → wychwyt w nietypowej lokalizacji (najczęściej u podstawy języka — „struma lingualis", ~70% WNT z ektopią); (3) HIPOPLAZJA → wychwyt zmniejszony w prawidłowym położeniu; (4) DYSHORMONOGENEZA → wychwyt PRAWIDŁOWY lub WZMOŻONY (tarczyca strukturalnie działa, ale nie produkuje hormonów). MOMENT WYKONANIA: optymalnie PRZED L-tyroksyną lub w pierwszych 5–7 dniach leczenia (potem supresja TSH znosi wychwyt); alternatywnie po próbie odstawienia w wieku ≥ 3 lat (reewaluacja trwała vs przemijająca WNT). IZOTOP: preferowany ¹²³I (krótki T½, brak promieniowania β, dawka 0,1–0,3 MBq/kg p.o.) lub ⁹⁹ᵐTc-nadtechnecjan. NIGDY ¹³¹I u noworodka. Zasada ALARA: u noworodka badania izotopowe wykonuje się tylko w niezbędnych przypadkach — badanie nie powinno opóźniać włączenia L-tyroksyny.' }
          ]
        }
      ],
      guideline: 'Rządowy Program Badań Przesiewowych Noworodków 2019–2026 / PTEDD 2016 (Kucharska)',
      sources: [
        'Rządowy Program Badań Przesiewowych Noworodków w Polsce na lata 2019–2026. Ministerstwo Zdrowia RP — algorytm postępowania w WNT (TSH bibuła I i II).',
        'Kucharska AM i wsp. Postępowanie w wrodzonej niedoczynności tarczycy u dzieci — rekomendacje PTEDD. Pediatr Endocrinol Diabetes Metab. 2016.',
        'Olczak-Kowalczyk D (red.), Pyrżak B, Walczak M. Endokrynologia wieku rozwojowego. PZWL Wyd. Lekarskie; 2023 — rozdział o wrodzonej niedoczynności tarczycy.',
        'Léger J, Olivieri A, Donaldson M, et al. European Society for Paediatric Endocrinology Consensus Guidelines on Screening, Diagnosis, and Management of Congenital Hypothyroidism. J Clin Endocrinol Metab. 2014;99(2):363-384.',
        'Krajowy Konsultant w dziedzinie Pediatrii — informacje o polskich pracowniach przesiewu (Instytut Matki i Dziecka, Warszawa — koordynator programu).'
      ]
    },

    /* ═══════════════════════════════════════════════════════════════
     *  WZROST I ROZWÓJ
     * ═══════════════════════════════════════════════════════════════ */

    GH_deficiency: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Niedobór hormonu wzrostu u dorosłych (adult GHD)',
            body: 'Zespół chorobowy z charakterystycznymi zmianami składu ciała, dyslipidemią, obniżoną jakością życia i zwiększonym ryzykiem sercowo-naczyniowym. W Polsce kwalifikacja do leczenia jest centralna — prowadzi ją Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu u Pacjentów Dorosłych powołany przez Prezesa NFZ. Leczenie pediatryczne (SNP, ZT, PWS, SGA, PNN, pierwotny niedobór IGF-1) jest objęte osobnymi programami — zobacz wskazanie „Niedobór hormonu wzrostu (dzieci — programy lekowe)".'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Charakterystyka kliniczna',
            items: [
              { label: 'Skład ciała', text: 'wzrost masy tłuszczowej trzewnej, spadek masy mięśniowej.' },
              { label: 'Profil lipidowy', text: 'dyslipidemia (wzrost cholesterolu całkowitego, LDL, triglicerydów).' },
              { label: 'Jakość życia', text: 'obniżona — zmęczenie, osłabienie wytrzymałości fizycznej, obniżenie nastroju.' },
              { label: 'Ryzyko sercowo-naczyniowe', text: 'zwiększone — szczególnie u pacjentów z długotrwałym, nieleczonym GHD.' },
              { label: 'Gęstość mineralna kości', text: 'obniżona — zwiększone ryzyko osteoporozy i złamań.' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Klasyfikacja GHD u dorosłych',
            items: [
              { label: 'CO-GHD (childhood-onset)', text: 'GHD ujawniony w wieku dziecięcym — wymaga reewaluacji (retestu stymulacji GH) po zakończeniu terapii promującej wzrastanie.' },
              { label: 'AO-GHD (adult-onset)', text: 'GHD nabyty w wieku dorosłym — najczęściej po operacji/radioterapii przysadki, w przebiegu gruczolaka, urazu OUN lub zespołu Sheehana.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny GHD u dorosłych',
            items: [
              {
                label: 'Etiologia AO-GHD (na podst. międzynarodowych rejestrów KIMS i HypoCCS)',
                text: 'częstość typu przyczyn (wg Lewiński 2018):',
                detail: [
                  'Guzy przysadki — ~38–44% (najczęstsza przyczyna AO-GHD).',
                  'Czaszkogardlaki — ~8–11%.',
                  'Radioterapia guzów mózgu — ~7% (GHD ujawnia się stopniowo, nawet po latach).',
                  'Urazy czaszkowo-mózgowe — ~3%.',
                  'Zespół Sheehana (martwica niedokrwienna przysadki po krwotoku poporodowym) — ~3%.',
                  'Limfocytarne zapalenie przysadki — ~1%.',
                  'Idiopatyczne (bez ustalonej przyczyny mimo pełnej diagnostyki) — ~16%.',
                  'Następstwo leczenia akromegalii — niedoczynność przysadki, w tym GHD, u części pacjentów po operacji lub radioterapii (zob. panel „Akromegalia").'
                ]
              },
              { label: 'CO-GHD wymaga reewaluacji', text: 'U pacjenta CO-GHD leczonego rhGH w dzieciństwie konieczna ponowna ocena wydzielania GH po zakończeniu terapii promującej wzrastanie (≥ 1 miesiąc od ostatniej dawki) — kontynuacja terapii w dorosłości wymaga ponownego potwierdzenia ciężkiego GHD wg kryteriów dorosłych.' }
            ]
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: 'Algorytm kwalifikacji do leczenia rhGH — 3 ścieżki',
            steps: [
              {
                number: 1,
                title: 'CO-GHD (childhood-onset) — młodzież / dorośli leczeni wcześniej z powodu GHD',
                sublabel: 'GHD ujawniony w dzieciństwie — reewaluacja po ≥ 1 miesiącu od ostatniej dawki rhGH',
                options: [
                  {
                    threshold: 'Izolowany GHD',
                    action: 'DWA różne testy stymulacyjne GH — szczyt GH < 3 ng/mL w obu testach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'Po zakończeniu terapii promującej wzrastanie konieczna ponowna ocena wydzielania GH (po co najmniej 1 miesiącu od ostatniej dawki rhGH).',
                      'Program B.111 stosuje JEDNOLITY próg < 3 ng/mL u CO-GHD i AO-GHD (nie różnicuje progu młodzieżowego).',
                      'Wymagane DWA RÓŻNE testy stymulacji w przypadku izolowanego GHD — pojedynczy test niewystarczający.',
                      'Testy muszą być wykonane PO wcześniejszym właściwym wyrównaniu co najmniej niedoboru kortyzolu i L-tyroksyny.',
                      'Podstawowym testem (Program B.111) powinien być test z insuliną podaną dożylnie; w przypadku przeciwwskazań lub konieczności wykonania dwóch testów — test z glukagonem, L-DOPA lub argininą.'
                    ]
                  },
                  {
                    threshold: 'Wielohormonalna niedoczynność',
                    action: 'JEDEN test stymulacyjny wystarcza — szczyt GH < 3 ng/mL',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Przy wielohormonalnej niedoczynności przysadki — wystarczy JEDEN test stymulacyjny z szczytem GH < 3 ng/mL.',
                      'Testy muszą być wykonane PO wcześniejszym właściwym wyrównaniu co najmniej niedoboru kortyzolu i L-tyroksyny.',
                      'Podstawowym testem powinien być test z insuliną i.v.; w przypadku przeciwwskazań — test z glukagonem, L-DOPA lub argininą.'
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'AO-GHD (adult-onset) — dorośli nieleczeni w dzieciństwie z powodu GHD',
                sublabel: 'GHD nabyty w wieku dorosłym (najczęściej po operacji/radioterapii przysadki, w przebiegu gruczolaka, urazu OUN)',
                options: [
                  {
                    threshold: 'Izolowany GHD',
                    action: 'DWA różne testy stymulacyjne GH — szczyt GH < 3 ng/mL w obu testach',
                    variant: 'warning', icon: 'refresh',
                    detail: [
                      'Wymagane DWA RÓŻNE testy stymulacji w przypadku izolowanego GHD — pojedynczy test niewystarczający.',
                      'Próg Programu B.111: szczyt GH < 3 ng/mL w obu testach.',
                      'Testy muszą być wykonane PO wcześniejszym właściwym wyrównaniu co najmniej niedoboru kortyzolu i L-tyroksyny.',
                      'Podstawowym testem powinien być test z insuliną i.v.; przy przeciwwskazaniach (choroba niedokrwienna serca, padaczka, > 65 r.ż.) lub konieczności wykonania drugiego testu — test z glukagonem, L-DOPA lub argininą.'
                    ]
                  },
                  {
                    threshold: 'Wielohormonalna niedoczynność',
                    action: 'JEDEN test stymulacyjny wystarcza — szczyt GH < 3 ng/mL',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Przy wielohormonalnej niedoczynności przysadki — wystarczy JEDEN test stymulacyjny z szczytem GH < 3 ng/mL.',
                      'Testy muszą być wykonane PO wcześniejszym właściwym wyrównaniu co najmniej niedoboru kortyzolu i L-tyroksyny.',
                      'Podstawowym testem powinien być test z insuliną i.v.; w przypadku przeciwwskazań — test z glukagonem, L-DOPA lub argininą.'
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'Wielohormonalna niedoczynność WSZYSTKICH OSI + przyczyna organiczna/genetyczna',
                sublabel: 'możliwe odstąpienie od testów stymulacyjnych — wystarczy obniżone IGF-I',
                options: [
                  {
                    threshold: 'IGF-I obniżone',
                    action: 'OBNIŻONE IGF-I + spełnione warunki Programu B.111 — wystarcza do kwalifikacji bez testów stymulacyjnych',
                    variant: 'success', icon: 'check',
                    detail: [
                      'Warunki do ODSTĄPIENIA od testów stymulacyjnych wg Programu B.111: (a) wielohormonalna niedoczynność przysadki w zakresie WSZYSTKICH OSI (z wyjątkiem prolaktyny); (b) potwierdzona przyczyna ORGANICZNA lub GENETYCZNA tego stanu.',
                      'Wymagane potwierdzenie OBNIŻONEGO stężenia IGF-I (poniżej zakresu wartości prawidłowych lub w dolnym przedziale zakresu referencyjnego).',
                      'IGF-I oznaczyć po ≥ 1 miesiącu od zakończenia poprzedniej terapii rhGH (jeśli była stosowana).',
                      'wykluczyć inne przyczyny obniżonego IGF-I: niedożywienie, choroby wątroby, niewyrównana cukrzyca, niedoczynność tarczycy (wszystko bardzo istotnie obniża IGF-I — należy je leczyć przed interpretacją wyniku).',
                      'Uwaga: to bardziej restrykcyjne kryterium niż wcześniejsze rekomendacje (mówiące o „≥ 3 niedoborach") — Program B.111 wymaga niedoczynności wszystkich osi + przyczyny organicznej lub genetycznej.'
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Badania przy kwalifikacji do leczenia rhGH (16 punktów)',
            items: [
              { label: '1. Pomiary auksometryczne', text: 'wzrost, masa ciała, obwód talii (BMI + WHR); zalecane: ocena składu ciała metodą bioimpedancji.' },
              { label: '2. Ciśnienie tętnicze krwi', text: 'pomiar — element wstępnej oceny.' },
              { label: '3. Morfologia krwi z rozmazem', text: 'pełna morfologia z różnicowaniem.' },
              { label: '4. Jonogram surowicy', text: 'co najmniej stężenie Na, K i Ca.' },
              { label: '5. IGF-I', text: 'kluczowy marker rezerwy somatotropinowej.' },
              { label: '6. Gospodarka węglowodanowa', text: 'glikemia na czczo + HbA1c LUB OGTT (75 g) z oceną glikemii i insulinemii.' },
              { label: '7. Lipidogram', text: 'TG + TC + HDL-C + LDL-C.' },
              { label: '8. TSH + fT4', text: 'ocena osi tarczycowej (wyrównać niedoczynność PRZED testami stymulacyjnymi).' },
              { label: '9. Kwestionariusz QoL', text: 'ocena jakości życia wg kwestionariusza opublikowanego w Endokrynol. Pol. 2008;59(5):374-384.' },
              { label: '10. Kortyzol poranny', text: 'wykluczenie niedoczynności kory nadnerczy (wyrównać hydrokortyzonem PRZED testami stymulacyjnymi).' },
              { label: '11. Test(y) stymulacji GH', text: 'jeden lub dwa testy stymulujące sekrecję GH zgodnie z Kryteriami Kwalifikacji; podstawowy — test z insuliną i.v.; przy przeciwwskazaniach lub konieczności drugiego testu — test z glukagonem, L-DOPA lub argininą.' },
              { label: '12. Obrazowanie okolicy podwzgórzowo-przysadkowej', text: 'MRI lub TK z kontrastem — wykluczenie czynnego procesu nowotworowego.' },
              { label: '13. USG jamy brzusznej', text: 'wstępna ocena onkologiczna i metaboliczna.' },
              { label: '14. EKG', text: 'ewentualnie USG serca (echokardiografia).' },
              { label: '15. Badanie dna oka', text: 'okulistyczna ocena tarczy nerwu wzrokowego i siatkówki.' },
              { label: '16. Inne badania i konsultacje', text: 'wg potrzeb klinicznych (np. neurochirurgiczna, onkologiczna).' }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'baby-bottle',
            collapsible: true,
            title: 'Schemat dawkowania somatotropiny u dorosłych',
            body: [
              { heading: 'Sposób podawania' },
              { items: [
                { label: 'Droga', text: 'iniekcje podskórne (s.c.).' },
                { label: 'Pora', text: 'codziennie wieczorem.' },
                { label: 'Dawka', text: '0,1–0,8 mg/dobę — ustalana indywidualnie.' }
              ]},
              { heading: 'Zasady miareczkowania dawki' },
              { items: [
                'Start od dawki niskiej; stopniowe miareczkowanie na podstawie IGF-I (kontrola po 30 dniach od rozpoczęcia terapii).',
                'Cel terapeutyczny: stężenie IGF-I w zakresie normy wiekowej — nie należy dążyć do wartości wyższych (ryzyko działań niepożądanych).',
                'Wyższe dawki początkowe zmniejszają skuteczność wieloletniej terapii i zwiększają ryzyko działań niepożądanych.'
              ]},
              { heading: 'Różnice płciowe w zapotrzebowaniu' },
              { items: [
                'Kobiety zwykle wymagają wyższych dawek niż mężczyźni.',
                'Szczególnie wyższe dawki potrzebne u kobiet przyjmujących estrogeny doustnie — efekt pierwszego przejścia przez wątrobę zmniejsza syntezę IGF-I.'
              ]}
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Monitorowanie leczenia',
            items: [
              {
                label: 'Po 30 dniach od rozpoczęcia terapii',
                text: 'pomiar IGF-I w celu ustalenia dawki OPTYMALNEJ:',
                detail: [
                  'IGF-I — kluczowy marker skuteczności i bezpieczeństwa terapii.',
                  'Cel: IGF-I w zakresie normy wiekowej; NIE wyższe (ryzyko działań niepożądanych).',
                  'Dawkę modyfikuje się indywidualnie w zakresie 0,1–0,8 mg/dzień.'
                ]
              },
              {
                label: 'Co 180 dni (co 6 miesięcy)',
                text: 'pełna ocena skuteczności i bezpieczeństwa:',
                detail: [
                  'a. Pomiary auksometryczne — wzrost, masa ciała, obwód talii (BMI + WHR); zalecane: skład ciała metodą bioimpedancji.',
                  'b. Pomiar ciśnienia tętniczego krwi.',
                  'c. Jonogram surowicy (Na, K, Ca).',
                  'd. HbA1c.',
                  'e. IGF-I.',
                  'f. TSH + fT4.',
                  'g. Lipidogram (TG, TC, HDL-C, LDL-C).',
                  'h. Kwestionariusz QoL.',
                  'i. Inne badania i konsultacje wg potrzeb.'
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'alert-triangle',
            collapsible: true,
            title: 'Kryteria wyłączenia z leczenia',
            body: [
              { items: [
                'Ujawnienie lub wznowa czynnego procesu nowotworowego — bezwzględne przeciwwskazanie.',
                'Ciężkie stany zagrażające życiu.',
                'Cukrzyca niedająca się wyrównać w warunkach leczenia rhGH (somatotropina zwiększa insulinooporność — terapia wymaga monitorowania glikemii i HbA1c).',
                'Utrzymujące się podwyższone stężenie IGF-I pomimo zmniejszenia dawki leku do minimalnej (0,1 mg/dobę).',
                'Wystąpienie nowych lub brak poprawy istniejących zaburzeń metabolicznych oraz pogorszenie jakości życia (ocena po 12 i 24 miesiącach terapii).',
                'Brak zgody świadczeniobiorcy na kontynuację leczenia lub brak współpracy.'
              ]},
              'Decyzję o wyłączeniu z programu podejmuje lekarz prowadzący lub Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu u Pacjentów Dorosłych.'
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Ocena reszty osi przysadkowej (wielohormonalna niedoczynność)',
            items: [
              { label: 'Tarczyca — TSH + fT4', text: 'wykluczenie WTÓRNEJ niedoczynności tarczycy (TSH nieadekwatnie prawidłowe / niskie + fT4 obniżone). Wyrównać L-tyroksyną PRZED testami stymulacyjnymi.' },
              { label: 'Kora nadnerczy — kortyzol poranny + ACTH', text: 'wykluczenie wtórnej niedoczynności kory nadnerczy — STAN ZAGRAŻAJĄCY ŻYCIU. Pilna substytucja hydrokortyzonem PRZED innymi terapiami; test z insuliną bezwzględnie wymaga wykluczenia niedoczynności nadnerczy (ryzyko kryzy podczas hipoglikemii).' },
              { label: 'Gonady — LH + FSH + testosteron / estradiol', text: 'wykluczenie hipogonadyzmu hipogonadotropowego; substytucja steroidami płciowymi przed testami stymulacyjnymi (steroidy modulują wydzielanie GH).' },
              { label: 'Prolaktyna', text: 'w niedoczynności przysadki zwykle obniżona; PODWYŻSZONA przy efekcie przerwania szypuły przez makrogruczolaka (kompresja szypuły blokuje hamujący wpływ dopaminy podwzgórzowej).' },
              { label: 'MRI przysadki z gadolinium', text: 'wykluczenie zmian organicznych w okolicy podwzgórzowo-przysadkowej (gruczolak, czaszkogardlak, naciek, krwawienie, zespół pustego siodła) — także wymagane przy kwalifikacji do Programu B.111 (pkt 12).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy (skrining)',
          tests: [
            { id: 'igf1',
              note: 'Cel: skrining GHD u dorosłego. Wg Programu B.111 obniżone IGF-I (poniżej zakresu wartości prawidłowych lub w dolnym przedziale referencyjnym dla wieku/płci) jest wystarczające do rozpoznania ciężkiego GHD u pacjenta z wielohormonalną niedoczynnością wszystkich osi przysadkowych (z wyjątkiem prolaktyny) oraz z udokumentowaną organiczną lub genetyczną przyczyną tej niedoczynności — bez konieczności testu stymulacji. Pamiętaj: czynniki obniżające IGF-I (niedożywienie, choroby wątroby, niewyrównana cukrzyca, niedoczynność tarczycy) muszą być wyrównane przed interpretacją wyniku.',
              description: 'IGF-I (insulinopodobny czynnik wzrostu I, somatomedyna C) — najważniejszy obwodowy marker aktywności osi GH. Produkowany głównie w wątrobie pod wpływem GH (krążący IGF-I), działa zarówno endokrynnie jak i lokalnie (parakrynnie/autokrynnie w wielu tkankach). Zalety: stabilność wydzielania (niepulsacyjne jak GH), długi okres półtrwania (~15 h), integracja sygnału GH z całego dnia. Pomiar: rano na czczo, wartości porównywane z normami wieku i płci (oraz Tannera u dzieci). Czułość: niedoskonała — prawidłowy IGF-I nie wyklucza GHD (u dziecka zwłaszcza w izolowanym GHD z prawidłową masą wątrobową; u dorosłego — częściowe nakładanie się normy z zakresem GHD). Czynniki obniżające IGF-I poza GHD: niedożywienie, choroby wątroby, niewyrównana cukrzyca, niedoczynność tarczycy — wszystkie należy wyrównać przed interpretacją wyniku. Kryterium Programu B.111 (NFZ, obowiązujące w Polsce od XI.2020): obniżone IGF-I (poniżej zakresu wartości prawidłowych lub w dolnym przedziale referencyjnym) wystarcza do rozpoznania ciężkiego GHD u dorosłego — bez konieczności testu stymulacji — gdy spełnione są łącznie dwa warunki: (a) wielohormonalna niedoczynność przysadki w zakresie WSZYSTKICH OSI (z wyjątkiem prolaktyny), (b) potwierdzona organiczna lub genetyczna przyczyna tej niedoczynności.' },
            { id: 'igfbp3',
              note: 'Pomocniczy marker, uzupełnia IGF-1. Wartości referencyjne wg wieku i stadium Tannera. Łącznie z IGF-1 mają lepszą czułość niż każdy z osobna.' }
          ]
        },
        { name: 'Testy stymulacji wydzielania GH',
          tests: [
            { ext: 'itt', label: 'Test z insuliną (test hipoglikemii poinsulinowej) — złoty standard',
              note: 'Test z wyboru u dorosłego (Program B.111 wskazuje go jako podstawowy). Wymaga indukcji hipoglikemii (glikemia < 40 mg/dL = 2,2 mmol/L) insuliną i.v. 0,05–0,15 IU/kg. Próg Programu B.111: szczyt GH < 3,0 ng/mL — jednolity dla dorosłych i młodzieży po terapii promującej wzrastanie. Przeciwwskazania bezwzględne: choroba niedokrwienna serca, padaczka, nieleczona niedoczynność kory nadnerczy; ostrożnie przy wieku > 65 lat. Wykonywać wyłącznie w ośrodku z doświadczeniem (ryzyko ciężkiej hipoglikemii — glukoza 40% gotowa do podania).',
              description: 'Test z insuliną (insulin tolerance test, ITT) — złoty standard diagnostyki GHD u dorosłych. Zasada: farmakologicznie indukowana hipoglikemia jest najsilniejszym fizjologicznym stymulatorem GH poprzez mechanizm kontrregulacji (kortyzol + GH + glukagon + adrenalina). Protokół: pacjent na czczo, dostęp żylny w obu rękach (jeden do podania insuliny i pobierania krwi, drugi do glukozy ratunkowej — 40% gotowej do podania). Insulina krystaliczna i.v. w dawce 0,05–0,15 IU/kg (większa dawka przy podejrzeniu insulinooporności — otyłość, akromegalia, choroby przysadki). Punkty pomiaru GH (+ kortyzol jako kontrola): wyjściowe −30 i 0 min (przed insuliną — baseline), następnie 30, 45, 60, 90, 120 min po insulinie. Pomiar glikemii i objawów hipoglikemii co 15–30 min. Cel: glikemia < 40 mg/dL (2,2 mmol/L) + objawy hipoglikemii (drżenie, pocenie, tachykardia) — bez tego test jest nieinterpretowalny. Próg Programu B.111: szczyt GH < 3,0 ng/mL = ciężki GHD u dorosłych i u młodzieży po zakończeniu terapii promującej wzrastanie (jednolity próg, niezależny od wieku). Kortyzol: równoczesna ocena rezerwy nadnerczowej (szczyt > 500 nmol/L = prawidłowa; < 500 = niewydolność wtórna). Ryzyko: ciężka hipoglikemia, drgawki, arytmie — test wyłącznie w ośrodku z doświadczeniem.' },
            { ext: 'ghrh_arg', label: 'GHRH + arginina (alternatywa)',
              note: 'Bezpieczna alternatywa dla ITT (bez hipoglikemii) — wskazana przy przeciwwskazaniach do ITT. PROGI zależne OD BMI (Lewiński 2018): BMI < 25 kg/m² → szczyt GH < 11,0 ng/mL = GHD; BMI 25–30 → < 8,0; BMI > 30 → < 4,0 (otyłość fizjologicznie obniża odpowiedź). UWAGA: ocenia jedynie maksymalną zdolność wydzielniczą PRZYSADKI (NIE całej osi podwzgórze-przysadka) — może nie wykryć GHD podwzgórzowego.',
              description: 'GHRH + arginina — kombinowany test stymulacji wydzielania GH, ALTERNATYWA dla ITT u dorosłego z przeciwwskazaniami do hipoglikemii. Zasada: GHRH bezpośrednio pobudza komórki somatotropowe przysadki; arginina hamuje somatostatynę podwzgórzową (znosi tonus hamujący). Razem dają mocną stymulację bez konieczności wywoływania hipoglikemii. PROTOKÓŁ: pacjent na czczo; GHRH 1 μg/kg i.v. bolus + arginina 0,5 g/kg (max 30 g) w 30-min wlewie i.v.; pomiar GH w punktach 0, 15, 30, 45, 60, 90 min. PROGI POLSKIE (Lewiński 2018, zależne od BMI): BMI < 25 kg/m² → szczyt GH < 11,0 ng/mL; BMI 25–30 → < 8,0; BMI > 30 → < 4,0. Zaleta: bezpieczny (bez hipoglikemii), powtarzalny, dobrze tolerowany. OGRANICZENIE: ocenia jedynie REZERWĘ wydzielniczą przysadki, NIE funkcję całej osi podwzgórze-przysadka — może NIE wykryć GHD podwzgórzowego (gdy uszkodzenie jest na poziomie podwzgórza). Z tego powodu przy ujemnym wyniku GHRH+arg u pacjenta z silnym klinicznym podejrzeniem GHD i zmianami organicznymi w okolicy podwzgórza → dodatkowo wykonać ITT (jeśli możliwe).' },
            { ext: 'glucagon_test', label: 'Test z glukagonem',
              note: 'U dorosłych: alternatywa dla testu z insuliną (zwykle gdy ITT przeciwwskazany, a GHRH+arginina niedostępna). U dzieci: jeden z 2 testów stymulacji. Próg Programu B.111: szczyt GH < 3,0 ng/mL u dorosłego i młodzieży po terapii promującej wzrastanie (jednolity). Próg pediatryczny w B.19: szczyt GH < 10 ng/mL. Protokół: glukagon 1 mg i.m. (< 90 kg) lub 1,5 mg (≥ 90 kg); pomiar GH w punktach 0, 90, 120, 150, 180 min. Działa wolniej niż test z insuliną, czas trwania 3 h. Skutki uboczne: nudności, wymioty, opóźniona hipoglikemia po 4–5 h (pacjent musi zjeść po teście).',
              description: 'Test z glukagonem — alternatywa dla testu z insuliną, oparta na pośrednim mechanizmie stymulacji GH (mechanizm dokładnie nie poznany, prawdopodobnie aktywacja somatostatyno- i GHRH-zależnych szlaków). Protokół: pacjent na czczo; glukagon 1 mg i.m. (< 90 kg) lub 1,5 mg (≥ 90 kg); pomiar GH w punktach 0, 90, 120, 150, 180 min (test długi — 3 h). Progi: u dorosłych w Programie B.111 — szczyt GH < 3,0 ng/mL (jednolity dla dorosłych i młodzieży po terapii promującej wzrastanie); u dzieci w B.19 — szczyt GH < 10 ng/mL. Zalety: nie wymaga hipoglikemii (bezpieczny u pacjentów z chorobą wieńcową, padaczką, > 65 r.ż.); szeroka dostępność glukagonu. Ograniczenia: dłuższy czas trwania (3 h vs 2 h dla testu z insuliną); częste działania niepożądane (nudności u ~30%, wymioty u ~10%, opóźniona hipoglikemia po 4–5 h — pacjent musi zjeść po teście); mniejsza czułość niż test z insuliną (więcej wyników fałszywie dodatnich). Zastosowanie u dzieci: jeden z preferowanych testów stymulacji (obok testu z insuliną, klonidyną, argininą) — wymaga dwóch różnych testów dla potwierdzenia izolowanego GHD pediatrycznego.' },
          ]
        },
        { name: 'Ocena reszty osi przysadkowej',
          tests: [
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'cortisol' }, { id: 'acth' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'prolactin' },
            EXT.pituitary_mri
          ]
        }
      ],
      guideline: 'Program Lekowy B.111 NFZ — "Leczenie ciężkiego niedoboru hormonu wzrostu u pacjentów dorosłych oraz u młodzieży po zakończeniu terapii promującej wzrastanie" (ICD-10 E23.0; Załącznik B.111 do Obwieszczenia Ministra Zdrowia, obowiązujący od XI.2020). Źródła pomocnicze: Lewiński/Smyczyńska/Stawerska 2018 (Endokrynol Pol), Endocrine Society 2011 (Molitch), GH Research Society 2007. Dla DZIECI — zob. osobny panel "Niedobór hormonu wzrostu (dzieci — programy lekowe)".',
      sources: [
        'Załącznik B.111 do Obwieszczenia Ministra Zdrowia — LECZENIE CIĘŻKIEGO NIEDOBORU HORMONU WZROSTU U PACJENTÓW DOROSŁYCH ORAZ U MŁODZIEŻY PO ZAKOŃCZENIU TERAPII PROMUJĄCEJ WZRASTANIE (ICD-10 E23.0). Program Lekowy obowiązujący w Polsce od listopada 2020 r. Realizator: Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu u Pacjentów Dorosłych. URL: https://www.gov.pl/web/zdrowie/programy-lekowe',
        'Lewiński A, Smyczyńska J, Stawerska R, Hilczer M, Stasiak M, Bednarczuk T, Bolanowski M i wsp. Ogólnopolski Program Leczenia Ciężkiego Niedoboru Hormonu Wzrostu u Osób Dorosłych oraz u Młodzieży po Zakończeniu Terapii Promującej Wzrastanie. Endokrynologia Polska. 2018;69(5):497-524.',
        'Molitch ME, Clemmons DR, Malozowski S, Merriam GR, Vance ML. Evaluation and Treatment of Adult Growth Hormone Deficiency: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2011;96(6):1587-1609.',
        'Cook DM, Yuen KC, Biller BMK i wsp. American Association of Clinical Endocrinologists Medical Guidelines for Clinical Practice for Growth Hormone Use in Growth Hormone-Deficient Adults and Transition Patients — 2009 Update. Endocr Pract. 2009;15(Suppl 2):1-29.',
        'GH Research Society. Consensus Guidelines for the Diagnosis and Treatment of Adults with Growth Hormone Deficiency. J Clin Endocrinol Metab. 1998;83(2):379-381 (oraz aktualizacje 2007).',
        'Zgliczyński W (red.). Wielka Interna — Endokrynologia. Medical Tribune Polska — rozdział o niedoborze hormonu wzrostu.'
      ]
    },

    GH_deficiency_kids: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Leczenie hormonem wzrostu (rhGH) i rhIGF-1 u dzieci',
            body: 'W Polsce leczenie niskorosłości u dzieci jest refundowane w ramach 6 osobnych Programów Lekowych NFZ — każdy z własnymi kryteriami kwalifikacji, dawkowania i monitorowania. Kwalifikacja centralna: Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu (NFZ, siedziba IPCZD). 5 programów stosuje rhGH (somatotropinę), jeden — pierwotny niedobór IGF-1 — stosuje rhIGF-1 (mecasermina).'
          },
          {
            kind: 'list',
            icon: 'check',
            title: 'Wskazania do leczenia',
            items: [
              { label: 'Somatotropinowa niedoczynność przysadki (SNP)', text: 'klasyczny niedobór GH — najczęstsze wskazanie' },
              { label: 'Zespół Turnera (ZT)', text: 'kariotyp 45,X lub mozaicyzm u dziewcząt' },
              { label: 'Zespół Pradera-Williego (PWS)', text: 'potwierdzony genetycznie — cel inny niż wzrost' },
              { label: 'Dzieci z SGA/IUGR', text: 'brak catch-up growth do 4. r.ż.' },
              { label: 'Przewlekła niewydolność nerek (PNN)', text: 'niskorosłość + obniżony klirens kreatyniny' },
              { label: 'Pierwotny niedobór IGF-1', text: 'jedyne wskazanie z rhIGF-1 (mecasermina) zamiast rhGH' }
            ]
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: '6 wskazań do leczenia rhGH / rhIGF-1 u dzieci — Programy Lekowe NFZ',
            steps: [
              {
                number: 1,
                title: 'B.19 — SNP — Somatotropinowa Niedoczynność Przysadki (ICD-10 E23)',
                sublabel: 'klasyczny GHD u dziecka — wersja Programu od 10.2024 (uwzględnia Somatrogon)',
                options: [
                  {
                    threshold: 'Kryteria',
                    action: 'Wzrost < 3. centyla wg siatek polskich + opóźniony wiek kostny (Greulich-Pyle) + szczyt GH < 10 ng/mL w DWÓCH niezależnych testach stymulacji (test insulinowy DOPIERO po 5. r.ż.; pozostałe testy dopiero po 2. r.ż.). Przy wielohormonalnej niedoczynności przysadki LUB udokumentowanej mutacji związanej z GHD — wystarczy JEDEN test.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Kryteria włączenia' },
                      { items: [
                        { label: 'Niskorosłość', text: 'wzrost < 3. centyla dla płci i wieku wg siatek populacji polskiej. Wyjątki od progu 3. centyla: dzieci z wielohormonalną niedoczynnością przysadki (WNP), dzieci z udokumentowanymi mutacjami związanymi z GHD, dzieci leczone w okresie niemowlęcym/poniemowlęcym, dzieci po terapii chorób rozrostowych.' },
                        { label: 'Wiek kostny opóźniony', text: 'oceniany metodą Greulich-Pyle (RTG śródręcza i nadgarstka ręki niedominującej).' },
                        { label: 'Testy stymulacji GH', text: 'szczyt GH < 10 ng/mL w DWÓCH niezależnych testach. Przy WNP lub udokumentowanej mutacji związanej z GHD — wystarczy JEDEN test. Test insulinowy DOPIERO po 5. r.ż.; pozostałe testy DOPIERO po 2. r.ż.' },
                        { label: 'Wykluczenie innych przyczyn niskorosłości', text: 'niedokrwistość, niedoczynność tarczycy, zaburzenia wchłaniania i trawienia jelitowego itp. — lub wyrównanie chorób współistniejących.' },
                        { label: 'Ścieżka noworodkowa', text: 'nawracające hipoglikemie u noworodków/niemowląt (po wykluczeniu hiperinsulinizmu wrodzonego, pierwotnego niedoboru GKS), szczególnie z wadami linii pośrodkowej twarzo-czaszki → natychmiastowa kwalifikacja bez czekania na 3. centyl. Zamiast testów stymulacji ≥ 5-krotny pomiar GH (optymalnie we śnie); GH ≥ 10 ng/mL nie wyklucza wskazania.' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'IGF-1 i IGFBP-3 z określeniem proporcji stężeń (norma laboratorium, wg wieku/Tannera) — prawidłowy IGF-1 nie wyklucza GHD.',
                        'MRI lub TK z kontrastem OUN — ze szczególnym uwzględnieniem okolicy podwzgórzowo-przysadkowej (gruczolak, czaszkogardlak, hipoplazja przysadki, zespół przerwania szypuły, ektopia tylnego płata).',
                        'Ocena pozostałych osi: TSH/fT4/fT3, kortyzol rano i wieczorem; w uzasadnionych przypadkach test stymulacji gonadotropin.',
                        'Pomiary auksometryczne, dojrzałość wg Tannera, RTG wieku kostnego.',
                        'Jonogram (Na+, Ca++ całkowity i zjonizowany), morfologia z rozmazem, AlAT/AspAT, 25-OH-D.',
                        'Glukoza na czczo + HbA1c LUB OGTT z insulinemią; lipidogram.',
                        'Przeciwciała anty-tTG IgA (wykluczenie celiakii); konsultacja okulistyczna z dnem oka.',
                        'Konsultacja hematoonkologiczna — u dzieci po terapii nowotworowej; konsultacja neurologiczna/neurochirurgiczna — po zabiegach OUN.'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Somatotropina', text: '0,1–0,33 mg (0,3–1,0 IU)/kg m.c./TYDZIEŃ, CODZIENNIE WIECZOREM s.c.' },
                        { label: 'Somatrogon (od 10.2024 — analog długodziałający)', text: '0,66 mg/kg s.c. 1× w TYGODNIU; tylko dla dzieci ≥ 3. r.ż.' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Po 90 dniach od startu', text: 'antropometria + IGF-1/IGFBP-3 z proporcją; u niemowląt z hipoglikemiami — ocena ustąpienia hipoglikemii + glikemia + HbA1c; u pozostałych — Tanner, glikemia + HbA1c.' },
                        { label: 'Co 180 dni', text: 'pomiary auksometryczne (wzrost SDS, masa, HV cm/rok, BMI), Tanner, glikemia + HbA1c (lub co 365 dni OGTT z insulinemią), TSH + fT4, IGF-1 + IGFBP-3.' },
                        { label: 'Co 365 dni', text: 'RTG wieku kostnego, jonogram (Na+, Ca++), lipidogram, AlAT/AspAT, morfologia z rozmazem; w uzasadnionych przypadkach 25-OH-D, dno oka.' },
                        { label: 'Po zakończeniu terapii promującej wzrastanie', text: '≥ 1 mies. po zakończeniu — retest stymulacji GH (≥ 5 pomiarów). Szczyt GH < 3 ng/mL → przekazanie do programu B.111 (panel „Niedobór hormonu wzrostu (dorośli)").' }
                      ]},
                      { heading: 'Kryteria wyłączenia' },
                      { items: [
                        'Złuszczenie głowy kości udowej.',
                        'Ujawnienie lub wznowa choroby rozrostowej.',
                        'Niezadowalający efekt: przyrost wzrostu < 2 cm/rok.',
                        'Osiągnięcie wieku kostnego: > 14 lat (♀) / > 16 lat (♂).',
                        'Ciąża lub karmienie piersią.',
                        'Brak współpracy / nieprzestrzeganie zaleceń.'
                      ]},
                      { heading: 'Kryteria czasowego wyłączenia' },
                      { items: [
                        'Utrzymujące się ponadnormatywne stężenia IGF-1 mimo zmniejszenia dawki.',
                        'Pseudo-tumor cerebri (po wykluczeniu przyczyn organicznych).',
                        'Źle wyrównana cukrzyca.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'B.42 — ZT — Zespół Turnera (ICD-10 Q96)',
                sublabel: 'kariotyp 45,X lub mozaicyzm u dziewczynek — bez konieczności udokumentowanego GHD',
                options: [
                  {
                    threshold: 'Kryteria',
                    action: 'Stygmaty ZT + kariotyp + wzrost < 3. centyla wg siatek polskich + HV < −1 SDS (≥ 6-miesięczny okres obserwacji) + opóźniony wiek kostny (Greulich-Pyle). Przewidywany wzrost ostateczny wg metody Bayley-Pineau.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Kryteria włączenia' },
                      { items: [
                        { label: 'Stygmaty ZT + kariotyp', text: '45,X lub mozaicyzm — konsultacja genetyczna potwierdzona dodatnim wynikiem badania kariotypu.' },
                        { label: 'FISH dla regionów chromosomu Y', text: 'konieczne przy podejrzeniu mozaicyzmu z linią Y. Wykrycie markerów Y wymaga profilaktycznej gonadektomii PRZED włączeniem rhGH (ryzyko gonadoblastoma).' },
                        { label: 'Niskorosłość', text: 'wzrost < 3. centyla dla wieku, na siatkach centylowych dla populacji DZIEWCZĄT POLSKICH.' },
                        { label: 'Upośledzone tempo wzrastania', text: 'HV < −1 SDS w odniesieniu do tempa wzrastania dziewcząt polskich (≥ 6-MIESIĘCZNY okres obserwacji) — z określeniem przewidywanego wzrostu ostatecznego metodą BAYLEY-PINEAU.' },
                        { label: 'Wiek kostny opóźniony', text: 'oceniany metodą Greulich-Pyle.' },
                        { label: 'Wykluczenie innych przyczyn niskorosłości', text: 'niedokrwistość, niedoczynność tarczycy, zaburzenia wchłaniania i trawienia, obciążenia okresu okołoporodowego.' },
                        { label: 'Ocena anatomiczna', text: 'układ sercowo-naczyniowy (koarktacja aorty, dwupłatkowa zastawka aortalna) i moczowo-płciowy (podkowiasta nerka).' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'Pomiar stężenia IGF-1.',
                        'Pozostałe badania laboratoryjne wg standardów diagnozowania świadczeniobiorców z ZT.',
                        'NIE wymaga testów stymulacji GH — leczenie ma na celu osiągnięcie wzrostu docelowego mimo prawidłowej osi GH (oporność receptorowa).'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Somatotropina', text: '0,33–0,47 mg (1,0–1,4 IU)/kg m.c./TYDZIEŃ, CODZIENNIE WIECZOREM s.c. — wyższa niż w B.19 (SNP).' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Po 90 dniach', text: 'IGF-1.' },
                        { label: 'Co 180 dni', text: 'glikemia + HbA1c (lub co 365 dni OGTT z insulinemią), TSH + fT4, jonogram.' },
                        { label: 'Co 365 dni', text: 'IGF-1, RTG wieku kostnego, ginekolog dziecięcy (♀ > 10 r.ż.), kardiolog + ECHO (przy wadach), nefrolog + USG jamy brzusznej + badanie ogólne i posiew moczu (przy wadach moczowych).' }
                      ]},
                      { heading: 'Kryteria wyłączenia' },
                      { items: [
                        'Złuszczenie głowy kości udowej.',
                        'Pseudo-tumor cerebri.',
                        'Ujawnienie cukrzycy.',
                        'Ujawnienie lub wznowa choroby rozrostowej.',
                        'Zakończenie wzrastania (brak przyrostu między 2 kolejnymi wizytami co 6 mies.).',
                        'Niezadowalający efekt: przyrost < 2 cm/rok.',
                        'Wiek kostny > 14 lat.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'B.41 — PWS — Zespół Pradera-Williego (ICD-10 Q87.1)',
                sublabel: 'cel inny niż wzrost — poprawa składu ciała, masy mięśniowej, funkcji poznawczych',
                options: [
                  {
                    threshold: 'Kryteria',
                    action: 'Rozpoznanie PWS klinicznie POTWIERDZONE GENETYCZNIE + wiek < 18 r.ż. (optymalnie od ~4 r.ż.) + BMI < 97. centyla + wyrównane przemiany węglowodanowe (OGTT) + konsultacja laryngologiczna (ryzyko OSA) + ≥ 6-miesięczne leczenie dietetyczne i rehabilitacja w ośrodku.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Cel terapii (specyfika PWS)' },
                      { items: [
                        'Cel inny niż w pozostałych programach: nie tylko wzrost, ale POPRAWA składu ciała (↓ masa tłuszczowa, ↑ masa mięśniowa), siły i napięcia mięśniowego, gęstości kości, funkcji poznawczych i motorycznych.'
                      ]},
                      { heading: 'Kryteria włączenia' },
                      { items: [
                        { label: 'Rozpoznanie PWS', text: 'cechy kliniczne POTWIERDZONE badaniem GENETYCZNYM (test metylacji SNRPN obejmuje wszystkie 3 mechanizmy: delecja 15q11-q13 ojcowska ~70%; mUPD15 matczyna ~25%; defekt imprintingu ~3%).' },
                        { label: 'Wiek', text: '< 18. r.ż., optymalnie od ~4. r.ż. Pacjenci po 18 r.ż. KONTYNUUJĄ terapię na zasadach Programu do spełnienia kryterium wyłączenia.' },
                        { label: 'Wiek kostny', text: '< 16 lat ♀ / < 18 lat ♂.' },
                        { label: 'BMI', text: '< 97. centyla dla płci i wieku (≥ 6-miesięczny okres obserwacji w ośrodku).' },
                        { label: 'Przemiany węglowodanowe', text: 'wyrównane — wymagane OGTT z pomiarem glikemii i insulinemii.' },
                        { label: 'Konsultacja laryngologiczna obowiązkowa', text: 'ryzyko OSA (typowe w PWS; rhGH może nasilać przez hiperplazję tkanek miękkich gardła).' },
                        { label: 'Leczenie dietetyczne i rehabilitacja', text: 'wprowadzone — ≥ 6-miesięczny okres obserwacji w ośrodku.' },
                        { label: 'Brak innych przeciwwskazań', text: 'do stosowania hormonu wzrostu.' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'Pomiar stężenia IGF-1.',
                        'Pozostałe badania laboratoryjne i inne wg standardów diagnozowania świadczeniobiorców z PWS.'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Somatotropina', text: '0,18–0,47 mg/kg/TYDZIEŃ (0,54–1,4 IU/kg/tydz.), CODZIENNIE WIECZOREM s.c. Szeroki zakres — start od niższej dawki z miareczkowaniem.' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Po 30 dniach', text: 'konsultacja laryngologiczna (kontrolna polisomnografia).' },
                        { label: 'Po 90 dniach', text: 'IGF-1, konsultacja laryngologiczna.' },
                        { label: 'Co 90 dni', text: 'dietetyk + rehabilitant.' },
                        { label: 'Co 180 dni', text: 'glikemia, TSH, fT4, jonogram (ocena okresowa skuteczności przez lekarza niezaangażowanego w leczenie).' },
                        { label: 'Co 365 dni', text: 'IGF-1, RTG wieku kostnego, lipidogram (TG, cholesterol całkowity, HDL, LDL), HbA1c, OGTT z insulinemią, ginekolog dziecięcy (♀ > 10 r.ż.), kardiolog + ECHO (przy wadach), psycholog (rozwój intelektualny ≥ 7 r.ż., psychoruchowy < 7 r.ż.), laryngolog, ortopeda, test stymulacji gonadotropin (przy zaburzeniach pokwitania).' }
                      ]},
                      { heading: 'Kryteria wyłączenia' },
                      { items: [
                        'Brak współpracy z rodzicami / pacjentem.',
                        'Powikłania zastosowanej terapii.',
                        'Zaniechanie systematycznej rehabilitacji lub diety.',
                        'Narastanie otyłości pomimo kompleksowego leczenia (BMI ↑ o ≥ 2 SD).',
                        'Pojawienie się lub nasilenie nocnych bezdechów.',
                        'Cukrzyca lub jej ujawnienie w trakcie terapii.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 4,
                title: 'B.64 — Dzieci urodzonych jako SGA lub IUGR (ICD-10 R62.9)',
                sublabel: 'bez catch-up growth do 4. r.ż. — często izolowany niski wzrost',
                options: [
                  {
                    threshold: 'Kryteria (muszą być spełnione łącznie)',
                    action: 'Urodzeniowa masa lub długość < −2 SDS dla wieku ciążowego/płci + wiek > 4 lata + wzrost < 3. centyla wg siatek polskich + HV < −1 SDS przez ≥ 6 mies. + BA < 14 (♀) / < 16 (♂) + GH ≥ 10 ng/mL w 2/4 testach stymulacji LUB nocnym wyrzucie (≥ 5 pomiarów) + brak przeciwwskazań w MRI/TK okolicy podwzgórzowo-przysadkowej.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Kryteria włączenia (wszystkie łącznie)' },
                      { items: [
                        { label: 'Dokumentacja urodzeniowa', text: 'urodzeniowa masa LUB długość ciała < −2 SDS dla wieku ciążowego i płci wg norm populacyjnych (karta wypisu z oddziału neonatologicznego).' },
                        { label: 'Wiek', text: '> 4 lat — przed tym wiekiem oczekuje się catch-up growth.' },
                        { label: 'Niskorosłość', text: 'wzrost < 3. centyla dla płci i wieku, na siatkach centylowych dla populacji DZIECI POLSKICH.' },
                        { label: 'Upośledzone tempo wzrastania', text: 'HV < −1 SDS w odniesieniu do tempa populacji dzieci polskich (≥ 6-MIESIĘCZNY okres obserwacji).' },
                        { label: 'Wiek kostny', text: 'BA < 14 lat ♀ / < 16 lat ♂ wg Greulich-Pyle (zbyt zaawansowany BA jest przeciwwskazaniem).' },
                        { label: 'Wykluczenie innych przyczyn niskorosłości', text: 'aniżeli SGA/IUGR.' },
                        { label: 'Testy stymulacji GH — kluczowe rozróżnienie', text: 'GH ≥ 10 ng/mL w 2/4 testach LUB w teście nocnego wyrzutu (≥ 5 pomiarów). W SGA GH MUSI BYĆ PRAWIDŁOWY (jeśli niedoborowy → dziecko trafia do B.19, nie B.64).' },
                        { label: 'MRI/TK okolicy podwzgórzowo-przysadkowej', text: 'brak przeciwwskazań do rhGH.' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'IGF-1, IGFBP-3.',
                        'Pomiary auksometryczne (wzrost, masa, obwód głowy i klatki piersiowej).',
                        'Glikemia na czczo + HbA1c; OGTT z glikemią i insulinemią.',
                        'Lipidogram (TG, cholesterol całkowity, HDL, LDL).',
                        'Ciśnienie tętnicze; badanie dna oka.',
                        'TSH, fT4, fT3.',
                        'RTG śródręcza ręki dominującej (Greulich-Pyle).',
                        'Jonogram surowicy (Na, Ca), morfologia z rozmazem.',
                        'Konsultacja psychologa (rozwój intelektualny ≥ 7 r.ż., psychoruchowy < 7 r.ż.).',
                        '2 spośród 4 testów stymulacji GH (insulina, klonidyna, glukagon, L-DOPA).',
                        'MRI/TK okolicy podwzgórzowo-przysadkowej; USG jamy brzusznej; USG serca.',
                        'W uzasadnionych przypadkach (cechy dysmorfii / wady wrodzone) — konsultacja genetyczna, kariotyp lub badanie molekularne.'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Somatotropina', text: '0,48–1,29 IU/kg/TYDZIEŃ (0,16–0,43 mg/kg/tydz.), OPTYMALNIE ok. 0,75 IU/kg/tydz. (0,25 mg/kg/tydz.), CODZIENNIE WIECZOREM s.c.' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Po 90 dniach (jednorazowo)', text: 'IGF-1, IGFBP-3, antropometria (wzrost, masa, obwód głowy i klatki), ciśnienie tętnicze.' },
                        { label: 'Co 180 dni', text: 'glikemia na czczo, HbA1c, IGF-1 (przy podwyższonym — co 90 dni), TSH/fT4/fT3, jonogram (Na, Ca), antropometria, ciśnienie tętnicze.' },
                        { label: 'Co 365 dni', text: 'OGTT z insulinemią, IGFBP-3, lipidogram, RTG wieku kostnego, morfologia z rozmazem, konsultacja psychologa; przy nadciśnieniu — dno oka + 24h Holter RR.' }
                      ]},
                      { heading: 'Wstrzymanie terapii (czasowe)' },
                      { items: [
                        'Pseudo-tumor cerebri.',
                        'Podejrzenie złuszczenia głowy kości udowej.',
                        'Podwyższone stężenie IGF-1 dla wieku i płci.'
                      ]},
                      { heading: 'Kryteria wyłączenia' },
                      { items: [
                        'Złuszczenie głowy kości udowej.',
                        'Pseudo-tumor cerebri.',
                        'Cukrzyca.',
                        'Ujawnienie lub wznowa choroby rozrostowej.',
                        'Brak zgody / brak współpracy świadczeniobiorcy.',
                        'Niezadowalający efekt: przyrost < 2 cm/rok.',
                        'Wiek kostny > 14 lat ♀ / > 16 lat ♂.',
                        'Znacznie nasilone zaburzenia proporcji budowy ciała.',
                        'Duże wrodzone wady rozwojowe upośledzające podstawowe funkcje życiowe.',
                        'Aberracje chromosomowe ze zwiększonym ryzykiem chorób rozrostowych.',
                        'Utrzymujące się podwyższone IGF-1 przez 3 mies. po wstrzymaniu terapii.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 5,
                title: 'B.38 — PNN — Przewlekła Niewydolność Nerek (ICD-10 N18)',
                sublabel: 'klirens kreatyniny < 75 ml/1,73 m²/min + niskorosłość',
                options: [
                  {
                    threshold: 'Kryteria',
                    action: 'Klirens kreatyniny < 75 ml/1,73 m²/min + wzrost < −1,88 SDS LUB HV SDS < −2,0 + opóźniony wiek kostny (BA < 12,5 lat ♂ / < 11,5 lat ♀ wg Greulich-Pyle) + wykluczenie innych przyczyn niskorosłości.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Kryteria włączenia' },
                      { items: [
                        { label: 'Niewydolność nerek', text: 'klirens kreatyniny < 75 ml/1,73 m²/min (Program B.38 mówi explicite o KLIRENSIE, nie eGFR — choć w praktyce eGFR Schwartza jest używany).' },
                        { label: 'Niskorosłość', text: 'wzrost < −1,88 SDS dla płci i wieku metrykalnego LUB tempo wzrastania SDS < −2,0.' },
                        { label: 'Wiek kostny opóźniony', text: 'BA < 12,5 lat ♂ / < 11,5 lat ♀ wg norm Greulich-Pyle.' },
                        { label: 'Wykluczenie innych przyczyn niskorosłości', text: 'aniżeli PNN.' },
                        { label: 'Warunki praktyczne (przed startem rhGH)', text: 'wyrównanie kwasicy metabolicznej (HCO3 > 22 mmol/L), gospodarki Ca-P (PTH, fosforany, wapń), niedokrwistości (Hb > 11 g/dL — erytropoetyna), niedożywienia (kalorie + białko).' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'Pomiar stężenia IGF-1.',
                        'Badania densytometryczne (DXA).',
                        'RTG stawów biodrowych (wykluczenie ZMSK — złuszczenia głowy kości udowej przed startem).',
                        'Pozostałe badania wg standardów diagnozowania świadczeniobiorców z PNN.'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Somatotropina', text: '0,33–0,37 mg (1,0–1,1 IU)/kg m.c./TYDZIEŃ, CODZIENNIE WIECZOREM s.c.' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Co 30 dni (w 3.–4. stadium PNN)', text: 'PTH intact, ALP, proteinogram, glukoza, kreatynina, mocznik, jonogram (Na+/K+/Ca++/Ca zjonizowany/P-), morfologia z rozmazem, gazometria.' },
                        { label: 'Co 90 dni (w 2. stadium PNN)', text: 'te same badania co w 3.–4. stadium co 30 dni; ponadto u dzieci z wadami układu moczowo-płciowego: urolog, USG jamy brzusznej, dietetyk.' },
                        { label: 'Po 90 dniach', text: 'IGF-1.' },
                        { label: 'Co 365 dni', text: 'triglicerydy, cholesterol, IGF-1, RTG wieku kostnego. W uzasadnionych przypadkach: densytometria, RTG stawów biodrowych, konsultacja okulistyczna/ortopedyczna; przy podejrzeniu ZMSK — ortopeda + RTG/USG/TK stawów biodrowych; u dzieci z wadami moczowymi — badanie ogólne i posiew moczu.' }
                      ]},
                      { heading: 'Kryteria wyłączenia' },
                      { items: [
                        'Inna niż PNN przyczyna niskorosłości.',
                        'Zaburzenia przemian węglowodanowych.',
                        'Choroba nowotworowa.',
                        'Niezadowalający efekt: przyrost < 3 cm/rok (NIE dotyczy ♀ z BA > 14 lat ani ♂ z BA > 16 lat).',
                        'Wiek kostny > 16 lat ♀ / > 18 lat ♂.'
                      ]},
                      { heading: 'Uwagi praktyczne' },
                      { items: [
                        'ZMSK (złuszczenie głowy kości udowej) — typowe powikłanie w PNN.',
                        'Kontrola progresji proteinurii i ciśnienia tętniczego.',
                        'Po transplantacji nerki — często samoistny catch-up growth → rozważenie odstawienia rhGH.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 6,
                title: 'B.20 — Pierwotny niedobór IGF-1 (ICD-10 E34.3) — JEDYNY program z rhIGF-1',
                sublabel: 'mecasermin (Increlex) — NIE somatotropina; zespół Larona i mutacje GHR/IGF1',
                options: [
                  {
                    threshold: 'Kryteria',
                    action: 'Skrajna niskorosłość < −3 SDS + IGF-1 < −2,5 SDS + PRAWIDŁOWE stężenie GH (test nocnego wyrzutu, ew. 2 testy stymulacji) + wykluczenie innych przyczyn niskorosłości + rozpoznanie potwierdzone TESTEM GENERACJI SOMATOMEDYN.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Specyfika programu' },
                      { items: [
                        'JEDYNY pediatryczny program stosujący rhIGF-1 (mecasermina, Increlex) — NIE somatotropinę. Wskazany w sytuacjach, w których oś GH jest sprawna (GH prawidłowy), ale brak jest wyrzutu IGF-1 (defekt receptora GH — zespół Larona, lub samego IGF-1).'
                      ]},
                      { heading: 'Kryteria włączenia' },
                      { items: [
                        { label: 'Skrajna niskorosłość', text: 'wzrost < −3 SDS dla płci i wieku, na siatkach centylowych dla populacji DZIECI POLSKICH (próg surowszy niż w innych programach, gdzie wystarcza < 3. centyl ≈ −2 SD).' },
                        { label: 'Niedobór IGF-1', text: 'stężenie IGF-1 < −2,5 SDS w odniesieniu do płci i wieku.' },
                        { label: 'Prawidłowe stężenie GH', text: 'test krótkiego nocnego wyrzutu (≥ 5 pomiarów), w uzasadnionych przypadkach poszerzony o 2 testy stymulacji sekrecji GH.' },
                        { label: 'Wykluczenie innych przyczyn niskorosłości', text: 'niedokrwistość, choroby wątroby, niedoczynność tarczycy, zaburzenia wchłaniania i trawienia jelitowego, obciążenia okresu okołoporodowego.' },
                        { label: 'Test generacji somatomedyn', text: 'POTWIERDZENIE rozpoznania — podanie egzogennego GH przez kilka dni: w prawidłowej osi powoduje wzrost IGF-1; brak wzrostu = pierwotny niedobór IGF-1.' },
                        { label: 'Badania molekularne (w przypadkach wątpliwych)', text: 'mutacje GHR (zespół Larona — defekt receptora GH); mutacje genu IGF1 lub promotora tego genu.' }
                      ]},
                      { heading: 'Badania przy kwalifikacji' },
                      { items: [
                        'IGF-1, IGFBP-3.',
                        'Glikemia, OGTT z insulinemią, HbA1c.',
                        'TSH, fT4.',
                        'Jonogram surowicy (co najmniej Na+).',
                        'Konsultacja laryngologiczna z audiogramem.',
                        'Konsultacja kardiologiczna z USG układu sercowo-naczyniowego.',
                        'Konsultacja okulistyczna (w zależności od potrzeb).',
                        'RTG śródręcza (wiek kostny).',
                        'Obrazowanie OUN (TK z kontrastem lub MRI).'
                      ]},
                      { heading: 'Dawkowanie' },
                      { items: [
                        { label: 'Mecasermina (rhIGF-1, Increlex)', text: '0,04–0,12 mg/kg masy ciała DWA RAZY NA DOBĘ s.c. UWAGA — inaczej niż przy rhGH, lek podawany 2× dziennie.' }
                      ]},
                      { heading: 'Monitorowanie' },
                      { items: [
                        { label: 'Po 30 dniach od startu', text: 'IGF-1, IGFBP-3, glikemia, OGTT z insulinemią LUB HbA1c.' },
                        { label: 'Co 90 dni', text: 'IGF-1, IGFBP-3, glikemia.' },
                        { label: 'Co 180 dni', text: 'TSH, fT4, jonogram (co najmniej Na+), HbA1c (lub co 365 dni OGTT z insulinemią).' },
                        { label: 'Co 365 dni', text: 'laryngolog + audiogram, kardiolog + USG, RTG wieku kostnego, MRI/TK OUN w razie potrzeby.' }
                      ]},
                      { heading: 'Kryteria wyłączenia / czasowego przerwania' },
                      { items: [
                        'Nawracające, zagrażające życiu stany hipoglikemii (mecasermina obniża glikemię).',
                        'Złuszczenie głowy kości udowej.',
                        'Pseudo-tumor cerebri.',
                        'Ujawnienie lub wznowa choroby rozrostowej.',
                        'Brak zgody pacjenta na kontynuację leczenia.',
                        'Niezadowalający efekt: przyrost wzrostu < 3 cm/rok.',
                        'Wiek kostny > 14 lat ♀ / > 16 lat ♂.'
                      ]}
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'list-search',
            collapsible: true,
            title: 'Wspólne zasady dla wszystkich 6 programów (B.19/B.20/B.38/B.41/B.42/B.64)',
            body: 'KWALIFIKACJA CENTRALNA — wszystkie 6 programów obsługuje Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu powoływany przez Prezesa NFZ (siedziba IPCZD Warszawa). Lekarz prowadzący wnioskuje do Zespołu o decyzję kwalifikacyjną; w stanach zagrożenia życia (nawracająca hipoglikemia u noworodka — B.19) kwalifikacja niezwłocznie. REJESTR SMPT: lekarz prowadzący uzupełnia dane co 3–6 miesięcy w elektronicznym systemie monitorowania programów lekowych dostępnym przez OW NFZ. STANDARDOWE PARAMETRY MONITOROWANIA (wszystkie 6 programów): pomiary auksologiczne z określeniem centyla i SDS, masa ciała, tempo wzrastania (cm/rok), BMI, dojrzałość Tannera, IGF-1 + IGFBP-3 z proporcją (norma laboratorium), bezpieczeństwo metaboliczne (glikemia/HbA1c), pomiar GH po zakończeniu terapii (insulina lub inny — przekazanie do programu dorosłych B.111 przy GH < 3 ng/mL). Aktualizacja: numeracja programów (B.x) i kryteria mogą się zmieniać przy kolejnych Obwieszczeniach Ministra Zdrowia (co ~2 miesiące) — w aplikacji rekomendowane jest sprawdzenie aktualnego Wykazu Leków Refundowanych na gov.pl. Od 10.2024 r. w programie B.19 (SNP) dostępna jest forma długodziałająca rhGH (SOMATROGON — 1× w tygodniu, dla dzieci ≥ 3 r.ż., dawka 0,66 mg/kg).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Podstawowe badania diagnostyczne wspólne dla 6 programów',
            items: [
              { label: 'Siatki centylowe (OLAF/Palczewska, WHO 0–5 r.ż.)', text: 'kluczowe — wszystkie progi wzrostu i HV są podawane w SDS wg siatek polskich, NIE międzynarodowych. W B.20 surowszy próg < −3 SDS.' },
              { label: 'RTG ocena wieku kostnego', text: 'opóźniony BA jest warunkiem kwalifikacji w B.19/B.42/B.64/B.38; zaawansowany BA jest kryterium wyłączenia (> 14 ♀ / > 16 ♂ w B.19/B.42/B.64, > 16 ♀ / > 18 ♂ w B.38).' },
              { label: 'IGF-1 + IGFBP-3 z określeniem proporcji', text: 'obowiązkowe we wszystkich 6 programach (z normą laboratorium). W trakcie leczenia rhGH utrzymywać IGF-1 ≤ +2 SDS (bezpieczeństwo onkologiczne). W B.20 IGF-1 musi być < −2,5 SDS przy PRAWIDŁOWYM GH.' },
              { label: 'TSH + fT4', text: 'wykluczenie niedoczynności tarczycy (szczególnie w ZT — autoimmunologiczna jest częsta).' },
              { label: 'Glikemia + HbA1c + OGTT z insulinemią', text: 'rhGH zwiększa insulinooporność — monitorowanie w trakcie leczenia. W B.41 (PWS) wymagane wyrównanie przed kwalifikacją. Cukrzyca = kryterium wyłączenia w B.41/B.42/B.64.' },
              { label: 'Kariotyp', text: 'obowiązkowy w B.42 (potwierdzenie ZT — 45,X lub mozaicyzm); wskazany u dziewczynek z niewyjaśnioną niskorosłością.' },
              { label: 'MRI/TK okolicy podwzgórzowo-przysadkowej', text: 'obowiązkowe w B.19 (SNP — wykluczenie zmian organicznych: czaszkogardlak, hipoplazja, zespół przerwania szypuły), B.64 (SGA — wykluczenie przeciwwskazań do rhGH), B.20 (pierwotny niedobór IGF-1).' },
              { label: 'Test metylacji SNRPN', text: 'rozpoznanie PWS w B.41 (delecja 15q11 / mUPD15 / defekt imprintingu).' },
              { label: 'Klirens kreatyniny / eGFR Schwartz', text: 'rozpoznanie PNN; w B.38 wymagany klirens < 75 ml/1,73 m²/min.' },
              { label: 'Test generacji somatomedyn', text: 'POTWIERDZENIE pierwotnego niedoboru IGF-1 w B.20 (podanie egzogennego GH — brak wzrostu IGF-1 = defekt poniżej receptora GH).' },
              { label: 'Test stymulacji GH (2 niezależne)', text: 'obowiązkowy w B.19 (szczyt GH < 10 ng/mL — przy WNP lub udokumentowanej mutacji wystarczy 1 test) oraz B.64 (szczyt GH ≥ 10 ng/mL — wykluczenie współistniejącego GHD). Test insulinowy — DOPIERO po 5. r.ż.; pozostałe testy — po 2. r.ż.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Markery osi GH (skrining)',
          tests: [
            { id: 'igf1',
              note: 'U dziecka z niskorosłością — pomocnicze, ale PRAWIDŁOWY IGF-1 NIE WYKLUCZA GHD. W SGA i CKD często prawidłowy. W ZT zwykle prawidłowy. W trakcie leczenia rhGH cel: IGF-1 w normie dla wieku/Tannera, NIE > +2 SDS (bezpieczeństwo onkologiczne).' },
            { id: 'igfbp3', note: 'Pomocniczy marker uzupełniający IGF-1. Normy wg wieku i Tannera.' }
          ]
        },
        { name: 'Testy stymulacji GH (kwalifikacja SNP — wymagane DWA z różnym mechanizmem)',
          tests: [
            { ext: 'itt', label: 'Test z insuliną (test hipoglikemii poinsulinowej)',
              note: 'Złoty standard. Hipoglikemia bezwzględna po insulinie 0,1 IU/kg i.v. (0,05 IU/kg przy podejrzeniu ciężkiego GHD lub u dzieci < 5 r.ż.). Glikemia < 40 mg% (< 2,2 mmol/L) lub spadek ≥ 50% od wyjściowej. PUNKTY POMIARU GH: -30, 0 min (baseline przed insuliną); 30, 45, 60, 90, 120 min (po insulinie). Próg PL: szczyt GH < 10 ng/mL = SNP. PRZECIWWSKAZANIA: nieleczona niedoczynność tarczycy, choroba sercowo-naczyniowa, drgawki/OUN, ostry stan chorobowy; NIE rekomendowany u dzieci < 5 r.ż.',
              description: 'Test z insuliną (insulin tolerance test, ITT) u dziecka — historycznie pierwszy i obecnie ZŁOTY STANDARD diagnostyki SNP. MECHANIZM: dożylna insulina wywołuje hipoglikemię, która przez ośrodkowe mechanizmy stresowe stymuluje wydzielanie GH (wzrost GHRH + spadek somatostatyny + wzrost katecholamin). Równolegle ocenia oś ACTH-nadnercza (kortyzol). WARUNKI: rano, na czczo (≥ 8 h u dzieci > 4 lat, ≥ 4 h u młodszych), stały nadzór, glikemia przyłóżkowa, kaniulizacja żyły obwodowej, glukoza 10–20% + glukagon + hydrokortyzon gotowe do podania, masa ciała sprawdzona, posiłek po teście. METODA: (1) PRZED podaniem insuliny — dwukrotne pobranie wyjściowe glukozy + kortyzolu + GH w punktach -30 min i 0 min (baseline > 3,0 mmol/L); (2) insulina krótko działająca 0,1 IU/kg i.v. (np. Actrapid HM Novo Nordisk) — 0,05 IU/kg przy podejrzeniu ciężkiego GHD lub u dzieci < 5 r.ż.; (3) glikemia w 15, 30, 45, 60, 90, 120 min (najniższa zwykle ~20 min); (4) GH + kortyzol w punktach 30, 45, 60, 90, 120 min (po insulinie). PEŁNA SERIA POMIARU GH: -30, 0, 30, 45, 60, 90, 120 min (7 punktów). Interpretacja (Polska, GH Research Society 2000): szczyt GH < 10 ng/mL = SNP w dwóch testach; < 5 ng/mL = ciężki GHD. PRZEDŁUŻAJĄCA SIĘ HIPOGLIKEMIA < 40 mg% lub objawy kliniczne — natychmiast 10–20% glukoza i.v. (2 ml/kg 10% glukozy) + hydrokortyzon 100 mg i.v. (zwłaszcza przy podejrzeniu niedoczynności przysadki). PRZECIWWSKAZANIA bezwzględne: nieleczona niedoczynność tarczycy, choroba sercowo-naczyniowa, drgawki/OUN, hipoglikemia, ostry stan; NIE rekomendowany u dzieci < 5 r.ż. — w tej grupie preferowany glukagon.' },
            { ext: 'glucagon_test', label: 'Test z glukagonem',
              note: 'Rekomendowany u małych dzieci < 5 r.ż. (alternatywa ITT u niemowląt). Glukagon 0,03 mg/kg s.c./i.m. (max 1 mg; 1,5 mg gdy masa > 90 kg). Pomiar GH w 0, 60, 90, 120, 150, 180 min. Mechanizm: hiperglikemizujące działanie → wyrzut insuliny → następcza hipoglikemia → wyrzut GH (łagodniejszy niż ITT). PRZECIWWSKAZANIE: cukrzyca.',
              description: 'Test z glukagonem — szeroko dostępny i postrzegany jako bezpieczny, drugi po ITT najczęściej stosowany test stymulacji GH u dzieci. MECHANIZM: glukagon NIE stymuluje wprost przysadki — działa POŚREDNIO przez podanie domięśniowe lub podskórne (NIE dożylne): hiperglikemizujące działanie → wyrzut endogennej insuliny → następcza hipoglikemia → wyrzut GH (łagodniejszy niż w ITT, bo bufory regulacyjne nie dopuszczają do skrajnej hipoglikemii). Z tego powodu efekt GH pojawia się PÓŹNIEJ niż w ITT. WSKAZANIA: ocena rezerwy GH i ACTH; zwłaszcza REKOMENDOWANY U MAŁYCH DZIECI < 5 r.ż. (w tym niemowląt) — gdy ITT jest przeciwwskazany. WARUNKI: takie same jak ITT (rano, na czczo, monitorowanie glikemii). METODA: (1) próbka 0: glukoza + GH + kortyzol; (2) glukagon 0,03 mg/kg s.c./i.m. (max 1 mg; 1,5 mg gdy masa > 90 kg) — preferowane i.m.; (3) pomiar GH w 60, 90, 120, 150, 180 min (niektórzy do 240 min). Polski preparat: GlucaGen Hypokit 1 mg (Novo Nordisk). PRZECIWWSKAZANIE: cukrzyca (niepewne warunki stymulacji — endogenny wyrzut insuliny zaburzony). Próg interpretacji: szczyt GH < 10 ng/mL = SNP. SKUTKI UBOCZNE: nudności, opóźniona hipoglikemia po 4–5 h (pacjent MUSI zjeść po teście).' },
            { ext: 'clonidine_test', label: 'Test z klonidyną',
              note: 'Test skriningowy u dzieci. Klonidyna 0,15 mg/m² p.o. (alternatywnie 0,05 lub 0,10 mg/m²). Mechanizm: pobudzenie receptorów α2-adrenergicznych → wzrost GHRH. Test 120 min, krew co 30 min. Szczyt GH w 30–60 min. Dokładność (Ranke): ~80% przy cut-off 10 ng/mL. PRZECIWWSKAZANIA: zaburzenia rytmu serca, blok II/III°, hipotensja, zespół Raynauda, niewydolność wątroby/nerek.',
              description: 'Test z klonidyną — szeroko stosowany u dzieci, zwykle jako test skriningowy lub jeden z dwóch wymaganych do potwierdzenia SNP. MECHANIZM: klonidyna (agonista α2-adrenergiczny) stymuluje wydzielanie GH przez pobudzenie presynaptycznego receptora α2 → wzrost GHRH. Dawka jest wprost proporcjonalna do wyrzutu GH. DAWKA: najczęściej 0,15 mg/m² powierzchni ciała p.o.; w niektórych ośrodkach 0,05 lub 0,10 mg/m². POLSKIE PREPARATY: Iporel (Jelfa) 0,075 mg; Haemiton (Asta Medica) 0,075/0,15/0,3 mg; Catapresan (Boehringer) 0,075 mg. METODA: pacjent na czczo, pomiar ciśnienia tętniczego PRZED testem (konieczne), klonidyna p.o.; pomiar GH w 0, 30, 60, 90, 120 min (niektórzy ośrodki do 150–180 min). Szczyt GH zwykle w 30–60 min. PRZECIWWSKAZANIA: zaburzenia rytmu serca (zespół chorego węzła zatokowego, blok II/III°), umiarkowana bradyarytmia, hipotensja, zespół Raynauda, niewydolność wątroby/nerek, zaburzenia krążenia mózgowego. SKUTKI UBOCZNE: senność, osłabienie, OBNIŻENIE CIŚNIENIA TĘTNICZEGO — kontrola RR co 30 min w trakcie testu + przez godzinę po nim. Długotrwała senność może spowodować hipoglikemię → posiłek po teście. Interpretacja: Ranke ~80% dokładność przy cut-off GH 10 ng/mL; średni szczyt GH u zdrowych dzieci 23–37 ng/mL; Obara dokładność 72%, czułość 50%, swoistość 86,7%.' },
            { ext: 'arginine_test', label: 'Test z argininą',
              note: 'Stymulacja GH u dzieci wlewem dożylnym argininy. Dawka 0,5 g/kg (max 30 g) jako 10% chlorowodorek argininy w 30-min wlewie i.v. w 0,9% NaCl. Test 150 min, krew co 30 min (-30, 0, 30, 60, 90, 120 min). Mechanizm: zahamowanie somatostatyny + stymulacja GHRH. Szczyt GH w 30–60 min. Dokładność (Ranke): 75–86%. UWAGA: późna hipoglikemia (arginina stymuluje insulinę).',
              description: 'Test z argininą — L-arginina jest aminokwasem stosowanym jako bodziec do wydzielania GH od lat 60. XX wieku. MECHANIZM: arginina powoduje wyrzut GH przez (1) zahamowanie wydzielania somatostatyny i (2) prawdopodobnie stymulację wydzielania GHRH przez pobudzenie receptorów α-adrenergicznych. DAWKA: 0,5 g/kg m.c., maksymalnie 30 g. W postaci 10% chlorowodorku argininy (np. L-Arginin-hydrochlorid 21% Braun, amp. 20 ml) podaje się w 30-MINUTOWYM WLEWIE DOŻYLNYM w roztworze 0,9% NaCl. METODA: test trwa łącznie 150 minut. Krew na GH pobiera się w odstępach półgodzinnych — pierwsze pobranie -30 min (PRZED wlewem), następne 0 min (po zakończeniu wlewu), 30, 60, 90, 120 min. U dzieci z podejrzeniem wielohormonalnej niedoczynności przysadki dodatkowo glikemia. Szczyt GH zwykle w 30–60 min. PRZECIWWSKAZANIA: ciężkie choroby wątroby, niewydolność nerek, kwasica metaboliczna i oddechowa. SKUTKI UBOCZNE: rzadkie — nudności, wymioty, zaczerwienienie skóry w miejscu wlewu, bóle głowy. ISTOTNE: PÓŹNA HIPOGLIKEMIA (arginina stymuluje wyrzut insuliny) — może ujawnić się po zakończeniu badania, dlatego pacjent musi zjeść po teście. Interpretacja: Ranke 75% (cut-off GH 10 ng/mL) — 86% (cut-off 3 ng/mL) dokładność predykcji SNP. Zadik — średni szczyt GH u zdrowych dzieci 13,1 ± 6,1 ng/mL.' },
            { ext: 'ldopa_test', label: 'Test z L-DOPA',
              note: 'L-DOPA (lewodopa) 300 mg/m² p.o. lub wg masy: < 15 kg → 125 mg; 15–35 kg → 250 mg; > 35 kg → 500 mg. Test 2 h, szczyt GH w 60–120 min. Mechanizm: stymulacja receptorów α-adrenergicznych i dopaminergicznych → wzrost GHRH. Dokładność (Ranke): 56–81%. Uwaga: nudności u ~1/3 pacjentów (z tego powodu w IPCZD obecnie nie stosowany). Czasem łączony z propranololem (β-bloker).',
              description: 'Test z L-DOPA (lewodopa, 3-hydroksy-L-tyrozyna) — naturalny aminokwas, prekursor dopaminy, najczęściej stosowany jako lek w chorobie Parkinsona. Mechanizm: L-DOPA stymuluje wyrzut GH poprzez pobudzenie GHRH za pośrednictwem receptorów α-adrenergicznych i dopaminergicznych. Uwaga: L-DOPA jednocześnie hamuje sekrecję GH przez pobudzenie receptorów β-adrenergicznych — niekiedy stosowana w testach łącznie z β-blokerem (propranolol) w celu pełniejszej oceny rezerwy GH. Dawka: 300 mg/m² p.o. lub w zależności od masy ciała: < 15 kg → 125 mg; 15–35 kg → 250 mg; > 35 kg → 500 mg (np. preparat Larodopa, tabletki 500 mg). Metoda: test trwa 2 godziny, krew co 30 min (0, 30, 60, 90, 120 min; niektóre ośrodki do 150–180 min). Szczyt GH zwykle w 60–120 min. Przeciwwskazania: zaburzenia psychiczne; ostrożność w jaskrze, niewydolności wątroby/nerek, zmianach skórnych typu czerniaka. Skutki uboczne: u ~1/3 pacjentów — najczęściej nudności, rzadziej wymioty, zawroty i bóle głowy, zmęczenie. Z tego powodu w IPCZD (Instytut „Pomnik — Centrum Zdrowia Dziecka") test z L-DOPA obecnie nie jest stosowany — wybierane są inne testy o lepszej tolerancji. Interpretacja: dokładność wg Ranke 56% (cut-off GH 7 ng/mL) — 81% (cut-off 6 ng/mL). Średni szczyt GH u zdrowych dzieci 11–21 ng/mL. Obara: dokładność 75%, czułość 77,8%, swoistość 72,7%.' }
          ]
        },
        { name: 'Diagnostyka genetyczna / specyficzna dla wskazania',
          tests: [
            EXT.karyotype, // SNP-ZT, SGA, niska bez ustalonej przyczyny
            EXT.pituitary_mri // SNP po potwierdzeniu
          ]
        },
        { name: 'Ocena pozostałych osi (wspólne)',
          tests: [
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'cortisol' },
            { id: 'prolactin' }
          ]
        },
        { name: 'Bezpieczeństwo metaboliczne w trakcie leczenia',
          tests: [
            { id: 'vit_d_25oh' },
            EXT.hba1c, EXT.lipid_panel
          ]
        }
      ],
      guideline: 'Polskie Programy Lekowe NFZ — 6 wskazań: B.19 (SNP, wersja z 10.2024), B.42 (ZT), B.41 (PWS), B.64 (SGA/IUGR), B.38 (PNN), B.20 (pierwotny niedobór IGF-1 — mecasermin). Aktualne Obwieszczenie Ministra Zdrowia. Kwalifikacja: Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu (IPCZD).',
      sources: [
        'Załącznik B.19 do Obwieszczenia Ministra Zdrowia — LECZENIE NISKOROSŁYCH DZIECI Z SOMATOTROPINOWĄ NIEDOCZYNNOŚCIĄ PRZYSADKI (ICD-10 E23). Wersja od 10.2024 (uwzględnia Somatrogon). URL: https://www.gov.pl/web/zdrowie/programy-lekowe',
        'Załącznik B.20 do Obwieszczenia Ministra Zdrowia — LECZENIE NISKOROSŁYCH DZIECI Z CIĘŻKIM PIERWOTNYM NIEDOBOREM IGF-1 (ICD-10 E34.3). Lek: mecasermina (rhIGF-1, Increlex).',
        'Załącznik B.38 do Obwieszczenia Ministra Zdrowia — LECZENIE NISKOROSŁYCH DZIECI Z PRZEWLEKŁĄ NIEWYDOLNOŚCIĄ NEREK (PNN) (ICD-10 N18).',
        'Załącznik B.41 do Obwieszczenia Ministra Zdrowia — LECZENIE ZESPOŁU PRADERA-WILLI (ICD-10 Q87.1).',
        'Załącznik B.42 do Obwieszczenia Ministra Zdrowia — LECZENIE NISKOROSŁYCH DZIECI Z ZESPOŁEM TURNERA (ZT) (ICD-10 Q96).',
        'Załącznik B.64 do Obwieszczenia Ministra Zdrowia — LECZENIE HORMONEM WZROSTU NISKOROSŁYCH DZIECI URODZONYCH JAKO zbyt MAŁE W PORÓWNANIU DO CZASU TRWANIA CIĄŻY (SGA lub IUGR) (ICD-10 R62.9).',
        'Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu powoływany przez Prezesa NFZ — siedziba IPCZD Warszawa. URL: https://www.nfz.gov.pl/dla-swiadczeniodawcy/zespoly-koordynacyjne/',
        'Lewiński A, Smyczyńska J, Stawerska R i wsp. Ogólnopolski Program Leczenia Ciężkiego Niedoboru Hormonu Wzrostu u Osób Dorosłych oraz u Młodzieży po Zakończeniu Terapii Promującej Wzrastanie. Endokrynologia Polska. 2018;69(5):497-524.',
        'Stawerska R, Hilczer M, Smyczyńska J, Lewiński A. Polski Program Leczenia rhGH u dzieci z somatotropinową niedoczynnością przysadki — kryteria kwalifikacji. Pediatr Endocrinol Diabetes Metab. 2014–2019 (kolejne aktualizacje).',
        'Międzynarodowe wytyczne: GH Research Society (GRS) — Consensus Guidelines for Diagnosis and Treatment of Growth Hormone Deficiency in Childhood and Adolescence.',
        'Aktualne Obwieszczenie Ministra Zdrowia w sprawie wykazu refundowanych leków (publikowane co ~2 miesiące) — bieżący stan kryteriów: gov.pl.'
      ]
    },

    short_stature: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja niskorosłości',
            body: 'Niskorosłość u dziecka — wzrost < 3. centyla (≈ −1,88 SDS) lub < −2 SDS dla wieku i płci na polskich siatkach centylowych (WHO 0–5 r.ż.; OLAF/Palczewska 5–19 r.ż.). Sam niski wzrost przy prawidłowej prędkości wzrastania i zgodności z wzrostem docelowym to najczęściej wariant rodzinny — wymaga rozpoznania, ale nie wymaga leczenia. Gdy dziecko spełnia kryteria któregoś z polskich Programów Lekowych NFZ (SNP, ZT, PWS, SGA/IUGR, PNN, pierwotny niedobór IGF-1) — zob. panel „Niedobór hormonu wzrostu (dzieci — programy lekowe)".'
          },
          {
            kind: 'list',
            icon: 'alert-triangle',
            title: 'Objawy alarmowe — wskazania do pogłębionej diagnostyki',
            items: [
              { label: 'Spowolniona prędkość wzrastania', text: 'HV < −1 SDS lub < 25. centyla utrzymująca się ≥ 6 miesięcy.' },
              { label: 'Wzrost znacząco poniżej wzrostu docelowego', text: 'różnica > 1,5 SD od wzrostu docelowego (target height) rodziców.' },
              { label: 'Brak catch-up growth u dziecka SGA/IUGR', text: 'wzrost < 3. centyla po 4. r.ż.' },
              { label: 'Nieproporcjonalna budowa ciała', text: 'zaburzony stosunek górnej i dolnej części ciała — krótkie kończyny lub krótki tułów (szczegóły w sekcji "Proporcjonalna vs nieproporcjonalna niskorosłość" niżej).' }
            ]
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: 'Algorytm diagnostyczny niskorosłości u dziecka',
            steps: [
              {
                number: 1,
                title: 'Ocena auksometryczna i wzrost docelowy',
                sublabel: 'pierwsza wizyta + obserwacja ≥ 6 miesięcy',
                options: [
                  {
                    threshold: 'Zakres badań i pomiarów',
                    action: 'Pomiar wzrostu/długości i masy ciała stadiometrem; naniesienie na siatkę polską (OLAF/Palczewska, WHO 0–5 r.ż.); wzrost obojga rodziców → wyliczenie wzrostu docelowego; ocena proporcjonalności (wzrost siedzeniowy); RTG wieku kostnego; obserwacja prędkości wzrastania przez ≥ 6 mies.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Pomiary auksometryczne' },
                      { items: [
                        'Pomiar wzrostu STADIOMETREM (precyzja ±0,1 cm), dziecko boso, plecy oparte o stadiometr, głowa w pozycji frankfurckiej.',
                        'U dzieci < 2 r.ż. — DŁUGOŚĆ ciała (pozycja leżąca, infantometr), nie wzrost.',
                        'Pomiar masy ciała precyzyjny (do 0,1 kg); BMI = waga (kg) / wzrost² (m²).'
                      ]},
                      { heading: 'Siatki centylowe — polskie' },
                      { items: [
                        { label: 'WHO 0–5 r.ż.', text: 'standardy WHO dla niemowląt i małych dzieci.' },
                        { label: 'OLAF (5–19 r.ż.)', text: 'aktualna polska siatka dla dzieci szkolnych (Kułaga, Litwin i wsp.).' },
                        { label: 'Palczewska (klasyczna)', text: 'starsza polska siatka warszawska, wciąż używana.' },
                        { label: 'Fenton/INTERGROWTH-21', text: 'dla noworodków wg wieku ciążowego — wymagane przy diagnostyce SGA/IUGR.' }
                      ]},
                      { heading: 'Wzór wzrostu docelowego (Tanner-Davies)' },
                      { items: [
                        { label: 'Chłopiec', text: '(wzrost matki + wzrost ojca + 13) / 2  ± 8,5 cm (granica ±2 SD od genetycznego potencjału).' },
                        { label: 'Dziewczynka', text: '(wzrost matki + wzrost ojca − 13) / 2  ± 8,5 cm.' },
                        'Wzrost dziecka poza granicami ±2 SD od wzrostu docelowego = niespójność z potencjałem genetycznym → szukaj patologii.'
                      ]},
                      { heading: 'Prędkość wzrastania (height velocity, HV)' },
                      { items: [
                        '≥ 6-miesięczny okres obserwacji — minimum 2 pomiary wzrostu w odstępie ≥ 6 mies.',
                        'HV = przyrost wzrostu (cm) / czas (rok); porównanie z siatkami HV dla wieku.',
                        'HV < −1 SDS (≈ < 25. centyla) ≥ 6 mies. → ALARM, kieruj do endokrynologa.'
                      ]},
                      { heading: 'Ocena proporcjonalności — jak policzyć' },
                      { items: [
                        { label: 'Krok 1 — pomiar wzrostu siedzeniowego (SH, sitting height)', text: 'dziecko siada na specjalnej desce/podwyższeniu o znanej wysokości; mierzysz od czubka głowy (pozycja frankfurcka) do siedzenia. Wynik SH w cm.' },
                        { label: 'Krok 2 — pomiar wzrostu całkowitego (TH, total height)', text: 'standardowy pomiar stadiometrem (na stojąco, boso). Wynik TH w cm.' },
                        { label: 'Krok 3 — długość kończyn dolnych (LL, leg length)', text: 'LL = TH − SH (proste odejmowanie). Wynik LL w cm.' },
                        { label: 'Krok 4 — stosunek górna/dolna część ciała (U/L ratio)', text: 'U/L = SH / LL. Porównaj z normami dla wieku: noworodek ≈ 1,7; 3 r.ż. ≈ 1,3; nastolatek/dorosły ≈ 1,0.' },
                        { label: 'Interpretacja', text: 'U/L > +2 SD dla wieku → krótkie kończyny (achondroplazja, hipochondroplazja, SHOX); U/L < −2 SD → krótki tułów (dysplazja spondyloepifizalna).' },
                        'Proporcjonalna niskorosłość (U/L w normie) → szukaj endokrynologii / chorób przewlekłych / zespołów.',
                        'NIEPROPORCJONALNA niskorosłość → podejrzenie dysplazji kostnych (achondroplazja, hipochondroplazja, SHOX, SED) — konsultacja genetyka + ortopedy.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'Kryteria skierowania do endokrynologa pediatry',
                sublabel: 'kiedy NIE warto czekać i zlecić rozszerzoną diagnostykę',
                options: [
                  {
                    threshold: 'Wskazania do skierowania',
                    action: 'Wzrost < 3. centyla LUB HV < −1 SDS przez ≥ 6 mies. LUB wzrost znacząco poniżej wzrostu docelowego LUB nieproporcjonalna budowa LUB cechy fenotypowe zespołu LUB znacząca zmiana centyla w czasie LUB opóźnienie wieku kostnego > 2 lata.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Kryteria bezwzględne skierowania' },
                      { items: [
                        'Wzrost < 3. centyla (≈ < −1,88 SDS) wg siatek polskich.',
                        'Prędkość wzrastania (HV) < −1 SDS lub < 25. centyla utrzymująca się ≥ 6 miesięcy.',
                        'Wzrost dziecka poza granicami ±2 SD od wzrostu docelowego rodziców.',
                        'Nieproporcjonalna budowa ciała (różnica górnej i dolnej części ciała > +2 SD).',
                        'Stygmaty zespołowe — dysmorfia, wady wrodzone, opóźnienie psychoruchowe.',
                        'Znacząca zmiana centyla w czasie — spadek o ≥ 1 SD względem wcześniejszych pomiarów.',
                        'Wiek kostny opóźniony o > 2 lata względem wieku metrykalnego.',
                        'Brak catch-up growth u dziecka SGA/IUGR do 4. r.ż.'
                      ]},
                      { heading: 'Postępowanie pierwszego rzutu (POZ)' },
                      { items: [
                        'Wykluczenie oczywistych przyczyn: niedożywienie (wywiad + BMI), choroby przewlekłe (wywiad), niedoczynność tarczycy (TSH/fT4), celiakia (anty-tTG IgA + IgA całkowite).',
                        'Auksometria (wzrost, masa, BMI, proporcjonalność) + naniesienie na siatkę polską.',
                        'Wyliczenie wzrostu docelowego i porównanie z aktualnym wzrostem.',
                        'Zlecenie panelu podstawowego (zob. krok 3).',
                        'Skierowanie do endokrynologa po spełnieniu KTÓREGOKOLWIEK z kryteriów bezwzględnych.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'Panel podstawowy diagnostyki',
                sublabel: 'pierwszy rzut — POZ lub endokrynolog',
                options: [
                  {
                    threshold: 'Zakres badań',
                    action: 'Hormonalny (IGF-1, IGFBP-3, TSH, fT4, kortyzol) + auksologiczny (RTG wieku kostnego) + metaboliczny/ogólny (morfologia, ferrytyna, biochemia, eGFR, ALP, CRP, 25-OH-D) + celiakia (anty-tTG IgA + IgA całkowite).',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Skrining osi wzrostu' },
                      { items: [
                        { label: 'IGF-1 + IGFBP-3', text: 'wartości referencyjne wg wieku i Tannera; obniżony IGF-1 sugeruje GHD lub niedożywienie/choroby wątroby/niedoczynność tarczycy; prawidłowy IGF-1 nie wyklucza GHD u dziecka.' },
                        { label: 'RTG ocena wieku kostnego', text: 'RTG dłoni ręki niedominującej; opóźniony BA → GHD/CDGP/choroba przewlekła; prawidłowy BA → wariant rodzinny; znacznie opóźniony BA + opóźnione dojrzewanie → CDGP.' }
                      ]},
                      { heading: 'Wykluczenie endokrynologicznych przyczyn' },
                      { items: [
                        { label: 'TSH + fT4', text: 'wykluczenie niedoczynności tarczycy (Hashimoto, wrodzona, jodowa).' },
                        { label: 'Kortyzol poranny', text: 'wykluczenie hiperkortyzolemii / zespołu Cushinga.' }
                      ]},
                      { heading: 'Wykluczenie chorób przewlekłych' },
                      { items: [
                        { label: 'Morfologia z rozmazem', text: 'anemia, leukopenia, niedokrwistość chorób przewlekłych.' },
                        { label: 'Ferrytyna + żelazo + TIBC', text: 'niedobór żelaza — częsta odwracalna przyczyna spowolnionego wzrastania.' },
                        { label: 'Biochemia (Na, K, kreatynina, glukoza)', text: 'wykluczenie zaburzeń elektrolitowych i cukrzycy.' },
                        { label: 'eGFR Schwartz', text: 'wykluczenie CKD (program B.38).' },
                        { label: 'ALP (fosfataza alkaliczna)', text: 'znacznie podwyższona w krzywicy (niedobór wit. D, krzywica hipofosfatemiczna); obniżona w hipofosfatazji.' },
                        { label: 'CRP', text: 'stan zapalny (NChZJ, infekcja).' },
                        { label: '25-OH-D', text: 'częsty niedobór; krzywica z hipokalcemią upośledza wzrastanie.' }
                      ]},
                      { heading: 'Wykluczenie celiakii' },
                      { items: [
                        { label: 'Anty-tTG IgA', text: 'podstawowy marker (czułość ≥ 95%).' },
                        { label: 'IgA całkowite', text: 'konieczne łącznie z anty-tTG — niedobór IgA (~2% populacji) dałby fałszywie ujemny wynik; przy niedoborze IgA → anty-tTG IgG lub anty-DGP IgG.' },
                        'Celiakia potrafi się objawiać IZOLOWANYM niedoborem wzrostu — bez biegunki czy bólu brzucha.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 4,
                title: 'Diagnostyka pogłębiona — wg wskazań z kroku 3',
                sublabel: 'specjalistyczna w ośrodku endokrynologicznym',
                options: [
                  {
                    threshold: 'Podejrzenie GHD',
                    action: '2 niezależne testy stymulacji GH (glukagon, klonidyna, arginina, L-DOPA; insulina po 5. r.ż.) + MRI/TK okolicy podwzgórzowo-przysadkowej + ocena pozostałych osi.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Testy stymulacji GH' },
                      { items: [
                        'DWA niezależne testy stymulacji z różnym mechanizmem.',
                        'Szczyt GH < 10 ng/mL w 2 testach = SNP (program B.19).',
                        'Przy WNP lub udokumentowanej mutacji związanej z GHD — wystarczy 1 test.',
                        'Test insulinowy DOPIERO po 5. r.ż.; pozostałe testy DOPIERO po 2. r.ż.',
                        'Szczegółowe protokoły — zob. panel „Niedobór hormonu wzrostu (dzieci)".'
                      ]},
                      { heading: 'Obrazowanie i ocena pozostałych osi' },
                      { items: [
                        'MRI lub TK z kontrastem okolicy podwzgórzowo-przysadkowej — wykluczenie zmian organicznych (czaszkogardlak, hipoplazja przysadki, zespół przerwania szypuły, ektopia tylnego płata).',
                        'Ocena pozostałych osi: kortyzol, ACTH, prolaktyna, LH/FSH, testosteron/estradiol.',
                        'Test stymulacji gonadotropin (LHRH) — w uzasadnionych przypadkach.'
                      ]}
                    ]
                  },
                  {
                    threshold: 'Podejrzenie zespołu genetycznego',
                    action: 'Kariotyp + ukierunkowane badania molekularne (SHOX, dysplazje kostne, SNRPN dla PWS, test molekularny SRS).',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Diagnostyka genetyczna' },
                      { items: [
                        'KARIOTYP u KAŻDEJ dziewczynki z niewyjaśnioną niskorosłością — wykrycie zespołu Turnera (45,X lub mozaicyzm).',
                        'FISH dla regionów chromosomu Y — przy mozaicyzmie 45,X/46,XY.',
                        'Mutacje SHOX (aCGH lub sekwencjonowanie) — niskorosłość mezomeliczna, deformacja Madelunga.',
                        'Test metylacji SNRPN — przy klinicznym podejrzeniu PWS (hipotonia niemowlęca, hiperfagia, otyłość).',
                        'Panel dysplazji kostnych (FGFR3 dla achondroplazji/hipochondroplazji, COL2A1 dla SED) — przy NIEPROPORCJONALNEJ niskorosłości.',
                        'Test molekularny dla zespołu Silvera-Russella (SRS) — IUGR + asymetria ciała + trójkątna twarz.'
                      ]}
                    ]
                  },
                  {
                    threshold: 'Podejrzenie celiakii / NChZJ / przewlekłej choroby',
                    action: 'Konsultacja gastroenterologa, kalprotektyna w kale, gastroskopia z biopsją (potwierdzenie celiakii — atrofia kosmków wg Marsh), kolonoskopia (NChZJ).',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Diagnostyka gastrologiczna' },
                      { items: [
                        'Kalprotektyna w kale — marker stanu zapalnego jelit.',
                        'Gastroduodenoskopia z biopsją błony śluzowej dwunastnicy — POTWIERDZENIE celiakii (atrofia kosmków, klasyfikacja Marsh).',
                        'Kolonoskopia z biopsją — przy podejrzeniu NChZJ (choroba Crohna, wrzodziejące zapalenie jelita grubego).',
                        'Lipidogram + próby wątrobowe (ALT, AST, GGT) — wykluczenie chorób wątroby.',
                        'Konsultacja gastroenterologa dziecięcego.'
                      ]}
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'baby-bottle',
            collapsible: true,
            title: 'Wzór auksologiczny — wzrost docelowy (target height)',
            body: [
              'Wzór Tanner-Davies — szacuje wzrost docelowy dziecka (TH, target height) na podstawie wzrostu rodziców.',
              { heading: 'Wzory (osobne dla płci)' },
              { items: [
                { label: 'Chłopiec', text: 'TH = (wzrost matki + wzrost ojca + 13) / 2  [cm], przedział ±8,5 cm.' },
                { label: 'Dziewczynka', text: 'TH = (wzrost matki + wzrost ojca − 13) / 2  [cm], przedział ±8,5 cm.' },
                'Granica ±8,5 cm = ±2 SD od średniej genetycznego potencjału wzrostowego dziecka.'
              ]},
              { heading: 'Interpretacja' },
              { items: [
                'Wzrost dziecka w przedziale TH ±2 SD → wariant rodzinny prawdopodobny.',
                'Wzrost dziecka wyraźnie NIŻSZY niż dolna granica TH → szukaj patologii (GHD, hipotyroza, celiakia, zespół Turnera, choroba przewlekła).'
              ]},
              { heading: 'Prognoza wzrostu dorosłego — metody' },
              { items: [
                { label: 'Bayley-Pinneau', text: 'klasyczna, wymaga wieku kostnego (BA).' },
                { label: 'Roche-Wainer-Thissen', text: 'uwzględnia wzrost rodziców i obecny wzrost dziecka.' },
                { label: 'Tanner-Whitehouse 3', text: 'na podstawie dojrzałości kostnej i wzrostu.' },
                { label: 'Najprostsza klinicznie', text: 'porównanie aktualnego SDS wzrostu dziecka z SDS wzrostu docelowego wyliczonego z wzrostu rodziców.' }
              ]}
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Główne kategorie przyczyn niskorosłości',
            items: [
              {
                label: 'Wariantowe (nie chorobowe) — najczęstsze',
                text: 'wymagają rozpoznania, ale nie wymagają leczenia farmakologicznego:',
                detail: [
                  { heading: 'Rodzinnie niski wzrost (Familial Short Stature, FSS)' },
                  { items: [
                    'Wzrost dziecka zgodny z wzrostem docelowym (rodzice niscy).',
                    'Prędkość wzrastania PRAWIDŁOWA (przyrost stabilny w czasie).',
                    'Wiek kostny PRAWIDŁOWY (zgodny z metrykalnym).',
                    'Dojrzewanie w czasie i postępuje zgodnie z normami.',
                    'Wzrost dorosły zgodny z wzrostem docelowym — niski, ale nie patologiczny.',
                    'Brak wskazań do leczenia rhGH (NIE jest objęty żadnym programem refundowanym w Polsce).'
                  ]},
                  { heading: 'Konstytucjonalne opóźnienie wzrastania i dojrzewania (CDGP)' },
                  { items: [
                    'Dodatni wywiad rodzinny — rodzice/rodzeństwo z późnym dojrzewaniem (matka — późna menarche; ojciec — późny skok wzrostu).',
                    'Wiek kostny znacznie opóźniony (zwykle odpowiada wiekowi wzrostowemu, nie metrykalnemu).',
                    'Opóźnione dojrzewanie płciowe — pierwsze cechy Tannera 2 zwykle > 13 r.ż. u dziewcząt, > 14 r.ż. u chłopców.',
                    'Wzrost w wieku dziecięcym poniżej rówieśników, ale prędkość wzrostu zwykle prawidłowa.',
                    'Dojrzewanie zachodzi z opóźnieniem, ale ostatecznie się dokonuje — wzrost dorosły zwykle PRAWIDŁOWY (catch-up w okresie pokwitania).',
                    'Czasem rozważa się indukcję pokwitania (testosteron u chłopców) w razie wyraźnego dystresu psychospołecznego.'
                  ]}
                ]
              },
              {
                label: 'Choroby przewlekłe — istotne, odwracalne',
                text: 'nierozpoznane mogą znacząco upośledzać wzrastanie; po leczeniu choroby podstawowej często catch-up growth:',
                detail: [
                  'CELIAKIA — istotna, często niedoceniana przyczyna; potrafi się objawiać IZOLOWANYM niedoborem wzrostu bez objawów z przewodu pokarmowego. Dieta bezglutenowa zwykle daje catch-up growth.',
                  'Nieswoiste choroby zapalne jelit (NChZJ) — choroba Crohna, wrzodziejące zapalenie jelita grubego; często z niedoborem masy/wzrostu jako jedynym objawem.',
                  'Mukowiscydoza — zaburzenia wchłaniania + przewlekłe zapalenie.',
                  'Przewlekła choroba nerek (CKD) — osobny program leczenia rhGH (B.38).',
                  'Wrodzone i nabyte wady serca z niewydolnością — przewlekła hipoksja, niedożywienie.',
                  'Niedożywienie — najczęstsza przyczyna niskiego wzrostu w krajach rozwijających się.',
                  'Zaburzenia odżywiania (anoreksja, ortoreksja, ARFID) — istotna przyczyna u nastolatków.',
                  'Astma z przewlekłym stosowaniem GKS systemowych — zahamowanie wzrostu.'
                ]
              },
              {
                label: 'Endokrynologiczne — odwracalne po wyrównaniu',
                text: 'leczenie choroby podstawowej zwykle daje catch-up growth:',
                detail: [
                  'Niedoczynność tarczycy — ciężka i długotrwała znacząco opóźnia wzrastanie; wyrównanie L-tyroksyną przywraca doganianie wzrostu (catch-up).',
                  'Hiperkortyzolemia / zespół Cushinga (egzogenny GKS lub gruczolak ACTH) — zahamowanie wzrostu typowe u dzieci.',
                  'Źle wyrównana cukrzyca typu 1 — przewlekła hiperglikemia obniża IGF-1.',
                  'Przedwczesne dojrzewanie — paradoksalnie skutkuje NISKIM wzrostem dorosłym (wczesne zarośnięcie chrząstek) mimo skoku wzrostu w pokwitaniu.',
                  'Pierwotny niedobór IGF-1 — zespół Larona (mutacje GHR); program B.20 (mecasermina).'
                ]
              },
              {
                label: 'Genetyczne i zespoły — proporcjonalne',
                text: 'wymagają ukierunkowanej diagnostyki genetycznej:',
                detail: [
                  'Zespół Turnera (45,X lub mozaicyzm) u dziewcząt — KARIOTYP wskazany przy KAŻDYM niewyjaśnionym niedoborze wzrostu u dziewcząt. Program B.42.',
                  'Zespół Noonan (mutacje PTPN11, SOS1, RAF1) — fenotyp turner-podobny u obu płci, wady serca (zwężenie zastawki płucnej).',
                  'Zespół Pradera-Williego (PWS) — hipotonia niemowlęca, hiperfagia, otyłość, łagodne upośledzenie umysłowe; test metylacji SNRPN. Program B.41.',
                  'Zespół Silvera-Russella (SRS) — IUGR, asymetria ciała, trójkątna twarz; testowanie molekularne.',
                  'SGA/IUGR bez catch-up growth do 4. r.ż. — program B.64.',
                  'Wrodzona wielohormonalna niedoczynność przysadki (CPHD) — często podłoże genetyczne (PROP1, POU1F1, HESX1).'
                ]
              },
              {
                label: 'Nieproporcjonalne — dysplazje kostne',
                text: 'wymagają oceny przez genetyka i ortopedy:',
                detail: [
                  'Achondroplazja (mutacja FGFR3, p.G380R) — najczęstsza dysplazja, rizomelia (skrócenie odcinka proksymalnego kończyn), makrocefalia.',
                  'Hipochondroplazja (mutacje FGFR3) — łagodniejsza, bez dysmorfii twarzy.',
                  'Dysplazja spondyloepifizalna (SED) — krótki tułów, niski wzrost; mutacje COL2A1.',
                  'Niedobór/haploinsuficjencja SHOX — niskorosłość mezomeliczna z deformacją Madelunga; dysplazja Lériego-Weilla.',
                  'Hipofosfatazja — obniżona ALP, krzywica.'
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'list-search',
            collapsible: true,
            title: 'Proporcjonalna vs nieproporcjonalna niskorosłość',
            body: [
              'Klasyfikacja wg proporcjonalności budowy ciała ma fundamentalne znaczenie dla różnicowania przyczyn niskorosłości.',
              { heading: '1) Proporcjonalna niskorosłość' },
              'Zachowane proporcje tułowia i kończyn. Obejmuje większość przyczyn:',
              { items: [
                'Niedobory hormonalne — GHD, hipotyroza, hiperkortyzolemia.',
                'Choroby przewlekłe — celiakia, NChZJ, CKD.',
                'Wariant rodzinny (rodzinnie niski wzrost) oraz CDGP.',
                'Wiele zespołów genetycznych — Turner, Noonan, PWS, Silver-Russell.'
              ]},
              { heading: '2) Nieproporcjonalna niskorosłość' },
              'Zaburzony stosunek górnej i dolnej części ciała — charakterystyczna dla DYSPLAZJI KOSTNYCH:',
              { items: [
                { label: 'Achondroplazja, hipochondroplazja', text: 'skrócenie kończyn — rizomelia (skrócenie odcinka proksymalnego: ramię, udo).' },
                { label: 'Dysplazja spondyloepifizalna (SED)', text: 'krótki tułów.' },
                { label: 'SHOX-haploinsuficjencja', text: 'skrócenie kończyn z deformacją Madelunga.' }
              ]},
              { heading: 'Pomiar proporcji — jak to zmierzyć' },
              { items: [
                { label: 'SH (sitting height)', text: 'pomiar wzrostu siedzeniowego — od czubka głowy do siedzenia (dziecko siedzi na desce o znanej wysokości, głowa w pozycji frankfurckiej).' },
                { label: 'TH (total height)', text: 'wzrost całkowity stadiometrem (na stojąco, boso).' },
                { label: 'LL (leg length)', text: 'długość kończyn dolnych = TH − SH.' },
                { label: 'Stosunek U/L (upper/lower)', text: 'U/L = SH / LL. Normy: noworodek ≈ 1,7; 3 r.ż. ≈ 1,3; nastolatek/dorosły ≈ 1,0.' },
                { label: 'Interpretacja', text: 'U/L > +2 SD → krótkie kończyny (achondroplazja); U/L < −2 SD → krótki tułów (SED).' }
              ]},
              { heading: 'Wniosek kliniczny' },
              'Nieproporcjonalna niskorosłość JEST OBJAWEM PATOLOGII — zawsze wymaga diagnostyki genetycznej i konsultacji ortopedycznej.'
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Panel podstawowy diagnostyki',
            items: [
              { label: 'Siatki centylowe polskie + prędkość wzrostu', text: 'OLAF/Palczewska (5–19 r.ż.), WHO (0–5 r.ż.), Fenton/INTERGROWTH (noworodki). Obserwacja w czasie ≥ 6 mies.' },
              { label: 'RTG ocena wieku kostnego', text: 'RTG dłoni ręki niedominującej — różnicuje CDGP (opóźniony WK) od rodzinnie niskiego wzrostu (prawidłowy WK); prognoza wzrostu dorosłego (Bayley-Pinneau).' },
              { label: 'IGF-1 + IGFBP-3', text: 'skrining GHD — wartości referencyjne wg wieku i Tannera; prawidłowy IGF-1 nie wyklucza GHD u dziecka.' },
              { label: 'TSH + fT4', text: 'wykluczenie niedoczynności tarczycy.' },
              { label: 'Kortyzol poranny', text: 'wykluczenie hiperkortyzolemii (zespół Cushinga).' },
              { label: 'Witamina D 25-OH', text: 'częsty niedobór; istotny dla zdrowia kości i wzrastania.' },
              { label: 'Anty-tTG IgA + IgA całkowite', text: 'celiakia — łącznie konieczne (niedobór IgA dałby fałszywie ujemny anty-tTG IgA).' },
              { label: 'Morfologia + biochemia + ALP + CRP + eGFR', text: 'wykluczenie chorób przewlekłych i krzywicy.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka pogłębiona — wg wskazań',
            items: [
              { label: 'Testy stymulacji GH (przy obniżonym IGF-1)', text: 'glukagon, klonidyna, arginina, L-DOPA, insulina (po 5. r.ż.); 2 niezależne testy z różnym mechanizmem; szczyt GH < 10 ng/mL = SNP. Zob. panel „Niedobór hormonu wzrostu (dzieci)".' },
              { label: 'MRI/TK okolicy podwzgórzowo-przysadkowej', text: 'przy potwierdzonym GHD — wykluczenie zmian organicznych (czaszkogardlak, hipoplazja przysadki, zespół przerwania szypuły).' },
              { label: 'Kariotyp', text: 'obowiązkowy u dziewczynek z niewyjaśnioną niskorosłością (wykluczenie ZT); rozważ u dzieci SGA bez ustalonej etiologii.' },
              { label: 'Badania molekularne ukierunkowane', text: 'SHOX (haploinsuficjencja), FGFR3 (achondroplazja, hipochondroplazja), COL2A1 (SED), SNRPN (PWS), PROP1/POU1F1/HESX1 (CPHD), test molekularny SRS.' },
              { label: 'Konsultacja gastroenterologa + gastroskopia z biopsją', text: 'przy podejrzeniu celiakii (potwierdzenie wg Marsh); przy podejrzeniu NChZJ — kalprotektyna w kale + kolonoskopia.' },
              { label: 'Konsultacja genetyka + ortopedy', text: 'przy nieproporcjonalnej niskorosłości — diagnostyka dysplazji kostnych.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            EXT.height_chart,
            EXT.bone_age,
            { id: 'igf1' }, { id: 'igfbp3' },
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'cortisol' },
            { id: 'vit_d_25oh' }
          ]
        },
        { name: 'Wykluczenie chorób przewlekłych',
          tests: [
            EXT.cbc, EXT.ferritin, EXT.iga_total, EXT.ttg_iga,
            EXT.cmp, EXT.egfr, EXT.alp,
            EXT.crp
          ]
        },
        { name: 'Inne (jeśli wskazane)',
          tests: [
            EXT.karyotype,
            EXT.glucagon_test, EXT.clonidine_test
          ]
        }
      ],
      guideline: 'PTE Pediatryczna / ESPE 2008 (Cohen) + ESPE 2016 / GH Research Society 2000 (dzieci); siatki polskie: OLAF (5–19 r.ż.), Palczewska (klasyczna), WHO (0–5 r.ż.), Fenton/INTERGROWTH (noworodki); polskie programy lekowe NFZ jako kontekst kwalifikacji (B.19 SNP, B.20 IGF-1, B.38 PNN, B.41 PWS, B.42 ZT, B.64 SGA).',
      sources: [
        'Cohen P, Rogol AD, Deal CL i wsp. Consensus statement on the diagnosis and treatment of children with idiopathic short stature: a summary of the GH Research Society, the Lawson Wilkins Pediatric Endocrine Society, and the European Society for Paediatric Endocrinology Workshop. J Clin Endocrinol Metab. 2008;93(11):4210-4217.',
        'GH Research Society. Consensus guidelines for the diagnosis and treatment of growth hormone (GH) deficiency in childhood and adolescence. J Clin Endocrinol Metab. 2000;85(11):3990-3993.',
        'Krawczyński M, Walczak M. Endokrynologia kliniczna dziecięca — klasyczny polski podręcznik.',
        'Pyrżak B, Witkowska-Sędek E, Szalecki M i wsp. Pediatryczne rekomendacje Polskiego Towarzystwa Endokrynologii Dziecięcej (PTEDD).',
        'Polskie siatki centylowe: Kułaga Z, Litwin M i wsp. Polish OLAF reference values for height and weight in children aged 7-18 years. Standardy Medyczne / Pediatria. 2015. Palczewska I, Niedźwiecka Z. Wskaźniki rozwoju somatycznego dzieci i młodzieży warszawskiej.',
        'Tanner JM, Davies PS. Clinical longitudinal standards for height and height velocity for North American children. J Pediatr. 1985;107(3):317-329.',
        'Greulich WW, Pyle SI. Radiographic Atlas of Skeletal Development of the Hand and Wrist. 2nd ed. Stanford University Press, 1959.',
        'Bayley N, Pinneau SR. Tables for predicting adult height from skeletal age. J Pediatr. 1952;40(4):423-441.',
        'Załączniki B.19/B.20/B.38/B.41/B.42/B.64 do Obwieszczenia Ministra Zdrowia — Programy Lekowe NFZ leczenia niskorosłości u dzieci (kontekst kwalifikacji do refundowanego leczenia rhGH/rhIGF-1).'
      ]
    },

    acromegaly: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Akromegalia',
            body: 'Zespół chorobowy spowodowany przewlekle nadmiernym wydzielaniem hormonu wzrostu (GH) u dorosłych — po zamknięciu chrząstek wzrostowych. W > 95% przypadków przyczyną jest gruczolak przysadki produkujący GH (somatotropinoma). U dzieci i młodzieży przed zarośnięciem chrząstek wzrostowych ten sam nadmiar GH prowadzi do gigantyzmu. Choroba rozpoznawana jest zwykle z opóźnieniem 5–10 lat od początku objawów.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Charakterystyka kliniczna',
            items: [
              { label: 'Twarz', text: 'pogrubienie rysów, prognatyzm (wysunięta żuchwa), powiększenie żuchwy, języka (makroglossia), nosa i uszu.' },
              { label: 'Ręce i stopy', text: 'powiększenie obwodowe — zmiana rozmiaru obuwia, rękawiczek, biżuterii (objaw zgłaszany przez pacjenta).' },
              { label: 'Skóra', text: 'pogrubienie, łojotok, nadmierne pocenie (zwłaszcza nocne).' },
              { label: 'Narząd ruchu', text: 'bóle stawów, artropatia akromegaliczna; zespół cieśni nadgarstka.' },
              { label: 'Układ oddechowy', text: 'obturacyjny bezdech senny (OSA) — wskutek powiększenia tkanek miękkich gardła i języka.' },
              { label: 'Serce', text: 'kardiomiopatia akromegaliczna — przerost lewej komory, zaburzenia czynności rozkurczowej.' },
              { label: 'Inne', text: 'bóle głowy, zmęczenie, hipogonadyzm, mlekotok (przy gruczolakach mieszanych GH/PRL).' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Klasyfikacja gruczolaków przysadki',
            items: [
              { label: 'Mikrogruczolak (< 10 mm)', text: 'częściej łatwiejszy do całkowitej resekcji operacyjnej, wyższa wyleczalność, rzadziej powoduje niedoczynność pozostałych osi przysadki.' },
              { label: 'Makrogruczolak (≥ 10 mm)', text: 'większe ryzyko ucisku skrzyżowania wzrokowego (niedowidzenie połowicze dwuskroniowe), niedoczynności pozostałych osi przysadki, gorsza wyleczalność operacyjna.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny akromegalii',
            items: [
              { label: 'Gruczolak przysadki produkujący GH (somatotropinoma)', text: '> 95% przypadków.' },
              { label: 'Gruczolak mieszany GH/PRL', text: 'ok. 25% somatotropinów wydziela również prolaktynę — stąd mlekotok jako częsty objaw towarzyszący.' },
              { label: 'Ektopowy guz wydzielający GHRH', text: 'rzadkie — rakowiaki płuca, trzustki, jelita.' },
              { label: 'Zespoły genetyczne (rzadkie)', text: 'MEN1, FIPA (familial isolated pituitary adenoma), Carney complex, McCune-Albright.' }
            ]
          },
          {
            kind: 'algorithm',
            icon: 'route',
            title: 'Algorytm diagnostyczny akromegalii',
            steps: [
              {
                number: 1,
                title: 'Skrining biochemiczny — IGF-1',
                sublabel: 'czułość ~95% przy podejrzeniu klinicznym',
                options: [
                  {
                    threshold: 'Pomiar',
                    action: 'Stężenie IGF-1 porównane z normami dla WIEKU i PŁCI. Podwyższony IGF-1 wskazuje na akromegalię i jest wskazaniem do potwierdzenia w OGTT.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Dlaczego IGF-1, a nie GH' },
                      { items: [
                        'Wydzielanie GH ma charakter PULSACYJNY (krótki okres półtrwania ~20 min) — pojedynczy pomiar jest niediagnostyczny.',
                        'IGF-1 produkowany w wątrobie pod wpływem GH, ma długi okres półtrwania (~15 h) i stabilne stężenie w ciągu doby — odzwierciedla integralne wydzielanie GH.',
                        'Normy IGF-1 ściśle zależne od wieku i płci — bezwzględnie używaj norm laboratorium, w którym wykonano oznaczenie.'
                      ]},
                      { heading: 'Co obniża IGF-1 (fałszywie ujemne)' },
                      { items: [
                        'Niewyrównana cukrzyca, niedoczynność tarczycy, przewlekłe choroby wątroby.',
                        'Niedożywienie, przewlekły stan zapalny.',
                        'Doustna antykoncepcja (zwiększa wątrobową produkcję SHBG, obniża wolny IGF-1).'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 2,
                title: 'Potwierdzenie biochemiczne — OGTT 75 g z pomiarem GH',
                sublabel: 'standard złoty potwierdzenia akromegalii',
                options: [
                  {
                    threshold: 'Protokół i interpretacja',
                    action: 'OGTT 75 g glukozy doustnie, pomiar GH w punktach 0, 30, 60, 90, 120 min. BRAK supresji najniższego stężenia GH w teście do < 1 μg/L (lub < 0,4 μg/L w czułych immunoassayach) potwierdza akromegalię.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Zasada fizjologiczna' },
                      { items: [
                        'U osoby zdrowej hiperglikemia po OGTT powoduje supresję wydzielania GH (przez somatostatynę).',
                        'W akromegalii wydzielanie GH przez somatotropinoma jest autonomiczne — brak supresji.'
                      ]},
                      { heading: 'Protokół' },
                      { items: [
                        'Pacjent na czczo (≥ 8 h).',
                        '75 g glukozy doustnie w 200–300 ml wody.',
                        'Pomiary GH: 0 (przed podaniem), 30, 60, 90, 120 min.',
                        'Najniższe zmierzone stężenie GH w czasie testu (w terminologii anglojęzycznej: "nadir GH") służy do interpretacji wyniku.'
                      ]},
                      { heading: 'Progi diagnostyczne' },
                      { items: [
                        { label: 'Klasyczne (RIA)', text: 'najniższe stężenie GH w teście < 1 μg/L wyklucza akromegalię.' },
                        { label: 'Czułe immunoassaye', text: 'najniższe stężenie GH w teście < 0,4 μg/L wyklucza akromegalię.' },
                        'Brak supresji do tych wartości = potwierdzenie rozpoznania.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 3,
                title: 'Lokalizacja — MRI przysadki z gadolinium',
                sublabel: 'obowiązkowe po biochemicznym potwierdzeniu',
                options: [
                  {
                    threshold: 'Cel badania',
                    action: 'MRI przysadki z gadolinium (sekwencje T1 dynamiczne) — rozróżnienie mikro/makrogruczolaka, ocena ekspansji nadsiodłowej i ucisku skrzyżowania wzrokowego, planowanie operacji.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Co oceniamy w MRI' },
                      { items: [
                        'Wielkość gruczolaka — mikro (< 10 mm) vs makro (≥ 10 mm).',
                        'Ekspansja nadsiodłowa — ucisk skrzyżowania wzrokowego (niedowidzenie połowicze dwuskroniowe).',
                        'Naciek na zatokę jamistą — pogarsza rokowanie operacyjne (klasyfikacja Knospa).',
                        'Erozja siodła tureckiego, naciek na kość klinową.'
                      ]},
                      { heading: 'Jeśli MRI ujemne — szukaj ektopii' },
                      { items: [
                        'Pomiar GHRH w surowicy + TK klatki piersiowej i jamy brzusznej.',
                        'Najczęstsze ektopowe źródła GHRH: rakowiaki płuca, trzustki, jelita.'
                      ]}
                    ]
                  }
                ]
              },
              {
                number: 4,
                title: 'Ocena rozszerzenia choroby i powikłań',
                sublabel: 'badania bazowe przed leczeniem',
                options: [
                  {
                    threshold: 'Zakres badań',
                    action: 'Ocena pozostałych osi przysadki (TSH/fT4, prolaktyna, kortyzol/ACTH, LH/FSH/testosteron/estradiol), pole widzenia, OGTT 75 g + HbA1c, lipidogram, echokardiografia, polisomnografia, kolonoskopia.',
                    variant: 'success', icon: 'check',
                    detail: [
                      { heading: 'Pozostałe osi przysadki' },
                      { items: [
                        { label: 'Tarczyca', text: 'TSH + fT4 — wtórna niedoczynność przy ucisku makrogruczolaka.' },
                        { label: 'Prolaktyna', text: 'gruczolaki mieszane GH/PRL (~25%); efekt przerwania szypuły w dużych makrogruczolakach (umiarkowanie podwyższona PRL).' },
                        { label: 'Kora nadnerczy', text: 'kortyzol poranny + ACTH — wtórna niedoczynność wymaga PILNEJ substytucji przed operacją (zagrożenie życia).' },
                        { label: 'Gonady', text: 'LH + FSH + testosteron (M) / estradiol (K) — hipogonadyzm hipogonadotropowy częsty przy makrogruczolakach.' }
                      ]},
                      { heading: 'Powikłania ogólnoustrojowe' },
                      { items: [
                        'Wykonaj OGTT 75 g oraz oznacz HbA1c — cukrzyca lub upośledzona tolerancja glukozy (IGT) występuje u znacznego odsetka pacjentów.',
                        'Lipidogram — dyslipidemia.',
                        'Echokardiografia — kardiomiopatia akromegaliczna (przerost lewej komory).',
                        'Polisomnografia — diagnostyka obturacyjnego bezdechu sennego (OSA, obstructive sleep apnea); leczeniem z wyboru jest aparat CPAP (continuous positive airway pressure — ciągłe dodatnie ciśnienie w drogach oddechowych).',
                        'Pole widzenia (perymetria) — przy makrogruczolaku uciskającym skrzyżowanie wzrokowe.',
                        'Kolonoskopia w momencie rozpoznania choroby (badanie bazowe) — zwiększone ryzyko polipów i raka jelita grubego u pacjentów z akromegalią.'
                      ]}
                    ]
                  }
                ]
              }
            ]
          },
          {
            kind: 'callout',
            variant: 'primary',
            icon: 'baby-bottle',
            collapsible: true,
            title: 'Leczenie akromegalii',
            body: [
              'Leczenie jest wielomodalne — wybór zależy od wielkości gruczolaka, jego umiejscowienia, stopnia hipersekrecji GH oraz obecności powikłań.',
              { heading: '1) Leczenie operacyjne — pierwsza linia' },
              { items: [
                { label: 'Operacja przezsklepieniowa (TSS)', text: 'transsfenoidalna resekcja gruczolaka — terapia z wyboru. Wykonywana w ośrodku referencyjnym z doświadczonym neurochirurgiem.' },
                { label: 'Wyleczalność', text: 'mikrogruczolak ~75–90%, makrogruczolak ~40–60% (zależnie od inwazji na zatokę jamistą).' }
              ]},
              { heading: '2) Farmakoterapia' },
              { items: [
                { label: 'Analogi somatostatyny — oktreotyd LAR (Sandostatin LAR), lanreotyd autogel (Somatuline Autogel)', text: 'pierwsza linia farmakoterapii — po nieskutecznej operacji lub gdy operacja niemożliwa. Normalizacja IGF-1 i GH u ok. 50–60% pacjentów.' },
                { label: 'Pegwizomant (Somavert) — antagonista receptora GH', text: 'gdy analogi somatostatyny nieskuteczne. Normalizuje IGF-1 u > 90% pacjentów, ale GH pozostaje wysokie (lek blokuje receptor, nie zmniejsza wydzielania).' },
                { label: 'Agoniści dopaminy — kabergolina (Dostinex)', text: 'w łagodnych postaciach, zwłaszcza przy współistniejącej hiperprolaktynemii. Skuteczność niższa od analogów somatostatyny.' }
              ]},
              { heading: '3) Radioterapia' },
              { items: [
                { label: 'Stereotaktyczna (gamma knife, cyber knife) lub konwencjonalna', text: 'metoda zarezerwowana dla przypadków opornych na leczenie operacyjne i farmakoterapię. Efekt biochemiczny pojawia się po 5–10 latach. Wiąże się z ryzykiem rozwoju niedoczynności pozostałych osi przysadki — w tym GHD (zob. panel „Niedobór hormonu wzrostu (dorośli)").' }
              ]}
            ]
          },
          {
            kind: 'callout',
            variant: 'purple',
            icon: 'check',
            collapsible: true,
            title: 'Kryteria remisji choroby',
            body: [
              'Po leczeniu (operacja, farmakoterapia, radioterapia) ocena remisji opiera się na badaniach biochemicznych oraz obrazowych.',
              { heading: 'Biochemiczna remisja' },
              { items: [
                { label: 'IGF-1', text: 'w normie dla wieku i płci.' },
                { label: 'GH po OGTT 75 g', text: 'najniższe stężenie GH w teście < 1 μg/L (lub < 0,4 μg/L w czułych immunoassayach).' },
                'Oba kryteria muszą być spełnione łącznie.'
              ]},
              { heading: 'Obrazowa remisja' },
              { items: [
                'MRI przysadki — brak resztkowej tkanki gruczolaka po operacji.',
                'Po radioterapii — gruczolak może być widoczny mimo biochemicznej remisji (ważniejsza ocena biochemiczna).'
              ]},
              { heading: 'Choroba kontrolowana' },
              { items: [
                'IGF-1 w normie + GH w spoczynku < 1,0 μg/L (bez OGTT) — przy stosowaniu farmakoterapii.',
                'Cel terapii długoterminowej — zbliżenie oczekiwanej długości życia pacjenta do populacji ogólnej.'
              ]}
            ]
          },
          {
            kind: 'list',
            icon: 'alert-triangle',
            title: 'Powikłania ogólnoustrojowe i monitorowanie',
            items: [
              {
                label: 'Sercowo-naczyniowe — główna przyczyna umieralności',
                text: 'wymaga aktywnego monitorowania:',
                detail: [
                  'Echokardiografia — kardiomiopatia akromegaliczna (przerost lewej komory, zaburzenia czynności rozkurczowej, dysfunkcja skurczowa w zaawansowanych stadiach).',
                  'Nadciśnienie tętnicze — częste, wymaga leczenia.',
                  'Choroba niedokrwienna serca, zaburzenia rytmu — ryzyko zwiększone.'
                ]
              },
              {
                label: 'Metaboliczne',
                text: 'częste w nieleczonej akromegalii:',
                detail: [
                  'OGTT 75 g + HbA1c — cukrzyca lub upośledzona tolerancja glukozy (IGT) u znacznego odsetka pacjentów.',
                  'Insulinooporność (HOMA-IR).',
                  'Dyslipidemia — wzrost triglicerydów, możliwe obniżenie HDL.'
                ]
              },
              {
                label: 'Oddechowe',
                text: 'wynikają z powiększenia tkanek miękkich:',
                detail: [
                  'Obturacyjny bezdech senny (OSA) — diagnostyka polisomnograficzna; leczeniem z wyboru jest aparat CPAP (continuous positive airway pressure — ciągłe dodatnie ciśnienie w drogach oddechowych).',
                  'Restrykcyjna choroba płuc przy zaawansowanej kifoskoliozie akromegalicznej.'
                ]
              },
              {
                label: 'Narządowe (wisceromegalia)',
                text: 'powiększenie narządów wewnętrznych:',
                detail: [
                  'Serce, wątroba, nerki, śledziona, tarczyca (wole rozlane lub guzkowe).',
                  'Powiększenie języka — przyczyna OSA i trudności artykulacyjnych.'
                ]
              },
              {
                label: 'Stawowe — artropatia akromegaliczna',
                text: 'znacznie obniża jakość życia:',
                detail: [
                  'Pogrubienie chrząstki stawowej + niestabilność więzadeł → przedwczesna choroba zwyrodnieniowa.',
                  'Najczęściej zajęte: stawy kolanowe, biodrowe, barki, kręgosłup.',
                  'Bóle ustępują tylko częściowo po normalizacji GH/IGF-1.'
                ]
              },
              {
                label: 'Onkologiczne — zwiększone ryzyko',
                text: 'wymaga aktywnego nadzoru:',
                detail: [
                  'Polipy i rak jelita grubego — kolonoskopia w momencie rozpoznania choroby (badanie bazowe), badania kontrolne w odstępach krótszych niż w populacji ogólnej.',
                  'Inne nowotwory (m.in. tarczycy, piersi) — indywidualna ocena ryzyka.'
                ]
              },
              { label: 'Okulistyczne', text: 'badanie pola widzenia (perymetria) — przy makrogruczolaku uciskającym skrzyżowanie wzrokowe (typowo niedowidzenie połowicze dwuskroniowe).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Skrining + potwierdzenie',
          tests: [
            { id: 'igf1' },
            EXT.ogtt_gh
          ]
        },
        { name: 'Ocena reszty osi przysadkowej',
          tests: [
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'prolactin' },
            { id: 'cortisol' }, { id: 'acth' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'testosterone_total' }, { id: 'estradiol' }
          ]
        },
        { name: 'Lokalizacja i powikłania',
          tests: [
            EXT.pituitary_mri,
            EXT.eye_exam,
            EXT.ogtt_75g, EXT.hba1c,
            EXT.lipid_panel
          ]
        }
      ],
      guideline: 'Bolanowski M, Ruchała M i wsp. — Konsensus PTE 2019 (akromegalia) / Endocrine Society 2014 (Katznelson i wsp.) / Acromegaly Consensus Group 2018 (Melmed i wsp.).',
      sources: [
        'Bolanowski M, Ruchała M, Zgliczyński W i wsp. Diagnostyka i leczenie akromegalii — rekomendacje Polskiego Towarzystwa Endokrynologicznego 2019. Endokrynologia Polska.',
        'Katznelson L, Laws ER Jr, Melmed S i wsp. Acromegaly: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2014;99(11):3933-3951.',
        'Melmed S, Bronstein MD, Chanson P i wsp. A Consensus Statement on acromegaly therapeutic outcomes. Nat Rev Endocrinol. 2018;14(9):552-561.',
        'Giustina A, Barkan A, Beckers A i wsp. A Consensus on the Diagnosis and Treatment of Acromegaly Comorbidities — An Update. J Clin Endocrinol Metab. 2020;105(4):e937-e946.',
        'Knosp E, Steiner E, Kitz K, Matula C. Pituitary adenomas with invasion of the cavernous sinus space: a magnetic resonance imaging classification compared with surgical findings. Neurosurgery. 1993;33(4):610-617 (klasyfikacja inwazji na zatokę jamistą — Knosp grading).'
      ]
    },

    /* ═══════════════════════════════════════════════════════════════
     *  METABOLIZM WAPNIOWO-FOSFORANOWY
     * ═══════════════════════════════════════════════════════════════ */

    vitamin_d_status: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja statusu witaminy D',
            body: '25-OHD (25-hydroksywitamina D) jest podstawowym markerem oceny zasobów ustrojowych witaminy D — odzwierciedla łącznie syntezę skórną i podaż z dietą/suplementami. 1,25(OH)2D (aktywna postać hormonalna) NIE służy rutynowej ocenie statusu — jest regulowana hormonalnie (PTH, FGF23) i nie odzwierciedla zasobów; oznaczanie 1,25(OH)2D ma sens głównie w chorobach metabolizmu Ca/P, niewydolności nerek oraz w chorobach ziarniniakowych. Polskie zalecenia: konsensus Płudowski i wsp. 2023; międzynarodowe — Endocrine Society 2024.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Klasyfikacja stężeń 25-OHD (Polski konsensus 2023)',
            items: [
              { label: 'Ciężki niedobór', text: '< 25 nmol/L (< 10 ng/mL) — ryzyko krzywicy/osteomalacji; pilna interwencja.' },
              { label: 'Niedobór', text: '25–50 nmol/L (10–20 ng/mL) — leczenie zalecane.' },
              { label: 'Niewystarczające', text: '50–75 nmol/L (20–30 ng/mL) — suplementacja zalecana.' },
              { label: 'Optymalne', text: '75–125 nmol/L (30–50 ng/mL) — cel terapeutyczny.' },
              { label: 'Wysokie', text: '125–250 nmol/L (50–100 ng/mL) — czujność, możliwa redukcja dawki.' },
              { label: 'Toksyczne', text: '> 250 nmol/L (> 100 ng/mL) — ryzyko hiperkalcemii.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wskazania do skriningu 25-OHD',
            items: [
              {
                label: 'Grupy ryzyka niedoboru',
                text: 'czynniki zmniejszające syntezę skórną lub wchłanianie:',
                detail: [
                  'Otyłość (BMI ≥ 30) — sekwestracja witaminy D w tkance tłuszczowej.',
                  'Malabsorption (celiakia, NChZJ, mukowiscydoza, stan po operacjach bariatrycznych).',
                  'Choroby przewlekłe — CKD, choroby wątroby (cholestaza), NChZJ.',
                  'Leki indukujące CYP3A4 — glikokortykosteroidy długotrwale, antykonwulsanty (fenytoina, fenobarbital, karbamazepina), antyretrowirusowe.',
                  'Ciemna karnacja skóry, ograniczona ekspozycja słoneczna, mieszkańcy domów opieki.',
                  'Osoby starsze (zmniejszona synteza skórna z wiekiem).'
                ]
              },
              { label: 'Choroby kości i metabolizmu Ca/P', text: 'osteoporoza, osteomalacja, krzywica, hiperparatyreoza pierwotna lub wtórna, hipokalcemia, hipofosfatemia — wszystkie wymagają oceny statusu witaminy D.' },
              {
                label: 'Sytuacje szczególne',
                text: 'grupy z podwyższonymi potrzebami:',
                detail: [
                  'Dzieci — zwłaszcza karmione piersią bez suplementacji witaminą D.',
                  'Kobiety w ciąży i karmiące — zwiększone zapotrzebowanie.',
                  'Kwalifikacja do operacji bariatrycznych — ocena wyjściowa.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka rozszerzona przy zaburzeniach Ca/P',
            items: [
              { label: '1,25(OH)2D (aktywna postać)', text: 'wskazana w chorobach ziarniniakowych (paradoksalnie podwyższona), CKD (ocena substytucji kalcytriolem), wrodzonych krzywicach opornych.' },
              { label: 'PTH (parathormon)', text: 'różnicuje przyczyny hipo-/hiperkalcemii oraz hiperfosfatemii.' },
              { label: 'Wapń całkowity (skorygowany o albuminę) i zjonizowany', text: 'podstawowa ocena gospodarki wapniowej.' },
              { label: 'Fosfor nieorganiczny', text: 'kluczowy w diagnostyce krzywic (niski w niedoborowej i XLH; wysoki w nerkowej).' },
              { label: 'ALP (fosfataza alkaliczna)', text: 'znacznie podwyższona w krzywicy, osteomalacji i innych zaburzeniach mineralizacji.' },
              { label: 'eGFR', text: 'czynność nerek — istotna dla aktywacji witaminy D i wyboru postaci suplementacji.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'vit_d_25oh' }
          ]
        },
        { name: 'Rozszerzony (jeśli zaburzenia metabolizmu Ca/P)',
          tests: [
            { id: 'vit_d_1_25' },
            EXT.pth, EXT.ca_total, EXT.phosphorus, EXT.alp,
            EXT.egfr
          ]
        }
      ],
      guideline: 'Polski konsensus wit. D 2023 (Płudowski i wsp.) / Endocrine Society 2024'
    },

    osteoporosis: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kryteria rozpoznania',
            body: 'Osteoporoza — choroba szkieletu charakteryzująca się zmniejszoną masą kostną i zaburzoną mikroarchitekturą, prowadząca do zwiększonej łamliwości kości. Rozpoznanie DENSYTOMETRYCZNE: T-score ≤ -2,5 w DXA (L1–L4 lub biodro). Rozpoznanie KLINICZNE: po przebytym złamaniu niskoenergetycznym biodra lub kręgosłupa — niezależnie od wartości T-score. WAŻNE: T-score stosuje się u kobiet po menopauzie i u mężczyzn ≥ 50. r.ż.; u kobiet przed menopauzą i mężczyzn < 50. r.ż. właściwy jest Z-score (≤ -2,0 = „poniżej zakresu oczekiwanego dla wieku"). Wytyczne: IOF 2019 / NOF 2014 / PTOPiOO 2017.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Diagnostyka podstawowa',
            items: [
              { label: 'DXA L1–L4 + biodro', text: 'kryterium rozpoznania densytometrycznego — porównanie z młodymi zdrowymi osobami (T-score) lub z grupą wiekową (Z-score).' },
              { label: 'PTH + wapń (skorygowany o albuminę) + fosfor', text: 'wykluczenie pierwotnej nadczynności przytarczyc i innych zaburzeń gospodarki Ca/P.' },
              { label: 'Witamina D 25-OH', text: 'częsty niedobór — istotny dla skuteczności leczenia osteoporozy.' },
              { label: 'ALP (fosfataza alkaliczna)', text: 'orientacyjna ocena przebudowy kości; podwyższona w osteomalacji, chorobie Pageta, przerzutach kostnych.' },
              { label: 'eGFR (czynność nerek)', text: 'istotne dla wyboru terapii — bisfosfoniany przeciwwskazane przy eGFR < 30–35 mL/min.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Wykluczenie osteoporozy wtórnej',
            items: [
              {
                label: 'Endokrynologiczne',
                text: 'najczęstsze odwracalne przyczyny osteoporozy wtórnej:',
                detail: [
                  'Pierwotna nadczynność przytarczyc — PTH + wapń (najczęstsza endokrynna przyczyna wtórnej osteoporozy).',
                  'Hiperkortyzolemia / zespół Cushinga — DST gdy występują stigmaty (rozstępy purpurowe, twarz księżycowata, miopatia).',
                  'Nadczynność tarczycy (jawna i subkliniczna znaczna) — TSH; nadczynność przyspiesza utratę masy kostnej.',
                  'Hipogonadyzm u mężczyzn — testosteron całkowity; częsta przyczyna osteoporozy u mężczyzn.',
                  'Hipogonadyzm u kobiet przed menopauzą — FSH + estradiol.',
                  'Akromegalia (rzadziej) — IGF-1.'
                ]
              },
              {
                label: 'Onkologiczne',
                text: 'możliwa hipotetyczna przyczyna złamania niskoenergetycznego:',
                detail: [
                  'Szpiczak mnogi i MGUS — SPEP + UPEP + free light chains (oznaczenie kappa/lambda); osteoporoza może być pierwszym objawem.',
                  'Przerzuty kostne — zwłaszcza u pacjentów z rozpoznanym nowotworem.'
                ]
              },
              {
                label: 'Choroby narządowe',
                text: 'wpływają na metabolizm kostny:',
                detail: [
                  'Przewlekła choroba nerek (CKD) — postać kostna CKD-MBD wymaga odrębnego postępowania.',
                  'Przewlekłe choroby wątroby (cholestaza, marskość).',
                  'Hemochromatoza — żelazo, transferyna, ferrytyna.'
                ]
              },
              {
                label: 'Wchłanianie i dieta',
                text: 'odwracalne po wyrównaniu:',
                detail: [
                  'Celiakia — anty-tTG IgA + IgA całkowite (niedobór IgA fałszuje wynik); celiakia bywa pierwotnie rozpoznawana z powodu osteoporozy.',
                  'Inne zaburzenia wchłaniania — NChZJ, mukowiscydoza, stan po operacjach bariatrycznych.'
                ]
              },
              {
                label: 'Jatrogenne',
                text: 'częste przyczyny — długotrwałe leczenie:',
                detail: [
                  'Glikokortykosteroidy długotrwale (osteoporoza posteroidowa — najczęstsza jatrogenna).',
                  'Antykonwulsanty (fenytoina, fenobarbital, karbamazepina) — indukują CYP3A4.',
                  'Inhibitory aromatazy w leczeniu raka piersi.',
                  'Analogi GnRH (deprywacja androgenowa w raku prostaty).',
                  'Inhibitory pompy protonowej długotrwale (kontrowersyjne — możliwy wpływ na wchłanianie wapnia).',
                  'Heparyna długotrwale, leki przeciwretrowirusowe.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Markery przebudowy kości — monitorowanie leczenia',
            items: [
              {
                label: 'CTX i P1NP — zastosowanie i ograniczenia',
                text: 'markery serologiczne metabolizmu kostnego:',
                detail: [
                  'CTX (marker resorpcji kości — fragment C-końcowy kolagenu typu I) — preferowany do monitorowania leczenia ANTYRESORPCYJNEGO (bisfosfoniany, denozumab); spadek CTX po wdrożeniu terapii potwierdza skuteczność.',
                  'P1NP (marker tworzenia kości — N-końcowy peptyd prokolagenu typu I) — preferowany do monitorowania leczenia ANABOLICZNEGO (teryparatyd, romosozumab).',
                  'Pobranie RANO, NA CZCZO — duża zmienność dobowo-żywieniowa.',
                  'Markery NIE służą do rozpoznania osteoporozy — wyłącznie do oceny obrotu kostnego i odpowiedzi na leczenie.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Diagnostyka podstawowa',
          tests: [
            EXT.dxa,
            EXT.pth, EXT.ca_total, EXT.phosphorus, EXT.albumin,
            { id: 'vit_d_25oh' },
            EXT.alp, EXT.egfr
          ]
        },
        { name: 'Wykluczenie wtórnej osteoporozy',
          tests: [
            { id: 'tsh' },
            { id: 'cortisol', note: 'Po DST jeśli stigmaty Cushinga' },
            { id: 'testosterone_total', note: 'Mężczyźni' },
            { id: 'estradiol', note: 'Kobiety przed menopauzą' },
            EXT.spep_upep,
            EXT.serum_iron,
            EXT.ttg_iga
          ]
        },
        { name: 'Markery przebudowy',
          tests: [
            EXT.ctx_p1np
          ]
        }
      ],
      guideline: 'IOF 2019 / NOF 2014 / PTOPiOO 2017'
    },

    rickets: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja',
            body: 'Krzywica — zaburzenie mineralizacji kości w okresie wzrostu (osteomalacja jest analogiem u dorosłych — po zakończeniu wzrostu i zamknięciu chrząstek wzrostowych). Najczęstsza przyczyna w Polsce: niedobór witaminy D u dzieci. Istnieją jednak liczne postacie OPORNE wymagające diagnostyki różnicowej — m.in. krzywica hipofosfatemiczna sprzężona z X (XLH), krzywice zależne od witaminy D (VDDR-1, VDDR-2), krzywica nerkowa (w CKD), onkogeniczna osteomalacja (u dorosłych). Wytyczne: Global Consensus 2016 (Munns i wsp.).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Obraz laboratoryjny krzywicy niedoborowej (z niedoboru witaminy D)',
            items: [
              { label: '25-OHD', text: 'ZNACZNIE OBNIŻONA (zwykle < 30 nmol/L) — kluczowy parametr potwierdzający niedoborowe tło.' },
              { label: '1,25(OH)2D', text: 'paradoksalnie często PRAWIDŁOWA lub PODWYŻSZONA — kompensacja indukowana wtórnie podwyższonym PTH (nie odzwierciedla statusu witaminy D w organizmie).' },
              { label: 'PTH', text: 'PODWYŻSZONE — wtórna nadczynność przytarczyc kompensacyjna do hipokalcemii.' },
              { label: 'Wapń', text: 'prawidłowy lub obniżony — początkowo utrzymywany przez kompensację PTH, później obniża się.' },
              { label: 'Fosfor', text: 'OBNIŻONY — fosfaturia indukowana podwyższonym PTH.' },
              { label: 'ALP (fosfataza alkaliczna)', text: 'ZNACZNIE PODWYŻSZONA — charakterystyczny marker remodelingu kości w krzywicy.' },
              { label: 'RTG nadgarstków/kolan', text: 'diagnostyczne — rozszerzenie nasad kości długich, frędzelkowanie, demineralizacja, paciorek pierśniowy (na żebrach).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Postacie oporne i różnicowanie',
            items: [
              {
                label: 'Krzywica hipofosfatemiczna sprzężona z X (XLH)',
                text: 'najczęstsza dziedziczna postać krzywicy opornej:',
                detail: [
                  'Mechanizm: mutacja w genie PHEX → wzrost FGF23 → fosfaturia → głęboka hipofosfatemia.',
                  'Obraz: fosfor głęboko obniżony, ALP znacznie podwyższona, 25-OHD prawidłowa, PTH prawidłowe lub łagodnie podwyższone.',
                  'OPORNA na standardową suplementację witaminą D — wymaga leczenia fosforem doustnym + aktywną witaminą D lub burosumabem (przeciwciało anty-FGF23).'
                ]
              },
              {
                label: 'Krzywica zależna od witaminy D typu 1 (VDDR-1)',
                text: 'defekt 1-α-hydroksylazy nerkowej (mutacja CYP27B1):',
                detail: [
                  '1,25(OH)2D NISKA mimo prawidłowej 25-OHD — brak konwersji do aktywnej postaci.',
                  'Wymaga substytucji aktywną witaminą D (kalcytriol, alfakalcydol), a nie cholekalcyferolem.'
                ]
              },
              {
                label: 'Krzywica zależna od witaminy D typu 2 (VDDR-2)',
                text: 'oporność receptora witaminy D (mutacja VDR):',
                detail: [
                  '1,25(OH)2D WYSOKA (brak hamowania ujemnym sprzężeniem) + ŁYSIENIE (charakterystyczne) — receptor obecny też w mieszkach włosowych.',
                  'Bardzo trudna do leczenia — wysokie dawki aktywnej witaminy D + wapń; czasem zmiany ustępują w wieku dorosłym.'
                ]
              },
              {
                label: 'Krzywica nerkowa (CKD-MBD)',
                text: 'w przewlekłej chorobie nerek — odrębny mechanizm:',
                detail: [
                  'Fosfor PODWYŻSZONY (odmiennie niż w krzywicy niedoborowej) — wskutek upośledzonej fosfaturii.',
                  'Wtórna nadczynność przytarczyc (PTH wysoki), 1,25(OH)2D niska (defekt nerkowej 1-α-hydroksylazy).',
                  'Leczenie wieloskładnikowe: kontrola fosforanów w diecie, chelatory fosforu, aktywna witamina D, kalcymimetyki.'
                ]
              },
              {
                label: 'Onkogeniczna osteomalacja (TIO) — u dorosłych',
                text: 'rzadki zespół paranowotworowy:',
                detail: [
                  'Guz mezenchymalny produkujący FGF23 (najczęściej małe, trudne do zlokalizowania guzy tkanek miękkich lub kości).',
                  'Fosfor głęboko obniżony, 1,25(OH)2D niska — podobnie jak w XLH, ale u dorosłych i ostro objawowo (bóle kostne, złamania, miopatia).',
                  'Leczenie przyczynowe — resekcja guza; do tego czasu suplementacja fosforem + aktywną witaminą D.'
                ]
              }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'vit_d_25oh' },
            { id: 'vit_d_1_25' },
            EXT.pth, EXT.ca_total, EXT.phosphorus, EXT.alp
          ]
        },
        { name: 'Postacie oporne',
          tests: [
            EXT.fgf23,
            EXT.egfr,
            EXT.chest_xray
          ]
        }
      ],
      guideline: 'Global Consensus 2016 (Munns i wsp.)'
    },

    granulomatous_disease: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Mechanizm hiperkalcemii w chorobach ziarniniakowych',
            body: 'Makrofagi ziarniniaka wykazują EKTOPOWĄ aktywność 1-α-hydroksylazy — niezależną od regulacji PTH i ujemnego sprzężenia zwrotnego. Prowadzi to do nadmiernej konwersji 25-OHD → 1,25(OH)2D. Wynika z tego paradoksalny obraz: 1,25(OH)2D PODWYŻSZONA mimo często prawidłowej lub obniżonej 25-OHD; hiperkalcemia; PTH ZAHAMOWANE (potwierdza, że hiperkalcemia jest PTH-niezależna). Suplementacja witaminą D u takich pacjentów może paradoksalnie pogłębić hiperkalcemię — wymaga ostrożności.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze choroby ziarniniakowe',
            items: [
              {
                label: 'Zakażeniowe',
                text: 'wymagają identyfikacji czynnika etiologicznego:',
                detail: [
                  'Gruźlica i inne mikobakteriozy — najczęstsza zakaźna przyczyna globalnie; istotna w diagnostyce różnicowej w Polsce.',
                  'Zakażenia grzybicze — histoplazmoza, kokcydioidomykoza, kryptokokoza (rzadkie w Polsce, częstsze przy podróżach lub immunosupresji).'
                ]
              },
              {
                label: 'Autoimmunologiczne i niezakaźne',
                text: 'najczęstsze w polskiej populacji:',
                detail: [
                  'Sarkoidoza — najczęstsza przyczyna ziarniniakowej hiperkalcemii w Polsce; ACE może być podwyższona (~50–80% przypadków), ale wynik jest NIESWOISTY — nie służy do potwierdzenia rozpoznania.',
                  'Granulomatoza z zapaleniem naczyń (GPA / dawniej Wegener) — rzadziej powoduje hiperkalcemię.'
                ]
              },
              {
                label: 'Onkologiczne',
                text: 'mechanizm analogiczny przez tkankę chłoniakową:',
                detail: [
                  'Chłoniaki — zwłaszcza Hodgkina, niektóre nie-Hodgkina; komórki chłoniakowe mogą wykazywać aktywność 1-α-hydroksylazy.',
                  'Rzadziej guzy lite z reakcją ziarniniakową w stromie.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Diagnostyka',
            items: [
              { label: '1,25(OH)2D — KLUCZOWY marker', text: 'PODWYŻSZONA — patognomoniczne dla hiperkalcemii ziarniniakowej; pozwala odróżnić od pierwotnej nadczynności przytarczyc.' },
              { label: '25-OHD', text: 'często prawidłowa lub obniżona — sama nie różnicuje od innych przyczyn.' },
              { label: 'Wapń całkowity (skorygowany o albuminę) i zjonizowany', text: 'podwyższony — potwierdzenie hiperkalcemii.' },
              { label: 'PTH', text: 'ZAHAMOWANE — potwierdza, że hiperkalcemia jest PTH-niezależna (różnicuje od pierwotnej nadczynności przytarczyc, w której PTH jest podwyższone).' },
              { label: 'ACE (konwertaza angiotensyny)', text: 'sarkoidoza — uzupełniająco; podwyższona w ~50–80%, ale NIESWOISTE; nie potwierdza ani nie wyklucza rozpoznania.' },
              { label: 'RTG i TK klatki piersiowej', text: 'wykrycie typowych zmian — powiększenie wnęk (limfadenopatia), zmiany śródmiąższowe (sarkoidoza); inne kierunki diagnostyczne — biopsja zmiany z badaniem histopatologicznym.' },
              { label: 'Konsultacja specjalistyczna', text: 'pulmonologiczna (sarkoidoza, gruźlica), reumatologiczna (GPA), hematologiczna (chłoniaki) — w zależności od kierunku diagnostycznego.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'vit_d_1_25', note: 'Paradoksalnie podwyższone' },
            { id: 'vit_d_25oh' },
            EXT.ca_total, EXT.pth, EXT.ace
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            EXT.chest_xray, EXT.chest_ct
          ]
        }
      ],
      guideline: 'ATS/ERS/WASOG 1999 (sarkoidoza) / aktualizacje'
    },

    malabsorption: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i obraz kliniczny',
            body: 'Zespół złego wchłaniania — upośledzenie wchłaniania substancji odżywczych w przewodzie pokarmowym. Klinicznie: biegunki tłuszczowe (steatorrhea — luźne, tłuste, cuchnące stolce), spadek masy ciała mimo zachowanego apetytu, niedobory makro- i mikroelementów (zwłaszcza witamin rozpuszczalnych w tłuszczach: A, D, E, K) oraz minerałów. U DZIECI dodatkowo: zahamowanie wzrostu, opóźnione dojrzewanie płciowe, niedokrwistość niedoborowa, opóźnienie rozwoju.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              {
                label: 'Choroby jelita cienkiego',
                text: 'najczęstsze przyczyny w populacji polskiej:',
                detail: [
                  'Celiakia — najczęstsza u dorosłych w Polsce; często niedoceniana; bywa pierwotnie rozpoznawana z powodu niedoboru wzrostu, niedokrwistości lub osteoporozy.',
                  'Choroba Crohna — z lokalizacją w jelicie cienkim (ileitis terminalis) lub po resekcji.',
                  'SIBO (zespół przerostu bakteryjnego jelita cienkiego) — niedobór B12, witamin rozpuszczalnych w tłuszczach.',
                  'Popromienne zapalenie jelit (po radioterapii miednicy).',
                  'Choroba Whipple\'a, sprue tropikalna — rzadziej.'
                ]
              },
              {
                label: 'Niewydolność trzustki egzokrynnej',
                text: 'upośledzone trawienie tłuszczów i białek:',
                detail: [
                  'Mukowiscydoza — najczęstsza przyczyna u dzieci.',
                  'Przewlekłe zapalenie trzustki (alkoholowe, autoimmunologiczne).',
                  'Stan po resekcjach trzustki.',
                  'Diagnostyka: elastaza trzustkowa w kale (< 200 μg/g — niewydolność).'
                ]
              },
              {
                label: 'Stan po operacjach',
                text: 'zmiany anatomiczne wpływające na wchłanianie:',
                detail: [
                  'Operacje bariatryczne — bypass żołądkowy (Roux-en-Y), sleeve gastrectomy.',
                  'Resekcje jelita krętego — niedobór B12 i kwasów żółciowych (biegunka cholertyczna).',
                  'Zespół krótkiego jelita po rozległych resekcjach.'
                ]
              },
              {
                label: 'Choroby wątroby i dróg żółciowych',
                text: 'upośledzenie wchłaniania tłuszczów i witamin rozpuszczalnych w tłuszczach:',
                detail: [
                  'Cholestaza (PBC — pierwotne zapalenie dróg żółciowych, PSC, cholestaza polekowa).',
                  'Marskość wątroby z niewydolnością.',
                  'Zaburzenia syntezy kwasów żółciowych.'
                ]
              }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Panel diagnostyki różnicowej',
            items: [
              { label: 'Witamina D 25-OH', text: 'niedobór typowy w zespołach złego wchłaniania (zwłaszcza tłuszczowego).' },
              { label: 'Morfologia + ferrytyna + Fe + TIBC', text: 'niedokrwistość z niedoboru żelaza — częsta przy celiakii, NChZJ, SIBO.' },
              { label: 'Witamina B12', text: 'niedobór po resekcji jelita krętego, w SIBO, atroficznym zapaleniu żołądka, chorobie Crohna.' },
              { label: 'Wapń + ALP + albumina', text: 'metabolizm wapnia (niedobór witaminy D → hipokalcemia) i ocena białek (albumina jako marker odżywienia).' },
              { label: 'Celiakia — przesiew', text: 'anty-tTG IgA + IgA całkowite (wykluczenie niedoboru IgA, który fałszuje wynik); EMA przy pogłębionej diagnostyce.' },
              { label: 'Konsultacja gastroenterologiczna', text: 'endoskopia + biopsja jelita cienkiego (potwierdzenie celiakii — kryteria Marsha); elastaza trzustkowa w kale (niewydolność trzustki); testy oddechowe SIBO; badania obrazowe (USG, MR-enterografia).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'vit_d_25oh' },
            EXT.cbc, EXT.ferritin,
            EXT.vit_b12,
            EXT.ca_total, EXT.alp, EXT.albumin
          ]
        },
        { name: 'Celiakia',
          tests: [
            EXT.iga_total, EXT.ttg_iga, EXT.ema
          ]
        }
      ],
      guideline: 'ESPGHAN 2020 / AGA 2023'
    },

    /* ═══════════════════════════════════════════════════════════════
     *  INNE
     * ═══════════════════════════════════════════════════════════════ */

    hypertension: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst',
            body: 'Nadciśnienie tętnicze jest typowo PIERWOTNE (~90–95% przypadków). Diagnostyka wtórnych przyczyn endokrynologicznych jest wskazana w wybranej grupie pacjentów ze zwiększonym prawdopodobieństwem wtórnej etiologii (~5–10%). Identyfikacja przyczyny wtórnej może prowadzić do WYLECZENIA (np. operacyjne — pheochromocytoma, jednostronny gruczolak Conn) lub znaczącej poprawy kontroli ciśnienia (leczenie celowane MRA, leczenie zespołu Cushinga).'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Wskazania do diagnostyki wtórnej (ESC/ESH 2023 / PTNT 2019)',
            items: [
              { label: 'Nadciśnienie OPORNE', text: '≥ 3 leki w pełnych dawkach, w tym diuretyk; klasyczne wskazanie do skriningu PHA.' },
              { label: 'Nadciśnienie u młodych', text: '< 40 lat — wczesne nadciśnienie wymaga wykluczenia przyczyn wtórnych.' },
              { label: 'Nadciśnienie z hipokaliemią', text: 'jawną lub indukowaną diuretykami — silny wskaźnik PHA.' },
              { label: 'Nadciśnienie ciężkie lub gwałtowny początek', text: '≥ 180/110 mmHg; szybki wzrost ciśnienia bez czynników usposabiających.' },
              { label: 'Incidentaloma nadnercza + nadciśnienie', text: 'ocena czynności hormonalnej guza nadnercza.' },
              { label: 'Cechy specyficznych zespołów endokrynologicznych', text: 'cushingoidalne (rozstępy, twarz księżycowata), akromegaliczne (powiększenie rąk/stóp, prognatyzm), przełomy hiperergiczne (pheochromocytoma).' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Endokrynologiczne przyczyny wtórnego nadciśnienia',
            items: [
              {
                label: 'Pierwotny hiperaldosteronizm (PHA) — najczęstsza endokrynna przyczyna',
                text: 'odpowiada za ~5–10% HT ogółem i ~20% opornego:',
                detail: [
                  'Skrining: aldosteron + PRA/DRC + obliczenie ARR (stosunek aldosteron/renina).',
                  'Warunki pobrania: rano, pacjent na nogach ≥ 2 h, wyrównanie kaliemii > 4,0 mmol/L, odstawienie MRA 4–6 tyg.',
                  'Potwierdzenie: test obciążenia solą lub fludrokortyzonowy.',
                  'Lokalizacja: TK nadnerczy + AVS (cewnikowanie żył nadnerczowych) — różnicuje jednostronny gruczolak Conn (leczenie chirurgiczne) od obustronnego przerostu BAH (leczenie MRA). Osobne wskazanie.'
                ]
              },
              {
                label: 'Pheochromocytoma / paraganglioma',
                text: 'guz produkujący katecholaminy:',
                detail: [
                  'Klasyczna triada: bóle głowy, kołatania serca, poty + przełomy nadciśnieniowe (paroksyzmalne lub utrzymujące się).',
                  'Skrining biochemiczny: WOLNE metoksykatecholaminy (metanefryny) w osoczu LUB frakcjonowane metanefryny w DZM — wysoka czułość.',
                  'Po potwierdzeniu biochemicznym: lokalizacja (TK/MRI nadnerczy + jamy brzusznej; scyntygrafia MIBG lub ⁶⁸Ga-DOTATATE PET przy podejrzeniu paraganglioma).',
                  'Przed operacją obowiązkowa blokada α-adrenergiczna (fenoksybenzamina, doksazosyna) 10–14 dni — zapobieganie przełomowi okołooperacyjnemu.'
                ]
              },
              { label: 'Zespół Cushinga', text: 'DST 1 mg + kortyzol w DZM lub ślinie nocnej — TYLKO przy stigmatach cushingoidalnych; rutynowy skrining nie jest zalecany. Pełny algorytm w osobnym wskazaniu.' },
              { label: 'Akromegalia', text: 'IGF-1 wg norm dla wieku; przy podwyższonym IGF-1 → oGTT z pomiarem GH (brak supresji < 1 μg/L potwierdza). Nadciśnienie występuje u znacznej części pacjentów z akromegalią.' },
              { label: 'Dysfunkcja tarczycy', text: 'TSH — nadczynność daje skurczowe NT z szeroką ampiulą tętna; niedoczynność daje rozkurczowe NT z wąską amplitudą.' },
              { label: 'Pierwotna nadczynność przytarczyc', text: 'PTH + wapń skorygowany — częsta asocjacja z nadciśnieniem; mechanizm wieloczynnikowy (hiperkalcemia, wpływ na endotelium).' },
              { label: 'WPN z niedoboru 11β-OH lub 17α-OH', text: 'rzadkie postaci WPN dają nadciśnienie + cechy płciowe (wirylizacja lub brak rozwoju); 11-deoksykortyzol lub kortykosteron podwyższone.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Wtórne przyczyny endokrynne',
          tests: [
            { id: 'aldosterone' }, EXT.pra_pac, EXT.arr,
            { id: 'cortisol', note: 'Po 1 mg DST' },
            EXT.metanephrines_plasma, EXT.metanephrines_urine,
            { id: 'tsh' },
            { id: 'igf1', note: 'Akromegalia' }
          ]
        },
        { name: 'Obrazowanie',
          tests: [
            EXT.adrenal_ct
          ]
        }
      ],
      guideline: 'ESC/ESH 2023 / PTNT 2019'
    },

    hypokalemia: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i objawy',
            body: 'Hipokaliemia — stężenie potasu w surowicy < 3,5 mmol/L; klinicznie istotna od < 3,0 mmol/L. Objawy: osłabienie mięśniowe (zwłaszcza kończyn dolnych), zaburzenia rytmu serca (szczególnie przy współistniejącej hipomagnezemii — np. torsade de pointes), parestezje, niedrożność porażenna jelit, w ciężkich przypadkach (< 2,5 mmol/L) porażenia mięśni i niewydolność oddechowa. EKG: spłaszczenie/odwrócenie załamka T, obecność fali U, wydłużenie QT.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Najczęstsze przyczyny',
            items: [
              { label: 'Utrata jelitowa', text: 'biegunki (najczęstsza przyczyna ostrej hipokaliemii), wymioty (poprzez alkalozę i wtórny hiperaldosteronizm), nadużywanie środków przeczyszczających, przetoki jelitowe.' },
              {
                label: 'Utrata nerkowa',
                text: 'najczęstsza przewlekła przyczyna:',
                detail: [
                  'Diuretyki pętlowe (furosemid) i tiazydowe — NAJCZĘSTSZA jatrogenna przyczyna utraty nerkowej.',
                  'Kwasica cewkowa nerkowa (RTA) — zwłaszcza typ 1 (dystalna).',
                  'Zespół Bartera (mutacje pętli Henlego — naśladuje diuretyki pętlowe).',
                  'Zespół Gitelmana (mutacje cewki dystalnej — naśladuje tiazydy).'
                ]
              },
              {
                label: 'Endokrynologiczne',
                text: 'wymagają wykluczenia po przyczynach nerkowych/jelitowych:',
                detail: [
                  'Pierwotny hiperaldosteronizm (PHA) — nadmiar aldosteronu → wzmożone wydalanie K przez nerki; osobne wskazanie.',
                  'Zespół Cushinga — wysokie stężenia kortyzolu mogą działać mineralokortykoidowo (zwłaszcza w ektopowym ACTH lub ACC).',
                  'Glikokortykosteroidy egzogenne w dużych dawkach.',
                  'Lukrecja (kwas glicyrrynowy) — hamuje 11β-HSD2 → kortyzol działa na receptor mineralokortykoidowy → pseudohiperaldosteronizm (renina i aldosteron NISKIE).'
                ]
              },
              {
                label: 'Redystrybucja wewnątrzkomórkowa',
                text: 'potas przemieszcza się do komórek bez utraty z organizmu:',
                detail: [
                  'Insulinoterapia (zwłaszcza w leczeniu DKA — pilna substytucja K obowiązkowa).',
                  'β2-agoniści (salbutamol, formoterol).',
                  'Alkaloza metaboliczna lub oddechowa.',
                  'Paraliż okresowy hipokaliemiczny (rodzinny lub w tyreotoksykozie — częstszy u Azjatów).'
                ]
              },
              { label: 'Niedostateczna podaż w diecie', text: 'rzadko izolowana przyczyna ciężkiej hipokaliemii — wymaga współistniejącej utraty.' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Algorytm diagnostyczny — gdy wykluczono przyczyny nerkowe/jelitowe',
            items: [
              { label: 'Potas + sód + panel biochemiczny + MAGNEZ', text: 'magnez często towarzysząco obniżony — hipomagnezemia UTRWALA hipokaliemię (substytucja samego K bez wyrównania Mg jest nieskuteczna).' },
              { label: 'Aldosteron + PRA/DRC + ARR', text: 'wykluczenie pierwotnego hiperaldosteronizmu; warunki pobrania jak w osobnym wskazaniu PHA.' },
              { label: 'DST 1 mg', text: 'przy cechach cushingoidalnych (rozstępy purpurowe, twarz księżycowata, otyłość brzuszna, miopatia, oporne nadciśnienie).' },
              { label: 'Wzorzec różnicujący — pseudohiperaldosteronizm', text: 'renina NISKA + aldosteron NISKI + hipokaliemia → wykluczyć lukrecję (przewlekłe spożycie produktów z kwasem glicyrrynowym — niektóre cukierki, herbatki ziołowe) lub ektopową produkcję steroidów o aktywności mineralokortykoidowej.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            EXT.potassium, EXT.sodium, EXT.cmp,
            { id: 'aldosterone' }, EXT.pra_pac, EXT.arr,
            { id: 'cortisol' }
          ]
        }
      ],
      guideline: 'KDIGO 2024'
    },

    obesity: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst',
            body: 'Otyłość — BMI ≥ 30 kg/m²; nadwaga — BMI 25–30. Endokrynologiczne przyczyny otyłości to < 1% przypadków (przede wszystkim niedoczynność tarczycy, rzadziej zespół Cushinga, GHD dorosłych, hipogonadyzm wtórny), ale KAŻDY pacjent z otyłością zasługuje na MINIMALNY skrining endokrynologiczny oraz pełną ocenę chorób towarzyszących i powikłań metabolicznych — ryzyko cukrzycy, MASLD, dyslipidemii i powikłań sercowo-naczyniowych jest znacznie zwiększone.'
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Skrining endokrynologiczny',
            items: [
              { label: 'Niedoczynność tarczycy — TSH + fT4', text: 'NAJCZĘSTSZA endokrynna przyczyna otyłości, choć efekt na masę ciała zwykle umiarkowany (2–5 kg); subkliniczna niedoczynność tarczycy zwykle nie tłumaczy otyłości znacznego stopnia.' },
              { label: 'Zespół Cushinga — DST 1 mg', text: 'TYLKO przy stigmatach cushingoidalnych (rozstępy purpurowe > 1 cm, twarz księżycowata, otyłość brzuszna nieproporcjonalna, miopatia proksymalna, oporne nadciśnienie). Rutynowy skrining Cushinga u wszystkich z otyłością NIE jest zalecany.' },
              { label: 'GHD dorosłych — IGF-1', text: 'przy podejrzeniu klinicznym (zmiana składu ciała na rzecz tkanki tłuszczowej trzewnej, obniżona jakość życia, dyslipidemia oporna na leczenie); szczególnie u pacjentów po leczeniu gruczolaka przysadki, po RT okolicy CSN.' },
              { label: 'Wtórny hipogonadyzm u mężczyzn z otyłością', text: 'testosteron całkowity rano; mechanizm: otyłość → spadek SHBG (insulinooporność) → spadek T całkowitego; często odwracalny po redukcji masy ciała. Rozważyć osobne wskazanie hipogonadyzm męski.' },
              { label: 'Witamina D 25-OH', text: 'niedobór częsty w otyłości (sekwestracja w tkance tłuszczowej, mniejsza ekspozycja słoneczna); suplementacja zalecana zgodnie z konsensusem Polskim 2023.' }
            ]
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Ocena metaboliczna i powikłania',
            items: [
              { label: 'Glukoza na czczo + HbA1c + oGTT 75 g', text: 'skrining cukrzycy typu 2 i nieprawidłowej tolerancji glukozy (IGT); oGTT preferowany do wczesnego wykrywania zaburzeń u osób z grupy ryzyka.' },
              { label: 'Insulina + HOMA-IR', text: 'ocena insulinooporności (HOMA-IR > 2,5); insulinooporność jest mechanizmem patofizjologicznym łączącym otyłość z powikłaniami metabolicznymi.' },
              { label: 'Lipidogram (TC, LDL, HDL, TG)', text: 'dyslipidemia aterogenna — typowo ↑ TG, ↓ HDL, drobne gęste LDL.' },
              { label: 'Próby wątrobowe (ALAT, ASPAT, GGTP)', text: 'skrining MASLD/NAFLD (niealkoholowa stłuszczeniowa choroba wątroby); występuje u znacznego odsetka pacjentów z otyłością.' },
              { label: 'CRP', text: 'przewlekły stan zapalny niskiego stopnia — komponent otyłości; podwyższone CRP wiąże się ze zwiększonym ryzykiem sercowo-naczyniowym.' },
              { label: 'Ocena ryzyka sercowo-naczyniowego', text: 'ciśnienie tętnicze, kalkulatory ryzyka (Pol-SCORE2); ryzyko CV znacznie podwyższone w otyłości — ocena celów lipidowych i wskazań do leczenia.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Skrining endokrynologiczny',
          tests: [
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'cortisol', note: 'Po 1 mg DST tylko jeśli stigmaty Cushinga' },
            { id: 'igf1', note: 'Wykluczenie GHD u dorosłych' },
            { id: 'testosterone_total', note: 'Mężczyźni — wtórny hipogonadyzm' },
            { id: 'vit_d_25oh' }
          ]
        },
        { name: 'Metabolizm',
          tests: [
            EXT.glucose_fasting, EXT.hba1c, EXT.ogtt_75g, EXT.insulin,
            EXT.lipid_panel, EXT.liver,
            EXT.crp
          ]
        }
      ],
      guideline: 'Endocrine Society 2015 (Apovian i wsp.) / PTBO 2022'
    },

    metabolic_syndrome: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja kliniczna',
            body: 'Zespół metaboliczny rozpoznawany KLINICZNIE wg kryteriów NCEP-ATP III 2005 lub IDF 2009 — istotnie zwiększa ryzyko cukrzycy typu 2 i powikłań sercowo-naczyniowych. Patofizjologicznie centralna jest INSULINOOPORNOŚĆ i otyłość trzewna. Diagnostyka wymaga pomiarów antropometrycznych (obwód talii — wskaźnik otyłości trzewnej) oraz badań biochemicznych (glukoza, lipidogram). Rozpoznanie zespołu metabolicznego jest sygnałem do intensywnej modyfikacji stylu życia i indywidualnej oceny ryzyka sercowo-naczyniowego.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'Kryteria rozpoznania (≥ 3 z 5)',
            items: [
              { label: 'Otyłość brzuszna (obwód talii)', text: '≥ 102 cm (M) / ≥ 88 cm (K) wg NCEP-ATP III; IDF stosuje kryteria etniczne — dla Europoidów ≥ 94 cm (M) / ≥ 80 cm (K).' },
              { label: 'Trójglicerydy ≥ 150 mg/dL', text: '(1,7 mmol/L) lub farmakoterapia hipertriglicerydemii.' },
              { label: 'HDL niski', text: '< 40 mg/dL (1,0 mmol/L) u mężczyzn; < 50 mg/dL (1,3 mmol/L) u kobiet; lub farmakoterapia dyslipidemii.' },
              { label: 'Ciśnienie tętnicze ≥ 130/85 mmHg', text: 'lub farmakoterapia nadciśnienia.' },
              { label: 'Glukoza na czczo ≥ 100 mg/dL', text: '(5,6 mmol/L) lub farmakoterapia cukrzycy/IGT.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Diagnostyka endokrynologiczno-metaboliczna',
            items: [
              {
                label: 'Gospodarka węglowodanowa',
                text: 'insulinooporność jest mechanizmem patofizjologicznym:',
                detail: [
                  'Glukoza na czczo — podstawowy parametr (≥ 100 mg/dL = nieprawidłowa glikemia na czczo IFG; ≥ 126 = cukrzyca).',
                  'oGTT 75 g — preferowany do wczesnego wykrywania nieprawidłowej tolerancji glukozy (IGT) i wczesnej cukrzycy; bardziej czuły niż HbA1c.',
                  'HbA1c — średnia glikemia ostatnich 2–3 miesięcy; stan przedcukrzycowy 5,7–6,4%; cukrzyca ≥ 6,5%.',
                  'Insulina + HOMA-IR — ocena insulinooporności (HOMA-IR > 2,5); bezpośredni marker patofizjologii zespołu.'
                ]
              },
              { label: 'Lipidogram (TC, LDL, HDL, TG)', text: 'dyslipidemia aterogenna: ↑ trójglicerydy, ↓ HDL, drobne gęste LDL; obliczenie non-HDL cholesterolu (TC − HDL) jest dodatkowym markerem ryzyka CV.' },
              {
                label: 'Markery hormonalne u mężczyzn',
                text: 'specyficzne dla zespołu metabolicznego u mężczyzn:',
                detail: [
                  'SHBG NISKA — wczesny marker insulinooporności (insulina hamuje syntezę wątrobową SHBG); może wyprzedzać rozwój pełnoobjawowego zespołu metabolicznego.',
                  'Testosteron całkowity NISKI — częsty w zespole metabolicznym; mechanizm dwukierunkowy: otyłość → hipogonadyzm wtórny, ale hipogonadyzm również nasila otyłość.',
                  'Rozważyć osobne wskazanie hipogonadyzm męski przy ocenie testosteronoterapii.'
                ]
              },
              { label: 'Próby wątrobowe (ALAT, ASPAT, GGTP)', text: 'MASLD/NAFLD (niealkoholowa stłuszczeniowa choroba wątroby) jest hepatologiczną manifestacją zespołu metabolicznego — dotyczy ~40% pacjentów. Podwyższenie ALAT zwykle przewyższa ASPAT; przy znacznym wzroście — diagnostyka różnicowa z MASH/NASH.' }
            ]
          }
        ]
      },
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            EXT.glucose_fasting, EXT.hba1c, EXT.ogtt_75g,
            EXT.lipid_panel,
            EXT.insulin,
            { id: 'shbg', note: 'Niski w insulinooporności' },
            { id: 'testosterone_total', note: 'Niski w mtb. syndrome (mężczyźni)' },
            EXT.liver
          ]
        }
      ],
      guideline: 'NCEP-ATP III 2005 / IDF 2009'
    },

    ckd: {
      summary: {
        sections: [
          {
            kind: 'prose',
            icon: 'book-2',
            title: 'Definicja i kontekst CKD-MBD',
            body: 'Przewlekła choroba nerek (CKD — Chronic Kidney Disease) w stadium G3+ (eGFR < 60 mL/min/1,73 m²) prowadzi do zaburzeń metabolizmu wapniowo-fosforanowego — zespołu CKD-MBD (Chronic Kidney Disease-Mineral and Bone Disorder). Mechanizm: upośledzona aktywacja witaminy D w nerkach (spadek aktywności 1-α-hydroksylazy) → spadek 1,25(OH)2D → hipokalcemia → WTÓRNA nadczynność przytarczyc → osteodystrofia nerkowa, retencja fosforu i przebudowa naczyniowa. Postępowanie wg wytycznych KDIGO CKD-MBD 2017.'
          },
          {
            kind: 'list',
            icon: 'tags',
            title: 'CKD-MBD — parametry monitorowania (KDIGO 2017)',
            items: [
              { label: 'Wapń całkowity i zjonizowany', text: 'początkowo prawidłowy lub niski (hipokalcemia z niedoboru kalcytriolu); w późnym CKD może być WYSOKI w wyniku rozwoju autonomicznej (trzeciorzędowej) nadczynności przytarczyc.' },
              { label: 'Fosfor — PODWYŻSZONY', text: 'odmiennie niż w krzywicy niedoborowej — upośledzona fosfaturia w niewydolnych nerkach prowadzi do retencji fosforu (najwyraźniej od stadium G4).' },
              { label: 'PTH — WYSOKI (wtórna nadczynność przytarczyc)', text: 'cel terapeutyczny zależy od stadium CKD i metody leczenia nerkozastępczego; u dializowanych zwykle 2–9× górnej granicy normy (zachowanie kompensacji bez tertiary hyperPTH).' },
              { label: '25-OHD', text: 'często obniżona — suplementacja zalecana (cholekalcyferol) niezależnie od stadium CKD.' },
              { label: '1,25(OH)2D — OBNIŻONA', text: 'defekt nerkowej 1-α-hydroksylazy; suplementacja aktywną witaminą D (kalcytriol, alfakalcydol) lub analogami (parikalcytol) w zaawansowanym CKD.' },
              { label: 'ALP (fosfataza alkaliczna)', text: 'marker przebudowy kostnej — pomocniczy do monitorowania osteodystrofii nerkowej; znacznie podwyższona w wysokoobrotowej postaci.' },
              { label: 'FGF23 — WZRASTA WCZEŚNIE', text: 'wzrasta przed wzrostem PTH; wczesny marker CKD-MBD; podwyższenie FGF23 wiąże się ze zwiększoną śmiertelnością sercowo-naczyniową w CKD.' }
            ]
          },
          {
            kind: 'list',
            icon: 'list-search',
            title: 'Ocena funkcji nerek i powikłań',
            items: [
              {
                label: 'eGFR (CKD-EPI) — klasyfikacja stadiów',
                text: 'wg KDIGO 2012:',
                detail: [
                  'G1: ≥ 90 mL/min/1,73 m² (prawidłowy lub wysoki — z białkomoczem lub markerami uszkodzenia).',
                  'G2: 60–89 (łagodnie obniżony).',
                  'G3a: 45–59; G3b: 30–44 (umiarkowanie obniżony — wymagane monitorowanie CKD-MBD).',
                  'G4: 15–29 (znacznie obniżony — przygotowanie do leczenia nerkozastępczego).',
                  'G5: < 15 (niewydolność końcowa — dializy lub transplantacja).',
                  'Ocena dodatkowa: albuminuria A1 (< 30 mg/g), A2 (30–300), A3 (> 300) — istotny niezależny czynnik prognostyczny.'
                ]
              },
              { label: 'Niedokrwistość nerkowa — morfologia krwi', text: 'niedobór erytropoetyny (EPO) — przy eGFR < 30 zwykle istotna; może wymagać leczenia czynnikami stymulującymi erytropoezę (ESA) oraz substytucji żelaza; cel Hb 100–115 g/L.' },
              { label: 'CRP', text: 'przewlekły stan zapalny niskiego stopnia w CKD — niezależny czynnik ryzyka sercowo-naczyniowego.' },
              { label: 'Bilans płynowo-elektrolitowy', text: 'Na, K (hiperkaliemia w zaawansowanym CKD — wskazanie do diuretyków pętlowych, kayexalate, ostrożność z ACEI/ARB/MRA); równowaga kwasowo-zasadowa (kwasica metaboliczna w CKD G4–G5 — suplementacja wodorowęglanami).' }
            ]
          }
        ]
      },
      sections: [
        { name: 'CKD-MBD (mineral & bone disorder)',
          tests: [
            { id: 'vit_d_25oh' },
            { id: 'vit_d_1_25', note: 'Niskie — niedobór ektopowy w CKD' },
            EXT.pth, EXT.ca_total, EXT.phosphorus, EXT.alp,
            EXT.fgf23
          ]
        },
        { name: 'Funkcja nerek',
          tests: [
            EXT.egfr, EXT.cbc,
            EXT.crp
          ]
        }
      ],
      guideline: 'KDIGO CKD-MBD 2017'
    }
  };

  // ────────────────────────────────────────────────────────────────
  //  Publiczny API
  // ────────────────────────────────────────────────────────────────

  function get(indicationId) {
    if (!indicationId) return null;
    return DATA[indicationId] || null;
  }
  function has(indicationId) {
    return !!DATA[indicationId];
  }
  function allInternalIds() {
    var set = {};
    Object.keys(DATA).forEach(function (key) {
      var panel = DATA[key];
      if (!panel || !Array.isArray(panel.sections)) return;
      panel.sections.forEach(function (sec) {
        if (!Array.isArray(sec.tests)) return;
        sec.tests.forEach(function (t) {
          if (t && t.id) set[t.id] = true;
        });
      });
    });
    return Object.keys(set);
  }

  global.LabClinicalPanels = {
    data: DATA,
    get: get,
    has: has,
    allInternalIds: allInternalIds,
    version: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LabClinicalPanels;
  }
})(typeof window !== 'undefined' ? window : this);
