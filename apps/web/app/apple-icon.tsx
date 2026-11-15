import { appIcon } from "./icon-art";

// The icon iPhone's "Add to Home Screen" uses (DokaanBondhu spec D243): square, since iPhone rounds the corners itself.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon({ size: 180, grid: 0.6, rounded: false });
}
