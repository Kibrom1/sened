"""
Data migration: register the daily renewal scan in django-celery-beat.
Runs at 07:00 UTC — one hour before the compliance sweep (08:00) so
renewal requests are already created when the daily digest fires at 09:00.
Safe to re-apply (get_or_create).
"""
from django.db import migrations


def add_periodic_task(apps, schema_editor):
    CrontabSchedule = apps.get_model('django_celery_beat', 'CrontabSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute='0',
        hour='7',
        day_of_week='*',
        day_of_month='*',
        month_of_year='*',
    )

    PeriodicTask.objects.get_or_create(
        name='Daily renewal scan',
        defaults={
            'task': 'apps.renewals.tasks.scan_renewals_due',
            'crontab': schedule,
            'enabled': True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='Daily renewal scan').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('renewals', '0001_initial'),
        ('django_celery_beat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_periodic_task, reverse_code=remove_periodic_task),
    ]
