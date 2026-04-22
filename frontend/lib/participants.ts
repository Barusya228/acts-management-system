export type ParticipantKind = 'IT_MANAGER' | 'EMPLOYEE' | 'BOTH';

export function getParticipantEmoji(kind: ParticipantKind, stickerEmoji?: string | null) {
  if (stickerEmoji) return stickerEmoji;
  if (kind === 'IT_MANAGER') return '💻';
  if (kind === 'BOTH') return '🧑‍💼';
  return '👤';
}

export function getParticipantKindLabel(kind: ParticipantKind) {
  if (kind === 'IT_MANAGER') return 'IT-менеджер';
  if (kind === 'BOTH') return 'Обе роли';
  return 'Сотрудник / получатель';
}
