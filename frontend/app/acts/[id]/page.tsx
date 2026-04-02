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
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureData, setSignatureData] = useState<string>('');
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

  const canSignParty1 = act?.status === 'DRAFT';
  const canSignParty2 = act?.status === 'DRAFT' || act?.status === 'SIGNED_PARTY1';

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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'Подписано стороной 1',
      SIGNED_PARTY2: 'Подписано стороной 2',
      COMPLETED: 'Завершено',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-200 text-gray-800',
      SIGNED_PARTY1: 'bg-yellow-200 text-yellow-800',
      SIGNED_PARTY2: 'bg-blue-200 text-blue-800',
      COMPLETED: 'bg-green-200 text-green-800',
    };
    return colors[status] || 'bg-gray-200 text-gray-800';
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Просмотр акта</h1>
          <div className="flex gap-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/acts/${act.id}/preview/pdf`}
              target="_blank"
              rel="noreferrer"
              className="bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-800"
            >
              Предпросмотр PDF
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/acts/${act.id}/download/pdf`}
              download
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
            >
              Скачать PDF
            </a>
            <Link
              href={`/acts/${act.id}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Редактировать
            </Link>
            <Link href="/" className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
              Назад к списку
            </Link>
          </div>
        </div>

        <div className="bg-white rounded shadow p-6">
          <div className="mb-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(act.status)}`}>
              {getStatusLabel(act.status)}
            </span>
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
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
                className="rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:bg-gray-400"
              >
                {signing ? 'Подписание...' : 'Подписать стороной 1'}
              </button>

              <button
                type="button"
                disabled={!canSignParty2 || signing || !signatureData}
                onClick={() => signAct('party2')}
                className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:bg-gray-400"
              >
                {signing ? 'Подписание...' : 'Подписать стороной 2'}
              </button>
            </div>

            <p className="mt-3 text-sm text-gray-600">
              Текущий пользователь: {user?.full_name || user?.email || '—'}
            </p>
          </div>

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
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/acts/${act.id}/versions/${version.version_number}/download/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                          >
                            PDF
                          </a>
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
