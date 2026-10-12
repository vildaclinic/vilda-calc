"""Regression checks for clinically meaningful source/scale mistakes in the mock."""
from pathlib import Path
import json
import math

ROOT = Path(__file__).parent
life = json.loads((ROOT / 'female-lifespan-data.json').read_text())['hormones']
infant = json.loads((ROOT / 'female-reference-data.json').read_text())['femaleInfantMedians']['hormones']

for key, h in life.items():
    points = h['points']
    assert all(a['ageYears'] < b['ageYears'] for a, b in zip(points, points[1:]))
    assert all(math.isfinite(p['value']) and p['value'] >= 0 and p['source'] for p in points)
    expected = max(max(p['value'] for p in points), h.get('adultPhaseSummary', {}).get('upper', 0))
    assert h['normalizationMaximum'] == expected
    assert points[:99] == [dict(ageYears=p['ageYears'], value=p['median'], source='ljubicic2022', statistic='model_median') for p in infant[key]['points']]

def point(h, age):
    return next(p for p in life[h]['points'] if p['ageYears'] == age)

# These directions were reversed or greatly distorted by old independent infantHeight multipliers.
assert max(p['median'] for p in infant['lh']['points']) < point('lh', 30)['value'] / 10
assert 0.8 < max(p['median'] for p in infant['fsh']['points']) / point('fsh', 30)['value'] < 1.2
assert max(p['median'] for p in infant['inhb']['points']) > point('inhb', 20)['value'] > point('inhb', 40)['value']
assert max(p['median'] for p in infant['e2']['points']) < point('e2', 24.7)['value'] / 5

# Archived estradiol evidence is preserved; the early-follicular median must
# NOT become the adult display line or be renamed as an all-phase mean.
assert point('e2', 24.7)['value'] == point('e2', 43.9)['value'] == 156
assert life['e2']['adultPhaseSummary']['lower'] == 156
assert life['e2']['adultPhaseSummary']['upper'] == life['e2']['normalizationMaximum'] == 264
assert point('e2', 55)['value'] == 18
assert not any(p['value'] == 303 for p in life['e2']['points'])

# Source gaps are explicitly schematic, never new observations; their display
# endpoints meet exactly so the educational overview has no holes or jumps.
bridge_ends = {'lh': 6, 'fsh': 6, 'e2': 6, 'inhb': 5.6}
for key, h in life.items():
    segments = h['displaySegments']
    first = segments[0]
    assert first['kind'] == 'model' and first['source'] == 'ljubicic2022'
    display_infant_end = .9 if key == 'amh' else 1
    assert first['points'] == [dict(ageYears=p['ageYears'], relative=p['median']/h['normalizationMaximum'])
                               for p in infant[key]['points'] if p['ageYears'] <= display_infant_end]
    assert segments[1]['points'][0]['ageYears'] == display_infant_end
    assert h['evidenceGaps'][0]['fromAgeYears'] == 1
    assert segments[1]['kind'] == 'schematic'
    if key != 'amh':
        assert segments[1]['role'] == 'childhood_bridge'
        assert segments[1]['points'][-1]['ageYears'] == bridge_ends[key]
    for a, b in zip(segments, segments[1:]):
        assert a['points'][-1] == b['points'][0]
    for segment in segments:
        assert all(a['ageYears'] < b['ageYears'] for a, b in zip(segment['points'], segment['points'][1:]))
        assert all(0 <= p['relative'] <= 1 and 'value' not in p for p in segment['points'])
        if segment['kind'] == 'schematic':
            assert segment['unit'] is None and segment['meaning']
        else:
            for p in segment['points']:
                assert math.isclose(p['relative'], point(key, p['ageYears'])['value']/h['normalizationMaximum'])

def display_nodes(key):
    return {p['ageYears']: p['relative'] for s in life[key]['displaySegments'] for p in s['points']}

# No spurious decline from a mixed-cycle puberty median into one adult phase.
e2_display = display_nodes('e2')
assert e2_display[18] == e2_display[30] == e2_display[45]
assert e2_display[45] > e2_display[55] == e2_display[75]
assert e2_display[30] != 156/life['e2']['normalizationMaximum']

# Cross-sectional group wiggles do not become obligatory developmental stages.
for key in ['lh', 'fsh']:
    d = display_nodes(key)
    values = [d[a] for a in sorted(d) if a >= 6]
    assert all(a <= b for a, b in zip(values, values[1:]))
    assert d[16] == d[20] == d[40]
    assert d[65] == d[75]
amh_display = display_nodes('amh')
assert amh_display[.9] > amh_display[1.3] == amh_display[3]
assert amh_display[1.3] == point('amh', 1)['value']/life['amh']['normalizationMaximum']
assert amh_display[3] < amh_display[16.95] < amh_display[21.5] == amh_display[28]
assert 2.95 not in amh_display  # no rapid rebound forced by a pooled toddler median
assert point('amh', 2.95)['value'] == 14.58  # original evidence is still retained
assert all(amh_display[a] > amh_display[b] for a, b in zip([28,33,38,43], [33,38,43,55]))
assert amh_display[55] == amh_display[75]

# The inhibin B pubertal hump is in the source model and must not be flattened.
inhb_display = display_nodes('inhb')
assert inhb_display[13] > inhb_display[18] > inhb_display[20] > inhb_display[40]
assert life['inhb']['displaySegments'][2]['kind'] == 'model'
assert life['inhb']['displaySegments'][3]['kind'] == 'schematic'

# The XLSX M parameter is logarithmic; independently check the archived source cell transformation.
puberty = json.loads((ROOT / 'evidence/madsen2022-female-median-si.json').read_text())
for p in puberty['hormones']['e2']['points']:
    assert math.isclose(point('e2', p['ageYears'])['value'], math.exp(p['M_logSIx1e6']) / 1e6)

# Group central values must not acquire unsupported median/individual-age semantics.
assert all(p['statistic'] != 'model_median' and 'midpoint' in p['agePlacement']
           for h in ['lh', 'fsh'] for p in life[h]['points'] if p['source'] == 'ljubicic2020')
assert all(p['matrix'] == 'plasma' for p in life['amh']['points'] if p['source'] == 'fda_k170524')
assert point('amh', 28)['value'] == 28.99
for h, last_age in [('amh', 43), ('inhb', 47)]:
    assert life[h]['points'][-1]['ageYears'] == last_age
    assert life[h]['qualitativeTail']['fromAgeYears'] == last_age
    assert 'value' not in life[h]['qualitativeTail']  # display floor is never a clinical concentration

cycle = json.loads((ROOT / 'female-lifespan-data.json').read_text())['cycleSchematic']
assert cycle['sourceStandardizedCycleDays'] == 29 and cycle['illustrativeCycleDays'] == 28
assert [p['medianPmolL'] for p in cycle['sourcePhases']] == [125,172,464,817,390,505,396]
assert cycle['points'][-1]['role'] == 'illustrative_return_not_a_published_day28_median'
assert all(a['day'] < b['day'] for a,b in zip(cycle['points'],cycle['points'][1:]))
assert all(0 < p['relative'] <= 1 for p in cycle['points'])
print('PASS: source values retained, continuous schematic bridges, AMH shoulder without toddler jump, no false transition peaks, cycle schematic')
