import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon'
import PencilIcon from '@heroicons/react/24/solid/PencilIcon'
import { useEffect, useRef, useState } from 'react'
import { determineOkToProcess, requestHandler, userInfoTimestampGenerator } from '../utils'
import { getChatInfo, renameGroupChat, deleteGroupChat as deleteGroupChatApi, leaveGroupChat as leaveGroupChatApi } from '../api'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import InputBar from './InputBar'
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon'
import { CheckIcon, LogoutIcon } from '../assets/icons'
import { addLastMessageWithoutUnreadIncrement, declareAChatDeleted, exitMemberFromGroupChat, updateGroupChatPhoto, updateChatName } from '../store/chatsSlice'
import { exitMemberFromChatIfCurrent, resetCurrentChat, udpateCurrentChatName, udpateCurrentChatPhoto } from '../store/currentChatSlice'
import { loadGroupInfo, removeNofifyingMessage } from '../store/groupInfoSlice';
import { updateChatDisplayPhoto } from "../api";
import TrashIcon from '@heroicons/react/24/outline/TrashIcon'
import { AvatarSize, ChatStatusEnum } from '../constants'
import { addMessage } from '../store/messagesSlice'
import useRenderFetch from '../utils/useRenderFetch'
import { idb } from '../indexedDB'
import { compressImage } from '../utils/imageCompressor'
import { LoadingCircle } from './LoadingCircle'

function ChatDetails({ setShowChatDetails, setChatUnavailable }) {
  //useStates
  const [changingName, setChangingName] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [compressingLoader, setCompressingLoader] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);
  const [newChatName, setNewChatName] = useState("");
  const [editName, setEditName] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  //useRefs
  const displayPhotoInputRef = useRef(null);
  //redux
  const dispatch = useDispatch();
  const account = useSelector(state => state.auth.account);
  const groupInfo = useSelector(state => state.groupInfo);
  const otherUserPresence = useSelector(state => state.otherUserPresence);
  //others
  const { chatId } = useParams();
  const navigate = useNavigate();


  const openParticipantList = () => {
    dispatch(loadGroupInfo(chatInfo));
  }

  const openGroupNameEditor = () => {
    if (!chatInfo.isGroupChat) {
      return
    }
    setEditName(true);
    setNewChatName(chatInfo.name)

  }

  const onImageChange = async (e) => {
    if (previewImage?.ready) return;

    const compressedBlobs = await compressImage(e.target.files[0], true, setCompressingLoader);
    console.log("compressedBlobs: ", compressedBlobs)

    if (compressedBlobs) {
      console.log("gonna set this");
      setPreviewImage({
        ready: true,
        buffersToSend: compressedBlobs,
        localImageUrl: URL.createObjectURL(compressedBlobs[0])
      })
    }

    setCompressingLoader(null);

  }

  const changeGroupName = () => {
    if (!newChatName.trim() || (newChatName.trim() === chatInfo?.name)) return;
    requestHandler(
      async () => await renameGroupChat(chatId, { name: newChatName }),
      setChangingName,
      async res => {
        const { chatId: returnedChatId, updatedName, chatRevision, notifyingMessage } = res.data;
        setChatInfo(prev => ({ ...prev, name: updatedName }))
        const okToProcessResult = await determineOkToProcess(returnedChatId, chatRevision);
        if (okToProcessResult.okToProcess) {
          dispatch(udpateCurrentChatName({ chatId: returnedChatId, updatedName, chatRevision }));
          dispatch(updateChatName({ chatId: returnedChatId, updatedName, chatRevision }));
          idb.updateChatName(returnedChatId, updatedName, chatRevision);
        }

        const notifyingMessageToUse = { ...notifyingMessage, deviceTime: Date.now() }
        dispatch(addLastMessageWithoutUnreadIncrement(notifyingMessageToUse));
        dispatch(addMessage(notifyingMessageToUse));
        await idb.addNewMessage(notifyingMessageToUse);
        setEditName(false);
      },
      alert
    )
  }

  const updateGroupDisplayPhoto = () => {
    if (!previewImage.buffersToSend) return;
    requestHandler(
      async () => await updateChatDisplayPhoto(previewImage.buffersToSend, chatId),
      setChangingPhoto,
      async res => {
        const { chatId: returnedChatId, notifyingMessage, newPhoto, chatRevision } = res.data;
        setChatInfo(prev => ({ ...prev, displayPhoto: newPhoto }));
        const okToProcessResult = await determineOkToProcess(returnedChatId, chatRevision);
        if (okToProcessResult.okToProcess) {
          dispatch(updateGroupChatPhoto({ updatedDisplayPhoto: newPhoto, chatRevision, chatId: returnedChatId }));
          dispatch(udpateCurrentChatPhoto({ updatedDisplayPhoto: newPhoto, chatId: returnedChatId, chatRevision }));
          idb.updateChatDisplayPhoto(returnedChatId, newPhoto, chatRevision);
        }

        const notifyingMessageToUse = { ...notifyingMessage, deviceTime: Date.now() }
        dispatch(addLastMessageWithoutUnreadIncrement(notifyingMessageToUse));
        dispatch(addMessage(notifyingMessageToUse));
        await idb.addNewMessage(notifyingMessageToUse);
        setPreviewImage(null);
      },
      alert
    )
  }

  const deleteGroupChat = () => {
    requestHandler(
      async () => await deleteGroupChatApi(chatId),
      setDeletingGroup,
      async res => {
        const { chatRevision } = res.data;
        const okToProcessResult = await determineOkToProcess(chatId, chatRevision, true);
        if (okToProcessResult.okToProcess) {
          dispatch(declareAChatDeleted({ chatId, chatRevision }));
          idb.declareAChatDeleted(chatId, chatRevision);
        } else {
          dispatch(declareAChatDeleted({ chatId }));
          idb.declareAChatDeleted(chatId);
        }

        dispatch(resetCurrentChat(chatId));
        setShowChatDetails(false);
        navigate("/chats");
      },
      alert
    );
  }

  const leaveGroupChat = () => {
    requestHandler(
      async () => await leaveGroupChatApi(chatId),
      setDeletingGroup,
      async res => {
        const { chatRevision } = res.data;
        const okToProcessResult = await determineOkToProcess(chatId, chatRevision);

        if (okToProcessResult.okToProcess) {
          dispatch(exitMemberFromGroupChat({ chatId, chatRevision }));
          dispatch(exitMemberFromChatIfCurrent({ chatId, chatRevision }))
          idb.exitMemberFromGroupChat(chatId, chatRevision);
        } else {
          dispatch(exitMemberFromGroupChat({ chatId }));
          dispatch(exitMemberFromChatIfCurrent({ chatId }))
          idb.exitMemberFromGroupChat(chatId);
        }

        setShowChatDetails(false);
        setChatUnavailable(true);
      },
      alert
    )
  }

  useRenderFetch(
    getChatInfo,
    setIsLoading,
    res => {
      const { data } = res;
      if (!data.isGroupChat) {
        const userInChat = (data.participants.filter(p => p._id.toString() !== account?._id.toString()))[0];
        setChatInfo({
          _id: userInChat._id,
          isGroupChat: false,
          displayPhoto: userInChat.avatar,
          name: userInChat.fullName,
          lastOnline: userInChat.lastOnline
        })
      } else {
        setChatInfo(data);
      }
    },
    alert,
    [chatId],
    [chatId]
  );


  useEffect(() => {
    if (groupInfo?.notifyingMessage && (chatId === groupInfo.chat._id.toString())) {
      setChatInfo(groupInfo.chat);
      // remove the key notifyingMessage to prevent this effect from triggering
      dispatch(removeNofifyingMessage());
    }
  }, [groupInfo, chatId]);


  useEffect(() => {
    //to revoke the object url on previewImage change or unmount
    return () => {
      if (previewImage?.localImageUrl) {
        URL.revokeObjectURL(previewImage.localImageUrl);
      }
    }
  }, [previewImage]);

  useEffect(() => {
    // to clear the previewImage when chat changes
    setPreviewImage(null);
  }, [chatId]);


  return (
    <div className='h-full flex-1 flex flex-col relative'>

      <div className='flex gap-4 items-center p-3'>
        <ChevronLeftIcon
          onClick={() => setShowChatDetails(false)}
          className='text-base-content stroke-2 size-7 my-auto mx-1 cursor-pointer hover:scale-110 active:scale-100 active:brightness-90' />
        <p className="flex-1 text-center text-md">
          {chatInfo?.isGroupChat ? "Group Info" : "Contact Info"}
        </p>

      </div>
      <>

        {/* content or body */}
        {isLoading ? (

          <div className="m-auto loading loading-bars loading-xl text-accent"></div>

        ) : (previewImage || compressingLoader) ? (

          <div className='lg:h-72 sm:h-30 border-base-300 border-2 rounded-md m-auto relative'>

            {compressingLoader ? (

              <div className='absolute inset-0'>
                <LoadingCircle type={compressingLoader.type} progress={compressingLoader.progress} />
              </div>

            ) : (

              <>
                <img
                  className='w-full h-full aspect-square object-cover rounded-md'
                  src={previewImage.localImageUrl || "/assets/batman-avatar.png"} alt="" />
                <button
                  disabled={changingPhoto}
                  onClick={updateGroupDisplayPhoto}
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
            <div className={`px-8 flex-1 flex items-center gap-8 ${previewImage && "justify-center"}`}>
              <input
                ref={displayPhotoInputRef}
                type="file"
                hidden
                accept="image/png, image/jpeg, image/jpg, image/bmp, image/gif, image/tiff, image/svg+xml, image/webp"
                onChange={onImageChange}
              />
              <div className='lg:h-72 sm:h-30 w-fit border-base-300 border-2 rounded-md relative'>
                <img
                  className='w-full h-full aspect-square object-cover rounded-md'
                  src={
                    chatInfo?.displayPhoto?.url ? (
                      `${import.meta.env.VITE_SERVER_URI}/chats/getdp/${chatInfo.displayPhoto.url}_${AvatarSize.LG}`
                    ) : chatInfo?.displayPhoto?.ssoUrl ? (
                      chatInfo.displayPhoto.ssoUrl
                    ) : (
                      "/assets/batman-avatar.png"
                    )}
                  alt="" />
                {(chatInfo?.isGroupChat && (chatInfo.admin?._id?.toString() === account?._id.toString())) && (
                  <button
                    onClick={() => displayPhotoInputRef.current.click()}
                    className="absolute cursor-pointer bottom-1 right-1 p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 bg-accent">
                    <PencilIcon className='size-5 text-base-100' />
                  </button>
                )}
              </div>

              <div className='text-md flex-1'>
                <div className='mb-5'>
                  {editName ? (
                    <div className='flex items-center gap-3 h-9'>
                      {chatInfo.isGroupChat && (
                        <>
                          <button
                            onClick={() => setEditName(false)}
                            className='border-2 aspect-square rounded-md h-full cursor-pointer hover:scale-110 active:scale-100 active:brightness-90'>
                            <XMarkIcon className='size-6 m-auto text-base-content' />
                          </button>
                          <InputBar
                            placeholder='Enter the new name for group'
                            value={newChatName}
                            onChange={e => setNewChatName(e.target.value)}
                            className='text-md h-9 flex-1'
                          />
                          <button
                            onClick={changeGroupName}
                            disabled={!newChatName.trim() || (newChatName.trim() === chatInfo?.name) || changingName}
                            className={`aspect-square rounded-md h-full transition ${(!newChatName.trim() || (newChatName.trim() === chatInfo?.name)) ? "bg-neutral" : "cursor-pointer hover:scale-110 active:scale-100 active:brightness-90 bg-accent"}`}>
                            {changingName ? (
                              <span className="m-auto loading loading-ring loading-md text-base-100"></span>
                            ) : (
                              <CheckIcon size='25' color="var(--color-base-100)" className="m-auto" />
                            )}
                          </button>

                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className='text-2xl font-semibold mb-2 inline text-wrap'>
                        {chatInfo?.name}
                      </p>
                      {(chatInfo?.isGroupChat && (chatInfo.admin?._id?.toString() === account?._id.toString())) && (
                        <button
                          onClick={openGroupNameEditor}
                          className="cursor-pointer ml-4 p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 bg-accent">
                          <PencilIcon className='size-4 text-base-100' />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {!chatInfo?.isGroupChat ? (
                  <p>
                    {(chatInfo?.otherParticipantId === otherUserPresence.id) ? (
                      <>
                        {(otherUserPresence.online === ChatStatusEnum.ONLINE) ? (
                          "Online"
                        ) : otherUserPresence.lastSeen ? (
                          `Last Online: ${userInfoTimestampGenerator(otherUserPresence.lastSeen)}`
                        ) : ""}
                      </>
                    ) : ""}

                  </p>

                ) : (
                  <>
                    <p>
                      Total members: {chatInfo.participants?.length}
                      <button
                        onClick={openParticipantList}
                        className='text-accent ml-4 cursor-pointer'>
                        (View all members)
                      </button>

                    </p>
                    <p>
                      Admin: {chatInfo.admin.fullName}
                    </p>
                  </>
                )}
              </div>
            </div>

            {chatInfo?.isGroupChat && (
              <div className='ml-auto w-fit'>
                <button
                  onClick={() => setShowDeleteConfirmation(true)}
                  className='rounded-md m-4 border-2 border-base-300 px-2 py-1 text-error flex items-center gap-3 hover:scale-110 active:scale-100 active:brightness-80 transition'>
                  {(chatInfo?.isGroupChat && (chatInfo?.admin._id?.toString() === account?._id.toString())) ? (
                    <>
                      <TrashIcon className='size-5' />
                      Delete this group
                    </>
                  ) : (
                    <>
                      <LogoutIcon size="20" color="var(--color-error)" />
                      Leave this group
                    </>
                  )}
                </button>
              </div>
            )}


          </>
        )}

      </>

      {showDeleteConfirmation && (

        <div className="absolute inset-0 backdrop-blur-lg bg-base-200/40 flex items-center justify-center">
          <div className='border-2 border-base-300 rounded-md bg-base-100 p-5 relative'>


            <p className='text-base-content text-center text-lg'>
              {chatInfo?.isGroupChat && (chatInfo?.admin._id?.toString() === account?._id.toString()) ? (
                "Are you sure you want to delete this chat group?"
              ) : (
                "Are you sure you want to leave this group?"
              )}
            </p>
            <p className='text-center text-base-content/70 text-md'>
              {chatInfo?.isGroupChat && (chatInfo?.admin._id?.toString() === account?._id.toString()) ? (
                "(All of the media and chats will also be deleted permanently)"
              ) : (
                "(You will permanently lose access to this group)"
              )}
            </p>
            <div className='flex justify-between mt-8'>
              <button
                onClick={() => setShowDeleteConfirmation(false)}
                className='border-2 border-base-300 rounded-md text-base-content mr-auto px-2 py-0.5 cursor-pointer hover:scale-110 active:scale-100 active:brightness-75'>Cancel</button>
              <button
                onClick={
                  (chatInfo?.admin._id?.toString() === account?._id.toString()) ? (
                    deleteGroupChat
                  ) : (
                    leaveGroupChat
                  )
                }
                className='border-2 bg-error rounded-md text-base-100 ml-auto px-2 py-0.5 cursor-pointer hover:scale-110 active:scale-100 active:brightness-75'>Yes</button>
            </div>

            {deletingGroup && (
              <div className="absolute inset-0 bg-base-100 rounded-md flex flex-col items-center justify-center">
                <p className='mb-2 animate-pulse'>
                  {(chatInfo?.admin._id?.toString() === account?._id.toString()) ? (
                    "Deleting..."
                  ) : (
                    "Leaving..."
                  )
                  }
                </p>
                <div className="loading loading-bars loading-xl text-error"></div>

              </div>
            )}
          </div>
        </div>

      )}

    </div>
  )
}

export default ChatDetails
