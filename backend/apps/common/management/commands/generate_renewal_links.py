"""
Dev helper: run the renewal scan and print magic-link URLs for every
RenewalRequest that was just created (or already exists as scheduled/sent).

Usage:
    python manage.py generate_renewal_links [--settings=config.settings.local]

Prints one clickable URL per vendor so you can paste it straight into a
browser tab and test the Phase 3 magic-upload flow without needing Resend
or a real email client.
"""

from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Run the renewal scan and print magic-link URLs for manual testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete all existing RenewalRequests first (clean slate)',
        )

    def handle(self, *args, **options):
        from apps.renewals.models import RenewalRequest
        from apps.renewals.tasks import scan_renewals_due

        if options['reset']:
            deleted, _ = RenewalRequest.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted {deleted} existing renewal request(s)'))

        self.stdout.write('Running renewal scan…')
        count = scan_renewals_due()
        self.stdout.write(self.style.SUCCESS(f'{count} new renewal request(s) created\n'))

        # Print all open requests (including any pre-existing ones)
        requests = (
            RenewalRequest.objects
            .select_related('vendor', 'organization')
            .exclude(status='responded')
            .order_by('organization__name', 'vendor__name')
        )

        if not requests.exists():
            self.stdout.write(self.style.WARNING(
                'No open renewal requests found.\n'
                'Make sure there are vendors with:\n'
                '  • a confirmed COI\n'
                '  • a coverage expiring within reminder_lead_days (default 30)\n'
                '  • a contact_email set\n'
                '\nTip: run  python manage.py create_seed_data  to reset demo data.'
            ))
            return

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')

        self.stdout.write('─' * 60)
        self.stdout.write(f'{"VENDOR":<30} {"STATUS":<12} URL')
        self.stdout.write('─' * 60)

        for r in requests:
            url = f'{frontend_url}/magic-upload/{r.magic_link_token}'
            label = f'{r.vendor.name} ({r.organization.name})'
            self.stdout.write(f'{label:<30} {r.status:<12} {url}')

        self.stdout.write('─' * 60)
        self.stdout.write(
            '\nPaste any URL above into a browser tab to test the upload page.'
        )
