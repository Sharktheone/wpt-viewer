import type { LongStatusType } from './Status';
import { Tree } from './Tree';

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
    #origin: string;

    constructor(version = "HEAD~0", origin = "https://raw.githubusercontent.com/Sharktheone/yavashark-data") {
        this.#origin = `${origin}/${version}`;
    }

    async #get(_path: string) {
        return await fetch(`${this.#origin}/results.json`).then(r => r.json());
    }


    async getTestDetails(path: string): Promise<FullEntry> {
        let data = await fetch(`${this.#origin}/results/${path}.json`).then(r => r.json());

        console.log(path)

        // @ts-ignore
        return {
            test: path,
            subsuite: "",
            status: data.status,
            duration: 0,
            message: data.msg,
            subtests: [],
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
                time_start: Date.now(),
                time_end: Date.now(),
                raw_results_url: "",
                labels: [],

            }


        } as FullEntry
    }

    async getTree() {
        let tree = new Tree(this, await this.#get('results'));

        return tree
    }
}
