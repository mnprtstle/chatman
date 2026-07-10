function LoadingBar({ type = 'spinner', progress, showRing, progressBarThickness = '8' }) {

  return (
    <div className='w-full bg-transparent overflow-hidden'>

      {(type === 'spinner') ? (

        <div className='animate-progress w-full h-1 bg-accent/70 origin-left'></div>

      ) : (
        <div
          className={`w-full ${showRing && "py-1 px-2 border-[1px] border-accent/50 rounded-sm"}`}
        >
          <div className='bg-accent/70'
            style={{
              width: `${progress}%`,
              height: `${progressBarThickness}px`,
              transition: 'width 0.2s ease-out'
            }}
          ></div>
        </div>

      )
      }

    </div >
  )

}

export default LoadingBar
