"""HTTP-тесты границ авторизации через реальное приложение.

Проверяют то, что unit-тесты route-функций не видят: wiring роутеров,
зависимости Depends, фактические коды ответов и различие прав
админ / киоск / аноним.
"""

from tests.conftest import admin_headers, kiosk_headers, requires_postgres

pytestmark = requires_postgres


def test_anonymous_requests_are_rejected(http_env):
    client, _db, _admin, _signer = http_env

    # Ключевые разделы закрыты без токена (403 — HTTPBearer без credentials).
    for path in ["/api/acts", "/api/participants", "/api/inventory/available", "/api/auth/me"]:
        response = client.get(path)
        assert response.status_code in {401, 403}, f"{path}: {response.status_code}"

    # Старый анонимный guest-login удалён.
    assert client.post("/api/auth/guest-login").status_code in {404, 405}


def test_kiosk_enrollment_flow_over_http(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)

    kiosk, kiosk_id = kiosk_headers(client, headers)

    # Киоск аутентифицирован и видит своё имя устройства.
    context = client.get("/api/auth/kiosk-context", headers=kiosk)
    assert context.status_code == 200
    assert context.json()["kiosk"]["id"] == kiosk_id

    # Киоск видит рабочие данные церемонии.
    assert client.get("/api/acts", headers=kiosk).status_code == 200
    assert client.get("/api/inventory/available", headers=kiosk).status_code == 200

    # Но не админские разделы.
    assert client.get("/api/admin/audit-log", headers=kiosk).status_code == 403
    assert client.get("/api/auth/kiosks", headers=kiosk).status_code == 403
    assert client.get("/api/admin/email-outbox", headers=kiosk).status_code == 403


def test_revoked_kiosk_token_stops_working_immediately(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)
    kiosk, kiosk_id = kiosk_headers(client, headers)

    assert client.get("/api/acts", headers=kiosk).status_code == 200

    revoke = client.delete(f"/api/auth/kiosks/{kiosk_id}", headers=headers)
    assert revoke.status_code == 204

    # Тот же JWT ещё валиден криптографически, но устройство отозвано.
    assert client.get("/api/acts", headers=kiosk).status_code == 401


def test_stale_guest_token_without_kiosk_claim_is_rejected(http_env):
    """Старые guest-токены (до внедрения киосков) не должны работать."""
    from datetime import timedelta

    from app.core.security import create_access_token

    client, _db, _admin, signer = http_env
    legacy_token = create_access_token(data={"sub": str(signer.id)}, expires_delta=timedelta(minutes=5))

    response = client.get("/api/acts", headers={"Authorization": f"Bearer {legacy_token}"})
    assert response.status_code == 401


def test_admin_full_access_over_http(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)

    assert client.get("/api/acts", headers=headers).status_code == 200
    assert client.get("/api/admin/audit-log", headers=headers).status_code == 200
    assert client.get("/api/auth/kiosks", headers=headers).status_code == 200
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "ADMIN"
