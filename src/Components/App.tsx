import '#/Style/base/base.scss';
import '#/Style/components/App.scss';

import { Input } from './Ui/Input.tsx';
import { type FilterMap, StatusSelector } from './StatusSelector.tsx';
import { Search } from 'lucide-preact';
import { Header } from './Header.tsx';
import { Suspense } from './Ui/Throbber.tsx';
import { PartialEntry, type EntryTree, type Tree } from '#/Wpt/Tree.ts';
import { TestList } from './TestList/Component.tsx';
import { type Signal, useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { TestView } from './TestView/Component.tsx';
import { Fyi } from '#/Wpt/Fyi.ts';
import { ShortStatus, type ShortStatusType } from '#/Wpt/Status.ts';
import { NotFound } from './NotFound.tsx';
import { globalPath, page } from '#/Routing.tsx';
import { Settings } from './Pages/Settings.tsx';
import { settings, activeSource, initializeSource, treeRefreshCounter } from '#/State.tsx';
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
    /** Track which paths have been lazy-loaded to avoid re-triggering */
    const lazyLoadedPaths = useSignal<Set<string>>(new Set());

    const entryOrEntryTree = useComputed(() =>
        tree.value?.navigate(globalPath.value, {
            search: search.value,
            statuses: unwrapSignalStatusMap(statusFilters),
        })
    );

    const headIsEntry = useComputed(() =>
        entryOrEntryTree.value instanceof PartialEntry
    );

    const suspenseContent = useComputed(() => {
        if (page.value === 'settings') {
            return <Settings />
        }

        if (page.value === 'not-found' || tree.value && !entryOrEntryTree.value) {
            return <NotFound />
        }

        if (headIsEntry.value) {
            return <TestView
                test={entryOrEntryTree as Signal<PartialEntry>}
            />
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

    // Lazy-load test names when navigating to a directory with synthetic entries
    useSignalEffect(() => {
        const currentTree = tree.value;
        const path = globalPath.value;
        const pathStr = path.join('/');
        
        if (!currentTree) return;
        
        // Skip if already lazy-loaded for this path
        if (lazyLoadedPaths.value.has(pathStr)) return;
        
        // Check if this directory has synthetic entries that need lazy-loading
        if (currentTree.hasSyntheticEntries(path)) {
            // Mark as loaded immediately to prevent duplicate requests
            lazyLoadedPaths.value = new Set(lazyLoadedPaths.value).add(pathStr);
            
            currentTree.lazyLoadDirectory(path)
                .then((success) => {
                    if (success) {
                        // Trigger re-render by reassigning the tree
                        // This is needed because lazyLoadDirectory modifies the tree in place
                        tree.value = currentTree;
                    } else {
                        // Remove from loaded set if failed
                        const newSet = new Set(lazyLoadedPaths.value);
                        newSet.delete(pathStr);
                        lazyLoadedPaths.value = newSet;
                    }
                })
                .catch(err => {
                    console.error('Failed to lazy-load directory:', err);
                    // Remove from loaded set on error
                    const newSet = new Set(lazyLoadedPaths.value);
                    newSet.delete(pathStr);
                    lazyLoadedPaths.value = newSet;
                });
        }
    });

    useSignalEffect(() => {
        const currentFyi = fyi.value;
        void treeRefreshCounter.value;
        const successStatuses = new Set(settings.successStatuses.value);
        tree.value = null;
        lazyLoadedPaths.value = new Set(); // Clear lazy-load cache on tree refresh

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

        <Suspense until={tree}>
            {suspenseContent}
        </Suspense>

        <RerunModal />
        <CompareView />
        <HistoryDetailView />
        <TestOutputModal />
    </div>
}
