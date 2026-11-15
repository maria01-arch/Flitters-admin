// Shown instantly while a page loads, so taps feel responsive.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="skel">
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-card" />
      <div className="sk sk-card" />
    </div>
  )
}
