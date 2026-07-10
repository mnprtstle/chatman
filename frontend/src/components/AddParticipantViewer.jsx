import { useState } from 'react';
import InputBar from './InputBar';
import { determineOkToProcess, requestHandler } from '../utils';
import { addNewParticipantInGroupChat, searchAvailableUsers } from '../api';
import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon';
import { CheckIcon } from '../assets/icons';
import PersonCard from './PersonCard';
import { useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { updateGroupInfo } from '../store/groupInfoSlice';
import { addLastMessageWithoutUnreadIncrement, updateChat } from '../store/chatsSlice';
import { addMessage } from '../store/messagesSlice';
import useRenderFetch from '../utils/useRenderFetch';
import { idb } from '../indexedDB';
import { updateCurrentChat } from '../store/currentChatSlice';

function AddParticipantViewer({ setAddMode, groupInfo }) {
  const [users, setUsers] = useState([]);
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [newMembers, setNewMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { chatId } = useParams();
  const dispatch = useDispatch();


  let filteredUsers;
  if (localSearchQuery) {
    filteredUsers = users.filter(u => (u.fullName?.toLowerCase().includes(localSearchQuery)))
  } else {
    filteredUsers = users;
  }

  const addPerson = (userId) => {
    if (newMembers.includes(userId)) {
      setNewMembers(prev => (
        prev.filter(member => member !== userId.toString())
      ));
    } else {
      setNewMembers(prev => [...prev, userId.toString()]);
    }
  }

  const updateGroupParticipants = () => {
    requestHandler(
      async () => await addNewParticipantInGroupChat(chatId, newMembers),
      setIsProcessing,
      async res => {
        const { updatedChat, notifyingMessage, chatRevision } = res.data;
        dispatch(updateGroupInfo({ chat: updatedChat, notifyingMessage }));
        const okToProcessResult = await determineOkToProcess(updatedChat._id, chatRevision, true);

        if (okToProcessResult.okToProcess) {
          const updatedChatToStore = { ...updatedChat, participants: updatedChat.participants.slice(0, 2) }
          dispatch(updateChat(updatedChatToStore));
          dispatch(updateCurrentChat(updatedChatToStore));

          await idb.setChatInfo(updatedChatToStore);
        }

        const notifyingMessageToUse = { ...notifyingMessage, deviceTime: Date.now() }
        dispatch(addLastMessageWithoutUnreadIncrement(notifyingMessageToUse));
        dispatch(addMessage(notifyingMessageToUse));
        await idb.addNewMessage(notifyingMessageToUse);

        //unmounts AddParticipantViewer
        setAddMode(false);
      },
      alert
    );

  }



  useRenderFetch(
    searchAvailableUsers,
    setIsLoading,
    res => {
      const oldMembersList = groupInfo.participants;
      const data = [...res.data];
      for (const m of oldMembersList) {
        let index;
        while ((index = data.findIndex(u => u._id.toString() === m._id.toString())) !== -1) {
          data.splice(index, 1)
        }
      }
      setUsers(data);
    },
    alert
  );


  return (
    <>
      <div className='flex items-center gap-5 h-10'>
        <button
          onClick={() => setAddMode(false)}
          className='cursor-pointer border-2 border-base-content rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90 transition'>
          <ChevronLeftIcon className='size-6 stroke-2 m-auto' />
        </button>
        <div className="flex-1">
          <InputBar
            placeholder='Search for a user'
            className='text-md'
            onChange={e => setLocalSearchQuery(e.target.value)}
          />
        </div>

        <button
          onClick={updateGroupParticipants}
          disabled={isProcessing || !newMembers.length}
          className={`cursor-pointer rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90 transition ${(!isProcessing && !!newMembers.length) ? "bg-accent" : "bg-neutral"}`}>
          {isProcessing ? (
            <span className="loading loading-ring loading-md text-accent m-auto"></span>

          ) : (
            <CheckIcon size='25' color="var(--color-base-100)" className="m-auto" />
          )}
        </button>

      </div>

      {isLoading ? (
        <div className='m-auto'>
          <span className="loading loading-bars loading-lg text-accent"></span>
        </div >
      ) : (
        <div className='mt-4'>
          {filteredUsers?.map(u => (
            <PersonCard
              key={u._id}
              name={u.fullName}
              avatar={u.avatar}
              onClick={() => addPerson(u._id)}
              isChecked={newMembers?.includes(u._id.toString())}
            />
          ))}
        </div>
      )}


    </>
  )
}

export default AddParticipantViewer;
