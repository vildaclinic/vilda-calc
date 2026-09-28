/** Przełącznik: <label class="…"><input type="checkbox"><span class="slider"></span></label>. */
export interface SwitchProps {
  /** Wariant = klasa etykiety: "switch" (60×30, tor teal po obu stronach) | "switch-diet" (52×28, #ccc → teal) | "switch-pub" (60×30, #ccc → #90f PRO) | "switch-flu" (60×30, #ccc → teal). */
  variant?: 'switch' | 'switch-diet' | 'switch-pub' | 'switch-flu';
  /** id pola. Dla "switch" ruch kółka dają tylko: "dataToggle" | "bpDataToggle" | "resultsModeToggle" | "adultBpGuidelineToggle" albo kontekst .settings-grid. */
  id?: string;
  checked?: boolean;
  /** Styl wyłączony istnieje tylko dla #bpDataToggle i .settings-grid .switch (tor #ddd). */
  disabled?: boolean;
}

/** Wiersz z dwiema etykietami: <div class="toggle-wrap"><span class="label-left">…</span>Switch<span class="label-right">…</span></div>. */
export interface ToggleWrapProps {
  left: string;
  right: string;
  /** Dodaje klasę "pro-label" do prawej etykiety i <sup class="pro-tag">PRO</sup>; działa w #resultsModeToggleContainer. */
  rightIsPro?: boolean;
  switch: SwitchProps;
}

/** Wiersz włącz/wyłącz w module: klasa kontenera i etykiety zależy od modułu. */
export interface SwitchRowProps {
  /** "diet-toggle-group" + .toggle-label | "publication-toggle-row" + .publication-toggle-label | "flu-switch-row" + .flu-switch-label (w #fluCard #fluSwitches) | "setting-item" + <span> (w .settings-grid). */
  context: 'diet-toggle-group' | 'publication-toggle-row' | 'flu-switch-row' | 'setting-item';
  label: string;
  switch: SwitchProps;
}

export declare const Switch: (props: SwitchProps) => HTMLLabelElement;
export declare const ToggleWrap: (props: ToggleWrapProps) => HTMLDivElement;
export declare const SwitchRow: (props: SwitchRowProps) => HTMLDivElement;
