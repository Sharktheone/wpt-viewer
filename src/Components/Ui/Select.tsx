import '#/Style/ui/Select.scss';

import type { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';

export interface SelectAttributes {
    signal?: Signal<string>;
    value?: string;
    children: ComponentChildren;
    onInput?: (e: InputEvent) => void;
    className?: string;
    disabled?: boolean;
}

export function Select({ signal, value, children, onInput, className, disabled }: SelectAttributes) {
    function handleInput(e: InputEvent) {
        if (signal) {
            const target = e.target as HTMLSelectElement;
            signal.value = target.value;
        }
        onInput?.(e);
    }

    const selectValue = signal ?? value;

    return <div class={`Select${className ? ` ${className}` : ''}${disabled ? ' disabled' : ''}`}>
        <select onInput={handleInput} value={selectValue} disabled={disabled}>
            {children}
        </select>
        <div class='chevron' aria-hidden>▾</div>
    </div>
}
