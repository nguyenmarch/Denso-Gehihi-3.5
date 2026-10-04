from app.workers.base import BaseWorker, logger

class ScadaWorker(BaseWorker):
    thresholds = {"temperature": 245.0, "vibration": 4.5, "cycle_time_seconds": 30.0}
    async def run_cycle(self):
        # The deterministic stream keeps the worker useful in development while
        # leaving the ingestion boundary ready for MQTT/Kafka adapters.
        metrics = {"temperature": 220.0, "vibration": 1.2, "cycle_time_seconds": 18.0}
        violations = [key for key, value in metrics.items() if value > self.thresholds[key]]
        if violations:
            logger.warning("SCADA threshold violations: %s", ", ".join(violations))
        else:
            logger.info("SCADA metrics nominal: %s", metrics)
