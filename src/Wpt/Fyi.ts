import type { LongStatusType } from './Status';
import { Tree } from './Tree';
import { activeSource, selectedEngine, selectedRef, loadingProgress, type DataSourceConfig, type LoadingProgress } from '#/Config';
import { providerRegistry, type CompactTestEntry } from '#/DataProviders';

export const Browsers = [
    'chrome',
    'edge',
    'firefox',
    'safari',
    'ladybird',
] as const;

export type FyiBrowser = typeof Browsers[number];

export interface Subtest {
    name: string;
    status: LongStatusType;
    message: string | null;
    known_intermittent: unknown[];
}

interface Run {
    id: number;
    browser_name: string;
    browser_version: string;
    os_name: string;
    os_version: string;
    revision: string;
    full_revision_hash: string;
    results_url: string;
    created_at: string;
    time_start: string;
    time_end: string;
    raw_results_url: string;
    labels: string[];
}

export interface FullEntry extends Subtest {
    test: string;
    subsuite: string;
    subtests: Subtest[];
    duration: number;
    run: Run;
}

export type ProgressCallback = (progress: LoadingProgress) => void;

/**
 * Fyi class - facade for data fetching operations
 *
 * Uses the DataProvider registry to dynamically fetch data from the appropriate source.
 */
export class Fyi {
    #source: DataSourceConfig;
    #version: string;

    constructor(version = "HEAD~0", source?: DataSourceConfig) {
        this.#version = version;
        this.#source = source ?? activeSource.value ?? {
            name: 'Local',
            type: 'local',
            baseUrl: 'http://localhost:1215',
            description: 'Default local server',
        };
    }

    get baseUrl(): string {
        if (this.#source.type === 'github') {
            return `${this.#source.baseUrl}/${this.#version}`;
        }
        return this.#source.baseUrl;
    }

    get source(): DataSourceConfig {
        return this.#source;
    }

    /**
     * Get the provider instance for the current source
     */
    #getProvider() {
        const sourceType = this.#source.type;
        return providerRegistry.getInstance(sourceType, this.baseUrl);
    }

    /**
     * Fetch test results from the current source
     */
    async #get(_path: string): Promise<CompactTestEntry[]> {
        const provider = this.#getProvider();

        if (!provider) {
            throw new Error(`Unknown provider type: ${this.#source.type}`);
        }

        // Set provider options from source config
        provider.setOptions({
            engine: this.#source.engine || selectedEngine.value,
            ref: this.#source.ref || selectedRef.value,
        });

        // Report loading progress for sources that support it
        loadingProgress.value = { fetched: 0, total: 1, phase: 'discovering' };

        try {
            const results = await provider.fetchResults();
            loadingProgress.value = null;
            return results;
        } catch (error) {
            loadingProgress.value = null;
            throw error;
        }
    }

    /**
     * Get detailed information about a specific test
     */
    async getTestDetails(path: string): Promise<FullEntry> {
        const provider = this.#getProvider();

        let data: { status?: string; msg?: string; duration?: number } = {};

        if (provider) {
            provider.setOptions({
                engine: this.#source.engine || selectedEngine.value,
                ref: this.#source.ref || selectedRef.value,
            });

            const details = await provider.fetchTestDetails(path);

            if (details) {
                data = {
                    status: details.status,
                    msg: details.message ?? undefined,
                    duration: details.duration,
                };
            } else {
                data = {
                    status: 'UNKNOWN',
                    msg: 'Individual test details are not available for this data source'
                };
            }
        } else {
            data = {
                status: 'UNKNOWN',
                msg: `Unknown provider type: ${this.#source.type}`
            };
        }

        return {
            test: path,
            subsuite: "",
            status: data.status as LongStatusType,
            duration: data.duration ?? 0,
            message: data.msg ?? null,
            subtests: [],
            known_intermittent: [],
            name: path,
            run: {
                id: 0,
                browser_name: "",
                browser_version: "",
                os_name: "",
                os_version: "",
                revision: "",
                full_revision_hash: "",
                results_url: "",
                created_at: "",
                time_start: String(Date.now()),
                time_end: String(Date.now()),
                raw_results_url: "",
                labels: [],
            }
        } as FullEntry;
    }

    async getTree() {
        const data = await this.#get('results');
        return new Tree(this, data);
    }
}

// ===== Utility functions for fetching provider-specific data =====

/**
 * Fetch available refs from boa-dev/data
 * @deprecated Use providerRegistry.getOptionDefinitions('boa') instead
 */
export async function fetchBoaRefs(): Promise<string[]> {
    try {
        const tagsUrl = 'https://api.github.com/repos/boa-dev/data/contents/test262/refs/tags';
        const tagsResponse = await fetch(tagsUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        });

        const refs: string[] = ['heads/main'];

        if (tagsResponse.ok) {
            const tags = await tagsResponse.json();
            for (const tag of tags) {
                if (tag.type === 'dir') {
                    refs.push(`tags/${tag.name}`);
                }
            }
        }

        return refs;
    } catch (error) {
        console.error('Failed to fetch Boa refs:', error);
        return ['heads/main'];
    }
}
