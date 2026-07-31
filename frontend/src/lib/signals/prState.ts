import { SignalReportStatus } from '~/scenes/inbox/types'

export const PR_BADGE_STATE = {
    open: {
        label: 'Open',
        className: 'border-success bg-success-highlight text-success',
        hoverClassName:
            'hover:border-success-dark hover:text-success-dark dark:hover:border-success-light dark:hover:text-success-light',
    },
    merged: {
        label: 'Merged',
        className: 'border-accent bg-accent-highlight-secondary text-accent',
        hoverClassName: 'hover:border-accent-dark hover:text-accent-hover dark:hover:border-accent-hover',
    },
    closed: {
        label: 'Closed',
        className: 'border-danger bg-danger-highlight text-danger',
        hoverClassName:
            'hover:border-danger-dark hover:text-danger-dark dark:hover:border-danger-light dark:hover:text-danger-light',
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
