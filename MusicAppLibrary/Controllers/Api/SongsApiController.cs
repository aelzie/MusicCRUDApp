using Microsoft.AspNetCore.Mvc;
using MusicApp.Model;
using MusicApp.Repository;
using MusicAppLibrary.Services;

namespace MusicAppLibrary.Controllers.Api
{
    /// <summary>JSON shape of a song, as used by the 3D studio.</summary>
    public record SongDto(int Id, string Title, string Artist, string? Album, int? Year,
                          bool HasAudio, string? AudioName, string? AudioUrl)
    {
        public static SongDto From(Song s) => new(
            s.SongId, s.Title, s.Artist, s.Album, s.Year,
            s.AudioFileName != null, s.AudioOriginalName,
            s.AudioFileName != null ? $"/api/songs/{s.SongId}/audio" : null);
    }

    /// <summary>
    /// JSON API for the music library:
    ///   GET    /api/songs              list songs
    ///   GET    /api/songs/5            one song
    ///   POST   /api/songs              add a song (JSON body)
    ///   PUT    /api/songs/5            update a song (JSON body)
    ///   DELETE /api/songs/5            delete a song
    ///   POST   /api/songs/5/audio      upload an audio file (multipart "file")
    ///   GET    /api/songs/5/audio      stream the audio
    ///   DELETE /api/songs/5/audio      remove the audio
    /// Requests that change data need the anti-forgery token in the X-CSRF-TOKEN header.
    /// </summary>
    [ApiController]
    [Route("api/songs")]
    public class SongsApiController : ControllerBase
    {
        private readonly MusicAppRepository _repo;
        private readonly AudioStorage _storage;
        private readonly AiKaraokeService _ai;

        public SongsApiController(MusicAppRepository repo, AudioStorage storage, AiKaraokeService ai)
        {
            _repo = repo;
            _storage = storage;
            _ai = ai;
        }

        [HttpGet]
        public IEnumerable<SongDto> GetAll() => _repo.GetAll().Select(SongDto.From);

        [HttpGet("{id:int}")]
        public ActionResult<SongDto> Get(int id)
        {
            Song? song = _repo.GetById(id);
            return song == null ? NotFound() : SongDto.From(song);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public ActionResult<SongDto> Create([FromBody] Song song)
        {
            if (!CleanAndValidate(song)) return ValidationProblem(ModelState);

            Song created = _repo.Create(song);
            return CreatedAtAction(nameof(Get), new { id = created.SongId }, SongDto.From(created));
        }

        [HttpPut("{id:int}")]
        [ValidateAntiForgeryToken]
        public ActionResult<SongDto> Update(int id, [FromBody] Song song)
        {
            if (!CleanAndValidate(song)) return ValidationProblem(ModelState);

            Song? updated = _repo.Update(id, song);
            return updated == null ? NotFound() : SongDto.From(updated);
        }

        [HttpDelete("{id:int}")]
        [ValidateAntiForgeryToken]
        public IActionResult Delete(int id)
        {
            Song? deleted = _repo.Delete(id);
            if (deleted == null) return NotFound();
            _storage.Delete(deleted.AudioFileName);
            _ai.Forget(deleted.AudioFileName);
            return NoContent();
        }

        /// <summary>Only title, artist, album and year come from the client; everything else is ignored.</summary>
        private bool CleanAndValidate(Song song)
        {
            song.SongId = 0;
            song.AudioFileName = null;
            song.AudioOriginalName = null;
            MusicController.Normalize(song);
            ModelState.Clear();
            MusicController.ValidateYear(ModelState, song.Year);
            return TryValidateModel(song) && ModelState.IsValid;
        }

        [HttpPost("{id:int}/audio")]
        [ValidateAntiForgeryToken]
        [RequestSizeLimit(AudioStorage.MaxUploadBytes + 1024 * 1024)]
        public async Task<ActionResult<SongDto>> UploadAudio(int id, IFormFile? file)
        {
            Song? song = _repo.GetById(id);
            if (song == null) return NotFound();

            string? error = AudioStorage.Validate(file);
            if (error != null)
            {
                ModelState.AddModelError("file", error);
                return ValidationProblem(ModelState);
            }

            string oldFile = song.AudioFileName ?? "";
            string stored = await _storage.SaveAsync(file!);
            string originalName = Path.GetFileName(file!.FileName);
            if (originalName.Length > 255) originalName = originalName[..255];
            _repo.SetAudio(id, stored, originalName);

            _storage.Delete(oldFile);
            _ai.Forget(oldFile);
            return SongDto.From(_repo.GetById(id)!);
        }

        [HttpGet("{id:int}/audio")]
        public IActionResult GetAudio(int id)
        {
            Song? song = _repo.GetById(id);
            string? path = _storage.GetAudioPath(song?.AudioFileName);
            if (path == null) return NotFound();
            // Range support lets the browser seek and stream instead of downloading everything first.
            return PhysicalFile(path, AudioStorage.ContentTypeFor(path), enableRangeProcessing: true);
        }

        [HttpDelete("{id:int}/audio")]
        [ValidateAntiForgeryToken]
        public ActionResult<SongDto> DeleteAudio(int id)
        {
            Song? song = _repo.GetById(id);
            if (song == null) return NotFound();
            _storage.Delete(song.AudioFileName);
            _ai.Forget(song.AudioFileName);
            return SongDto.From(_repo.SetAudio(id, null, null)!);
        }
    }
}
