import { useState } from 'react'
import { FormButton, Input } from '../components'
import { useForm } from "react-hook-form"
import CheckIcon from '@heroicons/react/24/outline/CheckIcon';
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../api';
import { initialRequestHandler } from '../utils';


function Register() {
  const { register, handleSubmit, formState: { isValid, errors }, getValues } = useForm({
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });
  const [passwordCompliance, setPasswordCompliance] = useState(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);


  const onSubmit = async (data) => {
    await initialRequestHandler(
      async () => await registerUser(data),
      setIsLoading,
      () => {
        alert("Account created successfully! Go ahead and login.");
        navigate("/login") // Redirect to login upon successful registration
      },
      alert //Error alert on request failure
    );

  }

  const passwordCheck = (e) => {
    const typedPassword = e.target.value;
    const copyCompliance = {}
    if (typedPassword.length >= 8) {
      copyCompliance.hasLength = true;
    } else {
      copyCompliance.hasLength = false;
    }

    if (/[A-Z]/.test(typedPassword)) {
      copyCompliance.hasUppercase = true;
    } else {
      copyCompliance.hasUppercase = false;
    }

    if (/[a-z]/.test(typedPassword)) {
      copyCompliance.hasLowerCase = true;
    } else {
      copyCompliance.hasLowerCase = false;
    }

    if (/[0-9]/.test(typedPassword)) {
      copyCompliance.hasNumber = true;
    } else {
      copyCompliance.hasNumber = false;
    }

    setPasswordCompliance(copyCompliance);
  }

  const checkConfirmPassword = e => {
    const typedConfirmPassword = e.target.value;
    if (getValues("password") !== typedConfirmPassword) {
      setConfirmPasswordError("Passwords do not match")
    } else {
      setConfirmPasswordError("")
    }
  }

  return (
    <div className='w-screen h-screen bg-[url("/assets/login-bg.png")] bg-cover bg-top bg-no-repeat'>

      <div
        className='h-full flex justify-between items-center text-base-content
        max-md:backdrop-brightness-50
        '>

        <div
          className='mx-10 font-oswald text-5xl
      max-md:hidden
      '>
          <p className='py-1'>
            When the <span className='text-accent'>city</span>
          </p>
          <p className='py-1'>
            falls
            <span className='text-accent'> silent,</span>
          </p>
          <p className='py-1'>
            heroes <span className='text-accent'>rise.</span>
          </p>
          <p className='py-1'>
            Register <span className='text-accent'>now.</span>
          </p>
        </div>

        <div
          className='card custom-scrollbar overflow-y-scroll py-8 px-6 w-sm max-h-11/12
      md:mr-16 md:border-2 md:border-base-300 md:bg-base-100/70 md:max-h-10/12
      max-md:m-1 max-md:mb-6 max-md:flex-1
      '>


          <form
            onSubmit={handleSubmit(onSubmit)}>
            <Input
              label="Full Name"
              {...register("fullName", {
                required: "Name is required",
                minLength: {
                  value: 2,
                  message: "The name must be at least 2 letters"
                },
                maxLength: {
                  value: 50,
                  message: "The name cannot be over 50 letters"
                }
              })} />
            {errors.fullName ? (
              <p className='text-lg text-error mt-2 mb-4'>
                {errors.fullName.message}
              </p>
            ) : (
              <div className='h-6'></div>
            )
            }
            <Input
              label="Username"
              {...register("username", {
                required: "Username is required",
                minLength: {
                  value: 3,
                  message: "The username must be at least 3 characters"
                },
                maxLength: {
                  value: 20,
                  message: "The name cannot be over 20 characters"
                }
              })} />
            {errors.username ? (
              <p className='text-lg text-error mt-2 mb-4'>
                {errors.username.message}
              </p>
            ) : (
              <div className='h-6'></div>
            )
            }
            <Input
              label="Email"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                  message: "Email is invalid"
                }
              })} />
            {errors.email ? (
              <p className='text-lg text-error mt-2 mb-4'>
                {errors.email.message}
              </p>
            ) : (
              <div className='h-6'></div>
            )
            }
            <Input
              label="Password"
              type="password"
              {...register("password", {
                required: "Password is required",
                onChange: passwordCheck,
                validate: {
                  hasLength: value => value.length >= 8,
                  hasUppercase: value => /[A-Z]/.test(value),
                  hasLowerCase: value => /[a-z]/.test(value),
                  hasNumber: value => /[0-9]/.test(value)
                }
              })} />

            {(!!passwordCompliance || errors.password) ? (
              <div className='text-md mt-2 mb-4'>
                <p>The password must:</p>
                <p className={`flex gap-1 items-center ${passwordCompliance?.hasLength ? "text-success" : "text-error"}`}>{passwordCompliance?.hasLength ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}be at least 8 characters long</p>
                <p className={`flex gap-1 items-center ${passwordCompliance?.hasUppercase ? "text-success" : "text-error"}`}>{passwordCompliance?.hasUppercase ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have an uppercase letter</p>
                <p className={`flex gap-1 items-center ${passwordCompliance?.hasLowerCase ? "text-success" : "text-error"}`}>{passwordCompliance?.hasLowerCase ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have a lowercase letter</p>
                <p className={`flex gap-1 items-center ${passwordCompliance?.hasNumber ? "text-success" : "text-error"}`}>{passwordCompliance?.hasNumber ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have a number</p>
              </div>
            ) : (
              <div className='h-6'></div>
            )
            }

            <Input
              label="Confirm Password"
              type="password"
              {...register("confirmPassword", {
                required: "Please confirm your password",
                onChange: checkConfirmPassword,
                validate: {
                  passwordsMatch: (value) => {
                    return (value === getValues("password")) || "Passwords do not match"
                  }
                }
              })} />
            {confirmPasswordError ? (
              <p className='text-lg text-error mt-2 mb-4'>
                {confirmPasswordError}
              </p>
            ) : (
              <div className='h-6'></div>
            )
            }
            <FormButton name="Register" canSubmit={isValid}
              onSubmit={handleSubmit(onSubmit)} isLoading={isLoading}
            />
          </form>
          <div className='mt-4'>
            <p className='text-lg text-center'>
              Already an ally?
            </p>
            <p className="text-lg text-center">
              <Link
                className='text-accent cursor-pointer'
                to="/login" >
                Log in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
