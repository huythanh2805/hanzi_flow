"""Extract relevant, attributed records from the verified bulk snapshots.

This performs no translation and does not manufacture examples. Language and
reading alignment plus Band checks are done by the TypeScript build step.
"""
import bz2
import gzip
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path("data/enrichment-sources")
OUT = Path("data/imported")


def verify():
    for entry in json.loads((ROOT / "downloads.json").read_text("utf-8")):
        if hashlib.sha256((ROOT / entry["file"]).read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Source checksum mismatch: {entry['file']}")


def links(name):
    result = defaultdict(set)
    with bz2.open(ROOT / name, "rt", encoding="utf-8") as stream:
        for line in stream:
            left, right = line.strip().split("\t")
            result[left].add(right)
    return result


def sentences(name, wanted=None):
    result = {}
    with bz2.open(ROOT / name, "rt", encoding="utf-8") as stream:
        for line in stream:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4 or (wanted is not None and parts[0] not in wanted):
                continue
            identifier, language, text, owner = parts[:4]
            if owner in ("", "\\N"):
                continue
            result[identifier] = {"id": identifier, "language": language, "text": text, "owner": owner}
    return result


def cc0(name):
    with bz2.open(ROOT / name, "rt", encoding="utf-8") as stream:
        return {line.split("\t", 1)[0] for line in stream if line.strip()}


def main():
    verify()
    OUT.mkdir(parents=True, exist_ok=True)
    vocabulary = [json.loads(line) for line in Path("data/source/all.jsonl").read_text("utf-8").splitlines() if line]
    words = {v["word"] for v in vocabulary}
    cedict = []
    forms = set(words)
    pattern = re.compile(r"^(\S+) (\S+) \[(.+?)\] /(.+)/$")
    with gzip.open(ROOT / "cedict.txt.gz", "rt", encoding="utf-8") as stream:
        for index, line in enumerate(stream):
            match = pattern.match(line.strip())
            if not match:
                continue
            traditional, simplified, pinyin, definitions = match.groups()
            if simplified not in words:
                continue
            forms.add(traditional)
            cedict.append({"traditional": traditional, "simplified": simplified, "pinyin": pinyin, "glosses": definitions.split("/"), "line": index + 1})
    wiktionary = []
    with gzip.open(ROOT / "viwiktionary.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            record = json.loads(line)
            if record.get("lang_code") != "zh" and record.get("lang") != "Tiếng Quan Thoại":
                continue
            if record.get("word") not in forms or record.get("pos") == "romanization":
                continue
            # Preserve lexical records only. No inferred glosses from redirect labels.
            senses = [s for s in record.get("senses", []) if s.get("glosses") and "no-gloss" not in s.get("tags", []) and not s.get("form_of")]
            if senses:
                wiktionary.append({"word": record["word"], "pos": record.get("pos", "unknown"), "senses": senses, "sounds": record.get("sounds", []), "forms": record.get("forms", [])})
    (OUT / "dictionary-input.json").write_text(json.dumps({"cedict": cedict, "wiktionary": wiktionary}, ensure_ascii=False), "utf-8")

    en_links = links("cmn-eng-links.tsv.bz2")
    vi_links = links("cmn-vie-links.tsv.bz2")
    wanted_en = {identifier for group in en_links.values() for identifier in group}
    wanted_vi = {identifier for group in vi_links.values() for identifier in group}
    english = sentences("eng-detailed.tsv.bz2", wanted_en)
    vietnamese = sentences("vie-detailed.tsv.bz2", wanted_vi)
    chinese = sentences("cmn-detailed.tsv.bz2", set(en_links) | set(vi_links))
    chinese_cc0, english_cc0 = cc0("cmn-cc0.tsv.bz2"), cc0("eng-cc0.tsv.bz2")
    candidates = []
    for identifier, record in chinese.items():
        if len(record["text"]) > 60:
            continue
        translations = {}
        for language, source, mapping in [("en", english, en_links), ("vi", vietnamese, vi_links)]:
            available = [source[i] for i in sorted(mapping.get(identifier, ()), key=int) if i in source]
            if available:
                selected = available[0]
                selected["license"] = "CC0-1.0" if language == "en" and selected["id"] in english_cc0 else "CC-BY-2.0-FR"
                translations[language] = selected
        if translations:
            candidates.append({**record, "license": "CC0-1.0" if identifier in chinese_cc0 else "CC-BY-2.0-FR", "translations": translations})
    (OUT / "sentence-input.json").write_text(json.dumps(candidates, ensure_ascii=False), "utf-8")
    print(json.dumps({"dictionaryRecords": len(cedict), "vietnameseLexicalRecords": len(wiktionary), "sentenceCandidates": len(candidates), "sentencesWithDirectVietnamese": sum("vi" in s["translations"] for s in candidates)}))


if __name__ == "__main__":
    main()
