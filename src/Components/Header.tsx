import '#/Style/components/Header.scss'

import {GitCommitHorizontal, Github, Settings, Undo2} from 'lucide-preact'
import {Breadcrumbs} from './Ui/Breadcrumbs'
import {globalPath, page} from '#/Routing'
import {useComputed, useSignal} from '@preact/signals'
import {settings} from "#/State.tsx"
import {Input} from "#/Components/Ui/Input.tsx"
import {Select} from "#/Components/Ui/Select.tsx"

export function Header() {
    const backToWptLink = useComputed(() =>
        page.value !== 'wpt' && <a
            href='#/'
            class='unstyled'
            title='Go back to WPT'
            tabIndex={-1}>
            <Undo2 size={24} aria-hidden />
        </a>
    );

    const isCustomSource = useSignal(settings.source.value == "custom")

    const commitoptions = useComputed(() => {
        const NUM_HEAD_MINUS = 5;

        return Array.from({length: NUM_HEAD_MINUS + 2}, (_, i) => {
            if (i === NUM_HEAD_MINUS + 1) {
                return <option value='custom' key='custom'>
                    Custom
                </option>;
            }


            const value = `HEAD~${i}`;
            return <option value={value} key={value}>
                {i === 0 ? 'Latest' : `HEAD~${i}`}
            </option>;
        })
    });

    function changeSource({target}: InputEvent) {
        const source = (target as HTMLSelectElement).selectedOptions[0].value;

        if (source === 'custom') {
            isCustomSource.value = true;
            return;
        }
        isCustomSource.value = false;
        settings.source.value = source;
    }

    return <header class='Header'>
        <Breadcrumbs signal={globalPath} />

        <div class='links'>
            {backToWptLink}

            <Select onInput={changeSource}>
                {commitoptions}
            </Select>

            {isCustomSource.value && (
                <div class="commit-hash">
                    <Input
                        placeholder='commit hash'
                        signal={settings.source}
                        icon={GitCommitHorizontal}
                    />
                </div>
            )}

            <a
                href='#/settings'
                class='unstyled'
                title='Settings'>
                <Settings size={24} aria-hidden />
            </a>

            <a
                href='https://github.com/utf-4096/wpt-viewer'
                target='_blank'
                class='unstyled'
                title='View the source code on GitHub'
                tabIndex={-1}
                rel='noreferrer'>
                <Github size={24} aria-hidden />
            </a>
        </div>
    </header>
}
