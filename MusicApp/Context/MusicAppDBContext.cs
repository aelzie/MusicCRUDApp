using Microsoft.EntityFrameworkCore;
using MusicApp.Model;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MusicApp.Context
{
    public class MusicAppDBContext : DbContext
    {
        public MusicAppDBContext(DbContextOptions options) : base(options)
        {

        }

        public MusicAppDBContext()
        {

        }

        public DbSet<RecordsLibraryModel> RecordsLibraryModels { get; set; }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<RecordsLibraryModel>(
                entity =>
                {
                    entity.ToTable("MusicLibrary");
                    entity.HasKey(e => e.MusicId);
                    entity.Property(e => e.MusicId);

                    entity.Property(e => e.MusicName);
                    entity.Property(e => e.Artist);
                    entity.Property(e => e.Year);
                    entity.Property(e => e.Album);
                }
                );

        }
    }
}
