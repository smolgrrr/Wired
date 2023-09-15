import { Event } from 'nostr-tools'

function extractMediaUrl(content: string){
    const regex = /(https?:\/\/\S+\.(?:jpg|png|jpeg|gif|mp4|webm|mov|webp))/i;
    const match = content.match(regex);
    if (match) {
      return match[0];
       
    } else {
      return '' ;
    }
  }

export function parseContent(event: Event) {
    const file = extractMediaUrl(event.content) as string;
    const contentWithoutFile = event.content.replace(file, '');

    return {
        comment: contentWithoutFile.trim(),
        file
    };
}