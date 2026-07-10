import { useState } from 'react'
import { AvatarSize } from '../constants';

const placeholderImgSrc = "/assets/batman-avatar.png"

function Avatar({
  dp,
  src,
  size,
  className = "",
  ...props
}) {

  const [loaded, setLoaded] = useState(false);

  return (

    <div
      className={`avatar ${className}`}
      {...props}
    >
      <div
        className="rounded-md h-full aspect-square bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${placeholderImgSrc})`,
        }}
      >
        <img
          className='object-cover h-full aspect-square'
          src={
            src ? (
              src
            ) : dp?.url ? (
              `${import.meta.env.VITE_SERVER_URI}/chats/getdp/${dp.url}_${AvatarSize.SM}`
            ) : dp?.ssoUrl ? (
              dp.ssoUrl
            ) : (
              null
            )
          }
          onLoad={() => setLoaded(true)}
          style={{
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.2s ease-in-out"
          }}
          onError={e => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = placeholderImgSrc
          }}
          referrerPolicy="no-referrer" />
      </div>
    </div>

  )
}

export default Avatar
