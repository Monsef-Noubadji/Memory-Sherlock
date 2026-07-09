const PATHS: Record<string, string> = {
  overview: 'M2 8h4l2-5 3 10 2-5h3', // pulse line
  snapshots: 'M3 3h10v10H3zM3 7h10M7 3v10', // grid
  leaks: 'M8 2l6 11H2zM8 6v3M8 11.2v.1', // warning triangle
  detached: 'M5 5h6v6H5zM2 13l3-3M11 5l3-3', // detached box
  react: 'M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8 8m-6 0a6 3 0 1 0 12 0a6 3 0 1 0-12 0',
  listeners: 'M8 3a4 4 0 0 1 4 4v3h1.5v2h-11v-2H4V7a4 4 0 0 1 4-4z', // bell
  observers: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', // eye
  caches: 'M8 2c3.3 0 6 .9 6 2s-2.7 2-6 2-6-.9-6-2 2.7-2 6-2zM2 4v8c0 1.1 2.7 2 6 2s6-.9 6-2V4', // db
  timeline: 'M2 13h12M4 10v3M7 6v7M10 8v5M13 3v10', // bars
  insights: 'M8 1.5l1.8 4.2L14 7.5l-4.2 1.8L8 13.5 6.2 9.3 2 7.5l4.2-1.8z', // spark
  settings: 'M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4',
  play: 'M5 3l8 5-8 5z',
  camera: 'M2 5h3l1-2h4l1 2h3v8H2zM8 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  trash: 'M3 4h10M6 4V2.5h4V4M4.5 4l.5 9h6l.5-9M6.5 7v4M9.5 7v4',
  copy: 'M5 5h8v9H5zM3 11V2h8',
  search: 'M7 7m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M10.5 10.5L14 14',
};

export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
