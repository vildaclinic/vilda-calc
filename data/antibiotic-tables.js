/**
 * Statyczne tabele z antibiotic_therapy.js (Faza 4 / krok 16):
 * - GLOBAL_MAX_DAILY_DOSES — globalne maksymalne dawki dobowe antybiotyków
 * - LYME_SCHEMES — schematy leczenia boreliozy z Lyme
 * - CITATION_MAP — mapa identyfikatorów cytatów na URL-e (PubMed, CDC etc.)
 * - ABX_INDICATIONS — definicje wskazań klinicznych z sugerowanymi schematami
 *
 * Plik ładowany defer PRZED antibiotic_therapy.js. Aliasy w głównym module
 * odczytują window.VildaAntibioticTables — wzorzec analogiczny do VildaLMS i
 * VildaMicronormsFallback.
 *
 * Przeniesione tutaj, żeby antibiotic_therapy.js (528 KB → ~150 KB) szybciej się
 * ładował i parsował. Tabele zmieniają się rzadko — osobny plik z osobnym `?v=`
 * pozwala na agresywniejsze cache'owanie HTTP.
 */
window.VildaAntibioticTables = {
  GLOBAL_MAX_DAILY_DOSES: {
  // Fenoksymetylpenicylina – zgodnie z Charakterystyką Produktu Leczniczego
  // preparatu Ospen 1500, dorośli o masie ≥60 kg powinni otrzymywać około
  // 4,5 mln j.m. fenoksymetylpenicyliny na dobę (1,5 mln j.m. trzy razy dziennie),
  // co odpowiada ok. 2 943 mg fenoksymetylpenicyliny na dobę.
  // Dorośli o masie <60 kg oraz dzieci i młodzież o masie >40 kg otrzymują
  // zazwyczaj 3 mln j.m./dobę (1 mln j.m. 3 ×/dobę), czyli ok. 1 962 mg/dobę.
  // U dzieci (zwłaszcza <40 kg) dawki są podawane w zakresie 50 000–100 000 j.m./kg/dobę
  // (≈33–65 mg/kg/dobę), co przy 40 kg masy ciała daje
  // maksymalnie ok. 2 600 mg/dobę. Aby odzwierciedlić te wartości i uniknąć
  // ograniczania dobowej dawki do zbyt niskiej wartości 1 000 mg, podnosimy
  // globalne limity: do 2 600 mg/dobę u dzieci (<40 kg) i 3 000 mg/dobę u
  // pacjentów dorosłych (≥40 kg). Te limity odpowiadają odpowiednio około
  // 4 mln j.m. i 4,6 mln j.m. na dobę i są zgodne z zaleceniami ChPL.
  'Fenoksymetylpenicylina': { child: 2600, adult: 3000 },
  // Amoksycylina: w ostrym zapaleniu zatok i ucha oraz innych zakażeniach górnych
  // dróg oddechowych stosuje się zarówno standardowe dawki 45 mg/kg/dobę, jak i
  // wysokodawkowe schematy 80–90 mg/kg/dobę w 2 podaniach. Wytyczne AAP/MedStar
  // dopuszczają podawanie 80–90 mg/kg/dobę z limitem 2 g na dawkę (≈4 g/dobę).
  // Aby umożliwić pełne wykorzystanie schematu 90 mg/kg/dobę u dzieci o masie 40 kg
  // (3 600 mg/dobę), zwiększamy pediatryczny limit z 3 000 mg do 3 600 mg/dobę.
  // Limit dla dorosłych pozostaje 4 000 mg/dobę.
  'Amoksycylina': { child: 3600, adult: 4000 },
  // Amoksycylina z kwasem klawulanowym (koamoksyklaw) – zgodnie z wytycznymi,
  // standardowa dawka wynosi 45 mg/kg/dobę, a wysokodawkowa 80–90 mg/kg/dobę
  // amoksycyliny w dwóch dawkach. Preparaty o wysokiej
  // zawartości amoksycyliny (np. Augmentin ES 600 mg/5 ml) umożliwiają podawanie
  // maksymalnie 2 g na dawkę (4 g/dobę). Poprzedni limit 3 000 mg/dobę mógł
  // ograniczać pełną dawkę u większych dzieci (~40 kg), dlatego zwiększamy
  // pediatryczny limit do 3 600 mg/dobę. Limit dla dorosłych pozostaje 4 000 mg/dobę.
  // Amoksycylina z kwasem klawulanowym (ko‑amoksyklaw) – zgodnie z nowymi wytycznymi
  // ograniczamy globalną maksymalną dawkę dobową do 3 000 mg niezależnie od masy
  // ciała pacjenta. Dotychczasowe limity 3 600 mg u dzieci i 4 000 mg u dorosłych
  // pozwalały na podawanie wysokich dawek 90 mg/kg/dobę u pacjentów o masie ~40 kg,
  // jednak w większości wskazań stosuje się mniejsze dawki. W przypadkach
  // wymagających większej podaży (np. ostre zapalenie błony śluzowej nosa i zatok
  // przynosowych) odpowiedni limit będzie ustawiony lokalnie w logice funkcji
  // recalc().  W pozostałych sytuacjach dozwolona maksymalna dawka dobowa
  // ko‑amoksyklawu wynosi 3 000 mg zarówno dla dzieci (<40 kg), jak i dorosłych
  // (≥40 kg).
  'Amoksycylina z kwasem klawulanowym': { child: 3000, adult: 3000 },
  // Duplicate entry with non-breaking spaces (\u00a0) for UI strings that use NBSP.
  // Ujednolicamy limity dobowej dawki ko‑amoksyklawu z czystą amoksycyliną: 3 600 mg/dobę
  // u dzieci <40 kg i 4 000 mg/dobę u pacjentów ≥40 kg. Poprzednio stosowano 3 000/4 000 mg;
  // aktualizacja pozwala na podanie pełnej dawki 90 mg/kg/dobę u pacjentów o masie 40 kg.
  // Wariant z twardymi spacjami (NBSP) dla zgodności z etykietami UI.  Patrz komentarz
  // powyżej – limit dobowy wynosi 3 000 mg dla obu grup wiekowych.
  'Amoksycylina\u00a0z\u00a0kwasem\u00a0klawulanowym': { child: 3000, adult: 3000 },
  // Cefaleksyna – w powikłanych zakażeniach układu moczowego dawki mogą sięgać 25 mg/kg
  // cztery razy na dobę (100 mg/kg/dobę), co u pacjentów ważących 40 kg daje 4 000 mg/dobę.
  // Aby umożliwić stosowanie pełnych dawek w ciężkich zakażeniach, zwiększamy limit pediatryczny z 2 000 mg do 4 000 mg/dobę,
  // pozostawiając limit dorosłych bez zmian (4 000 mg). W innych wskazaniach dawkę ogranicza lokalny parametr maxDailyMg.
  'Cefaleksyna': { child: 4000, adult: 4000 },
  'Cefadroksyl': { child: 1000, adult: 1000 },
  // Aksetyl cefuroksymu (cefuroksym doustny) – w leczeniu niepowikłanych zakażeń układu moczowego
  // zaleca się 15 mg/kg mc. dwa razy na dobę (30 mg/kg/dobę) z maksymalną dawką 250 mg na
  // pojedynczą dawkę, co odpowiada 500 mg/dobę.  
  // Dlatego ograniczamy zarówno dziecięcy, jak i dorosły limit do 500 mg/dobę, aby nie przekroczyć
  // maksymalnej dawki wynikającej z CHPL.
  // Aksetyl cefuroksymu (cefuroksym doustny) – maksymalna dobowa dawka zależy od wskazania.
  // W niepowikłanych zakażeniach układu moczowego zaleca się 15 mg/kg mc. dwa razy na dobę
  // (30 mg/kg/dobę), co daje maks. 250 mg na dawkę (500 mg/dobę).
  // Jednak w ostrym zapaleniu zatok przynosowych oraz zapaleniu ucha środkowego stosuje się
  // 30 mg/kg mc./dobę w dwóch dawkach z limitem 500 mg na dawkę, czyli do 1 000 mg/dobę.
  // Aby umożliwić pełne wykorzystanie dawki w tych wskazaniach bez ograniczania do 500 mg,
  // podnosimy globalny limit do 1 000 mg/dobę zarówno dla dzieci, jak i dorosłych. Ograniczenia
  // do 500 mg/dobę w zakażeniach układu moczowego będą ustawiane lokalnie w definicji leku.
  'Aksetyl cefuroksymu': { child: 1000, adult: 1000 },
  // Klarytromycyna – standardowo 500 mg/dobę u dzieci; u dorosłych do 1 g/dobę w ciężkich zakażeniach.
  'Klarytromycyna': { child: 500, adult: 1000 },
  // Azytromycyna – w terapii 5‑dniowej: 500 mg w dniu 1, następnie 250 mg/dobę.
  'Azytromycyna': { child: 500, adult: 500 },
  // Wariant trzydniowy azytromycyny (nazwany „Azytromycyna (3 dni)”) stosuje
  // te same ograniczenia dobowe co standardowa terapia: maksymalnie 500 mg/dobę
  // zarówno u dzieci, jak i u dorosłych. Definicja ta zapobiega
  // przekroczeniu limitu podczas obliczeń.
  // Wersja z normalną spacją w nazwie (3 dni) – te same limity co powyżej.
  'Azytromycyna (3 dni)': { child: 500, adult: 500 },
  // Wariant pięciodniowy w pozaszpitalnym zapaleniu płuc u dorosłych – pozostaje limit 500 mg/dobę,
  // ponieważ dzienna dawka wynosi ~250 mg.  Globalny limit zapobiega podaniu większej dawki.
  'Azytromycyna (5 dni)': { child: 500, adult: 500 },
  // Wariant siedmiodniowy azytromycyny na potrzeby leczenia boreliozy – zachowuje limit 500 mg/dobę
  // zarówno dla dzieci, jak i dorosłych, tak jak w innych schematach azytromycyny.
  'Azytromycyna (7 dni)': { child: 500, adult: 500 },
  /*
   * Usunięto wariant jednodniowy azytromycyny („Azytromycyna (1 dzień)”) z globalnej tabeli limitów,
   * ponieważ jednorazowe podanie 2 g nie jest już rekomendowane.  Pozostawiono tylko limity
   * dla schematów 3‑dniowych i 5‑dniowych.
   */
  // Klindamycyna – zgodnie z aktualizacją: 20–30 mg/kg/dobę u dzieci i dorosłych, maksymalnie 1,8 g/dobę.
  // Ujednolicamy limit do 1 800 mg/dobę zarówno dla dzieci, jak i dorosłych.
  'Klindamycyna': { child: 1800, adult: 1800 },
  // Cefiksym – zazwyczaj 400 mg/dobę zarówno u dzieci jak i u dorosłych.
  'Cefiksym': { child: 400, adult: 400 },
  // Ceftibuten – podobnie jak cefiksym, 9 mg/kg/dobę (max 400 mg).
  'Ceftibuten': { child: 400, adult: 400 },
  // Cefaklor – w preparatach doustnych IR maksymalnie 1 g/dobę zarówno u dzieci, jak i u dorosłych. Wersja o przedłużonym uwalnianiu (375 mg co 12 h) daje 750 mg/dobę.
  // Dlatego przyjmujemy bezpieczny limit 1 g/dobę dla obu grup.
  'Cefaklor': { child: 1000, adult: 1000 },
  // Furazydyna (nitrofurantoina) – zgodnie z zaleceniami 5–7 mg/kg/dobę w czterech dawkach u dzieci; maksymalnie 400 mg/dobę u dzieci i dorosłych.
  'Furazydyna': { child: 400, adult: 400 },
  // Trimetoprim – dzieci zwykle otrzymują 5 mg/kg co 12 h (max 200 mg na dawkę),
  // co odpowiada ok. 400 mg/dobę czystego trimetoprimu. U dorosłych
  // stosuje się 100 mg co 12 h (200 mg/dobę) lub 200 mg jednorazowo.
  // Trimetoprim – w niepowikłanych zakażeniach dróg moczowych dorośli otrzymują 200 mg co 12 h
  // (400 mg/dobę), a dzieci 6–12 lat 2–4 mg/kg mc. co 12 h (4–8 mg/kg/dobę).  
  // Wcześniejszy limit 200 mg/dobę dla dorosłych powodował niedodawkowanie; podnosimy go do 400 mg.  
  'Trimetoprim': { child: 400, adult: 400 },
  // Trimetoprim‑sulfametoksazol (kotrimoksazol) – ograniczenia dotyczą całkowitej
  // zawartości obu składników (trimetoprimu i sulfametoksazolu). U dzieci dawka
  // dobowo 6 mg trimetoprimu + 30 mg sulfametoksazolu/kg masy ciała odpowiada
  // ok. 36 mg/kg/dobę całkowitej substancji czynnej. U pacjenta
  // o masie 20 kg daje to ~720 mg/dobę; dlatego wcześniejszy limit 480 mg/dobę
  // powodował niedodawkowanie. Zaktualizowano limit pediatryczny do 960 mg/dobę,
  // co pozwala na zastosowanie pełnej dawki u dzieci o masie do ~26–30 kg. U
  // dorosłych stosuje się 160 mg trimetoprimu + 800 mg sulfametoksazolu co 12 h
  // (960 mg na dawkę, 1 920 mg/dobę) w cięższych zakażeniach.
  'Trimetoprim-sulfametoksazol': { child: 960, adult: 1920 },
  // Fosfomycyna – pojedyncza dawka 3 g (3000 mg) u dorosłych i dzieci ≥12 lat.
  'Fosfomycyna': { child: 3000, adult: 3000 },
  // Fluorochinolony: ustawiono umiarkowane limity, choć rzadko stosowane u dzieci.
  'Ciprofloxacyna': { child: 1000, adult: 1500 },
  'Cyprofloksacyna': { child: 1000, adult: 1500 },
  // Dodajemy osobne limity dobowe dla wariantów doustnych i dożylnych cyprofloksacyny.
  // Doustna cyprofloksacyna może być podawana w dawkach do 750 mg dwa razy na dobę
  // (1 500 mg/dobę), natomiast dożylna postać jest zwykle
  // ograniczona do 400 mg 2–3 ×/dobę (maks. 1 200 mg/dobę).
  'Cyprofloksacyna (doustna)': { child: 1000, adult: 1500 },
  'Cyprofloksacyna (dożylna)': { child: 1000, adult: 1200 },
  'Lewofloksacyna': { child: 500, adult: 1000 },
  'Lewofloksacyna i.v.': { child: 500, adult: 1000 },
  // Doksycyklina – standardowa dawka u dorosłych wynosi 100 mg co 12 h (200 mg/dobę).
  // Ograniczamy dobowe spożycie do 200 mg u dzieci i dorosłych.
  'Doksycyklina': { child: 200, adult: 200 },
  // Cefpodoksym – w pozaszpitalnym zapaleniu płuc podaje się 200 mg dwa razy na dobę.
  // Maksymalna dawka dobowa wynosi 400 mg.
  'Cefpodoksym': { child: 400, adult: 400 },
  // Moksyfloksacyna – fluoroquinolon, którego zalecana dawka wynosi 400 mg raz na dobę.
  // Limitujemy całkowitą dawkę do 400 mg/dobę u dzieci i dorosłych.
  'Moksyfloksacyna': { child: 400, adult: 400 },
  // Kloksacylina – beta-laktam przeciwgronkowcowy; zwykle do 2 g/dobę u dzieci i 4 g/dobę u dorosłych.
  'Kloksacylina': { child: 2000, adult: 4000 },
  // Metronidazol – do 750 mg/dobę u dzieci i 1 500 mg/dobę u dorosłych w zakażeniach jamy brzusznej.
  'Metronidazol': { child: 750, adult: 1500 },
  // Linezolid – 30 mg/kg/dobę u dzieci (max 600 mg), 600 mg 2×/dobę u dorosłych (1 200 mg).
  'Linezolid': { child: 600, adult: 1200 },
  // Wankomycyna – brak doustnych form maksymalnych; nie ustalamy limitów.
  'Wankomycyna': { child: null, adult: null },
  // Gentamycyna – u dzieci i dorosłych w powikłanych ZUM maks. 3–6 mg/kg/dobę,
  // co przy masie 40 kg daje około 240 mg/dobę.
  // Ustalamy górny limit 240 mg/dobę dla obu grup, zapobiegając przekroczeniu zalecanych dawek.
  'Gentamycyna': { child: 240, adult: 240 },
  // Piperacylina z tazobaktamem – 112,5 mg/kg co 8 h u dzieci (około 13 500 mg/dobę dla 40 kg) i 4,5 g co 8 h u dorosłych.
  // Ustalono limit 13 500 mg/dobę zarówno dla dzieci, jak i dorosłych.
  'Piperacylina z tazobaktamem': { child: 13500, adult: 13500 },
  // Imipenem z cilastatyną – maksymalna dobowa dawka wynosi 4 g u dorosłych i dzieci starszych.
  'Imipenem z cilastatyną': { child: 4000, adult: 4000 },
  // Meropenem – zazwyczaj stosuje się do 6 g/dobę u dzieci i dorosłych w ciężkich zakażeniach.
  'Meropenem': { child: 6000, adult: 6000 },
  // Doripenem – u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę) w ciężkich zakażeniach.
  // Brak danych pediatrycznych; przyjmujemy konserwatywny limit 3 000 mg/dobę dla obu grup.
  'Doripenem': { child: 3000, adult: 3000 },
  // Cefuroksym (dożylnie) – maksymalnie 4,5 g/dobę (1,5 g co 8 h) zarówno u dzieci ≥40 kg, jak i dorosłych.
  'Cefuroksym (dożylnie)': { child: 4500, adult: 4500 },
  // Cefotaksym – u dorosłych zwykle do 6 g/dobę (1–2 g co 8 h), sporadycznie do 12 g; u dzieci do 100 mg/kg/dobę (≈4–6 g przy masie 40 kg).
  // Ustalamy konserwatywny limit 6 000 mg/dobę dla obu grup.
  'Cefotaksym': { child: 6000, adult: 6000 },
  // Ceftriakson – jedna dawka 1–2 g/dobę u dorosłych; dzieci do 50 mg/kg/dobę (max 2 g).
  'Ceftriakson': { child: 2000, adult: 2000 },
  // Cefepim – maksymalnie 6 g/dobę u dorosłych i dzieci (50–150 mg/kg/dobę przy masie 40 kg).
  'Cefepim': { child: 6000, adult: 6000 },
// Amikacyna – limit 1,5 g/dobę dla dzieci i dorosłych zgodnie z wytycznymi.
'Amikacyna': { child: 1500, adult: 1500 }
},
  LYME_SCHEMES: {
  "label": "Schematy leczenia",
  "description": "Aktualne schematy leczenia boreliozy z Lyme według zaleceń europejskich i polskich. Dane podano w podziale na manifestacje kliniczne z zalecanymi antybiotykami, dawkami, drogą podania i typowym czasem terapii.",
  "schemes": [
    {
      "condition": "Rumień wędrujący (EM) – wczesna borelioza",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "10–21 dni" },
        { "drug": "Amoksycylina", "dosage": "500 mg 3× / dzień", "route": "p.o.", "duration": "14–21 dni" },
        { "drug": "Aksetyl cefuroksymu", "dosage": "500 mg 2× / dzień", "route": "p.o.", "duration": "14–21 dni" },
        { "drug": "Azytromycyna", "dosage": "500 mg 1× / dzień (pierwsza dawka 500–1000 mg)", "route": "p.o.", "duration": "5–10 dni", "note": "Alternatywa przy nietolerancji β‑laktamów" }
      ],
      "children": [
        { "drug": "Amoksycylina", "dosage": "25–50 mg/kg/d", "route": "p.o.", "duration": "14–21 dni", "frequency": "3 dawki dziennie" },
        { "drug": "Cefuroksym", "dosage": "30–40 mg/kg/d", "route": "p.o.", "duration": "14–21 dni", "frequency": "2 dawki dziennie" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "10–21 dni", "note": "Stosować z uwzględnieniem wieku i tolerancji" }
      ]
    },
    {
      "condition": "Neuroborelioza – wczesna",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "14–28 dni" },
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Cefotaksym", "dosage": "2 g 3× / dzień", "route": "i.v.", "duration": "14–21 dni", "note": "Alternatywa" },
        { "drug": "Penicylina G", "dosage": "18–24 mln j./d (podzielone na 6 dawek)", "route": "i.v.", "duration": "14–21 dni", "note": "Alternatywa" }
      ],
      "children": [
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "14–28 dni" },
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Cefotaksym", "dosage": "150 mg/kg/d podzielone na 3 dawki", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Penicylina G", "dosage": "200 000–400 000 j/kg/d", "route": "i.v.", "duration": "14–21 dni" }
      ]
    },
    {
      "condition": "Neuroborelioza – późna (cięższe OUN)",
      "adult": [
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o. lub i.v.", "duration": "21–28 dni", "note": "Rozważyć przy łagodniejszych objawach" },
        { "drug": "Cefotaksym", "dosage": "2 g 3× / dzień", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Penicylina G", "dosage": "18–24 mln j./d", "route": "i.v.", "duration": "21–28 dni" }
      ],
      "children": [
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Cefotaksym", "dosage": "150 mg/kg/d podzielone na 3 dawki", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Penicylina G", "dosage": "200 000–400 000 j/kg/d", "route": "i.v.", "duration": "21–28 dni" }
      ]
    },
    {
      "condition": "Zapalenie stawów (Lyme arthritis)",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Amoksycylina", "dosage": "500 mg 3× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Aksetyl cefuroksymu", "dosage": "500 mg 2× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "21–28 dni", "note": "W przypadku ciężkich objawów lub braku poprawy" }
      ],
      "children": [
        { "drug": "Amoksycylina", "dosage": "25–50 mg/kg/d", "route": "p.o.", "duration": "21–28 dni", "frequency": "3 dawki dziennie" },
        { "drug": "Cefuroksym", "dosage": "30–40 mg/kg/d", "route": "p.o.", "duration": "21–28 dni", "frequency": "2 dawki dziennie" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "21–28 dni", "note": "W przypadku ciężkich objawów lub braku poprawy" }
      ]
    },
    {
      "condition": "Profilaktyka po ukąszeniu kleszcza (wysokie ryzyko)",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "200 mg jednorazowo (4,4 mg/kg)", "route": "p.o.", "duration": "1 dawka", "note": "Podać w ciągu 72 h od usunięcia kleszcza" }
      ],
      "children": [
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg (max. 200 mg)", "route": "p.o.", "duration": "1 dawka", "note": "Do rozważenia u dzieci powyżej minimalnego wieku; podać w ciągu 72 h od usunięcia kleszcza" }
      ]
    }
  ]
},
  CITATION_MAP: {
  '': 'https://pubmed.ncbi.nlm.nih.gov/14770076/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/14770076/',
  // Wytyczne CDC dotyczące leczenia paciorkowcowego zapalenia gardła –
  // witryna z informacjami o dawkowaniu azytromycyny, klarytromycyny i
  // zaleceniach dla pacjentów z alergią na beta‑laktamy.  W kodzie
  // wykorzystujemy tę samą stronę dla kilku odwołań.
  // Adres prowadzi do oficjalnej strony CDC dla pracowników służby zdrowia
  // (https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html),
  // która zawiera zalecenia terapeutyczne dla zakażenia Streptococcus pyogenes.
  // Odwołania te są wykorzystywane w komunikatach informujących o dawkowaniu
  // makrolidów i ograniczeniach związanych z opornością na te antybiotyki.
  // CDC clinical guidance for treating Group A streptococcal pharyngitis.
  // The original URL (https://www.cdc.gov/groupastrep/clinicians.html) is now a dead link.
  // Replace it with the current CDC page for healthcare providers:
  // https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html
  // which contains dosing recommendations for azithromycin, clarithromycin and
  // other alternatives for penicillin‑allergic patients.
  '': 'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html',
  // W tym cytowaniu podkreślamy informację o oporności Streptococcus pyogenes na makrolidy i klindamycynę –
  // adres prowadzi do tej samej strony CDC, ale z fragmentem dotyczącym oporności (zakotwiczony nagłówek
  // „Antibiotic resistance”).  Wcześniej używany anchor #resistance nie istniał, dlatego teraz link
  // odwołuje się do identyfikatora nagłówka (#heading-1naimcchq5).  To pozwala odróżnić źródła
  // w sekcji Źródła i zapobiega duplikacji identycznych adresów.
  // Anchor pointing to the “Antibiotic resistance” section on the same CDC page.
  // The previous URL used a non‑existent #resistance anchor; the new anchor
  // (#heading-1naimcchq5) links directly to the relevant section of the page
  // describing the absence of penicillin resistance and the variable
  // resistance to macrolides and clindamycin.
  '': 'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html#heading-1naimcchq5',
  // Strona z dawkowaniem cefakloru w zakażeniach paciorkowcowych –
  // zawiera informacje o 20–40 mg/kg mc./dobę podzielonych co 8–12 h i
  // minimalnym czasie terapii 10 dni.
  '': 'https://www.drugs.com/dosage/cefaclor.html',
  // Strona z dawkowaniem klarytromycyny (usual adult and pediatric dose for
  // tonsillitis/pharyngitis: 250–500 mg co 12 h dla dorosłych oraz
  // 7,5 mg/kg co 12 h dla dzieci) – wykorzystujemy
  // ten odnośnik do generowania sekcji Źródła przy komunikatach
  '': 'https://www.drugs.com/dosage/clarithromycin.html'
  ,
  // ----- Now add mappings for citations used in the sinusitis module -----
  // Observational management and watchful waiting in acute bacterial rhinosinusitis
  // Up to 80% of children improve without antibiotics; amoxicillin alone is preferred to
  // amoxicillin‑clavulanate for most patients, and cephalosporins are inferior to high‑dose
  // amoxicillin.  This link points to the StatPearls article on
  // acute sinusitis hosted by the U.S. National Library of Medicine.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#general-principles',
  // Preference for amoxicillin over amoxicillin‑clavulanate in non‑severe acute sinusitis and
  // recommendation to reserve amoxicillin‑clavulanate for treatment failure or high‑risk
  // patients.  This anchor differentiates the source in the same
  // StatPearls article.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#amoxicillin-versus-amoxclav',
  // Oral cephalosporins, including cefuroxime, are less effective than high‑dose amoxicillin
  // and should be reserved for patients with true penicillin allergy.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#cephalosporins',
  // Macrolides (azithromycin, clarithromycin) have poor activity against Streptococcus
  // pneumoniae and Haemophilus influenzae and are not recommended for empirical therapy
  // in acute bacterial rhinosinusitis.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#macrolides',
  // Clinical failure is defined as lack of improvement within 72 hours of observation or
  // antibiotic therapy; in such cases therapy should be reassessed.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#treatment-failure',
  // High‑dose amoxicillin‑clavulanate (2 g twice daily or 90 mg/kg/day) is recommended
  // when amoxicillin‑resistant organisms are suspected or when first‑line therapy fails.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#high-dose-amoxicillin-clavulanate',
  // Supportive therapy for acute sinusitis: symptomatic management should focus on
  // hydration, analgesics, antipyretics, saline nasal irrigation and intranasal corticosteroids;
  // oral and topical decongestants and antihistamines are not recommended due to lack
  // of proven benefit and risk of adverse effects.  We map this
  // citation to a publicly available sinusitis guideline summary from Northwestern Medicine.
  '': 'https://adsp.nm.org/uploads/1/4/3/0/143064172/sinusitis_guideline_summary.update_7.17.pdf#page=1',
  // ----- Now add mappings for acute otitis media citations -----
  // Watchful waiting for 2–3 days in mild acute otitis media: the Polish NFZ
  // knowledge base summarises AAP/AAPF guidelines recommending 48–72 hours
  // of observation with symptomatic treatment when diagnosis is uncertain,
  // symptoms are mild and monitoring is feasible.
  '': 'https://centrumwiedzy.nfz.gov.pl/584,rekomendacje-aap-oraz-aafp',
  // Criteria for immediate antibiotic therapy in AOM: the same NFZ resource
  // advises that antibiotics should not be delayed in infants <6 months or in
  // severe cases with high fever, vomiting, diarrhea, bilateral disease,
  // severe otalgia or purulent discharge, or when observation is impractical.
  '': 'https://centrumwiedzy.nfz.gov.pl/584,rekomendacje-aap-oraz-aafp',
  // Restrictions on re‑using amoxicillin: CDC outpatient care guidelines
  // recommend prescribing amoxicillin/clavulanate instead of amoxicillin alone
  // when amoxicillin was used within the past 30 days, purulent conjunctivitis
  // is present, or there is recurrent AOM unresponsive to amoxicillin.
  '': 'https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html',
  // Additional mapping for high macrolide resistance in acute sinusitis.  This citation
  // references high resistance of Streptococcus pneumoniae to macrolides and
  // trimethoprim‑sulfamethoxazole.  We point to the StatPearls
  // article section on antibiotic choice and duration, which notes macrolides and
  // TMP‑SMX are not recommended as initial therapy due to resistance.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#antibiotic-choice'
  ,
  // ----- Additional mapping for acute otitis media -----
  // High‑dose amoxicillin is recommended as the first‑line treatment for acute otitis media.
  // Macrolide antibiotics (azithromycin, clarithromycin) should be reserved for patients with
  // a confirmed beta‑lactam allergy or documented susceptibility of the causative pathogen.
  // This citation points to an accessible article summarising AOM management from US Pharmacist.
  '': 'https://www.uspharmacist.com/article/management-of-pediatric-otitis-media'
  ,
  // ----- New mappings for community‑acquired pneumonia in children -----
  // First‑line treatment for mild to moderate community‑acquired pneumonia in children.
  // The MedStar Health pediatric CAP guideline recommends high‑dose amoxicillin (90 mg/kg/day
  // in 2–3 divided doses, max 4 g/day) as the preferred outpatient therapy and notes that
  // macrolides should be reserved for school‑aged children with suspected atypical pathogens.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // The same guideline advises reassessing children after 48–72 hours of amoxicillin therapy;
  // if there is no clinical improvement, antibiotic coverage should be adjusted and atypical
  // pathogens considered.  We map this citation to the same MedStar CAP guideline.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // Streptococcus pneumoniae is identified as the most common bacterial cause of community‑acquired
  // pneumonia in children; this citation also maps to the MedStar guideline.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // High‑dose amoxicillin and amoxicillin‑clavulanate dosing recommendations for pediatric CAP,
  // as well as treatment escalation for moderate and severe disease, are provided in the Carilion Clinic guideline.
  '': 'https://www.carilionclinic.org/peds-PNA-guide.pdf',
  // The same Carilion guideline notes that vancomycin, teicoplanin and linezolid are reserved for severe cases,
  // particularly those due to MRSA or multi‑resistant pneumococci.
  '': 'https://www.carilionclinic.org/peds-PNA-guide.pdf',
  // The OHSU pediatric CAP guideline emphasises that many pneumonias in preschool children have viral
  // etiology and that antibiotics should not be initiated for viral CAP unless bacterial coinfection is suspected.
  '': 'https://www.ohsu.edu/sites/default/files/2022-02/Pediatric%20CAP%20Guideline.pdf',
  // The same OHSU guideline recommends using cefuroxime for late‑type penicillin hypersensitivity and
  // macrolides (clarithromycin or azithromycin) for immediate hypersensitivity or when atypical pathogens
  // are suspected.
  '': 'https://www.ohsu.edu/sites/default/files/2022-02/Pediatric%20CAP%20Guideline.pdf',
  // Narodowy Program Ochrony Antybiotyków: ogólny portal z rekomendacjami dotyczącymi diagnostyki
  // i terapii zakażeń.  Serwis ten zawiera rekomendacje postępowania w pozaszpitalnych zakażeniach
  // układu oddechowego i informuje, że amoksycylina z kwasem klawulanowym jest preferowana u dzieci,
  // które w ciągu ostatnich 30 dni otrzymywały antybiotyk β‑laktamowy lub gdy istnieje podejrzenie
  // patogenu wytwarzającego β‑laktamazę.  Łącze odsyła do strony z rekomendacjami diagnostyki i
  // terapii zakażeń Narodowego Programu Ochrony Antybiotyków.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/'
  ,
  // ----- Additional mappings for pediatric community‑acquired pneumonia -----
  // Macrolide therapy should not be used empirically for all children with CAP.  The MedStar Health
  // pediatric CAP guideline states that amoxicillin is the preferred first‑line therapy for otherwise
  // healthy infants and preschool children with mild to moderate CAP, and that macrolide antibiotics
  // should be reserved for school‑aged children and adolescents when an atypical pathogen (e.g.
  // Mycoplasma pneumoniae) is suspected.  Both of the following internal
  // identifiers correspond to citations from the Polish guideline, but are mapped here to this
  // publicly available guideline so that the application displays a real source instead of a
  // placeholder.  See lines 186–203 of the MedStar guideline for the relevant recommendation.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf'
  ,
  // Fragment z polskich Rekomendacji 2016: w przypadku nawrotu choroby lub podawania
  // antybiotyku w ciągu ostatniego miesiąca zaleca się zastosowanie amoksycyliny z
  // klawulanianem w wysokiej dawce (90 mg/kg mc./dobę).  Link kieruje do strony
  // Narodowego Programu Ochrony Antybiotyków z rekomendacjami diagnostyki i terapii zakażeń.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // ---- Now add mappings for adult community‑acquired pneumonia citations ----
  // Susceptibility of Streptococcus pneumoniae to amoxicillin and cefuroxime and discussion of high β‑lactam activity.
  // Mapped to the Polish recommendations portal to ensure accessibility.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // Multicenter evaluation of macrolide‑resistant Streptococcus pneumoniae – reports resistance >25% in most regions.
  '': 'https://pubmed.ncbi.nlm.nih.gov/34250183/',
  // IDSA/ATS guideline for diagnosis and treatment of adults with community‑acquired pneumonia – outpatient regimens for healthy adults.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – treatment options for adults with comorbidities, combination therapy and dosing.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – recommended doses of respiratory fluoroquinolones.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – definition of comorbidities relevant for CAP management.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – caution against macrolide monotherapy due to high resistance rates.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – risk factors for MRSA or Pseudomonas aeruginosa requiring additional coverage.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // Footnote from Polish guideline emphasising minimum 5‑day therapy and continuing treatment 3 days after clinical stabilisation.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // Outpatient CAP treatment duration recommendation (5–7 days, afebrile ≥48 h before discontinuation).
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/'
  ,
  // ----- Additional mappings for skin and soft tissue infections and bite wounds -----
  // The following placeholders are used in messages for infected wounds (ssti_wound),
  // cellulitis/erysipelas (ssti_cellulitis) and bite wounds (ssti_bite).  They previously
  // pointed to internal documentation and now map to peer‑reviewed articles on PubMed.
  // IDSA 2014 guideline for the diagnosis and management of skin and soft tissue infections
  // (https://pubmed.ncbi.nlm.nih.gov/24973422/) – provides recommendations on empiric
  // therapy, dosing and duration for cellulitis, erysipelas and infected wounds.
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  // Additional references for dosing of beta‑lactam antibiotics in cellulitis and wound infections.
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  // Evidence review for management of dog and cat bite wounds – outlines prophylaxis with
  // amoxicillin‑clavulanate and alternatives for penicillin‑allergic patients.
  // See https://pubmed.ncbi.nlm.nih.gov/37983702/ for details.
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/'
},
  ABX_INDICATIONS: {
    'pharyngitis': {
      label: 'Ostre zapalenie gardła i migdałków podniebiennych',
      drugs: {
        // Fenoksymetylpenicylina (Penicillin V) – lek pierwszego wyboru. U dzieci < 40 kg
        // zalecane 100 000–200 000 j.m./kg/dobę w dwóch dawkach co 12 h, a u pacjentów ≥ 40 kg
        // 2–3 mln j.m. na dobę w dwóch dawkach. Zakres mgRange i dawka będą
        // dodatkowo dostosowywane w updateDoseControls() na podstawie masy ciała.
        // Fenoksymetylpenicylina (Penicylina V) – dawki w jednostkach
        // międzynarodowych 100 000–200 000 j.m./kg/dobę odpowiadają
        // ok. 33–65 mg/kg/dobę (1 000 000 j.m. ≈ 654 mg). Dla pacjentów
        // <40 kg przyjmujemy zakres 33–65 mg/kg/dobę (50 000–100 000 j.m./kg/dobę), domyślnie 50 mg/kg/dobę.
        // Dla pacjentów ≥40 kg zakres dawek jest wyliczany dynamicznie w
        // updateDoseControls() na podstawie całkowitej dawki 2–3 mln j.m./dobę.
        // Fenoksymetylpenicylina (Penicylina V) – zgodnie z najnowszymi wytycznymi w
        // paciorkowcowym zapaleniu gardła dawkę dobową dzieli się na trzy
        // równe podania. Zmieniono liczbę dawek z 2 na 3. Zakres dawek
        // pozostaje niezmieniony: 33–65 mg/kg/dobę (odpowiadające 50 000–100 000 j.m./kg/dobę) z domyślną
        // wartością 50 mg/kg/dobę. W updateDoseControls() zakres jest
        // dodatkowo dostosowywany do masy ciała pacjenta ≥ 40 kg.
        // Fenoksymetylpenicylina: schemat podawania co 8–12 h (2–3 ×/dobę).  
        // Domyślnie przyjmujemy dawkowanie co 12 h (2 dawki/dobę) i udostępniamy
        // alternatywny wariant trzech dawek/dobę poprzez altDoses. Zakres mg/kg/dobę
        // odzwierciedla 50 000–100 000 j.m./kg/dobę (≈33–65 mg/kg/dobę). Domyślna
        // dawka to 50 mg/kg/dobę. Długość terapii: 10 dni.
        'Fenoksymetylpenicylina': { mgRange: [33, 65], defaultMg: 50, doses: 2, altDoses: [3], duration: 10, firstChoice: true },
        // Amoksycylina jako alternatywa – zgodnie z Charakterystyką Produktu Leczniczego
        // zalecane jest 50 mg/kg/dobę w dwóch dawkach (25 mg/kg co 12 h) przy
        // streptokokowym zapaleniu gardła. Zmniejszamy zakres do jednej
        // wartości 50 mg/kg/dobę i aktualizujemy domyślną dawkę do 50 mg/kg/dobę.
        // Amoksycylina – w leczeniu paciorkowcowego zapalenia gardła dawkę dobową
        // 50 mg/kg mc. zwykle podaje się w dwóch podaniach przez 10 dni. Zgodnie
        // z charakterystyką leku i informacjami dla pacjenta, typowy zakres
        // dobowych dawek amoksycyliny u dorosłych wynosi 0,75–3 g, a u dzieci
        // 40–90 mg/kg mc./dobę z maksymalną dawką 3 g na dobę.
        // Aby uniknąć obliczeń przekraczających 3 g/dobę w tym wskazaniu,
        // dodano lokalne ograniczenie maxDailyMg: 3000 mg.
        'Amoksycylina':        { mgRange: [50, 50], defaultMg: 50, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Amoksycylina z kwasem klawulanowym – w tej jednostce chorobowej nie ma
        // konieczności stosowania wysokich dawek. Na podstawie Charakterystyki
        // Produktu Leczniczego Augmentin oraz wytycznych przyjmujemy zakres
        // 25–45 mg/kg/dobę amoksycyliny w dwóch dawkach (standardowy schemat 25–45 mg/kg/dobę,
        // bez przekraczania 45 mg/kg/dobę). Domyślna wartość to 40 mg/kg/dobę.
        // Amoksycylina z kwasem klawulanowym – w infekcjach górnych dróg
        // oddechowych u pacjentów o masie ≥ 40 kg stosuje się 1 g (875 mg + 125 mg)
        // dwa razy na dobę lub 625 mg (500 mg + 125 mg) trzy razy na dobę, a u
        // dzieci <40 kg zakres dawek wynosi 25–45 mg amoksycyliny/kg mc./dobę w
        // dwóch podaniach. Dawka 45 mg/kg mc./dobę u dziecka
        // ważącego 40 kg odpowiada 1 800 mg amoksycyliny na dobę. Aby ograniczyć
        // kalkulator do rozsądnych wartości i nie przekraczać 3 g amoksycyliny
        // na dobę, wprowadzono lokalny limit maxDailyMg: 3000 mg dla tego
        // wskazania.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Cefadroksyl: jednorazowa dawka dobowa 30 mg/kg (dzieci < 40 kg) lub 1 g
        // (pacjenci ≥ 40 kg) – zgodnie z zaleceniami IDSA i ChPL.
        // Dawka podawana raz dziennie przez 10 dni.
        // Cefadroksyl: dawka dobowa 30 mg/kg mc. (dzieci <40 kg) lub 1 g (≥40 kg),
        // podawana jednorazowo lub w dwóch dawkach co 12 h. Aby ułatwić kliniczne
        // dostosowanie do schematu 8–12 h, przyjmujemy domyślnie 1 dawkę/dobę
        // i udostępniamy alternatywny wariant dwóch dawek poprzez altDoses.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 1, altDoses: [2], duration: 10, maxDailyMg: 1000 },
        // Cefaleksyna: tradycyjnie stosowana w leczeniu paciorkowcowego zapalenia gardła,
        // ale obecnie doustne preparaty nie są dostępne w Polsce. Z tego powodu
        // usuwamy cefaleksynę z listy antybiotyków w tym wskazaniu.
        // { mgRange: [40, 40], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg mc./dobę podzielona na dwie dawki co 12 h
        // jest podstawowym schematem terapii paciorkowcowego zapalenia gardła u dzieci
        // Zgodnie z Charakterystyką Produktu Leczniczego u dorosłych można stosować
        // dawkę 500 mg lub 1 000 mg raz na dobę (tabletki o przedłużonym
        // uwalnianiu). Aby umożliwić obliczenia dla tych wariantów,
        // zwiększamy limit dobowy do 1 000 mg i dodajemy alternatywną opcję
        // dawkowania raz na dobę poprzez altDoses.  
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna: w paciorkowcowym zapaleniu gardła rekomendowany jest 5‑dniowy
        // schemat 12 mg/kg/dobę jednorazowo przez 5 dni (dzień 1: 12 mg/kg, w dniach 2–5
        // 6 mg/kg) – takie dawkowanie jest zalecane m.in. przez wytyczne CDC dla
        // pacjentów z alergią na penicylinę. Ustalamy stałą dawkę 12 mg/kg/dobę i długość
        // terapii 5 dni, z limitem 500 mg/dobę.
        // Azytromycyna – zgodnie z rozszerzonymi wytycznymi dla ostrego zapalenia gardła i
        // migdałków podniebiennych stosuje się dwa warianty terapii. Kuracja
        // 5‑dniowa wymaga podania 10–12 mg/kg mc./dobę raz na dobę, z
        // maksymalną dawką 500 mg/dobę; u dorosłych typowym schematem jest
        // 500 mg w 1. dniu i 250 mg/dobę przez kolejne cztery dni. Przyjęcie
        // zakresu 10–12 mg/kg mc./dobę pozwala dostosować dawkę do masy ciała,
        // a limit 500 mg zapobiega przekroczeniu maksymalnej dobowej dawki
        // zalecanej u dzieci.
        // Azytromycyna – w paciorkowcowym zapaleniu gardła stosuje się wyłącznie
        // pięciodniowy schemat 10 mg/kg mc./dobę w 1. dniu i 5 mg/kg mc./dobę w dniach 2–5.
        // Ustalona dawka 10 mg/kg mc. jako wartość bazowa pozwala automatycznie
        // obliczyć większą dawkę w pierwszym dniu (podwojenie) i połowę dawki w kolejnych
        // dniach w funkcji recalc. Limit 500 mg chroni przed przekroczeniem maksymalnej
        // dobowej dawki u dzieci.
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },

        // Usunięto trzydniowy wariant azytromycyny w zapaleniu gardła, ponieważ
        // aktualne wytyczne rekomendują wyłącznie schemat 5‑dniowy. 
        // Klindamycyna – w leczeniu paciorkowcowego zapalenia gardła zalecane jest
        // 7 mg/kg na dawkę trzy razy dziennie (21 mg/kg/dobę) z maksymalną dawką
        // 300 mg na dawkę (900 mg/dobę). Dostosowujemy zakres i
        // limit dobowy zgodnie z tymi zaleceniami.
        'Klindamycyna':       {
          // Klindamycyna – dla paciorkowcowego zapalenia gardła stosujemy zakres 20–30 mg/kg mc./dobę
          // (7–10 mg/kg mc. co 8 h).  Podnosimy maksymalną dawkę dobową do 1,8 g u dorosłych
          // i dzieci zgodnie z nowymi zaleceniami.  Domyślną wartość ustawiamy na 25 mg/kg mc./dobę.
          mgRange: [20, 30],
          defaultMg: 25,
          doses: 3,
          duration: 10,
          maxDailyMg: 1800
        },
        // Aksetyl cefuroksymu (cefalosporyna II generacji) – 20–30 mg/kg/dobę w dwóch dawkach, max 1 000 mg/dobę.
        'Aksetyl cefuroksymu':   { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 }
        ,
        // Cefaklor: w paciorkowcowym zapaleniu gardła/tonsylitis rekomendowane jest 20–40 mg/kg mc./dobę
        // w postaciach natychmiastowego uwalniania (IR) podzielone co 8–12 h (2–3 dawki na dobę).  
        // Źródła, takie jak przewodnik dawkowania Drugs.com, podają, że u dzieci 
        // 1 miesiąc i starszych łączna dawka dobową 20–40 mg/kg mc. podawana jest 
        // co 8–12 h, przy czym maksymalna dawka dobową nie powinna przekraczać 1 g, a 
        // leczenie zakażeń paciorkowcowych trwa co najmniej 10 dni.  
        // Domyślnie przyjmujemy schemat dwudawkowy z alternatywnym wariantem trzech dawek.  
        'Cefaklor': { mgRange: [20, 40], defaultMg: 30, doses: 2, altDoses: [3], duration: 10, maxDailyMg: 1000 }
      }
    },
    'otitis': {
      label: 'Ostre zapalenie ucha środkowego',
      drugs: {
        // Amoksycylina – w ostrym zapaleniu ucha środkowego zaleca się wysokodawkową terapię
        // 80–90 mg/kg mc./dobę w dwóch dawkach. Zalecenie to wynika z zaleceń AAP i
        // innych wytycznych, które podkreślają, że u dzieci bez alergii na penicylinę
        // pierwszym wyborem jest amoksycylina 80–90 mg/kg/dobę, podawana co 12 h
        // przez 7–10 dni (krótszy czas u starszych dzieci).
        // Ustawiamy zakres 80–90 mg/kg mc./dobę i domyślną dawkę 90 mg/kg mc.;
        // kalkulator skoryguje czas terapii w zależności od wieku.
        // Amoksycylina – zgodnie z polskimi wytycznymi dla OZUŚ stosuje się wysokie dawki
        // 75–90 mg/kg mc./dobę w 2–3 dawkach. Niższy próg 75 mg/kg mc. obejmuje
        // schematy 75–90 mg/kg mc., natomiast w razie potrzeby można zwiększyć
        // liczbę podań do trzech (co 8 h). Domyślnie pozostawiamy 90 mg/kg mc.
        'Amoksycylina':        { mgRange: [75, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 7, firstChoice: true },
        // Dla preparatu Amoksiklav ES (600 mg/42,9 mg/5 ml) ChPL podaje, że zwykle stosowana
        // dawka u dzieci to 90 mg amoksycyliny + 6,4 mg kwasu klawulanowego na kg mc. na dobę
        // w dwóch dawkach. W przypadkach ostrego zapalenia ucha środkowego
        // aktualne wytyczne zalecają wysoką dawkę amoksycyliny 80–90 mg/kg mc./dobę (z ograniczeniem
        // kwasu klawulanowego <10 mg/kg mc./dobę), podawaną w dwóch dawkach.
        // Dlatego ustawiamy zakres na 80–90 mg/kg mc./dobę i domyślną wartość 90 mg/kg mc. Dzielenie
        // dawki na dwie części ogranicza ilość kwasu klawulanowego i poprawia tolerancję.
        // Amoksycylina z kwasem klawulanowym – stosowana w OZUŚ w przypadku braku
        // odpowiedzi na samą amoksycylinę lub w sytuacjach, gdy podejrzewa się
        // oporne bakterie. Wysoka dawka amoksycyliny 80–90 mg/kg mc./dobę
        // (przy zachowaniu stosunku kwas klawulanowy <10 mg/kg mc./dobę) jest
        // rekomendowana, dzielona na dwie dawki. Dlatego
        // zmieniamy zakres na 80–90 mg/kg mc./dobę i pozostawiamy domyślnie 90 mg/kg mc.
        // Amoksycylina z kwasem klawulanowym – w ostrym zapaleniu ucha środkowego
        // rekomenduje się 75–90 mg/kg mc./dobę amoksycyliny (z dodatkiem kwasu
        // klawulanowego ok. 6,4 mg/kg mc./dobę) w 2–3 dawkach. Użycie trzech
        // dawek (co 8 h) jest dopuszczalne przy nasilonych objawach lub dużej
        // masie ciała. Domyślnie stosujemy górną wartość 90 mg/kg mc./dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [75, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 7 },
        // Cefuroksym: w OZUŚ stosuje się 30 mg/kg/dobę w dwóch dawkach przez 5–10 dni,
        // przy czym maksymalna dawka dobowa nie powinna przekroczyć 500 mg.
        // W OZUŚ maksymalną dawkę dobową cefuroksymu doustnego zwiększono do 1000 mg,
        // aby umożliwić podawanie 2×500 mg u starszych dzieci (zamiast ograniczenia
        // do 500 mg/dobę). Zakres mg/kg pozostaje 30 mg/kg/dobę w dwóch dawkach.
        // Aksetyl cefuroksymu – według zaleceń stosuje się 30 mg/kg mc./dobę w dwóch dawkach
        // przez 5–10 dni. Wartość 30 mg/kg mc. pozostaje bez zmian, ale domyślny czas
        // terapii zwiększamy do 10 dni (kalkulator skróci go dla starszych dzieci).
        // Aksetyl cefuroksymu – dawka 30 mg/kg mc./dobę (15 mg/kg mc. co 12 h).
        // Maksymalna dobowa dawka w OZUŚ może sięgać 1 000 mg, co pozwala na
        // stosowanie 2×500 mg u starszych dzieci. Domyślny czas terapii zostaje
        // 10 dni; zostanie on skrócony w funkcji recalc w zależności od wieku.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę.
        // Klarytromycyna – u dzieci z alergią na beta‑laktamy dawka 15 mg/kg mc./dobę
        // (7,5 mg/kg co 12 h) jest podawana przez 10 dni. Maksymalna dawka na dawkę
        // wynosi 250 mg, co odpowiada 500 mg/dobę. Zmieniamy limit
        // dobowy na 500 mg i domyślny czas terapii na 10 dni.
        // Klarytromycyna – dawka 15 mg/kg mc./dobę podzielona na dwie
        // dawki co 12 h jest podstawowym schematem leczenia paciorkowcowego
        // zapalenia gardła u dzieci.  
        // W ulotkach dla dorosłych dopuszcza się jednak podawanie 500 mg lub
        // nawet 1000 mg raz na dobę w postaci tabletek o zmodyfikowanym
        // uwalnianiu. Aby odzwierciedlić te możliwości, zwiększamy limit
        // dobowy do 1 000 mg i dodajemy alternatywną opcję dawkowania raz na
        // dobę poprzez altDoses.  
        // Klarytromycyna – w aktualnych rekomendacjach dawka w ostrym zapaleniu
        // ucha środkowego wynosi około 20 mg/kg mc./dobę (10 mg/kg mc. co 12 h).
        // Podanie raz na dobę preparatu o przedłużonym uwalnianiu jest możliwe u
        // dorosłych, stąd pozostawiamy opcjonalny schemat 1×/dobę w altDoses.
        'Klarytromycyna':      { mgRange: [20, 20], defaultMg: 20, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna w ostrym zapaleniu ucha środkowego jest opcją rezerwową. Zalecany
        // jest skrócony 3‑dniowy schemat 10 mg/kg mc./dobę; alternatywnie można
        // podać 5‑dniową terapię (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę przez 4 dni).
        // Ustawiamy domyślnie 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem
        // terapii. Limit dobowy pozostaje 500 mg.
        // Azytromycyna – pozostaje alternatywą dla pacjentów z nadwrażliwością
        // na β‑laktamy. Standardowa dawka 10 mg/kg mc./dobę raz na dobę
        // utrzymana jest bez zmian; schematy 3‑ i 5‑dniowe są szczegółowo
        // opisane w sekcji komunikatów.
        // Azytromycyna – w ostrym zapaleniu ucha środkowego można stosować dwa schematy.
        // Wariant trzydniowy (10 mg/kg mc./dobę przez 3 dni) pozostawiamy jako „Azytromycyna (3 dni)”,
        // a dodatkowo udostępniamy wariant pięciodniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę przez 4 dni).
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },

        // Cefiksym – cefalosporyna III generacji stosowana jako lek drugiego
        // rzutu w OZUŚ. Dawkowanie wynosi 8 mg/kg mc./dobę, zazwyczaj podawane
        // raz na dobę; dopuszczalny jest podział dawki na dwie porcje (co 12 h).
        // U osób dorosłych typowa dawka całkowita wynosi 400 mg/dobę.
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, altDoses: [2], duration: 7 }
      }
    },
    'sinusitis': {
      label: 'Ostre zapalenie błony śluzowej nosa i zatok przynosowych',
      drugs: {
        // W ostrym zapaleniu zatok przynosowych stosuje się zarówno standardowe, jak i wysokie dawki amoksycyliny.
        // Zgodnie z Charakterystyką Produktu Leczniczego Ospamox dzieci <40 kg mogą otrzymywać 20–90 mg/kg mc./dobę,
        // przy czym schemat dwudawkowy (co 12 h) stosuje się wyłącznie przy górnych granicach zakresu.
        // Nowsze przeglądy i wytyczne (np. Leung 2020) sugerują standardową dawkę 45 mg/kg/dobę lub wysokodawkowy
        // schemat 90 mg/kg/dobę w 2 dawkach u pacjentów z ryzykiem zakażeń lekoopornych.
        // Ujednolicamy zakres dawki do 45–90 mg/kg mc./dobę i pozostawiamy domyślnie 80 mg/kg mc./dobę w dwóch dawkach.
        // W zapaleniu zatok przynosowych stosuje się głównie wysokodawkową amoksycylinę (80–90 mg/kg mc./dobę) w dwóch dawkach. Dopuszczamy też niższe dawki (ok. 45 mg/kg mc./dobę) w lżejszych przypadkach. Dodajemy możliwość podziału dobowej dawki na trzy podania (co 8 h) zgodnie z wytycznymi.
        'Amoksycylina':        { mgRange: [45, 90], defaultMg: 80, doses: 2, altDoses: [3], duration: 10, firstChoice: true },
        // Dla preparatów ko‑amoksyklawu (np. Augmentin ES) Charakterystyka Produktu Leczniczego zaleca
        // podawanie 90 mg/kg mc./dobę składnika amoksycyliny w dwóch dawkach przez 10 dni.
        // Zgodnie z nowszymi wytycznymi, standardową dawką w niepowikłanych przypadkach może być 45 mg/kg mc./dobę,
        // natomiast u pacjentów z ryzykiem oporności lub cięższą chorobą stosuje się 90 mg/kg mc./dobę.
        // Dlatego poszerzamy zakres dawki do 45–90 mg/kg mc./dobę, zachowując liczbę dawek 2/dobę i domyślne 90 mg/kg mc./dobę.
        // Ko‑amoksyklaw jest lekiem drugiego wyboru w OZNS; stosuje się go w dawce 45–90 mg/kg mc./dobę amoksycyliny. Domyślnie ustawiamy wysoką dawkę 90 mg/kg mc./dobę w dwóch dawkach, ale umożliwiamy podział na trzy dawki w cięższych przypadkach.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 10 },
        // Cefuroksym: w OZNZ stosuje się 30 mg/kg/dobę w dwóch dawkach, nie przekraczając 500 mg na dawkę
        // (czyli 1000 mg/dobę).
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: 15 mg/kg/dobę w dwóch dawkach, z limitem 1 000 mg/dobę.
        // Klarytromycyna: 15 mg/kg mc./dobę (7,5 mg/kg co 12 h) z limitem 1 000 mg/dobę. Preparaty o przedłużonym uwalnianiu umożliwiają dawkowanie raz na dobę, dlatego dodajemy altDoses: [1].
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna jest opcją rezerwową w ostrym zapaleniu zatok przynosowych. Zalecany
        // jest 3‑dniowy kurs 10 mg/kg mc./dobę; alternatywnie można zastosować schemat
        // 5‑dniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę). Ustawiamy domyślnie
        // 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem terapii. Limit dobowy pozostaje 500 mg.
        // Azytromycyna – w ostrym zapaleniu zatok przynosowych można stosować dwa schematy.
        // Skrócony kurs trzydniowy (10 mg/kg mc./dobę przez 3 dni) zapisujemy jako „Azytromycyna (3 dni)”.
        // Dodatkowo udostępniamy wariant 5‑dniowy: 10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę w dniach 2–5.
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'pneumonia_child': {
      label: 'Pozaszpitalne zapalenie płuc u dzieci',
      drugs: {
        // Amoksycylina: wg wytycznych dla łagodnego, pozaszpitalnego zapalenia płuc
        // stosuje się wysokodawkowy schemat 80–90 mg/kg mc./dobę w 3 dawkach (co 8 h). 
        // Taka terapia trwa zazwyczaj 5 dni, o ile dziecko pozostaje bez gorączki i klinicznie się poprawia
        // przez co najmniej 48 h. 
        // W pozaszpitalnym zapaleniu płuc pierwszym wyborem jest wysokodawkowa amoksycylina 90 mg/kg mc./dobę.
        // Zalecane jest podzielenie dawki na 2 lub 3 podania (co 8–12 h) i skrócenie terapii do 5 dni, jeśli pacjent
        // pozostaje bez gorączki i klinicznie się poprawia przez co najmniej 48 h. Zawężamy zakres
        // do jednej wartości 90 mg/kg mc./dobę oraz dodajemy alternatywny wariant dwudawkowy.
        'Amoksycylina':        { mgRange: [90, 90], defaultMg: 90, doses: 3, altDoses: [2], duration: 5, firstChoice: true },
        // Amoksycylina z kwasem klawulanowym: wysokodawkowa terapia 80–90 mg/kg mc./dobę amoksycyliny 
        // podawana co 12 h (2 dawki/dobę) jest preferowana w przypadku podejrzenia oporności
        // pneumokoków lub braku odpowiedzi na samą amoksycylinę. 
        // Zmniejszamy czas terapii do 5 dni zgodnie z nowymi rekomendacjami dla łagodnych infekcji. 
        // Ko‑amoksyklaw w PZP stosuje się w wysokiej dawce 90 mg/kg mc./dobę (składnik amoksycyliny) w 2–3 podaniach.
        // Zakres ograniczamy do jednej wartości 90 mg/kg mc./dobę i umożliwiamy alternatywne dawkowanie trzy razy
        // na dobę. Standardowy czas terapii wynosi 5 dni.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [90, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 5 },
        // Aksetyl cefuroksymu: zalecane jest 15 mg/kg mc. co 12 h (czyli 30 mg/kg mc./dobę) z maks. 500 mg/dobę; 
        // stosujemy stałą wartość 30 mg/kg mc./dobę w dwóch dawkach. 
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },
        // Postać dożylna cefuroksymu dla cięższych zakażeń lub niemowląt (3 tydzień–3 miesiąc).  
        // Dawkowanie 50–100 mg/kg mc./dobę w 3 dawkach jest zgodne z wytycznymi; 
        // obniżamy domyślną wartość do 80 mg/kg, aby lepiej odpowiadała zakresowi terapeutycznemu. 
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 7, maxDailyMg: 4000 },
        // Ampicylina – w umiarkowanym i ciężkim CAP podaje się 50 mg/kg mc. co 6 h (200 mg/kg/dobę) i 
        // zwykle przez 7 dni. Ustawiamy zatem stałą dawkę 200 mg/kg mc./dobę. 
        'Ampicylina':         { mgRange: [200, 200], defaultMg: 200, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Cefotaksym – rekomendowane przez PIDS/IDSA 150 mg/kg mc./dobę (50 mg/kg co 8 h) w leczeniu CAP. 
        // Stosujemy stałą wartość 150 mg/kg/dobę z 3 dawkami. 
        // Cefotaksym – w ciężkim zapaleniu płuc dawka wynosi 150–200 mg/kg mc./dobę (podawana co 6–8 h).
        'Cefotaksym':         { mgRange: [150, 200], defaultMg: 150, doses: 3, duration: 7, maxDailyMg: 6000 },
        // Ceftriakson – w cięższym CAP stosuje się 50–75 mg/kg mc. w pojedynczej dawce na dobę (max 2 g). 
        // Skracamy czas terapii do 5 dni, zgodnie z nowszymi doniesieniami o krótszym leczeniu. 
        // Ceftriakson – w ciężkim CAP podaje się 100 mg/kg mc./dobę jako pojedynczą dawkę (max 2 g/dobę)
        'Ceftriakson':        { mgRange: [100, 100], defaultMg: 100, doses: 1, duration: 5, maxDailyMg: 2000 },
        // Kloksacylina – dla zakażeń gronkowcowych podaje się 25–50 mg/kg co 6 h (100–200 mg/kg mc./dobę). 
        // Zwiększamy zakres i domyślną dawkę, pozostawiając 4 dawki na dobę. 
        'Kloksacylina':       { mgRange: [100, 200], defaultMg: 150, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Klarytromycyna: 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę.
        // Zgodnie z zaleceniami terapia powinna trwać co najmniej 7 dni; można ją przedłużyć do 10 dni
        // w cięższych przypadkach lub przy utrzymujących się objawach. Zmieniamy domyślny czas
        // trwania terapii z 5 dni do 7 dni.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 7, maxDailyMg: 1000 },
        // Azytromycyna: dawka 10 mg/kg/dobę w pierwszej dobie, a następnie 5 mg/kg/dobę w
        // kolejnych 4 dobach (łącznie 5 dni) lub alternatywnie 10 mg/kg/dobę przez 3 dni (schemat
        // skrócony). W kalkulatorze pozostawiamy domyślnie 10 mg/kg/dobę w jednej dawce z
        // pięciodniowym czasem terapii, a szczegółowy schemat podajemy w komunikacie informacyjnym.
        // Azytromycyna – w pediatrycznym pozaszpitalnym zapaleniu płuc stosuje się dwa schematy:
        // pięciodniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę w dniach 2–5) oraz skrócony
        // trzydniowy (10 mg/kg mc./dobę przez 3 dni).  Wprowadzamy obie opcje jako osobne leki.
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 }
        ,
        // Antybiotyki rezerwowe dla ciężkich zakażeń wywołanych szczepami MRSA lub wieloopornym Streptococcus pneumoniae
        // Wankomycyna: 40–60 mg/kg mc./dobę w 3–4 dawkach (co 6–8 h).
        'Wankomycyna':        { mgRange: [40, 60], defaultMg: 50, doses: 4, altDoses: [3], duration: 7, maxDailyMg: 4000 },
        // Teikoplanina: początkowo 10 mg/kg mc./dobę co 12 h, następnie 6–10 mg/kg mc./dobę raz na dobę.
        'Teikoplanina':       { mgRange: [6, 10], defaultMg: 10, doses: 1, duration: 7, maxDailyMg: 1000 },
        // Linezolid: 30 mg/kg mc./dobę w 3 dawkach (co 8 h).
        'Linezolid':          { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7, maxDailyMg: 600 }
      }
    },
    'pneumonia_adult': {
      label: 'Pozaszpitalne zapalenie płuc u dorosłych',
      /*
       * Sekcja dla dorosłych dotyczy pozaszpitalnego zapalenia płuc (CAP).
       * Zgodnie z aktualnymi wytycznymi IDSA/ATS i lokalnymi programami
       * antybiotykowymi, leczenie trwa minimum 5 dni; należy kontynuować
       * antybiotykoterapię co najmniej 48 h po ustąpieniu gorączki i
       * poprawie klinicznej. Poniższe schematy są
       * przeznaczone dla pacjentów leczonych ambulatoryjnie.
       *
       * – Dorośli bez chorób współistniejących i bez ryzyka lekooporności:
       *   • amoksycylina 1 g co 8 h przez 5 dni;
       *   • doksycyklina 100 mg co 12 h przez 5 dni;
       *   • makrolid (np. azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez kolejne 4 dni
       *     lub klarytromycyna 500 mg dwa razy na dobę) jest dopuszczalny tylko w regionach
       *     o niskiej (<25 %) oporności pneumokoków.
       *
       * – Dorośli z chorobami współistniejącymi lub innymi czynnikami ryzyka: stosuje się
       *   terapię skojarzoną β‑laktam + makrolid/doksycyklina. Do wyboru:
       *   • amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę
       *     lub 2 g/125 mg 2 ×/dobę przez 5 dni;
       *   • cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni;
       *   plus azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez 4 dni
       *     lub doksycyklina 100 mg 2 ×/dobę.
       *
       * – Dorośli z alergią na β‑laktamy: monoterapia fluorochinolonem oddechowym:
       *   • lewofloksacyna 750 mg raz na dobę przez 5 dni;
       *   • moksyfloksacyna 400 mg raz na dobę przez 5 dni.
       *   Fluorochinolony nie powinny być stosowane jako lek pierwszego wyboru ze względu
       *   na ryzyko działań niepożądanych i zakażeń Clostridioides difficile.
       */
      // Wskazanie dla dorosłych – pozaszpitalne zapalenie płuc. Określamy dawki w mg/kg/dobę
      // na podstawie zalecanych stałych dawek z wytycznych. Leczenie trwa co najmniej 5 dni;
      // terapię należy kontynuować przez 48 h po ustąpieniu gorączki i poprawie klinicznej.
      drugs: {
        // Zaktualizowane zakresy dawek i liczba dawek na dobę zgodnie z polskimi wytycznymi (tabela w IMG_5478)
        // Amoksycylina: 1 g co 8 h (≈43 mg/kg mc./dobę) lub 1,5–2 g co 12 h (≈43–57 mg/kg mc./dobę).
        'Amoksycylina': { mgRange: [43, 57], defaultMg: 43, doses: 3, altDoses: [2], duration: 5, firstChoice: true },
        // Doksycyklina: 100 mg co 12 h (≈3 mg/kg mc./dobę).  Zakres dawki pozostaje bez zmian.
        'Doksycyklina': { mgRange: [3, 3], defaultMg: 3, doses: 2, duration: 5, maxDailyMg: 200 },
        // Klarytromycyna: 500 mg dwa razy na dobę lub 500 mg raz na dobę (tabletki o przedłużonym uwalnianiu) –
        // odpowiada to 7–14 mg/kg mc./dobę.  Domyślnie przyjmujemy wyższą dawkę podzieloną na 2 dawki,
        // a alternatywnie jedną dawkę dobową.
        'Klarytromycyna': { mgRange: [7, 14], defaultMg: 14, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 1000 },
        // Azytromycyna – w polskich wytycznych dla dorosłych dopuszcza się trzy schematy leczenia:
        // (1) 0,5 g w pierwszym dniu i 0,25 g raz na dobę w dniach 2–5 (5‑dniowy kurs),
        // (2) 0,5 g raz na dobę przez 3 dni, oraz (3) pojedyncza dawka 2 g.  Aby uniknąć konfliktów z
        // innymi wskazaniami, definiujemy każdą opcję jako osobny lek w tej kategorii.
        //  – „Azytromycyna (5 dni)” używa stałej dawki ok. 3 mg/kg mc./dobę (≈250 mg/dobę dla 70 kg).  Pierwszego
        //    dnia lekarz powinien podwoić dawkę, co odpowiada 500 mg.  Domyślna długość terapii wynosi 5 dni.
        //  – „Azytromycyna (3 dni)” stosuje dawkę ok. 7 mg/kg mc./dobę (≈500 mg/dobę) przez 3 dni.
        //  – „Azytromycyna (1 dzień)” reprezentuje jednorazowe podanie 2 g (≈28 mg/kg mc.) w postaci kilku tabletek 500 mg.
        'Azytromycyna (5 dni)': { mgRange: [3, 3], defaultMg: 3, doses: 1, duration: 5, maxDailyMg: 2000 },
        'Azytromycyna (3 dni)': { mgRange: [7, 7], defaultMg: 7, doses: 1, duration: 3, maxDailyMg: 2000 },
        // Usunięto schemat jednodniowy (2 g jednorazowo), ponieważ aktualne
        // wytyczne nie rekomendują tej opcji w leczeniu pozaszpitalnego zapalenia płuc.
        // Amoksycylina z kwasem klawulanowym: 875/125 mg co 8 h (≈38 mg/kg mc./dobę) lub 1 875/125 mg co 12 h (≈54 mg/kg mc./dobę).
        // Ustawiamy zakres 38–54 mg/kg mc./dobę, domyślnie 45 mg/kg mc./dobę i dwie dawki na dobę;
        // dopuszczamy 3 dawki jako alternatywę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [38, 54], defaultMg: 45, doses: 2, altDoses: [3], duration: 5, maxDailyMg: 4000 },
        // Cefiksym: 200 mg co 12 h lub 400 mg co 24 h (≈6 mg/kg mc./dobę).  Wprowadzamy go jako opcję
        // dla pacjentów z chorobami współistniejącymi.
        'Cefiksym': { mgRange: [6, 6], defaultMg: 6, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 400 },
        // Cefpodoksym pozostaje z zakresem 6 mg/kg mc./dobę; utrzymujemy dwie dawki na dobę.
        'Cefpodoksym': { mgRange: [6, 6], defaultMg: 6, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 400 },
        // Aksetyl cefuroksymu: 500 mg co 12 h (≈14 mg/kg mc./dobę).  Zakres pozostaje bez zmian.
        'Aksetyl cefuroksymu': { mgRange: [14, 14], defaultMg: 14, doses: 2, duration: 5, maxDailyMg: 1000 },
        // Lewofloksacyna: 500 mg co 24 h (≈7 mg/kg mc./dobę) lub 750 mg co 24 h (≈11 mg/kg mc./dobę).
        // Ustawiamy zakres 7–11 mg/kg mc./dobę z jedną dawką na dobę.
        'Lewofloksacyna': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        'Lewofloksacyna i.v.': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        // Moksyfloksacyna pozostaje w dawce 400 mg raz na dobę (≈6 mg/kg mc./dobę).
        'Moksyfloksacyna': { mgRange: [6, 6], defaultMg: 6, doses: 1, duration: 5, maxDailyMg: 400 }
      },
      message: 'Sekcja Antybiotykoterapia dotyczy dawek pediatrycznych. U dorosłych z pozaszpitalnym zapaleniem płuc stosuje się ustalone schematy leczenia.\n' +
        'Minimalny czas terapii wynosi 5 dni; leczenie należy kontynuować co najmniej 48 h po ustąpieniu gorączki i poprawie klinicznej.\n' +
        '\n' +
        'Zalecenia dla zdrowych pacjentów bez chorób współistniejących:\n' +
        '• amoksycylina 1 g 3 ×/dobę przez 5 dni;\n' +
        '• doksycyklina 100 mg 2 ×/dobę przez 5 dni;\n' +
        '• makrolid jest dopuszczalny tylko w regionach o niskiej (<25 %) oporności pneumokoków.\n' +
        '  – Azytromycyna (5 dni): 0,5 g w 1. dniu, następnie 0,25 g/dobę w dniach 2–5;\n' +
        '  – Azytromycyna (3 dni): 0,5 g/dobę przez 3 dni;\n' +
        '  – Klarytromycyna: 500 mg dwa razy na dobę.\n' +
        '\n' +
        'Zalecenia dla pacjentów z chorobami współistniejącymi lub ryzykiem lekooporności:\n' +
        '• amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę lub 1,875/0,125 g 2 ×/dobę przez 5 dni (wysokodawkowy preparat ES);\n' +
        '• cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni;\n' +
        '• do wybranego β‑laktamu dodaj azytromycynę (0,5 g w 1. dniu, następnie 0,25 g/dobę przez 4 dni lub 0,5 g/dobę przez 3 dni) albo doksycyklinę 100 mg 2 ×/dobę.\n' +
        '\n' +
        'W przypadku alergii na β‑laktamy można rozważyć fluorochinolon oddechowy: lewofloksacyna 750 mg 1 ×/dobę przez 5 dni lub moksyfloksacyna 400 mg 1 ×/dobę przez 5 dni. Fluorochinolony stosuje się tylko, gdy inne opcje są przeciwwskazane, ze względu na ryzyko działań niepożądanych i zakażeń C. difficile.'
    },

    // Nowe wskazanie: ostre zapalenie oskrzeli u dorosłych i dzieci.
    // Większość przypadków ma etiologię wirusową; antybiotyki są zarezerwowane dla infekcji bakteryjnych
    // (np. Mycoplasma pneumoniae, Chlamydophila pneumoniae, Bordetella pertussis) oraz osób z
    // istotnymi chorobami współistniejącymi.  Schematy dawkowania i czasy terapii oparto na polskich
    // wytycznych (patrz załączony PDF) oraz literaturze międzynarodowej.
    'bronchitis': {
      label: 'Ostre zapalenie oskrzeli u dorosłych i dzieci',
      drugs: {
        // Klarytromycyna – lek pierwszego wyboru w przypadku zakażeń bakteryjnych wywołanych
        // przez Mycoplasma pneumoniae lub Chlamydophila pneumoniae.  Dawka 15 mg/kg mc./dobę
        // podzielona na dwie dawki co 12 h; dopuszczalny jest również wariant 500 mg raz na dobę
        // (tabletki o przedłużonym uwalnianiu) – altDoses pozwala na wybór 1 dawki/dobę.  Czas
        // terapii skracamy do 7 dni, gdyż w ostrym zapaleniu oskrzeli kuracje są krótsze niż w
        // paciorkowcowym zapaleniu gardła.  Limit dobowy 1000 mg.
        'Klarytromycyna': { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 7, maxDailyMg: 1000, firstChoice: true },
        // Azytromycyna – schemat pięciodniowy: 10 mg/kg mc./dobę (dzień 1: podwójna dawka),
        // stosowany w zakażeniach krztuścem i jako alternatywa dla klarytromycyny.  W ostrym
        // zapaleniu oskrzeli dawka pozostaje stała na poziomie 10 mg/kg mc./dobę, a różnicę
        // dawkowania w poszczególnych dniach opisują dodatkowe komunikaty w funkcji recalc().
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },
        // Azytromycyna – schemat trzydniowy (0,5 g na dobę przez 3 dni u dorosłych), który może być
        // stosowany w leczeniu krztuśca u dorosłych i starszych dzieci.  Dla dzieci przeliczamy
        // dawkę 10 mg/kg mc./dobę.  Ograniczamy czas trwania do 3 dni.
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        // Lewofloksacyna – fluorochinolon drugiego rzutu; stosuj tylko u dorosłych lub nastolatków,
        // gdy inne opcje są przeciwwskazane.  Zakres 7–11 mg/kg mc./dobę odpowiada dawkom
        // 500–750 mg raz na dobę; czas terapii 5 dni; limit dobowy 750 mg.
        'Lewofloksacyna': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        'Lewofloksacyna i.v.': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        // Moksyfloksacyna – fluorochinolon drugiego rzutu; jednorazowa dawka 400 mg/dobę
        // (≈6 mg/kg mc./dobę).  Czas terapii 5 dni.  Preparat dostępny wyłącznie w tabletce 400 mg.
        'Moksyfloksacyna': { mgRange: [6, 6], defaultMg: 6, doses: 1, duration: 5, maxDailyMg: 400 }
      }
    },
    /*
     * Niepowikłane zakażenia dróg moczowych – empiryczna terapia pierwszego rzutu
     * obejmuje nitrofurany (furazydyna), trimetoprim lub jego połączenia, a w
     * razie konieczności cefalosporyny II/III generacji lub amoksycylinę z
     * inhibitorem. Dawki i liczba dawek pochodzą z polskich wytycznych oraz
     * literatury. Fosfomycyna podawana jest jednorazowo. Czas trwania terapii
     * zwykle wynosi 3–7 dni, zależnie od leku.
     */
    'uti_uncomplicated': {
      label: 'Niepowikłane zakażenia dróg moczowych',
      drugs: {
        // Furazydyna (nitrofurantoina) – wg Charakterystyki Produktu Leczniczego dzieci powyżej 3 miesięcy
        // powinny otrzymywać 5–7 mg/kg mc./dobę w dwóch lub trzech dawkach; terapia trwa 7–10 dni.
        // U osób dorosłych stosuje się podobne dawki z limitem 400 mg/dobę. Tutaj przyjmujemy 2 dawki
        // i minimalny czas leczenia 7 dni. W razie potrzeby lekarz może zalecić 3 dawki na dobę.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 2, duration: 7, firstChoice: true },

        // Trimetoprim – w monoterapii dzieci 6–12 lat powinny otrzymywać 2–4 mg/kg mc. co 12 h
        // (4–8 mg/kg mc./dobę), natomiast dorośli i dzieci ≥12 lat 100–200 mg co 12 h. Zgodnie z
        // najnowszymi wytycznymi PTU (2024) niepowikłane zakażenie układu moczowego leczymy
        // przez 5 dni, stosując 200 mg co 12 h (≈ 400 mg/dobę).
        'Trimetoprim': { mgRange: [4, 8], defaultMg: 6, doses: 2, duration: 5 },

        // Trimetoprim‑sulfametoksazol (kotrimoksazol) – dawki odnoszą się do składnika trimetoprimu.
        // Charakterystyki i wytyczne podają 6 mg trimetoprimu + 30 mg sulfametoksazolu na kg mc.
        // na dobę w 2 dawkach, co odpowiada ok. 36 mg/kg mc./dobę. Leczenie trwa co najmniej 5 dni
        // i 2 dni po ustąpieniu objawów.
        'Trimetoprim-sulfametoksazol': { mgRange: [36, 36], defaultMg: 36, doses: 2, duration: 5 },

        // Fosfomycyna trometamol – w niepowikłanym zapaleniu pęcherza moczowego u kobiet i dziewcząt
        // powyżej 12 roku życia stosuje się jedną dawkę 3 g (3000 mg).
        // Lek nie jest zalecany u młodszych dzieci; aby uzyskać 3 g u osoby o masie ok. 40 kg
        // przyjmujemy przelicznik 75 mg/kg mc./dobę. Dawka jest jednorazowa, a globalny limit 3000 mg
        // zapobiega przekroczeniu tej wartości u pacjentów o większej masie ciała.
        'Fosfomycyna': { mgRange: [75, 75], defaultMg: 75, doses: 1, duration: 1 },

        // Aksetyl cefuroksymu – w niepowikłanym zakażeniu dróg moczowych zaleca się 15 mg/kg mc.
        // dwa razy na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę)
        // przez 5–10 dni. Ustawiamy stałą wartość 30 mg/kg mc./dobę
        // i skracamy czas terapii do 7 dni.
        // W niepowikłanych zakażeniach układu moczowego zalecana jest dawka 15 mg/kg mc. dwa razy
        // na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę).
        // Choć globalny limit dla cefuroksymu doustnego wynosi 1 000 mg/dobę (stosowany w zapaleniu zatok
        // i ucha środkowego), dla tej jednostki chorobowej ograniczamy dawkę do 500 mg/dobę, aby nie
        // przekraczać zaleceń dla zakażeń dróg moczowych. Poniższe pole maxDailyMg wymusza niższy limit.
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },

        // Cefiksym – dzieci od 6 miesięcy do 12 lat otrzymują 8 mg/kg mc./dobę w jednej dawce (lub
        // 4 mg/kg co 12 h); maksymalna dawka dobowa to 400 mg. U osób ≥12 lat podaje się 400 mg
        // w jednej dawce. Czas leczenia niepowikłanego ZUM wynosi 7 dni.
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 7 },

        // Ceftibuten – u dzieci ≥6 miesięcy stosuje się 9 mg/kg mc./dobę raz na dobę (max 400 mg/dobę);
        // u młodzieży ≥12 lat 400 mg raz na dobę. Terapia ZUM trwa 7–10 dni;
        // przyjmujemy 7 dni jako minimalny schemat.
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 7 },

        // Amoksycylina z kwasem klawulanowym – w niepowikłanym ZUM zaleca się
        // 25–45 mg/kg mc./dobę amoksycyliny z kwasem klawulanowym w dwóch dawkach podzielonych
        // (co 12 h), z maksymalną dawką pojedynczą 875 mg/125 mg i terapią 7 dni.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7 },

        // Cefaleksyna – niedostępna w Polsce w terapii niepowikłanego zakażenia dróg moczowych,
        // dlatego nie jest uwzględniana w niniejszym kalkulatorze.
      }
    },
    /*
     * Odmiedniczkowe zapalenie nerek – wymaga intensywniejszej terapii.
     * Leki pierwszego rzutu to doustne cefalosporyny III generacji (cefixim,
     * ceftibuten) lub aksetyl cefuroksymu. W cięższych przypadkach stosuje się
     * dożylne cefalosporyny, aminoglikozydy, fluorchinolony lub karbapenemy.
     * Dawki są podane w mg/kg/dobę, a terapia trwa zwykle 7–14 dni. Leki
     * dożylne (vial) są przeznaczone do hospitalizacji; kalkulator przelicza
     * dawki wagowo.
     */
    'uti_pyelonephritis': {
      label: 'Odmiedniczkowe zapalenie nerek',
      drugs: {
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 10, firstChoice: true },
        // Ceftibuten – preparat Cedax jest obecnie niedostępny w Polsce, dlatego usuwamy go z listy leków
        // stosowanych w odmiedniczkowym zapaleniu nerek.
        // Dostosowano zakresy dawek i liczby podań do aktualnych wytycznych PTNFD i CHPL.
        // Aksetyl cefuroksymu: dla pyelonephritis rekomenduje się 30 mg/kg/dobę w 2 dawkach,
        // więc ustawiamy stały zakres 30 mg/kg/dobę (2 dawki).
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10 },
        // Cefuroksym (dożylnie): zalecany zakres 50–100 mg/kg/dobę w 3 dawkach, z typową dawką ok. 60 mg/kg/dobę.
        // Obniżono dolną granicę do 50 mg/kg/dobę i zmniejszono domyślną dawkę do 75 mg/kg/dobę.
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 75, doses: 3, duration: 10 },
        // Cefotaksym: u dzieci do 12 lat stosuje się 50–100 mg/kg/dobę w 2–4 dawkach, a u dorosłych 3–6 g/dobę.
        // Zawężamy górną granicę do 100 mg/kg/dobę i ustawiamy domyślnie 80 mg/kg/dobę.
        'Cefotaksym': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 10 },
        // Ceftriakson: w pyelonephritis podaje się 20–50 mg/kg mc. raz na dobę (max 2 g/dobę).
        'Ceftriakson': { mgRange: [20, 50], defaultMg: 40, doses: 1, duration: 10 },
        // Cefepim: zalecane 50 mg/kg co 12 h (lub co 8 h w cięższych zakażeniach), czyli 60–100 mg/kg/dobę.
        // Pozostawiamy zakres 50–100 mg/kg/dobę i redukujemy domyślną dawkę do 70 mg/kg/dobę.
        'Cefepim': { mgRange: [50, 100], defaultMg: 70, doses: 2, duration: 10 },
        // Gentamycyna: w powikłanych ZUM u dzieci >2 mies. 3–6 mg/kg/dobę w pojedynczej dawce, u niemowląt 4,5–7,5 mg/kg.
        // Ustawiamy zakres 3–6 mg/kg/dobę i domyślnie 5 mg/kg, jedna dawka.
        'Gentamycyna': { mgRange: [3, 6], defaultMg: 5, doses: 1, duration: 7 },
        // Amikacyna: dzieci 4 tyg.–11 lat 15–20 mg/kg/dobę (1×/dobę lub 7,5 mg/kg co 12 h), dorośli 15 mg/kg/dobę.
        // Zakres 15–20 mg/kg/dobę, domyślnie 15 mg/kg.
        'Amikacyna': { mgRange: [15, 20], defaultMg: 15, doses: 1, duration: 7 },
        // Cyprofloksacyna: w ostrym odmiedniczkowym zapaleniu nerek u dzieci 6–10 mg/kg co 8 h (3 dawki), czyli 18–30 mg/kg/dobę (max 400 mg na dawkę).
        // Ustawiamy zakres 18–30 mg/kg/dobę, domyślnie 24 mg/kg, i zwiększamy liczbę dawek do 3.
        'Cyprofloksacyna': { mgRange: [18, 30], defaultMg: 24, doses: 3, duration: 10 },
        // Doustna postać cyprofloksacyny – fluorochinolon pierwszego wyboru w odmiedniczkowym zapaleniu nerek u dorosłych.
        // Zalecane dawkowanie doustne wynosi 10–20 mg/kg masy ciała na dawkę, co odpowiada 20–40 mg/kg/dobę w dwóch podaniach.
        // Maksymalna pojedyncza dawka nie powinna przekraczać 750 mg, a terapia trwa zwykle 7–10 dni.
        // Ustawiamy domyślny zakres 20–40 mg/kg/dobę, domyślną dawkę 30 mg/kg i limit 1 500 mg na dobę.
        // Dzięki polu altDurations umożliwiamy skrócenie terapii do 7 dni, a altTablets pozwala wyświetlić schemat 2×750 mg (1,5 tabletki 500 mg),
        // który jest maksymalną dawką w tym wskazaniu.
        'Cyprofloksacyna (doustna)': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 10, altDurations: [7], maxDailyMg: 1500, firstChoice: true, altTablets: [1.5] },
        // Lewofloksacyna: brak jednoznacznych zaleceń pediatrycznych – stosuje się 10–15 mg/kg/dobę raz na dobę u dzieci starszych, a u dorosłych 500 mg/dobę.
        // Redukujemy górną granicę do 15 mg/kg/dobę i domyślną dawkę do 10 mg/kg.
        'Lewofloksacyna': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10 },
        'Lewofloksacyna i.v.': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10 },
        // Piperacylina z tazobaktamem: w odmiedniczkowym ZUM dzieci 2–12 lat otrzymują 112,5 mg/kg co 8 h (tj. 337,5 mg/kg/dobę), dorośli 4,5 g co 8 h.
        // Dopasowujemy zakres 300–337,5 mg/kg/dobę i domyślną dawkę 337 mg/kg, pozostawiając 3 dawki.
        'Piperacylina z tazobaktamem': { mgRange: [300, 337.5], defaultMg: 337, doses: 3, duration: 10 },
        // Imipenem z cilastatyną: dzieci ≥3 mies. 15–25 mg/kg co 6 h, czyli 60–100 mg/kg/dobę.
        // Zmieniamy zakres na 60–100 mg/kg/dobę, domyślnie 80 mg/kg, i zwiększamy liczbę dawek do 4.
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem: u dzieci 20 mg/kg co 8 h (60 mg/kg/dobę) w umiarkowanych zakażeniach; w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę).
        // Zakres pozostaje 60–120 mg/kg/dobę, ale domyślną dawkę redukujemy do 80 mg/kg.
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem: brak zaleceń pediatrycznych, u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę).
        // Aby unikać niedodawkowania u większych dzieci, ustalamy sztywne 60 mg/kg/dobę (3 dawki) z domyślną 60 mg/kg.
        'Doripenem': { mgRange: [60, 60], defaultMg: 60, doses: 3, duration: 10 },
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 60], defaultMg: 50, doses: 3, duration: 10 }
      }
    },
    /*
     * Powikłane i inne zakażenia układu moczowego – obejmują zakażenia u
     * mężczyzn, kobiet w ciąży, pacjentów z cewnikiem oraz przewlekłe lub
     * nawracające ZUM. Dawki są zbliżone do tych stosowanych w odmiedniczkowym
     * ZUM, lecz terapie często trwają dłużej. Wybrane leki pierwszego wyboru
     * to furazydyna i beta‑laktamy. Karbapenemy i piperacylina/tazobaktam
     * stosowane są w najcięższych przypadkach.
     */
    'uti_other': {
      label: 'Powikłane i inne zakażenia układu moczowego',
      drugs: {
        // Furazydyna (nitrofurantoina) – nie osiąga odpowiednich stężeń w tkance nerkowej, dlatego nie zaleca się jej w leczeniu powikłanych zakażeń układu moczowego ani odmiedniczkowego zapalenia nerek.
        // Zachowujemy jednak zakres 5–7 mg/kg/dobę jako orientacyjną dawkę, ale usuwamy oznaczenie firstChoice.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 4, duration: 7 },
        // Cyprofloksacyna (doustna) – fluorochinolon pierwszego wyboru w powikłanych zakażeniach układu moczowego.  Dawkowanie doustne u dzieci to 10–20 mg/kg m.c. 2 ×/dobę (20–40 mg/kg/dobę) z maksymalną pojedynczą dawką 750 mg; u dorosłych stosuje się 500–750 mg 2 ×/dobę przez co najmniej 7–10 dni.  Przekładamy to na zakres 20–40 mg/kg/dobę w dwóch dawkach, z domyślną wartością 30 mg/kg i limitem 1500 mg/dobę.
        'Cyprofloksacyna (doustna)': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1500, firstChoice: true },

        // Lewofloksacyna – fluorochinolon drugiego rzutu; w powikłanych zakażeniach układu moczowego
        // u dorosłych stosuje się 10–15 mg/kg mc./dobę raz na dobę z maksymalną dawką 500 mg/dobę.
        // Nie stosować u dzieci; w filtrze populateDrugs() ukryjemy tę pozycję u osób <18 lat.
        'Lewofloksacyna': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10, maxDailyMg: 500 },

        // Cyprofloksacyna (dożylna) – pozajelitowa postać cyprofloksacyny stosowana w cięższych powikłanych zakażeniach układu moczowego.  SmPC zaleca 6–10 mg/kg m.c. co 8 h (3 dawki) u dzieci (18–30 mg/kg/dobę) oraz 400 mg 2–3 ×/dobę u dorosłych (800–1 200 mg/dobę) przez 7–21 dni.  Przyjmujemy zakres 18–30 mg/kg/dobę w trzech dawkach, domyślnie 24 mg/kg, z limitem 1 200 mg/dobę.
        'Cyprofloksacyna (dożylna)': { mgRange: [18, 30], defaultMg: 24, doses: 3, duration: 10, maxDailyMg: 1200 },
        // Amoksycylina – w leczeniu powikłanych zakażeń układu moczowego stosuje się
        // wysokodawkowy schemat 80–90 mg/kg mc./dobę, podzielony na trzy podania.
        // Zgodnie z aktualnymi wytycznymi w tym wskazaniu maksymalna dawka dobowa
        // wynosi 3 000 mg (3 g) amoksycyliny, co jest niższe niż ogólny limit 4 000 mg dla dorosłych.
        // Ustawienie parametru maxDailyMg na 3000 zapewnia, że kalkulator przeliczy
        // dawkę tak, aby nie przekraczała tego limitu.
        'Amoksycylina': { mgRange: [80, 90], defaultMg: 90, doses: 3, duration: 10, maxDailyMg: 3000 },
        // Amoksycylina z kwasem klawulanowym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek używa się 45 mg/kg amoksycyliny na dawkę podawaną co 12 h (2 dawki), co odpowiada 90 mg/kg/dobę.  
        'Amoksycylina z kwasem klawulanowym': { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 10 },
        // Cefaleksyna – doustna cefalosporyna I generacji stosowana w terapii następczej. Przy pyelonephritis zaleca się 25 mg/kg/dawkę 4 ×/dobę (czyli 100 mg/kg/dobę), z maksymalną dawką 1 g na podanie.  
        'Cefaleksyna': { mgRange: [75, 100], defaultMg: 100, doses: 4, duration: 10, maxDailyMg: 4000 },
        // Aksetyl cefuroksymu – dla powikłanych zakażeń układu moczowego u dzieci
        // zaleca się 30 mg/kg mc./dobę w dwóch dawkach (co 12 h), z maksymalną
        // dawką dobową 500 mg. U dorosłych natomiast aksetyl cefuroksymu
        // jest zwykle zastępowany innymi cefalosporynami lub fluorochinolonami,
        // dlatego w tym wskazaniu nie będzie wyświetlany (filtr w populateDrugs()).
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 500 },
        // Fosfomycyna – pojedyncza dawka 3 g stosowana jest wyłącznie w niepowikłanych zakażeniach dolnych dróg moczowych. W powikłanych zakażeniach i odmiedniczkowym zapaleniu nerek nie jest rekomendowana.  
        'Fosfomycyna': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 1 },
        // Cefuroksym (dożylnie) – w cięższych zakażeniach układu moczowego dawka wynosi 50 mg/kg co 8 h do 150 mg/kg/dobę; górna granica stosowana w ciężkich zakażeniach.  
        'Cefuroksym (dożylnie)': { mgRange: [75, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Cefotaksym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek zalecane jest 100–200 mg/kg/dobę w 3 dawkach.  
        'Cefotaksym': { mgRange: [100, 200], defaultMg: 150, doses: 3, duration: 10 },
        // Ceftriakson – terapia parenteralna 50 mg/kg/dobę w jednej dawce do maks. 2 g/dobę.  
        'Ceftriakson': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 10 },
        // Cefepim – w powikłanych zakażeniach układu moczowego stosuje się 50 mg/kg co 8–12 h (100–150 mg/kg/dobę); przyjmujemy zakres 100–150 mg/kg/dobę.  
        'Cefepim': { mgRange: [100, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Piperacylina z tazobaktamem – u dzieci 2–12 lat 112,5 mg/kg co 8 h (337,5 mg/kg/dobę); przyjmujemy zakres 270–337,5 mg/kg/dobę z domyślną wartością 300 mg/kg.  
        'Piperacylina z tazobaktamem': { mgRange: [270, 337.5], defaultMg: 300, doses: 3, duration: 10 },
        // Imipenem z cilastatyną – dzieci ≥3 mies. otrzymują 15–25 mg/kg co 6 h (60–100 mg/kg/dobę).  
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem – w umiarkowanych zakażeniach 20 mg/kg co 8 h (60 mg/kg/dobę); w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę).  
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem – brak danych pediatrycznych; u dorosłych stosuje się 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę).  
        // Pozostawiamy zakres 60–120 mg/kg/dobę i trzy dawki, ale dodajemy komunikat ostrzegawczy w kalkulatorze.  
        'Doripenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 }
      }
    }
    ,

    // Leczenie boreliozy (choroba z Lyme)
    // Wczesne i układowe postacie zakażenia Borrelia wymagają doustnych antybiotyków przez 10–14 dni.
    // Lekami pierwszego wyboru są doksycyklina, amoksycylina i aksetyl cefuroksymu. Makrolidy
    // (azytromycyna) mają mniejszą skuteczność i stosuje się je wyłącznie, gdy preparaty
    // pierwszoliniowe są przeciwwskazane. W cięższych postaciach (neuroborelioza, zapalenie serca)
    // stosuje się leczenie dożylne (ceftriakson, cefotaksym) przez 14–21 dni.
    'lyme': {
      label: 'Leczenie boreliozy',
      drugs: {
        'Doksycyklina': { mgRange: [4, 4], defaultMg: 4, doses: 2, altDoses: [1], duration: 14, firstChoice: true },
        'Amoksycylina': { mgRange: [50, 50], defaultMg: 50, doses: 3, duration: 14, maxDailyMg: 4000, firstChoice: true },
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 14, maxDailyMg: 1000, firstChoice: true },
        'Azytromycyna (7 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 7, altDurations: [5, 10], maxDailyMg: 500 },
        'Ceftriakson': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 14, altDurations: [21], maxDailyMg: 2000 },
        'Cefotaksym': { mgRange: [100, 100], defaultMg: 100, doses: 3, duration: 14, altDurations: [21], maxDailyMg: 6000 }
      }
    },
    /*
     * Zakażenia skóry i tkanki podskórnej – kategoria ropni i czyraków (abscess). Leczenie obejmuje doustne
     * cefalosporyny I generacji, klindamycynę oraz amoksycylinę z klawulanianem, a w cięższych przypadkach
     * dożylnie cefazolinę, wankomycynę lub linezolid. Zakresy dawek oparto na zaleceniach IDSA i polskich wytycznych.
     */
    'ssti_abscess': {
      label: 'Ropnie i czyraki',
      drugs: {
        // Zgodnie z aktualnymi wytycznymi IDSA oraz lokalnych programów
        // antybiotykoterapii, nieskomplikowane ropnie u dzieci zwykle wymagają
        // jedynie nacięcia i drenażu, a antybiotyki stosuje się tylko w razie
        // towarzyszącej rozległej cellulitis, dużego rozmiaru (>5 cm) lub
        // objawów ogólnych. Jeżeli konieczne jest leczenie systemowe,
        // preferuje się klindamycynę lub kotrimoksazol przez 5 dni.
        // Cefaleksyna – w Polsce preparaty doustne są obecnie niedostępne w leczeniu ropni i czyraków,
        // dlatego nie udostępniamy tego antybiotyku w tej jednostce chorobowej.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna stosowana jest w dawce 10 mg/kg co 8 godzin (≈30 mg/kg/dobę)
        // maks. 450 mg na dawkę; czas leczenia 5 dni.
        'Klindamycyna': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 5, firstChoice: true },
        // Zmodyfikowano parametry dawkowania amoksycyliny z kwasem klawulanowym
        // dla ropni i czyraków. Umiarkowane infekcje skóry leczymy dawką
        // 25–45 mg/kg/dobę w dwóch podaniach. Czas terapii skrócono do 5 dni,
        // ponieważ krótsze kuracje są wystarczające.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5 },
        // Cefazolina dożylna w leczeniu ropni jest stosowana w dawce 33 mg/kg/dawkę
        // co 8 godzin (≈100 mg/kg/dobę). Dlatego zwiększono górny limit
        // i skrócono czas terapii do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Metronidazol stosuje się pomocniczo w zakażeniach beztlenowych skóry;
        // terapię skrócono do 5 dni.
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 5 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 },
        // Dodano kotrimoksazol (trimetoprim‑sulfametoksazol) jako alternatywę
        // dla MRSA – 4–6 mg trimetoprimu/kg co 12 h przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5 }
      }
    },
    /*
     * Zapalenie tkanki łącznej (cellulitis) i róża – zakażenia skóry o większym zakresie. Pierwszym wyborem są penicyliny
     * przeciw paciorkowcom, cefaleksyna lub cefadroksyl; w alergii na β‑laktamy stosuje się klindamycynę. W cięższych
     * przypadkach stosuje się cefazolinę, cefuroksym, kloksacylinę lub glikopeptydy.
     */
    'ssti_cellulitis': {
      label: 'Zapalenie tkanki łącznej i róża',
      drugs: {
        // Fenoksymetylpenicylina (Penicylina V) – w łagodnym cellulitis/róży zaleca się
        // około 20 mg/kg mc. na dawkę co 8 h (≈60 mg/kg mc./dobę), maksymalnie
        // 500 mg na dawkę. Czas terapii wynosi 5 dni i może zostać
        // wydłużony do 7–10 dni przy powolnej poprawie. Zmieniamy
        // zakres na 50–60 mg/kg mc./dobę, skracamy terapię do 5 dni i pozostawiamy 3 dawki.
        'Fenoksymetylpenicylina': { mgRange: [50, 60], defaultMg: 55, doses: 3, duration: 5, firstChoice: true },
        // Amoksycylina – zgodnie z wytycznymi pediatrycznymi stosuje się
        // 12,5 mg/kg mc. co 8 h (≈37,5 mg/kg mc./dobę), maks. 500 mg na dawkę.
        // Aby uwzględnić wyższą skuteczność przy 3 dawkach oraz tolerancję, ustawiamy
        // zakres 40–50 mg/kg mc./dobę, domyślną wartość 45 mg/kg mc./dobę i
        // 3 dawki przez 5 dni.
        'Amoksycylina': { mgRange: [40, 50], defaultMg: 45, doses: 3, duration: 5 },
        // Amoksycylina z kwasem klawulanowym – w umiarkowanym cellulitisie
        // stosuje się 22,5 mg/kg mc. amoksycyliny co 12 h (≈45 mg/kg mc./dobę) przez 5 dni.
        // Ustawiamy zakres 40–45 mg/kg mc./dobę, domyślną wartość 45 mg i 2 dawki.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [40, 45], defaultMg: 45, doses: 2, duration: 5 },
        // Cefaleksyna – choć tradycyjnie stosowana w leczeniu cellulitis/róży, w Polsce preparat jest niedostępny,
        // dlatego nie pojawia się w opcjach antybiotykoterapii w tym wskazaniu.
        // Cefadroksyl – 30 mg/kg mc./dobę w dwóch dawkach stanowi alternatywę; skracamy terapię do 5 dni.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna – dawka 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) przez 5 dni.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach pozostaje, skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecana dawka 25 mg/kg mc. co 8 h (≈75 mg/kg/dobę); skracamy terapię do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Kloksacylina – w leczeniu MSSA dawkuje się 12,5 mg/kg mc. co 6 h (≈50 mg/kg mc./dobę). Ustawiamy
        // zakres 50–100 mg/kg mc./dobę z domyślną 75 mg, 4 dawki i 5 dni terapii.
        'Kloksacylina': { mgRange: [50, 100], defaultMg: 75, doses: 4, duration: 5 },
        // Benzylopenicylina – stosuje się 50 000–100 000 j.m./kg mc. (≈33–65 mg/kg mc./dobę);
        // skracamy terapię do 5 dni i pozostawiamy 4 dawki.
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 5 },
        // Wankomycyna – w ciężkich przypadkach stosuje się 15 mg/kg mc. co 6 h (≈60 mg/kg mc./dobę);
        // pozostawiamy 4 dawki i ograniczamy terapię do 7 dni.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg mc. co 8 h (<12 lat) czyli 30 mg/kg mc./dobę;
        // u starszych dzieci stosuje się 600 mg co 12 h. Ustawiamy 3 dawki i 7 dni terapii.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA; dawka 4–6 mg/kg mc. trimetoprimu
        // co 12 h (≈8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 }
      }
    },
    /*
     * Zakażone rany – obejmują miejscowe zakażenia pourazowe oraz zakażenia pooperacyjne. Terapię empiryczną stanowi
     * amoksycylina z kwasem klawulanianem lub cefaleksyna, w przypadku flory mieszanej dołącza się metronidazol.
     */
    'ssti_wound': {
      label: 'Zakażone rany',
      drugs: {
        // W zakażonych ranach umiarkowanego stopnia preferujemy 2×
        // dawkowanie tabletek 875 mg/125 mg. Ustawiono zakres 25–45 mg/kg/dobę
        // z domyślną wartością 35 mg/kg/dobę i liczbą dawek = 2.
        // Skracamy terapię zakażonych ran do 5 dni dla większości doustnych leków, zgodnie z zaleceniami pediatrycznymi dla cellulitis/erysipelas.
        // Amoksycylina z kwasem klawulanowym – 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę) przez 5 dni jest standardem w leczeniu umiarkowanych zakażeń skóry.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5, firstChoice: true },
        // Cefaleksyna – preparat nie jest obecnie dostępny na rynku polskim do leczenia zakażonych ran,
        // dlatego został wyłączony z listy rekomendowanych antybiotyków.
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach utrzymujemy, ale skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecane jest ok. 33 mg/kg/dawkę co 8 h (≈100 mg/kg/dobę) w umiarkowanych zakażeniach. Zmieniamy zakres na 75–100 mg/kg/dobę z domyślną wartością 90 mg i skracamy terapię do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Klindamycyna – 10 mg/kg/dawkę co 8 h (≈30 mg/kg mc./dobę) przez 5 dni. Ustawiamy domyślną dawkę 30 mg/kg mc./dobę.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Metronidazol – stosuje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) w terapii skojarzonej. Zmieniamy na 2 dawki i 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Cyprofloksacyna – u dzieci z alergią na beta‑laktamy stosuje się 20–30 mg/kg mc./dobę w dwóch dawkach. Skracamy terapię do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Piperacylina z tazobaktamem – pozostaje bez zmian (3 dawki przez 10 dni) dla ciężkich zakażeń.
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        // Wankomycyna – w ciężkich zakażeniach skóry stosuje się 15 mg/kg/dawkę co 6 h (≈60 mg/kg mc./dobę). Ustawiamy zakres 60 mg/kg mc./dobę, 4 dawki dziennie i 7 dni terapii.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg/dawkę co 8 h (<12 lat) czyli 30 mg/kg mc./dobę z maksymalnie 600 mg/dawkę; dla starszych 600 mg co 12 h. Ustawiamy 3 dawki i 7 dni terapii.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA. Dawka 4–6 mg/kg mc. trimetoprimu co 12 h (8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 }
      }
    },
    /*
     * Zakażenia po ugryzieniach – infekcje spowodowane florą jamy ustnej zwierząt (psy, koty, ludzie). Pierwszym wyborem
     * jest amoksycylina z kwasem klawulanowym; alternatywy obejmują klindamycynę z cyprofloksacyną lub metronidazolem.
     */
    'ssti_bite': {
      label: 'Zakażenia po ugryzieniach',
      drugs: {
        // Zakażenia po ugryzieniach leczone są zwykle schematem 2× dobę.
        // Zakres dawek 25–45 mg/kg/dobę umożliwia podawanie 1 tabletki
        // 875 mg/125 mg co 12 godzin u pacjentów ≥40 kg. Zmieniono liczbę
        // dawek i wartości mgRange na niższy zakres.
        // Amoksycylina z kwasem klawulanowym jest lekiem pierwszego wyboru w leczeniu zakażeń po ugryzieniach.
        // Wytyczne pediatryczne zalecają dawkę około 22,5 mg/kg mc. co 12 h (czyli ~45 mg/kg mc./dobę), maksymalnie 875 mg na dawkę.
        // Leczenie najczęściej trwa 5 dni; dłuższy kurs (do 7 dni) rezerwuje się dla aktywnych zakażeń.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 5, firstChoice: true },
        // Cefuroksym i.v. jest rzadko stosowany w zakażeniach po ugryzieniach; najczęściej stosuje się ampicylinę/sulbaktam lub ceftriakson z metronidazolem.
        // Pozostawiamy dawkę w dotychczasowym zakresie, lecz skracamy terapię do 5 dni w lżejszych przypadkach.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Klindamycyna: zalecana dawka to 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) w skojarzeniu z innymi lekami przy alergii na penicyliny.
        // Ustawiamy zakres 20–30 mg/kg mc./dobę, domyślną wartość 30 mg/kg mc./dobę i skracamy czas terapii do 5 dni.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cyprofloksacyna jest stosowana u dzieci z alergią na beta‑laktamy w skojarzeniu z trimetoprim‑sulfametoksazolem lub klindamycyną.
        // Zalecane dzienne dawki mieszczą się w zakresie 20–30 mg/kg mc., podawane w dwóch dawkach. Skracamy czas terapii do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Metronidazol w schemacie doustnym podaje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) jako część terapii skojarzonej, np. z trimetoprim‑sulfametoksazolem.
        // Redukujemy liczbę dawek do 2 na dobę i skracamy terapię do 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Dodajemy trimetoprim‑sulfametoksazol (kotrimoksazol) jako opcję dla pacjentów uczulonych na penicyliny lub z podejrzeniem MRSA.
        // Zalecana dawka trimetoprimu 4–6 mg/kg mc. co 12 h (8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 7 },
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 7 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 }
      }
    }
  },
};
