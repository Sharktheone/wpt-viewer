/**
 * Data Provider Registry
 * Central place to register and manage all data providers
 */

import type { 
    DataProvider, 
    DataProviderRegistryEntry,
} from './types';

class DataProviderRegistry {
    private providers: Map<string, DataProviderRegistryEntry> = new Map();
    private instances: Map<string, DataProvider> = new Map();

    /**
     * Register a new data provider type
     */
    register(entry: DataProviderRegistryEntry): void {
        if (this.providers.has(entry.id)) {
            console.warn(`Provider "${entry.id}" is already registered, overwriting...`);
        }
        this.providers.set(entry.id, entry);
    }

    /**
     * Get a provider instance by ID, creating one if it doesn't exist
     */
    getInstance(id: string, baseUrl?: string): DataProvider | null {
        const entry = this.providers.get(id);
        if (!entry) {
            console.error(`Unknown provider: ${id}`);
            return null;
        }

        const instanceKey = `${id}:${baseUrl || entry.defaultBaseUrl || 'default'}`;
        
        if (!this.instances.has(instanceKey)) {
            const instance = entry.factory(baseUrl || entry.defaultBaseUrl);
            this.instances.set(instanceKey, instance);
        }

        return this.instances.get(instanceKey)!;
    }

    /**
     * Get all registered provider types
     */
    getRegisteredTypes(): DataProviderRegistryEntry[] {
        return Array.from(this.providers.values());
    }

    /**
     * Check if a provider type is registered
     */
    has(id: string): boolean {
        return this.providers.has(id);
    }

    /**
     * Clear all cached instances (useful for testing)
     */
    clearInstances(): void {
        this.instances.clear();
    }
}

// Global singleton registry
export const providerRegistry = new DataProviderRegistry();

// Re-export types
export type { 
    DataProvider, 
    DataProviderFactory, 
    DataProviderRegistryEntry,
    ProviderOptions,
    ProviderCapabilities,
    CompactTestEntry,
    TestDetails,
    SubtestDetails,
    DataSourceMetadata,
} from './types';
