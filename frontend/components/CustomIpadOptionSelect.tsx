'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Option {
  code: string;
  option_type: string;
  name: string;
}

interface SystemOption {
  value: string;
  label: string;
}

interface Props {
  optionType: 'REPLACEMENT_REASON' | 'RETURN_CONDITION';
  value: string;
  systemOptions: SystemOption[];
  onChange: (value: string) => void;
}

export default function CustomIpadOptionSelect({ optionType, value, systemOptions, onChange }: Props) {
  const { showToast } = useToast();
  const [customOptions, setCustomOptions] = useState<Option[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/api/ipad-acts/custom-options')
      .then(response => setCustomOptions(Array.isArray(response.data) ? response.data : []))
      .catch(() => setCustomOptions([]));
  }, []);

  const createOption = async () => {
    if (!name.trim()) {
      showToast('Введите название нового варианта', 'error');
      return;
    }
    setCreating(true);
    try {
      const response = await api.post('/api/ipad-acts/custom-options', {
        option_type: optionType,
        name: name.trim(),
      });
      setCustomOptions(current => current.some(item => item.code === response.data.code) ? current : [...current, response.data]);
      onChange(response.data.code);
      setAdding(false);
      setName('');
      showToast('Новый вариант добавлен', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Не удалось добавить вариант', 'error');
    } finally {
      setCreating(false);
    }
  };

  const options = customOptions.filter(item => item.option_type === optionType);

  return <div className="space-y-2">
    <select value={adding ? '__other__' : value} onChange={event => {
      if (event.target.value === '__other__') {
        setAdding(true);
        return;
      }
      setAdding(false);
      onChange(event.target.value);
    }} className="min-h-12 w-full rounded-xl border px-3">
      <option value="">Выберите</option>
      {systemOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      {options.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
      <option value="__other__">Другое...</option>
    </select>
    {adding && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><input autoFocus value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void createOption(); } }} placeholder={optionType === 'REPLACEMENT_REASON' ? 'Новая причина замены' : 'Новое состояние iPad'} className="min-h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-500"/><button type="button" disabled={creating} onClick={createOption} className="mt-2 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{creating ? 'Добавление...' : 'Добавить в общий список'}</button><p className="mt-2 text-xs text-blue-700">Для пользовательского варианта iPad будет переведён на обслуживание.</p></div>}
  </div>;
}
