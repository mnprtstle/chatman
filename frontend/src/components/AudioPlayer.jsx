import { useEffect, useRef, useState } from 'react'
import PlayIcon from '@heroicons/react/24/solid/PlayIcon';
import MicrophoneIcon from '@heroicons/react/24/outline/MicrophoneIcon';
import PauseIcon from '@heroicons/react/24/solid/PauseIcon';
import ArrowDownTrayIcon from '@heroicons/react/24/outline/ArrowDownTrayIcon';
import Timestamp from './Timestamp';
import { downloadMediaToView, truncateString, timeCounterFormatter } from '../utils';
import { AudioWaveIcon } from '../assets/icons';
import { LoadingCircle } from './LoadingCircle';
import { progressUpdater } from '../api/progressUpdater';

function AudioPlayer({ isSender, message }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [uploading, setUploading] = useState(null);
  const audioRef = useRef(null);
  const sliderRef = useRef(null);
  const isDraggingRef = useRef(false);
  const duration = Math.round(message.audioDuration / 10) / 100;
  const canvasRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);

  const audioUrl = message?.blobUrl;
  // triggered when the user clicks on the download button
  const initiatePlayer = async () => {
    await downloadMediaToView(message._id.toString(), message.messageType, message.attachmentName);
  }



  const handlePlayPause = () => {
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
      setTouched(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }


  //useEffects


  useEffect(() => {
    if (audioUrl && canvasRef.current) {
      const audio = audioRef.current;
      const slider = sliderRef.current;

      //waveform
      let audioContext;
      let audioBuffer;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      function roundedRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x, y + radius);
        ctx.arcTo(x, y + height, x + radius, y + height, radius);
        ctx.arcTo(x + width, y + height, x + width, y + height - radius, radius);
        ctx.arcTo(x + width, y, x + width - radius, y, radius);
        ctx.arcTo(x, y, x, y + radius, radius);

      }

      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const getToAudioBuffer = async (audioUrl) => {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        //decode audio and get an audio buffer
        audioContext.decodeAudioData(arrayBuffer, (audioTypeBuffer) => {
          audioBuffer = audioTypeBuffer;
          drawWaveform(audioTypeBuffer, 0);
        }, (error) => {
          console.error("Error decoding audio data:", error);
        });
      }

      getToAudioBuffer(audioUrl);

      //function for drawing waveform
      function drawWaveform(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0); // Get data from the first channel
        const numSamples = channelData.length;
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const barWidth = 7;
        const horizontalPitch = barWidth + 3;  // to have space between bars f
        const minHeight = 7;
        const numBars = Math.floor((canvasWidth + (barWidth / 2)) / horizontalPitch);
        const samplesPerBar = Math.floor(numSamples / numBars);
        const maxHeight = canvasHeight - 2;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.beginPath();
        for (let i = 0; i < numBars; i++) {
          let sum = 0;
          // Calculate the average amplitude for the segment of samples corresponding to a bar
          for (let j = 0; j < samplesPerBar; j++) {
            const sampleIndex = i * samplesPerBar + j;
            sum += Math.abs(channelData[sampleIndex]); // Use absolute value for amplitude
          }
          const average = sum / samplesPerBar;

          // The bar height is proportional to the average amplitude
          const barHeight = Math.min((minHeight + (average * 3 * maxHeight)), maxHeight); // Multiply  waveform to make more visible
          const x = i * horizontalPitch;
          const y = (canvasHeight - barHeight) / 2;

          // Style the bars   
          roundedRect(ctx, x, y, barWidth, barHeight, 1);
        }

        ctx.clip();
        ctx.save();
        sliderRect(0);
        slider.value = "0";
      }

      function sliderRect(sliderValue) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        if (isSender) {
          ctx.fillStyle = `rgba(0, 0, 0, 0.2)`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
        }

        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (isSender) {
          ctx.fillStyle = `rgba(0, 0, 0, 0.5)`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, 0.6)`;
        }
        ctx.fillRect(0, 0, (sliderValue * canvas.width), canvas.height);
      }

      //event handler functions
      const handleSliderInput = () => {
        // do not touch the code below until audioBuffer is ready
        if (audioBuffer !== undefined) {
          sliderRect(slider.value);
        }
      }

      const handleTimeUpdate = () => {
        if (!isDraggingRef.current) {
          if (audio.duration === Infinity || !audio.duration) {
            slider.value = audio.currentTime / duration;
          } else {
            slider.value = audio.currentTime / audio.duration;
          }
          setTimeElapsed(audio.currentTime);
          // do not touch the code below until audioBuffer is ready
          if (audioBuffer !== undefined) {
            sliderRect(slider.value);
          }
        }
      }

      const handleEnded = () => {
        setTimeElapsed(0);
        audio.currentTime = 0;
        setIsPlaying(false);
        // do not touch the code below until audioBuffer is ready
        if (audioBuffer !== undefined) {
          sliderRect(slider.value);
        }
        setTouched(false);
      }

      const startDragging = () => {
        isDraggingRef.current = true;
      };

      const stopDragging = () => {
        isDraggingRef.current = false;
        if (audio.duration === Infinity || !audio.duration) {
          audio.currentTime = slider.value * duration;
        } else {
          audio.currentTime = slider.value * audio.duration;
        }
      };

      //event listeners
      slider.addEventListener('input', handleSliderInput);
      slider.addEventListener('mousedown', startDragging);
      slider.addEventListener('touchstart', startDragging);
      slider.addEventListener('mouseup', stopDragging);
      slider.addEventListener('touchend', stopDragging);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      return () => {
        slider.removeEventListener('input', handleSliderInput);
        slider.removeEventListener('mousedown', startDragging);
        slider.removeEventListener('touchstart', startDragging);
        slider.removeEventListener('mouseup', stopDragging);
        slider.removeEventListener('touchend', stopDragging);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      }
    }

  }, [audioUrl]);


  useEffect(() => {
    if (message.notSent && !message.failedToSend) {
      progressUpdater.setUpdaterByMode(message._id, setUploading, 'upload');
    }
    if (!message.blobUrl) {
      progressUpdater.setUpdaterByMode(message._id, setDownloading, 'download');
    }


    return () => {
      if (message.notSent && !message.failedToSend) {
        progressUpdater.removeUpdaterByMode(message._id, 'upload');
      }
      if (!message.blobUrl) {
        progressUpdater.removeUpdaterByMode(message._id, 'download')
      }
    }

  }, [message.notSent, message.failedToSend, message.blobUrl]);

  useEffect(() => {

    return () => {
      if (message?.blobUrl) {
        URL.revokeObjectURL(message?.blobUrl);
      }
    }
  }, [message?.blobUrl]);


  return (
    <div className='px-2 h-15 flex flex-col relative'>
      <div className='flex flex-1 h-full items-center gap-3'>
        {!audioUrl ? (
          <>
            <div className='relative mr-5   '>
              <AudioWaveIcon size="25" color={isSender ? "var(--color-base-100" : "var(--color-base-content)"} />
              <MicrophoneIcon className='absolute -bottom-1.5 -right-1.5 size-3' />
            </div>
            <p className='mr-5'>
              {truncateString(message.attachmentName, 50, true)}
            </p>

            {(!message.blobUrl && downloading) ? (

              <LoadingCircle type={downloading?.type} progress={downloading?.progress} size='2' thickness='4' lightTheme={isSender} />
            ) : (

              <button
                disabled={downloading}
                onClick={initiatePlayer}
                className={`cursor-pointer border-2 p-0.5 rounded-md hover:scale-110 active:scale-100 active:brightness-90 mr-3 transition  ${isSender ? "border-base-100/60" : "border-base-content"}`}
              >

                <ArrowDownTrayIcon
                  className={`size-4 ${isSender ? "text-base-100" : "text-base-content"}`} />
              </button>
            )}


          </>
        ) : (
          <>
            {(message.notSent && uploading) ? (
              <LoadingCircle type={uploading?.type} progress={uploading?.progress} size='2' thickness='4' lightTheme={isSender} />
            ) : (

              <button
                onClick={handlePlayPause}
                className='cursor-pointer relative'>
                {isPlaying ? (
                  <PauseIcon
                    className='size-8 hover:scale-110 active:scale-100 active:brightness-90 transition' />
                ) : (
                  <PlayIcon className='size-8 hover:scale-110 active:scale-100 active:brightness-90 transition' />
                )}
                <MicrophoneIcon className='absolute -bottom-1 -right-1 size-3' />
              </button>
            )}

            <div className='w-[174px] h-[28px] my-1 mx-4 relative flex justify-center items-end'>

              <div className="absolute inset-0">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full"
                  width="348"
                  height="56"></canvas>
              </div>
              <div className="absolute inset-0 flex items-center">
                <input
                  ref={sliderRef}
                  type="range"
                  name="slider"
                  min="0"
                  max="1"
                  step="0.001"
                  className='appearance-none my-auto h-4 w-full bg-transparent outline-none z-10 
                                    [&::-webkit-slider-thumb]:appearance-none 
                                    [&::-webkit-slider-thumb]:h-3 
                                    [&::-webkit-slider-thumb]:w-3 
                                    [&::-webkit-slider-thumb]:rounded-xs 
                                    [&::-webkit-slider-thumb]:bg-accent
                                    [&::-webkit-slider-thumb]:shadow-sm
             
                                    [&::-moz-range-thumb]:appearance-none 
                                    [&::-moz-range-thumb]:h-3 
                                    [&::-moz-range-thumb]:w-3 
                                    [&::-moz-range-thumb]:rounded-full 
                                    [&::-moz-range-thumb]:bg-accent"
                                    [&::-moz-slider-thumb]:shadow-sm
                                    '
                />
              </div>
            </div>
            <audio ref={audioRef} src={audioUrl} hidden />
          </>
        )}

      </div>
      <div className={`h-2 shrink-0 text-xs ${isSender ? "text-gray-600" : "text-gray-400"}`}>
        <p className='absolute -bottom-0.5 left-15'>
          {timeCounterFormatter(!touched ? Math.floor(duration) : Math.floor(timeElapsed))}
        </p>
        <Timestamp isSender={isSender} message={message} />
      </div>

    </div >
  )
}

export default AudioPlayer

