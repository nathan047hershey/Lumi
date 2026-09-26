import PageHeader from '@/components/PageHeader';
import { cn } from '@/lib/utils';

/**
 * Page shell. Prefer putting search/filters/actions in PageCommandBar inside children
 * so embedded hub tabs never get an orphan floating button strip.
 */
export default function AppPage({
    icon,
    title,
    description,
    meta,
    actions,
    filters,
    footer,
    children,
    flush = false,
    embedded = false,
    className
}) {
    // Every page names itself. Hub routes used to hide this title, which left
    // Job Links, Analyze, and the other sections looking like unlabeled tools.
    const showTitleHeader = !!(title || icon || description || meta || actions);

    return (
        <div className={cn(flush ? 'flex min-h-full w-full flex-col' : 'lumi-page', className)}>
            {showTitleHeader && (
                <header className="lumi-page-head">
                    <PageHeader
                        icon={icon}
                        title={title}
                        description={description}
                        meta={meta}
                        actions={actions}
                    />
                </header>
            )}

            {filters && !embedded && (
                <div className="lumi-panel px-4 py-3">
                    {filters}
                </div>
            )}

            <div className={cn('lumi-page-body min-h-0', flush && 'flex flex-1 flex-col')}>
                {embedded && (actions || filters) ? (
                    <div className="mb-4 space-y-3">
                        {actions || filters ? (
                            <div className="lumi-panel p-3 sm:p-4">
                                {actions ? (
                                    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                                        {actions}
                                    </div>
                                ) : null}
                                {filters}
                            </div>
                        ) : null}
                        {children}
                    </div>
                ) : (
                    children
                )}
            </div>

            {footer && (
                <footer className="lumi-page-foot">
                    {footer}
                </footer>
            )}
        </div>
    );
}
