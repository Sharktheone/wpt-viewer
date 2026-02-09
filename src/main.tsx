import '#/DataProviders';

import { render } from 'preact';
import { App } from './Components/App.tsx';
import { loadConfig, initializeSource } from './Config';
import { initFromUrlParams } from './Routing';

async function init() {
    await loadConfig();
    // Initialize source from URL params after config is loaded
    initFromUrlParams();
    await initializeSource();
    render(<App />, document.getElementById('root')!);
}

init();
