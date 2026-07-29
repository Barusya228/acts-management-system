from app.utils.pdf import _build_numbered_party_rows


def test_multiple_recipients_are_numbered_as_separate_parties():
    rows = _build_numbered_party_rows(
        "IT Manager",
        [
            {"full_name": "First Recipient", "email": "first@example.com"},
            {"full_name": "Second Recipient", "email": "second@example.com"},
        ],
        "party1.png",
        ["party2.png", "party3.png"],
        "Принимает возврат",
        "Возвращает технику",
    )

    assert [row[0] for row in rows] == [
        "Сторона 1\n(Принимает возврат)",
        "Сторона 2\n(Возвращает технику)",
        "Сторона 3\n(Возвращает технику)",
    ]
    assert [row[2] for row in rows] == ["party1.png", "party2.png", "party3.png"]


def test_sparse_signatures_keep_their_recipient_positions():
    rows = _build_numbered_party_rows(
        "IT Manager",
        [
            {"full_name": "First Recipient", "email": "first@example.com"},
            {"full_name": "Second Recipient", "email": "second@example.com"},
        ],
        "party1.png",
        [None, "party3.png"],
        "Принимает возврат",
        "Возвращает технику",
    )

    assert [row[2] for row in rows] == ["party1.png", None, "party3.png"]
