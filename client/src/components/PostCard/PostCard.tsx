import CardContainer from './CardContainer';

const PostCard = ({ content }: { content: string }) => {

  return (
    <>
      <CardContainer>
        <div className="flex flex-col">
          <div className="mr-2 flex flex-col break-words">
            {content}
          </div>
        </div>
      </CardContainer>
    </>
  );
};

export default PostCard;