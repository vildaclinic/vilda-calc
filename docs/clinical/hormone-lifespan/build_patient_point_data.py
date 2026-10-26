"""Package factual central-concentration curves for educational patient points.

Sources are readable JSON extracts in evidence/patient-point; no source PDFs,
clinical reference limits, invented medians or cross-source bridges are packaged.
Run with --check to verify the checked-in data artifact.
"""
from pathlib import Path
import argparse
import hashlib
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
    infant_lh_tail = json.loads((ROOT / 'male-lh-infant-tail-policy.json').read_text(encoding='utf-8'))
    numeric_tail = infant_lh_tail['numericReference']
    assert infant_lh_tail['kind'] == 'educational-infant-lh-tail-display'
    assert infant_lh_tail['profileId'] == numeric_tail['profileId'] == 'busch2022-male-lh'
    assert (numeric_tail['minAgeDays'], numeric_tail['maxAgeDays'], numeric_tail['dayDivisor']) == (243, 326, 365.25)
    assert (numeric_tail['minAge'], numeric_tail['maxAge']) == (243 / 365.25, 326 / 365.25)
    assert numeric_tail['minAgeExclusive'] is True and numeric_tail['maxAgeExclusive'] is False
    ids = {'testosterone':'t','inhibin_b':'inhb'}
    assay_ids = {
        'lh':['autodelfia','autodelfia-lh'], 'fsh':['autodelfia','autodelfia-fsh'],
        'inhb':['inhibin-b-gen-ii','beckman-inhibin-b-gen-ii'],
        'amh':['access-2','beckman-access-2'],
        't':['lc-ms/ms','lc-ms-ms','lcmsms'], 'insl3':['lc-ms/ms','lc-ms-ms','lcmsms']}
    for name, hormone in busch['hormones'].items():
        analyte = ids.get(name,name)
        # Source concentrations and the archival graphic-eligibility decisions
        # stay untouched. Only this approved LH interval has a new, separately
        # versioned presentation decision based on the vector centreline.
        points = [dict(ageYears=r[0]/365.25, value=r[1], eligible=(
                      True if name == 'lh' and numeric_tail['minAgeDays'] < r[0] <= numeric_tail['maxAgeDays']
                      else r[4]))
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
            limitations=busch['limitations'],
            **({'numericReferencePolicy': numeric_tail} if name == 'lh' else {}))

    madsen = read('madsen2022-male-p50-lms.json')
    for analyte in ('lh','fsh'):
        hormone=madsen['hormones'][analyte]
        add('madsen2022-male-'+analyte,analyte,'male',
            [dict(ageYears=p['ageYears'],value=p['centralConcentration']) for p in hormone['points']],
            6,16,'Madsen 2022 · chłopcy','https://doi.org/10.1210/clinem/dgac155',
            hormone['assay'],'Bergen Growth Study 2; chłopcy, Norwegia','median',
            compatibleAssayMethodIds=['immulite-2000-xpi','siemens-immulite-2000-xpi'],
            provenance=madsen['source'],limitations=madsen['useConstraints'])

    female_gonadotropin_policy = json.loads((ROOT/'female-gonadotropin-reference-policy.json').read_text(encoding='utf-8'))
    assert female_gonadotropin_policy['kind'] == 'educational-source-selection'
    assert female_gonadotropin_policy['ordinaryOnly'] is True
    assert (female_gonadotropin_policy['sex'], female_gonadotropin_policy['analytes'],
            female_gonadotropin_policy['unit']) == ('female', ['lh', 'fsh'], 'IU/L')
    female_zec_routes = {route['id']: route for route in female_gonadotropin_policy['zecProfiles']}
    assert len(female_zec_routes) == 2
    zec=read('zec2012-fsh-group-medians.json')
    assert sum(row['participants'] for row in zec['rows']) == zec['fshParticipants']
    for row in zec['rows']:
        if not row['active']:
            continue
        assert row['tannerStage'] == 1 and row['medianOperator'] == '=' and not row['censored']
        identifier = 'zec2012-'+row['sex']+'-fsh-age-'+str(row['minAge'])+'-'+str(row['maxAge'])
        minimum, maximum = row['applicationMinAge'], row['applicationMaxAge']
        source_routing = {}
        if row['sex'] == 'female':
            # The source extract retains its full original table and historical
            # activation notes. Only this versioned application policy routes it.
            if identifier not in female_zec_routes:
                continue
            route = female_zec_routes[identifier]
            assert (route['sourceMinAge'], route['sourceMaxAge']) == (row['minAge'], row['maxAge'])
            minimum, maximum = route['minAge'], route['maxAge']
            assert route['maxAgeExclusive'] is True
            if maximum != row['applicationMaxAge']:
                source_routing = {'sourceRouting': {
                    'version':female_gonadotropin_policy['version'],
                    'policy':female_gonadotropin_policy['zecSourcePolicy'],
                    'minAge':minimum, 'maxAge':maximum, 'maxAgeExclusive':True}}
        assert row['minAge'] <= minimum < maximum <= row['maxAge']
        median=row['medianIuL']
        add(identifier,
            'fsh',row['sex'],
            [dict(ageYears=row['applicationMinAge'],value=median),
             dict(ageYears=row['applicationMaxAge'],value=median)],
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
                        'assay':zec['assay'], **source_routing},
            limitations=zec['limitations'])

    female_madsen = json.loads((ROOT/female_gonadotropin_policy['sourceEvidence']).read_text(encoding='utf-8'))
    gonadotropin_comparison = json.loads((ROOT/'gonadotropin-comparison-reference-data.json').read_text(encoding='utf-8'))
    for route in female_gonadotropin_policy['profiles']:
        analyte = route['analyte']
        hormone = female_madsen['hormones'][analyte]
        comparison = next(p for p in gonadotropin_comparison['profiles'] if p['id'] == route['sourceProfileId'])
        assert hormone['unit'] == 'IU/L' and hormone['statistic'] == 'model_p50_median'
        assert [p['ageYears'] for p in hormone['points']] == list(range(6,17))
        assert all(math.isclose(p['median'], math.exp(p['M_logSIx1e6'])/1e6,
                                rel_tol=1e-14, abs_tol=0) for p in hormone['points'])
        points = [dict(ageYears=p['ageYears'], value=p['median']) for p in hormone['points']]
        assert points == comparison['points']
        assert (route['minAge'], route['maxAge'], route['maxAgeExclusive']) == (6,16,False)
        add(route['id'], analyte, 'female', points, route['minAge'], route['maxAge'],
            comparison['sourceLabel'], comparison['url'], comparison['method'],
            comparison['population'], 'median', ordinaryOnly=True,
            maxAgeExclusive=route['maxAgeExclusive'],
            compatibleAssayMethodIds=comparison['compatibleAssayMethodIds'],
            patientNote=female_gonadotropin_policy['patientNote'],
            provenance={**comparison['provenance'],
                        'sourceWorksheet':hormone['sheet'],
                        'sourceCells':[p['sourceCells'] for p in hormone['points']],
                        'transform':female_madsen['transform'],
                        'lowerLimitOfQuantification':hormone['lowerLimitOfQuantification'],
                        'sourceRouting':{'version':female_gonadotropin_policy['version'],
                            'minAge':route['minAge'], 'maxAge':route['maxAge'],
                            'maxAgeExclusive':route['maxAgeExclusive'],
                            'selectionPolicy':female_gonadotropin_policy['selectionPolicy']}},
            limitations=[*[note for note in comparison['limitations']
                            if not note.startswith('Profil dostępny wyłącznie w porównaniu płci')],
                female_gonadotropin_policy['interpolation'],
                'LH w wieku 6–9 lat ma medianę około 0,105 IU/L, blisko LLOQ 0,1 IU/L; drobne różnice nie oznaczają precyzyjnej klasyfikacji klinicznej.'
                if analyte == 'lh' else
                'Model wieku nie jest medianą dla konkretnego stadium Th ani fazy cyklu.'])

    e2_policy = json.loads((ROOT/'female-estradiol-reference-policy.json').read_text(encoding='utf-8'))
    assert e2_policy['kind'] == 'educational-source-selection' and e2_policy['ordinaryOnly'] is True
    assert (e2_policy['analyte'], e2_policy['sex'], e2_policy['unit']) == ('e2', 'female', 'pmol/L')
    e2_source = json.loads((ROOT/e2_policy['sourceEvidence']).read_text(encoding='utf-8'))
    e2 = e2_source['hormones']['e2']
    assert e2['unit'] == e2_policy['unit'] and e2['statistic'] == 'model_p50_median'
    assert [point['ageYears'] for point in e2['points']] == list(range(6,19))
    assert (e2_policy['minAge'], e2_policy['maxAge'], e2_policy['maxAgeExclusive']) == (6,18,False)
    assert all(math.isclose(point['median'], math.exp(point['M_logSIx1e6'])/1e6,
                            rel_tol=1e-14, abs_tol=0) for point in e2['points'])
    add(e2_policy['id'], 'e2', 'female',
        [dict(ageYears=point['ageYears'], value=point['median']) for point in e2['points']],
        e2_policy['minAge'], e2_policy['maxAge'], 'Madsen 2022 · dziewczęta',
        e2_source['source']['url'], e2['assay'],
        'Bergen Growth Study 2 + Fit Futures; dziewczęta, Norwegia', 'median',
        ordinaryOnly=e2_policy['ordinaryOnly'], maxAgeExclusive=e2_policy['maxAgeExclusive'],
        specimen=e2_policy['specimen'], compatibleSpecimenIds=e2_policy['compatibleSpecimenIds'],
        compatibleAssayMethodIds=e2_policy['compatibleAssayMethodIds'],
        excludedCyclePhases=e2_policy['excludedCyclePhases'], patientNote=e2_policy['patientNote'],
        provenance={**e2_source['source'], 'sourceWorksheet':e2['sheet'],
                    'sourceCells':[point['sourceCells'] for point in e2['points']],
                    'transform':e2_source['transform'], 'methodDetails':e2['methodDetails'],
                    'sourceRouting':{'version':e2_policy['version'],
                        'minAge':e2_policy['minAge'], 'maxAge':e2_policy['maxAge'],
                        'maxAgeExclusive':e2_policy['maxAgeExclusive'],
                        'selectionPolicy':e2_policy['selectionPolicy']}},
        limitations=[e2_policy['agePolicy'], e2_policy['assayPolicy'], e2_policy['contextPolicy'],
                     e2_policy['lowValuePolicy'], e2_policy['interpolation'],
                     'Model przekrojowy różnych stadiów i faz cyklu, nie trajektoria jednej pacjentki.'])

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
            excludedCyclePhases=amh_policy['excludedCyclePhases'],
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
                        'reproductiveContextPolicy':amh_policy['reproductiveContextPolicy'],
                        'routingVersion':amh_policy['version']},
            limitations=[
                'Mediana małej przekrojowej grupy próbek szpitalnych, nie wartość oczekiwana dla dokładnego wieku ani stadium Tannera.',
                'Access AMH w osoczu z heparyną litową; nie jest przeliczeniem między metodami ani między surowicą i osoczem.',
                'Połączenia poglądowej linii nie zmieniają tej źródłowej mediany. Różnice między grupami nie dowodzą nagłego zdarzenia hormonalnego.',
                amh_policy['ageRouting'],
                'Nie wyznacza norm laboratoryjnych, percentyli, SDS ani rozpoznania.'
            ])

    # FDA serum medians are published group summaries, separate from the
    # existing plasma-based illustration and all paediatric source profiles.
    adult_amh_policy = json.loads((ROOT/'female-adult-amh-reference-policy.json').read_text(encoding='utf-8'))
    assert adult_amh_policy['kind'] == 'educational-source-selection'
    assert (adult_amh_policy['analyte'], adult_amh_policy['sex'], adult_amh_policy['unit']) == ('amh', 'female', 'pmol/L')
    assert adult_amh_policy['ordinaryOnly'] is True
    adult_amh_source = read(adult_amh_policy['sourceFile'])
    assert (adult_amh_source['sex'], adult_amh_source['unit'], adult_amh_source['statistic'],
            adult_amh_source['matrix']) == ('female', 'pmol/L', 'group-median', 'serum')
    adult_amh_groups = {row['id']: row for row in adult_amh_source['groups']}
    assert len(adult_amh_groups) == len(adult_amh_policy['profiles']) == 5
    assert sum(row['n'] for row in adult_amh_groups.values()) == adult_amh_source['sampleCountPerMatrix']
    for route in adult_amh_policy['profiles']:
        row = adult_amh_groups[route['sourceGroupId']]
        minimum, maximum, median = route['minAge'], route['maxAge'], row['median']
        # Completed years are an explicit application convention: the FDA
        # summary does not define DOB rounding or continuous age boundaries.
        assert minimum == row['minAge'] and maximum == row['maxAge'] + 1
        assert route['maxAgeExclusive'] is True
        assert all(max(minimum, existing['minAge']) >= min(maximum, existing['maxAge'])
                   for existing in profiles if existing['analyte'] == 'amh' and existing['sex'] == 'female')
        add(route['id'], 'amh', 'female',
            [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
            minimum, maximum, adult_amh_source['sourceLabel'], adult_amh_source['source']['url'],
            adult_amh_source['assay'], adult_amh_source['population'], 'group-median',
            interpolation='constant', ordinaryOnly=adult_amh_policy['ordinaryOnly'],
            maxAgeExclusive=route['maxAgeExclusive'], specimen=adult_amh_policy['specimen'],
            compatibleSpecimenIds=adult_amh_policy['compatibleSpecimenIds'],
            compatibleAssayMethodIds=adult_amh_policy['compatibleAssayMethodIds'],
            excludedCyclePhases=adult_amh_policy['excludedCyclePhases'],
            patientNote=route['patientNote'],
            ageGroup={'label':row['label'], 'minAge':row['minAge'], 'maxAge':row['maxAge'],
                      'n':row['n'], 'sourceUnit':adult_amh_source['unit'], 'sourceMedian':median,
                      'sourceMedianNgMl':row['sourceMedianNgMl'],
                      'boundaryPolicy':'published-integer-label-with-explicit-application-completed-years-convention',
                      'description':'Mediana całej opublikowanej grupy wieku, nie model dokładnego wieku. Ukończone lata są konwencją aplikacji; dokument nie definiuje ciągłych granic wieku.'},
            provenance={**adult_amh_source['source'], 'groupParticipants':row['n'],
                        'sourceUnit':adult_amh_source['unit'], 'sourceToCanonicalFactor':1,
                        'sourceMedianNgMl':row['sourceMedianNgMl'],
                        'sourceSpecimen':adult_amh_source['matrix'],
                        'readableSource':'evidence/patient-point/' + adult_amh_policy['sourceFile'],
                        'sourceGroupId':row['id'],
                        'ageRouting':adult_amh_policy['agePolicy'],
                        'selectionPolicy':adult_amh_policy['selectionPolicy'],
                        'specimenPolicy':adult_amh_policy['specimenPolicy'],
                        'assayPolicy':adult_amh_policy['assayPolicy'],
                        'reproductiveContextPolicy':adult_amh_policy['reproductiveContextPolicy'],
                        'routingVersion':adult_amh_policy['version']},
            limitations=adult_amh_source['limitations'])

    inhibin_comparison = json.loads((ROOT/'inhibin-comparison-reference-data.json').read_text(encoding='utf-8'))
    source_profile = next(p for p in inhibin_comparison['profiles']
                          if p['id'] == 'borelli2025-female-inhb-puberty-comparison')
    inhb_policy = json.loads((ROOT/'female-inhibin-reference-policy.json').read_text(encoding='utf-8'))
    assert inhb_policy['kind'] == 'educational-source-selection'
    assert (inhb_policy['analyte'], inhb_policy['sex'], inhb_policy['unit']) == ('inhb', 'female', 'pg/mL')
    assert inhb_policy['ordinaryOnly'] is True
    assert inhb_policy['retainAllSourcePoints'] and len(source_profile['points']) == 24
    inhibin_source = json.loads((ROOT/'evidence'/'inhb-digitized-median.json').read_text(encoding='utf-8'))
    # The same published model spans two overlapping observed cohorts.
    # Validate continuous coverage instead of splitting the profile at age 20
    # or incorrectly treating the full infant-to-adult domain as observed.
    minimum, maximum = inhb_policy['minAge'], inhb_policy['maxAge']
    assert minimum < maximum
    cohorts = sorted((cohort for cohort in inhibin_source['cohorts']
                      if cohort['ageMaxYears'] >= minimum and cohort['ageMinYears'] <= maximum),
                     key=lambda cohort: cohort['ageMinYears'])
    covered_to = minimum
    for cohort in cohorts:
        assert cohort['ageMinYears'] <= covered_to
        covered_to = max(covered_to, cohort['ageMaxYears'])
    assert covered_to >= maximum
    assert (inhibin_source['matrix'], inhibin_source['outputUnit']) == ('serum', 'pg/mL')
    assert source_profile['points'] == [dict(ageYears=p['ageYears'], value=p['approxMedianPgMl'])
                                        for p in inhibin_source['points']]
    assert source_profile['points'][0]['ageYears'] == minimum
    extension = json.loads((ROOT/inhb_policy['extensionEvidence']).read_text(encoding='utf-8'))
    assert extension['source']['doi'] == inhibin_source['doi']
    assert (extension['matrix'], extension['sourceUnit'], extension['outputUnit'],
            extension['unitFactor']) == ('serum', 'ng/L', 'pg/mL', 1)
    assert extension['originalSourceEvidence'] == inhb_policy['sourceEvidence']
    assert hashlib.sha256((ROOT/inhb_policy['sourceEvidence']).read_bytes()).hexdigest() == extension['originalSourceSha256']
    assert extension['selection']['newMaxAgeYears'] == maximum
    assert extension['selection']['maxAgeExclusive'] == inhb_policy['maxAgeExclusive']
    tail = [dict(ageYears=p['ageYears'], value=p['approxMedianPgMl'])
            for p in extension['points']]
    assert len(tail) == 3 and len(source_profile['points']) + len(tail) == 27
    assert source_profile['points'][-1]['ageYears'] < tail[0]['ageYears']
    assert all(tail[i]['ageYears'] < tail[i+1]['ageYears'] for i in range(len(tail)-1))
    assert tail[-1]['ageYears'] == maximum
    assert all(math.isfinite(p['value']) and p['value'] > 0 for p in tail)
    assert all(p['rawMedianNgL'] - extension['selection']['digitizationTolerancePgMl']
               > extension['lodNgL'] for p in extension['points'])
    ordinary = {**source_profile, 'id':inhb_policy['id'],
                'points':[*source_profile['points'], *tail],
                'minAge':inhb_policy['minAge'], 'maxAge':inhb_policy['maxAge'],
                'maxAgeExclusive':inhb_policy['maxAgeExclusive'],
                'ordinaryOnly':inhb_policy['ordinaryOnly'],
                'population':inhb_policy['population'],
                'compatibleSpecimenIds':inhb_policy['compatibleSpecimenIds'],
                'compatibleAssayMethodIds':inhb_policy['compatibleAssayMethodIds'],
                'excludedCyclePhases':inhb_policy['excludedCyclePhases'],
                'sourceLabel':'Borelli-Kjær 2025 · inhibina B · model wieku',
                'patientNote':inhb_policy['patientNote'],
                'provenance':{**source_profile['provenance'],
                              'sourceProfileId':source_profile['id'],
                              'originalSourceKnotDomain':[source_profile['points'][0]['ageYears'], source_profile['points'][-1]['ageYears']],
                              'fullSourceKnotDomain':[minimum, maximum],
                              'qualificationScope':inhb_policy['qualificationScope'],
                              'cohorts':cohorts,
                              'cohortCoverage':inhb_policy['cohortCoverage'],
                              'specimenPolicy':inhb_policy['specimenPolicy'],
                              'assayPolicy':inhb_policy['assayPolicy'],
                              'reproductiveContextPolicy':inhb_policy['reproductiveContextPolicy'],
                              'digitizationExtension':inhb_policy['extensionEvidence'],
                              'extensionSourceImageSha256':extension['source']['figureSha256'],
                              'interpolationPolicy':inhb_policy['interpolationPolicy'],
                              'lowValuePolicy':inhb_policy['lowValuePolicy'],
                              'routingVersion':inhb_policy['version']},
                'limitations':[source_profile['limitations'][0], inhb_policy['ageRouting'],
                               'Wiek nie wyznacza stadium Tannera. Fazy cyklu nie standaryzowano, a informacje o antykoncepcji doustnej były niepełne; nie jest to odniesienie fazy cyklu ani populacji bez leczenia.',
                               inhb_policy['reproductiveContextPolicy'],
                               inhb_policy['cohortCoverage'], inhb_policy['lowValuePolicy'],
                               'Nie jest normą laboratoryjną, percentylem ani metodą rozpoznawania zaburzeń.']}
    profiles.append(ordinary)

    # Whole-group medians fill only the approved childhood gap. They do not
    # replace the existing female illustrative bridge or fit a new age model.
    childhood_policy = json.loads((ROOT/'female-inhibin-childhood-reference-policy.json').read_text(encoding='utf-8'))
    assert childhood_policy['kind'] == 'educational-source-selection'
    assert (childhood_policy['analyte'], childhood_policy['sex'], childhood_policy['unit']) == ('inhb', 'female', 'pg/mL')
    assert childhood_policy['ordinaryOnly'] is True
    childhood_source = read(childhood_policy['sourceFile'])
    assert (childhood_source['sex'], childhood_source['unit'], childhood_source['statistic'],
            childhood_source['matrix']) == ('female', 'pg/mL', 'group-median', 'serum')
    childhood_groups = {row['id']: row for row in childhood_source['groups']}
    assert len(childhood_groups) == len(childhood_policy['profiles']) == 2
    for route in childhood_policy['profiles']:
        row = childhood_groups[route['sourceGroupId']]
        minimum, maximum, median = route['minAge'], route['maxAge'], row['median']
        assert row['minAge'] <= minimum < maximum <= row['maxAge']
        assert row['medianConfirmation']['table2'] == row['medianConfirmation']['table3'] == median
        assert 1 <= minimum < maximum <= 5.6
        assert route['maxAgeExclusive'] is True
        # Do not overlap either source at the endpoints, including the exact
        # first birthday that remains in Ljubicic. Method mismatch is not a
        # reason to select another overlapping source.
        for existing in profiles:
            if existing['analyte'] != 'inhb' or existing['sex'] != 'female':
                continue
            overlap_start = max(minimum, existing['minAge'])
            overlap_end = min(maximum, existing['maxAge'])
            assert overlap_start >= overlap_end
            if overlap_start == overlap_end:
                assert ((overlap_start == minimum and route['minAgeExclusive']) or
                        (overlap_start == maximum and route['maxAgeExclusive']) or
                        (overlap_start == existing['minAge'] and existing.get('minAgeExclusive', False)) or
                        (overlap_start == existing['maxAge'] and existing.get('maxAgeExclusive', False)))
        add(route['id'], 'inhb', 'female',
            [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
            minimum, maximum, childhood_source['sourceLabel'], childhood_source['source']['url'],
            childhood_source['assay'], childhood_source['population'], 'group-median',
            interpolation='constant', ordinaryOnly=childhood_policy['ordinaryOnly'],
            minAgeExclusive=route['minAgeExclusive'], maxAgeExclusive=route['maxAgeExclusive'],
            specimen=childhood_policy['specimen'],
            compatibleSpecimenIds=childhood_policy['compatibleSpecimenIds'],
            compatibleAssayMethodIds=childhood_policy['compatibleAssayMethodIds'],
            patientNote=route['patientNote'],
            ageGroup={'label':row['label'], 'minAge':row['minAge'], 'maxAge':row['maxAge'],
                      'n':row['n'], 'sourceUnit':childhood_source['unit'], 'sourceMedian':median,
                      'sourceMedianCi90':row['medianCi90'],
                      'boundaryPolicy':'published-label-with-separate-explicit-application-age-routing',
                      'description':'Mediana całej opublikowanej grupy, nie dokładnego wieku ani stadium Tannera. Metoda CLIA nie została zharmonizowana z Gen II ELISA.'},
            provenance={**childhood_source['source'],
                        'participants':childhood_source['participants'],
                        'femaleParticipants':childhood_source['femaleParticipants'],
                        'groupParticipants':row['n'], 'sourceUnit':childhood_source['unit'],
                        'sourceToCanonicalFactor':1, 'sourceSpecimen':childhood_source['matrix'],
                        'readableSource':'evidence/patient-point/' + childhood_policy['sourceFile'],
                        'sourceGroupId':row['id'],
                        'ageRouting':childhood_policy['agePolicy'],
                        'selectionPolicy':childhood_policy['selectionPolicy'],
                        'specimenPolicy':childhood_policy['specimenPolicy'],
                        'assayPolicy':childhood_policy['assayPolicy'],
                        'routingVersion':childhood_policy['version']},
            limitations=childhood_source['limitations'])

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

    fsh_policy = json.loads((ROOT/'fsh-caliper-reference-policy.json').read_text(encoding='utf-8'))
    assert (fsh_policy['kind'], fsh_policy['ordinaryOnly'], fsh_policy['analyte'],
            fsh_policy['unit']) == ('educational-source-selection', True, 'fsh', 'IU/L')
    fsh_source = json.loads((ROOT/fsh_policy['sourceEvidence']).read_text(encoding='utf-8'))
    # The ordinary source switch includes age 16 (also completed-month age).
    # Retain every Madsen source node; the separate sex comparison still uses
    # its original, published inclusive year-16 endpoint.
    for identifier in fsh_policy['madsenProfiles']:
        existing = next(profile for profile in profiles if profile['id'] == identifier)
        assert existing['analyte'] == 'fsh' and existing['maxAge'] == 16
        existing['maxAgeExclusive'] = True
    for route in fsh_policy['profiles']:
        series = fsh_source['series'][route['sex']]
        points = series['points']
        assert len(points) == 181 and [point['ageYears'] for point in points] == [i/10 for i in range(10,191)]
        assert route['minAge'] == 16 and route['maxAgeExclusive'] is True
        assert route['maxAge'] == (18 if route['sex'] == 'male' else 19)
        add(route['id'], 'fsh', route['sex'],
            [dict(ageYears=point['ageYears'], value=point['centralConcentration']) for point in points],
            route['minAge'], route['maxAge'], 'Wilson 2023 · CALIPER · FSH',
            'https://doi.org/10.1515/cclm-2022-1077', 'Abbott ARCHITECT ci2000',
            'CALIPER; zdrowe dzieci i młodzież, Greater Toronto, Kanada', 'median',
            ordinaryOnly=True, maxAgeExclusive=True, specimen=fsh_policy['specimen'],
            compatibleSpecimenIds=fsh_policy['compatibleSpecimenIds'],
            compatibleAssayMethodIds=fsh_policy['compatibleAssayMethodIds'],
            excludedCyclePhases=fsh_policy['excludedCyclePhases'], patientNote=fsh_policy['patientNote'],
            provenance={**fsh_source['source'], 'sourceWorksheet':series['sheet'],
                        'sourceCells':[point['sourceCells'] for point in points],
                        'sourceModel':fsh_source['model'],
                        'sourceRouting':{'version':fsh_policy['version'], **route,
                            'selectionPolicy':fsh_policy['selectionPolicy']}},
            limitations=[*fsh_source['useConstraints'], fsh_policy['agePolicy'],
                         fsh_policy['statisticPolicy'], fsh_policy['interpolation'],
                         fsh_policy['assayPolicy'], fsh_policy['contextPolicy']])

    young_adult_amh_policy = json.loads((ROOT/'male-amh-young-adult-reference-policy.json').read_text(encoding='utf-8'))
    assert young_adult_amh_policy['kind'] == 'educational-source-selection'
    assert young_adult_amh_policy['ordinaryOnly'] is True
    assert (young_adult_amh_policy['analyte'], young_adult_amh_policy['sex'],
            young_adult_amh_policy['unit']) == ('amh', 'male', 'pmol/L')
    young_adult_amh = json.loads((ROOT/young_adult_amh_policy['sourceEvidence']).read_text(encoding='utf-8'))
    assert (young_adult_amh['sex'], young_adult_amh['unit'],
            young_adult_amh['statistic']) == ('male', 'ng/mL', 'group-median')
    amh_groups = [row for row in young_adult_amh['groups']
                  if row['id'] == young_adult_amh_policy['sourceGroupId']]
    assert len(amh_groups) == 1
    row = amh_groups[0]
    minimum, maximum = young_adult_amh_policy['minAge'], young_adult_amh_policy['maxAge']
    assert (minimum, maximum, young_adult_amh_policy['maxAgeExclusive']) == (18, 20, True)
    assert row['minAge'] <= minimum < maximum <= row['maxAge']
    assert young_adult_amh['observedMinAge'] <= minimum < maximum <= young_adult_amh['observedMaxAge']
    assert all(max(minimum, existing['minAge']) >= min(maximum, existing['maxAge'])
               for existing in profiles if existing['analyte'] == 'amh' and existing['sex'] == 'male')
    assert young_adult_amh_policy['compatibleAssayMethodIds'] == [young_adult_amh['assayId']]
    assert young_adult_amh['conversion']['ngMlPerPmolL'] == 0.1401
    source_factor = 1 / young_adult_amh['conversion']['ngMlPerPmolL']
    median = row['median'] / young_adult_amh['conversion']['ngMlPerPmolL']
    add(young_adult_amh_policy['id'], 'amh', 'male',
        [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
        minimum, maximum, young_adult_amh['sourceLabel'], young_adult_amh['source']['url'],
        young_adult_amh['assay'], young_adult_amh['population'], 'group-median',
        interpolation='constant', ordinaryOnly=True, maxAgeExclusive=True,
        specimen=young_adult_amh_policy['specimen'],
        compatibleSpecimenIds=young_adult_amh_policy['compatibleSpecimenIds'],
        compatibleAssayMethodIds=young_adult_amh_policy['compatibleAssayMethodIds'],
        patientNote=young_adult_amh_policy['patientNote'],
        ageGroup={'label':row['label'], 'minAge':row['minAge'], 'maxAge':row['maxAge'],
                  'n':row['n'], 'sourceUnit':young_adult_amh['unit'], 'sourceMedian':row['median'],
                  'boundaryPolicy':'published-group-with-separate-conservative-application-routing',
                  'description':f"Mediana całej grupy {row['label']} (N={row['n']}); nie jest medianą dokładnego wieku ani stadium Tannera. Zastosowanie wyłącznie w wieku 18–<20 lat nie tworzy nowej mediany tej podgrupy."},
        provenance={**young_adult_amh['source'], 'participants':young_adult_amh['participants'],
                    'groupParticipants':row['n'], 'sourceUnit':young_adult_amh['unit'],
                    'sourceToCanonicalFactor':source_factor, 'sourceSpecimen':young_adult_amh['matrix'],
                    'readableSource':young_adult_amh_policy['sourceEvidence'], 'sourceGroupId':row['id'],
                    'sourceRouting':{'version':young_adult_amh_policy['version'],
                        'minAge':minimum, 'maxAge':maximum, 'maxAgeExclusive':True,
                        'selectionPolicy':young_adult_amh_policy['selectionPolicy']}},
        limitations=[*young_adult_amh['limitations'], young_adult_amh_policy['agePolicy'],
                     young_adult_amh_policy['assayPolicy'], young_adult_amh_policy['contextPolicy'],
                     young_adult_amh_policy['interpolation']])

    male_lh_policy = json.loads((ROOT/'male-lh-caliper-reference-policy.json').read_text(encoding='utf-8'))
    assert (male_lh_policy['kind'], male_lh_policy['ordinaryOnly'],
            male_lh_policy['analyte'], male_lh_policy['sex'], male_lh_policy['unit']) == (
                'educational-source-selection', True, 'lh', 'male', 'IU/L')
    assert (male_lh_policy['minAge'], male_lh_policy['minAgeExclusive'],
            male_lh_policy['maxAge'], male_lh_policy['maxAgeExclusive']) == (16, True, 18, True)
    male_lh_source = json.loads((ROOT/male_lh_policy['sourceEvidence']).read_text(encoding='utf-8'))
    assert (male_lh_source['analyte'], male_lh_source['sex'], male_lh_source['unit']) == ('lh', 'male', 'IU/L')
    assert male_lh_source['status'] == 'qualified_reconstruction_for_educational_age_reference_not_laboratory_ri'
    assert set(male_lh_source['series']) == {'male'}
    male_lh_series = male_lh_source['series']['male']
    male_lh_points = male_lh_series['points']
    assert len(male_lh_points) == 91
    assert [point['ageYears'] for point in male_lh_points] == [i/10 for i in range(100, 191)]
    assert all(max(16, existing['minAge']) >= min(18, existing['maxAge'])
               for existing in profiles if existing['analyte'] == 'lh' and existing['sex'] == 'male')
    add(male_lh_policy['id'], 'lh', 'male',
        [dict(ageYears=point['ageYears'], value=point['centralConcentration']) for point in male_lh_points],
        16, 18, 'Wilson 2023 · CALIPER · LH', male_lh_source['source']['url'],
        'Abbott ARCHITECT ci2000', 'CALIPER; zdrowi chłopcy, Greater Toronto, Kanada', 'median',
        approximate=True, ordinaryOnly=True, minAgeExclusive=True, maxAgeExclusive=True,
        specimen=male_lh_policy['specimen'], compatibleSpecimenIds=male_lh_policy['compatibleSpecimenIds'],
        compatibleAssayMethodIds=male_lh_policy['compatibleAssayMethodIds'],
        patientNote=male_lh_policy['patientNote'],
        provenance={**male_lh_source['source'], 'sourceWorksheet':male_lh_series['sheet'],
                    'sourceCells':[point['sourceCells'] for point in male_lh_points],
                    'sourceModel':male_lh_source['model'],
                    'sourceRouting':{'version':male_lh_policy['version'], 'minAge':16,
                        'minAgeExclusive':True, 'maxAge':18, 'maxAgeExclusive':True,
                        'selectionPolicy':male_lh_policy['selectionPolicy']}},
        limitations=[*male_lh_source['useConstraints'], male_lh_policy['agePolicy'],
                     male_lh_policy['statisticPolicy'], male_lh_policy['reconstructionPolicy'],
                     male_lh_policy['interpolation'], male_lh_policy['assayPolicy'], male_lh_policy['contextPolicy']])

    childhood_t_policy = json.loads((ROOT/'male-testosterone-childhood-reference-policy.json').read_text(encoding='utf-8'))
    assert (childhood_t_policy['kind'], childhood_t_policy['ordinaryOnly'],
            childhood_t_policy['analyte'], childhood_t_policy['sex'], childhood_t_policy['unit']) == (
                'educational-source-selection', True, 't', 'male', 'nmol/L')
    childhood_t = json.loads((ROOT/childhood_t_policy['sourceEvidence']).read_text(encoding='utf-8'))
    assert (childhood_t['sex'], childhood_t['unit'], childhood_t['sourceUnit'],
            childhood_t['statistic'], childhood_t['approximate']) == (
                'male', 'nmol/L', 'µg/L', 'group-median', True)
    assert childhood_t['clinicalOwnerApproval']['accepted'] is True
    assert childhood_t_policy['interpolation'] == 'constant'
    assert childhood_t_policy['referenceSignificantDigits'] == 1
    assert childhood_t['conversion']['nmolLPerNgDl'] == .03467
    assert childhood_t['source']['sourceQuantification']['loqNgL'] == 10
    t_groups = {row['id']: row for row in childhood_t['groups']}
    assert set(t_groups) == {'1-2', '2-3'}
    assert [(route['sourceGroupId'], route['minAge'], route['maxAge'], route['maxAgeExclusive'])
            for route in childhood_t_policy['profiles']] == [('1-2', 1, 2, True), ('2-3', 2, 3, True)]
    for route in childhood_t_policy['profiles']:
        row = t_groups[route['sourceGroupId']]
        minimum, maximum = route['minAge'], route['maxAge']
        assert (row['applicationMinAge'], row['applicationMaxAge'], row['n']) == (minimum, maximum, None)
        assert all(max(minimum, existing['minAge']) >= min(maximum, existing['maxAge'])
                   for existing in profiles if existing['analyte'] == 't' and existing['sex'] == 'male')
        # Both reference and patient use the existing TT unit conversion.
        # Rounding here removes floating-point residue, not source uncertainty.
        median = round(row['sourceMedian'] * childhood_t['conversion']['ngDlPerUgL'] * .03467, 12)
        assert math.isclose(median, row['canonicalMedian'], rel_tol=1e-14)
        assert row['sourceMedian'] * 1000 - childhood_t['digitization']['approximateDigitizationToleranceNgL'] > 10
        add(route['id'], 't', 'male',
            [dict(ageYears=minimum, value=median), dict(ageYears=maximum, value=median)],
            minimum, maximum, childhood_t['sourceLabel'], childhood_t['source']['url'],
            childhood_t['assay'], childhood_t['population'], 'group-median', approximate=True,
            interpolation='constant', ordinaryOnly=True, maxAgeExclusive=True,
            specimen=childhood_t_policy['specimen'],
            compatibleSpecimenIds=childhood_t_policy['compatibleSpecimenIds'],
            compatibleAssayMethodIds=childhood_t_policy['compatibleAssayMethodIds'],
            referenceSignificantDigits=childhood_t_policy['referenceSignificantDigits'],
            patientNote=f"Grupa {route['groupLabel']} · {childhood_t_policy['patientNote']}",
            ageGroup={'label':route['groupLabel'], 'sourceLabel':row['label'],
                      'minAge':minimum, 'maxAge':maximum, 'n':None,
                      'sourceUnit':childhood_t['sourceUnit'], 'sourceMedian':row['sourceMedian'],
                      'boundaryPolicy':childhood_t['selection']['boundaryPolicy'],
                      'description':'Przybliżona mediana całej grupy z ryciny 4C; nie jest medianą dokładnego wieku ani normą. '
                          'Liczebność tej rocznej grupy nie została podana. Odczyt około ±5 ng/L (±0,02 nmol/L) '
                          'nie jest przedziałem ufności. Próbki pobierano po indukcji znieczulenia; '
                          'nie opisano sposobu zastępowania wyników poniżej LOQ.'},
            provenance={**childhood_t['source'], 'sourceGroupId':row['id'],
                        'groupParticipants':None, 'sourceUnit':childhood_t['sourceUnit'],
                        'sourceToCanonicalFactor':childhood_t['conversion']['sourceToCanonicalFactor'],
                        'sourceSpecimen':childhood_t['matrix'],
                        'readableSource':childhood_t_policy['sourceEvidence'],
                        'digitization':childhood_t['digitization'], 'sourceMarkerGeometry':row['geometry'],
                        'sourceRouting':{'version':childhood_t_policy['version'],
                            'minAge':minimum, 'maxAge':maximum, 'maxAgeExclusive':True,
                            'selectionPolicy':childhood_t_policy['selectionPolicy']}},
            limitations=[*childhood_t['limits'], childhood_t_policy['agePolicy'],
                         childhood_t_policy['statisticPolicy'], childhood_t_policy['digitizationPolicy'],
                         childhood_t_policy['assayPolicy'], childhood_t_policy['contextPolicy']])

    # One published breast-stage group fills only the approved childhood gap.
    # Keep all previous profiles in their original order and do not fit an age
    # curve from this single Harrell–Davis group quantile.
    childhood_e2_policy = json.loads((ROOT/'female-estradiol-childhood-reference-policy.json').read_text(encoding='utf-8'))
    childhood_e2 = read(childhood_e2_policy['sourceFile'])
    assert childhood_e2_policy['kind'] == 'educational-source-selection'
    assert (childhood_e2_policy['analyte'], childhood_e2_policy['sex'], childhood_e2_policy['unit'],
            childhood_e2_policy['statistic']) == ('e2', 'female', 'pmol/L', 'group-median')
    assert (childhood_e2['analyte'], childhood_e2['sex'], childhood_e2['unit'],
            childhood_e2['statistic'], childhood_e2['matrix']) == ('e2', 'female', 'pmol/L', 'group-median', 'serum')
    assert childhood_e2_policy['ordinaryOnly'] is True
    assert childhood_e2_policy['requiredGonadalKind'] == 'Th'
    assert childhood_e2_policy['interpolation'] == 'constant'
    assert len(childhood_e2['groups']) == 1
    row = childhood_e2['groups'][0]
    assert row['id'] == childhood_e2_policy['sourceGroupId']
    minimum, maximum = childhood_e2_policy['minAge'], childhood_e2_policy['maxAge']
    assert row['minAge'] <= minimum < maximum < row['maxAge']
    assert childhood_e2_policy['minAgeExclusive'] and childhood_e2_policy['maxAgeExclusive']
    assert row['gonadalKind'] == childhood_e2_policy['requiredGonadalKind']
    assert row['requiredGonadalStage'] == childhood_e2_policy['requiredGonadalStage']
    assert row['median'] == row['medianConfirmation']['nativeHtmlP50'] == row['medianConfirmation']['cachedOfficialTableImageP50']
    assert row['n'] > 0 and childhood_e2['sourceUnit'] == childhood_e2['unit']
    add(childhood_e2_policy['id'], 'e2', 'female',
        [dict(ageYears=age, value=row['median']) for age in (minimum, maximum)],
        minimum, maximum, childhood_e2['sourceLabel'], childhood_e2['source']['url'],
        childhood_e2['assay'], childhood_e2['population'], 'group-median',
        approximate=childhood_e2['approximate'],
        interpolation='constant', ordinaryOnly=True, minAgeExclusive=True, maxAgeExclusive=True,
        requiredGonadalStage=childhood_e2_policy['requiredGonadalStage'],
        specimen=childhood_e2_policy['specimen'],
        compatibleSpecimenIds=childhood_e2_policy['compatibleSpecimenIds'],
        compatibleAssayMethodIds=childhood_e2_policy['compatibleAssayMethodIds'],
        excludedCyclePhases=childhood_e2_policy['excludedCyclePhases'],
        referenceGroupLabel=childhood_e2_policy['referenceGroupLabel'],
        patientNote=childhood_e2_policy['patientNote'],
        ageGroup={'label':row['label'], 'minAge':row['minAge'], 'maxAge':row['maxAge'],
                  'n':row['n'], 'sourceMedian':row['median'], 'sourceUnit':childhood_e2['sourceUnit'],
                  'boundaryPolicy':'application-conservative-subset',
                  'description':childhood_e2['limitations'][0]},
        provenance={**childhood_e2['source'], 'sourceGroupId':row['id'],
                    'groupParticipants':row['n'], 'sourceSpecimen':childhood_e2['matrix'],
                    'readableSource':'evidence/patient-point/'+childhood_e2_policy['sourceFile'],
                    'sourceRouting':{'version':childhood_e2_policy['version'],
                        'minAge':minimum, 'maxAge':maximum, 'minAgeExclusive':True, 'maxAgeExclusive':True,
                        'selectionPolicy':childhood_e2_policy['selectionPolicy'],
                        'stagePolicy':childhood_e2_policy['stagePolicy']}},
        limitations=[*childhood_e2['limitations'], childhood_e2_policy['agePolicy'],
                     childhood_e2_policy['stagePolicy'], childhood_e2_policy['specimenPolicy'],
                     childhood_e2_policy['assayPolicy'], childhood_e2_policy['contextPolicy'],
                     childhood_e2_policy['lowValuePolicy']])

    return {'version':infant_lh_tail['version'],'purpose':'educational-population-central-comparison',
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
