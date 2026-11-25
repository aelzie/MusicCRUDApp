using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using MusicApp.Context;
using MusicApp.Repository;
using MusicAppLibrary.Services;

var builder = WebApplication.CreateBuilder(args);

// Everything the app creates at runtime (database, uploads, karaoke stems) lives in App_Data.
string dataDir = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
Directory.CreateDirectory(dataDir);

string connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=App_Data/musiclibrary.db";
// Resolve a relative SQLite path against the project folder, so it works no matter where you run from.
connectionString = connectionString.Replace("Data Source=App_Data", $"Data Source={dataDir}");

builder.Services.AddControllersWithViews();
builder.Services.AddDbContext<MusicAppDBContext>(options => options.UseSqlite(connectionString));
builder.Services.AddScoped<MusicAppRepository>();
builder.Services.AddSingleton<AudioStorage>();
builder.Services.Configure<KaraokeOptions>(builder.Configuration.GetSection("Karaoke"));
builder.Services.AddSingleton<AiKaraokeService>();

// JavaScript sends the anti-forgery token in this header for API calls that change data.
builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = AudioStorage.MaxUploadBytes + 1024 * 1024;
});
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = AudioStorage.MaxUploadBytes + 1024 * 1024;
});

var app = builder.Build();

// Create the database file and Songs table on first run.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<MusicAppDBContext>().EnsureCreatedAndSeeded();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();

// Lets the test project start the app.
public partial class Program { }
