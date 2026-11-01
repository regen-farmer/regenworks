"""Python port of Yield-SAFE v2 (see model.py and ../NOTICE.md)."""

from .model import CropParams, Irrigation, Scenario, SoilParams, TreeParams, YearPlan, simulate, yearly

MODEL_VERSION = "Yield-SAFE v2 (Excel, 2023) port 1"

__all__ = ["CropParams", "Irrigation", "Scenario", "SoilParams", "TreeParams", "YearPlan", "simulate", "yearly", "MODEL_VERSION"]
