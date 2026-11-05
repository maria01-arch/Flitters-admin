// The Flitters logo (transparent, made for dark backgrounds).
export default function Logo({ className = '' }) {
  return <img className={'logo-img ' + className} src="/logo.png" alt="" aria-hidden="true" width="48" height="38" />
}
