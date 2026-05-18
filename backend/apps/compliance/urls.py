from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/expirations/', views.ExpirationsView.as_view()),
]
