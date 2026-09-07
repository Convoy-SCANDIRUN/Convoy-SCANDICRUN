"""Set the test registration's last_update to 10 minutes ago, and optionally set help_status."""
import asyncio, os, sys
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

REG_ID = sys.argv[1]
HELP = sys.argv[2] if len(sys.argv) > 2 else None

async def main():
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    stale = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    upd = {"last_update": stale}
    if HELP:
        upd["help_status"] = HELP
    r = await db.registrations.update_one({"id": REG_ID}, {"$set": upd})
    print("matched:", r.matched_count, "modified:", r.modified_count, "set:", upd)

asyncio.run(main())
