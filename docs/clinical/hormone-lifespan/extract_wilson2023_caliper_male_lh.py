#!/usr/bin/env python3
"""Extract male LH from the owner-supplied Wilson 2023 Supplementary Table 3.

Uses only the Python standard library and preserves all 91 LH_M source rows.
The response inverse is an explicitly qualified reconstruction supported by
the paper, pinned code from a coauthor and Figure 1A, not recovered Wilson LH
preprocessing. The copyrighted original documents remain external inputs.

Example:
  python3 docs/clinical/hormone-lifespan/extract_wilson2023_caliper_male_lh.py \
    /path/to/suppl_j_cclm-2022-1077_suppl_004.xlsx --check

The extract is an educational model-median source, not a laboratory RI, SDS,
patient percentile or diagnosis. Source rows 16 and 18 are controls; application
routing is separately restricted to ages strictly greater than 16 and under 18.
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
    """Exact normalized BCCG p50 on the model response scale, before inverse.

    Match the truncation probabilities of gamlss.dist::qBCCG. Source M is
    preserved separately: nominal z=0 is not always the normalized median.
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


def extract_series(archive, sheet_path):
    sheet_name = "LH_M"
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
        if not math.isclose(age, 10 + len(points) / 10, rel_tol=0, abs_tol=1e-12):
            raise ValueError(f"Unexpected age grid at {sheet_name}!A{row_number}")
        response_median = q_bccg_50(l_value, mu, sigma)
        concentration = math.exp(response_median) / 1e6
        if not math.isfinite(concentration) or concentration <= 0:
            raise ValueError(f"Invalid reconstructed median at {sheet_name}!A{row_number}")
        points.append({
            "ageYears": age,
            "L": l_value,
            "M": mu,
            "S": sigma,
            "modelResponseMedian": response_median,
            "centralConcentration": concentration,
            "sourceCells": coordinates,
        })
    if len(points) != 91 or points[0]["ageYears"] != 10 or points[-1]["ageYears"] != 19:
        raise ValueError("Unexpected source row count or endpoints in LH_M")
    return {
        "sheet": sheet_name,
        "sourceCellRange": "LH_M!A2:D92",
        "ageYearsMin": 10,
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
        male_series = extract_series(archive, sheets["LH_M"])
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
            "table": "Supplementary Table 3: numerical L,M,S-for-age; LH_M only, A2:D92",
            "readOn": "2026-10-18",
            "access": "Full final primary article and all three owner-supplied supplementary tables reviewed in the source audit; pinned coauthor method code inspected separately.",
            "redistribution": "Only male LH numerical facts, provenance and qualification metadata are extracted; full article, figures, code and source workbooks/documents are not redistributed.",
        },
        "status": "qualified_reconstruction_for_educational_age_reference_not_laboratory_ri",
        "analyte": "lh",
        "sex": "male",
        "unit": "IU/L",
        "statistic": "reconstructed-normalized-bccg-model-median",
        "population": {
            "name": "CALIPER healthy Canadian children and adolescents",
            "country": "Canada",
            "location": "Greater Toronto Area and The Hospital for Sick Children, Toronto",
            "design": "Cross-sectional age- and sex-specific model of previously collected CALIPER reference data",
            "sourceCohortApproximateParticipants": 1500,
            "numberCaution": "Approximately 1500 describes the source cohorts across cited CALIPER studies, not an LH, male-specific or 16–18-year participant count. Those subgroup counts are not supplied in the four reviewed documents.",
            "recruitment": "Schools/community clinics (0–<19 years), plus metabolically stable SickKids outpatient clinics (0–<5 years); the published LH model is restricted to 10–<19 years.",
            "exclusions": [
                "Chronic disease",
                "Acute illness in the previous week",
                "Current pregnancy",
                "Prescribed medication, including oral contraceptives, within the preceding two weeks",
            ],
            "modelCovariates": ["chronological age", "sex"],
            "tannerStageRestriction": None,
            "samplingTimeStandardization": None,
            "fastingRequirement": None,
            "unreportedContext": "The supplied documents do not state Tanner-specific LH modeling, morning-only endocrine sampling or a fasting requirement. Missing context is unknown, not a confirmed absence in the patient.",
        },
        "assay": {
            "name": "Abbott ARCHITECT",
            "platformScope": "Article page 1107 reports ARCHITECT ci2000 for endocrine/fertility assays (reference 34); c8000 is also listed for biochemical assays across the study.",
            "specimen": "serum",
            "handling": "Serum-separator tubes, centrifuged/aliquoted within 8 hours, stored at −80 °C until analysis.",
            "lowerLimitOfQuantification": 0.09,
            "lowerLimitOfQuantificationUnit": "IU/L",
            "lowerLimitOfQuantificationSource": "Supplementary Table 1, LH row, reference 34",
            "limitOfDetection": None,
            "quantificationCaution": "0.09 IU/L is explicitly LLOQ, not a reported LH LOD. Source handling of zero, below-LLOQ or censored observations is not specified. Do not clip an exact patient result, create an LLOQ/2 replacement or infer an RI from this limit.",
            "harmonization": "No numerical equivalence to Siemens IMMULITE, Roche cobas, AutoDELFIA or another LH method is established. Source selection does not establish the patient sample's assay or specimen.",
        },
        "model": {
            "family": "GAMLSS BCCG",
            "responseScale": "Reconstructed natural log(LH_IU_L * 1e6); exact Wilson LH preprocessing not recovered or directly confirmed.",
            "parameterMapping": {"nu": "L", "mu": "M", "sigma": "S"},
            "p50Definition": "Exact median qBCCG(0.5) of the positive-response, normalized BCCG distribution on the model response scale, then reconstructed exp(q)/1e6 to IU/L; not automatically M or exp(M)/1e6.",
            "quantileAlgorithm": "For L>0, Z=Phi^-1(1-0.5*Phi(1/(S*abs(L)))); for L<0, Z=Phi^-1(0.5*Phi(1/(S*abs(L)))); Q=M*(1+L*S*Z)^(1/L). For L=0 the p50 limit is M. The reconstructed concentration is exp(Q)/1e6 IU/L.",
            "algorithmReference": "https://rdrr.io/cran/gamlss.dist/src/R/BCCG.R",
            "sourceCode": "gamlss(hormone~cs(age, df=2), sigma.fo=~cs(age, df=1), family=BCCG, data=d)",
            "sourceCodeLocation": "Supplementary Table 2, LH male row",
            "sourceRVersion": "4.1.2",
            "sourcePackageVersions": None,
            "sourceFormulaLimitation": "The paper prints an untruncated nominal-z LMS formula and states logarithmic LH response transformation. It does not specify response assignment, logarithm base, rescaling, offset or inverse code. GAMLSS parameter link functions do not themselves transform the LH response.",
            "authorConvention": {
                "repository": "andremadsen/LMS-reference-curve",
                "commit": "288329c43ee238b3c8921097dfeac411d30465b9",
                "commitDate": "2023-10-01",
                "path": "OUS_demo.Rmd",
                "sourceSha256": "1e1296c7fcb4be4d5d35f160c7a50309fad6546b1a1e5394022e41e80eb93ce0",
                "url": "https://github.com/andremadsen/LMS-reference-curve/blob/288329c43ee238b3c8921097dfeac411d30465b9/OUS_demo.Rmd#L194-L196",
                "lineNumbers": [194, 195, 196, 212, 213],
                "quote": "log(hormone*1e6) ... exp(BootCentileMat)/1e6",
                "evidenceRole": "Coauthor's optional logarithmic response convention supports natural log and the factor 1e6 independently of fitting the figure.",
                "limitation": "Later October 2023 synthetic T4/TSH demonstration with commented optional transformation, not the January 2023 Wilson LH/CALIPER preprocessing or exact model pipeline. The pinned file was subsequently deleted from the repository's current tree.",
            },
            "figureVerification": "Original Figure 1A male curves, printed page 1108 / PDF page 4: reconstructed five quantiles agree with vector curves at 89 interior ages 10.1–18.9. Maximum absolute p50 difference approximately 0.001043 IU/L; graphical diagnostic, not model uncertainty or imported figure values.",
            "evidenceQualification": "Author-supported, reproducible reconstruction accepted by the owner for a small ordinary educational median PR. Direct LH preprocessing/model confirmation remains unavailable; do not describe it as recovered exact author code or clinically validated norms.",
            "noNewClinicalFunction": "Only the reconstructed educational age-reference median is imported. No BCCG-derived RI, SDS, patient percentiles, diagnostic classification or treatment recommendation is activated.",
        },
        "interpolation": {
            "publishedAgeStepYears": 0.1,
            "publishedAgeStepIsOneMonth": False,
            "sourceDomain": {"minAge": 10, "maxAge": 19, "maxAgeExclusive": True},
            "terminalRow": "Age 19.0 is retained as the original numerical interpolation endpoint only. It does not authorize a patient reference at age 19 or older.",
            "rule": "Exact source nodes reproduce reconstructed exp(qBCCG(0.5))/1e6. Between-node PCHIP is an application approximation to this 0.1-year table, not the original fitted GAMLSS object or interpolation of L/M/S.",
            "applicationDomain": {"minAge": 16, "minAgeExclusive": True, "maxAge": 18, "maxAgeExclusive": True},
            "noExtrapolation": True,
        },
        "useConstraints": [
            "Only male LH is imported. Do not import female LH, whose source spreadsheet and Figure 1A remain inconsistent, or activate any other analyte from this extract.",
            "Only the separately policy-defined ordinary educational (16,18) window is authorized; the full 10–19 grid is evidence, not permission to replace existing childhood, puberty-comparison or adult profiles.",
            "Exact age 16 preserves existing Madsen LH; age 18 and older preserves existing adult LH. Source nodes 16 and 18 are numerical controls, not authorization to override these boundaries.",
            "The entire possible age interval must fit (16,18). Do not resolve uncertainty crossing a source boundary by selecting its midpoint, silently rounding age or replacing the reference with a graphical bridge.",
            "No Tanner or sampling-time question is required for this age model; do not infer a Tanner stage, basal sample or absence of treatment from missing data.",
            "Known incompatible assay/specimen and known treatment/stimulation retain existing application exclusions. Unknown method or specimen allows only the established educational preview.",
            "Do not calibrate or average CALIPER with neighboring Madsen or adult data, change display geometry/scales, or move the source marker to the educational line.",
        ],
        "series": {"male": male_series},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument(
        "--output", type=Path,
        default=Path(__file__).parent / "evidence/patient-point/wilson2023-caliper-male-lh-lms.json",
    )
    parser.add_argument("--check", action="store_true", help="Verify exact reproducibility without changing files")
    args = parser.parse_args()
    data = extract(args.workbook)
    rendered = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            parser.exit(1, f"Evidence extract differs from reviewed workbook: {args.output}\n")
        print(f"Verified 91 male LH source nodes: {args.output}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Extracted 91 male LH source nodes to {args.output}")


if __name__ == "__main__":
    main()
