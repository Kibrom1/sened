from django.urls import path
from .views import (
    COIDocumentListView,
    COIDocumentDetailView,
    COIDocumentConfirmView,
    COIDocumentBatchConfirmView,
    COIDocumentRetryView,
)

urlpatterns = [
    path('documents/', COIDocumentListView.as_view()),
    path('documents/confirm-batch/', COIDocumentBatchConfirmView.as_view()),
    path('documents/<uuid:doc_id>/', COIDocumentDetailView.as_view()),
    path('documents/<uuid:doc_id>/confirm/', COIDocumentConfirmView.as_view()),
    path('documents/<uuid:doc_id>/retry/', COIDocumentRetryView.as_view()),
]
