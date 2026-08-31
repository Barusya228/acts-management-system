'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';

export interface BulkStudentIpad {
  id: string;
  device_name: string;
  model?: string | null;
  tag: string;
  serial_number: string;
}

export interface BulkStudentAssignment {
  student_name: string;
  device: BulkStudentIpad;
}

interface ExistingStudentRow {
  student_name: string;
  ipad_device_id: string;
}

interface ParsedRow {
  lineNumber: number;
  serial_number: string;
  student_name: string;
  error?: string;
}

interface CheckedRow extends ParsedRow {
  device?: BulkStudentIpad;
}

interface ResolveItem {
  serial_number: string;
  match_status: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_FOUND';
  device: (BulkStudentIpad & { status: string }) | null;
}

interface Props {
  existingRows: ExistingStudentRow[];
  onApply: (assignments: BulkStudentAssignment[]) => void;
  onClose: () => void;
}

export function parseBulkStudentLines(value: string): ParsedRow[] {
  return value.split(/\r?\n/).map((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return null;
    const match = line.match(/^(\S+)\s+(.+)$/);
    if (!match) {
      return { lineNumber: index + 1, serial_number: line, student_name: '', error: 'Укажите Serial Number и ФИО' };
    }
    return {
      lineNumber: index + 1,
      serial_number: match[1].trim(),
      student_name: match[2].trim(),
    };
  }).filter((row): row is ParsedRow => row !== null);
}

export default function BulkIpadStudentsModal({ existingRows, onApply, onClose }: Props) {
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<CheckedRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [requestError, setRequestError] = useState('');

  const checkRows = async () => {
    const parsed = parseBulkStudentLines(source);
    if (parsed.length === 0) {
      setRows([]);
      setRequestError('Вставьте хотя бы одну строку');
      return;
    }

    setChecking(true);
    setRequestError('');
    try {
      const serialCounts = new Map<string, number>();
      const nameCounts = new Map<string, number>();
      for (const row of parsed) {
        const serialKey = row.serial_number.toLowerCase();
        const nameKey = row.student_name.toLowerCase();
        serialCounts.set(serialKey, (serialCounts.get(serialKey) || 0) + 1);
        if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
      }

      const uniqueSerials = Array.from(new Set(parsed.filter(row => !row.error).map(row => row.serial_number.toLowerCase())));
      const response = await api.post('/api/ipad-inventory/available/resolve', { serial_numbers: uniqueSerials });
      const resolved = new Map<string, ResolveItem>(
        (response.data?.items || []).map((item: ResolveItem) => [item.serial_number.toLowerCase(), item])
      );
      const existingNames = new Set(existingRows.map(row => row.student_name.trim().toLowerCase()).filter(Boolean));
      const existingDeviceIds = new Set(existingRows.map(row => row.ipad_device_id).filter(Boolean));

      setRows(parsed.map(row => {
        if (row.error) return row;
        const serialKey = row.serial_number.toLowerCase();
        const nameKey = row.student_name.toLowerCase();
        if ((serialCounts.get(serialKey) || 0) > 1) return { ...row, error: 'Serial Number повторяется в списке' };
        if ((nameCounts.get(nameKey) || 0) > 1) return { ...row, error: 'Ученик повторяется в списке' };
        if (existingNames.has(nameKey)) return { ...row, error: 'Ученик уже добавлен в акт' };
        const match = resolved.get(serialKey);
        if (!match || match.match_status === 'NOT_FOUND') return { ...row, error: 'iPad с таким Serial Number не найден' };
        if (match.match_status === 'UNAVAILABLE') return { ...row, error: `iPad недоступен: ${match.device?.status || 'UNKNOWN'}` };
        if (!match.device) return { ...row, error: 'Данные iPad не получены' };
        if (existingDeviceIds.has(match.device.id)) return { ...row, error: 'Этот iPad уже выбран в акте' };
        return { ...row, device: match.device };
      }));
    } catch (error: unknown) {
      setRows([]);
      setRequestError(apiErrorMessage(error, 'Не удалось проверить список iPad'));
    } finally {
      setChecking(false);
    }
  };

  const validRows = rows.filter((row): row is CheckedRow & { device: BulkStudentIpad } => Boolean(row.device) && !row.error);
  const canApply = rows.length > 0 && validRows.length === rows.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Массовое назначение</p><h2 className="mt-1 text-xl font-black">Добавить несколько учеников</h2><p className="mt-1 text-sm text-slate-500">Одна строка: Serial Number, затем ФИО ученика.</p></div>
          <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">Закрыть</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <textarea
            autoFocus
            value={source}
            onChange={event => { setSource(event.target.value); setRows([]); setRequestError(''); }}
            rows={11}
            className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder={'F4YF3F90H7\tBanchshikov Miron\nDLQ5HK43XK\tSergeyevskaya Kira'}
          />
          <button type="button" disabled={checking} onClick={checkRows} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-50">{checking ? 'Проверка...' : 'Найти iPad и проверить список'}</button>
          {requestError && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{requestError}</p>}
          {rows.length > 0 && <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">Результат проверки</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${canApply ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{validRows.length} из {rows.length} готово</span></div>
            {rows.map(row => <div key={row.lineNumber} className={`rounded-xl p-3 ring-1 ${row.error ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-bold text-slate-800">{row.student_name || `Строка ${row.lineNumber}`}</p><p className="font-mono text-xs text-slate-500">SN {row.serial_number}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.error ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.error || `Tag ${row.device?.tag}`}</span></div>
            </div>)}
          </div>}
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 p-5"><button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600">Отмена</button><button type="button" disabled={!canApply} onClick={() => onApply(validRows.map(row => ({ student_name: row.student_name, device: row.device })))} className="min-h-12 rounded-xl bg-slate-950 font-black text-white disabled:opacity-30">Добавить {validRows.length} учеников</button></div>
      </div>
    </div>
  );
}
