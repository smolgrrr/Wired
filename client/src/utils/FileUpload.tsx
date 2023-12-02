import { generatePrivateKey, getPublicKey, finishEvent } from "nostr-tools";
import { base64 } from "@scure/base";

export interface UploadResult {
  url?: string;
  error?: string;
}

/**
 * Upload file to void.cat
 * https://void.cat/swagger/index.html
 */

export default async function FileUpload(file: File): Promise<UploadResult> {
  const buf = await file.arrayBuffer();
  const sk = generatePrivateKey();
  const auth = async () => {
    const authEvent = {
      kind: 27235,
      tags: [
        ["u", "https://void.cat/upload"],
        ["method", "POST"]
      ],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      pubkey: getPublicKey(sk),
    }
    return `Nostr ${base64.encode(new TextEncoder().encode(JSON.stringify(finishEvent(authEvent, sk))))}`;
  };
  
  const req = await fetch("https://void.cat/upload", {
    body: buf,
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "V-Content-Type": file.type, // Extracting the mime type
      "V-Filename": file.name, // Extracting the filename
      "V-Description": "Upload from https://tao-green.vercel.app/",
      "V-Strip-Metadata": "true", // Here's the new header
      "authorization": await auth()
    },
  });
  if (req.ok) {
    let rsp: VoidUploadResponse = await req.json();
    const fileExtension = file.name.split(".").pop(); // Extracting the file extension
    const resultUrl = `https://void.cat/d/${rsp.file?.id}.${fileExtension}`;
    return { url: resultUrl };
  }
  return {
    error: "Upload failed",
  };
}

export const renderMedia = (files: string[]) => {
  const gridTemplateColumns = files.length > 1 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';
  const gridTemplateRows = files.length > 2 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns, gridTemplateRows, gap: '2px' }}>
      {files.map((file, index) => {
        if (file && (file.endsWith(".mp4") || file.endsWith(".webm"))) {
          return (
            <video
              key={index}
              controls
              muted
              src={file + "#t=0.1"}
              preload="metadata"
              className="thumb mt-1 rounded-md w-full"
            >
              <source src={file} type="video/mp4" />
            </video>
          );
        } else if (!file.includes("http")) {
          return null;
        } else {
          return (
            <img
              key={index}
              alt="Invalid thread"
              loading="lazy"
              className="thumb mt-2 rounded-md w-full"
              src={file}
            />
          );
        }
      })}
    </div>
  );
};

export async function attachFile(file_input: File | null): Promise<string> {
  if (!file_input) {
    throw new Error("No file provided");
  }

  try {
    const rx = await FileUpload(file_input);

    if (rx.error) {
      throw new Error(rx.error);
    }

    return rx.url || "No URL returned from FileUpload";
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`File upload failed: ${error.message}`);
    }

    throw new Error("Unknown error occurred during file upload");
  }
}

export interface UploadResult {
  url?: string;
  error?: string;
}

export type VoidUploadResponse = {
  ok: boolean;
  file?: VoidFile;
  errorMessage?: string;
};

export type VoidFile = {
  id: string;
  meta?: VoidFileMeta;
};

export type VoidFileMeta = {
  version: number;
  id: string;
  name?: string;
  size: number;
  uploaded: Date;
  description?: string;
  mimeType?: string;
  digest?: string;
  url?: string;
  expires?: Date;
  storage?: string;
  encryptionParams?: string;
};
