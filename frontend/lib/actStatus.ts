/**
 * Единый словарь статусов акта. Краткие подписи — для списков и бейджей,
 * подробные описания живут на страницах деталей рядом с контекстом шага.
 */
export const ACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  SIGNED_PARTY1: 'На подписи',
  SIGNED_PARTY2: 'На подписи',
  COMPLETED: 'Завершено',
  RETURN_INITIATED: 'Возврат начат',
  RETURN_SIGNED_PARTY1: 'Возврат: подписал IT',
  RETURN_SIGNED_PARTY2: 'Возврат: подписал получатель',
  RETURNED: 'Возвращено',
};

export const getActStatusLabel = (status: string): string =>
  ACT_STATUS_LABELS[status] || status;

const PENDING_STATUSES = new Set(['DRAFT', 'SIGNED_PARTY1', 'SIGNED_PARTY2']);

export const isPendingStatus = (status: string): boolean => PENDING_STATUSES.has(status);

export const isReturnStatus = (status: string): boolean =>
  status.startsWith('RETURN') || status === 'RETURNED';
