import QuoteEmbed from "./QuoteEmbed";
import { getLinkPreview } from 'link-preview-js';
import { Event } from 'nostr-tools';
import { useEffect, useState } from "react";
import { getMetadata, uniqBy } from '../../utils/utils';
import { subNoteOnce } from '../../utils/subscriptions';
import { nip19 } from "nostr-tools";
import LinkModal from "./LinkPreview";

const ContentPreview = ({ key, comment }: { key: string, comment: string }) => {
    const [finalComment, setFinalComment] = useState(comment)
    const [quoteEvents, setQuoteEvents] = useState<Event[]>([]); // Initialize state
    const [isExpanded, setIsExpanded] = useState(false);
    const [url, setUrl] = useState('')

      // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setQuoteEvents((prevEvents) => [...prevEvents, event]);
        console.log(event.id + ' ' + event.kind + ' ' + event.tags);
    };

    useEffect(() => {
        const findUrl = comment.match(/\bhttps?:\/\/\S+/gi);
        if (findUrl && findUrl.length > 0) {
            setUrl(findUrl[0])
            // setFinalComment(finalComment.replace(findUrl[0], '').trim())
        }
    
        const match = comment.match(/\bnostr:([a-z0-9]+)/i);
        const nostrQuoteID = match && match[1];
        if (nostrQuoteID && nostrQuoteID.length > 0) {
          let id_to_hex = String(nip19.decode(nostrQuoteID as string).data);
          subNoteOnce(id_to_hex, onEvent);
          setFinalComment(finalComment.replace('nostr:'+nostrQuoteID, '').trim())
        }
      }, [comment]);
    
    const getMetadataEvent = (event: Event) => {
    const metadataEvent = quoteEvents.find(e => e.pubkey === event.pubkey && e.kind === 0);
    if (metadataEvent) {
        return metadataEvent;
    }
    return null;
    }

    return (
      <div className="mr-2 flex flex-col break-words">
        {isExpanded ? finalComment : finalComment.slice(0, 240)}
        {finalComment.length > 240 && (
          <button className="text-gray-500" onClick={() => setIsExpanded(true)}>
            ... Read more
          </button>
        )}
        {url !== '' && (
            <LinkModal key={key} url={url} />
        )}
        {quoteEvents[0] && quoteEvents.length > 0 && (
          <QuoteEmbed key={key} event={quoteEvents[0]} metadata={getMetadataEvent(quoteEvents[0])} />
        )}
      </div>
    );
  }
  
  export default ContentPreview;
  