import '#/Style/components/DataSourceSwitcher.scss';

import { Database, Server, Github, RefreshCw, Cloud, GitBranch, Bug, Stone } from 'lucide-preact';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { Select } from './Ui/Select';
import {
    appConfig,
    activeSource,
    activeSourceKey,
    setActiveSource,
    isInteractiveMode,
    selectedEngine,
    selectedRef,
    availableEngines,
    availableRefs,
    setSelectedEngine,
    setSelectedRef,
} from '#/State';
import { openRerunModal } from '#/RerunState';
import { globalPath } from '#/Routing';
import { fetchTest262FyiEngines, fetchBoaRefs } from '#/Wpt/Fyi';
import { treeRefreshCounter } from '#/State';

export function DataSourceSwitcher() {
    const enginesLoading = useSignal(false);
    const refsLoading = useSignal(false);

    // Load engines when switching to test262fyi
    useSignalEffect(() => {
        const source = activeSource.value;
        if (!source || source.type !== 'test262fyi') return;

        // Use peek() to avoid re-triggering this effect when availableEngines changes
        if (Object.keys(availableEngines.peek()).length === 0) {
            enginesLoading.value = true;
            fetchTest262FyiEngines().then(engines => {
                availableEngines.value = engines;
                enginesLoading.value = false;
            });
        }
    });

    // Load refs when switching to boa
    useSignalEffect(() => {
        const source = activeSource.value;
        if (!source || source.type !== 'boa') return;

        // Use peek() to avoid re-triggering this effect when availableRefs changes
        if (availableRefs.peek().length <= 1) {
            refsLoading.value = true;
            fetchBoaRefs().then(refs => {
                availableRefs.value = refs;
                refsLoading.value = false;
            });
        }
    });

    const sourceOptions = useComputed(() => {
        const cfg = appConfig.value;
        if (!cfg) return [];

        return Object.entries(cfg.sources).map(([key, source]) => (
            <option value={key} key={key}>
                {source.name}
            </option>
        ));
    });

    const sourceIcon = useComputed(() => {
        const source = activeSource.value;
        if (!source) return <Database size={18} />;

        switch (source.type) {
            case 'github':
                return <Github size={18} />;
            case 'local':
                return <Server size={18} />;
            case 'boa':
                return <Github size={18} />;
            case 'test262fyi':
                return <Cloud size={18} />;
            case 'libjs':
                return <Bug size={18} />;
            case 'kiesel':
                return <Stone size={18} />;
            default:
                return <Database size={18} />;
        }
    });

    const modeIndicator = useComputed(() => {
        if (isInteractiveMode.value) {
            return <span class="mode-badge interactive">Interactive</span>;
        }
        return <span class="mode-badge readonly">Read-only</span>;
    });

    const rerunTitle = useComputed(() => {
        const path = globalPath.value.join('/');
        return path ? `Rerun tests in ${path}` : 'Rerun all tests';
    });

    // Engine options for test262fyi
    const engineOptions = useComputed(() => {
        const engines = availableEngines.value;
        return Object.entries(engines).map(([key, version]) => (
            <option value={key} key={key}>
                {key} ({version})
            </option>
        ));
    });

    // Ref options for boa
    const refOptions = useComputed(() => {
        const refs = availableRefs.value;
        return refs.map((ref: string) => {
            const label = ref.replace('heads/', '').replace('tags/', '');
            return (
                <option value={ref} key={ref}>
                    {label}
                </option>
            );
        });
    });

    // Show engine selector for test262fyi
    const showEngineSelector = useComputed(() => {
        return activeSource.value?.type === 'test262fyi';
    });

    // Show ref selector for boa
    const showRefSelector = useComputed(() => {
        return activeSource.value?.type === 'boa';
    });

    function handleSourceChange(e: InputEvent) {
        const target = e.target as HTMLSelectElement;
        setActiveSource(target.value);
    }

    function handleEngineChange(e: InputEvent) {
        const target = e.target as HTMLSelectElement;
        setSelectedEngine(target.value);
        // Trigger tree refresh
        treeRefreshCounter.value++;
    }

    function handleRefChange(e: InputEvent) {
        const target = e.target as HTMLSelectElement;
        setSelectedRef(target.value);
        // Trigger tree refresh
        treeRefreshCounter.value++;
    }

    function handleRerunClick() {
        const currentPath = globalPath.value.join('/');
        openRerunModal(currentPath);
    }

    return (
        <div class="DataSourceSwitcher">
            <div class="source-icon" title={activeSource.value?.description}>
                {sourceIcon}
            </div>
            <Select onInput={handleSourceChange} value={activeSourceKey.value} className="source-select">
                {sourceOptions}
            </Select>
            
            {showEngineSelector.value && (
                <div class="engine-selector">
                    <Select 
                        onInput={handleEngineChange} 
                        value={selectedEngine.value} 
                        className="engine-select"
                        disabled={enginesLoading.value}
                    >
                        {engineOptions}
                    </Select>
                </div>
            )}
            
            {showRefSelector.value && (
                <div class="ref-selector">
                    <GitBranch size={14} />
                    <Select 
                        onInput={handleRefChange} 
                        value={selectedRef.value} 
                        className="ref-select"
                        disabled={refsLoading.value}
                    >
                        {refOptions}
                    </Select>
                </div>
            )}
            
            {modeIndicator}
            {isInteractiveMode.value && (
                <button
                    type="button"
                    class="rerun-btn"
                    onClick={handleRerunClick}
                    title={rerunTitle.value}
                >
                    <RefreshCw size={16} />
                </button>
            )}
        </div>
    );
}
