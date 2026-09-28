/** Wiersz ustawienia — <div class="setting-item"> w div.settings-grid: <span>etykieta</span> + <label class="switch"><input type="checkbox"><span class="slider"></span></label>. */
export interface SettingItemProps {
  /** Etykieta w <span>, np. „Pokaż dock”. */
  label: string;
  /** id pola input, np. "showMobileDockSetting". */
  id?: string;
  /** Atrybut checked na input — tor przełącznika w kolorze --primary. */
  checked?: boolean;
  /** Atrybut disabled na input — tor #ddd, kursor not-allowed. */
  disabled?: boolean;
}

/** Siatka wierszy — <div class="settings-grid"> (auto-fit, minmax(270px,1fr), gap 1rem). */
export interface SettingsGridProps {
  id?: string;
  children: HTMLDivElement[];
}

export declare const SettingItem: (props: SettingItemProps) => HTMLDivElement;
export declare const SettingsGrid: (props: SettingsGridProps) => HTMLDivElement;
