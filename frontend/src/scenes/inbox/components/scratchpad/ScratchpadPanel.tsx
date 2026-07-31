import { useActions, useValues } from 'kea'

import { IconClock, IconNotebook, IconStack } from '@posthog/icons'
import {
    LemonButton,
    LemonCard,
    LemonCollapse,
    LemonInput,
    LemonSegmentedButton,
    LemonSkeleton,
} from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { pluralize } from 'lib/utils/strings'

import { scratchpadLogic } from '../../logics/scratchpadLogic'
import { ScratchpadEntryCard } from './ScratchpadEntryCard'

/**
 * Browse + search surface for the scout fleet's scratchpad (`SignalScratchpad`). Frames what the
 * scratchpad is up top (the context scouts jot down + how much has accumulated), then lets the user
 * read it newest-first or clustered by topic, and search it via the endpoint's ILIKE.
 *
 * Read-only: the harness writes scratchpad notes on internal scope; humans inspect them here.
 */
export function ScratchpadPanel(): JSX.Element {
    const {
        entries,
        entriesLoading,
        loadFailed,
        totalCount,
        lastUpdatedAt,
        groups,
        searchText,
        grouping,
        expandedNamespaces,
        hasMore,
        loadingMore,
    } = useValues(scratchpadLogic)
    const { setSearchText, setGrouping, setExpandedNamespaces, loadEntries, loadMore } = useActions(scratchpadLogic)

    const isInitialLoad = entriesLoading && entries === null
    const isSearching = searchText.trim().length > 0

    return (
        <div className="flex flex-col gap-4 px-4 py-3">
            <ScratchpadHeader totalCount={totalCount} lastUpdatedAt={lastUpdatedAt} hasMore={hasMore} />

            <div className="flex flex-wrap items-center gap-2">
                <LemonInput
                    type="search"
                    placeholder="Search the scratchpad…"
                    value={searchText}
                    onChange={setSearchText}
                    className="flex-1 min-w-[12rem]"
                    allowClear
                />
                <LemonSegmentedButton
                    size="small"
                    value={grouping}
                    onChange={setGrouping}
                    options={[
                        { value: 'recent', label: 'Recent', icon: <IconClock /> },
                        { value: 'topic', label: 'By topic', icon: <IconStack /> },
                    ]}
                />
            </div>

            {isInitialLoad ? (
                <div className="flex flex-col gap-2">
                    <LemonSkeleton className="h-12 w-full rounded" />
                    <LemonSkeleton className="h-12 w-full rounded" />
                    <LemonSkeleton className="h-12 w-full rounded" />
                </div>
            ) : loadFailed && (!entries || entries.length === 0) ? (
                <ScratchpadErrorState onRetry={() => loadEntries()} loading={entriesLoading} />
            ) : !entries || entries.length === 0 ? (
                <ScratchpadEmptyState isSearching={isSearching} />
            ) : grouping === 'topic' ? (
                <LemonCollapse
                    multiple
                    activeKeys={isSearching ? groups.map((group) => group.namespace) : expandedNamespaces}
                    onChange={setExpandedNamespaces}
                    panels={groups.map((group) => ({
                        key: group.namespace,
                        header: (
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                                <span className="text-xs font-medium uppercase tracking-wide text-default">
                                    {group.label}
                                </span>
                                <span className="text-xs text-muted">{pluralize(group.entries.length, 'note')}</span>
                            </div>
                        ),
                        content: (
                            <div className="flex flex-col gap-2">
                                {group.entries.map((entry) => (
                                    <ScratchpadEntryCard key={entry.key} entry={entry} />
                                ))}
                            </div>
                        ),
                    }))}
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {entries.map((entry) => (
                        <ScratchpadEntryCard key={entry.key} entry={entry} />
                    ))}
                </div>
            )}

            {hasMore && entries && entries.length > 0 && (
                <div className="flex justify-center">
                    <LemonButton type="secondary" onClick={() => loadMore()} loading={loadingMore}>
                        Load more notes
                    </LemonButton>
                </div>
            )}
        </div>
    )
}

function ScratchpadHeader({
    totalCount,
    lastUpdatedAt,
    hasMore,
}: {
    totalCount: number | null
    lastUpdatedAt: string | null
    hasMore: boolean
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <IconNotebook className="size-5 text-primary-3000" />
                <span className="text-base font-semibold text-default">Scout scratchpad</span>
            </div>
            <p className="mb-0 text-sm text-secondary">
                Where your scouts jot down useful context as they scan your project, including things they've
                classified, ruled out, or the vocabulary they've settled on. Browse it to see what they're picking up
                about your setup.
            </p>
            {totalCount !== null && totalCount > 0 && (
                <span className="text-xs text-muted">
                    {hasMore ? `${totalCount.toLocaleString()}+ notes loaded` : pluralize(totalCount, 'note')}
                    {lastUpdatedAt ? (
                        <>
                            {' · last updated '}
                            <TZLabel time={lastUpdatedAt} />
                        </>
                    ) : null}
                </span>
            )}
        </div>
    )
}

function ScratchpadErrorState({ onRetry, loading }: { onRetry: () => void; loading: boolean }): JSX.Element {
    return (
        <LemonCard
            hoverEffect={false}
            className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted"
        >
            <span>
                Couldn't load the scratchpad. The scout API may be unavailable or this project may not be enrolled yet.
            </span>
            <LemonButton type="secondary" size="small" onClick={onRetry} loading={loading}>
                Retry
            </LemonButton>
        </LemonCard>
    )
}

function ScratchpadEmptyState({ isSearching }: { isSearching: boolean }): JSX.Element {
    return (
        <LemonCard hoverEffect={false} className="px-4 py-8 text-center text-sm text-muted">
            {isSearching
                ? 'No notes match your search.'
                : "Your scouts haven't jotted anything down yet. As they scan your project, their notes show up here."}
        </LemonCard>
    )
}
