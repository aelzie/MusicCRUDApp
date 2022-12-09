using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MusicApp.Model
{
    public class RecordsLibraryModel
    {
        public int MusicId { get; set; }
        public string MusicName { get; set; }
        public string Artist { get; set; }
        public int Year { get; set; }
        public string Album { get; set; }

        public RecordsLibraryModel (int musicId, string musicName, string artist, int year, string album)
        {
            MusicId = musicId;
            MusicName = musicName;
            Artist = artist;
            Year = year;
            Album = album;
        }

        public RecordsLibraryModel()
        {

        }
    }
}
