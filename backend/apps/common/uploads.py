"""
Shared COI upload validation.

COI certificates arrive as PDFs or as images (vendors often photograph or
scan a certificate). Claude's vision API reads PNG/JPEG/WEBP/GIF directly, so
images skip the PDF→PNG conversion step in the extraction pipeline.

HEIC (default iPhone format) is intentionally excluded — the vision API does
not accept it and decoding it server-side is unreliable.
"""
import os

# extension → content type
EXTENSION_CONTENT_TYPE = {
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
}

ALLOWED_UPLOAD_EXTENSIONS = set(EXTENSION_CONTENT_TYPE)
ALLOWED_CONTENT_TYPES = set(EXTENSION_CONTENT_TYPE.values())

UNSUPPORTED_MESSAGE = (
    'Unsupported file type. Upload a PDF or an image (PNG, JPG, WEBP, or GIF).'
)


def file_extension(filename: str) -> str:
    return os.path.splitext(filename or '')[1].lower().lstrip('.')


def validate_coi_upload(file_obj):
    """
    Validate an uploaded COI file by extension, falling back to its
    content-type. Returns (ext, content_type, error) where error is None when
    the file is acceptable.
    """
    ext = file_extension(getattr(file_obj, 'name', ''))
    if ext in ALLOWED_UPLOAD_EXTENSIONS:
        return ext, EXTENSION_CONTENT_TYPE[ext], None

    # Fall back to the browser-provided content type (e.g. extensionless name).
    content_type = (getattr(file_obj, 'content_type', '') or '').lower()
    if content_type in ALLOWED_CONTENT_TYPES:
        for e, ct in EXTENSION_CONTENT_TYPE.items():
            if ct == content_type:
                return e, ct, None

    return None, None, UNSUPPORTED_MESSAGE
