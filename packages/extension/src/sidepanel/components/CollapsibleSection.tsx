import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: number | string;
  actions?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  actions,
  contentClassName = "space-y-3",
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();
  const contentClasses = ["px-4 pb-4 pt-1", contentClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ChevronRight
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
          />
          <span className="truncate">{title}</span>
          {badge !== undefined && badge !== null && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {badge}
            </span>
          )}
        </button>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {isOpen ? (
        <div id={contentId} className={contentClasses}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
