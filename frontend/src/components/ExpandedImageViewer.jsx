import { setExpandedImage } from '../store/expandedImageSlice'
import { useDispatch } from 'react-redux';
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon';
import { DownloadToDeviceIcon } from '../assets/icons';
import { downloadMediaToDevice } from '../utils';

function ExpandedImageViewer({ expandedImage }) {
  const dispatch = useDispatch();

  return (
    <div className="absolute w-screen h-screen inset-0 bg-black/80 backdrop-blur-lg z-10">
      <img
        className='h-full w-full object-contain'
        src={expandedImage} alt="" />
      <div className='absolute right-0 top-0 flex items-center'>
        <button
          onClick={() => downloadMediaToDevice(expandedImage)}
          className='cursor-pointer border-2 border-base-content p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 m-3 transition'
        >
          <DownloadToDeviceIcon size="15" color="var(--color-base-content)" className="m-auto" />
        </button>
        <button
          onClick={() => dispatch(setExpandedImage(""))}
          className='cursor-pointer border-2 border-base-content p-1 rounded-md hover:scale-110 active:scale-100 active:brightness-90 m-3 transition'>
          <XMarkIcon className='size-7 text-base-content stroke-3' />
        </button>
      </div>
    </div>
  )
}

export default ExpandedImageViewer
