//react
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom';
import { addMessageToMessageSlice } from '../store/thunks';
import { useDispatch, useSelector } from 'react-redux';
import { addLastMessageWithoutUnreadIncrement } from '../store/chatsSlice';
//icons
import PaperClipIcon from '@heroicons/react/24/outline/PaperClipIcon';
import FaceSmileIcon from '@heroicons/react/24/outline/FaceSmileIcon';
import MicrophoneIcon from '@heroicons/react/24/outline/MicrophoneIcon';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import PhotoIcon from '@heroicons/react/24/outline/PhotoIcon';
import DocumentTextIcon from '@heroicons/react/24/outline/DocumentTextIcon';
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon';
//components
import { MyEmojiPicker } from './MyEmojiPicker';
import RecordingBar from './RecordingBar';
//services
import { requestHandler, truncateString } from '../utils';
import { sendMessageForUnverifiedChat, uploadFile } from '../api';
import { ObjectId } from 'bson';
import { idb } from '../indexedDB';
import { retrySender } from '../utils/retrySender';
import { ChatEventEnum, MessageTypes, STOP_TYPING_TIMER_DURATION, TYPING_EVENT_SPACING_DURATION } from '../constants';
import { socketInstance as socket } from '../socket-client';
import { onFailedToSend } from '../utils/notificationHandlers';
import { progressUpdater } from '../api/progressUpdater';
import { replaceBlobUrlForMessage } from '../store/messagesSlice';

function ChatFooter({ image, setImage }) {
  //useState(s)
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [changeIndicator, setChangeIndicator] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceData, setVoiceData] = useState(null);

  //useRef(s)
  const textInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiSearchRef = useRef(null);
  const filePickerRef = useRef(null);
  const imagePickerRef = useRef(null);
  const stopTypingSendTriggerTimerRef = useRef(null);
  const typingSendWaitTimeoutRef = useRef(null);
  const canSendTypingRef = useRef(true);

  const dispatch = useDispatch();
  const account = useSelector(state => state.auth.account);
  const currentChat = useSelector(state => state.currentChat);

  const { chatId } = useParams();


  // text message sending function
  const sendTextMessage = async (e) => {
    e.preventDefault();
    if (input.trim().length === 0) return;
    try {
      const payloadToSend = {
        _id: new ObjectId().toString(),
        content: input,
        chat: chatId,
      }

      const messageToStore = {
        ...payloadToSend,
        notSent: 1,
        sender: account?._id,
        messageType: MessageTypes.TEXT,
        deviceTime: Date.now()
      }

      await idb.addNewMessage(messageToStore);

      if (currentChat.notVerified) {
        requestHandler(
          async () => sendMessageForUnverifiedChat({ messagePayload: payloadToSend, receiverId: currentChat.otherParticipantId, chatCreationTime: currentChat.createdAt }),
          null,
          null,
          console.log
        )
      } else {
        socket.emit(ChatEventEnum.SEND_MESSAGE, payloadToSend);
      }

      sendStopTyping(true);

      if (!currentChat.notVerified) {
        retrySender.addToSet(payloadToSend._id);
      }

      dispatch(addMessageToMessageSlice(messageToStore));

      dispatch(addLastMessageWithoutUnreadIncrement(messageToStore));
      setInput("");
      setSending(true);
      setTimeout(() => setSending(false), 400);
    } catch (error) {
      console.log("error occured while sending message: ", error)
    }

  }


  //emoji functions
  const handleEmojiPickerToggle = () => {
    setShowEmojiPicker(!showEmojiPicker);

    if (!showEmojiPicker) {
      emojiSearchRef.current.focus();
    }
  }

  const handleEmojiSelect = (emoji) => {
    const textInput = textInputRef.current?.value;
    const cursorInput = textInputRef.current?.selectionStart;
    const textBeforeCursor = textInput.substring(0, cursorInput);
    const textAfterCursor = textInput.substring(cursorInput);
    setInput(textBeforeCursor + emoji.emoji + textAfterCursor);
    setCursorPos(textBeforeCursor.length + emoji.emoji.length);
    setChangeIndicator(!changeIndicator);
    textInputRef.current?.focus();
  }

  const typingEventDebouncer = () => {
    // clear and restart the timer for stop typing
    if (stopTypingSendTriggerTimerRef.current) {
      clearTimeout(stopTypingSendTriggerTimerRef.current);
      stopTypingSendTriggerTimerRef.current = null;
    }

    stopTypingSendTriggerTimerRef.current = setTimeout(() => {
      // fires stop typing event
      sendStopTyping();

    }, STOP_TYPING_TIMER_DURATION);

    // do nothing else if timer hasnt elapsed
    if (!canSendTypingRef.current) return;

    socket?.emit(ChatEventEnum.TYPING_EVENT, chatId);
    canSendTypingRef.current = false;

    if (typingSendWaitTimeoutRef.current) {
      clearTimeout(typingSendWaitTimeoutRef.current);
    }

    // can send typing events after the spacing duration elapses
    typingSendWaitTimeoutRef.current = setTimeout(() => {
      canSendTypingRef.current = true;
      typingSendWaitTimeoutRef.current = null;
    }, TYPING_EVENT_SPACING_DURATION);
  }

  const sendStopTyping = (clearTimeoutForStopTypingRef) => {
    if (clearTimeoutForStopTypingRef) {
      clearTimeout(stopTypingSendTriggerTimerRef.current);
    }

    socket?.emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);

    //enables canSendTyping
    canSendTypingRef.current = true;
    stopTypingSendTriggerTimerRef.current = null;
  }

  const onTextInputChange = e => {
    setInput(e.target.value);

    typingEventDebouncer();
  }

  // on selecting a file or image from the device
  const onFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setImage(null);
      setInput("");
    }
  }

  const onImageChange = (e) => {
    if (e.target.files[0]) {
      //create a local object url for the image on browser
      setImage({ bufferToSend: e.target.files[0] });
      setFile(null);
      setInput("");
    }
  }

  // to send file or image
  const sendFileMessage = async (e, fileType) => {
    if (e) {
      e.preventDefault();
    }

    const messageId = new ObjectId().toString();

    const extensionName = file?.name?.split(".").pop() || "";
    const attachmentName = (fileType === MessageTypes.VOICE) ? `${messageId}_voice.mp3` : (fileType === MessageTypes.IMAGE) ? `${messageId}_image.webp` : `${messageId}_file.${extensionName}`;
    const fileBlob = (fileType === MessageTypes.VOICE) ? voiceData.recordedBlob : (fileType === MessageTypes.IMAGE) ? image.bufferToSend : file;

    const payloadToSend = {
      _id: messageId,
      content: input,
      chat: chatId,
    }

    if (fileType === MessageTypes.VOICE) {
      payloadToSend.audioDuration = voiceData.duration;
    }

    const messageToStore = {
      ...payloadToSend,
      notSent: 1,
      sender: account?._id,
      messageType: fileType,
      deviceTime: Date.now(),
      attachmentName,
    }


    let tempUrl;
    if ((fileType !== MessageTypes.VOICE) && (fileType !== MessageTypes.IMAGE)) {
      dispatch(addMessageToMessageSlice(messageToStore));

    } else {
      if (fileType === MessageTypes.VOICE) {
        tempUrl = URL.createObjectURL(voiceData.recordedBlob);
      } else {
        tempUrl = URL.createObjectURL(fileBlob);
      }
      dispatch(addMessageToMessageSlice({
        ...messageToStore, blobUrl: tempUrl
      }));
    }

    dispatch(addLastMessageWithoutUnreadIncrement(messageToStore));
    setImage(null);
    setInput("");
    setVoiceData(null)
    setFile(null);

    await idb.addNewMessage(messageToStore);

    progressUpdater.updateProgress({ type: 'spinner' }, messageId, 'upload')

    if ((fileType === MessageTypes.IMAGE) || (fileType === MessageTypes.VOICE)) {
      await idb.setMedia(messageToStore.attachmentName, fileBlob);
    }


    requestHandler(
      async () => uploadFile(payloadToSend, fileBlob, fileType),
      null,
      null,
      () => onFailedToSend({ failedMessageId: messageToStore._id })
    );


    if ((fileType === MessageTypes.IMAGE) || (fileType === MessageTypes.VOICE)) {
      const storedBlob = await idb.getMedia(messageToStore.attachmentName);


      if (storedBlob?.result?.mediaBlob) {
        const newBlobUrl = URL.createObjectURL(storedBlob.result.mediaBlob);
        dispatch(replaceBlobUrlForMessage({ messageId, newBlobUrl }));
      }
      URL.revokeObjectURL(tempUrl);
      imagePickerRef.current.value = '';

    } else {
      filePickerRef.current.value = '';
    }

    // in the end, revoke the url if it was an image and at the same time swap the message bloburl
    // see if this works well. if not, try to make something else. something else can be just keeping the url there until we have 
  }


  const cancelFileSend = (fileType) => {
    setInput("");
    fileType === MessageTypes.FILE ? setFile(null) : setImage(null);

    if ((fileType === MessageTypes.FILE) && filePickerRef.current) {
      filePickerRef.current.value = '';
    }

    if ((fileType === MessageTypes.IMAGE) && imagePickerRef.current.value) {
      imagePickerRef.current.value = '';
    }
  }

  //recording function(s)
  const initializeRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
    }
  }




  // useEffects
  // to focus on input when the component mounts/chatId changes
  useEffect(() => {
    const focusOnInputTimer = setTimeout(() => {
      textInputRef?.current?.focus();
    }, 500);

    return () => {
      clearTimeout(focusOnInputTimer);
    }
  }, [chatId]);

  // to be able to send typing events when the chat first opens
  useEffect(() => {
    canSendTypingRef.current = true;
  }, [chatId]);

  // to set the cursor position in the input field after picking an emoji
  useEffect(() => {
    if (textInputRef.current) {
      textInputRef.current.selectionStart = cursorPos;
      textInputRef.current.selectionEnd = cursorPos;
    }
  }, [changeIndicator]);

  // to send stop typing event before exiting chat if the typing state is on
  useEffect(() => {
    return () => {
      if (stopTypingSendTriggerTimerRef.current && !canSendTypingRef.current) {
        sendStopTyping(true);
      }
    }
  }, [chatId]);

  // to close emoji picker when clicked outside the picker
  useEffect(() => {
    let handleOutsideClick = (e) => {

      if (emojiPickerRef.current && !emojiPickerRef.current?.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, []);

  // to send the voice message when it is set by the RecordingBar
  useEffect(() => {
    if (voiceData) {
      sendFileMessage(null, MessageTypes.VOICE);
    }
  }, [voiceData]);

  useEffect(() => {
    //to make sure these values reset on switching to another chat
    return () => {
      setIsRecording(false);
      setImage(null);
      setVoiceData(null);
      setFile(null);
      setShowEmojiPicker(false);
    }
  }, [chatId]);


  if (!currentChat || currentChat.notAMember || currentChat.isDeleted) {
    return (
      <>
        {currentChat && (
          <div className='border-t-2 border-base-300 backdrop-blur-xl bg-base-100/85 relative text-base-content/85 italic py-3 px-3 text-center'>
            {!currentChat ? " " : currentChat.notAMember ? "You are no longer a member of this group" : "This chat has been deleted"}
          </div>
        )}
      </>
    )
  } else {
    return (
      <div className='border-t-2 border-base-300 backdrop-blur-xl bg-base-100/85 relative z-10'>
        {isRecording ? (
          <>
            <RecordingBar setVoiceData={setVoiceData} isRecording={isRecording} setIsRecording={setIsRecording} />
          </>
        ) : file ? (
          <div className='flex gap-6 px-2 py-3 items-center justify-between'>
            <button
              onClick={() => cancelFileSend(MessageTypes.FILE)}
              className='ml-2 border-[1px] border-error p-0.5 rounded-md cursor-pointer hover:scale-110 active:scale-100 active:brightness-90'>
              <XMarkIcon className='size-3 text-error ' />
            </button>
            <DocumentTextIcon className='size-8' />
            <p className='text-md flex-1'>
              {truncateString(file?.name, 70, true)}
            </p>
            <form className="flex items-center" onSubmit={e => sendFileMessage(e, MessageTypes.FILE)}>
              <button className='cursor-pointer' type="submit">
                <ArrowUpIcon
                  className="size-7 stroke-2 hover:scale-110 active:scale-100 active:brightness-90 text-accent ml-8" />
              </button>

            </form>
          </div>

        ) : (

          <>
            <div className='flex gap-2 px-2 h-12 items-center'>
              <div className='flex flex-row gap-2 px-1.5'>
                {!image ? (
                  <div className="dropdown dropdown-top p-0">
                    <div tabIndex={0} role="button" className="p-0 border-0 cursor-pointer focus:border-0">
                      <PaperClipIcon

                        className='size-6 hover:scale-110 active:scale-100 active:brightness-90 text-base-content'
                      />
                    </div>
                    <ul tabIndex={0} className="-translate-3 dropdown-content text-base-content font-medium menu bg-base-100 active:bg-base-100 border-[1px] border-base-content/20 rounded-box z-1 w-52 shadow-sm text-md">
                      <li><a
                        onClick={() => imagePickerRef.current?.click()}
                        className='transition hover:scale-110 hover:text-accent/90 active:brightness-90 active:scale-100 bg-transparent hover:bg-transparent active:!bg-transparent active:!text-accent/90 '>
                        <PhotoIcon className='size-7' />
                        Image
                      </a></li>
                      <li><a
                        onClick={() => filePickerRef.current?.click()}
                        className='transition hover:scale-110 hover:text-accent/90 active:brightness-90 active:scale-100 hover:bg-transparent active:!bg-transparent active:!text-accent/90'><DocumentTextIcon className='size-7' />
                        Document
                      </a></li>
                    </ul>
                  </div>

                ) : (

                  <button
                    onClick={() => cancelFileSend(MessageTypes.IMAGE)}
                    className='border-[1px]  border-error p-0.5 rounded-md cursor-pointer hover:scale-110 active:scale-100 active:brightness-90'>
                    <XMarkIcon className='size-4 text-error stroke-3' />
                  </button>

                )}

                <div
                  ref={emojiPickerRef}
                  className="relative flex items-center">
                  <FaceSmileIcon
                    onClick={handleEmojiPickerToggle}
                    className={`size-6 cursor-pointer hover:scale-110 active:scale-100 active:brightness-90 text-base-content`} />
                  <div
                    className={`isolate absolute bottom-15 left-0 transition duration-500 z-50 origin-bottom-left ${showEmojiPicker ? "translate-y-0 opacity-100 scale-100 pointer-events-auto" : "translate-y-10 opacity-0 scale-0 pointer-events-none"}`}
                  >
                    <MyEmojiPicker
                      emojiSearchProps={{ ref: emojiSearchRef }}
                      onEmojiSelect={handleEmojiSelect} />
                  </div>
                </div>
              </div>
              <input
                type="file"
                hidden
                ref={filePickerRef}
                onChange={onFileChange}
              />
              <input
                type="file"
                hidden
                ref={imagePickerRef}
                onChange={onImageChange}
                accept="image/png, image/jpeg, image/jpg, image/bmp, image/gif, image/tiff, image/webp"
              />
              <form
                onSubmit={(e) => { !image ? sendTextMessage(e) : (sendFileMessage(e, MessageTypes.IMAGE)) }}
                className='flex-1 h-full relative overflow-hidden'>
                <input type="text"
                  className='text-lg rounded-md h-full w-full px-2.5 focus:outline-none pr-10 caret-accent'
                  placeholder={image ? "(Optional)   Add a caption" : "Type your message here"}
                  onChange={onTextInputChange}
                  value={input}
                  ref={textInputRef}
                />
                {!image ? (
                  <div
                    className={`absolute top-0 right-0 h-full flex items-center  transition ${(!input.trim() && !sending) ? "opacity-0 pointer-events-none translate-y-10 duration-700" : sending ? "opacity-0 pointer-events-none -translate-y-10 duration-300 " : "opacity-100 pointer-events-auto translate-y-0 duration-700"}`}>
                    <button className="cursor-pointer" type="submit">
                      <ArrowUpIcon
                        className='mx-2 size-6 stroke-2 hover hover:scale-110 active:scale-100 text-accent active:brightness-90 transition duration-300'
                      />
                    </button>
                  </div>
                ) : (
                  <div
                    className="absolute top-0 right-0 h-full flex items-center">
                    <button className='cursor-pointer' disabled={!image?.ready} type="submit">
                      <ArrowUpIcon
                        className={`mx-2 size-6 stroke-2 hover hover:scale-110 active:scale-100 text-accent active:brightness-90 transition duration-300 ${!image?.ready && "brightness-50"}`}
                      />
                    </button>
                  </div>
                )}
              </form>
              {!image && (
                <div
                  onClick={initializeRecording}
                  className='flex flex-row gap-2 px-1.5 h-full cursor-pointer hover:scale-110 active:scale-100 active:brightness-90 '>
                  <MicrophoneIcon className='size-6 my-auto' />
                </div>
              )}
            </div>
          </>

        )}
      </div>
    )
  }
}

export default ChatFooter
