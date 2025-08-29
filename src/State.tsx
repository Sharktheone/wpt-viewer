import { effect, signal } from '@preact/signals';

function getShowTests() {
    const showTests = localStorage.getItem('showTests');
    return showTests === 'true' || showTests === null;
}

export const settings = {
    showTests: signal<boolean>(getShowTests()),
    source: signal<string>('HEAD~0'),
};

effect(() => {
    localStorage.setItem('showTests', settings.showTests.value.toString());
});
