from tests.conftest import admin_headers, requires_postgres


pytestmark = requires_postgres


def test_custom_ipad_option_is_created_and_listed(http_env):
    client, _db, _admin, _signer = http_env
    headers = admin_headers(client)

    created = client.post(
        "/api/ipad-acts/custom-options",
        headers=headers,
        json={"option_type": "REPLACEMENT_REASON", "name": "Не работает камера"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["code"].startswith("CUSTOM_")

    listed = client.get("/api/ipad-acts/custom-options", headers=headers)
    assert listed.status_code == 200, listed.text
    assert any(
        item["code"] == created.json()["code"]
        and item["option_type"] == "REPLACEMENT_REASON"
        and item["name"] == "Не работает камера"
        for item in listed.json()
    )
