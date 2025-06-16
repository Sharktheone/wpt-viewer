import '#/Style/components/Pages/Settings.scss';
import { Save } from 'lucide-preact';
import { Button } from '../Ui/Button';
import { settings } from '#/State';

export function Settings() {
    function onSubmit(e: SubmitEvent) {
        e.preventDefault();

        const form = new FormData(e.currentTarget as HTMLFormElement);
        settings.showTests.value = form.get('showTests') === 'on';
        window.location.hash = '#/';
    }

    return <form class='Settings' onSubmit={onSubmit}>
        <label>
            <span>Show number of tests</span>
            <input type='checkbox' name='showTests' checked={settings.showTests.peek()} />
        </label>

        <Button color='primary' icon={Save}>
            Save settings
        </Button>
    </form>
}
