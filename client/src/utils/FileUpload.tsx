import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import { base64 } from "@scure/base";

export interface UploadResult {
  url?: string;
  error?: string;
}

const whitelistImageURL = ["nostr.build", "void.cat", "blossom.oxtr"];
/**
 * Upload file to void.cat
 * https://void.cat/swagger/index.html
 */

export default async function FileUpload(file: File): Promise<UploadResult> {
  const sk = generateSecretKey();
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const auth = async () => {
    const authEvent = {
      kind: 24242,
      content: "Upload " + file.name + " from getwired.app",
      tags: [
        ["t", "upload"],
        ["x", hashHex],
        ["expiration", (Math.floor(Date.now() / 1000) + 24 * 60 * 60).toString()]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: getPublicKey(sk),
    }
    const authString = JSON.stringify(finalizeEvent(authEvent, sk));
    const authBase64 = base64.encode(new TextEncoder().encode(authString));
    return `Nostr ${authBase64}`;
  };
  
  const req = await fetch("https://blossom.oxtr.dev/upload", {
    body: file,
    method: "PUT",
    headers: {
      "authorization": await auth() // Use the encoded authorization header
    },
  });
  if (req.ok) {
    const fileExtension = file.name.split(".").pop(); // Extracting the file extension
    const resultUrl = `https://blossom.oxtr.dev/${hashHex}.${fileExtension}`;
    return { url: resultUrl };
  }
  return {
    error: "Upload failed",
  };
}

export const renderMedia = (files: string[]) => {
  const gridTemplateColumns = files.length > 1 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';
  const gridTemplateRows = files.length > 2 ? 'repeat(2, 1fr)' : 'repeat(1, 1fr)';

  // Function to toggle blur on click
  const toggleBlur = (event: React.MouseEvent<HTMLImageElement>) => {
    event.currentTarget.classList.toggle('no-blur');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns, gridTemplateRows, gap: '2px' }}>
      {files.map((file, index) => {
        // Check if the file is from allowed domains
        const isFromAllowedDomain = whitelistImageURL.some(domain => file.includes(domain));

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
              className={`thumb mt-2 rounded-md w-full ${!isFromAllowedDomain ? "blur" : ""}`}
              src={file}
              onClick={isFromAllowedDomain ? undefined : toggleBlur} // Only add onClick if blur is applied
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
