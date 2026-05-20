"""
Management command: create_test_users

Seeds two test organizations and users for local development.
Safe to re-run — skips any user that already exists.

Usage:
    python manage.py create_test_users

Credentials (used in the frontend dev login picker):
    sub: dev-owner-1   org: Acme Construction   email: owner@acme.test
    sub: dev-owner-2   org: Beta Electrical      email: owner@beta.test
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.organizations.models import Organization, User
from apps.vendors.signals import create_default_requirement_profile

TEST_USERS = [
    {
        'sub': 'dev-owner-1',
        'email': 'owner@acme.test',
        'name': 'Alice (Acme)',
        'org_name': 'Acme Construction',
        'role': 'owner',
    },
    {
        'sub': 'dev-owner-2',
        'email': 'owner@beta.test',
        'name': 'Bob (Beta)',
        'org_name': 'Beta Electrical',
        'role': 'owner',
    },
]


class Command(BaseCommand):
    help = 'Seed test organizations and users for local development (no-op if already exist)'

    def handle(self, *args, **options):
        created = 0
        skipped = 0

        for spec in TEST_USERS:
            if User.objects.filter(auth0_sub=spec['sub']).exists():
                self.stdout.write(f"  skip  {spec['email']} — already exists")
                skipped += 1
                continue

            with transaction.atomic():
                org = Organization.objects.create(name=spec['org_name'])
                User.objects.create(
                    organization=org,
                    email=spec['email'],
                    name=spec['name'],
                    auth0_sub=spec['sub'],
                    role=spec['role'],
                )
                create_default_requirement_profile(org)

            self.stdout.write(self.style.SUCCESS(f"  created {spec['email']} / org: {spec['org_name']}"))
            created += 1

        self.stdout.write(f"\nDone — {created} created, {skipped} skipped.")
        self.stdout.write("To log in without Auth0, run the frontend in dev mode (VITE_AUTH0_DOMAIN=)")
