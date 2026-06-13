import { PropsWithChildren } from "react";

export function CardContainer({ children }: PropsWithChildren) {
  return (
    <div className="card break-inside-avoid mb-3 h-min">
      <div className="card-body">{children}</div>
    </div>
  );
}