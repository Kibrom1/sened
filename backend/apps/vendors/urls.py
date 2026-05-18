from django.urls import path
from . import views

urlpatterns = [
    path('vendors/', views.VendorListView.as_view(), name='vendor-list'),
    path('vendors/import/', views.VendorImportView.as_view(), name='vendor-import'),
    path('vendors/<uuid:vendor_id>/', views.VendorDetailView.as_view(), name='vendor-detail'),
    path('requirement-profiles/', views.RequirementProfileListView.as_view(), name='profile-list'),
    path('requirement-profiles/<uuid:profile_id>/', views.RequirementProfileDetailView.as_view(), name='profile-detail'),
]
