from django.contrib import admin
from django.urls import path, include
from apps.common.dev_views import DevUsersView, DevLoginView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', include('apps.common.urls')),
    path('api/', include('apps.organizations.urls')),
    path('api/', include('apps.vendors.urls')),
    path('api/', include('apps.documents.urls')),
    path('api/', include('apps.compliance.urls')),
    path('api/', include('apps.renewals.urls')),
    path('api/', include('apps.billing.urls')),
    # Dev-only endpoints — return 404 when AUTH0_DOMAIN is configured
    path('api/dev/users/', DevUsersView.as_view()),
    path('api/dev/login/', DevLoginView.as_view()),
]
