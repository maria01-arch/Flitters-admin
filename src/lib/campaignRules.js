const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u)

// What a campaign needs before it can be paid for or sent to review.
// Returns an error message, or null when it is complete.
export function completeness(c, { needFutureStart }) {
  if (!c.name || c.name.trim().length < 2) return 'Give your campaign a name'
  if (!['feed', 'reel'].includes(c.placement)) return 'Choose where your ad shows'
  if (!https(c.link_url)) return 'Add the link people open (it must start with https://)'
  if (c.placement === 'feed' && (!c.image_url || c.video_url)) return 'A feed ad needs an image'
  if (c.placement === 'reel' && !c.video_url) return 'A Reels ad needs a video'
  if (c.content && c.content.length > 300) return 'The text is too long'
  if (c.cta_text && c.cta_text.length > 24) return 'The button text is too long'
  if (!c.start_at || !c.end_at || !c.days) return 'Choose your dates'
  if (needFutureStart) {
    const tomorrow = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime() + 86400000
    if (new Date(c.start_at).getTime() < tomorrow) return 'Your start date has passed. Edit the campaign and pick a new one.'
  }
  return null
}
