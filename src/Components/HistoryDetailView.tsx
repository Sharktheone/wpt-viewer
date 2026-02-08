import '#/Style/components/HistoryDetailView.scss';

import { useSignal } from '@preact/signals';
import { X, Clock, TrendingUp, TrendingDown, Play, Folder, Tag, ChevronDown, ChevronUp, Terminal, GitCompare, Copy, Check, Cpu, Globe } from 'lucide-preact';
import { Button } from './Ui/Button';
import {
    historyDetailOpen,
    selectedHistoryEntry,
    closeHistoryDetail,
    openRerunModal,
    rerunConfig,
    type BackendRunHistoryEntry,
    type HistoryChangedTest,
} from '#/RerunState';
import { TestPathLink } from './TestPathLink';
import { copyTransitionGroup, copyAllTransitionGroups, type DiffGroup } from '#/Utils/Clipboard';

// Format date for display
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString();
}

// Format duration between two dates
function formatDuration(startStr: string, endStr?: string): string {
    if (!endStr) return '-';

    const start = new Date(startStr);
    const end = new Date(endStr);
    const ms = end.getTime() - start.getTime();

    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

// Get status class from phase
function getPhaseClass(phase: string): string {
    switch (phase) {
        case 'complete': return 'success';
        case 'error': return 'error';
        case 'cancelled': return 'warning';
        default: return '';
    }
}

// Get phase display text
function getPhaseText(phase: string): string {
    switch (phase) {
        case 'complete': return 'Completed';
        case 'error': return 'Failed';
        case 'cancelled': return 'Cancelled';
        case 'running': return 'Running';
        case 'building': return 'Building';
        default: return phase;
    }
}

// Get source display info
function getSourceInfo(source?: string): { label: string; className: string; icon: typeof Cpu } {
    switch (source) {
        case 'mcp':
            return { label: 'MCP', className: 'source-mcp', icon: Cpu };
        case 'http':
            return { label: 'HTTP', className: 'source-http', icon: Globe };
        case 'stream':
        default:
            return { label: 'Web', className: 'source-stream', icon: Globe };
    }
}

// Group changed tests by transition type
interface TransitionGroup {
    from: string;
    to: string;
    tests: HistoryChangedTest[];
}

function groupChangedTests(tests: HistoryChangedTest[]): TransitionGroup[] {
    const groups = new Map<string, TransitionGroup>();

    for (const test of tests) {
        const key = `${test.oldStatus}->${test.newStatus}`;
        if (!groups.has(key)) {
            groups.set(key, {
                from: test.oldStatus,
                to: test.newStatus,
                tests: [],
            });
        }
        groups.get(key)!.tests.push(test);
    }

    // Sort: gains first (to PASS), then losses (from PASS), then others
    const isGain = (g: TransitionGroup) => g.to === 'PASS';
    return Array.from(groups.values()).sort((a, b) => {
        if (isGain(a) && !isGain(b)) return -1;
        if (!isGain(a) && isGain(b)) return 1;
        if (a.from === 'PASS' && b.from !== 'PASS') return -1;
        if (a.from !== 'PASS' && b.from === 'PASS') return 1;
        return a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
    });
}

// Transition group component - matching RerunModal style
function TransitionGroupItem({ group, expandedGroups }: {
    group: TransitionGroup,
    expandedGroups: { value: Set<string> }
}) {
    const groupKey = `${group.from}->${group.to}`;
    const isExpanded = expandedGroups.value.has(groupKey);
    const targetClass = group.to.toLowerCase();
    const copied = useSignal(false);

    const toggle = () => {
        const newSet = new Set(expandedGroups.value);
        if (isExpanded) {
            newSet.delete(groupKey);
        } else {
            newSet.add(groupKey);
        }
        expandedGroups.value = newSet;
    };

    const handleCopy = async (e: Event) => {
        e.stopPropagation();
        const diffGroup: DiffGroup = {
            from: group.from,
            to: group.to,
            tests: group.tests.map(t => ({ path: t.path })),
        };
        const success = await copyTransitionGroup(diffGroup);
        if (success) {
            copied.value = true;
            setTimeout(() => { copied.value = false; }, 2000);
        }
    };

    return (
        <div class={`transition-group target-${targetClass}`}>
            <button type="button" class="transition-header" onClick={toggle}>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span class={`status-badge ${group.from.toLowerCase()}`}>{group.from}</span>
                <span class="arrow">→</span>
                <span class={`status-badge ${group.to.toLowerCase()}`}>{group.to}</span>
                <span class="count">({group.tests.length})</span>
                <span
                    class={`copy-btn ${copied.value ? 'copied' : ''}`}
                    onClick={handleCopy}
                    title="Copy to clipboard"
                >
                    {copied.value ? <Check size={14} /> : <Copy size={14} />}
                </span>
            </button>
            {isExpanded && (
                <div class="transition-tests">
                    {group.tests.map(test => (
                        <TestPathLink
                            key={test.path}
                            path={test.path}
                            status={test.newStatus}
                            variant="compact"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Stats display component
function StatsGrid({ entry }: { entry: BackendRunHistoryEntry }) {
    const total = entry.total || 1;
    const pct = (v: number) => ((v / total) * 100).toFixed(1);

    return (
        <div class="stats">
            <div class="stat pass">
                <span class="label">Passed</span>
                <span class="value">{entry.passed}</span>
                <span class="pct">({pct(entry.passed)}%)</span>
            </div>
            <div class="stat fail">
                <span class="label">Failed</span>
                <span class="value">{entry.failed}</span>
                <span class="pct">({pct(entry.failed)}%)</span>
            </div>
            <div class="stat crash">
                <span class="label">Crashed</span>
                <span class="value">{entry.crashed}</span>
                <span class="pct">({pct(entry.crashed)}%)</span>
            </div>
            <div class="stat timeout">
                <span class="label">Timeout</span>
                <span class="value">{entry.timeout}</span>
                <span class="pct">({pct(entry.timeout)}%)</span>
            </div>
            <div class="stat skip">
                <span class="label">Skipped</span>
                <span class="value">{entry.skipped}</span>
                <span class="pct">({pct(entry.skipped)}%)</span>
            </div>
        </div>
    );
}

// Rerun from this path
function handleRerun(entry: BackendRunHistoryEntry) {
    closeHistoryDetail();
    rerunConfig.value = {
        path: entry.path || '',
        rebuild: true,
        profile: entry.profile || '',
    };
    openRerunModal(entry.path || '');
}

export function HistoryDetailView() {
    const entry = selectedHistoryEntry.value;
    const expandedGroups = useSignal<Set<string>>(new Set());
    const showBuildOutput = useSignal(false);
    const showChangedTests = useSignal(true);
    const allCopied = useSignal(false);

    if (!historyDetailOpen.value || !entry) {
        return null;
    }

    const passRate = entry.total > 0 ? ((entry.passed / entry.total) * 100).toFixed(1) : '0.0';
    const transitionGroups = entry.changedTests ? groupChangedTests(entry.changedTests) : [];
    const hasChanges = transitionGroups.length > 0;
    const hasBuildOutput = entry.buildOutput && entry.buildOutput.length > 0;

    const handleCopyAll = async () => {
        const diffGroups: DiffGroup[] = transitionGroups.map(g => ({
            from: g.from,
            to: g.to,
            tests: g.tests.map(t => ({ path: t.path })),
        }));
        const success = await copyAllTransitionGroups(diffGroups);
        if (success) {
            allCopied.value = true;
            setTimeout(() => { allCopied.value = false; }, 2000);
        }
    };

    return (
        <div class="HistoryDetailView-overlay" onClick={closeHistoryDetail}>
            <div class="HistoryDetailView" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>
                        <Clock size={20} />
                        Run Details
                    </h2>
                    {entry.source && (() => {
                        const sourceInfo = getSourceInfo(entry.source);
                        const Icon = sourceInfo.icon;
                        return (
                            <span class={`source-badge ${sourceInfo.className}`} title={`Initiated via ${sourceInfo.label}`}>
                                <Icon size={14} />
                                {sourceInfo.label}
                            </span>
                        );
                    })()}
                    <button
                        type="button"
                        class="close-btn"
                        onClick={closeHistoryDetail}
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div class="modal-body">
                    {/* Run info section */}
                    <div class="info-section">
                        <div class="info-row">
                            <Folder size={16} />
                            <span class="label">Path:</span>
                            <span class="value">{entry.path || 'All tests'}</span>
                        </div>

                        {entry.profile && (
                            <div class="info-row">
                                <Tag size={16} />
                                <span class="label">Profile:</span>
                                <span class="value">{entry.profile}</span>
                            </div>
                        )}

                        <div class="info-row">
                            <Clock size={16} />
                            <span class="label">Started:</span>
                            <span class="value">{formatDate(entry.startedAt)}</span>
                        </div>

                        {entry.completedAt && (
                            <div class="info-row">
                                <Clock size={16} />
                                <span class="label">Duration:</span>
                                <span class="value">{formatDuration(entry.startedAt, entry.completedAt)}</span>
                            </div>
                        )}

                        <div class="info-row">
                            <span class={`status-badge ${getPhaseClass(entry.phase)}`}>
                                {getPhaseText(entry.phase)}
                            </span>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div class="progress-bar-container">
                        <div class="progress-bar-multi">
                            <div class="progress-segment pass" style={{ width: `${(entry.passed / entry.total) * 100}%` }} />
                            <div class="progress-segment fail" style={{ width: `${(entry.failed / entry.total) * 100}%` }} />
                            <div class="progress-segment crash" style={{ width: `${(entry.crashed / entry.total) * 100}%` }} />
                            <div class="progress-segment timeout" style={{ width: `${(entry.timeout / entry.total) * 100}%` }} />
                            <div class="progress-segment skip" style={{ width: `${(entry.skipped / entry.total) * 100}%` }} />
                        </div>
                    </div>

                    {/* Stats with pass rate highlight */}
                    <div class="stats-section">
                        <div class="pass-rate">
                            <span class="value">{passRate}%</span>
                            <span class="label">Pass Rate</span>
                        </div>

                        {(entry.gained > 0 || entry.lost > 0) && (
                            <div class="delta-summary">
                                {entry.gained > 0 && (
                                    <span class="delta gained">
                                        <TrendingUp size={16} />
                                        +{entry.gained}
                                    </span>
                                )}
                                {entry.lost > 0 && (
                                    <span class="delta lost">
                                        <TrendingDown size={16} />
                                        -{entry.lost}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stats grid - matching RerunModal */}
                    <StatsGrid entry={entry} />

                    {/* Changed tests section - collapsible, matching RerunModal */}
                    {hasChanges && (
                        <div class="changes-section">
                            <div class="changes-header">
                                <button
                                    type="button"
                                    class="section-toggle"
                                    onClick={() => { showChangedTests.value = !showChangedTests.value; }}
                                >
                                    {showChangedTests.value ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    <GitCompare size={16} />
                                    <span>Changed Tests ({entry.changedTests?.length || 0})</span>
                                </button>
                                <button
                                    type="button"
                                    class={`copy-all-btn ${allCopied.value ? 'copied' : ''}`}
                                    onClick={handleCopyAll}
                                    title="Copy all changes to clipboard"
                                >
                                    {allCopied.value ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{allCopied.value ? 'Copied!' : 'Copy All'}</span>
                                </button>
                            </div>

                            {showChangedTests.value && (
                                <div class="transition-groups">
                                    {transitionGroups.map(group => (
                                        <TransitionGroupItem
                                            key={`${group.from}->${group.to}`}
                                            group={group}
                                            expandedGroups={expandedGroups}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Build output section - collapsible, matching RerunModal */}
                    {hasBuildOutput && (
                        <div class="build-output-section">
                            <button
                                type="button"
                                class="section-toggle"
                                onClick={() => { showBuildOutput.value = !showBuildOutput.value; }}
                            >
                                {showBuildOutput.value ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                <Terminal size={16} />
                                <span>Build Output ({entry.buildOutput?.length || 0} lines)</span>
                            </button>

                            {showBuildOutput.value && (
                                <div class="build-output-container">
                                    {entry.buildOutput!.map((line, i) => (
                                        <div class="build-output-line" key={i}>{line}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Baseline reference if available */}
                    {entry.baselineRef && (
                        <div class="baseline-info">
                            <span class="label">Compared against:</span>
                            <code>{entry.baselineRef}</code>
                        </div>
                    )}
                </div>

                <div class="modal-footer">
                    <Button color="primary" icon={Play} onClick={() => handleRerun(entry)}>
                        Rerun This Path
                    </Button>
                    <Button color="secondary" onClick={closeHistoryDetail}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
