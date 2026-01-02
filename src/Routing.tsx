import { effect, signal, batch } from '@preact/signals';
import { 
    activeSourceKey, 
    selectedEngine, 
    selectedRef, 
    setActiveSource, 
    setSelectedEngine, 
    setSelectedRef,
    appConfig,
} from '#/Config';

type Page =
    | 'settings'
    | 'wpt'
    | 'not-found'

export const page = signal<Page>(getPage());

function getPage(): Page {
    const hash = window.location.hash.replace('#', '');

    if (hash === '/settings' || hash.startsWith('/settings?')) {
        return 'settings';
    }

    if (!hash || hash === '/' || hash.startsWith('/v/') || hash.startsWith('/?')) {
        return 'wpt';
    }

    return 'not-found';
}

function getPath() {
    const hash = window.location.hash;
    if (page.value !== 'wpt') {
        return [];
    }

    if (hash === '#/' || hash.startsWith('#/?')) {
        return [];
    }

    // Remove query string from path parsing
    const hashPath = hash.split('?')[0];
    return hashPath.replace('#/v/', '').split('/').filter(Boolean);
}

/**
 * Parse URL search params from the hash
 * Format: #/v/path?source=xxx&engine=yyy&ref=zzz
 */
function getSearchParams(): URLSearchParams {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) {
        return new URLSearchParams();
    }
    return new URLSearchParams(hash.slice(queryIndex + 1));
}

/**
 * Initialize source state from URL params.
 * Should be called after config is loaded.
 */
export function initFromUrlParams() {
    const params = getSearchParams();
    const source = params.get('source');
    const engine = params.get('engine');
    const ref = params.get('ref');
    
    // Only set if valid
    if (source && appConfig.value.sources[source]) {
        // Use batch to prevent multiple tree refreshes
        batch(() => {
            setActiveSource(source);
            
            if (engine && source === 'test262fyi') {
                setSelectedEngine(engine);
            }
            if (ref && source === 'boa') {
                setSelectedRef(ref);
            }
        });
    } else if (source) {
        // Source specified but not found - could be engine/ref for current source
        const currentSource = activeSourceKey.value;
        batch(() => {
            if (engine && currentSource === 'test262fyi') {
                setSelectedEngine(engine);
            }
            if (ref && currentSource === 'boa') {
                setSelectedRef(ref);
            }
        });
    }
}

/**
 * Build the hash URL with search params
 */
function buildHashUrl(path: string[], includeParams = true): string {
    const pathPart = path.length > 0 ? `/v/${path.join('/')}` : '/';
    
    if (!includeParams) {
        return `#${pathPart}`;
    }
    
    const params = new URLSearchParams();
    const source = activeSourceKey.value;
    
    // Always include source if not default
    if (source && source !== 'github') {
        params.set('source', source);
    }
    
    // Include engine for test262fyi
    if (source === 'test262fyi' && selectedEngine.value) {
        params.set('engine', selectedEngine.value);
    }
    
    // Include ref for boa (only if not default)
    if (source === 'boa' && selectedRef.value && selectedRef.value !== 'heads/main') {
        params.set('ref', selectedRef.value);
    }
    
    const queryString = params.toString();
    return queryString ? `#${pathPart}?${queryString}` : `#${pathPart}`;
}

/**
 * Update URL without triggering hashchange event handling
 */
let isUpdatingUrl = false;
function updateUrl() {
    if (page.value !== 'wpt') {
        return;
    }
    
    isUpdatingUrl = true;
    const newHash = buildHashUrl(globalPath.value);
    if (window.location.hash !== newHash) {
        window.location.hash = newHash;
    }
    isUpdatingUrl = false;
}

export const globalPath = signal<string[]>(getPath());

window.addEventListener('hashchange', () => {
    if (isUpdatingUrl) return;
    
    page.value = getPage();

    if (page.value === 'wpt') {
        const newPath = getPath();
        if (globalPath.value.join('/') !== newPath.join('/')) {
            globalPath.value = newPath;
        }
        
        // Re-apply URL params on hash change (e.g., user navigates via shared link)
        initFromUrlParams();
    }
});

// Update URL when path changes
effect(() => {
    if (page.value !== 'wpt') {
        return;
    }
    
    // Access signals to create dependency
    void globalPath.value;
    void activeSourceKey.value;
    void selectedEngine.value;
    void selectedRef.value;
    
    updateUrl();
});

effect(() => {
    switch (page.value) {
    case 'wpt':
        document.title = `view: /${globalPath.value.join('/')}`;
        break;

    case 'not-found':
        document.title = 'not found';
        break;

    case 'settings':
        document.title = 'settings';
        break;
    }
})
