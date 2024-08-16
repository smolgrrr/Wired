import { parseContent } from "../../../utils/content";
import { Event } from "nostr-tools";
import { getMetadata } from "../../../utils/getMetadata";
import ContentPreview from "./TextModal";
import { renderMedia } from "../../../utils/FileUpload";
import { getIconFromHash, timeAgo } from "../../../utils/cardUtils";
import { CpuChipIcon } from "@heroicons/react/24/outline";
import { verifyPow } from "../../../utils/mine";

const QuoteEmbed = ({
  key,
  event,
  metadata,
}: {
  key?: string | number;
  event: Event;
  metadata: Event | null;
}) => {
  const { files } = parseContent(event);
  const icon = getIconFromHash(event.pubkey);

  let metadataParsed = null;
  if (metadata !== null) {
    metadataParsed = getMetadata(metadata);
  }

  return (
    <div className="p-3 rounded-lg border border-neutral-700">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col break-words">
          <ContentPreview key={event.id} eventdata={event} />
        </div>
        <div className="flex justify-between items-center">
            {metadataParsed ?
              <img
                key={key}
                className={`h-5 w-5 rounded-full`}
                src={metadataParsed?.picture ?? icon}
                alt=""
                loading="lazy"
                decoding="async" />
              :
              <div className={`h-4 w-4 ${icon} rounded-full`} />
            }
          <div className="flex items-center ml-auto gap-2.5">
            <div className="inline-flex text-xs text-neutral-600 gap-0.5">
              <CpuChipIcon className="h-4 w-4" /> {verifyPow(event)}
            </div>
            <span className="text-neutral-700">·</span>
            <div className="text-xs font-semibold text-neutral-600">
              {timeAgo(event.created_at)}
            </div>
            <span className="text-neutral-700">·</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteEmbed;
