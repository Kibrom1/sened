"""
Unit tests for the pure compliance engine (no DB, no I/O).

Covers: status bucketing, missing coverage, expiration precedence,
each-occurrence and aggregate limits (including the cross-coverage-type
limit-key probing), additional insured / waiver endorsements, coverage-type
alias normalisation, best-coverage-per-type dedup, and empty inputs.
"""
from datetime import date

from apps.compliance.engine import (
    CoverageData,
    ProfileLine,
    run_compliance_check,
)

TODAY = date(2026, 6, 10)
FUTURE = date(2027, 1, 1)
PAST = date(2026, 1, 1)


def gl_line(min_occ=1_000_000, min_agg=2_000_000, ai=False, waiver=False, required=True):
    return ProfileLine(
        coverage_type='general_liability',
        is_required=required,
        min_each_occurrence=min_occ,
        min_aggregate=min_agg,
        additional_insured_required=ai,
        waiver_required=waiver,
    )


def gl_coverage(occ=1_000_000, agg=2_000_000, expires=FUTURE, ai='yes', waiver='yes'):
    return CoverageData(
        coverage_type='general_liability',
        expiration_date=expires,
        limits={'each_occurrence': occ, 'general_aggregate': agg},
        additional_insured=ai,
        waiver_of_subrogation=waiver,
    )


# ── Status bucketing ──────────────────────────────────────────────────────────

class TestStatuses:
    def test_fully_compliant(self):
        result = run_compliance_check([gl_line()], [gl_coverage()], today=TODAY)
        assert result.status == 'matches_requirements'
        assert result.reasons == []

    def test_no_profile_lines_needs_review(self):
        result = run_compliance_check([], [gl_coverage()], today=TODAY)
        assert result.status == 'needs_review'
        assert result.reasons == ['No requirement profile lines defined']

    def test_no_coverages_needs_review(self):
        result = run_compliance_check([gl_line()], [], today=TODAY)
        assert result.status == 'needs_review'
        assert result.reasons == ['No confirmed coverages on file']

    def test_missing_coverage_is_gap(self):
        line = ProfileLine('automobile', True, 1_000_000, None, False, False)
        result = run_compliance_check([line], [gl_coverage()], today=TODAY)
        assert result.status == 'gaps_found'
        assert result.reasons == ['Automobile: no coverage found on COI']

    def test_expired_beats_gaps(self):
        """Expired + gaps on other lines → overall status 'expired'."""
        lines = [gl_line(), ProfileLine('automobile', True, 1_000_000, None, False, False)]
        result = run_compliance_check(lines, [gl_coverage(expires=PAST)], today=TODAY)
        assert result.status == 'expired'
        # Both the expiry and the missing auto coverage are reported
        assert len(result.reasons) == 2

    def test_optional_line_ignored(self):
        line = ProfileLine('umbrella', False, 5_000_000, None, False, False)
        result = run_compliance_check([gl_line(), line], [gl_coverage()], today=TODAY)
        assert result.status == 'matches_requirements'


# ── Expiration ────────────────────────────────────────────────────────────────

class TestExpiration:
    def test_expired_policy(self):
        result = run_compliance_check([gl_line()], [gl_coverage(expires=PAST)], today=TODAY)
        assert result.status == 'expired'
        assert 'expired on' in result.reasons[0]

    def test_expired_skips_limit_checks(self):
        """Limit gaps on an expired policy are moot — only expiry is reported."""
        result = run_compliance_check(
            [gl_line()], [gl_coverage(occ=1, agg=1, expires=PAST)], today=TODAY
        )
        assert len(result.reasons) == 1
        assert 'expired' in result.reasons[0]

    def test_expires_today_is_not_expired(self):
        result = run_compliance_check([gl_line()], [gl_coverage(expires=TODAY)], today=TODAY)
        assert result.status == 'matches_requirements'

    def test_no_expiration_date_passes_expiry_check(self):
        result = run_compliance_check([gl_line()], [gl_coverage(expires=None)], today=TODAY)
        assert result.status == 'matches_requirements'


# ── Limits ────────────────────────────────────────────────────────────────────

class TestLimits:
    def test_each_occurrence_below_minimum(self):
        result = run_compliance_check([gl_line()], [gl_coverage(occ=500_000)], today=TODAY)
        assert result.status == 'gaps_found'
        assert '$500,000' in result.reasons[0] and '$1,000,000' in result.reasons[0]

    def test_aggregate_below_minimum(self):
        result = run_compliance_check([gl_line()], [gl_coverage(agg=1_000_000)], today=TODAY)
        assert result.status == 'gaps_found'
        assert 'aggregate' in result.reasons[0]

    def test_missing_limits_reported_as_not_found(self):
        cov = CoverageData('general_liability', FUTURE, {}, 'yes', 'yes')
        result = run_compliance_check([gl_line()], [cov], today=TODAY)
        assert result.status == 'gaps_found'
        assert any('not found' in r for r in result.reasons)

    def test_auto_combined_single_limit_satisfies_each_occurrence(self):
        line = ProfileLine('automobile', True, 1_000_000, None, False, False)
        cov = CoverageData('automobile', FUTURE, {'combined_single_limit': 1_000_000},
                           'unclear', 'unclear')
        result = run_compliance_check([line], [cov], today=TODAY)
        assert result.status == 'matches_requirements'

    def test_workers_comp_el_each_accident_probed(self):
        line = ProfileLine('workers_comp', True, 1_000_000, None, False, False)
        cov = CoverageData('workers_compensation', FUTURE, {'el_each_accident': 1_000_000},
                           'unclear', 'unclear')
        result = run_compliance_check([line], [cov], today=TODAY)
        assert result.status == 'matches_requirements'

    def test_no_minimums_means_presence_is_enough(self):
        line = ProfileLine('workers_comp', True, None, None, False, False)
        cov = CoverageData('workers_compensation', FUTURE, {}, 'unclear', 'unclear')
        result = run_compliance_check([line], [cov], today=TODAY)
        assert result.status == 'matches_requirements'


# ── Endorsements ──────────────────────────────────────────────────────────────

class TestEndorsements:
    def test_additional_insured_required_but_no(self):
        result = run_compliance_check([gl_line(ai=True)], [gl_coverage(ai='no')], today=TODAY)
        assert result.status == 'gaps_found'
        assert 'additional insured' in result.reasons[0]

    def test_additional_insured_unclear_fails(self):
        result = run_compliance_check([gl_line(ai=True)], [gl_coverage(ai='unclear')], today=TODAY)
        assert result.status == 'gaps_found'

    def test_waiver_required_but_no(self):
        result = run_compliance_check([gl_line(waiver=True)], [gl_coverage(waiver='no')], today=TODAY)
        assert result.status == 'gaps_found'
        assert 'waiver of subrogation' in result.reasons[0]

    def test_endorsements_satisfied(self):
        result = run_compliance_check(
            [gl_line(ai=True, waiver=True)], [gl_coverage(ai='yes', waiver='yes')], today=TODAY
        )
        assert result.status == 'matches_requirements'


# ── Normalisation & dedup ─────────────────────────────────────────────────────

class TestNormalisation:
    def test_workers_compensation_alias(self):
        """Extraction emits 'workers_compensation'; requirement lines use 'workers_comp'."""
        line = ProfileLine('workers_comp', True, None, None, False, False)
        cov = CoverageData('workers_compensation', FUTURE, {}, 'unclear', 'unclear')
        result = run_compliance_check([line], [cov], today=TODAY)
        assert result.status == 'matches_requirements'

    def test_duplicate_coverage_keeps_later_expiration(self):
        """Two GL rows: the expired one must lose to the renewed one."""
        old = gl_coverage(expires=PAST)
        new = gl_coverage(expires=FUTURE)
        result = run_compliance_check([gl_line()], [old, new], today=TODAY)
        assert result.status == 'matches_requirements'

    def test_duplicate_coverage_order_independent(self):
        old = gl_coverage(expires=PAST)
        new = gl_coverage(expires=FUTURE)
        result = run_compliance_check([gl_line()], [new, old], today=TODAY)
        assert result.status == 'matches_requirements'
