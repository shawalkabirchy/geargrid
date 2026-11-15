import { appIcon } from "./icon-art";

// The browser tab's icon and the installed app's icons (DokaanBondhu spec D243): /icon/32, /icon/192, /icon/512 and
// /icon/maskable, all drawn in code; the manifest names the last three.

const ICONS = {
  "32": { size: 32, grid: 0.72, rounded: true },
  "192": { size: 192, grid: 0.6, rounded: true },
  "512": { size: 512, grid: 0.6, rounded: true },
  maskable: { size: 512, grid: 0.5, rounded: false },
} as const;

type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return (Object.keys(ICONS) as IconId[]).map((id) => ({
    id,
    contentType: "image/png",
    size: { width: ICONS[id].size, height: ICONS[id].size },
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const key = (await id) as IconId;
  return appIcon(ICONS[key] ?? ICONS["192"]);
}
