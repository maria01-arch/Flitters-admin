const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c1-4 4-6 8-6s7 2 8 6',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5 10 17.5 19 7',
  alert: 'M12 8v5M12 17h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  feed: 'M5 4h14v16H5zM5 9h14M8 13h8M8 16h5',
  megaphone: 'M3 10v4l11 5V5L3 10ZM14 8a4 4 0 0 1 0 8M6 15v5',
}

export default function Icon({ name, className = '' }) {
  return (
    <svg className={'icon ' + className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}
