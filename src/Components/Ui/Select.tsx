import '#/Style/ui/Select.scss';

import type { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';

export interface SelectAttributes {
    signal?: Signal<string>;
    children: ComponentChildren;
    onInput?: (e: InputEvent) => void;
    className?: string;
}

export function Select({ signal, children, onInput, className }: SelectAttributes) {
    function handleInput(e: InputEvent) {
        if (signal) {
            const target = e.target as HTMLSelectElement;
            signal.value = target.value;
        }
        onInput?.(e);
    }

    return <div class={`Select${className ? ' ' + className : ''}`}>
        <select onInput={handleInput} value={signal}>
            {children}
        </select>
        <div class='chevron' aria-hidden>▾</div>
    </div>
}
