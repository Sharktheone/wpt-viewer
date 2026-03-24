import '#/Style/base/base.scss';
import '#/Style/components/App.scss';

import { Input } from './Ui/Input.tsx';
import { type FilterMap, StatusSelector } from './StatusSelector.tsx';
import { Search } from 'lucide-preact';
import { Header } from './Header.tsx';
import { Suspense } from './Ui/Throbber.tsx';
import { PartialEntry, LazyChildren, Tree, type EntryTree } from '#/Wpt/Tree.ts';
import { TestList } from './TestList/Component.tsx';
import { type Signal, useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { TestView } from './TestView/Component.tsx';
import { Fyi } from '#/Wpt/Fyi.ts';
import { ShortStatus, type ShortStatusType } from '#/Wpt/Status.ts';
import { NotFound } from './NotFound.tsx';
import { globalPath, page } from '#/Routing.tsx';
import { Settings } from './Pages/Settings.tsx';
import { settings, activeSource, selectedEngine, initializeSource, treeRefreshCounter } from '#/State.tsx';
import { RerunModal } from './RerunModal.tsx';
import { CompareView } from './CompareView.tsx';
import { HistoryDetailView } from './HistoryDetailView.tsx';
import { TestOutputModal } from './TestOutputModal.tsx';

function createSignalStatusMap() {
    const entries = ShortStatus.map(s => [s, useSignal(false)]);
    return Object.fromEntries(entries) as FilterMap;
}

function unwrapSignalStatusMap(map: FilterMap) {
    return Object.entries(map)
        .filter(([_, signal]) => signal.value)
        .map(([key]) => key) as ShortStatusType[];
}

export function App() {
    const fyi = useComputed(() => {
        const source = activeSource.value;
        return new Fyi(settings.source.value, source ?? undefined);
    });

    const statusFilters: FilterMap = createSignalStatusMap();
    const search = useSignal('');
    const tree = useSignal<Tree|null>(null);
    const lazyLoadVersion = useSignal(0);
    const isLazyLoading = useSignal(false);

    const entryOrEntryTree = useComputed(() => {
        void lazyLoadVersion.value; // re-render when lazy children are loaded
        return tree.value?.navigate(globalPath.value, {
            search: search.value,
            statuses: unwrapSignalStatusMap(statusFilters),
        });
    });

    const headIsEntry = useComputed(() =>
        entryOrEntryTree.value instanceof PartialEntry
    );

    const suspenseContent = useComputed(() => {
        if (page.value === 'settings') {
            return <Settings />
        }

        if (page.value === 'not-found') {
            return <NotFound />
        }

        // Show loading spinner while lazy-loading directory contents
        if (isLazyLoading.value) {
            return null;
        }

        if (tree.value && !entryOrEntryTree.value) {
            return <NotFound />
        }

        if (headIsEntry.value) {
            return <TestView
                test={entryOrEntryTree as Signal<PartialEntry>}
            />
        }

        // Check if the current view is a lazy directory (children not yet loaded)
        const result = entryOrEntryTree.value;
        if (result && !(result instanceof PartialEntry) && result[LazyChildren]) {
            return null; // show spinner via Suspense
        }

        return <TestList
            tree={entryOrEntryTree as Signal<EntryTree>}
            path={globalPath}
        />
    });

    const searchClass = useComputed(() =>
        (!entryOrEntryTree.value || headIsEntry.value || page.value !== 'wpt') ?
            'search search-hidden':
            'search'
    );

    useSignalEffect(() => {
        globalPath.value;
        search.value = '';
    });

    // Lazy loading effect for test262.fyi directories
    useSignalEffect(() => {
        const currentTree = tree.value;
        const currentFyi = fyi.value;
        if (!currentTree || currentFyi.source.type !== 'test262fyi') return;

        void lazyLoadVersion.value; // re-run when children are inserted
        const path = globalPath.value;

        // Check if any directory along the current path needs loading
        const lazyIdx = currentTree.findFirstLazyAncestor(path);
        if (lazyIdx < 0) return;

        isLazyLoading.value = true;

        // Compute all directory paths that may need fetching (from first lazy to target)
        const pathsToFetch: string[] = [];
        for (let i = lazyIdx === 0 ? 1 : lazyIdx; i <= path.length; i++) {
            pathsToFetch.push(path.slice(0, i).join('/'));
        }

        // Fetch all needed directories in parallel (cached if already fetched)
        Promise.all(pathsToFetch.map(p => currentFyi.loadLazyDirectory(p)))
            .then(results => {
                const engine = currentFyi.source.engine || selectedEngine.value || 'v8';
                let changed = false;

                // Insert in order (parent before child)
                for (let i = 0; i < results.length; i++) {
                    const data = results[i];
                    if (!data?.files) continue;

                    const subpathIdx = lazyIdx === 0 ? i + 1 : lazyIdx + i;
                    const subpath = path.slice(0, subpathIdx);

                    // Only insert if this node is still lazy
                    const node = currentTree.navigate(subpath);
                    if (node && !(node instanceof PartialEntry) && node[LazyChildren]) {
                        Tree.insertLazyChildren(
                            currentTree.tree,
                            subpath,
                            data.files,
                            engine,
                            currentFyi,
                        );
                        changed = true;
                    }
                }

                // Clear loading state before bumping version so signals batch together
                isLazyLoading.value = false;
                if (changed) {
                    lazyLoadVersion.value++;
                }
            })
            .catch(err => {
                console.error('Failed to lazy-load directory:', err);
                isLazyLoading.value = false;
            });
    });

    useSignalEffect(() => {
        const currentFyi = fyi.value;
        void treeRefreshCounter.value;
        const successStatuses = new Set(settings.successStatuses.value);
        tree.value = null;

        currentFyi.getTree(successStatuses)
            .then(t => {
                tree.value = t;
            })
            .catch(err => {
                console.error('Failed to load tree:', err);
            });

        initializeSource();
    });

    return <div class='App'>
        <Header />

        <div class={searchClass}>
            <Input
                icon={Search}
                placeholder='Type the name of a test or folder'
                signal={search}
            />

            <StatusSelector filters={statusFilters} />
        </div>

        <Suspense until={tree} loading={isLazyLoading}>
            {suspenseContent}
        </Suspense>

        <RerunModal />
        <CompareView />
        <HistoryDetailView />
        <TestOutputModal />
    </div>
}
