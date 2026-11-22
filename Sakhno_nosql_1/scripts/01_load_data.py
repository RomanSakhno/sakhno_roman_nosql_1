"""Load the Spotify CSV dataset into the MongoDB tracks_raw collection."""
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from pymongo import MongoClient
from tqdm import tqdm

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = "spotify"
CSV_PATH = Path("dataset.csv")
BATCH_SIZE = 1_000

REQUIRED_COLUMNS = {
    "track_id", "track_name", "album_name", "artists", "explicit",
    "popularity", "duration_ms", "track_genre", "danceability", "energy",
    "loudness", "speechiness", "acousticness", "instrumentalness",
    "liveness", "valence", "tempo", "key", "mode", "time_signature",
}


def parse_bool(value):
    """Convert common CSV boolean representations to Python bool."""
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def main():
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"{CSV_PATH} not found. Place the downloaded Spotify CSV in the project root."
        )

    df = pd.read_csv(CSV_PATH)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing)}")

    # Keep only the columns used by the assignment and normalize their types.
    df = df[list(REQUIRED_COLUMNS)].copy()
    df = df.dropna(subset=["artists", "track_name"])

    df["explicit"] = df["explicit"].map(parse_bool)

    int_columns = ["popularity", "duration_ms", "key", "mode", "time_signature"]
    for column in int_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    float_columns = [
        "danceability", "energy", "loudness", "speechiness",
        "acousticness", "instrumentalness", "liveness", "valence", "tempo",
    ]
    for column in float_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=int_columns + float_columns)
    for column in int_columns:
        df[column] = df[column].astype("int64")

    records = df.to_dict(orient="records")

    client = MongoClient(MONGO_URI)
    try:
        client.admin.command("ping")
        collection = client[DB_NAME]["tracks_raw"]
        collection.drop()

        for start in tqdm(range(0, len(records), BATCH_SIZE), desc="Uploading"):
            collection.insert_many(records[start:start + BATCH_SIZE], ordered=False)

        print(f"Loaded documents: {collection.count_documents({})}")
        print("Sample document:")
        print(collection.find_one())
    finally:
        client.close()


if __name__ == "__main__":
    main()
