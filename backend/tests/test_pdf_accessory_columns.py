import pytest

from app.utils.pdf import _build_accessory_table_data


@pytest.mark.parametrize(
    "item, expected_header, quantity_column",
    [
        ({"name": "Mouse", "quantity": 1}, ["№", "Мелкая техника", "Кол-во"], 2),
        ({"name": "Mouse", "model": "M185", "quantity": 1}, ["№", "Мелкая техника", "Модель", "Кол-во"], 3),
        ({"name": "Mouse", "quantity": 1, "note": "Wireless"}, ["№", "Мелкая техника", "Кол-во", "Заметка"], 2),
        ({"name": "Mouse", "model": "M185", "quantity": 1, "note": "Wireless"}, ["№", "Мелкая техника", "Модель", "Кол-во", "Заметка"], 3),
    ],
)
def test_accessory_pdf_columns_are_added_only_when_used(item, expected_header, quantity_column):
    data, widths, actual_quantity_column = _build_accessory_table_data([item])

    assert data[0] == expected_header
    assert len(data[1]) == len(expected_header)
    assert len(widths) == len(expected_header)
    assert sum(widths) == 491
    assert actual_quantity_column == quantity_column
    assert "Возврат" not in data[0]


def test_blank_model_and_note_do_not_add_pdf_columns():
    data, _widths, _quantity_column = _build_accessory_table_data([
        {"name": "Power adapter", "model": "   ", "quantity": 1, "note": ""},
    ])

    assert data[0] == ["№", "Мелкая техника", "Кол-во"]
