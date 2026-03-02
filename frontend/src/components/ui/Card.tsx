import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow ${
        onClick ? "cursor-pointer active:shadow-md" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
