#!/usr/bin/env python3
"""
audio_backfill_kokoro.py — gives every phrase and word a real audio file.

Taps on phrases/words without a file fall back to the device's speech
synthesizer, which is silent when an iPhone is on mute. This fills the gaps
with Kokoro (open-source, runs offline on the CI machine — no API quota), one
clip per item, same filenames/manifests the app already uses:

  data/phraseAudio.json → ./assets/audio/phrases/<slug>.mp3
  data/wordAudio.json   → ./assets/audio/words/<slug>.mp3

Order: phrases of the free Stage 1 episodes, other phrases (newest first),
then words (Stage 1 first, then by frequency). Existing entries are never
replaced. Stops at the time budget; with COMMIT_EVERY set it commits and
pushes progress periodically so a long run never loses work.

Env: KOKORO_MODEL, KOKORO_VOICES (paths), BACKFILL_MINUTES (default 300),
     COMMIT_EVERY (items between git checkpoints, 0 = only at the end).
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
TOPICS = ROOT / "data" / "topics.json"
VOICE = "am_michael"
STAGE1 = 10
BUDGET = float(os.getenv("BACKFILL_MINUTES", "300")) * 60
COMMIT_EVERY = int(os.getenv("COMMIT_EVERY", "0"))

KIND = {
    "phrase": {"manifest": ROOT / "data" / "phraseAudio.json", "dir": ROOT / "assets" / "audio" / "phrases", "rel": "phrases"},
    "word": {"manifest": ROOT / "data" / "wordAudio.json", "dir": ROOT / "assets" / "audio" / "words", "rel": "words"},
}


# Same keys/slugs as scripts/generatePhraseAudio.ts, generateWordAudio.ts and the app.
def phrase_key(t):
    return re.sub(r"\s+", " ", t.strip().lower())


def phrase_slug(k):
    base = re.sub(r"[^a-z0-9]+", "_", k).strip("_")[:40]
    return f"{base or 'phrase'}_{hashlib.sha1(k.encode()).hexdigest()[:8]}"


def word_key(t):
    return re.sub(r"[^a-zA-Z'-]", "", t).lower()


def word_slug(w):
    return re.sub(r"[^a-z0-9_]", "", w.replace("'", "_ap_").replace("-", "_hy_"))


def load(p):
    return json.loads(p.read_text() or "{}") if p.exists() else {}


def save(p, m):
    p.write_text(json.dumps(dict(sorted(m.items())), ensure_ascii=False, indent=2) + "\n")


def todo(man):
    topics = json.loads(TOPICS.read_text())
    items, seen = [], set()

    def push(kind, raw):
        key = phrase_key(raw) if kind == "phrase" else word_key(raw)
        if not key or (kind == "word" and not re.search(r"[a-z]", key)):
            return
        if key in man[kind] or (kind, key) in seen:
            return
        seen.add((kind, key))
        items.append((kind, key, raw.strip() if kind == "phrase" else key))

    for t in topics[:STAGE1] + topics[STAGE1:][::-1]:
        for s in t["sentences"]:
            for p in s.get("phrases") or []:
                push("phrase", str(p.get("phrase", "")))
    for t in topics[:STAGE1]:
        for s in t["sentences"]:
            for w in s["en"].split():
                push("word", w)
    freq = {}
    for t in topics:
        for s in t["sentences"]:
            for w in s["en"].split():
                k = word_key(w)
                if k:
                    freq[k] = freq.get(k, 0) + 1
    for w, _ in sorted(freq.items(), key=lambda x: -x[1]):
        push("word", w)
    return items


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, check=check, capture_output=True, text=True)


def checkpoint(man, label):
    """Commit new clips + manifests and push, merging with any concurrent manifest edits."""
    for k in KIND:
        save(KIND[k]["manifest"], man[k])
    git("add", "assets/audio/phrases", "assets/audio/words", "data/phraseAudio.json", "data/wordAudio.json")
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        return
    git("commit", "-q", "-m", f"audio: phrase/word clips ({label})")
    for _ in range(3):
        if git("push", "-q", "origin", "HEAD:main", check=False).returncode == 0:
            print(f"[backfill] pushed ({label})", flush=True)
            return
        # Someone else pushed (e.g. the daily lesson job): rebuild our commit on
        # top of theirs, unioning the manifests instead of fighting over lines.
        git("fetch", "-q", "origin", "main")
        git("reset", "-q", "--mixed", "origin/main")
        for k in KIND:
            rel = f"data/{KIND[k]['manifest'].name}"
            remote = json.loads(git("show", f"origin/main:{rel}").stdout or "{}")
            man[k] = {**remote, **man[k]}
            save(KIND[k]["manifest"], man[k])
        git("add", "assets/audio/phrases", "assets/audio/words", "data/phraseAudio.json", "data/wordAudio.json")
        git("commit", "-q", "-m", f"audio: phrase/word clips ({label})")
    print("[backfill] WARNING: could not push checkpoint", flush=True)


def to_mp3(samples, sr, out):
    pad_head = np.zeros(int(sr * 0.06), dtype=np.float32)
    pad_tail = np.zeros(int(sr * 0.15), dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, np.concatenate([pad_head, samples.astype(np.float32), pad_tail]), sr, format="WAV")
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0",
         "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "64k", str(out)],
        input=buf.getvalue(), check=True,
    )


def main():
    start = time.time()
    man = {k: load(KIND[k]["manifest"]) for k in KIND}
    items = todo(man)
    n_ph = sum(1 for i in items if i[0] == "phrase")
    print(f"[backfill] missing: {n_ph} phrases, {len(items) - n_ph} words; budget {BUDGET / 60:.0f} min", flush=True)
    if not items:
        return
    kokoro = Kokoro(os.environ["KOKORO_MODEL"], os.environ["KOKORO_VOICES"])
    for k in KIND:
        KIND[k]["dir"].mkdir(parents=True, exist_ok=True)

    done = failed = 0
    for kind, key, text in items:
        if time.time() - start > BUDGET:
            break
        slug = phrase_slug(key) if kind == "phrase" else word_slug(key)
        if not slug:
            continue
        try:
            samples, sr = kokoro.create(text, voice=VOICE, speed=0.95, lang="en-us")
            if len(samples) < sr * 0.15:
                raise ValueError("too short")
            to_mp3(samples, sr, KIND[kind]["dir"] / f"{slug}.mp3")
            man[kind][key] = f"./assets/audio/{KIND[kind]['rel']}/{slug}.mp3"
            done += 1
        except Exception as e:  # one bad item shouldn't stop the run
            failed += 1
            print(f"[backfill] skip {kind} '{text}': {e}", flush=True)
        if done and COMMIT_EVERY and done % COMMIT_EVERY == 0:
            elapsed = time.time() - start
            print(f"[backfill] {done} clips in {elapsed / 60:.1f} min ({elapsed / done:.2f}s each)", flush=True)
            checkpoint(man, f"{done} so far")

    if COMMIT_EVERY:
        checkpoint(man, f"{done} this run")
    else:
        for k in KIND:
            save(KIND[k]["manifest"], man[k])
    left = len(items) - done - failed
    print(f"[backfill] added {done}, failed {failed}, still missing {left}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
