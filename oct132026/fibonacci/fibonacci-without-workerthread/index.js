
const express = require("express");

const app = express();
const PORT = 3000;

// Naive recursive Fibonacci function
function fibonacci(n) {
    if (n <= 1) {
        return n;
    }

    return fibonacci(n - 1) + fibonacci(n - 2);
}

// Home route
app.get("/", (req, res) => {
    res.send("Fibonacci Web Server is running!");
});

// Fibonacci API endpoint
app.get("/fibonacci/:n", (req, res) => {
    const n = Number(req.params.n);

    // Validate input
    if (!Number.isInteger(n) || n < 0 || n > 40) {
        return res.status(400).json({
            error: "Please provide an integer between 0 and 40."
        });
    }

    // Calculate Fibonacci number
    const result = fibonacci(n);

    // Send JSON response
    res.status(200).json({
        input: n,
        result: result
    });
});

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found"
    });
});

// Start the web server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
