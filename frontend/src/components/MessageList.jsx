import { useDispatch, useSelector } from 'react-redux';
import UserInfoLazyLoader from './UserInfoLazyLoader';
import MessageBox from './MessageBox';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Typing from './Typing';
import ReachedBottomSentinel from './ReachedBottomSentinel';
import DateHeading from './DateHeading';
import ReachedTopSentinel from './ReachedTopSentinel';
import { loadMessages } from '../utils/messagesLoader';
import { scrollShiftObject } from '../utils/scrollShiftHandler';
import { initializePurgedStatusForChatId } from '../store/purgedStatusSlice';
import { sendMessageSeenAcksIfNeeded } from '../utils/eventProcessor';
import { resetMessages } from '../store/messagesSlice';
import { zeroUnreadCount } from '../store/thunks';
import { useParams } from 'react-router-dom';
import { messageContainerElement } from '../utils/messagePurger';
import { areTimestampsOnSameDay } from '../utils';
import ImageSendPreview from './ImageSendPreview';

export const MessageList = ({ image, setImage, filteredMessages }) => {
  //redux
  const currentChat = useSelector(state => state.currentChat);
  const typingUsers = useSelector(state => state.typingUsers);
  const purgedStatus = useSelector(state => state.purgedStatus);
  const needReload = useSelector(state => state.needReload);
  const dispatch = useDispatch();
  //useRef(s)
  const profileFetchesInProgressRef = useRef(new Set());
  //router
  const { chatId } = useParams();
  //useState(s)
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    // if a chat is open and reload is needed
    if (chatId && needReload) {
      (async () => {
        const reloadWentThrough = await loadMessages(chatId, "reload");
        // if reload result was actually used, turn off the loader
        if (reloadWentThrough) {
          setIsLoading(false);
        }
      })();
    }

  }, [chatId, needReload]);

  // to manage the scroll position on adding or removing messages
  useLayoutEffect(() => {
    scrollShiftObject.adjustScrollPositionIfNeeded(chatId, purgedStatus);
  }, [purgedStatus, chatId]);


  useEffect(() => {
    // to set the purgedStatus chatId
    dispatch(initializePurgedStatusForChatId(chatId));
    // check messages and send seen statuses, 
    sendMessageSeenAcksIfNeeded(chatId);


    return () => {
      // to reset messagesSlice Array when chat is changed or closed and to set the loading to true
      dispatch(resetMessages());
    }
  }, [chatId]);

  // to change the user for which to get last seen data
  useEffect(() => {
    if (chatId) {
      dispatch(zeroUnreadCount());
    }
  }, [chatId]);


  return (
    <div
      className={`flex-1 flex flex-col-reverse ${(image && currentChat && !currentChat.isDeleted && !currentChat.notAMember) ? "overflow-y-hidden" : "overflow-y-scroll"} overflow-x-hidden relative`}
      ref={messageContainerElement}>
      {(image && currentChat && !currentChat.isDeleted && !currentChat.notAMember) && (

        <ImageSendPreview image={image} setImage={setImage} />

      )}


      <UserInfoLazyLoader
        userIds={typingUsers[chatId]}
        profileFetchesInProgressRef={profileFetchesInProgressRef}
      >
        <Typing />
      </UserInfoLazyLoader>

      <ReachedBottomSentinel />
      {isLoading ? (
        <div className='flex-1 flex items-center justify-center'>
          <div className="loading loading-bars loading-xl"></div>
        </div>
      ) : (
        <>
          <div className='h-3 flex-shrink-0'></div>

          {filteredMessages?.map((message, index) => (
            <div key={message._id}>
              {!areTimestampsOnSameDay(message?.deviceTime, filteredMessages[index + 1]?.deviceTime) ? (
                <DateHeading timestamp={message.deviceTime} />
              ) :
                (message?.sender?._id?.toString() !== filteredMessages[index + 1]?.sender?._id?.toString()) ? (
                  <>
                    {/* <div className='h-3'></div> */}
                    <div className='h-1'></div>
                  </>
                ) : (
                  <div className="h-1"></div>
                )}
              <UserInfoLazyLoader
                userIds={[message.sender?._id]}
                profileFetchesInProgressRef={profileFetchesInProgressRef}
              >
                <MessageBox index={index} message={message} />
              </UserInfoLazyLoader>
            </div>
          ))}
        </>
      )}

      <ReachedTopSentinel parentLoader={isLoading} setParentLoader={setIsLoading} />
    </div>
  )
}
