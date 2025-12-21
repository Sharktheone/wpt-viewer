import '#/Style/ui/Breadcrumbs.scss';

import { type Signal, useComputed, useSignal } from '@preact/signals';
import { Bird, ChevronRight, Copy, Check } from 'lucide-preact';
import { Fragment } from 'preact/jsx-runtime';

function Crumb({ path }: { path: string[] }) {
    return <a class='crumb' href={`#/v/${path.join('/')}`}>
        {path.at(-1)}
    </a>
}

function CopyButton({ path }: { path: Signal<string[]> }) {
    const copied = useSignal(false);

    const pathString = useComputed(() => path.value.join('/'));

    async function copyPath() {
        try {
            await navigator.clipboard.writeText(pathString.value);
            copied.value = true;
            setTimeout(() => {
                copied.value = false;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy path:', err);
        }
    }

    const icon = useComputed(() => 
        copied.value ? <Check size={14} /> : <Copy size={14} />
    );

    const title = useComputed(() =>
        copied.value ? 'Copied!' : 'Copy path'
    );

    return (
        <button
            type="button"
            class={`copy-path-btn ${copied.value ? 'copied' : ''}`}
            onClick={copyPath}
            title={title.value}
        >
            {icon}
        </button>
    );
}

export function Breadcrumbs({ signal }: { signal: Signal<string[]> }) {
    const crumbs = useComputed(() =>
        signal.value.map((_, index) => {
            const path = signal.value.slice(0, index + 1);

            return <Fragment key={path.join('/')}>
                {index !== 0 && <ChevronRight size={16} />}
                <Crumb path={path} />
            </Fragment>
        })
    );

    const rightChevron = useComputed(() =>
        signal.value.length !== 0 &&
        <ChevronRight size={16} />
    );

    const showCopyButton = useComputed(() => signal.value.length > 0);

    return <div class='Breadcrumbs'>
        <a class='crumb home-crumb' href='#/'>
            <Bird size={24} />
        </a>

        {rightChevron}
        {crumbs}
        {showCopyButton.value && <CopyButton path={signal} />}
    </div>
}
