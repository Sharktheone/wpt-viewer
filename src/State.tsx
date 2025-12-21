import { effect, signal } from '@preact/signals';

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

export const settings = {
    showTests: signal<boolean>(getShowTests()),
    source: signal<string>('HEAD~0'),
    testSortMode: signal<TestSortMode>(getTestSortMode()),
};

effect(() => {
    localStorage.setItem('showTests', settings.showTests.value.toString());
});

effect(() => {
    localStorage.setItem('testSortMode', settings.testSortMode.value);
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
} from '#/Config';
