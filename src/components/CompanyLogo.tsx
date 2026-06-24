export function CompanyLogo({ className = "" }: { className?: string }) {
  return (
    <img
      className={`company-logo ${className}`.trim()}
      src="/sugihara-grand-logo.png"
      alt="Sugihara Grand Industries Sdn Bhd"
    />
  );
}
