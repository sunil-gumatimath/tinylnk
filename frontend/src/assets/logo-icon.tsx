export default function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 10.5h12"
        stroke="var(--heading, #f8fafc)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M11 10.5v12c0 2 1.5 3.5 3.5 3.5h2"
        stroke="var(--heading, #f8fafc)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14c0 2.2 1.8 4 4 4h4"
        stroke="var(--primary, #10b981)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="27"
        cy="24"
        r="2"
        fill="#a3ff12"
      />
    </svg>
  );
}
