from app.db.models import IpadDevice
from tests.conftest import admin_headers, requires_postgres


pytestmark = requires_postgres


def test_ipad_tags_use_natural_sort_across_pages(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    tags = ["10", "2", "100", "A10", "A2", "B1", "key10", "key2", "Alpha"]
    db.add_all([
        IpadDevice(
            device_name="iPad",
            model="Sort test",
            tag=tag,
            serial_number=f"SORT-{index}",
            status="AVAILABLE",
        )
        for index, tag in enumerate(tags)
    ])
    db.commit()

    first_page = client.get(
        "/api/ipad-inventory?tag_order=asc&page=1&page_size=4",
        headers=headers,
    )
    second_page = client.get(
        "/api/ipad-inventory?tag_order=asc&page=2&page_size=4",
        headers=headers,
    )
    descending = client.get(
        "/api/ipad-inventory?tag_order=desc&page=1&page_size=20",
        headers=headers,
    )

    assert first_page.status_code == 200, first_page.text
    assert second_page.status_code == 200, second_page.text
    assert descending.status_code == 200, descending.text
    assert [item["tag"] for item in first_page.json()["items"]] == ["2", "10", "100", "A2"]
    assert [item["tag"] for item in second_page.json()["items"]] == ["A10", "Alpha", "B1", "key2"]
    assert [item["tag"] for item in descending.json()["items"]] == [
        "100", "10", "2", "key10", "key2", "B1", "Alpha", "A10", "A2",
    ]


def test_bulk_resolve_matches_serials_and_reports_unavailable_devices(http_env):
    client, db, _admin, _signer = http_env
    headers = admin_headers(client)
    available = IpadDevice(
        device_name="iPad",
        model="10th Gen",
        tag="T-AVAILABLE",
        serial_number="F4YF3F90H7",
        status="AVAILABLE",
    )
    issued = IpadDevice(
        device_name="iPad",
        model="10th Gen",
        tag="T-ISSUED",
        serial_number="DLQ5HK43XK",
        status="ISSUED",
    )
    db.add_all([available, issued])
    db.commit()

    response = client.post(
        "/api/ipad-inventory/available/resolve",
        headers=headers,
        json={"serial_numbers": ["f4yf3f90h7", "DLQ5HK43XK", "UNKNOWN"]},
    )

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [item["match_status"] for item in items] == ["AVAILABLE", "UNAVAILABLE", "NOT_FOUND"]
    assert items[0]["device"]["id"] == str(available.id)
    assert items[0]["device"]["serial_number"] == "F4YF3F90H7"
    assert items[1]["device"]["status"] == "ISSUED"
    assert items[2]["device"] is None
