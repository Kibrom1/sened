import csv
import io
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Vendor, RequirementProfile, RequirementLine
from .serializers import VendorSerializer, RequirementProfileSerializer


class VendorListView(APIView):
    def get(self, request):
        vendors = Vendor.objects.for_org(request.org_id).filter(status='active').select_related('requirement_profile')
        serializer = VendorSerializer(vendors, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = VendorSerializer(data=request.data)
        if serializer.is_valid():
            # Validate requirement_profile belongs to this org
            profile_id = request.data.get('requirement_profile')
            if profile_id:
                if not RequirementProfile.objects.for_org(request.org_id).filter(id=profile_id).exists():
                    return Response({'error': 'Invalid requirement profile'}, status=400)
            serializer.save(organization_id=request.org_id)
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class VendorDetailView(APIView):
    def _get_vendor(self, request, vendor_id):
        return Vendor.objects.for_org(request.org_id).get(id=vendor_id)

    def get(self, request, vendor_id):
        try:
            vendor = self._get_vendor(request, vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(VendorSerializer(vendor).data)

    def patch(self, request, vendor_id):
        try:
            vendor = self._get_vendor(request, vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        serializer = VendorSerializer(vendor, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Re-run compliance if the requirement profile changed
            if 'requirement_profile' in request.data:
                from apps.compliance.tasks import run_compliance_check_for_vendor
                run_compliance_check_for_vendor.delay(vendor_id)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, vendor_id):
        try:
            vendor = self._get_vendor(request, vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        vendor.status = 'inactive'
        vendor.save(update_fields=['status'])
        return Response(status=204)


class VendorImportView(APIView):
    """Bulk import vendors from a CSV file."""

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        content = file.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(content))

        required_columns = {'name', 'contact_email'}
        if not required_columns.issubset(set(reader.fieldnames or [])):
            return Response({
                'error': f'CSV must include columns: {", ".join(required_columns)}'
            }, status=400)

        created, skipped, errors = 0, 0, []
        with transaction.atomic():
            for i, row in enumerate(reader, start=2):
                name = row.get('name', '').strip()
                email = row.get('contact_email', '').strip()
                if not name:
                    errors.append({'row': i, 'error': 'Name is required'})
                    continue
                if Vendor.objects.for_org(request.org_id).filter(contact_email=email, status='active').exists():
                    skipped += 1
                    continue
                Vendor.objects.create(
                    organization_id=request.org_id,
                    name=name,
                    contact_name=row.get('contact_name', '').strip() or None,
                    contact_email=email or None,
                    contact_phone=row.get('contact_phone', '').strip() or None,
                    notes=row.get('notes', '').strip() or None,
                )
                created += 1

        return Response({'created': created, 'skipped': skipped, 'errors': errors})


class RequirementProfileListView(APIView):
    def get(self, request):
        profiles = RequirementProfile.objects.for_org(request.org_id).prefetch_related('lines')
        return Response(RequirementProfileSerializer(profiles, many=True).data)

    def post(self, request):
        serializer = RequirementProfileSerializer(data=request.data)
        if serializer.is_valid():
            profile = serializer.save(organization_id=request.org_id)
            lines_data = request.data.get('lines', [])
            for line in lines_data:
                RequirementLine.objects.create(profile=profile, **{
                    k: v for k, v in line.items()
                    if k in ['coverage_type', 'is_required', 'min_each_occurrence',
                             'min_aggregate', 'additional_insured_required', 'waiver_required']
                })
            return Response(RequirementProfileSerializer(profile).data, status=201)
        return Response(serializer.errors, status=400)


class RequirementProfileDetailView(APIView):
    def _get_profile(self, request, profile_id):
        return RequirementProfile.objects.for_org(request.org_id).prefetch_related('lines').get(id=profile_id)

    def get(self, request, profile_id):
        try:
            profile = self._get_profile(request, profile_id)
        except RequirementProfile.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(RequirementProfileSerializer(profile).data)

    def patch(self, request, profile_id):
        try:
            profile = self._get_profile(request, profile_id)
        except RequirementProfile.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        # Update name via serializer (lines field is read_only, safely ignored here)
        serializer = RequirementProfileSerializer(profile, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        serializer.save()

        # If lines are provided, replace them atomically
        if 'lines' in request.data:
            allowed = ['coverage_type', 'is_required', 'min_each_occurrence',
                       'min_aggregate', 'additional_insured_required', 'waiver_required']
            with transaction.atomic():
                profile.lines.all().delete()
                for line_data in request.data['lines']:
                    RequirementLine.objects.create(
                        profile=profile,
                        **{k: v for k, v in line_data.items() if k in allowed}
                    )

        updated = RequirementProfile.objects.prefetch_related('lines').get(id=profile.id)
        return Response(RequirementProfileSerializer(updated).data)

    def delete(self, request, profile_id):
        try:
            profile = RequirementProfile.objects.for_org(request.org_id).get(id=profile_id)
        except RequirementProfile.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        profile.delete()
        return Response(status=204)
