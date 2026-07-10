import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux';
import Timestamp from './Timestamp';
import { setExpandedImage } from '../store/expandedImageSlice';
import ArrowDownTrayIcon from '@heroicons/react/24/outline/ArrowDownTrayIcon';
import { downloadMediaToView, requestHandler } from '../utils';
import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';
import TrashIcon from '@heroicons/react/24/outline/TrashIcon';
import { deleteFile } from '../api';
import { updateLastMessageToDeletedInCurrentChat } from '../store/chatsSlice';
import { markMessageDeleted } from '../store/messagesSlice';
import { idb } from '../indexedDB';
import { progressUpdater } from '../api/progressUpdater';
import { LoadingCircle } from './LoadingCircle';

function ImageMessageBox({ message, isSender }) {
  const dispatch = useDispatch();
  const [downloading, setDownloading] = useState(null);
  const [uploading, setUploading] = useState(null);
  const imageBoxRef = useRef(null);
  const [showMenuIcon, setShowMenuIcon] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loaderToShow = uploading || downloading;

  const downloadImage = async () => {
    if (!message._id) return;
    await downloadMediaToView(message._id.toString(), message.messageType, message.attachmentName);
  }

  const deleteMessage = () => {
    if (!message._id) return;

    requestHandler(
      async () => await deleteFile(message?._id?.toString(), message?.chat, message?.messageType, message?.attachmentName),
      setIsDeleting,
      () => {
        dispatch(markMessageDeleted({ messageId: message._id, chatId: message.chat }));
        dispatch(updateLastMessageToDeletedInCurrentChat({ messageId: message._id, chatId: message.chat }))
        idb.deleteMessageForEveryone({ deletedMessageId: message._id, deletedMessageChat: message.chat, deletedMessageSender: message.sender._id })
      },
      alert
    );

  }

  useEffect(() => {
    if (message.notSent && !message.failedToSend) {
      progressUpdater.setUpdaterByMode(message._id, setUploading, 'upload');
    }
    if (!message.blobUrl) {
      progressUpdater.setUpdaterByMode(message._id, setDownloading, 'download');
    }


    return () => {
      if (message.notSent && !message.failedToSend) {
        progressUpdater.removeUpdaterByMode(message._id, 'upload');
      }
      if (!message.blobUrl) {
        progressUpdater.removeUpdaterByMode(message._id, 'download')
      }
    }

  }, [message.notSent, message.failedToSend, message.blobUrl]);


  useEffect(() => {

    return () => {
      if (message?.blobUrl) {
        URL.revokeObjectURL(message?.blobUrl);
      }
    }
  }, [message?.blobUrl]);


  useEffect(() => {
    const handleMouseEnter = (e) => {
      setShowMenuIcon(true);
    }

    const handleMouseLeave = (e) => {
      setShowMenuIcon(false)
    }

    imageBoxRef.current?.addEventListener("mouseenter", handleMouseEnter);
    imageBoxRef.current?.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      imageBoxRef.current?.removeEventListener("mouseover", handleMouseEnter);
      imageBoxRef.current?.removeEventListener("mouseleave", handleMouseLeave);
    }
  }, []);

  return (
    <div className='max-w-3xs relative'>
      <div
        ref={imageBoxRef}
        onClick={() => ((message?.blobUrl && message._id) && dispatch(setExpandedImage(message?.blobUrl)))}
        className='aspect-square relative w-3xs'>
        {!message?.blobUrl ? (
          <div className='h-full w-full bg-neutral rounded-md'></div>
        ) : (
          <img src={message.blobUrl} className="cursor-pointer h-full w-full object-cover rounded-md" alt="" />
        )}
        <div className='absolute bottom-0 right-0 h-1/12 w-full bg-gradient-to-t from-black/50 to-transparent'></div>
        {(!message?.blobUrl || !message._id || message.notSent) && (
          <>

            <div className='absolute inset-0 w-full h-full bg-radial from-black/50 to-transparent flex items-center justify-center'>
              {(loaderToShow || !message._id) ? (
                <LoadingCircle type={loaderToShow.type} progress={loaderToShow.value} />
              ) : (
                <ArrowDownTrayIcon
                  onClick={downloadImage}
                  className='size-10 stroke-2 text-base-content hover:scale-110 hover:text-accent active:scale-100 active:brightness-90 z-10' />
              )}
            </div>
          </>
        )}

        {(message._id && isSender) && (
          <>
            <div className={`cursor-pointer absolute inset-0 transition rounded-md ${showMenuIcon ? "opacity-100" : "opacity-0"} bg-gradient-to-bl from-neutral-800/30 to-transparent`}>
              <div
                className={`ml-auto mt-1 mr-1 w-fit transition ${showMenuIcon ? "pointer-events-auto opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-5"}`}>

                <ChevronDownIcon
                  className={`text-base-content size-4 stroke-2 hover:scale-110 active:brightness-75 active:scale-100 transition text-base-70`} />
              </div>
            </div>
            <div
              onClick={e => e.stopPropagation()}
              className='absolute top-1 right-1 w-fit'>
              <div className="dropdown dropdown-bottom dropdown-end">
                <div
                  tabIndex={0} role="button">
                  <ChevronDownIcon
                    className="text-transparent size-4 cursor-pointer" />
                </div>
                <ul tabIndex={0} className="dropdown-content text-error font-medium menu bg-base-100 border-[1px] border-base-content/20 rounded-box z-1 w-52 p-1 shadow-sm text-md">
                  <li
                    className='border-[1px] rounded-md border-base-100 hover:border-accent/50'
                    onClick={deleteMessage}
                  ><a><TrashIcon
                    className={`m-auto size-6 transition h-full ${isDeleting && "animate-pulse"}`}
                  />{isDeleting ? "Deleting..." : "Delete"}</a></li>
                </ul>
              </div>
            </div>
          </>

        )}

      </div>

      <p className='break-words'>
        {message.content}
        <Timestamp
          isSender={isSender}
          message={message}
          className='pb-1 text-base-content'
          brightTimeColor={!message.content}
        />

      </p>

    </div >
  )
}

export default ImageMessageBox
