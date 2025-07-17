import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import process from "process";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Token schema
const tokenSchema = new mongoose.Schema({
  name: String,
  symbol: String,
  decimals: Number,
  supply: String,
  description: String,
  image: String,
  optionalUrls: [
    {
      label: String,
      url: String,
    },
  ],
  mint: String, // Solana mint address
  createdAt: { type: Date, default: Date.now },
});

const Token = mongoose.model("Token", tokenSchema);

// API endpoint to save token data
app.post("/api/tokens", async (req, res) => {
  try {
    const tokenData = req.body;
    const token = new Token(tokenData);
    await token.save();
    res.status(201).json({ message: "Token data saved", token });
  } catch (err) {
    console.error("Error saving token:", err);
    res.status(500).json({ error: "Failed to save token data" });
  }
});

app.get("/", (req, res) => {
  res.send("Metadata Launchpad Backend is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
