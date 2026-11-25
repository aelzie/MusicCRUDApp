using Microsoft.AspNetCore.Mvc;
using MusicApp.Model;
using MusicApp.Repository;
using MusicAppLibrary.Services;

namespace MusicAppLibrary.Controllers.Api
{
    /// <summary>
    /// AI karaoke (Demucs). The in-browser karaoke mode doesn't use the server at all.
    ///   GET  /api/karaoke/status                      is Demucs installed?
    ///   POST /api/songs/5/karaoke                     start separating song 5
    ///   GET  /api/songs/5/karaoke                     progress: none, queued, running, done, failed
    ///   GET  /api/songs/5/karaoke/instrumental        the instrumental track (WAV)
    ///   GET  /api/songs/5/karaoke/vocals              the a cappella track (WAV)
    /// </summary>
    [ApiController]
    public class KaraokeApiController : ControllerBase
    {
        private readonly MusicAppRepository _repo;
        private readonly AudioStorage _storage;
        private readonly AiKaraokeService _ai;

        public KaraokeApiController(MusicAppRepository repo, AudioStorage storage, AiKaraokeService ai)
        {
            _repo = repo;
            _storage = storage;
            _ai = ai;
        }

        [HttpGet("api/karaoke/status")]
        public async Task<AiAvailability> Status() => await _ai.CheckAvailabilityAsync();

        [HttpPost("api/songs/{id:int}/karaoke")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Start(int id)
        {
            Song? song = _repo.GetById(id);
            if (song == null) return NotFound();
            if (_storage.GetAudioPath(song.AudioFileName) == null)
            {
                return BadRequest(new { message = "Upload an audio file for this song first." });
            }

            AiJobStatus status = await _ai.StartAsync(song.AudioFileName!);
            return Accepted(ToJson(status));
        }

        [HttpGet("api/songs/{id:int}/karaoke")]
        public IActionResult Progress(int id)
        {
            Song? song = _repo.GetById(id);
            if (song == null) return NotFound();
            if (song.AudioFileName == null) return Ok(ToJson(new AiJobStatus(AiJobState.None)));
            return Ok(ToJson(_ai.GetStatus(song.AudioFileName)));
        }

        [HttpGet("api/songs/{id:int}/karaoke/{stem:regex(^(instrumental|vocals)$)}")]
        public IActionResult Stem(int id, string stem)
        {
            Song? song = _repo.GetById(id);
            string? path = _storage.GetStemPath(song?.AudioFileName, stem);
            if (path == null) return NotFound();
            return PhysicalFile(path, "audio/wav", enableRangeProcessing: true);
        }

        private static object ToJson(AiJobStatus status) => new
        {
            state = status.State.ToString().ToLowerInvariant(),
            message = status.Message,
        };
    }
}
