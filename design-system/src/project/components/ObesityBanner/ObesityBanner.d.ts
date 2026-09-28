/** Karta-alert w karcie wskaźnika Cole'a — <div class="vilda-obesity-banner"> z ikoną, treścią i linkiem-pigułką. */
export interface ObesityBannerProps {
  /** Tytuł w <div class="vilda-obesity-banner__title">, np. „Sprawdź informacje o otyłości u dzieci w panelu diagnostycznym". */
  title: string;
  /** Opcjonalny drugi wiersz w <div class="vilda-obesity-banner__sub"> (11.5px, #6b7280). */
  subtitle?: string;
  /** Atrybut title kontenera — lista badań pierwszego rzutu dla wieku pacjenta. */
  tooltip?: string;
  /** Etykieta linku <a class="vilda-obesity-banner__btn">, np. „Otwórz panel →". */
  actionLabel: string;
  /** Adres panelu, np. "przelicznik-jednostek.html?wskazanie=obesity_kids". */
  href: string;
}
export declare const ObesityBanner: (props: ObesityBannerProps) => HTMLDivElement;
