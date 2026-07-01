'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateOne() {
  const router = useRouter();
  useEffect(() => { router.replace('/acts/create?code=GENERIC_ONE'); }, [router]);
  return null;
}
