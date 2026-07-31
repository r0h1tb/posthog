import { useState } from 'react'

import { IconExternal } from '@posthog/icons'
import { LemonTag, Link, ProfilePicture } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { TZLabel } from 'lib/components/TZLabel'
import { LemonMarkdown } from 'lib/lemon-ui/LemonMarkdown'
import { capitalizeFirstLetter } from 'lib/utils/strings'

import { Task } from 'products/posthog_ai/frontend/types/taskTypes'

import { EnrichedReviewer, SignalReportActionability, SignalReportPriority, SignalReportArtefact } from '../../types'
import { SignalReportActionabilityBadge } from '../badges/SignalReportActionabilityBadge'
import { SignalReportPriorityBadge } from '../badges/SignalReportPriorityBadge'
import { ActivityDisclosure } from './ActivityDisclosure'
import { ArtefactCommit } from './ArtefactCommit'
import { ArtefactTaskRun } from './ArtefactTaskRun'
import {
    artefactAttributionLabel,
    artefactLocationLabel,
    artefactTypeLabel,
    CodeReferenceContent,
    CommitContent,
    DismissalContent,
    LineReferenceContent,
    NoteContent,
    SignalFindingContent,
    SummaryChangeContent,
    TaskRunArtefactContent,
    TitleChangeContent,
} from './artefactTypes'

/** Map a file extension to a CodeSnippet language for syntax highlighting; falls back to plain text. */
function languageFromPath(path: string | undefined): Language {
    const ext = path?.split('.').pop()?.toLowerCase()
    switch (ext) {
        case 'ts':
        case 'tsx':
            return Language.TypeScript
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return Language.JavaScript
        case 'py':
            return Language.Python
        case 'go':
            return Language.Go
        case 'rb':
            return Language.Ruby
        case 'java':
            return Language.Java
        case 'kt':
            return Language.Kotlin
        case 'php':
            return Language.PHP
        case 'cs':
            return Language.CSharp
        case 'swift':
            return Language.Swift
        case 'sql':
            return Language.SQL
        case 'json':
            return Language.JSON
        case 'yaml':
        case 'yml':
            return Language.YAML
        case 'sh':
        case 'bash':
            return Language.Bash
        case 'html':
        case 'xml':
            return Language.XML
        default:
            return Language.Text
    }
}

/** Replace dashes/underscores with spaces and capitalize — for enum-ish strings (dismissal reasons). */
function prettify(value: string): string {
    return capitalizeFirstLetter(value.replace(/[-_]/g, ' '))
}

/** Friendly labels for known dismissal reason codes; unknown values fall back to a humanized form. */
const DISMISS_REASON_LABELS: Record<string, string> = {
    slack_dismiss: 'Dismissed from Slack',
}

function dismissReasonLabel(reason: string): string {
    return DISMISS_REASON_LABELS[reason] ?? prettify(reason)
}

/** A short relevance / context note above a code block. */
function RelevanceNote({ note }: { note?: string }): JSX.Element | null {
    if (!note?.trim()) {
        return null
    }
    return <span className="block text-secondary text-xs">{note}</span>
}

/** A read-only highlighted code block sized for the activity log. */
function CodeRefBlock({ code, language }: { code: string; language: Language }): JSX.Element {
    return (
        <div className="mt-1.5">
            <CodeSnippet language={language} compact wrap>
                {code}
            </CodeSnippet>
        </div>
    )
}

function CollapsibleReasoning({ text }: { text: string }): JSX.Element {
    const [expanded, setExpanded] = useState(false)
    return (
        <ActivityDisclosure
            expanded={expanded}
            onChange={setExpanded}
            label="Show reasoning"
            expandedLabel="Hide reasoning"
        >
            <span className="text-xs text-secondary">{text}</span>
        </ActivityDisclosure>
    )
}

function CollapsibleNote({ note, author }: { note: string; author?: string }): JSX.Element {
    const [expanded, setExpanded] = useState(false)
    const preview = note.split('\n').find((line) => line.trim()) ?? note
    return (
        <ActivityDisclosure
            expanded={expanded}
            onChange={setExpanded}
            label={<span className="truncate">{preview}</span>}
            expandedLabel="Hide note"
            fullWidth
        >
            <LemonMarkdown className="text-xs text-secondary leading-normal" disableImages>
                {note}
            </LemonMarkdown>
            {author?.trim() ? <span className="mt-1 block text-xs text-tertiary">By {author}</span> : null}
        </ActivityDisclosure>
    )
}

/**
 * A `title_change` / `summary_change` artefact: shows the value the report now carries, with the
 * previous value tucked behind a "Show previous" toggle (omitted when the field had no prior value).
 * `markdown` renders the body as markdown — summaries are descriptions, titles are plain text.
 * `collapse` hides the new value behind a one-line preview (summaries can be long; titles are short
 * enough to show inline).
 */
function ContentChangeBody({
    previous,
    current,
    markdown = false,
    collapse = false,
}: {
    previous?: string | null
    current: string
    markdown?: boolean
    collapse?: boolean
}): JSX.Element {
    const [expanded, setExpanded] = useState(false)
    const [showPrevious, setShowPrevious] = useState(false)
    const renderText = (text: string, muted: boolean): JSX.Element => {
        const color = muted ? 'text-secondary' : 'text-default'
        return markdown ? (
            <LemonMarkdown className={`text-xs leading-normal ${color}`} disableImages>
                {text}
            </LemonMarkdown>
        ) : (
            <span className={`text-xs ${color}`}>{text}</span>
        )
    }
    const previousToggle = previous?.trim() ? (
        <ActivityDisclosure
            expanded={showPrevious}
            onChange={setShowPrevious}
            label="Show previous"
            expandedLabel="Hide previous"
        >
            {renderText(previous, true)}
        </ActivityDisclosure>
    ) : null

    if (collapse) {
        const preview = current.split('\n').find((line) => line.trim()) ?? current
        return (
            <ActivityDisclosure
                expanded={expanded}
                onChange={setExpanded}
                label={<span className="truncate">{preview}</span>}
                expandedLabel="Hide new value"
                fullWidth
            >
                <div className="min-w-0">{renderText(current, false)}</div>
                {previousToggle}
            </ActivityDisclosure>
        )
    }

    return (
        <div className="flex w-full min-w-0 flex-col gap-1">
            <div className="min-w-0">{renderText(current, false)}</div>
            {previousToggle}
        </div>
    )
}

function ReviewersBody({ reviewers }: { reviewers: EnrichedReviewer[] }): JSX.Element {
    if (reviewers.length === 0) {
        return <span className="text-tertiary text-xs">No reviewers assigned.</span>
    }
    return (
        <div className="flex flex-col gap-1">
            {reviewers.map((reviewer) => {
                const name = reviewer.user?.first_name || reviewer.github_name || reviewer.github_login
                return (
                    <div key={reviewer.github_login} className="flex items-center gap-2 text-xs">
                        <ProfilePicture user={reviewer.user} name={name} size="sm" />
                        <span className="truncate text-default">{name}</span>
                        <Link
                            to={`https://github.com/${reviewer.github_login}`}
                            target="_blank"
                            disableClientSideRouting
                            className="ml-auto flex shrink-0 items-center gap-0.5 font-mono text-xs text-tertiary"
                        >
                            @{reviewer.github_login}
                            <IconExternal />
                        </Link>
                    </div>
                )
            })}
        </div>
    )
}

/** Per-type body for one artefact row. Content is read defensively — legacy rows may lack fields. */
function ArtefactBody({
    reportId,
    artefact,
    knownTasks,
}: {
    reportId: string
    artefact: SignalReportArtefact
    knownTasks?: Map<string, Task>
}): JSX.Element {
    const content = artefact.content

    switch (artefact.type) {
        case 'code_reference': {
            const c = content as CodeReferenceContent
            return (
                <div>
                    <RelevanceNote note={c.relevance_note} />
                    {c.contents ? <CodeRefBlock code={c.contents} language={languageFromPath(c.file_path)} /> : null}
                </div>
            )
        }
        case 'line_reference': {
            const c = content as LineReferenceContent
            return (
                <div>
                    <RelevanceNote note={c.note} />
                    {c.contents ? <CodeRefBlock code={c.contents} language={languageFromPath(c.file_path)} /> : null}
                </div>
            )
        }
        case 'commit':
            return <ArtefactCommit reportId={reportId} artefactId={artefact.id} content={content as CommitContent} />
        case 'task_run': {
            const c = content as TaskRunArtefactContent
            return <ArtefactTaskRun content={c} knownTask={knownTasks?.get(c.task_id) ?? null} />
        }
        case 'note': {
            const c = content as NoteContent
            return <CollapsibleNote note={c.note} author={c.author} />
        }
        case 'priority_judgment': {
            const c = content as { priority?: SignalReportPriority; explanation?: string }
            return (
                <div className="flex flex-col gap-1">
                    <SignalReportPriorityBadge priority={c.priority} />
                    {c.explanation ? <CollapsibleReasoning text={c.explanation} /> : null}
                </div>
            )
        }
        case 'actionability_judgment': {
            const c = content as {
                actionability?: SignalReportActionability
                already_addressed?: boolean
                explanation?: string
            }
            return (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <SignalReportActionabilityBadge actionability={c.actionability} />
                        {c.already_addressed ? (
                            <LemonTag size="small" type="warning">
                                Already addressed
                            </LemonTag>
                        ) : null}
                    </div>
                    {c.explanation ? <CollapsibleReasoning text={c.explanation} /> : null}
                </div>
            )
        }
        case 'safety_judgment': {
            const c = content as { choice?: boolean; explanation?: string }
            return (
                <div className="flex flex-col gap-1">
                    <LemonTag size="small" type={c.choice ? 'success' : 'danger'}>
                        {c.choice ? 'Safe to act on' : 'Unsafe'}
                    </LemonTag>
                    {c.explanation ? <CollapsibleReasoning text={c.explanation} /> : null}
                </div>
            )
        }
        case 'signal_finding': {
            const c = content as SignalFindingContent
            const paths = c.relevant_code_paths ?? []
            return (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-tertiary">{c.signal_id}</span>
                        <LemonTag size="small" type={c.verified ? 'success' : 'muted'}>
                            {c.verified ? 'Verified' : 'Unverified'}
                        </LemonTag>
                    </div>
                    {paths.length > 0 ? (
                        <div className="flex flex-col">
                            {paths.map((path) => (
                                <span key={path} className="truncate font-mono text-xs text-secondary">
                                    {path}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            )
        }
        case 'suggested_reviewers':
            return <ReviewersBody reviewers={(content as unknown as EnrichedReviewer[]) ?? []} />
        case 'title_change': {
            const c = content as TitleChangeContent
            return <ContentChangeBody previous={c.old_title} current={c.new_title ?? ''} />
        }
        case 'summary_change': {
            const c = content as SummaryChangeContent
            return <ContentChangeBody previous={c.old_summary} current={c.new_summary ?? ''} markdown collapse />
        }
        case 'dismissal': {
            const c = content as DismissalContent
            return (
                <div className="flex flex-col gap-1">
                    {c.reason ? (
                        <LemonTag size="small" type="muted">
                            {dismissReasonLabel(c.reason)}
                        </LemonTag>
                    ) : null}
                    {c.note ? <RelevanceNote note={c.note} /> : null}
                </div>
            )
        }
        default: {
            const value = (content as { content?: unknown })?.content
            return <span className="text-tertiary text-xs">{typeof value === 'string' ? value : ''}</span>
        }
    }
}

function ArtefactRow({
    reportId,
    artefact,
    knownTasks,
}: {
    reportId: string
    artefact: SignalReportArtefact
    knownTasks?: Map<string, Task>
}): JSX.Element {
    const location = artefactLocationLabel(artefact)
    const attribution = artefactAttributionLabel(artefact)

    return (
        <div className="relative flex gap-3 pb-5 last:pb-0">
            <span className="z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-primary ring-1 ring-primary">
                <span className="size-2 rounded-full bg-accent" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-sm text-default">{artefactTypeLabel(artefact.type)}</span>
                    {location ? <span className="truncate font-mono text-xs text-tertiary">{location}</span> : null}
                    <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-tertiary">
                        {attribution ? <span>By {attribution}</span> : null}
                        <TZLabel time={artefact.created_at} />
                    </div>
                </div>
                <ArtefactBody reportId={reportId} artefact={artefact} knownTasks={knownTasks} />
            </div>
        </div>
    )
}

/**
 * The report's work-log: every artefact rendered chronologically with a tailored body — judgments,
 * findings, code references, diffs, commits, task runs, notes, and reviewers. Mirrors desktop
 * `ArtefactLogList`. Returns null when there are no artefacts.
 */
export function ArtefactLogList({
    reportId,
    artefacts,
    knownTasks,
}: {
    reportId: string
    artefacts: SignalReportArtefact[]
    /** Tasks the detail logic already resolved, keyed by id — `task_run` rows reuse these instead of refetching. */
    knownTasks?: Map<string, Task>
}): JSX.Element | null {
    if (artefacts.length === 0) {
        return null
    }
    const ordered = [...artefacts].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return (
        <div className="relative">
            <span className="absolute bottom-2 left-2 top-2 w-px bg-border" aria-hidden />
            {ordered.map((artefact) => (
                <ArtefactRow key={artefact.id} reportId={reportId} artefact={artefact} knownTasks={knownTasks} />
            ))}
        </div>
    )
}
