
const {
    parentPort,
    workerData,
    threadId
} = require("node:worker_threads");

function log(requestId, message, data = {}) {
    console.log(
        `[${new Date().toISOString()}]`,
        `[WORKER ${threadId}]`,
        `[Request: ${requestId}]`,
        message,
        JSON.stringify(data)
    );
}

// Naive recursive Fibonacci — no internal logging
function fibonacci(n) {
    if (n <= 1) {
        return n;
    }

    return fibonacci(n - 1) + fibonacci(n - 2);
}

const { n, requestId } = workerData;

log(requestId, "Worker script started", {
    threadId,
    processId: process.pid,
    input: n
});

try {
    log(requestId, "Starting recursive calculation");

    const result = fibonacci(n);

    log(requestId, "Calculation completed", {
        input: n,
        result
    });

    log(requestId, "Sending result to main thread");

    parentPort.postMessage({
        requestId,
        result
    });

    log(requestId, "Result message sent");
} catch (error) {
    log(requestId, "Calculation failed", {
        message: error.message
    });

    parentPort.postMessage({
        requestId,
        error: error.message
    });
}
