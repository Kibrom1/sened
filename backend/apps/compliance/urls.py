from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.DashboardView.as_view()),
    path('dashboard/expirations/', views.ExpirationsView.as_view()),
]
