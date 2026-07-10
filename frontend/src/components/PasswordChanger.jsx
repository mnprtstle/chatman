import { useState } from 'react'
import { FormButton, Input } from '../components'
import { useForm } from "react-hook-form"
import CheckIcon from '@heroicons/react/24/outline/CheckIcon';
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { changeCurrentPassword } from '../api';
import { requestHandler } from '../utils';
import ChevronLeftIcon from '@heroicons/react/24/outline/ChevronLeftIcon';


function PasswordChanger({ setShowPasswordChanger }) {
  const { register, handleSubmit, formState: { isValid, errors }, getValues } = useForm({
    mode: "onTouched",
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      confirmNewPassword: ""
    }
  });
  const [passwordCompliance, setPasswordCompliance] = useState(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);


  const onSubmit = async (data) => {
    const { oldPassword, newPassword } = data
    await requestHandler(
      async () => await changeCurrentPassword({ oldPassword, newPassword }),
      setIsLoading,
      () => {
        alert("Password changed successfully");
        setShowPasswordChanger(false);
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

    if (getValues("oldPassword") === typedPassword) {
      copyCompliance.differentPassword = false;
    } else {
      copyCompliance.differentPassword = true;
    }


    setPasswordCompliance(copyCompliance);
  }

  const checkConfirmPassword = e => {
    const typedConfirmPassword = e.target.value;
    if (getValues("newPassword") !== typedConfirmPassword) {
      setConfirmPasswordError("Passwords do not match")
    } else {
      setConfirmPasswordError("")
    }
  }

  return (
    <>

      <div className='flex gap-4 items-center p-3'>
        <ChevronLeftIcon
          onClick={() => setShowPasswordChanger(false)}
          className='text-base-content stroke-2 size-7 my-auto mx-1 cursor-pointer hover:scale-110 active:scale-100 active:brightness-90' />
        <p className="flex-1 text-center text-md">
          Profile
        </p>

      </div>

      <div className='m-auto sm:w-xs md:w-sm overflow-y-scroll py-4 px-6'>
        <form
          onSubmit={handleSubmit(onSubmit)}>

          <Input
            label="Old Password"
            type="password"
            {...register("oldPassword", {
              required: "Old Password is required",
            })} />
          {errors.oldPassword ? (
            <p className='text-lg text-error mt-2 mb-4'>
              {errors.oldPassword.message}
            </p>
          ) : (
            <div className='h-6'></div>
          )
          }

          <Input
            label="New Password"
            type="password"
            {...register("newPassword", {
              required: "New Password is required",
              onChange: passwordCheck,
              validate: {
                hasLength: value => ((value.length >= 8) && (value.length <= 25)),
                hasUppercase: value => /[A-Z]/.test(value),
                hasLowerCase: value => /[a-z]/.test(value),
                hasNumber: value => /[0-9]/.test(value),
                differentPassword: value => (value !== getValues("oldPassword"))
              }
            })} />

          {(!!passwordCompliance || errors.password) ? (
            <div className='text-md mt-2 mb-4'>
              <p>The password must:</p>
              <p className={`flex gap-1 items-center ${passwordCompliance?.hasLength ? "text-success" : "text-error"}`}>{passwordCompliance?.hasLength ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}be between 8 and 25 characters long</p>
              <p className={`flex gap-1 items-center ${passwordCompliance?.hasUppercase ? "text-success" : "text-error"}`}>{passwordCompliance?.hasUppercase ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have an uppercase letter</p>
              <p className={`flex gap-1 items-center ${passwordCompliance?.hasLowerCase ? "text-success" : "text-error"}`}>{passwordCompliance?.hasLowerCase ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have a lowercase letter</p>
              <p className={`flex gap-1 items-center ${passwordCompliance?.hasNumber ? "text-success" : "text-error"}`}>{passwordCompliance?.hasNumber ? <CheckIcon className='size-4' /> : <XMarkIcon className='size-4' />}have a number</p>
              {!passwordCompliance?.differentPassword && (
                <p className="flex gap-1 items-center text-error"><XMarkIcon className='size-4' />be not the same as old one</p>
              )}
            </div>
          ) : (
            <div className='h-6'></div>
          )
          }

          <Input
            label="Confirm New Password"
            type="password"
            {...register("confirmNewPassword", {
              required: "Please confirm your new password",
              onChange: checkConfirmPassword,
              validate: {
                passwordsMatch: (value) => {
                  return (value === getValues("newPassword")) || "Passwords do not match"
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
          <FormButton name="Submit" canSubmit={isValid}
            onSubmit={handleSubmit(onSubmit)} isLoading={isLoading}
          />
        </form>

      </div>

    </>
  )
}

export default PasswordChanger;
