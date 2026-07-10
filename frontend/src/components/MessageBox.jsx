import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
//icons
import TrashIcon from '@heroicons/react/24/outline/TrashIcon';
import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';
//constants
import { MessageTypes } from '../constants';
//utils
import { requestHandler } from '../utils';
import { deleteFile, deleteMessage as deleteMessageApi } from '../api';
//components
import ImageMessageBox from './ImageMessageBox';
import Avatar from './Avatar';
import Timestamp from './Timestamp';
import { messageElements } from '../utils/messagePurger';
import { ErrorIconMessageBox } from '../assets/icons';
import { updateLastMessageToDeletedInCurrentChat } from '../store/chatsSlice';
import { markMessageDeleted } from '../store/messagesSlice';
import { FileMessageBox } from './FileMessageBox';
import AudioPlayer from './AudioPlayer';
import { idb } from '../indexedDB';


function MessageBox({ message, index }) {
  const account = useSelector(state => state.auth.account);
  const [showMenuIcon, setShowMenuIcon] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const messageBoxRef = useRef(null);
  const dispatch = useDispatch();
  const currentChat = useSelector(state => state.currentChat);

  const isSender = (message.sender?._id?.toString() === account?._id.toString());
  const isGroupChat = currentChat?.isGroupChat;

  const { VOICE, FILE, TEXT, DELETED, IMAGE, ...infoMessageTypes } = MessageTypes;
  const isInfoMessage = (Object.values(infoMessageTypes)).includes(message.messageType);



  const deleteMessage = () => {
    if (!message?._id) return;

    requestHandler(
      async () => {
        if (message.messageType === MessageTypes.TEXT) {
          return await deleteMessageApi(message._id.toString(), message.chat);
        } else {
          return await deleteFile(message._id.toString(), message.chat, message.messageType, message.attachmentName);
        }
      },
      setIsDeleting,
      () => {
        dispatch(markMessageDeleted({ messageId: message._id, chatId: message.chat }));
        dispatch(updateLastMessageToDeletedInCurrentChat({ messageId: message._id, chatId: message.chat }));
        idb.deleteMessageForEveryone({ deletedMessageId: message._id, deletedMessageChat: message.chat, deletedMessageSender: message.sender._id });
      },
      alert
    )

  }

  const setMessageElementRef = useCallback((node) => {
    if (node) messageElements.set(index, node.parentNode);
    else messageElements.delete(index);
  }, [index]);




  useEffect(() => {
    const handleMouseEnter = (e) => {
      setShowMenuIcon(true);
    }

    const handleMouseLeave = (e) => {
      setShowMenuIcon(false)
    }

    messageBoxRef.current?.addEventListener("mouseenter", handleMouseEnter);
    messageBoxRef.current?.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      messageBoxRef.current?.removeEventListener("mouseover", handleMouseEnter);
      messageBoxRef.current?.removeEventListener("mouseleave", handleMouseLeave);
    }
  }, []);


  if (currentChat) {
    return (
      <>
        {isInfoMessage ? (
          <div className='mx-auto max-w-xl w-fit text-md bg-neutral px-2 py-1 rounded-md'
            ref={setMessageElementRef}>
            {message?.content || "info message"}
          </div>

        ) : (

          <div
            className={`max-w-xl w-fit text-base-content ${isSender ? "ml-auto" : "mr-auto flex items-end get-this"}`} ref={setMessageElementRef}>

            {(!isSender && isGroupChat) && (
              <Avatar
                className='h-5 ml-3'
                dp={currentChat.userProfilesObject?.[message.sender._id]?.avatar}
              />
            )}

            {(isSender && message.failedToSend) && (

              <ErrorIconMessageBox
                size="17" color="var(--color-error)"
                className='w-5 ml-3'
              />
            )}

            <>
              {(message.messageType === MessageTypes.DELETED) ? (
                <div className={`p-1 mx-3 text-sm rounded-md ${isSender ? "bg-base-content text-base-100" : "bg-neutral"}`}>
                  <p className={`flex items-center py-1 px-2 italic ${isSender ? "text-gray-700" : "text-gray-400"}`}>
                    <span>
                      <TrashIcon className='size-4 mr-2' />
                    </span>
                    This message has been deleted
                  </p>
                </div>

              ) : (message.messageType === MessageTypes.IMAGE) ? (

                <div className={`p-1 mx-3 text-md rounded-md ${isSender ? "bg-base-content text-base-100" : "bg-neutral"}`}>
                  <ImageMessageBox message={message} isSender={isSender} />
                </div>

              ) : (

                <div
                  ref={messageBoxRef}
                  className={`mx-3 text-md rounded-md relative ${isSender ? "bg-base-content text-base-100" : "bg-neutral"}`}>

                  <div className={`transition p-1 rounded-md h-full ${(message._id && showMenuIcon && isSender) ? "bg-gradient-to-bl from-neutral-800/30 to-transparent" : "bg-transparent"}`}>
                    {(message._id && isSender) && (
                      <>
                        <div
                          className={`absolute top-1 right-1 w-fit transition ${showMenuIcon ? "opacity-100 translate-x-0" : "opacity-0 translate-x-5"}`}>
                          <ChevronDownIcon className={`z-10 text-base-content size-4 stroke-2 hover:scale-110 active:brightness-75 active:scale-100 transition ${isSender ? "text-neutral/70" : "text-base-content/70"}`} />

                        </div>

                        <div
                          className={`z-20 w-fit absolute top-1 right-1 dropdown dropdown-center ${isSender ? "dropdown-left" : "dropdown-right"}`} >
                          <div
                            tabIndex={0} role="button">
                            <ChevronDownIcon className="text-transparent size-4 stroke-2 cursor-pointer" />
                          </div>
                          <ul tabIndex={0} className="dropdown-content text-error font-medium menu bg-base-100 border-[1px] border-base-content/20 rounded-box z-1 w-52 p-1 shadow-sm text-md">
                            <li
                              className='border-[1px] rounded-md border-base-100 hover:border-accent/50'
                              onClick={deleteMessage}
                            ><a><TrashIcon
                              className={`m-auto size-6 transition h-full ${isDeleting && "animate-pulse"}`}
                            />{isDeleting ? "Deleting..." : "Delete"}</a></li>
                          </ul>
                        </div >
                      </>
                    )}


                    {(message.messageType === MessageTypes.TEXT) ? (
                      <p className='px-2 relative'>
                        {message.content}
                        <Timestamp isSender={isSender} message={message} />
                      </p>

                    ) : (message.messageType === MessageTypes.FILE) ? (
                      <FileMessageBox message={message} isSender={isSender} />
                    ) : (

                      <AudioPlayer isSender={isSender} message={message} />

                    )}
                  </div>

                </div>
              )}
            </>
          </div>
        )}
      </>
    )
  }
}

export default MessageBox;



{/* <div className={`transition p-1 rounded-md h-full ${showMenuIcon && isSender ? "bg-gradient-to-bl from-neutral-800/30 to-transparent" : !isSender ? "bg-gradient-to-bl from-base-content/10 to-transparent" : "bg-transparent"}`}> */ }
