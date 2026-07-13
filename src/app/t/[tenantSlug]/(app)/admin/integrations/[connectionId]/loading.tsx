import { SkeletonCard } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="space-y-section">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={6} />
        </div>
    );
}
