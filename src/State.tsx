import { effect, signal } from '@preact/signals';
import { ShortStatus, type ShortStatusType } from './Wpt/Status';

function getShowTests() {
    const showTests = localStorage.getItem('showTests');
    return showTests === 'true' || showTests === null;
}

export type TestSortMode = 'total' | 'passed' | 'failed';

function getTestSortMode(): TestSortMode {
    const mode = localStorage.getItem('testSortMode');
    if (mode === 'total' || mode === 'passed' || mode === 'failed') {
        return mode;
    }
    return 'total';
}

export const DEFAULT_SUCCESS_STATUSES: ShortStatusType[] = ['O', 'P', 'S'];

function getSuccessStatuses(): ShortStatusType[] {
    const raw = localStorage.getItem('successStatuses');
    if (!raw) return DEFAULT_SUCCESS_STATUSES;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(s => ShortStatus.includes(s as ShortStatusType))) {
            return parsed as ShortStatusType[];
        }
    } catch {
        // ignore
    }
    return DEFAULT_SUCCESS_STATUSES;
}

export const settings = {
    showTests: signal<boolean>(getShowTests()),
    source: signal<string>('HEAD~0'),
    testSortMode: signal<TestSortMode>(getTestSortMode()),
    successStatuses: signal<ShortStatusType[]>(getSuccessStatuses()),
};

// Counter to trigger tree refresh - increment to refetch
export const treeRefreshCounter = signal(0);

export function refreshTree() {
    treeRefreshCounter.value++;
}

effect(() => {
    localStorage.setItem('showTests', settings.showTests.value.toString());
});

effect(() => {
    localStorage.setItem('testSortMode', settings.testSortMode.value);
});

effect(() => {
    localStorage.setItem('successStatuses', JSON.stringify(settings.successStatuses.value));
});

export {
    appConfig,
    activeSourceKey,
    activeSource,
    capabilities,
    profiles,
    isInteractiveMode,
    loadConfig,
    setActiveSource,
    checkCapabilities,
    loadProfiles,
    initializeSource,
    selectedEngine,
    selectedRef,
    setSelectedEngine,
    setSelectedRef,
    loadingProgress,
} from '#/Config';
