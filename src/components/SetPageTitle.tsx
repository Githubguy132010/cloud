'use client';

import { useEffect } from 'react';
import { usePageTitle } from '@/contexts/PageTitleContext';

/** Renders nothing. Sets the topbar page title via context. */
export function SetPageTitle({ title }: { title: string }) {
  const { setTitle } = usePageTitle();
  useEffect(() => {
    setTitle(title);
    return () => setTitle('');
  }, [title, setTitle]);
  return null;
}
