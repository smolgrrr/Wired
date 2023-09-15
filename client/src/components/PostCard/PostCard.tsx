import CardContainer from './CardContainer';
import { FolderIcon } from '@heroicons/react/24/outline';
import { parseContent } from '../../utils/content';
import { Event } from 'nostr-tools';

const colorCombos = [
  'from-red-400 to-yellow-500',
  'from-green-400 to-blue-500',
  'from-purple-400 to-pink-500',
  'from-yellow-400 to-orange-500',
  'from-indigo-400 to-purple-500',
  'from-pink-400 to-red-500',
  'from-blue-400 to-indigo-500',
  'from-orange-400 to-red-500',
  'from-teal-400 to-green-500',
  'from-cyan-400 to-teal-500',
  'from-lime-400 to-green-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-violet-400 to-purple-500',
  'from-sky-400 to-cyan-500'
];

function getRandomElement(array: string[]): string {
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}
const timeAgo = (unixTime: number) => {
  const seconds = Math.floor((new Date().getTime() / 1000) - unixTime);
  
  if (seconds < 60) return `now`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days} days ago`;
};

const PostCard = ({ event}: { event: Event }) => {
    // Replace 10 with the actual number of comments for each post
    const numberOfComments = 10;

    const { comment, file } = parseContent(event);

    // const replyList = await relay.list([
    //   {
    //     kinds: [1],
    //     limit: 200,
    //   },
    // ]);

  return (
    <>
      <CardContainer>
        <div className="flex flex-col">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
            <div className={`h-5 w-5 bg-gradient-to-r ${getRandomElement(colorCombos)} rounded-full`} />
              <div className="ml-2 text-md font-semibold">Anonymous</div>
            </div>
            <div className="flex items-center ml-auto">
              <div className="text-xs font-semibold text-gray-500 mr-2">{timeAgo(event.created_at)}</div>
              <FolderIcon className="h-5 w-5 mr-1 text-gray-500" />
              <span className="text-xs text-gray-500">{numberOfComments}</span>
            </div>  
          </div>
          <div className="mr-2 flex flex-col break-words">
            {comment}
          </div>
          {file !== "" && (
            <div className="file">
                <img
                  src={file}
                  loading="lazy"
                /> 
            </div>
           )}
        </div>
      </CardContainer>
    </>
  );
};

export default PostCard;