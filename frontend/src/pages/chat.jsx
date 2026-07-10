// react hooks
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// components or pages
import { ChatFooter, ChatHeader } from '../components'
import { requestHandler } from '../utils';
import ChatDetails from '../components/ChatDetails';
// redux
import { useDispatch, useSelector } from 'react-redux';
import { changeOtherUser } from '../store/otherUserPresenceSlice';
// utils or services
import { idb } from '../indexedDB';
import { getParticipantAvatar, getParticipantProfile } from '../api';
import { updateOtherParticipantAvatarForChats, updateOtherParticipantProfileForChats } from '../store/chatsSlice';
import { resetCurrentChat, updateCurrentChatOtherParticipantAvatar, updateCurrentChatOtherParticipantProfile } from '../store/currentChatSlice';
import { USER_PROFILE_MAX_AGE } from '../constants';
import { MessageList } from '../components/MessageList';

function Chat() {
  //useState(s)
  const [searchText, setSearchText] = useState("");
  const [showChatDetails, setShowChatDetails] = useState(false);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [image, setImage] = useState(null);
  // react router
  const navigate = useNavigate();
  // useSelector(s)
  const currentChat = useSelector(state => state.currentChat);
  const messages = useSelector(state => state.messages);
  const dispatch = useDispatch();


  const filteredMessages = searchText ? messages.filter(message => message.content?.toLowerCase().includes(searchText.trim().toLowerCase())) : messages;

  const fetchOtherParticipantProfile = async (userId) => {
    requestHandler(
      async () => await getParticipantProfile(userId),
      null,
      res => {
        dispatch(updateOtherParticipantProfileForChats({ chatId: currentChat._id, otherParticipantProfile: res.data }));
        dispatch(updateCurrentChatOtherParticipantProfile({ chatId: currentChat._id, profile: res.data }));
        idb.storeUserProfile(res.data);
      },
      alert
    )
  }


  const fetchOtherParticipantAvatar = async (userId) => {
    requestHandler(
      async () => await getParticipantAvatar(userId),
      null,
      res => {
        dispatch(updateOtherParticipantAvatarForChats({ chatId: currentChat._id, avatarUpdates: res.data }));
        dispatch(updateCurrentChatOtherParticipantAvatar({ avatar: res.data.avatar, chatId: currentChat._id }));
        idb.storeUserAvatar(res.data);
      },
      alert
    )
  }



  useEffect(() => {
    dispatch(changeOtherUser(currentChat?.otherParticipantId));
  }, [currentChat?._id]);

  useEffect(() => {
    if (currentChat?.isGroupChat === false) {
      if (!currentChat.name) {
        fetchOtherParticipantProfile(currentChat.otherParticipantId);
      } else if (!currentChat.lastUpdated || ((Date.now() - currentChat.lastUpdated) > USER_PROFILE_MAX_AGE)) {
        // if the profile was updated over USER_PROFILE_MAX_AGE
        //fetch the profile photo again
        fetchOtherParticipantAvatar(currentChat.otherParticipantId);
      }
    }
  }, [currentChat]);

  useEffect(() => {
    return () => {

      dispatch(resetCurrentChat());
    }
  }, []);



  return (
    <>
      {(chatUnavailable) ? (

        <>
          <div className='absolute z-50 inset-0 backdrop-blur-md bg-base-100/40 flex items-center justify-center'>
            <div className='py-5 px-10 bg-base-100 border-2 border-base-300 rounded-md'>
              <p className='text-center text-base-content text-lg'>
                Looks like you are no longer a member of this group
              </p>
              <div className='mt-5 flex justify-center'>
                <button
                  onClick={() => navigate("/chats")}
                  className='cursor-pointer m-auto bg-accent text-base-100 text-md px-2 py-0.5 rounded-md hover:scale-110 active:scale-100 active:brightness-75 transition'>
                  Go back
                </button>
              </div>

            </div>
          </div>
        </>

      ) : (showChatDetails && currentChat && !currentChat.isDeleted && !currentChat.notAMember) ? (

        <ChatDetails setShowChatDetails={setShowChatDetails} setChatUnavailable={setChatUnavailable} />

      ) : (

        <>
          <ChatHeader currentChat={currentChat || null} serachText={searchText} setSearchText={setSearchText} setShowChatDetails={setShowChatDetails} />
          <MessageList image={image} setImage={setImage} filteredMessages={filteredMessages} />
          <ChatFooter image={image} setImage={setImage} />
        </>
      )
      }
    </>
  )
}


export default Chat
