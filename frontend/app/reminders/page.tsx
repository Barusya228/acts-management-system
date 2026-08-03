'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RemindersRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/reminders'); }, [router]);
  return null;
}
