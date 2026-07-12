import { getDb } from "./client.js";

const { path } = getDb();
console.log(`Migrations applied for ${path}`);
