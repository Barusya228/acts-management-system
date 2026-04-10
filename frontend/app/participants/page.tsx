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
import { getParticipantEmoji, getParticipantKindLabel } from '@/lib/participants';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type ParticipantKind = 'IT_MANAGER' | 'EMPLOYEE' | 'BOTH';

interface Participant {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: ParticipantKind;
  is_active: boolean;
}

interface ParticipantFormState {
  full_name: string;
  email: string;
  department: string;
  title: string;
  sticker_emoji: string;
  kind: ParticipantKind;
}

const emptyFormState: ParticipantFormState = {
  full_name: '',
  email: '',
  department: '',
  title: '',
  sticker_emoji: '👤',
  kind: 'EMPLOYEE',
};

const englishNameRegex = /^[A-Za-z\s\-'.]+$/;

function matchesParticipantKind(participantKind: ParticipantKind, filterKind: 'ALL' | ParticipantKind) {
  if (filterKind === 'ALL') {
    return true;
  }
  if (filterKind === 'IT_MANAGER') {
    return participantKind === 'IT_MANAGER' || participantKind === 'BOTH';
  }
  if (filterKind === 'EMPLOYEE') {
    return participantKind === 'EMPLOYEE' || participantKind === 'BOTH';
  }
  return participantKind === 'BOTH';
}

function normalizeParticipantPayload(form: ParticipantFormState) {
  return {
    full_name: form.full_name.trim(),
    email: form.email.trim() || null,
    department: form.department.trim() || null,
    title: form.title.trim() || null,
    sticker_emoji: form.sticker_emoji.trim() || null,
    kind: form.kind,
  };
}

function validateParticipantName(fullName: string) {
  return englishNameRegex.test(fullName.trim());
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
  const [bulkKind, setBulkKind] = useState<ParticipantKind>('EMPLOYEE');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | ParticipantKind>('ALL');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ParticipantFormState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<ParticipantFormState>(emptyFormState);

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
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки участников', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateParticipantName(form.full_name)) {
      showToast('ФИО должно быть на английском языке (только латинские буквы)', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/participants', normalizeParticipantPayload(form));
      setForm(emptyFormState);
      setShowEmojiPicker(false);
      await fetchParticipants();
      showToast('Участник сохранен', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка сохранения участника', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast('Введите список участников', 'error');
      return;
    }

    const invalidLine = lines.find((line) => !validateParticipantName(line));
    if (invalidLine) {
      showToast(`Некорректное ФИО: ${invalidLine}`, 'error');
      return;
    }

    setBulkImporting(true);
    try {
      const participants = lines.map((full_name) => ({ full_name, kind: bulkKind }));
      const res = await api.post('/api/participants/bulk', participants);
      await fetchParticipants();
      showToast(`Создано: ${res.data.created}, Обновлено/пропущено: ${res.data.skipped}`, 'success');
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
    setEditForm({
      full_name: participant.full_name,
      email: participant.email || '',
      department: participant.department || '',
      title: participant.title || '',
      sticker_emoji: participant.sticker_emoji || getParticipantEmoji(participant.kind, participant.sticker_emoji),
      kind: participant.kind,
    });
    setShowEditEmojiPicker(false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setShowEditEmojiPicker(false);
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingId) return;

    if (!validateParticipantName(editForm.full_name)) {
      showToast('ФИО должно быть на английском языке (только латинские буквы)', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/participants/${editingId}`, normalizeParticipantPayload(editForm));
      await fetchParticipants();
      showToast('Участник обновлен', 'success');
      handleCancelEdit();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка обновления участника', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (participant: Participant) => {
    setDeleteConfirm({ id: participant.id, name: participant.full_name });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setSaving(true);
    try {
      await api.delete(`/api/participants/${deleteConfirm.id}`);
      await fetchParticipants();
      showToast('Участник удален', 'success');
      setDeleteConfirm(null);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка удаления участника', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.role !== 'ADMIN') return null;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = items
    .filter((item) => matchesParticipantKind(item.kind, kindFilter))
    .filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      return [item.full_name, item.email || '', item.department || '', item.title || '', getParticipantKindLabel(item.kind)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .sort((left, right) => left.full_name.localeCompare(right.full_name));

  const stats = {
    total: items.length,
    managers: items.filter((item) => item.kind === 'IT_MANAGER' || item.kind === 'BOTH').length,
    employees: items.filter((item) => item.kind === 'EMPLOYEE' || item.kind === 'BOTH').length,
    both: items.filter((item) => item.kind === 'BOTH').length,
  };

  return (
    <Layout>
      <PageHeader
        eyebrow="Справочник"
        title="Участники процесса"
        description="Один человек хранится одной карточкой. Роль определяет, где он доступен: как IT-менеджер, как получатель или сразу в обеих ролях."
      />

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <SurfaceCard className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Всего карточек</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.total}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Доступны как IT</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.managers}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Доступны как получатели</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.employees}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Обе роли</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.both}</p>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <SurfaceCard className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Добавить участника</h2>
              <p className="mt-1 text-sm text-gray-600">
                Если человек уже существует, повторное добавление с другой ролью объединит роли в одной карточке.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">ФИО на английском языке *</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
                  placeholder="John Doe"
                  required
                  pattern="[A-Za-z\s\-'.]+"
                  title="Используйте только английские буквы, пробелы, дефисы и точки"
                />
                <p className="mt-1 text-xs text-gray-500">Пример: John Smith, Mary-Jane O&apos;Connor</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Роль в процессе *</label>
                <select
                  value={form.kind}
                  onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value as ParticipantKind }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
                >
                  <option value="IT_MANAGER">💻 IT-менеджер</option>
                  <option value="EMPLOYEE">👤 Сотрудник / получатель</option>
                  <option value="BOTH">🧑‍💼 Обе роли</option>
                </select>
              </div>

              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
                placeholder="Email"
              />
              <input
                value={form.department}
                onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
                placeholder="Отдел"
              />
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
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
                        <p className="text-xs text-gray-500">Можно оставить стандартный или выбрать свой emoji</p>
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

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? 'Сохранение...' : 'Сохранить участника'}
              </button>
            </form>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Массовая загрузка</h2>
                <p className="mt-1 text-sm text-gray-600">Список ФИО загружается построчно. Для всех строк применяется выбранная роль.</p>
              </div>
              <button
                onClick={() => setShowBulkImport((prev) => !prev)}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
              >
                {showBulkImport ? 'Скрыть' : 'Открыть'}
              </button>
            </div>

            {showBulkImport && (
              <div className="space-y-4">
                <select
                  value={bulkKind}
                  onChange={(e) => setBulkKind(e.target.value as ParticipantKind)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5"
                >
                  <option value="EMPLOYEE">👤 Сотрудник / получатель</option>
                  <option value="IT_MANAGER">💻 IT-менеджер</option>
                  <option value="BOTH">🧑‍💼 Обе роли</option>
                </select>

                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="min-h-[220px] w-full rounded-xl border border-gray-300 px-3 py-2.5"
                  placeholder="John Smith&#10;Mary Johnson&#10;Robert Brown"
                />

                <p className="text-xs text-gray-500">
                  Если имя уже есть в справочнике, роль будет объединена, а не создана новая отдельная карточка.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handleBulkImport}
                    disabled={bulkImporting}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {bulkImporting ? 'Загрузка...' : 'Загрузить список'}
                  </button>
                  <button
                    onClick={() => setShowBulkImport(false)}
                    className="rounded-xl bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </SurfaceCard>
        </div>

        <SurfaceCard className="p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Единый список участников</h2>
              <p className="mt-1 text-sm text-gray-600">Одна карточка на человека. Роль определяет доступность в актах.</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 sm:w-72"
                placeholder="Поиск по имени, email, отделу"
              />
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as 'ALL' | ParticipantKind)}
                className="rounded-xl border border-gray-300 px-3 py-2.5"
              >
                <option value="ALL">Все роли</option>
                <option value="IT_MANAGER">Доступны как IT-менеджеры</option>
                <option value="EMPLOYEE">Доступны как получатели</option>
                <option value="BOTH">Только обе роли</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500">Загрузка...</p>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-700">Ничего не найдено</p>
              <p className="mt-1 text-sm text-gray-500">Проверьте фильтр или добавьте нового участника слева.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 p-4 transition hover:border-gray-300">
                  {editingId === item.id ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={editForm?.full_name || ''}
                          onChange={(e) => setEditForm((prev) => (prev ? { ...prev, full_name: e.target.value } : null))}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder="ФИО"
                        />
                        <select
                          value={editForm?.kind || 'EMPLOYEE'}
                          onChange={(e) => setEditForm((prev) => (prev ? { ...prev, kind: e.target.value as ParticipantKind } : null))}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                        >
                          <option value="IT_MANAGER">💻 IT-менеджер</option>
                          <option value="EMPLOYEE">👤 Сотрудник / получатель</option>
                          <option value="BOTH">🧑‍💼 Обе роли</option>
                        </select>
                        <input
                          value={editForm?.email || ''}
                          onChange={(e) => setEditForm((prev) => (prev ? { ...prev, email: e.target.value } : null))}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder="Email"
                        />
                        <input
                          value={editForm?.department || ''}
                          onChange={(e) => setEditForm((prev) => (prev ? { ...prev, department: e.target.value } : null))}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          placeholder="Отдел"
                        />
                        <input
                          value={editForm?.title || ''}
                          onChange={(e) => setEditForm((prev) => (prev ? { ...prev, title: e.target.value } : null))}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm md:col-span-2"
                          placeholder="Должность"
                        />
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-gray-700">Стикер участника</p>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-gray-200">
                                {editForm?.sticker_emoji || '👤'}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">Текущий стикер</p>
                                <p className="text-xs text-gray-500">Выберите emoji для карточки участника</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowEditEmojiPicker((prev) => !prev)}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                            >
                              {showEditEmojiPicker ? 'Скрыть' : 'Выбрать emoji'}
                            </button>
                          </div>

                          {showEditEmojiPicker && (
                            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                              <EmojiPicker
                                width="100%"
                                height={420}
                                searchDisabled={false}
                                skinTonesDisabled
                                previewConfig={{ showPreview: false }}
                                onEmojiClick={(emojiData) => {
                                  setEditForm((prev) => (prev ? { ...prev, sticker_emoji: emojiData.emoji } : null));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="rounded-xl bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-base font-semibold text-gray-900">
                            <span className="mr-2">{getParticipantEmoji(item.kind, item.sticker_emoji)}</span>
                            {item.full_name}
                          </p>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                            {getParticipantKindLabel(item.kind)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-gray-600">
                          {[item.title || 'Без должности', item.department].filter(Boolean).join(' • ')}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-600">
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            {item.email || 'Email не указан'}
                          </span>
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            {item.kind === 'BOTH'
                              ? 'Доступен в обеих сторонах акта'
                              : item.kind === 'IT_MANAGER'
                                ? 'Доступен как сторона 1'
                                : 'Доступен как сторона 2'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-700 hover:bg-red-200"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Подтверждение удаления</h3>
            <p className="mb-6 text-gray-700">
              Вы уверены, что хотите удалить участника <strong>{deleteConfirm.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={saving}
                className="rounded-xl bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={saving}
                className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:bg-gray-400"
              >
                {saving ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
