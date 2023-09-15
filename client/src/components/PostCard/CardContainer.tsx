import { PropsWithChildren } from 'react';

export default function CardContainer({ children }: PropsWithChildren) {
  return (
    <div className="card bg-gradient-to-r from-black to-neutral-900 shadow-lg shadow-black">
      <div className="card-body p-4">{children}</div>
    </div>
  );
}