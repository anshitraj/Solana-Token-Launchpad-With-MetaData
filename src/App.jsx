import "./App.css";
import { TokenLaunchpad } from "./components/TokenLaunchpad";
import { useState } from "react";

// wallet adapter imports
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

function App() {
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL;
  const [theme, setTheme] = useState("dark");
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return (
    <div className={theme + "-theme"} style={{ width: "100vw" }}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 20,
                alignItems: "center",
              }}
            >
              <WalletMultiButton />
              <WalletDisconnectButton />
              <label className="theme-switch">
                <input
                  type="checkbox"
                  checked={theme === "light"}
                  onChange={toggleTheme}
                  aria-label="Toggle dark/light mode"
                />
                <span className="slider">
                  <span className="icon moon">🌙</span>
                  <span className="icon sun">☀️</span>
                </span>
              </label>
            </div>
            <TokenLaunchpad></TokenLaunchpad>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  );
}

export default App;
