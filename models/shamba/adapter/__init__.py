"""GroveWorks wrapper for the SHAMBA carbon model.

The upstream model is not copied into this repository. It is cloned at a
pinned commit when the container image is built (see ../Dockerfile), and
located at runtime through the SHAMBA_SRC environment variable.
"""

ADAPTER_VERSION = "0.1.0"
