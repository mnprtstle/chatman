function LoginProblem({ problem, continueLogin, cancelLogin }) {
  return (
    <div className='absolute z-50 inset-0 backdrop-blur-md bg-base-100/40 flex items-center justify-center'>
      <div className='py-5 px-6 bg-base-100 border-2 border-base-300 rounded-md lg:mx-28 sm:mx-14'>
        <p className='text-center text-base-content text-lg'>
          {problem}
        </p>
        <p className='text-center text-base-content text-lg'>
          Do you wish to continue?
        </p>
        <div className='mt-5 flex justify-between gap-3'>
          <button
            onClick={cancelLogin}
            className='cursor-pointer mx-3 text-accent text-md px-2 py-0.5 rounded-md hover:scale-110 active:scale-100 active:brightness-75 transition'>
            Cancel
          </button>
          <button
            onClick={continueLogin}
            className='cursor-pointer mx-3 bg-accent text-base-100 text-md px-2 py-0.5 rounded-md hover:scale-110 active:scale-100 active:brightness-75 transition'>
            Continue
          </button>
        </div>

      </div>
    </div>
  )
}

export default LoginProblem
