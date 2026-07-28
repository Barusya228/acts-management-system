from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.acts import _get_selectable_participant
from app.db.models import ParticipantEmploymentStatus, ParticipantKind


class FakeQuery:
    def __init__(self, participant):
        self.participant = participant

    def filter(self, *_args):
        return self

    def first(self):
        return self.participant


class FakeDb:
    def __init__(self, participant):
        self.participant = participant

    def query(self, _model):
        return FakeQuery(self.participant)


def make_participant(**overrides):
    values = {
        "id": uuid4(),
        "full_name": "Test User",
        "kind": ParticipantKind.EMPLOYEE,
        "employment_status": ParticipantEmploymentStatus.ACTIVE,
        "is_active": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_departed_participant_cannot_be_used_for_new_act():
    participant = make_participant(employment_status=ParticipantEmploymentStatus.DEPARTED)

    with pytest.raises(HTTPException) as exc_info:
        _get_selectable_participant(
            FakeDb(participant),
            participant.id,
            {ParticipantKind.EMPLOYEE, ParticipantKind.BOTH},
            "получателя",
        )

    assert exc_info.value.status_code == 409
    assert "выбыл" in str(exc_info.value.detail)


def test_active_participant_with_matching_role_is_selectable():
    participant = make_participant()

    selected = _get_selectable_participant(
        FakeDb(participant),
        participant.id,
        {ParticipantKind.EMPLOYEE, ParticipantKind.BOTH},
        "получателя",
    )

    assert selected is participant
