// Check if a value is a tree directory node (not a leaf entry like PartialEntry)
function isTreeNode(value: unknown): boolean {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    // PartialEntry has a 'status' property and 'path' property
    // Tree directory nodes are plain objects created with Object.create(null)
    // We check if it has the constructor property pointing to Object or has no prototype
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

export function followDeep(obj: object, path: string[]) {
    let head = obj;

    for (const level of path) {
        if (!(level in head)) {
            return;
        }

        // @ts-ignore
        head = head[level];
    }

    return head;
}

export function setDeep(obj: object, path: string[], value: any) {
    let head = obj;
    const ref = path.slice(0, -1);
    for (let i = 0, len = ref.length; i < len; i++) {
        const level = ref[i];
        if (level in head) {
            // @ts-ignore
            const existing = head[level];
            if (isTreeNode(existing)) {
                // It's a directory node, continue traversing
                head = existing;
            } else {
                // Existing value is a leaf entry (like PartialEntry)
                // This means there's a conflict - a file path that's also used as a directory
                // Replace with a new directory node (the leaf entry will be lost)
                // @ts-ignore
                const newNode = Object.create(null);
                // @ts-ignore
                head[level] = newNode;
                head = newNode;
            }
            continue;
        }

        // @ts-ignore
        head = head[level] = Object.create(null);
    }

    const lastKey = path.at(-1);
    // @ts-ignore
    const existingValue = head[lastKey];
    if (isTreeNode(existingValue)) {
        // There's already a directory at this location - this is a conflict
        // where a path is both a file and a directory prefix
        // Skip setting this value to preserve the directory structure
        return value;
    }

    // @ts-ignore
    head[lastKey] = value;

    return value;
};
