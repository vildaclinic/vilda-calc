# SiteFooter

Kompaktowe zakończenie obszaru treści, zgodne z zaakceptowanym wariantem A nagłówka. Marka, operator i odnośniki informacyjne pozostają w stopce. Pełne dane operatora i konsultacji merytorycznej są dostępne także w treści „O aplikacji”. Zastrzeżenie medyczne usunięto ze stopki na polecenie właściciela.

## Kiedy używać

- Jedna stopka na dokument, po głównym układzie strony. Występuje na stronie Start, stronach kalkulatorów i informacyjnych, również po zalogowaniu.
- `app.html`, Notatnik i Terminarz nie dodają osobnej stopki. Dokumenty osadzone w powłoce zachowują własną stopkę w szerokości ramki.
- Na desktopie warstwa chrome odsuwa stopkę od stałego panelu bocznego. Nie należy ponownie odejmować szerokości menu wewnątrz ramki lub na telefonie.

## Co dostarcza konsument

- `<footer class="site-footer">` z `.site-footer__inner`.
- `.site-footer__brand`: nieinteraktywna marka `.site-footer__brand-link` z nazwą `.site-footer__brand-name` i opcjonalną ikoną 22 px `.site-footer__brand-icon`. Historyczna nazwa klasy pozostaje dla zgodności stylowania.
- `.site-footer__brand-meta`: wiersz `.site-footer__operator` z istniejącymi prawami autorskimi, nazwą spółki i odnośnikiem `.site-footer__vildaclinic`; poniżej `.site-footer__detail` z konsultantem albo KRS, zgodnie z daną stroną.
- `.site-footer__mobile-only`: krótki copyright oraz krótka widoczna etykieta „Prywatność”. Pełna nazwa „Polityka prywatności” pozostaje nazwą dostępną odnośnika; tekst desktopowy ma klasę `.site-footer__desktop-only`.
- `<nav class="site-footer__col" aria-label="Informacje">` z rzeczywistymi odnośnikami `.site-footer__link`. Standardowo: O aplikacji, Kontakt, Polityka prywatności, Regulamin. Strona subskrypcji zachowuje własny odnośnik Vilda PRO, a strony prawne `aria-current`.

## Układ i dostępność

- Na desktopie stopka ma minimalną wysokość 96 px, bez obcinania treści. Dłuższe dane, zawinięte linki i większy tekst mogą ją zwiększyć. Panel lekarza w chrome dopasowuje się do rzeczywistej wysokości stopki.
- W układzie mobilnym poniżej 992 px marka i krótki copyright mają wspólny wiersz, a cztery odnośniki drugi. Od 600 px marka z copyrightem stoi po lewej, a odnośniki po prawej.
- Fizyczny telefon zachowuje zwarty układ także w szerokiej orientacji poziomej. Powłoka propaguje do desktopowej ramki klasę `vilda-chrome-wide-host`, aby odjęcie szerokości menu nie przełączało jej stopki na telefon.
- Każdy główny odnośnik ma co najmniej 44 px wysokości i widoczny `:focus-visible`. Nav zachowuje nazwę dostępną.
- Stopka nie jest przyklejona do okna. Rezerwa dla pływającej strzałki i dolnej nawigacji należy do integracji chrome, niezależnie od układu samego komponentu.

## Źródła

Reguły produkcyjne: `style.css`. Odpowiednik design systemu: `design-system/src/partials/G17.css`. `preview.html` pokazuje ten sam znacznik z kontekstem strony; tekst operatora jest publiczną informacją o aplikacji.
