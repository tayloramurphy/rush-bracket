import raw from "../data/catalog.json";
import type { Song } from "../types";

export interface CatalogTrack {
  index: number;
  id: string;
  n: number;
  title: string;
  detail?: string;
}

export interface CatalogAlbum {
  id: string;
  title: string;
  year: number;
  mbid: string;
  releaseMbid: string;
  cover: string;
  tracks: CatalogTrack[];
}

export const CATALOG_VERSION = raw.version;
export const CATALOG_SOURCE = raw.source;
export const albums = raw.albums as CatalogAlbum[];

export const songs: Song[] = albums.flatMap((album) =>
  album.tracks.map((track) => ({
    index: track.index,
    id: track.id,
    title: track.title,
    detail: track.detail,
    n: track.n,
    albumId: album.id,
    album: album.title,
    year: album.year,
    cover: album.cover,
  })),
);

export const songById = new Map(songs.map((song) => [song.id, song]));
export const songByIndex = new Map(songs.map((song) => [song.index, song]));

export function requireSong(id: string): Song {
  const song = songById.get(id);
  if (!song) throw new Error(`Unknown song ${id}`);
  return song;
}
