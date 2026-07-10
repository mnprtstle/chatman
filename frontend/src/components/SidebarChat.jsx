import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
// components or pages
import Avatar from './Avatar';
// icons
import PhotoIcon from '@heroicons/react/24/outline/PhotoIcon';
import DocumentTextIcon from '@heroicons/react/24/outline/DocumentTextIcon';
import InformationCircleIcon from '@heroicons/react/24/outline/InformationCircleIcon';
import { CheckIcon, ClockIcon, DoubleCheckIcon, ErrorIcon } from '../assets/icons';
import SpeakerWaveIcon from '@heroicons/react/24/outline/SpeakerWaveIcon';
import TrashIcon from '@heroicons/react/24/outline/TrashIcon';
// utils or services
import { MessageTypes, USER_PROFILE_MAX_AGE } from '../constants';
import { truncateString, requestHandler } from '../utils';
import { getBriefChatInfo, getParticipantAvatar, getParticipantProfile } from '../api';
import moment from 'moment';
import { idb } from '../indexedDB';
// redux
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentChat, updateCurrentChatOtherParticipantAvatar, updateCurrentChatOtherParticipantProfile } from '../store/currentChatSlice';
import { updateChat, updateLastMessageSenderProfile, updateOtherParticipantAvatarForChats, updateOtherParticipantProfileForChats } from '../store/chatsSlice';

function SidebarChat({ chat, ...props }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { chatId } = useParams();
  const account = useSelector(state => state.auth.account);
  const typingUsers = useSelector(state => state.typingUsers);
  const isSelected = chat._id.toString() === chatId;


  const isSender = chat.lastMessage?.sender && (chat.lastMessage.sender?._id === account?._id);

  let tickToUse;

  if (isSender) {
    const { seen, delivered, notSent, failedToSend, intendedParticipantCount } = chat.lastMessage;

    if ((intendedParticipantCount !== undefined) && (seen?.length === intendedParticipantCount)) {
      tickToUse = "seen";
    } else if ((intendedParticipantCount !== undefined) && (delivered?.length === intendedParticipantCount)) {
      tickToUse = "delivered";
    } else if (failedToSend) {
      tickToUse = "error";
    } else if (!notSent) {
      tickToUse = "sent";
    } else {
      tickToUse = "clock"
    }

  }

  const navigateToChat = async () => {
    dispatch(setCurrentChat(chat));
    navigate(`/chats/${chat?._id.toString()}`);
  }

  function sidebarTimestampGenerator(timestamp) {
    const now = moment();
    const date = moment(timestamp);

    if (date.isSame(now, "day")) {
      return moment(timestamp).format('LT');
    } else if (date.isSame(now.subtract(1, "day"), "day")) {
      return "Yesterday";
    } else if (date.isAfter(now.subtract(7, "days"))) {
      return date.format('dddd');
    } else if (date.isAfter(now.subtract(180, "days"))) {
      return date.format('ddd, MMM D');
    } else {
      return moment().format('L');
    }
  }

  const getInfoForChat = async (chatId) => {
    requestHandler(
      async () => await getBriefChatInfo(chatId),
      null,
      res => {
        if (res.data._id) {
          dispatch(updateChat(res.data));
          idb.setChatInfo(res.data);
        }
      },
      alert
    )
  }

  const fetchOtherParticipantProfile = async (userId) => {
    requestHandler(
      async () => await getParticipantProfile(userId),
      null,
      res => {
        dispatch(updateOtherParticipantProfileForChats({ chatId: chat._id, otherParticipantProfile: res.data }));
        dispatch(updateCurrentChatOtherParticipantProfile({ chatId: chat._id, profile: res.data }));
        idb.storeUserProfile(res.data);
      },
      alert
    )
  }

  const fetchSenderProfile = async (userId) => {
    // first check for profile locally, if not available, fetch it
    const senderProfile = await idb.getUserProfile(userId);

    if (senderProfile.result) {
      dispatch(updateLastMessageSenderProfile({ chatId: chat._id, profile: senderProfile.result }));

    } else {
      requestHandler(
        async () => await getParticipantProfile(userId),
        null,
        res => {
          dispatch(updateLastMessageSenderProfile({ chatId: chat._id, profile: res.data }));
          idb.storeUserProfile(res.data);
        },
        alert
      );
    }
  }

  const fetchOtherParticipantAvatar = async (userId) => {
    requestHandler(
      async () => await getParticipantAvatar(userId),
      null,
      res => {
        dispatch(updateOtherParticipantAvatarForChats({ chatId: chat._id, avatarUpdates: res.data }));
        dispatch(updateCurrentChatOtherParticipantAvatar({ avatar: res.data.avatar, chatId: chat._id }));
        idb.storeUserAvatar(res.data);
      },
      alert
    )
  }



  useEffect(() => {
    if (chat?.isGroupChat === undefined) {
      // if no info about the chat is available except the id, fetch it
      getInfoForChat(chat._id);
    } else if (!chat?.isGroupChat && !chat?.name) {
      fetchOtherParticipantProfile(chat.otherParticipantId);
    } else if (!chat?.isGroupChat && (!chat.lastUpdated || (Date.now() - chat.lastUpdated) > (USER_PROFILE_MAX_AGE))) {
      // if the profile was updated over USER_PROFILE_MAX_AGE
      //fetch the profile photo again
      fetchOtherParticipantAvatar(chat.otherParticipantId);
    }

  }, []);

  useEffect(() => {
    if (chat.isGroupChat) {
      if (chat.lastMessage?.sender && !chat.lastMessage.sender.fullName && (chat.lastMessage.sender?._id !== account?._id)) {
        fetchSenderProfile(chat.lastMessage.sender._id);
      }
    }
  }, [chat.isGroupChat, chat.lastMessage]);


  if (chat?.name) {
    return (
      <div
        className={`card py-1 px-3 mt-1 border-2 cursor-pointer hover:border-accent/50 hover:scale-[1.02] transition active:scale-100 active:border-accent/50 active:border-2 active:bg-neutral flex flex-row items-center ${isSelected ? "border-accent/50 scale-[1.02] bg-neutral" : "border-transparent"}`}
        onClick={navigateToChat}
        {...props}
      >
        <Avatar
          className="h-11"
          dp={chat.displayPhoto}
        />
        <div className='flex-1 flex items-center gap-1 justify-between'>
          <div className='flex-1 flex flex-col ml-4 gap-1'>
            <p className='text-xl text-base-content text-nowrap'>
              {chat?.name}
            </p>

            {typingUsers[chat._id]?.length ? (
              <p className="text-sm font-bold italic tracking-wider text-accent/90 text-nowrap animate-pulse">
                typing...
              </p>
            ) : chat?.lastMessage ? (

              <div className='flex gap-2 items-center text-sm text-neutral-content text-nowrap'>
                {(chat.lastMessage.messageType === MessageTypes.DELETED) ? (
                  <>
                    <span><TrashIcon className='size-4' /></span>
                    <span className='italic'>This message has been deleted</span>

                  </>
                ) : (
                  <>
                    {isSender ? (
                      <span>
                        {(tickToUse === "seen") ? (
                          <DoubleCheckIcon size="12" color="#CFA302" />
                        ) : (tickToUse === "delivered") ? (
                          <DoubleCheckIcon size="12" color="var(--color-base-content)" />
                        ) : (tickToUse === "sent") ? (
                          <CheckIcon size="12" strokeWidth='2.8' color="var(--color-base-content)" />
                        ) : (tickToUse === "error") ? (
                          <ErrorIcon size="14" color="var(--color-error)" />
                        ) : (
                          <ClockIcon size="12" color="var(--color-base-content)" />
                        )}
                      </span>

                    ) : (chat.isGroupChat && chat.lastMessage.sender?.fullName) ? (
                      <span>{chat.lastMessage.sender.fullName.split(" ")?.[0]}: </span>
                    ) : (
                      null
                    )}

                    {(chat.lastMessage.messageType === MessageTypes.FILE) ? (
                      <><span><DocumentTextIcon className='size-4' /></span>File</>
                    ) : (chat.lastMessage.messageType === MessageTypes.IMAGE) ? (
                      <><span><PhotoIcon className='size-4' /></span>Image</>
                    ) : (chat.lastMessage.messageType === MessageTypes.VOICE) ? (
                      <><span><SpeakerWaveIcon className='size-4' /></span>Audio</>
                    ) : (chat.lastMessage.messageType === MessageTypes.TEXT) ? (
                      <>{truncateString(chat.lastMessage.content, 30)}</>
                    ) : (
                      <><span><InformationCircleIcon className='size-4' /></span>{truncateString(chat?.lastMessage.content, 30)}</>
                    )}

                  </>
                )}
              </div>


            ) : (
              <p className='flex gap-2 items-center text-sm text-neutral-content'>Tap to chat</p>
            )}

          </div>
          {chat.lastMessage && (
            <div className='ml-4'>
              <p className='text-xs text-base-content/50 text-end mb-3'>{sidebarTimestampGenerator(chat.lastMessage.deviceTime)}</p>


              {!!chat.unreadCount && (
                <div className='rounded-sm bg-accent/90 text-base-300 w-4 h-4 text-xs font-medium text-center ml-auto'>
                  {chat.unreadCount}
                </div>
              )}

            </div>
          )}
        </div>


      </div >
    )


  } else {

    return;
  }
}

export default SidebarChat

