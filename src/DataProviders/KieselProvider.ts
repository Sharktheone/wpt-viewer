/**
 * Kiesel Data Provider
 * Fetches test262 results from the Kiesel JavaScript engine
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
import { Stone } from 'lucide-preact';
import { providerRegistry } from './registry';

const DEFAULT_BASE_URL = 'https://raw.codeberg.page/kiesel-js/kiesel/@main/tools/test262';

export type KieselResultCode = 'PASS' | 'FAIL';

export type KieselTests = {
    [key: string]: KieselResultCode;
};

export function kieselResultToShortStatus(result: KieselResultCode): ShortStatusType {
    return result === 'PASS' ? 'P' : 'F';
}

export class KieselDataProvider implements DataProvider {
    readonly id = 'kiesel';
    readonly displayName = 'Kiesel';
    readonly description = 'Test262 results from the Kiesel JavaScript engine';
    readonly iconType = 'stone' as const;

    private baseUrl: string;
    private options: ProviderOptions = {};
    private cachedTests: KieselTests | null = null;
    private cachedMetadata: DataSourceMetadata | null = null;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }

    getIconType(): IconComponent {
        return Stone;
    }

    getOptionDefinitions(): ProviderOptionDefinition[] {
        // Kiesel provider has no configurable options
        return [];
    }

    async getCapabilities(): Promise<ProviderCapabilities> {
        return {
            hasEngineSelection: false,
            hasRefSelection: false,
            availableRefs: [],
            hasTestDetails: false,
            supportsComparison: false,
            isReadOnly: true,
            canRerun: false,
        };
    }

    async getMetadata(): Promise<DataSourceMetadata> {
        if (!this.cachedMetadata) {
            const tests = await this.fetchAvailableTests();
            const metadata: DataSourceMetadata = {
                name: this.displayName,
                version: "main",
                totalTests: Object.keys(tests).length,
            };
            this.cachedMetadata = metadata;
        }
        return this.cachedMetadata;
    }

    async fetchResults(_options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const tests = await this.fetchAvailableTests();
        const entries: CompactTestEntry[] = [];

        for (const [path, result] of Object.entries(tests)) {
            // Paths in Kiesel data include the test/ prefix, strip it
            let testPath = path;
            if (testPath.startsWith('test/')) {
                testPath = testPath.slice('test/'.length);
            }

            entries.push({
                p: testPath,
                s: kieselResultToShortStatus(result)
            });
        }

        return entries;
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

    private async fetchAvailableTests(): Promise<KieselTests> {
        if (!this.cachedTests) {
            const url = `${this.baseUrl}/results.json`;
            const response = await fetch(url);
            const data = await response.json();
            this.cachedTests = data;
        }
        return this.cachedTests!;
    }

    static getDefaultConfig(): DataSourceDefaultConfig {
        return {
            name: 'Kiesel',
            baseUrl: DEFAULT_BASE_URL,
            description: 'Test262 results from the Kiesel JavaScript engine',
        };
    }
}

// Self-register with the registry
providerRegistry.register(
    {
        id: 'kiesel',
        displayName: 'Kiesel',
        description: 'Test262 results from the Kiesel JavaScript engine',
        factory: (baseUrl) => new KieselDataProvider(baseUrl),
        defaultBaseUrl: DEFAULT_BASE_URL,
    },
    KieselDataProvider.getDefaultConfig()
);
