from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', include('apps.common.urls')),
    path('api/', include('apps.organizations.urls')),
    path('api/', include('apps.vendors.urls')),
    path('api/', include('apps.documents.urls')),
    path('api/', include('apps.compliance.urls')),
    path('api/', include('apps.renewals.urls')),
    path('api/', include('apps.billing.urls')),
]
