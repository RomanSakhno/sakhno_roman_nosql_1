// OPTIONAL — this part is marked as self-study / not graded.
// Run: mongosh "YOUR_MONGO_URI" --file scripts/03_indexes_optional.js
const tracks = db.getSiblingDB("spotify").tracks;

// Query 1: compare explain("executionStats") before and after the index.
const partyGenreQuery = {
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
};

print("\n--- Query 1: before index ---");
printjson(tracks.find(partyGenreQuery).sort({ popularity: -1 })
  .explain("executionStats"));

// Equality field first, sort field next, range field last.
// This ordering can support the requested sort while filtering by genre.
tracks.createIndex(
  { track_genre: 1, popularity: -1, "audio_features.danceability": 1 },
  { name: "ix_genre_popularity_danceability" }
);

print("\n--- Query 1: after index ---");
printjson(tracks.find(partyGenreQuery).sort({ popularity: -1 })
  .explain("executionStats"));

// Query 2: background-work filter.
const backgroundQuery = {
  explicit: false,
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 }
};

tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "ix_background_work" }
);

print("\n--- Query 2: explain after index ---");
printjson(tracks.find(backgroundQuery).explain("executionStats"));
