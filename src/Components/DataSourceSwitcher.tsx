import '#/Style/components/DataSourceSwitcher.scss';

import { Database, RefreshCw } from 'lucide-preact';
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
    setSelectedEngine,
    setSelectedRef,
} from '#/State';
import { openRerunModal } from '#/RerunState';
import { globalPath } from '#/Routing';
import { providerRegistry, type ProviderOptionDefinition } from '#/DataProviders';
import { treeRefreshCounter } from '#/State';

export function DataSourceSwitcher() {
    const optionDefinitions = useSignal<ProviderOptionDefinition[]>([]);
    const optionsLoading = useSignal(false);
    const dynamicOptions = useSignal<Record<string, { value: string; label: string }[]>>({});

    // Load option definitions when source changes
    useSignalEffect(() => {
        const source = activeSource.value;
        if (!source) return;

        const defs = providerRegistry.getOptionDefinitions(source.type);
        optionDefinitions.value = defs;
        
        // Load dynamic options for each definition
        (async () => {
            optionsLoading.value = true;
            const newOptions: Record<string, { value: string; label: string }[]> = {};
            
            for (const def of defs) {
                if (def.fetchOptions) {
                    try {
                        newOptions[def.key] = await def.fetchOptions();
                    } catch (error) {
                        console.error(`Failed to fetch options for ${def.key}:`, error);
                        newOptions[def.key] = [];
                    }
                } else if (def.options) {
                    newOptions[def.key] = def.options;
                }
            }
            
            dynamicOptions.value = newOptions;
            optionsLoading.value = false;
        })();
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

        const IconComponent = providerRegistry.getIconType(source.type);
        return IconComponent ? <IconComponent size={18} /> : <Database size={18} />;
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

    function handleOptionChange(key: string, e: InputEvent) {
        const target = e.target as HTMLSelectElement;
        
        // Update the appropriate signal based on the option key
        switch (key) {
            case 'engine':
                setSelectedEngine(target.value);
                break;
            case 'ref':
                setSelectedRef(target.value);
                break;
            default:
                console.warn(`Unknown option key: ${key}`);
        }
        
        // Trigger tree refresh
        treeRefreshCounter.value++;
    }

    function getCurrentOptionValue(key: string): string {
        switch (key) {
            case 'engine':
                return selectedEngine.value;
            case 'ref':
                return selectedRef.value;
            default:
                return '';
        }
    }

    function handleRerunClick() {
        const currentPath = globalPath.value.join('/');
        openRerunModal(currentPath);
    }

    // Render dynamic option selectors
    const optionSelectors = useComputed(() => {
        return optionDefinitions.value.map(def => {
            const options = dynamicOptions.value[def.key] || [];
            const IconComponent = def.icon;
            
            return (
                <div class="option-selector" key={def.key}>
                    {IconComponent && <IconComponent size={14} />}
                    <Select
                        onInput={(e) => handleOptionChange(def.key, e)}
                        value={getCurrentOptionValue(def.key)}
                        className={`${def.key}-select`}
                        disabled={optionsLoading.value || options.length === 0}
                    >
                        {options.map(opt => (
                            <option value={opt.value} key={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </Select>
                </div>
            );
        });
    });

    return (
        <div class="DataSourceSwitcher">
            <div class="source-icon" title={activeSource.value?.description}>
                {sourceIcon}
            </div>
            <Select onInput={handleSourceChange} value={activeSourceKey.value} className="source-select">
                {sourceOptions}
            </Select>
            
            {optionSelectors}
            
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
