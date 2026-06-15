import { useState } from "react";
import { Event } from "nostr-tools";
import { PostForm } from "./PostForm";
import { RepostForm } from "./RepostForm";
import { Button } from "../../shared/ui/Button";
import { ContentColumn } from "../../shared/ui/PageShell";

type PostType = "" | "Reply" | "Quote" | undefined;

export function ThreadComposer({ OPEvent }: { OPEvent: Event }) {
  const [showForm, setShowForm] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [postType, setPostType] = useState<PostType>("");

  return (
    <>
      <div className="col-span-full flex justify-center gap-6 pb-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowForm((prev) => !prev);
            setPostType("Reply");
            setShowRepost(false);
          }}
        >
          reply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowRepost((prev) => !prev);
            setShowForm(false);
          }}
        >
          repost
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowForm((prev) => !prev);
            setPostType("Quote");
            setShowRepost(false);
          }}
        >
          quote
        </Button>
      </div>
      {showForm && postType && (
        <ContentColumn className="my-2">
          <p className="text-meta text-muted text-center mb-2">{postType.toLowerCase()}</p>
          <PostForm refEvent={OPEvent} tagType={postType} />
        </ContentColumn>
      )}
      {showRepost && OPEvent && (
        <ContentColumn className="my-2">
          <p className="text-meta text-muted text-center mb-2">repost</p>
          <RepostForm refEvent={OPEvent} />
        </ContentColumn>
      )}
    </>
  );
}