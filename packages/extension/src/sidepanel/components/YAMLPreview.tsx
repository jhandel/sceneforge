import { useState, useMemo, useEffect, useCallback } from "react";
import { Copy, Download, Check, Edit3, Eye, AlertCircle } from "lucide-react";
import type { DemoDefinition } from "../../shared/types";
import { serializeToYAML, parseFromYAML } from "../../shared/yaml-serializer";

interface YAMLPreviewProps {
  demo: DemoDefinition;
  onDemoChange?: (demo: DemoDefinition) => void;
}

export function YAMLPreview({ demo, onDemoChange }: YAMLPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedYaml, setEditedYaml] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const yamlContent = useMemo(() => {
    try {
      return serializeToYAML(demo);
    } catch (error) {
      return `# Error generating YAML:\n# ${error}`;
    }
  }, [demo]);

  // Sync edited YAML when demo changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditedYaml(yamlContent);
    }
  }, [yamlContent, isEditing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedYaml : yamlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDownload = () => {
    const content = isEditing ? editedYaml : yamlContent;
    const blob = new Blob([content], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${demo.name || "demo"}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      // Switching from edit to preview - try to apply changes
      try {
        const parsed = parseFromYAML(editedYaml);
        setParseError(null);
        if (onDemoChange) {
          onDemoChange(parsed);
        }
        setIsEditing(false);
      } catch (error) {
        setParseError(String(error));
      }
    } else {
      // Switching to edit mode
      setEditedYaml(yamlContent);
      setParseError(null);
      setIsEditing(true);
    }
  };

  const handleYamlChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedYaml(e.target.value);
    // Clear error on edit
    setParseError(null);
  }, []);

  const handleApplyChanges = () => {
    try {
      const parsed = parseFromYAML(editedYaml);
      setParseError(null);
      if (onDemoChange) {
        onDemoChange(parsed);
      }
    } catch (error) {
      setParseError(String(error));
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <span className="text-sm text-gray-500">
          {demo.name || "demo"}.yaml
          {isEditing && <span className="ml-2 text-xs text-amber-600">(editing)</span>}
        </span>
        <div className="flex items-center gap-2">
          {/* Edit/Preview toggle */}
          {onDemoChange && (
            <button
              onClick={handleToggleEdit}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                isEditing
                  ? "bg-primary-100 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              title={isEditing ? "Switch to preview" : "Edit YAML directly"}
            >
              {isEditing ? (
                <>
                  <Eye className="w-3 h-3" />
                  Preview
                </>
              ) : (
                <>
                  <Edit3 className="w-3 h-3" />
                  Edit
                </>
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            Download
          </button>
        </div>
      </div>

      {/* Parse error banner */}
      {parseError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-700 font-medium">YAML Parse Error</p>
            <p className="text-xs text-red-600">{parseError}</p>
          </div>
          <button
            onClick={handleApplyChanges}
            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* YAML Content */}
      <div className="flex-1 overflow-auto bg-gray-900">
        {isEditing ? (
          <div className="h-full flex flex-col">
            <textarea
              value={editedYaml}
              onChange={handleYamlChange}
              className="flex-1 w-full p-4 bg-gray-900 text-gray-100 font-mono text-sm resize-none focus:outline-none"
              spellCheck={false}
              placeholder="# Enter YAML here..."
            />
            <div className="flex items-center justify-end gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700">
              <button
                onClick={() => {
                  setEditedYaml(yamlContent);
                  setParseError(null);
                }}
                className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
              >
                Reset
              </button>
              <button
                onClick={handleApplyChanges}
                className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded"
              >
                Apply Changes
              </button>
            </div>
          </div>
        ) : (
          <pre className="yaml-preview text-gray-100 p-4">{yamlContent}</pre>
        )}
      </div>
    </div>
  );
}
