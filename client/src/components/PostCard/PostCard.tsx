import CardContainer from './CardContainer';

const PostCard = ({ content }: { content: string }) => {

  return (
    <>
      <CardContainer>
        <div className="flex flex-col gap-4">
          <div className="ml-16 mr-2 flex flex-col gap-4 break-words">
            {content}
          </div>
        </div>
        <hr className="-mx-4 mt-2 opacity-10" />
      </CardContainer>
    </>
  );
};

export default PostCard;