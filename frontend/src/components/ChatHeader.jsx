import { useRef, useState } from 'react'
import Avatar from './Avatar';
import MagnifyingGlassIcon from '@heroicons/react/24/outline/MagnifyingGlassIcon'
import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon'
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon'
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { resetCurrentChat } from '../store/currentChatSlice';
import { userInfoTimestampGenerator } from '../utils';
import { ChatStatusEnum } from '../constants';

function ChatHeader({ currentChat, searchText, setSearchText, setShowChatDetails }) {
  const navigate = useNavigate();
  const [showSearchBar, setShowSearchBar] = useState(false);
  const searchRef = useRef();
  const dispatch = useDispatch();

  const otherUserPresence = useSelector(state => state.otherUserPresence);

  const startMessageSearch = () => {
    setShowSearchBar(true);
    searchRef.current.focus();
  }

  const endMessageSearch = () => {
    setSearchText("");
    setShowSearchBar(false);
    searchRef.current.value = "";
  }

  const backToNoChat = () => {
    navigate("/chats");
    // setTimeout(() => {
    //   dispatch(resetCurrentChat());
    // }, 0)
  }




  return (
    <div className='pl-4 bg-base-100/30 backdrop-blur-lg border-b-2 border-base-300'>

      <div className="flex items-center gap-3 h-16">
        <div
          onClick={backToNoChat}
          className='hover:scale-110 transition active:scale-100 active:brightness-90 cursor-pointer'>
          <ChevronLeftIcon className='text-base-content stroke-2 size-7 my-auto mx-1' />
        </div>
        <Avatar
          onClick={() => setShowChatDetails(true)}
          className="h-12 rounded-md cursor-pointer"
          dp={currentChat?.displayPhoto}
        />
        <div
          onClick={() => setShowChatDetails(true)}
          className='mx-4 cursor-pointer'
        >

          <p className='text-xl text-nowrap'>
            {currentChat?.name}
          </p>
          <p className='text-md text-base-content/50'>

            {!currentChat?.isGroupChat ? (
              <>
                {(currentChat?.otherParticipantId === otherUserPresence.id) ? (
                  <>
                    {(otherUserPresence.online === ChatStatusEnum.ONLINE) ? (
                      "Online"
                    ) : otherUserPresence.lastSeen ? (
                      `last online ${userInfoTimestampGenerator(otherUserPresence.lastSeen)}`
                    ) : ""}
                  </>
                ) : ""
                }

              </>
            ) : (
              "Tap for group info"
            )}
          </p>
        </div>

        <div className="relative h-full flex-1">
          <div
            className={`h-full flex items-center justify-end px-2 ${showSearchBar ? "opacity-0" : "opacity-100"}`}
          >
            <MagnifyingGlassIcon
              onClick={startMessageSearch}
              className='text-base-content stroke-2 size-7 my-auto mx-3 hover:scale-110 active:scale-100 active:brightness-90 cursor-pointer' />
          </div>
          <div className={`origin-right flex-1 px-2 ml-5 h-full w-full border-l-2 border-base-300 flex bg-neutral transition duration-500 absolute top-0 right-0 ${showSearchBar ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"}`}>
            <input type="text"
              className='text-lg h-full w-full px-2 focus:outline-none caret-accent'
              placeholder='Search for a message'
              onChange={(e) => setSearchText(e.target.value)}
              value={searchText}
              ref={searchRef}
            />
            <XMarkIcon
              onClick={endMessageSearch}
              className='text-base-content stroke-2 size-7 my-auto mx-1 hover:scale-110 transition active:scale-100 active:brightness-90 cursor-pointer' />
          </div>
        </div>


      </div>
    </div>
  )
}

export default ChatHeader
