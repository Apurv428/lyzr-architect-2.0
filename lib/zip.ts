// Minimal STORED (uncompressed) ZIP builder — no external dependencies.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v: number) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}
function u32(v: number) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

const enc = new TextEncoder();
// Bit 11: file names are UTF-8, so non-ASCII paths survive extraction.
const UTF8_NAMES = 0x0800;

export function buildZip(files: Record<string, string>): Uint8Array {
  const localEntries: Uint8Array[] = [];
  const centralEntries: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const name = enc.encode(path.startsWith("/") ? path.slice(1) : path);
    const data = enc.encode(content);
    const crc = crc32(data);

    // Local file header: PK\x03\x04
    const local = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),        // version needed
      u16(UTF8_NAMES), // general purpose flags
      u16(0),         // compression method: STORED
      u16(0), u16(0), // mod time, mod date
      u32(crc),
      u32(data.length), // compressed size (= uncompressed for STORED)
      u32(data.length),
      u16(name.length),
      u16(0),           // extra field length
      name,
      data,
    );

    offsets.push(offset);
    localEntries.push(local);
    offset += local.length;

    // Central directory entry: PK\x01\x02
    centralEntries.push(concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20),            // version made by
      u16(20),            // version needed
      u16(UTF8_NAMES),    // flags
      u16(0),             // STORED
      u16(0), u16(0),     // mod time, mod date
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),             // extra
      u16(0),             // comment
      u16(0),             // disk start
      u16(0),             // int attr
      u32(0),             // ext attr
      u32(offsets[offsets.length - 1]),
      name,
    ));
  }

  const central = concat(...centralEntries);
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),                    // disk number
    u16(0),                    // central dir start disk
    u16(centralEntries.length),
    u16(centralEntries.length),
    u32(central.length),
    u32(offset),               // central dir offset
    u16(0),                    // comment length
  );

  return concat(...localEntries, central, eocd);
}

export function downloadZip(files: Record<string, string>, filename = "project.zip") {
  const bytes = buildZip(files);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type ZipEntry = { path: string; size: number; read: () => Promise<string> };

const u16at = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32at = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Lists the files in a ZIP (stored or deflated; no ZIP64 or encryption). Contents are decoded
 * lazily, so callers can pick which entries to read.
 */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32at(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That file isn't a ZIP archive.");

  const count = u16at(bytes, eocd + 10);
  let p = u32at(bytes, eocd + 16);
  const dec = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32at(bytes, p) !== 0x02014b50) throw new Error("This ZIP archive is damaged.");
    const flags = u16at(bytes, p + 8);
    const method = u16at(bytes, p + 10);
    const compressed = u32at(bytes, p + 20);
    const size = u32at(bytes, p + 24);
    const nameLen = u16at(bytes, p + 28);
    const extraLen = u16at(bytes, p + 30);
    const commentLen = u16at(bytes, p + 32);
    const local = u32at(bytes, p + 42);
    const path = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith("/") || flags & 0x1 || (method !== 0 && method !== 8)) continue; // folders, encrypted, unsupported
    entries.push({
      path,
      size,
      read: async () => {
        const start = local + 30 + u16at(bytes, local + 26) + u16at(bytes, local + 28);
        const data = bytes.subarray(start, start + compressed);
        return dec.decode(method === 8 ? await inflateRaw(data) : data);
      },
    });
  }
  return entries;
}
