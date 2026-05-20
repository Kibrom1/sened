"""
Compliance Engine — Phase 2

Pure Python, no database access. Fully unit-testable.

Usage:
    from apps.compliance.engine import run_compliance_check, ProfileLine, CoverageData

    result = run_compliance_check(profile_lines, confirmed_coverages)
    print(result.status)   # 'matches_requirements' | 'gaps_found' | 'expired' | 'needs_review'
    print(result.reasons)  # ['GL each-occurrence $500,000 below required $1,000,000', ...]
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

# ── Coverage type normalisation ───────────────────────────────────────────────
# The extraction prompt emits 'workers_compensation'; requirement lines store
# 'workers_comp'.  Any other aliases can be added here.

_ALIASES: dict[str, str] = {
    'workers_compensation': 'workers_comp',
}


def _normalise(coverage_type: str) -> str:
    return _ALIASES.get(coverage_type, coverage_type)


# ── Human-readable labels ─────────────────────────────────────────────────────

_LABELS: dict[str, str] = {
    'general_liability':     'General Liability',
    'automobile':            'Automobile',
    'workers_comp':          'Workers Compensation',
    'umbrella':              'Umbrella / Excess',
    'professional_liability':'Professional Liability',
    'other':                 'Other',
}


def _label(coverage_type: str) -> str:
    return _LABELS.get(coverage_type, coverage_type.replace('_', ' ').title())


def _fmt(amount: int) -> str:
    return f'${amount:,}'


# ── Limit helpers ─────────────────────────────────────────────────────────────
# Each extracted coverage stores a `limits` dict with various named fields.
# We probe a priority list so the engine works across coverage types:
#   - GL uses 'each_occurrence' / 'general_aggregate'
#   - Auto uses 'combined_single_limit' for the per-occurrence check
#   - Workers comp uses 'el_each_accident' for the per-occurrence check

def _each_occurrence(limits: dict) -> Optional[int]:
    for key in ('each_occurrence', 'combined_single_limit',
                'el_each_accident', 'employers_liability_el'):
        v = limits.get(key)
        if v:
            return int(v)
    return None


def _aggregate(limits: dict) -> Optional[int]:
    for key in ('general_aggregate', 'products_aggregate',
                'el_disease_policy_limit'):
        v = limits.get(key)
        if v:
            return int(v)
    return None


# ── Input / output dataclasses ────────────────────────────────────────────────

@dataclass
class ProfileLine:
    coverage_type: str
    is_required: bool
    min_each_occurrence: Optional[int]
    min_aggregate: Optional[int]
    additional_insured_required: bool
    waiver_required: bool


@dataclass
class CoverageData:
    coverage_type: str          # normalised
    expiration_date: Optional[date]
    limits: dict
    additional_insured: str     # 'yes' | 'no' | 'unclear'
    waiver_of_subrogation: str  # 'yes' | 'no' | 'unclear'


@dataclass
class CheckResult:
    status: str                      # matches_requirements | gaps_found | expired | needs_review
    reasons: list[str] = field(default_factory=list)


# ── Engine ────────────────────────────────────────────────────────────────────

def run_compliance_check(
    profile_lines: list[ProfileLine],
    confirmed_coverages: list[CoverageData],
    today: Optional[date] = None,
) -> CheckResult:
    """
    Compare a list of requirement lines against confirmed coverage data.

    Returns a CheckResult with a status string and a list of human-readable
    reason strings explaining any failures.

    Args:
        profile_lines:       RequirementLine records for the vendor's assigned profile.
        confirmed_coverages: ExtractedCoverage records with confirmed=True for the
                             vendor's latest confirmed document.
        today:               Reference date (defaults to date.today()). Injectable
                             for deterministic unit tests.
    """
    if today is None:
        today = date.today()

    if not profile_lines:
        return CheckResult(status='needs_review', reasons=['No requirement profile lines defined'])

    if not confirmed_coverages:
        return CheckResult(status='needs_review', reasons=['No confirmed coverages on file'])

    # Group confirmed coverages by normalised type; keep best per type
    # (latest expiration wins when there are multiple rows of the same type)
    coverage_map: dict[str, CoverageData] = {}
    for cov in confirmed_coverages:
        norm = _normalise(cov.coverage_type)
        existing = coverage_map.get(norm)
        if existing is None:
            coverage_map[norm] = cov
        else:
            # Prefer coverage with the later expiration date
            mine = cov.expiration_date or date.min
            theirs = existing.expiration_date or date.min
            if mine > theirs:
                coverage_map[norm] = cov

    reasons: list[str] = []
    has_expired = False
    has_gaps = False

    for line in profile_lines:
        if not line.is_required:
            continue

        norm = _normalise(line.coverage_type)
        label = _label(norm)
        cov = coverage_map.get(norm)

        # ── 1. Missing coverage ───────────────────────────────────────────────
        if cov is None:
            reasons.append(f'{label}: no coverage found on COI')
            has_gaps = True
            continue

        # ── 2. Expiration check ───────────────────────────────────────────────
        if cov.expiration_date and cov.expiration_date < today:
            reasons.append(
                f'{label}: expired on {cov.expiration_date.strftime("%b %-d, %Y")}'
            )
            has_expired = True
            # Don't check limits on an expired policy — the expiry is the
            # headline issue; limit gaps would be moot until renewed.
            continue

        # ── 3. Each-occurrence limit ──────────────────────────────────────────
        if line.min_each_occurrence:
            actual = _each_occurrence(cov.limits or {})
            if actual is None or actual < line.min_each_occurrence:
                actual_str = _fmt(actual) if actual else 'not found'
                reasons.append(
                    f'{label}: each-occurrence limit {actual_str} '
                    f'is below required {_fmt(line.min_each_occurrence)}'
                )
                has_gaps = True

        # ── 4. Aggregate limit ────────────────────────────────────────────────
        if line.min_aggregate:
            actual = _aggregate(cov.limits or {})
            if actual is None or actual < line.min_aggregate:
                actual_str = _fmt(actual) if actual else 'not found'
                reasons.append(
                    f'{label}: aggregate limit {actual_str} '
                    f'is below required {_fmt(line.min_aggregate)}'
                )
                has_gaps = True

        # ── 5. Additional insured ─────────────────────────────────────────────
        if line.additional_insured_required and cov.additional_insured != 'yes':
            reasons.append(f'{label}: additional insured endorsement required but not confirmed')
            has_gaps = True

        # ── 6. Waiver of subrogation ──────────────────────────────────────────
        if line.waiver_required and cov.waiver_of_subrogation != 'yes':
            reasons.append(f'{label}: waiver of subrogation required but not confirmed')
            has_gaps = True

    # ── Final status ──────────────────────────────────────────────────────────
    if has_expired:
        status = 'expired'
    elif has_gaps:
        status = 'gaps_found'
    else:
        status = 'matches_requirements'

    return CheckResult(status=status, reasons=reasons)
