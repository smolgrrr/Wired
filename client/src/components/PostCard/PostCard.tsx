import CardContainer from './CardContainer';

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
const randomCombo = getRandomElement(colorCombos);

const PostCard = ({ content }: { content: string }) => {

  return (
    <>
      <CardContainer>
        <div className="flex flex-col">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
            <div className={`h-6 w-6 bg-gradient-to-r ${getRandomElement(colorCombos)} rounded-full`} />
              <div className="ml-2 text-lg font-semibold">Anonymous</div>
            </div>
            <div className="text-sm font-semibold">1 day ago</div>
            </div>
          <div className="mr-2 flex flex-col break-words">
            {content}
          </div>
        </div>
      </CardContainer>
    </>
  );
};

export default PostCard;