import CardContainer from './CardContainer';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const NewThreadCard = () => {
  return (
    <>
      <CardContainer>
          <form 
            name="post" 
            method="post" 
            encType="multipart/form-data"
            className=""
          >
            <input type="hidden" name="MAX_FILE_SIZE" defaultValue={4194304} />
            <div id="togglePostFormLink" className="text-lg font-semibold">
              Start a New Thread
            </div>
            <div>
              <textarea 
                name="com" 
                wrap="soft" 
                className="w-full p-2 rounded bg-gradient-to-r from-blue-900 to-cyan-500 text-white border-none"
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <ArrowUpTrayIcon className="h-6 w-6 text-white" />
                <input type="file" className="hidden" />
              </div>
            <button type="submit" className="px-4 py-2 bg-gradient-to-r from-cyan-900 to-blue-500 rounded text-white font-semibold">
              Submit
            </button>
            </div>
            <div id="postFormError" className="text-red-500" />
          </form>
      </CardContainer>
    </>
  );
};


export default NewThreadCard;