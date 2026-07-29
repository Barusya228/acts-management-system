from app.api.inventory import _category_code


def test_category_code_is_generated_from_russian_name():
    assert _category_code("Камера") == "kamera"
    assert _category_code("Удлинитель сетевой") == "udlinitel-setevoy"


def test_category_code_normalizes_custom_code():
    assert _category_code("Security Camera 4K") == "security-camera-4k"
