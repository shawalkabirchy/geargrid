// UUIDv7 and UUIDv5 written by hand with Web Crypto, so the same code runs on the phone later (spec 5.1).

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function toBytes(uuid: string): Uint8Array {
  if (!UUID_PATTERN.test(uuid)) throw new TypeError(`not a UUID: ${uuid}`);
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function setVersionAndVariant(bytes: Uint8Array, version: number): void {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | (version << 4);
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
}

/** Time-ordered UUID: 48 bits of Unix milliseconds, then random bits. */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = BigInt(nowMs);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(ms & 0xffn);
    ms >>= 8n;
  }
  setVersionAndVariant(bytes, 7);
  return toUuid(bytes);
}

/** Name-based UUID (SHA-1): the same name and namespace always give the same UUID. */
export async function uuidv5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = toBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, namespaceBytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  const bytes = hash.slice(0, 16);
  setVersionAndVariant(bytes, 5);
  return toUuid(bytes);
}
