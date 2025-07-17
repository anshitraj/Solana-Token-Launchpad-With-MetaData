# 🪙 Solana Token Launchpad

This is a **Solana Token Launchpad** built using React and Solana web3 libraries. It allows users to create their own SPL tokens with custom metadata and upload images via Pinata.

## 🚀 Features

- Create SPL tokens on Solana
- Customize token name, symbol, decimals, and supply
- Upload token image and store it on Pinata (IPFS)
- Generate metadata JSON and store it on Pinata
- Uses Metaplex to link metadata with tokens

## 🛠️ Tech Stack & Dependencies

- **React JS**
- **Vite**
- **@solana/web3.js**
- **@solana/spl-token**
- **@metaplex-foundation/mpl-token-metadata**
- **Axios** (for Pinata API calls)
- **dotenv** (for managing environment variables)

### 📦 **Install all dependencies:**

If you haven’t initialized the project yet, run:

````bash
npm create vite@latest
cd your-project-name
Then install dependencies:

bash
Copy
Edit
npm install
npm install @solana/web3.js @solana/spl-token @metaplex-foundation/mpl-token-metadata axios dotenv
⚙️ Setup
Clone the repository:

bash
Copy
Edit
git clone https://github.com/username/solana-token-launchpad.git
cd solana-token-launchpad
Install dependencies:

bash
Copy
Edit
npm install
Create a .env file in the root folder.

🔑 What to include in .env:
env
Copy
Edit
VITE_PINATA_API_KEY=your_pinata_api_key
VITE_PINATA_API_SECRET=your_pinata_api_secret
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
Replace with your actual Pinata API key and secret, and RPC URL (mainnet or devnet based on your use).

Start the project:

bash
Copy
Edit
npm run dev
📝 Notes
Ensure your wallet is connected to the correct Solana network.

Pinata credentials are required for uploading images and metadata.

For production, secure your API keys using a backend proxy or serverless function.

📷 Demo

🧑‍💻 Author
Your Name

Your GitHub Profile

⭐ Show your support!
If you like this project, give it a ⭐ on GitHub.

## Secure Pinata Upload Proxy (Production)

**Why:** Never expose your Pinata API keys in the frontend. Use a backend or serverless function to proxy uploads.

### Example: Express.js Upload Proxy

Create a new file (e.g. `upload-proxy.js`):

```js
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const app = express();
const upload = multer();

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET;

app.post('/api/pinata/upload', upload.single('file'), async (req, res) => {
  const formData = new FormData();
  formData.append('file', req.file.buffer, req.file.originalname);
  const pinataResp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
    body: formData,
  });
  const data = await pinataResp.json();
  res.json(data);
});

app.listen(3001, () => console.log('Proxy running on port 3001'));
````

- Deploy this server (or as a serverless function).
- Set your Pinata keys in environment variables.
- Change your frontend to POST to `/api/pinata/upload` instead of directly to Pinata.

### For Vercel/Netlify

- Use their serverless function format, but the logic is the same.
- Never commit your API keys to the repo.

---

**Frontend usage:**

- Change the upload endpoint in your code to your proxy URL (e.g. `/api/pinata/upload`).
- Remove Pinata keys from the frontend.

---

**Contact:**
For help integrating the proxy, ask your developer or reach out for support!

# MongoDB Atlas Backend Integration

A backend server is now included for saving token data (name, symbol, etc.) to MongoDB Atlas. You must add your MongoDB Atlas connection string to a `.env` file in the `backend/` folder as follows:

```
MONGODB_URI=your_mongodb_atlas_connection_string
```

## Running the Backend

1. `cd backend`
2. `npm install`
3. `npm run dev` (or `npm start` for production)

The backend will run on `http://localhost:5000` by default.

---
