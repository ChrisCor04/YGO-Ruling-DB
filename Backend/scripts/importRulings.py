import os
import time
import requests
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

BASE_URL = "https://db.ygoresources.com"
DELAY_S = 0.025  # 25ms between requests = ~40 req/sec
BATCH_LIMIT = None  # Set to an integer (e.g. 50) to test a smaller batch

DATABASE_URL = os.getenv("DATABASE_URL")


def fetch_json(path):
    response = requests.get(f"{BASE_URL}{path}")
    response.raise_for_status()
    return response.json(), response.headers.get("X-Cache-Revision")


def import_ruling(conn, qa_id):
    data, _ = fetch_json(f"/data/qa/{qa_id}")
    english = data.get("qaData", {}).get("en")

    if not english:
        print(f"Skipping {qa_id}: no English data")
        return

    tags = [str(t) for t in data.get("tags", [])]

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rulings (
                external_source, external_id, title,
                question_text, answer_text, ruling_text,
                source_url, translation_status, tags
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (external_source, external_id)
            DO UPDATE SET
                title               = EXCLUDED.title,
                question_text       = EXCLUDED.question_text,
                answer_text         = EXCLUDED.answer_text,
                ruling_text         = EXCLUDED.ruling_text,
                source_url          = EXCLUDED.source_url,
                translation_status  = EXCLUDED.translation_status,
                tags                = EXCLUDED.tags,
                updated_at          = NOW()
            RETURNING ruling_id
            """,
            [
                "ygoresources",
                str(qa_id),
                english.get("title"),
                english.get("question"),
                english.get("answer"),
                english.get("answer"),
                f"{BASE_URL}/data/qa/{qa_id}",
                english.get("translationStatus"),
                tags,
            ],
        )

        ruling_id = cur.fetchone()[0]

        for card_id in data.get("cards", []):
            cur.execute(
                """
                INSERT INTO ruling_cards (ruling_id, card_id)
                SELECT %s, %s
                WHERE EXISTS (SELECT 1 FROM cards WHERE card_id = %s)
                ON CONFLICT DO NOTHING
                """,
                [ruling_id, card_id, card_id],
            )

        conn.commit()

    print(f"Imported ruling {qa_id}")


def main():
    print("Fetching manifest...")
    manifest_data, _ = fetch_json("/manifest/-1")
    qa_ids = [qid for qid in manifest_data.get("data", {}).get("qa", {}).keys() if int(qid) > 0]
    print(f"Found {len(qa_ids)} Q&A rulings.")

    ids_to_import = qa_ids[:BATCH_LIMIT] if BATCH_LIMIT else qa_ids
    print(f"Importing {len(ids_to_import)} rulings...")

    conn = psycopg2.connect(DATABASE_URL)
    count = 0

    try:
        for qa_id in ids_to_import:
            try:
                import_ruling(conn, qa_id)
                count += 1
            except Exception as e:
                print(f"Failed importing {qa_id}: {e}")
                conn.rollback()

            time.sleep(DELAY_S)
    finally:
        conn.close()

    print(f"Done. Imported/updated {count} rulings.")


if __name__ == "__main__":
    main()
