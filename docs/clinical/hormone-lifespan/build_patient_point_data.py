"""Package factual central-concentration curves for educational patient points.

Sources are readable JSON extracts in evidence/patient-point; no source PDFs,
clinical reference limits, invented medians or cross-source bridges are packaged.
Run with --check to verify the checked-in data artifact.
"""
from pathlib import Path
import argparse
import json
import math

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / 'evidence' / 'patient-point'
OUTPUT = ROOT / 'population-reference-data.json'


def read(name):
    return json.loads((EVIDENCE / name).read_text(encoding='utf-8'))


def build():
    profiles = []

    def add(identifier, analyte, sex, points, minimum, maximum, source_label,
            url, method, population, statistic, approximate=False, **extra):
        interpolation = extra.pop('interpolation', 'pchip')
        profile = dict(id=identifier, analyte=analyte, sex=sex, minAge=minimum,
                       maxAge=maximum, points=points, sourceLabel=source_label,
                       url=url, method=method, population=population,
                       statistic=statistic, approximate=approximate,
                       unit={'lh':'IU/L','fsh':'IU/L','t':'nmol/L','inhb':'pg/mL',
                             'amh':'pmol/L','e2':'pmol/L','insl3':'ug/L'}[analyte],
                       interpolation=interpolation, **extra)
        assert len(points) >= 2
        assert all(math.isfinite(p['value']) and p['value'] >= 0 for p in points)
        assert all(points[i]['ageYears'] < points[i+1]['ageYears'] for i in range(len(points)-1))
        assert points[0]['ageYears'] <= minimum < maximum <= points[-1]['ageYears']
        assert interpolation in ('pchip', 'constant')
        if interpolation == 'constant':
            assert all(p['value'] == points[0]['value'] for p in points)
        profiles.append(profile)

    busch = read('busch2022-figure3-vector-medians.json')
    ids = {'testosterone':'t','inhibin_b':'inhb'}
    assay_ids = {
        'lh':['autodelfia','autodelfia-lh'], 'fsh':['autodelfia','autodelfia-fsh'],
        'inhb':['inhibin-b-gen-ii','beckman-inhibin-b-gen-ii'],
        'amh':['access-2','beckman-access-2'],
        't':['lc-ms/ms','lc-ms-ms','lcmsms'], 'insl3':['lc-ms/ms','lc-ms-ms','lcmsms']}
    for name, hormone in busch['hormones'].items():
        analyte = ids.get(name,name)
        points = [dict(ageYears=r[0]/365.25, value=r[1], eligible=r[4])
                  for r in hormone['daily'] if r[0] <= 366]
        add('busch2022-male-'+analyte, analyte,'male',points,7/365.25,1,
            'Busch 2022 · minipuberty','https://doi.org/10.1210/clinem/dgac115',
            hormone['assay'],'Zdrowi chłopcy urodzeni o czasie; Dania',
            'median',True,maxAgeExclusive=True,termOnly=True,
            compatibleAssayMethodIds=assay_ids[analyte],
            provenance={'figure':3,'doi':busch['source']['doi'],
                        'sha256':busch['source']['sha256'],
                        'model':'GAMLSS median; calibrated vector reading, not longitudinal mean',
                        'sourceSupportDays':[7,400],
                        'educationalDotReferenceFloor':hormone['educationalDotReferenceFloor'],
                        'floorRule':hormone['floorRule'],
                        'lodOrLoq':hormone['lodOrLoq'],
                        'participants':119,'postnatalSerumSamples':338},
            limitations=busch['limitations'])

    madsen = read('madsen2022-male-p50-lms.json')
    for analyte in ('lh','fsh'):
        hormone=madsen['hormones'][analyte]
        add('madsen2022-male-'+analyte,analyte,'male',
            [dict(ageYears=p['ageYears'],value=p['centralConcentration']) for p in hormone['points']],
            6,16,'Madsen 2022 · chłopcy','https://doi.org/10.1210/clinem/dgac155',
            hormone['assay'],'Bergen Growth Study 2; chłopcy, Norwegia','median',
            compatibleAssayMethodIds=['immulite-2000-xpi','siemens-immulite-2000-xpi'],
            provenance=madsen['source'],limitations=madsen['useConstraints'])

    zec=read('zec2012-fsh-group-medians.json')
    assert sum(row['participants'] for row in zec['rows']) == zec['fshParticipants']
    for row in zec['rows']:
        if not row['active']:
            continue
        assert row['tannerStage'] == 1 and row['medianOperator'] == '=' and not row['censored']
        minimum, maximum = row['applicationMinAge'], row['applicationMaxAge']
        assert row['minAge'] <= minimum < maximum <= row['maxAge']
        median=row['medianIuL']
        add('zec2012-'+row['sex']+'-fsh-age-'+str(row['minAge'])+'-'+str(row['maxAge']),
            'fsh',row['sex'],
            [dict(ageYears=minimum,value=median),dict(ageYears=maximum,value=median)],
            minimum,maximum,'Zec 2012 · FSH · przed pokwitaniem',zec['source']['url'],
            zec['assay']['method'],'Dzieci przed pokwitaniem (Tanner 1); Zagrzeb, Chorwacja',
            'group-median',interpolation='constant',maxAgeExclusive=True,
            requiredGonadalStage=1,
            compatibleAssayMethodIds=['roche-cobas-e411-fsh','roche-cobas-e-411-fsh'],
            ageGroup={'label':row['label'],'minAge':row['minAge'],'maxAge':row['maxAge'],
                      'n':row['participants'],'sourceUnit':'IU/L','sourceMedian':median,
                      'boundaryPolicy':'published-inclusive-lower-exclusive-upper',
                      'description':'Mediana całej grupy dzieci przed pokwitaniem (Tanner 1); nie opisuje zmian stężenia wewnątrz tego przedziału wieku.'},
            provenance={**zec['source'],'participants':zec['participants'],
                        'fshParticipants':zec['fshParticipants'],
                        'groupParticipants':row['participants'],
                        'sourceUnit':'IU/L','sourceToCanonicalFactor':1,
                        'sourceAgeBoundaryDefinition':zec['ageRouting']['sourceBoundaryDefinition'],
                        'ageRouting':zec['ageRouting']['applicationPolicy'],
                        'routingNote':row['routingNote'],
                        'assay':zec['assay']},
            limitations=zec['limitations'])

    testosterone=read('testosterone-model.json')
    coefficients=testosterone['formula']['coefficients']
    def testosterone_at(age):
        c=coefficients
        prediction=(c['a']+c['c']*age+c['e']*age**2+c['g']*age**3)/(1+c['b']*age+c['d']*age**2+c['f']*age**3)
        return 10**prediction-1
    testosterone_policy = json.loads((ROOT/'testosterone-reference-policy.json').read_text(encoding='utf-8'))
    assert testosterone_policy['kind'] == 'educational-source-selection'
    assert (testosterone_policy['analyte'], testosterone_policy['sex'], testosterone_policy['unit']) == ('t','male','nmol/L')
    assert testosterone_policy['interpolation']['method'] == 'pchip'
    assert testosterone_policy['interpolation']['valueScale'] == 'concentration-nmol-per-litre'
    kelsey_points = [dict(ageYears=i/10,value=testosterone_at(i/10)) for i in range(30,881)]
    madsen_t = madsen['hormones']['testosterone']
    assert [point['ageYears'] for point in madsen_t['points']] == list(range(6,19))
    assert madsen_t['unit'] == 'nmol/L'
    assert all(math.isclose(point['centralConcentration'], math.exp(point['M_logSIx1e6'])/1e6,
                            rel_tol=1e-14, abs_tol=0) for point in madsen_t['points'])
    assert all(point['centralConcentration'] > madsen_t['lowerLimitOfQuantification']
               for point in madsen_t['points'])
    walravens = read('walravens2025-male-total-testosterone-group-means.json')
    assert (walravens['analyte'], walravens['statistic'], walravens['unit']) == (
        'total-testosterone', 'arithmetic-group-mean', 'nmol/L')
    assert sum(row['participants'] for row in walravens['rows']) == walravens['participants'] == 1194
    assert len(walravens['rows']) == 7
    walravens_groups = {row['id']: row for row in walravens['rows']}
    routes = testosterone_policy['profiles']
    assert len(routes) == 9 and len({route['id'] for route in routes}) == 9
    assert [route['sourceGroup'] for route in routes if route['source'] == 'walravens2025'] == list(walravens_groups)
    for index, route in enumerate(routes):
        assert route['sourceDomain']['minAge'] <= route['minAge'] < route['maxAge'] <= route['sourceDomain']['maxAge']
        assert route['retainAllSourcePoints']
        if index:
            assert routes[index-1]['maxAge'] == route['minAge'] and routes[index-1]['maxAgeExclusive']
        routing = {'version':testosterone_policy['version'], 'source':route['source'],
                   'minAge':route['minAge'], 'maxAge':route['maxAge'],
                   'maxAgeExclusive':route['maxAgeExclusive'],
                   'sourceDomain':route['sourceDomain'], 'retainAllSourcePoints':True}
        if route['source'] == 'kelsey2014':
            # Retain the complete original nodes so the pediatric PCHIP
            # derivatives are unchanged by restricting patient applicability.
            add(route['id'],'t','male',[dict(point) for point in kelsey_points],
                route['minAge'],route['maxAge'],
                'Kelsey 2014/2015 · testosteron','https://doi.org/10.1371/journal.pone.0109346',
                testosterone['assay'],'Połączone badania zdrowych chłopców i mężczyzn','model-central',
                maxAgeExclusive=route['maxAgeExclusive'],
                compatibleAssayMethodIds=['lc-ms/ms','lc-ms-ms','lcmsms'],
                provenance={**testosterone['source'],'sourceRouting':routing},formula=testosterone['formula'],
                limitations=[note for note in testosterone['limits']
                             if not note.startswith('No interpolation or cross-source stitching has been authorized')],
                historicalResearchNotes=[note for note in testosterone['limits']
                                         if note.startswith('No interpolation or cross-source stitching has been authorized')])
        elif route['source'] == 'madsen2022':
            add(route['id'],'t','male',
                [dict(ageYears=point['ageYears'],value=point['centralConcentration']) for point in madsen_t['points']],
                route['minAge'],route['maxAge'],
                'Madsen 2022 · testosteron · chłopcy','https://doi.org/10.1210/clinem/dgac155',
                madsen_t['assay'],'Bergen Growth Study 2 + Fit Futures; chłopcy, Norwegia',
                'model-central',maxAgeExclusive=route['maxAgeExclusive'],
                compatibleAssayMethodIds=['lc-ms/ms','lc-ms-ms','lcmsms'],
                provenance={**madsen['source'],
                            'sourceCells':[point['sourceCells'] for point in madsen_t['points']],
                            'sourceLms':[{'ageYears':point['ageYears'],'L':point['L'],
                                          'M_logSIx1e6':point['M_logSIx1e6'],'S':point['S']}
                                         for point in madsen_t['points']],
                            'population':madsen['population'],
                            'transform':madsen['transform'],
                            'sourceRouting':routing,
                            'interpolation':testosterone_policy['interpolation'],
                            'lowerLimitOfQuantification':madsen_t['lowerLimitOfQuantification'],
                            'belowLoqModelHandling':{'rule':None,'reported':False,
                                'note':'No explicit below-LLOQ preprocessing rule was established in the article, supplementary tables or generic LMS recipe. No substitution or extra censoring threshold is invented here.'}},
                limitations=[*madsen['useConstraints'],
                    testosterone_policy['interpolation']['madsenBetweenNodeMeaning'],
                    'The model center is exp(M)/1e6 on the worksheet log-transformed scale, not an arithmetic mean of concentrations.',
                    'The lowest published p50 (age 6) is above the stated LLOQ 0.02 nmol/L; low-range precision is not the 4% quoted at 1.5–37 nmol/L.',
                    'Below-LLOQ preprocessing in the fitted source model was not explicitly reported in the reviewed materials; do not infer a zero or LLOQ/2 substitution.'])
        elif route['source'] == 'walravens2025':
            row = walravens_groups[route['sourceGroup']]
            assert route['id'] == 'walravens2025-male-t-' + row['id']
            assert all(route[key] == row[key] for key in ('minAge', 'maxAge', 'maxAgeExclusive'))
            assert route['sourceDomain'] == {
                'minAge': walravens['population']['minAge'],
                'maxAge': walravens['population']['maxAge']}
            assert row['minAge'] <= row['meanAge'] <= row['maxAge']
            mean = row['meanNmolL']
            add(route['id'], 't', 'male',
                [dict(ageYears=row['minAge'], value=mean),
                 dict(ageYears=row['maxAge'], value=mean)],
                row['minAge'], row['maxAge'],
                'Walravens 2025/2026 · testosteron · średnia grupy wieku',
                walravens['source']['url'], walravens['assay']['method'],
                'Europejscy mężczyźni; młodsze kohorty zdrowych i starsze kohorty populacyjne',
                'group-mean', interpolation='constant', maxAgeExclusive=row['maxAgeExclusive'],
                compatibleAssayMethodIds=['lc-ms/ms', 'lc-ms-ms', 'lcmsms'],
                meanAge=row['meanAge'], groupN=row['participants'],
                ageGroup={'label': row['label'], 'minAge': row['minAge'],
                          'maxAge': row['maxAge'], 'maxAgeExclusive': row['maxAgeExclusive'],
                          'meanAge': row['meanAge'], 'n': row['participants'],
                          'sourceUnit': 'nmol/L', 'sourceMean': mean,
                          'boundaryPolicy': 'published-decade-groups-limited-to-observed-age-support',
                          'description': 'Średnia arytmetyczna całej grupy wieku; nie jest medianą, normą ani stężeniem właściwym dla konkretnego roku życia.'},
                provenance={**walravens['source'], 'sourceRouting': routing,
                            'participants': walravens['participants'],
                            'groupParticipants': row['participants'],
                            'publishedMeanAge': row['meanAge'],
                            'sourceMean': mean, 'sourceSd': row['sdNmolL'],
                            'sourceUnit': 'nmol/L', 'sourceToCanonicalFactor': 1,
                            'sourceColumn': row['label'],
                            'sourcePopulation': walravens['population'],
                            'assay': walravens['assay'],
                            'ageRouting': walravens['ageRouting']},
                limitations=walravens['limitations'])
        else:
            raise ValueError('Unsupported testosterone source in routing policy')

    kelsey=read('kelsey2016-inhb-published-table.json')
    add('kelsey2016-male-inhb','inhb','male',
        [dict(ageYears=p['ageYears'],value=p['p50']) for p in kelsey['points'] if 1<=p['ageYears']<=7],
        1,6.1,'Kelsey 2016 · inhibina B','https://doi.org/10.1371/journal.pone.0153843',
        kelsey['assay'],'Połączone badania chłopców','median',maxAgeExclusive=True,
        compatibleAssayMethodIds=['oxford-bio-innovation-inhibin-b'],
        provenance={'doi':kelsey['doi'],'table':4,'sha256':kelsey['sourceSha256'],'license':kelsey['license']},
        limitations=kelsey['notes'])

    borelli=read('borelli2025-male-inhb-digitized.json')
    add('borelli2025-male-inhb','inhb','male',
        [dict(ageYears=p['ageYears'],value=p['approxMedianPgMl']) for p in borelli['points']],
        6.1,80,'Borelli-Kjær 2025 · inhibina B','https://doi.org/10.1210/clinem/dgae439',
        borelli['assay'],'Zdrowi chłopcy i mężczyźni; kohorty duńskie','median',True,
        compatibleAssayMethodIds=['oxford-bio-innovation-inhibin-b','inhibin-b-gen-ii','beckman-inhibin-b-gen-ii'],
        provenance={'doi':borelli['doi'],'figure':2,'sha256':borelli['sourceSha256'],
                    'digitizationTolerancePgMl':5,'participants':1818,'samples':2007},
        limitations=borelli['notes'])

    wang=read('wang2020-male-amh-group-medians.json')
    assert sum(row['participants'] for row in wang['rows']) == wang['participants']
    assert [row['ageGroupLabelYears'] for row in wang['rows'] if row['active']] == wang['ageRouting']['activeAgeGroupLabelsYears']
    for row in wang['rows']:
        if not row['active']:
            continue
        assert not row['medianConflict']
        median = row['agreedGroupMedianNgMl']
        assert median == row['table1MedianNgMl'] == row['table2MedianNgMl']
        age = row['ageGroupLabelYears']
        value = median / .1401
        add('wang2020-male-amh-age-'+str(age),'amh','male',
            [dict(ageYears=age,value=value),dict(ageYears=age+1,value=value)],
            age,age+1,'Wang 2020 · AMH · grupa wieku',wang['source']['url'],
            wang['assay']['method'],'Zdrowi chłopcy; Wuhan, Chiny','group-median',
            interpolation='constant',maxAgeExclusive=True,
            compatibleAssayMethodIds=['access-2','beckman-access-2'],
            ageGroup={'labelYears':age,'label':str(age)+'–<'+str(age+1)+' lat',
                      'minAge':age,'maxAge':age+1,'n':row['participants'],
                      'sourceUnit':'ng/mL','sourceMedian':median,
                      'boundaryPolicy':'application-completed-year-convention',
                      'description':'Mediana rocznej grupy wieku; nie opisuje zmian stężenia wewnątrz tego roku. Grupy dobieramy według ukończonych lat, zgodnie z rocznymi oznaczeniami tabel i położeniem punktów na rycinie; autorzy nie podają dokładnych granic grup. Porównanie nie uwzględnia stadium Tannera.'},
            provenance={**wang['source'],'participants':wang['participants'],
                        'groupParticipants':row['participants'],
                        'sourceUnit':'ng/mL','sourceToCanonicalFactor':1/.1401,
                        'sourceAgeBoundaryDefinition':None,
                        'ageRouting':wang['ageRouting']['applicationPolicy'],
                        'upperAgePolicy':wang['ageRouting']['upperAgePolicy']},
            limitations=wang['limitations'])

    tehrani=read('tehrani2017-male-amh-published-table.json')
    add('tehrani2017-male-amh','amh','male',
        [dict(ageYears=p['ageYears'],value=p['p50']/0.1401) for p in tehrani['points']],
        30,70,'Tehrani 2017 · AMH','https://doi.org/10.1371/journal.pone.0179634',
        tehrani['assay'],'Zdrowi mężczyźni; Tehran Lipid and Glucose Study','median',
        compatibleAssayMethodIds=['amh-gen-ii-modified','beckman-amh-gen-ii-modified'],
        provenance={'doi':tehrani['doi'],'table':2,'sha256':tehrani['sourceSha256'],
                    'license':tehrani['license'],'participants':831,'sourceUnit':'ng/mL',
                    'sourceToCanonicalFactor':1/0.1401},limitations=tehrani['notes'])

    infant=json.loads((ROOT/'female-reference-data.json').read_text())['femaleInfantMedians']
    for analyte,hormone in infant['hormones'].items():
        add('ljubicic2022-female-'+analyte,analyte,'female',
            [dict(ageYears=p['ageYears'],value=p['median']) for p in hormone['points']],
            .02,1,'Ljubicic 2022 · minipuberty',infant['source']['url'],hormone['assay'],
            'Zdrowe dziewczynki urodzone o czasie; Dania','median',termOnly=True,
            **({'maxAgeExclusive':True} if analyte == 'fsh' else {}),
            compatibleAssayMethodIds=assay_ids.get(analyte,['lc-ms/ms','lc-ms-ms','lcmsms']),
            provenance={**infant['source'],'table':hormone['supplementTable'],
                        'participants':98,'samples':266},limitations=infant['displayNotes'])

    return {'version':'2026-10-11.1','purpose':'educational-population-central-comparison',
            'notClinicalReference':True,
            'interpolation':'Monotone PCHIP within continuous source profiles; age-group means and medians are constant within their own separate profiles. No interpolation across groups, source gaps or publications, and no extrapolation.',
            'profiles':profiles,
            'unitConversions':{
                'lh':{'unit':'IU/L','factors':{'IU/L':1,'mIU/mL':1}},
                'fsh':{'unit':'IU/L','factors':{'IU/L':1,'mIU/mL':1}},
                'inhb':{'unit':'pg/mL','factors':{'pg/mL':1,'ng/L':1}},
                'amh':{'unit':'pmol/L','factors':{'pmol/L':1,'ng/mL':1/0.1401,'μg/L':1/0.1401,'ug/L':1/0.1401}},
                't':{'unit':'nmol/L','factors':{'nmol/L':1,'ng/dL':.03467}},
                'e2':{'unit':'pmol/L','factors':{'pmol/L':1,'pg/mL':3.671}},
                'insl3':{'unit':'ug/L','factors':{'ug/L':1,'μg/L':1,'ng/mL':1}}
            }}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    content=json.dumps(build(),ensure_ascii=False,indent=2)+'\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8')!=content:
            raise SystemExit('FAIL: population-reference-data.json is stale; run build_patient_point_data.py')
        print('PASS: patient-point data reproduce source extracts')
    else:
        OUTPUT.write_text(content,encoding='utf-8')
        print(OUTPUT.name)
