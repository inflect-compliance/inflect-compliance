'use client';

import { useEffect } from 'react';
import { initRum } from '@/lib/observability/rum';

/**
 * Mounts once at the app root and starts the Web Vitals beacon
 * (src/lib/observability/rum.ts). Renders nothing. `initRum` is
 * idempotent, so a StrictMode double-mount registers the listeners once.
 */
export function RumInit(): null {
    useEffect(() => {
        initRum();
    }, []);
    return null;
}
