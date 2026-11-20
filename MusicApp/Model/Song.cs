using System.ComponentModel.DataAnnotations;

namespace MusicApp.Model
{
    public class Song
    {
        public const int MinYear = 1860; // the oldest known sound recordings

        public int SongId { get; set; }

        [Required(ErrorMessage = "Song name is required.")]
        [StringLength(200, ErrorMessage = "Song name can be at most 200 characters.")]
        [Display(Name = "Song name")]
        public string Title { get; set; } = string.Empty;

        [Required(ErrorMessage = "Artist is required.")]
        [StringLength(200, ErrorMessage = "Artist can be at most 200 characters.")]
        public string Artist { get; set; } = string.Empty;

        [StringLength(200, ErrorMessage = "Album can be at most 200 characters.")]
        public string? Album { get; set; }

        [Range(MinYear, 2100, ErrorMessage = "Enter a year between 1860 and next year.")]
        public int? Year { get; set; }

        /// <summary>Stored file name of the uploaded audio (inside App_Data/audio), or null if none.</summary>
        public string? AudioFileName { get; set; }

        /// <summary>The name the file had when it was uploaded, shown to the user.</summary>
        public string? AudioOriginalName { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
