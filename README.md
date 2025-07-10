# 🪙 Solana Token Launchpad

This is a **Solana Token Launchpad** built using React and Solana web3 libraries. It allows users to create their own SPL tokens with custom metadata and upload images via Pinata.

## 🚀 Features

- Create SPL tokens on Solana
- Customize token name, symbol, decimals, and supply
- Upload token image and store it on Pinata (IPFS)
- Generate metadata JSON and store it on Pinata
- Uses Metaplex to link metadata with tokens

## 🛠️ Tech Stack

- **React JS**
- **Solana Web3.js**
- **@solana/spl-token**
- **@metaplex-foundation/mpl-token-metadata**
- **Pinata API**

## ⚙️ Installation

1. Clone the repository:

```bash
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

For production, secure your API keys using a backend proxy.

📷 Demo

🧑‍💻 Author
Your Name

Your GitHub Profile

⭐ Show your support!
If you like this project, give it a ⭐ on GitHub.

yaml
Copy
Edit

---

### ⚠️ **Important for `.env`:**

| Variable | Use |
|--|--|
| **VITE_PINATA_API_KEY** | Your Pinata API Key |
| **VITE_PINATA_API_SECRET** | Your Pinata API Secret |
| **VITE_SOLANA_RPC_URL** | Your preferred Solana RPC URL |

---
