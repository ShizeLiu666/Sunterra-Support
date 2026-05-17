"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Power,
  AlertTriangle,
  WifiOff,
  TrendingDown,
  BatteryWarning,
  HelpCircle,
  X,
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
    description: "System completely offline",
    Icon: Power,
  },
  {
    id: "warning_or_error",
    label: "Warning or error",
    description: "Error code or alarm",
    Icon: AlertTriangle,
  },
  {
    id: "no_data_in_app",
    label: "Cannot see data",
    description: "App offline or no data",
    Icon: WifiOff,
  },
  {
    id: "low_output",
    label: "Low output",
    description: "Output below expected",
    Icon: TrendingDown,
  },
  {
    id: "battery_issue",
    label: "Battery issue",
    description: "Battery not working",
    Icon: BatteryWarning,
  },
  {
    id: "other",
    label: "Other",
    description: "Other issues",
    Icon: HelpCircle,
  },
];

const MAX_DESCRIPTION_LENGTH = 500;
const DESCRIPTION_WARN_AT = 450;
const DESCRIPTION_DANGER_AT = 490;

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_SIZE_LABEL = "5MB";

const CARD_BASE =
  "flex min-h-[120px] select-none flex-col items-center justify-center gap-2 rounded-xl border-2 px-2 py-3 text-center transition-colors duration-150 [-webkit-tap-highlight-color:transparent]";
const CARD_SELECTED = "border-sunterra-primary bg-sunterra-light";
const CARD_UNSELECTED = "border-gray-200 bg-white hover:border-gray-300";

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

function counterColorClass(length: number): string {
  if (length >= DESCRIPTION_DANGER_AT) return "text-red-600";
  if (length >= DESCRIPTION_WARN_AT) return "text-orange-500";
  return "text-sunterra-dark/50";
}

export function TicketForm() {
  const [problemType, setProblemType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview URLs are created during render so the first paint already has them;
  // cleanup happens once the photos list changes (or on unmount).
  const previewUrls = useMemo(
    () => photos.map((file) => URL.createObjectURL(file)),
    [photos]
  );
  useEffect(() => {
    return () => {
      previewUrls.forEach(URL.revokeObjectURL);
    };
  }, [previewUrls]);

  const atMaxPhotos = photos.length >= MAX_PHOTOS;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    setPhotoError(null);

    const oversized = incoming.find((file) => file.size > MAX_PHOTO_SIZE_BYTES);
    if (oversized) {
      setPhotoError(`File too large: ${oversized.name} (max ${MAX_PHOTO_SIZE_LABEL})`);
      event.target.value = "";
      return;
    }

    const remaining = MAX_PHOTOS - photos.length;
    if (incoming.length > remaining) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos`);
      if (remaining > 0) {
        setPhotos([...photos, ...incoming.slice(0, remaining)]);
      }
      event.target.value = "";
      return;
    }

    setPhotos([...photos, ...incoming]);
    event.target.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
    setPhotoError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("[ticket-form] submit", {
      problemType,
      description,
      photoCount: photos.length,
    });
  };

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
                className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_UNSELECTED}`}
              >
                <Icon
                  size={28}
                  strokeWidth={1.5}
                  className={`transition-colors duration-150 ${
                    selected ? "text-sunterra-primary" : "text-gray-600"
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm transition-colors duration-150 ${
                    selected
                      ? "font-semibold text-sunterra-dark"
                      : "font-medium text-sunterra-dark/80"
                  }`}
                >
                  {option.label}
                </span>
                <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-tight text-gray-500">
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
          inputMode="text"
          placeholder="Please tell us what is happening..."
          className="block max-h-[150px] w-full resize-none overflow-y-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-sunterra-dark placeholder:text-gray-400 focus:border-sunterra-primary focus:outline-none"
        />
        <div className={`mt-1 text-right text-xs ${counterColorClass(description.length)}`}>
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </div>
      </div>

      <div className="mb-6">
        <span className="mb-2 block text-sm font-medium text-sunterra-dark">
          Add photos <span className="font-normal text-sunterra-dark/50">(optional)</span>
        </span>

        {photos.length > 0 && (
          <ul
            aria-label="Uploaded photos"
            className="mb-3 flex flex-wrap gap-2"
          >
            {photos.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrls[index]}
                  alt={`Uploaded photo ${index + 1}`}
                  className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-sunterra-dark text-white shadow-sm [-webkit-tap-highlight-color:transparent]"
                >
                  <X size={14} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label
          className={`flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white px-4 py-5 text-gray-500 transition-colors duration-150 [-webkit-tap-highlight-color:transparent] ${
            atMaxPhotos
              ? "cursor-not-allowed border-gray-200 text-gray-400"
              : "cursor-pointer border-gray-300 active:border-sunterra-primary active:text-sunterra-primary"
          }`}
        >
          <CameraIcon />
          <span className="text-sm">
            {atMaxPhotos ? `Maximum ${MAX_PHOTOS} photos reached` : "Tap to upload"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={atMaxPhotos}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {photoError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {photoError}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 md:static md:mx-0">
        <div
          aria-hidden="true"
          className="pointer-events-none h-6 bg-gradient-to-b from-transparent to-white md:hidden"
        />
        <div className="bg-white px-5 pb-5 pt-1 md:bg-transparent md:p-0">
          <button
            type="submit"
            className="block h-12 w-full rounded-lg bg-sunterra-primary text-base font-medium text-white transition-colors duration-150 hover:bg-[#178362] active:bg-[#136a50]"
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
