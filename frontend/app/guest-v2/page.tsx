'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuestV2Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/guest');
  }, [router]);

  return null;
}
