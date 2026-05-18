from .models import RequirementProfile, RequirementLine


def create_default_requirement_profile(organization):
    """Create a sensible default requirement profile for a new organization."""
    profile = RequirementProfile.objects.create(
        organization=organization,
        name='Standard (review and adjust to match your contracts)',
    )
    RequirementLine.objects.bulk_create([
        RequirementLine(
            profile=profile,
            coverage_type='general_liability',
            is_required=True,
            min_each_occurrence=1_000_000,
            min_aggregate=2_000_000,
            additional_insured_required=False,
            waiver_required=False,
        ),
        RequirementLine(
            profile=profile,
            coverage_type='automobile',
            is_required=True,
            min_each_occurrence=1_000_000,
        ),
        RequirementLine(
            profile=profile,
            coverage_type='workers_comp',
            is_required=True,
        ),
    ])
    return profile
