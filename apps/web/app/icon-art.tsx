import { ImageResponse } from "next/og";

// GearGrid's app icon (DokaanBondhu spec D243), drawn in code from its mark (`mark.tsx`, D207): the grid of nine with
// the marigold at its centre, on the frame's indigo. `grid` is the mark's share of the icon's width; a maskable icon
// keeps it inside the safe circle (80 % of the width), so a phone's own mask never cuts a square.

const FRAME = "#1e2556";
const SQUARE = "#3a47a8";
const MARIGOLD = "#f4b400";

export function appIcon({ size, grid, rounded }: { size: number; grid: number; rounded: boolean }) {
  const scale = (size * grid) / 30; // the mark is drawn on 30 units: squares of 8 at 0, 11 and 22
  const offset = (size - 30 * scale) / 2;
  const squares = [0, 11, 22].flatMap((y) => [0, 11, 22].map((x) => ({ x, y })));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: FRAME,
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      {squares.map(({ x, y }) => (
        <div
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: offset + x * scale,
            top: offset + y * scale,
            width: 8 * scale,
            height: 8 * scale,
            borderRadius: 2 * scale,
            background: x === 11 && y === 11 ? MARIGOLD : SQUARE,
          }}
        />
      ))}
    </div>,
    { width: size, height: size },
  );
}
