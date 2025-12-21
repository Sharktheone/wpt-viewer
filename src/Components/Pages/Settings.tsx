import '#/Style/components/Pages/Settings.scss';
import { Save } from 'lucide-preact';
import { Button } from '../Ui/Button';
import { Select } from '../Ui/Select';
import { settings, profiles, appConfig } from '#/State';
import { useComputed, useSignal } from '@preact/signals';

export function Settings() {
    const localUrl = useSignal(
        localStorage.getItem('localServerUrl') || 'http://localhost:1215'
    );
    const defaultProfile = useSignal(
        localStorage.getItem('defaultProfile') || appConfig.value?.defaultProfile || ''
    );

    const profileOptions = useComputed(() => {
        const profilesData = profiles.value;
        if (!profilesData?.profiles) return [];

        return Object.keys(profilesData.profiles).map(name => (
            <option value={name} key={name}>{name}</option>
        ));
    });

    function onSubmit(e: SubmitEvent) {
        e.preventDefault();

        const form = new FormData(e.currentTarget as HTMLFormElement);
        settings.showTests.value = form.get('showTests') === 'on';

        const url = form.get('localUrl') as string;
        if (url) {
            localStorage.setItem('localServerUrl', url);
            localUrl.value = url;
        }

        const profile = form.get('defaultProfile') as string;
        localStorage.setItem('defaultProfile', profile);
        defaultProfile.value = profile;

        if (appConfig.value) {
            appConfig.value = {
                ...appConfig.value,
                defaultProfile: profile,
                sources: {
                    ...appConfig.value.sources,
                    local: {
                        ...appConfig.value.sources.local,
                        baseUrl: url || appConfig.value.sources.local?.baseUrl || 'http://localhost:1215',
                    },
                },
            };
        }

        window.location.hash = '#/';
    }

    return <form class='Settings' onSubmit={onSubmit}>
        <fieldset>
            <legend>Display</legend>

            <label>
                <span>Show number of tests</span>
                <input type='checkbox' name='showTests' checked={settings.showTests.peek()} />
            </label>
        </fieldset>

        <fieldset>
            <legend>Local Server</legend>

            <label>
                <span>Local Server URL</span>
                <input
                    type='text'
                    name='localUrl'
                    value={localUrl.value}
                    placeholder='http://localhost:1215'
                    onInput={(e) => { localUrl.value = (e.target as HTMLInputElement).value; }}
                />
            </label>

            <label>
                <span>Default Profile</span>
                <Select
                    value={defaultProfile.value}
                    onInput={(e) => { defaultProfile.value = (e.target as HTMLSelectElement).value; }}
                >
                    <option value="">Default</option>
                    {profileOptions}
                </Select>
                <input type="hidden" name="defaultProfile" value={defaultProfile.value} />
            </label>
        </fieldset>

        <Button color='primary' icon={Save}>
            Save settings
        </Button>
    </form>
}
