import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon'
import { useState } from 'react'
import InputBar from './InputBar'
import PlusIcon from '@heroicons/react/24/solid/PlusIcon'
import MinusIcon from '@heroicons/react/24/solid/MinusIcon'
import Avatar from './Avatar'
import { useDispatch, useSelector } from 'react-redux'
import { resetSlice } from '../store/groupInfoSlice'
import AddParticipantViewer from './AddParticipantViewer'
import RemoveParticipantViewer from './RemoveParticipantViewer'

function ParticipantListViewer({ groupInfo }) {
  const dispatch = useDispatch();
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const account = useSelector(state => state.auth.account);

  let filteredParticipants;
  if (localSearchQuery) {
    filteredParticipants = groupInfo.participants.filter(p => (p.fullName?.toLowerCase().includes(localSearchQuery)))
  } else {
    filteredParticipants = groupInfo.participants
  }

  return (
    <div className="absolute w-screen h-screen inset-0 bg-black/40 backdrop-blur-lg z-10">
      <div className="h-full bg-base-200 md:max-w-2xl p-4 m-auto flex flex-col">

        {addMode ? (
          <AddParticipantViewer setAddMode={setAddMode} groupInfo={groupInfo} />
        ) : removeMode ? (
          <RemoveParticipantViewer setRemoveMode={setRemoveMode} groupInfo={groupInfo} />

        ) : (
          <>
            <div className='flex items-center gap-5 h-10'>
              <button
                onClick={() => dispatch(resetSlice())}
                className='cursor-pointer border-2 border-base-content rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90'>
                <XMarkIcon className='size-6 stroke-2 m-auto' />
              </button>
              <div className="flex-1">
                <InputBar
                  placeholder='Search for a member'
                  className='text-md'
                  onChange={e => setLocalSearchQuery(e.target.value)}
                />
              </div>
              {(groupInfo.admin._id.toString() === account?._id.toString()) && (
                <>
                  <button
                    onClick={() => setAddMode(true)}
                    className='cursor-pointer bg-accent border-base-content rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90'>
                    <PlusIcon className='size-6 text-base-100 m-auto' />
                  </button>
                  <button
                    onClick={() => setRemoveMode(true)}
                    className='cursor-pointer bg-error border-base-content rounded-md h-full aspect-square hover:scale-110 active:scale-100 active:brightness-90'>
                    <MinusIcon className='size-6 text-base-100 m-auto' />
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {!filteredParticipants.length ? (
                <div className='flex h-full items-center justify-center text-base-content/70'>
                  <p>No participants to display</p>
                </div>
              ) : (
                <div className='h-full overflow-y-scroll mt-4'>

                  {filteredParticipants.map(p => (
                    <div
                      key={p._id}
                      className="card p-3 mt-1 flex flex-row items-center gap-4">
                      <Avatar
                        className="h-11"
                        dp={p.avatar}
                      />
                      <p className='text-xl text-base-content text-nowrap'>
                        {(p?._id?.toString() === account?._id.toString()) ? "You" : p?.fullName}
                      </p>
                      {(p?._id?.toString() === groupInfo.admin._id.toString()) && (

                        <p className='rounded-md border-[1px] border-accent text-accent py-0.5 px-1 text-end ml-auto'>
                          Admin
                        </p>

                      )}
                    </div>
                  ))}


                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

export default ParticipantListViewer
