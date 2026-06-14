from django.db.models import Subquery, OuterRef
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.documents.models import ExtractedCoverage
from apps.vendors.models import Vendor
from .models import ComplianceCheck


class VendorComplianceView(APIView):
    """
    GET /api/compliance/vendor/<vendor_id>/
    Returns the latest ComplianceCheck for a single vendor.
    Used by VendorDetail to show a compliance badge + reasons.

    Response:
      { status, reasons, checked_at }          — when a check exists
      { status: 'no_data', reasons: [], checked_at: null }  — no check yet
    """

    def get(self, request, vendor_id):
        try:
            vendor = Vendor.objects.for_org(request.org_id).get(id=vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=404)

        check = (
            ComplianceCheck.objects
            .filter(vendor=vendor, organization_id=request.org_id)
            .order_by('-checked_at')
            .first()
        )

        if not check:
            return Response({'status': 'no_data', 'reasons': [], 'checked_at': None})

        return Response({
            'status': check.status,
            'reasons': check.reasons or [],
            'checked_at': check.checked_at.isoformat(),
        })


class DashboardView(APIView):
    """
    GET /api/dashboard/
    Returns all active vendors bucketed by their latest compliance status.
    One query via correlated subquery — no N+1.

    Response shape matches frontend DashboardBuckets type:
    {
      "matches_requirements": [ { vendor_id, vendor_name, status, reasons, next_expiration }, ... ],
      "gaps_found":           [ ... ],
      "expired":              [ ... ],
      "needs_review":         [ ... ],
    }
    """

    def get(self, request):
        # Latest check status per vendor (correlated subquery — single DB round-trip)
        latest_status = (
            ComplianceCheck.objects
            .filter(vendor=OuterRef('pk'), organization_id=request.org_id)
            .order_by('-checked_at')
            .values('status')[:1]
        )
        latest_reasons = (
            ComplianceCheck.objects
            .filter(vendor=OuterRef('pk'), organization_id=request.org_id)
            .order_by('-checked_at')
            .values('reasons')[:1]
        )
        latest_checked_at = (
            ComplianceCheck.objects
            .filter(vendor=OuterRef('pk'), organization_id=request.org_id)
            .order_by('-checked_at')
            .values('checked_at')[:1]
        )

        # Earliest upcoming expiration per vendor (from confirmed coverages)
        from django.utils import timezone
        today = timezone.now().date()
        next_exp = (
            ExtractedCoverage.objects
            .filter(
                document__vendor=OuterRef('pk'),
                document__organization_id=request.org_id,
                document__status='confirmed',
                expiration_date__isnull=False,
                expiration_date__gte=today,
            )
            .order_by('expiration_date')
            .values('expiration_date')[:1]
        )

        vendors = (
            Vendor.objects
            .for_org(request.org_id)
            .filter(status='active')
            .annotate(
                latest_status=Subquery(latest_status),
                latest_reasons=Subquery(latest_reasons),
                latest_checked_at=Subquery(latest_checked_at),
                next_expiration=Subquery(next_exp),
            )
        )

        buckets: dict = {
            'matches_requirements': [],
            'gaps_found': [],
            'expired': [],
            'needs_review': [],
        }

        for v in vendors:
            status = v.latest_status or 'needs_review'
            buckets[status].append({
                'vendor_id': str(v.id),
                'vendor_name': v.name,
                'status': status,
                'reasons': v.latest_reasons or [],
                'checked_at': v.latest_checked_at.isoformat() if v.latest_checked_at else None,
                'next_expiration': str(v.next_expiration) if v.next_expiration else None,
            })

        return Response(buckets)


class ExpirationsView(APIView):
    """
    GET /api/dashboard/expirations/
    Returns all confirmed coverage rows for the org, ordered by expiration_date ASC.
    Used by the Validation MVP expiration list on the dashboard.
    """

    def get(self, request):
        coverages = (
            ExtractedCoverage.objects
            .filter(
                document__organization_id=request.org_id,
                document__status='confirmed',
                expiration_date__isnull=False,
            )
            .select_related('document__vendor')
            .order_by('expiration_date')
        )

        data = [
            {
                'id': str(cov.id),
                'vendor_id': str(cov.document.vendor_id),
                'vendor_name': cov.document.vendor.name,
                'document_id': str(cov.document_id),
                'coverage_type': cov.coverage_type,
                'carrier_name': cov.carrier_name,
                'policy_number': cov.policy_number,
                'effective_date': str(cov.effective_date) if cov.effective_date else None,
                'expiration_date': str(cov.expiration_date),
                'additional_insured': cov.additional_insured,
                'waiver_of_subrogation': cov.waiver_of_subrogation,
            }
            for cov in coverages
        ]

        return Response(data)
