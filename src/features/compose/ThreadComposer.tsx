import { useState } from "react";
import { Event } from "nostr-tools";
import { PostForm } from "./PostForm";
import { Button } from "../../shared/ui/Button";
import { ContentColumn } from "../../shared/ui/PageShell";

type PostType = "" | "Reply" | "Quote" | undefined;

export function ThreadComposer({ OPEvent }: { OPEvent: Event }) {
  const [showForm, setShowForm] = useState(false);
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
          }}
        >
          reply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowForm((prev) => !prev);
            setPostType("Quote");
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
    </>
  );
}
