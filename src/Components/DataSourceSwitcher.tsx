import '#/Style/components/DataSourceSwitcher.scss';

import { Database, Server, Github, RefreshCw } from 'lucide-preact';
import { useComputed } from '@preact/signals';
import { Select } from './Ui/Select';
import {
    appConfig,
    activeSource,
    activeSourceKey,
    setActiveSource,
    isInteractiveMode,
} from '#/State';
import { openRerunModal } from '#/RerunState';
import { globalPath } from '#/Routing';

export function DataSourceSwitcher() {
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

    function handleSourceChange(e: InputEvent) {
        const target = e.target as HTMLSelectElement;
        setActiveSource(target.value);
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
