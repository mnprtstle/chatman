import imageCompression from 'browser-image-compression';
import { progressPercentage } from 'framer-motion';

export const compressImage = async (imageBuffer, forDp, setLoading) => {
  if (!imageBuffer) return;

  const canUseWebWorker = ((typeof window.Worker !== "undefined") && (typeof window.OffscreenCanvas !== "undefined")) ? true : false;

  if (setLoading) {
    if (canUseWebWorker) {
      setLoading({ type: 'progress', value: 0 });
    } else {
      setLoading({ type: 'spinner' })
    }
  }

  const onProgressHandler = progressPercentage => {
    if (setLoading) {
      if (canUseWebWorker) {
        setLoading({ type: 'progress', value: progressPercentage });
      }
    }
  }

  if (!forDp) {

    return await imageCompression(imageBuffer, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: canUseWebWorker,
      fileType: 'image/webp',
      onProgress: onProgressHandler,
    });

  } else {

    const lgImgOptions = {
      maxSizeMB: 0.9,
      maxWidthOrHeight: 1600,
      useWebWorker: canUseWebWorker,
      fileType: 'image/webp',
      onProgress: onProgressHandler,
    }

    const smallImgOptions = {
      maxSizeMB: 0.1,
      maxWidthOrHeight: 300,
      useWebWorker: canUseWebWorker,
      fileType: 'image/webp',
      onProgress: onProgressHandler,
    }

    if (canUseWebWorker) {

      return await Promise.all([
        imageCompression(imageBuffer, lgImgOptions),
        imageCompression(imageBuffer, smallImgOptions)
      ])

    } else {

      const lgImgBlob = await imageCompression(imageBuffer, lgImgOptions);
      const smallImgBlob = await imageCompression(imageBuffer, smallImgOptions);
      return [lgImgBlob, smallImgBlob]

    }

  }

}
