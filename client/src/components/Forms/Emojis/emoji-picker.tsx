import data, { Emoji } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { RefObject } from "react";
import customEmojis from '../custom_emojis.json';

interface EmojiPickerProps {
  topOffset: number;
  leftOffset: number;
  onEmojiSelect: (e: Emoji) => void;
  onClickOutside: () => void;
  height?: number;
  ref: RefObject<HTMLDivElement>;
}

const customCategoryIcons = {
  categoryIcons: {
    "poast": {
      src: 'https://poa.st/emoji/custom/poast_hat.png',
    },
  },
}

export function EmojiPicker({
  topOffset,
  leftOffset,
  onEmojiSelect,
  onClickOutside,
  height = 300,
  ref,
}: EmojiPickerProps) {
  const customEmojiList = customEmojis.map(pack => {
    return {
      id: pack.id,
      name: pack.name,
      emojis: pack.emojis.map(e => {
        return {
          id: e.shortcode,
          name: e.shortcode,
          skins: [{ src: e.static_url }],
        };
      }),
    };
  });

  return (
    <>
      <div
        className="z-25"
        ref={ref}>
        <style>
          {`
              em-emoji-picker { max-height: ${height}px; }
              `}
        </style>
        <Picker
          autoFocus
          data={data}
          custom={customEmojiList}
          perLine={7}
          previewPosition="none"
          skinTonePosition="search"
          theme="dark"
          onEmojiSelect={onEmojiSelect}
          onClickOutside={onClickOutside}
          maxFrequentRows={3}
          categoryIcons={customCategoryIcons}
        />
      </div>
    </>
  );
}