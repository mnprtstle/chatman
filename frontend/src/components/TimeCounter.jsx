import { useState, useEffect } from 'react';

const TimeCounter = ({ canSend, setCanSend }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // Set up the time count.
    const timer = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000); // Update every 1000ms (1 second)

    // Clean up the time count when the component unmounts or seconds change.
    return () => clearInterval(timer);
  }, []); // Re-run effect when seconds change

  useEffect(() => {
    if (!canSend && seconds > 0) {
      setCanSend(true)
    }
  }, [seconds, canSend])

  // Format the remaining time for display.
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60)
      .toString()
      .padStart(2, '0');
    const remainingSeconds = (timeInSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  return (
    <div>
      <p className='font-semibold'>{formatTime(seconds)}</p>
    </div>
  );
};

export default TimeCounter;
