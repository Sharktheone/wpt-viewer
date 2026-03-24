import { formatSeconds } from '#/Utils/Number.tsx';
import { setDeep, followDeep } from '#/Utils/ObjectTree.tsx';
import type { Fyi } from './Fyi.ts';
import { ShortStatus, type ShortStatusType } from './Status.ts';
import type { CompactTestEntry } from '#/DataProviders';

export const TreeMeta = Symbol('TreeMeta');
export const TreeMetaSubtest = Symbol('TreeMetaSubtest');
export const LazyChildren = Symbol('LazyChildren');

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
    [LazyChildren]?: boolean;
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
                // directory - skip recursion for lazy (not yet loaded) directories
                if (!value[LazyChildren]) {
                    Tree.populateMetadata(value, successStatuses);
                }

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

    tree: EntryTree;

    constructor(fyi: Fyi, flat: CompactTestEntry[], successStatuses: Set<ShortStatusType>) {
        const start = window.performance.now();

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

        // populate metadata
        Tree.populateMetadata(tree, successStatuses);

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

    /**
     * Find the index of the first lazy (not yet loaded) directory along the path.
     * Returns -1 if no lazy directory is found.
     */
    findFirstLazyAncestor(path: string[]): number {
        let node: any = this.tree;
        for (let i = 0; i < path.length; i++) {
            if (!node || node instanceof PartialEntry) return -1;
            if (node[LazyChildren]) return i;
            node = node[path[i]];
        }
        // Check the final node too
        if (node && !(node instanceof PartialEntry) && node[LazyChildren]) return path.length;
        return -1;
    }

    /**
     * Create a lazy directory node with pre-computed metadata.
     * Used for test262.fyi directories whose children haven't been loaded yet.
     */
    static createLazyDirectory(passCount: number, totalCount: number): EntryTree {
        const dir = Object.create(null) as EntryTree;
        const stats = Tree.emptyStatusMap();
        stats['P'] = passCount;
        stats['F'] = totalCount - passCount;
        dir[TreeMeta] = stats;
        dir[TreeMetaSubtest] = [passCount, totalCount];
        dir[LazyChildren] = true;
        return dir;
    }

    /**
     * Build a tree from test262.fyi root index data.
     * Only the top-level structure is populated; subdirectories are lazy.
     */
    static fromTest262FyiRoot(
        fyi: Fyi,
        rootFiles: Record<string, { total: number; engines: Record<string, number> }>,
        engine: string,
        successStatuses: Set<ShortStatusType>,
    ): Tree {
        const instance = new Tree(fyi, [], successStatuses);

        const treeObj = Object.create(null) as EntryTree;

        for (const [name, child] of Object.entries(rootFiles)) {
            if (name.endsWith('.js')) {
                const passed = (child.engines[engine] || 0) > 0;
                const entry = new PartialEntry(fyi, name, {
                    status: passed ? 'P' : 'F',
                    passedTests: passed ? 1 : 0,
                    totalTests: 1,
                });
                setDeep(treeObj, name.split('/'), entry);
            } else {
                const passCount = child.engines[engine] || 0;
                const dir = Tree.createLazyDirectory(passCount, child.total);
                setDeep(treeObj, name.split('/'), dir);
            }
        }

        Tree.populateMetadata(treeObj, successStatuses);
        instance.tree = treeObj;
        return instance;
    }

    /**
     * Insert loaded children into a lazy directory.
     * Called after fetching a directory's JSON from test262.fyi.
     */
    static insertLazyChildren(
        rootTree: EntryTree,
        parentPath: string[],
        childFiles: Record<string, { total: number; engines: Record<string, number> }>,
        engine: string,
        fyi: Fyi,
    ): void {
        const parentNode = parentPath.length === 0
            ? rootTree
            : followDeep(rootTree, parentPath);

        if (!parentNode || parentNode instanceof PartialEntry) return;

        // Remove lazy marker
        delete (parentNode as EntryTree)[LazyChildren];

        for (const [name, child] of Object.entries(childFiles)) {
            const fullPathParts = name.split('/');

            if (name.endsWith('.js')) {
                const passed = (child.engines[engine] || 0) > 0;
                const entry = new PartialEntry(fyi, name, {
                    status: passed ? 'P' : 'F',
                    passedTests: passed ? 1 : 0,
                    totalTests: 1,
                });
                setDeep(rootTree, fullPathParts, entry);
            } else {
                const passCount = child.engines[engine] || 0;
                const dir = Tree.createLazyDirectory(passCount, child.total);
                setDeep(rootTree, fullPathParts, dir);
            }
        }
    }
}
