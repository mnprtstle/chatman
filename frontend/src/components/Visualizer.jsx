import { useEffect, useRef } from 'react';

function Visualizer() {
  const isMountedRef = useRef(true);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);

  const canvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  const historyIndexRef = useRef(0);
  const historyBufferRef = useRef(null);
  const frameCountRef = useRef(0);

  const startVisualizing = async () => {
    try {
      // --- Initialize Audio ---
      // AudioContext created
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

      // create streamInstance in a separate variable
      const streamInstance = await navigator.mediaDevices.getUserMedia({ audio: true });

      // check if the render has been unmounted by the time above promise resolves
      if (!isMountedRef.current) {
        streamInstance.getTracks().forEach(track => track.stop());
        // turn isMountedRef to true for next render
        isMountedRef.current = true;
        // stop further execution of startVisualizing
        return;
      }


      streamRef.current = streamInstance;
      // Get audio stream from microphone
      sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);

      // Create an analyser node
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 8192; // Determines the number of data points

      // Connect the source to the analyser
      sourceRef.current.connect(analyserRef.current);

      draw();

    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.arcTo(x, y + height, x + radius, y + height, radius);
    ctx.arcTo(x + width, y + height, x + width, y + height - radius, radius);
    ctx.arcTo(x + width, y, x + width - radius, y, radius);
    ctx.arcTo(x, y, x, y + radius, radius);
    ctx.fill();
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const framesPerUpdate = 6;
    const barWidth = 5.8;
    const horizontalPitch = 1.5 * barWidth;
    const bufferSize = 40;
    const analyser = analyserRef.current;
    let absoluteBarsCounterUntil40 = 0

    historyBufferRef.current = new Array(bufferSize).fill(0);
    const historyBuffer = historyBufferRef.current;
    // let historyIndex = 0;

    function getAmplitude() {
      frameCountRef.current++;

      // Check if it is time for the new bar
      if (frameCountRef.current % framesPerUpdate === 0) {
        if (absoluteBarsCounterUntil40 < 40) {
          absoluteBarsCounterUntil40++;
        }

        frameCountRef.current = 0;
        // Get the amplitude data from the analyser
        const bufferLength = analyserRef.current.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        // Calculate the average amplitude for the current frame
        // This simplifies the waveform to a single value per frame
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128);
          sumSquares += normalized * normalized
        }
        const rms = sumSquares / bufferLength;
        // Add the new average to our history buffer

        historyBufferRef.current[historyIndexRef.current] = rms;
        // Increment the history index, wrapping around if it reaches the end
        historyIndexRef.current = (historyIndexRef.current + 1) % bufferSize;


      }

      // --- Drawing on the Canvas ---
      // Clear the canvas with a black background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // declare maxHeight, progress and displacement, that depend on refs
      const maxHeight = canvas.height - 0.5;
      const progress = (frameCountRef.current % framesPerUpdate) / framesPerUpdate;
      const displacement = progress * horizontalPitch;

      //draw initial 3 bars
      for (let i = 0; i < 3; i++) {
        const bufferIndex = (historyIndexRef.current + i) % bufferSize;
        const value = historyBuffer[bufferIndex];
        const barHeight = Math.min((value / 127) * 2 * maxHeight, maxHeight);
        const endingHeight = Math.max(((i / 3) * barHeight), barWidth);
        const heightDecrements = barHeight / 3;

        let instantHeight;
        if ((absoluteBarsCounterUntil40 < 40) && (bufferIndex > absoluteBarsCounterUntil40) && (value === 0)) {
          instantHeight = 0;
        } else {
          instantHeight = endingHeight + ((1 - progress) * heightDecrements);
        }

        const dx = (i * (barWidth + 2.9)) - displacement;
        const dy = (canvas.height - instantHeight) / 2;

        ctx.fillStyle = "oklch(90% 0.001 106.423)";
        roundedRect(ctx, dx, dy, barWidth, instantHeight, 1);

      }

      // Draw bw initial 3 and final 3 
      for (let b = 3; b < bufferSize - 3; b++) {
        // We read from the buffer starting from the current index to create the scrolling effect
        const bufferIndex = (historyIndexRef.current + b) % bufferSize;
        // The bar height is proportional to the audio value
        const value = historyBuffer[bufferIndex];

        // Calculate position
        let barHeight;
        if ((absoluteBarsCounterUntil40 < 40) && (bufferIndex > absoluteBarsCounterUntil40) && (value === 0)) {
          barHeight = 0;
        } else {
          barHeight = Math.max((Math.min((value / 127) * 2 * maxHeight, maxHeight)), barWidth);
        }

        const x = (b * horizontalPitch) - displacement;
        const y = (canvas.height - barHeight) / 2;

        // Create a color for the bars
        ctx.fillStyle = "oklch(90% 0.001 106.423)";
        roundedRect(ctx, x, y, barWidth, barHeight, 1);
      }

      for (let f = bufferSize - 3; f < bufferSize; f++) {
        const bufferIndex = (historyIndexRef.current + f) % bufferSize;
        const value = historyBuffer[bufferIndex];
        const barHeight = Math.min((value / 127) * 2 * maxHeight, maxHeight);
        const startingHeight = Math.max((barHeight * (bufferSize - f - 1) / 3), barWidth);
        const heightIncrements = barHeight / 3;

        let instantHeight;
        if ((absoluteBarsCounterUntil40 < 40) && (bufferIndex > absoluteBarsCounterUntil40) && (value === 0)) {
          instantHeight = 0;
        } else {
          instantHeight = startingHeight + (heightIncrements * progress);
        }

        const dx = (f * (barWidth + 2.9)) - displacement;
        const dy = (canvas.height - instantHeight) / 2;

        //fill time
        ctx.fillStyle = "oklch(90% 0.001 106.423)";
        roundedRect(ctx, dx, dy, barWidth, instantHeight, 1);
      }

      // Schedule the next frame
      animationFrameIdRef.current = requestAnimationFrame(getAmplitude);

    }
    getAmplitude();

  }

  const stopVisualizing = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close()
        .then(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
        })
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
  }

  useEffect(() => {
    startVisualizing();

    return () => {
      isMountedRef.current = false;
      stopVisualizing();
    }

  }, []);

  return (
    <div className="visualizer">
      <canvas
        ref={canvasRef}
        width="348" height="56"
        className='w-[174px] h-[28px] clip-path-custom'
      ></canvas>
    </div>
  )
}

export default Visualizer;
