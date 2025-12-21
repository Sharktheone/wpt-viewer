import '#/Style/components/TestView/MetadataBlock.scss';

import { AppWindow, Calendar, type LucideIcon, Monitor, Tag, TestTube2, Timer } from 'lucide-preact';
import type { DetailsBlockAttributes } from './Component';
import { formatSeconds } from '#/Utils/Number';
import RelativeTime from '@yaireo/relative-time';
import type { ComponentChildren } from 'preact';

interface StatAttributes {
    title: string;
    icon: LucideIcon;
    children: ComponentChildren;
}

function Stat({ title, icon: Icon, children }: StatAttributes) {
    return <div class='stat with-tooltip' data-title={title}>
        <Icon size={16} />
        <span>{children}</span>
    </div>
}

const formatter = new RelativeTime();
export function MetadataBlock({ details }: DetailsBlockAttributes) {
    const run = details.value.run;
    const hasRunInfo = run?.time_start && run.time_start !== String(Date.now()).slice(0, 5);

    let runDate = 'Unknown';
    if (hasRunInfo) {
        try {
            const date = new Date(run.time_start);
            if (!Number.isNaN(date.getTime())) {
                runDate = formatter.from(date);
            }
        } catch {
            // Keep "Unknown"
        }
    }

    const durationNs = details.value.duration || 0;
    const durationSeconds = durationNs / 1_000_000_000;
    const osInfo = (run?.os_name || run?.os_version)
        ? `${run.os_name || 'Unknown'} ${run.os_version || ''}`.trim()
        : 'N/A';
    const browserName = run?.browser_name || 'Local';
    const browserVersion = run?.browser_version || 'N/A';
    const subsuite = details.value.subsuite || 'no subsuite';

    return <div class='Block'>
        <header>
            Run metadata
        </header>

        <section class='MetadataBlock'>
            <div class='column'>
                <Stat icon={Timer} title='Run time'>
                    {formatSeconds(durationSeconds)}
                </Stat>

                <Stat icon={Calendar} title='Run date'>
                    {runDate}
                </Stat>

                <Stat icon={Monitor} title='OS'>
                    {osInfo}
                </Stat>
            </div>

            <div class='column'>
                <Stat icon={AppWindow} title='Browser'>
                    {browserName}
                </Stat>

                <Stat icon={Tag} title='Browser version'>
                    {browserVersion}
                </Stat>

                <Stat icon={TestTube2} title='Subsuite'>
                    {subsuite}
                </Stat>
            </div>
        </section>
    </div>
}
