'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateActV2Redirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/acts/create' + window.location.search);
  }, [router]);

  return null;
}
