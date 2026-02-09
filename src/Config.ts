import { signal, computed } from '@preact/signals';
import { providerRegistry } from '#/DataProviders';

export type DataSourceType = string;

export interface LoadingProgress {
    fetched: number;
    total: number;
    phase: 'discovering' | 'fetching';
}

export interface DataSourceConfig {
    name: string;
    type: DataSourceType;
    baseUrl: string;
    description: string;
    /** For test262fyi: the selected engine */
    engine?: string;
    /** For boa: the selected ref (branch/tag) */
    ref?: string;
    /** Whether this source is enabled */
    enabled?: boolean;
}

export interface AppConfig {
    defaultSource: string;
    sources: Record<string, DataSourceConfig>;
    defaultProfile: string;
}

export interface Capabilities {
    canRerun: boolean;
    canRebuild: boolean;
    profiles: string[];
}

export interface Profile {
    test_root?: string;
    workers?: number;
    timeout?: string;
    noskip?: boolean;
    ci?: boolean;
    interactive?: boolean;
    rebuild?: boolean;
    build_mode?: string;
    build_compiler?: string;
}

export interface ProfilesConfig {
    profiles: Record<string, Profile>;
}

// Provider-specific options
export interface ProviderOptions {
    /** For test262fyi: which engine to use */
    engine?: string;
    /** For boa: which ref (branch or tag) to use */
    ref?: string;
}

// Get saved local URL from localStorage
function getSavedLocalUrl(): string {
    return localStorage.getItem('localServerUrl') || 'http://localhost:1215';
}

// Get saved provider options from localStorage
function getSavedProviderOptions(sourceKey: string): ProviderOptions {
    const saved = localStorage.getItem(`providerOptions:${sourceKey}`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return {};
        }
    }
    return {};
}

// Save provider options to localStorage
export function saveProviderOptions(sourceKey: string, options: ProviderOptions): void {
    localStorage.setItem(`providerOptions:${sourceKey}`, JSON.stringify(options));
}

/**
 * Build source configs from registry defaults
 */
function buildSourceConfigsFromRegistry(): Record<string, DataSourceConfig> {
    const defaults = providerRegistry.getAllDefaultConfigs();
    const sources: Record<string, DataSourceConfig> = {};

    for (const [id, config] of Object.entries(defaults)) {
        sources[id] = {
            name: config.name,
            type: id,
            baseUrl: config.baseUrl,
            description: config.description,
            enabled: true,
            ...config.defaultOptions,
            ...getSavedProviderOptions(id),
        };
    }

    // Override local URL with saved value
    if (sources.local) {
        sources.local.baseUrl = getSavedLocalUrl();
    }

    return sources;
}

// Default config - built from registry
function getDefaultConfig(): AppConfig {
    return {
        defaultSource: 'github',
        sources: buildSourceConfigsFromRegistry(),
        defaultProfile: localStorage.getItem('defaultProfile') || 'fast',
    };
}

// Application config - initialized with defaults immediately
export const appConfig = signal<AppConfig>(getDefaultConfig());

// Current active data source key
export const activeSourceKey = signal<string>(
    localStorage.getItem('dataSource') || 'github'
);

// Provider-specific options signals
export const selectedEngine = signal<string>(
    localStorage.getItem('test262fyi:engine') || 'v8'
);

export const selectedRef = signal<string>(
    localStorage.getItem('boa:ref') || 'heads/main'
);

// Loading progress for long-running fetches (e.g., test262.fyi)
export const loadingProgress = signal<LoadingProgress | null>(null);

// Capabilities of the active source
export const capabilities = signal<Capabilities>({
    canRerun: false,
    canRebuild: false,
    profiles: [],
});

// Available profiles
export const profiles = signal<ProfilesConfig | null>(null);

// Whether we're in interactive mode (can rerun tests)
export const isInteractiveMode = computed(() => {
    const source = activeSource.value;
    return source?.type === 'local' && capabilities.value.canRerun;
});

// Get the currently active source configuration
export const activeSource = computed(() => {
    const config = appConfig.value;
    const key = activeSourceKey.value;
    if (!config || !key) return null;
    return config.sources[key] ?? null;
});

/**
 * Load configuration from config.json
 * Merges registry defaults with config.json overrides
 */
export async function loadConfig(url?: string): Promise<AppConfig> {
    const savedDefaultProfile = localStorage.getItem('defaultProfile') || '';

    try {
        const response = await fetch(url ?? './config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        const fileConfig = await response.json();

        // Start with registry defaults
        const sources = buildSourceConfigsFromRegistry();

        // Apply config.json overrides
        if (fileConfig.sources) {
            for (const [key, override] of Object.entries(fileConfig.sources)) {
                if (sources[key]) {
                    // Merge override into existing source
                    sources[key] = {
                        ...sources[key],
                        ...(override as Partial<DataSourceConfig>),
                    };
                } else {
                    // New source from config (for custom sources)
                    sources[key] = override as DataSourceConfig;
                }
            }
        }

        const config: AppConfig = {
            defaultSource: fileConfig.defaultSource || 'github',
            sources,
            defaultProfile: savedDefaultProfile || fileConfig.defaultProfile || 'fast',
        };

        appConfig.value = config;

        // Only update source key if current one is invalid
        if (!config.sources[activeSourceKey.value]) {
            activeSourceKey.value = config.defaultSource || 'github';
        }

        return config;
    } catch (error) {
        console.error('Failed to load config:', error);
        // Keep using default config from registry
        return appConfig.value;
    }
}

// Switch to a different data source
export function setActiveSource(key: string): void {
    const config = appConfig.value;
    if (!config || !config.sources[key]) {
        console.error(`Unknown data source: ${key}`);
        return;
    }

    // Only update and reset capabilities if source is actually changing
    if (activeSourceKey.value === key) {
        return; // Same source, no need to reset capabilities
    }

    activeSourceKey.value = key;
    localStorage.setItem('dataSource', key);

    // Reset capabilities when switching sources
    capabilities.value = {
        canRerun: false,
        canRebuild: false,
        profiles: [],
    };
}

// Set the selected engine for test262fyi
export function setSelectedEngine(engine: string): void {
    selectedEngine.value = engine;
    localStorage.setItem('test262fyi:engine', engine);

    // Update the source config
    const config = appConfig.value;
    if (config.sources.test262fyi) {
        config.sources.test262fyi.engine = engine;
        appConfig.value = { ...config };
    }
}

// Set the selected ref for boa
export function setSelectedRef(ref: string): void {
    selectedRef.value = ref;
    localStorage.setItem('boa:ref', ref);

    // Update the source config
    const config = appConfig.value;
    if (config.sources.boa) {
        config.sources.boa.ref = ref;
        appConfig.value = { ...config };
    }
}

// Check capabilities of a data source
export async function checkCapabilities(source: DataSourceConfig): Promise<Capabilities> {
    if (source.type !== 'local') {
        return { canRerun: false, canRebuild: false, profiles: [] };
    }

    try {
        const response = await fetch(`${source.baseUrl}/api/capabilities`);
        if (!response.ok) {
            return { canRerun: false, canRebuild: false, profiles: [] };
        }
        return await response.json();
    } catch {
        return { canRerun: false, canRebuild: false, profiles: [] };
    }
}

// Load profiles from the server
export async function loadProfiles(source: DataSourceConfig): Promise<ProfilesConfig | null> {
    if (source.type !== 'local') {
        return null;
    }

    try {
        const response = await fetch(`${source.baseUrl}/api/profiles`);
        if (!response.ok) {
            return null;
        }
        const profilesData = await response.json();
        profiles.value = profilesData;
        return profilesData;
    } catch {
        return null;
    }
}

// Initialize the active source and check its capabilities
export async function initializeSource(): Promise<void> {
    const source = activeSource.value;
    if (!source) return;

    const caps = await checkCapabilities(source);
    capabilities.value = caps;

    if (caps.canRerun) {
        await loadProfiles(source);
    }
}
