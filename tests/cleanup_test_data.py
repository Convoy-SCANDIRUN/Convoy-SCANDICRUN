"""Cleanup TEST_ prefixed events and their registrations."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    events = await db.events.find({"name": {"$regex": "^TEST_"}}, {"_id": 0}).to_list(100)
    for e in events:
        r = await db.registrations.delete_many({"event_id": e["id"]})
        print(f"Event {e['name']} ({e['id']}) → deleted {r.deleted_count} regs")
    r = await db.events.delete_many({"name": {"$regex": "^TEST_"}})
    print(f"Deleted {r.deleted_count} test events")

asyncio.run(main())
