# SiteFooter

Cicha stopka strony na bladym polu #f4f8f8 z kreską 1 px #d0e8e8 u góry: siatka marki i trzech kolumn odnośników w drobnej szaroteal typografii, pasek zastrzeżenia medycznego z glifem ⚕ i minimalny wiersz praw autorskich.

## Kiedy używać

- Na dole każdej publicznej strony (`index.html`, kalkulatory, „O aplikacji", „Kontakt", polityka i regulamin) — jedna stopka na dokument, po głównym układzie.
- Nie używaj w ramkach modułów wewnątrz `app.html` ani w widokach po zalogowaniu; tam stopki nie ma.

## Co dostarcza konsument

- `<footer class="site-footer">` z trzema częściami w tej kolejności: `.site-footer__inner` (siatka), `.site-footer__disclaimer-wrap` › `<p class="site-footer__disclaimer">`, `.site-footer__bottom`.
- Marka: `<div class="site-footer__brand">` › `<a class="site-footer__brand-link" href="index.html">` z `<span class="site-footer__brand-icon" aria-hidden="true"><img width="22" height="22" alt=""></span>` i `<span class="site-footer__brand-name">wagaiwzrost.pl</span>`, potem `<p class="site-footer__brand-meta">` z nazwą spółki i konsultacją merytoryczną (`<br>`, twarde spacje w tytule naukowym).
- Kolumny: `<nav class="site-footer__col" aria-label="…">` z `<h3 class="site-footer__col-title">` i odnośnikami `<a class="site-footer__link">`. Kolumna-kontynuacja ma tytuł `site-footer__col-title site-footer__col-title--hidden` z `aria-hidden="true"` i `&nbsp;`, żeby odnośniki wyrównały się z sąsiednią kolumną.
- Zastrzeżenie: tylko tekst w `<p class="site-footer__disclaimer">`; glif ⚕ i spację dodaje `:before`.
- Wiersz dolny: `<span>© 2025 Vilda Clinic sp. z o.o.</span>` i `<a class="site-footer__vildaclinic" href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">vildaclinic.pl</a>`.
- Brak `id`; stany tylko `:hover` na odnośnikach.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.site-footer` | tło #f4f8f8, `border-top:1px solid #d0e8e8`, tekst #4a7a7a, `position:relative` |
| `.site-footer__inner` | `max-width:960px`, wypełnienie 1.5rem 1rem 1.1rem, siatka `1.5fr 1fr 1fr 1fr`, odstęp 1.5rem; ≤700px: `1fr 1fr 1fr`, odstęp 1rem .75rem, marka na całą szerokość |
| `.site-footer__brand-link` | `inline-flex`, odstęp .45rem, bez podkreślenia, margines dolny .45rem |
| `.site-footer__brand-icon` | 22 × 22 px, promień 6 px, obraz 22 px |
| `.site-footer__brand-name` | .8rem/600 #005a62, `letter-spacing:.01em` |
| `.site-footer__brand-meta` | .72rem/1.55 #7a9999 |
| `.site-footer__col-title` | .65rem/600 #6fa8a8, wersaliki, `.08em`, margines dolny .5rem |
| `.site-footer__col-title--hidden` | `visibility:hidden` (zachowuje wysokość) |
| `.site-footer__link` | blok .78rem #4a7a7a, wypełnienie .18rem 0, bez podkreślenia, `transition:color .15s`; `:hover` #00838d |
| `.site-footer__disclaimer-wrap` | tło `#00838d0e`, kreski .5px `rgba(0,131,141,.14)` u góry i u dołu |
| `.site-footer__disclaimer` | `max-width:960px`, wypełnienie .6rem 1rem, .73rem/1.55 #3a6d6d, `:before{content:"\2695\a0"}` |
| `.site-footer__bottom` | `max-width:960px`, wypełnienie .6rem 1rem, flex `space-between`, .72rem #a0b8b8; ≤700px: zawijanie, wyśrodkowanie, odstęp .1rem .5rem, wypełnienie .35rem 1rem |
| `.site-footer__vildaclinic` | #7ababd, waga 500, bez podkreślenia; `:hover` #00838d |

Wysoki kontrast, szkło i ciemne tło: brak reguł dla `.site-footer` w źródle — stopka wygląda tak samo w każdym motywie (reguły `body.about-page … footer` dotyczą innej stopki strony „O aplikacji").

## Tokeny

Brak — wszystkie kolory zapisane literalnie (#f4f8f8, #d0e8e8, #4a7a7a, #005a62, #7a9999, #6fa8a8, #00838d, #00838d0e, rgba(0,131,141,.14), #3a6d6d, #a0b8b8, #7ababd).

## Zasady

- Rób: trzymaj kolejność kolumn „Kalkulatory" → kontynuacja z ukrytym tytułem → „Informacje"; każdy `<nav>` z `aria-label`.
- Rób: zastrzeżenie medyczne jako jedno zdanie („Narzędzie do celów informacyjnych — nie zastępuje konsultacji lekarskiej ani samodzielnych decyzji klinicznych.").
- Nie rób: nie dopisuj własnego ⚕ do zastrzeżenia ani nie zmieniaj go w listę.
- Nie rób: nie dodawaj przycisków, formularzy ani logotypów partnerów — stopka ma być cicha.
- Kontrast (zmierzony): #4a7a7a na #f4f8f8 4.5:1 (odnośniki), #005a62 na #f4f8f8 7.4:1 (nazwa marki), #3a6d6d na tle zastrzeżenia (#00838d0e nad #f4f8f8) 5.1:1. Poniżej 4.5:1 w źródle: meta marki #7a9999 2.9:1, tytuły kolumn #6fa8a8 2.5:1, wiersz dolny #a0b8b8 2.0:1, odnośnik vildaclinic.pl #7ababd 2.1:1 — to informacje drugorzędne, nie umieszczaj w nich treści krytycznej.
- Wysoki kontrast i szkło nie zmieniają stopki; nie licz na `--hc-*` w tych klasach.

Wersja statyczna, przepisana ręcznie z src/css/style.css (146-246) oraz index.html (1693-1737, znacznik i treści).
