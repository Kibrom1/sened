from django.urls import path
from .views import MagicUploadView, ManualRenewalView

urlpatterns = [
    path('magic-upload/<str:token>/', MagicUploadView.as_view()),
    path('renewals/send/<uuid:vendor_id>/', ManualRenewalView.as_view()),
]
