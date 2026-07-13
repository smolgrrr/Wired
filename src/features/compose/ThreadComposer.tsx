import { lazy, Suspense, useState } from "react";
import { Event } from "nostr-tools";
import { Button } from "../../shared/ui/Button";
import { ContentColumn } from "../../shared/ui/PageShell";

type PostType = "Reply" | "Quote";

const LazyPostForm = lazy(() =>
  import("./PostForm").then((module) => ({ default: module.PostForm })),
);

type ThreadComposerProps = {
  OPEvent: Event;
  showAllReplies: boolean;
  onToggleLowSignal: () => void;
};

export function ThreadComposer({
  OPEvent,
  showAllReplies,
  onToggleLowSignal,
}: ThreadComposerProps) {
  const [postType, setPostType] = useState<PostType | null>(null);

  const togglePostType = (nextPostType: PostType) => {
    setPostType((currentPostType) =>
      currentPostType === nextPostType ? null : nextPostType,
    );
  };

  return (
    <ContentColumn>
      <div className="flex items-center justify-between border-b border-ghost py-1">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={postType === "Reply"}
            aria-expanded={postType === "Reply"}
            className={postType === "Reply" ? "text-primary" : ""}
            onClick={() => togglePostType("Reply")}
          >
            reply
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={postType === "Quote"}
            aria-expanded={postType === "Quote"}
            className={postType === "Quote" ? "text-primary" : ""}
            onClick={() => togglePostType("Quote")}
          >
            quote
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onToggleLowSignal}>
          {showAllReplies ? "hide low-signal" : "reveal low-signal"}
        </Button>
      </div>
      {postType && (
        <div className="py-2">
          <p className="text-meta text-muted text-center mb-2">{postType.toLowerCase()}</p>
          <Suspense fallback={null}>
            <LazyPostForm refEvent={OPEvent} tagType={postType} />
          </Suspense>
        </div>
      )}
    </ContentColumn>
  );
}
