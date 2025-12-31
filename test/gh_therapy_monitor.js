/*
 * gh_therapy_monitor.js
 *
 * Ten moduł dodaje funkcje monitorowania leczenia hormonem wzrostu/IGF‑1
 * do aplikacji DocPro. Umożliwia użytkownikowi zapisywanie punktów
 * „Włączenie leczenia”, „Kontynuacja leczenia” oraz „Zakończenie leczenia”.
 * Każdy punkt przechowuje bieżący wiek, wagę, wzrost, wiek kostny (jeżeli
 * został podany w karcie zaawansowanych obliczeń) oraz dawkę hormonu.
 * Zapisywane dane są przetrzymywane w localStorage pod kluczem
 * `ghTherapyPoints` oraz dołączane do eksportowanego pliku JSON jako
 * `ghTherapyPoints`.  Przy wczytywaniu pliku JSON lub wyczyszczeniu danych
 * lista punktów jest odtwarzana bądź czyszczona odpowiednio.
 */

(function(){
  /**
   * Wyświetla pełnoekranowe ostrzeżenie przed usunięciem punktu leczenia.
   * Użytkownik musi potwierdzić decyzję, aby punkt został faktycznie usunięty.
   * Jeśli użytkownik kliknie „Anuluj”, operacja jest przerywana.
   *
   * @param {string} id identyfikator punktu do usunięcia
   */
  function showDeleteConfirmOverlay(id){
    // Jeżeli istnieje już overlay usuwania, usuń go przed utworzeniem nowego
    const existing = document.getElementById('ghDeleteOverlay');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    // Utwórz kontener overlay – przykrywa całą stronę lekko przyciemnionym tłem
    const overlay = document.createElement('div');
    overlay.id = 'ghDeleteOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    // Półprzezroczyste tło zaciemniające – wykorzystujemy czarny z przezroczystością
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';
    // Utwórz okno modalne z komunikatem
    const modal = document.createElement('div');
    // Tło modalu zależy od aktywnego motywu – jeżeli istnieją zmienne CSS, użyj ich, inaczej kolor biały
    modal.style.background = getComputedStyle(document.documentElement).getPropertyValue('--card') || '#fff';
    // Kolor tekstu z motywu lub ciemny
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#111';
    modal.style.color = textColor;
    modal.style.padding = '1.5rem';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    modal.style.maxWidth = '90%';
    modal.style.width = '360px';
    modal.style.textAlign = 'center';
    // Nagłówek ostrzeżenia
    const header = document.createElement('strong');
    header.textContent = 'Czy na pewno usunąć punkt?';
    header.style.display = 'block';
    header.style.fontSize = '1.1rem';
    header.style.marginBottom = '0.6rem';
    header.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#c62828';
    // Treść ostrzeżenia
    const msg = document.createElement('p');
    msg.textContent = 'Usunięty punkt zostanie trwale usunięty z listy. Tego działania nie można cofnąć.';
    msg.style.fontSize = '1rem';
    msg.style.margin = '0 0 1.2rem';
    msg.style.lineHeight = '1.4';
    // Kontener na przyciski – rozmieszcza je obok siebie
    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '0.5rem';
    btnWrap.style.justifyContent = 'center';
    // Przycisk anulowania
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Anuluj';
    // Użyj klasy akcentowej, jeśli jest dostępna w motywie Liquid Glass – zapewnia spójny wygląd
    cancelBtn.classList.add('btn-accent');
    cancelBtn.style.padding = '0.5rem 1rem';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.style.border = 'none';
    cancelBtn.style.cursor = 'pointer';
    // Kolor tekstu zgodny z motywem, aby przycisk nie był czerwony jak potwierdzenie
    // Jeśli mamy zmienną tekstu, zostawiamy ją, w przeciwnym razie używamy domyślnego
    if (!cancelBtn.style.color || cancelBtn.style.color === '') {
      cancelBtn.style.color = textColor;
    }
    cancelBtn.addEventListener('click', () => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    // Przycisk potwierdzający usunięcie
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Usuń';
    confirmBtn.style.padding = '0.5rem 1rem';
    confirmBtn.style.borderRadius = '8px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.cursor = 'pointer';
    // Kolor tła: użyj zmiennej --danger (czerwony) jeśli dostępna, w innym wypadku domyślna wartość
    const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#c62828';
    confirmBtn.style.background = dangerColor;
    confirmBtn.style.color = '#fff';
    confirmBtn.addEventListener('click', () => {
      // Usuń punkt leczenia i zamknij overlay
      try {
        removeTherapyPoint(id);
      } catch(_) {
        /* ignoruj błędy */
      }
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    // Dodaj przyciski do kontenera
    btnWrap.appendChild(cancelBtn);
    btnWrap.appendChild(confirmBtn);
    // Złóż elementy modalu
    modal.appendChild(header);
    modal.appendChild(msg);
    modal.appendChild(btnWrap);
    overlay.appendChild(modal);
    // Dodaj overlay do dokumentu
    document.body.appendChild(overlay);
  }
  /**
   * Wyświetla pełnoekranową informację po wczytaniu danych do edycji.
   * Po kliknięciu przycisku zamykającego overlay zostaje usunięty z DOM.
   */
  function showEditInfoOverlay(){
    // Usuń istniejący overlay, jeśli występuje
    const existing = document.getElementById('ghEditOverlay');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    // Utwórz kontener overlay
    const overlay = document.createElement('div');
    overlay.id = 'ghEditOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';
    // Stwórz okno modalne
    const modal = document.createElement('div');
    modal.style.background = '#fff';
    modal.style.color = '#111';
    modal.style.padding = '1.5rem';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    modal.style.maxWidth = '90%';
    modal.style.width = '360px';
    modal.style.textAlign = 'center';
    // Nagłówek komunikatu
    const header = document.createElement('strong');
    // W trybie edycji chcemy zakomunikować użytkownikowi, że pracuje
    // nad istniejącym punktem, a nie wczytuje nowe dane. Nadajemy
    // bardziej profesjonalny tytuł.
    header.textContent = 'Edytujesz punkt leczenia';
    header.style.display = 'block';
    header.style.fontSize = '1.1rem';
    header.style.marginBottom = '0.6rem';
    // Treść komunikatu
    const msg = document.createElement('p');
    // Wskazujemy użytkownikowi, jak zakończyć edycję – należy wybrać
    // odpowiedni rodzaj wizyty, aby zapisać zmodyfikowane dane. Używamy
    // prostej, profesjonalnej formy.
    msg.textContent = 'Dane z wybranego punktu zostały wczytane do formularza. Wprowadź potrzebne zmiany, a następnie zapisz je, klikając odpowiedni przycisk określający rodzaj wizyty: Włączenie, Kontynuacja lub Zakończenie.';
    msg.style.fontSize = '1rem';
    msg.style.margin = '0 0 1rem';
    msg.style.lineHeight = '1.4';
    // Przycisk zamykający
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Rozumiem';
    // Dodaj klasę akcentową, jeśli istnieje stylizacja Liquid Glass
    closeBtn.classList.add('btn-accent');
    closeBtn.style.padding = '0.5rem 1rem';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    // Złóż elementy
    modal.appendChild(header);
    modal.appendChild(msg);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    // Dodaj overlay do dokumentu
    document.body.appendChild(overlay);
  }

  /**
   * Podświetla jeden z przycisków dodawania punktu terapii w zależności
   * od edytowanego typu wizyty.  Dodaje klasę `.gh-selected` do
   * odpowiedniego przycisku i usuwa tę klasę z pozostałych.  Jeżeli
   * przekazany typ jest pusty lub nieznany, wszystkie podświetlenia
   * zostają usunięte.
   *
   * @param {string} type Typ punktu: 'start', 'continue', 'end' lub null
   */
  function highlightTherapyButton(type){
    const ids = { start: 'btnGhStart', continue: 'btnGhContinue', end: 'btnGhEnd' };
    ['btnGhStart', 'btnGhContinue', 'btnGhEnd'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.classList.remove('gh-selected');
      }
    });
    if (type && ids[type]){
      const btn = document.getElementById(ids[type]);
      if (btn) {
        btn.classList.add('gh-selected');
      }
    }
  }

  /**
   * Wyświetla etykietę informującą użytkownika o trybie edycji punktu
   * i konieczności wyboru rodzaju wizyty do zapisania zmian.  Etykieta
   * pojawia się nad paskiem przycisków dodawania punktów.  Jeżeli etykieta
   * już istnieje, funkcja nic nie zmienia.
   */
  function showEditNotice(){
    const bar = document.getElementById('ghTherapyBtnBar');
    if (!bar) return;
    let notice = document.getElementById('ghEditNotice');
    if (!notice){
      notice = document.createElement('div');
      notice.id = 'ghEditNotice';
      notice.style.textAlign = 'center';
      // Używamy czerwonego koloru zbliżonego do tonu ostrzeżenia; var(--danger)
      // może nie być dostępne w stylu inline, dlatego wskazujemy konkretną wartość.
      notice.style.color = '#c62828';
      notice.style.marginBottom = '0.5rem';
      notice.style.fontSize = '0.9rem';
      notice.style.fontWeight = '500';
      // Profesjonalny komunikat dla użytkownika, opisujący krok końcowy w edycji.
      notice.textContent = 'Edycja punktu: po wprowadzeniu zmian wybierz odpowiedni rodzaj wizyty (Włączenie, Kontynuacja lub Zakończenie), aby zapisać zmodyfikowany punkt.';
      bar.parentNode.insertBefore(notice, bar);
    }
  }

  /**
   * Usuwa etykietę informującą o trybie edycji oraz resetuje podświetlenie
   * przycisków.  Funkcja wywoływana po zakończeniu zapisywania edytowanego
   * punktu lub przy anulowaniu edycji.
   */
  function hideEditNotice(){
    const notice = document.getElementById('ghEditNotice');
    if (notice && notice.parentNode){
      notice.parentNode.removeChild(notice);
    }
    // Usuń podświetlenie z przycisków
    highlightTherapyButton(null);
  }
  // Id identyfikujący punkt, który jest aktualnie edytowany.  Jeśli null,
  // nie trwa edycja żadnego rekordu.  Gdy jest ustawiony, renderowanie
  // tabeli wyróżni odpowiedni wiersz, a funkcja addTherapyPoint nadpisze
  // istniejący rekord zamiast tworzyć nowy.
  let currentEditingId = null;
  /**
   * Ładuje zapisane punkty leczenia z localStorage do zmiennej globalnej.
   * Jeżeli rekord nie istnieje lub wystąpi błąd parsowania, inicjuje pustą tablicę.
   */
  function loadTherapyPoints(){
    try {
      const raw = localStorage.getItem('ghTherapyPoints');
      window.ghTherapyPoints = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(window.ghTherapyPoints)) {
        window.ghTherapyPoints = [];
      }
    } catch (_) {
      window.ghTherapyPoints = [];
    }
  }

  /**
   * Zapisuje aktualną tablicę `ghTherapyPoints` do localStorage.
   */
  function saveTherapyPoints(){
    try {
      localStorage.setItem('ghTherapyPoints', JSON.stringify(window.ghTherapyPoints || []));
    } catch (_) {
      // ignoruj błędy związane z localStorage (np. quota exceeded)
    }
  }

  /**
   * Usuwa punkt leczenia o podanym identyfikatorze, aktualizuje zapis
   * i renderuje tabelę ponownie.
   * @param {string} id
   */
  function removeTherapyPoint(id){
    if (!Array.isArray(window.ghTherapyPoints)) return;
    window.ghTherapyPoints = window.ghTherapyPoints.filter(pt => String(pt.id) !== String(id));
    saveTherapyPoints();
    renderTherapyTable();
    // Usunięcie punktu może spowodować zakończenie trybu edycji – usuń etykietę
    try {
      hideEditNotice();
    } catch(_) {
      /* ignoruj błędy */
    }
  }

  /**
   * Inicjuje tryb edycji punktu leczenia.  Odszukuje punkt po identyfikatorze,
   * przenosi dane do formularzy wejściowych (wiek, waga, wzrost, wiek kostny,
   * dawka, preparat, program), usuwa punkt z listy i odświeża tabelę.
   * Użytkownik może następnie zmodyfikować wartości i ponownie dodać
   * punkt poprzez odpowiedni przycisk (W, K lub Z).
   *
   * @param {string} id identyfikator punktu do edycji
   */
  function editTherapyPoint(id){
    if (!Array.isArray(window.ghTherapyPoints)) return;
    const pt = window.ghTherapyPoints.find(p => String(p.id) === String(id));
    if (!pt) return;
    // Ustaw tryb edycji
    currentEditingId = id;
    // Jeśli karta terapii GH/IGF‑1 nie istnieje lub jest ukryta, spróbuj ją otworzyć.
    // Dzięki temu użytkownik nie musi najpierw ręcznie otwierać modułu terapii –
    // kliknięcie „Edytuj” automatycznie pokaże kartę, co umożliwia
    // wypełnienie odpowiednich pól.
    try {
      const therapyBtn = document.getElementById('toggleIgfTests');
      const therapyCard = document.getElementById('ghIgfTherapyCard');
      if (therapyBtn) {
        // Kliknij przycisk tylko wtedy, gdy karta nie istnieje lub jest ukryta
        if (!therapyCard || therapyCard.style.display === 'none') {
          therapyBtn.click();
        }
      }
    } catch (_) { /* ignoruj błędy */ }
    // wypełnij pola formularza danymi punktu – sekcja „Dane użytkownika”
    try {
      const ageEl = document.getElementById('age');
      if (ageEl) ageEl.value = pt.ageYears != null ? pt.ageYears : '';
      const ageMonthsEl = document.getElementById('ageMonths');
      if (ageMonthsEl) ageMonthsEl.value = pt.ageMonths != null ? pt.ageMonths : '';
      const weightEl = document.getElementById('weight');
      if (weightEl) {
        weightEl.value = pt.weight != null ? pt.weight : '';
        // Wyzwól zdarzenia wejściowe i zmiany, aby moduły reagowały na nową wagę
        try { weightEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
        try { weightEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      }
      const heightEl = document.getElementById('height');
      if (heightEl) heightEl.value = pt.height != null ? pt.height : '';
      const boneAgeEl = document.getElementById('advBoneAge');
      if (boneAgeEl) boneAgeEl.value = pt.boneAge != null ? pt.boneAge : '';
    } catch(_) { /* ignoruj błędy DOM */ }
    // wypełnij formularz terapii GH/IGF‑1 danymi punktu
    try {
      const progEl = document.getElementById('therProg');
      if (progEl && pt.program) {
        progEl.value = pt.program;
        // Wyzwól zdarzenie change, aby odświeżyć listę leków i domyślne dawki
        try { progEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      }
      const drugEl = document.getElementById('therDrug');
      if (drugEl && pt.drug) {
        drugEl.value = pt.drug;
        // Wyzwól zdarzenie change, aby zaktualizować ustawienia w zależności od leku
        try { drugEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      }
      const doseEl = document.getElementById('therDailyDose');
      if (doseEl) {
        if (pt.dose != null) {
          doseEl.value = pt.dose;
        } else {
          doseEl.value = '';
        }
      }
      // Oblicz dawkę absolutną (mg/d) i zapisz w polu therDailyDoseAbs, jeśli dostępne
      const doseAbsEl = document.getElementById('therDailyDoseAbs');
      if (doseAbsEl && pt.dose != null && pt.weight != null) {
        let doseVal = parseFloat(pt.dose);
        let weightVal = parseFloat(pt.weight);
        if (isFinite(doseVal) && isFinite(weightVal)) {
          let mgKgPerDay = doseVal;
          if (pt.doseUnit && pt.doseUnit.toLowerCase().includes('tydz')) {
            mgKgPerDay = doseVal / 7;
          }
          const mgPerDay = mgKgPerDay * weightVal;
          // Ustal liczbę miejsc po przecinku dla dawki absolutnej w zależności od leku
          const dec = (function(){
            // Funkcja pomocnicza analogiczna do mgPerDayDecimals w gh_igf_therapy.js
            const drugName = pt.drug || '';
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
          })();
          if (isFinite(mgPerDay)) {
            doseAbsEl.value = mgPerDay.toFixed(dec);
          }
        }
      }
      // Po ustawieniu dawek wyzwól zdarzenia wejściowe na polach dawki, aby odświeżyć obliczenia
      if (doseEl) {
        try { doseEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      }
      if (doseAbsEl) {
        try { doseAbsEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      }
    } catch(_) { /* ignoruj błędy DOM */ }
    // Zaktualizuj widok tabeli, aby zaznaczyć edytowany wiersz
    renderTherapyTable();
    // Pokaż komunikat informujący o załadowaniu danych do formularza
    try {
      showEditInfoOverlay();
    } catch(_) {
      /* jeśli nie powiodło się utworzenie overlay – ignoruj */
    }

    // Podświetl przycisk odpowiadający edytowanemu rodzajowi wizyty i
    // wyświetl etykietę informującą o trybie edycji.  W przypadku błędu
    // w którymkolwiek z tych etapów, kontynuujemy bez przerywania edycji.
    try {
      highlightTherapyButton(pt.type);
      showEditNotice();
    } catch(_) {
      /* ignoruj błędy podświetlania lub tworzenia etykiety */
    }
  }

  /**
   * Zwraca tekstową reprezentację rodzaju punktu.
   * @param {string} type
   * @returns {string}
   */
  /**
   * Zwraca skróconą reprezentację rodzaju punktu leczenia.
   * Wymagania użytkownika przewidują użycie pojedynczych liter:
   *  W – włączenie leczenia,
   *  K – kontynuacja leczenia,
   *  Z – zakończenie leczenia.
   * Jeśli typ jest nieznany, zwróć oryginalny identyfikator.
   *
   * @param {string} type
   * @returns {string}
   */
  function translateType(type){
    switch(type){
      case 'start': return 'W';      // Włączenie leczenia
      case 'continue': return 'K';   // Kontynuacja leczenia
      case 'end': return 'Z';        // Zakończenie leczenia
      default: return type;
    }
  }

  /**
   * Formatuje liczbę z podaną liczbą miejsc po przecinku i zamienia
   * kropkę dziesiętną na przecinek.  Utrzymuje liczbę miejsc po przecinku
   * niezależnie od zera kończącego, co odpowiada oczekiwaniom użytkownika.
   *
   * @param {number} value Wartość liczbowa
   * @param {number} decimals Liczba miejsc po przecinku
   * @returns {string}
   */
  function fmtNum(value, decimals){
    if (value == null || isNaN(value)) return '—';
    return Number(value).toFixed(decimals).replace('.', ',');
  }

  /**
   * Oblicza opis dawki w formacie „X mg = Y mg/kg/d”, gdzie X to dawka
   * bezwzględna na dobę (mg), a Y to dawka przeliczona na mg/kg/d.  Jeśli
   * dawka jest tygodniowa (mg/kg/tydz), zostaje przeliczona na dawkę
   * dzienną poprzez podzielenie przez 7.  W przypadku braku danych
   * dotyczących wagi lub dawki zwraca pauzę (—).
   *
   * @param {object} pt Obiekt punktu leczenia
   * @returns {string}
   */
  function formatDoseForDisplay(pt){
    if (!pt || pt.dose == null || pt.weight == null) return '—';
    let dosePerKgPerDay;
    const doseValue = parseFloat(pt.dose);
    if (!isFinite(doseValue)) return '—';
    // Jeśli jednostką jest mg/kg/tydz, przelicz na mg/kg/dzieląc przez 7
    if (pt.doseUnit && pt.doseUnit.toLowerCase().includes('tydz')) {
      dosePerKgPerDay = doseValue / 7;
    } else {
      dosePerKgPerDay = doseValue;
    }
    const weight = parseFloat(pt.weight);
    if (!isFinite(weight)) return '—';
    const dosePerDayMg = dosePerKgPerDay * weight;
    // Dawka bezwzględna podajemy z jednym miejscem po przecinku, mg/kg/d z trzema
    const absFormatted = fmtNum(dosePerDayMg, 1);
    const perKgFormatted = fmtNum(dosePerKgPerDay, 3);
    return `${absFormatted} mg = ${perKgFormatted} mg/kg/d`;
  }

  /**
   * Formatuje wiek podany jako lata i miesiące do postaci „X r Y mies.”.
   * @param {number} years Całkowita liczba lat (może zawierać część ułamkową)
   * @param {number} months Dodatkowe miesiące (0–11)
   * @returns {string}
   */
  function formatAge(years, months){
    // Przyjmujemy całkowite lata z części całkowitej
    const y = Math.floor(years || 0);
    // Jeżeli miesiące są jawnie przekazane, użyj ich; w przeciwnym razie oblicz z części ułamkowej
    let m;
    if (typeof months === 'number' && !isNaN(months)) {
      m = Math.round(months);
    } else {
      const frac = (years || 0) - y;
      m = Math.round(frac * 12);
    }
    // Zwróć wiek w formacie „X l. i Y m.” zgodnie z nowymi wymaganiami (lata i miesiące)
    return `${y}\u00a0l. i ${m}\u00a0m.`;
  }

  /**
   * Renderuje tabelę punktów leczenia w UI.  Odczytuje globalną tablicę
   * `ghTherapyPoints`, sortuje ją i wstawia wiersze do <tbody>.
   */
  function renderTherapyTable(){
    const tbody = document.getElementById('ghTherapyTbody');
    if(!tbody) return;
    // Wyczyść bieżącą zawartość
    tbody.innerHTML = '';
    if (!Array.isArray(window.ghTherapyPoints) || window.ghTherapyPoints.length === 0) {
      // Nie mamy punktów – pokaż placeholder
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.style.textAlign = 'center';
      td.style.padding = '0.8rem';
      td.textContent = 'Brak zapisanych punktów leczenia.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    // Skopiuj tablicę i posortuj: włączenie → kontynuacje (według wieku) → zakończenie
    const order = { start: 0, continue: 1, end: 2 };
    const pts = window.ghTherapyPoints.slice().sort((a, b) => {
      const oa = order[a.type] ?? 1;
      const ob = order[b.type] ?? 1;
      if (oa !== ob) return oa - ob;
      // sortuj po wieku (miesiące łączna); brak age traktuj jako 0
      const ta = (a.ageYears || 0) * 12 + (a.ageMonths || 0);
      const tb = (b.ageYears || 0) * 12 + (b.ageMonths || 0);
      return ta - tb;
    });
    pts.forEach(pt => {
      const tr = document.createElement('tr');
      // Jeżeli trwa edycja tego punktu, dodaj klasę wyróżniającą
      if (currentEditingId && String(pt.id) === String(currentEditingId)) {
        tr.classList.add('editing-gh-pt-row');
      }
      // Przygotuj wartości z przecinkiem jako separatorem dziesiętnym
      const weightStr = (pt.weight != null) ? fmtNum(pt.weight, 2) : '—';
      const heightStr = (pt.height != null) ? fmtNum(pt.height, 2) : '—';
      const boneAgeStr = (pt.boneAge != null) ? fmtNum(pt.boneAge, 2) : '—';
      const doseStr = formatDoseForDisplay(pt);
      // Sformatuj wiek w latach i miesiącach zgodnie z wymaganiem "X l. i Y m.".  
      // Używamy tutaj jawnie obliczenia zamiast polegać na funkcji formatAge(),
      // ponieważ starsza wersja mogła zwracać ciąg "X r Y mies.".  Liczbę lat
      // zaokrąglamy w dół, a miesiące przyjmujemy z ageMonths (0–11).  
      let ageDisplay = '—';
      if (pt.ageYears != null || pt.ageMonths != null) {
        const yVal = Math.floor(pt.ageYears || 0);
        let mVal;
        if (typeof pt.ageMonths === 'number' && !isNaN(pt.ageMonths)) {
          mVal = Math.round(pt.ageMonths);
        } else {
          const frac = (pt.ageYears || 0) - yVal;
          mVal = Math.round(frac * 12);
        }
        ageDisplay = `${yVal}\u00a0l. i ${mVal}\u00a0m.`;
      }
      tr.innerHTML = `
        <td>${translateType(pt.type)}</td>
        <td>${ageDisplay}</td>
        <td>${weightStr}</td>
        <td>${heightStr}</td>
        <td>${boneAgeStr}</td>
        <td>${doseStr}</td>
        <td>
          <button type="button" class="edit-gh-pt-btn" data-id="${pt.id}">Edytuj</button>
          <button type="button" class="delete-gh-pt-btn" data-id="${pt.id}">Usuń</button>
        </td>`;
      tbody.appendChild(tr);
    });
    // Podłącz obsługę usuwania
    tbody.querySelectorAll('.delete-gh-pt-btn').forEach(btn => {
      btn.addEventListener('click', function(ev){
        const id = this.getAttribute('data-id');
        // Zamiast natychmiast usuwać punkt, pokaż ostrzeżenie pełnoekranowe.  Użytkownik musi potwierdzić usunięcie.
        try {
          showDeleteConfirmOverlay(id);
        } catch(_) {
          // W razie błędu zachowaj dotychczasowe zachowanie usunięcia punktu
          removeTherapyPoint(id);
        }
      });
    });
    // Podłącz obsługę edycji
    tbody.querySelectorAll('.edit-gh-pt-btn').forEach(btn => {
      btn.addEventListener('click', function(ev){
        const id = this.getAttribute('data-id');
        if (typeof editTherapyPoint === 'function') {
          editTherapyPoint(id);
        }
      });
    });

    // Po wyrenderowaniu tabeli z punktami terapii oblicz i wyświetl metryki
    try {
      renderTherapyMetrics();
    } catch (_) {
      /* ignoruj błędy podczas obliczania metryk */
    }
  }

  /**
   * Oblicza metryki (hSDS i tempo wzrastania) dla zapisanych punktów terapii.
   * Metryki są sortowane chronologicznie po wieku dziecka. Dla każdego punktu
   * obliczamy absolutne wartości hSDS oraz tempa wzrastania, a także zmiany
   * względem pierwszego punktu (delta_base) oraz względem poprzedniej wizyty
   * (delta_prev). Zapisujemy wynik w globalnym window.ghTherapyMetrics.
   */
  function computeTherapyMetrics() {
    const pts = Array.isArray(window.ghTherapyPoints) ? window.ghTherapyPoints.slice() : [];
    // Sortuj po wieku (miesiące) rosnąco
    pts.sort((a, b) => {
      const ta = (a.ageYears || 0) * 12 + (a.ageMonths || 0);
      const tb = (b.ageYears || 0) * 12 + (b.ageMonths || 0);
      return ta - tb;
    });
    const metrics = [];
    if (pts.length === 0) {
      window.ghTherapyMetrics = metrics;
      return metrics;
    }
    // Pobierz płeć dziecka do obliczeń SDS
    let sex = 'M';
    try {
      const sexEl = document.getElementById('sex');
      sex = sexEl ? (sexEl.value || 'M') : 'M';
    } catch (_) {
      sex = 'M';
    }
    // Ustal funkcję obliczania SDS w zależności od źródła siatek centylowych
    let sdsFunc = null;
    try {
      // Wykorzystujemy te same reguły co w kalkulatorze zaawansowanym: dla Palczewskiej do 3 lat lub gdy użytkownik wybierze Palczewską
      const bmiSrc = (typeof window.bmiSource !== 'undefined') ? window.bmiSource : null;
      // Jeżeli Palczewska jest wymagana (dziecko <3 lat lub wybrano Palczewską), użyj odpowiedniej funkcji
      sdsFunc = function(height, ageY, param) {
        // Wiek w latach (dla Palczewskiej do 3 lat)
        if (bmiSrc === 'PALCZEWSKA' || (bmiSrc === 'OLAF' && ageY < (typeof OLAF_DATA_MIN_AGE !== 'undefined' ? OLAF_DATA_MIN_AGE : 3))) {
          if (typeof calcPercentileStatsPal === 'function') {
            const stats = calcPercentileStatsPal(height, sex, ageY, param);
            return (stats && typeof stats.sd === 'number') ? stats.sd : null;
          }
        }
        // Domyślnie użyj calcPercentileStats
        if (typeof calcPercentileStats === 'function') {
          const stats = calcPercentileStats(height, sex, ageY, param);
          return (stats && typeof stats.sd === 'number') ? stats.sd : null;
        }
        return null;
      };
    } catch (_) {
      // Fallback: nie udało się ustalić funkcji; z-score nie zostanie obliczony
      sdsFunc = null;
    }

    // Oblicz z‑score potencjału wzrostowego (mpSDS), które stanowi odniesienie
    // do wzrostu rodziców. W pierwszej kolejności staramy się skorzystać z
    // globalnego obiektu advancedGrowthData, jeśli jest dostępny – zawiera on
    // targetStats.sd wygenerowane w karcie „Zaawansowane obliczenia”.  Jeżeli
    // takie dane istnieją, przyjmujemy je jako mpSds.  W przeciwnym razie
    // przeliczamy mid‑parental height na Z‑score, korzystając ze wzrostu matki
    // i ojca (advMotherHeight oraz advFatherHeight). Do obliczeń używamy parametru
    // 'HT', aby zachować spójność z pozostałymi modułami.  W razie błędów mpSds
    // pozostanie null i kolumna hSDS – mpSDS będzie pusta.
    let mpSds = null;
    try {
      // 1) Spróbuj pobrać mpSDS z globalnego obiektu advancedGrowthData
      const agd = (typeof window !== 'undefined') ? window.advancedGrowthData : null;
      if (agd && agd.targetStats && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
        mpSds = agd.targetStats.sd;
      }
      // 2) Jeśli nie udało się pobrać z advancedGrowthData, spróbuj obliczyć z danych rodziców
      if (mpSds === null) {
        const motherEl = document.getElementById('advMotherHeight');
        const fatherEl = document.getElementById('advFatherHeight');
        // Odczytaj wzrost matki i ojca z pól formularza, jeżeli są dostępne.
        let mVal = motherEl ? parseFloat(motherEl.value) : NaN;
        let fVal = fatherEl ? parseFloat(fatherEl.value) : NaN;
        // Fallback: spróbuj pobrać z localStorage oraz ze wspólnego obiektu sharedUserData.
        try {
          // Osobne klucze advMotherHeight/advFatherHeight, jeśli istnieją.
          if (isNaN(mVal)) {
            const savedM = localStorage.getItem('advMotherHeight');
            if (savedM !== null) {
              const mv = parseFloat(savedM);
              if (!isNaN(mv)) mVal = mv;
            }
          }
          if (isNaN(fVal)) {
            const savedF = localStorage.getItem('advFatherHeight');
            if (savedF !== null) {
              const fv = parseFloat(savedF);
              if (!isNaN(fv)) fVal = fv;
            }
          }
          // Dane w obiekcie sharedUserData (zapisane przez userData.js)
          if (isNaN(mVal) || isNaN(fVal)) {
            const raw = localStorage.getItem('sharedUserData');
            if (raw) {
              try {
                const shared = JSON.parse(raw);
                if (isNaN(mVal) && shared && typeof shared.advMotherHeight !== 'undefined') {
                  const mv = parseFloat(shared.advMotherHeight);
                  if (!isNaN(mv)) mVal = mv;
                }
                if (isNaN(fVal) && shared && typeof shared.advFatherHeight !== 'undefined') {
                  const fv2 = parseFloat(shared.advFatherHeight);
                  if (!isNaN(fv2)) fVal = fv2;
                }
              } catch (_) {
                /* ignore JSON parse errors */
              }
            }
          }
        } catch (_) {
          /* Ignore localStorage errors */
        }
        let targetHeight = null;
        if (!isNaN(mVal) && !isNaN(fVal)) {
          if (sex === 'F') {
            // Dziewczynki: (wzrost taty − 13 + wzrost mamy) / 2
            targetHeight = ((fVal - 13) + mVal) / 2;
          } else {
            // Chłopcy: (wzrost mamy + 13 + wzrost taty) / 2
            targetHeight = ((mVal + 13) + fVal) / 2;
          }
        }
        if (targetHeight !== null && !isNaN(targetHeight) && typeof calcPercentileStats === 'function') {
          // Używamy parametru 'HT' aby pobrać LMS dla wzrostu (zgodne z innymi modułami)
          const ts = calcPercentileStats(targetHeight, sex, 18, 'HT');
          if (ts && typeof ts.sd === 'number' && isFinite(ts.sd)) {
            mpSds = ts.sd;
          }
        }
      }
    } catch (_) {
      // Pozostaw mpSds jako null w przypadku błędów
      mpSds = null;
    }
    // Pętla po punktach, obliczając hSDS, tempo i różnice
    let baseHsd = null;
    let baseGv = null;
    let baseDiff = null;
    let prevHsd = null;
    let prevGv = null;
    let prevDiff = null;
    let prevAgeM = null;
    let prevHeight = null;
    pts.forEach((pt, idx) => {
      // Wiek w miesiącach i latach
      const ageM = (pt.ageYears || 0) * 12 + (pt.ageMonths || 0);
      const ageY = (pt.ageYears != null) ? pt.ageYears : (ageM / 12);
      const hVal = pt.height;
      // hSDS
      let hSDS = null;
      if (hVal != null && isFinite(hVal) && sdsFunc) {
        hSDS = sdsFunc(hVal, ageY, 'HT');
      }
      // Tempo wzrastania (cm/rok) względem poprzedniego punktu
      let gv = null;
      if (idx > 0 && prevHeight != null && hVal != null && isFinite(hVal) && prevAgeM != null) {
        const diffH = hVal - prevHeight;
        const diffY = (ageM - prevAgeM) / 12;
        if (diffY > 0) {
          gv = diffH / diffY;
        }
      }
      // Zaktualizuj wartości bazowe
      if (baseHsd === null && hSDS !== null) baseHsd = hSDS;
      if (baseGv === null && gv !== null) baseGv = gv;
      // Oblicz różnice
      const deltaBaseH = (hSDS !== null && baseHsd !== null) ? (hSDS - baseHsd) : null;
      const deltaPrevH = (hSDS !== null && prevHsd !== null) ? (hSDS - prevHsd) : null;
      const deltaBaseG = (gv !== null && baseGv !== null) ? (gv - baseGv) : null;
      const deltaPrevG = (gv !== null && prevGv !== null) ? (gv - prevGv) : null;

      // Oblicz różnicę hSDS - mpSDS (hDiff).  Jeżeli obie wartości są dostępne,
      // hDiff jest różnicą z‑score dziecka i mid-parental.  Następnie oblicz
      // zmiany względem pierwszego i poprzedniego pomiaru.
      let hDiff = null;
      if (hSDS !== null && mpSds !== null) {
        hDiff = hSDS - mpSds;
      }
      if (baseDiff === null && hDiff !== null) baseDiff = hDiff;
      const deltaBaseDiff = (hDiff !== null && baseDiff !== null) ? (hDiff - baseDiff) : null;
      const deltaPrevDiff = (hDiff !== null && prevDiff !== null) ? (hDiff - prevDiff) : null;
      metrics.push({
        id: pt.id,
        ageYears: ageY,
        ageMonths: ageM,
        hSDS_abs: hSDS,
        hSDS_deltaBase: deltaBaseH,
        hSDS_deltaPrev: deltaPrevH,
        gv_abs: gv,
        gv_deltaBase: deltaBaseG,
        gv_deltaPrev: deltaPrevG
        , hDiff_abs: hDiff,
        hDiff_deltaBase: deltaBaseDiff,
        hDiff_deltaPrev: deltaPrevDiff
      });
      // Zaktualizuj poprzedni punkt
      if (hSDS !== null) prevHsd = hSDS;
      if (gv !== null) prevGv = gv;
      if (hDiff !== null) prevDiff = hDiff;
      prevAgeM = ageM;
      prevHeight = hVal;
    });
    window.ghTherapyMetrics = metrics;
    return metrics;
  }

  /**
   * Renderuje tabelę metryk hSDS i tempa wzrastania w sekcji
   * #ghTherapyMetricsSection. Funkcja oblicza metryki, buduje
   * wiersze i ustawia atrybuty danych potrzebne do przełączania
   * widoku (absolutny vs delta). Po wyrenderowaniu wywołuje
   * updateTherapyMetricsDisplay(), aby dostosować widok do
   * bieżącego wyboru w selektorze.
   */
  function renderTherapyMetrics() {
    const metrics = computeTherapyMetrics();
    const body = document.getElementById('ghTherapyMetricsBody');
    if (!body) return;
    // Wyczyść zawartość
    body.innerHTML = '';
    if (!metrics || metrics.length === 0) {
      // Brak metryk – ukryj sekcję
      const sec = document.getElementById('ghTherapyMetricsSection');
      if (sec) sec.style.display = 'none';
      return;
    }
    // Upewnij się, że sekcja jest widoczna
    const sec = document.getElementById('ghTherapyMetricsSection');
    if (sec) sec.style.display = '';
    // Utwórz wiersze
    metrics.forEach((m) => {
      const tr = document.createElement('tr');
      // Wiek w latach i miesiącach, np. "3 l. i 4 m.".  Korzystamy z ageMonths,
      // aby wyliczyć liczbę pełnych lat i pozostałych miesięcy.
      const ageCell = document.createElement('td');
      if (m.ageMonths != null && isFinite(m.ageMonths)) {
        const totalM = Math.round(m.ageMonths);
        const yrs = Math.floor(totalM / 12);
        const mons = totalM % 12;
        ageCell.textContent = `${yrs} l. i ${mons} m.`;
      } else {
        ageCell.textContent = '—';
      }
      tr.appendChild(ageCell);
      // hSDS
      const sdsCell = document.createElement('td');
      sdsCell.className = 'gh-metric-sds';
      sdsCell.dataset.abs = (m.hSDS_abs != null && isFinite(m.hSDS_abs)) ? m.hSDS_abs.toFixed(2) : '—';
      sdsCell.dataset.delta_base = (m.hSDS_deltaBase != null && isFinite(m.hSDS_deltaBase)) ? m.hSDS_deltaBase.toFixed(2) : '—';
      sdsCell.dataset.delta_prev = (m.hSDS_deltaPrev != null && isFinite(m.hSDS_deltaPrev)) ? m.hSDS_deltaPrev.toFixed(2) : '—';
      tr.appendChild(sdsCell);
      // Tempo
      const gvCell = document.createElement('td');
      gvCell.className = 'gh-metric-gv';
      gvCell.dataset.abs = (m.gv_abs != null && isFinite(m.gv_abs)) ? m.gv_abs.toFixed(2) : '—';
      gvCell.dataset.delta_base = (m.gv_deltaBase != null && isFinite(m.gv_deltaBase)) ? m.gv_deltaBase.toFixed(2) : '—';
      gvCell.dataset.delta_prev = (m.gv_deltaPrev != null && isFinite(m.gv_deltaPrev)) ? m.gv_deltaPrev.toFixed(2) : '—';
      tr.appendChild(gvCell);
      // hSDS - mpSDS
      const diffCell = document.createElement('td');
      diffCell.className = 'gh-metric-diff';
      diffCell.dataset.abs = (m.hDiff_abs != null && isFinite(m.hDiff_abs)) ? m.hDiff_abs.toFixed(2) : '—';
      diffCell.dataset.delta_base = (m.hDiff_deltaBase != null && isFinite(m.hDiff_deltaBase)) ? m.hDiff_deltaBase.toFixed(2) : '—';
      diffCell.dataset.delta_prev = (m.hDiff_deltaPrev != null && isFinite(m.hDiff_deltaPrev)) ? m.hDiff_deltaPrev.toFixed(2) : '—';
      tr.appendChild(diffCell);
      body.appendChild(tr);
    });
    // Zainicjalizuj obsługę selektora widoku jeśli jeszcze nie została utworzona
    const modeSelect = document.getElementById('ghTherapyViewMode');
    if (modeSelect) {
      // Ustaw wartość selektora z localStorage, jeśli istnieje
      try {
        const savedMode = localStorage.getItem('ghTherapyViewMode');
        if (savedMode && ['abs','delta_base','delta_prev'].includes(savedMode)) {
          modeSelect.value = savedMode;
        }
      } catch (_) { /* localStorage może być niedostępne */ }
      if (!modeSelect.dataset.listenerAttached) {
        modeSelect.addEventListener('change', () => {
          try {
            localStorage.setItem('ghTherapyViewMode', modeSelect.value);
          } catch (_) { /* ignoruj błędy zapisu */ }
          updateTherapyMetricsDisplay();
        });
        modeSelect.dataset.listenerAttached = 'true';
      }
    }
    // Zaktualizuj zawartość komórek zgodnie z bieżącym trybem
    updateTherapyMetricsDisplay();
  }

  /**
   * Aktualizuje treść komórek w tabeli metryk w zależności od wybranego
   * trybu (Absolutny, Delta od włączenia, Delta vs poprzednia). Dodatkowo
   * aktualizuje nagłówki kolumn, aby odzwierciedlały wybrany tryb.
   */
  function updateTherapyMetricsDisplay() {
    const modeSelect = document.getElementById('ghTherapyViewMode');
    const mode = modeSelect ? modeSelect.value : 'abs';
    // Aktualizuj nagłówki
    const hdrSds = document.getElementById('ghTherapyHeaderSDS');
    const hdrGv  = document.getElementById('ghTherapyHeaderGV');
    if (hdrSds) {
      if (mode === 'abs') hdrSds.textContent = 'hSDS';
      else if (mode === 'delta_base') hdrSds.textContent = 'ΔhSDS (od włączenia)';
      else hdrSds.textContent = 'ΔhSDS (vs poprzednia)';
    }
    if (hdrGv) {
      if (mode === 'abs') hdrGv.textContent = 'Tempo (cm/rok)';
      else if (mode === 'delta_base') hdrGv.textContent = 'ΔTempo (cm/rok)';
      else hdrGv.textContent = 'ΔTempo (cm/rok)';
    }

    // Aktualizuj nagłówek różnicy hSDS - mpSDS, jeśli istnieje.  Używamy
    // analogicznego schematu do hSDS: w trybie delta dodajemy symbol Δ
    // i opis typu zmiany.
    const hdrDiff = document.getElementById('ghTherapyHeaderDiff');
    if (hdrDiff) {
      if (mode === 'abs') hdrDiff.textContent = 'hSDS - mpSDS';
      else if (mode === 'delta_base') hdrDiff.textContent = 'Δ(hSDS - mpSDS) (od włączenia)';
      else hdrDiff.textContent = 'Δ(hSDS - mpSDS) (vs poprzednia)';
    }
    // Dla każdej komórki ustaw tekst na podstawie dataset
    document.querySelectorAll('#ghTherapyMetricsBody tr').forEach(tr => {
      const sdsCell = tr.querySelector('.gh-metric-sds');
      const gvCell  = tr.querySelector('.gh-metric-gv');
      const diffCell = tr.querySelector('.gh-metric-diff');
      if (sdsCell) {
        let val = sdsCell.dataset[mode] || '—';
        // Dodaj prefix Δ dla wartości delta (jeżeli jest liczbą)
        if (mode !== 'abs' && val !== '—' && !val.startsWith('Δ')) {
          // Dodaj znak plus do dodatnich wartości
          const n = parseFloat(val);
          if (!isNaN(n)) {
            const sign = (n > 0 ? '+' : '');
            val = `${sign}${val}`;
          }
          val = `Δ${val}`;
        }
        sdsCell.textContent = val;
      }
      if (gvCell) {
        let val = gvCell.dataset[mode] || '—';
        if (mode !== 'abs' && val !== '—' && !val.startsWith('Δ')) {
          const n = parseFloat(val);
          if (!isNaN(n)) {
            const sign = (n > 0 ? '+' : '');
            val = `${sign}${val}`;
          }
          val = `Δ${val}`;
        }
        gvCell.textContent = val;
      }

      // Różnica hSDS - mpSDS
      if (diffCell) {
        let val = diffCell.dataset[mode] || '—';
        if (mode !== 'abs' && val !== '—' && !val.startsWith('Δ')) {
          const n = parseFloat(val);
          if (!isNaN(n)) {
            const sign = (n > 0 ? '+' : '');
            val = `${sign}${val}`;
          }
          val = `Δ${val}`;
        }
        diffCell.textContent = val;
      }
    });
  }

  /**
   * Dodaje nowy punkt leczenia do tablicy.  Sprawdza podstawowe warunki
   * (np. czy istnieje już punkt włączenia lub zakończenia) i czy
   * wprowadzono wymagane dane (wiek, waga, wzrost, dawka).
   * @param {string} type Typ punktu: 'start', 'continue' lub 'end'
   */
  function addTherapyPoint(type){
    loadTherapyPoints();
    // Warunki logiczne: tylko jeden punkt start i jeden punkt end.  W trybie edycji
    // ignorujemy bieżący rekord (currentEditingId) przy sprawdzaniu unikalności.
    if (type === 'start') {
      const existsStart = window.ghTherapyPoints.some(pt => pt.type === 'start' && String(pt.id) !== String(currentEditingId));
      if (existsStart) {
        alert('Punkt „Włączenie leczenia” został już dodany.');
        return;
      }
    }
    if (type === 'end') {
      const existsEnd = window.ghTherapyPoints.some(pt => pt.type === 'end' && String(pt.id) !== String(currentEditingId));
      if (existsEnd) {
        alert('Punkt „Zakończenie leczenia” został już dodany.');
        return;
      }
    }
    if (type !== 'start') {
      // Upewnij się, że istnieje punkt start poza trybem edycji lub ten edytowany to start
      const hasStart = window.ghTherapyPoints.some(pt => pt.type === 'start') || (currentEditingId && (window.ghTherapyPoints.find(pt => String(pt.id) === String(currentEditingId))?.type === 'start'));
      if (!hasStart) {
        alert('Najpierw dodaj punkt włączenia leczenia.');
        return;
      }
    }
    // Pobierz aktualne wartości z formularza użytkownika
    const ageYears = parseFloat((document.getElementById('age') || {}).value);
    const ageMonthsVal = parseFloat((document.getElementById('ageMonths') || {}).value) || 0;
    const weight = parseFloat((document.getElementById('weight') || {}).value);
    const height = parseFloat((document.getElementById('height') || {}).value);
    // Wiek kostny z karty zaawansowanej; jeżeli pole nie istnieje lub jest puste, użyj null
    const boneAgeValRaw = (document.getElementById('advBoneAge') || {}).value;
    const boneAge = boneAgeValRaw !== '' && boneAgeValRaw !== undefined ? parseFloat(boneAgeValRaw) : null;
    // Dawka i preparat
    const doseInput = document.getElementById('therDailyDose');
    let dose = doseInput ? parseFloat(doseInput.value) : NaN;
    // Jeżeli dawka nie została wpisana, spróbuj z placeholdera
    if (!dose || isNaN(dose) || dose <= 0) {
      const placeholder = doseInput ? doseInput.getAttribute('placeholder') : null;
      dose = placeholder ? parseFloat(placeholder) : NaN;
    }
    const drugEl = document.getElementById('therDrug');
    const drug = drugEl ? drugEl.value : null;
    const progEl = document.getElementById('therProg');
    const program = progEl ? progEl.value : null;
    // Jednostka dawki: dla Ngenla (somatrogon) używamy mg/kg/tydz, w pozostałych przypadkach mg/kg/dobę
    let doseUnit = '';
    if (drug && /^Ngenla/.test(drug)) {
      doseUnit = 'mg/kg/tydz';
    } else {
      doseUnit = 'mg/kg/d';
    }
    // Walidacja minimalnych danych
    if (!isFinite(ageYears) || !isFinite(weight) || !isFinite(height) || !isFinite(dose)) {
      alert('Upewnij się, że wprowadziłeś poprawne dane: wiek, wagę, wzrost oraz dawkę.');
      return;
    }
    if (currentEditingId) {
      // Tryb edycji: znajdź istniejący punkt i zaktualizuj jego dane
      const idx = window.ghTherapyPoints.findIndex(pt => String(pt.id) === String(currentEditingId));
      if (idx >= 0) {
        const point = window.ghTherapyPoints[idx];
        point.type = type;
        point.ageYears = ageYears;
        point.ageMonths = ageMonthsVal;
        point.weight = weight;
        point.height = height;
        point.boneAge = (isFinite(boneAge) ? boneAge : null);
        point.dose = dose;
        point.doseUnit = doseUnit;
        point.drug = drug;
        point.program = program;
      } else {
        // Nie znaleziono punktu – dodaj jako nowy
        window.ghTherapyPoints.push({
          id: String(currentEditingId),
          type: type,
          ageYears: ageYears,
          ageMonths: ageMonthsVal,
          weight: weight,
          height: height,
          boneAge: (isFinite(boneAge) ? boneAge : null),
          dose: dose,
          doseUnit: doseUnit,
          drug: drug,
          program: program
        });
      }
      // Zakończ tryb edycji
      currentEditingId = null;
      // Ukryj etykietę edycji i usuń podświetlenie przycisków
      try {
        hideEditNotice();
      } catch(_) {
        /* ignoruj błędy */
      }
    } else {
      // Utwórz nowy punkt
      const point = {
        id: String(Date.now() + Math.random()),
        type: type,
        ageYears: ageYears,
        ageMonths: ageMonthsVal,
        weight: weight,
        height: height,
        boneAge: (isFinite(boneAge) ? boneAge : null),
        dose: dose,
        doseUnit: doseUnit,
        drug: drug,
        program: program
      };
      window.ghTherapyPoints.push(point);
    }
    saveTherapyPoints();
    renderTherapyTable();
  }

  /**
   * Tworzy i zwraca element HTML z kartą monitorowania terapii GH.
   * Karta zawiera nagłówek, opis, przyciski dodawania punktów oraz tabelę.
   * @returns {HTMLElement}
   */
  function createCard(){
    const div = document.createElement('section');
    div.id = 'ghTherapyMonitorCard';
    div.className = 'card';
    div.style.marginTop = '1rem';
    // Poczynkowo ukryj kartę; zostanie pokazana po umieszczeniu jej w DOM
    div.style.display = 'none';
    div.innerHTML = `
      <h2 style="text-align:center;">Monitorowanie leczenia hormonem wzrostu</h2>
      <p style="font-size:0.85rem; margin-top:0.3rem;">Dodaj punkty związane z leczeniem GH/IGF‑1 – włączenie, kolejne kontrole oraz zakończenie. Dane zostaną zapisane lokalnie i dołączone do pliku danych przy zapisie.</p>
      <div id="ghTherapyBtnBar" style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap; margin-top:0.6rem; margin-bottom:0.6rem;">
        <!-- Używamy atrybutu onclick, aby wywołać funkcję globalną. To obejście pozwala
             działać także wtedy, gdy dynamiczne modyfikacje strony przerywają
             zdarzenia rejestrowane w init(). -->
        <button type="button" id="btnGhStart" class="igf-btn" style="flex:1 1 auto; min-width:150px;" onclick="window.ghAddTherapyPoint && window.ghAddTherapyPoint('start')">Włączenie leczenia</button>
        <button type="button" id="btnGhContinue" class="igf-btn" style="flex:1 1 auto; min-width:150px;" onclick="window.ghAddTherapyPoint && window.ghAddTherapyPoint('continue')">Kontynuacja leczenia</button>
        <button type="button" id="btnGhEnd" class="igf-btn" style="flex:1 1 auto; min-width:150px;" onclick="window.ghAddTherapyPoint && window.ghAddTherapyPoint('end')">Zakończenie leczenia</button>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th><span style="display:block;white-space:normal;">Rodzaj<br/>wizyty</span></th>
              <th>Wiek</th>
              <th>Waga (kg)</th>
              <th>Wzrost (cm)</th>
              <th>Wiek kostny (lata)</th>
              <th>Dawka</th>
              <th>Usuń</th>
            </tr>
          </thead>
          <tbody id="ghTherapyTbody"></tbody>
        </table>
      </div>
      <!-- Sekcja wyników monitorowania (hSDS i tempo wzrastania) -->
      <div id="ghTherapyMetricsSection" style="margin-top:1rem;">
        <!-- Opis trybów widoku: wyjaśnia, co oznaczają poszczególne opcje poniżej. -->
        <p class="gh-therapy-view-desc" style="font-size:0.85rem; margin:0.4rem 0 0.6rem 0;">
          Wybierz sposób prezentacji danych: „Wartości bezwzględne” pokazują hSDS oraz tempo wzrastania w cm/rok,
          „Zmiana od włączenia” prezentuje różnice względem pierwszej wizyty,
          a „Zmiana vs poprzednia wizyta” – różnice między kolejnymi pomiarami.
        </p>
        <div class="view-mode" style="display:flex; gap:.6rem; align-items:center; margin:0.4rem 0 0.6rem 0;">
          <select id="ghTherapyViewMode" style="padding:6px 10px; border-radius:10px;">
            <option value="abs">Wartości bezwzględne (hSDS, tempo)</option>
            <option value="delta_base">Zmiana od włączenia (Δ od pierwszego pomiaru)</option>
            <option value="delta_prev">Zmiana vs poprzednia wizyta (Δ między wizytami)</option>
          </select>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Wiek</th>
                <th id="ghTherapyHeaderSDS">hSDS</th>
                <th id="ghTherapyHeaderGV">Tempo (cm/rok)</th>
                <th id="ghTherapyHeaderDiff">hSDS - mpSDS</th>
              </tr>
            </thead>
            <tbody id="ghTherapyMetricsBody"></tbody>
          </table>
        </div>
      </div>
    `;
    return div;
  }

  /**
   * Umieszcza kartę monitorowania w odpowiednim miejscu na stronie.  Jeżeli
   * istnieje karta „Leczenie hormonem wzrostu / IGF‑1” (#ghIgfTherapyCard),
   * karta monitorowania zostanie wstawiona tuż za nią.  W przeciwnym razie
   * jest dodawana do kontenera #doctorBottom jako ostatni element.
   * @param {HTMLElement} card
   */
  function placeCard(card){
    // Spróbuj znaleźć kartę GH/IGF i umieścić za nią
    const ghCard = document.getElementById('ghIgfTherapyCard');
    if (ghCard && ghCard.parentNode) {
      ghCard.parentNode.insertBefore(card, ghCard.nextSibling);
      // Nie pokazuj karty od razu – pozostaje ukryta do czasu wciśnięcia przycisku.
      return;
    }
    // W przeciwnym razie dodaj do doctorBottom
    const container = document.getElementById('doctorBottom');
    if (container) {
      container.appendChild(card);
      // Nie pokazuj karty od razu
    } else {
      // Jako ostateczny fallback dodaj do body
      document.body.appendChild(card);
      // Nie pokazuj karty od razu
    }
  }

  /**
   * Przenosi kartę monitorowania za kartę leczenia GH/IGF‑1, jeśli ta karta
   * została już utworzona w DOM.  Funkcja sprawdza, czy karta
   * monitorowania znajduje się bezpośrednio po karcie GH/IGF‑1; jeśli nie,
   * przemieszcza ją do odpowiedniego miejsca.  Dzięki temu, kiedy
   * użytkownik pierwszy raz otworzy kartę GH/IGF‑1, nasza karta
   * monitorowania zostanie do niej „doklejona”.
   */
  function repositionCardIfNeeded(){
    const monitorCard = document.getElementById('ghTherapyMonitorCard');
    const ghCard = document.getElementById('ghIgfTherapyCard');
    if (!monitorCard || !ghCard || !ghCard.parentNode) return;
    // W każdej sytuacji spróbuj wstawić przycisk do karty GH.  Jeżeli już
    // istnieje, funkcja nic nie zrobi.  To zapewnia, że przycisk będzie
    // dostępny nawet jeśli karta monitorowania znajduje się w odpowiednim
    // miejscu.
    injectMonitorToggleButton();
    // Jeśli nasza karta już znajduje się tuż po karcie GH, nie trzeba jej
    // ponownie przemieszczać.
    if (monitorCard.previousSibling === ghCard) return;
    try {
      ghCard.parentNode.insertBefore(monitorCard, ghCard.nextSibling);
    } catch(_){
      /* ignoruj ewentualne błędy przemieszczenia */
    }
  }

  /**
   * Tworzy i wstawia przycisk wyzwalający wyświetlanie karty monitorowania
   * leczenia hormonem wzrostu.  Przycisk jest umieszczany wewnątrz
   * karty „Leczenie hormonem wzrostu / IGF‑1” (#ghIgfTherapyCard) na samym
   * dole.  Po kliknięciu przycisku karta monitorowania jest przełączana
   * (pokazywana bądź ukrywana).  Funkcja dodaje niezbędne klasy, aby
   * przycisk stylistycznie nawiązywał do istniejących elementów UI.
   */
  function injectMonitorToggleButton(){
    try {
      const ghCard = document.getElementById('ghIgfTherapyCard');
      const monitorCard = document.getElementById('ghTherapyMonitorCard');
      if (!ghCard || !monitorCard) return;
      // Nie wstawiaj przycisku, jeśli już istnieje
      if (ghCard.querySelector('#toggleGhMonitor')) return;
      // Utwórz kontener, aby wyrównać przycisk do środka
      const wrapper = document.createElement('div');
      wrapper.id = 'ghMonitorBtnWrapper';
      wrapper.style.width = '100%';
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';
      wrapper.style.margin = '1rem 0';
      // Utwórz przycisk
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'toggleGhMonitor';
      // Dodaj klasy stylistyczne – igf-btn dla spójności oraz btn-icon i btn-accent dla stylu
      btn.classList.add('igf-btn');
      btn.classList.add('btn-icon');
      btn.classList.add('btn-accent');
      btn.textContent = 'Monitorowanie leczenia hormonem wzrostu';
      // Nasłuchuj kliknięcia w przycisk; przełącz widoczność karty
      btn.addEventListener('click', function(){
        // Jeśli monitorCard jest ukryty, pokaż go; w przeciwnym razie ukryj
        // Determine if the monitoring card is currently hidden.
        // Treat only explicit 'none' as hidden; an empty string ('') means the card
        // is visible and should not be interpreted as hidden again.  This
        // prevents the toggle from always displaying the card when the
        // display property is empty.
        const isHidden = monitorCard.style.display === 'none';
        if (isHidden) {
          // Show the card by clearing the display override
          monitorCard.style.display = '';
          // Add highlight class to indicate active state
          btn.classList.add('active-toggle');
        } else {
          // Hide the card by explicitly setting display to 'none'
          monitorCard.style.display = 'none';
          // Remove highlight class when the card is hidden
          btn.classList.remove('active-toggle');
        }
      });
      wrapper.appendChild(btn);
      // Wstaw kontener na końcu karty GH
      ghCard.appendChild(wrapper);
    } catch (e) {
      /* w razie błędu nie wstawiaj przycisku */
    }
  }

  /**
   * Inicjalizacja modułu: tworzy kartę, podłącza obsługę przycisków oraz
   * ładuje istniejące punkty leczenia.  Eksportuje funkcję
   * `refreshGHTherapyMonitor` w globalnym obiekcie window, tak aby
   * app.js mógł odświeżać tabelę po wczytaniu lub wyczyszczeniu danych.
   */
  function init(){
    loadTherapyPoints();
    const card = createCard();
    placeCard(card);
    // Podłącz obsługę przycisków
    // Przyciski są także podpięte poprzez atrybut onclick w createCard(), ale
    // dodatkowo rejestrujemy je tutaj przez addEventListener jako wsparcie,
    // gdyby atrybut onclick nie zadziałał lub element został zastąpiony w DOM.
    // Nie rejestruj dodatkowych nasłuchów kliknięcia na przyciski.  Korzystamy z
    // atrybutów onclick, które wywołują globalną funkcję ghAddTherapyPoint().
    // Gdybyśmy zarejestrowali tu dodatkowe handlery, naciśnięcie przycisku
    // spowodowałoby wielokrotne dodanie tego samego punktu.
    // Wyrenderuj początkową tabelę
    renderTherapyTable();
    // Udostępnij funkcję odświeżania na globalnym obiekcie, jeśli nie istnieje
    window.refreshGHTherapyMonitor = function(){
      loadTherapyPoints();
      renderTherapyTable();
    };

    // Udostępnij globalną funkcję dodawania punktu, której można użyć w atrybucie onclick
    window.ghAddTherapyPoint = function(type){
      addTherapyPoint(type);
    };

    // Nie używamy globalnego delegowanego listenera kliknięć; przyciski
    // obsługiwane są przez atrybut onclick.  Delegowanie mogłoby spowodować
    // powielanie zdarzeń (dodanie wielu punktów przy jednym kliknięciu).

    // Po inicjalizacji spróbuj natychmiast przemieścić kartę za kartę GH/IGF‑1,
    // jeżeli jest już obecna w DOM.  Może się zdarzyć, że użytkownik otworzy
    // moduł GH dopiero później – wówczas poniższy obserwator przeniesie kartę,
    // kiedy tylko karta GH zostanie utworzona.
    repositionCardIfNeeded();

    // Obserwuj zmiany w DOM, aby wykryć pojawienie się karty GH/IGF‑1 i
    // przesunąć za nią naszą kartę monitorowania.  Używamy MutationObservera
    // do monitorowania struktury DOM (dodawanie węzłów) w całym dokumencie.
    const obs = new MutationObserver((mutationsList) => {
      for (const mut of mutationsList) {
        if (!mut.addedNodes) continue;
        for (const node of mut.addedNodes) {
          if (node && node.nodeType === 1) {
            // Sprawdź, czy dodano kartę GH lub kontener ją zawierający
            if (node.id === 'ghIgfTherapyCard' || node.querySelector && node.querySelector('#ghIgfTherapyCard')) {
              // Po krótkim opóźnieniu (render + style) przemieść kartę
              setTimeout(() => { repositionCardIfNeeded(); }, 0);
              return;
            }
          }
        }
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch(_) {
      /* ignoruj błędy w obserwacji (np. brak dostępu) */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM jest już załadowany
    init();
  }
})();