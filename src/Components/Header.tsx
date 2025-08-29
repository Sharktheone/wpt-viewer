import '#/Style/components/Header.scss'

import {Github, Settings, Undo2} from 'lucide-preact'
import {Breadcrumbs} from './Ui/Breadcrumbs'
import {globalPath, page} from '#/Routing'
import {useComputed} from '@preact/signals'
import {settings} from "#/State.tsx"

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

    const commitoptions = useComputed(() => {
        const NUM_HEAD_MINUS = 5;

        return Array.from({length: NUM_HEAD_MINUS + 1}, (_, i) => {
            const value = `HEAD~${i}`;
            return <option value={value} key={value}>
                {i === 0 ? 'Latest' : `HEAD~${i}`}
            </option>;
        })
    });

    function changeSource({target}: InputEvent) {
        const source = (target as HTMLSelectElement).selectedOptions[0].value;

        settings.source.value = source;
    }

    return <header class='Header'>
        <Breadcrumbs signal={globalPath} />

        <div class='links'>
            {backToWptLink}

            <label>
                <select onInput={changeSource}>
                    {commitoptions}
                </select>
            </label>

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
