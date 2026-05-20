from django.urls import path
from .views import MagicUploadView

urlpatterns = [
    path('magic-upload/<str:token>/', MagicUploadView.as_view()),
]
