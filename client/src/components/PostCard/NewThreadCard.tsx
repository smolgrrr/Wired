import CardContainer from './CardContainer';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { generatePrivateKey, getPublicKey, finishEvent, relayInit} from 'nostr-tools';
import { minePow } from '../../utils/mine';

const difficulty = 10

export const relay = relayInit('wss://nostr.lu.ke')

const NewThreadCard = () => {
  const [comment, setComment] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let sk = generatePrivateKey()
    let pk = getPublicKey(sk)

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`)
    })
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`)
    })

    await relay.connect()

    try {
      const event = minePow({
        kind: 1,
        tags: [],
        content: 'Hello, world!',
        created_at: Math.floor(Date.now() / 1000), //needs to be date To Unix
        pubkey: pk,
      }, difficulty)

      const signedEvent = finishEvent(event, sk)
      await relay.publish(signedEvent)
      console.log(signedEvent.id)

    } catch (error) {
      setComment(comment + " " + error);
    }
    relay.close()
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