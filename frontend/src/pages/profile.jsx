import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon'
import PencilIcon from '@heroicons/react/24/solid/PencilIcon'
import { useEffect, useRef, useState } from 'react'
import { requestHandler } from '../utils'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon'
import { CheckIcon } from '../assets/icons'
import { updateUserAvatar } from "../api";
import { AvatarSize, UserLoginType } from '../constants'
import PasswordChanger from '../components/PasswordChanger';
import { updateAvatarOnProfile } from '../store/thunks'
import { compressImage } from '../utils/imageCompressor'
import { LoadingCircle } from '../components/LoadingCircle'

function Profile() {
  // useStates
  const [previewImage, setPreviewImage] = useState(null);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [showPasswordChanger, setShowPasswordChanger] = useState(false);
  const [compressingLoader, setCompressingLoader] = useState(null);
  //useRefs
  const avatarInputRef = useRef(null);
  //redux
  const account = useSelector(state => state.auth.account);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onImageChange = async (e) => {
    console.log("onImageChange called")
    if (previewImage?.ready) return;

    const compressedBlobs = await compressImage(e.target.files[0], true, setCompressingLoader);

    if (compressedBlobs) {
      setPreviewImage({
        ready: true,
        buffersToSend: compressedBlobs,
        localImageUrl: URL.createObjectURL(compressedBlobs[0])
      })
    }

    setCompressingLoader(null);

  }

  const updateProfilePhoto = () => {
    if (!previewImage.buffersToSend) return
    requestHandler(
      async () => updateUserAvatar(previewImage.buffersToSend),
      setChangingPhoto,
      res => {
        dispatch(updateAvatarOnProfile(res.data.avatar.url));
        setPreviewImage(null);
      },
      alert
    )
  }

  useEffect(() => {
    //to revoke the object url on previewImage change or unmount
    return () => {
      if (previewImage?.localImageUrl) {
        URL.revokeObjectURL(previewImage.localImageUrl);
      }
    }
  }, [previewImage]);

  return (

    <>

      {showPasswordChanger ? (
        <PasswordChanger setShowPasswordChanger={setShowPasswordChanger} />
      ) : (
        <>
          <div className='flex gap-4 items-center p-3'>
            <ChevronLeftIcon
              onClick={() => navigate("/chats")}
              className='text-base-content stroke-2 size-7 my-auto mx-1 cursor-pointer hover:scale-110 active:scale-100 active:brightness-90' />
            <p className="flex-1 text-center text-md">
              Profile
            </p>

          </div>

          <div className={`px-8 flex-1 flex items-center gap-8 ${previewImage && "justify-center"}`}>

            {(previewImage || compressingLoader) ? (

              <div className='lg:h-72 sm:h-30 border-base-300 border-2 rounded-md m-auto relative'>
                {compressingLoader ? (

                  <div className='absolute inset-0'>
                    <LoadingCircle type={compressingLoader.type} progress={compressingLoader.progress} />
                  </div>

                ) : (

                  <>
                    <img
                      className='h-full aspect-square object-cover rounded-md'
                      src={previewImage.localImageUrl || "/assets/batman-avatar.png"} alt="" />
                    <button
                      disabled={changingPhoto}
                      onClick={updateProfilePhoto}
                      className={`absolute cursor-pointer bottom-1 right-1 p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 ${!changingPhoto ? "bg-accent" : "bg-neutral"}`}>
                      {changingPhoto ? (
                        <span className="loading loading-ring loading-md text-accent m-auto"></span>

                      ) : (
                        <CheckIcon size="25" color="var(--color-base-100)" />
                      )}
                    </button>
                    <button
                      onClick={() => setPreviewImage(null)}
                      className="absolute cursor-pointer bottom-1 left-1 p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 bg-error">
                      <XMarkIcon className='size-6 text-base-100' />
                    </button>
                  </>

                )}
              </div>

            ) : (
              <>
                <input
                  ref={avatarInputRef}
                  type="file"
                  hidden
                  accept="image/png, image/jpeg, image/jpg, image/bmp, image/gif, image/tiff, image/svg+xml, image/webp"
                  onChange={onImageChange}
                />
                <div className='lg:h-72 sm:h-30 w-fit border-base-300 border-2 rounded-md relative'>
                  <img
                    className='w-full h-full aspect-square object-cover rounded-md'
                    src={
                      account?.avatar?.url ? (
                        `${import.meta.env.VITE_SERVER_URI}/chats/getdp/${account.avatar.url}_${AvatarSize.LG}`
                      ) : account?.avatar?.ssoUrl ? (
                        account.avatar.ssoUrl
                      ) : (
                        "/assets/batman-avatar.png"
                      )}
                    referrerPolicy="no-referrer"
                    alt="" />

                  <button
                    onClick={() => avatarInputRef.current.click()}
                    className="absolute cursor-pointer bottom-1 right-1 p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 bg-accent">
                    <PencilIcon className='size-5 text-base-100' />
                  </button>

                </div>

                <div className='text-md flex-1'>

                  <p className='text-2xl font-semibold text-wrap'>
                    {account?.fullName}
                  </p>
                  {account?.loginType === UserLoginType.EMAIL_PASSWORD && (
                    <button
                      onClick={() => setShowPasswordChanger(true)}
                      className='text-accent text-lg mt-9 cursor-pointer'>Change password</button>
                  )}

                </div>
              </>
            )}
          </div>
        </>
      )}

    </>
  )
}

export default Profile;
