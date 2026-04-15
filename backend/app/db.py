from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection

from .config import settings


@lru_cache(maxsize=1)
def _get_client() -> MongoClient:
    return MongoClient(settings.mongodb_uri)


def get_apply_journal_collection() -> Collection:
    db = _get_client().get_default_database(default="ai_assisted_apply")
    return db["apply_journal"]
