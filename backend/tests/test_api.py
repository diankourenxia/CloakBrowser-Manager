"""Tests for FastAPI routes via TestClient."""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from backend import main
from backend.browser_manager import RunningProfile


# ── Profile CRUD ─────────────────────────────────────────────────────────────


def test_list_profiles_empty(app_client: TestClient):
    resp = app_client.get("/api/profiles")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_profile(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={"name": "Test"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test"
    assert data["status"] == "stopped"
    assert "id" in data
    assert len(data["id"]) == 36  # UUID


def test_create_profile_with_all_fields(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={
        "name": "Full",
        "group_name": "Team A",
        "account_platform": "Amazon",
        "account_username": "seller@example.com",
        "home_url": "https://sellercentral.amazon.com",
        "fingerprint_seed": 42,
        "proxy": "http://host:8080",
        "platform": "macos",
        "screen_width": 2560,
        "screen_height": 1440,
        "humanize": True,
        "human_preset": "careful",
        "tags": [{"tag": "work", "color": "#ff0000"}],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["fingerprint_seed"] == 42
    assert data["group_name"] == "Team A"
    assert data["account_platform"] == "Amazon"
    assert data["account_username"] == "seller@example.com"
    assert data["home_url"] == "https://sellercentral.amazon.com"
    assert data["platform"] == "macos"
    assert len(data["tags"]) == 1


def test_create_profile_invalid_platform(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={"name": "Bad", "platform": "android"})
    assert resp.status_code == 422


def test_get_profile(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Get Me"})
    pid = create.json()["id"]
    resp = app_client.get(f"/api/profiles/{pid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Me"


def test_get_profile_not_found(app_client: TestClient):
    resp = app_client.get("/api/profiles/nonexistent")
    assert resp.status_code == 404


def test_update_profile(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Original"})
    pid = create.json()["id"]
    resp = app_client.put(f"/api/profiles/{pid}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


def test_update_profile_not_found(app_client: TestClient):
    resp = app_client.put("/api/profiles/nonexistent", json={"name": "x"})
    assert resp.status_code == 404


def test_delete_profile(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Delete Me"})
    pid = create.json()["id"]
    resp = app_client.delete(f"/api/profiles/{pid}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    # Confirm gone
    assert app_client.get(f"/api/profiles/{pid}").status_code == 404


def test_delete_profile_not_found(app_client: TestClient):
    resp = app_client.delete("/api/profiles/nonexistent")
    assert resp.status_code == 404


def test_delete_profile_stops_running(app_client: TestClient):
    """Deleting a running profile should stop it first."""
    create = app_client.post("/api/profiles", json={"name": "Running"})
    pid = create.json()["id"]

    # Inject mock running profile
    mock_running = MagicMock(spec=RunningProfile)
    mock_running.display = 100
    mock_running.ws_port = 6100
    mock_running.cdp_port = 5100
    main.browser_mgr.running[pid] = mock_running
    main.browser_mgr.stop = AsyncMock()

    resp = app_client.delete(f"/api/profiles/{pid}")
    assert resp.status_code == 200
    main.browser_mgr.stop.assert_called_once_with(pid)


def test_clone_profile_endpoint(app_client: TestClient):
    create = app_client.post("/api/profiles", json={
        "name": "Original",
        "group_name": "Shop",
        "account_platform": "Etsy",
        "fingerprint_seed": 12345,
    })
    pid = create.json()["id"]
    resp = app_client.post(f"/api/profiles/{pid}/clone", json={"name": "Original Copy"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Original Copy"
    assert data["group_name"] == "Shop"
    assert data["account_platform"] == "Etsy"
    assert data["fingerprint_seed"] != 12345


def test_import_export_profiles(app_client: TestClient):
    resp = app_client.post("/api/profiles/import", json={
        "profiles": [
            {
                "name": "Imported",
                "group_name": "Batch",
                "account_username": "import@example.com",
            }
        ],
    })
    assert resp.status_code == 201
    assert resp.json()[0]["name"] == "Imported"

    export = app_client.get("/api/profiles/export")
    assert export.status_code == 200
    assert any(p["name"] == "Imported" for p in export.json())


# ── Profile Status ───────────────────────────────────────────────────────────


def test_get_profile_status_stopped(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Status"})
    pid = create.json()["id"]
    resp = app_client.get(f"/api/profiles/{pid}/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


def test_get_profile_status_not_found(app_client: TestClient):
    resp = app_client.get("/api/profiles/nonexistent/status")
    assert resp.status_code == 404


# ── Launch / Stop ────────────────────────────────────────────────────────────


def test_launch_not_found(app_client: TestClient):
    resp = app_client.post("/api/profiles/nonexistent/launch")
    assert resp.status_code == 404


def test_launch_already_running(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Running"})
    pid = create.json()["id"]
    # Inject into running dict
    main.browser_mgr.running[pid] = MagicMock(spec=RunningProfile)
    resp = app_client.post(f"/api/profiles/{pid}/launch")
    assert resp.status_code == 409
    # Cleanup
    main.browser_mgr.running.pop(pid, None)


def test_launch_invalid_proxy_400(app_client: TestClient):
    """ValueError from browser_mgr.launch should map to 400."""
    create = app_client.post("/api/profiles", json={"name": "BadProxy"})
    pid = create.json()["id"]
    main.browser_mgr.launch = AsyncMock(side_effect=ValueError("Invalid proxy scheme 'ftp'"))
    resp = app_client.post(f"/api/profiles/{pid}/launch")
    assert resp.status_code == 400
    assert "ftp" in resp.json()["detail"]


def test_launch_failure_500(app_client: TestClient):
    """Generic exception from browser_mgr.launch should map to 500."""
    create = app_client.post("/api/profiles", json={"name": "Crash"})
    pid = create.json()["id"]
    main.browser_mgr.launch = AsyncMock(side_effect=RuntimeError("Xvnc failed"))
    resp = app_client.post(f"/api/profiles/{pid}/launch")
    assert resp.status_code == 500
    assert resp.json()["detail"] == "Failed to launch browser"


def test_stop_not_running(app_client: TestClient):
    resp = app_client.post("/api/profiles/nonexistent/stop")
    assert resp.status_code == 404


def test_batch_launch_profiles(app_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    main.browser_mgr.running.clear()
    one = app_client.post("/api/profiles", json={"name": "Batch One"}).json()
    two = app_client.post("/api/profiles", json={"name": "Batch Two"}).json()

    async def fake_launch(profile: dict):
        mock_running = MagicMock(spec=RunningProfile)
        mock_running.display = 100
        mock_running.ws_port = 6100
        mock_running.cdp_port = 5100
        main.browser_mgr.running[profile["id"]] = mock_running
        return mock_running

    monkeypatch.setattr(main.browser_mgr, "launch", fake_launch)

    resp = app_client.post("/api/profiles/batch/launch", json={"ids": [one["id"], two["id"]]})
    assert resp.status_code == 200
    assert [r["ok"] for r in resp.json()] == [True, True]

    launched = app_client.get(f"/api/profiles/{one['id']}").json()
    assert launched["last_launched_at"] is not None
    main.browser_mgr.running.clear()


def test_batch_stop_profiles(app_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    profile = app_client.post("/api/profiles", json={"name": "Stop Batch"}).json()
    main.browser_mgr.running[profile["id"]] = MagicMock(spec=RunningProfile)

    async def fake_stop(profile_id: str):
        main.browser_mgr.running.pop(profile_id, None)

    monkeypatch.setattr(main.browser_mgr, "stop", fake_stop)

    resp = app_client.post(
        "/api/profiles/batch/stop",
        json={"ids": [profile["id"], "missing"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["ok"] is True
    assert data[0]["status"] == "stopped"
    assert data[1]["ok"] is False


# ── System Status ────────────────────────────────────────────────────────────


def test_system_status(app_client: TestClient):
    # Clear any leaked running profiles from prior tests
    main.browser_mgr.running.clear()

    # Create a profile so profiles_total > 0
    app_client.post("/api/profiles", json={"name": "Status Test"})
    resp = app_client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running_count"] == 0
    assert data["binary_version"] == "0.0.0-test"
    assert data["profiles_total"] >= 1


# ── Launch Args ─────────────────────────────────────────────────────────────


def test_profile_launch_args_default_empty(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={"name": "NoArgs"})
    assert resp.status_code == 201
    assert resp.json()["launch_args"] == []


def test_profile_launch_args_create(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={
        "name": "WithArgs",
        "launch_args": ["--load-extension=/data/ext", "--disable-features=Foo"],
    })
    assert resp.status_code == 201
    assert resp.json()["launch_args"] == ["--load-extension=/data/ext", "--disable-features=Foo"]


def test_profile_launch_args_update(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={"name": "UpdateArgs"})
    pid = resp.json()["id"]
    resp = app_client.put(f"/api/profiles/{pid}", json={"launch_args": ["--new-flag"]})
    assert resp.status_code == 200
    assert resp.json()["launch_args"] == ["--new-flag"]


def test_profile_launch_args_get(app_client: TestClient):
    resp = app_client.post("/api/profiles", json={
        "name": "GetArgs",
        "launch_args": ["--flag"],
    })
    pid = resp.json()["id"]
    resp = app_client.get(f"/api/profiles/{pid}")
    assert resp.json()["launch_args"] == ["--flag"]


# ── Clipboard Sync Setting ──────────────────────────────────────────────────


def test_profile_clipboard_sync_default_true(app_client: TestClient):
    """New profiles should have clipboard_sync=true by default."""
    resp = app_client.post("/api/profiles", json={"name": "Clipboard Test"})
    assert resp.status_code == 201
    assert resp.json()["clipboard_sync"] is True


def test_profile_clipboard_sync_update(app_client: TestClient):
    """clipboard_sync can be toggled per profile."""
    resp = app_client.post("/api/profiles", json={"name": "Clipboard Toggle"})
    pid = resp.json()["id"]
    resp = app_client.put(f"/api/profiles/{pid}", json={"clipboard_sync": False})
    assert resp.status_code == 200
    assert resp.json()["clipboard_sync"] is False
    resp = app_client.put(f"/api/profiles/{pid}", json={"clipboard_sync": True})
    assert resp.json()["clipboard_sync"] is True


# ── Clipboard ────────────────────────────────────────────────────────────────


def test_set_clipboard_not_running(app_client: TestClient):
    resp = app_client.post("/api/profiles/nonexistent/clipboard", json={"text": "hello"})
    assert resp.status_code == 404


def test_get_clipboard_not_running(app_client: TestClient):
    resp = app_client.get("/api/profiles/nonexistent/clipboard")
    assert resp.status_code == 404


def test_set_clipboard_success(app_client: TestClient):
    """Mock a running profile and patch xclip subprocess."""
    create = app_client.post("/api/profiles", json={"name": "Clip"})
    pid = create.json()["id"]

    # Inject mock running profile
    mock_running = MagicMock(spec=RunningProfile)
    mock_running.display = 100
    mock_running.cdp_port = 5100
    main.browser_mgr.running[pid] = mock_running

    # Mock asyncio.create_subprocess_exec to avoid actual xclip
    mock_proc = AsyncMock()
    mock_proc.returncode = None
    mock_proc.stdin = MagicMock()
    mock_proc.stdin.write = MagicMock()
    mock_proc.stdin.drain = AsyncMock()
    mock_proc.stdin.close = MagicMock()

    with patch("backend.main.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_proc):
        resp = app_client.post(f"/api/profiles/{pid}/clipboard", json={"text": "test clipboard"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # Cleanup
    main.browser_mgr.running.pop(pid, None)


def test_get_clipboard_from_page(app_client: TestClient):
    """Mock running profile with a page that has clipboard text."""
    create = app_client.post("/api/profiles", json={"name": "ClipRead"})
    pid = create.json()["id"]

    # Mock page with clipboard text
    mock_page = AsyncMock()
    mock_page.evaluate = AsyncMock(return_value="copied text")

    mock_context = MagicMock()
    mock_context.pages = [mock_page]

    mock_running = MagicMock(spec=RunningProfile)
    mock_running.display = 100
    mock_running.cdp_port = 5100
    mock_running.context = mock_context
    main.browser_mgr.running[pid] = mock_running

    resp = app_client.get(f"/api/profiles/{pid}/clipboard")
    assert resp.status_code == 200
    assert resp.json()["text"] == "copied text"

    # Cleanup
    main.browser_mgr.running.pop(pid, None)


# ── File Upload ──────────────────────────────────────────────────────────────


def test_upload_files_not_running(app_client: TestClient):
    resp = app_client.post("/api/profiles/nonexistent/files", json={
        "files": [{"name": "image.png", "data_base64": "aGk=", "mime_type": "image/png"}],
    })
    assert resp.status_code == 404


def test_upload_files_sets_current_page_file_input(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "Uploader"})
    pid = create.json()["id"]

    mock_running = MagicMock(spec=RunningProfile)
    mock_running.display = None
    mock_running.cdp_port = 5100
    main.browser_mgr.running[pid] = mock_running

    mock_input = MagicMock()
    mock_input.get_attribute = AsyncMock(return_value=None)
    mock_input.set_input_files = AsyncMock()

    mock_locator = MagicMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_locator.nth = MagicMock(return_value=mock_input)

    mock_page = MagicMock()
    mock_page.locator = MagicMock(return_value=mock_locator)

    with patch("backend.main._get_screencast_page", AsyncMock(return_value=mock_page)):
        resp = app_client.post(f"/api/profiles/{pid}/files", json={
            "files": [{"name": "image.png", "data_base64": "aGk=", "mime_type": "image/png"}],
        })

    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "count": 1}
    mock_input.set_input_files.assert_awaited_once()

    main.browser_mgr.running.pop(pid, None)


# ── Response shape ───────────────────────────────────────────────────────────


def test_profile_response_has_status_field(app_client: TestClient):
    app_client.post("/api/profiles", json={"name": "Shape"})
    resp = app_client.get("/api/profiles")
    for profile in resp.json():
        assert "status" in profile
        assert profile["status"] in ("running", "stopped")


def test_profile_response_has_cdp_url_field(app_client: TestClient):
    """Stopped profiles should have cdp_url=null."""
    app_client.post("/api/profiles", json={"name": "CdpShape"})
    resp = app_client.get("/api/profiles")
    for profile in resp.json():
        assert "cdp_url" in profile
        if profile["status"] == "stopped":
            assert profile["cdp_url"] is None


def test_status_stopped_has_cdp_url_null(app_client: TestClient):
    create = app_client.post("/api/profiles", json={"name": "CdpStatus"})
    pid = create.json()["id"]
    resp = app_client.get(f"/api/profiles/{pid}/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cdp_url"] is None


def test_running_profile_has_cdp_url(app_client: TestClient):
    """Running profile should have a cdp_url in list/get responses."""
    create = app_client.post("/api/profiles", json={"name": "CdpRunning"})
    pid = create.json()["id"]

    mock_running = MagicMock(spec=RunningProfile)
    mock_running.display = 100
    mock_running.ws_port = 6100
    mock_running.cdp_port = 5100
    mock_running.profile_id = pid
    main.browser_mgr.running[pid] = mock_running

    resp = app_client.get(f"/api/profiles/{pid}")
    data = resp.json()
    assert data["status"] == "running"
    assert data["cdp_url"] == f"/api/profiles/{pid}/cdp"

    # Cleanup
    main.browser_mgr.running.pop(pid, None)


# ── CDP Proxy ───────────────────────────────────────────────────────────────


def test_cdp_json_version_not_running(app_client: TestClient):
    resp = app_client.get("/api/profiles/nonexistent/cdp/json/version")
    assert resp.status_code == 404


def test_cdp_json_list_not_running(app_client: TestClient):
    resp = app_client.get("/api/profiles/nonexistent/cdp/json/list")
    assert resp.status_code == 404


def _mock_running_profile(pid: str) -> MagicMock:
    """Create a mock RunningProfile and register it in browser_mgr."""
    mock = MagicMock(spec=RunningProfile)
    mock.display = 100
    mock.ws_port = 6100
    mock.cdp_port = 5100
    mock.profile_id = pid
    main.browser_mgr.running[pid] = mock
    return mock


def test_cdp_json_version_rewrites_ws_url(app_client: TestClient):
    """GET /cdp/json/version rewrites webSocketDebuggerUrl through our proxy."""
    create = app_client.post("/api/profiles", json={"name": "CdpVer"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    chrome_response = MagicMock()
    chrome_response.json.return_value = {
        "webSocketDebuggerUrl": "ws://127.0.0.1:5100/devtools/browser/abc-123",
        "Browser": "Chrome/145.0.0.0",
    }
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=chrome_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        resp = app_client.get(f"/api/profiles/{pid}/cdp/json/version")

    assert resp.status_code == 200
    data = resp.json()
    assert data["webSocketDebuggerUrl"] == f"ws://testserver/api/profiles/{pid}/cdp"
    assert data["Browser"] == "Chrome/145.0.0.0"
    main.browser_mgr.running.pop(pid, None)


def test_cdp_json_version_uses_wss_behind_https(app_client: TestClient):
    """X-Forwarded-Proto: https should produce wss:// URLs."""
    create = app_client.post("/api/profiles", json={"name": "CdpWss"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    chrome_response = MagicMock()
    chrome_response.json.return_value = {
        "webSocketDebuggerUrl": "ws://127.0.0.1:5100/devtools/browser/abc",
    }
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=chrome_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        resp = app_client.get(
            f"/api/profiles/{pid}/cdp/json/version",
            headers={"X-Forwarded-Proto": "https"},
        )

    assert resp.status_code == 200
    assert resp.json()["webSocketDebuggerUrl"].startswith("wss://")
    main.browser_mgr.running.pop(pid, None)


def test_cdp_json_list_rewrites_page_urls(app_client: TestClient):
    """GET /cdp/json/list rewrites per-page webSocketDebuggerUrl."""
    create = app_client.post("/api/profiles", json={"name": "CdpList"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    chrome_response = MagicMock()
    chrome_response.json.return_value = [
        {
            "id": "page1",
            "webSocketDebuggerUrl": "ws://127.0.0.1:5100/devtools/page/DEADBEEF",
        },
        {
            "id": "page2",
            "title": "No WS URL",
        },
    ]
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=chrome_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        resp = app_client.get(f"/api/profiles/{pid}/cdp/json/list")

    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["webSocketDebuggerUrl"] == (
        f"ws://testserver/api/profiles/{pid}/cdp/devtools/page/DEADBEEF"
    )
    assert "webSocketDebuggerUrl" not in data[1]
    main.browser_mgr.running.pop(pid, None)


def test_cdp_json_version_chrome_unreachable(app_client: TestClient):
    """502 when Chrome CDP endpoint is down."""
    create = app_client.post("/api/profiles", json={"name": "CdpDown"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(side_effect=ConnectionError("refused"))

    with patch("httpx.AsyncClient", return_value=mock_client):
        resp = app_client.get(f"/api/profiles/{pid}/cdp/json/version")

    assert resp.status_code == 502
    main.browser_mgr.running.pop(pid, None)


# ── WebSocket Origin Validation ──────────────────────────────────────────────


def test_vnc_ws_rejects_cross_origin(app_client: TestClient):
    """VNC WebSocket should reject cross-origin browser connections."""
    create = app_client.post("/api/profiles", json={"name": "OriginVnc"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    with pytest.raises(Exception):
        with app_client.websocket_connect(
            f"/api/profiles/{pid}/vnc",
            headers={"origin": "http://evil.com"},
        ):
            pass
    main.browser_mgr.running.pop(pid, None)


def test_cdp_ws_rejects_cross_origin(app_client: TestClient):
    """CDP WebSocket should reject cross-origin browser connections."""
    create = app_client.post("/api/profiles", json={"name": "OriginCdp"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    with pytest.raises(Exception):
        with app_client.websocket_connect(
            f"/api/profiles/{pid}/cdp",
            headers={"origin": "http://evil.com"},
        ):
            pass
    main.browser_mgr.running.pop(pid, None)


def test_ws_allows_same_origin(app_client: TestClient):
    """WebSocket from same origin should pass Origin check (not get 4403)."""
    create = app_client.post("/api/profiles", json={"name": "OriginOk"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    # Same-origin passes Origin check. VNC proxy then fails to connect to
    # real KasmVNC (not running), but that's fine — we're testing Origin only.
    # The connection is accepted (no 4403), then closes due to VNC connect error.
    try:
        with app_client.websocket_connect(
            f"/api/profiles/{pid}/vnc",
            headers={"origin": "http://testserver"},
        ) as ws:
            pass  # connection accepted = Origin check passed
    except Exception as exc:
        # Any error other than 4403 means Origin check passed
        assert "4403" not in str(exc)
    main.browser_mgr.running.pop(pid, None)


def test_ws_allows_no_origin(app_client: TestClient):
    """WebSocket without Origin header (Playwright/Puppeteer) should be accepted."""
    create = app_client.post("/api/profiles", json={"name": "NoOrigin"})
    pid = create.json()["id"]
    _mock_running_profile(pid)

    try:
        with app_client.websocket_connect(f"/api/profiles/{pid}/vnc") as ws:
            pass
    except Exception as exc:
        assert "4403" not in str(exc)
    main.browser_mgr.running.pop(pid, None)
