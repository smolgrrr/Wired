import { useState } from "react";
import { Event } from "nostr-tools";
import { PostForm } from "./PostForm";
import { RepostForm } from "./RepostForm";

type PostType = "" | "Reply" | "Quote" | undefined;

export function ThreadComposer({ OPEvent }: { OPEvent: Event }) {
  const [showForm, setShowForm] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [postType, setPostType] = useState<PostType>("");

  return (
    <>
      <div className="col-span-full flex justify-center gap-8 pb-4 text-xs">
        <button
          type="button"
          onClick={() => {
            setShowForm((prev) => !prev);
            setPostType("Reply");
            setShowRepost(false);
          }}
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => {
            setShowRepost((prev) => !prev);
            setShowForm(false);
          }}
        >
          Repost
        </button>
        <button
          type="button"
          onClick={() => {
            setShowForm((prev) => !prev);
            setPostType("Quote");
            setShowRepost(false);
          }}
        >
          Quote
        </button>
      </div>
      {showForm && postType && (
        <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
          <div className="text-center">
            <span>{postType}-post</span>
          </div>
          <PostForm refEvent={OPEvent} tagType={postType} />
        </div>
      )}
      {showRepost && OPEvent && (
        <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
          <div className="text-center">
            <span>Repost note</span>
          </div>
          <RepostForm refEvent={OPEvent} />
        </div>
      )}
    </>
  );
}