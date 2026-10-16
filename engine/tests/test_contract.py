"""The HTTP contract Base44 codes against."""
from __future__ import annotations


def test_health_is_open(api):
    r = api.get("/v1/health", headers={"authorization": ""})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_key_is_required(api):
    r = api.get("/v1/account", headers={"authorization": ""})
    assert r.status_code == 401
    assert r.json() == {"success": False, "error": {"code": "UNAUTHORIZED",
                                                    "message": "Send an Authorization: Bearer <key> header."}}


def test_rate_limit_headers_present(api):
    r = api.get("/v1/account")
    assert r.status_code == 200
    assert int(r.headers["RateLimit-Remaining"]) >= 0
    assert int(r.headers["RateLimit-Limit"]) > 0


def test_unknown_id_is_a_clean_404(api):
    body = api.get("/v1/assets/ast_missing").json()
    assert body["success"] is False and body["error"]["code"] == "NOT_FOUND"


def test_validation_names_the_field(api, uploaded_asset):
    r = api.post("/v1/autoclip", json={"asset_id": uploaded_asset, "coverage": "sideways"})
    assert r.status_code == 400
    assert "coverage" in r.json()["error"]["message"]


def test_subtitle_styles_catalog(api):
    styles = api.get("/v1/subtitle-styles").json()["styles"]
    assert len(styles) == 20
    assert {"id", "name", "font", "defaults"} <= set(styles[0])
