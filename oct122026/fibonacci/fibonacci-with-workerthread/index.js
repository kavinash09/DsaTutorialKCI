
const express = require("express");
const { Worker } = require("node:worker_threads");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const app = express();
const PORT = 3000;

const POOL_SIZE = 4;
const MAX_QUEUE_SIZE = 100;
const WORKER_PATH = path.join(__dirname, "fibonacci-worker.js");

function log(message, data = {}) {
    console.log(
        `[${new Date().toISOString()}] [MAIN]`,
        message,
        JSON.stringify(data)
    );
}

class WorkerPool {
    constructor(size, maxQueueSize) {
        this.maxQueueSize = maxQueueSize;
        this.queue = [];
        this.workers = [];

        for (let i = 0; i < size; i++) {
            const slot = {
                id: i + 1,
                worker: null,
                currentTask: null
            };

            this.workers.push(slot);
            this.createWorker(slot);
        }

        log("Worker pool initialized", {
            poolSize: size,
            maxQueueSize
        });
    }

    createWorker(slot) {
        const worker = new Worker(WORKER_PATH);
        slot.worker = worker;

        log("Worker created", {
            workerId: slot.id,
            threadId: worker.threadId
        });

        worker.on("online", () => {
            log("Worker online", {
                workerId: slot.id,
                threadId: worker.threadId
            });

            this.dispatch();
        });

        worker.on("message", (message) => {
            if (slot.worker !== worker) return;

            const task = slot.currentTask;

            if (!task || task.requestId !== message.requestId) {
                log("Unexpected worker message", {
                    workerId: slot.id,
                    message
                });
                return;
            }

            slot.currentTask = null;

            log("Worker completed task", {
                workerId: slot.id,
                requestId: task.requestId,
                result: message.result
            });

            if (message.error) {
                task.reject(new Error(message.error));
            } else {
                task.resolve({
                    result: message.result,
                    workerId: slot.id,
                    threadId: worker.threadId
                });
            }

            this.dispatch();
        });

        worker.on("error", (error) => {
            log("Worker error", {
                workerId: slot.id,
                error: error.message
            });

            this.recoverWorker(slot, worker, error);
        });

        worker.on("exit", (code) => {
            log("Worker exited", {
                workerId: slot.id,
                code
            });

            if (slot.worker !== worker) return;

            this.recoverWorker(
                slot,
                worker,
                new Error(`Worker exited with code ${code}`)
            );
        });
    }

    recoverWorker(slot, failedWorker, error) {
        if (slot.worker !== failedWorker) return;

        // Mark this worker unavailable before handling its exit event.
        slot.worker = null;

        if (slot.currentTask) {
            slot.currentTask.reject(error);
            slot.currentTask = null;
        }

        log("Replacing failed worker", {
            workerId: slot.id
        });

        this.createWorker(slot);
    }

    execute(n, requestId) {
        return new Promise((resolve, reject) => {
            const idleWorkerExists = this.workers.some(
                slot => slot.worker && !slot.currentTask
            );

            if (
                !idleWorkerExists &&
                this.queue.length >= this.maxQueueSize
            ) {
                log("Queue full; rejecting request", {
                    requestId,
                    queueSize: this.queue.length
                });

                reject(new Error("Worker queue is full"));
                return;
            }

            const task = { n, requestId, resolve, reject };

            this.queue.push(task);

            log("Task queued", {
                requestId,
                n,
                queueSize: this.queue.length,
                activeWorkers: this.workers.filter(
                    slot => slot.currentTask
                ).length
            });

            this.dispatch();
        });
    }

    dispatch() {
        for (const slot of this.workers) {
            if (!slot.worker || slot.currentTask) continue;

            const task = this.queue.shift();
            if (!task) break;

            slot.currentTask = task;

            log("Dispatching task to worker", {
                requestId: task.requestId,
                workerId: slot.id,
                threadId: slot.worker.threadId,
                n: task.n,
                queueSize: this.queue.length
            });

            try {
                slot.worker.postMessage({
                    n: task.n,
                    requestId: task.requestId
                });
            } catch (error) {
                slot.currentTask = null;
                task.reject(error);
                this.dispatch();
            }
        }
    }
}

const pool = new WorkerPool(POOL_SIZE, MAX_QUEUE_SIZE);

app.get("/", (req, res) => {
    res.send("Bounded Fibonacci worker pool is running!");
});

app.get("/fibonacci/:n", async (req, res) => {
    const requestId = randomUUID();
    const startTime = Date.now();
    const n = Number(req.params.n);

    log("Request received", {
        requestId,
        url: req.originalUrl,
        n
    });

    if (!Number.isInteger(n) || n < 0 || n > 40) {
        return res.status(400).json({
            requestId,
            error: "n must be an integer between 0 and 40"
        });
    }

    try {
        const result = await pool.execute(n, requestId);

        res.status(200).json({
            requestId,
            input: n,
            result: result.result,
            workerId: result.workerId,
            workerThreadId: result.threadId,
            durationMs: Date.now() - startTime
        });
    } catch (error) {
        if (error.message === "Worker queue is full") {
            return res.status(503).json({
                requestId,
                error: "Server is busy. Try again later."
            });
        }

        log("Calculation failed", {
            requestId,
            error: error.message
        });

        res.status(500).json({
            requestId,
            error: "Fibonacci calculation failed"
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
    log("Server listening", {
        port: PORT,
        pid: process.pid
    });
});
