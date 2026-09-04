// Strefa czasowa dla testów jednostkowych.
//
// PO CO. Kontener CI i deweloperski chodzi w UTC. Każda asercja w rodzaju „data lokalna nie jest
// datą UTC" jest wtedy TAUTOLOGIĄ — obie strony równania są identyczne, więc test świeci na
// zielono, nie sprawdzając niczego. Przegląd z 2026-09-04 zmierzył skalę zjawiska: cały zestaw
// (711 testów) przechodzi bez zmian przy przesunięciu hosta o 25 godzin — od UTC+14
// (Pacific/Kiritimati) do UTC−11 (Pacific/Midway). Ani jeden test nie zmieniał werdyktu.
//
// DLACZEGO CHATHAM. Pacific/Chatham to UTC+12:45 (i +13:45 w czasie letnim). Trzy cechy naraz:
//   • przesunięcie DODATNIE i duże — data lokalna wyprzedza UTC przez większość doby, więc
//     rodzina błędów „toISOString().slice(0,10) zamiast lokalnych składników" (D8) wychodzi,
//   • przesunięcie NIECAŁKOWITOGODZINNE (45 minut) — łapie kod zakładający pełne godziny,
//   • własny czas letni — łapie arytmetykę „doba = 86 400 000 ms".
//
// Test, który zależy od konkretnej strefy, ma ją ustawić u siebie (kilka plików tak robi
// i przywraca poprzednią wartość). Ta wartość jest wtedy punktem wyjścia, nie ograniczeniem.
process.env.TZ = 'Pacific/Chatham';

// Bramka. Gdyby przypisanie przestało działać (inna wersja Node, inny runner), zestaw wróciłby
// po cichu do tautologii z UTC. Lepiej, żeby wtedy głośno padł.
if (new Date().getTimezoneOffset() === 0) {
  throw new Error(
    'Strefa testów nie zadziałała: getTimezoneOffset() === 0. Asercje porównujące dobę lokalną '
    + 'z UTC byłyby puste, a zestaw świeciłby na zielono bez sprawdzania czegokolwiek.',
  );
}
