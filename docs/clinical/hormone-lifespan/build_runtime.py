"""Build the readable browser data module from approved educational sources.

Run build_evidence.py and verify_evidence.py first when changing evidence.
For exact inhibin B group observations, run build_inhibin_observational_data.py.
This packaging step does not interpolate, normalize, or reinterpret any data.
The browser has no build/runtime dependency on Python or these source files.
"""
from pathlib import Path
import argparse
import json


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[2] / 'vilda_hormone_lifespan_data.js'


def build():
    male = (ROOT / 'schematic-data.js').read_text(encoding='utf-8').strip()
    reference = json.loads((ROOT / 'female-reference-data.json').read_text(encoding='utf-8'))
    lifespan = json.loads((ROOT / 'female-lifespan-data.json').read_text(encoding='utf-8'))
    patient_points = json.loads((ROOT / 'population-reference-data.json').read_text(encoding='utf-8'))
    inhibin_evidence = json.loads((ROOT / 'inhibin-observational-data.json').read_text(encoding='utf-8'))
    inhibin_display_policy = json.loads((ROOT / 'inhibin-display-policy.json').read_text(encoding='utf-8'))
    inhibin_comparison_policy = json.loads((ROOT / 'inhibin-comparison-policy.json').read_text(encoding='utf-8'))
    inhibin_comparison_reference = json.loads((ROOT / 'inhibin-comparison-reference-data.json').read_text(encoding='utf-8'))
    testosterone_display_policy = json.loads((ROOT / 'testosterone-display-policy.json').read_text(encoding='utf-8'))
    lh_fsh_display_policy = json.loads((ROOT / 'lh-fsh-display-policy.json').read_text(encoding='utf-8'))
    amh_display_policy = json.loads((ROOT / 'amh-display-policy.json').read_text(encoding='utf-8'))
    amh_comparison_policy = json.loads((ROOT / 'amh-comparison-policy.json').read_text(encoding='utf-8'))
    amh_lilacs_source_data = json.loads((ROOT / 'amh-lilacs-source-data.json').read_text(encoding='utf-8'))
    e2_phase_source_data = json.loads((ROOT / 'e2-phase-source-data.json').read_text(encoding='utf-8'))
    fsh_source_data = json.loads((ROOT / 'fsh-source-data.json').read_text(encoding='utf-8'))
    fsh_d3_data = json.loads((ROOT / 'fsh-d3-data.json').read_text(encoding='utf-8'))
    e2_d3_data = json.loads((ROOT / 'e2-d3-data.json').read_text(encoding='utf-8'))
    fsh_cycle_display_policy = json.loads((ROOT / 'fsh-cycle-display-policy.json').read_text(encoding='utf-8'))
    insl3_display_policy = json.loads((ROOT / 'insl3-display-policy.json').read_text(encoding='utf-8'))
    insl3_age_source_data = json.loads((ROOT / 'insl3-age-source-data.json').read_text(encoding='utf-8'))
    insl3_age_source_policy = json.loads((ROOT / 'insl3-age-source-policy.json').read_text(encoding='utf-8'))
    female_tt_age_data = json.loads((ROOT / 'female-tt-age-data.json').read_text(encoding='utf-8'))
    female_tt_age_policy = json.loads((ROOT / 'female-tt-age-policy.json').read_text(encoding='utf-8'))
    female_tt_under6_data = json.loads((ROOT / 'female-tt-under6-data.json').read_text(encoding='utf-8'))
    female_tt_under6_policy = json.loads((ROOT / 'female-tt-under6-policy.json').read_text(encoding='utf-8'))
    male_e2_age_data = json.loads((ROOT / 'male-e2-age-data.json').read_text(encoding='utf-8'))
    male_e2_age_policy = json.loads((ROOT / 'male-e2-age-policy.json').read_text(encoding='utf-8'))
    male_e2_adult_age_data = json.loads((ROOT / 'male-e2-adult-age-data.json').read_text(encoding='utf-8'))
    male_e2_adult_age_policy = json.loads((ROOT / 'male-e2-adult-age-policy.json').read_text(encoding='utf-8'))
    female_gonadotropin_policy = json.loads((ROOT / 'female-gonadotropin-display-policy.json').read_text(encoding='utf-8'))
    female_gonadotropin_data = json.loads((ROOT / 'female-gonadotropin-display-data.json').read_text(encoding='utf-8'))
    female_gonadotropin_reference_policy = json.loads((ROOT / 'female-gonadotropin-reference-policy.json').read_text(encoding='utf-8'))
    female_estradiol_reference_policy = json.loads((ROOT / 'female-estradiol-reference-policy.json').read_text(encoding='utf-8'))
    fsh_caliper_reference_policy = json.loads((ROOT / 'fsh-caliper-reference-policy.json').read_text(encoding='utf-8'))
    male_amh_young_adult_reference_policy = json.loads((ROOT / 'male-amh-young-adult-reference-policy.json').read_text(encoding='utf-8'))
    male_lh_caliper_reference_policy = json.loads((ROOT / 'male-lh-caliper-reference-policy.json').read_text(encoding='utf-8'))
    gonadotropin_comparison_policy = json.loads((ROOT / 'gonadotropin-comparison-policy.json').read_text(encoding='utf-8'))
    gonadotropin_comparison_reference = json.loads((ROOT / 'gonadotropin-comparison-reference-data.json').read_text(encoding='utf-8'))
    reference_js = json.dumps(reference, ensure_ascii=False, indent=2)
    lifespan_js = json.dumps(lifespan, ensure_ascii=False, indent=2)
    patient_points_js = json.dumps(patient_points, ensure_ascii=False, indent=2)
    result_only_policy = json.loads((ROOT / 'female-lh-result-only-policy.json').read_text(encoding='utf-8'))
    assert (result_only_policy['kind'], result_only_policy['ordinaryOnly'],
            result_only_policy['analyte'], result_only_policy['sex'], result_only_policy['unit']) == (
                'educational-result-only', True, 'lh', 'female', 'IU/L')
    assert (result_only_policy['minAge'], result_only_policy['minAgeExclusive'],
            result_only_policy['maxAge'], result_only_policy['maxAgeExclusive']) == (16, True, 18, True)
    assert not any(key in result_only_policy for key in ('points', 'statistic', 'referenceValue'))
    result_only_policies_js = json.dumps([result_only_policy], ensure_ascii=False, indent=2)
    childhood_lh_result_only_policies = json.loads((ROOT / 'childhood-lh-result-only-policy.json').read_text(encoding='utf-8'))
    assert len(childhood_lh_result_only_policies) == 2
    assert [policy['sex'] for policy in childhood_lh_result_only_policies] == ['male', 'female']
    for policy in childhood_lh_result_only_policies:
        assert (policy['kind'], policy['ordinaryOnly'], policy['analyte'], policy['unit']) == (
            'educational-result-only', True, 'lh', 'IU/L')
        assert (policy['minAge'], policy['minAgeExclusive'], policy['maxAge'], policy['maxAgeExclusive']) == (
            1, policy['sex'] == 'female', 6, True)
        assert policy['fullAgeIntervalRequired'] is True and policy['currentPatientOnly'] is True
        assert policy['contextAvailabilityKey'] == 'childhoodLhContextAvailable'
        assert policy['wholeLifeResultNote'] == 'Sam wynik zobaczysz w „Całym życiu”, bez mediany.'
        assert not any(key in policy for key in ('points', 'statistic', 'referenceValue'))
        note = policy['sourceNote']
        assert (note['kind'], note['minAge'], note['maxAge'], note['maxAgeExclusive']) == (
            'censored-group-median', 2, 6, True)
        assert note['closedSourcesOnly'] is True and note['notNumericReference'] is True
        assert note['literalP50'] == '<0,07 U/L' and note['sourceAgeGroup']['n'] == 282
    childhood_lh_result_only_policies_js = json.dumps(childhood_lh_result_only_policies, ensure_ascii=False, indent=2)
    infant_lh_tail_policy = json.loads((ROOT / 'male-lh-infant-tail-policy.json').read_text(encoding='utf-8'))
    assert (infant_lh_tail_policy['kind'], infant_lh_tail_policy['profileId']) == (
        'educational-infant-lh-tail-display', 'busch2022-male-lh')
    infant_lh_profile = next(profile for profile in patient_points['profiles']
                             if profile['id'] == infant_lh_tail_policy['profileId'])
    assert infant_lh_profile['numericReferencePolicy'] == infant_lh_tail_policy['numericReference']
    infant_result_only = infant_lh_tail_policy['resultOnlyPolicy']
    assert (infant_result_only['kind'], infant_result_only['sourceProfileId'],
            infant_result_only['minAge'], infant_result_only['minAgeExclusive'],
            infant_result_only['maxAge'], infant_result_only['maxAgeExclusive']) == (
        'educational-result-only', 'busch2022-male-lh', 326 / 365.25, True, 1, True)
    assert infant_result_only['fullAgeIntervalRequired'] is True and infant_result_only['currentPatientOnly'] is True
    assert infant_result_only['contextAvailabilityKey'] == 'infantLhContextAvailable'
    assert not any(key in infant_result_only for key in ('points', 'statistic', 'referenceValue'))
    infant_lh_tail_policy_js = json.dumps(infant_lh_tail_policy, ensure_ascii=False, indent=2)
    infant_tt_result_only_policy = json.loads((ROOT / 'male-testosterone-infant-result-only-policy.json').read_text(encoding='utf-8'))
    assert (infant_tt_result_only_policy['kind'], infant_tt_result_only_policy['profileId']) == (
        'educational-infant-tt-result-only-display', 'busch2022-male-t')
    infant_tt_result_only = infant_tt_result_only_policy['resultOnlyPolicy']
    assert (infant_tt_result_only['kind'], infant_tt_result_only['sourceProfileId'],
            infant_tt_result_only['minAge'], infant_tt_result_only['minAgeExclusive'],
            infant_tt_result_only['maxAge'], infant_tt_result_only['maxAgeExclusive']) == (
        'educational-result-only', 'busch2022-male-t', 212 / 365.25, True, 1, True)
    assert infant_tt_result_only['fullAgeIntervalRequired'] is True and infant_tt_result_only['currentPatientOnly'] is True
    assert infant_tt_result_only['contextAvailabilityKey'] == 'infantTtContextAvailable'
    assert not any(key in infant_tt_result_only for key in ('points', 'statistic', 'referenceValue'))
    infant_tt_result_only_policy_js = json.dumps(infant_tt_result_only_policy, ensure_ascii=False, indent=2)
    # Preserve this unchanged readable JSON's layout in the generated module.
    # Parsing above still verifies JSON; repacking other data must not reformat it.
    inhibin_evidence_js = (ROOT / 'inhibin-observational-data.json').read_text(encoding='utf-8').strip()
    inhibin_display_policy_js = json.dumps(inhibin_display_policy, ensure_ascii=False, indent=2)
    inhibin_comparison_policy_js = json.dumps(inhibin_comparison_policy, ensure_ascii=False, indent=2)
    inhibin_comparison_reference_js = json.dumps(inhibin_comparison_reference, ensure_ascii=False, indent=2)
    testosterone_display_policy_js = json.dumps(testosterone_display_policy, ensure_ascii=False, indent=2)
    lh_fsh_display_policy_js = json.dumps(lh_fsh_display_policy, ensure_ascii=False, indent=2)
    amh_display_policy_js = json.dumps(amh_display_policy, ensure_ascii=False, indent=2)
    amh_comparison_policy_js = json.dumps(amh_comparison_policy, ensure_ascii=False, indent=2)
    amh_lilacs_source_data_js = json.dumps(amh_lilacs_source_data, ensure_ascii=False, indent=2)
    e2_phase_source_data_js = json.dumps(e2_phase_source_data, ensure_ascii=False, indent=2)
    fsh_source_data_js = json.dumps(fsh_source_data, ensure_ascii=False, indent=2)
    fsh_d3_data_js = json.dumps(fsh_d3_data, ensure_ascii=False, indent=2)
    e2_d3_data_js = json.dumps(e2_d3_data, ensure_ascii=False, indent=2)
    fsh_cycle_display_policy_js = json.dumps(fsh_cycle_display_policy, ensure_ascii=False, indent=2)
    insl3_display_policy_js = json.dumps(insl3_display_policy, ensure_ascii=False, indent=2)
    assert (insl3_age_source_data['kind'], insl3_age_source_data['clinicalActivation'],
            insl3_age_source_policy['kind'], insl3_age_source_policy['clinicalActivation'],
            insl3_age_source_policy['sourceId']) == (
                'digitized-age-source-data', False, 'educational-age-source-reading', False,
                insl3_age_source_data['id'])
    # Preserve readable per-column source tuples without rounding or repacking.
    insl3_age_source_data_js = (ROOT / 'insl3-age-source-data.json').read_text(encoding='utf-8').strip()
    insl3_age_source_policy_js = json.dumps(insl3_age_source_policy, ensure_ascii=False, indent=2)
    female_tt_age_data_js = json.dumps(female_tt_age_data, ensure_ascii=False, indent=2)
    female_tt_age_policy_js = json.dumps(female_tt_age_policy, ensure_ascii=False, indent=2)
    female_tt_under6_data_js = json.dumps(female_tt_under6_data, ensure_ascii=False, indent=2)
    female_tt_under6_policy_js = json.dumps(female_tt_under6_policy, ensure_ascii=False, indent=2)
    male_e2_age_data_js = json.dumps(male_e2_age_data, ensure_ascii=False, indent=2)
    male_e2_age_policy_js = json.dumps(male_e2_age_policy, ensure_ascii=False, indent=2)
    male_e2_adult_age_data_js = json.dumps(male_e2_adult_age_data, ensure_ascii=False, indent=2)
    male_e2_adult_age_policy_js = json.dumps(male_e2_adult_age_policy, ensure_ascii=False, indent=2)
    female_gonadotropin_policy_js = json.dumps(female_gonadotropin_policy, ensure_ascii=False, indent=2)
    female_gonadotropin_data_js = json.dumps(female_gonadotropin_data, ensure_ascii=False, indent=2)
    female_gonadotropin_reference_policy_js = json.dumps(female_gonadotropin_reference_policy, ensure_ascii=False, indent=2)
    female_estradiol_reference_policy_js = json.dumps(female_estradiol_reference_policy, ensure_ascii=False, indent=2)
    fsh_caliper_reference_policy_js = json.dumps(fsh_caliper_reference_policy, ensure_ascii=False, indent=2)
    male_amh_young_adult_reference_policy_js = json.dumps(male_amh_young_adult_reference_policy, ensure_ascii=False, indent=2)
    male_lh_caliper_reference_policy_js = json.dumps(male_lh_caliper_reference_policy, ensure_ascii=False, indent=2)
    gonadotropin_comparison_policy_js = json.dumps(gonadotropin_comparison_policy, ensure_ascii=False, indent=2)
    gonadotropin_comparison_reference_js = json.dumps(gonadotropin_comparison_reference, ensure_ascii=False, indent=2)
    return (
        '/* Educational hormone lifespan data; not reference intervals or patient scoring.\n'
        ' * Generated by docs/clinical/hormone-lifespan/build_runtime.py.\n'
        ' * Sources, limitations and approved presentation: docs/clinical/HORMONE_LIFESPAN.md.\n'
        ' * Edit the readable sources and regenerate; do not edit this artifact separately.\n'
        ' */\n'
        '(function (root, factory) {\n'
        "  'use strict';\n"
        '  var data = factory();\n'
        "  if (typeof module === 'object' && module.exports) module.exports = data;\n"
        '  if (root) root.VildaHormoneLifespanData = data;\n'
        "})(typeof window !== 'undefined' ? window : null, function () {\n"
        f'{male}\n'
        f'const referenceData = {reference_js};\n'
        f'const lifespanData = {lifespan_js};\n'
        f'const patientPointData = {patient_points_js};\n'
        f'const resultOnlyPolicies = {result_only_policies_js};\n'
        f'const childhoodLhResultOnlyPolicies = {childhood_lh_result_only_policies_js};\n'
        f'const infantLhTailPolicy = {infant_lh_tail_policy_js};\n'
        f'const infantTtResultOnlyPolicy = {infant_tt_result_only_policy_js};\n'
        f'const inhibinEvidence = {inhibin_evidence_js};\n'
        f'const inhibinDisplayPolicy = {inhibin_display_policy_js};\n'
        f'const inhibinComparisonPolicy = {inhibin_comparison_policy_js};\n'
        f'const inhibinComparisonReferenceData = {inhibin_comparison_reference_js};\n'
        f'const testosteroneDisplayPolicy = {testosterone_display_policy_js};\n'
        f'const lhFshDisplayPolicy = {lh_fsh_display_policy_js};\n'
        f'const amhDisplayPolicy = {amh_display_policy_js};\n'
        f'const amhComparisonPolicy = {amh_comparison_policy_js};\n'
        f'const amhLilacsSourceData = {amh_lilacs_source_data_js};\n'
        f'const e2PhaseSourceData = {e2_phase_source_data_js};\n'
        f'const fshSourceData = {fsh_source_data_js};\n'
        f'const fshD3Data = {fsh_d3_data_js};\n'
        f'const e2D3Data = {e2_d3_data_js};\n'
        f'const fshCycleDisplayPolicy = {fsh_cycle_display_policy_js};\n'
        f'const insl3DisplayPolicy = {insl3_display_policy_js};\n'
        f'const insl3AgeSourceData = {insl3_age_source_data_js};\n'
        f'const insl3AgeSourcePolicy = {insl3_age_source_policy_js};\n'
        f'const femaleTtAgeData = {female_tt_age_data_js};\n'
        f'const femaleTtAgePolicy = {female_tt_age_policy_js};\n'
        f'const femaleTtUnder6Data = {female_tt_under6_data_js};\n'
        f'const femaleTtUnder6Policy = {female_tt_under6_policy_js};\n'
        f'const maleE2AgeData = {male_e2_age_data_js};\n'
        f'const maleE2AgePolicy = {male_e2_age_policy_js};\n'
        f'const maleE2AdultAgeData = {male_e2_adult_age_data_js};\n'
        f'const maleE2AdultAgePolicy = {male_e2_adult_age_policy_js};\n'
        f'const femaleGonadotropinPolicy = {female_gonadotropin_policy_js};\n'
        f'const femaleGonadotropinData = {female_gonadotropin_data_js};\n'
        f'const femaleGonadotropinReferencePolicy = {female_gonadotropin_reference_policy_js};\n'
        f'const femaleEstradiolReferencePolicy = {female_estradiol_reference_policy_js};\n'
        f'const fshCaliperReferencePolicy = {fsh_caliper_reference_policy_js};\n'
        f'const maleAmhYoungAdultReferencePolicy = {male_amh_young_adult_reference_policy_js};\n'
        f'const maleLhCaliperReferencePolicy = {male_lh_caliper_reference_policy_js};\n'
        f'const gonadotropinComparisonPolicy = {gonadotropin_comparison_policy_js};\n'
        f'const gonadotropinComparisonReferenceData = {gonadotropin_comparison_reference_js};\n'
        'return {\n'
        '  version: lifespanData.version,\n'
        '  maleAges: maleAges,\n'
        '  maleHormones: maleHormones,\n'
        '  maleStages: maleStages,\n'
        '  referenceData: referenceData,\n'
        '  lifespanData: lifespanData,\n'
        '  patientPointData: patientPointData,\n'
        '  resultOnlyPolicies: resultOnlyPolicies,\n'
        '  inhibinEvidence: inhibinEvidence,\n'
        '  inhibinDisplayPolicy: inhibinDisplayPolicy,\n'
        '  inhibinComparisonPolicy: inhibinComparisonPolicy,\n'
        '  inhibinComparisonReferenceData: inhibinComparisonReferenceData,\n'
        '  testosteroneDisplayPolicy: testosteroneDisplayPolicy,\n'
        '  lhFshDisplayPolicy: lhFshDisplayPolicy,\n'
        '  amhDisplayPolicy: amhDisplayPolicy,\n'
        '  amhComparisonPolicy: amhComparisonPolicy,\n'
        '  amhLilacsSourceData: amhLilacsSourceData,\n'
        '  e2PhaseSourceData: e2PhaseSourceData,\n'
        '  fshSourceData: fshSourceData,\n'
        '  fshD3Data: fshD3Data,\n'
        '  e2D3Data: e2D3Data,\n'
        '  fshCycleDisplayPolicy: fshCycleDisplayPolicy,\n'
        '  insl3DisplayPolicy: insl3DisplayPolicy,\n'
        '  insl3AgeSourceData: insl3AgeSourceData,\n'
        '  insl3AgeSourcePolicy: insl3AgeSourcePolicy,\n'
        '  femaleTtAgeData: femaleTtAgeData,\n'
        '  femaleTtAgePolicy: femaleTtAgePolicy,\n'
        '  femaleTtUnder6Data: femaleTtUnder6Data,\n'
        '  femaleTtUnder6Policy: femaleTtUnder6Policy,\n'
        '  maleE2AgeData: maleE2AgeData,\n'
        '  maleE2AgePolicy: maleE2AgePolicy,\n'
        '  maleE2AdultAgeData: maleE2AdultAgeData,\n'
        '  maleE2AdultAgePolicy: maleE2AdultAgePolicy,\n'
        '  femaleGonadotropinPolicy: femaleGonadotropinPolicy,\n'
        '  femaleGonadotropinData: femaleGonadotropinData,\n'
        '  femaleGonadotropinReferencePolicy: femaleGonadotropinReferencePolicy,\n'
        '  femaleEstradiolReferencePolicy: femaleEstradiolReferencePolicy,\n'
        '  fshCaliperReferencePolicy: fshCaliperReferencePolicy,\n'
        '  maleAmhYoungAdultReferencePolicy: maleAmhYoungAdultReferencePolicy,\n'
        '  maleLhCaliperReferencePolicy: maleLhCaliperReferencePolicy,\n'
        '  gonadotropinComparisonPolicy: gonadotropinComparisonPolicy,\n'
        '  gonadotropinComparisonReferenceData: gonadotropinComparisonReferenceData,\n'
        '  childhoodLhResultOnlyPolicies: childhoodLhResultOnlyPolicies,\n'
        '  infantLhTailPolicy: infantLhTailPolicy,\n'
        '  infantTtResultOnlyPolicy: infantTtResultOnlyPolicy\n'
        '};\n'
        '});\n'
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail if the checked-in browser artifact is stale')
    args = parser.parse_args()
    content = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != content:
            raise SystemExit('FAIL: vilda_hormone_lifespan_data.js differs from its sources; run build_runtime.py')
        print('PASS: browser data exactly reproduce the approved sources')
    else:
        OUTPUT.write_text(content, encoding='utf-8')
        print(OUTPUT.name)
