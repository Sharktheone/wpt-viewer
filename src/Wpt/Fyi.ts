import type { LongStatusType } from './Status';
import { Tree } from './Tree';
import { activeSource, type DataSourceConfig } from '#/Config';

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

    async #get(_path: string) {
        if (this.#source.type === 'github') {
            return await fetch(`${this.baseUrl}/results.json`).then(r => r.json());
        }
        return await fetch(`${this.baseUrl}/api/current`).then(r => r.json());
    }

    async getTestDetails(path: string): Promise<FullEntry> {
        let data: any;

        if (this.#source.type === 'github') {
            data = { status: 'UNKNOWN', msg: 'Details not available from GitHub source' };
        } else {
            data = await fetch(`${this.baseUrl}/api/info/${path}.json`).then(r => r.json());
        }

        return {
            test: path,
            subsuite: "",
            status: data.status,
            duration: data.duration ?? 0,
            message: data.msg,
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
