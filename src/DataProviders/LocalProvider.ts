/**
 * Local Server Data Provider
 * Fetches test262 results from a local development server with rerun capabilities
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
import { Server } from 'lucide-preact';
import { providerRegistry } from './registry';

const DEFAULT_BASE_URL = 'http://localhost:1215';

/**
 * Local server capabilities response
 */
interface LocalCapabilities {
    canRerun: boolean;
    canRebuild: boolean;
    profiles: string[];
}

/**
 * Local server result format
 */
interface LocalResultEntry {
    p: string;  // test path
    s: ShortStatusType;  // status
}

export class LocalDataProvider implements DataProvider {
    readonly id = 'local';
    readonly displayName = 'Local Server';
    readonly description = 'Local development server with rerun capabilities';
    readonly iconType = 'server' as const;
    
    private baseUrl: string;
    private options: ProviderOptions = {};
    private cachedCapabilities: LocalCapabilities | null = null;
    
    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }
    
    getIconType(): IconComponent {
        return Server;
    }
    
    getOptionDefinitions(): ProviderOptionDefinition[] {
        // Local provider has no configurable options in the switcher
        // URL is configured in settings
        return [];
    }
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        if (!this.cachedCapabilities) {
            await this.fetchCapabilities();
        }
        
        return {
            hasEngineSelection: false,
            hasRefSelection: false,
            hasTestDetails: true,
            supportsComparison: true,
            isReadOnly: !this.cachedCapabilities?.canRerun,
            canRerun: this.cachedCapabilities?.canRerun ?? false,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        return {
            name: 'Local Server',
            version: 'local',
        };
    }
    
    async fetchResults(_options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const url = `${this.baseUrl}/api/current`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch results: ${response.status}`);
            }
            
            const data: LocalResultEntry[] = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to fetch local results:', error);
            throw error;
        }
    }
    
    async fetchTestDetails(path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        const url = `${this.baseUrl}/api/info/${path}.json`;
        
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
        if (options.baseUrl) {
            this.baseUrl = options.baseUrl;
        }
    }
    
    getOptions(): ProviderOptions {
        return { ...this.options, baseUrl: this.baseUrl };
    }
    
    /**
     * Get the base URL for this provider
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
    
    /**
     * Set the base URL for this provider
     */
    setBaseUrl(url: string): void {
        this.baseUrl = url;
        this.cachedCapabilities = null; // Clear cache when URL changes
    }
    
    /**
     * Fetch capabilities from the local server
     */
    async fetchCapabilities(): Promise<LocalCapabilities> {
        try {
            const response = await fetch(`${this.baseUrl}/api/capabilities`);
            if (!response.ok) {
                this.cachedCapabilities = { canRerun: false, canRebuild: false, profiles: [] };
                return this.cachedCapabilities;
            }
            
            this.cachedCapabilities = await response.json();
            return this.cachedCapabilities!;
        } catch {
            this.cachedCapabilities = { canRerun: false, canRebuild: false, profiles: [] };
            return this.cachedCapabilities;
        }
    }
    
    /**
     * Get available profiles from the local server
     */
    async getProfiles(): Promise<Record<string, unknown> | null> {
        try {
            const response = await fetch(`${this.baseUrl}/api/profiles`);
            if (!response.ok) {
                return null;
            }
            return await response.json();
        } catch {
            return null;
        }
    }
    
    static getDefaultConfig(): DataSourceDefaultConfig {
        return {
            name: 'Local Server',
            baseUrl: DEFAULT_BASE_URL,
            description: 'Local development server with rerun capabilities',
        };
    }
}

// Self-register with the registry
providerRegistry.register(
    {
        id: 'local',
        displayName: 'Local Server',
        description: 'Local development server with rerun capabilities',
        factory: (baseUrl) => new LocalDataProvider(baseUrl),
        defaultBaseUrl: DEFAULT_BASE_URL,
    },
    LocalDataProvider.getDefaultConfig()
);
