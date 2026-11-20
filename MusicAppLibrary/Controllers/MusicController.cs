using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using MusicApp.Model;
using MusicApp.Repository;
using MusicAppLibrary.Services;

namespace MusicAppLibrary.Controllers
{
    /// <summary>The classic table + form pages, and the 3D studio page.</summary>
    public class MusicController : Controller
    {
        private readonly MusicAppRepository _repo;
        private readonly AudioStorage _storage;
        private readonly AiKaraokeService _ai;

        public MusicController(MusicAppRepository repo, AudioStorage storage, AiKaraokeService ai)
        {
            _repo = repo;
            _storage = storage;
            _ai = ai;
        }

        public IActionResult Index()
        {
            return View(_repo.GetAll());
        }

        public IActionResult Studio()
        {
            return View();
        }

        // GET /Music/Edit/0 adds a song; /Music/Edit/5 edits song 5.
        public IActionResult Edit(int id = 0, string? returnTo = null)
        {
            ViewData["ReturnTo"] = returnTo == "studio" ? "studio" : null;
            if (id == 0)
            {
                return View(new Song());
            }

            Song? song = _repo.GetById(id);
            if (song == null)
            {
                TempData["Error"] = "That song no longer exists.";
                return RedirectToAction(nameof(Index));
            }
            return View(song);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Edit(int id, [Bind("Title,Artist,Album,Year")] Song song, string? returnTo = null)
        {
            bool toStudio = returnTo == "studio"; // only a fixed value, so this can't redirect to other sites
            ViewData["ReturnTo"] = toStudio ? "studio" : null;
            Normalize(song);
            ValidateYear(ModelState, song.Year);

            if (!ModelState.IsValid)
            {
                song.SongId = id;
                return View(song);
            }

            int savedId = id;
            if (id == 0)
            {
                savedId = _repo.Create(song).SongId;
                TempData["Message"] = $"\"{song.Title}\" was added.";
            }
            else if (_repo.Update(id, song) == null)
            {
                TempData["Error"] = "That song no longer exists.";
            }
            else
            {
                TempData["Message"] = $"\"{song.Title}\" was updated.";
            }

            return toStudio
                ? RedirectToAction(nameof(Studio), new { song = savedId })
                : RedirectToAction(nameof(Index));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Delete(int id)
        {
            Song? deleted = _repo.Delete(id);
            if (deleted == null)
            {
                TempData["Error"] = "That song was already deleted.";
            }
            else
            {
                _storage.Delete(deleted.AudioFileName);
                _ai.Forget(deleted.AudioFileName);
                TempData["Message"] = $"\"{deleted.Title}\" was deleted.";
            }
            return RedirectToAction(nameof(Index));
        }

        /// <summary>Trims whitespace and turns blank optional fields into null.</summary>
        public static void Normalize(Song song)
        {
            song.Title = song.Title?.Trim() ?? string.Empty;
            song.Artist = song.Artist?.Trim() ?? string.Empty;
            song.Album = string.IsNullOrWhiteSpace(song.Album) ? null : song.Album.Trim();
        }

        /// <summary>The [Range] attribute can't know today's date, so the upper limit is checked here.</summary>
        public static void ValidateYear(ModelStateDictionary modelState, int? year)
        {
            int maxYear = DateTime.UtcNow.Year + 1;
            if (year.HasValue && (year < Song.MinYear || year > maxYear))
            {
                modelState.Remove(nameof(Song.Year));
                modelState.AddModelError(nameof(Song.Year), $"Enter a year between {Song.MinYear} and {maxYear}.");
            }
        }
    }
}
