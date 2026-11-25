using Microsoft.EntityFrameworkCore;
using MusicApp.Model;

namespace MusicApp.Context
{
    public class MusicAppDBContext : DbContext
    {
        public MusicAppDBContext(DbContextOptions<MusicAppDBContext> options) : base(options)
        {
        }

        public DbSet<Song> Songs => Set<Song>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Song>(entity =>
            {
                entity.ToTable("Songs");
                entity.HasKey(e => e.SongId);
                entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Artist).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Album).HasMaxLength(200);
                entity.Property(e => e.AudioFileName).HasMaxLength(100);
                entity.Property(e => e.AudioOriginalName).HasMaxLength(255);
            });
        }

        /// <summary>
        /// Creates the database file and table on first run, and adds a few example songs.
        /// </summary>
        public void EnsureCreatedAndSeeded()
        {
            if (!Database.EnsureCreated())
            {
                return; // database already existed
            }

            Songs.AddRange(
                new Song { Title = "Bohemian Rhapsody", Artist = "Queen", Album = "A Night at the Opera", Year = 1975 },
                new Song { Title = "Billie Jean", Artist = "Michael Jackson", Album = "Thriller", Year = 1982 },
                new Song { Title = "Smells Like Teen Spirit", Artist = "Nirvana", Album = "Nevermind", Year = 1991 },
                new Song { Title = "Rolling in the Deep", Artist = "Adele", Album = "21", Year = 2010 },
                new Song { Title = "Blinding Lights", Artist = "The Weeknd", Album = "After Hours", Year = 2019 }
            );
            SaveChanges();
        }
    }
}
