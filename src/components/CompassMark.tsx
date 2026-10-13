// Code-native compass mark from the Clear Path design reference.
export function CompassMark() {
  return <svg className="compass-mark" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="24" cy="24" r="14" /><circle cx="24" cy="24" r="4" />
    <path d="M24 2v12m0 20v12M2 24h12m20 0h12M10 10l7 7m14 14 7 7M10 38l7-7m14-14 7-7" />
    <path d="m24 6 5 18-5 18-5-18Z" fill="currentColor" stroke="none" /><path d="m6 24 18-5 18 5-18 5Z" />
  </svg>;
}
