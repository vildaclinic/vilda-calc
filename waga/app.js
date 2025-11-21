// Usunięto document.write – wstawianie roku może być realizowane w HTML (footer) lub poprzez JS w konkretnym elemencie.


const snacks={
  snickers:{name:'Snickers 50 g',kcal:244},
  bounty:{name:'Bounty 57 g',kcal:268},
  knoppers:{name:'Knoppers 25 g',kcal:140},
  prince:{name:'Prince Polo 50 g',kcal:264},
  banana:{name:'Banan 100 g',kcal:90},
  cola:{name:'Napój gazowany 330 ml',kcal:139},
  ice:{name:'Lody waniliowe 100 g',kcal:201},
  chocolate:{name:'Czekolada mleczna 25 g',kcal:134},
  watermelon:{name:'Arbuz 100 g',kcal:30},
  cookie:{name:'Ciastko digestive 15 g',kcal:70},
  twix:{name:'Twix 50 g',kcal:248},
  kitkat:{name:'KitKat 45 g',kcal:233},
  chips:{name:'Chipsy 30 g',kcal:160},
  pretzel:{name:'Paluszki 50 g',kcal:170},
  yogurt:{name:'Jogurt owocowy 150 g',kcal:135},
};

const meals={
  burger:{name:'Burger z frytkami',kcal:900},
  pizza:{name:'Pizza pepperoni (¼ 30 cm)',kcal:650},
  pierogi:{name:'Pierogi ruskie (8 szt.)',kcal:560},
  spaghetti:{name:'Spaghetti bolognese 350 g',kcal:600},
  caesar:{name:'Sałatka Cezar z kurczakiem',kcal:450},
  sushi:{name:'Sushi 10 kawałków',kcal:400},
  kebab:{name:'Kebab (tortilla)',kcal:800},
  pancake:{name:'Naleśniki z serem (2 szt.)',kcal:500},
  schabowy:{name:'Schabowy + ziemniaki',kcal:800},
  goulash:{name:'Zupa gulaszowa 500 ml',kcal:300}
  ,
  // zdrowe dania obiadowe
  salmonVeg:{name:'Pieczony łosoś z warzywami',kcal:497},         // porcja ok. 497 kcal【918506249692002†L123-L125】
  chickenVeg:{name:'Kurczak z warzywami',kcal:312},               // porcja ok. 311.70 kcal【649449096573369†L89-L96】
  codVeg:{name:'Dorsz pieczony z warzywami',kcal:316},            // porcja ok. 316 kcal【834903328199348†L96-L115】
  chickenRice:{name:'Kurczak z ryżem i warzywami',kcal:405},       // porcja ok. 405 kcal【350067898666867†L96-L112】
  broccoliSoup:{name:'Krem z brokułów 300 ml',kcal:180},          // porcja (ok. 300 ml) ma ~180 kcal【551356620879766†L83-L84】
  // wegetariańskie dania obiadowe
  greekSalad:{name:'Sałatka grecka',kcal:300},                    // klasyczna sałatka grecka ~300 kcal【184874442693322†L139-L146】
  chickpeaCurry:{name:'Curry z ciecierzycą i warzywami',kcal:200},// porcja ok. 200 kcal【167335359881055†L275-L283】
  vegLasagna:{name:'Lasagne wegetariańska',kcal:370},             // porcja ok. 370 kcal【483050372296064†L58-L79】
  tofuStirfry:{name:'Stir-fry z tofu i warzywami',kcal:265}       // porcja ok. 264.5 kcal【856998649874928†L190-L199】
};

// === USTAWIENIA KLINICZNE ===
const ADULT_BMI = { UNDER: 18.5, OVER: 25, OBESE: 30 };
// Ujednolicone progi BMI dla dzieci: nadwaga od 85. centyla, otyłość od 97. centyla
// Zarówno w siatkach WHO, jak i OLAF obowiązują teraz te same wartości progowe.
const CHILD_THRESH_WHO  = { NORMAL_HI: 85, OBESE: 97 };
const CHILD_THRESH_OLAF = { NORMAL_HI: 85, OBESE: 97 };
const KCAL_PER_KG = 7700;         // 1 kg tkanki tłuszczowej ≈ 7700 kcal
const Z85 = 1.036;  // z‑score dla 85. centyla (WHO próg nadwagi)
const Z90 = 1.282;        // z‑score dla 90. centyla (OLAF – próg nadwagi)

// ---- NOWE STAŁE --------------------------------------------
/* Z‑score skrajnych centyli */
const Z3  = -1.8808;      // 3. centyl  (≈‑2 SD)
const Z97 =  1.8808;      // 97. centyl (≈+2 SD)
/* ==================  K O N S T A N T Y  ====================== */
const PAL_OPTIONS = {
  1.2: 'bardzo niska',
  1.4: 'niska',
  1.6: 'umiarkowana',
  1.8: 'wysoka',
  2.0: 'bardzo wysoka'
};

const DIET_LEVELS = {
  light:   { label:'lekka',       deficitPct:0.15, maxDeficit:500 },
  moderate:{ label:'umiarkowana', deficitPct:0.22, maxDeficit:750 },
  intense: { label:'intensywna',  deficitPct:0.30, maxDeficit:1000 }
};

// Opisy diet redukcyjnych w języku polskim. Każda dieta ma krótki opis
// wyjaśniający charakter deficytu kalorycznego oraz docelowe tempo utraty wagi.
const DIET_DESCRIPTIONS = {
  light: 'Dieta lekka – niewielki deficyt ok. 15% całkowitego wydatku energetycznego (300–500 kcal/dzień),\npozwalający na utratę ok. 0,25–0,5 kg tygodniowo. Odpowiednia dla dzieci i osób z niewielką nadwagą;\nzachęca do stopniowych zmian bez ryzyka niedoborów.',
  // w opisach diet rozwijamy skrót TEE do "całkowitego wydatku energetycznego" dla lepszej czytelności
  moderate: 'Dieta umiarkowana – deficyt ok. 22% całkowitego wydatku energetycznego (500–750 kcal/dzień),\nco zwykle prowadzi do utraty ok. 0,5 kg tygodniowo. Zalecana jako domyślna zgodnie z konsensusem WHO i CDC;\npomaga redukować tkankę tłuszczową przy minimalnej utracie mięśni.',
  intense: 'Dieta intensywna – duży deficyt ok. 30% całkowitego wydatku energetycznego (750–1000 kcal/dzień) i szybsze tempo utraty (0,8–1 kg/tydzień).\nPrzeznaczona dla osób z otyłością i tylko pod nadzorem specjalisty;\nmoże wiązać się z większym ryzykiem niedoborów i efektu jojo.'
};

// =======================================================================
//  Tooltip helper for disabled menu items
//
//  Aby uniknąć pełnoekranowych okien alert, które przerywają działanie
//  aplikacji, tworzymy niestandardowy tooltip.  Funkcja showTooltip()
//  wyświetla niewielką etykietę z wiadomością obok wskazanego elementu.
//  Tooltip znika automatycznie po kilku sekundach.  Dzięki temu
//  użytkownik otrzymuje natychmiastową informację, dlaczego przycisk
//  jest nieaktywny, bez przerywania pracy całej strony.
let __menuTooltip = null;
function showTooltip(target, message) {
  if (!target || !message) return;
  // Usuń poprzedni tooltip, jeśli istnieje
  if (__menuTooltip) {
    __menuTooltip.remove();
    __menuTooltip = null;
  }
  const tooltip = document.createElement('div');
  tooltip.className = 'menu-tooltip';
  tooltip.textContent = message;
  document.body.appendChild(tooltip);
  // Ustaw pozycję: obok (na prawo) wskazanego elementu, aby nie zasłaniać menu
  const rect = target.getBoundingClientRect();
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  // Oblicz podstawową pozycję: po prawej stronie elementu i na wysokości jego górnej krawędzi
  let left = rect.right + scrollX + 8;
  let top = rect.top + scrollY;
  // Pobierz wymiary tooltipu (wymaga, aby tooltip był już wstawiony do DOM)
  const tooltipRect = { width: tooltip.offsetWidth, height: tooltip.offsetHeight };
  // Jeśli tooltip wyjdzie poza prawą krawędź ekranu, dostosuj lewą pozycję tak, aby pozostał widoczny
  if (left + tooltipRect.width > window.innerWidth) {
    left = Math.max(scrollX, window.innerWidth - tooltipRect.width - 10);
  }
  // Jeśli tooltip wyjdzie poza dolną krawędź okna, przesuń go w górę
  if (top + tooltipRect.height > window.innerHeight + scrollY) {
    top = Math.max(scrollY, window.innerHeight + scrollY - tooltipRect.height - 10);
  }
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  // Ustaw pełną widoczność
  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
  });
  __menuTooltip = tooltip;
  // Automatyczne ukrycie po 3 sekundach
  setTimeout(() => {
    if (__menuTooltip) {
      __menuTooltip.style.opacity = '0';
      // Usuń tooltip po zakończeniu animacji zanikania
      setTimeout(() => {
        if (__menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      }, 200);
    }
  }, 2000);
}

// -----------------------------------------------------------------------------
// Globalna zmienna kontrolująca tryb wyświetlania wyników
// professionalMode = true  → tryb profesjonalny: wyświetla Z‑score dla wagi,
//                           wzrostu i BMI
// professionalMode = false → tryb standardowy: ukrywa te wartości
// Wartość ta jest modyfikowana przez przełącznik umieszczony w karcie BMI
// (resultsModeToggle) oraz zapisywana w localStorage, aby stan został
// zachowany pomiędzy sesjami.
let professionalMode = false;


// === Komunikaty po wczytaniu danych ===
// Funkcje odpowiedzialne za pokazywanie i ukrywanie informacji, że dane
// z pliku JSON zostały pomyślnie załadowane. Zdefiniowany w HTML
// element #loadDataMessage jest domyślnie ukryty; po wczytaniu danych
// jest ustawiany na widoczny. Gdy użytkownik zaczyna wpisywać nowe dane
// lub czyści formularz, komunikat jest ukrywany ponownie.
// Zachowujemy domyślną treść komunikatu z prawej kolumny w zmiennej globalnej.
// Dzięki temu możemy przywrócić pierwotny tekst, gdy użytkownik zacznie nową sesję
// (np. po wyczyszczeniu danych).  Zmienna ta jest ustawiana raz podczas
// ładowania DOM w funkcji initDefaultCompareInstruction().
let defaultCompareInstructionHTML = '';

/**
 * Inicjalizuje domyślne brzmienie komunikatu w kolumnie prawej (#compareInstruction).
 * Funkcja zapisuje aktualny HTML tego elementu w zmiennej globalnej
 * defaultCompareInstructionHTML.  Jest wywoływana raz po załadowaniu DOM.
 */
function initDefaultCompareInstruction() {
  try {
    const ci = document.getElementById('compareInstruction');
    if (ci && !defaultCompareInstructionHTML) {
      defaultCompareInstructionHTML = ci.innerHTML;
    }
  } catch (_) {
    /* ignoruj błędy inicjalizacji */
  }
}

// Zapisz domyślną treść komunikatu w prawej kolumnie po załadowaniu DOM.  
// Używamy tego, aby móc przywrócić instrukcję podczas rozpoczęcia nowej sesji.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDefaultCompareInstruction);
  } else {
    initDefaultCompareInstruction();
  }
}

function showLoadDataMessage(){
  // Przy wczytaniu danych chcemy przenieść komunikat o sukcesie z sekcji formularza
  // do prawej kolumny.  Ukrywamy oryginalny #loadDataMessage, aby nie dublować tekstów.
  const loadEl = document.getElementById('loadDataMessage');
  if (loadEl) loadEl.style.display = 'none';
  // Aktualizuj treść komunikatu w prawej kolumnie oraz pokaż go użytkownikowi.
  const ci = document.getElementById('compareInstruction');
  if (ci) {
    try {
      // Ukryj ewentualny link do instruktażu wideo – zgodnie z wymaganiami nie powinien pojawiać się przy
      // komunikacie o wczytaniu danych.  Jeśli w elemencie compareInstruction znajduje się element
      // #tutorialVideoLink, ustawiamy jego styl display na 'none'.
      const link = ci.querySelector('#tutorialVideoLink');
      if (link && link.style) {
        link.style.display = 'none';
      }
      // Ustaw treść komunikatu bez linku.  Używamy innerText, aby zapobiec interpretacji HTML.
      ci.innerText = 'Dane zostały wczytane prawidłowo. Wprowadź aktualną wagę, wzrost i wiek aby zobaczyć porównanie wyników.';
      ci.style.display = 'block';
    } catch (_) {
      /* ignoruj błędy aktualizacji treści */
    }
  }
  // Ukryj komunikat o błędzie/braku danych
  const eb = document.getElementById('errorBox');
  if (eb) eb.style.display = 'none';
}
function hideLoadDataMessage(){
  // Ukryj komunikat w sekcji formularza
  const loadEl = document.getElementById('loadDataMessage');
  if (loadEl) loadEl.style.display = 'none';
  // Przywróć treść i widoczność komunikatu w prawej kolumnie w zależności
  // od tego, czy zostały wczytane dane historyczne.  Jeżeli odczytaliśmy
  // pomiar z pliku (prevSummaryCard/Wrap ma atrybut loaded), instrukcja
  // pozostaje ukryta – pokazują się tam porównania.  W przeciwnym razie
  // przywracamy domyślną treść, aby poinformować użytkownika, że powinien
  // wprowadzić wymagane pola.
  const ci = document.getElementById('compareInstruction');
  if (ci) {
    let hasLoaded = false;
    try {
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      hasLoaded = (card && card.dataset && card.dataset.loaded === 'true') ||
                  (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
    } catch (_) {
      hasLoaded = false;
    }
    if (hasLoaded) {
      ci.style.display = 'none';
    } else {
      // Przywróć oryginalną treść instrukcji, jeśli została zapisana
      if (defaultCompareInstructionHTML) {
        ci.innerHTML = defaultCompareInstructionHTML;
      }
      ci.style.display = 'block';
    }
  }
}

/*
 * Oblicza wiek użytkownika jako liczbę lat z uwzględnieniem miesięcy.
 * Pobiera wartości z pól formularza: #age (lata) oraz opcjonalnie #ageMonths (miesiące).
 * Zwraca sumę lat oraz miesięcy/12. Jeśli pole miesięcy jest puste lub nie istnieje,
 * przyjmuje wartość 0. Wartości nieprawidłowe (puste, NaN) są traktowane jako 0.
 *
 * Funkcja ta jest używana w całej aplikacji do dokładniejszych obliczeń
 * zależnych od wieku (centyle, dawki leków, rekomendacje diet itp.).
 */
function getAgeDecimal(){
  const yearsInput  = document.getElementById('age');
  const monthsInput = document.getElementById('ageMonths');
  const years  = yearsInput  ? parseFloat(yearsInput.value)  || 0 : 0;
  const months = monthsInput ? parseFloat(monthsInput.value) || 0 : 0;
  // Zapewniamy, że miesiące mieszczą się w przedziale 0–11.
  const m = Math.max(0, Math.min(11, months));
  return years + m / 12;
}

// Szczegółowe informacje o dietach w postaci wypunktowanej.
// Każdy element tablicy zaczyna się małą literą i wyjaśnia najważniejsze aspekty danej diety.
const DIET_BULLETS = {
  light: [
    'niewielki deficyt (ok. 15 % całkowitego wydatku energetycznego, 300–500 kcal dziennie)',
    'utrata ok. 0,25–0,5 kg tygodniowo',
    'odpowiednia dla dzieci i osób z niewielką nadwagą',
    'zachęca do stopniowych zmian bez ryzyka niedoborów'
  ],
  moderate: [
    'deficyt ok. 22 % całkowitego wydatku energetycznego (500–750 kcal dziennie)',
    'utrata ok. 0,5 kg tygodniowo',
    'zalecana jako domyślna zgodnie z konsensusem WHO i CDC',
    'pomaga redukować tkankę tłuszczową przy minimalnej utracie mięśni'
  ],
  intense: [
    'duży deficyt ok. 30 % całkowitego wydatku energetycznego (750–1000 kcal dziennie)',
    'szybsza utrata masy (0,8–1 kg tygodniowo)',
    'przeznaczona dla osób z otyłością i tylko pod nadzorem specjalisty',
    'może wiązać się z większym ryzykiem niedoborów i efektu jojo'
  ]
};

// Opisy współczynników aktywności fizycznej PAL. Wyświetlane są po wyborze w formularzu,
// aby użytkownik świadomie określił swój poziom aktywności.
const PAL_DESCRIPTIONS = {
  1.2: 'PAL 1.2 – bardzo niska aktywność: brak ruchu, leżący tryb życia lub długotrwałe unieruchomienie.',
  1.4: 'PAL 1.4 – niska aktywność: praca siedząca, minimalna aktywność poza codziennymi czynnościami, brak regularnych ćwiczeń.',
  1.6: 'PAL 1.6 – umiarkowana aktywność: praca siedząca lub stojąca i 1–3 treningi lub dłuższe spacery w tygodniu.',
  1.8: 'PAL 1.8 – wysoka aktywność: praca fizyczna lub intensywne ćwiczenia kilka razy w tygodniu (4–5).',
  2.0: 'PAL 2.0 – bardzo wysoka aktywność: zawodowy sportowiec lub codzienne intensywne treningi.'
};

// === PULSE ANIMATION HELPERS ======================================
// Global variable controlling pulse mode: 'infinite' for continuous pulses or '2s' for single 2s flash.
// Default is continuous pulses.
window.PULSE_MODE = window.PULSE_MODE || 'infinite';

/**
 * Returns the CSS class for the given level ('danger' or 'warning') and current PULSE_MODE.
 * @param {string} level - 'danger' for red pulses, 'warning' for orange pulses.
 */
function pulseModeClass(level) {
  const mode = (window.PULSE_MODE === '2s') ? '2s' : 'infinite';
  return (level === 'danger') ? `pulse-danger-${mode}` : `pulse-warning-${mode}`;
}

/**
 * Clears any pulse classes from the element.
 * @param {HTMLElement} el
 */
function clearPulse(el) {
  if (!el) return;
  el.classList.remove('pulse-danger-infinite','pulse-warning-infinite','pulse-danger-2s','pulse-warning-2s');
}

/**
 * Applies the appropriate pulse class to the element based on the severity level.
 * Automatically clears other pulse classes before applying.
 * @param {HTMLElement} el
 * @param {string} level - 'danger' (red) or 'warning' (orange).
 */
function applyPulse(el, level) {
  if (!el) return;
  clearPulse(el);
  el.classList.add(pulseModeClass(level));
}

/**
 * Sets the global pulse mode. Accepts 'infinite' (continuous) or '2s' (single flash).
 * Reapplies pulse classes on all existing elements to reflect the new mode.
 * @param {string} mode
 */
window.setPulseMode = function(mode) {
  window.PULSE_MODE = (mode === '2s') ? '2s' : 'infinite';
  document.querySelectorAll('.pulse-danger-infinite, .pulse-warning-infinite, .pulse-danger-2s, .pulse-warning-2s')
    .forEach(el => {
      const wasDanger = el.classList.contains('pulse-danger-infinite') || el.classList.contains('pulse-danger-2s');
      clearPulse(el);
      applyPulse(el, wasDanger ? 'danger' : 'warning');
    });
};

// Attach event listener to optional checkbox controlling pulse duration
document.addEventListener('DOMContentLoaded', () => {
  const cb = document.getElementById('pulseOnce');
  if (!cb) return;
  cb.addEventListener('change', () => {
    window.setPulseMode(cb.checked ? '2s' : 'infinite');
    // Force restart of animations by toggling animation property
    document.querySelectorAll('.pulse-danger-infinite, .pulse-warning-infinite, .pulse-danger-2s, .pulse-warning-2s')
      .forEach(el => {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      });
  });
});

/**
 * Ustawia opis dla wybranej diety redukcyjnej. Pobiera opis z obiektu
 * DIET_DESCRIPTIONS i wstawia go do elementu #dietDesc. Jeśli klucz nie istnieje,
 * opis jest ukrywany.
 * @param {string} key – klucz diety ('light','moderate','intense')
 */
function updateDietDescription(key) {
  const descEl = document.getElementById('dietDesc');
  if (!descEl) return;
  const text = DIET_DESCRIPTIONS[key];
  if (text) {
    descEl.textContent = text;
    descEl.style.display = 'block';
  } else {
    descEl.textContent = '';
    descEl.style.display = 'none';
  }
}

/**
 * Ustawia opis dla wybranego współczynnika PAL. Pobiera opis z PAL_DESCRIPTIONS
 * i wyświetla go w elemencie #palDesc. Jeśli opis nie jest zdefiniowany,
 * element jest ukrywany.
 * @param {number|string} value – wybrany współczynnik PAL (np. '1.6')
 */
function updatePalDescription(value) {
  const descEl = document.getElementById('palDesc');
  if (!descEl) return;
  const key = parseFloat(value).toFixed(1);
  const text = PAL_DESCRIPTIONS[key];
  if (text) {
    descEl.textContent = text;
    descEl.style.display = 'block';
  } else {
    descEl.textContent = '';
    descEl.style.display = 'none';
  }
}

// Minimalna dzienna podaż energii (kcal)
const MIN_INTAKE_ADULT  = { M:1600, F:1200 }; // WHO / NIH konsensus
const MIN_INTAKE_CHILD  = 1200;               // absolutne minimum pediatryczne

/* ------------- znacznik: TRUE jeśli użyto alternatywnego źródła LMS ------------- */
let weightUsedFallback = false;   // resetowane w getChildLMS(...)

/* Percentyle progowe u dzieci */
const PERCENTILE_CUTOFF_UNDERWEIGHT = 5;
const PERCENTILE_EXTREME_LOW       = 3;

/*
 * Próg ostrzegawczy dla niskiego wzrostu u dzieci został skorygowany. Wcześniej
 * wyświetlaliśmy alert już dla dzieci z wynikiem poniżej 3 centyla, co
 * powodowało, że komunikat pojawiał się również przy dokładnie 3 centylu
 * (po zaokrągleniu). Zgodnie z nowymi wymaganiami, ostrzeżenie ma się
 * wyświetlać dopiero wtedy, gdy dziecko znajduje się co najmniej jeden
 * centyl poniżej 3 centyla – czyli przy percentylu < 2. Definiujemy
 * dodatkową stałą do obliczeń, aby nie wpływać na próg dla masy ciała.
 */
// (Historycznie używana przy „surowym” percentylu; bieżąca logika ostrzeżeń opiera się na roundedHeightCent)
const HEIGHT_WARNING_THRESHOLD = PERCENTILE_EXTREME_LOW; // 3
const PERCENTILE_EXTREME_HIGH      = 97;

/* Progi BMI anoreksji dorosłych */
const BMI_STARVATION_THRESHOLD = 13;  // <13  — zagrożenie życia
const BMI_SEVERE_ANOREXIA      = 15;  // <15  — bardzo ciężka
const BMI_HEAVY_ANOREXIA       = 16;  // <16  — ciężka
const BMI_MODERATE_ANOREXIA    = 17;  // <17  — umiarkowana
// (BMI <18.5 = ADULT_BMI.UNDER)

/* Granice wieku */
const CHILD_AGE_MIN      = 0.25;   // (3 mies.) – od tego wieku stosujemy siatki WHO
const CHILD_AGE_MAX      = 19;
const OLAF_DATA_MIN_AGE  = 3;   // od tego wieku są dane OLAF
const ADULT_AGE_THRESHOLD   = 18;
const SENIOR_AGE_THRESHOLD  = 60;

/* Zakres dopuszczalnych danych wejściowych */
const MIN_AGE    = 0.25;  // 3 mies.
const MAX_AGE    = 130;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 500;
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 250;

/* -------------------------------------------------------------------
 *  Dane WHO dla wskaźnika waga do długości/wzrostu (WFL)
 *
 *  W poniższych tablicach zamieszczono parametry L, M i S (LMS) dla
 *  pomiarów długości/leżącej i wzrostu u dziewczynek i chłopców od
 *  45 cm do 110 cm. Dane te pochodzą z tabel WHO „Weight-for-length:
 *  Birth to 2 years (z‑scores)” i pokrywają standardowy zakres długości
 *  dla dzieci do 5 lat (długości > 2 lat mieszczą się w tym samym
 *  przedziale centylowym). Dla wysokości spoza zakresu brzegowego
 *  wykorzystujemy wartości skrajne.
 *
 *  Każdy wiersz tablicy ma postać:
 *      [length_cm, L, M, S]
 *
 *  gdzie length_cm – długość lub wzrost w centymetrach,
 *        L – parametr Box‑Cox,
 *        M – mediana masy (kg) dla danej długości,
 *        S – współczynnik zmienności.
 */
const WFL_DATA_GIRLS = [[45.0,-0.3833,2.4607,0.09029],[45.5,-0.3833,2.5457,0.09033],[46.0,-0.3833,2.6306,0.09037],[46.5,-0.3833,2.7155,0.0904],[47.0,-0.3833,2.8007,0.09044],[47.5,-0.3833,2.8867,0.09048],[48.0,-0.3833,2.9741,0.09052],[48.5,-0.3833,3.0636,0.09056],[49.0,-0.3833,3.156,0.0906],[49.5,-0.3833,3.252,0.09064],[50.0,-0.3833,3.3518,0.09068],[50.5,-0.3833,3.4557,0.09072],[51.0,-0.3833,3.5636,0.09076],[51.5,-0.3833,3.6754,0.0908],[52.0,-0.3833,3.7911,0.09085],[52.5,-0.3833,3.9105,0.09089],[53.0,-0.3833,4.0332,0.09093],[53.5,-0.3833,4.1591,0.09098],[54.0,-0.3833,4.2875,0.09102],[54.5,-0.3833,4.4179,0.09106],[55.0,-0.3833,4.5498,0.0911],[55.5,-0.3833,4.6827,0.09114],[56.0,-0.3833,4.8162,0.09118],[56.5,-0.3833,4.95,0.09121],[57.0,-0.3833,5.0837,0.09125],[57.5,-0.3833,5.2173,0.09128],[58.0,-0.3833,5.3507,0.0913],[58.5,-0.3833,5.4834,0.09132],[59.0,-0.3833,5.6151,0.09134],[59.5,-0.3833,5.7454,0.09135],[60.0,-0.3833,5.8742,0.09136],[60.5,-0.3833,6.0014,0.09137],[61.0,-0.3833,6.127,0.09137],[61.5,-0.3833,6.2511,0.09136],[62.0,-0.3833,6.3738,0.09135],[62.5,-0.3833,6.4948,0.09133],[63.0,-0.3833,6.6144,0.09131],[63.5,-0.3833,6.7328,0.09129],[64.0,-0.3833,6.8501,0.09126],[64.5,-0.3833,6.9662,0.09123],[65.0,-0.3833,7.0812,0.09119],[65.5,-0.3833,7.195,0.09115],[66.0,-0.3833,7.3076,0.0911],[66.5,-0.3833,7.4189,0.09106],[67.0,-0.3833,7.5288,0.09101],[67.5,-0.3833,7.6375,0.09096],[68.0,-0.3833,7.7448,0.0909],[68.5,-0.3833,7.8509,0.09085],[69.0,-0.3833,7.9559,0.09079],[69.5,-0.3833,8.0599,0.09074],[70.0,-0.3833,8.163,0.09068],[70.5,-0.3833,8.2651,0.09062],[71.0,-0.3833,8.3666,0.09056],[71.5,-0.3833,8.4676,0.0905],[72.0,-0.3833,8.5679,0.09043],[72.5,-0.3833,8.6674,0.09037],[73.0,-0.3833,8.7661,0.09031],[73.5,-0.3833,8.8638,0.09025],[74.0,-0.3833,8.9601,0.09018],[74.5,-0.3833,9.0552,0.09012],[75.0,-0.3833,9.149,0.09005],[75.5,-0.3833,9.2418,0.08999],[76.0,-0.3833,9.3337,0.08992],[76.5,-0.3833,9.4252,0.08985],[77.0,-0.3833,9.5166,0.08979],[77.5,-0.3833,9.6086,0.08972],[78.0,-0.3833,9.7015,0.08965],[78.5,-0.3833,9.7957,0.08959],[79.0,-0.3833,9.8915,0.08952],[79.5,-0.3833,9.9892,0.08946],[80.0,-0.3833,10.0891,0.0894],[80.5,-0.3833,10.1916,0.08934],[81.0,-0.3833,10.2965,0.08928],[81.5,-0.3833,10.4041,0.08923],[82.0,-0.3833,10.514,0.08918],[82.5,-0.3833,10.6263,0.08914],[83.0,-0.3833,10.741,0.0891],[83.5,-0.3833,10.8578,0.08906],[84.0,-0.3833,10.9767,0.08903],[84.5,-0.3833,11.0974,0.089],[85.0,-0.3833,11.2198,0.08898],[85.5,-0.3833,11.3435,0.08897],[86.0,-0.3833,11.4684,0.08895],[86.5,-0.3833,11.594,0.08895],[87.0,-0.3833,11.7201,0.08895],[87.5,-0.3833,11.8461,0.08895],[88.0,-0.3833,11.972,0.08896],[88.5,-0.3833,12.0976,0.08898],[89.0,-0.3833,12.2229,0.089],[89.5,-0.3833,12.3477,0.08903],[90.0,-0.3833,12.4723,0.08906],[90.5,-0.3833,12.5965,0.08909],[91.0,-0.3833,12.7205,0.08913],[91.5,-0.3833,12.8443,0.08918],[92.0,-0.3833,12.9681,0.08923],[92.5,-0.3833,13.092,0.08928],[93.0,-0.3833,13.2158,0.08934],[93.5,-0.3833,13.3399,0.08941],[94.0,-0.3833,13.4643,0.08948],[94.5,-0.3833,13.5892,0.08955],[95.0,-0.3833,13.7146,0.08963],[95.5,-0.3833,13.8408,0.08972],[96.0,-0.3833,13.9676,0.08981],[96.5,-0.3833,14.0953,0.0899],[97.0,-0.3833,14.2239,0.09],[97.5,-0.3833,14.3537,0.0901],[98.0,-0.3833,14.4848,0.09021],[98.5,-0.3833,14.6174,0.09033],[99.0,-0.3833,14.7519,0.09044],[99.5,-0.3833,14.8882,0.09057],[100.0,-0.3833,15.0267,0.09069],[100.5,-0.3833,15.1676,0.09083],[101.0,-0.3833,15.3108,0.09096],[101.5,-0.3833,15.4564,0.0911],[102.0,-0.3833,15.6046,0.09125],[102.5,-0.3833,15.7553,0.09139],[103.0,-0.3833,15.9087,0.09155],[103.5,-0.3833,16.0645,0.0917],[104.0,-0.3833,16.2229,0.09186],[104.5,-0.3833,16.3837,0.09203],[105.0,-0.3833,16.547,0.09219],[105.5,-0.3833,16.7129,0.09236],[106.0,-0.3833,16.8814,0.09254],[106.5,-0.3833,17.0527,0.09271],[107.0,-0.3833,17.2269,0.09289],[107.5,-0.3833,17.4039,0.09307],[108.0,-0.3833,17.5839,0.09326],[108.5,-0.3833,17.7668,0.09344],[109.0,-0.3833,17.9526,0.09363],[109.5,-0.3833,18.1412,0.09382],[110.0,-0.3833,18.3324,0.09401]];

// Updated LMS parameters for boys: Weight-for-Length (birth to 2 years)
// Source: WHO infant weight‑for‑length percentiles table (<24 months) published on MSD Manuals【773130031888465†L1719-L1727】【773130031888465†L2360-L2372】.
// Each entry contains [length_cm, L, M, S]. The Power (L) parameter is constant (-0.3521) across lengths.
const WFL_DATA_BOYS = [
  [45.0,  -0.3521,  2.4410, 0.09182],
  [45.5,  -0.3521,  2.5244, 0.09153],
  [46.0,  -0.3521,  2.6077, 0.09124],
  [46.5,  -0.3521,  2.6913, 0.09094],
  [47.0,  -0.3521,  2.7755, 0.09065],
  [47.5,  -0.3521,  2.8609, 0.09036],
  [48.0,  -0.3521,  2.9480, 0.09007],
  [48.5,  -0.3521,  3.0377, 0.08977],
  [49.0,  -0.3521,  3.1308, 0.08948],
  [49.5,  -0.3521,  3.2276, 0.08919],
  [50.0,  -0.3521,  3.3278, 0.08890],
  [50.5,  -0.3521,  3.4311, 0.08861],
  [51.0,  -0.3521,  3.5376, 0.08831],
  [51.5,  -0.3521,  3.6477, 0.08801],
  [52.0,  -0.3521,  3.7620, 0.08771],
  [52.5,  -0.3521,  3.8814, 0.08741],
  [53.0,  -0.3521,  4.0060, 0.08711],
  [53.5,  -0.3521,  4.1354, 0.08681],
  [54.0,  -0.3521,  4.2693, 0.08651],
  [54.5,  -0.3521,  4.4066, 0.08621],
  [55.0,  -0.3521,  4.5467, 0.08592],
  [55.5,  -0.3521,  4.6892, 0.08563],
  [56.0,  -0.3521,  4.8338, 0.08535],
  [56.5,  -0.3521,  4.9796, 0.08507],
  [57.0,  -0.3521,  5.1259, 0.08481],
  [57.5,  -0.3521,  5.2721, 0.08455],
  [58.0,  -0.3521,  5.4180, 0.08430],
  [58.5,  -0.3521,  5.5632, 0.08406],
  [59.0,  -0.3521,  5.7074, 0.08383],
  [59.5,  -0.3521,  5.8501, 0.08362],
  [60.0,  -0.3521,  5.9907, 0.08342],
  [60.5,  -0.3521,  6.1284, 0.08324],
  [61.0,  -0.3521,  6.2632, 0.08308],
  [61.5,  -0.3521,  6.3954, 0.08292],
  [62.0,  -0.3521,  6.5251, 0.08279],
  [62.5,  -0.3521,  6.6527, 0.08266],
  [63.0,  -0.3521,  6.7786, 0.08255],
  [63.5,  -0.3521,  6.9028, 0.08245],
  [64.0,  -0.3521,  7.0255, 0.08236],
  [64.5,  -0.3521,  7.1467, 0.08229],
  [65.0,  -0.3521,  7.2666, 0.08223],
  [65.5,  -0.3521,  7.3854, 0.08218],
  [66.0,  -0.3521,  7.5034, 0.08215],
  [66.5,  -0.3521,  7.6206, 0.08213],
  [67.0,  -0.3521,  7.7370, 0.08212],
  [67.5,  -0.3521,  7.8526, 0.08212],
  [68.0,  -0.3521,  7.9674, 0.08214],
  [68.5,  -0.3521,  8.0816, 0.08216],
  [69.0,  -0.3521,  8.1955, 0.08219],
  [69.5,  -0.3521,  8.3092, 0.08224],
  [70.0,  -0.3521,  8.4227, 0.08229],
  [70.5,  -0.3521,  8.5358, 0.08235],
  [71.0,  -0.3521,  8.6480, 0.08241],
  [71.5,  -0.3521,  8.7594, 0.08248],
  [72.0,  -0.3521,  8.8697, 0.08254],
  [72.5,  -0.3521,  8.9788, 0.08262],
  [73.0,  -0.3521,  9.0865, 0.08269],
  [73.5,  -0.3521,  9.1927, 0.08276],
  [74.0,  -0.3521,  9.2974, 0.08283],
  [74.5,  -0.3521,  9.4010, 0.08289],
  [75.0,  -0.3521,  9.5032, 0.08295],
  [75.5,  -0.3521,  9.6041, 0.08301],
  [76.0,  -0.3521,  9.7033, 0.08307],
  [76.5,  -0.3521,  9.8007, 0.08311],
  [77.0,  -0.3521,  9.8963, 0.08314],
  [77.5,  -0.3521,  9.9902, 0.08317],
  [78.0,  -0.3521, 10.0827, 0.08318],
  [78.5,  -0.3521, 10.1741, 0.08318],
  [79.0,  -0.3521, 10.2649, 0.08316],
  [79.5,  -0.3521, 10.3558, 0.08313],
  [80.0,  -0.3521, 10.4475, 0.08308],
  [80.5,  -0.3521, 10.5405, 0.08301],
  [81.0,  -0.3521, 10.6352, 0.08293],
  [81.5,  -0.3521, 10.7322, 0.08284],
  [82.0,  -0.3521, 10.8321, 0.08273],
  [82.5,  -0.3521, 10.9350, 0.08260],
  [83.0,  -0.3521, 11.0415, 0.08246],
  [83.5,  -0.3521, 11.1516, 0.08231],
  [84.0,  -0.3521, 11.2651, 0.08215],
  [84.5,  -0.3521, 11.3817, 0.08198],
  [85.0,  -0.3521, 11.5007, 0.08181],
  [85.5,  -0.3521, 11.6218, 0.08163],
  [86.0,  -0.3521, 11.7444, 0.08145],
  [86.5,  -0.3521, 11.8678, 0.08128],
  [87.0,  -0.3521, 11.9916, 0.08111],
  [87.5,  -0.3521, 12.1152, 0.08096],
  [88.0,  -0.3521, 12.2382, 0.08082],
  [88.5,  -0.3521, 12.3603, 0.08069],
  [89.0,  -0.3521, 12.4815, 0.08058],
  [89.5,  -0.3521, 12.6017, 0.08048],
  [90.0,  -0.3521, 12.7209, 0.08041],
  [90.5,  -0.3521, 12.8392, 0.08034],
  [91.0,  -0.3521, 12.9569, 0.08030],
  [91.5,  -0.3521, 13.0742, 0.08026],
  [92.0,  -0.3521, 13.1910, 0.08025],
  [92.5,  -0.3521, 13.3075, 0.08025],
  [93.0,  -0.3521, 13.4239, 0.08026],
  [93.5,  -0.3521, 13.5404, 0.08029],
  [94.0,  -0.3521, 13.6572, 0.08034],
  [94.5,  -0.3521, 13.7746, 0.08040],
  [95.0,  -0.3521, 13.8928, 0.08047],
  [95.5,  -0.3521, 14.0120, 0.08056],
  [96.0,  -0.3521, 14.1325, 0.08067],
  [96.5,  -0.3521, 14.2544, 0.08078],
  [97.0,  -0.3521, 14.3782, 0.08092],
  [97.5,  -0.3521, 14.5038, 0.08106],
  [98.0,  -0.3521, 14.6316, 0.08122],
  [98.5,  -0.3521, 14.7614, 0.08139],
  [99.0,  -0.3521, 14.8934, 0.08157],
  [99.5,  -0.3521, 15.0275, 0.08177],
  [100.0, -0.3521, 15.1637, 0.08198],
  [100.5, -0.3521, 15.3018, 0.08220],
  [101.0, -0.3521, 15.4419, 0.08243],
  [101.5, -0.3521, 15.5838, 0.08267],
  [102.0, -0.3521, 15.7276, 0.08292],
  [102.5, -0.3521, 15.8732, 0.08317],
  [103.0, -0.3521, 16.0206, 0.08343],
  [103.5, -0.3521, 16.1697, 0.08370],
  [104.0, -0.3521, 16.3204, 0.08397],
  [104.5, -0.3521, 16.4728, 0.08425],
  [105.0, -0.3521, 16.6268, 0.08453],
  [105.5, -0.3521, 16.7826, 0.08481],
  [106.0, -0.3521, 16.9401, 0.08510],
  [106.5, -0.3521, 17.0995, 0.08539],
  [107.0, -0.3521, 17.2607, 0.08568],
  [107.5, -0.3521, 17.4237, 0.08599],
  [108.0, -0.3521, 17.5885, 0.08629],
  [108.5, -0.3521, 17.7553, 0.08660],
  [109.0, -0.3521, 17.9242, 0.08691],
  [109.5, -0.3521, 18.0954, 0.08723],
  [110.0, -0.3521, 18.2689, 0.08755]
];

/**
 * Zwraca parametry LMS dla podanej długości/wzrostu poprzez interpolację
 * pomiędzy punktami w tabeli WFL. Jeśli zadana długość znajduje się poza
 * zakresem tablicy, używa wartości skrajnych.
 *
 * @param {string} sex – 'M' dla chłopców, 'F' dla dziewczynek
 * @param {number} lengthCm – długość lub wzrost w centymetrach
 * @returns {Array} – [L, M, S] lub null, jeśli brak danych
 */
function getWflLMS(sex, lengthCm) {
  const data = (sex === 'M') ? WFL_DATA_BOYS : WFL_DATA_GIRLS;
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const minLen = data[0][0];
  const maxLen = data[data.length - 1][0];
  // Jeżeli długość poniżej minimalnej, zwróć pierwszy wiersz
  if (lengthCm <= minLen) return [data[0][1], data[0][2], data[0][3]];
  // Jeżeli powyżej zakresu, zwróć ostatni wiersz
  if (lengthCm >= maxLen) return [data[data.length-1][1], data[data.length-1][2], data[data.length-1][3]];
  // Znajdź dwa sąsiednie wiersze, pomiędzy którymi znajduje się długość
  for (let i = 0; i < data.length - 1; i++) {
    const h1 = data[i][0];
    const h2 = data[i+1][0];
    if (lengthCm >= h1 && lengthCm <= h2) {
      const t = (lengthCm - h1) / (h2 - h1);
      const L = data[i][1] + t * (data[i+1][1] - data[i][1]);
      const M = data[i][2] + t * (data[i+1][2] - data[i][2]);
      const S = data[i][3] + t * (data[i+1][3] - data[i][3]);
      return [L, M, S];
    }
  }
  return null;
}

/**
 * Oblicza Z‑score wskaźnika waga do długości/wzrostu (weight‑for‑length/height)
 * przy użyciu parametrów LMS oraz masy ciała. Dla L=0 stosuje wzór logarytmiczny.
 *
 * @param {number} weight – masa ciała w kg
 * @param {number} length – długość lub wzrost w cm
 * @param {string} sex – 'M' (chłopiec) lub 'F' (dziewczynka)
 * @returns {number|null} – Z‑score lub null, jeśli brak danych
 */
function computeWflZScore(weight, length, sex) {
  const lms = getWflLMS(sex, length);
  if (!lms) return null;
  const [L, M, S] = lms;
  if (M === 0 || S === 0) return null;
  if (L !== 0) {
    return ((Math.pow(weight / M, L) - 1) / (L * S));
  } else {
    // gdy L=0 użyj wzoru logarytmicznego
    return (Math.log(weight / M)) / S;
  }
}

/* Jednostki i konwersje */
const CM_TO_M          = 100;
const MINUTES_PER_HOUR = 60;
const M_PER_KM         = 1000;

const activities = {
  run:       { name: '🏃 Bieganie 8 km/h',         MET: 8.0 },
  bike:      { name: '🚴 Rower 16 km/h',          MET: 6.0 },
  swim:      { name: '🏊 Pływanie rekreacyjne',    MET: 7.5 },
  walk:      { name: '🚶 Spacer 5 km/h',          MET: 3.0 },

  // --- nowe kategorie ---
  swimFast:  { name: '🏊‍♂️ Pływanie INTENSYWNE',  MET: 9.8 },
  bike20:    { name: '🚴‍♂️ Rower 20 km/h',        MET: 8.0 },
  elliptical:{ name: '🏃‍♂️ Orbitrek (średnie tempo)', MET: 5.0 },
  gaming:    { name: '🎮 Granie na komputerze',   MET: 1.3 }
};

;

let rowId=0;
function addRow(containerId,optionsObj,className,defaultKey){
  const row=document.createElement('div');
  row.className=className;
  row.dataset.id=rowId++;
  row.innerHTML=`
    <select onchange="debouncedUpdate()">
      ${Object.entries(optionsObj).map(([k,v])=>`<option value="${k}" ${k===defaultKey?'selected':''}>${v.name}</option>`).join('')}
    </select>
    <input type="number" value="1" min="1" onchange="debouncedUpdate()" title="Ilość">
    <button type="button" class="icon" aria-label="Usuń" onclick="this.parentElement.remove();update()">×</button>`;
  document.getElementById(containerId).appendChild(row);
  update();
}
function addSnackRow(){addRow('snackList',snacks,'snack-row','snickers');}
function addMealRow(){addRow('mealList',meals,'meal-row','burger');}

function calcTotal(obj,selector){
  let kcal=0;
  document.querySelectorAll(selector).forEach(r=>{
    const key=r.querySelector('select').value;
    const qty=parseFloat(r.querySelector('input').value)||0;
    kcal+=obj[key].kcal*qty;
  });
  return kcal;
}
/**
 * Oblicza spoczynkową przemianę materii (BMR) w zależności od wieku.
 * Dla dzieci wykorzystujemy formuły Schofielda (FAO/WHO/UNU),
 * dla dorosłych – wzór Mifflina–St Jeora. Wynik w kcal/dzień.
 *
 * @param {number} weight Masa ciała w kilogramach
 * @param {number} height Wzrost w centymetrach
 * @param {number} age Wiek w latach
 * @param {string} sex 'M' dla mężczyzn, 'F' dla kobiet
 */
function BMR(weight, height, age, sex){
  // Formuły Schofielda dla dzieci (kalorie/dzień)
  if(age < 3){
    return Math.round(sex === 'M' ? 60.9 * weight - 54 : 61.2 * weight - 51);
  } else if(age < 10){
    return Math.round(sex === 'M' ? 22.7 * weight + 495 : 22.5 * weight + 499);
  } else if(age < 18){
    return Math.round(sex === 'M' ? 17.5 * weight + 651 : 12.2 * weight + 746);
  }
  // Dorośli: wzór Mifflina–St Jeora (waga kg, wzrost cm)
  return Math.round(10 * weight + 6.25 * height - 5 * age + (sex === 'M' ? 5 : -161));
}
function BMI(weight,height){
  return weight/Math.pow(height/CM_TO_M,2);
}

function bmiCategory(bmi){
  // Nowa klasyfikacja dorosłych według WHO z rozróżnieniem stopni otyłości
  // Niedowaga – poniżej progu UNDER
  if (bmi < ADULT_BMI.UNDER) return 'Niedowaga';
  // Prawidłowe BMI – poniżej górnej granicy normy (25)
  if (bmi < ADULT_BMI.OVER) return 'Prawidłowe';
  // Nadwaga – 25.0–29.99
  if (bmi < 30) return 'Nadwaga';
  // Otyłość I stopnia – 30.0–34.99
  if (bmi < 35) return 'Otyłość I stopnia';
  // Otyłość II stopnia – 35.0–39.99
  if (bmi < 40) return 'Otyłość II stopnia';
  // Otyłość III stopnia – 40.0 i więcej
  return 'Otyłość III stopnia';
}
function proposeDiets(bmr, pal, sex, isChild) {

  // Oblicz całkowite dzienne zapotrzebowanie energetyczne (TEE) na podstawie BMR i współczynnika PAL.
  // Zmienna teeFactor nie jest dostępna w tym zakresie; ewentualne korekty TEE są uwzględniane wcześniej.
  const tee = bmr * pal;                                  // całkowite dzienne zapotrzebowanie
  const minIntake = isChild ? MIN_INTAKE_CHILD
                            : MIN_INTAKE_ADULT[sex];

  // zwróć tablicę obiektów {key, name, deficit, intake, weeklyLoss}
  // Jeśli deficyt musiałby zostać zredukowany do zera (bo zapotrzebowanie minus deficyt
  // spada poniżej minimalnego spożycia), pomijamy taką dietę, aby nie proponować
  // nierealistycznych opcji (np. intensywna dieta przy bardzo niskim TEE).
  const result = Object.entries(DIET_LEVELS).reduce((arr, [key, cfg]) => {
    // docelowy deficyt
    let deficit = Math.min(cfg.deficitPct * tee, cfg.maxDeficit);

    // jeśli zapotrzebowanie minus deficyt spada poniżej minimalnego spożycia,
    // nie stosuj deficytu (deficyt = 0)
    if (tee - deficit < minIntake) {
      deficit = 0;
    }

    // jeżeli deficyt = 0, pomijamy dietę – nie jest adekwatna dla tego użytkownika
    if (deficit === 0) {
      return arr;
    }

    const intake = Math.round(tee - deficit);
    const weeklyLoss = (deficit > 0) ? (deficit * 7 / KCAL_PER_KG) : 0;
    arr.push({
      key,
      name: cfg.label,
      deficit: Math.round(deficit),
      intake,
      weeklyLoss
    });
    return arr;
  }, []);

  // Jeśli po filtrowaniu nie pozostała żadna dieta (np. zbyt niskie TEE uniemożliwia deficyt),
  // zwracamy pustą tablicę. Pozostawianie „zerowej” diety mogłoby wprowadzać użytkownika w błąd.
  return result;
}

// Wybór klasy pod kolor ramki/ liczby BMI u dorosłych
function bmiBoxClassForAdult(bmiCat, ageYears){
  if (ageYears < 18) return '';
  if (bmiCat === 'Niedowaga' || bmiCat === 'Nadwaga') return ' bmi-warning';
  if (String(bmiCat).startsWith('Otyłość'))           return ' bmi-danger';
  return '';
}
function fillDietSelect(diets) {
  const sel = document.getElementById('dietLevel');
  sel.innerHTML = ''; // wyczyść

  // Określ, czy użytkownik jest dzieckiem: wiek < 18 lat (przy założeniu, że CHILD_AGE_MIN określa dolną granicę)
  // Ustal wiek z większą precyzją (lata + miesiące/12)
  const ageVal = getAgeDecimal();
  const isChildDefault = (ageVal >= CHILD_AGE_MIN && ageVal < 18);

  // Jeśli brak dostępnych diet, ukryj cały blok wyboru diety i zakończ
  if (!diets || diets.length === 0) {
    // usuń wszelkie dotychczasowe opcje
    sel.innerHTML = '';
    // ukryj wrap i opisy
    document.getElementById('dietChoiceWrap').style.display = 'none';
    const descEl = document.getElementById('dietDesc');
    const calEl  = document.getElementById('dietCalorieInfo');
    if (descEl) descEl.style.display = 'none';
    if (calEl) calEl.style.display = 'none';
    return;
  }

  // Określ klucz rekomendowanej diety w zależności od wieku.
  // Dla dzieci (<18 lat) jest to lekka dieta, dla dorosłych – umiarkowana.
  // Domyślnie zalecana dieta: dla dzieci „lekka”, dla dorosłych „umiarkowana”.
  // Jeśli taka dieta nie jest dostępna w liście proponowanych diet (np. zbyt małe zapotrzebowanie),
  // rekomendację przypisujemy pierwszej dostępnej diecie.
  let recommendedKey = isChildDefault ? 'light' : 'moderate';
  // Jeżeli zalecana dieta nie jest dostępna w proponowanej liście,
  // ustaw rekomendację na pierwszą dostępną dietę.
  if (!diets.some(d => d.key === recommendedKey)) {
    recommendedKey = diets[0].key;
  }
  // Zbuduj opcje w oparciu o dostępne diety z dodatkowymi informacjami.
  diets.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.key;
    // Tekst opcji zawiera nazwę diety, deficyt i tempo utraty masy.
    // Jeśli jest to dieta rekomendowana, dodaj oznaczenie „rekomendowana dieta”.
    let label = `${d.name} (‑${d.deficit} kcal/dzień ≈ ${d.weeklyLoss.toFixed(1)} kg/tydz.)`;
    if (d.key === recommendedKey) {
      label += ' – rekomendowana dieta';
      opt.classList.add('recommended');
    }
    opt.textContent = label;
    sel.appendChild(opt);
  });

  // Określ domyślne ustawienie: dla dzieci dietę lekką, dla dorosłych umiarkowaną,
  // jeśli dana dieta jest dostępna; w przeciwnym razie wybierz pierwszą z listy.
  let defaultKey = isChildDefault ? 'light' : 'moderate';
  // Sprawdź, czy defaultKey występuje wśród proponowanych diet
  if (!diets.some(d => d.key === defaultKey)) {
    defaultKey = diets[0].key;
  }
  sel.value = defaultKey;

  document.getElementById('dietChoiceWrap').style.display = 'block';

  // Uaktualnij opis diety po ustawieniu wartości domyślnej
  updateDietDescription(defaultKey);
}
/* === PLAN – aktualizacja po wyborze diety  =========================== */
function updatePlanFromDiet(){

  /* ------------------ 1. Dane wejściowe ------------------ */
  // Wiek w latach z uwzględnieniem miesięcy (używany w dalszych obliczeniach)
  const age      = getAgeDecimal();
  const sex      =  document.getElementById('sex').value;           // 'M' / 'F'
  const weightKg = +document.getElementById('weight').value;
  const heightCm = +document.getElementById('height').value;
  const pal      = +document.getElementById('palFactor').value;

  if(!(age && weightKg && heightCm && pal)) return;                  // brak danych

  /* ------------------ 2. TEE i dostępne diety ------------- */
  // Oblicz BMR i przewidywany całkowity wydatek energetyczny (TEE)
  const bmr   = BMR(weightKg, heightCm, age, sex);
  let diets;
  // Spróbuj dostosować BMR przy ryzyku anoreksji. Użyj skorygowanej wartości TEE,
  // aby obliczyć diety. Nie wyświetlaj banera w tym miejscu (baner zostanie
  // wstawiony dopiero po zrenderowaniu planu).
  let bmrForDiets = bmr;
  try {
    if (typeof window !== 'undefined' && typeof window.anorexiaRiskAdjust === 'function') {
      const history = window.intakeHistory || null;
      const intakeKcalPerDay = window.intakeEstimatedKcalPerDay || null;
      // Skorzystaj z mountId, które nie istnieje, aby uniknąć wyświetlenia banera w tym momencie
      const tmp = window.anorexiaRiskAdjust({
        user: {
          ageYears: age,
          ageMonthsOpt: (parseFloat(document.getElementById('ageMonths')?.value) || 0),
          sex: sex,
          heightCm: heightCm,
          weightKg: weightKg
        },
        bmr: bmr,
        pal: pal,
        history: history,
        intakeKcalPerDay: intakeKcalPerDay,
        mountId: 'anorexiaTmpMount'
      });
      if (tmp && typeof tmp.teeAdjusted === 'number' && pal > 0) {
        bmrForDiets = tmp.teeAdjusted / pal;
      }
    }
  } catch(e) {}
  diets = proposeDiets(bmrForDiets, pal, sex, age < 18);

  // Jeśli nie ma żadnych diet (deficyt zbyt niski dla wszystkich poziomów),
  // ukryj opcję wyboru diety i wyświetl informację w wynikach planu.
  if (!diets || diets.length === 0) {
    const dietSel = document.getElementById('dietLevel');
    if (dietSel) {
      dietSel.innerHTML = '';
    }
    // schowaj opis i kaloryczność
    const descEl = document.getElementById('dietDesc');
    const calEl  = document.getElementById('dietCalorieInfo');
    if (descEl) descEl.style.display = 'none';
    if (calEl)  calEl.style.display  = 'none';
    // ukryj wybór diety
    const wrap = document.getElementById('dietChoiceWrap');
    if (wrap) wrap.style.display = 'none';

    // Pokaż planCard, jeśli jest ukryty (np. w przypadku nadwagi), a w planResults umieść informację
    const planCardEl = document.getElementById('planCard');
    if (planCardEl) planCardEl.style.display = 'block';
    const planResultsEl = document.getElementById('planResults');
    if (planResultsEl) {
      planResultsEl.innerHTML = `<div class="result-card plan-col plan-result-card animate-in"><h3>Brak diety</h3><p class="diet-warning">Twoje całkowite zapotrzebowanie jest zbyt niskie, aby zaproponować dietę redukcyjną.</p></div>`;
    }
    return;
  }

  // Zachowaj dotychczasowy wybór diety (jeśli istnieje)
  const dietSel = document.getElementById('dietLevel');
  const prevKey = dietSel ? dietSel.value : null;

  // Wypełnij listę diet (ustawi domyślną dla wieku)
  fillDietSelect(diets);

  // Przywróć poprzedni wybór, jeśli nadal jest dostępny w nowej liście
  if (prevKey && diets.some(d => d.key === prevKey)) {
    dietSel.value = prevKey;
  }

  const chosenKey = dietSel ? dietSel.value : null;
  // Uaktualnij opis diety po zmianie wyboru
  if (chosenKey) {
    updateDietDescription(chosenKey);
  }
  const diet      = diets.find(d => d.key === chosenKey);

  // Informacja o kaloryczności zostanie zaktualizowana poniżej; nie powtarzaj updateDietDescription
  const calInfoEl = document.getElementById('dietCalorieInfo');
  if (calInfoEl && diet) {
    const intakeRounded = Math.round(diet.intake / 100) * 100;
    // Określ, czy użytkownik jest dzieckiem dla potrzeb rekomendowanej diety
    const isChildDef2 = (age >= CHILD_AGE_MIN && age < 18);
    const recKey2 = isChildDef2 ? 'light' : 'moderate';
    // Dostosuj nagłówek: jeśli wybrano dietę rekomendowaną, użyj "Zalecana", w przeciwnym razie "Kaloryczność wybranej diety"
    const headerText = (diet && diet.key === recKey2) ? 'Zalecana kaloryczność diety' : 'Kaloryczność wybranej diety';
    calInfoEl.innerHTML = `${headerText}: <strong>${intakeRounded}</strong> kcal/dzień`;
    calInfoEl.style.display = 'block';
  }

  /* ------------------ 3. Cele BMI (różne dla dzieci/dorosłych) ------ */
  const isChild   = age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX;
  const h         = heightCm / CM_TO_M;                              // metry

  /* 3a. Górna granica normy BMI – używa helpera, który respektuje WHO/OLAF */
  const targetUpperBMI = toNormalBMITarget(weightKg, heightCm, age, sex);  // :contentReference[oaicite:0]{index=0}

  /* 3b. BMI 50 centyla – te same siatki co w całym kalkulatorze */
  let targetMedianBMI = 22.0;                                        // dorośli – przyjmujemy BMI 22 jako środek normy
  if(isChild){
      const months = Math.round(age * 12);
      const lms    = getLMS(sex, months);                            // :contentReference[oaicite:1]{index=1}
      if(lms) targetMedianBMI = lms[1];                              // parametr M = 50 c.
  }

  /* ------------------ 4. Masa docelowa i czas --------------- */
  function weeksNeeded(targetBMI){
      const targetW = targetBMI * h * h;
      const kgToLose = weightKg - targetW;
      return (kgToLose > 0)
             ? Math.ceil(kgToLose / diet.weeklyLoss)
             : 0;
  }
  // Oblicz liczbę tygodni do osiągnięcia docelowego BMI. Jeśli dieta nie powoduje
  // deficytu (weeklyLoss = 0), zwracamy 0 tygodni, aby uniknąć Infinity.
  const wUpper  = (diet && diet.weeklyLoss > 0) ? weeksNeeded(targetUpperBMI) : 0;
  const wMedian = (diet && diet.weeklyLoss > 0) ? weeksNeeded(targetMedianBMI) : 0;

  /* ------------------ 5. Render  ---------------------------- */
  const planResults = document.getElementById('planResults');
  // oblicz czas w latach (1 rok = 52 tygodnie)
  // oblicz czas w latach (1 rok = 52 tygodnie), tylko jeśli mamy dodatni tygodniowy ubytek
  const yearsUpper  = (diet && diet.weeklyLoss > 0) ? wUpper  / 52 : 0;
  const yearsMedian = (diet && diet.weeklyLoss > 0) ? wMedian / 52 : 0;
  // zalecana kaloryczność (zaokrąglona do 100 kcal)
  const intakeRounded = diet ? Math.round(diet.intake / 100) * 100 : 0;

  // Przygotuj wartości do wyświetlenia w kartach czasu. Jeśli tygodniowa utrata masy
  // wynosi 0 (deficyt zbyt niski), zamiast liczby pokazujemy znak „–”, by uniknąć Infinity.
  const dispUpperWeeks  = (diet && diet.weeklyLoss > 0) ? wUpper  : '–';
  const dispMedianWeeks = (diet && diet.weeklyLoss > 0) ? wMedian : '–';
  const dispUpperYears  = (diet && diet.weeklyLoss > 0) ? yearsUpper.toFixed(1) : '–';
  const dispMedianYears = (diet && diet.weeklyLoss > 0) ? yearsMedian.toFixed(1) : '–';

  // Schowaj ewentualny dodatkowy tekst o kaloryczności (aby uniknąć podwójnego wyświetlania)
  const calInfoEl2 = document.getElementById('dietCalorieInfo');
  if (calInfoEl2) calInfoEl2.style.display = 'none';

  // Ukryj opis diety pod selectem, aby nie dublować treści w wynikach
  const dietDescEl = document.getElementById('dietDesc');
  if (dietDescEl) {
    dietDescEl.style.display = 'none';
  }

  // Zbuduj dodatkowy kontener z opisem wybranej diety w formie listy, jeśli istnieje
  let dietCard = '';
  if (chosenKey && DIET_BULLETS[chosenKey]) {
    const bullets = DIET_BULLETS[chosenKey];
    const bulletItems = bullets.map(item => `<li>${item}</li>`).join('');
    dietCard = `<div class="result-card plan-col plan-result-card animate-in">
      <h3>Wybrana dieta</h3>
      <ul class="diet-list">${bulletItems}</ul>
    </div>`;
  }

  // Przygotuj ostrzeżenia dotyczące diety. Dla osób dorosłych wyświetlamy tylko
  // komunikat o intensywnej diecie, jeśli jest wybrana. W przypadku dzieci w wieku 5–9 lat
  // należy poinformować rodziców, że jakakolwiek dieta wymaga nadzoru dietetyka lub lekarza.
  // Jeśli dodatkowo wybrano dietę intensywną dla dziecka 5–9 lat, pokaż oba komunikaty.
  const warnings = [];
  // Ostrzeżenie dla dzieci 5–9 lat niezależnie od typu diety
  if (age >= 5 && age < 10) {
    warnings.push(`<p class="diet-warning">Dieta u dzieci w wieku 5–9 lat wymaga nadzoru dietetyka lub lekarza.</p>`);
  }
  // Ostrzeżenie o intensywnej diecie: dla wszystkich użytkowników po wybraniu intensywnej diety
  if (chosenKey === 'intense') {
    warnings.push(`<p class="diet-warning">Intensywna dieta wymaga nadzoru specjalisty i&nbsp;nie powinna być stosowana dłużej niż kilka tygodni.</p>`);
  }
  const dietWarningMarkup = warnings.join('');

  // Określ, czy użytkownik jest dzieckiem w kontekście wyboru domyślnej diety
  const isChildDef = (age >= CHILD_AGE_MIN && age < 18);
  const recommendedKey = isChildDef ? 'light' : 'moderate';
  const recommendedName = DIET_LEVELS[recommendedKey] ? DIET_LEVELS[recommendedKey].label : '';
  // Określ etykietę nagłówka pierwszej karty w zależności od tego, czy wybrano dietę rekomendowaną
  const firstCardHeading = (diet && chosenKey === recommendedKey) ? 'Zalecana kaloryczność diety:' : 'Kaloryczność wybranej diety:';
  // Nota rekomendacji nie jest już wyświetlana tutaj. Informację o rekomendowanej diecie
  // umieszczamy bezpośrednio w opcjach listy diet (jako dopisek „rekomendowana dieta”).
  const recommendNote = '';

  planResults.innerHTML = `
    ${recommendNote}
    <div class="result-card plan-col plan-result-card animate-in">
      <h3>${firstCardHeading}</h3>
      <p class="result-number result-val">${intakeRounded}</p>
      <small>kcal/dzień</small>
      ${dietWarningMarkup}
    </div>
    <div class="result-card plan-col plan-result-card animate-in">
      <!-- Jasno informujemy, że wynik odnosi się do wybranej diety i dodajemy informację o czasie -->
      <h3>Stosując wybraną dietę osiągniesz górną granicę normy BMI w czasie:</h3>
      <p class="result-number result-val">${dispUpperWeeks}</p>
      <small>tyg.</small><br>
      <small>(≈ ${dispUpperYears} lat)</small>
    </div>
    <div class="result-card plan-col plan-result-card animate-in">
      <!-- Podkreślamy, że efekty dotyczą idealnej wagi (50. centyl BMI) i dodajemy informację "za:" -->
      <h3>Dzięki wybranej diecie dojdziesz do idealnej wagi (50. centyl&nbsp;BMI) za:</h3>
      <p class="result-number result-val">${dispMedianWeeks}</p>
      <small>tyg.</small><br>
      <small>(≈ ${dispMedianYears} lat)</small>
    </div>
    ${dietCard}
  `;

  // Po wyrenderowaniu kart planu wywołaj ponownie detekcję ryzyka anoreksji.
  // Dzięki temu baner ostrzegawczy zostanie wstawiony do #planResults na końcu,
  // a nie zostanie usunięty przez późniejsze operacje innerHTML.
  try {
    if (typeof window !== 'undefined' && typeof window.anorexiaRiskAdjust === 'function') {
      const history = window.intakeHistory || null;
      const intakeKcalPerDay = window.intakeEstimatedKcalPerDay || null;
      window.anorexiaRiskAdjust({
        user: {
          ageYears: age,
          ageMonthsOpt: (parseFloat(document.getElementById('ageMonths')?.value) || 0),
          sex: sex,
          heightCm: heightCm,
          weightKg: weightKg
        },
        bmr: bmr,
        pal: pal,
        history: history,
        intakeKcalPerDay: intakeKcalPerDay,
        mountId: 'planResults'
      });
    }
  } catch(e) {}
  // Po ponownej detekcji ryzyka anoreksji wywołaj też ostrzeżenie o dużym spadku masy w ~12 mies. (ciemnopomarańczowy baner).
  // Używamy historii z karty „Szacowane...” jeśli jest dostępna. W przeciwnym razie pobieramy pomiary z zaawansowanej historii wzrostu (advancedGrowthData)
  // i bieżących danych użytkownika (wiek/miesiące, masa), aby wciąż móc wykryć spadek >8 kg w ciągu roku.
  try {
    if (typeof window.check12mLossOrange === 'function') {
      let hist = window.intakeHistory;
      if (!hist || !Array.isArray(hist) || hist.length < 2) {
        // Zbuduj historię z zaawansowanych pomiarów i bieżących danych, jeśli dostępne
        hist = [];
        try {
          if (window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements)) {
            window.advancedGrowthData.measurements.forEach(m => {
              if (m && typeof m.ageMonths === 'number' && typeof m.weight === 'number') {
                hist.push({ ageMonths: m.ageMonths, weight: m.weight });
              }
            });
          }
          // Dodaj bieżący pomiar użytkownika do listy, aby móc porównać z przeszłością
          const currentAgeYears = parseFloat(document.getElementById('age')?.value) || 0;
          const currentAgeMonthsAdditional = parseFloat(document.getElementById('ageMonths')?.value) || 0;
          const currentAgeMonths = Math.round(currentAgeYears * 12 + currentAgeMonthsAdditional);
          const currentWeight = parseFloat(document.getElementById('weight')?.value);
          if (isFinite(currentAgeMonths) && isFinite(currentWeight)) {
            hist.push({ ageMonths: currentAgeMonths, weight: currentWeight });
          }
          // Posortuj rosnąco po wieku w miesiącach
          hist.sort((a,b) => a.ageMonths - b.ageMonths);
        } catch(err) {
          // w razie błędu pozostaw hist pustą
        }
      }
      if (hist && hist.length >= 2) {
        window.check12mLossOrange(hist, 'planResults');
      }
    }
  } catch (e) {}
}
/**
 * Prosty predyktor końcowego wzrostu u dziecka.
 * Zakładamy, że dziecko pozostanie na swoim centylu wysokości.
 * Funkcję trzymamy w jednym miejscu, by łatwo ją później podmienić.
 */
function predictAdultHeight(age, sex, heightPercentile) {
  // Tabela docelowego wzrostu (cm) w wieku 18 l.
  const ADULT_HEIGHT = {
    M: {50: 176, 75: 183, 90: 188},
    F: {50: 164, 75: 169, 90: 173}
  };
  // Zaokrąglij percentile do 50/75/90; domyślnie 50
  const key = heightPercentile >= 90 ? 90 : heightPercentile >= 75 ? 75 : 50;
  return ADULT_HEIGHT[sex][key];
}

function toNormalBMITarget(weight, height, age, sex){
  // Dzieci 0,25–19 l.
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
    const months = Math.round(age * 12);
    const lms    = getLMS(sex, months);
    if (lms){
      const [L, M, S] = lms;

      // ◀ NOWE ▶ wybór docelowego centyla
      // Dla wszystkich dzieci stosujemy górną granicę normy BMI odpowiadającą 85. centylowi
      // (próg nadwagi) niezależnie od wybranego źródła (WHO/OLAF). Dzięki temu definicje są spójne.
      const zTarget = Z85;

      return (L !== 0)
             ? M * Math.pow(1 + L * S * zTarget, 1 / L)
             : M * Math.exp(S * zTarget);
    }
    return 18.5;                                   // fallback, gdy brak LMS
  }
  // Dorośli
  return 24.9;
}


/**
 * Zwraca kcal spalane na 1 km danej aktywności
 * @param {string} activity – klucz aktywności ('bike16','bike20','run','swim','walk')
 * @param {number} weight   – masa ciała w kg
 * @returns {number} kcal na 1 km
 */

/**
 * Oblicza, ile km i ile czasu potrzeba, by osiągnąć normę BMI
 * @returns {object|null} {kgToLose, kcalToBurn, table} lub null gdy BMI ≤ norma
 */
function distanceToNormalBMI(weight, height, age, sex) {
  const currentBMI = BMI(weight, height);
  const targetBMI  = toNormalBMITarget(weight, height, age, sex);
  if (currentBMI <= targetBMI) return null;

  // ile kg trzeba schudnąć i ile kcal to daje
  const targetWeight = targetBMI * Math.pow(height/CM_TO_M, 2);
  const kgToLose     = weight - targetWeight;
  const kcalToBurn = kgToLose * KCAL_PER_KG;

  // zestaw aktywności z MET i prędkością
  const acts = [
    // Dotychczasowe podstawowe aktywności
    { label:'🚶 Spacer',                met:3.0,  speed:5   },
    { label:'🚴 Rower 16 km/h',         met:6.0,  speed:16  },
    { label:'🚴‍♂️ Rower 20 km/h',       met:8.0,  speed:20  },
    { label:'🏃 Bieganie 8 km/h',        met:8.0,  speed:8   },
    { label:'🏊 Pływanie rekreacyjne',   met:7.5,  speed:3   },
    // Nowe aktywności dodane na życzenie użytkownika
    { label:'🎾 Tenis',                 met:7.0,  speed:5   }, // tenis (gra pojedyncza) ok. 7 MET, umiarkowany dystans
    { label:'🏀 Koszykówka',            met:6.5,  speed:6   }, // koszykówka ogólna – ok. 6,5 MET
    { label:'⚽ Piłka nożna',           met:7.0,  speed:7   }, // piłka nożna (rekreacyjna) – ok. 7 MET
    { label:'💃 Taniec',                met:5.0,  speed:4   }  // taniec towarzyski / fitness – ok. 5 MET
  ];

  // budujemy wiersze tabeli: dystans / czas
  const rows = acts.map(act => {
    // kcal spalane na minutę
    const burnPerMin = (act.met * 3.5 * weight) / 200;
    // ile minut potrzeba spalić kcalToBurn
    const timeMin = kcalToBurn / burnPerMin;
    const h = Math.floor(timeMin/60),
          m = Math.round(timeMin%60);
    const timeStr = h > 0 ? `${h} h ${m} min` : `${m} min`;

    // kcal na 1 km = kcal/min × min/km
    const km = kcalToBurn / (burnPerMin * (MINUTES_PER_HOUR/act.speed));
    const distStr = km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km*1000)} m`;

    return `<tr><td>${act.label}</td><td>${distStr} / ${timeStr}</td></tr>`;
  }).join('');

  const table = `
    <table style="margin-top:6px;width:100%;">
      <tr><th>Aktywność</th><th>Dystans / Czas do normy</th></tr>
      ${rows}
    </table>
  `;
  return { kgToLose, kcalToBurn, table };
}
/**
 * Ile kilogramów brakuje dziecku (2–19 l.) do dolnej granicy normy BMI (P5 WHO)
 * Zwraca liczbę > 0 — kg do przybrania, lub 0 jeśli BMI ≥ P5.
 */
function kgToReachNormalBMIChild(weight, height, age, sex){
  const months = Math.round(age * 12);
  const dataMap = bmiPercentiles[ sex==='M' ? 'boys' : 'girls' ];
  const data   = dataMap[ months ];
  if(!data) return 0;                     // brak danych – nie wyliczamy
  const targetBMI   = data.P5;            // 5 percentyl = dolna granica normy
  const targetWgt   = targetBMI * Math.pow(height/CM_TO_M, 2);
  const kgNeeded    = targetWgt - weight; // >0: masa do przybrania
  return kgNeeded > 0 ? kgNeeded : 0;
}

// --- KONIEC: Funkcje Droga do normy BMI ---

  /* === Podsumowanie poprzednich pomiarów ===
     Funkcje pomocnicze do analizy ostatniego pomiaru wczytanego z pliku JSON.
     Obejmują wybór ostatniego pomiaru, obliczenie BMI, centyli dziecięcych,
     wskaźnika Cole’a, WHR i różnicy do normy BMI.
  */
  function __pickLastMeasurement(data){
    // Zwraca sex, wiek w miesiącach, wzrost cm, wagę kg oraz obwody talii i bioder (jeśli występują).
    const result = { sex: null, ageMonths: null, heightCm: null, weightKg: null, waistCm: null, hipCm: null };
    if(!data || !data.user) return result;
    // Sex
    result.sex = data.user.sex || (data.advanced && data.advanced.data && data.advanced.data.sex) || 'M';
    // Age
    // preferuj currentAgeMonths jeśli dostępny w sekcji advanced.data
    if(data.advanced && data.advanced.data && typeof data.advanced.data.currentAgeMonths === 'number'){
      result.ageMonths = data.advanced.data.currentAgeMonths;
    } else {
      const ageYears  = (typeof data.user.age === 'number') ? data.user.age : null;
      const ageMonths = (typeof data.user.ageMonths === 'number') ? data.user.ageMonths : null;
      if(ageYears!=null || ageMonths!=null){
        result.ageMonths = Math.round((ageYears||0) * 12 + (ageMonths||0));
      }
    }
    // Height / weight – preferuj pola currentHeight/currentWeight w advanced.data
    if(data.advanced && data.advanced.data){
      const adv = data.advanced.data;
      if(typeof adv.currentHeight === 'number') result.heightCm = adv.currentHeight;
      if(typeof adv.currentWeight === 'number') result.weightKg = adv.currentWeight;
    }
    // Fallback do user.height/weight jeśli brak current*
    if(result.heightCm == null && typeof data.user.height === 'number'){
      result.heightCm = data.user.height;
    }
    if(result.weightKg == null && typeof data.user.weight === 'number'){
      result.weightKg = data.user.weight;
    }
    // Wiek oraz waga z historii pomiarów – wybierz ostatni (największy ageMonths)
    // jeżeli brak current* lub user.*
    let meas = [];
    if(data.advanced && data.advanced.data && Array.isArray(data.advanced.data.measurements)){
      meas = data.advanced.data.measurements.slice();
    }
    if(meas.length){
      meas.sort((a,b)=>{
        const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears||0)*12);
        const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears||0)*12);
        return am - bm;
      });
      const last = meas[meas.length-1];
      const h = (typeof last.height === 'number') ? last.height : null;
      const w = (typeof last.weight === 'number') ? last.weight : null;
      if(result.heightCm == null && h!=null) result.heightCm = h;
      if(result.weightKg == null && w!=null) result.weightKg = w;
      // ageMonths z historii jeśli brak
      if(result.ageMonths == null){
        if(typeof last.ageMonths === 'number') result.ageMonths = last.ageMonths;
        else if(typeof last.ageYears === 'number') result.ageMonths = Math.round(last.ageYears * 12);
      }
    }
    // WHR – obwód talii i bioder (jeśli w danych)
    if(typeof data.user.waist === 'number') result.waistCm = data.user.waist;
    if(typeof data.user.hip === 'number') result.hipCm = data.user.hip;
    // Alternatywne pola w advanced.data
    if(data.advanced && data.advanced.data){
      if(typeof data.advanced.data.currentWaist === 'number' && result.waistCm == null) result.waistCm = data.advanced.data.currentWaist;
      if(typeof data.advanced.data.currentHip === 'number' && result.hipCm == null) result.hipCm = data.advanced.data.currentHip;
    }
    return result;
  }

  function __kgToEnterNormalRange(weightKg, heightCm, sex, ageMonths){
    // Oblicza minimalną różnicę masy (kg) do wejścia w zakres normy BMI.
    if(!weightKg || !heightCm) return null;
    const h2 = Math.pow(heightCm / 100, 2);
    const bmi = weightKg / h2;
    const ageYears = (typeof ageMonths === 'number') ? ageMonths / 12 : null;
    // Dziecko (<18 lat): użyj z‑score 5c (–1.645) i 85c (+1.036)
    if(ageYears != null && ageYears < 18){
      const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
      if(!lms) return null;
      const [L,M,S] = lms;
      const bmiAtZ = (z) => {
        return (L !== 0) ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
      };
      const BMI_P5  = bmiAtZ(-1.645);
      const BMI_P85 = bmiAtZ( 1.036);
      if(bmi < BMI_P5){
        const targetW = BMI_P5 * h2;
        return targetW - weightKg;      // dodatnie: ile kg do przybrania
      }else if(bmi >= BMI_P85){
        const targetW = BMI_P85 * h2;
        return weightKg - targetW;      // dodatnie: ile kg do zgubienia
      }else{
        return 0;                       // w normie
      }
    }
    // Dorośli: zakres 18.5–24.9
    const BMI_LOW = 18.5, BMI_HIGH = 24.9;
    if(bmi < BMI_LOW){
      const targetW = BMI_LOW * h2;
      return targetW - weightKg;        // dodatnie: do przybrania
    }else if(bmi > BMI_HIGH){
      const targetW = BMI_HIGH * h2;
      return weightKg - targetW;        // dodatnie: do zgubienia
    }
    return 0;
  }

  function __renderPrevSummary(data){
    // Zwróć jeśli brak elementów DOM
    const wrap  = document.getElementById('prevSummaryWrap');
    const card  = document.getElementById('prevSummaryCard');
    const toggle= document.getElementById('togglePrevSummary');
    const content = document.getElementById('prevSummaryContent');
    if(!wrap || !card || !toggle || !content) return;

    // Pobierz ostatni pomiar z danych
    const last = __pickLastMeasurement(data);
    const ageMonths = last.ageMonths;
    const sex = last.sex || 'M';
    const height = last.heightCm;
    const weight = last.weightKg;

    // Obliczenia podstawowe
    const bmi = (typeof BMI === 'function' && weight && height) ? BMI(weight, height) : null;
    const whr = (last.waistCm && last.hipCm && last.hipCm !== 0) ? (last.waistCm / last.hipCm) : null;
    // Centyle (dzieci) – poprawne wywołanie funkcji calcPercentileStats(value, sex, ageYears, param)
    let heightPerc = null, weightPerc = null, bmiPerc = null, cole = null;
    if(ageMonths != null && (ageMonths / 12) < 18){
      const ageYears = ageMonths / 12;
      if(typeof calcPercentileStats === 'function' && height != null){
        const statsH = calcPercentileStats(height, sex, ageYears, 'HT');
        if(statsH && statsH.percentile!=null) heightPerc = statsH.percentile;
      }
      if(typeof calcPercentileStats === 'function' && weight != null){
        const statsW = calcPercentileStats(weight, sex, ageYears, 'WT');
        if(statsW && statsW.percentile!=null) weightPerc = statsW.percentile;
      }
      if(typeof bmiPercentileChild === 'function' && bmi != null){
        const bp = bmiPercentileChild(bmi, sex, ageMonths);
        if(bp != null) bmiPerc = bp;
      }
      if(typeof getLMS === 'function' && bmi != null){
        const lms = getLMS(sex, Math.round(ageMonths));
        if(lms){
          const M = lms[1];
          cole = (bmi / M) * 100;
        }
      }
    }
    // Różnica masy do normy
    const kgDiff = __kgToEnterNormalRange(weight, height, sex, ageMonths);
    let kgText = '';
    if(kgDiff != null){
      const absKg = Math.abs(kgDiff);
      // Ustal kierunek: jeśli BMI powyżej górnej granicy – trzeba schudnąć (−),
      // jeśli BMI poniżej dolnej granicy – trzeba przybrać (+), w normie 0.
      if(kgDiff === 0){
        kgText = 'w normie';
      }else if(weight != null && height != null){
        const h2 = Math.pow(height/100,2);
        const bmiVal = weight / h2;
        const ageYears = (ageMonths != null) ? ageMonths/12 : null;
        let overweight;
        if(ageYears != null && ageYears < 18){
          // Dziecko: sprawdź BMI względem 85 centyla
          const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
          if(lms){
            const [L,M,S] = lms;
            const bmi85 = (L !== 0) ? M * Math.pow(1 + L*S*1.036, 1/L) : M * Math.exp(S*1.036);
            overweight = bmiVal >= bmi85;
          }else{
            overweight = false;
          }
        }else{
          overweight = bmiVal > 24.9;
        }
        kgText = overweight
          ? `${absKg.toFixed(1).replace('.', ',')} kg do górnej granicy normy`
          : `${absKg.toFixed(1).replace('.', ',')} kg do dolnej granicy normy`;
      }
    }
    // Wylicz wiek w latach i miesiącach do wyświetlenia.
    // Dla 1 roku użyj "rok", dla pozostałych "lata" (2–4) lub "lat" (≥5) zgodnie z językiem polskim.
    let ageDisplay = '';
    if (ageMonths != null) {
      const yrs = Math.floor(ageMonths / 12);
      const mos = ageMonths - yrs * 12;
      let yearWord;
      if (yrs === 1) {
        yearWord = 'rok';
      } else if (yrs % 10 >= 2 && yrs % 10 <= 4 && (yrs % 100 < 10 || yrs % 100 >= 20)) {
        yearWord = 'lata';
      } else {
        yearWord = 'lat';
      }
      ageDisplay = `${yrs} ${yearWord} ${mos} mies.`;
    }

    // Obwody talii i bioder – oblicz centyle dla dzieci (3–18 lat) jeśli dostępne.
    // W przypadku dorosłych lub braku danych centyle nie są obliczane.
    let waistPerc = null;
    let hipPerc = null;
    if (last.waistCm != null && last.hipCm != null && ageMonths != null) {
      const ageYearsWHR = ageMonths / 12;
      if (ageYearsWHR >= 3 && ageYearsWHR <= 18 && typeof childPercentileFromTables === 'function') {
        try {
          const percRes = childPercentileFromTables(ageYearsWHR, sex, last.waistCm, last.hipCm);
          if (percRes) {
            waistPerc = percRes.waistP;
            hipPerc   = percRes.hipP;
          }
        } catch (_) {
          // ciche pominięcie błędów w obliczaniu centyli talii/bioder
        }
      }
    }
    // Budowa HTML
    const rows = [];
    // Data ostatniego zapisu
    const ts = data && (data.timestampISO || data.timestamp);
    if(ts){
      const d = new Date(ts);
      const pl = d.toLocaleString('pl-PL', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
      rows.push(`<div class="label">Data ostatniego zapisu</div><div class="val">${pl}</div>`);
    }
    // Wiek
    if(ageDisplay){
      rows.push(`<div class="label">Wiek podczas pomiaru</div><div class="val"><span class="result-val">${ageDisplay}</span></div>`);
    }
    // Wzrost
    rows.push(`<div class="label">Wzrost</div><div class="val"><span class="result-val">${height != null ? height.toFixed(1).replace('.', ',') : '—'}<small> cm</small></span>${heightPerc != null ? ` <span class="muted">(P${formatCentile(heightPerc)})</span>` : ''}</div>`);
    // Waga
    rows.push(`<div class="label">Waga</div><div class="val"><span class="result-val">${weight != null ? weight.toFixed(1).replace('.', ',') : '—'}<small> kg</small></span>${weightPerc != null ? ` <span class="muted">(P${formatCentile(weightPerc)})</span>` : ''}</div>`);
    // BMI
    rows.push(`<div class="label">BMI</div><div class="val"><span class="result-val">${bmi != null ? bmi.toFixed(1).replace('.', ',') : '—'}</span>${bmiPerc != null ? ` <span class="muted">(P${formatCentile(bmiPerc)})</span>` : ''}</div>`);
    // Cole index
    if(cole != null){
      rows.push(`<div class="label">Wskaźnik Cole’a</div><div class="val"><span class="result-val">${cole.toFixed(1).replace('.', ',')}<small>%</small></span></div>`);
    }
    // Obwód talii (jeśli dostępny)
    if (last.waistCm != null) {
      const waistVal = last.waistCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0talii</div><div class="val"><span class="result-val">${waistVal}<small>\u00a0cm</small></span>${waistPerc != null ? ` <span class="muted">(P${formatCentile(waistPerc)})</span>` : ''}</div>`);
    }
    // Obwód bioder (jeśli dostępny)
    if (last.hipCm != null) {
      const hipVal = last.hipCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0bioder</div><div class="val"><span class="result-val">${hipVal}<small>\u00a0cm</small></span>${hipPerc != null ? ` <span class="muted">(P${formatCentile(hipPerc)})</span>` : ''}</div>`);
    }
    // WHR (wskaźnik talia‑biodra)
    if(whr != null){
      rows.push(`<div class="label">WHR</div><div class="val"><span class="result-val">${whr.toFixed(2).replace('.', ',')}</span></div>`);
    }
    // Usunięto wiersz "Do normy BMI" – nie pokazujemy tego parametru ani jego zmian.
    // Insert into DOM
    content.innerHTML = rows.join('');
    // Pokaż kartę i ukryj przycisk toggle
    wrap.style.display = 'block';
    card.style.display = 'block';
    toggle.style.display = 'none';
    // Oznacz, że podsumowanie poprzedniego pomiaru zostało poprawnie załadowane.
    // Dzięki temu będziemy mogli decydować, czy karta powinna być wyświetlana
    // podczas modyfikacji formularza – karta ma się pojawiać tylko po wczytaniu
    // danych z pliku JSON.
    if (wrap && wrap.dataset) {
      wrap.dataset.loaded = 'true';
    }
    if (card && card.dataset) {
      card.dataset.loaded = 'true';
    }
  }

/* ------------ Debounce wrapper ------------ */
const debouncedUpdate = (() => {
  let raf = null;
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      update();
      // Po każdej aktualizacji przeliczamy także pozycjonowanie sekcji
      // modułu lekarskiego oraz przycisku podsumowania wyników. Dzięki temu
      // w trybie mobilnym elementy zostaną przeniesione w odpowiednie miejsce
      // po uzupełnieniu danych.
      if (typeof repositionDoctor === 'function') {
        repositionDoctor();
      }
      if (typeof repositionMetabolicSummary === 'function') {
        repositionMetabolicSummary();
      }
      // Aktualizuj kartę podsumowania wyników w trybie profesjonalnym
      if (typeof updateProfessionalSummaryCard === 'function') {
        updateProfessionalSummaryCard();
      }
      // Nie przewijamy tutaj strony – wykonywanie scrollowania
      // realizowane jest w funkcji update() po wygenerowaniu wyników.
    });
  };
})();

// -----------------------------------------------------------------------------
//  Live updating of the "Podsumowanie wyników" card
//
//  Many auxiliary modules (e.g. blood pressure, circumference, advanced growth)
//  set global variables (such as window.percSbp, window.headCircPercentile, or
//  window.advancedGrowthData) that are read by generateMetabolicSummary().
//  However, these updates do not always trigger an input/change event on the
//  primary form, so without additional listeners the professional summary card
//  will not refresh until the user modifies another field.  To address this,
//  we install property setters on relevant global variables.  Whenever one of
//  these variables changes, we call updateProfessionalSummaryCard() to
//  regenerate and re-render the summary in real time.  The property wrappers
//  store the original value in a closure and remain transparent to the rest
//  of the application.  The initialization is deferred until DOMContentLoaded
//  to ensure updateProfessionalSummaryCard() is defined.
(function() {
  function initSummaryLiveUpdates() {
    const props = [
      'percSbp',
      'zSbp',
      'percDbp',
      'zDbp',
      'headCircPercentile',
      'headCircSD',
      'chestCircPercentile',
      'chestCircSD',
      'colePercentValue',
      'advancedGrowthData'
    ];
    props.forEach(function(prop) {
      try {
        let internal = window[prop];
        Object.defineProperty(window, prop, {
          configurable: true,
          enumerable: true,
          get() { return internal; },
          set(v) {
            internal = v;
            // When the value changes, refresh the professional summary card.
            if (typeof updateProfessionalSummaryCard === 'function') {
              try { updateProfessionalSummaryCard(); } catch (_) {}
            }
          }
        });
      } catch (_) {
        // If defining the property fails (e.g. non-configurable), silently ignore.
      }
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
      initSummaryLiveUpdates();
    } else {
      document.addEventListener('DOMContentLoaded', initSummaryLiveUpdates);
    }
  }
})();

// === Karta „Podsumowanie wyników” (tryb profesjonalny) ===
/**
 * Aktualizuje zawartość i pozycję karty „Podsumowanie wyników”.
 * Karta jest widoczna w trybie profesjonalnym na stronie głównej
 * (po włączeniu profesjonalnego trybu) oraz zawsze na stronie DocPro.
 * Jeżeli użytkownik wczytał poprzednie dane (widoczna jest karta
 * „Ostatni pomiar”), karta podsumowania zostanie przeniesiona pod obie
 * kolumny i podzielona na dwie części o równej liczbie wierszy.
 */
// === Karta „Podsumowanie wyników” (tryb profesjonalny) ===
function updateProfessionalSummaryCard(_retry) {
  const card     = document.getElementById('currentSummaryCard');
  const wrap     = document.getElementById('currentSummaryWrap');
  const fullWrap = document.getElementById('currentSummaryFullWrap'); // na DocPro może nie istnieć
  const content  = document.getElementById('currentSummaryContent');
  if (!card || !wrap || !content) return;

  // Upewnij się, że nagłówek istniejącej karty ma turkusowy kolor zgodny z motywem
  try {
    const summaryHeader = card.querySelector('h3');
    if (summaryHeader) summaryHeader.style.color = 'var(--primary)';
  } catch (e) {
    /* ignoruj błędy */
  }

  // Pomocnicze: usuwanie poprzednich klonów
  const removeClones = () => {
    document.getElementById('currentSummaryCardLeft')?.remove();
    document.getElementById('currentSummaryCardRight')?.remove();
  };

  // Ustal, czy jesteśmy na DocPro oraz czy tryb profesjonalny jest aktywny
  const isDocPro = typeof window !== 'undefined'
    && window.location && window.location.pathname
    && window.location.pathname.includes('docpro.html');

  let proMode = false;
  if (typeof professionalMode !== 'undefined') proMode = !!professionalMode;
  else if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') proMode = !!window.professionalMode;

  // Czy mamy co pokazać?
  let shouldShow = false;
  let linesRaw = '';
  try {
    if (isDocPro || proMode) {
      linesRaw = (typeof generateMetabolicSummary === 'function') ? (generateMetabolicSummary() || '') : '';
      shouldShow = !!linesRaw.trim();
    }
  } catch (_) { shouldShow = false; }

  // Czy „Ostatni pomiar” jest widoczny?
  const prevCard = document.getElementById('prevSummaryCard');
  const prevVisible = !!(prevCard && prevCard.style.display !== 'none');

  // Ukryj wszystko, jeśli nie ma czego wyświetlać
  if (!shouldShow) {
    removeClones();
    card.style.display = 'none';
    wrap.style.display = 'none';
    if (fullWrap) { fullWrap.style.display = 'none'; fullWrap.innerHTML = ''; }
    return;
  }

  // Rozbij podsumowanie na linie i na dwie kolumny
  // i przygotuj wartości wejściowe, aby wzbogacić podsumowanie o
  // rzeczywiste pomiary oraz zmienić etykiety wyłącznie w karcie.
  let lines = linesRaw.split('\n').map(s => s.trim()).filter(Boolean);

  // Dodaj wartości pomiarów i dostosuj etykiety tylko na karcie
  try {
    const weightValStr      = (document.getElementById('weight')?.value || '').trim();
    const heightValStr      = (document.getElementById('height')?.value || '').trim();
    const sbpValStr         = (document.getElementById('bpSystolic')?.value || '').trim();
    const dbpValStr         = (document.getElementById('bpDiastolic')?.value || '').trim();
    const headCircValStr    = (document.getElementById('headCircumference')?.value || '').trim();
    const chestCircValStr   = (document.getElementById('chestCircumference')?.value || '').trim();
    lines = lines.map(function(line) {
      // Waga: dodaj wartość w kg
      if (line.startsWith('Waga:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = weightValStr ? (weightValStr + ' kg, ') : '';
        return 'Waga: ' + prefix + rest;
      }
      // Wzrost: dodaj wartość w cm
      if (line.startsWith('Wzrost:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = heightValStr ? (heightValStr + ' cm, ') : '';
        return 'Wzrost: ' + prefix + rest;
      }
      // Ciśnienie skurczowe: zmień etykietę na RR skurczowe i dodaj wartość w mmHg
      if (line.startsWith('Ciśnienie skurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = sbpValStr ? (sbpValStr + ' mmHg, ') : '';
        return 'RR skurczowe: ' + prefix + rest;
      }
      // Ciśnienie rozkurczowe: zmień etykietę na RR rozkurczowe i dodaj wartość w mmHg
      if (line.startsWith('Ciśnienie rozkurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = dbpValStr ? (dbpValStr + ' mmHg, ') : '';
        return 'RR rozkurczowe: ' + prefix + rest;
      }
      // Obwód głowy: dodaj wartość w cm
      if (line.startsWith('Obwód głowy')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = headCircValStr ? (headCircValStr + ' cm, ') : '';
        return 'Obwód głowy: ' + prefix + rest;
      }
      // Obwód klatki piersiowej: zmień etykietę i dodaj wartość w cm
      if (line.startsWith('Obwód klatki piersiowej')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = chestCircValStr ? (chestCircValStr + ' cm, ') : '';
        return 'Obwód kl. piersiowej: ' + prefix + rest;
      }
      // MPH (mid-parental height): skróć etykietę i popraw wielkość liter w Z-score
      // Wykrywamy zarówno myślnik zwykły (-) jak i nierozdzielający (‑) w nazwie
      if (/^MPH \(mid[-‑]parental height\):/i.test(line)) {
        let newLine = line.replace(/^MPH \(mid[^)]*\):/i, 'MPH:');
        // Zmieniamy „z-score:” na „Z-score:” wyłącznie w tej linii
        newLine = newLine.replace(/z-score:/i, 'Z-score:');
        return newLine;
      }
      return line;
    });
  } catch (_) {
    // Jeśli formatowanie podsumowania nie powiedzie się, zachowaj oryginalne linie
  }

  const mid   = Math.ceil(lines.length / 2);
  const colA  = lines.slice(0, mid);
  const colB  = lines.slice(mid);

  // Render kolumny do <div class="current-summary-columns">
  function buildColumnRows(items) {
    const col = document.createElement('div');
    col.className = 'current-summary-col';
    items.forEach(txt => {
      const row = document.createElement('div');
      row.className = 'current-summary-row';
      row.textContent = txt;
      col.appendChild(row);
    });
    return col;
  }
  function buildCard(items, id) {
    const c = document.createElement('div');
    c.className = 'card summary-card current-summary-card';
    if (id) c.id = id;
    const h = document.createElement('h3');
    h.style.margin = '0';
    h.textContent = 'Podsumowanie wyników';
    // Ustaw kolor etykiety na turkusowy (zmienna --primary) dla kart podsumowania
    h.style.color = 'var(--primary)';
    const body = document.createElement('div');
    body.className = 'summary-content'; // zgodne z CSS kart【turn6file16†:contentReference[oaicite:7]{index=7}】【turn6file18†:contentReference[oaicite:8]{index=8}】
    const cols = document.createElement('div');
    cols.className = 'current-summary-columns';
    cols.appendChild(buildColumnRows(items));
    body.appendChild(cols);
    c.appendChild(h);
    c.appendChild(body);
    return c;
  }

  const isTwoColumn = window.innerWidth >= 700;

  if (prevVisible) {
    // ——— nowy układ w wersji desktopowej: lewa + prawa kolumna ———
    removeClones();

    if (isTwoColumn) {
      // Schowaj pojedynczą kartę i kontener pełnej szerokości
      card.style.display = 'none';
      if (fullWrap) { fullWrap.style.display = 'none'; fullWrap.innerHTML = ''; }

      // PRAWA kolumna: pod „Ostatnim pomiarem” → używamy #currentSummaryWrap
      wrap.style.display = 'block';
      wrap.appendChild(buildCard(colB.length ? colB : colA, 'currentSummaryCardRight'));

      // LEWA kolumna: pod „Dane użytkownika”
      const leftCol =
        document.getElementById('userSection') ||                       // DocPro
        document.querySelector('#calcForm > .half:first-child') ||       // strona główna
        document.querySelector('.half');                                 // awaryjnie
      if (leftCol) {
        const leftCard = buildCard(colA.length ? colA : colB, 'currentSummaryCardLeft');
        const userFs = leftCol.querySelector('fieldset.user-card');
        if (userFs && userFs.parentNode) {
          userFs.parentNode.insertBefore(leftCard, userFs.nextSibling);
        } else {
          leftCol.appendChild(leftCard);
        }
      }

      // Po utworzeniu kart w układzie dwukolumnowym zadbaj o to,
      // aby wysokości obu kart podsumowania były identyczne.  W
      // mobilnym widoku funkcja adjustSummaryCardsHeight przywróci
      // naturalne wymiary kart.
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {}
      }
    } else {
      // Widok mobilny: zachowaj dotychczasowy układ „dwie karty poniżej”
      wrap.style.display = 'none';
      if (fullWrap) {
        fullWrap.style.display = 'block';
        fullWrap.classList.add('current-summary-fullwrap'); // flex układ z CSS【turn6file4†:contentReference[oaicite:9]{index=9}】
        fullWrap.innerHTML = '';
        fullWrap.appendChild(buildCard(colA, 'currentSummaryCardLeft'));
        fullWrap.appendChild(buildCard(colB, 'currentSummaryCardRight'));
      } else {
        // DocPro nie ma #currentSummaryFullWrap – zrób „stack” wewnątrz wrap
        wrap.style.display = 'block';
        wrap.appendChild(buildCard(colA, 'currentSummaryCardLeft'));
        wrap.appendChild(buildCard(colB, 'currentSummaryCardRight'));
      }
    }
  } else {
    // Brak „Ostatniego pomiaru”: jedna karta w prawej kolumnie (jak wcześniej)
    removeClones();
    if (fullWrap) { fullWrap.style.display = 'none'; fullWrap.innerHTML = ''; }
    wrap.style.display = 'block';
    card.style.display = 'block';
    // wypełnij istniejącą kartę jedną kolumną wierszy
    content.innerHTML = '';
    const cols = document.createElement('div');
    cols.className = 'current-summary-columns';
    cols.appendChild(buildColumnRows(lines));
    content.appendChild(cols);
    // Po utworzeniu kart podsumowania w trybie desktopowym upewnij się,
    // że lewa i prawa karta podsumowania mają równą wysokość.  Funkcja
    // adjustSummaryCardsHeight ustawia wysokości obu kart w trybie
    // dwukolumnowym i resetuje style w trybie jednokolumnowym.
    if (typeof window.adjustSummaryCardsHeight === 'function') {
      try { window.adjustSummaryCardsHeight(); } catch (_) {}
    }
  }
}

// Po załadowaniu strony dodajemy obsługę zdarzeń blur na polach wiek, waga i wzrost.
// Gdy użytkownik zakończy edycję dowolnego z tych pól (tj. pole traci fokus),
// sprawdzamy, czy dane są kompletne i czy karta z wynikami jest widoczna.
// Jeśli tak, wywołujemy funkcję scrollToResultsCard(), która płynnie
// przewinie stronę tak, aby karta BMI znalazła się u góry widoku.
if (typeof document !== 'undefined') {
  // Funkcja inicjująca obsługę przewijania po opuszczeniu pól wprowadzania danych.
  function initScrollOnBlur() {
    try {
      const ageInputEl    = document.getElementById('age');
      const weightInputEl = document.getElementById('weight');
      const heightInputEl = document.getElementById('height');
      if (!ageInputEl || !weightInputEl || !heightInputEl) return;
      // Funkcja wywoływana po opuszczeniu pola lub zmianie jego wartości.
      // Używamy setTimeout, aby poczekać na wygenerowanie wyników i repozycjonowanie.
      const onBlurOrChangeHandler = function() {
        setTimeout(() => {
          try {
            // Na potrzeby przewijania po opuszczeniu pól wprowadzania danych
            // nie korzystamy z globalnej funkcji scrollToResultsCard, gdyż
            // jej wywołanie mogło nastąpić wcześniej w trakcie edycji.
            // Zamiast tego bezpośrednio przewijamy kartę BMI do górnej
            // krawędzi okna, o ile wszystkie pola są wypełnione i karta
            // z wynikami jest widoczna.
            const ageVal    = parseFloat(document.getElementById('age')?.value)    || 0;
            const weightVal = parseFloat(document.getElementById('weight')?.value) || 0;
            const heightVal = parseFloat(document.getElementById('height')?.value) || 0;
            const resultsEl = document.getElementById('results');
            if (!(ageVal > 0 && weightVal > 0 && heightVal > 0)) return;
            if (resultsEl && resultsEl.style.display === 'none') return;
            const bmiCardEl = document.getElementById('bmiCard');
            // Jeśli przewijanie jest globalnie wyłączone (po wczytaniu danych), nie przewijaj
            if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) {
              return;
            }
            if (bmiCardEl) {
              // Używamy naszej funkcji scrollToResultsCard, która dodatkowo sprawdzi
              // widoczność wyników, stan aktywnego elementu oraz inne wykluczenia.
              scrollToResultsCard();
            }
          } catch (_) {
            /* ignoruj błędy */
          }
        }, 200);
      };
      ['blur','change'].forEach(evt => {
        ageInputEl.addEventListener(evt, onBlurOrChangeHandler);
        weightInputEl.addEventListener(evt, onBlurOrChangeHandler);
        heightInputEl.addEventListener(evt, onBlurOrChangeHandler);
      });
    } catch (_) {
      /* ignoruj błędy inicjalizacji */
    }
  }
  // Jeżeli dokument jest już załadowany, inicjujemy od razu.  W przeciwnym
  // razie czekamy na zdarzenie DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollOnBlur);
  } else {
    initScrollOnBlur();
  }
}

// -----------------------------------------------------------------------------
// Wyłącz automatyczne przewijanie po interakcji z określonymi polami
// (obwód talii, obwód bioder, lista przekąsek, lista dań obiadowych i karta
// planu odchudzania).  Ustawia flagę skipAutoScrollOnce na true przy
// wejściu do któregoś z tych pól, aby zapobiec automatycznemu scrollowaniu
// wyników bezpośrednio po ich edycji.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('focusin', (e) => {
      try {
        const target = e.target;
        if (!target) return;
        // Ustal, czy element jest jednym z wykluczonych pól lub znajduje się
        // wewnątrz jednej z wykluczonych sekcji.
        if (target.id === 'waistCm' || target.id === 'hipCm') {
          // Ustaw licznik pomijania scrollowania na większą wartość, aby
          // zignorować wszystkie wywołania scrollowania generowane po
          // aktualizacji tych pól oraz następującym repozycjonowaniu elementów.
          skipAutoScrollCounter = 3;
          return;
        }
        if (typeof target.closest === 'function') {
          if (target.closest('#snackList') || target.closest('#mealList') || target.closest('#planCard')) {
            // Ustaw większą wartość, ponieważ zmiany w listach przekąsek/dania
            // mogą powodować kilka wywołań scrollowania (update + reposition).
            skipAutoScrollCounter = 3;
            return;
          }
        }
      } catch (_) {
        /* ignoruj błędy wykrywania */
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Inicjalizacja przełącznika trybu wyników (standardowe / profesjonalne)
// Funkcja ta ustawia stan przełącznika na podstawie localStorage i
// rejestruje obsługę zdarzenia zmiany. Dzięki temu użytkownik może
// przełączać się między uproszczonymi wynikami (bez Z‑score) a pełnymi
// wynikami profesjonalnymi. Stan przełącznika jest zapisywany do
// localStorage i odczytywany przy kolejnym uruchomieniu aplikacji.
(() => {
  function initResultsModeToggle(){
    const toggle = document.getElementById('resultsModeToggle');
    if (!toggle) return;
    // Odczytaj poprzedni stan z localStorage
    const storedMode = localStorage.getItem('resultsMode');
    professionalMode = (storedMode === 'professional');
    // Zapamiętaj tryb także w obiekcie window, aby był dostępny dla
    // generateMetabolicSummary() (korzysta z window.professionalMode)
    try {
      window.professionalMode = professionalMode;
    } catch (e) {
      /* ignoruj błąd ustawiania właściwości */
    }
    // Ustaw stan zaznaczenia (checked = tryb profesjonalny)
    toggle.checked = professionalMode;
    // Obsłuż zmianę stanu suwaka
    toggle.addEventListener('change', () => {
      professionalMode = toggle.checked;
      // Zapisz bieżący stan również w obiekcie window, aby inne funkcje mogły
      // odczytać tryb profesjonalny za pomocą window.professionalMode.  Bez
      // tej instrukcji window.professionalMode może pozostać niezdefiniowane.
      try {
        window.professionalMode = professionalMode;
      } catch (e) {
        /* ignoruj błąd ustawiania właściwości */
      }
      localStorage.setItem('resultsMode', professionalMode ? 'professional' : 'standard');

      // -------------------------------------------------------------------
      // Wyłącz jednorazowo autoscroll podczas przełączania trybu wyników
      //
      // Zmiana trybu (standardowy ↔ profesjonalny) powoduje wywołanie update()
      // oraz funkcji repozycjonujących, co w normalnych warunkach skutkuje
      // automatycznym przewinięciem strony do karty BMI.  Aby temu zapobiec
      // i pozwolić użytkownikowi pozostać w bieżącym miejscu, ustawiamy
      // licznik skipAutoScrollCounter na co najmniej 3.  Scroll będzie
      // pomijany podczas kolejnych wywołań scrollToResultsCard() aż do
      // momentu wyzerowania licznika w tej funkcji.
      if (typeof skipAutoScrollCounter !== 'undefined') {
        // Ustaw wartość większą lub równą 3.  Korzystamy z Math.max, aby
        // nie resetować licznika do niższej wartości, jeśli został już
        // wcześniej zwiększony przez inne interakcje.
        skipAutoScrollCounter = Math.max(skipAutoScrollCounter, 3);
      }

      // Aktualizuj wyniki po zmianie trybu. Wywołujemy debouncedUpdate lub update,
      // a następnie niezależnie przeliczamy sekcję zaawansowaną, aby zawartość
      // ramki wyników „Zaawansowane obliczenia wzrostowe” zawsze reagowała na
      // zmianę trybu (ukrywając np. różnicę hSDS - mpSDS w trybie standardowym).
      if (typeof debouncedUpdate === 'function') {
        debouncedUpdate();
      } else if (typeof update === 'function') {
        update();
      }
      // Jeśli funkcja obliczeń zaawansowanych jest dostępna, uruchom ją ponownie,
      // aby wymusić aktualizację zawartości sekcji niezależnie od zmian w innych
      // polach formularza.
      if (typeof calculateGrowthAdvanced === 'function') {
        calculateGrowthAdvanced();
      }

      // Wywołaj aktualizację karty podsumowania wyników.  Dodajemy to
      // wywołanie, aby zapewnić natychmiastową reakcję na zmianę trybu.
      if (typeof updateProfessionalSummaryCard === 'function') {
        try { updateProfessionalSummaryCard(); } catch (e) {/*ignore*/}
      }
    });
  }
  if (document.readyState !== 'loading') {
    initResultsModeToggle();
  } else {
    document.addEventListener('DOMContentLoaded', initResultsModeToggle);
  }
})();
/* ============================================================================
 *  DOWN SYNDROME (Zemel 2015) – centyle wagi/wzrostu/BMI i obwodu głowy
 *  Wymaga załadowanego window.DS (z ds_lms.js).  Funkcje te działają
 *  niezależnie od głównej funkcji update() i automatycznie aktualizują
 *  wyniki, gdy użytkownik zmienia dane (wiek, płeć, waga, wzrost).
 * ==========================================================================*/

// Pomocnicze funkcje do odczytu pól formularza
function __ds_readAgeYears() {
  const ageEl = document.getElementById('age');
  const ageMEl = document.getElementById('ageMonths');
  const y = parseFloat(ageEl && ageEl.value) || 0;
  const m = parseFloat(ageMEl && ageMEl.value) || 0;
  return y + (m / 12);
}
function __ds_readSex() {
  const sexEl = document.getElementById('sex');
  return (sexEl && sexEl.value === 'F') ? 'F' : 'M';
}
function __ds_readWeight() {
  const el = document.getElementById('weight');
  return parseFloat(el && el.value);
}
function __ds_readHeightCm() {
  const el = document.getElementById('height');
  return parseFloat(el && el.value);
}

// Obliczanie Z-score z parametrów LMS
function __ds_zFromLMS(L, M, S, value) {
  if (!(M > 0) || !(S > 0) || !(value > 0)) return NaN;
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}
// Aproksymacja gęstości i dystrybuanty N(0,1)
function __ds_phi(z){ return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
function __ds_cdf(z){
  const b1=0.319381530, b2=-0.356563782, b3=1.781477937, b4=-1.821255978, b5=1.330274429, p=0.2316419;
  const t = 1 / (1 + p * Math.abs(z));
  const poly = ((((b5*t + b4)*t + b3)*t + b2)*t + b1) * t;
  const cdf  = 1 - __ds_phi(Math.abs(z)) * poly;
  return (z >= 0) ? cdf : 1 - cdf;
}
function __ds_fmtPerc(p){
  if (p == null || !isFinite(p)) return '—';
  if (p < 1)  return '&lt;1 centyl';
  if (p > 99) return '&gt;99 centyl';
  return Math.round(p) + ' centyl';
}
function __ds_round1(x){ return (Math.round(x * 10) / 10).toFixed(1); }

// Interpolacja dla wieku w miesiącach (niemowlęta) i latach (dzieci ≥2)
function __ds_interpMonths(table, m){
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  if (m <= keys[0]) return table[String(keys[0])];
  if (m >= keys[keys.length-1]) return table[String(keys[keys.length-1])];
  const lo = Math.floor(m), hi = Math.ceil(m);
  const vLo = table[String(lo)], vHi = table[String(hi)];
  if (!vLo || !vHi || lo === hi) return vLo || vHi || null;
  const t = (m - lo) / (hi - lo);
  return [
    vLo[0] + t * (vHi[0] - vLo[0]),
    vLo[1] + t * (vHi[1] - vLo[1]),
    vLo[2] + t * (vHi[2] - vLo[2]),
  ];
}
function __ds_interpYears(table, y){
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  if (y <= keys[0]) return table[String(keys[0])];
  if (y >= keys[keys.length-1]) return table[String(keys[keys.length-1])];
  let lo = keys[0], hi = keys[keys.length-1];
  for (let i=1;i<keys.length;i++){
    if (keys[i] >= y){ hi = keys[i]; lo = keys[i-1]; break; }
  }
  const vLo = table[String(lo)], vHi = table[String(hi)];
  if (!vLo || !vHi || lo === hi) return vLo || vHi || null;
  const t = (y - lo) / (hi - lo);
  return [
    vLo[0] + t * (vHi[0] - vLo[0]),
    vLo[1] + t * (vHi[1] - vLo[1]),
    vLo[2] + t * (vHi[2] - vLo[2]),
  ];
}

// Pobieranie LMS według metryki
// metric: 'WT' (waga), 'HT' (wzrost/długość), 'BMI', 'HC' (obwód głowy)
function __ds_getLMS(sex, ageYears, metric){
  if (!window.DS) return null;
  const DS = window.DS;
  if (ageYears < 2){
    const m = Math.max(0, Math.min(36, ageYears * 12));
    if (metric === 'WT') {
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_WEIGHT_BOYS : DS.DS_INFANT_WEIGHT_GIRLS, m);
    }
    if (metric === 'HT') {
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_LENGTH_BOYS : DS.DS_INFANT_LENGTH_GIRLS, m);
    }
    if (metric === 'HC') {
      const mm = Math.max(1, m);
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_HEAD_BOYS : DS.DS_INFANT_HEAD_GIRLS, mm);
    }
    if (metric === 'BMI') {
      return null;
    }
    return null;
  } else {
    const y = Math.min(20, Math.max(2, ageYears));
    if (metric === 'WT') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_WEIGHT_BOYS : DS.DS_CHILD_WEIGHT_GIRLS, y);
    }
    if (metric === 'HT') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_HEIGHT_BOYS : DS.DS_CHILD_HEIGHT_GIRLS, y);
    }
    if (metric === 'HC') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_HEAD_BOYS : DS.DS_CHILD_HEAD_GIRLS, y);
    }
    if (metric === 'BMI') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_BMI_BOYS : DS.DS_CHILD_BMI_GIRLS, y);
    }
    return null;
  }
}

// Wyznacza centyl dla danej wartości
function __ds_percentile(sex, ageYears, metric, value){
  const lms = __ds_getLMS(sex, ageYears, metric);
  if (!lms) return null;
  const z = __ds_zFromLMS(lms[0], lms[1], lms[2], value);
  if (!isFinite(z)) return null;
  return __ds_cdf(z) * 100;
}

// Budowanie treści wyników DS (waga, wzrost, BMI)
function __ds_buildResultsHTML() {
  const ageY  = __ds_readAgeYears();
  const sex   = __ds_readSex();
  const w     = __ds_readWeight();
  const hCm   = __ds_readHeightCm();
  const hM    = (hCm > 0 ? hCm / 100 : NaN);
  const bmi   = (isFinite(w) && isFinite(hM) && hM>0) ? (w / (hM*hM)) : NaN;

  const pW  = (isFinite(w)   ? __ds_percentile(sex, ageY, 'WT',  w)   : null);
  const pH  = (isFinite(hCm) ? __ds_percentile(sex, ageY, 'HT',  hCm) : null);
  const pBMI= (ageY >= 2 && isFinite(bmi) ? __ds_percentile(sex, ageY, 'BMI', bmi) : null);

  const lines = [];
  if (!(ageY >= 0 && ageY <= 20)) {
    lines.push('<div>Wiek poza zakresem karty (0–20 lat).</div>');
  } else {
    if (isFinite(w)) {
      lines.push(`<div><strong>Waga:</strong> <span class="result-val">${__ds_round1(w)} kg</span> — ${__ds_fmtPerc(pW)} (DS)</div>`);
    }
    if (isFinite(hCm)) {
      lines.push(`<div><strong>Wzrost:</strong> <span class="result-val">${__ds_round1(hCm)} cm</span> — ${__ds_fmtPerc(pH)} (DS)</div>`);
    }
    if (ageY < 2) {
      lines.push(`<div><strong>BMI:</strong> — <span class="muted">Brak norm DS dla &lt;2 lat (stosuj WFL).</span></div>`);
    } else if (isFinite(bmi)) {
      lines.push(`<div><strong>BMI:</strong> <span class="result-val">${__ds_round1(bmi)}</span> — ${__ds_fmtPerc(pBMI)} (DS)</div>`);
    }
  }
  return lines.join('');
}

// Aktualizuje widoczność sekcji DS w zależności od wieku
function __ds_updateSectionVisibility() {
  const section = document.getElementById('downSyndromeSection');
  if (!section) return;
  const ageY = __ds_readAgeYears();
  if (isFinite(ageY) && ageY <= 20) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
    const card = document.getElementById('downSyndromeCard');
    if (card) card.style.display = 'none';
  }
}
// Przelicza i wstawia wyniki DS
function __ds_computeAndRender() {
  const box = document.getElementById('dsPercentiles');
  if (!box) return;
  box.innerHTML = __ds_buildResultsHTML();
  box.style.display = 'block';
}
// Aktualizuje centyl obwodu głowy
function __ds_updateHeadCirc() {
  const out = document.getElementById('headCircumResultDS');
  const input = document.getElementById('headCircumDS');
  if (!out || !input) return;
  const ageY = __ds_readAgeYears();
  const sex  = __ds_readSex();
  const val  = parseFloat(input.value);
  if (!isFinite(val) || !(ageY >= 0 && ageY <= 20)) {
    out.style.display = 'none';
    out.innerHTML = '';
    return;
  }
  const p = __ds_percentile(sex, ageY, 'HC', val);
  if (p == null) {
    out.style.display = 'block';
    out.innerHTML = '<div>Brak danych DS dla obwodu głowy w tym wieku.</div>';
  } else {
    out.style.display = 'block';
    out.innerHTML = `<div><strong>Obwód głowy:</strong> <span class="result-val">${__ds_round1(val)} cm</span> — ${__ds_fmtPerc(p)} (DS)</div>`;
  }
}

// Inicjalizacja zdarzeń po załadowaniu DOM
document.addEventListener('DOMContentLoaded', function(){
  const btn = document.getElementById('toggleDownSyndrome');
  const card = document.getElementById('downSyndromeCard');
  const headInput = document.getElementById('headCircumDS');

  // Ustaw widoczność sekcji na podstawie wieku
  __ds_updateSectionVisibility();

  // Przełącznik karty DS
  if (btn && card) {
    btn.addEventListener('click', function(){
      const isHidden = (card.style.display === 'none' || card.style.display === '');
      if (isHidden) {
        card.style.display = 'block';
        __ds_computeAndRender();
        __ds_updateHeadCirc();
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Autoprzeliczanie przy zmianie podstawowych pól
  ['age','ageMonths','weight','height','sex'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function(){
        __ds_updateSectionVisibility();
        if (card && card.style.display === 'block') {
          __ds_computeAndRender();
          __ds_updateHeadCirc();
        }
      });
    }
  });

  // Centyl obwodu głowy na żywo
  if (headInput) {
    headInput.addEventListener('input', __ds_updateHeadCirc);
  }
});

// === ANOREXIA RISK MODULE ================================================
// Ten moduł wykrywa ryzyko zaburzeń odżywiania (anoreksji) i automatycznie
// koryguje całkowity wydatek energetyczny (TEE) o 15% w przypadku wykrycia
// ryzyka. Wyświetla również baner ostrzegawczy w określonym kontenerze.
(function () {
  // --- Konfiguracja progów i korekt ---
  const AN_CFG = {
    adult: {
      bmiWarn: 18.5,     // wczesne ostrzeżenie dla dorosłych
      bmiAN: 17.5,       // sygnał anoreksji u dorosłych
      bmiExtreme: 13.0   // skrajna niedowaga
    },
    teen: {
      minAgeMonths: 13 * 12,
      maxAgeMonths: 17 * 12 + 11,
      ebwCut: 0.85       // <85% spodziewanej masy (EBW) sygnalizuje ryzyko
    },
    // NOWE: progi pediatryczne dla dzieci i młodzieży (0–17 lat)
    // Parametry można dostosować w przyszłości bez zmiany logiki
    peds: {
      ageMinMonths: 0,
      ageMaxMonths: 17 * 12 + 11,
      // Klasyfikacja wg udziału masy ciała do mediany BMI (MBMI = BMI / BMI50).
      // Zgodnie z wytycznymi:
      // 80–90% median BMI => łagodne niedożywienie (+1 pkt)
      // 70–79% median BMI => umiarkowane niedożywienie (+2 pkt)
      // <70% median BMI    => ciężkie niedożywienie (+3 pkt)
      // Zmienione progi MBMI zgodnie z literaturą, aby zwiększyć specyficzność:
      // 75–84% mediany BMI => łagodne niedożywienie (+1 pkt)
      // 65–74% mediany BMI => umiarkowane niedożywienie (+2 pkt)
      // <65% mediany BMI    => ciężkie niedożywienie (+3 pkt)
      mbmiMild: 0.85,
      mbmiModerate: 0.75,
      mbmiSevere: 0.65,
      // Bardzo niskie BMI: poniżej 2. centyla – dodaj 2 pkt
      bmiCentileSevere: 2.0,
      // Progi szybkiej utraty masy:
      rapidLossKgPerWeek: 1.0,        // >1 kg/tydz. utraty masy
      rapidLoss6mPct: 20,             // ≥20% w 6 mies. (zastępuje low weight)
      acuteLoss3mModeratePctMin: 15,  // 15–<20% w 3 mies.
      acuteLoss3mSeverePctMin: 20     // ≥20% w 3 mies.
    },
    // NOWE: parametry oceniające brak spodziewanego przyrostu (failure-to-gain)
    trajectory: {
      // Minimalny odstęp czasowy między dwoma pomiarami, aby ocenić przyrost (w dniach).
      minWindowDays: 150,
      // Spodziewany wzrost EBW w tym oknie (w kg). Jeżeli EBW wzrośnie co najmniej o tyle,
      // a rzeczywista masa nie wzrośnie, uznajemy brak spodziewanego przyrostu.
      minDeltaEbwKg: 1.5,
      // Maksymalny akceptowany rzeczywisty przyrost masy (w kg).
      // Jeśli jest równy lub mniejszy od tego, uznajemy brak przyrostu.
      maxObservedGainKg: 0
    },
    loss: {
      weeklyPctWarn: 0.5,
      weeklyPctHigh: 1.0,
      monthlyPctWarn: 3.0,
      monthlyPctHigh: 5.0
    },
    intake: {
      fracOfTEEWarn: 0.60,
      fracOfBMRWarn: 1.00
    },
    correction: {
      teeFactor: 0.85    // redukcja TEE o 15%
    },
    ui: {
      mountId: 'intakeResults' // domyślny kontener banera
    }
  };

      // Przekształca wiek w latach i miesiącach na pełne miesiące
      // Poprzednia implementacja mnożyła wiek (z ułamkiem miesięcy) przez 12 i
      // dodawała ponownie liczbę miesięcy. To prowadziło do podwójnego
      // zliczania miesięcy, gdy ageYears zawierał część ułamkową (np. 11,0833…
      // reprezentujący 11 lat i 1 miesiąc). Nowa wersja rozdziela część
      // całkowitą i ułamkową, tak aby miesiące z ageYears nie były liczone
      // dwukrotnie. Funkcja przyjmuje liczbę lat (ageYears) i dodatkowe
      // miesiące (ageMonthsOpt) z formularza i zwraca całkowitą liczbę
      // miesięcy.
      function toMonths(ageYears, ageMonthsOpt) {
        // Konwertuj dane wejściowe; NaN traktuj jako 0
        const y = Number(ageYears) || 0;
        const mOpt = Number(ageMonthsOpt) || 0;
        // Jeżeli użytkownik podał liczbę miesięcy w osobnym polu (mOpt > 0),
        // przyjmij, że ageYears zawiera tylko część całkowitą i nie zawiera
        // miesięcy jako ułamka. W przeciwnym wypadku wykorzystaj ułamek z ageYears.
        let total;
        if (mOpt > 0) {
          // Wykorzystaj całkowitą część lat i dodaj przekazane miesiące
          total = Math.floor(y) * 12 + mOpt;
        } else {
          // Użytkownik podał wiek wyłącznie w latach (być może z ułamkiem),
          // więc przemnażamy całą wartość przez 12, aby uzyskać miesiące.
          total = y * 12;
        }
        return Math.max(0, Math.round(total));
      }

  // Oblicza BMI z wagi (kg) i wzrostu (cm)
  function bmiKgM2(weightKg, heightCm) {
    const h = Number(heightCm) / 100;
    const w = Number(weightKg);
    if (!h || !w) return null;
    return w / (h * h);
  }

  // Próbuje pobrać 50. centyl BMI dla wieku i płci (jeśli funkcje istnieją)
  function getBMIp50(ageMonths, sex) {
    try {
      if (typeof window.getBmiP50ForAgeSex === 'function') {
        return window.getBmiP50ForAgeSex(ageMonths, sex);
      }
      if (typeof window.getColeBMI50 === 'function') {
        return window.getColeBMI50(ageMonths, sex);
      }
    } catch {}
    return null;
  }

  // Szacuje oczekiwaną masę ciała (EBW) na podstawie BMI‑50 i wzrostu
  function estimateEBW(ageMonths, sex, heightCm) {
    const bmi50 = getBMIp50(ageMonths, sex);
    if (!bmi50) return null;
    const h2 = Math.pow(Number(heightCm) / 100, 2);
    return bmi50 * h2;
  }

  // Oblicza tempo spadku masy ciała na podstawie historii pomiarów
  function computeLossRates(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const data = history
      .map(r => {
        let t = null;
        if (r.t != null) t = Number(r.t);
        else if (r.date) t = Date.parse(r.date);
        else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
        return (t && r.weight != null) ? { t, w: Number(r.weight) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (data.length < 2) return null;
    let a = data[data.length - 2], b = data[data.length - 1];
    for (let i = data.length - 2; i >= 0; i--) {
      const cand = data[i];
      const days = (b.t - cand.t) / (1000 * 3600 * 24);
      if (days >= 14) { a = cand; break; }
    }
    const dtDays = Math.max(1, (b.t - a.t) / (1000 * 3600 * 24));
    const dw = b.w - a.w;
    const pctChange = (dw / a.w) * 100;
    const weeklyPct = pctChange * (7 / dtDays);
    const monthlyPct = pctChange * (30.44 / dtDays);
    return { weeklyPct, monthlyPct };
  }

  // --- Pomocnicze funkcje statystyczne dla pediatrii (0–17 lat) ---
  // Oblicza funkcję błędu (erf) i dystrybuantę normalną (phi) – potrzebne do
  // konwersji LMS -> z-score -> centyl BMI. Przybliżenie Abramowitz-Stegun
  // zapewnia wystarczającą dokładność do obliczania percentyli.
  function _erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }
  function _phi(z) {
    return 0.5 * (1 + _erf(z / Math.SQRT2));
  }
  // Oblicza centyl BMI na podstawie LMS (z getLMS) i podanego BMI.
  // Zwraca wartość z zakresu 0–100 lub null, jeśli nie można obliczyć.
  function bmiCentile(ageMonths, sex, bmi) {
    if (!bmi || typeof getLMS !== 'function') return null;
    const lms = getLMS(sex === 'M' ? 'M' : 'F', Math.round(ageMonths));
    if (!lms) return null;
    const [L, M, S] = lms;
    if (!M || !S) return null;
    let z;
    if (Math.abs(L) < 1e-8) {
      z = Math.log(bmi / M) / S;
    } else {
      z = (Math.pow(bmi / M, L) - 1) / (L * S);
    }
    return _phi(z) * 100;
  }
  // Zwraca bogatsze statystyki z dwóch ostatnich pomiarów masy ciała.
  // Używane do oceny szybkiej/ostrej utraty masy u dzieci i młodzieży.
  function computeTwoPointStats(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const data = history
      .map(r => {
        let t = null;
        if (r.t != null) t = Number(r.t);
        else if (r.date) t = Date.parse(r.date);
        else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
        return (t && r.weight != null) ? { t, w: Number(r.weight) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (data.length < 2) return null;
    let b = data[data.length - 1], a = data[data.length - 2];
    for (let i = data.length - 2; i >= 0; i--) {
      const cand = data[i];
      const days = (b.t - cand.t) / (1000 * 3600 * 24);
      if (days >= 14) { a = cand; break; }
    }
    const dtDays = Math.max(1, (b.t - a.t) / (1000 * 3600 * 24));
    const dW = b.w - a.w;                 // różnica w kg (ujemne = utrata)
    const pctChange = (dW / a.w) * 100;   // % zmiany względem starszego punktu
    // kg utracone na tydzień (dodatnie = utrata)
    const kgPerWeek = Math.max(0, -dW) / (dtDays / 7);
    // Przeskalowane % utraty do 3 i 6 miesięcy (zawsze dodatnie)
    const pct3m = Math.max(0, -pctChange) * (91.31 / dtDays);
    const pct6m = Math.max(0, -pctChange) * (182.62 / dtDays);
    return { a, b, dtDays, dW, pctChange, kgPerWeek, pct3m, pct6m };
  }

  // Wykrywa ryzyko anoreksji na podstawie BMI, tempa spadku masy, EBW oraz spożycia
  function detectAnRisk(user, opts = {}) {
    const reasons = [];
    let severityScore = 0;
    const ageMonths = toMonths(user.ageYears, user.ageMonthsOpt);
    const isAdult = ageMonths >= 18 * 12;
    const isTeen  = ageMonths >= AN_CFG.teen.minAgeMonths && ageMonths <= AN_CFG.teen.maxAgeMonths;
    const bmi = bmiKgM2(user.weightKg, user.heightCm);
    if (isAdult && bmi) {
      if (bmi < AN_CFG.adult.bmiExtreme) {
        reasons.push(`Skrajnie niskie BMI u dorosłego (${bmi.toFixed(1)}).`);
        severityScore += 3;
      } else if (bmi < AN_CFG.adult.bmiAN) {
        reasons.push(`BMI < ${AN_CFG.adult.bmiAN} u dorosłego (${bmi.toFixed(1)}).`);
        severityScore += 2;
      } else if (bmi < AN_CFG.adult.bmiWarn) {
        reasons.push(`BMI < ${AN_CFG.adult.bmiWarn} u dorosłego (${bmi.toFixed(1)}).`);
        severityScore += 1;
      }
    }
    if (isTeen) {
      const ebw = estimateEBW(ageMonths, user.sex, user.heightCm);
      if (ebw) {
        const frac = user.weightKg / ebw;
        if (frac < AN_CFG.teen.ebwCut) {
          reasons.push(`Masa < ${(AN_CFG.teen.ebwCut * 100).toFixed(0)}% należnej dla wieku/wzrostu (EBW).`);
          severityScore += 2;
        }
      } else {
        if (bmi && bmi < AN_CFG.adult.bmiWarn) {
          reasons.push(`Niskie BMI u młodzieży (fallback dorosłych): ${bmi.toFixed(1)}.`);
          severityScore += 1;
        }
      }
    }
    // NOWE: pediatria (0–17 lat) – analiza według wytycznych specjalistycznych
    const isPeds = (ageMonths >= AN_CFG.peds.ageMinMonths && ageMonths <= AN_CFG.peds.ageMaxMonths);
    if (isPeds && bmi) {
      // 1) Ocena niedożywienia na podstawie udziału masy do mediany BMI (MBMI)
      const bmi50 = getBMIp50(ageMonths, user.sex);
       if (bmi50) {
         const mbmi = bmi / bmi50;
         // Aby uniknąć fałszywych alarmów u szczupłych, zdrowych dzieci, ocena niedożywienia
         // na podstawie udziału masy do mediany BMI (MBMI) odbywa się tylko wtedy, gdy
         // dostępnych jest co najmniej 2 pomiarów masy w historii (bieżący + poprzedni).
         const historyCount = (opts.history && opts.history.length) ? opts.history.length : 0;
         if (historyCount >= 2) {
           if (mbmi < AN_CFG.peds.mbmiSevere) {
             reasons.push('Ciężkie niedożywienie: <65% median BMI.');
             severityScore += 3;
           } else if (mbmi < AN_CFG.peds.mbmiModerate) {
             reasons.push('Umiarkowane niedożywienie: 65–74% median BMI.');
             severityScore += 2;
           } else if (mbmi < AN_CFG.peds.mbmiMild) {
             reasons.push('Łagodne niedożywienie: 75–84% median BMI.');
             severityScore += 1;
           }
         }
       }
      // 2) Bardzo niskie BMI – poniżej 2. centyla
      const cent = bmiCentile(ageMonths, user.sex, bmi);
      if (cent != null && cent < AN_CFG.peds.bmiCentileSevere) {
        reasons.push('BMI < 2. centyla dla wieku/płci.');
        severityScore += 2;
      }
      // 3) Progi szybkiej i ostrej utraty masy z historii
      const stats = computeTwoPointStats(opts.history || null);
      if (stats) {
        // >1 kg/tydz. utraty masy
        if (stats.kgPerWeek > AN_CFG.peds.rapidLossKgPerWeek) {
          reasons.push(`Szybka utrata masy > ${AN_CFG.peds.rapidLossKgPerWeek} kg/tydz.`);
          severityScore += 2;
        }
        // ≥20% utraty w 6 mies.
        if (stats.pct6m >= AN_CFG.peds.rapidLoss6mPct) {
          reasons.push(`Szybka utrata masy ≥ ${AN_CFG.peds.rapidLoss6mPct}% w 6 mies.`);
          severityScore += 2;
        }
        // Ostry spadek w 3 mies. (15–<20% lub ≥20%)
        if (stats.pct3m >= AN_CFG.peds.acuteLoss3mSeverePctMin) {
          reasons.push('Ostry spadek masy ≥20% w 3 mies.');
          severityScore += 2;
        } else if (stats.pct3m >= AN_CFG.peds.acuteLoss3mModeratePctMin) {
          reasons.push('Ostry spadek masy 15–<20% w 3 mies.');
          severityScore += 1;
        }
        // 4) Brak spodziewanego przyrostu masy względem trajektorii EBW
        if (typeof getBmiP50ForAgeSex === 'function' || typeof getColeBMI50 === 'function') {
          const monthsBack = Math.round(stats.dtDays / 30.44);
          const ebwPrev = estimateEBW(ageMonths - monthsBack, user.sex, user.heightCm);
          const ebwCurr = estimateEBW(ageMonths, user.sex, user.heightCm);
          if (ebwPrev && ebwCurr) {
            const deltaEBW = ebwCurr - ebwPrev;
            const observedGain = stats.dW;
            // oblicz Wskaźnik Cole'a jako procent odniesienia do należnej masy (EBW)
            let colePct = null;
            try {
              colePct = (user.weightKg && ebwCurr) ? (user.weightKg / ebwCurr) * 100 : null;
            } catch (_) {
              colePct = null;
            }
            // ocena braku przyrostu tylko, gdy wystarczająco długi odstęp, oczekiwany przyrost EBW jest istotny,
            // rzeczywisty przyrost jest niewielki lub ujemny, oraz Cole < 90% (dziecko poniżej normy wagowej)
            if (stats.dtDays >= AN_CFG.trajectory.minWindowDays &&
                deltaEBW >= AN_CFG.trajectory.minDeltaEbwKg &&
                observedGain <= AN_CFG.trajectory.maxObservedGainKg &&
                colePct != null && colePct < 90) {
              reasons.push('Brak spodziewanego przyrostu masy względem trajektorii EBW (aktywne przy Cole < 90%).');
              severityScore += 1;
            }
          }
        }
      }
    }
    const rates = computeLossRates(opts.history || null);
    if (rates) {
      if (rates.weeklyPct <= -AN_CFG.loss.weeklyPctHigh || rates.monthlyPct <= -AN_CFG.loss.monthlyPctHigh) {
        reasons.push(`Gwałtowny spadek masy: ${(Math.abs(rates.weeklyPct)).toFixed(1)}%/tydz. lub ${(Math.abs(rates.monthlyPct)).toFixed(1)}%/mies.`);
        severityScore += 2;
      } else if (rates.weeklyPct <= -AN_CFG.loss.weeklyPctWarn || rates.monthlyPct <= -AN_CFG.loss.monthlyPctWarn) {
        reasons.push(`Szybki spadek masy: ${(Math.abs(rates.weeklyPct)).toFixed(1)}%/tydz. lub ${(Math.abs(rates.monthlyPct)).toFixed(1)}%/mies.`);
        severityScore += 1;
      }
    }
    if (opts.intakeKcalPerDay && (opts.bmr || opts.pal)) {
      const teeRawLocal = (opts.bmr && opts.pal) ? (opts.bmr * opts.pal) : null;
      if (teeRawLocal) {
        const fracTEE = opts.intakeKcalPerDay / teeRawLocal;
        if (fracTEE < AN_CFG.intake.fracOfTEEWarn) {
          reasons.push(`Spożycie < ${(AN_CFG.intake.fracOfTEEWarn * 100).toFixed(0)}% TEE (bardzo niskie).`);
          severityScore += 1;
        }
      }
      if (opts.bmr && opts.intakeKcalPerDay < AN_CFG.intake.fracOfBMRWarn * opts.bmr) {
        reasons.push(`Spożycie < BMR (bardzo niskie).`);
        severityScore += 1;
      }
    }
    const any = severityScore >= 1;
    let level = 'none';
    if (severityScore >= 3) level = 'high';
    else if (severityScore >= 1) level = 'warn';
    return { any, level, reasons, bmi, isAdult, isTeen };
  }

  // Funkcje UI: wstawianie i usuwanie komunikatu o ryzyku zaburzeń odżywiania
  // Zamiast osobnej ramki z czerwonym tłem wstawiamy tekst wewnątrz pola wyników (#intakeResults).
  const BAN_ID = 'an-risk-banner';

  /**
   * Wyświetla komunikat o ryzyku zaburzeń odżywiania w kontenerze wyników.
   * Ustawia również odpowiedni kolor obramowania (czerwony lub pomarańczowy)
   * oraz uruchamia animację pulsowania.
   * @param {{mountId:string, risk:{level:string,reasons:string[]}, teeRaw:number, teeAdjusted:number, factor:number}} opts
   */
  function showAnBanner({ mountId, risk, teeRaw, teeAdjusted, factor }) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    // usuń istniejący komunikat AN
    removeAnBanner(mountId);
    // Utwórz element alertu z odpowiednią klasą ('danger' dla wysokiego ryzyka, 'warn' w przeciwnym razie)
    const wrap = document.createElement('div');
    wrap.id = BAN_ID;
    const level = (risk.level === 'high') ? 'danger' : 'warn';
    wrap.className = `intake-alert ${level}`;
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    // Lista powodów, jeśli istnieje
    const reasonsList = (risk.reasons || []).map(r => `<li>${r}</li>`).join('');
    // Tytuł i treść z korektą TEE
    const title = 'Wykryto ryzyko zaburzeń odżywiania – zastosowano korektę zapotrzebowania (−15%).';
    wrap.innerHTML = `\n      <div><strong>${title}</strong></div>\n      ${reasonsList ? `<ul class=\"intake-reasons\">${reasonsList}</ul>` : ''}\n      <div>TEE przed: <strong>${Math.round(teeRaw)} kcal/d</strong> → po: <strong>${Math.round(teeAdjusted)} kcal/d</strong> (×${factor}).</div>\n    `;
    // Wstaw na koniec kontenera
    mount.appendChild(wrap);
    // Zmień kolor ramki i uruchom puls
    mount.classList.remove('bmi-warning','bmi-danger');
    if (risk.level === 'high') {
      mount.classList.add('bmi-danger');
      try { applyPulse(mount, 'danger'); } catch (_) {}
    } else {
      mount.classList.add('bmi-warning');
      try { applyPulse(mount, 'warning'); } catch (_) {}
    }
  }

  /**
   * Usuwa komunikat AN z danego kontenera. Jeśli nie pozostały inne komunikaty,
   * resetuje kolor obramowania i zatrzymuje puls.
   * @param {string} mountId
   */
  function removeAnBanner(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const el = document.getElementById(BAN_ID);
    if (el && mount.contains(el)) mount.removeChild(el);
    // Jeśli brak innych alertów, przywróć neutralny stan
    if (!mount.querySelector('.intake-alert')) {
      mount.classList.remove('bmi-warning','bmi-danger');
      try { clearPulse(mount); } catch (_) {}
    }
  }

  // Główna funkcja: oblicza TEE z korektą i zarządza banerem
  function anorexiaRiskAdjust({ user, bmr, pal, history, intakeKcalPerDay, mountId }) {
    const teeRaw = (Number(bmr) || 0) * (Number(pal) || 0);
    const risk = detectAnRisk(user, { history, bmr, pal, intakeKcalPerDay });
    let teeAdjusted = teeRaw;
    if (risk.any) {
      teeAdjusted = Math.max(0, teeRaw * AN_CFG.correction.teeFactor);
      try {
        showAnBanner({
          mountId: mountId || AN_CFG.ui.mountId,
          risk,
          teeRaw,
          teeAdjusted,
          factor: AN_CFG.correction.teeFactor
        });
      } catch {}
    } else {
      try { removeAnBanner(mountId || AN_CFG.ui.mountId); } catch {}
    }
    return { teeRaw, teeAdjusted, risk };
  }

  // Eksport do globalnego obszaru nazw
  window.anorexiaRiskAdjust = anorexiaRiskAdjust;
  window.detectAnRisk = detectAnRisk;
})();

// --- POLISH CENTILE DATA (Palczewska & Niedźwiecka 1999) ---
// Poniższe stałe reprezentują krzywe centylowe długości/wysokości i masy ciała
// dla dziewczynek i chłopców od 0 do 36 miesięcy, opracowane na podstawie
// badań I. Palczewskiej i Z. Niedźwieckiej (Warszawa 1999).  Dla każdej płci
// zdefiniowano słownik, w którym kluczem jest wartość centyla (3, 10, 25, 50,
// 75, 90, 97), a wartością jest tablica 37 elementów odpowiadających miesiącom
// życia (0–36).  Tablice powstały poprzez interpolację liniową pomiędzy
// miesiącami referencyjnymi i ekstrapolację do miesiąca 0 na podstawie
// nachylenia pierwszych dwóch punktów.
const CENTILES_PL_HEIGHT_GIRLS = {
  "3": [48.70, 51.00, 53.30, 56.80, 59.40, 61.80, 63.40, 64.77, 66.13, 67.50, 68.53, 69.57, 70.60, 71.67, 72.73, 73.80, 74.73, 75.67, 76.60, 77.53, 78.47, 79.40, 80.03, 80.67, 81.30, 82.05, 82.80, 83.55, 84.30, 85.05, 85.80, 86.50, 87.20, 87.90, 88.60, 89.30, 90.00],
  "10": [49.20, 51.80, 54.40, 58.00, 60.60, 63.10, 64.80, 66.17, 67.53, 68.90, 69.93, 70.97, 72.00, 73.10, 74.20, 75.30, 76.27, 77.23, 78.20, 79.10, 80.00, 80.90, 81.50, 82.10, 82.70, 83.43, 84.17, 84.90, 85.63, 86.37, 87.10, 87.77, 88.43, 89.10, 89.77, 90.43, 91.10],
  "25": [49.90, 52.80, 55.70, 59.20, 61.80, 64.30, 66.00, 67.40, 68.80, 70.20, 71.33, 72.47, 73.60, 74.73, 75.87, 77.00, 77.97, 78.93, 79.90, 80.77, 81.63, 82.50, 83.10, 83.70, 84.30, 85.08, 85.87, 86.65, 87.43, 88.22, 89.00, 89.68, 90.37, 91.05, 91.73, 92.42, 93.10],
  "50": [51.00, 54.00, 57.00, 60.60, 63.10, 65.50, 67.20, 68.63, 70.07, 71.50, 72.77, 74.03, 75.30, 76.47, 77.63, 78.80, 79.67, 80.53, 81.40, 82.27, 83.13, 84.00, 84.73, 85.47, 86.20, 87.07, 87.93, 88.80, 89.67, 90.53, 91.40, 92.10, 92.80, 93.50, 94.20, 94.90, 95.60],
  "75": [52.30, 55.40, 58.50, 62.00, 64.60, 66.90, 68.50, 69.93, 71.37, 72.80, 74.17, 75.53, 76.90, 78.07, 79.23, 80.40, 81.23, 82.07, 82.90, 83.87, 84.83, 85.80, 86.70, 87.60, 88.50, 89.35, 90.20, 91.05, 91.90, 92.75, 93.60, 94.27, 94.93, 95.60, 96.27, 96.93, 97.60],
  "90": [53.10, 56.40, 59.70, 63.00, 65.70, 67.90, 69.80, 71.27, 72.73, 74.20, 75.60, 77.00, 78.40, 79.50, 80.60, 81.70, 82.63, 83.57, 84.50, 85.57, 86.63, 87.70, 88.63, 89.57, 90.50, 91.40, 92.30, 93.20, 94.10, 95.00, 95.90, 96.58, 97.27, 97.95, 98.63, 99.32, 100.00],
  "97": [54.40, 57.60, 60.80, 64.00, 66.70, 69.00, 70.70, 72.27, 73.83, 75.40, 76.87, 78.33, 79.80, 81.00, 82.20, 83.40, 84.30, 85.20, 86.10, 87.17, 88.23, 89.30, 90.30, 91.30, 92.30, 93.20, 94.10, 95.00, 95.90, 96.80, 97.70, 98.50, 99.30, 100.10, 100.90, 101.70, 102.50],
};

const CENTILES_PL_HEIGHT_BOYS = {
  "3": [49.30, 52.00, 54.70, 57.90, 61.00, 63.00, 64.90, 66.10, 67.30, 68.50, 69.63, 70.77, 71.90, 72.90, 73.90, 74.90, 75.93, 76.97, 78.00, 79.00, 80.00, 81.00, 81.83, 82.67, 83.50, 84.00, 84.50, 85.00, 85.50, 86.00, 86.50, 87.05, 87.60, 88.15, 88.70, 89.25, 89.80],
  "10": [49.90, 53.00, 56.10, 59.50, 62.40, 64.40, 66.20, 67.53, 68.87, 70.20, 71.40, 72.60, 73.80, 74.77, 75.73, 76.70, 77.70, 78.70, 79.70, 80.63, 81.57, 82.50, 83.40, 84.30, 85.20, 85.77, 86.33, 86.90, 87.47, 88.03, 88.60, 89.20, 89.80, 90.40, 91.00, 91.60, 92.20],
  "25": [50.70, 54.00, 57.30, 60.90, 63.80, 65.80, 67.70, 69.03, 70.37, 71.70, 72.90, 74.10, 75.30, 76.37, 77.43, 78.50, 79.43, 80.37, 81.30, 82.13, 82.97, 83.80, 84.77, 85.73, 86.70, 87.37, 88.03, 88.70, 89.37, 90.03, 90.70, 91.30, 91.90, 92.50, 93.10, 93.70, 94.30],
  "50": [52.30, 55.50, 58.70, 62.40, 65.00, 67.30, 69.10, 70.40, 71.70, 73.00, 74.33, 75.67, 77.00, 78.10, 79.20, 80.30, 81.23, 82.17, 83.10, 83.90, 84.70, 85.50, 86.47, 87.43, 88.40, 89.08, 89.77, 90.45, 91.13, 91.82, 92.50, 93.20, 93.90, 94.60, 95.30, 96.00, 96.70],
  "75": [53.00, 56.60, 60.20, 63.70, 66.30, 68.70, 70.60, 71.97, 73.33, 74.70, 76.03, 77.37, 78.70, 79.77, 80.83, 81.90, 82.83, 83.77, 84.70, 85.50, 86.30, 87.10, 88.17, 89.23, 90.30, 91.00, 91.70, 92.40, 93.10, 93.80, 94.50, 95.17, 95.83, 96.50, 97.17, 97.83, 98.50],
  "90": [54.00, 57.70, 61.40, 64.90, 67.50, 69.90, 72.00, 73.43, 74.87, 76.30, 77.63, 78.97, 80.30, 81.33, 82.37, 83.40, 84.33, 85.27, 86.20, 87.03, 87.87, 88.70, 89.83, 90.97, 92.10, 92.78, 93.47, 94.15, 94.83, 95.52, 96.20, 96.90, 97.60, 98.30, 99.00, 99.70, 100.40],
  "97": [55.60, 59.30, 63.00, 66.20, 68.70, 70.80, 73.10, 74.63, 76.17, 77.70, 79.03, 80.37, 81.70, 82.80, 83.90, 85.00, 85.93, 86.87, 87.80, 88.63, 89.47, 90.30, 91.43, 92.57, 93.70, 94.42, 95.13, 95.85, 96.57, 97.28, 98.00, 98.77, 99.53, 100.30, 101.07, 101.83, 102.60],
};

const CENTILES_PL_WEIGHT_GIRLS = {
  "3": [2.40, 3.20, 4.00, 4.70, 5.40, 5.90, 6.30, 6.63, 6.97, 7.30, 7.50, 7.70, 7.90, 8.10, 8.30, 8.50, 8.67, 8.83, 9.00, 9.13, 9.27, 9.40, 9.53, 9.67, 9.80, 9.97, 10.13, 10.30, 10.47, 10.63, 10.80, 10.97, 11.13, 11.30, 11.47, 11.63, 11.80],
  "10": [2.80, 3.60, 4.40, 5.00, 5.70, 6.20, 6.70, 7.03, 7.37, 7.70, 7.97, 8.23, 8.50, 8.70, 8.90, 9.10, 9.30, 9.50, 9.70, 9.87, 10.03, 10.20, 10.33, 10.47, 10.60, 10.77, 10.93, 11.10, 11.27, 11.43, 11.60, 11.78, 11.97, 12.15, 12.33, 12.52, 12.70],
  "25": [3.30, 4.00, 4.70, 5.40, 6.20, 6.50, 7.00, 7.37, 7.73, 8.10, 8.40, 8.70, 9.00, 9.23, 9.47, 9.70, 9.93, 10.17, 10.40, 10.57, 10.73, 10.90, 11.03, 11.17, 11.30, 11.47, 11.63, 11.80, 11.97, 12.13, 12.30, 12.48, 12.67, 12.85, 13.03, 13.22, 13.40],
  "50": [3.60, 4.30, 5.00, 5.80, 6.50, 7.00, 7.50, 7.87, 8.23, 8.60, 8.93, 9.27, 9.60, 9.90, 10.20, 10.50, 10.70, 10.90, 11.10, 11.30, 11.50, 11.70, 11.83, 11.97, 12.10, 12.28, 12.47, 12.65, 12.83, 13.02, 13.20, 13.45, 13.70, 13.95, 14.20, 14.45, 14.70],
  "75": [3.80, 4.60, 5.40, 6.20, 7.00, 7.50, 8.00, 8.40, 8.80, 9.20, 9.57, 9.93, 10.30, 10.67, 11.03, 11.40, 11.60, 11.80, 12.00, 12.20, 12.40, 12.60, 12.80, 13.00, 13.20, 13.40, 13.60, 13.80, 14.00, 14.20, 14.40, 14.63, 14.87, 15.10, 15.33, 15.57, 15.80],
  "90": [3.90, 4.80, 5.70, 6.60, 7.50, 8.00, 8.50, 8.93, 9.37, 9.80, 10.20, 10.60, 11.00, 11.43, 11.87, 12.30, 12.50, 12.70, 12.90, 13.17, 13.43, 13.70, 13.93, 14.17, 14.40, 14.57, 14.73, 14.90, 15.07, 15.23, 15.40, 15.63, 15.87, 16.10, 16.33, 16.57, 16.80],
  "97": [3.90, 5.00, 6.10, 7.10, 7.90, 8.50, 9.10, 9.53, 9.97, 10.40, 10.83, 11.27, 11.70, 12.17, 12.63, 13.10, 13.40, 13.70, 14.00, 14.27, 14.53, 14.80, 15.07, 15.33, 15.60, 15.77, 15.93, 16.10, 16.27, 16.43, 16.60, 16.80, 17.00, 17.20, 17.40, 17.60, 17.80],
};

const CENTILES_PL_WEIGHT_BOYS = {
  "3": [2.80, 3.70, 4.60, 5.30, 5.90, 6.40, 6.80, 7.13, 7.47, 7.80, 8.07, 8.33, 8.60, 8.80, 9.00, 9.20, 9.37, 9.53, 9.70, 9.83, 9.97, 10.10, 10.27, 10.43, 10.60, 10.73, 10.87, 11.00, 11.13, 11.27, 11.40, 11.57, 11.73, 11.90, 12.07, 12.23, 12.40],
  "10": [3.20, 4.00, 4.80, 5.60, 6.20, 6.80, 7.20, 7.57, 7.93, 8.30, 8.53, 8.77, 9.00, 9.23, 9.47, 9.70, 9.90, 10.10, 10.30, 10.47, 10.63, 10.80, 10.97, 11.13, 11.30, 11.47, 11.63, 11.80, 11.97, 12.13, 12.30, 12.45, 12.60, 12.75, 12.90, 13.05, 13.20],
  "25": [3.50, 4.30, 5.10, 6.00, 6.70, 7.20, 7.70, 8.03, 8.37, 8.70, 8.97, 9.23, 9.50, 9.73, 9.97, 10.20, 10.43, 10.67, 10.90, 11.13, 11.37, 11.60, 11.77, 11.93, 12.10, 12.27, 12.43, 12.60, 12.77, 12.93, 13.10, 13.25, 13.40, 13.55, 13.70, 13.85, 14.00],
  "50": [3.70, 4.60, 5.50, 6.40, 7.20, 7.70, 8.20, 8.57, 8.93, 9.30, 9.60, 9.90, 10.20, 10.43, 10.67, 10.90, 11.17, 11.43, 11.70, 11.97, 12.23, 12.50, 12.67, 12.83, 13.00, 13.18, 13.37, 13.55, 13.73, 13.92, 14.10, 14.23, 14.37, 14.50, 14.63, 14.77, 14.90],
  "75": [4.00, 5.00, 6.00, 7.00, 7.60, 8.30, 8.70, 9.13, 9.57, 10.00, 10.30, 10.60, 10.90, 11.13, 11.37, 11.60, 11.87, 12.13, 12.40, 12.67, 12.93, 13.20, 13.47, 13.73, 14.00, 14.17, 14.33, 14.50, 14.67, 14.83, 15.00, 15.20, 15.40, 15.60, 15.80, 16.00, 16.20],
  "90": [4.10, 5.20, 6.30, 7.30, 8.10, 8.70, 9.20, 9.67, 10.13, 10.60, 10.87, 11.13, 11.40, 11.73, 12.07, 12.40, 12.67, 12.93, 13.20, 13.43, 13.67, 13.90, 14.20, 14.50, 14.80, 14.98, 15.17, 15.35, 15.53, 15.72, 15.90, 16.12, 16.33, 16.55, 16.77, 16.98, 17.20],
  "97": [4.40, 5.50, 6.60, 7.70, 8.60, 9.30, 9.90, 10.40, 10.90, 11.40, 11.80, 12.20, 12.60, 12.87, 13.13, 13.40, 13.70, 14.00, 14.30, 14.57, 14.83, 15.10, 15.33, 15.57, 15.80, 16.00, 16.20, 16.40, 16.60, 16.80, 17.00, 17.25, 17.50, 17.75, 18.00, 18.25, 18.50],
};

// Funkcja zwracająca wartość centyla dla wzrostu (0–36 mies.) na podstawie płci, miesiąca i centyla.
function getPLHeightCentile(sex, m, p) {
  if (typeof m !== 'number' || m < 0 || m > 36) return undefined;
  const dataset = sex === 'M' ? CENTILES_PL_HEIGHT_BOYS : CENTILES_PL_HEIGHT_GIRLS;
  const arr = dataset[String(p)];
  if (!arr) return undefined;
  return arr[Math.round(m)];
}

// Funkcja zwracająca wartość centyla dla masy ciała (0–36 mies.) na podstawie płci, miesiąca i centyla.
function getPLWeightCentile(sex, m, p) {
  if (typeof m !== 'number' || m < 0 || m > 36) return undefined;
  const dataset = sex === 'M' ? CENTILES_PL_WEIGHT_BOYS : CENTILES_PL_WEIGHT_GIRLS;
  const arr = dataset[String(p)];
  if (!arr) return undefined;
  return arr[Math.round(m)];
}

// Uczyńmy zmienne i funkcje globalnie dostępne, aby mogły być używane w innych plikach (np. HTML).
window.CENTILES_PL_HEIGHT_GIRLS = CENTILES_PL_HEIGHT_GIRLS;
window.CENTILES_PL_HEIGHT_BOYS = CENTILES_PL_HEIGHT_BOYS;
window.CENTILES_PL_WEIGHT_GIRLS = CENTILES_PL_WEIGHT_GIRLS;
window.CENTILES_PL_WEIGHT_BOYS = CENTILES_PL_WEIGHT_BOYS;
window.getPLHeightCentile = getPLHeightCentile;
window.getPLWeightCentile = getPLWeightCentile;

/*
 * =====================================================================
 *  Funkcje pomocnicze dla danych Palczewskiej i Niedźwieckiej (0–36 mies.)
 *
 *  Dane w tablicach CENTILES_PL_* zawierają wartości centylowe długości i
 *  masy ciała dla wybranych centyli (3, 10, 25, 50, 75, 90, 97) w każdym
 *  miesiącu życia. Aby móc wykorzystać te dane do obliczania pozycji
 *  dziecka na krzywej centylowej (w formie percentyla) oraz odpowiadającego
 *  z-score (SD), poniżej definiujemy funkcje:
 *    - normInv(p): przybliżenie odwrotnej dystrybuanty normalnej. Pozwala
 *      przekształcić percentyl na z‑score dla standardowego rozkładu normalnego.
 *    - calcPercentileStatsPL(value, sex, ageYears, param): zwraca obiekt
 *      {percentile, sd} dla danej wartości wagi (param = 'WT') lub
 *      wzrostu (param = 'HT') dla wieku w latach (0–3). Percentyl jest
 *      interpolowany liniowo pomiędzy zdefiniowanymi centylami. Z‑score
 *      obliczamy jako odwrotność dystrybuanty standardowego rozkładu
 *      normalnego.
 *    - bmiPercentileChildPL(bmi, sex, months): oblicza percentyl BMI
 *      przez zbudowanie pomocniczych krzywych BMI na podstawie danych
 *      Palczewskiej. Dla każdego z centyli (3,10,25,50,75,90,97) BMI
 *      obliczamy jako waga_centyl / (wzrost_centyl/100)^2. Percentyl BMI
 *      wyznaczamy liniowo jak wyżej. Zwraca percentyl (0–100) lub null.
 */

// Odwrotna dystrybuanta normalna (aproksymacja metody Moro/Acklama)
function normInv(p) {
  // Zabezpieczenie przed wartościami spoza [0,1]
  if (typeof p !== 'number' || isNaN(p)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Stałe dla aproksymacji Acklama
  const a1 = -39.6968302866538, a2 = 220.946098424521,
        a3 = -275.928510446969, a4 = 138.357751867269,
        a5 = -30.6647980661472, a6 = 2.50662827745924;
  const b1 = -54.4760987982241, b2 = 161.585836858041,
        b3 = -155.698979859887, b4 = 66.8013118877197,
        b5 = -13.2806815528857;
  const c1 = -0.00778489400243029, c2 = -0.322396458041136,
        c3 = -2.40075827716184, c4 = -2.54973253934373,
        c5 =  4.37466414146497, c6 =  2.93816398269878;
  const d1 =  0.00778469570904146, d2 =  0.32246712907004,
        d3 =  2.445134137143,    d4 =  3.75440866190742;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
           ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
            ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
         (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
}

// Oblicz percentyl i z‑score dla danych Palczewskiej (masa lub wzrost)
function calcPercentileStatsPL(value, sex, ageYears, param) {
  const ageMonths = Math.round(ageYears * 12);
  if (ageMonths < 0 || ageMonths > 36) return null;
  // Zdefiniowane centyle
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const pairs = [];
  for (const c of centiles) {
    let v;
    if (param === 'WT') {
      v = getPLWeightCentile(sex, ageMonths, c);
    } else {
      v = getPLHeightCentile(sex, ageMonths, c);
    }
    if (typeof v === 'number') {
      pairs.push({ centile: c, value: v });
    }
  }
  if (!pairs.length) return null;
  // Sortuj rosnąco po wartości
  pairs.sort((a, b) => a.value - b.value);
  let percentile;
  // Dla wartości poniżej najniższego centyla – ekstrapolacja liniowa do 0
  if (value <= pairs[0].value) {
    const first = pairs[0];
    // p = (value / v1) * c1, ale ogranicz do [0, first.centile]
    percentile = (value / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (value >= pairs[pairs.length - 1].value) {
    // Powyżej najwyższego centyla – ekstrapolacja liniowa do 100
    const last = pairs[pairs.length - 1];
    const prev = pairs[pairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (value - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    // Między dwoma sąsiadującymi centylami – interpolacja liniowa
    let lower = pairs[0], upper = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
      if (value >= pairs[i].value && value <= pairs[i + 1].value) {
        lower = pairs[i];
        upper = pairs[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  /*
   * Zamiast bezpośrednio przekształcać percentyl na z‑score za pomocą
   * normInv(percentile/100) – co dla procentyli 0 i 100 dawało ±∞ –
   * obliczamy z‑score poprzez interpolację liniową (i ekstrapolację)
   * pomiędzy z‑score odpowiadającymi zdefiniowanym centylom w
   * palczewskiej siatce (3,10,25,50,75,90,97).  Każdemu centylowi
   * przypisujemy z‑score `normInv(c/100)`.  Następnie dla wartości
   * `value` wyznaczamy z‑score `z` na podstawie pozycji `value`
   * pomiędzy sąsiadującymi centylami (lub poza zakresem – wtedy
   * stosujemy liniową ekstrapolację z ostatnich dwóch punktów).  W ten
   * sposób z‑score rośnie (lub maleje) w miarę oddalania się od
   * ostatniego zdefiniowanego centyla, zamiast natychmiast przechodzić
   * w nieskończoność.  Na końcu przeliczamy z‑score z powrotem na
   * percentyl przy użyciu dystrybuanty normalnej (normalCDF), co
   * zapewnia wynik procentowy w przedziale 0–100.  Zwracamy zarówno
   * wyliczony percentyl, jak i z‑score.
   */
  // Przygotuj tablicę z parami (wartość, z‑score) dla zdefiniowanych centyli
  const pairsZ = [];
  for (const c of pairs.map(p => p.centile)) {
    // Znajdź odpowiadającą wartość dla centyla c
    const v = pairs.find(p => p.centile === c).value;
    const zc = normInv(c / 100);
    pairsZ.push({ centile: c, value: v, z: zc });
  }
  // Posortuj po wartości (powinno być już posortowane, ale upewniamy się)
  pairsZ.sort((a, b) => a.value - b.value);
  let z;
  if (value <= pairsZ[0].value) {
    // liniowa ekstrapolacja poniżej najniższego centyla
    const first = pairsZ[0];
    const next  = pairsZ[1];
    const slopeZ = (next.z - first.z) / (next.value - first.value);
    z = first.z + (value - first.value) * slopeZ;
  } else if (value >= pairsZ[pairsZ.length - 1].value) {
    // liniowa ekstrapolacja powyżej najwyższego centyla
    const last = pairsZ[pairsZ.length - 1];
    const prev = pairsZ[pairsZ.length - 2];
    const slopeZ = (last.z - prev.z) / (last.value - prev.value);
    z = last.z + (value - last.value) * slopeZ;
  } else {
    // interpolacja liniowa pomiędzy sąsiadującymi centylami
    let lower = pairsZ[0], upper = pairsZ[1];
    for (let i = 0; i < pairsZ.length - 1; i++) {
      if (value >= pairsZ[i].value && value <= pairsZ[i + 1].value) {
        lower = pairsZ[i];
        upper = pairsZ[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    z = lower.z + fraction * (upper.z - lower.z);
  }
  // Oblicz percentyl na podstawie z‑score i dystrybuanty normalnej
  const percentileCalc = normalCDF(z) * 100;
  // Upewnij się, że percentyl mieści się w przedziale 0–100
  const percClamped = Math.max(0, Math.min(100, percentileCalc));
  return { percentile: percClamped, sd: z };
}

// Oblicz percentyl BMI na podstawie danych Palczewskiej
function bmiPercentileChildPL(bmi, sex, months) {
  const m = Math.round(months);
  if (m < 0 || m > 36) return null;
  // Zdefiniowane centyle
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const bmiPairs = [];
  for (const c of centiles) {
    const w = getPLWeightCentile(sex, m, c);
    const h = getPLHeightCentile(sex, m, c);
    if (typeof w === 'number' && typeof h === 'number' && h > 0) {
      const bmiVal = w / Math.pow(h / 100, 2);
      bmiPairs.push({ centile: c, value: bmiVal });
    }
  }
  if (!bmiPairs.length) return null;
  // Sortuj według wartości BMI
  bmiPairs.sort((a, b) => a.value - b.value);
  let percentile;
  if (bmi <= bmiPairs[0].value) {
    const first = bmiPairs[0];
    percentile = (bmi / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (bmi >= bmiPairs[bmiPairs.length - 1].value) {
    const last = bmiPairs[bmiPairs.length - 1];
    const prev = bmiPairs[bmiPairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (bmi - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    let lower = bmiPairs[0], upper = bmiPairs[1];
    for (let i = 0; i < bmiPairs.length - 1; i++) {
      if (bmi >= bmiPairs[i].value && bmi <= bmiPairs[i + 1].value) {
        lower = bmiPairs[i];
        upper = bmiPairs[i + 1];
        break;
      }
    }
    const fraction = (bmi - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  return percentile;
}

/*
 * --------------------------------------------------------------
 *  Rozszerzone funkcje dla danych Palczewskiej (0–18 lat)
 *  Poniższe funkcje korzystają z globalnego obiektu `centileData`,
 *  który jest wczytywany z pliku centile_data.js. Dane obejmują
 *  centyle dla masy, wzrostu i BMI w wieku od 1 miesiąca do 18,5 lat.
 *  Wartości są interpolowane liniowo pomiędzy sąsiadującymi punktami.
 *
 *  - getPalCentile(sex, months, centile, param): pobiera wartość dla
 *    podanego centyla (3,10,25,50,75,90,97), płci (M/F), wieku w
 *    miesiącach i parametru ('WT' – waga, 'HT' – wzrost, 'BMI').
 *  - calcPercentileStatsPal(value, sex, ageYears, param): oblicza
 *    percentyl i z‑score dla dowolnej wartości (masa, wzrost lub BMI)
 *    bazując na rozszerzonych danych Palczewskiej.
 *  - bmiPercentileChildPal(bmi, sex, months): wyznacza percentyl BMI
 *    przy użyciu tabel centylowych BMI Palczewskiej.
 */

// Pobierz interpolowaną wartość centylową z danych Palczewskiej
function getPalCentile(sex, months, centile, param) {
  if (typeof centileData === 'undefined') return null;
  const sexKey = (sex === 'M') ? 'boys' : 'girls';
  const dataKey = (param === 'WT') ? 'weight' : (param === 'HT') ? 'height' : 'bmi';
  const arr = centileData[sexKey] && centileData[sexKey][dataKey];
  if (!arr || !arr.length) return null;
  const m = Math.round(months);
  // jeżeli poza zakresem – użyj wartości skrajnych
  if (m <= arr[0].months) {
    const val = arr[0]['p' + centile];
    return (typeof val === 'number') ? val : null;
  }
  const last = arr[arr.length - 1];
  if (m >= last.months) {
    const val = last['p' + centile];
    return (typeof val === 'number') ? val : null;
  }
  // znajdź sąsiednie wiersze do interpolacji
  let lower = arr[0], upper = arr[0];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (m >= a.months && m <= b.months) {
      lower = a;
      upper = b;
      break;
    }
  }
  const lowVal = lower['p' + centile];
  const upVal  = upper['p' + centile];
  if (typeof lowVal !== 'number' || typeof upVal !== 'number') {
    return null;
  }
  const t = (m - lower.months) / (upper.months - lower.months);
  return lowVal + t * (upVal - lowVal);
}

// Oblicz percentyl i z‑score dla wartości wagi, wzrostu lub BMI w oparciu o dane Palczewskiej (0–18 l.)
function calcPercentileStatsPal(value, sex, ageYears, param) {
  const months = Math.round(ageYears * 12);
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const pairs = [];
  for (const c of centiles) {
    const v = getPalCentile(sex, months, c, param);
    if (typeof v === 'number') {
      pairs.push({ centile: c, value: v });
    }
  }
  if (!pairs.length) return null;
  // sortuj według wartości
  pairs.sort((a, b) => a.value - b.value);
  let percentile;
  if (value <= pairs[0].value) {
    const first = pairs[0];
    percentile = (value / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (value >= pairs[pairs.length - 1].value) {
    const last = pairs[pairs.length - 1];
    const prev = pairs[pairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (value - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    let lower = pairs[0], upper = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
      if (value >= pairs[i].value && value <= pairs[i + 1].value) {
        lower = pairs[i];
        upper = pairs[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  // oblicz z-score poprzez interpolację z-score zdefiniowanych centyli
  const pairsZ = [];
  for (const pObj of pairs) {
    const zc = normInv(pObj.centile / 100);
    pairsZ.push({ value: pObj.value, z: zc });
  }
  pairsZ.sort((a, b) => a.value - b.value);
  let z;
  if (value <= pairsZ[0].value) {
    const first = pairsZ[0];
    const next  = pairsZ[1];
    const slopeZ = (next.z - first.z) / (next.value - first.value);
    z = first.z + (value - first.value) * slopeZ;
  } else if (value >= pairsZ[pairsZ.length - 1].value) {
    const lastP = pairsZ[pairsZ.length - 1];
    const prev  = pairsZ[pairsZ.length - 2];
    const slopeZ = (lastP.z - prev.z) / (lastP.value - prev.value);
    z = lastP.z + (value - lastP.value) * slopeZ;
  } else {
    let lower = pairsZ[0], upper = pairsZ[1];
    for (let i = 0; i < pairsZ.length - 1; i++) {
      if (value >= pairsZ[i].value && value <= pairsZ[i + 1].value) {
        lower = pairsZ[i];
        upper = pairsZ[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    z = lower.z + fraction * (upper.z - lower.z);
  }
  const percentileCalc = normalCDF(z) * 100;
  const percClamped   = Math.max(0, Math.min(100, percentileCalc));
  return { percentile: percClamped, sd: z };
}

// Oblicz percentyl BMI na podstawie rozszerzonych danych Palczewskiej
function bmiPercentileChildPal(bmi, sex, months) {
  const m = Math.round(months);
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const pairs = [];
  for (const c of centiles) {
    const v = getPalCentile(sex, m, c, 'BMI');
    if (typeof v === 'number') {
      pairs.push({ centile: c, value: v });
    }
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => a.value - b.value);
  let percentile;
  if (bmi <= pairs[0].value) {
    const first = pairs[0];
    percentile = (bmi / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (bmi >= pairs[pairs.length - 1].value) {
    const last = pairs[pairs.length - 1];
    const prev = pairs[pairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (bmi - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    let lower = pairs[0], upper = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
      if (bmi >= pairs[i].value && bmi <= pairs[i + 1].value) {
        lower = pairs[i];
        upper = pairs[i + 1];
        break;
      }
    }
    const fraction = (bmi - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  return percentile;
}

/*
 * Funkcja repositionDoctor() odpowiada za dynamiczne przenoszenie sekcji
 * przejścia do modułu lekarskiego (doctorWrapper) między oryginalnym
 * kontenerem w kolumnie formularza a dedykowanym kontenerem pod
 * komunikatem błędu w widoku jednokolumnowym. Jeżeli okno jest wąskie
 * (mniej niż 700 px), wówczas element jest przenoszony pod pola
 * obowiązkowe i wyświetlany z większym odstępem podczas oczekiwania na
 * dane (3 rem) lub z mniejszym odstępem, gdy wyniki są już wyświetlane
 * (1 rem). W trybie kompaktowym zmniejszamy także rozmiary czcionek
 * oraz samego checkboxa o 0,25 rem.
 */
function repositionDoctor() {
  const doctorWrapper = document.getElementById('doctorWrapper');
  const doctorContainer = document.getElementById('doctorContainer');
  const doctorMobileContainer = document.getElementById('doctorMobileContainer');
  const doctorBottomContainer = document.getElementById('doctorBottom');
  const pwzContainer = document.getElementById('pwzContainer');
  const prevSummaryWrap = document.getElementById('prevSummaryWrap');
  const resultsDiv = document.getElementById('results');
  const errorBox = document.getElementById('errorBox');
  const isDoctorCb = document.getElementById('isDoctor');
  if (!doctorWrapper || !doctorContainer || !doctorMobileContainer) return;

  // Jeżeli przewinięcie do wyników jest oczekiwane, ale sekcja modułu lekarza
  // została już przeniesiona (co może wpływać na pozycję kart wyników),
  // pozostawiamy obsługę przewijania funkcji repositionMetabolicSummary,
  // która zostanie wywołana jako kolejna.  Nie zerujemy flagi tutaj, aby
  // umożliwić przesunięcie po kompletnym repozycjonowaniu układu.
  // Determine whether we should show compact version
  const isMobile = window.innerWidth < 700;
  const resultsVisible = resultsDiv && resultsDiv.style && resultsDiv.style.display !== 'none';
  const isDoctor = isDoctorCb && isDoctorCb.checked;

  if (isMobile) {
    // Show the mobile container
    doctorMobileContainer.style.display = 'flex';
    doctorMobileContainer.style.justifyContent = 'center';
    doctorMobileContainer.style.alignItems = 'center';
    // Układ pionowy: umieszczamy elementy jeden pod drugim
    doctorMobileContainer.style.flexDirection = 'column';
    // Move wrapper into mobile container if not already there
    if (doctorWrapper.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(doctorWrapper);
    }
    // Jeśli istnieje kontener z polem na numer PWZ, przenieś go pod sekcję
    // przełącznika w widoku mobilnym, aby pole pojawiało się bezpośrednio
    // pod przyciskiem „Przejdź do modułu lekarskiego”.
    if (pwzContainer && pwzContainer.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(pwzContainer);
    }
    // Przenieś podsumowanie pomiarów poniżej sekcji modułu lekarskiego w mobilnym układzie
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorMobileContainer) {
      if (pwzContainer && pwzContainer.parentElement === doctorMobileContainer) {
        doctorMobileContainer.insertBefore(prevSummaryWrap, pwzContainer);
      } else {
        doctorMobileContainer.appendChild(prevSummaryWrap);
      }
    }
    // Ustawienie kolejności: upewnij się, że karta podsumowania jest przed sekcją lekarza w mobilnym układzie
    if (prevSummaryWrap && doctorWrapper && prevSummaryWrap.parentElement === doctorMobileContainer) {
      doctorMobileContainer.insertBefore(prevSummaryWrap, doctorWrapper);
    }
    // Hide original container (to avoid taking up space)
    doctorContainer.style.display = 'none';
    // Ukryj kontener dolny w widoku mobilnym
    if (doctorBottomContainer) {
      doctorBottomContainer.style.display = 'none';
    }
    // Apply spacing and sizing
    if (!resultsVisible) {
      // waiting for data – larger gap and normal size
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // results visible – smaller gap; shrink size only if użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  } else {
    // Large screens: przenieś sekcję modułu lekarskiego do kontenera dolnego
    // oraz pozostaw podsumowanie pomiarów w oryginalnym kontenerze.
    if (doctorBottomContainer) {
      // Pokaż i wyśrodkuj dolny kontener
      doctorBottomContainer.style.display = 'flex';
      doctorBottomContainer.style.justifyContent = 'center';
      doctorBottomContainer.style.alignItems = 'center';
      doctorBottomContainer.style.flexDirection = 'column';
      // Przenieś sekcję lekarza do kontenera dolnego
      if (doctorWrapper.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(doctorWrapper);
      }
      // Przenieś pole PWZ do kontenera dolnego
      if (pwzContainer && pwzContainer.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(pwzContainer);
      }
    }
    // Upewnij się, że podsumowanie pomiarów znajduje się w oryginalnym kontenerze
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorContainer) {
      doctorContainer.appendChild(prevSummaryWrap);
    }
    // W widoku szerokim ukryj kontener mobilny i przywróć widoczność oryginalnego kontenera
    doctorContainer.style.display = '';
    doctorMobileContainer.style.display = 'none';
    // Usuń ustawienie kierunku flex w kontenerze mobilnym w razie ponownego przełączenia
    doctorMobileContainer.style.flexDirection = '';
    // Ustaw marginesy sekcji lekarskiej w zależności od stanu wyników
    if (!resultsVisible) {
      // waiting for data – większa przerwa i pełny rozmiar
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // wyniki widoczne – mniejsza przerwa; zmniejsz rozmiar tylko, gdy użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  }

  // Po zakończeniu zmiany położenia sekcji modułu lekarskiego (zarówno w widoku
  // mobilnym, jak i desktopowym), ponownie wyrównaj szerokości przycisków
  // testów. Użycie requestAnimationFrame gwarantuje, że pomiar zostanie
  // wykonany po zakończeniu reflow.
  if (typeof adjustTestButtonWidths === 'function') {
    requestAnimationFrame(() => adjustTestButtonWidths());
  }
}

/*
 * Funkcja repositionMetabolicSummary() odpowiada za dynamiczne przenoszenie
 * przycisku podsumowania wyników pomiędzy kolumnami w zależności od szerokości
 * okna. W układzie jednokolumnowym (np. szerokość < 700 px) przycisk
 * "Podsumowanie wyników – kliknij i skopiuj" ma znajdować się przed kartą
 * "Centyle, BMI & Basal Metabolic Rate" w lewej kolumnie. Na większych
 * ekranach przycisk pozostaje w prawej kolumnie (normWrapper) za kartą WFL.
 */
function repositionMetabolicSummary() {
  const section = document.getElementById('metabolicSummarySection');
  const leftColumn = document.getElementById('leftColumnWrap');
  const normWrapper = document.getElementById('normWrapper');
  const bmiCard = document.getElementById('bmiCard');
  const wflCard = document.getElementById('wflCard');
  if (!section || !leftColumn || !normWrapper) return;
  const isMobile = window.innerWidth < 700;
  if (isMobile) {
    // W widoku mobilnym przenieś sekcję nad kartę BMI
    // Jeśli nie znajduje się już w lewej kolumnie, dodaj ją tam
    if (section.parentElement !== leftColumn) {
      leftColumn.insertBefore(section, leftColumn.firstChild);
    }
    // Upewnij się, że sekcja znajduje się bezpośrednio przed kartą BMI
    if (bmiCard && section.nextSibling !== bmiCard) {
      leftColumn.insertBefore(section, bmiCard);
    }
  } else {
    // W widoku szerokim przywróć sekcję do prawej kolumny (normWrapper)
    if (section.parentElement !== normWrapper) {
      // Jeśli istnieje karta WFL w normWrapper, umieść przycisk bezpośrednio za nią.
      if (wflCard && wflCard.parentElement === normWrapper) {
        // insertAfter: w JS insertBefore z nextSibling
        normWrapper.insertBefore(section, wflCard.nextSibling);
      } else {
        normWrapper.insertBefore(section, normWrapper.firstChild);
      }
    } else {
      // Upewnij się, że sekcja jest za kartą WFL, jeśli WFL jest widoczna
      if (wflCard && wflCard.parentElement === normWrapper) {
        const expectedPos = wflCard.nextSibling;
        if (expectedPos !== section) {
          normWrapper.insertBefore(section, expectedPos);
        }
      }
    }
  }

  // Po zakończeniu repozycjonowania, jeżeli oczekuje przewinięcia do
  // wyników, wykonaj je teraz.  Sprawdzamy także, czy element wyników
  // jest widoczny (display: grid) – w przeciwnym razie przewijanie nie
  // zostanie wywołane.  Po przewinięciu zerujemy flagę, aby uniknąć
  // kolejnych przewinięć przy przyszłych zmianach układu.
  try {
    // Jeżeli flaga przewijania jest ustawiona, zaplanuj płynne przewinięcie
    // do karty wyników w następnym cyklu animacji.  Użycie
    // requestAnimationFrame zapewnia, że DOM został już przebudowany i
    // elementy znajdują się na właściwych pozycjach, co pozwala na poprawne
    // obliczenie współrzędnych.  Po wykonaniu przewinięcia resetujemy flagę.
    if (pendingResultsScroll) {
      requestAnimationFrame(() => {
        try {
          scrollToResultsCard();
        } catch (e) {
          /* ignoruj błędy przewijania */
        } finally {
          pendingResultsScroll = false;
        }
      });
    }
  } catch (e) {
    // ignorujemy błędy zewnętrzne, ale resetujemy flagę, by zapobiec
    // nieskończonemu oczekiwaniu na przewinięcie przy kolejnych zmianach
    pendingResultsScroll = false;
  }
}

/**
 * Smoothly scrolls the first results card (BMI card) into view.  This function
 * is called after the user enters all required input data (wiek, waga, wzrost)
 * and the results have been generated.  It centres the BMI card in the viewport
 * so that users can immediately see their calculations.  If the BMI card
 * element is not found, the function quietly does nothing.
 */
function scrollToResultsCard() {
  // Nie wykonuj przewijania, jeśli funkcja została wyłączona po wczytaniu danych.
  if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) {
    return;
  }
  // Jeśli użytkownik edytuje aktualnie pole wieku w miesiącach (#ageMonths),
  // wstrzymaj przewijanie.  Kursor miga w tym polu podczas wprowadzania danych,
  // więc przewijanie mogłoby przerwać edycję.  Scroll zostanie wykonany dopiero
  // po zakończeniu edycji (blur lub Enter).
  if (typeof editingAgeMonths !== 'undefined' && editingAgeMonths) {
    return;
  }

  // Jeżeli ustawiono licznik skipAutoScrollCounter na wartość dodatnią,
  // pomijamy aktualne przewijanie i dekrementujemy licznik.  Zapobiega
  // to automatycznemu przewijaniu po edycji pól, które nie powinny
  // wywoływać zmiany widoku (np. obwód talii/bioder, listy przekąsek/dań,
  // karta planu odchudzania).  Zastosowanie licznika pozwala na
  // pominięcie kilku następujących po sobie prób przewinięcia.
  if (typeof skipAutoScrollCounter !== 'undefined' && skipAutoScrollCounter > 0) {
    skipAutoScrollCounter--;
    return;
  }
  /**
   * Płynnie przewija stronę tak, aby górna krawędź pierwszej karty z wynikami
   * (BMI card) wyrównała się z górną krawędzią okna przeglądarki.  Przewijanie
   * jest wolniejsze niż domyślne zachowanie scrollIntoView, dzięki czemu
   * użytkownik może komfortowo śledzić ruch strony.  Jeżeli użytkownik nadal
   * edytuje któreś z pól wieku, wagi lub wzrostu (kursor miga w polu), funkcja
   * nie wykonuje przewijania, aby nie przerywać wprowadzania danych.
   */
  const bmiCard     = document.getElementById('bmiCard');
  const ageInput    = document.getElementById('age');
  const weightInput = document.getElementById('weight');
  const heightInput = document.getElementById('height');
  const resultsEl   = document.getElementById('results');
  if (!bmiCard || !ageInput || !weightInput || !heightInput || !resultsEl) {
    return;
  }
  // Sprawdź, czy wszystkie wymagane pola są wypełnione liczbami dodatnimi
  const ageVal    = parseFloat(ageInput.value)    || 0;
  const weightVal = parseFloat(weightInput.value) || 0;
  const heightVal = parseFloat(heightInput.value) || 0;
  if (!(ageVal > 0 && weightVal > 0 && heightVal > 0)) {
    return;
  }
  // Nie zwracamy jeszcze, gdy użytkownik edytuje jedno z pól.  
  // Płynne przewijanie zostanie zaplanowane poniżej, a ostateczna
  // kontrola aktywnego pola zostanie wykonana tuż przed rozpoczęciem
  // przewijania (w środku setTimeout).  Dzięki temu unikamy sytuacji,
  // w której scroll nie byłby w ogóle zaplanowany, jeśli funkcja
  // scrollToResultsCard została wywołana w trakcie wpisywania danych.
  // Funkcja pomocnicza jest zdefiniowana globalnie jako smoothScrollToElement,
  // dlatego nie definiujemy jej ponownie wewnątrz scrollToResultsCard.
  // Zamiast tego, skorzystamy z globalnej funkcji smoothScrollToElement,
  // która przyjmuje element docelowy oraz czas trwania animacji.
  // Używamy niewielkiego opóźnienia, aby mieć pewność, że elementy zostały
  // w pełni wyrenderowane i przelokowane (funkcje reposition* mogły zmienić layout).
  setTimeout(() => {
    // Ponowne sprawdzenie aktywnego elementu tuż przed przewijaniem
    const currentActive = document.activeElement;
    if (currentActive === ageInput || currentActive === weightInput || currentActive === heightInput) {
      return;
    }
    // Nie przewijaj, jeśli kursor znajduje się w którymkolwiek z wyłączonych pól.
    // Oprócz pól wieku/wagi/wzrostu pomijamy także pola obwodu talii i bioder,
    // pola w sekcji przekąsek/dania oraz wszystkie pola planu odchudzania.
    if (currentActive && (currentActive.id === 'waistCm' || currentActive.id === 'hipCm')) {
      return;
    }
    // Sprawdź, czy aktywny element znajduje się wewnątrz przekąsek, dań obiadowych lub planu odchudzania
    if (currentActive && typeof currentActive.closest === 'function') {
      if (currentActive.closest('#snackList') || currentActive.closest('#mealList') || currentActive.closest('#planCard')) {
        return;
      }
    }
    // Ponowne sprawdzenie widoczności rezultatów
    if (resultsEl.style.display === 'none') {
      return;
    }
      // Wybieramy dłuższy czas trwania przewijania (ok. 2,5 s), aby przewijanie
      // było bardzo płynne i wolne.  Używamy globalnej funkcji smoothScrollToElement,
      // która przewija okno tak, aby górna krawędź elementu zrównała się z
      // górną krawędzią viewportu.  Dodatkowy easing w funkcji pozwala
      // uzyskać łagodniejsze przyspieszenie i wyhamowanie.  Czas trwania (2500 ms)
      // można zmienić, by uzyskać szybszą lub wolniejszą animację.
      smoothScrollToElement(bmiCard, 2000);
  }, 300);
}

// Upewnij się, że funkcja scrollToResultsCard jest dostępna globalnie.
// W niektórych miejscach kodu (np. obsługa zdarzeń blur) funkcja jest
// wywoływana z przestrzeni globalnej, dlatego przypisujemy ją do
// obiektu window, jeśli jest dostępny.
if (typeof window !== 'undefined') {
  window.scrollToResultsCard = scrollToResultsCard;
}

// Flag indicating whether a scroll to the results card is pending.  This flag
// is set in update() whenever all required fields (wiek, waga, wzrost) are
// filled and results become visible.  Reposition functions will detect this
// flag and trigger the smooth scroll after layout changes, ensuring that
// the results card is centred in the viewport after any dynamic DOM moves.
let pendingResultsScroll = false;

// Global flag to disable automatic scrolling after user loads previously saved data.
// When set to true, auto scrolling will be completely turned off for the rest
// of the session.  This prevents the page from jumping when navigating
// between results using loaded data.  It is toggled in applyLoadedData().
let autoScrollDisabled = false;

// Licznik, który dezaktywuje automatyczne przewijanie po interakcji z
// określonymi polami (obwód talii, obwód bioder, listy przekąsek/dań,
// karta planu odchudzania).  Ustawienie wartości dodatniej powoduje,
// że kolejne wywołania scrollToResultsCard() zostaną pominięte, a
// licznik będzie dekrementowany.  Pozwala to ignorować więcej niż
// jedno wywołanie scrollowania, jeśli po zmianie danych nastąpi
// sekwencja kilku wywołań (np. z update() i repositionDoctor()).
let skipAutoScrollCounter = 0;

// === Wyłącz autoscroll dla kart „Przekąski” i „Dania obiadowe” ===
// Interakcje w sekcjach przekąsek i dań obiadowych (kliknięcia, zmiany selektora,
// edycja liczby porcji czy usuwanie wierszy) nie powinny powodować automatycznego
// przewijania do karty z wynikami.  Aby to osiągnąć, zwiększamy licznik
// skipAutoScrollCounter przy każdym zdarzeniu w tych sekcjach.  Licznik jest
// dekrementowany w scrollToResultsCard() przy każdym wywołaniu, dzięki czemu
// pomijamy kolejne próby przewinięcia po zmianie danych w tych kartach.
if (typeof document !== 'undefined') {
  function initDisableAutoScrollForFoodLists() {
    try {
      // Funkcja, która ustawia licznik pomijania autoscrolla na wartość dodatnią.
      const disableScroll = () => {
        // Przypisz co najmniej 3, aby zignorować kilka następujących po sobie wywołań.
        skipAutoScrollCounter = 3;
      };
      // Pomocnicza funkcja podpinająca obsługę zdarzeń do elementu
      const attach = (el) => {
        if (!el) return;
        ['click','change','input'].forEach(evt => {
          el.addEventListener(evt, disableScroll, true);
        });
      };
      // Pobierz kontenery list przekąsek i dań
      const snackListEl = document.getElementById('snackList');
      const mealListEl  = document.getElementById('mealList');
      // Nasłuchuj zdarzeń na listach wierszy (select, input, × usuń)
      attach(snackListEl);
      attach(mealListEl);
      // Dodatkowo nasłuchuj kliknięcia przycisków „+ dodaj…”, które znajdują się
      // w obrębie fieldsetów, ale poza divami list.  Bez tego kliknięcie
      // przycisku dodawania mogłoby wywołać update() i autoscroll.
      if (snackListEl && snackListEl.parentElement) {
        snackListEl.parentElement.addEventListener('click', (e) => {
          const target = e.target;
          if (target && target.classList && target.classList.contains('add-row')) {
            disableScroll();
          }
        }, true);
      }
      if (mealListEl && mealListEl.parentElement) {
        mealListEl.parentElement.addEventListener('click', (e) => {
          const target = e.target;
          if (target && target.classList && target.classList.contains('add-row')) {
            disableScroll();
          }
        }, true);
      }
    } catch (_) {
      /* ignoruj błędy inicjalizacji wyłączania autoscrolla */
    }
  }
  // Zainicjuj obsługę po załadowaniu DOM – podobnie jak w innych sekcjach.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDisableAutoScrollForFoodLists);
  } else {
    initDisableAutoScrollForFoodLists();
  }
}
// Flaga sygnalizująca, że użytkownik edytuje pole miesięcy (#ageMonths).
// Gdy jest ustawiona na true, automatyczne przewijanie inicjowane przez
// update() jest tymczasowo pomijane.  Wartość ta jest ustawiana na true
// podczas fokusu w polu miesięcy i resetowana na false po zakończeniu
// edycji (np. na blur lub wciśnięciu Enter).  Dzięki temu scrollowanie
// nie zostanie wykonane, dopóki użytkownik nie zatwierdzi zmian.
let editingAgeMonths = false;

/* -----------------------------------------------------------------------
 * Inicjalizacja obsługi pola wieku w miesiącach (#ageMonths)
 *
 * To pole powinno przyjmować wyłącznie wartości z zakresu 1–11.  Podczas
 * edycji (kiedy kursor znajduje się w polu) aplikacja nie powinna
 * automatycznie przewijać wyników – scrollowanie następuje dopiero po
 * zakończeniu edycji (zdarzenie blur) lub po naciśnięciu klawisza Enter.
 * W tym celu używamy globalnej flagi editingAgeMonths.  Funkcja
 * scrollToResultsCard() sprawdza tę flagę i wstrzymuje przewijanie,
 * jeśli użytkownik wprowadza właśnie liczbę w polu miesięcy.  Po
 * zatwierdzeniu wpisu przewijamy wyniki, o ile dane są kompletne.
 */
if (typeof document !== 'undefined') {
  function initScrollOnAgeMonths(){
    try {
      const monthsEl = document.getElementById('ageMonths');
      if (!monthsEl) return;
      // Funkcja obsługująca zakończenie edycji (blur lub Enter)
      const finalizeEdit = function(e){
        // Reagujemy tylko na blur lub na naciśnięcie klawisza Enter
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
        // Jeśli to zdarzenie keydown, powstrzymaj domyślną obsługę Enter w polu number,
        // aby nie doszło do wysyłki formularza lub podwójnego przewinięcia.
        if (e.type === 'keydown') {
          e.preventDefault();
        }
        // Oznacz zakończenie edycji
        editingAgeMonths = false;
        // Wyzeruj licznik scrollowania
        skipAutoScrollCounter = 0;
        // Niezależnie od tego, czy pole jest puste czy zawiera wartość (1–11),
        // chcemy przewinąć wyniki, pod warunkiem że wszystkie wymagane pola są wypełnione.
        setTimeout(() => {
          try {
            const ageVal    = parseFloat(document.getElementById('age')?.value)    || 0;
            const weightVal = parseFloat(document.getElementById('weight')?.value) || 0;
            const heightVal = parseFloat(document.getElementById('height')?.value) || 0;
            const resultsEl = document.getElementById('results');
            // Wszystkie trzy pola muszą mieć wartości dodatnie, aby wyniki były widoczne
            if (!(ageVal > 0 && weightVal > 0 && heightVal > 0)) return;
            if (resultsEl && resultsEl.style.display === 'none') return;
            if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
            if (typeof scrollToResultsCard === 'function') {
              scrollToResultsCard();
            }
          } catch (_) {
            /* ignoruj błędy */
          }
        }, 200);
      };
      // Podczas fokusu zaznaczamy, że trwa edycja.  Nie modyfikujemy licznika
      // skipAutoScrollCounter, gdyż scrollowanie będzie blokowane przez
      // warunek w scrollToResultsCard() sprawdzający editingAgeMonths.
      monthsEl.addEventListener('focus', function(){
        editingAgeMonths = true;
      });
      // Podczas każdej zmiany wartości (input) jedynie aktualizujemy
      // wskaźnik editingAgeMonths.  Scrollowanie podczas edycji jest
      // zablokowane przez warunek w scrollToResultsCard(), więc nie
      // manipulujemy licznikiem skipAutoScrollCounter.
      monthsEl.addEventListener('input', function(){
        if (!editingAgeMonths) {
          editingAgeMonths = true;
        }
      });
      // Dodaj obsługę blur i klawisza Enter
      monthsEl.addEventListener('blur', finalizeEdit);
      monthsEl.addEventListener('keydown', finalizeEdit);
      // Uniemożliwiaj wpisywanie niedozwolonych liczb (poza 1–11) – zdarzenie beforeinput
      monthsEl.addEventListener('beforeinput', function(e){
        try {
          const type = e.inputType;
          if (type === 'insertText' || type === 'insertFromPaste' || type === 'insertFromDrop') {
            let insert = '';
            if (typeof e.data === 'string' && e.data !== null) {
              insert = e.data;
            } else if (type === 'insertFromPaste') {
              insert = (e.clipboardData && e.clipboardData.getData('text')) || '';
            }
            // Nie pozwól na znaki inne niż cyfry
            if (!/^[0-9]+$/.test(insert)) {
              e.preventDefault();
              return;
            }
            const currentValue = monthsEl.value;
            const start = monthsEl.selectionStart;
            const end = monthsEl.selectionEnd;
            const newValue = currentValue.slice(0, start) + insert + currentValue.slice(end);
            // Pozwól na wyczyszczenie pola – sprawdzamy tylko wstawianie, więc newValue='' oznacza usuwanie
            if (newValue === '') return;
            // Maksymalnie dwa znaki
            if (newValue.length > 2) {
              e.preventDefault();
              return;
            }
            // Zero na początku jest niedozwolone
            if (/^0/.test(newValue)) {
              e.preventDefault();
              return;
            }
            const n = parseInt(newValue, 10);
            if (isNaN(n) || n < 1 || n > 11) {
              e.preventDefault();
              return;
            }
          }
        } catch (_) {
          // W przypadku błędu nie blokuj wpisu
        }
      });
    } catch (_) {
      /* ignoruj błędy inicjalizacji pola miesięcy */
    }
  }
  // Uruchom inicjalizację po załadowaniu DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollOnAgeMonths);
  } else {
    initScrollOnAgeMonths();
  }

  /**
   * Inicjalizuje obsługę automatycznego przewijania po zakończeniu edycji
   * ostatniego wymaganego pola: wiek (lata), waga (kg) lub wzrost (cm).
   * Jeśli użytkownik wprowadzi wartość do jednego z tych pól i następnie
   * naciśnie Enter lub kliknie poza pole, a pozostałe wymagane pola są
   * już wypełnione, funkcja scrollToResultsCard() zostanie wywołana.
   * Dzięki temu autoscroll działa również po naciśnięciu Enter, nie tylko
   * po opuszczeniu pola myszą/klawiaturą.
   */
  function initAutoScrollOnFinalFields() {
    try {
      const requiredIds = ['age', 'weight', 'height'];
      requiredIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // Funkcja pomocnicza wywołująca scroll po krótkim opóźnieniu,
        // o ile wszystkie wymagane pola są wypełnione. Nie sprawdzamy
        // widoczności wyników – logika w scrollToResultsCard() oraz
        // reposition funkcje zadbają o poprawne przewijanie.
        const handle = function() {
          setTimeout(() => {
            try {
              const ageVal    = parseFloat(document.getElementById('age')?.value)    || 0;
              const weightVal = parseFloat(document.getElementById('weight')?.value) || 0;
              const heightVal = parseFloat(document.getElementById('height')?.value) || 0;
              if (!(ageVal > 0 && weightVal > 0 && heightVal > 0)) return;
              if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
              if (typeof scrollToResultsCard === 'function') {
                scrollToResultsCard();
              }
            } catch (_) {
              /* ignoruj błędy */
            }
          }, 300);
        };
        const finalizeField = function(ev) {
          try {
            // Resetuj licznik, aby nie blokować autoscrolla podczas obsługi końcowych pól
            if (typeof skipAutoScrollCounter !== 'undefined') {
              skipAutoScrollCounter = 0;
            }
            // Jeśli użytkownik wcisnął klawisz Enter (także na klawiaturze numerycznej),
            // traktuj to jak zakończenie edycji: zapobiegaj domyślnej akcji i
            // zabierz fokus z pola.  Zdarzenie blur wywoła handle() i uruchomi autoscroll.
            const key = ev.key;
            if (key === 'Enter' || key === 'NumpadEnter') {
              if (ev.type === 'keydown' || ev.type === 'keypress') {
                ev.preventDefault();
                if (ev.target && typeof ev.target.blur === 'function') {
                  ev.target.blur();
                }
                // Zwróć, aby nie wywoływać handle() wielokrotnie; blur wyzwoli osobne zdarzenie
                return;
              }
              // Dla zdarzeń keyup, blur został już wykonany, więc nie robimy nic.
            }
            // Gdy pole traci fokus z innych powodów (np. kliknięcie poza pole), wywołaj handle()
            if (ev.type === 'blur') {
              handle();
              return;
            }
          } catch (_) {
            /* ignoruj błędy obsługi */
          }
        };
        // Podpinamy do blur, keydown, keyup oraz keypress
        el.addEventListener('blur', finalizeField);
        el.addEventListener('keydown', finalizeField);
        el.addEventListener('keyup', finalizeField);
        el.addEventListener('keypress', finalizeField);
      });
    } catch (_) {
      /* ignoruj błędy inicjalizacji */
    }
  }
  // Zainicjuj obsługę auto scrolla dla końcowych pól po załadowaniu DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoScrollOnFinalFields);
  } else {
    initAutoScrollOnFinalFields();
  }
}

// -----------------------------------------------------------------------------
// Automatyczne wyłączenie autoscrolla przy ponownym otwarciu aplikacji
//
// Jeśli aplikacja została ponownie uruchomiona lub strona została odświeżona,
// a w polach wieku, wagi i wzrostu nadal znajdują się wartości dodatnie
// (czyli użytkownik nie wyczyścił formularza przed zamknięciem), uznajemy, że
// wczytano wcześniej zapisane dane.  W takiej sytuacji autoscroll nie
// powinien się uruchamiać po wczytaniu wyników.  Dodatkowo ukrywamy
// instrukcję „Uzupełnij wymagane pola…", ponieważ w tym miejscu pojawi się
// podsumowanie poprzedniego pomiaru.
if (typeof document !== 'undefined') {
  /**
   * Sprawdza, czy pola wieku, wagi i wzrostu są wypełnione dodatnimi
   * wartościami.  Jeżeli tak, ustawiamy globalną flagę autoScrollDisabled,
   * aby wyłączyć automatyczne przewijanie kart z wynikami w bieżącej sesji.
   * Dodatkowo ukrywamy instrukcję wypełnienia pól (#compareInstruction).
   * Funkcja jest idempotentna: wielokrotne wywołania nie powodują
   * ponownego włączenia autoscrolla, jeśli flaga jest już ustawiona.
   */
  function autoDisableFromStoredData() {
    try {
      // Jeżeli autoscroll jest już wyłączony, nie musimy nic robić.
      if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
      const ageEl = document.getElementById('age');
      const weightEl = document.getElementById('weight');
      const heightEl = document.getElementById('height');
      // Pobierz aktualne wartości wejściowe. Używamy parseFloat() i operatora
      // logicznego OR, aby prawidłowo obsłużyć puste stringi (zwracają NaN).
      const ageVal = ageEl ? parseFloat(ageEl.value) || 0 : 0;
      const weightVal = weightEl ? parseFloat(weightEl.value) || 0 : 0;
      const heightVal = heightEl ? parseFloat(heightEl.value) || 0 : 0;
      // Jeśli wszystkie wymagane pola zawierają wartości dodatnie, traktujemy
      // je jako wczytane z poprzedniej sesji.  W takiej sytuacji wyłączamy
      // autoscroll i ukrywamy instrukcję.
      if (ageVal > 0 && weightVal > 0 && heightVal > 0) {
        try {
          if (typeof window !== 'undefined') {
            window.autoScrollDisabled = true;
          }
          autoScrollDisabled = true;
        } catch (_) {
          /* pomiń błędy */
        }
        const ci = document.getElementById('compareInstruction');
        if (ci && ci.style) {
          ci.style.display = 'none';
        }
      }
    } catch (_) {
      /* ignoruj błędy inicjalizacji autoscrolla */
    }
  }
  // Uruchamiamy sprawdzenie na wczesnym etapie (DOMContentLoaded) oraz ponownie
  // po załadowaniu wszystkich skryptów (zdarzenie load).  Użycie load jest
  // konieczne, ponieważ moduł userData.js wczytuje dane z localStorage
  // dopiero po app.js i może nadpisać wartości pól.  Dzięki temu, jeśli
  // wartości zostaną uzupełnione po initializacji, autoscroll zostanie
  // wyłączony zanim pojawią się wyniki.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoDisableFromStoredData);
  } else {
    // Jeśli DOM jest już gotowy, sprawdź od razu.
    autoDisableFromStoredData();
  }
  // Dodatkowo podłączamy się do zdarzenia load, aby sprawdzić ponownie
  // po załadowaniu wszystkich zasobów (w tym userData.js).
  window.addEventListener('load', function() {
    // Używamy krótkiego opóźnienia, aby upewnić się, że userData.js zdążył
    // wczytać i ustawić wartości z localStorage.
    setTimeout(autoDisableFromStoredData, 0);
  });
}

/*
 * Płynnie przewija stronę na samą górę. Funkcja jest wywoływana przez
 * przycisk przewijania w widoku mobilnym. Używamy try/catch, aby
 * zapewnić kompatybilność ze starszymi przeglądarkami, które mogą
 * nie obsługiwać opcji `behavior: 'smooth'` w metodzie scrollTo().
 */
/**
 * Płynnie przewija stronę na samą górę.
 *
 * W układach mobilnych oraz innych kontekstach, w których przewijanie
 * odbywa się na elemencie innym niż obiekt `window` (np. `document.scrollingElement`),
 * wywołanie `window.scrollTo()` nie będzie miało efektu. Dlatego najpierw
 * ustalamy element odpowiedzialny za przewijanie i na nim wykonujemy
 * przewinięcie. Wspieramy zarówno płynne przewijanie, jak i prosty
 * fallback na starsze przeglądarki.
 */
/**
 * Płynnie przewija stronę lub dowolny przewijalny kontener na samą górę.
 *
 * W praktyce mobilnej (np. w układzie jednokolumnowym) przewijanie często
 * odbywa się na innym elemencie niż `window` czy `document.documentElement`
 * — na przykład na kontenerach z ustawionym `overflow-y: auto`. Poprzednia
 * implementacja zakładała, że `document.scrollingElement` obejmuje główny
 * obszar przewijania, co nie zawsze jest prawdą. Z tego powodu dodajemy
 * logikę, która wyszukuje wszystkie potencjalnie przewijalne elementy w
 * dokumencie i ustawia im scrollTop na 0. Zachowujemy dotychczasowe
 * wywołania `window.scrollTo()` i przewijanie na `scrollTarget`, a nową
 * logikę stosujemy jako uzupełnienie – najpierw próbujemy przewinąć
 * standardowe elementy, a następnie przechodzimy przez inne elementy
 * posiadające przewinięcie.
 */
/**
 * Przewija całą stronę (lub jej główne kontenery) do początku. W poprzedniej
 * implementacji wykonywaliśmy rozbudowane przeszukiwanie drzewa DOM w
 * poszukiwaniu potencjalnie przewijalnych elementów. Okazało się jednak, że
 * takie podejście bywa zawodne w układach mobilnych (jednokolumnowych), w
 * których główny obszar przewijania jest zdefiniowany na konkretnym
 * kontenerze, a nie na dokumencie. Nowsze przeglądarki natywnie obsługują
 * płynne przewijanie, dlatego uprościliśmy logikę tak, aby zawsze
 * resetować scroll na kilku kluczowych elementach: oknie, dokumencie,
 * elementach <html> i <body> oraz głównym kontenerze aplikacji. Dzięki
 * temu niezależnie od sposobu ustawienia overflow w CSS, kliknięcie
 * przycisku "powrót na górę" spowoduje przewinięcie treści na sam początek.
 */
function scrollToTop() {
  try {
    // 1. Spróbuj użyć natywnej funkcji window.scrollTo z obsługą płynnego
    // przewijania. W większości nowoczesnych przeglądarek spowoduje to
    // przewinięcie całej strony.
    if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      } catch (err) {
        // Niektóre starsze przeglądarki nie obsługują obiektu opcji – podajemy
        // więc wartości liczbowe.
        window.scrollTo(0, 0);
      }
    }

    // 2. Ustaw scrollTop na 0 dla dokumentu i elementu <html>. W niektórych
    // mobilnych layoutach te elementy odpowiadają za przewijanie.
    const docEl = document.documentElement;
    if (docEl) {
      docEl.scrollTop = 0;
    }
    const body = document.body;
    if (body) {
      body.scrollTop = 0;
    }

    // 3. Spróbuj przewinąć element wskazany przez document.scrollingElement.
    const scrollingEl = document.scrollingElement;
    if (scrollingEl && typeof scrollingEl.scrollTo === 'function') {
      scrollingEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } else if (scrollingEl) {
      scrollingEl.scrollTop = 0;
    }

    // 4. Jeśli istnieje główny kontener aplikacji (o klasie 'container'),
    // wyzeruj także jego przewinięcie. W układach mobilnych zawartość
    // bywa osadzona w kontenerze z overflow-y: auto, dlatego bez tego
    // zabiegu sama strona pozostawała w niezmienionej pozycji.
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
      try {
        if (typeof mainContainer.scrollTo === 'function') {
          mainContainer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } else {
          mainContainer.scrollTop = 0;
        }
      } catch (ex) {
        mainContainer.scrollTop = 0;
      }
    }
  } catch (e) {
    // Jeśli z jakiegoś powodu któraś z metod rzuci wyjątek, używamy
    // najprostszego możliwego rozwiązania – ustawiamy scrollTop na 0
    // zarówno dla <html>, jak i <body>.
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }
}

// Upewnij się, że funkcja scrollToTop jest dostępna w globalnym obiekcie window.
if (typeof window !== 'undefined') {
  window.scrollToTop = scrollToTop;
}

// Uruchom repositionDoctor przy załadowaniu strony i po każdym
// przeskalowaniu okna. Dzięki temu sekcja modułu lekarskiego będzie
// odpowiednio ustawiona jeszcze przed pierwszym wywołaniem update().
window.addEventListener('DOMContentLoaded', () => {
  if (typeof repositionDoctor === 'function') {
    repositionDoctor();
  }
  if (typeof repositionMetabolicSummary === 'function') {
    repositionMetabolicSummary();
  }
  // Podłącz obsługę kliknięcia przycisku przewijania na górę, jeśli istnieje
  const scrollBtn = document.getElementById('scrollTopBtn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      if (typeof scrollToTop === 'function') {
        scrollToTop();
      }
    });
  }
  // Ukryj przyciski sterujące kartą poprzedniego pomiaru, aby użytkownik nie mógł jej zwijać
  const hideBtn = document.getElementById('hidePrevSummary');
  const toggleBtn = document.getElementById('togglePrevSummary');
  if (hideBtn) hideBtn.style.display = 'none';
  if (toggleBtn) toggleBtn.style.display = 'none';
});
window.addEventListener('resize', () => {
  if (typeof repositionDoctor === 'function') {
    repositionDoctor();
  }
  if (typeof repositionMetabolicSummary === 'function') {
    repositionMetabolicSummary();
  }
  if (typeof updateProfessionalSummaryCard === 'function') {
    updateProfessionalSummaryCard();
  }
});


// ============================================================================
// Dostosowanie szerokości przycisków testów w układzie dwukolumnowym
//
// W układzie dwukolumnowym (szerokość okna ≥ 700 px) przyciski do otwierania
// poszczególnych testów (GH, OGTT/GnRH oraz ACTH/TRH) mogą mieć różne
// szerokości ze względu na różną długość etykiet. Aby zachować estetykę
// interfejsu, wyrównujemy szerokość tych przycisków do szerokości
// najszerszego z nich. W widoku mobilnym (jednokolumnowym) przyciski
// zajmują pełną szerokość kontenera.

/**
 * Oblicza szerokość najszerszego przycisku testu i ustawia taką samą
 * szerokość dla wszystkich przycisków w trybie dwukolumnowym. W trybie
 * jednokolumnowym przyciski zajmują 100 % dostępnej szerokości.
 */
function adjustTestButtonWidths() {
  // Lista identyfikatorów przycisków, dla których chcemy wyrównać szerokość w trybie dwukolumnowym.
  // Oprócz istniejących przycisków testów GH/OGTT/ACTH dodajemy nowe przyciski modułu lekarskiego
  // (Testy w endokrynologii oraz Leczenie hormonem wzrostu / IGF‑1). Dzięki temu wszystkie
  // główne przyciski będą miały jednakową szerokość, co zapewnia spójny wygląd.
  const ids = ['toggleGhTests', 'toggleOgttTests', 'toggleActhTests', 'toggleEndoTests', 'toggleIgfTests', 'toggleAbxTherapy'];
  const isTwoColumn = window.innerWidth >= 700;

  // W trybie jednokolumnowym ustawiamy szerokość wszystkich przycisków
  // na 100%, aby wypełniały całą dostępną przestrzeń.
  if (!isTwoColumn) {
    ids.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.width = '100%';
      }
    });
    return;
  }

  // W trybie dwukolumnowym obliczamy naturalną szerokość każdego przycisku
  // na podstawie zawartości tekstowej, niezależnie od tego, czy przycisk
  // jest aktualnie widoczny. Tworzymy niewidoczny kontener, w którym
  // klonujemy przyciski do pomiaru. Dzięki temu unikamy sytuacji,
  // gdy ukryte przyciski mają szerokość 0 i powodują błąd w układzie.
  let maxWidth = 0;
  const tmpContainer = document.createElement('div');
  tmpContainer.style.position = 'absolute';
  tmpContainer.style.visibility = 'hidden';
  tmpContainer.style.height = 'auto';
  tmpContainer.style.width = 'auto';
  tmpContainer.style.whiteSpace = 'nowrap';
  document.body.appendChild(tmpContainer);
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true);
    clone.style.width = 'auto';
    clone.style.display = 'inline-block';
    // Dodaj klona do tymczasowego kontenera
    tmpContainer.appendChild(clone);
    // Zmierz szerokość klona
    const width = clone.getBoundingClientRect().width;
    if (width > maxWidth) maxWidth = width;
    // Usuń klona po pomiarze
    tmpContainer.removeChild(clone);
  });
  // Usuń tymczasowy kontener z dokumentu
  document.body.removeChild(tmpContainer);

  // Ustaw obliczoną maksymalną szerokość dla wszystkich przycisków
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.width = `${maxWidth}px`;
    }
  });
}

// Wywołuj adjustTestButtonWidths po załadowaniu strony i przy zmianie rozmiaru okna.
window.addEventListener('DOMContentLoaded', () => {
  if (typeof adjustTestButtonWidths === 'function') {
    adjustTestButtonWidths();
  }
});
window.addEventListener('resize', () => {
  if (typeof adjustTestButtonWidths === 'function') {
    adjustTestButtonWidths();
  }
});

/**
 * Klasyfikacja ciężkości anoreksji u dorosłych (≥18 r.ż.)
 * Zwraca string z nazwą poziomu + zakresem.
 */
function anorexiaSeverityAdult(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚨 Zagrażająca życiu (BMI < 13)';
  if (bmi < BMI_SEVERE_ANOREXIA)     return '🔴 Bardzo ciężka (BMI < 15)';
  if (bmi < BMI_HEAVY_ANOREXIA)      return '🔴 Ciężka (BMI 15 – 15,99)';
  if (bmi < BMI_MODERATE_ANOREXIA)   return '🟠 Umiarkowana (BMI 16 – 16,99)';
  if (bmi < ADULT_BMI.UNDER)         return '🟡 Łagodna (BMI 17 – 18,49)';
  return null;
}

/**
 * Rekomendacja formy pomocy przy BMI < 18,5 (dorośli)
 * Zwraca pusty string, albo zalecenie.
 */
function anorexiaConsultRecommendation(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚑 Wymagana NATYCHMIASTOWA hospitalizacja';
  if (bmi < BMI_MODERATE_ANOREXIA)    return '‼️ Wskazana pilna konsultacja psychiatryczna';
  if (bmi < ADULT_BMI.UNDER)          return '💬 Rozważ konsultację psychologiczną';
  return '';
}

/**
 * Płynnie przewija okno tak, aby górna krawędź elementu znalazła się przy górnym brzegu viewportu.
 * Używa funkcji animacji requestAnimationFrame dla uzyskania wolniejszej, bardziej kontrolowanej
 * animacji niż wbudowane scrollIntoView.  Parametr duration określa czas przewijania w milisekundach.
 * @param {HTMLElement} element  docelowy element, do którego chcemy przewinąć
 * @param {number} [duration=800]  czas trwania animacji w ms
 */
function smoothScrollToElement(element, duration = 800) {
  if (!element) return;
  const startY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  // Offset docelowego elementu względem dokumentu
  const targetY = element.getBoundingClientRect().top + startY;
  const distance = targetY - startY;
  const startTime = performance.now();
  // Funkcja easing (łatwo można zmienić na inną). Używamy easeInOutQuad dla płynności.
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function animateScroll(currentTime) {
    const elapsed = currentTime - startTime;
    // Procent postępu (0–1)
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeInOutQuad(progress);
    const currentY = startY + distance * easedProgress;
    // Przewiń główny viewport oraz alternatywne kontenery scrollujące.  W niektórych układach
    // mobilnych przewijanie odbywa się na elemencie document.scrollingElement lub
    // document.documentElement, dlatego ustawiamy scrollTop na wszystkich potencjalnych
    // elementach, oprócz wywołania window.scrollTo, które w wielu przeglądarkach jest
    // obsługiwane poprawnie.
    try {
      window.scrollTo(0, currentY);
    } catch (_) {
      /* pomiń błędy z window.scrollTo */
    }
    const docEl = document.documentElement;
    if (docEl && typeof docEl.scrollTop === 'number') {
      docEl.scrollTop = currentY;
    }
    const scrollingEl = document.scrollingElement;
    if (scrollingEl && typeof scrollingEl.scrollTop === 'number') {
      scrollingEl.scrollTop = currentY;
    }
    const bodyEl = document.body;
    if (bodyEl && typeof bodyEl.scrollTop === 'number') {
      bodyEl.scrollTop = currentY;
    }
    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    }
  }
  requestAnimationFrame(animateScroll);
}

function update(){
  // Aktualizuj sekcję różnic w karcie „Ostatni pomiar” przy każdej zmianie danych wejściowych,
  // o ile funkcja updatePrevSummaryDiff jest zdefiniowana.  Otaczamy wywołanie blokiem try/catch
  // aby nie przerywać działania update() w przypadku błędu w obliczeniach różnic.
  if (typeof window.updatePrevSummaryDiff === 'function') {
    try {
      window.updatePrevSummaryDiff();
    } catch (e) {
      /* ignoruj błędy aktualizacji różnic */
    }
  }
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  // Wiek z uwzględnieniem miesięcy – korzystamy z nowej funkcji pomocniczej
  const age    = getAgeDecimal();
  const height = parseFloat(document.getElementById('height').value)|| 0;
       const sex    = document.getElementById('sex').value;

  /*
   * Ukrywanie sekcji ciśnienia i obwodów u dorosłych (>18 lat)
   *
   * Jeżeli wiek użytkownika przekracza 18 lat, ukrywamy kartę
   * „Ciśnienie tętnicze u dzieci” (#bpCard) oraz całą sekcję
   * dotyczącą obwodu głowy i klatki piersiowej (#circSection), która
   * zawiera przycisk rozwijający i samą kartę z wynikami. W przeciwnym
   * wypadku przywracamy ich widoczność, korzystając z wartości
   * domyślnej („” odpowiada wartości z arkusza CSS).
   */
  {
    const bpCardEl = document.getElementById('bpCard');
    const circSectionEl = document.getElementById('circSection');
    if (bpCardEl) {
      bpCardEl.style.display = (age > 18) ? 'none' : '';
    }
    if (circSectionEl) {
      circSectionEl.style.display = (age > 18) ? 'none' : '';
    }
  }

  /*
   * Ukryj przełącznik „Wyniki standardowe / Wyniki profesjonalne” u dorosłych
   *
   * Przełącznik wyników znajduje się w kontenerze o identyfikatorze
   * #resultsModeToggleContainer. Zgodnie z wymaganiami, gdy wiek
   * użytkownika przekracza 18 lat, nie ma potrzeby wyświetlania tego
   * przełącznika, ponieważ pełne wyniki nie mają zastosowania do osób
   * dorosłych. Gdy wiek ≤ 18 lat, kontener jest przywracany.
   */
  {
    const resultsToggleContainer = document.getElementById('resultsModeToggleContainer');
    if (resultsToggleContainer) {
      resultsToggleContainer.style.display = (age > 18) ? 'none' : '';
    }
  }

  // Sterowanie widocznością sekcji zaawansowanych obliczeń wzrostowych
  // Sekcja „Zaawansowane obliczenia wzrostowe” powinna być widoczna
  // dla wszystkich dzieci w wieku poniżej 18 lat. Wcześniej była
  // ograniczona do przedziału 3–18 lat, ale z nowymi siatkami
  // Palczewskiej umożliwiamy korzystanie również dla najmłodszych.
  // Ukrywamy sekcję tylko dla dorosłych (wiek >= 18 lat) lub gdy wiek jest niepoprawny.
  const advSection = document.getElementById('advancedGrowthSection');
  if (advSection) {
    if (!isNaN(age) && age < 18) {
      advSection.style.display = 'block';
    } else {
      // ukryj sekcję wraz z formularzem, ale nie usuwaj danych z pól
      advSection.style.display = 'none';
    }
  }

  // Kontroluj widoczność sekcji źródeł i zastrzeżeń
  const sourceFieldset = document.getElementById('sourceFieldset');
  // Na początku każdej aktualizacji ukrywamy to pole – zostanie pokazane
  // dopiero po poprawnym obliczeniu wyników (wyświetleniu sekcji wyników)
  if (sourceFieldset) {
    sourceFieldset.style.display = 'none';
  }

       // Flaga sterująca ukrywaniem karty „Droga do normy BMI” w sytuacji,
       // gdy wskaźnik Cole’a sugeruje nadwagę/otyłość, a BMI dziecka jest w normie.
       // Gdy zostanie ustawiona na true we fragmencie obliczania wskaźnika Cole’a,
       // karta „Droga do normy BMI” nie będzie pokazywana, a zamiast niej pojawi się
       // rozszerzone wyjaśnienie różnic między wskaźnikami.

  // Aktualizuj opis współczynnika PAL przy każdej zmianie formularza.
  const palElem = document.getElementById('palFactor');
  if (palElem) {
    updatePalDescription(palElem.value);
  }
  /* === OBSŁUGA WYBORU ŹRÓDŁA DANYCH (PALCZEWSKA / OLAF / WHO) ======= */
  const toggleContainer = document.getElementById('dataToggleContainer');
  const palRadio  = document.getElementById('sourcePalczewska');
  const olafRadio = document.getElementById('sourceOlaf');
  const whoRadio  = document.getElementById('sourceWho');
  if (toggleContainer && palRadio && olafRadio && whoRadio) {
    // Dorośli (>18 lat) lub brak wieku – ukryj przełącznik i wymuś WHO
    if (age > 18 || age === 0) {
      toggleContainer.style.display = 'none';
      // ustaw WHO jako aktywne źródło
      if (whoRadio) whoRadio.checked = true;
      if (palRadio) palRadio.checked = false;
      if (olafRadio) olafRadio.checked = false;
      bmiSource = 'WHO';
    } else {
      // pokaż przełącznik
      toggleContainer.style.display = 'flex';
      // jeżeli użytkownik nie zmienił suwaka ręcznie (brak flagi manual), ustaw domyślne źródło
      if (!toggleContainer.dataset.manual) {
        if (age < OLAF_DATA_MIN_AGE) {
          // 0–3 lata: domyślnie Palczewska
          if (palRadio) palRadio.checked = true;
          if (olafRadio) olafRadio.checked = false;
          if (whoRadio) whoRadio.checked = false;
        } else {
          // 3–18 lat: domyślnie OLAF
          if (palRadio) palRadio.checked = false;
          if (olafRadio) olafRadio.checked = true;
          if (whoRadio) whoRadio.checked = false;
        }
      }
      // Ustal bmiSource na podstawie zaznaczonego radio
      if (whoRadio && whoRadio.checked) {
        bmiSource = 'WHO';
      } else if (olafRadio && olafRadio.checked) {
        bmiSource = 'OLAF';
      } else {
        bmiSource = 'PALCZEWSKA';
      }
    }
  }
/* =================================================================== */

// Walidacja danych wejściowych (wiek, waga, wzrost)
const snackFieldset = document.getElementById('snackList').parentElement;
const mealFieldset  = document.getElementById('mealList').parentElement;
const errorBox      = document.getElementById('errorBox');
errorBox.innerHTML  = "";              // Czyścimy poprzednie błędy
errorBox.style.display = "none";       // Ukrywamy na razie box błędów

// Lista błędów walidacyjnych; używamy jej wyłącznie do sprawdzenia zakresów wejściowych.
const errors = [];

// Sprawdź zakres wieku
if (age !== 0 && (age < 0.25 || age > 130)) {
  errors.push("Wiek poza zakresem (0.25–130 lat)");
}
// Sprawdź zakres masy ciała
if (weight !== 0 && (weight < 1 || weight > 500)) {
  errors.push("Waga poza zakresem (1–500 kg)");
}
// Sprawdź zakres wzrostu
if (height !== 0 && (height < 40 || height > 250)) {
  errors.push("Wzrost poza zakresem (40–250 cm)");
}

// Ukryj/pokaż sekcje "Przekąski" i "Dania obiadowe" w zależności od poprawności danych
if (errors.length > 0 || age === 0 || weight === 0 || height === 0) {
  // Gdy dane niekompletne lub błędne – ukryj sekcje dodatkowe
  snackFieldset.style.display = "none";
  mealFieldset.style.display  = "none";
} else {
  // Gdy wszystkie trzy pola wypełnione poprawnie – pokaż sekcje dodatkowe
  snackFieldset.style.display = "block";
  mealFieldset.style.display  = "block";
}

  /* -------- WYMAGANE TRZY POLA: wiek + waga + wzrost -------- */
  if (age === 0 || weight === 0 || height === 0) {
    // ukryj wszystkie karty wyników
    document.getElementById('results').style.display = 'none';
    document.getElementById('planCard').style.display = 'none';
    // ukryj sekcje przekąsek / dań
    snackFieldset.style.display = 'none';
    mealFieldset.style.display  = 'none';
    // Jeśli użytkownik nie wczytał poprzedniego pomiaru (brak flagi loaded w prevSummary)
    // wyświetlamy komunikat o konieczności uzupełnienia danych.  W przeciwnym razie
    // (tzn. po wczytaniu pliku JSON) ukrywamy komunikat, aby nie pokazywać ostrzeżenia
    // „Podaj jednocześnie wiek…”.  Dzięki temu po prawidłowym wczytaniu danych
    // sekcja informacyjna z prawej kolumny (compareInstruction) przejmuje rolę
    // informowania o wymaganiu wpisania nowych danych.
    let hasPrevMeasurement = false;
    try {
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      hasPrevMeasurement = (card && card.dataset && card.dataset.loaded === 'true') ||
                           (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
    } catch (_) {
      hasPrevMeasurement = false;
    }
    if (!hasPrevMeasurement) {
      errorBox.innerHTML = "Podaj jednocześnie wiek, wagę i wzrost aby natychmiast zobaczyć wyniki";
      errorBox.style.display = 'block';
    } else {
      // Nie pokazuj komunikatu błędu, gdy mamy dane z poprzedniego pomiaru.
      errorBox.innerHTML = '';
      errorBox.style.display = 'none';
    }
    // Zaktualizuj pozycjonowanie sekcji modułu lekarskiego, aby w trybie
    // mobilnym pojawiła się pod komunikatem (lub pusta przestrzeń po nim).
    if (typeof repositionDoctor === 'function') {
      repositionDoctor();
    }
    return;   // ⬅️ nic nie liczymy, koniec update()
  }

// Jeśli któreś pole jest poza dozwolonym zakresem – pokaż komunikat błędu i przerwij obliczenia
if (errors.length > 0) {
  errorBox.innerHTML = errors.join("<br>");  // Wyświetl wszystkie błędy (każdy w nowej linii)
  errorBox.style.display = "block";          // Pokaż czerwony komunikat błędu
  document.getElementById('results').style.display = "none";  // Nie pokazuj wyników
  document.getElementById('planCard').style.display = 'none';
    // Zaktualizuj pozycjonowanie sekcji modułu lekarskiego także w tym przypadku
    if (typeof repositionDoctor === 'function') {
      repositionDoctor();
    }
    return;  // Zatrzymaj dalsze obliczenia, dopóki dane nie będą poprawne
}

// Jeśli brak błędów, kontynuujemy obliczenia (poprzedni komunikat błędu już ukryty)
// ---- RESET PLAN ODCHUDZANIA ----
const planCard    = document.getElementById('planCard');
const planResults = document.getElementById('planResults');
// Resetuj kartę planu odchudzania i ukryj informację o kaloryczności
planCard.style.display = 'none';
planResults.innerHTML  = '';
const dietCalInfo = document.getElementById('dietCalorieInfo');
if (dietCalInfo) dietCalInfo.style.display = 'none';
// Resetuj ostrzeżenia i kartę konsultacji na początku aktualizacji
const planWarningEl = document.getElementById('planWarning');
const childConsultCard = document.getElementById('childConsultCard');
if (planWarningEl) {
  planWarningEl.style.display = 'none';
  clearPulse(planWarningEl);
}
if (childConsultCard) childConsultCard.style.display = 'none';

  const bmiReady = weight > 0 && height > 0;
  const bmrReady = bmiReady && age > 0;

  const kcal = calcTotal(snacks,'.snack-row') + calcTotal(meals,'.meal-row');
  /* === KARTA SUMY KALORII (przekąski + dania) ========================== */
  const totalCard   = document.getElementById('totalCard');
  const totalKcalEl = document.getElementById('totalKcal');
  const totalListEl = document.getElementById('totalList');  // ⬅️ NOWY div

  // 1) zbierz wszystkie wybrane pozycje z ilościami
  const items = [];
  document.querySelectorAll('.snack-row').forEach(r=>{
    const key  = r.querySelector('select').value;
    const qty  = parseFloat(r.querySelector('input').value)||0;
    if(qty>0){
      items.push({                // zapisz nazwę, kcal pojedynczo, kcal*qty
        name: snacks[key].name,
        kcal: snacks[key].kcal * qty
      });
    }
  });
  document.querySelectorAll('.meal-row').forEach(r=>{
    const key  = r.querySelector('select').value;
    const qty  = parseFloat(r.querySelector('input').value)||0;
    if(qty>0){
      items.push({
        name: meals[key].name,
        kcal: meals[key].kcal * qty
      });
    }
  });

  // 2) pokaż kartę tylko jeśli są wybrane pozycje
  if(items.length){
    // a) całkowite kcal
    totalKcalEl.innerHTML = `<strong>Łącznie: ${Math.round(kcal)} kcal</strong>`;

    // b) lista jako tabela
    const rows = items.map(it=>`<tr><td>${it.name}</td><td>${Math.round(it.kcal)} kcal</td></tr>`).join('');
    totalListEl.innerHTML =
        `<table class="kcal-table">
           <tr><th>Produkt</th><th>kcal</th></tr>
           ${rows}
         </table>`;

    totalCard.style.display = 'block';
  }else{
    totalCard.style.display = 'none';
    totalKcalEl.innerHTML = '';
    totalListEl.innerHTML = '';
  }

  const results   = document.getElementById('results');
  const timesCard = document.getElementById('timesCard');
  const timesDiv  = document.getElementById('times');
  const bmrInfo   = document.getElementById('bmrInfo');
  const toNormCard = document.getElementById('toNormCard');
  const toNormInfo = document.getElementById('toNormInfo');
  toNormInfo.innerHTML = '';
  toNormCard.style.display = 'none';

  timesDiv.innerHTML = '';
  bmrInfo.innerHTML  = '';
  results.style.display   = 'none';
  timesCard.style.display = 'none';

  // -----------------------------------------------------------------
  // Reset and prepare elements related to Weight‑for‑Length/Height (WFL)
  // Karta WFL (wflCard) jest wyświetlana wyłącznie u dzieci w wieku <5 lat.
  // Na początku każdej aktualizacji ukrywamy ją i czyścimy zawartość,
  // a także ukrywamy przypomnienia AAP dla BMI i wskaźnika Cole'a.
  const wflCardEl         = document.getElementById('wflCard');
  const wflInfoEl         = document.getElementById('wflInfo');
  const wflExplanationEl  = document.getElementById('wflExplanation');
  const wflNormTableEl    = document.getElementById('wflNormTable');
  const wflReminderBMIEl  = document.getElementById('wflReminderBMI');
  const wflReminderColeEl = document.getElementById('wflReminderCole');
  if (wflCardEl) {
    wflCardEl.style.display = 'none';
  }
  if (wflInfoEl) {
    wflInfoEl.innerHTML = '';
  }
  if (wflExplanationEl) {
    wflExplanationEl.textContent = '';
  }
  if (wflNormTableEl) {
    wflNormTableEl.innerHTML = '';
    wflNormTableEl.style.display = 'none';
  }
  if (wflReminderBMIEl) {
    wflReminderBMIEl.style.display = 'none';
    wflReminderBMIEl.textContent = '';
  }
  if (wflReminderColeEl) {
    wflReminderColeEl.style.display = 'none';
    wflReminderColeEl.textContent = '';
  }

  /* ---------- BMI i BMR ---------- */
  if(bmiReady){
    const bmi      = BMI(weight,height);
    const bmiText  = bmi.toFixed(1);
    /** Powierzchnia ciała (Body Surface Area) – wzór Haycocka */
    function BSA_Haycock(weight, height){     // weight kg, height cm
    return 0.024265 * Math.pow(weight, 0.5378) *
                     Math.pow(height, 0.3964);      // wynik m²
    }

    const months = Math.round(age*12);
    let bmiCat;
    if(age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
      bmiCat = bmiCategoryChild(bmi, sex, months);
    }else{
      bmiCat = bmiCategory(bmi);
    }

    let bmiPercentile = null;
    if(age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
      // Oblicz percentyl BMI w zależności od wybranego źródła danych.
      // Jeśli używamy Palczewskiej – korzystamy z jej siatek centylowych dla całego zakresu wiekowego.
      // W przypadku OLAF dla wieku <3 lat – również używamy Palczewskiej (brak siatek OLAF dla niemowląt).
      // W pozostałych przypadkach (WHO oraz OLAF ≥3 lat) wyliczamy percentyl przez LMS (bmiPercentileChild()).
      if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
        bmiPercentile = bmiPercentileChildPal(bmi, sex, months);
      } else if (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF' && months < 36) {
        // OLAF z brakiem niemowlęcej siatki – użyj Palczewskiej
        bmiPercentile = bmiPercentileChildPal(bmi, sex, months);
        if (bmiPercentile == null) {
          // Fallback do LMS WHO/OLAF w przypadku braku danych Palczewskiej
          bmiPercentile = bmiPercentileChild(bmi, sex, months);
        }
      } else {
        // WHO oraz OLAF (≥3 lata) – LMS
        bmiPercentile = bmiPercentileChild(bmi, sex, months);
      }
      // Wyznacz kategorię BMI na podstawie percentyla z odpowiednimi progami:
      // - dla <3 lat zawsze używamy progów WHO, niezależnie od wyboru suwaka
      // - dla ≥3 lat progów OLAF (Polska) używamy, gdy wybrane źródło to OLAF lub Palczewska
      if (bmiPercentile !== null){
        const useOlafClass = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') && age >= OLAF_DATA_MIN_AGE);
        const normalHiClass = useOlafClass ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
        const obesityClass  = useOlafClass ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
        // Nie nadpisuj kategorii 'Otyłość olbrzymia' wyznaczonej na podstawie z‑score.
        // Jeśli bmiCat ma inną wartość, nadpisz ją na podstawie percentyli.
        if (bmiCat !== 'Otyłość olbrzymia') {
          // Niedowaga poniżej 5. centyla
          if (bmiPercentile < 5) {
            bmiCat = 'Niedowaga';
          // Prawidłowe BMI pomiędzy 5 a górną granicą normy
          } else if (bmiPercentile < normalHiClass) {
            bmiCat = 'Prawidłowe';
          // Nadwaga poniżej progu otyłości
          } else if (bmiPercentile < obesityClass) {
            bmiCat = 'Nadwaga';
          // Otyłość olbrzymia – percentyl ≥99,9 (≈3 SD)
          } else if (bmiPercentile >= 99.9) {
            bmiCat = 'Otyłość olbrzymia';
          // Otyłość (obesity threshold ≤ percentyl < 99,9)
          } else {
            bmiCat = 'Otyłość';
          }
        }
      } else {
        // Jeśli percentyl jest niedostępny, skorzystaj z klasyfikacji dla dorosłych
        bmiCat = bmiCategory(bmi);
      }
    }
    let percText = '';
    if (bmiPercentile !== null) {
    percText = ` – ${formatCentile(bmiPercentile)} centyl`;
    }
    /* >>> DODAJ TO: zapisz percentyl BMI dziecka do globalnej zmiennej dla WHR <<< */
    window.bmiPercentileValue = (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) ? bmiPercentile : null;

    // BMI ostrzeżenie dla nadwagi i otyłości u dzieci – będzie wstawione do karty BMI
    // Inicjalizuj zmienną ostrzeżenia przed jego obliczeniem, aby zachować ustawioną wartość
    let bmiWarningHtml = '';
    let anorexiaNote = '';
    // Ustaw BMI ostrzeżenie: nadwaga/otyłość/otyłość olbrzymia u dzieci oraz stopniowana otyłość u dorosłych
    if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX && bmiPercentile !== null) {
      // Przygotuj ostrzeżenia dla dzieci. Dla dzieci <3 l. stosujemy progi WHO niezależnie od suwaka „Polska”.
      const useOlafWarn = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') && age >= OLAF_DATA_MIN_AGE);
      const normalHi = useOlafWarn ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
      const obesity  = useOlafWarn ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
      const monthsWarn = Math.round(age * 12);
      const zscoreWarn = bmiZscore(bmi, sex, monthsWarn);
      if (zscoreWarn != null && zscoreWarn >= 3) {
        // Otyłość olbrzymia – pilna konsultacja
        bmiWarningHtml = `<div class="centile-warning">⚠ Otyłość olbrzymia – pilna konsultacja lekarska. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
      } else if (bmiPercentile >= obesity) {
        // Otyłość – konsultacja z endokrynologiem dziecięcym
        bmiWarningHtml = `<div class="centile-warning">⚠ Otyłość – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
      } else if (bmiPercentile >= normalHi) {
        // Nadwaga – konsultacja dietetyczna (kolor ciemnopomarańczowy)
        bmiWarningHtml = `<div class="centile-warning" style="color:#c75d00;">⚠ Nadwaga – zalecana konsultacja dietetyczna. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
      }
    } else if (age >= 18) {
      // Ostrzeżenia BMI dla dorosłych: stopniowane według WHO
      if (bmi >= 40) {
        bmiWarningHtml = `<div class="centile-warning"><strong>⚠ Otyłość III stopnia.</strong> Pilna konsultacja lekarska!!</div>`;
      } else if (bmi >= 35) {
        bmiWarningHtml = `<div class="centile-warning"><strong>⚠ Otyłość II stopnia.</strong> Zalecana konsultacja lekarska!</div>`;
      } else if (bmi >= 30) {
        bmiWarningHtml = `<div class="centile-warning"><strong>⚠ Otyłość I stopnia.</strong> Zalecana konsultacja lekarska.</div>`;
      } else if (bmi >= 25) {
        bmiWarningHtml = `<div class="centile-warning" style="color:#c75d00;"><strong>⚠ Nadwaga.</strong> Zalecana konsultacja dietetyczna.</div>`;
      } else if (bmi >= 24) {
        // BMI w górnej granicy normy – delikatne ostrzeżenie
        bmiWarningHtml = `<div class="centile-warning" style="color:#c75d00;">BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy. Warto rozważyć modyfikację nawyków żywieniowych i stylu życia.</div>`;
      }
    }
  if (age >= 18 && bmi < ADULT_BMI.UNDER) {
  const sev = anorexiaSeverityAdult(bmi);
  const consult = anorexiaConsultRecommendation(bmi);
  if (sev) anorexiaNote += `<br><small style="color:var(--danger)">${sev}</small>`;
  if (consult) anorexiaNote += `<br><small style="color:var(--danger);font-weight:600">${consult}</small>`;
}
let html = '';      // Zaczynamy od pustego stringu
/* ===== KARTA CENTYLI WAGA / WZROST (3‑18 l.) ===== */
if (age <= 18) {
  // Przygotuj struktury centylowe dla dzieci i młodzieży do 18 roku życia.
  // Zależnie od wieku (<3 lata) i wybranego źródła danych (Palczewska/OLAF vs WHO)
  // obliczamy centyle i odchylenia standardowe z odpowiednich zbiorów.
  let statsW, statsH;
  let w3, w97, h3, h97;
  const months = Math.round(age * 12);
  /*
   * Wybierz odpowiednie źródło do obliczania centyli wagi i wzrostu:
   * – Jeśli użytkownik wybrał Palczewską (bmiSource === 'PALCZEWSKA'), użyj rozszerzonych danych Palczewskiej
   *   dla całego zakresu 0–18 lat.
   * – Jeżeli źródło to OLAF, ale wiek < 3 lat (OLAF_DATA_MIN_AGE), również korzystaj z danych Palczewskiej,
   *   ponieważ OLAF nie obejmuje niemowląt.
   * – We wszystkich pozostałych sytuacjach (WHO niemowlęta oraz OLAF/WHO dla starszych dzieci) używamy
   *   funkcji LMS (calcPercentileStats), które automatycznie dobierają WHO lub OLAF zgodnie z ustawieniem
   *   suwaka i dostępnością danych.
   */
  const usePal = (typeof bmiSource !== 'undefined' &&
                  (bmiSource === 'PALCZEWSKA' ||
                   (bmiSource === 'OLAF' && age < OLAF_DATA_MIN_AGE)));
  if (usePal) {
    // Skorzystaj z danych Palczewskiej dla wagi i wzrostu
    // Wyłącz flagę fallbacku, aby nie wyświetlać komunikatu o OLAF przy przejściu z WHO na Palczewską
    // Kiedy wybieramy dane Palczewskiej, korzystamy z niezależnego zestawu LMS,
    // więc poprzednia flaga fallbacku (której używa WHO/OLAF) nie powinna się propagować.
    weightUsedFallback = false;
    statsW = calcPercentileStatsPal(weight, sex, age, 'WT');
    statsH = calcPercentileStatsPal(height, sex, age, 'HT');
    if (statsW && statsH) {
      // Oblicz wartości graniczne 3. i 97. centyla z danych Palczewskiej
      w3  = getPalCentile(sex, months, 3, 'WT');
      w97 = getPalCentile(sex, months, 97, 'WT');
      h3  = getPalCentile(sex, months, 3, 'HT');
      h97 = getPalCentile(sex, months, 97, 'HT');
    }
  } else {
    // w pozostałych przypadkach (WHO/OLAF dla starszych dzieci) używamy funkcji LMS
    statsW = calcPercentileStats(weight, sex, age, 'WT');
    statsH = calcPercentileStats(height, sex, age, 'HT');
    if (statsW && statsH) {
      const lmsW = getChildLMS(sex, age, 'WT');
      if (lmsW) {
        w3  = (lmsW[0] !== 0)
               ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z3, 1 / lmsW[0])
               : lmsW[1] * Math.exp(lmsW[2] * Z3);
        w97 = (lmsW[0] !== 0)
               ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z97, 1 / lmsW[0])
               : lmsW[1] * Math.exp(lmsW[2] * Z97);
      }
      const lmsH = getChildLMS(sex, age, 'HT');
      if (lmsH) {
        h3  = (lmsH[0] !== 0)
               ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z3, 1 / lmsH[0])
               : lmsH[1] * Math.exp(lmsH[2] * Z3);
        h97 = (lmsH[0] !== 0)
               ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z97, 1 / lmsH[0])
               : lmsH[1] * Math.exp(lmsH[2] * Z97);
      }
    }
  }
  // Jeżeli udało się obliczyć oba statystyki (waga i wzrost), generujemy linie wynikowe
  if (statsW && statsH) {
    // --- waga ---
    const wCent = statsW ? formatCentile(statsW.percentile) : null;
    // W zależności od trybu wyników (standardowy/profesjonalny) pokazujemy lub
    // ukrywamy Z‑score. Pozostawiamy miejsce na kolejne dodatki (np. różnice
    // od skrajnych centyli), które są dopisywane poniżej.
    let weightLine = statsW
       ? `<span class="result-val">${wCent}</span> centyl` + (professionalMode ? ` (Z‑score = ${statsW.sd.toFixed(2)})` : '')
       : 'Brak danych';
    // komunikaty o braku danych WHO dla starszych dzieci
    if (!statsW && bmiSource === 'WHO' && age * 12 > 120) {
      weightLine = 'Brak danych WHO powyżej 10 lat – użyj BMI lub OLAF';
    }
    // jeżeli waga pochodzi z OLAF (fallback) dla starszych dzieci
    if (statsW && weightUsedFallback) {
      weightLine += ' <em>(użyto OLAF – WHO brak wagi >10 l.)</em>';
    }
    // Drugi warunek braku danych WHO dla starszych dzieci
    if (!statsW && bmiSource === 'WHO' && age * 12 > 120) {
      weightLine = 'Brak danych WHO powyżej 10 lat – użyj BMI';
    } else {
      // Różnice od 3. i 97. centyla wyświetlamy tylko dla skrajnych wartości
      const roundedWeightCentLine = Math.round(statsW.percentile);
      if (statsW && typeof w3 === 'number' && roundedWeightCentLine <= 2) {
        weightLine += `, brakuje ${(w3 - weight).toFixed(1)} kg do 3 centyla`;
      }
      if (statsW && typeof w97 === 'number' && statsW.percentile >= 98) {
        weightLine += `, +${(weight - w97).toFixed(1)} kg ponad 97 centyl`;
      }
    }
     // --- wzrost ---
     const hCent = formatCentile(statsH.percentile);
     // użyj tego samego zaokrąglenia, które widzi użytkownik (spójność z UI)
     const roundedHeightCentLine = Math.round(statsH.percentile);
     // Analogicznie dla wzrostu – dołączamy Z‑score tylko w trybie profesjonalnym
     let heightLine = `<span class="result-val">${hCent}</span> ${centylWord(hCent)}`;
     if (professionalMode) {
       heightLine += ` (Z‑score = ${statsH.sd.toFixed(2)})`;
     }
     // pokaż „brakuje … do 3 centyla” również dla całego 2. centyla (SD ≈ −2.0 → ~2.28 centyla, zaokrągla się do 2)
     if (roundedHeightCentLine <= 2 && typeof h3 === 'number') {
       heightLine += `, brakuje ${(h3 - height).toFixed(1)} cm do 3 centyla`;
     }
    if (statsH.percentile >= 98 && typeof h97 === 'number') {
      heightLine += `, +${(height - h97).toFixed(1)} cm ponad 97 centyl`;
    }
    // --- ostrzeżenia specjalistyczne ---
    // Dla dzieci poniżej 2 lat nie pokazujemy ostrzeżeń o skrajnych centylach wagi i wzrostu.
    let warnLines = '';
    if (typeof age !== 'undefined' && age >= 2) {
      // Używamy ZAOKRĄGLONEGO percentyla (jak w UI), aby „wciągnąć” cały 2. centyl do alertu
      const roundedHeightCent = Math.round(statsH.percentile);
      const roundedWeightCent = Math.round(statsW.percentile);
      // 1) Konsultacja endokrynologiczna: CAŁY 2. centyl i poniżej (rounded < 3)
      if (roundedHeightCent < PERCENTILE_EXTREME_LOW) {
        warnLines += `<div class="centile-warning">
             ⚠ Wzrost poniżej 3 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym.
             <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
           </div>`;
      // 2) Monitorowanie: cały 3. centyl do 10. centyla (włącznie) — komunikaty rozłączne
      } else if (roundedHeightCent >= PERCENTILE_EXTREME_LOW && roundedHeightCent <= 10) {
        warnLines += `<div class="centile-monitor-warning">
             Regularnie monitoruj wzrastanie dziecka – wzrost w dolnym zakresie normy (3–10&nbsp;centyl).
           </div>`;
      }
      // waga < 3 centyla (po zaokrągleniu – spójnie z tym, co widzi użytkownik)
      if (roundedWeightCent < PERCENTILE_EXTREME_LOW) {
        warnLines += `<div class="centile-warning">
            ⚠ Waga poniżej 3 centyla – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym.
            <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
          </div>`;
        } else if (roundedWeightCent >= PERCENTILE_EXTREME_LOW && roundedWeightCent <= 10) {
             warnLines += `<div class="centile-monitor-warning">
               Regularnie monitoruj masę ciała dziecka – waga w dolnym zakresie normy (3–10&nbsp;centyl).
             </div>`;
      }
      // waga > 97 centyla
      if (statsW && statsW.percentile > PERCENTILE_EXTREME_HIGH) {
        warnLines += `<div class="centile-warning">
            ⚠ Waga powyżej 97 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym lub dietetykiem.
            <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
          </div>`;
      }
    }
    // ostrzeżenie o nadwadze/otylosci przeniesione do karty BMI
    // (bmiWarningHtml jest ustawiany powyżej i dodawany w sekcji BMI)
    html += `<div class="result-box result-card animate-in">
           <strong>Waga: ${weightLine}</strong><br>
           <strong>Wzrost: ${heightLine}</strong>
           ${warnLines}
         </div>`;
  }
}
/* ===== KONIEC KARTY CENTYLI ===== */
    let bsaLine = '';
    if (age > 0 && age < 18 && weight > 0 && height > 0){
    const bsa = BSA_Haycock(weight, height).toFixed(2);
    bsaLine = `<div class="bsa-info">Pow. ciała: <span class="result-val">${bsa}</span> m²</div>`;
    }
    // Zbuduj sekcję BMI/BMR z uwzględnieniem wieku.  
    // Dla dzieci <2 lat nie pokazujemy klasyfikacji (Niedowaga/Nadwaga/Otyłość) ani komunikatu o konsultacji –
    // zalecenia przeniesiono do karty WFL.  
    let bmiLine = `<strong>BMI: <span class="result-val">${bmi.toFixed(1)}</span>`;
    bmiLine += percText; // „ – 84 centyl”
    // Dodaj Z‑score BMI w nawiasie (zaokrąglony do dwóch miejsc), jeśli można go obliczyć.
    const bmiZVal = (typeof age !== 'undefined' && age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX)
      ? bmiZscore(bmi, sex, Math.round(age * 12))
      : null;
    // W trybie profesjonalnym pokazujemy Z‑score, w standardowym pomijamy tę informację.
    if (bmiZVal !== null && !isNaN(bmiZVal) && professionalMode) {
      bmiLine += ` (Z‑score = ${bmiZVal.toFixed(2)})`;
    }
    // U dorosłych NIE pokazujemy nawiasu z kategorią dla nadwagi/otyłości.
    // (u dzieci zachowujemy dotychczasowy wygląd)
    const showCatAfterNumber =
      !(age >= 18 && (bmiCat === 'Nadwaga' || String(bmiCat).startsWith('Otyłość')));
    if (age >= 2 && showCatAfterNumber){
      bmiLine += ` (${bmiCat})`;
    }
    bmiLine += `</strong>`;
    // Ostrzeżenia BMI (nadwaga/otyłość) pokazujemy tylko u dzieci i młodzieży ≥2 lat
    const bmiWarnSection = (age >= 2) ? bmiWarningHtml : '';
    const boxClass = 'result-box' + bmiBoxClassForAdult(bmiCat, age);
    html += `<div class="${boxClass}">
           ${bmiLine}
           ${bsaLine}
           ${bmiWarnSection}
           ${anorexiaNote}
         </div>`;
    if(bmrReady){
      const bmr = BMR(weight,height,age,sex);

      const factors = {
        'Siedzący (x1.2)':1.2,
        'Lekko aktywny (x1.375)':1.375,
        'Średnio aktywny (x1.55)':1.55,
        'Bardzo aktywny (x1.725)':1.725,
        'Ekstremalnie aktywny (x1.9)':1.9
      };
      let rows='';
      for(const [lvl,f] of Object.entries(factors)){
        rows += `<tr><td>${lvl}</td><td>${Math.round(bmr*f)}</td></tr>`;
      }
      html += `<div class="result-box"><strong>BMR: ${bmr} kcal/dzień</strong>
                <table style='margin-top:8px;width:100%;'><tr><th>Poziom aktywności</th><th>kcal/dzień</th></tr>${rows}</table></div>`;
    }else{
      html += `<p><em>Podaj wiek, aby obliczyć BMR.</em></p>`;
    }

    bmrInfo.innerHTML   = html;
    results.style.display = 'grid';
    // Po wygenerowaniu wyników zaplanuj płynne przewinięcie do pierwszej
    // karty wyników (BMI).  Używamy niewielkiego opóźnienia, aby mieć
    // pewność, że operacje repozycjonowania elementów (np. repositionDoctor)
    // zakończyły się i wartości getBoundingClientRect będą dokładne.  
    // Przed przewinięciem sprawdzamy, czy użytkownik nie jest w trakcie
    // edycji któregoś z pól wiek/waga/wzrost.  Jeśli nadal wpisuje dane,
    // nie wykonujemy przewijania.  Po sprawdzeniu ustawiamy widok tak,
    // aby górna krawędź karty BMI była wyrównana z górnym brzegiem okna.
    setTimeout(() => {
      try {
        // Nie przewijaj w trakcie edycji pól: jeśli kursor miga w polu wieku, wagi lub wzrostu,
        // poczekaj do utraty fokusu.  Zapobiega to skakaniu ekranu podczas wpisywania.
        const active = document.activeElement;
        const ageInp    = document.getElementById('age');
        const weightInp = document.getElementById('weight');
        const heightInp = document.getElementById('height');
        if (active === ageInp || active === weightInp || active === heightInp) {
          return;
        }
        const cardEl = document.getElementById('bmiCard');
        if (cardEl) {
          // Użyj naszej funkcji scrollToResultsCard(), która zawiera rozbudowane
          // sprawdzenia (np. aktywny element, pola wyłączone, flaga wyłączająca)
          // i stosuje powolne, łagodne przewijanie wyrównane do górnego brzegu.
          scrollToResultsCard();
        }
      } catch (err) {
        /* ignoruj błędy przewijania */
      }
    }, 150);
    // Po wyświetleniu wyników pokaż sekcję źródeł i zastrzeżeń
    if (typeof sourceFieldset !== 'undefined' && sourceFieldset) {
      sourceFieldset.style.display = 'block';
    }

    /* ---------- WFL (Waga do długości/wzrostu) ---------- */
    // Obliczamy i wyświetlamy wskaźnik WFL tylko u dzieci do 2. roku życia włącznie
    if (wflCardEl && wflInfoEl && wflExplanationEl && wflNormTableEl && weight > 0 && height > 0) {
      // wiek ≤ 2 lata – stosujemy siatki WHO weight‑for‑length/height
      if (age > 0 && age <= 2) {
        const zWfl = computeWflZScore(weight, height, sex);
        if (zWfl !== null && !isNaN(zWfl)) {
          // Calculate percentile from Z‑score using the normal CDF
          const wflPercentile = normalCDF(zWfl) * 100;
          const wflCentTxt   = formatCentile(wflPercentile);
          // Determine interpretation based on Z‑score thresholds
          let wflComment = '';
          let wflWarning = false;
          if (zWfl < -2) {
            wflComment = 'Niedowaga';
            wflWarning = true;
          } else if (zWfl >= -2 && zWfl <= 2) {
            wflComment = 'W normie';
          } else if (zWfl > 2 && zWfl <= 3) {
            wflComment = 'Nadwaga';
            wflWarning = true;
          } else if (zWfl > 3) {
            wflComment = 'Otyłość';
            wflWarning = true;
          }
          // Format results: Z‑score with two decimals and percentile
          const wflValueHtml  = `<strong>Z‑score: <span class="result-val">${zWfl.toFixed(2)}</span></strong>`;
          const wflPercentHtml = `<strong>Centyl: <span class="result-val">${wflCentTxt}</span></strong>`;
          const commentHtml = wflComment
            ? (wflWarning ? ` <span class="centile-warning" style="font-size:1.4rem">${wflComment}</span>` : ` <span>${wflComment}</span>`)
            : '';
          // Build WFL section with percentile and interpretation
          let wflSection = `${wflValueHtml}<br>${wflPercentHtml}`;
          if (commentHtml) {
            wflSection += `<br>${commentHtml}`;
          }
          // Add consultation messages depending on interpretation
          if (wflWarning) {
            let consultMsg = '';
            if (wflComment === 'Niedowaga') {
              consultMsg = `<div class="centile-warning">⚠ Niedowaga – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
            } else if (wflComment === 'Nadwaga') {
              consultMsg = `<div class="centile-warning">⚠ Nadwaga – zalecana konsultacja z&nbsp;pediatrą. <a href="https://vildaclinic.pl/pediatria" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
            } else if (wflComment === 'Otyłość') {
              consultMsg = `<div class="centile-warning">⚠ Otyłość – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
            }
            if (consultMsg) {
              wflSection += `<br>${consultMsg}`;
            }
          }
          wflInfoEl.innerHTML = wflSection;
          // Explanation text: mention both Z‑score and percentiles
          wflExplanationEl.innerHTML = 'Wskaźnik WFL porównuje masę ciała dziecka z medianą masy dla jego długości lub wzrostu (standardy WHO). ' +
            'Dla dzieci do 2 lat wartości Z‑score powyżej +2 odchylenia standardowego świadczą o nadwadze, a powyżej +3 – otyłości. ' +
            'Centyl odzwierciedla, jaki odsetek rówieśników ma mniejszą lub równą masę dla danej długości.';
          // Simple reference table for Z‑score interpretation
          wflNormTableEl.innerHTML = '<table style="width:100%;border-collapse:collapse;margin-top:0.6rem;"><tr><th>Zakres Z</th><th>Interpretacja</th></tr>' +
            '<tr><td>&lt; −2</td><td>Niedowaga</td></tr>' +
            '<tr><td>−2 – 2</td><td>W normie</td></tr>' +
            '<tr><td>2 – 3</td><td>Nadwaga</td></tr>' +
            '<tr><td>&ge; 3</td><td>Otyłość</td></tr></table>';
          wflNormTableEl.style.display = 'block';
          // Show the WFL card
          wflCardEl.style.display = 'block';
        }
      }
    }
    // Pokazuj adnotacje AAP dla BMI/Cole’a jeśli wiek ≤ 2 lata
    if (age > 0 && age <= 2) {
      const note = 'Amerykańska Akademia Pediatrii zaleca stosowanie wskaźnika waga do długość/wzrostu (WFL) do oceny stanu odżywienia u dzieci młodszych niż 2 lata, natomiast wskaźnika BMI u dzieci starszych.';
      if (wflReminderBMIEl) {
        wflReminderBMIEl.textContent = note;
        wflReminderBMIEl.style.display = 'block';
      }
      if (wflReminderColeEl) {
        wflReminderColeEl.textContent = note;
        wflReminderColeEl.style.display = 'block';
      }
    }
      /* ---------- COLE INDEX (Wskaźnik Cole'a) ---------- */
      // Reset i obliczenie wskaźnika Cole’a (dzieci/młodzież)
      const coleCardEl = document.getElementById('coleCard');
      const coleInfoEl = document.getElementById('coleInfo');
      const coleExplanationEl = document.getElementById('coleExplanation');
      const coleNormTableEl = document.getElementById('coleNormTable');

      if (coleCardEl && coleInfoEl && coleExplanationEl) {
        // ukryj kartę i wyczyść
        coleCardEl.style.display = 'none';
        coleInfoEl.innerHTML = '';
        // wyczyść ew. poprzednie klasy i pulsowanie
        coleInfoEl.classList.remove('bmi-warning', 'bmi-danger', 'result-card', 'animate-in', '--pulse');
        clearPulse(coleInfoEl);
        coleExplanationEl.textContent = '';
      if (coleNormTableEl) {
        coleNormTableEl.innerHTML = '';
        coleNormTableEl.style.display = 'none';
      }

  // licz tylko, jeśli dane są sensowne (dziecko ≤ 18 l., mamy wagę i wzrost)
  if (age > 0 && age <= CHILD_AGE_MAX && weight > 0 && height > 0) {
    const months = Math.round(age * 12);
    // LMS dla BMI wg wybranego źródła (OLAF/WHO)
    const lmsBMI = getLMS(sex, months);
    if (lmsBMI && lmsBMI[1] > 0) {
      const medianBMI = lmsBMI[1];         // M = mediana BMI
      const bmiNow    = BMI(weight, height);
      const cole      = (bmiNow / medianBMI) * 100;

      // kategoryzacja Cole’a (progi: <90, 90–110, 110–<120, ≥120)
      let coleCat = 'W normie';
      if (cole < 90)                         coleCat = 'Niedowaga';
      else if (cole > 110 && cole < 120)     coleCat = 'Nadwaga';
      else if (cole >= 120)                  coleCat = 'Otyłość';

      /* >>> NOWE: zapisz wyniki do globalnych dla innych modułów (np. WHR) <<< */
      window.coleCatValue    = coleCat;
      window.colePercentValue = cole;

      // Nagłówek karty
      coleInfoEl.innerHTML =
        `<strong>Wskaźnik Cole'a: <span class="result-val">${cole.toFixed(1)}%</span></strong>`;
      // For Cole result, avoid using 'result-card' to ensure pulse animations remain visible.
      // Other modules (e.g. WHR, advanced growth) rely solely on the .result-box styling,
      // which works well with our pulse helpers. The 'result-card' class adds an overflow
      // constraint and different box-shadow that can suppress the pulse ring on some devices.
      coleInfoEl.classList.add('animate-in', '--pulse');
        // Kolor + pulsowanie ramki analogiczne do BMI dorosłych
        coleInfoEl.classList.remove('bmi-warning', 'bmi-danger');
        clearPulse(coleInfoEl);

        if (coleCat === 'Otyłość') {
          // czerwony
          coleInfoEl.classList.add('bmi-danger');
          applyPulse(coleInfoEl, 'danger');
        } else if (coleCat === 'Nadwaga' || coleCat === 'Niedowaga') {
          // ciemnopomarańczowy
          coleInfoEl.classList.add('bmi-warning');
          applyPulse(coleInfoEl, 'warning');
        } else {
         // W normie – bez pulsowania/koloru ostrzegawczego
          clearPulse(coleInfoEl);
        }

      // Tabela norm Cole’a
      if (coleNormTableEl) {
        coleNormTableEl.innerHTML =
          '<table style="margin-top:8px;">' +
          '<tr><th>Wskaźnik Cole’a (%)</th><th>Interpretacja</th></tr>' +
          '<tr><td>&lt; 90</td><td>Niedowaga</td></tr>' +
          '<tr><td>90–110</td><td>W normie</td></tr>' +
          '<tr><td>&gt; 110–&lt; 120</td><td>Nadwaga</td></tr>' +
          '<tr><td>&ge; 120</td><td>Otyłość</td></tr>' +
          '</table>';
        coleNormTableEl.style.display = 'block';
      }

      // Kategoria BMI (dziecko vs dorosły — funkcje masz już w pliku)
      let bmiCat;
      if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
        bmiCat = bmiCategoryChild(bmiNow, sex, months);
      } else {
        bmiCat = bmiCategory(bmiNow);
      }
      const isBMINormal  = (bmiCat === 'Prawidłowe' || bmiCat === 'W normie');
      const isColeNormal = (coleCat === 'W normie');
      // Nadwaga lub dowolny stopień otyłości u osoby
      const isBMIOver    = (bmiCat === 'Nadwaga' || String(bmiCat).startsWith('Otyłość'));
      const isColeOver   = (coleCat === 'Nadwaga' || String(coleCat).startsWith('Otyłość'));
      const isBMIUnder   = (bmiCat === 'Niedowaga');
      const isColeUnder  = (coleCat === 'Niedowaga');

      // DOMYŚLNE krótkie objaśnienie (gdy brak rozbieżności)
      let expl =
        'Wskaźnik Cole’a porównuje <em>aktualne BMI</em> dziecka z <em>medianą BMI</em> dla jego wieku i płci (wg wybranego źródła: OLAF/WHO). ' +
        'Wartość ~100% oznacza BMI zbliżone do mediany; &lt;90% – niedowagę; 90–110% – normę; &gt;110–&lt;120% – nadwagę; ≥120% – otyłość.';

      // ROZBIEŻNOŚCI – komunikaty kierunkowe
      if (isColeOver && isBMINormal) {
        // Scenariusz A: Cole = Nadwaga/Otyłość, BMI = norma
        expl =
          '<p>🔎 <strong>Dlaczego wskaźnik Cole’a wskazuje na nadwagę lub otyłość, mimo że BMI jest jeszcze w normie?</strong></p>' +
          '<p>Oba wskaźniki są policzone poprawnie. BMI ocenia proporcję masy do wzrostu względem rówieśników (OLAF/WHO), ' +
          'natomiast wskaźnik Cole’a porównuje BMI do międzynarodowych standardów ryzyka nadwagi/otyłości w dorosłości. ' +
          'U wysokich dzieci masa względem wieku bywa wyższa niż przeciętnie, choć BMI pozostaje prawidłowe.</p>' +
          '<p>👉 To sygnał, by przyjrzeć się stylowi życia dziecka (aktywność, żywienie). W razie wątpliwości skonsultuj się z dietetykiem/lekarzem.</p>';
      } else if (isBMIOver && isColeNormal) {
        // Scenariusz B: BMI = Nadwaga/Otyłość, Cole = norma
        expl =
          '<p>🔎 <strong>Dlaczego BMI wskazuje na nadwagę lub otyłość, mimo że wskaźnik Cole’a pozostaje w normie?</strong></p>' +
          '<p>Oba wskaźniki są policzone poprawnie, lecz akcentują różne aspekty. BMI jest wrażliwe na niski wzrost ' +
          '(przy niskim wzroście ta sama masa daje wyższe BMI), podczas gdy wskaźnik Cole’a porównuje BMI do mediany BMI i może pozostać w normie.</p>' +
          '<p>👉 Zalecana weryfikacja na siatkach centylowych i konsultacja dietetyczna/lekarza, jeśli BMI przekracza próg nadwagi/otyłości.</p>';
      } else if (isColeUnder && isBMINormal) {
        // Scenariusz C: Cole = Niedowaga, BMI = norma
        expl =
          '<p>🔎 <strong>Dlaczego wskaźnik Cole’a sugeruje niedowagę, a BMI jest w normie?</strong></p>' +
          '<p>To różnica perspektyw: Cole porównuje BMI do mediany BMI; u wyjątkowo szczupłych, ale wysokich dzieci ' +
          'masa względem wieku może wypadać nisko, przy prawidłowym BMI.</p>';
      } else if (isBMIUnder && !isColeUnder) {
        // Scenariusz D: BMI = Niedowaga, Cole ≠ Niedowaga
        expl =
          '<p>🔎 <strong>Dlaczego BMI wskazuje niedowagę, a wskaźnik Cole’a nie?</strong></p>' +
          '<p>Wynika to z różnic metod. BMI silniej akcentuje relację masa/wzrost; Cole porównuje BMI do mediany BMI. ' +
          'Przy ocenie zawsze kieruj się siatkami BMI-for-age oraz konsultacją kliniczną.</p>';
      }

      coleExplanationEl.innerHTML = expl;
      coleCardEl.style.display = 'block';
    }
  }
}
/* ------------------------------------- */
  }
  /* ===== WHR – render i sugestie ===== */
(function renderWHR(){
  const whrCard       = document.getElementById('whrCard');
  const whrSuggest    = document.getElementById('whrSuggest');
  const whrInfo       = document.getElementById('whrInfo');
  const whrInterpret  = document.getElementById('whrInterpret');
  const whrChildTable = document.getElementById('whrChildTable');
  if (!whrCard) return;

  // Sekcja może być rozwijana przyciskiem – ale kartę trzymamy gotową
  whrCard.style.display = 'block';

  // Bieżące BMI (dorosły/dziecko)
  const bmiNow = (weight>0 && height>0) ? BMI(weight, height) : null;

  // >>> Nowy sposób: używamy globalnych wartości ustawionych w sekcjach BMI/Cole
  const bmiPChild  = (typeof window.bmiPercentileValue === 'number') ? window.bmiPercentileValue : null;
  const coleCatNow = (typeof window.coleCatValue === 'string') ? window.coleCatValue : null;

  // Kiedy zasugerować WHR (dorosły BMI>24; dziecko BMI ≥85 c. lub BMI<85 c. + Cole nadwaga/otyłość)
  const suggest = shouldSuggestWHR(age, sex, bmiNow, bmiPChild, coleCatNow);
  // Pokazanie lub ukrycie sugestii WHR
  whrSuggest.style.display = suggest ? 'block' : 'none';
  // NEW: apply or clear pulse on the suggestion banner
  clearPulse(whrSuggest);
  if (suggest) {
    applyPulse(whrSuggest, 'warning');
  }

  // Dane wejściowe do WHR
  const waistEl = document.getElementById('waistCm');
  const hipEl   = document.getElementById('hipCm');
  const waistCm = parseFloat(waistEl && waistEl.value) || 0;
  const hipCm   = parseFloat(hipEl && hipEl.value)   || 0;

  // Gdy użytkownik wprowadził oba pomiary obwodu talii i bioder (co skutkuje
  // obliczeniem WHR), ukryj sugestię dotyczącą WHR. W ten sposób komunikat
  // „Sugerujemy ocenę WHR…” znika po pojawieniu się wyniku, zgodnie z
  // wymaganiami UI. Jeśli pomiary nie są kompletne, zachowujemy wcześniejszą
  // logikę wyświetlania sugestii (ustaloną powyżej na podstawie funkcji
  // shouldSuggestWHR).  W przypadku wprowadzenia obu wartości nadpisujemy
  // widoczność banera i usuwamy animację pulsu.
  if (waistCm > 0 && hipCm > 0) {
    whrSuggest.style.display = 'none';
    clearPulse(whrSuggest);
  }

  // Brak pomiarów – czyścimy
  if (!(waistCm>0 && hipCm>0)){
    whrInfo.style.display       = 'none';
    whrInterpret.style.display  = 'none';
    whrChildTable.style.display = 'none';
    whrChildTable.innerHTML     = '';
    return;
  }

  // Interpretacja (u Ciebie: WHO dla 18+, centyle dla 3–18 lat)
  const result = interpretWHR(age, sex, waistCm, hipCm, bmiNow, bmiPChild, coleCatNow);
  if (!result){
    whrInfo.style.display       = 'none';
    whrInterpret.style.display  = 'none';
    whrChildTable.style.display = 'none';
    whrChildTable.innerHTML     = '';
    return;
  }

  // Render – OPCJA A: wszystko w jednej ramce (#whrInfo)
  // Przygotuj zawartość pola WHR w zależności od stanu (ok/warn/bad).
  let statusHtml;
  if (result.state === 'ok') {
    statusHtml = `<div class="whr-status ok">${result.interp}${result.note ? `<br><em>${result.note}</em>` : ''}</div>`;
  } else if (result.state === 'warn') {
    // ostrzeżenie – pomarańczowy tekst, bez wewnętrznej ramki
    statusHtml = `<div class="whr-status warn">${result.interp}</div>`;
  } else {
    // stan "bad" – czerwony tekst, bez wewnętrznej ramki
    statusHtml = `<div class="whr-status bad">${result.interp}</div>`;
  }
  // Wstawiamy wynik WHR z dynamicznym statusem do pojedynczej ramki wyników.
  whrInfo.innerHTML = `
<div class="whr-result">
  <div class="whr-topline">
    <span class="whr-label">WHR:</span>
    <span class="whr-number">${result.whr}</span>
  </div>
  ${statusHtml}
</div>`;
  whrInfo.style.display = 'block';
  // Ustaw klasę koloru ramki (#whrInfo) zależnie od stanu wyniku.
  whrInfo.classList.remove('whr-warning','whr-danger');
  if (result.state === 'warn') {
    whrInfo.classList.add('whr-warning');
  } else if (result.state !== 'ok') {
    whrInfo.classList.add('whr-danger');
  }
  // Zastosuj pulsowanie na całej ramce wyników (#whrInfo) dla ostrzeżeń i błędnych wyników.
  clearPulse(whrInfo);
  if (result.state === 'warn') {
    applyPulse(whrInfo, 'warning');
  } else if (result.state === 'bad') {
    applyPulse(whrInfo, 'danger');
  }

// Wszystko jest w ramce wyniku – ukryj dawny akapit interpretacji
whrInterpret.style.display = 'none';
whrInterpret.innerHTML = '';

// Tabela (dzieci) bez zmian
if (result.showTable) {
whrChildTable.innerHTML = result.tableHtml;
whrChildTable.style.display = 'block';
} else {
whrChildTable.style.display = 'none';
whrChildTable.innerHTML = '';
}
})();
  /* ---------- DROGA DO NORMY BMI ---------- */
  if (bmiReady) {
  const bmiCurrent = BMI(weight, height);

  // dorośli z BMI < 18.5 → ukryj kartę
  if (age >= 18 && bmiCurrent < 18.5) {
    toNormCard.style.display = 'none';
  } else {
    const toNorm = distanceToNormalBMI(weight, height, age, sex);
    if(toNorm) {
      toNormInfo.innerHTML = `<div class="result-box">
  <strong>Musisz zredukować masę o ${toNorm.kgToLose.toFixed(1)} kg<br>
  (ok. ${Math.round(toNorm.kcalToBurn)} kcal)</strong>
  ${toNorm.table}
</div>
`;
      toNormCard.style.display = 'block';
            // — jeśli Nadwaga lub Otyłość, pokaż Plan odchudzania —
      const bmiVal = BMI(weight, height);
      let cat;
      if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
        const months = Math.round(age * 12);
        cat = bmiCategoryChild(bmiVal, sex, months);
      } else {
        // dorośli – klasyczny podział BMI
        cat = bmiCategory(bmiVal);
      }
      if (cat === 'Nadwaga' || String(cat).startsWith('Otyłość')) {
        // Obsługa nadwagi/otyłości z uwzględnieniem wieku dziecka
        const planCardEl = document.getElementById('planCard');
        // planWarningEl i childConsultCard zostały zresetowane na początku update()
        if (age < 5) {
          // dzieci <5 lat z nadwagą/otyłością: ukryj plan i pokaż kartę konsultacyjną
          if (planCardEl) planCardEl.style.display = 'none';
          if (planWarningEl) {
            planWarningEl.style.display = 'none';
            clearPulse(planWarningEl);
          }
          if (childConsultCard) {
            childConsultCard.innerHTML = `<div style="color:var(--danger);font-weight:600;">⚠ Dziecko poniżej 5 lat z nadwagą lub otyłością wymaga konsultacji z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Umów wizytę</a></div>`;
            childConsultCard.style.display = 'block';
          }
        } else {
          // dzieci ≥5 lat oraz dorośli – pokaż plan i ewentualne ostrzeżenie
          if (planCardEl) planCardEl.style.display = 'block';
          updatePlanFromDiet();
          // ukryj kartę konsultacyjną
          if (childConsultCard) childConsultCard.style.display = 'none';
          // dzieci w wieku 5–9 lat: ostrzeżenie w planie
          if (age < 10) {
            if (planWarningEl) {
              planWarningEl.innerHTML = `⚠ Dziecko poniżej&nbsp;10 lat z nadwagą lub otyłością powinno skonsultować się z&nbsp;dietetykiem lub endokrynologiem dziecięcym. Proponowany plan ma charakter poglądowy. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Umów wizytę</a>`;
              planWarningEl.style.display = 'block';
              applyPulse(planWarningEl, 'danger');
            }
          } else {
            if (planWarningEl) {
              planWarningEl.style.display = 'none';
              clearPulse(planWarningEl);
            }
          }
        }
      } else {
        // BMI nie wskazuje nadwagi/otyłości – ukryj kartę planu i wszystkie komunikaty
        document.getElementById('planCard').style.display = 'none';
        if (planWarningEl) {
          planWarningEl.style.display = 'none';
          clearPulse(planWarningEl);
        }
        if (childConsultCard) childConsultCard.style.display = 'none';
      }

    } else {
  // BMI ≤ górnej granicy normy – sprawdzamy, czy jest to niedowaga
  const currentBMI = BMI(weight, height);
  const months     = Math.round(age * 12);
  const cat        = (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX)
                       ? bmiCategoryChild(currentBMI, sex, months)
                       : bmiCategory(currentBMI);

  if (cat === 'Niedowaga') {
  let kgGain = 0;
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
    kgGain = kgToReachNormalBMIChild(weight, height, age, sex);
  }
  const gainMsg = kgGain > 0
        ? `<br>Brakuje ok. <strong>${kgGain.toFixed(1)} kg</strong> do dolnej granicy normy BMI.` 
        : '';

  // Zmień komunikat o niedowadze.  
  // Dla dzieci poniżej 10 lat informujemy o konieczności konsultacji z pediatrą lub gastroenterologiem dziecięcym.
  if (age < 10) {
    toNormInfo.innerHTML = `<div class="result-box">
      <div class="centile-warning">⚠ Dziecko poniżej 10 lat z niedowagą wymaga konsultacji z&nbsp;pediatrą lub gastroenterologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>
      ${gainMsg}
    </div>`;
  } else {
    toNormInfo.innerHTML = `
    <div class="result-box" style="color:var(--primary)">
      Twoje BMI wskazuje na niedowagę – rozważ zwiększenie kaloryczności diety
      i&nbsp;konsultację z&nbsp;dietetykiem.${gainMsg}
    </div>`;
  }
} else {
    // BMI w normie – rozróżnij dorosłych z BMI zbliżającym się do górnej granicy
    if (age >= 18 && currentBMI >= 24 && currentBMI < 25) {
      // ostrzeżenie: BMI w normie, ale blisko górnej granicy
      toNormInfo.innerHTML = `<div class="result-box" style="color:#c75d00;">
        Wskaźnik BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy.
        Zalecana jest modyfikacja nawyków żywieniowych i stylu życia.
      </div>`;
    } else {
      // standardowy komunikat: BMI jest w normie
      toNormInfo.innerHTML = `<div class="result-box" style="color:var(--primary)">
        Twoje BMI jest już w normie! 🚀
      </div>`;
    }
  }
  toNormCard.style.display = 'block';
}

  }

    }
     /* ---------- Czas spalania ---------- */
if(bmiReady && kcal > 0){
  const childFactor = (age > 0 && age < 14) ? 1.1 : 1;
  let rows='';
  Object.values(activities).forEach(act=>{
    const burnPerMin = (act.MET * 3.5 * weight) / 200;
    const minutes    = (kcal * childFactor) / burnPerMin;
    const h = Math.floor(minutes/60);
    const m = Math.round(minutes%60);
    const timeStr = h > 0 ? `${h} h ${m} min` : `${m} min`;
    rows += `<tr><td>${act.name}</td><td>${timeStr}</td></tr>`;
  });
  timesDiv.innerHTML = `<table style="width:100%;border-collapse:collapse;margin-top:0.6rem;"><tr><th>Aktywność</th><th>Czas spalania</th></tr>${rows}</table>`;
  timesCard.style.display = 'block';
}
}



// init with no rows so user explicitly adds items

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('fieldset').forEach(fs => {
    const legend = fs.querySelector('legend');
    if(!legend) return;
    /* Pomiń przekąski i dania – dla nich używamy własnego CSS */
    if (fs.classList.contains('food-field')) return;

    // wybierz referencyjny element:
    let reference = fs.querySelector('button.add-row');
    if(!reference) reference = fs.querySelector('label');
    if(!reference) return;

    const fsRect = fs.getBoundingClientRect();
    const refRect = reference.getBoundingClientRect();

    // połowa drogi w pionie
    const centerY = (refRect.top - fsRect.top) / 2;
    legend.style.top = (centerY - legend.offsetHeight / 2) + 'px';

    // wyrównaj lewą krawędź
    const offsetX = refRect.left - fsRect.left;
    legend.style.left = offsetX + 'px';
  });
});

const bmiPercentiles={"boys":{"24":{"P5":14.16,"P85":17.4,"P95":18.31},"25":{"P5":14.12,"P85":17.36,"P95":18.26},"26":{"P5":14.08,"P85":17.32,"P95":18.21},"27":{"P5":14.04,"P85":17.27,"P95":18.16},"28":{"P5":14.01,"P85":17.23,"P95":18.12},"29":{"P5":13.97,"P85":17.19,"P95":18.08},"30":{"P5":13.93,"P85":17.16,"P95":18.04},"31":{"P5":13.9,"P85":17.12,"P95":18.0},"32":{"P5":13.86,"P85":17.08,"P95":17.96},"33":{"P5":13.83,"P85":17.05,"P95":17.92},"34":{"P5":13.79,"P85":17.02,"P95":17.89},"35":{"P5":13.76,"P85":16.98,"P95":17.85},"36":{"P5":13.73,"P85":16.95,"P95":17.82},"37":{"P5":13.69,"P85":16.92,"P95":17.79},"38":{"P5":13.67,"P85":16.9,"P95":17.76},"39":{"P5":13.64,"P85":16.87,"P95":17.74},"40":{"P5":13.61,"P85":16.85,"P95":17.72},"41":{"P5":13.58,"P85":16.82,"P95":17.7},"42":{"P5":13.56,"P85":16.8,"P95":17.68},"43":{"P5":13.53,"P85":16.79,"P95":17.66},"44":{"P5":13.51,"P85":16.77,"P95":17.65},"45":{"P5":13.49,"P85":16.76,"P95":17.64},"46":{"P5":13.47,"P85":16.74,"P95":17.63},"47":{"P5":13.45,"P85":16.73,"P95":17.62},"48":{"P5":13.43,"P85":16.72,"P95":17.62},"49":{"P5":13.41,"P85":16.71,"P95":17.61},"50":{"P5":13.4,"P85":16.7,"P95":17.61},"51":{"P5":13.38,"P85":16.7,"P95":17.61},"52":{"P5":13.36,"P85":16.69,"P95":17.61},"53":{"P5":13.35,"P85":16.69,"P95":17.61},"54":{"P5":13.33,"P85":16.68,"P95":17.62},"55":{"P5":13.32,"P85":16.68,"P95":17.62},"56":{"P5":13.3,"P85":16.67,"P95":17.63},"57":{"P5":13.29,"P85":16.67,"P95":17.63},"58":{"P5":13.28,"P85":16.67,"P95":17.64},"59":{"P5":13.26,"P85":16.67,"P95":17.65},"60":{"P5":13.25,"P85":16.67,"P95":17.66},"61":{"P5":13.38,"P85":16.7,"P95":17.66},"62":{"P5":13.38,"P85":16.7,"P95":17.67},"63":{"P5":13.38,"P85":16.71,"P95":17.68},"64":{"P5":13.37,"P85":16.71,"P95":17.69},"65":{"P5":13.37,"P85":16.72,"P95":17.7},"66":{"P5":13.37,"P85":16.73,"P95":17.72},"67":{"P5":13.37,"P85":16.74,"P95":17.74},"68":{"P5":13.38,"P85":16.75,"P95":17.76},"69":{"P5":13.38,"P85":16.77,"P95":17.78},"70":{"P5":13.38,"P85":16.78,"P95":17.8},"71":{"P5":13.39,"P85":16.8,"P95":17.83},"72":{"P5":13.39,"P85":16.82,"P95":17.85},"73":{"P5":13.4,"P85":16.84,"P95":17.88},"74":{"P5":13.41,"P85":16.86,"P95":17.91},"75":{"P5":13.41,"P85":16.88,"P95":17.94},"76":{"P5":13.42,"P85":16.9,"P95":17.97},"77":{"P5":13.43,"P85":16.92,"P95":18.0},"78":{"P5":13.44,"P85":16.95,"P95":18.04},"79":{"P5":13.45,"P85":16.97,"P95":18.07},"80":{"P5":13.46,"P85":17.0,"P95":18.11},"81":{"P5":13.47,"P85":17.03,"P95":18.15},"82":{"P5":13.48,"P85":17.05,"P95":18.18},"83":{"P5":13.49,"P85":17.08,"P95":18.22},"84":{"P5":13.5,"P85":17.11,"P95":18.26},"85":{"P5":13.52,"P85":17.14,"P95":18.3},"86":{"P5":13.53,"P85":17.17,"P95":18.34},"87":{"P5":13.54,"P85":17.2,"P95":18.39},"88":{"P5":13.55,"P85":17.23,"P95":18.43},"89":{"P5":13.57,"P85":17.26,"P95":18.47},"90":{"P5":13.58,"P85":17.3,"P95":18.52},"91":{"P5":13.59,"P85":17.33,"P95":18.56},"92":{"P5":13.61,"P85":17.36,"P95":18.61},"93":{"P5":13.62,"P85":17.4,"P95":18.66},"94":{"P5":13.64,"P85":17.43,"P95":18.7},"95":{"P5":13.65,"P85":17.47,"P95":18.75},"96":{"P5":13.67,"P85":17.51,"P95":18.8},"97":{"P5":13.68,"P85":17.54,"P95":18.85},"98":{"P5":13.7,"P85":17.58,"P95":18.9},"99":{"P5":13.71,"P85":17.62,"P95":18.96},"100":{"P5":13.73,"P85":17.66,"P95":19.01},"101":{"P5":13.74,"P85":17.7,"P95":19.06},"102":{"P5":13.76,"P85":17.74,"P95":19.12},"103":{"P5":13.78,"P85":17.78,"P95":19.17},"104":{"P5":13.79,"P85":17.82,"P95":19.23},"105":{"P5":13.81,"P85":17.86,"P95":19.28},"106":{"P5":13.83,"P85":17.9,"P95":19.34},"107":{"P5":13.85,"P85":17.94,"P95":19.4},"108":{"P5":13.87,"P85":17.99,"P95":19.45},"109":{"P5":13.88,"P85":18.03,"P95":19.51},"110":{"P5":13.9,"P85":18.07,"P95":19.57},"111":{"P5":13.92,"P85":18.12,"P95":19.63},"112":{"P5":13.94,"P85":18.17,"P95":19.7},"113":{"P5":13.96,"P85":18.21,"P95":19.76},"114":{"P5":13.99,"P85":18.26,"P95":19.82},"115":{"P5":14.01,"P85":18.31,"P95":19.89},"116":{"P5":14.03,"P85":18.36,"P95":19.95},"117":{"P5":14.05,"P85":18.41,"P95":20.02},"118":{"P5":14.08,"P85":18.46,"P95":20.09},"119":{"P5":14.1,"P85":18.51,"P95":20.16},"120":{"P5":14.13,"P85":18.57,"P95":20.23},"121":{"P5":14.15,"P85":18.62,"P95":20.29},"122":{"P5":14.18,"P85":18.67,"P95":20.37},"123":{"P5":14.2,"P85":18.73,"P95":20.44},"124":{"P5":14.23,"P85":18.79,"P95":20.51},"125":{"P5":14.26,"P85":18.84,"P95":20.58},"126":{"P5":14.29,"P85":18.9,"P95":20.66},"127":{"P5":14.32,"P85":18.96,"P95":20.73},"128":{"P5":14.35,"P85":19.02,"P95":20.81},"129":{"P5":14.38,"P85":19.08,"P95":20.88},"130":{"P5":14.41,"P85":19.14,"P95":20.96},"131":{"P5":14.44,"P85":19.2,"P95":21.04},"132":{"P5":14.47,"P85":19.26,"P95":21.11},"133":{"P5":14.5,"P85":19.32,"P95":21.19},"134":{"P5":14.53,"P85":19.38,"P95":21.27},"135":{"P5":14.57,"P85":19.45,"P95":21.35},"136":{"P5":14.6,"P85":19.51,"P95":21.43},"137":{"P5":14.63,"P85":19.58,"P95":21.51},"138":{"P5":14.67,"P85":19.64,"P95":21.59},"139":{"P5":14.7,"P85":19.71,"P95":21.67},"140":{"P5":14.74,"P85":19.78,"P95":21.76},"141":{"P5":14.78,"P85":19.84,"P95":21.84},"142":{"P5":14.81,"P85":19.91,"P95":21.92},"143":{"P5":14.85,"P85":19.98,"P95":22.01},"144":{"P5":14.89,"P85":20.05,"P95":22.09},"145":{"P5":14.93,"P85":20.12,"P95":22.18},"146":{"P5":14.97,"P85":20.19,"P95":22.26},"147":{"P5":15.01,"P85":20.26,"P95":22.35},"148":{"P5":15.05,"P85":20.34,"P95":22.43},"149":{"P5":15.09,"P85":20.41,"P95":22.52},"150":{"P5":15.14,"P85":20.48,"P95":22.61},"151":{"P5":15.18,"P85":20.56,"P95":22.7},"152":{"P5":15.22,"P85":20.63,"P95":22.79},"153":{"P5":15.27,"P85":20.71,"P95":22.87},"154":{"P5":15.31,"P85":20.79,"P95":22.96},"155":{"P5":15.36,"P85":20.86,"P95":23.05},"156":{"P5":15.4,"P85":20.94,"P95":23.14},"157":{"P5":15.45,"P85":21.02,"P95":23.23},"158":{"P5":15.5,"P85":21.1,"P95":23.32},"159":{"P5":15.54,"P85":21.18,"P95":23.42},"160":{"P5":15.59,"P85":21.26,"P95":23.51},"161":{"P5":15.64,"P85":21.33,"P95":23.6},"162":{"P5":15.69,"P85":21.41,"P95":23.69},"163":{"P5":15.73,"P85":21.49,"P95":23.78},"164":{"P5":15.78,"P85":21.57,"P95":23.87},"165":{"P5":15.83,"P85":21.65,"P95":23.96},"166":{"P5":15.88,"P85":21.73,"P95":24.04},"167":{"P5":15.93,"P85":21.81,"P95":24.13},"168":{"P5":15.98,"P85":21.89,"P95":24.22},"169":{"P5":16.02,"P85":21.97,"P95":24.31},"170":{"P5":16.07,"P85":22.05,"P95":24.4},"171":{"P5":16.12,"P85":22.13,"P95":24.48},"172":{"P5":16.17,"P85":22.2,"P95":24.57},"173":{"P5":16.22,"P85":22.28,"P95":24.65},"174":{"P5":16.26,"P85":22.36,"P95":24.74},"175":{"P5":16.31,"P85":22.43,"P95":24.82},"176":{"P5":16.36,"P85":22.51,"P95":24.91},"177":{"P5":16.41,"P85":22.59,"P95":24.99},"178":{"P5":16.45,"P85":22.66,"P95":25.07},"179":{"P5":16.5,"P85":22.74,"P95":25.15},"180":{"P5":16.55,"P85":22.81,"P95":25.23},"181":{"P5":16.59,"P85":22.88,"P95":25.31},"182":{"P5":16.64,"P85":22.96,"P95":25.39},"183":{"P5":16.68,"P85":23.03,"P95":25.47},"184":{"P5":16.73,"P85":23.1,"P95":25.54},"185":{"P5":16.77,"P85":23.17,"P95":25.62},"186":{"P5":16.82,"P85":23.24,"P95":25.69},"187":{"P5":16.86,"P85":23.31,"P95":25.77},"188":{"P5":16.91,"P85":23.38,"P95":25.84},"189":{"P5":16.95,"P85":23.45,"P95":25.91},"190":{"P5":16.99,"P85":23.52,"P95":25.99},"191":{"P5":17.04,"P85":23.59,"P95":26.06},"192":{"P5":17.08,"P85":23.65,"P95":26.13},"193":{"P5":17.12,"P85":23.72,"P95":26.2},"194":{"P5":17.16,"P85":23.79,"P95":26.26},"195":{"P5":17.2,"P85":23.85,"P95":26.33},"196":{"P5":17.24,"P85":23.91,"P95":26.4},"197":{"P5":17.28,"P85":23.98,"P95":26.46},"198":{"P5":17.32,"P85":24.04,"P95":26.53},"199":{"P5":17.36,"P85":24.1,"P95":26.59},"200":{"P5":17.4,"P85":24.16,"P95":26.65},"201":{"P5":17.43,"P85":24.22,"P95":26.72},"202":{"P5":17.47,"P85":24.28,"P95":26.78},"203":{"P5":17.51,"P85":24.34,"P95":26.84},"204":{"P5":17.54,"P85":24.4,"P95":26.9},"205":{"P5":17.58,"P85":24.46,"P95":26.96},"206":{"P5":17.61,"P85":24.52,"P95":27.01},"207":{"P5":17.65,"P85":24.57,"P95":27.07},"208":{"P5":17.68,"P85":24.63,"P95":27.12},"209":{"P5":17.71,"P85":24.68,"P95":27.18},"210":{"P5":17.75,"P85":24.74,"P95":27.23},"211":{"P5":17.78,"P85":24.79,"P95":27.29},"212":{"P5":17.81,"P85":24.84,"P95":27.34},"213":{"P5":17.84,"P85":24.89,"P95":27.39},"214":{"P5":17.87,"P85":24.94,"P95":27.44},"215":{"P5":17.9,"P85":24.99,"P95":27.49},"216":{"P5":17.93,"P85":25.04,"P95":27.54},"217":{"P5":17.96,"P85":25.09,"P95":27.59},"218":{"P5":17.99,"P85":25.14,"P95":27.63},"219":{"P5":18.02,"P85":25.19,"P95":27.68},"220":{"P5":18.04,"P85":25.24,"P95":27.73},"221":{"P5":18.07,"P85":25.28,"P95":27.77},"222":{"P5":18.1,"P85":25.33,"P95":27.81},"223":{"P5":18.12,"P85":25.37,"P95":27.86},"224":{"P5":18.15,"P85":25.41,"P95":27.9},"225":{"P5":18.17,"P85":25.46,"P95":27.94},"226":{"P5":18.19,"P85":25.5,"P95":27.98},"227":{"P5":18.22,"P85":25.54,"P95":28.02},"228":{"P5":18.24,"P85":25.58,"P95":28.06}},"girls":{"24":{"P5":13.72,"P85":17.16,"P95":18.13},"25":{"P5":13.7,"P85":17.13,"P95":18.1},"26":{"P5":13.67,"P85":17.1,"P95":18.07},"27":{"P5":13.65,"P85":17.07,"P95":18.03},"28":{"P5":13.63,"P85":17.04,"P95":18.0},"29":{"P5":13.61,"P85":17.01,"P95":17.97},"30":{"P5":13.58,"P85":16.99,"P95":17.95},"31":{"P5":13.56,"P85":16.96,"P95":17.92},"32":{"P5":13.54,"P85":16.94,"P95":17.89},"33":{"P5":13.52,"P85":16.91,"P95":17.87},"34":{"P5":13.5,"P85":16.89,"P95":17.85},"35":{"P5":13.47,"P85":16.87,"P95":17.84},"36":{"P5":13.45,"P85":16.86,"P95":17.82},"37":{"P5":13.43,"P85":16.85,"P95":17.81},"38":{"P5":13.41,"P85":16.84,"P95":17.81},"39":{"P5":13.39,"P85":16.83,"P95":17.81},"40":{"P5":13.36,"P85":16.82,"P95":17.81},"41":{"P5":13.34,"P85":16.82,"P95":17.81},"42":{"P5":13.32,"P85":16.82,"P95":17.81},"43":{"P5":13.3,"P85":16.82,"P95":17.82},"44":{"P5":13.28,"P85":16.82,"P95":17.83},"45":{"P5":13.26,"P85":16.82,"P95":17.83},"46":{"P5":13.24,"P85":16.82,"P95":17.84},"47":{"P5":13.22,"P85":16.82,"P95":17.85},"48":{"P5":13.2,"P85":16.83,"P95":17.87},"49":{"P5":13.19,"P85":16.83,"P95":17.88},"50":{"P5":13.17,"P85":16.84,"P95":17.9},"51":{"P5":13.16,"P85":16.85,"P95":17.91},"52":{"P5":13.15,"P85":16.86,"P95":17.93},"53":{"P5":13.14,"P85":16.87,"P95":17.95},"54":{"P5":13.13,"P85":16.88,"P95":17.97},"55":{"P5":13.12,"P85":16.89,"P95":17.99},"56":{"P5":13.11,"P85":16.91,"P95":18.01},"57":{"P5":13.11,"P85":16.92,"P95":18.03},"58":{"P5":13.1,"P85":16.93,"P95":18.05},"59":{"P5":13.1,"P85":16.94,"P95":18.07},"60":{"P5":13.09,"P85":16.96,"P95":18.08},"61":{"P5":13.13,"P85":16.93,"P95":18.1},"62":{"P5":13.13,"P85":16.94,"P95":18.12},"63":{"P5":13.12,"P85":16.95,"P95":18.14},"64":{"P5":13.11,"P85":16.97,"P95":18.17},"65":{"P5":13.11,"P85":16.98,"P95":18.19},"66":{"P5":13.1,"P85":16.99,"P95":18.21},"67":{"P5":13.1,"P85":17.0,"P95":18.24},"68":{"P5":13.1,"P85":17.02,"P95":18.26},"69":{"P5":13.09,"P85":17.03,"P95":18.29},"70":{"P5":13.09,"P85":17.05,"P95":18.32},"71":{"P5":13.09,"P85":17.06,"P95":18.34},"72":{"P5":13.09,"P85":17.08,"P95":18.37},"73":{"P5":13.09,"P85":17.1,"P95":18.4},"74":{"P5":13.09,"P85":17.12,"P95":18.43},"75":{"P5":13.09,"P85":17.14,"P95":18.47},"76":{"P5":13.09,"P85":17.16,"P95":18.5},"77":{"P5":13.09,"P85":17.18,"P95":18.53},"78":{"P5":13.1,"P85":17.2,"P95":18.57},"79":{"P5":13.1,"P85":17.23,"P95":18.61},"80":{"P5":13.1,"P85":17.25,"P95":18.65},"81":{"P5":13.11,"P85":17.28,"P95":18.69},"82":{"P5":13.12,"P85":17.31,"P95":18.73},"83":{"P5":13.12,"P85":17.34,"P95":18.77},"84":{"P5":13.13,"P85":17.37,"P95":18.81},"85":{"P5":13.14,"P85":17.4,"P95":18.86},"86":{"P5":13.15,"P85":17.43,"P95":18.9},"87":{"P5":13.16,"P85":17.46,"P95":18.95},"88":{"P5":13.17,"P85":17.5,"P95":19.0},"89":{"P5":13.18,"P85":17.53,"P95":19.05},"90":{"P5":13.2,"P85":17.57,"P95":19.1},"91":{"P5":13.21,"P85":17.61,"P95":19.15},"92":{"P5":13.23,"P85":17.65,"P95":19.21},"93":{"P5":13.24,"P85":17.69,"P95":19.26},"94":{"P5":13.26,"P85":17.73,"P95":19.32},"95":{"P5":13.27,"P85":17.77,"P95":19.38},"96":{"P5":13.29,"P85":17.82,"P95":19.44},"97":{"P5":13.31,"P85":17.86,"P95":19.5},"98":{"P5":13.33,"P85":17.91,"P95":19.56},"99":{"P5":13.35,"P85":17.95,"P95":19.62},"100":{"P5":13.37,"P85":18.0,"P95":19.69},"101":{"P5":13.39,"P85":18.05,"P95":19.75},"102":{"P5":13.42,"P85":18.1,"P95":19.82},"103":{"P5":13.44,"P85":18.15,"P95":19.89},"104":{"P5":13.46,"P85":18.21,"P95":19.95},"105":{"P5":13.49,"P85":18.26,"P95":20.02},"106":{"P5":13.51,"P85":18.31,"P95":20.09},"107":{"P5":13.54,"P85":18.37,"P95":20.16},"108":{"P5":13.57,"P85":18.42,"P95":20.23},"109":{"P5":13.59,"P85":18.48,"P95":20.31},"110":{"P5":13.62,"P85":18.53,"P95":20.38},"111":{"P5":13.65,"P85":18.59,"P95":20.45},"112":{"P5":13.67,"P85":18.65,"P95":20.52},"113":{"P5":13.7,"P85":18.71,"P95":20.6},"114":{"P5":13.73,"P85":18.77,"P95":20.67},"115":{"P5":13.76,"P85":18.83,"P95":20.75},"116":{"P5":13.79,"P85":18.89,"P95":20.83},"117":{"P5":13.82,"P85":18.95,"P95":20.9},"118":{"P5":13.85,"P85":19.01,"P95":20.98},"119":{"P5":13.89,"P85":19.07,"P95":21.06},"120":{"P5":13.92,"P85":19.14,"P95":21.14},"121":{"P5":13.95,"P85":19.2,"P95":21.22},"122":{"P5":13.99,"P85":19.27,"P95":21.3},"123":{"P5":14.02,"P85":19.33,"P95":21.38},"124":{"P5":14.06,"P85":19.4,"P95":21.46},"125":{"P5":14.09,"P85":19.47,"P95":21.55},"126":{"P5":14.13,"P85":19.54,"P95":21.63},"127":{"P5":14.17,"P85":19.61,"P95":21.71},"128":{"P5":14.2,"P85":19.68,"P95":21.8},"129":{"P5":14.24,"P85":19.75,"P95":21.89},"130":{"P5":14.28,"P85":19.82,"P95":21.97},"131":{"P5":14.32,"P85":19.9,"P95":22.06},"132":{"P5":14.36,"P85":19.97,"P95":22.15},"133":{"P5":14.4,"P85":20.05,"P95":22.24},"134":{"P5":14.45,"P85":20.12,"P95":22.33},"135":{"P5":14.49,"P85":20.2,"P95":22.42},"136":{"P5":14.53,"P85":20.28,"P95":22.52},"137":{"P5":14.58,"P85":20.36,"P95":22.61},"138":{"P5":14.62,"P85":20.44,"P95":22.7},"139":{"P5":14.67,"P85":20.52,"P95":22.8},"140":{"P5":14.71,"P85":20.6,"P95":22.89},"141":{"P5":14.76,"P85":20.68,"P95":22.99},"142":{"P5":14.81,"P85":20.76,"P95":23.08},"143":{"P5":14.85,"P85":20.84,"P95":23.18},"144":{"P5":14.9,"P85":20.93,"P95":23.28},"145":{"P5":14.95,"P85":21.01,"P95":23.37},"146":{"P5":15.0,"P85":21.09,"P95":23.47},"147":{"P5":15.05,"P85":21.18,"P95":23.56},"148":{"P5":15.1,"P85":21.26,"P95":23.66},"149":{"P5":15.14,"P85":21.35,"P95":23.76},"150":{"P5":15.19,"P85":21.43,"P95":23.85},"151":{"P5":15.24,"P85":21.51,"P95":23.95},"152":{"P5":15.29,"P85":21.6,"P95":24.04},"153":{"P5":15.34,"P85":21.68,"P95":24.14},"154":{"P5":15.39,"P85":21.76,"P95":24.23},"155":{"P5":15.44,"P85":21.85,"P95":24.33},"156":{"P5":15.48,"P85":21.93,"P95":24.42},"157":{"P5":15.53,"P85":22.01,"P95":24.51},"158":{"P5":15.58,"P85":22.09,"P95":24.61},"159":{"P5":15.63,"P85":22.17,"P95":24.7},"160":{"P5":15.67,"P85":22.25,"P95":24.79},"161":{"P5":15.72,"P85":22.33,"P95":24.88},"162":{"P5":15.77,"P85":22.41,"P95":24.96},"163":{"P5":15.81,"P85":22.49,"P95":25.05},"164":{"P5":15.86,"P85":22.57,"P95":25.14},"165":{"P5":15.9,"P85":22.64,"P95":25.22},"166":{"P5":15.95,"P85":22.72,"P95":25.31},"167":{"P5":15.99,"P85":22.79,"P95":25.39},"168":{"P5":16.03,"P85":22.87,"P95":25.47},"169":{"P5":16.08,"P85":22.94,"P95":25.55},"170":{"P5":16.12,"P85":23.01,"P95":25.63},"171":{"P5":16.16,"P85":23.08,"P95":25.71},"172":{"P5":16.2,"P85":23.15,"P95":25.78},"173":{"P5":16.24,"P85":23.22,"P95":25.86},"174":{"P5":16.28,"P85":23.28,"P95":25.93},"175":{"P5":16.32,"P85":23.35,"P95":26.0},"176":{"P5":16.35,"P85":23.41,"P95":26.07},"177":{"P5":16.39,"P85":23.48,"P95":26.14},"178":{"P5":16.42,"P85":23.54,"P95":26.21},"179":{"P5":16.46,"P85":23.6,"P95":26.27},"180":{"P5":16.49,"P85":23.65,"P95":26.34},"181":{"P5":16.52,"P85":23.71,"P95":26.4},"182":{"P5":16.56,"P85":23.77,"P95":26.46},"183":{"P5":16.59,"P85":23.82,"P95":26.52},"184":{"P5":16.62,"P85":23.87,"P95":26.57},"185":{"P5":16.65,"P85":23.92,"P95":26.63},"186":{"P5":16.67,"P85":23.97,"P95":26.68},"187":{"P5":16.7,"P85":24.02,"P95":26.74},"188":{"P5":16.73,"P85":24.07,"P95":26.79},"189":{"P5":16.75,"P85":24.12,"P95":26.83},"190":{"P5":16.78,"P85":24.16,"P95":26.88},"191":{"P5":16.8,"P85":24.2,"P95":26.93},"192":{"P5":16.82,"P85":24.24,"P95":26.97},"193":{"P5":16.84,"P85":24.29,"P95":27.02},"194":{"P5":16.87,"P85":24.32,"P95":27.06},"195":{"P5":16.89,"P85":24.36,"P95":27.1},"196":{"P5":16.9,"P85":24.4,"P95":27.13},"197":{"P5":16.92,"P85":24.43,"P95":27.17},"198":{"P5":16.94,"P85":24.47,"P95":27.21},"199":{"P5":16.96,"P85":24.5,"P95":27.24},"200":{"P5":16.97,"P85":24.53,"P95":27.27},"201":{"P5":16.99,"P85":24.56,"P95":27.31},"202":{"P5":17.0,"P85":24.59,"P95":27.34},"203":{"P5":17.02,"P85":24.62,"P95":27.37},"204":{"P5":17.03,"P85":24.65,"P95":27.39},"205":{"P5":17.04,"P85":24.68,"P95":27.42},"206":{"P5":17.06,"P85":24.7,"P95":27.45},"207":{"P5":17.07,"P85":24.73,"P95":27.47},"208":{"P5":17.08,"P85":24.75,"P95":27.49},"209":{"P5":17.09,"P85":24.77,"P95":27.52},"210":{"P5":17.1,"P85":24.79,"P95":27.54},"211":{"P5":17.11,"P85":24.82,"P95":27.56},"212":{"P5":17.12,"P85":24.84,"P95":27.58},"213":{"P5":17.12,"P85":24.86,"P95":27.6},"214":{"P5":17.13,"P85":24.88,"P95":27.62},"215":{"P5":17.14,"P85":24.9,"P95":27.64},"216":{"P5":17.15,"P85":24.92,"P95":27.65},"217":{"P5":17.16,"P85":24.93,"P95":27.67},"218":{"P5":17.16,"P85":24.95,"P95":27.69},"219":{"P5":17.17,"P85":24.97,"P95":27.7},"220":{"P5":17.18,"P85":24.99,"P95":27.72},"221":{"P5":17.18,"P85":25.0,"P95":27.74},"222":{"P5":17.19,"P85":25.02,"P95":27.75},"223":{"P5":17.19,"P85":25.04,"P95":27.77},"224":{"P5":17.2,"P85":25.05,"P95":27.78},"225":{"P5":17.2,"P85":25.07,"P95":27.79},"226":{"P5":17.21,"P85":25.08,"P95":27.81},"227":{"P5":17.21,"P85":25.1,"P95":27.82},"228":{"P5":17.22,"P85":25.11,"P95":27.83}}};

/* === ŹRÓDŁO DANYCH BMI ============================================= */
let bmiSource = 'OLAF';            // 'OLAF' (domyślnie) lub 'WHO'
/* =================================================================== */
/* === BMI Percentile Enhancement === */
const LMS_BOYS={"24":[-0.6187,16.0189,0.07785],"25":[-0.584,15.98,0.07792],"26":[-0.5497,15.9414,0.078],"27":[-0.5166,15.9036,0.07808],"28":[-0.485,15.8667,0.07818],"29":[-0.4552,15.8306,0.07829],"30":[-0.4274,15.7953,0.07841],"31":[-0.4016,15.7606,0.07854],"32":[-0.3782,15.7267,0.07867],"33":[-0.3572,15.6934,0.07882],"34":[-0.3388,15.661,0.07897],"35":[-0.3231,15.6294,0.07914],"36":[-0.3101,15.5988,0.07931],"37":[-0.3,15.5693,0.0795],"38":[-0.2927,15.541,0.07969],"39":[-0.2884,15.514,0.0799],"40":[-0.2869,15.4885,0.08012],"41":[-0.2881,15.4645,0.08036],"42":[-0.2919,15.442,0.08061],"43":[-0.2981,15.421,0.08087],"44":[-0.3067,15.4013,0.08115],"45":[-0.3174,15.3827,0.08144],"46":[-0.3303,15.3652,0.08174],"47":[-0.3452,15.3485,0.08205],"48":[-0.3622,15.3326,0.08238],"49":[-0.3811,15.3174,0.08272],"50":[-0.4019,15.3029,0.08307],"51":[-0.4245,15.2891,0.08343],"52":[-0.4488,15.2759,0.0838],"53":[-0.4747,15.2633,0.08418],"54":[-0.5019,15.2514,0.08457],"55":[-0.5303,15.24,0.08496],"56":[-0.5599,15.2291,0.08536],"57":[-0.5905,15.2188,0.08577],"58":[-0.6223,15.2091,0.08617],"59":[-0.6552,15.2,0.08659],"60":[-0.6892,15.1916,0.087],"61":[-0.7387,15.2641,0.0839],"62":[-0.7621,15.2616,0.08414],"63":[-0.7856,15.2604,0.08439],"64":[-0.8089,15.2605,0.08464],"65":[-0.8322,15.2619,0.0849],"66":[-0.8554,15.2645,0.08516],"67":[-0.8785,15.2684,0.08543],"68":[-0.9015,15.2737,0.0857],"69":[-0.9243,15.2801,0.08597],"70":[-0.9471,15.2877,0.08625],"71":[-0.9697,15.2965,0.08653],"72":[-0.9921,15.3062,0.08682],"73":[-1.0144,15.3169,0.08711],"74":[-1.0365,15.3285,0.08741],"75":[-1.0584,15.3408,0.08771],"76":[-1.0801,15.354,0.08802],"77":[-1.1017,15.3679,0.08833],"78":[-1.123,15.3825,0.08865],"79":[-1.1441,15.3978,0.08898],"80":[-1.1649,15.4137,0.08931],"81":[-1.1856,15.4302,0.08964],"82":[-1.206,15.4473,0.08998],"83":[-1.2261,15.465,0.09033],"84":[-1.246,15.4832,0.09068],"85":[-1.2656,15.5019,0.09103],"86":[-1.2849,15.521,0.09139],"87":[-1.304,15.5407,0.09176],"88":[-1.3228,15.5608,0.09213],"89":[-1.3414,15.5814,0.09251],"90":[-1.3596,15.6023,0.09289],"91":[-1.3776,15.6237,0.09327],"92":[-1.3953,15.6455,0.09366],"93":[-1.4126,15.6677,0.09406],"94":[-1.4297,15.6903,0.09445],"95":[-1.4464,15.7133,0.09486],"96":[-1.4629,15.7368,0.09526],"97":[-1.479,15.7606,0.09567],"98":[-1.4947,15.7848,0.09609],"99":[-1.5101,15.8094,0.09651],"100":[-1.5252,15.8344,0.09693],"101":[-1.5399,15.8597,0.09735],"102":[-1.5542,15.8855,0.09778],"103":[-1.5681,15.9116,0.09821],"104":[-1.5817,15.9381,0.09864],"105":[-1.5948,15.9651,0.09907],"106":[-1.6076,15.9925,0.09951],"107":[-1.6199,16.0205,0.09994],"108":[-1.6318,16.049,0.10038],"109":[-1.6433,16.0781,0.10082],"110":[-1.6544,16.1078,0.10126],"111":[-1.6651,16.1381,0.1017],"112":[-1.6753,16.1692,0.10214],"113":[-1.6851,16.2009,0.10259],"114":[-1.6944,16.2333,0.10303],"115":[-1.7032,16.2665,0.10347],"116":[-1.7116,16.3004,0.10391],"117":[-1.7196,16.3351,0.10435],"118":[-1.7271,16.3704,0.10478],"119":[-1.7341,16.4065,0.10522],"120":[-1.7407,16.4433,0.10566],"121":[-1.7468,16.4807,0.10609],"122":[-1.7525,16.5189,0.10652],"123":[-1.7578,16.5578,0.10695],"124":[-1.7626,16.5974,0.10738],"125":[-1.767,16.6376,0.1078],"126":[-1.771,16.6786,0.10823],"127":[-1.7745,16.7203,0.10865],"128":[-1.7777,16.7628,0.10906],"129":[-1.7804,16.8059,0.10948],"130":[-1.7828,16.8497,0.10989],"131":[-1.7847,16.8941,0.1103],"132":[-1.7862,16.9392,0.1107],"133":[-1.7873,16.985,0.1111],"134":[-1.7881,17.0314,0.1115],"135":[-1.7884,17.0784,0.11189],"136":[-1.7884,17.1262,0.11228],"137":[-1.788,17.1746,0.11266],"138":[-1.7873,17.2236,0.11304],"139":[-1.7861,17.2734,0.11342],"140":[-1.7846,17.324,0.11379],"141":[-1.7828,17.3752,0.11415],"142":[-1.7806,17.4272,0.11451],"143":[-1.778,17.4799,0.11487],"144":[-1.7751,17.5334,0.11522],"145":[-1.7719,17.5877,0.11556],"146":[-1.7684,17.6427,0.1159],"147":[-1.7645,17.6985,0.11623],"148":[-1.7604,17.7551,0.11656],"149":[-1.7559,17.8124,0.11688],"150":[-1.7511,17.8704,0.1172],"151":[-1.7461,17.9292,0.11751],"152":[-1.7408,17.9887,0.11781],"153":[-1.7352,18.0488,0.11811],"154":[-1.7293,18.1096,0.11841],"155":[-1.7232,18.171,0.11869],"156":[-1.7168,18.233,0.11898],"157":[-1.7102,18.2955,0.11925],"158":[-1.7033,18.3586,0.11952],"159":[-1.6962,18.4221,0.11979],"160":[-1.6888,18.486,0.12005],"161":[-1.6811,18.5502,0.1203],"162":[-1.6732,18.6148,0.12055],"163":[-1.6651,18.6795,0.12079],"164":[-1.6568,18.7445,0.12102],"165":[-1.6482,18.8095,0.12125],"166":[-1.6394,18.8746,0.12148],"167":[-1.6304,18.9398,0.1217],"168":[-1.6211,19.005,0.12191],"169":[-1.6116,19.0701,0.12212],"170":[-1.602,19.1351,0.12233],"171":[-1.5921,19.2,0.12253],"172":[-1.5821,19.2648,0.12272],"173":[-1.5719,19.3294,0.12291],"174":[-1.5615,19.3937,0.1231],"175":[-1.551,19.4578,0.12328],"176":[-1.5403,19.5217,0.12346],"177":[-1.5294,19.5853,0.12363],"178":[-1.5185,19.6486,0.1238],"179":[-1.5074,19.7117,0.12396],"180":[-1.4961,19.7744,0.12412],"181":[-1.4848,19.8367,0.12428],"182":[-1.4733,19.8987,0.12443],"183":[-1.4617,19.9603,0.12458],"184":[-1.45,20.0215,0.12473],"185":[-1.4382,20.0823,0.12487],"186":[-1.4263,20.1427,0.12501],"187":[-1.4143,20.2026,0.12514],"188":[-1.4022,20.2621,0.12528],"189":[-1.39,20.3211,0.12541],"190":[-1.3777,20.3796,0.12554],"191":[-1.3653,20.4376,0.12567],"192":[-1.3529,20.4951,0.12579],"193":[-1.3403,20.5521,0.12591],"194":[-1.3277,20.6085,0.12603],"195":[-1.3149,20.6644,0.12615],"196":[-1.3021,20.7197,0.12627],"197":[-1.2892,20.7745,0.12638],"198":[-1.2762,20.8287,0.1265],"199":[-1.2631,20.8824,0.12661],"200":[-1.2499,20.9355,0.12672],"201":[-1.2366,20.9881,0.12683],"202":[-1.2233,21.04,0.12694],"203":[-1.2098,21.0914,0.12704],"204":[-1.1962,21.1423,0.12715],"205":[-1.1826,21.1925,0.12726],"206":[-1.1688,21.2423,0.12736],"207":[-1.155,21.2914,0.12746],"208":[-1.141,21.34,0.12756],"209":[-1.127,21.388,0.12767],"210":[-1.1129,21.4354,0.12777],"211":[-1.0986,21.4822,0.12787],"212":[-1.0843,21.5285,0.12797],"213":[-1.0699,21.5742,0.12807],"214":[-1.0553,21.6193,0.12816],"215":[-1.0407,21.6638,0.12826],"216":[-1.026,21.7077,0.12836],"217":[-1.0112,21.751,0.12845],"218":[-0.9962,21.7937,0.12855],"219":[-0.9812,21.8358,0.12864],"220":[-0.9661,21.8773,0.12874],"221":[-0.9509,21.9182,0.12883],"222":[-0.9356,21.9585,0.12893],"223":[-0.9202,21.9982,0.12902],"224":[-0.9048,22.0374,0.12911],"225":[-0.8892,22.076,0.1292],"226":[-0.8735,22.114,0.1293],"227":[-0.8578,22.1514,0.12939],"228":[-0.8419,22.1883,0.12948]};
const LMS_GIRLS={"24":[-0.5684,15.6881,0.08454],"25":[-0.5684,15.659,0.08452],"26":[-0.5684,15.6308,0.08449],"27":[-0.5684,15.6037,0.08446],"28":[-0.5684,15.5777,0.08444],"29":[-0.5684,15.5523,0.08443],"30":[-0.5684,15.5276,0.08444],"31":[-0.5684,15.5034,0.08448],"32":[-0.5684,15.4798,0.08455],"33":[-0.5684,15.4572,0.08467],"34":[-0.5684,15.4356,0.08484],"35":[-0.5684,15.4155,0.08506],"36":[-0.5684,15.3968,0.08535],"37":[-0.5684,15.3796,0.08569],"38":[-0.5684,15.3638,0.08609],"39":[-0.5684,15.3493,0.08654],"40":[-0.5684,15.3358,0.08704],"41":[-0.5684,15.3233,0.08757],"42":[-0.5684,15.3116,0.08813],"43":[-0.5684,15.3007,0.08872],"44":[-0.5684,15.2905,0.08931],"45":[-0.5684,15.2814,0.08991],"46":[-0.5684,15.2732,0.09051],"47":[-0.5684,15.2661,0.0911],"48":[-0.5684,15.2602,0.09168],"49":[-0.5684,15.2556,0.09227],"50":[-0.5684,15.2523,0.09286],"51":[-0.5684,15.2503,0.09345],"52":[-0.5684,15.2496,0.09403],"53":[-0.5684,15.2502,0.0946],"54":[-0.5684,15.2519,0.09515],"55":[-0.5684,15.2544,0.09568],"56":[-0.5684,15.2575,0.09618],"57":[-0.5684,15.2612,0.09665],"58":[-0.5684,15.2653,0.09709],"59":[-0.5684,15.2698,0.0975],"60":[-0.5684,15.2747,0.09789],"61":[-0.8886,15.2441,0.09692],"62":[-0.9068,15.2434,0.09738],"63":[-0.9248,15.2433,0.09783],"64":[-0.9427,15.2438,0.09829],"65":[-0.9605,15.2448,0.09875],"66":[-0.978,15.2464,0.0992],"67":[-0.9954,15.2487,0.09966],"68":[-1.0126,15.2516,0.10012],"69":[-1.0296,15.2551,0.10058],"70":[-1.0464,15.2592,0.10104],"71":[-1.063,15.2641,0.10149],"72":[-1.0794,15.2697,0.10195],"73":[-1.0956,15.276,0.10241],"74":[-1.1115,15.2831,0.10287],"75":[-1.1272,15.2911,0.10333],"76":[-1.1427,15.2998,0.10379],"77":[-1.1579,15.3095,0.10425],"78":[-1.1728,15.32,0.10471],"79":[-1.1875,15.3314,0.10517],"80":[-1.2019,15.3439,0.10562],"81":[-1.216,15.3572,0.10608],"82":[-1.2298,15.3717,0.10654],"83":[-1.2433,15.3871,0.107],"84":[-1.2565,15.4036,0.10746],"85":[-1.2693,15.4211,0.10792],"86":[-1.2819,15.4397,0.10837],"87":[-1.2941,15.4593,0.10883],"88":[-1.306,15.4798,0.10929],"89":[-1.3175,15.5014,0.10974],"90":[-1.3287,15.524,0.1102],"91":[-1.3395,15.5476,0.11065],"92":[-1.3499,15.5723,0.1111],"93":[-1.36,15.5979,0.11156],"94":[-1.3697,15.6246,0.11201],"95":[-1.379,15.6523,0.11246],"96":[-1.388,15.681,0.11291],"97":[-1.3966,15.7107,0.11335],"98":[-1.4047,15.7415,0.1138],"99":[-1.4125,15.7732,0.11424],"100":[-1.4199,15.8058,0.11469],"101":[-1.427,15.8394,0.11513],"102":[-1.4336,15.8738,0.11557],"103":[-1.4398,15.909,0.11601],"104":[-1.4456,15.9451,0.11644],"105":[-1.4511,15.9818,0.11688],"106":[-1.4561,16.0194,0.11731],"107":[-1.4607,16.0575,0.11774],"108":[-1.465,16.0964,0.11816],"109":[-1.4688,16.1358,0.11859],"110":[-1.4723,16.1759,0.11901],"111":[-1.4753,16.2166,0.11943],"112":[-1.478,16.258,0.11985],"113":[-1.4803,16.2999,0.12026],"114":[-1.4823,16.3425,0.12067],"115":[-1.4838,16.3858,0.12108],"116":[-1.485,16.4298,0.12148],"117":[-1.4859,16.4746,0.12188],"118":[-1.4864,16.52,0.12228],"119":[-1.4866,16.5663,0.12268],"120":[-1.4864,16.6133,0.12307],"121":[-1.4859,16.6612,0.12346],"122":[-1.4851,16.71,0.12384],"123":[-1.4839,16.7595,0.12422],"124":[-1.4825,16.81,0.1246],"125":[-1.4807,16.8614,0.12497],"126":[-1.4787,16.9136,0.12534],"127":[-1.4763,16.9667,0.12571],"128":[-1.4737,17.0208,0.12607],"129":[-1.4708,17.0757,0.12643],"130":[-1.4677,17.1316,0.12678],"131":[-1.4642,17.1883,0.12713],"132":[-1.4606,17.2459,0.12748],"133":[-1.4567,17.3044,0.12782],"134":[-1.4526,17.3637,0.12816],"135":[-1.4482,17.4238,0.12849],"136":[-1.4436,17.4847,0.12882],"137":[-1.4389,17.5464,0.12914],"138":[-1.4339,17.6088,0.12946],"139":[-1.4288,17.6719,0.12978],"140":[-1.4235,17.7357,0.13009],"141":[-1.418,17.8001,0.1304],"142":[-1.4123,17.8651,0.1307],"143":[-1.4065,17.9306,0.13099],"144":[-1.4006,17.9966,0.13129],"145":[-1.3945,18.063,0.13158],"146":[-1.3883,18.1297,0.13186],"147":[-1.3819,18.1967,0.13214],"148":[-1.3755,18.2639,0.13241],"149":[-1.3689,18.3312,0.13268],"150":[-1.3621,18.3986,0.13295],"151":[-1.3553,18.466,0.13321],"152":[-1.3483,18.5333,0.13347],"153":[-1.3413,18.6006,0.13372],"154":[-1.3341,18.6677,0.13397],"155":[-1.3269,18.7346,0.13421],"156":[-1.3195,18.8012,0.13445],"157":[-1.3121,18.8675,0.13469],"158":[-1.3046,18.9335,0.13492],"159":[-1.297,18.9991,0.13514],"160":[-1.2894,19.0642,0.13537],"161":[-1.2816,19.1289,0.13559],"162":[-1.2739,19.1931,0.1358],"163":[-1.2661,19.2567,0.13601],"164":[-1.2583,19.3197,0.13622],"165":[-1.2504,19.382,0.13642],"166":[-1.2425,19.4437,0.13662],"167":[-1.2345,19.5045,0.13681],"168":[-1.2266,19.5647,0.137],"169":[-1.2186,19.624,0.13719],"170":[-1.2107,19.6824,0.13738],"171":[-1.2027,19.74,0.13756],"172":[-1.1947,19.7966,0.13774],"173":[-1.1867,19.8523,0.13791],"174":[-1.1788,19.907,0.13808],"175":[-1.1708,19.9607,0.13825],"176":[-1.1629,20.0133,0.13841],"177":[-1.1549,20.0648,0.13858],"178":[-1.147,20.1152,0.13873],"179":[-1.139,20.1644,0.13889],"180":[-1.1311,20.2125,0.13904],"181":[-1.1232,20.2595,0.1392],"182":[-1.1153,20.3053,0.13934],"183":[-1.1074,20.3499,0.13949],"184":[-1.0996,20.3934,0.13963],"185":[-1.0917,20.4357,0.13977],"186":[-1.0838,20.4769,0.13991],"187":[-1.076,20.517,0.14005],"188":[-1.0681,20.556,0.14018],"189":[-1.0603,20.5938,0.14031],"190":[-1.0525,20.6306,0.14044],"191":[-1.0447,20.6663,0.14057],"192":[-1.0368,20.7008,0.1407],"193":[-1.029,20.7344,0.14082],"194":[-1.0212,20.7668,0.14094],"195":[-1.0134,20.7982,0.14106],"196":[-1.0055,20.8286,0.14118],"197":[-0.9977,20.858,0.1413],"198":[-0.9898,20.8863,0.14142],"199":[-0.9819,20.9137,0.14153],"200":[-0.974,20.9401,0.14164],"201":[-0.9661,20.9656,0.14176],"202":[-0.9582,20.9901,0.14187],"203":[-0.9503,21.0138,0.14198],"204":[-0.9423,21.0367,0.14208],"205":[-0.9344,21.0587,0.14219],"206":[-0.9264,21.0801,0.1423],"207":[-0.9184,21.1007,0.1424],"208":[-0.9104,21.1206,0.1425],"209":[-0.9024,21.1399,0.14261],"210":[-0.8944,21.1586,0.14271],"211":[-0.8863,21.1768,0.14281],"212":[-0.8783,21.1944,0.14291],"213":[-0.8703,21.2116,0.14301],"214":[-0.8623,21.2282,0.14311],"215":[-0.8542,21.2444,0.1432],"216":[-0.8462,21.2603,0.1433],"217":[-0.8382,21.2757,0.1434],"218":[-0.8301,21.2908,0.14349],"219":[-0.8221,21.3055,0.14359],"220":[-0.814,21.32,0.14368],"221":[-0.806,21.3341,0.14377],"222":[-0.798,21.348,0.14386],"223":[-0.7899,21.3617,0.14396],"224":[-0.7819,21.3752,0.14405],"225":[-0.7738,21.3884,0.14414],"226":[-0.7658,21.4014,0.14423],"227":[-0.7577,21.4143,0.14432],"228":[-0.7496,21.4269,0.14441]};

/* === OLAF BMI‑for‑age 3‑18 l. – L, M, S ============================ */
const OLAF_LMS_BOYS = {
  36: [-2.743, 15.7, 0.081],
  37: [-2.735, 15.7, 0.082],
  38: [-2.727, 15.7, 0.082],
  39: [-2.72, 15.6, 0.083],
  40: [-2.712, 15.6, 0.084],
  41: [-2.704, 15.6, 0.084],
  42: [-2.696, 15.6, 0.085],
  43: [-2.688, 15.6, 0.086],
  44: [-2.68, 15.6, 0.087],
  45: [-2.672, 15.6, 0.088],
  46: [-2.664, 15.6, 0.088],
  47: [-2.656, 15.6, 0.089],
  48: [-2.648, 15.6, 0.09],
  49: [-2.64, 15.6, 0.091],
  50: [-2.632, 15.6, 0.091],
  51: [-2.625, 15.6, 0.092],
  52: [-2.617, 15.5, 0.093],
  53: [-2.609, 15.5, 0.093],
  54: [-2.601, 15.5, 0.094],
  55: [-2.593, 15.5, 0.095],
  56: [-2.585, 15.5, 0.096],
  57: [-2.577, 15.5, 0.096],
  58: [-2.57, 15.5, 0.097],
  59: [-2.562, 15.5, 0.098],
  60: [-2.554, 15.5, 0.099],
  61: [-2.546, 15.5, 0.1],
  62: [-2.538, 15.5, 0.101],
  63: [-2.53, 15.5, 0.102],
  64: [-2.523, 15.5, 0.102],
  65: [-2.515, 15.5, 0.103],
  66: [-2.507, 15.5, 0.104],
  67: [-2.499, 15.5, 0.105],
  68: [-2.491, 15.5, 0.106],
  69: [-2.484, 15.6, 0.106],
  70: [-2.476, 15.6, 0.107],
  71: [-2.468, 15.6, 0.108],
  72: [-2.46, 15.6, 0.109],
  73: [-2.44, 15.6, 0.11],
  74: [-2.42, 15.6, 0.111],
  75: [-2.4, 15.6, 0.112],
  76: [-2.38, 15.7, 0.112],
  77: [-2.36, 15.7, 0.113],
  78: [-2.34, 15.7, 0.114],
  79: [-2.32, 15.7, 0.115],
  80: [-2.3, 15.7, 0.116],
  81: [-2.28, 15.8, 0.116],
  82: [-2.26, 15.8, 0.117],
  83: [-2.24, 15.8, 0.118],
  84: [-2.22, 15.8, 0.119],
  85: [-2.215, 15.8, 0.12],
  86: [-2.21, 15.9, 0.121],
  87: [-2.205, 15.9, 0.122],
  88: [-2.2, 15.9, 0.122],
  89: [-2.195, 16.0, 0.123],
  90: [-2.19, 16.0, 0.124],
  91: [-2.185, 16.0, 0.125],
  92: [-2.18, 16.1, 0.126],
  93: [-2.175, 16.1, 0.126],
  94: [-2.17, 16.1, 0.127],
  95: [-2.165, 16.2, 0.128],
  96: [-2.16, 16.2, 0.129],
  97: [-2.155, 16.2, 0.13],
  98: [-2.15, 16.3, 0.131],
  99: [-2.145, 16.3, 0.132],
 100: [-2.14, 16.3, 0.133],
 101: [-2.135, 16.4, 0.134],
 102: [-2.13, 16.4, 0.135],
 103: [-2.123, 16.4, 0.136],
 104: [-2.117, 16.5, 0.137],
 105: [-2.11, 16.5, 0.138],
 106: [-2.103, 16.6, 0.138],
 107: [-2.097, 16.6, 0.139],
 108: [-2.09, 16.7, 0.14],
 109: [-2.085, 16.7, 0.141],
 110: [-2.08, 16.8, 0.141],
 111: [-2.075, 16.8, 0.142],
 112: [-2.07, 16.8, 0.143],
 113: [-2.065, 16.9, 0.143],
 114: [-2.06, 16.9, 0.144],
 115: [-2.055, 16.9, 0.145],
 116: [-2.05, 17.0, 0.145],
 117: [-2.045, 17.0, 0.146],
 118: [-2.04, 17.0, 0.147],
 119: [-2.035, 17.1, 0.147],
 120: [-2.03, 17.1, 0.148],
 121: [-2.023, 17.1, 0.148],
 122: [-2.017, 17.2, 0.149],
 123: [-2.01, 17.2, 0.15],
 124: [-2.003, 17.2, 0.15],
 125: [-1.997, 17.3, 0.15],
 126: [-1.99, 17.3, 0.151],
 127: [-1.985, 17.4, 0.152],
 128: [-1.98, 17.4, 0.152],
 129: [-1.975, 17.5, 0.152],
 130: [-1.97, 17.5, 0.153],
 131: [-1.965, 17.6, 0.154],
 132: [-1.96, 17.6, 0.154],
 133: [-1.953, 17.6, 0.154],
 134: [-1.947, 17.7, 0.154],
 135: [-1.94, 17.7, 0.154],
 136: [-1.933, 17.7, 0.155],
 137: [-1.927, 17.8, 0.155],
 138: [-1.92, 17.8, 0.155],
 139: [-1.913, 17.8, 0.155],
 140: [-1.907, 17.9, 0.155],
 141: [-1.9, 18.0, 0.155],
 142: [-1.893, 18.0, 0.155],
 143: [-1.887, 18.0, 0.155],
 144: [-1.88, 18.1, 0.155],
 145: [-1.873, 18.1, 0.155],
 146: [-1.867, 18.2, 0.155],
 147: [-1.86, 18.2, 0.154],
 148: [-1.853, 18.2, 0.154],
 149: [-1.847, 18.3, 0.154],
 150: [-1.84, 18.3, 0.154],
 151: [-1.833, 18.4, 0.154],
 152: [-1.827, 18.4, 0.153],
 153: [-1.82, 18.5, 0.153],
 154: [-1.813, 18.5, 0.153],
 155: [-1.807, 18.6, 0.152],
 156: [-1.8, 18.6, 0.152],
 157: [-1.793, 18.7, 0.152],
 158: [-1.787, 18.7, 0.151],
 159: [-1.78, 18.8, 0.15],
 160: [-1.773, 18.8, 0.15],
 161: [-1.767, 18.8, 0.15],
 162: [-1.76, 18.9, 0.149],
 163: [-1.753, 19.0, 0.148],
 164: [-1.747, 19.0, 0.148],
 165: [-1.74, 19.0, 0.148],
 166: [-1.733, 19.1, 0.147],
 167: [-1.727, 19.2, 0.146],
 168: [-1.72, 19.2, 0.146],
 169: [-1.712, 19.2, 0.146],
 170: [-1.703, 19.3, 0.145],
 171: [-1.695, 19.4, 0.144],
 172: [-1.687, 19.4, 0.144],
 173: [-1.678, 19.4, 0.144],
 174: [-1.67, 19.5, 0.143],
 175: [-1.663, 19.6, 0.142],
 176: [-1.657, 19.6, 0.142],
 177: [-1.65, 19.6, 0.142],
 178: [-1.643, 19.7, 0.141],
 179: [-1.637, 19.8, 0.14],
 180: [-1.63, 19.8, 0.14],
 181: [-1.622, 19.8, 0.14],
 182: [-1.613, 19.9, 0.139],
 183: [-1.605, 20.0, 0.139],
 184: [-1.597, 20.0, 0.139],
 185: [-1.588, 20.0, 0.138],
 186: [-1.58, 20.1, 0.138],
 187: [-1.572, 20.2, 0.138],
 188: [-1.563, 20.2, 0.137],
 189: [-1.555, 20.2, 0.137],
 190: [-1.547, 20.3, 0.137],
 191: [-1.538, 20.3, 0.136],
 192: [-1.53, 20.4, 0.136],
 193: [-1.523, 20.5, 0.136],
 194: [-1.517, 20.5, 0.136],
 195: [-1.51, 20.6, 0.136],
 196: [-1.503, 20.7, 0.135],
 197: [-1.497, 20.7, 0.135],
 198: [-1.49, 20.8, 0.135],
 199: [-1.482, 20.8, 0.135],
 200: [-1.473, 20.9, 0.135],
 201: [-1.465, 21.0, 0.134],
 202: [-1.457, 21.0, 0.134],
 203: [-1.448, 21.0, 0.134],
 204: [-1.44, 21.1, 0.134],
 205: [-1.432, 21.2, 0.134],
 206: [-1.423, 21.2, 0.134],
 207: [-1.415, 21.3, 0.134],
 208: [-1.407, 21.4, 0.134],
 209: [-1.398, 21.4, 0.134],
 210: [-1.39, 21.5, 0.134],
 211: [-1.382, 21.6, 0.134],
 212: [-1.373, 21.6, 0.134],
 213: [-1.365, 21.6, 0.134],
 214: [-1.357, 21.7, 0.133],
 215: [-1.348, 21.8, 0.133],
 216: [-1.34, 21.8, 0.133]
};

const OLAF_LMS_GIRLS = {
  36: [-2.094, 15.6, 0.085],
  37: [-2.087, 15.6, 0.086],
  38: [-2.081, 15.6, 0.087],
  39: [-2.074, 15.6, 0.088],
  40: [-2.067, 15.5, 0.088],
  41: [-2.061, 15.5, 0.089],
  42: [-2.054, 15.5, 0.09],
  43: [-2.047, 15.5, 0.091],
  44: [-2.04, 15.5, 0.092],
  45: [-2.034, 15.5, 0.092],
  46: [-2.027, 15.5, 0.093],
  47: [-2.02, 15.5, 0.094],
  48: [-2.013, 15.5, 0.095],
  49: [-2.006, 15.5, 0.096],
  50: [-2.0, 15.5, 0.097],
  51: [-1.993, 15.5, 0.098],
  52: [-1.986, 15.5, 0.098],
  53: [-1.98, 15.5, 0.099],
  54: [-1.973, 15.5, 0.1],
  55: [-1.966, 15.5, 0.101],
  56: [-1.96, 15.5, 0.102],
  57: [-1.953, 15.4, 0.103],
  58: [-1.946, 15.4, 0.103],
  59: [-1.94, 15.4, 0.104],
  60: [-1.933, 15.4, 0.105],
  61: [-1.926, 15.4, 0.106],
  62: [-1.92, 15.4, 0.107],
  63: [-1.914, 15.4, 0.108],
  64: [-1.907, 15.5, 0.108],
  65: [-1.9, 15.5, 0.109],
  66: [-1.894, 15.5, 0.11],
  67: [-1.888, 15.5, 0.111],
  68: [-1.882, 15.5, 0.112],
  69: [-1.876, 15.5, 0.112],
  70: [-1.869, 15.5, 0.113],
  71: [-1.863, 15.5, 0.114],
  72: [-1.857, 15.5, 0.115],
  73: [-1.874, 15.5, 0.115],
  74: [-1.891, 15.5, 0.116],
  75: [-1.908, 15.5, 0.116],
  76: [-1.925, 15.5, 0.116],
  77: [-1.942, 15.5, 0.117],
  78: [-1.958, 15.5, 0.117],
  79: [-1.975, 15.5, 0.117],
  80: [-1.992, 15.5, 0.118],
  81: [-2.009, 15.5, 0.118],
  82: [-2.026, 15.5, 0.118],
  83: [-2.043, 15.5, 0.119],
  84: [-2.06, 15.5, 0.119],
  85: [-2.048, 15.5, 0.12],
  86: [-2.037, 15.6, 0.121],
  87: [-2.025, 15.6, 0.122],
  88: [-2.013, 15.6, 0.122],
  89: [-2.002, 15.7, 0.123],
  90: [-1.99, 15.7, 0.124],
  91: [-1.98, 15.8, 0.125],
  92: [-1.97, 15.8, 0.126],
  93: [-1.96, 15.8, 0.126],
  94: [-1.95, 15.9, 0.127],
  95: [-1.94, 16.0, 0.128],
  96: [-1.93, 16.0, 0.129],
  97: [-1.918, 16.0, 0.13],
  98: [-1.907, 16.1, 0.131],
  99: [-1.895, 16.1, 0.132],
 100: [-1.883, 16.1, 0.132],
 101: [-1.872, 16.2, 0.133],
 102: [-1.86, 16.2, 0.134],
 103: [-1.848, 16.2, 0.135],
 104: [-1.837, 16.3, 0.136],
 105: [-1.825, 16.3, 0.136],
 106: [-1.813, 16.3, 0.137],
 107: [-1.802, 16.4, 0.138],
 108: [-1.79, 16.4, 0.139],
 109: [-1.778, 16.4, 0.14],
 110: [-1.767, 16.5, 0.14],
 111: [-1.755, 16.5, 0.141],
 112: [-1.743, 16.6, 0.142],
 113: [-1.732, 16.6, 0.142],
 114: [-1.72, 16.7, 0.143],
 115: [-1.71, 16.7, 0.144],
 116: [-1.7, 16.8, 0.144],
 117: [-1.69, 16.8, 0.145],
 118: [-1.68, 16.8, 0.146],
 119: [-1.67, 17.0, 0.146],
 120: [-1.66, 16.9, 0.147],
 121: [-1.648, 17.0, 0.148],
 122: [-1.637, 17.0, 0.148],
 123: [-1.625, 17.0, 0.149],
 124: [-1.613, 17.1, 0.15],
 125: [-1.602, 17.2, 0.15],
 126: [-1.59, 17.2, 0.151],
 127: [-1.58, 17.2, 0.151],
 128: [-1.57, 17.3, 0.152],
 129: [-1.56, 17.4, 0.152],
 130: [-1.55, 17.4, 0.152],
 131: [-1.54, 17.4, 0.153],
 132: [-1.53, 17.5, 0.153],
 133: [-1.522, 17.6, 0.153],
 134: [-1.513, 17.6, 0.153],
 135: [-1.505, 17.6, 0.154],
 136: [-1.497, 17.7, 0.154],
 137: [-1.488, 17.8, 0.154],
 138: [-1.48, 17.8, 0.154],
 139: [-1.473, 17.8, 0.154],
 140: [-1.467, 17.9, 0.154],
 141: [-1.46, 18.0, 0.154],
 142: [-1.453, 18.0, 0.154],
 143: [-1.447, 18.0, 0.154],
 144: [-1.44, 18.1, 0.154],
 145: [-1.437, 18.2, 0.154],
 146: [-1.433, 18.2, 0.154],
 147: [-1.43, 18.2, 0.154],
 148: [-1.427, 18.3, 0.153],
 149: [-1.423, 18.3, 0.153],
 150: [-1.42, 18.4, 0.153],
 151: [-1.42, 18.5, 0.152],
 152: [-1.42, 18.5, 0.152],
 153: [-1.42, 18.6, 0.152],
 154: [-1.42, 18.7, 0.151],
 155: [-1.42, 18.7, 0.15],
 156: [-1.42, 18.8, 0.15],
 157: [-1.422, 18.8, 0.15],
 158: [-1.423, 18.9, 0.149],
 159: [-1.425, 19.0, 0.148],
 160: [-1.427, 19.0, 0.148],
 161: [-1.428, 19.0, 0.148],
 162: [-1.43, 19.1, 0.147],
 163: [-1.435, 19.2, 0.146],
 164: [-1.44, 19.2, 0.146],
 165: [-1.445, 19.2, 0.145],
 166: [-1.45, 19.3, 0.144],
 167: [-1.455, 19.3, 0.144],
 168: [-1.46, 19.4, 0.143],
 169: [-1.467, 19.4, 0.142],
 170: [-1.473, 19.5, 0.142],
 171: [-1.48, 19.5, 0.141],
 172: [-1.487, 19.6, 0.14],
 173: [-1.493, 19.6, 0.14],
 174: [-1.5, 19.7, 0.139],
 175: [-1.507, 19.7, 0.138],
 176: [-1.513, 19.8, 0.138],
 177: [-1.52, 19.8, 0.138],
 178: [-1.527, 19.8, 0.137],
 179: [-1.533, 19.9, 0.136],
 180: [-1.54, 19.9, 0.136],
 181: [-1.547, 19.9, 0.136],
 182: [-1.553, 20.0, 0.135],
 183: [-1.56, 20.0, 0.134],
 184: [-1.567, 20.0, 0.134],
 185: [-1.573, 20.1, 0.134],
 186: [-1.58, 20.1, 0.133],
 187: [-1.587, 20.1, 0.132],
 188: [-1.593, 20.2, 0.132],
 189: [-1.6, 20.2, 0.132],
 190: [-1.607, 20.2, 0.131],
 191: [-1.613, 20.3, 0.13],
 192: [-1.62, 20.3, 0.13],
 193: [-1.627, 20.3, 0.13],
 194: [-1.633, 20.3, 0.129],
 195: [-1.64, 20.4, 0.129],
 196: [-1.647, 20.4, 0.129],
 197: [-1.653, 20.4, 0.128],
 198: [-1.66, 20.4, 0.128],
 199: [-1.665, 20.4, 0.128],
 200: [-1.67, 20.4, 0.127],
 201: [-1.675, 20.4, 0.127],
 202: [-1.68, 20.5, 0.127],
 203: [-1.685, 20.5, 0.126],
 204: [-1.69, 20.5, 0.126],
 205: [-1.693, 20.5, 0.126],
 206: [-1.697, 20.5, 0.126],
 207: [-1.7, 20.6, 0.126],
 208: [-1.703, 20.6, 0.125],
 209: [-1.707, 20.6, 0.125],
 210: [-1.71, 20.6, 0.125],
 211: [-1.715, 20.6, 0.125],
 212: [-1.72, 20.6, 0.125],
 213: [-1.725, 20.6, 0.124],
 214: [-1.73, 20.7, 0.124],
 215: [-1.735, 20.7, 0.124],
 216: [-1.74, 20.7, 0.124]
};

// LMS WHO – masa ciała dla wieku 0–36 mies. (chłopcy i dziewczynki)  
const LMS_INFANT_WEIGHT_BOYS = {  
  "0":  [ 0.3487,  3.3464, 0.14602 ],   // 0 mies. – L, M, S  
  "1":  [ 0.2297,  4.4709, 0.13395 ],   // 1 mies.  
  "2":  [ 0.1970,  5.5675, 0.12385 ],  
  "3":  [ 0.1738,  6.3762, 0.11727 ],  
  "4":  [ 0.1553,  7.0023, 0.11316 ],  
  "5":  [ 0.1395,  7.5105, 0.11080 ],  
  "6":  [ 0.1257,  7.9340, 0.10958 ],  
  "7":  [ 0.1134,  8.2970, 0.10902 ],  
  "8":  [ 0.1021,  8.6151, 0.10882 ],  
  "9":  [ 0.0917,  8.9014, 0.10881 ],  
  "10": [ 0.0820,  9.1649, 0.10891 ],  
  "11": [ 0.0730,  9.4122, 0.10906 ],  
  "12": [ 0.0644,  9.6479, 0.10925 ],   // 12 mies. (1 rok)  
  "13": [ 0.0563,  9.8749, 0.10949 ],  
  "14": [ 0.0487, 10.0953, 0.10976 ],  
  "15": [ 0.0413, 10.3108, 0.11007 ],  
  "16": [ 0.0343, 10.5228, 0.11041 ],  
  "17": [ 0.0275, 10.7319, 0.11079 ],  
  "18": [ 0.0211, 10.9385, 0.11119 ],  
  "19": [ 0.0148, 11.1430, 0.11164 ],  
  "20": [ 0.0087, 11.3462, 0.11211 ],  
  "21": [ 0.0029, 11.5486, 0.11261 ],  
  "22": [ -0.0028, 11.7504, 0.11314 ],  
  "23": [ -0.0083, 11.9514, 0.11369 ],  
  "24": [ -0.0137, 12.1515, 0.11426 ],   // 24 mies. (2 lata)  
  "25": [ -0.0189, 12.3502, 0.11485 ],  
  "26": [ -0.0240, 12.5466, 0.11544 ],  
  "27": [ -0.0289, 12.7401, 0.11604 ],  
  "28": [ -0.0337, 12.9303, 0.11664 ],  
  "29": [ -0.0385, 13.1169, 0.11723 ],  
  "30": [ -0.0431, 13.3000, 0.11781 ],  
  "31": [ -0.0476, 13.4798, 0.11839 ],  
  "32": [ -0.0520, 13.6567, 0.11896 ],  
  "33": [ -0.0564, 13.8309, 0.11953 ],  
  "34": [ -0.0606, 14.0031, 0.12008 ],  
  "35": [ -0.0648, 14.1736, 0.12062 ]    // 35 mies.  
};  

const LMS_INFANT_WEIGHT_GIRLS = {  
  "0":  [ 0.3809,  3.2322, 0.14171 ],  
  "1":  [ 0.1714,  4.1873, 0.13724 ],  
  "2":  [ 0.0962,  5.1282, 0.13000 ],  
  "3":  [ 0.0402,  5.8458, 0.12619 ],  
  "4":  [ -0.0050,  6.4237, 0.12402 ],  
  "5":  [ -0.0430,  6.8985, 0.12274 ],  
  "6":  [ -0.0756,  7.2970, 0.12204 ],  
  "7":  [ -0.1039,  7.6422, 0.12178 ],  
  "8":  [ -0.1288,  7.9487, 0.12181 ],  
  "9":  [ -0.1507,  8.2254, 0.12199 ],  
  "10": [ -0.1700,  8.4800, 0.12223 ],  
  "11": [ -0.1872,  8.7192, 0.12247 ],  
  "12": [ -0.2024,  8.9481, 0.12268 ],  
  "13": [ -0.2158,  9.1699, 0.12283 ],  
  "14": [ -0.2278,  9.3870, 0.12294 ],  
  "15": [ -0.2384,  9.6008, 0.12299 ],  
  "16": [ -0.2478,  9.8124, 0.12303 ],  
  "17": [ -0.2562, 10.0226, 0.12306 ],  
  "18": [ -0.2637, 10.2315, 0.12309 ],  
  "19": [ -0.2703, 10.4393, 0.12315 ],  
  "20": [ -0.2762, 10.6464, 0.12323 ],  
  "21": [ -0.2815, 10.8534, 0.12335 ],  
  "22": [ -0.2862, 11.0608, 0.12350 ],  
  "23": [ -0.2903, 11.2688, 0.12369 ],  
  "24": [ -0.2941, 11.4775, 0.12390 ],  
  "25": [ -0.2975, 11.6864, 0.12414 ],  
  "26": [ -0.3005, 11.8947, 0.12441 ],  
  "27": [ -0.3032, 12.1015, 0.12472 ],  
  "28": [ -0.3057, 12.3059, 0.12506 ],  
  "29": [ -0.3080, 12.5073, 0.12545 ],  
  "30": [ -0.3101, 12.7055, 0.12587 ],  
  "31": [ -0.3120, 12.9006, 0.12633 ],  
  "32": [ -0.3138, 13.0930, 0.12683 ],  
  "33": [ -0.3155, 13.2837, 0.12737 ],  
  "34": [ -0.3171, 13.4731, 0.12794 ],  
  "35": [ -0.3186, 13.6618, 0.12855 ]  
};  

// LMS WHO – długość/wzrost dla wieku 0–36 mies. (chłopcy i dziewczynki)  
const LMS_INFANT_HEIGHT_BOYS = {  
  "0":  [ 1.0, 49.8842, 0.03795 ],   // długość urodzeniowa (cm)  
  "1":  [ 1.0, 54.7244, 0.03557 ],  
  "2":  [ 1.0, 58.4249, 0.03424 ],  
  "3":  [ 1.0, 61.4292, 0.03328 ],  
  "4":  [ 1.0, 63.8860, 0.03257 ],  
  "5":  [ 1.0, 65.9026, 0.03204 ],  
  "6":  [ 1.0, 67.6236, 0.03165 ],  
  "7":  [ 1.0, 69.1645, 0.03139 ],  
  "8":  [ 1.0, 70.5994, 0.03124 ],  
  "9":  [ 1.0, 71.9687, 0.03117 ],  
  "10": [ 1.0, 73.2812, 0.03118 ],  
  "11": [ 1.0, 74.5388, 0.03125 ],  
  "12": [ 1.0, 75.7488, 0.03137 ],   // 12 mies.  
  "13": [ 1.0, 76.9186, 0.03154 ],  
  "14": [ 1.0, 78.0497, 0.03174 ],  
  "15": [ 1.0, 79.1458, 0.03197 ],  
  "16": [ 1.0, 80.2113, 0.03222 ],  
  "17": [ 1.0, 81.2487, 0.03250 ],  
  "18": [ 1.0, 82.2587, 0.03279 ],  
  "19": [ 1.0, 83.2418, 0.03310 ],  
  "20": [ 1.0, 84.1996, 0.03342 ],  
  "21": [ 1.0, 85.1348, 0.03376 ],  
  "22": [ 1.0, 86.0477, 0.03410 ],  
  "23": [ 1.0, 86.9410, 0.03445 ],  
  "24": [ 1.0, 87.1161, 0.03507 ],   // 24 mies. (od tego punktu – wysokość stojąca)  
  "25": [ 1.0, 87.9720, 0.03542 ],  
  "26": [ 1.0, 88.8065, 0.03576 ],  
  "27": [ 1.0, 89.6197, 0.03610 ],  
  "28": [ 1.0, 90.4120, 0.03642 ],  
  "29": [ 1.0, 91.1828, 0.03674 ],  
  "30": [ 1.0, 91.9327, 0.03704 ],  
  "31": [ 1.0, 92.6631, 0.03733 ],  
  "32": [ 1.0, 93.3753, 0.03761 ],  
  "33": [ 1.0, 94.0711, 0.03787 ],  
  "34": [ 1.0, 94.7532, 0.03812 ],  
  "35": [ 1.0, 95.4236, 0.03836 ]  
};  

const LMS_INFANT_HEIGHT_GIRLS = {  
  "0":  [ 1.0, 49.1477, 0.03790 ],  
  "1":  [ 1.0, 53.6872, 0.03640 ],  
  "2":  [ 1.0, 57.0673, 0.03568 ],  
  "3":  [ 1.0, 59.8029, 0.03520 ],  
  "4":  [ 1.0, 62.0899, 0.03486 ],  
  "5":  [ 1.0, 64.0301, 0.03463 ],  
  "6":  [ 1.0, 65.7311, 0.03448 ],  
  "7":  [ 1.0, 67.2873, 0.03441 ],  
  "8":  [ 1.0, 68.7498, 0.03440 ],  
  "9":  [ 1.0, 70.1435, 0.03444 ],  
  "10": [ 1.0, 71.4818, 0.03452 ],  
  "11": [ 1.0, 72.7710, 0.03464 ],  
  "12": [ 1.0, 74.0150, 0.03479 ],  
  "13": [ 1.0, 75.2176, 0.03496 ],  
  "14": [ 1.0, 76.3817, 0.03514 ],  
  "15": [ 1.0, 77.5099, 0.03534 ],  
  "16": [ 1.0, 78.6055, 0.03555 ],  
  "17": [ 1.0, 79.6710, 0.03576 ],  
  "18": [ 1.0, 80.7079, 0.03598 ],  
  "19": [ 1.0, 81.7182, 0.03620 ],  
  "20": [ 1.0, 82.7036, 0.03643 ],  
  "21": [ 1.0, 83.6654, 0.03666 ],  
  "22": [ 1.0, 84.6040, 0.03688 ],  
  "23": [ 1.0, 85.5202, 0.03711 ],  
  "24": [ 1.0, 85.7153, 0.03764 ],  
  "25": [ 1.0, 86.5904, 0.03786 ],  
  "26": [ 1.0, 87.4462, 0.03808 ],  
  "27": [ 1.0, 88.2830, 0.03830 ],  
  "28": [ 1.0, 89.1004, 0.03851 ],  
  "29": [ 1.0, 89.8991, 0.03872 ],  
  "30": [ 1.0, 90.6797, 0.03893 ],  
  "31": [ 1.0, 91.4430, 0.03913 ],  
  "32": [ 1.0, 92.1906, 0.03933 ],  
  "33": [ 1.0, 92.9239, 0.03952 ],  
  "34": [ 1.0, 93.6444, 0.03971 ],  
  "35": [ 1.0, 94.3533, 0.03989 ]  
};  

// Wzrost-for-age (Height-for-age) – WHO LMS data, chłopcy 36–216 miesięcy
const LMS_HEIGHT_WHO_BOYS = {
  "36": [1, 96.0835, 0.03858],
  "37": [1, 96.7337, 0.03879],
  "38": [1, 97.3749, 0.03900],
  "39": [1, 98.0073, 0.03919],
  "40": [1, 98.6310, 0.03937],
  "41": [1, 99.2459, 0.03954],
  "42": [1, 99.8515, 0.03971],
  "43": [1, 100.4485, 0.03986],
  "44": [1, 101.0374, 0.04002],
  "45": [1, 101.6186, 0.04016],
  "46": [1, 102.1933, 0.04031],
  "47": [1, 102.7625, 0.04045],
  "48": [1, 103.3273, 0.04059],
  "49": [1, 103.8886, 0.04073],
  "50": [1, 104.4473, 0.04086],
  "51": [1, 105.0041, 0.04100],
  "52": [1, 105.5596, 0.04113],
  "53": [1, 106.1138, 0.04126],
  "54": [1, 106.6668, 0.04139],
  "55": [1, 107.2188, 0.04152],
  "56": [1, 107.7697, 0.04165],
  "57": [1, 108.3198, 0.04177],
  "58": [1, 108.8689, 0.04190],
  "59": [1, 109.4170, 0.04202],
  "60": [1, 109.9638, 0.04214],
  "61": [1, 110.2647, 0.04164],
  "62": [1, 110.8006, 0.04172],
  "63": [1, 111.3338, 0.04180],
  "64": [1, 111.8636, 0.04187],
  "65": [1, 112.3895, 0.04195],
  "66": [1, 112.9110, 0.04203],
  "67": [1, 113.4280, 0.04211],
  "68": [1, 113.9410, 0.04218],
  "69": [1, 114.4500, 0.04226],
  "70": [1, 114.9547, 0.04234],
  "71": [1, 115.4549, 0.04241],
  "72": [1, 115.9509, 0.04249],
  "73": [1, 116.4432, 0.04257],
  "74": [1, 116.9325, 0.04264],
  "75": [1, 117.4196, 0.04272],
  "76": [1, 117.9046, 0.04280],
  "77": [1, 118.3880, 0.04287],
  "78": [1, 118.8700, 0.04295],
  "79": [1, 119.3508, 0.04303],
  "80": [1, 119.8303, 0.04311],
  "81": [1, 120.3085, 0.04318],
  "82": [1, 120.7853, 0.04326],
  "83": [1, 121.2604, 0.04334],
  "84": [1, 121.7338, 0.04342],
  "85": [1, 122.2053, 0.04350],
  "86": [1, 122.6750, 0.04358],
  "87": [1, 123.1429, 0.04366],
  "88": [1, 123.6092, 0.04374],
  "89": [1, 124.0736, 0.04382],
  "90": [1, 124.5361, 0.04390],
  "91": [1, 124.9964, 0.04398],
  "92": [1, 125.4545, 0.04406],
  "93": [1, 125.9104, 0.04414],
  "94": [1, 126.3640, 0.04422],
  "95": [1, 126.8156, 0.04430],
  "96": [1, 127.2651, 0.04438],
  "97": [1, 127.7129, 0.04446],
  "98": [1, 128.1590, 0.04454],
  "99": [1, 128.6034, 0.04462],
  "100": [1, 129.0466, 0.04470],
  "101": [1, 129.4887, 0.04478],
  "102": [1, 129.9300, 0.04487],
  "103": [1, 130.3705, 0.04495],
  "104": [1, 130.8103, 0.04503],
  "105": [1, 131.2495, 0.04511],
  "106": [1, 131.6884, 0.04519],
  "107": [1, 132.1269, 0.04527],
  "108": [1, 132.5652, 0.04535],
  "109": [1, 133.0031, 0.04543],
  "110": [1, 133.4404, 0.04551],
  "111": [1, 133.8770, 0.04559],
  "112": [1, 134.3130, 0.04566],
  "113": [1, 134.7483, 0.04574],
  "114": [1, 135.1829, 0.04582],
  "115": [1, 135.6168, 0.04589],
  "116": [1, 136.0501, 0.04597],
  "117": [1, 136.4829, 0.04604],
  "118": [1, 136.9153, 0.04612],
  "119": [1, 137.3474, 0.04619],
  "120": [1, 137.7795, 0.04626],
  "121": [1, 138.2119, 0.04633],
  "122": [1, 138.6452, 0.04640],
  "123": [1, 139.0797, 0.04647],
  "124": [1, 139.5158, 0.04654],
  "125": [1, 139.9540, 0.04661],
  "126": [1, 140.3948, 0.04667],
  "127": [1, 140.8387, 0.04674],
  "128": [1, 141.2859, 0.04680],
  "129": [1, 141.7368, 0.04686],
  "130": [1, 142.1916, 0.04692],
  "131": [1, 142.6501, 0.04698],
  "132": [1, 143.1126, 0.04703],
  "133": [1, 143.5795, 0.04709],
  "134": [1, 144.0511, 0.04714],
  "135": [1, 144.5276, 0.04719],
  "136": [1, 145.0093, 0.04723],
  "137": [1, 145.4964, 0.04728],
  "138": [1, 145.9891, 0.04732],
  "139": [1, 146.4878, 0.04736],
  "140": [1, 146.9927, 0.04740],
  "141": [1, 147.5041, 0.04744],
  "142": [1, 148.0224, 0.04747],
  "143": [1, 148.5478, 0.04750],
  "144": [1, 149.0807, 0.04753],
  "145": [1, 149.6212, 0.04755],
  "146": [1, 150.1694, 0.04758],
  "147": [1, 150.7256, 0.04759],
  "148": [1, 151.2899, 0.04761],
  "149": [1, 151.8623, 0.04762],
  "150": [1, 152.4425, 0.04763],
  "151": [1, 153.0298, 0.04763],
  "152": [1, 153.6234, 0.04764],
  "153": [1, 154.2223, 0.04763],
  "154": [1, 154.8258, 0.04763],
  "155": [1, 155.4329, 0.04762],
  "156": [1, 156.0426, 0.04760],
  "157": [1, 156.6539, 0.04758],
  "158": [1, 157.2660, 0.04756],
  "159": [1, 157.8775, 0.04754],
  "160": [1, 158.4871, 0.04751],
  "161": [1, 159.0937, 0.04747],
  "162": [1, 159.6962, 0.04744],
  "163": [1, 160.2939, 0.04740],
  "164": [1, 160.8861, 0.04735],
  "165": [1, 161.4720, 0.04730],
  "166": [1, 162.0505, 0.04725],
  "167": [1, 162.6207, 0.04720],
  "168": [1, 163.1816, 0.04714],
  "169": [1, 163.7321, 0.04707],
  "170": [1, 164.2717, 0.04701],
  "171": [1, 164.7994, 0.04694],
  "172": [1, 165.3145, 0.04687],
  "173": [1, 165.8165, 0.04679],
  "174": [1, 166.3050, 0.04671],
  "175": [1, 166.7799, 0.04663],
  "176": [1, 167.2415, 0.04655],
  "177": [1, 167.6899, 0.04646],
  "178": [1, 168.1255, 0.04637],
  "179": [1, 168.5482, 0.04628],
  "180": [1, 168.9580, 0.04619],
  "181": [1, 169.3549, 0.04609],
  "182": [1, 169.7389, 0.04599],
  "183": [1, 170.1099, 0.04589],
  "184": [1, 170.4680, 0.04579],
  "185": [1, 170.8136, 0.04569],
  "186": [1, 171.1468, 0.04559],
  "187": [1, 171.4680, 0.04548],
  "188": [1, 171.7773, 0.04538],
  "189": [1, 172.0748, 0.04527],
  "190": [1, 172.3606, 0.04516],
  "191": [1, 172.6345, 0.04506],
  "192": [1, 172.8967, 0.04495],
  "193": [1, 173.1470, 0.04484],
  "194": [1, 173.3856, 0.04473],
  "195": [1, 173.6126, 0.04462],
  "196": [1, 173.8280, 0.04451],
  "197": [1, 174.0321, 0.04440],
  "198": [1, 174.2251, 0.04429],
  "199": [1, 174.4071, 0.04418],
  "200": [1, 174.5784, 0.04407],
  "201": [1, 174.7392, 0.04396],
  "202": [1, 174.8896, 0.04385],
  "203": [1, 175.0301, 0.04375],
  "204": [1, 175.1609, 0.04364],
  "205": [1, 175.2824, 0.04353],
  "206": [1, 175.3951, 0.04343],
  "207": [1, 175.4995, 0.04332],
  "208": [1, 175.5959, 0.04322],
  "209": [1, 175.6850, 0.04311],
  "210": [1, 175.7672, 0.04301],
  "211": [1, 175.8432, 0.04291],
  "212": [1, 175.9133, 0.04281],
  "213": [1, 175.9781, 0.04271],
  "214": [1, 176.0380, 0.04261],
  "215": [1, 176.0935, 0.04251],
  "216": [1, 176.1449, 0.04241]
};

// Wzrost-for-age – WHO LMS data, dziewczynki 36–216 miesięcy
const LMS_HEIGHT_WHO_GIRLS = {
  "36": [1, 95.0515, 0.04006],
  "37": [1, 95.7399, 0.04024],
  "38": [1, 96.4187, 0.04041],
  "39": [1, 97.0885, 0.04057],
  "40": [1, 97.7493, 0.04073],
  "41": [1, 98.4015, 0.04089],
  "42": [1, 99.0448, 0.04105],
  "43": [1, 99.6795, 0.04120],
  "44": [1, 100.3058, 0.04135],
  "45": [1, 100.9238, 0.04150],
  "46": [1, 101.5337, 0.04164],
  "47": [1, 102.1360, 0.04179],
  "48": [1, 102.7312, 0.04193],
  "49": [1, 103.3197, 0.04206],
  "50": [1, 103.9021, 0.04220],
  "51": [1, 104.4786, 0.04233],
  "52": [1, 105.0494, 0.04246],
  "53": [1, 105.6148, 0.04259],
  "54": [1, 106.1748, 0.04272],
  "55": [1, 106.7295, 0.04285],
  "56": [1, 107.2788, 0.04298],
  "57": [1, 107.8227, 0.04310],
  "58": [1, 108.3613, 0.04322],
  "59": [1, 108.8948, 0.04334],
  "60": [1, 109.4233, 0.04347],
  "61": [1, 109.6016, 0.04355],
  "62": [1, 110.1258, 0.04364],
  "63": [1, 110.6451, 0.04373],
  "64": [1, 111.1596, 0.04382],
  "65": [1, 111.6696, 0.04390],
  "66": [1, 112.1753, 0.04399],
  "67": [1, 112.6767, 0.04407],
  "68": [1, 113.1740, 0.04415],
  "69": [1, 113.6672, 0.04423],
  "70": [1, 114.1565, 0.04431],
  "71": [1, 114.6421, 0.04439],
  "72": [1, 115.1244, 0.04447],
  "73": [1, 115.6039, 0.04454],
  "74": [1, 116.0812, 0.04461],
  "75": [1, 116.5568, 0.04469],
  "76": [1, 117.0311, 0.04475],
  "77": [1, 117.5044, 0.04482],
  "78": [1, 117.9769, 0.04489],
  "79": [1, 118.4489, 0.04495],
  "80": [1, 118.9208, 0.04502],
  "81": [1, 119.3926, 0.04508],
  "82": [1, 119.8648, 0.04514],
  "83": [1, 120.3374, 0.04520],
  "84": [1, 120.8105, 0.04525],
  "85": [1, 121.2843, 0.04531],
  "86": [1, 121.7587, 0.04536],
  "87": [1, 122.2338, 0.04542],
  "88": [1, 122.7098, 0.04547],
  "89": [1, 123.1868, 0.04551],
  "90": [1, 123.6646, 0.04556],
  "91": [1, 124.1435, 0.04561],
  "92": [1, 124.6234, 0.04565],
  "93": [1, 125.1045, 0.04569],
  "94": [1, 125.5869, 0.04573],
  "95": [1, 126.0706, 0.04577],
  "96": [1, 126.5558, 0.04581],
  "97": [1, 127.0424, 0.04585],
  "98": [1, 127.5304, 0.04588],
  "99": [1, 128.0199, 0.04591],
  "100": [1, 128.5109, 0.04594],
  "101": [1, 129.0035, 0.04597],
  "102": [1, 129.4975, 0.04600],
  "103": [1, 129.9932, 0.04602],
  "104": [1, 130.4904, 0.04604],
  "105": [1, 130.9891, 0.04607],
  "106": [1, 131.4895, 0.04608],
  "107": [1, 131.9912, 0.04610],
  "108": [1, 132.4944, 0.04612],
  "109": [1, 132.9989, 0.04613],
  "110": [1, 133.5046, 0.04614],
  "111": [1, 134.0118, 0.04615],
  "112": [1, 134.5202, 0.04616],
  "113": [1, 135.0299, 0.04616],
  "114": [1, 135.5410, 0.04617],
  "115": [1, 136.0533, 0.04617],
  "116": [1, 136.5670, 0.04616],
  "117": [1, 137.0821, 0.04616],
  "118": [1, 137.5987, 0.04616],
  "119": [1, 138.1167, 0.04615],
  "120": [1, 138.6363, 0.04614],
  "121": [1, 139.1575, 0.04612],
  "122": [1, 139.6803, 0.04611],
  "123": [1, 140.2049, 0.04609],
  "124": [1, 140.7313, 0.04607],
  "125": [1, 141.2594, 0.04605],
  "126": [1, 141.7892, 0.04603],
  "127": [1, 142.3206, 0.04600],
  "128": [1, 142.8534, 0.04597],
  "129": [1, 143.3874, 0.04594],
  "130": [1, 143.9222, 0.04591],
  "131": [1, 144.4575, 0.04588],
  "132": [1, 144.9929, 0.04584],
  "133": [1, 145.5280, 0.04580],
  "134": [1, 146.0622, 0.04576],
  "135": [1, 146.5951, 0.04571],
  "136": [1, 147.1262, 0.04567],
  "137": [1, 147.6548, 0.04562],
  "138": [1, 148.1804, 0.04557],
  "139": [1, 148.7023, 0.04552],
  "140": [1, 149.2197, 0.04546],
  "141": [1, 149.7322, 0.04541],
  "142": [1, 150.2390, 0.04535],
  "143": [1, 150.7394, 0.04529],
  "144": [1, 151.2327, 0.04523],
  "145": [1, 151.7182, 0.04516],
  "146": [1, 152.1951, 0.04510],
  "147": [1, 152.6628, 0.04503],
  "148": [1, 153.1206, 0.04497],
  "149": [1, 153.5678, 0.04490],
  "150": [1, 154.0041, 0.04483],
  "151": [1, 154.4290, 0.04476],
  "152": [1, 154.8423, 0.04468],
  "153": [1, 155.2437, 0.04461],
  "154": [1, 155.6330, 0.04454],
  "155": [1, 156.0101, 0.04446],
  "156": [1, 156.3748, 0.04439],
  "157": [1, 156.7269, 0.04431],
  "158": [1, 157.0666, 0.04423],
  "159": [1, 157.3936, 0.04415],
  "160": [1, 157.7082, 0.04408],
  "161": [1, 158.0102, 0.04400],
  "162": [1, 158.2997, 0.04392],
  "163": [1, 158.5771, 0.04384],
  "164": [1, 158.8425, 0.04376],
  "165": [1, 159.0961, 0.04369],
  "166": [1, 159.3382, 0.04361],
  "167": [1, 159.5691, 0.04353],
  "168": [1, 159.7890, 0.04345],
  "169": [1, 159.9983, 0.04337],
  "170": [1, 160.1971, 0.04330],
  "171": [1, 160.3857, 0.04322],
  "172": [1, 160.5643, 0.04314],
  "173": [1, 160.7332, 0.04307],
  "174": [1, 160.8927, 0.04299],
  "175": [1, 161.0430, 0.04292],
  "176": [1, 161.1845, 0.04284],
  "177": [1, 161.3176, 0.04277],
  "178": [1, 161.4425, 0.04270],
  "179": [1, 161.5596, 0.04263],
  "180": [1, 161.6692, 0.04255],
  "181": [1, 161.7717, 0.04248],
  "182": [1, 161.8673, 0.04241],
  "183": [1, 161.9564, 0.04235],
  "184": [1, 162.0393, 0.04228],
  "185": [1, 162.1164, 0.04221],
  "186": [1, 162.1880, 0.04214],
  "187": [1, 162.2542, 0.04208],
  "188": [1, 162.3154, 0.04201],
  "189": [1, 162.3719, 0.04195],
  "190": [1, 162.4239, 0.04189],
  "191": [1, 162.4717, 0.04182],
  "192": [1, 162.5156, 0.04176],
  "193": [1, 162.5560, 0.04170],
  "194": [1, 162.5933, 0.04164],
  "195": [1, 162.6276, 0.04158],
  "196": [1, 162.6594, 0.04152],
  "197": [1, 162.6890, 0.04147],
  "198": [1, 162.7165, 0.04141],
  "199": [1, 162.7425, 0.04136],
  "200": [1, 162.7670, 0.04130],
  "201": [1, 162.7904, 0.04125],
  "202": [1, 162.8126, 0.04119],
  "203": [1, 162.8340, 0.04114],
  "204": [1, 162.8545, 0.04109],
  "205": [1, 162.8743, 0.04104],
  "206": [1, 162.8935, 0.04099],
  "207": [1, 162.9120, 0.04094],
  "208": [1, 162.9300, 0.04089],
  "209": [1, 162.9476, 0.04084],
  "210": [1, 162.9649, 0.04080],
  "211": [1, 162.9817, 0.04075],
  "212": [1, 162.9983, 0.04071],
  "213": [1, 163.0144, 0.04066],
  "214": [1, 163.0300, 0.04062],
  "215": [1, 163.0451, 0.04058],
  "216": [1, 163.0595, 0.04053]
};

// Masa ciała-for-age (Weight-for-age) – WHO LMS data, chłopcy 36–120 miesięcy
const LMS_WEIGHT_WHO_BOYS = {
  "36": [-0.0689, 14.3429, 0.12116],
  "37": [-0.0729, 14.5113, 0.12168],
  "38": [-0.0769, 14.6791, 0.12220],
  "39": [-0.0808, 14.8466, 0.12271],
  "40": [-0.0846, 15.0140, 0.12322],
  "41": [-0.0883, 15.1813, 0.12373],
  "42": [-0.0920, 15.3486, 0.12425],
  "43": [-0.0957, 15.5158, 0.12478],
  "44": [-0.0993, 15.6828, 0.12531],
  "45": [-0.1028, 15.8497, 0.12586],
  "46": [-0.1063, 16.0163, 0.12643],
  "47": [-0.1097, 16.1827, 0.12700],
  "48": [-0.1131, 16.3489, 0.12759],
  "49": [-0.1166, 16.5139, 0.12818],
  "50": [-0.1200, 16.6788, 0.12878],
  "51": [-0.1233, 16.8438, 0.12937],
  "52": [-0.1266, 17.0079, 0.12996],
  "53": [-0.1298, 17.1719, 0.13055],
  "54": [-0.1329, 17.3351, 0.13113],
  "55": [-0.1359, 17.4973, 0.13172],
  "56": [-0.1389, 17.6586, 0.13230],
  "57": [-0.1417, 17.8189, 0.13289],
  "58": [-0.1447, 17.9783, 0.13347],
  "59": [-0.1477, 18.1367, 0.13405],
  "60": [-0.1506, 18.2943, 0.13464],
  "61": [-0.2026, 18.5057, 0.12988],
  "62": [-0.2130, 18.6802, 0.13028],
  "63": [-0.2234, 18.8563, 0.13067],
  "64": [-0.2338, 19.0340, 0.13105],
  "65": [-0.2443, 19.2132, 0.13142],
  "66": [-0.2548, 19.3940, 0.13178],
  "67": [-0.2653, 19.5765, 0.13213],
  "68": [-0.2758, 19.7607, 0.13246],
  "69": [-0.2864, 19.9468, 0.13279],
  "70": [-0.2969, 20.1344, 0.13311],
  "71": [-0.3075, 20.3235, 0.13342],
  "72": [-0.3180, 20.5137, 0.13372],
  "73": [-0.3285, 20.7052, 0.13402],
  "74": [-0.3390, 20.8979, 0.13432],
  "75": [-0.3494, 21.0918, 0.13462],
  "76": [-0.3598, 21.2870, 0.13493],
  "77": [-0.3701, 21.4833, 0.13523],
  "78": [-0.3804, 21.6810, 0.13554],
  "79": [-0.3906, 21.8799, 0.13586],
  "80": [-0.4007, 22.0800, 0.13618],
  "81": [-0.4107, 22.2813, 0.13652],
  "82": [-0.4207, 22.4837, 0.13686],
  "83": [-0.4305, 22.6872, 0.13722],
  "84": [-0.4402, 22.8915, 0.13759],
  "85": [-0.4499, 23.0968, 0.13797],
  "86": [-0.4594, 23.3029, 0.13838],
  "87": [-0.4688, 23.5101, 0.13880],
  "88": [-0.4781, 23.7182, 0.13923],
  "89": [-0.4873, 23.9272, 0.13969],
  "90": [-0.4964, 24.1371, 0.14016],
  "91": [-0.5053, 24.3479, 0.14065],
  "92": [-0.5142, 24.5595, 0.14117],
  "93": [-0.5229, 24.7722, 0.14170],
  "94": [-0.5315, 24.9858, 0.14226],
  "95": [-0.5399, 25.2005, 0.14284],
  "96": [-0.5482, 25.4163, 0.14344],
  "97": [-0.5564, 25.6332, 0.14407],
  "98": [-0.5644, 25.8513, 0.14472],
  "99": [-0.5722, 26.0706, 0.14539],
  "100": [-0.5799, 26.2911, 0.14608],
  "101": [-0.5873, 26.5128, 0.14679],
  "102": [-0.5946, 26.7358, 0.14752],
  "103": [-0.6017, 26.9602, 0.14828],
  "104": [-0.6085, 27.1861, 0.14905],
  "105": [-0.6152, 27.4137, 0.14984],
  "106": [-0.6216, 27.6432, 0.15066],
  "107": [-0.6278, 27.8750, 0.15149],
  "108": [-0.6337, 28.1092, 0.15233],
  "109": [-0.6393, 28.3459, 0.15319],
  "110": [-0.6446, 28.5854, 0.15406],
  "111": [-0.6496, 28.8277, 0.15493],
  "112": [-0.6545, 29.0728, 0.15582],
  "113": [-0.6591, 29.3205, 0.15672],
  "114": [-0.6634, 29.5710, 0.15762],
  "115": [-0.6674, 29.8240, 0.15853],
  "116": [-0.6711, 30.0796, 0.15945],
  "117": [-0.6744, 30.3376, 0.16037],
  "118": [-0.6775, 30.5980, 0.16130],
  "119": [-0.6802, 30.8605, 0.16223],
  "120": [-0.6825, 31.1251, 0.16317]
};

// Masa ciała-for-age – WHO LMS data, dziewczynki 36–120 miesięcy
const LMS_WEIGHT_WHO_GIRLS = {
  "36": [-0.3201, 13.8503, 0.12919],
  "37": [-0.3216, 14.0385, 0.12988],
  "38": [-0.3230, 14.2265, 0.13059],
  "39": [-0.3243, 14.4140, 0.13135],
  "40": [-0.3257, 14.6010, 0.13213],
  "41": [-0.3270, 14.7873, 0.13293],
  "42": [-0.3283, 14.9727, 0.13376],
  "43": [-0.3296, 15.1573, 0.13460],
  "44": [-0.3309, 15.3410, 0.13545],
  "45": [-0.3322, 15.5240, 0.13630],
  "46": [-0.3335, 15.7064, 0.13716],
  "47": [-0.3348, 15.8882, 0.13800],
  "48": [-0.3361, 16.0697, 0.13884],
  "49": [-0.3374, 16.2511, 0.13968],
  "50": [-0.3387, 16.4322, 0.14051],
  "51": [-0.3400, 16.6133, 0.14132],
  "52": [-0.3414, 16.7942, 0.14213],
  "53": [-0.3427, 16.9748, 0.14293],
  "54": [-0.3440, 17.1551, 0.14371],
  "55": [-0.3453, 17.3347, 0.14448],
  "56": [-0.3466, 17.5136, 0.14525],
  "57": [-0.3479, 17.6916, 0.14600],
  "58": [-0.3492, 17.8686, 0.14675],
  "59": [-0.3505, 18.0445, 0.14748],
  "60": [-0.3518, 18.2193, 0.14821],
  "61": [-0.4681, 18.2579, 0.14295],
  "62": [-0.4711, 18.4329, 0.14350],
  "63": [-0.4742, 18.6073, 0.14404],
  "64": [-0.4773, 18.7811, 0.14459],
  "65": [-0.4803, 18.9545, 0.14514],
  "66": [-0.4834, 19.1276, 0.14569],
  "67": [-0.4864, 19.3004, 0.14624],
  "68": [-0.4894, 19.4730, 0.14679],
  "69": [-0.4924, 19.6455, 0.14735],
  "70": [-0.4954, 19.8180, 0.14790],
  "71": [-0.4984, 19.9908, 0.14845],
  "72": [-0.5013, 20.1639, 0.14900],
  "73": [-0.5043, 20.3377, 0.14955],
  "74": [-0.5072, 20.5124, 0.15010],
  "75": [-0.5100, 20.6885, 0.15065],
  "76": [-0.5129, 20.8661, 0.15120],
  "77": [-0.5157, 21.0457, 0.15175],
  "78": [-0.5185, 21.2274, 0.15230],
  "79": [-0.5213, 21.4113, 0.15284],
  "80": [-0.5240, 21.5979, 0.15339],
  "81": [-0.5268, 21.7872, 0.15393],
  "82": [-0.5294, 21.9795, 0.15448],
  "83": [-0.5321, 22.1751, 0.15502],
  "84": [-0.5347, 22.3740, 0.15556],
  "85": [-0.5372, 22.5762, 0.15610],
  "86": [-0.5398, 22.7816, 0.15663],
  "87": [-0.5423, 22.9904, 0.15717],
  "88": [-0.5447, 23.2025, 0.15770],
  "89": [-0.5471, 23.4180, 0.15823],
  "90": [-0.5495, 23.6369, 0.15876],
  "91": [-0.5518, 23.8593, 0.15928],
  "92": [-0.5541, 24.0853, 0.15980],
  "93": [-0.5563, 24.3149, 0.16032],
  "94": [-0.5585, 24.5482, 0.16084],
  "95": [-0.5606, 24.7853, 0.16135],
  "96": [-0.5627, 25.0262, 0.16186],
  "97": [-0.5647, 25.2710, 0.16237],
  "98": [-0.5667, 25.5197, 0.16287],
  "99": [-0.5686, 25.7721, 0.16337],
  "100": [-0.5704, 26.0284, 0.16386],
  "101": [-0.5722, 26.2883, 0.16435],
  "102": [-0.5740, 26.5519, 0.16483],
  "103": [-0.5757, 26.8190, 0.16532],
  "104": [-0.5773, 27.0896, 0.16579],
  "105": [-0.5789, 27.3635, 0.16626],
  "106": [-0.5804, 27.6406, 0.16673],
  "107": [-0.5819, 27.9208, 0.16719],
  "108": [-0.5833, 28.2040, 0.16764],
  "109": [-0.5847, 28.4901, 0.16809],
  "110": [-0.5859, 28.7791, 0.16854],
  "111": [-0.5872, 29.0711, 0.16897],
  "112": [-0.5885, 29.3663, 0.16941],
  "113": [-0.5897, 29.6640, 0.16983],
  "114": [-0.5908, 29.9641, 0.17025],
  "115": [-0.5919, 30.2665, 0.17067],
  "116": [-0.5929, 30.5713, 0.17108],
  "117": [-0.5938, 30.8783, 0.17148],
  "118": [-0.5947, 31.1875, 0.17188],
  "119": [-0.5954, 31.4987, 0.17227],
  "120": [-0.5961, 31.8119, 0.17266]
};
/* =================================================================== */
// LMS dla wagi chłopców 3–18 lat (klucz: wiek w miesiącach, wartość: [L, M, S])
const LMS_WEIGHT_BOYS = {
  "36":[-1.289,14.9,0.131],
  "42":[-1.35,16.0,0.131],
  "48":[-1.382,17.1,0.130],
  "54":[-1.379,18.1,0.134],
  "60":[-1.369,19.1,0.142],
  "66":[-1.384,20.3,0.152],
  "72":[-1.416,21.6,0.163],
  "84":[-1.3451,24.4425,0.1739],
  "96":[-1.2241,27.5948,0.1853],
  "108":[-1.1007,30.82,0.1969],
  "120":[-0.9733,34.2322,0.2077],
  "132":[-0.841,38.1082,0.2164],
  "144":[-0.7093,42.7117,0.2205],
  "156":[-0.6043,48.1026,0.2164],
  "168":[-0.5548,53.7776,0.2034],
  "180":[-0.5641,59.0021,0.1864],
  "192":[-0.6093,63.3307,0.1716],
  "204":[-0.6625,66.8807,0.1601],
  "216":[-0.711,69.8692,0.151]
};
// LMS dla wzrostu chłopców 3–18 lat
const LMS_HEIGHT_BOYS = {
  "36":[1.0,97.5,0.038],
  "42":[1.0,101.3,0.039],
  "48":[1.0,104.9,0.039],
  "54":[1.0,108.4,0.040],
  "60":[1.0,111.8,0.041],
  "66":[1.0,115.2,0.041],
  "72":[1.0,118.4,0.042],
  "84":[1.0,124.5763,0.0407],
  "96":[1.0,130.5084,0.0422],
  "108":[1.0,136.27,0.0441],
  "120":[1.0,141.4685,0.0457],
  "132":[1.0,146.749,0.0473],
  "144":[1.0,152.9406,0.0499],
  "156":[1.0,160.2044,0.0511],
  "168":[1.0,167.2116,0.0481],
  "180":[1.0,172.4996,0.0430],
  "192":[1.0,175.7266,0.0392],
  "204":[1.0,177.6036,0.0370],
  "216":[1.0,178.6756,0.0357]
};
// LMS dla wagi dziewczynek 3–18 lat
const LMS_WEIGHT_GIRLS = {
  "36":[-1.211,14.5,0.129],
  "42":[-1.202,15.5,0.135],
  "48":[-1.192,16.6,0.141],
  "54":[-1.182,17.6,0.147],
  "60":[-1.170,18.7,0.153],
  "66":[-1.157,19.8,0.158],
  "72":[-1.142,21.0,0.164],
  "84":[-1.0642,23.4756,0.1703],
  "96":[-1.0484,26.6216,0.1825],
  "108":[-0.9785,29.9233,0.1940],
  "120":[-0.8443,33.5526,0.2050],
  "132":[-0.6766,37.8737,0.2133],
  "144":[-0.5461,42.8172,0.2095],
  "156":[-0.5460,47.6669,0.1936],
  "168":[-0.7062,51.3003,0.1742],
  "180":[-0.9209,53.6394,0.1589],
  "192":[-1.0647,54.9580,0.1506],
  "204":[-1.1518,55.7267,0.1461],
  "216":[-1.2035,56.1779,0.1434]
};
// LMS dla wzrostu dziewczynek 3–18 lat
const LMS_HEIGHT_GIRLS = {
  "36":[1.0,96.3,0.040],
  "42":[1.0,100.1,0.040],
  "48":[1.0,103.7,0.040],
  "54":[1.0,107.2,0.041],
  "60":[1.0,110.5,0.042],
  "66":[1.0,113.8,0.042],
  "72":[1.0,117.0,0.043],
  "84":[1.0,123.0195,0.0419],
  "96":[1.0,129.3683,0.0440],
  "108":[1.0,135.2446,0.0457],
  "120":[1.0,140.7839,0.0471],
  "132":[1.0,147.1313,0.0472],
  "144":[1.0,153.8132,0.0444],
  "156":[1.0,159.0773,0.0406],
  "168":[1.0,162.2376,0.0380],
  "180":[1.0,163.7435,0.0368],
  "192":[1.0,164.3511,0.0363],
  "204":[1.0,164.7437,0.0360],
  "216":[1.0,165.0598,0.0358]
};

/* =========================================================================
   getChildLMS(sex, ageYears, param)
   ‑ zwraca [L,M,S] lub null
   ‑ automatycznie przełącza się na drugie źródło, jeśli w preferowanym brak danych
   ‑ weightUsedFallback == true  ⇒  waga bierze się z OLAF, bo WHO nie ma >10 l.
   ========================================================================= */
   function getChildLMS(sex, ageYears, param){
    const ageMonths = Math.round(ageYears * 12);
    if (ageMonths > 216) return null;                 // >18 l. – brak danych pediatrycznych
  
    /* -------- reset flagi fallbacku (ważne przy kolejnym wywołaniu) -------- */
    if (param === 'WT') weightUsedFallback = false;
  
    /* -------- wybór zbioru danych wg wieku, płci i preferencji suwaka ------- */
    const isBoy = (sex === 'M');
    const preferOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
  
    /* definicja pomocnicza */
    function dataset(source){
       if (param === 'WT'){                 // ----- MASA -----
           if (source === 'OLAF') return isBoy ? LMS_WEIGHT_BOYS : LMS_WEIGHT_GIRLS;
           /* WHO waga kończy się na 120 m‑cy (10 l.) */
           if (ageMonths > 120) return null;
           return isBoy ? LMS_WEIGHT_WHO_BOYS : LMS_WEIGHT_WHO_GIRLS;
       }else{                               // ----- WZROST -----
           if (source === 'OLAF') return isBoy ? LMS_HEIGHT_BOYS : LMS_HEIGHT_GIRLS;
           return isBoy ? LMS_HEIGHT_WHO_BOYS : LMS_HEIGHT_WHO_GIRLS;
       }
    }
  
    /* ----------------------- niemowlęta < 36 mies. ------------------------- */
    if (ageMonths < 36){
      const idx   = String(ageMonths);                         // klucz 0‑35
      if (param === 'WT'){
         const tbl = isBoy ? LMS_INFANT_WEIGHT_BOYS
                           : LMS_INFANT_WEIGHT_GIRLS;
         return tbl[idx] || null;                             // [L,M,S] albo null
      }
      const tbl =  isBoy ? LMS_INFANT_HEIGHT_BOYS
                         : LMS_INFANT_HEIGHT_GIRLS;
      return tbl[idx] || null;
    }
  
    /* ----------------------- dzieci 3‑18 lat -------------------------------- */
    let dataSet = preferOlaf ? dataset('OLAF') : dataset('WHO');
  
    /* jeśli brak danych w preferowanym źródle → spróbuj drugiego */
    if (!dataSet){
        dataSet = preferOlaf ? dataset('WHO') : dataset('OLAF');
        if (param === 'WT') weightUsedFallback = true;   // zapisz fakt fallbacku
    }
    if (!dataSet) return null;   // naprawdę brak w obu źródłach
  
    /* ----------- odczyt / interpolacja liniowa pomiędzy miesiącami ---------- */
    const key = String(ageMonths);
    if (dataSet[key]) return dataSet[key];
  
    const keys = Object.keys(dataSet).map(Number).sort((a,b)=>a-b);
    let lo = keys[0], hi = keys[keys.length-1];
    for (let k of keys){
        if (k <= ageMonths) lo = k;
        if (k >= ageMonths){ hi = k; break; }
    }
    if (!dataSet[lo] || !dataSet[hi]) return null;
    if (lo === hi) return dataSet[lo];
  
    const [L1,M1,S1] = dataSet[lo];
    const [L2,M2,S2] = dataSet[hi];
    const t = (ageMonths - lo) / (hi - lo);
    return [ L1 + t*(L2 - L1),  M1 + t*(M2 - M1),  S1 + t*(S2 - S1) ];
  }

function calcPercentileStats(value, sex, ageYears, param) {
  const lms = getChildLMS(sex, ageYears, param);
  if (!lms) return null;  // brak danych dla tego zakresu
  const [L, M, S] = lms;
  // Oblicz z-score wg formuły LMS
  let z;
  if (L !== 0) {
      z = (Math.pow(value / M, L) - 1) / (L * S);
  } else {
      z = Math.log(value / M) / S;
  }
  // Oblicz centyl na podstawie rozkładu normalnego
  const percentile = normalCDF(z) * 100;
  return { percentile: percentile, sd: z };
}

function centylWord(centTxt){
  // jeśli zawiera &lt;1 lub &gt;100 → użyj dopełniacza „centyla”
  if (centTxt.includes('&lt;') || centTxt.includes('&gt;')) return 'centyla';
  // domyślnie zostaw „centyl” (używane w karcie od lat)
  return 'centyl';
}

function formatCentile(p) {
  // identyczny próg jak w BMI: 0‑1% lub 99,9‑100%
  if (p >= 99.9) return '&gt;100';
  if (p <   1.0) return '&lt;1';
  // w pozostałych przypadkach pokażemy 1 cyfrę po kropce,
  // ale bez zbędnego „.0” (żeby 75,0 → 75)
  // w pozostałych przypadkach zaokrąglij wynik do pełnej wartości
  return Math.round(p).toString();
}

function erf(x) {
  // Abramowitz & Stegun formula 7.1.26
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function bmiPercentileChild(bmi, sex, months) {
  // Jeśli aktywne są dane Palczewskiej, korzystamy z ich siatek centylowych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    return bmiPercentileChildPal(bmi, sex, months);
  }
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L, M, S] = lms;
  const z = (L !== 0) ? (Math.pow(bmi / M, L) - 1) / (L * S) : Math.log(bmi / M) / S;
  return normalCDF(z) * 100;
}

function bmiCategoryChildExact(percentile){
  if(percentile === null) return '';
  // Zastosuj polskie progi (OLAF/Palczewska) dla źródła 'OLAF' lub 'PALCZEWSKA'
  const useOlaf = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA'));
  const normalHi = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity  = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
  // Niedowaga poniżej 5. centyla
  if (percentile < 5) return 'Niedowaga';
  // Prawidłowe BMI pomiędzy 5. a górną granicą normy
  if (percentile < normalHi) return 'Prawidłowe';
  // Nadwaga poniżej progu otyłości
  if (percentile < obesity) return 'Nadwaga';
  // Otyłość olbrzymia – ≥99,9 centyla (≈ 3 SD)
  if (percentile >= 99.9) return 'Otyłość olbrzymia';
  // Otyłość (obesity threshold ≤ percentyl < 99,9)
  return 'Otyłość';
}

document.getElementById('downloadPDF').addEventListener('click', async function() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const left = 18;
  let y = 18;

  // 1. Logo
  const logo = document.querySelector('header img');
  const toDataURL = url => fetch(url).then(r => r.blob()).then(blob => new Promise(res => {const reader=new FileReader();reader.onload=()=>res(reader.result);reader.readAsDataURL(blob);}));
  let logoData = '';
  try { logoData = await toDataURL(logo.src); } catch (e) { logoData = ''; }
  if(logoData) pdf.addImage(logoData, 'JPEG', left, y, 36, 18);

  // 2. Nagłówek
  pdf.setFont('helvetica','bold');
  pdf.setTextColor(0, 131, 141);
  pdf.setFontSize(19);
  pdf.text("VILDA CLINIC", left + 44, y + 10);
  pdf.setFontSize(13);
  pdf.setTextColor(66, 66, 66);
  pdf.setFont('helvetica','normal');
  pdf.text("Raport BMI & Metabolizmu", left + 44, y + 18);
  y += 28;

  // 3. Dane użytkownika – karta
  pdf.setFillColor(230, 245, 246);
  pdf.roundedRect(left, y, 174, 18, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("DANE PACJENTA", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(33,33,33);

  // Odczytaj dane użytkownika
  const yearsPdf   = parseInt(document.getElementById('age')?.value) || 0;
  const monthsPdfEl = document.getElementById('ageMonths');
  const monthsPdf  = monthsPdfEl ? parseInt(monthsPdfEl.value) || 0 : 0;
  const weight = parseFloat(document.getElementById('weight').value);
  const height = document.getElementById('height').value;
  const sex    = document.getElementById('sex').value === 'M' ? "Mężczyzna" : "Kobieta";
  // Sformatuj wiek w postaci „X lat Y mies.” jeśli podano miesiące
  let ageStr = `${yearsPdf} lat`;
  if(monthsPdf){
    ageStr += ` ${monthsPdf} mies.`;
  }
  y += 12;
  pdf.setFontSize(11);
  pdf.text(`Płeć: ${sex}`, left + 4, y + 8);
  pdf.text(`Wiek: ${ageStr}`, left + 50, y + 8);
  pdf.text(`Wzrost: ${height} cm`, left + 90, y + 8);
  pdf.text(`Waga: ${weight} kg`, left + 140, y + 8);
  y += 18;

  // 4. BMI/BMR – karta
  pdf.setFillColor(255,255,255);
  pdf.roundedRect(left, y, 174, 26, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("WYNIKI BMI / BMR", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(40,40,40);

  let bmrBox = document.getElementById('bmrInfo').innerText.replace(/\n+/g, '\n').trim();
  let bmiLines = pdf.splitTextToSize(bmrBox, 170);
  pdf.setFontSize(11);
  pdf.text(bmiLines, left + 4, y + 14);
  y += Math.max(26, 14 + bmiLines.length * 6);

  // 5. Droga do normy BMI – karta i tabela
  pdf.setFillColor(248, 251, 250);
  pdf.roundedRect(left, y, 174, 56, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("DROGA DO NORMY BMI", left + 3, y + 7);

  // Pobierz wyniki do normy
  let toNormBox = document.getElementById('toNormInfo').innerText.replace(/\n+/g, '\n').trim();
  let toNormHTML = document.getElementById('toNormInfo').innerHTML;

  // Tabela aktywności – dystans + czas
  let tbody = [];
  let kmRower20 = null;
  let acts = [
    {label: '🚴 Rower 16 km/h', key: 'Rower 16 km/h', speed: 16 },
    {label: '🚴‍♂️ Rower 20 km/h', key: 'Rower 20 km/h', speed: 20 },
    {label: '🏃 Bieganie', key: 'Bieganie', speed: 8 },
    {label: '🏊 Pływanie', key: 'Pływanie', speed: 3 },
    {label: '🚶 Spacer', key: 'Spacer', speed: 5 }
  ];
  acts.forEach(act=>{
    let regex = new RegExp(`${act.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?([\\d,.]+) (km|m)`);
    let found = regex.exec(toNormHTML);
    if(found){
      let dystans = parseFloat(found[1].replace(',', '.'));
      let jednostka = found[2];
      if(act.key==='Rower 20 km/h') kmRower20 = jednostka==='km' ? dystans : dystans/1000;
      // Czas
      let km = jednostka==='km'? dystans : dystans/1000;
      let time = km/act.speed;
      let hours = Math.floor(time);
      let mins = Math.round((time-hours)*60);
      let czasStr = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
      tbody.push([act.label, `${found[1]} ${jednostka}`, czasStr]);
    }
  });

  // Wydruk tekstowy podsumowania
  pdf.setFont('helvetica','normal');
  pdf.setFontSize(11);
  pdf.setTextColor(45,45,45);
  let drogaLines = pdf.splitTextToSize(toNormBox, 170);
  pdf.text(drogaLines, left + 4, y + 14);

  // Tabela
  y += 18;
  pdf.setFillColor(240,248,246);
  pdf.setDrawColor(200,225,225);
  pdf.roundedRect(left+2, y, 170, 7+tbody.length*7, 2,2,'F');
  pdf.setFont('helvetica','bold');
  pdf.setTextColor(0,131,141);
  pdf.setFontSize(11);
  pdf.text("Aktywność", left+7, y+5.5);
  pdf.text("Dystans", left+64, y+5.5);
  pdf.text("Czas", left+112, y+5.5);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(25,35,37);
  tbody.forEach((row,idx)=>{
    pdf.text(row[0], left+7, y+12+idx*7);
    pdf.text(row[1], left+64, y+12+idx*7);
    pdf.text(row[2], left+112, y+12+idx*7);
  });
  y += 7+tbody.length*7;

  // Ciekawostka dystansowa (rower 20 km/h)
  let trasy = [
    { miasta: "Poznań – Berlin", km: 240 },
    { miasta: "Kraków – Wiedeń", km: 330 },
    { miasta: "Gdańsk – Wilno", km: 400 },
    { miasta: "Wrocław – Budapeszt", km: 550 },
    { miasta: "Warszawa – Praga", km: 680 },
    { miasta: "Poznań – Paryż", km: 1200 },
    { miasta: "Warszawa – Paryż", km: 1600 },
    { miasta: "Kraków – Paryż", km: 1500 },
    { miasta: "Wrocław – Amsterdam", km: 1100 },
    { miasta: "Poznań – Barcelona", km: 2100 },
    { miasta: "Warszawa – Barcelona", km: 2300 },
    { miasta: "Warszawa – Rzym", km: 1800 }
  ];
  let przyklad = null;
  if(kmRower20){
    let found = trasy.find(t=>kmRower20 < t.km*1.15 && kmRower20 > t.km*0.85);
    if(!found) found = trasy.reduce((a,b)=>Math.abs(b.km-kmRower20)<Math.abs(a.km-kmRower20)?b:a);
    przyklad = found;
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0,131,141);
    pdf.text("Przykład:", left+3, y+10);
    pdf.setFont('helvetica','normal');
    pdf.setFontSize(11);
    pdf.setTextColor(30,30,30);
    pdf.text(`Aby osiągnąć BMI w normie, musisz przejechać rowerem (20 km/h) ok. ${kmRower20 ? kmRower20.toFixed(0) : "?"} km –`, left+3, y+16);
    pdf.text(`to tyle, ile z ${przyklad.miasta}!`, left+3, y+22);
    y += 22;
  } else {
    y += 6;
  }

  // 7. Sekcja spalania kalorii – karta
  pdf.setFillColor(255,255,255);
  pdf.roundedRect(left, y, 174, 24, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("SPALANIE KALORII (WYBRANE PRZEKĄSKI / POSIŁKI)", left + 3, y + 7);

  // Wyciągamy ile kalorii do spalenia:
  let kcal = 0;
  document.querySelectorAll('.snack-row').forEach(r=>{
    const key=r.querySelector('select').value;
    const qty=parseFloat(r.querySelector('input').value)||0;
    kcal += snacks[key]?.kcal*qty;
  });
  document.querySelectorAll('.meal-row').forEach(r=>{
    const key=r.querySelector('select').value;
    const qty=parseFloat(r.querySelector('input').value)||0;
    kcal += meals[key]?.kcal*qty;
  });

  // Tabela spalania kalorii dla każdej aktywności
  let spalanie = [];
  acts.forEach(act=>{
    let burnPerMin = (act.key==="Pływanie") ? (7.5 * 3.5 * weight) / 200 : (act.speed===3? (7.5 * 3.5 * weight)/200 : (act.speed>=5 ? (act.speed>=16? (6 + (act.speed-16)/4*2)*3.5*weight/200 : 3*3.5*weight/200) : 3*3.5*weight/200)); // uproszczone
    let minutes = kcal / burnPerMin;
    let h = Math.floor(minutes/60);
    let m = Math.round(minutes%60);
    let timeStr = h > 0 ? `${h} h ${m} min` : `${m} min`;
    spalanie.push([act.label, timeStr]);
  });

  pdf.setFont('helvetica','normal');
  pdf.setFontSize(11);
  pdf.setTextColor(35,35,35);
  pdf.text(`Całkowita ilość wybranych kalorii: ${Math.round(kcal)} kcal`, left + 4, y + 14);

  // Mini tabela
  y += 8;
  pdf.setFillColor(240,248,246);
  pdf.roundedRect(left+2, y, 170, 7+spalanie.length*7, 2,2,'F');
  pdf.setFont('helvetica','bold');
  pdf.setTextColor(0,131,141);
  pdf.setFontSize(11);
  pdf.text("Aktywność", left+7, y+5.5);
  pdf.text("Czas do spalenia", left+74, y+5.5);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(25,35,37);
  spalanie.forEach((row,idx)=>{
    pdf.text(row[0], left+7, y+12+idx*7);
    pdf.text(row[1], left+74, y+12+idx*7);
  });
  y += 7+spalanie.length*7;

  // 8. Data i stopka
  y = Math.max(y + 12, 270);
  pdf.setFontSize(10);
  pdf.setTextColor(140,160,165);
  pdf.text("Wygenerowano automatycznie przez kalkulator Vilda Clinic", left, y + 10);
  pdf.setFontSize(9);
  pdf.text("vildaclinic.pl", left + 142, y + 10);

  pdf.save("Raport_BMI_VildaClinic.pdf");
});

/**
 * Aktualizuje widoczność sekcji „Podsumowanie metaboliczne”.
 * Sekcja jest widoczna tylko, gdy użytkownik podał minimalny zestaw danych: wiek, wagę oraz wzrost.
 */
function updateMetabolicSummaryVisibility() {
  const section = document.getElementById('metabolicSummarySection');
  if (!section) return;
  // Wartości wieku – korzystamy z funkcji getAgeDecimal(), która sumuje lata i miesiące.
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  if (ageYears > 0 && weightVal > 0 && heightVal > 0) {
    // pokaż przycisk
    section.style.display = 'block';
    // Dodaj klasę animacji wejścia przy pierwszym pokazaniu
    if (!section.classList.contains('animate-in')) {
      section.classList.add('animate-in');
    }
  } else {
    // ukryj przycisk
    section.style.display = 'none';
  }
}

/**
 * Generuje tekstowy raport „Podsumowanie metaboliczne” na podstawie bieżących danych i wyników obliczeń.
 * Wyniki są umieszczane w oddzielnych liniach. W razie braku konkretnych danych dany element jest pomijany.
 * Funkcja wykorzystuje globalne zmienne i funkcje do ponownego obliczenia centyli wagi, wzrostu i BMI,
 * a także odczytuje wyniki z modułów ciśnienia krwi, obwodów oraz zaawansowanego wzrostu.
 * @returns {string} Tekst podsumowania, gotowy do skopiowania do schowka.
 */
function generateMetabolicSummary() {
  const lines = [];
  // Odczytaj dane wejściowe
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sexEl = document.getElementById('sex');
  const sexVal = sexEl ? sexEl.value : 'M';
  // Tryb profesjonalny
  const pro = (typeof window !== 'undefined' && window.professionalMode) ? window.professionalMode : false;

  // Warunki minimalne: waga, wzrost i wiek
  if (ageYears > 0 && weightVal > 0 && heightVal > 0) {
    // Oblicz statystyki wagi i wzrostu (percentyl i z-score)
    let statsW, statsH;
    const usePal = (typeof bmiSource !== 'undefined' &&
                   (bmiSource === 'PALCZEWSKA' ||
                    (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
    if (usePal) {
      statsW = calcPercentileStatsPal(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
    } else {
      statsW = calcPercentileStats(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
    }
    // Oblicz wartości graniczne 3. i 97. centyla dla wagi i wzrostu.
    // Są one używane do wyświetlania, ile kilogramów lub centymetrów brakuje do 3. centyla
    // oraz o ile dany parametr przekracza 97. centyl. Wartości te zależą od wyboru
    // siatek centylowych (Palczewska/OLAF/WHO) i wieku dziecka.
    let w3, w97, h3, h97;
    const monthsWH = Math.round(ageYears * 12);
    if (statsW && statsH) {
      if (usePal) {
        // Skorzystaj z siatek Palczewskiej dla granicznych centyli
        w3  = getPalCentile(sexVal, monthsWH, 3, 'WT');
        w97 = getPalCentile(sexVal, monthsWH, 97, 'WT');
        h3  = getPalCentile(sexVal, monthsWH, 3, 'HT');
        h97 = getPalCentile(sexVal, monthsWH, 97, 'HT');
      } else {
        // Użyj funkcji LMS (WHO/OLAF) dla obliczenia wartości granicznych
        const lmsW = getChildLMS(sexVal, ageYears, 'WT');
        if (lmsW) {
          w3 = (lmsW[0] !== 0)
             ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z3, 1 / lmsW[0])
             : lmsW[1] * Math.exp(lmsW[2] * Z3);
          w97 = (lmsW[0] !== 0)
              ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z97, 1 / lmsW[0])
              : lmsW[1] * Math.exp(lmsW[2] * Z97);
        }
        const lmsH = getChildLMS(sexVal, ageYears, 'HT');
        if (lmsH) {
          h3 = (lmsH[0] !== 0)
             ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z3, 1 / lmsH[0])
             : lmsH[1] * Math.exp(lmsH[2] * Z3);
          h97 = (lmsH[0] !== 0)
              ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z97, 1 / lmsH[0])
              : lmsH[1] * Math.exp(lmsH[2] * Z97);
        }
      }
    }
    // Waga
    if (statsW && typeof statsW.percentile === 'number') {
      // Format percentyl tak, aby skrajne wartości (<1, >99,9) były wyświetlane jako "<1" lub ">100".
      let percStr = formatCentile(statsW.percentile);
      // Określ właściwy rodzaj rzeczownika („centyl” vs „centyla”) na podstawie zakodowanych znaków
      let word = centylWord(percStr);
      // Zamień encje HTML na zwykłe znaki w tekście podsumowania
      let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      let line = `Waga: ${decoded} ${word}`;
      if (pro && typeof statsW.sd === 'number' && !isNaN(statsW.sd)) {
        line += ` (Z‑score = ${statsW.sd.toFixed(2)})`;
      }
      // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile kg brakuje do 3. centyla
      const roundedWeightCent = Math.round(statsW.percentile);
      if (typeof w3 === 'number' && roundedWeightCent <= 2) {
        // używamy zwykłej spacji do oddzielenia jednostki od liczby, aby uniknąć niewidzialnych znaków
        line += `, brakuje ${(w3 - weightVal).toFixed(1)} kg do 3 centyla`;
      }
      // Dla wartości ≥98. centyla podaj, o ile kilogramów przekracza 97. centyl
      if (typeof w97 === 'number' && statsW.percentile >= 98) {
        line += `, +${(weightVal - w97).toFixed(1)} kg ponad 97 centyl`;
      }
      lines.push(line);

    }
    // Wzrost
    if (statsH && typeof statsH.percentile === 'number') {
      let percStr = formatCentile(statsH.percentile);
      let word = centylWord(percStr);
      let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      let line = `Wzrost: ${decoded} ${word}`;
      if (pro && typeof statsH.sd === 'number' && !isNaN(statsH.sd)) {
        line += ` (Z‑score = ${statsH.sd.toFixed(2)})`;
      }
      // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile cm brakuje do 3. centyla
      const roundedHeightCent = Math.round(statsH.percentile);
        if (typeof h3 === 'number' && roundedHeightCent <= 2) {
        // stosujemy zwykłe spacje zamiast wąskiej spacji, aby poprawić kompatybilność z edytorami
        line += `, brakuje ${(h3 - heightVal).toFixed(1)} cm do 3 centyla`;
      }
      // Dla wartości ≥98. centyla podaj, o ile centymetrów przekracza 97. centyl
      if (typeof h97 === 'number' && statsH.percentile >= 98) {
        line += `, +${(heightVal - h97).toFixed(1)} cm ponad 97 centyl`;
      }
      lines.push(line);
    }
    // BMI
    const bmi = BMI(weightVal, heightVal);
    if (bmi && !isNaN(bmi)) {
      const months = Math.round(ageYears * 12);
      let bmiPerc = null;
      // Oblicz percentyl BMI dziecka, jeśli w wieku 0–18 lat
      if (ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
        bmiPerc = bmiPercentileChild(bmi, sexVal, months);
      }
      let line = `BMI: ${bmi.toFixed(1)}`;
      if (typeof bmiPerc === 'number') {
        // BMI percentyl również formatujemy przy użyciu formatCentile, aby zachować spójność ze wzrostem i wagą
        let percStrBmi = formatCentile(bmiPerc);
        let wordBmi   = centylWord(percStrBmi);
        let decodedBmi = percStrBmi.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        line += ` – ${decodedBmi} ${wordBmi}`;
      }
      // Oblicz z-score BMI w trybie profesjonalnym
      if (pro && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
        const bmiZ = bmiZscore(bmi, sexVal, months);
        if (bmiZ !== null && !isNaN(bmiZ)) {
          line += ` (Z‑score = ${bmiZ.toFixed(2)})`;
        }
      }
      lines.push(line);
    }
    // Powierzchnia ciała (BSA)
    // Niektóre moduły mogą nie eksportować funkcji BSA_Haycock do zasięgu globalnego,
    // co powoduje ReferenceError podczas wywołania generateMetabolicSummary().
    // Definiujemy funkcję pomocniczą bsaFunc: jeśli istnieje globalna
    // funkcja BSA_Haycock, użyjemy jej; w przeciwnym razie obliczamy BSA
    // bezpośrednio wzorem Haycocka.
    const bsaFunc = (typeof BSA_Haycock === 'function') ? BSA_Haycock : function(weight, height){
      return 0.024265 * Math.pow(weight, 0.5378) * Math.pow(height, 0.3964);
    };
    const bsa = bsaFunc(weightVal, heightVal);
    if (bsa && !isNaN(bsa)) {
      lines.push(`Pow. ciała: ${bsa.toFixed(2)} m²`);
    }
    // Wskaźnik Cole’a
    if (typeof window.colePercentValue === 'number' && !isNaN(window.colePercentValue)) {
      lines.push(`Wskaźnik Cole’a: ${window.colePercentValue.toFixed(1)}%`);
    }
  }
  // Ciśnienie – odczytaj globalne zmienne ustawione przez bp_module.js
  if (typeof window.percSbp === 'number' && !isNaN(window.percSbp)) {
    let line = `Ciśnienie skurczowe: ${Math.round(window.percSbp)} centyl`;
    if (pro && typeof window.zSbp === 'number' && !isNaN(window.zSbp)) {
      line += ` (Z‑score = ${window.zSbp.toFixed(2)})`;
    }
    lines.push(line);
  }
  if (typeof window.percDbp === 'number' && !isNaN(window.percDbp)) {
    let line = `Ciśnienie rozkurczowe: ${Math.round(window.percDbp)} centyl`;
    if (pro && typeof window.zDbp === 'number' && !isNaN(window.zDbp)) {
      line += ` (Z‑score = ${window.zDbp.toFixed(2)})`;
    }
    lines.push(line);
  }
  // Obwód głowy i klatki piersiowej – ustawiane przez circumference_module.js
  if (typeof window.headCircPercentile === 'number' && isFinite(window.headCircPercentile)) {
    let line = `Obwód głowy: ${Math.round(window.headCircPercentile)} centyl`;
    if (pro && typeof window.headCircSD === 'number' && isFinite(window.headCircSD)) {
      line += ` (Z‑score = ${window.headCircSD.toFixed(2)})`;
    }
    lines.push(line);
  }
  if (typeof window.chestCircPercentile === 'number' && isFinite(window.chestCircPercentile)) {
    let line = `Obwód klatki piersiowej: ${Math.round(window.chestCircPercentile)} centyl`;
    if (pro && typeof window.chestCircSD === 'number' && isFinite(window.chestCircSD)) {
      line += ` (Z‑score = ${window.chestCircSD.toFixed(2)})`;
    }
    lines.push(line);
  }
  // Tempo wzrastania i potencjał wzrostowy – z advancedGrowthData
  const agd = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
  if (agd) {
    // Tempo wzrastania
    // Sprawdź, czy jest dostępna wartość tempa; oryginalny kod pomija 0 jako wartość fałszywą,
    // więc tutaj również stosujemy to ograniczenie, aby nie pokazywać „0 cm/rok” w podsumowaniu.
    if (agd.growthVelocity && !isNaN(agd.growthVelocity)) {
      // Jeśli w obliczeniach zaawansowanych wykorzystano okno ostatniego roku (6–15 mies.),
      // to traktujemy tempo jako „aktualne” i podajemy liczbę miesięcy, z której zostało wyliczone.
      if (agd.growthVelocityUsedLastYear) {
        // growthVelocityGapM określa dokładną liczbę miesięcy odstępu między bieżącym pomiarem a użytym poprzednim.
        const m = (typeof agd.growthVelocityGapM === 'number' && agd.growthVelocityGapM >= 6) ? agd.growthVelocityGapM : null;
        const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
        lines.push(`Aktualne tempo wzrastania${monthInfo}: ${agd.growthVelocity.toFixed(1)} cm/rok`);
      } else {
        // W przeciwnym razie wyświetlamy ogólne tempo wzrastania wraz z kontekstem (średnia z okresu), jeśli jest dostępny.
        let ctxStr = '';
        if (agd.growthVelocityContext) {
          ctxStr = ` (obliczono jako średnią z ${agd.growthVelocityContext})`;
        }
        lines.push(`Tempo wzrastania: ${agd.growthVelocity.toFixed(1)} cm/rok${ctxStr}`);
      }
    }
    // Potencjał wzrostowy
    if (agd.targetHeight && !isNaN(agd.targetHeight)) {
      // Zawsze zaczynamy od wartości potencjału i jednostki (MPH – mid‑parental height)
      let line = `MPH (mid-parental height): ${agd.targetHeight.toFixed(1)} cm`;
      // Jeżeli dostępne są statystyki centyla i z‑score, wyświetl je
      if (agd.targetStats && typeof agd.targetStats.percentile === 'number') {
        const cent = Math.round(agd.targetStats.percentile);
        // W trybie profesjonalnym pokazujemy również z‑score, gdy jest dostępny
        if (pro && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
          line += ` – centyl: ${cent}, z-score: ${agd.targetStats.sd.toFixed(2)}`;
        } else {
          // Tryb standardowy – tylko centyl
          line += ` – centyl: ${cent}`;
        }
      }
      lines.push(line);

      // Dodaj różnicę hSDS - mpSDS do podsumowania metabolicznego w trybie profesjonalnym.
      // Obliczamy Z‑score aktualnego wzrostu dziecka zgodnie z wybranym źródłem siatek centylowych
      // (Palczewska, OLAF lub WHO), a następnie odejmujemy z‑score MPH.
      if (pro && agd.targetStats && typeof agd.targetStats.sd === 'number') {
        let statsHeightDiff = null;
        const usePalAdv = (typeof bmiSource !== 'undefined' &&
                           (bmiSource === 'PALCZEWSKA' ||
                           (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
        if (usePalAdv) {
          statsHeightDiff = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
        } else {
          statsHeightDiff = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
        }
        if (statsHeightDiff && typeof statsHeightDiff.sd === 'number') {
          const diffSummary = statsHeightDiff.sd - agd.targetStats.sd;
          lines.push(`hSDS - mpSDS: ${diffSummary.toFixed(2)}`);
        }
      }
    }
  }
  // Zwróć wszystkie linie w postaci tekstu
  return lines.join('\n');
}

/**
 * Obsługuje kliknięcie przycisku „Podsumowanie metaboliczne”.
 * Funkcja ta wywołuje generateMetabolicSummary(), a następnie kopiuje
 * wynik do schowka i informuje użytkownika. Została wydzielona jako
 * globalna, aby można ją było bezpośrednio przypisać do atrybutu
 * onclick w kodzie HTML.
 */
function handleMetabolicSummaryClick() {
  const summaryText = generateMetabolicSummary();
  if (!summaryText || summaryText.trim() === '') {
    alert('Brak danych do podsumowania.');
    return;
  }
  const copyAndNotify = () => {
    alert('Dane zostały skopiowane do schowka.');
  };
  // Użyj API schowka, jeśli dostępne
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summaryText).then(copyAndNotify).catch(() => {
      // Fallback – jeśli nie można użyć API schowka
      const textarea = document.createElement('textarea');
      textarea.value = summaryText;
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        copyAndNotify();
      } catch (e) {
        alert('Nie udało się skopiować danych.');
      }
      textarea.remove();
    });
  } else {
    // Fallback – starsze przeglądarki
    const textarea = document.createElement('textarea');
    textarea.value = summaryText;
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      copyAndNotify();
    } catch (e) {
      alert('Nie udało się skopiować danych.');
    }
    textarea.remove();
  }
}

// Upewnij się, że funkcja kliknięcia jest dostępna globalnie, aby mogła być wywołana
// z poziomu atrybutu onclick w kodzie HTML. Niektóre bundlery lub tryby strict
// mogą blokować dostęp do funkcji globalnych, dlatego przypisujemy ją do
// obiektu window w sposób jawny.
if (typeof window !== 'undefined') {
  window.handleMetabolicSummaryClick = handleMetabolicSummaryClick;
}

// Po załadowaniu DOM, podłącz obsługę przycisku i nasłuchuj zmian na kluczowych polach
document.addEventListener('DOMContentLoaded', function() {
  // Aktualizuj widoczność przycisku po każdej zmianie wieku, wagi lub wzrostu
  ['age','ageMonths','weight','height'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function(){
        updateMetabolicSummaryVisibility();
        // Przy każdej zmianie odśwież kartę profesjonalnego podsumowania,
        // aby natychmiast zareagować na nowe dane.
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch (e) {/*ignore*/}
        }
      });
      el.addEventListener('change', function(){
        updateMetabolicSummaryVisibility();
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch (e) {/*ignore*/}
        }
      });
    }
  });
  // Wywołaj na starcie, aby ustawić stan początkowy
  updateMetabolicSummaryVisibility();
  // Zaktualizuj kartę z podsumowaniem wyników na starcie
  if (typeof updateProfessionalSummaryCard === 'function') {
    updateProfessionalSummaryCard();
  }

  // Dodaj ogólny nasłuch na formularzu, aby karta podsumowania aktualizowała się
  // „w locie” podczas wprowadzania dowolnych danych (np. ciśnienia, obwodów).
  // Dzięki temu zmiany w polach obsługiwanych przez dodatkowe moduły (bp_module,
  // circumference_module itp.) będą od razu widoczne w karcie podsumowania.
  try {
    const formEl = document.getElementById('calcForm');
    if (formEl) {
      const liveHandler = function(){
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch(e) {/* ignore */}
        }
      };
      // Reaguj zarówno na input, jak i change – niektóre komponenty
      // emulują dane dopiero po zdarzeniu change.
      formEl.addEventListener('input', liveHandler);
      formEl.addEventListener('change', liveHandler);
    }
  } catch(e) {
    /* ignoruj błędy inicjalizacji listenera */
  }
  // Dodaj obsługę kliknięcia przycisku podsumowania
  const metaBtn = document.getElementById('metabolicSummaryBtn');
  if (metaBtn) {
    metaBtn.addEventListener('click', function() {
      const summaryText = generateMetabolicSummary();
      // Zakończ, jeśli nie ma żadnego podsumowania do skopiowania
      if (!summaryText || summaryText.trim() === '') {
        alert('Brak danych do podsumowania.');
        return;
      }
      /*
       * Zanim podsumowanie zostanie skopiowane do schowka, dokonujemy dwóch
       * modyfikacji zgodnie z wymaganiami użytkownika:
       * 1. Zamieniamy kropki używane jako separatory dziesiętne na przecinki.
       *    Wykorzystujemy wyrażenie regularne, które wyszukuje kropkę
       *    znajdującą się pomiędzy cyframi (np. „3.2” → „3,2”). Dzięki temu
       *    nie modyfikujemy innych kropkowanych fragmentów tekstu.
       * 2. Usuwamy twarde spacje (U+00A0), ponieważ niektóre edytory
       *    zamieniają je na znaki zapytania. Zastępujemy je zwykłymi
       *    spacjami, by zachować czytelność tekstu.
       */
      let sanitized = summaryText
        // usuń twarde spacje
        .replace(/\u00A0/g, ' ')
        // zamień separator dziesiętny z kropki na przecinek
        .replace(/([0-9])\.([0-9])/g, '$1,$2');
      // Kopiowanie do schowka przy użyciu API przeglądarki lub fallbacku
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sanitized).then(function() {
          alert('Dane zostały skopiowane do schowka.');
        }).catch(function() {
          // Fallback – jeśli nie można użyć API schowka
          const textarea = document.createElement('textarea');
          textarea.value = sanitized;
          textarea.style.position = 'absolute';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            alert('Dane zostały skopiowane do schowka.');
          } catch (e) {
            alert('Nie udało się skopiować danych.');
          }
          textarea.remove();
        });
      } else {
        // Fallback – starsze przeglądarki
        const textarea = document.createElement('textarea');
        textarea.value = sanitized;
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          alert('Dane zostały skopiowane do schowka.');
        } catch (e) {
          alert('Nie udało się skopiować danych.');
        }
        textarea.remove();
      }
    });
  }
});

/* =====================================================================
 * Zaawansowane obliczenia wzrostowe
 *
 * Ta sekcja implementuje logikę do obliczania potencjału wzrostowego
 * (tzw. target height), tempa wzrastania oraz przygotowuje dane
 * potrzebne do naniesienia dodatkowych elementów na siatki centylowe.
 * Skrypt dynamicznie dodaje kolejne wiersze pomiarów (wiek, wzrost,
 * waga) i na bieżąco aktualizuje wyniki po każdej zmianie pól.
 * Wyniki oraz dane pomocnicze są przechowywane w zmiennej
 * `window.advancedGrowthData`, dzięki czemu mogą zostać wykorzystane
 * również w funkcji generującej siatkę centylową PDF.
 */

// Globalny obiekt do przechowywania wyliczeń z sekcji zaawansowanej.
// Będzie uzupełniany w calculateGrowthAdvanced() i wykorzystywany
// przy generowaniu dodatkowych elementów na wykresie centylowym.
window.advancedGrowthData = null;

/**
 * Inicjalizuje obsługę sekcji zaawansowanych obliczeń wzrostowych.
 * Dodaje obsługę przycisku rozwijającego formularz, obsługę
 * przycisku dodającego kolejne pomiary oraz nasłuchuje zmian na
 * wszystkich polach, aby automatycznie przeliczać wyniki.
 */
function setupAdvancedGrowth() {
  const toggleBtn = document.getElementById('toggleAdvancedGrowth');
  const form = document.getElementById('advancedGrowthForm');
  if (toggleBtn && form) {
    toggleBtn.addEventListener('click', () => {
      // przełącz widoczność formularza
      if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
      } else {
        form.style.display = 'none';
      }
    });
  }
  const addBtn = document.getElementById('advAddMeasurementBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addAdvMeasurementRow);
  }
  // Dodaj pierwszy wiersz pomiarowy od razu po inicjalizacji, aby użytkownik
  // miał widoczne pola na wpisanie poprzednich pomiarów bez konieczności
  // klikania przycisku „Dodaj kolejny pomiar”.
  addAdvMeasurementRow();
  // Nasłuchuj zmian na głównych polach formularza, aby aktualizować
  // wyniki sekcji zaawansowanej. Zależności obejmują wiek, płeć,
  // wagę, wzrost oraz dodatkowe pola tej sekcji (wysokość rodziców,
  // wiek kostny). Używamy zarówno eventów 'input' jak i 'change', aby
  // reagować na wszystkie możliwe scenariusze interakcji (mobilne
  // klawiatury, selektory).
  const ids = ['age', 'ageMonths', 'weight', 'height', 'sex', 'advMotherHeight', 'advFatherHeight', 'advBoneAge'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', calculateGrowthAdvanced);
      el.addEventListener('change', calculateGrowthAdvanced);
    }
  });
  // Wstępne przeliczenie przy załadowaniu strony, aby przygotować
  // globalny obiekt na wypadek wcześniejszego uruchomienia generatora
  // siatki centylowej. Nie powoduje to wyświetlenia wyników, gdy
  // sekcja jest ukryta.
  calculateGrowthAdvanced();
}

/**
 * Dodaje jeden wiersz pomiarowy do kontenera #advMeasurements.
 * Wiersz zawiera pola: wiek (lata), wzrost (cm) i waga (kg) oraz
 * przycisk usuwający dany wiersz. Po dodaniu wiersza wszystkie
 * pola otrzymują nasłuchy, które powodują ponowne przeliczenie
 * wyników.
 */
function addAdvMeasurementRow() {
  const container = document.getElementById('advMeasurements');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'measure-row';
  // Dwupoziomowy układ: separator, górny wiersz (wiek w latach i miesiącach oraz wzrost),
  // dolny wiersz (waga, wiek kostny i przycisk usuwania). Każdy kolejny wpis
  // rozpoczyna się delikatną poziomą linią.
  row.innerHTML = `
    <div class="measure-row-sep"></div>
    <div class="measure-row-top">
      <label>Wiek (lata):
        <input type="number" class="adv-age-years" min="0" max="18" step="1">
      </label>
      <label>Wiek (miesiące):
        <input type="number" class="adv-age-months" min="0" max="11" step="1">
      </label>
      <label>Wzrost (cm):
        <input type="number" class="adv-height" min="40" max="250" step="0.1">
      </label>
    </div>
    <div class="measure-row-bot">
      <label>Waga (kg):
        <input type="number" class="adv-weight" min="1" max="200" step="0.1">
      </label>
      <label>Wiek kostny (lata):
        <input type="number" class="adv-bone-age" min="0" max="18" step="0.1">
      </label>
      <button type="button" class="icon remove-measure" title="Usuń ten pomiar">&times;</button>
    </div>
  `;
  container.appendChild(row);
  // nasłuch na usuwanie wiersza
  const removeBtn = row.querySelector('.remove-measure');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      container.removeChild(row);
      // Po usunięciu wiersza również aktualizuj widoczność przycisku usuwania
      updateRemoveButtons();
      calculateGrowthAdvanced();
    });
  }
  // nasłuch na zmiany w nowych polach
  const inputs = row.querySelectorAll('input');
  inputs.forEach(inp => {
    inp.addEventListener('input', calculateGrowthAdvanced);
    inp.addEventListener('change', calculateGrowthAdvanced);
  });
  // oblicz natychmiast po dodaniu wiersza
  // Po dodaniu nowego wiersza aktualizujemy wyświetlanie przycisku usuwania
  // oraz maksymalny dopuszczalny wiek pomiaru na podstawie aktualnego wieku dziecka.
  updateRemoveButtons();
  updateAdvAgeMax();
  calculateGrowthAdvanced();
}

/**
 * Ukrywa przycisk usuwania wiersza pomiarowego, gdy jest tylko jeden wiersz,
 * i pokazuje go, gdy istnieje więcej niż jeden wiersz. Dzięki temu użytkownik
 * nie może usunąć ostatniego pomiaru, ale może dodawać i usuwać kolejne.
 */
function updateRemoveButtons() {
  const rows = document.querySelectorAll('#advMeasurements .measure-row');
  rows.forEach(row => {
    const btn = row.querySelector('.remove-measure');
    if (btn) {
      btn.style.display = rows.length > 1 ? 'inline-block' : 'none';
    }
  });
}

/**
 * Aktualizuje atrybut `max` dla pól wieku w sekcji pomiarowej,
 * aby wiek wprowadzany w pomiarach nie przekraczał wieku dziecka
 * podanego w sekcji „Dane użytkownika”.
 */
function updateAdvAgeMax() {
  const ageYears = getAgeDecimal();
  // Ustaw maksymalną liczbę lat w polu wieku pomiaru na liczbę pełnych lat dziecka.
  const inputsY = document.querySelectorAll('#advMeasurements .adv-age-years');
  inputsY.forEach(inp => {
    if (!isNaN(ageYears)) {
      inp.max = Math.floor(ageYears);
    }
  });
}

/**
 * Mapuje percentyl na kanał centylowy według standardowych przedziałów.
 * Kanały definiowane są następująco: 0–<3, 3–<10, 10–<25, 25–<50, 50–<75,
 * 75–<90, 90–<97, ≥97. Służy do oceny spadku tempa wzrastania (≥2 kanały).
 * @param {number} percentile – wartość percentyla (0–100)
 * @returns {number} indeks kanału (0–7)
 */
function getCentileChannel(percentile) {
  if (percentile < 3) return 0;
  if (percentile < 10) return 1;
  if (percentile < 25) return 2;
  if (percentile < 50) return 3;
  if (percentile < 75) return 4;
  if (percentile < 90) return 5;
  if (percentile < 97) return 6;
  return 7;
}

/* === DODANE (Zaawansowane obliczenia wzrostowe) – funkcje pomocnicze === */

/** Zwraca różnicę w miesiącach (liczbę dodatnią) między dwoma wiekami w miesiącach. */
function diffMonths(aM, bM) {
  return Math.abs(aM - bM);
}

/**
 * Wybiera wcześniejszy pomiar wzrostu do obliczenia tempa z ostatniego roku
 * (12 miesięcy ± 3 miesiące), ale tylko jeśli odstęp wynosi co najmniej 6 mies.
 * Zwraca obiekt pomiaru albo null.
 */
function pickPrevForLastYear(heightMeas, currentAgeM, minGapM = 6, targetM = 12, tolM = 3) {
  const low = targetM - tolM;   // 9 mies.
  const high = targetM + tolM;  // 15 mies.
  let best = null;
  let bestDist = Infinity;
  for (let i = heightMeas.length - 1; i >= 0; i--) {
    const m = heightMeas[i];
    const gap = currentAgeM - m.ageMonths;
    if (gap < minGapM) continue;        // za blisko
    if (gap < low || gap > high) continue; // poza oknem 12±3
    const dist = Math.abs(gap - targetM);
    if (dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Wybiera najnowszy wcześniejszy pomiar oddalony o ≥6 mies. (fallback,
 * gdy nie udało się policzyć „ostatniego roku”).
 */
function pickPrevFallback(heightMeas, currentAgeM, minGapM = 6) {
  for (let i = heightMeas.length - 1; i >= 0; i--) {
    const m = heightMeas[i];
    const gap = currentAgeM - m.ageMonths;
    if (gap >= minGapM) return m;
  }
  return null;
}

/** Formatuje opis okresu z którego policzono tempo (ostatni rok lub „średnia z …”). */
function formatVelocityContext(prevAgeM, currAgeM, usedLastYear) {
  const gapM = currAgeM - prevAgeM;
  if (usedLastYear) return 'ostatni rok';
  if (gapM < 12) return `ostatnich ${gapM} mies.`;
  // Zaokrąglamy lata do pełnych, żeby komunikat był "2 lata, 3 lata..."
  const yrs = Math.round(gapM / 12);
  return `ostatnich ${yrs} lat`;
}

/**
 * Zwraca próg minimalnego tempa (cm/rok) i etykietę normy w zależności od wieku końcowego.
 * Uwaga: tolerancja pomiarowa tylko dla 1. i 2. roku życia (−2 cm i −1 cm).
 * Jeżeli brak progu (wiek >10 lat), zwraca null.
 */
function getVelocityThreshold(endAgeMonths) {
  const y = endAgeMonths / 12;
  if (y < 1) {
    return { threshold: 23 - 2, label: '≥23 cm/rok (tolerancja ±2 cm)' };
  } else if (y >= 1 && y < 2) {
    return { threshold: 10 - 1, label: '≥10 cm/rok (tolerancja ±1 cm)' };
  } else if (y >= 2 && y < 3) {
    return { threshold: 7, label: '≥7 cm/rok' };
  } else if (y >= 3 && y < 5) {
    return { threshold: 6, label: '≥6 cm/rok' };
  } else if (y >= 5 && y < 10) {
    return { threshold: 5, label: '≥5 cm/rok' };
  }
  // >10 r.ż. – brak zdefiniowanej normy w specyfikacji
  return null;
}

/** Oblicza tempo wzrastania (cm/rok) między dwoma pomiarami. */
function velocityCmPerYear(h1, m1, h2, m2) {
  const dy = (m2 - m1) / 12;
  if (dy <= 0) return null;
  return (h2 - h1) / dy;
}

/**
 * Wylicza średnie tempa wzrastania dla przedziałów:
 * 0–12 mies., 12–24 mies., 24–36 mies., 36–60 mies., 60–120 mies., ≥120 mies.
 * Dla każdego okresu wymaga ≥2 pomiarów w danym oknie oraz odstępu ≥6 mies.
 * Zwraca tablicę obiektów {label, value|null}.
 */
function computePeriodVelocities(points) {
  // points: tablica obiektów {ageMonths, height}, posortowana rosnąco po ageMonths
  const ranges = [
    { label: '1. rok życia',       start:   0, end:  12 },
    { label: '2. rok życia',       start:  12, end:  24 },
    { label: '3. rok życia',       start:  24, end:  36 },
    { label: '3–5 lat',            start:  36, end:  60 },
    { label: '5–10 lat',           start:  60, end: 120 },
    { label: '>10 lat',            start: 120, end: 9999 }
  ];
  const out = [];
  for (const r of ranges) {
    const inRange = points.filter(p => p.ageMonths >= r.start && p.ageMonths <= r.end);
    if (inRange.length >= 2) {
      const first = inRange[0];
      const last  = inRange[inRange.length - 1];
      const gapM = last.ageMonths - first.ageMonths;
      if (gapM >= 6) {
        const v = velocityCmPerYear(first.height, first.ageMonths, last.height, last.ageMonths);
        out.push({ label: r.label, value: (v !== null ? v : null) });
        continue;
      }
    }
    out.push({ label: r.label, value: null });
  }
  return out;
}

/** Buduje HTML tabeli tempa wzrastania dla okresów.
 *  WERSJA: bez osobnej ramki; tytuł ~2× mniejszy; tylko okresy z wyliczonym tempem;
 *  tabelka pokazuje się dopiero gdy są ≥2 okresy z wyliczeniem.
 */
function buildVelocityTableHtml(periods) {
  // Bierzemy tylko okresy, w których rzeczywiście policzono tempo
  const valid = (periods || []).filter(p => p && p.value !== null);

  // Pokazuj tabelę dopiero, gdy mamy co najmniej 2 takie okresy
  if (valid.length < 2) return '';

  // Budowa wierszy tylko dla dostępnych okresów
  let rows = '';
  for (const p of valid) {
    rows += `<tr>
               <td style="padding:4px 0;">${p.label}</td>
               <td style="padding:4px 0;">${p.value.toFixed(1)} cm/rok</td>
             </tr>`;
  }

  // Zwracamy sam tytuł (mniejszy) + tabelę — bez „ramki” (result-box)
  return `
    <div class="velocity-periods-title"
         style="font-size:1.0em; font-weight:600; margin:0.5rem 0 0.25rem 0; opacity:0.9;">
      Średnie tempo wzrastania (wg okresów)
    </div>
    <table class="velocity-periods-table"
           style="width:100%; border-collapse:collapse; margin-bottom:0.5rem;">
      <thead>
        <tr>
          <th style="text-align:left; border-bottom:1px solid #ddd; padding:4px 0;">Okres</th>
          <th style="text-align:left; border-bottom:1px solid #ddd; padding:4px 0;">Tempo (cm/rok)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
/* === KONIEC: funkcje pomocnicze === */

/**
 * Główna funkcja obliczająca potencjał wzrostowy, tempo wzrastania
 * oraz przygotowująca dane historycznych pomiarów. Dane te są
 * prezentowane w interfejsie oraz zapisywane w globalnym obiekcie
 * window.advancedGrowthData. Funkcja jest wywoływana w wyniku
 * zmian pól formularza.
 */
function calculateGrowthAdvanced() {
  const resultsEl = document.getElementById('advResults');
  // Aktualizuj maksymalny dopuszczalny wiek w polach pomiarowych przy każdym przeliczeniu
  updateAdvAgeMax();
  // Pobierz wiek użytkownika i skonwertuj do lat/miesięcy
  const ageYears = getAgeDecimal();
  const ageMonths = Math.round((isNaN(ageYears) ? 0 : ageYears) * 12);
  // Sprawdź, czy sekcja powinna być aktywna (wiek < 18 lat)
  // Wcześniej funkcja zwracała od razu dla dzieci młodszych niż 3 lata.
  // Usunięto ten warunek, aby umożliwić obliczenia dla dzieci w wieku 0–3 lat
  // z użyciem siatek Palczewskiej. Wyłącznie wiek >= 18 lat (dorośli)
  // dezaktywuje sekcję zaawansowaną.
  if (isNaN(ageYears) || ageYears >= 18) {
    // Wyczyść poprzednie dane, ale nie usuwaj zawartości formularza
    window.advancedGrowthData = null;
    if (resultsEl) resultsEl.innerHTML = '';
    return;
  }
  const sexEl = document.getElementById('sex');
  const sex = sexEl ? sexEl.value : 'M';
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  // Odczytaj imię podane w formularzu zaawansowanych obliczeń wzrostowych (może być puste)
  const advName = document.getElementById('advName')?.value?.trim();
  // Wysokości rodziców
  const motherH = parseFloat(document.getElementById('advMotherHeight')?.value);
  const fatherH = parseFloat(document.getElementById('advFatherHeight')?.value);
  let targetHeight = null;
  if (!isNaN(motherH) && !isNaN(fatherH)) {
    if (sex === 'F') {
      // Dziewczynki: (wzrost taty - 13 + wzrost mamy) / 2
      targetHeight = ((fatherH - 13) + motherH) / 2;
    } else {
      // Chłopcy: (wzrost mamy + 13 + wzrost taty) / 2
      targetHeight = ((motherH + 13) + fatherH) / 2;
    }
  }
  // Wiek kostny
  const boneAgeVal = parseFloat(document.getElementById('advBoneAge')?.value);
  const boneAgeMonths = !isNaN(boneAgeVal) ? Math.round(boneAgeVal * 12) : null;
  // Odczytaj wprowadzone pomiary. Każdy wiersz ma dwa pola wieku (lata i miesiące).
  const measRows = document.querySelectorAll('#advMeasurements .measure-row');
  const measurements = [];
  measRows.forEach(row => {
    const yInput   = row.querySelector('.adv-age-years');
    const mInput   = row.querySelector('.adv-age-months');
    const heightInput = row.querySelector('.adv-height');
    const weightInput = row.querySelector('.adv-weight');
    const boneInput   = row.querySelector('.adv-bone-age');
    const yVal = parseFloat(yInput?.value);
    const mVal = parseFloat(mInput?.value);
    // Jeżeli oba pola wieku są puste, pomiń ten pomiar
    if (isNaN(yVal) && isNaN(mVal)) {
      return;
    }
    // Oblicz wiek w latach jako suma lat + miesięcy/12 (puste pola traktowane jako 0)
    const ageYearsRow = (isNaN(yVal) ? 0 : yVal) + (isNaN(mVal) ? 0 : mVal / 12);
    const ageMonthsRow = Math.round(ageYearsRow * 12);
    const hVal = parseFloat(heightInput?.value);
    const wVal = parseFloat(weightInput?.value);
    const bVal = parseFloat(boneInput?.value);
    measurements.push({
      ageYears: ageYearsRow,
      ageMonths: ageMonthsRow,
      height: (!isNaN(hVal) ? hVal : null),
      weight: (!isNaN(wVal) ? wVal : null),
      boneAgeYears: (!isNaN(bVal) ? bVal : null)
    });
  });
    // === [ZAMIANA] Obliczanie tempa wzrastania zgodnie z wymaganiami (aktualizacja) ===
let growthVelocity = null;               // cm/rok
// Uwaga: ta flaga oznacza teraz „Aktualne” (okno 6–15 mies., tj. 6–8 mies. oraz 12±3 mies.)
let growthVelocityUsedLastYear = false;
let growthVelocityContext = '';          // dla „Tempo wzrastania” (nieaktualne): "ostatnich X mies." / "ostatnich N lat"
let growthVelocityGapM = null;           // dokładna liczba miesięcy użyta do „Aktualnego”/„nieaktualnego” tempa

const heightMeas = measurements
  .filter(m => m.height !== null)
  .sort((a,b)=>a.ageMonths - b.ageMonths);

if (heightMeas.length >= 1 && !isNaN(heightVal)) {
  const currentAgeM = ageMonths;
  const currentH = heightVal;

  // 1) Preferencja: okno „ostatni rok” = 12±3 mies. (ale min. 6 mies.)
  let prev = pickPrevForLastYear(heightMeas, currentAgeM, 6, 12, 3);
  if (prev) {
    const v = velocityCmPerYear(prev.height, prev.ageMonths, currentH, currentAgeM);
    if (v !== null) {
      growthVelocity = v;
      growthVelocityUsedLastYear = true;                   // traktujemy jako „Aktualne”
      growthVelocityGapM = currentAgeM - prev.ageMonths;   // np. 13 mies.
      // Nie potrzebujemy tu „ostatni rok” – do etykiety pokażemy dokładną liczbę miesięcy
      growthVelocityContext = `ostatnich ${growthVelocityGapM} mies.`;
    }
  }

  // 2) Jeśli brak pary w 12±3 mies.: bierzemy najnowszy pomiar oddalony ≥6 mies.
  if (growthVelocity === null) {
    const p2 = pickPrevFallback(heightMeas, currentAgeM, 6);
    if (p2) {
      const v = velocityCmPerYear(p2.height, p2.ageMonths, currentH, currentAgeM);
      if (v !== null) {
        growthVelocity = v;
        growthVelocityGapM = currentAgeM - p2.ageMonths;    // np. 6/7/8/… mies.
        // 6–8 mies. także traktujemy jako „Aktualne”
        growthVelocityUsedLastYear = (growthVelocityGapM >= 6 && growthVelocityGapM <= 8);
        // Ten kontekst wykorzystujemy tylko w „Tempo wzrastania” (nieaktualne)
        growthVelocityContext = formatVelocityContext(p2.ageMonths, currentAgeM, false);
      }
    }
  }
}
// === [KONIEC ZAMIANY] ===
  
    // Oblicz parametry centylowe dla potencjału wzrostowego w wieku 18 lat
  // Oblicz parametry centylowe dla potencjału wzrostowego w wieku 18 lat
  let targetStats = null;
  if (targetHeight !== null && !isNaN(targetHeight)) {
    const stats = calcPercentileStats(targetHeight, sex, 18, 'h');
    if (stats) {
      targetStats = stats;
    }
  }

  // Oceń spadek tempa wzrastania – jeśli dziecko spadło o ≥2 kanały centylowe względem pierwszego pomiaru
  let isLosingGrowth = false;
  if (heightMeas.length >= 1 && !isNaN(heightVal)) {
    const first = heightMeas[0];
    const statsFirst = calcPercentileStats(first.height, sex, first.ageYears, 'h');
    const statsCurr  = calcPercentileStats(heightVal, sex, ageYears, 'h');
    if (statsFirst && statsCurr) {
      const chFirst = getCentileChannel(statsFirst.percentile);
      const chCurr  = getCentileChannel(statsCurr.percentile);
      if (chFirst - chCurr >= 2) {
        isLosingGrowth = true;
      }
    }
  }
    // Przygotuj punkty wysokości (wraz z aktualnym wzrostem) do tabeli okresów
    const pointsForTable = heightMeas.slice();
    if (!isNaN(heightVal)) {
      pointsForTable.push({ ageMonths, height: heightVal });
    }
    pointsForTable.sort((a,b)=>a.ageMonths - b.ageMonths);
    const periodVelocities = computePeriodVelocities(pointsForTable.map(p => ({ageMonths: p.ageMonths, height: p.height})));
    const periodTableHtml = buildVelocityTableHtml(periodVelocities);
  
    // Ocena „słabego” tempa wzrastania – tylko dla obliczonego aktualnego tempa
    let isSlowVelocity = false;
    let slowNormLabel = '';
    const endAgeM = (typeof currentAgeForVelocityM !== 'undefined' && currentAgeForVelocityM !== null)
      ? currentAgeForVelocityM
      : ageMonths;
      const thr = getVelocityThreshold(ageMonths);
      if (thr && growthVelocity !== null && !isNaN(growthVelocity) && growthVelocityUsedLastYear) {
        if (growthVelocity < thr.threshold) {
          isSlowVelocity = true;
        }
        slowNormLabel = thr.label;
      }
  
    // Zaktualizuj globalny obiekt (dostępny także dla PDF)
    window.advancedGrowthData = {
      targetHeight: targetHeight,
      targetStats: targetStats,
      measurements: measurements,
      boneAgeMonths: boneAgeMonths,
      growthVelocity: growthVelocity,
      growthVelocityUsedLastYear: growthVelocityUsedLastYear,
      growthVelocityContext: growthVelocityContext,
      growthVelocityGapM: growthVelocityGapM,           //  <— DODAJ TO
      periodVelocities: periodVelocities,
      currentAgeMonths: ageMonths,
      currentHeight: heightVal,
      currentWeight: weightVal,
      sex: sex,
      name: advName || '',
      isLosingGrowth: isLosingGrowth
    };
  
    // Przygotuj i wyświetl tekstowy rezultat w sekcji zaawansowanej
    if (resultsEl) {
      let html = '';
      if (targetHeight !== null && !isNaN(targetHeight)) {
        const th = targetHeight.toFixed(1);
        if (targetStats) {
          const cent = formatCentile(targetStats.percentile);
          const sd = targetStats.sd.toFixed(2);
          // Zmieniono etykietę na MPH (mid‑parental height)
          html += `<p><strong>MPH (mid-parental height):</strong> ${th} cm – centyl: ${cent}, z-score: ${sd}</p>`;
        } else {
          html += `<p><strong>MPH (mid-parental height):</strong> ${th} cm</p>`;
        }
      }

      // Dodaj różnicę hSDS - mpSDS w trybie profesjonalnym.
      // Aby obliczyć różnicę, wymagane są zarówno targetStats (Z‑score rodziców) jak i profesjonalny tryb wyników.
      if (targetStats && typeof targetStats.sd === 'number' && professionalMode) {
        // Z‑score aktualnego wzrostu dziecka (hSDS) powinien być obliczany na podstawie
        // tego samego zestawu siatek centylowych, z którego korzystamy przy obliczaniu mph.
        // Do tej pory wykorzystywano parametr 'h' w funkcji calcPercentileStats, co nie
        // odpowiada nazwie używanej w pozostałych modułach (HT). Ponadto nie uwzględniano
        // wyboru źródła danych (Palczewska/OLAF/WHO), co prowadziło do niespójności.
        // Tutaj wykrywamy bieżące źródło siatek (bmiSource) i korzystamy z
        // odpowiedniej funkcji (calcPercentileStatsPal lub calcPercentileStats) z parametrem 'HT'.
        let statsHeightDiff = null;
        // W zależności od źródła (Palczewska dla dzieci <3 lat lub wybrana przez użytkownika)
        // stosujemy właściwą funkcję. Zmienna bmiSource jest ustawiana globalnie przy
        // przełączaniu radiobuttonów w karcie BMI.
        const usePalAdv = (typeof bmiSource !== 'undefined' &&
                           (bmiSource === 'PALCZEWSKA' ||
                            (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
        if (usePalAdv) {
          statsHeightDiff = calcPercentileStatsPal(heightVal, sex, ageYears, 'HT');
        } else {
          statsHeightDiff = calcPercentileStats(heightVal, sex, ageYears, 'HT');
        }
        if (statsHeightDiff && typeof statsHeightDiff.sd === 'number') {
          const diffZ = statsHeightDiff.sd - targetStats.sd;
          html += `<p><strong>hSDS - mpSDS:</strong> ${diffZ.toFixed(2)}</p>`;
        }
      }
  
      if (growthVelocity !== null && !isNaN(growthVelocity)) {
        if (growthVelocityUsedLastYear) {
          // „Aktualne” zawsze pokazujemy z dokładną liczbą miesięcy
          const m = (typeof growthVelocityGapM === 'number' && growthVelocityGapM >= 6) ? growthVelocityGapM : null;
          const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
          html += `<p><strong>Aktualne tempo wzrastania${monthInfo}:</strong> ${growthVelocity.toFixed(1)} cm/rok</p>`;
        } else {
          const ctx = growthVelocityContext ? ` <span style="opacity:0.85;">(obliczono jako średnią z ${growthVelocityContext})</span>` : '';
          html += `<p><strong>Tempo wzrastania:</strong> ${growthVelocity.toFixed(1)} cm/rok${ctx}</p>`;
        }
      } else {
        html += `<p><em>Brak wystarczających danych (wymagane ≥2 pomiary oddalone o ≥6 miesięcy), aby obliczyć tempo wzrastania.</em></p>`;
      }
  
      // Komunikat o utracie tempa wzrastania (kanały centylowe) – zachowujemy istniejącą logikę
      if (isLosingGrowth) {
        html += `<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika utrata tempa wzrastania, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a></p>`;
      }
  
      // NOWY komunikat: słabe tempo wzrastania (dotyczy tylko obliczonego aktualnego tempa)
      if (isSlowVelocity) {
        const normInfo = slowNormLabel ? ` <span style="font-weight:400;">(norma: ${slowNormLabel})</span>` : '';
        html += `<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika słabe tempo wzrastania dziecka, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a>${normInfo}</p>`;
      }
  
      // Tabela okresów (pokazujemy niezależnie od komunikatów)
      if (periodTableHtml) {
        html += periodTableHtml;
      }
  
      if (html === '') {
        html = '<p>Uzupełnij dane, aby obliczyć potencjał wzrostowy i tempo wzrastania.</p>';
      }
      // Wstaw wygenerowane wyniki do kontenera
      resultsEl.innerHTML = html;

      /*
       * Po wstawieniu wyników oceń, czy należy wyróżnić cały blok wyników.
       * Zgodnie z wymaganiami, gdy pojawia się ostrzeżenie o "słabym tempie wzrastania",
       * obramowanie kontenera powinno zmieniać kolor na czerwony, a sam kontener
       * pulsować podobnie jak karta Wskaźnika Cole'a w przypadku nadwagi lub otyłości.
       * Dodatkowo powiększamy czcionkę w tym bloku o 25% dla lepszej czytelności.
       */
      // Resetuj ewentualne poprzednie efekty pulsowania i style ramki
      clearPulse(resultsEl);
      // Przywróć bazowy rozmiar czcionki i obramowanie (style inline mają priorytet nad CSS)
      resultsEl.style.borderColor = '';
      resultsEl.style.fontSize   = '';

      // Wyświetl ostrzeżenie: jeśli tempo wzrastania jest wolne
      // (isSlowVelocity = true) lub nastąpiła utrata tempa wzrastania
      // (isLosingGrowth = true), ustawiamy czerwone obramowanie, powiększamy
      // czcionkę i uruchamiamy pulsowanie. Dotyczy to wszystkich grup
      // wiekowych, również >10 lat. W przeciwnym wypadku obramowanie
      // pozostaje w kolorze podstawowym.
      if (isSlowVelocity || isLosingGrowth) {
        // Ustaw czerwone obramowanie i zwiększ rozmiar czcionki
        resultsEl.style.borderColor = 'var(--danger)';
        resultsEl.style.fontSize = '1.25rem';
        // Zastosuj pulsowanie czerwone – wykorzystujemy globalną funkcję applyPulse
        applyPulse(resultsEl, 'danger');
      } else {
        // Przywróć turkusową ramkę (primary) jeśli wcześniej ustawiono kolor
        resultsEl.style.borderColor = 'var(--primary)';
      }
      // After updating the advanced growth results and global state, refresh the
      // professional summary card. Without this call the "Podsumowanie wyników"
      // card would not reflect changes from the advanced growth module until a
      // separate input event occurs. Catch any errors to avoid breaking the UI.
      if (typeof updateProfessionalSummaryCard === 'function') {
        try { updateProfessionalSummaryCard(); } catch (e) { /* ignore errors */ }
      }
    }
}

/**
 * Czyści wszystkie pola i wyniki w sekcji zaawansowanych obliczeń wzrostowych,
 * pozostawiając dane wprowadzone w sekcji „Dane użytkownika”. Dodaje pusty wiersz
 * pomiarowy oraz resetuje globalny obiekt advancedGrowthData.
 */
function clearAdvancedGrowthCard() {
  // Wyczyść pola tekstowe i numeryczne sekcji zaawansowanej
  const fieldIds = ['advName', 'advBoneAge', 'advMotherHeight', 'advFatherHeight'];
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Usuń wszystkie wiersze pomiarowe
  const cont = document.getElementById('advMeasurements');
  if (cont) {
    cont.innerHTML = '';
    // Dodaj jeden pusty wiersz pomiarowy
    addAdvMeasurementRow();
  }
  // Wyczyść wyniki
  const resEl = document.getElementById('advResults');
  if (resEl) resEl.innerHTML = '';
  // Zresetuj globalny obiekt
  window.advancedGrowthData = null;
  // Aktualizuj przyciski usuwania i limit wieku
  updateRemoveButtons();
  updateAdvAgeMax();
}

// Uruchom inicjalizację zaawansowanej sekcji po załadowaniu DOM.
document.addEventListener('DOMContentLoaded', () => {
  setupAdvancedGrowth();
  // Przenieś kontener zaawansowanych obliczeń wzrostowych między kartę
  // Wskaźnika Cole'a a kartę „Droga do normy BMI”. Dzięki temu sekcja
  // pojawia się w układzie dwukolumnowym w odpowiednim miejscu.
  const adv = document.getElementById('advancedGrowthSection');
  const coleCard = document.getElementById('coleCard');
  const toNormCard = document.getElementById('toNormCard');
  if (adv && coleCard && toNormCard && coleCard.parentNode) {
    coleCard.parentNode.insertBefore(adv, toNormCard);
  }
});

/* ===========================================================
 * SYNC OVERLAY — Advanced Growth ↔ Intake (2-way DOM only)
 * ===========================================================
 * Ten blok dodaje dwukierunkową synchronizację danych między
 * kartami „Zaawansowane obliczenia wzrostowe” i „Szacowane spożycie energii”.
 * Blok jest umieszczony na końcu pliku, aby nie kolidować z istniejącymi
 * funkcjami. Wszystkie modyfikacje odbywają się poprzez manipulację DOM,
 * bez wprowadzania globalnych zależności.
 */

/* ---------- helpers ---------- */
function _intkRows(){ return Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake')); }
function _advRows(){  return Array.from(document.querySelectorAll('#advMeasurements .measure-row')); }

function _getUserBasics(){
  // Pobierz podstawowe dane użytkownika z formularza „Dane użytkownika”.
  const ageY = parseFloat(document.getElementById('age')?.value);
  const ageM = parseFloat(document.getElementById('ageMonths')?.value);
  const height = parseFloat(document.getElementById('height')?.value);
  const weight = parseFloat(document.getElementById('weight')?.value);
  const totalM = (isNaN(ageY)?0:ageY)*12 + (isNaN(ageM)?0:ageM);
  return { ageMonths: totalM, height, weight };
}

function _lockIntakeFirstRow(){
  const rows = _intkRows(); if(!rows.length) return;
  const first = rows[0];
  first.dataset.locked = 'true';
  first.querySelectorAll('input').forEach(inp => inp.disabled = true);
  const rm = first.querySelector('.remove-intake-row'); if (rm) rm.style.display = 'none';
}

function _updateIntakeFirstRowFromUserBasics(){
  const cont = document.getElementById('intakeMeasurements'); if(!cont) return;
  // Upewnij się, że wiersz istnieje; jeśli nie, dodaj go (prefill).
  if(!_intkRows().length){
    if (typeof intakeAddRow === 'function'){
      const b = _getUserBasics();
      intakeAddRow({ ageMonths: b.ageMonths, height: b.height, weight: b.weight });
    } else {
      return;
    }
  }
  const first = _intkRows()[0]; if(!first) return;
  const b = _getUserBasics();
  const y = Math.floor((isNaN(b.ageMonths)?0:b.ageMonths)/12);
  const m = (isNaN(b.ageMonths)?0:b.ageMonths)%12;
  const set = (sel, val) => { const el = first.querySelector(sel); if(el) el.value = (val ?? '') === '' ? '' : String(val); };
  set('.intake-ageY', isNaN(y)?'':y);
  set('.intake-ageM', isNaN(m)?'':m);
  set('.intake-ht', isNaN(b.height)?'':b.height);
  set('.intake-wt', isNaN(b.weight)?'':b.weight);
  _lockIntakeFirstRow();
  if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
}

function _ensureIntakeParityWithAdv(){
  const advN = _advRows().length;
  const rows = _intkRows();
  const hasFirstLocked = rows[0]?.dataset.locked === 'true';
  const curr = rows.length - (hasFirstLocked?1:0);

  // dołóż brakujące (nie ruszaj 1. wiersza)
  for (let i=curr; i<advN; i++){
    if (typeof intakeAddRow === 'function') intakeAddRow();
  }
  // usuń nadmiarowe po stronie intake
  for (let i=advN; i<curr; i++){
    const all = _intkRows();
    const last = all[all.length-1];
    if (last?.dataset.locked !== 'true') last.remove();
  }
  if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
}

function _syncAdvRowToIntake(advRow){
  const idx = _advRows().indexOf(advRow);
  if (idx < 0) return;
  const target = _intkRows()[idx+1]; // +1: pierwszy wiersz intake = „Dane użytkownika”
  if (!target) return;
  const val = (sel) => { const el = advRow.querySelector(sel); return el ? parseFloat(el.value) : NaN; };
  // Wiek jest przechowywany w dwóch polach: lata i miesiące
  const yVal = val('.adv-age-years');
  const mVal = val('.adv-age-months');
  const h = val('.adv-height');
  const w = val('.adv-weight');
  if (!isNaN(yVal) || !isNaN(mVal)) {
    let yy = isNaN(yVal) ? 0 : yVal;
    let mm = isNaN(mVal) ? 0 : mVal;
    // Zaokrąglenie miesięcy i normalizacja powyżej 11
    mm = Math.round(mm);
    if (mm >= 12) {
      yy += Math.floor(mm / 12);
      mm = mm % 12;
    }
    const setText = (sel, v) => { const el = target.querySelector(sel); if (el) el.value = String(v); };
    setText('.intake-ageY', yy);
    setText('.intake-ageM', mm);
  } else {
    // Brak wpisanego wieku – wyczyść pola
    const clr = sel => { const el = target.querySelector(sel); if (el) el.value=''; };
    clr('.intake-ageY'); clr('.intake-ageM');
  }
  // Zapisz wzrost i wagę do wiersza intake
  const setNum = (sel, v) => { const el = target.querySelector(sel); if (el) el.value = isNaN(v)?'':String(v); };
  setNum('.intake-ht', h);
  setNum('.intake-wt', w);

  if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc();
}

function _syncIntakeRowToAdv(intakeRow){
  const rows = _intkRows(); const idx = rows.indexOf(intakeRow);
  if (idx <= 0) return; // 0 = wiersz zablokowany (Dane użytkownika)
  const advRow = _advRows()[idx-1]; if (!advRow) return;

  const gv = sel => { const el = intakeRow.querySelector(sel); return el ? parseFloat(el.value) : NaN; };
  const y = gv('.intake-ageY'), m = gv('.intake-ageM');
  const h = gv('.intake-ht'),  w = gv('.intake-wt');
  const ageDec = (isNaN(y)&&isNaN(m)) ? NaN : ((isNaN(y)?0:y) + (isNaN(m)?0:m)/12);

  const set = (sel, v) => { const el = advRow.querySelector(sel); if (el) el.value = (v===''||Number.isNaN(v)) ? '' : String(v); };
  if (Number.isNaN(ageDec)) {
    // Jeżeli w wierszu intake brak wieku, wyczyść obie części wieku po stronie Advanced
    set('.adv-age-years','');
    set('.adv-age-months','');
  } else {
    // Rozbij wiek dziesiętny na lata i miesiące
    let yrs = Math.floor(ageDec);
    let mos = Math.round((ageDec - yrs) * 12);
    if (mos === 12) {
      yrs += 1;
      mos = 0;
    }
    set('.adv-age-years', yrs);
    set('.adv-age-months', mos);
  }
  set('.adv-height', Number.isNaN(h)?'':h);
  set('.adv-weight', Number.isNaN(w)?'':w);

  if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced();
}

/* ---------- non-invasive wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // 1) Zadbaj o 1. wiersz intake = „Dane użytkownika”
  _updateIntakeFirstRowFromUserBasics();

  // Live-sync: „Dane użytkownika” → 1. wiersz intake
  const liveCb = () => { _updateIntakeFirstRowFromUserBasics(); if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); };
  ['age','ageMonths','weight','height','sex'].forEach(id=>{
    const el = document.getElementById(id);
    if (el){ el.addEventListener('input',liveCb); el.addEventListener('change',liveCb); }
  });

  // 2) Parytet wierszy przy dodawaniu (oba przyciski)
  const advAddBtn = document.getElementById('advAddMeasurementBtn');
  const inAddBtn  = document.getElementById('intakeAddRow');
  if (advAddBtn){
    advAddBtn.addEventListener('click', () => {
      // po oryginalnym add — wyrównaj intake
      setTimeout(() => {
        _ensureIntakeParityWithAdv();
        // nowym wierszom dołóż nasłuchy (input/change) po stronie Advanced
        _advRows().forEach(row=>{
          if (row._wiredAdv) return;
          row._wiredAdv = true;
          row.addEventListener('input', (e)=>{
            // Synchronizuj do Intake tylko dla pól wieku (lata/miesiące), wzrostu lub wagi
            if (!e.target.matches('.adv-age-years,.adv-age-months,.adv-height,.adv-weight')) return;
            _syncAdvRowToIntake(row);
          });
          const rm = row.querySelector('.remove-measure');
          if (rm && !rm._wired){
            rm._wired = true;
            rm.addEventListener('click', ()=>{
              const idx = _advRows().indexOf(row);
              const twin = _intkRows()[idx+1];
              if (twin) twin.remove();
              if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
              if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc();
            });
          }
        });
        if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
      },0);
    });
  }
  if (inAddBtn){
    inAddBtn.addEventListener('click', () => {
      // jeżeli istnieje addAdvMeasurementRow – dodaj też bliźniaka w Advanced
      setTimeout(() => {
        const inRows = _intkRows().length;
        const advN = _advRows().length;
        const hasFirst = _intkRows()[0]?.dataset.locked === 'true';
        const intendedAdv = (inRows - (hasFirst?1:0));
        if (typeof addAdvMeasurementRow === 'function'){
          while (_advRows().length < intendedAdv) addAdvMeasurementRow();
        }
        if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
      },0);
    });
  }

  // 3) Dwukierunkowe nasłuchy inputów
  const advWrap = document.getElementById('advMeasurements');
  if (advWrap){
    advWrap.addEventListener('input', (e)=>{
      // Reaguj tylko na zmiany w polach wieku (lata/miesiące), wzrostu lub wagi
      if (!e.target.matches('.adv-age-years,.adv-age-months,.adv-height,.adv-weight')) return;
      _ensureIntakeParityWithAdv();
      const rowEl = e.target.closest('.measure-row');
      if (rowEl) _syncAdvRowToIntake(rowEl);
    });

    // Usuwanie pomiaru w Advanced (przycisk ×) usuwa także odpowiedni wiersz po stronie intake.
    // Dodajemy handler w fazie capture, aby wykonał się przed innymi nasłuchami.
    advWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-measure');
      if (!btn) return;
      const row = btn.closest('.measure-row');
      if (!row) return;
      // Znajdź indeks wiersza po stronie Advanced.
      const idx = _advRows().indexOf(row);
      if (idx >= 0) {
        // Odpowiadający wiersz po stronie Intake to idx+1 (0 = zablokowany „Dane użytkownika”).
        const twin = _intkRows()[idx + 1];
        if (twin) twin.remove();
        if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
        if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc();
      }
    }, true);
  }
  const intkWrap = document.getElementById('intakeMeasurements');
  if (intkWrap){
    // intake → Advanced (poza 1. wierszem)
    intkWrap.addEventListener('input', (e)=>{
      if (!e.target.matches('.intake-ageY,.intake-ageM,.intake-ht,.intake-wt')) return;
      const row = e.target.closest('.measure-row-intake');
      if (row?.dataset.locked === 'true') return; // pierwszy wiersz
      _syncIntakeRowToAdv(row);
    });
    // usuwanie (capture: najpierw skasuj bliźniaka w Advanced)
    intkWrap.addEventListener('click', (e)=>{
      const btn = e.target.closest('.remove-intake-row'); if (!btn) return;
      const row = btn.closest('.measure-row-intake');
      if (row?.dataset.locked === 'true'){ e.preventDefault(); return; }
      const rows = _intkRows(); const idx = rows.indexOf(row);
      if (idx>0){
        const advRow = _advRows()[idx-1]; if (advRow) advRow.remove();
        if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced();
      }
    }, true);
  }

  // 4) 1.F — rozszerzenie clearAdvancedGrowthCard() o czyszczenie „bliźniaków”
  if (typeof clearAdvancedGrowthCard === 'function'){
    const __origClear = clearAdvancedGrowthCard;
    window.clearAdvancedGrowthCard = function(){
      const ret = __origClear.apply(this, arguments);
      // usuń wszystkie intake-wiersze poza pierwszym (zablokowanym)
      const rows = _intkRows();
      rows.slice(1).forEach(r => r.remove());
      _updateIntakeFirstRowFromUserBasics();
      if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
      if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc();
      return ret;
    };
  }

  // 5) Uszczelnij regułę ukrywania „×” w 1. wierszu (jeśli funkcja istnieje)
  if (typeof updateIntakeRemoveButtons === 'function'){
    const __origUi = updateIntakeRemoveButtons;
    window.updateIntakeRemoveButtons = function(){
      __origUi.apply(this, arguments);
      const rows = _intkRows();
      rows.forEach((row, idx)=>{
        const btn = row.querySelector('.remove-intake-row');
        if (btn) btn.style.display = (idx===0 || row.dataset.locked==='true') ? 'none' : btn.style.display;
      });
    };
  }
});

document.addEventListener('DOMContentLoaded', update);

function animateValue(el, end, unit=''){
  const start = 0;
  const duration = 600;
  const startTime = performance.now();
  function step(now){
    const t = Math.min((now - startTime)/duration, 1);
    const val = (start + (end - start)*t).toFixed(1);
    el.textContent = val + unit;
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function createScaleIcon(){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('width','20');
  svg.setAttribute('height','20');
  svg.setAttribute('aria-hidden','true');
  svg.style.marginRight='0.35rem';
  const path = document.createElementNS(ns,'path');
  path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-linecap','round');
  path.setAttribute('stroke-linejoin','round');
  path.setAttribute('stroke-width','1.8');
  path.setAttribute('d','M6 8h12M6 8a6 6 0 006 6 6 6 0 006-6M6 8v8a6 6 0 006 6 6 6 0 006-6V8');
  svg.appendChild(path);
  return svg;
}

document.addEventListener('DOMContentLoaded', ()=>{
  const observer = new MutationObserver((mutations)=>{
    mutations.forEach(m=>{
      m.addedNodes.forEach(node=>{
        if(node.nodeType===1 && node.classList.contains('result-box')){
            enhanceResult(node);
        }
      });
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});

  function enhanceResult(box){
     if(box.dataset.enhanced) return;
     box.dataset.enhanced = '1';
     box.classList.add('result-card','animate-in','--pulse');
     const strong = box.querySelector('strong');
     if(!strong) return;
     // prepend icon
     strong.prepend(createScaleIcon());
     const match = strong.textContent.match(/BMI:?\s*([\d.,]+)/i);
     if(match){
        const numVal = parseFloat(match[1].replace(',','.'));
        const span = document.createElement('span');
        span.className = 'result-number';
        span.textContent = match[1];
        strong.innerHTML = strong.innerHTML.replace(match[1], span.outerHTML);
        const numEl = strong.querySelector('.result-number');
        animateValue(numEl, numVal);
     }
     // NEW: apply pulse animation based on BMI severity. If the result box has
     // class .bmi-danger (Otyłość) or .bmi-warning (Niedowaga/Nadwaga), apply the
     // corresponding pulse effect.
     if (box.classList.contains('bmi-danger')) {
        applyPulse(box, 'danger');
     } else if (box.classList.contains('bmi-warning')) {
        applyPulse(box, 'warning');
     }
  }
});

/* === APPLY DATA CARD STYLE TO SPECIFIC TABLES === */
document.addEventListener('DOMContentLoaded', ()=>{
  ['toNormCard','dietPlanCard'].forEach(id=>{
    const card=document.getElementById(id);
    if(card){
      card.classList.add('result-card','animate-in');
    }
  });
  document.querySelectorAll('#toNormCard table, #dietPlanCard table').forEach(t=>{
    t.classList.add('data-card');
  });
});

// WHO 2007 BMI-for-age LMS tables (months 24‑228) – generated 2025‑06‑30

// Derived percentiles P5, P85, P95 for quick lookup

// Replace helper functions to use these tables

// Oblicz z‑score BMI dla dzieci – z obsługą rozszerzonych danych Palczewskiej.
function bmiZscore(bmi, sex, months){
  // Jeśli wybrano Palczewską, oblicz z‑score na podstawie jej siatek centylowych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    const ageYears = months / 12;
    const stats = calcPercentileStatsPal(bmi, sex, ageYears, 'BMI');
    return stats ? stats.sd : null;
  }
  // W pozostałych przypadkach użyj LMS (WHO/OLAF)
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L,M,S] = lms;
  return (L!==0) ? (Math.pow(bmi/M, L)-1)/(L*S) : Math.log(bmi/M)/S;
}

// Oblicz percentyl BMI dla dzieci z uwzględnieniem Palczewskiej
function bmiPercentileChild(bmi, sex, months){
  // Palczewska: interpolacja percentyla z rozszerzonych danych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    return bmiPercentileChildPal(bmi, sex, months);
  }
  const z = bmiZscore(bmi, sex, months);
  return z===null ? null : normalCDF(z)*100;
}

// Klasyfikacja BMI u dzieci (niedowaga/prawidłowe/nadwaga/otyłość) z obsługą Palczewskiej
function bmiCategoryChild(bmi, sex, months){
  /*
   * Ustal, czy stosować polskie progi centylowe (OLAF/Palczewska) dla BMI.
   * Zgodnie z dotychczasową logiką, wykorzystujemy progi OLAF/Palczewska
   * dopiero od 3. roku życia (>=36 mies.), gdy istnieją referencyjne centyle.
   * Dla młodszych dzieci (<36 mies.) zawsze stosujemy progi WHO.
   */
  const useOlaf = (typeof bmiSource !== 'undefined' &&
                   (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') &&
                   months >= OLAF_DATA_MIN_AGE * 12);
  const p = bmiPercentileChild(bmi, sex, months);
  // Jeśli percentyl jest niedostępny, zastosuj klasyfikację dorosłych jako fallback
  if(p === null) return bmiCategory(bmi);
  const normHi  = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
  // Najpierw sprawdź z‑score – skrajnie wysokie BMI klasyfikujemy jako otyłość olbrzymią (>3 SD)
  const z = bmiZscore(bmi, sex, months);
  if (z !== null && z >= 3) return 'Otyłość olbrzymia';
  // Niedowaga poniżej 5. centyla
  if (p < PERCENTILE_CUTOFF_UNDERWEIGHT) return 'Niedowaga';
  // Prawidłowe BMI pomiędzy 5 a górną granicą normy
  if (p < normHi) return 'Prawidłowe';
  // Nadwaga poniżej progu otyłości
  if (p < obesity) return 'Nadwaga';
  // Otyłość (percentyl ≥ progu otyłości)
  return 'Otyłość';
}
/* kcalFor1km deduplicated – use activities object */
function kcalFor1km(activity, weight){
  const actKey=activity in activities?activity:null;
  if(!actKey) return 0;
  const {MET,speed}=activities[actKey];
  const kcalPerMin=(MET*3.5*weight)/200;
  return kcalPerMin*(60/speed);
}

// Infant LMS tables (0–60 mies.)
const LMS_INFANT_BOYS = {"0":[0.5094, 13.3843, 0.09769],"1":[0.2669, 14.9822, 0.09017],"2":[0.1113, 16.3231, 0.08676],"3":[0.0048, 16.9069, 0.08492],"4":[-0.0732, 17.1594, 0.08378],"5":[-0.1366, 17.2914, 0.08297],"6":[-0.1919, 17.3424, 0.08233],"7":[-0.2384, 17.3289, 0.08183],"8":[-0.2808, 17.2633, 0.08139],"9":[-0.3177, 17.1659, 0.08102],"10":[-0.3523, 17.0463, 0.08067],"11":[-0.383, 16.9231, 0.08037],"12":[-0.4122, 16.7951, 0.08008],"13":[-0.4384, 16.6731, 0.07982],"14":[-0.4629, 16.5553, 0.07958],"15":[-0.4867, 16.4393, 0.07934],"16":[-0.5082, 16.3335, 0.07913],"17":[-0.5292, 16.2311, 0.07892],"18":[-0.5485, 16.1388, 0.07873],"19":[-0.5673, 16.0509, 0.07853],"20":[-0.5847, 15.9737, 0.07836],"21":[-0.6013, 15.9043, 0.07818],"22":[-0.6176, 15.8405, 0.07802],"23":[-0.6328, 15.7853, 0.07786],"24":[-0.6187, 16.0189, 0.07785],"25":[-0.584, 15.9799, 0.07792],"26":[-0.549, 15.9406, 0.078],"27":[-0.5164, 15.9034, 0.07809],"28":[-0.4843, 15.8658, 0.07819],"29":[-0.4549, 15.8303, 0.07829],"30":[-0.4275, 15.7954, 0.07841],"31":[-0.4013, 15.7601, 0.07854],"32":[-0.3782, 15.7267, 0.07867],"33":[-0.3568, 15.6928, 0.07882],"34":[-0.3388, 15.6609, 0.07897],"35":[-0.3228, 15.6287, 0.07914],"36":[-0.31, 15.5986, 0.07931],"37":[-0.3, 15.5695, 0.07949],"38":[-0.2927, 15.5406, 0.07969],"39":[-0.2884, 15.5141, 0.0799],"40":[-0.2869, 15.4881, 0.08013],"41":[-0.2881, 15.4645, 0.08036],"42":[-0.292, 15.4416, 0.08061],"43":[-0.2982, 15.4209, 0.08087],"44":[-0.3069, 15.4008, 0.08115],"45":[-0.3175, 15.3825, 0.08144],"46":[-0.3302, 15.3652, 0.08174],"47":[-0.3455, 15.3483, 0.08206],"48":[-0.3622, 15.3326, 0.08238],"49":[-0.3815, 15.3171, 0.08273],"50":[-0.402, 15.3029, 0.08307],"51":[-0.425, 15.2888, 0.08344],"52":[-0.449, 15.2758, 0.08381],"53":[-0.4745, 15.2634, 0.08418],"54":[-0.5022, 15.2513, 0.08457],"55":[-0.5302, 15.24, 0.08496],"56":[-0.5604, 15.229, 0.08537],"57":[-0.5906, 15.2188, 0.08577],"58":[-0.623, 15.2089, 0.08618],"59":[-0.6554, 15.2, 0.08659],"60":[-0.69, 15.1914, 0.08701]};
const LMS_INFANT_GIRLS = {"0":[0.6142, 13.2455, 0.09866],"1":[0.3406, 14.6003, 0.09551],"2":[0.1743, 15.7713, 0.09371],"3":[0.0621, 16.3668, 0.09252],"4":[-0.0197, 16.6722, 0.09166],"5":[-0.086, 16.8379, 0.09096],"6":[-0.1436, 16.9086, 0.09035],"7":[-0.1915, 16.9021, 0.08984],"8":[-0.2351, 16.839, 0.08938],"9":[-0.2726, 16.7404, 0.08898],"10":[-0.3075, 16.6157, 0.0886],"11":[-0.3382, 16.4867, 0.08827],"12":[-0.3674, 16.3536, 0.08796],"13":[-0.3934, 16.2298, 0.08768],"14":[-0.4176, 16.1132, 0.08741],"15":[-0.441, 16.0013, 0.08716],"16":[-0.4623, 15.9017, 0.08693],"17":[-0.4829, 15.808, 0.08671],"18":[-0.5018, 15.726, 0.0865],"19":[-0.5203, 15.6501, 0.0863],"20":[-0.5374, 15.585, 0.08611],"21":[-0.5536, 15.5281, 0.08594],"22":[-0.5697, 15.4782, 0.08576],"23":[-0.5846, 15.4381, 0.0856],"24":[-0.5684, 15.6881, 0.08454],"25":[-0.5684, 15.6589, 0.08452],"26":[-0.5684, 15.6302, 0.08449],"27":[-0.5684, 15.6036, 0.08446],"28":[-0.5684, 15.577, 0.08444],"29":[-0.5684, 15.5521, 0.08443],"30":[-0.5684, 15.5277, 0.08444],"31":[-0.5684, 15.503, 0.08448],"32":[-0.5684, 15.4798, 0.08455],"33":[-0.5684, 15.4568, 0.08467],"34":[-0.5684, 15.4355, 0.08484],"35":[-0.5684, 15.415, 0.08507],"36":[-0.5684, 15.3966, 0.08535],"37":[-0.5684, 15.3797, 0.08569],"38":[-0.5684, 15.3636, 0.08609],"39":[-0.5684, 15.3493, 0.08654],"40":[-0.5684, 15.3356, 0.08704],"41":[-0.5684, 15.3233, 0.08757],"42":[-0.5684, 15.3114, 0.08814],"43":[-0.5684, 15.3006, 0.08872],"44":[-0.5684, 15.2903, 0.08933],"45":[-0.5684, 15.2813, 0.08992],"46":[-0.5684, 15.2732, 0.0905],"47":[-0.5684, 15.266, 0.0911],"48":[-0.5684, 15.2602, 0.09168],"49":[-0.5684, 15.2555, 0.09229],"50":[-0.5684, 15.2523, 0.09287],"51":[-0.5684, 15.2503, 0.09346],"52":[-0.5684, 15.2496, 0.09404],"53":[-0.5684, 15.2502, 0.0946],"54":[-0.5684, 15.2519, 0.09516],"55":[-0.5684, 15.2543, 0.09567],"56":[-0.5684, 15.2576, 0.09618],"57":[-0.5684, 15.2612, 0.09665],"58":[-0.5684, 15.2654, 0.0971],"59":[-0.5684, 15.2698, 0.0975],"60":[-0.5684, 15.2748, 0.0979]};

// Infant percentiles (P5, P85, P95)
const bmiInfantBoys = {"0":{"P5": 11.32, "P85": 14.77, "P95": 15.62},"1":{"P5": 12.88, "P85": 16.43, "P95": 17.33},"2":{"P5": 14.14, "P85": 17.85, "P95": 18.81},"3":{"P5": 14.7, "P85": 18.46, "P95": 19.44},"4":{"P5": 14.96, "P85": 18.72, "P95": 19.71},"5":{"P5": 15.1, "P85": 18.85, "P95": 19.85},"6":{"P5": 15.17, "P85": 18.9, "P95": 19.89},"7":{"P5": 15.18, "P85": 18.88, "P95": 19.87},"8":{"P5": 15.14, "P85": 18.8, "P95": 19.79},"9":{"P5": 15.07, "P85": 18.69, "P95": 19.67},"10":{"P5": 14.97, "P85": 18.56, "P95": 19.53},"11":{"P5": 14.88, "P85": 18.42, "P95": 19.38},"12":{"P5": 14.77, "P85": 18.28, "P95": 19.23},"13":{"P5": 14.67, "P85": 18.14, "P95": 19.09},"14":{"P5": 14.58, "P85": 18.01, "P95": 18.95},"15":{"P5": 14.49, "P85": 17.88, "P95": 18.81},"16":{"P5": 14.4, "P85": 17.76, "P95": 18.69},"17":{"P5": 14.32, "P85": 17.65, "P95": 18.57},"18":{"P5": 14.24, "P85": 17.54, "P95": 18.46},"19":{"P5": 14.17, "P85": 17.45, "P95": 18.36},"20":{"P5": 14.11, "P85": 17.36, "P95": 18.26},"21":{"P5": 14.05, "P85": 17.28, "P95": 18.18},"22":{"P5": 14.0, "P85": 17.21, "P95": 18.11},"23":{"P5": 13.96, "P85": 17.15, "P95": 18.04},"24":{"P5": 14.16, "P85": 17.4, "P95": 18.31},"25":{"P5": 14.12, "P85": 17.36, "P95": 18.26},"26":{"P5": 14.08, "P85": 17.31, "P95": 18.21},"27":{"P5": 14.04, "P85": 17.27, "P95": 18.16},"28":{"P5": 14.0, "P85": 17.23, "P95": 18.12},"29":{"P5": 13.97, "P85": 17.19, "P95": 18.08},"30":{"P5": 13.93, "P85": 17.16, "P95": 18.04},"31":{"P5": 13.9, "P85": 17.12, "P95": 18.0},"32":{"P5": 13.86, "P85": 17.08, "P95": 17.96},"33":{"P5": 13.82, "P85": 17.05, "P95": 17.92},"34":{"P5": 13.79, "P85": 17.02, "P95": 17.89},"35":{"P5": 13.76, "P85": 16.98, "P95": 17.85},"36":{"P5": 13.73, "P85": 16.95, "P95": 17.82},"37":{"P5": 13.7, "P85": 16.92, "P95": 17.79},"38":{"P5": 13.66, "P85": 16.9, "P95": 17.76},"39":{"P5": 13.64, "P85": 16.87, "P95": 17.74},"40":{"P5": 13.61, "P85": 16.85, "P95": 17.72},"41":{"P5": 13.58, "P85": 16.82, "P95": 17.7},"42":{"P5": 13.56, "P85": 16.8, "P95": 17.68},"43":{"P5": 13.53, "P85": 16.79, "P95": 17.66},"44":{"P5": 13.51, "P85": 16.77, "P95": 17.65},"45":{"P5": 13.49, "P85": 16.76, "P95": 17.64},"46":{"P5": 13.47, "P85": 16.74, "P95": 17.63},"47":{"P5": 13.45, "P85": 16.73, "P95": 17.62},"48":{"P5": 13.43, "P85": 16.72, "P95": 17.62},"49":{"P5": 13.41, "P85": 16.71, "P95": 17.61},"50":{"P5": 13.4, "P85": 16.7, "P95": 17.61},"51":{"P5": 13.38, "P85": 16.7, "P95": 17.61},"52":{"P5": 13.36, "P85": 16.69, "P95": 17.61},"53":{"P5": 13.35, "P85": 16.69, "P95": 17.61},"54":{"P5": 13.33, "P85": 16.68, "P95": 17.62},"55":{"P5": 13.32, "P85": 16.68, "P95": 17.62},"56":{"P5": 13.3, "P85": 16.68, "P95": 17.63},"57":{"P5": 13.29, "P85": 16.67, "P95": 17.63},"58":{"P5": 13.28, "P85": 16.67, "P95": 17.64},"59":{"P5": 13.26, "P85": 16.67, "P95": 17.65},"60":{"P5": 13.25, "P85": 16.67, "P95": 17.66}};
const bmiInfantGirls = {"0":{"P5": 11.16, "P85": 14.63, "P95": 15.46},"1":{"P5": 12.42, "P85": 16.09, "P95": 17.01},"2":{"P5": 13.49, "P85": 17.37, "P95": 18.36},"3":{"P5": 14.05, "P85": 18.01, "P95": 19.04},"4":{"P5": 14.34, "P85": 18.34, "P95": 19.39},"5":{"P5": 14.51, "P85": 18.51, "P95": 19.57},"6":{"P5": 14.6, "P85": 18.58, "P95": 19.65},"7":{"P5": 14.61, "P85": 18.57, "P95": 19.64},"8":{"P5": 14.57, "P85": 18.49, "P95": 19.56},"9":{"P5": 14.5, "P85": 18.38, "P95": 19.44},"10":{"P5": 14.41, "P85": 18.24, "P95": 19.29},"11":{"P5": 14.31, "P85": 18.09, "P95": 19.13},"12":{"P5": 14.2, "P85": 17.94, "P95": 18.97},"13":{"P5": 14.11, "P85": 17.8, "P95": 18.83},"14":{"P5": 14.01, "P85": 17.67, "P95": 18.69},"15":{"P5": 13.92, "P85": 17.55, "P95": 18.56},"16":{"P5": 13.85, "P85": 17.43, "P95": 18.44},"17":{"P5": 13.77, "P85": 17.33, "P95": 18.33},"18":{"P5": 13.71, "P85": 17.24, "P95": 18.23},"19":{"P5": 13.65, "P85": 17.15, "P95": 18.14},"20":{"P5": 13.6, "P85": 17.08, "P95": 18.06},"21":{"P5": 13.55, "P85": 17.01, "P95": 17.99},"22":{"P5": 13.51, "P85": 16.96, "P95": 17.93},"23":{"P5": 13.48, "P85": 16.91, "P95": 17.88},"24":{"P5": 13.72, "P85": 17.16, "P95": 18.13},"25":{"P5": 13.7, "P85": 17.13, "P95": 18.1},"26":{"P5": 13.67, "P85": 17.1, "P95": 18.06},"27":{"P5": 13.65, "P85": 17.07, "P95": 18.03},"28":{"P5": 13.63, "P85": 17.04, "P95": 18.0},"29":{"P5": 13.61, "P85": 17.01, "P95": 17.97},"30":{"P5": 13.58, "P85": 16.99, "P95": 17.94},"31":{"P5": 13.56, "P85": 16.96, "P95": 17.92},"32":{"P5": 13.54, "P85": 16.94, "P95": 17.89},"33":{"P5": 13.52, "P85": 16.91, "P95": 17.87},"34":{"P5": 13.5, "P85": 16.89, "P95": 17.85},"35":{"P5": 13.47, "P85": 16.87, "P95": 17.83},"36":{"P5": 13.45, "P85": 16.86, "P95": 17.82},"37":{"P5": 13.43, "P85": 16.85, "P95": 17.81},"38":{"P5": 13.41, "P85": 16.84, "P95": 17.81},"39":{"P5": 13.39, "P85": 16.83, "P95": 17.81},"40":{"P5": 13.36, "P85": 16.82, "P95": 17.81},"41":{"P5": 13.34, "P85": 16.82, "P95": 17.81},"42":{"P5": 13.32, "P85": 16.82, "P95": 17.81},"43":{"P5": 13.3, "P85": 16.82, "P95": 17.82},"44":{"P5": 13.28, "P85": 16.82, "P95": 17.83},"45":{"P5": 13.26, "P85": 16.82, "P95": 17.83},"46":{"P5": 13.24, "P85": 16.82, "P95": 17.84},"47":{"P5": 13.22, "P85": 16.82, "P95": 17.85},"48":{"P5": 13.2, "P85": 16.83, "P95": 17.87},"49":{"P5": 13.19, "P85": 16.83, "P95": 17.88},"50":{"P5": 13.17, "P85": 16.84, "P95": 17.9},"51":{"P5": 13.16, "P85": 16.85, "P95": 17.91},"52":{"P5": 13.15, "P85": 16.86, "P95": 17.93},"53":{"P5": 13.14, "P85": 16.87, "P95": 17.95},"54":{"P5": 13.13, "P85": 16.88, "P95": 17.97},"55":{"P5": 13.12, "P85": 16.89, "P95": 17.99},"56":{"P5": 13.11, "P85": 16.91, "P95": 18.01},"57":{"P5": 13.11, "P85": 16.92, "P95": 18.03},"58":{"P5": 13.1, "P85": 16.93, "P95": 18.05},"59":{"P5": 13.1, "P85": 16.94, "P95": 18.07},"60":{"P5": 13.09, "P85": 16.96, "P95": 18.09}};

// Merge with existing bmiPercentiles, overriding duplicates 0–60 mies.
if(typeof bmiPercentiles !== 'undefined'){{
  Object.assign(bmiPercentiles.boys, bmiInfantBoys);
  Object.assign(bmiPercentiles.girls, bmiInfantGirls);
}}

function getLMS(sex, months){
  const m = Math.round(months);
  // Nie wymuszaj źródła danych dla niemowląt – użytkownik może wybrać WHO lub polskie dane.
  // 1) OLAF, jeżeli wybrany oraz zakres 36–216 mies.
  if(bmiSource === 'OLAF' && m >= 36 && m <= 216){
    const olaf = (sex==='M' ? OLAF_LMS_BOYS[m] : OLAF_LMS_GIRLS[m]);
    if(olaf) return olaf;
  }

  // 2) WHO 0‑5 l. (infant) – m ≤ 60
  if(m <= 60){
    return (sex==='M' ? LMS_INFANT_BOYS[m] : LMS_INFANT_GIRLS[m]) || null;
  }

  // 3) WHO 5‑19 l. (domyślnie)
  return (sex==='M' ? LMS_BOYS[m] : LMS_GIRLS[m]) || null;
}
// bmiPercentileChild stays unchanged – it will now see infant LMS
(function(){
  const MEDIAN_ADULT_BMI = 22.0;
  const getMedianBMI = (age, sex) => {
    if(age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
      const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(age*12)) : null;
      return lms ? lms[1] : MEDIAN_ADULT_BMI;
    }
    return MEDIAN_ADULT_BMI;
  };

  // Wrap existing update() again
  const prevUpdate = window.update;
  window.update = function(){
    prevUpdate && prevUpdate();

    const weight = +document.getElementById('weight').value || 0;
    const height = +document.getElementById('height').value || 0;
    // Używamy wieku z uwzględnieniem miesięcy (0 oznacza brak danych)
    const age    = getAgeDecimal();
    const sex    = document.getElementById('sex').value;

    if(!(weight > 0 && height > 0)) return;

    // calculate kg to 50th percentile
    const targetBMI50 = getMedianBMI(age, sex);
    const targetWeight50 = targetBMI50 * Math.pow(height/CM_TO_M, 2);
    const kgTo50 = weight - targetWeight50;        // positive => need to lose

    // only show when there is weight to lose (>0.1 kg)
    if(kgTo50 <= 0.1) return;

    const toNormInfo = document.getElementById('toNormInfo');
    if(!toNormInfo) return;

    const box = toNormInfo.querySelector('.result-box');
    if(!box) return;

    // check if element already exists
    let span = box.querySelector('.bmi50-info');
    if(!span){
      span = document.createElement('span');
      span.className = 'bmi50-info';
      span.style.display = 'block';
      span.style.fontSize = '0.95rem';
      span.style.marginTop = '4px';
      box.querySelector('strong')?.insertAdjacentElement('afterend', span);
    }
    span.innerHTML = `Do 50&nbsp;centyla BMI brakuje <strong>${kgTo50.toFixed(1)} kg</strong>`;
  };
})();

(function(){
  function animateValue(el, end, unit=''){
    if(!el) return;
    const start = 0;
    const duration = 600;
    const startTime = performance.now();
    function step(now){
      const t = Math.min((now - startTime)/duration, 1);
      const val = (start + (end - start)*t).toFixed(0);
      el.textContent = val + unit;
      if(t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- helper to patch plan table rows ---- */
  function enhancePlanTable(){
    const planResults = document.getElementById('planResults');
    if(!planResults) return;
    planResults.querySelectorAll('tr').forEach(row=>{
      const first = row.children[0]?.textContent.trim();
      if(first === 'Kg do redukcji' && !row.dataset.bold){
          row.children[0].innerHTML = '<strong>Kg do redukcji</strong>';
          row.children[1].innerHTML = '<strong>'+row.children[1].textContent+'</strong>';
          row.dataset.bold = '1';
      }
      if(first === 'Szacowany czas' && !row.dataset.enh){
          const match = row.children[1].textContent.match(/(\d+)\s*tyg/);
          if(match){
              const weeks = match[1];
              const rest  = row.children[1].innerHTML.split('tyg')[1];
              row.children[1].innerHTML = '<strong><span class="plan-time" data-weeks="'+weeks+'">'+weeks+'</span> tyg'+rest+'</strong>';
          }
          row.dataset.enh = '1';
      }
    });
  }

  function animateNewNumbers(){
    document.querySelectorAll('.plan-time').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.weeks||el.textContent)||0;
        animateValue(el, val, '');
    });
    document.querySelectorAll('.bmi50-number').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.val||el.textContent)||0;
        animateValue(el, val, '');
    });
  }

  /* ---- Observe mutations to trigger enhancements ---- */
  const obs = new MutationObserver(()=>{
      enhancePlanTable();
      animateNewNumbers();
  });
  obs.observe(document.body,{childList:true,subtree:true});

})();

(function(){
  function animateVal(el,end){
    if(!el) return;
    const dur=600;
    const startT=performance.now();
    function step(now){
      const t=Math.min((now-startT)/dur,1);
      el.textContent=(end*t).toFixed(end%1?1:0);
      if(t<1)requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function transformPlan(){
    const planResults=document.getElementById('planResults');
    if(!planResults) return;
    planResults.querySelectorAll('.plan-col strong').forEach(st=>{
       if(st.dataset.sm50) return;
       const txt=st.innerHTML;
       if(/BMI\s*50/.test(txt)){
          st.innerHTML=txt.replace(/BMI\s*50(?:\.0)?/i,'BMI 50');
          st.dataset.sm50='1';
       }
    });
    planResults.querySelectorAll('tr').forEach(row=>{
       const label=row.children[0]?.textContent.trim();
       if(label==='Kg do redukcji' && !row.dataset.bold){
           row.children[0].innerHTML='<strong>Kg do redukcji</strong>';
           row.children[1].innerHTML='<strong>'+row.children[1].textContent+'</strong>';
           row.dataset.bold='1';
       }
       if(label==='Szacowany czas' && !row.dataset.enh){
           const weeksMatch=row.children[1].textContent.match(/(\d+)/);
           if(weeksMatch){
              const weeks=parseInt(weeksMatch[1]);
              const months=(weeks/4.345).toFixed(1);
              const years=(months/12).toFixed(1);
              row.children[1].innerHTML='<strong>'
              +'<span class="plan-time" data-val="'+weeks+'">'+weeks+'</span> tyg<br>('
              +'<span class="plan-month" data-val="'+months+'">'+months+'</span> mies)<br>('
              +'<span class="plan-year" data-val="'+years+'">'+years+'</span> lat)'
              +'</strong>';
           }
           row.dataset.enh='1';
       }
    });
    planResults.querySelectorAll('.plan-time,.plan-month,.plan-year').forEach(el=>{
       if(el.dataset.animated) return;
       el.dataset.animated='1';
       animateVal(el, parseFloat(el.dataset.val||el.textContent.replace(',','.')));
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    // Obsługa zmian na trójpozycyjnym suwaku wyboru źródła danych
    const toggleContainer = document.getElementById('dataToggleContainer');
    if (toggleContainer) {
      const radios = toggleContainer.querySelectorAll('input[name="dataSource"]');
      radios.forEach(input => {
        input.addEventListener('change', () => {
          // Zaznacz, że użytkownik zmienił ręcznie ustawienie, aby nie nadpisać wyboru podczas update()
          toggleContainer.dataset.manual = '1';
          bmiSource = input.value;
          update();
        });
      });
    }
  });
  const obs=new MutationObserver(transformPlan);
  obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',transformPlan);
})();

/*
 * Moduł profesjonalny – obliczanie dawek dla testów stymulacyjnych GH.
 * Ten blok kodu odpowiada za obsługę checkboxa „Jestem lekarzem”,
 * weryfikację numeru PWZ oraz wyświetlanie kart z wynikami testów.
 * Obliczenia są wykonywane na podstawie masy ciała (kg), wzrostu (cm)
 * oraz powierzchni ciała (m²) wyliczanej wzorem Mostellera.
 */
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const isDoctorCheckbox   = document.getElementById('isDoctor');
    const pwzContainer       = document.getElementById('pwzContainer');
    const pwzNumberInput     = document.getElementById('pwzNumber');
    const pwzError           = document.getElementById('pwzError');
    const professionalModule = document.getElementById('professionalModule');
    const toggleGhTestsBtn   = document.getElementById('toggleGhTests');
    // Kontener dla przycisku testów GH (umieszczony poza modułem profesjonalnym)
    const ghButtonWrapper    = document.getElementById('ghButtonWrapper');
    // Kontenery z testami GH podzielone na kolumny (lewa i prawa). Zastępują dawny ghTestsContainer.
    const ghTestsLeft  = document.getElementById('ghTestsLeft');
    const ghTestsRight = document.getElementById('ghTestsRight');

    // === NOWE TESTY: OGTT/GnRH i ACTH/TRH ===
    // Pobierz przyciski i kontenery dla nowych testów. Domyślnie są ukryte i pojawiają się
    // dopiero po pozytywnej weryfikacji numeru PWZ. Każdy przycisk steruje swoją
    // parą kart wynikowych.
    const toggleOgttTestsBtn = document.getElementById('toggleOgttTests');
    const ogttButtonWrapper  = document.getElementById('ogttButtonWrapper');
    const ogttTestsLeft      = document.getElementById('ogttTestsLeft');
    const ogttTestsRight     = document.getElementById('ogttTestsRight');
    const toggleActhTestsBtn = document.getElementById('toggleActhTests');
    const acthButtonWrapper  = document.getElementById('acthButtonWrapper');
    const acthTestsLeft      = document.getElementById('acthTestsLeft');
    const acthTestsRight     = document.getElementById('acthTestsRight');
    // Nowe przyciski i kontenery: główny przycisk testów endokrynologii
    // oraz przycisk leczenia hormonem wzrostu / IGF-1 wraz z listą podprzycisków.
    const toggleEndoTestsBtn  = document.getElementById('toggleEndoTests');
    const endoButtonWrapper   = document.getElementById('endoButtonWrapper');
    const toggleIgfTestsBtn   = document.getElementById('toggleIgfTests');
    const igfButtonWrapper    = document.getElementById('igfButtonWrapper');
    const snpButtonWrapper    = document.getElementById('snpButtonWrapper');
    const turnerButtonWrapper = document.getElementById('turnerButtonWrapper');
    const pwsButtonWrapper    = document.getElementById('pwsButtonWrapper');
    const sgaButtonWrapper    = document.getElementById('sgaButtonWrapper');
    const igf1ButtonWrapper   = document.getElementById('igf1ButtonWrapper');
    // Kontener dla przycisku antybiotykoterapii. Sekcja ta jest analogiczna do innych
    // przycisków modułu lekarskiego i powinna być wyświetlana wyłącznie po pozytywnej
    // weryfikacji numeru PWZ. Element ten zostanie zainicjowany również tutaj, aby
    // umożliwić jego pokazanie/ukrycie zależnie od stanu użytkownika.
    const abxButtonWrapper    = document.getElementById('abxButtonWrapper');

    if(!isDoctorCheckbox) return;

    // Obsługa zmiany stanu checkboxa "Jestem lekarzem". Jeśli istnieje zapamiętany numer
    // prawa wykonywania zawodu w localStorage, to po zaznaczeniu checkboxa automatycznie
    // zostanie pokazany moduł profesjonalny bez ponownego pytania o numer. W przeciwnym
    // razie wyświetlimy pole do wpisania numeru i zweryfikujemy wpisaną wartość.
    isDoctorCheckbox.addEventListener('change', function(){
      // Po każdym kliknięciu checkboxa „Jestem lekarzem” wywołujemy krótką wibrację urządzenia (jeśli obsługiwane)
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(100);
        }
      } catch (e) {
        // ignorujemy błędy związane z brakiem obsługi wibracji
      }
      const storedPwz = localStorage.getItem('pwzNumber');
      if(this.checked){
        if(storedPwz){
          // Użytkownik uprzednio zgodził się na zapamiętanie numeru – nie pytamy ponownie.
          // Zamiast od razu pokazywać kartę z komunikatem, zastosuj overlay
          // edukacyjny, jeśli minął miesiąc od ostatniego potwierdzenia. Po potwierdzeniu
          // lub gdy overlay nie jest wymagany, aktywuj moduł profesjonalny.  Ta
          // funkcja ukryje kartę z komunikatem i pokaże odpowiednie przyciski.
          const proceedWithModule = () => {
            // Ukryj pole wprowadzania PWZ oraz komunikat o błędzie
            pwzContainer.style.display = 'none';
            pwzError.style.display     = 'none';
            // Aktywuj moduł profesjonalny bez ponownego pytania o zapamiętanie numeru
            activateProfessionalModule(storedPwz);
          };
          if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
            showProfessionalOverlay(proceedWithModule);
          } else {
            proceedWithModule();
          }
        } else {
          // Brak zapamiętanego numeru – umożliwiamy jego wpisanie i weryfikację
          pwzContainer.style.display = 'block';
          // Pokaż instrukcję wpisania numeru PWZ
          try {
            var doctorInfoEl = document.querySelector('.doctor-info');
            if (doctorInfoEl) doctorInfoEl.style.display = '';
          } catch(e) {}
          // Ukryj przyciski testów, dopóki numer nie zostanie pozytywnie zweryfikowany
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Ukryj również główne przyciski modułu lekarskiego i wszystkie podprzyciski IGF‑1
          if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
          if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
          if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
          // Wywołujemy walidację dla obecnej wartości, by w razie potrzeby od razu
          // włączyć moduł (np. po ponownym zaznaczeniu checkboxa z zachowaną wartością).
          validatePWZ();
        }
      } else {
        // Odznaczono checkbox – ukrywamy pole, moduł oraz komunikaty
        pwzContainer.style.display       = 'none';
        professionalModule.style.display = 'none';
        pwzError.style.display           = 'none';
        // Ukryj instrukcję wpisania numeru PWZ, gdy użytkownik nie jest lekarzem
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch(e) {}
        // Ukryj wszystkie przyciski testów, gdy użytkownik nie jest lekarzem
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Jeśli użytkownik wyłącza moduł profesjonalny, schowaj kartę antybiotykoterapii
        // oraz usuń podświetlenie przycisku Antybiotykoterapia. Dzięki temu karta
        // nie pozostanie widoczna, gdy użytkownik nie ma uprawnień.
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
        // Jeśli numer PWZ nie został zapamiętany, wyczyść wpisaną wartość,
        // aby przy ponownym zaznaczeniu checkboxa wymagać ponownego podania numeru.
        if (!localStorage.getItem('pwzNumber')) {
          pwzNumberInput.value = '';
        }
        // Po każdej zmianie widoczności przycisków testów aktualizuj ich szerokość.
        // Używamy requestAnimationFrame, aby poczekać na zakończenie bieżącego
        // przebiegu renderowania – dzięki temu elementy mają już właściwe
        // rozmiary, gdy funkcja pobiera ich szerokość.
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      }
    });

    // Po zainicjowaniu elementów w dokumencie: jeśli przeglądarka nie
    // przechowuje zapamiętanego numeru PWZ, upewnij się, że pole wejściowe
    // jest puste przy pierwszym załadowaniu strony. W niektórych
    // przeglądarkach formularze mogą zachowywać wcześniejsze dane
    // wprowadzane przed odświeżeniem (autouzupełnianie), co powodowałoby
    // natychmiastowe ukrywanie pola po ponownym zaznaczeniu checkboxa.
    if(!localStorage.getItem('pwzNumber')){
      pwzNumberInput.value = '';
    }

    // Po załadowaniu elementów i wstępnej inicjalizacji wywołaj logikę
    // obsługi checkboxa „Jestem lekarzem”.  Bez tego kroku pole na
    // numer PWZ mogłoby pozostać ukryte po pierwszym załadowaniu strony,
    // ponieważ handler „change” uruchamia się tylko po interakcji.
    // Dzięki dispatchEvent z eventem „change” zapewniamy, że UI zostanie
    // dostosowane zależnie od tego, czy numer PWZ jest zapamiętany oraz
    // czy overlay powinien się pojawić.
    if (isDoctorCheckbox && isDoctorCheckbox.checked) {
      setTimeout(() => {
        try {
          const ev = new Event('change');
          isDoctorCheckbox.dispatchEvent(ev);
        } catch(err) {
          // Fallback: ręcznie wykonaj część logiki z handlera
          const storedPwzInit = localStorage.getItem('pwzNumber');
          if (storedPwzInit) {
            const proceedWithModule = () => {
              pwzContainer.style.display = 'none';
              pwzError.style.display     = 'none';
              activateProfessionalModule(storedPwzInit);
            };
            if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
              showProfessionalOverlay(proceedWithModule);
            } else {
              proceedWithModule();
            }
          } else {
            pwzContainer.style.display = 'block';
            validatePWZ();
          }
        }
      }, 0);
    }

    // Walidacja numeru PWZ: 7 cyfr. Jeśli poprawny – pokaż moduł profesjonalny.
    // Funkcja obliczająca cyfrę kontrolną i weryfikująca numer PWZ.
    // Numer PWZ ma format KABCDEF, gdzie K jest cyfrą kontrolną.
    function verifyPWZ(num){
      // Sprawdź długość, cyfry i brak wiodącego zera.
      // Numer PWZ składa się z siedmiu cyfr i nie zaczyna się od zera【900424691532464†L85-L92】.
      // Używamy wyrażenia regularnego ^[1-9]\d{6}$, aby odrzucić ciągi
      // zaczynające się od 0 (np. „0000000”), które mimo poprawnej
      // cyfry kontrolnej nie są prawidłowymi numerami.
      if(!/^[1-9]\d{6}$/.test(num)) return false;
      const digits = num.split('').map(d => parseInt(d, 10));
      // Suma ważona cyfr A‑F z wagami 1..6 (indeksy 1..6 w tablicy)
      let sum = 0;
      for(let i = 1; i < digits.length; i++){
        sum += digits[i] * i;
      }
      let control = sum % 11;
      // Jeśli reszta to 10, numer jest niepoprawny
      if(control === 10) return false;
      return digits[0] === control;
    }

    /*
     * Sprawdza, czy należy wyświetlić overlay informacyjny modułu profesjonalnego.
     * Overlay jest wyświetlany, jeśli w localStorage nie zapisano daty potwierdzenia
     * (professionalConfirmedDate) lub minęło co najmniej 30 dni od ostatniego
     * potwierdzenia. Funkcja zwraca true, gdy overlay powinien się pojawić.
     */
    function shouldShowProfessionalOverlay(){
      try {
        const ts = localStorage.getItem('professionalConfirmedDate');
        if(!ts) return true;
        const last = parseInt(ts, 10);
        if(isNaN(last)) return true;
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays >= 30;
      } catch(e){
        return true;
      }
    }

    /*
     * Wyświetla pełnoekranowy overlay z informacją o charakterze edukacyjnym modułu
     * profesjonalnego i dwoma przyciskami: „Potwierdzam” oraz „Wychodzę”.
     * Po kliknięciu „Potwierdzam” zapisuje datę potwierdzenia w localStorage
     * (klucz professionalConfirmedDate) i wywołuje przekazaną funkcję callback.
     * Po kliknięciu „Wychodzę” zamyka overlay i przekierowuje użytkownika do
     * strony głównej.  Jeśli overlay nie istnieje w DOM, natychmiast wywołuje callback.
     */
    function showProfessionalOverlay(onConfirm){
      const overlay    = document.getElementById('professionalOverlay');
      const confirmBtn = document.getElementById('professionalConfirmBtn');
      const exitBtn    = document.getElementById('professionalExitBtn');
      if(!overlay || !confirmBtn || !exitBtn){
        if(typeof onConfirm === 'function') onConfirm();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        confirmBtn.removeEventListener('click', confirmHandler);
        exitBtn.removeEventListener('click', exitHandler);
      }
      function confirmHandler(){
        cleanup();
        try {
          localStorage.setItem('professionalConfirmedDate', Date.now().toString());
        } catch(e) {}
        // Ukryj kartę z komunikatem w module profesjonalnym, ponieważ została ona zastąpiona overlayem
        try {
          const msgCard = document.getElementById('professionalModule');
          if(msgCard) msgCard.style.display = 'none';
        } catch(e) {}
        if(typeof onConfirm === 'function') onConfirm();
      }
      function exitHandler(){
        cleanup();
        // Przekieruj do strony głównej serwisu
        try {
          window.location.href = '/';
        } catch(e) {
          window.location.pathname = '/';
        }
      }
      confirmBtn.addEventListener('click', confirmHandler);
      exitBtn.addEventListener('click', exitHandler);
    }

    /*
     * Wyświetla pełnoekranowy overlay z pytaniem, czy zapamiętać numer
     * prawa wykonywania zawodu lekarza w tej przeglądarce.  Używa tego
     * samego stylu co overlay modułu profesjonalnego.  Po kliknięciu
     * „Tak” zapisuje numer w localStorage (klucz pwzNumber).  Po
     * kliknięciu „Nie” nie zapisuje numeru.  Po dokonaniu wyboru
     * zamyka overlay i przywraca poprzedni stan przewijania.  Opcjonalny
     * callback onComplete jest wywoływany po zamknięciu overlayu.
     */
    function showRememberPwzOverlay(val, onComplete){
      const overlay   = document.getElementById('rememberPwzOverlay');
      const yesBtn    = document.getElementById('rememberPwzYesBtn');
      const noBtn     = document.getElementById('rememberPwzNoBtn');
      if(!overlay || !yesBtn || !noBtn){
        if(typeof onComplete === 'function') onComplete();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        yesBtn.removeEventListener('click', yesHandler);
        noBtn.removeEventListener('click', noHandler);
      }
      function yesHandler(){
        cleanup();
        try{
          localStorage.setItem('pwzNumber', val);
        }catch(e){}
        if(typeof onComplete === 'function') onComplete();
      }
      function noHandler(){
        cleanup();
        if(typeof onComplete === 'function') onComplete();
      }
      yesBtn.addEventListener('click', yesHandler);
      noBtn.addEventListener('click', noHandler);
    }

    /*
     * Aktywuje moduł profesjonalny po pozytywnej weryfikacji numeru PWZ.
     * Ukrywa zbędne elementy, pokazuje główne przyciski, resetuje pola
     * i proponuje zapamiętanie numeru PWZ.  Funkcja przyjmuje numer PWZ,
     * aby ewentualnie zapisać go w localStorage.
     */
    function activateProfessionalModule(val){
      // Ukryj komunikat o błędzie
      pwzError.style.display = 'none';
      // Ukryj instrukcję wpisania PWZ
      try {
        var doctorInfoEl = document.querySelector('.doctor-info');
        if (doctorInfoEl) doctorInfoEl.style.display = 'none';
      } catch(e) {}
      // Ukryj kartę z komunikatem modułu (zostanie ukryta również po potwierdzeniu)
      if (professionalModule) {
        professionalModule.style.display = 'none';
      }
      // Pokaż główne przyciski modułu lekarskiego
      if (abxButtonWrapper)   { abxButtonWrapper.style.display   = 'flex'; }
      if (endoButtonWrapper)  { endoButtonWrapper.style.display  = 'flex'; }
      if (igfButtonWrapper)   { igfButtonWrapper.style.display   = 'flex'; }
      // Ukryj przyciski poszczególnych testów – użytkownik rozwinie je z menu
      if (ghButtonWrapper)    { ghButtonWrapper.style.display    = 'none'; }
      if (ogttButtonWrapper)  { ogttButtonWrapper.style.display  = 'none'; }
      if (acthButtonWrapper)  { acthButtonWrapper.style.display  = 'none'; }
      // Ukryj podprzyciski IGF‑1
      if (snpButtonWrapper)    { snpButtonWrapper.style.display    = 'none'; }
      if (turnerButtonWrapper) { turnerButtonWrapper.style.display = 'none'; }
      if (pwsButtonWrapper)    { pwsButtonWrapper.style.display    = 'none'; }
      if (sgaButtonWrapper)    { sgaButtonWrapper.style.display    = 'none'; }
      if (igf1ButtonWrapper)   { igf1ButtonWrapper.style.display   = 'none'; }
      // Ukryj wszystkie listy testów
      if (ghTestsLeft  && ghTestsRight)  { ghTestsLeft.classList.remove('active');  ghTestsRight.classList.remove('active'); }
      if (ogttTestsLeft && ogttTestsRight){ ogttTestsLeft.classList.remove('active'); ogttTestsRight.classList.remove('active'); }
      if (acthTestsLeft && acthTestsRight){ acthTestsLeft.classList.remove('active'); acthTestsRight.classList.remove('active'); }
      // Dopasuj szerokości przycisków
      if (typeof adjustTestButtonWidths === 'function') {
        adjustTestButtonWidths();
      }
      // Zapytaj o zapamiętanie numeru PWZ poprzez overlay, jeśli numer nie został jeszcze zapisany
      if(!localStorage.getItem('pwzNumber')){
        // Wywołaj overlay zapamiętywania.  Nie przekazujemy callbacku, ponieważ
        // dalsza logika nie wymaga oczekiwania na wybór użytkownika.  Moduł
        // profesjonalny jest już aktywny, a overlay blokuje interakcję do
        // momentu podjęcia decyzji przez użytkownika.
        showRememberPwzOverlay(val);
      }
      // Ukryj pole wprowadzania numeru
      pwzContainer.style.display = 'none';
      // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu wymagane było
      // ponowne wpisanie numeru, jeśli nie został zapamiętany
      pwzNumberInput.value = '';
    }

    function validatePWZ(){
      const val     = pwzNumberInput.value.trim();
      const isValid = verifyPWZ(val);
      // Jeśli numer jest poprawny
      if(isValid){
        // *** Niestandardowa obsługa modułu profesjonalnego ***
        // Zamiast natychmiast pokazywać moduł profesjonalny, wywołujemy overlay
        // z komunikatem edukacyjnym. Po potwierdzeniu aktywujemy moduł.
        pwzError.style.display = 'none';
        const proceedFn = () => activateProfessionalModule(val);
        if (shouldShowProfessionalOverlay()) {
          showProfessionalOverlay(proceedFn);
        } else {
          proceedFn();
        }
        return;
        // Ukryj komunikat o błędzie i pokaż moduł profesjonalny
        pwzError.style.display = 'none';
        professionalModule.style.display = 'block';
        // Po pozytywnej weryfikacji numeru ukryj instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch(e) {}
        // Pokaż główne przyciski modułu lekarskiego po pozytywnej weryfikacji numeru
        if (abxButtonWrapper)  abxButtonWrapper.style.display  = 'flex';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'flex';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'flex';
        // Ukryj przyciski poszczególnych testów (GH/OGTT/ACTH) – użytkownik rozwinie je z menu endo
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        // Ukryj podprzyciski IGF‑1; użytkownik może je rozwinąć później
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Nie pokazujemy od razu listy testów. Użytkownik może ją otworzyć później.
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Po uaktywnieniu modułu i pokazaniu przycisków testów natychmiast
        // wyrównaj ich szerokości. Wykonujemy to synchronicznie, aby
        // zapewnić prawidłowy wygląd zanim pojawi się blokujący popup
        // (okno confirm). Funkcja adjustTestButtonWidths ustawi taką samą
        // szerokość wszystkich przycisków testów.
        if (typeof adjustTestButtonWidths === 'function') {
          adjustTestButtonWidths();
        }
        // Jeśli w pamięci przeglądarki nie ma jeszcze zapisanego numeru,
        // zapytaj użytkownika o zapamiętanie. Wywołujemy to tylko przy
        // pierwszej poprawnej weryfikacji w danej przeglądarce.
        if(!localStorage.getItem('pwzNumber')){
          const remember = window.confirm('Czy zapamiętać podany numer prawa wykonywania zawodu w tej przeglądarce?');
          if(remember){
            try{
              localStorage.setItem('pwzNumber', val);
            }catch(e){
              // zignoruj błąd (np. tryb prywatny)
            }
          }
        }
        // Zawsze ukryj pole wprowadzania numeru po udanej walidacji,
        // niezależnie od tego, czy użytkownik zapamiętał numer.
        pwzContainer.style.display = 'none';
        // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu
        // wymagane było ponowne wpisanie numeru jeśli nie został zapamiętany.
        pwzNumberInput.value = '';
      } else {
        // Numer niepoprawny. Wyświetl błąd tylko gdy użytkownik coś wpisał.
        pwzError.style.display = val ? 'block' : 'none';
        professionalModule.style.display = 'none';
        // Przy niepoprawnym numerze pokaż ponownie instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = '';
        } catch(e) {}
        // Ukryj wszystkie przyciski testów w razie niepoprawnego numeru
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        // Ukryj podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if(acthTestsLeft && acthTestsRight){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Schowaj kartę antybiotykoterapii i wyłącz podświetlenie przycisku, jeśli numer PWZ jest niepoprawny
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
      }
      // Po aktualizacji widoczności przycisków testów (zarówno przy poprawnym,
      // jak i błędnym numerze), wyrównaj ich szerokości w układzie dwukolumnowym.
      // Używamy requestAnimationFrame, aby zmiana była obliczana po zrenderowaniu
      // elementów – inaczej pomiar mógłby zwrócić zbyt małe wartości.
      if (typeof adjustTestButtonWidths === 'function') {
        requestAnimationFrame(() => adjustTestButtonWidths());
      }
    }

      // Po każdej zmianie checkboxa aktualizuj pozycję i wygląd sekcji modułu
      // lekarskiego (np. mniejszy rozmiar w trybie mobilnym przy włączonych
      // wynikach). Funkcję repositionDoctor deklarujemy niżej.
      if (typeof repositionDoctor === 'function') {
        repositionDoctor();
      }
    if(pwzNumberInput){
      pwzNumberInput.addEventListener('input', validatePWZ);
    }

    // Otwieranie i zamykanie listy testów GH
    if(toggleGhTestsBtn){
      toggleGhTestsBtn.addEventListener('click', function(){
        // Jeśli nie znaleziono kontenerów testów, przerwij
        if(!ghTestsLeft || !ghTestsRight) return;
        // Listę testów uważamy za widoczną, jeśli lewy kontener ma klasę 'active'
        const currentlyActive = ghTestsLeft.classList.contains('active');
        if(currentlyActive){
          // Ukryj oba kontenery
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        } else {
          // Pokaż oba kontenery i przelicz dawki
          ghTestsLeft.classList.add('active');
          ghTestsRight.classList.add('active');
          computeGhResults();
        }
        // Po zmianie widoczności listy GH aktualizujemy stan aktywnego przycisku.
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ghTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleGhTestsBtn.classList.add('active-toggle');
            } else {
              toggleGhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
          /* ignore */
        }
      });
    }

    // Otwieranie i zamykanie listy testów OGTT/GnRH
    if(toggleOgttTestsBtn){
      toggleOgttTestsBtn.addEventListener('click', function(){
        if(!ogttTestsLeft || !ogttTestsRight) return;
        const isActive = ogttTestsLeft.classList.contains('active');
        if(isActive){
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        } else {
          ogttTestsLeft.classList.add('active');
          ogttTestsRight.classList.add('active');
          computeOgttResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku OGTT
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ogttTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleOgttTestsBtn.classList.add('active-toggle');
            } else {
              toggleOgttTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
          /* ignore */
        }
      });
    }
    // Otwieranie i zamykanie listy testów ACTH/TRH
    if(toggleActhTestsBtn){
      toggleActhTestsBtn.addEventListener('click', function(){
        if(!acthTestsLeft || !acthTestsRight) return;
        const isActive = acthTestsLeft.classList.contains('active');
        if(isActive){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        } else {
          acthTestsLeft.classList.add('active');
          acthTestsRight.classList.add('active');
          computeActhResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku ACTH
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = acthTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleActhTestsBtn.classList.add('active-toggle');
            } else {
              toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
          /* ignore */
        }
      });
    }

    // Otwieranie i zamykanie listy testów endokrynologicznych (GH/OGTT/ACTH)
    // Kliknięcie w przycisk „Testy w endokrynologii” powoduje rozwinięcie lub zwinięcie listy testów GH, OGTT i ACTH.
    if (toggleEndoTestsBtn) {
      toggleEndoTestsBtn.addEventListener('click', function() {
        // Jeżeli przyciski testów GH/OGTT/ACTH są widoczne (display !== 'none'), traktujemy listę jako otwartą
        const isVisible = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
        if (isVisible) {
          // Lista jest otwarta – chowamy przyciski poszczególnych testów i zwijamy otwarte karty testów
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Zamknij wszystkie karty testów GH, OGTT i ACTH
          if (ghTestsLeft && ghTestsRight) {
            ghTestsLeft.classList.remove('active');
            ghTestsRight.classList.remove('active');
          }
          if (ogttTestsLeft && ogttTestsRight) {
            ogttTestsLeft.classList.remove('active');
            ogttTestsRight.classList.remove('active');
          }
          if (acthTestsLeft && acthTestsRight) {
            acthTestsLeft.classList.remove('active');
            acthTestsRight.classList.remove('active');
          }
        } else {
          // Lista jest zwinięta – pokaż przyciski testów GH/OGTT/ACTH
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'flex';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'flex';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'flex';
        }
        // Po zmianie widoczności wyrównaj szerokość przycisków w układzie dwukolumnowym
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
        // Aktualizuj aktywne podświetlenie przycisku „Testy w endokrynologii”
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const listOpen = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
            if (listOpen) {
              toggleEndoTestsBtn.classList.add('active-toggle');
            } else {
              toggleEndoTestsBtn.classList.remove('active-toggle');
              // Zwijanie listy usuwa również podświetlenie z podprzycisków GH/OGTT/ACTH
              if (typeof toggleGhTestsBtn !== 'undefined' && toggleGhTestsBtn)   toggleGhTestsBtn.classList.remove('active-toggle');
              if (typeof toggleOgttTestsBtn !== 'undefined' && toggleOgttTestsBtn) toggleOgttTestsBtn.classList.remove('active-toggle');
              if (typeof toggleActhTestsBtn !== 'undefined' && toggleActhTestsBtn) toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
          /* ignore */
        }
      });
    }

    // Otwieranie i zamykanie listy testów IGF‑1 (SNP, Zespół Turnera, Zespół PWS, SGA, IGF‑1)
    // Kliknięcie w przycisk „Leczenie hormonem wzrostu / IGF‑1” rozwija lub zwija listę pięciu podprzycisków.
    if (toggleIgfTestsBtn) {
      toggleIgfTestsBtn.addEventListener('click', function() {
        // Sprawdź, czy pierwszy podprzycisk jest aktualnie widoczny
        const isOpen = snpButtonWrapper && snpButtonWrapper.style.display !== 'none';
        if (isOpen) {
          // Lista jest otwarta – chowamy wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        } else {
          // Lista jest zamknięta – pokaż wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'flex';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'flex';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'flex';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'flex';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'flex';
        }
        // Wyrównaj szerokości przycisków po zmianie
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      });
    }

    /**
     * Oblicza dawki dla poszczególnych testów stymulacyjnych GH i aktualizuje karty.
     * Wzory obliczeniowe:
     *   – Arginina: 0,5 g/kg masy ciała, maks. 30 g.
     *   – Klonidyna: 0,10–0,15 mg/m² powierzchni ciała (podajemy w mikrogramach).
     *   – L‑Dopa: 300 mg/m² powierzchni ciała; wg masy ciała <15 kg: 125 mg, 15–35 kg: 250 mg, >35 kg: 500 mg.
     *   – Insulina: 0,1 j./kg; w szczególnych przypadkach (deficyt GH, <5 r.ż.) 0,05 j./kg.
     *   – Glukagon: 0,03 mg/kg masy ciała, maks. 1 mg; >90 kg: 1,5 mg.
     */
    function computeGhResults(){
      const weightInput = document.getElementById('weight');
      const heightInput = document.getElementById('height');
      if(!weightInput || !heightInput) return;
      const weight = parseFloat(weightInput.value);
      const height = parseFloat(heightInput.value);
      // Jeśli brak danych, wyświetl komunikat w kartach
      if(!(weight > 0 && height > 0)){
        const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
        cards.forEach(card => {
          const p = card.querySelector('p');
          if(p){
            p.textContent = 'Wprowadź wagę i wzrost, aby obliczyć dawkę.';
          }
        });
        return;
      }
      // Powierzchnia ciała – wzór Mostellera (cm i kg): sqrt((wzrost_cm × masa_kg) / 3600)
      const bsa = Math.sqrt((height * weight) / 3600);
      // Test z argininą: 0,5 g/kg, maks. 30 g
      const arginineDose = Math.min(weight * 0.5, 30);
      // Test z klonidyną: 0,10–0,15 mg/m²; przeliczenie na µg (1 mg = 1000 µg)
      // Zakres dawki w mikrogramach obliczamy jak dotychczas.
      const clonidineLowUg  = bsa * 0.10 * 1000;
      const clonidineHighUg = bsa * 0.15 * 1000;

      /*
       * Przeliczanie dawek klonidyny na liczbę tabletek Iporel.
       * Jedna tabletka Iporelu zawiera 75 µg substancji czynnej. Ponieważ
       * tabletkę można bezpiecznie podzielić jedynie na pół, zaokrąglamy
       * obliczoną liczbę tabletek do najbliższej połówki. Dodatkowo
       * prezentujemy odpowiadającą temu zaokrągleniu ilość w mikrogramach.
       */
      const iporelTabUg = 75;
      // Zaokrąglenie do najbliższej 0,5 tabletki
      const roundToHalf = (val) => Math.round(val * 2) / 2;
      const iporelLowTabs  = roundToHalf(clonidineLowUg  / iporelTabUg);
      const iporelHighTabs = roundToHalf(clonidineHighUg / iporelTabUg);
      // Formatowanie liczby tabletek tak, aby zamiast kropki użyć przecinka
      const formatTablet = (t) => {
        // jeśli wartość jest całkowita, nie pokazujemy części dziesiętnej
        const str = (t % 1 === 0) ? t.toFixed(0) : t.toString();
        return str.replace('.', ',');
      };
      // Formatowanie mikrogramów – jeśli ma część dziesiętną .5, wyświetlamy jedną cyfrę
      const formatMicrog = (ug) => {
        // zaokrąglamy do 0,1 µg, choć wartości połówkowe dają dokładnie x,5
        const rounded = Math.round(ug * 10) / 10;
        // usuwamy .0 aby nie wyświetlać zbędnych zer po przecinku
        const str = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
        return str.replace('.', ',');
      };
      const iporelRangeTabStr = `${formatTablet(iporelLowTabs)}–${formatTablet(iporelHighTabs)} tabl.`;
      const iporelRangeUgLow  = iporelLowTabs  * iporelTabUg;
      const iporelRangeUgHigh = iporelHighTabs * iporelTabUg;
      const iporelRangeUgStr  = `${formatMicrog(iporelRangeUgLow)}–${formatMicrog(iporelRangeUgHigh)} µg`;
      const iporelInfo = `Iporel: ${iporelRangeTabStr} (${iporelRangeUgStr})`;
      // Test z L‑Dopą: 300 mg/m² oraz progowe dawki wg masy ciała
      const lDopaPerM2 = bsa * 300; // mg
      let lDopaWeightCat;
      if(weight < 15)      lDopaWeightCat = 125;
      else if(weight <= 35) lDopaWeightCat = 250;
      else                  lDopaWeightCat = 500;
      // Test z insuliną: 0,1 j./kg; dodatkowo 0,05 j./kg
      // W zależności od wieku dziecka dawki insuliny mogą ulec zmianie. Domyślnie
      // obliczamy wartości 0,1 j./kg oraz 0,05 j./kg, ale wybór odpowiedniej
      // dawki nastąpi później w opisie. Jeśli wiek <5 lat, stosujemy tylko 0,05 j./kg.
      const insulinDose    = weight * 0.1;
      const insulinDoseLow = weight * 0.05;
      // Test z glukagonem: 0,03 mg/kg (maks. 1 mg; >90 kg: 1,5 mg)
      let glucagonDose = weight * 0.03;
      if(weight > 90){
        glucagonDose = 1.5;
      }else if(glucagonDose > 1){
        glucagonDose = 1;
      }
      // Ustal opis dawki insuliny w zależności od wieku. Jeśli wiek nie został
      // podany, poproś użytkownika o jego wprowadzenie. Przy wieku <5 lat
      // stosowana jest dawka 0,05 j./kg; w przeciwnym razie prezentujemy
      // domyślną dawkę 0,1 j./kg z alternatywną dawką 0,05 j./kg.
      let insulinDesc;
      // Wiek z uwzględnieniem miesięcy (lata + miesiące/12)
      const ageVal   = getAgeDecimal();
      // Jeżeli wiek nie został podany lub wynosi 0, prosimy o jego uzupełnienie
      if(!(ageVal > 0)){
        insulinDesc = 'Podaj wiek dziecka, aby obliczyć dawkę insuliny.';
      } else if(ageVal < 5){
        insulinDesc = `Dawka: ${insulinDoseLow.toFixed(2)} j. (0,05 j./kg)`;
      } else {
        insulinDesc = `Dawka: ${insulinDose.toFixed(2)} j. (0,1 j./kg); alternatywnie ${insulinDoseLow.toFixed(2)} j. (0,05 j./kg)`;
      }
      // Przygotuj opisy dla kart. Do wyniku testu z klonidyną dodajemy również
      // informację o liczbie tabletek Iporelu potrzebnych do podania dawki.
      const descriptions = [
        `Zakres dawki: ${Math.round(clonidineLowUg)}–${Math.round(clonidineHighUg)} µg (0,10–0,15 mg/m²); ${iporelInfo}`,
        `Dawka: ${glucagonDose.toFixed(2)} mg (0,03 mg/kg; maks. 1 mg, >90 kg: 1,5 mg)` ,
        insulinDesc,
        `Dawka: ${arginineDose.toFixed(1)} g (0,5 g/kg; maks. 30 g)` ,
        `Dawka wg masy: ${lDopaWeightCat} mg; wg 300 mg/m²: ${Math.round(lDopaPerM2)} mg`
      ];
      // Przygotuj tablicę ostrzeżeń przeciwwskazań w zależności od wieku dziecka.
      const warnings = ['', '', '', '', ''];
      const ageValForWarn = getAgeDecimal();
      if(ageValForWarn >= 0) {
        // Testy z klonidyną, glukagonem, argininą oraz L‑Dopą są przeciwwskazane u dzieci <2 r.ż.
        if(ageValForWarn < 2) {
          warnings[0] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[1] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[3] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[4] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
        }
        // Test z insuliną jest przeciwwskazany u dzieci <5 r.ż.
        if(ageValForWarn < 5) {
          warnings[2] = 'Test przeciwwskazany u dzieci poniżej 5. roku życia!';
        }
      }
      // Zaktualizuj treści kart z uwzględnieniem ostrzeżeń. Pobieramy karty z kontenerów
      // ghTestsLeft i ghTestsRight. Kolejność kart odpowiada kolejności testów:
      // klonidyna, glukagon, insulina, arginina, L‑Dopa.
      const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
      cards.forEach((card, idx) => {
        const p = card.querySelector('p');
        if(!p) return;
        const desc = descriptions[idx] || '';
        const warn = warnings[idx] || '';
        if(warn) {
          // Używamy innerHTML, aby wstawić span z klasą ostrzeżenia poniżej opisu.
          p.innerHTML = `${desc}<br><span class="gh-test-warning">${warn}</span>`;
        } else {
          // Jeśli nie ma ostrzeżenia, zachowujemy zwykły tekst (textContent),
          // co zapobiega interpretacji znaków specjalnych jako HTML.
          p.textContent = desc;
        }
      });
    }

    /**
     * Oblicza dawki dla testu OGTT oraz GnRH/LHRH i aktualizuje karty wynikowe.
     * Wzory obliczeniowe:
     *   – OGTT: 1,75 g/kg masy ciała; maksymalnie 75 g.
     *   – GnRH/LHRH: 2,5 µg/kg masy ciała; maksymalnie 100 µg.
     * Jeśli waga nie została podana, prosi użytkownika o jej wprowadzenie.
     */
    function computeOgttResults(){
      const weightInput = document.getElementById('weight');
      if(!weightInput) return;
      const weight = parseFloat(weightInput.value);
      // Pobierz oba paragrafy kart testów OGTT i GnRH
      const ogttCard = document.querySelector('#ogttTestsLeft .gh-test-card p');
      const gnrhCard = document.querySelector('#ogttTestsRight .gh-test-card p');
      if(!(weight > 0)){
        if(ogttCard) ogttCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        if(gnrhCard) gnrhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        return;
      }
      // Obliczenie dawek
      let ogttDose = weight * 1.75;
      if(ogttDose > 75) ogttDose = 75;
      let gnrhDose = weight * 2.5;
      if(gnrhDose > 100) gnrhDose = 100;
      // Formatowanie z przecinkiem zamiast kropki
      const formatDose = (dose) => {
        return (dose % 1 === 0 ? dose.toFixed(0) : dose.toFixed(2)).replace('.', ',');
      };
      if(ogttCard) ogttCard.textContent = `Dawka: ${formatDose(ogttDose)}\u00a0g (1,75\u00a0g/kg; maks.\u00a075\u00a0g)`;
      if(gnrhCard) gnrhCard.textContent = `Dawka: ${formatDose(gnrhDose)}\u00a0µg (2,5\u00a0µg/kg; maks.\u00a0100\u00a0µg)`;
    }

    /**
     * Oblicza dawki dla testu z dużą dawką ACTH oraz testu z TRH.
     * Wzory obliczeniowe:
     *   – ACTH: dzieci >2 lat – 250 µg; dzieci ≤2 lat – 15 µg/kg masy ciała (maks. 125 µg).
     *   – TRH: 7 µg/kg masy ciała; maksymalnie 200 µg. Część źródeł podaje dawkę maks. 400 µg.
     * Jeśli wymagane dane (wiek lub waga) nie zostały podane, wyświetla komunikat.
     */
    function computeActhResults(){
      const weightInput = document.getElementById('weight');
      const weight = weightInput ? parseFloat(weightInput.value) : NaN;
      // Użyj funkcji pomocniczej do obliczenia wieku z dokładnością do miesięcy
      const age    = getAgeDecimal();
      // Pobierz paragrafy kart testów ACTH i TRH
      const acthCard = document.querySelector('#acthTestsLeft .gh-test-card p');
      const trhCard  = document.querySelector('#acthTestsRight .gh-test-card p');
      // ACTH: potrzebujemy wieku i wagi
      if(!(age > 0) || !(weight > 0)){
        if(acthCard) acthCard.textContent = 'Podaj wiek i wagę, aby obliczyć dawkę ACTH.';
      } else {
        let acthDose;
        if(age <= 2){
          acthDose = weight * 15;
          if(acthDose > 125) acthDose = 125;
        } else {
          acthDose = 250;
        }
        const doseStr = (acthDose % 1 === 0 ? acthDose.toFixed(0) : acthDose.toFixed(2)).replace('.', ',');
        if(acthCard) acthCard.textContent = `Dawka: ${doseStr}\u00a0µg (${age <= 2 ? '15\u00a0µg/kg; maks.\u00a0125\u00a0µg' : 'stała dawka 250\u00a0µg'})`;
      }
      // TRH: potrzebujemy wagi
      if(!(weight > 0)){
        if(trhCard) trhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
      } else {
        let trhDose = weight * 7;
        if(trhDose > 200) trhDose = 200;
        const doseStr = (trhDose % 1 === 0 ? trhDose.toFixed(0) : trhDose.toFixed(2)).replace('.', ',');
        if(trhCard) trhCard.textContent = `Dawka: ${doseStr}\u00a0µg (7\u00a0µg/kg; maks.\u00a0200\u00a0µg; niektóre źródła: maks.\u00a0400\u00a0µg)`;
      }
    }

    // Aktualizuj dawki podczas zmian wagi lub wzrostu, jeśli moduł jest aktywny
    const weightInputEl = document.getElementById('weight');
    const heightInputEl = document.getElementById('height');
    if(weightInputEl){
      weightInputEl.addEventListener('input', function(){
        if(professionalModule.style.display === 'block'){
          computeGhResults();
          // Aktualizuj również nowe testy (OGTT/GnRH i ACTH/TRH)
          computeOgttResults();
          computeActhResults();
        }
      });
    }
    if(heightInputEl){
      heightInputEl.addEventListener('input', function(){
        if(professionalModule.style.display === 'block'){
          computeGhResults();
          computeOgttResults();
          computeActhResults();
        }
      });
    }

    // Reaguj także na zmianę wieku – dawka insuliny w testach GH zależy od wieku dziecka.
    const ageInputEl = document.getElementById('age');
    if(ageInputEl){
      ageInputEl.addEventListener('input', function(){
        if(professionalModule.style.display === 'block'){
          computeGhResults();
          // Dawki ACTH zależą od wieku
          computeActhResults();
        }
      });
    }
    // Dodaj obsługę zmian pola miesięcy – zmiana miesięcy powinna przeliczyć dawki tak samo jak wiek w latach
    const ageMonthsEl = document.getElementById('ageMonths');
    if(ageMonthsEl){
      ageMonthsEl.addEventListener('input', function(){
        if(professionalModule.style.display === 'block'){
          computeGhResults();
          computeActhResults();
        }
      });
    }
  });
})();
/* ============================
 *  KARTA: Szacowane spożycie energii (wariant A mobile)
 * ============================ */

/* ——— helpers ——— */
function lmsToValue(L, M, S, z){
  return (L !== 0) ? M * Math.pow(1 + L*S*z, 1/L) : M * Math.exp(S*z);
}

/* === PATCH 2025‑08‑31: median-based expected gain with height awareness ===
 *
 * Dodajemy funkcje obliczające medianową masę i wzrost dla podanego wieku (w miesiącach)
 * oraz funkcję obliczającą „należną” masę ciała przy BMI z 50. centyla.  W przypadku
 * braku wzrostu w wierszu przyjmujemy medianę wzrostu.  Funkcja expectedGainMedianHeightAware
 * oblicza oczekiwany przyrost masy między dwoma pomiarami, bazując na medianowym BMI i
 * rzeczywistym wzroście dziecka.  Negatywne wartości są obcięte do zera.  Dodatkowo,
 * jeśli różnica wzrostu między pomiarami jest mniejsza niż 0,5 cm przy różnicy wieku
 * ≥ 6 mies., przyjmujemy 0 jako oczekiwany przyrost.
 */
function _refsReady(){
  return typeof getPLWeightCentile === 'function' && typeof getPLHeightCentile === 'function' && typeof getChildLMS === 'function';
}

// Medianowa waga [kg] dla wieku (mies.) i płci: dla <36 mies. korzysta z siatek
// Palczewskiej (50c), a dla ≥36 mies. z LMS (WHO/OLAF) przez getChildLMS.
function medianWeightForAgeMonths(sex, ageMonths){
  if (!isFinite(ageMonths) || ageMonths < 0) return NaN;
  if (ageMonths < 36) {
    return getPLWeightCentile(sex, ageMonths, 50);
  }
  const ageYears = ageMonths / 12;
  const lms = getChildLMS(sex, ageYears, 'WT');
  return lms ? lms[1] : NaN;
}

// Medianowy wzrost [cm] dla wieku (mies.) i płci: <36 mies. – Palczewska, ≥36 mies. – LMS.
function medianHeightForAgeMonths(sex, ageMonths){
  if (!isFinite(ageMonths) || ageMonths < 0) return NaN;
  if (ageMonths < 36) {
    return getPLHeightCentile(sex, ageMonths, 50);
  }
  const ageYears = ageMonths / 12;
  const lms = getChildLMS(sex, ageYears, 'h');
  return lms ? lms[1] : NaN;
}

// „Należna” masa ciała [kg] przy BMI z 50. centyla i rzeczywistym wzroście (w cm).
function expectedWeightAtBMI50GivenHeight(sex, ageMonths, heightCm){
  const Mw = medianWeightForAgeMonths(sex, ageMonths);
  const Mh = medianHeightForAgeMonths(sex, ageMonths);
  if (!isFinite(Mw) || !isFinite(Mh) || Mw <= 0 || Mh <= 0 || !isFinite(heightCm) || heightCm <= 0) return NaN;
  const bmi50 = Mw / Math.pow(Mh / 100, 2);
  return bmi50 * Math.pow(heightCm / 100, 2);
}

// Oblicza oczekiwany przyrost masy między dwoma pomiarami.  Bazuje na medianowym BMI
// (50c) i rzeczywistych wysokościach dziecka.  Jeśli różnica wzrostu jest bardzo mała
// (<0,5 cm) przy odstępie ≥6 mies., wynik wynosi 0.  Ujemne wartości są obcinane do zera.
function expectedGainMedianHeightAware(measPrev, measCurr, sex){
  const ageMonthsPrev = measPrev.ageMonths;
  const ageMonthsCurr = measCurr.ageMonths;
  if (!isFinite(ageMonthsPrev) || !isFinite(ageMonthsCurr)) return 0;
  const gapM = ageMonthsCurr - ageMonthsPrev;
  if (gapM <= 0) return 0;
  const hPrev = (measPrev.height != null && isFinite(measPrev.height)) ? measPrev.height : medianHeightForAgeMonths(sex, ageMonthsPrev);
  const hCurr = (measCurr.height != null && isFinite(measCurr.height)) ? measCurr.height : medianHeightForAgeMonths(sex, ageMonthsCurr);
  // Jeśli brak przyrostu wzrostu przy odstępie ≥6 mies. – nie spodziewamy się przyrostu masy
  if (gapM >= 6 && Math.abs(hCurr - hPrev) < 0.5) {
    return 0;
  }
  const wPrev = expectedWeightAtBMI50GivenHeight(sex, ageMonthsPrev, hPrev);
  const wCurr = expectedWeightAtBMI50GivenHeight(sex, ageMonthsCurr, hCurr);
  if (!isFinite(wPrev) || !isFinite(wCurr)) return 0;
  const gain = wCurr - wPrev;
  return gain > 0 ? gain : 0;
}
function getUserBasics(){
  const sex = (document.getElementById('sex')?.value || 'M');
  const y   = parseFloat(document.getElementById('age')?.value);
  const m   = parseFloat(document.getElementById('ageMonths')?.value);
  const wt  = parseFloat(document.getElementById('weight')?.value);
  const ht  = parseFloat(document.getElementById('height')?.value);
  const ageYears  = (isNaN(y)?0:y) + (isNaN(m)?0:m)/12;
  const ageMonths = Math.round(((isNaN(y)?0:y)*12) + (isNaN(m)?0:m));
  return { sex, ageYears, ageMonths, weight: wt, height: ht };
}

/* ——— UI rows (jak w „Zaawansowanych…”): dodawanie/odczyt ——— */
function intakeAddRow(prefill){
  const wrap = document.getElementById('intakeMeasurements');
  if(!wrap) return;
  const row = document.createElement('div');
  row.className = 'measure-row-intake';
  // W wierszu używamy trzykolumnowej siatki; czerwony znak „×” trafia do drugiego wiersza.
  row.innerHTML = `
    <label>Wiek:
      <div class="age-mm-group">
        <input type="number" class="intake-ageY" min="0" max="18" step="1" placeholder="lata">
        <input type="number" class="intake-ageM" min="0" max="11" step="1" placeholder="miesiące">
      </div>
    </label>
    <label>Wzrost (cm)
      <input type="number" step="0.1" min="45" max="230" class="intake-ht">
    </label>
    <label>Masa (kg)
      <input type="number" step="0.1" min="1" max="250" class="intake-wt">
    </label>
    <button type="button" class="icon remove-intake-row" aria-label="Usuń wiersz">×</button>
  `;
  wrap.appendChild(row);

  if(prefill){
    // Prefill age using either ageMonths or ageYears
    if (typeof prefill.ageMonths === 'number'){
      row.querySelector('.intake-ageY').value = Math.floor(prefill.ageMonths / 12);
      row.querySelector('.intake-ageM').value = prefill.ageMonths % 12;
    } else if (typeof prefill.ageYears === 'number'){
      const y = Math.floor(prefill.ageYears);
      const mm = Math.round((prefill.ageYears - y) * 12);
      row.querySelector('.intake-ageY').value = y;
      row.querySelector('.intake-ageM').value = mm;
    }
    if (typeof prefill.height === 'number') {
      row.querySelector('.intake-ht').value = prefill.height;
    }
    if (typeof prefill.weight === 'number') {
      row.querySelector('.intake-wt').value = prefill.weight;
    }
  }

  row.querySelector('.remove-intake-row').addEventListener('click', ()=>{
    row.remove();
    updateIntakeRemoveButtons();
    debouncedIntakeCalc();
  });
  ['input','change'].forEach(ev=>{
    row.addEventListener(ev, e=>{
      if(e.target.matches('.intake-ageY,.intake-ageM,.intake-ht,.intake-wt')) debouncedIntakeCalc();
    });
  });

  // Aktualizuj widoczność przycisków „×” po dodaniu nowego wiersza
  updateIntakeRemoveButtons();
}

function readIntakeRows(){
  const out = [];
  document.querySelectorAll('#intakeMeasurements .measure-row-intake').forEach(row=>{
    const y = parseFloat(row.querySelector('.intake-ageY')?.value);
    const m = parseFloat(row.querySelector('.intake-ageM')?.value);
    const h = parseFloat(row.querySelector('.intake-ht')?.value);
    const w = parseFloat(row.querySelector('.intake-wt')?.value);
    const hasAge = (!isNaN(y) || !isNaN(m));
    if(hasAge && !isNaN(h) && !isNaN(w)){
      const months = Math.round(((isNaN(y)?0:y)*12) + (isNaN(m)?0:m));
      out.push({ ageYears: months/12, ageMonths: months, months, weight: w, height: h });
    }
  });
  out.sort((a,b)=>a.months-b.months);
  return out;
}

/* ——— autofill ——— */
let intakeAutofilledOnce = false;
function intakeAutofill(){
  if(intakeAutofilledOnce) return;
  intakeAutofilledOnce = true;

  const wrap = document.getElementById('intakeMeasurements');
  if(!wrap) return;
  wrap.innerHTML = '';

  const basic = getUserBasics();
  // bieżący punkt
  if(!isNaN(basic.weight)){
    intakeAddRow({ ageMonths: basic.ageMonths, height: basic.height, weight: basic.weight });
  }
  // dzieci: dołącz wszystkie pomiary z „Zaawansowanych…”
  if (basic.ageYears < 18 && window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements)){
    window.advancedGrowthData.measurements.forEach(m=>{
      if (m && typeof m.ageMonths==='number' && typeof m.weight==='number'){
        const dupe = Math.abs(m.ageMonths - basic.ageMonths) <= 1 && Math.abs(m.weight - basic.weight) < 0.01;
        if(!dupe) intakeAddRow({ ageMonths: m.ageMonths, height: m.height, weight: m.weight });
      }
    });
  }
  // PAL z planu (jeśli wybrany)
  const planPal = document.getElementById('palFactor')?.value;
  // Domyślnie ustaw PAL na 1.4 jeśli nie wybrano w planie
  document.getElementById('intakePal').value = planPal || '1.4';
  intakeUpdatePalDesc();
  // ← DODAJ TO:
  _updateIntakeFirstRowFromUserBasics(); // nadpisz i zablokuj pierwszy wiersz po autofill
}

/* ——— opis PAL ——— */
function intakeUpdatePalDesc(){
  const pal = document.getElementById('intakePal')?.value;
  const el  = document.getElementById('intakePalDesc');
  if(el && pal) el.textContent = PAL_DESCRIPTIONS[pal] || '';
}

/* ——— obliczenia + render (tabela dla desktop; karty – wariant A – dla mobile) ——— */
function calcEstimatedIntake(){
  const basics = getUserBasics();
  const {sex, height} = basics;
  const pal = parseFloat(document.getElementById('intakePal')?.value || '1.6');
  intakeUpdatePalDesc();

  const rows = readIntakeRows();
  // ——— (NOWE) Wyznacz współczynnik korekty TEE na podstawie modułu AN ———
let teeFactor = 1;
try {
  if (typeof window.anorexiaRiskAdjust === 'function' && rows.length) {
    const basics = getUserBasics();
    // BMR liczymy dla ostatniego wiersza (najświeższy pomiar)
    const last = rows[rows.length - 1];
    const bmrLast = BMR(last.weight, basics.height, last.ageYears, basics.sex);

    const tmp = window.anorexiaRiskAdjust({
      user: {
        ageYears: basics.ageYears,
        ageMonthsOpt: basics.ageMonths % 12,
        sex: basics.sex,
        heightCm: basics.height,
        weightKg: basics.weight
      },
      bmr: bmrLast,
      pal: pal,
      history: rows.map(r => ({ ageMonths: r.ageMonths, weight: r.weight })),
      intakeKcalPerDay: null,
      // nieistniejący mountId → brak UI w tym miejscu
      mountId: 'anorexiaTmpMount'
    });

    // wyznacz współczynnik korekty TEE (np. 0.85)
    const teeRaw = bmrLast * pal;
    if (tmp && typeof tmp.teeAdjusted === 'number' && teeRaw > 0) {
      teeFactor = tmp.teeAdjusted / teeRaw;
    }
  }
} catch (_) {}
  const res  = document.getElementById('intakeResults');
  const legendEl = document.getElementById('intakeLegend');
  // domyślnie ukrywamy legendę – zostanie włączona dopiero po obliczeniu
  if (legendEl) {
    legendEl.style.display = 'none';
  }
  if(!res) return;

  // Ukryj/pokaż komunikat o konieczności wprowadzenia dwóch wierszy.
  {
    const msgEl = document.querySelector('#intakeCard .intake-actions .muted');
    if(msgEl){
      msgEl.style.display = rows.length >= 2 ? 'none' : '';
    }
  }

  if(!rows.length){
    res.innerHTML = '<p>Uzupełnij wiersze z wiekiem i masą ciała.</p>';
    return;
  }
  if(rows.length === 1){
    // Jeden wiersz – wyświetl TEE i wywołaj detekcję ryzyka anoreksji
    const r = rows[0];
    const bmr = BMR(r.weight, height, r.ageYears, sex);
    const rawTee = bmr * pal;
    const tee    = rawTee * teeFactor;
    res.innerHTML = `<p><strong>Utrzymanie masy:</strong> ok. <b>${Math.round(tee)}</b> kcal/d (PAL ${pal}).<br>
      <span class="muted">Dodaj drugi pomiar, aby obliczyć nadwyżkę/deficyt z trendu masy.</span></p>`;
    // Ustaw globalne zmienne historii (pojedynczy wiersz)
    try {
      window.intakeHistory = rows.map(row => ({ ageMonths: row.ageMonths, weight: row.weight }));
      window.intakeEstimatedKcalPerDay = null;
      if (typeof window.anorexiaRiskAdjust === 'function') {
        const basics = getUserBasics();
        window.anorexiaRiskAdjust({
          user: {
            ageYears: basics.ageYears,
            ageMonthsOpt: basics.ageMonths % 12,
            sex: basics.sex,
            heightCm: basics.height,
            weightKg: basics.weight
          },
          bmr: bmr,
          pal: pal,
          history: window.intakeHistory,
          intakeKcalPerDay: null,
          mountId: 'intakeResults'
        });
        // Po detekcji ryzyka anoreksji wywołaj niezależne ostrzeżenie o spadku >8 kg w ~12 miesięcy
        try {
          if (typeof window.check12mLossOrange === 'function') {
            const hist = window.intakeHistory || rows;
            window.check12mLossOrange(hist, 'intakeResults');
          }
        } catch (e) {}
      }
    } catch (e) {}
    return;
  }

  const KG_TOL_PER_MONTH = 0.2;
  const intervals = []; // zbiór wyników do renderowania

  for(let i=0;i<rows.length-1;i++){
    const a = rows[i], b = rows[i+1];
    const monthsGap = b.months - a.months;
    if(monthsGap <= 0) continue;
    const days = monthsGap * 30.4375;
    const dW   = b.weight - a.weight;

    const bmrAvg = (BMR(a.weight, height, a.ageYears, sex) + BMR(b.weight, height, b.ageYears, sex)) / 2;
    const teeRaw = bmrAvg * pal;
    const teeAdj = teeRaw * teeFactor;              // ← zastosuj korektę

    let expectedGain = 0;
    let deltaVsNorm  = dW;
    const childPair  = (a.ageYears < 18 && b.ageYears < 18);

    if(childPair){
      // Oblicz oczekiwany przyrost na podstawie medianowego BMI (50c) i rzeczywistego wzrostu
      const measPrev = { ageMonths: (typeof a.ageMonths === 'number' ? a.ageMonths : a.months), height: a.height, weight: a.weight };
      const measCurr = { ageMonths: (typeof b.ageMonths === 'number' ? b.ageMonths : b.months), height: b.height, weight: b.weight };
      expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
      deltaVsNorm  = dW - expectedGain;
    }

    const tol = KG_TOL_PER_MONTH * Math.max(1, monthsGap);
    const stable = Math.abs(childPair ? deltaVsNorm : dW) < tol;

    const energyDeltaPerDay = ((childPair ? deltaVsNorm : dW) * KCAL_PER_KG) / days; // + => nadwyżka
    const intakePerDay = teeAdj + (dW * KCAL_PER_KG) / days; // ← użyj teeAdj

    intervals.push({
      from: a.ageYears, to: b.ageYears,
      days: Math.round(days),
      dW: dW,
      expectedGain: childPair ? expectedGain : null,
      deltaVsNorm: childPair ? deltaVsNorm : null,
      energyDeltaPerDay: stable ? Math.round(energyDeltaPerDay) : Math.round(energyDeltaPerDay),
      intakePerDay: Math.round(intakePerDay),
      isChild: childPair
    });
  }

  // Render: tabela dla szerokich ekranów, karty (wariant A) dla wąskich
  const isMobile = window.matchMedia('(max-width: 700px)').matches;

  if(!isMobile){
    // tabela (desktop)
    let html = `<div class="table-scroll"><table class="data-card">
      <thead><tr>
        <th>Okres</th><th>Dni</th><th>Δ masa</th>
        <th>Oczekiwany przyrost*</th><th>Δ vs norma</th>
        <th>Nadmiar/deficyt (kcal/d)</th><th>Szac. spożycie (kcal/d)</th>
      </tr></thead><tbody>`;
    intervals.forEach(r=>{
      html += `<tr>
        <td>${r.from.toFixed(2)} → ${r.to.toFixed(2)} l.</td>
        <td>${r.days}</td>
        <td>${r.dW>0?'+':''}${r.dW.toFixed(2)} kg</td>
        <td>${r.isChild ? (r.expectedGain>0?'+':'')+r.expectedGain.toFixed(2)+' kg' : '—'}</td>
        <td>${r.isChild ? (r.deltaVsNorm>0?'+':'')+r.deltaVsNorm.toFixed(2)+' kg' : '—'}</td>
        <td><b>${r.energyDeltaPerDay>=0?'+':''}${r.energyDeltaPerDay}</b></td>
        <td><b>${r.intakePerDay}</b></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    if (intervals.some(r=>r.isChild)) {
      html += `<p class="muted" style="margin-top:.25rem;">* Oczekiwany przyrost – przyrost masy oszacowany na podstawie medianowych (50 c) przyrostów dla wieku oraz rzeczywistego wzrostu dziecka.</p>`;
    }
    res.innerHTML = html;

    // Pokaż legendę po wyświetleniu tabeli, jeśli podano co najmniej dwa pomiary
    if (legendEl && rows.length >= 2) {
      legendEl.style.display = 'block';
    }
    // Zachowaj historię i oszacowanie spożycia, a następnie wywołaj baner anoreksji
    try {
      // Przechowaj historię (wiek w miesiącach i waga)
      window.intakeHistory = rows.map(row => ({ ageMonths: row.ageMonths, weight: row.weight }));
      // Oszacowanie spożycia z ostatniego interwału
      const lastInterval = intervals[intervals.length - 1];
      window.intakeEstimatedKcalPerDay = lastInterval ? lastInterval.intakePerDay : null;
      if (typeof window.anorexiaRiskAdjust === 'function') {
        const basics = getUserBasics();
        // Użyj BMR z ostatniego wiersza do detekcji
        const lastRow = rows[rows.length - 1];
        const lastBmr = BMR(lastRow.weight, height, lastRow.ageYears, sex);
        window.anorexiaRiskAdjust({
          user: {
            ageYears: basics.ageYears,
            ageMonthsOpt: basics.ageMonths % 12,
            sex: basics.sex,
            heightCm: basics.height,
            weightKg: basics.weight
          },
          bmr: lastBmr,
          pal: pal,
          history: window.intakeHistory,
          intakeKcalPerDay: window.intakeEstimatedKcalPerDay,
          mountId: 'intakeResults'
        });
        // Po detekcji ryzyka anoreksji wywołaj niezależne ostrzeżenie o spadku >8 kg w ~12 miesięcy
        try {
          if (typeof window.check12mLossOrange === 'function') {
            const hist = window.intakeHistory || rows;
            window.check12mLossOrange(hist, 'intakeResults');
          }
        } catch (e) {}
      }
    } catch (e) {}
    return;
  }

  // wariant A (mobile): serie pionowych kart
  let cards = '';
  intervals.forEach(r=>{
    cards += `<div class="intake-result-card">
      <p><strong>Okres:</strong> ${r.from.toFixed(2)} → ${r.to.toFixed(2)} l.</p>
      <p><strong>Dni:</strong> ${r.days}</p>
      <p><strong>Δ masa:</strong> ${r.dW>0?'+':''}${r.dW.toFixed(2)} kg</p>
      <p><strong>${r.isChild?'Oczekiwany przyrost':'Oczekiwany przyrost'}</strong>: ${r.isChild ? ((r.expectedGain>0?'+':'')+r.expectedGain.toFixed(2)+' kg') : '—'}</p>
      <p><strong>${r.isChild?'Δ vs norma':'Δ vs norma'}</strong>: ${r.isChild ? ((r.deltaVsNorm>0?'+':'')+r.deltaVsNorm.toFixed(2)+' kg') : '—'}</p>
      <p><strong>Nadmiar/deficyt (kcal/d):</strong> ${r.energyDeltaPerDay>=0?'+':''}${r.energyDeltaPerDay}</p>
      <p><strong>Szac. spożycie (kcal/d):</strong> ${r.intakePerDay}</p>
    </div>`;
  });
  if (intervals.some(r=>r.isChild)) {
    cards += `<p class="muted" style="margin:.25rem 0 0;">* Oczekiwany przyrost – przyrost masy oszacowany na podstawie medianowych (50 c) przyrostów dla wieku oraz rzeczywistego wzrostu dziecka.</p>`;
  }
  res.innerHTML = cards;

  // Po wygenerowaniu wyników z co najmniej dwoma pomiarami,
  // ujawniamy legendę, aby użytkownik wiedział, jak interpretować kolumny.
  if (legendEl && rows.length >= 2) {
    legendEl.style.display = 'block';
  }

  // Dla wersji mobilnej analogicznie zapisz historię i wywołaj baner anoreksji
  try {
    window.intakeHistory = rows.map(row => ({ ageMonths: row.ageMonths, weight: row.weight }));
    const lastInterval = intervals[intervals.length - 1];
    window.intakeEstimatedKcalPerDay = lastInterval ? lastInterval.intakePerDay : null;
    if (typeof window.anorexiaRiskAdjust === 'function') {
      const basics = getUserBasics();
      const lastRow = rows[rows.length - 1];
      const lastBmr = BMR(lastRow.weight, height, lastRow.ageYears, sex);
      window.anorexiaRiskAdjust({
        user: {
          ageYears: basics.ageYears,
          ageMonthsOpt: basics.ageMonths % 12,
          sex: basics.sex,
          heightCm: basics.height,
          weightKg: basics.weight
        },
        bmr: lastBmr,
        pal: pal,
        history: window.intakeHistory,
        intakeKcalPerDay: window.intakeEstimatedKcalPerDay,
        mountId: 'intakeResults'
      });
      // Po detekcji ryzyka anoreksji wywołaj niezależne ostrzeżenie o spadku >8 kg w ~12 miesięcy
      try {
        if (typeof window.check12mLossOrange === 'function') {
          const hist = window.intakeHistory || rows;
          window.check12mLossOrange(hist, 'intakeResults');
        }
      } catch (e) {}
    }
  } catch(e){}
}

/* ——— debounce ——— */
let intakeTimer=null;
function debouncedIntakeCalc(){
  clearTimeout(intakeTimer);
  intakeTimer = setTimeout(calcEstimatedIntake, 200);
}

/* ——— automatyczny reset przy zmianach w „Dane użytkownika” ——— */
function resetIntakeCard(){
  const card = document.getElementById('intakeCard');
  const meas = document.getElementById('intakeMeasurements');
  const res  = document.getElementById('intakeResults');
  if(card) card.style.display='none';        // zamknij
  intakeAutofilledOnce = false;              // pozwól na ponowne wypełnienie
  if(meas) meas.innerHTML='';
  if(res)  res.innerHTML='';
  // Wyczyść globalne zmienne historii i szacowanego spożycia
  try {
    window.intakeHistory = null;
    window.intakeEstimatedKcalPerDay = null;
  } catch(e){}
}
function wireAutosyncIntakeWithUserData(){
  ['age','ageMonths','sex','weight','height'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    // input oraz change – aby zareagować i na wpisywanie, i na wybór z listy
    el.addEventListener('input', resetIntakeCard);
    el.addEventListener('change', resetIntakeCard);
  });
}

/**
 * Steruje widocznością czerwonych przycisków „×” do usuwania wierszy w karcie
 * Szacowanego spożycia energii. Jeśli istnieje tylko jeden wiersz, przycisk
 * usuwania jest ukrywany, aby użytkownik nie mógł usunąć ostatniego pomiaru.
 */
function updateIntakeRemoveButtons(){
  const rows = document.querySelectorAll('#intakeMeasurements .measure-row-intake');
  rows.forEach(row=>{
    const btn = row.querySelector('.remove-intake-row');
    if(btn){
      btn.style.display = rows.length > 1 ? 'inline-block' : 'none';
    }
  });
}

/* ——— setup ——— */
function setupEstimatedIntake(){
  const btn   = document.getElementById('toggleIntakeCard');
  const card  = document.getElementById('intakeCard');
  const addBtn= document.getElementById('intakeAddRow');
  if(!btn || !card) return;
/* === Badge: kropka na przycisku, gdy wykryto ryzyko niedożywienia === */
function setIntakeBadge(on, level){
  if (!btn) return;
  btn.classList.toggle('has-alert', !!on);
  const base = 'Szacowane spożycie energii';
  btn.setAttribute('aria-label', on ? base + ' — wykryto możliwe ryzyko niedożywienia' : base);
  if (on) btn.title = 'Wykryto możliwe ryzyko niedożywienia — kliknij, aby zobaczyć szczegóły';
  else btn.removeAttribute('title');
}

/* Szybka ocena na podstawie samych „Danych użytkownika” (wiek/wzrost/waga) */
function updateIntakeBadgeFromBasics(){
  try {
    if (typeof getUserBasics !== 'function' || typeof window.detectAnRisk !== 'function') return;
    const u = getUserBasics(); // { ageYears, ageMonths, sex, height, weight }
    const user = {
      ageYears: Number(u.ageYears)||0,
      ageMonthsOpt: Number(u.ageMonths)||0,
      sex: u.sex || 'M',
      heightCm: Number(u.height)||0,
      weightKg: Number(u.weight)||0
    };
    if (!(user.ageYears && user.heightCm && user.weightKg)) { setIntakeBadge(false); return; }
    const risk = window.detectAnRisk(user, {}); // tylko próg BMI/EBW itd.
    setIntakeBadge(risk.any, risk.level);
  } catch(_){}
}
  // Funkcja pomocnicza sterująca widocznością przycisku „Szacowane spożycie energii”.
  // Przycisk jest widoczny dopiero, gdy użytkownik wprowadzi masę, wzrost i wiek.
  function updateIntakeToggleVisibility(){
    // Pobierz wartości masy i wzrostu z pól formularza
    const w = parseFloat(document.getElementById('weight')?.value);
    const h = parseFloat(document.getElementById('height')?.value);
    // Oblicz wiek w latach z uwzględnieniem miesięcy. Funkcja getAgeDecimal()
    // zwróci 0, jeśli oba pola wieku są puste lub niepoprawne.
    const ageDec = typeof getAgeDecimal === 'function' ? getAgeDecimal() : 0;

    // Sprawdź, czy wartości mieszczą się w dozwolonych zakresach. Przyjmujemy te same
    // progi, które obowiązują w głównej walidacji w funkcji update():
    //  – wiek: minimum 0.25 roku (3 miesiące) i maksimum 130 lat,
    //  – waga: 1–500 kg,
    //  – wzrost: 40–250 cm.
    const hasValidAge    = !isNaN(ageDec) && ageDec >= 0.25 && ageDec <= 130;
    const hasValidWeight = !isNaN(w)      && w >= 1         && w <= 500;
    const hasValidHeight = !isNaN(h)      && h >= 40        && h <= 250;

    const visible = hasValidAge && hasValidWeight && hasValidHeight;
    // Jeśli wszystkie dane są poprawne, pokaż przycisk; w przeciwnym razie ukryj go
    btn.style.display = visible ? 'block' : 'none';
    // Jeśli przycisk jest widoczny i dane są poprawne → spróbuj zapalić badge
    if (visible) updateIntakeBadgeFromBasics();
    else setIntakeBadge(false);
    if(!visible){
      // Zamknij kartę, jeśli przestaje spełniać warunek
      card.style.display = 'none';
    }
  }

  // natychmiastowa ocena widoczności przy pierwszym załadowaniu
  updateIntakeToggleVisibility();

  // dodaj nasłuchy na wprowadzane dane użytkownika
  ['weight','height','age','ageMonths'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', updateIntakeToggleVisibility);
      el.addEventListener('change', updateIntakeToggleVisibility);
    }
  });

  wireAutosyncIntakeWithUserData();

  btn.addEventListener('click', ()=>{
    const show = (card.style.display === 'none' || card.style.display === '');
    card.style.display = show ? 'block' : 'none';
    if(show){
      intakeAutofill();
      _updateIntakeFirstRowFromUserBasics(); // ← blokada + wyszarzenie po autofill
      calcEstimatedIntake();
    }
  });

  if(addBtn){
    addBtn.addEventListener('click', ()=>{ intakeAddRow(); });
  }
  document.getElementById('intakePal')?.addEventListener('change', debouncedIntakeCalc);

  // przelicz wyniki przy rotacji/zmianie szerokości (przełączanie table->cards)
  window.addEventListener('resize', ()=>{
    const visible = card && card.style.display !== 'none';
    if(visible) calcEstimatedIntake();
  });
  // Zsynchronizuj badge z właściwą detekcją (po pełnym wyliczeniu).
  if (typeof window.anorexiaRiskAdjust === 'function') {
  const __orig = window.anorexiaRiskAdjust;
  window.anorexiaRiskAdjust = function(){
    const ret = __orig.apply(this, arguments);
    try { if (ret && ret.risk) setIntakeBadge(ret.risk.any, ret.risk.level); } catch(_){}
    return ret;
  };
}
}

document.addEventListener('DOMContentLoaded', setupEstimatedIntake);
/* ================= WHR – stałe i dane =================== */

// Progi WHO dla dorosłych (otyłość brzuszna / zwiększone ryzyko)
const ADULT_WHR_LIMIT = { M: 0.90, F: 0.85 }; // WHO Expert Consultation, 2008/2011. (dokumentacja w UI) 

// --- POLSKIE CENTYLE OLAF/OLA: TALIA (cm) – CHŁOPCY 3–18 l. ---
const WAIST_PL_BOYS = {
  3:[45.1,45.9,47.3,49.2,51.5,53.9,55.7], 4:[46.2,47.1,48.7,50.7,53.2,55.9,57.9],
  5:[47.3,48.2,49.9,52.2,54.9,58.1,60.4], 6:[48.4,49.4,51.2,53.7,56.8,60.5,63.2],
  7:[49.5,50.6,52.6,55.4,58.9,63.1,66.3], 8:[50.7,51.8,54.1,57.2,61.2,66.0,69.8],
  9:[51.9,53.2,55.7,59.1,63.6,69.1,73.6], 10:[53.2,54.6,57.3,61.0,66.0,72.1,77.1],
  11:[54.7,56.2,59.1,63.0,68.2,74.7,80.0], 12:[56.5,58.0,61.0,65.0,70.3,76.9,82.2],
  13:[58.5,60.0,63.0,67.0,72.3,78.7,83.7], 14:[60.6,62.1,65.1,69.0,74.1,80.2,84.9],
  15:[62.7,64.2,67.1,71.0,75.9,81.6,86.0], 16:[64.7,66.2,69.1,72.9,77.7,83.2,87.4],
  17:[66.5,68.0,70.9,74.8,79.6,85.1,89.2], 18:[68.1,69.7,72.7,76.6,81.5,87.1,91.2]
};
// --- TALIA – DZIEWCZĘTA ---
const WAIST_PL_GIRLS = {
  3:[44.0,44.9,46.4,48.4,50.8,53.3,55.1], 4:[45.1,46.0,47.6,49.8,52.4,55.3,57.3],
  5:[46.0,46.9,48.7,51.1,54.0,57.2,59.5], 6:[46.9,47.9,49.8,52.4,55.5,59.1,61.7],
  7:[47.9,49.0,51.0,53.8,57.2,61.2,64.2], 8:[49.0,50.2,52.4,55.4,59.2,63.6,67.1],
  9:[50.4,51.7,54.0,57.3,61.4,66.4,70.2], 10:[51.9,53.2,55.7,59.2,63.6,69.0,73.3],
  11:[53.6,54.9,57.5,61.1,65.7,71.3,75.8], 12:[55.4,56.8,59.4,63.0,67.6,73.2,77.5],
  13:[57.3,58.6,61.2,64.7,69.2,74.6,78.7], 14:[58.8,60.1,62.7,66.1,70.4,75.6,79.5],
  15:[59.9,61.2,63.7,67.0,71.3,76.2,80.0], 16:[60.6,61.9,64.3,67.6,71.8,76.6,80.3],
  17:[61.0,62.3,64.8,68.1,72.2,76.9,80.5], 18:[61.4,62.7,65.1,68.4,72.5,77.2,80.7]
};
// --- BIODRA – CHŁOPCY ---
const HIP_PL_BOYS = {
  3:[48.3,49.2,50.8,53.0,55.6,58.5,60.6], 4:[50.5,51.5,53.2,55.6,58.4,61.6,63.9],
  5:[52.5,53.6,55.5,58.1,61.3,64.9,67.4], 6:[54.6,55.8,58.0,60.9,64.4,68.5,71.4],
  7:[56.9,58.2,60.6,63.9,67.9,72.5,75.8], 8:[59.2,60.7,63.4,67.0,71.5,76.6,80.4],
  9:[61.5,63.1,66.2,70.2,75.1,80.7,84.8], 10:[63.8,65.6,68.9,73.3,78.7,84.7,89.0],
  11:[66.2,68.2,71.8,76.5,82.1,88.3,92.7], 12:[69.0,71.1,74.8,79.7,85.5,91.7,96.1],
  13:[72.2,74.3,78.1,83.0,88.8,94.9,99.1], 14:[75.7,77.7,81.5,86.2,91.7,97.6,101.6],
  15:[79.1,81.1,84.6,89.1,94.3,99.7,103.5], 16:[82.1,83.9,87.2,91.4,96.3,101.4,104.9],
  17:[84.5,86.2,89.3,93.3,98.0,102.8,106.2], 18:[86.5,88.1,91.1,94.9,99.3,104.0,107.2]
};
// --- BIODRA – DZIEWCZĘTA ---
const HIP_PL_GIRLS = {
  3:[48.6,49.6,51.4,53.6,56.1,58.8,60.5], 4:[50.6,51.7,53.7,56.2,59.2,62.3,64.4],
  5:[52.6,53.8,56.0,58.8,62.0,65.6,68.0], 6:[54.8,56.1,58.4,61.4,64.9,68.8,71.5],
  7:[57.2,58.6,61.0,64.3,68.2,72.4,75.4], 8:[59.7,61.1,63.8,67.3,71.6,76.3,79.7],
  9:[62.1,63.7,66.7,70.6,75.2,80.3,83.9], 10:[64.4,66.2,69.5,73.8,78.8,84.2,87.9],
  11:[67.1,69.0,72.7,77.3,82.7,88.5,92.5], 12:[70.8,72.9,76.6,81.4,87.0,92.9,96.9],
  13:[75.1,77.2,81.0,85.7,91.1,96.6,100.2], 14:[79.0,81.0,84.5,89.0,94.0,99.0,102.4],
  15:[81.9,83.7,87.0,91.1,95.8,100.7,103.9], 16:[83.5,85.2,88.4,92.3,96.9,101.6,104.8],
  17:[84.5,86.1,89.2,93.0,97.5,102.2,105.5], 18:[85.0,86.7,89.7,93.5,97.9,102.6,105.8]
};

// Centyle w kolejności: 5,10,25,50,75,90,95  (zgodne z tablicami)
const CENT_LIST = [5,10,25,50,75,90,95];

/* --------- pomoc: interpolacja centyla dla danej wartości --------- */
function percentileFromBand(value, arrVals){
  // arrVals: [v5,v10,v25,v50,v75,v90,v95]
  // poniżej najniższego → <5 c.; powyżej najwyższego → >95 c.
  if (value <= arrVals[0]) {
    // liniowo 0..5
    const p = (value/arrVals[0])*5;
    return Math.max(0, Math.min(5, p));
  }
  if (value >= arrVals[arrVals.length-1]) {
    // liniowo 95..100
    const v2 = arrVals[arrVals.length-1], v1 = arrVals[arrVals.length-2];
    const slope = (100-95)/(v2-v1);
    return Math.min(100, 95 + (value - v1)*slope);
  }
  // szukamy przedziału
  for (let i=0;i<arrVals.length-1;i++){
    const vL = arrVals[i], vU = arrVals[i+1];
    if (value >= vL && value <= vU){
      const frac = (value - vL)/(vU - vL || 1);
      const pL = CENT_LIST[i], pU = CENT_LIST[i+1];
      return pL + frac*(pU-pL);
    }
  }
  return 50;
}

/* Interpolacja po wieku (3..18 lat): oblicz centyl dla dwóch wieku brzegowych i zinterpoluj */
function childPercentileFromTables(ageY, sex, waistCm, hipCm){
  if (ageY < 3 || ageY > 18 || !sex) return null;
  const tblW = sex==='M' ? WAIST_PL_BOYS : WAIST_PL_GIRLS;
  const tblH = sex==='M' ? HIP_PL_BOYS   : HIP_PL_GIRLS;
  const aLo = Math.max(3, Math.min(18, Math.floor(ageY)));
  const aHi = Math.max(3, Math.min(18, Math.ceil(ageY)));
  const t = (aHi===aLo) ? 0 : (ageY - aLo)/(aHi - aLo);

  const wLo = percentileFromBand(waistCm, tblW[aLo] || tblW[aHi]);
  const wHi = percentileFromBand(waistCm, tblW[aHi] || tblW[aLo]);
  const hLo = percentileFromBand(hipCm,   tblH[aLo] || tblH[aHi]);
  const hHi = percentileFromBand(hipCm,   tblH[aHi] || tblH[aLo]);

  return {
    waistP: wLo + t*(wHi - wLo),
    hipP:   hLo + t*(hHi - hLo)
  };
}

/* Oblicz WHR (waist/hip) z ochroną przed zerem */
function computeWHR(waistCm, hipCm){
  const w = parseFloat(waistCm)||0, h = parseFloat(hipCm)||0;
  if (w<=0 || h<=0) return null;
  return +(w/h).toFixed(2);
}

/* Interpretacja WHR – zwraca obiekt do renderu (z polami state, waistP, hipP) */
function interpretWHR(ageY, sex, waistCm, hipCm, bmiVal, bmiPercentile, coleCat){
  const whr = computeWHR(waistCm, hipCm);
  if (whr===null) return null;

  let header = `WHR: <span class="result-val">${whr}</span>`; // zostawiamy dla zgodności, ale nie używamy w renderze A
  let interp = '';
  let tableHtml = '';
  let showTable = false;

  // NOWE: stan i centyle
  let state = 'ok';
  let waistP = null, hipP = null;

  if (ageY >= 18){ // DOROŚLI – WHO
    const lim = ADULT_WHR_LIMIT[sex] || 0.90;
    const ok = whr <= lim;
    state = ok ? 'ok' : 'bad';
    if (ok){
      interp = `Rozmieszczenie tkanki tłuszczowej <strong>w normie</strong> (próg ${lim.toFixed(2)}).`;
    }else{
      interp = `WHR przekracza próg WHO (${lim.toFixed(2)}) – <strong>otyłość brzuszna</strong>, zwiększone ryzyko sercowo‑metaboliczne.`;
    }
  } else {
    // DZIECI – centyle TALII/BIODER; WHR podajemy liczbowo
    const pc = childPercentileFromTables(ageY, sex, waistCm, hipCm);
    if (pc){
      waistP = pc.waistP; hipP = pc.hipP;

      // kategoryzacja ryzyka wg talii (spójna z Twoim opisem)
      if (pc.waistP >= 95){
        state = 'bad';
      } else if (pc.waistP >= 85){
        state = 'warn';
      } else {
        state = 'ok';
      }

      const waistTxt = `${pc.waistP.toFixed(0)} centyl`;
      const hipTxt   = `${pc.hipP.toFixed(0)} centyl`;
      const risk =
        (state==='bad')  ? 'Talia &ge;95. centyla – <strong>istotnie podwyższone ryzyko otyłości brzusznej</strong>.'
      : (state==='warn') ? 'Talia &ge;85. centyla – <strong>podwyższony</strong> WHR/ryzyko centralizacji tkanki tłuszczowej.'
                         : 'Proporcje talii do bioder <strong>w normie</strong> dla wieku.';

      interp = risk;
      showTable = true;
      tableHtml = `
        <table>
          <thead><tr><th>Parametr</th><th>Wartość</th><th>Centyl</th></tr></thead>
          <tbody>
            <tr><td>Obwód talii</td><td>${waistCm.toFixed ? waistCm.toFixed(1) : waistCm} cm</td><td>${pc.waistP.toFixed(0)} c.</td></tr>
            <tr><td>Obwód bioder</td><td>${hipCm.toFixed ? hipCm.toFixed(1) : hipCm} cm</td><td>${pc.hipP.toFixed(0)} c.</td></tr>
          </tbody>
        </table>`;
    } else {
      interp = 'Dla wieku poniżej 3 lat lub powyżej 18 lat tabele pediatryczne nie są dostępne.';
    }
  }

  // Notka edukacyjna – zostaje jak było u Ciebie
  let note = '';
  if (ageY>=18){
    const lim = ADULT_WHR_LIMIT[sex] || 0.90;
    if (bmiVal && bmiVal<25 && whr>lim){
      note = 'Mimo prawidłowego BMI, wysoki WHR sugeruje odkładanie tłuszczu w okolicy brzucha (zwiększone ryzyko metaboliczne).';
    }
  } else if (bmiPercentile!=null){
    const coleOver = (coleCat==='Nadwaga' || String(coleCat).startsWith('Otyłość'));
    if (bmiPercentile<85 && coleOver){
      note = 'BMI w normie, ale wskaźnik Cole’a wskazuje nadwagę – WHR pomaga ocenić typ otłuszczenia (centralny vs gynoidalny).';
    }
  }

  return { whr, header, interp, tableHtml, showTable, note, state, waistP, hipP };
}

/* Kiedy zasugerować WHR (baner w karcie) */
function shouldSuggestWHR(ageY, sex, bmiVal, bmiPercentile, coleCat){
  if (!ageY || !sex || !bmiVal) return false;
  if (ageY >= 18){
    return bmiVal > 24; // dorosły BMI >24
  } else {
    const coleOver = (coleCat==='Nadwaga' || String(coleCat).startsWith('Otyłość'));
    return (bmiPercentile!=null && bmiPercentile >= 85) || (bmiPercentile!=null && bmiPercentile < 85 && coleOver);
  }
}

/* === Idealna waga – obsługa UI karty "Droga do normy BMI" === */
(function(){
  // Obliczenie mediany BMI (50. centyla) na podstawie danych LMS
  function medianBMI(sex, months) {
    if (typeof getLMS !== 'function') return null;
    const lms = getLMS(sex, Math.round(months));
    return lms ? lms[1] : null;
  }

  // Oblicz i wyświetl idealną wagę po kliknięciu
  function renderIdealWeight() {
    const infoEl = document.getElementById('idealWeightInfo');
    if (!infoEl) return;
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sex    = document.getElementById('sex')?.value || 'M';
    if (!(height > 0)) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
      return;
    }
    const hMeters = height / 100;
    let idealW = null;
    let msg = '';
    if (ageDec >= 18) {
      // Dorośli – „idealna” masa ciała liczona dla BMI = 22,0
      const targetBMI = 22.0;
      idealW = targetBMI * hMeters * hMeters;
      msg = `Dla Twojego wzrostu orientacyjna „idealna” masa ciała to ok. ${idealW.toFixed(1)}&nbsp;kg (BMI&nbsp;22,0).`;
    } else {
      // Dzieci – korzystamy z 50. centyla BMI dla wieku i płci
      const months = Math.round(ageDec * 12);
      const mBMI = medianBMI(sex, months);
      if (mBMI == null) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<strong>Brak danych referencyjnych BMI 50. centyla dla tego wieku.</strong>`;
        return;
      }
      idealW = mBMI * hMeters * hMeters;
      msg = `Przy Twoim wzroście i wieku idealna masa ciała (50. centyl BMI) to około ${idealW.toFixed(1)}&nbsp;kg.`;
    }
    infoEl.style.display = 'block';
    infoEl.innerHTML = `<strong>${msg}</strong>`;
  }

  // Funkcja pomocnicza umożliwiająca naprzemienne wyświetlanie lub ukrywanie
  // informacji o idealnej wadze po kliknięciu przycisku. Jeśli wynik
  // aktualnie jest widoczny, zostaje schowany, w przeciwnym razie obliczany
  // jest na nowo przez funkcję renderIdealWeight(). Ta funkcja nie powinna
  // być wywoływana z poziomu update, aby uniknąć przypadkowego ukrywania
  // wyniku podczas automatycznych aktualizacji.
  function toggleIdealWeight() {
    const infoEl = document.getElementById('idealWeightInfo');
    if (!infoEl) return;
    // Jeżeli wynik jest widoczny – ukryj i wyczyść zawartość
    if (infoEl.style.display !== 'none' && infoEl.innerHTML) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
    } else {
      // W innym przypadku oblicz i pokaż na nowo
      renderIdealWeight();
    }
  }

  // Sprawdź, czy BMI jest w normie, i pokaż/ukryj przycisk i notatkę
  function updateIdealWeightUI() {
    const noteEl  = document.getElementById('toNormNote');
    const wrapEl  = document.getElementById('idealWeightWrap');
    const infoEl  = document.getElementById('idealWeightInfo');
    const btnEl   = document.getElementById('idealWeightBtn');
    if (!noteEl || !wrapEl) return;
    // Pobierz dane wejściowe
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sex    = document.getElementById('sex')?.value || 'M';
    // Gdy brak pełnych danych, ukryj oba elementy
    if (!(weight > 0 && height > 0)) {
      noteEl.style.display = 'none';
      wrapEl.style.display = 'none';
      if (infoEl) {
        infoEl.style.display = 'none';
        infoEl.innerHTML = '';
      }
      return;
    }
    // Oblicz BMI
    const bmi = weight / Math.pow(height / 100, 2);
    let isNormal = false;
    if (ageDec >= 18) {
      // Dorośli: BMI w normie jeśli 18.5 ≤ BMI < 25
      isNormal = (bmi >= 18.5 && bmi < 25);
    } else {
      const months = Math.round(ageDec * 12);
      let percentile = null;
      if (typeof bmiPercentileChild === 'function') {
        percentile = bmiPercentileChild(bmi, sex, months);
      }
      if (percentile == null || isNaN(percentile)) {
        // Brak danych – ukryj oba elementy
        noteEl.style.display = 'none';
        wrapEl.style.display = 'none';
        if (infoEl) {
          infoEl.style.display = 'none';
          infoEl.innerHTML = '';
        }
        return;
      }
      // Dzieci: BMI w normie jeśli 5 ≤ centyl < 85
      isNormal = (percentile >= 5 && percentile < 85);
    }
    // Notatka „szacunkowa liczba km…” pokazuje się, gdy BMI NIE jest w normie
    noteEl.style.display = isNormal ? 'none' : 'inline';
    // Przycisk do idealnej wagi pokazujemy, gdy BMI jest w normie
    wrapEl.style.display = isNormal ? 'block' : 'none';
    // Gdy wychodzimy z normy – ukryj wynik
    if (!isNormal && infoEl) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
    }
    // Podpinamy zdarzenie kliknięcia (jednorazowe oznaczenie data-attr)
    if (isNormal && btnEl && !btnEl.dataset.idealAttached) {
      // Do przycisku dopinamy toggleIdealWeight zamiast bezpośrednio renderować wynik.
      // Dzięki temu kolejne kliknięcia będą naprzemiennie pokazywać i ukrywać tekst.
      btnEl.addEventListener('click', toggleIdealWeight);
      btnEl.dataset.idealAttached = '1';
    }
    // Jeśli wynik idealnej wagi jest już widoczny – przelicz go na żywo przy zmianie danych
    if (isNormal && infoEl && infoEl.style.display !== 'none') {
      renderIdealWeight();
    }
  }
  // Po załadowaniu strony obliczamy i ustawiamy widoczność
  document.addEventListener('DOMContentLoaded', function() {
    updateIdealWeightUI();
  });
  // Zachowaj poprzednią funkcję update i dopnij aktualizację na koniec
  const prevUpdate2 = window.update;
  window.update = function() {
    if (typeof prevUpdate2 === 'function') {
      prevUpdate2.apply(this, arguments);
    }
    updateIdealWeightUI();
  };
})();
/* === BMI-p50 helpers (EBW) – polyfill dla modułu ryzyka AN ==================
   Używa getLMS(sex, ageMonths) → [L, M, S], gdzie M = 50. centyl BMI.
   Zakres wieku: 0–216 mies.  Zwraca liczbę (BMI p50) lub null.
   Idempotentne: nie nadpisuje istniejących implementacji. */

   (function () {
    function _bmiP50FromLMS(ageMonths, sex) {
      const m = Math.round(Number(ageMonths));
      const s = (sex === 'M') ? 'M' : 'F';
      if (!isFinite(m) || m < 0 || m > 216) return null;
      if (typeof getLMS !== 'function') return null;
      const lms = getLMS(s, m);          // BMI-for-age LMS
      return (lms && isFinite(lms[1])) ? Number(lms[1]) : null; // M = mediana (P50)
    }
  
    // Jeśli nie zdefiniowano – dodaj
    if (typeof window.getBmiP50ForAgeSex !== 'function') {
      window.getBmiP50ForAgeSex = function (ageMonths, sex) {
        return _bmiP50FromLMS(ageMonths, sex);
      };
    }
  
    // Cole 100% odpowiada BMI z 50. centyla → alias
    if (typeof window.getColeBMI50 !== 'function') {
      window.getColeBMI50 = function (ageMonths, sex) {
        return _bmiP50FromLMS(ageMonths, sex);
      };
    }
  })();

// === 12-miesięczne ostrzeżenie o dużej utracie masy (niezależne od AN) ===
(function () {
  const CSS_ID = 'warn-12m-loss-orange-style';
  if (!document.getElementById(CSS_ID)) {
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .warn-12m-orange {
        box-sizing: border-box;
        margin: 0.75rem 0 1rem 0;
        padding: 0.75rem 0.9rem;
        border-left: 4px solid #cc6e00;
        background: #ff8c00;
        color: #ffffff;
        border-radius: 6px;
        font-size: 0.95rem;
        line-height: 1.35;
      }
      .warn-12m-orange strong { color: #fff; }
      .warn-12m-orange small { opacity: 0.9; }
    `;
    document.head.appendChild(style);
  }

  function _rowToPoint(r) {
    let t = null;
    if (r.t != null) t = Number(r.t);
    else if (r.date) t = Date.parse(r.date);
    else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
    const w = (r.weight != null) ? Number(r.weight) : null;
    return (t && isFinite(w)) ? { t, w } : null;
  }

  // znajdź parę punktów oddzielonych ~12 miesięcy (11–13 m)
  function _find12mAgoPair(pointsSortedAsc) {
    if (!pointsSortedAsc.length) return null;
    const b = pointsSortedAsc[pointsSortedAsc.length - 1];
    const targetDays = 365.24;
    const minDays = 335; // ≥ ~11 mies.
    const maxDays = 395; // ≤ ~13 mies.
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i < pointsSortedAsc.length - 1; i++) {
      const a = pointsSortedAsc[i];
      const dtDays = (b.t - a.t) / (1000 * 3600 * 24);
      if (dtDays >= minDays && dtDays <= maxDays) {
        const d = Math.abs(dtDays - targetDays);
        if (d < bestDiff) { best = { a, b, dtDays }; bestDiff = d; }
      }
    }
    return best;
  }

  function _renderOrangeBanner(mount, text) {
    if (!mount) return;
    // Nie dubluj komunikatu 12m – sprawdź, czy alert jest już obecny
    if (mount.querySelector('.intake-alert.warn[data-kind="12m"]')) return;
    const box = document.createElement('div');
    box.className = 'intake-alert warn';
    box.dataset.kind = '12m';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<strong>Uwaga:</strong> ${text}`;
    // Dodaj komunikat na końcu kontenera wyników
    mount.appendChild(box);
    // Jeśli nie ma silniejszego czerwonego alertu, ustaw stan ostrzegawczy i puls
    if (!mount.classList.contains('bmi-danger')) {
      mount.classList.add('bmi-warning');
      try { applyPulse(mount, 'warning'); } catch (_) {}
    }
  }

  // API: sprawdź historię i wstaw ostrzeżenie, gdy spadek > 8 kg w ~12 miesięcy
  function check12mLossOrange(history, mountId) {
    if (!Array.isArray(history) || history.length < 2) return;
    const pts = history.map(_rowToPoint).filter(Boolean).sort((x, y) => x.t - y.t);
    if (pts.length < 2) return;
    const pair = _find12mAgoPair(pts);
    if (!pair) return;
    const lostKg = pair.a.w - pair.b.w; // >0 oznacza spadek
    if (lostKg > 8) {
      const text = `W ciągu ostatnich ~12 miesięcy masa spadła o ${lostKg.toFixed(1)} kg. ` +
                   `<small>Zalecamy ocenę, czy był to intencjonalny spadek.</small>`;
      const mount = document.getElementById(mountId || 'intakeResults');
      _renderOrangeBanner(mount, text);
    }
  }

  window.check12mLossOrange = check12mLossOrange;
})();

/* ================== SAVE / LOAD JSON – Vilda Clinic (2025-09-05) ================== */
(function(){
  function q(id){ return document.getElementById(id); }
  function num(v){ const n = parseFloat(v); return isFinite(n) ? n : null; }
  function val(id){ const el=q(id); return el ? el.value : ''; }

  // ---------------------------------------------------------------------------
  // Tooltip helpers specific to Save/Load menu actions
  //
  // These functions are defined within this IIFE so they are available to
  // all handlers managing the Save/Load buttons.  We do not rely on
  // definitions from other modules to avoid scope issues.  getTip() returns
  // the tooltip text from the element’s `data-tip` attribute, falling back
  // to `title` if `data-tip` is absent.  migrateTitleToDataTip() moves
  // existing `title` attributes into `data-tip` and removes the `title`,
  // preventing native browser tooltips from appearing.
  function getTip(el) {
    if (!el) return '';
    const dt = el.getAttribute('data-tip');
    if (dt && dt.trim() !== '') return dt;
    const t = el.getAttribute('title');
    return t || '';
  }

  function migrateTitleToDataTip(el) {
    if (!el) return;
    const t = el.getAttribute('title');
    if (t) {
      if (!el.getAttribute('data-tip')) {
        el.setAttribute('data-tip', t);
      }
      el.removeAttribute('title');
    }
  }

  // Keep name fields in sync
  window.syncNames = function(source){
    const nameEl = q('name'), advEl = q('advName');
    if(!nameEl || !advEl) return;
    if(source==='name'){
      advEl.value = nameEl.value;
    }else if(source==='adv'){
      nameEl.value = advEl.value;
    }
    updateSaveBtnVisibility();
  };

  // === REHYDRATACJA UI PO WCZYTANIU PLIKU JSON ======================
  // Odtwórz wiersze w sekcji „Zaawansowane obliczenia wzrostowe” z window.advancedGrowthData
  function rehydrateAdvancedFromState(){
    const cont = document.getElementById('advMeasurements');
    if (!cont) return;
    cont.innerHTML = '';
    // jeśli nie ma danych – dodaj pusty jeden wiersz jak zwykle
    const arr = (window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements))
      ? window.advancedGrowthData.measurements
          .slice()
          // Sort measurements from oldest to newest by age in months. If ageMonths is missing,
          // fall back to ageYears converted to months.
          .sort((a, b) => {
            const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears || 0) * 12);
            const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears || 0) * 12);
            return am - bm;
          })
      : [];
    if (!arr.length) {
      if (typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
      if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced();
      return;
    }
    arr.forEach(m=>{
      if (typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
      const rows = cont.querySelectorAll('.measure-row');
      const row = rows[rows.length-1];
      if (!row) return;
      const set = (sel, v)=>{ const el=row.querySelector(sel); if(el) el.value = (v==null||Number.isNaN(v)) ? '' : String(v); };
      const ageDec = (typeof m.ageYears==='number') ? m.ageYears : (typeof m.ageMonths==='number' ? m.ageMonths/12 : null);
      // Rozdziel wiek na pełne lata i miesiące (0–11)
      if (typeof ageDec === 'number') {
        const yrs = Math.floor(ageDec);
        let mos = Math.round((ageDec - yrs) * 12);
        // Jeżeli zaokrąglenie miesięcy daje 12, zwiększ lata i zresetuj miesiące
        if (mos === 12) {
          mos = 0;
        }
        set('.adv-age-years', yrs);
        set('.adv-age-months', mos);
      } else {
        set('.adv-age-years', '');
        set('.adv-age-months', '');
      }
      set('.adv-height', (typeof m.height==='number') ? m.height : '');
      set('.adv-weight', (typeof m.weight==='number') ? m.weight : '');
      // Przywróć wiek kostny z historii, jeśli jest dostępny
      set('.adv-bone-age', (typeof m.boneAgeYears === 'number') ? m.boneAgeYears : '');
    });
    if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced();
  }

  // Odtwórz wiersze w karcie „Szacowane spożycie energii” z window.intakeHistory
  function rehydrateIntakeFromState(savedPal){
    const btn  = document.getElementById('toggleIntakeCard');
    const card = document.getElementById('intakeCard');
    const wrap = document.getElementById('intakeMeasurements');
    if (!wrap) return;
    // pokaż przycisk i kartę (spełniamy warunki widoczności z istniejącej logiki)
    if (btn) btn.style.display = 'none';
    if (card) card.style.display = 'none';
    wrap.innerHTML = '';
    // 1. wiersz = aktualne podstawowe dane użytkownika (zablokowany)
    if (typeof intakeAddRow === 'function'){
      let basics;
      if (typeof getUserBasics === 'function') {
        basics = getUserBasics();
      } else {
        const ageY = parseFloat(q('age')?.value);
        const ageM = parseFloat(q('ageMonths')?.value);
        const height = parseFloat(q('height')?.value);
        const weight = parseFloat(q('weight')?.value);
        basics = { ageMonths: (isNaN(ageY)?0:ageY)*12 + (isNaN(ageM)?0:ageM), height, weight };
      }
      intakeAddRow({ ageMonths: basics.ageMonths, height: basics.height, weight: basics.weight });
    }
    if (typeof _updateIntakeFirstRowFromUserBasics === 'function') {
      // Only update the locked row if basics are valid numbers
      const ageValid = !isNaN(parseFloat(q('age')?.value));
      const heightValid = !isNaN(parseFloat(q('height')?.value));
      const weightValid = !isNaN(parseFloat(q('weight')?.value));
      if (ageValid || heightValid || weightValid) {
        _updateIntakeFirstRowFromUserBasics();
      }
    }
    // pozostałe wiersze z historii
    const hist = Array.isArray(window.intakeHistory)
      ? window.intakeHistory
          .slice()
          // Sort intake history from oldest to newest by age in months. If ageMonths is missing,
          // fall back to ageYears converted to months.
          .sort((a, b) => {
            const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears || 0) * 12);
            const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears || 0) * 12);
            return am - bm;
          })
      : [];
    hist.forEach(m=>{
      // nie duplikuj 1. wiersza jeśli identyczny punkt czasu/wagi
      const existing = wrap.querySelectorAll('.measure-row-intake');
      let isDup = false;
      if(existing.length > 0){
        const first = existing[0];
        const y = parseFloat(first.querySelector('.intake-ageY')?.value)||0;
        const mm= parseFloat(first.querySelector('.intake-ageM')?.value)||0;
        const ageM = y*12+mm;
        const w = parseFloat(first.querySelector('.intake-wt')?.value);
        if (typeof m.ageMonths==='number' && Math.abs(ageM - m.ageMonths)<=1 &&
            typeof m.weight==='number' && Math.abs(w - m.weight) < 0.01) {
          isDup = true;
        }
      }
      if (isDup) return;
      if (typeof intakeAddRow === 'function'){
        intakeAddRow({ ageMonths: m.ageMonths, height: m.height, weight: m.weight });
      }
    });
    // Ustaw PAL (z zapisu lub planu)
    const palSel = document.getElementById('intakePal');
    if (palSel){
      palSel.value = (savedPal || palSel.value || '1.4');
      if (typeof intakeUpdatePalDesc === 'function') intakeUpdatePalDesc();
    }
    if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
    if (typeof calcEstimatedIntake === 'function') calcEstimatedIntake();
  }

  function anyDataEntered(){
    // Only treat *meaningful* user input as a started session.
    // Ignore default 'sex' value and empty/zero numerics.
    const hasText = (id) => {
      const el = q(id);
      if (!el) return false;
      const v = (el.value ?? '').trim();
      return v.length > 0;
    };
    const hasPosNumber = (id) => {
      const v = num(val(id));
      return v !== null && v > 0
    }
    return (
      hasText('name') ||
      hasText('advName') ||
      hasPosNumber('age') ||
      hasPosNumber('ageMonths') ||
      hasPosNumber('weight') ||
      hasPosNumber('height') ||
      hasPosNumber('advBoneAge') ||
      hasPosNumber('advMotherHeight') ||
      hasPosNumber('advFatherHeight')
    );
  }

  function updateSaveBtnVisibility(){
    const saveBtn = q('saveDataBtn');
    if(!saveBtn) return;
    const age = num(val('age')), w = num(val('weight')), h = num(val('height'));
    const nameOk = (val('name') || val('advName')).trim().length > 0;
    const minimal = (age!==null && age>0) && (w!==null && w>0) && (h!==null && h>0);
    const shouldEnable = (minimal && nameOk);
    // Ustaw zarówno właściwość disabled, jak i atrybut HTML.  Anchor nie
    // respektuje property `disabled` jeśli atrybut pozostaje w DOM.  Dzięki
    // temu styl CSS [disabled] działa poprawnie, a przycisk zmienia kolor.
    if (shouldEnable) {
      // Enable the save button by clearing both the property and the HTML attribute.
      // Anchor elements ignore the disabled property if the attribute remains, so
      // remove the attribute to allow pointer events and update CSS state.
      saveBtn.disabled = false;
      saveBtn.removeAttribute('disabled');
      saveBtn.removeAttribute('aria-disabled');
    } else {
      // Disable the save button and set the attribute so CSS can style it as inactive.
      saveBtn.disabled = true;
      saveBtn.setAttribute('disabled', '');
    }
    // Whenever we update the state of the save button we also need to revisit the
    // availability of the load button.  If any data has been entered, load
    // should be disabled; otherwise it should remain enabled.  This keeps
    // the load control in sync with the current session state without
    // requiring explicit listeners on every possible input field.
    maybeDisableLoadIfNeeded();
  }

  /**
   * Determine whether the load button should be active or disabled based on
   * whether the user has started entering any data.  If the form is still
   * empty (i.e. anyDataEntered() returns false), the load button remains
   * enabled.  Otherwise it is disabled and the `disabled` attribute is
   * applied to allow CSS styling.  This helper does not hide the previous
   * summary card or any messages — those actions remain in the `disableLoad()`
   * handler which runs when the user interacts with a field for the first time.
   */
  function maybeDisableLoadIfNeeded() {
    const loadEl = q('loadDataBtn');
    if (!loadEl) return;
    // Remove any stray native title attributes to prevent old tooltips
    migrateTitleToDataTip(loadEl);
    if (anyDataEntered()) {
      // Only update if the element is not already disabled to avoid
      // unnecessary DOM writes.
      if (!loadEl.disabled) {
        loadEl.disabled = true;
        loadEl.setAttribute('disabled', '');
      }
    } else {
      // If there is no user-entered data, ensure the load button is enabled.
      loadEl.disabled = false;
      loadEl.removeAttribute('disabled');
      loadEl.removeAttribute('aria-disabled');
    }
  }

  function collectUserData(){
    // Basic user
    const name = (val('name') || val('advName')).trim();
    const user = {
      age: num(val('age')),
      ageMonths: num(val('ageMonths')) || 0,
      sex: val('sex') || 'M',
      weight: num(val('weight')),
      height: num(val('height')),
      // Zachowaj dodatkowe pomiary obwodu talii i bioder.  Jeżeli pole jest puste
      // (lub zawiera wartość niepoprawną), num() zwraca null, co ułatwia
      // weryfikację przy późniejszym odtwarzaniu podsumowania.
      waist: num(val('waistCm')),
      hip: num(val('hipCm'))
    };

    // Advanced growth (read globals if available)
    const adv = {
      name: (val('advName') || name),
      boneAgeYears: num(val('advBoneAge')),
      motherHeight: num(val('advMotherHeight')),
      fatherHeight: num(val('advFatherHeight')),
      // state snapshot if available
      data: (window.advancedGrowthData ? JSON.parse(JSON.stringify(window.advancedGrowthData)) : null)
    };

    // Intake
    const intake = {
      pal: val('intakePal') || null,
      history: (Array.isArray(window.intakeHistory) ? JSON.parse(JSON.stringify(window.intakeHistory)) : null),
      estKcalPerDay: (typeof window.intakeEstimatedKcalPerDay==='number' ? window.intakeEstimatedKcalPerDay : null)
    };

    // Snacks & meals
    function readRows(containerSel, cls){
      const rows = [];
      document.querySelectorAll(cls).forEach(r=>{
        const sel = r.querySelector('select');
        const inp = r.querySelector('input[type="number"]');
        if(sel && inp){
          const key = sel.value; const qty = parseFloat(inp.value)||0;
          if(qty>0){ rows.push({ key, qty }); }
        }
      });
      return rows;
    }
    const snacks = readRows('#snackList','.snack-row');
    const meals  = readRows('#mealList','.meal-row');

    // Plan / diet selection snapshot (optional)
    const plan = {
      palFactor: num((q('palFactor')||{}).value),
      dietLevel: (q('dietLevel')||{}).value || null
    };

    return {
      version: 1,
      timestampISO: new Date().toISOString(),
      name,
      user,
      advanced: adv,
      intake,
      foods: { snacks, meals },
      plan
    };
  }

  function sanitizeFilename(name){
    // Build a file name based on the user's name and the current date (DDMMYYYY).
    // If no name is provided, default to "dane_<date>". Replace whitespace with underscores
    // and strip characters that are invalid in filenames.
    const now   = new Date();
    const day   = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year  = now.getFullYear();
    // Format date as DD_MM_YYYY with underscores between day, month and year
    const dateStr = `${day}_${month}_${year}`;
    if (!name || !name.trim()) {
      return `dane_${dateStr}`;
    }
    const sanitizedName = name
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '-');
    return `${sanitizedName}_${dateStr}`;
  }

  function saveUserData(){
    const data = collectUserData();
    // minimal required check: age, weight, height and name
    // zamiast alertów wyświetlamy niewielki tooltip przy przycisku „Zapisz dane” (jeśli istnieje)
    const saveBtnEl = document.getElementById('saveDataBtn');
    if(!(data.user.age && data.user.weight && data.user.height)){
      const msg = 'Uzupełnij: wiek, wagę i wzrost przed zapisem.';
      if (saveBtnEl && typeof showTooltip === 'function') {
        showTooltip(saveBtnEl, msg);
      } else {
        alert(msg);
      }
      return;
    }
    if(!(data.name && data.name.trim().length)){
      const msg = 'Podaj „Imię i Nazwisko” przed zapisem.';
      if (saveBtnEl && typeof showTooltip === 'function') {
        showTooltip(saveBtnEl, msg);
      } else {
        alert(msg);
      }
      return;
    }
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(data.name) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); document.body.removeChild(a); }, 0);
  }

  function clearAllData(){
    // Reset visible fields
    ['name','advName','age','ageMonths','weight','height','waistCm','hipCm','advBoneAge','advMotherHeight','advFatherHeight']
      .forEach(id=>{ const el=q(id); if(el){
        el.disabled=false;
        el.value='';
      } });
    // Reset selects
    if(q('sex')) q('sex').value = 'M';
    if(q('intakePal')) q('intakePal').value = '1.4';
    if(q('palFactor')) q('palFactor').value = '1.4';

    // Reset globals
    try { window.advancedGrowthData = { measurements: [] }; } catch(_){}
    try { window.intakeHistory = []; window.intakeEstimatedKcalPerDay = null; } catch(_){}
    // Remove dynamic rows UI if exist
    try {
      const advWrap = q('advMeasurements'); if(advWrap) advWrap.innerHTML='';
      const intakeWrap = q('intakeMeasurements'); if(intakeWrap) intakeWrap.innerHTML='';
      document.querySelectorAll('.snack-row,.meal-row').forEach(el=>el.remove());
    } catch(_){}
    // Ukryj komunikat o wczytaniu danych, jeśli był widoczny
    hideLoadDataMessage();
    // Przywróć działanie autoscrolla po pełnym wyczyszczeniu danych.
    // Jeżeli poprzednio wczytano dane z pliku lub z poprzedniej sesji,
    // flaga autoScrollDisabled mogła być ustawiona na true.  Resetujemy ją
    // tutaj, aby w nowej sesji autoscroll działał ponownie.
    try {
      if (typeof window !== 'undefined') {
        window.autoScrollDisabled = false;
      }
      autoScrollDisabled = false;
    } catch (_) {
      /* ignoruj błędy resetu autoscroll */
    }
    // Re-enable Load button
    const loadEl = q('loadDataBtn');
    if(loadEl) {
      loadEl.disabled = false;
      loadEl.removeAttribute('disabled');
    }

    if(typeof debouncedUpdate==='function') debouncedUpdate();
    updateSaveBtnVisibility();
  }

  function applyLoadedData(data){
    if(!data) return;
    const name = (data.name||'').trim();
    if(name){
      if(q('name')){ q('name').value = name; q('name').disabled = true; }
      if(q('advName')){ q('advName').value = name; q('advName').disabled = true; }
    }
    // Sex
    if(data.user && data.user.sex && q('sex')) q('sex').value = data.user.sex;

    // Advanced fields
    if(data.advanced){
      // Nie przenoś poprzedniego wieku kostnego do bieżącego pola. Wiek kostny z poprzedniej sesji
      // zostanie dołączony do historii pomiarów, a pole pozostanie puste, aby użytkownik mógł
      // wprowadzić nowy wiek kostny dla aktualnej wizyty.
      // (data.advanced.boneAgeYears zawiera wartość historyczną i nie jest wpisywana do inputu.)
      if(q('advMotherHeight') && data.advanced.motherHeight!=null) q('advMotherHeight').value = data.advanced.motherHeight;
      if(q('advFatherHeight') && data.advanced.fatherHeight!=null) q('advFatherHeight').value = data.advanced.fatherHeight;
      if(data.advanced.data){
        try { window.advancedGrowthData = data.advanced.data; } catch(_){}
      }
    }

    // Intake
    if(data.intake){
      if(q('intakePal') && data.intake.pal) q('intakePal').value = data.intake.pal;
      if(Array.isArray(data.intake.history)) {
        try { window.intakeHistory = data.intake.history; } catch(_){}
      }
      if(typeof data.intake.estKcalPerDay === 'number'){
        window.intakeEstimatedKcalPerDay = data.intake.estKcalPerDay;
      }
    }

    // Foods (rows are only UI; they will reappear when base data are entered)
    function buildRows(rows, addFn){
      if(!rows || !rows.length) return;
      rows.forEach(r=>{
        addFn();
        const list = document.querySelectorAll(addFn===addSnackRow ? '.snack-row' : '.meal-row');
        const row = list[list.length-1];
        if(!row) return;
        const sel = row.querySelector('select');
        const inp = row.querySelector('input[type="number"]');
        if(sel) sel.value = r.key;
        if(inp) inp.value = r.qty;
      });
    }
    try{
      if(data.foods){
        if(Array.isArray(data.foods.snacks)) buildRows(data.foods.snacks, addSnackRow);
        if(Array.isArray(data.foods.meals))  buildRows(data.foods.meals,  addMealRow);
      }
    }catch(_){}

    // Move current user (age/weight/height) into advanced history and clear inputs
    if (data.user) {
      const a = data.user;
      // Zapisz poprzedni pomiar do historii, jeśli dane są kompletne
      if (a.age != null && a.weight != null && a.height != null) {
        try {
          const ageMonths = Math.round((a.age || 0) * 12 + (a.ageMonths || 0));
          window.advancedGrowthData = window.advancedGrowthData || { measurements: [] };
          if (!Array.isArray(window.advancedGrowthData.measurements)) window.advancedGrowthData.measurements = [];
          window.advancedGrowthData.measurements.unshift({
            ageMonths,
            weight: a.weight,
            height: a.height,
            // zachowaj wiek kostny z poprzedniego zapisu (jeśli był)
            boneAgeYears: (data.advanced && typeof data.advanced.boneAgeYears === 'number') ? data.advanced.boneAgeYears : null
          });
        } catch (_) {}
      }
      // Po przeniesieniu poprzednich danych do historii wyczyść odpowiednie pola.
      // Jeżeli użytkownik jest dorosły (>18 lat), zakładamy, że jego wzrost się nie zmienia,
      // dlatego pozostawiamy poprzednio wprowadzoną wartość wzrostu w polu #height.
      if (a.age != null && a.age > 18) {
        // Wyczyść wiek, miesiące wieku, wagę oraz wiek kostny
        ['age', 'ageMonths', 'weight', 'advBoneAge'].forEach(id => { if (q(id)) { q(id).value = ''; } });
        // Przywróć zapisany wzrost
        if (q('height')) {
          q('height').value = (a.height != null ? a.height : '');
        }
      } else {
        // W pozostałych przypadkach wyczyść również wzrost
        ['age', 'ageMonths', 'weight', 'height', 'advBoneAge'].forEach(id => { if (q(id)) { q(id).value = ''; } });
      }
    }

    // Po wczytaniu danych wyłącz automatyczne przewijanie kart z wynikami.
    // Zgodnie z wymaganiami użytkownika, po odczytaniu wcześniej zapisanych
    // danych strona nie powinna przewijać się automatycznie podczas
    // obecnej sesji.  Ustawienie tej flagi sprawi, że funkcje odpowiedzialne
    // za płynne przewijanie opuszczą się natychmiast bez wykonania animacji.
    //
    // Poprzednia implementacja zapisywała wyłączenie autoscrolla tylko na
    // obiekcie `window` i przez to nie aktualizowała lokalnej zmiennej
    // `autoScrollDisabled`, z której korzystają funkcje takie jak
    // `scrollToResultsCard()`. W rezultacie przewijanie mogło nadal
    // występować po wczytaniu danych.  Ustawiamy oba pola (window i zmienną
    // lokalną), aby zagwarantować spójne zachowanie niezależnie od
    // kontekstu wykonania.
    try {
      if (typeof window !== 'undefined') {
        window.autoScrollDisabled = true;
      }
    } catch (_) {
      // W środowiskach bez `window` (np. SSR) ten krok jest pomijany.
    }
    // Zawsze ustaw lokalną zmienną kontrolującą autoscroll
    autoScrollDisabled = true;

    // Plan snapshot (optional)
    if(data.plan){
      if(q('palFactor') && data.plan.palFactor) q('palFactor').value = String(data.plan.palFactor);
      if(q('dietLevel') && data.plan.dietLevel) q('dietLevel').value = data.plan.dietLevel;
    }

    // ► NOWE: odtwórz UI z zapisanych struktur
    try { rehydrateAdvancedFromState(); } catch(_) {}
    try { rehydrateIntakeFromState((data && data.intake && data.intake.pal) || null); } catch(_) {}
    {
      const loadEl = q('loadDataBtn');
      if(loadEl) {
        loadEl.disabled = true;
        loadEl.setAttribute('disabled','');
      }
    }
    // Po udanym wczytaniu danych pokaż informację dla użytkownika.
    showLoadDataMessage();
    if(typeof debouncedUpdate==='function') debouncedUpdate();
    updateSaveBtnVisibility();

    // Po załadowaniu danych wygeneruj podsumowanie poprzednich pomiarów
    try {
      __renderPrevSummary(data);
    } catch(_){}
    // Zapisz informacje o poprzednim pomiarze w zmiennej globalnej prevMeasurementInfo, aby obliczać różnice
    try {
      if (typeof __pickLastMeasurement === 'function') {
        window.prevMeasurementInfo = __pickLastMeasurement(data);
      } else {
        window.prevMeasurementInfo = null;
      }
    } catch (_) {
      window.prevMeasurementInfo = null;
    }
    // Po wczytaniu danych natychmiast wywołaj aktualizację sekcji różnic, jeśli funkcja istnieje
    if (typeof window.updatePrevSummaryDiff === 'function') {
      try { window.updatePrevSummaryDiff(); } catch (_) {}
    }

    // Po wczytaniu danych automatycznie zwiń menu hamburgera.
    // Używamy pola typu checkbox (#navToggle) sterującego widocznością
    // pionowego menu.  Odznaczenie spowoduje zwinięcie menu.
    (function(){
      const navToggle = document.getElementById('navToggle');
      if (navToggle) {
        // Odznacz checkbox, aby zwinąć menu po wczytaniu danych
        navToggle.checked = false;
        // Natychmiast ukryj ewentualny tooltip związany z menu
        if (typeof __menuTooltip !== 'undefined' && __menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      }
    })();
  }

  function handleFile(e){
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = function(){
      try{
        const obj = JSON.parse(reader.result);
        applyLoadedData(obj);
      }catch(err){
        // Zamiast alertu wyświetlamy mały tooltip przy przycisku „Wczytaj dane”
        const loadBtnEl = document.getElementById('loadDataBtn');
        const msg = 'Nieprawidłowy plik JSON.';
        if (loadBtnEl && typeof showTooltip === 'function') {
          showTooltip(loadBtnEl, msg);
        } else {
          alert(msg);
        }
      }finally{
        e.target.value = '';
      }
    };
    reader.readAsText(f, 'utf-8');
  }

  document.addEventListener('DOMContentLoaded', function(){
    const loadBtn = q('loadDataBtn');
    const saveBtn = q('saveDataBtn');
    const fileIn  = q('fileInput');

    // Przeniesienie tekstu z atrybutu title do data-tip i usunięcie natywnych podpowiedzi
    migrateTitleToDataTip(loadBtn);
    migrateTitleToDataTip(saveBtn);

    if(loadBtn && fileIn) {
      // Początkowo wczytywanie danych jest dostępne – usuń atrybuty disabled
      loadBtn.disabled = false;
      loadBtn.removeAttribute('disabled');
      loadBtn.removeAttribute('aria-disabled');
      // Ustaw podpowiedź zachęcającą do wczytania danych, gdy formularz jest pusty
      // Uwaga: nie nadpisujemy istniejącego data-tip z HTML; migrateTitleToDataTip() już przeniósł title do data-tip
      loadBtn.addEventListener('click', (e) => {
        // Zatrzymaj domyślną nawigację
        e.preventDefault();
        // Jeśli przycisk jest wyłączony, pokaż wiadomość z atrybutu data-tip/title
        if(loadBtn.disabled) {
          const msg = getTip(loadBtn);
          if(msg) showTooltip(loadBtn, msg);
          return;
        }
        // Jeśli użytkownik wpisał już nowe dane, poinformuj go, że wczytywanie nie jest dostępne
        if(anyDataEntered()) {
          showTooltip(loadBtn, 'Wczytywanie danych jest możliwe tylko na początku sesji (gdy formularz jest pusty).');
          return;
        }
        // Wywołaj okno wyboru pliku
        fileIn.click();
      });
      fileIn.addEventListener('change', handleFile);
    }
    if(saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        // Zatrzymaj domyślną nawigację
        e.preventDefault();
        // Jeśli przycisk jest nieaktywny, wyświetl komunikat z atrybutu data-tip/title
        if(saveBtn.disabled) {
          const msg = getTip(saveBtn);
          if(msg) showTooltip(saveBtn, msg);
          return;
        }
        // W przeciwnym wypadku zapisz dane użytkownika
        saveUserData();
      });
    }

    // Dodaj niewielkie podpowiedzi (tooltipy) na najechanie lub dotknięcie
    // wyszarzonych pozycji.  Tooltipy są wyświetlane tylko, gdy element
    // jest w stanie disabled.
    function addDisabledTooltip(btn) {
      if(!btn) return;
      const handler = (ev) => {
        if(btn.disabled) {
          const msg = getTip(btn);
          if(msg) showTooltip(btn, msg);
        }
      };
      btn.addEventListener('mouseenter', handler);
      btn.addEventListener('touchstart', handler);
    }
    addDisabledTooltip(saveBtn);
    addDisabledTooltip(loadBtn);

    const nameEl = q('name'), advEl = q('advName');
    if(nameEl && advEl){
      nameEl.addEventListener('input', ()=>window.syncNames('name'));
      advEl.addEventListener('input', ()=>window.syncNames('adv'));
    }

    const disableLoad = () => {
      // Gdy użytkownik zaczyna wpisywać nowe dane, ukryj komunikat o wczytaniu danych
      hideLoadDataMessage();
      const loadEl = q('loadDataBtn');
      if (loadEl) {
        // Always remove any native title attribute to prevent old tooltips
        migrateTitleToDataTip(loadEl);
        loadEl.disabled = true;
        // Ustaw również atrybut HTML, aby styl CSS wyszarzył element
        loadEl.setAttribute('disabled', '');
      }
      // Podczas edycji nowych danych zdecyduj, czy należy pokazywać kartę
      // podsumowania poprzedniego pomiaru. Karta powinna być widoczna tylko wtedy,
      // gdy została wcześniej załadowana z pliku JSON (wrap.dataset.loaded === 'true').
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const toggle = document.getElementById('togglePrevSummary');
      if (card && toggle) {
        const hasLoaded = (card.dataset && card.dataset.loaded === 'true') || (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
        if (hasLoaded) {
          // Utrzymuj kartę podsumowania widoczną i ukryj przycisk toggle, aby nie zwijała się automatycznie
          if (wrap) wrap.style.display = 'block';
          card.style.display = 'block';
          toggle.style.display = 'none';
        } else {
          // Jeśli nie wczytano danych historycznych, ukryj kartę oraz przycisk toggle
          if (wrap) wrap.style.display = 'none';
          card.style.display = 'none';
          toggle.style.display = 'none';
        }
      }
    };
    ['name','advName','age','ageMonths','weight','height','advBoneAge','advMotherHeight','advFatherHeight']
      .forEach(id=>{ const el=q(id); if(el){ el.addEventListener('input', disableLoad); el.addEventListener('change', disableLoad);} });

    // Obsługa przycisków w podsumowaniu poprzednich pomiarów: rozwijanie i ukrywanie karty
    const togglePrev = document.getElementById('togglePrevSummary');
    const hidePrev   = document.getElementById('hidePrevSummary');
    const prevCard   = document.getElementById('prevSummaryCard');
    if(togglePrev && prevCard){
      togglePrev.addEventListener('click', () => {
        prevCard.style.display = 'block';
        togglePrev.style.display = 'none';
      });
    }
    if(hidePrev && prevCard && togglePrev){
      hidePrev.addEventListener('click', () => {
        prevCard.style.display = 'none';
        togglePrev.style.display = 'block';
      });
    }

    updateSaveBtnVisibility();
  });

  ['input','change'].forEach(evt=>{
    document.addEventListener(evt, function(e){
      const t = e.target;
      if(!t || !t.id) return;
      if(['name','age','ageMonths','weight','height'].includes(t.id)) updateSaveBtnVisibility();
    }, true);
  });

  window.vildaExport = { collectUserData, saveUserData, applyLoadedData, clearAllData };
  const btn = document.getElementById('clearAllDataBtn');
  if(btn){
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      clearAllData();
      // Po wyczyszczeniu danych ukryj kartę podsumowania i przycisk
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const toggle = document.getElementById('togglePrevSummary');
      if (wrap) {
        wrap.style.display = 'none';
        // Usuń znacznik załadowania poprzedniego pomiaru, aby karta nie była wyświetlana
        // w kolejnych sesjach bez wczytania danych
        if (wrap.dataset) delete wrap.dataset.loaded;
      }
      if (card) {
        card.style.display = 'none';
        if (card.dataset) delete card.dataset.loaded;
      }
      if (toggle) {
        toggle.style.display = 'none';
      }
    });
  }

  // ---------------------------------------------------------------------------
  //  Obsługa automatycznego zwijania menu po kliknięciu poza nim
  //
  //  Gdy menu hamburgera jest rozwinięte (checkbox navToggle jest zaznaczony),
  //  kliknięcie w dowolnym miejscu poza samym menu, checkboxem lub ikoną
  //  hamburgera powinno zwinąć menu.  Dzięki temu użytkownik może łatwo
  //  zamknąć menu bez konieczności ponownego klikania w ikonę.
  document.addEventListener('DOMContentLoaded', function () {
    const navToggle     = document.getElementById('navToggle');
    const verticalMenu  = document.getElementById('verticalMenu');
    const toggleLabel   = document.querySelector('label[for="navToggle"]');
    // Jeśli istnieje przycisk hamburgera, dołącz nasłuchiwanie zmiany stanu.
    // Gdy menu jest zwijane (navToggle.checked = false), należy ukryć wszelkie widoczne tooltipy,
    // aby nie zasłaniały innych elementów interfejsu.
    if (navToggle) {
      navToggle.addEventListener('change', function () {
        // Po zwinięciu menu od razu usuń tooltip
        if (!navToggle.checked && typeof __menuTooltip !== 'undefined' && __menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      });
    }
    // Jeśli elementy istnieją, podłącz globalny listener kliknięć, który zwija menu przy kliknięciu poza nim
    if (navToggle && verticalMenu) {
      document.addEventListener('click', function (event) {
        // Reaguj tylko, gdy menu jest aktualnie rozwinięte
        if (!navToggle.checked) return;
        const target = event.target;
        // Nie zwijaj menu, jeśli kliknięto wewnątrz pionowego menu,
        // checkboxa lub etykiety sterującej (ikona hamburgera)
        if (verticalMenu.contains(target) ||
            target === navToggle ||
            (toggleLabel && (toggleLabel.contains(target) || target === toggleLabel))) {
          return;
        }
        // Kliknięto poza menu — odznacz checkbox, aby zwinąć menu
        navToggle.checked = false;
        // Usuń aktywny tooltip po zwinięciu menu, aby nie zasłaniał opcji
        if (typeof __menuTooltip !== 'undefined' && __menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      });
    }
  });

(function() {
  // Elementy banera
  const banner   = document.getElementById('consent-banner');
  const btnAccept = document.getElementById('consent-accept');
  const btnDecline = document.getElementById('consent-decline');

  // Sprawdź, czy użytkownik podjął decyzję
  const consent = localStorage.getItem('analyticsConsent');

  function loadGA() {
    // Załaduj skrypt GA4 dopiero po wyrażeniu zgody
    const gaScript = document.createElement('script');
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-EZZTNV8W07';
    gaScript.async = true;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }

    gtag('js', new Date());
    gtag('config', 'G-EZZTNV8W07', {
      anonymize_ip: true
    });
  }

  if (!consent) {
    // Jeśli użytkownik nie udzielił zgody – pokaż baner
    banner.style.display = 'block';
  } else if (consent === 'granted') {
    loadGA();
  }

  btnAccept.addEventListener('click', function() {
    localStorage.setItem('analyticsConsent', 'granted');
    banner.style.display = 'none';
    loadGA();
  });

  btnDecline.addEventListener('click', function() {
    localStorage.setItem('analyticsConsent', 'denied');
    banner.style.display = 'none';
    // Brak ładowania GA4
  });
})();

})();

// === DODANE: podsumowanie różnic i wyrównanie wysokości kart (2025-11) ===
// Funkcje te obliczają różnice między ostatnim zapisanym pomiarem a
// aktualnymi wartościami wprowadzonymi w formularzu.  Na podstawie
// obliczeń tworzą w sekcji „Ostatni pomiar” dodatkowe wiersze
// informujące o zmianach wzrostu, wagi, BMI, wskaźnika Cole’a oraz
// różnicy do górnej granicy normy BMI.  Kolory wierszy określają, czy
// zmiany są prawidłowe (turkusowy), sygnalizują poprawę u dziecka z
// nadwagą/otyłością (ciemny pomarańczowy) czy też wskazują na problem
// (czerwony).  Funkcja adjustPrevSummaryHeight() sprawia, że karta
// „Ostatni pomiar” ma taką samą wysokość jak karta „Dane użytkownika”.
(function() {
  // Globalna funkcja aktualizująca sekcję różnic w karcie poprzedniego pomiaru
  window.updatePrevSummaryDiff = function() {
    try {
      const contentEl = document.getElementById('prevSummaryContent');
      if (!contentEl) return;
      // Usuń istniejącą sekcję różnic, aby uniknąć duplikatów
      const oldSec = contentEl.querySelector('.diff-section');
      if (oldSec) oldSec.remove();
      const prev = window.prevMeasurementInfo;
      if (!prev || !isFinite(prev.weightKg) || !isFinite(prev.heightCm) || !isFinite(prev.ageMonths)) return;
      const weightEl = document.getElementById('weight');
      const heightEl = document.getElementById('height');
      const sexEl = document.getElementById('sex');
      if (!weightEl || !heightEl || !sexEl) return;
      const weight = parseFloat(weightEl.value);
      const height = parseFloat(heightEl.value);
      const sex = sexEl.value || prev.sex || 'M';
      const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
      const ageMonths = Math.round((ageDec || 0) * 12);
      if (!isFinite(weight) || !isFinite(height) || !isFinite(ageMonths)) return;
      // Ustal, czy mamy do czynienia z osobą pełnoletnią (wiek >= 18 lat).
      const isAdult = (isFinite(ageDec) && ageDec >= 18);
      // Kontener na sekcję różnic
      const diffSec = document.createElement('div');
      diffSec.className = 'diff-section';
      // Dodaj etykietę informującą o porównaniu z poprzednim pomiarem
      const headerLabel = document.createElement('div');
      headerLabel.className = 'prev-summary-label';
      headerLabel.textContent = 'W porównaniu do poprzedniego pomiaru:';
      diffSec.appendChild(headerLabel);
      // Separator oddzielający historię od nowych danych
      const hr = document.createElement('hr');
      hr.className = 'prev-summary-separator';
      diffSec.appendChild(hr);
      // Wzrost
      (function(){
        // Nie pokazuj zmian wzrostu dla osób dorosłych – u dorosłych wzrost się nie zmienia.
        if (isAdult) return;
        const hPrev = prev.heightCm;
        const heightDiff = height - hPrev;
        const medianPrevH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, prev.ageMonths) : null;
        const medianCurrH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, ageMonths) : null;
        let expectedH = null;
        if (medianPrevH != null && medianCurrH != null && isFinite(medianPrevH) && isFinite(medianCurrH)) {
          expectedH = medianCurrH - medianPrevH;
        }
        let hClass = 'status-ok';
        if (expectedH != null && expectedH > 0) {
          const ratio = heightDiff / expectedH;
          if (ratio < 0.75) hClass = 'status-alert';
          else hClass = 'status-ok';
        } else {
          if (heightDiff < 0) hClass = 'status-alert';
        }
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wzrost';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + hClass;
        diffSpan.textContent = (heightDiff >= 0 ? '+' : '') + (Math.abs(heightDiff).toFixed(1).replace('.', ',')) + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + (isFinite(height) ? height.toFixed(1).replace('.', ',') : '—') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Waga
      (function(){
        const wPrev = prev.weightKg;
        const wDiff = weight - wPrev;
        let expectedGain = 0;
        if (typeof expectedGainMedianHeightAware === 'function') {
          const measPrev = { ageMonths: prev.ageMonths, height: prev.heightCm, weight: prev.weightKg };
          const measCurr = { ageMonths: ageMonths, height: height, weight: weight };
          try {
            expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
          } catch (_) {}
          if (!isFinite(expectedGain) || expectedGain < 0) expectedGain = 0;
        }
        let ratio = 0;
        if (expectedGain > 0) {
          ratio = wDiff / expectedGain;
        } else {
          ratio = wDiff > 0 ? 2 : -1;
        }
        let coleCurr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          const bmiCurr = weight / Math.pow(height/100,2);
          const bmi50 = getBmiP50ForAgeSex(ageMonths, sex);
          if (bmi50 && isFinite(bmi50) && bmi50 > 0) {
            coleCurr = (bmiCurr / bmi50) * 100;
          }
        }
        let wClass;
        /*
         * Klasyfikacja zmian wagi w zależności od wieku i płci.
         * Dla dorosłych stosujemy progi rocznego przyrostu masy ciała
         * oparte na literaturze: dla młodych dorosłych (18–39 lat)
         * mężczyzn przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,0 kg/rok umiarkowany,
         * powyżej 1,0 kg/rok nadmierny. U kobiet granice są odpowiednio 1,0 kg/rok
         * (bezpieczny) oraz 2,0 kg/rok (nadmierny). W wieku 40–59 lat u obu płci
         * przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,5 kg/rok umiarkowany,
         * powyżej 1,5 kg/rok nadmierny. Po 60. roku życia zakładamy, że
         * stabilizacja masy jest celem: każdy przyrost >0,5 kg/rok uznajemy za
         * nadmierny, zaś drobne wahania do 0,5 kg/rok jako umiarkowane.
         * Dodatkowo, jeśli pacjent ma nadwagę lub otyłość (BMI ≥25),
         * każdy dodatni przyrost traktujemy jako nadmierny. Utrata masy u osób
         * z niedowagą (BMI <18,5) oznacza alert (status-alert), natomiast u osób
         * z nadwagą/otyłością – poprawę (status-improve). Pozostałe sytuacje
         * zmniejszenia masy klasyfikujemy jako bezpieczne (status-ok).
         */
        if (isAdult) {
          // Oblicz BMI poprzedniego i aktualnego pomiaru
          let bmiPrev = null;
          if (prev.heightCm && prev.weightKg) {
            const hPrevM = prev.heightCm / 100;
            bmiPrev = prev.weightKg / (hPrevM * hPrevM);
          }
          let bmiCurr = null;
          if (height && weight) {
            const hCurrM = height / 100;
            bmiCurr = weight / (hCurrM * hCurrM);
          }
          const overweight = (bmiPrev != null && bmiPrev >= ADULT_BMI.OVER) || (bmiCurr != null && bmiCurr >= ADULT_BMI.OVER);
          // Oblicz roczny przyrost wagi (kg/rok). Jeżeli między pomiarami
          // upłynęło mniej niż rok, skalujemy do rocznego tempa; jeżeli różnica
          // wynosi 0 (np. ten sam dzień), unikamy dzielenia przez zero przyjmując 1 rok.
          const deltaYearsRaw = (ageMonths - prev.ageMonths) / 12;
          const deltaYears = (deltaYearsRaw && deltaYearsRaw > 0) ? deltaYearsRaw : 1;
          const wDiffRate = wDiff / deltaYears;
          if (wDiff <= 0) {
            // Spadek masy ciała – różna interpretacja w zależności od BMI
            if (bmiCurr != null && bmiCurr < ADULT_BMI.UNDER) {
              // U osób z niedowagą dalsza utrata masy jest niebezpieczna
              wClass = 'status-alert';
            } else if (overweight) {
              // U osób z nadwagą/otyłością spadek masy ciała jest poprawą
              wClass = 'status-improve';
            } else {
              // W pozostałych przypadkach utrata masy jest uznawana za bezpieczną
              wClass = 'status-ok';
            }
          } else {
            // Wzrost masy ciała
            if (overweight) {
              // Każdy przyrost masy u osób z nadwagą/otyłością jest nadmierny
              wClass = 'status-alert';
            } else {
              // Ustal progi w zależności od wieku i płci
              let safeTh, moderateTh;
              if (ageDec < 40) {
                if (sex === 'M') {
                  safeTh = 0.5;
                  moderateTh = 1.0;
                } else {
                  safeTh = 1.0;
                  moderateTh = 2.0;
                }
              } else if (ageDec < 60) {
                safeTh = 0.5;
                moderateTh = 1.5;
              } else {
                safeTh = 0;
                moderateTh = 0.5;
              }
              if (wDiffRate <= safeTh) {
                wClass = 'status-ok';
              } else if (wDiffRate <= moderateTh) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna oparta na stosunku obserwowanego przyrostu do oczekiwanego
          if (ratio < 0.75) {
            wClass = (coleCurr != null && coleCurr >= 110) ? 'status-improve' : 'status-alert';
          } else if (ratio <= 1.25) {
            wClass = 'status-ok';
          } else if (ratio <= 1.50) {
            wClass = 'status-improve';
          } else {
            wClass = 'status-alert';
          }
        }
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Waga';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + wClass;
        // Pokazuj znak minus przy ujemnej różnicy masy ciała zamiast pustego ciągu
        diffSpan.textContent = (wDiff >= 0 ? '+' : '-') + (Math.abs(wDiff).toFixed(1).replace('.', ',')) + '\u00a0kg';
        const sub = document.createElement('span');
        sub.className = 'muted';
        const currentStr = isFinite(weight) ? weight.toFixed(1).replace('.', ',') + '\u00a0kg' : '—';
        const expectedStr = (expectedGain && isFinite(expectedGain)) ? expectedGain.toFixed(1).replace('.', ',') + '\u00a0kg' : '0\u00a0kg';
        // Dla dorosłych nie pokazujemy oczekiwanej zmiany masy (zawsze 0), więc pomijamy tę część tekstu.
        if (isAdult) {
          sub.textContent = ' (' + currentStr + ')';
        } else {
          sub.textContent = ' (' + currentStr + ', oczekiwanie ' + expectedStr + ')';
        }
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // BMI
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        const bmiDiff = bmiCurr - bmiPrev;
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        let colePrev = null;
        let coleCurr = null;
        if (bmi50Prev && isFinite(bmi50Prev) && bmi50Prev > 0) {
          colePrev = (bmiPrev / bmi50Prev) * 100;
        }
        if (bmi50Curr && isFinite(bmi50Curr) && bmi50Curr > 0) {
          coleCurr = (bmiCurr / bmi50Curr) * 100;
        }
        let bmiClass;
        // Prepare evaluation of weight change for adults to ensure BMI and weight classifications are aligned.
        // This object will store thresholds, change rate and the resulting class/category.
        let weightEval = null;
        if (isAdult) {
          const wPrevVal = prev.weightKg;
          const hPrevVal = prev.heightCm;
          // Ensure necessary values are finite before computing
          if (isFinite(wPrevVal) && isFinite(hPrevVal) && isFinite(weight) && isFinite(height)) {
            // Determine safe and moderate thresholds (kg/year) based on age and sex
            let safeThW, moderateThW;
            if (ageDec < 40) {
              if (sex === 'M') {
                safeThW = 0.5;
                moderateThW = 1.0;
              } else {
                safeThW = 1.0;
                moderateThW = 2.0;
              }
            } else if (ageDec < 60) {
              safeThW = 0.5;
              moderateThW = 1.5;
            } else {
              safeThW = 0.0;
              moderateThW = 0.5;
            }
            // Compute change in weight and annualized rate
            const wDiffLocal = weight - wPrevVal;
            const deltaYearsRawLocal = (ageMonths - prev.ageMonths) / 12;
            const deltaYearsLocal = (deltaYearsRawLocal && deltaYearsRawLocal > 0) ? deltaYearsRawLocal : 1;
            const wDiffRateLocal = wDiffLocal / deltaYearsLocal;
            // Compute BMI values for previous and current measurements
            const bmiPrevLocal = wPrevVal / Math.pow(hPrevVal / 100, 2);
            const bmiCurrLocal = weight / Math.pow(height / 100, 2);
            const overweightLocal = (bmiPrevLocal >= ADULT_BMI.OVER) || (bmiCurrLocal >= ADULT_BMI.OVER);
            // Determine the weight classification using the same logic as the weight change section
            let wClassLocal;
            if (wDiffLocal <= 0) {
              if (bmiCurrLocal < ADULT_BMI.UNDER) {
                wClassLocal = 'status-alert';
              } else if (overweightLocal) {
                wClassLocal = 'status-improve';
              } else {
                wClassLocal = 'status-ok';
              }
            } else {
              if (overweightLocal) {
                wClassLocal = 'status-alert';
              } else {
                if (wDiffRateLocal <= safeThW) {
                  wClassLocal = 'status-ok';
                } else if (wDiffRateLocal <= moderateThW) {
                  wClassLocal = 'status-improve';
                } else {
                  wClassLocal = 'status-alert';
                }
              }
            }
            // Map internal class to a human-readable category
            let categoryName;
            if (wClassLocal === 'status-ok') {
              categoryName = 'bezpieczny';
            } else if (wClassLocal === 'status-improve') {
              categoryName = 'umiarkowany';
            } else {
              categoryName = 'nadmierny';
            }
            // Store evaluation data for later use in overriding BMI class and generating comments
            weightEval = {
              safeLimit: safeThW,
              moderateLimit: moderateThW,
              wDiffRate: wDiffRateLocal,
              wClass: wClassLocal,
              category: categoryName
            };
          }
        }
        /*
         * Klasyfikacja zmian BMI została uproszczona tak, aby była
         * spójna z oceną przyrostu masy ciała w kilogramach.  Dla osób
         * dorosłych wykorzystujemy tę samą kategorię (status-ok,
         * status-improve, status-alert) co dla zmiany masy ciała; w ten
         * sposób użytkownik nie otrzymuje sprzecznych komunikatów.  U
         * dzieci pozostawiamy dotychczasową klasyfikację opartą o
         * wskaźnik Cole’a.
         */
        if (isAdult) {
          // Jeżeli dostępna jest ocena wagi, użyj jej do klasyfikacji BMI
          if (weightEval && weightEval.wClass) {
            bmiClass = weightEval.wClass;
          } else {
            // W razie braku weightEval (bardzo mało prawdopodobne) zastosuj
            // domyślną logikę opartą o nadwagę/otyłość i trend BMI.
            // Określ, czy mamy do czynienia z nadwagą lub otyłością
            const overweight = (bmiPrev >= ADULT_BMI.OVER) || (bmiCurr >= ADULT_BMI.OVER);
            if (bmiDiff <= 0) {
              if (bmiCurr < ADULT_BMI.UNDER) {
                bmiClass = 'status-alert';
              } else if (overweight) {
                bmiClass = 'status-improve';
              } else {
                bmiClass = 'status-ok';
              }
            } else {
              if (overweight) {
                bmiClass = 'status-alert';
              } else {
                bmiClass = 'status-ok';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna oparta na wskaźniku Cole’a
          bmiClass = 'status-ok';
          if (coleCurr != null) {
            if (coleCurr >= 110) {
              bmiClass = (bmiDiff < 0 ? 'status-improve' : 'status-alert');
            } else if (coleCurr <= 90) {
              bmiClass = (bmiDiff > 0 ? 'status-improve' : 'status-alert');
            } else {
              bmiClass = 'status-ok';
            }
          }
        }
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'BMI';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + bmiClass;
        // Pokazuj znak minus przy ujemnej różnicy BMI zamiast pustego ciągu
        diffSpan.textContent = (bmiDiff >= 0 ? '+' : '-') + Math.abs(bmiDiff).toFixed(1).replace('.', ',');
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + bmiCurr.toFixed(1).replace('.', ',') + ')';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
        // After adding the BMI row, append an explanatory comment with the safe limit and change rate for adults.
        if (isAdult && weightEval) {
          const commentEl = document.createElement('div');
          commentEl.className = 'weight-eval-comment';
          commentEl.style.marginTop = '0.4rem';
          commentEl.style.fontSize = '0.9rem';
          // Format numeric values with comma as decimal separator
          const safeLimitText = (typeof weightEval.safeLimit === 'number')
            ? weightEval.safeLimit.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          const rateText = (weightEval.wDiffRate != null && isFinite(weightEval.wDiffRate))
            ? weightEval.wDiffRate.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          commentEl.textContent = 'Limit bezpiecznego przyrostu masy ciała: ' + safeLimitText +
            '; Twój przyrost: ' + rateText + '; Kategoria: ' + weightEval.category + '.';
          // Build a legend explaining the colour coding for categories
          const legend = document.createElement('div');
          legend.className = 'weight-eval-legend';
          legend.style.marginTop = '0.3rem';
          // Use coloured circles (styled via existing classes) to denote each category
          legend.innerHTML =
            '<span class="result-val status-ok">●</span> Bezpieczny ' +
            '<span class="result-val status-improve" style="margin-left:1rem;">●</span> Umiarkowany ' +
            '<span class="result-val status-alert" style="margin-left:1rem;">●</span> Nadmierny';
          commentEl.appendChild(legend);
          diffSec.appendChild(commentEl);
        }
      })();
      // Wskaźnik Cole’a
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        if (!bmi50Prev || !bmi50Curr) return;
        const colePrev = (bmiPrev / bmi50Prev) * 100;
        const coleCurr = (bmiCurr / bmi50Curr) * 100;
        const coleDiff = coleCurr - colePrev;
        let coleClass = 'status-ok';
        if (coleCurr >= 110) {
          coleClass = (coleDiff < 0 ? 'status-improve' : 'status-alert');
        } else if (coleCurr <= 90) {
          coleClass = (coleDiff > 0 ? 'status-improve' : 'status-alert');
        } else {
          coleClass = 'status-ok';
        }
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wskaźnik\u00a0Cole’a';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + coleClass;
        diffSpan.textContent = (coleDiff >= 0 ? '+' : '') + Math.abs(coleDiff).toFixed(1).replace('.', ',') + '%';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + coleCurr.toFixed(1).replace('.', ',') + '%)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód talii – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const waistEl = document.getElementById('waistCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        if (prevWaist == null || !isFinite(prevWaist) || currWaist == null || !isFinite(currWaist)) return;
        const diff = currWaist - prevWaist;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0talii';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWaist.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód bioder – różnica względem poprzedniego pomiaru
      (function(){
        const prevHip = prev.hipCm;
        const hipEl = document.getElementById('hipCm');
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevHip == null || !isFinite(prevHip) || currHip == null || !isFinite(currHip)) return;
        const diff = currHip - prevHip;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0bioder';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currHip.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // WHR – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const prevHip = prev.hipCm;
        const waistEl = document.getElementById('waistCm');
        const hipEl = document.getElementById('hipCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevWaist == null || prevHip == null || !isFinite(prevWaist) || !isFinite(prevHip)) return;
        if (currWaist == null || currHip == null || !isFinite(currWaist) || !isFinite(currHip)) return;
        if (prevHip === 0 || currHip === 0) return;
        const prevWHR = prevWaist / prevHip;
        const currWHR = currWaist / currHip;
        if (!isFinite(prevWHR) || !isFinite(currWHR)) return;
        const diff = currWHR - prevWHR;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'WHR';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(2).replace('.', ',');
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWHR.toFixed(2).replace('.', ',') + ')';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Dodaj sekcję do karty
      contentEl.appendChild(diffSec);
      // Wyrównaj wysokość karty podsumowania do karty użytkownika
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {}
      }
    } catch (_) {
      // ciche pominięcie błędów
    }
  };
  // Globalna funkcja wyrównująca wysokość karty „Ostatni pomiar” do karty użytkownika
  window.adjustPrevSummaryHeight = function() {
    try {
      const card = document.getElementById('prevSummaryCard');
      const formEl = document.getElementById('calcForm');
      if (!card || !formEl) return;
      let userCard = null;
      const fieldsets = formEl.getElementsByTagName('fieldset');
      if (fieldsets.length > 0) {
        userCard = fieldsets[0];
      }
      if (!userCard) return;
      // Sprawdź, czy widok jest desktopowy (szerokość ≥ 700 px).  W trybie
      // mobilnym resetuj nadane style, aby obowiązywały reguły z CSS.
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      if (!isDesktop) {
        card.style.height = '';
        card.style.minHeight = '';
        card.style.maxHeight = '';
        card.style.overflowY = '';
        return;
      }
      // Wysokość karty użytkownika jako punkt odniesienia
      const h = userCard.getBoundingClientRect().height;
      if (h && h > 0) {
        // Ustaw zarówno minimalną, maksymalną jak i stałą wysokość
        card.style.height = h + 'px';
        card.style.minHeight = h + 'px';
        card.style.maxHeight = h + 'px';
        card.style.overflowY = 'auto';
      }
    } catch (_) {
      /* ciche pominięcie błędów */
    }
  };

  // Globalna funkcja wyrównująca wysokość kart „Podsumowanie wyników” w układzie dwukolumnowym
  //
  // Funkcja ta porównuje wysokości dwóch kart podsumowania (lewej i prawej) w trybie
  // desktopowym i ustawia je na maksymalną z nich.  Dla widoków mobilnych
  // (szerokość <700 px) resetuje nadane style, aby pozostawić naturalne
  // dopasowanie wysokości zgodnie z CSS.  Dodatkowo ustawia overflow-y: auto,
  // aby dłuższe listy wierszy były przewijane w ramach swojej karty.
  window.adjustSummaryCardsHeight = function() {
    try {
      // Wykryj tryb mobilny: nie stosuj wyrównywania w jednokolumnowym widoku
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      const leftCard  = document.getElementById('currentSummaryCardLeft');
      const rightCard = document.getElementById('currentSummaryCardRight');
      if (!isDesktop || !leftCard || !rightCard) {
        // Resetuj style kart, jeśli nie spełniono warunków
        [leftCard, rightCard].forEach((c) => {
          if (c) {
            c.style.height = '';
            c.style.minHeight = '';
            c.style.maxHeight = '';
            c.style.overflowY = '';
          }
        });
        return;
      }
      // Oblicz wysokości obu kart
      const hLeft  = leftCard.getBoundingClientRect().height;
      const hRight = rightCard.getBoundingClientRect().height;
      const maxH   = Math.max(hLeft || 0, hRight || 0);
      if (maxH > 0) {
        [leftCard, rightCard].forEach((c) => {
          c.style.height = maxH + 'px';
          c.style.minHeight = maxH + 'px';
          c.style.maxHeight = maxH + 'px';
          c.style.overflowY = 'auto';
        });
      }
    } catch (_) {
      /* ciche pominięcie błędów */
    }
  };
  // Wyrównaj wysokość karty po załadowaniu DOM
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      // Ustaw wysokość karty „Ostatni pomiar” oraz kart podsumowania po załadowaniu DOM
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {}
      }
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {}
      }
      // Przy każdej zmianie rozmiaru okna dostosuj wysokości kart
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', function() {
          if (typeof window.adjustPrevSummaryHeight === 'function') {
            try { window.adjustPrevSummaryHeight(); } catch (_) {}
          }
          if (typeof window.adjustSummaryCardsHeight === 'function') {
            try { window.adjustSummaryCardsHeight(); } catch (_) {}
          }
        });
      }
    });
  }
})();

