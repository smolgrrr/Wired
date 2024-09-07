import React from "react";
import { Event } from "nostr-tools";
import { useEffect, useState } from "react";
import { subNoteOnce } from "../../../utils/subscriptions";
import { nip19 } from "nostr-tools";
import { parseContent } from "../../../utils/content";
import QuoteEmbed from "./QuoteEmbed";
import LinkModal from "./LinkPreview";
import { EventPointer } from "nostr-tools/lib/types/nip19";

const RichText = ({ text, isExpanded, emojiMap }: { text: string; isExpanded: boolean; emojiMap: Record<string, any> }) => {
  let content = isExpanded ? text.split('\n') : text.slice(0, 750).split('\n');
  
  return (
    <>
      {content.map((line, i) => (
        <div key={i} className={line.startsWith('>') ? 'text-sky-300' : ''}>
          {line.split(' ').map((word, j) => {
            if (emojiMap[word]) {
              return <img className="w-9 h-9 mx-0.5 inline" src={emojiMap[word]} alt={word} key={j} />;
            }              
            const match = word.match(/(?:nostr:(?:npub1|nprofile1|naddr1)|@(?:npub1|nprofile1|naddr1))([a-z0-9]+)/i);
            if (match) {
              const fullIdentifier = match[0];
              const displayText = `@${fullIdentifier.replace(/^(@|nostr:)/, '').slice(0, 9)}`;
              return <><a className="underline" href={`https://njump.me/${fullIdentifier.replace(/^(@|nostr:)/, '')}`} key={j} target="_blank" rel="noopener noreferrer">{displayText}</a>{' '}</>;
            } else {
              return `${word} `;
            }
          })}
        </div>
      ))}
    </>
  );
};

// ... rest of the file remains unchanged

const ContentPreview = ({ key, eventdata }: { key: string; eventdata: Event }) => {
  const { comment } = parseContent(eventdata);
  const [finalComment, setFinalComment] = useState(comment);
  const [quoteEvents, setQuoteEvents] = useState<Event[]>([]); // Initialize state
  const [isExpanded, setIsExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [emojiMap, setEmojiMap] = useState<Record<string, any>>({});

  // Define your callback function for subGlobalFeed
  const onEvent = (event: Event, relay: string) => {
    setQuoteEvents((prevEvents) => [...prevEvents, event]);
  };

  useEffect(() => {
    const match = comment.match(/\b(nostr:(?:nevent1|note1)[\w]+|@(?:nevent1|note1)[\w]+)/i);
    const nostrURI = match && match[1].replace(/^(nostr:|@)/, '');
    if (nostrURI && quoteEvents.length === 0) {
      if (nostrURI.startsWith('note')) {
        setFinalComment(finalComment.replace("nostr:" + nostrURI, "").trim());
        let id_to_hex = String(nip19.decode(nostrURI).data);
        if (!quoteEvents.some(event => event.id === id_to_hex)) {
          subNoteOnce(id_to_hex, onEvent);
        }
      } else if (nostrURI.startsWith('nevent')) {
        setFinalComment(finalComment.replace("nostr:" + nostrURI, "").trim());
        let { type, data } = nip19.decode(nostrURI) as { type: string, data: EventPointer };
      if (data.kind === 1 && !quoteEvents.some(event => event.id === data.id)) {
        subNoteOnce(data.id, onEvent);
      }
      }
    }

    let newEmojiMap: Record<string, any> = {};
    eventdata.tags.forEach(tag => {
      if (tag[0] === "emoji") {
        newEmojiMap[`:${tag[1]}:`] = tag[2];
      }
    });
    // Update the state variable
    setEmojiMap(newEmojiMap);

  }, [comment, quoteEvents]);

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
    <div className="gap-2 flex flex-col break-words text-xs">
      <RichText text={finalComment} isExpanded={isExpanded} emojiMap={emojiMap} />
      {finalComment.length > 350 && (
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
