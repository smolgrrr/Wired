import type { Event, EventTemplate } from "nostr-tools";
import { BLOSSOM_SERVERS } from "../../config";

export type BlossomAuthSigner = (template: EventTemplate) => Event;

export type UploadedMedia = {
  url: string;
  mime: string;
  sha256: string;
  size: number;
  width?: number;
  height?: number;
  imetaFields?: string[];
};

type BlossomDescriptor = {
  url?: string;
  sha256?: string;
  size?: number;
  type?: string;
  nip94?: string[][];
};

const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
]);

export const MAX_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeServerUrl(server: string): string {
  return server.trim().replace(/\/+$/, "");
}

function serverDomain(server: string): string {
  return new URL(server).hostname.toLowerCase();
}

function descriptorTagValue(descriptor: BlossomDescriptor, key: string): string | undefined {
  return descriptor.nip94?.find((tag) => tag[0] === key)?.[1];
}

function descriptorExtraImetaFields(descriptor: BlossomDescriptor): string[] {
  const handledTags = new Set(["url", "m", "x", "size", "dim"]);
  return (descriptor.nip94 || [])
    .filter((tag) => tag.length >= 2 && !handledTags.has(tag[0]))
    .map(([key, ...values]) => `${key} ${values.join(" ").trim()}`.trim())
    .filter(Boolean);
}

function descriptorToUploadedMedia(
  descriptor: BlossomDescriptor,
  file: File,
  sha256: string,
  dimensions?: Pick<UploadedMedia, "width" | "height">,
): UploadedMedia {
  const url = descriptor.url || descriptorTagValue(descriptor, "url");
  if (!url) {
    throw new Error("Blossom response did not include a media URL.");
  }

  const mime = descriptor.type || descriptorTagValue(descriptor, "m") || file.type;
  const descriptorSize = descriptor.size ?? Number(descriptorTagValue(descriptor, "size"));
  const sizeValue = Number.isFinite(descriptorSize) && descriptorSize > 0
    ? descriptorSize
    : file.size;
  const hashValue = descriptor.sha256 || descriptorTagValue(descriptor, "x") || sha256;
  const imetaFields = descriptorExtraImetaFields(descriptor);

  return {
    url,
    mime,
    sha256: hashValue,
    size: sizeValue,
    ...(dimensions?.width ? { width: dimensions.width } : {}),
    ...(dimensions?.height ? { height: dimensions.height } : {}),
    ...(imetaFields.length > 0 ? { imetaFields } : {}),
  };
}

function uploadAuthorizationHeader({
  action,
  sha256,
  server,
  signer,
}: {
  action: "media" | "upload";
  sha256: string;
  server: string;
  signer: BlossomAuthSigner;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const event = signer({
    kind: 24242,
    created_at: now,
    tags: [
      ["t", action],
      ["expiration", String(now + 5 * 60)],
      ["server", serverDomain(server)],
      ["x", sha256],
    ],
    content: action === "media" ? "Upload Media" : "Upload Blob",
  });

  return `Nostr ${base64UrlEncode(JSON.stringify(event))}`;
}

async function putBlossomEndpoint({
  file,
  server,
  endpoint,
  action,
  sha256,
  signer,
}: {
  file: File;
  server: string;
  endpoint: "/media" | "/upload";
  action: "media" | "upload";
  sha256: string;
  signer: BlossomAuthSigner;
}): Promise<BlossomDescriptor> {
  const response = await fetch(`${server}${endpoint}`, {
    method: "PUT",
    headers: {
      Authorization: uploadAuthorizationHeader({ action, sha256, server, signer }),
      "Content-Type": file.type || "application/octet-stream",
      "X-Content-Length": String(file.size),
      "X-SHA-256": sha256,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Blossom ${endpoint} failed with ${response.status}`);
  }

  return response.json() as Promise<BlossomDescriptor>;
}

export function isSupportedMediaFile(file: File): boolean {
  return supportedMediaTypes.has(file.type) && file.size <= MAX_MEDIA_UPLOAD_BYTES;
}

function fileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read media file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read media file."));
    reader.readAsArrayBuffer(file);
  });
}

export async function sha256File(file: File): Promise<string> {
  const bytes = new Uint8Array(await fileArrayBuffer(file));
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function readImageDimensions(
  file: File,
): Promise<Pick<UploadedMedia, "width" | "height"> | undefined> {
  if (!file.type.startsWith("image/") || typeof Image === "undefined") return undefined;

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth || undefined,
          height: image.naturalHeight || undefined,
        });
      };
      image.onerror = () => resolve(undefined);
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadMediaFile({
  file,
  signer,
  servers = BLOSSOM_SERVERS,
}: {
  file: File;
  signer: BlossomAuthSigner;
  servers?: readonly string[];
}): Promise<UploadedMedia> {
  if (!isSupportedMediaFile(file)) {
    throw new Error("Unsupported media type or file is too large.");
  }

  const serverList = servers.map(normalizeServerUrl).filter(Boolean);
  if (serverList.length === 0) {
    throw new Error("No Blossom upload servers are configured.");
  }

  const sha256 = await sha256File(file);
  const dimensions = await readImageDimensions(file);
  const errors: string[] = [];

  for (const server of serverList) {
    try {
      const descriptor = file.type.startsWith("image/") || file.type.startsWith("video/")
        ? await putBlossomEndpoint({
            file,
            server,
            endpoint: "/media",
            action: "media",
            sha256,
            signer,
          })
        : await putBlossomEndpoint({
            file,
            server,
            endpoint: "/upload",
            action: "upload",
            sha256,
            signer,
          });

      return descriptorToUploadedMedia(descriptor, file, sha256, dimensions);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "upload failed");
    }

    try {
      const descriptor = await putBlossomEndpoint({
        file,
        server,
        endpoint: "/upload",
        action: "upload",
        sha256,
        signer,
      });
      return descriptorToUploadedMedia(descriptor, file, sha256, dimensions);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "upload failed");
    }
  }

  throw new Error(errors[0] || "Media upload failed.");
}
