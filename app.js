document.write(new Date().getFullYear())

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
};



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
function BMR(weight,height,age,sex){
  return Math.round(10*weight + 6.25*height - 5*age + (sex==='M'?5:-161));
}
function BMI(weight,height){
  return weight/Math.pow(height/100,2);
}

function bmiCategory(bmi){
  if(bmi<18.5) return 'Niedowaga';
  if(bmi<25)   return 'Prawidłowe';
  if(bmi<30)   return 'Nadwaga';
  return 'Otyłość';
}

// --- POCZĄTEK: Funkcje obsługujące Drogę do normy BMI ---
function toNormalBMITarget(weight, height, age, sex) {
  // Dla dzieci: górny zakres normy BMI (P85 WHO)
  if(age >= 2 && age <= 19){
    const months = Math.round(age*12);
    const dataMap = bmiPercentiles[sex==='M'?'boys':'girls'];
    const data = dataMap[months];
    if(data){
      return data.P85;
    }
    return 18.5; // fallback
  }
  return 24.9;
}

/**
 * Zwraca kcal spalane na 1 km danej aktywności
 * @param {string} activity – klucz aktywności ('bike16','bike20','run','swim','walk')
 * @param {number} weight   – masa ciała w kg
 * @returns {number} kcal na 1 km
 */
function kcalFor1km(activity, weight){
  let met, speedKmh;

  switch(activity){
    case 'bike16':
      met       = 6.0;
      speedKmh  = 16;
      break;
    case 'bike20':
      met       = 8.0;
      speedKmh  = 20;
      break;
    case 'run':
      met       = 8.0;
      speedKmh  = 8;
      break;
    case 'swim':
      met       = 7.5;
      speedKmh  = 3;   // ok. 3 km/h rekreacyjnie
      break;
    case 'walk':
      met       = 3.0;
      speedKmh  = 5;
      break;
    default:
      return 0;        // nieznana aktywność
  }

  // 1) kcal na minutę: (MET × 3.5 × waga) / 200  
  const kcalPerMin   = (met * 3.5 * weight) / 200;
  // 2) ile minut zajmuje 1 km: 60 / prędkość (km/h)  
  const minPerKm     = 60 / speedKmh;
  // 3) kcal na km = kcal/min × min/km
  return kcalPerMin * minPerKm;
}

/**
 * Oblicza, ile km i ile czasu potrzeba, by osiągnąć normę BMI
 * @returns {object|null} {kgToLose, kcalToBurn, table} lub null gdy BMI ≤ norma
 */
function distanceToNormalBMI(weight, height, age, sex) {
  const currentBMI = BMI(weight, height);
  const targetBMI  = toNormalBMITarget(weight, height, age, sex);
  if (currentBMI <= targetBMI) return null;

  // ile kg trzeba schudnąć i ile kcal to daje
  const targetWeight = targetBMI * Math.pow(height/100, 2);
  const kgToLose     = weight - targetWeight;
  const kcalToBurn   = kgToLose * 7700;

  // zestaw aktywności z MET i prędkością
  const acts = [
    { label:'🚶 Spacer',                met:3.0,  speed:5   },
    { label:'🚴 Rower 16 km/h',         met:6.0,  speed:16  },
    { label:'🚴‍♂️ Rower 20 km/h',       met:8.0,  speed:20  },
    { label:'🏃 Bieganie 8 km/h',        met:8.0,  speed:8   },
    { label:'🏊 Pływanie rekreacyjne',   met:7.5,  speed:3   }
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
    const km = kcalToBurn / (burnPerMin * (60/act.speed));
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
  const targetWgt   = targetBMI * Math.pow(height/100, 2);
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
function anorexiaSeverityAdult(bmi) {
  if (bmi < 13)       return '🚨 Zagrażający życiu (BMI < 13)';
  if (bmi < 15)       return '🔴 Bardzo ciężki (BMI < 15)';
  if (bmi < 16)       return '🔴 Ciężki (BMI 15 – 15,99)';
  if (bmi < 17)       return '🟠 Umiarkowany (BMI 16 – 16,99)';
  if (bmi < 18.5)     return '🟡 Łagodny (BMI 17 – 18,49)';
  return null;        // poza zakresem anoreksji
}

/**
 * Rekomendacja formy pomocy przy BMI < 18,5 (dorośli)
 * Zwraca pusty string, albo zalecenie.
 */
function anorexiaConsultRecommendation(bmi){
  if (bmi < 13)       return '🚑 Wymagana NATYCHMIASTOWA hospitalizacja (BMI < 13)';
  if (bmi < 17)       return '‼️ Pilna konsultacja psychiatryczna (BMI < 17)';
  if (bmi < 18.5)     return '💬 Rozważ konsultację psychologiczną (BMI 17 – 18,49)';
  return '';
}

function update(){
  const weight = parseFloat(document.getElementById('weight').value) || 0;
  const age    = parseFloat(document.getElementById('age').value)    || 0;
  const height = parseFloat(document.getElementById('height').value)|| 0;
  const sex    = document.getElementById('sex').value;

// Walidacja danych wejściowych (wiek, waga, wzrost)
const snackFieldset = document.getElementById('snackList').parentElement;
const mealFieldset  = document.getElementById('mealList').parentElement;
const errorBox      = document.getElementById('errorBox');
errorBox.innerHTML  = "";              // Czyścimy poprzednie błędy
errorBox.style.display = "none";       // Ukrywamy na razie box błędów

const errors = [];
if (age !== 0 && (age < 0.25 || age > 130)) {
  errors.push("Wiek poza zakresem (0.25–130 lat)");
}
if (weight !== 0 && (weight < 1 || weight > 500)) {
  errors.push("Waga poza zakresem (1–500 kg)");
}
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
planCard.style.display = 'none';
planResults.innerHTML  = '';

  const bmiReady = weight > 0 && height > 0;
  const bmrReady = bmiReady && age > 0;

  const kcal = calcTotal(snacks,'.snack-row') + calcTotal(meals,'.meal-row');

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

    const months = Math.round(age*12);
    let bmiCat;
    if(age>=2 && age<=19){
      bmiCat = bmiCategoryChild(bmi, sex, months);
    }else{
      bmiCat = bmiCategory(bmi);
    }

    let bmiPercentile = null;
    if(age>=2 && age<=19){
      bmiPercentile = bmiPercentileChild(bmi, sex, months);
      bmiCat = bmiCategoryChildExact(bmiPercentile);
    }
    let percText = '';
      if (bmiPercentile !== null) {
        if (bmiPercentile >= 99.9) {
          percText = ' – >100 centyla';
        } else if (bmiPercentile < 1) {
          percText = ' – <1 centyla';
        } else {
          percText = ` – ${bmiPercentile.toFixed(1)} centyl`;
        }
      }
    let anorexiaNote = '';
if (age >= 18 && bmi < 18.5) {
  const sev = anorexiaSeverityAdult(bmi);
  const consult = anorexiaConsultRecommendation(bmi);
  if (sev) anorexiaNote += `<br><small style="color:var(--danger)">${sev}</small>`;
  if (consult) anorexiaNote += `<br><small style="color:var(--danger);font-weight:600">${consult}</small>`;
}
let html = '';      // Zaczynamy od pustego stringu
/* ===== KARTA CENTYLI WAGA / WZROST (3‑18 l.) ===== */
if (age >= 3 && age <= 18) {
  const statsW = calcPercentileStats(weight, sex, age, 'WT');   // waga
  const statsH = calcPercentileStats(height, sex, age, 'HT');   // wzrost
  if (statsW && statsH) {
    // 3 %  i 97 % to ±1,8808 SD
    const z3  = -1.8808;
    const z97 =  1.8808;

    // — różnice dla wagi —
    const lmsW = getChildLMS(sex, age, 'WT');
    const w3   = (lmsW[0]!==0)
                   ? lmsW[1]*Math.pow(1+lmsW[0]*lmsW[2]*z3, 1/lmsW[0])
                   : lmsW[1]*Math.exp(lmsW[2]*z3);
    const w97  = (lmsW[0]!==0)
                   ? lmsW[1]*Math.pow(1+lmsW[0]*lmsW[2]*z97,1/lmsW[0])
                   : lmsW[1]*Math.exp(lmsW[2]*z97);
    // --- waga ---
    const wCent = formatCentile(statsW.percentile);
    let weightLine  = `<span class="result-val">${wCent}</span> ${centylWord(wCent)} (SD = ${statsW.sd.toFixed(1)})`;
    if (statsW.percentile < 3)  weightLine += `, brakuje ${(w3  - weight).toFixed(1)} kg do 3 centyla`;
    if (statsW.percentile > 97) weightLine += `, +${(weight - w97).toFixed(1)} kg ponad 97 centyl`;

    // — różnice dla wzrostu —
    const lmsH = getChildLMS(sex, age, 'HT');
    const h3   = (lmsH[0]!==0)
                   ? lmsH[1]*Math.pow(1+lmsH[0]*lmsH[2]*z3, 1/lmsH[0])
                   : lmsH[1]*Math.exp(lmsH[2]*z3);
    const h97  = (lmsH[0]!==0)
                   ? lmsH[1]*Math.pow(1+lmsH[0]*lmsH[2]*z97,1/lmsH[0])
                   : lmsH[1]*Math.exp(lmsH[2]*z97);
    // --- wzrost ---
    const hCent = formatCentile(statsH.percentile);
    let heightLine = `<span class="result-val">${hCent}</span> ${centylWord(hCent)} (SD = ${statsH.sd.toFixed(1)})`;
    if (statsH.percentile < 3)  heightLine += `, brakuje ${(h3  - height).toFixed(1)} cm do 3 centyla`;
    if (statsH.percentile > 97) heightLine += `, +${(height - h97).toFixed(1)} cm ponad 97 centyl`;

    /* --- ostrzeżenia specjalistyczne --- */
    let warnLines = '';
    if (statsH.percentile < 3) {
       warnLines += `<div style="color:var(--danger);font-weight:600;margin-top:4px">
           ⚠ Wzrost poniżej 3 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym.
           <a href="https://vildaclinic.pl" target="_blank" style="color:inherit;text-decoration:underline">
             Umów wizytę
           </a>
         </div>`;
    }
    if (statsW.percentile < 3) {
      warnLines += `<div style="color:var(--danger);font-weight:600;margin-top:4px">
          ⚠ Waga poniżej 3 centyla – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym.
          <a href="https://vildaclinic.pl" target="_blank" style="color:inherit;text-decoration:underline">
            Umów wizytę
          </a>
        </div>`;
    }

    html += `<div class="result-box result-card animate-in">
           <strong>Waga: ${weightLine}</strong><br>
           <strong>Wzrost: ${heightLine}</strong>
           ${warnLines}
         </div>`;
  }
}
/* ===== KONIEC KARTY CENTYLI ===== */
    html += `<div class="result-box"><strong>BMI: <span class="result-val">${bmiText}</span>${percText} (${bmiCat})</strong>${anorexiaNote}</div>`;
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
  }

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
      if (age >= 2 && age <= 19) {
        const months = Math.round(age * 12);
        cat = bmiCategoryChild(bmiVal, sex, months);
      } else {
        // dorośli – klasyczny podział BMI
        cat = bmiCategory(bmiVal);
      }
      if (cat === 'Nadwaga' || cat === 'Otyłość') {
        const planCard = document.getElementById('planCard');
        planCard.style.display = 'block';

        // pobierz dane z formularza
        const sessions     = +document.getElementById('sessionsPerWeek').value;
        const metIntensity = +document.getElementById('intensity').value;
        const dailyDef     = +document.getElementById('dailyDeficit').value;

        // liczymy kcal/trening (60 min każdy)
        const burnPerMin   = (metIntensity * 3.5 * weight) / 200;
        const perSession   = burnPerMin * 60;
        const weeklyEx     = perSession * sessions;
        const weeklyDiet   = dailyDef * 7;
        const weeklyTotal  = weeklyEx + weeklyDiet;

        // ile tygodni potrzebnych
        const weeksNeeded  = Math.ceil(toNorm.kcalToBurn / weeklyTotal);
        const monthsNeeded = (weeksNeeded / 4.345).toFixed(1);
        const yearsNeeded  = (monthsNeeded / 12).toFixed(1);

        // wyświetl wynik
        document.getElementById('planResults').innerHTML = `
          <div class="result-box">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <th style="text-align:left;padding:4px">Parametr</th>
                <th style="text-align:right;padding:4px">Wartość</th>
              </tr>
              <tr><td>Kalorie do spalenia</td><td>${Math.round(toNorm.kcalToBurn)} kcal</td></tr>
              <tr><td>Ćwiczenia tygodniowo</td><td>${Math.round(weeklyEx)} kcal</td></tr>
              <tr><td>Kalorie mniej z diety tygodniowo</td><td>${weeklyDiet} kcal</td></tr>
              <tr><td>Łączny deficyt tygodniowy</td><td>${Math.round(weeklyTotal)} kcal</td></tr>
              <tr><td><strong>Szacowany czas</strong></td><td><strong>
                  ${weeksNeeded} tyg<br>
                  (${monthsNeeded} mies)<br>
                  (${yearsNeeded} lat)
                </strong></td></tr>
            </table>
          </div>`;
      } else {
        document.getElementById('planCard').style.display = 'none';
      }

    } else {
  // BMI ≤ górnej granicy normy – sprawdzamy, czy jest to niedowaga
  const currentBMI = BMI(weight, height);
  const months     = Math.round(age * 12);
  const cat        = (age >= 2 && age <= 19)
                       ? bmiCategoryChild(currentBMI, sex, months)
                       : bmiCategory(currentBMI);

  if (cat === 'Niedowaga') {
  let kgGain = 0;
  if (age >= 2 && age <= 19){
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
function bmiCategoryChild(bmi, sex, months){
  const dataMap = bmiPercentiles[sex==='M'?'boys':'girls'];
  const data = dataMap[months];
  if(!data){ // fallback
    return bmiCategory(bmi);
  }

  const {P5,P85,P95}=data;
  if(bmi < P5) return 'Niedowaga';
  if(bmi < P85) return 'Prawidłowe';
  if(bmi < P95) return 'Nadwaga';
  return 'Otyłość';
}


/* === BMI Percentile Enhancement === */
const LMS_BOYS={"24":[-0.6187,16.0189,0.07785],"25":[-0.584,15.98,0.07792],"26":[-0.5497,15.9414,0.078],"27":[-0.5166,15.9036,0.07808],"28":[-0.485,15.8667,0.07818],"29":[-0.4552,15.8306,0.07829],"30":[-0.4274,15.7953,0.07841],"31":[-0.4016,15.7606,0.07854],"32":[-0.3782,15.7267,0.07867],"33":[-0.3572,15.6934,0.07882],"34":[-0.3388,15.661,0.07897],"35":[-0.3231,15.6294,0.07914],"36":[-0.3101,15.5988,0.07931],"37":[-0.3,15.5693,0.0795],"38":[-0.2927,15.541,0.07969],"39":[-0.2884,15.514,0.0799],"40":[-0.2869,15.4885,0.08012],"41":[-0.2881,15.4645,0.08036],"42":[-0.2919,15.442,0.08061],"43":[-0.2981,15.421,0.08087],"44":[-0.3067,15.4013,0.08115],"45":[-0.3174,15.3827,0.08144],"46":[-0.3303,15.3652,0.08174],"47":[-0.3452,15.3485,0.08205],"48":[-0.3622,15.3326,0.08238],"49":[-0.3811,15.3174,0.08272],"50":[-0.4019,15.3029,0.08307],"51":[-0.4245,15.2891,0.08343],"52":[-0.4488,15.2759,0.0838],"53":[-0.4747,15.2633,0.08418],"54":[-0.5019,15.2514,0.08457],"55":[-0.5303,15.24,0.08496],"56":[-0.5599,15.2291,0.08536],"57":[-0.5905,15.2188,0.08577],"58":[-0.6223,15.2091,0.08617],"59":[-0.6552,15.2,0.08659],"60":[-0.6892,15.1916,0.087],"61":[-0.7387,15.2641,0.0839],"62":[-0.7621,15.2616,0.08414],"63":[-0.7856,15.2604,0.08439],"64":[-0.8089,15.2605,0.08464],"65":[-0.8322,15.2619,0.0849],"66":[-0.8554,15.2645,0.08516],"67":[-0.8785,15.2684,0.08543],"68":[-0.9015,15.2737,0.0857],"69":[-0.9243,15.2801,0.08597],"70":[-0.9471,15.2877,0.08625],"71":[-0.9697,15.2965,0.08653],"72":[-0.9921,15.3062,0.08682],"73":[-1.0144,15.3169,0.08711],"74":[-1.0365,15.3285,0.08741],"75":[-1.0584,15.3408,0.08771],"76":[-1.0801,15.354,0.08802],"77":[-1.1017,15.3679,0.08833],"78":[-1.123,15.3825,0.08865],"79":[-1.1441,15.3978,0.08898],"80":[-1.1649,15.4137,0.08931],"81":[-1.1856,15.4302,0.08964],"82":[-1.206,15.4473,0.08998],"83":[-1.2261,15.465,0.09033],"84":[-1.246,15.4832,0.09068],"85":[-1.2656,15.5019,0.09103],"86":[-1.2849,15.521,0.09139],"87":[-1.304,15.5407,0.09176],"88":[-1.3228,15.5608,0.09213],"89":[-1.3414,15.5814,0.09251],"90":[-1.3596,15.6023,0.09289],"91":[-1.3776,15.6237,0.09327],"92":[-1.3953,15.6455,0.09366],"93":[-1.4126,15.6677,0.09406],"94":[-1.4297,15.6903,0.09445],"95":[-1.4464,15.7133,0.09486],"96":[-1.4629,15.7368,0.09526],"97":[-1.479,15.7606,0.09567],"98":[-1.4947,15.7848,0.09609],"99":[-1.5101,15.8094,0.09651],"100":[-1.5252,15.8344,0.09693],"101":[-1.5399,15.8597,0.09735],"102":[-1.5542,15.8855,0.09778],"103":[-1.5681,15.9116,0.09821],"104":[-1.5817,15.9381,0.09864],"105":[-1.5948,15.9651,0.09907],"106":[-1.6076,15.9925,0.09951],"107":[-1.6199,16.0205,0.09994],"108":[-1.6318,16.049,0.10038],"109":[-1.6433,16.0781,0.10082],"110":[-1.6544,16.1078,0.10126],"111":[-1.6651,16.1381,0.1017],"112":[-1.6753,16.1692,0.10214],"113":[-1.6851,16.2009,0.10259],"114":[-1.6944,16.2333,0.10303],"115":[-1.7032,16.2665,0.10347],"116":[-1.7116,16.3004,0.10391],"117":[-1.7196,16.3351,0.10435],"118":[-1.7271,16.3704,0.10478],"119":[-1.7341,16.4065,0.10522],"120":[-1.7407,16.4433,0.10566],"121":[-1.7468,16.4807,0.10609],"122":[-1.7525,16.5189,0.10652],"123":[-1.7578,16.5578,0.10695],"124":[-1.7626,16.5974,0.10738],"125":[-1.767,16.6376,0.1078],"126":[-1.771,16.6786,0.10823],"127":[-1.7745,16.7203,0.10865],"128":[-1.7777,16.7628,0.10906],"129":[-1.7804,16.8059,0.10948],"130":[-1.7828,16.8497,0.10989],"131":[-1.7847,16.8941,0.1103],"132":[-1.7862,16.9392,0.1107],"133":[-1.7873,16.985,0.1111],"134":[-1.7881,17.0314,0.1115],"135":[-1.7884,17.0784,0.11189],"136":[-1.7884,17.1262,0.11228],"137":[-1.788,17.1746,0.11266],"138":[-1.7873,17.2236,0.11304],"139":[-1.7861,17.2734,0.11342],"140":[-1.7846,17.324,0.11379],"141":[-1.7828,17.3752,0.11415],"142":[-1.7806,17.4272,0.11451],"143":[-1.778,17.4799,0.11487],"144":[-1.7751,17.5334,0.11522],"145":[-1.7719,17.5877,0.11556],"146":[-1.7684,17.6427,0.1159],"147":[-1.7645,17.6985,0.11623],"148":[-1.7604,17.7551,0.11656],"149":[-1.7559,17.8124,0.11688],"150":[-1.7511,17.8704,0.1172],"151":[-1.7461,17.9292,0.11751],"152":[-1.7408,17.9887,0.11781],"153":[-1.7352,18.0488,0.11811],"154":[-1.7293,18.1096,0.11841],"155":[-1.7232,18.171,0.11869],"156":[-1.7168,18.233,0.11898],"157":[-1.7102,18.2955,0.11925],"158":[-1.7033,18.3586,0.11952],"159":[-1.6962,18.4221,0.11979],"160":[-1.6888,18.486,0.12005],"161":[-1.6811,18.5502,0.1203],"162":[-1.6732,18.6148,0.12055],"163":[-1.6651,18.6795,0.12079],"164":[-1.6568,18.7445,0.12102],"165":[-1.6482,18.8095,0.12125],"166":[-1.6394,18.8746,0.12148],"167":[-1.6304,18.9398,0.1217],"168":[-1.6211,19.005,0.12191],"169":[-1.6116,19.0701,0.12212],"170":[-1.602,19.1351,0.12233],"171":[-1.5921,19.2,0.12253],"172":[-1.5821,19.2648,0.12272],"173":[-1.5719,19.3294,0.12291],"174":[-1.5615,19.3937,0.1231],"175":[-1.551,19.4578,0.12328],"176":[-1.5403,19.5217,0.12346],"177":[-1.5294,19.5853,0.12363],"178":[-1.5185,19.6486,0.1238],"179":[-1.5074,19.7117,0.12396],"180":[-1.4961,19.7744,0.12412],"181":[-1.4848,19.8367,0.12428],"182":[-1.4733,19.8987,0.12443],"183":[-1.4617,19.9603,0.12458],"184":[-1.45,20.0215,0.12473],"185":[-1.4382,20.0823,0.12487],"186":[-1.4263,20.1427,0.12501],"187":[-1.4143,20.2026,0.12514],"188":[-1.4022,20.2621,0.12528],"189":[-1.39,20.3211,0.12541],"190":[-1.3777,20.3796,0.12554],"191":[-1.3653,20.4376,0.12567],"192":[-1.3529,20.4951,0.12579],"193":[-1.3403,20.5521,0.12591],"194":[-1.3277,20.6085,0.12603],"195":[-1.3149,20.6644,0.12615],"196":[-1.3021,20.7197,0.12627],"197":[-1.2892,20.7745,0.12638],"198":[-1.2762,20.8287,0.1265],"199":[-1.2631,20.8824,0.12661],"200":[-1.2499,20.9355,0.12672],"201":[-1.2366,20.9881,0.12683],"202":[-1.2233,21.04,0.12694],"203":[-1.2098,21.0914,0.12704],"204":[-1.1962,21.1423,0.12715],"205":[-1.1826,21.1925,0.12726],"206":[-1.1688,21.2423,0.12736],"207":[-1.155,21.2914,0.12746],"208":[-1.141,21.34,0.12756],"209":[-1.127,21.388,0.12767],"210":[-1.1129,21.4354,0.12777],"211":[-1.0986,21.4822,0.12787],"212":[-1.0843,21.5285,0.12797],"213":[-1.0699,21.5742,0.12807],"214":[-1.0553,21.6193,0.12816],"215":[-1.0407,21.6638,0.12826],"216":[-1.026,21.7077,0.12836],"217":[-1.0112,21.751,0.12845],"218":[-0.9962,21.7937,0.12855],"219":[-0.9812,21.8358,0.12864],"220":[-0.9661,21.8773,0.12874],"221":[-0.9509,21.9182,0.12883],"222":[-0.9356,21.9585,0.12893],"223":[-0.9202,21.9982,0.12902],"224":[-0.9048,22.0374,0.12911],"225":[-0.8892,22.076,0.1292],"226":[-0.8735,22.114,0.1293],"227":[-0.8578,22.1514,0.12939],"228":[-0.8419,22.1883,0.12948]};
const LMS_GIRLS={"24":[-0.5684,15.6881,0.08454],"25":[-0.5684,15.659,0.08452],"26":[-0.5684,15.6308,0.08449],"27":[-0.5684,15.6037,0.08446],"28":[-0.5684,15.5777,0.08444],"29":[-0.5684,15.5523,0.08443],"30":[-0.5684,15.5276,0.08444],"31":[-0.5684,15.5034,0.08448],"32":[-0.5684,15.4798,0.08455],"33":[-0.5684,15.4572,0.08467],"34":[-0.5684,15.4356,0.08484],"35":[-0.5684,15.4155,0.08506],"36":[-0.5684,15.3968,0.08535],"37":[-0.5684,15.3796,0.08569],"38":[-0.5684,15.3638,0.08609],"39":[-0.5684,15.3493,0.08654],"40":[-0.5684,15.3358,0.08704],"41":[-0.5684,15.3233,0.08757],"42":[-0.5684,15.3116,0.08813],"43":[-0.5684,15.3007,0.08872],"44":[-0.5684,15.2905,0.08931],"45":[-0.5684,15.2814,0.08991],"46":[-0.5684,15.2732,0.09051],"47":[-0.5684,15.2661,0.0911],"48":[-0.5684,15.2602,0.09168],"49":[-0.5684,15.2556,0.09227],"50":[-0.5684,15.2523,0.09286],"51":[-0.5684,15.2503,0.09345],"52":[-0.5684,15.2496,0.09403],"53":[-0.5684,15.2502,0.0946],"54":[-0.5684,15.2519,0.09515],"55":[-0.5684,15.2544,0.09568],"56":[-0.5684,15.2575,0.09618],"57":[-0.5684,15.2612,0.09665],"58":[-0.5684,15.2653,0.09709],"59":[-0.5684,15.2698,0.0975],"60":[-0.5684,15.2747,0.09789],"61":[-0.8886,15.2441,0.09692],"62":[-0.9068,15.2434,0.09738],"63":[-0.9248,15.2433,0.09783],"64":[-0.9427,15.2438,0.09829],"65":[-0.9605,15.2448,0.09875],"66":[-0.978,15.2464,0.0992],"67":[-0.9954,15.2487,0.09966],"68":[-1.0126,15.2516,0.10012],"69":[-1.0296,15.2551,0.10058],"70":[-1.0464,15.2592,0.10104],"71":[-1.063,15.2641,0.10149],"72":[-1.0794,15.2697,0.10195],"73":[-1.0956,15.276,0.10241],"74":[-1.1115,15.2831,0.10287],"75":[-1.1272,15.2911,0.10333],"76":[-1.1427,15.2998,0.10379],"77":[-1.1579,15.3095,0.10425],"78":[-1.1728,15.32,0.10471],"79":[-1.1875,15.3314,0.10517],"80":[-1.2019,15.3439,0.10562],"81":[-1.216,15.3572,0.10608],"82":[-1.2298,15.3717,0.10654],"83":[-1.2433,15.3871,0.107],"84":[-1.2565,15.4036,0.10746],"85":[-1.2693,15.4211,0.10792],"86":[-1.2819,15.4397,0.10837],"87":[-1.2941,15.4593,0.10883],"88":[-1.306,15.4798,0.10929],"89":[-1.3175,15.5014,0.10974],"90":[-1.3287,15.524,0.1102],"91":[-1.3395,15.5476,0.11065],"92":[-1.3499,15.5723,0.1111],"93":[-1.36,15.5979,0.11156],"94":[-1.3697,15.6246,0.11201],"95":[-1.379,15.6523,0.11246],"96":[-1.388,15.681,0.11291],"97":[-1.3966,15.7107,0.11335],"98":[-1.4047,15.7415,0.1138],"99":[-1.4125,15.7732,0.11424],"100":[-1.4199,15.8058,0.11469],"101":[-1.427,15.8394,0.11513],"102":[-1.4336,15.8738,0.11557],"103":[-1.4398,15.909,0.11601],"104":[-1.4456,15.9451,0.11644],"105":[-1.4511,15.9818,0.11688],"106":[-1.4561,16.0194,0.11731],"107":[-1.4607,16.0575,0.11774],"108":[-1.465,16.0964,0.11816],"109":[-1.4688,16.1358,0.11859],"110":[-1.4723,16.1759,0.11901],"111":[-1.4753,16.2166,0.11943],"112":[-1.478,16.258,0.11985],"113":[-1.4803,16.2999,0.12026],"114":[-1.4823,16.3425,0.12067],"115":[-1.4838,16.3858,0.12108],"116":[-1.485,16.4298,0.12148],"117":[-1.4859,16.4746,0.12188],"118":[-1.4864,16.52,0.12228],"119":[-1.4866,16.5663,0.12268],"120":[-1.4864,16.6133,0.12307],"121":[-1.4859,16.6612,0.12346],"122":[-1.4851,16.71,0.12384],"123":[-1.4839,16.7595,0.12422],"124":[-1.4825,16.81,0.1246],"125":[-1.4807,16.8614,0.12497],"126":[-1.4787,16.9136,0.12534],"127":[-1.4763,16.9667,0.12571],"128":[-1.4737,17.0208,0.12607],"129":[-1.4708,17.0757,0.12643],"130":[-1.4677,17.1316,0.12678],"131":[-1.4642,17.1883,0.12713],"132":[-1.4606,17.2459,0.12748],"133":[-1.4567,17.3044,0.12782],"134":[-1.4526,17.3637,0.12816],"135":[-1.4482,17.4238,0.12849],"136":[-1.4436,17.4847,0.12882],"137":[-1.4389,17.5464,0.12914],"138":[-1.4339,17.6088,0.12946],"139":[-1.4288,17.6719,0.12978],"140":[-1.4235,17.7357,0.13009],"141":[-1.418,17.8001,0.1304],"142":[-1.4123,17.8651,0.1307],"143":[-1.4065,17.9306,0.13099],"144":[-1.4006,17.9966,0.13129],"145":[-1.3945,18.063,0.13158],"146":[-1.3883,18.1297,0.13186],"147":[-1.3819,18.1967,0.13214],"148":[-1.3755,18.2639,0.13241],"149":[-1.3689,18.3312,0.13268],"150":[-1.3621,18.3986,0.13295],"151":[-1.3553,18.466,0.13321],"152":[-1.3483,18.5333,0.13347],"153":[-1.3413,18.6006,0.13372],"154":[-1.3341,18.6677,0.13397],"155":[-1.3269,18.7346,0.13421],"156":[-1.3195,18.8012,0.13445],"157":[-1.3121,18.8675,0.13469],"158":[-1.3046,18.9335,0.13492],"159":[-1.297,18.9991,0.13514],"160":[-1.2894,19.0642,0.13537],"161":[-1.2816,19.1289,0.13559],"162":[-1.2739,19.1931,0.1358],"163":[-1.2661,19.2567,0.13601],"164":[-1.2583,19.3197,0.13622],"165":[-1.2504,19.382,0.13642],"166":[-1.2425,19.4437,0.13662],"167":[-1.2345,19.5045,0.13681],"168":[-1.2266,19.5647,0.137],"169":[-1.2186,19.624,0.13719],"170":[-1.2107,19.6824,0.13738],"171":[-1.2027,19.74,0.13756],"172":[-1.1947,19.7966,0.13774],"173":[-1.1867,19.8523,0.13791],"174":[-1.1788,19.907,0.13808],"175":[-1.1708,19.9607,0.13825],"176":[-1.1629,20.0133,0.13841],"177":[-1.1549,20.0648,0.13858],"178":[-1.147,20.1152,0.13873],"179":[-1.139,20.1644,0.13889],"180":[-1.1311,20.2125,0.13904],"181":[-1.1232,20.2595,0.1392],"182":[-1.1153,20.3053,0.13934],"183":[-1.1074,20.3499,0.13949],"184":[-1.0996,20.3934,0.13963],"185":[-1.0917,20.4357,0.13977],"186":[-1.0838,20.4769,0.13991],"187":[-1.076,20.517,0.14005],"188":[-1.0681,20.556,0.14018],"189":[-1.0603,20.5938,0.14031],"190":[-1.0525,20.6306,0.14044],"191":[-1.0447,20.6663,0.14057],"192":[-1.0368,20.7008,0.1407],"193":[-1.029,20.7344,0.14082],"194":[-1.0212,20.7668,0.14094],"195":[-1.0134,20.7982,0.14106],"196":[-1.0055,20.8286,0.14118],"197":[-0.9977,20.858,0.1413],"198":[-0.9898,20.8863,0.14142],"199":[-0.9819,20.9137,0.14153],"200":[-0.974,20.9401,0.14164],"201":[-0.9661,20.9656,0.14176],"202":[-0.9582,20.9901,0.14187],"203":[-0.9503,21.0138,0.14198],"204":[-0.9423,21.0367,0.14208],"205":[-0.9344,21.0587,0.14219],"206":[-0.9264,21.0801,0.1423],"207":[-0.9184,21.1007,0.1424],"208":[-0.9104,21.1206,0.1425],"209":[-0.9024,21.1399,0.14261],"210":[-0.8944,21.1586,0.14271],"211":[-0.8863,21.1768,0.14281],"212":[-0.8783,21.1944,0.14291],"213":[-0.8703,21.2116,0.14301],"214":[-0.8623,21.2282,0.14311],"215":[-0.8542,21.2444,0.1432],"216":[-0.8462,21.2603,0.1433],"217":[-0.8382,21.2757,0.1434],"218":[-0.8301,21.2908,0.14349],"219":[-0.8221,21.3055,0.14359],"220":[-0.814,21.32,0.14368],"221":[-0.806,21.3341,0.14377],"222":[-0.798,21.348,0.14386],"223":[-0.7899,21.3617,0.14396],"224":[-0.7819,21.3752,0.14405],"225":[-0.7738,21.3884,0.14414],"226":[-0.7658,21.4014,0.14423],"227":[-0.7577,21.4143,0.14432],"228":[-0.7496,21.4269,0.14441]};

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

function getChildLMS(sex, ageYears, param) {
  // Zaokrąglij wiek do najbliższej ćwiartki roku (0.25 = 3 miesiące)
  const ageMonths = Math.round(ageYears * 4) / 4 * 12;
  if (ageMonths < 36 || ageMonths > 216) {
      return null; // poza zakresem 3–18 lat
  }
  // Wybierz właściwy obiekt danych w zależności od płci i parametru
  let dataset;
  if (sex === 'M') {
      dataset = (param === 'WT' ? LMS_WEIGHT_BOYS : LMS_HEIGHT_BOYS);
  } else {
      dataset = (param === 'WT' ? LMS_WEIGHT_GIRLS : LMS_HEIGHT_GIRLS);
  }
  // Jeżeli istnieje dokładny wpis dla ageMonths, zwróć go bez interpolacji
  const ageKey = String(Math.round(ageMonths)); 
  if (dataset[ageKey]) {
      return dataset[ageKey];
  }
  // Znajdź punkty sąsiadujące
  const keys = Object.keys(dataset).map(Number).sort((a,b)=>a-b);
  let lowerKey = keys[0];
  let upperKey = keys[keys.length - 1];
  for (let i = 0; i < keys.length; i++) {
      if (keys[i] <= ageMonths) lowerKey = keys[i];
      if (keys[i] >= ageMonths) {
          upperKey = keys[i];
          break;
      }
  }
  // Jeśli wyszło poza zakres danych (teoretycznie nie powinno, bo sprawdziliśmy range)
  if (!dataset[lowerKey] || !dataset[upperKey]) return null;
  // Jeśli wiek dokładnie pasuje do klucza (bez wcześniejszego wykrycia)
  if (lowerKey === upperKey) {
      return dataset[lowerKey];
  }
  // Interpolacja liniowa między lowerKey a upperKey
  const [L1, M1, S1] = dataset[lowerKey];
  const [L2, M2, S2] = dataset[upperKey];
  const t = (ageMonths - lowerKey) / (upperKey - lowerKey);
  const L_interp = L1 + t * (L2 - L1);
  const M_interp = M1 + t * (M2 - M1);
  const S_interp = S1 + t * (S2 - S1);
  return [L_interp, M_interp, S_interp];
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
  const txt = p.toFixed(1);
  return txt.endsWith('.0') ? txt.slice(0, -2) : txt;
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

function getLMS(sex, months) {
  const m = Math.round(months);
  return (sex === 'M' ? LMS_BOYS[m] : LMS_GIRLS[m]) || null;
}

function bmiPercentileChild(bmi, sex, months) {
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L, M, S] = lms;
  const z = (L !== 0) ? (Math.pow(bmi / M, L) - 1) / (L * S) : Math.log(bmi / M) / S;
  return normalCDF(z) * 100;
}

function bmiCategoryChildExact(percentile) {
  if(percentile === null) return '';
  if(percentile < 5)   return 'Niedowaga';
  if(percentile < 85)  return 'Prawidłowe';
  if(percentile < 97.7)  return 'Nadwaga';
  return 'Otyłość';
}

function toNormalBMITarget(weight, height, age, sex) {
  // dla dzieci: górny zakres normy BMI
  if(age >= 2 && age <= 19){
    const months = Math.round(age*12);
    const dataMap = bmiPercentiles[sex==='M'?'boys':'girls'];
    const data = dataMap[months];
    if(data){
      return data.P85;
    }
    return 18.5;
  }
  return 24.9;
}
function kcalFor1km(activity, weight){
  let speed_kmh = 1;
  switch(activity){
    case 'bike16': speed_kmh=16; break;
    case 'bike20': speed_kmh=20; break;
    case 'run':    speed_kmh=8;  break;
    case 'swim':   speed_kmh=3;  break;
    case 'walk':   speed_kmh=5;  break;
  }
  let MET = 1;
  switch(activity){
    case 'bike16': MET=6.0; break;
    case 'bike20': MET=8.0; break;
    case 'run':    MET=8.0; break;
    case 'swim':   MET=7.5; break;
    case 'walk':   MET=3.0; break;
  }
  let time_min = 60 / speed_kmh;
  let burnPerMin = (MET * 3.5 * weight) / 200;
  return burnPerMin * time_min;
}

function generujZaleceniaDoPDF() {
  const age = parseFloat(document.getElementById('age').value)||0;
  const weight = parseFloat(document.getElementById('weight').value)||0;
  const height = parseFloat(document.getElementById('height').value)||0;
  const bmi = BMI(weight,height);
  let grupa = '';
  if(age<18) grupa = 'dziecko';
  else if(age<60) grupa = 'dorosły';
  else grupa = 'senior';
  let zalecenia = '';
  if (bmi < 18.5) {
  if (grupa === 'dziecko') {
    zalecenia = 'Skonsultuj się z pediatrą lub dietetykiem dziecięcym. Niedowaga u dzieci wymaga indywidualnego podejścia.';
  } else {
    if (bmi < 13) {
      zalecenia = 'Wymagana natychmiastowa hospitalizacja z powodu skrajnego wygłodzenia (BMI < 13).';
    } else if (bmi < 17) {
      zalecenia = 'Pilna konsultacja psychiatryczna – leczenie zaburzeń odżywiania (BMI < 17).';
    } else {
      zalecenia = 'Rozważ konsultację psychologiczną dla wczesnego wsparcia (BMI 17 – 18,49).';
    }
  }
}
  else if(bmi<25) {
    zalecenia = 'Gratulacje! Utrzymuj zbilansowaną dietę bogatą w warzywa, pełnoziarniste produkty oraz dbaj o codzienną aktywność fizyczną.';
  }
  else if(bmi<30) {
    zalecenia = 'Zaleca się ograniczenie słodyczy, tłuszczów nasyconych, słodzonych napojów. Wprowadź więcej warzyw i owoców. Regularna aktywność fizyczna (30-60 min/dzień) jest wskazana. Warto rozważyć konsultację z dietetykiem.';
  }
  else {
    zalecenia = (grupa==='senior') ?
      'Otyłość u seniorów wymaga szczególnej ostrożności! Zwiększ warzywa, ogranicz kalorie, wybierz lekką aktywność (spacery). Wskazana konsultacja lekarska i dietetyczna.' :
      'Ogranicz kalorie, unikaj słodyczy i fastfoodów, zwiększ warzywa i wodę w diecie, wdrażaj codzienny ruch (minimum 40 min/dzień). Zalecana konsultacja z dietetykiem.';
  }
  return zalecenia;
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

function getLMS(sex, months){
  const m = Math.round(months);
  return (sex==='M'?LMS_BOYS[m]:LMS_GIRLS[m]) || null;
}
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
  const p = bmiPercentileChild(bmi, sex, months);
  if(p===null) return bmiCategory(bmi); // fallback
  if(p<5) return 'Niedowaga';
  if(p<85) return 'Prawidłowe';
  if(p<95) return 'Nadwaga';
  return 'Otyłość';
}
/* Upper limit of normal (P85 WHO) */
function toNormalBMITarget(weight,height,age,sex){
  if(age>=2 && age<=19){
    const months=Math.round(age*12);
    const p=bmiPercentiles[sex==='M'?'boys':'girls'][months];
    return p ? p.P85 : 18.5;
  }
  return 24.9; // adults
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

// Override getLMS to cover 0–60 mies. from WHO 2006
function getLMS(sex, months){{
  const m = Math.round(months);
  if(m <= 60){{
    return (sex === 'M' ? LMS_INFANT_BOYS[m] : LMS_INFANT_GIRLS[m]) || null;
  }}
  return (sex === 'M' ? LMS_BOYS[m] : LMS_GIRLS[m]) || null;
}}

// bmiPercentileChild stays unchanged – it will now see infant LMS

/* === PLAN CARD: dual targets (P85 & P50) – 2025‑06‑30 === */
(function(){
  const MEDIAN_ADULT_BMI = 21.7;
  function medianBMITarget(age, sex){
     if(age>=2 && age<=19){
        const months = Math.round(age*12);
        const lms = getLMS(sex, months);
        if(lms) return lms[1];            // parametr M = 50 centyl
     }
     return MEDIAN_ADULT_BMI;             // dorośli – mediana WHO
  }
  /* re‑wrap update() so nie ruszać reszty logiki */
  const _update = update;
  update = function(){
    _update();   // run original calculations first

    const planCard    = document.getElementById('planCard');
    if(planCard.style.display!=='block') return;   // show plan only when relevant
    const planResults = document.getElementById('planResults');

    const weight = +document.getElementById('weight').value||0;
    const height = +document.getElementById('height').value||0;
    const age    = +document.getElementById('age').value||0;
    const sex    = document.getElementById('sex').value;

    // INPUTS – treningi, intensywność, deficyt diety
    const sessions     = +document.getElementById('sessionsPerWeek').value;
    const metIntensity = +document.getElementById('intensity').value;
    const dailyDef     = +document.getElementById('dailyDeficit').value;

    // obliczenia wspólne
    const burnPerMin   = (metIntensity * 3.5 * weight) / 200;
    const perSession   = burnPerMin * 60;
    const weeklyEx     = perSession * sessions;
    const weeklyDiet   = dailyDef * 7;
    const weeklyTotal  = weeklyEx + weeklyDiet;

    function statsForTarget(targetBMI){
        const targetW = targetBMI * Math.pow(height/100,2);
        const kgToLose = weight - targetW;
        if(kgToLose <= 0) return null;            // już poniżej celu
        const kcalToBurn = kgToLose * 7700;
        const weeks = Math.ceil(kcalToBurn / weeklyTotal);
        return {kgToLose, kcalToBurn, weeks};
    }

    const targetUpper = toNormalBMITarget(weight,height,age,sex);
    const targetMedian = medianBMITarget(age, sex);

    const statUpper = statsForTarget(targetUpper);
    const statMedian = statsForTarget(targetMedian);

    function colHTML(title, st){
        if(!st){
            return `<div class="result-box plan-col"><strong>${title}</strong><br>Cel już osiągnięty 🎉</div>`;
        }
        const monthsNeeded = (st.weeks / 4.345).toFixed(1);
        const yearsNeeded  = (monthsNeeded / 12).toFixed(1);
        return `<div class="result-box plan-col">
          <strong>${title}</strong>
          <table style="width:100%;border-collapse:collapse;margin-top:6px;">
            <tr><td>Kg do redukcji</td><td>${st.kgToLose.toFixed(1)} kg</td></tr>
            <tr><td>Kcal do spalenia</td><td>${Math.round(st.kcalToBurn)} kcal</td></tr>
            <tr><td>Tyg. deficyt energii</td><td>${Math.round(weeklyTotal)} kcal</td></tr>
            <tr><td><strong>Szacowany czas</strong></td>
                <td><strong>${st.weeks} tyg<br>(${monthsNeeded} mies)<br>(${yearsNeeded} lat)</strong></td></tr>
          </table>
        </div>`;
    }

    planResults.innerHTML = colHTML('Do górnej granicy BMI', statUpper)
                          + colHTML('Do BMI <span class="small-50">50.0</span> centyla', statMedian);
  };
})();

(function(){
  const MEDIAN_ADULT_BMI = 21.7;
  const getMedianBMI = (age, sex) => {
    if(age >= 2 && age <= 19){
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
    const targetWeight50 = targetBMI50 * Math.pow(height/100, 2);
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
          st.innerHTML=txt.replace(/BMI\s*50(?:\.0)?/i,'BMI <span class="small-50">50.0</span>');
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

  const obs=new MutationObserver(transformPlan);
  obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',transformPlan);
})();
