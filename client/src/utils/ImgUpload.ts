export interface UploadResult {
    url?: string;
    error?: string;
  }

/**
 * Upload file to void.cat
 * https://void.cat/swagger/index.html
 */

export default async function NostrImg(file: File ): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("image", file);

  const req = await fetch("https://nostrimg.com/api/upload", {
    body: fd,
    method: "POST",
    headers: {
      accept: "application/json",
    },
  });
  if (req.ok) {
    const data: UploadResponse = await req.json();
    if (typeof data?.imageUrl === "string" && data.success) {
      return {
        url: new URL(data.imageUrl).toString(),
      };
    }
  }
  return {
    error: "Upload failed",
  };
  }

export interface UploadResult {
  url?: string;
  error?: string;
}

export type VoidUploadResponse = {
    ok: boolean,
    file?: VoidFile,
    errorMessage?: string,
}

interface UploadResponse {
  fileID?: string;
  fileName?: string;
  imageUrl?: string;
  lightningDestination?: string;
  lightningPaymentLink?: string;
  message?: string;
  route?: string;
  status: number;
  success: boolean;
  url?: string;
  data?: {
    url?: string;
  };
}

export type VoidFile = {
    id: string,
    meta?: VoidFileMeta
}

export type VoidFileMeta = {
    version: number,
    id: string,
    name?: string,
    size: number,
    uploaded: Date,
    description?: string,
    mimeType?: string,
    digest?: string,
    url?: string,
    expires?: Date,
    storage?: string,
    encryptionParams?: string,
}