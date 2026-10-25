"""Offline translation fallback explicitly authorized by the owner.

Never creates Chinese examples. Corpus originals remain unchanged. All machine
translations retain their input/model and remain marked machine-unreviewed.
"""
import hashlib
import json
import re
import time
from pathlib import Path

import ctranslate2
import sentencepiece

ROOT = Path(".local-tests/translation-models")
OUTPUT = Path("data/imported/enrichment.json")
CACHE = Path("data/imported/translation-cache.json")
MODEL_URL = "https://github.com/argosopentech/argos-translate"
SOURCE_ID = "argos-offline-mt-1.9"
models = json.loads(Path("data/imported/translation-models.json").read_text("utf-8"))
cache = json.loads(CACHE.read_text("utf-8")) if CACHE.exists() else {}
content = json.loads(OUTPUT.read_text("utf-8"))
raw = [json.loads(line) for line in Path("data/source/all.jsonl").read_text("utf-8").splitlines() if line]
entries = {e["id"]: e for e in content["entries"]}
for row in raw:
    if row["id"] not in entries:
        entry = {"id": row["id"], "senses": [], "examples": []}
        content["entries"].append(entry)
        entries[row["id"]] = entry


def key(pair, text):
    checksum = next(m["sha256"] for m in models if m["pair"] == pair)
    return hashlib.sha256((pair + checksum + "|beam4|" + text).encode()).hexdigest()


def translate(pair, texts):
    wanted = list(dict.fromkeys(t for t in texts if key(pair, t) not in cache))
    if not wanted:
        return
    directory = ROOT / pair
    package = directory.with_suffix(".argosmodel")
    expected = next(m["sha256"] for m in models if m["pair"] == pair)
    if hashlib.sha256(package.read_bytes()).hexdigest() != expected:
        raise ValueError("Model checksum mismatch")
    tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(directory / "sentencepiece.model"))
    engine = ctranslate2.Translator(str(directory / "model"), device="cpu", compute_type="int8", intra_threads=4, inter_threads=1)
    start = time.monotonic()
    for offset in range(0, len(wanted), 64):
        batch = wanted[offset:offset + 64]
        tokens = [tokenizer.encode(text, out_type=str) for text in batch]
        results = engine.translate_batch(tokens, beam_size=4, max_batch_size=1024, batch_type="tokens", max_decoding_length=200, replace_unknowns=True, length_penalty=0.2)
        for text, result in zip(batch, results):
            # Argos packs a source SentencePiece model; decode target pieces directly.
            value = "".join(result.hypotheses[0]).replace("▁", " ").strip()
            value = re.sub(r"\s+", " ", value)
            if not value or "<unk>" in value or len(value) > max(600, len(text) * 8):
                raise ValueError(f"Invalid machine output for {key(pair, text)}")
            cache[key(pair, text)] = value
        temporary = CACHE.with_suffix(".tmp")
        temporary.write_text(json.dumps(cache, ensure_ascii=False), "utf-8")
        temporary.replace(CACHE)
        print(json.dumps({"pair": pair, "done": min(offset + 64, len(wanted)), "total": len(wanted), "seconds": round(time.monotonic() - start)}), flush=True)


def meta(pair, text):
    return {"provider": "Argos / OPUS-MT (offline)", "model": f"{pair}-1.9", "source_language": pair.split("_")[0], "source_text": text, "review_status": "machine-unreviewed"}


def credit(item):
    value = {"label": "Dịch máy: OPUS-MT · Jörg Tiedemann & Santhosh Thottingal; Argos", "license": "model CC-BY-4.0; translation retains source license", "url": MODEL_URL}
    if value not in item["attribution"]:
        item["attribution"].append(value)


def definition_input(text):
    # Expand dictionary shorthand and remove infinitive markers which the
    # sentence model otherwise translates as Vietnamese purpose clauses.
    value = re.sub(r"^\((?:coll\.|fig\.|lit\.|slang)\)\s*", "", text)
    value = re.sub(r"\bsth\b", "something", value)
    value = re.sub(r"\bsb\b", "somebody", value)
    value = re.sub(r"(^|;\s*)to\s+", r"\1", value)
    return value


# Missing English headwords are drafts, never presented as dictionary-attested.
missing = [row for row in raw if not any(s.get("en") for s in entries[row["id"]]["senses"])]
translate("zh_en", [r["word"] for r in missing] + [e["chinese"] for entry in content["entries"] for e in entry["examples"] if not e.get("en")])
for row in missing:
    text = row["word"]
    sense = {"id": f"{SOURCE_ID}:{row['id']}:headword", "en": cache[key("zh_en", text)], "source_id": SOURCE_ID, "source_url": MODEL_URL, "match_method": "machine-headword", "translation_meta": {"en": meta("zh_en", text)}, "attribution": []}
    credit(sense)
    entries[row["id"]]["senses"].append(sense)
for entry in content["entries"]:
    for example in entry["examples"]:
        if not example.get("en"):
            text = example["chinese"]
            example["en"] = cache[key("zh_en", text)]
            example.setdefault("translation_meta", {})["en"] = meta("zh_en", text)
            credit(example)

# Keep existing Vietnamese senses; translate every missing English sense and
# example separately so different meanings cannot become one combined gloss.
tasks = [definition_input(s["en"]) for entry in content["entries"] for s in entry["senses"] if s.get("en") and not s.get("vi")]
tasks += [e["en"] for entry in content["entries"] for e in entry["examples"] if not e.get("vi")]
translate("en_vi", tasks)
for entry in content["entries"]:
    for item in entry["senses"] + entry["examples"]:
        if item.get("en") and not item.get("vi"):
            text = definition_input(item["en"]) if item in entry["senses"] else item["en"]
            item["vi"] = cache[key("en_vi", text)]
            item.setdefault("translation_meta", {})["vi"] = meta("en_vi", text)
            credit(item)
    entry["senses"].sort(key=lambda s: bool(s.get("translation_meta", {}).get("vi")) or not bool(s.get("vi")))

content["sources"] = [s for s in content["sources"] if s["id"] != SOURCE_ID] + [{"id": SOURCE_ID, "name": "Offline machine translation (owner-authorized)", "version": "1.9", "license": "Model CC-BY-4.0; derived translations retain input license", "attribution": "OPUS-MT: Jörg Tiedemann and Santhosh Thottingal (2020); Argos Open Technologies. Offline CTranslate2 4.8.3. Machine-unreviewed. Original human translations preserved. No runtime AI service.", "repository": MODEL_URL, "metadata": {"models": models, "parameters": {"beam_size": 4, "compute_type": "int8", "length_penalty": 0.2}, "authorization": "Owner explicitly authorized automatic translation on 2026-10-25"}}]
correction_path = Path("data/imported/translation-corrections.json")
if correction_path.exists():
    corrections = json.loads(correction_path.read_text("utf-8"))
    for correction in corrections["corrections"]:
        matched = []
        if correction.get("entry_id"):
            matched = [s for s in entries[correction["entry_id"]]["senses"] if s.get("en") == correction["english"] or s.get("translation_meta", {}).get("vi", {}).get("source_text") == correction["english"]]
            # An already corrected English draft is also matched by its stable entry.
            if not matched and correction.get("en"):
                matched = [s for s in entries[correction["entry_id"]]["senses"] if s.get("en") == correction["en"]]
        else:
            matched = [e for entry in content["entries"] for e in entry["examples"] if e["chinese"] == correction["chinese"]]
        if not matched:
            raise ValueError("Translation correction no longer matches its source input")
        for item in matched:
            for language in ["vi", "en"]:
                if language not in correction:
                    continue
                previous = item.get("translation_meta", {}).get(language)
                if not previous:
                    raise ValueError("Correction must not overwrite a human source translation")
                item[language] = correction[language]
                previous["provider"] = "Codex-assisted correction"
                previous["model"] = "conversation-2026-10-25"
    canonical_corrections = json.dumps(corrections, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    content["sources"][-1]["metadata"]["corrections"] = {"file": str(correction_path), "sha256": hashlib.sha256(canonical_corrections).hexdigest(), "hash_format": "UTF-8 JSON, ensure_ascii=False, separators=(',',':'), input object key order", "status": "machine-unreviewed", "author": corrections["author"]}
OUTPUT.write_text(json.dumps(content, ensure_ascii=False), "utf-8")
print(json.dumps({"translatedHeadwords": len(missing), "entries": len(content["entries"]), "cacheSize": len(cache)}))
