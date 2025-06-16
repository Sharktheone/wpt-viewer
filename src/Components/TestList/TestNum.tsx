import {ratioToColorClass} from "#/Components/Ui/utils.tsx"

export function TestNum({ passed, total }: { passed: number, total: number }) {
    const ratio = total === 0 ? 0: passed / total;

    return <div class={`TestCompletion TestCompletion-${ratioToColorClass(ratio)}`}>
        <p>
            {passed}  / {total}
        </p>
    </div>
}
