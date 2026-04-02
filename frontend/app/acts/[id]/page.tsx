'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import SignaturePad from '@/components/SignaturePad';
import SignatureUpload from '@/components/SignatureUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/ui/PageHeader';
import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';

interface Act {
  id: string;
  template_id: string;
  party1_name: string;
  party2_name: string;
  issue_date: string;
  item_name: string;
  item_serial: string;
  receiver_email: string;
  extra_data_json?: Record<string, string>;
  return_date?: string | null;
  return_note?: string | null;
  status: string;
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
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
  schema_json?: {
    fields?: Array<{
      name: string;
      type: string;
      label: string;
      required: boolean;
    }>;
  };
}

export default function ActViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [act, setAct] = useState<Act | null>(null);
  const [template, setTemplate] = useState<TemplateOption | null>(null);
  const [versions, setVersions] = useState<ActVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [startingReturn, setStartingReturn] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<'preview' | 'download' | null>(null);
  const [versionPdfLoading, setVersionPdfLoading] = useState<number | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState<string>('');
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
      const [actRes, versionsRes] = await Promise.all([
        api.get(`/api/acts/${id}`),
        api.get(`/api/acts/${id}/versions`),
      ]);
      setAct(actRes.data);
      setVersions(versionsRes.data || []);

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
  const shouldShowSigningBlock =
    act?.status === 'DRAFT' ||
    act?.status === 'SIGNED_PARTY1' ||
    act?.status === 'SIGNED_PARTY2' ||
    act?.status === 'RETURN_INITIATED' ||
    act?.status === 'RETURN_SIGNED_PARTY1' ||
    act?.status === 'RETURN_SIGNED_PARTY2';

  const getSignButtonMeta = (party: 'party1' | 'party2', status: string) => {
    if (party === 'party1') {
      if (status === 'SIGNED_PARTY2') {
        return { label: 'Выдача: подтверждение стороны 1', highlight: true };
      }
      if (status === 'SIGNED_PARTY1') {
        return { label: 'Сторона 1 уже подписала', highlight: false };
      }
      if (status === 'RETURN_INITIATED') {
        return { label: 'Возврат: первая подпись стороны 1', highlight: true };
      }
      if (status === 'RETURN_SIGNED_PARTY1') {
        return { label: 'Сторона 1 уже подтвердила возврат', highlight: false };
      }
      if (status === 'RETURN_SIGNED_PARTY2' || status === 'RETURNED') {
        return { label: 'Подпись стороны 1 недоступна', highlight: false };
      }
      return { label: 'Подпись недоступна', highlight: false };
    }

    if (status === 'DRAFT') {
      return { label: 'Выдача: первая подпись стороны 2', highlight: true };
    }
    if (status === 'SIGNED_PARTY1') {
      return { label: 'Завершить: подпись стороны 2', highlight: true };
    }
    if (status === 'SIGNED_PARTY2') {
      return { label: 'Сторона 2 уже подписала', highlight: false };
    }
    if (status === 'RETURN_SIGNED_PARTY1') {
      return { label: 'Возврат: подтверждение стороны 2', highlight: true };
    }
    if (status === 'RETURN_INITIATED') {
      return { label: 'Ожидается подпись стороны 1', highlight: false };
    }
    if (status === 'RETURN_SIGNED_PARTY2') {
      return { label: 'Сторона 2 уже подтвердила возврат', highlight: false };
    }
    return { label: 'Подпись недоступна', highlight: false };
  };

  const getSigningHint = (status: string) => {
    if (status === 'DRAFT') {
      return 'Выдача техники: сначала подписывает тот, кто получает технику (сторона 2).';
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Выдача техники: получатель уже подписал, теперь подтверждает передающая сторона (сторона 1).';
    }
    if (status === 'SIGNED_PARTY1') {
      return 'Текущий статус не соответствует целевому порядку подписания выдачи.';
    }
    if (status === 'RETURN_INITIATED') {
      return 'Возврат техники: сначала подписывает сторона 1, которая принимает возврат.';
    }
    if (status === 'RETURN_SIGNED_PARTY1') {
      return 'Возврат техники: первая подпись получена, теперь возврат подтверждает сторона 2.';
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
      return 'Сторона 1: ожидается | Сторона 2: первая подпись';
    }
    if (status === 'SIGNED_PARTY1') {
      return 'Сторона 1: подписано | Сторона 2: ожидается';
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Сторона 1: финальная подпись | Сторона 2: подписано';
    }
    if (
      status === 'COMPLETED' ||
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 'Сторона 1: подписано | Сторона 2: подписано';
    }
    return 'Сторона 1: ожидается | Сторона 2: ожидается';
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
      await api.post(`/api/acts/${id}/sign/${party}`, {
        signature_data: signatureData,
      });
      setSignatureData('');
      await fetchActAndVersions();
      showToast(party === 'party1' ? 'Акт подписан стороной 1' : 'Акт подписан стороной 2', 'success');
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'Подтверждено передающей стороной',
      SIGNED_PARTY2: 'Подтверждено получателем',
      COMPLETED: 'Передача завершена',
      RETURN_INITIATED: 'Возврат инициирован',
      RETURN_SIGNED_PARTY1: 'Возврат подтвержден стороной 1',
      RETURN_SIGNED_PARTY2: 'Возврат подтвержден стороной 2',
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

  const getProgressStep = (status: string) => {
    if (
      status === 'COMPLETED' ||
      status === 'RETURN_INITIATED' ||
      status === 'RETURN_SIGNED_PARTY1' ||
      status === 'RETURN_SIGNED_PARTY2' ||
      status === 'RETURNED'
    ) {
      return 2;
    }
    if (status === 'SIGNED_PARTY1' || status === 'SIGNED_PARTY2') return 1;
    return 0;
  };

  const getProgressText = (status: string) => {
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
      return 'Сторона 1 подписала документ. Ожидается вторая подпись.';
    }
    if (status === 'SIGNED_PARTY2') {
      return 'Сторона 2 подписала документ. Ожидается вторая подпись.';
    }
    return 'Акт создан и ожидает первую подпись.';
  };

  const getSignedSides = (status: string) => {
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
    return { party1: false, party2: false };
  };

  const getReturnProgressStep = (status: string) => {
    if (status === 'RETURNED') return 2;
    if (status === 'RETURN_SIGNED_PARTY1' || status === 'RETURN_SIGNED_PARTY2') return 1;
    if (status === 'RETURN_INITIATED') return 0;
    return null;
  };

  const getReturnDisplayStep = (status: string) => {
    const step = getReturnProgressStep(status);
    if (step === null) return null;
    return step + 1;
  };

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

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10">Загрузка...</div>
      </Layout>
    );
  }

  if (error || !act) {
    return (
      <Layout>
        <div className="bg-red-100 text-red-700 p-4 rounded">{error || 'Акт не найден'}</div>
      </Layout>
    );
  }

  const progressStep = getProgressStep(act.status);
  const isReturnStatus =
    act.status === 'RETURN_INITIATED' ||
    act.status === 'RETURN_SIGNED_PARTY1' ||
    act.status === 'RETURN_SIGNED_PARTY2' ||
    act.status === 'RETURNED';
  const canStartReturn = act.status === 'COMPLETED';
  const party1Meta = getSignButtonMeta('party1', act.status);
  const party2Meta = getSignButtonMeta('party2', act.status);
  const signedSides = getSignedSides(act.status);
  const progressItems = [
    { step: 0, title: 'Черновик', subtitle: 'Акт создан' },
    { step: 1, title: '1 подпись', subtitle: 'Одна сторона подписала' },
    { step: 2, title: '2 подписи', subtitle: 'Документ завершен' },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Акт"
          title="Просмотр акта"
          description="Проверьте детали документа, следите за статусом подписания, работайте с PDF и запускайте возврат техники при завершении выдачи."
          actions={
            <>
              <button
                type="button"
                onClick={handlePreviewCurrentPdf}
                disabled={pdfLoading !== null}
                className="rounded-xl bg-white px-4 py-3 font-medium text-slate-900 transition hover:bg-slate-100"
              >
                {pdfLoading === 'preview' ? 'Открываем PDF...' : 'Предпросмотр PDF'}
              </button>
              <button
                type="button"
                onClick={handleDownloadCurrentPdf}
                disabled={pdfLoading !== null}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/20"
              >
                {pdfLoading === 'download' ? 'Скачивание...' : 'Скачать PDF'}
              </button>
              <Link
                href={`/acts/${act.id}/edit`}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/20"
              >
                Редактировать
              </Link>
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <SurfaceCard className="p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Статус подписания</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">Шаг {progressStep} из 2</h2>
                <p className="mt-1 text-sm font-medium text-blue-700">{getCurrentFlowLabel(act.status)}</p>
                <p className="mt-2 text-sm text-gray-600">{getProgressText(act.status)}</p>
              </div>
              <StatusPill status={act.status} label={getStatusLabel(act.status)} />
            </div>

            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-700 via-blue-600 to-emerald-600 transition-all duration-300"
                style={{ width: `${(progressStep / 2) * 100}%` }}
              />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-600">Подписи сторон:</span>
              <span
                className={`rounded px-2 py-1 ${
                  signedSides.party1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Сторона 1: {signedSides.party1 ? 'подписано' : 'ожидается'}
              </span>
              <span
                className={`rounded px-2 py-1 ${
                  signedSides.party2 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Сторона 2: {signedSides.party2 ? 'подписано' : 'ожидается'}
              </span>
              <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                {getIssuedFlowSideText(act.status)}
              </span>
            </div>

            <div className="grid gap-3 grid-cols-3">
              {progressItems.map((item) => {
                const isDone = progressStep >= item.step;
                const isCurrent = progressStep === item.step;

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
                        <p className="text-xs text-gray-500">{item.subtitle}</p>
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
                    {isReturnStatus ? `Этап ${getReturnDisplayStep(act.status)} из 3` : 'Возврат техники'}
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
                      style={{ width: `${((getReturnProgressStep(act.status) || 0) / 2) * 100}%` }}
                    />
                  </div>

                  <div className="grid gap-3 grid-cols-3">
                    {[
                      { step: 0, title: 'Инициирован', subtitle: 'Возврат создан' },
                      { step: 1, title: '1 подпись', subtitle: 'Одна сторона подтвердила возврат' },
                      { step: 2, title: 'Возвращено', subtitle: 'Возврат завершен' },
                    ].map((item) => {
                      const step = getReturnProgressStep(act.status) || 0;
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
                              {isDone && !isCurrent ? '✓' : item.step + 1}
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
          <div className="mb-4">
            <StatusPill status={act.status} label={getStatusLabel(act.status)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <h3 className="text-sm font-medium text-gray-500 mb-1">Сторона 1 (Передающая)</h3>
              <p className="text-lg">{act.party1_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Сторона 2 (Получающая)</h3>
              <p className="text-lg">{act.party2_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Наименование техники</h3>
              <p className="text-lg">{act.item_name}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Серийный номер</h3>
              <p className="text-lg">{act.item_serial}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Email получателя</h3>
              <p className="text-lg">{act.receiver_email}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Версия</h3>
              <p className="text-lg">{act.current_version}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Создан</h3>
              <p className="text-lg">{new Date(act.created_at).toLocaleString('ru-RU')}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Обновлен</h3>
              <p className="text-lg">{new Date(act.updated_at).toLocaleString('ru-RU')}</p>
            </div>

            {act.extra_data_json && Object.keys(act.extra_data_json).length > 0 && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Дополнительные поля</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(act.extra_data_json).map(([key, value]) => {
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

        {pdfPreviewUrl && (
          <div className="mb-6 rounded bg-white shadow">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">Предпросмотр PDF</h2>
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
            </div>
            <iframe
              src={pdfPreviewUrl}
              title="PDF preview"
              className="h-[720px] w-full rounded-b"
            />
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {shouldShowSigningBlock && (
            <div className="rounded bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">Подписание акта</h2>

              {error && (
                <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mb-4 flex gap-2">
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canSignParty1 || signing || !signatureData}
                  onClick={() => signAct('party1')}
                  className={`rounded px-4 py-2 text-white disabled:bg-gray-400 ${
                    party1Meta.highlight ? 'bg-amber-700 hover:bg-amber-800' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {signing ? 'Подписание...' : party1Meta.label}
                </button>

                <button
                  type="button"
                  disabled={!canSignParty2 || signing || !signatureData}
                  onClick={() => signAct('party2')}
                  className={`rounded px-4 py-2 text-white disabled:bg-gray-400 ${
                    party2Meta.highlight ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {signing ? 'Подписание...' : party2Meta.label}
                </button>
              </div>

              <p className="mt-3 text-sm text-gray-600">{getSigningHint(act.status)}</p>

              <p className="mt-2 text-sm text-gray-600">
                Текущий пользователь: {user?.full_name || user?.email || '—'}
              </p>
            </div>
          )}

          <div className="rounded bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold">История версий</h2>

            {versions.length === 0 ? (
              <p className="text-gray-600">Версии пока отсутствуют</p>
            ) : (
              <div className="space-y-3">
                {versions.map((version) => (
                  <div key={version.id} className="rounded border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Версия {version.version_number}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleString('ru-RU')}
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
                    {version.change_note && (
                      <p className="mt-1 text-sm text-gray-700">{version.change_note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
