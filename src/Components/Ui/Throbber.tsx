import '#/Style/ui/Throbber.scss';

import { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { loadingProgress } from '#/State';

interface SuspenseAttributes {
    until: any;
    loading?: Signal<boolean>;
    children?: ComponentChildren;
}

export function Suspense({ until, loading, children }: SuspenseAttributes) {
    if (until instanceof Signal) {
        until = until.value;
    }

    if (!until) {
        return <Throbber />
    }

    if (loading instanceof Signal && loading.value) {
        return <Throbber />
    }

    return children;
}

export function Throbber() {
    const progress = loadingProgress.value;
    
    return <div class='Throbber' aria-hidden>
        <div class='dots'>
            <div class='dot'/>
            <div class='dot'/>
            <div class='dot'/>
        </div>
        {progress && (
            <div class='progress-info'>
                <div class='progress-bar'>
                    <div 
                        class='progress-fill' 
                        style={{ width: `${Math.round((progress.fetched / progress.total) * 100)}%` }}
                    />
                </div>
                <span class='progress-text'>
                    {progress.fetched} / {progress.total} directories
                </span>
            </div>
        )}
    </div>
}
