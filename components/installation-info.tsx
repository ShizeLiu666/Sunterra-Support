import { CheckCircle2 } from "lucide-react";

export interface InstallationInfoProps {
  name: string;
  address: string;
  inverter: string;
  sn: string;
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Row({ label, value, mono }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-sunterra-dark/60">{label}</dt>
      <dd
        className={`text-right text-sunterra-dark ${mono ? "font-mono tracking-wider" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function VerifiedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sunterra-primary px-2 py-0.5 text-xs font-medium text-white">
      <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
      Verified
    </span>
  );
}

export function InstallationInfo({ name, address, inverter, sn }: InstallationInfoProps) {
  return (
    <section className="rounded-xl border border-sunterra-primary/15 bg-sunterra-light px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-sunterra-dark">Your installation</h2>
        <VerifiedPill />
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="Name" value={name} />
        <Row label="Address" value={address} />
        <Row label="Inverter" value={inverter} />
        <Row label="Serial number" value={sn} mono />
      </dl>
    </section>
  );
}
