using Microsoft.AspNetCore.Mvc;
using MusicApp.Context;
using MusicApp.Model;
using MusicAppLibrary.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MusicAppLibrary.Controllers
{
    public class MusicAppLibraryController : Controller
    {
        private readonly MusicAppDBContext _context;

        public MusicAppLibraryController(MusicAppDBContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            MusicAppLibraryViewModel model = new MusicAppLibraryViewModel(_context);
            return View(model);
        }

        [HttpPost]
        public IActionResult Index(int musicID, string musicName, string artist, short year, string album)
        {
            MusicAppLibraryViewModel model = new MusicAppLibraryViewModel(_context);

            RecordsLibraryModel Music = new(musicID, musicName, artist, year, album);

            model.SaveMusic(Music);
            model.IsActionSuccess = true;
            model.ActionMessage = "Music has been saved successfully";

            return View(model);
        }

        public IActionResult Update(int id)
        {
            MusicAppLibraryViewModel model = new MusicAppLibraryViewModel(_context, id);
            return View(model);
        }

        public IActionResult Delete(int id)
        {
            MusicAppLibraryViewModel model = new MusicAppLibraryViewModel(_context);

            if (id > 0)
            {
                model.RemoveMusic(id);
            }

            model.IsActionSuccess = true;
            model.ActionMessage = "Music has been deleted successfully";
            return View("Index", model);
        }
    }
}
