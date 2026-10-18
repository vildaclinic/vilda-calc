#!/usr/bin/env python3
"""Extract only FSH from the owner-supplied Wilson 2023 Supplementary Table 3.

Uses the Python standard library; no spreadsheet or statistics dependency.
The copyrighted source documents remain external inputs, not repository files.

Example:
  python3 docs/clinical/hormone-lifespan/extract_wilson2023_caliper_fsh.py \
    /path/to/suppl_j_cclm-2022-1077_suppl_004.xlsx

The output is an evidence extract, not a clinical reference interval or a
patient-specific percentile/SDS calculator. The 19.0-year row is retained only
as an interpolation endpoint below the paper's exclusive age limit of 19.
"""

import argparse
import hashlib
import json
import math
import posixpath
from pathlib import Path
from statistics import NormalDist
import xml.etree.ElementTree as ET
from zipfile import ZipFile


EXPECTED_SHA256 = "997f4998e14dd38fb73a0ac9f14f01bbe5e1f40f3100bc4e2714e4764bfeda9b"
NORMAL = NormalDist()
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def q_bccg_50(l_value, mu, sigma):
    """Median of the positive-response, normalized GAMLSS BCCG distribution.

    This uses the same truncation probabilities as qBCCG in gamlss.dist.
    Mu is the nominal z=0 location, not always the normalized CDF's p50.
    No logarithmic or unit back-transform is applied to the FSH response.
    """
    if not all(math.isfinite(value) for value in (l_value, mu, sigma)):
        raise ValueError("Nonfinite source parameter")
    if mu <= 0 or sigma <= 0:
        raise ValueError("BCCG requires positive mu and sigma")
    if l_value == 0:
        return mu
    truncation_mass = NORMAL.cdf(1 / (sigma * abs(l_value)))
    probability = 1 - 0.5 * truncation_mass if l_value > 0 else 0.5 * truncation_mass
    z_value = NORMAL.inv_cdf(probability)
    base = 1 + l_value * sigma * z_value
    if base <= 0:
        raise ValueError("Invalid positive-response BCCG quantile")
    return mu * base ** (1 / l_value)


def extract_series(archive, sheet_name, sheet_path):
    root = ET.fromstring(archive.read(sheet_path))
    points = []
    for row in root.findall(f"{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        row_number = int(row.attrib["r"])
        if row_number == 1:
            continue
        cells = {cell.attrib["r"]: cell for cell in row.findall(f"{{{MAIN_NS}}}c")}
        values = []
        coordinates = []
        for column in "ABCD":
            coordinate = f"{column}{row_number}"
            cell = cells.get(coordinate)
            if cell is None or cell.find(f"{{{MAIN_NS}}}f") is not None:
                raise ValueError(f"Missing or formula-based source cell {sheet_name}!{coordinate}")
            value = cell.find(f"{{{MAIN_NS}}}v")
            if value is None or cell.attrib.get("t", "n") != "n":
                raise ValueError(f"Non-numeric source cell {sheet_name}!{coordinate}")
            values.append(float(value.text))
            coordinates.append(f"{sheet_name}!{coordinate}")
        age, l_value, mu, sigma = values
        if not math.isclose(age, 1 + len(points) / 10, rel_tol=0, abs_tol=1e-12):
            raise ValueError(f"Unexpected age grid at {sheet_name}!A{row_number}")
        points.append({
            "ageYears": age,
            "L": l_value,
            "M": mu,
            "S": sigma,
            "centralConcentration": q_bccg_50(l_value, mu, sigma),
            "sourceCells": coordinates,
        })
    if len(points) != 181 or points[0]["ageYears"] != 1 or points[-1]["ageYears"] != 19:
        raise ValueError(f"Unexpected source row count or endpoints in {sheet_name}")
    return {
        "sheet": sheet_name,
        "sourceCellRange": f"{sheet_name}!A2:D182",
        "ageYearsMin": 1,
        "ageYearsMax": 19,
        "pointCount": len(points),
        "points": points,
    }


def extract(workbook_path):
    digest = hashlib.sha256(workbook_path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError("Workbook SHA-256 differs from the reviewed owner-supplied version")
    with ZipFile(workbook_path) as archive:
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relationship.attrib["Id"]: posixpath.normpath(
                posixpath.join("xl", relationship.attrib["Target"])
            ).lstrip("/")
            for relationship in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
        }
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = {
            sheet.attrib["name"]: targets[sheet.attrib[f"{{{REL_NS}}}id"]]
            for sheet in workbook.findall(f"{{{MAIN_NS}}}sheets/{{{MAIN_NS}}}sheet")
        }
        series = {
            sex: extract_series(archive, name, sheets[name])
            for sex, name in (("male", "FSH_M"), ("female", "FSH_F"))
        }
    return {
        "schemaVersion": 1,
        "source": {
            "title": "LMS-based continuous reference percentiles for 14 laboratory parameters in the CALIPER cohort of healthy children and adolescents",
            "authorsShort": "Wilson et al.",
            "year": 2023,
            "journal": "Clinical Chemistry and Laboratory Medicine",
            "volume": 61,
            "issue": 6,
            "pages": "1105–1115",
            "doi": "10.1515/cclm-2022-1077",
            "pmid": "36639844",
            "url": "https://doi.org/10.1515/cclm-2022-1077",
            "publishedOnline": "2023-01-16",
            "sourceFile": "suppl_j_cclm-2022-1077_suppl_004.xlsx",
            "sourceSha256": digest,
            "sourceBytes": workbook_path.stat().st_size,
            "sourceVersion": "Owner-supplied final-article Supplementary Table 3; workbook bytes identified by SHA-256.",
            "table": "Supplementary Table 3: numerical L,M,S-for-age; FSH_M and FSH_F only",
            "readOn": "2026-10-18",
            "access": "Full final primary article and all three owner-supplied supplementary tables reviewed.",
            "redistribution": "Only FSH numerical facts, provenance and qualification metadata are extracted; full article, figures and source workbooks/documents are not redistributed.",
        },
        "status": "source_extract_for_educational_age_reference_not_laboratory_ri",
        "analyte": "fsh",
        "unit": "IU/L",
        "statistic": "normalized-bccg-model-median",
        "population": {
            "name": "CALIPER healthy Canadian children and adolescents",
            "country": "Canada",
            "location": "Greater Toronto Area and The Hospital for Sick Children, Toronto",
            "design": "Cross-sectional age- and sex-specific model of previously collected CALIPER reference data",
            "sourceCohortApproximateParticipants": 1500,
            "numberCaution": "Approximately 1500 describes the source cohorts across the cited CALIPER studies, not an FSH, sex-specific or 16–19-year participant count. Those subgroup counts are not supplied in these four documents.",
            "recruitment": "Schools/community clinics (0–<19 years), plus metabolically stable SickKids outpatient clinics (0–<5 years); under-1-year participants excluded from these models.",
            "exclusions": [
                "Chronic disease",
                "Acute illness in the previous week",
                "Current pregnancy",
                "Prescribed medication, including oral contraceptives, within the preceding two weeks",
            ],
            "modelCovariates": ["chronological age", "sex"],
            "tannerStageRestriction": None,
            "menstrualPhaseRestriction": None,
            "samplingTimeStandardization": None,
            "fastingRequirement": None,
            "unreportedContext": "The supplied documents do not state Tanner- or cycle-phase-specific FSH modeling, morning-only endocrine sampling or a fasting requirement. Missing information is not a confirmed absence in the patient.",
        },
        "assay": {
            "name": "Abbott ARCHITECT",
            "platformScope": "Article reports ARCHITECT ci2000 and c8000 across all analytes; endocrine/fertility assays cite Konforte 2013 (reference 34).",
            "specimen": "serum",
            "handling": "Serum-separator tubes, centrifuged/aliquoted within 8 hours, stored at −80 °C until analysis.",
            "lowerLimitOfQuantification": None,
            "lowerLimitOfQuantificationSourceText": "--",
            "lowerLimitOfQuantificationNote": "FSH LLOQ is not reported in Supplementary Table 1; do not substitute zero, the low QC concentration or another platform's LLOQ.",
            "imprecision": [
                {"controlConcentration": 7.20, "sd": 0.49, "cvPercent": 6.8},
                {"controlConcentration": 17.04, "sd": 1.40, "cvPercent": 8.2},
                {"controlConcentration": 39.41, "sd": 2.77, "cvPercent": 7.0},
            ],
            "imprecisionSource": "Supplementary Table 1, FSH row, reference 34",
            "harmonization": "No numerical equivalence to Siemens IMMULITE, Roche cobas, AutoDELFIA or other FSH methods is established. Source selection does not establish the patient sample's assay or specimen.",
        },
        "model": {
            "family": "GAMLSS BCCG",
            "responseScale": "native FSH IU/L; no logarithmic back-transform",
            "parameterMapping": {"nu": "L", "mu": "M", "sigma": "S"},
            "p50Definition": "Exact median of the positive-response, normalized BCCG distribution at each exported age node (qBCCG(0.5)), not automatically M.",
            "quantileAlgorithm": "For L>0, Z=Phi^-1(1-0.5*Phi(1/(S*abs(L)))); for L<0, Z=Phi^-1(0.5*Phi(1/(S*abs(L)))); Y=M*(1+L*S*Z)^(1/L). For L=0 the p50 limit is M.",
            "algorithmReference": "https://rdrr.io/cran/gamlss.dist/src/R/BCCG.R",
            "sourceFormulaLimitation": "The paper prints the untruncated nominal-z LMS formula, which returns M at z=0; its stated GAMLSS BCCG family normalizes a truncated normal. The exact normalized p50 independently reproduces Figure 1C; source M is preserved separately and never relabeled as the exact normalized median.",
            "figureVerification": "Figure 1C, printed page 1108 / PDF page 4, black 50th-percentile curves. Vector checks at ages 16, 17 and 18 agree within graphical precision; these checks are diagnostics, not substituted numerical source values.",
            "maleCode": "gamlss(hormone~cs(age, df=3), sigma.fo=~cs(age, df=2), nu.fo=~cs(age, df=2), family=BCCG, data=d)",
            "femaleCode": "gamlss(hormone~cs(age, df=2), sigma.fo=~cs(age, df=0), nu.fo=~cs(age, df=0), family=BCCG, data=d)",
            "sourceCodeLocation": "Supplementary Table 2, FSH male and female rows",
            "sourceRVersion": "4.1.2",
            "noNewClinicalFunction": "This extraction qualifies only educational age-reference medians. It does not activate BCCG-derived RI, SDS, patient percentiles, diagnosis or treatment decisions.",
        },
        "interpolation": {
            "publishedAgeStepYears": 0.1,
            "publishedAgeStepIsOneMonth": False,
            "sourceDomain": {"minAge": 1, "maxAge": 19, "maxAgeExclusive": True},
            "terminalRow": "Age 19.0 is retained as a numerical interpolation endpoint only. It does not authorize a patient reference at age 19 or older.",
            "rule": "Exact exported nodes reproduce normalized BCCG p50. Any between-node PCHIP is a separately documented application approximation, not the original fitted GAMLSS object or interpolation of L/M/S.",
            "noExtrapolation": True,
        },
        "useConstraints": [
            "Only FSH is imported. This source extract does not activate LH, estradiol, testosterone, AMH, inhibin B or INSL3.",
            "A policy-defined late-adolescent window may use these data without Tanner or cycle-phase questions. It is not a Tanner- or phase-specific reference.",
            "Do not infer an early-follicular, fasting or early-morning reference from absent restrictions.",
            "Known incompatible patient method or specimen and known treatment/pregnancy/stimulation remain exclusions under the application policy; missing context stays unknown.",
            "Do not average or calibrate CALIPER values with neighboring Madsen or adult-reference data, and do not move the source marker to the educational line.",
            "The full source age grid is evidence, not authorization to replace existing infant, childhood, puberty-comparison or adult profiles.",
            "No age uncertainty crossing a source boundary may be resolved by silently selecting the midpoint age.",
        ],
        "series": series,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument(
        "--output", type=Path,
        default=Path(__file__).parent / "evidence/patient-point/wilson2023-caliper-fsh-lms.json",
    )
    args = parser.parse_args()
    data = extract(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Extracted {sum(series['pointCount'] for series in data['series'].values())} FSH source nodes to {args.output}")


if __name__ == "__main__":
    main()
