#!/usr/bin/env python3
"""Build the pinned CeZ ICD-10 PL catalogue offline with Python's stdlib.

The source archive and publisher license metadata live beside this tool.
No clinical labels, synonyms or optional fifth-character codes are invented.
"""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "tools/icd10-pl-source"
SOURCE_SHA256 = "88a0c4ed4e4987d3cdc57f0a534a6c80506d757f197c39c1c22fa3a1ebdba099"
ARCHIVE_SHA256 = "39ecb2cb69d0a170972bf68485d516201c25610e8d5767de362e32e1cb293a3b"
SOURCE_BYTES = 12713248
ARCHIVE_BYTES = 606817
ABSOLUTE_CODE = re.compile(r"[A-Z][0-9]{2}(?:\.[0-9])?")
RELATIVE_CODE = re.compile(r"\.[0-9]")
RANGE_CODE = re.compile(r"[A-Z][0-9]{2}[–-][A-Z][0-9]{2}")
DUPLICATE_BLOCKS = ["B99", "C50", "C97", "F99", "N99", "T79"]
METADATA = {
    "id": "cez-icd10-pl-2021-03-31-v1",
    "name": "ICD-10 — polska wersja językowa CeZ",
    "editionDate": "2021-03-31",
    "edition": "ICD-10-2008-PL; CeZ 31.03.2021",
    "language": "pl",
    "publisher": "Centrum e-Zdrowia",
    "sourceUrl": "https://dane.gov.pl/pl/dataset/27/resource/55725",
    "downloadUrl": "https://api.dane.gov.pl/media/resources/20240319/ICD10_PL_en_covid_2021_03_31_2.xml",
    "retrievedDate": "2026-11-18",
    "license": "CC-BY-4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "noticeUrl": "runtime/icd10-pl-v1/NOTICE.txt",
    "sourceSHA256": SOURCE_SHA256,
    "entryCount": 12010,
    "maxNameLength": 180,
    "historicalSnapshot": True,
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def extract_catalogue(source_dir):
    archive = (source_dir / "source.xml.gz").read_bytes()
    if len(archive) != ARCHIVE_BYTES or digest(archive) != ARCHIVE_SHA256:
        raise ValueError("Pinned ICD-10 source archive size/SHA256 mismatch")
    source = gzip.decompress(archive)
    if len(source) != SOURCE_BYTES or digest(source) != SOURCE_SHA256:
        raise ValueError("Pinned ICD-10 XML size/SHA256 mismatch")
    root = ET.fromstring(source)
    namespace = root.tag.split("}")[0] + "}"
    if root.findtext(namespace + "name") != "ICD-10-2008-PL" or root.get("version") != "7":
        raise ValueError("Unexpected ICD-10 source identity")
    rows = {}
    depths = {}
    counts = collections.Counter()
    duplicates = []

    def visit(node, category, depth):
        source_code = node.get("code", "")
        base = source_code.rstrip("†*")
        marker = source_code[len(base):]
        title = node.findtext(namespace + "name") or ""
        resolved = None
        counts["treeNodes"] += 1
        if not source_code:
            counts["uncodedNodes"] += 1
        elif ABSOLUTE_CODE.fullmatch(base):
            resolved = base
            counts["absoluteCodeNodes"] += 1
        elif RELATIVE_CODE.fullmatch(base):
            if category is None:
                raise ValueError("Relative ICD-10 suffix without a category")
            resolved = category + base
            counts["relativeCodeNodesResolved"] += 1
        elif RANGE_CODE.fullmatch(source_code):
            counts["rangeNodes"] += 1
        else:
            # Numeric optional subdivisions remain in the complete source XML.
            # They are not independent category codes and are not guessed here.
            counts["supplementalNodes"] += 1
        if resolved is not None:
            if not title:
                raise ValueError("ICD-10 code without its source title")
            if len(resolved) == 3:
                category = resolved
            parent = None if len(resolved) == 3 else resolved[:3]
            if resolved in rows:
                duplicates.append(resolved)
                if depth <= depths[resolved]:
                    raise ValueError("Unexpected duplicate ICD-10 category")
            # Six old outer blocks reuse their inner category's identifier.
            # The deeper category carries the actual category label.
            rows[resolved] = [resolved + marker, title, parent]
            depths[resolved] = depth
        for child in node.findall(namespace + "nodes/" + namespace + "node"):
            visit(child, category, depth + 1)

    for node in root.findall(namespace + "nodes/" + namespace + "node"):
        visit(node, None, 0)
    expected_counts = {
        "treeNodes": 23975, "uncodedNodes": 11104, "rangeNodes": 290,
        "absoluteCodeNodes": 11027, "relativeCodeNodesResolved": 989,
        "supplementalNodes": 565,
    }
    if dict(counts) != expected_counts or sorted(duplicates) != DUPLICATE_BLOCKS:
        raise ValueError("Pinned ICD-10 tree structure changed")
    entries = sorted(rows.values(), key=lambda row: row[0])
    if len(entries) != 12010 or max(len(row[1]) for row in entries) != 180:
        raise ValueError("Pinned ICD-10 catalogue count/name length changed")
    if any(row[2] is not None and row[2] not in rows for row in entries):
        raise ValueError("Missing ICD-10 parent category")
    counts["categories"] = sum(row[2] is None for row in entries)
    counts["subcategories"] = len(entries) - counts["categories"]
    counts["daggerCodes"] = sum(row[0].endswith("†") for row in entries)
    counts["asteriskCodes"] = sum(row[0].endswith("*") for row in entries)
    return entries, dict(counts), dict(root.attrib)


def build_release(source_dir):
    dataset = json.loads((source_dir / "dataset27.json").read_text(encoding="utf-8"))["data"]
    resource = json.loads((source_dir / "resource55725.json").read_text(encoding="utf-8"))["data"]
    terms = dataset["attributes"]
    if (dataset["id"] != "27" or terms["license_name"] != "CC BY 4.0"
            or terms["license_condition_default_cc40"] is not True
            or terms["license_condition_timestamp"] is not True
            or resource["id"] != "55725" or resource["attributes"]["data_date"] != METADATA["editionDate"]
            or resource["attributes"]["file_size"] != SOURCE_BYTES
            or resource["attributes"]["file_url"] != METADATA["downloadUrl"]):
        raise ValueError("Pinned ICD-10 publisher provenance/license metadata changed")
    entries, counts, root_attributes = extract_catalogue(source_dir)
    metadata_json = json.dumps(METADATA, ensure_ascii=False, indent=2)
    lines = [
        "// Generated offline by python3 tools/build-icd10-pl.py; do not edit.",
        "// CeZ ICD-10 PL, data date 2021-03-31; CC BY 4.0. See runtime/icd10-pl-v1/NOTICE.txt.",
        "// Tuple: [resolved code retaining dagger/asterisk, verbatim source name, parent base category or null].",
        "window.VildaICD10PLData = {",
        '  "metadata": ' + metadata_json.replace("\n", "\n  ") + ",",
        '  "entries": [',
    ]
    lines.extend("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + ("," if index < len(entries) - 1 else "")
                 for index, row in enumerate(entries))
    lines.extend(["  ]", "};", ""])
    script = "\n".join(lines).encode("utf-8")
    evidence = []
    for name in ["dataset27.json", "resource55725.json", "licensing-evidence.json"]:
        raw = (source_dir / name).read_bytes()
        evidence.append({"path": "tools/icd10-pl-source/" + name, "bytes": len(raw), "sha256": digest(raw)})
    manifest = {
        "schemaVersion": 1,
        "metadata": METADATA,
        "sourceArchive": {"path": "tools/icd10-pl-source/source.xml.gz", "bytes": ARCHIVE_BYTES,
                          "sha256": ARCHIVE_SHA256, "gzipMtime": 0,
                          "uncompressedBytes": SOURCE_BYTES, "uncompressedSHA256": SOURCE_SHA256},
        "sourceRootAttributes": root_attributes,
        "licenseEvidence": evidence,
        "tupleFields": ["resolvedMarkedCode", "verbatimPolishSourceName", "parentBaseCategoryOrNull"],
        "counts": counts,
        "removedDuplicateOuterBlocks": DUPLICATE_BLOCKS,
        "transformations": [
            "Resolve 989 relative suffix tokens against their enclosing three-character category.",
            "Use the deeper category for six duplicate outer block identifiers.",
            "Retain dagger/asterisk in selected codes and source labels verbatim.",
            "Keep optional subdivision tokens and uncoded text in the archived XML; do not create diagnosis entries from them.",
            "Sort complete tuples by their resolved marked code; add no synonyms or exclusions index.",
        ],
        "artifact": {"path": "vilda_icd10_pl_data.js", "bytes": len(script), "sha256": digest(script)},
    }
    return {"vilda_icd10_pl_data.js": script, "runtime/icd10-pl-v1/manifest.json": json_bytes(manifest)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed output without writing")
    parser.add_argument("--output-root", type=Path, default=ROOT, help="Write generated files under another directory")
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR, help="Directory containing the pinned archive and evidence")
    args = parser.parse_args()
    generated = build_release(args.source_dir)
    for relative, expected in generated.items():
        target = args.output_root / relative
        if args.check:
            if not target.is_file() or target.read_bytes() != expected:
                raise ValueError("ICD-10 generated file differs: " + relative)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(expected)
    print(json.dumps({"checked" if args.check else "built": list(generated), "entries": 12010}, ensure_ascii=False))


if __name__ == "__main__":
    main()
