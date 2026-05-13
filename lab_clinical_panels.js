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
      note: 'Różnicowanie centralnego od ektopowego ACTH-zależnego zespołu Cushinga. Wzrost ACTH > 35% i/lub kortyzolu > 20% → centralny; brak odpowiedzi → ektopowy.',
      description: 'Wskazania: różnicowanie centralnego (przysadkowego) od ektopowego ACTH-zależnego zespołu Cushinga po potwierdzeniu autonomii kortyzolu. Protokół: pacjent na czczo, leżący, dostęp żylny zapewniony 30 min przed testem. Podanie i.v. CRH (kortykoliberyny) — 100 μg ludzkiego CRH (hCRH) lub 1 μg/kg owczego CRH (oCRH). Pomiar ACTH i kortyzolu w surowicy: 0 (przed podaniem), 15, 30, 45, 60, 90, 120 min. Kryteria sugerujące centralny zespół Cushinga: wzrost ACTH > 35% w stosunku do wartości bazalnej oraz/lub wzrost kortyzolu > 20%. Brak istotnego wzrostu → ektopowy ACTH (komórki nowotworowe spoza przysadki są zwykle niewrażliwe na CRH). Czułość ~83%, swoistość ~95% dla centralnego zespołu Cushinga. Dostępność CRH w Polsce ograniczona głównie do ośrodków uniwersyteckich. Alternatywa stosowana w Polsce: test stymulacji desmopresyną (DDAVP 10 μg i.v.) — analogiczna interpretacja, lek powszechnie dostępny.'
    },
    udfc_24h: {
      ext: 'udfc_24h',
      label: 'Kortyzol w dobowej zbiórce moczu (DZM)',
      note: 'Skrining zespołu Cushinga — ocena całkowitej produkcji kortyzolu w ciągu doby. > 2× górnej granicy normy w 2 oznaczeniach potwierdza autonomię.',
      description: 'Zbiórka 24-godzinna do standardowego pojemnika na DZM (BEZ konserwantów — kortyzol jest stabilny w moczu przez 24 h; przechowywanie w lodówce w okresie zbiórki zalecane). Pierwsza poranna porcja moczu odrzucona, następnie zbiórka KAŻDEJ porcji moczu przez 24 godziny, ostatnia porcja następnego dnia rano (po przebudzeniu o tej samej godzinie co rozpoczęcie). Pomiar objętości i wolnego kortyzolu (metoda referencyjna LC-MS/MS — oferowana w polskich laboratoriach Synevo, ALAB, Diagnostyka). Norma laboratoryjna: 20–90 μg/24 h (55–250 nmol/24 h). Kryterium dodatnie: > 2× górnej granicy normy w 2 niezależnych oznaczeniach. Pomocniczo: oznaczenie kreatyniny w DZM jako kontrola kompletności zbiórki (oczekiwana ~15–25 mg/kg/24 h u dorosłych). UWAGI: wynik fałszywie ujemny przy łagodnej hiperkortyzolemii (np. subklinicznym Cushingu); fałszywie dodatni przy zbyt dużej objętości moczu (> 5 L/24 h — wymywanie z dystalnych kanalików).'
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
    fmr1:       { ext: 'fmr1',       label: 'FMR1 (premutacja Fragile X)', note: 'Predyspozycja do POI (~20% rodzinnej)' },
    yq_microdel:{ ext: 'yq_microdel', label: 'Mikrodelecje AZF chromosomu Y', note: 'Azoospermia/oligospermia ciężka' },
    cftr_gen:   { ext: 'cftr_gen',   label: 'Mutacje CFTR',            note: 'CBAVD (wrodzony brak nasieniowodów)' },
    srd5a2_gen: {
      ext: 'srd5a2_gen',
      label: 'Genetyka SRD5A2',
      note: 'Definitywne potwierdzenie niedoboru 5α-reduktazy typu 2 (autosomalna recesywna, chromosom 2p23).',
      description: 'Sekwencjonowanie genu SRD5A2 (chromosom 2p23) — koduje enzym 5α-reduktazę typu 2, odpowiedzialną za konwersję testosteronu w DHT w skórze i zewnętrznych narządach płciowych. Dziedziczenie autosomalne recesywne. Opisanych > 100 mutacji sprawczych w ponad 30 krajach. Najczęstsze mutacje w populacji europejskiej: p.Gly196Ser, p.Arg246Gln, p.Gln126Arg. Wskazania: potwierdzenie kliniczno-biochemicznego podejrzenia niedoboru 5α-reduktazy (stosunek T/DHT po hCG > 10–20). Znaczenie: (1) ostateczne potwierdzenie rozpoznania; (2) poradnictwo genetyczne — ryzyko 25% u rodzeństwa, identyfikacja heterozygotycznych nosicieli wśród rodziców; (3) podstawa decyzji o przyznanej płci (większość pacjentów wychowanych jako dziewczynki ulega po dojrzewaniu spontanicznej zmianie tożsamości płciowej na męską ze względu na działanie 5α-reduktazy typu 1 i bezpośrednie działanie testosteronu). U dziewczynek genetycznych (46,XX) z mutacją SRD5A2 fenotyp jest prawidłowy (5α-reduktaza 2 nie odgrywa istotnej roli w rozwoju żeńskich narządów płciowych).'
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
      summary: 'Algorytm 2-stopniowy. PAI (pierwotna niedoczynność kory nadnerczy) — uszkodzenie na poziomie nadnerczy; SAI (wtórna niedoczynność kory nadnerczy) — niedobór ACTH przysadkowego. Pierwszy krok: kortyzol poranny + ACTH + elektrolity. Potwierdzenie testem stymulacji Synacthen. W Polsce ~80% PAI to autoimmunologiczna choroba Addisona. Jeśli kortyzol ↓ + ACTH norma/niskie → podejrzenie SAI — kolejny krok to ocena reszty osi przysadkowej (TSH/fT4, PRL, LH/FSH, IGF-1, MRI przysadki).',
      sections: [
        { name: 'Panel podstawowy (skrining)',
          tests: [
            { id: 'cortisol', note: 'Pobranie 7:00–9:00, na czczo. < 100 nmol/L (3,5 μg/dL) → PAI prawdopodobna; > 500 nmol/L (18 μg/dL) → PAI wykluczona.' },
            { id: 'acth',     note: 'Różnicuje PAI (↑↑) od SAI (norma/↓). Pobierać razem z kortyzolem porannym.' },
            EXT.sodium,
            EXT.potassium,
            EXT.glucose_fasting
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
            { ext: 'adrenal_ct_cushing', label: 'TK nadnerczy wielofazowe z kontrastem', note: 'Standard diagnostyczny w ACTH-niezależnym zespole Cushinga (ESE 2018, ACC guidelines). Różnicowanie gruczolaka nadnercza od raka kory nadnercza (ACC) i przerostu obustronnego.', description: 'TK nadnerczy wielofazowe z kontrastem dożylnym — standard diagnostyczny w ACTH-niezależnym zespole Cushinga (ACTH suprymowane < 5 pmol/L → guz nadnercza pewny) wg wytycznych ESE 2018 ACC (Fassnacht i wsp.). Protokół 4-fazowy: (1) faza natywna (bez kontrastu) — pomiar densytometrii w jednostkach Hounsfielda (HU); (2) faza tętnicza (~25–40 s po podaniu kontrastu) — ocena unaczynienia; (3) faza żylna (~70 s) — ocena charakteru zmiany; (4) faza opóźniona (10–15 min) — obliczenie wash-out kontrastu. Różnicowanie: (1) GRUCZOLAK NADNERCZA produkujący kortyzol — wymiar 2–4 cm, HU natywne < 10 (lipid-rich) lub 10–30 (lipid-poor), absolute wash-out > 60% lub relative wash-out > 40% potwierdza gruczolaka, regularna otoczka, jednorodna struktura; najczęstsza przyczyna ACTH-niezależnego Cushinga (~10% wszystkich Cushingów); (2) RAK KORY NADNERCZA (ACC, adrenocortical carcinoma) — wymiar zwykle > 4 cm (często > 6 cm), HU natywne > 30, niski wash-out (< 50%), niejednorodna struktura (martwica wewnątrzguzowa, zwapnienia), nieregularny brzeg, naciekanie tkanek przyległych, czasem przerzuty (płuca, wątroba); rzadszy (~8% Cushingów), ale rokowanie znacznie gorsze; (3) BILATERALNA NODULARNA HIPERPLAZJA — obustronny przerost nadnerczy, liczne guzki, klinicznie często związana z zespołami genetycznymi (Carney complex — PRKAR1A, McCune-Albright — GNAS, primary pigmented nodular adrenocortical disease — PPNAD). Przy wymiarze guza > 4 cm i podejrzeniu ACC — kwalifikacja do operacji; NIE wykonywać biopsji przed wykluczeniem pheochromocytoma poprzez oznaczenie metanefryn! Alternatywa dla osób z przeciwwskazaniami do kontrastu jodowego (niewydolność nerek eGFR < 30, alergia, nadczynność tarczycy niewyrównana): MRI nadnerczy z sekwencjami chemical-shift.' },
            { ext: 'chest_ct_ectopic', label: 'TK klatki piersiowej / jamy brzusznej', note: 'Gdy podejrzenie ektopowego ACTH — poszukiwanie źródła pozaprzysadkowego.', description: 'Wskazania: dodatni test wysokodawkowy z deksametazonem z brakiem supresji LUB ujemny test CRH przy potwierdzonym ACTH-zależnym Cushingu i ujemnym MRI przysadki. Cel: identyfikacja guza neuroendokrynnego produkującego ACTH ektopowo. Najczęstsze źródła: drobnokomórkowy rak płuca (SCLC, ~50% ektopowego ACTH), rakowiak oskrzelowy/płucny (~15%), rakowiak grasicy (~10%), guz neuroendokrynny trzustki (NET, ~5%), rakowiak jelita cienkiego/wyrostka robaczkowego, rak rdzeniasty tarczycy (MTC). Diagnostyka obrazowa: pierwotnie TK klatki piersiowej cienkimi warstwami z kontrastem i.v.; jeśli ujemne — TK jamy brzusznej + scyntygrafia receptorów somatostatynowych metodą PET-DOTATATE (⁶⁸Ga-DOTATATE) — czułość > 90% dla guzów neuroendokrynnych.' }
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
            { ext: 'cyp21a2_gen', label: 'Genetyka CYP21A2', note: 'Potwierdza rozpoznanie. Kluczowe dla poradnictwa genetycznego (autosomalna recesywna, ryzyko 25% u rodzeństwa).', description: 'Sekwencjonowanie genu CYP21A2 (chromosom 6p21.3) — potwierdza rozpoznanie WPN z niedoboru 21-hydroksylazy. Najczęstsze mutacje sprawcze: I2G (~30%, splice-site), I172N (~20%, postać prosta wirylizująca), V281L (~50% NCAH), delecja genu / konwersja z pseudogenem CYP21A1P (~20%, klasyczna z utratą soli). Dziedziczenie autosomalne recesywne. Ryzyko zachorowania u rodzeństwa probanta: 25%. Diagnostyka prenatalna (kosmówka 10.–12. tydzień ciąży) możliwa po identyfikacji mutacji u rodziców — pozwala wczesne wdrożenie leczenia (deksametazon) u płodów żeńskich w celu zapobiegania wirylizacji genitaliów.' }
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
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH (z niedoboru 21-hydroksylazy). Pobranie rano, faza folikularna; bazalnie > 6 nmol/L (2 ng/mL) wymaga testu stymulacji ACTH.', description: 'Wykluczenie nieklasycznego wrodzonego przerostu nadnerczy (NCAH) z niedoboru 21-hydroksylazy. Pobranie: rano (7:00–9:00), kobiety w fazie folikularnej cyklu (dni 2–5; w II połowie cyklu wartości fizjologicznie wyższe — fałszywie dodatnie wyniki). Bazalne 17-OH-progesteron: < 6 nmol/L (2 ng/mL) → wyklucza klasyczny WPN, jednak część NCAH ma wartości bazalne < 6 (ujawnia się dopiero po stymulacji); 6–30 nmol/L → wynik niejednoznaczny, wskazany test stymulacji ACTH (Synacthen) z pomiarem 17-OHP w 0 i 60 min; > 30 nmol/L → potwierdza WPN (klasyczny lub NCAH). Częstość NCAH: 1:100–1:1000 (zależnie od populacji); wyższa u Aszkenazyjczyków, Hiszpanów, Włochów.' },
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
            { ext: 'chorionic_us_hirsutism', label: 'USG narządów rodnych', note: 'Gdy podejrzenie PCOS (kryterium Rotterdam) lub guza jajnika produkującego androgeny.', description: 'USG przezpochwowe (TVS) lub przezbrzuszne narządów rodnych. W diagnostyce hirsutyzmu cele: (1) ocena morfologii jajników wg kryteriów Rotterdam dla PCOS — ≥ 20 pęcherzyków o średnicy 2–9 mm w jednym jajniku LUB objętość jajnika > 10 mL (aktualizacja 2018, wcześniej ≥ 12 pęcherzyków); (2) wykluczenie guza jajnika produkującego androgeny (rzadki, ale ważny — typowo guzy z komórek tekalno-ziarnistych, guzy z komórek Sertolego-Leydiga). Wskazania do USG: hirsutyzm o szybkim początku, znaczna wirylizacja, testosteron całkowity > 7 nmol/L. U młodych pacjentek (< 18 lat) preferowane USG przezbrzuszne (zachowanie dziewictwa).' },
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
      summary: 'Kryteria Rotterdam (2 z 3): oligo-/anowulacja + kliniczny lub biochem. hyperandrogenizm + USG polycystic. Wykluczenie NCAH, hiperprolaktynemii, choroby tarczycy, Cushinga.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'testosterone_total' }, { id: 'shbg' }, { id: 'testosterone_free' },
            { id: 'dhea_s' },
            { id: 'androstenedione' },
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH (próg 6 nmol/L)' },
            { id: 'lh' }, { id: 'fsh' }, // ratio LH/FSH > 2
            { id: 'prolactin' },
            { id: 'tsh' }
          ]
        },
        { name: 'Rezerwa i obrazowanie',
          tests: [
            { id: 'amh', note: 'AMH > 35 pmol/L sugeruje PCOS' },
            EXT.chorionic_us,
            EXT.afc
          ]
        },
        { name: 'Metabolizm (zawsze!)',
          tests: [
            EXT.ogtt_75g,
            EXT.hba1c,
            EXT.insulin,
            EXT.lipid_panel,
            EXT.liver,
            { id: 'vit_d_25oh' }
          ]
        }
      ],
      guideline: 'Międzynarodowy konsensus PCOS 2018 (Teede i wsp.) / PTE'
    },

    virilization: {
      summary: 'Wirylizacja u dorosłej kobiety — obecność cech męskich (klitoromegalia, rozległe łysienie typu męskiego, pogłębienie głosu, zanik piersi, rozwój masy mięśniowej typu męskiego). UWAGA: szybko narastająca wirylizacja → silne podejrzenie guza androgennego (jajnika lub nadnercza), wymaga PILNEJ diagnostyki obrazowej. Najczęstsze przyczyny: guzy z komórek Sertoliego-Leydiga (SLCT), hilus cell tumor (guz z komórek Leydiga), gruczolak androgenny nadnercza, rak kory nadnercza (ACC), klasyczny WPN późno rozpoznany, hipertekoza jajnikowa. Wstępna diagnostyka: (1) profil androgenowy z naciskiem na testosteron całkowity (> 7 nmol/L → guz) i DHEA-S (> 18,9 μmol/L → guz nadnercza); (2) obrazowanie pilne (USG narządów rodnych + TK nadnerczy wielofazowe z kontrastem); (3) wykluczenie zespołu Cushinga nadnerczowego przy współistnieniu cech cushingoidalnych. Przed diagnostyką OBOWIĄZKOWY szczegółowy wywiad lekowy: sterydy anaboliczno-androgenne, danazol, octan medroksyprogesteronu w wysokich dawkach.',
      sections: [
        { name: 'Profil androgenowy podstawowy',
          tests: [
            { id: 'testosterone_total', note: '> 7 nmol/L (200 ng/dL) → silne podejrzenie guza androgennego; > 14 nmol/L (400 ng/dL) → praktycznie pewny guz.', description: 'Testosteron całkowity u kobiety z wirylizacją — kluczowy parametr różnicowy. Wartości: < 2,4 nmol/L (70 ng/dL) → norma u kobiet w wieku rozrodczym; 2,4–7 nmol/L → typowe dla PCOS, NCAH, idiopatycznego hirsutyzmu; 7–14 nmol/L (200–400 ng/dL) → silne podejrzenie guza androgennego (gonadalnego lub nadnerczowego); > 14 nmol/L (400 ng/dL) → praktycznie pewny guz, wymagana pilna diagnostyka obrazowa. Pobranie: rano (7:00–10:00), na czczo; u kobiet z regularnym cyklem w fazie folikularnej (dni 2–5); w wirylizacji moment cyklu mniej istotny (anowulacja częsta). Metoda referencyjna: LC-MS/MS.' },
            { id: 'shbg', note: 'Zwykle obniżona (efekt androgenów na wątrobę) — wzmaga aktywność testosteronu wolnego.' },
            { id: 'testosterone_free', note: 'Znacznie podwyższony w wirylizacji nawet przy granicznych wartościach T całkowitego.' },
            { id: 'dhea_s', note: '> 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza (gruczolak androgenny lub rak kory nadnercza).', description: 'DHEA-S (siarczan dehydroepiandrosteronu) — marker źródła nadnerczowego androgenów. W wirylizacji: norma u kobiet 1,9–9,4 μmol/L (70–350 μg/dL); łagodne podwyższenie (do ~13 μmol/L) → PCOS lub adrenarche; > 13 μmol/L (500 μg/dL) → wymaga dalszej diagnostyki; > 18,9 μmol/L (700 μg/dL) → silne podejrzenie guza nadnercza. UWAGA: nadnerczowe guzy androgenne częściej są rakami kory nadnercza (ACC) niż gruczolakami — wynika to z faktu, że gruczolaki rzadko są na tyle czynne by powodować wirylizację (większość gruczolaków androgennych ma podwyższone DHEA-S w granicach 13–19 μmol/L). Wartości DHEA-S > 19 μmol/L u kobiety z wirylizacją → bardzo wysokie ryzyko ACC.' },
            { id: 'androstenedione', note: 'Znacznie podwyższony w guzach androgennych (nadnercze + jajnik) — uzupełnia profil różnicowy.' },
            { id: 'oh17_progesterone', note: 'Wykluczenie WPN z niedoboru 21-hydroksylazy późno rozpoznanego — rzadkie u dorosłej kobiety, ale obowiązkowe wykluczenie.' }
          ]
        },
        { name: 'Obrazowanie pilne (gdy podejrzenie guza androgennego)',
          tests: [
            { ext: 'chorionic_us_virilization', label: 'USG narządów rodnych (przezpochwowe)', note: 'Poszukiwanie guza jajnika. Guzy androgenne często MAŁE (1–5 cm), hipoechogeniczne, jednostronne.', description: 'USG przezpochwowe (TVS) narządów rodnych w diagnostyce wirylizacji. Najczęstsze guzy androgenne jajnika: (1) guzy z komórek Sertoliego-Leydiga (SLCT) — wymiar zwykle 4–15 cm, hipo- lub mieszane echogeniczne, jednostronne; histologicznie 1–5% guzów jajnika; (2) hilus cell tumor (guz z komórek Leydiga) — drobny (1–3 cm), hipoechogeniczny, jednostronny, zlokalizowany przy wnęce jajnika; (3) guzy z komórek tekalno-ziarnistych z androgenizacją (rzadko, częściej estrogenizacja). Przy ujemnym USG i wysokim testosteronie konieczne MRI miednicy (czułość wyższa dla drobnych guzów). U młodych pacjentek (< 18 lat lub kobiety bez współżycia) preferowane USG przezbrzuszne z pełnym pęcherzem moczowym.' },
            { ext: 'adrenal_ct_multiphase', label: 'TK nadnerczy wielofazowe z kontrastem', note: 'Standard diagnostyczny przy podejrzeniu czynnego hormonalnie guza nadnercza (ESE 2018, ACC guidelines).', description: 'TK nadnerczy wielofazowe z kontrastem dożylnym — standard diagnostyczny przy klinicznym i biochemicznym podejrzeniu czynnego hormonalnie guza nadnercza (wirylizacja, hiperaldosteronizm, zespół Cushinga nadnerczowy) wg wytycznych ESE 2018 (Fassnacht i wsp.). Protokół 4-fazowy: (1) faza natywna (bez kontrastu) — pomiar densytometrii w jednostkach Hounsfielda (HU); (2) faza tętnicza (~25–40 s po podaniu kontrastu) — ocena unaczynienia; (3) faza żylna (~70 s) — ocena charakteru zmiany; (4) faza opóźniona (10–15 min) — obliczenie wash-out kontrastu. Interpretacja: (1) gruczolak androgenny — wymiar 2–5 cm, HU natywne zwykle 10–30 (lipid-poor — większość gruczolaków produkujących androgeny), absolute wash-out > 60% lub relative wash-out > 40% potwierdza gruczolaka; (2) rak kory nadnercza (ACC) — wymiar zwykle > 4 cm (często > 6 cm), HU natywne > 30, niejednorodna struktura (martwica wewnątrzguzowa, zwapnienia), nieregularny brzeg, naciekanie tkanek przyległych, niski wash-out (< 50%); (3) przy wymiarze > 4 cm i podejrzeniu ACC — kwalifikacja do operacji; NIE wykonywać biopsji przed wykluczeniem pheochromocytoma (metanefryny)! Alternatywa dla osób z przeciwwskazaniami do kontrastu jodowego: MRI nadnerczy z sekwencjami chemical-shift.' }
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
      summary: 'Niedobór 5α-reduktazy typu 2 — autosomalna recesywna choroba (mutacja SRD5A2), powodująca niedobór konwersji testosteronu w DHT (najsilniejszy androgen) w skórze i zewnętrznych narządach płciowych. Klinika u 46,XY: noworodek z niejednoznacznymi narządami płciowymi (spodziectwo, mikropenis) lub fenotypem żeńskim przy obecnych jądrach; w okresie dojrzewania częściowa wirylizacja (głos, libido, masa mięśniowa), ale brak rozwoju zarostu i prącia. Algorytm: (1) kariotyp — potwierdzenie 46,XY; (2) profil androgenowy bazalny (testosteron, DHT, stosunek T/DHT); (3) test stymulacji hCG przy wątpliwym wyniku bazalnym; (4) genetyka SRD5A2 — definitywne potwierdzenie. Diagnostyka różnicowa: zespół niewrażliwości na androgeny (AIS — wrażliwy testosteron i DHT, mutacja AR), niedobór syntezy testosteronu (różne enzymy steroidogenezy nadnerczowo-gonadowej).',
      sections: [
        { name: 'Diagnostyka podstawowa',
          tests: [
            EXT.karyotype,
            { id: 'testosterone_total', note: 'W niedoborze 5α-reduktazy prawidłowy lub podwyższony — enzym nie wpływa na produkcję testosteronu.', description: 'Testosteron całkowity u dziecka z niejednoznacznymi narządami płciowymi lub niedostateczną wirylizacją w okresie dojrzewania. W niedoborze 5α-reduktazy typu 2: testosteron prawidłowy dla wieku/Tannera lub podwyższony (brak ujemnej zwrotnej regulacji ze strony DHT). Optymalny moment pobrania: (1) u noworodków i niemowląt 1.–6. miesiąca życia — tzw. "mini-pubertacja" (przejściowa aktywacja osi przysadkowo-gonadalnej), kiedy testosteron jest fizjologicznie podwyższony i można go wiarygodnie oznaczyć; (2) u dzieci starszych przed pokwitaniem — testosteron bazalny niski, należy wykonać test stymulacji hCG; (3) w okresie dojrzewania — pomiar bazalny rano (7:00–10:00).' },
            { id: 'dht', note: 'W niedoborze 5α-reduktazy obniżony. Stosunek T/DHT bazalnie > 30 → silne podejrzenie; > 10–20 → wskazany test hCG.', description: 'DHT (5α-dihydrotestosteron) — najsilniejszy androgen, powstaje z testosteronu pod wpływem 5α-reduktazy. W niedoborze 5α-reduktazy typu 2 DHT jest obniżony pomimo prawidłowych/podwyższonych stężeń testosteronu. Diagnostycznie kluczowy jest stosunek T/DHT: w warunkach prawidłowych T/DHT < 16; bazalnie > 30 → silne podejrzenie niedoboru 5α-reduktazy; 16–30 → wymaga potwierdzenia testem stymulacji hCG. Metoda referencyjna: LC-MS/MS (immunoassaye dają wyniki zaniżone u dzieci). U dzieci przed pokwitaniem bazalne pomiary T i DHT są niskie i niemiarodajne — w tej grupie wiekowej konieczny test hCG dla wiarygodnej oceny.' }
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
            EXT.sodium,
            EXT.potassium
          ]
        },
        { name: 'Diagnostyka genetyczna',
          tests: [
            EXT.karyotype
          ]
        },
        { name: 'Profil hormonalny — okno mini-puberty (1.–6. miesiąc życia)',
          tests: [
            { id: 'testosterone_total', note: 'Preferowany pomiar w mini-puberty (1.–6. mies., peak ~3 mies.). Poza tym oknem testosteron bazalny niski — konieczny test stymulacji hCG.', description: 'Testosteron całkowity u dziecka z DSD — w okresie mini-puberty (1.–6. miesiąc życia) oś przysadkowo-gonadalna jest fizjologicznie aktywna, a testosteron u chłopców 46,XY osiąga wartości pubertalne (3–10 nmol/L, peak ~3 mies.). To okno diagnostyczne pozwala ocenić czynność komórek Leydiga bez testu stymulacji hCG. Poza oknem mini-puberty (po 6. miesiącu życia, przed dojrzewaniem) testosteron bazalny jest niski/nieoznaczalny — konieczny test stymulacji hCG dla wiarygodnej oceny. Metoda referencyjna: LC-MS/MS.' },
            { id: 'dht', note: 'Wraz z testosteronem ocena stosunku T/DHT (> 10–20 po hCG → niedobór 5α-reduktazy typu 2).' },
            { id: 'amh', note: 'Marker komórek Sertoliego — obecność i czynność jąder. U chłopców 46,XY wysokie wartości od urodzenia do dojrzewania; brak/niskie → dysgenezja jąder lub anorchia.', description: 'AMH (hormon antymüllerowski) — produkowany przez komórki Sertoliego od ~7. tygodnia życia płodowego, hamuje rozwój struktur Müllerowskich u płodu męskiego. W diagnostyce DSD: (1) marker obecności i czynności jąder (u chłopców 46,XY mediana 500–1500 pmol/L do dojrzewania); (2) niskie/brak AMH → dysgenezja jąder, anorchia, ciężka niewydolność komórek Sertoliego; (3) AMH prawidłowy/podwyższony + WYSOKI T + WYSOKI LH + fenotyp żeński z obecnymi jądrami → zespół niewrażliwości na androgeny (CAIS — oporność receptora androgenowego, komórki Sertoliego i Leydiga prawidłowe; brak ujemnego sprzężenia zwrotnego → wzrost LH → wzrost T); (4) AMH prawidłowy + niski T + niski DHT → izolowana dysfunkcja komórek Leydiga lub zaburzenia syntezy testosteronu (np. niedobór 17β-HSD3, StAR, HSD3B2 — komórki Sertoliego prawidłowe, ale zaburzona synteza testosteronu); (5) u dziewczynek 46,XX wartości bardzo niskie. AMH jest komplementarna do inhibiny B (oba markery Sertoliego, ale różne pule funkcjonalne).' },
            { id: 'inhibin_b', note: 'Marker komórek Sertoliego, komplementarny do AMH. W mini-puberty wartości pubertalne (peak ~3 mies.). Wartość PROGNOSTYCZNA dla przyszłej funkcji gonad.', description: 'Inhibina B — produkowana przez komórki Sertoliego (u chłopców) i komórki ziarniste (u dziewczynek). Wartości referencyjne mini-puberty u chłopców: 100–400 pg/mL (peak ~3 mies.); u dziewczynek <50 pg/mL. Komplementarna do AMH (oba markery komórek Sertoliego, ale różne aspekty czynności): (1) niska inhibina B + niska AMH → dysgenezja jąder, ciężka niewydolność komórek Sertoliego; (2) prawidłowa inhibina B → komórki Sertoliego prawidłowe (PAIS, CAIS — funkcja Sertolich zachowana); (3) inhibina B podwyższona w niektórych guzach jajnika (granulosa cell tumor). KLUCZOWE: inhibina B ma wartość PROGNOSTYCZNĄ — pomaga przewidzieć przyszłą funkcję gonad w okresie dojrzewania i płodność (informacja istotna dla poradnictwa rodzicom i planowania długoterminowego leczenia).' },
            { id: 'lh', note: 'W mini-puberty wartości pubertalne (0,5–6 IU/L u chłopców). Wysoki → pierwotne uszkodzenie komórek Leydiga (PAIS, niedobór 5α-reduktazy).', description: 'LH (hormon luteinizujący) w DSD u dziecka — kluczowy parametr osi przysadkowo-gonadowej w oknie mini-puberty (1.–6. miesiąc życia). Wartości referencyjne u chłopców w mini-puberty: 0,5–6 IU/L (peak ~3 mies.); u dziewczynek niższe (0–2 IU/L). Interpretacja w DSD: (1) LH wysoki + niski T → pierwotny hipogonadyzm (uszkodzenie komórek Leydiga; PAIS, niedobór 5α-reduktazy, dysgenezja jąder); (2) LH wysoki + wysoki T → zespół niewrażliwości na androgeny (CAIS — komórki Leydiga prawidłowe, ale brak ujemnego sprzężenia zwrotnego z powodu oporności receptora androgenowego); (3) LH niski/normalny + niski T → centralny hipogonadyzm (wrodzony hipopituitaryzm, niedobór GnRH); (4) LH prawidłowy + niski T → komórki Leydiga nieczynne (anorchia, dysgenezja). Pomiar poza oknem mini-puberty (po 6. miesiącu życia, przed dojrzewaniem) — niewiarygodny, oś HPG fizjologicznie uśpiona.' },
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
      summary: 'Algorytm 2-stopniowy: 2× testosteron poranny (rano, na czczo) — jeśli < 9,2 nmol/L → dalsza diagnostyka. LH/FSH różnicują pierwotne vs wtórne.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'testosterone_total', note: 'Rano (7–10), 2× potwierdzenie; próg < 264 ng/dL (9,2 nmol/L)' },
            { id: 'shbg' },
            { id: 'testosterone_free' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'prolactin' }
          ]
        },
        { name: 'Etiologia (wtórne — przysadkowe)',
          tests: [
            { id: 'igf1' },
            { id: 'tsh' }, { id: 'ft4' },
            EXT.pituitary_mri,
            EXT.serum_iron,
            EXT.copper_cerulo
          ]
        },
        { name: 'Etiologia (pierwotne)',
          tests: [
            EXT.karyotype,
            EXT.yq_microdel,
            EXT.semen_analysis
          ]
        },
        { name: 'Konsekwencje',
          tests: [
            EXT.dxa,
            EXT.lipid_panel,
            EXT.cbc,
            EXT.liver
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 (Bhasin i wsp.)'
    },

    hypogonadism_female: {
      summary: 'FSH > 25 IU/L 2× → POI (hipergonadotropowy). FSH/LH niskie/normowe → centralny (hipogonadyzm hipogonadotropowy).',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'fsh', note: '2× w odstępie 4–6 tyg., faza folikularna' },
            { id: 'lh' },
            { id: 'estradiol' },
            { id: 'amh', note: 'Rezerwa jajnikowa' },
            { id: 'prolactin' },
            { id: 'tsh' }
          ]
        },
        { name: 'Etiologia POI',
          tests: [
            EXT.karyotype,
            EXT.fmr1,
            EXT.anti_21oh,
            EXT.anti_tpo
          ]
        },
        { name: 'Centralny hipogonadyzm',
          tests: [
            EXT.pituitary_mri,
            { id: 'igf1' }
          ]
        }
      ],
      guideline: 'ESHRE POI 2016 / PTE'
    },

    andropause: {
      summary: 'LOH (late-onset hypogonadism): objawy + testosteron < 12 nmol/L 2× rano. Wyklucz wtórne (OSA, otyłość, opiaty).',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'testosterone_total', note: '2× rano, próg < 12 nmol/L; jeśli granica → wolny T' },
            { id: 'shbg' },
            { id: 'testosterone_free' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'prolactin' }
          ]
        },
        { name: 'Czynniki towarzyszące',
          tests: [
            EXT.cbc, EXT.lipid_panel, EXT.hba1c, EXT.dxa,
            { id: 'vit_d_25oh' }
          ]
        }
      ],
      guideline: 'EAU Sexual & Reproductive Health 2023 / ISA-ISSAM-EAU 2015'
    },

    menopause: {
      summary: 'Rozpoznanie kliniczne (12 mies. amenorrhea po 45 r.ż.). Hormonalna potwierdzenie tylko w wątpliwych sytuacjach lub przed 45 r.ż. (POI).',
      sections: [
        { name: 'Panel podstawowy (jeśli wątpliwe rozpoznanie)',
          tests: [
            { id: 'fsh', note: '> 25 IU/L (sugeruje), > 40 IU/L (potwierdza)' },
            { id: 'estradiol' },
            { id: 'tsh' }
          ]
        },
        { name: 'Przed HRT — ocena ryzyka',
          tests: [
            EXT.lipid_panel,
            EXT.liver,
            EXT.mammography,
            EXT.endometrium_us,
            EXT.pap_smear,
            EXT.dxa,
            { id: 'vit_d_25oh' }
          ]
        }
      ],
      guideline: 'NAMS 2022 / Polskie Towarzystwo Menopauzy i Andropauzy'
    },

    ovarian_failure: {
      summary: 'POI: FSH > 25 IU/L 2× w odstępie 4–6 tyg., amenorrhea ≥ 4 mies., wiek < 40 lat. Etiologia w 70% nieznana.',
      sections: [
        { name: 'Rozpoznanie',
          tests: [
            { id: 'fsh', note: '2× > 25 IU/L w odstępie 4–6 tyg.' },
            { id: 'lh' },
            { id: 'estradiol' },
            { id: 'amh', note: 'Bardzo niskie / nieoznaczalne' }
          ]
        },
        { name: 'Etiologia',
          tests: [
            EXT.karyotype,
            EXT.fmr1,
            EXT.anti_21oh,
            EXT.anti_tpo,
            { id: 'tsh' }, { id: 'ft4' }
          ]
        },
        { name: 'Konsekwencje (osteoporoza, sercowo-naczyniowe)',
          tests: [
            EXT.dxa,
            { id: 'vit_d_25oh' },
            EXT.lipid_panel
          ]
        }
      ],
      guideline: 'ESHRE 2016 (Webber i wsp.)'
    },

    klinefelter: {
      summary: 'Kariotyp 47,XXY (lub mozaicyzm) jest złotym standardem. Hormonalny obraz: pierwotny hipogonadyzm hipergonadotropowy (LH/FSH ↑, T ↓).',
      sections: [
        { name: 'Diagnostyka',
          tests: [
            EXT.karyotype,
            { id: 'testosterone_total' },
            { id: 'lh', note: 'Podwyższone — hipergonadotropowe' },
            { id: 'fsh' },
            { id: 'estradiol' },
            { id: 'inhibin_b', note: 'Niskie/nieoznaczalne' },
            { id: 'shbg' },
            EXT.semen_analysis,
            { id: 'amh' }
          ]
        },
        { name: 'Powikłania',
          tests: [
            EXT.dxa,
            EXT.hba1c,
            EXT.lipid_panel,
            EXT.liver
          ]
        }
      ],
      guideline: 'Endocrine Society 2018 / EAA 2021'
    },

    infertility: {
      summary: 'Para 12 mies. bez ciąży: jednocześnie badamy oboje partnerów. Kobieta: oś gonadalna + tarczyca + rezerwa. Mężczyzna: spermiogram + testosteron + LH/FSH.',
      sections: [
        { name: 'Kobieta — panel podstawowy',
          tests: [
            { id: 'fsh', note: 'Dzień 3 cyklu' },
            { id: 'lh' },
            { id: 'estradiol', note: 'Dzień 3' },
            { id: 'amh' },
            { id: 'progesterone', note: 'Dzień 21 — ocena owulacji' },
            { id: 'tsh' }, { id: 'prolactin' },
            { id: 'oh17_progesterone', note: 'Wykluczenie NCAH' },
            { id: 'testosterone_total' },
            EXT.afc,
            EXT.chorionic_us,
            EXT.hsg
          ]
        },
        { name: 'Mężczyzna — panel podstawowy',
          tests: [
            EXT.semen_analysis,
            { id: 'testosterone_total' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'prolactin' },
            { id: 'inhibin_b' },
            EXT.karyotype,
            EXT.yq_microdel,
            EXT.cftr_gen
          ]
        }
      ],
      guideline: 'ESHRE 2023 / PTG 2020'
    },

    ivf_reserve: {
      summary: 'AMH + AFC USG TV to złoty standard oceny rezerwy jajnikowej. FSH/E2 z 3. dnia cyklu uzupełniająco.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'amh' },
            EXT.afc,
            { id: 'fsh', note: 'Dzień 3' },
            { id: 'estradiol', note: 'Dzień 3' },
            { id: 'lh' }
          ]
        },
        { name: 'Dodatkowe',
          tests: [
            { id: 'inhibin_b' },
            { id: 'tsh' }, { id: 'prolactin' }
          ]
        }
      ],
      guideline: 'ESHRE/ASRM 2015'
    },

    hyperprolactinemia: {
      summary: 'Potwierdzić oznaczenie (2× pomiar). Wykluczyć makroprolaktynę, hipotyrozę, ciążę i leki. > 100 ng/mL → MRI przysadki.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'prolactin', note: '2× pomiar, rano, na czczo, bez stymulacji piersi' },
            EXT.macroprolactin,
            { id: 'tsh' }, { id: 'ft4' },
            EXT.bhcg,
            EXT.egfr
          ]
        },
        { name: 'Lokalizacja (jeśli > 100 ng/mL lub utrzymujące się)',
          tests: [
            EXT.pituitary_mri,
            EXT.eye_exam,
            { id: 'igf1' }, { id: 'cortisol' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'testosterone_total', note: 'Mężczyźni' },
            { id: 'estradiol', note: 'Kobiety' }
          ]
        }
      ],
      guideline: 'Endocrine Society 2011 (Melmed i wsp.) / PTE 2018'
    },

    amenorrhea: {
      summary: 'Pierwotny: nie wystąpiło menarche do 15 r.ż. Wtórny: brak miesiączki ≥ 3 mies. u dotychczas miesiączkującej. Test ciążowy — zawsze pierwszy!',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            EXT.bhcg,
            { id: 'tsh' },
            { id: 'prolactin' },
            { id: 'fsh' }, { id: 'lh' }, { id: 'estradiol' },
            { id: 'progesterone', note: 'Faza lutealna lub przed wycofaniem progestagenu' },
            { id: 'testosterone_total' }, { id: 'shbg' }, { id: 'dhea_s' },
            { id: 'oh17_progesterone' }
          ]
        },
        { name: 'Etiologia (jeśli wskazana)',
          tests: [
            EXT.karyotype,
            EXT.fmr1,
            EXT.chorionic_us,
            EXT.pituitary_mri
          ]
        }
      ],
      guideline: 'ACOG 2016 / PTE'
    },

    galactorrhea: {
      summary: 'Sprawdź ciążę, leki, hipotyrozę, MRI przysadki przy makroprolaktynemii.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'prolactin', note: '2× pomiar' },
            EXT.macroprolactin,
            { id: 'tsh' }, { id: 'ft4' },
            EXT.bhcg
          ]
        },
        { name: 'Rozszerzony',
          tests: [
            EXT.pituitary_mri
          ]
        }
      ],
      guideline: 'Endocrine Society 2011'
    },

    ovulation: {
      summary: 'Progesteron > 16 nmol/L (5 ng/mL) w środku fazy lutealnej (dzień ~21 cyklu 28-dniowego) potwierdza owulację.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'progesterone', note: 'Dzień 21 (lub 7 dni przed spodziewaną miesiączką)' },
            { id: 'lh', note: 'Szczyt LH w połowie cyklu' },
            { id: 'estradiol' }
          ]
        },
        { name: 'Pomocnicze',
          tests: [
            EXT.bbt,
            EXT.chorionic_us
          ]
        }
      ],
      guideline: 'ASRM 2015'
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
      summary: 'Monitorowanie endokrynologiczne ciąży: tarczyca (TSH I trym. < 2,5 mIU/L), cukrzyca ciążowa (oGTT 24–28 tyg.), prolaktyna fizjologicznie wzrasta.',
      sections: [
        { name: 'Tarczyca w ciąży',
          tests: [
            { id: 'tsh', note: 'I trym. < 2,5; II/III < 3,0 mIU/L wg PTE 2021' },
            { id: 'ft4' },
            EXT.anti_tpo
          ]
        },
        { name: 'Cukrzyca ciążowa',
          tests: [
            EXT.ogtt_75g,
            EXT.glucose_fasting
          ]
        },
        { name: 'Inne',
          tests: [
            EXT.bhcg,
            { id: 'progesterone' },
            EXT.pregnancy_us
          ]
        }
      ],
      guideline: 'PTE 2021 (tarczyca w ciąży) / PTGiP 2018 (GDM)'
    },

    gynecomastia: {
      summary: 'Wykluczyć fizjologiczną (puberalna, starcza). Patologiczna: nadmiar estrogenów lub niedobór androgenów. Zawsze sprawdzić leki i wątrobę.',
      sections: [
        { name: 'Panel podstawowy',
          tests: [
            { id: 'testosterone_total' },
            { id: 'estradiol' }, { id: 'estrone' },
            { id: 'lh' }, { id: 'fsh' },
            { id: 'prolactin' },
            { id: 'tsh' },
            EXT.bhcg,
            EXT.liver,
            EXT.egfr
          ]
        },
        { name: 'Etiologia (jeśli niejednoznaczne)',
          tests: [
            { id: 'shbg' },
            { id: 'dhea_s' },
            EXT.karyotype,
            EXT.chorionic_us,
            EXT.adrenal_ct
          ]
        }
      ],
      guideline: 'Endocrine Society 2014 (Braunstein i wsp.)'
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
