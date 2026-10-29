'use client';

import { useEffect } from 'react';

/** Register /sw.js once — gives the app an offline page shell. */
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
