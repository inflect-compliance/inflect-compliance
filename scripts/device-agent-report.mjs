#!/usr/bin/env node
/**
 * PR-5 — Device-agent reporter STUB (reference implementation).
 *
 * A minimal example of the endpoint agent that POSTs device posture to
 * `/api/t/<slug>/devices/report`, authenticated by a per-tenant device token
 * (issue one under Admin → Device tokens, or via
 * `POST /api/t/<slug>/admin/device-tokens`).
 *
 * This is NOT a production OS agent — it does not gather real posture. Replace
 * the `collectPosture()` stub with platform-specific probes (e.g. `fdesetup`
 * / BitLocker WMI / `cryptsetup`). Booleans are THREE-STATE: send `null` for a
 * check that does not apply to the platform (never `false`).
 *
 * Usage:
 *   IC_BASE_URL=https://app.example.com \
 *   IC_TENANT_SLUG=acme \
 *   IC_DEVICE_TOKEN=icdt_... \
 *   node scripts/device-agent-report.mjs
 *
 * Report JSON schema: see docs/device-monitoring.md.
 */
import os from 'node:os';

function detectPlatform() {
    switch (os.platform()) {
        case 'darwin': return 'MACOS';
        case 'win32': return 'WINDOWS';
        default: return 'LINUX';
    }
}

/** STUB — replace with real platform probes. `null` = NOT_APPLICABLE. */
function collectPosture(platform) {
    return {
        serialNumber: os.hostname(), // replace with a real hardware serial
        hostname: os.hostname(),
        platform,
        diskEncrypted: null,
        screenLockEnabled: platform === 'LINUX' ? null : null,
        antivirusRunning: null,
        passwordManagerPresent: null,
    };
}

async function main() {
    const base = process.env.IC_BASE_URL;
    const slug = process.env.IC_TENANT_SLUG;
    const token = process.env.IC_DEVICE_TOKEN;
    if (!base || !slug || !token) {
        console.error('Set IC_BASE_URL, IC_TENANT_SLUG and IC_DEVICE_TOKEN.');
        process.exit(2);
    }
    const payload = collectPosture(detectPlatform());
    const res = await fetch(`${base.replace(/\/$/, '')}/api/t/${slug}/devices/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        console.error(`Report failed: HTTP ${res.status} ${await res.text()}`);
        process.exit(1);
    }
    console.log('Reported:', JSON.stringify(await res.json()));
}

main().catch((e) => { console.error(e); process.exit(1); });
