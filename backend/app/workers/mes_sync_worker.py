from app.workers.base import BaseWorker, logger

class MesSyncWorker(BaseWorker):
    async def run_cycle(self):
        logger.info("Syncing MES production orders and active batches...")
