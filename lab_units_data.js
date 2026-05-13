/* lab_units_data.js
 * --------------------------------------------------------------------------
 *  Baza danych substancji dla przelicznika jednostek laboratoryjnych.
 *
 *  Każda substancja definiuje:
 *    id            – stabilny identyfikator (slug),
 *    label_pl      – etykieta po polsku (UI),
 *    label_en      – etykieta po angielsku (search/synonim),
 *    aliases       – dodatkowe nazwy/skróty do wyszukiwarki,
 *    group         – grupa kliniczna (do nagłówków w selektorze),
 *    mw            – masa cząsteczkowa [g/mol],
 *    canonical_si  – kanoniczna jednostka SI (do której wszystko jest sprowadzane),
 *    units[]       – lista jednostek; każda ma:
 *                      symbol         (np. "μg/dL"),
 *                      label          (etykieta wyświetlana),
 *                      kind           ("conv" | "si"),
 *                      factor_to_si   – współczynnik: value_in_canonical_si = value × factor_to_si
 *    precision     – sugerowana liczba cyfr znaczących przy wyświetlaniu,
 *    ranges_pl[]   – informacyjne zakresy referencyjne (string),
 *    notes_pl      – uwagi kliniczne / pułapki interpretacyjne,
 *    sources[]     – źródła literaturowe (numerowane w UI).
 *
 *  Reguła przeliczeniowa (z mas. cz. M, w g/mol):
 *    SI: nmol/L (z masy/objętości)
 *      μg/dL  → nmol/L  : 10000 / M
 *      ng/mL  → nmol/L  :  1000 / M
 *      ng/dL  → nmol/L  :    10 / M
 *      pg/mL  → nmol/L  :     1 / M
 *    SI: pmol/L
 *      pg/mL  → pmol/L  :  1000 / M
 *      ng/dL  → pmol/L  : 10000 / M
 *      ng/L   → pmol/L  :  1000 / M
 *    SI: μmol/L
 *      μg/dL  → μmol/L  :    10 / M
 *      μg/mL  → μmol/L  :  1000 / M
 *
 *  Wartości MW i czynników zaokrąglono do 4 cyfr znaczących z surowych
 *  obliczeń wzoru sumarycznego (CAS / PubChem).  Drobne różnice względem
 *  zewnętrznych kalkulatorów (np. childmetrics.org) wynikają z innego
 *  zaokrąglenia – w obliczeniach używamy współczynnika bezpośrednio,
 *  nie liczonego ponownie z MW.
 * --------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // Stała używana w komentarzach do oznaczania, że dany przelicznik nie wynika
  // wprost z masy cząsteczkowej tylko ze standardu międzynarodowego (WHO IS).
  // Pozostawiamy ją do ewentualnej rozbudowy o jednostki biologiczne (mIU/L itp.).
  var WHO_IS = 'WHO IS';                                       // (na razie nieużywane – placeholder)

  var SUBSTANCES = [

    /* ───────────── Glikokortykosteroidy / oś nadnerczowa ───────────── */

    {
      id: 'cortisol',
      label_pl: 'Kortyzol',
      label_en: 'Cortisol',
      aliases: ['hydrocortisone (endogenny)', 'F', 'compound F'],
      group: 'Kora nadnerczy – glikokortykosteroidy',
      mw: 362.46,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)',  kind: 'si',   factor_to_si: 1 },
        { symbol: 'μmol/L', label: 'μmol/L',        kind: 'si',   factor_to_si: 1000 },
        { symbol: 'μg/dL',  label: 'μg/dL',         kind: 'conv', factor_to_si: 27.59 },
        { symbol: 'ng/mL',  label: 'ng/mL',         kind: 'conv', factor_to_si: 2.759 },
        { symbol: 'ng/dL',  label: 'ng/dL',         kind: 'conv', factor_to_si: 0.02759 },
        { symbol: 'pg/mL',  label: 'pg/mL',         kind: 'conv', factor_to_si: 0.002759 }
      ],
      precision: 3,
      ranges_pl: [
        'Surowica, rano (≈ 8:00): 138–690 nmol/L (5–25 μg/dL)',
        'Surowica, wieczorem (≈ 23:00): < 138 nmol/L (< 5 μg/dL)',
        'Po 1 mg deksametazonu (overnight): < 50 nmol/L (< 1,8 μg/dL)'
      ],
      notes_pl: 'Stężenie zależne od rytmu dobowego, stresu, ciąży, doustnej antykoncepcji (↑ CBG) oraz porze pobrania. Wartości progu po DST 50 nmol/L wg The Endocrine Society 2008/2016.',
      sources: ['Tietz', 'Endocrine Society 2008']
    },

    {
      id: 'acth',
      label_pl: 'ACTH (kortykotropina)',
      label_en: 'ACTH (corticotropin)',
      aliases: ['adrenokortykotropina', 'corticotropin'],
      group: 'Kora nadnerczy – glikokortykosteroidy',
      mw: 4541.1,                                              // peptyd 39-aa (ludzki ACTH)
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.2203 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 0.2203 }
      ],
      precision: 3,
      ranges_pl: [
        'Surowica, rano (≈ 8:00): 2,2–13,3 pmol/L (10–60 pg/mL)',
        'Wieczorem: zwykle < 5 pmol/L (< 20 pg/mL)'
      ],
      notes_pl: 'Pobranie do schłodzonej probówki EDTA i szybkie odwirowanie – ACTH jest niestabilny w temperaturze pokojowej. ng/L i pg/mL są liczbowo identyczne.',
      sources: ['Tietz', 'Mayo Clinic Labs']
    },

    {
      id: 'aldosterone',
      label_pl: 'Aldosteron',
      label_en: 'Aldosterone',
      aliases: ['ALD'],
      group: 'Kora nadnerczy – mineralokortykosteroidy',
      mw: 360.44,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 1000 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 2.774 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 27.74 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 2.774 }
      ],
      precision: 3,
      ranges_pl: [
        'Pozycja leżąca (rano): 30–440 pmol/L (1–16 ng/dL)',
        'Pozycja siedząca (po 2 h): 100–860 pmol/L (4–31 ng/dL)',
        'Stosunek ARR (aldosteron pmol/L / PRA ng/mL/h) > 750 → podejrzenie PA'
      ],
      notes_pl: 'Interpretacja wymaga znajomości pozycji ciała przy pobraniu, podaży sodu i przyjmowanych leków (β‑blokery, MRA, ACEI/ARB, NLPZ).',
      sources: ['Tietz', 'Endocrine Society PA Guideline 2016']
    },

    {
      id: 'deoxycortisol_11',
      label_pl: '11-deoksykortyzol (związek S)',
      label_en: '11-Deoxycortisol',
      aliases: ['compound S', 'kortodoksyn', '11-DOC nie mylić z 11-deoksykortykosteronem'],
      group: 'Kora nadnerczy – prekursory steroidogenezy',
      mw: 346.46,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.02886 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.886 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.002886 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli, bazalnie: < 1,5 nmol/L (< 52 ng/dL)',
        'Test z metyraponem (8 h po dawce): > 200 nmol/L (> 7 μg/dL) – prawidłowa rezerwa osi'
      ],
      notes_pl: 'Marker testu z metyraponem oraz niedoboru 11β‑hydroksylazy (CAH typ IV). Łatwo pomylić z 11-deoksykortykosteronem (DOC) – to inna substancja.',
      sources: ['Tietz', 'ESPE/Endocrine Society CAH 2018']
    },

    {
      id: 'corticosterone',
      label_pl: 'Kortykosteron (związek B)',
      label_en: 'Corticosterone',
      aliases: ['compound B'],
      group: 'Kora nadnerczy – prekursory steroidogenezy',
      mw: 346.46,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.02886 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.886 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.002886 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli, rano: 3,5–60 nmol/L (130–2 080 ng/dL)'
      ],
      notes_pl: 'Wzór sumaryczny C21H30O4 (taki sam jak 11-deoksykortyzol) – stąd identyczne czynniki przeliczeniowe. Marker niedoboru 17α‑hydroksylazy (↑ kortykosteron, ↓ kortyzol).',
      sources: ['Tietz']
    },

    {
      id: 'oh17_progesterone',
      label_pl: '17-OH-progesteron (17-OHP)',
      label_en: '17α-Hydroxyprogesterone',
      aliases: ['17 OHP', '17α-OHP'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 330.46,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03026 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.026 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003026 }
      ],
      precision: 3,
      ranges_pl: [
        'Faza folikularna: < 3 nmol/L (< 100 ng/dL)',
        'Faza lutealna: 3–10 nmol/L (100–330 ng/dL)',
        'Mężczyźni dorośli: < 6 nmol/L (< 200 ng/dL)',
        'Test ACTH – odcięcie dla CAH 21-OH: stymulowany 17-OHP > 30 nmol/L (> 1 000 ng/dL)'
      ],
      notes_pl: 'Pobierać rano i w fazie folikularnej cyklu. Pułapki: ↑ w niedoborze 21-hydroksylazy, ale również w torbielach jajnika i NCAH.',
      sources: ['Tietz', 'ESPE/Endocrine Society CAH 2018']
    },

    {
      id: 'oh17_pregnenolone',
      label_pl: '17-OH-pregnenolon',
      label_en: '17α-Hydroxypregnenolone',
      aliases: ['17-OH preg'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 332.48,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03008 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.008 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003008 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli, bazalnie: 1,1–9,9 nmol/L (36–330 ng/dL)',
        'Po stymulacji ACTH: > 30-krotny wzrost względem 17-OHP → 3β-HSD deficiency'
      ],
      notes_pl: 'Marker niedoboru 3β‑HSD oraz CAH typu III; oznaczany razem z 17-OHP w teście z ACTH.',
      sources: ['Tietz']
    },

    {
      id: 'pregnenolone',
      label_pl: 'Pregnenolon',
      label_en: 'Pregnenolone',
      aliases: ['Δ5-pregnenolone'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 316.48,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03160 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.160 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli mężczyźni: 0,3–3,2 nmol/L (10–100 ng/dL)',
        'Dorosłe kobiety: 0,3–3,2 nmol/L (10–100 ng/dL)'
      ],
      notes_pl: 'Pierwszy steroid w szlaku z cholesterolu (StAR + CYP11A1). Oznaczany rzadko – głównie w diagnostyce wrodzonych defektów steroidogenezy.',
      sources: ['Tietz']
    },

    /* ───────────── Androgeny ───────────── */

    {
      id: 'dhea',
      label_pl: 'DHEA (dehydroepiandrosteron)',
      label_en: 'Dehydroepiandrosterone',
      aliases: ['prasterone', 'DHA'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03467 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.467 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli mężczyźni: 6–25 nmol/L (180–720 ng/dL)',
        'Dorosłe kobiety (premenopauza): 5–20 nmol/L (140–580 ng/dL)'
      ],
      notes_pl: 'W laboratoriach częściej oznacza się DHEA-S (stabilniejszy, nie podlega rytmowi dobowemu).',
      sources: ['Tietz']
    },

    {
      id: 'dhea_s',
      label_pl: 'DHEA-S (siarczan DHEA)',
      label_en: 'Dehydroepiandrosterone sulfate',
      aliases: ['DHEAS', 'DHA-S'],
      group: 'Androgeny',
      mw: 368.49,                                              // wolny kwas; sól sodowa 390.49
      canonical_si: 'μmol/L',
      units: [
        { symbol: 'μmol/L', label: 'μmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 0.001 },
        { symbol: 'μg/dL',  label: 'μg/dL',        kind: 'conv', factor_to_si: 0.02714 },
        { symbol: 'μg/mL',  label: 'μg/mL',        kind: 'conv', factor_to_si: 2.714 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 0.002714 }
      ],
      precision: 3,
      ranges_pl: [
        'Mężczyźni 18–30 lat: 4,3–12 μmol/L (160–450 μg/dL)',
        'Mężczyźni 60–70 lat: 1,1–5,4 μmol/L (40–200 μg/dL)',
        'Kobiety 18–30 lat: 1,9–9,4 μmol/L (70–350 μg/dL)',
        'Kobiety > 60 lat: 0,3–4,1 μmol/L (10–150 μg/dL)'
      ],
      notes_pl: 'Stężenie spada liniowo z wiekiem („adrenopauza"). Bardzo wysokie wartości (> 20 μmol/L u kobiet) – sygnał ostrzegawczy w kierunku guza nadnercza.',
      sources: ['Tietz', 'Mayo Clinic Labs']
    },

    {
      id: 'androstenedione',
      label_pl: 'Androstendion (Δ4)',
      label_en: 'Androstenedione',
      aliases: ['Δ4-androstendion', 'A4'],
      group: 'Androgeny',
      mw: 286.41,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03491 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.491 }
      ],
      precision: 3,
      ranges_pl: [
        'Mężczyźni dorośli: 1,2–8,7 nmol/L (35–250 ng/dL)',
        'Kobiety (faza folikularna): 1,2–10,5 nmol/L (35–300 ng/dL)',
        'Po menopauzie: < 4,2 nmol/L (< 120 ng/dL)'
      ],
      notes_pl: 'Wzrasta w PCOS i NCAH; służy też do oceny skuteczności leczenia hydrokortyzonem w CAH (cel: w połowie zakresu normy dla wieku).',
      sources: ['Tietz']
    },

    {
      id: 'testosterone_total',
      label_pl: 'Testosteron całkowity',
      label_en: 'Total testosterone',
      aliases: ['T', 'TT'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03467 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.467 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003467 }
      ],
      precision: 3,
      ranges_pl: [
        'Mężczyźni dorośli (rano): 8,6–29 nmol/L (250–840 ng/dL)',
        'Próg hipogonadyzmu (Endocrine Society 2018): < 9,2 nmol/L (< 264 ng/dL) potwierdzony 2-krotnie',
        'Kobiety dorosłe: 0,3–2,4 nmol/L (8–70 ng/dL)'
      ],
      notes_pl: 'Pobranie rano (7–10), na czczo. Powtórzyć w razie nieprawidłowego wyniku. Interpretacja w kontekście SHBG i albuminy.',
      sources: ['Tietz', 'Endocrine Society Male Hypogonadism 2018']
    },

    {
      id: 'testosterone_free',
      label_pl: 'Testosteron wolny',
      label_en: 'Free testosterone',
      aliases: ['fT', 'wolny T'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.467 },
        { symbol: 'pg/dL',  label: 'pg/dL',        kind: 'conv', factor_to_si: 0.3467 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 34.67 }
      ],
      precision: 3,
      ranges_pl: [
        'Mężczyźni dorośli: 174–729 pmol/L (50–210 pg/mL)',
        'Kobiety dorosłe: 1,7–22 pmol/L (0,5–6,3 pg/mL)'
      ],
      notes_pl: 'Najwiarygodniejszy: ekwilibrium dialysis. Frakcja wolna obliczana ze SHBG/albuminy jest dopuszczalna; bezpośrednie immunoassaye są niezalecane.',
      sources: ['Endocrine Society Male Hypogonadism 2018']
    },

    {
      id: 'dht',
      label_pl: 'DHT (5α-dihydrotestosteron)',
      label_en: 'Dihydrotestosterone',
      aliases: ['5α-DHT', 'androstanolone'],
      group: 'Androgeny',
      mw: 290.44,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03443 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.443 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003443 }
      ],
      precision: 3,
      ranges_pl: [
        'Mężczyźni dorośli: 1,0–3,1 nmol/L (30–90 ng/dL)',
        'Kobiety dorosłe: 0,1–0,9 nmol/L (3–25 ng/dL)',
        'Stosunek T/DHT > 20 (po hCG) → podejrzenie niedoboru 5α-reduktazy'
      ],
      notes_pl: 'Stężenie zależy od aktywności 5α‑reduktazy; obniżone u osób na finasterydzie/dutasterydzie.',
      sources: ['Tietz']
    },

    /* ───────────── Estrogeny / progesteron ───────────── */

    {
      id: 'estradiol',
      label_pl: 'Estradiol (E2)',
      label_en: '17β-Estradiol',
      aliases: ['E2', '17β-E2'],
      group: 'Estrogeny / progesteron',
      mw: 272.38,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 1000 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.671 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 3.671 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 36.71 }
      ],
      precision: 3,
      ranges_pl: [
        'Faza folikularna wczesna: 70–290 pmol/L (19–80 pg/mL)',
        'Pik owulacyjny: 380–1 460 pmol/L (105–400 pg/mL)',
        'Faza lutealna: 200–770 pmol/L (55–210 pg/mL)',
        'Postmenopauza: < 110 pmol/L (< 30 pg/mL)',
        'Mężczyźni dorośli: 40–160 pmol/L (10–45 pg/mL)'
      ],
      notes_pl: 'Bardzo wysokie pomiary u dzieci często odzwierciedlają ograniczenia immunoassay’ów – preferowana metoda u dzieci to LC-MS/MS.',
      sources: ['Tietz']
    },

    {
      id: 'estrone',
      label_pl: 'Estron (E1)',
      label_en: 'Estrone',
      aliases: ['E1'],
      group: 'Estrogeny / progesteron',
      mw: 270.37,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.699 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 3.699 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 36.99 }
      ],
      precision: 3,
      ranges_pl: [
        'Faza folikularna: 110–400 pmol/L (30–110 pg/mL)',
        'Postmenopauza: 30–130 pmol/L (7–35 pg/mL)',
        'Mężczyźni dorośli: 40–180 pmol/L (10–50 pg/mL)'
      ],
      notes_pl: 'Główny estrogen po menopauzie (powstaje z androstendionu w tk. tłuszczowej). Może być pomocny w diagnostyce ekto- i feminizacji.',
      sources: ['Tietz']
    },

    {
      id: 'progesterone',
      label_pl: 'Progesteron',
      label_en: 'Progesterone',
      aliases: ['P4'],
      group: 'Estrogeny / progesteron',
      mw: 314.46,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.180 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03180 }
      ],
      precision: 3,
      ranges_pl: [
        'Faza folikularna: < 3,2 nmol/L (< 1 ng/mL)',
        'Faza lutealna (środek): 16–95 nmol/L (5–30 ng/mL)',
        'Progesteron 21. d.c. > 30 nmol/L (> 10 ng/mL) → potwierdza owulację',
        'Mężczyźni dorośli: 0,3–1,3 nmol/L (0,1–0,4 ng/mL)'
      ],
      notes_pl: 'Najczęstsze zastosowanie: potwierdzenie owulacji (21. d.c.), monitorowanie wczesnej ciąży.',
      sources: ['Tietz']
    },

    /* ───────────── Witamina D ───────────── */

    {
      id: 'vit_d_25oh',
      label_pl: '25-OH wit. D (25-OHD)',
      label_en: '25-Hydroxyvitamin D',
      aliases: ['kalcydiol', 'calcidiol', '25(OH)D'],
      group: 'Witamina D',
      mw: 400.64,                                              // domyślnie D3 (kalcydiol); D2 = 412,65
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.496 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 2.496 }
      ],
      precision: 3,
      ranges_pl: [
        'Niedobór: < 50 nmol/L (< 20 ng/mL)',
        'Stężenie suboptymalne: 50–75 nmol/L (20–30 ng/mL)',
        'Optymalne: 75–125 nmol/L (30–50 ng/mL)',
        'Górny próg bezpieczny: < 250 nmol/L (< 100 ng/mL)'
      ],
      notes_pl: 'Współczynnik 2,496 dotyczy 25-OH-D3. Dla 25-OH-D2 dokładny współczynnik to 2,422; różnica < 4 % i klinicznie nieistotna.',
      sources: ['Endocrine Society Vit D 2024', 'Polski konsensus wit. D 2023']
    },

    {
      id: 'vit_d_1_25',
      label_pl: '1,25(OH)₂ wit. D (kalcytriol)',
      label_en: '1,25-Dihydroxyvitamin D',
      aliases: ['kalcytriol', 'calcitriol', '1,25(OH)2D', '1,25-D'],
      group: 'Witamina D',
      mw: 416.64,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 2.400 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 2.400 },
        { symbol: 'pg/dL',  label: 'pg/dL',        kind: 'conv', factor_to_si: 0.2400 }
      ],
      precision: 3,
      ranges_pl: [
        'Dorośli: 48–168 pmol/L (20–70 pg/mL)',
        'Dzieci: 60–240 pmol/L (25–100 pg/mL)'
      ],
      notes_pl: 'Czas półtrwania ≈ 4 h; nie jest dobrym wskaźnikiem zaopatrzenia w wit. D. Oznaczać celowo: ChNN, sarkoidoza, granulomatozy, dziedziczne krzywice.',
      sources: ['Tietz']
    },

    {
      id: 'vit_d3',
      label_pl: 'Wit. D₃ (cholekalcyferol)',
      label_en: 'Vitamin D3 (cholecalciferol)',
      aliases: ['cholekalcyferol', 'D3'],
      group: 'Witamina D',
      mw: 384.64,
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.600 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 2.600 },
        { symbol: 'IU/L',   label: 'IU/L',         kind: 'conv', factor_to_si: 0.0650 }   // 1 μg D3 ≡ 40 IU → 1 IU = 0,025 μg/L = 0,065 nmol/L
      ],
      precision: 3,
      ranges_pl: [
        'Macierzysta wit. D₃ rzadko oznaczana w rutynie; służy do oceny niedawnej podaży/suplementacji.',
        'Przelicznik: 1 μg D₃ ≡ 40 IU'
      ],
      notes_pl: 'Nie mylić z 25-OH-D. Wit. D₃ ma bardzo krótki t½ (24 h); nie odzwierciedla zaopatrzenia.',
      sources: ['Tietz', 'IOM 2011']
    }
  ];

  // ────────────────────────────────────────────────────────────────
  //  Eksport (UMD-light – globalny obiekt i opcjonalny module.exports)
  // ────────────────────────────────────────────────────────────────
  var api = {
    list: function () { return SUBSTANCES.slice(); },
    find: function (id) {
      for (var i = 0; i < SUBSTANCES.length; i++) {
        if (SUBSTANCES[i].id === id) return SUBSTANCES[i];
      }
      return null;
    },
    groups: function () {
      var seen = {};
      var out = [];
      for (var i = 0; i < SUBSTANCES.length; i++) {
        var g = SUBSTANCES[i].group;
        if (!seen[g]) { seen[g] = true; out.push(g); }
      }
      return out;
    },
    version: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.LabUnitsData = api;
})(typeof window !== 'undefined' ? window : this);
