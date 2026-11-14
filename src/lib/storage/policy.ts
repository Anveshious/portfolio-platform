import { getPublicEnv } from "@/lib/config/env";

export const MEDIA_BUCKET = "portfolio-media";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // keep in sync with migration + bucket limit

/** Allowed types. SVG is deliberately excluded (scriptable => XSS risk on a public bucket). */
export const ALLOWED_MIME: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { ext: "webp", magic: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  "image/avif": { ext: "avif", magic: (b) => ascii(b, 4, 12) === "ftypavif" },
  "application/pdf": { ext: "pdf", magic: (b) => ascii(b, 0, 5) === "%PDF-" },
};

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.slice(from, to));
}

export type UploadProblem = "empty" | "too_large" | "type_not_allowed" | "content_mismatch";

/** Validate declared type, size and the file's actual leading bytes. Returns null when acceptable. */
export function validateUpload(input: { mimeType: string; size: number; head: Uint8Array }): UploadProblem | null {
  if (input.size <= 0) return "empty";
  if (input.size > MAX_UPLOAD_BYTES) return "too_large";
  const rule = ALLOWED_MIME[input.mimeType];
  if (!rule) return "type_not_allowed";
  if (!rule.magic(input.head)) return "content_mismatch";
  return null;
}

export function storagePublicUrl(bucket: string, path: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
