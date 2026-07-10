import React, { useState } from 'react';
import InputBar from './InputBar';
import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon';
import { CheckIcon } from '../assets/icons';
import PersonCard from './PersonCard';
import { removeParticipantFromGroupChat } from '../api';
import { addLastMessageWithoutUnreadIncrement, updateChat } from '../store/chatsSlice';
import { useDispatch, useSelector } from 'react-redux';
import { determineOkToProcess, requestHandler } from '../utils';
import { useParams } from 'react-router-dom';
import { updateGroupInfo } from '../store/groupInfoSlice';
import { idb } from '../indexedDB';
import { updateCurrentChat } from '../store/currentChatSlice';
import { addMessage } from '../store/messagesSlice';

function RemoveParticipantViewer({ setRemoveMode, groupInfo }) {
  const [membersToRemove, setMembersToRemove] = useState([]);
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const dispatch = useDispatch();
  const { chatId } = useParams();
  const account = useSelector(state => state.auth.account);


  let filteredMembers;
  if (localSearchQuery) {
    filteredMembers = groupInfo.participants.filter(p => (p.fullName?.toLowerCase().includes(localSearchQuery)))
  } else {
    filteredMembers = groupInfo.participants;
  }

  const removePerson = (userId) => {
    if (membersToRemove.includes(userId)) {
      setMembersToRemove(prev => (
        prev.filter(member => member !== userId.toString())
      ));
    } else {
      setMembersToRemove(prev => [...prev, userId.toString()]);
    }
  }

  const updateGroupParticipants = () => {
    requestHandler(
      async () => await removeParticipantFromGroupChat(chatId, membersToRemove),
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

        setRemoveMode(false);
      },
      alert
    )
  }



  return (
    <>
      <div className='flex items-center gap-5 h-10'>
        <button
          onClick={() => setRemoveMode(false)}
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
          disabled={isProcessing || !membersToRemove.length}
          className={`cursor-pointer border-base-content rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90 transition ${(!isProcessing && !!membersToRemove.length) ? "bg-error" : "bg-neutral"}`}>
          {isProcessing ? (
            <span className="loading loading-ring loading-md text-error m-auto"></span>

          ) : (
            <CheckIcon size='25' color="var(--color-base-100)" className="m-auto" />
          )}
        </button>
      </div>

      <div className='mt-4'>
        {filteredMembers?.map(p => (
          <React.Fragment key={p._id}>
            {(p._id.toString() !== account?._id.toString()) && (
              <PersonCard
                name={p.fullName}
                avatar={p.avatar}
                forNegativeList
                onClick={() => removePerson(p._id)}
                isChecked={membersToRemove?.includes(p._id.toString())}
              />
            )}
          </React.Fragment>
        ))}
      </div>

    </>
  )
}

export default RemoveParticipantViewer;
