'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';

export default function TemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.push('/');
    }
  }, [user, router]);

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Шаблоны актов</h1>
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Создать шаблон
          </button>
        </div>

        <div className="bg-white rounded shadow p-6">
          <p className="text-gray-600">
            Функционал управления шаблонами будет добавлен в следующей версии.
          </p>
          <p className="text-gray-600 mt-2">
            Здесь администраторы смогут создавать и редактировать шаблоны актов приема-передачи техники.
          </p>
        </div>
      </div>
    </Layout>
  );
}
