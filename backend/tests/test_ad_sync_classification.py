from app.services.ad_sync_service import _detect_department, _is_departed_dn


def test_detects_exact_disabled_users_path():
    dn = "CN=Ivan Ivanov,OU=Disabled Users,OU=Users,OU=Corporate,DC=example,DC=local"

    assert _is_departed_dn(dn) is True


def test_does_not_treat_unrelated_disabled_users_ou_as_departed():
    dn = "CN=Ivan Ivanov,OU=Disabled Users,OU=Archive,DC=example,DC=local"

    assert _is_departed_dn(dn) is False


def test_detects_active_participant_departments():
    assert _detect_department("CN=Ivan,OU=IT Department,DC=example,DC=local") == "IT"
    assert _detect_department("CN=Anna,OU=Staff,DC=example,DC=local") == "Сотрудники"
