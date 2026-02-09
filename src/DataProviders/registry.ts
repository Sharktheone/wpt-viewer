/**
 * Data Provider Registry
 * Central place to register and manage all data providers
 */

import type {
    DataProvider,
    DataProviderRegistryEntry,
    DataSourceDefaultConfig,
    ProviderCapabilities,
    ProviderOptionDefinition,
    IconComponent,
} from './types';
import { Database } from 'lucide-preact';

class DataProviderRegistry {
    private providers: Map<string, DataProviderRegistryEntry> = new Map();
    private defaultConfigs: Map<string, DataSourceDefaultConfig> = new Map();
    private instances: Map<string, DataProvider> = new Map();
    private capabilitiesCache: Map<string, ProviderCapabilities> = new Map();

    /**
     * Register a new data provider type
     */
    register(
        entry: DataProviderRegistryEntry, 
        defaultConfig?: DataSourceDefaultConfig
    ): void {
        if (this.providers.has(entry.id)) {
            console.warn(`Provider "${entry.id}" is already registered, overwriting...`);
        }
        this.providers.set(entry.id, entry);
        if (defaultConfig) {
            this.defaultConfigs.set(entry.id, defaultConfig);
        }
        // Clear cached instances and capabilities for this provider
        this.instances.delete(entry.id);
        this.capabilitiesCache.delete(entry.id);
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
     * Get default configuration for a provider
     */
    getDefaultConfig(id: string): DataSourceDefaultConfig | null {
        return this.defaultConfigs.get(id) ?? null;
    }

    /**
     * Get all default configurations
     */
    getAllDefaultConfigs(): Record<string, DataSourceDefaultConfig> {
        const result: Record<string, DataSourceDefaultConfig> = {};
        for (const [id, config] of this.defaultConfigs) {
            result[id] = config;
        }
        return result;
    }

    /**
     * Get icon component type for a provider
     */
    getIconType(id: string): IconComponent {
        const entry = this.providers.get(id);
        if (!entry) return Database;
        
        // Create a temporary instance to get the icon type
        const instance = entry.factory(entry.defaultBaseUrl);
        return instance.getIconType();
    }

    /**
     * Get option definitions for a provider
     */
    getOptionDefinitions(id: string): ProviderOptionDefinition[] {
        const entry = this.providers.get(id);
        if (!entry) return [];
        
        const instance = entry.factory(entry.defaultBaseUrl);
        return instance.getOptionDefinitions();
    }

    /**
     * Get capabilities for a provider (cached)
     */
    async getCapabilities(id: string): Promise<ProviderCapabilities | null> {
        if (this.capabilitiesCache.has(id)) {
            return this.capabilitiesCache.get(id)!;
        }

        const entry = this.providers.get(id);
        if (!entry) return null;

        try {
            const instance = entry.factory(entry.defaultBaseUrl);
            const capabilities = await instance.getCapabilities();
            this.capabilitiesCache.set(id, capabilities);
            return capabilities;
        } catch (error) {
            console.error(`Failed to get capabilities for ${id}:`, error);
            return null;
        }
    }

    /**
     * Clear all cached instances (useful for testing)
     */
    clearInstances(): void {
        this.instances.clear();
    }

    /**
     * Clear all caches (useful for testing)
     */
    clearAll(): void {
        this.providers.clear();
        this.defaultConfigs.clear();
        this.instances.clear();
        this.capabilitiesCache.clear();
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
    ProviderOptionDefinition,
    CompactTestEntry,
    TestDetails,
    DataSourceMetadata,
    DataSourceDefaultConfig,
    IconComponent,
} from './types';
