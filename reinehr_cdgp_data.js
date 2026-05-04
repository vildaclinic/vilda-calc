/*
 * Reinehr 2019 CDGP-specific adult height prediction model for boys.
 *
 * Source: user-supplied PDF article 'A New Model of Adult Height Prediction
 * Validated in Boys with Constitutional Delay of Growth and Puberty'
 * (Horm Res Paediatr. 2019;91:186-194).
 *
 * The paper reports smoothed percentages of achieved adult height by bone age,
 * separated for boys with bone age retardation >1 and <2 years, and for boys
 * with bone age retardation ≥2 years. The application linearly interpolates
 * between the published 0.5-year bone-age nodes.
 *
 * Intended scope of the model in the application:
 * - boys only
 * - chronological age >= 12 years
 * - bone age delay > 1 year
 * - profile compatible with CDGP/KOWD-like interpretation
 */
const reinehrCdgpData = {
  meta: {
    method: 'Reinehr 2019 CDGP model',
    shortName: 'Reinehr 2019',
    sourceTitle: 'A New Model of Adult Height Prediction Validated in Boys with Constitutional Delay of Growth and Puberty',
    sourceCitation: 'Horm Res Paediatr. 2019;91:186-194',
    sourcePdf: 'reinehr2019.pdf',
    sourceTable: 'Table 2',
    supportedSex: 'boys',
    chronologicalAgeMinYears: 12,
    boneAgeDelayMinYearsExclusive: 1,
    boneAgeRetardationGroups: [
      { key: 'gt1lt2', label: 'opóźnienie BA >1 i <2 lata' },
      { key: 'gte2', label: 'opóźnienie BA ≥2 lata' }
    ],
    boneAgeRangeYears: {
      min: 10.5,
      max: 15.5
    },
    interpolationPolicy: 'linear interpolation between adjacent published 0.5-year bone-age nodes',
    formula: 'predicted adult height = current height / (percentAdultHeight / 100)',
    notes: [
      'The model is specific for boys with retarded bone age >1 year.',
      'For bone age delay ≥2 years the publication reports lower systematic error than conventional Bayley-Pinneau in the validation cohort.',
      'The app does not extrapolate outside the published bone-age range 10.5-15.5 years.'
    ]
  },
  tables: {
    gt1lt2: [
      { boneAgeYears: 10.5, boneAgeMonthsTotal: 126, boneAgeLabel: '10-6', percentAdultHeight: 81.1 },
      { boneAgeYears: 11.0, boneAgeMonthsTotal: 132, boneAgeLabel: '11-0', percentAdultHeight: 82.5 },
      { boneAgeYears: 11.5, boneAgeMonthsTotal: 138, boneAgeLabel: '11-6', percentAdultHeight: 83.7 },
      { boneAgeYears: 12.0, boneAgeMonthsTotal: 144, boneAgeLabel: '12-0', percentAdultHeight: 85.4 },
      { boneAgeYears: 12.5, boneAgeMonthsTotal: 150, boneAgeLabel: '12-6', percentAdultHeight: 87.2 },
      { boneAgeYears: 13.0, boneAgeMonthsTotal: 156, boneAgeLabel: '13-0', percentAdultHeight: 89.1 },
      { boneAgeYears: 13.5, boneAgeMonthsTotal: 162, boneAgeLabel: '13-6', percentAdultHeight: 91.1 },
      { boneAgeYears: 14.0, boneAgeMonthsTotal: 168, boneAgeLabel: '14-0', percentAdultHeight: 92.8 },
      { boneAgeYears: 14.5, boneAgeMonthsTotal: 174, boneAgeLabel: '14-6', percentAdultHeight: 95.2, extrapolated: true },
      { boneAgeYears: 15.0, boneAgeMonthsTotal: 180, boneAgeLabel: '15-0', percentAdultHeight: 97.5, extrapolated: true },
      { boneAgeYears: 15.5, boneAgeMonthsTotal: 186, boneAgeLabel: '15-6', percentAdultHeight: 99.9, extrapolated: true }
    ],
    gte2: [
      { boneAgeYears: 10.5, boneAgeMonthsTotal: 126, boneAgeLabel: '10-6', percentAdultHeight: 80.4 },
      { boneAgeYears: 11.0, boneAgeMonthsTotal: 132, boneAgeLabel: '11-0', percentAdultHeight: 82.6 },
      { boneAgeYears: 11.5, boneAgeMonthsTotal: 138, boneAgeLabel: '11-6', percentAdultHeight: 84.1 },
      { boneAgeYears: 12.0, boneAgeMonthsTotal: 144, boneAgeLabel: '12-0', percentAdultHeight: 85.8 },
      { boneAgeYears: 12.5, boneAgeMonthsTotal: 150, boneAgeLabel: '12-6', percentAdultHeight: 87.5 },
      { boneAgeYears: 13.0, boneAgeMonthsTotal: 156, boneAgeLabel: '13-0', percentAdultHeight: 89.3 },
      { boneAgeYears: 13.5, boneAgeMonthsTotal: 162, boneAgeLabel: '13-6', percentAdultHeight: 91.2 },
      { boneAgeYears: 14.0, boneAgeMonthsTotal: 168, boneAgeLabel: '14-0', percentAdultHeight: 93.1 },
      { boneAgeYears: 14.5, boneAgeMonthsTotal: 174, boneAgeLabel: '14-6', percentAdultHeight: 95.2, extrapolated: true },
      { boneAgeYears: 15.0, boneAgeMonthsTotal: 180, boneAgeLabel: '15-0', percentAdultHeight: 97.3, extrapolated: true },
      { boneAgeYears: 15.5, boneAgeMonthsTotal: 186, boneAgeLabel: '15-6', percentAdultHeight: 99.6, extrapolated: true }
    ]
  }
};

if (typeof window !== 'undefined') {
  window.reinehrCdgpData = reinehrCdgpData;
}
