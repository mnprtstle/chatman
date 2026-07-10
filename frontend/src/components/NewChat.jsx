import { useRef, useState } from 'react';
import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon'
import PersonCard from './PersonCard';
import InputBar from './InputBar';
import { determineOkToProcess, getChatObjectMetadata, requestHandler } from '../utils';
import { createAGroupChat, createOrGetAOneOnOneChat, searchAvailableUsers } from '../api';
import LoadingBar from './LoadingBar';
import { useNavigate } from "react-router-dom"
import { useDispatch, useSelector } from 'react-redux';
import { addLastMessage, updateChat } from '../store/chatsSlice';
import { addMessage } from '../store/messagesSlice';
import { setCurrentChat } from '../store/currentChatSlice';
import { idb } from '../indexedDB';
import useRenderFetch from '../utils/useRenderFetch';

function NewChat({ setNewChatOpen, newChatOpen }) {
  const [groupMembers, setGroupMembers] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const groupNameRef = useRef();
  const [errorList, setErrorList] = useState([]);
  const dispatch = useDispatch();
  const account = useSelector(state => state.auth.account);
  const lastUpdatedForAvailableUsersRef = useRef(null);

  const goBacktoChats = () => {
    setErrorList([]);
    setNewChatOpen(false);
  }


  const navigateToChat = async (user) => {
    setIsLoading(true);
    const checkChat = await idb.createOrGetAOneOnOneChat(user._id);
    if (checkChat.failed) {
      alert("Something went wrong while opening chat, please contact customer support");
    }

    const chatInfo = checkChat.result;

    if (!checkChat.existed) {
      requestHandler(
        async () => await createOrGetAOneOnOneChat({
          _id: chatInfo._id,
          otherParticipantId: user._id
        }),
        null,
        null,
        alert
      );

    }

    chatInfo.participants = [
      {
        _id: user._id,
        fullName: user.fullName,
        avatar: user.avatar,
        lastUpdated: lastUpdatedForAvailableUsersRef.current
      },
      {
        _id: account?._id
      }
    ]


    idb.setUserProfiles([chatInfo.participants[0]]);
    if (!checkChat.existed || !checkChat.result?.updatedAt) {
      dispatch(updateChat(chatInfo));
    }
    const updatedCurrentChat = getChatObjectMetadata(chatInfo, account);
    dispatch(setCurrentChat(updatedCurrentChat));
    setNewChatOpen(false);
    navigate(`/chats/${chatInfo._id}`);
    setIsLoading(false);
  }

  const addPerson = (userId) => {
    if (groupMembers?.includes(userId)) {
      setGroupMembers(prev => (
        prev.filter(member => member !== userId)
      ))
    } else {
      setGroupMembers(prev => [...prev, userId]);
    }
  }

  const startGroupChat = async () => {
    setErrorList([]);
    const tempArray = [];
    if (groupMembers.length < 2) {
      tempArray.push("Please select at least 2 group members");
    }
    if (!groupName.length) {
      tempArray.push("Please type a name for the group chat");
      groupNameRef.current?.focus();
    }
    if (tempArray.length) {
      setErrorList(tempArray);
      return;
    }

    await requestHandler(
      async () => await createAGroupChat({ name: groupName, participants: groupMembers }),
      setIsLoading,
      async res => {
        //update chats store
        const { chat, chatId, chatRevision, notifyingMessage } = res.data;

        const okToProcessResult = await determineOkToProcess(chatId, chatRevision, true);

        if (okToProcessResult.okToProcess) {
          dispatch(updateChat(chat));
          dispatch(setCurrentChat(getChatObjectMetadata(chat, account)));
          idb.updateChat(chat);
        }

        const notifyingMessageToUse = { ...notifyingMessage, deviceTime: Date.now() }
        dispatch(addMessage(notifyingMessageToUse));
        dispatch(addLastMessage({ message: notifyingMessageToUse }));
        await idb.addNewMessage(notifyingMessageToUse);

        navigate(`/chats/${chatId.toString()}`);
        setNewChatOpen(false);
      },
      alert
    );
  }


  useRenderFetch(
    searchAvailableUsers,
    setIsLoading,
    res => {
      setAvailableUsers(res.data);
      lastUpdatedForAvailableUsersRef.current = Date.now()
    },
    alert,
    [],
    [newChatOpen],
    () => newChatOpen
  );


  return (
    <div className='w-full h-full flex flex-col'>
      <div className='border-base-300 p-2 flex items-center'>
        <button
          className='card h-full hover:scale-105 transition active:scale-100 active:brightness-90 cursor-pointer'
          onClick={goBacktoChats}
        >
          <ChevronLeftIcon className='text-base-content stroke-2 size-7' />
        </button>
        <div className='flex-1'>
          <p className='text-xl text-center'>
            New Chat
          </p>

        </div>
      </div>
      <div className="p-3 transition origin-top overflow-hidden">
        <InputBar isSearchBar placeholder="Search a Gotham member" />
      </div>
      <div className='flex justify-between items-center gap-4 px-4'>
        <div className='px-3 py-2 flex gap-2 items-center'>
          <p>Create group chat</p>
          <input
            type="checkbox"
            className={`toggle toggle-md toggle-accent`}
            checked={groupMembers !== null}
            onChange={(e) => setGroupMembers(() => e.target.checked ? [] : null)}
          />
        </div>
        <button
          className={`cursor-pointer hover:scale-105 font-medium rounded-md transition active:scale-100 active:brightness-90 p-2 bg-accent text-base-100 ${((groupMembers?.length > 1) && (groupName.length > 0)) ? "opacity-100 pointer-events-auto" : (groupMembers !== null) ? "opacity-100 pointer-events-auto brightness-50" : "opacity-0 pointer-events-none"}`}
          onClick={startGroupChat}
        >
          Start chat
        </button>
      </div>
      {!!errorList.length && errorList.map(el => (
        <p className=' p-2 text-end text-error'>{el}</p>
      ))}
      {(groupMembers !== null) && (
        <div className="p-3 transition origin-top overflow-hidden">
          <InputBar
            ref={groupNameRef}
            placeholder="Type the name for the group"
            value={groupName}
            onChange={e => setGroupName(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <LoadingBar />
      ) : (
        <div className='overflow-scroll pb-2 px-2 flex-1'>
          {availableUsers.map(user => (
            <PersonCard
              key={user._id}
              name={user.fullName}
              avatar={user.avatar}
              onClick={(groupMembers !== null) ? (() => addPerson(user._id.toString())) : (() => navigateToChat(user))}
              isChecked={groupMembers?.includes(user._id.toString())}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default NewChat
