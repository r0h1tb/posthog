import { SignalReportStatus } from '~/scenes/inbox/types'

export const PR_BADGE_STATE = {
    open: {
        label: 'Open',
        className: 'border-success bg-success-highlight text-success',
        hoverClassName: 'hover:bg-fill-success-secondary',
    },
    merged: {
        label: 'Merged',
        className: 'border-accent bg-accent-highlight-secondary text-accent',
        hoverClassName: 'hover:bg-accent-highlight-primary',
    },
    closed: {
        label: 'Closed',
        className: 'border-danger bg-danger-highlight text-danger',
        hoverClassName: 'hover:bg-fill-error-secondary',
    },
}

export type PrBadgeState = keyof typeof PR_BADGE_STATE

export function derivePrState(status: SignalReportStatus | string, prMerged: boolean): PrBadgeState {
    if (prMerged) {
        return 'merged'
    }
    if (status === SignalReportStatus.FAILED) {
        return 'closed'
    }
    return 'open'
}
