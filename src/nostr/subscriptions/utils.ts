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