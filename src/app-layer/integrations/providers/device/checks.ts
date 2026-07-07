/**
 * Device posture checks (PR-5) — pure functions over the device inventory.
 *
 * THREE-STATE booleans: true (pass), false (fail), null (NOT_APPLICABLE — e.g.
 * LINUX has no screen-lock check). Null is NEVER a fail; it is excluded from
 * both the pass and fail tallies. A check PASSES when no applicable device
 * fails.
 */
import type { CheckResult } from '../../types';

export interface CheckDevice {
    serialNumber: string | null;
    hostname: string | null;
    platform: string;
    diskEncrypted: boolean | null;
    screenLockEnabled: boolean | null;
    antivirusRunning: boolean | null;
    passwordManagerPresent: boolean | null;
}

export const DEVICE_CHECKS = ['devices_encrypted', 'devices_screenlock', 'devices_antivirus', 'devices_password_manager'] as const;
export type DeviceCheckType = (typeof DEVICE_CHECKS)[number];

const FIELD: Record<DeviceCheckType, keyof CheckDevice> = {
    devices_encrypted: 'diskEncrypted',
    devices_screenlock: 'screenLockEnabled',
    devices_antivirus: 'antivirusRunning',
    devices_password_manager: 'passwordManagerPresent',
};

function ref(d: CheckDevice): string {
    return d.serialNumber || d.hostname || 'unknown-device';
}

export function runDeviceCheck(checkType: string, devices: CheckDevice[], now: Date): CheckResult {
    void now;
    const field = FIELD[checkType as DeviceCheckType];
    if (!field) {
        return { status: 'ERROR', summary: `Unknown device check: ${checkType}`, details: {}, errorMessage: `Unsupported ${checkType}` };
    }
    let passed = 0;
    let notApplicable = 0;
    const failed: Array<{ ref: string; reason: string }> = [];
    for (const d of devices) {
        const v = d[field] as boolean | null;
        if (v === null || v === undefined) {
            notApplicable += 1; // NOT_APPLICABLE — excluded from pass/fail
        } else if (v === true) {
            passed += 1;
        } else {
            failed.push({ ref: ref(d), reason: `${checkType} = false` });
        }
    }
    // H2 — if no device has an applicable (non-N/A) value for this field, the
    // check has no population to judge: NOT_APPLICABLE, not a green PASSED.
    const applicable = passed + failed.length;
    return {
        status: applicable === 0 ? 'NOT_APPLICABLE' : failed.length === 0 ? 'PASSED' : 'FAILED',
        summary: applicable === 0
            ? `No devices with an applicable ${checkType} value (${notApplicable} n/a)`
            : failed.length === 0 ? `${passed} device(s) pass ${checkType} (${notApplicable} n/a)` : `${failed.length}/${applicable} device(s) fail ${checkType}`,
        details: { check: checkType, passed, failed: failed.length, notApplicable, items: failed.slice(0, 500) },
    };
}
