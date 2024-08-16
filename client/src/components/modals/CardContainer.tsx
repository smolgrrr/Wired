import { PropsWithChildren } from "react";

export default function CardContainer({ children }: PropsWithChildren) {
  return (
    <div className="card break-inside-avoid mb-4 h-min">
      <div className="card-body">{children}</div>
    </div>
  );
}
