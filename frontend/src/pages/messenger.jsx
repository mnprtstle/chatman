//react hooks
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import useRenderFetch from '../utils/useRenderFetch';
import { AnimatePresence, motion } from 'motion/react';
//components or pages
import Sidebar from '../components/Sidebar';
import ExpandedImageViewer from '../components/ExpandedImageViewer';
import ParticipantListViewer from '../components/ParticipantListViewer';
import NoChat from './nochat';
import Profile from './profile';
import Chat from './chat';
//utils or services
import { socketInstance as socket } from '../socket-client';
import { requestHandler } from '../utils';
import { appLaunchSyncApi, getBloomFilterSeedApi } from '../api';
import { syncWithServer } from '../utils/syncHandlers';
import { messageDeduplication } from '../utils/messageDeduplication';

function Messenger() {
  const expandedImage = useSelector(state => state.expandedImage);
  const groupInfo = useSelector(state => state.groupInfo?.chat);
  const location = useLocation();
  const [problem, setProblem] = useState("");
  const needsRightHalf = location.pathname.startsWith("/chats") && location.pathname.length > "/chats".length;
  const syncOnAppLaunchAndLogin = () => {
    requestHandler(
      appLaunchSyncApi,
      null,
      async res => {
        const { data } = res;
        if (data.problem) {
          setProblem(data.problem);
        }

        await syncWithServer(data);

      },
      null
    );
  }


  useRenderFetch(
    getBloomFilterSeedApi,
    null,
    async res => {
      const { data } = res;
      messageDeduplication.initializeMessageDeduplication(data);
      socket?.connect();
      syncOnAppLaunchAndLogin();
    },
    null
  );



  useEffect(() => {
    // disconnect socket on unmount if connected
    return () => {
      console.log("disconnecting socket...");
      socket?.disconnect();
    }

  }, []);


  return (
    <div className='w-screen h-screen bg-base-200 max-md:p-1 max-md:pb-6 md:p-4 overflow-hidden'>
      <AnimatePresence>
        {problem && (

          <motion.div
            key="problem"
            initial={{ opacity: 0 }}
            animate={{ opacity: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='absolute z-50 inset-0 backdrop-blur-sm bg-base-100/30 flex md:items-center items-end justify-center overflow-hidden'>
            <motion.div
              initial={{ opacity: 0, y: "var(--y-problem)", scale: "var(--scale-problem)" }}
              animate={{ opacity: "100%", y: 0, scale: "100%" }}
              exit={{ opacity: 0, y: "var(--y-problem)", scale: "var(--scale-problem)" }}
              transition={{ duration: 0.2 }}
              className='py-5 px-10 md:mx-20 mx-4 mb-10 bg-base-100 border-2 border-base-300 rounded-md max-md:flex-1 [--y-problem:50%] md:[--y-problem:0%] [--scale-problem:100%] md:[--scale-problem:80%]'>
              <p className='text-center text-base-content text-lg'>
                {problem}
              </p>
              <div className='mt-5 flex justify-center'>
                <button
                  onClick={() => setProblem("")}
                  className='cursor-pointer max-md:flex-1 border-accent/45 border-2 text-accent text-center text-md px-4 md:py-1 py-2 rounded-md md:hover:scale-110 md:active:scale-100 active:brightness-75 transition'>
                  Ok, got it!
                </button>
              </div>

            </motion.div>
          </motion.div>

        )}
      </AnimatePresence>
      {!problem && (
        <div className='card border-2 border-base-300 flex flex-row w-full h-full overflow-hidden'>
          <Sidebar />
          <div className={`bg-[url('/assets/batman.png')] bg-cover bg-top-right bg-no-repeat h-full border-base-300
                md:border-l-2  md:rounded-r-md md:rounded-l-none md:flex-7
                max-md:absolute max-md:inset-0 overflow-hidden duration-500 max-md:flex-1 max-md:rounded-md
                ${needsRightHalf ?
              "max-md:pointer-events-auto max-md:opacity-100"
              :
              "max-md:pointer-events-none max-md:opacity-0"
            }
                        `}>

            <AnimatePresence mode="wait">

              {(location.pathname === "/chats") ? (

                <motion.div
                  key="nochat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: "var(--opacity-noChat)" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex h-full max-md:[--opacity-noChat:0%] md:[--opacity-noChat:100%]
                                " >

                  <NoChat />

                </motion.div>

              ) : (location.pathname === "/chats/profile") ? (

                <motion.div
                  key="profile"
                  initial={{ opacity: "var(--opacity-from)", x: "var(--x-from)" }}
                  animate={{ opacity: "var(--opacity-to)", x: "var(--x-to)" }}
                  exit={{ opacity: "var(--opacity-from)", x: "var(--x-from)" }}
                  transition={{ duration: 0.2 }}
                  className='h-full bg-base-200/40 backdrop-blur-sm flex flex-col 
                                    md:[--opacity-from:0%] [--opacity-from:100%]
                                    md:[--opacity-to:100%] [--opacity-to:100%]
                                    md:[--x-from:0] [--x-from:100%]
                                    md:[--x-to:0] [--x-to:0]
                                '
                >

                  <Profile />

                </motion.div>

              ) : (

                <motion.div
                  key="chat"
                  initial={{ opacity: "var(--opacity-from)", x: "var(--x-from)" }}
                  animate={{ opacity: "var(--opacity-to)", x: "var(--x-to)" }}
                  exit={{ opacity: "var(--opacity-from)", x: "var(--x-from)" }}
                  transition={{ duration: 0.2 }}
                  className='h-full bg-base-200/40 backdrop-blur-sm  flex flex-col w-full relative
                                    md:[--opacity-from:0%] [--opacity-from:100%]
                                    md:[--opacity-to:100%] [--opacity-to:100%]
                                    md:[--x-from:0] [--x-from:100%]
                                    md:[--x-to:0] [--x-to:0]
                                '
                >

                  <Chat />

                </motion.div>
              )}

            </AnimatePresence>

          </div>

        </div>
      )}
      {expandedImage && (
        <ExpandedImageViewer expandedImage={expandedImage} />
      )}
      {groupInfo && (
        <ParticipantListViewer groupInfo={groupInfo} />
      )}

    </div>
  )
}

export default Messenger

