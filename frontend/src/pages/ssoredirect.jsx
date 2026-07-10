import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { getCurrentUser } from '../api';
import { putLoginInfoInState } from '../store/thunks';
import useRenderFetch from '../utils/useRenderFetch';

function SsoRedirect() {
  const navigate = useNavigate();
  const dispatch = useDispatch();



  useRenderFetch(
    getCurrentUser,
    null,
    res => {
      const { data } = res;
      dispatch(putLoginInfoInState({ user: data }));
      navigate("/chats", { replace: true });
    },
    alert
  );



  return (
    <div className='w-screen h-screen bg-[url("/assets/login-bg.png")] bg-cover bg-top bg-no-repeat relative'>
      <div className="absolute z-50 inset-0 backdrop-blur-md bg-base-100/40 flex items-center justify-center loading loading-bars loading-xl"></div>
    </div>

  )
}

export default SsoRedirect;
