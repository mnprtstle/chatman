import { forwardRef, useId, useState } from 'react'
import EyeIcon from '@heroicons/react/24/outline/EyeIcon'
import EyeSlashIcon from '@heroicons/react/24/outline/EyeSlashIcon'


const Input = forwardRef(({
  label,
  type = "text",
  className = "",
  ...props
}, ref) => {
  const id = useId();
  const [seePassword, setSeePassword] = useState(false);

  return (
    <div className={`w-full relative ${className}`}>
      {label && <label
        className='inline-block mb-1 pl-1'
        htmlFor={id}
        hidden>
      </label>}
      <input
        type={(seePassword && type === "password") ? "text" : type}
        className={`input rounded-md w-full py-6 text-xl bg-neutral focus:outline-none focus:border-accent/50 transition ${(type === "password") ? "pl-4 pr-12" : "px-4"} `}
        placeholder={label}
        ref={ref}
        id={id}
        {...props} />
      {(type === "password") && (
        <div className='absolute px-2 py-auto h-full right-0 top-0 flex items-center z-10'>
          {seePassword ? (
            <EyeIcon className='size-6 ' onClick={() => setSeePassword(false)} />
          ) : (
            <EyeSlashIcon className='size-6 ' onClick={() => setSeePassword(true)} />
          )}

        </div>
      )}
    </div>
  )
})

export default Input
