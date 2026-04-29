import '#/Style/components/TestList/DirectoryRow.scss';

import { type EntryTree, TreeMeta, TreeMetaSubtest } from '#/Wpt/Tree';
import { Folder } from 'lucide-preact';
import type { RowAttributes } from './Component';
import { TestCompletion } from './TestCompletion';
import { useComputed } from '@preact/signals';
import { TestNum } from "#/Components/TestList/TestNum.tsx"
import { settings } from "#/State.tsx"
import { InlineStatusCounter } from '#/Components/InlineStatusCounter'

export function DirectoryRow({ name, object, path, activeStatuses }: RowAttributes) {
    const subtree = object as EntryTree;
    const href = useComputed(() => `#/v/${path.value.join('/')}/${name}`);

    function onClick() {
        window.scrollTo(0, 0);
    }

    const [passed, total] = subtree[TreeMetaSubtest];

    return <tr class='row DirectoryRow' onClick={onClick}>
        <td>
            <a class='test-name unstyled' href={href.value}>
                <div class='icon' aria-hidden>
                    <Folder size={16} />
                </div>

                {name}
            </a>
        </td>

        {activeStatuses.value.length > 0 &&
            <td class="status-count">
                {activeStatuses.value.map(status =>
                    <InlineStatusCounter key={status} status={status} count={subtree[TreeMeta][status]} />
                )}
            </td>
        }

        <td>
            <TestCompletion passed={passed} total={total} />
        </td>

        {settings.showTests.peek() &&
            <td>
                <TestNum passed={passed} total={total} />
            </td>
        }
    </tr>
}
