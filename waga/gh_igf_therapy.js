
/**
 * gh_igf_therapy.js
 * Karta „Leczenie hormonem wzrostu / IGF‑1”
 * Wymagania:
 *  - pojawia się poniżej przycisku „Leczenie hormonem wzrostu / IGF-1”
 *  - pojedynczy element, w osobnym pliku JS
 *  - waga brana z karty „Dane użytkownika” (id="weight")
 *  - użytkownik wybiera tylko program i preparat (listy rozwijalne)
 *  - pole na własną dawkę [mg/kg/d] – opcjonalne; jeśli puste, używamy domyślnej wg programu/preparatu
 *  - dynamiczne przeliczenia (po zmianie programu, preparatu, dawki, dni, wagi)
 *  - wyniki: dawka w mg/kg/d, mg/kg/tydz i (IU/kg/tydz), dawka dla pacjenta, zapotrzebowanie leku (ampułki) na 90 / 180 dni i dowolną liczbę dni
 *  - walidacja zakresów (dla GH: wg programu; dla IGF‑1: 0.08–0.24 mg/kg/d; Ngenla – pokazujemy zalecaną 0.66 mg/kg/tydz)
 *
 * Integracja bezinwazyjna: podpinamy się do #toggleIgfTests w fazie CAPTURE i zatrzymujemy propagację,
 * aby nie pokazywać starych podprzycisków (SNP/ZT/PWS/SGA/IGF‑1) z app.js.
 */

(function(){
  const GH_DRUGS = ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg','Ngenla 24 mg','Ngenla 60 mg'];
  const IGF_DRUGS = ['Increlex 40 mg']; // Mecaserminum

  // Map a therapeutic program to its default preparation. When the user switches
  // programs we will automatically select the appropriate preparation from this
  // mapping. These defaults reflect common clinical practice: SNP, SGA and PNN
  // use Omnitrope 10 mg, Turner syndrome (ZT) and PWS use Genotropin 12 mg and
  // IGF‑1 (mecasermin) uses Increlex 40 mg.
  const DEFAULT_DRUG_BY_PROGRAM = {
    'SNP':   'Omnitrope 10 mg',
    'PNN':   'Omnitrope 10 mg',
    'SGA':   'Omnitrope 10 mg',
    'ZT':    'Genotropin 12 mg',
    'PWS':   'Genotropin 12 mg',
    'IGF-1': 'Increlex 40 mg'
  };

  // mg na 1 ampułkę/wkład/wstrzykiwacz
  const DRUG_UNITS = {
    'Omnitrope 5 mg':   { mgPerUnit: 5,   type:'somatotropina' },
    'Omnitrope 10 mg':  { mgPerUnit:10,   type:'somatotropina' },
    'Genotropin 5,3 mg':{ mgPerUnit:5.3,  type:'somatotropina' },
    'Genotropin 12 mg': { mgPerUnit:12,   type:'somatotropina' },
    'Ngenla 24 mg':     { mgPerUnit:24,   type:'somatrogon', weekly:true }, // 1x/tydz
    'Ngenla 60 mg':     { mgPerUnit:60,   type:'somatrogon', weekly:true }, // 1x/tydz
    'Increlex 40 mg':   { mgPerUnit:40,   type:'mecasermin' }
  };

  /**
   * Sprawdź, czy dany preparat jest codzienną somatotropiną (GH), dla której
   * powinniśmy udostępnić możliwość wpisania dawki w mg/d i przeliczać
   * dwukierunkowo pomiędzy mg/kg/d a mg/d. Preparaty tygodniowe (np.
   * Ngenla) oraz IGF‑1 (mecasermin) są wyłączone.
   */
  function isDailySomatotropinDrug(drugName){
    const info = DRUG_UNITS[drugName];
    return !!(info && info.type === 'somatotropina' && !info.weekly);
  }

  // Flagi edycyjne – sygnalizują, które pole dawki jest aktualnie edytowane.
  // Pozwala to uniknąć nadpisywania wartości wpisywanych przez użytkownika
  // podczas synchronizacji i formatowania, zapewniając płynną edycję.
  let editingPerKg = false;  // true, gdy użytkownik edytuje pole mg/kg/d
  let editingPerDay = false; // true, gdy użytkownik edytuje pole mg/d

  /**
   * Zwraca liczbę miejsc po przecinku, które należy zastosować przy
   * prezentowaniu dawki w mg/dobę w polu "Dawka (mg/dobę)".
   * Dla Omnitrope 10 mg oraz Genotropin 12 mg wyniki prezentujemy z
   * dokładnością do 1 miejsca po przecinku; dla Omnitrope 5 mg i
   * Genotropin 5,3 mg – z dokładnością do 2 miejsc. Inne leki (np.
   * Ngenla, Increlex) domyślnie używają 3 miejsc.
   */
  function mgPerDayDecimals(drugName){
    switch (drugName) {
      case 'Genotropin 12 mg':
      case 'Omnitrope 10 mg':
        return 1;
      case 'Omnitrope 5 mg':
      case 'Genotropin 5,3 mg':
        return 2;
      default:
        return 3;
    }
  }

  // Programy – zakresy terapeutyczne (GH – w mg/kg/tydz), dawki domyślne w mg/kg/d (poza IGF‑1 i somatrogonem)
  const PROGRAMS = {
    'SNP': { label:'SNP (Somatotropinowa niedoczynność przysadki)', ghWeekRange:[0.10,0.33], defaultDaily:0.025, drugs: GH_DRUGS },
    'PNN': { label:'PNN (Przewlekła niewydolność nerek)',           ghWeekRange:[0.33,0.37], defaultDaily:0.050, drugs: GH_DRUGS },
    'ZT' : { label:'Zespół Turnera',                                ghWeekRange:[0.33,0.47], defaultDaily:0.057, drugs: GH_DRUGS },
    'PWS': { label:'Zespół PWS',                                    ghWeekRange:[0.18,0.47], defaultDaily:0.046, drugs: GH_DRUGS },
    'SGA': { label:'SGA',                                           ghWeekRange:[0.16,0.43], defaultDaily:(0.25/7), drugs: GH_DRUGS },
    'IGF-1': { label:'IGF‑1 (niedobór IGF‑1 – mekasermina)',        igfDailyRange:[0.08,0.24], igfTargetPerDose:0.12, drugs: IGF_DRUGS }
  };

  function fmt(n, d=3){
    if (!isFinite(n)) return '–';
    const x = (d==null ? String(n) : Number(n).toFixed(d));
    // usuń zbędne zera po przecinku
    const trimmed = (d!=null) ? x.replace(/\.?0+$/, '') : x;
    return trimmed.replace('.', ',');
  }
  function num(v){
    const x = parseFloat(v);
    return (isNaN(x) ? null : x);
  }
  function kg(){ // masa pacjenta z karty „Dane użytkownika”
    const el = document.getElementById('weight');
    const w = el ? parseFloat(el.value) : NaN;
    return (isNaN(w) ? null : w);
  }

  function createCard(){
    const card = document.createElement('section');
    card.id = 'ghIgfTherapyCard';
    card.className = 'result-card animate-in'; // szeroka karta jak intakeCard
    card.style.margin = '1rem 0';

    card.innerHTML = `
      <h2 style="text-align:center;">Leczenie hormonem wzrostu / IGF‑1</h2>
      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap; align-items:flex-end;">
        <label style="flex:1 1 260px; min-width:240px;">
          Program terapeutyczny
          <select id="therProg"></select>
        </label>
        <label style="flex:1 1 260px; min-width:240px;">
          Preparat
          <select id="therDrug"></select>
        </label>
      </div>

      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap; align-items:flex-end; margin-top:.65rem;">
        <label id="therDoseContainer" style="flex:1 1 220px; min-width:210px;">
          <span id="therDoseLabelText">Dawka (mg/kg/dobę)</span>
          <input type="number" step="0.001" min="0" id="therDailyDose" placeholder="domyślnie wg programu/preparatu">
        </label>
        <!-- Pole na dawkę absolutną (mg/dobę); widoczne tylko dla preparatów GH podawanych codziennie -->
        <label id="therDoseAbsContainer" style="flex:1 1 220px; min-width:210px; display:none;">
          <span id="therDoseAbsLabelText">Dawka (mg/dobę)</span>
          <input type="number" step="0.001" min="0" id="therDailyDoseAbs" placeholder="">
        </label>
        <label style="flex:0 0 160px;">
          Inne dni
          <input type="number" step="1" min="1" id="therCustomDays" placeholder="np. 30">
        </label>
      </div>

      <div id="therDoseNote" class="muted" style="margin-top:.35rem;"></div>
      <div id="therWarning" class="plan-warning-card notice-orange" style="display:none; margin-top:.5rem;"></div>

      <div id="therSummary" class="result-box" style="margin-top:.8rem;"></div>

      <div class="data-card" style="margin-top:.8rem;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:.6rem; align-items:center;">
          <div><strong>Na 90 dni</strong></div>  <div id="ther90"></div>
          <div><strong>Na 180 dni</strong></div> <div id="ther180"></div>
          <div><strong>Na <span id="therCustomLabel">—</span> dni</strong></div> <div id="therCustom"></div>
        </div>
        <small class="muted" style="display:block; margin-top:.4rem;">W obliczeniach zaokrąglamy liczbę ampułek w górę – uwzględnia to typowe straty podczas podawania.</small>
      </div>
    `;
    return card;
  }

  const PROGRAM_ORDER = ['SNP','ZT','PWS','SGA','PNN','IGF-1'];

  function mountCard(){
    if (document.getElementById('ghIgfTherapyCard')) return;
    const where = document.getElementById('igfButtonWrapper');
    if (!where || !where.parentNode) return;
    const card = createCard();
    // wstaw POD przyciskiem „Leczenie hormonem wzrostu / IGF‑1”
    where.parentNode.insertBefore(card, where.nextSibling);
    // Początkowo ukryj kartę, aby pierwszy klik w przycisk pokazywał ją zamiast od razu chować.
    // Bez tego stylu domyślnie display jest pusty (""), co powodowało traktowanie karty jako widocznej
    // i natychmiastowe schowanie przy pierwszym kliknięciu. Ustawiając display na "none" zapewniamy
    // prawidłowe zachowanie przełącznika.
    card.style.display = 'none';

    // wypełnij listy
    const progSel = document.getElementById('therProg');
    const drugSel = document.getElementById('therDrug');
    PROGRAM_ORDER.forEach(key=>{
      const def = PROGRAMS[key];
      if(!def) return;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      progSel.appendChild(opt);
    });
    // domyślnie wybierz SNP
    progSel.value = 'SNP';
    populateDrugs();

    // listenery
    progSel.addEventListener('change', ()=>{ populateDrugs(); applyDefaults(); recalc(); });
    drugSel.addEventListener('change', ()=>{ applyDefaults(); recalc(); });

    const doseInp = document.getElementById('therDailyDose');
    const doseAbsInp = document.getElementById('therDailyDoseAbs');
    const customDays = document.getElementById('therCustomDays');
    // Sygnalizuj, które pole dawki jest aktualnie edytowane (focus/blur)
    doseInp.addEventListener('focus', () => editingPerKg = true);
    doseInp.addEventListener('blur',  () => { editingPerKg = false; recalc(); });
    doseAbsInp.addEventListener('focus', () => editingPerDay = true);
    doseAbsInp.addEventListener('blur',  () => { editingPerDay = false; recalc(); });
    // Funkcje synchronizujące dawkę mg/kg/d ↔ mg/d
    function syncFromPerKg(){
      const wVal = kg();
      const perKg = num(doseInp.value);
      const drugName = document.getElementById('therDrug').value;
      if (isDailySomatotropinDrug(drugName)){
        if (wVal && perKg != null && perKg > 0){
          // Ustal liczbę miejsc po przecinku w mg/d w zależności od preparatu
          const dec = mgPerDayDecimals(drugName);
          if (!editingPerDay) doseAbsInp.value = Number(perKg * wVal).toFixed(dec);
        } else {
          if (!editingPerDay) doseAbsInp.value = '';
        }
      }
    }
    function syncFromPerDay(){
      const wVal = kg();
      const perDay = num(doseAbsInp.value);
      if (isDailySomatotropinDrug(document.getElementById('therDrug').value)){
        if (wVal && perDay != null && perDay > 0){
          if (!editingPerKg) doseInp.value = Number(perDay / wVal).toFixed(3);
        } else {
          if (!editingPerKg) doseInp.value = '';
        }
      }
    }
    // Nasłuchy: aktualizuj pola i przeliczaj wyniki na bieżąco
    doseInp.addEventListener('input', () => { syncFromPerKg(); recalc(); });
    doseAbsInp.addEventListener('input', () => { syncFromPerDay(); recalc(); });
    customDays.addEventListener('input', recalc);

    // Live‑sync z wagą
    const wt = document.getElementById('weight');
    if (wt){
      wt.addEventListener('input', recalc);
      wt.addEventListener('change', recalc);
    }

    // start
    applyDefaults();
    recalc();
  }

  function populateDrugs(){
    const prog = document.getElementById('therProg').value;
    const drugSel = document.getElementById('therDrug');
    drugSel.innerHTML = '';
    const list = PROGRAMS[prog].drugs;
    list.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      drugSel.appendChild(opt);
    });
    // Ustaw domyślny preparat w zależności od programu. Gdy wartość z
    // DEFAULT_DRUG_BY_PROGRAM istnieje w bieżącej liście, wybieramy ją;
    // w przeciwnym razie pozostawiamy pierwszy element listy. Dla IGF‑1
    // zachowujemy preferencję na jedyny dostępny preparat.
    let defaultDrug = DEFAULT_DRUG_BY_PROGRAM[prog];
    if (prog === 'IGF-1') {
      defaultDrug = 'Increlex 40 mg';
    }
    if (defaultDrug && list.includes(defaultDrug)) {
      drugSel.value = defaultDrug;
    } else {
      // fallback: wybierz pierwszy element (jeśli jest)
      if (list.length > 0) {
        drugSel.value = list[0];
      }
    }
  }

  function applyDefaults(){
    const prog = document.getElementById('therProg').value;
    const drug = document.getElementById('therDrug').value;
    const doseInp = document.getElementById('therDailyDose');
    const note = document.getElementById('therDoseNote');
    const labelEl = document.getElementById('therDoseLabelText');

    // Wartości domyślne dla dawek w mg/kg/d lub mg/kg/tydz
    let defaultDailyMgPerKg = null;
    let defaultWeeklyMgPerKg = null;
    let noteHtml = '';

    // Dla somatrogonu (Ngenla) posługujemy się dawką tygodniową w polu
    // wprowadzania (mg/kg/tydzień), natomiast w obliczeniach stosujemy
    // przeliczenie na mg/kg/dobę. W pozostałych przypadkach dawka jest
    // podawana w mg/kg/dobę.
    if (prog === 'IGF-1') {
      // IGF‑1: docelowa dawka 0,12 mg/kg 2×/dobę (razem 0,24 mg/kg/d)
      defaultDailyMgPerKg = 0.24;
      labelEl.textContent = 'Dawka (mg/kg/dobę)';
      doseInp.placeholder = String(defaultDailyMgPerKg);
      doseInp.value = String(defaultDailyMgPerKg);
      noteHtml = `IGF‑1: docelowa dawka <strong>0,12&nbsp;mg/kg</strong> podawana <strong>2×/dobę</strong> (<em>łącznie ≈&nbsp;${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>).`;
    } else if (/^Ngenla/.test(drug)) {
      // Somatrogon (Ngenla) – zalecana dawka 0,66 mg/kg/tydz; ustawiamy tygodniową wartość w polu
      defaultWeeklyMgPerKg = 0.66;
      defaultDailyMgPerKg = defaultWeeklyMgPerKg / 7;
      labelEl.textContent = 'Dawka (mg/kg/tydzień)';
      doseInp.placeholder = String(defaultWeeklyMgPerKg);
      doseInp.value = String(defaultWeeklyMgPerKg);
      noteHtml = `Somatrogon (Ngenla): zalecana dawka <strong>0,66&nbsp;mg/kg/tydz</strong> (<em>≈&nbsp;${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>).`;
    } else {
      // Somatotropina (GH) – dawki w mg/kg/dobę zgodnie z programem
      defaultDailyMgPerKg = PROGRAMS[prog].defaultDaily;
      labelEl.textContent = 'Dawka (mg/kg/dobę)';
      doseInp.placeholder = String(defaultDailyMgPerKg);
      doseInp.value = String(defaultDailyMgPerKg);
      const progShort = PROGRAMS[prog].label.split(' ')[0];
      noteHtml = `GH (somatotropina) – zalecana dawka dla programu <strong>${progShort}</strong>: <em>${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>.`;
    }

    // Ustaw komunikat dotyczący dawki
    note.innerHTML = noteHtml;

    // Pokaż lub ukryj pole dawki w mg/dobę oraz ustaw jego wartość początkową.
    // Pole mg/dobę jest widoczne tylko dla codziennie podawanych preparatów GH (somatotropina).
    const doseAbsWrap  = document.getElementById('therDoseAbsContainer');
    const doseAbsInput = document.getElementById('therDailyDoseAbs');
    const wVal = kg();
    if (isDailySomatotropinDrug(drug)){
      doseAbsWrap.style.display = '';
      if (wVal && defaultDailyMgPerKg != null){
        // Ustal liczbę miejsc po przecinku dla wyniku w mg/dobę w zależności od preparatu
        const dec = mgPerDayDecimals(drug);
        if (!editingPerDay) doseAbsInput.value = Number(defaultDailyMgPerKg * wVal).toFixed(dec);
      } else {
        if (!editingPerDay) doseAbsInput.value = '';
      }
    } else {
      doseAbsWrap.style.display = 'none';
      if (!editingPerDay) doseAbsInput.value = '';
    }
  }

  function weekRangeDaily(prog){
    // zwróć [minD, maxD] dla GH programów (mg/kg/d)
    const p = PROGRAMS[prog];
    if (!p || !p.ghWeekRange) return null;
    return [ p.ghWeekRange[0]/7, p.ghWeekRange[1]/7 ];
  }

function recalc(){
    const warnBox = document.getElementById('therWarning');
    const summary = document.getElementById('therSummary');
    const out90 = document.getElementById('ther90');
    const out180 = document.getElementById('ther180');
    const outC = document.getElementById('therCustom');
    const labC = document.getElementById('therCustomLabel');

    const prog = document.getElementById('therProg').value;
    const drug = document.getElementById('therDrug').value;
    const doseVal = num(document.getElementById('therDailyDose').value);
    const customDays = num(document.getElementById('therCustomDays').value);
    const w = kg();

    // minimal validation: require weight
    if (!w || w <= 0){
      summary.innerHTML = `<p>Uzupełnij <strong>wagę</strong> w sekcji „Dane użytkownika”, aby zobaczyć dawki.</p>`;
      out90.textContent = '—';
      out180.textContent = '—';
      outC.textContent = '—';
      labC.textContent = customDays ? String(customDays) : '—';
      warnBox.style.display = 'none';
      return;
    }

    // Determine base daily (mg/kg/d) and weekly (mg/kg/tydz) dose based on drug/program
    let daily;   // mg/kg/d
    let weekly;  // mg/kg/tydz
    if (/^Ngenla/.test(drug)) {
      // Ngenla: input is mg/kg/week
      if (doseVal == null || doseVal <= 0) {
        weekly = 0.66;
      } else {
        weekly = doseVal;
      }
      daily = weekly / 7;
    } else if (prog === 'IGF-1') {
      // IGF‑1: input is mg/kg/day
      if (doseVal == null || doseVal <= 0) {
        daily = 0.24;
      } else {
        daily = doseVal;
      }
      weekly = daily * 7;
    } else {
      // GH daily: input is mg/kg/day
      if (doseVal == null || doseVal <= 0) {
        daily = PROGRAMS[prog].defaultDaily;
      } else {
        daily = doseVal;
      }
      weekly = daily * 7;
    }

    // Per-patient mg/day and mg/week (before rounding)
    const perKgWeek_mg = weekly;
    const perKgWeek_IU = (prog === 'IGF-1' ? null : perKgWeek_mg * 3);
    let perDay_mg = daily * w;
    let perWeek_mg = perKgWeek_mg * w;

    // === ROUNDING OF PATIENT'S DOSE ===
    let step = null;
    let weeklyDose = false;
    switch (drug) {
      case 'Omnitrope 5 mg':    step = 0.05; break;
      case 'Omnitrope 10 mg':   step = 0.1;  break;
      case 'Genotropin 5,3 mg': step = 0.05; break;
      case 'Genotropin 12 mg':  step = 0.15; break;
      case 'Ngenla 24 mg':      step = 0.2; weeklyDose = true; break;
      case 'Ngenla 60 mg':      step = 0.5; weeklyDose = true; break;
      case 'Increlex 40 mg':    step = null; break;
    }
    function roundTo(val, st){ return Math.round(val / st) * st; }
    if (step) {
      if (weeklyDose) {
        perWeek_mg = roundTo(perWeek_mg, step);
        perDay_mg = perWeek_mg / 7;
      } else {
        perDay_mg = roundTo(perDay_mg, step);
        perWeek_mg = perDay_mg * 7;
      }
    }
    // === END ROUNDING ===

    // Effective dose in mg/kg/day and mg/kg/week after rounding
    let dailyEff;
    let weeklyEff;
    if (/^Ngenla/.test(drug)) {
      weeklyEff = (w ? (perWeek_mg / w) : weekly);
      dailyEff = weeklyEff / 7;
    } else if (prog === 'IGF-1') {
      dailyEff = daily;
      weeklyEff = dailyEff * 7;
    } else {
      dailyEff = (w ? (perDay_mg / w) : daily);
      weeklyEff = dailyEff * 7;
    }

    // Synchronize inputs for daily somatotropin drugs
    if (isDailySomatotropinDrug(drug)) {
      const doseAbsInput  = document.getElementById('therDailyDoseAbs');
      const dosePerKgInput= document.getElementById('therDailyDose');
      if (w) {
        // określ liczbę miejsc po przecinku dla mg/d w zależności od preparatu
        const dec = mgPerDayDecimals(drug);
        if (!editingPerDay) doseAbsInput.value  = Number(perDay_mg).toFixed(dec);
        if (!editingPerKg)  dosePerKgInput.value= Number(dailyEff).toFixed(3);
      }
    }

    // Warnings based on effective dose
    let warn = '';
    if (prog === 'IGF-1') {
      const [minD, maxD] = PROGRAMS['IGF-1'].igfDailyRange;
      if (dailyEff < minD || dailyEff > maxD) {
        warn = `Wpisana/efektywna dawka <strong>${fmt(dailyEff,3)} mg/kg/d</strong> jest <strong>poza zakresem</strong> programu IGF‑1 (<em>${fmt(minD,2)}–${fmt(maxD,2)} mg/kg/d</em>).`;
      }
    } else if (/^Ngenla/.test(drug)) {
      // Ostrzeżenie dla Ngenla (somatrogon) pojawia się tylko wtedy, gdy użytkownik
      // świadomie zmienił dawkę tygodniową mg/kg/tydz na inną niż zalecane 0,66.
      // Wartość doseVal pochodzi bezpośrednio z pola wejściowego (mg/kg/tydz).
      // Jeśli jest ona pusta/null lub równa 0,66 (domyślnie wstawiana przez applyDefaults),
      // uznajemy, że użytkownik nie modyfikował dawki i nie wyświetlamy ostrzeżenia,
      // nawet jeśli weeklyEff różni się minimalnie od 0,66 wskutek zaokrągleń skoków.
      const defaultWeekly = 0.66;
      const userChanged = (doseVal != null && Math.abs(doseVal - defaultWeekly) > 1e-6);
      if (userChanged && Math.abs(weeklyEff - defaultWeekly) > 1e-6) {
        warn = `Ngenla: zalecana dawka to <strong>0,66&nbsp;mg/kg/tydz</strong> (u Ciebie: <em>${fmt(weeklyEff,3)}&nbsp;mg/kg/tydz</em>).`;
      }
    } else {
      const rng = weekRangeDaily(prog);
      if (rng) {
        if (dailyEff < rng[0] || dailyEff > rng[1]) {
          warn = `Efektywna dawka <strong>${fmt(dailyEff,3)} mg/kg/d</strong> jest <strong>poza zakresem</strong> programu <strong>${prog}</strong> (<em>${fmt(rng[0],3)}–${fmt(rng[1],3)} mg/kg/d</em>).`;
        }
      }
    }
    if (warn){
      warnBox.innerHTML = warn;
      warnBox.style.display = 'block';
    } else {
      warnBox.style.display = 'none';
      warnBox.innerHTML = '';
    }

    // Summary display using effective doses
    if (/^Ngenla/.test(drug)) {
      const perKgWeek_IU_eff = (prog === 'IGF-1' ? null : weeklyEff * 3);
      const iuPartN = (perKgWeek_IU_eff==null) ? '' : ` (<span class="muted">${fmt(perKgWeek_IU_eff,2)} IU/kg/tydz</span>)`;
      summary.innerHTML = `
      <div class="whr-result">
        <div class="whr-topline" style="justify-content:center;">
          <span class="whr-label">Pacjent:</span>
          <span class="whr-number">${fmt(perWeek_mg,3)} <small>mg/tydz</small></span>
        </div>
        <div class="whr-badges" style="justify-content:center;">
          <span class="whr-badge">${fmt(dailyEff,3)} mg/kg/d</span>
          <span class="whr-badge">= ${fmt(weeklyEff,3)} mg/kg/tydz${iuPartN}</span>
          <span class="whr-badge">${fmt(perDay_mg,3)} mg/d</span>
        </div>
      </div>
      `;
    } else {
      const perKgWeek_IU_eff2 = (prog === 'IGF-1' ? null : weeklyEff * 3);
      const iuPart2 = (perKgWeek_IU_eff2==null) ? '' : ` (<span class="muted">${fmt(perKgWeek_IU_eff2,2)} IU/kg/tydz</span>)`;
      summary.innerHTML = `
      <div class="whr-result">
        <div class="whr-topline" style="justify-content:center;">
          <span class="whr-label">Pacjent:</span>
          <span class="whr-number">${fmt(perDay_mg,3)} <small>mg/d</small></span>
        </div>
        <div class="whr-badges" style="justify-content:center;">
          <span class="whr-badge">${fmt(dailyEff,3)} mg/kg/d</span>
          <span class="whr-badge">= ${fmt(weeklyEff,3)} mg/kg/tydz${iuPart2}</span>
          <span class="whr-badge">${fmt(perWeek_mg,3)} mg/tydz</span>
        </div>
      </div>
      `;
    }

    // Medicine demand calculations (unchanged except using rounded perDay/perWeek)
    function needForDays(days){
      if (!days || days<=0) return { mg:0, units:0, injections:0 };
      const unit = DRUG_UNITS[drug];
      if (!unit) return { mg:0, units:0, injections:0 };
      let totalMg = 0;
      let injections = 0;
      if (unit.weekly){
        injections = Math.ceil(days / 7);
        totalMg = perWeek_mg * injections;
      } else {
        totalMg = perDay_mg * days;
      }
      const units = Math.ceil(totalMg / unit.mgPerUnit);
      return { mg: totalMg, units, injections };
    }

    function lineFor(days){
      const res = needForDays(days);
      const unit = DRUG_UNITS[drug];
      const injInfo = (unit && unit.weekly) ? `; iniekcji: ${res.injections}` : '';
      const packs = (/^Omnitrope/.test(drug)) ? Math.ceil(res.units / 5) : null;
      const packInfo = (packs!=null) ? `; opakowań: ${packs} (po 5 ampułek)` : '';
      return `≈ ${fmt(res.mg,1)} mg  →  ampułek: <strong>${res.units}</strong>${injInfo}${packInfo}`;
    }

    out90.innerHTML  = lineFor(90);
    out180.innerHTML = lineFor(180);
    if (customDays && customDays>0){
      labC.textContent = String(customDays);
      outC.innerHTML = lineFor(customDays);
    } else {
      labC.textContent = '—';
      outC.textContent = '—';
    }
  }

  function hideOldIgfSubbuttons(){
    const ids = ['snpButtonWrapper','turnerButtonWrapper','pwsButtonWrapper','sgaButtonWrapper','igf1ButtonWrapper'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    const igfBtn = document.getElementById('toggleIgfTests');
    if (!igfBtn) return;

    // CAPTURE phase → blokujemy stary handler z app.js, który pokazywał podprzyciski
    igfBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      hideOldIgfSubbuttons();
      mountCard();
      // toggle: pokaż/ukryj kartę
      const card = document.getElementById('ghIgfTherapyCard');
      if (card){
        const visible = (card.style.display !== 'none');
        card.style.display = visible ? 'none' : 'block';
        // Jeśli aktywny jest motyw Liquid Glass, ustawiamy klasę podświetlenia na przycisku IGF
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const cardVisible = card.style.display !== 'none';
            if (cardVisible) {
              igfBtn.classList.add('active-toggle');
            } else {
              igfBtn.classList.remove('active-toggle');
            }
          }
        } catch(e) {
          /* ignore */
        }
      }
      // dopasuj szerokości głównych przycisków (jeśli funkcja istnieje)
      try{ if (typeof adjustTestButtonWidths === 'function') requestAnimationFrame(adjustTestButtonWidths); }catch(_){}
    }, true); // <-- capture

    // Gdy moduł lekarski przełącza się/zmienia się waga – próbuj odświeżać wyniki karty jeśli istnieje
    const wt = document.getElementById('weight');
    if (wt){
      ['input','change'].forEach(evt=> wt.addEventListener(evt, ()=>{
        const card = document.getElementById('ghIgfTherapyCard');
        if (!card || card.style.display === 'none') return;
        try{ recalc(); }catch(_){}
      }));
    }
  });
})();
