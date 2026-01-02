import type { LongStatusType, ShortStatusType } from './Status';
import { Tree } from './Tree';
import { activeSource, selectedEngine, selectedRef, loadingProgress, type DataSourceConfig, type LoadingProgress } from '#/Config';

export const Browsers = [
    'chrome',
    'edge',
    'firefox',
    'safari',
    'ladybird',
] as const;

export type FyiBrowser = typeof Browsers[number];

export interface Subtest {
    name: string;
    status: LongStatusType;
    message: string | null;
    known_intermittent: unknown[];
}

interface Run {
    id: number;
    browser_name: string;
    browser_version: string;
    os_name: string;
    os_version: string;
    revision: string;
    full_revision_hash: string;
    results_url: string;
    created_at: string;
    time_start: string;
    time_end: string;
    raw_results_url: string;
    labels: string[];
}

export interface FullEntry extends Subtest {
    test: string;
    subsuite: string;
    subtests: Subtest[];
    duration: number;
    run: Run;
}

// Compact test entry format
interface CompactTestEntry {
    p: string;
    s: ShortStatusType;
}

// ===== Boa Provider Types =====
type BoaResultCode = 'O' | 'F' | 'I' | 'P';

interface BoaTestNode {
    n: string;
    v?: number;
    r?: BoaResultCode;
    a?: { t: number; o: number; i: number; p: number };
    av?: Record<string, { t: number; o: number; i: number; p: number }>;
    s?: BoaTestNode[];
    t?: BoaTestNode[];
    f?: string[];
}

interface BoaLatestJson {
    c: string;
    u: string;
    r: BoaTestNode;
}

function boaResultToShortStatus(result: BoaResultCode): ShortStatusType {
    switch (result) {
        case 'O': return 'O';  // OK -> OK
        case 'F': return 'F';  // Fail -> Fail
        case 'I': return 'S';  // Ignored -> Skip
        case 'P': return 'C';  // Panic -> Crash
        default: return 'F';
    }
}

function flattenBoaTests(node: BoaTestNode, pathParts: string[] = []): CompactTestEntry[] {
    const results: CompactTestEntry[] = [];
    
    if (node.t) {
        for (const test of node.t) {
            // Add .js extension if not present (Boa data stores names without extension)
            const testName = test.n.endsWith('.js') ? test.n : `${test.n}.js`;
            const testPath = [...pathParts, testName].join('/');
            if (test.r !== undefined) {
                results.push({
                    p: testPath,
                    s: boaResultToShortStatus(test.r),
                });
            }
        }
    }
    
    if (node.s) {
        for (const subdir of node.s) {
            const subdirPath = [...pathParts, subdir.n];
            results.push(...flattenBoaTests(subdir, subdirPath));
        }
    }
    
    return results;
}

// ===== test262.fyi Provider Types =====
interface Test262FyiNode {
    total: number;
    engines: Record<string, number>;
    files?: Record<string, Test262FyiNode>;
}

// ===== LibJS Provider Types =====
type LibJSResult = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT' | 'PROCESS_ERROR' | 'RUNNER_EXCEPTION' | 'TODO_ERROR' | 'METADATA_ERROR' | 'HARNESS_ERROR';

interface LibJSPerFileData {
    duration: number;
    results: Record<string, LibJSResult>;
}

function libJSResultToShortStatus(result: LibJSResult): ShortStatusType {
    switch (result) {
        case 'PASSED': return 'P';
        case 'FAILED': return 'F';
        case 'SKIPPED': return 'S';
        case 'TIMEOUT': return 'T';
        case 'PROCESS_ERROR': return 'C';
        case 'RUNNER_EXCEPTION': return 'C';
        case 'HARNESS_ERROR': return 'C';
        case 'METADATA_ERROR': return 'F';
        case 'TODO_ERROR': return 'F';
        default: return 'F';
    }
}

// Cache for test262.fyi JSON files to avoid refetching on engine change
const test262FyiCache = new Map<string, Test262FyiNode>();

/**
 * Fetch a test262.fyi JSON file with caching
 */
async function fetchTest262FyiJson(baseUrl: string, path: string): Promise<Test262FyiNode | null> {
    const cacheKey = `${baseUrl}|${path}`;
    if (test262FyiCache.has(cacheKey)) {
        return test262FyiCache.get(cacheKey)!;
    }
    
    try {
        const url = path ? `${baseUrl}/${path}.json` : `${baseUrl}/index.json`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        test262FyiCache.set(cacheKey, data);
        return data;
    } catch {
        return null;
    }
}

export type ProgressCallback = (progress: LoadingProgress) => void;

/**
 * Recursively fetch test262.fyi data and extract per-file results.
 * Uses parallel fetching with batches for better performance.
 */
async function fetchAllTest262FyiData(
    baseUrl: string,
    engine: string,
    onProgress?: ProgressCallback
): Promise<CompactTestEntry[]> {
    const results: CompactTestEntry[] = [];
    const fetchedPaths = new Set<string>();
    
    // Queue of paths to fetch (without .json extension)
    const queue: string[] = [''];
    let totalDiscovered = 1; // Start with root
    let fetchedCount = 0;
    
    while (queue.length > 0) {
        // Fetch in batches of 20 for parallel requests
        const batch = queue.splice(0, 20);
        const fetches = batch.map(async (path) => {
            if (fetchedPaths.has(path)) return;
            fetchedPaths.add(path);
            
            const data = await fetchTest262FyiJson(baseUrl, path);
            fetchedCount++;
            
            // Report progress
            onProgress?.({
                fetched: fetchedCount,
                total: totalDiscovered,
                phase: queue.length > 0 ? 'discovering' : 'fetching',
            });
            
            if (!data?.files) return;
            
            for (const [name, child] of Object.entries(data.files)) {
                // If it's a .js file, it's a test
                if (name.endsWith('.js')) {
                    const passed = (child.engines[engine] || 0) > 0;
                    results.push({
                        p: name,
                        s: passed ? 'P' : 'F',
                    });
                } else {
                    // It's a directory - queue it for fetching if not already fetched
                    if (!fetchedPaths.has(name)) {
                        queue.push(name);
                        totalDiscovered++;
                    }
                }
            }
        });
        
        await Promise.all(fetches);
    }
    
    return results;
}

export class Fyi {
    #source: DataSourceConfig;
    #version: string;

    constructor(version = "HEAD~0", source?: DataSourceConfig) {
        this.#version = version;
        this.#source = source ?? activeSource.value ?? {
            name: 'Local',
            type: 'local',
            baseUrl: 'http://localhost:1215',
            description: 'Default local server',
        };
    }

    get baseUrl(): string {
        if (this.#source.type === 'github') {
            return `${this.#source.baseUrl}/${this.#version}`;
        }
        return this.#source.baseUrl;
    }

    get source(): DataSourceConfig {
        return this.#source;
    }

    async #get(_path: string): Promise<CompactTestEntry[]> {
        switch (this.#source.type) {
            case 'github':
                return await fetch(`${this.baseUrl}/results.json`).then(r => r.json());
            
            case 'local':
                return await fetch(`${this.baseUrl}/api/current`).then(r => r.json());
            
            case 'boa':
                return await this.#fetchBoaResults();
            
            case 'test262fyi':
                return await this.#fetchTest262FyiResults();
            
            case 'libjs':
                return await this.#fetchLibJSResults();
            
            default:
                throw new Error(`Unknown source type: ${this.#source.type}`);
        }
    }

    async #fetchBoaResults(): Promise<CompactTestEntry[]> {
        const ref = this.#source.ref || selectedRef.value || 'heads/main';
        const url = `${this.#source.baseUrl}/refs/${ref}/latest.json`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Boa results: ${response.status}`);
        }
        
        const data: BoaLatestJson = await response.json();
        return flattenBoaTests(data.r, []);
    }

    async #fetchTest262FyiResults(): Promise<CompactTestEntry[]> {
        const engine = this.#source.engine || selectedEngine.value || 'v8';
        const baseUrl = this.#source.baseUrl;
        
        // Clear previous progress and start reporting
        loadingProgress.value = { fetched: 0, total: 1, phase: 'discovering' };
        
        try {
            const result = await fetchAllTest262FyiData(baseUrl, engine, (progress) => {
                loadingProgress.value = progress;
            });
            return result;
        } finally {
            // Clear progress when done
            loadingProgress.value = null;
        }
    }

    async #fetchLibJSResults(): Promise<CompactTestEntry[]> {
        const url = `${this.#source.baseUrl}/per-file-master.json`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch LibJS results: ${response.status}`);
        }
        
        const data: LibJSPerFileData = await response.json();
        const results: CompactTestEntry[] = [];
        
        // Data structure: { duration: number, results: { "test/path.js": "PASSED", ... } }
        for (const [path, status] of Object.entries(data.results)) {
            // Paths in LibJS data include the test/ prefix, strip it
            // and ensure .js extension is preserved
            let testPath = path;
            if (testPath.startsWith('test/')) {
                testPath = testPath.slice('test/'.length);
            }
            
            results.push({
                p: testPath,
                s: libJSResultToShortStatus(status),
            });
        }
        
        return results;
    }

    async getTestDetails(path: string): Promise<FullEntry> {
        let data: { status?: string; msg?: string; duration?: number } = {};

        switch (this.#source.type) {
            case 'github': {
                const url = `${this.baseUrl}/results/${path}.json`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        data = { status: 'UNKNOWN', msg: `Failed to fetch details: ${response.status}` };
                    } else {
                        data = await response.json();
                    }
                } catch (error) {
                    data = { status: 'UNKNOWN', msg: `Failed to fetch details: ${error}` };
                }
                break;
            }
            
            case 'local':
                data = await fetch(`${this.baseUrl}/api/info/${path}.json`).then(r => r.json());
                break;
            
            case 'boa':
                // Boa doesn't provide individual test details
                data = { 
                    status: 'UNKNOWN', 
                    msg: 'Individual test details are not available for Boa data source' 
                };
                break;
            
            case 'test262fyi':
                // test262.fyi doesn't provide individual test details
                data = { 
                    status: 'UNKNOWN', 
                    msg: 'Individual test details are not available for test262.fyi (aggregate data only)' 
                };
                break;
            
            case 'libjs':
                // LibJS doesn't provide individual test details beyond pass/fail
                data = { 
                    status: 'UNKNOWN', 
                    msg: 'Individual test details are not available for LibJS data source' 
                };
                break;
        }

        return {
            test: path,
            subsuite: "",
            status: data.status as LongStatusType,
            duration: data.duration ?? 0,
            message: data.msg ?? null,
            subtests: [],
            known_intermittent: [],
            name: path,
            run: {
                id: 0,
                browser_name: "",
                browser_version: "",
                os_name: "",
                os_version: "",
                revision: "",
                full_revision_hash: "",
                results_url: "",
                created_at: "",
                time_start: String(Date.now()),
                time_end: String(Date.now()),
                raw_results_url: "",
                labels: [],
            }
        } as FullEntry;
    }

    async getTree() {
        const data = await this.#get('results');
        return new Tree(this, data);
    }
}

// ===== Utility functions for fetching provider-specific data =====

/**
 * Fetch available engines from test262.fyi
 */
export async function fetchTest262FyiEngines(): Promise<Record<string, string>> {
    try {
        const response = await fetch('https://data.test262.fyi/engines.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch engines: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch test262.fyi engines:', error);
        return {};
    }
}

/**
 * Fetch available refs from boa-dev/data
 */
export async function fetchBoaRefs(): Promise<string[]> {
    try {
        const tagsUrl = 'https://api.github.com/repos/boa-dev/data/contents/test262/refs/tags';
        const tagsResponse = await fetch(tagsUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        });
        
        const refs: string[] = ['heads/main'];
        
        if (tagsResponse.ok) {
            const tags = await tagsResponse.json();
            for (const tag of tags) {
                if (tag.type === 'dir') {
                    refs.push(`tags/${tag.name}`);
                }
            }
        }
        
        return refs;
    } catch (error) {
        console.error('Failed to fetch Boa refs:', error);
        return ['heads/main'];
    }
}
