"""
Embeddings service — runs periodically to generate real embeddings for messages
that have the placeholder embedding from vectorMemory.ts.

In production this would use a proper embedding model (Voyage AI, OpenAI, etc.)
For now it demonstrates the pgvector pipeline.
"""
import os
import time
import json
import numpy as np
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://afp:afppassword@postgres:5432/agentforce_platform")


def pseudo_embed(text: str, dim: int = 1536) -> list[float]:
    """Deterministic pseudo-embedding based on character hash. 
    Replace with real model in production."""
    seed = sum(ord(c) for c in text)
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim).astype(np.float32)
    # Normalize
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def process_unembedded_messages(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, content FROM messages
            WHERE embedding IS NULL
            LIMIT 100
        """)
        rows = cur.fetchall()

        for msg_id, content in rows:
            embedding = pseudo_embed(content)
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            cur.execute(
                "UPDATE messages SET embedding = %s::vector WHERE id = %s",
                (embedding_str, msg_id)
            )

        conn.commit()
        if rows:
            print(f"Embedded {len(rows)} messages")
        return len(rows)


def main():
    print("Embeddings service starting...")
    while True:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            count = process_unembedded_messages(conn)
            conn.close()
        except Exception as e:
            print(f"Error: {e}")
        time.sleep(10)


if __name__ == "__main__":
    main()
