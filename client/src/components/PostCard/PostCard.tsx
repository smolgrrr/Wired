import CardContainer from "./CardContainer";
import { FolderIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { parseContent } from "../../utils/content";
import { Event, nip19 } from "nostr-tools";
import { getMetadata } from "../../utils/utils";
import ContentPreview from "../Modals/TextModal";
import { renderMedia } from "../../utils/FileUpload";
import { getIconFromHash } from "../../utils/deterministicProfileIcon";
import { verifyPow } from "../../utils/mine";

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

const PostCard = ({
  key,
  event,
  metadata,
  replyCount,
}: {
  key: string;
  event: Event;
  metadata: Event | null;
  replyCount: number;
}) => {
  let { comment, file } = parseContent(event);
  const icon = getIconFromHash(event.pubkey);

  let metadataParsed = null;
  if (metadata !== null) {
    metadataParsed = getMetadata(metadata);
  }

  return (
    <CardContainer>
      <a href={`/thread/${nip19.noteEncode(event.id)}`}>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              {metadataParsed ? (
                <>
                  <img
                    className={`h-8 w-8 rounded-full`}
                    src={metadataParsed.picture}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="text-md font-semibold">
                    {metadataParsed.name}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`h-7 w-7 ${icon} rounded-full`}
                  />
                  <div className="text-sm font-semibold">Anonymous</div>
                </>
              )}
            </div>
            <div className="flex items-center ml-auto gap-2.5">
              <div className="inline-flex text-xs text-neutral-600 gap-0.5">
              <CpuChipIcon className="h-4 w-4" /> {verifyPow(event)} 
              </div>
              <span className="text-neutral-700">·</span>
              <div className="text-xs font-semibold text-neutral-600">
                {timeAgo(event.created_at)}
              </div>
              <span className="text-neutral-700">·</span>
              <div className="inline-flex items-center gap-1">
                <FolderIcon className="h-4 w-4 text-neutral-600" />
                <span className="text-xs text-neutral-600">{replyCount}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col break-words">
            <ContentPreview key={event.id} comment={comment} />
          </div>
        </div>
      </a>
      {renderMedia(file)}
    </CardContainer>
  );
};

export default PostCard;
