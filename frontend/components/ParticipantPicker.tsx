'use client';

import { useMemo, useState } from 'react';
import { getParticipantEmoji, type ParticipantKind } from '@/lib/participants';

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: ParticipantKind;
}

interface ParticipantPickerProps {
  label: string;
  placeholder: string;
  value: string;
  onSelect: (participant: ParticipantOption) => void;
  options: ParticipantOption[];
  helperText?: string;
}

export default function ParticipantPicker({
  label,
  placeholder,
  value,
  onSelect,
  options,
  helperText,
}: ParticipantPickerProps) {
  const [query, setQuery] = useState('');

  const selectedOption = options.find((option) => option.id === value) || null;

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options.slice(0, 8);

    return options
      .filter((option) => {
        const haystack = [option.full_name, option.email || '', option.department || '', option.title || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 12);
  }, [options, query]);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder={placeholder}
        />

        {selectedOption && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Выбрано: <span className="mr-1">{getParticipantEmoji(selectedOption.kind, selectedOption.sticker_emoji)}</span>
            <span className="font-medium">{selectedOption.full_name}</span>
            {selectedOption.title ? ` • ${selectedOption.title}` : ''}
            {selectedOption.department ? ` • ${selectedOption.department}` : ''}
          </div>
        )}

        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {filteredOptions.length === 0 ? (
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">Ничего не найдено</div>
          ) : (
            filteredOptions.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    <span className="mr-2">{getParticipantEmoji(option.kind, option.sticker_emoji)}</span>
                    {option.full_name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {[option.title, option.department, option.email].filter(Boolean).join(' • ') || 'Без дополнительных данных'}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {helperText && <p className="mt-3 text-xs text-gray-500">{helperText}</p>}
      </div>
    </div>
  );
}
