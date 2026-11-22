# Sakhno_nosql_1 — Spotify dataset and MongoDB

## 1. Project purpose

The project loads Spotify track data into MongoDB Atlas, transforms the flat source records into a document-oriented structure, and runs four queries using the resulting collection.

## 2. Requirements

- Python 3.10+
- MongoDB Atlas cluster (the assignment suggests the free M0 Shared tier)
- `mongosh`
- Spotify dataset CSV containing the columns listed below

## 3. Dataset

Download the Spotify dataset specified by the course and place its CSV file in the project root as `dataset.csv`.

The CSV must contain these fields:

`track_id`, `track_name`, `album_name`, `artists`, `explicit`, `popularity`, `duration_ms`, `track_genre`, `danceability`, `energy`, `loudness`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `key`, `mode`, `time_signature`.

## 4. Environment setup

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate

   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and set the MongoDB Atlas connection string:

   ```env
   MONGO_URI=mongodb+srv://...
   ```

3. In MongoDB Atlas, create a database user and allow your current IP address in Network Access. Do not commit `.env` or publish database credentials.

## 5. Run order

Run the commands from the project root.

1. Load the CSV into `spotify.tracks_raw`:

   ```bash
   python scripts/01_load_data.py
   ```

2. Transform raw documents into `spotify.tracks`:

   ```bash
   mongosh "YOUR_MONGO_URI" --file scripts/02_transform.js
   ```

3. Run the four required queries:

   ```bash
   mongosh "YOUR_MONGO_URI" --file queries/part2_queries.js
   ```

Replace `YOUR_MONGO_URI` with the connection string from Atlas. The URI contains credentials, so do not include it in screenshots or commit it to Git.

## 6. Resulting document structure

The `tracks` collection stores one document per track. Audio characteristics are grouped into the nested `audio_features` object, artists are stored as an array, and two derived fields are added.

Example (illustrative structure):

```json
{
  "track_id": "example-track-id",
  "track_name": "Example track",
  "album_name": "Example album",
  "artists": ["Artist One", "Artist Two"],
  "explicit": false,
  "popularity": 72,
  "duration_ms": 210000,
  "duration_sec": 210.0,
  "track_genre": "pop",
  "popularity_tier": "high",
  "audio_features": {
    "danceability": 0.75,
    "energy": 0.82,
    "loudness": -5.2,
    "speechiness": 0.04,
    "acousticness": 0.1,
    "instrumentalness": 0.0,
    "liveness": 0.12,
    "valence": 0.7,
    "tempo": 120.0,
    "key": 5,
    "mode": 1,
    "time_signature": 4
  }
}
```

## 7. Design decisions

### Why are audio features nested?

The audio characteristics describe one logical group of properties of a track, so keeping them in `audio_features` makes the document easier to read and keeps related fields together. It also makes the structure clearer for queries that work with audio characteristics.

The trade-off is that queries and indexes must use dotted field paths, for example `audio_features.danceability`. Nesting is most useful when fields belong together and are commonly read or updated as a group. It can be less convenient when the application frequently needs flat tabular output or when nested structures become excessively deep.

### Why are artists stored as an array?

A track can have more than one artist. An array represents this relationship directly instead of keeping several names in one delimited string. MongoDB can then search individual artists and use `$unwind` to calculate statistics per artist. Keeping a delimited string would require parsing it during queries and would make exact matching less reliable.

## 8. Query explanations

1. **Party tracks:** filters tracks where danceability and energy are greater than `0.7`, and duration is between 180,000 and 300,000 milliseconds (inclusive).
2. **Popular artists:** `$unwind` creates one pipeline record per artist-track relationship. `$group` calculates track count, minimum popularity, and average popularity. The result keeps artists with at least three tracks and minimum popularity of at least 60, then returns the top 20 by average popularity.
3. **Tempo outliers:** first calculates average tempo and population standard deviation for each genre. `$lookup` then finds tracks in that genre whose tempo is greater than `average + 2 × standard deviation`.
4. **Background-work tracks:** filters quiet tracks (`loudness < -10`), with low speechiness (`< 0.1`), instrumentalness above `0.5`, and `explicit = false`.

## 9. Optional indexes

The assignment labels Part 3 as optional and not graded. If completed, run:

```bash
mongosh "YOUR_MONGO_URI" --file scripts/03_indexes_optional.js
```

The script prints `explain("executionStats")` before and after creating the indexes. In the output, check the winning plan stages (for example, `IXSCAN` versus `COLLSCAN`), `totalKeysExamined`, `totalDocsExamined`, and `nReturned`. An index existing in the collection does not by itself prove that a particular query used it; inspect the winning plan.

The first compound index places the equality field (`track_genre`) first, the sort field (`popularity`) next, and the range field (`audio_features.danceability`) last. Actual plan selection depends on the data distribution and MongoDB's query planner, so record the observed output rather than assuming a particular performance improvement.

The second compound index supports the background-work filter. Since both numeric predicates are range conditions, the index may narrow the scan but does not guarantee that every predicate will be equally selective.

## 10. Notes and limitations

- The dataset filename and exact Kaggle source must match the course-provided dataset.
- Query 2 interprets “top 20” as highest average popularity, with track count as a secondary sort key. If the mentor expects another ranking rule, adjust the `$sort` stage and document it.
- Query 3 returns every genre, including genres whose `outlier_tracks` array is empty.
- The scripts drop and recreate `tracks_raw` / `tracks` when rerun. Do not run them against collections containing data you need to preserve.
