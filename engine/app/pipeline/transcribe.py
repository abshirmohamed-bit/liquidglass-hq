"""Speech to words with real timings.

Two providers behind one interface:
  faster-whisper — the real thing, word-level timestamps, runs on CPU or GPU.
  fake           — deterministic, no model download; used by the test suite so
                   the rest of the pipeline can be proven without model weights.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from ..config import settings

_model_cache: dict[str, object] = {}


@dataclass
class Word:
    start_ms: int
    end_ms: int
    text: str
    confidence: float = 1.0


@dataclass
class Sentence:
    start_ms: int
    end_ms: int
    text: str


@dataclass
class Transcription:
    language: str
    model: str
    words: list[Word]
    sentences: list[Sentence]

    def as_dicts(self) -> tuple[list[dict], list[dict]]:
        return [asdict(w) for w in self.words], [asdict(s) for s in self.sentences]


SENTENCE_END = re.compile(r"[.!?]$")


def group_sentences(words: list[Word], pause_ms: int = 800) -> list[Sentence]:
    """Split on punctuation, or on a gap long enough to be a new thought."""
    out: list[Sentence] = []
    buf: list[Word] = []
    for i, w in enumerate(words):
        buf.append(w)
        gap_next = words[i + 1].start_ms - w.end_ms if i + 1 < len(words) else None
        if SENTENCE_END.search(w.text.strip()) or (gap_next is not None and gap_next > pause_ms) or i == len(words) - 1:
            text = " ".join(x.text.strip() for x in buf).strip()
            if text:
                out.append(Sentence(start_ms=buf[0].start_ms, end_ms=buf[-1].end_ms, text=text))
            buf = []
    return out


def snap_to_vocabulary(words: list[Word], vocabulary: list[str]) -> list[Word]:
    """Nudge near-miss spellings onto the names the user told us about."""
    if not vocabulary:
        return words
    lowered = {v.lower(): v for v in vocabulary}
    for w in words:
        bare = w.text.strip().strip(".,!?;:")
        if not bare or bare.lower() in lowered:
            continue
        match = difflib.get_close_matches(bare.lower(), list(lowered), n=1, cutoff=0.82)
        if match:
            w.text = w.text.replace(bare, lowered[match[0]])
    return words


def _fake(audio: Path, duration_s: float) -> Transcription:
    """A believable transcript with real-looking timings, derived from the duration."""
    import random

    rng = random.Random(1234)
    vocab = ("the question people keep asking is whether this actually changes anything "
             "and the honest answer is that it depends on what you measure first "
             "because every number looks good until you compare it with last year").split()
    words: list[Word] = []
    t = 150
    i = 0
    while t < duration_s * 1000 - 200:
        length = rng.randint(7, 13)
        for j in range(length):
            dur = rng.randint(180, 420)
            text = vocab[i % len(vocab)]
            i += 1
            if j == length - 1:
                text += "."
            words.append(Word(start_ms=t, end_ms=min(int(duration_s * 1000), t + dur), text=text))
            t += dur + rng.randint(10, 60)
            if t >= duration_s * 1000 - 200:
                break
        t += rng.randint(250, 700)
    return Transcription("en", "fake", words, group_sentences(words))


def _faster_whisper(audio: Path, vocabulary: list[str], language: str | None) -> Transcription:
    import os
    import wave

    import numpy as np
    from faster_whisper import WhisperModel

    cfg = settings()
    device = cfg.whisper_device
    if device == "auto":
        try:
            import torch  # noqa: F401

            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    key = f"{cfg.whisper_model}:{device}"
    model = _model_cache.get(key)
    if model is None:
        # More threads than cores makes a CPU GEMM workload slower, not faster.
        # A Fly performance-2x has two.
        cores = os.cpu_count() or 2
        model = WhisperModel(cfg.whisper_model, device=device, compute_type="float16" if device == "cuda" else "int8",
                             cpu_threads=max(1, min(cores, cfg.processing_threads or cores)), num_workers=1)
        _model_cache[key] = model

    prompt = ", ".join(vocabulary[:30]) if vocabulary else None
    # extract_audio already produces 16 kHz mono PCM; passing samples avoids
    # faster-whisper's incompatible PyAV decoder and its unbounded threads.
    with wave.open(str(audio), "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Transcription requires 16 kHz mono 16-bit PCM audio.")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
    segments, info = model.transcribe(  # type: ignore[union-attr]
        samples, word_timestamps=True, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        language=language.replace("_", "-").split("-")[0].lower() if language and language.lower() != "auto" else None,
        initial_prompt=prompt,
        # Speed, in the three places it is nearly free on CPU:
        #   greedy decoding instead of a 5-wide beam,
        #   no carrying context between segments, which also stops the
        #     repetition loops Whisper falls into on music and silence,
        #   two temperature retries instead of six, so one bad patch of audio
        #     cannot quietly cost six re-decodes.
        beam_size=1,
        condition_on_previous_text=False,
        temperature=[0.0, 0.2],
    )
    words: list[Word] = []
    for seg in segments:
        for w in (seg.words or []):
            text = (w.word or "").strip()
            if not text:
                continue
            words.append(Word(int(w.start * 1000), int(w.end * 1000), text, float(getattr(w, "probability", 1.0) or 1.0)))
    words = snap_to_vocabulary(words, vocabulary)
    return Transcription(getattr(info, "language", "") or "en", f"faster-whisper/{cfg.whisper_model}", words, group_sentences(words))


def transcribe(audio: Path, duration_s: float, vocabulary: list[str] | None = None,
               language: str | None = None) -> Transcription:
    vocabulary = vocabulary or []
    if settings().transcribe_provider == "fake":
        return _fake(audio, duration_s)
    return _faster_whisper(audio, vocabulary, language)


def slice_words(words: list[dict], in_ms: int, out_ms: int) -> list[dict]:
    """The words inside a clip, re-based so the clip starts at zero."""
    return [
        {**w, "start_ms": w["start_ms"] - in_ms, "end_ms": w["end_ms"] - in_ms}
        for w in words
        if w["end_ms"] > in_ms and w["start_ms"] < out_ms
    ]
