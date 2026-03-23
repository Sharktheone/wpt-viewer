import { formatSeconds } from '#/Utils/Number.tsx';
import { setDeep, followDeep } from '#/Utils/ObjectTree.tsx';
import type { Fyi } from './Fyi.ts';
import { ShortStatus, type ShortStatusType } from './Status.ts';
import type { CompactTestEntry } from '#/DataProviders';

export const TreeMeta = Symbol('TreeMeta');
export const TreeMetaSubtest = Symbol('TreeMetaSubtest');

interface CompactEntry {
    s: ShortStatusType;
    c: [number, number];
}

type ITreeMeta = {
    [key in ShortStatusType]: number;
}

export interface EntryTree {
    [key: string]: PartialEntry|EntryTree;

    [TreeMeta]: ITreeMeta;
    [TreeMetaSubtest]: [number, number];
    /** If true, this directory contains synthetic pass_XX/fail_XX entries that can be lazy-loaded */
    [SyntheticEntries]?: boolean;
}

interface NavigateParams {
    search?: string;
    statuses?: ShortStatusType[];
}

type TreeStatusMap = {
    [key in ShortStatusType]: number;
};

interface IPartialEntry {
    status: ShortStatusType;
    passedTests: number;
    totalTests: number;
}

export class PartialEntry {
    status: ShortStatusType;
    hasSubtests: boolean;
    passedTests: number;
    totalTests: number;
    path: string;

    #fyi: Fyi;

    constructor(fyi: Fyi, path: string, {status, passedTests, totalTests}: IPartialEntry) {
        this.status = status;
        this.hasSubtests = (totalTests !== 0);
        this.passedTests = (totalTests === 0 && status === 'P') ? 1: passedTests;
        this.totalTests = totalTests || 1;
        this.#fyi = fyi;
        this.path = path;
    }

    async getDetails() {
        return await this.#fyi.getTestDetails(this.path);
    }
}

/** Symbol to mark entries that are synthetic (pass_XX/fail_XX) and can be lazy-loaded */
export const SyntheticEntries = Symbol('SyntheticEntries');

export class Tree {
    static emptyStatusMap() {
        return Object.fromEntries(ShortStatus.map(k => [k, 0])) as TreeStatusMap;
    }

    static recomputeTestEntry(entry: CompactTestEntry, successStatuses: Set<ShortStatusType>): CompactEntry {
        const status = entry.s;

        const pass = successStatuses.has(status);

        return {
            s: status,
            c: [pass ? 1 : 0, 1],
        };
    }

    static populateMetadata(parent: EntryTree, successStatuses: Set<ShortStatusType>) {
        const stats = Tree.emptyStatusMap();
        let passedTests = 0;
        let totalTests = 0;

        for (const value of Object.values(parent)) {
            if (value instanceof PartialEntry) {
                // entry
                totalTests += value.totalTests;
                if (successStatuses.has(value.status)) {
                    if (value.status === 'P' && value.totalTests === 0) {
                        passedTests += 1;
                    } else {
                        passedTests += value.passedTests;
                    }
                }

                stats[value.status] += 1;
            } else {
                // directory
                Tree.populateMetadata(value, successStatuses);

                for (const sk in value[TreeMeta]) {
                    // @ts-ignore
                    stats[sk] += value[TreeMeta][sk];
                }

                passedTests += value[TreeMetaSubtest][0];
                totalTests += value[TreeMetaSubtest][1];
            }

            parent[TreeMeta] = stats;
            parent[TreeMetaSubtest] = [passedTests, totalTests];
        }
    }

    /** Check if an entry name is a synthetic pass_XX/fail_XX name */
    static isSyntheticEntryName(name: string): boolean {
        return /^(?:pass|fail)_\d+$/.test(name);
    }

    tree: EntryTree;
    #fyi: Fyi;

    constructor(fyi: Fyi, flat: CompactTestEntry[], successStatuses: Set<ShortStatusType>) {
        const start = window.performance.now();
        this.#fyi = fyi;

        // create the tree from the flat map
        const tree = Object.create(null);
        for (const entry of flat) {
            const key = entry.p;

            // Compute pass status from the entry
            const computed = Tree.recomputeTestEntry(entry, successStatuses);
            const status = computed.s;
            const [passedTests, totalTests] = computed.c;

            // makes things easier to work with
            const partialEntry = new PartialEntry(
                fyi,
                key,
                {
                    status,
                    passedTests,
                    totalTests,
                },
            );

            // created a nested key
            const path = key.split('/');
            setDeep(tree, path, partialEntry);
        }

        // populate metadata and mark directories with synthetic entries
        Tree.populateMetadata(tree, successStatuses);
        this.markSyntheticDirectories(tree);

        this.tree = tree;

        const taken = (window.performance.now() - start) / 1000;
        const numEntries = Object.keys(flat).length;
        if (numEntries !== 0) {
            console.groupCollapsed('WPT tree build');
            console.log(`${numEntries} entries`);
            console.log(`took ${formatSeconds(taken)}`);
            console.groupEnd();
        }
    }

    /**
     * Mark directories that contain synthetic pass_XX/fail_XX entries
     * These directories can be lazy-loaded to get real test names
     */
    private markSyntheticDirectories(tree: EntryTree): void {
        for (const [key, value] of Object.entries(tree)) {
            if (value instanceof PartialEntry) {
                // Check if this is a synthetic entry
                if (Tree.isSyntheticEntryName(key)) {
                    tree[SyntheticEntries] = true;
                }
            } else {
                // Recurse into subdirectories
                this.markSyntheticDirectories(value);
            }
        }
    }

    /**
     * Check if a directory at the given path has synthetic entries that can be lazy-loaded
     */
    hasSyntheticEntries(path: string[]): boolean {
        const branch = followDeep(this.tree, path);
        if (!branch || branch instanceof PartialEntry) {
            return false;
        }
        return !!(branch as EntryTree)[SyntheticEntries];
    }

    /**
     * Lazy-load real test names for a directory, replacing synthetic entries
     * Returns true if entries were loaded, false if not supported or on error
     */
    async lazyLoadDirectory(path: string[]): Promise<boolean> {
        const provider = this.#fyi.getProvider();
        if (!provider?.fetchDirectoryContents) {
            return false;
        }

        const branch = followDeep(this.tree, path);
        if (!branch || branch instanceof PartialEntry) {
            return false;
        }

        const dirTree = branch as EntryTree;
        if (!dirTree[SyntheticEntries]) {
            return false; // Already loaded or not synthetic
        }

        try {
            const dirPath = path.join('/');
            const entries = await provider.fetchDirectoryContents(dirPath);

            if (entries.length === 0) {
                return false;
            }

            // Remove synthetic entries from the directory
            for (const key of Object.keys(dirTree)) {
                if (Tree.isSyntheticEntryName(key)) {
                    delete dirTree[key];
                }
            }

            // Add real entries
            for (const entry of entries) {
                const computed = Tree.recomputeTestEntry(entry);
                const status = computed.s;
                const [passedTests, totalTests] = computed.c;

                const partialEntry = new PartialEntry(
                    this.#fyi,
                    entry.p,
                    {
                        status,
                        passedTests,
                        totalTests,
                    },
                );

                // Parse the path and add to proper location in tree
                // Entry paths from fetchDirectoryContents are relative to the directory being loaded
                // e.g., for loading "built-ins", entries might be "built-ins/Array/test.js"
                // We need to create the nested structure within dirTree
                const parts = entry.p.split('/');
                const dirPath = path.join('/');
                const relativeParts: string[] = [];

                // Find the parts that are relative to the current directory
                let foundDir = false;
                for (let i = 0; i < parts.length; i++) {
                    const partial = parts.slice(0, i + 1).join('/');
                    if (partial === dirPath) {
                        foundDir = true;
                        continue;
                    }
                    if (foundDir) {
                        relativeParts.push(parts[i]);
                    }
                }

                if (relativeParts.length === 0) {
                    // Entry is directly in this directory
                    const filename = parts[parts.length - 1];
                    dirTree[filename] = partialEntry;
                } else {
                    // Entry is in a subdirectory - use setDeep to create nested structure
                    setDeep(dirTree, relativeParts, partialEntry);
                }
            }

            // Clear synthetic marker and recalculate metadata
            delete dirTree[SyntheticEntries];
            Tree.populateMetadata(dirTree);

            // Re-populate parent metadata up the tree
            this.recalculateParentMetadata(path);

            console.log(`Lazy-loaded ${entries.length} tests for ${dirPath}`);
            return true;
        } catch (error) {
            console.error(`Failed to lazy-load directory ${path.join('/')}:`, error);
            return false;
        }
    }

    /**
     * Recalculate metadata for parent directories after lazy-loading
     */
    private recalculateParentMetadata(path: string[]): void {
        // Walk up the tree and recalculate metadata
        for (let i = path.length - 1; i >= 0; i--) {
            const parentPath = path.slice(0, i);
            const parent = followDeep(this.tree, parentPath);
            if (parent && !(parent instanceof PartialEntry)) {
                Tree.populateMetadata(parent as EntryTree);
            }
        }
        // Also recalculate root
        Tree.populateMetadata(this.tree);
    }

    statusCount() {
        return this.tree[TreeMeta] ?? Tree.emptyStatusMap();
    }

    navigate(path: string[], { search = '', statuses = [] }: NavigateParams = {}): PartialEntry|EntryTree|null {
        const branch = followDeep(this.tree, path);

        if (!branch) {
            return null;
        }

        if (branch instanceof PartialEntry) {
            return branch;
        }

        if (!(TreeMeta in branch) && !(TreeMetaSubtest in branch)) {
            return null;
        }

        const filters: ((key: string, value: PartialEntry|EntryTree) => boolean)[] = [];
        if (statuses.length !== 0) {
            filters.push((_, value) => {
                if (value instanceof PartialEntry) {
                    return statuses.includes(value.status);
                }

                const stats = value[TreeMeta];
                return statuses.some((status) => stats && stats[status] > 0);
            });
        }

        search = search?.trim()?.toLowerCase()
        if (search) {
            filters.push(key => key.toLowerCase().includes(search));
        }

        const entries = Reflect.ownKeys(branch as EntryTree)
            // @ts-ignore
            .map(key => [key, branch[key]])
            .filter(([key, value]) => {
                if (typeof key === 'symbol') return true;
                return filters.every(fn => fn(key as string, value))
            });

        // @ts-ignore
        return Object.fromEntries(entries);
    }
}
