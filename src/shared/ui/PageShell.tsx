import type { ReactNode } from "react";

type ShellProps = {
  children: ReactNode;
  className?: string;
};

export function PageShell({ children, className }: ShellProps) {
  return (
    <main
      id="main-content"
      className={["text-primary mb-20", className].filter(Boolean).join(" ")}
    >
      {children}
    </main>
  );
}

export function ContentColumn({ children, className }: ShellProps) {
  return (
    <div
      className={["mx-auto flex max-w-content flex-col px-3 sm:px-0", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}