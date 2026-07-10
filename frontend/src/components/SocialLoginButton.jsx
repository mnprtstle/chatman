import { useState } from 'react'
import { FacebookIcon, GithubIcon, GoogleIcon } from '../assets/icons';

function SocialLoginButton({
  option = "Google"
}) {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <a
      className='items-center flex'
      href={(option === "Google") ? `${import.meta.env.VITE_SERVER_URI}/users/google` : (option === "Github") ? `${import.meta.env.VITE_SERVER_URI}/users/github` : `${import.meta.env.VITE_SERVER_URI}/users/facebook`}
      onClick={() => setIsLoading(true)}
      aria-label="Log in with Google"
    >
      {!isLoading ? (
        <>
          {(option === "Google") ? (
            <>
              <GoogleIcon size="45" color="var(--color-accent)" className="hover:scale-105 hover:drop-shadow-[0_0_5px_var(--color-accent)] transition active:scale-100" />

            </>
          ) : (option === "Github") ? (
            <>
              <GithubIcon size="45" color="var(--color-accent)" className="hover:scale-105 hover:drop-shadow-[0_0_5px_var(--color-accent)] transition active:scale-100" />

            </>
          ) : (
            <>
              <FacebookIcon size="45" color="var(--color-accent)" className="hover:scale-105 hover:drop-shadow-[0_0_5px_var(--color-accent)] transition active:scale-100" />
            </>
          )}

        </>
      ) : (
        <span className="loading loading-ring loading-xl text-accent"></span>
      )}

    </a>
  )
}

export default SocialLoginButton
