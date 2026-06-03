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
BATCH_LIMIT = None  # Set to an integer (e.g. 20) to test a smaller batch

DATABASE_URL = os.getenv("DATABASE_URL")


def fetch_json(path):
    response = requests.get(f"{BASE_URL}{path}")
    response.raise_for_status()
    return response.json(), response.headers.get("X-Cache-Revision")


def parse_date(date_str):
    """Return None for missing or placeholder dates like '????-??-??' or '0000-00-00'."""
    if not date_str or "?" in date_str or date_str.startswith("0000"):
        return None
    return date_str


def import_card(conn, card_id):
    data, _ = fetch_json(f"/data/card/{card_id}")

    card_data = data.get("cardData", {})
    english = card_data.get("en")

    if not english:
        print(f"Skipping {card_id}: no English data")
        return

    qa_index = data.get("qaIndex", [])

    with conn.cursor() as cur:
        # Upsert the base card record
        cur.execute(
            """
            INSERT INTO cards (card_id)
            VALUES (%s)
            ON CONFLICT (card_id) DO UPDATE SET updated_at = NOW()
            """,
            [card_id],
        )

        # Upsert English localization only
        cur.execute(
            """
            INSERT INTO card_localizations (
                card_id, language, name, effect_text, name_ruby,
                atk, def, attribute, card_type, level, link_arrows,
                properties, src_date, src_misc, src_type
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (card_id, language) DO UPDATE SET
                name        = EXCLUDED.name,
                effect_text = EXCLUDED.effect_text,
                name_ruby   = EXCLUDED.name_ruby,
                atk         = EXCLUDED.atk,
                def         = EXCLUDED.def,
                attribute   = EXCLUDED.attribute,
                card_type   = EXCLUDED.card_type,
                level       = EXCLUDED.level,
                link_arrows = EXCLUDED.link_arrows,
                properties  = EXCLUDED.properties,
                src_date    = EXCLUDED.src_date,
                src_misc    = EXCLUDED.src_misc,
                src_type    = EXCLUDED.src_type,
                updated_at  = NOW()
            """,
            [
                card_id,
                "en",
                english.get("name"),
                english.get("effectText"),
                english.get("nameRuby"),
                english.get("atk"),
                english.get("def"),
                english.get("attribute"),
                english.get("cardType"),
                english.get("level"),
                english.get("linkArrows", ""),
                english.get("properties", []),
                parse_date(english.get("thisSrc", {}).get("date")),
                english.get("thisSrc", {}).get("misc"),
                english.get("thisSrc", {}).get("type"),
            ],
        )

        # Upsert English print history only
        for print_entry in english.get("prints", []):
            cur.execute(
                """
                INSERT INTO card_prints (card_id, language, print_code, print_date)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (card_id, language, print_code) DO NOTHING
                """,
                [
                    card_id,
                    "en",
                    print_entry.get("code"),
                    parse_date(print_entry.get("date")),
                ],
            )

        # Backfill ruling_cards using qaIndex — links rulings already in the DB
        for qa_id in qa_index:
            cur.execute(
                """
                INSERT INTO ruling_cards (ruling_id, card_id)
                SELECT r.ruling_id, %s
                FROM rulings r
                WHERE r.external_source = 'ygoresources'
                  AND r.external_id = %s
                ON CONFLICT DO NOTHING
                """,
                [card_id, str(qa_id)],
            )

        conn.commit()

    print(f"Imported card {card_id}: {english.get('name')}")


def main():
    print("Fetching manifest...")
    manifest_data, _ = fetch_json("/manifest/-1")
    card_ids = sorted(
        [cid for cid in manifest_data.get("data", {}).get("card", {}).keys() if int(cid) > 0],
        key=int,
    )
    print(f"Found {len(card_ids)} cards.")

    ids_to_import = card_ids[:BATCH_LIMIT] if BATCH_LIMIT else card_ids
    print(f"Importing {len(ids_to_import)} cards...")

    conn = psycopg2.connect(DATABASE_URL)
    count = 0

    try:
        for card_id in ids_to_import:
            try:
                import_card(conn, card_id)
                count += 1
            except Exception as e:
                print(f"Failed importing card {card_id}: {e}")
                conn.rollback()

            time.sleep(DELAY_S)
    finally:
        conn.close()

    print(f"Done. Imported/updated {count} cards.")


if __name__ == "__main__":
    main()
