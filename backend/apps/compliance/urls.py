from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.DashboardView.as_view()),
    path('dashboard/expirations/', views.ExpirationsView.as_view()),
    path('compliance/vendor/<uuid:vendor_id>/', views.VendorComplianceView.as_view()),
]
