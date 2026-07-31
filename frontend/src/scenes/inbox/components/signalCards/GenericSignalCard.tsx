import { TZLabel } from 'lib/components/TZLabel'
import { LemonMarkdown } from 'lib/lemon-ui/LemonMarkdown'
import { identifierToHuman } from 'lib/utils/strings'

import { SignalCardShell } from './SignalCardShell'
import type { SignalCardProps } from './types'

function MetadataValue({ value }: { value: unknown }): JSX.Element {
    if (Array.isArray(value)) {
        return (
            <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4">
                {value.map((item, index) => (
                    <li key={index}>
                        <MetadataValue value={item} />
                    </li>
                ))}
            </ul>
        )
    }

    if (value && typeof value === 'object') {
        return <MetadataList metadata={value as Record<string, unknown>} nested />
    }

    if (typeof value === 'boolean') {
        return <>{value ? 'Yes' : 'No'}</>
    }

    return <>{value == null || value === '' ? 'None' : String(value)}</>
}

function MetadataList({
    metadata,
    nested = false,
}: {
    metadata: Record<string, unknown>
    nested?: boolean
}): JSX.Element {
    return (
        <dl className={nested ? 'grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1' : 'grid gap-1.5'}>
            {Object.entries(metadata).map(([key, value]) => (
                <div
                    key={key}
                    className={
                        nested ? 'col-span-2 grid grid-cols-subgrid' : 'grid grid-cols-[minmax(7rem,auto)_1fr] gap-3'
                    }
                >
                    <dt className="font-medium text-tertiary">{identifierToHuman(key)}</dt>
                    <dd className="m-0 min-w-0 break-words text-secondary">
                        <MetadataValue value={value} />
                    </dd>
                </div>
            ))}
        </dl>
    )
}

export function GenericSignalCard({ signal }: SignalCardProps): JSX.Element {
    const metadata = signal.extra as unknown as Record<string, unknown>

    return (
        <SignalCardShell signal={signal}>
            {signal.content && (
                <LemonMarkdown className="text-sm text-secondary mb-2" disableImages>
                    {signal.content}
                </LemonMarkdown>
            )}

            <div className="text-xs text-tertiary">
                <TZLabel time={signal.timestamp} />
            </div>

            {Object.keys(metadata).length > 0 ? (
                <div className="mt-3 rounded bg-surface-secondary p-3 text-xs">
                    <MetadataList metadata={metadata} />
                </div>
            ) : null}
        </SignalCardShell>
    )
}
