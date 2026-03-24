/**
 * Test262.fyi Data Provider
 *
 * The main tree view uses lazy loading directly (via Fyi.ts) to avoid
 * fetching all data upfront. This provider is used for comparisons
 * and metadata only.
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
        if (!this.cachedEngines) {
            await this.fetchEngines();
        }

        return {
            hasEngineSelection: true,
            availableEngines: this.cachedEngines ? Object.keys(this.cachedEngines) : [],
            hasRefSelection: false,
            hasTestDetails: false,
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

    /**
     * Fetch results - returns an empty array since the main tree view
     * uses lazy loading directly. For comparisons, use fetchAllTest262FyiData
     * from Wpt/Fyi.ts instead.
     */
    async fetchResults(_options?: ProviderOptions): Promise<CompactTestEntry[]> {
        // Return empty - the tree view uses lazy loading via Fyi.#getLazyTest262FyiTree()
        // Comparisons use fetchAllTest262FyiData() directly
        return [];
    }

    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        return null;
    }

    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
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
