export type BookStatus = 'unread' | 'in-progress' | 'completed'

export type BookVolume = {
  number: number
  title: string
  progress: number
}

export type Book = {
  id: string
  title: string
  sourceTags?: readonly string[]
  author: string
  coverUrl: string
  volumes: readonly BookVolume[]
  dateAdded: string
  dateModified: string
  lastRead: string | null
  status: BookStatus
  missingFile: boolean
}

export const mockBooks: readonly Book[] = [
  {
    id: 'paper-moons-over-aster',
    title: 'Paper Moons Over Aster',
    author: 'N. Kanda',
    coverUrl: '/covers/book-01.svg',
    volumes: [{ number: 1, title: 'The First Orbit', progress: 0 }],
    dateAdded: '2026-02-11T09:30:00.000Z',
    dateModified: '2026-02-11T09:30:00.000Z',
    lastRead: null,
    status: 'unread',
    missingFile: false,
  },
  {
    id: 'lanterns-of-hollow-rain',
    title: 'Lanterns of Hollow Rain',
    author: 'Elian Mori',
    coverUrl: '/covers/book-02.svg',
    volumes: [
      { number: 1, title: 'River of Names', progress: 100 },
      { number: 2, title: 'The Quiet Flood', progress: 38 },
    ],
    dateAdded: '2026-01-19T13:05:00.000Z',
    dateModified: '2026-03-03T18:20:00.000Z',
    lastRead: '2026-03-03T18:20:00.000Z',
    status: 'in-progress',
    missingFile: false,
  },
  {
    id: 'the-clockwork-orchard',
    title: 'The Clockwork Orchard',
    author: 'Ren Akiyama',
    coverUrl: '/covers/book-03.svg',
    volumes: [
      { number: 1, title: 'A Brass Seed', progress: 100 },
      { number: 2, title: 'Harvest at Midnight', progress: 100 },
    ],
    dateAdded: '2025-12-02T11:00:00.000Z',
    dateModified: '2026-01-07T20:10:00.000Z',
    lastRead: '2026-01-07T20:10:00.000Z',
    status: 'completed',
    missingFile: false,
  },
  {
    id: 'a-map-for-the-quiet-sea',
    title: 'A Map for the Quiet Sea',
    author: 'L. Shino',
    coverUrl: '/covers/book-04.svg',
    volumes: [{ number: 1, title: 'Low Tide Letters', progress: 0 }],
    dateAdded: '2026-04-14T08:15:00.000Z',
    dateModified: '2026-04-14T08:15:00.000Z',
    lastRead: null,
    status: 'unread',
    missingFile: false,
  },
  {
    id: 'the-station-beyond-winter',
    title: 'The Station Beyond Winter',
    author: 'Hana Iori',
    coverUrl: '/covers/book-05.svg',
    volumes: [{ number: 1, title: 'Platform Zero', progress: 61 }],
    dateAdded: '2026-03-21T16:40:00.000Z',
    dateModified: '2026-05-01T10:25:00.000Z',
    lastRead: '2026-05-01T10:25:00.000Z',
    status: 'in-progress',
    missingFile: false,
  },
  {
    id: 'glassbird-academy',
    title: 'Glassbird Academy',
    author: 'M. Sato',
    coverUrl: '/covers/book-06.svg',
    volumes: [
      { number: 1, title: 'The Open Wing', progress: 100 },
      { number: 2, title: 'A Lesson in Echoes', progress: 100 },
      { number: 3, title: 'Final Examination', progress: 100 },
    ],
    dateAdded: '2025-11-16T12:00:00.000Z',
    dateModified: '2026-02-28T21:15:00.000Z',
    lastRead: '2026-02-28T21:15:00.000Z',
    status: 'completed',
    missingFile: false,
  },
  {
    id: 'when-the-comet-returned',
    title: 'When the Comet Returned',
    author: 'T. Arai',
    coverUrl: '/covers/book-07.svg',
    volumes: [
      { number: 1, title: 'Seven Summer Nights', progress: 0 },
      { number: 2, title: 'The Long Winter', progress: 0 },
    ],
    dateAdded: '2026-06-05T07:45:00.000Z',
    dateModified: '2026-06-05T07:45:00.000Z',
    lastRead: null,
    status: 'unread',
    missingFile: false,
  },
  {
    id: 'small-gods-of-the-rooftop',
    title: 'Small Gods of the Rooftop',
    author: 'Emi Nozaki',
    coverUrl: '/covers/book-08.svg',
    volumes: [
      { number: 1, title: 'Antenna Shrine', progress: 100 },
      { number: 2, title: 'The Sky Between Us', progress: 24 },
    ],
    dateAdded: '2026-02-27T14:10:00.000Z',
    dateModified: '2026-04-18T19:00:00.000Z',
    lastRead: '2026-04-18T19:00:00.000Z',
    status: 'in-progress',
    missingFile: false,
  },
  {
    id: 'the-sound-of-blue-hours',
    title: 'The Sound of Blue Hours',
    author: 'Kai Natsume',
    coverUrl: '/covers/book-09.svg',
    volumes: [{ number: 1, title: 'Overture for Two', progress: 100 }],
    dateAdded: '2025-09-10T10:30:00.000Z',
    dateModified: '2025-10-04T22:35:00.000Z',
    lastRead: '2025-10-04T22:35:00.000Z',
    status: 'completed',
    missingFile: false,
  },
  {
    id: 'a-library-built-from-snow',
    title: 'A Library Built from Snow',
    author: 'A. Wren',
    coverUrl: '/covers/book-10.svg',
    volumes: [{ number: 1, title: 'The Unwritten Floor', progress: 0 }],
    dateAdded: '2026-07-12T06:55:00.000Z',
    dateModified: '2026-07-12T06:55:00.000Z',
    lastRead: null,
    status: 'unread',
    missingFile: false,
  },
  {
    id: 'the-last-house-on-kumo-hill',
    title: 'The Last House on Kumo Hill',
    author: 'Yuna Park',
    coverUrl: '/covers/book-11.svg',
    volumes: [
      { number: 1, title: 'Mist on the Stairs', progress: 100 },
      { number: 2, title: 'Rooms Facing East', progress: 42 },
    ],
    dateAdded: '2026-01-31T17:25:00.000Z',
    dateModified: '2026-08-02T09:10:00.000Z',
    lastRead: '2026-08-02T09:10:00.000Z',
    status: 'in-progress',
    missingFile: true,
  },
  {
    id: 'the-garden-at-platform-end',
    title: 'The Garden at the End of the Platform',
    author: 'S. Riku',
    coverUrl: '/covers/book-12.svg',
    volumes: [
      { number: 1, title: 'Timetable of Leaves', progress: 100 },
      { number: 2, title: 'Last Train Home', progress: 100 },
    ],
    dateAdded: '2025-12-22T15:00:00.000Z',
    dateModified: '2026-03-16T20:45:00.000Z',
    lastRead: '2026-03-16T20:45:00.000Z',
    status: 'completed',
    missingFile: false,
  },
]
