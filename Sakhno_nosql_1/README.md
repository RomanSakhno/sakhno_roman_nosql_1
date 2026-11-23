# Spotify Tracks — NoSQL Assignment 1 (MongoDB)

**Student:** Roman Sakhno  
**Database:** MongoDB Atlas  
**Database name:** `spotify`  
**Dataset:** Spotify Tracks Dataset (`dataset.csv`)

---

## 1. Project overview

The goal of this assignment is to load the Spotify tracks dataset into MongoDB, redesign the flat CSV structure as MongoDB documents, perform analytical queries with the aggregation framework, and explore index usage with `explain()`.

The project contains three main parts:

1. Import the source CSV into a raw collection and transform it into a document-oriented schema.
2. Execute four analytical queries against the transformed collection.
3. Explore compound indexes, compare query execution plans, and answer the covered-query question.

## 2. Dataset and execution environment

The supplied CSV contains **114,000 rows**. The loader excludes records without a track name or artist and ignores the extra CSV index column. As a result, **113,999 documents** were inserted into MongoDB.

The dataset contains repeated `track_id` values. Therefore, `track_id` is treated as a regular source attribute and is not assumed to be unique.

### Technologies

- MongoDB Atlas — MongoDB server version used during execution: **8.0.39**.
- MongoDB Shell (`mongosh`) — version **2.14.1**.
- Python 3.11.
- PyMongo, pandas, python-dotenv, tqdm.

## 3. Project structure

```text
Sakhno_nosql_1/
├── dataset.csv
├── .env.example
├── .gitignore
├── requirements.txt
├── README.md
├── scripts/
│   ├── 01_load_data.py
│   ├── 02_transform.js
│   └── 03_indexes_optional.js
└── queries/
    └── part2_queries.js
```

`03_indexes_optional.js` contains the optional index experiments. The core data-loading and analytical-query workflow is independent of this optional step.

## 4. Configuration and setup

Run commands from the project root directory.

### 4.1. Create a Python virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 4.2. Configure MongoDB Atlas

1. Create an Atlas cluster and a database user.
2. Add the computer's current public IP address in **Security → Network Access → IP Access List**.
3. Copy the connection string from **Connect → Drivers**.
4. Copy `.env.example` to `.env` and set the connection string:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority
```

Keep `.env` private. It must not be committed to Git or included in the submission archive. Never put real credentials in source code, README files, or screenshots.

### 4.3. MongoDB Shell on Windows

If `mongosh` is available in `PATH`, use `mongosh` directly. Otherwise, use the full path to the executable. For example:

```powershell
& "$env:LOCALAPPDATA\Programs\mongosh\mongosh.exe" --version
```

The commands below use `mongosh` for readability. Replace `<YOUR_MONGO_URI>` with the connection string locally; do not publish it.

## 5. Part 1 — Data loading and schema design

### 5.1. Load raw data

Run:

```powershell
python scripts/01_load_data.py
```

The loader reads `dataset.csv`, converts boolean and numeric columns to the expected types, removes rows with missing artist or track name, and inserts documents in batches of 1,000 into:

```text
spotify.tracks_raw
```

**Executed result:** `Loaded documents: 113999`.

### 5.2. Transform the schema with an aggregation pipeline

Run:

```powershell
mongosh "<YOUR_MONGO_URI>" --file scripts/02_transform.js
```

The aggregation pipeline reads from `tracks_raw` and writes the transformed documents to `tracks`. It performs the following operations:

1. Selects the fields required for the final document.
2. Splits the original semicolon-separated artist string into an array and trims whitespace around each artist name.
3. Groups the audio characteristics into the embedded `audio_features` object.
4. Calculates `duration_sec` from `duration_ms`, rounded to one decimal place.
5. Calculates `popularity_tier`:
   - `high` — popularity is 70 or higher;
   - `medium` — popularity is from 40 to less than 70;
   - `low` — popularity is below 40.
6. Removes the original top-level audio-feature fields and the temporary `artists_raw` field.
7. Writes the result to `spotify.tracks`.

**Executed result:** `Documents in tracks: 113999`.

### 5.3. Final document structure

The following is an example of the transformed document printed by the executed script (the generated MongoDB `_id` is omitted here for readability):

```javascript
{
  track_id: "5SuOikwiRyPMVoIQDJUgSV",
  track_genre: "acoustic",
  album_name: "Comedy",
  track_name: "Comedy",
  popularity: 73,
  duration_ms: 230666,
  explicit: false,
  artists: ["Gen Hoshino"],
  audio_features: {
    danceability: 0.676,
    energy: 0.461,
    loudness: -6.746,
    speechiness: 0.143,
    acousticness: 0.0322,
    instrumentalness: 0.00000101,
    liveness: 0.358,
    valence: 0.715,
    tempo: 87.917,
    key: 1,
    mode: 0,
    time_signature: 4
  },
  duration_sec: 230.7,
  popularity_tier: "high"
}
```

### 5.4. Why are audio characteristics embedded in `audio_features`?

The audio characteristics describe one track and are naturally a single logical group. Embedding them in `audio_features` keeps the document organized and makes it clear which properties describe the sound of the track rather than its general metadata. It also allows the application to retrieve a track and its audio characteristics in one document, without joining separate collections.

The trade-off is that nested fields must be referenced with dot notation, for example `audio_features.danceability`. If the embedded object became very large, changed independently, or needed to be shared and updated across many documents, embedding could lead to larger documents and duplicated data. In this dataset the audio characteristics are a relatively small, stable group of values, so embedding is a reasonable choice.

### 5.5. Why are artists stored as an array?

A track can have more than one artist. An array represents this one-to-many relationship directly, whereas a semicolon-separated string stores multiple values inside one text field and makes them harder to query reliably.

With an array, MongoDB can match individual artists, use array operators, and use `$unwind` to create one pipeline record for each artist-track relationship. This is required by the artist aggregation in Part 2. The transformation also trims whitespace around artist names after splitting the source string.

## 6. Part 2 — Analytical queries

Run all four queries with:

```powershell
mongosh "<YOUR_MONGO_URI>" --file queries/part2_queries.js
```

The script runs against `spotify.tracks`.

### 6.1. Party tracks

The query selects tracks satisfying all of the following conditions:

- `audio_features.danceability > 0.7`;
- `audio_features.energy > 0.7`;
- `duration_ms` is between 180,000 and 300,000 milliseconds, inclusive.

The result projection returns the track name, artists, genre, duration, danceability, and energy. The output is limited to 20 documents.

### 6.2. Artists whose tracks are all popular

The query uses `$unwind` on `artists`, because a track may contain multiple artists. It then groups records by artist and calculates:

- the number of tracks;
- the minimum popularity;
- the average popularity.

The final filter keeps artists with at least three tracks and minimum popularity of at least 60. This minimum-value condition means that every track included for that artist has popularity of 60 or higher. Average popularity is rounded to one decimal place. The result is sorted and limited to the top 20 artists.

### 6.3. Unusually fast tracks by genre

The first aggregation stage calculates the average tempo (`$avg`) and population standard deviation (`$stdDevPop`) for each genre. The next stage uses `$lookup` to find tracks belonging to that genre whose tempo is greater than:

```text
genre average tempo + 2 × genre population standard deviation
```

The output includes the genre, average tempo, outlier threshold, and an array of matching outlier tracks. This approach calculates the threshold separately for each genre rather than applying one global tempo threshold to all music.

### 6.4. Background-work tracks

The query selects tracks that satisfy all of these conditions:

- `audio_features.loudness < -10`;
- `audio_features.speechiness < 0.1`;
- `audio_features.instrumentalness > 0.5`;
- `explicit = false`.

The result projection returns the track name, artists, genre, and the three relevant audio characteristics. The output is limited to 20 documents.

**Execution status:** the four query sections were run in `mongosh`; the terminal output included matching documents. The displayed terminal output was truncated because the result set was long, but the script completed.

## 7. Part 3 — Indexes and query optimization (self-study / not graded)

This section describes the requested index experiments and the covered-query question. The index experiments are optional in the assignment. The scripts and explanations below are provided so the experiments can be reproduced. **Do not treat the expected execution-plan changes described below as measured results unless the corresponding `explain()` output has actually been captured.**

### 7.1. Task 1 — Index for genre, danceability, and sorting

The assignment query is:

```javascript
db.tracks.find({
  track_genre: "pop",
  "audio_features.danceability": { $gte: 0.7 }
}).sort({ popularity: -1 }).toArray();
```

The compound index used for this query is:

```javascript
db.tracks.createIndex(
  {
    track_genre: 1,
    popularity: -1,
    "audio_features.danceability": 1
  },
  { name: "ix_genre_popularity_danceability" }
);
```

The field order follows the Equality-Sort-Range (ESR) guideline as a design starting point:

- `track_genre` is an equality condition;
- `popularity` is the requested descending sort field;
- `audio_features.danceability` is a range condition.

Before the index is created, the query may require a collection scan (`COLLSCAN`) and a separate sort stage. After the index is created, MongoDB may be able to use an index scan (`IXSCAN`) and satisfy the sort from index order. The actual plan is chosen by the query optimizer and must be confirmed from the output of `explain("executionStats")`.

Useful fields in the explain output:

- `winningPlan` — the winning execution plan;
- `IXSCAN` — indicates that an index scan is used;
- `COLLSCAN` — indicates that the collection is scanned;
- `SORT` — indicates a separate sort stage;
- `totalKeysExamined` — number of index keys examined;
- `totalDocsExamined` — number of documents examined;
- `nReturned` — number of documents returned.

A lower number of examined documents/keys and the removal of a blocking `SORT`, where applicable, can indicate an improvement. The exact values depend on the data and must be copied from the actual explain output.

### 7.2. Task 2 — Compound index for background-music filters

The assignment describes frequent searches using `audio_features.instrumentalness`, `audio_features.speechiness`, and `explicit`. The proposed compound index is:

```javascript
db.tracks.createIndex(
  {
    explicit: 1,
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1
  },
  { name: "ix_background_work" }
);
```

`explicit` is placed first because the query uses an equality condition (`false`). The other two fields use range conditions. A compound index can help MongoDB narrow down candidate records, but the usefulness of each index field depends on selectivity, field order, and the query planner. The actual usage should be checked with:

```javascript
db.tracks.find({
  explicit: false,
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 }
}).explain("executionStats");
```

The presence of an index does not guarantee that MongoDB will choose it for every query. Confirm the selected plan and execution statistics rather than assuming index usage.

### 7.3. Task 3 — Is the query covered?

The assignment states that the index from Task 1 already exists and gives this query:

```javascript
db.tracks.find({
  track_genre: "pop",
  popularity: { $gte: 70 }
});
```

**Answer: this query is not a covered query.**

A covered query is one that MongoDB can satisfy entirely from an index, without fetching the matching documents from the collection. For a query to be covered, the index must contain all fields needed for the filter and all fields returned by the projection. The `_id` field must also be available in the index or explicitly excluded from the projection.

The index from Task 1 contains `track_genre`, `popularity`, and `audio_features.danceability`. Therefore, it contains both fields used by the filter in the given query. However, the query has no projection, so MongoDB returns the complete matching documents by default. The index does not contain all fields of those documents, such as `track_name`, `album_name`, `artists`, `explicit`, and the other audio features. MongoDB therefore needs to fetch the matching documents from the collection. The query can use the index for filtering, but it is not covered.

A projection limited to fields present in the index can make a covered query possible. For example:

```javascript
db.tracks.find(
  {
    track_genre: "pop",
    popularity: { $gte: 70 }
  },
  {
    _id: 0,
    track_genre: 1,
    popularity: 1
  }
);
```

This modified query requests only `track_genre` and `popularity`, both of which are present in the Task 1 index, and explicitly excludes `_id`. It can therefore be covered by that index. This should be confirmed with `explain("executionStats")`: a covered plan typically has an `IXSCAN` without a `FETCH` stage and reports `totalDocsExamined: 0`.

### 7.4. Running the optional index script

The provided `scripts/03_indexes_optional.js` can be run with:

```powershell
mongosh "<YOUR_MONGO_URI>" --file scripts/03_indexes_optional.js
```

The script prints the execution plan for Task 1 before index creation, creates the Task 1 compound index, and prints the plan again. It also creates the background-work compound index and prints the execution plan for that query.

For a complete experimental report, save the actual `explain("executionStats")` output for both queries before and after index creation and record the observed `winningPlan`, `totalKeysExamined`, `totalDocsExamined`, and `nReturned`. The values should be taken from the real Atlas execution, not estimated or copied from an example.

## 8. Execution summary

| Stage | Collection / output | Result / status |
|---|---|---|
| CSV import | `spotify.tracks_raw` | **113,999 documents loaded** |
| Aggregation transformation | `spotify.tracks` | **113,999 documents created** |
| Part 2 analytical queries | `spotify.tracks` | **Four query sections executed** |
| Part 3 indexes | `spotify.tracks` | Optional experiment; run and capture `explain()` output if including measured results |
| Covered-query analysis | Task 3.3 | **Answered: original query is not covered** |

## 9. Reproducibility notes

- Run all commands from the project root so that `dataset.csv` is found by the Python loader.
- `01_load_data.py` drops and recreates `spotify.tracks_raw`; rerunning it replaces the raw collection contents.
- `02_transform.js` drops and recreates `spotify.tracks`; rerunning it replaces the transformed collection contents.
- The `track_id` field is not unique in the supplied dataset.
- Indexes are persistent database objects. Running the index script again with the same index definitions is safe because MongoDB recognizes an existing index with the same key pattern and options.
- Never include `.env` or real MongoDB credentials in Git, the README, screenshots, or the submission ZIP.

---

**Submission reminder:** include the project source files, dataset (if required by the course submission rules), and this README in the ZIP archive. Also attach the URL of the Git repository in the LMS. The assignment asks for the student's own reasoning and conclusions; review this README and add any personal observations from the actual execution before submitting.
