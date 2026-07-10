import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon'
import { useEffect, useRef, useState } from 'react'
import TimeCounter from './TimeCounter'
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import Visualizer from './Visualizer';

function RecordingBar({
  isRecording,
  setIsRecording,
  setVoiceData
}) {
  const mediaStream = useRef(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const [start, setStart] = useState(0);
  const [canSend, setCanSend] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (mediaStream.current) {
        stream.getTracks().forEach(track => track.stop());
        return
      }

      mediaStream.current = stream;
      mediaRecorder.current = new MediaRecorder(stream);

      mediaRecorder.current.ondataavailable = e => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      }

      mediaRecorder.current.start();

      setStart(Date.now());
    } catch (error) {
      alert("Cannot start recording, make sure the application has permission to use microphone for recording audio");
    }
  }

  const deleteRecording = () => {
    stopRecording();
    setIsRecording(false);
  }

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaStream.current.getTracks().forEach(track => track.stop());
    }
  }

  // process recording to send and then send in chatFooter
  const processRecording = () => {

    mediaRecorder.current.onstop = async () => {
      try {
        const duration = Date.now() - start;
        const recordedBlob = new Blob(chunks.current, { type: "audio/mpeg " });
        const browserVoiceUrl = URL.createObjectURL(recordedBlob);
        const voiceName = `${Date.now()}-voice.mp3`;
        setVoiceData({ voiceName, recordedBlob, duration, browserVoiceUrl });
        setIsRecording(false);
      } catch (error) {
        alert("Error occured while recording the audio, please try recording again. If the issue persists, please contact CHATMAN customer support");
      }
    }

    stopRecording();
  }

  // useEffect to start recording when component mounts first
  useEffect(() => {
    if (isRecording) {
      startRecording();
    }
    return () => {
      stopRecording();
    }
  }, [isRecording]);

  return (
    <div className='flex gap-6 px-2 h-12 pr-4 items-center justify-between'>
      <div className='flex-1'>
        <button
          onClick={deleteRecording}
          className='cursor-pointer ml-2 border-[1px] border-base-content p-0.5 rounded-md hover:scale-110 active:scale-100 active:brightness-90'>
          <XMarkIcon className='size-3 text-base-content ' />
        </button>
      </div>
      {!!start && (
        <>
          <TimeCounter canSend={canSend} setCanSend={setCanSend} />
          <div className='w-3 h-3 inline bg-error/80 shrink-0 rounded-full animate-pulse'></div>
        </>
      )}


      <Visualizer />

      <button
        disabled={!canSend}
        onClick={processRecording}
      >
        <ArrowUpIcon
          className={`cursor-pointer size-6 stroke-2 ml-8 ${canSend ? "hover:scale-110 active:scale-100 active:brightness-90 text-accent" : "text-neutral"}`} />
      </button>

    </div>
  )
}

export default RecordingBar
