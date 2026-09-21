export function StarMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.4 14.85 8.15 22 8.7 16.55 13.55 18.4 20.7 12 16.85 5.6 20.7 7.45 13.55 2 8.7 9.15 8.15Z"
      />
    </svg>
  );
}
