import os
import time
import requests
import psycopg2
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

YGOPRODECK_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
IMAGE_BASE     = "https://images.ygoprodeck.com/images"
BUCKET         = "card-images"
DELAY_S        = 0.05   # 50ms = 20 req/sec (YGOPRODeck hard limit)
BATCH_LIMIT    = None   # Set to an integer (e.g. 5) to test a smaller batch
SKIP_PHASE1    = True   # Set to False only when importing new cards

DATABASE_URL        = os.getenv("DATABASE_URL")
SUPABASE_URL        = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")


def fetch_all_ygoprodeck_cards():
    print("Fetching all cards from YGOPRODeck (one request, cached 2 days)...")
    response = requests.get(YGOPRODECK_API, params={"misc": "yes"}, timeout=30)
    response.raise_for_status()
    cards = response.json()["data"]
    print(f"Received {len(cards)} cards from YGOPRODeck.")
    return cards


def phase1_map_ids(conn, ygoprodeck_cards):
    """
    Match YGOPRODeck cards to our cards via konami_id.
    Writes ygoprodeck_id to cards and seeds card_images rows.
    """
    print("\n--- Phase 1: ID mapping ---")
    matched = 0

    if BATCH_LIMIT:
        ygoprodeck_cards = ygoprodeck_cards[:BATCH_LIMIT]

    total = len(ygoprodeck_cards)

    with conn.cursor() as cur:
        for i, card in enumerate(ygoprodeck_cards):
            print(f"  Processing card {i + 1}/{total}...")

            misc_info = card.get("misc_info", [])
            if not misc_info:
                continue

            konami_id = misc_info[0].get("konami_id")
            if not konami_id:
                continue

            ygoprodeck_id = card["id"]
            card_images   = card.get("card_images", [])

            # Link our card to the YGOPRODeck passcode
            cur.execute(
                """
                UPDATE cards SET ygoprodeck_id = %s
                WHERE card_id = %s AND ygoprodeck_id IS NULL
                """,
                [ygoprodeck_id, konami_id],
            )

            if cur.rowcount == 0:
                continue  # already mapped or card not in our DB

            # Seed one card_images row per artwork (primary first)
            for j, img in enumerate(card_images):
                cur.execute(
                    """
                    INSERT INTO card_images (card_id, ygoprodeck_img_id, is_primary)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (card_id, ygoprodeck_img_id) DO NOTHING
                    """,
                    [konami_id, img["id"], j == 0],
                )

            matched += 1

        conn.commit()

    print(f"Matched {matched} cards to our database.")


def download_bytes(url):
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    return response.content


def upload_to_supabase(supabase, path, data):
    supabase.storage.from_(BUCKET).upload(
        path=path,
        file=data,
        file_options={"content-type": "image/jpeg", "upsert": "true"},
    )
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


def phase2_download_images(conn, supabase):
    """
    Download full/small/cropped images for every pending card_images row
    and upload them to Supabase Storage.
    """
    print("\n--- Phase 2: Image download ---")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, card_id, ygoprodeck_img_id, is_primary
            FROM card_images
            WHERE image_status = 'pending'
            ORDER BY is_primary DESC, card_id
            """
        )
        pending = cur.fetchall()

    if BATCH_LIMIT:
        pending = pending[:BATCH_LIMIT]

    print(f"Downloading images for {len(pending)} artworks...")

    sizes = [
        ("small", "cards_small", "image_url_small"),
    ]

    for row_id, card_id, img_id, is_primary in pending:
        urls   = {}
        status = "downloaded"
        label  = "[PRIMARY]" if is_primary else "[ALT]    "

        for size_name, img_folder, _ in sizes:
            src_url      = f"{IMAGE_BASE}/{img_folder}/{img_id}.jpg"
            storage_path = f"{size_name}/{img_id}.jpg"

            try:
                img_bytes   = download_bytes(src_url)
                public_url  = upload_to_supabase(supabase, storage_path, img_bytes)
                urls[size_name] = public_url
            except requests.HTTPError as e:
                if e.response.status_code == 404:
                    urls[size_name] = None  # some cards lack cropped art
                else:
                    print(f"  {label} card {card_id} img {img_id} [{size_name}] HTTP {e.response.status_code}")
                    status = "not_found"
            except Exception as e:
                print(f"  {label} card {card_id} img {img_id} [{size_name}] error: {e}")
                status = "not_found"

            time.sleep(DELAY_S)

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE card_images
                SET image_url         = %s,
                    image_url_small   = %s,
                    image_url_cropped = %s,
                    image_status      = %s
                WHERE id = %s
                """,
                [
                    urls.get("full"),
                    urls.get("small"),
                    urls.get("cropped"),
                    status,
                    row_id,
                ],
            )
            conn.commit()

        print(f"{label} card {card_id} img {img_id}: {status}")


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    conn     = psycopg2.connect(DATABASE_URL)

    try:
        if not SKIP_PHASE1:
            ygoprodeck_cards = fetch_all_ygoprodeck_cards()
            phase1_map_ids(conn, ygoprodeck_cards)
        else:
            print("Skipping Phase 1 (SKIP_PHASE1=True)")
        phase2_download_images(conn, supabase)
    finally:
        conn.close()

    print("\nDone.")


if __name__ == "__main__":
    main()
