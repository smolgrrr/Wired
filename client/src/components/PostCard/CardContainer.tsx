import { PropsWithChildren } from "react";

export default function CardContainer({ children }: PropsWithChildren) {
  return (
    <div className="card break-inside-avoid mb-4 bg-neutral-900 border border-transparent hover:border-neutral-800">
      <div className="card-body">{children}</div>
    </div>
  );
}
