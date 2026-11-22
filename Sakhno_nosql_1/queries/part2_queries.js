// Run: mongosh "YOUR_MONGO_URI" --file queries/part2_queries.js
const spotify = db.getSiblingDB("spotify");
const tracks = spotify.tracks;

// 1. Party tracks: high danceability and energy, duration from 3 to 5 minutes.
print("\n--- 1. Party tracks ---");
printjson(tracks.find(
  {
    "audio_features.danceability": { $gt: 0.7 },
    "audio_features.energy": { $gt: 0.7 },
    duration_ms: { $gte: 180000, $lte: 300000 }
  },
  {
    _id: 0, track_name: 1, artists: 1, track_genre: 1,
    duration_sec: 1, "audio_features.danceability": 1,
    "audio_features.energy": 1
  }
).limit(20).toArray());

// 2. Artists with at least 3 tracks and minimum popularity >= 60.
// Artists are unwound because one track can have multiple artists.
print("\n--- 2. Artists whose tracks are all popular ---");
printjson(tracks.aggregate([
  { $unwind: "$artists" },
  {
    $group: {
      _id: "$artists",
      tracks_count: { $sum: 1 },
      min_popularity: { $min: "$popularity" },
      avg_popularity: { $avg: "$popularity" }
    }
  },
  {
    $match: {
      tracks_count: { $gte: 3 },
      min_popularity: { $gte: 60 }
    }
  },
  {
    $project: {
      _id: 0,
      artist: "$_id",
      tracks_count: 1,
      min_popularity: 1,
      avg_popularity: { $round: ["$avg_popularity", 1] }
    }
  },
  { $sort: { avg_popularity: -1, tracks_count: -1, artist: 1 } },
  { $limit: 20 }
]).toArray());

// 3. Outlier tracks by genre: tempo > genre average + 2 * population std. deviation.
print("\n--- 3. Unusually fast tracks by genre ---");
printjson(tracks.aggregate([
  {
    $group: {
      _id: "$track_genre",
      avg_tempo: { $avg: "$audio_features.tempo" },
      tempo_std_dev: { $stdDevPop: "$audio_features.tempo" }
    }
  },
  {
    $lookup: {
      from: "tracks",
      let: {
        genre: "$_id",
        threshold: { $add: ["$avg_tempo", { $multiply: [2, "$tempo_std_dev"] }] }
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$track_genre", "$$genre"] },
                { $gt: ["$audio_features.tempo", "$$threshold"] }
              ]
            }
          }
        },
        {
          $project: {
            _id: 1,
            track_name: 1,
            popularity: 1,
            artists: 1,
            "audio_features.tempo": 1
          }
        }
      ],
      as: "outlier_tracks"
    }
  },
  {
    $project: {
      _id: 0,
      genre: "$_id",
      avg_tempo: { $round: ["$avg_tempo", 1] },
      outlier_threshold: {
        $round: [
          { $add: ["$avg_tempo", { $multiply: [2, "$tempo_std_dev"] }] },
          1
        ]
      },
      outlier_tracks: 1
    }
  },
  { $sort: { genre: 1 } }
]).toArray());

// 4. Background-work tracks: quiet, low speech, mostly instrumental, no explicit content.
print("\n--- 4. Background-work tracks ---");
printjson(tracks.find(
  {
    "audio_features.loudness": { $lt: -10 },
    "audio_features.speechiness": { $lt: 0.1 },
    "audio_features.instrumentalness": { $gt: 0.5 },
    explicit: false
  },
  {
    _id: 0, track_name: 1, artists: 1, track_genre: 1,
    "audio_features.loudness": 1,
    "audio_features.speechiness": 1,
    "audio_features.instrumentalness": 1
  }
).limit(20).toArray());
