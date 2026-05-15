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
    itt:        { ext: 'itt',        label: 'Test insulinotolerancyjny (ITT)', note: 'Złoty standard GHD u dorosłych; przeciwwskazania: CHD, padaczka' },
    ghrh_arg:   { ext: 'ghrh_arg',   label: 'Test GHRH + arginina',    note: 'Alternatywa ITT u dorosłych' },
    glucagon_test: { ext: 'glucagon_test', label: 'Test glukagonowy', note: 'Alternatywa ITT u dzieci i dorosłych' },
    clonidine_test: { ext: 'clonidine_test', label: 'Test klonidynowy', note: 'Stymulacja GH u dzieci' },
    ogtt_gh:    { ext: 'ogtt_gh',    label: 'oGTT z GH (75 g)',        note: 'Diagnostyka akromegalii: brak supresji GH < 1 μg/L' },
    bone_age:   { ext: 'bone_age',   label: 'RTG wieku kostnego (Greulich-Pyle)', note: 'Niedobór wzrostu, opóźnione/przedwczesne dojrzewanie' },
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
      summary: 'Algorytm 2-stopniowy. PAI (pierwotna niedoczynność kory nadnerczy) — uszkodzenie na poziomie nadnerczy; SAI (wtórna niedoczynność kory nadnerczy) — niedobór ACTH przysadkowego. Pierwszy krok: kortyzol poranny + ACTH + elektrolity. Potwierdzenie testem stymulacji Synacthen. W Polsce ~70–80% PAI to autoimmunologiczna choroba Addisona. Jeśli kortyzol ↓ + ACTH norma/niskie → podejrzenie SAI — kolejny krok to ocena reszty osi przysadkowej (TSH/fT4, PRL, LH/FSH, IGF-1, MRI przysadki).',
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
      summary: 'Zespół Cushinga — hiperkortyzolemia o różnej etiologii. ACTH-zależny (~80%): centralny (gruczolak przysadki — choroba Cushinga, ~70%), ektopowy (drobnokomórkowy rak płuca, rakowiak, ~10%). ACTH-niezależny (~20%): gruczolak nadnercza (~10%), rak kory nadnercza (ACC, ~8%), przerost obu nadnerczy. Algorytm 3-stopniowy: skrining (≥ 2 dodatnie z 3 testów: test hamowania 1 mg deksametazonu, kortyzol w DZM, kortyzol w ślinie nocnej) → potwierdzenie → różnicowanie etiologii. Po potwierdzeniu autonomii — oznaczenie ACTH różnicuje formę ACTH-zależną od niezależnej.',
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
      summary: 'Wrodzony Przerost Nadnerczy (WPN) — w ~95% niedobór 21-hydroksylazy (CYP21A2). Postaci kliniczne: klasyczna z utratą soli (~75% klasycznej; noworodek z odwodnieniem, hiperkaliemią, hiponatremią), postać prosta wirylizująca (~25% klasycznej; dziewczynka z wirylizacją lub chłopak z przedwczesnym pokwitaniem rzekomym), postać nieklasyczna (NCAH, późnoujawniająca się — kobieta dorosła z hiperandrogenizmem / PCOS / niepłodnością). Algorytm zależy od kontekstu: (1) noworodek — skrining bibułowy 17-OHP (powszechnie w Polsce od 2018 r.); (2) dziecko / dorosły — 17-OHP rano + profil androgenowy + ACTH; (3) gdy 17-OHP niejednoznaczne — test stymulacji ACTH. Pozostałe niedobory enzymatyczne (11β-OH, 3β-HSD, 17α-OH) rzadkie — diagnostyka rozszerzona dopiero przy podejrzeniu (sytuacje szczególne).',
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
      summary: 'Skrining wskazany w wybranej grupie: nadciśnienie z hipokaliemią, oporne nadciśnienie (≥ 3 leki w pełnych dawkach, w tym diuretyk), nadciśnienie ciężkie (≥ 160/100), nadciśnienie u młodych (< 40 lat), incidentaloma nadnercza + nadciśnienie, nadciśnienie + bezdech senny, dodatni wywiad rodzinny w kierunku PHA. W Polsce skrining wykonywany u ~1% pacjentów z nadciśnieniem, choć PHA odpowiada za ~5–10% nadciśnienia ogółem i ~20% opornego. Algorytm 3-stopniowy: skrining (ARR) → potwierdzenie (test obciążenia solą) → lokalizacja (TK + AVS).',
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
      summary: 'Każdy incidentaloma > 1 cm wymaga oceny czynności hormonalnej oraz oceny ryzyka złośliwości. Skrining obowiązkowy: subkliniczny zespół Cushinga (test 1 mg DST) + pheochromocytoma (wolne metoksykatecholaminy w osoczu lub alternatywnie frakcjonowane metanefryny w DZM). Skrining warunkowy: hiperaldosteronizm — gdy nadciśnienie lub hipokaliemia; profil androgenowy / CAH — gdy wirylizacja u kobiet. Obrazowanie: TK nadnerczy bez kontrastu (faza natywna) jako badanie pierwszego rzutu; MRI z sekwencjami chemical-shift jako drugi rzut przy niejednoznacznym TK, przeciwwskazaniach do kontrastu jodowego lub u dzieci.',
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
      summary: 'Hirsutyzm to nadmierne owłosienie typu męskiego u kobiety (włosy terminalne w obszarach androgenozależnych). Ocena: skala Ferrimana-Gallwaya (mFG) > 8 punktów u kobiet rasy białej; > 6 u Azjatek. Najczęstsze przyczyny: PCOS (~70–80%), hirsutyzm idiopatyczny (~10–15%), NCAH (~3–5%); rzadziej zespół Cushinga, hiperprolaktynemia, guz androgenny, hirsutyzm jatrogenny (sterydy, walproinian, danazol). Wskazania do diagnostyki hormonalnej: hirsutyzm umiarkowany/ciężki (mFG > 8), szybkie narastanie objawów, cechy wirylizacji (klitoromegalia, łysienie typu męskiego, obniżenie głosu), zaburzenia miesiączki. UWAGA: cechy wirylizacji + szybki początek objawów → pilne wykluczenie guza androgennego (DHEA-S, testosteron całkowity).',
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
      summary: 'Zespół policystycznych jajników (PCOS) — najczęstsza endokrynopatia u kobiet w wieku rozrodczym (~10–15%). Kryteria Rotterdam 2003 wymagają 2 z 3: (1) oligo-/anowulacja; (2) kliniczny (hirsutyzm, trądzik, łysienie typu męskiego) lub biochemiczny hiperandrogenizm; (3) obraz polycystic w USG (≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL — aktualizacja 2018). Diagnostyka wymaga wykluczenia innych przyczyn: niedoczynności tarczycy, hiperprolaktynemii, NCAH, zespołu Cushinga. Międzynarodowy konsensus 2018/2023 (Teede): u każdej pacjentki z PCOS OBOWIĄZKOWA ocena metaboliczna ze względu na zwiększone ryzyko cukrzycy typu 2 (~2–4×), zespołu metabolicznego, niealkoholowej stłuszczeniowej choroby wątroby (NAFLD) i powikłań sercowo-naczyniowych.',
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
        { name: 'Ocena metaboliczna (OBOWIĄZKOWA u każdej pacjentki z PCOS)',
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
      summary: 'Wirylizacja u dorosłej kobiety — obecność cech męskich (klitoromegalia, rozległe łysienie typu męskiego, pogłębienie głosu, zanik piersi, rozwój masy mięśniowej typu męskiego). UWAGA: szybko narastająca wirylizacja → silne podejrzenie guza androgennego (jajnika lub nadnercza), wymaga PILNEJ diagnostyki obrazowej. Najczęstsze przyczyny: guzy z komórek Sertoliego-Leydiga (SLCT), hilus cell tumor (guz z komórek Leydiga), gruczolak androgenny nadnercza, rak kory nadnercza (ACC), klasyczny WPN późno rozpoznany, hipertekoza jajnikowa. Wstępna diagnostyka: (1) profil androgenowy z naciskiem na testosteron całkowity (> 7 nmol/L → guz) i DHEA-S (> 18,9 μmol/L → guz nadnercza); (2) obrazowanie pilne (USG narządów rodnych + TK nadnerczy wielofazowe z kontrastem); (3) wykluczenie zespołu Cushinga nadnerczowego przy współistnieniu cech cushingoidalnych. Przed diagnostyką OBOWIĄZKOWY szczegółowy wywiad lekowy: sterydy anaboliczno-androgenne, testosteron egzogenny, danazol, niektóre starsze progestageny o działaniu androgennym (np. noretysteron).',
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
      summary: 'Niedobór 5α-reduktazy typu 2 — autosomalna recesywna choroba (mutacja SRD5A2), powodująca niedobór konwersji testosteronu w DHT (najsilniejszy androgen) w skórze i zewnętrznych narządach płciowych. Klinika u 46,XY: noworodek z niejednoznacznymi narządami płciowymi (spodziectwo, mikropenis) lub fenotypem żeńskim przy obecnych jądrach; w okresie dojrzewania częściowa wirylizacja (głos, libido, masa mięśniowa), ale brak rozwoju zarostu i prącia. Algorytm: (1) kariotyp — potwierdzenie 46,XY; (2) profil androgenowy bazalny (testosteron, DHT, stosunek T/DHT); (3) test stymulacji hCG przy wątpliwym wyniku bazalnym; (4) genetyka SRD5A2 — definitywne potwierdzenie. Diagnostyka różnicowa: zespół niewrażliwości na androgeny (AIS — oporność receptora androgenowego mimo prawidłowych lub podwyższonych stężeń testosteronu i DHT, mutacja genu AR), niedobór syntezy testosteronu (różne enzymy steroidogenezy nadnerczowo-gonadowej).',
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
      summary: 'Zaburzenia różnicowania płci (DSD) — wrodzone stany z nietypowym rozwojem płci chromosomalnej, gonadalnej lub anatomicznej. Najczęstsza sytuacja: noworodek z niejednoznacznymi zewnętrznymi narządami płciowymi (skala Prader 2–4). Wymaga PILNEJ diagnostyki multidyscyplinarnej (endokrynolog pediatryczny + genetyk + chirurg + psycholog + neonatolog) — kierowanie do ośrodka specjalistycznego. **OSTRZEŻENIE:** u dziecka z wirylizacją + fenotypem żeńskim pierwszy krok to WYKLUCZENIE WPN z utratą soli (potencjalnie śmiertelne w 2.–4. tygodniu życia). **OKNO MINI-PUBERTY (1.–6. miesiąc życia)** — przejściowa aktywacja osi przysadkowo-gonadowej; w tym czasie pomiary T, DHT, AMH, inhibiny B, LH i FSH są wiarygodne bez konieczności testów dynamicznych i mają wartość prognostyczną dla przyszłej funkcji gonad. Algorytm wstępny: (1) pilne wykluczenie WPN (17-OHP + elektrolity); (2) ustalenie płci genetycznej (kariotyp FISH/QF-PCR); (3) ocena gonad (T, DHT, AMH, inhibina B, LH, FSH); (4) obrazowanie struktur wewnętrznych (USG); (5) badania genetyczne molekularne zależne od fenotypu.',
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
      summary: 'Rozpoznanie wymaga objawów klinicznych ORAZ biochemicznie potwierdzonego niedoboru testosteronu: 2× testosteron całkowity pobrany rano (7:00–11:00), na czczo, w stanie stabilnym. Próg rozpoznania wg Endocrine Society 2018 (Bhasin) — testosteron całkowity < 9,2 nmol/L (264 ng/dL); przy wartościach granicznych (8–12 nmol/L) lub nieprawidłowej SHBG oblicza się testosteron wolny. Po potwierdzeniu niedoboru LH i FSH różnicują postać pierwotną (hipergonadotropową, ↑LH/FSH — uszkodzenie jąder) od wtórnej (hipogonadotropowej, ↓/prawidłowe LH/FSH — przyczyna przysadkowo-podwzgórzowa). Przed włączeniem testosteronoterapii obowiązkowa ocena hematokrytu, a u mężczyzn ≥ 40. r.ż. także gruczołu krokowego (PSA + DRE).',
      sections: [
        { name: 'Potwierdzenie niedoboru testosteronu',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano (7:00–11:00), na czczo, 2× potwierdzenie w odrębnych dniach, w stanie stabilnym. Próg rozpoznania (Endocrine Society 2018): < 9,2 nmol/L (264 ng/dL).', description: 'Testosteron całkowity — podstawowy parametr rozpoznania hipogonadyzmu męskiego. Pobranie: rano (7:00–11:00, szczyt rytmu dobowego), na czczo, wymagane DWUKROTNE potwierdzenie w odrębnych dniach. Próg rozpoznania wg Endocrine Society 2018 (Bhasin): testosteron całkowity < 9,2 nmol/L (264 ng/dL) u mężczyzny z objawami. UWAGA: testosteron jest przejściowo obniżony w chorobach ostrych, po dużym wysiłku, przy deprywacji snu oraz w otyłości (obniżona SHBG) — pomiar należy wykonać w stanie stabilnym, a wartości graniczne zweryfikować obliczeniem testosteronu wolnego. Metoda referencyjna: LC-MS/MS.' },
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
      summary: 'Hipogonadyzm żeński = niedostateczna produkcja estrogenów przez jajniki; objawia się zaburzeniami miesiączkowania (oligo-/amenorrhea), niepłodnością, objawami hipoestrogenizmu (uderzenia gorąca, suchość pochwy), a długotrwale — osteoporozą. U kobiety w wieku rozrodczym diagnostykę zawsze poprzedza wykluczenie ciąży (β-hCG). Klasyfikacja opiera się na gonadotropinach: ↑FSH/LH przy niskim estradiolu → postać hipergonadotropowa (jajnikowa — m.in. przedwczesna niewydolność jajników POI, zespół Turnera); ↓/prawidłowe FSH/LH przy niskim estradiolu → postać hipogonadotropowa (centralna — czynnościowy podwzgórzowy brak miesiączki, hiperprolaktynemia, choroby przysadki). Szczegółowa diagnostyka POI prowadzona jest w ramach dedykowanego wskazania „Przedwczesna niewydolność jajników".',
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
      summary: 'Andropauza = hipogonadyzm późnego początku (LOH — late-onset hypogonadism) u starzejących się mężczyzn. Rozpoznanie wymaga OBU elementów: objawów klinicznych (obniżone libido, zaburzenia erekcji, zmęczenie, obniżenie nastroju, spadek masy mięśniowej i gęstości kości) ORAZ biochemicznie potwierdzonego niedoboru testosteronu (2× pomiar rano). Przed rozpoznaniem należy wykluczyć odwracalne przyczyny obniżenia testosteronu: otyłość, zespół metaboliczny, cukrzyca typu 2, obturacyjny bezdech senny (OSA), leki (opioidy, glikokortykosteroidy), ostre choroby. Przed rozpoczęciem testosteronoterapii OBOWIĄZKOWE: oznaczenie PSA + badanie per rectum (wykluczenie raka gruczołu krokowego — testosteron przeciwwskazany) oraz morfologia/hematokryt (wykluczenie erytrocytozy).',
      sections: [
        { name: 'Rozpoznanie (potwierdzenie niedoboru testosteronu)',
          tests: [
            { id: 'testosterone_total', note: 'Pobranie rano (7:00–11:00), na czczo, 2× potwierdzenie. Progi (EAU): < 12 nmol/L (350 ng/dL) u objawowego mężczyzny → strefa wymagająca dalszej oceny; < 8 nmol/L (230 ng/dL) → wyraźny niedobór.', description: 'Testosteron całkowity — podstawowy parametr rozpoznania hipogonadyzmu późnego początku (LOH). Pobranie: rano (7:00–11:00), na czczo, wymagane DWUKROTNE potwierdzenie w odstępie (rytm dobowy testosteronu — najwyższe stężenia rano). Progi interpretacyjne: wg EAU 2023 — < 12 nmol/L (350 ng/dL) u mężczyzny z objawami → strefa wymagająca dalszej oceny (SHBG, wolny testosteron); < 8 nmol/L (230 ng/dL) → wyraźny niedobór wymagający leczenia. Endocrine Society 2018 (Bhasin) stosuje próg < 9,2 nmol/L (264 ng/dL) dla rozpoznania hipogonadyzmu. UWAGA: testosteron jest obniżony przejściowo w chorobach ostrych, po wysiłku, przy niedoborze snu — pomiar należy wykonać w stanie stabilnym. Metoda referencyjna: LC-MS/MS.' },
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
        { name: 'Przed rozpoczęciem testosteronoterapii (OBOWIĄZKOWE)',
          tests: [
            EXT.psa,
            { ext: 'cbc', label: 'Morfologia krwi (hematokryt)', note: 'Wykluczenie erytrocytozy/policytemii — testosteron zwiększa hematokryt. PRZED rozpoczęciem terapii hematokryt > 48–50% → odroczenie; W TRAKCIE leczenia > 54% → wstrzymanie/modyfikacja.', description: 'Morfologia krwi z oceną hematokrytu — obowiązkowa przed rozpoczęciem testosteronoterapii i w trakcie leczenia. Testosteron stymuluje erytropoezę i zwiększa hematokryt; nadmierny wzrost (erytrocytoza/policytemia) zwiększa ryzyko powikłań zakrzepowo-zatorowych. Progi (Bhasin ES 2018): PRZED rozpoczęciem terapii — hematokryt > 48–50% stanowi przeciwwskazanie względne, terapię należy odroczyć do wyjaśnienia przyczyny i normalizacji. W TRAKCIE leczenia — kontrola morfologii po 3–6 miesiącach, następnie co 12 miesięcy; przy hematokrycie > 54% wskazana redukcja dawki, zmiana preparatu lub czasowe wstrzymanie terapii. Morfologia pozwala też wykryć niedokrwistość, która sama może być skutkiem hipogonadyzmu (testosteron stymuluje erytropoezę).' }
          ]
        },
        { name: 'Ocena chorób towarzyszących i konsekwencji',
          tests: [
            EXT.lipid_panel,
            EXT.hba1c,
            EXT.dxa,
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
      summary: 'Rozpoznanie menopauzy jest kliniczne — 12 kolejnych miesięcy braku miesiączki u kobiety ≥ 45. r.ż. bez innej przyczyny, bez potrzeby badań hormonalnych. Diagnostyka laboratoryjna jest zarezerwowana dla sytuacji nietypowych: wiek 40–45 lat, brak macicy lub stosowanie antykoncepcji hormonalnej (niemożność oceny cyklu), nietypowy obraz kliniczny, podejrzenie innej przyczyny. Jeśli objawy wygasania czynności jajników występują przed 40. r.ż., właściwym rozpoznaniem jest przedwczesna niewydolność jajników (POI — osobne wskazanie), nie menopauza. Druga część panelu obejmuje ocenę przed włączeniem menopauzalnej terapii hormonalnej (MHT/HRT) — kwalifikacja opiera się na ocenie ryzyka sercowo-naczyniowego, onkologicznego (pierś, endometrium) i stanu kości.',
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
      summary: 'Przedwczesna niewydolność jajników (POI) — kryteria rozpoznania wg ESHRE 2016: oligo-/amenorrhea utrzymująca się ≥ 4 miesiące, FSH > 25 IU/L w dwóch pomiarach w odstępie > 4 tygodni oraz wiek < 40 lat. U kobiety w wieku rozrodczym diagnostykę poprzedza wykluczenie ciąży (β-hCG). U większości przypadków etiologia pozostaje nieustalona (idiopatyczna); spośród przyczyn rozpoznawalnych istotne są: genetyczne (zespół Turnera, premutacja FMR1), autoimmunologiczne (autoimmunizacja nadnerczowa i tarczycowa) oraz jatrogenne (chemioterapia, radioterapia, operacje jajników — ustalane z wywiadu). POI wymaga oceny i monitorowania konsekwencji hipoestrogenizmu — utraty masy kostnej i podwyższonego ryzyka sercowo-naczyniowego.',
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
      summary: 'Zespół Klinefeltera (kariotyp 47,XXY lub mozaicyzm 47,XXY/46,XY) — najczęstsza aberracja chromosomów płciowych u mężczyzn i najczęstsza przyczyna pierwotnego (hipergonadotropowego) hipogonadyzmu męskiego. Złotym standardem rozpoznania jest kariotyp. Typowy obraz hormonalny: znacznie podwyższone LH i FSH przy testosteronie niskim lub w dolnej granicy normy oraz względnie podwyższonym estradiolu; inhibina B i AMH niskie (dysfunkcja komórek Sertoliego). Zespół wiąże się z azoospermią nieobstrukcyjną oraz licznymi powikłaniami ogólnoustrojowymi — osteoporozą, zespołem metabolicznym, cukrzycą typu 2 i dyslipidemią — które wymagają oceny i monitorowania.',
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
      summary: 'Niepłodność pary — brak ciąży po 12 miesiącach regularnego współżycia bez antykoncepcji (lub po 6 miesiącach, gdy kobieta ma ≥ 35 lat). Diagnostykę prowadzi się równolegle u obojga partnerów. U kobiety ocenia się oś podwzgórze-przysadka-jajnik, czynność tarczycy, owulację, rezerwę jajnikową oraz anatomię narządu rodnego (w tym drożność jajowodów). U mężczyzny podstawą jest spermiogram wg WHO 2021; przy nieprawidłowym wyniku rozszerza się diagnostykę o panel hormonalny, a przy azoospermii lub ciężkiej oligospermii — o badania genetyczne.',
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
      summary: 'Ocena rezerwy jajnikowej — najczęściej w kontekście kwalifikacji i planowania leczenia metodą rozrodu wspomaganego (IVF). Najbardziej wiarygodne markery to AMH oraz liczba pęcherzyków antralnych (AFC w USG przezpochwowym) — równorzędne i wzajemnie komplementarne. FSH i estradiol z 3. dnia cyklu mają charakter uzupełniający (markery starsze, o dużej zmienności). KLUCZOWY NIUANS INTERPRETACYJNY: AMH i AFC przewidują przede wszystkim odpowiedź jajników na stymulację (liczbę uzyskanych komórek jajowych) — a nie jakość oocytów, szansę żywego urodzenia ani szansę na ciążę spontaniczną; głównym determinantem jakości oocytów i szansy żywego urodzenia pozostaje wiek kobiety. Markery rezerwy nie powinny służyć do odmawiania leczenia.',
      sections: [
        { name: 'Markery rezerwy jajnikowej',
          tests: [
            { id: 'amh', note: 'Najbardziej wiarygodny marker rezerwy jajnikowej oznaczany z krwi (obok AFC jako badania obrazowego) — stabilny w trakcie cyklu, można oznaczać w dowolnym dniu. Niski AMH wskazuje na obniżoną rezerwę i przewiduje słabszą odpowiedź na stymulację; nie przesądza o jakości oocytów ani o szansie na ciążę.', description: 'AMH (hormon antymüllerowski) — produkowany przez komórki ziarniste małych pęcherzyków preantralnych i antralnych; jego stężenie odzwierciedla pulę pęcherzyków, czyli ilościową rezerwę jajnikową. Zalety: względna stabilność w trakcie cyklu (oznaczanie w dowolnym dniu), wczesny spadek z wiekiem. Zastosowanie: przewidywanie odpowiedzi jajników na stymulację gonadotropinami (identyfikacja słabych i nadmiernych odpowiedzi — ryzyko zespołu hiperstymulacji), indywidualizacja dawki, poradnictwo. OGRANICZENIA: AMH przewiduje LICZBĘ uzyskanych oocytów, ale NIE ich jakość, NIE szansę żywego urodzenia i NIE szansę na ciążę spontaniczną — nie należy go używać do odmawiania leczenia ani jako samodzielnego testu „płodności". Wyniki mogą się różnić między metodami oznaczania; stężenie jest obniżone u kobiet stosujących antykoncepcję hormonalną.' },
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
      summary: 'Hiperprolaktynemia — podwyższone stężenie prolaktyny. Pojedynczy pomiar przy prawidłowym pobraniu (bez nadmiernego stresu, bez stymulacji piersi) zwykle wystarcza do rozpoznania; przy wartościach granicznych lub podejrzeniu wpływu stresu — powtórzyć. Przyczyny: fizjologiczne (ciąża, laktacja, stres), farmakologiczne (neuroleptyki, metoklopramid, leki przeciwdepresyjne, werapamil, estrogeny, opioidy — szczegółowy wywiad lekowy!), patologiczne (prolactinoma, inne guzy okolicy podwzgórzowo-przysadkowej z efektem przerwania szypuły, niedoczynność tarczycy, przewlekła choroba nerek, makroprolaktynemia). Algorytm: (1) potwierdzenie + wykluczenie częstych przyczyn; (2) MRI przysadki gdy hiperprolaktynemia niejasnego pochodzenia; (3) ocena funkcji przysadki przy makrogruczolaku; (4) pułapki interpretacyjne. Stopień podwyższenia PRL koreluje z prawdopodobieństwem prolactinoma: > 500 ng/mL jest diagnostyczne dla makroprolactinoma; 250–500 ng/mL zwykle wskazuje na prolactinoma (mikro lub makro); umiarkowane podwyższenie (25–100 ng/mL) — częściej efekt przerwania szypuły, leki lub mikroprolactinoma.',
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
      summary: 'Brak miesiączki — pierwotny (brak wystąpienia pierwszej miesiączki do 16. r.ż. przy prawidłowo rozwiniętych drugorzędowych cechach płciowych — pokwitanie się rozpoczęło, ale miesiączka nie wystąpiła) lub wtórny (brak miesiączki ≥ 3 miesiące u kobiety wcześniej miesiączkującej regularnie lub ≥ 6 miesięcy u miesiączkującej nieregularnie). Jeśli u dziewczynki do 13.–14. r.ż. nie pojawiają się żadne oznaki pokwitania (brak rozwoju piersi), diagnostyka powinna iść torem opóźnionego dojrzewania (osobne wskazanie) — brak miesiączki jest tam konsekwencją braku pokwitania, nie samodzielnym objawem. TEST CIĄŻOWY ZAWSZE PIERWSZY — ciąża jest najczęstszą przyczyną wtórnego braku miesiączki. Najczęstsze przyczyny wtórne: ciąża, czynnościowy podwzgórzowy brak miesiączki (FHA — stres, niedowaga, nadmierny wysiłek, zaburzenia odżywiania), hiperprolaktynemia, PCOS, przedwczesna niewydolność jajników (POI), choroby tarczycy, zespół Ashermana. Najczęstsze przyczyny pierwotne (przy obecnym pokwitaniu): zespół Turnera (45,X), agenezja macicy/pochwy (zespół Mayera-Rokitansky\'ego-Küstera-Hausera), niewrażliwość na androgeny (CAIS), zarośnięcie błony dziewiczej. Algorytm: (1) wykluczenie ciąży; (2) panel hormonalny podstawowy (FSH, LH, estradiol, TSH, prolaktyna); (3) przy hiperandrogenizmie — profil androgenowy; (4) obrazowanie; (5) diagnostyka pogłębiona w braku pierwotnym i w POI.',
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
      summary: 'Mlekotok (galactorrhea) — wydzielanie mlecznej treści z brodawek sutkowych niezwiązane z laktacją poporodową. Prawdziwy mlekotok jest zwykle obustronny, mleczny i wieloprzewodowy; wydzielina jednostronna, krwista lub surowicza albo współistniejący guz piersi przemawiają za patologią gruczołu piersiowego i wymagają odrębnej diagnostyki obrazowej piersi, nie hormonalnej. Kluczowym pytaniem diagnostycznym jest stężenie prolaktyny: mlekotok może przebiegać z hiperprolaktynemią (wtedy diagnostyka jak w hiperprolaktynemii — wykluczenie ciąży, leków, niedoczynności tarczycy, a następnie MRI przysadki) lub przy prawidłowej prolaktynie (mlekotok normoprolaktynemiczny — najczęściej idiopatyczny, o łagodnym przebiegu). Niezbędny jest szczegółowy wywiad lekowy (neuroleptyki, metoklopramid, leki przeciwdepresyjne, estrogeny, opioidy, werapamil).',
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
      summary: 'Ocena owulacji — potwierdzenie, czy w cyklu doszło do jajeczkowania. Podstawową metodą jest oznaczenie progesteronu w środku fazy lutealnej (ok. 7 dni przed spodziewaną miesiączką; klasycznie „21. dzień" przy cyklu 28-dniowym). Wartości progowe: progesteron > 3 ng/mL (~10 nmol/L) potwierdza, że doszło do owulacji, a wartości wyższe (orientacyjnie > 10 ng/mL / ~30 nmol/L) świadczą o wydolnej funkcji ciałka żółtego — wynik należy interpretować względem momentu pobrania, bo progesteron jest wydzielany pulsacyjnie. Metody uzupełniające to bezpośrednia obserwacja w USG (folikulometria) oraz krzywa temperatury ciała (BBT — retrospektywna, mało precyzyjna). Przy potwierdzonym braku owulacji pierwszym krokiem poszukiwania przyczyny jest ocena tarczycy i prolaktyny.',
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
      summary: 'Niedobór fazy lutealnej — niskie P4 < 16 nmol/L w połowie fazy lutealnej, krótka faza < 11 dni.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'progesterone' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'estradiol' },
            { id: 'prolactin' }, { id: 'tsh' }
          ]
        }
      ],
      guideline: 'ASRM Practice Committee 2015'
    },

    pregnancy: {
      summary: 'Wskazanie obejmuje endokrynologiczne i metaboliczne aspekty kontroli laboratoryjnej ciąży: czynność tarczycy, skrining cukrzycy ciążowej (GDM), hormony wczesnej ciąży. Pełna opieka prenatalna jest szersza (morfologia, grupa krwi z przeciwciałami odpornościowymi, serologie zakaźne, badania prenatalne, USG genetyczne) — wykracza poza zakres przelicznika hormonalnego. UWAGA na fizjologiczne zmiany w ciąży: prolaktyna, SHBG i kortyzol fizjologicznie wzrastają; w przypadku tarczycy rosną hormony całkowite (T4, T3 — przez wzrost TBG, białka wiążącego), natomiast TSH w I trymestrze fizjologicznie spada, a wolne frakcje (fT4, fT3) pozostają w normie lub nieco spadają — dlatego TSH i fT4 należy interpretować wg zakresów referencyjnych specyficznych dla trymestru.',
      sections: [
        { name: 'Czynność tarczycy w ciąży',
          tests: [
            { id: 'tsh', note: 'Optymalnie zakresy referencyjne specyficzne dla trymestru i laboratorium. Gdy niedostępne — polskie wytyczne PTE 2021: górna granica I trymestr 2,5 mIU/L; II i III trymestr 3,0 mIU/L.', description: 'TSH — podstawowy parametr oceny czynności tarczycy w ciąży. Optymalnie należy stosować zakresy referencyjne specyficzne dla trymestru oraz danego laboratorium/populacji. Gdy własne zakresy laboratoryjne są niedostępne, polskie wytyczne PTE 2021 (Hubalewska-Dydejczyk i wsp.) zalecają następujące górne granice TSH: I trymestr — 2,5 mIU/L; II i III trymestr — 3,0 mIU/L. Dolna granica TSH w I trymestrze bywa fizjologicznie obniżona (hCG, mając wspólną podjednostkę α z TSH, stymuluje tarczycę). Niewyrównana niedoczynność tarczycy w ciąży zwiększa ryzyko powikłań położniczych (poronienie, poród przedwczesny, nadciśnienie indukowane ciążą) i zaburzeń neurorozwojowych płodu — wymaga leczenia lewotyroksyną i ścisłego monitorowania. Kobiety leczone z powodu niedoczynności tarczycy zwykle wymagają zwiększenia dawki lewotyroksyny zaraz po potwierdzeniu ciąży.' },
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
      summary: 'Ginekomastia — rozrost tkanki gruczołowej piersi u mężczyzny (różnić od lipomastii — nagromadzenia tłuszczu bez rozrostu gruczołu). Mechanizm: przewaga działania estrogenowego nad androgenowym. Najpierw wykluczyć ginekomastię fizjologiczną (noworodkowa, pokwitaniowa, starcza) i polekową (szczegółowy wywiad — m.in. spironolakton, antyandrogeny, inhibitory pompy protonowej, sterydy anaboliczne, digoksyna, opioidy). Wskazania do diagnostyki hormonalnej: ginekomastia świeża, bolesna, > 4 cm, szybko narastająca lub przy nieprawidłowościach w badaniu jąder. Ginekomastia długotrwała, stabilna, bezbolesna zwykle nie wymaga rozległej diagnostyki. Algorytm: (1) panel hormonalny (testosteron, estradiol, LH/FSH, prolaktyna, β-hCG); (2) wykluczenie przyczyn ogólnoustrojowych (tarczyca, wątroba, nerki); (3) obrazowanie zależnie od wzorca hormonalnego; (4) diagnostyka pogłębiona przy podejrzeniu zespołu Klinefeltera lub guza.',
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
      summary: 'Centralne (GnRH-zależne): odpowiedź LH > 5 IU/L w teście GnRH. Obwodowe: niezależne od GnRH, źródła ektopowe.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'lh' }, { id: 'fsh' },
            { id: 'estradiol', note: 'Dziewczynki' },
            { id: 'testosterone_total', note: 'Chłopcy' },
            EXT.bone_age,
            EXT.gnrh_test
          ]
        },
        { name: 'Obwodowe — etiologia',
          tests: [
            { id: 'oh17_progesterone' }, { id: 'dhea_s' }, { id: 'androstenedione' },
            { id: 'cortisol' }, { id: 'acth' },
            EXT.chorionic_us,
            EXT.adrenal_ct,
            EXT.bhcg, // guzy hCG-produkujące
            EXT.pituitary_mri
          ]
        }
      ],
      guideline: 'ESPE 2009 / PTE Pediatryczna'
    },

    delayed_puberty: {
      summary: 'Brak początku pokwitania: dziewczynki > 13 r.ż., chłopcy > 14 r.ż. Konstytucjonalne opóźnienie (CDGP) vs hipogonadyzm.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'lh' }, { id: 'fsh' },
            { id: 'testosterone_total', note: 'Chłopcy' },
            { id: 'estradiol', note: 'Dziewczynki' },
            { id: 'tsh' }, { id: 'ft4' },
            { id: 'prolactin' },
            { id: 'igf1' },
            EXT.bone_age
          ]
        },
        { name: 'Rozszerzony',
          tests: [
            EXT.karyotype,
            EXT.gnrh_test,
            EXT.hcg_test,
            EXT.pituitary_mri,
            EXT.ttg_iga // celiakia
          ]
        }
      ],
      guideline: 'PTE / ESPE 2019'
    },

    /* ═══════════════════════════════════════════════════════════════
     *  TARCZYCA
     * ═══════════════════════════════════════════════════════════════ */

    hypothyroidism: {
      summary: 'TSH > 10 mIU/L lub TSH > 4 + fT4 ↓ → niedoczynność jawna. TSH 4–10 + fT4 norma → subkliniczna. PTE 2019.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'tsh', note: 'I rzut diagnostyki tarczycy' },
            { id: 'ft4', note: 'Potwierdza pierwotną (TSH ↑, fT4 ↓)' },
            { id: 'ft3', note: 'Tylko w wybranych przypadkach (T3-toxicosis, zespół niskiej T3)' }
          ]
        },
        { name: 'Etiologia (AITD — Hashimoto)',
          tests: [
            EXT.anti_tpo,
            EXT.anti_tg_ab,
            EXT.thyroid_us
          ]
        },
        { name: 'Konsekwencje / monitorowanie',
          tests: [
            EXT.cbc, EXT.lipid_panel,
            EXT.cmp, EXT.egfr
          ]
        }
      ],
      guideline: 'PTE 2019 (Hubalewska-Dydejczyk i wsp.) / ATA 2014'
    },

    hyperthyroidism: {
      summary: 'TSH ↓ + fT4/fT3 ↑ → jawna nadczynność. TRAb i scyntygrafia różnicują Gravesa, Plummera, zapalenia.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'tsh' }, { id: 'ft4' }, { id: 'ft3' }
          ]
        },
        { name: 'Etiologia',
          tests: [
            EXT.trab,
            EXT.anti_tpo,
            EXT.anti_tg_ab,
            EXT.thyroid_us,
            EXT.thyroid_scinti,
            EXT.iodine_uptake
          ]
        },
        { name: 'Powikłania',
          tests: [
            EXT.cbc, EXT.liver, EXT.lipid_panel,
            EXT.dxa
          ]
        }
      ],
      guideline: 'PTE 2017 / ATA 2016 (Ross i wsp.)'
    },

    thyroid_cancer_followup: {
      summary: 'DTC po tyreoidektomii: TSH ≤ 0,1 (wysokie ryzyko) / 0,1–0,5 (umiarkowane). Tg + anty-Tg-Ab równolegle, USG szyi co 6–12 mies.',
      sections: [
        { name: 'Panel podstawowy (po total thyroidectomy)',
          tests: [
            { id: 'tsh', note: 'Cel zależny od ryzyka nawrotu' },
            { id: 'thyroglobulin', note: 'Po TT: cel < 0,2 ng/mL; wybrać protocol post_thyroidectomy_basal' },
            EXT.anti_tg_ab,
            EXT.neck_us
          ]
        },
        { name: 'Stymulacja (jeśli wskazana)',
          tests: [
            { id: 'thyroglobulin', note: 'Stymulowany — wybrać post_thyroidectomy_stimulated' }
          ]
        },
        { name: 'MTC — kontrola',
          tests: [
            EXT.calcitonin, EXT.cea
          ]
        }
      ],
      guideline: 'ATA 2015 (Haugen i wsp.) / PTE'
    },

    autoimmune_thyroid: {
      summary: 'Diagnostyka AITD: anty-TPO (czułość ~90% w Hashimoto) + anty-TG (~60–80%). TRAb to swoisty marker choroby Gravesa-Basedowa. USG obrazuje hipoechogeniczność (Hashimoto) lub zwiększone unaczynienie (Graves).',
      sections: [
        { name: 'Panel podstawowy (wszystkie AITD)',
          tests: [
            { id: 'tsh' }, { id: 'ft4' },
            EXT.anti_tpo,
            EXT.anti_tg_ab,
            EXT.thyroid_us
          ]
        },
        { name: 'Hashimoto (jeśli niedoczynność)',
          tests: [
            { id: 'ft3', note: 'Tylko w wybranych przypadkach' }
          ]
        },
        { name: 'Graves-Basedow (jeśli nadczynność)',
          tests: [
            { id: 'ft3' },
            EXT.trab,
            EXT.thyroid_scinti,
            EXT.iodine_uptake
          ]
        }
      ],
      guideline: 'PTE 2019 (Hubalewska-Dydejczyk i wsp.) / ATA 2014–2016'
    },

    neonatal_screening: {
      summary: 'Polska: bibuła w 3.–5. dobie życia (TSH). Punkt odcięcia laboratorium: > 15 mIU/L → recall. Bibuła II / surowica.',
      sections: [
        { name: 'Skrining',
          tests: [
            { id: 'tsh', note: 'Wybrać protocol neonatal_dbs_first lub neonatal_dbs_second' }
          ]
        },
        { name: 'Potwierdzenie (surowica)',
          tests: [
            { id: 'tsh' }, { id: 'ft4' }, { id: 't4_total' },
            { id: 'thyroglobulin', note: 'Aplazja vs hipoplazja vs dyshormonogeneza' },
            EXT.thyroid_us, EXT.thyroid_scinti
          ]
        }
      ],
      guideline: 'PTE 2016 (Kucharska i wsp.) / Polski Program Badań Przesiewowych Noworodków'
    },

    /* ═══════════════════════════════════════════════════════════════
     *  WZROST I ROZWÓJ
     * ═══════════════════════════════════════════════════════════════ */

    GH_deficiency: {
      summary: 'Dzieci: IGF-1 + IGFBP-3 + 2 testy stymulacji (insulina/glukagon/klonidyna/arginina). Dorośli: ITT lub GHRH+arg.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'igf1', note: 'Norma wg wieku/Tannera nie wyklucza GHD u dzieci' },
            { id: 'igfbp3' }
          ]
        },
        { name: 'Testy stymulacji',
          tests: [
            EXT.itt, // dorośli, gold standard
            EXT.ghrh_arg, // dorośli, alternatywa
            EXT.glucagon_test, // dzieci i dorośli
            EXT.clonidine_test  // dzieci
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
      guideline: 'PTE Pediatryczna 2018 / Endocrine Society 2011 (Molitch i wsp.)'
    },

    short_stature: {
      summary: 'Wzrost < -2 SD lub prędkość wzrostu < 25 centyla. Wykluczenie chorób przewlekłych, celiakii, niedoczynności tarczycy, GHD, Turner.',
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
      guideline: 'PTE Pediatryczna 2018 / ESPE 2016'
    },

    acromegaly: {
      summary: 'Skrining: IGF-1 (czułość ~95%). Potwierdzenie: brak supresji GH < 1 μg/L w oGTT. Lokalizacja: MRI przysadki.',
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
      guideline: 'Endocrine Society 2014 (Katznelson i wsp.) / PTE 2019'
    },

    /* ═══════════════════════════════════════════════════════════════
     *  METABOLIZM WAPNIOWO-FOSFORANOWY
     * ═══════════════════════════════════════════════════════════════ */

    vitamin_d_status: {
      summary: 'Skrining 25-OHD u wszystkich z czynnikami ryzyka (otyłość, malabsorption, osteoporoza, dzieci, ciężarne).',
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
      summary: 'DXA T-score ≤ -2,5 = osteoporoza. Diagnostyka wtórnej: wykluczyć nadczynność przytarczyc, Cushinga, hipogonadyzm, szpiczaka.',
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
      summary: 'Klasyczna: krzywica niedoborowa wit. D (25-OHD < 30 nmol/L). ALP znacznie ↑, hipofosfatemia, RTG nadgarstków diagnostyczne.',
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
      summary: 'Sarkoidoza i inne ziarniniaki: ektopowa 1-α-hydroksylaza w makrofagach → 1,25(OH)2D ↑ przy normalnym 25-OHD → hiperkalcemia.',
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
      summary: 'Niedobory witamin/minerałów rozpuszczalnych w tłuszczach. Sprawdź celiakię, IBD, mukowiscydozę, niewydolność trzustki.',
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
      summary: 'U młodych, opornych na leczenie lub z hipokaliemią — szukaj wtórnych endokrynnych: PA, Cushing, pheo, akromegalia.',
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
      summary: 'Po wykluczeniu przyczyn nerkowych/jelitowych: rozważ hiperaldosteronizm i Cushinga.',
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
      summary: 'Endokrynologiczne przyczyny otyłości to < 1% przypadków, ale wszyscy zasługują na minimalny skrining endokrynny.',
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
      summary: 'Diagnostyka kliniczna (NCEP-ATP III lub IDF). Endokrynologicznie: SHBG i testosteron jako markery ryzyka u mężczyzn.',
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
      summary: 'W CKD G3+ produkcja kalcytriolu ↓ → wtórna nadczynność przytarczyc. Konieczne monitorowanie wapnia, fosforu, PTH, 25-OHD, 1,25-D.',
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
