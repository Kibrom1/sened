"""
Data migration: register the daily compliance digest email in django-celery-beat.
Runs at 09:00 UTC — one hour after the compliance sweep (08:00 UTC).
"""
from django.db import migrations


def add_periodic_task(apps, schema_editor):
    CrontabSchedule = apps.get_model('django_celery_beat', 'CrontabSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute='0',
        hour='9',
        day_of_week='*',
        day_of_month='*',
        month_of_year='*',
    )

    PeriodicTask.objects.get_or_create(
        name='Daily compliance digest email',
        defaults={
            'task': 'apps.compliance.tasks.send_compliance_digest_all_orgs',
            'crontab': schedule,
            'enabled': True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='Daily compliance digest email').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('compliance', '0003_celery_beat_daily_check'),
        ('django_celery_beat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_periodic_task, reverse_code=remove_periodic_task),
    ]
