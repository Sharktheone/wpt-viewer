import '#/Style/components/CompareView.scss';

import { X, GitCompare, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, ArrowLeftRight, GitCommit, Clock, Server, History } from 'lucide-preact';
import { useSignal, type Signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { Button } from './Ui/Button';
import {
    compareModalOpen,
    leftSource,
    rightSource,
    isComparing,
    compareError,
    compareStats,
    commits,
    commitsLoading,
    transitionGroups,
    fetchCommits,
    runComparison,
    closeCompareModal,
    resetComparison,
    swapSources,
    getSourceLabel,
    backendHistory,
    type CompareSource,
    type TransitionGroup,
} from '#/CompareState';
import { activeSource } from '#/Config';

// Format relative time
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString();
}

// Strip common path prefixes
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

// Source selector dropdown component
function SourceSelector({ 
    source, 
    setSource, 
    label,
    isOpen,
    anchorRef,
}: { 
    source: Signal<CompareSource>;
    setSource: (s: CompareSource) => void;
    label: string;
    isOpen: Signal<boolean>;
    anchorRef: preact.RefObject<HTMLButtonElement>;
}) {
    const commitList = commits.value;
    const loading = commitsLoading.value;
    const history = backendHistory.value;
    const isLocalAvailable = activeSource.value?.type === 'local';
    const dropdownStyle = useSignal<{ top: number; left: number } | null>(null);
    
    // Fetch commits when dropdown opens
    useEffect(() => {
        if (isOpen.value && commitList.length === 0 && !loading) {
            fetchCommits();
        }
    }, [isOpen.value]);
    
    // Calculate position when open
    useEffect(() => {
        if (isOpen.value && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            dropdownStyle.value = {
                top: rect.bottom + 4,
                left: rect.left,
            };
        }
    }, [isOpen.value]);
    
    if (!isOpen.value || !dropdownStyle.value) return null;
    
    const selectSource = (newSource: CompareSource) => {
        setSource(newSource);
        isOpen.value = false;
    };
    
    return (
        <div 
            class="source-dropdown"
            style={{
                position: 'fixed',
                top: `${dropdownStyle.value.top}px`,
                left: `${dropdownStyle.value.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div class="source-dropdown-header">
                Select {label}
            </div>
            
            <div class="source-options">
                {/* Current results option (GitHub/latest) */}
                <button
                    type="button"
                    class={`source-option ${source.value.type === 'current' ? 'active' : ''}`}
                    onClick={() => selectSource({ type: 'current' })}
                >
                    <Clock size={14} />
                    <span>Current (GitHub/latest)</span>
                </button>
                
                <button
                    type="button"
                    class={`source-option ${source.value.type === 'local' ? 'active' : ''} ${!isLocalAvailable ? 'disabled' : ''}`}
                    onClick={() => isLocalAvailable && selectSource({ type: 'local' })}
                    disabled={!isLocalAvailable}
                    title={!isLocalAvailable ? 'Connect to a local server to use this option' : undefined}
                >
                    <Server size={14} />
                    <span>Local server</span>
                    {!isLocalAvailable && <span class="unavailable">(not connected)</span>}
                </button>
                
                {/* Commits from yavashark-data */}
                <div class="source-section-label">
                    <GitCommit size={12} />
                    <span>Commits</span>
                    {loading && <RefreshCw size={12} class="spinning" />}
                </div>
                
                <div class="commit-list">
                    {commitList.length === 0 && !loading && (
                        <div class="empty-message">No commits found</div>
                    )}
                    {commitList.map(c => (
                        <button
                            type="button"
                            class={`commit-item ${source.value.type === 'commit' && source.value.ref === c.hash ? 'active' : ''}`}
                            key={c.hash}
                            onClick={() => selectSource({ 
                                type: 'commit', 
                                ref: c.hash, 
                                label: c.subject 
                            })}
                        >
                            <code class="commit-hash">{c.shortHash}</code>
                            <span class="commit-subject">{c.subject}</span>
                            <span class="commit-date">{formatRelativeTime(c.date)}</span>
                        </button>
                    ))}
                </div>
                
                {/* Run history */}
                {history.length > 0 && (
                    <>
                        <div class="source-section-label">
                            <History size={12} />
                            <span>Run History</span>
                            <span class="unavailable">(summary only)</span>
                        </div>
                        
                        <div class="run-list">
                            {history.slice(0, 10).map(run => (
                                <button
                                    type="button"
                                    class={`run-item ${source.value.type === 'run' && source.value.ref === run.id ? 'active' : ''} disabled`}
                                    key={run.id}
                                    disabled
                                    title="Full test results are not stored for historical runs yet"
                                >
                                    <span class="run-path">{run.path || 'All tests'}</span>
                                    <span class="run-stats">{run.passed}/{run.total}</span>
                                    <span class="run-date">{formatRelativeTime(run.startedAt)}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Stats comparison display
function StatsDisplay() {
    const stats = compareStats.value;
    if (!stats) return null;
    
    const formatPct = (n: number, total: number) => 
        total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
    
    return (
        <div class="stats-comparison">
            <div class="stats-side left">
                <h4>Left</h4>
                <div class="stats-grid">
                    <div class="stat pass">
                        <span class="label">Pass</span>
                        <span class="value">{stats.left.pass}</span>
                        <span class="pct">({formatPct(stats.left.pass, stats.left.total)}%)</span>
                    </div>
                    <div class="stat fail">
                        <span class="label">Fail</span>
                        <span class="value">{stats.left.fail}</span>
                    </div>
                    <div class="stat crash">
                        <span class="label">Crash</span>
                        <span class="value">{stats.left.crash}</span>
                    </div>
                    <div class="stat timeout">
                        <span class="label">Timeout</span>
                        <span class="value">{stats.left.timeout}</span>
                    </div>
                    <div class="stat skip">
                        <span class="label">Skip</span>
                        <span class="value">{stats.left.skip}</span>
                    </div>
                    <div class="stat total">
                        <span class="label">Total</span>
                        <span class="value">{stats.left.total}</span>
                    </div>
                </div>
            </div>
            
            <div class="stats-diff">
                <div class="diff-stat">
                    <span class={`diff-value ${stats.gained > 0 ? 'positive' : ''}`}>
                        {stats.gained > 0 && <TrendingUp size={14} />}
                        +{stats.gained} gained
                    </span>
                </div>
                <div class="diff-stat">
                    <span class={`diff-value ${stats.lost > 0 ? 'negative' : ''}`}>
                        {stats.lost > 0 && <TrendingDown size={14} />}
                        -{stats.lost} lost
                    </span>
                </div>
                <div class="diff-stat">
                    <span class="diff-value neutral">
                        {stats.changed} changed
                    </span>
                </div>
            </div>
            
            <div class="stats-side right">
                <h4>Right</h4>
                <div class="stats-grid">
                    <div class="stat pass">
                        <span class="label">Pass</span>
                        <span class="value">{stats.right.pass}</span>
                        <span class="pct">({formatPct(stats.right.pass, stats.right.total)}%)</span>
                    </div>
                    <div class="stat fail">
                        <span class="label">Fail</span>
                        <span class="value">{stats.right.fail}</span>
                    </div>
                    <div class="stat crash">
                        <span class="label">Crash</span>
                        <span class="value">{stats.right.crash}</span>
                    </div>
                    <div class="stat timeout">
                        <span class="label">Timeout</span>
                        <span class="value">{stats.right.timeout}</span>
                    </div>
                    <div class="stat skip">
                        <span class="label">Skip</span>
                        <span class="value">{stats.right.skip}</span>
                    </div>
                    <div class="stat total">
                        <span class="label">Total</span>
                        <span class="value">{stats.right.total}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Transition group section (collapsible)
function TransitionGroupSection({ group, expandedGroups }: { 
    group: TransitionGroup; 
    expandedGroups: Signal<Set<string>>; 
}) {
    const groupKey = `${group.from}->${group.to}`;
    const isExpanded = expandedGroups.value.has(groupKey);
    const targetClass = group.to.toLowerCase();
    
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
                <span class="arrow">-&gt;</span>
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

export function CompareView() {
    const expandedGroups = useSignal<Set<string>>(new Set());
    const leftDropdownOpen = useSignal(false);
    const rightDropdownOpen = useSignal(false);
    const leftBtnRef = useRef<HTMLButtonElement>(null);
    const rightBtnRef = useRef<HTMLButtonElement>(null);
    
    const closeDropdowns = () => {
        leftDropdownOpen.value = false;
        rightDropdownOpen.value = false;
    };
    
    const groups = transitionGroups.value;
    const stats = compareStats.value;
    const comparing = isComparing.value;
    const error = compareError.value;
    
    if (!compareModalOpen.value) {
        return null;
    }
    
    const canCompare = 
        (leftSource.value.type === 'current' || leftSource.value.type === 'local' || leftSource.value.ref) &&
        (rightSource.value.type === 'current' || rightSource.value.type === 'local' || rightSource.value.ref);
    
    return (
        <div class="CompareView-overlay" onClick={closeCompareModal}>
            <div class="CompareView" onClick={(e) => { e.stopPropagation(); closeDropdowns(); }}>
                <div class="modal-header">
                    <h2>
                        <GitCompare size={20} />
                        Compare Results
                    </h2>
                    <button 
                        type="button" 
                        class="close-btn" 
                        onClick={closeCompareModal}
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div class="modal-body">
                    {/* Source selection */}
                    <div class="source-selection">
                        <div class="source-picker" onClick={(e) => e.stopPropagation()}>
                            <span class="picker-label">Left:</span>
                            <button
                                ref={leftBtnRef}
                                type="button"
                                class={`source-btn ${leftDropdownOpen.value ? 'active' : ''}`}
                                onClick={() => { 
                                    leftDropdownOpen.value = !leftDropdownOpen.value; 
                                    rightDropdownOpen.value = false; 
                                }}
                            >
                                {getSourceLabel(leftSource.value)}
                                <ChevronDown size={14} />
                            </button>
                            <SourceSelector
                                source={leftSource}
                                setSource={(s) => { leftSource.value = s; resetComparison(); }}
                                label="Left Source"
                                isOpen={leftDropdownOpen}
                                anchorRef={leftBtnRef}
                            />
                        </div>
                        
                        <button 
                            type="button" 
                            class="swap-btn" 
                            onClick={swapSources}
                            title="Swap sources"
                        >
                            <ArrowLeftRight size={18} />
                        </button>
                        
                        <div class="source-picker" onClick={(e) => e.stopPropagation()}>
                            <span class="picker-label">Right:</span>
                            <button
                                ref={rightBtnRef}
                                type="button"
                                class={`source-btn ${rightDropdownOpen.value ? 'active' : ''}`}
                                onClick={() => { 
                                    rightDropdownOpen.value = !rightDropdownOpen.value; 
                                    leftDropdownOpen.value = false; 
                                }}
                            >
                                {getSourceLabel(rightSource.value)}
                                <ChevronDown size={14} />
                            </button>
                            <SourceSelector
                                source={rightSource}
                                setSource={(s) => { rightSource.value = s; resetComparison(); }}
                                label="Right Source"
                                isOpen={rightDropdownOpen}
                                anchorRef={rightBtnRef}
                            />
                        </div>
                    </div>
                    
                    {/* Error message */}
                    {error && (
                        <div class="error-message">
                            {error}
                        </div>
                    )}
                    
                    {/* Loading state */}
                    {comparing && (
                        <div class="loading-state">
                            <RefreshCw class="spinning" size={24} />
                            <span>Comparing results...</span>
                        </div>
                    )}
                    
                    {/* Results */}
                    {stats && !comparing && (
                        <>
                            <StatsDisplay />
                            
                            {groups.length > 0 && (
                                <div class="changes-section">
                                    <div class="changes-header">
                                        <span class="changes-title">Changed Tests ({stats.changed})</span>
                                        <div class="changes-summary">
                                            {stats.gained > 0 && (
                                                <span class="summary-stat gained">
                                                    <TrendingUp size={14} />
                                                    +{stats.gained}
                                                </span>
                                            )}
                                            {stats.lost > 0 && (
                                                <span class="summary-stat lost">
                                                    <TrendingDown size={14} />
                                                    -{stats.lost}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div class="transition-groups">
                                        {groups.map(group => (
                                            <TransitionGroupSection
                                                key={`${group.from}->${group.to}`}
                                                group={group}
                                                expandedGroups={expandedGroups}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {groups.length === 0 && (
                                <div class="no-changes">
                                    No differences found between the selected sources.
                                </div>
                            )}
                        </>
                    )}
                </div>
                
                <div class="modal-footer">
                    <Button 
                        color="primary" 
                        icon={GitCompare} 
                        onClick={runComparison}
                        disabled={!canCompare || comparing}
                    >
                        {comparing ? 'Comparing...' : 'Compare'}
                    </Button>
                    <Button color="secondary" onClick={closeCompareModal}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
