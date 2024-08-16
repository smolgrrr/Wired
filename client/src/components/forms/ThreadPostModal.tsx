import { useState } from "react";
import { Event } from "nostr-tools"
import { DocumentTextIcon, FolderPlusIcon, DocumentDuplicateIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import NewNoteCard from '../forms/PostFormCard';
import RepostNote from '../forms/RepostNote';

type PostType = "" | "Reply" | "Quote" | undefined;

const ThreadPostModal = ({ OPEvent }: { OPEvent: Event }) => {
    const [showForm, setShowForm] = useState(false);
    const [showRepost, setShowRepost] = useState(false);
    const [postType, setPostType] = useState<PostType>("");

    return (
        <>
            <div className="col-span-full flex justify-center space-x-16 pb-4">
                <DocumentTextIcon
                    className="h-5 w-5 text-gray-200 cursor-pointer"
                    onClick={() => {
                        setShowForm(prevShowForm => !prevShowForm);
                        setPostType('Reply');
                        setShowRepost(false)
                    }}
                />
                <DocumentDuplicateIcon
                    className="h-5 w-5 text-gray-200 cursor-pointer"
                    onClick={() => {
                        setShowRepost(prevShowRepost => !prevShowRepost);
                        setShowForm(false);
                    }}
                />
                <FolderPlusIcon
                    className="h-5 w-5 text-gray-200 cursor-pointer"
                    onClick={() => {
                        setShowForm(prevShowForm => !prevShowForm);
                        setPostType('Quote');
                        setShowRepost(false)
                    }}
                />
                <a href={`nostr:${OPEvent.id}`} target="_blank" rel="noopener noreferrer">
                    <ArrowTopRightOnSquareIcon
                        className="h-5 w-5 text-gray-200 cursor-pointer"
                    />
                </a>
            </div>
            {(showForm && postType) &&
                <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    <div className='text-center'>
                        <span >{postType}-post</span>
                    </div>
                    <NewNoteCard refEvent={OPEvent} tagType={postType} />
                </div>}
            {showRepost && OPEvent && <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                <div className='text-center'>
                    <span>Repost note</span>
                </div>
                <RepostNote refEvent={OPEvent} />
            </div>}
        </>
    );
};

export default ThreadPostModal;