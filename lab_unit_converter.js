(function(y){"use strict";var s=y.LabUnitsData;s||(s={list:function(){return[]},find:function(){return null},groups:function(){return[]}});
// AMH has source-qualified, age-specific intervals, including strict upper-only limits.
// Keep the legacy selector/evaluator unchanged for every other analyte.
function amhReferenceMetadata(substance) {
  var policy = substance.reference_policy || {};
  return {
    amh_reference: true,
    clinical_reference_kind: policy.comparison_kind || 'age-source-comparison',
    reference_policy_id: policy.id || null,
    reference_policy_version: policy.version || null,
    source_method: policy.method_name || null,
    source_material: policy.specimen || null,
    source_ids: policy.source_id ? [policy.source_id] : [],
    reason_codes: [],
    matched: false,
    is_default: false
  };
}
function unavailableAmhReference(substance, reason, message) {
  var result = amhReferenceMetadata(substance);
  result.id = null;
  result.low = null;
  result.high = null;
  result.high_exclusive = false;
  result.no_interpretation = true;
  result.reason_codes = [reason];
  result.context_pl = message;
  return result;
}
function unknownAmhContext(value) {
  return value == null || typeof value === 'string' && ['', 'unknown', 'nieznany', 'nieznana', 'nieustalony', 'nieustalona'].includes(x(value));
}
function selectAmhReference(substance, patient) {
  patient = patient || {};
  var policy = substance.reference_policy;
  if (!policy || !policy.id || !Array.isArray(substance.reference_ranges_si)) {
    return unavailableAmhReference(substance, 'reference_policy_unavailable', 'Brak danych referencyjnych AMH.');
  }
  if (patient.age == null) return unavailableAmhReference(substance, 'missing_age', 'Uzupełnij wiek pacjenta.');
  if (typeof patient.age !== 'number' || !isFinite(patient.age) || patient.age < 0) {
    return unavailableAmhReference(substance, 'invalid_age', 'Sprawdź wiek pacjenta.');
  }
  if (patient.sex !== 'M' && patient.sex !== 'F') return unavailableAmhReference(substance, 'missing_sex', 'Uzupełnij płeć pacjenta.');
  var upper = patient.age, upperInclusive = true;
  if (patient.ageUpperYears != null) {
    upper = patient.ageUpperYears;
    upperInclusive = patient.ageUpperInclusive !== false;
    if (typeof upper !== 'number' || !isFinite(upper) || upper < patient.age ||
        upper === patient.age && !upperInclusive || patient.ageUpperInclusive != null && typeof patient.ageUpperInclusive !== 'boolean') {
      return unavailableAmhReference(substance, 'invalid_age', 'Sprawdź przedział wieku pacjenta.');
    }
  }
  if ((patient.preterm === true || x(patient.preterm) === 'yes' || x(patient.preterm) === 'tak') &&
      patient.age < policy.preterm_exclusion_below_years) {
    return unavailableAmhReference(substance, 'preterm_reference_not_established', 'Brak zakresu AMH dla wcześniaka w 1. roku życia.');
  }
  if (!unknownAmhContext(patient.method) && (typeof patient.method !== 'string' ||
      !Array.isArray(policy.method_aliases) || !policy.method_aliases.includes(x(patient.method)))) {
    return unavailableAmhReference(substance, 'incompatible_method', 'Brak zakresu AMH dla wskazanej metody.');
  }
  if (!unknownAmhContext(patient.specimen) && (typeof patient.specimen !== 'string' ||
      !Array.isArray(policy.specimen_aliases) || !policy.specimen_aliases.includes(x(patient.specimen)))) {
    return unavailableAmhReference(substance, 'incompatible_specimen', 'Zakres AMH dotyczy surowicy.');
  }
  var contraindication = patient.amh_contraindication;
  if (!unknownAmhContext(contraindication) && contraindication !== false &&
      !['no', 'none', 'nie'].includes(x(contraindication))) {
    return unavailableAmhReference(substance,
      contraindication === 'context-unavailable' ? 'patient_context_unavailable' : 'known_contraindication',
      contraindication === 'context-unavailable' ? 'Brak aktualnego kontekstu pacjenta.' : 'Podany kontekst wymaga odrębnej oceny AMH.');
  }
  var rows = substance.reference_ranges_si;
  for (var index = 0; index < rows.length; index++) {
    var row = rows[index], when = row.when || {};
    if (row.default || when.sex !== patient.sex || patient.age < when.age_min ||
        typeof when.age_max === 'number' && patient.age >= when.age_max) continue;
    if (typeof when.age_max === 'number' && (upper > when.age_max || upper === when.age_max && upperInclusive)) {
      return unavailableAmhReference(substance, 'age_precision_crosses_reference_boundary', 'Podany wiek obejmuje różne zakresy AMH. Doprecyzuj wiek.');
    }
    var selected = amhReferenceMetadata(substance);
    selected.id = row.id;
    selected.low = row.low == null ? null : row.low;
    selected.high = row.high;
    selected.high_exclusive = row.high_exclusive === true;
    selected.context_pl = row.context_pl || '';
    selected.source_age_label = row.source_age_label || '';
    selected.source_ids = Array.isArray(row.source_ids) ? row.source_ids.slice() : selected.source_ids;
    selected.matched = true;
    selected.no_interpretation = false;
    return selected;
  }
  return unavailableAmhReference(substance, 'no_matching_reference_range', 'Brak zakresu AMH dla podanego wieku i płci.');
}
// Eight relative machine epsilons cover conversion roundoff only. The source
// limits and the patient's reported/converted values remain unrounded.
function compareAmhBoundary(value, boundary) {
  var tolerance = 8 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(boundary));
  return Math.abs(value - boundary) <= tolerance ? 0 : value < boundary ? -1 : 1;
}
function compareAmhReference(value, range) {
  if (!range || typeof value !== 'number' || !isFinite(value)) return 'no_range';
  if (range.no_interpretation) return 'no_interpretation';
  if (typeof range.high !== 'number' || !isFinite(range.high) ||
      range.low != null && (typeof range.low !== 'number' || !isFinite(range.low))) return 'no_range';
  if (compareAmhBoundary(value, range.high * 2) > 0) return 'far_above';
  if (range.low > 0 && compareAmhBoundary(value, range.low * 0.5) < 0) return 'far_below';
  if (range.low != null && compareAmhBoundary(value, range.low) < 0) return 'below';
  var upper = compareAmhBoundary(value, range.high);
  if (upper > 0 || range.high_exclusive && upper === 0) return 'above';
  return 'within';
}
function finishAmhEvaluation(result, range, unit) {
  if (!range) return result;
  ['amh_reference', 'clinical_reference_kind', 'reference_policy_id', 'reference_policy_version',
    'source_method', 'source_material', 'source_age_label', 'high_exclusive', 'no_interpretation'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(range, key)) result[key] = range[key];
  });
  result.range_id = range.id || null;
  result.reason_codes = (range.reason_codes || []).slice();
  result.context_pl = range.context_pl || '';
  result.source_ids = (range.source_ids || []).slice();
  result.matched = !!range.matched;
  result.is_default = false;
  if (range.no_interpretation) { result.status = 'no_interpretation'; return result; }
  if (typeof range.high !== 'number' || !isFinite(range.high) ||
      range.low != null && (typeof range.low !== 'number' || !isFinite(range.low))) return result;
  result.low = range.low;
  result.high = range.high;
  result.lowInUnit = range.low == null ? null : range.low / unit.factor_to_si;
  result.highInUnit = range.high / unit.factor_to_si;
  result.status = compareAmhReference(result.siValue, range);
  return result;
}

function S(r){if(r==null)return"";try{return String(r).normalize("NFD").replace(/[̀-ͯ]/g,"")}catch{return String(r)}}function x(r){var e=S(String(r||"")).toLowerCase();return e.replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function v(r,e){if(!r||!e)return null;for(var n=0;n<r.units.length;n++)if(r.units[n].symbol===e)return r.units[n];return null}function O(r,e){if(!isFinite(r))return r;if(r===0)return 0;var n=Math.max(1,e|0),i=Math.ceil(Math.log10(Math.abs(r))),t=n-i,u=Math.pow(10,t);return Math.round(r*u)/u}var d=3;function h(r,e){if(!isFinite(r))return"\u2014";var n=e==null?d:e|0,i=O(r,n);if(i!==0&&Math.abs(i)<1e-4){var t=i.toExponential(n-1);return t.replace(".",",")}var u=Math.abs(i),a;u>=100?a=Math.max(0,n-3):u>=10?a=Math.max(0,n-2):u>=1?a=Math.max(1,n-1):u>=.1?a=Math.max(2,n):u>=.01?a=Math.max(3,n+1):a=Math.max(4,n+2);var o=i.toFixed(a);o.indexOf(".")!==-1&&(o=o.replace(/0+$/,"").replace(/\.$/,""));var l=o.split(".");return Math.abs(parseInt(l[0],10))>=1e4&&(l[0]=l[0].replace(/\B(?=(\d{3})+(?!\d))/g,"\xA0")),l.join(",")}function _(r){if(r==null)return NaN;if(typeof r=="number")return r;var e=String(r).trim();if(!e)return NaN;e=e.replace(/[\s ]/g,""),e=e.replace(",",".");var n=Number(e);return isFinite(n)?n:NaN}function A(){var r=s.list();return r.map(function(e){return{id:e.id,label:e.label_pl,group:e.group}})}function W(){return s.groups()}function D(r){return s.find(r)}function B(r){var e=s.find(r);return e?e.units.slice():[]}function L(){for(var r=s.list(),e={},n=[],i=0;i<r.length;i++)for(var t=Array.isArray(r[i].clinical_indications)?r[i].clinical_indications:[],u=0;u<t.length;u++){var a=t[u];!a||e[a]||(e[a]=!0,n.push(a))}return n}function V(r){if(!r)return[];for(var e=s.list(),n=[],i=0;i<e.length;i++){var t=Array.isArray(e[i].clinical_indications)?e[i].clinical_indications:[];t.indexOf(r)!==-1&&n.push({id:e[i].id,label:e[i].label_pl,group:e[i].group})}return n}function N(r,e){if(!r)return!0;var n=e||{};return!(r.sex&&n.sex!==r.sex||r.life_stage&&n.life_stage!==r.life_stage||r.cycle_phase&&n.cycle_phase!==r.cycle_phase||r.tanner&&String(n.tanner)!==String(r.tanner)||r.time_of_day&&n.time_of_day!==r.time_of_day||r.test_protocol&&n.test_protocol!==r.test_protocol||r.method&&n.method!==r.method||typeof r.age_min=="number"&&(typeof n.age!="number"||!isFinite(n.age)||n.age<r.age_min)||typeof r.age_max=="number"&&(typeof n.age!="number"||!isFinite(n.age)||n.age>=r.age_max))}function U(r,e){if(!r)return null;if(r.id==="amh")return selectAmhReference(r,e);var n=Array.isArray(r.reference_ranges_si)?r.reference_ranges_si:null;if(n&&n.length){for(var i=0;i<n.length;i++){var t=n[i];if(!t.default&&N(t.when,e))return{id:t.id||null,low:t.low,high:t.high,context_pl:t.context_pl||"",source_ids:Array.isArray(t.source_ids)?t.source_ids.slice():[],no_interpretation:!!t.no_interpretation,matched:!0,is_default:!1}}for(var u=0;u<n.length;u++){var a=n[u];if(a.default)return{id:a.id||null,low:a.low,high:a.high,context_pl:a.context_pl||"",source_ids:Array.isArray(a.source_ids)?a.source_ids.slice():[],no_interpretation:!!a.no_interpretation,matched:!1,is_default:!0}}}if(r.default_range_si){var o=r.default_range_si;return{id:null,low:o.low,high:o.high,context_pl:o.context_pl||"",source_ids:[],matched:!1,is_default:!0}}return null}function C(r){if(!r)return[];for(var e=Array.isArray(r.reference_ranges_si)?r.reference_ranges_si:[],n=[],i=[],t=0;t<e.length;t++)e[t].default?i.push(e[t]):n.push(e[t]);return n.length?n:i}function R(r){var e=x(r);if(!e)return A();for(var n=e.split(" ").filter(Boolean),i=s.list(),t=[],u=0;u<i.length;u++){for(var a=i[u],o=[a.label_pl,a.label_en,a.id,a.group].concat(Array.isArray(a.aliases)?a.aliases:[]),l=[],c=0;c<o.length;c++){var k=x(o[c]);k&&l.push(k)}for(var z=l.join(" | "),q=z.replace(/\s+/g,""),I=!0,F=!1,M=!1,g=0;g<n.length;g++){var p=n[g],j=z.indexOf(p)!==-1,G=!j&&q.indexOf(p)!==-1;if(!j&&!G){I=!1;break}for(var m=0;m<l.length;m++){if(l[m]===p){F=!0;break}l[m].indexOf(p)===0&&(M=!0)}}if(I){var J=10+(M?40:0)+(F?50:0);t.push({s:a,score:J,idx:u})}}return t.sort(function(f,b){return f.score!==b.score?b.score-f.score:f.idx-b.idx}),t.map(function(f){return{id:f.s.id,label:f.s.label_pl,group:f.s.group}})}function T(r){r=r||{};var e=s.find(r.substanceId);if(!e)return{ok:!1,error:"Nie znaleziono substancji."};var n=typeof r.value=="number"?r.value:_(r.value);if(!isFinite(n))return{ok:!1,error:"Warto\u015B\u0107 nie jest liczb\u0105."};if(n<0)return{ok:!1,error:"Warto\u015B\u0107 nie mo\u017Ce by\u0107 ujemna."};var i=v(e,r.fromUnit),t=v(e,r.toUnit);if(!i)return{ok:!1,error:"Nieznana jednostka \u017Ar\xF3d\u0142owa: "+r.fromUnit};if(!t)return{ok:!1,error:"Nieznana jednostka docelowa: "+r.toUnit};var u=n*i.factor_to_si,a=u/t.factor_to_si,o=e.precision||d;return{ok:!0,value:a,formatted:h(a,o)+" "+t.symbol,siValue:u,siUnit:e.canonical_si,fromUnit:i.symbol,toUnit:t.symbol,precision:o}}function E(r){r=r||{};var e=s.find(r.substanceId);if(!e)return{ok:!1,error:"Nie znaleziono substancji."};var n=typeof r.value=="number"?r.value:_(r.value);if(!isFinite(n))return{ok:!1,error:"Warto\u015B\u0107 nie jest liczb\u0105."};if(n<0)return{ok:!1,error:"Warto\u015B\u0107 nie mo\u017Ce by\u0107 ujemna."};var i=v(e,r.fromUnit);if(!i)return{ok:!1,error:"Nieznana jednostka \u017Ar\xF3d\u0142owa."};for(var t=n*i.factor_to_si,u=e.precision||d,a=[],o=0;o<e.units.length;o++){var l=e.units[o];if(l.symbol!==i.symbol){var c=t/l.factor_to_si;a.push({unit:l.symbol,label:l.label,kind:l.kind,value:c,formatted:h(c,u)})}}return{ok:!0,substanceId:e.id,label:e.label_pl,fromUnit:i.symbol,value:n,siValue:t,siUnit:e.canonical_si,precision:u,results:a}}function $(r,e){e=e||{};var n=s.find(r);if(!n)return{ok:!1,error:"Nie znaleziono substancji."};var i=typeof e.value=="number"?e.value:_(e.value);if(!isFinite(i))return{ok:!1,error:"Warto\u015B\u0107 nie jest liczb\u0105."};if(i<0)return{ok:!1,error:"Warto\u015B\u0107 nie mo\u017Ce by\u0107 ujemna."};var t=v(n,e.unit);if(!t)return{ok:!1,error:"Nieznana jednostka: "+e.unit};var u=i*t.factor_to_si,a=n.precision||d,o=U(n,e.patient||{}),l={ok:!0,substanceId:n.id,label:n.label_pl,value:i,unit:t.symbol,siValue:u,siUnit:n.canonical_si,precision:a,low:null,high:null,lowInUnit:null,highInUnit:null,context_pl:"",source_ids:[],matched:!1,is_default:!1,status:"no_range"};if(n.id==="amh")return finishAmhEvaluation(l,o,t);return o?(l.context_pl=o.context_pl||"",l.source_ids=Array.isArray(o.source_ids)?o.source_ids.slice():[],l.matched=!!o.matched,l.is_default=!!o.is_default,o.no_interpretation?(l.status="no_interpretation",l):o.low==null||o.high==null?(l.status="no_range",l):(l.low=o.low,l.high=o.high,l.lowInUnit=o.low/t.factor_to_si,l.highInUnit=o.high/t.factor_to_si,u>o.high*2?l.status="far_above":o.low>0&&u<o.low*.5?l.status="far_below":u<o.low?l.status="below":u>o.high?l.status="above":l.status="within",l)):l}var w={list:A,groups:W,find:D,units:B,search:R,convert:T,convertAll:E,evaluate:$,compareAmhReference:compareAmhReference,parseNumber:_,formatNumber:h,selectRange:U,rangesForOverride:C,matchesWhen:N,listIndications:L,findByIndication:V,findSource:function(r){return s&&typeof s.findSource=="function"?s.findSource(r):null},version:"2.0.0"};typeof module<"u"&&module.exports&&(module.exports=w),y.LabUnitConverter=w})(typeof window<"u"?window:this);
