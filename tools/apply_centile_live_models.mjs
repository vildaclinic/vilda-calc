/** Reproducible, idempotent extension of the deployment artifacts from
 * origin/audyt ed0e8b00. No minifier or medical formula is reimplemented.
 * Each exact anchor must occur once; unexpected upstream changes fail loudly.
 * Default calls retain their original branch. New callers request modelOnly
 * with explicit growthData and receive the producers' actual prepared curves.
 * Run: node tools/apply_centile_live_models.mjs [--check]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patches = [
  {
    "file": "inline_index_04.js",
    "label": "Explicit optional producer input",
    "before": "suppressSummaryBox:b})",
    "after": "suppressSummaryBox:b,growthData:__growthData,modelOnly:__modelOnly,legacyLayout:__legacyLayout})"
  },
  {
    "file": "inline_index_04.js",
    "label": "Measurement history comes from explicit snapshot",
    "before": "const Q=window.advancedGrowthData||null",
    "after": "const Q=__growthData!==undefined?__growthData:window.advancedGrowthData||null"
  },
  {
    "file": "inline_index_04.js",
    "label": "Current measurement comes from explicit snapshot",
    "before": "const R=M!==S||u!==H,K=w!==k||A!==x,B=window.advancedGrowthData||{}",
    "after": "const R=M!==S||u!==H,K=w!==k||A!==x,B=__growthData!==undefined?__growthData||{}:window.advancedGrowthData||{}"
  },
  {
    "file": "inline_index_04.js",
    "label": "Return actual prepared models before DOM/header/canvas/Creator setters",
    "before": "de=findHighlightBandSafe(X,E,v,be),oe=2480",
    "after": "de=findHighlightBandSafe(X,E,v,be);if(__modelOnly)return{source:L,originalGeometries:getCentileSnapshotPageGeometries({source:L,minX:e,maxX:t,minHeight:w,maxHeight:A,minWeight:M,maxWeight:u,expanded:R||K,standard:!!(__legacyLayout&&__legacyLayout.standard),hasName:!!(__legacyLayout&&__legacyLayout.hasName),hasSubtitle:!__legacyLayout||__legacyLayout.hasSubtitle!==false}),height:{curves:W,minY:w,maxY:A,officialMaxY:x,minX:e,maxX:t,points:ee,userVal:ne,userAgeMonths:_,percentiles:v,highlightBandIdx:fe,title:\"Wzrost (cm)\",units:\"cm\"},weight:{curves:E,minY:M,maxY:u,officialMaxY:H,minX:e,maxX:t,points:te,userVal:X,userAgeMonths:_,percentiles:v,highlightBandIdx:de,title:\"Waga (kg)\",units:\"kg\"},expanded:R||K};const oe=2480"
  },
  {
    "file": "inline_index_07.js",
    "label": "Optional Palczewska single-metric model input",
    "before": "function Fe({chartType:o,sex:s,userAgeMonths:i,userWeight:l,userHeight:f,layout:__layIn})",
    "after": "function Fe({chartType:o,sex:s,userAgeMonths:i,userWeight:l,userHeight:f,layout:__layIn,growthData:__growthData,modelOnly:__modelOnly})"
  },
  {
    "file": "inline_index_07.js",
    "label": "Explicit Palczewska history",
    "before": "const ct=window.advancedGrowthData||null",
    "after": "const ct=__growthData!==undefined?__growthData:window.advancedGrowthData||null"
  },
  {
    "file": "inline_index_07.js",
    "label": "Explicit Palczewska current measurement",
    "before": "const Ct=i-12,_=window.advancedGrowthData||{}",
    "after": "const Ct=i-12,_=__growthData!==undefined?__growthData||{}:window.advancedGrowthData||{}"
  },
  {
    "file": "inline_index_07.js",
    "label": "Return actual prepared Palczewska model before canvas/header",
    "before": "const Y=__lay?__lay.width:2480",
    "after": "if(__modelOnly)return{curves:x,minY:F,maxY:R,officialMaxY:ee,minX:12,maxX:216,points:j,userVal:le,userAgeMonths:ve,percentiles:B,highlightBandIdx:Ae,title:o===\"height\"?\"Wzrost (cm)\":\"Waga (kg)\",units:o===\"height\"?\"cm\":\"kg\"};const Y=__lay?__lay.width:2480"
  },
  {
    "file": "inline_index_07.js",
    "label": "Public pair producer bypasses legacy global render setters in model-only mode",
    "before": "function ze({sex:o,userAgeMonths:s,userWeight:i,userHeight:l},__lay){let f=!1",
    "after": "function ze({sex:o,userAgeMonths:s,userWeight:i,userHeight:l,growthData:__growthData,modelOnly:__modelOnly},__lay){if(__modelOnly)return[Fe({chartType:\"height\",sex:o,userAgeMonths:s,userWeight:i,userHeight:l,growthData:__growthData,modelOnly:true}),Fe({chartType:\"weight\",sex:o,userAgeMonths:s,userWeight:i,userHeight:l,growthData:__growthData,modelOnly:true})];let f=!1"
  },
  {
    "file": "vilda_centile_charts.js",
    "label": "Explicit value-label option; preserve legacy fallback",
    "before": "typeof window<\"u\"&&typeof window.isCentileCurrentPointLabelVisible==\"function\"?window.isCentileCurrentPointLabelVisible(d):!0",
    "after": "typeof t.valueLabelVisible===\"boolean\"?t.valueLabelVisible:typeof window<\"u\"&&typeof window.isCentileCurrentPointLabelVisible==\"function\"?window.isCentileCurrentPointLabelVisible(d):!0"
  },
  {
    "file": "vilda_centile_charts.js",
    "label": "Explicit band-reference option; preserve legacy fallback",
    "before": "const ie=typeof window<\"u\"&&typeof window.isCentileBandReferenceVisible==\"function\"?window.isCentileBandReferenceVisible():!0",
    "after": "const ie=typeof t.bandReferenceVisible===\"boolean\"?t.bandReferenceVisible:typeof window<\"u\"&&typeof window.isCentileBandReferenceVisible==\"function\"?window.isCentileBandReferenceVisible():!0"
  },
  {
    "file": "vilda_centile_charts.js",
    "label": "Forward explicit value-label option to the existing point painter",
    "before": "units:E,theme:L,plotMetrics:k})",
    "after": "units:E,theme:L,plotMetrics:k,valueLabelVisible:t.valueLabelVisible})"
  },
  {
    "file": "vilda_advanced_growth.js",
    "label": "Explicit parent input for existing MPH calculation; legacy DOM path unchanged",
    "before": "function pn(e){const t=parseFloat(document.getElementById(\"advMotherHeight\")?.value),n=parseFloat(document.getElementById(\"advFatherHeight\")?.value);",
    "after": "function pn(e,parents){const t=parseFloat(parents?parents.motherHeight:document.getElementById(\"advMotherHeight\")?.value),n=parseFloat(parents?parents.fatherHeight:document.getElementById(\"advFatherHeight\")?.value);"
  },
  {
    "file": "inline_index_03.js",
    "label": "Optional explicit patient population for immutable readouts; absent context retains original behavior",
    "before": "function getCentilePercentileStatsForSource(e,t,n,i,r)",
    "after": "function getCentilePercentileStatsForSource(e,t,n,i,r,__context)"
  },
  {
    "file": "inline_index_03.js",
    "label": "Optional explicit patient population for immutable readouts; absent context retains original behavior",
    "before": "T.policz({wzrost:e,plec:t,wiekMies:n,zrodlo:u||\"OLAF\"})",
    "after": "T.policz(Object.assign({wzrost:e,plec:t,wiekMies:n,zrodlo:u||\"OLAF\"},__context&&__context.population!=null?{populacja:__context.population}:{}))"
  },
  {
    "file": "inline_index_03.js",
    "label": "Readable pure original-page geometry export for both existing PDF styles",
    "before": "rideCentileSource=l.source,await generateCentileChart()}finally{window.overrideCentileSource=void 0}})}const n=document.getElementById(\"advClearBtn\");n&&n.addEventListener(\"click\",()=>{typeof clearAdvancedGrowthCard==\"function\"&&clearAdvancedGrowthCard()})});\n",
    "after": "rideCentileSource=l.source,await generateCentileChart()}finally{window.overrideCentileSource=void 0}})}const n=document.getElementById(\"advClearBtn\");n&&n.addEventListener(\"click\",()=>{typeof clearAdvancedGrowthCard==\"function\"&&clearAdvancedGrowthCard()})});\n\n/* Original PDF page geometry for read-only legacy annotation migration.\n * This is presentation layout only. Constants/partitions match the existing\n * classic and standard-user page producers; default PDF calls are unchanged.\n * All patient-dependent inputs (including header presence/style) are explicit.\n */\nfunction getCentileSnapshotPageGeometries(options) {\n  const o = options || {};\n  const geom = (metric, p) => ({plotX:p.px,plotY:p.py,plotW:p.pw,plotH:p.ph,\n    ageMin:o.minX,ageMax:o.maxX,minY:metric === 'height' ? o.minHeight : o.minWeight,\n    maxY:metric === 'height' ? o.maxHeight : o.maxWeight});\n  if (o.standard) {\n    const contentTop = o.hasSubtitle ? o.hasName ? 322 : 258 : o.hasName ? 282 : 218;\n    const available = 3508 - 144 - contentTop - 42 - 34;\n    const heightSpan = Math.max(1, o.maxHeight - o.minHeight);\n    const weightSpan = Math.max(1, o.maxWeight - o.minWeight);\n    let ratio = heightSpan / (heightSpan + weightSpan);\n    if (!Number.isFinite(ratio)) ratio = .53;\n    ratio = Math.max(.48, Math.min(.56, ratio));\n    const heightSpace = Math.round(available * ratio);\n    return {height:geom('height', getCentilePlotMetrics(136,72+contentTop,2208,heightSpace,{bottomMargin:104})),\n      weight:geom('weight', getCentilePlotMetrics(136,72+contentTop+heightSpace+34,2208,available-heightSpace,{bottomMargin:104}))};\n  }\n  const top = o.source === 'OLAF' ? 326.5 : 250;\n  const available = 3508 - 300 - (o.source === 'OLAF' ? 76.5 : 0) - 100;\n  const heightSpan = o.maxHeight - o.minHeight, weightSpan = o.maxWeight - o.minWeight;\n  const heightSpace = o.expanded ? Math.max(available*.3,available*heightSpan/(heightSpan+weightSpan||1)) : available/2;\n  return {height:geom('height',getCentilePlotMetrics(100,top,2280,heightSpace)),\n    weight:geom('weight',getCentilePlotMetrics(100,top+heightSpace+75,2280,available-heightSpace))};\n}\n"
  }
];
const pending = new Map();
for (const patch of patches) {
  const source = pending.get(patch.file) ?? await fs.readFile(path.join(root, patch.file), 'utf8');
  const count = (needle) => source.split(needle).length - 1;
  // The replacement can contain its old expression as a strict suffix. Check
  // the complete replacement first, then require a unique untouched anchor.
  if (count(patch.after) === 1) { pending.set(patch.file, source); continue; }
  if (count(patch.before) !== 1 || count(patch.after) !== 0) throw new Error(`Ambiguous artifact anchor: ${patch.file}: ${patch.label}`);
  if (process.argv.includes('--check')) throw new Error(`Unapplied artifact extension: ${patch.file}: ${patch.label}`);
  pending.set(patch.file, source.replace(patch.before, patch.after));
}
for (const [file, source] of pending) {
  if (!process.argv.includes('--check')) await fs.writeFile(path.join(root, file), source);
}
console.log(`Centile model extension verified: ${patches.length} exact anchors in ${pending.size} artifacts.`);
