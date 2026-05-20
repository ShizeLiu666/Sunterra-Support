"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check } from "lucide-react";
import type { InstallationData } from "@/types/installation";

interface InstallationInfoProps {
  data: InstallationData;
  /** Called when user finishes editing a field (onBlur) */
  onChange?: (data: InstallationData) => void;
}

/**
 * Installation info card with click-to-edit fields.
 *
 * - sn: locked (read-only, shows Verified pill)
 * - name / email / address: click to edit, save on blur
 * - inverterModel: read-only but displayed
 */
export default function InstallationInfo({
  data,
  onChange,
}: InstallationInfoProps) {
  return (
    <section className="bg-sunterra-light/40 rounded-xl p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-sunterra-dark">
          Your installation
        </h2>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sunterra-primary text-white text-xs font-medium rounded-full">
          <Check className="w-3 h-3" strokeWidth={3} />
          <span>Verified</span>
        </div>
      </div>

      <div className="divide-y divide-sunterra-primary/15">
        <EditableRow
          label="Name"
          value={data.name}
          placeholder="Add your name"
          onSave={(v) => onChange?.({ ...data, name: v })}
        />
        <EditableRow
          label="Email"
          value={data.email}
          placeholder="Add your email"
          type="email"
          onSave={(v) => onChange?.({ ...data, email: v })}
        />
        <EditableRow
          label="Address"
          value={data.address}
          placeholder="Add your address"
          multiline
          onSave={(v) => onChange?.({ ...data, address: v })}
        />

        {data.inverterModel && (
          <ReadOnlyRow label="Inverter" value={data.inverterModel} />
        )}
        <LockedRow label="Serial number" value={data.sn} />
      </div>
    </section>
  );
}

interface EditableRowProps {
  label: string;
  value: string | undefined;
  placeholder: string;
  type?: "text" | "email";
  multiline?: boolean;
  onSave: (value: string) => void;
}

function EditableRow({
  label,
  value,
  placeholder,
  type = "text",
  multiline = false,
  onSave,
}: EditableRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Keep draft in sync if parent updates value (e.g., from URL re-parse).
  // Intentional setState-in-effect: we need to react to async prop changes
  // from outside this component. See React docs "Adjusting some state when
  // a prop changes" — refactor to derive-during-render is possible but
  // deferred to a future cleanup pass.
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value ?? "");
    }
  }, [value, isEditing]);

  // Focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  function handleSave() {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (trimmed !== (value ?? "")) {
      onSave(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value ?? "");
      setIsEditing(false);
    }
  }

  const hasValue = !!(value && value.trim());

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <label className="text-sm text-sunterra-dark/60 shrink-0 pt-0.5">
          {label}
        </label>

        <div className="flex-1 min-w-0 flex items-start justify-end gap-2">
          {isEditing ? (
            multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                rows={2}
                className="flex-1 text-sm text-sunterra-dark bg-white border border-sunterra-primary/30 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sunterra-primary/40 resize-none"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="flex-1 text-sm text-sunterra-dark bg-white border border-sunterra-primary/30 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sunterra-primary/40 text-right"
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="group flex items-start justify-end gap-1.5 text-right min-w-0 flex-1 hover:opacity-80 transition-opacity"
              aria-label={`Edit ${label}`}
            >
              <span
                className={`text-sm break-words ${
                  hasValue
                    ? "text-sunterra-dark"
                    : "text-sunterra-dark/40 italic"
                }`}
              >
                {hasValue ? value : placeholder}
              </span>
              <Pencil
                className="w-3.5 h-3.5 text-sunterra-dark/30 group-hover:text-sunterra-dark/60 transition-colors shrink-0 mt-0.5"
                strokeWidth={2}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReadOnlyRowProps {
  label: string;
  value: string;
}

function ReadOnlyRow({ label, value }: ReadOnlyRowProps) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
      <span className="text-sm text-sunterra-dark/60">{label}</span>
      <span className="text-sm text-sunterra-dark/70 text-right break-words">
        {value}
      </span>
    </div>
  );
}

interface LockedRowProps {
  label: string;
  value: string;
}

function LockedRow({ label, value }: LockedRowProps) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
      <span className="text-sm text-sunterra-dark/60">{label}</span>
      <span className="text-sm font-mono text-sunterra-dark text-right break-words">
        {value}
      </span>
    </div>
  );
}
