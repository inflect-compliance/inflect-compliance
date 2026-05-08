/**
 * Clauses loading skeleton — shown via Next.js Suspense while
 * the server component fetches clause data. Token-backed so the
 * skeleton surfaces re-theme automatically under light mode.
 */
export default function ClausesLoading() {
    return (
        <div className="animate-pulse space-y-section p-6">
            {/* Page title */}
            <div className="h-8 bg-bg-muted rounded w-1/4" />

            {/* Split pane: list + detail */}
            <div className="flex gap-default">
                {/* Clause list */}
                <div className="w-1/3 space-y-tight">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="rounded border border-border-default p-3 space-y-tight">
                            <div className="h-4 bg-bg-muted rounded w-3/4" />
                            <div className="h-3 bg-bg-muted rounded w-1/2" />
                        </div>
                    ))}
                </div>

                {/* Detail panel */}
                <div className="w-2/3 rounded-lg border border-border-default p-5 space-y-default">
                    <div className="h-6 bg-bg-muted rounded w-1/2" />
                    <div className="h-4 bg-bg-muted rounded w-full" />
                    <div className="h-4 bg-bg-muted rounded w-3/4" />
                    <div className="h-10 bg-bg-muted rounded w-40" />
                </div>
            </div>
        </div>
    );
}
