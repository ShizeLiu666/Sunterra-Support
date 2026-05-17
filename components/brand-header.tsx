import Image from "next/image";

export function BrandHeader() {
  return (
    <header className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-4 md:px-6">
      <Image
        src="/sunterra_logo.png"
        alt="Sunterra"
        width={61}
        height={44}
        priority
        className="h-11 w-auto"
      />
      <div className="min-w-0">
        <h1 className="text-lg font-semibold leading-tight text-sunterra-dark">
          Sunterra Support
        </h1>
        <p className="text-sm text-sunterra-dark/60">Submit a service request</p>
      </div>
    </header>
  );
}
