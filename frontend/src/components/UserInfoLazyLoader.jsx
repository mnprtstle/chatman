import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { idb } from '../indexedDB';
import { addProfile, setAvatar } from '../store/currentChatSlice';
import { requestHandler } from '../utils';
import { getParticipantAvatar, getParticipantProfile } from '../api';
import { USER_PROFILE_MAX_AGE } from '../constants';

function UserInfoLazyLoader({ children, profileFetchesInProgressRef, userIds }) {
  const dispatch = useDispatch();
  const currentChat = useSelector(state => state.currentChat);
  const account = useSelector(state => state.auth.account);

  useEffect(() => {
    if (!currentChat) return;

    userIds?.forEach(userId => {

      if (userId && (userId !== account?._id.toString()) && !currentChat.userProfilesObject?.[userId]?.fullName) {
        const chatId = currentChat._id;
        if (!profileFetchesInProgressRef.current.has(userId)) {
          (async () => {
            profileFetchesInProgressRef.current.add(userId);
            const idbProfileFetch = await idb.getUserProfile(userId);

            if (idbProfileFetch.result) {
              if (!idbProfileFetch.result.lastUpdated || ((Date.now() - idbProfileFetch.result.lastUpdated) > (USER_PROFILE_MAX_AGE))) {
                requestHandler(
                  async () => await getParticipantAvatar(userId),
                  null,
                  res => {
                    const { data } = res;
                    dispatch(setAvatar({ chatId, userId, avatar: data.avatar }));
                    idb.storeUserAvatar(data);
                  },
                  () => console.log("failed to fetch user Avatar")
                )
              } else {
                dispatch(addProfile({ profile: idbProfileFetch.result, chatId }));
                profileFetchesInProgressRef.current.delete(userId);
              }
            } else {
              requestHandler(
                async () => await getParticipantProfile(userId),
                null,
                res => {
                  const { data } = res;
                  dispatch(addProfile({ profile: data, chatId }));
                  profileFetchesInProgressRef.current.delete(userId);
                  idb.setUserProfiles([data]);
                },
                () => console.log("Could not fetch user profile")
              )
            }
          })();
        }
      }
    });

  }, [currentChat, userIds]);

  return (
    <>
      {children}
    </>
  )
}

export default UserInfoLazyLoader
