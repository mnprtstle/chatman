// react hooks
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
// redux
import { useSelector } from 'react-redux';
// utils or services
import { loadMessages } from '../utils/messagesLoader';


function ReachedTopSentinel({ parentLoader, setParentLoader }) {
  const { chatId } = useParams();
  const observerTargetRef = useRef(null);
  const isFirstLoadRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const needReload = useSelector(state => state.needReload);
  const purgedStatus = useSelector(state => state.purgedStatus);

  useEffect(() => {
    if (chatId) {
      isFirstLoadRef.current = true;
    }
  }, [chatId]);


  useEffect(() => {
    let observer;
    let observerReEnablerTimer;

    if (!(chatId && observerTargetRef.current && (purgedStatus.chatId === chatId) && purgedStatus.topPurged)) {
      return;
    }

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        async entries => {
          if (!entries[0].isIntersecting) return;
          const forFirstLoad = isFirstLoadRef.current;

          setLoading(true);

          if (forFirstLoad) {
            setParentLoader(true);
          }

          isFirstLoadRef.current = false;

          if (!needReload) {

            observer.unobserve(observerTargetRef.current);

            const topStillPurged = await loadMessages(chatId, "topLoad");

            if (topStillPurged) {

              observerReEnablerTimer = setTimeout(() => {

                if (observer && observerTargetRef.current) {
                  observer.observe(observerTargetRef.current);
                }
              }, 0);
            }

            if ((topStillPurged !== undefined) && forFirstLoad) {
              setParentLoader(false);
            }

          }

          setLoading(false);

        }, {
        threshold: 1,
        rootMargin: "500px 0px"
      });

      if (observerTargetRef.current) {
        observer.observe(observerTargetRef.current);
      }

    }

    return () => {
      if (observerReEnablerTimer) {
        clearTimeout(observerReEnablerTimer);
      }

      if (observer && observerTargetRef.current) {
        observer.unobserve(observerTargetRef.current);
      }
    }
  }, [chatId, needReload, purgedStatus.topPurged, purgedStatus.chatId]);


  return (
    <div className="topsentinel relative" ref={observerTargetRef}>
      <div className='h-1 bg-transparent'></div>
      {(loading && !parentLoader) && (
        <div className='flex w-full justify-center absolute top-0 py-1 from-base-100 to-transparent bg-gradient-to-b'><div className="loading loading-spinner text-accent"></div></div>
      )}
    </div>

  )

}

export default ReachedTopSentinel;
