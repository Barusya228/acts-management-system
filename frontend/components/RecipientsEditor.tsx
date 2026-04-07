'use client';

import ParticipantPicker from '@/components/ParticipantPicker';

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE';
}

export interface EditableRecipient {
  participant_id?: string;
  full_name: string;
  email: string;
}

interface RecipientsEditorProps {
  recipients: EditableRecipient[];
  employees: ParticipantOption[];
  onChange: (recipients: EditableRecipient[]) => void;
  maxRecipients?: number | null;
}

export default function RecipientsEditor({ recipients, employees, onChange, maxRecipients }: RecipientsEditorProps) {
  const updateRecipient = (index: number, patch: Partial<EditableRecipient>) => {
    onChange(recipients.map((recipient, currentIndex) => (currentIndex === index ? { ...recipient, ...patch } : recipient)));
  };

  const addRecipient = () => {
    onChange([...recipients, { full_name: '', email: '' }]);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length === 1) return;
    onChange(recipients.filter((_, currentIndex) => currentIndex !== index));
  };

  const isSingleRecipientMode = maxRecipients === 1;
  const canAddMore = !maxRecipients || recipients.length < maxRecipients;

  if (isSingleRecipientMode && recipients.length > 0) {
    const recipient = recipients[0];
    const selectedEmployee = recipient.participant_id
      ? employees.find((participant) => participant.id === recipient.participant_id)
      : employees.find((participant) => participant.full_name === recipient.full_name && participant.email === recipient.email);

    return (
      <div className="mb-4">
        <ParticipantPicker
          label="Сторона 2 (Получающая)"
          placeholder="Найдите сотрудника по имени, отделу или email"
          value={recipient.participant_id || ''}
          options={employees}
          onSelect={(participant) => {
            updateRecipient(0, {
              participant_id: participant.id,
              full_name: participant.full_name,
              email: participant.email || '',
            });
          }}
          helperText="Выбранный сотрудник будет подставлен как сторона 2 во все данные акта."
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Сторона 2 (Получатели)</h2>
          <p className="text-xs text-gray-500">
            Можно добавить нескольких сотрудников. Подписание выдачи пройдет по каждому получателю отдельно.
          </p>
        </div>
        <button
          type="button"
          onClick={addRecipient}
          disabled={!canAddMore}
          className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          + Добавить
        </button>
      </div>

      <div className="space-y-4">
        {recipients.map((recipient, index) => {
          const selectedEmployee = recipient.participant_id
            ? employees.find((participant) => participant.id === recipient.participant_id)
            : employees.find((participant) => participant.full_name === recipient.full_name && participant.email === recipient.email);

          return (
            <div key={`${recipient.participant_id || recipient.full_name || 'recipient'}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Получатель {index + 1}</p>
                  <p className="text-xs text-gray-500">ФИО и email будут использованы для шага подписи и PDF.</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeRecipient(index)}
                  disabled={recipients.length === 1}
                  className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Удалить
                </button>
              </div>

              <div className="mb-3">
                <ParticipantPicker
                  label="Выбор сотрудника"
                  placeholder="Найдите сотрудника по имени, отделу или email"
                  value={recipient.participant_id || ''}
                  options={employees}
                  onSelect={(participant) => {
                    updateRecipient(index, {
                      participant_id: participant.id,
                      full_name: participant.full_name,
                      email: participant.email || '',
                    });
                  }}
                  helperText="Если email есть в справочнике, он заполнится автоматически. Иначе его можно указать вручную ниже."
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">ФИО получателя *</label>
                  <input
                    type="text"
                    value={recipient.full_name}
                    onChange={(e) => updateRecipient(index, { full_name: e.target.value, participant_id: selectedEmployee?.full_name === e.target.value ? recipient.participant_id : undefined })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="ФИО"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email получателя *</label>
                  <input
                    type="email"
                    value={recipient.email}
                    onChange={(e) => updateRecipient(index, { email: e.target.value })}
                    readOnly={Boolean(selectedEmployee?.email)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-100 read-only:text-gray-600"
                    required
                    placeholder={selectedEmployee?.email ? 'Email подставлен автоматически' : 'example@domain.com'}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
