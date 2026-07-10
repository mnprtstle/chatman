function FormButton({
  name,
  className = "",
  type = "submit",
  canSubmit,
  isLoading = false,
  ...props
}) {
  return (
    <button
      className={`button rounded-md text-base-100 font-medium text-xl h-11 w-full transition duration-500 ${(canSubmit && !isLoading) ? "bg-accent hover:scale-105 hover:custom-shadow active:scale-100 active:brightness-90 cursor-pointer" : "cursor-default bg-accent/70"} ${className}`}
      type={type}
      {...props}
    >
      {!isLoading ? name : <span className="loading loading-bars loading-sm"></span>}
    </button>
  )
}

export default FormButton
