/**
 * LibJS Data Provider
 * Fetches test262 results from the Ladybird LibJS data repository
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
import type { ShortStatusType } from '#/Wpt/Status';
import { Bug } from 'lucide-preact';
import { providerRegistry } from './registry';

const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com/LadybirdBrowser/libjs-data/refs/heads/master/test262';

/**
 * LibJS result codes
 */
type LibJSResult = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT' | 'PROCESS_ERROR' | 'RUNNER_EXCEPTION' | 'TODO_ERROR' | 'METADATA_ERROR' | 'HARNESS_ERROR';

/**
 * LibJS per-file data format
 */
interface LibJSPerFileData {
    duration: number;
    results: Record<string, LibJSResult>;
}

/**
 * Convert LibJS result code to short status
 */
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

export class LibJSDataProvider implements DataProvider {
    readonly id = 'libjs';
    readonly displayName = 'LibJS (test262)';
    readonly description = 'Test262 results from LibJS (Ladybird)';
    readonly iconType = 'bug' as const;
    
    private baseUrl: string;
    private options: ProviderOptions = {};
    private cachedData: LibJSPerFileData | null = null;
    
    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }
    
    getIconType(): IconComponent {
        return Bug;
    }
    
    getOptionDefinitions(): ProviderOptionDefinition[] {
        // LibJS provider has no configurable options
        return [];
    }
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        return {
            hasEngineSelection: false,
            hasRefSelection: false,
            hasTestDetails: false,
            supportsComparison: true,
            isReadOnly: true,
            canRerun: false,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        const data = await this.fetchData();
        
        return {
            name: 'LibJS (Ladybird)',
            totalTests: data ? Object.keys(data.results).length : undefined,
        };
    }
    
    async fetchResults(_options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const data = await this.fetchData();
        
        if (!data) {
            throw new Error('Failed to fetch LibJS data');
        }
        
        const results: CompactTestEntry[] = [];
        
        for (const [path, status] of Object.entries(data.results)) {
            // Paths in LibJS data include the test/ prefix, strip it
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
    
    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        // LibJS doesn't provide individual test details beyond pass/fail
        return null;
    }
    
    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
    }
    
    getOptions(): ProviderOptions {
        return { ...this.options };
    }
    
    private async fetchData(): Promise<LibJSPerFileData | null> {
        if (this.cachedData) {
            return this.cachedData;
        }
        
        try {
            const url = `${this.baseUrl}/per-file-master.json`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch LibJS data: ${response.status}`);
            }
            
            this.cachedData = await response.json();
            return this.cachedData;
        } catch (error) {
            console.error('Failed to fetch LibJS data:', error);
            return null;
        }
    }
    
    static getDefaultConfig(): DataSourceDefaultConfig {
        return {
            name: 'LibJS (test262)',
            baseUrl: DEFAULT_BASE_URL,
            description: 'Test262 results from LibJS (Ladybird)',
        };
    }
}

// Self-register with the registry
providerRegistry.register(
    {
        id: 'libjs',
        displayName: 'LibJS (test262)',
        description: 'Test262 results from LibJS (Ladybird)',
        factory: (baseUrl) => new LibJSDataProvider(baseUrl),
        defaultBaseUrl: DEFAULT_BASE_URL,
    },
    LibJSDataProvider.getDefaultConfig()
);
