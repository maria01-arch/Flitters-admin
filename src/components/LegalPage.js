export default function LegalPage({ title, updated, sections }) {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL
  return (
    <div className="legal">
      <header className="legal-bar"><a className="brand" href="/"><span className="logo-mark">F</span>Flitters <b>Ads</b></a></header>
      <main className="legal-body">
        <span className="pill pill-warn">Draft: a lawyer must review this before launch</span>
        <h1>{title}</h1>
        <p className="hint">Last updated {updated}</p>
        {sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {(s.p || []).map((t, i) => <p key={i}>{t}</p>)}
            {s.ul ? <ul>{s.ul.map((t, i) => <li key={i}>{t}</li>)}</ul> : null}
          </section>
        ))}
        <p className="hint">Questions? {support ? 'Email ' + support + '.' : 'Contact Flitters support.'}</p>
        <p className="row"><a href="/terms">Terms</a><a href="/ad-policy">Ad policy</a><a href="/refunds">Refunds</a><a href="/privacy">Privacy</a></p>
      </main>
    </div>
  )
}
