"""Fetch pinned Argos models for offline, owner-authorized translation only."""
import hashlib
import json
import urllib.request
import zipfile
import shutil
from pathlib import Path

ROOT = Path(".local-tests/translation-models")
MANIFEST = Path("data/imported/translation-models.json")
ROOT.mkdir(parents=True, exist_ok=True)
previous = {m["pair"]: m for m in json.loads(MANIFEST.read_text("utf-8"))} if MANIFEST.exists() else {}
manifest = []
for pair in ["en_vi", "zh_en"]:
    url = f"https://argos-net.com/v1/translate-{pair}-1_9.argosmodel"
    archive = ROOT / f"{pair}.argosmodel"
    if not archive.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        temporary = archive.with_suffix(".download")
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if pair in previous and previous[pair]["sha256"] != digest:
        raise ValueError(f"Model checksum mismatch: {pair}")
    selected = ROOT / pair
    selected.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        prefix = names[0].split("/")[0] + "/"
        # Select fixed known paths, never extract arbitrary archive paths.
        for name in names:
            relative = name.removeprefix(prefix)
            if relative.startswith("model/") or relative in ("sentencepiece.model", "metadata.json", "README", "README.md", "LICENSE"):
                destination = (selected / relative).resolve()
                if not destination.is_relative_to(selected.resolve()):
                    raise ValueError("Unsafe archive path")
                if not name.endswith("/"):
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(package.read(name))
        info = json.loads((selected / "metadata.json").read_text("utf-8"))
        notices = {n.removeprefix(prefix): package.read(n).decode("utf-8") for n in names if any(key in n.lower() for key in ["license", "readme"]) and not n.endswith("/")}
    manifest.append({"pair": pair, "url": url, "sha256": digest, "bytes": archive.stat().st_size, "metadata": info, "notices": notices})
    print(json.dumps({"model": pair, "bytes": archive.stat().st_size, "files": [n.removeprefix(prefix) for n in names if "model/" in n or "sentencepiece" in n], "metadata": info, "noticeFiles": list(notices)}), flush=True)
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
