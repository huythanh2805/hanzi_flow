"""Download pinned, licensed bulk snapshots using only Python's standard library.

Existing files and their checksums are verified. An upstream change requires an
explicit --refresh so a normal rerun never silently changes the source version.
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path("data/enrichment-sources")
SOURCES = {
    "cedict.txt.gz": "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
    "viwiktionary.jsonl.gz": "https://kaikki.org/viwiktionary/raw-wiktextract-data.jsonl.gz",
    "cmn-detailed.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences_detailed.tsv.bz2",
    "vie-detailed.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/vie/vie_sentences_detailed.tsv.bz2",
    "eng-detailed.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2",
    "cmn-vie-links.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn-vie_links.tsv.bz2",
    "cmn-eng-links.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2",
    "cmn-cc0.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences_CC0.tsv.bz2",
    "eng-cc0.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_CC0.tsv.bz2",
}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / "downloads.json"
    previous = {r["file"]: r for r in json.loads(manifest_path.read_text("utf-8"))} if manifest_path.exists() else {}
    refresh = "--refresh" in sys.argv
    manifest = []
    for name, url in SOURCES.items():
        target = ROOT / name
        if refresh or not target.exists():
            temporary = target.with_suffix(target.suffix + ".download")
            request = urllib.request.Request(url, headers={"User-Agent": "HanziFlow/0.1 (licensed bulk data import)"})
            with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            checksum = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if not refresh and name in previous and checksum != previous[name]["sha256"]:
                raise ValueError(f"Upstream snapshot changed: {name}. Review before --refresh.")
            temporary.replace(target)
        content = target.read_bytes()
        checksum = hashlib.sha256(content).hexdigest()
        if not refresh and name in previous and checksum != previous[name]["sha256"]:
            raise ValueError(f"Source checksum mismatch: {name}")
        manifest.append({"file": name, "url": url, "bytes": len(content), "sha256": checksum})
        print(f"Verified {name} ({len(content):,} bytes)", flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", "utf-8")


if __name__ == "__main__":
    main()
