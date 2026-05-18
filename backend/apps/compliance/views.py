from rest_framework.views import APIView
from rest_framework.response import Response
from apps.documents.models import ExtractedCoverage


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
