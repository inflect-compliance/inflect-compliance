'use client';

/**
 * ep1 evidence review gate — required-reason prompt for rejecting
 * evidence.
 *
 * A reviewer's rejection must carry a real reason: the reason is
 * persisted to `EvidenceReview.comment` and surfaced to the evidence
 * owner in the rejection notification. Both the list-row reject
 * affordance and the detail-sheet reject button open this modal so the
 * comment is never hardcoded or dropped. Submit is disabled until the
 * reviewer types a non-whitespace reason.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';

export interface RejectReasonModalProps {
    open: boolean;
    /** Close without rejecting. */
    onClose: () => void;
    /** Confirm — receives the trimmed, non-empty reason. */
    onConfirm: (reason: string) => void;
}

export function RejectReasonModal({ open, onClose, onConfirm }: RejectReasonModalProps) {
    const t = useTranslations('evidence');
    const [reason, setReason] = useState('');

    // Reset the field each time the modal (re)opens.
    useEffect(() => {
        if (open) setReason('');
    }, [open]);

    const trimmed = reason.trim();
    const canSubmit = trimmed.length > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        onConfirm(trimmed);
        onClose();
    };

    return (
        <Modal
            showModal={open}
            setShowModal={(v) => {
                const next = typeof v === 'function' ? v(open) : v;
                if (!next) onClose();
            }}
            size="md"
            title={t('reject.title')}
            description={t('reject.description')}
        >
            <Modal.Header
                title={t('reject.title')}
                description={t('reject.description')}
            />
            <Modal.Form id="evidence-reject-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    <FormField label={t('reject.reasonLabel')} required>
                        <Textarea
                            id="evidence-reject-reason"
                            className="h-24"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('reject.reasonPlaceholder')}
                            autoFocus
                            required
                        />
                    </FormField>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                        id="evidence-reject-cancel-btn"
                    >
                        {t('reject.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!canSubmit}
                        id="evidence-reject-submit-btn"
                    >
                        {t('reject.confirm')}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
