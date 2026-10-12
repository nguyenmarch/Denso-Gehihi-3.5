DEFAULT_ACTION_RULES = {
    "MACHINE_BREAKDOWN": {
        "DEP_MAINT": "Isolate EQ_OVEN_01 safely; verify heater, SSR, thermocouple and insulation; record repair evidence.",
        "DEP_PROD": "Stop affected WIP at reflow, identify last-good unit, reroute to an approved line and revise the shift plan.",
        "DEP_QA": "Quarantine units since the last good thermal profile; run solder-joint inspection and release only after QA approval.",
        "DEP_SCM": "Confirm spare heater/thermocouple availability and expedite approved replacement parts."
    },
    "MATERIAL_DEFECT": {
        "DEP_SCM": "Freeze the suspect capacitor lot, block further issue, preserve samples and open a supplier corrective-action request.",
        "DEP_QA": "Verify tolerance with calibrated equipment, increase sampling and quarantine all units using the suspect lot.",
        "DEP_PROD": "Stop work orders using the lot, identify the last-good batch and substitute only with QA-approved material.",
        "DEP_MAINT": "Check feeder setup and measurement fixtures so handling or calibration cannot mimic a material defect."
    },
    "CYCLE_TIME_SPIKE": {
        "DEP_PROD": "Dispatch a float operator, rebalance WIP and prioritize aging orders without bypassing quality gates.",
        "DEP_MAINT": "Inspect AOI recipe, conveyor speed, camera/lighting, reject mechanism and recent alarms; restore nominal cycle time.",
        "DEP_QA": "Review false-call rate and defect images, validate the inspection program and authorize controlled throughput recovery.",
        "DEP_SCM": "Notify downstream planning of capacity loss and confirm dispatch commitments for at-risk orders."
    }
}

# Each playbook above is written for one asset (the oven heater, the SMT capacitor lot, the AOI
# station), so incident guidance is selected by (asset, incident type). Any other pair is a
# knowledge gap rather than a playbook written for a different machine.
CONTEXT_GUIDANCE = {
    ("EQ_OVEN_01", "MACHINE_BREAKDOWN"): "MACHINE_BREAKDOWN",
    ("STEP_SMT", "MATERIAL_DEFECT"): "MATERIAL_DEFECT",
    ("EQ_AOI_01", "CYCLE_TIME_SPIKE"): "CYCLE_TIME_SPIKE",
}

# Asset types an incident of each type can originate from.
ORIGIN_TYPES = {
    "MACHINE_BREAKDOWN": {"Equipment"},
    "CYCLE_TIME_SPIKE": {"Equipment"},
    "MATERIAL_DEFECT": {"ProcessStep", "Batch"},
}
