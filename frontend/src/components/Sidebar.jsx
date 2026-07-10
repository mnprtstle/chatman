// react hooks
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
// components or pages
import SidebarHeader from './SidebarHeader'
import InputBar from './InputBar'
import SidebarChat from './SidebarChat'
import NewChat from './NewChat';
import LoadingBar from './LoadingBar';
// utils or services
import { getChatObjectMetadata } from '../utils';
import { socketInstance as socket } from '../socket-client';
import { idb } from '../indexedDB';
import { eventProcessor } from '../utils/eventProcessor';
import { ChatEventEnum } from '../constants';
//redux
import { useDispatch, useSelector } from 'react-redux';
import { setChats } from '../store/chatsSlice';

function Sidebar() {
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();
  const chats = useSelector(state => state.chats);
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const account = useSelector(state => state.auth.account);
  const location = useLocation();
  const needsRightHalf = location.pathname.startsWith("/chats") && location.pathname.length > "/chats".length;



  //take out the required metadata out of the fetched chats
  const processedChats = chats?.map(chat => getChatObjectMetadata(chat, account));
  // filter the data if there was a search query
  let filteredChats;
  if (localSearchQuery) {
    filteredChats = processedChats?.filter(c => {
      // to not show the single chats that dont contain any messages yet
      if ((c.isGroupChat === false) && !c.lastMessage) return false;
      return (c.name?.toLowerCase().includes(localSearchQuery))
    });
  } else {
    filteredChats = processedChats?.filter(c => {
      if ((c.isGroupChat === false) && !c.lastMessage) return false;
      return true;
    })
  }


  const getChats = async () => {
    setIsLoading(true);
    const chats = await idb.loadAllChats();

    if (chats?.failed) {
      alert("Error occured, could not load chats. Please contact customer support");
    }

    if (chats?.result) {
      dispatch(setChats(chats.result));
      setIsLoading(false);
    }


  }

  useEffect(() => {
    getChats();
  }, []);

  useEffect(() => {

    const events = [
      ChatEventEnum.SEND_MESSAGE,
      ChatEventEnum.NEW_MEMBER_EVENT,
      ChatEventEnum.REMOVE_MEMBER_EVENT,
      ChatEventEnum.MEMBER_LEFT_EVENT,
      ChatEventEnum.EXIT_MEMBER_EVENT,
      ChatEventEnum.MESSAGE_DELETE_EVENT,
      ChatEventEnum.NEW_CHAT_EVENT,
      ChatEventEnum.NEW_IN_CHAT_EVENT,
      ChatEventEnum.DELETE_CHAT_EVENT,
      ChatEventEnum.UPDATE_GROUP_NAME_EVENT,
      ChatEventEnum.UPDATE_GROUP_PHOTO_EVENT,
      ChatEventEnum.MSG_ACK_EVENT,
      ChatEventEnum.TYPING_EVENT,
      ChatEventEnum.STOP_TYPING_EVENT,
      ChatEventEnum.PROCESSED_MSG_ACK_EVENT,
      ChatEventEnum.VERIFIED_1_1_CHAT,
      ChatEventEnum.FAILED_MESSAGE
    ];

    const handlers = events.map(eventType => ({
      name: eventType, handler: (payload) => eventProcessor({ data: payload, dataType: eventType })
    }));

    handlers.forEach(({ name, handler }) => socket?.on(name, handler));

    return () => {

      handlers.forEach(({ name, handler }) => {
        socket?.off(name, handler);
      });

    }
  }, [socket]);


  return (

    <div className={`h-full text-base-content bg-base-100 relative custom-scrollbar 
    md:rounded-r-none md:rounded-l-md md:flex-3 transition duration-200 
    max-md:flex-1 max-md:rounded-md
    ${needsRightHalf ?
        "max-md:opacity-0 max-md:scale-90 max-md:pointer-events-none"
        :
        "max-md:opacity-100 max-md:scale-100 max-md:pointer-events-auto"
      }
    `}>
      <div className={`w-full h-full bg-base-100 absolute top-0 left-0 transition z-20 ${newChatOpen ? "translate-x-0 pointer-events-auto opacity-100" : "-translate-x-full pointer-events-none opacity-0"}`}>
        <NewChat setNewChatOpen={setNewChatOpen} newChatOpen={newChatOpen} />
      </div>


      <div className='h-full w-full flex flex-col'>
        <div className='px-3'>
          <SidebarHeader setNewChatOpen={setNewChatOpen} />
          <div className="py-3">
            <InputBar
              isSearchBar
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? (
          <LoadingBar />
        ) : (
          <div className='pl-3 pr-2 overflow-scroll flex-1'>
            {filteredChats?.map(filteredChat => (
              <SidebarChat
                key={filteredChat._id}
                chat={filteredChat}
              />
            ))}
          </div>
        )}

      </div>


    </div>

  )
}

export default Sidebar
