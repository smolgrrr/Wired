import { PropsWithChildren } from "react";

export default function CardContainer({ children }: PropsWithChildren) {
  return (
    <div className="card break-inside-avoid mb-4 bg-gradient-to-r from-black to-neutral-900 h-min">
      <div className="card-body pb-2">{children}</div>
    </div>
  );
}
