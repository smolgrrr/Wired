import { Event } from 'nostr-tools'

function extractMediaUrls(content: string): string[] {
  const regex = /(https?:\/\/\S+\.(?:jpg|png|jpeg|gif|mp4|webm|mov|webp))/gi;
  const matches = content.match(regex);
  return matches || [];
}

export function parseContent(event: Event) {
  const files = extractMediaUrls(event.content);
  let contentWithoutFiles = event.content;

  files.forEach(file => {
      contentWithoutFiles = contentWithoutFiles.replace(file, '');
  });

  return {
      comment: contentWithoutFiles.trim(),
      files
  };
}