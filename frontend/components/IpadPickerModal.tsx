'use client';

import { useMemo, useState } from 'react';

export interface PickerIpad {
  id: string;
  device_name: string;
  model?: string | null;
  tag: string;
  serial_number: string;
}

interface IpadPickerModalProps {
  ipads: PickerIpad[];
  excludeIds?: string[];
  onSelect: (ipad: PickerIpad) => void;
  onClose: () => void;
}

export function ipadLabel(ipad: PickerIpad): string {
  return `${ipad.model || ipad.device_name} · Tag ${ipad.tag} · ${ipad.serial_number}`;
}

export default function IpadPickerModal({ ipads, excludeIds = [], onSelect, onClose }: IpadPickerModalProps) {
  const [search, setSearch] = useState('');
  const [expandedGroup, setExpandedGroup] = useState('');

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = ipads.filter(ipad => {
      if (excludeIds.includes(ipad.id)) return false;
      if (!query) return true;
      return [ipad.tag, ipad.serial_number, ipad.model || '', ipad.device_name]
        .some(value => value.toLowerCase().includes(query));
    });
    const map = new Map<string, { key: string; title: string; devices: PickerIpad[] }>();
    for (const ipad of visible) {
      const title = ipad.model || ipad.device_name || 'Без модели';
      const key = title.toLowerCase();
      const group = map.get(key);
      if (group) group.devices.push(ipad);
      else map.set(key, { key, title, devices: [ipad] });
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [ipads, excludeIds, search]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-0 sm:p-4">
      <div className="mx-auto flex h-full max-w-4xl flex-col bg-slate-50 shadow-2xl sm:rounded-2xl">
        <div className="border-b border-gray-200 bg-white p-4 sm:rounded-t-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Выбор iPad</p>
              <h2 className="text-lg font-bold text-slate-900">Найдите модель или отсканируйте штрихкод</h2>
            </div>
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600">Закрыть</button>
          </div>
          <input autoFocus value={search} onChange={event => { setSearch(event.target.value); setExpandedGroup(''); }}
            className="min-h-12 w-full rounded-xl border border-gray-200 px-4 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Tag, серийный номер или модель" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">Свободные iPad не найдены</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {groups.map(group => {
                const expanded = expandedGroup === group.key || group.devices.length === 1;
                return (
                  <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <button type="button" onClick={() => setExpandedGroup(expandedGroup === group.key ? '' : group.key)}
                      className="flex min-h-20 w-full items-center justify-between gap-3 p-4 text-left">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{group.title}</p>
                        <p className="truncate text-sm text-slate-500">iPad</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Доступно {group.devices.length}</span>
                    </button>
                    {expanded && (
                      <div className="space-y-2 border-t border-gray-100 bg-slate-50 p-3">
                        {group.devices.map(ipad => (
                          <button key={ipad.id} type="button" onClick={() => onSelect(ipad)}
                            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-gray-200 transition hover:ring-blue-400">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-800">Tag {ipad.tag}</span>
                              <span className="block truncate text-xs text-slate-500">SN: {ipad.serial_number}</span>
                            </span>
                            <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Выбрать</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
