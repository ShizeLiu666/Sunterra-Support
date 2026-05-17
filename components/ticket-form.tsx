"use client";

import { useState, type FormEvent } from "react";
import {
  Power,
  AlertTriangle,
  WifiOff,
  TrendingDown,
  BatteryWarning,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

interface ProblemType {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const PROBLEM_TYPES: readonly ProblemType[] = [
  {
    id: "system_not_working",
    label: "System not working",
    description: "No power generation at all",
    Icon: Power,
  },
  {
    id: "warning_or_error",
    label: "Warning or error",
    description: "Red light or error code on inverter",
    Icon: AlertTriangle,
  },
  {
    id: "no_data_in_app",
    label: "Cannot see data",
    description: "App showing offline or no data",
    Icon: WifiOff,
  },
  {
    id: "low_output",
    label: "Low output",
    description: "Generation lower than expected",
    Icon: TrendingDown,
  },
  {
    id: "battery_issue",
    label: "Battery issue",
    description: "Battery related problem",
    Icon: BatteryWarning,
  },
  {
    id: "other",
    label: "Other",
    description: "Something else",
    Icon: HelpCircle,
  },
];

const MAX_DESCRIPTION_LENGTH = 500;
const DESCRIPTION_WARNING_THRESHOLD = 450;

function CameraIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h3l2-2h8l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function TicketForm() {
  const [problemType, setProblemType] = useState<string>("");
  const [description, setDescription] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("[ticket-form] submit", { problemType, description });
  };

  const isOverWarning = description.length > DESCRIPTION_WARNING_THRESHOLD;

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-xl border border-gray-200 bg-white p-5 md:p-6"
    >
      <div className="mb-6">
        <span className="mb-2 block text-sm font-medium text-sunterra-dark">
          Problem type
        </span>
        <div role="radiogroup" aria-label="Problem type" className="grid grid-cols-2 gap-3">
          {PROBLEM_TYPES.map((option) => {
            const selected = problemType === option.id;
            const Icon = option.Icon;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setProblemType(option.id)}
                className={
                  selected
                    ? "flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-sunterra-primary bg-sunterra-light px-2 py-3 text-center"
                    : "flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-2 py-3 text-center hover:border-gray-300 active:border-sunterra-primary"
                }
              >
                <Icon
                  size={28}
                  strokeWidth={1.5}
                  className={selected ? "text-sunterra-primary" : "text-gray-600"}
                  aria-hidden="true"
                />
                <span
                  className={
                    selected
                      ? "text-sm font-semibold text-sunterra-dark"
                      : "text-sm font-medium text-sunterra-dark/80"
                  }
                >
                  {option.label}
                </span>
                <span className="text-xs leading-tight text-gray-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-medium text-sunterra-dark"
        >
          Describe the issue
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(event) =>
            setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
          }
          rows={4}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Please tell us what is happening..."
          className="block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-sunterra-dark placeholder:text-gray-400 focus:border-sunterra-primary focus:outline-none"
        />
        <div
          className={
            isOverWarning
              ? "mt-1 text-right text-xs text-red-600"
              : "mt-1 text-right text-xs text-sunterra-dark/50"
          }
        >
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </div>
      </div>

      <div className="mb-6">
        <span className="mb-2 block text-sm font-medium text-sunterra-dark">
          Add photos <span className="font-normal text-sunterra-dark/50">(optional)</span>
        </span>
        <button
          type="button"
          onClick={() => console.log("[ticket-form] upload tapped")}
          className="flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-5 text-gray-500 active:border-sunterra-primary active:text-sunterra-primary"
        >
          <CameraIcon />
          <span className="text-sm">Tap to upload</span>
        </button>
      </div>

      <div className="sticky bottom-0 -mx-5 md:static md:mx-0">
        <div
          aria-hidden="true"
          className="pointer-events-none h-6 bg-gradient-to-b from-transparent to-white md:hidden"
        />
        <div className="bg-white px-5 pb-5 pt-1 md:bg-transparent md:p-0">
          <button
            type="submit"
            className="block h-12 w-full rounded-lg bg-sunterra-primary text-base font-medium text-white hover:bg-[#178362] active:bg-[#136a50]"
          >
            Submit ticket
          </button>
          <p className="mt-2 text-center text-xs text-sunterra-dark/60">
            We&apos;ll respond within 24 hours
          </p>
        </div>
      </div>
    </form>
  );
}
