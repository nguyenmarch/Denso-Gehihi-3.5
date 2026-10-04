import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

class BaseWorker:
    def __init__(self, interval_seconds: int = 10):
        self.interval = interval_seconds
        self.is_running = False

    async def start(self):
        self.is_running = True
        logger.info(f"Starting worker with interval {self.interval}s")
        while self.is_running:
            await self.run_cycle()
            await asyncio.sleep(self.interval)

    def stop(self):
        self.is_running = False

    async def run_cycle(self):
        logger.error("Worker %s has no cycle implementation", type(self).__name__)
