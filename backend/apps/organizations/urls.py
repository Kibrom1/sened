from django.urls import path
from . import views

urlpatterns = [
    path('me/', views.MeView.as_view(), name='me'),
    path('register/', views.RegisterView.as_view(), name='register'),
    path('organization/settings/', views.OrganizationSettingsView.as_view(), name='org-settings'),
]
