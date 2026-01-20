import type { DemoDefinition } from "../../shared/types";

interface DemoMetadataProps {
  demo: DemoDefinition;
  onChange: (updates: Partial<DemoDefinition>) => void;
}

export function DemoMetadata({ demo, onChange }: DemoMetadataProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h2 className="text-sm font-medium text-gray-700">Demo Info</h2>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name (slug)</label>
          <input
            type="text"
            value={demo.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="my-demo-name"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title</label>
          <input
            type="text"
            value={demo.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="My Demo Title"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Description (optional)
          </label>
          <textarea
            value={demo.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Optional description of the demo..."
            rows={2}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
        </div>
      </div>
    </div>
  );
}
