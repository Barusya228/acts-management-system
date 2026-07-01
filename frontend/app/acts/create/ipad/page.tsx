'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateIpad() {
  const router = useRouter();
  useEffect(() => { router.replace('/acts/create?code=IPAD'); }, [router]);
  return null;
}
