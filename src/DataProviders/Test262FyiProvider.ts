/**
 * Test262.fyi Data Provider
 * 
 * IMPORTANT: test262.fyi only provides aggregate statistics per engine/category,
 * not individual test results. This provider creates synthetic "test entries"
 * based on the pass/fail counts in each category to allow visualization
 * in the tree view, but individual test details are not available.
 */

import type { 
    DataProvider, 
    ProviderOptions, 
    ProviderCapabilities,
    CompactTestEntry,
    TestDetails,
    DataSourceMetadata,
    DataSourceDefaultConfig,
    ProviderOptionDefinition,
    IconComponent,
} from './types';
import { Cloud } from 'lucide-preact';
import { providerRegistry } from './registry';

const DEFAULT_BASE_URL = 'https://data.test262.fyi';

/**
 * test262.fyi index.json structure
 */
interface Test262FyiIndex {
    total: number;
    engines: Record<string, number>;
    files: Record<string, Test262FyiCategory>;
}

interface Test262FyiCategory {
    total: number;
    engines: Record<string, number>;
    files?: Record<string, Test262FyiCategory>;
}

interface Test262FyiEngines {
    [engine: string]: string; // engine name -> version
}

/**
 * Create synthetic entries ONLY for top-level directories
 * All other entries are lazy-loaded when navigating
 */
function createTopLevelEntries(
    data: Test262FyiIndex,
    engine: string
): CompactTestEntry[] {
    const results: CompactTestEntry[] = [];
    
    // Only process top-level categories
    for (const [name, category] of Object.entries(data.files)) {
        const passed = category.engines[engine] || 0;
        const total = category.total;
        const failed = total - passed;
        
        // Create synthetic pass/fail entries for this top-level directory
        // These will be lazy-loaded when the user navigates to them
        for (let i = 0; i < passed; i++) {
            results.push({
                p: `${name}/pass_${String(i + 1).padStart(5, '0')}`,
                s: 'P',
            });
        }
        for (let i = 0; i < failed; i++) {
            results.push({
                p: `${name}/fail_${String(i + 1).padStart(5, '0')}`,
                s: 'F',
            });
        }
    }
    
    return results;
}

export class Test262FyiDataProvider implements DataProvider {
    readonly id = 'test262fyi';
    readonly displayName = 'test262.fyi';
    readonly description = 'Aggregate test262 results from multiple JavaScript engines';
    readonly iconType = 'cloud' as const;
    
    private baseUrl: string;
    private options: ProviderOptions = {};
    private cachedEngines: Test262FyiEngines | null = null;
    private cachedData: Test262FyiIndex | null = null;
    /** Cache for lazy-loaded directory contents */
    private directoryCache: Map<string, Test262FyiCategory> = new Map();
    
    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }
    
    getIconType(): IconComponent {
        return Cloud;
    }
    
    getOptionDefinitions(): ProviderOptionDefinition[] {
        return [
            {
                key: 'engine',
                displayName: 'Engine',
                type: 'select',
                fetchOptions: async () => {
                    const engines = await this.getAvailableEngines();
                    return Object.entries(engines).map(([key, version]) => ({
                        value: key,
                        label: `${key} (${version})`,
                    }));
                },
            },
        ];
    }
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        // Fetch available engines if not cached
        if (!this.cachedEngines) {
            await this.fetchEngines();
        }
        
        return {
            hasEngineSelection: true,
            availableEngines: this.cachedEngines ? Object.keys(this.cachedEngines) : [],
            hasRefSelection: false,
            hasTestDetails: false, // test262.fyi doesn't have individual test results
            supportsComparison: true,
            isReadOnly: true,
            canRerun: false,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        if (!this.cachedEngines) {
            await this.fetchEngines();
        }
        
        if (!this.cachedData) {
            await this.fetchData();
        }
        
        const engine = this.options.engine || 'v8';
        const version = this.cachedEngines?.[engine];
        
        return {
            name: `test262.fyi (${engine})`,
            version: version,
            totalTests: this.cachedData?.total,
        };
    }
    
    async fetchResults(options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const opts = options || this.options;
        const engine = opts.engine || 'v8'; // Default to v8
        
        if (!this.cachedData) {
            await this.fetchData();
        }
        
        if (!this.cachedData) {
            throw new Error('Failed to load test262.fyi data');
        }
        
        // Create entries from aggregate data - only top level, rest is lazy-loaded
        return createTopLevelEntries(this.cachedData, engine);
    }
    
    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        // test262.fyi doesn't provide individual test results
        // We can only show that this is a synthetic entry
        return null;
    }
    
    /**
     * Fetch contents of a specific directory lazily with caching
     * This fetches the per-directory JSON file from test262.fyi
     */
    async fetchDirectoryContents(path: string, options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const engine = options?.engine || this.options.engine || 'v8';
        
        // Check cache first
        if (this.directoryCache.has(path)) {
            return this.extractTestsFromNode(this.directoryCache.get(path)!, path, engine);
        }
        
        try {
            // Fetch directory JSON
            const url = path
                ? `${this.baseUrl}/${path}.json`
                : `${this.baseUrl}/index.json`;
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Failed to fetch directory ${path}: ${response.status}`);
                return [];
            }
            
            const data: Test262FyiCategory = await response.json();
            this.directoryCache.set(path, data);
            
            return this.extractTestsFromNode(data, path, engine);
        } catch (error) {
            console.error(`Error fetching directory ${path}:`, error);
            return [];
        }
    }
    
    /**
     * Extract entries from a directory node:
     * - .js files (actual tests) that are IMMEDIATE children
     * - Single placeholder entries for subdirectories (to enable navigation)
     *
     * Note: test262.fyi returns FULL paths in the files object, e.g.,
     * "language/comments/S7.4_A1_T1.js" not just "S7.4_A1_T1.js"
     */
    private extractTestsFromNode(
        node: Test262FyiCategory,
        basePath: string,
        engine: string
    ): CompactTestEntry[] {
        const results: CompactTestEntry[] = [];
        
        if (!node.files) return results;
        
        // Count path depth of base path to filter immediate children only
        const baseDepth = basePath ? basePath.split('/').length : 0;
        const expectedDepth = baseDepth + 1; // base + one component
        
        // Track subdirectories we've seen (to create single placeholder per subdir)
        const seenSubdirs = new Set<string>();
        
        for (const [fullPath, child] of Object.entries(node.files)) {
            const pathDepth = fullPath.split('/').length;
            
            if (pathDepth < expectedDepth) continue;
            
            if (fullPath.endsWith('.js')) {
                // It's a test file - include if immediate child
                if (pathDepth === expectedDepth) {
                    const passedCount = child.engines?.[engine] || 0;
                    const passed = passedCount > 0;
                    
                    results.push({
                        p: fullPath,
                        s: passed ? 'P' : 'F',
                    });
                }
            } else {
                // It's a subdirectory - include if immediate child
                if (pathDepth === expectedDepth && !seenSubdirs.has(fullPath)) {
                    seenSubdirs.add(fullPath);
                    
                    // Create synthetic pass_XX/fail_XX entries for this subdirectory
                    // This allows the lazy-loading mechanism to work recursively
                    const passedCount = child.engines[engine] || 0;
                    const total = child.total;
                    const failedCount = total - passedCount;
                    
                    // Create synthetic entries for passed tests
                    for (let i = 0; i < passedCount; i++) {
                        results.push({
                            p: `${fullPath}/pass_${String(i + 1).padStart(5, '0')}`,
                            s: 'P',
                        });
                    }
                    
                    // Create synthetic entries for failed tests
                    for (let i = 0; i < failedCount; i++) {
                        results.push({
                            p: `${fullPath}/fail_${String(i + 1).padStart(5, '0')}`,
                            s: 'F',
                        });
                    }
                }
            }
        }
        
        return results;
    }
    
    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
        // Clear directory cache when engine changes since results differ per engine
        if (options.engine !== undefined) {
            this.directoryCache.clear();
        }
    }
    
    getOptions(): ProviderOptions {
        return { ...this.options };
    }
    
    private async fetchEngines(): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/engines.json`);
            if (!response.ok) {
                throw new Error(`Failed to fetch engines: ${response.status}`);
            }
            this.cachedEngines = await response.json();
            
            // Set default engine if not set
            if (!this.options.engine && this.cachedEngines) {
                this.options.engine = 'v8';
            }
        } catch (error) {
            console.error('Failed to fetch test262.fyi engines:', error);
            this.cachedEngines = {};
        }
    }
    
    private async fetchData(): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/index.json`);
            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.status}`);
            }
            this.cachedData = await response.json();
        } catch (error) {
            console.error('Failed to fetch test262.fyi data:', error);
            this.cachedData = null;
        }
    }
    
    /**
     * Get available engines
     */
    async getAvailableEngines(): Promise<Record<string, string>> {
        if (!this.cachedEngines) {
            await this.fetchEngines();
        }
        return this.cachedEngines || {};
    }
    
    static getDefaultConfig(): DataSourceDefaultConfig {
        return {
            name: 'test262.fyi',
            baseUrl: DEFAULT_BASE_URL,
            description: 'Aggregate test262 results from multiple JavaScript engines',
            defaultOptions: {
                engine: 'v8',
            },
        };
    }
}

// Self-register with the registry
providerRegistry.register(
    {
        id: 'test262fyi',
        displayName: 'test262.fyi',
        description: 'Aggregate test262 results from multiple JavaScript engines',
        factory: (baseUrl) => new Test262FyiDataProvider(baseUrl),
        defaultBaseUrl: DEFAULT_BASE_URL,
    },
    Test262FyiDataProvider.getDefaultConfig()
);
