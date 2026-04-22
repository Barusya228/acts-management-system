export interface ActRecipient {
  participant_id?: string;
  full_name: string;
  email: string;
  signed_at?: string | null;
  return_signed_at?: string | null;
}

interface EditableRecipientInput {
  participant_id?: string;
  full_name?: string;
  email?: string;
}

export function normalizeActRecipients(
  extraData: Record<string, unknown> | undefined,
  fallbackName: string,
  fallbackEmail?: string | null
): ActRecipient[] {
  const rawRecipients = Array.isArray(extraData?.recipients) ? extraData.recipients : [];
  const recipients = rawRecipients
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      participant_id: typeof item.participant_id === 'string' ? item.participant_id : undefined,
      full_name: String(item.full_name || '').trim(),
      email: typeof item.email === 'string' ? item.email : '',
      signed_at: typeof item.signed_at === 'string' ? item.signed_at : null,
      return_signed_at: typeof item.return_signed_at === 'string' ? item.return_signed_at : null,
    }))
    .filter((recipient) => recipient.full_name);

  if (recipients.length > 0) return recipients;

  return [
    {
      full_name: fallbackName,
      email: fallbackEmail || '',
    },
  ].filter((recipient) => recipient.full_name);
}

export function getSignedRecipientsCount(recipients: ActRecipient[]) {
  return recipients.filter((recipient) => Boolean(recipient.signed_at)).length;
}

export function buildParty2Summary(recipients: EditableRecipientInput[]) {
  return recipients
    .map((recipient) => recipient.full_name?.trim())
    .filter(Boolean)
    .join(', ');
}

export function getPrimaryRecipientEmail(recipients: EditableRecipientInput[]) {
  return recipients.find((recipient) => recipient.email?.trim())?.email?.trim() || '';
}
