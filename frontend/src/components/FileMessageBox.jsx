import { useEffect, useState } from "react";
import { truncateString } from "../utils"
import { LoadingCircle } from "./LoadingCircle";
import ArrowDownTrayIcon from "@heroicons/react/24/outline/ArrowDownTrayIcon";
import Timestamp from "./Timestamp";
import { downloadFileToDevice } from "../api";
import DocumentTextIcon from "@heroicons/react/24/outline/DocumentTextIcon";
import { progressUpdater } from "../api/progressUpdater";

export const FileMessageBox = ({ message, isSender }) => {

  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (message.notSent && !message.failedToSend) {
      progressUpdater.setUpdaterByMode(message._id, setUploading, 'upload');
    }

    return () => {
      if (message.notSent && !message.failedToSend) {
        progressUpdater.removeUpdaterByMode(message._id, 'upload');
      }
    }

  }, [message.notSent, message.failedToSend]);


  return (
    <div className='flex items-center px-2 py-3 gap-3 relative'>
      <DocumentTextIcon className='size-8' />
      <p className='py-3 rounded-md'>
        {truncateString(message.attachmentName, 50, true)}
      </p>
      {(message.notSent && uploading) ? (
        <LoadingCircle size='2' type={uploading?.type} progress={uploading?.value} lightTheme={isSender} />
      ) : (
        <button
          onClick={() => downloadFileToDevice(message?.attachmentName)}
          className={`cursor-pointer rounded-md border-2 hover:scale-110 active:scale-100 active:brightness-90 transition ${isSender ? "border-base-300/70" : "border-base-content/70"} p-1`}>
          <ArrowDownTrayIcon className='w-4 stroke-2' />
        </button>
      )}
      <Timestamp isSender={isSender} message={message} />
    </div>
  )
}
