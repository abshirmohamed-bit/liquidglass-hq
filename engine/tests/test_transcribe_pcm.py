"""Exercise the production Whisper adapter without loading model weights."""
import sys
import wave
from types import SimpleNamespace

import numpy as np

from app.pipeline import transcribe as mod


def test_whisper_receives_normalized_pcm_instead_of_pyav_path(tmp_path, monkeypatch):
    audio = tmp_path / "speech.wav"
    with wave.open(str(audio), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(np.array([-32768, 0, 16384], dtype="<i2").tobytes())
    seen = {}

    class Model:
        def __init__(self, *args, **kwargs):
            pass
        def transcribe(self, samples, **kwargs):
            seen["samples"] = samples
            seen["language"] = kwargs["language"]
            word = SimpleNamespace(word="hello", start=0, end=0.1, probability=0.9)
            return [SimpleNamespace(words=[word])], SimpleNamespace(language="en")

    monkeypatch.setitem(sys.modules, "faster_whisper", SimpleNamespace(WhisperModel=Model))
    monkeypatch.setattr(mod, "_model_cache", {})
    from app.config import settings
    monkeypatch.setattr(settings(), "whisper_device", "cpu")
    result = mod._faster_whisper(audio, [], "en-US")
    assert seen["language"] == "en"
    np.testing.assert_array_equal(seen["samples"], np.array([-1.0, 0.0, 0.5], dtype=np.float32))
    assert result.words[0].text == "hello"
    assert result.words[0].end_ms == 100