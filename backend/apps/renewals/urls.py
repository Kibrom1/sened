from django.urls import path
from .views import (
    ActivityListView,
    MagicUploadView,
    ManualRenewalView,
    RenewalListView,
)

urlpatterns = [
    path('magic-upload/<str:token>/', MagicUploadView.as_view()),
    path('renewals/', RenewalListView.as_view()),
    path('renewals/send/<uuid:vendor_id>/', ManualRenewalView.as_view()),
    path('activity/', ActivityListView.as_view()),
]
