using MusicAppLibrary.Controllers;
using MusicAppLibrary.Models;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;
using MusicApp.Repositiory;
using MusicApp.Model;
using MusicApp.Context;

namespace MusicAppLibrary.Models
{
    public class MusicAppLibraryViewModel
    {
        private readonly MusicAppRepository _repo;

        public List<RecordsLibraryModel> MusicList { get; set; }

        public RecordsLibraryModel CurrentMusic { get; set; }

        public bool IsActionSuccess { get; set; }

        public string ActionMessage { get; set; }

        public MusicAppLibraryViewModel(MusicAppDBContext context)
        {
            _repo = new MusicAppRepository(context);
            MusicList = GetAllMusic();
            CurrentMusic = MusicList.FirstOrDefault();
        }

        public MusicAppLibraryViewModel(MusicAppDBContext context, int MusicId)
        {
            _repo = new MusicAppRepository(context);
            MusicList = GetAllMusic();

            if (MusicId > 0)
            {
                CurrentMusic = GetMusic(MusicId);
            }
            else
            {
                CurrentMusic = new RecordsLibraryModel();
            }
        }

        public void SaveMusic(RecordsLibraryModel Music)
        {
            if (Music.MusicId > 0)
            {
                _repo.Update(Music);
            }
            else
            {
                Music.MusicId = _repo.Create(Music);
            }

            MusicList = GetAllMusic();
            CurrentMusic = GetMusic(Music.MusicId);
        }

        public void RemoveMusic(int MusicID)
        {
            _repo.Delete(MusicID);
            MusicList = GetAllMusic();
            CurrentMusic = MusicList.FirstOrDefault();
        }

        public List<RecordsLibraryModel> GetAllMusic()
        {
            return _repo.GetAllMusic();
        }

        public RecordsLibraryModel GetMusic(int MusicId)
        {
            return _repo.GetMusicByID(MusicId);
        }
    }
}
