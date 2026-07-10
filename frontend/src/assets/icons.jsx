export function GoogleIcon({ size = "30", color, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className}><path fill={color} d="M3.064 7.51A10 10 0 0 1 12 2c2.695 0 4.959.991 6.69 2.605l-2.867 2.868C14.786 6.482 13.468 5.977 12 5.977c-2.605 0-4.81 1.76-5.595 4.123c-.2.6-.314 1.24-.314 1.9s.114 1.3.314 1.9c.786 2.364 2.99 4.123 5.595 4.123c1.345 0 2.49-.355 3.386-.955a4.6 4.6 0 0 0 1.996-3.018H12v-3.868h9.418c.118.654.182 1.336.182 2.045c0 3.046-1.09 5.61-2.982 7.35C16.964 21.105 14.7 22 12 22A9.996 9.996 0 0 1 2 12c0-1.614.386-3.14 1.064-4.49" /></svg>
  );
}

export function GithubIcon({ size = "30", color, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className}><path fill={color} d="M12.001 2c-5.525 0-10 4.475-10 10a9.99 9.99 0 0 0 6.837 9.488c.5.087.688-.213.688-.476c0-.237-.013-1.024-.013-1.862c-2.512.463-3.162-.612-3.362-1.175c-.113-.288-.6-1.175-1.025-1.413c-.35-.187-.85-.65-.013-.662c.788-.013 1.35.725 1.538 1.025c.9 1.512 2.337 1.087 2.912.825c.088-.65.35-1.087.638-1.337c-2.225-.25-4.55-1.113-4.55-4.938c0-1.088.387-1.987 1.025-2.687c-.1-.25-.45-1.275.1-2.65c0 0 .837-.263 2.75 1.024a9.3 9.3 0 0 1 2.5-.337c.85 0 1.7.112 2.5.337c1.913-1.3 2.75-1.024 2.75-1.024c.55 1.375.2 2.4.1 2.65c.637.7 1.025 1.587 1.025 2.687c0 3.838-2.337 4.688-4.562 4.938c.362.312.675.912.675 1.85c0 1.337-.013 2.412-.013 2.75c0 .262.188.574.688.474A10.02 10.02 0 0 0 22 12c0-5.525-4.475-10-10-10" /></svg>
  );
}

export function FacebookIcon({ size = "30", color, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className}><path fill={color} d="M15.402 21v-6.966h2.333l.349-2.708h-2.682V9.599c0-.784.218-1.319 1.342-1.319h1.434V5.857a19 19 0 0 0-2.09-.107c-2.067 0-3.482 1.262-3.482 3.58v1.996h-2.338v2.708h2.338V21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1z"></path></svg>
  );
}

export function CheckIcon({ size = "30", color, strokeWidth = "1.8", className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} className={className} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeLinecap="square" strokeWidth={strokeWidth} d="m19.57 7.378l-9.191 9.193l-4.95-4.95"></path></svg>
  );
}

export function DoubleCheckIcon({ size = "30", color, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeLinecap="square" strokeWidth={2.4} d="m2.1 11.414l4.95 4.95l.354-.354m8.839-8.839l-3.89 3.89M21.9 7.17l-9.192 9.193l-4.95-4.95"></path></svg>
  );
}

export function ClockIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"><g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}><path d="M3 9.4c0-2.24 0-3.36.436-4.216a4 4 0 0 1 1.748-1.748C6.04 3 7.16 3 9.4 3h5.2c2.24 0 3.36 0 4.216.436a4 4 0 0 1 1.748 1.748C21 6.04 21 7.16 21 9.4v5.2c0 2.24 0 3.36-.436 4.216a4 4 0 0 1-1.748 1.748C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.436a4 4 0 0 1-1.748-1.748C3 17.96 3 16.84 3 14.6z"></path><path d="M12 6v6l4 2"></path></g></svg>
  );
}

export function ErrorIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit={10} strokeWidth={1.5} d="M12 16h.008M12 8v5M3.23 7.913L7.91 3.23c.15-.15.35-.23.57-.23h7.05c.21 0 .42.08.57.23l4.67 4.673c.15.15.23.35.23.57v7.054c0 .21-.08.42-.23.57L16.1 20.77c-.15.15-.35.23-.57.23H8.47a.8.8 0 0 1-.57-.23l-4.67-4.673a.8.8 0 0 1-.23-.57V8.473c0-.21.08-.42.23-.57z"></path></svg>
  )
}

export function ErrorIconMessageBox({ size = "30", color }) {
  return (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 20 20">
    <path fill={color} d="M13.728 1H6.272L1 6.272v7.456L6.272 19h7.456L19 13.728V6.272zM11 15H9v-2h2zm0-4H9V5h2z"></path>
  </svg>
  )
}

export function LogoutIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <g transform="scale(-1,1) translate(-24,0)">
        <path fill={color} d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h7v2H5v14h7v2zm11-4l-1.375-1.45l2.55-2.55H9v-2h8.175l-2.55-2.55L16 7l5 5z" />
      </g>
    </svg>

  );
}

export function DownloadToDeviceIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256"><path fill={color} d="M240 136v64a16 16 0 0 1-16 16H32a16 16 0 0 1-16-16v-64a16 16 0 0 1 16-16h40a8 8 0 0 1 0 16H32v64h192v-64h-40a8 8 0 0 1 0-16h40a16 16 0 0 1 16 16m-117.66-2.34a8 8 0 0 0 11.32 0l48-48a8 8 0 0 0-11.32-11.32L136 108.69V24a8 8 0 0 0-16 0v84.69L85.66 74.34a8 8 0 0 0-11.32 11.32ZM200 168a12 12 0 1 0-12 12a12 12 0 0 0 12-12"></path></svg>

  );
}

export function AudioWaveIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 14 14">
      <rect x="0.25" y="5.25" width="1.5" height="3.5" rx="0.5" fill={color} />
      <rect x="3.25" y="3" width="1.5" height="8" rx="0.5" fill={color} />
      <rect x="6.25" y="1" width="1.5" height="12" rx="0.5" fill={color} />
      <rect x="9.25" y="3" width="1.5" height="8" rx="0.5" fill={color} />
      <rect x="12.25" y="5.25" width="1.5" height="3.5" rx="0.5" fill={color} />
    </svg>

  );
}

export function ProfileIcon({ size = "30", color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 512 512">
      <path fill={color} d="M384 16c48 32 64 80 64 112c0 128 0 256-32 368l-16-112c-48 32-112 64-144 64s-96-32-144-64L96 496C64 384 64 256 64 128c0-32 16-80 64-112c-16 48-16 96 0 128c64-32 192-32 256 0c16-32 16-80 0-128m0 256c-33.7 46.8-52 57.2-112 80c33.5 32 95.5 21.5 128-16c14.1-16.3 6.8-44.6-16-64m-256 0c-22.8 19.4-30.1 47.7-16 64c32.5 37.5 94.5 48 128 16c-60-22.8-78.3-33.2-112-80"></path>
    </svg>

  );
}
