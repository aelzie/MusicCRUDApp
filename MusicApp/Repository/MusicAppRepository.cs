using Microsoft.EntityFrameworkCore;
using MusicApp.Context;
using MusicApp.Model;

namespace MusicApp.Repository
{
    public class MusicAppRepository
    {
        private readonly MusicAppDBContext _dbContext;

        public MusicAppRepository(MusicAppDBContext dbContext)
        {
            _dbContext = dbContext;
        }

        public List<Song> GetAll()
        {
            return _dbContext.Songs
                .AsNoTracking()
                .OrderBy(s => s.Artist)
                .ThenBy(s => s.Title)
                .ToList();
        }

        public Song? GetById(int songId)
        {
            return _dbContext.Songs.Find(songId);
        }

        public Song Create(Song song)
        {
            song.SongId = 0;
            song.CreatedAt = DateTime.UtcNow;
            _dbContext.Songs.Add(song);
            _dbContext.SaveChanges();
            return song;
        }

        /// <summary>Updates the editable details. Returns null if the song doesn't exist.</summary>
        public Song? Update(int songId, Song changes)
        {
            Song? existing = _dbContext.Songs.Find(songId);
            if (existing == null)
            {
                return null;
            }

            existing.Title = changes.Title;
            existing.Artist = changes.Artist;
            existing.Album = changes.Album;
            existing.Year = changes.Year;
            _dbContext.SaveChanges();
            return existing;
        }

        public Song? SetAudio(int songId, string? storedFileName, string? originalName)
        {
            Song? existing = _dbContext.Songs.Find(songId);
            if (existing == null)
            {
                return null;
            }

            existing.AudioFileName = storedFileName;
            existing.AudioOriginalName = originalName;
            _dbContext.SaveChanges();
            return existing;
        }

        /// <summary>Deletes the song. Returns the deleted song (so its audio can be cleaned up), or null if not found.</summary>
        public Song? Delete(int songId)
        {
            Song? existing = _dbContext.Songs.Find(songId);
            if (existing == null)
            {
                return null;
            }

            _dbContext.Songs.Remove(existing);
            _dbContext.SaveChanges();
            return existing;
        }
    }
}
