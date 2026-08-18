"""Единые state-machine для вторичных статусов.

Значения совпадают со строками, уже сохранёнными в PostgreSQL, поэтому
переход на эти enum не требует миграции данных. Здесь же — таблицы
разрешённых переходов: единственное место, где описано, какие смены
статусов законны.
"""

import enum


class AssignmentStatus(str, enum.Enum):
    """Статус выдачи устройства или мелкой техники по акту."""

    RESERVED = "RESERVED"
    ISSUED = "ISSUED"
    RETURNED = "RETURNED"


ASSIGNMENT_TRANSITIONS: dict[AssignmentStatus, set[AssignmentStatus]] = {
    AssignmentStatus.RESERVED: {AssignmentStatus.ISSUED, AssignmentStatus.RETURNED},
    AssignmentStatus.ISSUED: {AssignmentStatus.RETURNED},
    AssignmentStatus.RETURNED: set(),
}


class IpadDeviceStatus(str, enum.Enum):
    """Статус iPad в реестре устройств."""

    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    ISSUED = "ISSUED"
    RETURN_PENDING = "RETURN_PENDING"
    MAINTENANCE = "MAINTENANCE"
    RETIRED = "RETIRED"


IPAD_DEVICE_TRANSITIONS: dict[IpadDeviceStatus, set[IpadDeviceStatus]] = {
    IpadDeviceStatus.AVAILABLE: {IpadDeviceStatus.RESERVED, IpadDeviceStatus.MAINTENANCE, IpadDeviceStatus.RETIRED},
    IpadDeviceStatus.RESERVED: {IpadDeviceStatus.ISSUED, IpadDeviceStatus.AVAILABLE},
    IpadDeviceStatus.ISSUED: {
        IpadDeviceStatus.AVAILABLE,
        IpadDeviceStatus.RETURN_PENDING,
        IpadDeviceStatus.MAINTENANCE,
        IpadDeviceStatus.RETIRED,
    },
    IpadDeviceStatus.RETURN_PENDING: {IpadDeviceStatus.AVAILABLE, IpadDeviceStatus.MAINTENANCE, IpadDeviceStatus.RETIRED},
    IpadDeviceStatus.MAINTENANCE: {IpadDeviceStatus.AVAILABLE, IpadDeviceStatus.RETIRED},
    IpadDeviceStatus.RETIRED: set(),
}


class IpadAssignmentStatus(str, enum.Enum):
    """Статус закрепления iPad за учеником."""

    RESERVED = "RESERVED"
    ISSUED = "ISSUED"
    RETURN_PENDING = "RETURN_PENDING"
    RETURNED = "RETURNED"


class StudentStatus(str, enum.Enum):
    """Статус ученика в годовом Advisory-акте."""

    ACTIVE = "ACTIVE"
    DEPARTED = "DEPARTED"


class AppendixStatus(str, enum.Enum):
    """Жизненный цикл подписанного приложения к iPad-акту."""

    WAITING_RESPONSIBLE = "WAITING_RESPONSIBLE"
    WAITING_ISSUER = "WAITING_ISSUER"
    APPLIED = "APPLIED"
    CANCELLED = "CANCELLED"


APPENDIX_TRANSITIONS: dict[AppendixStatus, set[AppendixStatus]] = {
    AppendixStatus.WAITING_RESPONSIBLE: {AppendixStatus.WAITING_ISSUER, AppendixStatus.CANCELLED},
    AppendixStatus.WAITING_ISSUER: {AppendixStatus.APPLIED, AppendixStatus.CANCELLED},
    AppendixStatus.APPLIED: set(),
    AppendixStatus.CANCELLED: set(),
}

PENDING_APPENDIX_STATUSES = {AppendixStatus.WAITING_RESPONSIBLE.value, AppendixStatus.WAITING_ISSUER.value}

# Активные (блокирующие устройство) статусы закрепления.
ACTIVE_IPAD_ASSIGNMENT_STATUSES = {
    IpadAssignmentStatus.RESERVED.value,
    IpadAssignmentStatus.ISSUED.value,
    IpadAssignmentStatus.RETURN_PENDING.value,
}
