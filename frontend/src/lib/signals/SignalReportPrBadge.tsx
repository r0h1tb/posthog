import { IconCheck, IconPullRequest, IconX } from '@posthog/icons'
import { Link, Tooltip } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { PR_BADGE_STATE, type PrBadgeState } from './prState'

export function PrBadge({
    prNumber,
    prUrl,
    state,
}: {
    prNumber: string
    prUrl?: string | null
    state: PrBadgeState
}): JSX.Element {
    const { label, className, hoverClassName } = PR_BADGE_STATE[state]
    const StateIcon = state === 'merged' ? IconCheck : state === 'closed' ? IconX : IconPullRequest
    const badge = (
        <span
            className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-xs font-medium transition-colors',
                className,
                prUrl && `cursor-pointer ${hoverClassName}`
            )}
        >
            <StateIcon className="size-3" />
            <span className="font-mono tabular-nums">#{prNumber}</span>
        </span>
    )

    if (!prUrl) {
        return <Tooltip title={`Pull request #${prNumber} (${label})`}>{badge}</Tooltip>
    }

    return (
        <Tooltip title={`Open pull request #${prNumber} (${label}) on GitHub`}>
            <Link
                to={prUrl}
                target="_blank"
                disableClientSideRouting
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open pull request #${prNumber} (${label}) on GitHub`}
                className="no-underline"
            >
                {badge}
            </Link>
        </Tooltip>
    )
}
