export type Mode = "swipe" | "bracket";
export type Depth = "quick" | "standard" | "full";

export interface Song {
  index: number;
  id: string;
  title: string;
  detail?: string;
  n: number;
  albumId: string;
  album: string;
  year: number;
  cover: string;
}
