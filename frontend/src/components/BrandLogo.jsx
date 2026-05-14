/** Scandic Run brand mark. Drops in anywhere we previously used the
 *  Lucide <Compass /> icon. Accepts the same `className` so existing
 *  size/colour utilities (e.g. "w-6 h-6 text-[#007AFF]") still work for
 *  layout — the actual fill comes from the PNG itself. */
export default function BrandLogo({ className = "w-6 h-6", alt = "Scandic Run" }) {
    return (
        <img
            src="/scandic-logo.png"
            alt={alt}
            className={`${className} object-contain shrink-0`}
            data-testid="brand-logo"
        />
    );
}
