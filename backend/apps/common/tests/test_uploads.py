"""Tests for COI upload validation (PDF + image types)."""
from apps.common.uploads import validate_coi_upload


class _FakeFile:
    def __init__(self, name='', content_type=''):
        self.name = name
        self.content_type = content_type


class TestValidateCoiUpload:
    def test_pdf_ok(self):
        ext, ct, err = validate_coi_upload(_FakeFile('cert.pdf', 'application/pdf'))
        assert (ext, ct, err) == ('pdf', 'application/pdf', None)

    def test_png_ok(self):
        ext, ct, err = validate_coi_upload(_FakeFile('photo.PNG', 'image/png'))
        assert ext == 'png' and ct == 'image/png' and err is None

    def test_jpg_maps_to_jpeg(self):
        ext, ct, err = validate_coi_upload(_FakeFile('scan.jpg'))
        assert ext == 'jpg' and ct == 'image/jpeg' and err is None

    def test_extensionless_uses_content_type(self):
        ext, ct, err = validate_coi_upload(_FakeFile('blob', 'image/webp'))
        assert ext == 'webp' and ct == 'image/webp' and err is None

    def test_unsupported_rejected(self):
        ext, ct, err = validate_coi_upload(_FakeFile('notes.docx', 'application/octet-stream'))
        assert ext is None and ct is None and err is not None

    def test_heic_rejected(self):
        # iPhone default format is intentionally unsupported.
        _, _, err = validate_coi_upload(_FakeFile('IMG_1.heic', 'image/heic'))
        assert err is not None
