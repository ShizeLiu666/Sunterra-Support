"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check } from "lucide-react";
import type { InstallationData } from "@/types/installation";

const FIELD_MAX_LENGTH = {
  name: 50,
  email: 50,
  address: 50,
} as const;

// Australian states/territories (abbreviations) — written to
// Customer_Care__c.Installation_State__c (Text(10), confirmed to exist).
const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

interface InstallationInfoProps {
  data: InstallationData;
  /** Called when user finishes editing a field (onBlur) */
  onChange?: (data: InstallationData) => void;
  /** Submit-time inline errors for the required contact fields. */
  errors?: { address?: string | null; state?: string | null };
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
  errors,
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
          maxLength={FIELD_MAX_LENGTH.name}
          onSave={(v) => onChange?.({ ...data, name: v })}
        />
        <EditableRow
          label="Email"
          value={data.email}
          placeholder="Add your email"
          type="email"
          maxLength={FIELD_MAX_LENGTH.email}
          onSave={(v) => onChange?.({ ...data, email: v })}
        />
        <EditableRow
          label="Address"
          value={data.address}
          placeholder="Add your address"
          multiline
          required
          fieldId="contact-address"
          error={errors?.address}
          maxLength={FIELD_MAX_LENGTH.address}
          onSave={(v) => onChange?.({ ...data, address: v })}
        />
        <StateSelectRow
          value={data.state}
          error={errors?.state}
          onChange={(v) => onChange?.({ ...data, state: v })}
        />

        {data.inverterModel && (
          <ReadOnlyRow label="Inverter" value={data.inverterModel} />
        )}
        <SerialNumberRow sns={data.sns} />
      </div>
    </section>
  );
}

interface SerialNumberRowProps {
  sns: string[];
}

/**
 * Locked row for the inverter/battery serial number(s).
 *
 * - 1 SN  → label "Serial number", single value on the right (legacy look)
 * - n>1  → label "Serial numbers", each SN on its own line, right-aligned
 *
 * No selection / no editing — this is purely informational. Customers can't
 * change the SN list; it comes from ShinePhone via the signed URL.
 *
 * Defensive normalization: even though verifyToken (lib/token.ts) is supposed
 * to hand us a parsed string[], we re-split on commas here so the UI also
 * renders correctly when an upstream caller (older deploy, dev fallback,
 * future regression) passes a single comma-joined element such as
 * `["SN001,SN002,SN003"]`. Cheap and keeps the customer-facing view honest.
 */
function SerialNumberRow({ sns }: SerialNumberRowProps) {
  const normalized = sns
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (normalized.length === 0) {
    return <LockedRow label="Serial number" value="—" />;
  }

  if (normalized.length === 1) {
    return <LockedRow label="Serial number" value={normalized[0]} />;
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
      <span className="text-sm text-sunterra-dark/60 shrink-0">
        Serial numbers
      </span>
      <ul className="text-sm font-mono text-sunterra-dark text-right space-y-0.5 break-words">
        {normalized.map((sn, idx) => (
          <li key={`${sn}-${idx}`}>{sn}</li>
        ))}
      </ul>
    </div>
  );
}

interface EditableRowProps {
  label: string;
  value: string | undefined;
  placeholder: string;
  type?: "text" | "email";
  maxLength?: number;
  multiline?: boolean;
  required?: boolean;
  error?: string | null;
  fieldId?: string;
  onSave: (value: string) => void;
}

function EditableRow({
  label,
  value,
  placeholder,
  type = "text",
  maxLength,
  multiline = false,
  required = false,
  error,
  fieldId,
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
          {required && (
            <span className="text-red-500" aria-hidden="true"> *</span>
          )}
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
                maxLength={maxLength}
                rows={2}
                className="min-w-0 flex-1 text-sm text-sunterra-dark bg-white border border-sunterra-primary/30 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sunterra-primary/40 resize-none break-words [overflow-wrap:anywhere]"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                maxLength={maxLength}
                className="min-w-0 flex-1 text-sm text-sunterra-dark bg-white border border-sunterra-primary/30 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sunterra-primary/40 text-right"
              />
            )
          ) : (
            <button
              type="button"
              id={fieldId}
              onClick={() => setIsEditing(true)}
              className="group flex items-start justify-end gap-1.5 text-right min-w-0 flex-1 hover:opacity-80 transition-opacity"
              aria-label={`Edit ${label}`}
            >
              <span
                className={`min-w-0 max-w-full text-sm break-words [overflow-wrap:anywhere] ${
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
      {error && (
        <p role="alert" className="mt-1.5 text-right text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

interface StateSelectRowProps {
  value: string | undefined;
  error?: string | null;
  onChange: (value: string) => void;
}

/**
 * Required State/Territory dropdown. Native <select> (zero deps, reliable on
 * old WebViews). Writes the selected AU abbreviation up to
 * installationData.state, which TicketForm forwards as installationState →
 * Customer_Care__c.Installation_State__c.
 */
function StateSelectRow({ value, error, onChange }: StateSelectRowProps) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="contact-state"
          className="text-sm text-sunterra-dark/60 shrink-0"
        >
          State
          <span className="text-red-500" aria-hidden="true"> *</span>
        </label>
        <select
          id="contact-state"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 max-w-[60%] text-sm text-sunterra-dark bg-white border border-sunterra-primary/30 rounded-md px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-sunterra-primary/40"
        >
          <option value="" disabled>
            Select state
          </option>
          {AU_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-right text-xs text-red-500">
          {error}
        </p>
      )}
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
