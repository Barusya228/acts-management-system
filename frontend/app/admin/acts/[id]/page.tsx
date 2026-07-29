'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import SignaturePad from '@/components/SignaturePad';
import SignatureUpload from '@/components/SignatureUpload';
import ConfirmModal from '@/components/ConfirmModal';
import RecipientsEditor, { type EditableRecipient } from '@/components/RecipientsEditor';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';
import { normalizeActRecipients, getSignedRecipientsCount, type ActRecipient } from '@/lib/actRecipients';

interface Act {
  id: string;
  template_id: string;
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
  extra_data_json?: Record<string, unknown>;
  return_date?: string | null;
  return_note?: string | null;
  status: string;
  issue_completion_email_sent: boolean;
  return_completion_email_sent: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface ActVersion {
  id: string;
  version_number: number;
  created_at: string;
  pdf_file_id?: string | null;
  change_note?: string | null;
  data_json?: Record<string, unknown>;
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
  schema_json?: {
    max_recipients?: number | null;
    fields?: Array<{
      name: string;
      type: string;
      label: string;
      required: boolean;
    }>;
  };
}

interface ParticipantOption {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  sticker_emoji?: string | null;
  kind: 'IT_MANAGER' | 'EMPLOYEE' | 'BOTH';
}

interface EquipmentItem {
  name: string;
  serial: string;
  imei?: string;
}

function getVersionTitle(templateCode: string | undefined, versionNumber: number): string {
  if (templateCode !== 'GENERIC_ONE') {
    return `Шаг ${versionNumber}`;
  }

  const genericOneTitles: Record<number, string> = {
    1: 'Создание акта',
    2: 'Подпись получателя',
    3: 'Финальная подпись менеджера',
    4: 'Инициирован возврат техники',
    5: 'Подпись менеджера при возврате',
    6: 'Подпись получателя при возврате',
  };

  return genericOneTitles[versionNumber] || `Шаг ${versionNumber}`;
}

function getHumanVersionTitle(versionNumber: number, changeNote?: string | null): string {
  const note = changeNote || '';

  if (versionNumber === 1) return 'Акт создан';
  if (note.includes('Инициирован возврат')) return 'Возврат инициирован';
  if (note.includes('Подписал получатель')) {
    return note.toLowerCase().includes('возврат')
      ? 'Получатель подтвердил возврат'
      : 'Получатель подписал акт';
  }
  if (note.includes('Подписал передающий')) return 'Менеджер подтвердил выдачу';
  if (note.includes('Подписал возвращающий')) return 'Менеджер подтвердил возврат';
  if (versionNumber >= 4) return 'Действие по возврату';
  return `Действие ${versionNumber}`;
}

function normalizeChangeNote(note?: string | null): string | null {
  if (!note) return null;

  return note
    .replace('Подписал передающий: сторона 1', 'Менеджер подтвердил выдачу')
    .replace('Подписал возвращающий: сторона 1', 'Менеджер подтвердил возврат')
    .replace('Подписал получатель:', 'Получатель подписал:');
}

export default function ActViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [act, setAct] = useState<Act | null>(null);
  const [template, setTemplate] = useState<TemplateOption | null>(null);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [versions, setVersions] = useState<ActVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [startingReturn, setStartingReturn] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<'preview' | 'download' | null>(null);
  const [versionPdfLoading, setVersionPdfLoading] = useState<number | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editRecipients, setEditRecipients] = useState<EditableRecipient[]>([]);
  const [editMainEquipment, setEditMainEquipment] = useState<EquipmentItem>({ name: '', serial: '', imei: '' });
  const [editEquipmentItems, setEditEquipmentItems] = useState<EquipmentItem[]>([]);
  const [returnDate, setReturnDate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetchActAndVersions();
  }, [id]);

  const fetchActAndVersions = async () => {
    try {
      const [actRes, versionsRes, participantsRes] = await Promise.all([
        api.get(`/api/acts/${id}`),
        api.get(`/api/acts/${id}/versions`),
        api.get('/api/participants?is_active=true'),
      ]);
      setAct(actRes.data);
      setVersions(versionsRes.data || []);
      setParticipants(Array.isArray(participantsRes.data) ? participantsRes.data : []);

      if (actRes.data?.template_id) {
        const templateRes = await api.get(`/api/templates/${actRes.data.template_id}`);
        setTemplate(templateRes.data);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка загрузки акта';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadedSignature = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setSignatureData(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const canSignParty1 = act?.status === 'SIGNED_PARTY2' || act?.status === 'RETURN_INITIATED';
  const canSignParty2 = act?.status === 'DRAFT' || act?.status === 'RETURN_SIGNED_PARTY1';
  const issueEmailReady = act?.status === 'COMPLETED';
  const returnEmailReady = act?.status === 'RETURNED';
  const shouldShowSigningBlock = !editing && (
    act?.status === 'DRAFT' ||
    act?.status === 'SIGNED_PARTY1' ||
    act?.status === 'SIGNED_PARTY2' ||
    act?.status === 'RETURN_INITIATED' ||
    act?.status === 'RETURN_SIGNED_PARTY1' ||
    act?.status === 'RETURN_SIGNED_PARTY2'
  );

  const getSignButtonMeta = (party: 'party1' | 'party2', status: string) => {
    if (party === 'party1') {
      if (status === 'SIGNED_PARTY2') {
        return { label: 'Подтвердить выдачу как менеджер', hint: 'Финальное подтверждение после всех подписей получателей', highlight: true };
      }
      if (status === 'SIGNED_PARTY1') {
        return { label: 'Менеджер уже подтвердил', hint: 'Ожидается подпись получателя', highlight: false };
      }
      if (status === 'RETURN_INITIATED') {
        return { label: 'Подтвердить возврат как менеджер', hint: 'Сначала возврат подтверждает менеджер', highlight: true };
      }
      if (status === 'RETURN_SIGNED_PARTY1') {
        return { label: 'Менеджер уже подтвердил возврат', hint: 'Теперь ожидается подпись получателя', highlight: false };
      }
      if (status === 'RETURN_SIGNED_PARTY2' || status === 'RETURNED') {
        return { label: 'Подпись менеджера не нужна', hint: 'Этап уже завершен', highlight: false };
      }
      return { label: 'Подпись недоступна', hint: 'Сейчас действует другой этап процесса', highlight: false };
    }

    if (status === 'DRAFT') {
      return { label: 'Подписать как получатель', hint: 'Сейчас нужна подпись получателя', highlight: true };
    }
    if (status === 'SIGNED_PARTY1') {
      return { label: 'Подпись недоступна', hint: 'Нарушен порядок подписания выдачи', highlight: false };
    }
    if (status === 'SIGNED_PARTY2') {
      return { label: 'Получатель уже подписал', hint: 'Теперь ожидается подтверждение менеджера', highlight: false };
    }
    if (status === 'RETURN_SIGNED_PARTY1') {
      return { label: 'Подписать возврат как получатель', hint: 'После менеджера возврат подтверждает получатель', highlight: true };
    }
    if (status === 'RETURN_INITIATED') {
      return { label: 'Ожидается менеджер', hint: 'После менеджера откроется подтверждение получателя', highlight: false };
    }
    if (status === 'RETURN_SIGNED_PARTY2') {
      return { label: 'Получатель уже подтвердил возврат', hint: 'Возврат почти завершен', highlight: false };
    }
    return { label: 'Подпись недоступна', hint: 'Сейчас действие для подписи не требуется', highlight: false };
  };

  const getSigningSteps = (status: string, recipients: ActRecipient[]) => {
    const isReturnFlow =
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED';

    if (isReturnFlow) {
      return [
        {
          step: 5,
          party: 'party1' as const,
          title: 'Подтверждение менеджера',
          description: 'Менеджер подтверждает возврат техники',
          state:
            status === 'RETURN_INITIATED'
              ? 'current'
              : status === 'RETURN_SIGNED_PARTY1' || status === 'RETURN_SIGNED_PARTY2' || status === 'RETURNED'
              ? 'done'
              : 'pending',
        },
        ...recipients.map((recipient, index) => ({
          step: 6 + index,
          party: 'party2' as const,
          title: `Подпись получателя ${index + 1}`,
          description: recipient.full_name,
          recipientIndex: index,
          state: recipient.return_signed_at
            ? 'done'
            : status === 'RETURN_SIGNED_PARTY1' && recipients.slice(0, index).every((item) => item.return_signed_at)
            ? 'current'
            : 'pending',
        })),
      ];
    }

    return [
      ...recipients.map((recipient, index) => ({
        step: 2 + index,
        party: 'party2' as const,
        title: `Подпись получателя ${index + 1}`,
        description: recipient.full_name,
        recipientIndex: index,
        state: recipient.signed_at ? 'done' : status === 'DRAFT' && recipients.slice(0, index).every((item) => item.signed_at) ? 'current' : 'pending',
      })),
      {
          step: 2 + recipients.length,
          party: 'party1' as const,
          title: 'Подтверждение менеджера',
          description: 'Менеджер завершает выдачу после подписей получателей',
          state: status === 'SIGNED_PARTY2' ? 'current' : status === 'COMPLETED' ? 'done' : 'pending',
        },
      ];
  };

  const getSigningHint = (status: string, recipients: ActRecipient[]) => {
    if (status === 'DRAFT') {
      return `Сначала последовательно подписывают получатели (${recipients.length}), затем выдачу подтверждает менеджер.`;
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Все получатели подписали выдачу. Теперь осталось подтверждение менеджера.';
    }
    if (status === 'SIGNED_PARTY1') {
      return 'Текущий статус не соответствует целевому порядку подписания выдачи.';
    }
    if (status === 'RETURN_INITIATED') {
      return 'Возврат уже инициирован. Сначала его подтверждает менеджер.';
    }
    if (status === 'RETURN_SIGNED_PARTY1') {
      return `Менеджер уже подтвердил возврат. Теперь последовательно подписывают получатели (${recipients.length}).`;
    }
    if (status === 'RETURN_SIGNED_PARTY2') {
      return 'Текущий статус не соответствует целевому порядку подписания возврата.';
    }
    if (status === 'RETURNED') {
      return 'Возврат завершен. Обе стороны подтвердили возвращение техники.';
    }
    if (status === 'COMPLETED') {
      return 'Выдача завершена. При необходимости можно запустить процесс возврата.';
    }
    return 'Подписание завершено. Дополнительные подписи не требуются.';
  };

  const getCurrentFlowLabel = (status: string) => {
    if (
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 'Возврат техники';
    }
    return 'Выдача техники';
  };

  const getIssuedFlowSideText = (status: string) => {
    if (status === 'DRAFT') {
      return 'Менеджер: ожидается | Получатель: текущий шаг';
    }
    if (status === 'SIGNED_PARTY1') {
      return 'Менеджер: подтверждено | Получатель: ожидается';
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Менеджер: текущее действие | Получатель: подтверждено';
    }
    if (
      status === 'COMPLETED' ||
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 'Менеджер: подтверждено | Получатель: подтверждено';
    }
    return 'Менеджер: ожидается | Получатель: ожидается';
  };

  const signAct = async (party: 'party1' | 'party2') => {
    if (!signatureData) {
      const msg = 'Сначала сохраните или загрузите подпись';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setSigning(true);
    setError('');

    try {
      const recipients = act
        ? normalizeActRecipients(act.extra_data_json, act.party2_name, act.receiver_email)
        : [];
      const isReturnSignature = act?.status === 'RETURN_SIGNED_PARTY1';
      const pendingRecipient = recipients.find(recipient =>
        isReturnSignature ? !recipient.return_signed_at : !recipient.signed_at
      );
      const participantId = party === 'party1'
        ? typeof act?.extra_data_json?.party1_participant_id === 'string'
          ? act.extra_data_json.party1_participant_id
          : undefined
        : pendingRecipient?.participant_id;
      await api.post(`/api/acts/${id}/sign/${party}`, {
        signature_data: signatureData,
        participant_id: participantId,
      });
      setSignatureData('');
      await fetchActAndVersions();
      showToast(party === 'party1' ? 'Менеджер подтвердил документ' : 'Получатель подписал документ', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Ошибка подписания акта';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSigning(false);
    }
  };

  const openOrDownloadPdf = async (
    endpoint: string,
    fallbackFilename: string,
    mode: 'preview' | 'download',
    versionNumber?: number
  ) => {
    try {
      if (versionNumber) {
        setVersionPdfLoading(versionNumber);
      } else {
        setPdfLoading(mode);
      }

      const res = await api.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: res.headers['content-type'] || 'application/pdf',
      });

      const objectUrl = URL.createObjectURL(blob);

      if (mode === 'preview') {
        if (pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
        }
        setPdfPreviewUrl(objectUrl);
        return;
      }

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fallbackFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      showToast('Не удалось загрузить PDF', 'error');
    } finally {
      if (versionNumber) {
        setVersionPdfLoading(null);
      } else {
        setPdfLoading(null);
      }
    }
  };

  const handlePreviewCurrentPdf = () =>
    openOrDownloadPdf(`/api/acts/${id}/preview/pdf`, `act_${id}_preview.pdf`, 'preview');

  const handleDownloadCurrentPdf = () =>
    openOrDownloadPdf(`/api/acts/${id}/download/pdf`, `act_${id}.pdf`, 'download');

  const handleDownloadVersionPdf = (versionNumber: number) =>
    openOrDownloadPdf(
      `/api/acts/${id}/versions/${versionNumber}/download/pdf`,
      `act_${id}_v${versionNumber}.pdf`,
      'download',
      versionNumber
    );

  const handleSendNotification = async () => {
    try {
      setSendingNotification(true);
      const res = await api.post(`/api/acts/${id}/send-notification`);
      showToast(res.data?.message || 'Уведомление отправлено получателям', 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Не удалось отправить уведомление';
      showToast(msg, 'error');
    } finally {
      setSendingNotification(false);
    }
  };

  const handleDeleteAct = async () => {
    try {
      setDeleting(true);
      await api.delete(`/api/acts/${id}`);
      showToast('Акт успешно удален', 'success');
      router.push('/acts');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Не удалось удалить акт';
      showToast(msg, 'error');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'Подтверждено передающей стороной',
      SIGNED_PARTY2: 'Подтверждено получателем',
      COMPLETED: 'Передача завершена',
      RETURN_INITIATED: 'Возврат инициирован',
      RETURN_SIGNED_PARTY1: 'Возврат подтвержден менеджером',
      RETURN_SIGNED_PARTY2: 'Возврат подтвержден получателем',
      RETURNED: 'Возврат завершен',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-200 text-gray-800',
      SIGNED_PARTY1: 'bg-yellow-200 text-yellow-800',
      SIGNED_PARTY2: 'bg-blue-200 text-blue-800',
      COMPLETED: 'bg-green-200 text-green-800',
      RETURN_INITIATED: 'bg-orange-100 text-orange-700',
      RETURN_SIGNED_PARTY1: 'bg-orange-100 text-orange-700',
      RETURN_SIGNED_PARTY2: 'bg-orange-100 text-orange-700',
      RETURNED: 'bg-emerald-200 text-emerald-800',
    };
    return colors[status] || 'bg-gray-200 text-gray-800';
  };

  const getIssueStep = (status: string, recipients: ActRecipient[]) => {
    const signedCount = getSignedRecipientsCount(recipients);
    const recipientsCount = recipients.length;

    if (status === 'DRAFT') {
      return signedCount === 0 ? 1 : Math.min(1 + signedCount, recipientsCount + 1);
    }
    if (status === 'SIGNED_PARTY2') return recipientsCount + 1;
    if (
      status === 'COMPLETED' ||
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return recipientsCount + 2;
    }
    return 1;
  };

  const getProgressText = (status: string, recipients: ActRecipient[]) => {
    if (status === 'COMPLETED') {
      return 'Обе стороны подписали акт. Документ завершен.';
    }
    if (
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 'Выдача завершена. Сейчас идет процесс возврата по этому акту.';
    }
    if (status === 'SIGNED_PARTY1') {
      return 'Менеджер подтвердил документ. Ожидается подпись получателя.';
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Все получатели подписали документ. Ожидается подтверждение менеджера.';
    }
    return `Акт создан и ожидает подписи получателей: ${getSignedRecipientsCount(recipients)} из ${recipients.length}.`;
  };

  const getSignedSides = (status: string, recipients: ActRecipient[]) => {
    if (status === 'SIGNED_PARTY1') {
      return { party1: true, party2: false };
    }
    if (status === 'SIGNED_PARTY2') {
      return { party1: false, party2: true };
    }
    if (
      status === 'COMPLETED' ||
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return { party1: true, party2: true };
    }
    return { party1: false, party2: recipients.every((recipient) => Boolean(recipient.signed_at)) };
  };

  const getReturnStep = (status: string) => {
    if (status === 'RETURN_INITIATED') return 4;
    if (status === 'RETURN_SIGNED_PARTY1' || status === 'RETURN_SIGNED_PARTY2') return 5;
    if (status === 'RETURNED') return 6;
    return null;
  };

  const getGlobalStep = (status: string, recipients: ActRecipient[]) => getReturnStep(status) ?? getIssueStep(status, recipients);

  const getReturnProgressText = (status: string) => {
    if (status === 'RETURNED') return 'Возврат завершен и подписан обеими сторонами.';
    if (status === 'RETURN_SIGNED_PARTY1') return 'Возврат подписан стороной 1. Нужна подпись стороны 2.';
    if (status === 'RETURN_SIGNED_PARTY2') return 'Возврат подписан стороной 2. Нужна подпись стороны 1.';
    return 'Возврат инициирован. Документ готов к подписанию сторонами.';
  };

  const startReturnFlow = async () => {
    if (!returnDate) {
      showToast('Укажите дату возврата', 'error');
      return;
    }

    setStartingReturn(true);
    try {
      await api.post(`/api/acts/${id}/return`, {
        return_date: returnDate,
        return_note: returnNote || null,
      });
      setReturnNote('');
      await fetchActAndVersions();
      showToast('Процесс возврата инициирован', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось начать возврат', 'error');
    } finally {
      setStartingReturn(false);
    }
  };

  const startEdit = () => {
    if (!act) return;
    const currentRecipients = normalizeActRecipients(act.extra_data_json, act.party2_name, act.receiver_email);
    setEditRecipients(
      currentRecipients.map((recipient) => ({
        participant_id: recipient.participant_id,
        full_name: recipient.full_name,
        email: recipient.email,
      }))
    );

    setEditMainEquipment({
      name: String(act.item_name ?? ''),
      serial: String(act.item_serial ?? ''),
      imei: String(act.extra_data_json?.imei ?? ''),
    });

    const extraEquipment = Array.isArray(act.extra_data_json?.equipment_list)
      ? (act.extra_data_json?.equipment_list as unknown[])
          .filter((item) => typeof item === 'object' && item !== null)
          .map((item) => {
            const typedItem = item as { name?: unknown; serial?: unknown; imei?: unknown };
            return {
              name: String(typedItem.name ?? ''),
              serial: String(typedItem.serial ?? ''),
              imei: String(typedItem.imei ?? ''),
            };
          })
      : [];
    setEditEquipmentItems(extraEquipment);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditRecipients([]);
    setEditMainEquipment({ name: '', serial: '', imei: '' });
    setEditEquipmentItems([]);
  };

  const addEditEquipmentItem = () => {
    setEditEquipmentItems((prev) => [...prev, { name: '', serial: '', imei: '' }]);
  };

  const updateEditEquipmentItem = (index: number, patch: Partial<EquipmentItem>) => {
    setEditEquipmentItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeEditEquipmentItem = (index: number) => {
    setEditEquipmentItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveEdit = async () => {
    if (!act) return;

    const normalizedRecipients = editRecipients
      .map((recipient) => ({
        participant_id: recipient.participant_id,
        full_name: recipient.full_name.trim(),
        email: recipient.email.trim(),
      }))
      .filter((recipient) => recipient.full_name && recipient.email);

    if (normalizedRecipients.length === 0) {
      showToast('Добавьте хотя бы одного получателя с ФИО и email', 'error');
      return;
    }

    if (!editMainEquipment.name.trim() || !editMainEquipment.serial.trim() || !(editMainEquipment.imei || '').trim()) {
      showToast('Для основного iPad заполните Student name, iPad Tag и IMEI', 'error');
      return;
    }

    const normalizedEquipment = editEquipmentItems
      .map((item) => ({
        name: item.name.trim(),
        serial: item.serial.trim(),
        imei: item.imei?.trim() || '',
      }))
      .filter((item) => item.name || item.serial || item.imei);

    const existingExtra = (act.extra_data_json || {}) as Record<string, unknown>;
    const payloadExtraData: Record<string, unknown> = {};
    Object.entries(existingExtra).forEach(([key, value]) => {
      if (key !== 'recipients' && key !== 'equipment_list' && key !== 'imei') {
        payloadExtraData[key] = value;
      }
    });
    payloadExtraData.recipients = normalizedRecipients;
    payloadExtraData.imei = (editMainEquipment.imei || '').trim();
    if (normalizedEquipment.length > 0) {
      payloadExtraData.equipment_list = normalizedEquipment;
    }

    try {
      setSavingEdit(true);
      await api.patch(`/api/acts/${act.id}`, {
        item_name: editMainEquipment.name.trim(),
        item_serial: editMainEquipment.serial.trim(),
        extra_data_json: payloadExtraData,
      });
      await fetchActAndVersions();
      setEditing(false);
      showToast('iPad акт обновлен', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Не удалось обновить акт', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-10">Загрузка...</div>
      </AdminLayout>
    );
  }

  if (error || !act) {
    return (
      <AdminLayout>
        <div className="bg-red-100 text-red-700 p-4 rounded">{error || 'Акт не найден'}</div>
      </AdminLayout>
    );
  }

  const recipients = normalizeActRecipients(act.extra_data_json, act.party2_name, act.receiver_email);
  const issueStep = getIssueStep(act.status, recipients);
  const globalStep = getGlobalStep(act.status, recipients);
  const returnStep = getReturnStep(act.status);
  const isReturnStatus =
    act.status === 'RETURN_INITIATED' ||
    act.status === 'RETURN_SIGNED_PARTY1' ||
    act.status === 'RETURN_SIGNED_PARTY2' ||
    act.status === 'RETURNED';
  const canStartReturn = act.status === 'COMPLETED';
  const party1Meta = getSignButtonMeta('party1', act.status);
  const party2Meta = getSignButtonMeta('party2', act.status);
  const signingSteps = getSigningSteps(act.status, recipients);
  const signedSides = getSignedSides(act.status, recipients);
  const progressItems = [
    { step: 1, title: 'Шаг 1', subtitle: 'Черновик' },
    ...recipients.map((recipient, index) => ({
      step: 2 + index,
      title: `Шаг ${2 + index}`,
      subtitle: `Подпись ${recipient.full_name}`,
    })),
    { step: 2 + recipients.length, title: `Шаг ${2 + recipients.length}`, subtitle: 'Финальная подпись стороны 1' },
  ];
  const equipmentList: EquipmentItem[] = Array.isArray(act.extra_data_json?.equipment_list)
    ? (act.extra_data_json?.equipment_list as unknown[])
        .filter((item) => typeof item === 'object' && item !== null)
        .map((item) => {
          const typedItem = item as { name?: unknown; serial?: unknown; imei?: unknown };
          return {
            name: String(typedItem.name ?? ''),
            serial: String(typedItem.serial ?? ''),
            imei: String(typedItem.imei ?? ''),
          };
        })
    : [];
  const mergedEquipmentList: Array<EquipmentItem & { source: string }> = [
    {
      name: String(act.item_name ?? ''),
      serial: String(act.item_serial ?? ''),
      imei: String(act.extra_data_json?.imei ?? ''),
      source: 'Основное',
    },
    ...equipmentList.map((item) => ({
      ...item,
      source: 'Доп.',
    })),
  ].filter((item) => item.name || item.serial || item.imei);
  const isIpadTemplate = template?.code === 'IPAD';
  const isAdminUser = (user?.role || '').toUpperCase() === 'ADMIN';
  const canEditIpadDraft = isAdminUser && isIpadTemplate && act.status === 'DRAFT';
  const employees = participants.filter((participant) => participant.kind === 'EMPLOYEE' || participant.kind === 'BOTH');
  const ipadEquipmentColumns = isIpadTemplate && mergedEquipmentList.length >= 4
    ? [
        mergedEquipmentList.slice(0, Math.ceil(mergedEquipmentList.length / 2)),
        mergedEquipmentList.slice(Math.ceil(mergedEquipmentList.length / 2)),
      ]
    : [mergedEquipmentList];
  const advisoryNote = String(act.extra_data_json?.advisory_note ?? '').trim();
  const extraEntries = Object.entries(act.extra_data_json || {}).filter(
    ([key]) => key !== 'equipment_list' && key !== 'recipients' && key !== 'advisory_note'
  );
  const party1Email = participants.find((participant) => participant.full_name === act.party1_name)?.email || '—';
  const party2Email = recipients.map((recipient) => recipient.email).filter(Boolean).join(', ') || act.receiver_email || '—';
  const currentSigningStep = signingSteps.find((step) => step.state === 'current') || null;
  const currentSigningMeta = currentSigningStep
    ? currentSigningStep.party === 'party1'
      ? party1Meta
      : party2Meta
    : null;
  const currentActionTitle = currentSigningStep
    ? currentSigningStep.party === 'party1'
      ? isReturnStatus
        ? 'Сейчас ожидается подтверждение менеджера по возврату'
        : 'Сейчас ожидается подтверждение менеджера'
      : isReturnStatus
      ? 'Сейчас ожидается подтверждение получателя по возврату'
      : 'Сейчас ожидается подпись получателя'
    : null;
  const currentActionDescription = currentSigningStep
    ? currentSigningStep.party === 'party1'
      ? isReturnStatus
        ? 'Получатели смогут завершить возврат после подтверждения менеджера.'
        : 'После подписей получателей менеджер завершает процесс выдачи.'
      : isReturnStatus
      ? 'После подтверждения получателя возврат будет завершен.'
      : 'Получатель подтверждает получение техники перед финальным подтверждением менеджера.'
    : getSigningHint(act.status, recipients);
  const progressList = isReturnStatus
    ? [
        { step: 4, title: 'Возврат инициирован', state: 'done' as const },
        {
          step: 5,
          title: 'Подтверждение менеджера',
          state:
            act.status === 'RETURN_INITIATED'
              ? 'current'
              : act.status === 'RETURN_SIGNED_PARTY1' || act.status === 'RETURNED'
              ? 'done'
              : 'pending',
        },
        {
          step: 6,
          title: recipients.length > 1 ? 'Подтверждения получателей' : 'Подтверждение получателя',
          state: act.status === 'RETURNED' ? 'done' : act.status === 'RETURN_SIGNED_PARTY1' ? 'current' : 'pending',
        },
      ]
    : [
        { step: 1, title: 'Акт создан', state: 'done' as const },
        {
          step: 2,
          title: recipients.length > 1 ? 'Подписи получателей' : 'Подпись получателя',
          state: act.status === 'DRAFT' ? 'current' : recipients.every((recipient) => recipient.signed_at) ? 'done' : 'current',
        },
        {
          step: 3,
          title: 'Подтверждение менеджера',
          state: act.status === 'COMPLETED' ? 'done' : act.status === 'SIGNED_PARTY2' ? 'current' : 'pending',
        },
      ];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Акт"
          title="Просмотр акта"
          description="Проверьте детали документа, следите за статусом подписания, работайте с PDF и запускайте возврат техники при завершении выдачи."
          actions={
            <>
              {canEditIpadDraft && !editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700"
                >
                  Редактировать
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadCurrentPdf}
                disabled={pdfLoading !== null}
                className="rounded-xl bg-white px-4 py-3 font-medium text-slate-900 transition hover:bg-slate-100"
              >
                {pdfLoading === 'download' ? 'Скачивание...' : 'Скачать PDF'}
              </button>
              {isAdminUser && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="rounded-xl border border-red-300 bg-red-600 px-4 py-3 font-medium text-white transition hover:bg-red-700"
                >
                  Удалить
                </button>
              )}
            </>
          }
        />

        <div className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SurfaceCard className="p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Текущий статус</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">{getCurrentFlowLabel(act.status)}</h2>
                <p className="mt-1 text-sm font-medium text-blue-700">{getCurrentFlowLabel(act.status)}</p>
                <p className="mt-2 text-sm text-gray-600">{getProgressText(act.status, recipients)}</p>
              </div>
              <StatusPill status={act.status} label={getStatusLabel(act.status)} />
            </div>

            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-700 via-blue-600 to-emerald-600 transition-all duration-300"
                 style={{ width: `${(issueStep / progressItems.length) * 100}%` }}
              />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-600">Подтверждения:</span>
              <span
                className={`rounded px-2 py-1 ${
                  signedSides.party1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Менеджер: {signedSides.party1 ? 'подтверждено' : 'ожидается'}
              </span>
              <span
                className={`rounded px-2 py-1 ${
                  signedSides.party2 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Получатель: {signedSides.party2 ? 'подтверждено' : 'ожидается'}
              </span>
              <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                 {getIssuedFlowSideText(act.status)}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {progressList.map((item) => {
                const isDone = item.state === 'done';
                const isCurrent = item.state === 'current';

                return (
                  <div
                    key={item.step}
                    className={`rounded border p-3 ${
                      isCurrent
                        ? 'border-blue-300 bg-blue-50'
                        : isDone
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          isCurrent
                            ? 'bg-blue-600 text-white'
                            : isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-300 text-gray-700'
                          }`}
                      >
                        {isDone && !isCurrent ? '✓' : item.step}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500">
                          {isDone ? 'Завершено' : isCurrent ? 'Текущий этап' : 'Ожидается'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>

          {(canStartReturn || isReturnStatus) && (
            <SurfaceCard className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Процесс возврата</p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900">
                    {isReturnStatus ? 'Возврат в процессе' : 'Возврат техники'}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    {isReturnStatus
                      ? getReturnProgressText(act.status)
                      : 'После завершения выдачи можно инициировать возврат на этом же акте.'}
                  </p>
                </div>
                {act.return_date && (
                  <span className="rounded bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
                    Возврат: {new Date(act.return_date).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>

              {!isReturnStatus ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Дата возврата</label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Комментарий возврата</label>
                    <input
                      type="text"
                      value={returnNote}
                      onChange={(e) => setReturnNote(e.target.value)}
                      placeholder="Например: техника возвращена в хорошем состоянии"
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={startReturnFlow}
                    disabled={startingReturn}
                    className="w-full rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 disabled:bg-gray-400"
                  >
                    {startingReturn ? 'Запуск...' : 'Начать возврат'}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-600 transition-all duration-300"
                      style={{ width: `${returnStep ? ((returnStep - 3) / 3) * 100 : 0}%` }}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { step: 4, title: 'Возврат инициирован', subtitle: 'Запуск процесса возврата' },
                      { step: 5, title: 'Подтверждение менеджера', subtitle: 'Менеджер принимает возврат' },
                      { step: 6, title: 'Подтверждение получателя', subtitle: 'Получатель завершает возврат' },
                    ].map((item) => {
                      const step = returnStep || 4;
                      const isDone = step >= item.step;
                      const isCurrent = step === item.step;
                      return (
                        <div
                          key={item.step}
                          className={`rounded border p-3 ${
                            isCurrent
                              ? 'border-orange-300 bg-orange-50'
                              : isDone
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <div
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                isCurrent
                                  ? 'bg-orange-600 text-white'
                                  : isDone
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-gray-300 text-gray-700'
                              }`}
                            >
                              {isDone && !isCurrent ? '✓' : item.step}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                              <p className="text-xs text-gray-500">{item.subtitle}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {act.return_note && (
                    <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      Комментарий возврата: {act.return_note}
                    </p>
                  )}
                </div>
              )}
            </SurfaceCard>
          )}
        </div>

        <SurfaceCard className="p-6 mb-6">
          {editing && canEditIpadDraft && (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-emerald-900">Редактирование iPad акта</h3>
                  <p className="text-sm text-emerald-800">Можно менять получателей и список iPad. Поля для эдвайзери остаются без изменений.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingEdit}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={savingEdit}
                    className="rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingEdit ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <RecipientsEditor
                  recipients={editRecipients}
                  employees={employees}
                  onChange={setEditRecipients}
                  maxRecipients={template?.schema_json?.max_recipients}
                />
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-gray-800">Инвентарные номера iPad</h4>
                  <button
                    type="button"
                    onClick={addEditEquipmentItem}
                    className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
                  >
                    Добавить iPad
                  </button>
                </div>

                <div className="hidden gap-2 border-b border-gray-200 pb-1 text-xs font-medium uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[1fr_1fr_1fr_auto]">
                  <span>Student name</span>
                  <span>iPad Tag</span>
                  <span>IMEI</span>
                  <span className="text-right">Действие</span>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                  <input
                    type="text"
                    value={editMainEquipment.name}
                    onChange={(e) => setEditMainEquipment((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Student name *"
                  />
                  <input
                    type="text"
                    value={editMainEquipment.serial}
                    onChange={(e) => setEditMainEquipment((prev) => ({ ...prev, serial: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="iPad Tag *"
                  />
                  <input
                    type="text"
                    value={editMainEquipment.imei || ''}
                    onChange={(e) => setEditMainEquipment((prev) => ({ ...prev, imei: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="IMEI *"
                  />
                  <span className="inline-flex h-[34px] items-center justify-center rounded bg-slate-100 px-3 text-xs font-medium text-slate-700">
                    Основное
                  </span>
                </div>

                {editEquipmentItems.map((item, index) => (
                  <div key={`edit-item-${index}`} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateEditEquipmentItem(index, { name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Student name"
                    />
                    <input
                      type="text"
                      value={item.serial}
                      onChange={(e) => updateEditEquipmentItem(index, { serial: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="iPad Tag"
                    />
                    <input
                      type="text"
                      value={item.imei || ''}
                      onChange={(e) => updateEditEquipmentItem(index, { imei: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="IMEI"
                    />
                    <button
                      type="button"
                      onClick={() => removeEditEquipmentItem(index)}
                      className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
                    >
                      Удалить
                    </button>
                  </div>
                ))}

                {editEquipmentItems.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">Дополнительных позиций пока нет.</p>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <StatusPill status={act.status} label={getStatusLabel(act.status)} />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {template && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Шаблон</h3>
                <p className="text-lg">{template.name} ({template.code})</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">ID акта</h3>
              <p className="text-lg">{act.id}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Дата выдачи</h3>
              <p className="text-lg">{new Date(act.issue_date).toLocaleDateString('ru-RU')}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Дата возврата</h3>
              <p className="text-lg">{act.return_date ? new Date(act.return_date).toLocaleDateString('ru-RU') : '—'}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Менеджер</h3>
              <p className="text-lg">{act.party1_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Получатели</h3>
               <div className="space-y-2">
                 {recipients.map((recipient, index) => (
                   <div key={`${recipient.full_name}-${recipient.email}-${index}`} className="rounded border border-gray-200 px-3 py-2 text-sm">
                     <p className="font-medium text-gray-900">{recipient.full_name}</p>
                     <p className="text-gray-600">{recipient.email || '—'}</p>
                     <p className="text-xs text-gray-500 mt-1">
                       Выдача: {recipient.signed_at ? 'подписано' : 'ожидается'}
                       {' | '}
                       Возврат: {recipient.return_signed_at ? 'подписано' : 'ожидается'}
                     </p>
                   </div>
                 ))}
               </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Email менеджера</h3>
              <p className="text-lg">{party1Email}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Email получателей</h3>
              <p className="text-lg">{party2Email}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Шаг</h3>
              <p className="text-lg">{globalStep}</p>

              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Статус</h3>
                <p className="text-lg">{getStatusLabel(act.status)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Создан</h3>
              <p className="text-lg">{new Date(act.created_at).toLocaleString('ru-RU')}</p>

              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Обновлен</h3>
                <p className="text-lg">{new Date(act.updated_at).toLocaleString('ru-RU')}</p>
              </div>
            </div>

            {mergedEquipmentList.length > 0 && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  {isIpadTemplate ? 'Инвентарные номера iPad' : 'Оборудование'}
                </h3>
                {isIpadTemplate && advisoryNote && (
                  <p className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <span className="font-medium text-gray-900">Поля для эдвайзери:</span> {advisoryNote}
                  </p>
                )}
                {isIpadTemplate ? (
                  <div className={`grid gap-4 ${ipadEquipmentColumns.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                    {ipadEquipmentColumns.map((columnItems, columnIndex) => {
                      const startIndex = columnIndex === 0 ? 0 : Math.ceil(mergedEquipmentList.length / 2);
                      return (
                        <div key={`ipad-column-${columnIndex}`} className="overflow-hidden rounded border border-gray-200">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="w-16 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">№</th>
                                <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">
                                  Student name
                                </th>
                                <th className="w-56 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">
                                  iPad Tag
                                </th>
                                <th className="w-48 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">
                                  IMEI
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {columnItems.map((item, index) => (
                                <tr key={`${item.name}-${item.serial}-${item.source}-${startIndex + index}`}>
                                  <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{startIndex + index + 1}</td>
                                  <td className="border-b border-gray-100 px-3 py-2 text-gray-900">{item.name || '—'}</td>
                                  <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{item.serial || '—'}</td>
                                  <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{item.imei || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-16 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">№</th>
                          <th className="w-24 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">Тип</th>
                          <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">
                            Наименование
                          </th>
                          <th className="w-56 border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">
                            Серийный номер
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {mergedEquipmentList.map((item, index) => (
                          <tr key={`${item.name}-${item.serial}-${item.source}-${index}`}>
                            <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{index + 1}</td>
                            <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{item.source}</td>
                            <td className="border-b border-gray-100 px-3 py-2 text-gray-900">{item.name || '—'}</td>
                            <td className="border-b border-gray-100 px-3 py-2 text-gray-700">{item.serial || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {extraEntries.length > 0 && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Дополнительные поля</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {extraEntries.map(([key, value]) => {
                    const fieldLabel =
                      template?.schema_json?.fields?.find((field) => field.name === key)?.label || key;
                    return (
                      <div key={key} className="rounded border border-gray-200 px-3 py-2">
                        <p className="text-xs text-gray-500">{fieldLabel}</p>
                        <p className="text-sm text-gray-900">{String(value)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SurfaceCard>

        <div className="mb-6 rounded bg-white shadow">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-lg font-semibold">Предпросмотр PDF</h2>
            {!pdfPreviewUrl ? (
              <button
                type="button"
                onClick={handlePreviewCurrentPdf}
                disabled={pdfLoading !== null}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pdfLoading === 'preview' ? 'Загрузка...' : 'Открыть предпросмотр'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (pdfPreviewUrl) {
                    URL.revokeObjectURL(pdfPreviewUrl);
                  }
                  setPdfPreviewUrl(null);
                }}
                className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Закрыть предпросмотр
              </button>
            )}
          </div>
          {pdfPreviewUrl && (
            <iframe
              src={pdfPreviewUrl}
              title="PDF preview"
              className="h-[720px] w-full rounded-b"
            />
          )}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          {shouldShowSigningBlock && (
            <div className="rounded bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">Текущее действие</h2>

              {error && (
                <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Что нужно сделать сейчас</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{currentActionTitle || 'Подписания сейчас не требуются'}</h3>
                {currentSigningStep && (
                  <p className="mt-1 text-sm text-slate-700">{currentSigningStep.description}</p>
                )}
                <p className="mt-2 text-sm text-slate-600">{currentActionDescription}</p>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSignatureMode('draw')}
                  className={`rounded px-3 py-2 text-sm ${
                    signatureMode === 'draw'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Рисовать подпись
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureMode('upload')}
                  className={`rounded px-3 py-2 text-sm ${
                    signatureMode === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Загрузить подпись
                </button>
              </div>

              {signatureMode === 'draw' ? (
                <SignaturePad
                  onSave={(signature) => setSignatureData(signature)}
                  onClear={() => setSignatureData('')}
                />
              ) : (
                <SignatureUpload onUpload={handleUploadedSignature} />
              )}

              {currentSigningStep && currentSigningMeta ? (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Активный этап</p>
                      <p className="text-sm font-semibold text-gray-900">{currentSigningStep.title}</p>
                    </div>
                    <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">Текущий шаг</span>
                  </div>

                  <button
                    type="button"
                    disabled={signing || !signatureData}
                    onClick={() => signAct(currentSigningStep.party)}
                    className={`w-full rounded px-4 py-2 text-sm text-white disabled:bg-gray-400 ${
                      currentSigningStep.party === 'party1'
                        ? currentSigningMeta.highlight
                          ? 'bg-amber-700 hover:bg-amber-800'
                          : 'bg-amber-600 hover:bg-amber-700'
                        : currentSigningMeta.highlight
                        ? 'bg-emerald-700 hover:bg-emerald-800'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {signing ? 'Подписание...' : currentSigningMeta.label}
                  </button>
                  <p className="mt-2 text-xs text-gray-600">{currentSigningMeta.hint}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Все необходимые подписи на текущем этапе уже собраны.
                </div>
              )}

              <p className="mt-4 text-sm text-gray-600">{getSigningHint(act.status, recipients)}</p>

              <p className="mt-2 text-sm text-gray-600">
                Текущий пользователь: {user?.full_name || user?.email || '—'}
              </p>
            </div>
          )}

          <div className="rounded bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">История действий</h2>
              {isAdminUser && (
                <button
                  type="button"
                  onClick={handleSendNotification}
                  disabled={sendingNotification}
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {sendingNotification ? 'Отправка...' : 'Отправить уведомление'}
                </button>
              )}
            </div>

            {versions.length === 0 ? (
              <p className="text-gray-600">История действий пока пуста</p>
            ) : (
              <div className="space-y-3">
                {versions.map((version) => (
                  <div key={version.id} className="rounded border border-gray-200 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <span className="font-medium text-slate-900">{getHumanVersionTitle(version.version_number, version.change_note)}</span>
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleString('ru-RU')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-auto">
                        <span className="text-xs text-gray-500">
                          Версия {version.version_number}
                        </span>
                        {version.pdf_file_id && (
                          <button
                            type="button"
                            onClick={() => handleDownloadVersionPdf(version.version_number)}
                            disabled={versionPdfLoading === version.version_number}
                            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                          >
                            {versionPdfLoading === version.version_number ? '...' : 'PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                    {normalizeChangeNote(version.change_note) && (
                      <p className="mt-2 text-sm text-gray-700">{normalizeChangeNote(version.change_note)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(issueEmailReady || returnEmailReady) && (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">Статус автоматической отправки PDF</p>
                {issueEmailReady && (
                  <p className="mt-1 text-slate-700">
                    Выдача: {act.issue_completion_email_sent ? 'отправлено автоматически' : 'ожидает/ошибка отправки'}
                  </p>
                )}
                {returnEmailReady && (
                  <p className="mt-1 text-slate-700">
                    Возврат: {act.return_completion_email_sent ? 'отправлено автоматически' : 'ожидает/ошибка отправки'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Удалить акт?"
        message="Вы уверены, что хотите удалить этот акт? Это действие нельзя отменить."
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={handleDeleteAct}
        onCancel={() => setShowDeleteModal(false)}
        isLoading={deleting}
      />
    </AdminLayout>
  );
}
