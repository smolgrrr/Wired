import CardContainer from './CardContainer';
import { ArrowUpTrayIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Event, generatePrivateKey, getPublicKey, finishEvent, relayInit} from 'nostr-tools';
import { minePow } from '../../utils/mine';
import { publish } from '../../utils/relays';

const difficulty = 20

const NewThreadCard: React.FC = () => {
  const [comment, setComment] = useState("");
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let sk = generatePrivateKey();

    try {
      const event = minePow({
        kind: 1,
        tags: [],
        content: comment,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: getPublicKey(sk),
      }, difficulty);

      const signedEvent = finishEvent(event, sk);
      await publish(signedEvent);
      console.log(signedEvent.id);

    } catch (error) {
      setComment(comment + " " + error);
    }
  };

  // async function attachFile(file_input: File | null) {
  //   try {
  //     if (file_input) {
  //       const rx = await NostrImg(file_input);
  //       if (rx.url) {
  //         setComment(comment + " " + rx.url);
  //       } else if (rx?.error) {
  //         setComment(comment + " " + rx.error);
  //       }
  //     }
  //   } catch (error: unknown) {
  //     if (error instanceof Error) {
  //       setComment(comment + " " + error?.message);
  //     }
  //   }
  // }

  return (
    <>
      <CardContainer>
          <form 
            name="post" 
            method="post" 
            encType="multipart/form-data"
            className=""
            onSubmit={handleSubmit}
          >
            <input type="hidden" name="MAX_FILE_SIZE" defaultValue={4194304} />
            <div id="togglePostFormLink" className="text-lg font-semibold">
              Start a New Thread
            </div>
            <div>
              <textarea 
                name="com" 
                wrap="soft" 
                className="w-full p-2 rounded bg-gradient-to-r from-blue-900 to-cyan-500 text-white border-none placeholder-blue-300"
                placeholder='Shitpost here...'
                value={comment} 
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <ArrowUpTrayIcon className="h-6 w-6 text-white" />
                <input type="file" className="hidden" />
              </div>
              <span className="flex items-center"><CpuChipIcon className="h-6 w-6 text-white" />: {difficulty}</span>
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