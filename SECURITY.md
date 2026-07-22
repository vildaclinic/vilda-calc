# Polityka bezpieczeństwa

## Wspierana wersja

Wspierana jest bieżąca wersja rozwijana na gałęzi `audyt` i publikowana jako aktualna wersja wagaiwzrost.pl. Historyczne gałęzie, lokalne kopie i nieaktualne instalacje PWA nie są osobno wspierane.

## Prywatne zgłoszenie podatności

Nie opisuj publicznie podatności, która może dotyczyć:

- dostępu do danych pacjenta lub vaulta;
- logowania, sesji, uprawnień lub dostępu PRO;
- szyfrowania, kluczy, eksportów albo synchronizacji;
- XSS, wstrzyknięcia kodu, service workera lub cache;
- tokenów, sekretów, Workera albo łańcucha zależności;
- obejścia zabezpieczenia, które da się wykorzystać przeciw użytkownikom.

Wyślij zgłoszenie na `biuro@vildaclinic.pl` z tematem **[BEZPIECZEŃSTWO vilda-calc]**. Jeżeli w zakładce Security repozytorium dostępne jest prywatne zgłoszenie podatności, można użyć również tej drogi.

Podaj:

- obszar i wersję, której dotyczy problem;
- minimalne kroki odtworzenia na własnym koncie i danych syntetycznych;
- możliwy wpływ;
- propozycję ograniczenia ryzyka, jeśli ją znasz.

Nigdy nie dołączaj prawdziwych danych pacjenta, eksportu `.wiw`, zrzutu storage, aktywnego tokenu, hasła ani klucza. Sekret, który został ujawniony, należy najpierw unieważnić lub obrócić; samo usunięcie późniejszym commitem nie usuwa go z historii.

Nie wykonuj testów na kontach, urządzeniach ani danych innych osób. Projekt nie prowadzi programu bug bounty i nie autoryzuje działań naruszających prawo lub dostępność usługi.

## Błędy wyników medycznych

Błąd wzoru, dawki, progu, jednostki, zakresu referencyjnego lub interpretacji nie musi być podatnością bezpieczeństwa. Zgłoś go publicznym formularzem zmiany medycznej wyłącznie wtedy, gdy można to zrobić bez danych pacjenta i bez ujawnienia sposobu wykorzystania podatności.

Jeżeli błąd umożliwia naruszenie poufności, integralności lub dostępności danych, użyj kanału prywatnego.

## Obsługa zgłoszenia

Zgłoszenie zostanie ocenione pod kątem możliwości odtworzenia, wpływu i ryzyka. Termin poprawki zależy od złożoności oraz konieczności weryfikacji klinicznej. Prosimy nie publikować szczegółów przed uzgodnieniem bezpiecznego ujawnienia.
