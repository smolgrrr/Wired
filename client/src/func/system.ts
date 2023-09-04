import {Event, getEventHash, UnsignedEvent} from 'nostr-tools';
import {elem, lockScroll, unlockScroll} from './utils/dom';

const errorOverlay = document.querySelector('section#errorOverlay') as HTMLElement;

type PromptErrorOptions = {
  onCancel?: () => void;
  onRetry?: () => void;
};

/**
 * Creates an error overlay, currently with hardcoded POW related message, this could be come a generic prompt
 * @param error message
 * @param options {onRetry, onCancel} callbacks
 */
const promptError = (
  error: string,
  options: PromptErrorOptions,
) => {
  const {onCancel, onRetry} = options;
  lockScroll();
  errorOverlay.replaceChildren(
    elem('h1', {className: 'error-title'}, error),
    elem('p', {}, 'time ran out finding a proof with the desired mining difficulty. either try again, lower the mining difficulty or increase the timeout in profile settings.'),
    elem('div', {className: 'buttons'}, [
      onCancel ? elem('button', {data: {action: 'close'}}, 'close') : '',
      onRetry ? elem('button', {data: {action: 'again'}}, 'try again') : '',
    ]),
  );
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target instanceof Element) {
      const button = e.target.closest('button');
      if (button) {
        switch(button.dataset.action) {
          case 'close':
            onCancel && onCancel();
            break;
          case 'again':
            onRetry && onRetry();
            break;
        }
        errorOverlay.removeEventListener('click', handleOverlayClick);
        errorOverlay.hidden = true;
        unlockScroll();
      }
    }
  };
  errorOverlay.addEventListener('click', handleOverlayClick);
  errorOverlay.hidden = false;
}

type PowEventOptions = {
  difficulty: number;
  statusElem: HTMLElement;
  timeout: number;
};

type WorkerResponse = {
  error: string;
  event: Event;
};

type HashedEvent = UnsignedEvent & {
  id: string;
};

/**
 * run proof of work in a worker until at least the specified difficulty.
 * if succcessful, the returned event contains the 'nonce' tag
 * and the updated created_at timestamp.
 *
 * powEvent returns a rejected promise if the funtion runs for longer than timeout.
 * a zero timeout makes mineEvent run without a time limit.
 * a zero mining target just resolves the promise without trying to find a 'nonce'.
 */
export const powEvent = (
  evt: UnsignedEvent,
  options: PowEventOptions
): Promise<HashedEvent | void> => {
  const {difficulty, statusElem, timeout} = options;
  if (difficulty === 0) {
    return Promise.resolve({
      ...evt,
      id: getEventHash(evt),
    });
  }
  const cancelBtn = elem('button', {className: 'btn-inline'}, [elem('small', {}, 'cancel')]);
  statusElem.replaceChildren('working…', cancelBtn);
  statusElem.hidden = false;
  return new Promise((resolve, reject) => {
    const worker = new Worker('/worker.js');

    const onCancel = () => {
      worker.terminate();
      reject(`mining kind ${evt.kind} event canceled`);
    };
    cancelBtn.addEventListener('click', onCancel);

    worker.onmessage = (msg: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      cancelBtn.removeEventListener('click', onCancel);
      if (msg.data.error) {
        promptError(msg.data.error, {
          onCancel: () => reject(`mining kind ${evt.kind} event canceled`),
          onRetry: async () => {
            const result = await powEvent(evt, {difficulty, statusElem, timeout}).catch(console.warn);
            resolve(result);
          }
        })
      } else {
        resolve(msg.data.event);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      // promptError(msg.data.error, {});
      cancelBtn.removeEventListener('click', onCancel);
      reject(err);
    };

    worker.postMessage({event: evt, difficulty, timeout});
  });
};
