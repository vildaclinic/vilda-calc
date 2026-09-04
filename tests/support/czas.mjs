// Wspólna chwila startu dla testów przeglądarkowych.
//
// PO CO. Testy e2e zasiewają dane względem „dziś" i sprawdzają, w której sekcji wpis wyląduje.
// Przy prawdziwym zegarze każdy taki test ma okno, w którym pada albo — gorzej — milczy:
// przekroczenie lokalnej północy między zasiewem a renderem przenosi wpis z „Dziś" do „Zaległe”,
// doba przy zmianie czasu nie ma 24 godzin, a niedziela jest ostatnią kolumną siatki tygodnia.
// Przegląd z 2026-09-04 potwierdził trzynaście takich miejsc w pięciu plikach; łatanie ich
// pojedynczo znaczyłoby trzynaście osobnych obejść tego samego problemu.
//
// JAK. Test ustawia zegar strony na ustaloną chwilę (`page.clock.install`) i puszcza czas dalej
// normalnym tempem (`resume`). Zamrożenie BEZ `resume` zmieniłoby zachowanie aplikacji — używa
// timerów, dławików i animacji — więc ustalamy tylko PUNKT STARTU, nie bieg czasu.
//
// DOMYŚLNA CHWILA. 17 czerwca 2026, 13:00 UTC. Wybrana tak, by naraz:
//   • wypadała w ŚRODĘ — więc „jutro" i „wczoraj" zawsze mieszczą się w siatce tygodnia Pn→Nd,
//   • leżała daleko od północy w Europe/Warsaw (15:00) — więc żaden wyścig o dobę nie zachodzi,
//   • miała godzinę UTC ≥ 12 — więc w Pacific/Auckland (UTC+12) jest już NASTĘPNY dzień
//     i testy P1, które właśnie tego rozjazdu dowodzą, działają na tej samej chwili,
//   • leżała w czerwcu, poza oboma przejściami czasu letniego — więc offsety są jednoznaczne.
//
// WARIANTY. Nazwane chwile do przebiegów macierzowych: `VILDA_CHWILA=doba_25h npx playwright test`
// przepuszcza cały zestaw przez powrót na czas zimowy. To zamienia „jedna godzina w roku, w którą
// nikt nie trafi" na „przebieg, który można uruchomić kiedy się chce".
export const CHWILE = Object.freeze({
  // środa 15:00 Warszawa / czwartek 01:00 Auckland — domyślna
  zwykla: '2026-06-17T13:00:00Z',
  // niedziela 12:00 Warszawa — ostatnia kolumna siatki tygodnia, „jutro" poza tygodniem
  niedziela: '2026-09-06T10:00:00Z',
  // środa 23:58 Warszawa — filtr pory doby w kanale przypomnień (dyżur, poradnia)
  przed_polnoca: '2026-06-17T21:58:00Z',
  // niedziela 23:30 Warszawa, powrót na czas zimowy — doba ma 25 godzin
  doba_25h: '2026-10-25T22:30:00Z',
  // poniedziałek 00:30 Warszawa, przejście na czas letni — doba ma 23 godziny
  doba_23h: '2026-03-29T22:30:00Z',
  // czwartek 23:30 Warszawa — granica roku
  sylwester: '2026-12-31T22:30:00Z',
  // wtorek 11:00 Warszawa — 29 lutego roku przestępnego
  przestepny: '2028-02-29T10:00:00Z',
});

const wybrana = process.env.VILDA_CHWILA || 'zwykla';
if (!Object.prototype.hasOwnProperty.call(CHWILE, wybrana)) {
  throw new Error(
    `VILDA_CHWILA="${wybrana}" nie jest znaną chwilą. Dostępne: ${Object.keys(CHWILE).join(', ')}.`,
  );
}

export const CHWILA = CHWILE[wybrana];
export const NAZWA_CHWILI = wybrana;
