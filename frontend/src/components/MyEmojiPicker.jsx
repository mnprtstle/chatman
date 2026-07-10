import { EmojiPicker } from "frimousse";

export function MyEmojiPicker({ onEmojiSelect, emojiSearchProps }) {
  return (
    <EmojiPicker.Root
      className="isolate flex h-80 w-fit flex-col bg-base-100 border-[1px] border-base-300 rounded-md"
      onEmojiSelect={onEmojiSelect}
    >
      <EmojiPicker.Search
        {...emojiSearchProps}
        className="z-10 mx-2 mt-2 appearance-none rounded-md px-2.5 py-2 text-sm bg-neutral focus:outline-accent/50" />
      <EmojiPicker.Viewport className="relative flex-1 outline-hidden chacha">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="px-3 pt-3 pb-1.5 font-medium  text-xs bg-base-100 text-neutral-400"
                {...props}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="flex size-11 items-center justify-center rounded-md text-3xl data-[active]:bg-accent/15"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

