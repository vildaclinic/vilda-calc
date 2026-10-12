"""Package exact inhibin B group observations for separate educational charts.

The factual source extracts preserve medians/IQR and means/SD as distinct
statistics. They are not interpolated into the lifespan curve or clinical
reference intervals. No clinical calculator or patient-point profile changes.
Run with --check to verify the checked-in artifact.
"""
from pathlib import Path
import argparse
import json
import math


ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / 'evidence' / 'patient-point'
OUTPUT = ROOT / 'inhibin-observational-data.json'


def read(name):
    return json.loads((EVIDENCE / name).read_text(encoding='utf-8'))


def check_median(point):
    assert math.isfinite(point['median']) and point['median'] > 0
    assert len(point['iqr']) == 2
    assert all(math.isfinite(value) and value >= 0 for value in point['iqr'])
    assert point['iqr'][0] <= point['median'] <= point['iqr'][1]
    assert isinstance(point['n'], int) and point['n'] > 0


def build():
    mini = read('kuiri-hanninen2018-inhb-visits.json')
    tanner = read('crofton2002-male-inhb-tanner.json')
    senior = read('baccarelli2001-male-inhb-group-means.json')

    assert mini['ageBasis'] == 'chronological'
    assert mini['source']['statistic'] == tanner['source']['statistic'] == 'median'
    assert mini['source']['specimen'] == 'serum'
    assert [visit['id'] for visit in mini['visits']] == ['day7', 'month3']
    assert mini['visits'][0]['nominalAgeDays'] == 7
    assert mini['visits'][1]['nominalAgeMonths'] == 3
    assert 'nominalAgeDays' not in mini['visits'][1]
    assert len(mini['cohorts']) == 4
    assert {(cohort['sex'], cohort['birthGroup']) for cohort in mini['cohorts']} == {
        ('male', 'term'), ('female', 'term'), ('male', 'preterm'), ('female', 'preterm')}
    assert sum(cohort['n'] for cohort in mini['cohorts']) == mini['source']['participants']
    for cohort in mini['cohorts']:
        assert [point['visitId'] for point in cohort['points']] == ['day7', 'month3']
        for point in cohort['points']:
            check_median(point)
            assert point['n'] <= cohort['n']
            assert 0 <= point['belowLoq'] <= point['n']
            assert point['iqrLowerBelowLoq'] == (point['iqr'][0] < mini['source']['loq'])
    assert sum(point['belowLoq'] for cohort in mini['cohorts']
               for point in cohort['points']) == 11

    assert tanner['stageType'] == 'G' and tanner['sex'] == 'male'
    assert tanner['source']['specimen'] == 'plasma'
    assert [point['stage'] for point in tanner['points']] == [1, 2, 3, 4, 5]
    assert sum(point['n'] for point in tanner['points']) == tanner['source']['participants']
    assert tanner['source']['ghTreatedSamples'] == 135
    for point in tanner['points']:
        check_median(point)

    assert senior['source']['statistic'] == 'arithmetic-mean'
    assert senior['sex'] == 'male'
    assert len(senior['groups']) == 5
    assert sum(group['n'] for group in senior['groups']) == senior['source']['participants']
    for group in senior['groups']:
        assert group['minAge'] < group['maxAge']
        assert all(math.isfinite(group[key]) and group[key] > 0 for key in ('mean', 'sd'))
    assert senior['ageRouting']['patientComparisonGroups'] == [
        {'groupId': '80-90', 'minAge': 80, 'maxAge': 90, 'maxAgeExclusive': True},
        {'groupId': '90-101', 'minAge': 90, 'maxAge': 101, 'maxAgeExclusive': False}]
    active_groups = [group for group in senior['groups'] if group['active']]
    assert [group['id'] for group in active_groups] == ['80-90', '90-101']
    for group, routing in zip(active_groups, senior['ageRouting']['patientComparisonGroups']):
        assert group['minAge'] == routing['minAge']
        assert group['maxAge'] == routing['maxAge']
        assert group['applicationMaxAgeExclusive'] == routing['maxAgeExclusive']

    def project(source, keys):
        return {key: source[key] for key in keys}

    return {
        'version': '2026-10-10.1',
        'purpose': 'educational-inhibin-b-group-observations',
        'notClinicalReference': True,
        'mini': project(mini, ('source', 'ageBasis', 'birthGroupDefinitions', 'visits',
                              'cohorts', 'displayPolicy')),
        'tanner': project(tanner, ('source', 'sex', 'stageType', 'points', 'displayPolicy')),
        'senior': project(senior, ('source', 'sex', 'groups', 'ageRouting', 'displayPolicy')),
        'excludedSources': [{
            'id': 'de-schepper2000',
            'doi': '10.1007/s004310051309',
            'url': 'https://doi.org/10.1007/s004310051309',
            'reason': 'Niejednoznaczne liczebności, średnia/mediana i sprzeczne maksima '
                      'podgrup w pełnym tekście. Brak danych liczbowych w aplikacji '
                      'do czasu wyjaśnienia rozbieżności.'
        }]
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = json.dumps(build(), ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != content:
            raise SystemExit('FAIL: inhibin-observational-data.json is stale; '
                             'run build_inhibin_observational_data.py')
        print('PASS: inhibin observations reproduce the factual source extracts')
    else:
        OUTPUT.write_text(content, encoding='utf-8')
        print(OUTPUT.name)
