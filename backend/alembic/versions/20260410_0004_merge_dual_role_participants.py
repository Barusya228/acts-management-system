"""merge dual role participants

Revision ID: 20260410_0004
Revises: 20260409_0003
Create Date: 2026-04-10 11:00:00
"""

from __future__ import annotations

from collections import defaultdict

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260410_0004"
down_revision = "20260409_0003"
branch_labels = None
depends_on = None


new_participant_kind = postgresql.ENUM("IT_MANAGER", "EMPLOYEE", "BOTH", name="participantkind_new")


def _prefer_text(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _merge_kind(kinds: set[str]) -> str:
    if len(kinds) > 1:
        return "BOTH"
    return next(iter(kinds))


def _merge_rows(rows: list[dict]) -> dict:
    primary = next((row for row in rows if row["kind"] == "IT_MANAGER"), rows[0])
    return {
        "id": primary["id"],
        "full_name": primary["full_name"],
        "email": _prefer_text(*(row["email"] for row in rows)),
        "department": _prefer_text(*(row["department"] for row in rows)),
        "title": _prefer_text(*(row["title"] for row in rows)),
        "sticker_emoji": _prefer_text(*(row["sticker_emoji"] for row in rows)),
        "kind": _merge_kind({row["kind"] for row in rows}),
        "is_active": any(bool(row["is_active"]) for row in rows),
        "created_at": min(row["created_at"] for row in rows),
    }


def _normalize_group_key(full_name: object, email: object) -> tuple[str, str]:
    normalized_name = str(full_name or "").strip().lower()
    normalized_email = str(email or "").strip().lower()
    return (normalized_email or normalized_name, normalized_name)


def upgrade() -> None:
    bind = op.get_bind()

    new_participant_kind.create(bind, checkfirst=False)
    op.execute(
        "ALTER TABLE participants ALTER COLUMN kind TYPE participantkind_new USING kind::text::participantkind_new"
    )
    op.execute("DROP TYPE participantkind")
    op.execute("ALTER TYPE participantkind_new RENAME TO participantkind")

    participants_table = sa.table(
        "participants",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("full_name", sa.String()),
        sa.column("email", sa.String()),
        sa.column("department", sa.String()),
        sa.column("title", sa.String()),
        sa.column("sticker_emoji", sa.String()),
        sa.column("kind", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime()),
    )
    acts_table = sa.table(
        "acts",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("extra_data_json", sa.JSON()),
    )

    rows = [dict(row._mapping) for row in bind.execute(sa.select(participants_table)).fetchall()]
    grouped_rows: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        grouped_rows[_normalize_group_key(row["full_name"], row["email"])].append(row)

    id_map: dict[str, str] = {}
    duplicate_ids: list[object] = []

    for group in grouped_rows.values():
        if len(group) == 1:
            continue

        merged = _merge_rows(group)
        bind.execute(
            participants_table.update()
            .where(participants_table.c.id == merged["id"])
            .values(
                full_name=merged["full_name"],
                email=merged["email"],
                department=merged["department"],
                title=merged["title"],
                sticker_emoji=merged["sticker_emoji"],
                kind=merged["kind"],
                is_active=merged["is_active"],
                created_at=merged["created_at"],
            )
        )

        for row in group:
            if row["id"] == merged["id"]:
                continue
            id_map[str(row["id"])] = str(merged["id"])
            duplicate_ids.append(row["id"])

    if id_map:
        act_rows = bind.execute(sa.select(acts_table.c.id, acts_table.c.extra_data_json)).fetchall()
        for act_row in act_rows:
            extra_data = act_row.extra_data_json or {}
            recipients = extra_data.get("recipients")
            if not isinstance(recipients, list):
                continue

            changed = False
            normalized_recipients = []
            for recipient in recipients:
                if not isinstance(recipient, dict):
                    normalized_recipients.append(recipient)
                    continue

                participant_id = recipient.get("participant_id")
                if participant_id is not None:
                    mapped_id = id_map.get(str(participant_id))
                    if mapped_id:
                        recipient = dict(recipient)
                        recipient["participant_id"] = mapped_id
                        changed = True

                normalized_recipients.append(recipient)

            if changed:
                payload = dict(extra_data)
                payload["recipients"] = normalized_recipients
                bind.execute(
                    acts_table.update().where(acts_table.c.id == act_row.id).values(extra_data_json=payload)
                )

        bind.execute(participants_table.delete().where(participants_table.c.id.in_(duplicate_ids)))


def downgrade() -> None:
    bind = op.get_bind()

    downgraded_participant_kind = postgresql.ENUM("IT_MANAGER", "EMPLOYEE", name="participantkind_old")
    downgraded_participant_kind.create(bind, checkfirst=False)

    bind.execute(sa.text("UPDATE participants SET kind = 'EMPLOYEE' WHERE kind = 'BOTH'"))
    op.execute(
        "ALTER TABLE participants ALTER COLUMN kind TYPE participantkind_old USING kind::text::participantkind_old"
    )
    op.execute("DROP TYPE participantkind")
    op.execute("ALTER TYPE participantkind_old RENAME TO participantkind")
