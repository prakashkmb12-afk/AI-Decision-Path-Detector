import pytest
from app.core.pii_redactor import pii_redactor


def test_redact_pan_card():
    text = "User PAN is ABCDE1234F for verification."
    redacted, count = pii_redactor.redact_text(text)
    assert "[PAN_REDACTED]" in redacted
    assert "ABCDE1234F" not in redacted
    assert count > 0


def test_redact_aadhaar_card():
    text = "Aadhaar number is 9999-8888-7777."
    redacted, count = pii_redactor.redact_text(text)
    assert "[AADHAAR_REDACTED]" in redacted
    assert "9999-8888-7777" not in redacted
    assert count > 0


def test_redact_email_and_phone():
    text = "Contact Ramesh at ramesh@example.com or +91 9876543210."
    redacted, count = pii_redactor.redact_text(text)
    assert "[EMAIL_REDACTED]" in redacted
    assert "[PHONE_REDACTED]" in redacted
    assert "ramesh@example.com" not in redacted
    assert "9876543210" not in redacted


def test_redact_json_dictionary():
    payload = {
        "user_info": {
            "email": "test@domain.com",
            "pan": "XYZAB9876Q",
            "phone": "9876543210"
        },
        "score": 750
    }
    redacted_json, count = pii_redactor.redact_json(payload)
    assert redacted_json["user_info"]["email"] == "[EMAIL_REDACTED]"
    assert redacted_json["user_info"]["pan"] == "[SENSITIVE_FIELD_REDACTED]"
    assert count > 0
