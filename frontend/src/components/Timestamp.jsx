import { CheckIcon, ClockIcon, DoubleCheckIcon } from '../assets/icons';
import moment from 'moment';
import { MessageTypes } from '../constants';


function Timestamp({ isSender, brightTimeColor = false, className = "", message }) {
  const needsPlaceholderForTimestamp = message.content && ((message.messageType === MessageTypes.IMAGE) || (message.messageType === MessageTypes.TEXT));
  const timeToDisplay = moment(message.deviceTime).format("LT");

  let tickToUse = "";

  if (isSender) {
    const { intendedParticipantCount, delivered, seen, notSent, failedToSend } = message;

    if ((intendedParticipantCount !== undefined) && (seen?.length === intendedParticipantCount)) {
      tickToUse = "seen";
    } else if ((intendedParticipantCount !== undefined) && (delivered?.length === intendedParticipantCount)) {
      tickToUse = "delivered";
    } else if (failedToSend) {
      tickToUse = "error";
    } else if (!notSent) {
      tickToUse = "sent";
    } else {
      tickToUse = "clock"
    }

  }


  return (
    // to reserve some space for timestamp and read receipt icon
    <>
      {needsPlaceholderForTimestamp && (
        <span className='opacity-0 '>
          <span className="mt-1 ml-2 text-xs">
            {timeToDisplay}
            {isSender && (
              "88:88"
            )}
          </span>

        </span>
      )}

      <span className={`absolute -bottom-0.5 right-2 mt-1 ml-2 text-xs flex gap-1 items-center  ${className} ${(isSender && !brightTimeColor) ? "text-gray-600" : !brightTimeColor ? "text-gray-400" : "text-base-content"}`}>
        {timeToDisplay}
        {isSender && (
          <>

            {(tickToUse === "seen") ? (
              <DoubleCheckIcon size="12" color="#CFA302" />
            ) : (tickToUse === "delivered") ? (
              <DoubleCheckIcon size="12" color={brightTimeColor ? "var(--color-base-content)" : "var(--color-gray-600)"} />
            ) : (tickToUse === "sent") ? (
              <CheckIcon size="12" strokeWidth='2.8' color={brightTimeColor ? "var(--color-base-content)" : "var(--color-gray-600)"} />
            ) : (tickToUse === "clock") ? (
              <ClockIcon size="12" color={brightTimeColor ? "var(--color-base-content)" : "var(--color-gray-600)"} />
            ) : (
              null
            )}

          </>
        )}
      </span>



    </>
  )
}

export default Timestamp
