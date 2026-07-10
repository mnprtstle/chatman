//icons
import EllipsisVerticalIcon from '@heroicons/react/24/outline/EllipsisVerticalIcon'
import ChatBubbleLeftEllipsisIcon from '@heroicons/react/24/outline/ChatBubbleLeftEllipsisIcon'
import { LogoutIcon, ProfileIcon } from '../assets/icons'
// utils or services
import { LocalStorage, requestHandler } from '../utils';
import { logoutUser } from '../api';
import { idb } from '../indexedDB';
//react
import { useDispatch } from 'react-redux';
import { logout } from '../store/authSlice';
import { useNavigate } from 'react-router-dom';


function SidebarHeader({ setNewChatOpen }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    requestHandler(
      logoutUser,
      null,
      () => {
        dispatch(logout());
        LocalStorage.clear();
        idb.terminateConnection();
        navigate("/login");
      },
      alert
    )
  }

  return (
    <div className='w-full flex items-center gap-2 text-base-content box-border justify-between pt-5 pb-3 p-2'>
      <div className='flex gap-1'>
        <div className='w-14'>
          <img src="/assets/logo.png" alt="" />
        </div>
        <h1 className='text-4xl font-oswald text-accent'>CHATMAN</h1>
      </div>

      <div
        className='flex gap-2 items-center'
      >
        <ChatBubbleLeftEllipsisIcon
          className='text-base-content size-9 hover:scale-110 cursor-pointer active:scale-100 active:brightness-75 transition'
          onClick={() => setNewChatOpen(true)}
        />

        <div className="dropdown dropdown-bottom dropdown-end">
          <div className="cursor-pointer" tabIndex={0} role="button">
            <EllipsisVerticalIcon className='text-base-content size-9 hover:scale-110 active:brightness-75 active:scale-100 transition' />
          </div>
          <ul tabIndex={0} className="dropdown-content font-medium menu bg-base-100 border-[1px] border-base-content/20 rounded-box z-1 w-52 p-1 shadow-sm text-md">

            <li
              className='border-[1px] rounded-md border-base-100 text-base-content hover:border-accent/50'
              onClick={() => navigate("/chats/profile")}
            >
              <a><ProfileIcon size="25" color="var(--color-base-content)" />Profile</a>
            </li>
            <li
              className='border-[1px] rounded-md border-base-100 text-error hover:border-accent/50'
              onClick={handleLogout}
            >
              <a><LogoutIcon size="25" color="var(--color-error)" />Logout</a>
            </li>

          </ul>
        </div>

      </div>


    </div>

  )
}

export default SidebarHeader
