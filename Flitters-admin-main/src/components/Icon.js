const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c1-4 4-6 8-6s7 2 8 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c2 .6 3.2 2.2 3.5 5',
  message: 'M4 5h16v11H9l-5 4z',
  megaphone: 'M3 10v4l11 5V5L3 10ZM14 8a4 4 0 0 1 0 8M6 15v5',
  tag: 'M3 12V4h8l10 10-8 8L3 12ZM7.5 8h.01',
  clipboard: 'M9 4h6v3H9zM6 5h-.5A1.5 1.5 0 0 0 4 6.5v14A1.5 1.5 0 0 0 5.5 22h13a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 18.5 5H18M8 12h8M8 16h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5 10 17.5 19 7',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
}

export default function Icon({ name, className = '' }) {
  return (
    <svg className={'icon ' + className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  )
}
