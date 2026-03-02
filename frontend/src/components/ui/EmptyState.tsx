import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 text-gray-300">{icon}</div>
      <h3 className="mb-1 text-lg font-semibold text-gray-700">{title}</h3>
      <p className="mb-6 text-sm text-gray-500">{description}</p>
      {action}
    </div>
  );
}
