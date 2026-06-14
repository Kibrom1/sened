"""
Management command: create_seed_data

Seeds rich, realistic test data across all pages of the sened frontend.
Run AFTER create_test_users (requires dev-owner-1 / dev-owner-2 to exist).

Safe to re-run — wipes and recreates seed data for both orgs each time.

Usage:
    python manage.py create_seed_data

What it creates per org:
  • 3 requirement profiles  (standard, high-risk, low-risk)
  • 12 vendors              (all COI statuses + no-profile edge cases)
  • 20+ COI documents       (confirmed/active, expiring-soon, expired,
                             needs-review/extracted, processing, failed)
  • 40+ extracted coverages (high confidence, low confidence, mixed)
  • 3 compliance checks     (matches, gaps_found, expired)

Pages exercised:
  Dashboard    — all 4 summary card states, full table with mixed statuses
  Vendors      — all 6 row states, search test data (similar names)
  VendorDetail — multi-doc history, back-link, skeleton on slow load
  Upload       — extracted doc with low-confidence fields ready to review
  Profiles     — 3 profiles with different coverage mix and limit values
"""

from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.organizations.models import Organization, User
from apps.vendors.models import Vendor, RequirementProfile, RequirementLine
from apps.documents.models import COIDocument, ExtractedCoverage
from apps.compliance.models import ComplianceCheck

TODAY = date.today()

def d(offset_days: int) -> date:
    """Return a date offset from today."""
    return TODAY + timedelta(days=offset_days)


# ── Requirement profile definitions ──────────────────────────────────────────

PROFILES = [
    {
        'name': 'Standard Subcontractor',
        'lines': [
            dict(coverage_type='general_liability', is_required=True,
                 min_each_occurrence=1_000_000, min_aggregate=2_000_000,
                 additional_insured_required=True, waiver_required=False),
            dict(coverage_type='automobile', is_required=True,
                 min_each_occurrence=1_000_000),
            dict(coverage_type='workers_comp', is_required=True,
                 additional_insured_required=False, waiver_required=True),
            dict(coverage_type='umbrella', is_required=False,
                 min_each_occurrence=2_000_000, min_aggregate=2_000_000),
        ],
    },
    {
        'name': 'High-Risk Contractor',
        'lines': [
            dict(coverage_type='general_liability', is_required=True,
                 min_each_occurrence=2_000_000, min_aggregate=4_000_000,
                 additional_insured_required=True, waiver_required=True),
            dict(coverage_type='automobile', is_required=True,
                 min_each_occurrence=2_000_000),
            dict(coverage_type='workers_comp', is_required=True,
                 additional_insured_required=True, waiver_required=True),
            dict(coverage_type='umbrella', is_required=True,
                 min_each_occurrence=5_000_000, min_aggregate=5_000_000),
            dict(coverage_type='professional_liability', is_required=True,
                 min_each_occurrence=1_000_000),
        ],
    },
    {
        'name': 'Low-Risk Vendor',
        'lines': [
            dict(coverage_type='general_liability', is_required=True,
                 min_each_occurrence=500_000, min_aggregate=1_000_000),
            dict(coverage_type='automobile', is_required=False),
            dict(coverage_type='workers_comp', is_required=True),
        ],
    },
]


# ── Vendor + document definitions ────────────────────────────────────────────

def vendor_specs(profile_map: dict) -> list:
    """
    Returns vendor specs.  profile_map keys: 'standard', 'high_risk', 'low_risk'.
    Each spec describes the vendor and what documents to create.
    """
    std  = profile_map['standard']
    high = profile_map['high_risk']
    low  = profile_map['low_risk']

    return [
        # ── 1. Active — all coverages confirmed, well within expiry ──────────
        {
            'name': 'Apex Roofing LLC',
            'contact_name': 'Marcus Webb',
            'contact_email': 'marcus@apexroofing.test',
            'contact_phone': '(312) 555-0101',
            'notes': 'Primary roofing contractor. Renews annually in October.',
            'profile': std,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'Apex Roofing LLC',
                    'producer_name': 'Midwest Commercial Insurance',
                    'certificate_date': d(-90),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Liberty Mutual',
                             policy_number='GL-2024-88421',
                             effective_date=d(-90), expiration_date=d(275),
                             limits={'each_occurrence': 1_000_000, 'general_aggregate': 2_000_000},
                             additional_insured='yes', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='automobile',
                             carrier_name='Liberty Mutual',
                             policy_number='CA-2024-88422',
                             effective_date=d(-90), expiration_date=d(275),
                             limits={'combined_single_limit': 1_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Travelers',
                             policy_number='WC-2024-55190',
                             effective_date=d(-90), expiration_date=d(275),
                             limits={'el_each_accident': 500_000,
                                     'el_disease_policy_limit': 500_000,
                                     'el_disease_each_employee': 500_000},
                             additional_insured='no', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 2. Active — older doc + newer replacement doc (history test) ─────
        {
            'name': 'Cornerstone Electric',
            'contact_name': 'Priya Nair',
            'contact_email': 'priya@cornerstoneelec.test',
            'contact_phone': '(773) 555-0202',
            'notes': 'Electrical subcontractor. Preferred vendor since 2021.',
            'profile': high,
            'docs': [
                # Older expired doc (shows in history)
                {
                    'status': 'confirmed',
                    'insured_name': 'Cornerstone Electric Inc.',
                    'producer_name': 'Acuity Insurance',
                    'certificate_date': d(-400),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Acuity', policy_number='GL-2023-11001',
                             effective_date=d(-400), expiration_date=d(-35),
                             limits={'each_occurrence': 2_000_000, 'general_aggregate': 4_000_000},
                             additional_insured='yes', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Acuity', policy_number='WC-2023-11002',
                             effective_date=d(-400), expiration_date=d(-35),
                             limits={'el_each_accident': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                    ],
                },
                # Current active replacement
                {
                    'status': 'confirmed',
                    'insured_name': 'Cornerstone Electric Inc.',
                    'producer_name': 'Acuity Insurance',
                    'certificate_date': d(-30),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Acuity', policy_number='GL-2025-22001',
                             effective_date=d(-30), expiration_date=d(335),
                             limits={'each_occurrence': 2_000_000, 'general_aggregate': 4_000_000},
                             additional_insured='yes', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='automobile',
                             carrier_name='Progressive Commercial',
                             policy_number='CA-2025-22002',
                             effective_date=d(-30), expiration_date=d(335),
                             limits={'combined_single_limit': 2_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Acuity', policy_number='WC-2025-22003',
                             effective_date=d(-30), expiration_date=d(335),
                             limits={'el_each_accident': 1_000_000,
                                     'el_disease_policy_limit': 1_000_000,
                                     'el_disease_each_employee': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='umbrella',
                             carrier_name='Zurich', policy_number='UM-2025-22004',
                             effective_date=d(-30), expiration_date=d(335),
                             limits={'each_occurrence': 5_000_000, 'general_aggregate': 5_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 3. Expiring soon — 12 days ────────────────────────────────────────
        {
            'name': 'Summit Plumbing Co.',
            'contact_name': 'Diego Reyes',
            'contact_email': 'diego@summitplumbing.test',
            'contact_phone': '(847) 555-0303',
            'notes': 'Reminder sent 2 weeks ago. Awaiting renewal certificate.',
            'profile': std,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'Summit Plumbing Co.',
                    'producer_name': 'Hanover Insurance Group',
                    'certificate_date': d(-353),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Hanover', policy_number='GL-2024-33100',
                             effective_date=d(-353), expiration_date=d(12),
                             limits={'each_occurrence': 1_000_000, 'general_aggregate': 2_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Hanover', policy_number='WC-2024-33101',
                             effective_date=d(-353), expiration_date=d(12),
                             limits={'el_each_accident': 500_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 4. Expiring soon — 6 days (more urgent) ──────────────────────────
        {
            'name': 'Ironclad HVAC Services',
            'contact_name': 'Tamara Collins',
            'contact_email': 'tamara@ironclad-hvac.test',
            'contact_phone': '(630) 555-0404',
            'notes': '',
            'profile': std,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'Ironclad HVAC Services LLC',
                    'producer_name': 'CNA Insurance',
                    'certificate_date': d(-359),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='CNA', policy_number='GL-2024-44200',
                             effective_date=d(-359), expiration_date=d(6),
                             limits={'each_occurrence': 1_000_000, 'general_aggregate': 2_000_000},
                             additional_insured='yes', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='automobile',
                             carrier_name='CNA', policy_number='CA-2024-44201',
                             effective_date=d(-359), expiration_date=d(6),
                             limits={'combined_single_limit': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Hartford', policy_number='WC-2024-44202',
                             effective_date=d(-359), expiration_date=d(6),
                             limits={'el_each_accident': 500_000},
                             additional_insured='no', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 5. Expired — 10 days ago ──────────────────────────────────────────
        {
            'name': 'BlueLine Demolition',
            'contact_name': 'Frank Osei',
            'contact_email': 'frank@blueline-demo.test',
            'contact_phone': '(708) 555-0505',
            'notes': 'Expired policy. Follow up required before next job.',
            'profile': high,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'BlueLine Demolition Inc.',
                    'producer_name': 'Markel Insurance',
                    'certificate_date': d(-375),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Markel', policy_number='GL-2024-55300',
                             effective_date=d(-375), expiration_date=d(-10),
                             limits={'each_occurrence': 2_000_000, 'general_aggregate': 4_000_000},
                             additional_insured='yes', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='workers_comp',
                             carrier_name='Markel', policy_number='WC-2024-55301',
                             effective_date=d(-375), expiration_date=d(-10),
                             limits={'el_each_accident': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='yes',
                             confidence=_high(), confirmed=True),
                        dict(coverage_type='umbrella',
                             carrier_name='Markel', policy_number='UM-2024-55302',
                             effective_date=d(-375), expiration_date=d(-10),
                             limits={'each_occurrence': 5_000_000, 'general_aggregate': 5_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 6. Expired — 45 days ago ──────────────────────────────────────────
        {
            'name': 'Greenfield Landscaping',
            'contact_name': 'Yolanda Park',
            'contact_email': 'yolanda@greenfield.test',
            'contact_phone': '',
            'notes': '',
            'profile': low,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'Greenfield Landscaping LLC',
                    'producer_name': 'Erie Insurance',
                    'certificate_date': d(-410),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Erie', policy_number='GL-2024-66400',
                             effective_date=d(-410), expiration_date=d(-45),
                             limits={'each_occurrence': 500_000, 'general_aggregate': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },

        # ── 7. Needs review — extracted, LOW confidence (triggers warning) ────
        {
            'name': 'Sterling Concrete Works',
            'contact_name': 'Ray Johansson',
            'contact_email': 'ray@sterlingconcrete.test',
            'contact_phone': '(312) 555-0707',
            'notes': 'Uploaded by subcontractor via magic link.',
            'profile': std,
            'docs': [
                {
                    'status': 'extracted',
                    'insured_name': 'Sterling Concrete Works',
                    'producer_name': 'AmTrust Financial',
                    'certificate_date': d(-5),
                    'coverages': [
                        # Mix of high and LOW confidence — triggers the amber banner
                        dict(coverage_type='general_liability',
                             carrier_name='AmTrust',
                             policy_number='GL-2025-77500',
                             effective_date=d(-5), expiration_date=d(360),
                             limits={'each_occurrence': 1_000_000, 'general_aggregate': 2_000_000},
                             additional_insured='yes', waiver_of_subrogation='unclear',
                             confidence=_mixed_low(), confirmed=False),
                        dict(coverage_type='workers_comp',
                             carrier_name='AmTrust',
                             policy_number='WC-2025-77501',
                             effective_date=d(-5), expiration_date=d(360),
                             limits={'el_each_accident': 500_000,
                                     'el_disease_policy_limit': 500_000,
                                     'el_disease_each_employee': 500_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_low(), confirmed=False),
                    ],
                },
            ],
        },

        # ── 8. Needs review — extracted, HIGH confidence (clean review) ───────
        {
            'name': 'Ridgeline Painting',
            'contact_name': 'Sandra Okonkwo',
            'contact_email': 'sandra@ridgelinepainting.test',
            'contact_phone': '(847) 555-0808',
            'notes': '',
            'profile': low,
            'docs': [
                {
                    'status': 'extracted',
                    'insured_name': 'Ridgeline Painting Co.',
                    'producer_name': 'Progressive Commercial',
                    'certificate_date': d(-2),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Progressive', policy_number='GL-2025-88600',
                             effective_date=d(-2), expiration_date=d(363),
                             limits={'each_occurrence': 500_000, 'general_aggregate': 1_000_000},
                             additional_insured='yes', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=False),
                        dict(coverage_type='automobile',
                             carrier_name='Progressive', policy_number='CA-2025-88601',
                             effective_date=d(-2), expiration_date=d(363),
                             limits={'combined_single_limit': 500_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=False),
                    ],
                },
            ],
        },

        # ── 9. Processing — just uploaded, waiting for extraction ─────────────
        {
            'name': 'Cascade Glass & Glazing',
            'contact_name': 'Noel Fuentes',
            'contact_email': 'noel@cascadeglass.test',
            'contact_phone': '(773) 555-0909',
            'notes': '',
            'profile': std,
            'docs': [
                {
                    'status': 'processing',
                    'insured_name': None,
                    'producer_name': None,
                    'certificate_date': None,
                    'coverages': [],
                },
            ],
        },

        # ── 10. No COI — vendor exists, no documents uploaded ─────────────────
        {
            'name': 'Hallmark Flooring Inc.',
            'contact_name': 'Ingrid Svensson',
            'contact_email': 'ingrid@hallmarkfloor.test',
            'contact_phone': '(630) 555-1010',
            'notes': 'New vendor onboarded last week. COI request pending.',
            'profile': std,
            'docs': [],
        },

        # ── 11. No COI — vendor with no profile and no documents ──────────────
        {
            'name': 'Vanguard Masonry',
            'contact_name': '',
            'contact_email': '',
            'contact_phone': '',
            'notes': '',
            'profile': None,   # No profile assigned — shows "No profile assigned" warning
            'docs': [],
        },

        # ── 12. Search test — similar names to test the search filter ──────────
        {
            'name': 'Apex Mechanical LLC',
            'contact_name': 'Brianna Torres',
            'contact_email': 'btorres@apexmech.test',
            'contact_phone': '(312) 555-1212',
            'notes': 'Note: Different company from Apex Roofing. Search "Apex" to see both.',
            'profile': low,
            'docs': [
                {
                    'status': 'confirmed',
                    'insured_name': 'Apex Mechanical LLC',
                    'producer_name': 'Nationwide',
                    'certificate_date': d(-60),
                    'coverages': [
                        dict(coverage_type='general_liability',
                             carrier_name='Nationwide', policy_number='GL-2025-99700',
                             effective_date=d(-60), expiration_date=d(305),
                             limits={'each_occurrence': 500_000, 'general_aggregate': 1_000_000},
                             additional_insured='no', waiver_of_subrogation='no',
                             confidence=_high(), confirmed=True),
                    ],
                },
            ],
        },
    ]


# ── Confidence helpers ────────────────────────────────────────────────────────

def _high() -> dict:
    """All fields extracted with high confidence."""
    return {
        'carrier_name': 0.97,
        'policy_number': 0.95,
        'effective_date': 0.98,
        'expiration_date': 0.96,
        'each_occurrence': 0.94,
        'general_aggregate': 0.93,
        'combined_single_limit': 0.95,
        'el_each_accident': 0.92,
        'el_disease_policy_limit': 0.91,
        'el_disease_each_employee': 0.90,
        'additional_insured': 0.88,
        'waiver_of_subrogation': 0.87,
    }


def _low() -> dict:
    """Several fields extracted with LOW confidence — triggers the amber warning banner."""
    return {
        'carrier_name': 0.91,
        'policy_number': 0.45,   # LOW — will show red ring
        'effective_date': 0.88,
        'expiration_date': 0.40,  # LOW — will show red ring
        'el_each_accident': 0.38, # LOW
        'el_disease_policy_limit': 0.35,  # LOW
        'el_disease_each_employee': 0.89,
        'additional_insured': 0.92,
        'waiver_of_subrogation': 0.85,
    }


def _mixed_low() -> dict:
    """Some fields low confidence, some high — realistic partial extraction."""
    return {
        'carrier_name': 0.95,
        'policy_number': 0.92,
        'effective_date': 0.96,
        'expiration_date': 0.89,
        'each_occurrence': 0.52,   # LOW
        'general_aggregate': 0.48, # LOW
        'additional_insured': 0.90,
        'waiver_of_subrogation': 0.41,  # LOW — unclear field
    }


# ── Command ───────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Seed rich test data for all frontend pages (run after create_test_users)'

    def handle(self, *args, **options):
        users = list(User.objects.filter(
            auth0_sub__in=['dev-owner-1', 'dev-owner-2']
        ).select_related('organization'))

        if not users:
            self.stderr.write(self.style.ERROR(
                'No test users found. Run: python manage.py create_test_users'
            ))
            return

        for user in users:
            org = user.organization
            self.stdout.write(f'\nSeeding org: {org.name}')
            self._seed_org(org, user)

        self.stdout.write(self.style.SUCCESS('\nDone. Log in via the dev login picker.'))

    @transaction.atomic
    def _seed_org(self, org, user):
        # ── Wipe existing seed data ───────────────────────────────────────────
        ComplianceCheck.objects.filter(organization=org).delete()
        COIDocument.objects.filter(organization=org).delete()
        Vendor.objects.filter(organization=org).delete()
        # Keep the default profile, delete extras
        RequirementProfile.objects.filter(organization=org).delete()

        # ── Requirement profiles ──────────────────────────────────────────────
        profile_objs = {}
        for spec in PROFILES:
            profile = RequirementProfile.objects.create(
                organization=org,
                name=spec['name'],
            )
            RequirementLine.objects.bulk_create([
                RequirementLine(profile=profile, **line)
                for line in spec['lines']
            ])
            key = spec['name'].split()[0].lower()  # 'standard' | 'high-risk' → 'high' | 'low'
            profile_objs[key] = profile
            self.stdout.write(f'  profile: {profile.name}')

        profile_map = {
            'standard':  profile_objs.get('standard'),
            'high_risk': profile_objs.get('high-risk'),
            'low_risk':  profile_objs.get('low-risk'),
        }

        # ── Vendors + documents ───────────────────────────────────────────────
        specs = vendor_specs(profile_map)
        for vspec in specs:
            vendor = Vendor.objects.create(
                organization=org,
                name=vspec['name'],
                contact_name=vspec.get('contact_name', ''),
                contact_email=vspec.get('contact_email', ''),
                contact_phone=vspec.get('contact_phone', ''),
                notes=vspec.get('notes', ''),
                requirement_profile=vspec.get('profile'),
            )
            self.stdout.write(f'  vendor: {vendor.name}')

            for dspec in vspec.get('docs', []):
                doc = COIDocument.objects.create(
                    organization=org,
                    vendor=vendor,
                    file_key=f'dev/seed/{vendor.id}/{dspec["status"]}.pdf',
                    status=dspec['status'],
                    insured_name=dspec.get('insured_name'),
                    producer_name=dspec.get('producer_name'),
                    certificate_date=dspec.get('certificate_date'),
                    uploaded_by=user,
                )

                for cspec in dspec.get('coverages', []):
                    cspec_copy = dict(cspec)
                    confirmed = cspec_copy.pop('confirmed', False)
                    confidence = cspec_copy.pop('confidence', None)
                    ExtractedCoverage.objects.create(
                        document=doc,
                        confidence=confidence,
                        confirmed=confirmed,
                        confirmed_by=user if confirmed else None,
                        confirmed_at=doc.created_at if confirmed else None,
                        **cspec_copy,
                    )

                # ── Compliance check for confirmed docs ───────────────────────
                if dspec['status'] == 'confirmed' and dspec.get('coverages'):
                    exp_dates = [
                        c['expiration_date'] for c in dspec['coverages']
                        if c.get('expiration_date')
                    ]
                    min_exp = min(exp_dates) if exp_dates else None
                    if min_exp and min_exp < TODAY:
                        cc_status = 'expired'
                    elif vendor.requirement_profile:
                        cc_status = 'matches_requirements'
                    else:
                        cc_status = 'gaps_found'

                    ComplianceCheck.objects.create(
                        organization=org,
                        vendor=vendor,
                        document=doc,
                        status=cc_status,
                        reasons=[] if cc_status == 'matches_requirements'
                                else ['Coverage expired or missing'],
                    )

        counts = {
            'vendors': Vendor.objects.filter(organization=org).count(),
            'docs': COIDocument.objects.filter(organization=org).count(),
            'coverages': ExtractedCoverage.objects.filter(document__organization=org).count(),
            'profiles': RequirementProfile.objects.filter(organization=org).count(),
        }
        self.stdout.write(
            f'  → {counts["vendors"]} vendors, {counts["docs"]} docs, '
            f'{counts["coverages"]} coverages, {counts["profiles"]} profiles'
        )
