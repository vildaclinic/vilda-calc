/*
 * Moduł leczenia bisfosfonianami dla pacjentów z osteogenesis imperfecta.
 * Ten skrypt obsługuje przycisk „Leczenie bisfosfonianami”, wyświetla
 * kartę z formularzem wyboru preparatu (pamidronian – Pamifos lub
 * kwas zoledronowy – Zomikos), numeru dawki oraz czasu trwania
 * terapii i obecności złamań.  Na podstawie masy ciała dziecka
 * wprowadzonej w sekcji „Dane użytkownika” oraz wyborów lekarza
 * oblicza zalecaną dawkę leku (w mg), sugerowany czas wlewu i
 * termin kolejnej dawki.  Reguły dawkowania pochodzą z literatury
 * specjalistycznej: pamidronian 0,5 mg/kg przy pierwszej dawce,
 * następnie 1 mg/kg wlew trwający około 3 godziny co 3 miesiące【964606079774914†L240-L253】;
 * zoledronian 0,0125 mg/kg przy pierwszej dawce i 0,05 mg/kg przy
 * kolejnych dawkach co 6 miesięcy, wlew trwający około 1 godzinę【159377117190749†L167-L173】【859568725367863†L115-L123】;
 * dawka podtrzymująca zoledronianu 0,025 mg/kg może być stosowana
 * po kilku latach leczenia w zależności od efektu klinicznego【159377117190749†L184-L189】.
 */
/**
 * Moduł leczenia bisfosfonianami dla pacjentów pediatrycznych.  Skrypt ten obsługuje
 * przycisk „Leczenie bisfosfonianami”, wyświetla kartę z formularzem wyboru
 * wskazania do terapii (OI, osteoporoza, CRMO), preparatu (pamidronian lub
 * kwas zoledronowy), rodzaju dawki (pierwsza, kolejna, podtrzymująca) oraz
 * czasu trwania terapii (dla leków długodziałających) i występowania złamań
 * między cyklami.  Na podstawie masy ciała dziecka, wieku oraz
 * wybranych parametrów oblicza zalecaną dawkę (mg), sugerowany czas wlewu,
 * odstęp między cyklami oraz wyświetla informacje o maksymalnej dawce
 * rocznej, wymaganych badaniach przed terapią i obserwacji po wlewie.
 * Dawkowanie oparte jest na licznych źródłach klinicznych, w tym
 * protokołach GOSH i Jenny Lind (pamidronian 0,5–1 mg/kg z rocznym limitem
 * 12 mg/kg【573645405372972†L150-L158】, zoledronian 0,025–0,05 mg/kg
 * z limitem rocznym 0,1 mg/kg i maksymalną dawką jednorazową 2–4 mg
 * zależnie od wieku【72548642660203†L550-L604】) oraz opisanych schematach
 * dla osteoporozy i CRMO【16†L63-L71】【32†L301-L309】.
 */
(function(){

  function bisphosSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'bisphos-therapy' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('bisphos_therapy.js', _, { helper: 'bisphosSetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function initBisphosTherapyModule() {
    // Elementy interfejsu dla modułu bisfosfonianów
    const toggleBtn      = document.getElementById('toggleBisphos');
    const card           = document.getElementById('bisphosCard');
    const resultEl       = document.getElementById('bisphosResult');
    const indicationSelect = document.getElementById('bisphosIndication');
    const drugSelect     = document.getElementById('bisphosDrug');
    const doseSelect     = document.getElementById('bisphosDoseNumber');
    const durationInput  = document.getElementById('bisphosDuration');
    const durationLabel  = document.getElementById('bisphosDurationLabel') || document.getElementById('bisphosDurationLabel');
    // Element wyboru złamań został usunięty, ponieważ nie wnosił wartości klinicznej.
    // Pozostawiamy zmienną jako null, aby kod był odporny na brak tego elementu.
    const fractureSelect = null;
    // Dane użytkownika wprowadzane w głównym formularzu
    const weightInput    = document.getElementById('weight');
    const ageInput       = document.getElementById('age');
    const heightInput    = document.getElementById('height');
    // Mapa źródeł – powiązuje kombinację wskazania i leku z listą odnośników.
    // Użytkownik może później kliknąć w te linki, aby sprawdzić literaturę,
    // która stanowiła podstawę schematów dawkowania.  Poszczególne adresy
    // prowadzą do artykułów na PubMed/PMC lub oficjalnych protokołów klinicznych.
    const sourcesMap = {
      'oi-pamifos': [
        { href: 'https://pubmed.ncbi.nlm.nih.gov/28894358/', title: 'Marginean O. et al. Therapy with pamidronate in children with osteogenesis imperfecta (2017)' },
        { href: 'https://www.gosh.nhs.uk/conditions-and-treatments/medicines-information/pamidronate-for-children-with-osteogenesis-imperfecta/', title: 'GOSH – Pamidronate protocol for osteogenesis imperfecta' }
      ],
      'oi-zomikos': [
        { href: 'https://www.gosh.nhs.uk/conditions-and-treatments/medicines-information/zoledronic-acid/', title: 'GOSH – Zoledronic acid protocol for osteogenesis imperfecta' },
        { href: 'https://pubmed.ncbi.nlm.nih.gov/29184807/', title: 'Bowden SA, Mahan JD. Zoledronic acid in pediatric metabolic bone disorders (2017)' }
      ],
      'osteoporoza-pamifos': [
        { href: 'https://pubmed.ncbi.nlm.nih.gov/34218632/', title: 'Yoon JH et al. Efficacy and safety of intravenous pamidronate infusion for treating osteoporosis in children and adolescents (2021)' },
        { href: 'https://pubmed.ncbi.nlm.nih.gov/28894358/', title: 'Marginean O. et al. Therapy with pamidronate in children with osteogenesis imperfecta (2017)' }
      ],
      'osteoporoza-zomikos': [
        { href: 'https://www.gosh.nhs.uk/conditions-and-treatments/medicines-information/zoledronic-acid/', title: 'GOSH – Zoledronic acid protocol' },
        { href: 'https://pubmed.ncbi.nlm.nih.gov/29184807/', title: 'Bowden SA, Mahan JD. Zoledronic acid in pediatric metabolic bone disorders (2017)' }
      ],
      'crmo-pamifos': [
        { href: 'https://pubmed.ncbi.nlm.nih.gov/19925649/', title: 'Miettunen P. et al. Dramatic pain relief and resolution of bone inflammation following pamidronate in CRMO (2009)' },
        { href: 'https://www.starship.org.nz/guidelines/intravenous-bisphosphonate-therapy/', title: 'Starship – Intravenous bisphosphonate therapy guideline' }
      ],
      'crmo-zomikos': [
        { href: 'https://pubmed.ncbi.nlm.nih.gov/39417783/', title: 'Awadh NI et al. An impressive response to zoledronic acid treatment for CRMO: A case report (2024)' },
        { href: 'https://www.starship.org.nz/guidelines/intravenous-bisphosphonate-therapy/', title: 'Starship – Intravenous bisphosphonate therapy guideline' }
      ]
    };

    /**
     * Dostosowuje widoczność pola czasu terapii w zależności od wybranego leku.
     * Dla kwasu zoledronowego istotne jest podanie długości dotychczasowej
     * terapii, aby ustalić wydłużenie odstępu między dawkami przy terapii
     * podtrzymującej.  Dla pamidronianu pole to pozostaje ukryte.
     */
    function updateDurationVisibility(){
      if(!durationLabel) return;
      const drug = drugSelect ? drugSelect.value : '';
      if(drug === 'zomikos'){
        durationLabel.style.display = 'inline-block';
      } else {
        durationLabel.style.display = 'none';
      }
    }

    /**
     * Aktualizuje widoczność opcji „Terapia podtrzymująca” w selektorze numeru podania.
     * Dla pamidronianu (Pamifos) nie stosuje się oddzielnej terapii podtrzymującej,
     * dlatego opcja ta jest ukrywana.  Po wybraniu Zomikosu ponownie ją pokazujemy.
     */
    function updateDoseNumberVisibility(){
      if(!doseSelect) return;
      const drug = drugSelect ? drugSelect.value : '';
      const maintenanceOption = doseSelect.querySelector('option[value="maintenance"]');
      if(maintenanceOption){
        // Ukryj lub pokaż opcję w zależności od wybranego preparatu.
        const show = (drug === 'zomikos');
        // Atrybut "hidden" lepiej ukrywa opcję niż display:none w większości przeglądarek.
        maintenanceOption.hidden = !show;
        maintenanceOption.disabled = !show;
        // Dodatkowo dla zgodności ustawiamy styl display (w niektórych przypadkach hidden może nie zadziałać).
        maintenanceOption.style.display = show ? '' : 'none';
        // Jeżeli opcja jest ukryta i była wybrana, przełącz na „Kolejna dawka” (subsequent).
        if(!show && doseSelect.value === 'maintenance'){
          doseSelect.value = 'subsequent';
        }
      }
    }

    /**
     * Oblicza zalecaną dawkę bisfosfonianu w mg na podstawie masy ciała,
     * wieku, wybranego wskazania, preparatu i typu dawki.  Wynik aktualizuje
     * treść elementu resultEl.  Jeśli wymagane dane nie są dostępne, wyświetla
     * odpowiedni komunikat.
     */
    function computeBisphos(){
      if(!resultEl) return;
      const weight = parseFloat(weightInput && weightInput.value);
      const age    = parseFloat(ageInput && ageInput.value);
      // Sprawdzenie wymaganych danych
      if(!(weight > 0)){
        bisphosSetTrustedHtml(resultEl, '<p>Wprowadź masę ciała dziecka w sekcji „Dane użytkownika”.</p>', 'bisphos:resultEl');
        return;
      }
      const indication = indicationSelect ? indicationSelect.value : 'oi';
      const drug       = drugSelect ? drugSelect.value : '';
      if(!drug){
        bisphosSetTrustedHtml(resultEl, '<p>Wybierz preparat.</p>', 'bisphos:resultEl');
        return;
      }
      const doseType  = doseSelect ? doseSelect.value : 'subsequent';
      // Parametry dawkowania
      let mgPerKg = 0;
      let infusionMinutes = 0;
      let intervalMonths = 0;
      let maxAnnualDose;      // w mg/kg/rok
      let maxSingleDose;      // w mg (bez przeliczenia na kg)
      let note = '';
      let preInfo = '';
      let postInfo = '';

      // Ustalanie parametrów w zależności od wskazania i preparatu
      if(indication === 'oi'){
        if(drug === 'pamifos'){
          // OI: pamidronian – trzydniowy cykl (0,5 mg/kg dzień 1, 1 mg/kg dni 2–3) co 3–4 miesiące; wlew ok. 3 h
          if(doseType === 'first') {
            mgPerKg = 0.5;
          } else {
            mgPerKg = 1.0;
          }
          infusionMinutes = 180; // 3 h (można wydłużyć do 4 h)
          intervalMonths = 3;
          maxAnnualDose = 12;
          maxSingleDose = 60;
          note = 'Pamidronian w OI: pełny cykl składa się z trzech kolejnych wlewów (dzień 1: 0,5 mg/kg, dni 2–3: 1 mg/kg) powtarzanych co 3–4 miesiące; nie przekraczaj 12 mg/kg/rok ani 60 mg w jednej infuzji.';
          preInfo = 'Przed podaniem upewnij się, że poziom witaminy D jest prawidłowy; skontroluj stężenia wapnia, fosforu, elektrolitów, kreatyniny, PTH oraz wykonaj badanie densytometryczne; wyrównaj niedobory witaminy D i wapnia.';
          postInfo = 'Po podaniu obserwuj dziecko przez 24–48 h na wypadek reakcji gorączkowej, bólów mięśni lub hipokalcemii; zapewnij odpowiednie nawodnienie; w razie potrzeby podaj paracetamol lub ibuprofen; monitoruj stężenie wapnia.';
        } else if(drug === 'zomikos'){
          // OI: zoledronian – dawki zależne od wieku i etapu terapii (protokoły GOSH i przeglądy).
          if(age < 5){
            // Dzieci <5 lat: pierwsza dawka 0,0125 mg/kg, druga i kolejne 0,025 mg/kg, wlew 45 min.
            if(doseType === 'first'){
              mgPerKg = 0.0125;
              intervalMonths = 3;
            } else if(doseType === 'maintenance'){
              mgPerKg = 0.025;
              intervalMonths = 6;
            } else {
              mgPerKg = 0.025;
              intervalMonths = 6;
            }
            infusionMinutes = 45;
            maxAnnualDose = 0.1;
            maxSingleDose = 2;
            note = 'Zoledronian w OI (dzieci <5 lat): pierwsza dawka 0,0125 mg/kg; druga i kolejne dawki 0,025 mg/kg (druga po 3 miesiącach, następne co 6 miesięcy); dawkę podtrzymującą 0,025 mg/kg można stosować co 6–12 miesięcy przy stabilizacji choroby; nie przekraczaj 0,1 mg/kg/rok ani 2 mg w jednej infuzji.';
          } else {
            // Dzieci ≥5 lat: pierwsza dawka 0,025 mg/kg, następne 0,05 mg/kg co 6 miesięcy; dawka podtrzymująca 0,025 mg/kg.
            if(doseType === 'first'){
              mgPerKg = 0.025;
              intervalMonths = 3;
            } else if(doseType === 'maintenance'){
              mgPerKg = 0.025;
              intervalMonths = 6;
            } else {
              mgPerKg = 0.05;
              intervalMonths = 6;
            }
            infusionMinutes = 30;
            maxAnnualDose = 0.1;
            maxSingleDose = 4;
            note = 'Zoledronian w OI (dzieci ≥5 lat): pierwsza dawka 0,025 mg/kg; druga i kolejne dawki 0,05 mg/kg co 6 miesięcy; dawkę podtrzymującą 0,025 mg/kg można stosować co 6–12 miesięcy po poprawie gęstości kości; nie przekraczaj 0,1 mg/kg/rok ani 4 mg w jednej infuzji.';
          }
          preInfo = 'Przed wlewem oceniono poziom witaminy D, wapnia, fosforu oraz funkcję nerek; wyrównaj niedobory; pierwszą dawkę podaje się zwykle w warunkach szpitalnych; rozważ modyfikację dawki przy niewydolności nerek.';
          postInfo = 'Po wlewie obserwuj objawy grypopodobne (gorączka, bóle mięśni) i monitoruj stężenie wapnia; objawy często występują w ciągu 48 h i można je łagodzić paracetamolem lub ibuprofenem; poinformuj rodziców o konieczności zgłoszenia się w przypadku nietypowych dolegliwości; terapia może opóźniać wyrzynanie zębów.';
        }
      } else if(indication === 'osteoporoza'){
        if(drug === 'pamifos'){
          // Osteoporoza: pamidronian podawany jest w 2–3‑dniowym cyklu (1 mg/kg/dzień) co 3–4 miesiące; w obliczeniach stosujemy dawkę na pojedynczy wlew.
          mgPerKg = 1.0;
          infusionMinutes = 180;  // około 3 h (zalecane 3–4 h)
          intervalMonths = 4;
          maxAnnualDose = 10;      // przyjęto wartość 10 mg/kg/rok jako uśrednioną (zalecany zakres 9–12 mg/kg/rok)
          maxSingleDose = 60;
          note = 'Pamidronian w osteoporozie: terapia obejmuje 2–3 dniowy cykl 1 mg/kg/dzień co 3–4 miesiące; w niniejszych obliczeniach przyjęto dawkę 1 mg/kg na pojedynczy wlew, a sumę na cykl uzyskuje się mnożąc liczbę dni przez 1 mg/kg; całkowita roczna dawka według literatury mieści się w zakresie 9–12 mg/kg – w obliczeniach zastosowano wartość uśrednioną 10 mg/kg/rok; nie przekraczaj 60 mg w jednej infuzji.';
          preInfo = 'Przed podaniem oceń poziom witaminy D, wapnia, fosforu i kreatyniny oraz nawodnienie; w razie hipokalcemii przełóż leczenie; pierwsze wlewy zaleca się przeprowadzać w ośrodku specjalistycznym.';
          postInfo = 'Po każdym wlewie monitoruj parametry życiowe i stężenie wapnia; objawy grypopodobne mogą wymagać leczenia objawowego; kolejny cykl zaplanuj po około 4 miesiącach.';
        } else if(drug === 'zomikos'){
          // Osteoporoza: zoledronian – dawki według wieku i etapu terapii (Translational Pediatrics).
          if(isNaN(age) || age < 2){
            // Dzieci <2 lat: pierwsza dawka 0,0125 mg/kg, kolejne 0,025 mg/kg co 3 miesiące; dawka podtrzymująca 0,025 mg/kg co 6–12 mies.
            if(doseType === 'first'){
              mgPerKg = 0.0125;
              intervalMonths = 3;
            } else if(doseType === 'maintenance'){
              mgPerKg = 0.025;
              intervalMonths = 6;
            } else {
              mgPerKg = 0.025;
              intervalMonths = 3;
            }
            infusionMinutes = 45;
            maxAnnualDose = 0.1;
            maxSingleDose = 2;
            note = 'Zoledronian w osteoporozie (dzieci <2 lat): pierwsza dawka 0,0125 mg/kg, następne 0,025 mg/kg co 3 miesiące; dawkę 0,025 mg/kg można stosować co 6–12 miesięcy w terapii podtrzymującej po poprawie gęstości kości; nie przekraczaj 0,1 mg/kg/rok ani 2 mg w jednej infuzji.';
          } else {
            // Dzieci ≥2 lata: pierwsza dawka 0,0125 mg/kg, druga 0,025 mg/kg po 3 mies., kolejne 0,05 mg/kg co 6 mies.; dawka podtrzymująca 0,025 mg/kg.
            if(doseType === 'first'){
              mgPerKg = 0.0125;
              intervalMonths = 3;
            } else if(doseType === 'maintenance'){
              mgPerKg = 0.025;
              intervalMonths = 6;
            } else {
              mgPerKg = 0.05;
              intervalMonths = 6;
            }
            infusionMinutes = (age < 5 ? 45 : 30);
            maxAnnualDose = 0.1;
            maxSingleDose = (age < 5 ? 2 : 4);
            note = 'Zoledronian w osteoporozie (dzieci ≥2 lata): pierwsza dawka 0,0125 mg/kg; druga dawka 0,025 mg/kg po 3 miesiącach; kolejne dawki 0,05 mg/kg co 6 mies.; w terapii podtrzymującej 0,025 mg/kg co 6–12 mies.; nie przekraczaj 0,1 mg/kg/rok ani 2 mg (<5 lat) lub 4 mg (≥5 lat) w jednej infuzji.';
          }
          preInfo = 'Przed wlewem oceń poziom witaminy D, wapnia i funkcję nerek; wyrównaj niedobory i zapewnij nawodnienie; pierwszą dawkę najlepiej podać w warunkach szpitalnych.';
          postInfo = 'Po wlewie monitoruj stężenie wapnia i obserwuj na wypadek reakcji grypopodobnej; poinformuj rodziców o konieczności zgłoszenia się przy gorączce, bólach kości lub innych nietypowych objawach.';
        }
      } else if(indication === 'crmo'){
        if(drug === 'pamifos'){
          // CRMO: zaleca się trzydniowy cykl (dzień 1: 0,5 mg/kg, dni 2–3: 1 mg/kg) powtarzany co 3 miesiące; alternatywnie można stosować pojedyncze wlewy 1 mg/kg co miesiąc.  Obliczenia dotyczą pojedynczego wlewu.
          mgPerKg = (doseType === 'first') ? 0.5 : 1.0;
          infusionMinutes = 180;
          intervalMonths = 3;
          maxAnnualDose = 11.5;
          maxSingleDose = 60;
          note = 'Pamidronian w CRMO: pełny cykl obejmuje trzy wlewy – dzień 1: 0,5 mg/kg, dni 2–3: 1 mg/kg – powtarzane co 3 miesiące; w cięższych przypadkach można podawać pojedyncze wlewy 1 mg/kg co miesiąc; nie przekraczaj 11,5 mg/kg/rok ani 60 mg w jednej infuzji.';
          preInfo = 'Przed rozpoczęciem terapii skontroluj stężenia witaminy D, wapnia, fosforu i kreatyniny; wyrównaj niedobory i zapewnij odpowiednie nawodnienie; pierwsze cykle powinny odbywać się w ośrodku specjalistycznym.';
          postInfo = 'Po każdym wlewie monitoruj objawy ostrej reakcji (gorączka, ból kostny) i hipokalcemii; poprawa zwykle następuje po kilku cyklach; w razie braku odpowiedzi rozważ zmianę terapii.';
        } else if(drug === 'zomikos'){
          // CRMO: dawki według protokołów – pierwszy wlew 0,0125 mg/kg, drugi 0,025 mg/kg po 3 miesiącach, kolejne 0,05 mg/kg co 6 mies.; dawka podtrzymująca 0,025 mg/kg co 6–12 mies.
          if(doseType === 'first'){
            mgPerKg = 0.0125;
            intervalMonths = 3;
          } else if(doseType === 'maintenance'){
            mgPerKg = 0.025;
            intervalMonths = 6;
          } else {
            mgPerKg = 0.05;
            intervalMonths = 6;
          }
          infusionMinutes = 30;
          maxAnnualDose = 0.1;
          maxSingleDose = age < 5 ? 2 : 4;
          note = 'Zoledronian w CRMO: pierwsza dawka 0,0125 mg/kg; druga dawka 0,025 mg/kg po 3 miesiącach; kolejne dawki 0,05 mg/kg co 6 miesięcy; dawkę podtrzymującą 0,025 mg/kg można stosować co 6–12 miesięcy po stabilizacji; nie przekraczaj 0,1 mg/kg/rok ani 2 mg (<5 lat) czy 4 mg (≥5 lat) w jednej infuzji.';
          preInfo = 'Przed wlewem skontroluj poziom witaminy D, wapnia i funkcję nerek; leczenie powinno być prowadzone w ośrodku specjalistycznym, a pacjent musi być dobrze nawodniony.';
          postInfo = 'Po wlewie obserwuj na wypadek hipokalcemii i reakcji grypopodobnej; monitoruj ból kości oraz aktywność zmian zapalnych; odstępy między dawkami można wydłużyć do 12 miesięcy w zależności od odpowiedzi klinicznej.';
        }
      }

      // Jeśli nie udało się ustalić dawki – brak danych
      if(!(mgPerKg > 0) || infusionMinutes <= 0 || intervalMonths <= 0){
        bisphosSetTrustedHtml(resultEl, '<p>Nie można obliczyć dawki – sprawdź wybrane ustawienia.</p>', 'bisphos:resultEl');
        return;
      }
      // Obliczenie dawki w mg (masa ciała [kg] × dawka [mg/kg]).  Zapamiętaj pierwotną wartość, aby móc ograniczyć do maksymalnej dawki jednorazowej.
      const originalDoseMg = mgPerKg * weight;
      let doseMg = originalDoseMg;
      // Jeśli istnieje maksymalna zalecana dawka jednorazowa i obliczona dawka ją przekracza, ogranicz dawkę do tej wartości
      let reductionNote = '';
      if(maxSingleDose && doseMg > maxSingleDose){
        doseMg = maxSingleDose;
        reductionNote = ' (ograniczona do maksymalnej dozwolonej dawki)';
      }
      // Zaokrąglij do 3 miejsc po przecinku
      const doseStr = doseMg.toFixed(3).replace('.', ',');
      // Formatowanie czasu wlewu
      const hours = Math.floor(infusionMinutes / 60);
      const minutes = infusionMinutes % 60;
      let infusionStr = '';
      if(hours > 0){
        infusionStr = `${hours} h`;
        if(minutes > 0) infusionStr += ` ${minutes} min`;
      } else {
        infusionStr = `${minutes} min`;
      }
      // Obliczenie daty kolejnego podania
      const now = new Date();
      let interval = intervalMonths;
      // Wydłuż odstęp dla zoledronianu w terapii podtrzymującej przy długim leczeniu.
      // Parametr „fracture” jest pomijany – zakładamy brak złamań.
      const fracture = false;
      if(drug === 'zomikos' && doseType === 'maintenance' && durationInput && durationInput.value){
        const dur = parseFloat(durationInput.value);
        if(!isNaN(dur) && dur >= 24){
          interval = Math.max(interval, 12);
        }
      }
      const nextDoseDate = new Date(now.getFullYear(), now.getMonth() + interval, now.getDate());
      let nextDoseStr;
      try {
        nextDoseStr = nextDoseDate.toLocaleDateString('pl-PL');
      } catch(_) {
        nextDoseStr = nextDoseDate.toISOString().split('T')[0];
      }
      // Zbuduj listę elementów wyników jako wypunktowanie.
      const items = [];
      // Dodaj informację o dawce wraz z ewentualną notatką o ograniczeniu
      items.push(`Zalecana dawka: <strong>${doseStr} mg</strong>${reductionNote}.`);
      // Informacja o czasie wlewu
      items.push(`Podaj lek we wlewie dożylnym trwającym około <strong>${infusionStr}</strong>.`);
      // Informacja o terminie następnej dawki
      items.push(`Następna dawka powinna być podana za ${interval} miesiąc${interval === 1 ? '' : 'e'}: <strong>${nextDoseStr}</strong>.`);
      // Usunięto uwagę o złamaniach, ponieważ pole zgłaszania złamań zostało usunięte.
      // Maksymalna dawka roczna, jeśli określona
      if(maxAnnualDose){
        const maxAnnualStr = maxAnnualDose.toFixed(2).replace('.', ',');
        items.push(`<strong>Maksymalna dawka roczna:</strong> ${maxAnnualStr} mg/kg/rok.`);
      }
      // Uwagi dotyczące leczenia
      items.push(`<strong>Uwagi dotyczące leczenia:</strong> ${note}`);
      // Co sprawdzić przed podaniem
      items.push(`<strong>Co sprawdzić przed podaniem:</strong> ${preInfo}`);
      // Na co uważać po podaniu
      items.push(`<strong>Na co uważać po podaniu:</strong> ${postInfo}`);
      // Generuj HTML listy
      let listHtml = '<ul style="padding-left:1.2em; list-style-type: disc;">';
      for(const item of items){
        listHtml += `<li style="margin-bottom:0.5rem;">${item}</li>`;
      }
      listHtml += '</ul>';
      // Dodaj sekcję „Źródła”, aby użytkownik mógł zweryfikować pochodzenie zaleceń
      // Klucz mapy źródeł powstaje z nazwy wskazania i leku (np. 'oi-pamifos').
      const srcKey = `${indication}-${drug}`;
      const srcList = sourcesMap[srcKey] || [];
      if(srcList.length > 0){
        // Budujemy listę odnośników w kolejności określonej w sourcesMap
        listHtml += '<div style="margin-top:1rem;">';
        listHtml += '<strong>Źródła:</strong>';
        listHtml += '<ol style="padding-left:1.2em; margin-top:0.5rem;">';
        for(const src of srcList){
          // każdy odnośnik otwieramy w nowej karcie dla wygody użytkownika
          listHtml += `<li style="margin-bottom:0.25rem;"><a href="${src.href}" target="_blank" rel="noopener noreferrer">${src.title}</a></li>`;
        }
        listHtml += '</ol>';
        listHtml += '</div>';
      }
      bisphosSetTrustedHtml(resultEl, listHtml, 'bisphos:resultEl');
    }

    // Obsługa kliknięcia w przycisk – pokazuje lub chowa kartę i inicjuje obliczenia
    if(toggleBtn && card){
      toggleBtn.addEventListener('click', function(){
        const visible = card.style.display !== 'none' && card.style.display !== '';
        if(visible){
          card.style.display = 'none';
          this.classList.remove('active-toggle');
        } else {
          // Zamknij kartę Z‑score, jeśli jest otwarta, aby karty się nie nakładały
          try {
            const zscoreCardEl = document.getElementById('zscoreCard');
            const toggleZBtn   = document.getElementById('toggleZscore');
            if(zscoreCardEl && zscoreCardEl.style.display !== 'none'){
              zscoreCardEl.style.display = 'none';
              if(toggleZBtn) toggleZBtn.classList.remove('active-toggle');
            }
          } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('bisphos_therapy.js', e, { line: 396 });
    }
  }
          card.style.display = 'block';
          this.classList.add('active-toggle');
          updateDoseNumberVisibility();
          computeBisphos();
        }
        // Dopasuj szerokości przycisków po zmianie widoczności
        try {
          if(typeof adjustTestButtonWidths === 'function'){
            requestAnimationFrame(() => adjustTestButtonWidths());
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('bisphos_therapy.js', e, { line: 407 });
    }
  }
      });
    }

    // Aktualizuj widoczność pola czasu terapii przy zmianie leku
    if(drugSelect) drugSelect.addEventListener('change', () => {
      updateDurationVisibility();
      updateDoseNumberVisibility();
      computeBisphos();
    });
    // Reakcja na zmiany pól wejściowych – aktualizuj obliczenia na bieżąco
    if(indicationSelect) indicationSelect.addEventListener('change', computeBisphos);
    if(weightInput) weightInput.addEventListener('input', computeBisphos);
    if(ageInput)    ageInput.addEventListener('input', computeBisphos);
    if(heightInput) heightInput.addEventListener('input', computeBisphos);
    if(doseSelect)  doseSelect.addEventListener('change', computeBisphos);
    if(durationInput)  durationInput.addEventListener('input', computeBisphos);
    // Pole wyboru złamań zostało usunięte – brak zdarzenia zmiany.
    // Początkowa konfiguracja widoczności pola czasu terapii
    updateDurationVisibility();
    // Początkowa konfiguracja opcji numeru podania
    updateDoseNumberVisibility();
  }

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('bisphos-therapy:init', initBisphosTherapyModule);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBisphosTherapyModule, { once: true });
  } else {
    initBisphosTherapyModule();
  }
})();