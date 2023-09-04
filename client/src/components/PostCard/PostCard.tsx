import CardContainer from './CardContainer';

interface PostCardProps {
  content: string;
  time: Date;
}

const PostCard = ({ content, time }: PostCardProps) => {
  return (
    <>
      <CardContainer>
        <div className="flex flex-col">
          {time.toString()}
          <div className="mr-2 flex flex-col break-words">
            {content}
          </div>
        </div>
      </CardContainer>
    </>
  );
};

export default PostCard;