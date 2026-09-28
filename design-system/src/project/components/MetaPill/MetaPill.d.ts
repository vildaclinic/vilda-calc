/** Pigułka metadanych materiału edukacyjnego — <span class="edu-meta-pill"> z <span class="edu-meta-icon"> (SVG Lucide) i <span> z tekstem, w <div class="edu-meta-row">. */
export interface MetaPillProps {
  /** Nazwa ikony Lucide, np. "activity" (czas), "file-text" (plik). */
  icon: string;
  /** Tekst, np. "Czas filmu: 03:05", "PDF, 2 MB". */
  children: string;
}
export declare const MetaPill: (props: MetaPillProps) => HTMLSpanElement;
/** Wiersz pigułek: <div class="edu-meta-row"> (flex-wrap, gap .65rem). */
export declare const MetaPillRow: (props: { children: HTMLSpanElement[] }) => HTMLDivElement;
