'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useToast } from '@/contexts/ToastContext';

interface SyncItem {
  line_number?: number;
  tag: string;
  serial_number: string;
  assigned_user?: string;
  group?: string;
  action: string;
  message: string;
}

interface SyncPreview {
  summary: Record<string, number>;
  rows: SyncItem[];
  missing_devices: SyncItem[];
  blocking_errors: string[];
  can_apply: boolean;
  safe_changes: number;
}

interface Props {
  onApplied: () => Promise<void> | void;
  onClose: () => void;
}

const actionLabels: Record<string, string> = {
  ADD: 'Добавить',
  UPDATE: 'Обновить',
  REACTIVATE: 'Восстановить',
  DELETE: 'Удалить',
  ARCHIVE: 'В архив',
  KEEP_ACTIVE: 'Сохранить',
  CONFLICT: 'Конфликт',
  UNCHANGED: 'Без изменений',
};

const actionClass = (action: string) => action === 'CONFLICT'
  ? 'bg-red-100 text-red-700'
  : action === 'DELETE'
    ? 'bg-rose-100 text-rose-700'
    : action === 'ARCHIVE'
      ? 'bg-slate-200 text-slate-700'
      : action === 'ADD' || action === 'REACTIVATE'
        ? 'bg-emerald-100 text-emerald-700'
        : action === 'UPDATE'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-amber-100 text-amber-700';

export default function IpadInventorySyncModal({ onApplied, onClose }: Props) {
  const { showToast } = useToast();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fileName, setFileName] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const [excelBase64, setExcelBase64] = useState('');

  const readFile = async (file: File) => {
    setReadingFile(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'xlsx') {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Не удалось прочитать Excel-файл'));
          reader.readAsDataURL(file);
        });
        setExcelBase64(dataUrl.split(',', 2)[1] || '');
        setCsvText('');
      } else {
        setCsvText(await file.text());
        setExcelBase64('');
      }
      setFileName(file.name);
      setPreview(null);
    } catch (error: any) {
      setFileName('');
      showToast(error.message || 'Не удалось прочитать файл', 'error');
    } finally {
      setReadingFile(false);
    }
  };

  const check = async () => {
    if (!csvText.trim() && !excelBase64) {
      showToast('Вставьте CSV или выберите файл', 'error');
      return;
    }
    setChecking(true);
    try {
      const response = await api.post('/api/ipad-inventory/sync/preview', {
        csv_text: csvText,
        file_name: excelBase64 ? fileName : null,
        file_base64: excelBase64 || null,
      });
      setPreview(response.data);
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось проверить список'), 'error');
    } finally {
      setChecking(false);
    }
  };

  const apply = async () => {
    if (!preview?.can_apply || preview.safe_changes === 0) return;
    setApplying(true);
    try {
      const response = await api.post('/api/ipad-inventory/sync/apply', {
        csv_text: csvText,
        file_name: excelBase64 ? fileName : null,
        file_base64: excelBase64 || null,
      });
      await onApplied();
      const summary = response.data.summary || {};
      showToast(`Синхронизация завершена: добавлено ${summary.add || 0}, обновлено ${summary.update || 0}, удалено ${summary.delete || 0}, архивировано ${summary.archive || 0}`, 'success');
      onClose();
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, 'Не удалось применить синхронизацию'), 'error');
    } finally {
      setApplying(false);
    }
  };

  const allItems = preview ? [...preview.rows, ...preview.missing_devices] : [];

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
    <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Парк iPad</p><h2 className="mt-1 text-xl font-black">Синхронизировать список</h2><p className="mt-1 text-sm text-slate-500">Используются только Tag, Model и Serial Number. Название всегда сохраняется как iPad.</p></div><button type="button" disabled={checking || applying} onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600 disabled:opacity-50">Закрыть</button></div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <textarea value={csvText} onChange={event => { setCsvText(event.target.value); setExcelBase64(''); setFileName(''); setPreview(null); }} rows={9} placeholder={excelBase64 ? 'Excel-файл выбран. Нажмите «Проверить список».' : '46570,"iPad 7th Gen 10.2-inch (WiFi)",iPad,DMPCVBV2MF3R,"Issabekov Ruslan","Grade 5 A"'} disabled={Boolean(excelBase64)} className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm outline-none focus:border-blue-400 disabled:text-slate-400" />
          <div className="space-y-3"><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-3 text-center text-sm font-bold text-blue-700"><span>{readingFile ? 'Чтение файла...' : 'Выбрать CSV / Excel'}</span><span className="mt-1 text-xs font-medium text-blue-500">.csv или .xlsx</span>{fileName && <span className="mt-2 max-w-full truncate rounded-full bg-white px-3 py-1 text-xs text-slate-600">{fileName}</span>}<input type="file" disabled={readingFile || checking || applying} accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ''; }} className="sr-only"/></label><button type="button" disabled={readingFile || checking || applying} onClick={check} className="min-h-12 w-full rounded-xl bg-blue-600 font-black text-white disabled:opacity-50">{checking ? 'Проверка...' : 'Проверить список'}</button><p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Serial Number используется как уникальный ключ. Колонки пользователя, Asset Tag и группы игнорируются: назначения создаются только через акты SmartAct.</p></div>
        </div>

        {preview && <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">{[
            ['Строк', 'input_rows'], ['Добавить', 'add'], ['Обновить', 'update'], ['Восстановить', 'reactivate'], ['Удалить', 'delete'], ['В архив', 'archive'], ['Защищено', 'keep_active'], ['Конфликты', 'conflict'],
          ].map(([label, key]) => <div key={key} className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200"><p className="text-xl font-black text-slate-900">{preview.summary[key] || 0}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>)}</div>
          {preview.blocking_errors.length > 0 && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700"><p className="font-black">Синхронизацию нельзя применить:</p>{preview.blocking_errors.map((error, index) => <p key={index} className="mt-1">{error}</p>)}</div>}
          {preview.summary.conflict > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Конфликтные строки связаны только с дубликатами Tag или повреждённым активным статусом. Они не будут изменены.</p>}
          <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Строка</th><th className="px-3 py-2">Tag</th><th className="px-3 py-2">Serial Number</th><th className="px-3 py-2">Результат</th></tr></thead><tbody>{allItems.map((item, index) => <tr key={`${item.serial_number}-${index}`} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-400">{item.line_number || 'БД'}</td><td className="px-3 py-2 font-mono">{item.tag}</td><td className="px-3 py-2 font-mono">{item.serial_number}</td><td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${actionClass(item.action)}`}>{actionLabels[item.action] || item.action}</span><p className="mt-1 text-xs text-slate-500">{item.message}</p></td></tr>)}</tbody></table></div>
        </div>}
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-3 border-t border-slate-100 p-5"><button type="button" disabled={checking || applying} onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-600 disabled:opacity-50">Отмена</button><button type="button" disabled={!preview?.can_apply || preview.safe_changes === 0 || checking || applying} onClick={apply} className="min-h-12 rounded-xl bg-slate-950 font-black text-white disabled:opacity-35">{applying ? 'Применение...' : preview ? `Применить безопасные изменения (${preview.safe_changes})` : 'Сначала проверьте список'}</button></div>
    </div>
  </div>;
}
