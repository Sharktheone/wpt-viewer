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
 * Alternative: Create a more meaningful representation using category names as entries
 */
function createCategoryEntries(
    data: Test262FyiIndex,
    engine: string
): CompactTestEntry[] {
    const results: CompactTestEntry[] = [];
    
    function processCategory(
        category: Test262FyiCategory, 
        path: string[]
    ): void {
        const passed = category.engines[engine] || 0;
        const total = category.total;
        const failed = total - passed;
        
        const categoryPath = path.join('/');
        
        if (category.files && Object.keys(category.files).length > 0) {
            // Has sub-categories, recurse
            for (const [name, subCategory] of Object.entries(category.files)) {
                processCategory(subCategory, [...path, name]);
            }
        } else {
            // Leaf category - create individual pass/fail entries
            for (let i = 0; i < passed; i++) {
                results.push({
                    p: `${categoryPath}/pass_${String(i + 1).padStart(5, '0')}`,
                    s: 'P',
                });
            }
            for (let i = 0; i < failed; i++) {
                results.push({
                    p: `${categoryPath}/fail_${String(i + 1).padStart(5, '0')}`,
                    s: 'F',
                });
            }
        }
    }
    
    for (const [name, category] of Object.entries(data.files)) {
        processCategory(category, [name]);
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
        
        // Create entries from aggregate data
        return createCategoryEntries(this.cachedData, engine);
    }
    
    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        // test262.fyi doesn't provide individual test results
        // We can only show that this is a synthetic entry
        return null;
    }
    
    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
        // Engine changes don't require clearing cache as data structure is the same
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
