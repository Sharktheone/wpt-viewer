import '#/Style/components/TestList/TestCompletion.scss';

import { ratioToColorClass } from '../Ui/utils';

export function TestCompletion({ passed, total }: { passed: number, total: number }) {
    const ratio = total === 0 ? 0: passed / total;

    return <div class={`TestCompletion TestCompletion-${ratioToColorClass(ratio)} with-tooltip`} data-title={`${passed} of ${total} tests passed`}>
        {Math.floor(ratio * 100)}%
    </div>
}
