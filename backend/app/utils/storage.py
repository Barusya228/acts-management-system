import base64
import hashlib
import mimetypes
from io import BytesIO
from pathlib import Path
from typing import Optional

from app.core.config import settings
from PIL import Image, ImageChops


MAX_SIGNATURE_BYTES = 5 * 1024 * 1024


def ensure_storage_dir(relative_dir: str) -> Path:
    storage_root = Path(settings.STORAGE_PATH)
    target_dir = storage_root / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def save_bytes(relative_dir: str, filename: str, content: bytes) -> tuple[str, int, str]:
    target_dir = ensure_storage_dir(relative_dir)
    target_path = target_dir / filename
    target_path.write_bytes(content)
    sha256 = hashlib.sha256(content).hexdigest()
    relative_path = target_path.relative_to(Path(settings.STORAGE_PATH)).as_posix()
    return relative_path, len(content), sha256


def decode_data_url(data_url: str) -> tuple[bytes, str, str]:
    if "," not in data_url:
        raise ValueError("Invalid data URL")

    header, encoded = data_url.split(",", 1)
    mime_type = "application/octet-stream"
    extension = ".bin"

    if header.startswith("data:"):
        mime_type = header[5:].split(";")[0] or mime_type
        extension = mimetypes.guess_extension(mime_type) or extension

    return base64.b64decode(encoded, validate=True), mime_type, extension


def validate_signature_data_url(data_url: str) -> None:
    if len(data_url) > 8 * 1024 * 1024:
        raise ValueError("Подпись превышает допустимый размер")
    content, mime_type, _extension = decode_data_url(data_url)
    if mime_type not in {"image/png", "image/jpeg"}:
        raise ValueError("Подпись должна быть изображением PNG или JPEG")
    if not content or len(content) > MAX_SIGNATURE_BYTES:
        raise ValueError("Некорректный размер подписи")
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content)).convert("RGBA")
    except Exception as exc:
        raise ValueError("Файл подписи повреждён") from exc
    if image.width > 4096 or image.height > 4096:
        raise ValueError("Изображение подписи слишком большое")
    rendered = Image.new("RGB", image.size, "white")
    rendered.paste(image.convert("RGB"), mask=image.getchannel("A"))
    white = Image.new("RGB", image.size, "white")
    if ImageChops.difference(rendered, white).getbbox() is None:
        raise ValueError("Подпись не может быть пустой")


def save_data_url_file(data_url: str, relative_dir: str, filename_stem: str) -> tuple[str, str, int, str]:
    content, mime_type, extension = decode_data_url(data_url)
    filename = f"{filename_stem}{extension}"
    relative_path, size_bytes, sha256 = save_bytes(relative_dir, filename, content)
    return relative_path, mime_type, size_bytes, sha256


def resolve_storage_path(relative_path: str) -> Path:
    return Path(settings.STORAGE_PATH) / relative_path
