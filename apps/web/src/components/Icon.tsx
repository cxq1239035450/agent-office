export type IconName =
  | "building"
  | "layers"
  | "plus"
  | "folder"
  | "team"
  | "spark"
  | "plug"
  | "file"
  | "send"
  | "close"
  | "check"
  | "clock"
  | "arrow"
  | "settings"
  | "play";
const paths: Record<IconName, string> = {
  building: "M4 21V7l8-4 8 4v14M2 21h20M9 21v-5h6v5M8 8h1m6 0h1M8 12h1m6 0h1",
  layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  plus: "M12 5v14M5 12h14",
  folder: "M3 7V5h6l2 2h10v13H3V7Zm0 3h18",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  plug: "M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6",
  send: "m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  arrow: "m9 5 7 7-7 7",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  play: "m8 4 12 8-12 8V4Z",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
