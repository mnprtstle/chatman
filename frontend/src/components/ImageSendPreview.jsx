import { useEffect, useState } from 'react';
import LoadingBar from './LoadingBar';
import { compressImage } from '../utils/imageCompressor';

export default function ImageSendPreview({ image, setImage }) {
  // can be of type spinner or progress
  const [loading, setLoading] = useState({ type: 'spinner' });

  useEffect(() => {

    (async () => {
      if (!image || image.ready) return;

      const compressedBlob = await compressImage(image?.bufferToSend, false, setLoading);

      if (compressedBlob) {
        setImage({
          ready: true,
          bufferToSend: compressedBlob,
          localImageUrl: URL.createObjectURL(compressedBlob)
        });
      }

    })();

    return () => {
      if (image?.localImageUrl) {
        URL.revokeObjectURL(image.localImageUrl);
      }
    }

  }, [image]);

  return (
    <>
      <div className="absolute w-full h-full inset-0 bg-black/80 backdrop-blur-lg z-20">
        {!image?.ready ? (
          <div className='w-full h-full flex flex-col gap-4 items-center justify-center'>
            <LoadingBar
              type={loading.type}
              progress={loading.value}
              showRing={true}
            />
            <p className='animate-pulse text-base-content/60 text-md italic'>Loading Image...</p>
          </div>
        ) : (
          <img
            className='h-full w-full object-contain'
            src={image.localImageUrl} alt="image-attachment" />
        )}
      </div>

    </>
  );
}

