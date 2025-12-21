import '#/Style/components/TestView/LinkBlock.scss';

import { BookMarked, BookOpen, RefreshCw } from 'lucide-preact';
import type { TestBlockAttributes } from './Component';
import { useComputed } from '@preact/signals';
import { isInteractiveMode } from '#/Config';
import { openRerunModal } from '#/RerunState';

export function LinkBlock({ test }: TestBlockAttributes) {
    const githubUrl = useComputed(
        () => `https://github.com/tc39/test262/tree/main/test/${test.value.path}`
    );

    const mdnUrl = useComputed(() => {
        const path = test.value.path;
        return `https://developer.mozilla.org/search?q=${encodeURIComponent(path)}&sort=relevance`;
    });

    function onRerunClick() {
        const path = test.value.path;
        openRerunModal(path);
    }

    const rerunButton = useComputed(() => {
        if (!isInteractiveMode.value) return null;
        return (
            <div class='link rerun-link'>
                <RefreshCw size={16} />
                <button type="button" class="rerun-btn" onClick={onRerunClick}>
                    Rerun this test
                </button>
            </div>
        );
    });

    return <div class='Block'>
        <header>
            Resources
        </header>

        <section class='LinkBlock'>
            {rerunButton}

            <div class='link'>
                <BookMarked size={16} />
                <a href={githubUrl} target='_blank' rel="noreferrer">
                    View source on GitHub
                </a>
            </div>

            <div class='link'>
                <BookOpen size={16} />
                <a href={mdnUrl} target='_blank' rel="noreferrer">
                    Search on MDN
                </a>
            </div>
        </section>
    </div>
}
