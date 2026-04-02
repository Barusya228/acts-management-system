'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Layout from '@/components/Layout';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { getParticipantEmoji } from '@/lib/participants';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface Participant {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE';
  is_active: boolean;
}

export default function ParticipantsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Participant | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    department: '',
    title: '',
    sticker_emoji: '👤',
    kind: 'EMPLOYEE',
  });

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.push('/');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchParticipants();
    }
  }, [user]);

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/participants');
      setItems(res.data || []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки участников', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/participants', {
        ...form,
        email: form.email || null,
        department: form.department || null,
        title: form.title || null,
        sticker_emoji: form.sticker_emoji || null,
      });
      setForm({ full_name: '', email: '', department: '', title: '', sticker_emoji: '👤', kind: 'EMPLOYEE' });
      await fetchParticipants();
      showToast('Участник добавлен', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка сохранения участника', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      showToast('Введите список участников', 'error');
      return;
    }

    setBulkImporting(true);
    try {
      const lines = bulkText.split('\n').filter(line => line.trim());
      const participants = lines.map(line => ({
        full_name: line.trim(),
        kind: 'EMPLOYEE'
      }));

      const res = await api.post('/api/participants/bulk', participants);
      await fetchParticipants();
      showToast(`Создано: ${res.data.created}, Пропущено: ${res.data.skipped}`, 'success');
      setBulkText('');
      setShowBulkImport(false);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка массовой загрузки', 'error');
    } finally {
      setBulkImporting(false);
    }
  };

  const handleEdit = (participant: Participant) => {
    setEditingId(participant.id);
    setEditForm({ ...participant });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingId) return;

    setSaving(true);
    try {
      await api.patch(`/api/participants/${editingId}`, {
        full_name: editForm.full_name,
        email: editForm.email || null,
        department: editForm.department || null,
        title: editForm.title || null,
        sticker_emoji: editForm.sticker_emoji || null,
      });
      await fetchParticipants();
      showToast('Участник обновлен', 'success');
      setEditingId(null);
      setEditForm(null);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка обновления участника', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  const itManagers = items.filter((item) => item.kind === 'IT_MANAGER');
  const employees = items.filter((item) => item.kind === 'EMPLOYEE');

  return (
    <Layout>
      <PageHeader
        eyebrow="Справочник"
        title="Участники процесса"
        description="Поддерживайте единый список IT-менеджеров и сотрудников, чтобы не вводить одни и те же данные в каждом акте вручную."
      />

      <div className="mb-4">
        <button
          onClick={() => setShowBulkImport(!showBulkImport)}
          className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          {showBulkImport ? 'Скрыть массовую загрузку' : 'Массовая загрузка'}
        </button>
      </div>

      {showBulkImport && (
        <SurfaceCard className="p-6 mb-6">
          <h2 className="mb-4 text-lg font-semibold">Массовая загрузка сотрудников</h2>
          <p className="mb-3 text-sm text-gray-600">Введите список ФИО (каждое имя с новой строки). Все будут добавлены как сотрудники.</p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 mb-3"
            rows={10}
            placeholder="Иванов Иван Иванович&#10;Петров Петр Петрович&#10;..."
          />
          <div className="flex gap-2">
            <button
              onClick={handleBulkImport}
              disabled={bulkImporting}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {bulkImporting ? 'Загрузка...' : 'Загрузить'}
            </button>
            <button
              onClick={() => setShowBulkImport(false)}
              className="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
            >
              Отмена
            </button>
          </div>
        </SurfaceCard>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <SurfaceCard className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Добавить участника</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              value={form.full_name}
              onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="ФИО"
              required
            />
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Email"
            />
            <input
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Отдел"
            />
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Должность"
            />
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Стикер участника</p>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-gray-200">
                      {form.sticker_emoji}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Текущий стикер</p>
                      <p className="text-xs text-gray-500">Выберите emoji из полного списка категорий</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    {showEmojiPicker ? 'Скрыть' : 'Выбрать emoji'}
                  </button>
                </div>

                {showEmojiPicker && (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <EmojiPicker
                      width="100%"
                      height={420}
                      searchDisabled={false}
                      skinTonesDisabled
                      previewConfig={{ showPreview: false }}
                      onEmojiClick={(emojiData) => {
                        setForm((prev) => ({ ...prev, sticker_emoji: emojiData.emoji }));
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <select
              value={form.kind}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value as 'IT_MANAGER' | 'EMPLOYEE' }))}
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="IT_MANAGER">💻 IT-менеджер</option>
              <option value="EMPLOYEE">👤 Сотрудник</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Сохранение...' : 'Добавить'}
            </button>
          </form>
        </SurfaceCard>

        <div className="grid gap-6">
          <SurfaceCard className="p-6">
            <h2 className="mb-4 text-lg font-semibold">IT-менеджеры</h2>
            {loading ? (
              <p className="text-gray-500">Загрузка...</p>
            ) : itManagers.length === 0 ? (
              <p className="text-gray-500">IT-менеджеры пока не добавлены</p>
            ) : (
              <div className="space-y-3">
                {itManagers.map((item) => (
                  <div key={item.id} className="rounded border border-gray-200 p-3">
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={editForm?.full_name || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="ФИО"
                        />
                        <input
                          value={editForm?.email || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, email: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Email"
                        />
                        <input
                          value={editForm?.department || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, department: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Отдел"
                        />
                        <input
                          value={editForm?.title || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, title: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Должность"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            {saving ? 'Сохранение...' : 'Сохранить'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="rounded bg-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-400"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900"><span className="mr-2">{getParticipantEmoji(item.kind, item.sticker_emoji)}</span>{item.full_name}</p>
                            <p className="text-sm text-gray-500">{item.title || 'Без должности'} {item.department ? `• ${item.department}` : ''}</p>
                            {item.email && <p className="text-sm text-gray-600">{item.email}</p>}
                          </div>
                          <button
                            onClick={() => handleEdit(item)}
                            className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                          >
                            ✏️ Редактировать
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Сотрудники / получатели</h2>
            {loading ? (
              <p className="text-gray-500">Загрузка...</p>
            ) : employees.length === 0 ? (
              <p className="text-gray-500">Сотрудники пока не добавлены</p>
            ) : (
              <div className="space-y-3">
                {employees.map((item) => (
                  <div key={item.id} className="rounded border border-gray-200 p-3">
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={editForm?.full_name || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="ФИО"
                        />
                        <input
                          value={editForm?.email || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, email: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Email"
                        />
                        <input
                          value={editForm?.department || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, department: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Отдел"
                        />
                        <input
                          value={editForm?.title || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, title: e.target.value } : null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Должность"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            {saving ? 'Сохранение...' : 'Сохранить'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="rounded bg-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-400"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900"><span className="mr-2">{getParticipantEmoji(item.kind, item.sticker_emoji)}</span>{item.full_name}</p>
                            <p className="text-sm text-gray-500">{item.title || 'Без должности'} {item.department ? `• ${item.department}` : ''}</p>
                            {item.email && <p className="text-sm text-gray-600">{item.email}</p>}
                          </div>
                          <button
                            onClick={() => handleEdit(item)}
                            className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                          >
                            ✏️ Редактировать
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </Layout>
  );
}
