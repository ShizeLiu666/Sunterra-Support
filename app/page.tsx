import { BrandHeader } from "@/components/brand-header";
import { InstallationInfo } from "@/components/installation-info";
import { TicketForm } from "@/components/ticket-form";

// TODO: Replace with values parsed from the signed URL params (see docs/integration-spec.md).
const FAKE_INSTALLATION = {
  name: "John Smith",
  address: "12 Pine Street, Adelaide SA 5000",
  inverter: "Growatt SPH 6000",
  sn: "YRP0F7G0CG",
};

export default function Home() {
  return (
    <main className="flex-1 bg-gray-50 md:bg-gradient-to-br md:from-sunterra-light/30 md:via-white md:to-amber-50/20">
      <div className="md:py-10">
        <div className="mx-auto max-w-[480px] md:overflow-hidden md:rounded-2xl md:bg-gray-50 md:shadow-xl md:ring-1 md:ring-black/5">
          <BrandHeader />
          <div className="space-y-5 px-4 py-5 md:space-y-6 md:px-5 md:py-6">
            <InstallationInfo {...FAKE_INSTALLATION} />
            <TicketForm />
          </div>
        </div>
      </div>
    </main>
  );
}
