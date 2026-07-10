import MagnifyingGlassIcon from '@heroicons/react/24/outline/MagnifyingGlassIcon'

function InputBar({
  className = "",
  placeholder = "Search for a chat",
  isSearchBar = false,
  ...props
}) {
  return (
    <div className='relative w-full'>
      <input
        placeholder={placeholder}
        className={`input w-full text-lg bg-neutral border-base-300 focus:outline-none focus:border-accent/50 border-2 transition ${isSearchBar && "pl-10"} ${className}`}
        {...props}
      />
      {isSearchBar && (
        <MagnifyingGlassIcon className='text-base-content size-6 absolute top-2 pointer-events-none left-2 z-10' />
      )}
    </div>

  )
}

export default InputBar
