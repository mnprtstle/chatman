// react hooks
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
// redux
import { useSelector } from 'react-redux';
// utils or services
import { loadMessages } from '../utils/messagesLoader';


function ReachedBottomSentinel() {
  const { chatId } = useParams();
  const observerTargetRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const needReload = useSelector(state => state.needReload);
  const purgedStatus = useSelector(state => state.purgedStatus);


  useEffect(() => {
    let observer;
    let observerReEnablerTimer;

    if (!(chatId && observerTargetRef.current && (chatId === purgedStatus.chatId) && purgedStatus.bottomPurged)) {
      return;
    }

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        async entries => {
          if (!entries[0].isIntersecting) return;

          setLoading(true);
          if (!needReload) {
            observer.unobserve(observerTargetRef.current);

            const bottomStillPurged = await loadMessages(chatId, "bottomLoad");

            if (bottomStillPurged) {
              observerReEnablerTimer = setTimeout(() => {

                if (observer && observerTargetRef.current) {
                  observer.observe(observerTargetRef.current);
                }
              }, 0);
            }
          }

          setLoading(false);

        }, {
        threshold: 1,
        rootMargin: "500px 0px"
      }

      );


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

  }, [chatId, needReload, purgedStatus.chatId, purgedStatus.bottomPurged]);


  return (
    <div className="bottomsentinel relative" ref={observerTargetRef}>
      <div className='h-1 bg-transparent'></div>
      {loading && (
        <div className='flex w-full justify-center absolute bottom-0 py-1 from-base-100 to-transparent bg-gradient-to-b'><div className="loading loading-spinner text-accent"></div></div>
      )}
    </div>

  )

}

export default ReachedBottomSentinel;
