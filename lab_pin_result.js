(function(a){"use strict";var l=a.document;if(!l)return;function u(t){return l.getElementById(t)}function E(){if(a._vildaCurrentPatientId)return a._vildaCurrentPatientId;try{return a.sessionStorage&&a.sessionStorage.getItem("vildaCurrentPatientId")||null}catch{return null}}function S(){try{var t=a.VildaSession;return t&&typeof t.getPatient=="function"?t.getPatient():null}catch{return null}}function R(){var t=S();if(!t)return null;var e=0;return t.age!=null&&isFinite(t.age)&&(e+=parseInt(t.age,10)*12),t.ageMonths!=null&&isFinite(t.ageMonths)&&(e+=parseInt(t.ageMonths,10)),e>0?e:null}function z(t){if(!t)return null;var e=Math.floor(t/12),n=t%12;return e+" l"+(n?" "+n+" m":"")}function j(){function t(n){try{var i=n.document.getElementById("mobileBottomDock");if(!i)return 0;var r=i.getBoundingClientRect(),o=n.visualViewport&&n.visualViewport.height||n.innerHeight||0;if(!o||!r||!r.height)return 0;var d=Math.max(0,Math.round(o-r.top));return d>0&&d<o?d:0}catch{return 0}}var e=t(a);if(e)return e;try{if(a.parent&&a.parent!==a)return t(a.parent)}catch{}return 0}function L(){var t=u("labSubstance"),e=u("labValue"),n=u("labUnit"),i=u("labResultBig"),r=u("labResultSection");if(!t||!e||!n||!i)return null;var o=String(t.value||"").trim(),d=String(e.value||"").trim(),y=n.options&&n.selectedIndex>=0?String(n.options[n.selectedIndex].textContent||n.value).trim():String(n.value||"").trim(),w=Lh3ConvertedText(i),P=r&&r.classList.contains("is-empty");if(!o||!d||!w||P)return null;var C=String(n.value||"").trim()||y,p=parseFloat(d.replace(",","."));return(!isFinite(p)||p<0)&&(p=null),{test:o,raw:d,unitFrom:y,converted:w,unitSym:C,valueNum:p,testKey:F(o)}}function F(t){try{var e=a.LabUnitConverter;if(!e||typeof e.list!="function")return null;var n=String(t||"").trim();if(!n)return null;for(var i=e.list()||[],r=0;r<i.length;r++)if(i[r]&&i[r].label===n)return i[r].id||null}catch{}return null}function D(){var t=new Date;return t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0")}var f=null,v=null,x=null;function M(){if(!u("labPinStyle")){var t=l.createElement("style");t.id="labPinStyle",t.textContent="#labPinRow{display:none;background:#EEEDFE;border-left:3px solid #5856D6;border-radius:0 10px 10px 0;padding:10px 12px;margin-top:12px;align-items:center;gap:10px;flex-wrap:wrap;}#labPinRow.is-on{display:flex;}#labPinInfo{flex:1 1 170px;min-width:0;}#labPinCtx{display:block;font-size:0.84rem;font-weight:600;color:#26215C;}#labPinSub{display:block;font-size:0.72rem;color:#534AB7;margin-top:2px;}button#labPinResultBtn,.liquid-ios26 button#labPinResultBtn{background:#5856D6 !important;color:#fff !important;border:0 !important;border-radius:10px !important;padding:10px 14px !important;font-size:0.86rem !important;font-weight:600 !important;cursor:pointer !important;font-family:inherit !important;white-space:nowrap !important;line-height:1.2 !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:none !important;}button#labPinResultBtn:hover,.liquid-ios26 button#labPinResultBtn:hover{background:#4a48c9 !important;color:#fff !important;}@media (max-width:560px){#labPinRow.is-on{display:block;}#labPinRow button#labPinResultBtn{display:block !important;width:100% !important;margin-top:8px !important;white-space:normal !important;}}",l.head.appendChild(t)}}function N(){if(f)return f;var t=u("labResultSection");if(!t||!t.parentNode)return null;M(),f=l.createElement("div"),f.id="labPinRow";var e=l.createElement("div");e.id="labPinInfo",x=l.createElement("span"),x.id="labPinCtx";var n=l.createElement("span");return n.id="labPinSub",n.textContent="wynik trafi do karty pacjenta",e.appendChild(x),e.appendChild(n),v=l.createElement("button"),v.type="button",v.id="labPinResultBtn",v.textContent="\u{1F4CC} Przypnij do wizyty",f.appendChild(e),f.appendChild(v),t.parentNode.insertBefore(f,t.nextSibling),v.addEventListener("click",V),f}var B=null;function c(){clearTimeout(B),B=setTimeout(function(){var t=N();if(t){var e=L(),n=E(),i=S(),r=!!(e&&n&&i&&i.name);if(t.classList.toggle("is-on",r),r){var o=z(R());x.textContent=i.name+(o?" \xB7 wizyta: "+o:"")}}},150)}/* LH/FSH: dostawca przekazuje ocenę aktualnie widoczną w przeliczniku.
Ocena jest kopiowana przy otwarciu przypięcia, przed dalszymi zmianami formularza. */
var Lh2AssessmentProvider=null;a.VildaLabPinResult={setAssessmentProvider:function(t){if(t!=null&&typeof t!=="function")throw new TypeError("Assessment provider must be a function or null");Lh2AssessmentProvider=t||null}};
function Lh2CaptureAssessment(result) {
  if (!Lh2AssessmentProvider) return;
  try {
    var captured = Lh2AssessmentProvider({ test: result.test, testKey: result.testKey,
      raw: result.raw, unit: result.unitSym, valueNum: result.valueNum });
    if (captured === undefined) return;
    result.assessment = a.VildaLabSnapshot && typeof a.VildaLabSnapshot.normalize === 'function'
      ? a.VildaLabSnapshot.normalize(captured) : JSON.parse(JSON.stringify(captured));
    if (result.testKey === 'testosterone_total') {
      // The existing pin parser uses parseFloat, which splits grouped numbers.
      // A detached TT assessment owns the original number and unit; its SI
      // value is not the number to store beside the source unit in this note.
      var evaluation = result.assessment && result.assessment.status === 'recorded' && result.assessment.evaluation;
      var measurement = evaluation && evaluation.analyte === result.testKey && evaluation.measurement;
      result.valueNum = measurement && measurement.status === 'valid' && measurement.isExact === true &&
        measurement.sourceUnit === result.unitSym && measurement.raw === result.raw &&
        typeof measurement.sourceValue === 'number' && Number.isFinite(measurement.sourceValue)
        ? measurement.sourceValue : null;
    }
  } catch (_) {
    result.assessment = { schemaVersion: 1, status: 'unavailable', reasonCodes: ['snapshot_provider_failed'], evaluation: null };
    if (result.testKey === 'testosterone_total') result.valueNum = null;
  }
}
/* AMH educational reference is separate from the clinical assessment. */
var HrReferenceProvider = null;
a.VildaLabPinResult.setHormoneReferenceProvider = function (provider) {
  if (provider != null && typeof provider !== 'function') throw new TypeError('Reference provider must be a function or null');
  HrReferenceProvider = provider || null;
};
function HrCaptureReference(result, patientId) {
  if (!HrReferenceProvider) return;
  var core = a.VildaHormoneReferenceSnapshot;
  try {
    var captured = HrReferenceProvider({ test: result.test, testKey: result.testKey,
      raw: result.raw, unit: result.unitSym, valueNum: result.valueNum, patientId: patientId });
    if (captured === undefined) return;
    // AMH uses the converter's accepted number syntax, including grouped
    // whitespace. parseFloat would save a different value for e.g. "1 000".
    if (result.testKey === 'amh' && a.LabUnitConverter) {
      var parsed = a.LabUnitConverter.parseNumber(result.raw);
      result.valueNum = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
    if (!core) throw new Error('Reference serializer unavailable');
    result.hormoneReference = core.normalize(captured);
  } catch (_) {
    result.hormoneReference = core ? core.unavailable('reference_provider_failed') : {
      schemaVersion: 1, kind: 'educational-hormone-reference', scope: 'ordinary-patient-reference',
      analyte: 'amh', status: 'unavailable', reasonCodes: ['reference_helper_unavailable'],
      capturedAtISO: null, context: null, measurement: null, reference: null, display: null, versions: null
    };
  }
}
function HrReferenceLab(result, dateISO) {
  var core = a.VildaHormoneReferenceSnapshot;
  if (!core) throw new Error('Moduł odniesienia jest niedostępny — odśwież stronę.');
  var lab = { test: result.test, testKey: result.testKey, value: result.raw,
    valueNum: result.valueNum, unit: result.unitSym, hormoneReference: core.normalize(result.hormoneReference) };
  return core.reconcile(lab, lab, result.sampleDateISO, dateISO);
}
function HrPinReference(result, host) {
  if (!Object.prototype.hasOwnProperty.call(result, 'hormoneReference')) return;
  var preview = l.createElement('div'), date = u('labPinDate');
  preview.id = 'labPinHormoneReference';
  host.insertBefore(preview, date && date.parentNode || host.firstChild);
  function refresh() {
    if (a.VildaHormoneReferenceUI && a.VildaHormoneReferenceSnapshot) {
      a.VildaHormoneReferenceUI.render(preview, HrReferenceLab(result, date ? date.value : result.sampleDateISO).hormoneReference, { compact: true });
    } else preview.textContent = 'Podgląd odniesienia jest niedostępny.';
  }
  if (date) { date.addEventListener('input', refresh); date.addEventListener('change', refresh); }
  refresh();
}
/* Decyzja 6.3 (LAB-HISTORIA): zakres referencyjny, którego przelicznik użył dla bieżącego wyniku, kopiowany
 * przy otwarciu okna (jak ocena) i zapisywany z wynikiem. Dostawcę ustawia przelicznik; LH, FSH, inhibina B,
 * testosteron i AMH mają własny zapis, więc dla nich dostawca nic nie zwraca. Bez zakresu pole nie powstaje
 * i wpis zostaje bez oceny, jak dotąd. Wiązanie z polami wyniku nadaje sejf przy zapisie (po sanityzacji). */
var RrRangeProvider = null;
a.VildaLabPinResult.setRangeProvider = function (provider) {
  if (provider != null && typeof provider !== 'function') throw new TypeError('Range provider must be a function or null');
  RrRangeProvider = provider || null;
};
function RrCaptureRange(result) {
  delete result.range;
  var core = a.VildaLabRangeSnapshot;
  if (!RrRangeProvider || !core) return;
  try {
    var captured = RrRangeProvider({ test: result.test, testKey: result.testKey,
      raw: result.raw, unit: result.unitSym, valueNum: result.valueNum });
    if (captured === undefined) return;
    var range = core.normalize(captured);
    if (!range.measurement) return;
    result.range = range;
    // Liczba jak w przeliczniku („1 000” = 1000); parseFloat zapisałby 1 (tak samo jak przy AMH).
    result.valueNum = range.measurement.sourceValue;
  } catch (_) { delete result.range; }
}
var RrPinText = { within: 'w zakresie', below: 'poniżej zakresu', above: 'powyżej zakresu',
  far_below: 'znacznie poniżej zakresu', far_above: 'znacznie powyżej zakresu' };
function RrFormat(testKey) {
  var conv = a.LabUnitConverter, sub = conv && typeof conv.find === 'function' ? conv.find(testKey) : null;
  var precision = sub && sub.precision || 3;
  return conv && typeof conv.formatNumber === 'function' ? function (n) { return conv.formatNumber(n, precision); } : null;
}
function RrPinRange(result, host) {
  if (!Object.prototype.hasOwnProperty.call(result, 'range')) return;
  var core = a.VildaLabRangeSnapshot;
  var info = core && typeof core.describe === 'function' ? core.describe(result.range, { formatNumber: RrFormat(result.testKey) }) : null;
  if (!info) return;
  var date = u('labPinDate'), before = date && date.parentNode || host.firstChild;
  var box = l.createElement('div');
  box.id = 'labPinRange';
  box.className = 'vilda-lab-pin-range';
  var line = l.createElement('div');
  line.textContent = 'Zapisze się z wynikiem: ';
  var strong = l.createElement('strong');
  // Decyzja 6.30: zakres ogólny (wiersz domyślny przelicznika) u dziecka — okno mówi to samo co historia: bez kategorii.
  var general = info.status === 'general';
  strong.textContent = general ? 'zakres ogólny ' + info.bounds + ' — bez oceny dla dziecka'
    : info.classification ? RrPinText[info.classification] + ' ' + info.bounds
    : result.testKey === 'estradiol' ? 'bez jednej oceny względem zakresu'
    : 'bez oceny względem zakresu (pomiar nieinterpretowalny w tych warunkach)';
  line.appendChild(strong);
  box.appendChild(line);
  var who = info.subject ? (general ? 'bez zakresu dla: ' : 'dobrano dla: ') + info.subject : '';
  var context = [info.population, who, info.sources.join(', ')].filter(Boolean);
  if (context.length) {
    var small = l.createElement('div');
    small.className = 'vilda-lab-pin-range-context';
    small.textContent = context.join(' \u00b7 ');
    box.appendChild(small);
  }
  var note = l.createElement('p');
  note.id = 'labPinRangeDateNote';
  note.setAttribute('role', 'status');
  note.className = 'vilda-lab-pin-range-note';
  host.insertBefore(box, before);
  host.insertBefore(note, before);
  function refresh() {
    // Zakres dobrano do danych pacjenta widocznych teraz; przy innej dacie badania lekarz sprawdza, czy pasuje.
    var other = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date.value) && date.value !== D();
    note.hidden = !other;
    note.textContent = other ? 'Zakres dobrano do danych pacjenta widocznych teraz w przeliczniku. Badanie było w innym dniu \u2014 sprawdź, czy ten przedział pasuje do wieku w dniu badania.' : '';
  }
  if (date) { date.addEventListener('input', refresh); date.addEventListener('change', refresh); }
  refresh();
}
/* P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15): Jednostki lab. otwarte z oczekującego wyniku w zakładce
 * „Badania”. Okno przypięcia dostaje znacznik „Zamknij oczekujący wynik” (nad datą badania), a po zapisaniu
 * wyniku zaznaczony znacznik oznacza wpis jako wykonany (wywołanie commit w funkcji zapisu A, zaraz po
 * savePatientNote; błąd zamknięcia nie cofa zapisanego wyniku). Wpis, znacznik i zamknięcie należą do
 * VildaLabPendingResult (drugi moduł tego pliku); bez podpiętego wpisu okno jest jak dotąd.
 * Zapis samego wyniku się nie zmienia. */
function OwPinChoice(result, host) {
  var pending = a.VildaLabPendingResult;
  if (!pending || typeof pending.choice !== 'function') return null;
  try {
    var date = u('labPinDate');
    return pending.choice(host, date && date.parentNode || null, { id: 'labPinPendingClose', testKeys: [result.testKey],
      names: [String(result.test || '').split('(')[0].trim()] });
  } catch (_) { return null; }
}
/* PR3: modal shows the same detached assessment that will be persisted.
 * Changing its date never silently reassesses the captured result. */
function Lh3ConvertedText(host) {
  var value = host.querySelector && host.querySelector('.lab-result-big-value');
  var unit = host.querySelector && host.querySelector('.lab-result-big-unit');
  if (value && unit) return String(value.textContent || '').trim() + ' ' + String(unit.textContent || '').trim();
  return String(host.textContent || '').trim().replace(/([0-9])(?=[A-Za-zµ%])/g, '$1 ');
}
function Lh3PinAssessment(result, host) {
  if (!Object.prototype.hasOwnProperty.call(result, 'assessment')) return;
  var preview = l.createElement('div');
  preview.id = 'labPinAssessment';
  var date = u('labPinDate');
  var dateNote = l.createElement('p');
  dateNote.id = 'labPinAssessmentDateNote';
  dateNote.setAttribute('role', 'status');
  dateNote.className = 'vilda-lab-pin-date-note';
  var before = date && date.parentNode;
  host.insertBefore(preview, before || host.firstChild);
  host.insertBefore(dateNote, before || host.firstChild);
  function refresh() {
    var assessment = result.assessment;
    var changed = !!date && date.value !== result.sampleDateISO;
    if (changed && a.VildaLabSnapshot) {
      var lab = { test: result.test, testKey: result.testKey, value: result.raw,
        unit: result.unitSym, assessment: assessment };
      assessment = a.VildaLabSnapshot.reconcile(lab, lab, result.sampleDateISO, date.value).assessment;
    }
    if (a.VildaLabAssessmentUI) a.VildaLabAssessmentUI.renderAssessment(preview, assessment, { compact: true });
    else preview.textContent = 'Podgląd zapisanej oceny jest niedostępny.';
    var input = result.assessment && result.assessment.evaluation && result.assessment.evaluation.input;
    dateNote.textContent = changed
      ? 'Zmiana daty unieważnia tę ocenę. Wynik zostanie zachowany; aby uzyskać ocenę dla innej daty, przelicz go ponownie z właściwym kontekstem.'
      : input && input.sampleDateISO
        ? 'Przypinasz wynik z kontekstem widocznym w chwili otwarcia okna.'
        : 'Ocena nie zawiera daty pobrania. Sprawdź proponowaną datę badania przed zapisaniem; nie uzupełnia ona kontekstu utrwalonej oceny.';
  }
  if (date) { date.addEventListener('input', refresh); date.addEventListener('change', refresh); }
  refresh();
}
var s=null;function g(){s&&(s.remove(),s=null)}function Lh2SampleDate(t){var e=t.assessment&&t.assessment.evaluation&&t.assessment.evaluation.input,n=e&&e.sampleDateISO;return typeof n==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(n)?n:D()}function V(){g();var t=L(),e=E(),n=S();if(!(!t||!e||!n)){Lh2CaptureAssessment(t),HrCaptureReference(t,e),RrCaptureRange(t),t.sampleDateISO=Lh2SampleDate(t);try{a.VildaSession&&typeof a.VildaSession.ensureAuthLoaded=="function"&&a.VildaSession.ensureAuthLoaded()}catch{}var i=R(),r=j();s=l.createElement("div"),s.id="labPinOverlay",s.style.cssText="position:fixed;left:0;right:0;top:0;bottom:"+r+"px;background:rgba(8,30,35,0.42);z-index:2000020;display:flex;align-items:center;justify-content:center;padding:16px;";var o=l.createElement("div");o.style.cssText="background:#fff;border-radius:14px;max-width:420px;width:100%;max-height:100%;overflow-y:auto;padding:16px;box-sizing:border-box;font-family:inherit;",o.innerHTML='<div style="font-size:1rem;font-weight:600;color:#0f2b33;margin:0 0 12px;">Przypnij wynik \xB7 '+m(n.name)+'</div><div style="background:#EEEDFE;border-left:3px solid #5856D6;border-radius:0 9px 9px 0;padding:9px 12px;margin:0 0 12px;"><div style="font-size:0.92rem;font-weight:600;color:#26215C;">'+m(t.test)+": "+m(t.raw)+" "+m(t.unitFrom)+" = "+m(t.converted)+'</div><div style="font-size:0.74rem;color:#534AB7;margin-top:2px;">kategoria: Badanie'+(i?" \xB7 kotwica: wizyta "+m(z(i)):" \xB7 bez kotwicy wieku (uzupe\u0142nij wiek na stronie g\u0142\xF3wnej)")+'</div></div><div style="margin:0 0 10px;"><label style="display:block;font-size:0.76rem;color:#5b6672;margin-bottom:4px;" for="labPinDate">Data badania</label><input type="date" id="labPinDate" value="'+t.sampleDateISO+'" style="width:100%;box-sizing:border-box;border:1px solid #cfe3e6;border-radius:9px;padding:8px 10px;font-size:16px;font-family:inherit;color:#0f2b33;background:#fff;" /></div><div style="margin:0 0 14px;"><label style="display:block;font-size:0.76rem;color:#5b6672;margin-bottom:4px;" for="labPinComment">Komentarz (opcjonalnie)</label><input type="text" id="labPinComment" maxlength="300" placeholder="np. kontrola po zmianie dawki" style="width:100%;box-sizing:border-box;border:1px solid #cfe3e6;border-radius:9px;padding:8px 10px;font-size:16px;font-family:inherit;color:#0f2b33;background:#fff;" /></div><p id="labPinErr" style="display:none;color:#C2271D;font-size:0.78rem;margin:0 0 10px;"></p><div style="display:flex;justify-content:flex-end;gap:8px;"><button type="button" id="labPinCancel" style="background:#fff;border:1px solid #d7e9ec;color:#5b6672;border-radius:9px;padding:8px 14px;font-size:0.85rem;cursor:pointer;font-family:inherit;">Anuluj</button><button type="button" id="labPinSave" style="background:#00838d;border:0;color:#fff;border-radius:9px;padding:8px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;">Zapisz do karty</button></div>',s.appendChild(o),l.body.appendChild(s),Lh3PinAssessment(t,o),HrPinReference(t,o),RrPinRange(t,o);var OwChoice=OwPinChoice(t,o);s.addEventListener("click",function(d){d.target===s&&g()}),u("labPinCancel").addEventListener("click",g),u("labPinSave").addEventListener("click",function(){A(t,e,i,OwChoice)})}}function m(t){return String(t??"").replace(/[&<>"']/g,function(e){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[e]})}function h(t){var e=u("labPinErr");e&&(e.textContent=t,e.style.display="block")}function T(t){return new Promise(function(e){var n=Date.now();(function i(){var r=a.VildaVault;if(r&&typeof r.savePatientNote=="function"){e(r);return}if(Date.now()-n>t){e(null);return}setTimeout(i,120)})()})}async function A(t,e,n,OwChoice){var i=u("labPinSave");i&&(i.disabled=!0,i.textContent="Zapisuj\u0119\u2026");try{try{a.VildaSession&&typeof a.VildaSession.ensureAuthLoaded=="function"&&a.VildaSession.ensureAuthLoaded()}catch{}var r=await T(5e3);if(!r){h("Modu\u0142 danych nie za\u0142adowa\u0142 si\u0119 \u2014 od\u015Bwie\u017C stron\u0119.");return}if(typeof r.isUnlocked!="function"||!r.isUnlocked()){h("Zaloguj si\u0119, aby przypi\u0105\u0107 wynik do karty pacjenta.");return}var o=null;try{o=await r.getPatient(e)}catch{o=null}if(!o){h('Nie znalaz\u0142em pacjenta w bazie \u2014 wczytaj go ponownie z listy \u201EPacjenci".');return}var d=u("labPinDate"),y=u("labPinComment"),w=d&&/^\d{4}-\d{2}-\d{2}$/.test(d.value)?d.value:D(),P=y?String(y.value||"").trim():"",C=t.raw+" "+t.unitFrom+" = "+t.converted,p={patientId:e,title:t.test+": "+t.raw+" "+t.unitFrom,body:"= "+t.converted+(P?`
`+P:""),category:"wynik-badania",clinicalDateISO:w,labResult:{test:t.test,value:Object.prototype.hasOwnProperty.call(t,"assessment")||Object.prototype.hasOwnProperty.call(t,"hormoneReference")?t.raw:C}};Object.prototype.hasOwnProperty.call(t,"assessment")&&(p.labResult.assessment=a.VildaLabSnapshot&&typeof a.VildaLabSnapshot.normalize==="function"?a.VildaLabSnapshot.normalize(t.assessment):{schemaVersion:1,status:"unavailable",reasonCodes:["snapshot_helper_unavailable"],evaluation:null}),t.testKey&&(p.labResult.testKey=t.testKey),t.valueNum!=null&&(p.labResult.valueNum=t.valueNum),t.unitSym&&(p.labResult.unit=t.unitSym),Object.prototype.hasOwnProperty.call(t,"assessment")&&a.VildaLabSnapshot&&typeof a.VildaLabSnapshot.reconcile==="function"&&(p.labResult=a.VildaLabSnapshot.reconcile(p.labResult,p.labResult,t.sampleDateISO,w)),Object.prototype.hasOwnProperty.call(t,"hormoneReference")&&(p.labResult.hormoneReference=HrReferenceLab(t,w).hormoneReference),Object.prototype.hasOwnProperty.call(t,"range")&&a.VildaLabRangeSnapshot&&(p.labResult.range=a.VildaLabRangeSnapshot.normalize(t.range)),n&&(p.linkedAgeMonths=n),await r.savePatientNote(p),g();if(OwChoice&&a.VildaLabPendingResult&&typeof a.VildaLabPendingResult.commit=="function")try{await a.VildaLabPendingResult.commit(OwChoice,r)}catch{}try{var k=u("labToast");k&&(k.textContent="\u2713 Przypi\u0119to do karty: "+t.test+(n?" (wizyta "+z(n)+")":""),k.classList.add("is-visible"),setTimeout(function(){k.classList.remove("is-visible")},2400))}catch{}}catch(b){h("Nie uda\u0142o si\u0119 zapisa\u0107: "+(b&&b.message?b.message:b))}finally{i&&(i.disabled=!1,i.textContent="Zapisz do karty")}}function I(){["labSubstance","labValue","labUnit","labUnitTarget"].forEach(function(e){var n=u(e);n&&(n.addEventListener("input",c),n.addEventListener("change",c))});var t=u("labResultBig");t&&typeof a.MutationObserver=="function"&&new a.MutationObserver(c).observe(t,{childList:!0,characterData:!0,subtree:!0}),l.addEventListener("vilda:session-changed",c),l.addEventListener("vilda:auth-loaded",c),l.addEventListener("vilda:patient-loaded",c),c(),setTimeout(c,1200)}l.readyState==="loading"?l.addEventListener("DOMContentLoaded",I):I()})(window);

/* Oczekujący wynik w Jednostkach lab. (P-OCZEKUJACE-WYNIKI, decyzje właściciela 2026-11-15).
 *
 * Osobny moduł (własne IIFE) w pliku okna przypięcia: nowy plik oznaczałby dodatkowe żądanie przy instalacji
 * aplikacji (budżet żądań service workera), a moduł i tak służy przypięciu wyniku. Ten sam wzorzec co
 * VildaResultDetailsDialog w vilda_lab_result_chart.js.
 *
 * „Oczekujący wynik” to wpis kategorii „Badanie” założony w Terminarzu (termin albo „Czekam na wynik”),
 * bez wartości i niewykonany. Zakładka „Badania” otwiera Jednostki lab. z takim wpisem
 * (?oczekujacy=<id notatki>). Wynik liczbowy zapisuje się wtedy jak każdy przypięty wynik — z oceną —
 * a wpis zostaje oznaczony jako wykonany: vault.completePatientNote, ta sama funkcja, którą zakładka
 * „Badania” zamykała wpis po ręcznym „Wpisz wynik” (decyzja 6.11). „Cofnij zamknięcie” działa tylko,
 * dopóki wpis jest w stanie z tego zamknięcia.
 *
 * Moduł trzyma jeden podpięty wpis, rysuje pasek pod tytułem karty (#labPendingStrip) i daje oknu
 * przypięcia (pierwszy moduł tego pliku) oraz pakietowi badań (vilda_lab_packages.js) znacznik „Zamknij
 * oczekujący wynik”. Niczego nie ocenia i nie zmienia zapisywanego wyniku. Nazwy wpisanej odręcznie nie
 * dopasowuje do badania: o tym, czy wpis czeka i czy ma badanie z listy przelicznika, rozstrzyga
 * VildaLabHistory.pendingItem (te same warunki co zakładka „Badania”).
 *
 * window.VildaLabPendingResult:
 *   targetNoteId(location)            id wpisu z adresu (?oczekujacy= albo #oczekujacy=) albo null
 *   defaultChoice(pending, testKeys)  domyślny stan znacznika: { checked, mismatch }
 *   start()                           wiąże pasek i zdarzenia strony (samo, po załadowaniu skryptu)
 *   current()                         podpięty wpis albo null
 *   attach(noteId) → Promise          podpina wpis po sprawdzeniu w sejfie; detach() odpina
 *   choice(host, before, options)     rysuje znacznik; zwraca { pending, element, checked(), update(keys) } albo null
 *   commit(choice, vault) → Promise   po zapisie wyniku: zaznaczony znacznik zamyka wpis; nigdy nie odrzuca
 * Zmianę stanu ogłasza zdarzenie dokumentu „vilda:lab-pending-result-changed”.
 *
 * Opis: docs/clinical/ALGORITHMS.md, „P-OCZEKUJACE-WYNIKI”; docs/LAB_HISTORIA_WYNIKOW_PLAN.md, decyzja 6.35.
 */
(function (root) {
  'use strict';

  var PARAM = 'oczekujacy';
  var EVENT = 'vilda:lab-pending-result-changed';
  var VAULT_WAIT_MS = 5000;
  var TEXT = {
    attached: 'Po przypięciu wyniku ten wpis zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach.',
    detach: 'Odłącz',
    choice: 'Zamknij oczekujący wynik: ',
    choiceOn: 'Wynik zapisze się w Badaniach jak każdy przypięty wynik, a oczekujący wynik zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach. Odznacz, żeby dalej czekał.',
    choiceOff: 'Oczekujący wynik zostanie otwarty i dalej będzie wracać w Przypomnieniach.',
    unavailable: 'Ten oczekujący wynik jest już zamknięty albo nie należy do wczytanego pacjenta.',
    undo: 'Cofnij zamknięcie',
    open: 'Otwórz Badania →',
    dismiss: 'Ukryj komunikat'
  };

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  // Id wpisu z adresu. Sam odczyt: czy wpis istnieje, czeka i należy do pacjenta, sprawdza attach() w sejfie.
  function targetNoteId(target) {
    try {
      var search = new URLSearchParams(target && target.search || '');
      var hash = new URLSearchParams(String(target && target.hash || '').replace(/^#/, ''));
      var id = text(search.get(PARAM) || hash.get(PARAM) || '');
      return id && id.length <= 200 && !/\s/.test(id) ? id : null;
    } catch (_) { return null; }
  }

  // Domyślnie znacznik jest zaznaczony. Odznaczony tylko wtedy, gdy aplikacja wie, że zapisywany wynik jest
  // innym badaniem: wpis ma badanie z listy przelicznika (seriesKey), a wśród zapisywanych wyników go nie ma.
  // Przy nazwie wpisanej odręcznie (seriesKey null) i bez żadnego wyniku do zapisu niczego nie rozstrzyga.
  function defaultChoice(pending, testKeys) {
    var expected = pending && pending.seriesKey || null;
    var keys = (Array.isArray(testKeys) ? testKeys : []).filter(Boolean);
    var mismatch = !!expected && keys.length > 0 && keys.indexOf(expected) === -1;
    return { checked: !mismatch, mismatch: mismatch };
  }

  function create(win) {
    var doc = win.document;
    var state = { pending: null, notice: null, request: 0, wanted: null };
    var strip = null, started = false;

    function node(tag, className, content) {
      var element = doc.createElement(tag);
      if (className) element.className = className;
      if (content != null) element.textContent = content;
      return element;
    }
    function add(parent, tag, className, content) { return parent.appendChild(node(tag, className, content)); }
    function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
    function button(parent, className, label, onClick) {
      var element = add(parent, 'button', className, label);
      element.type = 'button';
      element.addEventListener('click', onClick);
      return element;
    }

    function patientId() {
      try { return win._vildaCurrentPatientId || (win.sessionStorage && win.sessionStorage.getItem('vildaCurrentPatientId')) || null; }
      catch (_) { return null; }
    }
    function model() { return win.VildaLabHistory || null; }
    function converter() { return win.LabUnitConverter || null; }
    function formatDate(iso) {
      var m = model();
      return m && typeof m.formatDate === 'function' ? m.formatDate(iso) : String(iso || '');
    }
    function pendingOf(note) {
      var m = model();
      return note && m && typeof m.pendingItem === 'function' ? m.pendingItem(note, converter()) : null;
    }
    // Krótka nazwa badania z listy przelicznika (bez dopisku w nawiasie), np. „TSH”.
    function testName(key) {
      var conv = converter();
      if (!key || !conv || typeof conv.list !== 'function') return '';
      try {
        var list = conv.list() || [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === key) return String(list[i].label || '').split('(')[0].trim();
      } catch (_) { return ''; }
      return '';
    }
    function quoted(pending) { return pending && pending.title ? ' „' + pending.title + '”' : ''; }
    function toast(message) {
      try {
        var element = doc.getElementById('labToast');
        if (!element) return;
        element.textContent = message;
        element.classList.add('is-visible');
        win.setTimeout(function () { element.classList.remove('is-visible'); }, 3200);
      } catch (_) { /* komunikat pomocniczy */ }
    }
    function announce() {
      try { doc.dispatchEvent(new win.CustomEvent(EVENT, { detail: { attached: !!state.pending } })); } catch (_) { /* brak CustomEvent */ }
    }

    // Sejf załadowany i odblokowany: zaraz po otwarciu strony skrypt sejfu już bywa, a sesja jeszcze wraca.
    function waitForVault(timeout) {
      try { if (win.VildaSession && typeof win.VildaSession.ensureAuthLoaded === 'function') win.VildaSession.ensureAuthLoaded(); } catch (_) { /* odczyt sprawdzi sejf */ }
      return new Promise(function (resolve) {
        var since = Date.now();
        (function poll() {
          var vault = win.VildaVault, unlocked;
          try { unlocked = !!vault && typeof vault.getPatientNote === 'function' && typeof vault.isUnlocked === 'function' && vault.isUnlocked(); } catch (_) { unlocked = false; }
          if (unlocked) { resolve(vault); return; }
          if (Date.now() - since > timeout) { resolve(null); return; }
          win.setTimeout(poll, 120);
        })();
      });
    }

    // Adres strony samodzielnej przestaje wskazywać wpis, który odpięto albo zamknięto — odświeżenie strony
    // nie podpina go ponownie. W ramce powłoki adres należy do powłoki (cel przychodzi zdarzeniem).
    function forgetTarget() {
      try {
        if (doc.documentElement.classList.contains('vilda-embedded') || !win.history || typeof win.history.replaceState !== 'function') return;
        var url = new URL(win.location.href);
        if (!url.searchParams.has(PARAM)) return;
        url.searchParams.delete(PARAM);
        win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
      } catch (_) { /* adres zostaje */ }
    }

    function openCard() {
      var pid = patientId();
      if (!pid) return;
      var shell = null;
      try { if (win.VildaShell && typeof win.VildaShell.openPatientCardInStart === 'function') shell = win.VildaShell; } catch (_) { shell = null; }
      try {
        if (!shell && win.parent && win.parent !== win && win.parent.VildaShell && typeof win.parent.VildaShell.openPatientCardInStart === 'function') shell = win.parent.VildaShell;
      } catch (_) { shell = null; }
      if (shell) { shell.openPatientCardInStart(pid, { activeTab: 'lab' }); return; }
      var session = win.VildaSession;
      var ready = session && typeof session.ensureAuthLoaded === 'function' ? session.ensureAuthLoaded() : null;
      Promise.resolve(ready).then(function () {
        var ui = win.VildaAuthUI;
        if (ui && typeof ui.showPatientCard === 'function') ui.showPatientCard(pid, null, null, { activeTab: 'lab' });
      }).catch(function () { /* karta niedostępna */ });
    }

    function noticeText(notice) {
      var name = quoted(notice.pending);
      return {
        closed: 'Oczekujący wynik' + name + ' oznaczony jako wykonany.',
        'close-error': 'Wynik zapisany, ale nie udało się oznaczyć oczekującego wyniku' + name + ' jako wykonanego — zrób to w Przypomnieniach.',
        'close-stale': 'Wynik zapisany. Oczekujący wynik' + name + ' został już zamknięty albo zmieniony gdzie indziej — sprawdź go w Przypomnieniach.',
        'undo-error': 'Nie udało się cofnąć zamknięcia — zrób to w Przypomnieniach.',
        'undo-stale': 'Nie cofnięto: oczekujący wynik' + name + ' zmienił się w międzyczasie — sprawdź go w Przypomnieniach.'
      }[notice.kind] || '';
    }

    function draw() {
      if (!strip) return;
      clear(strip);
      var pending = state.pending, notice = state.notice;
      strip.hidden = !pending && !notice;
      strip.className = 'lab-pending-strip' + (notice ? ' is-notice is-' + notice.kind : '');
      if (notice) strip.setAttribute('role', 'status'); else strip.removeAttribute('role');
      strip.setAttribute('data-note-id', pending ? pending.noteId : notice && notice.pending ? notice.pending.noteId : '');
      if (notice) {
        add(strip, 'span', 'lab-pending-text', noticeText(notice));
        var actions = add(strip, 'span', 'lab-pending-actions');
        if (notice.kind === 'closed') button(actions, 'lab-pending-btn lab-pending-undo', TEXT.undo, function () { undo(notice); });
        button(actions, 'lab-pending-btn lab-pending-open', TEXT.open, openCard);
        var dismiss = button(actions, 'lab-pending-dismiss', '×', function () { state.notice = null; draw(); });
        dismiss.setAttribute('aria-label', TEXT.dismiss);
        return;
      }
      if (!pending) return;
      var info = add(strip, 'div', 'lab-pending-info');
      var line = add(info, 'span', 'lab-pending-title', 'Oczekujący wynik: ');
      add(line, 'strong', '', pending.title || 'Zlecone badanie');
      if (pending.dueDateISO) add(line, 'span', 'lab-pending-muted', ' · termin ' + formatDate(pending.dueDateISO));
      add(info, 'span', 'lab-pending-sub', TEXT.attached);
      button(strip, 'lab-pending-btn lab-pending-detach', TEXT.detach, function () { detach(); });
    }
    function changed() { draw(); announce(); }

    function attach(noteId) {
      noteId = text(noteId);
      if (!noteId) return Promise.resolve(null);
      // Powłoka doręcza cel przy każdym jawnym wejściu: ten sam wpis podpięty drugi raz nie zmienia niczego.
      if (state.pending && state.pending.noteId === noteId) return Promise.resolve(state.pending);
      // Zaraz po otwarciu strony pacjent i sejf jeszcze wracają z sesji: prośba zostaje i jest ponawiana przy
      // zdarzeniach konta (retry), aż wpis da się sprawdzić w sejfie.
      state.wanted = noteId;
      var request = ++state.request, pid = patientId();
      if (!pid) return Promise.resolve(null);
      return waitForVault(VAULT_WAIT_MS).then(function (vault) {
        if (!vault) return undefined;
        return Promise.resolve(vault.getPatientNote(noteId)).catch(function () { return null; });
      }).then(function (note) {
        if (request !== state.request) return state.pending;
        // Bez sejfu (niezalogowany albo sesja jeszcze wraca) nie ma czego podpinać ani o czym informować.
        if (note === undefined) return null;
        state.wanted = null;
        var item = pendingOf(note);
        if (!item || note.patientId !== pid || patientId() !== pid) { toast(TEXT.unavailable); forgetTarget(); return null; }
        state.pending = { noteId: item.noteId, title: item.title, dueDateISO: item.dueDateISO, seriesKey: item.seriesKey, patientId: pid };
        state.notice = null;
        changed();
        return state.pending;
      });
    }
    function retry() {
      if (state.wanted && !state.pending) attach(state.wanted);
    }
    function detach() {
      state.request++;
      state.wanted = null;
      if (!state.pending && !state.notice) return;
      state.pending = null;
      state.notice = null;
      forgetTarget();
      changed();
    }
    // Wpis i komunikat należą do pacjenta, dla którego powstały: po zmianie pacjenta znikają.
    function patientChanged() {
      var pid = patientId(), stale = false;
      if (state.pending && state.pending.patientId !== pid) { state.request++; state.pending = null; stale = true; }
      if (state.notice && (!state.notice.pending || state.notice.pending.patientId !== pid)) { state.notice = null; stale = true; }
      if (stale) changed();
      retry();
    }

    function choice(host, before, options) {
      var pending = state.pending;
      if (!pending || !host) return null;
      options = options || {};
      var box = node('div', 'lab-pending-choice');
      var label = add(box, 'label', 'lab-pending-choice-label');
      var input = add(label, 'input', 'lab-pending-choice-input');
      input.type = 'checkbox';
      input.id = options.id || 'labPendingClose';
      var caption = add(label, 'span', 'lab-pending-choice-text', TEXT.choice + (pending.title || 'Zlecone badanie'));
      if (pending.dueDateISO) add(caption, 'span', 'lab-pending-muted', ' · termin ' + formatDate(pending.dueDateISO));
      var help = add(box, 'span', 'lab-pending-choice-help');
      help.id = input.id + 'Help';
      input.setAttribute('aria-describedby', help.id);
      var touched = false, mismatch = false, names = [];
      function paint() {
        box.classList.toggle('is-mismatch', mismatch && !input.checked);
        if (mismatch && !input.checked) {
          var expected = testName(pending.seriesKey) || 'innego badania';
          help.textContent = 'Oczekujący wynik dotyczy ' + expected + ', a ' + (names.length === 1
            ? 'przypinany wynik to ' + names[0] : 'wśród zapisywanych wyników go nie ma') + '. Zaznacz, jeśli mimo to chcesz go zamknąć.';
        } else help.textContent = input.checked ? TEXT.choiceOn : TEXT.choiceOff;
      }
      // Domyślny stan liczy się z badań, które zostaną zapisane; własny wybór lekarza zostaje.
      function update(testKeys, testNames) {
        var decision = defaultChoice(pending, testKeys);
        mismatch = decision.mismatch;
        names = (Array.isArray(testNames) ? testNames : []).filter(Boolean);
        if (!touched) input.checked = decision.checked;
        paint();
      }
      input.addEventListener('change', function () { touched = true; paint(); });
      host.insertBefore(box, before || null);
      update(options.testKeys, options.names);
      return { pending: pending, element: box, checked: function () { return !!input.checked; }, update: update };
    }

    // Po zapisie wyniku. Zaznaczony znacznik: wpis czytany świeżo z sejfu i — jeśli nadal czeka — oznaczany jako
    // wykonany. Błąd zamknięcia nie cofa zapisanego wyniku: komunikat odsyła do Przypomnień. Nigdy nie odrzuca.
    function commit(chosen, vault) {
      var pending = chosen && chosen.pending;
      if (!pending || state.pending !== pending || typeof chosen.checked !== 'function' || !chosen.checked()) return Promise.resolve({ closed: false });
      state.request++;
      state.wanted = null;
      return Promise.resolve().then(function () {
        if (!vault || typeof vault.completePatientNote !== 'function' || typeof vault.getPatientNote !== 'function') throw new Error('Sejf niedostępny');
        return vault.getPatientNote(pending.noteId);
      }).then(function (note) {
        if (!note || note.patientId !== pending.patientId || !pendingOf(note)) {
          state.notice = { kind: 'close-stale', pending: pending };
          return { closed: false, stale: true };
        }
        return Promise.resolve(vault.completePatientNote(pending.noteId)).then(function () {
          return vault.getPatientNote(pending.noteId);
        }).then(function (saved) {
          // Znacznik tego zamknięcia: „Cofnij” działa tylko, dopóki wpis jest w tym samym stanie.
          state.notice = { kind: 'closed', pending: pending, completedAtISO: saved && saved.completedAtISO || null };
          return { closed: true };
        });
      }).catch(function () {
        state.notice = { kind: 'close-error', pending: pending };
        return { closed: false, error: true };
      }).then(function (result) {
        state.pending = null;
        forgetTarget();
        changed();
        return result;
      });
    }
    // uncompletePatientNote czyści też niestawienie, więc cofamy tylko zamknięcie zrobione tutaj i tylko wtedy,
    // gdy nikt go potem nie zmienił (inna karta, synchronizacja). Po cofnięciu wpis jest znów podpięty.
    function undo(notice) {
      var pending = notice.pending, vault = win.VildaVault;
      Promise.resolve().then(function () {
        if (!vault || typeof vault.uncompletePatientNote !== 'function') throw new Error('Sejf niedostępny');
        return vault.getPatientNote(pending.noteId);
      }).then(function (note) {
        if (!note || !notice.completedAtISO || note.completedAtISO !== notice.completedAtISO || note.noShowAtISO) {
          state.notice = { kind: 'undo-stale', pending: pending };
          return;
        }
        return Promise.resolve(vault.uncompletePatientNote(pending.noteId)).then(function () {
          state.notice = null;
          if (patientId() === pending.patientId) state.pending = pending;
          toast('Cofnięto — oczekujący wynik' + quoted(pending) + ' znów czeka.');
        });
      }).catch(function () {
        state.notice = { kind: 'undo-error', pending: pending };
      }).then(changed);
    }

    function apply(target) {
      var id = targetNoteId(target);
      if (id) attach(id);
    }
    function start() {
      if (started) return;
      strip = doc.getElementById('labPendingStrip');
      if (!strip) return;
      started = true;
      win.addEventListener('vilda:shell-navigate-target', function (event) {
        var href = event && event.detail && event.detail.href;
        if (typeof href !== 'string') return;
        try {
          var target = new URL(href, win.location.href);
          if (target.origin === win.location.origin && target.pathname === win.location.pathname) apply(target);
        } catch (_) { /* adres spoza strony */ }
      });
      ['vilda:session-changed', 'vilda:patient-loaded'].forEach(function (type) { doc.addEventListener(type, patientChanged); });
      ['vilda:auth-loaded', 'vilda:auth-boot-settled'].forEach(function (type) { doc.addEventListener(type, retry); });
      win.addEventListener('vilda:user-state-cleared', detach);
      draw();
      apply(win.location);
    }

    return { start: start, current: function () { return state.pending; }, attach: attach, detach: detach, choice: choice, commit: commit };
  }

  var instance = null;
  function runtime() {
    if (!instance && root && root.document) instance = create(root);
    return instance;
  }
  var api = Object.freeze({
    version: '1.0.0',
    PARAM: PARAM,
    targetNoteId: targetNoteId,
    defaultChoice: defaultChoice,
    start: function () { var r = runtime(); if (r) r.start(); },
    current: function () { var r = runtime(); return r ? r.current() : null; },
    attach: function (noteId) { var r = runtime(); return r ? r.attach(noteId) : Promise.resolve(null); },
    detach: function () { var r = runtime(); if (r) r.detach(); },
    choice: function (host, before, options) { var r = runtime(); return r ? r.choice(host, before, options) : null; },
    commit: function (chosen, vault) { var r = runtime(); return r ? r.commit(chosen, vault) : Promise.resolve({ closed: false }); }
  });

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.VildaLabPendingResult = api;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', api.start);
      else api.start();
    }
  }
})(typeof window !== 'undefined' ? window : null);
