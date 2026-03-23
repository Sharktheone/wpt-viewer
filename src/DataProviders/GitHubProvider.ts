/**
 * GitHub Data Provider
 * Fetches test262 results from GitHub repositories (e.g., Yavashark data)
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
import { Github } from 'lucide-preact';
import { providerRegistry } from './registry';

const DEFAULT_BASE_URL = 'https://raw.githubusercontent.com/Sharktheone/yavashark-data';

/**
 * GitHub data result format
 */
interface GitHubResultEntry {
    p: string;  // test path
    s: string;  // status
}

export class GitHubDataProvider implements DataProvider {
    readonly id = 'github';
    readonly displayName = 'GitHub (Yavashark)';
    readonly description = 'Read-only WPT results from Yavashark';
    readonly iconType = 'github' as const;
    
    private baseUrl: string;
    private options: ProviderOptions = {};
    
    constructor(baseUrl?: string) {
        // baseUrl may already include version (e.g., .../HEAD~0) from Fyi.ts
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }
    
    getIconType(): IconComponent {
        return Github;
    }
    
    getOptionDefinitions(): ProviderOptionDefinition[] {
        // GitHub provider has no configurable options
        return [];
    }
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        return {
            hasEngineSelection: false,
            hasRefSelection: false,
            hasTestDetails: true,
            supportsComparison: true,
            isReadOnly: true,
            canRerun: false,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        return {
            name: 'Yavashark (GitHub)',
        };
    }
    
    async fetchResults(_options?: ProviderOptions): Promise<CompactTestEntry[]> {
        // baseUrl already includes version from Fyi.ts
        const url = `${this.baseUrl}/results.json`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch results: ${response.status}`);
            }
            
            const data: GitHubResultEntry[] = await response.json();
            return data as CompactTestEntry[];
        } catch (error) {
            console.error('Failed to fetch GitHub results:', error);
            throw error;
        }
    }
    
    async fetchTestDetails(path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        // baseUrl already includes version from Fyi.ts
        const url = `${this.baseUrl}/results/${path}.json`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return {
                    test: path,
                    status: 'UNKNOWN',
                    message: `Failed to fetch details: ${response.status}`,
                    duration: 0,
                    subtests: [],
                };
            }
            
            const data = await response.json();
            return {
                test: path,
                status: data.status ?? 'UNKNOWN',
                message: data.msg ?? null,
                duration: data.duration ?? 0,
                subtests: [],
            };
        } catch (error) {
            return {
                test: path,
                status: 'UNKNOWN',
                message: `Failed to fetch details: ${error}`,
                duration: 0,
                subtests: [],
            };
        }
    }
    
    setOptions(options: ProviderOptions): void {
        this.options = { ...this.options, ...options };
    }
    
    getOptions(): ProviderOptions {
        return { ...this.options };
    }
    
    static getDefaultConfig(): DataSourceDefaultConfig {
        return {
            name: 'GitHub (Yavashark)',
            baseUrl: DEFAULT_BASE_URL,
            description: 'Read-only WPT results from Yavashark',
        };
    }
}

// Self-register with the registry
providerRegistry.register(
    {
        id: 'github',
        displayName: 'GitHub (Yavashark)',
        description: 'Read-only WPT results from Yavashark',
        factory: (baseUrl) => new GitHubDataProvider(baseUrl),
        defaultBaseUrl: DEFAULT_BASE_URL,
    },
    GitHubDataProvider.getDefaultConfig()
);
