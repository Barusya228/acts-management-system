'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateMulti() {
  const router = useRouter();
  useEffect(() => { router.replace('/acts/create?code=GENERIC_MULTI'); }, [router]);
  return null;
}
