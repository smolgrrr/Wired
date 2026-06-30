import type { SubHandle } from "../types";

export function emptySubHandle(id: string): SubHandle {
  return { id, close: () => {} };
}

export function composeSubHandle(
  id: string,
  children: SubHandle[],
  onClose?: () => void,
): SubHandle {
  return {
    id,
    close: () => {
      onClose?.();
      children.forEach((child) => child.close());
    },
  };
}

export function createSubHandleOwner(id: string, onClose?: () => void) {
  const children: SubHandle[] = [];
  let closed = false;

  const close = () => {
    if (closed) return;

    closed = true;
    onClose?.();
    children.forEach((child) => child.close());
  };

  return {
    add(child: SubHandle) {
      if (closed) {
        child.close();
        return;
      }

      children.push(child);
    },
    handle(): SubHandle {
      return { id, close };
    },
  };
}
