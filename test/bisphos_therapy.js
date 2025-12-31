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
  document.addEventListener('DOMContentLoaded', function(){
    // Elementy interfejsu dla modułu bisfosfonianów
    const toggleBtn      = document.getElementById('toggleBisphos');
    const card           = document.getElementById('bisphosCard');
    const resultEl       = document.getElementById('bisphosResult');
    const indicationSelect = document.getElementById('bisphosIndication');
    const drugSelect     = document.getElementById('bisphosDrug');
    const doseSelect     = document.getElementById('bisphosDoseNumber');
    const durationInput  = document.getElementById('bisphosDuration');
    const durationLabel  = document.getElementById('bisphosDurationLabel') || document.getElementById('bisphosDurationLabel');
    const fractureSelect = document.getElementById('bisphosFracture');
    // Dane użytkownika wprowadzane w głównym formularzu
    const weightInput    = document.getElementById('weight');
    const ageInput       = document.getElementById('age');
    const heightInput    = document.getElementById('height');

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
        resultEl.innerHTML = '<p>Wprowadź masę ciała dziecka w sekcji „Dane użytkownika”.</p>';
        return;
      }
      const indication = indicationSelect ? indicationSelect.value : 'oi';
      const drug       = drugSelect ? drugSelect.value : '';
      if(!drug){
        resultEl.innerHTML = '<p>Wybierz preparat.</p>';
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
          // OI: pamidronian 0,5 mg/kg (pierwsza) lub 1 mg/kg (kolejne), infuzja 3 h, co 3 mies.;
          mgPerKg = (doseType === 'first') ? 0.5 : 1.0;
          infusionMinutes = 180;
          intervalMonths = 3;
          maxAnnualDose = 12;      // mg/kg/rok【573645405372972†L150-L158】
          maxSingleDose = 60;      // mg; wg protokołu GOSH
          note = 'Pamidronian w OI: zazwyczaj stosuje się 1 mg/kg na cykl w 3‑dniowej serii co 3 miesiące; pierwszą dawkę zmniejsza się do 0,5 mg/kg; nie przekraczaj 12 mg/kg/rok i 60 mg w pojedynczym wlewie.';
          preInfo = 'Przed podaniem upewnij się, że poziom witaminy D jest prawidłowy; skontroluj stężenia wapnia, fosforu, elektrolitów, kreatyniny, PTH oraz wykonaj badanie densytometryczne; wyrównaj niedobory witaminy D i wapnia.';
          postInfo = 'Po podaniu obserwuj dziecko przez 24–48 h na wypadek reakcji gorączkowej, bólów mięśni lub hipokalcemii; zapewnij odpowiednie nawodnienie; w razie potrzeby podaj paracetamol lub ibuprofen; monitoruj stężenie wapnia.';
        } else if(drug === 'zomikos'){
          // OI: zoledronian 0,0125 mg/kg (pierwsza), 0,05 mg/kg (kolejna), 0,025 mg/kg (podtrzymująca)
          if(doseType === 'first') mgPerKg = 0.0125;
          else if(doseType === 'maintenance') mgPerKg = 0.025;
          else mgPerKg = 0.05;
          infusionMinutes = 60;
          intervalMonths = 6;
          maxAnnualDose = 0.1;    // mg/kg/rok【72548642660203†L550-L604】
          maxSingleDose = age < 5 ? 2 : 4; // mg; maksymalna dawka jednorazowa
          // W przypadku osteogenesis imperfecta leczenie zoledronianem można modyfikować w czasie:
          // standardowo stosuje się 0,05 mg/kg co 6 miesięcy, a pierwszą dawkę zmniejsza się do 0,0125 mg/kg.
          // Dawka podtrzymująca wynosi 0,025 mg/kg.  Po kilku latach leczenia, gdy Z‑score kręgów lędźwiowych
          // osiągnie wartości powyżej −2 i nie występują złamania, można rozważyć wydłużenie odstępu
          // między dawkami do 12 miesięcy przy zachowaniu dawki 0,025 mg/kg.
          note = 'Zoledronian w OI: standardowo 0,05 mg/kg co 6 miesięcy; pierwsza dawka zmniejszona do 0,0125 mg/kg; dawka podtrzymująca 0,025 mg/kg; nie przekraczaj 0,1 mg/kg/rok oraz 2 mg u dzieci <5 lat i 4 mg u dzieci 5–17 lat.  Po kilku latach leczenia i poprawie z‑score można rozważyć podtrzymującą dawkę 0,025 mg/kg co 12 miesięcy przy braku złamań.';
          preInfo = 'Przed wlewem oceń poziom witaminy D, wapnia, fosforu i funkcji nerek; wyrównaj niedobory; pierwszą dawkę zawsze podaj w warunkach szpitalnych; rozważ redukcję dawki przy niewydolności nerek.';
          postInfo = 'Po podaniu obserwuj dziecko pod kątem objawów grypopodobnych (gorączka, bóle mięśni) przez około 48 h; monitoruj wapń; poinformuj rodziców o możliwości bólu kostnego i konieczności zgłoszenia się przy nietypowych objawach; długotrwałe leczenie może opóźniać wyrzynanie zębów.';
        }
      } else if(indication === 'osteoporoza'){
        if(drug === 'pamifos'){
          // Młodzieńcza osteoporoza: ogólnie 1 mg/kg/dzień przez 2–3 dni co 3–4 mies. – tu upraszczamy do 1 mg/kg na wlew
          mgPerKg = 1.0;
          infusionMinutes = 120;  // 2 h (może 2–4 h)
          intervalMonths = 3;
          maxAnnualDose = 12;
          maxSingleDose = 60;
          note = 'Pamidronian w osteoporozie: zwykle 1 mg/kg/dzień przez 2–3 dni co 3–4 miesiące; roczna dawka 9–12 mg/kg; pierwszą dawkę można zmniejszyć.';
          preInfo = 'Przed podaniem sprawdź i wyrównaj witaminę D, wapń, fosfor, kreatyninę oraz nawodnienie; w razie hipokalcemii odłóż leczenie; pierwszą dawkę zaleca się podać w warunkach szpitalnych.';
          postInfo = 'Po podaniu monitoruj parametry życiowe i stężenie wapnia; w razie wystąpienia objawów grypopodobnych zastosuj leczenie objawowe; po zakończeniu cyklu zaplanuj kolejny w ciągu 3 miesięcy.';
        } else if(drug === 'zomikos'){
          // Osteoporoza: dawka zależna od wieku (<2: 0.025 mg/kg; 2–5: 0.035; >5: 0.05), pierwsza dawka w połowie
          let baseDose;
          if(isNaN(age) || age < 2){
            baseDose = 0.025;
            intervalMonths = 3;
            infusionMinutes = 45;
          } else if(age < 5){
            baseDose = 0.035;
            intervalMonths = 4;
            infusionMinutes = 45;
          } else {
            baseDose = 0.05;
            intervalMonths = 6;
            infusionMinutes = 30;
          }
          mgPerKg = (doseType === 'first') ? baseDose / 2 : baseDose;
          maxAnnualDose = 0.1;
          maxSingleDose = age < 5 ? 2 : 4;
          note = 'Zoledronian w osteoporozie: dawka zależna od wieku (<2 lata: 0,025 mg/kg co 3 mies.; 2–5 lat: 0,035 mg/kg co 4 mies.; >5 lat: 0,05 mg/kg co 6 mies.); pierwsza dawka w połowie; nie przekraczaj 0,1 mg/kg/rok i łącznej dawki 2 mg (<5 lat) lub 4 mg (>5 lat).';
          preInfo = 'Przed wlewem oceń witaminę D, wapń, funkcję nerek; wyrównaj niedobory; zapewnij nawodnienie; pierwszą dawkę zaleca się podać w warunkach szpitalnych.';
          postInfo = 'Po podaniu monitoruj stężenie wapnia i obserwuj na wypadek reakcji grypopodobnej; poinformuj rodziców o konieczności zgłoszenia się przy gorączce, bólach kości lub innych objawach.';
        }
      } else if(indication === 'crmo'){
        if(drug === 'pamifos'){
          // CRMO: stosuje się 1 mg/kg wlew (czasami 3-dniowy lub miesięczny).  Tutaj przyjmujemy 1 mg/kg; pierwsza dawka zmniejszona.
          mgPerKg = (doseType === 'first') ? 0.5 : 1.0;
          infusionMinutes = 180;
          intervalMonths = 3; // można stosować co miesiąc; tu wybieramy 3 miesiące jako najczęściej opisywany schemat【32†L301-L309】
          maxAnnualDose = 12;
          maxSingleDose = 60;
          note = 'Pamidronian w CRMO: często podaje się 1 mg/kg jako wlew miesięczny lub 1 mg/kg/dzień przez 3 dni co 3 miesiące; pierwszą dawkę zmniejsza się do 0,5 mg/kg; nie przekraczaj 12 mg/kg/rok.';
          preInfo = 'Przed podaniem sprawdź stężenie witaminy D, wapnia, fosforu i kreatyniny; wyrównaj niedobory; pierwsze cykle powinny odbywać się w ośrodku specjalistycznym.';
          postInfo = 'Po podaniu monitoruj objawy ostrej reakcji (gorączka, ból kostny) i hipokalcemii; u większości dzieci dolegliwości bólowe ustępują po kilku infuzjach; w przypadku braku poprawy rozważ zmianę terapii.';
        } else if(drug === 'zomikos'){
          // CRMO: brak ustalonego schematu; przyjmujemy 0,025 mg/kg co 3–6 mies., pierwsza 0,0125 mg/kg
          mgPerKg = (doseType === 'first') ? 0.0125 : 0.025;
          infusionMinutes = 60;
          intervalMonths = 3; // zachowujemy częstsze podania dla bardziej agresywnego leczenia
          maxAnnualDose = 0.05; // przyjmujemy konserwatywnie 0,05 mg/kg/rok
          maxSingleDose = age < 5 ? 2 : 4;
          note = 'Zoledronian w CRMO: brak jednolitego protokołu – często stosuje się 0,025–0,05 mg/kg co 3–6 mies.; pierwszą dawkę zmniejsza się do 0,0125 mg/kg; nie przekraczaj 0,05 mg/kg/rok ani 2 mg (<5 lat) czy 4 mg (>5 lat) w jednym wlewie.';
          preInfo = 'Przed wlewem skontroluj poziom witaminy D, wapnia i czynność nerek; leczenie powinno być prowadzone w ośrodku specjalistycznym ze względu na ograniczone dane.';
          postInfo = 'Po podaniu obserwuj na wypadek hipokalcemii i reakcji grypopodobnej; monitoruj ból kości oraz aktywność zmian zapalnych; odstępy między dawkami można wydłużyć do 6 miesięcy w zależności od odpowiedzi klinicznej.';
        }
      }

      // Jeśli nie udało się ustalić dawki – brak danych
      if(!(mgPerKg > 0) || infusionMinutes <= 0 || intervalMonths <= 0){
        resultEl.innerHTML = '<p>Nie można obliczyć dawki – sprawdź wybrane ustawienia.</p>';
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
      // Wydłuż odstęp dla zoledronianu w terapii podtrzymującej przy długim leczeniu i braku złamań
      const fracture = fractureSelect && fractureSelect.value === 'yes';
      if(drug === 'zomikos' && doseType === 'maintenance' && !fracture && durationInput && durationInput.value){
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
      // Uwaga o złamaniach
      if(fracture){
        items.push('<strong>Uwaga:</strong> Zgłoszone złamania między dawkami mogą wskazywać na nieskuteczność terapii; rozważ konsultację specjalistyczną.');
      }
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
      resultEl.innerHTML = listHtml;
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
          } catch(e) {}
          card.style.display = 'block';
          this.classList.add('active-toggle');
          computeBisphos();
        }
        // Dopasuj szerokości przycisków po zmianie widoczności
        try {
          if(typeof adjustTestButtonWidths === 'function'){
            requestAnimationFrame(() => adjustTestButtonWidths());
          }
        } catch(e) {}
      });
    }

    // Aktualizuj widoczność pola czasu terapii przy zmianie leku
    if(drugSelect) drugSelect.addEventListener('change', () => {
      updateDurationVisibility();
      computeBisphos();
    });
    // Reakcja na zmiany pól wejściowych – aktualizuj obliczenia na bieżąco
    if(indicationSelect) indicationSelect.addEventListener('change', computeBisphos);
    if(weightInput) weightInput.addEventListener('input', computeBisphos);
    if(ageInput)    ageInput.addEventListener('input', computeBisphos);
    if(heightInput) heightInput.addEventListener('input', computeBisphos);
    if(doseSelect)  doseSelect.addEventListener('change', computeBisphos);
    if(durationInput)  durationInput.addEventListener('input', computeBisphos);
    if(fractureSelect) fractureSelect.addEventListener('change', computeBisphos);
    // Początkowa konfiguracja widoczności pola czasu terapii
    updateDurationVisibility();
  });
})();