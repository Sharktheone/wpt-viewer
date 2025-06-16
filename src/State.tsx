import { effect, signal } from '@preact/signals';
import { Browsers, type FyiBrowser } from './Wpt/Fyi';

function getShowTests() {
    const showTests = localStorage.getItem('showTests');
    return showTests === 'true' || showTests === null;
}

export const settings = {
    showTests: signal<boolean>(getShowTests()),
};

effect(() => {
    localStorage.setItem('showTests', settings.showTests.value.toString());
});
