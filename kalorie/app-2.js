
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
const CHILD_THRESH_WHO  = { NORMAL_HI: 85, OBESE: 97.7 };
const CHILD_THRESH_OLAF = { NORMAL_HI: 90, OBESE: 97   };
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
  if (bmi < ADULT_BMI.UNDER) return 'Niedowaga';
  if (bmi < ADULT_BMI.OVER) return 'Prawidłowe';
  if (bmi < ADULT_BMI.OBESE) return 'Nadwaga'; else return 'Otyłość';
}
function proposeDiets(bmr, pal, sex, isChild) {

  const tee = bmr * pal;                        // całkowite dzienne zapotrzebowanie
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
function fillDietSelect(diets) {
  const sel = document.getElementById('dietLevel');
  sel.innerHTML = ''; // wyczyść

  // Określ, czy użytkownik jest dzieckiem: wiek < 18 lat (przy założeniu, że CHILD_AGE_MIN określa dolną granicę)
  let ageVal = 0;
  const ageInput = document.getElementById('age');
  if (ageInput) {
    ageVal = parseFloat(ageInput.value) || 0;
  }
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
  const age      = +document.getElementById('age').value;
  const sex      =  document.getElementById('sex').value;           // 'M' / 'F'
  const weightKg = +document.getElementById('weight').value;
  const heightCm = +document.getElementById('height').value;
  const pal      = +document.getElementById('palFactor').value;

  if(!(age && weightKg && heightCm && pal)) return;                  // brak danych

  /* ------------------ 2. TEE i dostępne diety ------------- */
  const bmr   = BMR(weightKg, heightCm, age, sex);                   // już w pliku
  const diets = proposeDiets(bmr, pal, sex, age < 18);               // patrz wcześniejszy kod

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
  let targetMedianBMI = 21.7;                                        // dorośli
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
      const useOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
      const zTarget = useOlaf ? Z90 : Z85;         // 90 c. dla OLAF ‖ 85 c. dla WHO

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

/* ------------ Debounce wrapper ------------ */
const debouncedUpdate = (() => {
  let raf = null;
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      update();
    });
  };
})();

/**
 * Klasyfikacja ciężkości anoreksji u dorosłych (≥18 r.ż.)
 * Zwraca string z nazwą poziomu + zakresem.
 */
function anorexiaSeverityAdult(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚨 Zagrażający życiu (BMI < 13)';
  if (bmi < BMI_SEVERE_ANOREXIA)     return '🔴 Bardzo ciężki (BMI < 15)';
  if (bmi < BMI_HEAVY_ANOREXIA)      return '🔴 Ciężki (BMI 15 – 15,99)';
  if (bmi < BMI_MODERATE_ANOREXIA)   return '🟠 Umiarkowany (BMI 16 – 16,99)';
  if (bmi < ADULT_BMI.UNDER)         return '🟡 Łagodny (BMI 17 – 18,49)';
  return null;
}

/**
 * Rekomendacja formy pomocy przy BMI < 18,5 (dorośli)
 * Zwraca pusty string, albo zalecenie.
 */
function anorexiaConsultRecommendation(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚑 Wymagana NATYCHMIASTOWA hospitalizacja (BMI < 13)';
  if (bmi < BMI_MODERATE_ANOREXIA)    return '‼️ Pilna konsultacja psychiatryczna (BMI < 17)';
  if (bmi < ADULT_BMI.UNDER)          return '💬 Rozważ konsultację psychologiczną (BMI 17 – 18,49)';
  return '';
}

function update(){
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  const age    = parseFloat(document.getElementById('age').value)    || 0;
  const height = parseFloat(document.getElementById('height').value)|| 0;
       const sex    = document.getElementById('sex').value;

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
       let hideToNormForMismatch = false;

  // Aktualizuj opis współczynnika PAL przy każdej zmianie formularza.
  const palElem = document.getElementById('palFactor');
  if (palElem) {
    updatePalDescription(palElem.value);
  }
  /* === OBSŁUGA TOGGLE OLAF/WHO ======================================= */
  const toggleContainer = document.getElementById('dataToggleContainer');
  const dataToggle = document.getElementById('dataToggle');

  if(toggleContainer && dataToggle){
    /* 1. Dorośli – dopiero > 18 lat (18‑latek liczy się do OLAF) */
    if(age > 18 || age === 0){                 // dorośli (>18 l.) lub brak wieku
      toggleContainer.style.display = 'none';
      bmiSource = 'WHO';
    }else{
      toggleContainer.style.display = 'flex';
      if(age < OLAF_DATA_MIN_AGE){                             // <3 l. – brak danych OLAF
        dataToggle.checked = true;
        dataToggle.disabled = true;
        bmiSource = 'WHO';
      }else{                                   // 3‑18 l.
        dataToggle.disabled = false;
        
        /* 2. Domyślne OLAF po wpisaniu wszystkich danych,
           *    ale tylko dopóki użytkownik nie zmienił suwaka ręcznie. */
        if(weight > 0 && height > 0 && dataToggle.checked && !dataToggle.dataset.manual){
           dataToggle.checked = false;          // suwak w lewo → OLAF
        }
        bmiSource = dataToggle.checked ? 'WHO' : 'OLAF';
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
  // komunikat „Uzupełnij dane” – opcjonalnie
  errorBox.innerHTML = "Podaj jednocześnie wiek, wagę i wzrost.";
  errorBox.style.display = 'block';
  return;   // ⬅️ nic nie liczymy, koniec update()
}

// Jeśli któreś pole jest poza dozwolonym zakresem – pokaż komunikat błędu i przerwij obliczenia
if (errors.length > 0) {
  errorBox.innerHTML = errors.join("<br>");  // Wyświetl wszystkie błędy (każdy w nowej linii)
  errorBox.style.display = "block";          // Pokaż czerwony komunikat błędu
  document.getElementById('results').style.display = "none";  // Nie pokazuj wyników
  document.getElementById('planCard').style.display = 'none';
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
if (planWarningEl) planWarningEl.style.display = 'none';
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
      bmiPercentile = bmiPercentileChild(bmi, sex, months);
      bmiCat = bmiCategoryChildExact(bmiPercentile);
    }
    let percText = '';
    if (bmiPercentile !== null) {
    percText = ` – ${formatCentile(bmiPercentile)} centyl`;
    }

    // BMI ostrzeżenie dla nadwagi i otyłości u dzieci – będzie wstawione do karty BMI
    // Inicjalizuj zmienną ostrzeżenia przed jego obliczeniem, aby zachować ustawioną wartość
    let bmiWarningHtml = '';
    let anorexiaNote = '';
    // Ustaw BMI ostrzeżenie dla nadwagi/otyłości: wyświetlane w karcie BMI
    if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX && bmiPercentile !== null) {
      const useOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
      const normalHi = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
      const obesity  = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
      if (bmiPercentile >= obesity) {
        // Otyłość – komunikat z konsultacją endokrynologiczną
        bmiWarningHtml = `<div class="centile-warning">⚠ BMI spełnia kryterium otyłości – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
      } else if (bmiPercentile >= normalHi) {
        // Nadwaga – komunikat o konsultacji dietetycznej
        bmiWarningHtml = `<div class="centile-warning">⚠ Nadwaga – zalecana konsultacja dietetyczna. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
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
  const statsW = calcPercentileStats(weight, sex, age, 'WT');   // waga
  const statsH = calcPercentileStats(height, sex, age, 'HT');   // wzrost
  if (statsW && statsH) {
 
    // — różnice dla wagi —
    const lmsW = getChildLMS(sex, age, 'WT');
    const w3   = (lmsW[0]!==0)
                   ? lmsW[1]*Math.pow(1+lmsW[0]*lmsW[2]*Z3, 1/lmsW[0])
                   : lmsW[1]*Math.exp(lmsW[2]*Z3);
    const w97  = (lmsW[0]!==0)
                   ? lmsW[1]*Math.pow(1+lmsW[0]*lmsW[2]*Z97,1/lmsW[0])
                   : lmsW[1]*Math.exp(lmsW[2]*Z97);
    // --- waga ---
    const wCent = statsW ? formatCentile(statsW.percentile) : null;
    /* domyślnie pełna informacja lub komunikat */
    let weightLine = statsW
       ? `<span class="result-val">${wCent}</span> centyl (SD = ${statsW.sd.toFixed(1)})`
       : 'Brak danych';

    if (!statsW && bmiSource === 'WHO' && age*12 > 120){
       weightLine = 'Brak danych WHO powyżej 10 lat – użyj BMI lub OLAF';
    }
    if (statsW && weightUsedFallback){
       weightLine += ' <em>(użyto OLAF – WHO brak wagi >10 l.)</em>';
    }
    /* ===== BRAK LMS WAGA WHO > 120 mies. ===== */
    if (!statsW && bmiSource === 'WHO' && age*12 > 120){
      weightLine = 'Brak danych WHO powyżej 10 lat – użyj BMI';
    }else{
    if (statsW && statsW.percentile < PERCENTILE_EXTREME_LOW)  weightLine += `, brakuje ${(w3  - weight).toFixed(1)} kg do 3 centyla`;
    if (statsW && statsW.percentile > PERCENTILE_EXTREME_HIGH) weightLine += `, +${(weight - w97).toFixed(1)} kg ponad 97 centyl`;
    }
    // — różnice dla wzrostu —
    const lmsH = getChildLMS(sex, age, 'HT');
    const h3   = (lmsH[0]!==0)
                   ? lmsH[1]*Math.pow(1+lmsH[0]*lmsH[2]*Z3, 1/lmsH[0])
                   : lmsH[1]*Math.exp(lmsH[2]*Z3);
    const h97  = (lmsH[0]!==0)
                   ? lmsH[1]*Math.pow(1+lmsH[0]*lmsH[2]*Z97,1/lmsH[0])
                   : lmsH[1]*Math.exp(lmsH[2]*Z97);
    // --- wzrost ---
    const hCent = formatCentile(statsH.percentile);
    let heightLine = `<span class="result-val">${hCent}</span> ${centylWord(hCent)} (SD = ${statsH.sd.toFixed(1)})`;
    if (statsH.percentile < PERCENTILE_EXTREME_LOW)  heightLine += `, brakuje ${(h3  - height).toFixed(1)} cm do 3 centyla`;
    if (statsH.percentile > PERCENTILE_EXTREME_HIGH) heightLine += `, +${(height - h97).toFixed(1)} cm ponad 97 centyl`;

    /* --- ostrzeżenia specjalistyczne --- */
    let warnLines = '';
    // wzrost < 3 centyla
    if (statsH.percentile < PERCENTILE_EXTREME_LOW) {
       warnLines += `<div class="centile-warning">
           ⚠ Wzrost poniżej 3 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym.
           <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
         </div>`;
    }
    // waga < 3 centyla
    if (statsW.percentile < PERCENTILE_EXTREME_LOW) {
      warnLines += `<div class="centile-warning">
          ⚠ Waga poniżej 3 centyla – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym.
          <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
        </div>`;
    }
    // waga > 97 centyla
    if (statsW && statsW.percentile > PERCENTILE_EXTREME_HIGH) {
      warnLines += `<div class="centile-warning">
          ⚠ Waga powyżej 97 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym lub dietetykiem.
          <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
        </div>`;
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
    html += `<div class="result-box">
           <strong>BMI: <span class="result-val">${bmiText}</span>${percText} (${bmiCat})</strong>
           ${bsaLine}
           ${bmiWarningHtml}
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
    // Po wyświetleniu wyników pokaż sekcję źródeł i zastrzeżeń
    if (typeof sourceFieldset !== 'undefined' && sourceFieldset) {
      sourceFieldset.style.display = 'block';
    }
    /* ---------- COLE INDEX (Wskaźnik Cole'a) ---------- */
    // Reset and compute Cole's index for children/adolescents
    const coleCardEl = document.getElementById('coleCard');
    const coleInfoEl = document.getElementById('coleInfo');
    const coleExplanationEl = document.getElementById('coleExplanation');
        const coleNormTableEl = document.getElementById('coleNormTable');
    if (coleCardEl && coleInfoEl && coleExplanationEl) {
      // hide by default
      coleCardEl.style.display = 'none';
      coleInfoEl.innerHTML = '';
      coleExplanationEl.textContent = '';
          if (coleNormTableEl) {
            coleNormTableEl.innerHTML = '';
            coleNormTableEl.style.display = 'none';
          }
      // Only compute for children/adolescents (<=18 l.) with valid weight
      if (age > 0 && age <= CHILD_AGE_MAX && weight > 0) {
        // median weight from LMS depends on selected data source (WHO/OLAF)
        const lms = getChildLMS(sex, age, 'WT');
        if (lms && lms[1] > 0) {
          const medianW = lms[1];
          const cole = (weight / medianW) * 100;
          // Determine classification and comment
          let comment = '';
          let isWarning = false;
          if (cole < 90) {
            comment = 'Niedowaga';
            isWarning = true;
          } else if (cole >= 90 && cole <= 110) {
            comment = 'W normie';
          } else if (cole > 110 && cole < 120) {
            comment = 'Nadwaga';
            isWarning = true;
          } else if (cole >= 120) {
            comment = 'Otyłość';
            isWarning = true;
          }
          // Build HTML for Cole index result using the existing result-box container (#coleInfo already has class result-box)
          const commentHtml = isWarning
            ? `<span class="centile-warning">${comment}</span>`
            : `<span>${comment}</span>`;
          // Display only the Cole index value without interpretative text (Niedowaga/W normie/Nadwaga/Otyłość).
          coleInfoEl.innerHTML = `<strong>Wskaźnik Cole'a: <span class="result-val">${cole.toFixed(1)}%</span></strong>`;
          // ensure the Cole result uses the same card styling (turquoise border and white background) as BMI result boxes
          coleInfoEl.classList.add('result-card');
          // Explanation text
          coleExplanationEl.innerHTML =
            'Wskaźnik Cole\'a porównuje aktualną masę ciała dziecka do mediany masy dla jego wieku i płci (według siatek WHO/OLAF). ' +
            'Wysoka wartość może wskazywać na nadwagę lub otyłość, nawet jeśli BMI pozostaje w normie.';
                    coleCardEl.style.display = 'block';
                    // Zawsze wstawiaj i pokazuj tabelę norm wskaźnika Cole'a, gdy obliczany jest wskaźnik
                    if (coleNormTableEl) {
                      coleNormTableEl.innerHTML = '<table style="width:100%;border-collapse:collapse;margin-top:0.6rem;"><tr><th>Zakres (%)</th><th>Interpretacja</th></tr><tr><td>&lt; 90</td><td>Niedowaga</td></tr><tr><td>90–110</td><td>W normie</td></tr><tr><td>110–120</td><td>Nadwaga</td></tr><tr><td>&ge; 120</td><td>Otyłość</td></tr></table>';
                      coleNormTableEl.style.display = 'block';
                    }

               // --- Dodatkowa obsługa niezgodności BMI vs wskaźnik Cole'a ---
               // Oblicz kategorię BMI dla dziecka i porównaj z klasyfikacją wskaźnika Cole'a.
               // Jeśli BMI jest w normie, ale wskaźnik Cole'a wskazuje na nadwagę lub otyłość,
               // ukryj kartę „Droga do normy BMI” i przekaż rozszerzone wyjaśnienie w sekcji Cole'a.
               const bmiValMismatch = BMI(weight, height);
               let bmiCatMismatch;
               if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
                 const monthsMismatch = Math.round(age * 12);
                 bmiCatMismatch = bmiCategoryChild(bmiValMismatch, sex, monthsMismatch);
               } else {
                 bmiCatMismatch = bmiCategory(bmiValMismatch);
               }
               if ((bmiCatMismatch === 'Prawidłowe' || bmiCatMismatch === 'W normie') &&
                   (comment === 'Nadwaga' || comment === 'Otyłość')) {
                 hideToNormForMismatch = true;
                 coleExplanationEl.innerHTML =
                   '<div class="result-box" style="color:var(--danger);font-weight:600;">' +
                   '🔎 Dlaczego wynik wskaźnika Cole’a wskazuje na nadwagę lub otyłość, mimo że BMI znajduje się jeszcze w normie?<br>' +
                   'Wszystkie obliczenia zostały wykonane prawidłowo. Różnice w wynikach wynikają z tego, że wskaźnik BMI (wraz z siatkami centylowymi OLAF lub WHO) oraz wskaźnik Cole’a opierają się na innych kryteriach oceny.<br>' +
                   'BMI z siatkami centylowymi porównuje dziecko do rówieśników z danej populacji (np. dzieci w Polsce lub według danych WHO), dzięki czemu można ocenić, czy waga i wzrost dziecka są proporcjonalne do wieku.<br>' +
                   'Wskaźnik Cole’a (IOTF) porównuje BMI dziecka do międzynarodowych standardów, które odzwierciedlają ryzyko wystąpienia nadwagi lub otyłości w wieku dorosłym.<br><br>' +
                   '👉 Oba wskaźniki są poprawne i przydatne – patrzą po prostu z różnych perspektyw. Jeśli jeden z nich wskazuje na ryzyko nadwagi/otyłości, warto to potraktować jako sygnał do przyjrzenia się stylowi życia dziecka i ewentualnej konsultacji z dietetykiem lub lekarzem.<br>' +
                   '<a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Umów wizytę z dietetykiem</a>' +
                   '</div>';
               }
        }
      }
    }
    /* ----------------------------------------------------- */
  }

  /* ---------- DROGA DO NORMY BMI ---------- */
     if (bmiReady && !hideToNormForMismatch) {
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
      if (cat === 'Nadwaga' || cat === 'Otyłość') {
        // Obsługa nadwagi/otyłości z uwzględnieniem wieku dziecka
        const planCardEl = document.getElementById('planCard');
        // planWarningEl i childConsultCard zostały zresetowane na początku update()
        if (age < 5) {
          // dzieci <5 lat z nadwagą/otyłością: ukryj plan i pokaż kartę konsultacyjną
          if (planCardEl) planCardEl.style.display = 'none';
          if (planWarningEl) planWarningEl.style.display = 'none';
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
            }
          } else {
            if (planWarningEl) planWarningEl.style.display = 'none';
          }
        }
      } else {
        // BMI nie wskazuje nadwagi/otyłości – ukryj kartę planu i wszystkie komunikaty
        document.getElementById('planCard').style.display = 'none';
        if (planWarningEl) planWarningEl.style.display = 'none';
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

  toNormInfo.innerHTML = `
    <div class="result-box" style="color:var(--primary)">
      Twoje BMI wskazuje na niedowagę – rozważ zwiększenie kaloryczności diety
      i&nbsp;konsultację z&nbsp;dietetykiem.${gainMsg}
    </div>`;
} else {
    // stary komunikat dla BMI w normie
    toNormInfo.innerHTML = `<div class="result-box" style="color:var(--primary)">
      Twoje BMI jest już w normie! 🚀
    </div>`;
  }
  toNormCard.style.display = 'block';
}

  }

    }

       // Po obliczeniu BMI i wskaźnika Cole’a sprawdź rozbieżność między nimi.
       // Jeśli wskaźnik Cole’a sugeruje nadwagę/otyłość, a BMI dziecka jest w normie,
       // ukryj kartę „Droga do normy BMI” i wstaw w karcie Cole’a szersze wyjaśnienie.
       if (age > 0 && age <= CHILD_AGE_MAX) {
         const lmsColeCheck = getChildLMS(sex, age, 'WT');
         if (lmsColeCheck && lmsColeCheck[1] > 0) {
           const medianColeW = lmsColeCheck[1];
           const coleValCheck = (weight / medianColeW) * 100;
           let coleCommentCheck = '';
           if (coleValCheck < 90) {
             coleCommentCheck = 'Niedowaga';
           } else if (coleValCheck >= 90 && coleValCheck <= 110) {
             coleCommentCheck = 'W normie';
           } else if (coleValCheck > 110 && coleValCheck < 120) {
             coleCommentCheck = 'Nadwaga';
           } else {
             coleCommentCheck = 'Otyłość';
           }
           // Oblicz kategorię BMI
           const bmiValCheck = BMI(weight, height);
           let bmiCatCheck;
           if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
             const monthsCheck = Math.round(age * 12);
             bmiCatCheck = bmiCategoryChild(bmiValCheck, sex, monthsCheck);
           } else {
             bmiCatCheck = bmiCategory(bmiValCheck);
           }
           if ((coleCommentCheck === 'Nadwaga' || coleCommentCheck === 'Otyłość') && bmiCatCheck === 'Prawidłowe') {
             // Ukryj kartę drogi do normy BMI
             toNormCard.style.display = 'none';
             // Wstaw rozszerzone wyjaśnienie do karty Cole’a
             const coleExplanationEl2 = document.getElementById('coleExplanation');
             if (coleExplanationEl2) {
               coleExplanationEl2.innerHTML = `
<p>🔎 <strong>Dlaczego wynik wskaźnika Cole’a wskazuje na nadwagę lub otyłość, mimo że BMI znajduje się jeszcze w normie?</strong></p>
<p>Wszystkie obliczenia zostały wykonane prawidłowo. Różnice w wynikach wynikają z tego, że wskaźnik BMI (wraz z siatkami centylowymi OLAF lub WHO) oraz wskaźnik Cole’a opierają się na innych kryteriach oceny.</p>
<p>BMI z siatkami centylowymi porównuje dziecko do rówieśników z danej populacji (np. dzieci w Polsce lub według danych WHO), dzięki czemu można ocenić, czy waga i wzrost dziecka są proporcjonalne do wieku.</p>
<p>Wskaźnik Cole’a (IOTF) porównuje BMI dziecka do międzynarodowych standardów, które odzwierciedlają ryzyko wystąpienia nadwagi lub otyłości w wieku dorosłym.</p>
<p>👉 Oba wskaźniki są poprawne i przydatne – patrzą po prostu z różnych perspektyw. Jeśli jeden z nich wskazuje na ryzyko nadwagi/otyłości, warto to potraktować jako sygnał do przyjrzenia się stylowi życia dziecka i ewentualnej konsultacji z dietetykiem lub lekarzem.</p>
<div style="color:var(--danger);font-weight:600;margin-top:0.5rem;">⚠ Warto skonsultować dziecko z&nbsp;dietetykiem. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">Umów wizytę</a></div>
               `;
             }
           }
         }
       }
     // Ukryj kartę „Droga do normy BMI” w razie rozbieżności (Cole > normal, BMI w normie)
     if (hideToNormForMismatch) {
       toNormCard.style.display = 'none';
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
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L, M, S] = lms;
  const z = (L !== 0) ? (Math.pow(bmi / M, L) - 1) / (L * S) : Math.log(bmi / M) / S;
  return normalCDF(z) * 100;
}

function bmiCategoryChildExact(percentile){
  if(percentile === null) return '';
  const useOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
  const normalHi = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity  = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
  if (percentile < 5)               return 'Niedowaga';
  if (percentile < normalHi)        return 'Prawidłowe';
  if (percentile < obesity)         return 'Nadwaga';
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

  const age = document.getElementById('age').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const height = document.getElementById('height').value;
  const sex = document.getElementById('sex').value === 'M' ? "Mężczyzna" : "Kobieta";
  y += 12;
  pdf.setFontSize(11);
  pdf.text(`Płeć: ${sex}`, left + 4, y + 8);
  pdf.text(`Wiek: ${age} lat`, left + 50, y + 8);
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

function bmiZscore(bmi, sex, months){
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L,M,S]=lms;
  return (L!==0) ? (Math.pow(bmi/M, L)-1)/(L*S) : Math.log(bmi/M)/S;
}
function bmiPercentileChild(bmi, sex, months){
  const z = bmiZscore(bmi, sex, months);
  return z===null?null:normalCDF(z)*100;
}
function bmiCategoryChild(bmi, sex, months){
  const useOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
  const p = bmiPercentileChild(bmi, sex, months);
  if(p===null) return bmiCategory(bmi); // fallback
  if (p < PERCENTILE_CUTOFF_UNDERWEIGHT)          return 'Niedowaga';
  if (p < (useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI
                   : CHILD_THRESH_WHO.NORMAL_HI)) return 'Prawidłowe';
  if (p < (useOlaf ? CHILD_THRESH_OLAF.OBESE
                   : CHILD_THRESH_WHO.OBESE))     return 'Nadwaga';
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
  // DODAJ powyżej – wymuszenie WHO
  if (m < OLAF_DATA_MIN_AGE*12) bmiSource = 'WHO';
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
  const MEDIAN_ADULT_BMI = 21.7;
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
    const age    = +document.getElementById('age').value || 0;
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
    const dataToggle = document.getElementById('dataToggle');
    if(dataToggle){
      dataToggle.addEventListener('change', () => {
        /* 3. Flaga „manual” blokuje ponowne wymuszanie OLAF w update() */
        dataToggle.dataset.manual = '1';
        bmiSource = dataToggle.checked ? 'WHO' : 'OLAF';
        update();                               // przelicz wszystko
      });
    }
  });
  const obs=new MutationObserver(transformPlan);
  obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',transformPlan);
})();
