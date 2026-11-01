import Icon from '@/components/Icon'

// What the ad will look like in the apps (approximate).
export default function AdPreview({ placement, business, content, ctaText, imageUrl, videoUrl }) {
  const cta = ctaText || 'Learn more'
  const initial = (business || 'F').trim().charAt(0).toUpperCase()
  if (placement === 'reel') {
    return (
      <div className="phone reelmock" aria-label="Reels ad preview">
        <div className="reelmock-media">{videoUrl ? <video src={videoUrl} muted playsInline preload="metadata" /> : 'Your video'}</div>
        <div className="reelmock-shade" />
        <div className="reelmock-info">
          <div className="who"><span className="av">{initial}</span><strong>{business}</strong><span className="sp">Sponsored</span></div>
          {content ? <p>{content}</p> : null}
          <span className="cta">{cta}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="phone feedmock" aria-label="Feed ad preview">
      <div className="feedmock-head">
        <span className="av">{initial}</span>
        <div><strong>{business}</strong><small>Sponsored</small></div>
      </div>
      {content ? <p>{content}</p> : null}
      <div className="feedmock-media">{imageUrl ? <img src={imageUrl} alt="" /> : 'Your image'}</div>
      <div className="feedmock-cta"><span>{cta}</span><Icon name="arrow" /></div>
    </div>
  )
}
