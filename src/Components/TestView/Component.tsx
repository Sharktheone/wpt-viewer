import '#/Style/components/TestView/Component.scss';
import '#/Style/components/TestView/Block.scss';

import type { PartialEntry } from '#/Wpt/Tree';
import { type Signal, useSignal, useSignalEffect } from '@preact/signals';
import { StatusBlock } from './StatusBlock';
import { MetadataBlock } from './MetadataBlock';
import type { FullEntry } from '#/Wpt/Fyi';
import { Suspense } from '../Ui/Throbber';
import { LinkBlock } from './LinkBlock';
import { MessageBlock } from './MessageBlock';
import { SubtestsBlock } from './SubtestsBlock';

export interface TestBlockAttributes {
    test: Signal<PartialEntry>;
}

export interface DetailsBlockAttributes {
    details: Signal<FullEntry>;
}

export type BlockAttributes = TestBlockAttributes&DetailsBlockAttributes;

export function TestView({ test }: { test: Signal<PartialEntry> }) {
    const details = useSignal<FullEntry|null>(null);

    useSignalEffect(() => {
        const currentTest = test.value;
        details.value = null;
        currentTest.getDetails().then(d => {
            details.value = d;
        });
    });

    return <div class='TestView'>
        <Suspense until={details}>
            <TestViewContent test={test} details={details as Signal<FullEntry>} />
        </Suspense>
    </div>
}

function TestViewContent({ test, details }: BlockAttributes) {
    const hasSubtests = details.value?.subtests && details.value.subtests.length > 0;

    return <>
        <div class='block-row'>
            <StatusBlock test={test} />
            <MetadataBlock details={details} />
            <LinkBlock test={test} />
        </div>

        <MessageBlock test={test} details={details} />
        {hasSubtests && <SubtestsBlock details={details} />}
    </>
}
