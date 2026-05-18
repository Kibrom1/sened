from django.db import connection
from django.http import JsonResponse


def health_check(request):
    """Health check endpoint. Verifies DB connectivity."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        db_status = 'ok'
    except Exception as e:
        db_status = f'error: {e}'

    status = 200 if db_status == 'ok' else 503
    return JsonResponse({'status': 'ok' if status == 200 else 'degraded', 'db': db_status}, status=status)
