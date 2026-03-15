#!/usr/bin/env python3
"""Run the FastAPI server. Use from project root: python run.py"""
import os
import sys

# Ensure project root is on path when running as script
_root = os.path.dirname(os.path.abspath(__file__))
if _root not in sys.path:
    sys.path.insert(0, _root)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8888,
        reload=False,
    )
