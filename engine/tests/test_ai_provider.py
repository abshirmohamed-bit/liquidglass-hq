"""One AI key, whichever provider it belongs to.

The finder used to speak only Anthropic. These pin the rule that a single
pasted key is enough: the host and a sensible model come from its shape, and
anything unrecognised still works once given a base URL.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.pipeline import find


@pytest.fixture
def cfg(monkeypatch):
    """Build Settings from a clean environment."""
    def build(**env):
        for k in ("AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "ANTHROPIC_API_KEY",
                  "FINDER_PROVIDER", "CLAUDE_MODEL"):
            monkeypatch.delenv(k, raising=False)
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        settings.cache_clear()
        return settings()
    yield build
    settings.cache_clear()


def test_no_key_means_no_ai(cfg):
    s = cfg()
    assert s.ai_target() == ("", "", "", "")
    assert s.resolve_finder() == "rules"


@pytest.mark.parametrize("key, kind, host", [
    ("gsk_abc123", "openai", "https://api.groq.com/openai/v1"),
    ("sk-ant-abc123", "anthropic", "https://api.anthropic.com"),
    ("sk-or-abc123", "openai", "https://openrouter.ai/api/v1"),
    ("sk-abc123", "openai", "https://api.openai.com/v1"),
])
def test_the_key_names_its_own_provider(cfg, key, kind, host):
    s = cfg(AI_API_KEY=key)
    got_kind, got_base, model, got_key = s.ai_target()
    assert (got_kind, got_base, got_key) == (kind, host, key)
    assert model, "a default model should come with the host"
    assert s.resolve_finder() == "ai"


def test_openrouter_is_not_mistaken_for_openai(cfg):
    # "sk-or-" also starts with "sk-", so order matters.
    assert cfg(AI_API_KEY="sk-or-xyz").ai_target()[1] == "https://openrouter.ai/api/v1"


def test_an_unknown_key_needs_an_address(cfg):
    assert cfg(AI_API_KEY="mystery-key").ai_target() == ("", "", "", "")
    kind, base, model, _ = cfg(AI_API_KEY="mystery-key", AI_BASE_URL="https://llm.example/v1").ai_target()
    assert (kind, base) == ("openai", "https://llm.example/v1")
    assert model


def test_explicit_settings_win(cfg):
    kind, base, model, _ = cfg(AI_API_KEY="gsk_x", AI_BASE_URL="https://proxy.internal/v1/",
                               AI_MODEL="llama-3.3-70b").ai_target()
    assert (base, model) == ("https://proxy.internal/v1", "llama-3.3-70b")


def test_the_old_anthropic_setting_still_works(cfg):
    s = cfg(ANTHROPIC_API_KEY="sk-ant-old")
    assert s.ai_target()[0] == "anthropic"
    assert s.resolve_finder() == "ai"


def test_rules_can_be_forced_even_with_a_key(cfg):
    assert cfg(AI_API_KEY="gsk_x", FINDER_PROVIDER="rules").resolve_finder() == "rules"


class _Resp:
    def __init__(self, payload): self._p = payload
    def raise_for_status(self): pass
    def json(self): return self._p


class _Client:
    """Records the one request the finder makes."""
    def __init__(self, payload):
        self.payload, self.calls = payload, []
    def post(self, url, json=None, headers=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return _Resp(self.payload)


SENTENCES = [{"start_ms": i * 2000, "end_ms": i * 2000 + 1800, "text": f"sentence {i}"} for i in range(8)]
REPLY = '{"moments":[{"start":"00:00","end":"00:30","title":"A hook","reason":"r","score":80}]}'


def test_an_openai_shaped_provider_is_called_correctly(cfg):
    cfg(AI_API_KEY="gsk_abc")
    client = _Client({"choices": [{"message": {"content": REPLY}}]})
    found = find.ai_find(SENTENCES, 1, 30_000, http=client)
    call = client.calls[0]
    assert call["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert call["headers"]["authorization"] == "Bearer gsk_abc"
    assert [m["role"] for m in call["json"]["messages"]] == ["system", "user"]
    assert found and found[0].title


def test_anthropic_is_called_in_its_own_shape(cfg):
    cfg(AI_API_KEY="sk-ant-abc")
    client = _Client({"content": [{"text": REPLY}]})
    found = find.ai_find(SENTENCES, 1, 30_000, http=client)
    call = client.calls[0]
    assert call["url"] == "https://api.anthropic.com/v1/messages"
    assert call["headers"]["x-api-key"] == "sk-ant-abc"
    assert "system" in call["json"]
    assert found and found[0].title


def test_without_a_key_it_says_so_rather_than_guessing(cfg):
    cfg()
    with pytest.raises(RuntimeError, match="AI_API_KEY"):
        find.ai_find(SENTENCES, 1, 30_000, http=_Client({}))
