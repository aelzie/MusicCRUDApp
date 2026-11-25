using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Extensions.Options;

namespace MusicAppLibrary.Services
{
    public class KaraokeOptions
    {
        /// <summary>Python to run Demucs with. Leave empty to try "python3", then "python", then "py".</summary>
        public string PythonPath { get; set; } = "";
        public string DemucsModel { get; set; } = "htdemucs";
        public int TimeoutMinutes { get; set; } = 30;
    }

    public enum AiJobState { None, Queued, Running, Done, Failed }

    public record AiJobStatus(AiJobState State, string? Message = null);

    public record AiAvailability(bool Available, string Message);

    /// <summary>
    /// Runs Demucs (https://github.com/adefossez/demucs) in the background to split a song into
    /// "vocals" and "instrumental" WAV files. Optional: the app works without Python installed,
    /// and the in-browser karaoke mode is used instead.
    /// </summary>
    public class AiKaraokeService
    {
        private readonly KaraokeOptions _options;
        private readonly AudioStorage _storage;
        private readonly ILogger<AiKaraokeService> _logger;
        private readonly ConcurrentDictionary<string, AiJobStatus> _jobs = new();
        private readonly SemaphoreSlim _oneAtATime = new(1, 1); // separation is CPU/RAM heavy

        private AiAvailability? _cachedAvailability;
        private string? _python;
        private DateTime _checkedAt;
        private readonly SemaphoreSlim _checkLock = new(1, 1);

        public AiKaraokeService(IOptions<KaraokeOptions> options, AudioStorage storage, ILogger<AiKaraokeService> logger)
        {
            _options = options.Value;
            _storage = storage;
            _logger = logger;
        }

        public async Task<AiAvailability> CheckAvailabilityAsync()
        {
            await _checkLock.WaitAsync();
            try
            {
                // Re-check every 2 minutes so installing Demucs while the app runs is picked up.
                if (_cachedAvailability != null && DateTime.UtcNow - _checkedAt < TimeSpan.FromMinutes(2))
                {
                    return _cachedAvailability;
                }

                var candidates = string.IsNullOrWhiteSpace(_options.PythonPath)
                    ? new[] { "python3", "python", "py" }
                    : new[] { _options.PythonPath };

                _python = null;
                _cachedAvailability = new AiAvailability(false,
                    "AI karaoke needs Python with Demucs installed. Run: pip install demucs soundfile");

                foreach (string python in candidates)
                {
                    var (exitCode, output) = await RunAsync(python,
                        new[] { "-c", "import demucs, soundfile; print(demucs.__version__)" }, TimeSpan.FromSeconds(30));
                    if (exitCode == 0)
                    {
                        _python = python;
                        _cachedAvailability = new AiAvailability(true, $"Demucs {output.Trim()} is ready.");
                        break;
                    }
                }

                _checkedAt = DateTime.UtcNow;
                return _cachedAvailability;
            }
            finally
            {
                _checkLock.Release();
            }
        }

        public AiJobStatus GetStatus(string storedAudioName)
        {
            if (_storage.GetStemPath(storedAudioName, "vocals") != null &&
                _storage.GetStemPath(storedAudioName, "instrumental") != null)
            {
                return new AiJobStatus(AiJobState.Done);
            }
            return _jobs.TryGetValue(storedAudioName, out var status) ? status : new AiJobStatus(AiJobState.None);
        }

        /// <summary>Starts separating a song in the background (or returns the current status if already started).</summary>
        public async Task<AiJobStatus> StartAsync(string storedAudioName)
        {
            var current = GetStatus(storedAudioName);
            if (current.State is AiJobState.Done or AiJobState.Queued or AiJobState.Running)
            {
                return current;
            }

            var availability = await CheckAvailabilityAsync();
            if (!availability.Available)
            {
                return new AiJobStatus(AiJobState.Failed, availability.Message);
            }

            var queued = new AiJobStatus(AiJobState.Queued, "Waiting for another song to finish…");
            if (!_jobs.TryAdd(storedAudioName, queued))
            {
                // Replace a previous failure; another request may have just queued it.
                if (!_jobs.TryGetValue(storedAudioName, out var existing) || existing.State != AiJobState.Failed
                    || !_jobs.TryUpdate(storedAudioName, queued, existing))
                {
                    return GetStatus(storedAudioName);
                }
            }

            _ = Task.Run(() => SeparateAsync(storedAudioName));
            return queued;
        }

        private async Task SeparateAsync(string storedAudioName)
        {
            await _oneAtATime.WaitAsync();
            string tempOut = Path.Combine(Path.GetTempPath(), "musicapp-demucs-" + Guid.NewGuid().ToString("N"));
            try
            {
                string? input = _storage.GetAudioPath(storedAudioName);
                if (input == null)
                {
                    _jobs[storedAudioName] = new AiJobStatus(AiJobState.Failed, "The audio file is missing.");
                    return;
                }

                _jobs[storedAudioName] = new AiJobStatus(AiJobState.Running,
                    "Separating vocals with AI. This takes about 1–3 minutes on a typical computer…");

                var args = new[]
                {
                    "-m", "demucs",
                    "--two-stems", "vocals",
                    "-n", _options.DemucsModel,
                    "-o", tempOut,
                    input,
                };
                var (exitCode, output) = await RunAsync(_python!, args, TimeSpan.FromMinutes(_options.TimeoutMinutes));

                string resultDir = Path.Combine(tempOut, _options.DemucsModel, Path.GetFileNameWithoutExtension(input));
                string vocals = Path.Combine(resultDir, "vocals.wav");
                string instrumental = Path.Combine(resultDir, "no_vocals.wav");

                if (exitCode != 0 || !File.Exists(vocals) || !File.Exists(instrumental))
                {
                    _logger.LogWarning("Demucs failed for {File} (exit {Code}): {Output}", storedAudioName, exitCode, output);
                    _jobs[storedAudioName] = new AiJobStatus(AiJobState.Failed, Summarize(output));
                    return;
                }

                string stemFolder = _storage.GetStemFolder(storedAudioName);
                Directory.CreateDirectory(stemFolder);
                File.Move(vocals, Path.Combine(stemFolder, "vocals.wav"), overwrite: true);
                File.Move(instrumental, Path.Combine(stemFolder, "instrumental.wav"), overwrite: true);
                _jobs[storedAudioName] = new AiJobStatus(AiJobState.Done);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AI karaoke failed for {File}", storedAudioName);
                _jobs[storedAudioName] = new AiJobStatus(AiJobState.Failed, "Something went wrong while separating the song.");
            }
            finally
            {
                _oneAtATime.Release();
                try { if (Directory.Exists(tempOut)) Directory.Delete(tempOut, recursive: true); } catch (IOException) { }
            }
        }

        public void Forget(string? storedAudioName)
        {
            if (storedAudioName != null) _jobs.TryRemove(storedAudioName, out _);
        }

        private static string Summarize(string output)
        {
            string? last = output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .LastOrDefault(l => l.Contains("Error", StringComparison.OrdinalIgnoreCase));
            if (last != null && last.Contains("urlopen", StringComparison.OrdinalIgnoreCase))
            {
                return "Demucs couldn't download its AI model. Check your internet connection and try again.";
            }
            return last != null && last.Length < 300
                ? $"AI separation failed: {last}"
                : "AI separation failed. Check that the file plays correctly and try again.";
        }

        private static async Task<(int ExitCode, string Output)> RunAsync(string fileName, IEnumerable<string> args, TimeSpan timeout)
        {
            var psi = new ProcessStartInfo(fileName)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (string arg in args) psi.ArgumentList.Add(arg); // no shell, so file names can't inject commands

            try
            {
                using var process = Process.Start(psi);
                if (process == null) return (-1, "Could not start process.");

                var stdout = process.StandardOutput.ReadToEndAsync();
                var stderr = process.StandardError.ReadToEndAsync();
                using var cts = new CancellationTokenSource(timeout);
                try
                {
                    await process.WaitForExitAsync(cts.Token);
                }
                catch (OperationCanceledException)
                {
                    try { process.Kill(entireProcessTree: true); } catch { }
                    return (-1, "Error: timed out.");
                }
                return (process.ExitCode, await stdout + "\n" + await stderr);
            }
            catch (System.ComponentModel.Win32Exception)
            {
                return (-1, $"{fileName} was not found."); // that Python isn't installed
            }
        }
    }
}
