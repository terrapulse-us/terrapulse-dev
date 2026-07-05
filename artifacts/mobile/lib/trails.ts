// Trail data and vehicle-type helpers live in the shared `@workspace/trail-data`
// package so the API server's AI agent tools (trail-briefing, vehicle-fit-check)
// can use the exact same built-in trail dataset as the mobile app.
export * from "@workspace/trail-data";
