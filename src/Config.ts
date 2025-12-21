import { signal, computed } from '@preact/signals';

export interface DataSourceConfig {
    name: string;
    type: 'github' | 'local';
    baseUrl: string;
    description: string;
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

// Application config loaded from config.json
export const appConfig = signal<AppConfig | null>(null);

// Current active data source key
export const activeSourceKey = signal<string>('');

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

// Load configuration from config.json
export async function loadConfig(): Promise<AppConfig> {
    // Get saved local URL from localStorage
    const savedLocalUrl = localStorage.getItem('localServerUrl') || 'http://localhost:1215';
    const savedDefaultProfile = localStorage.getItem('defaultProfile') || '';

    try {
        const response = await fetch('./config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        const config: AppConfig = await response.json();
        
        // Override with localStorage values
        if (config.sources.local) {
            config.sources.local.baseUrl = savedLocalUrl;
        }
        if (savedDefaultProfile) {
            config.defaultProfile = savedDefaultProfile;
        }
        
        appConfig.value = config;
        
        // Load saved source from localStorage or use default
        const savedSource = localStorage.getItem('dataSource');
        if (savedSource && config.sources[savedSource]) {
            activeSourceKey.value = savedSource;
        } else {
            activeSourceKey.value = config.defaultSource;
        }
        
        return config;
    } catch (error) {
        console.error('Failed to load config:', error);
        // Fallback to default config with both sources
        const fallback: AppConfig = {
            defaultSource: 'github',
            sources: {
                github: {
                    name: 'GitHub',
                    type: 'github',
                    baseUrl: 'https://raw.githubusercontent.com/Sharktheone/yavashark-data',
                    description: 'Read-only results from GitHub',
                },
                local: {
                    name: 'Local Server',
                    type: 'local',
                    baseUrl: savedLocalUrl,
                    description: 'Local development server with rerun capabilities',
                }
            },
            defaultProfile: savedDefaultProfile || 'fast',
        };
        appConfig.value = fallback;
        activeSourceKey.value = 'github';
        return fallback;
    }
}

// Switch to a different data source
export function setActiveSource(key: string): void {
    const config = appConfig.value;
    if (!config || !config.sources[key]) {
        console.error(`Unknown data source: ${key}`);
        return;
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
