import CardContainer from './CardContainer';

const NewThreadCard = () => {

  return (
    <>
      <CardContainer>
        <div className="flex flex-col">
        <form name="post" method="post" encType="multipart/form-data"><input type="hidden" name="MAX_FILE_SIZE" defaultValue={4194304} />
        <div id="togglePostFormLink" className="desktop">Start a New Thread
        </div>
        <table className="postForm" id="postForm">
          <tbody>
            <tr data-type="Comment">
              <td><textarea name="com" wrap="soft" /></td>
            </tr>
            <tr data-type="File">
              <td>File*</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <div id="postFormError" />
              </td>
            </tr>
          </tfoot>
        </table>
      </form>
        </div>
      </CardContainer>
    </>
  );
};

export default NewThreadCard;