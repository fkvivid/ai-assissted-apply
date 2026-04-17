from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection

from .config import settings


def journal_storage_configured() -> bool:
    return bool(settings.mongodb_uri.strip())


@lru_cache(maxsize=1)
def _get_client(uri: str) -> MongoClient:
    return MongoClient(uri)


def get_apply_journal_collection() -> Collection | None:
    uri = settings.mongodb_uri.strip()
    if not uri:
        return None
    db = _get_client(uri).get_default_database(default="ai_assisted_apply")
    return db["apply_journal"]
