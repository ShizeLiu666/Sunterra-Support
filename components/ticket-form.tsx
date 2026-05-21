"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  WifiOff,
  TrendingDown,
  BatteryWarning,
  Wrench,
  HelpCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import type { InstallationData, UrlParams } from "@/types/installation";

interface TicketFormProps {
  installationData: InstallationData;
  token: UrlParams | null;
}

interface SubmitResponseBody {
  success?: boolean;
  caseNumber?: string;
  matched?: boolean;
  photoWarning?: number; // count of photos that failed to attach (0 = no warning)
  error?: string;
}

interface ProblemType {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const PROBLEM_TYPES: readonly ProblemType[] = [
  {
    id: "battery_issue",
    label: "Battery Issue",
    description: "Battery not working",
    Icon: BatteryWarning,
  },
  {
    id: "inverter_issue",
    label: "Inverter Issue",
    description: "Inverter problem or error",
    Icon: AlertTriangle,
  },
  {
    id: "app_monitoring",
    label: "App Monitoring",
    description: "Cannot see data in app",
    Icon: WifiOff,
  },
  {
    id: "system_performance",
    label: "System Performance",
    description: "Low output or high bill",
    Icon: TrendingDown,
  },
  {
    id: "installation_quality",
    label: "Installation Quality",
    description: "Installation issue",
    Icon: Wrench,
  },
  {
    id: "other",
    label: "Other Issue",
    description: "Other issues",
    Icon: HelpCircle,
  },
];

const MAX_DESCRIPTION_LENGTH = 500;
const DESCRIPTION_WARN_AT = 450;
const DESCRIPTION_DANGER_AT = 490;

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024; // selection-time limit;
// compression brings it under 0.8MB later
const MAX_PHOTO_SIZE_LABEL = "15MB";

// Compression options for browser-image-compression (Phase 2G-2)
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
  initialQuality: 0.85,
};

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

/**
 * Reads a File and returns its base64-encoded content (WITHOUT the
 * "data:...;base64," prefix). Returns null on failure.
 */
async function fileToBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve(null);
        return;
      }
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        resolve(null);
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses a single image File. Returns the compressed File on success,
 * or null on failure (so caller can skip and continue).
 * Logs before/after sizes for dev visibility.
 */
async function compressPhoto(file: File): Promise<File | null> {
  const beforeKB = (file.size / 1024).toFixed(1);
  try {
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
    const afterKB = (compressed.size / 1024).toFixed(1);
    const ratio = ((1 - compressed.size / file.size) * 100).toFixed(0);
    console.log(
      `[photo-compress] ${file.name}: ${beforeKB}KB -> ${afterKB}KB (-${ratio}%)`
    );
    return compressed;
  } catch (err) {
    console.warn(`[photo-compress] FAILED ${file.name}:`, err);
    return null;
  }
}

export function TicketForm({ installationData, token }: TicketFormProps) {
  const router = useRouter();

  const [problemType, setProblemType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<
    "idle" | "preparing_photos" | "submitting" | "attaching_photos"
  >("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!token) {
      setSubmitError(
        "We could not read the secure link parameters. Please re-open Sunterra Support from the ShinePhone app."
      );
      setSubmitStage("idle");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // --- Phase 2G-3: compress photos and convert to base64 ---
    type PhotoPayload = {
      filename: string;
      mimeType: string;
      base64: string;
    };
    let photoPayloads: PhotoPayload[] = [];
    let compressionFailedCount = 0;
    if (photos.length > 0) {
      setSubmitStage("preparing_photos");
      const compressionStart = performance.now();
      const compressed = await Promise.all(photos.map(compressPhoto));
      const successfullyCompressed = compressed
        .map((file, i) => ({ file, originalName: photos[i].name }))
        .filter((entry): entry is { file: File; originalName: string } =>
          entry.file !== null
        );
      compressionFailedCount = photos.length - successfullyCompressed.length;
      const elapsedMs = Math.round(performance.now() - compressionStart);
      console.log(
        `[photo-compress] DONE ${successfullyCompressed.length}/${photos.length} succeeded ` +
          `(${compressionFailedCount} failed) in ${elapsedMs}ms`
      );

      const encoded = await Promise.all(
        successfullyCompressed.map(async (entry) => {
          const base64 = await fileToBase64(entry.file);
          if (!base64) {
            console.warn(`[photo-encode] FAILED ${entry.originalName}`);
            return null;
          }
          return {
            filename: entry.originalName,
            mimeType: entry.file.type || "image/jpeg",
            base64,
          };
        })
      );
      photoPayloads = encoded.filter((p): p is PhotoPayload => p !== null);
      console.log(
        `[photo-encode] DONE ${photoPayloads.length}/${successfullyCompressed.length} encoded`
      );
    }
    // Phase 2G-3: when photos are present, the server-side step is
    // longer (it uploads each photo to Salesforce). Show a distinct
    // state to set user expectation.
    setSubmitStage(photoPayloads.length > 0 ? "attaching_photos" : "submitting");
    // --- end Phase 2G-3 compress+encode block ---

    const selectedType = PROBLEM_TYPES.find((t) => t.id === problemType);
    const subject = selectedType
      ? `Support: ${selectedType.label}`
      : "Support request";

    const formPayload: Record<string, string> = {
      type: problemType,
      subject,
      description,
    };
    if (installationData.name) formPayload.customerName = installationData.name;
    if (installationData.email) formPayload.email = installationData.email;
    if (installationData.address) formPayload.installationStreet = installationData.address;

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          form: formPayload,
          photos: photoPayloads,
        }),
      });

      let data: SubmitResponseBody | null = null;
      try {
        data = (await res.json()) as SubmitResponseBody;
      } catch {
        data = null;
      }

      if (
        !res.ok ||
        !data ||
        data.success !== true ||
        typeof data.caseNumber !== "string"
      ) {
        const message =
          (data && typeof data.error === "string" && data.error) ||
          `Server error (${res.status})`;
        setSubmitError(message);
        setIsSubmitting(false);
        setSubmitStage("idle");
        return;
      }

      const totalPhotoFailures =
        (data.photoWarning ?? 0) + compressionFailedCount;
      const successUrl =
        totalPhotoFailures > 0
          ? `/success?caseNumber=${encodeURIComponent(data.caseNumber)}&photoWarning=${totalPhotoFailures}`
          : `/success?caseNumber=${encodeURIComponent(data.caseNumber)}`;
      router.push(successUrl);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
      setIsSubmitting(false);
      setSubmitStage("idle");
    }
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
                disabled={isSubmitting}
                onClick={() => setProblemType(option.id)}
                className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_UNSELECTED} ${isSubmitting ? "opacity-60" : ""}`}
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
          disabled={isSubmitting}
          placeholder="Please tell us what is happening..."
          className="block max-h-[150px] w-full resize-none overflow-y-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-sunterra-dark placeholder:text-gray-400 focus:border-sunterra-primary focus:outline-none disabled:opacity-60"
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
                  disabled={isSubmitting}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-sunterra-dark text-white shadow-sm [-webkit-tap-highlight-color:transparent] disabled:opacity-60"
                >
                  <X size={14} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label
          className={`flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white px-4 py-5 text-gray-500 transition-colors duration-150 [-webkit-tap-highlight-color:transparent] ${
            atMaxPhotos || isSubmitting
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
            disabled={atMaxPhotos || isSubmitting}
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
          {submitError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="block h-12 w-full rounded-lg bg-sunterra-primary text-base font-medium text-white transition-colors duration-150 hover:bg-[#178362] active:bg-[#136a50] disabled:cursor-not-allowed disabled:bg-sunterra-primary/60 disabled:hover:bg-sunterra-primary/60"
          >
            {submitStage === "preparing_photos"
              ? "Preparing photos..."
              : submitStage === "submitting"
                ? "Submitting..."
                : submitStage === "attaching_photos"
                  ? "Attaching photos..."
                  : "Submit ticket"}
          </button>
          <p className="mt-2 text-center text-xs text-sunterra-dark/60">
            We&apos;ll respond within 24 hours
          </p>
        </div>
      </div>
    </form>
  );
}
