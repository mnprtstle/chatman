export const LoadingCircle = ({ type = 'spinner', progress, showPercentage, thickness = '6', size = '3', lightTheme = false }) => {
  if (type === 'spinner') {
    return (
      <div
        style={{ "--size": `${size}rem` }}
        className={`loading size-[var(--size)] loading-spinner text-accent opacity-80 ${lightTheme && "brightness-90"}`}
      ></div>
    )
  } else {
    return (
      <div
        className={`radial-progress opacity-80 text-accent ${lightTheme && "brightness-90"}`}
        style={{ "--value": progress, "--size": `${size}rem`, "--thickness": `${thickness}px` }}
        aria-valuenow={progress} role="progressbar">
        {showPercentage && `${progress}%`}
      </div>

    )
  }
}
