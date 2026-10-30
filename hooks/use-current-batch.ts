'use client';

import { useEffect, useState } from 'react';

export function useCurrentBatch() {
  const [batch, setBatch] = useState('150');
  useEffect(() => {
    let mounted = true;
    fetch('/api/transfers/airtable/archive', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (mounted && /^\d{1,6}$/.test(data?.currentBatch || '')) setBatch(data.currentBatch); })
      .catch(() => {});
    const changed = (event: Event) => {
      const next = (event as CustomEvent<{ batchNumber: string }>).detail?.batchNumber;
      if (/^\d{1,6}$/.test(next || '')) setBatch(next);
    };
    window.addEventListener('hawalat-batch-changed', changed);
    return () => { mounted = false; window.removeEventListener('hawalat-batch-changed', changed); };
  }, []);
  return batch;
}
