// Utility functions for formatting and copying test differences to clipboard

export interface DiffTest {
    path: string;
}

export interface DiffGroup {
    from: string;
    to: string;
    tests: DiffTest[];
}

/**
 * Format a single transition group for clipboard
 * Example output:
 * FAIL -> PASS
 * - harness/assert-false.js
 * - harness/assert-true.js
 */
export function formatTransitionGroup(group: DiffGroup): string {
    const lines = [`${group.from} -> ${group.to}`];
    for (const test of group.tests) {
        lines.push(`- ${test.path}`);
    }
    return lines.join('\n');
}

/**
 * Format all transition groups for clipboard
 * Example output:
 * FAIL -> PASS
 * - harness/assert-false.js
 * - harness/assert-true.js
 * 
 * PASS -> FAIL
 * - built-ins/Array/from.js
 */
export function formatAllTransitionGroups(groups: DiffGroup[]): string {
    return groups.map(formatTransitionGroup).join('\n\n');
}

/**
 * Copy text to clipboard and return success status
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        return false;
    }
}

/**
 * Copy a single transition group to clipboard
 */
export async function copyTransitionGroup(group: DiffGroup): Promise<boolean> {
    const text = formatTransitionGroup(group);
    return copyToClipboard(text);
}

/**
 * Copy all transition groups to clipboard
 */
export async function copyAllTransitionGroups(groups: DiffGroup[]): Promise<boolean> {
    const text = formatAllTransitionGroups(groups);
    return copyToClipboard(text);
}
