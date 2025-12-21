import { render } from 'preact';
import { App } from './Components/App.tsx';
import { loadConfig, initializeSource } from './Config';

async function init() {
    await loadConfig();
    await initializeSource();
    render(<App />, document.getElementById('root')!);
}

init();
