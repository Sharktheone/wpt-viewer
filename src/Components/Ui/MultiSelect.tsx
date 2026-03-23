import '#/Style/ui/MultiSelect.scss';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Color } from './types';

export interface MultiSelectOption {
    value: string;
    label: string;
    color?: Color;
}

interface MultiSelectProps {
    options: MultiSelectOption[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    placeholder?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select…' }: MultiSelectProps) {
    const open = useSignal(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onOutsideClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                open.value = false;
            }
        }
        document.addEventListener('mousedown', onOutsideClick);
        return () => document.removeEventListener('mousedown', onOutsideClick);
    }, []);

    function toggle(value: string) {
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange(next);
    }

    const selectedOptions = options.filter(o => selected.has(o.value));

    return (
        <div class='MultiSelect' ref={ref}>
            <button
                type='button'
                class={`MultiSelect-trigger${open.value ? ' open' : ''}`}
                onClick={() => { open.value = !open.value; }}
            >
                <div class='MultiSelect-pills'>
                    {selectedOptions.length === 0
                        ? <span class='MultiSelect-placeholder'>{placeholder}</span>
                        : selectedOptions.map(o => (
                            <span key={o.value} class={`MultiSelect-pill${o.color ? ` MultiSelect-pill-${o.color}` : ''}`}>
                                {o.label}
                            </span>
                        ))
                    }
                </div>
                <span class='MultiSelect-chevron' aria-hidden>▾</span>
            </button>

            {open.value && (
                <div class='MultiSelect-dropdown'>
                    {options.map(o => {
                        const isSelected = selected.has(o.value);
                        return (
                            <button
                                key={o.value}
                                type='button'
                                class={`MultiSelect-option${isSelected ? ' selected' : ''}${o.color ? ` MultiSelect-option-${o.color}` : ''}`}
                                onClick={() => toggle(o.value)}
                            >
                                <span class='MultiSelect-dot' aria-hidden />
                                <span class='MultiSelect-label'>{o.label}</span>
                                <span class='MultiSelect-check' aria-hidden>{isSelected ? '✓' : ''}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
