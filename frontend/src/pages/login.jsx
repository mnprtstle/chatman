import { useState } from 'react'
import { FormButton, Input } from '../components'
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from 'react-redux';
import { initialRequestHandler } from '../utils';
import { loginUser } from '../api';
import SocialLoginButton from '../components/SocialLoginButton';
import { putLoginInfoInState } from '../store/thunks';



function Login() {
  const navigate = useNavigate();
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const [fieldEmptyError, setFieldEmptyError] = useState(false);
  const watchInputs = useWatch({
    control,
    name: ["username", "password"]
  }
  );
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = (watchInputs[0].length > 0 && watchInputs[1].length > 0) ? true : false;

  const onSubmit = async (data) => {
    if (!canSubmit) {
      setFieldEmptyError(true);
      return
    }
    if (fieldEmptyError) {
      setFieldEmptyError(false);
    }

    await initialRequestHandler(
      async () => await loginUser(data),
      setIsLoading,
      (res) => {
        const { data } = res;
        dispatch(putLoginInfoInState(data));
        navigate("/chats", { replace: true });
      },
      alert
    );
  }


  return (
    <div className='w-screen h-screen bg-[url("/assets/login-bg.png")] bg-cover bg-top bg-no-repeat relative'>
      <div
        className='h-full flex justify-between items-center text-base-content
        max-md:backdrop-brightness-50'>

        <div
          className='mx-10 font-oswald text-5xl
      max-md:hidden'>

          <p className='py-1'>
            Welcome back
          </p>
          <p className='py-1'>
            to <span className='text-accent'>Gotham</span>
          </p>
          <p className='py-1'>
            Log in to
          </p>
          <p className='py-1'>
            join your <span className='text-accent'>allies</span>
          </p>
        </div>
        <div
          className='card custom-scrollbar overflow-y-scroll py-8 px-6 w-sm max-h-11/12
      md:mr-16 md:border-2 md:border-base-300 md:bg-base-100/70 md:max-h-10/12
      max-md:m-1 max-md:mb-6 max-md:flex-1'>
          <form
            onSubmit={handleSubmit(onSubmit)}>
            <Input
              label="Username"
              className="mb-6"
              {...register("username", {
                required: "Username is required"
              })}
            />
            <Input
              label="Password"
              className="mb-6"
              type="password"
              {...register("password", {
                required: "Password is required"
              })}
            />
            <FormButton name="Log in" canSubmit={canSubmit} isLoading={isLoading} />
          </form>
          {fieldEmptyError && (
            <div className='mt-3 text-center'>
              <p className='text-lg text-error'>Both username and password must be provided!</p>
            </div>
          )}
          <div className='mt-4'>
            <p className='text-lg text-center'>
              New to Gotham? <Link className='text-accent cursor-pointer' to="/register">Register</Link>
            </p>
            <p className='text-lg text-center'>to join the watch</p>
          </div>
          <div className='mt-4 text-lg pt-3'>
            <div className="flex items-center space-x-1 mb-4">
              <div className="flex-1 h-0.5 sm:w-16 bg-neutral"></div>
              <p className="px-3 text-sm">Or, continue with</p>
              <div className="flex-1 h-0.5 sm:w-16 bg-neutral"></div>
            </div>
            <div className='mt-2 flex gap-6 justify-center w-full text-base-100 font-medium'>
              <SocialLoginButton option="Google" />
              <SocialLoginButton option="Github" />
              <SocialLoginButton option="Facebook" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login

