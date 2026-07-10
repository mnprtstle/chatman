import moment from 'moment';

function DateHeading({ timestamp, test }) {
  const dayToDisplay = () => {
    const now = moment();
    const date = moment(timestamp);

    if (date.isSame(now, "day")) {
      return "Today";
    } else if (date.isSame(now.subtract(1, "day"), "day")) {
      return "Yesterday";
    } else if (date.isAfter(now.subtract(7, "days"))) {
      return date.format('dddd');
    } else if (date.isAfter(now.subtract(180, "days"))) {
      return date.format('ddd, MMM D');
    } else {
      return moment().format('L');
    }
  }

  return (
    <div className='py-3'>
      <div className='mx-auto max-w-xl w-fit text-md bg-neutral px-2 py-1 rounded-md'>
        {test ? "testing" : dayToDisplay()}
      </div>
    </div>
  )
}

export default DateHeading
