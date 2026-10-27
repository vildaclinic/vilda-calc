(function(){const B=typeof CENTILE_ZSCORES=="object"&&CENTILE_ZSCORES||{3:-1.8808,10:-1.281552,25:-.67448975,50:0,75:.67448975,90:1.281552,97:1.8808};/* P-DS-5: generator siatki DS nie ma juz wlasnego wzoru LMS, wlasnego interpolatora ani wlasnej konwersji kluczy. Wiersz L/M/S bierze ze wspolnego zestawu (window.VildaDsLMS, wszystko w miesiacach), a odwrotnosc wzoru liczy silnik (VildaBmi.xLms) — ta sama droga, co karta modulu i karta glowna. Bez silnika generator nie rysuje krzywych zamiast rysowac je po swojemu. */function Ts(){const T=typeof window<"u"?window.VildaBmi:null;return T&&typeof T.interpoluj=="function"&&typeof T.xLms=="function"?T:null}function y(e,n){const T=Ts();if(!T||!e)return null;const t=Object.keys(e).map(a=>parseFloat(a)).sort((a,c)=>a-c);if(!t.length)return null;const m=Math.min(t[t.length-1],Math.max(t[0],n));return T.interpoluj(e,m)||null}function N(e,n,t,i){const T=Ts();return T?T.xLms(i,[e,n,t]):null}const u=typeof window<"u"&&window.VildaDsLMS?window.VildaDsLMS:null;function R(e,n){if(!u)return null;const p=e==="M"?"M":"F";return n<=36?y(u.NIEMOWLE.WT[p],n):y(u.DZIECKO.WT[p],n)}function P(e,n){if(!u)return null;const p=e==="M"?"M":"F";return n<=36?y(u.NIEMOWLE.HT[p],Math.max(1,n)):y(u.DZIECKO.HT[p],n)}const w=[3,10,25,50,75,90,97];function F(e,n,t,i){const l={};return w.forEach(o=>{const s=B[o],r=[];for(let a=e;a<=n;a++){const c=i(t,a);r.push(c?N(c[0],c[1],c[2],s):null)}l[o]=r}),l}function I(e){let n=1/0,t=-1/0;Object.values(e).forEach(l=>{l.forEach(o=>{o!=null&&(o<n&&(n=o),o>t&&(t=o))})}),(!isFinite(n)||!isFinite(t))&&(n=0,t=1);const i=.05*(t-n);return n=Math.floor((n-i)/5)*5,t=Math.ceil((t+i)/5)*5,[n,t]}function O(e,n,t,i){if(!Number.isFinite(i))return-1;const l=t[0];if(!n[l])return-1;const o=n[l].length;if(i<0||i>=o)return-1;const s=t.map(r=>n[r][i]);for(let r=0;r<s.length-1;r++){const a=s[r],c=s[r+1];if(a==null||c==null)continue;const m=Math.min(a,c),d=Math.max(a,c);if(e>=m&&e<=d)return r}return-1}function C(e,n,t,i){return typeof findHighlightBandSafe=="function"?findHighlightBandSafe(e,n,t,i):O(e,n,t,i)}async function W(){const e=document.getElementById("age"),n=document.getElementById("ageMonths"),t=document.getElementById("sex"),i=document.getElementById("weight"),l=document.getElementById("height");if(!e||!t||!i||!l){alert("Wprowad\u017A wiek, p\u0142e\u0107, wag\u0119 i wzrost.");return}const o=parseFloat(e.value)||0,s=n&&parseFloat(n.value)||0,r=Math.round(o*12+s);if(!(r>=0&&r<=240)){alert("Siatka DS dost\u0119pna dla wieku 0\u201320 lat.");return}const a=t.value==="M"?"M":"F",c=parseFloat(i.value),m=parseFloat(l.value),d=0,M=240,p=F(d,M,a,R),S=F(d,M,a,P);const[Y,U]=I(p),[Z,q]=I(S),f=document.createElement("canvas");f.width=2480,f.height=3508;const h=f.getContext("2d");h.fillStyle="#ffffff",h.fillRect(0,0,f.width,f.height);const D={x:80,y:40,w:f.width-160,h:Math.floor(f.height/2)-100},_={x:80,y:Math.floor(f.height/2)+60,w:f.width-160,h:Math.floor(f.height/2)-120},z=Number.isFinite(m)?C(m,S,w,r-d):-1;drawCentileGrid(h,{x:D.x,y:D.y,w:D.w,h:D.h,curves:S,minY:Z,maxY:q,userVal:Number.isFinite(m)?m:void 0,userAgeMonths:r,title:"Wzrost (cm)",units:"cm",percentiles:w,highlightBandIdx:z,minX:d,maxX:M});const X=Number.isFinite(c)?C(c,p,w,r-d):-1;drawCentileGrid(h,{x:_.x,y:_.y,w:_.w,h:_.h,curves:p,minY:Y,maxY:U,userVal:Number.isFinite(c)?c:void 0,userAgeMonths:r,title:"Waga (kg)",units:"kg",percentiles:w,highlightBandIdx:X,minX:d,maxX:M}),h.save(),h.font="30px sans-serif",h.fillStyle="#555555",h.textAlign="right",h.textBaseline="bottom";const H=f.height-80+50;h.fillText("Dane DS: Zemel et al., Pediatrics 2015 (0\u201320 lat)",f.width-120,H),h.textAlign="left",h.fillText("vildaclinic.pl",120,H),h.restore();const J=f.toDataURL("image/jpeg",1);if(typeof window<"u"&&typeof window.vildaEnsurePdfLibraries=="function")try{await window.vildaEnsurePdfLibraries()}catch{}const b=typeof window<"u"&&typeof window.vildaRequireFunction=="function"?window.vildaRequireFunction("jspdf.jsPDF",{moduleName:"inline-pdf-export"}):window.jspdf&&typeof window.jspdf.jsPDF=="function"?window.jspdf.jsPDF:null;if(!b){alert("Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.");return}const x=new b({orientation:"portrait",unit:"mm",format:"a4"});x.addImage(J,"JPEG",0,0,210,297);const V=x.output("blob"),K=URL.createObjectURL(V);window.open(K,"_blank")}
/* Read-only access to the existing Zemel PDF producer. F/R/P/I above remain
 * the sole curve/range implementation, including its documented 36-month
 * infant/child boundary. No canvas, active form or patient globals are read.
 */
if (typeof window !== 'undefined' && !window.VildaDsCentileModels) {
  window.VildaDsCentileModels = Object.freeze({ build: function (args) {
    const input = args || {};
    if (!Ts() || !u || typeof collectPageMeasurementsInRange !== 'function') return null;
    const sex = input.sex === 'M' ? 'M' : 'F';
    const advanced = input.growthData || {};
    const age = Number(input.userAgeMonths);
    if (!Number.isFinite(age) || age < 0 || age > 240) return null;
    const points = collectPageMeasurementsInRange(0, 240, {
      currentAgeMonths: age, currentHeight: input.userHeight,
      currentWeight: input.userWeight, adv: advanced
    });
    function model(metric, lookup, values) {
      const curves = F(0, 240, sex, lookup);
      const bounds = I(curves);
      let minY = bounds[0], maxY = bounds[1];
      values.forEach(function (point) {
        const value = point[metric];
        if (!Number.isFinite(value) || value <= 0) return;
        minY = Math.min(minY, Math.max(0, Math.floor(value / 5) * 5));
        maxY = Math.max(maxY, Math.ceil(value / 5) * 5);
      });
      const value = metric === 'height' ? input.userHeight : input.userWeight;
      return { curves: curves, minY: minY, maxY: maxY, officialMaxY: bounds[1],
        minX: 0, maxX: 240, points: values, userVal: value, userAgeMonths: age,
        percentiles: w.slice(), highlightBandIdx: C(value, curves, w, age),
        title: metric === 'height' ? 'Wzrost (cm)' : 'Waga (kg)',
        units: metric === 'height' ? 'cm' : 'kg' };
    }
    return { source: 'DS', height: model('height', P, points.ptsH),
      weight: model('weight', R, points.ptsW) };
  } });
}

document.addEventListener("DOMContentLoaded",function(){const e=document.getElementById("generateDsCentileChart");e&&e.addEventListener("click",W)})})();
