
'use strict';
/* Educational hand-drawn anchors. These are NOT published serum measurements,
   percentiles, reference limits or normalized source-model predictions.
   x = schematic postnatal age in years (negative = prenatal segment),
   y = independent illustrative display scale per hormone. No medical engine. */
const maleAges=[-.75,-.60,-.48,-.32,-.13,0,.04,.085,.17,.33,.42,.5,.75,1,3,6,8,10,11,12,13,14,15,17,20,25,30,40,50,60,70,80,90];
const maleHormones=[
 {id:'lh',name:'LH',color:'#7842b0',values:[.015,.025,.27,.56,.32,.025,.36,.61,.55,.28,.12,.055,.022,.018,.013,.016,.023,.045,.085,.18,.36,.49,.57,.62,.63,.63,.63,.64,.67,.70,.74,.79,.84],copy:'Wczesny wzrost w minipuberty, wyciszenie w dzieciństwie i ponowny wzrost w pokwitaniu.'},
 {id:'fsh',name:'FSH',color:'#a77905',values:[.012,.02,.20,.42,.25,.027,.28,.49,.46,.26,.13,.068,.04,.037,.035,.04,.065,.11,.17,.28,.39,.47,.52,.55,.55,.55,.56,.59,.65,.71,.78,.85,.92],copy:'Po niemowlęcej fali stężenie jest niskie. Wzrasta podczas pokwitania, a w późniejszych latach może stopniowo rosnąć.'},
 {id:'t',name:'Testosteron',color:'#00838d',values:[.022,.29,.69,.66,.37,.028,.33,.56,.49,.27,.13,.064,.023,.016,.013,.016,.025,.042,.073,.19,.38,.62,.79,.94,1,.98,.95,.92,.92,.91,.90,.89,.87],copy:'W minipuberty wzrasta na krótko. W pokwitaniu rośnie ponownie i osiąga poziom typowy dla dorosłych; późniejszy przebieg jest zmienny.'},
 {id:'insl3',name:'INSL3',color:'#347fa5',dash:'6 5',values:[.014,.18,.59,.72,.53,.05,.34,.51,.46,.25,.11,.05,.025,.018,.014,.017,.025,.039,.065,.14,.27,.45,.62,.77,.84,.87,.86,.82,.77,.71,.64,.57,.50],copy:'Towarzyszy aktywności komórek Leydiga. Wzrasta w minipuberty i pokwitaniu, a w starszym wieku zwykle się obniża.'},
 {id:'amh',name:'AMH',color:'#ce6049',values:[.025,.42,.75,.78,.61,.49,.60,.73,.87,.97,1,.99,.97,.95,.90,.86,.80,.73,.66,.56,.40,.25,.16,.105,.085,.082,.078,.071,.065,.057,.050,.043,.037],copy:'Wysokie w niemowlęctwie i dzieciństwie. W pokwitaniu wyraźnie spada, mimo wzrostu testosteronu.'},
 {id:'inhb',name:'Inhibina B',color:'#34865c',values:[.012,.24,.50,.59,.42,.20,.43,.64,.84,1,.97,.96,.74,.55,.33,.30,.35,.47,.57,.69,.78,.83,.87,.91,.89,.88,.87,.85,.84,.83,.81,.79,.79],copy:'Szczyt niemowlęcy pojawia się później niż szczyt LH i testosteronu. W pokwitaniu rośnie ponownie; w dorosłości pozostaje względnie stabilna, z możliwym umiarkowanym spadkiem.'}
];
// Busch2022 source-specific mean peaks. Approximate timing only, not concentrations.
for(const h of maleHormones){
 const peakDay={fsh:11,lh:18,t:29,insl3:27}[h.id];
 if(peakDay)h.ages=maleAges.map(age=>age===.085?peakDay/365.25:age===.04&&h.id==='fsh'?5/365.25:age);
}
const maleStages=[
 {min:-.75,max:0,width:.14,name:'Przed urodzeniem',short:'Płód',color:'#f7efe3',title:'Życie płodowe · początek różnicowania',text:'Hormony jądra uczestniczą w różnicowaniu płciowym. Wczesna produkcja testosteronu nie zależy wyłącznie od LH.'},
 {min:0,max:1,width:.20,name:'Niemowlęctwo',short:'Niemowlę',color:'#eaf5f2',title:'Minipuberty · pierwsza fala aktywności',text:'FSH, LH, testosteron i INSL3 osiągają szczyty we wczesnych tygodniach. Inhibina B i AMH później, około 4.–5. miesiąca.'},
 {min:1,max:10,width:.17,name:'Dzieciństwo',short:'Dziecko',color:'#f0f5f8',title:'Dzieciństwo · różne zachowanie hormonów',text:'LH i testosteron pozostają niskie. AMH utrzymuje się wysoko, a inhibina B jest nadal obecna.'},
 {min:10,max:20,width:.17,name:'Pokwitanie',short:'Pokwitanie',color:'#edf4f9',title:'Pokwitanie · ponowna aktywacja osi',text:'Rosną gonadotropiny, testosteron i inhibina B. AMH wyraźnie maleje. Początek i tempo tych zmian są indywidualne.'},
 {min:20,max:60,width:.17,name:'Dorosłość',short:'Dorosły',color:'#f3f6ee',title:'Dorosłość · względnie stabilny przebieg',text:'Hormony utrzymują dorosły profil. Stężenia różnią się między osobami i zależą także od stanu zdrowia.'},
 {min:60,max:90,width:.15,name:'Starszy wiek',short:'Senior',color:'#f2eef8',title:'Starszy wiek · większe zróżnicowanie',text:'LH i FSH mogą rosnąć, a INSL3 i inhibina B maleć. Testosteron nie u każdego obniża się w ten sam sposób.'}
];
