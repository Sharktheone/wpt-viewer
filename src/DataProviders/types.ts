/**
 * Common types for all data providers
 */

import type { ComponentType } from 'preact';
import type { ShortStatusType } from '#/Wpt/Status';

export type IconComponent = ComponentType<{ size?: number | string }>;

/**
 * A compact test entry in the common format used by Tree
 */
export interface CompactTestEntry {
    /** Test path (e.g., "language/identifiers/test.js") */
    p: string;
    /** Short status code (P=pass, F=fail, etc.) */
    s: ShortStatusType;
}

/**
 * Full test details for a single test
 */
export interface TestDetails {
    test: string;
    status: string;
    message: string | null;
    duration: number;
    subtests: SubtestDetails[];
}

export interface SubtestDetails {
    name: string;
    status: string;
    message: string | null;
}

/**
 * Metadata about a data source
 */
export interface DataSourceMetadata {
    /** Display name */
    name: string;
    /** Version or commit hash */
    version?: string;
    /** When the data was last updated */
    lastUpdated?: Date;
    /** Total number of tests */
    totalTests?: number;
}

/**
 * Configuration options that can be set for a provider
 */
export interface ProviderOptions {
    /** For test262.fyi: which engine to use */
    engine?: string;
    /** For boa-dev: which ref (branch or tag) to use */
    ref?: string;
    /** Custom base URL override */
    baseUrl?: string;
}

/**
 * Definition for a configurable provider option
 */
export interface ProviderOptionDefinition {
    /** Option key (matches ProviderOptions field) */
    key: string;
    /** Human-readable display name */
    displayName: string;
    /** Type of input control */
    type: 'select' | 'text';
    /** Optional icon for the selector */
    icon?: IconComponent;
    /** For select type: static available options */
    options?: { value: string; label: string }[];
    /** For select type: fetch options dynamically (for async loading) */
    fetchOptions?: () => Promise<{ value: string; label: string }[]>;
}

/**
 * Available options that a provider supports
 */
export interface ProviderCapabilities {
    /** Whether the provider supports selecting an engine */
    hasEngineSelection: boolean;
    /** List of available engines (if hasEngineSelection is true) */
    availableEngines?: string[];
    /** Whether the provider supports ref/version selection */
    hasRefSelection: boolean;
    /** List of available refs (if hasRefSelection is true) */
    availableRefs?: string[];
    /** Whether individual test details can be fetched */
    hasTestDetails: boolean;
    /** Whether the provider supports comparison */
    supportsComparison: boolean;
    /** Whether the provider is read-only */
    isReadOnly: boolean;
    /** Whether the provider supports interactive test reruns */
    canRerun?: boolean;
}

/**
 * Interface that all data providers must implement
 */
export interface DataProvider {
    /** Unique identifier for this provider type */
    readonly id: string;

    /** Display name for the provider */
    readonly displayName: string;

    /** Description of what this provider does */
    readonly description: string;

    /** Icon type for UI display */
    readonly iconType: 'github' | 'server' | 'database' | 'cloud' | 'stone' | 'bug';

    /**
     * Get the icon component type for this provider (unsized)
     * The UI layer will apply sizing when rendering
     */
    getIconType(): IconComponent;

    /**
     * Get configurable options for this provider with their metadata
     * Used to render option controls in the UI
     */
    getOptionDefinitions(): ProviderOptionDefinition[];

    /**
     * Get the capabilities of this provider
     */
    getCapabilities(): Promise<ProviderCapabilities>;

    /**
     * Get metadata about the current data source
     */
    getMetadata(): Promise<DataSourceMetadata>;

    /**
     * Fetch all test results in the compact format
     */
    fetchResults(options?: ProviderOptions): Promise<CompactTestEntry[]>;

    /**
     * Fetch details for a specific test
     * @param path - The test path
     */
    fetchTestDetails(path: string, options?: ProviderOptions): Promise<TestDetails | null>;

    /**
     * Fetch contents of a specific directory (for lazy-loading providers)
     * Returns null if the provider doesn't support directory-level fetching
     * @param path - The directory path (e.g., "language/annexB")
     */
    fetchDirectoryContents?(path: string, options?: ProviderOptions): Promise<CompactTestEntry[]>;

    /**
     * Set options for this provider instance
     */
    setOptions(options: ProviderOptions): void;

    /**
     * Get current options
     */
    getOptions(): ProviderOptions;
}

/**
 * Default configuration for a data source
 */
export interface DataSourceDefaultConfig {
    /** Display name */
    name: string;
    /** Default base URL */
    baseUrl: string;
    /** Description */
    description: string;
    /** Default options */
    defaultOptions?: ProviderOptions;
}

/**
 * Factory function type for creating data providers
 */
export type DataProviderFactory = (baseUrl?: string) => DataProvider;

/**
 * Registry entry for a data provider type
 */
export interface DataProviderRegistryEntry {
    id: string;
    displayName: string;
    description: string;
    factory: DataProviderFactory;
    defaultBaseUrl?: string;
}
