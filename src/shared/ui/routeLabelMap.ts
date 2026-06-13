const ROUTE_LABEL_MAP: Record<string, string> = {
  "/": "",
  "/notifications": "activity",
  "/settings": "settings",
  "/thread": "thread",
};

export function getDisplaySegment(pathname: string): string {
  if (pathname.startsWith("/thread/")) {
    return ROUTE_LABEL_MAP["/thread"];
  }

  return ROUTE_LABEL_MAP[pathname] ?? pathname.slice(1);
}

export function getPathDisplay(pathname: string): string {
  const segment = getDisplaySegment(pathname);
  return segment ? `/${segment}` : "/";
}