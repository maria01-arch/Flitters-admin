'use client'
import Icon from '@/components/Icon'

// Opens the quick search (the same one the top bar and the "/" key open).
export default function SearchButton({ label = 'Search people and pages' }) {
  return (
    <button type="button" className="searchbtn" onClick={() => window.dispatchEvent(new Event('open-search'))}>
      <Icon name="search" />
      <span>{label}</span>
      <kbd>/</kbd>
    </button>
  )
}
