import { signal, computed } from '@preact/signals';
import { activeSource, appConfig } from './Config';

export interface RerunConfig {
    path: string;
    rebuild: boolean;
    profile: string;
}

export interface TestResult {
    path: string;
    status: string;
    previousStatus?: string;
    message?: string;
    duration?: number;
}

export interface RunProgress {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
    crashed: number;
    timeout: number;
    phase: 'idle' | 'building' | 'counting' | 'running' | 'complete' | 'error' | 'cancelled';
    currentDir?: string;
    runId?: string;
}

export interface StatusDelta {
    gained: number;  // Tests that moved TO this status
    lost: number;    // Tests that moved FROM this status
}

export interface DiffStats {
    // Overall pass gained/lost (for the summary)
    gained: number;
    lost: number;
    // Per-status deltas
    byStatus: {
        pass: StatusDelta;
        fail: StatusDelta;
        crash: StatusDelta;
        timeout: StatusDelta;
        skip: StatusDelta;
    };
    changedTests: TestResult[];
}

// Backend run history entry (from /api/history)
export interface BackendRunHistoryEntry {
    id: string;
    path: string;
    profile?: string;
    startedAt: string;
    completedAt?: string;
    phase: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    crashed: number;
    timeout: number;
    gained: number;
    lost: number;
    baselineRef?: string;
}

// Git types
export interface GitCommit {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    date: string;
}

// Diff baseline configuration
export interface DiffBaseline {
    type: 'current' | 'commit' | 'run';  // current = results.json, commit = specific commit, run = historical run
    ref?: string;  // commit hash or run ID
}

// Rerun state
export const rerunModalOpen = signal(false);
export const rerunConfig = signal<RerunConfig>({
    path: '',
    rebuild: true,
    profile: '',
});
export const rerunProgress = signal<RunProgress>({
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    crashed: 0,
    timeout: 0,
    phase: 'idle',
});
export const rerunResults = signal([] as TestResult[]);
export const rerunError = signal<string | null>(null);
export const showResults = signal(false);
export const showChangedTests = signal(false);

// Build output lines
export const buildOutput = signal<string[]>([]);
export const showBuildOutput = signal(true);

// Backend history (fetched from server)
export const backendHistory = signal<BackendRunHistoryEntry[]>([]);
export const historyLoading = signal(false);

// Git state - commits from yavashark-data repo
export const gitCommits = signal<GitCommit[]>([]);

// Diff baseline
export const diffBaseline = signal<DiffBaseline>({ type: 'current' });

// Current run ID from backend
let activeRunId: string | null = null;

const emptyStatusDelta = (): StatusDelta => ({ gained: 0, lost: 0 });
const emptyDiffStats = (): DiffStats => ({
    gained: 0,
    lost: 0,
    byStatus: {
        pass: emptyStatusDelta(),
        fail: emptyStatusDelta(),
        crash: emptyStatusDelta(),
        timeout: emptyStatusDelta(),
        skip: emptyStatusDelta(),
    },
    changedTests: [],
});

// Diff stats - calculated in real-time
export const diffStats = signal<DiffStats>(emptyDiffStats());

// EventSource for SSE connection
let eventSource: EventSource | null = null;
let abortController: AbortController | null = null;

// Fetch run history from backend
export async function fetchHistory() {
    const source = activeSource.value;
    if (!source || source.type !== 'local') return;

    historyLoading.value = true;
    try {
        const res = await fetch(`${source.baseUrl}/api/history`);
        if (res.ok) {
            const data = await res.json();
            backendHistory.value = data.runs || [];
        }
    } catch (err) {
        console.error('Failed to fetch history:', err);
    } finally {
        historyLoading.value = false;
    }
}

// Delete a run from history
export async function deleteHistoryRun(id: string) {
    const source = activeSource.value;
    if (!source || source.type !== 'local') return;

    try {
        const res = await fetch(`${source.baseUrl}/api/history/${id}`, { method: 'DELETE' });
        if (res.ok) {
            backendHistory.value = backendHistory.value.filter(r => r.id !== id);
        }
    } catch (err) {
        console.error('Failed to delete run:', err);
    }
}

// Fetch commits from yavashark-data repo (via backend which calls GitHub API)
export async function fetchGitCommits() {
    const source = activeSource.value;
    if (!source || source.type !== 'local') return;

    try {
        const res = await fetch(`${source.baseUrl}/api/git/commits`);
        if (res.ok) {
            gitCommits.value = await res.json();
        }
    } catch (err) {
        console.error('Failed to fetch git commits:', err);
    }
}

export function openRerunModal(path = '') {
    const config = appConfig.value;
    
    // If there's a live run in progress, just show the modal with current state
    if (activeRunId && isRunning.value) {
        rerunModalOpen.value = true;
        return;
    }
    
    // Otherwise, prepare for a new run
    rerunConfig.value = {
        path,
        rebuild: true,
        profile: config?.defaultProfile ?? '',
    };
    rerunProgress.value = {
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        crashed: 0,
        timeout: 0,
        phase: 'idle',
    };
    rerunResults.value = [];
    rerunError.value = null;
    showResults.value = false;
    showChangedTests.value = false;
    diffStats.value = emptyDiffStats();
    rerunModalOpen.value = true;
    
    // Fetch history when opening modal
    fetchHistory();
}

// Close modal without cancelling a running test
export function closeRerunModal() {
    rerunModalOpen.value = false;
}

// Close modal AND cancel any running test
export function closeAndCancelRerun() {
    cancelRerun();
    rerunModalOpen.value = false;
}

export function cancelRerun() {
    const source = activeSource.value;
    
    // Close the EventSource connection first
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    
    // Call the cancel endpoint to stop backend processing
    if (isRunning.value && source?.type === 'local') {
        fetch(`${source.baseUrl}/api/cancel`, { method: 'POST' })
            .catch(err => console.error('Failed to cancel:', err));
    }
    
    if (isRunning.value) {
        rerunProgress.value = {
            ...rerunProgress.value,
            phase: 'cancelled',
        };
        activeRunId = null;
        // Refresh history to show the cancelled run
        setTimeout(fetchHistory, 500);
    }
}

export function startRerun() {
    const source = activeSource.value;
    if (!source || source.type !== 'local') {
        rerunError.value = 'Cannot rerun tests: not connected to local server';
        return;
    }

    const config = rerunConfig.value;
    const baseline = diffBaseline.value;
    const params = new URLSearchParams();
    params.set('rebuild', config.rebuild.toString());
    if (config.profile) {
        params.set('profile', config.profile);
    }
    
    // Pass baseline configuration
    params.set('baselineType', baseline.type);
    if (baseline.type === 'commit' && baseline.ref) {
        params.set('baselineRef', baseline.ref);
    } else if (baseline.type === 'run' && baseline.ref) {
        params.set('baselineRef', baseline.ref);
    }

    let endpoint = `${source.baseUrl}/api/rerun-stream`;
    if (config.path) {
        endpoint += `/${config.path}`;
    }
    endpoint += `?${params.toString()}`;

    // Reset state
    rerunProgress.value = {
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        crashed: 0,
        timeout: 0,
        phase: 'building',
    };
    rerunResults.value = [];
    rerunError.value = null;
    diffStats.value = emptyDiffStats();
    buildOutput.value = [];
    showBuildOutput.value = true;
    abortController = new AbortController();

    // Connect to SSE endpoint
    eventSource = new EventSource(endpoint);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'start':
                    // Backend sends run ID
                    activeRunId = data.data?.runId || null;
                    break;

                case 'progress':
                    rerunProgress.value = {
                        ...rerunProgress.value,
                        ...data.data,
                    };
                    if (data.data?.runId) {
                        activeRunId = data.data.runId;
                    }
                    break;

                case 'build_output':
                    // Append build output line
                    buildOutput.value = [...buildOutput.value, data.message];
                    break;
                    
                case 'test': {
                    const testResult = data.data as TestResult;
                    rerunResults.value = [...rerunResults.value, testResult];
                    
                    // Track changed tests for diff
                    if (testResult.previousStatus && testResult.previousStatus !== testResult.status) {
                        const current = diffStats.value;
                        const prev = testResult.previousStatus.toLowerCase() as keyof DiffStats['byStatus'];
                        const curr = testResult.status.toLowerCase() as keyof DiffStats['byStatus'];
                        
                        const isPreviouslyPassing = testResult.previousStatus === 'PASS';
                        const isNowPassing = testResult.status === 'PASS';
                        
                        // Clone the byStatus object
                        const newByStatus = { ...current.byStatus };
                        
                        // Update "lost" for the previous status (test left this status)
                        if (prev in newByStatus) {
                            newByStatus[prev] = {
                                ...newByStatus[prev],
                                lost: newByStatus[prev].lost + 1,
                            };
                        }
                        
                        // Update "gained" for the current status (test entered this status)
                        if (curr in newByStatus) {
                            newByStatus[curr] = {
                                ...newByStatus[curr],
                                gained: newByStatus[curr].gained + 1,
                            };
                        }
                        
                        diffStats.value = {
                            ...current,
                            gained: current.gained + (isNowPassing && !isPreviouslyPassing ? 1 : 0),
                            lost: current.lost + (isPreviouslyPassing && !isNowPassing ? 1 : 0),
                            byStatus: newByStatus,
                            changedTests: [...current.changedTests, testResult],
                        };
                    }
                    break;
                }
                    
                case 'error':
                    rerunError.value = data.message;
                    rerunProgress.value = {
                        ...rerunProgress.value,
                        phase: 'error',
                    };
                    activeRunId = null;
                    eventSource?.close();
                    eventSource = null;
                    // Refresh history
                    setTimeout(fetchHistory, 500);
                    break;
                    
                case 'complete':
                    rerunProgress.value = {
                        ...rerunProgress.value,
                        phase: 'complete',
                    };
                    activeRunId = null;
                    eventSource?.close();
                    eventSource = null;
                    // Refresh history
                    setTimeout(fetchHistory, 500);
                    break;
                    
                case 'cancelled':
                    rerunProgress.value = {
                        ...rerunProgress.value,
                        phase: 'cancelled',
                    };
                    activeRunId = null;
                    eventSource?.close();
                    eventSource = null;
                    // Refresh history
                    setTimeout(fetchHistory, 500);
                    break;
            }
        } catch (e) {
            console.error('Failed to parse SSE event:', e);
        }
    };

    eventSource.onerror = () => {
        if (rerunProgress.value.phase !== 'cancelled') {
            rerunError.value = 'Connection to server lost';
            rerunProgress.value = {
                ...rerunProgress.value,
                phase: 'error',
            };
        }
        activeRunId = null;
        eventSource?.close();
        eventSource = null;
    };
}

export const progressPercent = computed(() => {
    const progress = rerunProgress.value;
    if (progress.total === 0) return 0;
    return (progress.completed / progress.total) * 100;
});

export const isRunning = computed(() => {
    const phase = rerunProgress.value.phase;
    return phase === 'building' || phase === 'counting' || phase === 'running';
});

// Check if there's a live run in progress
export const hasLiveRun = computed(() => {
    return activeRunId !== null && isRunning.value;
});

// Progress breakdown by status for multi-color progress bar
export const progressBreakdown = computed(() => {
    const p = rerunProgress.value;
    const total = p.total || 1;
    return {
        passed: (p.passed / total) * 100,
        failed: (p.failed / total) * 100,
        crashed: (p.crashed / total) * 100,
        timeout: (p.timeout / total) * 100,
        skipped: (p.skipped / total) * 100,
    };
});
