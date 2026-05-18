import boto3
from django.conf import settings


def _get_client():
    return boto3.client(
        's3',
        endpoint_url=settings.R2_ENDPOINT_URL or None,
        aws_access_key_id=settings.R2_ACCESS_KEY or None,
        aws_secret_access_key=settings.R2_SECRET_KEY or None,
        region_name='auto',
    )


def upload_to_r2(key: str, file_obj, content_type: str = 'application/pdf') -> None:
    """Upload a file-like object to R2."""
    client = _get_client()
    client.upload_fileobj(
        file_obj,
        settings.R2_BUCKET,
        key,
        ExtraArgs={'ContentType': content_type},
    )


def download_from_r2(key: str) -> bytes:
    """Download a file from R2 and return its bytes."""
    client = _get_client()
    response = client.get_object(Bucket=settings.R2_BUCKET, Key=key)
    return response['Body'].read()


def get_signed_url(key: str, expires_in: int = 900) -> str:
    """Generate a short-lived presigned URL for private document access."""
    client = _get_client()
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.R2_BUCKET, 'Key': key},
        ExpiresIn=expires_in,
    )
