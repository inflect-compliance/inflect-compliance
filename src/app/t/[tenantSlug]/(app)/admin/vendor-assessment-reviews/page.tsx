/**
 * Epic G-3 — vendor assessment review queue (admin index).
 *
 * Lists every G-3 assessment that has reached the reviewable /
 * reviewed set (SUBMITTED / REVIEWED / CLOSED). Click a row to open
 * the reviewer page.
 */
import { VendorAssessmentReviewsQueueClient } from './VendorAssessmentReviewsQueueClient';

export const dynamic = 'force-dynamic';

export default function VendorAssessmentReviewsQueuePage() {
    return <VendorAssessmentReviewsQueueClient />;
}
