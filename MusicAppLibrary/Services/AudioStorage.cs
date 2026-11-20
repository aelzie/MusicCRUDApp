namespace MusicAppLibrary.Services
{
    /// <summary>
    /// Saves uploaded audio files to App_Data/audio and AI karaoke stems to App_Data/stems.
    /// Files are stored under random names so user input never becomes part of a file path.
    /// </summary>
    public class AudioStorage
    {
        public const long MaxUploadBytes = 60L * 1024 * 1024; // 60 MB

        public static readonly IReadOnlyDictionary<string, string> AllowedTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".mp3"] = "audio/mpeg",
            [".wav"] = "audio/wav",
            [".ogg"] = "audio/ogg",
            [".oga"] = "audio/ogg",
            [".m4a"] = "audio/mp4",
            [".aac"] = "audio/aac",
            [".flac"] = "audio/flac",
            [".webm"] = "audio/webm",
        };

        public string AudioDir { get; }
        public string StemsDir { get; }

        public AudioStorage(IWebHostEnvironment env)
        {
            AudioDir = Path.Combine(env.ContentRootPath, "App_Data", "audio");
            StemsDir = Path.Combine(env.ContentRootPath, "App_Data", "stems");
            Directory.CreateDirectory(AudioDir);
            Directory.CreateDirectory(StemsDir);
        }

        /// <summary>Returns an error message if the file can't be accepted, otherwise null.</summary>
        public static string? Validate(IFormFile? file)
        {
            if (file == null || file.Length == 0)
            {
                return "Choose an audio file to upload.";
            }
            if (file.Length > MaxUploadBytes)
            {
                return $"That file is too large. The limit is {MaxUploadBytes / (1024 * 1024)} MB.";
            }
            string ext = Path.GetExtension(file.FileName);
            if (!AllowedTypes.ContainsKey(ext))
            {
                return "That file type isn't supported. Use MP3, WAV, OGG, M4A, AAC, FLAC or WEBM.";
            }
            return null;
        }

        public async Task<string> SaveAsync(IFormFile file)
        {
            string ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            string storedName = $"{Guid.NewGuid():N}{ext}";
            string path = Path.Combine(AudioDir, storedName);
            await using var stream = new FileStream(path, FileMode.CreateNew);
            await file.CopyToAsync(stream);
            return storedName;
        }

        /// <summary>Full path of a stored audio file, or null if the name is invalid or the file is gone.</summary>
        public string? GetAudioPath(string? storedName)
        {
            if (!IsSafeName(storedName))
            {
                return null;
            }
            string path = Path.Combine(AudioDir, storedName!);
            return File.Exists(path) ? path : null;
        }

        public static string ContentTypeFor(string fileName)
        {
            return AllowedTypes.TryGetValue(Path.GetExtension(fileName), out string? type) ? type : "application/octet-stream";
        }

        /// <summary>Folder holding the AI stems for one stored audio file.</summary>
        public string GetStemFolder(string storedName)
        {
            return Path.Combine(StemsDir, Path.GetFileNameWithoutExtension(storedName));
        }

        public string? GetStemPath(string? storedName, string stem)
        {
            if (!IsSafeName(storedName))
            {
                return null;
            }
            string path = Path.Combine(GetStemFolder(storedName!), $"{stem}.wav");
            return File.Exists(path) ? path : null;
        }

        /// <summary>Removes an audio file and any karaoke stems made from it.</summary>
        public void Delete(string? storedName)
        {
            if (!IsSafeName(storedName))
            {
                return;
            }
            try
            {
                string path = Path.Combine(AudioDir, storedName!);
                if (File.Exists(path)) File.Delete(path);
                string stems = GetStemFolder(storedName!);
                if (Directory.Exists(stems)) Directory.Delete(stems, recursive: true);
            }
            catch (IOException)
            {
                // A file may still be open (e.g. streaming). It's orphaned but harmless.
            }
        }

        private static bool IsSafeName(string? name)
        {
            return !string.IsNullOrEmpty(name)
                && name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0
                && !name.Contains("..")
                && AllowedTypes.ContainsKey(Path.GetExtension(name));
        }
    }
}
