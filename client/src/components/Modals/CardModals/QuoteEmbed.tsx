import { parseContent } from "../../../utils/content";
import { Event } from "nostr-tools";
import { getMetadata, uniqBy } from "../../../utils/otherUtils";
import ContentPreview from "./TextModal";
import { renderMedia } from "../../../utils/FileUpload";

const colorCombos = [
  "from-red-400 to-yellow-500",
  "from-green-400 to-blue-500",
  "from-purple-400 to-pink-500",
  "from-yellow-400 to-orange-500",
  "from-indigo-400 to-purple-500",
  "from-pink-400 to-red-500",
  "from-blue-400 to-indigo-500",
  "from-orange-400 to-red-500",
  "from-teal-400 to-green-500",
  "from-cyan-400 to-teal-500",
  "from-lime-400 to-green-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
  "from-sky-400 to-cyan-500",
];

const getColorFromHash = (id: string, colors: string[]): string => {
  // Create a simple hash from the event.id
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }

  // Use the hash to pick a color from the colors array
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const timeAgo = (unixTime: number) => {
  const seconds = Math.floor(new Date().getTime() / 1000 - unixTime);

  if (seconds < 60) return `now`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
};

const QuoteEmbed = ({
  event,
  metadata,
}: {
  event: Event;
  metadata: Event | null;
}) => {
  const { comment, file } = parseContent(event);
  const colorCombo = getColorFromHash(event.pubkey, colorCombos);

  let metadataParsed = null;
  if (metadata !== null) {
    metadataParsed = getMetadata(metadata);
  }

  return (
    <div className="p-3 rounded-lg border border-neutral-700 bg-neutral-800">
      <div className="flex flex-col">
        <div className="flex flex-col break-words">
          <ContentPreview key={event.id} comment={comment} />
        </div>
        {renderMedia(file)}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            {metadataParsed ? (
              <>
                <img
                  className={`h-5 w-5 rounded-full`}
                  src={metadataParsed.picture}
                  alt=""
                />
                <div className="text-sm font-medium">{metadataParsed.name}</div>
              </>
            ) : (
              <>
                <div
                  className={`h-4 w-4 bg-gradient-to-r ${colorCombo} rounded-full`}
                />
                <div className="text-sm font-medium">Anonymous</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteEmbed;
