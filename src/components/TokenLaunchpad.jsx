import { useState, useEffect, useRef } from "react";
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

// Enhanced loading component
function LoadingSpinner() {
  return (
    <div className="loading-spinner">
      <div className="spinner-ring"></div>
      <div className="spinner-ring"></div>
      <div className="spinner-ring"></div>
    </div>
  );
}

// Enhanced floating particles background
function FloatingParticles() {
  return (
    <div className="floating-particles">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 20}s`,
            animationDuration: `${15 + Math.random() * 10}s`,
          }}
        />
      ))}
    </div>
  );
}

// Function to save token data to backend
async function saveTokenToBackend(tokenData) {
  try {
    const response = await fetch("http://localhost:5000/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenData),
    });
    if (!response.ok) throw new Error("Failed to save token data");
    return await response.json();
  } catch (err) {
    console.error("Error saving token to backend:", err);
  }
}

export function TokenLaunchpad() {
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // { mint: string }
  const [uploadProgress, setUploadProgress] = useState({
    image: 0,
    metadata: 0,
  });

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
  const [imageError, setImageError] = useState("");
  const [isFormValid, setIsFormValid] = useState(false);

  // Form validation
  useEffect(() => {
    const isValid = name.trim() && symbol.trim() && supply && imagePreview;
    setIsFormValid(isValid);
  }, [name, symbol, supply, imagePreview]);

  // Image upload handler
  const handleImageChange = (e) => {
    setImageError("");
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setImagePreview(null);
        setImageError("File must be an image (PNG, JPG, etc.)");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setImagePreview(null);
        setImageError("Image must be less than 2MB");
        return;
      }
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

  const tokenTemplates = [
    {
      label: "Select Template",
      value: "",
      decimals: 6,
      supply: "100000000",
      revokeMint: false,
      revokeUpdate: false,
    },
    {
      label: "Meme Coin",
      value: "meme",
      decimals: 0,
      supply: "1000000000",
      revokeMint: true,
      revokeUpdate: true,
    },
    {
      label: "Community Coin",
      value: "community",
      decimals: 2,
      supply: "10000000",
      revokeMint: true,
      revokeUpdate: true,
    },
    {
      label: "Utility Token",
      value: "utility",
      decimals: 6,
      supply: "1000000",
      revokeMint: false,
      revokeUpdate: false,
    },
  ];
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const handleTemplateChange = (e) => {
    const val = e.target.value;
    setSelectedTemplate(val);
    const template = tokenTemplates.find((t) => t.value === val);
    if (template) {
      setDecimals(template.decimals);
      setSupply(template.supply);
      setRevokeMint(template.revokeMint);
      setRevokeUpdate(template.revokeUpdate);
    }
  };

  const { connection } = useConnection();
  const [rentFee, setRentFee] = useState(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState("");
  // Estimate cost
  useEffect(() => {
    let ignore = false;
    async function fetchRent() {
      setCostLoading(true);
      setCostError("");
      try {
        // Mint account size (spl-token-2022, with metadata pointer)
        const mintLen = getMintLen([ExtensionType.MetadataPointer]);
        const metadataLen = TYPE_SIZE + LENGTH_SIZE + 100; // rough estimate
        const lamports = await connection.getMinimumBalanceForRentExemption(
          mintLen + metadataLen
        );
        if (!ignore) setRentFee(lamports);
      } catch (e) {
        if (!ignore) setCostError("Could not estimate rent fee");
      } finally {
        if (!ignore) setCostLoading(false);
      }
    }
    fetchRent();
    return () => {
      ignore = true;
    };
  }, [connection, decimals, supply]);
  const RPC_FEE = 0.000005; // 5000 lamports
  const MINT_FEE = 0.001; // 0.001 SOL (example)
  const totalCost = rentFee ? rentFee / 1e9 + RPC_FEE + MINT_FEE : null;
  // Helper for Pinata file upload with progress (frontend, .env keys)
  const uploadToPinataWithProgress = (
    url,
    formData,
    apiKey,
    apiSecret,
    onProgress
  ) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("pinata_api_key", apiKey);
      xhr.setRequestHeader("pinata_secret_api_key", apiSecret);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(xhr.responseText);
        }
      };
      xhr.onerror = () => reject(xhr.statusText);
      xhr.send(formData);
    });
  };
  // Helper for Pinata JSON upload with progress (frontend, .env keys)
  const uploadJsonToPinataWithProgress = (
    url,
    json,
    apiKey,
    apiSecret,
    onProgress
  ) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("pinata_api_key", apiKey);
      xhr.setRequestHeader("pinata_secret_api_key", apiSecret);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(xhr.responseText);
        }
      };
      xhr.onerror = () => reject(xhr.statusText);
      xhr.send(JSON.stringify(json));
    });
  };
  // Full token creation logic
  const handleCreateToken = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);
    setUploadProgress({ image: 0, metadata: 0 });

    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      if (!imagePreview) throw new Error("Please upload an image");

      // 1. Upload image to Pinata (frontend, .env keys)
      const pinataApiKey = import.meta.env.VITE_PINATA_API_KEY;
      const pinataApiSecret = import.meta.env.VITE_PINATA_API_SECRET;
      if (!pinataApiKey || !pinataApiSecret)
        throw new Error("Pinata API key/secret not set");

      // Convert base64 to Blob
      const res = await fetch(imagePreview);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, "token-image.png");

      // Upload to Pinata
      const imageData = await uploadToPinataWithProgress(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        pinataApiKey,
        pinataApiSecret,
        (percent) => setUploadProgress((p) => ({ ...p, image: percent }))
      );
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
      // 3. Upload metadata to Pinata (frontend, .env keys)
      const metaData = await uploadJsonToPinataWithProgress(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        metadataJson,
        pinataApiKey,
        pinataApiSecret,
        (percent) => setUploadProgress((p) => ({ ...p, metadata: percent }))
      );
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

      // Save token data to backend
      await saveTokenToBackend({
        name,
        symbol,
        decimals,
        supply,
        description,
        image: imageIpfsUrl,
        optionalUrls: optionalUrls.filter((u) => u.url),
        mint: mintKeypair.publicKey.toBase58(),
      });
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

  // Sample/mock tokens for Wall of Tokens
  const wallOfTokens = [
    {
      name: "SolMeme",
      symbol: "MEME",
      supply: "1,000,000,000",
      image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      mint: "So11111111111111111111111111111111111111112",
    },
    {
      name: "CommuDAO",
      symbol: "COMMU",
      supply: "10,000,000",
      image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      mint: "So11111111111111111111111111111111111111112",
    },
    {
      name: "UtiliPay",
      symbol: "UTIL",
      supply: "1,000,000",
      image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      mint: "So11111111111111111111111111111111111111112",
    },
  ];

  // Dynamic background class for preview
  let previewBgClass = "preview-bg-default";
  if (selectedTemplate === "meme") previewBgClass = "preview-bg-meme";
  else if (selectedTemplate === "community") previewBgClass = "preview-bg-dao";
  else if (selectedTemplate === "utility")
    previewBgClass = "preview-bg-utility";
  // Fallback: use symbol initials for some color logic
  else if (symbol && symbol.length > 0) {
    const first = symbol[0].toUpperCase();
    if ("AEIOU".includes(first)) previewBgClass = "preview-bg-pink";
    else if ("M".includes(first)) previewBgClass = "preview-bg-meme";
    else if ("D".includes(first)) previewBgClass = "preview-bg-dao";
    else previewBgClass = "preview-bg-default";
  }

  // Random symbol generator
  function randomSymbol() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const len = Math.floor(Math.random() * 3) + 3; // 3-5 letters
    let sym = "";
    for (let i = 0; i < len; i++) {
      sym += letters[Math.floor(Math.random() * letters.length)];
    }
    return sym;
  }
  const handleDiceClick = () => {
    setSymbol(randomSymbol());
  };

  return (
    <div className="token-launchpad-bg">
      <FloatingParticles />
      
      {loading && (
        <div className="modal-overlay">
          <div className="modal-box">
            <LoadingSpinner />
            <div style={{ marginBottom: 20, fontSize: '1.2rem', fontWeight: '600' }}>
              🚀 Creating Your Token
            </div>
            <div style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
              Please wait while we upload your assets and deploy your token to the Solana blockchain...
            </div>
            <div className="progress-group">
              <div className="progress-label">
                📸 Image Upload: {uploadProgress.image}%
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-inner"
                  style={{ width: uploadProgress.image + "%" }}
                ></div>
              </div>
              <div className="progress-label">
                📋 Metadata Upload: {uploadProgress.metadata}%
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-inner"
                  style={{ width: uploadProgress.metadata + "%" }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="modal-overlay">
          <div className="modal-box error">
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>❌</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '16px' }}>
              Token Creation Failed
            </div>
            <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>{error}</div>
            <button onClick={() => setError("")}>Try Again</button>
          </div>
        </div>
      )}
      {success && (
        <div className="modal-overlay">
          <div className="modal-box success">
            {/* Animated Token Reveal */}
            <AnimatedTokenReveal
              image={
                imagePreview ||
                "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
              }
              name={name}
              symbol={symbol}
            />
            <div style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '16px' }}>
              🎉 Token Created Successfully!
            </div>
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
              🔍 View on Solscan
            </a>
            <div className="share-buttons-group">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  "I just launched my own token using @SolMintLive 🚀 Create yours now at solmint.live!"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="share-btn twitter"
              >
                🐦
                Share on Twitter
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(
                  "https://solmint.live"
                )}&text=${encodeURIComponent(
                  "I just launched my own token using @SolMintLive 🚀 Create yours now at solmint.live!"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="share-btn telegram"
              >
                📢
                Share on Telegram
              </a>
            </div>
            <button onClick={() => setSuccess(null)}>Create Another Token</button>
          </div>
        </div>
      )}

      <div className="topbar">
        <div className="logo-title">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">SolanaLaunch</span>
        </div>
        <div className="topbar-links">
          <a href="#" className="topbar-link">
            📚 Docs
          </a>
          <a href="#" className="topbar-link">
            💬 Support
          </a>
          <a href="#" className="topbar-link">
            🏆 Leaderboard
          </a>
        </div>
      </div>

      <div className="token-launchpad-container">
        <div className="token-launchpad-card">
          <div className="form-group">
            <label>🎨 Token Template</label>
            <select
              value={selectedTemplate}
              onChange={handleTemplateChange}
              className="token-template-select"
            >
              {tokenTemplates.map((tpl) => (
                <option key={tpl.value} value={tpl.value}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </div>
          
          <h2 className="form-title">Create Your Token</h2>
          <p className="form-subtitle">
            Launch your SPL token on Solana in minutes with professional-grade tools
          </p>
          
          <form className="token-form" onSubmit={handleCreateToken}>
            <div className="form-row">
              <div className="form-group">
                <label>🏷️ Token Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your token name"
                  required
                />
              </div>
              <div className="form-group symbol-group">
                <label>🔤 Symbol</label>
                <div className="symbol-input-row">
                  <input
                    type="text"
                    value={symbol}
                    maxLength={8}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="TOKEN"
                    required
                  />
                  <button
                    type="button"
                    className="dice-btn"
                    title="Generate random symbol"
                    onClick={handleDiceClick}
                  >
                    🎲
                  </button>
                </div>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>🔢 Decimals</label>
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                  placeholder="6"
                  required
                />
              </div>
              <div className="form-group">
                <label>📊 Total Supply</label>
                <input
                  type="number"
                  min={1}
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  placeholder="1000000"
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>📝 Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your token's purpose and utility..."
                rows={3}
              />
            </div>
            
            <div className="form-group image-upload-group">
              <label>🖼️ Token Image</label>
              <div
                className={`image-upload-box${
                  imagePreview ? " has-image" : ""
                }`}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="image-preview"
                  />
                ) : (
                  <div className="image-upload-placeholder">
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📸</div>
                    <div>Click to upload image</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      PNG, JPG up to 2MB
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </div>
              {imageError && <div className="input-error">{imageError}</div>}
            </div>
            
            <div className="form-row switches-row">
              <div className="switch-group">
                <label>
                  🔒 Revoke Freeze <span className="required">(required)</span>
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
                  ✅ Enables liquidity pool creation
                </span>
              </div>
              <div className="switch-group">
                <label>🚫 Revoke Mint</label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={revokeMint}
                    onChange={(e) => setRevokeMint(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="switch-desc">
                  🔐 Prevents future token minting
                </span>
              </div>
              <div className="switch-group">
                <label>🛡️ Revoke Update</label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={revokeUpdate}
                    onChange={(e) => setRevokeUpdate(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="switch-desc">
                  🔒 Locks metadata permanently
                </span>
              </div>
            </div>
            
            {(!revokeMint || !revokeUpdate) && (
              <div className="audit-warning">
                {!revokeMint && (
                  <div>
                    ⚠️ <b>Warning:</b> Not revoking <b>mint</b> allows unlimited
                    token creation, which may harm trust.
                  </div>
                )}
                {!revokeUpdate && (
                  <div>
                    ⚠️ <b>Warning:</b> Not revoking <b>update</b> allows anyone
                    with authority to change token metadata or authorities.
                  </div>
                )}
              </div>
            )}
            
            <div className="optional-urls-section">
              <button
                type="button"
                className="optional-urls-toggle"
                onClick={() => setShowOptionalUrls((v) => !v)}
              >
                <span>{showOptionalUrls ? "▼" : "►"}</span> 🔗 Optional URLs
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
              <button 
                type="submit" 
                className={`btn main-btn ${!isFormValid ? 'disabled' : ''}`}
                disabled={loading || !isFormValid}
              >
                {loading ? "🚀 Creating..." : "🎯 Launch Token"}
              </button>
            ) : (
              <button
                type="button"
                className="btn main-btn"
                onClick={() => setWalletModalVisible(true)}
              >
                🔗 Connect Wallet
              </button>
            )}
            
            <div className="cost-estimator">
              {costLoading ? (
                <span>💰 Estimating cost...</span>
              ) : costError ? (
                <span className="input-error">{costError}</span>
              ) : (
                <>
                  <span>💎 Estimated Cost: </span>
                  <b>{totalCost ? totalCost.toFixed(4) : "-"} SOL</b>
                  <span className="cost-estimator-details">
                    {" "}
                    (rent, RPC, minting fees)
                  </span>
                </>
              )}
            </div>
          </form>
          
          <div
            className={`token-preview-card token-preview-below ${previewBgClass}`}
          >
            <div className="token-preview-image">
              {imagePreview ? (
                <img src={imagePreview} alt="Token" />
              ) : (
                <div className="token-preview-placeholder">
                  🪙
                </div>
              )}
            </div>
            <div className="token-preview-info">
              <div className="token-preview-name">{name || "Token Name"}</div>
              <div className="token-preview-symbol">{symbol || "SYMBOL"}</div>
              <div className="token-preview-supply">
                {supply ? Number(supply).toLocaleString() : "0"}
                <span className="token-preview-supply-label"> Supply</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="token-launchpad-sidepanels">
          <div className="sidepanel info-panel">
            <h3>🚀 Professional Token Launch</h3>
            <p>
              Launch your SPL token on Solana with enterprise-grade tools. 
              No coding required – just fill out the form and deploy instantly.
              <br />
              <br />
              ⚡ Deploy in under 5 minutes<br />
              💰 Affordable pricing<br />
              🔒 Secure & audited<br />
              🎨 Full customization
            </p>
          </div>
          <div className="sidepanel howto-panel">
            <h3>📋 How It Works</h3>
            <ol>
              <li>🏷️ Choose your token name and symbol</li>
              <li>🔢 Set decimals and total supply</li>
              <li>📝 Add description and upload image</li>
              <li>🔒 Configure security settings</li>
              <li>🔗 Add optional social links</li>
              <li>🚀 Connect wallet and launch!</li>
            </ol>
            <div className="cost-box">
              💎 Launch Cost: <b>~0.25 SOL</b><br />
              <small>Includes all blockchain fees</small>
            </div>
          </div>
          
          <div className="sidepanel">
            <h3>🏆 Why Choose Us?</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚡</span>
                <span>Instant deployment</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔒</span>
                <span>Security audited</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💰</span>
                <span>Lowest fees</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎨</span>
                <span>Professional design</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📞</span>
                <span>24/7 support</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="wall-of-tokens-section">
        <h2 className="wall-title">🏆 Recently Launched</h2>
        <div className="wall-of-tokens-grid">
          {wallOfTokens.map((token, idx) => (
            <div className="wall-token-card" key={idx}>
              <div className="wall-token-img">
                <img src={token.image} alt={token.name} />
              </div>
              <div className="wall-token-info">
                <div className="wall-token-name">{token.name}</div>
                <div className="wall-token-symbol">{token.symbol}</div>
                <div className="wall-token-supply">{token.supply} Supply</div>
                <a
                  href={`https://solscan.io/token/${token.mint}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="solscan-link"
                >
                  🔍 View Details
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Enhanced AnimatedTokenReveal component
function AnimatedTokenReveal({ image, name, symbol }) {
  const audioRef = useRef(null);
  
  useEffect(() => {
    // Play success sound
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore audio play errors (browser restrictions)
      });
    }
  }, []);
  
  return (
    <div className="animated-token-reveal">
      <div className="token-reveal-icon">
        <img src={image} alt="Token" />
        <div className="token-reveal-shine" />
      </div>
      <div style={{ 
        fontSize: '1.2rem', 
        fontWeight: '700', 
        marginBottom: '4px',
        background: 'var(--primary-gradient)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        {name || 'Your Token'}
      </div>
      <div style={{ 
        fontSize: '1rem', 
        color: 'var(--accent-purple)',
        fontWeight: '600'
      }}>
        ${symbol || 'SYMBOL'}
      </div>
      <audio
        ref={audioRef}
        src="https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c7.mp3"
        preload="auto"
      />
    </div>
  );
}
