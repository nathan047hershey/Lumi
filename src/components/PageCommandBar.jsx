import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Search and actions stay on one row. Long filter sets stay behind Filters
 * so list pages open as a search bar, not a wall of dropdowns.
 */
export default function PageCommandBar({
    search,
    filters,
    actions,
    chips,
    collapseFilters = false,
    className
}) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const showFilters = Boolean(filters) && (!collapseFilters || filtersOpen);
    const showTools = Boolean(actions) || (collapseFilters && filters);
    const compact = !search && !showFilters && !chips;

    if (compact) {
        if (!showTools) return null;
        return (
            <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
                {collapseFilters && filters ? (
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((open) => !open)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-medium text-white/70 transition hover:text-white"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                    </button>
                ) : null}
                {actions}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'lumi-panel p-3 sm:p-4',
                className
            )}
        >
            <div className={cn(
                'flex flex-col gap-3 lg:flex-row lg:items-center',
                !search && showTools && 'lg:justify-end'
            )}>
                {search ? <div className="min-w-0 flex-1">{search}</div> : null}
                {showTools ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                        {collapseFilters && filters ? (
                            <button
                                type="button"
                                onClick={() => setFiltersOpen((open) => !open)}
                                className={cn(
                                    'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition',
                                    filtersOpen
                                        ? 'border-primary/40 bg-primary/15 text-primary'
                                        : 'border-white/10 bg-black/20 text-white/70 hover:text-white'
                                )}
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                Filters
                            </button>
                        ) : null}
                        {actions}
                    </div>
                ) : null}
            </div>

            {showFilters ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                    {filters}
                </div>
            ) : null}

            {chips ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                    {chips}
                </div>
            ) : null}
        </div>
    );
}
