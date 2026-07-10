import Avatar from './Avatar'

function PersonCard({
  name,
  avatar,
  isChecked = false,
  forNegativeList = false,
  ...props
}) {
  return (
    <div
      className={`cursor-pointer card py-1 px-4 mt-1 border-2 hover:scale-[1.02] transition active:scale-100  active:bg-neutral flex flex-row items-center ${isChecked ? "scale-[1.02] bg-neutral" : "border-transparent"} ${forNegativeList ? "hover:border-error/50 active:border-error/50" : "hover:border-accent/50 active:border-accent/50"} ${(forNegativeList && isChecked) ? "border-error/50" : isChecked ? "border-accent/50" : ""}`}
      {...props}
    >
      <Avatar
        className="h-11"
        dp={avatar}
      />
      <div className='flex-1 flex flex-col ml-4 gap-1'>
        <p className='text-xl text-base-content'>{name ? name : "Person"}</p>
      </div>
    </div>
  )
}

export default PersonCard;
