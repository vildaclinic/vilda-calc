"""Assemble auditable educational curves. No reference intervals or patient scoring.

All numerical points retain source units. One maximum rescales each hormone.
Original group summaries are retained as evidence, not spliced into one model.
Display segments separate source models from qualitative, smoothly joined schematics.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).parent
EVIDENCE = ROOT / 'evidence'

def read(name):
    return json.loads((EVIDENCE / name).read_text())

infant = json.loads((ROOT / 'female-reference-data.json').read_text())['femaleInfantMedians']
groups = read('ljubicic2020-lh-fsh-group-summaries.json')
puberty = read('madsen2022-female-median-si.json')
amh = read('amh-access-groups.json')
inhb = read('inhb-digitized-median.json')
adult = read('adult-menopause-source-extraction.json')
profiles = {}

def infant_points(hormone):
    return [dict(ageYears=p['ageYears'], value=p['median'], source='ljubicic2022', statistic='model_median')
            for p in infant['hormones'][hormone]['points']]

def finish(hormone, points, unit, **meta):
    ages = [p['ageYears'] for p in points]
    assert all(math.isfinite(p['value']) and p['value'] >= 0 for p in points)
    assert all(a < b for a, b in zip(ages, ages[1:]))
    extra = meta.get('adultPhaseSummary', {}).get('upper', 0)
    maximum = max(extra, max(p['value'] for p in points))
    profiles[hormone] = dict(unit=unit, normalizationMaximum=maximum, points=points, **meta)

for hormone in ['lh', 'fsh']:
    points = infant_points(hormone)
    for band in groups['hormones'][hormone]['bands'][1:]:
        upper = band['observedStudyMaximumAgeYears'] or band['maxAgeYears']
        points.append(dict(ageYears=(band['minAgeYears']+upper)/2,
                           value=band['female']['value'], source='ljubicic2020',
                           statistic=groups['statistic'], sourceAgeBand=band['sourceAgeBand'],
                           n=band['female']['n'], agePlacement='display_midpoint_not_reported_age'))
    finish(hormone, points, 'IU/L', illustrativeRanges=[[1, 6]],
           notes=['AutoDELFIA in both studies; models and group summaries are different statistics.',
                  'The source label 70–100 does not imply observations after 80; last marker is placed at75.',
                  'The female20–<40 group contains only17 participants.',
                  'Source table does not define its summary as a mean or median.'])

points = infant_points('amh')
for g in amh['pediatric']['groups']:
    points.append(dict(ageYears=g['illustrationMidpointYears'], value=g['median'], source='jopling2018',
                       statistic='group_median', n=g['n'], sourceAgeBand=[g['ageMinYears'], g['ageMaxYears']],
                       agePlacement='display_midpoint_not_reported_age', matrix='lithium-heparin plasma'))
for g in amh['adult']['groups']:
    points.append(dict(ageYears=g['illustrationMidpointYears'], value=g['plasmaMedianPmolL'], source='fda_k170524',
                       statistic='group_median', n=g['n'], sourceAgeBand=[g['ageMinYears'], g['ageMaxYears']],
                       agePlacement='display_midpoint_not_reported_age', matrix='plasma'))
finish('amh', points, 'pmol/L', illustrativeRanges=[[1, 2.95], [16.95, 21.5]],
       qualitativeTail=dict(fromAgeYears=43, lowByAgeYears=55, toAgeYears=75, displayFloor=0.012,
                            source='sowers2008', meaning='Qualitative decline and low postmenopausal state; no concentration or age-specific prediction.'),
       notes=['Access family assays; infant serum and older plasma cohorts are not an assay conversion.',
              'Do not interpret minor oscillations between small pediatric groups as established physiological peaks.',
              'Adult selection: regular cycles and proven fertility. Numerical data end with41–45 group.'])

points = infant_points('inhb')
for p in inhb['points']:
    points.append(dict(ageYears=p['ageYears'], value=p['approxMedianPgMl'], source='borelli2025',
                       statistic='digitized_model_median', approximateTolerance=2))
finish('inhb', points, 'pg/mL', illustrativeRanges=[[1, 5.6]],
       qualitativeTail=dict(fromAgeYears=47, lowByAgeYears=55, toAgeYears=75, displayFloor=0.012,
                            source='borelli2025_sowers2008', meaning='Low or undetectable, not literal zero; no numeric imputation below3pg/mL.'),
       notes=['Same GenII assay, separately fitted infant and later models.',
              'Later median was digitized fromFigure1, approximately±2pg/mL.',
              'No source-derived points in the gap1.08–5.6years;149adultwomen, cycle phase not standardized.'])

points = infant_points('e2')
points.extend(dict(ageYears=p['ageYears'], value=p['median'], source='madsen2022', statistic='model_median')
              for p in puberty['hormones']['e2']['points'])
e2adult = adult['preferredAdultEstradiol']
early = e2adult['phasePoints'][0]['median']
low, high = e2adult['ageYears']
points.extend(dict(ageYears=age, value=early, source='frederiksen2020', statistic='early_follicular_group_median',
                   agePlacement='group_age_boundary_not_age_specific_median') for age in [low, high])
post = adult['preferredPostmenopausalEstradiol']['medianAllPmolL']
points.extend(dict(ageYears=age, value=post, source='cui2026', statistic='pooled_postmenopausal_median',
                   agePlacement='illustrative_postmenopausal_stage_not_age_specific_median') for age in [55, 75])
finish('e2', points, 'pmol/L', illustrativeRanges=[[1, 6], [18, low], [high, 55]],
       adultPhaseSummary=dict(minAgeYears=low, maxAgeYears=high, lower=early,
                            upper=max(p['median'] for p in e2adult['phasePoints']), source='frederiksen2020',
                            meaning='Archived phase medians used for scale; NOT drawn as a band on the lifespan axis, not a pooled median.'),
       notes=['Adult156 is archived early-follicular evidence only; NEVER use it as a lifespan display anchor.',
              'Infant and adult Frederiksen method compatible; puberty and postmenopausal cohorts differ.',
              'Post median18 verified from primary abstract; mixed cohorts harmonized toCDC, not one common assay.',
              'Menopause transition age is illustrative; no universal premenopausal E2 hump.'])

# The renderer consumes ONLY displaySegments outside the infant enlargement.
# Raw points remain unchanged for audit. A schematic coordinate has no unit and
# is never a replacement mean/median or a reference interval.
def relative_at(hormone, age):
    h = profiles[hormone]
    return next(p['value'] for p in h['points'] if p['ageYears'] == age) / h['normalizationMaximum']

def model_segment(hormone, start, end, source):
    h = profiles[hormone]
    return dict(kind='model', source=source,
                points=[dict(ageYears=p['ageYears'], relative=p['value']/h['normalizationMaximum'])
                        for p in h['points'] if start <= p['ageYears'] <= end],
                meaning='Published population model; display joins use shape-preserving smoothing without changing source nodes.')

def schematic_segment(nodes, sources, meaning):
    return dict(kind='schematic', sources=sources,
                points=[dict(ageYears=age, relative=height) for age, height in nodes],
                meaning=meaning,
                agePlacement='Illustrative timing, not exact peak age or menopause prediction.',
                unit=None)

for hormone, h in profiles.items():
    h['displaySegments'] = [model_segment(hormone, .02, 1, 'ljubicic2022')]

for hormone in ['lh', 'fsh']:
    h = profiles[hormone]
    adult_level = relative_at(hormone, 30)
    post_level = relative_at(hormone, 55 if hormone == 'lh' else 65)
    # Discrete cross-sectional groups do not locate a physiological peak at14,
    # trough at18 or late-life LH peak at65. Show only the broad direction.
    nodes = [(age, relative_at(hormone, age)) for age in [6, 8, 10, 12]]
    nodes += [(16, adult_level), (20, adult_level), (40, adult_level),
              (45, relative_at(hormone, 45)), (55, relative_at(hormone, 55)),
              (65, post_level), (75, post_level)]
    h['displaySegments'].append(schematic_segment(nodes, ['ljubicic2020'],
        'Broad pubertal rise, reproductive plateau and menopausal rise. Group summaries guide relative heights; '
        'their local reversals and midpoint ages are not treated as physiological peaks or troughs.'))
    h['evidenceGaps'] = [dict(fromAgeYears=1, toAgeYears=6,
        reason='No comparable age-resolved observations between infant model and older age-group summaries.')]

h = profiles['amh']
adult_level = relative_at('amh', 28)
# In the overview only, broaden the visual turn around the first birthday.
# Keeping every .01-year knot here would concentrate the zero-slope turn into
# a subpixel interval and look like a corner. Detailed minipuberty is unchanged.
h['displaySegments'][0] = model_segment('amh', .02, .9, 'ljubicic2022')
h['displaySegments'].append(schematic_segment(
    [(.9, relative_at('amh', .9)), (1.3, relative_at('amh', 1)), (3, relative_at('amh', 1)),
     (16.95, relative_at('amh', 16.95)),
     (21.5, adult_level), (28, adult_level),
     *[(age, relative_at('amh', age)) for age in [33, 38, 43]],
     (55, h['qualitativeTail']['displayFloor']), (75, h['qualitativeTail']['displayFloor'])],
    ['jopling2018', 'fda_k170524', 'sowers2008'],
    'Illustrative shoulder after infancy, broad childhood rise, young-adult plateau and subsequent decline. '
    'The0.9–1.3year visual blend and early-childhood shoulder are screen geometry only; detailed infant data are unchanged. '
    'Do not force an early rebound through the pooled1–4.9year median. '
    'No exact peak at28; no numerical concentration beyond the41–45 age group.'))
h['evidenceGaps'] = [dict(fromAgeYears=1, toAgeYears=2.95,
    reason='Infant serum model and pooled1–4.9-year hospital plasma median cannot establish a rebound after infancy.')]

h = profiles['inhb']
h['displaySegments'].append(model_segment('inhb', 5.6, 47, 'borelli2025'))
h['displaySegments'].append(schematic_segment(
    [(47, relative_at('inhb', 47)), (55, h['qualitativeTail']['displayFloor']),
     (75, h['qualitativeTail']['displayFloor'])], ['borelli2025', 'sowers2008'],
    'Low or undetectable late-life state only. Neither an exact age of loss of detectability nor imputed concentrations.'))
h['evidenceGaps'] = [dict(fromAgeYears=1, toAgeYears=5.6,
    reason='The later study has no observed female cohort between1.08 and5.6years and leaves a gap.')]

h = profiles['e2']
h['displaySegments'].append(model_segment('e2', 6, 18, 'madsen2022'))
adult_level = relative_at('e2', 18)
post_level = relative_at('e2', 55)
h['displaySegments'].append(schematic_segment(
    [(18, adult_level), (30, adult_level), (45, adult_level), (55, post_level), (75, post_level)],
    ['madsen2022', 'frederiksen2020', 'cui2026', 'swan2011'],
    'Adult plateau holds the terminal pubertal screen height, not an estimated adult concentration. '
    'Never join mixed-cycle adolescent p50 to the early-follicular median156. '
    'Menopausal decline and pooled postmenopausal level are a qualitative stage schematic, not an age model.'))
h['evidenceGaps'] = [dict(fromAgeYears=1, toAgeYears=6,
    reason='No matched data between separate infant and childhood LC-MS/MS models.')]

# Continuous educational overview requested by the owner. Bridging a missing
# interval is display-only, never a new observation or assay conversion.
# AMH already has its broad shoulder/rise and does not use the pooled toddler
# median as a timed waypoint. Other bridges are monotone between their ends.
for hormone, h in profiles.items():
    if hormone == 'amh':
        continue
    left, right = h['displaySegments'][:2]
    a, b = left['points'][-1], right['points'][0]
    bridge = schematic_segment([(a['ageYears'], a['relative']), (b['ageYears'], b['relative'])],
        ['ljubicic2022', right.get('source') or right['sources'][0]],
        'Illustrative monotone childhood bridge only. Not measured ages, a concentration model, or an assay conversion.')
    bridge['role'] = 'childhood_bridge'
    h['displaySegments'].insert(1, bridge)

cycle_source = adult['cycleIndependentCrossCheck']
cycle_phases = [
    ('earlyFollicular', 0, 4.333), ('intermediateFollicular', 4.334, 8.667),
    ('lateFollicular', 8.668, 13), ('ovulation', 14, 16),
    ('earlyLuteal', 17, 20.333), ('intermediateLuteal', 20.334, 24.667),
    ('lateLuteal', 24.668, 29)
]
medians = cycle_source['e2SubphaseMediansPmolL']
peak = max(medians.values())
cycle_points = [dict(day=1, relative=medians['earlyFollicular']/peak, role='illustrative_start')]
for phase, a, b in cycle_phases:
    cycle_points.append(dict(day=round(1+((a+b)/2-1)*27/28, 6), relative=medians[phase]/peak,
                             phase=phase, role='illustrative_position_of_phase_median'))
cycle_points.append(dict(day=28, relative=medians['earlyFollicular']/peak, role='illustrative_return_not_a_published_day28_median'))
cycle = dict(sourceDoi=cycle_source['doi'], sourceUrl=cycle_source['url'],
             source='Anckaert2021 Table1, SupplementaryTable3', sourceStandardizedCycleDays=29,
             illustrativeCycleDays=28, sourcePhases=[dict(phase=k, firstDay=a, lastDay=b, medianPmolL=medians[k]) for k,a,b in cycle_phases],
             points=cycle_points,
             notes=['Phase medians are placed at rescaled representative phase midpoints, not measured daily medians.',
                    'The final low point is an illustrative cycle closure, not a laboratory measurement.',
                    'Different assay from the lifespan E2 cohorts: independent relative schematic only.',
                    'No patient cycle day, ovulation prediction, concentration tooltips or reference intervals.'])
result = dict(version='2026-10-09.5', purpose='Educational synthesis, not a validated continuous lifespan model.',
              normalization='One linear divisor per hormone for all numerical age segments; no infantHeight multiplier.',
              gapConvention='Source gaps use dashed, shape-preserving display bridges, never new concentrations. AMH uses a broad shoulder instead of a forced toddler rebound.',
              hormones=profiles, cycleSchematic=cycle)
(ROOT / 'female-lifespan-data.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print('female-lifespan-data.json')
