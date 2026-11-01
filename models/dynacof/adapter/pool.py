"""A small pool of long-lived Julia workers (see ../worker/worker.jl).

A fresh Julia process needs ~20 s to compile DynACof, a warm one runs 38
years of daily simulation in a few seconds. So workers stay up, take one job
at a time, and are killed and replaced if a job runs past its time limit.
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER_DIR = os.environ.get("DYNACOF_WORKER_DIR", os.path.join(os.path.dirname(HERE), "worker"))
JULIA = os.environ.get("JULIA", "julia")
STARTUP_TIMEOUT_S = int(os.environ.get("DYNACOF_STARTUP_TIMEOUT_S", "600"))


class WorkerError(Exception):
    def __init__(self, kind: str, detail: str):
        super().__init__(detail)
        self.kind, self.detail = kind, detail


class Worker:
    def __init__(self, memory_mb: int):
        self.memory_mb = memory_mb
        self.proc: subprocess.Popen | None = None
        self.lines: queue.Queue[str | None] = queue.Queue()

    def _reader(self, stream):
        for line in stream:
            self.lines.put(line)
        self.lines.put(None)  # process ended

    def start(self) -> None:
        cmd = [
            JULIA,
            f"--project={WORKER_DIR}",
            "--startup-file=no",
            "--history-file=no",
            f"--heap-size-hint={self.memory_mb}M",
            os.path.join(WORKER_DIR, "worker.jl"),
        ]
        self.lines = queue.Queue()
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        threading.Thread(target=self._reader, args=(self.proc.stdout,), daemon=True).start()
        msg = self._next(STARTUP_TIMEOUT_S, "Julia worker did not start")
        if not msg.get("ready"):
            self.stop()
            raise WorkerError("model_error", f"unexpected worker start message: {msg}")

    def _next(self, timeout: float, what: str) -> dict:
        try:
            line = self.lines.get(timeout=timeout)
        except queue.Empty:
            self.stop()
            raise WorkerError("timeout", f"{what} within {timeout:.0f} s")
        if line is None:
            self.stop()
            raise WorkerError("model_error", "Julia worker exited unexpectedly (out of memory?)")
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            self.stop()
            raise WorkerError("model_error", f"unreadable worker reply: {line[:200]}")

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def run(self, workdir: str, timeout: float) -> None:
        if not self.alive():
            self.start()
        assert self.proc and self.proc.stdin
        self.proc.stdin.write(workdir + "\n")
        self.proc.stdin.flush()
        msg = self._next(timeout, "DynACof did not finish")
        if not msg.get("ok"):
            raise WorkerError(msg.get("kind", "model_error"), msg.get("detail", "model error"))

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.kill()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                pass
        self.proc = None


class Pool:
    """Fixed number of workers. `acquire()` returns None when all are busy."""

    def __init__(self, size: int, memory_mb: int):
        self.idle: queue.Queue[Worker] = queue.Queue()
        for _ in range(size):
            self.idle.put(Worker(memory_mb))

    def start_all(self) -> None:
        workers = []
        while not self.idle.empty():
            w = self.idle.get()
            w.start()
            workers.append(w)
        for w in workers:
            self.idle.put(w)

    def acquire(self) -> Worker | None:
        try:
            return self.idle.get_nowait()
        except queue.Empty:
            return None

    def release(self, w: Worker) -> None:
        self.idle.put(w)

    def stop_all(self) -> None:
        while not self.idle.empty():
            self.idle.get().stop()
