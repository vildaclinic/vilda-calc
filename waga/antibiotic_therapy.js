/*
 * antibiotic_therapy.js
 *
 * Ten moduł dodaje do aplikacji Vilda Clinic sekcję „Antybiotykoterapia”, która
 * umożliwia lekarzom obliczanie dobowych dawek najczęściej stosowanych
 * antybiotyków u dzieci na podstawie masy ciała oraz parametrów zaczerpniętych
 * z zaleceń „Rekomendacji postępowania w pozaszpitalnych zakażeniach układu
 * oddechowego” (Wyd. 2016). Wybór wskazania powoduje wyświetlenie listy
 * antybiotyków dopuszczonych w danej chorobie wraz z domyślną dawką
 * mg/kg/dobę, zakresem suwaka, liczbą dawek w ciągu doby oraz sugerowanym
 * czasem trwania terapii. Na podstawie masy ciała wpisanej w sekcji
 * „Dane użytkownika” program przelicza dawkę dobowa w mg i ml oraz sugeruje
 * objętość opakowania potrzebną do zakończenia kuracji.
 */

// Uproszczono strukturę skryptu poprzez usunięcie wywołania IIFE.
  // (Usunięto debugowanie ładowania skryptu)
  // Definicja leków: zawartość substancji w 5 ml oraz dostępne objętości
  // opakowań syropów. Dane te zaczerpnięto z oficjalnych serwisów
  // farmaceutycznych i kart produktów producentów (np. doz.pl)【724546245777698†screenshot】.
  const DRUG_INFO = {
    // Monopreparaty: zawiesiny lub roztwory, klucze stanowią nazwy leków.
    // Amoksycylina występuje w dwóch głównych stężeniach zawiesin do stosowania
    // doustnego: 250 mg/5 ml oraz 500 mg/5 ml. Zgodnie z Charakterystyką
    // Produktu Leczniczego dla preparatu Amotaks, granulat o mocy 500 mg/5 ml
    // rekonstrukuje się do 60 ml lub 100 ml zawiesiny【202708336831534†L1085-L1132】.
    // Standardowe stężenie 250 mg/5 ml jest dostępne w podobnych pojemnościach
    // (np. 60 ml i 100 ml) w butelkach Ospamox/Hiconcil/Amotaks. Dlatego dla
    // amoksycyliny definiujemy dwie postaci zawiesin z odpowiednimi stężeniami.
    'Amoksycylina': {
      forms: {
        // Podstawowe zawiesiny amoksycyliny: 250 mg/5 ml i 500 mg/5 ml.
        // W formularzu aplikacji etykiety mogą zawierać zwykłe spacje zamiast twardych,
        // dlatego wpisy z NBSP pojawiają się obok wariantów z normalnymi spacjami.
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Zawiesina 500 mg/5 ml': {
          mgPer5ml: 500,
          // Po dodaniu wody do granulatu o pojemności 100 ml lub 200 ml otrzymuje się
          // odpowiednio 60 ml lub 100 ml zawiesiny【202708336831534†L1104-L1132】.
          packaging: [60, 100],
          formType: 'suspension'
        },
        // Wprowadzenie tabletek amoksycyliny na podstawie Charakterystyki Produktu Leczniczego:
        // Amoxicillin MIP Pharma 500 mg i 1000 mg w blistrach po 8 lub 24 (500 mg) oraz 8 lub 16 (1000 mg) tabletek【48486770934528†L1010-L1013】.
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [8, 24],
          formType: 'tablet'
        },
        'Tabletka 1000 mg': {
          mgPerTablet: 1000,
          packaging: [8, 16],
          formType: 'tablet'
        },
        // Tabletki do sporządzania zawiesiny ("Dis") umożliwiają przygotowanie doustnej zawiesiny z tabletki.
        // Ulotka preparatu Duomox podaje, że każda z mocy 250 mg, 375 mg, 500 mg, 750 mg i 1 g jest pakowana po 20 tabletek【728270158523889†L558-L569】.
        'Tabletka do sporządzania zawiesiny 250 mg': {
          mgPerTablet: 250,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 375 mg': {
          mgPerTablet: 375,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 500 mg': {
          mgPerTablet: 500,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 750 mg': {
          mgPerTablet: 750,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 1 g': {
          mgPerTablet: 1000,
          packaging: [20],
          formType: 'tablet'
        }
      }
    },
    // Amoksycylina z kwasem klawulanowym występuje w kilku postaciach. Standardowa
    // zawiesina 400 mg/5 ml (z dodatkiem 57 mg kwasu klawulanowego) jest
    // dostępna w butelkach 35 ml, 70 ml, 100 ml oraz 140 ml【406332432356125†L468-L487】. Wysokodawkowa
    // zawiesina ES 600 mg/5 ml (600 mg amoksycyliny + 42,9 mg kwasu
    // klawulanowego w 5 ml) jest dostępna w butelkach 50 ml i 100 ml【759532590181075†L450-L503】.
    // Tabletki powlekane i do sporządzania zawiesiny (QuickTab/Co‑amoxiclav) zawierają
    // odpowiednio 500 mg + 125 mg lub 875 mg + 125 mg amoksycyliny i są sprzedawane
    // w opakowaniach po 14 lub 30 sztuk【70338428334129†L1011-L1016】.
    'Amoksycylina z kwasem klawulanowym': {
      forms: {
        'Zawiesina 400 mg/57 mg/5 ml': {
          // Każde 5 ml standardowej zawiesiny zawiera 400 mg amoksycyliny i
          // 57 mg kwasu klawulanowego. Zgodnie z ulotką, przygotowana
          // zawiesina jest dostępna w butelkach pozwalających uzyskać 35 ml,
          // 70 ml lub 140 ml roztworu【406332432356125†L468-L487】, dlatego zestaw
          // packaging zawiera tylko te objętości.
          mgPer5ml: 400,
          packaging: [35, 70, 140],
          formType: 'suspension'
        },
        'Zawiesina 600 mg/42,9 mg/5 ml (ES)': {
          mgPer5ml: 600,
          packaging: [50, 100],
          formType: 'suspension'
        },
        'Tabletka 500 mg/125 mg': {
          mgPerTablet: 500,
          packaging: [14],
          formType: 'tablet'
        },
        'Tabletka 875 mg/125 mg': {
          mgPerTablet: 875,
          packaging: [14, 30],
          formType: 'tablet'
        }
      }
    },
    // Cefuroksym występuje w dwóch zasadniczo różnych postaciach: doustny aksetyl
    // cefuroksymu (zawiesiny i tabletki) oraz dożylny cefuroksym sodowy.
    // Wcześniejsza implementacja traktowała cefuroksym jako jednoznaczny lek
    // 125 mg/5 ml. W celu rozróżnienia form wprowadzamy dwa oddzielne wpisy:
    // "Aksetyl cefuroksymu" dla postaci doustnych i "Cefuroksym (dożylnie)"
    // dla postaci dożylnych. Dzięki temu kalkulator może prawidłowo
    // dopasować sposób podania, stężenie i opakowanie w zależności od wyboru.

    'Aksetyl cefuroksymu': {
      forms: {
        // Zawiesina doustna 125 mg/5 ml i 250 mg/5 ml w butelkach 50 ml i 100 ml【689103595859727†L0-L13】【203996553169954†L260-L266】.
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [50, 100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [50, 100],
          formType: 'suspension'
        },
        // Tabletki aksetylu cefuroksymu są sprzedawane w blistrach po 10 sztuk【206863740369237†L529-L533】.
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    'Cefuroksym (dożylnie)': {
      forms: {
        // Dożylne fiolki cefuroksymu sodowego dostępne są w dawkach 250 mg,
        // 750 mg, 1000 mg i 1500 mg【986456471617472†L0-L6】. W materiałach
        // producenta (Zinacef) nie określono wielkości paczek, dlatego przyjmujemy
        // że można kupić pojedyncze fiolki lub opakowania zbiorcze (np. 10 szt.).
        'Fiolka 250 mg': {
          mgPerVial: 250,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 750 mg': {
          mgPerVial: 750,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1500 mg': {
          mgPerVial: 1500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Klarytromycyna posiada wiele postaci farmaceutycznych. Poniższa struktura
    // definiuje je szczegółowo. Wartości mgPer5ml dotyczą zawiesin, a
    // mgPerTablet tabletek. Lista packaging zawiera pojemności butelek (w ml)
    // albo liczbę tabletek w opakowaniu. Dane o opakowaniach pochodzą z
    // Charakterystyk Produktu Leczniczego: zawiesina 125 mg/5 ml dostępna jest
    // w butelkach 60 ml i 100 ml【123300810807228†L1846-L1851】; zawiesina
    // 250 mg/5 ml w butelkach 50 ml, 60 ml i 100 ml【102936785600878†L700-L703】; tabletki
    // 250 mg sprzedawane są w opakowaniach po 10 i 14 sztuk【847278878374628†L1832-L1835】;
    // tabletki 500 mg w opakowaniach po 14, 20 i 42 sztuki【553357385643251†L1797-L1802】.
    'Klarytromycyna': {
      forms: {
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [50, 60, 100],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10, 14],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [14, 20, 42],
          formType: 'tablet'
        }
      }
    },
    // Azytromycyna – dostępna w postaci proszków do sporządzania zawiesiny i tabletek.
    // Zgodnie z charakterystyką produktu leczniczego AzitroLEK, proszek 100 mg/5 ml
    // po rekonstytucji daje 20 ml zawiesiny【422551086230723†L1649-L1653】. Dla stężenia 200 mg/5 ml
    // istnieje kilka wariantów: 600 mg (15 ml), 800 mg (20 ml), 900 mg (22,5 ml), 1200 mg (30 ml)
    // oraz 1500 mg (37,5 ml)【422551086230723†L1654-L1672】. Sumamed forte 200 mg/5 ml oferuje
    // butelki do sporządzenia 20 ml, 30 ml i 37,5 ml zawiesiny【923333179549339†L559-L562】.
    // Tabletki zawierają 250 mg lub 500 mg azytromycyny; najczęściej sprzedawane
    // są w opakowaniach po 6 tabletek (250 mg) lub 3 tabletki (500 mg), co
    // odpowiada standardowym kuracjom 3‑ i 5‑dniowym.
    'Azytromycyna': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          // 5 ml zawiesiny zawiera 100 mg azytromycyny, butelka po rekonstrukcji 20 ml【422551086230723†L1649-L1653】.
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200 mg/5 ml': {
          // 5 ml zawiesiny zawiera 200 mg azytromycyny; dostępne warianty objętości
          // po rekonstytucji to 15 ml, 20 ml, 22,5 ml, 30 ml i 37,5 ml【422551086230723†L1654-L1672】.
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          /*
            Oficjalne ulotki dla preparatów zawierających azytromycynę podają, że
            tabletki 250 mg dostępne są w przezroczystych blistrach w kilku
            wielkościach opakowań. Na przykład ulotka producenta Aurovitas
            informuje, że tabletki powlekane 250 mg pakowane są po 3, 4 albo 6
            sztuk w blistrach【248456555946661†L499-L510】. W kalkulatorze
            uwzględniamy te najczęściej spotykane opakowania, aby sugerowana
            liczba opakowań była bliższa rzeczywistości.
          */
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          /*
            Ulotki dla preparatów o mocy 500 mg (np. Azithromycin Advisors i
            Azithromycin Aurovitas) podają, że tabletki mogą być pakowane
            po 2, 3, 6 lub nawet 30 sztuk【248456555946661†L512-L519】. W kalkulatorze
            przyjmujemy pakowania 2, 3 i 6 tabletek jako najczęściej spotykane
            w praktyce. Większe opakowania (30 tabl.) są rzadziej dostępne i
            mogą być stosowane w kuracjach dorosłych – nie są tu uwzględnione.
          */
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },
    // Ampicylina stosowana jest głównie dożylnie w ciężkich postaciach
    // pozaszpitalnego zapalenia płuc. W Polsce dostępne są fiolki 500 mg i 1 g
    // (informacje z ogólnodostępnych opisów produktów). Przyjmujemy opakowania
    // zawierające pojedyncze fiolki lub po 10 sztuk.
    'Ampicylina': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Cefotaksym – dostępny w fiolkach 1 g i 2 g; ulotka HPRA wskazuje
    // opakowania zawierające 1, 10, 25 lub 50 fiolki【136686595724070†L290-L297】.
    'Cefotaksym': {
      forms: {
        // Zgodnie z polską Charakterystyką Produktu Leczniczego Biotaksym
        // (cefuroksym sodowy, Polpharma) fiolka o pojemności 26 ml zawiera 1 g
        // lub 2 g cefotaksymu i opakowanie może zawierać 1 lub 10 fiolek【409289296472662†L970-L980】.
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2000 mg': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Ceftriakson – ulotka Wockhardt wymienia opakowania 1, 5, 10, 25 lub 50
    // fiolek 1 g oraz 1 lub 10 fiolek 2 g【293301184886378†L405-L409】.
    'Ceftriakson': {
      forms: {
        // Charakterystyka produktu leczniczego Ceftriaxon Kabi 1 g (Fresenius Kabi)
        // podaje, że wielkości opakowań to 5 i 10 fiolek【765030907120407†L1485-L1491】.
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [5, 10],
          formType: 'vial'
        },
        // Zakładamy, że fiolki 2 g mają takie same warianty opakowań (5 lub 10 szt.).
        'Fiolka 2000 mg': {
          mgPerVial: 2000,
          packaging: [5, 10],
          formType: 'vial'
        }
      }
    },
    // Kloksacylina – dożylne fiolki 500 mg i 1 g. Oficjalna charakterystyka
    // produktu leczniczego wskazuje, że są pakowane w pudełka po 1, 10, 25, 50
    // lub 100 fiolek【982204843025270†L317-L321】.
    // Fenoksymetylpenicylina (penicylina V) – lek pierwszego wyboru w
    // paciorkowcowym zapaleniu gardła i migdałków. Dostępna w postaci
    // zawiesin i tabletek. Jedna dawka 5 ml zawiesiny Ospen 750 zawiera
    // 750 000 j.m. (jednostek międzynarodowych) fenoksymetylpenicyliny【434395716885121†L774-L808】.
    // Granulat Polcylin 100 mg/ml po odtworzeniu daje stężenie 100 mg/ml
    // (500 mg w 5 ml), dostępny w butelkach 60 ml i 125 ml【434395716885121†L774-L808】.
    // Tabletki powlekane Ospen zawierają 1 000 000 j.m. lub 1 500 000 j.m.
    // fenoksymetylpenicyliny i są pakowane po 30 sztuk【434395716885121†L774-L808】.
    'Fenoksymetylpenicylina': {
      forms: {
        /*
         * Ospen 750 000 j.m./5 ml – zawiesina o stężeniu 750 000 jednostek
         * fenoksymetylpenicyliny w 5 ml. Zgodnie z przelicznikiem 1 000 000 j.m.
         * odpowiada ok. 654 mg fenoksymetylpenicyliny, więc 750 000 j.m. daje
         * 0,75 × 654 mg ≈ 490 mg w 5 ml. W kalkulatorze używamy wartości 490 mg
         * jako mgPer5ml. Preparat dostępny w butelkach 150 ml【434395716885121†L774-L808】.
         */
        'Zawiesina 750 000 j.m./5 ml': {
          // Ospen 750 zawiera 750 000 j.m. w 5 ml; odpowiada to ok. 490 mg【434395716885121†L774-L808】.
          mgPer5ml: 490,
          // Liczba jednostek międzynarodowych na 5 ml (do użytku przy przeliczaniu).
          unitsPer5ml: 750000,
          // Ulotka Ospen 750 wskazuje, że gotowa zawiesina jest dostępna w butelkach 60 ml
          // lub 150 ml【369903302182571†L520-L527】.
          packaging: [60, 150],
          formType: 'suspension'
        },
        // Polcylin 100 mg/ml to granulat do sporządzania zawiesiny; w 5 ml
        // zawiera 500 mg fenoksymetylpenicyliny. Dostępne butelki 60 ml i 125 ml【434395716885121†L774-L808】.
        'Granulat 100 mg/ml (5 ml = 500 mg)': {
          mgPer5ml: 500,
          packaging: [60, 125],
          formType: 'suspension'
        },
        /*
         * Tabletki Ospen 1 000 000 j.m. zawierają w jednej tabletce ok. 654 mg
         * fenoksymetylpenicyliny potasowej (1 000 000 j.m. × 0,654 mg/j.m.).
         * Tabletki Ospen 1 500 000 j.m. zawierają ok. 981 mg substancji
         * czynnej (1,5 mln j.m. × 0,654 mg/j.m.). Oba warianty pakowane są
         * zazwyczaj po 30 tabletek【434395716885121†L774-L808】.
         */
        'Tabletka 1 000 000 j.m.': {
          // Jedna tabletka zawiera 1 000 000 j.m. fenoksymetylpenicyliny, co odpowiada ok. 654 mg【771311657500760†L12-L18】.
          mgPerTablet: 654,
          unitsPerTablet: 1000000,
          packaging: [30],
          formType: 'tablet'
        },
        'Tabletka 1 500 000 j.m.': {
          // Jedna tabletka zawiera 1 500 000 j.m. (≈ 981 mg)【771311657500760†L12-L18】.
          mgPerTablet: 981,
          unitsPerTablet: 1500000,
          packaging: [30],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefadroksyl – antybiotyk doustny stosowany w leczeniu skorygowanym
     * paciorkowcowego zapalenia gardła i migdałków oraz w nawrotach. W Polsce
     * dostępne są zawiesiny 250 mg/5 ml (Valdocef) w butelkach 100 ml【23755977830815†L910-L924】.
     * Dostępne są również tabletki 500 mg i 1 000 mg; zakładamy opakowania po 10 tabletek.
     */
    'Cefadroksyl': {
      forms: {
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [100],
          formType: 'suspension'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10],
          formType: 'tablet'
        },
        'Tabletka 1 000 mg': {
          mgPerTablet: 1000,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefaleksyna – dostępna w postaci zawiesiny 125 mg/5 ml i 250 mg/5 ml,
     * każda w butelkach 100 ml【925965375433259†L387-L387】. Dostępne są również
     * kapsułki 250 mg i 500 mg pakowane w blistry po 16 kapsułek【724235995599015†L446-L449】.
     */
    'Cefaleksyna': {
      forms: {
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [100],
          formType: 'suspension'
        },
        'Kapsułka 250 mg': {
          mgPerTablet: 250,
          packaging: [16],
          formType: 'tablet'
        },
        'Kapsułka 500 mg': {
          mgPerTablet: 500,
          packaging: [16],
          formType: 'tablet'
        }
      }
    },
    /*
     * Klindamycyna – linkozamid stosowany w leczeniu nawrotowego paciorkowcowego
     * zapalenia gardła i migdałków. Preparat Dalacin C w postaci granulek do
     * sporządzania zawiesiny po rekonstytucji zawiera 75 mg klindamycyny w 5 ml
     * oraz 80 ml gotowego roztworu【463090470837982†L620-L623】. Kapsułki 150 mg
     * są pakowane po 12, 16 lub 100 sztuk, natomiast kapsułki 300 mg po 16 sztuk【64252282737176†L680-L687】.
     */
    'Klindamycyna': {
      forms: {
        // Preparat Dalacin C jest sprzedawany w postaci granulatu do sporządzania
        // zawiesiny; po rekonstytucji 5 ml zawiera 75 mg klindamycyny i
        // powstaje 80 ml gotowego roztworu【463090470837982†L620-L623】. Nazwa "Granulat"
        // lepiej odzwierciedla postać handlową niż ogólne "Zawiesina", dlatego
        // stosujemy tę etykietę w definicji formy.
        'Granulat 75 mg/5 ml': {
          mgPer5ml: 75,
          packaging: [80],
          formType: 'suspension'
        },
        // Kapsułki 150 mg pakowane są po 12, 16 lub 100 sztuk【64252282737176†L680-L687】.
        'Kapsułka 150 mg': {
          mgPerTablet: 150,
          packaging: [12, 16, 100],
          formType: 'tablet'
        },
        // Kapsułki 300 mg pakowane są po 16 sztuk【64252282737176†L680-L687】.
        'Kapsułka 300 mg': {
          mgPerTablet: 300,
          packaging: [16],
          formType: 'tablet'
        }
      }
    },
    'Kloksacylina': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10, 25, 50, 100],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10, 25, 50, 100],
          formType: 'vial'
        }
      }
    }
    ,
    /*
     * Furazydyna – pochodna nitrofurantoiny stosowana głównie w leczeniu
     * niepowikłanych zakażeń dolnych dróg moczowych. Preparaty dostępne w Polsce
     * zawierają 50 mg furazydyny (np. Furaginum, Urofuraginum) lub 100 mg w wersji
     * forte. Tabletki sprzedawane są zazwyczaj w opakowaniach po 30 lub 60 sztuk.
     */
    'Furazydyna': {
      forms: {
        'Tabletka 50 mg': {
          mgPerTablet: 50,
          packaging: [30, 60],
          formType: 'tablet'
        },
        'Tabletka 100 mg': {
          mgPerTablet: 100,
          packaging: [30],
          formType: 'tablet'
        },
        // Zawiesina furazydyny w dawce 10 mg/ml (50 mg w 5 ml).
        // Według ChPL Dafurag zawiesina doustna, 10 mg/ml, zawiera 10 mg furazydyny w 1 ml;
        // 5 ml zawiesiny odpowiada 50 mg furazydyny. Butelka zawiera 140 ml przygotowanego roztworu【305154790840983†L5-L36】【305154790840983†L520-L537】.
        'Zawiesina 50 mg/5 ml': {
          mgPer5ml: 50,
          packaging: [140],
          formType: 'suspension'
        }
      }
    },
    /*
     * Trimetoprim – antybiotyk hamujący reduktazę dihydrofolianową, stosowany w
     * niepowikłanych zakażeniach dróg moczowych oraz w profilaktyce nawrotów.
     * Dostępny jest w tabletkach 100 mg i 200 mg (np. Trimesan, Urotrim) oraz
     * zawiesinie 100 mg/5 ml dla dzieci. Zawiesina sprzedawana jest w butelkach
     * 100 ml.
     */
    'Trimetoprim': {
      forms: {
        'Tabletka 100 mg': {
          mgPerTablet: 100,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Tabletka 200 mg': {
          mgPerTablet: 200,
          packaging: [20],
          formType: 'tablet'
        },
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [100],
          formType: 'suspension'
        }
      }
    },
    /*
     * Trimetoprim-sulfametoksazol (kotrimoksazol) – lek złożony zawierający
     * 160 mg trimetoprimu i 800 mg sulfametoksazolu w jednej tabletce (łącznie 960 mg
     * substancji czynnej). Zawiesina 240 mg/5 ml zawiera 40 mg trimetoprimu i
     * 200 mg sulfametoksazolu w 5 ml (240 mg łącznie). Preparaty są pakowane w
     * butelki 100 ml (zawiesina) lub blistry po 10–20 tabletek (tabletki 960 mg).
     */
    'Trimetoprim-sulfametoksazol': {
      forms: {
        'Zawiesina 240 mg/5 ml': {
          mgPer5ml: 240,
          packaging: [100],
          formType: 'suspension'
        },
        'Tabletka 160 mg/800 mg': {
          mgPerTablet: 960,
          packaging: [10, 20],
          formType: 'tablet'
        }
      }
    },
    /*
     * Fosfomycyna trometamol – antybiotyk stosowany w jednorazowej dawce w
     * niepowikłanych zakażeniach dróg moczowych. Saszetka zawiera 3 g
     * fosfomycyny. Dla uproszczenia traktujemy saszetkę jak tabletkę o masie
     * 3000 mg, ponieważ kalkulator dawkuje w mg/kg/dobę. Opakowania zawierają
     * jedną saszetkę.
     */
    'Fosfomycyna': {
      forms: {
        'Saszetka 3 g': {
          mgPerTablet: 3000,
          packaging: [1],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefiksym (cefixime) – doustna cefalosporyna III generacji stosowana w
     * zakażeniach układu moczowego. Dostępna jest jako zawiesina 100 mg/5 ml
     * (butelki 50 ml i 100 ml) oraz tabletki 400 mg. Wiele preparatów
     * (np. Suprax) sprzedawanych jest w opakowaniach po 10 kapsułek.
     */
    'Cefiksym': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [50, 100],
          formType: 'suspension'
        },
        'Tabletka 400 mg': {
          mgPerTablet: 400,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Ceftibuten – doustna cefalosporyna III generacji. W Polsce dostępna jest
     * zawiesina o stężeniu 180 mg/5 ml (powstała z proszku 36 mg/ml) oraz
     * kapsułki 400 mg (Cedax). Zawiesina jest sprzedawana w butelkach 60 ml
     * lub 100 ml; kapsułki w opakowaniach po 10 sztuk.
     */
    'Ceftibuten': {
      forms: {
        'Zawiesina 180 mg/5 ml': {
          mgPer5ml: 180,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Kapsułka 400 mg': {
          mgPerTablet: 400,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cyprofloksacyna – fluorochinolon stosowany w leczeniu zakażeń układu
     * moczowego, zwłaszcza odmiedniczkowego zapalenia nerek oraz powikłanych
     * zakażeń dróg moczowych. Dostępna w tabletkach 250 mg i 500 mg oraz w
     * roztworach do infuzji (200 mg/100 ml lub 400 mg/200 ml). Preparaty
     * tabletek najczęściej pakowane są po 10–20 sztuk.
     */
    'Cyprofloksacyna': {
      forms: {
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Roztwór 200 mg/100 ml': {
          mgPerVial: 200,
          packaging: [1],
          formType: 'vial'
        },
        'Roztwór 400 mg/200 ml': {
          mgPerVial: 400,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Lewofloksacyna – fluorochinolon o szerokim spektrum aktywności, stosowany
     * w powikłanych zakażeniach dróg moczowych i odmiedniczkowym zapaleniu
     * nerek. Tabletki 500 mg są najczęściej sprzedawane w opakowaniach po 10
     * lub 20 sztuk; roztwór do infuzji zawiera 500 mg leku w 100 ml.
     */
    'Lewofloksacyna': {
      forms: {
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Roztwór 500 mg/100 ml': {
          mgPerVial: 500,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Gentamycyna – aminoglikozyd stosowany pozajelitowo w ciężkich zakażeniach
     * układu moczowego. Ampułki zawierają 40 mg w 1 ml lub 80 mg w 2 ml.
     * Standardowe opakowania zawierają pojedyncze ampułki lub zestawy po 10 sztuk.
     */
    'Gentamycyna': {
      forms: {
        'Ampułka 40 mg/1 ml': {
          mgPerVial: 40,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Ampułka 80 mg/2 ml': {
          mgPerVial: 80,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Amikacyna – aminoglikozyd o szerokim spektrum działania. Stosowana
     * pozajelitowo w powikłanych zakażeniach układu moczowego i urosepsie.
     * Ampułki zawierają 100 mg lub 500 mg substancji w 2 ml roztworu, w
     * opakowaniach jednostkowych lub zbiorczych (10 szt.).
     */
    'Amikacyna': {
      forms: {
        'Ampułka 100 mg/2 ml': {
          mgPerVial: 100,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Ampułka 500 mg/2 ml': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Cefepim – cefalosporyna IV generacji stosowana w ciężkich zakażeniach,
     * w tym powikłanych zakażeniach układu moczowego. Dostępna w fiolkach
     * 1 g i 2 g. Przyjmujemy opakowania pojedyncze lub po 10 sztuk.
     */
    'Cefepim': {
      forms: {
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2 g': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Piperacylina z tazobaktamem – połączenie penicyliny o szerokim spektrum
     * z inhibitorem beta‑laktamaz, stosowane w ciężkich powikłanych
     * zakażeniach układu moczowego i urosepsie. Fiolka 4,5 g (4 g
     * piperacyliny + 0,5 g tazobaktamu) stanowi podstawową jednostkę. Opakowania
     * zawierają zazwyczaj 1 lub 10 fiolek.
     */
    'Piperacylina z tazobaktamem': {
      forms: {
        'Fiolka 4,5 g': {
          mgPerVial: 4500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Imipenem z cilastatyną – karbapenem podawany dożylnie w ciężkich
     * zakażeniach układu moczowego. Fiolka zawiera 500 mg imipenemu
     * (zawierającego w równych częściach imipenem i cilastatynę). Opakowania
     * zawierają pojedyncze fiolki lub zestawy po 10 sztuk.
     */
    'Imipenem z cilastatyną': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Meropenem – karbapenem stosowany w najcięższych zakażeniach i u pacjentów
     * z urosepsą. Dostępny w fiolkach 500 mg i 1 g. Przyjmujemy opakowania
     * pojedyncze lub po 10 sztuk.
     */
    'Meropenem': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Doripenem – karbapenem o wąskim zastosowaniu, stosowany w ciężkich
     * infekcjach szpitalnych, w tym powikłanych zakażeniach układu moczowego.
     * W Polsce dostępna jest fiolka 500 mg (Doripax). Przyjmujemy opakowania
     * pojedyncze lub po 10 sztuk.
     */
    'Doripenem': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    }
    ,
    /*
     * Cefazolina – cefalosporyna I generacji stosowana w leczeniu zakażeń skóry i tkanki podskórnej.
     * Dostępna w fiolkach 1 g i 2 g do podania dożylnego; w Polsce marką handlową jest Biofazolin.
     */
    'Cefazolina': {
      forms: {
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2 g': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Benzylopenicylina (penicylina G) – antybiotyk beta-laktamowy stosowany dożylnie w ciężkich zakażeniach paciorkowcowych.
     * W praktyce pediatrycznej dawki przelicza się w jednostkach; przyjmujemy fiolkę 1 000 000 j.m. (~600 mg) i 5 000 000 j.m. (~3 g).
     */
    'Benzylopenicylina': {
      forms: {
        'Fiolka 1 000 000 j.m.': {
          mgPerVial: 600,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 5 000 000 j.m.': {
          mgPerVial: 3000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Metronidazol – lek przeciwbakteryjny i przeciwpasożytniczy stosowany w zakażeniach beztlenowych oraz w ropniach.
     * Dostępny w tabletkach 250 mg i 500 mg oraz w roztworach do infuzji 500 mg/100 ml.
     */
    'Metronidazol': {
      forms: {
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Roztwór 500 mg/100 ml': {
          mgPerVial: 500,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Wankomycyna – glikopeptyd stosowany w leczeniu ciężkich zakażeń skóry wywołanych przez MRSA.
     * Dostępna w fiolkach 500 mg i 1 g.
     */
    'Wankomycyna': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Linezolid – oksazolidynon skuteczny przeciw MRSA i VRE, stosowany doustnie i dożylnie.
     * Dostępny w tabletkach 600 mg oraz zawiesinie do podania doustnego 100 mg/5 ml.
     */
    'Linezolid': {
      forms: {
        'Tabletka 600 mg': {
          mgPerTablet: 600,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [150],
          formType: 'suspension'
        }
      }
    }
  };

  /**
   * Lista przykładowych nazw handlowych dla poszczególnych leków i ich postaci.
   * Pozwala to użytkownikowi szybko wybrać konkretne preparaty po obliczeniu
   * dawki. Nazwy te pochodzą z oficjalnych stron producentów, rejestrów
   * leków lub są powszechnie używanymi nazwami handlowymi w Polsce. W razie
   * potrzeby zestaw można rozszerzyć, zachowując strukturę: nazwa leku →
   * nazwa postaci → tablica nazw handlowych.
   */
  const BRAND_NAMES = {
    'Fenoksymetylpenicylina': {
      'Zawiesina 750 000 j.m./5 ml': ['Ospen 750', 'Polcillin 750'],
      // Uwaga: w formularzu granulat fenoksymetylpenicyliny opisany jest jako "Granulat 100 mg/ml (5 ml = 500 mg)".
      // Dlatego klucz w mapie musi dokładnie odpowiadać tej etykiecie, aby brandy mogły zostać znalezione.
      'Granulat 100 mg/ml (5 ml = 500 mg)': ['Polcillin 100 mg/ml'],
      'Tabletka 1 000 000 j.m.': ['Ospen 1000'],
      'Tabletka 1 500 000 j.m.': ['Ospen 1500']
    },
    'Amoksycylina': {
      // Zawiesina 250 mg/5 ml – brandy: Amotaks, Ospamox, Hiconcil. Dodajemy też wpisy z normalnymi spacjami,
      // aby obsłużyć etykiety formularza z łańcuchem "mg/5 ml".
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      // Zawiesina 500 mg/5 ml: na rynku dostępne są Amotaks i Ospamox – warianty "Forte" i Hiconcil 500 mg/5 ml nie istnieją【17†L78-L86】【17†L95-L103】.
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      // Tabletki (monopreparaty amoksycyliny) – na podstawie CHPL Amoxicillin MIP Pharma【48486770934528†L1010-L1013】.
      'Tabletka 500 mg': ['Amoxicillin MIP', 'Ospamox', 'Hiconcil', 'Amotaks'],
      // Tabletka 1000 mg: dostępne są Amoxicillin MIP Pharma, Ospamox 1000 mg i Amotaks 1 g. Hiconcil 1 g nie jest dostępny【28†L112-L120】.
      'Tabletka 1000 mg': ['Amoxicillin MIP', 'Ospamox 1 g', 'Amotaks 1 g'],
      // Tabletki do sporządzania zawiesiny ("Dis") – o różnych mocach; popularne brandy to Duomox oraz warianty Amotaks Dis/Ospamox Dis.
      'Tabletka do sporządzania zawiesiny 250 mg': ['Duomox 250'],
      'Tabletka do sporządzania zawiesiny 375 mg': ['Duomox 375'],
      // Tabletki do sporządzania zawiesiny 500 mg: Ospamox Dis w tej formie nie jest dostępny – usuwamy go【21†L163-L171】.
      'Tabletka do sporządzania zawiesiny 500 mg': ['Duomox 500', 'Amotaks Dis'],
      'Tabletka do sporządzania zawiesiny 750 mg': ['Duomox 750', 'Amotaks Dis 750'],
      'Tabletka do sporządzania zawiesiny 1 g': ['Duomox 1000', 'Amotaks Dis 1000']
    },
    'Amoksycylina z kwasem klawulanowym': {
      'Zawiesina 400 mg/57 mg/5 ml': ['Amoksiklav', 'Augmentin', 'Taromentin'],
      'Zawiesina 600 mg/42,9 mg/5 ml (ES)': ['Amoksiklav ES', 'Augmentin ES'],
      'Tabletka 500 mg/125 mg': ['Amoksiklav', 'Augmentin'],
      // Tabletka 875 mg/125 mg: w Polsce stosuje się nazwy Amoksiklav 875 mg/125 mg i Augmentin 875 mg/125 mg (często oznaczane jako 1 g),
      // określenie "Forte" w przypadku tabletek jest nieoficjalne【32†L29-L37】【36†L94-L102】.
      'Tabletka 875 mg/125 mg': ['Amoksiklav', 'Augmentin', 'Amoksiklav Quicktab']
    },
    'Aksetyl cefuroksymu': {
      'Zawiesina 125 mg/5 ml': ['Zinnat', 'Ceroxim'],
      // Wersje „Forte” (250 mg/5 ml i tabletki 500 mg) nie są zarejestrowane w Polsce【881048865350420†L100-L104】, dlatego pozostawiamy podstawowe nazwy.
      'Zawiesina 250 mg/5 ml': ['Zinnat', 'Ceroxim'],
      'Tabletka 250 mg': ['Zinnat', 'Ceroxim'],
      'Tabletka 500 mg': ['Zinnat', 'Ceroxim']
    },
    'Klarytromycyna': {
      'Zawiesina 125 mg/5 ml': ['Klabax', 'Klacid'],
      // Brak oficjalnych wersji „Forte” na polskim rynku – używamy podstawowych nazw klarytromycyny dla form o większym stężeniu.
      'Zawiesina 250 mg/5 ml': ['Klabax', 'Klacid'],
      'Tabletka 250 mg': ['Klabax', 'Klacid'],
      'Tabletka 500 mg': ['Klabax', 'Klacid']
    },
    'Azytromycyna': {
      'Zawiesina 100 mg/5 ml': ['Sumamed', 'AzitroLEK', 'Azycyna'],
      'Zawiesina 200 mg/5 ml': ['Sumamed Forte', 'AzitroLEK Forte', 'Azycyna Forte'],
      'Tabletka 250 mg': ['Sumamed', 'AzitroLEK'],
      'Tabletka 500 mg': ['Sumamed Forte', 'Azycyna Forte']
    },
    'Cefadroksyl': {
      'Zawiesina 250 mg/5 ml': ['Duracef', 'Biodroxyl'],
      'Tabletka 500 mg': ['Duracef'],
      'Tabletka 1 000 mg': ['Duracef Forte']
    },
    'Cefaleksyna': {
      'Zawiesina 125 mg/5 ml': ['Cefaleksyna Polfa'],
      'Zawiesina 250 mg/5 ml': ['Cefaleksyna Forte'],
      'Tabletka 250 mg': ['Cefaleksyna Polfa'],
      'Tabletka 500 mg': ['Cefaleksyna TZF']
    },
    'Klindamycyna': {
      // Preparat Dalacin C występuje w postaci granulatu do sporządzania
      // zawiesiny 75 mg/5 ml oraz w kapsułkach 150 mg i 300 mg. Zgodnie z
      // definicją form powyżej, klucze w mapie muszą dokładnie odpowiadać
      // etykietom formularza, aby nazwy handlowe były prawidłowo przypisywane.
      'Granulat 75 mg/5 ml': ['Dalacin C'],
      'Kapsułka 150 mg': ['Dalacin C', 'Clindamycin MIP', 'Klimicin'],
      'Kapsułka 300 mg': ['Dalacin C Forte', 'Clindamycin MIP Forte', 'Klimicin']
    },
    /*
     * Furazydyna – nazwy handlowe najpopularniejszych preparatów 50 mg i 100 mg.
     * Dodajemy również warianty z normalnymi spacjami (bez twardej spacji),
     * aby dopasować etykiety formularza.
     */
    'Furazydyna': {
      'Tabletka 50 mg': ['Furaginum', 'Urofuraginum'],
      'Tabletka 50 mg': ['Furaginum', 'Urofuraginum'],
      'Tabletka 100 mg': ['Furaginum Forte', 'Urofuraginum Forte'],
      'Tabletka 100 mg': ['Furaginum Forte', 'Urofuraginum Forte'],
      // Zawiesina furazydyny (10 mg/ml, 50 mg/5 ml). Główną marką jest Dafurag.
      'Zawiesina 50 mg/5 ml': ['Dafurag'],
      'Zawiesina 50 mg/5 ml': ['Dafurag']
    },
    /*
     * Trimetoprim – monopreparat w tabletkach i zawiesinie. W Polsce dostępne
     * są marki Trimesan i Urotrim. Duplikaty z normalnymi spacjami
     * zapewniają kompatybilność z etykietami formularza.
     */
    'Trimetoprim': {
      'Tabletka 100 mg': ['Trimesan', 'Urotrim'],
      'Tabletka 100 mg': ['Trimesan', 'Urotrim'],
      'Tabletka 200 mg': ['Trimesan Forte', 'Urotrim Forte'],
      'Tabletka 200 mg': ['Trimesan Forte', 'Urotrim Forte'],
      'Zawiesina 100 mg/5 ml': ['Trimesan Zawiesina', 'Urotrim Zawiesina'],
      'Zawiesina 100 mg/5 ml': ['Trimesan Zawiesina', 'Urotrim Zawiesina']
    },
    /*
     * Trimetoprim-sulfametoksazol (kotrimoksazol) – preparaty złożone.
     */
    'Trimetoprim-sulfametoksazol': {
      'Zawiesina 240 mg/5 ml': ['Biseptol', 'Bactrim'],
      'Zawiesina 240 mg/5 ml': ['Biseptol', 'Bactrim'],
      'Tabletka 160 mg/800 mg': ['Biseptol 960', 'Bactrim Forte', 'Septrin Forte'],
      'Tabletka 160 mg/800 mg': ['Biseptol 960', 'Bactrim Forte', 'Septrin Forte']
    },
    /*
     * Fosfomycyna – jednorazowe saszetki. Najpopularniejszą marką jest Monural.
     */
    'Fosfomycyna': {
      'Saszetka 3 g': ['Monural'],
      'Saszetka 3 g': ['Monural']
    },
    /*
     * Cefiksym – preparaty doustne (zawiesina i kapsułki). Zarejestrowane
     * marki w Polsce to Suprax oraz Ranfix.
     */
    'Cefiksym': {
      'Zawiesina 100 mg/5 ml': ['Suprax', 'Ranfix'],
      'Zawiesina 100 mg/5 ml': ['Suprax', 'Ranfix'],
      'Tabletka 400 mg': ['Suprax 400', 'Ranfix 400'],
      'Tabletka 400 mg': ['Suprax 400', 'Ranfix 400']
    },
    /*
     * Ceftibuten – dostępny jako zawiesina i kapsułki pod marką Cedax.
     */
    'Ceftibuten': {
      'Zawiesina 180 mg/5 ml': ['Cedax'],
      'Zawiesina 180 mg/5 ml': ['Cedax'],
      'Kapsułka 400 mg': ['Cedax'],
      'Kapsułka 400 mg': ['Cedax']
    },
    /*
     * Cyprofloksacyna – fluorochinolon. Popularne nazwy handlowe to Ciprinol,
     * Ciprobay i Cipronex. Dodajemy duplikaty z normalnymi spacjami.
     */
    'Cyprofloksacyna': {
      'Tabletka 250 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 250 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 500 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 500 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Roztwór 200 mg/100 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 200 mg/100 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 400 mg/200 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 400 mg/200 ml': ['Ciprinol i.v.', 'Ciprobay i.v.']
    },
    /*
     * Lewofloksacyna – fluorochinolon. W Polsce dostępne preparaty to Tavanic
     * oraz Levoxa (tabletki) i Tavanic w infuzji.
     */
    'Lewofloksacyna': {
      'Tabletka 500 mg': ['Tavanic', 'Levoxa'],
      'Tabletka 500 mg': ['Tavanic', 'Levoxa'],
      'Roztwór 500 mg/100 ml': ['Tavanic i.v.'],
      'Roztwór 500 mg/100 ml': ['Tavanic i.v.']
    },
    /*
     * Gentamycyna – aminoglikozyd. Popularne preparaty to Gentamicin Kabi
     * oraz Gentamycyna Polfa. Dodajemy warianty z normalnymi spacjami.
     */
    'Gentamycyna': {
      'Ampułka 40 mg/1 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 40 mg/1 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 80 mg/2 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 80 mg/2 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa']
    },
    /*
     * Amikacyna – aminoglikozyd o szerokim zastosowaniu w zakażeniach powikłanych.
     */
    'Amikacyna': {
      'Ampułka 100 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 100 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 500 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 500 mg/2 ml': ['Amikacin Kabi']
    },
    /*
     * Cefepim – cefalosporyna IV generacji. W Polsce dostępny preparat Maxipime.
     */
    'Cefepim': {
      'Fiolka 1 g': ['Maxipime'],
      'Fiolka 1 g': ['Maxipime'],
      'Fiolka 2 g': ['Maxipime Forte'],
      'Fiolka 2 g': ['Maxipime Forte']
    },
    /*
     * Piperacylina z tazobaktamem – preparat Tazocin.
     */
    'Piperacylina z tazobaktamem': {
      'Fiolka 4,5 g': ['Tazocin'],
      'Fiolka 4.5 g': ['Tazocin']
    },
    /*
     * Imipenem z cilastatyną – preparat Tienam.
     */
    'Imipenem z cilastatyną': {
      'Fiolka 500 mg': ['Tienam'],
      'Fiolka 500 mg': ['Tienam']
    },
    /*
     * Meropenem – preparaty Meronem i Meropenem Kabi.
     */
    'Meropenem': {
      'Fiolka 500 mg': ['Meronem', 'Meropenem Kabi'],
      'Fiolka 500 mg': ['Meronem', 'Meropenem Kabi'],
      'Fiolka 1 g': ['Meronem Forte', 'Meropenem Kabi'],
      'Fiolka 1 g': ['Meronem Forte', 'Meropenem Kabi']
    },
    /*
     * Doripenem – preparat Doripax.
     */
    'Doripenem': {
      'Fiolka 500 mg': ['Doripax'],
      'Fiolka 500 mg': ['Doripax']
    }
    ,
    'Cefazolina': {
      'Fiolka 1 g': ['Biofazolin'],
      'Fiolka 1 g': ['Biofazolin'],
      'Fiolka 2 g': ['Biofazolin Forte'],
      'Fiolka 2 g': ['Biofazolin Forte']
    },
    'Benzylopenicylina': {
      'Fiolka 1 000 000 j.m.': ['Penicylina G', 'Benzylpenicillin'],
      'Fiolka 1 000 000 j.m.': ['Penicylina G', 'Benzylpenicillin'],
      'Fiolka 5 000 000 j.m.': ['Penicylina G Forte', 'Benzylpenicillin Forte'],
      'Fiolka 5 000 000 j.m.': ['Penicylina G Forte', 'Benzylpenicillin Forte']
    },
    'Metronidazol': {
      'Tabletka 250 mg': ['Metronidazol Polfa', 'Metronidazol Jelfa'],
      'Tabletka 250 mg': ['Metronidazol Polfa', 'Metronidazol Jelfa'],
      'Tabletka 500 mg': ['Metronidazol Polfa Forte', 'Metronidazol Hasco'],
      'Tabletka 500 mg': ['Metronidazol Polfa Forte', 'Metronidazol Hasco'],
      'Roztwór 500 mg/100 ml': ['Metronidazol Polfa i.v.'],
      'Roztwór 500 mg/100 ml': ['Metronidazol Polfa i.v.']
    },
    'Wankomycyna': {
      'Fiolka 500 mg': ['Vancocin', 'Wankomycyna MIP'],
      'Fiolka 500 mg': ['Vancocin', 'Wankomycyna MIP'],
      'Fiolka 1 g': ['Vancocin Forte', 'Wankomycyna MIP Forte'],
      'Fiolka 1 g': ['Vancocin Forte', 'Wankomycyna MIP Forte']
    },
    'Linezolid': {
      'Tabletka 600 mg': ['Zyvoxid'],
      'Tabletka 600 mg': ['Zyvoxid'],
      'Zawiesina 100 mg/5 ml': ['Zyvoxid Zawiesina'],
      'Zawiesina 100 mg/5 ml': ['Zyvoxid Zawiesina']
    }
  };

  /**
   * Pobierz wiek pacjenta z formularza. Zwraca wartość liczbową w latach
   * lub null, jeśli nie podano wieku lub wpisano nieprawidłową wartość.
   *
   * @returns {number|null}
   */
  function getAge(){
    const ageInput = document.getElementById('age');
    if(!ageInput) return null;
    const val = parseFloat(ageInput.value);
    return (!isNaN(val) && val >= 0) ? val : null;
  }

  /**
   * Zbuduj rekomendację dla leków przeciwgorączkowych na podstawie masy i wieku.
   * Dla pacjentów < 10 kg lub w wieku < 1 roku stosujemy preparaty o standardowej mocy,
   * natomiast dla cięższych lub starszych dzieci wybieramy preparaty „Forte”.
   * Funkcja oblicza sugerowaną objętość pojedynczej dawki przy założeniu,
   * że ibuprofen podaje się w dawce 10 mg/kg, a paracetamol w dawce 15 mg/kg na
   * jedną dawkę. Dla ibuprofenu przyjmuje stężenia 20 mg/ml (100 mg/5 ml) dla
   * preparatów standardowych i 40 mg/ml (200 mg/5 ml) dla preparatów Forte.
   * Dla paracetamolu stężenia to 24 mg/ml (120 mg/5 ml) oraz 40 mg/ml dla
   * preparatów Forte. Wyliczone objętości są zaokrąglane do 0,25 ml. Funkcja
   * zwraca jedną linijkę tekstu z nazwami przykładowych preparatów i
   * orientacyjnymi dawkami w ml wraz z częstotliwością podania.
   *
   * @param {number} weight Masa ciała w kilogramach
   * @param {number|null} age Wiek w latach (może być ułamkowy), jeśli dostępny
   * @returns {string} Tekst z zaleceniami przeciwgorączkowymi
   */
  function buildAntipyreticLine(weight, age){
    // Określ, czy stosować preparaty Forte. Zgodnie z zaleceniem:
    // * u młodszych/lżejszych dzieci (<10 kg lub <12 mies.) stosujemy preparaty
    //   standardowe (niższe stężenie);
    // * u starszych/cięższych dzieci (≥10 kg lub ≥1 rok) stosujemy preparaty
    //   Forte (wyższe stężenie).  Wartość `age` może być null, gdy wiek nie
    //   został wprowadzony; wówczas decyzja opiera się wyłącznie na masie.
    let useForte = false;
    // Ustal czy dziecko spełnia kryterium masy lub wieku dla preparatu Forte.
    const qualifiesByWeight = weight >= 10;
    const qualifiesByAge = (age !== null && age >= 1);
    if(qualifiesByWeight || qualifiesByAge){
      useForte = true;
    }
    // Obliczenia dla ibuprofenu: dawka 10 mg/kg
    const iboMg = weight * 10;
    const iboConc = useForte ? 40 : 20; // mg w 1 ml
    let iboMl = iboMg / iboConc;
    iboMl = Math.round(iboMl * 4) / 4; // zaokrąglenie do 0,25 ml
    const iboMlStr = fmt(iboMl);
    // Przykładowe nazwy preparatów ibuprofenu
    const iboBrands = useForte
      ? 'Ibum Forte, Nurofen Forte dla Dzieci'
      : 'Ibum dla Dzieci, Nurofen dla Dzieci';
    // Obliczenia dla paracetamolu: dawki 15 mg/kg (co 6 h) oraz 10 mg/kg (co 4 h).
    const parMg15 = weight * 15;
    const parMg10 = weight * 10;
    // Stężenie syropu: 24 mg/ml (120 mg/5 ml) dla standardu, 40 mg/ml (200 mg/5 ml) dla preparatów Forte.
    const parConc = useForte ? 40 : 24;
    let parVol6 = parMg15 / parConc;
    let parVol4 = parMg10 / parConc;
    // Zaokrąglij objętości do 0,25 ml dla syropów.
    parVol6 = Math.round(parVol6 * 4) / 4;
    parVol4 = Math.round(parVol4 * 4) / 4;
    const parVol6Str = fmt(parVol6);
    const parVol4Str = fmt(parVol4);
    // Nazwy preparatów paracetamolu: w wersji standardowej używamy Panadol dla Dzieci,
    // w wersji Forte – APAP dla Dzieci FORTE.
    const parBrand = useForte
      ? 'APAP dla Dzieci FORTE'
      : 'Panadol dla Dzieci';
    // Obliczenia dla Pedicetamolu (100 mg/ml), dostępnego dla dzieci ≤32 kg. Nie zaokrąglamy
    // do 0,25 ml – stosujemy pełne przeliczenie z dokładnością do dwóch miejsc.
    let pedPart = '';
    if(weight <= 32){
      // Oblicz objętość Pedicetamolu (100 mg/ml). Dawki 15 mg/kg co 6 h i 10 mg/kg co 4 h.
      // Zaokrąglij wynik do 0,1 ml (jedno miejsce po przecinku), ponieważ lek ten wymaga
      // precyzyjnego dawkowania. Zmienna fmt w dalszej części sformatuje
      // wynik do dwóch miejsc, zachowując 0,10 ml jako 0,10 czy 0,20 ml.
      let pedVol6 = (weight * 15) / 100;
      let pedVol4 = (weight * 10) / 100;
      // Rounding to nearest 0,1 ml
      pedVol6 = Math.round(pedVol6 * 10) / 10;
      pedVol4 = Math.round(pedVol4 * 10) / 10;
      const pedVol6Str = fmt(pedVol6);
      const pedVol4Str = fmt(pedVol4);
      pedPart = `; Pedicetamol – ${pedVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${pedVol4Str} ml na dawkę (10 mg/kg) co 4 godziny`;
    }
    return `Leki przeciwgorączkowe: ibuprofen np. ${iboBrands} – ${iboMlStr} ml na dawkę, maksymalnie 4 × na dobę (co 6 godzin); paracetamol np. ${parBrand} – ${parVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${parVol4Str} ml na dawkę (10 mg/kg) co 4 godziny${pedPart}.`;
  }

  /**
   * Oblicza wiek dziecka w miesiącach na podstawie pól formularza #age i #ageMonths.
   * Zwraca liczbę miesięcy lub null, jeśli wiek nie jest uzupełniony.
   * @returns {number|null}
   */
  function getChildAgeMonths(){
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    let months = null;
    if(yearsEl && yearsEl.value){
      const y = parseFloat(yearsEl.value.replace(',', '.'));
      if(!isNaN(y)){
        months = y * 12;
      }
    }
    if(monthsEl && monthsEl.value){
      const m = parseFloat(monthsEl.value.replace(',', '.'));
      if(!isNaN(m)){
        months = (months || 0) + m;
      }
    }
    return (months !== null && !isNaN(months)) ? months : null;
  }

  /**
   * Normalizuje tekst wskazania na klucz używany w mapie RED_FLAGS.
   * Używa nazw polskich, zamienia je na uproszczone identyfikatory.
   * @param {string} val
   * @returns {string|null}
   */
  function normalizeRedIndication(val){
    if(!val) return null;
    const v = val.toLowerCase();
    // Wartość selecta abxIndication może być zarówno etykietą w języku polskim
    // (np. „Ostre zapalenie gardła i migdałków podniebiennych”), jak i kluczem
    // wewnętrznym (np. „pharyngitis”). Dlatego sprawdzamy kilka warunków.
    // Gardło i migdałki – etykiety i klucz 'pharyngitis'
    if(v.includes('gard') || v.includes('migda') || v.includes('pharyngitis')) return 'throat';
    // Niepowikłane/powikłane zakażenia układu moczowego i inne klucze ZUM
    if(v.includes('mocz') || v.includes('zum') || v.includes('uti')) return 'uti';
    // Zapalenie płuc (np. „pneumonia” w kluczu)
    if(v.includes('płuc') || v.includes('pneum')) return 'pneumonia';
    // Zapalenie ucha środkowego (klucz 'otitis')
    if(v.includes('ucho') || v.includes('otitis')) return 'otitis';
    // Zapalenie zatok (klucz 'sinusitis') lub nosa
    if(v.includes('zatok') || v.includes('nos') || v.includes('sinus')) return 'sinusitis';
    return null;
  }

  /**
   * Mapa czerwonych flag dla poszczególnych wskazań i grup wiekowych.
   * Każdy wpis zawiera tekst, który zostanie dodany w zaleceniach.
   */
  const RED_FLAGS = {
    throat: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy dziecko ma wyraźne trudności z oddychaniem (przyspieszony, męczący oddech, „zaciąganie” między żebrami), ślini się i nie może połykać albo staje się wyjątkowo senne i odmawia picia.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy ból gardła lub gorączka utrzymują się ponad 2–3 dni, ból gardła jest jednostronny, dziecko ma trudność z szerokim otwarciem ust, ślini się, mówi przytłumionym głosem albo zaczyna trudniej oddychać.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy ból gardła nasila się po jednej stronie, pojawia się trudność w połykaniu lub oddychaniu, szyja jest sztywna i bolesna przy ruchach, głos staje się nietypowo przytłumiony albo gorączka trwa ponad 3 dni mimo leczenia.'
    },
    uti: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy gorączka nie spada po 2 dniach leczenia, dziecko wymiotuje, odmawia jedzenia/picia, jest bardzo senne albo siusia wyraźnie rzadziej (np. sucha pielucha przez wiele godzin).',
      young: 'Skontaktuj się ponownie z lekarzem, gdy mimo leczenia pojawiają się wymioty (dziecko nie może przyjąć leków i płynów), gorączka utrzymuje się dłużej niż 2–3 dni albo boli bok/plecy w okolicy nerek; zgłoś się także, gdy dziecko siusia dużo rzadziej (oznaką może być senność, suchość w ustach).',
      older: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się ból w dole pleców lub boku (okolice nerek), dreszcze, krew w moczu albo wymioty lub brak poprawy po 2–3 dniach leczenia.'
    },
    pneumonia: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy dziecko oddycha wyraźnie szybciej lub z wysiłkiem (wciąga przestrzenie między żebrami, ruszają skrzydełka nosa), sinieją usta lub palce, odmawia karmienia albo trudno je dobudzić. Każde pogorszenie oddychania wymaga pilnej ponownej oceny przez lekarza.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy narasta duszność lub przyspieszony oddech, pojawia się ból w klatce piersiowej lub plecach, dziecko wygląda na odwodnione (mało pije, rzadko siusia) albo gorączka nie ustępuje po 2–3 dniach leczenia.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy duszność się nasila, pojawia się kłujący ból przy oddychaniu, wysoka gorączka utrzymuje się mimo leczenia albo dziecko jest wyraźnie osłabione.'
    },
    otitis: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się obrzęk i zaczerwienienie za uchem z „odstawaniem” małżowiny, utrzymuje się wysoka gorączka albo dziecko jest wyjątkowo senne, wiotkie.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy silny ból ucha albo gorączka trwają ponad 2–3 dni mimo leczenia, z ucha sączy się ropa z nasilonym bólem, pojawia się obrzęk i bolesność za uchem albo dziecko skarży się na zawroty głowy.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy ból ucha nasila się zamiast słabnąć, występuje ropny wyciek, zawroty głowy, osłabienie mięśni twarzy albo bolesny obrzęk za uchem.'
    },
    sinusitis: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się obrzęk i zaczerwienienie powiek lub wokół oka, dziecko jest nietypowo senne, trudno je dobudzić albo utrzymuje się wysoka gorączka.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy powieki lub okolice oka puchną i bolą, ruchy oka są bolesne lub ograniczone, widzenie się pogarsza (np. podwójne widzenie) albo ból twarzy jest silny i jednostronny.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się silny ból głowy (zwłaszcza czoła), obrzęk czoła, sztywność karku, światłowstręt albo zaburzenia widzenia (np. podwójne widzenie). To mogą być objawy rozwijających się powikłań zapalenia zatok.'
    }
  };

  /**
   * Generuje tekst z czerwonymi flagami (red flags) w zależności od
   * wybranego wskazania i wieku dziecka. Jeżeli wskazanie lub wiek nie jest
   * dostępny, funkcja zwraca pusty łańcuch. Wynik jest bez numeracji –
   * numeracja dodawana jest w funkcji generateRecommendation.
   * @returns {string}
   */
  function buildRedFlagsLine(){
    // Pobierz wskazanie z pola abxIndication
    const sel = document.getElementById('abxIndication');
    if(!sel || !sel.value) return '';
    const key = normalizeRedIndication(sel.value);
    if(!key || !RED_FLAGS[key]) return '';
    // Ustal grupę wiekową na podstawie wieku w miesiącach
    const months = getChildAgeMonths();
    let group = 'young';
    if(months !== null){
      if(months < 12){
        group = 'infant';
      } else if(months < 72){
        group = 'young';
      } else {
        group = 'older';
      }
    }
    const text = RED_FLAGS[key][group] || '';
    if(!text) return '';
    // Red flags texts already contain the appropriate preamble (e.g. "Skontaktuj się ponownie z lekarzem, gdy…").
    // We return the text directly without adding a "Czerwone flagi" prefix, so that
    // the narrative remains clear and simple for parents.
    return text;
  }

  /**
   * Generuje zalecenia dotyczące stosowania leków przeciwgorączkowych (ibuprofen i paracetamol)
   * na podstawie masy ciała oraz wieku (jeśli podany). Funkcja zwraca sformatowany
   * łańcuch tekstowy z informacjami o zalecanych dawkach w mg/kg, przeliczeniu na mg
   * oraz orientacyjnych objętościach syropu, wraz z ostrzeżeniami dla młodszych
   * niemowląt. Jeżeli masa nie jest podana, funkcja zwraca pusty ciąg.
   *
   * @param {number} weight Masa ciała w kilogramach
   * @param {number|null} age Wiek w latach (może być ułamkowy), jeśli dostępny
   * @returns {string} Tekst zaleceń dla leków przeciwgorączkowych
   */
  function getAntipyreticAdvice(weight, age){
    if(!weight || weight <= 0){
      return '';
    }
    const lines = [];
    // Ibuprofen – dawka 5–10 mg/kg/dawkę co 6–8 godzin, max 40 mg/kg/dobę.
    // W niektórych źródłach (np. wytyczne IDSA) stosuje się zakres 4–10 mg/kg/dawkę,
    // ale w praktyce pediatrycznej 5 mg/kg stanowi wygodny dół przedziału. Poniżej
    // bazujemy na 5–10 mg/kg/dawkę, a powiadomienie o niemowlętach <6 mies. pojawia się niżej.
    const iboLowMg = weight * 5;
    const iboHighMg = weight * 10;
    const iboMaxDaily = weight * 40;
    // Syrop 100 mg/5 ml ⇒ 20 mg/ml
    const iboLowMl = iboLowMg / 20;
    const iboHighMl = iboHighMg / 20;
    const iboLowMlRounded = Math.round(iboLowMl * 10) / 10;
    const iboHighMlRounded = Math.round(iboHighMl * 10) / 10;
    let iboAgeWarning = '';
    if(age !== null && age < 0.5){
      iboAgeWarning = ' – nie stosować u niemowląt <6 mies.';
    }
    lines.push(`Ibuprofen: 5–10 mg/kg/dawkę co 6–8 h. Dla tej masy: ${Math.round(iboLowMg)}–${Math.round(iboHighMg)} mg (≈${iboLowMlRounded}–${iboHighMlRounded} ml syropu 100 mg/5 ml) na dawkę; max ${Math.round(iboMaxDaily)} mg/dobę${iboAgeWarning}. Przykłady: Nurofen, Ibum, Ibufen.`);
    // Paracetamol – dawka 10–15 mg/kg/dawkę co 4–6 godzin, max 60 mg/kg/dobę
    const parLowMg = weight * 10;
    const parHighMg = weight * 15;
    const parMaxDaily = weight * 60;
    // Syrop 120 mg/5 ml ⇒ 24 mg/ml
    const parLowMl = parLowMg / 24;
    const parHighMl = parHighMg / 24;
    const parLowMlRounded = Math.round(parLowMl * 10) / 10;
    const parHighMlRounded = Math.round(parHighMl * 10) / 10;
    let parAgeWarning = '';
    // W przypadku noworodków (< 4 tygodnie) zaleca się dawkę 10 mg/kg 3–4 razy dziennie,
    // z maksymalną dawką dobową 40 mg/kg; informujemy o tym w ostrzeżeniu.
    if(age !== null && age < (1/12)){
      parAgeWarning = ' – u noworodków do 4 tygodnia życia stosuj 10 mg/kg/dawkę maks. 3–4 ×/dobę (max 40 mg/kg/dobę)';
    }
    lines.push(`Paracetamol: 10–15 mg/kg/dawkę co 4–6 h. Dla tej masy: ${Math.round(parLowMg)}–${Math.round(parHighMg)} mg (≈${parLowMlRounded}–${parHighMlRounded} ml syropu 120 mg/5 ml) na dawkę; max ${Math.round(parMaxDaily)} mg/dobę${parAgeWarning}. Przykłady: Apap, Panadol, Calpol.`);
    return lines.join('<br>');
  }

  /**
   * Buduje tekst zaleceń dla pacjenta na podstawie wybranej nazwy handlowej,
   * liczby dawek w ciągu doby, wielkości pojedynczej dawki oraz długości terapii.
   * Do wygenerowanych zaleceń dodawana jest propozycja stosowania probiotyku.
   *
   * @param {string} brandName Nazwa handlowa preparatu
   * @param {number} dosesPerDay Liczba dawek na dobę
   * @param {string} doseStr Wielkość pojedynczej dawki (np. „2,5 ml” lub „0,5 tabl.”)
   * @param {number} duration Czas terapii w dniach
   * @returns {string} Przygotowany tekst zaleceń
   */
  function generateRecommendation(brandName, dosesPerDay, doseStr, duration){
    const firstLine = `${brandName} – ${dosesPerDay} × dziennie po ${doseStr} przez ${duration} dni.`;
    const secondLine = 'Probiotyk 1 × dziennie przez 14 dni.';
    // Dodaj punkt 3 z lekami przeciwgorączkowymi, jeśli znane są dane pacjenta
    const weight = (typeof getWeight === 'function') ? getWeight() : null;
    const ageVal = (typeof getAge === 'function') ? getAge() : null;
    let base = `1. ${firstLine}\n2. ${secondLine}`;
    if(weight && weight > 0){
      const third = buildAntipyreticLine(weight, ageVal);
      base += `\n3. ${third}`;
    }
    // Dodaj punkt 4 z czerwonymi flagami, jeśli są dostępne
    const red = buildRedFlagsLine();
    if(red){
      base += `\n4. ${red}`;
    }
    return base;
  }

  /**
   * Tworzy lub aktualizuje sekcję UI odpowiedzialną za wybór nazwy handlowej
   * oraz kopiowanie zaleceń do schowka. Sekcja pojawia się tylko dla
   * preparatów doustnych, które posiadają zdefiniowane przykładowe nazwy
   * handlowe. Dla preparatów dożylnych sekcja pozostaje niewidoczna.
   *
   * @param {string} drugName Nazwa leku (np. "Amoksycylina")
   * @param {string} formName Nazwa postaci leku wybranej przez użytkownika
   * @param {number} dosesPerDay Liczba dawek w ciągu doby
   * @param {string} doseStr Tekst opisujący jedną dawkę (np. "3,25 ml")
   * @param {number} duration Czas trwania terapii w dniach
   */
  function setupRecommendationUI(drugName, formName, dosesPerDay, doseStr, duration){
    const card = document.getElementById('antibioticTherapyCard');
    if(!card) return;
    let recSection = document.getElementById('abxRecSection');
    if(!recSection){
      recSection = document.createElement('div');
      recSection.id = 'abxRecSection';
      recSection.style.marginTop = '.8rem';
      card.appendChild(recSection);
    }
    // Ukryj sekcję domyślnie
    recSection.innerHTML = '';
    recSection.style.display = 'none';
    // Sprawdź, czy dany lek ma definicję formy
    const drugDef = DRUG_INFO[drugName];
    let formDef = null;
    if(drugDef && drugDef.forms && formName){
      formDef = drugDef.forms[formName];
    }
    if(!formDef) return;
    // Jeśli forma jest fiolką (dożylnie), nie tworzymy sekcji zaleceń
    if(formDef.formType === 'vial'){
      return;
    }
    // Uzyskaj listę nazw handlowych dla kombinacji lek/form
    const brandListMap = BRAND_NAMES[drugName];
    // Odszukaj listę nazw handlowych na podstawie nazwy formy. Najpierw sprawdzamy
    // dokładne dopasowanie, a następnie dokonujemy normalizacji białych znaków
    // (zamiana niełamiących spacji na zwykłe spacje), aby obsłużyć warianty
    // etykiet w formularzu. Dzięki temu klucze w BRAND_NAMES mogą zawierać
    // twarde spacje, a mimo to zostaną znalezione, gdy formularz użyje zwykłych spacji.
    let brandList = null;
    if(brandListMap){
      brandList = brandListMap[formName];
      if(!brandList){
        const normalizedForm = formName ? formName.replace(/\u00A0/g, ' ').trim() : '';
        for(const key in brandListMap){
          if(key.replace(/\u00A0/g, ' ').trim() === normalizedForm){
            brandList = brandListMap[key];
            break;
          }
        }
      }
    }
    if(!brandList || brandList.length === 0){
      return;
    }
    // Przygotuj sekcję interfejsu – instrukcja i przyciski są wyśrodkowane
    recSection.style.display = 'block';
    recSection.style.textAlign = 'center';
    recSection.innerHTML = `
      <div id="abxBrandUI" style="border-top: 1px solid #eee; padding-top: .6rem; text-align:center;">
        <p style="margin:.4rem 0 .8rem 0; font-weight:500;">Chcesz mieć gotowe zalecenia? Wybierz nazwę handlową preparatu a potem kliknij „Zalecenia do wklejenia”.</p>
        <div style="display:flex; gap:.6rem; flex-wrap:wrap; justify-content:center; align-items:center; margin-bottom:.4rem;">
          <button id="abxBrandToggle" type="button">Nazwa handlowa</button>
          <button id="abxCopyRec" type="button">Zalecenia do wklejenia</button>
        </div>
        <div id="abxBrandList" style="display:none; text-align:center;"></div>
      </div>
    `;
    const listContainer = recSection.querySelector('#abxBrandList');
    // Wypełnij listę przyciskami dla nazw handlowych
    listContainer.innerHTML = brandList.map((bn, idx) => {
      return `<button type="button" class="abx-brand-option" data-index="${idx}" style="margin:.2rem .4rem .2rem 0;">${bn}</button>`;
    }).join('');
    // Zarządzanie wyborem nazwy handlowej
    let selectedIndex = 0;
    const brandButtons = listContainer.querySelectorAll('.abx-brand-option');
    function updateBrandSelection(i){
      // Zapamiętaj indeks wybranego preparatu
      selectedIndex = i;
      brandButtons.forEach((btn, j) => {
        // Zaznacz bieżący wybór poprzez wytłuszczenie i podkreślenie tekstu
        // oraz dodanie klasy .active-toggle, która nadaje turkusową ramkę
        if(j === selectedIndex){
          btn.style.fontWeight = 'bold';
          btn.style.textDecoration = 'underline';
          btn.classList.add('active-toggle');
        } else {
          btn.style.fontWeight = 'normal';
          btn.style.textDecoration = 'none';
          btn.classList.remove('active-toggle');
        }
      });
    }
    updateBrandSelection(selectedIndex);
    brandButtons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        updateBrandSelection(i);
      });
    });
    // Obsługa kliknięcia przycisku „Nazwa handlowa” – rozwija listę
    const toggleBtn = recSection.querySelector('#abxBrandToggle');
    if(toggleBtn){
      toggleBtn.addEventListener('click', () => {
        // Przełącz widoczność listy nazw handlowych
        const cur = listContainer.style.display;
        const isHidden = (cur === 'none' || cur === '');
        listContainer.style.display = isHidden ? 'block' : 'none';
        // Podświetl przycisk, gdy lista jest widoczna, w przeciwnym razie usuń podświetlenie
        if(isHidden){
          toggleBtn.classList.add('active-toggle');
        } else {
          toggleBtn.classList.remove('active-toggle');
        }
      });
    }
    // Obsługa kopiowania zaleceń do schowka
    const copyBtn = recSection.querySelector('#abxCopyRec');
    if(copyBtn){
      copyBtn.addEventListener('click', () => {
        const brandName = brandList[selectedIndex];
        const recText = generateRecommendation(brandName, dosesPerDay, doseStr, duration);
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(recText).then(() => {
            const oldTxt = copyBtn.textContent;
            copyBtn.textContent = 'Skopiowano!';
            // Podświetl przycisk na turkusowo; klasa zostaje aż do kolejnego kliknięcia lub odświeżenia
            copyBtn.classList.add('active-toggle');
            setTimeout(() => { copyBtn.textContent = oldTxt; }, 2000);
          }).catch(() => {
            alert(recText);
          });
        } else {
          alert(recText);
        }
      });
    }
  }

  // Definicja wskazań wraz z dostępnymi w nich lekami i parametrami dawkowania.
  // Każdy wpis zawiera etykietę (label) oraz obiekt drugs. Jeśli pole drugs jest
  // pominięte, oznacza to, że antybiotykoterapia nie jest zalecana; wówczas
  // wyświetlamy komunikat zawarty w polu message. Każdy lek w sekcji drugs
  // posiada zakres dawek [min,max] w mg/kg/dobę (mgRange), domyślną wartość
  // sugerowaną (defaultMg), liczbę dawek/dobę (doses) oraz rekomendowany czas
  // trwania w dniach (duration). Pole firstChoice=true wyróżnia preparat
  // pierwszego wyboru, który jest domyślnie wybierany po zmianie wskazania.
// -----------------------------------------------------------------------------
// Global maximum daily doses (mg per day) for oral antibiotics.
// These limits apply across all indications to prevent unrealistic dosing.
// Each entry defines the maximum dose for children (<40 kg) and adults (≥40 kg).
// Values are derived from official guidelines (CDC/IDSA/ChPL) and clinical
// practice recommendations. If a value is set to null, it means no global limit
// is applied and the specific drug definition or clinical context will govern
// dosing.
const GLOBAL_MAX_DAILY_DOSES = {
  'Fenoksymetylpenicylina': { child: 750, adult: 1000 },
  // Amoksycylina: standard max 1 g/dobę; wysokodawkowe terapie mogą sięgać 80–90 mg/kg/dobę.
  // U dzieci przyjęto górny limit 4 g/dobę (typowy limit przy 90 mg/kg/dobę), u dorosłych 2 g/dobę.
  'Amoksycylina': { child: 4000, adult: 2000 },
  // Amoksycylina z kwasem klawulanowym (koamoksyklaw) – typowe dawki 45–70 mg/kg/dobę amoksycyliny.
  // Przyjęto 1,75 g/dobę dla dzieci i 2,625 g/dobę dla dorosłych (np. 875 mg × 3).
  'Amoksycylina z kwasem klawulanowym': { child: 1750, adult: 2625 },
  // Duplicate entry with non-breaking spaces (\u00a0) for UI strings that use NBSP.
  'Amoksycylina\u00a0z\u00a0kwasem\u00a0klawulanowym': { child: 1750, adult: 2625 },
  'Cefaleksyna': { child: 1000, adult: 1000 },
  'Cefadroksyl': { child: 1000, adult: 1000 },
  // Aksetyl cefuroksymu (cefuroksym doustny) – maksymalnie 1 g/dobę u dzieci i dorosłych.
  'Aksetyl cefuroksymu': { child: 1000, adult: 1000 },
  // Klarytromycyna – standardowo 500 mg/dobę u dzieci; u dorosłych do 1 g/dobę w ciężkich zakażeniach.
  'Klarytromycyna': { child: 500, adult: 1000 },
  // Azytromycyna – w terapii 5‑dniowej: 500 mg w dniu 1, następnie 250 mg/dobę.
  'Azytromycyna': { child: 500, adult: 500 },
  // Klindamycyna – standard 20–30 mg/kg/dobę u dzieci (max 900 mg), do 1,8 g/dobę u dorosłych.
  'Klindamycyna': { child: 900, adult: 1800 },
  // Cefiksym – zazwyczaj 400 mg/dobę zarówno u dzieci jak i u dorosłych.
  'Cefiksym': { child: 400, adult: 400 },
  // Ceftibuten – podobnie jak cefiksym, 9 mg/kg/dobę (max 400 mg).
  'Ceftibuten': { child: 400, adult: 400 },
  // Cefaklor – w preparatach doustnych IR maksymalnie 1 g/dobę zarówno u dzieci, jak i u dorosłych. Wersja o przedłużonym uwalnianiu (375 mg co 12 h) daje 750 mg/dobę.
  // Dlatego przyjmujemy bezpieczny limit 1 g/dobę dla obu grup.
  'Cefaklor': { child: 1000, adult: 1000 },
  // Furazydyna (nitrofurantoina) – zgodnie z zaleceniami 5–7 mg/kg/dobę w czterech dawkach u dzieci; maksymalnie 400 mg/dobę u dzieci i dorosłych【450746999578656†L165-L171】.
  'Furazydyna': { child: 400, adult: 400 },
  // Trimetoprim – dzieci zwykle otrzymują 5 mg/kg co 12 h (max 200 mg na dawkę), co odpowiada ok. 400 mg/dobę【233094300590923†L111-L115】. U dorosłych stosuje się 100 mg co 12 h lub 200 mg na dobę【233094300590923†L90-L94】.
  'Trimetoprim': { child: 400, adult: 200 },
  // Trimetoprim-sulfametoksazol (kotrimoksazol) – dawki odnoszą się do komponentu trimetoprimu.
  // U dzieci zazwyczaj stosuje się 5–10 mg/kg/dobę w dwóch dawkach (maks. ok. 160–240 mg na dobę). W cięższych zakażeniach można podać do 8–12 mg/kg, jednak nie przekracza się 480 mg na dobę【665090363813362†L110-L118】.
  // U dorosłych standardowa dawka to 160 mg trimetoprimu + 800 mg sulfametoksazolu co 12 h (320 mg trimetoprimu/dobę), a maksymalnie 960 mg trimetoprimu/dobę w ciężkich zakażeniach【665090363813362†L110-L118】.
  'Trimetoprim-sulfametoksazol': { child: 480, adult: 960 },
  // Fosfomycyna – pojedyncza dawka 3 g (3000 mg) u dorosłych i dzieci ≥12 lat.
  'Fosfomycyna': { child: 3000, adult: 3000 },
  // Fluorochinolony: ustawiono umiarkowane limity, choć rzadko stosowane u dzieci.
  'Ciprofloxacyna': { child: 1000, adult: 1500 },
  'Cyprofloksacyna': { child: 1000, adult: 1500 },
  'Lewofloksacyna': { child: 500, adult: 1000 },
  // Kloksacylina – beta-laktam przeciwgronkowcowy; zwykle do 2 g/dobę u dzieci i 4 g/dobę u dorosłych.
  'Kloksacylina': { child: 2000, adult: 4000 },
  // Metronidazol – do 750 mg/dobę u dzieci i 1 500 mg/dobę u dorosłych w zakażeniach jamy brzusznej.
  'Metronidazol': { child: 750, adult: 1500 },
  // Linezolid – 30 mg/kg/dobę u dzieci (max 600 mg), 600 mg 2×/dobę u dorosłych (1 200 mg).
  'Linezolid': { child: 600, adult: 1200 },
  // Wankomycyna – brak doustnych form maksymalnych; nie ustalamy limitów.
  'Wankomycyna': { child: null, adult: null },
  'Gentamycyna': { child: null, adult: null },
  'Piperacylina z tazobaktamem': { child: null, adult: null },
  'Imipenem z cilastatyną': { child: null, adult: null },
  'Meropenem': { child: null, adult: null },
  'Doripenem': { child: null, adult: null }
};

// -----------------------------------------------------------------------------
// Ujednolicenie nazw w tabeli limitów GLOBAL_MAX_DAILY_DOSES
//
// W wielu miejscach interfejs aplikacji stosuje twarde spacje (NBSP) w nazwach
// leków, podczas gdy w tablicy GLOBAL_MAX_DAILY_DOSES mogą występować te same
// nazwy zapisane z klasycznymi spacjami lub odwrotnie. Aby uniknąć sytuacji,
// w której limit nie zostanie odnaleziony ze względu na różnice w rodzaju
// spacji, poniższy blok kodu tworzy dodatkowe wpisy z odpowiednikami kluczy.
// Dzięki temu odwołanie do GLOBAL_MAX_DAILY_DOSES[drugName] zadziała niezależnie
// od tego, czy nazwa leku w formularzu zawiera twarde spacje czy zwykłe.
(() => {
  const entries = Object.entries(GLOBAL_MAX_DAILY_DOSES);
  entries.forEach(([key, value]) => {
    // Wariant z klasycznymi spacjami (zamień wszystkie NBSP na spacje)
    const withSpaces = key.replace(/\u00A0/g, ' ');
    // Wariant z twardymi spacjami (zamień wszystkie klasyczne spacje na NBSP)
    const withNbsp = key.replace(/ /g, '\u00A0');
    // Dodaj wpis z klasycznymi spacjami, jeśli dotychczas go nie ma
    if (!GLOBAL_MAX_DAILY_DOSES.hasOwnProperty(withSpaces)) {
      GLOBAL_MAX_DAILY_DOSES[withSpaces] = value;
    }
    // Dodaj wpis z twardymi spacjami, jeśli dotychczas go nie ma
    if (!GLOBAL_MAX_DAILY_DOSES.hasOwnProperty(withNbsp)) {
      GLOBAL_MAX_DAILY_DOSES[withNbsp] = value;
    }
  });
})();

// Definicje wskazań wraz z sugerowanymi schematami antybiotykoterapii
const ABX_INDICATIONS = {
    'pharyngitis': {
      label: 'Ostre zapalenie gardła i migdałków podniebiennych',
      drugs: {
        // Fenoksymetylpenicylina (Penicillin V) – lek pierwszego wyboru. U dzieci < 40 kg
        // zalecane 100 000–200 000 j.m./kg/dobę w dwóch dawkach co 12 h, a u pacjentów ≥ 40 kg
        // 2–3 mln j.m. na dobę w dwóch dawkach【434395716885121†L774-L808】. Zakres mgRange i dawka będą
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
        'Fenoksymetylpenicylina': { mgRange: [33, 65], defaultMg: 50, doses: 3, duration: 10, firstChoice: true },
        // Amoksycylina jako alternatywa – 50–60 mg/kg/dobę w dwóch dawkach przez 10 dni.
        'Amoksycylina':        { mgRange: [50, 60], defaultMg: 55, doses: 2, duration: 10 },
        // Amoksycylina z kwasem klawulanowym w analogicznych dawkach.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [50, 60], defaultMg: 55, doses: 2, duration: 10 },
        // Cefadroksyl: jednorazowa dawka dobowa 30 mg/kg (dzieci < 40 kg) lub 1 g (pacjenci ≥ 40 kg)【434395716885121†L774-L808】. Dawka podawana raz dziennie.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 1, duration: 10 },
        // Cefaleksyna: 25–50 mg/kg/dobę w 2 dawkach co 12 h (max 1 000 mg/dobę)【434395716885121†L774-L808】.
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: 15 mg/kg/dobę w dwóch dawkach; pacjenci ≥ 40 kg 250–500 mg co 12 h【434395716885121†L774-L808】.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Azytromycyna: 12 mg/kg/dobę w jednej dawce przez 5 dni (u dorosłych i dzieci ≥ 40 kg: 500 mg pierwszego dnia,
        // następnie 250 mg przez 4 dni). W kalkulatorze pozostawiamy uśrednioną dawkę 12 mg/kg/dobę.
        'Azytromycyna':        { mgRange: [12, 12], defaultMg: 12, doses: 1, duration: 5, maxDailyMg: 500 },
        // Klindamycyna – 20–30 mg/kg/dobę w 3 dawkach u dzieci < 40 kg; u pacjentów ≥ 40 kg 300 mg co 8 h【434395716885121†L774-L808】.
        'Klindamycyna':       { mgRange: [20, 30], defaultMg: 25, doses: 3, duration: 10, maxDailyMg: 1800 },
        // Aksetyl cefuroksymu (cefalosporyna II generacji) – 20–30 mg/kg/dobę w dwóch dawkach, max 1 000 mg/dobę【434395716885121†L774-L808】.
        'Aksetyl cefuroksymu':   { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 }
      }
    },
    'otitis': {
      label: 'Ostre zapalenie ucha środkowego',
      drugs: {
        'Amoksycylina':        { mgRange: [75, 90], defaultMg: 80, doses: 2, duration: 7, firstChoice: true },
        // Dla preparatu Amoksiklav ES (600 mg/42,9 mg/5 ml) ChPL podaje, że
        // zwykle stosowaną dawką u dzieci jest 90 mg amoksycyliny + 6,4 mg
        // kwasu klawulanowego na kilogram masy ciała na dobę w dwóch dawkach【759532590181075†L190-L202】.
        // Uaktualniamy domyślną dawkę do 90 mg/kg/dobę, pozostawiając zakres
        // 70–90 mg/kg/dobę zgodnie z wytycznymi.
        // W OZUŚ zarówno u dzieci, jak i u dorosłych może być konieczne stosowanie
        // wysokiej dawki koamoksyklawu. Charakterystyka produktu leczniczego dla
        // tabletek 875 mg/125 mg wskazuje, że w zakażeniach takich jak zapalenie
        // ucha środkowego, zapalenie zatok, zakażenia dolnych dróg oddechowych i
        // zakażenia układu moczowego dorośli i dzieci ≥40 kg mogą otrzymywać
        // jedną tabletkę 875 mg/125 mg co 8 h【560332943530599†L118-L129】. Wprowadzamy
        // trzy dawki na dobę, aby kalkulator sugerował 3× 875 mg w tych
        // wskazaniach, zachowując zakres 70–90 mg/kg/dobę do obliczeń u dzieci.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [70, 90], defaultMg: 90, doses: 3, duration: 7 },
        // Cefuroksym: w OZUŚ stosuje się 30 mg/kg/dobę w dwóch dawkach przez 5–10 dni,
        // przy czym maksymalna dawka dobowa nie powinna przekroczyć 500 mg【479311936043478†L444-L450】.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },
        // Klarytromycyna: dawka 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę【123300810807228†L69-L75】.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 7, maxDailyMg: 1000 },
        // Azytromycyna nie jest zalecana w OZUŚ, ale pozostawiona jako opcja; stosuje się 10–12 mg/kg/dobę.
        'Azytromycyna':        { mgRange: [10, 12], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'sinusitis': {
      label: 'Ostre zapalenie błony śluzowej nosa i zatok przynosowych',
      drugs: {
        'Amoksycylina':        { mgRange: [75, 90], defaultMg: 80, doses: 2, duration: 10, firstChoice: true },
        // Jak w przypadku OZUŚ, dla Amoksiklav ES zalecana dzienna dawka to
        // 90 mg/kg/dobę podzielona na dwie dawki【759532590181075†L190-L202】. Domyślnie przyjmujemy
        // 90 mg/kg/dobę, zachowując zakres 70–90 mg/kg/dobę.
        // Podobnie jak w OZUŚ, w ostrym zapaleniu zatok przynosowych zaleca się
        // stosowanie wysokich dawek amoksycyliny z kwasem klawulanowym. CHPL
        // preparatu o mocy 875 mg/125 mg dopuszcza podawanie jednej tabletki
        // co 8 h w zapaleniu zatok【560332943530599†L118-L129】. Dlatego zwiększamy
        // liczbę dawek do trzech na dobę, aby aplikacja proponowała 3× 875 mg
        // u dorosłych i odpowiednią liczbę ml zawiesiny u dzieci. Zakres
        // pozostawiamy 70–90 mg/kg/dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [70, 90], defaultMg: 90, doses: 3, duration: 10 },
        // Cefuroksym: w OZNZ stosuje się 30 mg/kg/dobę w dwóch dawkach, nie przekraczając 500 mg na dawkę
        // (czyli 1000 mg/dobę)【479311936043478†L540-L545】.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: 15 mg/kg/dobę w dwóch dawkach, z limitem 1 000 mg/dobę【123300810807228†L69-L75】.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Azytromycyna: opcja 10–12 mg/kg/dobę w jednej dawce (niezalecana w zapaleniu zatok);
        // limit dobowy 500 mg.
        'Azytromycyna':        { mgRange: [10, 12], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'croup': {
      label: 'Ostre podgłośniowe zapalenie krtani',
      message: 'W ostrym podgłośniowym zapaleniu krtani stosuje się glikokortykosteroidy i leczenie objawowe; antybiotykoterapia nie jest zalecana.'
    },
    'bronchitis': {
      label: 'Ostre zapalenie oskrzeli i oskrzelików u dzieci',
      message: 'W ostrym zapaleniu oskrzeli/​oskrzelików antybiotykoterapia nie jest wskazana; zaleca się leczenie objawowe i nawadnianie.'
    },
    'pochp': {
      label: 'Infekcyjne zaostrzenie przewlekłej obturacyjnej choroby płuc (POChP)',
      message: 'Sekcja Antybiotykoterapia dotyczy dawek pediatrycznych. W infekcyjnych zaostrzeniach POChP u dorosłych stosuje się standardowe dawki antybiotyków (np. amoksycylina 750 mg 3×/dobę).'
    },
    'pneumonia_child': {
      label: 'Pozaszpitalne zapalenie płuc u dzieci',
      drugs: {
        'Amoksycylina':        { mgRange: [75, 90], defaultMg: 80, doses: 3, duration: 7, firstChoice: true },
        'Amoksycylina z kwasem klawulanowym': { mgRange: [90, 90], defaultMg: 90, doses: 3, duration: 7 },
        // Aksetyl cefuroksymu: 20–30 mg/kg/dobę w dwóch dawkach, nie przekraczając 500 mg/dobę【479311936043478†L1093-L1096】.
        'Aksetyl cefuroksymu':   { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },
        // Postać dożylna cefuroksymu dla cięższych zakażeń lub niemowląt (3 tydzień–3 miesiąc).
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 7, maxDailyMg: 4000 },
        // Ampicylina – w cięższych postaciach podaje się dożylnie 100–200 mg/kg/dobę w czterech dawkach, maks. 4 000 mg/dobę【934018487152624†L1040-L1062】.
        'Ampicylina':         { mgRange: [100, 200], defaultMg: 150, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Cefotaksym – stosowany dożylnie w dawce 50–180 mg/kg/dobę w 3–4 dawkach (q6–8 h); maks. 4 000 mg/dobę【934018487152624†L1040-L1062】.
        'Cefotaksym':         { mgRange: [50, 180], defaultMg: 100, doses: 3, duration: 7, maxDailyMg: 4000 },
        // Ceftriakson – dożylnie 50–100 mg/kg/dobę jako pojedyncza dawka; maks. 4 000 mg/dobę【934018487152624†L1040-L1062】.
        'Ceftriakson':        { mgRange: [50, 100], defaultMg: 75, doses: 1, duration: 7, maxDailyMg: 4000 },
        // Kloksacylina – dożylnie 100 mg/kg/dobę w 4 dawkach; maks. 4 000 mg/dobę. Stosowana w ciężkich przypadkach【934018487152624†L1040-L1062】.
        'Kloksacylina':       { mgRange: [100, 100], defaultMg: 100, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Klarytromycyna: 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę【123300810807228†L69-L75】.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 5, maxDailyMg: 1000 },
        // Azytromycyna: 10 mg/kg/dobę w jednej dawce (max 500 mg) przez 5 dni; w cięższych przypadkach można zastosować
        // 10 mg/kg/dobę pierwszego dnia, następnie 5 mg/kg/dobę (max 250 mg) przez 4 dni, ale w kalkulatorze
        // pozostawiamy uśrednioną dawkę 10 mg/kg/dobę.
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'pneumonia_adult': {
      label: 'Pozaszpitalne zapalenie płuc u dorosłych',
      // Aktualizujemy komunikat dla dorosłych, aby podkreślić, że w wybranych
      // infekcjach (zapalenie ucha środkowego, ostre zapalenie zatok, pozaszpitalne
      // zapalenie płuc i odmiedniczkowe zapalenie nerek) można stosować wysokodawkowy
      // koamoksyklaw 875 mg/125 mg podawany trzy razy dziennie【560332943530599†L118-L129】. Informacja
      // o standardowej dawce amoksycyliny 500 mg 3×/dobę pozostaje dla porównania.
      message: 'Sekcja Antybiotykoterapia dotyczy dawek pediatrycznych. U dorosłych stosuje się ustalone dawki – przykładowo amoksycylina 500 mg 3×/dobę lub amoksycylina z kwasem klawulanowym 875 mg + 125 mg 3×/dobę w zapaleniu ucha, zatok, pozaszpitalnym zapaleniu płuc i odmiedniczkowym zapaleniu nerek.'
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
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 2, duration: 5, firstChoice: true },
        'Trimetoprim': { mgRange: [3, 5], defaultMg: 4, doses: 2, duration: 5 },
        'Trimetoprim-sulfametoksazol': { mgRange: [30, 40], defaultMg: 36, doses: 2, duration: 5 },
        'Fosfomycyna': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 1 },
        'Aksetyl cefuroksymu': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 },
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 10 },
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 10 },
        // Dla niepowikłanych zakażeń dróg moczowych zalecany jest schemat
        // 2× na dobę z mniejszą dobową dawką (25–45 mg/kg/dobę), co pozwala
        // stosować 1 tabletę 875 mg/125 mg co 12 godzin u osób ≥40 kg. Zmieniono
        // zakres mgRange i domyślną dawkę do 35 mg/kg/dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7 },
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 7 }
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
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 10 },
        'Aksetyl cefuroksymu': { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 10 },
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 10 },
        'Cefotaksym': { mgRange: [50, 180], defaultMg: 100, doses: 3, duration: 10 },
        'Ceftriakson': { mgRange: [50, 100], defaultMg: 75, doses: 1, duration: 10 },
        'Cefepim': { mgRange: [50, 100], defaultMg: 80, doses: 2, duration: 10 },
        'Gentamycyna': { mgRange: [5, 7.5], defaultMg: 6, doses: 1, duration: 7 },
        'Amikacyna': { mgRange: [15, 15], defaultMg: 15, doses: 1, duration: 7 },
        'Cyprofloksacyna': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 7 },
        'Lewofloksacyna': { mgRange: [10, 20], defaultMg: 15, doses: 1, duration: 7 },
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        'Imipenem z cilastatyną': { mgRange: [50, 100], defaultMg: 75, doses: 3, duration: 10 },
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        'Doripenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
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
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 4, duration: 7, firstChoice: true },
        'Amoksycylina': { mgRange: [50, 60], defaultMg: 55, doses: 3, duration: 10 },
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 60], defaultMg: 55, doses: 3, duration: 10 },
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 10 },
        'Fosfomycyna': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 1 },
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 10 },
        'Cefotaksym': { mgRange: [50, 180], defaultMg: 100, doses: 3, duration: 10 },
        'Ceftriakson': { mgRange: [50, 100], defaultMg: 75, doses: 1, duration: 10 },
        'Cefepim': { mgRange: [50, 100], defaultMg: 80, doses: 2, duration: 10 },
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        'Imipenem z cilastatyną': { mgRange: [50, 100], defaultMg: 75, doses: 3, duration: 10 },
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        'Doripenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 }
      }
    }
    ,
    /*
     * Zakażenia skóry i tkanki podskórnej – kategoria ropni i czyraków (abscess). Leczenie obejmuje doustne
     * cefalosporyny I generacji, klindamycynę oraz amoksycylinę z klawulanianem, a w cięższych przypadkach
     * dożylnie cefazolinę, wankomycynę lub linezolid. Zakresy dawek oparto na zaleceniach IDSA i polskich wytycznych.
     */
    'ssti_abscess': {
      label: 'Ropnie i czyraki',
      drugs: {
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 7, firstChoice: true },
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7 },
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 25, doses: 3, duration: 7 },
        // Zmodyfikowano parametry dawkowania amoksycyliny z kwasem klawulanowym
        // dla ropni i czyraków (abscess). Zgodnie z aktualnymi wytycznymi
        // umiarkowane infekcje skóry leczymy mniejszą dawką dobową
        // 25–45 mg/kg/dobę, dzieloną na dwa podania (co 12 godzin). Przy
        // masie ciała ≥40 kg odpowiada to 2×1 tabletce 875 mg/125 mg na dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 7 },
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 7 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 }
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
        'Fenoksymetylpenicylina': { mgRange: [33, 65], defaultMg: 50, doses: 3, duration: 10, firstChoice: true },
        'Amoksycylina': { mgRange: [50, 60], defaultMg: 55, doses: 3, duration: 10 },
        // Umiarkowane zapalenie tkanki łącznej (cellulitis) leczymy dawką
        // 25–45 mg/kg/dobę amoksycyliny w dwóch dawkach dobowych, co
        // odpowiada 2×1 tabletce 875 mg/125 mg u pacjentów ≥40 kg. Zmiana
        // zakresu i liczby dawek pozwala uniknąć dzielenia tabletki na pół.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 10 },
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 10 },
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10 },
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 25, doses: 3, duration: 10 },
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 10 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 10 },
        'Kloksacylina': { mgRange: [100, 100], defaultMg: 100, doses: 4, duration: 10 },
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 10 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 10 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 10 }
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
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7, firstChoice: true },
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 7 },
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 7 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 7 },
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 25, doses: 3, duration: 7 },
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 7 },
        'Cyprofloksacyna': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 7 },
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 }
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
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7, firstChoice: true },
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 7 },
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 25, doses: 3, duration: 7 },
        'Cyprofloksacyna': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 7 },
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 7 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 7 },
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 7 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 }
      }
    }
  };

  // Utwórz uporządkowaną listę kluczy wskazań posortowanych alfabetycznie według etykiety.
  const INDICATION_ORDER = Object.keys(ABX_INDICATIONS).sort((a, b) => {
    const la = ABX_INDICATIONS[a].label.toLocaleLowerCase('pl-PL');
    const lb = ABX_INDICATIONS[b].label.toLocaleLowerCase('pl-PL');
    return la.localeCompare(lb, 'pl-PL');
  });

  // Pobierz masę ciała w kilogramach z sekcji „Dane użytkownika”. Jeśli brak, zwróć null.
  function getWeight(){
    const el = document.getElementById('weight');
    if(!el) return null;
    const w = parseFloat(el.value);
    return (isNaN(w) || w <= 0) ? null : w;
  }

  // Formatowanie liczb: używamy polskich separatorów i dwóch miejsc po przecinku.
  function fmt(n){
    if (!isFinite(n)) return '–';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',');
  }

  // Główna funkcja tworząca element karty antybiotykoterapii.
  function createCard(){
    const card = document.createElement('section');
    card.id = 'antibioticTherapyCard';
    card.className = 'result-card animate-in';
    card.style.margin = '1rem 0';
    card.innerHTML = `
      <h2 style="text-align:center;">Antybiotykoterapia</h2>
      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap;">
        <label style="flex:1 1 240px; min-width:220px;">
          Wskazanie
          <select id="abxIndication"></select>
        </label>
        <label style="flex:1 1 240px; min-width:220px;">
          Antybiotyk
          <select id="abxDrug"></select>
        </label>
        <!-- Selektor postaci farmaceutycznej. Domyślnie ukryty, widoczny tylko dla leków mających różne postacie (np. klarytromycyna). -->
        <label id="abxFormWrapper" style="flex:1 1 240px; min-width:220px; display:none;">
          Preparat
          <select id="abxForm"></select>
        </label>
      </div>
      <div id="abxControls" style="display:none; margin-top:.8rem;">
        <label style="display:block; margin-top:.4rem;">
          Dawka (<span id="abxDoseDisplay">mg/kg/dobę</span>)
          <input type="range" id="abxDoseSlider" style="width:100%;">
        </label>
        <div style="display:flex; gap:.75rem; flex-wrap:wrap; margin-top:.6rem;">
          <label style="flex:1 1 200px; min-width:200px;">
            Wybrana dawka
            <input type="number" id="abxDoseInput" step="0.1" min="0" style="width:100%;" />
          </label>
          <label style="flex:1 1 180px; min-width:180px;">
            Czas terapii (dni)
            <input type="number" id="abxDuration" min="1" step="1" style="width:100%;" />
          </label>
        </div>
      </div>
      <div id="abxNote" class="muted" style="margin-top:.6rem;"></div>
      <div id="abxResult" class="result-box" style="margin-top:.9rem;"></div>
    `;
    return card;
  }

  // Wstaw kartę bezpośrednio pod przyciskiem „Antybiotykoterapia”.
  function mountCard(){
    if(document.getElementById('antibioticTherapyCard')) return;
    const where = document.getElementById('abxButtonWrapper');
    if(!where || !where.parentNode) return;
    const card = createCard();
    where.parentNode.insertBefore(card, where.nextSibling);
    // Początkowo ukryj kartę; pierwsze kliknięcie przycisku ją pokaże.
    card.style.display = 'none';
    populateIndications();
    attachEventListeners();
    recalc();
  }

  // Uzupełnij listę wskazań danymi z ABX_INDICATIONS.
  function populateIndications(){
    const indicSelect = document.getElementById('abxIndication');
    if(!indicSelect) return;
    indicSelect.innerHTML = '';
    INDICATION_ORDER.forEach(key => {
      const def = ABX_INDICATIONS[key];
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      indicSelect.appendChild(opt);
    });
    // Ustaw pierwsze wskazanie jako domyślne
    indicSelect.value = INDICATION_ORDER[0];
    populateDrugs();
  }

  // Uzupełnij listę leków na podstawie wybranego wskazania.
  function populateDrugs(){
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const drugSelect = document.getElementById('abxDrug');
    if(!drugSelect) return;
    drugSelect.innerHTML = '';
    // Jeżeli dla wskazania nie zdefiniowano leków, ukryj kontrolki i wyświetl komunikat
    const controls = document.getElementById('abxControls');
    const note     = document.getElementById('abxNote');
    if(!indic.drugs){
      if(controls) controls.style.display = 'none';
      if(note)     note.textContent = indic.message || '';
      document.getElementById('abxResult').innerHTML = '';
      return;
    }
    // W przeciwnym razie pokaż kontrolki i wstaw opcje
    if(controls) controls.style.display = 'block';
    if(note)     note.textContent = '';
    const drugKeys = Object.keys(indic.drugs);
    drugKeys.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      const isFirst = indic.drugs[name].firstChoice;
      // Wyświetl nazwę z oznaczeniem "i.v" dla leków dożylnych. Ustalamy to
      // na podstawie definicji DRUG_INFO: jeśli którakolwiek postać leku posiada
      // parametr mgPerVial, uznajemy lek za dożylny i dopisujemy " i.v" do
      // etykiety. Dzięki temu użytkownik łatwo rozróżni preparaty doustne od
      // dożylnych.
      let displayName = name;
      const info = DRUG_INFO[name];
      if (info && info.forms) {
        const formNames = Object.keys(info.forms);
        if (formNames.some(fn => 'mgPerVial' in info.forms[fn])) {
          displayName = `${name} i.v`;
        }
      }
      opt.textContent = isFirst ? `${displayName} (I wyboru)` : displayName;
      drugSelect.appendChild(opt);
    });
    // Domyślnie wybierz lek pierwszego wyboru, jeśli istnieje
    const defaultDrug = drugKeys.find(n => indic.drugs[n].firstChoice) || drugKeys[0];
    drugSelect.value = defaultDrug;
    // Po zmianie leku uzupełnij listę preparatów (jeśli dotyczy)
    populateForms();
    updateDoseControls();
  }

  // Uzupełnij listę dostępnych postaci preparatu dla wybranego leku.
  function populateForms(){
    const formWrapper = document.getElementById('abxFormWrapper');
    const formSelect  = document.getElementById('abxForm');
    const drugName    = document.getElementById('abxDrug') && document.getElementById('abxDrug').value;
    if(!formWrapper || !formSelect || !drugName){
      return;
    }
    const drugInfo = DRUG_INFO[drugName];
    if(drugInfo && drugInfo.forms){
      formWrapper.style.display = 'block';
      formSelect.innerHTML = '';
      const forms = Object.keys(drugInfo.forms);
      forms.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        formSelect.appendChild(opt);
      });
      // Ustal domyślną postać preparatu z uwzględnieniem masy ciała.
      // Ogólna reguła: dla pacjentów <35 kg, jeśli dostępna jest zawiesina,
      // wybierz ją jako domyślną postać. Następnie zastosuj specyficzne reguły
      // dla poszczególnych antybiotyków. W ostateczności wybierz pierwszą opcję.
      let defaultForm = null;
      const weight = getWeight();
      if (weight && weight < 35) {
        // Poszukaj pierwszej postaci typu "suspension"
        for (const fn of forms) {
          const f = drugInfo.forms[fn];
          if (f && f.formType === 'suspension') {
            defaultForm = fn;
            break;
          }
        }
      }
      // Jeśli brak domyślnej postaci z powodu reguły wagowej, stosuj dedykowane reguły
      if (!defaultForm) {
        if(drugName === 'Klarytromycyna'){
          defaultForm = chooseClarithroDefaultForm(weight);
        } else if(drugName === 'Amoksycylina z kwasem klawulanowym'){
          defaultForm = chooseAmoxClavDefaultForm(weight);
        } else if(drugName === 'Azytromycyna'){
          defaultForm = chooseAzithroDefaultForm(weight);
        }
      }
      // Jeśli nadal brak domyślnej lub z jakiś względów nie istnieje w definicji, wybierz pierwszą postać
      if(!defaultForm || !(drugInfo.forms[defaultForm])){
        defaultForm = forms[0];
      }
      formSelect.value = defaultForm;
    } else {
      // Jeśli lek nie ma różnych postaci, ukryj selektor
      formWrapper.style.display = 'none';
      formSelect.innerHTML = '';
    }
  }

  /**
   * Wybiera domyślną postać klarytromycyny na podstawie masy ciała.
   * Dla najmłodszych dzieci (<12 kg) preferuje się słabszą zawiesinę 125 mg/5 ml,
   * dla dzieci 12–40 kg – zawiesinę 250 mg/5 ml, natomiast u pacjentów o
   * masie ≥40 kg sugeruje się tabletki 250 mg. Funkcja może być rozszerzona
   * w przyszłości w oparciu o bardziej precyzyjne rekomendacje.
   *
   * @param {number|null} weight Masa ciała w kilogramach lub null, jeśli nieznana
   * @returns {string} nazwa domyślnej postaci
   */
  
/**
 * Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie masy ciała.
 * Standardowa zawiesina 400 mg/57 mg/5 ml jest wygodna w dawkowaniu u małych dzieci.
 * Wysokodawkowa zawiesina ES 600 mg/42,9 mg/5 ml pozwala podać wymaganą ilość
 * amoksycyliny przy mniejszej objętości i zalecana jest u dzieci o większej masie
 * (powyżej ~15 kg), zwłaszcza gdy konieczne są dawki >70 mg/kg/dobę【406332432356125†L197-L202】. U pacjentów o masie ≥40 kg
 * preferowane są tabletki 875 mg/125 mg, które można podawać trzy razy dziennie w
 * cięższych zakażeniach (zapalenie ucha, zatok, płuc, odmiedniczkowe zapalenie nerek)【560332943530599†L118-L129】.
 *
 * @param {number|null} weight Masa ciała w kilogramach lub null, jeśli nieznana
 * @returns {string} nazwa domyślnej postaci
 */
function chooseAmoxClavDefaultForm(weight){
  if(weight === null || weight === undefined){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  // Dzieci do ~15 kg najłatwiej leczyć standardową zawiesiną 400 mg/57 mg/5 ml
  if(weight < 15){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  // Dzieci 15–40 kg: w zakażeniach wymagających wysokich dawek (70–90 mg/kg)
  // korzystniejsza jest zawiesina ES 600 mg/42,9 mg/5 ml, gdyż pozwala podać
  // mniej mililitrów i zawiera mniejszą ilość kwasu klawulanowego w stosunku
  // do amoksycyliny【759532590181075†L450-L503】.
  if(weight < 40){
    return 'Zawiesina 600 mg/42,9 mg/5 ml (ES)';
  }
  // U pacjentów ≥40 kg domyślnie proponujemy tabletki o mocy 875 mg/125 mg.
  // Charakterystyki preparatów 875 mg/125 mg podają, że wysoka dawka
  // (875 mg amoksycyliny + 125 mg kwasu klawulanowego) stosowana jest trzy razy
  // dziennie w infekcjach takich jak zapalenie ucha, zatok czy płuc【560332943530599†L118-L129】.
  return 'Tabletka 875 mg/125 mg';
}

  /**
   * Wybiera domyślną postać azytromycyny na podstawie masy ciała.
   * U małych dzieci (<10 kg) stosuje się zwykle zawiesinę 100 mg/5 ml,
   * ponieważ mniejsza koncentracja pozwala precyzyjnie odmierzać dawkę.
   * U dzieci i młodzieży o masie 10–40 kg korzystniejsza jest zawiesina
   * 200 mg/5 ml, która zmniejsza objętość przyjmowanej zawiesiny.
   * Pacjentom ≥40 kg (w tym dorosłym) zazwyczaj podaje się tabletki,
   * dlatego domyślnie proponujemy tabletkę 500 mg (jedna tabletka na dobę).
   *
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @returns {string} nazwa domyślnej postaci
   */
  function chooseAzithroDefaultForm(weight){
    if(weight === null || weight === undefined){
      return 'Zawiesina 100 mg/5 ml';
    }
    // Dzieci o masie <10 kg – zawiesina 100 mg/5 ml
    if(weight < 10){
      return 'Zawiesina 100 mg/5 ml';
    }
    // Masa 10–40 kg – zawiesina 200 mg/5 ml
    if(weight < 40){
      return 'Zawiesina 200 mg/5 ml';
    }
    // Masa ≥40 kg – tabletka 500 mg
    return 'Tabletka 500 mg';
  }

  // Nadpisz funkcje domyślnego wyboru postaci leków.

  // Wybiera domyślną postać klarytromycyny na podstawie masy ciała. Nowe definicje
  // przesłaniają wcześniejsze deklaracje, zapewniając spójne działanie nawet jeśli
  // wcześniejsze funkcje zostały przypadkowo wprowadzone w niepełnej formie.
  function chooseClarithroDefaultForm(weight){
    // Jeśli masa nie jest znana, wybieramy zawiesinę 125 mg/5 ml
    if(weight === null || weight === undefined){
      return 'Zawiesina 125 mg/5 ml';
    }
    // Masa <12 kg – zawiesina 125 mg/5 ml
    if(weight < 12){
      return 'Zawiesina 125 mg/5 ml';
    }
    // Masa 12–40 kg – zawiesina 250 mg/5 ml
    if(weight < 40){
      return 'Zawiesina 250 mg/5 ml';
    }
    // Masa ≥40 kg – tabletka 250 mg
    return 'Tabletka 250 mg';
  }

  // Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie masy ciała.
  // Dzieci <15 kg – standardowa zawiesina 400 mg/57 mg/5 ml, dzieci 15–40 kg – zawiesina ES 600 mg/42,9 mg/5 ml,
  // dorośli i starsze dzieci – tabletka 875 mg/125 mg. Wysokodawkowe tabletki 875 mg/125 mg są
  // zalecane trzykrotnie na dobę w cięższych zakażeniach, zgodnie z CHPL【560332943530599†L118-L129】.
  function chooseAmoxClavDefaultForm(weight){
    if(weight === null || weight === undefined){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    if(weight < 15){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    if(weight < 40){
      return 'Zawiesina 600 mg/42,9 mg/5 ml (ES)';
    }
    // Dla pacjentów ≥40 kg preferujemy tabletkę 875 mg/125 mg, ponieważ przy
    // trzykrotnym dawkowaniu w wysokich infekcjach daje to 2625 mg
    // amoksycyliny na dobę – zgodnie z maksymalną dobową dawką dla dorosłych
    // przytoczoną w CHPL【560332943530599†L118-L129】.
    return 'Tabletka 875 mg/125 mg';
  }

  // Zaktualizuj parametry suwaka, pola dawki i czasu na podstawie wybranego leku.
  function updateDoseControls(){
    const indicKey = document.getElementById('abxIndication').value;
    const drugName = document.getElementById('abxDrug').value;
    const indic = ABX_INDICATIONS[indicKey];
    const drug  = indic && indic.drugs ? indic.drugs[drugName] : null;
    const slider = document.getElementById('abxDoseSlider');
    const doseInput = document.getElementById('abxDoseInput');
    const durInput  = document.getElementById('abxDuration');
    if(!drug || !slider || !doseInput || !durInput){
      return;
    }
    // W tej funkcji nie ponownie wypełniamy listy postaci. Poprawianie listy
    // preparatów w tym miejscu powodowało resetowanie wyboru użytkownika
    // (np. przy zmianie masy ciała czy przesuwaniu suwaka). Lista postaci
    // jest odświeżana w populateDrugs() oraz w zdarzeniu zmiany masy ciała,
    // co pozwala na dynamiczny wybór domyślnej postaci bez nadpisywania
    // ręcznie wybranej opcji przez użytkownika.
    // Ustaw zakresy suwaka na podstawie zdefiniowanego zakresu dawek mgRange
    let minMg = drug.mgRange[0];
    let maxMg = drug.mgRange[1];
    let defaultMg = drug.defaultMg;
    // Pobierz masę ciała (jeśli została podana), aby dynamicznie dostosować dawki
    const weightVal = getWeight();

    // Specjalne przypadki dla amoksycyliny z klawulanianem: w zapaleniach ucha i zatok
    // (otitis, sinusitis) domyślnie stosuje się górną wartość zakresu (90 mg/kg/dobę)
    if (drugName === 'Amoksycylina z kwasem klawulanowym' && (indicKey === 'otitis' || indicKey === 'sinusitis')) {
      defaultMg = drug.mgRange[1];
    }
    // Ustal dynamiczny zakres dawek dla fenoksymetylpenicyliny w zależności od masy ciała.
    if (drugName === 'Fenoksymetylpenicylina' && weightVal) {
      /*
        Przelicznik: 1 000 000 j.m. fenoksymetylpenicyliny ≈ 654 mg. Zgodnie z CHPL
        dawki dobowej u dzieci wynoszą 50 000–100 000 j.m. na kg masy ciała, a
        minimalna dawka nie powinna być mniejsza niż 25 000 j.m./kg mc. (16 mg/kg/dobę)【771311657500760†L74-L95】.
        Dla uproszczenia przyjmujemy typowy zakres 50 000–100 000 j.m./kg/dobę,
        czyli około 33–65 mg/kg/dobę, jako podstawowy zakres dla pacjentów
        <40 kg. W populacji powyżej 6 lat i/lub o masie ciała ≥40 kg CHPL zaleca
        całkowitą dawkę 3–4,5 mln j.m. na dobę (podawaną w 2 lub 3 dawkach)【771311657500760†L74-L95】.
        Stąd przy większej masie ciała dynamicznie wyliczamy przedział dawek
        mg/kg/dobę na podstawie 3–4,5 mln j.m. (1962–2943 mg) podzielonych przez
        masę ciała. Przykładowo przy 40 kg daje to ok. 49–74 mg/kg/dobę.
      */
      const mgPerMillionUnits = 654;
      if (weightVal >= 40) {
        // 3–4,5 mln j.m./dobę przeliczamy na mg/kg/dobę
        minMg = (3 * mgPerMillionUnits) / weightVal;
        maxMg = (4.5 * mgPerMillionUnits) / weightVal;
        defaultMg = (minMg + maxMg) / 2;
      } else {
        // Dzieci <40 kg: 50 000–100 000 j.m./kg/dobę ≈ 33–65 mg/kg/dobę
        minMg = 33;
        maxMg = 65;
        defaultMg = (minMg + maxMg) / 2;
      }
    }

    // Dostosuj dawkę cefadroksylu dla pacjentów ≥40 kg: zalecana jest
    // jednorazowa dawka dobowa 1 g. Przeliczamy ją na mg/kg/dobę,
    // dzieląc 1000 mg przez masę ciała. U dzieci <40 kg pozostawiamy
    // standardowe 30 mg/kg/dobę.
    if (drugName === 'Cefadroksyl' && weightVal) {
      if (weightVal >= 40) {
        const mgPerKg = 1000 / weightVal;
        minMg = mgPerKg;
        maxMg = mgPerKg;
        defaultMg = mgPerKg;
      } else {
        // Zachowaj zdefiniowany zakres dla dzieci <40 kg
        minMg = drug.mgRange[0];
        maxMg = drug.mgRange[1];
        defaultMg = drug.defaultMg;
      }
    }
    // Dostosuj zakres i domyślną dawkę w pozaszpitalnym zapaleniu płuc u najmłodszych dzieci
    if (indicKey === 'pneumonia_child' && weightVal && weightVal <= 5) {
      // Dzieci <3 miesiące (ok. ≤5 kg) wymagają innych dawek i częstszych podań
      if (drugName === 'Cefuroksym (dożylnie)') {
        minMg = 75;
        maxMg = 150;
        defaultMg = 100;
      } else if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        // W ciężkich przypadkach zaleca się 100 mg/kg/dobę w 2–3 dawkach; suwak ograniczamy do jednej wartości
        minMg = 100;
        maxMg = 100;
        defaultMg = 100;
      }
    }
    // Określ, czy dawkę należy prezentować w jednostkach (j.m.) czy w miligramach.
    const doseDisplay = document.getElementById('abxDoseDisplay');
    const formSelect = document.getElementById('abxForm');
    let isUnitMode = false;
    let selectedFormName = formSelect && formSelect.value;
    if(drugName === 'Fenoksymetylpenicylina' && selectedFormName){
      const fenoxyForms = DRUG_INFO['Fenoksymetylpenicylina'].forms;
      const meta = fenoxyForms[selectedFormName];
      if(meta && (meta.unitsPer5ml || meta.unitsPerTablet)){
        isUnitMode = true;
      }
    }
    // Jeśli włączony tryb jednostek, przelicz zakres mg/kg/dobę na j.m./kg/dobę.
    if(isUnitMode){
      const conv = 1000000 / 654; // 1 mg odpowiada ok. 1529 j.m.
      let minUnits = minMg * conv;
      let maxUnits = maxMg * conv;
      let defaultUnits = defaultMg * conv;
      // Dla fenoksymetylpenicyliny ustaw dedykowane zakresy: dzieci <40 kg 50–100 tys. j.m./kg/dobę, dorośli dynamicznie.
      if(drugName === 'Fenoksymetylpenicylina'){
        if(weightVal && weightVal < 40){
          // Zaokrąglij do pełnych tysięcy
          minUnits = 50000;
          maxUnits = 100000;
          defaultUnits = 75000;
        } else if(weightVal){
          // Dorośli: przelicz mg-range na j.m., a następnie zaokrąglij do 1000
          minUnits = minMg * conv;
          maxUnits = maxMg * conv;
          // Zaokrąglenia do pełnych tysięcy
          minUnits = Math.floor(minUnits / 1000) * 1000;
          maxUnits = Math.ceil(maxUnits / 1000) * 1000;
          defaultUnits = Math.round(((minUnits + maxUnits) / 2) / 1000) * 1000;
        }
      }
      // Zaktualizuj suwak i pole liczbowego tak, aby pracowały w jednostkach
      slider.min = minUnits;
      slider.max = maxUnits;
      // Krok 1000 j.m. pozwala wybierać pełne tysiące
      slider.step = 1000;
      slider.value = defaultUnits;
      doseInput.step = 1000;
      doseInput.value = defaultUnits;
      // Zmień etykietę jednostki
      if(doseDisplay){ doseDisplay.textContent = 'j.m./kg/dobę'; }
    } else {
      // Standardowy tryb mg/kg/dobę
      slider.min = minMg;
      slider.max = maxMg;
      slider.step = 0.5;
      // Ustal domyślną dawkę dla fenoksymetylpenicyliny (granulat) na 50 mg/kg/dobę,
      // zamiast dynamicznego uśrednienia (np. ~49 mg/kg). Pozostałe preparaty
      // korzystają z domyślnej wartości z definicji wskazania.
      let mgDefaultForSlider = defaultMg;
      if(drugName === 'Fenoksymetylpenicylina'){
        mgDefaultForSlider = 50;
      }
      slider.value = mgDefaultForSlider;
      doseInput.step = 0.1;
      doseInput.value = mgDefaultForSlider;
      if(doseDisplay){ doseDisplay.textContent = 'mg/kg/dobę'; }
    }
    // Ustaw domyślny czas trwania terapii
    durInput.value = drug.duration;
  }

  // Główna funkcja obliczeniowa – wywoływana przy zmianie któregokolwiek z parametrów
  function recalc(){
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const resultBox = document.getElementById('abxResult');
    const note      = document.getElementById('abxNote');
    if(!resultBox) return;
    // Jeżeli brak zdefiniowanych leków – wypisz komunikat i zakończ
    if(!indic.drugs){
      resultBox.innerHTML = '';
      if(note) note.textContent = indic.message || '';
      return;
    }
    // W przeciwnym razie oblicz dawki
    const drugName = document.getElementById('abxDrug').value;
    const drugDef  = indic.drugs[drugName];
    // Pobierz masę ciała
    const weight = getWeight();
    if(!weight){
      resultBox.innerHTML = '<p class="muted">Wprowadź masę ciała w sekcji „Dane użytkownika”, aby obliczyć dawkę.</p>';
      return;
    }
    // Pobierz wartości dawki i czasu terapii
    const sliderVal = parseFloat(document.getElementById('abxDoseSlider').value);
    let doseVal    = parseFloat(document.getElementById('abxDoseInput').value);
    // Synchronizuj suwak i pole liczbowego: jeśli użytkownik edytował jedno, przyjmujemy jego wartość
    if(!isNaN(sliderVal) && sliderVal !== doseVal){
      doseVal = sliderVal;
      document.getElementById('abxDoseInput').value = sliderVal;
    }
    if(isNaN(doseVal) || doseVal <= 0){
      // Jeśli wpisano złą wartość, zastąp domyślną
      doseVal = drugDef.defaultMg;
      document.getElementById('abxDoseInput').value = drugDef.defaultMg;
      document.getElementById('abxDoseSlider').value = drugDef.defaultMg;
    }
    let duration = parseInt(document.getElementById('abxDuration').value, 10);
    if(isNaN(duration) || duration <= 0){
      duration = drugDef.duration;
      document.getElementById('abxDuration').value = duration;
    }
    // Określ, czy w przypadku fenoksymetylpenicyliny wybrano preparat podawany w jednostkach (j.m.).
    let isUnitMode = false;
    if(drugName === 'Fenoksymetylpenicylina'){
      const formSelect = document.getElementById('abxForm');
      const selectedFormName = formSelect && formSelect.value;
      if(selectedFormName){
        const meta = DRUG_INFO['Fenoksymetylpenicylina'].forms[selectedFormName];
        if(meta && (meta.unitsPer5ml || meta.unitsPerTablet)){
          isUnitMode = true;
        }
      }
    }
    // Obliczenia mg na dobę na podstawie masy ciała. Jeśli dawka podana jest w j.m., przeliczamy ją na mg.
    let doseMgKg;
    let doseUnitsKg;
    if(isUnitMode){
      // Zaokrąglij dawkę do pełnych tysięcy j.m./kg
      doseUnitsKg = Math.round(doseVal / 1000) * 1000;
      // Przelicz jednostki na miligramy: 1 j.m. ≈ 0,000654 mg
      doseMgKg = doseUnitsKg * (654 / 1000000);
      // Zaktualizuj suwak i pole w razie ręcznego wpisania niepełnej wartości
      document.getElementById('abxDoseInput').value = doseUnitsKg;
      document.getElementById('abxDoseSlider').value = doseUnitsKg;
    } else {
      doseMgKg = doseVal;
      if(drugName === 'Fenoksymetylpenicylina'){
        // Oblicz równoważną dawkę w jednostkach na potrzeby dawek dobowych (nie wyświetlana)
        doseUnitsKg = doseMgKg * (1000000 / 654);
      }
    }
    let mgPerDay  = doseMgKg * weight;
    // Oblicz jednostki na dobę, jeżeli dotyczy
    let iuPerDay = null;
    if(drugName === 'Fenoksymetylpenicylina'){
      // Korzystamy z doseUnitsKg jeśli dostępne, inaczej obliczamy z mg/kg
      let unitsPerKg = isUnitMode ? doseUnitsKg : (doseUnitsKg || (doseMgKg * (1000000 / 654)));
      iuPerDay = Math.round(unitsPerKg * weight);
    }
    // Zaokrąglona wartość j.m./kg (do prezentacji) jeżeli obliczona
    let iuPerKgRounded = null;
    if(drugName === 'Fenoksymetylpenicylina'){
      if(isUnitMode){
        iuPerKgRounded = Math.round(doseUnitsKg);
      } else if(doseUnitsKg){
        iuPerKgRounded = Math.round(doseUnitsKg);
      }
    }
    // Determine effective number of doses per day. Start with the default value from the drug definition.
    let dosesPerDay = drugDef.doses;
    /*
     * Zastosuj szczegółową regułę dla tabletek 875 mg/125 mg koamoksyklawu.
     * Zgodnie z Charakterystyką Produktu Leczniczego wysoka dawka amoksycyliny
     * (875 mg + 125 mg kwasu klawulanowego) może być podawana trzy razy dziennie
     * wyłącznie w wybranych ciężkich zakażeniach (ostre zapalenie ucha
     * środkowego, ostre zapalenie zatok przynosowych, pozaszpitalne zapalenie
     * płuc u dzieci i dorosłych, powikłane zakażenia dróg moczowych oraz
     * odmiedniczkowe zapalenie nerek) i tylko u pacjentów o masie ciała ≥40 kg.
     * W pozostałych wskazaniach lub przy masie <40 kg maksymalny schemat dla
     * tej postaci to 2× 1 tabletka na dobę. Dzięki temu domyślne wartości
     * zdefiniowane w ABX_INDICATIONS (3 dawki w niektórych schorzeniach skóry
     * czy ran) nie będą wymuszały potrójnej dawki dla tej konkretnej mocy.
     */
    if (drugName === 'Amoksycylina z kwasem klawulanowym') {
      const formSelectElem = document.getElementById('abxForm');
      const selectedFormRaw = formSelectElem && formSelectElem.value;
      // Zamień niełamiące spacje na zwykłe, aby porównania były bardziej odporne.
      const selectedForm = selectedFormRaw ? selectedFormRaw.replace(/\u00a0/g, ' ') : '';
      // Sprawdź, czy wybrana postać odpowiada tabletce 875 mg/125 mg.
      // Używamy tylko wyszukiwania liczb, aby uniknąć problemów z odstępami i jednostkami.
      const isHighDoseTablet = selectedForm && /\b875\b/.test(selectedForm) && /\b125\b/.test(selectedForm);
      if (isHighDoseTablet) {
        // Wskazania, w których dopuszczalny jest schemat 3×/dobę. Dodajemy tu
        // zarówno wersję dziecięcą jak i dorosłą zapalenia płuc.
        const highDoseIndic = [
          'otitis',
          'sinusitis',
          'pneumonia_child',
          'pneumonia_adult',
          'uti_pyelonephritis',
          'uti_other'
        ];
        // Jeżeli wskazanie należy do listy, to sprawdź masę ciała.
        if (highDoseIndic.includes(indicKey)) {
          // Jeżeli masa <40 kg, ogranicz liczbę dawek do 2; inaczej użyj 3 dawek.
          const weightNum = typeof weight === 'number' ? weight : parseFloat(weight);
          if (!weightNum || weightNum < 40) {
            dosesPerDay = 2;
          } else {
            dosesPerDay = 3;
          }
        } else {
          // Wszystkie inne schorzenia – zawsze maksymalnie 2 dawki
          dosesPerDay = 2;
        }
      }
    }
    // Tablica komunikatów ostrzegawczych i informacyjnych
    const messages = [];
    // Dodatkowe ostrzeżenia dla niemowląt w pozaszpitalnym zapaleniu płuc
    if(indicKey === 'pneumonia_child' && weight <= 5){
      messages.push('U dzieci w wieku poniżej 3 miesięcy (\u22645 kg) zalecana jest hospitalizacja i dożylne podawanie antybiotyków. Dawki podawane są co 6–8 godzin (cefuroksym 75–150 mg/kg/dobę, amoksycylina/klawulanian 100 mg/kg/dobę, cefotaksym 50–180 mg/kg/dobę, ceftriakson 50–100 mg/kg/dobę) wraz z kloksacyliną 100 mg/kg/dobę)【934018487152624†L1040-L1062】.');
    }
    // Globalne ograniczenie dawki dobowej.
    // Najpierw pobierz globalny limit dla danego antybiotyku (zależny od masy – granica 40 kg definiuje „dziecko”).
    // Ujednolicamy nazwę leku, aby wyszukiwanie kluczy było odporne na rodzaj spacji (normalna vs. niełamiąca).
    const normalizedDrugName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
    // Pobierz globalne informacje o maksymalnej dawce dobowej z tablicy GLOBAL_MAX_DAILY_DOSES.
    // Najpierw próbujemy z nazwą znormalizowaną (zwykłe spacje), a gdy brak – z oryginalną nazwą.
    const globalMaxInfo = GLOBAL_MAX_DAILY_DOSES && (GLOBAL_MAX_DAILY_DOSES[normalizedDrugName] || GLOBAL_MAX_DAILY_DOSES[drugName]);
    let globalMax = null;
    if (globalMaxInfo) {
      // Określ grupę wiekową: w naszym podejściu dawkowanie dziecięce stosujemy wyłącznie
      // u pacjentów o masie ciała <40 kg. Starsze dzieci i młodzież z masą ≥40 kg
      // traktujemy jak dorosłych, niezależnie od wieku. Jeżeli wiek niepodany (null),
      // decyzja opiera się wyłącznie na masie.
      const ageYears = getAge();
      // Nowa logika: dziecko tylko wtedy, gdy waga < 40 kg. Wiek nie wpływa na
      // klasyfikację (starsze dzieci o masie ≥40 kg otrzymują dawkowanie dorosłych).
      const isChild = weight < 40;
      globalMax = isChild ? globalMaxInfo.child : globalMaxInfo.adult;
    }
    // Wyznacz ostateczny limit: mniejszy z limitu z definicji leku (maxDailyMg) i globalnego limitu, jeśli oba istnieją.
    let effectiveMax = null;
    if(drugDef.maxDailyMg != null && globalMax != null){
      effectiveMax = Math.min(drugDef.maxDailyMg, globalMax);
    } else if(drugDef.maxDailyMg != null){
      effectiveMax = drugDef.maxDailyMg;
    } else if(globalMax != null){
      effectiveMax = globalMax;
    }
    // Jeżeli wyliczona dawka przekracza dozwolony limit, zredukuj ją i poinformuj użytkownika.
    if(effectiveMax != null && mgPerDay > effectiveMax){
      mgPerDay = effectiveMax;
      const clampedMgKg = mgPerDay / weight;
      // Aktualizuj suwak i pole liczbowego, aby odzwierciedlić ograniczenie
      document.getElementById('abxDoseInput').value = fmt(clampedMgKg).replace(',', '.');
      document.getElementById('abxDoseSlider').value = clampedMgKg;
      messages.push(`Zastosowano ograniczenie do maksymalnej dawki ${effectiveMax}\u00A0mg/dobę dla tego antybiotyku.`);
    }
    // Ustalenie informacji o preparacie: jeśli lek ma wiele postaci, pobierz wybraną.
    let drugMeta = DRUG_INFO[drugName];
    let selectedForm = null;
    if(drugMeta && drugMeta.forms){
      const formSelect = document.getElementById('abxForm');
      selectedForm = formSelect && formSelect.value;
      // Jeśli nie wybrano postaci lub nie istnieje w definicji, zaproponuj domyślną
      if(!selectedForm || !drugMeta.forms[selectedForm]){
        if(drugName === 'Klarytromycyna'){
          selectedForm = chooseClarithroDefaultForm(weight);
        } else if(drugName === 'Amoksycylina z kwasem klawulanowym'){
          selectedForm = chooseAmoxClavDefaultForm(weight);
        } else {
          selectedForm = Object.keys(drugMeta.forms)[0];
        }
        if(formSelect) formSelect.value = selectedForm;
      }
      // Ostrzeżenia dotyczące wyboru postaci amoksycyliny z kwasem klawulanowym względem masy ciała
      if(drugName === 'Amoksycylina z kwasem klawulanowym'){
        const formLower = selectedForm.toLowerCase();
        if(weight < 15){
          if(formLower.includes('600') || formLower.includes('es') || formLower.includes('tabletka')){
            messages.push('Dzieci o masie <\u00A015\u00A0kg powinny otrzymywać zawiesinę 400\u00A0mg/57\u00A0mg/5\u00A0ml; inne postaci mogą być trudne w dawkowaniu i dostarczają więcej kwasu klawulanowego.');
          }
        } else if(weight < 40){
          if(formLower.includes('400') || formLower.includes('57') || (formLower.includes('tabletka'))){
            messages.push('U dzieci 15–40\u00A0kg preferuje się zawiesinę ES 600\u00A0mg/42,9\u00A0mg/5\u00A0ml, która pozwala na podawanie dużych dawek amoksycyliny mniejszą objętością oraz ogranicza podaż kwasu klawulanowego.');
          }
        } else {
          if(formLower.includes('zawiesina')){
            messages.push('Dla pacjentów \u226540\u00A0kg wygodniejsze jest stosowanie tabletek (500\u00A0mg/125\u00A0mg lub 875\u00A0mg/125\u00A0mg) zamiast zawiesin.');
          }
        }
      }
      drugMeta = drugMeta.forms[selectedForm];

      /*
       * Wprowadzenie twardego limitu dwóch tabletek 875 mg/125 mg na dobę
       * dla umiarkowanych zakażeń skóry i niepowikłanych ZUM. W tych
       * wskazaniach (ropnie/czyraki, róża/cellulitis, zakażone rany, zakażenia
       * po ugryzieniach oraz niepowikłane zakażenia dróg moczowych) zgodnie
       * z wytycznymi preferuje się schemat 2× dobę, co odpowiada
       * maksymalnie dwóm tabletkom 875 mg/125 mg na dobę u pacjentów
       * ważących ≥40 kg. Aby uniemożliwić podanie większej liczby tabletek
       * wynikającej z obliczenia mg/kg/d, poniższy blok obniża dzienną
       * dawkę amoksycyliny z kwasem klawulanowym do 1 750 mg (2 × 875 mg),
       * jeśli użytkownik wybrał tabletkę 875 mg/125 mg i wskazanie należy
       * do listy umiarkowanych zakażeń. Dodatkowo ogranicza liczbę dawek
       * dziennych do 2.
       */
      if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        const formNorm = selectedForm.replace(/\u00a0/g, ' ');
        // Sprawdź, czy wybrana postać to tabletka o mocy 875 mg/125 mg
        const is875 = /\b875\b/.test(formNorm) && /\b125\b/.test(formNorm);
        // Lista wskazań umiarkowanych, w których stosujemy maksymalnie 2 tabletki na dobę
        const moderateIndic = [
          'ssti_abscess',
          'ssti_cellulitis',
          'ssti_wound',
          'ssti_bite',
          'uti_uncomplicated'
        ];
        if (is875 && moderateIndic.includes(indicKey)) {
          // Maksymalnie dwie tabletki 875 mg na dobę = 1 750 mg amoksycyliny
          const maxPerDay = (drugMeta.mgPerTablet || 875) * 2;
          // Ogranicz liczbę dawek dobowych do 2
          if (dosesPerDay > 2) {
            dosesPerDay = 2;
          }
          if (mgPerDay > maxPerDay) {
            mgPerDay = maxPerDay;
            // Aktualizuj mg/kg w polach wejściowych
            const clampedMgKg = mgPerDay / weight;
            document.getElementById('abxDoseInput').value = fmt(clampedMgKg).replace(',', '.');
            document.getElementById('abxDoseSlider').value = clampedMgKg;
            messages.push('W tym wskazaniu maksymalna dawka wynosi 2 tabletki 875/125 mg na dobę. Dawka została ograniczona.');
            // Usuń ogólny komunikat o ograniczeniu do maksymalnej dawki (jeśli został dodany wcześniej),
            // aby nie wprowadzać w błąd wartościami jak 2625 mg. W umiarkowanych zakażeniach
            // komunikat ten zastępowany jest powyższym.
            for (let mi = messages.length - 2; mi >= 0; mi--) {
              if (messages[mi] && messages[mi].startsWith('Zastosowano ograniczenie do maksymalnej dawki')) {
                messages.splice(mi, 1);
                break;
              }
            }
          }
        }
      }
    }
    // Jeśli brakuje informacji o sposobie przeliczania (np. brak mgPer5ml i mgPerTablet), wypisz tylko mg
    if(!drugMeta){
      resultBox.innerHTML = `<p>Dawka dobowa: ${fmt(mgPerDay)} mg (podzielona na ${dosesPerDay} dawki).</p><p>Czas terapii: ${duration} dni.</p>`;
      // Wyświetl zebrane komunikaty, jeśli istnieją
      if(note){ note.textContent = messages.join(' '); }
      return;
    }
    // Obliczenia dla preparatów w postaci zawiesiny
    if('mgPer5ml' in drugMeta){
      const mgPerMl   = drugMeta.mgPer5ml / 5;
      let mlPerDay  = mgPerDay / mgPerMl;
      let mlPerDose = mlPerDay / dosesPerDay;
      // Zaokrąglij objętość dawki do 0,25 ml – mniejsze objętości są trudne do odmierzenia
      const mlPerDoseRounded = Math.round(mlPerDose / 0.25) * 0.25;
      const mlPerDayRounded  = mlPerDoseRounded * dosesPerDay;
      const totalVolumeRounded = mlPerDayRounded * duration;
      // Wybierz najbliższe opakowanie. Szukamy pierwszego opakowania >= totalVolumeRounded; jeśli brak, bierzemy największe i zaokrąglamy liczbę w górę.
      const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
      let selectedSize = sizes.find(sz => sz >= totalVolumeRounded);
      let count = 1;
      if(!selectedSize){
        selectedSize = sizes[sizes.length - 1] || totalVolumeRounded;
        count = Math.ceil(totalVolumeRounded / selectedSize);
      }
      const packagingSuggestion = `${count} × ${selectedSize} ml`;
      // Oblicz efektywną dawkę mg/kg/dobę po ewentualnym ograniczeniu
      const doseMgKgEffective = mgPerDay / weight;
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        // Jeśli wybrano formę jednostkową, pokazujemy dawkę w jednostkach
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        // W przeciwnym razie pokazujemy mg/kg/dobę
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
      }
      // Oblicz dawkę mg na jedną dawkę (mgPerDoseCalc) do wyświetlenia w nawiasie
      const mgPerDoseCalc = mgPerDay / dosesPerDay;
      // Dawka dobowa: dla fenoksymetylpenicyliny prezentujemy dawkę dobową w jednostkach (j.m.) lub mg,
      // a w nawiasie podajemy dawkę na jedną dawkę × liczbę podań. Dla pozostałych leków również używamy
      // mg na jedną dawkę zamiast objętości w ml, aby zachować spójność prezentacji.
      let dailyDoseLine;
      if (drugName === 'Fenoksymetylpenicylina') {
        // Oblicz jednostki/dawki i mg/dawki
        const unitsPerDose = iuPerDay != null ? iuPerDay / dosesPerDay : null;
        if (isUnitMode && iuPerDay != null) {
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${iuPerDay.toLocaleString('pl-PL')} j.m. &nbsp;(${unitsPerDose.toLocaleString('pl-PL')} j.m. × ${dosesPerDay})`;
        } else {
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg &nbsp;(${fmt(mgPerDoseCalc)} mg × ${dosesPerDay})`;
        }
      } else {
        // Inne antybiotyki w zawiesinie: pokaż dawkę dobową w mg i w nawiasie mg na dawkę × liczba dawek
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg &nbsp;(${fmt(mgPerDoseCalc)} mg × ${dosesPerDay})`;
      }
      // Skonstruuj wynik bez informacji o opakowaniu i wyśrodkuj treść
      resultBox.innerHTML = `
        <p>${doseInfoLine}</p>
        <p>${dailyDoseLine}</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(mlPerDoseRounded)} ml × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni – łącznie ${fmt(totalVolumeRounded)} ml</p>
      `;
      // Wyśrodkuj treść w polu wyników
      resultBox.style.textAlign = 'center';
      // Wyświetl zebrane komunikaty
      if(note){ note.textContent = messages.join(' '); }
      // Przygotuj sekcję zaleceń handlowych dla preparatów doustnych (zawiesina)
      // Dawka jednostkowa w ml do zaleceń
      const doseStrRecommendation = `${fmt(mlPerDoseRounded)} ml`;
      setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
    // Obliczenia dla tabletek
    if('mgPerTablet' in drugMeta){
      const mgPerTablet = drugMeta.mgPerTablet;
      // Oblicz preferowaną liczbę tabletek na podstawie dawki i wprowadź tolerancję ±20%
      const idealTabletsPerDay = mgPerDay / mgPerTablet;
      const idealTabletsPerDose = idealTabletsPerDay / dosesPerDay;
      const tolerance = 0.20;
      const mgMin = mgPerDay * (1 - tolerance);
      const mgMax = mgPerDay * (1 + tolerance);
      let bestDose = null;
      let bestDiff = Infinity;
      // Poszukaj liczby półtabletek na dawkę, która daje dawkę dobową mieszczącą się w tolerancji
      for(let offset = -4; offset <= 8; offset++){
        let candidate = Math.round(idealTabletsPerDose * 2 + offset) / 2;
        if(candidate < 0.5) candidate = 0.5;
        const candidateMgPerDay = candidate * dosesPerDay * mgPerTablet;
        if(candidateMgPerDay >= mgMin && candidateMgPerDay <= mgMax){
          const diff = Math.abs(candidateMgPerDay - mgPerDay);
          if(diff < bestDiff){
            bestDiff = diff;
            bestDose = candidate;
          }
        }
      }
      let tabletsPerDoseRounded;
      if(bestDose !== null){
        tabletsPerDoseRounded = bestDose;
      } else {
        // Brak dopasowania w tolerancji – zaokrąglij w górę do najbliższej połowy tabletki
        tabletsPerDoseRounded = Math.ceil(idealTabletsPerDose * 2) / 2;
      }
      const tabletsPerDayRounded = tabletsPerDoseRounded * dosesPerDay;
      const mgPerDayRounded = tabletsPerDayRounded * mgPerTablet;
      const totalTablets = Math.ceil(tabletsPerDayRounded * duration);
      // Sugestia opakowania: minimalna liczba opakowań, które pokryją liczbę tabletek
      const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
      let selectedSize = sizes.find(sz => sz >= totalTablets);
      let count = 1;
      if(!selectedSize){
        selectedSize = sizes[sizes.length - 1] || totalTablets;
        count = Math.ceil(totalTablets / selectedSize);
      }
      const packagingSuggestion = `${count} × ${selectedSize} tabl.`;
      // Oblicz efektywną dawkę mg/kg/dobę i oblicz różnicę w procentach
      const doseMgKgEffective = mgPerDayRounded / weight;
      const targetMgKg = mgPerDay / weight;
      if(mgPerDayRounded < mgMin || mgPerDayRounded > mgMax){
        const deltaPercent = Math.round((mgPerDayRounded / mgPerDay - 1) * 100);
        if(deltaPercent > 0){
          messages.push(`Wybrana forma terapii przekracza zalecaną dawkę dobową o ${deltaPercent}% (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
        } else {
          const absDelta = Math.abs(deltaPercent);
          messages.push(`Wybrana forma terapii dostarcza o ${absDelta}% mniej niż zalecana dawka dobowa (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
        }
      }
      // Ostrzeżenie dla dzieci <25 kg
      if(weight < 25){
        messages.push('Uwaga: dla dzieci o masie <25 kg forma tabletkowa może nie zapewniać dokładnego dawkowania. Rozważ użycie zawiesiny, jeśli jest dostępna.');
      }
      // Ostrzeżenie, jeśli wyliczona dawka jest mniejsza niż połowa tabletki na dawkę
      if(idealTabletsPerDose * mgPerTablet < mgPerTablet * 0.5){
        messages.push('Uwaga: obliczona dawka dobowa jest mniejsza niż połowa pojedynczej tabletki. Rozważ podanie leku w zawiesinie lub innym preparacie.');
      }
      // Przygotuj linie informacji do wyświetlenia
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
      }
      let dailyDoseLine;
      if (drugName === 'Fenoksymetylpenicylina') {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)} mg &nbsp;(${fmt(tabletsPerDayRounded)} tabl.)`;
      } else {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)} mg &nbsp;(${fmt(tabletsPerDayRounded)} tabl.)`;
      }
      // Skonstruuj wynik
      resultBox.innerHTML = `
        <p>${doseInfoLine}</p>
        <p>${dailyDoseLine}</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(tabletsPerDoseRounded)} tabl. × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni – łącznie ${totalTablets} tabl.</p>
      `;
      resultBox.style.textAlign = 'center';
      if(note){ note.textContent = messages.join(' '); }
      const doseStrRecommendation = `${fmt(tabletsPerDoseRounded)} tabl.`;
      setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
    // Obliczenia dla leków w fiolkach (preparaty dożylne). Nie podajemy liczby
    // fiolek ani sugerowanego opakowania – jedynie masę substancji czynnej
    // przypadającą na całą dobę oraz na pojedynczą dawkę. Lekarz decyduje
    // indywidualnie o wykorzystaniu fiolek.
    if('mgPerVial' in drugMeta){
      const mgPerDose = mgPerDay / dosesPerDay;
      // Oblicz efektywną dawkę mg/kg/dobę
      const doseMgKgEffective = mgPerDay / weight;
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
      }
      resultBox.innerHTML = `
        <p>${doseInfoLine}</p>
        <p><strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(mgPerDose)} mg × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni</p>
      `;
      if(note){ note.textContent = messages.join(' '); }
      // Ukryj sekcję zaleceń dla preparatów dożylnych
      setupRecommendationUI('', '', 0, '', 0);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
  }

  // Dodaj listenery na elementy formularza, aby dynamicznie aktualizować obliczenia.
  function attachEventListeners(){
    const indicSelect = document.getElementById('abxIndication');
    const drugSelect  = document.getElementById('abxDrug');
    const slider      = document.getElementById('abxDoseSlider');
    const doseInput   = document.getElementById('abxDoseInput');
    const durInput    = document.getElementById('abxDuration');
    const weightInput = document.getElementById('weight');
    if(indicSelect){ indicSelect.addEventListener('change', () => { populateDrugs(); recalc(); }); }
    if(drugSelect){
      drugSelect.addEventListener('change', () => {
        // Po zmianie antybiotyku należy ponownie wypełnić listę postaci,
        // aby wyświetlić odpowiednie preparaty dla nowo wybranego leku.
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
    if(slider){      slider.addEventListener('input', () => { document.getElementById('abxDoseInput').value = slider.value; recalc(); }); }
    if(doseInput){   doseInput.addEventListener('input', () => { const val = parseFloat(doseInput.value); if(!isNaN(val)) document.getElementById('abxDoseSlider').value = val; recalc(); }); }
    if(durInput){    durInput.addEventListener('input', recalc); }
    // Jeśli dostępny jest wybór preparatu, uwzględnij go w obliczeniach. Po zmianie postaci
    // konieczne jest również zaktualizowanie parametrów suwaka i jego etykiety (dla form jednostkowych).
    const formSelect  = document.getElementById('abxForm');
    if(formSelect){ formSelect.addEventListener('change', () => { updateDoseControls(); recalc(); }); }
    // Aktualizuj wyniki także po zmianie masy ciała w sekcji „Dane użytkownika”
    if(weightInput){
      // Po zmianie masy ciała należy przeliczyć domyślne zakresy dawek oraz
      // potencjalnie zmienić domyślne postaci niektórych leków (klarytromycyna,
      // amoksycylina z kwasem klawulanowym, azytromycyna). Dlatego najpierw
      // odświeżamy listę postaci, a następnie aktualizujemy suwak i obliczenia.
      weightInput.addEventListener('input', () => {
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
  }

  // Po załadowaniu DOM rejestrujemy przycisk i obsługę jego kliknięcia.
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('toggleAbxTherapy');
    if(btn){
      btn.addEventListener('click', function(e){
        // Używamy fazy capture, aby zatrzymać ewentualną propagację i uniknąć
        // kolizji z innymi przyciskami w module profesjonalnym.
        e.stopPropagation();
        mountCard();
        const card = document.getElementById('antibioticTherapyCard');
        if(!card) return;
        // Sprawdź aktualny stan widoczności karty
        const currentlyVisible = card.style.display !== 'none' && card.style.display !== '';
        // Przełącz widoczność karty
        card.style.display = currentlyVisible ? 'none' : 'block';
        // Podświetl przycisk, gdy karta jest widoczna; usuń podświetlenie, gdy karta jest schowana
        if(!currentlyVisible){
          btn.classList.add('active-toggle');
        } else {
          btn.classList.remove('active-toggle');
        }
      }, true);
    }
  });

  // Koniec modułu antybiotykoterapii