import { useActions, useValues } from 'kea'
import { type ComponentProps } from 'react'

import { IconClock } from '@posthog/icons'
import { LemonCollapse, LemonTag, Link } from '@posthog/lemon-ui'

import { dayjs } from 'lib/dayjs'
import { LemonMarkdown } from 'lib/lemon-ui/LemonMarkdown'
import { LemonSkeleton } from 'lib/lemon-ui/LemonSkeleton'
import { humanFriendlyDetailedTime } from 'lib/utils/datetime'

import type { ScratchpadEntryApi } from 'products/signals/frontend/generated/api.schemas'

import { scratchpadLogic } from '../../logics/scratchpadLogic'
import { stripScoutPrefix } from '../../utils/scoutRunsWindow'

type LemonTagType = ComponentProps<typeof LemonTag>['type']

// The key prefix (everything before the first colon) encodes the note's *kind* — what the scout
// was doing when it wrote it. Surface it as a colored tag so the list scans at a glance.
const KIND_TAG_TYPE: Record<string, LemonTagType> = {
    pattern: 'highlight',
    dedupe: 'muted',
    noise: 'muted',
    baseline: 'success',
    watch: 'warning',
    watchlist: 'warning',
    coverage: 'completion',
    emerging: 'primary',
    explore: 'option',
    tags: 'option',
    recheck: 'caution',
}

function splitKey(key: string): { kind: string | null; body: string } {
    const idx = key.indexOf(':')
    return idx > 0 ? { kind: key.slice(0, idx), body: key.slice(idx + 1) } : { kind: null, body: key }
}

export function ScratchpadEntryCard({ entry }: { entry: ScratchpadEntryApi }): JSX.Element {
    const { expandedKeys, fullContentByKey, loadingContentKeys } = useValues(scratchpadLogic)
    const { toggleEntry } = useActions(scratchpadLogic)

    const expanded = expandedKeys.includes(entry.key)
    const isLoadingContent = loadingContentKeys.includes(entry.key)
    // `hasOwn` guards against a key like `constructor` resolving to an inherited prototype value.
    const content = Object.hasOwn(fullContentByKey, entry.key) ? fullContentByKey[entry.key] : entry.content

    const { kind, body } = splitKey(entry.key)
    const scoutName = entry.created_by_skill ? stripScoutPrefix(entry.created_by_skill) : null

    // How long the note has been carried forward: a fresh creation reads ~0 days; a large gap
    // means the fleet has re-touched this learning across many runs — the "gets sharper" signal.
    const maintainedDays =
        entry.created_at && entry.updated_at ? dayjs(entry.updated_at).diff(dayjs(entry.created_at), 'day') : 0

    return (
        <LemonCollapse
            activeKey={expanded ? entry.key : undefined}
            onChange={(activeKey) => {
                if ((activeKey === entry.key) !== expanded) {
                    toggleEntry(entry.key)
                }
            }}
            panels={[
                {
                    key: entry.key,
                    header: (
                        <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 text-left">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    {kind && (
                                        <LemonTag
                                            type={KIND_TAG_TYPE[kind] ?? 'muted'}
                                            size="small"
                                            className="shrink-0"
                                        >
                                            {kind}
                                        </LemonTag>
                                    )}
                                    <span className="truncate font-mono text-xs text-primary">{body}</span>
                                </div>
                                {entry.updated_at && (
                                    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
                                        <IconClock className="size-3" />
                                        {humanFriendlyDetailedTime(entry.updated_at)}
                                    </span>
                                )}
                            </div>
                            {!expanded && (
                                <LemonMarkdown disableImages className="line-clamp-2 text-sm text-primary">
                                    {content || '_No content._'}
                                </LemonMarkdown>
                            )}
                        </div>
                    ),
                    content: (
                        <div className="flex flex-col gap-2">
                            <LemonMarkdown disableImages className="text-sm text-primary">
                                {content || '_No content._'}
                            </LemonMarkdown>

                            {isLoadingContent && <LemonSkeleton className="h-4 w-2/3" />}

                            {(entry.created_at || scoutName || entry.created_by_run_id) && (
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-2 text-xs text-tertiary">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {entry.created_at && (
                                            <span>Created {humanFriendlyDetailedTime(entry.created_at)}</span>
                                        )}
                                        {maintainedDays >= 1 && (
                                            <span>
                                                Carried forward{' '}
                                                {maintainedDays === 1 ? '1 day' : `${maintainedDays} days`}
                                            </span>
                                        )}
                                    </div>
                                    {(scoutName || entry.created_by_run_id) && (
                                        <span className="shrink-0">
                                            by{' '}
                                            {entry.created_by_run_url ? (
                                                <Link to={entry.created_by_run_url}>
                                                    {scoutName ? `${scoutName} scout` : 'a scout'}
                                                </Link>
                                            ) : scoutName ? (
                                                `${scoutName} scout`
                                            ) : (
                                                'a scout'
                                            )}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ),
                },
            ]}
        />
    )
}
