// GearGrid's mark (DokaanBondhu spec D207): a grid of nine with the marigold at its centre.

export function Mark({ className = "size-9", dim = false }: { className?: string; dim?: boolean }) {
  return (
    <svg viewBox="0 0 30 30" className={`flex-none ${className}`} aria-hidden="true">
      {[0, 11, 22].flatMap((y) =>
        [0, 11, 22].map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="8"
            height="8"
            rx="2"
            fill={x === 11 && y === 11 ? "#f4b400" : dim ? "#2b3576" : "#3a47a8"}
          />
        )),
      )}
    </svg>
  );
}
