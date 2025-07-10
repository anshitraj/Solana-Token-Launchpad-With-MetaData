import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getMintLen,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  TYPE_SIZE,
  LENGTH_SIZE,
  ExtensionType,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
// Pinata integration: no import needed, use fetch

export function TokenLaunchpad() {
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // { mint: string }

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(6);
  const [supply, setSupply] = useState("100000000");
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [revokeFreeze, setRevokeFreeze] = useState(true);
  const [revokeMint, setRevokeMint] = useState(false);
  const [revokeUpdate, setRevokeUpdate] = useState(false);
  const [optionalUrls, setOptionalUrls] = useState([{ label: "", url: "" }]);
  const [showOptionalUrls, setShowOptionalUrls] = useState(false);

  // Image upload handler
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // Optional URLs handlers
  const handleUrlChange = (idx, field, value) => {
    const newUrls = [...optionalUrls];
    newUrls[idx][field] = value;
    setOptionalUrls(newUrls);
  };
  const addUrlField = () =>
    setOptionalUrls([...optionalUrls, { label: "", url: "" }]);
  const removeUrlField = (idx) =>
    setOptionalUrls(optionalUrls.filter((_, i) => i !== idx));

  const { connection } = useConnection();
  // Full token creation logic
  const handleCreateToken = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      if (!imagePreview) throw new Error("Please upload an image");
      // 1. Upload image to Pinata
      const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY;
      const pinataApiSecret = import.meta.env.VITE_PINATA_API_SECRET;
      if (!pinataApiKey || !pinataApiSecret)
        throw new Error("Pinata API key/secret not set");
      // Convert base64 to Blob
      const res = await fetch(imagePreview);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, "token-image.png");
      // Pinata pinFileToIPFS
      const imageResp = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataApiSecret,
          },
          body: formData,
        }
      );
      const imageData = await imageResp.json();
      if (!imageData.IpfsHash) throw new Error("Image upload to Pinata failed");
      const imageIpfsUrl = `https://gateway.pinata.cloud/ipfs/${imageData.IpfsHash}`;

      // 2. Build metadata JSON
      const metadataJson = {
        name,
        symbol,
        description,
        image: imageIpfsUrl,
        properties: {
          files: [{ uri: imageIpfsUrl, type: blob.type }],
          category: "image",
          creators: [{ address: wallet.publicKey.toBase58(), share: 100 }],
          urls: optionalUrls
            .filter((u) => u.url)
            .map((u) => ({ label: u.label, url: u.url })),
        },
      };
      // 3. Upload metadata to Pinata
      const metaResp = await fetch(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataApiSecret,
          },
          body: JSON.stringify(metadataJson),
        }
      );
      const metaData = await metaResp.json();
      if (!metaData.IpfsHash)
        throw new Error("Metadata upload to Pinata failed");
      const metadataUri = `https://gateway.pinata.cloud/ipfs/${metaData.IpfsHash}`;

      // 4. Create mint account and initialize (same as before)
      const mintKeypair = Keypair.generate();
      const metadata = {
        mint: mintKeypair.publicKey,
        name,
        symbol,
        uri: metadataUri,
        additionalMetadata: [],
      };
      const mintLen = getMintLen([ExtensionType.MetadataPointer]);
      const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
      const lamports = await connection.getMinimumBalanceForRentExemption(
        mintLen + metadataLen
      );

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMetadataPointerInstruction(
          mintKeypair.publicKey,
          wallet.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          wallet.publicKey,
          null,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          mint: mintKeypair.publicKey,
          metadata: mintKeypair.publicKey,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
          mintAuthority: wallet.publicKey,
          updateAuthority: wallet.publicKey,
        })
      );
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      transaction.partialSign(mintKeypair);
      await wallet.sendTransaction(transaction, connection);

      // 5. Create associated token account
      const associatedToken = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const transaction2 = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedToken,
          wallet.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await wallet.sendTransaction(transaction2, connection);

      // 6. Mint tokens to user
      const transaction3 = new Transaction().add(
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedToken,
          wallet.publicKey,
          Number(supply),
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      await wallet.sendTransaction(transaction3, connection);

      setSuccess({ mint: mintKeypair.publicKey.toBase58() });
    } catch (err) {
      console.error("Token creation error:", err);
      let msg = "";
      if (err) {
        if (err.message) msg += err.message + "\n";
        if (err.name) msg += "Error Name: " + err.name + "\n";
        msg += JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
      }
      setError(msg || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const wallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  return (
    <div className="token-launchpad-bg">
      {loading && (
        <div className="modal-overlay">
          <div className="modal-box">
            Uploading and creating token, please wait...
          </div>
        </div>
      )}
      {error && (
        <div className="modal-overlay">
          <div className="modal-box error">
            {error} <button onClick={() => setError("")}>Close</button>
          </div>
        </div>
      )}
      {success && (
        <div className="modal-overlay">
          <div className="modal-box success">
            <div>Token created successfully!</div>
            <div>
              Mint Address:
              <br />
              <b>{success.mint}</b>
            </div>
            <a
              href={`https://solscan.io/token/${success.mint}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="solscan-link"
            >
              View on Solscan
            </a>
            <button onClick={() => setSuccess(null)}>Close</button>
          </div>
        </div>
      )}
      <div className="topbar">
        <div className="logo-title">
          <span className="logo-icon">🦋</span>
          <span className="logo-text">MintCoin</span>
        </div>
        <div className="topbar-links">
          <a href="#" className="topbar-link">
            Blog
          </a>
          <a href="#" className="topbar-link">
            FAQ
          </a>
          {/* Wallet button is handled by parent */}
        </div>
      </div>
      <div className="token-launchpad-container">
        <div className="token-launchpad-card">
          <h2 className="form-title">Solana Token Creator</h2>
          <p className="form-subtitle">
            Create your own SPL token with custom specifications
          </p>
          <form className="token-form" onSubmit={handleCreateToken}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  maxLength={8}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Decimals</label>
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Supply</label>
                <input
                  type="number"
                  min={1}
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-group image-upload-group">
              <label>Image</label>
              <div className="image-upload-box">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="image-preview"
                  />
                ) : (
                  <span className="image-upload-placeholder">Upload Image</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </div>
            </div>
            <div className="form-row switches-row">
              <div className="switch-group">
                <label>
                  Revoke Freeze <span className="required">(required)</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={revokeFreeze}
                    onChange={(e) => setRevokeFreeze(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="switch-desc">
                  Allows you to create a liquidity pool
                </span>
              </div>
              <div className="switch-group">
                <label>Revoke Mint</label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={revokeMint}
                    onChange={(e) => setRevokeMint(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="switch-desc">
                  Removes the ability to increase token supply
                </span>
              </div>
              <div className="switch-group">
                <label>Revoke Update</label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={revokeUpdate}
                    onChange={(e) => setRevokeUpdate(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="switch-desc">
                  Removes the ability to modify token metadata and authorities
                </span>
              </div>
            </div>
            <div className="optional-urls-section">
              <button
                type="button"
                className="optional-urls-toggle"
                onClick={() => setShowOptionalUrls((v) => !v)}
              >
                <span>{showOptionalUrls ? "▼" : "►"}</span> Optional URLs
              </button>
              {showOptionalUrls && (
                <div className="optional-urls-fields">
                  {optionalUrls.map((urlObj, idx) => (
                    <div className="optional-url-row" key={idx}>
                      <input
                        type="text"
                        placeholder="Label (e.g. Website, Twitter)"
                        value={urlObj.label}
                        onChange={(e) =>
                          handleUrlChange(idx, "label", e.target.value)
                        }
                      />
                      <input
                        type="url"
                        placeholder="URL"
                        value={urlObj.url}
                        onChange={(e) =>
                          handleUrlChange(idx, "url", e.target.value)
                        }
                      />
                      {optionalUrls.length > 1 && (
                        <button
                          type="button"
                          className="remove-url-btn"
                          onClick={() => removeUrlField(idx)}
                        >
                          -
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-url-btn"
                    onClick={addUrlField}
                  >
                    + Add URL
                  </button>
                </div>
              )}
            </div>
            {wallet.connected ? (
              <button type="submit" className="btn main-btn">
                Create Token
              </button>
            ) : (
              <button
                type="button"
                className="btn main-btn"
                onClick={() => setWalletModalVisible(true)}
              >
                Select Wallet
              </button>
            )}
          </form>
        </div>
        <div className="token-launchpad-sidepanels">
          <div className="sidepanel info-panel">
            <h3>Create Solana Token</h3>
            <p>
              Effortlessly create your Solana SPL Token with our easy form – no
              coding required.
              <br />
              <br />
              Customize your Solana Token exactly the way you envision it. Less
              than 5 minutes, at an affordable cost.
            </p>
          </div>
          <div className="sidepanel howto-panel">
            <h3>How to use Solana Token Creator</h3>
            <ol>
              <li>Specify the desired name for your Token.</li>
              <li>Indicate the symbol (max 8 characters).</li>
              <li>
                Select the decimals quantity (default recommended 6 for all
                tokens).
              </li>
              <li>Determine the Supply of your Token.</li>
              <li>Provide a brief description.</li>
              <li>Upload the image for your token.</li>
              <li>
                Click on create, accept the transaction and wait until your
                tokens ready.
              </li>
            </ol>
            <div className="cost-box">
              The cost of Token creation is <b>0.25 SOL</b>, covering all fees
              for SPL Token Creation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
