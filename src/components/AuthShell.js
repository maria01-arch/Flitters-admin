export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <aside className="auth-hero">
        <div className="auth-hero-in">
          <span className="logo-mark">F</span>
          <h1>Put your business in front of Flitters.</h1>
          <p>Create an ad in minutes. Pay once. We review within 24 hours, then you are live.</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  )
}
