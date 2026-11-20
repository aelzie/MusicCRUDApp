# Music Library

An ASP.NET Core (.NET 8) app for keeping track of your songs, with a **3D Studio** where your
library is a shelf of vinyl records, a turntable that plays them, an audio visualizer, and a
**karaoke mode** that turns any song into an instrumental or an a cappella track.

## Run it

You only need the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0). No database server is needed.

```bash
cd MusicAppLibrary
dotnet run
```

Then open the address it prints (for example `https://localhost:7059`).

On first run the app creates its SQLite database (`MusicAppLibrary/App_Data/musiclibrary.db`) with
the `Songs` table and a few example songs. Uploaded audio and karaoke tracks are also stored in `App_Data`.
To start over, stop the app and delete the `App_Data` folder.

## Features

| Page | What it does |
|---|---|
| **Library** (`/Music`) | Table of songs: add, edit, delete (with a confirmation dialog) |
| **Add / Edit** (`/Music/Edit/0`, `/Music/Edit/5`) | Form with validation: song name and artist required, max 200 characters, year between 1860 and next year |
| **3D Studio** (`/Music/Studio`) | Records on a curved shelf: click one to put it on the turntable. Upload audio, play, seek, and switch karaoke modes. Ring of bars reacts to the music. Drag to look around; ← → to browse |

### Karaoke mode

Pick **Original**, **Instrumental** or **Vocals only**, and choose how the vocals are separated:

- **⚡ Quick (browser)**: works instantly on any computer, with nothing to install. It finds the sound
  that's identical in the left and right channels (where lead vocals are mixed) and splits it out.
  Works best on studio stereo recordings. Mono files can't be separated this way.
- **🤖 AI (Demucs)**: much cleaner results using Meta's [Demucs](https://github.com/adefossez/demucs)
  model. Optional; needs Python 3.9+ on the computer running the app:

  ```bash
  pip install demucs soundfile
  ```

  The first run downloads the AI model (~80 MB). Separating a song takes about 1–3 minutes on a typical CPU.
  If Python isn't found automatically, set `Karaoke:PythonPath` in `appsettings.json`
  (for example `"C:\\Python312\\python.exe"`).

Use karaoke mode with audio files you own.

## JSON API

The 3D Studio is built on a JSON API you can also use from other apps:

| Method | URL | Description |
|---|---|---|
| GET | `/api/songs` | All songs |
| GET | `/api/songs/{id}` | One song |
| POST | `/api/songs` | Add `{ "title", "artist", "album", "year" }` |
| PUT | `/api/songs/{id}` | Update |
| DELETE | `/api/songs/{id}` | Delete (also removes its audio) |
| POST | `/api/songs/{id}/audio` | Upload audio (multipart field `file`; MP3, WAV, OGG, M4A, AAC, FLAC, WEBM; max 60 MB) |
| GET | `/api/songs/{id}/audio` | Stream audio (supports seeking) |
| DELETE | `/api/songs/{id}/audio` | Remove audio |
| GET | `/api/karaoke/status` | Is AI karaoke available? |
| POST | `/api/songs/{id}/karaoke` | Start AI separation |
| GET | `/api/songs/{id}/karaoke` | Progress: `none`, `queued`, `running`, `done`, `failed` |
| GET | `/api/songs/{id}/karaoke/instrumental` · `/vocals` | The separated tracks (WAV) |

Requests that change data must include the anti-forgery token in an `X-CSRF-TOKEN` header
(the Studio page puts it in `<meta name="csrf-token">`).

## Project layout

```
MusicApp/                     data layer (class library)
  Model/Song.cs               the song entity + validation rules
  Context/MusicAppDBContext.cs  EF Core context; creates the table on first run
  Repository/MusicAppRepository.cs  create / read / update / delete
MusicAppLibrary/              web app
  Controllers/MusicController.cs       library table, form, 3D Studio page
  Controllers/Api/                     JSON API (songs, audio, karaoke)
  Services/AudioStorage.cs             safe file storage for uploads and stems
  Services/AiKaraokeService.cs         runs Demucs in the background
  Views/Music/                         Index, Edit, Studio
  wwwroot/js/studio/                   studio.js (3D), player.js (audio), karaoke-worker.js (in-browser separation)
  wwwroot/lib/three/                   Three.js (bundled, so the 3D page works offline)
```
