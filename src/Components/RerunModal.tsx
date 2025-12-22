import '#/Style/components/RerunModal.scss';

import { X, Play, RefreshCw, Wrench, ChevronDown, ChevronUp, AlertTriangle, Square, TrendingUp, TrendingDown, History, Trash2, GitCommit, Clock, Terminal } from 'lucide-preact';
import { useComputed, useSignal, type Signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { Button } from './Ui/Button';
import { Select } from './Ui/Select';
import {
    rerunModalOpen,
    rerunConfig,
    rerunProgress,
    rerunResults,
    rerunError,
    showResults,
    closeRerunModal,
    cancelRerun,
    startRerun,
    progressBreakdown,
    isRunning,
    diffStats,
    backendHistory,
    deleteHistoryRun,
    historyLoading,
    gitCommits,
    diffBaseline,
    fetchGitCommits,
    buildOutput,
    showBuildOutput,
    type TestResult,
    type DiffBaseline,
} from '#/RerunState';
import { profiles } from '#/State';

// Format a date as relative time (e.g., "2 min ago")
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return date.toLocaleDateString();
}

// Format run status as a short string
function formatRunStatus(phase: string): string {
    switch (phase) {
        case 'complete': return 'Done';
        case 'cancelled': return 'Cancelled';
        case 'error': return 'Error';
        default: return phase;
    }
}

// Compact history dropdown component
function HistoryDropdown({ isOpen }: { isOpen: Signal<boolean> }) {
    const history = backendHistory.value;
    const loading = historyLoading.value;
    
    if (!isOpen.value) return null;
    
    const handleDelete = async (e: Event, id: string) => {
        e.stopPropagation();
        await deleteHistoryRun(id);
    };
    
    return (
        <div class="history-dropdown">
            <div class="history-dropdown-header">
                <span>Run History</span>
                {loading && <RefreshCw size={12} class="spinning" />}
            </div>
            <div class="history-dropdown-list">
                {history.length === 0 ? (
                    <div class="history-empty">No runs yet</div>
                ) : (
                    history.map(entry => (
                        <div class="history-dropdown-item" key={entry.id}>
                            <div class="history-item-main">
                                <span class="history-path">{entry.path || 'All tests'}</span>
                                <span class={`history-status ${entry.phase}`}>
                                    {formatRunStatus(entry.phase)}
                                </span>
                            </div>
                            <div class="history-item-meta">
                                <span class="history-time">{formatRelativeTime(entry.startedAt)}</span>
                                <span class="history-stats">
                                    <span class="pass">{entry.passed}</span>/<span class="total">{entry.total}</span>
                                </span>
                                {entry.gained > 0 && <span class="gained">+{entry.gained}</span>}
                                {entry.lost > 0 && <span class="lost">-{entry.lost}</span>}
                            </div>
                            <button 
                                type="button" 
                                class="delete-btn"
                                onClick={(e) => handleDelete(e, entry.id)}
                                title="Delete run"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// Baseline selector dropdown - simplified, fetches from yavashark-data repo
function BaselineSelector({ isOpen, onClose, anchorRef }: { 
    isOpen: Signal<boolean>, 
    onClose: () => void,
    anchorRef: preact.RefObject<HTMLButtonElement>
}) {
    const baseline = diffBaseline.value;
    const commits = gitCommits.value;
    const history = backendHistory.value;
    const commitsLoading = useSignal(false);
    const dropdownStyle = useSignal<{ top: number; right: number } | null>(null);
    
    // Fetch commits when dropdown opens
    useEffect(() => {
        if (isOpen.value && commits.length === 0) {
            commitsLoading.value = true;
            fetchGitCommits().finally(() => {
                commitsLoading.value = false;
            });
        }
    }, [isOpen.value]);
    
    // Calculate position when open
    useEffect(() => {
        if (isOpen.value && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            dropdownStyle.value = {
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right,
            };
        }
    }, [isOpen.value]);
    
    if (!isOpen.value || !dropdownStyle.value) return null;
    
    const setBaseline = (newBaseline: DiffBaseline) => {
        diffBaseline.value = newBaseline;
        onClose();
    };
    
    return (
        <div 
            class="baseline-dropdown" 
            style={{ 
                position: 'fixed',
                top: `${dropdownStyle.value.top}px`, 
                right: `${dropdownStyle.value.right}px`,
            }}
        >
            <div class="baseline-dropdown-header">
                Compare Against
            </div>
            
            <div class="baseline-options">
                {/* Current results option */}
                <button
                    type="button"
                    class={`baseline-option ${baseline.type === 'current' ? 'active' : ''}`}
                    onClick={() => setBaseline({ type: 'current' })}
                >
                    <Clock size={14} />
                    <span>Current results.json</span>
                </button>
                
                {/* Commit selection - directly show commits from yavashark-data */}
                <div class="baseline-section-label">
                    <GitCommit size={12} />
                    <span>From yavashark-data</span>
                    {commitsLoading.value && <RefreshCw size={12} class="spinning" />}
                </div>
                
                <div class="commit-list">
                    {commits.length === 0 && !commitsLoading.value && (
                        <div class="empty-message">No commits found</div>
                    )}
                    {commits.map(c => (
                        <button
                            type="button"
                            class={`commit-item ${baseline.type === 'commit' && baseline.ref === c.hash ? 'active' : ''}`}
                            key={c.hash}
                            onClick={() => setBaseline({ type: 'commit', ref: c.hash })}
                        >
                            <code class="commit-hash">{c.shortHash}</code>
                            <span class="commit-subject">{c.subject}</span>
                        </button>
                    ))}
                </div>
                
                {/* Previous runs */}
                {history.length > 0 && (
                    <>
                        <div class="baseline-section-label">
                            <History size={12} />
                            <span>Previous runs</span>
                        </div>
                        <div class="run-list">
                            {history.slice(0, 5).map(entry => (
                                <button
                                    type="button"
                                    class={`run-item ${baseline.type === 'run' && baseline.ref === entry.id ? 'active' : ''}`}
                                    key={entry.id}
                                    onClick={() => setBaseline({ type: 'run', ref: entry.id })}
                                >
                                    <span class="run-path">{entry.path || 'All tests'}</span>
                                    <span class="run-stats">{entry.passed}/{entry.total}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Get baseline display text
function getBaselineLabel(baseline: DiffBaseline): string {
    switch (baseline.type) {
        case 'current': return 'Current results';
        case 'commit': return baseline.ref ? `Commit ${baseline.ref.slice(0, 7)}` : 'Select commit...';
        case 'run': return baseline.ref ? `Run ${baseline.ref.slice(0, 8)}` : 'Select run...';
    }
}

// Strip common path prefixes for cleaner display
function stripPathPrefix(path: string): string {
    const prefixes = [
        '../../test262/test/',
        '../test262/test/',
        'test262/test/',
        'test/',
    ];
    for (const prefix of prefixes) {
        if (path.startsWith(prefix)) {
            return path.slice(prefix.length);
        }
    }
    return path;
}

interface TransitionGroup {
    from: string;
    to: string;
    tests: TestResult[];
    targetStatus: string; // The status tests are moving TO (for coloring)
}

// Component for a collapsible transition group
function TransitionGroupSection({ group, expandedGroups }: { group: TransitionGroup, expandedGroups: Signal<Set<string>> }) {
    const groupKey = `${group.from}->${group.to}`;
    const isExpanded = expandedGroups.value.has(groupKey);
    const targetClass = group.targetStatus.toLowerCase();
    
    const toggle = () => {
        const newSet = new Set(expandedGroups.value);
        if (isExpanded) {
            newSet.delete(groupKey);
        } else {
            newSet.add(groupKey);
        }
        expandedGroups.value = newSet;
    };

    return (
        <div class={`transition-group target-${targetClass}`}>
            <button type="button" class="transition-header" onClick={toggle}>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span class={`status-badge ${group.from.toLowerCase()}`}>{group.from}</span>
                <span class="arrow">→</span>
                <span class={`status-badge ${group.to.toLowerCase()}`}>{group.to}</span>
                <span class="count">({group.tests.length})</span>
            </button>
            {isExpanded && (
                <div class="transition-tests">
                    {group.tests.map(test => (
                        <div class="test-path" key={test.path}>
                            {stripPathPrefix(test.path)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Build output display component
function BuildOutputSection() {
    const outputRef = useRef<HTMLDivElement>(null);
    const lines = buildOutput.value;
    const isBuilding = rerunProgress.value.phase === 'building';
    
    // Auto-scroll to bottom when new lines are added
    useEffect(() => {
        if (outputRef.current && showBuildOutput.value) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines.length]);
    
    if (lines.length === 0 && !isBuilding) {
        return null;
    }
    
    return (
        <div class="build-output-section">
            <button 
                type="button"
                class="build-output-toggle"
                onClick={() => { showBuildOutput.value = !showBuildOutput.value; }}
            >
                {showBuildOutput.value ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <Terminal size={16} />
                <span>Build Output ({lines.length} lines)</span>
                {isBuilding && <RefreshCw size={14} class="spinning" />}
            </button>
            
            {showBuildOutput.value && (
                <div class="build-output-container" ref={outputRef}>
                    {lines.map((line, i) => (
                        <div class="build-output-line" key={i}>{line}</div>
                    ))}
                    {isBuilding && lines.length === 0 && (
                        <div class="build-output-line build-waiting">Waiting for build output...</div>
                    )}
                </div>
            )}
        </div>
    );
}

export function RerunModal() {
    const expandedGroups = useSignal<Set<string>>(new Set());
    const historyOpen = useSignal(false);
    const baselineOpen = useSignal(false);
    const baselineBtnRef = useRef<HTMLButtonElement>(null);
    
    // Close dropdowns when clicking outside
    const closeDropdowns = () => {
        historyOpen.value = false;
        baselineOpen.value = false;
    };
    
    const profileOptions = useComputed(() => {
        const profilesData = profiles.value;
        if (!profilesData?.profiles) return [];
        
        return Object.keys(profilesData.profiles).map(name => (
            <option value={name} key={name}>{name}</option>
        ));
    });

    const phaseText = useComputed(() => {
        const phase = rerunProgress.value.phase;
        switch (phase) {
            case 'idle': return 'Ready to run';
            case 'building': return 'Building engine...';
            case 'counting': return 'Counting tests...';
            case 'running': return `Running tests (${rerunProgress.value.completed}/${rerunProgress.value.total})`;
            case 'complete': return 'Complete!';
            case 'cancelled': return 'Cancelled';
            case 'error': return 'Error';
            default: return phase;
        }
    });

    // Stats with delta numbers inline (gained/lost shown separately)
    const stats = useComputed(() => {
        const p = rerunProgress.value;
        const diff = diffStats.value;
        const total = p.completed || 1;
        const pct = (v: number) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
        
        const getDelta = (key: keyof typeof diff.byStatus) => diff.byStatus[key];
        
        return [
            { label: 'Passed', value: p.passed, pct: pct(p.passed), class: 'pass', ...getDelta('pass') },
            { label: 'Failed', value: p.failed, pct: pct(p.failed), class: 'fail', ...getDelta('fail') },
            { label: 'Crashed', value: p.crashed, pct: pct(p.crashed), class: 'crash', ...getDelta('crash') },
            { label: 'Timeout', value: p.timeout, pct: pct(p.timeout), class: 'timeout', ...getDelta('timeout') },
            { label: 'Skipped', value: p.skipped, pct: pct(p.skipped), class: 'skip', ...getDelta('skip') },
        ];
    });

    // Group changed tests by transition type (FROM -> TO)
    const transitionGroups = useComputed(() => {
        const diff = diffStats.value;
        const groups = new Map<string, TransitionGroup>();
        
        for (const test of diff.changedTests) {
            if (!test.previousStatus) continue;
            const key = `${test.previousStatus}->${test.status}`;
            
            if (!groups.has(key)) {
                groups.set(key, {
                    from: test.previousStatus,
                    to: test.status,
                    tests: [],
                    targetStatus: test.status,
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
    });

    const recentResults = useComputed(() => {
        const results = rerunResults.value;
        return results.slice(-50).reverse();
    });

    const progressBars = useComputed(() => progressBreakdown.value);

    const totalChanges = useComputed(() => diffStats.value.changedTests.length);
    
    const historyCount = useComputed(() => backendHistory.value.length);

    if (!rerunModalOpen.value) {
        return null;
    }

    const hasChanges = totalChanges.value > 0;

    return (
        <div class="RerunModal-overlay" onClick={closeRerunModal}>
            <div class="RerunModal" onClick={(e) => { e.stopPropagation(); closeDropdowns(); }}>
                <div class="modal-header">
                    <h2>
                        <RefreshCw size={20} />
                        Rerun Tests
                        {rerunConfig.value.path && (
                            <span class="path-indicator">{rerunConfig.value.path}</span>
                        )}
                    </h2>
                    <div class="header-actions">
                        {/* History button */}
                        <div class="dropdown-container" onClick={(e) => e.stopPropagation()}>
                            <button 
                                type="button" 
                                class={`header-btn ${historyOpen.value ? 'active' : ''}`}
                                onClick={() => { historyOpen.value = !historyOpen.value; baselineOpen.value = false; }}
                                title="Run history"
                            >
                                <History size={16} />
                                {historyCount.value > 0 && (
                                    <span class="badge">{historyCount.value}</span>
                                )}
                            </button>
                            <HistoryDropdown isOpen={historyOpen} />
                        </div>
                        
                        {/* Close button */}
                        <button 
                            type="button" 
                            class="close-btn" 
                            onClick={closeRerunModal}
                            title="Close (run continues in background)"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div class="modal-body">
                    {/* Configuration - only show when idle */}
                    {rerunProgress.value.phase === 'idle' && (
                        <div class="config-section">
                            <div class="config-row">
                                <label>
                                    <span>Path:</span>
                                    <input 
                                        type="text" 
                                        value={rerunConfig.value.path}
                                        placeholder="Leave empty for all tests"
                                        onInput={(e) => {
                                            rerunConfig.value = {
                                                ...rerunConfig.value,
                                                path: (e.target as HTMLInputElement).value,
                                            };
                                        }}
                                    />
                                </label>
                            </div>
                            
                            <div class="config-row">
                                <label class="checkbox">
                                    <input 
                                        type="checkbox" 
                                        checked={rerunConfig.value.rebuild}
                                        onChange={(e) => {
                                            rerunConfig.value = {
                                                ...rerunConfig.value,
                                                rebuild: (e.target as HTMLInputElement).checked,
                                            };
                                        }}
                                    />
                                    <Wrench size={16} />
                                    <span>Rebuild before running</span>
                                </label>
                            </div>

                            <div class="config-row split">
                                <div class="field">
                                    <span>Profile:</span>
                                    <Select 
                                        value={rerunConfig.value.profile}
                                        onInput={(e) => {
                                            rerunConfig.value = {
                                                ...rerunConfig.value,
                                                profile: (e.target as HTMLSelectElement).value,
                                            };
                                        }}
                                    >
                                        <option value="">Default</option>
                                        {profileOptions}
                                    </Select>
                                </div>
                                
                                {/* Baseline selector */}
                                <div class="field" onClick={(e) => e.stopPropagation()}>
                                    <span>Baseline:</span>
                                    <button
                                        ref={baselineBtnRef}
                                        type="button"
                                        class={`baseline-btn ${baselineOpen.value ? 'active' : ''}`}
                                        onClick={() => { baselineOpen.value = !baselineOpen.value; historyOpen.value = false; }}
                                    >
                                        {getBaselineLabel(diffBaseline.value)}
                                        <ChevronDown size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Baseline dropdown rendered at modal level to avoid clipping */}
                            <BaselineSelector 
                                isOpen={baselineOpen} 
                                onClose={() => { baselineOpen.value = false; }} 
                                anchorRef={baselineBtnRef}
                            />
                        </div>
                    )}

                    {/* Progress - show when not idle */}
                    {rerunProgress.value.phase !== 'idle' && (
                        <div class="progress-section">
                            <div class="phase-indicator">
                                {isRunning.value && <RefreshCw class="spinning" size={16} />}
                                <span>{phaseText}</span>
                            </div>

                            <div class="progress-bar-container">
                                <div class="progress-bar-multi">
                                    <div class="progress-segment pass" style={{ width: `${progressBars.value.passed}%` }} />
                                    <div class="progress-segment fail" style={{ width: `${progressBars.value.failed}%` }} />
                                    <div class="progress-segment crash" style={{ width: `${progressBars.value.crashed}%` }} />
                                    <div class="progress-segment timeout" style={{ width: `${progressBars.value.timeout}%` }} />
                                    <div class="progress-segment skip" style={{ width: `${progressBars.value.skipped}%` }} />
                                </div>
                            </div>

                            {/* Stats with inline +gained/-lost */}
                            <div class="stats">
                                {stats.value.map(stat => (
                                    <div class={`stat ${stat.class}`} key={stat.label}>
                                        <span class="label">{stat.label}</span>
                                        <span class="value">{stat.value}</span>
                                        <span class="pct">({stat.pct}%)</span>
                                        {(stat.gained > 0 || stat.lost > 0) && (
                                            <span class="deltas">
                                                {stat.gained > 0 && <span class="gained">+{stat.gained}</span>}
                                                {stat.lost > 0 && <span class="lost">-{stat.lost}</span>}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Changed tests grouped by transition */}
                            {hasChanges && (
                                <div class="changes-section">
                                    <div class="changes-header">
                                        <span class="changes-title">Changed Tests ({totalChanges})</span>
                                        <div class="changes-summary">
                                            {diffStats.value.gained > 0 && (
                                                <span class="summary-stat gained">
                                                    <TrendingUp size={14} />
                                                    +{diffStats.value.gained}
                                                </span>
                                            )}
                                            {diffStats.value.lost > 0 && (
                                                <span class="summary-stat lost">
                                                    <TrendingDown size={14} />
                                                    -{diffStats.value.lost}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div class="transition-groups">
                                        {transitionGroups.value.map(group => (
                                            <TransitionGroupSection 
                                                key={`${group.from}->${group.to}`}
                                                group={group}
                                                expandedGroups={expandedGroups}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {rerunError.value && (
                                <div class="error-message">
                                    <AlertTriangle size={16} />
                                    {rerunError.value}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Results list */}
                    {rerunResults.value.length > 0 && (
                        <div class="results-section">
                            <button 
                                type="button"
                                class="results-toggle"
                                onClick={() => { showResults.value = !showResults.value; }}
                            >
                                {showResults.value ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                <span>Test Results ({rerunResults.value.length})</span>
                            </button>

                            {showResults.value && (
                                <div class="results-list">
                                    {recentResults.value.map(result => (
                                        <div class={`result-item ${result.status.toLowerCase()}`} key={result.path}>
                                            <span class={`status-badge ${result.status.toLowerCase()}`}>{result.status}</span>
                                            <span class="path">{stripPathPrefix(result.path)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <BuildOutputSection />
                </div>

                <div class="modal-footer">
                    {/* Start button - only when idle */}
                    {rerunProgress.value.phase === 'idle' && (
                        <Button color="primary" icon={Play} onClick={startRerun}>
                            Start
                        </Button>
                    )}
                    
                    {/* Cancel button - only when running */}
                    {isRunning.value && (
                        <Button color="danger" icon={Square} onClick={cancelRerun}>
                            Cancel
                        </Button>
                    )}
                    
                    {/* Close button - always shown */}
                    <Button color="secondary" onClick={closeRerunModal}>
                        {isRunning.value ? 'Minimize' : 'Close'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
