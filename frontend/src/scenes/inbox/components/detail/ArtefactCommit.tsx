import { useValues } from 'kea'
import { useEffect, useState } from 'react'

import { LemonSkeleton } from '@posthog/lemon-ui'

import { teamLogic } from 'scenes/teamLogic'

import { signalsReportArtefactsDiff } from 'products/signals/frontend/generated/api'
import type { CommitDiffResponseApi } from 'products/signals/frontend/generated/api.schemas'

import { ActivityDisclosure } from './ActivityDisclosure'
import { CommitContent } from './artefactTypes'
import { DiffBlock } from './DiffBlock'

/**
 * A `commit` artefact: the message, short sha + repo@branch, and a collapsible "View diff" that
 * lazily fetches the commit-vs-parent diff from the backend on first expand. Missing / rewritten
 * commits surface a clean message; oversized diffs show a truncation notice. Mirrors desktop
 * `ArtefactCommit`.
 */
export function ArtefactCommit({
    reportId,
    artefactId,
    content,
}: {
    reportId: string
    artefactId: string
    content: CommitContent
}): JSX.Element {
    const { currentTeamId } = useValues(teamLogic)
    const [expanded, setExpanded] = useState(false)
    const [diff, setDiff] = useState<CommitDiffResponseApi | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Fetch the diff only once, on first expand — commit diffs are immutable, so there's no reason
    // to refetch. Keyed on artefactId so a recycled component instance refetches for a new commit;
    // `currentTeamId` is a dep so a late-arriving team still triggers the fetch once available.
    useEffect(() => {
        if (!expanded || diff || loading || error || !currentTeamId) {
            return
        }
        setLoading(true)
        let cancelled = false
        signalsReportArtefactsDiff(String(currentTeamId), reportId, artefactId)
            .then((response) => {
                if (!cancelled) {
                    setDiff(response)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError(
                        "Couldn't load this commit's diff. Open the commit in GitHub to check whether it was rewritten or removed."
                    )
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded, artefactId, currentTeamId])

    return (
        <div>
            <span className="block text-default text-xs">{content.message}</span>
            <span className="block font-mono text-xs text-tertiary">
                {content.commit_sha.slice(0, 12)} · {content.repository}@{content.branch}
            </span>
            {content.note?.trim() ? <span className="block text-secondary text-xs mt-1">{content.note}</span> : null}

            <ActivityDisclosure
                expanded={expanded}
                onChange={setExpanded}
                label="View diff"
                expandedLabel="Hide diff"
                className="mt-1.5"
            >
                {loading ? (
                    <div className="flex flex-col gap-1.5 py-1">
                        <LemonSkeleton className="h-3 w-full" />
                        <LemonSkeleton className="h-3 w-4/5" />
                    </div>
                ) : error ? (
                    <span className="text-xs text-danger">{error}</span>
                ) : diff && diff.diff.trim() ? (
                    <>
                        <DiffBlock diff={diff.diff} />
                        {diff.truncated ? (
                            <span className="mt-1 block text-xs text-tertiary italic">
                                The diff is truncated. Open the commit in GitHub to see the full change.
                            </span>
                        ) : null}
                    </>
                ) : (
                    <span className="text-xs text-tertiary">No changes recorded for this commit.</span>
                )}
            </ActivityDisclosure>
        </div>
    )
}
