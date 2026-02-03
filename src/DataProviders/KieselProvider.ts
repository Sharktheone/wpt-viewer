import { ShortStatusType } from "#/Wpt/Status";
import { CompactTestEntry, DataProvider, DataSourceMetadata, ProviderCapabilities, ProviderOptions, TestDetails } from "./types";


export type KieselResultCode = 'PASS' | 'FAIL';

export type KieselTests = {
    [key: string]: KieselResultCode;
};

const RESULT_URL = "https://codeberg.org/kiesel-js/kiesel/raw/branch/main/tools/test262/results.json"

async function fetchKieselTests(): Promise<KieselTests> {
    const response = await fetch(RESULT_URL);
    const data = await response.json();
    return data;
}

export function kieselResultToShortStatus(result: KieselResultCode): ShortStatusType {
    return result === 'PASS' ? 'P' : 'F';
}

export class KieselDataProvider implements DataProvider {
    readonly id = 'kiesel';
    readonly displayName = 'Kiesel';
    readonly description = 'Test262 results from the Kiesel JavaScript engine';
    readonly iconType = 'stone' as const;
    
    private cachedTests: KieselTests | null = null;
    private cachedMetadata: DataSourceMetadata | null = null;
    
    async fetchAvailableTests(): Promise<KieselTests> {
        if (!this.cachedTests) {
            this.cachedTests = await fetchKieselTests();
        }
        return this.cachedTests;
    }
    
    
    async getCapabilities(): Promise<ProviderCapabilities> {
        return {
            hasEngineSelection: false,
            hasRefSelection: false,
            availableRefs: [],
            hasTestDetails: false, // Boa doesn't provide per-test details
            supportsComparison: false,
            isReadOnly: true,
        };
    }
    
    async getMetadata(): Promise<DataSourceMetadata> {
        if (!this.cachedMetadata) {
            const tests = await this.fetchAvailableTests();
            const metadata: DataSourceMetadata = {
                name: this.displayName,
                version: "42",
                totalTests: Object.keys(tests).length,
            };
            this.cachedMetadata = metadata;
        }
        return this.cachedMetadata;
    }
    
    async fetchResults(options?: ProviderOptions): Promise<CompactTestEntry[]> {
        const tests = await this.fetchAvailableTests();
        const entries: CompactTestEntry[] = [];
        for (const [p, result] of Object.entries(tests)) {
            const s = kieselResultToShortStatus(result);
            entries.push({ p, s });
        }
        return entries;
    }
    
    async fetchTestDetails(_path: string, _options?: ProviderOptions): Promise<TestDetails | null> {
        return null;
    }
    
    setOptions(_options: ProviderOptions): void {
        
    }
    
    getOptions(): ProviderOptions {
        return {}
    }
    
    
}
