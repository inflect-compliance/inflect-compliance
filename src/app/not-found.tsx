import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { Heading } from '@/components/ui/typography';

/**
 * Global Not Found Boundary (404).
 * Polish PR-9 — uses semantic tokens + Button-variant Link instead
 * of hand-rolled gray utility classes / `transition-all`.
 */
export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-bg-page p-6">
            <div className="max-w-md w-full text-center space-y-section">
                <div className="text-content-emphasis font-semibold text-6xl tracking-tighter tabular-nums">
                    404
                </div>

                <div>
                    <Heading level={1} className="mb-3">
                        Page not found
                    </Heading>
                    <p className="text-sm text-content-muted">
                        Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have been removed or the link is incorrect.
                    </p>
                </div>

                <div className="pt-6">
                    <Link
                        href="/dashboard"
                        className={buttonVariants({ variant: 'primary' })}
                    >
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
