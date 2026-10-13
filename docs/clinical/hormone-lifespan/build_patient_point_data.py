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

    # Additional group medians fill only explicitly uncovered age intervals.
    # Keep their source groups distinct from the narrower application domains;
    # the unchanged AMH display policy continues to select its original sources.
    male_amh_policy = json.loads((ROOT/'male-amh-reference-policy.json').read_text(encoding='utf-8'))
    assert male_amh_policy['kind'] == 'educational-source-selection'
    assert (male_amh_policy['analyte'], male_amh_policy['sex'], male_amh_policy['unit']) == ('amh', 'male', 'pmol/L')
    assert male_amh_policy['ordinaryOnly'] is True
    for route in male_amh_policy['profiles']:
        source = read(route['sourceFile'])
        assert (source['sex'], source['unit'], source['statistic']) == ('male', 'pmol/L', 'group-median')
        groups = [row for row in source['groups'] if row['id'] == route['sourceGroupId']]
        assert len(groups) == 1
        row = groups[0]
        minimum, maximum, median = route['minAge'], route['maxAge'], row['median']
        assert row['minAge'] <= minimum < maximum <= row['maxAge']
        assert route['maxAgeExclusive'] is True
        assert source['observedMinAge'] <= minimum < maximum <= source['observedMaxAge']
        # The reference engine deliberately rejects overlapping profiles. No
        # implicit assay/matrix fallback or patient-dependent preference exists.
        assert all(max(minimum, existing['minAge']) >= min(maximum, existing['maxAge'])
                   for existing in profiles if existing['analyte'] == 'amh' and existing['sex'] == 'male')
        add(route['id'], 'amh', 'male',
            [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
            minimum, maximum, source['sourceLabel'], source['source']['url'],
            source['assay'], source['population'], 'group-median',
            interpolation='constant', ordinaryOnly=male_amh_policy['ordinaryOnly'],
            maxAgeExclusive=route['maxAgeExclusive'], specimen=route['specimen'],
            compatibleSpecimenIds=route['compatibleSpecimenIds'],
            compatibleAssayMethodIds=route['compatibleAssayMethodIds'],
            patientNote=route['patientNote'],
            ageGroup={'label':row['label'], 'minAge':row['minAge'], 'maxAge':row['maxAge'],
                      'n':row['n'], 'sourceUnit':source['unit'], 'sourceMedian':median,
                      'boundaryPolicy':'published-label-with-separate-conservative-application-routing',
                      'description':'Mediana całej opublikowanej grupy wieku; nie jest medianą dokładnego wieku ani stadium Tannera. Węższy przedział wyboru w aplikacji nie zmienia grupy źródłowej.'},
            provenance={**source['source'], 'participants':source['participants'],
                        'groupParticipants':row['n'], 'sourceUnit':source['unit'],
                        'sourceToCanonicalFactor':1, 'sourceSpecimen':source['matrix'],
                        'readableSource':'evidence/patient-point/' + route['sourceFile'],
                        'sourceGroupId':row['id'],
                        'ageRouting':male_amh_policy['agePolicy'],
                        'selectionPolicy':male_amh_policy['selectionPolicy'],
                        'specimenPolicy':male_amh_policy['specimenPolicy'],
                        'assayPolicy':male_amh_policy['assayPolicy'],
                        'routingVersion':male_amh_policy['version']},
            limitations=source['limitations'])

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

    # Source medians stay separate from the approved smoothed lifespan geometry.
    # Group labels and the narrower patient-routing domains are distinct facts.
    female_policy = json.loads((ROOT/'female-adolescent-reference-policy.json').read_text(encoding='utf-8'))
    assert female_policy['kind'] == 'educational-source-selection'
    assert female_policy['ordinaryOnly'] is True
    jopling = json.loads((ROOT/'evidence'/'amh-access-groups.json').read_text(encoding='utf-8'))['pediatric']
    assert (jopling['unit'], jopling['matrix']) == ('pmol/L', 'lithium-heparin plasma')
    amh_policy = female_policy['amh']
    source_groups = {row['ageMinYears']: row for row in jopling['groups']}
    assert len(source_groups) == len(amh_policy['profiles']) == 5
    for route in amh_policy['profiles']:
        row = source_groups[route['sourceGroupMinAge']]
        minimum, maximum = route['minAge'], route['maxAge']
        median = row['median']
        label = route['sourceGroupLabel']
        assert minimum == row['ageMinYears'] and maximum <= 18
        add(route['id'], 'amh', 'female',
            [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
            minimum, maximum, 'Jopling 2018 · AMH · grupa wieku', jopling['url'],
            jopling['assay'],
            'Pozostałości próbek szpitalnych; wykluczono diagnostykę DSD i innych endokrynopatii. Nie jest to prospektywna kohorta zdrowych dziewcząt.',
            'group-median', interpolation='constant',
            ordinaryOnly=female_policy['ordinaryOnly'],
            minAgeExclusive=route['minAgeExclusive'], maxAgeExclusive=route['maxAgeExclusive'],
            specimen=amh_policy['specimen'],
            compatibleSpecimenIds=amh_policy['compatibleSpecimenIds'],
            compatibleAssayMethodIds=amh_policy['compatibleAssayMethodIds'],
            patientNote='Grupa ' + label + ' · Access AMH, osocze.',
            ageGroup={'label':label, 'minAge':row['ageMinYears'], 'maxAge':row['ageMaxYears'],
                      'n':row['n'], 'sourceUnit':jopling['unit'], 'sourceMedian':median,
                      'boundaryPolicy':'published-label-with-separate-conservative-application-routing',
                      'description':'Mediana całej grupy wieku; nie jest modelem dokładnego wieku ani stadium Tannera.'},
            provenance={'authors':'Jopling et al.', 'year':2018, 'doi':jopling['doi'],
                        'url':jopling['url'], 'table':1,
                        'readableSource':'evidence/amh-access-groups.json#pediatric',
                        'sourceReview':'evidence/female-reference-points-2026-10-13.json',
                        'sourceUnit':jopling['unit'], 'sourceToCanonicalFactor':1,
                        'groupParticipants':row['n'],
                        'sourceSpecimen':jopling['matrix'],
                        'ageRouting':amh_policy['ageRouting'],
                        'specimenPolicy':amh_policy['specimenPolicy'],
                        'assayPolicy':amh_policy['assayPolicy'],
                        'routingVersion':amh_policy['version']},
            limitations=[
                'Mediana małej przekrojowej grupy próbek szpitalnych, nie wartość oczekiwana dla dokładnego wieku ani stadium Tannera.',
                'Access AMH w osoczu z heparyną litową; nie jest przeliczeniem między metodami ani między surowicą i osoczem.',
                'Połączenia poglądowej linii nie zmieniają tej źródłowej mediany. Różnice między grupami nie dowodzą nagłego zdarzenia hormonalnego.',
                amh_policy['ageRouting'],
                'Nie wyznacza norm laboratoryjnych, percentyli, SDS ani rozpoznania.'
            ])

    inhibin_comparison = json.loads((ROOT/'inhibin-comparison-reference-data.json').read_text(encoding='utf-8'))
    source_profile = next(p for p in inhibin_comparison['profiles']
                          if p['id'] == 'borelli2025-female-inhb-puberty-comparison')
    inhb_policy = female_policy['inhb']
    assert inhb_policy['retainAllSourcePoints'] and len(source_profile['points']) == 24
    inhibin_source = json.loads((ROOT/'evidence'/'inhb-digitized-median.json').read_text(encoding='utf-8'))
    assert any(cohort['ageMinYears'] <= inhb_policy['minAge'] < inhb_policy['maxAge'] <= cohort['ageMaxYears']
               for cohort in inhibin_source['cohorts'])
    assert source_profile['points'][0]['ageYears'] <= inhb_policy['minAge']
    assert inhb_policy['maxAge'] <= source_profile['maxAge']
    ordinary = {**source_profile, 'id':inhb_policy['id'],
                'minAge':inhb_policy['minAge'], 'maxAge':inhb_policy['maxAge'],
                'maxAgeExclusive':inhb_policy['maxAgeExclusive'],
                'ordinaryOnly':female_policy['ordinaryOnly'],
                'sourceLabel':'Borelli-Kjær 2025 · inhibina B · model wieku',
                'patientNote':inhb_policy['patientNote'],
                'provenance':{**source_profile['provenance'],
                              'sourceProfileId':source_profile['id'],
                              'qualificationScope':inhb_policy['qualificationScope'],
                              'routingVersion':female_policy['version']},
                'limitations':[source_profile['limitations'][0], inhb_policy['ageRouting'],
                               source_profile['limitations'][2],
                               'Nie jest normą laboratoryjną, percentylem ani metodą rozpoznawania zaburzeń.']}
    profiles.append(ordinary)

    # Adult LH/FSH central observations remain separate from the educational
    # display curve and laboratory reference intervals. A constant profile is
    # the published whole-group statistic, never an interpolated exact-age p50.
    fame = read('laurentino2020-lh-fsh-group-means.json')
    finrisk = read('perheentupa2013-lh-fsh-group-medians.json')
    hims = read('yeap2007-lh-group-medians.json')
    ljubicic = read('ljubicic2020-fsh-adult-model-digitized.json')
    for source in (fame, finrisk, hims, ljubicic):
        assert (source['sex'], source['unit']) == ('male', 'IU/L')
    for source in (fame, finrisk, hims):
        assert sum(row['n'] for row in source['rows']) == source['participants']
    assert fame['statistic'] == 'arithmetic-group-mean'
    assert finrisk['statistic'] == hims['statistic'] == 'group-median'

    def add_adult_group(identifier, analyte, source, row, value, statistic,
                        provenance, mean_age=None):
        route = row['application']
        minimum, maximum = route['minAge'], route['maxAge']
        lower, upper = row['ageGroupYears']
        assert lower <= minimum < maximum
        # FINRISK/HIMS table brackets use completed years; the final HIMS
        # group is instead capped at its actual observed upper age, 89.
        assert maximum <= upper + (1 if route['maxAgeExclusive'] else 0)
        age_group = {
            'label': str(lower) + '–' + str(upper) + ' lat',
            'minAge': lower, 'maxAge': upper, 'maxAgeExclusive': False,
            'n': row['n'], 'sourceUnit': 'IU/L',
            'sourceMean' if statistic == 'group-mean' else 'sourceMedian': value,
            'boundaryPolicy': 'Preserve published age label; separate minAge/maxAge fields of profile define application routing.',
            'description': ('Średnia arytmetyczna całej grupy badania; nie jest medianą ani wartością dokładnego wieku.'
                            if statistic == 'group-mean' else
                            'Mediana całej grupy badania; nie opisuje zmian wewnątrz jej przedziału wieku.')}
        extra = {}
        if mean_age is not None:
            age_group['meanAge'] = mean_age
            extra['meanAge'] = mean_age
        presentation = source['presentation']
        add(identifier, analyte, 'male',
            [dict(ageYears=minimum, value=value, eligible=True),
             dict(ageYears=maximum, value=value, eligible=True)],
            minimum, maximum, presentation['sourceLabel'], source['source']['url'],
            presentation['method'], presentation['population'], statistic,
            interpolation='constant', maxAgeExclusive=route['maxAgeExclusive'],
            compatibleAssayMethodIds=presentation['compatibleAssayMethodIds'],
            provenance={**provenance, 'groupParticipants':row['n']},
            limitations=source['limitations'], ageGroup=age_group,
            groupN=row['n'], **extra)

    fame_selected = [row for row in fame['rows'] if row['application']]
    assert len(fame_selected) == 1 and fame_selected[0]['ageGroupYears'] == [18, 25]
    assert fame_selected[0]['application'] == {
        'minAge':18, 'maxAge':25, 'maxAgeExclusive':True}
    for analyte in ('lh', 'fsh'):
        row = fame_selected[0]
        add_adult_group('laurentino2020-male-' + analyte + '-18-under25',
            analyte, fame, row, row[analyte.upper()]['arithmeticMean'],
            'group-mean', fame['source'])
        for row in finrisk['rows']:
            lower, upper = row['ageGroupYears']
            central = row[analyte.upper()]
            add_adult_group('perheentupa2013-male-' + analyte + '-' + str(lower) + '-' + str(upper),
                analyte, finrisk, row, central['median'], 'group-median',
                {**finrisk['source'], 'table':finrisk['tables'][analyte],
                 'assay':finrisk['assay'][analyte],
                 'publishedP5':central['p5'], 'publishedP95':central['p95']})

    for row in hims['rows']:
        if not row['application']:
            continue
        lower, upper = row['ageGroupYears']
        add_adult_group('yeap2007-male-lh-' + str(lower) + '-' + str(upper),
            'lh', hims, row, row['median'], 'group-median',
            {**hims['source'], 'publishedAgeLabel':row['publishedAgeLabel'],
             'publishedMeanAge':row['meanAgeYears'],
             'publishedP25':row['p25'], 'publishedP75':row['p75']},
            mean_age=row['meanAgeYears'])

    route = ljubicic['application']
    assert ljubicic['statistic'] == 'approximate-model-median' and ljubicic['approximate']
    assert route == {'minAge':75, 'maxAge':80, 'maxAgeExclusive':False}
    assert [row['ageYears'] for row in ljubicic['rows']] == list(range(41, 81))
    points = [dict(ageYears=row['ageYears'], value=row['centralIUperL'], eligible=True)
              for row in ljubicic['rows'] if route['minAge'] <= row['ageYears'] <= route['maxAge']]
    presentation = ljubicic['presentation']
    add('ljubicic2020-male-fsh-75-80-approximate', 'fsh', 'male', points,
        route['minAge'], route['maxAge'], presentation['sourceLabel'],
        ljubicic['source']['url'], presentation['method'], presentation['population'],
        'median', True, maxAgeExclusive=route['maxAgeExclusive'],
        compatibleAssayMethodIds=presentation['compatibleAssayMethodIds'],
        provenance=ljubicic['source'], limitations=ljubicic['limitations'])

    return {'version':'2026-10-13.3','purpose':'educational-population-central-comparison',
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
