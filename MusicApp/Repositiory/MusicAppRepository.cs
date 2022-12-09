using MusicApp.Context;
using MusicApp.Model;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MusicApp.Repositiory
{
    public class MusicAppRepository
    {
        private readonly MusicAppDBContext _dbContext;

        public MusicAppRepository(MusicAppDBContext dbContext)
        {
            _dbContext = dbContext;
        }

        public int Create(RecordsLibraryModel Music)
        {
            _dbContext.Add(Music);
            _dbContext.SaveChanges();

            return Music.MusicId;
        }

        public int Update(RecordsLibraryModel Music)
        {
            RecordsLibraryModel Music1 = _dbContext.RecordsLibraryModels.Find(Music.MusicId)!;

            Music1.MusicName = Music.MusicName;
            Music1.Artist = Music.Artist;
            Music1.Year = Music.Year;
            Music1.Album = Music.Album;

            _dbContext.SaveChanges();

            return Music1.MusicId;
        }

        public bool Delete(int MusicId)
        {
            RecordsLibraryModel Music = _dbContext.RecordsLibraryModels.Find(MusicId)!;
            _dbContext.Remove(Music);
            _dbContext.SaveChanges();

            return true;
        }

        public List<RecordsLibraryModel> GetAllMusic()
        {
            List<RecordsLibraryModel> MusicList = _dbContext.RecordsLibraryModels.ToList();

            return MusicList;
        }

        public RecordsLibraryModel GetMusicByID(int MusicId)
        {
            RecordsLibraryModel Music = _dbContext.RecordsLibraryModels.Find(MusicId)!;

            return Music;
        }
    }
}
