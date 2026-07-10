import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import Avatar from "./Avatar";

const Typing = () => {
  const typingUsers = useSelector(state => state.typingUsers);
  const { chatId } = useParams();
  const currentChat = useSelector(state => state.currentChat);

  if (typingUsers[chatId]?.length) {
    return (
      <div className="max-w-xl w-fit  ml-3 mb-3 mr-auto flex relative h-8">
        {currentChat?.isGroupChat && typingUsers[chatId].map((userId, i) => (
          <Avatar
            dp={currentChat.userProfilesObject?.[userId]?.avatar}
            key={userId}
            className={
              `h-full border-base-300 border-[1px] rounded-md
             ${(i === 1) ? (
                "absolute left-2.5 z-[2]"
              ) : (i === 2) ? (
                "absolute left-5 z-[3]"
              ) : (
                ""
              )} 
             `
            }
          />
        ))}
        <div className={`${(typingUsers[chatId].length > 1) ? "ml-7" : (currentChat?.isGroupChat) ? "ml-4" : ""} text-base-content items-end px-5 rounded-md bg-neutral flex h-8`}>
          <span className="animation1 mx-[2px] my-auto h-2 w-2 bg-base-content rounded-xs"></span>
          <span className="animation2 mx-[2px] my-auto h-2 w-2 bg-base-content  rounded-xs"></span>
          <span className="animation3 mx-[2px] my-auto h-2 w-2 bg-base-content rounded-xs"></span>
        </div>
      </div>
    );
  }
};

export default Typing;
