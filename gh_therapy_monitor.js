




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
  // Define a list of available GH/IGF drugs for the editing interface.  This
  // duplicates definitions from gh_igf_therapy.js to avoid a hard
  // dependency between modules.  Should additional drugs be added in the
  // therapy module, update this list accordingly.
  const GH_DRUGS_EDIT = ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg','Ngenla 24 mg','Ngenla 60 mg'];
  const IGF_DRUGS_EDIT = ['Increlex 40 mg'];
  /**
   * Map a therapeutic program to its allowed drugs.  These defaults mirror
   * the mappings in gh_igf_therapy.js, ensuring only valid combinations
   * appear in the editing interface.  Programs not listed here will
   * default to all drugs.
   */
  const DRUGS_BY_PROGRAM_EDIT = {
    'SNP':   ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg'],
    'PNN':   ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg'],
    'SGA':   ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg'],
    'ZT':    ['Genotropin 5,3 mg','Genotropin 12 mg','Omnitrope 5 mg','Omnitrope 10 mg'],
    'PWS':   ['Genotropin 5,3 mg','Genotropin 12 mg','Omnitrope 5 mg','Omnitrope 10 mg'],
    'IGF-1': ['Increlex 40 mg']
  };

  /**
   * ==============================
   *  IndexedDB and BroadcastChannel support
   *
   *  Aby odejść od localStorage, wprowadzamy obsługę IndexedDB oraz
   *  BroadcastChannel.  Dane terapii GH/IGF są zapisywane w osobnej bazie
   *  `ghTherapyDB` w sklepie `ghTherapyPoints` z kluczem głównym `id`.
   *  Po każdej aktualizacji danych (dodanie, edycja, usunięcie) zapisujemy
   *  punkty do bazy oraz wysyłamy komunikat przez kanał "gh-therapy-sync".
   *  W przeciwieństwie do localStorage, IndexedDB jest asynchroniczna,
   *  dlatego operacje zapisu są wykonywane w tle, a ewentualne błędy są
   *  ignorowane.  BroadcastChannel służy do powiadamiania innych zakładek
   *  o zmianach, aby mogły one zaktualizować dane bez odświeżania strony.
   */

  // Nazwy bazy i sklepu dla punktów terapii
  const GH_DB_NAME = 'ghTherapyDB';
  const GH_STORE_NAME = 'ghTherapyPoints';

  /**
   * Otwiera (lub tworzy) bazę IndexedDB do zapisu punktów terapii.
   * Jeśli baza nie istnieje, w trakcie upgrade'u tworzony jest sklep
   * z kluczem głównym `id`.  Funkcja zwraca Promise rozwiązany z
   * obiektem IDBDatabase lub odrzucony w przypadku błędu.
   * @returns {Promise<IDBDatabase>}
   */
  function openTherapyDB(){
    return new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined') {
          return reject(new Error('IndexedDB not available'));
        }
        const req = indexedDB.open(GH_DB_NAME, 1);
        req.onupgradeneeded = function(ev){
          const db = ev.target.result;
          // Utwórz sklep, jeśli nie istnieje
          if (!db.objectStoreNames.contains(GH_STORE_NAME)) {
            db.createObjectStore(GH_STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = function(ev){
          resolve(ev.target.result);
        };
        req.onerror = function(ev){
          reject(ev.target.error);
        };
      } catch(err) {
        reject(err);
      }
    });
  }

  /**
   * Czyści istniejące rekordy i zapisuje przekazane punkty do bazy.
   * Operacja jest wykonywana asynchronicznie.  W przypadku niepowodzenia
   * błąd jest ignorowany, ponieważ localStorage nadal przechowuje kopię.
   * @param {Array<Object>} pts tablica punktów terapii
   */
  async function saveTherapyPointsToDB(pts){
    try {
      const db = await openTherapyDB();
      const tx = db.transaction(GH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GH_STORE_NAME);
      // Wyczyść istniejące dane
      await new Promise((res, rej) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => res();
        clearReq.onerror = () => rej(clearReq.error);
      });
      if (Array.isArray(pts)) {
        for (const pt of pts) {
          // Używamy put, aby zastąpić istniejące rekordy o tym samym id
          await new Promise((res, rej) => {
            const putReq = store.put(pt);
            putReq.onsuccess = () => res();
            putReq.onerror = () => rej(putReq.error);
          });
        }
      }
      // Zakończ transakcję
      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch(_) {
      // Błędy są ignorowane – localStorage nadal przechowuje kopię
    }
  }

  // Utwórz kanał BroadcastChannel do synchronizacji z innymi zakładkami.
  const ghTherapyBroadcastChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('gh-therapy-sync') : null;
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
    /*
     * Nie używamy klasy `.btn-accent` dla przycisku anulowania.  Zamiast tego
     * stylujemy go neutralnie: jasne tło, delikatna ramka i kolor tekstu
     * zgodny z motywem.  Dzięki temu przycisk „Anuluj” nie wygląda jak
     * główny przycisk akcji i jest wyraźnie odróżniony od czerwonego
     * przycisku potwierdzającego.
     */
    cancelBtn.style.padding = '0.5rem 1rem';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.style.cursor = 'pointer';
    // Jasne tło – użyj koloru karty lub domyślnego białego, co zapewnia
    // kontrast na przyciemnionym overlayu.
    const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff';
    cancelBtn.style.background = cardBg;
    // Delikatna ramka, aby przycisk był widoczny na różnych tłach
    cancelBtn.style.border = '1px solid #ccc';
    // Kolor tekstu zgodny z motywem; tekstColor został obliczony wcześniej
    cancelBtn.style.color = textColor;
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
    // Zachowaj kopię w localStorage (dla wstecznej kompatybilności)
    try {
      localStorage.setItem('ghTherapyPoints', JSON.stringify(window.ghTherapyPoints || []));
    } catch (_) {
      // ignoruj błędy związane z localStorage (np. quota exceeded)
    }
    // Asynchronicznie zapisz punkty do IndexedDB i poinformuj inne zakładki
    try {
      // saveTherapyPointsToDB zwraca Promise; nie czekamy na wynik, aby nie blokować UI
      saveTherapyPointsToDB(window.ghTherapyPoints || []).then(() => {
        // Wyślij komunikat tylko po udanym zapisie
        if (ghTherapyBroadcastChannel) {
          try {
            ghTherapyBroadcastChannel.postMessage({ type: 'update' });
          } catch (_) {
            /* ignoruj błędy kanału */
          }
        }
      }).catch(() => {
        // W przypadku błędu zapisu nadal spróbuj powiadomić
        if (ghTherapyBroadcastChannel) {
          try {
            ghTherapyBroadcastChannel.postMessage({ type: 'update' });
          } catch (_) {
            /* ignoruj błędy */
          }
        }
      });
    } catch(_) {
      // ignoruj błędy zapisu
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
    // W poprzedniej wersji dane punktu były wczytywane do pól formularza Dane użytkownika oraz
    // karty terapii GH/IGF‑1.  To powodowało konflikt synchronizacji z innymi częściami
    // aplikacji.  Zamiast tego wypełniamy lokalny formularz edycji w karcie monitorowania
    // oraz odświeżamy pola programu i preparatu tylko w obrębie terapii.  
    try {
      // Pokaż lokalny formularz edycji
      const editContainer = document.getElementById('ghTherapyEditContainer');
      if (editContainer) {
        editContainer.style.display = '';
      }
      // Wypełnij pola lokalnego formularza danymi punktu
      const ageInput = document.getElementById('ghEditAge');
      if (ageInput) ageInput.value = pt.ageYears != null ? pt.ageYears : '';
      const ageMonthsInput = document.getElementById('ghEditAgeMonths');
      if (ageMonthsInput) ageMonthsInput.value = pt.ageMonths != null ? pt.ageMonths : '';
      const weightInput = document.getElementById('ghEditWeight');
      if (weightInput) weightInput.value = pt.weight != null ? pt.weight : '';
      const heightInput = document.getElementById('ghEditHeight');
      if (heightInput) heightInput.value = pt.height != null ? pt.height : '';
      const boneAgeInput = document.getElementById('ghEditBoneAge');
      if (boneAgeInput) boneAgeInput.value = (pt.boneAge != null ? pt.boneAge : '');
      const doseInput = document.getElementById('ghEditDose');
      if (doseInput) doseInput.value = pt.dose != null ? pt.dose : '';
      // Preparat: wypełnij listę preparatów w zależności od programu
      const drugSelect = document.getElementById('ghEditDrug');
      if (drugSelect) {
        // Usuń istniejące opcje
        while (drugSelect.firstChild) {
          drugSelect.removeChild(drugSelect.firstChild);
        }
        // Ustal dostępne leki w zależności od programu.  Jeśli brak mapowania, użyj pełnej listy.
        let available = [];
        if (pt.program && DRUGS_BY_PROGRAM_EDIT[pt.program]) {
          available = DRUGS_BY_PROGRAM_EDIT[pt.program];
        } else {
          available = GH_DRUGS_EDIT.concat(IGF_DRUGS_EDIT);
        }
        available.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          drugSelect.appendChild(opt);
        });
        if (pt.drug) {
          drugSelect.value = pt.drug;
        }
      }
      // Ustaw program w select therProg w karcie terapii i zablokuj jego zmianę
      const progEl = document.getElementById('therProg');
      if (progEl && pt.program) {
        progEl.value = pt.program;
        // Zablokuj zmianę programu, aby użytkownik nie mógł go modyfikować po zapisie punktu start
        progEl.disabled = true;
        // Nie wyzwalamy zdarzeń change, aby nie synchronizować z innymi modułami
      }
      // Ustaw preparat w select therDrug w karcie terapii, ale nie wyzwalaj zdarzenia change
      const drugEl = document.getElementById('therDrug');
      if (drugEl && pt.drug) {
        drugEl.value = pt.drug;
      }
      // Ustaw pola dawki w formularzu terapii GH/IGF‑1, bez wyzwalania zdarzeń
      const doseEl = document.getElementById('therDailyDose');
      if (doseEl) {
        doseEl.value = pt.dose != null ? pt.dose : '';
      }
      const doseAbsEl = document.getElementById('therDailyDoseAbs');
      if (doseAbsEl && pt.dose != null && pt.weight != null) {
        // Oblicz dawkę absolutną (mg/d) dla podglądu w karcie terapii
        let doseVal = parseFloat(pt.dose);
        let weightVal = parseFloat(pt.weight);
        if (isFinite(doseVal) && isFinite(weightVal)) {
          let mgKgPerDay = doseVal;
          if (pt.doseUnit && pt.doseUnit.toLowerCase().includes('tydz')) {
            mgKgPerDay = doseVal / 7;
          }
          const mgPerDay = mgKgPerDay * weightVal;
          const dec = (function(){
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
    // Ustal dawkę bezwzględną (mg/d): jeżeli została wcześniej zapisana w
    // obiekcie punktu (doseAbs), użyj jej.  W przeciwnym wypadku
    // oblicz z bieżących wartości.  To zapewnia spójność z wartością
    // widoczną w karcie terapii (therDailyDoseAbs) i eliminuje błąd
    // zaokrąglania w dół (np. 1,27 mg/d zamiast 1,25 mg/d).
    let dosePerDayMg;
    if (pt && pt.doseAbs != null && isFinite(pt.doseAbs)) {
      dosePerDayMg = parseFloat(pt.doseAbs);
    } else {
      dosePerDayMg = dosePerKgPerDay * weight;
    }
    // Dobierz liczbę miejsc po przecinku dla dawki bezwzględnej (mg/d)
    let absDec;
    switch ((pt.drug || '').trim()) {
      case 'Genotropin 12 mg':
        absDec = 2;
        break;
      case 'Omnitrope 10 mg':
        absDec = 1;
        break;
      case 'Omnitrope 5 mg':
      case 'Genotropin 5,3 mg':
        absDec = 2;
        break;
      default:
        absDec = 3;
    }
    const absFormatted = fmtNum(dosePerDayMg, absDec);
    // Dawka mg/kg/d pozostaje wyświetlana z trzema miejscami po przecinku
    const perKgFormatted = fmtNum(dosePerKgPerDay, 3);
    return `${absFormatted} mg/d = ${perKgFormatted} mg/kg/d`;
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
      // Zaktualizowana liczba kolumn: rodzaj wizyty, wiek, waga, wzrost, wiek kostny, preparat, dawka, usuń
      td.colSpan = 8;
      td.style.textAlign = 'center';
      td.style.padding = '0.8rem';
      td.textContent = 'Brak zapisanych punktów leczenia.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      // Aktualizujemy również sekcję metryk: brak punktów oznacza ukrycie tabeli
      try {
        renderTherapyMetrics();
      } catch (_) {
        /* ignoruj błędy podczas aktualizacji metryk */
      }
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
    // Jeśli istnieje punkt włączenia, wyświetl wiersz z nazwą programu na początku tabeli.
    if (pts.length > 0) {
      // Znajdź program z punktu włączenia (start) lub pierwszego punktu, jeśli brak start.
      let programName = null;
      for (const p of pts) {
        if (p.type === 'start') {
          programName = p.program;
          break;
        }
      }
      if (!programName && pts[0]) {
        programName = pts[0].program;
      }
      if (programName) {
        const progTr = document.createElement('tr');
        progTr.classList.add('gh-program-row');
        const progTd = document.createElement('td');
        // Wszystkie kolumny w tabeli: 8 (rodzaj wizyty + wiek + waga + wzrost + wiek kostny + preparat + dawka + akcje)
        progTd.colSpan = 8;
        progTd.style.fontWeight = '600';
        progTd.style.background = 'var(--card, #f3f3f3)';
        progTd.style.textAlign = 'left';
        progTd.style.padding = '0.5rem';
        progTd.textContent = 'Program terapeutyczny: ' + programName;
        progTr.appendChild(progTd);
        tbody.appendChild(progTr);
      }
    }

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
        <td>${pt.drug ? pt.drug : '—'}</td>
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

    // Ustal, czy istnieją zapisane punkty terapii.  Jeżeli tak, zablokuj zmianę
    // programu w formularzu terapii GH/IGF‑1.  Program jest trwały i odpowiada
    // temu wybranemu przy pierwszym zapisanym punkcie.  Dzięki temu po
    // wczytaniu danych program pozostaje nieedytowalny, niezależnie od typu
    // pierwszego punktu.  Jeżeli brak jakichkolwiek punktów, pole programu
    // pozostaje odblokowane.
    try {
      const progEl = document.getElementById('therProg');
      if (progEl) {
        const hasPoints = pts.length > 0;
        if (hasPoints) {
          // Określ nazwę programu z punktu włączenia lub z pierwszego punktu
          let programName = null;
          const startPtForProg = pts.find(p => p.type === 'start');
          if (startPtForProg && startPtForProg.program) {
            programName = startPtForProg.program;
          } else if (pts[0] && pts[0].program) {
            programName = pts[0].program;
          }
          if (programName) {
            progEl.value = programName;
          }
          // Zablokuj możliwość zmiany programu
          progEl.disabled = true;
        } else {
          // Nie ma zapisanych punktów – pozwól na wybór programu
          progEl.disabled = false;
        }
      }
    } catch(_) {
      /* ignoruj błędy */
    }

    // Po wyrenderowaniu tabeli z punktami terapii oblicz i wyświetl metryki
    try {
      renderTherapyMetrics();
    } catch (_) {
      /* ignoruj błędy podczas obliczania metryk */
    }
    // Synchronizuj wiersze pomiarowe w sekcji „Zaawansowane obliczenia wzrostowe” z zapisanymi punktami terapii.
    // Dodaje lub aktualizuje wiersze odpowiadające punktom leczenia (wiek, wzrost, waga).
    try {
      if (typeof syncTherapyToAdvancedGrowth === 'function') {
        syncTherapyToAdvancedGrowth();
      }
    } catch(_) {
      /* ignoruj błędy synchronizacji */
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
      // Wiek w miesiącach i latach.  Używamy pełnego wieku dziesiętnego,
      // czyli (lata + miesiące/12), aby zachować spójność z obliczeniami na stronie głównej.
      // Poprzednio stosowano całkowity wiek (ageYears), co powodowało zaniżenie wieku
      // o część miesięcy i w konsekwencji różnicę w hSDS oraz hSDS - mpSDS.
      const ageM = (pt.ageYears || 0) * 12 + (pt.ageMonths || 0);
      const ageY = ageM / 12;
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
    // Pobierz wartości z odpowiednich formularzy.  Podczas edycji używamy
    // lokalnego formularza z karty monitorowania, w pozostałych sytuacjach
    // korzystamy z pól w karcie użytkownika.
    let ageYears, ageMonthsVal, weight, height, boneAge, dose, drug, program;
    if (currentEditingId) {
      // Dane w trybie edycji: pobierz z lokalnego formularza
      const ageInput = document.getElementById('ghEditAge');
      ageYears = ageInput ? parseFloat(ageInput.value) : NaN;
      const ageMonthsInput = document.getElementById('ghEditAgeMonths');
      ageMonthsVal = ageMonthsInput ? (parseFloat(ageMonthsInput.value) || 0) : 0;
      const weightInput = document.getElementById('ghEditWeight');
      weight = weightInput ? parseFloat(weightInput.value) : NaN;
      const heightInput = document.getElementById('ghEditHeight');
      height = heightInput ? parseFloat(heightInput.value) : NaN;
      const boneAgeInput = document.getElementById('ghEditBoneAge');
      const boneAgeRaw = boneAgeInput ? boneAgeInput.value : '';
      boneAge = boneAgeRaw !== '' && boneAgeRaw !== undefined ? parseFloat(boneAgeRaw) : null;
      const doseInputLocal = document.getElementById('ghEditDose');
      dose = doseInputLocal ? parseFloat(doseInputLocal.value) : NaN;
      // Preparat i program z lokalnego edytora – program jest ustalony na podstawie wybranego programu w karcie terapii; preparat pobieramy z selecta w edytorze
      const drugSel = document.getElementById('ghEditDrug');
      drug = drugSel ? drugSel.value : null;
      // Podczas edycji program zawsze odpowiada programowi zapisanemu w punktach i zablokowanemu w therProg
      const progSel = document.getElementById('therProg');
      program = progSel ? progSel.value : null;
    } else {
      // Nowy punkt: pobierz z formularza użytkownika
      ageYears = parseFloat((document.getElementById('age') || {}).value);
      ageMonthsVal = parseFloat((document.getElementById('ageMonths') || {}).value) || 0;
      weight = parseFloat((document.getElementById('weight') || {}).value);
      height = parseFloat((document.getElementById('height') || {}).value);
      const boneAgeValRaw = (document.getElementById('advBoneAge') || {}).value;
      boneAge = boneAgeValRaw !== '' && boneAgeValRaw !== undefined ? parseFloat(boneAgeValRaw) : null;
      const doseInput = document.getElementById('therDailyDose');
      dose = doseInput ? parseFloat(doseInput.value) : NaN;
      // Jeżeli dawka nie została wpisana, spróbuj z placeholdera
      if (!dose || isNaN(dose) || dose <= 0) {
        const placeholder = doseInput ? doseInput.getAttribute('placeholder') : null;
        dose = placeholder ? parseFloat(placeholder) : NaN;
      }
      const drugEl = document.getElementById('therDrug');
      drug = drugEl ? drugEl.value : null;
      const progEl = document.getElementById('therProg');
      program = progEl ? progEl.value : null;
    }
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
        // Oblicz lub odczytaj dawkę bezwzględną (mg/d) – pobierz z pola therDailyDoseAbs, jeśli istnieje
        try {
          const doseAbsField = document.getElementById('therDailyDoseAbs');
          let doseAbsVal = null;
          if (doseAbsField && doseAbsField.value !== '' && !isNaN(parseFloat(doseAbsField.value))) {
            doseAbsVal = parseFloat(doseAbsField.value);
          }
          if (doseAbsVal == null && isFinite(dose) && isFinite(weight)) {
            // Oblicz mg/kg/d na dobę, przeliczając jednostkę tygodniową, jeśli dotyczy
            let mgKgPerDay = dose;
            if (doseUnit && doseUnit.toLowerCase().includes('tydz')) {
              mgKgPerDay = dose / 7;
            }
            doseAbsVal = mgKgPerDay * weight;
          }
          point.doseAbs = (doseAbsVal != null && isFinite(doseAbsVal)) ? doseAbsVal : undefined;
        } catch(_) {
          point.doseAbs = undefined;
        }
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
          program: program,
          // Dodaj dawkę bezwzględną (mg/d), korzystając z pola therDailyDoseAbs lub przeliczając z dawki/kg
          doseAbs: (function(){
            try {
              const doseAbsField = document.getElementById('therDailyDoseAbs');
              let val = null;
              if (doseAbsField && doseAbsField.value !== '' && !isNaN(parseFloat(doseAbsField.value))) {
                val = parseFloat(doseAbsField.value);
              }
              if (val == null && isFinite(dose) && isFinite(weight)) {
                let mgKgPerDay = dose;
                if (doseUnit && doseUnit.toLowerCase().includes('tydz')) {
                  mgKgPerDay = dose / 7;
                }
                val = mgKgPerDay * weight;
              }
              return (val != null && isFinite(val)) ? val : undefined;
            } catch(_) {
              return undefined;
            }
          })()
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
      // Ukryj lokalny formularz edycji po zapisaniu zmian
      try {
        const editContainer = document.getElementById('ghTherapyEditContainer');
        if (editContainer) editContainer.style.display = 'none';
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
      // Oblicz dawkę bezwzględną (mg/d) i przypisz do punktu
      try {
        const doseAbsField = document.getElementById('therDailyDoseAbs');
        let val = null;
        if (doseAbsField && doseAbsField.value !== '' && !isNaN(parseFloat(doseAbsField.value))) {
          val = parseFloat(doseAbsField.value);
        }
        if (val == null && isFinite(dose) && isFinite(weight)) {
          let mgKgPerDay = dose;
          if (doseUnit && doseUnit.toLowerCase().includes('tydz')) {
            mgKgPerDay = dose / 7;
          }
          val = mgKgPerDay * weight;
        }
        point.doseAbs = (val != null && isFinite(val)) ? val : undefined;
      } catch(_) {
        point.doseAbs = undefined;
      }
      window.ghTherapyPoints.push(point);
    }
    saveTherapyPoints();
    renderTherapyTable();
  }

  /**
   * Synchronizuje punkty leczenia hormonem wzrostu z kartą „Zaawansowane obliczenia wzrostowe”.
   * Funkcja ta jest wywoływana po każdym odświeżeniu tabeli punktów leczenia.  Jeżeli karta
   * zaawansowanych obliczeń wzrostowych (#advMeasurements) jest dostępna w DOM, wiersze
   * pomiarowe oznaczone atrybutem `data-gh-sync="true"` zostaną usunięte, a następnie
   * ponownie utworzone na podstawie aktualnej zawartości tablicy `window.ghTherapyPoints`.
   * Wiersze te wypełnione są odpowiednimi wartościami wieku (lata i miesiące), wzrostu,
   * wagi i wieku kostnego (jeżeli jest dostępny w punkcie). Synchronizacja odbywa się
   * jednokierunkowo: modyfikacje danych w karcie zaawansowanych obliczeń wzrostowych nie
   * wpływają na moduł monitorowania terapii.
   */
  function syncTherapyToAdvancedGrowth(){
    try {
      const advContainer = document.getElementById('advMeasurements');
      // Jeżeli nie znaleziono kontenera pomiarów lub funkcja dodająca wiersz nie jest dostępna, wyjdź
      if (!advContainer || typeof window.addAdvMeasurementRow !== 'function') {
        return;
      }
      // Usuń istniejące wiersze dodane wcześniej z modułu monitorowania (oznaczone data-gh-sync="true")
      const existing = advContainer.querySelectorAll('.measure-row[data-gh-sync="true"]');
      existing.forEach(row => {
        try { row.remove(); } catch(_) { /* ignoruj błędy */ }
      });
      // Jeżeli brak punktów terapii – nie dodawaj nowych wierszy
      if (!Array.isArray(window.ghTherapyPoints) || window.ghTherapyPoints.length === 0) {
        // Po usunięciu wierszy ponownie przelicz wyniki zaawansowanych obliczeń
        if (typeof window.updateRemoveButtons === 'function') {
          window.updateRemoveButtons();
        }
        if (typeof window.calculateGrowthAdvanced === 'function') {
          window.calculateGrowthAdvanced();
        }
        return;
      }
      // Sortuj punkty po wieku (w miesiącach) rosnąco
      const pts = window.ghTherapyPoints.slice().sort((a, b) => {
        const ta = (a.ageYears || 0) * 12 + (a.ageMonths || 0);
        const tb = (b.ageYears || 0) * 12 + (b.ageMonths || 0);
        return ta - tb;
      });
      pts.forEach(pt => {
        // Dodaj nowy wiersz pomiarowy
        window.addAdvMeasurementRow();
        // Pobierz nowo dodany wiersz (ostatni w kontenerze)
        const rows = advContainer.querySelectorAll('.measure-row');
        const row = rows[rows.length - 1];
        if (!row) return;
        // Oznacz wiersz jako zsynchronizowany z modułu terapii GH
        row.setAttribute('data-gh-sync', 'true');
        // Zapamiętaj identyfikator punktu (przyda się do potencjalnego rozszerzenia)
        if (pt.id !== undefined) {
          row.setAttribute('data-gh-id', String(pt.id));
        }
        // Ustaw wartości pól wieku (lata i miesiące)
        const ageY = (pt.ageYears != null && !isNaN(pt.ageYears)) ? pt.ageYears : '';
        const ageM = (pt.ageMonths != null && !isNaN(pt.ageMonths)) ? pt.ageMonths : '';
        const setVal = (selector, value) => {
          const el = row.querySelector(selector);
          if (el) {
            el.value = (value === '' || value === null || Number.isNaN(value)) ? '' : String(value);
          }
        };
        setVal('.adv-age-years', ageY);
        setVal('.adv-age-months', ageM);
        // Ustaw wzrost i wagę
        setVal('.adv-height', (pt.height != null && !isNaN(pt.height)) ? pt.height : '');
        setVal('.adv-weight', (pt.weight != null && !isNaN(pt.weight)) ? pt.weight : '');
        // Ustaw wiek kostny w wierszu, jeśli dostępny (klasa .adv-bone-age)
        if ('boneAge' in pt) {
          setVal('.adv-bone-age', (pt.boneAge != null && !isNaN(pt.boneAge)) ? pt.boneAge : '');
        }
      });
      // Po dodaniu wierszy zaktualizuj przyciski usuwania i przelicz wyniki zaawansowanych obliczeń
      if (typeof window.updateRemoveButtons === 'function') {
        window.updateRemoveButtons();
      }
      if (typeof window.calculateGrowthAdvanced === 'function') {
        window.calculateGrowthAdvanced();
      }
    } catch (_) {
      // W razie jakichkolwiek błędów pomiń synchronizację
    }
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

      <!-- Kontener formularza edycji punktu terapii.  Jest ukrywany, gdy nie trwa edycja. -->
      <div id="ghTherapyEditContainer" style="display:none; margin:0.6rem 0; padding:0.6rem; border:1px solid var(--border, #ccc); border-radius:8px; background:var(--card, #f9f9f9);">
        <h3 style="margin-top:0; text-align:center; font-size:1rem;">Edycja punktu terapii</h3>
        <p style="font-size:0.75rem; margin:0.4rem 0 0.6rem 0; text-align:center; color:var(--textSecondary, #555);">Uaktualnij dane w poniższych polach i zapisz je przyciskiem Włączenie, Kontynuacja lub Zakończenie.</p>
        <div class="gh-edit-form" style="display:flex; flex-wrap:wrap; gap:0.6rem; justify-content:center;">
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditAge" style="font-size:0.75rem;">Wiek (lata)</label>
            <input id="ghEditAge" type="number" min="0" step="1" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:5rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditAgeMonths" style="font-size:0.75rem;">Miesiące</label>
            <input id="ghEditAgeMonths" type="number" min="0" max="11" step="1" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:5rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditWeight" style="font-size:0.75rem;">Waga (kg)</label>
            <input id="ghEditWeight" type="number" min="0" step="0.01" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:6rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditHeight" style="font-size:0.75rem;">Wzrost (cm)</label>
            <input id="ghEditHeight" type="number" min="0" step="0.01" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:6rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditBoneAge" style="font-size:0.75rem;">Wiek kostny</label>
            <input id="ghEditBoneAge" type="number" min="0" step="0.01" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:6rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditDose" style="font-size:0.75rem;">Dawka (mg/kg)</label>
            <input id="ghEditDose" type="number" min="0" step="0.001" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:7rem;" />
          </div>
          <div style="display:flex; flex-direction:column;">
            <label for="ghEditDrug" style="font-size:0.75rem;">Preparat</label>
            <select id="ghEditDrug" style="padding:0.3rem; border:1px solid var(--border,#ccc); border-radius:6px; width:10rem;"></select>
          </div>
        </div>
      </div>
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
              <th>Preparat</th>
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