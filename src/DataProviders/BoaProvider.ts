/**
 * Boa Data Provider
 * Fetches test262 results from the boa-dev/data GitHub repository
 */

import type { 
    DataProvider, 
    ProviderOptions, 
    ProviderCapabilities,
    CompactTestEntry,
    TestDetails,
    DataSourceMetadata,
} from './types';
import type { ShortStatusType } from '#/Wpt/Status';

const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com/boa-dev/data/main/test262';

// Boa result codes
type BoaResultCode = 'O' | 'F' | 'I' | 'P'; // Ok, Fail, Ignored, Panic

/**
 * Boa's nested test structure
 */
interface BoaTestNode {
    n: string;  // name
    v?: number; // ES version
    r?: BoaResultCode; // result (for tests)
    a?: BoaAggregates; // aggregates (for directories)
    av?: Record<string, BoaAggregates>; // aggregates by ES version
    s?: BoaTestNode[]; // subdirectories
    t?: BoaTestNode[]; // tests
    f?: string[]; // features
}

interface BoaAggregates {
    t: number; // total
    o: number; // ok/pass
    i: number; // ignored/skip
    p: number; // panic/error
}

interface BoaLatestJson {
    c: string; // boa commit hash
    u: string; // test262 commit hash
    r: BoaTestNode; // root node
}

/**
 * Convert Boa result code to our short status type
 */
function boaResultToShortStatus(result: BoaResultCode): ShortStatusType {
    switch (result) {
        case 'O': return 'P'; // Ok -> Pass
        case 'F': return 'F'; // Fail
        case 'I': return 'S'; // Ignored -> Skip
        case 'P': return 'C'; // Panic -> Crash
        default: return 'F';
    }
}

/**
 * Recursively flatten Boa's nested structure into compact test entries
 */
function flattenBoaTests(
    node: BoaTestNode, 
    pathParts: string[] = []
): CompactTestEntry[] {
    const results: CompactTestEntry[] = [];
    
    // Process tests at this level
    if (node.t) {
        for (const test of node.t) {
            const testPath = [...pathParts, test.n].join('/');
            if (test.r !== undefined) {
                results.push({
                    p: testPath,
                    s: boaResultToShortStatus(test.r),
                });
            }
        }
    }
    
    // Process subdirectories
    if (node.s) {
        for (const subdir of node.s) {
            const subdirPath = [...pathParts, subdir.n];
            results.push(...flattenBoaTests(subdir, subdirPath));
        }
    }
    
    return results;
}

export class BoaDataProvider implements DataProvider {
    readonly id = 'boa';
    readonly displayName = 'Boa (test262)';
    readonly description = 'Test262 results from the Boa JavaScript engine';
    readonly iconType = 'github' as const;
    
    private baseUrl: string;
    private options: ProviderOptions = {};
    private cachedRefs: string[] | null = null;
    private cachedMetadata: DataSourceMetadata | null = null;
    
    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        // Fetch available refs if not cached
        if (!this.cachedRefs) {
            await this.fetchAvailableRefs();
        }
        
        return {
            hasEngineSelection: false,
            hasRefSelection: true,
            availableRefs: this.cachedRefs || ['heads/main'],
            hasTestDetails: false, // Boa doesn't provide per-test details
            supportsComparison: true,
            isReadOnly: true,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        if (this.cachedMetadata) {
            return this.cachedMetadata;
        }
        
        try {
            const ref = this.options.ref || 'heads/main';
            const url = `${this.baseUrl}/refs/${ref}/results.json`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch metadata: ${response.status}`);
            }
            
            const data = await response.json();
            const entry = Array.isArray(data) ? data[0] : data;
            
            this.cachedMetadata = {
                name: 'Boa',
                version: entry.c?.slice(0, 7),
                totalTests: entry.a?.t,
            };
            
            return this.cachedMetadata;
        } catch (error) {
            console.error('Failed to fetch Boa metadata:', error);
            return {
                name: 'Boa',
            };
        }
    }
    
    async fetchResults(options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const opts = options || this.options;
        const ref = opts.ref || 'heads/main';
        const url = `${this.baseUrl}/refs/${ref}/latest.json`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch results: ${response.status}`);
            }
            
            const data: BoaLatestJson = await response.json();
            
            // Store metadata
            this.cachedMetadata = {
                name: 'Boa',
                version: data.c?.slice(0, 7),
                totalTests: data.r?.a?.t,
            };
            
            // Flatten the nested structure
            return flattenBoaTests(data.r, []);
            
        } catch (error) {
            console.error('Failed to fetch Boa results:', error);
            throw error;
        }
    }
    
    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        // Boa doesn't provide individual test details in this format
        return null;
    }
    
    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
        // Clear cached metadata when options change
        this.cachedMetadata = null;
    }
    
    getOptions(): ProviderOptions {
        return { ...this.options };
    }
    
    private async fetchAvailableRefs(): Promise<void> {
        try {
            // Fetch tags from GitHub API
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
            
            this.cachedRefs = refs;
        } catch (error) {
            console.error('Failed to fetch Boa refs:', error);
            this.cachedRefs = ['heads/main'];
        }
    }
}

/**
 * Factory function for creating Boa provider instances
 */
export function createBoaProvider(baseUrl?: string): DataProvider {
    return new BoaDataProvider(baseUrl);
}
