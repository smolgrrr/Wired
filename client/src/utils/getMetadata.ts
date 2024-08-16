import { Event } from "nostr-tools"

export interface Metadata {
  name?: string
  username?: string
  display_name?: string
  picture?: string
  banner?: string
  about?: string
  website?: string
  lud06?: string
  lud16?: string
  nip05?: string
}

export const getMetadata = (event: Event) => {
  try {
    const content = event.content.replace(/[\n\r\t]/g, '')
    const metadata: Metadata = JSON.parse(content)
    return metadata
  } catch (error) {
    console.error(`Error parsing metadata for event: ${event.id}`, error)
    return {}
  }
}