import { signal, computed } from '@preact/signals';
import { activeSource, selectedEngine, selectedRef } from './Config';
import { backendHistory, fetchHistory, type BackendRunHistoryEntry } from './RerunState';
import { fetchAllTest262FyiData } from './Wpt/Fyi';

// GitHub constants for yavashark-data repo
const DATA_REPO_OWNER = 'Sharktheone';
const DATA_REPO_NAME = 'yavashark-data';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Boa constants
const BOA_DATA_BASE = 'https://raw.githubusercontent.com/boa-dev/data/main/test262';

// test262.fyi constants
const TEST262FYI_BASE = 'https://test262-fyi.github.io/data';

// Types
export interface GitCommit {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    date: string;
}

export interface CompareSource {
    type: 'commit' | 'run' | 'current' | 'local' | 'boa' | 'test262fyi';
    ref?: string;        // commit hash, run ID, boa ref, or engine name
    label?: string;      // display label
}

export interface TestResult {
    path: string;
    status: string;
}

export interface CompareResult {
    path: string;
    leftStatus: string;
    rightStatus: string;
}

export interface StatusCounts {
    pass: number;
    fail: number;
    crash: number;
    timeout: number;
    skip: number;
    total: number;
}

export interface CompareStats {
    left: StatusCounts;
    right: StatusCounts;
    gained: number;      // Tests that went from non-pass to pass
    lost: number;        // Tests that went from pass to non-pass
    changed: number;     // Total tests with different status
    unchanged: number;   // Total tests with same status
    onlyLeft: number;    // Tests only in left
    onlyRight: number;   // Tests only in right
}

export interface TransitionGroup {
    from: string;
    to: string;
    tests: CompareResult[];
}

// State signals
export const compareModalOpen = signal(false);
export const leftSource = signal<CompareSource>({ type: 'current' });
export const rightSource = signal<CompareSource>({ type: 'commit' });
export const isComparing = signal(false);
export const compareError = signal<string | null>(null);
export const compareStats = signal<CompareStats | null>(null);
export const changedTests = signal<CompareResult[]>([]);
export const commits = signal<GitCommit[]>([]);
export const commitsLoading = signal(false);

export { backendHistory, fetchHistory, type BackendRunHistoryEntry };

// Helper to create empty status counts
function emptyStatusCounts(): StatusCounts {
    return { pass: 0, fail: 0, crash: 0, timeout: 0, skip: 0, total: 0 };
}

// Fetch commits from yavashark-data repo (works without local server)
export async function fetchCommits(): Promise<GitCommit[]> {
    if (commitsLoading.value) return commits.value;
    
    commitsLoading.value = true;
    
    try {
        // Try local server first if available
        const source = activeSource.value;
        if (source?.type === 'local') {
            try {
                const res = await fetch(`${source.baseUrl}/api/git/commits`);
                if (res.ok) {
                    const data = await res.json();
                    commits.value = data;
                    return data;
                }
            } catch {
                // Fall through to GitHub API
            }
        }
        
        // Direct GitHub API call (works for static site)
        const url = `${GITHUB_API_BASE}/repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/commits?per_page=50`;
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`GitHub API error: ${res.status}`);
        }
        
        const ghCommits = await res.json();
        const result: GitCommit[] = ghCommits.map((c: any) => ({
            hash: c.sha,
            shortHash: c.sha.slice(0, 7),
            subject: c.commit.message.split('\n')[0],
            author: c.commit.author.name,
            date: c.commit.author.date,
        }));
        
        commits.value = result;
        return result;
    } catch (err) {
        console.error('Failed to fetch commits:', err);
        compareError.value = `Failed to fetch commits: ${err}`;
        return [];
    } finally {
        commitsLoading.value = false;
    }
}

// Fetch results for a specific commit from GitHub
async function fetchResultsForCommit(commitHash: string): Promise<Map<string, string>> {
    const url = `${GITHUB_RAW_BASE}/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/${commitHash}/results.json`;
    
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch results for commit ${commitHash}: ${res.status}`);
    }
    
    const data = await res.json();
    const map = new Map<string, string>();
    
    // Handle both CI format (compact) and full format
    for (const item of data) {
        // CI format has 's' and 'p', full format has 'status' and 'path'
        const path = item.p || item.path;
        const rawStatus = item.s ?? item.status;
        
        if (path && rawStatus !== undefined) {
            map.set(path, normalizeStatus(rawStatus));
        }
    }
    
    return map;
}

// Convert CI numeric status to string
function ciStatusToString(status: number): string {
    switch (status) {
        case 0: return 'PASS';
        case 1: return 'FAIL';
        case 2: return 'SKIP';
        case 3: return 'TIMEOUT';
        case 4: return 'CRASH';
        default: return 'UNKNOWN';
    }
}

// Convert CI short string status (F, P, T, C, S, etc.) to full status name
function ciShortStatusToString(status: string): string {
    switch (status.toUpperCase()) {
        case 'P': return 'PASS';
        case 'F': return 'FAIL';
        case 'S': return 'SKIP';
        case 'T': return 'TIMEOUT';
        case 'C': return 'CRASH';
        case 'O': return 'PASS';  // CI_OK maps to PARSE_ERROR but we show as PASS
        case 'E': return 'FAIL';  // CI_ERROR
        case 'N': return 'SKIP';  // CI_NOT_RUN
        case 'PF': return 'SKIP'; // CI_PRECONDITION_FAILED
        // Already full status names
        case 'PASS': return 'PASS';
        case 'FAIL': return 'FAIL';
        case 'SKIP': return 'SKIP';
        case 'TIMEOUT': return 'TIMEOUT';
        case 'CRASH': return 'CRASH';
        default: return status.toUpperCase();
    }
}

// Normalize status to full uppercase name
function normalizeStatus(status: string | number): string {
    if (typeof status === 'number') {
        return ciStatusToString(status);
    }
    return ciShortStatusToString(status);
}

// Fetch current results (from local server or current results.json)
async function fetchCurrentResults(): Promise<Map<string, string>> {
    const source = activeSource.value;
    
    // Handle based on source type
    if (source?.type === 'local') {
        try {
            const res = await fetch(`${source.baseUrl}/api/current`);
            if (res.ok) {
                const data = await res.json();
                const map = new Map<string, string>();
                for (const item of data) {
                    const path = item.p || item.path;
                    const rawStatus = item.s ?? item.status;
                    if (path && rawStatus !== undefined) {
                        map.set(path, normalizeStatus(rawStatus));
                    }
                }
                return map;
            }
        } catch {
            // Fall through
        }
    }
    
    // Handle Boa source
    if (source?.type === 'boa') {
        return fetchBoaResults(source.ref || selectedRef.value);
    }
    
    // Handle test262.fyi source
    if (source?.type === 'test262fyi') {
        return fetchTest262FyiResults(source.engine || selectedEngine.value);
    }
    
    // For GitHub/static site, fetch from latest commit
    const commitList = commits.value.length > 0 ? commits.value : await fetchCommits();
    if (commitList.length === 0) {
        throw new Error('No commits available to fetch current results');
    }
    
    return fetchResultsForCommit(commitList[0].hash);
}

// Fetch results for a given source
async function fetchResultsForSource(source: CompareSource): Promise<Map<string, string>> {
    switch (source.type) {
        case 'commit':
            if (!source.ref) throw new Error('Commit ref is required');
            return fetchResultsForCommit(source.ref);
        case 'current':
            return fetchCurrentResults();
        case 'local':
            return fetchLocalResults();
        case 'boa':
            return fetchBoaResults(source.ref);
        case 'test262fyi':
            return fetchTest262FyiResults(source.ref);
        case 'run':
            throw new Error('Run history comparison is not yet supported. Run results need to be stored separately.');
        default:
            throw new Error(`Unknown source type: ${source.type}`);
    }
}

async function fetchLocalResults(): Promise<Map<string, string>> {
    const source = activeSource.value;
    
    if (source?.type !== 'local') {
        throw new Error('Local source is not available. Connect to a local server first.');
    }
    
    const res = await fetch(`${source.baseUrl}/api/current`);
    if (!res.ok) {
        throw new Error(`Failed to fetch local results: ${res.status}`);
    }
    
    const data = await res.json();
    const map = new Map<string, string>();
    for (const item of data) {
        const path = item.p || item.path;
        const rawStatus = item.s ?? item.status;
        if (path && rawStatus !== undefined) {
            map.set(path, normalizeStatus(rawStatus));
        }
    }
    return map;
}

// ===== Boa Data Provider =====

type BoaResultCode = 'O' | 'F' | 'I' | 'P';

interface BoaTestNode {
    n: string;
    v?: number;
    r?: BoaResultCode;
    a?: { t: number; o: number; i: number; p: number };
    s?: BoaTestNode[];
    t?: BoaTestNode[];
}

interface BoaLatestJson {
    c: string;
    u: string;
    r: BoaTestNode;
}

function boaResultToStatus(result: BoaResultCode): string {
    switch (result) {
        case 'O': return 'PASS';
        case 'F': return 'FAIL';
        case 'I': return 'SKIP';
        case 'P': return 'CRASH';
        default: return 'FAIL';
    }
}

function flattenBoaTestsForCompare(node: BoaTestNode, pathParts: string[] = []): Map<string, string> {
    const results = new Map<string, string>();
    
    if (node.t) {
        for (const test of node.t) {
            const testPath = [...pathParts, test.n].join('/');
            if (test.r !== undefined) {
                results.set(testPath, boaResultToStatus(test.r));
            }
        }
    }
    
    if (node.s) {
        for (const subdir of node.s) {
            const subdirPath = [...pathParts, subdir.n];
            const subdirResults = flattenBoaTestsForCompare(subdir, subdirPath);
            for (const [path, status] of subdirResults) {
                results.set(path, status);
            }
        }
    }
    
    return results;
}

async function fetchBoaResults(ref?: string): Promise<Map<string, string>> {
    const boaRef = ref || selectedRef.value || 'heads/main';
    const url = `${BOA_DATA_BASE}/refs/${boaRef}/latest.json`;
    
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch Boa results: ${res.status}`);
    }
    
    const data: BoaLatestJson = await res.json();
    return flattenBoaTestsForCompare(data.r, []);
}

// ===== test262.fyi Data Provider =====

async function fetchTest262FyiResults(engine?: string): Promise<Map<string, string>> {
    const selectedEngineName = engine || selectedEngine.value || 'v8';
    const baseUrl = activeSource.value?.type === 'test262fyi'
        ? activeSource.value.baseUrl
        : TEST262FYI_BASE;

    const entries = await fetchAllTest262FyiData(baseUrl, selectedEngineName);
    const results = new Map<string, string>();
    for (const entry of entries) {
        results.set(entry.p, entry.s === 'P' ? 'PASS' : 'FAIL');
    }
    return results;
}

// Calculate status counts from results
function calculateStatusCounts(results: Map<string, string>): StatusCounts {
    const counts = emptyStatusCounts();
    
    for (const status of results.values()) {
        counts.total++;
        switch (status.toUpperCase()) {
            case 'PASS': counts.pass++; break;
            case 'FAIL': counts.fail++; break;
            case 'CRASH': counts.crash++; break;
            case 'TIMEOUT': counts.timeout++; break;
            case 'SKIP': counts.skip++; break;
        }
    }
    
    return counts;
}

// Run the comparison
export async function runComparison(): Promise<void> {
    if (isComparing.value) return;
    
    isComparing.value = true;
    compareError.value = null;
    compareStats.value = null;
    changedTests.value = [];
    
    try {
        // Fetch both sets of results
        const [leftResults, rightResults] = await Promise.all([
            fetchResultsForSource(leftSource.value),
            fetchResultsForSource(rightSource.value),
        ]);
        
        // Calculate stats
        const leftCounts = calculateStatusCounts(leftResults);
        const rightCounts = calculateStatusCounts(rightResults);
        
        // Find changed tests
        const changed: CompareResult[] = [];
        let gained = 0;
        let lost = 0;
        let unchangedCount = 0;
        let onlyLeft = 0;
        let onlyRight = 0;
        
        // Check all paths from both sides
        const allPaths = new Set([...leftResults.keys(), ...rightResults.keys()]);
        
        for (const path of allPaths) {
            const leftStatus = leftResults.get(path);
            const rightStatus = rightResults.get(path);
            
            if (!leftStatus && rightStatus) {
                onlyRight++;
                continue;
            }
            
            if (leftStatus && !rightStatus) {
                onlyLeft++;
                continue;
            }
            
            if (leftStatus !== rightStatus) {
                changed.push({
                    path,
                    leftStatus: leftStatus!,
                    rightStatus: rightStatus!,
                });
                
                // Track pass gains/losses
                if (leftStatus !== 'PASS' && rightStatus === 'PASS') {
                    gained++;
                } else if (leftStatus === 'PASS' && rightStatus !== 'PASS') {
                    lost++;
                }
            } else {
                unchangedCount++;
            }
        }
        
        compareStats.value = {
            left: leftCounts,
            right: rightCounts,
            gained,
            lost,
            changed: changed.length,
            unchanged: unchangedCount,
            onlyLeft,
            onlyRight,
        };
        
        changedTests.value = changed;
        
    } catch (err) {
        compareError.value = err instanceof Error ? err.message : String(err);
    } finally {
        isComparing.value = false;
    }
}

// Group changed tests by transition type
export const transitionGroups = computed(() => {
    const tests = changedTests.value;
    const groups = new Map<string, TransitionGroup>();
    
    for (const test of tests) {
        const key = `${test.leftStatus}->${test.rightStatus}`;
        
        if (!groups.has(key)) {
            groups.set(key, {
                from: test.leftStatus,
                to: test.rightStatus,
                tests: [],
            });
        }
        groups.get(key)!.tests.push(test);
    }
    
    // Sort: gains first (to PASS), then losses (from PASS), then others
    const isGain = (g: TransitionGroup) => g.to === 'PASS';
    const isLoss = (g: TransitionGroup) => g.from === 'PASS';
    
    return Array.from(groups.values()).sort((a, b) => {
        if (isGain(a) && !isGain(b)) return -1;
        if (!isGain(a) && isGain(b)) return 1;
        if (isLoss(a) && !isLoss(b)) return -1;
        if (!isLoss(a) && isLoss(b)) return 1;
        return a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
    });
});

// Get label for a source
export function getSourceLabel(source: CompareSource): string {
    switch (source.type) {
        case 'current':
            return 'Current (GitHub/latest)';
        case 'local':
            return 'Local server';
        case 'commit':
            return source.label || (source.ref ? `Commit ${source.ref.slice(0, 7)}` : 'Select commit...');
        case 'run':
            return source.label || (source.ref ? `Run ${source.ref.slice(0, 8)}` : 'Select run...');
        case 'boa':
            return source.label || (source.ref ? `Boa (${source.ref.replace('heads/', '').replace('tags/', '')})` : 'Boa (main)');
        case 'test262fyi':
            return source.label || (source.ref ? `test262.fyi (${source.ref})` : 'test262.fyi');
        default:
            return 'Unknown';
    }
}

// Open the compare modal
export function openCompareModal(): void {
    compareModalOpen.value = true;
    compareError.value = null;
    
    // Fetch commits when opening
    if (commits.value.length === 0) {
        fetchCommits();
    }
    
    // Fetch run history
    fetchHistory();
}

// Close the compare modal  
export function closeCompareModal(): void {
    compareModalOpen.value = false;
}

// Reset comparison state
export function resetComparison(): void {
    compareStats.value = null;
    changedTests.value = [];
    compareError.value = null;
}

// Swap left and right sources
export function swapSources(): void {
    const temp = leftSource.value;
    leftSource.value = rightSource.value;
    rightSource.value = temp;
    
    // Reset results when swapping
    resetComparison();
}
