// P-STYLE rata 4b: longhandy własności CSS (skrót → składowe) do porównań w kaskadzie; prefiksy dostawców i aliasy zdjęte.
const BOKI = ['top', 'right', 'bottom', 'left'];
const KRAWEDZ = (bok) => [`border-${bok}-width`, `border-${bok}-style`, `border-${bok}-color`];
const SKROTY = {
  background: ['background-color', 'background-image', 'background-position-x', 'background-position-y', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip'],
  'background-position': ['background-position-x', 'background-position-y'],
  border: [...BOKI.flatMap(KRAWEDZ), 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat'],
  'border-top': KRAWEDZ('top'), 'border-right': KRAWEDZ('right'), 'border-bottom': KRAWEDZ('bottom'), 'border-left': KRAWEDZ('left'),
  'border-inline': [...KRAWEDZ('left'), ...KRAWEDZ('right')], 'border-inline-start': [...KRAWEDZ('left'), ...KRAWEDZ('right')], 'border-inline-end': [...KRAWEDZ('left'), ...KRAWEDZ('right')],
  'border-block': [...KRAWEDZ('top'), ...KRAWEDZ('bottom')], 'border-block-start': [...KRAWEDZ('top'), ...KRAWEDZ('bottom')], 'border-block-end': [...KRAWEDZ('top'), ...KRAWEDZ('bottom')],
  'border-color': BOKI.map((b) => `border-${b}-color`), 'border-style': BOKI.map((b) => `border-${b}-style`), 'border-width': BOKI.map((b) => `border-${b}-width`),
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  'border-image': ['border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat'],
  padding: BOKI.map((b) => `padding-${b}`), 'padding-inline': ['padding-left', 'padding-right'], 'padding-inline-start': ['padding-left', 'padding-right'], 'padding-inline-end': ['padding-left', 'padding-right'], 'padding-block': ['padding-top', 'padding-bottom'], 'padding-block-start': ['padding-top', 'padding-bottom'], 'padding-block-end': ['padding-top', 'padding-bottom'],
  margin: BOKI.map((b) => `margin-${b}`), 'margin-inline': ['margin-left', 'margin-right'], 'margin-inline-start': ['margin-left', 'margin-right'], 'margin-inline-end': ['margin-left', 'margin-right'], 'margin-block': ['margin-top', 'margin-bottom'], 'margin-block-start': ['margin-top', 'margin-bottom'], 'margin-block-end': ['margin-top', 'margin-bottom'],
  inset: BOKI, 'inset-inline': ['left', 'right'], 'inset-inline-start': ['left', 'right'], 'inset-inline-end': ['left', 'right'], 'inset-block': ['top', 'bottom'], 'inset-block-start': ['top', 'bottom'], 'inset-block-end': ['top', 'bottom'],
  outline: ['outline-width', 'outline-style', 'outline-color'],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'transition-behavior'],
  animation: ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state'],
  font: ['font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'], 'flex-flow': ['flex-direction', 'flex-wrap'],
  gap: ['row-gap', 'column-gap'], overflow: ['overflow-x', 'overflow-y'],
  'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'place-items': ['align-items', 'justify-items'], 'place-content': ['align-content', 'justify-content'], 'place-self': ['align-self', 'justify-self'],
  columns: ['column-width', 'column-count'], 'column-rule': ['column-rule-width', 'column-rule-style', 'column-rule-color'],
  'grid-column': ['grid-column-start', 'grid-column-end'], 'grid-row': ['grid-row-start', 'grid-row-end'],
  'grid-area': ['grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end'],
  'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
  grid: ['grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow'],
  'white-space': ['white-space-collapse', 'text-wrap-mode'], 'text-wrap': ['text-wrap-mode', 'text-wrap-style'],
  mask: ['mask-image', 'mask-mode', 'mask-repeat', 'mask-position', 'mask-clip', 'mask-origin', 'mask-size', 'mask-composite'],
  'scroll-margin': BOKI.map((b) => `scroll-margin-${b}`), 'scroll-padding': BOKI.map((b) => `scroll-padding-${b}`),
  'text-emphasis': ['text-emphasis-style', 'text-emphasis-color'],
};
export const ALIASY = { 'word-wrap': 'overflow-wrap' };

/** Longhandy własności (skrót → składowe; własność zwykła i własna → ona sama); prefiksy dostawców zdjęte. */
export function longhandy(prop) {
  let p = prop.toLowerCase();
  if (!p.startsWith('--')) p = p.replace(/^-(?:webkit|moz|ms|o)-/, '');
  p = ALIASY[p] || p;
  return SKROTY[p] || [p];
}

