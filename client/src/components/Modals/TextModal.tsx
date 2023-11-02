import QuoteEmbed from "./QuoteEmbed";
import { Event } from "nostr-tools";
import { useEffect, useState } from "react";
import { subNoteOnce } from "../../utils/subscriptions";
import { nip19 } from "nostr-tools";
import LinkModal from "./LinkPreview";

const ContentPreview = ({ key, comment }: { key: string; comment: string }) => {
  const [finalComment, setFinalComment] = useState(comment);
  const [quoteEvents, setQuoteEvents] = useState<Event[]>([]); // Initialize state
  const [isExpanded, setIsExpanded] = useState(false);
  const [url, setUrl] = useState("");

  // Define your callback function for subGlobalFeed
  const onEvent = (event: Event, relay: string) => {
    setQuoteEvents((prevEvents) => [...prevEvents, event]);
  };

  useEffect(() => {
    const findUrl = comment.match(/\bhttps?:\/\/\S+/gi);
    if (findUrl && findUrl.length > 0) {
      setUrl(findUrl[0]);
      setFinalComment(finalComment.replace(findUrl[0], "").trim());
    }

    const match = comment.match(/\bnostr:([a-z0-9]+)/i);
    const nostrQuoteID = match && match[1];
    if (nostrQuoteID && nostrQuoteID.length > 0) {
      let id_to_hex = String(nip19.decode(nostrQuoteID as string).data);
      subNoteOnce(id_to_hex, onEvent);
      setFinalComment(finalComment.replace("nostr:" + nostrQuoteID, "").trim());
    }
  }, [comment, finalComment]);

  const getMetadataEvent = (event: Event) => {
    const metadataEvent = quoteEvents.find(
      (e) => e.pubkey === event.pubkey && e.kind === 0
    );
    if (metadataEvent) {
      return metadataEvent;
    }
    return null;
  };

  return (
    <div className="gap-2 flex flex-col break-words text-sm">
      {isExpanded ? finalComment : finalComment.slice(0, 240)}
      {finalComment.length > 240 && (
        <button
          className="text-sm text-neutral-500"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "...Read less" : "...Read more"}
        </button>
      )}
      {url !== "" && <LinkModal key={key} url={url} />}
      {quoteEvents[0] && quoteEvents.length > 0 && (
        <a href={`/thread/${nip19.noteEncode(quoteEvents[0].id)}`}>
          <QuoteEmbed
            key={key}
            event={quoteEvents[0]}
            metadata={getMetadataEvent(quoteEvents[0])}
          />
        </a>
      )}
    </div>
  );
};

export default ContentPreview;
