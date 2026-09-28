/** Suwak dawki: <div class="dose-slider-container"> w #antibioticTherapyCard z <div class="slider-ticks">, <input type="range"> i <span class="slider-value-label">. */
export interface DoseSliderProps {
  /** Wartość min/max/step natywnego pola range. */
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Tekst etykiety wartości, np. "30 mg/kg/dobę". */
  valueLabel: string;
  /** Etykiety podziałki nad torem (min i max), np. ["20", "50"]; renderowane jako <div class="slider-tick-label"> z left 0% / 100%. */
  ticks?: [string, string];
  /** Opcjonalne etykiety pod torem w <div class="slider-labels"><span>…</span><span>…</span></div>. */
  rangeLabels?: [string, string];
  /** Wariant etykiety: pozycjonowana (brak), dłuższy komunikat ("slider-value-label--message" + kontener "has-message-label") lub blok statyczny ("slider-value-label--multiline" + kontener "dose-slider-container--multiline"). */
  labelVariant?: 'default' | 'message' | 'multiline';
  /** Klasa "active" na etykiecie (waga 700) po przeciągnięciu. */
  active?: boolean;
  /** Wyłączony suwak (opacity .5) — w aplikacji przy stałej lub wymuszonej dawce. */
  disabled?: boolean;
  /** id pola range, w aplikacji "abxDoseSlider". */
  id?: string;
}

/** Podpowiedź zakresu nad polem: gospodarz <label class="vild-range-host"> z polem o klasie "vild-range-invalid" i <div class="vild-range-tip is-on" role="alert"><span class="vild-range-tip__ic"><span class="vild-range-tip__txt">. */
export interface RangeTipProps {
  /** Treść komunikatu, np. "Waga poza zakresem (1–500 kg)". */
  message: string;
  /** Klasa "is-on" — podpowiedź widoczna; bez niej opacity 0. */
  on?: boolean;
  /** Ikona SVG 24×24 (okrąg z wykrzyknikiem), wstawiana do .vild-range-tip__ic. */
  icon?: string;
}

export declare const DoseSlider: (props: DoseSliderProps) => HTMLDivElement;
export declare const RangeTip: (props: RangeTipProps) => HTMLDivElement;
